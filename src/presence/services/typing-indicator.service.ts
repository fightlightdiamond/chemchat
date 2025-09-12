import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { RedisService } from '../../shared/redis/redis.service';

export interface TypingIndicator {
  userId: string;
  conversationId: string;
  startedAt: number;
  deviceId?: string | null;
  tenantId?: string;
}

export interface TypingBatch {
  conversationId: string;
  typingUsers: string[];
  stoppedUsers: string[];
  timestamp: number;
}

@Injectable()
export class TypingIndicatorService implements OnModuleInit {
  private readonly logger = new Logger(TypingIndicatorService.name);
  private readonly TYPING_PREFIX = 'typing:conversation';
  private readonly TYPING_CHANNEL = 'typing:updates';
  private readonly TYPING_TTL = 10; // 10 seconds
  private readonly BATCH_INTERVAL = 1000; // 1 second batching
  private readonly CLEANUP_INTERVAL = 30000; // 30 seconds

  private batchTimer?: NodeJS.Timeout;
  private cleanupTimer?: NodeJS.Timeout;
  private pendingUpdates = new Map<string, Set<string>>(); // conversationId -> Set of userIds
  private pendingStops = new Map<string, Set<string>>(); // conversationId -> Set of userIds

  constructor(private readonly redis: RedisService) {}

  async onModuleInit(): Promise<void> {
    // Subscribe to typing updates for cross-instance synchronization
    await this.redis.subscribe(this.TYPING_CHANNEL, (message) => {
      void this.handleTypingUpdate(message);
    });

    // Start batching and cleanup timers
    this.startBatchTimer();
    this.startCleanupTimer();
  }

  /**
   * Start typing indicator for user in conversation
   */
  async startTyping(
    userId: string,
    conversationId: string,
    deviceId?: string | null,
    tenantId?: string,
  ): Promise<void> {
    try {
      const indicator: TypingIndicator = {
        userId,
        conversationId,
        startedAt: Date.now(),
        deviceId,
        tenantId,
      };

      const key = `${this.TYPING_PREFIX}:${conversationId}`;

      await this.redis.exec(async (client) => {
        await client.hset(key, userId, JSON.stringify(indicator));
        await client.expire(key, this.TYPING_TTL);
      });

      // Add to pending batch updates
      if (!this.pendingUpdates.has(conversationId)) {
        this.pendingUpdates.set(conversationId, new Set());
      }
      this.pendingUpdates.get(conversationId)!.add(userId);

      // Remove from pending stops if exists
      if (this.pendingStops.has(conversationId)) {
        this.pendingStops.get(conversationId)!.delete(userId);
      }

      this.logger.debug(
        `User ${userId} started typing in conversation ${conversationId}`,
      );
    } catch (error) {
      this.logger.error('Error starting typing indicator:', error);
      throw error;
    }
  }

  /**
   * Stop typing indicator for user in conversation
   */
  async stopTyping(userId: string, conversationId: string): Promise<void> {
    try {
      const key = `${this.TYPING_PREFIX}:${conversationId}`;

      await this.redis.exec(async (client) => {
        await client.hdel(key, userId);

        // Check if conversation has any remaining typing users
        const remainingCount = await client.hlen(key);
        if (remainingCount === 0) {
          await client.del(key);
        }
      });

      // Add to pending batch stops
      if (!this.pendingStops.has(conversationId)) {
        this.pendingStops.set(conversationId, new Set());
      }
      this.pendingStops.get(conversationId)!.add(userId);

      // Remove from pending updates if exists
      if (this.pendingUpdates.has(conversationId)) {
        this.pendingUpdates.get(conversationId)!.delete(userId);
      }

      this.logger.debug(
        `User ${userId} stopped typing in conversation ${conversationId}`,
      );
    } catch (error) {
      this.logger.error('Error stopping typing indicator:', error);
    }
  }

  /**
   * Get all users currently typing in a conversation
   */
  async getTypingUsers(conversationId: string): Promise<TypingIndicator[]> {
    try {
      const key = `${this.TYPING_PREFIX}:${conversationId}`;

      return await this.redis.exec(async (client) => {
        const typingData = await client.hgetall(key);
        const indicators: TypingIndicator[] = [];
        const now = Date.now();
        const expiredUsers: string[] = [];

        for (const [userId, data] of Object.entries(typingData)) {
          try {
            const indicator = JSON.parse(data) as TypingIndicator;

            // Check if typing indicator is still valid
            if (now - indicator.startedAt <= this.TYPING_TTL * 1000) {
              indicators.push(indicator);
            } else {
              expiredUsers.push(userId);
            }
          } catch (parseError) {
            this.logger.warn(
              `Failed to parse typing indicator for user ${userId}:`,
              parseError,
            );
            expiredUsers.push(userId);
          }
        }

        // Clean up expired indicators
        if (expiredUsers.length > 0) {
          await client.hdel(key, ...expiredUsers);
        }

        return indicators;
      });
    } catch (error) {
      this.logger.error('Error getting typing users:', error);
      return [];
    }
  }

  /**
   * Check if user is typing in conversation
   */
  async isUserTyping(userId: string, conversationId: string): Promise<boolean> {
    try {
      const key = `${this.TYPING_PREFIX}:${conversationId}`;

      return await this.redis.exec(async (client) => {
        const data = await client.hget(key, userId);
        if (!data) return false;

        try {
          const indicator = JSON.parse(data) as TypingIndicator;
          const isValid =
            Date.now() - indicator.startedAt <= this.TYPING_TTL * 1000;

          if (!isValid) {
            await client.hdel(key, userId);
          }

          return isValid;
        } catch {
          await client.hdel(key, userId);
          return false;
        }
      });
    } catch (error) {
      this.logger.error('Error checking if user is typing:', error);
      return false;
    }
  }

  /**
   * Stop all typing indicators for user (on disconnect)
   */
  async stopAllTyping(userId: string): Promise<void> {
    try {
      const pattern = `${this.TYPING_PREFIX}:*`;

      await this.redis.exec(async (client) => {
        const keys = await client.keys(pattern);

        for (const key of keys) {
          const exists = await client.hexists(key, userId);
          if (exists) {
            await client.hdel(key, userId);

            // Extract conversation ID from key
            const conversationId = key.replace(`${this.TYPING_PREFIX}:`, '');

            // Add to pending stops
            if (!this.pendingStops.has(conversationId)) {
              this.pendingStops.set(conversationId, new Set());
            }
            this.pendingStops.get(conversationId)!.add(userId);
          }
        }
      });

      this.logger.debug(`Stopped all typing indicators for user ${userId}`);
    } catch (error) {
      this.logger.error('Error stopping all typing indicators:', error);
    }
  }

  /**
   * Get typing statistics
   */
  async getTypingStats(): Promise<{
    totalConversationsWithTyping: number;
    totalTypingUsers: number;
    conversationStats: Record<string, number>;
  }> {
    try {
      const pattern = `${this.TYPING_PREFIX}:*`;

      return await this.redis.exec(async (client) => {
        const keys = await client.keys(pattern);
        const stats = {
          totalConversationsWithTyping: 0,
          totalTypingUsers: 0,
          conversationStats: {} as Record<string, number>,
        };

        for (const key of keys) {
          const count = await client.hlen(key);
          if (count > 0) {
            const conversationId = key.replace(`${this.TYPING_PREFIX}:`, '');
            stats.conversationStats[conversationId] = count;
            stats.totalConversationsWithTyping++;
            stats.totalTypingUsers += count;
          }
        }

        return stats;
      });
    } catch (error) {
      this.logger.error('Error getting typing stats:', error);
      return {
        totalConversationsWithTyping: 0,
        totalTypingUsers: 0,
        conversationStats: {},
      };
    }
  }

  /**
   * Start batch timer for efficient broadcasting
   */
  private startBatchTimer(): void {
    this.batchTimer = setInterval(() => {
      void this.processBatchUpdates();
    }, this.BATCH_INTERVAL);
  }

  /**
   * Process batched typing updates
   */
  private async processBatchUpdates(): Promise<void> {
    try {
      const conversationIds = new Set([
        ...this.pendingUpdates.keys(),
        ...this.pendingStops.keys(),
      ]);

      for (const conversationId of conversationIds) {
        const typingUsers = Array.from(
          this.pendingUpdates.get(conversationId) || [],
        );
        const stoppedUsers = Array.from(
          this.pendingStops.get(conversationId) || [],
        );

        if (typingUsers.length > 0 || stoppedUsers.length > 0) {
          const batch: TypingBatch = {
            conversationId,
            typingUsers,
            stoppedUsers,
            timestamp: Date.now(),
          };

          await this.redis.publish(this.TYPING_CHANNEL, batch);
        }
      }

      // Clear pending updates
      this.pendingUpdates.clear();
      this.pendingStops.clear();
    } catch (error) {
      this.logger.error('Error processing batch updates:', error);
    }
  }

  /**
   * Handle incoming typing updates from other instances
   */
  private handleTypingUpdate(message: string): void {
    try {
      const batch = JSON.parse(message) as TypingBatch;

      this.logger.debug(
        `Received typing batch for conversation ${batch.conversationId}: ` +
          `${batch.typingUsers.length} started, ${batch.stoppedUsers.length} stopped`,
      );

      // Additional processing can be added here for cross-instance typing notifications
      // For example, broadcasting to WebSocket clients on this instance
    } catch (error) {
      this.logger.error('Error handling typing update:', error);
    }
  }

  /**
   * Start cleanup timer for expired typing indicators
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      void this.cleanupExpiredTyping();
    }, this.CLEANUP_INTERVAL);
  }

  /**
   * Cleanup expired typing indicators
   */
  private async cleanupExpiredTyping(): Promise<void> {
    try {
      const pattern = `${this.TYPING_PREFIX}:*`;

      await this.redis.exec(async (client) => {
        const keys = await client.keys(pattern);
        let totalCleaned = 0;

        for (const key of keys) {
          const typingData = await client.hgetall(key);
          const expiredUsers: string[] = [];
          const now = Date.now();

          for (const [userId, data] of Object.entries(typingData)) {
            try {
              const indicator = JSON.parse(data) as TypingIndicator;
              if (now - indicator.startedAt > this.TYPING_TTL * 1000) {
                expiredUsers.push(userId);
              }
            } catch {
              expiredUsers.push(userId);
            }
          }

          if (expiredUsers.length > 0) {
            await client.hdel(key, ...expiredUsers);
            totalCleaned += expiredUsers.length;

            // Check if conversation has any remaining typing users
            const remainingCount = await client.hlen(key);
            if (remainingCount === 0) {
              await client.del(key);
            }
          }
        }

        if (totalCleaned > 0) {
          this.logger.debug(
            `Cleaned up ${totalCleaned} expired typing indicators`,
          );
        }
      });
    } catch (error) {
      this.logger.error('Error cleaning up expired typing indicators:', error);
    }
  }

  /**
   * Cleanup on module destroy
   */
  async onModuleDestroy(): Promise<void> {
    if (this.batchTimer) {
      clearInterval(this.batchTimer);
    }

    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    await this.redis.unsubscribe(this.TYPING_CHANNEL);
  }
}
