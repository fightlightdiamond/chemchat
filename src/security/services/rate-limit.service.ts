import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';
import * as geoip from 'geoip-lite';

export interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum number of requests allowed in the window
  message?: string;
  statusCode?: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  reset: number; // Timestamp when the limit resets
  retryAfter?: number; // Seconds until the limit resets
}

@Injectable()
export class RateLimitService {
  private readonly logger = new Logger(RateLimitService.name);
  private readonly defaultConfig: RateLimitConfig = {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 100,
    message: 'Too many requests, please try again later.',
    statusCode: 429,
  };

  // Default rate limits
  private readonly defaultRateLimits = {
    // Global rate limits
    global: { windowMs: 60 * 1000, maxRequests: 1000 },

    // User-specific rate limits
    user: { windowMs: 60 * 1000, maxRequests: 300 },

    // Endpoint-specific rate limits
    endpoints: {
      'POST /auth/login': { windowMs: 15 * 60 * 1000, maxRequests: 5 },
      'POST /auth/register': { windowMs: 60 * 60 * 1000, maxRequests: 5 },
      'POST /auth/forgot-password': {
        windowMs: 60 * 60 * 1000,
        maxRequests: 3,
      },
      'POST /messages': { windowMs: 60 * 1000, maxRequests: 60 },
    },
  };

  // Geographic restrictions (ISO country codes)
  private readonly blockedCountries = new Set([
    'KP', // North Korea
    'SY', // Syria
    'IR', // Iran
    'CU', // Cuba
    'SD', // Sudan
  ]);

  // High-risk countries with stricter rate limits
  private readonly highRiskCountries = new Set([
    'CN', // China
    'RU', // Russia
    'BR', // Brazil
    'IN', // India
    'VN', // Vietnam
  ]);

  constructor(private readonly redis: RedisService) {}

  async checkRateLimit(
    key: string,
    config?: Partial<RateLimitConfig>,
  ): Promise<RateLimitResult> {
    const effectiveConfig = { ...this.defaultConfig, ...config };
    const now = Date.now();
    const windowStart = now - effectiveConfig.windowMs;

    // Get the current count for this key
    const redisKey = `rate_limit:${key}`;
    const count = await this.redis.zcount(redisKey, windowStart, now);

    // Check if the limit has been exceeded
    if (count >= effectiveConfig.maxRequests) {
      const oldest = await this.redis.zrange(redisKey, 0, 0, true);
      const resetTime =
        parseInt(oldest[1] || '0', 10) + effectiveConfig.windowMs;
      const retryAfter = Math.ceil((resetTime - now) / 1000);

      return {
        allowed: false,
        remaining: Math.max(0, effectiveConfig.maxRequests - count - 1),
        reset: resetTime,
        retryAfter,
      };
    }

    // Add the current request to the sorted set
    const member = `${now}-${Math.random().toString(36).substr(2, 9)}`;
    await this.redis.zadd(redisKey, now, member);

    // Set expiration on the key (slightly longer than the window)
    await this.redis.expire(
      redisKey,
      Math.ceil(effectiveConfig.windowMs / 1000) + 60,
    );

    return {
      allowed: true,
      remaining: Math.max(0, effectiveConfig.maxRequests - count - 1),
      reset: now + effectiveConfig.windowMs,
    };
  }

  async checkEndpointRateLimit(
    method: string,
    path: string,
    userId?: string,
    ipAddress?: string,
  ): Promise<RateLimitResult> {
    const endpointKey = `${method} ${path}`.toUpperCase();
    const endpointConfig = this.defaultRateLimits.endpoints[endpointKey] || {};

    // Check global rate limit first
    const globalLimit = await this.checkRateLimit(
      'global',
      this.defaultRateLimits.global,
    );
    if (!globalLimit.allowed) {
      return globalLimit;
    }

    // Check user-specific rate limit if user is authenticated
    if (userId) {
      const userLimit = await this.checkRateLimit(`user:${userId}`, {
        ...this.defaultRateLimits.user,
        ...endpointConfig,
      });
      if (!userLimit.allowed) {
        return userLimit;
      }
    }

    // Check IP-based rate limit
    if (ipAddress) {
      const ipLimit = await this.checkRateLimit(`ip:${ipAddress}`, {
        ...this.defaultRateLimits.user,
        maxRequests: this.defaultRateLimits.user.maxRequests * 5,
      });
      if (!ipLimit.allowed) {
        return ipLimit;
      }
    }

    return { allowed: true, remaining: 0, reset: 0 };
  }

  async checkGeographicAccess(
    ipAddress: string,
  ): Promise<{ allowed: boolean; country?: string; reason?: string }> {
    try {
      const geo = geoip.lookup(ipAddress);
      if (!geo) {
        return { allowed: true }; // Allow if we can't determine the location
      }

      // Check if the country is blocked
      if (this.blockedCountries.has(geo.country)) {
        return {
          allowed: false,
          country: geo.country,
          reason: 'access_from_country_blocked',
        };
      }

      // Apply stricter rate limits for high-risk countries
      if (this.highRiskCountries.has(geo.country)) {
        // We could apply different rate limits here if needed
        return { allowed: true, country: geo.country };
      }

      return { allowed: true, country: geo.country };
    } catch (error) {
      this.logger.error(
        `Error checking geographic access for IP ${ipAddress}:`,
        error,
      );
      return { allowed: true }; // Fail open in case of errors
    }
  }

  async isIpBlocked(ipAddress: string): Promise<boolean> {
    const result = await this.redis.get(`security:blocked_ips:${ipAddress}`);
    return result === 'true';
  }

  async blockIp(ipAddress: string, ttlSeconds: number = 3600): Promise<void> {
    await this.redis.setex(
      `security:blocked_ips:${ipAddress}`,
      ttlSeconds,
      'true',
    );
  }

  async unblockIp(ipAddress: string): Promise<void> {
    await this.redis.del(`security:blocked_ips:${ipAddress}`);
  }

  async getBlockedIps(): Promise<string[]> {
    const keys = await this.redis.keys('security:blocked_ips:*');
    return keys.map((key) => key.replace('security:blocked_ips:', ''));
  }

  // Clean up old rate limit data
  async cleanupOldData(): Promise<void> {
    const keys = await this.redis.keys('rate_limit:*');
    const now = Date.now();

    for (const key of keys) {
      // Remove entries older than 1 day (for rate limit windows up to 24 hours)
      await this.redis.zremrangebyscore(key, 0, now - 24 * 60 * 60 * 1000);

      // Delete the key if it's empty
      const count = await this.redis.zcard(key);
      if (count === 0) {
        await this.redis.del(key);
      }
    }
  }
}
