import { Injectable, Logger } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { NotificationService } from '../services/notification.service';
import { NotificationPriority } from '../interfaces/notification.interface';

// Import existing events from the chat module
import { MessageCreatedEvent } from '../../chat/events/message-created.event';
import { ConversationCreatedEvent } from '../../chat/events/conversation-created.event';

@EventsHandler(MessageCreatedEvent)
@Injectable()
export class MessageCreatedNotificationHandler implements IEventHandler<MessageCreatedEvent> {
  private readonly logger = new Logger(MessageCreatedNotificationHandler.name);

  constructor(private readonly notificationService: NotificationService) {}

  async handle(event: MessageCreatedEvent): Promise<void> {
    try {
      // Access event properties safely - these may not exist on the event object yet
      const message = (event as any).message;
      const conversationId = (event as any).conversationId;
      const userId = (event as any).userId;
      const tenantId = (event as any).tenantId;

      // Get conversation members to send notifications
      // For now, we'll use a placeholder approach since we need the conversation service
      // In a real implementation, this would fetch conversation members
      const conversationMembers = await this.getConversationMembers(conversationId, tenantId);

      // Send notifications to all members except the sender
      const notificationPromises = conversationMembers
        .filter(member => member.userId !== userId)
        .map(async (member) => {
          // Determine notification type based on message content
          const isMention = this.isMentioned(message.content, member.username);
          const notificationType = isMention ? 'MENTION' : 'NEW_MESSAGE';

          await this.notificationService.sendNotification({
            userId: member.userId,
            tenantId,
            type: notificationType as any,
            title: isMention 
              ? `${message.senderName} mentioned you`
              : `New message from ${message.senderName}`,
            body: await this.getMessagePreview(message.content),
            data: {
              conversationId,
              messageId: message.id,
              senderName: message.senderName,
              senderUsername: message.senderUsername,
              messageContent: message.content,
              chatUrl: `${process.env.APP_URL || 'https://chemchat.com'}/chat/${conversationId}`,
            },
            priority: isMention ? NotificationPriority.HIGH : NotificationPriority.NORMAL,
          });
        });

      await Promise.allSettled(notificationPromises);
      
      this.logger.debug(`Sent notifications for message ${message.id} in conversation ${conversationId}`);
    } catch (error) {
      this.logger.error(`Failed to handle message created notification: ${error.message}`, error.stack);
    }
  }

  private async getConversationMembers(conversationId: string, tenantId?: string): Promise<any[]> {
    // Placeholder implementation - in real scenario, this would use ConversationService
    this.logger.debug(`Getting conversation members for ${conversationId} in tenant ${tenantId}`);
    // For now, return empty array to avoid errors
    return [];
  }

  private async handleMessageCreated(event: MessageCreatedEvent, conversationId: string, tenantId?: string): Promise<void> {
    // Placeholder implementation - in real scenario, this would use ConversationService
    this.logger.debug(`Handling message created event for conversation ${conversationId} in tenant ${tenantId}`, { event });
    // For now, do nothing to avoid errors
  }

  private isMentioned(content: string, username: string): boolean {
    const mentionPattern = new RegExp(`@${username}\\b`, 'i');
    return mentionPattern.test(content);
  }

  private async getMessagePreview(content: string, maxLength = 100): Promise<string> {
    if (content.length <= maxLength) {
      return content;
    }
    return content.substring(0, maxLength - 3) + '...';
  }
}

@EventsHandler(ConversationCreatedEvent)
@Injectable()
export class ConversationCreatedNotificationHandler implements IEventHandler<ConversationCreatedEvent> {
  private readonly logger = new Logger(ConversationCreatedNotificationHandler.name);

  constructor(private readonly notificationService: NotificationService) {}

  async handle(event: ConversationCreatedEvent): Promise<void> {
    try {
      // Access event properties safely - these may not exist on the event object yet
      const conversation = (event as any).conversation;
      const creatorId = (event as any).creatorId;
      const tenantId = (event as any).tenantId;

      // Send welcome notification to conversation creator
      await this.notificationService.sendNotification({
        userId: creatorId,
        tenantId,
        type: 'SYSTEM_ANNOUNCEMENT' as any,
        title: 'Conversation Created',
        body: `Your conversation "${conversation.name || 'New Chat'}" has been created successfully.`,
        data: {
          conversationId: conversation.id,
          conversationName: conversation.name,
          chatUrl: `${process.env.APP_URL || 'https://chemchat.com'}/chat/${conversation.id}`,
        },
        priority: NotificationPriority.LOW,
      });

      this.logger.debug(`Sent conversation created notification for ${conversation.id}`);
    } catch (error) {
      this.logger.error(`Failed to handle conversation created notification: ${error.message}`, error.stack);
    }
  }
}
