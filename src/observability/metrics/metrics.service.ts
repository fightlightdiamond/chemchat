import { Injectable, Logger } from '@nestjs/common';
import { register, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';

@Injectable()
export class MetricsService {
  private readonly logger = new Logger(MetricsService.name);

  // HTTP Metrics
  public readonly httpRequestsTotal = new Counter({
    name: 'chemchat_http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'route', 'status_code', 'tenant_id'],
    registers: [register],
  });

  public readonly httpRequestDuration = new Histogram({
    name: 'chemchat_http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['method', 'route', 'status_code', 'tenant_id'],
    buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5],
    registers: [register],
  });

  // WebSocket Metrics
  public readonly websocketConnectionsTotal = new Gauge({
    name: 'chemchat_websocket_connections_total',
    help: 'Total number of active WebSocket connections',
    labelNames: ['tenant_id'],
    registers: [register],
  });

  public readonly websocketEventsTotal = new Counter({
    name: 'chemchat_websocket_events_total',
    help: 'Total number of WebSocket events processed',
    labelNames: ['event_type', 'tenant_id', 'status'],
    registers: [register],
  });

  public readonly websocketEventDuration = new Histogram({
    name: 'chemchat_websocket_event_duration_seconds',
    help: 'WebSocket event processing duration in seconds',
    labelNames: ['event_type', 'tenant_id'],
    buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2],
    registers: [register],
  });

  // Message Metrics
  public readonly messagesTotal = new Counter({
    name: 'chemchat_messages_total',
    help: 'Total number of messages processed',
    labelNames: ['operation', 'tenant_id', 'status'],
    registers: [register],
  });

  public readonly messageProcessingDuration = new Histogram({
    name: 'chemchat_message_processing_duration_seconds',
    help: 'Message processing duration in seconds',
    labelNames: ['operation', 'tenant_id'],
    buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
    registers: [register],
  });

  public readonly messageLatency = new Histogram({
    name: 'chemchat_message_latency_seconds',
    help: 'End-to-end message latency from send to delivery',
    labelNames: ['tenant_id', 'conversation_type'],
    buckets: [0.01, 0.05, 0.1, 0.2, 0.5, 1, 2, 5],
    registers: [register],
  });

  // Database Metrics
  public readonly databaseOperationsTotal = new Counter({
    name: 'chemchat_database_operations_total',
    help: 'Total number of database operations',
    labelNames: ['operation', 'table', 'tenant_id', 'status'],
    registers: [register],
  });

  public readonly databaseOperationDuration = new Histogram({
    name: 'chemchat_database_operation_duration_seconds',
    help: 'Database operation duration in seconds',
    labelNames: ['operation', 'table', 'tenant_id'],
    buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
    registers: [register],
  });

  // Redis Metrics
  public readonly redisOperationsTotal = new Counter({
    name: 'chemchat_redis_operations_total',
    help: 'Total number of Redis operations',
    labelNames: ['operation', 'tenant_id', 'status'],
    registers: [register],
  });

  public readonly redisOperationDuration = new Histogram({
    name: 'chemchat_redis_operation_duration_seconds',
    help: 'Redis operation duration in seconds',
    labelNames: ['operation', 'tenant_id'],
    buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5],
    registers: [register],
  });

  // Business Metrics
  public readonly activeUsersGauge = new Gauge({
    name: 'chemchat_active_users_total',
    help: 'Number of active users',
    labelNames: ['tenant_id', 'time_window'],
    registers: [register],
  });

  public readonly conversationsTotal = new Gauge({
    name: 'chemchat_conversations_total',
    help: 'Total number of conversations',
    labelNames: ['tenant_id', 'conversation_type'],
    registers: [register],
  });

  public readonly quotaUsageGauge = new Gauge({
    name: 'chemchat_quota_usage_ratio',
    help: 'Quota usage ratio (0-1)',
    labelNames: ['tenant_id', 'quota_type'],
    registers: [register],
  });

  // Error Metrics
  public readonly errorsTotal = new Counter({
    name: 'chemchat_errors_total',
    help: 'Total number of errors',
    labelNames: ['component', 'error_type', 'tenant_id'],
    registers: [register],
  });

  // Cache Metrics
  public readonly cacheOperationsTotal = new Counter({
    name: 'chemchat_cache_operations_total',
    help: 'Total number of cache operations',
    labelNames: ['operation', 'cache_type', 'tenant_id', 'result'],
    registers: [register],
  });

  constructor() {
    // Collect default Node.js metrics
    collectDefaultMetrics({ register });
    this.logger.log('Metrics service initialized with Prometheus registry');
  }

  /**
   * Record HTTP request metrics
   */
  recordHttpRequest(
    method: string,
    route: string,
    statusCode: number,
    duration: number,
    tenantId?: string
  ): void {
    const labels = {
      method,
      route,
      status_code: statusCode.toString(),
      tenant_id: tenantId || 'unknown',
    };

    this.httpRequestsTotal.inc(labels);
    this.httpRequestDuration.observe(labels, duration);
  }

  /**
   * Record WebSocket connection metrics
   */
  recordWebSocketConnection(tenantId: string, increment: boolean = true): void {
    if (increment) {
      this.websocketConnectionsTotal.inc({ tenant_id: tenantId });
    } else {
      this.websocketConnectionsTotal.dec({ tenant_id: tenantId });
    }
  }

  /**
   * Record WebSocket event metrics
   */
  recordWebSocketEvent(
    eventType: string,
    tenantId: string,
    duration: number,
    status: 'success' | 'error' = 'success'
  ): void {
    const labels = { event_type: eventType, tenant_id: tenantId };
    
    this.websocketEventsTotal.inc({ ...labels, status });
    this.websocketEventDuration.observe(labels, duration);
  }

  /**
   * Record message processing metrics
   */
  recordMessage(
    operation: 'send' | 'edit' | 'delete' | 'broadcast',
    tenantId: string,
    duration: number,
    status: 'success' | 'error' = 'success'
  ): void {
    const labels = { operation, tenant_id: tenantId };
    
    this.messagesTotal.inc({ ...labels, status });
    this.messageProcessingDuration.observe(labels, duration);
  }

  /**
   * Record end-to-end message latency
   */
  recordMessageLatency(
    tenantId: string,
    conversationType: string,
    latency: number
  ): void {
    this.messageLatency.observe({
      tenant_id: tenantId,
      conversation_type: conversationType,
    }, latency);
  }

  /**
   * Record database operation metrics
   */
  recordDatabaseOperation(
    operation: string,
    table: string,
    tenantId: string,
    duration: number,
    status: 'success' | 'error' = 'success'
  ): void {
    const labels = { operation, table, tenant_id: tenantId };
    
    this.databaseOperationsTotal.inc({ ...labels, status });
    this.databaseOperationDuration.observe(labels, duration);
  }

  /**
   * Record Redis operation metrics
   */
  recordRedisOperation(
    operation: string,
    tenantId: string,
    duration: number,
    status: 'success' | 'error' = 'success'
  ): void {
    const labels = { operation, tenant_id: tenantId };
    
    this.redisOperationsTotal.inc({ ...labels, status });
    this.redisOperationDuration.observe(labels, duration);
  }

  /**
   * Update active users gauge
   */
  updateActiveUsers(tenantId: string, timeWindow: string, count: number): void {
    this.activeUsersGauge.set({ tenant_id: tenantId, time_window: timeWindow }, count);
  }

  /**
   * Update conversations count
   */
  updateConversationsCount(tenantId: string, conversationType: string, count: number): void {
    this.conversationsTotal.set({
      tenant_id: tenantId,
      conversation_type: conversationType,
    }, count);
  }

  /**
   * Update quota usage
   */
  updateQuotaUsage(tenantId: string, quotaType: string, usageRatio: number): void {
    this.quotaUsageGauge.set({
      tenant_id: tenantId,
      quota_type: quotaType,
    }, Math.min(1, Math.max(0, usageRatio)));
  }

  /**
   * Record error
   */
  recordError(component: string, errorType: string, tenantId?: string): void {
    this.errorsTotal.inc({
      component,
      error_type: errorType,
      tenant_id: tenantId || 'unknown',
    });
  }

  /**
   * Record cache operation
   */
  recordCacheOperation(
    operation: 'get' | 'set' | 'del' | 'exists',
    cacheType: string,
    tenantId: string,
    result: 'hit' | 'miss' | 'success' | 'error'
  ): void {
    this.cacheOperationsTotal.inc({
      operation,
      cache_type: cacheType,
      tenant_id: tenantId,
      result,
    });
  }

  /**
   * Get metrics registry for /metrics endpoint
   */
  getRegistry() {
    return register;
  }

  /**
   * Get metrics as string
   */
  async getMetrics(): Promise<string> {
    return register.metrics();
  }

  /**
   * Clear all metrics (useful for testing)
   */
  clearMetrics(): void {
    register.clear();
  }
}
