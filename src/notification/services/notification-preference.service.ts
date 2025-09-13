import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../shared/infrastructure/prisma/prisma.service';
import { RedisService } from '../../shared/redis/redis.service';
import {
  NotificationPreferences,
  DeviceTokenInfo,
} from '../interfaces/notification.interface';

// Temporary type definitions until Prisma schema is applied
type DeviceToken = any;
type DevicePlatform = 'IOS' | 'ANDROID' | 'WEB';

@Injectable()
export class NotificationPreferenceService {
  private readonly logger = new Logger(NotificationPreferenceService.name);
  private readonly CACHE_TTL = 3600; // 1 hour

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  // Type-safe accessors for Redis and Prisma using type assertions
  private get extendedRedis(): any {
    return this.redis as any;
  }

  private get extendedPrisma(): any {
    return this.prisma as any;
  }

  async getUserPreferences(
    userId: string,
    tenantId?: string,
  ): Promise<NotificationPreferences | null> {
    const cacheKey = `notification:preferences:${userId}:${tenantId || 'global'}`;
    
    try {
      // Try to get from cache first
      const cached = await this.extendedRedis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }

      // Get from database
      const preferences = await this.extendedPrisma.notificationPreference.findFirst({
        where: {
          userId_tenantId: {
            userId,
            tenantId: tenantId || null,
          },
        },
      });

      if (!preferences) {
        // Create default preferences
        const defaultPreferences = await this.createDefaultPreferences(userId, tenantId);
        await this.extendedRedis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(defaultPreferences));
        return defaultPreferences;
      }

      const result: NotificationPreferences = {
        userId: preferences.userId,
        tenantId: preferences.tenantId || undefined,
        pushEnabled: preferences.pushEnabled,
        emailEnabled: preferences.emailEnabled,
        mentionNotifications: preferences.mentionNotifications,
        dmNotifications: preferences.dmNotifications,
        groupNotifications: preferences.groupNotifications,
        quietHoursEnabled: preferences.quietHoursEnabled,
        quietHoursStart: preferences.quietHoursStart || undefined,
        quietHoursEnd: preferences.quietHoursEnd || undefined,
        timezone: preferences.timezone,
      };

      // Cache the result
      await this.extendedRedis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(result));
      return result;
    } catch (error) {
      this.logger.error(`Failed to get user preferences: ${error.message}`, error.stack);
      throw error;
    }
  }

  async updateUserPreferences(
    userId: string,
    preferences: Partial<NotificationPreferences>,
    tenantId?: string,
  ): Promise<NotificationPreferences> {
    try {
      const result = await this.extendedPrisma.notificationPreference.upsert({
        where: {
          userId_tenantId: {
            userId,
            tenantId: tenantId || null,
          },
        },
        update: {
          pushEnabled: preferences.pushEnabled,
          emailEnabled: preferences.emailEnabled,
          mentionNotifications: preferences.mentionNotifications,
          dmNotifications: preferences.dmNotifications,
          groupNotifications: preferences.groupNotifications,
          quietHoursEnabled: preferences.quietHoursEnabled,
          quietHoursStart: preferences.quietHoursStart,
          quietHoursEnd: preferences.quietHoursEnd,
          timezone: preferences.timezone,
        },
        create: {
          userId,
          tenantId: tenantId || null,
          pushEnabled: preferences.pushEnabled ?? true,
          emailEnabled: preferences.emailEnabled ?? true,
          mentionNotifications: preferences.mentionNotifications ?? true,
          dmNotifications: preferences.dmNotifications ?? true,
          groupNotifications: preferences.groupNotifications ?? true,
          quietHoursEnabled: preferences.quietHoursEnabled ?? false,
          quietHoursStart: preferences.quietHoursStart,
          quietHoursEnd: preferences.quietHoursEnd,
          timezone: preferences.timezone ?? 'UTC',
        },
      });

      const resultPreferences: NotificationPreferences = {
        userId: result.userId,
        tenantId: result.tenantId || undefined,
        pushEnabled: result.pushEnabled,
        emailEnabled: result.emailEnabled,
        mentionNotifications: result.mentionNotifications,
        dmNotifications: result.dmNotifications,
        groupNotifications: result.groupNotifications,
        quietHoursEnabled: result.quietHoursEnabled,
        quietHoursStart: result.quietHoursStart || undefined,
        quietHoursEnd: result.quietHoursEnd || undefined,
        timezone: result.timezone,
      };

      // Invalidate cache
      const cacheKey = `notification:preferences:${userId}:${tenantId || 'global'}`;
      await this.extendedRedis.del(cacheKey);

      this.logger.log(`Updated notification preferences for user ${userId}`);
      return resultPreferences;
    } catch (error) {
      this.logger.error(`Failed to update user preferences: ${error.message}`, error.stack);
      throw error;
    }
  }

  async registerDeviceToken(deviceInfo: DeviceTokenInfo): Promise<DeviceToken> {
    const { userId, tenantId, deviceId, token, platform, appVersion } = deviceInfo;

    try {
      // Deactivate existing tokens for this device
      await this.extendedPrisma.deviceToken.updateMany({
        where: {
          userId,
          deviceId,
          tenantId: tenantId || null,
        },
        data: {
          isActive: false,
        },
      });

      // Create new active token
      const deviceToken = await this.extendedPrisma.deviceToken.create({
        data: {
          userId,
          tenantId: tenantId || null,
          deviceId,
          token,
          platform,
          appVersion,
          isActive: true,
          lastUsedAt: new Date(),
        },
      });

      // Invalidate device tokens cache
      const cacheKey = `notification:devices:${userId}:${tenantId || 'global'}`;
      await this.extendedRedis.del(cacheKey);

      this.logger.log(`Registered device token for user ${userId}, device ${deviceId}`);
      return deviceToken;
    } catch (error) {
      this.logger.error(`Failed to register device token: ${error.message}`, error.stack);
      throw error;
    }
  }

  async getActiveDeviceTokens(
    userId: string,
    tenantId?: string,
    platform?: DevicePlatform,
  ): Promise<DeviceToken[]> {
    const cacheKey = `notification:devices:${userId}:${tenantId || 'global'}:${platform || 'all'}`;

    try {
      // Try cache first
      const cached = await this.extendedRedis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }

      const tokens = await this.extendedPrisma.deviceToken.findMany({
        where: {
          userId,
          tenantId: tenantId || null,
          isActive: true,
          ...(platform && { platform }),
        },
        orderBy: {
          lastUsedAt: 'desc',
        },
      });

      // Cache for 5 minutes
      await this.extendedRedis.setex(cacheKey, 300, JSON.stringify(tokens));
      return tokens;
    } catch (error) {
      this.logger.error(`Failed to get device tokens: ${error.message}`, error.stack);
      throw error;
    }
  }

  async updateDeviceTokenLastUsed(tokenId: string): Promise<void> {
    try {
      await this.extendedPrisma.deviceToken.update({
        where: { id: tokenId },
        data: { lastUsedAt: new Date() },
      });
    } catch (error) {
      this.logger.error(`Failed to update device token last used: ${error.message}`, error.stack);
    }
  }

  async deactivateDeviceToken(
    userId: string,
    deviceId: string,
    tenantId?: string,
  ): Promise<void> {
    try {
      await this.extendedPrisma.deviceToken.updateMany({
        where: {
          userId,
          deviceId,
          tenantId: tenantId || null,
        },
        data: {
          isActive: false,
        },
      });

      // Invalidate cache
      const cacheKey = `notification:devices:${userId}:${tenantId || 'global'}`;
      await this.extendedRedis.del(cacheKey);

      this.logger.log(`Deactivated device token for user ${userId}, device ${deviceId}`);
    } catch (error) {
      this.logger.error(`Failed to deactivate device token: ${error.message}`, error.stack);
      throw error;
    }
  }

  async cleanupInactiveTokens(inactiveDays = 30): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - inactiveDays);

      const result = await this.extendedPrisma.deviceToken.deleteMany({
        where: {
          OR: [
            { isActive: false },
            { lastUsedAt: { lt: cutoffDate } },
          ],
        },
      });

      this.logger.log(`Cleaned up ${result.count} inactive device tokens`);
      return result.count;
    } catch (error) {
      this.logger.error(`Failed to cleanup inactive tokens: ${error.message}`, error.stack);
      throw error;
    }
  }

  private async createDefaultPreferences(
    userId: string,
    tenantId?: string,
  ): Promise<NotificationPreferences> {
    const preferences = await this.extendedPrisma.notificationPreference.create({
      data: {
        userId,
        tenantId: tenantId || null,
        pushEnabled: true,
        emailEnabled: true,
        mentionNotifications: true,
        dmNotifications: true,
        groupNotifications: true,
        quietHoursEnabled: false,
        timezone: 'UTC',
      },
    });

    return {
      userId: preferences.userId,
      tenantId: preferences.tenantId || undefined,
      pushEnabled: preferences.pushEnabled,
      emailEnabled: preferences.emailEnabled,
      mentionNotifications: preferences.mentionNotifications,
      dmNotifications: preferences.dmNotifications,
      groupNotifications: preferences.groupNotifications,
      quietHoursEnabled: preferences.quietHoursEnabled,
      quietHoursStart: preferences.quietHoursStart || undefined,
      quietHoursEnd: preferences.quietHoursEnd || undefined,
      timezone: preferences.timezone,
    };
  }
}
