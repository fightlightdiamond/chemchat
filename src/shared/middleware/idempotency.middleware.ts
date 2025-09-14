import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { RedisService } from '../redis/redis.service';

// Type alias for safe error handling
type SafeError = { stack?: string; message?: string };

// Type for cached response structure
interface CachedResponse {
  status: number;
  body: unknown;
  headers: Record<string, unknown>;
}

const IDEMPOTENCY_HEADER = 'Idempotency-Key';

@Injectable()
export class IdempotencyMiddleware implements NestMiddleware {
  private readonly logger = new Logger(IdempotencyMiddleware.name);
  private readonly PREFIX = 'idempotency:';
  private readonly TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

  constructor(private readonly redis: RedisService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    // Skip for GET/HEAD/OPTIONS requests
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      return next();
    }

    const idempotencyKey = req.header(IDEMPOTENCY_HEADER);

    // If no idempotency key, just continue
    if (!idempotencyKey) {
      return next();
    }

    const cacheKey = this.getCacheKey(req, idempotencyKey);

    try {
      // Try to get cached response
      const cachedResponse = await this.redis.exec((client) =>
        client.get(cacheKey),
      );

      if (cachedResponse) {
        const parsed = JSON.parse(cachedResponse) as CachedResponse;
        const { status, body, headers } = parsed;

        // Set response headers from cache
        if (headers) {
          Object.entries(headers).forEach(([key, value]) => {
            if (typeof value === 'string') {
              res.setHeader(key, value);
            }
          });
        }

        // Return cached response
        return res.status(status).json(body);
      }

      // No cached response, continue processing
      const originalJson = res.json;
      const chunks: any[] = [];
      let statusCode: number;

      // Override res.json to capture the response
      res.json = (body: unknown): Response => {
        statusCode = res.statusCode;
        chunks.push(body);
         
        return originalJson.call(res, body);
      };

      // Override res.end to cache the response
       
      const originalEnd = res.end.bind(res);
      res.end = (
        chunk?: unknown,
        encoding?: unknown,
        callback?: unknown,
      ): Response => {
        if (chunk) {
          chunks.push(chunk);
        }

         
        const responseBody = chunks.length === 1 ? chunks[0] : chunks;

        // Only cache successful responses
        if (statusCode && statusCode >= 200 && statusCode < 300) {
          void this.cacheResponse(
            cacheKey,
            statusCode,
            responseBody,
            res.getHeaders(),
          ).catch((err: unknown) => {
            this.logger.error('Failed to cache idempotency response', err);
          });
        }

         
        return originalEnd.call(res, chunk, encoding, callback);
      };

      next();
    } catch (error: unknown) {
      const safeError = error as SafeError;
      this.logger.error('Idempotency middleware error', safeError);
      this.logger.error('Idempotency middleware error', safeError.stack);
      next();
    }
  }

  private getCacheKey(req: Request, idempotencyKey: string): string {
    const { method, originalUrl } = req;
     
    const userId = (req as any).user?.id || 'anonymous';
    return `${this.PREFIX}${userId}:${method}:${originalUrl}:${idempotencyKey}`;
  }

  private async cacheResponse(
    key: string,
    status: number,
    body: unknown,
    headers: Record<string, unknown>,
  ): Promise<void> {
    try {
      // Filter out sensitive headers
      const { 'set-cookie': setCookie, ...safeHeaders } = headers;
      
      // Log if set-cookie was filtered for security audit
      if (setCookie) {
        this.logger.debug('Filtered set-cookie header from idempotency cache for security');
      }

      const responseData = {
        status,
        body,
        headers: safeHeaders,
        timestamp: Date.now(),
      };

      await this.redis.exec((client) =>
        client.set(key, JSON.stringify(responseData), 'PX', this.TTL_MS),
      );
    } catch (error) {
      this.logger.error('Failed to cache idempotency response', error);
      throw error;
    }
  }
}

// Helper function to apply the middleware
export function idempotencyMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
  redisService: RedisService,
): void {
  const middleware = new IdempotencyMiddleware(redisService);
  void middleware.use(req, res, next);
}
