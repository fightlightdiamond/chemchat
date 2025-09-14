import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { TracingService } from './tracing.service';

@Injectable()
export class WebSocketTracingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(WebSocketTracingInterceptor.name);

  constructor(private readonly tracingService: TracingService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const wsContext = context.switchToWs();
    const client = wsContext.getClient();
    const data = wsContext.getData();
    const handler = context.getHandler();
    const className = context.getClass().name;
    const methodName = handler.name;

    // Extract correlation ID from client or data
    const correlationId = this.extractCorrelationId(client, data);
    
    // Extract user and tenant context
    const userId = client.user?.id || client.userId;
    const tenantId = client.tenant?.id || client.tenantId;

    const operationName = `websocket.${className}.${methodName}`;
    const tracingContext = this.tracingService.createTracingContext(
      operationName,
      correlationId,
      tenantId,
      userId,
      {
        eventType: data?.type || 'unknown',
        clientId: client.id,
        roomId: data?.roomId,
      }
    );

    const startTime = Date.now();
    const spanId = this.tracingService.createSpan(operationName, tracingContext, {
      'websocket.event_type': data?.type || 'unknown',
      'websocket.client_id': client.id || 'unknown',
      'websocket.room_id': data?.roomId || 'none',
      'websocket.handler': `${className}.${methodName}`,
      'user.id': userId || 'anonymous',
      'tenant.id': tenantId || 'unknown',
    });

    // Add data attributes (safely)
    if (data && typeof data === 'object') {
      Object.entries(data).forEach(([key, value]) => {
        if (key !== 'password' && key !== 'token' && key !== 'secret') {
          if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
            this.tracingService.setAttribute(spanId, `websocket.data.${key}`, value);
          } else if (value !== null && value !== undefined) {
            this.tracingService.setAttribute(spanId, `websocket.data.${key}`, JSON.stringify(value).substring(0, 100));
          }
        }
      });
    }

    return next.handle().pipe(
      tap(result => {
        const duration = Date.now() - startTime;
        
        // Add result information
        if (result !== null && result !== undefined) {
          this.tracingService.setAttribute(spanId, 'websocket.result_type', typeof result);
          if (typeof result === 'object' && result.constructor) {
            this.tracingService.setAttribute(spanId, 'websocket.result_constructor', result.constructor.name);
          }
        }

        this.tracingService.setAttribute(spanId, 'duration_ms', duration);
        this.tracingService.finishSpan(spanId, 'ok');

        this.logger.debug(`WebSocket operation completed: ${operationName} (${duration}ms)`, {
          correlationId,
          userId,
          tenantId,
          eventType: data?.type,
          duration,
        });
      }),
      catchError(error => {
        const duration = Date.now() - startTime;
        
        this.tracingService.recordException(spanId, error as Error);
        this.tracingService.setAttribute(spanId, 'duration_ms', duration);
        this.tracingService.finishSpan(spanId, 'error');
        
        this.logger.error(`WebSocket operation failed: ${operationName} (${duration}ms)`, {
          correlationId,
          error: error instanceof Error ? error.message : 'Unknown error',
          userId,
          tenantId,
          eventType: data?.type,
          duration,
        });

        throw error;
      })
    );
  }

  private extractCorrelationId(client: any, data: any): string {
    // Try to extract correlation ID from various sources
    const correlationId = 
      data?.correlationId ||
      data?.correlation_id ||
      client.handshake?.headers['x-correlation-id'] ||
      client.handshake?.headers['correlation-id'] ||
      client.correlationId;

    return correlationId || this.tracingService.generateCorrelationId();
  }
}
