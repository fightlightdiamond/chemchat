import { Injectable, Logger } from '@nestjs/common';
import { MongoDBService } from '../../infrastructure/mongodb/mongodb.service';
import { 
  UserConversationMongoDB, 
  UserConversationCreateInput, 
  UserConversationUpdateInput, 
  UserConversationQuery,
  UserConversationSearchResult,
  UserConversationMongoDBHelper 
} from '../entities/user-conversation-mongodb.entity';
import { PaginatedResult } from './base.repository';

@Injectable()
export class UserConversationMongoDBRepository {
  private readonly logger = new Logger(UserConversationMongoDBRepository.name);

  constructor(private readonly mongoDB: MongoDBService) {}

  /**
   * Create a new user conversation
   */
  async create(input: UserConversationCreateInput): Promise<UserConversationMongoDB> {
    try {
      const userConversation = UserConversationMongoDBHelper.createUserConversation(input);
      
      // Validate user conversation
      const errors = UserConversationMongoDBHelper.validateUserConversation(userConversation);
      if (errors.length > 0) {
        throw new Error(`Validation failed: ${errors.join(', ')}`);
      }

      const collection = this.mongoDB.getCollection<UserConversationMongoDB>('user_conversations');
      await collection.insertOne(userConversation);
      
      this.logger.debug(`Created user conversation: ${input.userId} -> ${input.conversationId}`);
      return userConversation;
    } catch (error) {
      this.logger.error(`Failed to create user conversation: ${input.userId} -> ${input.conversationId}`, error);
      throw error;
    }
  }

  /**
   * Find user conversation by user and conversation IDs
   */
  async findByUserAndConversation(
    userId: string,
    conversationId: string,
    tenantId: string,
  ): Promise<UserConversationMongoDB | null> {
    try {
      const collection = this.mongoDB.getCollection<UserConversationMongoDB>('user_conversations');
      const userConversation = await collection.findOne({
        userId,
        conversationId,
        tenantId,
      });
      
      if (userConversation) {
        this.logger.debug(`Found user conversation: ${userId} -> ${conversationId}`);
      }
      
      return userConversation;
    } catch (error) {
      this.logger.error(`Failed to find user conversation: ${userId} -> ${conversationId}`, error);
      throw error;
    }
  }

  /**
   * Update user conversation
   */
  async update(
    userId: string,
    conversationId: string,
    tenantId: string,
    update: UserConversationUpdateInput,
  ): Promise<UserConversationMongoDB | null> {
    try {
      const collection = this.mongoDB.getCollection<UserConversationMongoDB>('user_conversations');
      
      // Get existing user conversation
      const existingUserConversation = await collection.findOne({
        userId,
        conversationId,
        tenantId,
      });
      
      if (!existingUserConversation) {
        this.logger.warn(`User conversation not found for update: ${userId} -> ${conversationId}`);
        return null;
      }

      // Update user conversation
      const updatedUserConversation = UserConversationMongoDBHelper.updateUserConversation(
        existingUserConversation,
        update,
      );
      
      // Replace in database
      await collection.replaceOne(
        { userId, conversationId, tenantId },
        updatedUserConversation,
      );
      
      this.logger.debug(`Updated user conversation: ${userId} -> ${conversationId}`);
      return updatedUserConversation;
    } catch (error) {
      this.logger.error(`Failed to update user conversation: ${userId} -> ${conversationId}`, error);
      throw error;
    }
  }

  /**
   * Delete user conversation
   */
  async delete(
    userId: string,
    conversationId: string,
    tenantId: string,
  ): Promise<boolean> {
    try {
      const collection = this.mongoDB.getCollection<UserConversationMongoDB>('user_conversations');
      
      const result = await collection.deleteOne({
        userId,
        conversationId,
        tenantId,
      });
      
      const success = result.deletedCount > 0;
      if (success) {
        this.logger.debug(`Deleted user conversation: ${userId} -> ${conversationId}`);
      } else {
        this.logger.warn(`User conversation not found for deletion: ${userId} -> ${conversationId}`);
      }
      
      return success;
    } catch (error) {
      this.logger.error(`Failed to delete user conversation: ${userId} -> ${conversationId}`, error);
      throw error;
    }
  }

  /**
   * Find user conversations by user ID
   */
  async findByUserId(
    userId: string,
    tenantId: string,
    options: {
      limit?: number;
      offset?: number;
      includeArchived?: boolean;
      includeMuted?: boolean;
      sortBy?: 'lastActivityAt' | 'lastMessageAt' | 'joinedAt' | 'unreadCount';
      sortOrder?: 'asc' | 'desc';
    } = {},
  ): Promise<PaginatedResult<UserConversationMongoDB>> {
    try {
      const {
        limit = 50,
        offset = 0,
        includeArchived = false,
        includeMuted = true,
        sortBy = 'lastActivityAt',
        sortOrder = 'desc',
      } = options;

      const collection = this.mongoDB.getCollection<UserConversationMongoDB>('user_conversations');
      
      // Build filter
      const filter: any = {
        userId,
        tenantId,
        isActive: true,
      };
      
      if (!includeArchived) {
        filter.isArchived = false;
      }
      
      if (!includeMuted) {
        filter.isMuted = false;
      }

      // Build sort
      const sort: any = {};
      sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

      // Execute query
      const [userConversations, total] = await Promise.all([
        collection
          .find(filter)
          .sort(sort)
          .skip(offset)
          .limit(limit)
          .toArray(),
        collection.countDocuments(filter),
      ]);

      const hasNext = offset + userConversations.length < total;
      const hasPrevious = offset > 0;

      this.logger.debug(`Found ${userConversations.length} user conversations for user: ${userId}`);

      return {
        data: userConversations,
        total,
        hasNext,
        hasPrevious,
      };
    } catch (error) {
      this.logger.error(`Failed to find user conversations for user: ${userId}`, error);
      throw error;
    }
  }

  /**
   * Find user conversations by conversation ID
   */
  async findByConversationId(
    conversationId: string,
    tenantId: string,
    options: {
      limit?: number;
      offset?: number;
      includeInactive?: boolean;
    } = {},
  ): Promise<PaginatedResult<UserConversationMongoDB>> {
    try {
      const {
        limit = 100,
        offset = 0,
        includeInactive = false,
      } = options;

      const collection = this.mongoDB.getCollection<UserConversationMongoDB>('user_conversations');
      
      // Build filter
      const filter: any = {
        conversationId,
        tenantId,
      };
      
      if (!includeInactive) {
        filter.isActive = true;
      }

      // Execute query
      const [userConversations, total] = await Promise.all([
        collection
          .find(filter)
          .sort({ joinedAt: 1 })
          .skip(offset)
          .limit(limit)
          .toArray(),
        collection.countDocuments(filter),
      ]);

      const hasNext = offset + userConversations.length < total;
      const hasPrevious = offset > 0;

      this.logger.debug(`Found ${userConversations.length} user conversations for conversation: ${conversationId}`);

      return {
        data: userConversations,
        total,
        hasNext,
        hasPrevious,
      };
    } catch (error) {
      this.logger.error(`Failed to find user conversations for conversation: ${conversationId}`, error);
      throw error;
    }
  }

  /**
   * Search user conversations
   */
  async search(query: UserConversationQuery): Promise<UserConversationSearchResult> {
    try {
      const startTime = Date.now();
      const collection = this.mongoDB.getCollection<UserConversationMongoDB>('user_conversations');
      
      // Build filter
      const filter: any = {};
      
      if (query.userId) {
        filter.userId = query.userId;
      }
      
      if (query.conversationId) {
        filter.conversationId = query.conversationId;
      }
      
      if (query.tenantId) {
        filter.tenantId = query.tenantId;
      }
      
      if (query.role) {
        filter.role = query.role;
      }
      
      if (query.isActive !== undefined) {
        filter.isActive = query.isActive;
      }
      
      if (query.isMuted !== undefined) {
        filter.isMuted = query.isMuted;
      }
      
      if (query.isPinned !== undefined) {
        filter.isPinned = query.isPinned;
      }
      
      if (query.isArchived !== undefined) {
        filter.isArchived = query.isArchived;
      }
      
      if (query.hasUnread !== undefined) {
        filter.unreadCount = query.hasUnread ? { $gt: 0 } : 0;
      }

      // Build sort
      const sort: any = {};
      const sortField = query.sortBy || 'lastActivityAt';
      const sortOrder = query.sortOrder === 'asc' ? 1 : -1;
      sort[sortField] = sortOrder;

      // Execute search
      const limit = query.limit || 20;
      const offset = query.offset || 0;

      const [userConversations, total] = await Promise.all([
        collection
          .find(filter)
          .sort(sort)
          .skip(offset)
          .limit(limit)
          .toArray(),
        collection.countDocuments(filter),
      ]);

      const searchTime = Date.now() - startTime;
      const hasMore = offset + userConversations.length < total;
      const hasPrevious = offset > 0;

      // Generate facets if needed
      let facets;
      if (query.userId) {
        facets = await this.generateFacets(filter, collection);
      }

      this.logger.debug(`Search completed in ${searchTime}ms, found ${userConversations.length} user conversations`);

      return {
        userConversations,
        total,
        hasMore,
        hasPrevious,
        searchTime,
        facets,
      };
    } catch (error) {
      this.logger.error('Failed to search user conversations', error);
      throw error;
    }
  }

  /**
   * Get unread conversations for user
   */
  async getUnreadConversations(
    userId: string,
    tenantId: string,
    limit: number = 20,
  ): Promise<UserConversationMongoDB[]> {
    try {
      const collection = this.mongoDB.getCollection<UserConversationMongoDB>('user_conversations');
      
      const userConversations = await collection
        .find({
          userId,
          tenantId,
          isActive: true,
          isArchived: false,
          unreadCount: { $gt: 0 },
        })
        .sort({ lastMessageAt: -1 })
        .limit(limit)
        .toArray();

      this.logger.debug(`Found ${userConversations.length} unread conversations for user: ${userId}`);

      return userConversations;
    } catch (error) {
      this.logger.error(`Failed to get unread conversations for user: ${userId}`, error);
      throw error;
    }
  }

  /**
   * Get pinned conversations for user
   */
  async getPinnedConversations(
    userId: string,
    tenantId: string,
  ): Promise<UserConversationMongoDB[]> {
    try {
      const collection = this.mongoDB.getCollection<UserConversationMongoDB>('user_conversations');
      
      const userConversations = await collection
        .find({
          userId,
          tenantId,
          isActive: true,
          isArchived: false,
          isPinned: true,
        })
        .sort({ lastActivityAt: -1 })
        .toArray();

      this.logger.debug(`Found ${userConversations.length} pinned conversations for user: ${userId}`);

      return userConversations;
    } catch (error) {
      this.logger.error(`Failed to get pinned conversations for user: ${userId}`, error);
      throw error;
    }
  }

  /**
   * Add unread message to user conversation
   */
  async addUnreadMessage(
    userId: string,
    conversationId: string,
    tenantId: string,
    message: {
      messageId: string;
      sequenceNumber: number;
      createdAt: Date;
      senderId: string;
      senderName: string;
    },
  ): Promise<UserConversationMongoDB | null> {
    try {
      const collection = this.mongoDB.getCollection<UserConversationMongoDB>('user_conversations');
      
      // Get existing user conversation
      const existingUserConversation = await collection.findOne({
        userId,
        conversationId,
        tenantId,
      });
      
      if (!existingUserConversation) {
        this.logger.warn(`User conversation not found for adding unread message: ${userId} -> ${conversationId}`);
        return null;
      }

      // Skip if user is the sender
      if (existingUserConversation.userId === message.senderId) {
        return existingUserConversation;
      }

      // Add unread message
      const updatedUserConversation = UserConversationMongoDBHelper.addUnreadMessage(
        existingUserConversation,
        message,
      );
      
      // Replace in database
      await collection.replaceOne(
        { userId, conversationId, tenantId },
        updatedUserConversation,
      );
      
      this.logger.debug(`Added unread message to user conversation: ${userId} -> ${conversationId}`);
      return updatedUserConversation;
    } catch (error) {
      this.logger.error(`Failed to add unread message to user conversation: ${userId} -> ${conversationId}`, error);
      throw error;
    }
  }

  /**
   * Mark messages as read for user conversation
   */
  async markMessagesAsRead(
    userId: string,
    conversationId: string,
    tenantId: string,
    upToSequence: number,
  ): Promise<UserConversationMongoDB | null> {
    try {
      const collection = this.mongoDB.getCollection<UserConversationMongoDB>('user_conversations');
      
      // Get existing user conversation
      const existingUserConversation = await collection.findOne({
        userId,
        conversationId,
        tenantId,
      });
      
      if (!existingUserConversation) {
        this.logger.warn(`User conversation not found for marking as read: ${userId} -> ${conversationId}`);
        return null;
      }

      // Mark messages as read
      const updatedUserConversation = UserConversationMongoDBHelper.markMessagesAsRead(
        existingUserConversation,
        upToSequence,
      );
      
      // Replace in database
      await collection.replaceOne(
        { userId, conversationId, tenantId },
        updatedUserConversation,
      );
      
      this.logger.debug(`Marked messages as read for user conversation: ${userId} -> ${conversationId}`);
      return updatedUserConversation;
    } catch (error) {
      this.logger.error(`Failed to mark messages as read for user conversation: ${userId} -> ${conversationId}`, error);
      throw error;
    }
  }

  /**
   * Update conversation details for all user conversations
   */
  async updateConversationDetails(
    conversationId: string,
    tenantId: string,
    conversationDetails: {
      title?: string;
      description?: string;
      avatar?: string;
      type?: 'direct' | 'group' | 'channel';
    },
  ): Promise<number> {
    try {
      const collection = this.mongoDB.getCollection<UserConversationMongoDB>('user_conversations');
      
      const updateFields: any = {
        lastUpdatedAt: new Date(),
        version: { $inc: 1 },
      };
      
      if (conversationDetails.title) {
        updateFields.conversationTitle = conversationDetails.title;
      }
      if (conversationDetails.description !== undefined) {
        updateFields.conversationDescription = conversationDetails.description;
      }
      if (conversationDetails.avatar !== undefined) {
        updateFields.conversationAvatar = conversationDetails.avatar;
      }
      if (conversationDetails.type) {
        updateFields.conversationType = conversationDetails.type;
      }

      const result = await collection.updateMany(
        { conversationId, tenantId },
        { $set: updateFields },
      );
      
      this.logger.debug(`Updated conversation details for ${result.modifiedCount} user conversations: ${conversationId}`);
      return result.modifiedCount;
    } catch (error) {
      this.logger.error(`Failed to update conversation details: ${conversationId}`, error);
      throw error;
    }
  }

  /**
   * Get user conversation statistics
   */
  async getStatistics(tenantId?: string): Promise<{
    totalUserConversations: number;
    userConversationsByRole: Array<{ role: string; count: number }>;
    userConversationsByType: Array<{ type: string; count: number }>;
    averageUnreadCount: number;
    totalUnreadMessages: number;
  }> {
    try {
      const collection = this.mongoDB.getCollection<UserConversationMongoDB>('user_conversations');
      
      const filter: any = { isActive: true };
      if (tenantId) {
        filter.tenantId = tenantId;
      }

      const [
        totalUserConversations,
        userConversationsByRole,
        userConversationsByType,
        averageUnreadCount,
        totalUnreadMessages,
      ] = await Promise.all([
        collection.countDocuments(filter),
        this.getUserConversationsByRole(filter, collection),
        this.getUserConversationsByType(filter, collection),
        this.getAverageUnreadCount(filter, collection),
        this.getTotalUnreadMessages(filter, collection),
      ]);

      return {
        totalUserConversations,
        userConversationsByRole,
        userConversationsByType,
        averageUnreadCount,
        totalUnreadMessages,
      };
    } catch (error) {
      this.logger.error('Failed to get user conversation statistics', error);
      throw error;
    }
  }

  /**
   * Generate facets for search results
   */
  private async generateFacets(filter: any, collection: any): Promise<any> {
    try {
      const [roles, types, statuses] = await Promise.all([
        collection.aggregate([
          { $match: filter },
          { $group: { _id: '$role', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 10 },
        ]).toArray(),
        
        collection.aggregate([
          { $match: filter },
          { $group: { _id: '$conversationType', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 10 },
        ]).toArray(),
        
        collection.aggregate([
          { $match: filter },
          { $group: { 
            _id: { 
              isMuted: '$isMuted', 
              isPinned: '$isPinned', 
              isArchived: '$isArchived' 
            }, 
            count: { $sum: 1 } 
          } },
          { $sort: { count: -1 } },
          { $limit: 10 },
        ]).toArray(),
      ]);

      return {
        roles: roles.map(item => ({ role: item._id, count: item.count })),
        types: types.map(item => ({ type: item._id, count: item.count })),
        statuses: statuses.map(item => ({ 
          status: `${item._id.isMuted ? 'muted' : 'unmuted'}-${item._id.isPinned ? 'pinned' : 'unpinned'}-${item._id.isArchived ? 'archived' : 'active'}`, 
          count: item.count 
        })),
      };
    } catch (error) {
      this.logger.error('Failed to generate facets', error);
      return undefined;
    }
  }

  /**
   * Get user conversations by role
   */
  private async getUserConversationsByRole(filter: any, collection: any): Promise<Array<{ role: string; count: number }>> {
    const result = await collection.aggregate([
      { $match: filter },
      { $group: { _id: '$role', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]).toArray();

    return result.map(item => ({ role: item._id, count: item.count }));
  }

  /**
   * Get user conversations by type
   */
  private async getUserConversationsByType(filter: any, collection: any): Promise<Array<{ type: string; count: number }>> {
    const result = await collection.aggregate([
      { $match: filter },
      { $group: { _id: '$conversationType', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]).toArray();

    return result.map(item => ({ type: item._id, count: item.count }));
  }

  /**
   * Get average unread count
   */
  private async getAverageUnreadCount(filter: any, collection: any): Promise<number> {
    const result = await collection.aggregate([
      { $match: filter },
      { $group: { _id: null, avgUnread: { $avg: '$unreadCount' } } },
    ]).toArray();

    return result.length > 0 ? result[0].avgUnread : 0;
  }

  /**
   * Get total unread messages
   */
  private async getTotalUnreadMessages(filter: any, collection: any): Promise<number> {
    const result = await collection.aggregate([
      { $match: filter },
      { $group: { _id: null, totalUnread: { $sum: '$unreadCount' } } },
    ]).toArray();

    return result.length > 0 ? result[0].totalUnread : 0;
  }
}