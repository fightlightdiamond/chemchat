import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../shared/infrastructure/prisma/prisma.service';
import { RedisService } from '../../shared/redis/redis.service';
import { NotificationService } from '../services/notification.service';
import { NotificationPreferenceService } from '../services/notification-preference.service';
import { PushNotificationPayload, NotificationPriority } from '../interfaces/notification.interface';
import { NotificationStatus, DevicePlatform } from '@prisma/client';
import * as admin from 'firebase-admin';

interface QueuedNotification {
  deliveryId: string;
  queuedAt: string;
}

@Injectable()
export class PushNotificationWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PushNotificationWorker.name);
  private isRunning = false;
  private workerInterval: NodeJS.Timeout | null = null;
  private firebaseApp: admin.app.App | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly notificationService: NotificationService,
    private readonly preferenceService: NotificationPreferenceService,
  ) {}

  async onModuleInit() {
    await this.initializeFirebase();
    await this.startWorker();
  }

  async onModuleDestroy() {
    await this.stopWorker();
  }

  private async initializeFirebase(): Promise<void> {
    try {
      const firebaseConfig = this.configService.get('FIREBASE_SERVICE_ACCOUNT');
      const projectId = this.configService.get('FIREBASE_PROJECT_ID');

      if (!firebaseConfig || !projectId) {
        this.logger.warn('Firebase configuration not found. Push notifications will be disabled.');
        return;
      }

      const serviceAccount = JSON.parse(firebaseConfig);

      this.firebaseApp = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId,
      }, 'chemchat-notifications');

      this.logger.log('Firebase Admin SDK initialized successfully');
    } catch (error) {
      this.logger.error(`Failed to initialize Firebase: ${error.message}`, error.stack);
    }
  }

  private async startWorker(): Promise<void> {
    if (this.isRunning) return;

    this.isRunning = true;
    this.logger.log('Starting push notification worker');

    // Process different priority queues
    this.workerInterval = setInterval(async () => {
      try {
        await this.processQueue(NotificationPriority.URGENT, 10);
        await this.processQueue(NotificationPriority.HIGH, 5);
        await this.processQueue(NotificationPriority.NORMAL, 3);
        await this.processQueue(NotificationPriority.LOW, 1);
      } catch (error) {
        this.logger.error(`Worker error: ${error.message}`, error.stack);
      }
    }, 1000); // Process every second
  }

  private async stopWorker(): Promise<void> {
    this.isRunning = false;
    
    if (this.workerInterval) {
      clearInterval(this.workerInterval);
      this.workerInterval = null;
    }

    this.logger.log('Push notification worker stopped');
  }

  private async processQueue(priority: NotificationPriority, batchSize: number): Promise<void> {
    const queueName = `notification:push:${priority}`;
    
    try {
      // Get batch of notifications from queue
      const notifications = await this.redis.lrange(queueName, 0, batchSize - 1);
      if (notifications.length === 0) return;

      // Remove processed items from queue
      await this.redis.ltrim(queueName, notifications.length, -1);

      // Process notifications in parallel
      const promises = notifications.map(async (notificationData) => {
        try {
          const queuedNotification: QueuedNotification = JSON.parse(notificationData);
          await this.processNotification(queuedNotification.deliveryId);
        } catch (error) {
          this.logger.error(`Failed to process notification: ${error.message}`, error.stack);
        }
      });

      await Promise.allSettled(promises);
    } catch (error) {
      this.logger.error(`Failed to process queue ${queueName}: ${error.message}`, error.stack);
    }
  }

  private async processNotification(deliveryId: string): Promise<void> {
    try {
      // Get notification delivery record
      const delivery = await (this.prisma as any).notificationDelivery.findUnique({
        where: { id: deliveryId },
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

      if (!delivery) {
        this.logger.warn(`Notification delivery ${deliveryId} not found`);
        return;
      }

      if (delivery.status !== NotificationStatus.PENDING) {
        this.logger.debug(`Notification ${deliveryId} already processed with status ${delivery.status}`);
        return;
      }

      // Get user's active device tokens
      const deviceTokens = await this.preferenceService.getActiveDeviceTokens(
        delivery.userId,
        delivery.tenantId || undefined,
      );

      if (deviceTokens.length === 0) {
        await this.notificationService.markAsFailed(
          deliveryId,
          'No active device tokens found for user',
        );
        return;
      }

      // Group tokens by platform for optimized delivery
      const tokensByPlatform = this.groupTokensByPlatform(deviceTokens);

      // Send to each platform
      const results = await Promise.allSettled([
        this.sendToFirebase(delivery, tokensByPlatform.firebase),
        this.sendToAPNs(delivery, tokensByPlatform.apns),
      ]);

      // Check if any delivery succeeded
      const hasSuccess = results.some(result => result.status === 'fulfilled' && result.value);

      if (hasSuccess) {
        await this.notificationService.markAsDelivered(deliveryId, undefined, new Date());
      } else {
        const errors = results
          .filter(result => result.status === 'rejected')
          .map(result => (result as PromiseRejectedResult).reason)
          .join('; ');
        
        await this.retryOrFail(deliveryId, errors || 'All platform deliveries failed');
      }
    } catch (error) {
      this.logger.error(`Failed to process notification ${deliveryId}: ${error.message}`, error.stack);
      await this.retryOrFail(deliveryId, error.message);
    }
  }

  private groupTokensByPlatform(deviceTokens: any[]) {
    const firebase: string[] = [];
    const apns: string[] = [];

    deviceTokens.forEach(token => {
      switch (token.platform) {
        case DevicePlatform.ANDROID:
        case DevicePlatform.WEB:
          firebase.push(token.token);
          break;
        case DevicePlatform.IOS:
          apns.push(token.token);
          break;
      }
    });

    return { firebase, apns };
  }

  private async sendToFirebase(delivery: any, tokens: string[]): Promise<boolean> {
    if (!this.firebaseApp || tokens.length === 0) return false;

    try {
      const messaging = admin.messaging(this.firebaseApp);
      
      const payload: PushNotificationPayload = {
        deviceTokens: tokens,
        title: delivery.title,
        body: delivery.body,
        data: delivery.data || {},
        priority: this.getPushPriority(delivery.notificationType),
      };

      const message: admin.messaging.MulticastMessage = {
        tokens,
        notification: {
          title: payload.title,
          body: payload.body,
        },
        data: this.sanitizeData(delivery.data),
        android: {
          priority: payload.priority === 'high' ? 'high' : 'normal',
          notification: {
            channelId: 'chemchat_notifications',
            priority: payload.priority === 'high' ? 'high' : 'default',
          },
        },
        webpush: {
          notification: {
            title: payload.title,
            body: payload.body,
            icon: '/icons/notification-icon.png',
            badge: '/icons/badge-icon.png',
          },
        },
      };

      const response = await (messaging as any).sendMulticast(message);
      
      // Handle failed tokens
      if (response.failureCount > 0) {
        await this.handleFailedTokens(tokens, response.responses);
      }

      this.logger.debug(`Firebase delivery: ${response.successCount}/${tokens.length} successful`);
      return response.successCount > 0;
    } catch (error) {
      this.logger.error(`Firebase delivery failed: ${error.message}`, error.stack);
      return false;
    }
  }

  private async sendToAPNs(delivery: any, tokens: string[]): Promise<boolean> {
    if (!this.firebaseApp || tokens.length === 0) return false;

    try {
      const messaging = admin.messaging(this.firebaseApp);
      
      const payload: PushNotificationPayload = {
        deviceTokens: tokens,
        title: delivery.title,
        body: delivery.body,
        data: delivery.data || {},
        priority: this.getPushPriority(delivery.notificationType),
      };

      const message: admin.messaging.MulticastMessage = {
        tokens,
        notification: {
          title: payload.title,
          body: payload.body,
        },
        data: this.sanitizeData(delivery.data),
        apns: {
          payload: {
            aps: {
              alert: {
                title: payload.title,
                body: payload.body,
              },
              badge: payload.badge || 1,
              sound: payload.sound || 'default',
              'content-available': 1,
            },
          },
          headers: {
            'apns-priority': payload.priority === 'high' ? '10' : '5',
            'apns-push-type': 'alert',
          },
        },
      };

      const response = await (messaging as any).sendMulticast(message);
      
      // Handle failed tokens
      if (response.failureCount > 0) {
        await this.handleFailedTokens(tokens, response.responses);
      }

      this.logger.debug(`APNs delivery: ${response.successCount}/${tokens.length} successful`);
      return response.successCount > 0;
    } catch (error) {
      this.logger.error(`APNs delivery failed: ${error.message}`, error.stack);
      return false;
    }
  }

  private async handleFailedTokens(
    tokens: string[],
    responses: admin.messaging.SendResponse[],
  ): Promise<void> {
    const failedTokens: string[] = [];

    responses.forEach((response, index) => {
      if (!response.success) {
        const token = tokens[index];
        const error = response.error;

        // Check if token is invalid and should be removed
        if (error?.code === 'messaging/registration-token-not-registered' ||
            error?.code === 'messaging/invalid-registration-token') {
          failedTokens.push(token);
        }
      }
    });

    // Deactivate invalid tokens
    if (failedTokens.length > 0) {
      await (this.prisma as any).deviceToken.updateMany({
        where: {
          token: { in: failedTokens },
        },
        data: {
          isActive: false,
        },
      });

      this.logger.log(`Deactivated ${failedTokens.length} invalid device tokens`);
    }
  }

  private getPushPriority(notificationType: string): 'high' | 'normal' {
    const highPriorityTypes = ['mention', 'conversation_invite', 'system_announcement'];
    return highPriorityTypes.includes(notificationType) ? 'high' : 'normal';
  }

  private sanitizeData(data: Record<string, any> | undefined): Record<string, string> {
    const sanitized: Record<string, string> = {};
    
    if (!data) return sanitized;

    Object.entries(data).forEach(([key, value]) => {
      // FCM requires all data values to be strings
      sanitized[key] = typeof value === 'string' ? value : JSON.stringify(value);
    });

    return sanitized;
  }

  private async retryOrFail(deliveryId: string, errorMessage: string): Promise<void> {
    try {
      const retryCount = await (this.prisma as any).notificationDelivery.findUnique({
        where: { id: deliveryId },
      });

      if (!retryCount) return;

      const maxRetries = 3;
      const newRetryCount = (retryCount.retryCount || 0) + 1;

      if (newRetryCount <= maxRetries) {
        // Calculate exponential backoff delay
        const delay = Math.pow(2, newRetryCount) * 1000; // 2s, 4s, 8s

        // Update retry count
        await (this.prisma as any).notificationDelivery.update({
          where: { id: deliveryId },
          data: { retryCount: newRetryCount },
        });

        // Re-queue with delay
        setTimeout(async () => {
          await this.redis.lpush(
            `notification:push:${NotificationPriority.NORMAL}`,
            JSON.stringify({
              deliveryId,
              queuedAt: new Date().toISOString(),
            }),
          );
        }, delay);

        this.logger.debug(`Retrying notification ${deliveryId} (attempt ${newRetryCount}/${maxRetries})`);
      } else {
        // Mark as failed after max retries
        await this.notificationService.markAsFailed(deliveryId, errorMessage, newRetryCount);
        this.logger.warn(`Notification ${deliveryId} failed after ${maxRetries} retries: ${errorMessage}`);
      }
    } catch (error) {
      this.logger.error(`Failed to handle retry for ${deliveryId}: ${error.message}`, error.stack);
    }
  }
}
