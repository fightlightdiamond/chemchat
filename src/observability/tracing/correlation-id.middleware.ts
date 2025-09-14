import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { TracingService } from './tracing.service';

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  private readonly logger = new Logger(CorrelationIdMiddleware.name);

  constructor(private readonly tracingService: TracingService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    // Extract or generate correlation ID
    const correlationId = this.extractOrGenerateCorrelationId(req.headers);
    
    // Add correlation ID to request
    (req as any).correlationId = correlationId;
    
    // Add correlation ID to response headers
    res.set('x-correlation-id', correlationId);

    // Create tracing context
    const tracingContext = this.tracingService.createTracingContext(
      `${req.method} ${req.originalUrl}`,
      correlationId,
      (req as any).tenantId,
      (req as any).user?.id,
      {
        userAgent: req.headers['user-agent'],
        remoteAddress: req.ip || req.connection.remoteAddress,
        method: req.method,
        url: req.originalUrl,
      }
    );

    // Create span for the request
    const spanId = this.tracingService.createSpan(
      `HTTP ${req.method} ${req.originalUrl}`,
      tracingContext,
      {
        'http.method': req.method,
        'http.url': req.originalUrl,
        'http.route': req.route?.path || req.originalUrl,
        'http.user_agent': req.headers['user-agent'] || 'unknown',
        'http.remote_addr': req.ip || req.connection.remoteAddress || 'unknown',
        'correlation.id': correlationId,
      }
    );

    // Store span ID in request for potential use by other middleware/controllers
    (req as any).spanId = spanId;

    // Log request with correlation ID
    this.logger.debug(`${req.method} ${req.originalUrl}`, {
      correlationId,
      userAgent: req.headers['user-agent'],
      remoteAddress: req.ip || req.connection.remoteAddress,
    });

    // Handle response completion
    res.on('finish', () => {
      try {
        this.tracingService.setAttribute(spanId, 'http.status_code', res.statusCode);
        this.tracingService.setAttribute(spanId, 'http.response.size', Number(res.get('content-length')) || 0);
        
        if (res.statusCode >= 400) {
          this.tracingService.finishSpan(spanId, 'error');
        } else {
          this.tracingService.finishSpan(spanId, 'ok');
        }
      } catch (error) {
        this.logger.error('Error finishing span:', error);
      }
    });

    next();
  }

  private extractOrGenerateCorrelationId(headers: any): string {
    return (
      headers['x-correlation-id'] ||
      headers['correlation-id'] ||
      headers['x-request-id'] ||
      headers['request-id'] ||
      uuidv4()
    );
  }
}
