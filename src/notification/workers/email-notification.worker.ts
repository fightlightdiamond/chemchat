import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../shared/infrastructure/prisma/prisma.service';
import { RedisService } from '../../shared/redis/redis.service';
import { NotificationService } from '../services/notification.service';
import { NotificationTemplateService } from '../services/notification-template.service';
import { EmailNotificationPayload, NotificationPriority } from '../interfaces/notification.interface';
import { NotificationStatus, NotificationChannel } from '@prisma/client';
import * as nodemailer from 'nodemailer';
import * as handlebars from 'handlebars';

interface QueuedNotification {
  deliveryId: string;
  queuedAt: string;
}

@Injectable()
export class EmailNotificationWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EmailNotificationWorker.name);
  private isRunning = false;
  private workerInterval: NodeJS.Timeout | null = null;
  private transporter: nodemailer.Transporter | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly notificationService: NotificationService,
    private readonly templateService: NotificationTemplateService,
  ) {}

  async onModuleInit() {
    await this.initializeEmailTransporter();
    await this.startWorker();
  }

  async onModuleDestroy() {
    await this.stopWorker();
  }

  private async initializeEmailTransporter(): Promise<void> {
    try {
      const emailConfig = {
        host: this.configService.get('SMTP_HOST'),
        port: this.configService.get<number>('SMTP_PORT', 587),
        secure: this.configService.get<boolean>('SMTP_SECURE', false),
        auth: {
          user: this.configService.get('SMTP_USER'),
          pass: this.configService.get('SMTP_PASSWORD'),
        },
      };

      if (!emailConfig.host || !emailConfig.auth.user || !emailConfig.auth.pass) {
        this.logger.warn('SMTP configuration not found. Email notifications will be disabled.');
        return;
      }

      this.transporter = nodemailer.createTransport(emailConfig);

      // Verify connection
      await this.transporter?.verify();
      this.logger.log('Email transporter initialized successfully');
    } catch (error) {
      this.logger.error(`Failed to initialize email transporter: ${error.message}`, error.stack);
    }
  }

  private async startWorker(): Promise<void> {
    if (this.isRunning) return;

    this.isRunning = true;
    this.logger.log('Starting email notification worker');

    // Process different priority queues with different intervals
    this.workerInterval = setInterval(async () => {
      try {
        await this.processQueue(NotificationPriority.URGENT, 5);
        await this.processQueue(NotificationPriority.HIGH, 3);
        await this.processQueue(NotificationPriority.NORMAL, 2);
        await this.processQueue(NotificationPriority.LOW, 1);
      } catch (error) {
        this.logger.error(`Worker error: ${error.message}`, error.stack);
      }
    }, 5000); // Process every 5 seconds (emails are less time-sensitive)
  }

  private async stopWorker(): Promise<void> {
    this.isRunning = false;
    
    if (this.workerInterval) {
      clearInterval(this.workerInterval);
      this.workerInterval = null;
    }

    this.logger.log('Email notification worker stopped');
  }

  private async processQueue(priority: NotificationPriority, batchSize: number): Promise<void> {
    const queueName = `notification:email:${priority}`;
    
    try {
      // Get batch of notifications from queue
      const notifications = await this.redis.lrange(queueName, 0, batchSize - 1);
      if (notifications.length === 0) return;

      // Remove processed items from queue
      await this.redis.ltrim(queueName, notifications.length, -1);

      // Process notifications sequentially to avoid overwhelming SMTP server
      for (const notificationData of notifications) {
        try {
          const queuedNotification: QueuedNotification = JSON.parse(notificationData);
          await this.processNotification(queuedNotification.deliveryId);
          
          // Small delay between emails to be respectful to SMTP server
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
          this.logger.error(`Failed to process notification: ${error.message}`, error.stack);
        }
      }
    } catch (error) {
      this.logger.error(`Failed to process queue ${queueName}: ${error.message}`, error.stack);
    }
  }

  private async processNotification(deliveryId: string): Promise<void> {
    try {
      // Get notification delivery record
      const delivery = await this.prisma.notificationDelivery.findUnique({
        where: { id: deliveryId },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              displayName: true,
              email: true,
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

      if (!delivery.user.email) {
        await this.notificationService.markAsFailed(
          deliveryId,
          'User email address not found',
        );
        return;
      }

      // Get email template
      const template = await this.templateService.getTemplate(
        delivery.notificationType,
        NotificationChannel.EMAIL,
        delivery.tenantId || undefined,
      );

      if (!template) {
        await this.notificationService.markAsFailed(
          deliveryId,
          'Email template not found',
        );
        return;
      }

      // Prepare template variables
      const templateVariables = {
        recipientName: delivery.user.displayName || delivery.user.username,
        ...((delivery.data as Record<string, any>) || {}),
      };

      // Render template
      const rendered = await this.templateService.renderTemplate(template, templateVariables);

      // Send email
      const emailPayload: EmailNotificationPayload = {
        to: delivery.user.email,
        subject: rendered.subject || rendered.title,
        html: this.renderHtmlEmail(rendered.title, rendered.body, templateVariables),
        text: rendered.body,
      };

      const messageId = await this.sendEmail(emailPayload);

      if (messageId) {
        await this.notificationService.markAsDelivered(deliveryId, messageId, new Date());
        this.logger.debug(`Email sent successfully for delivery ${deliveryId}`);
      } else {
        await this.retryOrFail(deliveryId, 'Failed to send email');
      }
    } catch (error) {
      this.logger.error(`Failed to process email notification ${deliveryId}: ${error.message}`, error.stack);
      await this.retryOrFail(deliveryId, error.message);
    }
  }

  private async sendEmail(payload: EmailNotificationPayload): Promise<string | null> {
    if (!this.transporter) {
      this.logger.error('Email transporter not initialized');
      return null;
    }

    try {
      const mailOptions = {
        from: {
          name: this.configService.get('SMTP_FROM_NAME', 'ChemChat'),
          address: this.configService.get('SMTP_FROM_EMAIL', 'noreply@chemchat.com'),
        },
        to: payload.to,
        subject: payload.subject,
        html: payload.html,
        text: payload.text,
        headers: {
          'X-Mailer': 'ChemChat Notification System',
          'X-Priority': '3',
        },
      };

      const result = await this.transporter.sendMail(mailOptions);
      return result.messageId;
    } catch (error) {
      this.logger.error(`Failed to send email: ${error.message}`, error.stack);
      return null;
    }
  }

  private renderHtmlEmail(title: string, body: string, variables: Record<string, any>): string {
    const template = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{title}}</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f8f9fa;
        }
        .container {
            background-color: #ffffff;
            border-radius: 8px;
            padding: 30px;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
        }
        .header {
            text-align: center;
            margin-bottom: 30px;
            padding-bottom: 20px;
            border-bottom: 2px solid #e9ecef;
        }
        .logo {
            font-size: 24px;
            font-weight: bold;
            color: #007bff;
            margin-bottom: 10px;
        }
        .title {
            font-size: 20px;
            font-weight: 600;
            color: #212529;
            margin-bottom: 20px;
        }
        .content {
            font-size: 16px;
            line-height: 1.8;
            margin-bottom: 30px;
            white-space: pre-line;
        }
        .button {
            display: inline-block;
            padding: 12px 24px;
            background-color: #007bff;
            color: #ffffff;
            text-decoration: none;
            border-radius: 6px;
            font-weight: 500;
            text-align: center;
            margin: 20px 0;
        }
        .footer {
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #e9ecef;
            font-size: 14px;
            color: #6c757d;
            text-align: center;
        }
        .unsubscribe {
            font-size: 12px;
            color: #adb5bd;
            margin-top: 20px;
        }
        .unsubscribe a {
            color: #6c757d;
            text-decoration: none;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">ChemChat</div>
        </div>
        
        <div class="title">{{title}}</div>
        
        <div class="content">{{body}}</div>
        
        {{#if chatUrl}}
        <div style="text-align: center;">
            <a href="{{chatUrl}}" class="button">Open ChemChat</a>
        </div>
        {{/if}}
        
        <div class="footer">
            <p>This is an automated message from ChemChat. Please do not reply to this email.</p>
            
            <div class="unsubscribe">
                <p>
                    Don't want to receive these emails? 
                    <a href="{{unsubscribeUrl}}">Update your notification preferences</a>
                </p>
            </div>
        </div>
    </div>
</body>
</html>`;

    const compiledTemplate = handlebars.compile(template);
    
    return compiledTemplate({
      title,
      body,
      ...variables,
      chatUrl: variables.chatUrl || this.configService.get('APP_URL', 'https://chemchat.com'),
      unsubscribeUrl: `${this.configService.get('APP_URL', 'https://chemchat.com')}/settings/notifications`,
    });
  }

  private async retryOrFail(deliveryId: string, errorMessage: string): Promise<void> {
    try {
      const delivery = await this.prisma.notificationDelivery.findUnique({
        where: { id: deliveryId },
      });

      if (!delivery) return;

      const maxRetries = 3;
      const newRetryCount = delivery.retryCount + 1;

      if (newRetryCount <= maxRetries) {
        // Calculate exponential backoff delay (longer for emails)
        const delay = Math.pow(2, newRetryCount) * 5000; // 10s, 20s, 40s

        // Update retry count
        await this.prisma.notificationDelivery.update({
          where: { id: deliveryId },
          data: { retryCount: newRetryCount },
        });

        // Re-queue with delay
        setTimeout(async () => {
          await this.redis.lpush(
            `notification:email:${NotificationPriority.NORMAL}`,
            JSON.stringify({
              deliveryId,
              queuedAt: new Date().toISOString(),
            }),
          );
        }, delay);

        this.logger.debug(`Retrying email notification ${deliveryId} (attempt ${newRetryCount}/${maxRetries})`);
      } else {
        // Mark as failed after max retries
        await this.notificationService.markAsFailed(deliveryId, errorMessage, newRetryCount);
        this.logger.warn(`Email notification ${deliveryId} failed after ${maxRetries} retries: ${errorMessage}`);
      }
    } catch (error) {
      this.logger.error(`Failed to handle retry for ${deliveryId}: ${error.message}`, error.stack);
    }
  }
}
