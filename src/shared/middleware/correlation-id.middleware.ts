import { Injectable, NestMiddleware } from '@nestjs/common';
import { Response, NextFunction } from 'express';
import { RequestWithCorrelationId } from '../interfaces';
import { randomUUID } from 'crypto';

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: RequestWithCorrelationId, res: Response, next: NextFunction) {
    // Check for existing correlation ID in headers
    const correlationId =
      (req.headers['x-correlation-id'] as string) ||
      (req.headers['correlation-id'] as string) ||
      randomUUID();

    // Attach to request object
    req.correlationId = correlationId;

    // Add to response headers
    res.setHeader('x-correlation-id', correlationId);

    next();
  }
}
