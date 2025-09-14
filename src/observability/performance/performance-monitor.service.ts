import { Injectable, Logger } from '@nestjs/common';
import { MetricsService } from '../metrics/metrics.service';
import { TracingService } from '../tracing/tracing.service';

export interface MessageLatencyData {
  messageId: string;
  conversationId: string;
  tenantId: string;
  userId: string;
  sentAt: Date;
  processedAt?: Date;
  deliveredAt?: Date;
  conversationType: string;
}

export interface PerformanceMetrics {
  messageLatency: {
    p50: number;
    p95: number;
    p99: number;
    avg: number;
  };
  throughput: {
    messagesPerSecond: number;
    connectionsPerSecond: number;
    requestsPerSecond: number;
  };
  resourceUsage: {
    memoryUsage: number;
    cpuUsage: number;
    activeConnections: number;
  };
}

@Injectable()
export class PerformanceMonitorService {
  private readonly logger = new Logger(PerformanceMonitorService.name);
  private readonly latencyBuffer = new Map<string, MessageLatencyData>();
  private readonly performanceWindow = 60000; // 1 minute window
  private readonly maxBufferSize = 10000;

  constructor(
    private readonly metricsService: MetricsService,
    private readonly tracingService: TracingService
  ) {
    // Clean up old latency data every minute
    setInterval(() => this.cleanupLatencyBuffer(), this.performanceWindow);
  }

  /**
   * Record message sent timestamp
   */
  async recordMessageSent(data: Omit<MessageLatencyData, 'sentAt'>): Promise<void> {
    const messageData: MessageLatencyData = {
      ...data,
      sentAt: new Date(),
    };

    // Store in memory buffer
    this.latencyBuffer.set(data.messageId, messageData);

    // Note: Redis integration would be added here for cross-instance tracking
    // const key = `perf:message:${data.messageId}`;
    // await this.redisService.setex(key, 300, JSON.stringify(messageData));

    // Add tracing event
    // Create a span for message tracking
    const spanId = this.tracingService.createSpan(
      'message.sent',
      this.tracingService.createTracingContext('message.sent', this.tracingService.generateCorrelationId(), data.tenantId),
      {
        'message.id': data.messageId,
        'conversation.id': data.conversationId,
        'tenant.id': data.tenantId,
      }
    );
    this.tracingService.finishSpan(spanId, 'ok');
  }

  /**
   * Record message processing completion
   */
  async recordMessageProcessed(messageId: string): Promise<void> {
    const messageData = this.latencyBuffer.get(messageId);
    if (messageData) {
      messageData.processedAt = new Date();
      
      const processingLatency = messageData.processedAt.getTime() - messageData.sentAt.getTime();
      
      // Record metrics
      this.metricsService.recordMessage(
        'send',
        messageData.tenantId,
        processingLatency / 1000,
        'success'
      );

      // Add tracing event
      // Create a span for message processing tracking
      const spanId = this.tracingService.createSpan(
        'message.processed',
        this.tracingService.createTracingContext('message.processed', this.tracingService.generateCorrelationId()),
        {
          'message.id': messageId,
          'processing.latency_ms': processingLatency,
        }
      );
      this.tracingService.finishSpan(spanId, 'ok');
    }

    // Note: Redis integration would be added here for cross-instance tracking
    // const key = `perf:message:${messageId}`;
    // const redisData = await this.redisService.get(key);
    // if (redisData) {
    //   const data = JSON.parse(redisData);
    //   data.processedAt = new Date().toISOString();
    //   await this.redisService.setex(key, 300, JSON.stringify(data));
    // }
  }

  /**
   * Record message delivery to client
   */
  async recordMessageDelivered(messageId: string): Promise<void> {
    const messageData = this.latencyBuffer.get(messageId);
    if (messageData) {
      messageData.deliveredAt = new Date();
      
      const endToEndLatency = messageData.deliveredAt.getTime() - messageData.sentAt.getTime();
      
      // Record end-to-end latency metric
      this.metricsService.recordMessageLatency(
        messageData.tenantId,
        messageData.conversationType,
        endToEndLatency / 1000
      );

      // Add tracing event
      // Create a span for message delivery tracking
      const spanId = this.tracingService.createSpan(
        'message.delivered',
        this.tracingService.createTracingContext('message.delivered', this.tracingService.generateCorrelationId()),
        {
          'message.id': messageId,
          'end_to_end.latency_ms': endToEndLatency,
        }
      );
      this.tracingService.finishSpan(spanId, 'ok');

      this.logger.debug(
        `Message ${messageId} end-to-end latency: ${endToEndLatency}ms`,
        { tenantId: messageData.tenantId }
      );
    }

    // Note: Redis integration would be added here for cross-instance tracking
    // const key = `perf:message:${messageId}`;
    // const redisData = await this.redisService.get(key);
    // if (redisData) {
    //   const data = JSON.parse(redisData);
    //   data.deliveredAt = new Date().toISOString();
    //   await this.redisService.setex(key, 60, JSON.stringify(data));
    // }

    // Remove from memory buffer
    this.latencyBuffer.delete(messageId);
  }

  /**
   * Record WebSocket connection metrics
   */
  recordWebSocketConnection(tenantId: string, connected: boolean): void {
    this.metricsService.recordWebSocketConnection(tenantId, connected);
    
    // Create a span for WebSocket connection tracking
    const eventName = connected ? 'websocket.connected' : 'websocket.disconnected';
    const spanId = this.tracingService.createSpan(
      eventName,
      this.tracingService.createTracingContext(eventName, this.tracingService.generateCorrelationId(), tenantId),
      {
        'tenant.id': tenantId,
        'connection.status': connected ? 'connected' : 'disconnected',
        'timestamp': new Date().toISOString(),
      }
    );
    this.tracingService.finishSpan(spanId, 'ok');
  }

  /**
   * Record database operation performance
   */
  async recordDatabaseOperation<T>(
    operation: string,
    table: string,
    tenantId: string,
    fn: () => Promise<T>
  ): Promise<T> {
    const startTime = Date.now();
    
    try {
      const result = await this.tracingService.executeWithSpan(
        `DB ${operation} ${table}`,
        this.tracingService.createTracingContext(
          `database.${operation}`,
          this.tracingService.generateCorrelationId(),
          tenantId,
          undefined,
          { table, operation }
        ),
        async (spanId) => {
          this.tracingService.setAttribute(spanId, 'db.operation', operation);
          this.tracingService.setAttribute(spanId, 'db.table', table);
          return fn();
        }
      );

      const duration = (Date.now() - startTime) / 1000;
      this.metricsService.recordDatabaseOperation(operation, table, tenantId, duration, 'success');
      
      return result;
    } catch (error) {
      const duration = (Date.now() - startTime) / 1000;
      this.metricsService.recordDatabaseOperation(operation, table, tenantId, duration, 'error');
      this.metricsService.recordError('database', error instanceof Error ? error.name : 'UnknownError', tenantId);
      throw error;
    }
  }

  /**
   * Record Redis operation performance
   */
  async recordRedisOperation<T>(
    operation: string,
    tenantId: string,
    fn: () => Promise<T>
  ): Promise<T> {
    const startTime = Date.now();
    
    try {
      const result = await this.tracingService.executeWithSpan(
        `Redis ${operation}`,
        this.tracingService.createTracingContext(
          `redis.${operation}`,
          this.tracingService.generateCorrelationId(),
          tenantId,
          undefined,
          { operation }
        ),
        async (spanId) => {
          this.tracingService.setAttribute(spanId, 'redis.operation', operation);
          return fn();
        }
      );

      const duration = (Date.now() - startTime) / 1000;
      this.metricsService.recordRedisOperation(operation, tenantId, duration, 'success');
      
      return result;
    } catch (error) {
      const duration = (Date.now() - startTime) / 1000;
      this.metricsService.recordRedisOperation(operation, tenantId, duration, 'error');
      this.metricsService.recordError('redis', error instanceof Error ? error.name : 'UnknownError', tenantId);
      throw error;
    }
  }

  /**
   * Get current performance metrics
   */
  async getPerformanceMetrics(tenantId?: string): Promise<PerformanceMetrics> {
    const now = Date.now();
    const windowStart = now - this.performanceWindow;

    // Calculate message latency percentiles from buffer
    const recentMessages = Array.from(this.latencyBuffer.values())
      .filter(msg => {
        if (tenantId && msg.tenantId !== tenantId) return false;
        return msg.deliveredAt && msg.deliveredAt.getTime() > windowStart;
      })
      .map(msg => msg.deliveredAt!.getTime() - msg.sentAt.getTime())
      .sort((a, b) => a - b);

    const latencyMetrics = this.calculatePercentiles(recentMessages);

    // Get system metrics
    const memoryUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    // Get active connections from Redis
    const activeConnections = await this.getActiveConnectionsCount();

    return {
      messageLatency: {
        p50: latencyMetrics.p50 / 1000, // Convert to seconds
        p95: latencyMetrics.p95 / 1000,
        p99: latencyMetrics.p99 / 1000,
        avg: latencyMetrics.avg / 1000,
      },
      throughput: {
        messagesPerSecond: recentMessages.length / (this.performanceWindow / 1000),
        connectionsPerSecond: 0, // Would need to track connection events
        requestsPerSecond: 0, // Would need to track from HTTP metrics
      },
      resourceUsage: {
        memoryUsage: memoryUsage.heapUsed / 1024 / 1024, // MB
        cpuUsage: (cpuUsage.user + cpuUsage.system) / 1000000, // Convert to seconds
        activeConnections,
      },
    };
  }

  /**
   * Update business metrics periodically
   */
  async updateBusinessMetrics(): Promise<void> {
    try {
      // This would typically query the database for current counts
      // For now, we'll use placeholder logic
      
      // Update active users (would need to implement actual tracking)
      this.metricsService.updateActiveUsers('default', '5m', 0);
      this.metricsService.updateActiveUsers('default', '1h', 0);
      this.metricsService.updateActiveUsers('default', '24h', 0);

      // Update conversations count (would query database)
      this.metricsService.updateConversationsCount('default', 'direct', 0);
      this.metricsService.updateConversationsCount('default', 'group', 0);

      // Update quota usage (would query tenant usage)
      this.metricsService.updateQuotaUsage('default', 'messages', 0.5);
      this.metricsService.updateQuotaUsage('default', 'storage', 0.3);

    } catch (error) {
      this.logger.error('Failed to update business metrics', error);
      this.metricsService.recordError('performance-monitor', 'business-metrics-update', 'system');
    }
  }

  private calculatePercentiles(values: number[]): { p50: number; p95: number; p99: number; avg: number } {
    if (values.length === 0) {
      return { p50: 0, p95: 0, p99: 0, avg: 0 };
    }

    const sum = values.reduce((a, b) => a + b, 0);
    const avg = sum / values.length;

    const p50Index = Math.floor(values.length * 0.5);
    const p95Index = Math.floor(values.length * 0.95);
    const p99Index = Math.floor(values.length * 0.99);

    return {
      p50: values[p50Index] || 0,
      p95: values[p95Index] || 0,
      p99: values[p99Index] || 0,
      avg,
    };
  }

  private async getActiveConnectionsCount(): Promise<number> {
    try {
      // This would query Redis for active WebSocket connections
      // For now, return a placeholder
      return 0;
    } catch (error) {
      this.logger.error('Failed to get active connections count', error);
      return 0;
    }
  }

  private cleanupLatencyBuffer(): void {
    const now = Date.now();
    const cutoff = now - (this.performanceWindow * 2); // Keep data for 2 windows

    let cleaned = 0;
    for (const [messageId, data] of this.latencyBuffer.entries()) {
      if (data.sentAt.getTime() < cutoff) {
        this.latencyBuffer.delete(messageId);
        cleaned++;
      }
    }

    // If buffer is still too large, remove oldest entries
    if (this.latencyBuffer.size > this.maxBufferSize) {
      const entries = Array.from(this.latencyBuffer.entries())
        .sort(([, a], [, b]) => a.sentAt.getTime() - b.sentAt.getTime());
      
      const toRemove = entries.slice(0, this.latencyBuffer.size - this.maxBufferSize);
      toRemove.forEach(([messageId]) => this.latencyBuffer.delete(messageId));
      cleaned += toRemove.length;
    }

    if (cleaned > 0) {
      this.logger.debug(`Cleaned up ${cleaned} old latency records`);
    }
  }
}
