import { Injectable, NestMiddleware, HttpException, HttpStatus } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { TenantRequest } from '../interfaces/tenant.interface';
import { QuotaTrackingService, QuotaType } from '../services/quota-tracking.service';
import { Logger } from '@nestjs/common';

@Injectable()
export class TenantRateLimitMiddleware implements NestMiddleware {
  private readonly logger = new Logger(TenantRateLimitMiddleware.name);

  constructor(private readonly quotaTrackingService: QuotaTrackingService) {}

  async use(req: TenantRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantId = req.tenantId;
      
      if (!tenantId) {
        // If no tenant context, skip rate limiting
        return next();
      }

      // Check API request quota
      const quotaCheck = await this.quotaTrackingService.checkQuota(
        tenantId,
        QuotaType.API_REQUESTS,
        1
      );

      if (!quotaCheck.allowed) {
        this.logger.warn(`API rate limit exceeded for tenant: ${tenantId}`);
        
        // Set rate limit headers
        res.set({
          'X-RateLimit-Limit': quotaCheck.limit?.toString() || '0',
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': quotaCheck.resetTime?.getTime().toString() || '0',
          'Retry-After': this.getRetryAfterSeconds(quotaCheck.resetTime).toString(),
        });

        throw new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            message: 'API rate limit exceeded',
            error: 'Too Many Requests',
            details: {
              reason: quotaCheck.reason,
              limit: quotaCheck.limit,
              resetTime: quotaCheck.resetTime,
            },
          },
          HttpStatus.TOO_MANY_REQUESTS
        );
      }

      // Increment API request counter
      await this.quotaTrackingService.incrementQuota({
        tenantId,
        type: QuotaType.API_REQUESTS,
        amount: 1,
      });

      // Set rate limit headers for successful requests
      const remaining = quotaCheck.limit ? quotaCheck.limit - (quotaCheck.currentUsage || 0) - 1 : 0;
      res.set({
        'X-RateLimit-Limit': quotaCheck.limit?.toString() || '0',
        'X-RateLimit-Remaining': Math.max(0, remaining).toString(),
        'X-RateLimit-Reset': quotaCheck.resetTime?.getTime().toString() || '0',
      });

      next();
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      
      this.logger.error(`Rate limit middleware error: ${error.message}`, error.stack);
      next(error);
    }
  }

  private getRetryAfterSeconds(resetTime?: Date): number {
    if (!resetTime) {
      return 3600; // Default to 1 hour
    }
    
    const now = new Date();
    const diffMs = resetTime.getTime() - now.getTime();
    return Math.max(1, Math.ceil(diffMs / 1000));
  }
}
