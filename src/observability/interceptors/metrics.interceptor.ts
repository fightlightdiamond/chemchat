import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { Request, Response } from 'express';
import { MetricsService } from '../metrics/metrics.service';

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  private readonly logger = new Logger(MetricsInterceptor.name);

  constructor(private readonly metricsService: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const contextType = context.getType();
    const startTime = Date.now();

    if (contextType === 'http') {
      return this.handleHttpRequest(context, next, startTime);
    } else if (contextType === 'ws') {
      return this.handleWebSocketEvent(context, next, startTime);
    }

    // For other context types, just pass through
    return next.handle();
  }

  private handleHttpRequest(context: ExecutionContext, next: CallHandler, startTime: number): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();

    const method = request.method;
    const route = request.route?.path || request.url;
    const userAgent = request.headers['user-agent'] || 'unknown';
    const userId = (request as any).user?.id;
    const tenantId = (request as any).tenantId;

    return next.handle().pipe(
      tap(() => {
        const duration = (Date.now() - startTime) / 1000; // Convert to seconds
        const statusCode = response.statusCode;

        // Record HTTP request metrics
        this.metricsService.recordHttpRequest(method, route, statusCode, duration, tenantId);

        // Log successful request
        this.logger.debug(`HTTP ${method} ${route} - ${statusCode} (${duration * 1000}ms)`, {
          method,
          route,
          statusCode,
          duration: duration * 1000,
          userAgent,
          userId,
          tenantId,
        });
      }),
      catchError(error => {
        const duration = (Date.now() - startTime) / 1000; // Convert to seconds
        const statusCode = error.status || 500;

        // Record HTTP request metrics
        this.metricsService.recordHttpRequest(method, route, statusCode, duration, tenantId);
        
        // Record error
        this.metricsService.recordError('http', error.name || 'UnknownError', tenantId);

        // Log error
        this.logger.error(`HTTP ${method} ${route} - ${statusCode} (${duration}ms)`, {
          method,
          route,
          statusCode,
          duration,
          error: error.message,
          userAgent,
          userId,
          tenantId,
        });

        throw error;
      })
    );
  }

  private handleWebSocketEvent(context: ExecutionContext, next: CallHandler, startTime: number): Observable<any> {
    const wsContext = context.switchToWs();
    const client = wsContext.getClient();
    const data = wsContext.getData();

    const eventType = data?.type || 'unknown';
    const userId = client.user?.id || client.userId;
    const tenantId = client.tenant?.id || client.tenantId;
    const roomId = data?.roomId;

    return next.handle().pipe(
      tap(() => {
        const duration = (Date.now() - startTime) / 1000; // Convert to seconds

        // Record WebSocket event metrics
        this.metricsService.recordWebSocketEvent(eventType, tenantId, duration, 'success');

        // Log successful WebSocket event
        this.logger.debug(`WebSocket ${eventType} (${duration * 1000}ms)`, {
          eventType,
          duration: duration * 1000,
          userId,
          tenantId,
          roomId,
          clientId: client.id,
        });
      }),
      catchError(error => {
        const duration = (Date.now() - startTime) / 1000; // Convert to seconds

        // Record WebSocket error metrics
        this.metricsService.recordWebSocketEvent(eventType, tenantId, duration, 'error');
        this.metricsService.recordError('websocket', error.name || 'UnknownError', tenantId);

        // Log WebSocket error
        this.logger.error(`WebSocket ${eventType} error (${duration}ms)`, {
          eventType,
          duration,
          error: error.message,
          userId,
          tenantId,
          roomId,
          clientId: client.id,
        });

        throw error;
      })
    );
  }
}
