import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../shared/infrastructure/prisma/prisma.service';
import { RedisService } from '../../shared/redis/redis.service';
import {
  NotificationPayload,
  NotificationDeliveryResult,
  NotificationFilter,
  NotificationStats,
  NotificationPriority,
} from '../interfaces/notification.interface';
// Temporary enum definitions until Prisma schema is applied
enum NotificationType {
  NEW_MESSAGE = 'NEW_MESSAGE',
  MENTION = 'MENTION', 
  CONVERSATION_INVITE = 'CONVERSATION_INVITE',
  SYSTEM_ANNOUNCEMENT = 'SYSTEM_ANNOUNCEMENT'
}

enum NotificationChannel {
  PUSH = 'PUSH',
  EMAIL = 'EMAIL',
  SMS = 'SMS'
}

enum NotificationStatus {
  PENDING = 'PENDING',
  SENT = 'SENT',
  DELIVERED = 'DELIVERED',
  FAILED = 'FAILED',
  SCHEDULED = 'SCHEDULED',
  READ = 'READ'
}

type NotificationDelivery = any;
type NotificationPreference = any;

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async sendNotification(payload: NotificationPayload): Promise<NotificationDeliveryResult[]> {
    const { userId, tenantId, type, title, body, data, channels, scheduledAt, priority } = payload;

    try {
      // Get user preferences to determine delivery channels
      const preferences = await this.getUserPreferences(userId, tenantId);
      
      // Determine which channels to use
      const deliveryChannels = channels || this.getDefaultChannels(type as any, preferences);
      
      // Check if user is in quiet hours
      if (await this.isInQuietHours(preferences)) {
        // Only send urgent notifications during quiet hours
        if (priority !== NotificationPriority.URGENT) {
          this.logger.log(`Skipping notification for user ${userId} - in quiet hours`);
          return [];
        }
      }

      const results: NotificationDeliveryResult[] = [];

      // Create notification delivery records for each channel
      for (const channel of deliveryChannels) {
        if (!this.shouldSendOnChannel(channel as any, preferences)) {
          continue;
        }

        const delivery = await (this.prisma as any).notificationDelivery.create({
          data: {
            tenantId,
            userId,
            notificationType: type,
            deliveryChannel: channel,
            status: scheduledAt ? NotificationStatus.SCHEDULED : NotificationStatus.PENDING,
            title,
            body,
            data: data || {},
            scheduledAt,
          },
        });

        // Queue for immediate delivery or schedule for later
        if (scheduledAt) {
          await this.scheduleNotification(delivery.id, scheduledAt);
        } else {
          await this.queueForDelivery(delivery.id, channel as any, priority);
        }

        results.push({
          id: delivery.id,
          status: delivery.status,
        });
      }

      // Update notification metrics
      await this.updateMetrics(userId, tenantId, type as any, results.length);

      return results;
    } catch (error) {
      this.logger.error(`Failed to send notification: ${error.message}`, error.stack);
      throw error;
    }
  }

  async markAsDelivered(
    deliveryId: string,
    externalId?: string,
    deliveredAt?: Date,
  ): Promise<void> {
    await (this.prisma as any).notificationDelivery.update({
      where: { id: deliveryId },
      data: {
        status: NotificationStatus.DELIVERED,
        externalId,
        deliveredAt: deliveredAt || new Date(),
      },
    });
  }

  async markAsRead(deliveryId: string, readAt?: Date): Promise<void> {
    await (this.prisma as any).notificationDelivery.update({
      where: { id: deliveryId },
      data: {
        status: NotificationStatus.READ,
        readAt: readAt || new Date(),
      },
    });
  }

  async markAsFailed(
    deliveryId: string,
    errorMessage: string,
    retryCount?: number,
  ): Promise<void> {
    await (this.prisma as any).notificationDelivery.update({
      where: { id: deliveryId },
      data: {
        status: NotificationStatus.FAILED,
        errorMessage,
        retryCount: retryCount || 0,
      },
    });
  }

  async getNotifications(filter: NotificationFilter): Promise<NotificationDelivery[]> {
    const {
      userId,
      tenantId,
      type,
      status,
      channel,
      startDate,
      endDate,
      limit = 50,
      offset = 0,
    } = filter;

    return (this.prisma as any).notificationDelivery.findMany({
      where: {
        ...(userId && { userId }),
        ...(tenantId && { tenantId }),
        ...(type && { notificationType: type }),
        ...(status && { status }),
        ...(channel && { deliveryChannel: channel }),
        ...(startDate && endDate && {
          createdAt: {
            gte: startDate,
            lte: endDate,
          },
        }),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
      include: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
          },
        },
      },
    });
  }

  async getNotificationStats(
    userId?: string,
    tenantId?: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<NotificationStats> {
    const where = {
      ...(userId && { userId }),
      ...(tenantId && { tenantId }),
      ...(startDate && endDate && {
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      }),
    };

    const [totalSent, totalDelivered, totalFailed, channelStats] = await Promise.all([
      (this.prisma as any).notificationDelivery.count({
        where: { ...where, status: { in: [NotificationStatus.SENT, NotificationStatus.DELIVERED, NotificationStatus.READ] } },
      }),
      (this.prisma as any).notificationDelivery.count({
        where: { ...where, status: { in: [NotificationStatus.DELIVERED, NotificationStatus.READ] } },
      }),
      (this.prisma as any).notificationDelivery.count({
        where: { ...where, status: NotificationStatus.FAILED },
      }),
      (this.prisma as any).notificationDelivery.groupBy({
        by: ['deliveryChannel', 'status'],
        where,
        _count: true,
      }),
    ]);

    // Calculate average delivery time
    const deliveries = await (this.prisma as any).notificationDelivery.findMany({
      where: {
        ...where,
        status: { in: [NotificationStatus.DELIVERED, NotificationStatus.READ] },
        sentAt: { not: null },
        deliveredAt: { not: null },
      },
      select: {
        sentAt: true,
        deliveredAt: true,
      },
    });

    const averageDeliveryTime = deliveries.length > 0
      ? deliveries.reduce((sum, notification) => {
          const deliveryTime = notification.deliveredAt!.getTime() - notification.sentAt!.getTime();
          return sum + deliveryTime;
        }, 0) / deliveries.length
      : 0;

    // Process channel statistics
    const byChannel: Record<NotificationChannel, any> = {
      [NotificationChannel.PUSH]: { sent: 0, delivered: 0, failed: 0 },
      [NotificationChannel.EMAIL]: { sent: 0, delivered: 0, failed: 0 },
      [NotificationChannel.SMS]: { sent: 0, delivered: 0, failed: 0 },
    };

    channelStats.forEach((stat) => {
      const channel = stat.deliveryChannel;
      if (stat.status === NotificationStatus.SENT || 
          stat.status === NotificationStatus.DELIVERED || 
          stat.status === NotificationStatus.READ) {
        byChannel[channel].sent += stat._count;
      }
      if (stat.status === NotificationStatus.DELIVERED || 
          stat.status === NotificationStatus.READ) {
        byChannel[channel].delivered += stat._count;
      }
      if (stat.status === NotificationStatus.FAILED) {
        byChannel[channel].failed += stat._count;
      }
    });

    return {
      totalSent,
      totalDelivered,
      totalFailed,
      deliveryRate: totalSent > 0 ? (totalDelivered / totalSent) * 100 : 0,
      averageDeliveryTime,
      byChannel,
    };
  }

  private async getUserPreferences(
    userId: string,
    tenantId?: string,
  ): Promise<NotificationPreference | null> {
    return (this.prisma as any).notificationPreference.findUnique({
      where: {
        userId_tenantId: {
          userId,
          tenantId: tenantId || undefined,
        },
      },
    });
  }

  private getDefaultChannels(
    type: NotificationType,
    preferences?: NotificationPreference | null,
  ): NotificationChannel[] {
    const channels: NotificationChannel[] = [];

    if (!preferences) {
      return [NotificationChannel.PUSH]; // Default fallback
    }

    // Add push notifications if enabled
    if (preferences.pushEnabled) {
      channels.push(NotificationChannel.PUSH);
    }

    // Add email notifications for certain types if enabled
    if (preferences.emailEnabled && this.shouldSendEmailForType(type)) {
      channels.push(NotificationChannel.EMAIL);
    }

    return channels.length > 0 ? channels : [NotificationChannel.PUSH];
  }

  private shouldSendEmailForType(type: NotificationType): boolean {
    // Only send emails for important notification types
    return [
      NotificationType.MENTION,
      NotificationType.CONVERSATION_INVITE,
      NotificationType.SYSTEM_ANNOUNCEMENT,
    ].includes(type);
  }

  private shouldSendOnChannel(
    channel: NotificationChannel,
    preferences?: NotificationPreference | null,
  ): boolean {
    if (!preferences) return true;

    switch (channel) {
      case NotificationChannel.PUSH:
        return preferences.pushEnabled;
      case NotificationChannel.EMAIL:
        return preferences.emailEnabled;
      default:
        return true;
    }
  }

  private async isInQuietHours(preferences?: NotificationPreference | null): Promise<boolean> {
    if (!preferences?.quietHoursEnabled || !preferences.quietHoursStart || !preferences.quietHoursEnd) {
      return false;
    }

    const now = new Date();
    const timezone = preferences.timezone || 'UTC';
    
    // Convert current time to user's timezone
    const userTime = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
    const currentHour = userTime.getHours();
    const currentMinute = userTime.getMinutes();
    const currentTimeMinutes = currentHour * 60 + currentMinute;

    const [startHour, startMinute] = preferences.quietHoursStart.split(':').map(Number);
    const [endHour, endMinute] = preferences.quietHoursEnd.split(':').map(Number);
    
    const startTimeMinutes = startHour * 60 + startMinute;
    const endTimeMinutes = endHour * 60 + endMinute;

    // Handle overnight quiet hours (e.g., 22:00 to 08:00)
    if (startTimeMinutes > endTimeMinutes) {
      return currentTimeMinutes >= startTimeMinutes || currentTimeMinutes <= endTimeMinutes;
    }

    return currentTimeMinutes >= startTimeMinutes && currentTimeMinutes <= endTimeMinutes;
  }

  private async queueForDelivery(
    deliveryId: string,
    channel: NotificationChannel,
    priority: NotificationPriority = NotificationPriority.NORMAL,
  ): Promise<void> {
    const queueName = `notification:${channel}:${priority}`;
    
    await (this.redis as any).lpush(queueName, JSON.stringify({ deliveryId, channel, priority }));

    this.logger.debug(`Queued notification for ${channel} delivery with ${priority} priority`);
  }

  private async scheduleNotification(deliveryId: string, scheduledAt: Date): Promise<void> {
    const delay = scheduledAt.getTime() - Date.now();
    
    if (delay <= 0) {
      // Schedule immediately if time has passed
      const delivery = await (this.prisma as any).notificationDelivery.findUnique({
        where: { id: deliveryId },
      });
      
      if (delivery) {
        await this.queueForDelivery(deliveryId, delivery.deliveryChannel);
      }
      return;
    }

    // Use Redis for scheduling
    await (this.redis as any).sadd(`scheduled:${scheduledAt.getTime()}`, deliveryId);
    await (this.redis as any).expire(`scheduled:${scheduledAt.getTime()}`, 86400);

    this.logger.debug(`Scheduled notification ${deliveryId} for ${scheduledAt.toISOString()}`);
  }

  private async updateMetrics(
    userId: string,
    tenantId: string | undefined,
    type: NotificationType,
    count: number,
  ): Promise<void> {
    const metricsKey = `notification:stats:${type}:${new Date().toISOString().split('T')[0]}`;
    await (this.redis as any).incrby(metricsKey, count);
    await (this.redis as any).expire(metricsKey, 86400 * 30); // Keep for 30 days
  }
}
