import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../shared/redis/redis.service';
import { 
  OfflineQueueItem, 
  PendingOperation, 
  QueuePriority, 
  QueueStatus,
  OperationType 
} from '../interfaces/sync.interfaces';

@Injectable()
export class OfflineQueueService {
  private readonly logger = new Logger(OfflineQueueService.name);
  private readonly QUEUE_TTL = 86400 * 3; // 3 days
  private readonly MAX_RETRY_ATTEMPTS = 5;
  private readonly RETRY_DELAYS = [1000, 2000, 5000, 10000, 30000]; // Exponential backoff

  constructor(
    private readonly redis: RedisService,
  ) {}

  async enqueueOperation(
    userId: string,
    tenantId: string,
    deviceId: string,
    operation: PendingOperation,
    priority: QueuePriority = QueuePriority.NORMAL,
  ): Promise<string> {
    const queueItem: OfflineQueueItem = {
      id: `${deviceId}_${operation.id}_${Date.now()}`,
      operation,
      priority,
      createdAt: new Date(),
      scheduledAt: new Date(),
      attempts: 0,
      status: QueueStatus.PENDING,
    };

    try {
      const queueKey = this.getQueueKey(tenantId, userId, deviceId);
      const itemKey = this.getItemKey(tenantId, userId, deviceId, queueItem.id);

      // Store the queue item
      await this.redis.setex(itemKey, this.QUEUE_TTL, JSON.stringify(queueItem));

      // Add to priority queue
      const score = this.calculatePriorityScore(priority, queueItem.scheduledAt);
      await this.redis.exec(async (client) => client.zadd(queueKey, score, queueItem.id));
      await this.redis.expire(queueKey, this.QUEUE_TTL);

      this.logger.debug(`Enqueued operation ${operation.id} with priority ${priority}`);
      return queueItem.id;

    } catch (error) {
      this.logger.error(`Failed to enqueue operation ${operation.id}:`, error);
      throw error;
    }
  }

  async dequeueOperation(
    userId: string,
    tenantId: string,
    deviceId: string,
  ): Promise<OfflineQueueItem | null> {
    try {
      const queueKey = this.getQueueKey(tenantId, userId, deviceId);

      // Get highest priority item
      const items = await this.redis.exec(async (client) => client.zrange(queueKey, 0, 0, 'WITHSCORES'));
      if (items.length === 0) {
        return null;
      }

      const itemId = items[0];
      const itemKey = this.getItemKey(tenantId, userId, deviceId, itemId);

      // Get item details
      const itemData = await this.redis.get(itemKey);
      if (!itemData) {
        // Clean up orphaned queue entry
        await this.redis.exec(async (client) => client.zrem(queueKey, itemId));
        return null;
      }

      const queueItem: OfflineQueueItem = JSON.parse(itemData);

      // Check if item is ready to be processed
      const now = new Date();
      if (new Date(queueItem.scheduledAt) > now) {
        return null; // Not ready yet
      }

      // Remove from queue and mark as processing
      await this.redis.exec(async (client) => client.zrem(queueKey, itemId));
      queueItem.status = QueueStatus.PROCESSING;
      queueItem.attempts++;

      await this.redis.setex(itemKey, this.QUEUE_TTL, JSON.stringify(queueItem));

      this.logger.debug(`Dequeued operation ${queueItem.operation.id}, attempt ${queueItem.attempts}`);
      return queueItem;

    } catch (error) {
      this.logger.error('Failed to dequeue operation:', error);
      return null;
    }
  }

  async markOperationCompleted(
    userId: string,
    tenantId: string,
    deviceId: string,
    queueItemId: string,
  ): Promise<void> {
    try {
      const itemKey = this.getItemKey(tenantId, userId, deviceId, queueItemId);
      const itemData = await this.redis.get(itemKey);

      if (itemData) {
        const queueItem: OfflineQueueItem = JSON.parse(itemData);
        queueItem.status = QueueStatus.COMPLETED;

        await this.redis.setex(itemKey, 3600, JSON.stringify(queueItem)); // Keep for 1 hour
        this.logger.debug(`Marked operation ${queueItem.operation.id} as completed`);
      }

    } catch (error) {
      this.logger.error(`Failed to mark operation as completed:`, error);
    }
  }

  async markOperationFailed(
    userId: string,
    tenantId: string,
    deviceId: string,
    queueItemId: string,
    error: string,
  ): Promise<void> {
    try {
      const itemKey = this.getItemKey(tenantId, userId, deviceId, queueItemId);
      const itemData = await this.redis.get(itemKey);

      if (!itemData) {
        return;
      }

      const queueItem: OfflineQueueItem = JSON.parse(itemData);
      queueItem.lastError = error;

      if (queueItem.attempts >= this.MAX_RETRY_ATTEMPTS) {
        // Max retries reached, mark as failed
        queueItem.status = QueueStatus.FAILED;
        await this.redis.setex(itemKey, 86400, JSON.stringify(queueItem)); // Keep for 24 hours
        this.logger.warn(`Operation ${queueItem.operation.id} failed after ${queueItem.attempts} attempts`);
      } else {
        // Schedule retry with exponential backoff
        const retryDelay = this.RETRY_DELAYS[Math.min(queueItem.attempts - 1, this.RETRY_DELAYS.length - 1)];
        queueItem.scheduledAt = new Date(Date.now() + retryDelay);
        queueItem.status = QueueStatus.PENDING;

        // Re-add to queue
        const queueKey = this.getQueueKey(tenantId, userId, deviceId);
        const score = this.calculatePriorityScore(queueItem.priority, queueItem.scheduledAt);
        
        await this.redis.exec(async (client) => client.zadd(queueKey, score, queueItemId));
        await this.redis.setex(itemKey, this.QUEUE_TTL, JSON.stringify(queueItem));

        this.logger.debug(`Scheduled retry for operation ${queueItem.operation.id} in ${retryDelay}ms`);
      }

    } catch (error) {
      this.logger.error(`Failed to mark operation as failed:`, error);
    }
  }

  async getQueueStatus(
    userId: string,
    tenantId: string,
    deviceId: string,
  ): Promise<{
    pending: number;
    processing: number;
    completed: number;
    failed: number;
  }> {
    try {
      const pattern = this.getItemKey(tenantId, userId, deviceId, '*');
      const keys = await this.redis.scanKeys(pattern);

      const status = {
        pending: 0,
        processing: 0,
        completed: 0,
        failed: 0,
      };

      for (const key of keys) {
        const itemData = await this.redis.get(key);
        if (itemData) {
          const queueItem: OfflineQueueItem = JSON.parse(itemData);
          switch (queueItem.status) {
            case QueueStatus.PENDING:
              status.pending++;
              break;
            case QueueStatus.PROCESSING:
              status.processing++;
              break;
            case QueueStatus.COMPLETED:
              status.completed++;
              break;
            case QueueStatus.FAILED:
              status.failed++;
              break;
          }
        }
      }

      return status;

    } catch (error) {
      this.logger.error('Failed to get queue status:', error);
      return { pending: 0, processing: 0, completed: 0, failed: 0 };
    }
  }

  async getFailedOperations(
    userId: string,
    tenantId: string,
    deviceId: string,
  ): Promise<OfflineQueueItem[]> {
    try {
      const pattern = this.getItemKey(tenantId, userId, deviceId, '*');
      const keys = await this.redis.scanKeys(pattern);
      const failedItems: OfflineQueueItem[] = [];

      for (const key of keys) {
        const itemData = await this.redis.get(key);
        if (itemData) {
          const queueItem: OfflineQueueItem = JSON.parse(itemData);
          if (queueItem.status === QueueStatus.FAILED) {
            // Convert date strings back to Date objects
            queueItem.createdAt = new Date(queueItem.createdAt);
            queueItem.scheduledAt = new Date(queueItem.scheduledAt);
            queueItem.operation.timestamp = new Date(queueItem.operation.timestamp);
            queueItem.operation.ttl = new Date(queueItem.operation.ttl);
            failedItems.push(queueItem);
          }
        }
      }

      return failedItems.sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

    } catch (error) {
      this.logger.error('Failed to get failed operations:', error);
      return [];
    }
  }

  async retryFailedOperation(
    userId: string,
    tenantId: string,
    deviceId: string,
    queueItemId: string,
  ): Promise<void> {
    try {
      const itemKey = this.getItemKey(tenantId, userId, deviceId, queueItemId);
      const itemData = await this.redis.get(itemKey);

      if (!itemData) {
        throw new Error('Queue item not found');
      }

      const queueItem: OfflineQueueItem = JSON.parse(itemData);
      
      if (queueItem.status !== QueueStatus.FAILED) {
        throw new Error('Operation is not in failed state');
      }

      // Reset for retry
      queueItem.status = QueueStatus.PENDING;
      queueItem.attempts = 0;
      queueItem.scheduledAt = new Date();
      queueItem.lastError = undefined;

      // Re-add to queue
      const queueKey = this.getQueueKey(tenantId, userId, deviceId);
      const score = this.calculatePriorityScore(queueItem.priority, queueItem.scheduledAt);
      
      await this.redis.exec(async (client) => client.zadd(queueKey, score, queueItemId));
      await this.redis.setex(itemKey, this.QUEUE_TTL, JSON.stringify(queueItem));

      this.logger.log(`Retrying failed operation ${queueItem.operation.id}`);

    } catch (error) {
      this.logger.error(`Failed to retry operation:`, error);
      throw error;
    }
  }

  async clearExpiredOperations(
    userId: string,
    tenantId: string,
    deviceId: string,
  ): Promise<number> {
    try {
      const pattern = this.getItemKey(tenantId, userId, deviceId, '*');
      const keys = await this.redis.scanKeys(pattern);
      let clearedCount = 0;
      const now = new Date();

      for (const key of keys) {
        const itemData = await this.redis.get(key);
        if (itemData) {
          const queueItem: OfflineQueueItem = JSON.parse(itemData);
          const operationTtl = new Date(queueItem.operation.ttl);

          if (operationTtl <= now) {
            await this.redis.del(key);
            
            // Also remove from queue if still there
            const queueKey = this.getQueueKey(tenantId, userId, deviceId);
            await this.redis.exec(async (client) => client.zrem(queueKey, queueItem.id));
            
            clearedCount++;
          }
        }
      }

      if (clearedCount > 0) {
        this.logger.log(`Cleared ${clearedCount} expired operations for device ${deviceId}`);
      }

      return clearedCount;

    } catch (error) {
      this.logger.error('Failed to clear expired operations:', error);
      return 0;
    }
  }

  async clearQueue(
    userId: string,
    tenantId: string,
  ): Promise<void> {
    try {
      // Clear all queues for the user across all devices
      const queuePattern = `offline:queue:${tenantId}:${userId}:*`;
      const itemPattern = `offline:item:${tenantId}:${userId}:*`;
      
      const queueKeys = await this.redis.scanKeys(queuePattern);
      const itemKeys = await this.redis.scanKeys(itemPattern);
      
      const allKeys = [...queueKeys, ...itemKeys];
      
      if (allKeys.length > 0) {
        await this.redis.exec(async (client) => {
          await client.del(...allKeys);
        });
      }

      this.logger.log(`Cleared offline queue for user ${userId} in tenant ${tenantId}`);

    } catch (error) {
      this.logger.error(`Failed to clear queue for ${userId}:`, error);
      throw error;
    }
  }

  async clearAllOperations(
    userId: string,
    tenantId: string,
    deviceId: string,
  ): Promise<void> {
    try {
      const queueKey = this.getQueueKey(tenantId, userId, deviceId);
      const pattern = this.getItemKey(tenantId, userId, deviceId, '*');
      
      // Get all queue item keys
      const keys = await this.redis.scanKeys(pattern);
      
      // Delete all items and queue
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
      await this.redis.del(queueKey);

      this.logger.log(`Cleared all operations for device ${deviceId}`);

    } catch (error) {
      this.logger.error('Failed to clear all operations:', error);
      throw error;
    }
  }

  private calculatePriorityScore(priority: QueuePriority, scheduledAt: Date): number {
    const baseScore = scheduledAt.getTime();
    
    switch (priority) {
      case QueuePriority.HIGH:
        return baseScore - 1000000; // Higher priority (lower score)
      case QueuePriority.NORMAL:
        return baseScore;
      case QueuePriority.LOW:
        return baseScore + 1000000; // Lower priority (higher score)
      default:
        return baseScore;
    }
  }

  private getQueueKey(tenantId: string, userId: string, deviceId: string): string {
    return `offline:queue:${tenantId}:${userId}:${deviceId}`;
  }

  private getItemKey(tenantId: string, userId: string, deviceId: string, itemId: string): string {
    return `offline:item:${tenantId}:${userId}:${deviceId}:${itemId}`;
  }

  async getOperationsByType(
    userId: string,
    tenantId: string,
    deviceId: string,
    operationType: OperationType,
  ): Promise<OfflineQueueItem[]> {
    try {
      const pattern = this.getItemKey(tenantId, userId, deviceId, '*');
      const keys = await this.redis.scanKeys(pattern);
      const operations: OfflineQueueItem[] = [];

      for (const key of keys) {
        const itemData = await this.redis.get(key);
        if (itemData) {
          const queueItem: OfflineQueueItem = JSON.parse(itemData);
          if (queueItem.operation.type === operationType) {
            // Convert date strings back to Date objects
            queueItem.createdAt = new Date(queueItem.createdAt);
            queueItem.scheduledAt = new Date(queueItem.scheduledAt);
            queueItem.operation.timestamp = new Date(queueItem.operation.timestamp);
            queueItem.operation.ttl = new Date(queueItem.operation.ttl);
            operations.push(queueItem);
          }
        }
      }

      return operations.sort((a, b) => 
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );

    } catch (error) {
      this.logger.error(`Failed to get operations by type ${operationType}:`, error);
      return [];
    }
  }
}
