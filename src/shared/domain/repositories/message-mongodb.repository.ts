import { Injectable, Logger } from '@nestjs/common';
import { MongoDBService } from '../../infrastructure/mongodb/mongodb.service';
import { 
  MessageMongoDB, 
  MessageCreateInput, 
  MessageUpdateInput, 
  MessageQuery,
  MessageSearchResult,
  MessageMongoDBHelper 
} from '../entities/message-mongodb.entity';
import { PaginatedResult } from './base.repository';

@Injectable()
export class MessageMongoDBRepository {
  private readonly logger = new Logger(MessageMongoDBRepository.name);

  constructor(private readonly mongoDB: MongoDBService) {}

  /**
   * Create a new message
   */
  async create(input: MessageCreateInput): Promise<MessageMongoDB> {
    try {
      const message = MessageMongoDBHelper.createMessage(input);
      
      // Validate message
      const errors = MessageMongoDBHelper.validateMessage(message);
      if (errors.length > 0) {
        throw new Error(`Validation failed: ${errors.join(', ')}`);
      }

      const collection = this.mongoDB.getCollection<MessageMongoDB>('messages');
      await collection.insertOne(message);
      
      this.logger.debug(`Created message: ${message.messageId}`);
      return message;
    } catch (error) {
      this.logger.error(`Failed to create message: ${input.messageId}`, error);
      throw error;
    }
  }

  /**
   * Create multiple messages in a transaction
   */
  async createMany(inputs: MessageCreateInput[]): Promise<MessageMongoDB[]> {
    try {
      const messages = inputs.map(input => MessageMongoDBHelper.createMessage(input));
      
      // Validate all messages
      for (const message of messages) {
        const errors = MessageMongoDBHelper.validateMessage(message);
        if (errors.length > 0) {
          throw new Error(`Validation failed for message ${message.messageId}: ${errors.join(', ')}`);
        }
      }

      const collection = this.mongoDB.getCollection<MessageMongoDB>('messages');
      await collection.insertMany(messages);
      
      this.logger.debug(`Created ${messages.length} messages`);
      return messages;
    } catch (error) {
      this.logger.error(`Failed to create ${inputs.length} messages`, error);
      throw error;
    }
  }

  /**
   * Find message by ID
   */
  async findById(messageId: string): Promise<MessageMongoDB | null> {
    try {
      const collection = this.mongoDB.getCollection<MessageMongoDB>('messages');
      const message = await collection.findOne({ messageId });
      
      if (message) {
        this.logger.debug(`Found message: ${messageId}`);
      }
      
      return message;
    } catch (error) {
      this.logger.error(`Failed to find message: ${messageId}`, error);
      throw error;
    }
  }

  /**
   * Find message by client message ID
   */
  async findByClientMessageId(clientMessageId: string): Promise<MessageMongoDB | null> {
    try {
      const collection = this.mongoDB.getCollection<MessageMongoDB>('messages');
      const message = await collection.findOne({ clientMessageId });
      
      if (message) {
        this.logger.debug(`Found message by client ID: ${clientMessageId}`);
      }
      
      return message;
    } catch (error) {
      this.logger.error(`Failed to find message by client ID: ${clientMessageId}`, error);
      throw error;
    }
  }

  /**
   * Update message
   */
  async update(messageId: string, update: MessageUpdateInput): Promise<MessageMongoDB | null> {
    try {
      const collection = this.mongoDB.getCollection<MessageMongoDB>('messages');
      
      // Get existing message
      const existingMessage = await collection.findOne({ messageId });
      if (!existingMessage) {
        this.logger.warn(`Message not found for update: ${messageId}`);
        return null;
      }

      // Update message
      const updatedMessage = MessageMongoDBHelper.updateMessage(existingMessage, update);
      
      // Replace in database
      await collection.replaceOne({ messageId }, updatedMessage);
      
      this.logger.debug(`Updated message: ${messageId}`);
      return updatedMessage;
    } catch (error) {
      this.logger.error(`Failed to update message: ${messageId}`, error);
      throw error;
    }
  }

  /**
   * Delete message (soft delete)
   */
  async delete(messageId: string): Promise<boolean> {
    try {
      const collection = this.mongoDB.getCollection<MessageMongoDB>('messages');
      
      const result = await collection.updateOne(
        { messageId },
        {
          $set: {
            deletedAt: new Date(),
            isDeleted: true,
            version: { $inc: 1 },
            lastUpdatedAt: new Date(),
          },
        }
      );
      
      const success = result.modifiedCount > 0;
      if (success) {
        this.logger.debug(`Deleted message: ${messageId}`);
      } else {
        this.logger.warn(`Message not found for deletion: ${messageId}`);
      }
      
      return success;
    } catch (error) {
      this.logger.error(`Failed to delete message: ${messageId}`, error);
      throw error;
    }
  }

  /**
   * Find messages by conversation with pagination
   */
  async findByConversation(
    conversationId: string,
    options: {
      limit?: number;
      beforeSequence?: number;
      afterSequence?: number;
      includeDeleted?: boolean;
      tenantId?: string;
    } = {},
  ): Promise<PaginatedResult<MessageMongoDB>> {
    try {
      const {
        limit = 50,
        beforeSequence,
        afterSequence,
        includeDeleted = false,
        tenantId,
      } = options;

      const collection = this.mongoDB.getCollection<MessageMongoDB>('messages');
      
      // Build filter
      const filter: any = { conversationId };
      
      if (!includeDeleted) {
        filter.deletedAt = null;
      }
      
      if (tenantId) {
        filter.tenantId = tenantId;
      }
      
      if (beforeSequence !== undefined) {
        filter.sequenceNumber = { $lt: beforeSequence };
      }
      
      if (afterSequence !== undefined) {
        filter.sequenceNumber = { $gt: afterSequence };
      }

      // Execute query
      const [messages, total] = await Promise.all([
        collection
          .find(filter)
          .sort({ sequenceNumber: -1 })
          .limit(limit)
          .toArray(),
        collection.countDocuments(filter),
      ]);

      const hasNext = messages.length === limit;
      const hasPrevious = beforeSequence !== undefined || afterSequence !== undefined;

      this.logger.debug(`Found ${messages.length} messages for conversation: ${conversationId}`);

      return {
        data: messages,
        total,
        hasNext,
        hasPrevious,
      };
    } catch (error) {
      this.logger.error(`Failed to find messages for conversation: ${conversationId}`, error);
      throw error;
    }
  }

  /**
   * Find messages by sender
   */
  async findBySender(
    senderId: string,
    options: {
      limit?: number;
      offset?: number;
      tenantId?: string;
      includeDeleted?: boolean;
    } = {},
  ): Promise<PaginatedResult<MessageMongoDB>> {
    try {
      const {
        limit = 50,
        offset = 0,
        tenantId,
        includeDeleted = false,
      } = options;

      const collection = this.mongoDB.getCollection<MessageMongoDB>('messages');
      
      // Build filter
      const filter: any = { senderId };
      
      if (!includeDeleted) {
        filter.deletedAt = null;
      }
      
      if (tenantId) {
        filter.tenantId = tenantId;
      }

      // Execute query
      const [messages, total] = await Promise.all([
        collection
          .find(filter)
          .sort({ createdAt: -1 })
          .skip(offset)
          .limit(limit)
          .toArray(),
        collection.countDocuments(filter),
      ]);

      const hasNext = offset + messages.length < total;
      const hasPrevious = offset > 0;

      this.logger.debug(`Found ${messages.length} messages for sender: ${senderId}`);

      return {
        data: messages,
        total,
        hasNext,
        hasPrevious,
      };
    } catch (error) {
      this.logger.error(`Failed to find messages for sender: ${senderId}`, error);
      throw error;
    }
  }

  /**
   * Search messages with full-text search
   */
  async search(query: MessageQuery): Promise<MessageSearchResult> {
    try {
      const startTime = Date.now();
      const collection = this.mongoDB.getCollection<MessageMongoDB>('messages');
      
      // Build filter
      const filter: any = {};
      
      if (query.conversationId) {
        filter.conversationId = query.conversationId;
      }
      
      if (query.senderId) {
        filter.senderId = query.senderId;
      }
      
      if (query.tenantId) {
        filter.tenantId = query.tenantId;
      }
      
      if (query.messageType) {
        filter.messageType = query.messageType;
      }
      
      if (query.isDeleted !== undefined) {
        filter.deletedAt = query.isDeleted ? { $ne: null } : null;
      }
      
      if (query.fromDate || query.toDate) {
        filter.createdAt = {};
        if (query.fromDate) {
          filter.createdAt.$gte = query.fromDate;
        }
        if (query.toDate) {
          filter.createdAt.$lte = query.toDate;
        }
      }
      
      if (query.tags && query.tags.length > 0) {
        filter.tags = { $in: query.tags };
      }

      // Add text search if provided
      if (query.searchText) {
        filter.$text = { $search: query.searchText };
      }

      // Build sort
      let sort: any = {};
      if (query.searchText && query.sortBy === 'relevance') {
        sort = { score: { $meta: 'textScore' } };
      } else {
        const sortField = query.sortBy === 'sequenceNumber' ? 'sequenceNumber' : 'createdAt';
        const sortOrder = query.sortOrder === 'asc' ? 1 : -1;
        sort[sortField] = sortOrder;
      }

      // Execute search
      const limit = query.limit || 20;
      const offset = query.offset || 0;

      const [messages, total] = await Promise.all([
        collection
          .find(filter)
          .sort(sort)
          .skip(offset)
          .limit(limit)
          .toArray(),
        collection.countDocuments(filter),
      ]);

      const searchTime = Date.now() - startTime;
      const hasMore = offset + messages.length < total;
      const hasPrevious = offset > 0;

      // Generate facets if needed
      let facets;
      if (query.searchText) {
        facets = await this.generateFacets(filter, collection);
      }

      this.logger.debug(`Search completed in ${searchTime}ms, found ${messages.length} messages`);

      return {
        messages,
        total,
        hasMore,
        hasPrevious,
        searchTime,
        facets,
      };
    } catch (error) {
      this.logger.error('Failed to search messages', error);
      throw error;
    }
  }

  /**
   * Get recent messages for a conversation
   */
  async getRecentMessages(
    conversationId: string,
    limit: number = 10,
    tenantId?: string,
  ): Promise<MessageMongoDB[]> {
    try {
      const collection = this.mongoDB.getCollection<MessageMongoDB>('messages');
      
      const filter: any = {
        conversationId,
        deletedAt: null,
      };
      
      if (tenantId) {
        filter.tenantId = tenantId;
      }

      const messages = await collection
        .find(filter)
        .sort({ sequenceNumber: -1 })
        .limit(limit)
        .toArray();

      this.logger.debug(`Found ${messages.length} recent messages for conversation: ${conversationId}`);

      return messages;
    } catch (error) {
      this.logger.error(`Failed to get recent messages for conversation: ${conversationId}`, error);
      throw error;
    }
  }

  /**
   * Add reaction to message
   */
  async addReaction(
    messageId: string,
    emoji: string,
    userId: string,
    userName: string,
  ): Promise<MessageMongoDB | null> {
    try {
      const collection = this.mongoDB.getCollection<MessageMongoDB>('messages');
      
      // Get existing message
      const existingMessage = await collection.findOne({ messageId });
      if (!existingMessage) {
        this.logger.warn(`Message not found for reaction: ${messageId}`);
        return null;
      }

      // Update message with reaction
      const updatedMessage = MessageMongoDBHelper.addReaction(
        existingMessage,
        emoji,
        userId,
        userName,
      );
      
      // Replace in database
      await collection.replaceOne({ messageId }, updatedMessage);
      
      this.logger.debug(`Added reaction to message: ${messageId}`);
      return updatedMessage;
    } catch (error) {
      this.logger.error(`Failed to add reaction to message: ${messageId}`, error);
      throw error;
    }
  }

  /**
   * Mark message as read
   */
  async markAsRead(
    messageId: string,
    userId: string,
    userName: string,
  ): Promise<MessageMongoDB | null> {
    try {
      const collection = this.mongoDB.getCollection<MessageMongoDB>('messages');
      
      // Get existing message
      const existingMessage = await collection.findOne({ messageId });
      if (!existingMessage) {
        this.logger.warn(`Message not found for read receipt: ${messageId}`);
        return null;
      }

      // Update message with read receipt
      const updatedMessage = MessageMongoDBHelper.markAsRead(
        existingMessage,
        userId,
        userName,
      );
      
      // Replace in database
      await collection.replaceOne({ messageId }, updatedMessage);
      
      this.logger.debug(`Marked message as read: ${messageId}`);
      return updatedMessage;
    } catch (error) {
      this.logger.error(`Failed to mark message as read: ${messageId}`, error);
      throw error;
    }
  }

  /**
   * Get message statistics
   */
  async getStatistics(tenantId?: string): Promise<{
    totalMessages: number;
    messagesByType: Array<{ type: string; count: number }>;
    messagesByDay: Array<{ date: string; count: number }>;
    topSenders: Array<{ senderId: string; senderName: string; count: number }>;
  }> {
    try {
      const collection = this.mongoDB.getCollection<MessageMongoDB>('messages');
      
      const filter: any = { deletedAt: null };
      if (tenantId) {
        filter.tenantId = tenantId;
      }

      const [
        totalMessages,
        messagesByType,
        messagesByDay,
        topSenders,
      ] = await Promise.all([
        collection.countDocuments(filter),
        this.getMessagesByType(filter, collection),
        this.getMessagesByDay(filter, collection),
        this.getTopSenders(filter, collection),
      ]);

      return {
        totalMessages,
        messagesByType,
        messagesByDay,
        topSenders,
      };
    } catch (error) {
      this.logger.error('Failed to get message statistics', error);
      throw error;
    }
  }

  /**
   * Generate facets for search results
   */
  private async generateFacets(filter: any, collection: any): Promise<any> {
    try {
      const [messageTypes, senders, tags] = await Promise.all([
        collection.aggregate([
          { $match: filter },
          { $group: { _id: '$messageType', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 10 },
        ]).toArray(),
        
        collection.aggregate([
          { $match: filter },
          { $group: { _id: { senderId: '$senderId', senderName: '$senderName' }, count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 10 },
        ]).toArray(),
        
        collection.aggregate([
          { $match: filter },
          { $unwind: '$tags' },
          { $group: { _id: '$tags', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 20 },
        ]).toArray(),
      ]);

      return {
        messageTypes: messageTypes.map(item => ({ type: item._id, count: item.count })),
        senders: senders.map(item => ({ 
          senderId: item._id.senderId, 
          senderName: item._id.senderName, 
          count: item.count 
        })),
        tags: tags.map(item => ({ tag: item._id, count: item.count })),
      };
    } catch (error) {
      this.logger.error('Failed to generate facets', error);
      return undefined;
    }
  }

  /**
   * Get messages by type
   */
  private async getMessagesByType(filter: any, collection: any): Promise<Array<{ type: string; count: number }>> {
    const result = await collection.aggregate([
      { $match: filter },
      { $group: { _id: '$messageType', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]).toArray();

    return result.map(item => ({ type: item._id, count: item.count }));
  }

  /**
   * Get messages by day
   */
  private async getMessagesByDay(filter: any, collection: any): Promise<Array<{ date: string; count: number }>> {
    const result = await collection.aggregate([
      { $match: filter },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: -1 } },
      { $limit: 30 },
    ]).toArray();

    return result.map(item => ({ date: item._id, count: item.count }));
  }

  /**
   * Get top senders
   */
  private async getTopSenders(filter: any, collection: any): Promise<Array<{ senderId: string; senderName: string; count: number }>> {
    const result = await collection.aggregate([
      { $match: filter },
      { $group: { _id: { senderId: '$senderId', senderName: '$senderName' }, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]).toArray();

    return result.map(item => ({ 
      senderId: item._id.senderId, 
      senderName: item._id.senderName, 
      count: item.count 
    }));
  }
}