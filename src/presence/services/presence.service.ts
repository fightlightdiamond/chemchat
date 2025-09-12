import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { RedisService } from '../../shared/redis/redis.service';
import { PresenceStatusType } from '../../shared/domain/value-objects/presence-status.vo';

export interface UserPresence {
  userId: string;
  status: PresenceStatusType;
  lastSeen: number;
  deviceId?: string | null;
  tenantId?: string;
  metadata?: Record<string, unknown>;
}

export interface PresenceUpdate {
  userId: string;
  status: PresenceStatusType;
  timestamp: number;
  deviceId?: string | null;
  conversationIds?: string[];
}

@Injectable()
export class PresenceService implements OnModuleInit {
  private readonly logger = new Logger(PresenceService.name);
  private readonly PRESENCE_PREFIX = 'presence:user';
  private readonly PRESENCE_CHANNEL = 'presence:updates';
  private readonly HEARTBEAT_INTERVAL = 30000; // 30 seconds
  private readonly PRESENCE_TIMEOUT = 60000; // 1 minute
  private readonly CLEANUP_INTERVAL = 300000; // 5 minutes

  private heartbeatTimer?: NodeJS.Timeout;
  private cleanupTimer?: NodeJS.Timeout;

  constructor(private readonly redis: RedisService) {}

  async onModuleInit(): Promise<void> {
    // Subscribe to presence updates for cross-instance synchronization
    await this.redis.subscribe(this.PRESENCE_CHANNEL, (message) => {
      void this.handlePresenceUpdate(message);
    });

    // Start cleanup timer
    this.startCleanupTimer();
  }

  /**
   * Set user presence status
   */
  async setPresence(
    userId: string,
    status: PresenceStatusType,
    deviceId?: string | null,
    tenantId?: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    try {
      const presence: UserPresence = {
        userId,
        status,
        lastSeen: Date.now(),
        deviceId,
        tenantId,
        metadata,
      };

      const key = `${this.PRESENCE_PREFIX}:${userId}`;

      await this.redis.exec(async (client) => {
        await client.setex(
          key,
          Math.floor(this.PRESENCE_TIMEOUT / 1000),
          JSON.stringify(presence),
        );
      });

      // Publish presence update for cross-instance synchronization
      const update: PresenceUpdate = {
        userId,
        status,
        timestamp: presence.lastSeen,
        deviceId,
      };

      await this.redis.publish(this.PRESENCE_CHANNEL, update);

      this.logger.debug(`Set presence for user ${userId}: ${status}`);
    } catch (error) {
      this.logger.error('Error setting presence:', error);
      throw error;
    }
  }

  /**
   * Get user presence
   */
  async getPresence(userId: string): Promise<UserPresence | null> {
    try {
      const key = `${this.PRESENCE_PREFIX}:${userId}`;

      return await this.redis.exec(async (client) => {
        const data = await client.get(key);
        if (!data) return null;

        const presence = JSON.parse(data) as UserPresence;

        // Check if presence is still valid
        if (Date.now() - presence.lastSeen > this.PRESENCE_TIMEOUT) {
          await client.del(key);
          return null;
        }

        return presence;
      });
    } catch (error) {
      this.logger.error('Error getting presence:', error);
      return null;
    }
  }

  /**
   * Get multiple user presences
   */
  async getMultiplePresences(
    userIds: string[],
  ): Promise<Map<string, UserPresence>> {
    const presences = new Map<string, UserPresence>();

    try {
      const keys = userIds.map((userId) => `${this.PRESENCE_PREFIX}:${userId}`);

      await this.redis.exec(async (client) => {
        const results = await client.mget(...keys);

        for (let i = 0; i < results.length; i++) {
          const data = results[i];
          if (data) {
            try {
              const presence = JSON.parse(data) as UserPresence;

              // Check if presence is still valid
              if (Date.now() - presence.lastSeen <= this.PRESENCE_TIMEOUT) {
                presences.set(userIds[i], presence);
              } else {
                // Clean up expired presence
                await client.del(keys[i]);
              }
            } catch (error) {
              this.logger.warn(
                `Failed to parse presence for user ${userIds[i]}:`,
                error,
              );
            }
          }
        }
      });
    } catch (error) {
      this.logger.error('Error getting multiple presences:', error);
    }

    return presences;
  }

  /**
   * Update heartbeat for user
   */
  async updateHeartbeat(userId: string): Promise<void> {
    try {
      const presence = await this.getPresence(userId);
      if (presence) {
        presence.lastSeen = Date.now();

        const key = `${this.PRESENCE_PREFIX}:${userId}`;
        await this.redis.exec(async (client) => {
          await client.setex(
            key,
            Math.floor(this.PRESENCE_TIMEOUT / 1000),
            JSON.stringify(presence),
          );
        });
      }
    } catch (error) {
      this.logger.error('Error updating heartbeat:', error);
    }
  }

  /**
   * Set user as offline
   */
  async setOffline(userId: string): Promise<void> {
    try {
      const key = `${this.PRESENCE_PREFIX}:${userId}`;

      await this.redis.exec(async (client) => {
        await client.del(key);
      });

      // Publish offline status
      const update: PresenceUpdate = {
        userId,
        status: PresenceStatusType.OFFLINE,
        timestamp: Date.now(),
      };

      await this.redis.publish(this.PRESENCE_CHANNEL, update);

      this.logger.debug(`Set user ${userId} offline`);
    } catch (error) {
      this.logger.error('Error setting user offline:', error);
    }
  }

  /**
   * Get all online users
   */
  async getOnlineUsers(tenantId?: string): Promise<UserPresence[]> {
    try {
      const pattern = `${this.PRESENCE_PREFIX}:*`;

      return await this.redis.exec(async (client) => {
        const keys = await client.keys(pattern);
        if (keys.length === 0) return [];

        const results = await client.mget(...keys);
        const onlineUsers: UserPresence[] = [];

        for (let i = 0; i < results.length; i++) {
          const data = results[i];
          if (data) {
            try {
              const presence = JSON.parse(data) as UserPresence;

              // Filter by tenant if specified
              if (tenantId && presence.tenantId !== tenantId) {
                continue;
              }

              // Check if presence is still valid
              if (Date.now() - presence.lastSeen <= this.PRESENCE_TIMEOUT) {
                onlineUsers.push(presence);
              } else {
                // Clean up expired presence
                await client.del(keys[i]);
              }
            } catch (parseError) {
              this.logger.warn(`Failed to parse presence data:`, parseError);
            }
          }
        }

        return onlineUsers;
      });
    } catch (error) {
      this.logger.error('Error getting online users:', error);
      return [];
    }
  }

  /**
   * Get presence statistics
   */
  async getPresenceStats(tenantId?: string): Promise<{
    totalOnline: number;
    byStatus: Record<string, number>;
    byDevice: Record<string, number>;
  }> {
    try {
      const onlineUsers = await this.getOnlineUsers(tenantId);

      const stats = {
        totalOnline: onlineUsers.length,
        byStatus: {} as Record<string, number>,
        byDevice: {} as Record<string, number>,
      };

      for (const user of onlineUsers) {
        const status = user.status.toString();
        stats.byStatus[status] = (stats.byStatus[status] || 0) + 1;

        const device = user.deviceId || 'unknown';
        stats.byDevice[device] = (stats.byDevice[device] || 0) + 1;
      }

      return stats;
    } catch (error) {
      this.logger.error('Error getting presence stats:', error);
      return {
        totalOnline: 0,
        byStatus: {},
        byDevice: {},
      };
    }
  }

  /**
   * Handle incoming presence updates from other instances
   */
  private handlePresenceUpdate(message: string): void {
    try {
      const update = JSON.parse(message) as PresenceUpdate;
      this.logger.debug(
        `Received presence update: ${update.userId} -> ${update.status.toString()}`,
      );

      // Additional processing can be added here for presence change notifications
      // For example, notifying conversation members about status changes
    } catch (error) {
      this.logger.error('Error handling presence update:', error);
    }
  }

  /**
   * Start cleanup timer for expired presences
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      void this.cleanupExpiredPresences();
    }, this.CLEANUP_INTERVAL);
  }

  /**
   * Cleanup expired presence entries
   */
  private async cleanupExpiredPresences(): Promise<void> {
    try {
      const pattern = `${this.PRESENCE_PREFIX}:*`;

      await this.redis.exec(async (client) => {
        const keys = await client.keys(pattern);
        const expiredKeys: string[] = [];

        for (const key of keys) {
          const data = await client.get(key);
          if (data) {
            try {
              const presence = JSON.parse(data) as UserPresence;
              if (Date.now() - presence.lastSeen > this.PRESENCE_TIMEOUT) {
                expiredKeys.push(key);
              }
            } catch {
              // Invalid data, mark for deletion
              expiredKeys.push(key);
            }
          }
        }

        if (expiredKeys.length > 0) {
          await client.del(...expiredKeys);
          this.logger.debug(
            `Cleaned up ${expiredKeys.length} expired presence entries`,
          );
        }
      });
    } catch (error) {
      this.logger.error('Error cleaning up expired presences:', error);
    }
  }

  /**
   * Cleanup on module destroy
   */
  async onModuleDestroy(): Promise<void> {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }

    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    await this.redis.unsubscribe(this.PRESENCE_CHANNEL);
  }
}
