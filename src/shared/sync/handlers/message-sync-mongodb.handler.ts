import { Injectable, Logger } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { MessageCreatedEvent } from '../../chat/events/message-created.event';
import { MessageEditedEvent } from '../../chat/events/message-edited.event';
import { MessageDeletedEvent } from '../../chat/events/message-deleted.event';
import { MongoDBService } from '../../infrastructure/mongodb/mongodb.service';
import { WriteDatabaseService } from '../../infrastructure/database/write-database.service';
import { MessageMongoDBRepository } from '../../domain/repositories/message-mongodb.repository';
import { MessageCreateInput } from '../../domain/entities/message-mongodb.entity';

/**
 * Event Handler for Message Created Event - Sync to MongoDB
 */
@Injectable()
@EventsHandler(MessageCreatedEvent)
export class MessageCreatedMongoDBSyncHandler implements IEventHandler<MessageCreatedEvent> {
  private readonly logger = new Logger(MessageCreatedMongoDBSyncHandler.name);

  constructor(
    private readonly mongoDB: MongoDBService,
    private readonly writeDB: WriteDatabaseService,
    private readonly messageRepository: MessageMongoDBRepository,
  ) {}

  async handle(event: MessageCreatedEvent): Promise<void> {
    try {
      this.logger.debug(`Syncing message created event to MongoDB: ${event.messageId}`);

      // Get additional data from PostgreSQL
      const [message, sender, conversation] = await Promise.all([
        this.writeDB.message.findUnique({
          where: { id: event.messageId },
        }),
        this.writeDB.user.findUnique({
          where: { id: event.senderId },
          select: { username: true, displayName: true, avatar: true },
        }),
        this.writeDB.conversation.findUnique({
          where: { id: event.conversationId },
          select: { title: true, type: true },
        }),
      ]);

      if (!message || !sender || !conversation) {
        this.logger.warn(`Missing data for message sync: ${event.messageId}`, {
          hasMessage: !!message,
          hasSender: !!sender,
          hasConversation: !!conversation,
        });
        return;
      }

      // Create MongoDB document input
      const messageInput: MessageCreateInput = {
        messageId: event.messageId,
        conversationId: event.conversationId,
        senderId: event.senderId,
        senderName: sender.displayName || sender.username,
        senderAvatar: sender.avatar,
        senderUsername: sender.username,
        content: {
          text: event.content.getText() || '',
          attachments: event.content.getAttachments() || [],
          metadata: event.content.getMetadata() || {},
        },
        messageType: message.messageType.toLowerCase() as any,
        sequenceNumber: Number(event.sequenceNumber),
        tenantId: event.tenantId || 'default',
        conversationTitle: conversation.title,
        conversationType: conversation.type.toLowerCase() as any,
        clientMessageId: message.clientMessageId,
      };

      // Create message in MongoDB
      await this.messageRepository.create(messageInput);

      // Update conversation summary in MongoDB
      await this.updateConversationSummary(event.conversationId, messageInput);

      this.logger.debug(`Successfully synced message to MongoDB: ${event.messageId}`);
    } catch (error) {
      this.logger.error(`Failed to sync message to MongoDB: ${event.messageId}`, error);
      
      // Don't throw error to avoid breaking the event processing chain
      // Instead, log the error and potentially queue for retry
      await this.handleSyncError(event.messageId, error);
    }
  }

  /**
   * Update conversation summary in MongoDB
   */
  private async updateConversationSummary(
    conversationId: string,
    messageInput: MessageCreateInput,
  ): Promise<void> {
    try {
      const collection = this.mongoDB.getCollection('conversations');
      
      await collection.updateOne(
        { conversationId },
        {
          $set: {
            updatedAt: new Date(),
            lastMessage: {
              messageId: messageInput.messageId,
              content: messageInput.content.text,
              senderId: messageInput.senderId,
              senderName: messageInput.senderName,
              createdAt: new Date(),
              sequenceNumber: messageInput.sequenceNumber,
            },
          },
          $inc: {
            totalMessages: 1,
            unreadCount: 1,
          },
        },
        { upsert: true }
      );
    } catch (error) {
      this.logger.error(`Failed to update conversation summary: ${conversationId}`, error);
    }
  }

  /**
   * Handle sync errors
   */
  private async handleSyncError(messageId: string, error: Error): Promise<void> {
    try {
      // Log to error collection for retry processing
      const errorCollection = this.mongoDB.getCollection('sync_errors');
      
      await errorCollection.insertOne({
        messageId,
        eventType: 'MessageCreated',
        error: error.message,
        stack: error.stack,
        retryCount: 0,
        createdAt: new Date(),
        status: 'pending',
      });
    } catch (logError) {
      this.logger.error(`Failed to log sync error: ${messageId}`, logError);
    }
  }
}

/**
 * Event Handler for Message Edited Event - Sync to MongoDB
 */
@Injectable()
@EventsHandler(MessageEditedEvent)
export class MessageEditedMongoDBSyncHandler implements IEventHandler<MessageEditedEvent> {
  private readonly logger = new Logger(MessageEditedMongoDBSyncHandler.name);

  constructor(
    private readonly messageRepository: MessageMongoDBRepository,
  ) {}

  async handle(event: MessageEditedEvent): Promise<void> {
    try {
      this.logger.debug(`Syncing message edited event to MongoDB: ${event.messageId}`);

      // Update message in MongoDB
      const updatedMessage = await this.messageRepository.update(event.messageId, {
        content: {
          text: event.content,
          attachments: [],
          metadata: {},
        },
        editedAt: new Date(),
        isEdited: true,
      });

      if (updatedMessage) {
        this.logger.debug(`Successfully synced message edit to MongoDB: ${event.messageId}`);
      } else {
        this.logger.warn(`Message not found for edit sync: ${event.messageId}`);
      }
    } catch (error) {
      this.logger.error(`Failed to sync message edit to MongoDB: ${event.messageId}`, error);
    }
  }
}

/**
 * Event Handler for Message Deleted Event - Sync to MongoDB
 */
@Injectable()
@EventsHandler(MessageDeletedEvent)
export class MessageDeletedMongoDBSyncHandler implements IEventHandler<MessageDeletedEvent> {
  private readonly logger = new Logger(MessageDeletedMongoDBSyncHandler.name);

  constructor(
    private readonly messageRepository: MessageMongoDBRepository,
  ) {}

  async handle(event: MessageDeletedEvent): Promise<void> {
    try {
      this.logger.debug(`Syncing message deleted event to MongoDB: ${event.messageId}`);

      // Soft delete message in MongoDB
      const success = await this.messageRepository.delete(event.messageId);

      if (success) {
        this.logger.debug(`Successfully synced message deletion to MongoDB: ${event.messageId}`);
      } else {
        this.logger.warn(`Message not found for deletion sync: ${event.messageId}`);
      }
    } catch (error) {
      this.logger.error(`Failed to sync message deletion to MongoDB: ${event.messageId}`, error);
    }
  }
}

/**
 * Sync Error Recovery Service
 */
@Injectable()
export class MessageSyncRecoveryService {
  private readonly logger = new Logger(MessageSyncRecoveryService.name);

  constructor(
    private readonly mongoDB: MongoDBService,
    private readonly writeDB: WriteDatabaseService,
    private readonly messageRepository: MessageMongoDBRepository,
  ) {}

  /**
   * Process failed sync operations
   */
  async processFailedSyncs(): Promise<void> {
    try {
      const errorCollection = this.mongoDB.getCollection('sync_errors');
      
      // Get pending errors with retry count < 5
      const failedSyncs = await errorCollection.find({
        status: 'pending',
        retryCount: { $lt: 5 },
      }).limit(100).toArray();

      this.logger.log(`Processing ${failedSyncs.length} failed syncs`);

      for (const failedSync of failedSyncs) {
        try {
          await this.retrySync(failedSync);
          
          // Mark as processed
          await errorCollection.updateOne(
            { _id: failedSync._id },
            { $set: { status: 'processed', processedAt: new Date() } }
          );
        } catch (error) {
          // Increment retry count
          await errorCollection.updateOne(
            { _id: failedSync._id },
            { 
              $inc: { retryCount: 1 },
              $set: { 
                lastError: error.message,
                lastRetryAt: new Date(),
              }
            }
          );
          
          this.logger.error(`Failed to retry sync: ${failedSync.messageId}`, error);
        }
      }
    } catch (error) {
      this.logger.error('Failed to process failed syncs', error);
    }
  }

  /**
   * Retry a specific sync operation
   */
  private async retrySync(failedSync: any): Promise<void> {
    const { messageId, eventType } = failedSync;

    switch (eventType) {
      case 'MessageCreated':
        await this.retryMessageCreated(messageId);
        break;
      case 'MessageEdited':
        await this.retryMessageEdited(messageId);
        break;
      case 'MessageDeleted':
        await this.retryMessageDeleted(messageId);
        break;
      default:
        this.logger.warn(`Unknown event type for retry: ${eventType}`);
    }
  }

  /**
   * Retry message created sync
   */
  private async retryMessageCreated(messageId: string): Promise<void> {
    // Get message from PostgreSQL
    const message = await this.writeDB.message.findUnique({
      where: { id: messageId },
      include: {
        sender: {
          select: { username: true, displayName: true, avatar: true },
        },
        conversation: {
          select: { title: true, type: true },
        },
      },
    });

    if (!message) {
      throw new Error(`Message not found in PostgreSQL: ${messageId}`);
    }

    // Check if already exists in MongoDB
    const existingMessage = await this.messageRepository.findById(messageId);
    if (existingMessage) {
      this.logger.debug(`Message already exists in MongoDB: ${messageId}`);
      return;
    }

    // Create message input
    const messageInput: MessageCreateInput = {
      messageId: message.id,
      conversationId: message.conversationId,
      senderId: message.senderId || '',
      senderName: message.sender?.displayName || message.sender?.username || 'Unknown',
      senderAvatar: message.sender?.avatar,
      senderUsername: message.sender?.username,
      content: {
        text: typeof message.content === 'string' ? message.content : JSON.stringify(message.content),
        attachments: [],
        metadata: {},
      },
      messageType: message.messageType.toLowerCase() as any,
      sequenceNumber: Number(message.sequenceNumber),
      tenantId: message.tenantId || 'default',
      conversationTitle: message.conversation?.title || 'Unknown',
      conversationType: message.conversation?.type?.toLowerCase() as any || 'group',
      clientMessageId: message.clientMessageId,
    };

    // Create in MongoDB
    await this.messageRepository.create(messageInput);
  }

  /**
   * Retry message edited sync
   */
  private async retryMessageEdited(messageId: string): Promise<void> {
    // Get updated message from PostgreSQL
    const message = await this.writeDB.message.findUnique({
      where: { id: messageId },
    });

    if (!message) {
      throw new Error(`Message not found in PostgreSQL: ${messageId}`);
    }

    // Update in MongoDB
    await this.messageRepository.update(messageId, {
      content: {
        text: typeof message.content === 'string' ? message.content : JSON.stringify(message.content),
        attachments: [],
        metadata: {},
      },
      editedAt: message.editedAt,
      isEdited: message.editedAt !== null,
    });
  }

  /**
   * Retry message deleted sync
   */
  private async retryMessageDeleted(messageId: string): Promise<void> {
    // Get message from PostgreSQL
    const message = await this.writeDB.message.findUnique({
      where: { id: messageId },
    });

    if (!message) {
      throw new Error(`Message not found in PostgreSQL: ${messageId}`);
    }

    // Delete in MongoDB
    await this.messageRepository.delete(messageId);
  }

  /**
   * Get sync statistics
   */
  async getSyncStatistics(): Promise<{
    totalErrors: number;
    pendingErrors: number;
    processedErrors: number;
    errorsByType: Array<{ eventType: string; count: number }>;
  }> {
    try {
      const errorCollection = this.mongoDB.getCollection('sync_errors');
      
      const [totalErrors, pendingErrors, processedErrors, errorsByType] = await Promise.all([
        errorCollection.countDocuments(),
        errorCollection.countDocuments({ status: 'pending' }),
        errorCollection.countDocuments({ status: 'processed' }),
        errorCollection.aggregate([
          { $group: { _id: '$eventType', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
        ]).toArray(),
      ]);

      return {
        totalErrors,
        pendingErrors,
        processedErrors,
        errorsByType: errorsByType.map(item => ({ 
          eventType: item._id, 
          count: item.count 
        })),
      };
    } catch (error) {
      this.logger.error('Failed to get sync statistics', error);
      throw error;
    }
  }
}