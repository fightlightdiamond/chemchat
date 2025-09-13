import { Injectable, Logger } from '@nestjs/common';
import { EventBus } from '@nestjs/cqrs';
import { NotificationService } from '../services/notification.service';
import { NotificationPreferenceService } from '../services/notification-preference.service';
import { NotificationPriority } from '../interfaces/notification.interface';

/**
 * Integration service to connect notifications with existing chat system
 * This service provides methods for other modules to trigger notifications
 */
@Injectable()
export class NotificationIntegrationService {
  private readonly logger = new Logger(NotificationIntegrationService.name);

  constructor(
    private readonly notificationService: NotificationService,
    private readonly preferenceService: NotificationPreferenceService,
    private readonly eventBus: EventBus,
  ) {}

  /**
   * Send notification when a new message is created
   */
  async notifyNewMessage(params: {
    recipientIds: string[];
    senderId: string;
    senderName: string;
    messageContent: string;
    conversationId: string;
    conversationName?: string;
    tenantId?: string;
  }): Promise<void> {
    const { recipientIds, senderId, senderName, messageContent, conversationId, conversationName, tenantId } = params;

    const notificationPromises = recipientIds
      .filter(id => id !== senderId) // Don't notify sender
      .map(async (recipientId) => {
        try {
          // Check if user mentioned
          const isMention = this.checkForMention(messageContent, recipientId);
          
          await this.notificationService.sendNotification({
            userId: recipientId,
            tenantId,
            type: isMention ? 'MENTION' : 'NEW_MESSAGE',
            title: isMention 
              ? `${senderName} mentioned you`
              : `New message from ${senderName}`,
            body: this.getMessagePreview(messageContent),
            data: {
              conversationId,
              conversationName,
              senderId,
              senderName,
              messageContent,
              chatUrl: this.buildChatUrl(conversationId),
            },
            priority: isMention ? NotificationPriority.HIGH : NotificationPriority.NORMAL,
          });
        } catch (error) {
          this.logger.error(`Failed to send notification to user ${recipientId}: ${error.message}`);
        }
      });

    await Promise.allSettled(notificationPromises);
  }

  /**
   * Send notification when user is invited to conversation
   */
  async notifyConversationInvite(params: {
    recipientId: string;
    inviterName: string;
    conversationId: string;
    conversationName: string;
    tenantId?: string;
  }): Promise<void> {
    const { recipientId, inviterName, conversationId, conversationName, tenantId } = params;

    await this.notificationService.sendNotification({
      userId: recipientId,
      tenantId,
      type: 'CONVERSATION_INVITE',
      title: `Invited to ${conversationName}`,
      body: `${inviterName} invited you to join the conversation`,
      data: {
        conversationId,
        conversationName,
        inviterName,
        chatUrl: this.buildChatUrl(conversationId),
      },
      priority: NotificationPriority.HIGH,
    });
  }

  /**
   * Send notification when user joins conversation
   */
  async notifyUserJoined(params: {
    conversationMemberIds: string[];
    joinedUserId: string;
    joinedUserName: string;
    conversationId: string;
    conversationName?: string;
    tenantId?: string;
  }): Promise<void> {
    const { conversationMemberIds, joinedUserId, joinedUserName, conversationId, conversationName, tenantId } = params;

    const notificationPromises = conversationMemberIds
      .filter(id => id !== joinedUserId) // Don't notify the user who joined
      .map(async (memberId) => {
        try {
          await this.notificationService.sendNotification({
            userId: memberId,
            tenantId,
            type: 'USER_JOINED',
            title: `${joinedUserName} joined ${conversationName || 'the conversation'}`,
            body: 'New member in the conversation',
            data: {
              conversationId,
              conversationName,
              joinedUserId,
              joinedUserName,
              chatUrl: this.buildChatUrl(conversationId),
            },
            priority: NotificationPriority.LOW,
          });
        } catch (error) {
          this.logger.error(`Failed to send user joined notification to ${memberId}: ${error.message}`);
        }
      });

    await Promise.allSettled(notificationPromises);
  }

  /**
   * Send notification when user reacts to message
   */
  async notifyMessageReaction(params: {
    messageAuthorId: string;
    reactorId: string;
    reactorName: string;
    reaction: string;
    messageContent: string;
    conversationId: string;
    tenantId?: string;
  }): Promise<void> {
    const { messageAuthorId, reactorId, reactorName, reaction, messageContent, conversationId, tenantId } = params;

    // Don't notify if user reacted to their own message
    if (messageAuthorId === reactorId) return;

    await this.notificationService.sendNotification({
      userId: messageAuthorId,
      tenantId,
      type: 'MESSAGE_REACTION',
      title: `${reactorName} reacted to your message`,
      body: `${reaction} ${this.getMessagePreview(messageContent)}`,
      data: {
        conversationId,
        reactorId,
        reactorName,
        reaction,
        messageContent,
        chatUrl: this.buildChatUrl(conversationId),
      },
      priority: NotificationPriority.LOW,
    });
  }

  /**
   * Send system announcement to users
   */
  async notifySystemAnnouncement(params: {
    recipientIds: string[];
    title: string;
    message: string;
    tenantId?: string;
    priority?: NotificationPriority;
  }): Promise<void> {
    const { recipientIds, title, message, tenantId, priority = NotificationPriority.NORMAL } = params;

    const notificationPromises = recipientIds.map(async (recipientId) => {
      try {
        await this.notificationService.sendNotification({
          userId: recipientId,
          tenantId,
          type: 'SYSTEM_ANNOUNCEMENT',
          title,
          body: message,
          data: {
            announcementText: message,
          },
          priority,
        });
      } catch (error) {
        this.logger.error(`Failed to send system announcement to ${recipientId}: ${error.message}`);
      }
    });

    await Promise.allSettled(notificationPromises);
  }

  /**
   * Register device token for push notifications
   */
  async registerDeviceForNotifications(params: {
    userId: string;
    deviceId: string;
    token: string;
    platform: 'IOS' | 'ANDROID' | 'WEB';
    appVersion?: string;
    tenantId?: string;
  }): Promise<void> {
    await this.preferenceService.registerDeviceToken({
      userId: params.userId,
      tenantId: params.tenantId,
      deviceId: params.deviceId,
      token: params.token,
      platform: params.platform as any,
      appVersion: params.appVersion,
    });
  }

  /**
   * Update user notification preferences
   */
  async updateNotificationPreferences(
    userId: string,
    preferences: {
      pushEnabled?: boolean;
      emailEnabled?: boolean;
      mentionNotifications?: boolean;
      dmNotifications?: boolean;
      groupNotifications?: boolean;
      quietHoursEnabled?: boolean;
      quietHoursStart?: string;
      quietHoursEnd?: string;
      timezone?: string;
    },
    tenantId?: string,
  ): Promise<void> {
    await this.preferenceService.updateUserPreferences(userId, preferences, tenantId);
  }

  /**
   * Get user notification preferences
   */
  async getUserNotificationPreferences(userId: string, tenantId?: string) {
    return this.preferenceService.getUserPreferences(userId, tenantId);
  }

  private checkForMention(content: string, userId: string): boolean {
    // Simple mention detection - in real implementation, this would be more sophisticated
    // and might include username lookup
    const mentionPattern = new RegExp(`@${userId}\\b|@\\w+`, 'i');
    return mentionPattern.test(content);
  }

  private getMessagePreview(content: string, maxLength: number = 100): string {
    if (content.length <= maxLength) {
      return content;
    }
    return content.substring(0, maxLength - 3) + '...';
  }

  private buildChatUrl(conversationId: string): string {
    const baseUrl = process.env.APP_URL || 'https://chemchat.com';
    return `${baseUrl}/chat/${conversationId}`;
  }
}
