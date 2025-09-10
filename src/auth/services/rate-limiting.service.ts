import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyGenerator?: (identifier: string) => string;
}

export interface RateLimitResult {
  allowed: boolean;
  remainingRequests: number;
  resetTime: number;
  retryAfter?: number;
}

@Injectable()
export class RateLimitingService {
  private readonly defaultConfig: RateLimitConfig;

  constructor(private readonly configService: ConfigService) {
    this.defaultConfig = {
      windowMs: this.configService.get<number>('RATE_LIMIT_WINDOW_MS', 60000), // 1 minute
      maxRequests: this.configService.get<number>(
        'RATE_LIMIT_MAX_REQUESTS',
        100,
      ),
    };
  }

  /**
   * Check if request is within rate limit using token bucket algorithm
   */
  checkRateLimit(
    identifier: string,
    config: Partial<RateLimitConfig> = {},
  ): RateLimitResult {
    const finalConfig = { ...this.defaultConfig, ...config };
    const key = finalConfig.keyGenerator
      ? finalConfig.keyGenerator(identifier)
      : identifier;

    const bucket = this.getOrCreateBucket(key, finalConfig);
    const now = Date.now();

    // Refill tokens based on time passed
    this.refillBucket(bucket, now, finalConfig);

    if (bucket.tokens > 0) {
      bucket.tokens--;
      bucket.lastRefill = now;

      return {
        allowed: true,
        remainingRequests: Math.floor(bucket.tokens),
        resetTime: bucket.resetTime,
      };
    }

    // Calculate retry after time
    const timeUntilRefill = finalConfig.windowMs - (now - bucket.lastRefill);

    return {
      allowed: false,
      remainingRequests: 0,
      resetTime: bucket.resetTime,
      retryAfter: Math.ceil(timeUntilRefill / 1000),
    };
  }

  /**
   * Rate limit for login attempts
   */
  checkLoginRateLimit(identifier: string): RateLimitResult {
    return this.checkRateLimit(identifier, {
      windowMs: this.configService.get<number>(
        'LOGIN_RATE_LIMIT_WINDOW_MS',
        300000,
      ), // 5 minutes
      maxRequests: this.configService.get<number>(
        'LOGIN_RATE_LIMIT_MAX_ATTEMPTS',
        5,
      ),
      keyGenerator: (id) => `login:${id}`,
    });
  }

  /**
   * Rate limit for password reset attempts
   */
  checkPasswordResetRateLimit(identifier: string): RateLimitResult {
    return this.checkRateLimit(identifier, {
      windowMs: this.configService.get<number>(
        'PASSWORD_RESET_RATE_LIMIT_WINDOW_MS',
        3600000,
      ), // 1 hour
      maxRequests: this.configService.get<number>(
        'PASSWORD_RESET_RATE_LIMIT_MAX_ATTEMPTS',
        3,
      ),
      keyGenerator: (id) => `password_reset:${id}`,
    });
  }

  /**
   * Rate limit for MFA attempts
   */
  checkMfaRateLimit(identifier: string): RateLimitResult {
    return this.checkRateLimit(identifier, {
      windowMs: this.configService.get<number>(
        'MFA_RATE_LIMIT_WINDOW_MS',
        300000,
      ), // 5 minutes
      maxRequests: this.configService.get<number>(
        'MFA_RATE_LIMIT_MAX_ATTEMPTS',
        10,
      ),
      keyGenerator: (id) => `mfa:${id}`,
    });
  }

  /**
   * Rate limit for API requests per user
   */
  checkApiRateLimit(userId: string): RateLimitResult {
    return this.checkRateLimit(userId, {
      windowMs: this.configService.get<number>(
        'API_RATE_LIMIT_WINDOW_MS',
        60000,
      ), // 1 minute
      maxRequests: this.configService.get<number>(
        'API_RATE_LIMIT_MAX_REQUESTS',
        1000,
      ),
      keyGenerator: (id) => `api:${id}`,
    });
  }

  /**
   * Rate limit for WebSocket connections per IP
   */
  checkWebSocketRateLimit(ipAddress: string): RateLimitResult {
    return this.checkRateLimit(ipAddress, {
      windowMs: this.configService.get<number>(
        'WS_RATE_LIMIT_WINDOW_MS',
        60000,
      ), // 1 minute
      maxRequests: this.configService.get<number>(
        'WS_RATE_LIMIT_MAX_CONNECTIONS',
        10,
      ),
      keyGenerator: (id) => `ws:${id}`,
    });
  }

  /**
   * Reset rate limit for identifier
   */
  resetRateLimit(
    identifier: string,
    config: Partial<RateLimitConfig> = {},
  ): void {
    const finalConfig = { ...this.defaultConfig, ...config };
    const key = finalConfig.keyGenerator
      ? finalConfig.keyGenerator(identifier)
      : identifier;

    this.buckets.delete(key);
  }

  /**
   * Get current rate limit status without consuming tokens
   */
  getRateLimitStatus(
    identifier: string,
    config: Partial<RateLimitConfig> = {},
  ): RateLimitResult {
    const finalConfig = { ...this.defaultConfig, ...config };
    const key = finalConfig.keyGenerator
      ? finalConfig.keyGenerator(identifier)
      : identifier;

    const bucket = this.getOrCreateBucket(key, finalConfig);
    const now = Date.now();

    // Refill tokens based on time passed (without consuming)
    this.refillBucket(bucket, now, finalConfig);

    return {
      allowed: bucket.tokens > 0,
      remainingRequests: Math.floor(bucket.tokens),
      resetTime: bucket.resetTime,
    };
  }

  /**
   * Clean up expired buckets
   */
  cleanup(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, bucket] of this.buckets.entries()) {
      if (now > bucket.resetTime + 60000) {
        // 1 minute grace period
        expiredKeys.push(key);
      }
    }

    expiredKeys.forEach((key) => this.buckets.delete(key));
  }

  private getOrCreateBucket(key: string, config: RateLimitConfig): TokenBucket {
    let bucket = this.buckets.get(key);

    if (!bucket) {
      const now = Date.now();
      bucket = {
        tokens: config.maxRequests,
        lastRefill: now,
        resetTime: now + config.windowMs,
        maxTokens: config.maxRequests,
        refillRate: config.maxRequests / config.windowMs, // tokens per ms
      };
      this.buckets.set(key, bucket);
    }

    return bucket;
  }

  private refillBucket(
    bucket: TokenBucket,
    now: number,
    config: RateLimitConfig,
  ): void {
    const timePassed = now - bucket.lastRefill;
    const tokensToAdd = timePassed * bucket.refillRate;

    bucket.tokens = Math.min(bucket.maxTokens, bucket.tokens + tokensToAdd);
    bucket.lastRefill = now;

    // Reset window if needed
    if (now >= bucket.resetTime) {
      bucket.resetTime = now + config.windowMs;
      bucket.tokens = bucket.maxTokens;
    }
  }

  // In-memory storage (use Redis in production)
  private readonly buckets = new Map<string, TokenBucket>();
}

interface TokenBucket {
  tokens: number;
  lastRefill: number;
  resetTime: number;
  maxTokens: number;
  refillRate: number; // tokens per millisecond
}
