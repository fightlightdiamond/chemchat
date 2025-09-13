import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../shared/infrastructure/prisma/prisma.service';
import { RedisService } from '../../shared/redis/redis.service';
import { NotificationTemplate } from '../interfaces/notification.interface';
import {
  NotificationType,
  NotificationChannel,
  NotificationTemplate as PrismaNotificationTemplate,
} from '@prisma/client';

@Injectable()
export class NotificationTemplateService {
  private readonly logger = new Logger(NotificationTemplateService.name);
  private readonly CACHE_TTL = 3600; // 1 hour

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async getTemplate(
    type: NotificationType,
    channel: NotificationChannel,
    tenantId?: string,
  ): Promise<NotificationTemplate | null> {
    const cacheKey = `notification:template:${tenantId || 'global'}:${type}:${channel}`;

    try {
      // Try cache first
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }

      // Get from database - try tenant-specific first, then global
      let template = await this.prisma.notificationTemplate.findFirst({
        where: {
          tenantId,
          type,
          channel,
          isActive: true,
        },
      });

      // Fallback to global template if tenant-specific not found
      if (!template && tenantId) {
        template = await this.prisma.notificationTemplate.findFirst({
          where: {
            tenantId: null,
            type,
            channel,
            isActive: true,
          },
        });
      }

      if (!template) {
        // Create default template if none exists
        template = await this.createDefaultTemplate(type, channel, tenantId);
      }

      const result: NotificationTemplate = {
        id: template.id,
        name: template.name,
        type: template.type,
        channel: template.channel,
        subject: template.subject || undefined,
        title: template.title,
        body: template.body,
        variables: template.variables as Record<string, any> || undefined,
      };

      // Cache the result
      await this.redis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(result));
      return result;
    } catch (error) {
      this.logger.error(`Failed to get template: ${error.message}`, error.stack);
      throw error;
    }
  }

  async createTemplate(
    template: Omit<NotificationTemplate, 'id'> & { tenantId?: string },
  ): Promise<NotificationTemplate> {
    try {
      const created = await this.prisma.notificationTemplate.create({
        data: {
          tenantId: template.tenantId || null,
          name: template.name,
          type: template.type,
          channel: template.channel,
          subject: template.subject,
          title: template.title,
          body: template.body,
          variables: template.variables || {},
          isActive: true,
        },
      });

      // Invalidate cache
      const cacheKey = `notification:template:${template.tenantId || 'global'}:${template.type}:${template.channel}`;
      await this.redis.del(cacheKey);

      return {
        id: created.id,
        name: created.name,
        type: created.type,
        channel: created.channel,
        subject: created.subject || undefined,
        title: created.title,
        body: created.body,
        variables: created.variables as Record<string, any> || undefined,
      };
    } catch (error) {
      this.logger.error(`Failed to create template: ${error.message}`, error.stack);
      throw error;
    }
  }

  async updateTemplate(
    templateId: string,
    updates: Partial<Omit<NotificationTemplate, 'id'>>,
  ): Promise<NotificationTemplate> {
    try {
      const existing = await this.prisma.notificationTemplate.findUnique({
        where: { id: templateId },
      });

      if (!existing) {
        throw new NotFoundException(`Template with ID ${templateId} not found`);
      }

      const updated = await this.prisma.notificationTemplate.update({
        where: { id: templateId },
        data: {
          name: updates.name,
          subject: updates.subject,
          title: updates.title,
          body: updates.body,
          variables: updates.variables,
        },
      });

      // Invalidate cache
      const cacheKey = `notification:template:${existing.tenantId || 'global'}:${existing.type}:${existing.channel}`;
      await this.redis.del(cacheKey);

      return {
        id: updated.id,
        name: updated.name,
        type: updated.type,
        channel: updated.channel,
        subject: updated.subject || undefined,
        title: updated.title,
        body: updated.body,
        variables: updated.variables as Record<string, any> || undefined,
      };
    } catch (error) {
      this.logger.error(`Failed to update template: ${error.message}`, error.stack);
      throw error;
    }
  }

  async renderTemplate(
    template: NotificationTemplate,
    variables: Record<string, any>,
  ): Promise<{ title: string; body: string; subject?: string }> {
    try {
      const title = this.interpolateTemplate(template.title, variables);
      const body = this.interpolateTemplate(template.body, variables);
      const subject = template.subject ? this.interpolateTemplate(template.subject, variables) : undefined;

      return { title, body, subject };
    } catch (error) {
      this.logger.error(`Failed to render template: ${error.message}`, error.stack);
      throw error;
    }
  }

  async getTemplatesByTenant(tenantId?: string): Promise<NotificationTemplate[]> {
    try {
      const templates = await this.prisma.notificationTemplate.findMany({
        where: {
          tenantId: tenantId || null,
          isActive: true,
        },
        orderBy: [
          { type: 'asc' },
          { channel: 'asc' },
        ],
      });

      return templates.map(template => ({
        id: template.id,
        name: template.name,
        type: template.type,
        channel: template.channel,
        subject: template.subject || undefined,
        title: template.title,
        body: template.body,
        variables: template.variables as Record<string, any> || undefined,
      }));
    } catch (error) {
      this.logger.error(`Failed to get templates by tenant: ${error.message}`, error.stack);
      throw error;
    }
  }

  private interpolateTemplate(template: string, variables: Record<string, any>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      const value = variables[key];
      return value !== undefined ? String(value) : match;
    });
  }

  private async createDefaultTemplate(
    type: NotificationType,
    channel: NotificationChannel,
    tenantId?: string,
  ): Promise<PrismaNotificationTemplate> {
    const defaultTemplates = this.getDefaultTemplateContent(type, channel);

    return this.prisma.notificationTemplate.create({
      data: {
        tenantId: tenantId || null,
        name: `Default ${type} ${channel}`,
        type,
        channel,
        subject: defaultTemplates.subject,
        title: defaultTemplates.title,
        body: defaultTemplates.body,
        variables: defaultTemplates.variables,
        isActive: true,
      },
    });
  }

  private getDefaultTemplateContent(type: NotificationType, channel: NotificationChannel) {
    const templates = {
      [NotificationType.NEW_MESSAGE]: {
        [NotificationChannel.PUSH]: {
          title: 'New message from {{senderName}}',
          body: '{{messagePreview}}',
          variables: { senderName: 'string', messagePreview: 'string' },
        },
        [NotificationChannel.EMAIL]: {
          subject: 'New message from {{senderName}}',
          title: 'You have a new message',
          body: 'Hi {{recipientName}},\n\n{{senderName}} sent you a message:\n\n"{{messageContent}}"\n\nReply at {{chatUrl}}',
          variables: { recipientName: 'string', senderName: 'string', messageContent: 'string', chatUrl: 'string' },
        },
      },
      [NotificationType.MENTION]: {
        [NotificationChannel.PUSH]: {
          title: '{{senderName}} mentioned you',
          body: '{{messagePreview}}',
          variables: { senderName: 'string', messagePreview: 'string' },
        },
        [NotificationChannel.EMAIL]: {
          subject: 'You were mentioned by {{senderName}}',
          title: 'You were mentioned in a conversation',
          body: 'Hi {{recipientName}},\n\n{{senderName}} mentioned you in {{conversationName}}:\n\n"{{messageContent}}"\n\nView conversation at {{chatUrl}}',
          variables: { recipientName: 'string', senderName: 'string', conversationName: 'string', messageContent: 'string', chatUrl: 'string' },
        },
      },
      [NotificationType.CONVERSATION_INVITE]: {
        [NotificationChannel.PUSH]: {
          title: 'Invited to {{conversationName}}',
          body: '{{inviterName}} invited you to join the conversation',
          variables: { conversationName: 'string', inviterName: 'string' },
        },
        [NotificationChannel.EMAIL]: {
          subject: 'Invitation to join {{conversationName}}',
          title: 'You\'ve been invited to a conversation',
          body: 'Hi {{recipientName}},\n\n{{inviterName}} has invited you to join "{{conversationName}}".\n\nJoin the conversation at {{chatUrl}}',
          variables: { recipientName: 'string', inviterName: 'string', conversationName: 'string', chatUrl: 'string' },
        },
      },
      [NotificationType.USER_JOINED]: {
        [NotificationChannel.PUSH]: {
          title: '{{userName}} joined {{conversationName}}',
          body: 'New member in the conversation',
          variables: { userName: 'string', conversationName: 'string' },
        },
      },
      [NotificationType.USER_LEFT]: {
        [NotificationChannel.PUSH]: {
          title: '{{userName}} left {{conversationName}}',
          body: 'Member left the conversation',
          variables: { userName: 'string', conversationName: 'string' },
        },
      },
      [NotificationType.MESSAGE_REACTION]: {
        [NotificationChannel.PUSH]: {
          title: '{{userName}} reacted to your message',
          body: '{{reaction}} {{messagePreview}}',
          variables: { userName: 'string', reaction: 'string', messagePreview: 'string' },
        },
      },
      [NotificationType.SYSTEM_ANNOUNCEMENT]: {
        [NotificationChannel.PUSH]: {
          title: 'System Announcement',
          body: '{{announcementText}}',
          variables: { announcementText: 'string' },
        },
        [NotificationChannel.EMAIL]: {
          subject: 'System Announcement',
          title: 'Important System Update',
          body: 'Hi {{recipientName}},\n\n{{announcementText}}\n\nBest regards,\nThe ChemChat Team',
          variables: { recipientName: 'string', announcementText: 'string' },
        },
      },
    };

    const typeTemplates = templates[type];
    if (!typeTemplates) {
      return {
        title: 'Notification',
        body: 'You have a new notification',
        variables: {},
      };
    }

    const channelTemplate = typeTemplates[channel];
    if (!channelTemplate) {
      // Fallback to push template
      const fallback = typeTemplates[NotificationChannel.PUSH];
      return fallback || {
        title: 'Notification',
        body: 'You have a new notification',
        variables: {},
      };
    }

    return channelTemplate;
  }
}
