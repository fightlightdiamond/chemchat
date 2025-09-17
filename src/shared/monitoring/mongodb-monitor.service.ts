import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MongoDBService } from '../infrastructure/mongodb/mongodb.service';
import { MessageMongoDBRepository } from '../domain/repositories/message-mongodb.repository';
import { MessageSyncRecoveryService } from '../sync/handlers/message-sync-mongodb.handler';

export interface MongoDBHealthStatus {
  status: 'healthy' | 'unhealthy' | 'degraded';
  responseTime: number;
  database: string;
  collections: number;
  dataSize: number;
  indexSize: number;
  connectionPool: {
    current: number;
    available: number;
    total: number;
  };
  lastChecked: Date;
  errors?: string[];
}

export interface MongoDBMetrics {
  messages: {
    total: number;
    byType: Array<{ type: string; count: number }>;
    byDay: Array<{ date: string; count: number }>;
    topSenders: Array<{ senderId: string; senderName: string; count: number }>;
  };
  sync: {
    totalErrors: number;
    pendingErrors: number;
    processedErrors: number;
    errorsByType: Array<{ eventType: string; count: number }>;
  };
  performance: {
    avgQueryTime: number;
    slowQueries: number;
    indexUsage: Array<{ index: string; usage: number }>;
  };
}

@Injectable()
export class MongoDBMonitorService {
  private readonly logger = new Logger(MongoDBMonitorService.name);
  private healthStatus: MongoDBHealthStatus | null = null;
  private metrics: MongoDBMetrics | null = null;

  constructor(
    private readonly mongoDB: MongoDBService,
    private readonly messageRepository: MessageMongoDBRepository,
    private readonly syncRecovery: MessageSyncRecoveryService,
  ) {}

  /**
   * Get current health status
   */
  async getHealthStatus(): Promise<MongoDBHealthStatus> {
    try {
      const startTime = Date.now();
      
      // Test basic connectivity
      await this.mongoDB.getDatabase().admin().ping();
      const responseTime = Date.now() - startTime;

      // Get database stats
      const dbStats = await this.mongoDB.getDatabaseStats();
      
      // Get connection pool info (if available)
      const connectionPool = await this.getConnectionPoolInfo();

      const healthStatus: MongoDBHealthStatus = {
        status: responseTime < 1000 ? 'healthy' : 'degraded',
        responseTime,
        database: this.mongoDB.getDatabase().databaseName,
        collections: dbStats.collections,
        dataSize: dbStats.dataSize,
        indexSize: dbStats.indexSize,
        connectionPool,
        lastChecked: new Date(),
      };

      this.healthStatus = healthStatus;
      return healthStatus;
    } catch (error) {
      const healthStatus: MongoDBHealthStatus = {
        status: 'unhealthy',
        responseTime: -1,
        database: 'unknown',
        collections: 0,
        dataSize: 0,
        indexSize: 0,
        connectionPool: { current: 0, available: 0, total: 0 },
        lastChecked: new Date(),
        errors: [error.message],
      };

      this.healthStatus = healthStatus;
      return healthStatus;
    }
  }

  /**
   * Get comprehensive metrics
   */
  async getMetrics(): Promise<MongoDBMetrics> {
    try {
      const [messageStats, syncStats, performanceStats] = await Promise.all([
        this.getMessageMetrics(),
        this.getSyncMetrics(),
        this.getPerformanceMetrics(),
      ]);

      const metrics: MongoDBMetrics = {
        messages: messageStats,
        sync: syncStats,
        performance: performanceStats,
      };

      this.metrics = metrics;
      return metrics;
    } catch (error) {
      this.logger.error('Failed to get MongoDB metrics', error);
      throw error;
    }
  }

  /**
   * Get message-related metrics
   */
  private async getMessageMetrics(): Promise<MongoDBMetrics['messages']> {
    try {
      const stats = await this.messageRepository.getStatistics();
      
      return {
        total: stats.totalMessages,
        byType: stats.messagesByType,
        byDay: stats.messagesByDay,
        topSenders: stats.topSenders,
      };
    } catch (error) {
      this.logger.error('Failed to get message metrics', error);
      return {
        total: 0,
        byType: [],
        byDay: [],
        topSenders: [],
      };
    }
  }

  /**
   * Get sync-related metrics
   */
  private async getSyncMetrics(): Promise<MongoDBMetrics['sync']> {
    try {
      const stats = await this.syncRecovery.getSyncStatistics();
      
      return {
        totalErrors: stats.totalErrors,
        pendingErrors: stats.pendingErrors,
        processedErrors: stats.processedErrors,
        errorsByType: stats.errorsByType,
      };
    } catch (error) {
      this.logger.error('Failed to get sync metrics', error);
      return {
        totalErrors: 0,
        pendingErrors: 0,
        processedErrors: 0,
        errorsByType: [],
      };
    }
  }

  /**
   * Get performance metrics
   */
  private async getPerformanceMetrics(): Promise<MongoDBMetrics['performance']> {
    try {
      // Get slow queries from profiling
      const slowQueries = await this.getSlowQueries();
      
      // Get index usage stats
      const indexUsage = await this.getIndexUsageStats();
      
      // Calculate average query time
      const avgQueryTime = slowQueries.length > 0 
        ? slowQueries.reduce((sum, query) => sum + (query.millis || 0), 0) / slowQueries.length
        : 0;

      return {
        avgQueryTime,
        slowQueries: slowQueries.length,
        indexUsage,
      };
    } catch (error) {
      this.logger.error('Failed to get performance metrics', error);
      return {
        avgQueryTime: 0,
        slowQueries: 0,
        indexUsage: [],
      };
    }
  }

  /**
   * Get connection pool information
   */
  private async getConnectionPoolInfo(): Promise<MongoDBHealthStatus['connectionPool']> {
    try {
      // This is a simplified version - in practice, you'd get this from the MongoDB driver
      const client = this.mongoDB.getClient();
      
      // Get server status
      const serverStatus = await this.mongoDB.getDatabase().admin().serverStatus();
      
      return {
        current: serverStatus.connections?.current || 0,
        available: serverStatus.connections?.available || 0,
        total: serverStatus.connections?.totalCreated || 0,
      };
    } catch (error) {
      this.logger.warn('Failed to get connection pool info', error);
      return { current: 0, available: 0, total: 0 };
    }
  }

  /**
   * Get slow queries from profiling
   */
  private async getSlowQueries(): Promise<any[]> {
    try {
      const collection = this.mongoDB.getCollection('system.profile');
      
      // Get recent slow queries (over 100ms)
      const slowQueries = await collection
        .find({ millis: { $gt: 100 } })
        .sort({ ts: -1 })
        .limit(10)
        .toArray();

      return slowQueries;
    } catch (error) {
      this.logger.warn('Failed to get slow queries', error);
      return [];
    }
  }

  /**
   * Get index usage statistics
   */
  private async getIndexUsageStats(): Promise<Array<{ index: string; usage: number }>> {
    try {
      const collection = this.mongoDB.getCollection('messages');
      const stats = await collection.stats();
      
      if (stats.indexSizes) {
        return Object.entries(stats.indexSizes).map(([index, size]) => ({
          index,
          usage: size as number,
        }));
      }
      
      return [];
    } catch (error) {
      this.logger.warn('Failed to get index usage stats', error);
      return [];
    }
  }

  /**
   * Check collection health
   */
  async checkCollectionHealth(collectionName: string): Promise<{
    exists: boolean;
    count: number;
    size: number;
    avgObjSize: number;
    indexCount: number;
    health: 'healthy' | 'unhealthy';
  }> {
    try {
      const exists = await this.mongoDB.collectionExists(collectionName);
      
      if (!exists) {
        return {
          exists: false,
          count: 0,
          size: 0,
          avgObjSize: 0,
          indexCount: 0,
          health: 'unhealthy',
        };
      }

      const stats = await this.mongoDB.getCollectionStats(collectionName);
      
      return {
        exists: true,
        count: stats.count,
        size: stats.size,
        avgObjSize: stats.avgObjSize,
        indexCount: Object.keys(stats.indexSizes || {}).length,
        health: stats.count > 0 ? 'healthy' : 'unhealthy',
      };
    } catch (error) {
      this.logger.error(`Failed to check collection health: ${collectionName}`, error);
      return {
        exists: false,
        count: 0,
        size: 0,
        avgObjSize: 0,
        indexCount: 0,
        health: 'unhealthy',
      };
    }
  }

  /**
   * Run health check every minute
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async runHealthCheck(): Promise<void> {
    try {
      const health = await this.getHealthStatus();
      
      if (health.status === 'unhealthy') {
        this.logger.error('MongoDB health check failed', health);
      } else if (health.status === 'degraded') {
        this.logger.warn('MongoDB health check degraded', health);
      } else {
        this.logger.debug('MongoDB health check passed', { responseTime: health.responseTime });
      }
    } catch (error) {
      this.logger.error('Health check failed', error);
    }
  }

  /**
   * Run metrics collection every 5 minutes
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async collectMetrics(): Promise<void> {
    try {
      const metrics = await this.getMetrics();
      
      // Log key metrics
      this.logger.log('MongoDB metrics collected', {
        totalMessages: metrics.messages.total,
        pendingSyncErrors: metrics.sync.pendingErrors,
        avgQueryTime: metrics.performance.avgQueryTime,
      });
    } catch (error) {
      this.logger.error('Metrics collection failed', error);
    }
  }

  /**
   * Process failed syncs every 10 minutes
   */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async processFailedSyncs(): Promise<void> {
    try {
      await this.syncRecovery.processFailedSyncs();
    } catch (error) {
      this.logger.error('Failed to process failed syncs', error);
    }
  }

  /**
   * Get current cached health status
   */
  getCachedHealthStatus(): MongoDBHealthStatus | null {
    return this.healthStatus;
  }

  /**
   * Get current cached metrics
   */
  getCachedMetrics(): MongoDBMetrics | null {
    return this.metrics;
  }

  /**
   * Force refresh of health status and metrics
   */
  async refresh(): Promise<{
    health: MongoDBHealthStatus;
    metrics: MongoDBMetrics;
  }> {
    const [health, metrics] = await Promise.all([
      this.getHealthStatus(),
      this.getMetrics(),
    ]);

    return { health, metrics };
  }
}