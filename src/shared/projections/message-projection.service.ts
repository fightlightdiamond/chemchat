import { Injectable, Logger } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { MessageCreatedEvent } from '../../chat/events/message-created.event';
import { MessageEditedEvent } from '../../chat/events/message-edited.event';
import { MessageDeletedEvent } from '../../chat/events/message-deleted.event';
import { ReadDatabaseService } from '../infrastructure/database/read-database.service';

export interface MessageProjection {
  id: string;
  conversationId: string;
  senderId: string | null;
  content: string;
  messageType: string;
  sequenceNumber: bigint;
  createdAt: Date;
  editedAt: Date | null;
  deletedAt: Date | null;
  tenantId: string;
  // Denormalized fields for better query performance
  senderName: string;
  conversationTitle: string;
  isEdited: boolean;
  isDeleted: boolean;
}

export interface ConversationProjection {
  id: string;
  title: string;
  type: string;
  lastMessageId: string | null;
  lastMessageContent: string | null;
  lastMessageAt: Date | null;
  lastMessageSenderId: string | null;
  lastMessageSenderName: string | null;
  memberCount: number;
  unreadCount: number;
  tenantId: string;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class MessageProjectionService {
  private readonly logger = new Logger(MessageProjectionService.name);

  constructor(private readonly readDatabase: ReadDatabaseService) {}

  /**
   * Create or update message projection
   */
  async upsertMessageProjection(projection: MessageProjection): Promise<void> {
    await this.readDatabase.messageProjection.upsert({
      where: { id: projection.id },
      create: {
        id: projection.id,
        conversationId: projection.conversationId,
        senderId: projection.senderId,
        content: projection.content,
        messageType: projection.messageType,
        sequenceNumber: projection.sequenceNumber,
        createdAt: projection.createdAt,
        editedAt: projection.editedAt,
        deletedAt: projection.deletedAt,
        tenantId: projection.tenantId,
        senderName: projection.senderName,
        conversationTitle: projection.conversationTitle,
        isEdited: projection.isEdited,
        isDeleted: projection.isDeleted,
      },
      update: {
        content: projection.content,
        editedAt: projection.editedAt,
        deletedAt: projection.deletedAt,
        senderName: projection.senderName,
        conversationTitle: projection.conversationTitle,
        isEdited: projection.isEdited,
        isDeleted: projection.isDeleted,
      },
    });
  }

  /**
   * Update conversation projection
   */
  async updateConversationProjection(projection: ConversationProjection): Promise<void> {
    await this.readDatabase.conversationProjection.upsert({
      where: { id: projection.id },
      create: {
        id: projection.id,
        title: projection.title,
        type: projection.type,
        lastMessageId: projection.lastMessageId,
        lastMessageContent: projection.lastMessageContent,
        lastMessageAt: projection.lastMessageAt,
        lastMessageSenderId: projection.lastMessageSenderId,
        lastMessageSenderName: projection.lastMessageSenderName,
        memberCount: projection.memberCount,
        unreadCount: projection.unreadCount,
        tenantId: projection.tenantId,
        createdAt: projection.createdAt,
        updatedAt: projection.updatedAt,
      },
      update: {
        title: projection.title,
        lastMessageId: projection.lastMessageId,
        lastMessageContent: projection.lastMessageContent,
        lastMessageAt: projection.lastMessageAt,
        lastMessageSenderId: projection.lastMessageSenderId,
        lastMessageSenderName: projection.lastMessageSenderName,
        memberCount: projection.memberCount,
        unreadCount: projection.unreadCount,
        updatedAt: projection.updatedAt,
      },
    });
  }

  /**
   * Get message projection by ID
   */
  async getMessageProjection(messageId: string): Promise<MessageProjection | null> {
    const projection = await this.readDatabase.messageProjection.findUnique({
      where: { id: messageId },
    });

    return projection ? {
      id: projection.id,
      conversationId: projection.conversationId,
      senderId: projection.senderId,
      content: projection.content,
      messageType: projection.messageType,
      sequenceNumber: projection.sequenceNumber,
      createdAt: projection.createdAt,
      editedAt: projection.editedAt,
      deletedAt: projection.deletedAt,
      tenantId: projection.tenantId,
      senderName: projection.senderName,
      conversationTitle: projection.conversationTitle,
      isEdited: projection.isEdited,
      isDeleted: projection.isDeleted,
    } : null;
  }

  /**
   * Get conversation projection by ID
   */
  async getConversationProjection(conversationId: string): Promise<ConversationProjection | null> {
    const projection = await this.readDatabase.conversationProjection.findUnique({
      where: { id: conversationId },
    });

    return projection ? {
      id: projection.id,
      title: projection.title,
      type: projection.type,
      lastMessageId: projection.lastMessageId,
      lastMessageContent: projection.lastMessageContent,
      lastMessageAt: projection.lastMessageAt,
      lastMessageSenderId: projection.lastMessageSenderId,
      lastMessageSenderName: projection.lastMessageSenderName,
      memberCount: projection.memberCount,
      unreadCount: projection.unreadCount,
      tenantId: projection.tenantId,
      createdAt: projection.createdAt,
      updatedAt: projection.updatedAt,
    } : null;
  }

  /**
   * Get messages for conversation with pagination
   */
  async getConversationMessages(
    conversationId: string,
    limit: number = 50,
    offset: number = 0,
  ): Promise<MessageProjection[]> {
    const projections = await this.readDatabase.messageProjection.findMany({
      where: { 
        conversationId,
        isDeleted: false,
      },
      orderBy: { sequenceNumber: 'desc' },
      take: limit,
      skip: offset,
    });

    return projections.map(projection => ({
      id: projection.id,
      conversationId: projection.conversationId,
      senderId: projection.senderId,
      content: projection.content,
      messageType: projection.messageType,
      sequenceNumber: projection.sequenceNumber,
      createdAt: projection.createdAt,
      editedAt: projection.editedAt,
      deletedAt: projection.deletedAt,
      tenantId: projection.tenantId,
      senderName: projection.senderName,
      conversationTitle: projection.conversationTitle,
      isEdited: projection.isEdited,
      isDeleted: projection.isDeleted,
    }));
  }

  /**
   * Get user conversations
   */
  async getUserConversations(
    userId: string,
    tenantId: string,
    limit: number = 50,
    offset: number = 0,
  ): Promise<ConversationProjection[]> {
    // This would need a user-conversation mapping table
    const conversations = await this.readDatabase.conversationProjection.findMany({
      where: { 
        tenantId,
        // Add user membership filter here
      },
      orderBy: { lastMessageAt: 'desc' },
      take: limit,
      skip: offset,
    });

    return conversations.map(projection => ({
      id: projection.id,
      title: projection.title,
      type: projection.type,
      lastMessageId: projection.lastMessageId,
      lastMessageContent: projection.lastMessageContent,
      lastMessageAt: projection.lastMessageAt,
      lastMessageSenderId: projection.lastMessageSenderId,
      lastMessageSenderName: projection.lastMessageSenderName,
      memberCount: projection.memberCount,
      unreadCount: projection.unreadCount,
      tenantId: projection.tenantId,
      createdAt: projection.createdAt,
      updatedAt: projection.updatedAt,
    }));
  }
}

/**
 * Event Handler for Message Created Event
 */
@Injectable()
@EventsHandler(MessageCreatedEvent)
export class MessageCreatedProjectionHandler implements IEventHandler<MessageCreatedEvent> {
  private readonly logger = new Logger(MessageCreatedProjectionHandler.name);

  constructor(
    private readonly projectionService: MessageProjectionService,
    private readonly readDatabase: ReadDatabaseService,
  ) {}

  async handle(event: MessageCreatedEvent): Promise<void> {
    try {
      // Get additional data for projection
      const [sender, conversation] = await Promise.all([
        this.readDatabase.user.findUnique({
          where: { id: event.senderId },
          select: { displayName: true, username: true },
        }),
        this.readDatabase.conversation.findUnique({
          where: { id: event.conversationId },
          select: { title: true },
        }),
      ]);

      // Create message projection
      const messageProjection: MessageProjection = {
        id: event.messageId,
        conversationId: event.conversationId,
        senderId: event.senderId,
        content: event.content.getText() || '[Media]',
        messageType: 'text', // Extract from event
        sequenceNumber: event.sequenceNumber,
        createdAt: event.createdAt,
        editedAt: null,
        deletedAt: null,
        tenantId: event.tenantId || 'default',
        senderName: sender?.displayName || sender?.username || 'Unknown User',
        conversationTitle: conversation?.title || 'Unknown Conversation',
        isEdited: false,
        isDeleted: false,
      };

      await this.projectionService.upsertMessageProjection(messageProjection);

      // Update conversation projection
      const conversationProjection: ConversationProjection = {
        id: event.conversationId,
        title: conversation?.title || 'Unknown Conversation',
        type: 'group', // Extract from conversation
        lastMessageId: event.messageId,
        lastMessageContent: messageProjection.content,
        lastMessageAt: event.createdAt,
        lastMessageSenderId: event.senderId,
        lastMessageSenderName: messageProjection.senderName,
        memberCount: 0, // Calculate from members
        unreadCount: 0, // Calculate from unread counts
        tenantId: event.tenantId || 'default',
        createdAt: new Date(), // Get from conversation
        updatedAt: event.createdAt,
      };

      await this.projectionService.updateConversationProjection(conversationProjection);

      this.logger.debug(`Updated projections for message ${event.messageId}`);
    } catch (error) {
      this.logger.error(`Failed to update projections for message ${event.messageId}`, error);
      throw error;
    }
  }
}

/**
 * Event Handler for Message Edited Event
 */
@Injectable()
@EventsHandler(MessageEditedEvent)
export class MessageEditedProjectionHandler implements IEventHandler<MessageEditedEvent> {
  private readonly logger = new Logger(MessageEditedProjectionHandler.name);

  constructor(
    private readonly projectionService: MessageProjectionService,
  ) {}

  async handle(event: MessageEditedEvent): Promise<void> {
    try {
      const existingProjection = await this.projectionService.getMessageProjection(event.messageId);
      
      if (existingProjection) {
        const updatedProjection: MessageProjection = {
          ...existingProjection,
          content: event.content,
          editedAt: new Date(),
          isEdited: true,
        };

        await this.projectionService.upsertMessageProjection(updatedProjection);
        this.logger.debug(`Updated projection for edited message ${event.messageId}`);
      }
    } catch (error) {
      this.logger.error(`Failed to update projection for edited message ${event.messageId}`, error);
      throw error;
    }
  }
}

/**
 * Event Handler for Message Deleted Event
 */
@Injectable()
@EventsHandler(MessageDeletedEvent)
export class MessageDeletedProjectionHandler implements IEventHandler<MessageDeletedEvent> {
  private readonly logger = new Logger(MessageDeletedProjectionHandler.name);

  constructor(
    private readonly projectionService: MessageProjectionService,
  ) {}

  async handle(event: MessageDeletedEvent): Promise<void> {
    try {
      const existingProjection = await this.projectionService.getMessageProjection(event.messageId);
      
      if (existingProjection) {
        const updatedProjection: MessageProjection = {
          ...existingProjection,
          deletedAt: new Date(),
          isDeleted: true,
        };

        await this.projectionService.upsertMessageProjection(updatedProjection);
        this.logger.debug(`Updated projection for deleted message ${event.messageId}`);
      }
    } catch (error) {
      this.logger.error(`Failed to update projection for deleted message ${event.messageId}`, error);
      throw error;
    }
  }
}