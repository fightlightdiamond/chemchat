import { Injectable, Logger } from '@nestjs/common';
import { MongoDBService } from '../../infrastructure/mongodb/mongodb.service';
import { 
  ConversationMongoDB, 
  ConversationCreateInput, 
  ConversationUpdateInput, 
  ConversationQuery,
  ConversationSearchResult,
  ConversationMongoDBHelper 
} from '../entities/conversation-mongodb.entity';
import { PaginatedResult } from './base.repository';

@Injectable()
export class ConversationMongoDBRepository {
  private readonly logger = new Logger(ConversationMongoDBRepository.name);

  constructor(private readonly mongoDB: MongoDBService) {}

  /**
   * Create a new conversation
   */
  async create(input: ConversationCreateInput): Promise<ConversationMongoDB> {
    try {
      const conversation = ConversationMongoDBHelper.createConversation(input);
      
      // Validate conversation
      const errors = ConversationMongoDBHelper.validateConversation(conversation);
      if (errors.length > 0) {
        throw new Error(`Validation failed: ${errors.join(', ')}`);
      }

      const collection = this.mongoDB.getCollection<ConversationMongoDB>('conversations');
      await collection.insertOne(conversation);
      
      this.logger.debug(`Created conversation: ${conversation.conversationId}`);
      return conversation;
    } catch (error) {
      this.logger.error(`Failed to create conversation: ${input.conversationId}`, error);
      throw error;
    }
  }

  /**
   * Find conversation by ID
   */
  async findById(conversationId: string): Promise<ConversationMongoDB | null> {
    try {
      const collection = this.mongoDB.getCollection<ConversationMongoDB>('conversations');
      const conversation = await collection.findOne({ conversationId });
      
      if (conversation) {
        this.logger.debug(`Found conversation: ${conversationId}`);
      }
      
      return conversation;
    } catch (error) {
      this.logger.error(`Failed to find conversation: ${conversationId}`, error);
      throw error;
    }
  }

  /**
   * Update conversation
   */
  async update(conversationId: string, update: ConversationUpdateInput): Promise<ConversationMongoDB | null> {
    try {
      const collection = this.mongoDB.getCollection<ConversationMongoDB>('conversations');
      
      // Get existing conversation
      const existingConversation = await collection.findOne({ conversationId });
      if (!existingConversation) {
        this.logger.warn(`Conversation not found for update: ${conversationId}`);
        return null;
      }

      // Update conversation
      const updatedConversation = ConversationMongoDBHelper.updateConversation(existingConversation, update);
      
      // Replace in database
      await collection.replaceOne({ conversationId }, updatedConversation);
      
      this.logger.debug(`Updated conversation: ${conversationId}`);
      return updatedConversation;
    } catch (error) {
      this.logger.error(`Failed to update conversation: ${conversationId}`, error);
      throw error;
    }
  }

  /**
   * Delete conversation (soft delete)
   */
  async delete(conversationId: string): Promise<boolean> {
    try {
      const collection = this.mongoDB.getCollection<ConversationMongoDB>('conversations');
      
      const result = await collection.updateOne(
        { conversationId },
        {
          $set: {
            isActive: false,
            isArchived: true,
            archivedAt: new Date(),
            version: { $inc: 1 },
            lastUpdatedAt: new Date(),
          },
        }
      );
      
      const success = result.modifiedCount > 0;
      if (success) {
        this.logger.debug(`Deleted conversation: ${conversationId}`);
      } else {
        this.logger.warn(`Conversation not found for deletion: ${conversationId}`);
      }
      
      return success;
    } catch (error) {
      this.logger.error(`Failed to delete conversation: ${conversationId}`, error);
      throw error;
    }
  }

  /**
   * Find conversations by user
   */
  async findByUserId(
    userId: string,
    tenantId: string,
    options: {
      limit?: number;
      offset?: number;
      includeArchived?: boolean;
      sortBy?: 'updatedAt' | 'createdAt' | 'lastMessageAt';
      sortOrder?: 'asc' | 'desc';
    } = {},
  ): Promise<PaginatedResult<ConversationMongoDB>> {
    try {
      const {
        limit = 50,
        offset = 0,
        includeArchived = false,
        sortBy = 'updatedAt',
        sortOrder = 'desc',
      } = options;

      const collection = this.mongoDB.getCollection<ConversationMongoDB>('conversations');
      
      // Build filter
      const filter: any = {
        'members.userId': userId,
        tenantId,
        'members.isActive': true,
      };
      
      if (!includeArchived) {
        filter.isArchived = false;
      }

      // Build sort
      const sort: any = {};
      if (sortBy === 'lastMessageAt' && sortOrder === 'desc') {
        sort['lastMessage.createdAt'] = -1;
      } else {
        sort[sortBy] = sortOrder === 'asc' ? 1 : -1;
      }

      // Execute query
      const [conversations, total] = await Promise.all([
        collection
          .find(filter)
          .sort(sort)
          .skip(offset)
          .limit(limit)
          .toArray(),
        collection.countDocuments(filter),
      ]);

      const hasNext = offset + conversations.length < total;
      const hasPrevious = offset > 0;

      this.logger.debug(`Found ${conversations.length} conversations for user: ${userId}`);

      return {
        data: conversations,
        total,
        hasNext,
        hasPrevious,
      };
    } catch (error) {
      this.logger.error(`Failed to find conversations for user: ${userId}`, error);
      throw error;
    }
  }

  /**
   * Search conversations
   */
  async search(query: ConversationQuery): Promise<ConversationSearchResult> {
    try {
      const startTime = Date.now();
      const collection = this.mongoDB.getCollection<ConversationMongoDB>('conversations');
      
      // Build filter
      const filter: any = {};
      
      if (query.tenantId) {
        filter.tenantId = query.tenantId;
      }
      
      if (query.type) {
        filter.type = query.type;
      }
      
      if (query.createdBy) {
        filter.createdBy = query.createdBy;
      }
      
      if (query.memberUserId) {
        filter['members.userId'] = query.memberUserId;
      }
      
      if (query.isActive !== undefined) {
        filter.isActive = query.isActive;
      }
      
      if (query.isArchived !== undefined) {
        filter.isArchived = query.isArchived;
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
      if (query.searchText && query.sortBy === 'updatedAt') {
        sort = { score: { $meta: 'textScore' } };
      } else {
        const sortField = query.sortBy || 'updatedAt';
        const sortOrder = query.sortOrder === 'asc' ? 1 : -1;
        sort[sortField] = sortOrder;
      }

      // Execute search
      const limit = query.limit || 20;
      const offset = query.offset || 0;

      const [conversations, total] = await Promise.all([
        collection
          .find(filter)
          .sort(sort)
          .skip(offset)
          .limit(limit)
          .toArray(),
        collection.countDocuments(filter),
      ]);

      const searchTime = Date.now() - startTime;
      const hasMore = offset + conversations.length < total;
      const hasPrevious = offset > 0;

      // Generate facets if needed
      let facets;
      if (query.searchText) {
        facets = await this.generateFacets(filter, collection);
      }

      this.logger.debug(`Search completed in ${searchTime}ms, found ${conversations.length} conversations`);

      return {
        conversations,
        total,
        hasMore,
        hasPrevious,
        searchTime,
        facets,
      };
    } catch (error) {
      this.logger.error('Failed to search conversations', error);
      throw error;
    }
  }

  /**
   * Get conversations with unread messages
   */
  async getUnreadConversations(
    userId: string,
    tenantId: string,
    limit: number = 20,
  ): Promise<ConversationMongoDB[]> {
    try {
      const collection = this.mongoDB.getCollection<ConversationMongoDB>('conversations');
      
      const conversations = await collection
        .find({
          'members.userId': userId,
          tenantId,
          'members.isActive': true,
          isActive: true,
          isArchived: false,
          unreadCount: { $gt: 0 },
        })
        .sort({ updatedAt: -1 })
        .limit(limit)
        .toArray();

      this.logger.debug(`Found ${conversations.length} unread conversations for user: ${userId}`);

      return conversations;
    } catch (error) {
      this.logger.error(`Failed to get unread conversations for user: ${userId}`, error);
      throw error;
    }
  }

  /**
   * Add member to conversation
   */
  async addMember(
    conversationId: string,
    member: {
      userId: string;
      username: string;
      displayName: string;
      avatar?: string;
      role: 'admin' | 'member' | 'moderator';
    },
  ): Promise<ConversationMongoDB | null> {
    try {
      const collection = this.mongoDB.getCollection<ConversationMongoDB>('conversations');
      
      // Get existing conversation
      const existingConversation = await collection.findOne({ conversationId });
      if (!existingConversation) {
        this.logger.warn(`Conversation not found for adding member: ${conversationId}`);
        return null;
      }

      // Add member
      const updatedConversation = ConversationMongoDBHelper.addMember(existingConversation, {
        ...member,
        joinedAt: new Date(),
        lastReadAt: undefined,
        lastReadSequence: undefined,
        isActive: true,
        permissions: {
          canSendMessages: true,
          canEditMessages: member.role === 'admin' || member.role === 'moderator',
          canDeleteMessages: member.role === 'admin',
          canInviteMembers: member.role === 'admin' || member.role === 'moderator',
          canRemoveMembers: member.role === 'admin',
          canManageSettings: member.role === 'admin',
        },
      });
      
      // Replace in database
      await collection.replaceOne({ conversationId }, updatedConversation);
      
      this.logger.debug(`Added member to conversation: ${conversationId}`);
      return updatedConversation;
    } catch (error) {
      this.logger.error(`Failed to add member to conversation: ${conversationId}`, error);
      throw error;
    }
  }

  /**
   * Remove member from conversation
   */
  async removeMember(conversationId: string, userId: string): Promise<ConversationMongoDB | null> {
    try {
      const collection = this.mongoDB.getCollection<ConversationMongoDB>('conversations');
      
      // Get existing conversation
      const existingConversation = await collection.findOne({ conversationId });
      if (!existingConversation) {
        this.logger.warn(`Conversation not found for removing member: ${conversationId}`);
        return null;
      }

      // Remove member
      const updatedConversation = ConversationMongoDBHelper.removeMember(existingConversation, userId);
      
      // Replace in database
      await collection.replaceOne({ conversationId }, updatedConversation);
      
      this.logger.debug(`Removed member from conversation: ${conversationId}`);
      return updatedConversation;
    } catch (error) {
      this.logger.error(`Failed to remove member from conversation: ${conversationId}`, error);
      throw error;
    }
  }

  /**
   * Update member's read position
   */
  async updateMemberReadPosition(
    conversationId: string,
    userId: string,
    lastReadAt: Date,
    lastReadSequence: number,
  ): Promise<ConversationMongoDB | null> {
    try {
      const collection = this.mongoDB.getCollection<ConversationMongoDB>('conversations');
      
      // Get existing conversation
      const existingConversation = await collection.findOne({ conversationId });
      if (!existingConversation) {
        this.logger.warn(`Conversation not found for updating read position: ${conversationId}`);
        return null;
      }

      // Update read position
      const updatedConversation = ConversationMongoDBHelper.updateMemberReadPosition(
        existingConversation,
        userId,
        lastReadAt,
        lastReadSequence,
      );
      
      // Replace in database
      await collection.replaceOne({ conversationId }, updatedConversation);
      
      this.logger.debug(`Updated read position for conversation: ${conversationId}`);
      return updatedConversation;
    } catch (error) {
      this.logger.error(`Failed to update read position for conversation: ${conversationId}`, error);
      throw error;
    }
  }

  /**
   * Update last message
   */
  async updateLastMessage(
    conversationId: string,
    lastMessage: ConversationMongoDB['lastMessage'],
  ): Promise<ConversationMongoDB | null> {
    try {
      const collection = this.mongoDB.getCollection<ConversationMongoDB>('conversations');
      
      // Get existing conversation
      const existingConversation = await collection.findOne({ conversationId });
      if (!existingConversation) {
        this.logger.warn(`Conversation not found for updating last message: ${conversationId}`);
        return null;
      }

      // Update last message
      const updatedConversation = ConversationMongoDBHelper.updateLastMessage(existingConversation, lastMessage);
      
      // Replace in database
      await collection.replaceOne({ conversationId }, updatedConversation);
      
      this.logger.debug(`Updated last message for conversation: ${conversationId}`);
      return updatedConversation;
    } catch (error) {
      this.logger.error(`Failed to update last message for conversation: ${conversationId}`, error);
      throw error;
    }
  }

  /**
   * Get conversation statistics
   */
  async getStatistics(tenantId?: string): Promise<{
    totalConversations: number;
    conversationsByType: Array<{ type: string; count: number }>;
    conversationsByDay: Array<{ date: string; count: number }>;
    topCreators: Array<{ createdBy: string; count: number }>;
    averageMembersPerConversation: number;
  }> {
    try {
      const collection = this.mongoDB.getCollection<ConversationMongoDB>('conversations');
      
      const filter: any = { isActive: true };
      if (tenantId) {
        filter.tenantId = tenantId;
      }

      const [
        totalConversations,
        conversationsByType,
        conversationsByDay,
        topCreators,
        averageMembers,
      ] = await Promise.all([
        collection.countDocuments(filter),
        this.getConversationsByType(filter, collection),
        this.getConversationsByDay(filter, collection),
        this.getTopCreators(filter, collection),
        this.getAverageMembersPerConversation(filter, collection),
      ]);

      return {
        totalConversations,
        conversationsByType,
        conversationsByDay,
        topCreators,
        averageMembersPerConversation: averageMembers,
      };
    } catch (error) {
      this.logger.error('Failed to get conversation statistics', error);
      throw error;
    }
  }

  /**
   * Generate facets for search results
   */
  private async generateFacets(filter: any, collection: any): Promise<any> {
    try {
      const [types, creators, tags] = await Promise.all([
        collection.aggregate([
          { $match: filter },
          { $group: { _id: '$type', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 10 },
        ]).toArray(),
        
        collection.aggregate([
          { $match: filter },
          { $group: { _id: '$createdBy', count: { $sum: 1 } } },
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
        types: types.map(item => ({ type: item._id, count: item.count })),
        creators: creators.map(item => ({ createdBy: item._id, count: item.count })),
        tags: tags.map(item => ({ tag: item._id, count: item.count })),
      };
    } catch (error) {
      this.logger.error('Failed to generate facets', error);
      return undefined;
    }
  }

  /**
   * Get conversations by type
   */
  private async getConversationsByType(filter: any, collection: any): Promise<Array<{ type: string; count: number }>> {
    const result = await collection.aggregate([
      { $match: filter },
      { $group: { _id: '$type', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]).toArray();

    return result.map(item => ({ type: item._id, count: item.count }));
  }

  /**
   * Get conversations by day
   */
  private async getConversationsByDay(filter: any, collection: any): Promise<Array<{ date: string; count: number }>> {
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
   * Get top creators
   */
  private async getTopCreators(filter: any, collection: any): Promise<Array<{ createdBy: string; count: number }>> {
    const result = await collection.aggregate([
      { $match: filter },
      { $group: { _id: '$createdBy', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]).toArray();

    return result.map(item => ({ createdBy: item._id, count: item.count }));
  }

  /**
   * Get average members per conversation
   */
  private async getAverageMembersPerConversation(filter: any, collection: any): Promise<number> {
    const result = await collection.aggregate([
      { $match: filter },
      { $group: { _id: null, avgMembers: { $avg: '$memberCount' } } },
    ]).toArray();

    return result.length > 0 ? result[0].avgMembers : 0;
  }
}