import { Injectable, NestMiddleware, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { RedisService } from '../../redis/redis.service';
import { RateLimitService } from '../services/rate-limit.service';

@Injectable()
export class DdosProtectionMiddleware implements NestMiddleware {
  private readonly logger = new Logger(DdosProtectionMiddleware.name);
  private readonly WINDOW_MS = 60 * 1000; // 1 minute window
  private readonly MAX_REQUESTS_PER_WINDOW = 100; // Max requests per IP per window
  private readonly BLOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes block
  private readonly SLOW_DOS_THRESHOLD_MS = 1000; // 1 second threshold for slow requests
  private readonly SLOW_DOS_MAX_REQUESTS = 10; // Max slow requests before blocking

  constructor(
    private readonly redis: RedisService,
    private readonly rateLimitService: RateLimitService,
  ) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const ip = this.getClientIp(req);

    try {
      // Check if IP is already blocked
      if (await this.isIpBlocked(ip)) {
        this.logger.warn(`Blocked request from blacklisted IP: ${ip}`);
        return this.sendBlockedResponse(res, ip);
      }

      // Check rate limiting
      const rateLimitKey = `ddos:rate_limit:${ip}`;
      const now = Date.now();
      const windowStart = now - this.WINDOW_MS;

      // Get request count in current window
      const requestCount = await this.redis.zcount(
        rateLimitKey,
        windowStart,
        now,
      );

      // Check if we should block this IP
      if (requestCount >= this.MAX_REQUESTS_PER_WINDOW) {
        await this.blockIp(ip);
        this.logger.warn(`Rate limit exceeded, blocking IP: ${ip}`);
        return this.sendBlockedResponse(res, ip);
      }

      // Add current request to the sorted set
      const member = `${now}-${Math.random().toString(36).substr(2, 9)}`;
      await this.redis.zadd(rateLimitKey, now, member);

      // Set expiration on the key
      await this.redis.expire(
        rateLimitKey,
        Math.ceil(this.WINDOW_MS / 1000) + 10,
      );

      // Check for slow request patterns (Slowloris protection)
      const slowRequestKey = `ddos:slow_requests:${ip}`;
      const slowRequestCount = await this.redis.incr(slowRequestKey);

      if (slowRequestCount === 1) {
        await this.redis.expire(slowRequestKey, 60); // Reset counter after 60 seconds
      }

      if (slowRequestCount > this.SLOW_DOS_MAX_REQUESTS) {
        await this.blockIp(ip);
        this.logger.warn(`Slow request attack detected, blocking IP: ${ip}`);
        return this.sendBlockedResponse(res, ip);
      }

      // Check for suspicious headers
      if (this.hasSuspiciousHeaders(req)) {
        this.logger.warn(`Suspicious headers from IP: ${ip}`, req.headers);
        await this.rateLimitService.blockIp(ip, 3600); // Block for 1 hour
        return this.sendBlockedResponse(res, ip);
      }

      // If we get here, the request is allowed
      next();
    } catch (error) {
      this.logger.error(
        `Error in DDoS protection middleware: ${error.message}`,
        error.stack,
      );
      // Fail open - allow the request through if there's an error
      next();
    }
  }

  private getClientIp(req: Request): string {
    // Check for Cloudflare headers first
    const cfConnectingIp = req.headers['cf-connecting-ip'];
    if (cfConnectingIp && typeof cfConnectingIp === 'string') {
      return cfConnectingIp;
    }

    // Check for X-Forwarded-For header
    const xForwardedFor = req.headers['x-forwarded-for'];
    if (xForwardedFor) {
      if (Array.isArray(xForwardedFor)) {
        return xForwardedFor[0].split(',')[0].trim();
      }
      return xForwardedFor.split(',')[0].trim();
    }

    // Fall back to the connection remote address
    return req.socket.remoteAddress || 'unknown';
  }

  private async isIpBlocked(ip: string): Promise<boolean> {
    if (!ip || ip === 'unknown') return false;
    const isBlocked = await this.redis.get(`ddos:blocked:${ip}`);
    return isBlocked === '1';
  }

  private async blockIp(ip: string): Promise<void> {
    if (!ip || ip === 'unknown') return;

    await this.redis.setex(
      `ddos:blocked:${ip}`,
      Math.floor(this.BLOCK_DURATION_MS / 1000),
      '1',
    );

    // Also add to the rate limiter's block list
    await this.rateLimitService.blockIp(
      ip,
      Math.ceil(this.BLOCK_DURATION_MS / 1000),
    );
  }

  private hasSuspiciousHeaders(req: Request): boolean {
    const suspiciousHeaders = [
      'x-forwarded-for',
      'x-forwarded-host',
      'x-real-ip',
      'proxy-connection',
      'via',
      'x-wap-profile',
      'x-cache',
      'x-proxy',
      'proxy-',
      'cf-connecting-ip',
    ];

    // Check for suspicious headers
    for (const header of suspiciousHeaders) {
      if (
        req.headers[header] ||
        Object.keys(req.headers).some((h) => h.toLowerCase().includes(header))
      ) {
        return true;
      }
    }

    // Check for suspicious content types
    const contentType = req.headers['content-type'];
    if (contentType && typeof contentType === 'string') {
      const suspiciousContentTypes = [
        'application/x-www-form-urlencoded',
        'multipart/form-data',
        'text/plain',
      ];

      if (suspiciousContentTypes.some((t) => contentType.includes(t))) {
        // Check for suspicious content length
        const contentLength = parseInt(
          req.headers['content-length'] || '0',
          10,
        );
        if (contentLength > 1024 * 1024) {
          // 1MB
          return true;
        }
      }
    }

    return false;
  }

  private sendBlockedResponse(res: Response, ip: string): void {
    res.status(HttpStatus.TOO_MANY_REQUESTS).json({
      statusCode: HttpStatus.TOO_MANY_REQUESTS,
      message: 'Too many requests, please try again later.',
      error: 'Too Many Requests',
      ip,
      timestamp: new Date().toISOString(),
    });
  }
}
