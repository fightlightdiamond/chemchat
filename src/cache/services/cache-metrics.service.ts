import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface CacheMetrics {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  errors: number;
  totalOperations: number;
  hitRate: number;
  missRate: number;
  avgResponseTime: number;
}

export interface CacheOperationMetrics {
  operation: string;
  duration: number;
  success: boolean;
  namespace?: string;
  key?: string;
}

@Injectable()
export class CacheMetricsService {
  private readonly logger = new Logger(CacheMetricsService.name);
  private readonly metrics: Map<string, CacheMetrics> = new Map();
  private readonly operationHistory: CacheOperationMetrics[] = [];
  private readonly maxHistorySize: number;

  constructor(private configService: ConfigService) {
    this.maxHistorySize = this.configService.get('CACHE_METRICS_HISTORY_SIZE', 1000);
  }

  /**
   * Record cache hit
   */
  recordCacheHit(key: string, duration: number, namespace?: string): void {
    this.recordOperation({
      operation: 'hit',
      duration,
      success: true,
      namespace,
      key,
    });
  }

  /**
   * Record cache miss
   */
  recordCacheMiss(key: string, duration: number, namespace?: string): void {
    this.recordOperation({
      operation: 'miss',
      duration,
      success: true,
      namespace,
      key,
    });
  }

  /**
   * Record cache set
   */
  recordCacheSet(key: string, namespace?: string): void {
    this.recordOperation({
      operation: 'set',
      duration: 0,
      success: true,
      namespace,
      key,
    });
  }

  /**
   * Record cache delete
   */
  recordCacheDelete(key: string, namespace?: string): void {
    this.recordOperation({
      operation: 'delete',
      duration: 0,
      success: true,
      namespace,
      key,
    });
  }

  /**
   * Record cache error
   */
  recordCacheError(key: string, error: Error, namespace?: string): void {
    this.recordOperation({
      operation: 'error',
      duration: 0,
      success: false,
      namespace,
      key,
    });
  }

  /**
   * Record cache operation metrics
   */
  recordOperation(metrics: CacheOperationMetrics): void {
    const namespace = metrics.namespace || 'default';
    
    // Get or create metrics for namespace
    let namespaceMetrics = this.metrics.get(namespace);
    if (!namespaceMetrics) {
      namespaceMetrics = {
        hits: 0,
        misses: 0,
        sets: 0,
        deletes: 0,
        errors: 0,
        totalOperations: 0,
        hitRate: 0,
        missRate: 0,
        avgResponseTime: 0,
      };
      this.metrics.set(namespace, namespaceMetrics);
    }

    // Update metrics based on operation
    switch (metrics.operation) {
      case 'get':
        if (metrics.success) {
          namespaceMetrics.hits++;
        } else {
          namespaceMetrics.misses++;
        }
        break;
      case 'set':
        namespaceMetrics.sets++;
        break;
      case 'del':
        namespaceMetrics.deletes++;
        break;
    }

    if (!metrics.success) {
      namespaceMetrics.errors++;
    }

    namespaceMetrics.totalOperations++;

    // Calculate rates
    const totalGets = namespaceMetrics.hits + namespaceMetrics.misses;
    if (totalGets > 0) {
      namespaceMetrics.hitRate = namespaceMetrics.hits / totalGets;
      namespaceMetrics.missRate = namespaceMetrics.misses / totalGets;
    }

    // Update average response time
    this.updateAverageResponseTime(namespace, metrics.duration);

    // Add to operation history
    this.operationHistory.push(metrics);
    if (this.operationHistory.length > this.maxHistorySize) {
      this.operationHistory.shift();
    }
  }

  /**
   * Get metrics for a specific namespace
   */
  getMetrics(namespace: string = 'default'): CacheMetrics | undefined {
    return this.metrics.get(namespace);
  }

  /**
   * Get all metrics
   */
  getAllMetrics(): Map<string, CacheMetrics> {
    return new Map(this.metrics);
  }

  /**
   * Get aggregated metrics across all namespaces
   */
  getAggregatedMetrics(): CacheMetrics {
    const aggregated: CacheMetrics = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      errors: 0,
      totalOperations: 0,
      hitRate: 0,
      missRate: 0,
      avgResponseTime: 0,
    };

    let totalResponseTime = 0;
    let totalGets = 0;

    for (const metrics of this.metrics.values()) {
      aggregated.hits += metrics.hits;
      aggregated.misses += metrics.misses;
      aggregated.sets += metrics.sets;
      aggregated.deletes += metrics.deletes;
      aggregated.errors += metrics.errors;
      aggregated.totalOperations += metrics.totalOperations;
      totalResponseTime += metrics.avgResponseTime * metrics.totalOperations;
    }

    totalGets = aggregated.hits + aggregated.misses;
    if (totalGets > 0) {
      aggregated.hitRate = aggregated.hits / totalGets;
      aggregated.missRate = aggregated.misses / totalGets;
    }

    if (aggregated.totalOperations > 0) {
      aggregated.avgResponseTime = totalResponseTime / aggregated.totalOperations;
    }

    return aggregated;
  }

  /**
   * Get recent operation history
   */
  getOperationHistory(limit: number = 100): CacheOperationMetrics[] {
    return this.operationHistory.slice(-limit);
  }

  /**
   * Reset metrics for a namespace
   */
  resetMetrics(namespace: string = 'default'): void {
    this.metrics.delete(namespace);
    this.logger.log(`Reset metrics for namespace: ${namespace}`);
  }

  /**
   * Get statistics for all namespaces
   */
  getStats(): { [namespace: string]: CacheMetrics } {
    const stats: { [namespace: string]: CacheMetrics } = {};
    for (const [namespace, metrics] of this.metrics.entries()) {
      stats[namespace] = { ...metrics };
    }
    return stats;
  }

  /**
   * Reset all metrics
   */
  resetAllMetrics(): void {
    this.metrics.clear();
    this.operationHistory.length = 0;
    this.logger.log('Reset all cache metrics');
  }

  /**
   * Get performance statistics
   */
  getPerformanceStats(): {
    slowOperations: CacheOperationMetrics[];
    errorRate: number;
    averageHitRate: number;
    totalOperations: number;
  } {
    const slowThreshold = this.configService.get('CACHE_SLOW_OPERATION_THRESHOLD', 100); // ms
    
    const slowOperations = this.operationHistory.filter(
      op => op.duration > slowThreshold
    );

    const aggregated = this.getAggregatedMetrics();
    const errorRate = aggregated.totalOperations > 0 
      ? aggregated.errors / aggregated.totalOperations 
      : 0;

    return {
      slowOperations,
      errorRate,
      averageHitRate: aggregated.hitRate,
      totalOperations: aggregated.totalOperations,
    };
  }

  /**
   * Update average response time for namespace
   */
  private updateAverageResponseTime(namespace: string, duration: number): void {
    const metrics = this.metrics.get(namespace);
    if (!metrics) return;

    // Calculate running average
    const totalOps = metrics.totalOperations;
    if (totalOps === 1) {
      metrics.avgResponseTime = duration;
    } else {
      metrics.avgResponseTime = 
        ((metrics.avgResponseTime * (totalOps - 1)) + duration) / totalOps;
    }
  }

  /**
   * Log metrics summary
   */
  logMetricsSummary(): void {
    const aggregated = this.getAggregatedMetrics();
    this.logger.log(`Cache Metrics Summary:
      Total Operations: ${aggregated.totalOperations}
      Hit Rate: ${(aggregated.hitRate * 100).toFixed(2)}%
      Miss Rate: ${(aggregated.missRate * 100).toFixed(2)}%
      Error Rate: ${((aggregated.errors / aggregated.totalOperations) * 100).toFixed(2)}%
      Avg Response Time: ${aggregated.avgResponseTime.toFixed(2)}ms
    `);
  }
}
