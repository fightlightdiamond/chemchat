import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';

export interface TracingContext {
  correlationId: string;
  tenantId?: string;
  userId?: string;
  operationName: string;
  metadata?: Record<string, any>;
}

export interface SpanInfo {
  name: string;
  startTime: Date;
  endTime?: Date;
  attributes: Record<string, string | number | boolean>;
  events: Array<{ name: string; timestamp: Date; attributes?: Record<string, any> }>;
  status: 'ok' | 'error';
  error?: Error;
}

@Injectable()
export class TracingService {
  private readonly logger = new Logger(TracingService.name);
  private readonly activeSpans = new Map<string, SpanInfo>();

  /**
   * Create a new span with correlation ID and context
   */
  createSpan(
    name: string,
    tracingContext: TracingContext,
    attributes: Record<string, string | number | boolean> = {}
  ): string {
    const spanId = uuidv4();
    const span: SpanInfo = {
      name,
      startTime: new Date(),
      attributes: {
        'service.name': 'chemchat-api',
        'service.version': '1.0.0',
        'correlation.id': tracingContext.correlationId,
        'operation.name': tracingContext.operationName,
        ...(tracingContext.tenantId && { 'tenant.id': tracingContext.tenantId }),
        ...(tracingContext.userId && { 'user.id': tracingContext.userId }),
        ...attributes,
      },
      events: [],
      status: 'ok',
    };

    // Add metadata as span attributes
    if (tracingContext.metadata) {
      Object.entries(tracingContext.metadata).forEach(([key, value]) => {
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
          span.attributes[`metadata.${key}`] = value;
        } else {
          span.attributes[`metadata.${key}`] = JSON.stringify(value);
        }
      });
    }

    this.activeSpans.set(spanId, span);
    return spanId;
  }

  /**
   * Execute a function within a span context
   */
  async executeWithSpan<T>(
    name: string,
    tracingContext: TracingContext,
    fn: (spanId: string) => Promise<T>,
    attributes: Record<string, string | number | boolean> = {}
  ): Promise<T> {
    const spanId = this.createSpan(name, tracingContext, attributes);

    try {
      const result = await fn(spanId);
      this.finishSpan(spanId, 'ok');
      return result;
    } catch (error) {
      this.recordException(spanId, error as Error);
      this.finishSpan(spanId, 'error');
      throw error;
    }
  }

  /**
   * Add event to span
   */
  addEvent(spanId: string, name: string, attributes?: Record<string, any>): void {
    const span = this.activeSpans.get(spanId);
    if (span) {
      span.events.push({
        name,
        timestamp: new Date(),
        attributes,
      });
    }
  }

  /**
   * Set attribute on span
   */
  setAttribute(spanId: string, key: string, value: string | number | boolean): void {
    const span = this.activeSpans.get(spanId);
    if (span) {
      span.attributes[key] = value;
    }
  }

  /**
   * Record exception on span
   */
  recordException(spanId: string, error: Error): void {
    const span = this.activeSpans.get(spanId);
    if (span) {
      span.error = error;
      span.status = 'error';
      span.events.push({
        name: 'exception',
        timestamp: new Date(),
        attributes: {
          'exception.type': error.name,
          'exception.message': error.message,
          'exception.stacktrace': error.stack?.substring(0, 1000),
        },
      });
    }
  }

  /**
   * Finish span
   */
  finishSpan(spanId: string, status: 'ok' | 'error'): void {
    const span = this.activeSpans.get(spanId);
    if (span) {
      span.endTime = new Date();
      span.status = status;
      
      const duration = span.endTime.getTime() - span.startTime.getTime();
      this.logger.debug(
        `Span completed: ${span.name} - ${status} - ${duration}ms`,
        { spanId, correlationId: span.attributes['correlation.id'] }
      );
      
      // Clean up after some time
      setTimeout(() => this.activeSpans.delete(spanId), 60000);
    }
  }

  /**
   * Generate correlation ID for request tracing
   */
  generateCorrelationId(): string {
    return uuidv4();
  }

  /**
   * Extract correlation ID from headers or generate new one
   */
  extractOrGenerateCorrelationId(headers: Record<string, any>): string {
    return headers['x-correlation-id'] || headers['correlation-id'] || this.generateCorrelationId();
  }

  /**
   * Create tracing context from request
   */
  createTracingContext(
    operationName: string,
    correlationId: string,
    tenantId?: string,
    userId?: string,
    metadata?: Record<string, any>
  ): TracingContext {
    return {
      correlationId,
      tenantId,
      userId,
      operationName,
      metadata,
    };
  }

  /**
   * Get span information
   */
  getSpan(spanId: string): SpanInfo | undefined {
    return this.activeSpans.get(spanId);
  }

  /**
   * Get all active spans
   */
  getActiveSpans(): SpanInfo[] {
    return Array.from(this.activeSpans.values());
  }
}
