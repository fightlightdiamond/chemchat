import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../shared/redis/redis.service';

export interface ConnectionInfo {
  socketId: string;
  userId: string;
  tenantId?: string;
  deviceId?: string | null;
  connectedAt: Date;
  lastActivity: Date;
}

export interface UserConnection {
  socketId: string;
  tenantId?: string;
  deviceId?: string | null;
  connectedAt: number;
  lastSeen: number;
  latency?: number;
}

@Injectable()
export class ConnectionManagerService {
  private readonly logger = new Logger(ConnectionManagerService.name);
  private readonly CONNECTION_PREFIX = 'ws:connections';
  private readonly USER_SOCKETS_PREFIX = 'ws:user_sockets';
  private readonly USER_SOCKETS_KEY = 'ws:user_connections';
  private readonly CONNECTION_TTL = 86400; // 24 hours
  private readonly HEARTBEAT_TIMEOUT = 60000; // 1 minute

  constructor(private readonly redis: RedisService) {}

  /**
   * Add a new WebSocket connection
   */
  async addConnection(
    userId: string,
    socketId: string,
    tenantId?: string,
    deviceId?: string | null,
  ): Promise<void> {
    try {
      const connectionData: UserConnection = {
        socketId,
        tenantId,
        deviceId,
        connectedAt: Date.now(),
        lastSeen: Date.now(),
      };

      // Store connection info
      await this.redis.exec(async (client) => {
        await client.hset(
          this.USER_SOCKETS_KEY,
          userId,
          JSON.stringify(connectionData),
        );
      });

      // Add socket to user's socket set
      await this.redis.exec(async (client) => {
        await client.sadd(`${this.USER_SOCKETS_PREFIX}:${userId}`, socketId);
        await client.expire(
          `${this.USER_SOCKETS_PREFIX}:${userId}`,
          this.CONNECTION_TTL,
        );
      });

      this.logger.log(`Added connection: ${socketId} for user: ${userId}`);
    } catch (error) {
      this.logger.error('Error adding connection:', error);
      throw error;
    }
  }

  /**
   * Remove a WebSocket connection
   */
  async removeConnection(userId: string, socketId: string): Promise<void> {
    try {
      // Remove connection info
      await this.redis.exec(async (client) => {
        await client.hdel(this.USER_SOCKETS_KEY, userId);
      });

      // Remove socket from user's socket set
      await this.redis.exec(async (client) => {
        await client.srem(`${this.USER_SOCKETS_PREFIX}:${userId}`, socketId);
      });

      // Clean up empty user socket set
      const remainingSockets = await this.redis.exec(async (client) => {
        return await client.scard(`${this.USER_SOCKETS_PREFIX}:${userId}`);
      });

      if (remainingSockets === 0) {
        await this.redis.exec(async (client) => {
          await client.del(`${this.USER_SOCKETS_PREFIX}:${userId}`);
        });
      }

      this.logger.log(`Removed connection: ${socketId} for user: ${userId}`);
    } catch (error) {
      this.logger.error('Error removing connection:', error);
    }
  }

  /**
   * Get connection info by user ID
   */
  async getConnection(userId: string): Promise<UserConnection | null> {
    try {
      return await this.redis.exec(async (client) => {
        const data = await client.hget(this.USER_SOCKETS_KEY, userId);
        if (!data) return null;
        return JSON.parse(data) as UserConnection;
      });
    } catch (error) {
      this.logger.error('Error getting connection:', error);
      return null;
    }
  }

  /**
   * Get all connections
   */
  async getAllConnections(): Promise<
    Array<UserConnection & { userId: string }>
  > {
    try {
      return await this.redis.exec(async (client) => {
        const allData = await client.hgetall(this.USER_SOCKETS_KEY);
        return Object.entries(allData).map(([userId, data]) => {
          const connection = JSON.parse(data) as UserConnection;
          return { userId, ...connection };
        });
      });
    } catch (error) {
      this.logger.error('Error getting all connections:', error);
      return [];
    }
  }

  /**
   * Get connection count
   */
  async getConnectionCount(): Promise<number> {
    try {
      return await this.redis.exec(async (client) => {
        return await client.hlen(this.USER_SOCKETS_KEY);
      });
    } catch (error) {
      this.logger.error('Error getting connection count:', error);
      return 0;
    }
  }

  /**
   * Get online users by tenant
   */
  async getOnlineUsersByTenant(tenantId?: string): Promise<string[]> {
    try {
      return await this.redis.exec(async (client) => {
        const userIds = await client.hkeys(this.USER_SOCKETS_KEY);
        return userIds.filter((userId) =>
          tenantId ? userId.includes(tenantId) : true,
        );
      });
    } catch (error) {
      this.logger.error('Error getting online users by tenant:', error);
      return [];
    }
  }

  /**
   * Check if user is online (has active connections)
   */
  async isUserOnline(userId: string): Promise<boolean> {
    const connection = await this.getConnection(userId);
    if (!connection) return false;
    return Date.now() - connection.lastSeen < this.HEARTBEAT_TIMEOUT;
  }

  /**
   * Update heartbeat for a connection
   */
  async updateHeartbeat(userId: string): Promise<void> {
    const connection = await this.getConnection(userId);
    if (!connection) return;

    connection.lastSeen = Date.now();
    await this.redis.exec(async (client) => {
      await client.hset(
        this.USER_SOCKETS_KEY,
        userId,
        JSON.stringify(connection),
      );
    });
  }

  /**
   * Cleanup stale connections
   */
  async cleanupStaleConnections(): Promise<void> {
    try {
      await this.redis.exec(async (client) => {
        const staleUserIds = await client.hkeys(this.USER_SOCKETS_KEY);
        const staleConnections: string[] = [];

        for (const userId of staleUserIds) {
          const data = await client.hget(this.USER_SOCKETS_KEY, userId);
          if (data) {
            const connection = JSON.parse(data) as UserConnection;
            if (Date.now() - connection.lastSeen > this.HEARTBEAT_TIMEOUT) {
              staleConnections.push(userId);
            }
          }
        }

        if (staleConnections.length > 0) {
          await client.hdel(this.USER_SOCKETS_KEY, ...staleConnections);
          this.logger.log(
            `Cleaned up ${staleConnections.length} stale connections`,
          );
        }
      });
    } catch (error) {
      this.logger.error('Error cleaning up stale connections:', error);
    }
  }

  /**
   * Get connection statistics
   */
  async getConnectionStats(): Promise<{
    totalConnections: number;
    activeConnections: number;
    staleConnections: number;
    averageLatency: number;
  }> {
    try {
      return await this.redis.exec(async (client) => {
        const stats = {
          totalConnections: 0,
          activeConnections: 0,
          staleConnections: 0,
          averageLatency: 0,
        };

        const allData = await client.hgetall(this.USER_SOCKETS_KEY);
        const connections = Object.values(allData).map(
          (data) => JSON.parse(data) as UserConnection,
        );

        stats.totalConnections = connections.length;
        const now = Date.now();

        for (const connection of connections) {
          if (now - connection.lastSeen < this.HEARTBEAT_TIMEOUT) {
            stats.activeConnections++;
          } else {
            stats.staleConnections++;
          }
        }

        // Calculate average latency from recent connections
        const recentConnections = connections.filter(
          (conn) => now - conn.lastSeen < 60000, // last minute
        );
        if (recentConnections.length > 0) {
          const totalLatency = recentConnections.reduce(
            (sum, conn) => sum + (conn.latency || 0),
            0,
          );
          stats.averageLatency = totalLatency / recentConnections.length;
        }

        return stats;
      });
    } catch (error) {
      this.logger.error('Error getting connection stats:', error);
      return {
        totalConnections: 0,
        activeConnections: 0,
        staleConnections: 0,
        averageLatency: 0,
      };
    }
  }
}
