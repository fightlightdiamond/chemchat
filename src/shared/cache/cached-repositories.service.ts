import { Injectable, Logger } from '@nestjs/common';
import { RedisCacheService } from './redis-cache.service';
import { MessageMongoDBRepository } from '../domain/repositories/message-mongodb.repository';
import { ConversationMongoDBRepository } from '../domain/repositories/conversation-mongodb.repository';
import { UserConversationMongoDBRepository } from '../domain/repositories/user-conversation-mongodb.repository';
import { MessageMongoDB } from '../domain/entities/message-mongodb.entity';
import { ConversationMongoDB } from '../domain/entities/conversation-mongodb.entity';
import { UserConversationMongoDB } from '../domain/entities/user-conversation-mongodb.entity';
import { PaginatedResult } from '../domain/repositories/base.repository';

@Injectable()
export class CachedRepositoriesService {
  private readonly logger = new Logger(CachedRepositoriesService.name);

  constructor(
    private readonly cache: RedisCacheService,
    private readonly messageRepository: MessageMongoDBRepository,
    private readonly conversationRepository: ConversationMongoDBRepository,
    private readonly userConversationRepository: UserConversationMongoDBRepository,
  ) {}

  // Message caching methods

  /**
   * Get cached message by ID
   */
  async getCachedMessage(messageId: string): Promise<MessageMongoDB | null> {
    const cacheKey = `message:${messageId}`;
    
    try {
      // Try cache first
      let message = await this.cache.get<MessageMongoDB>(cacheKey);
      
      if (!message) {
        // Cache miss - get from database
        message = await this.messageRepository.findById(messageId);
        
        if (message) {
          // Cache for 1 hour
          await this.cache.set(cacheKey, message, { ttl: 3600 });
        }
      }
      
      return message;
    } catch (error) {
      this.logger.error(`Failed to get cached message: ${messageId}`, error);
      return await this.messageRepository.findById(messageId);
    }
  }

  /**
   * Get cached conversation messages
   */
  async getCachedConversationMessages(
    conversationId: string,
    options: {
      limit?: number;
      beforeSequence?: number;
      afterSequence?: number;
      includeDeleted?: boolean;
      tenantId?: string;
    } = {},
  ): Promise<PaginatedResult<MessageMongoDB>> {
    const cacheKey = `conversation:messages:${conversationId}:${options.limit || 50}:${options.beforeSequence || 'none'}:${options.afterSequence || 'none'}`;
    
    try {
      // Try cache first
      let result = await this.cache.get<PaginatedResult<MessageMongoDB>>(cacheKey);
      
      if (!result) {
        // Cache miss - get from database
        result = await this.messageRepository.findByConversation(conversationId, options);
        
        if (result && result.data.length > 0) {
          // Cache for 5 minutes
          await this.cache.set(cacheKey, result, { ttl: 300 });
        }
      }
      
      return result;
    } catch (error) {
      this.logger.error(`Failed to get cached conversation messages: ${conversationId}`, error);
      return await this.messageRepository.findByConversation(conversationId, options);
    }
  }

  /**
   * Invalidate message cache
   */
  async invalidateMessageCache(messageId: string, conversationId?: string): Promise<void> {
    try {
      const keysToDelete = [`message:${messageId}`];
      
      if (conversationId) {
        // Invalidate conversation message lists
        const pattern = `conversation:messages:${conversationId}:*`;
        const conversationKeys = await this.cache.keys(pattern);
        keysToDelete.push(...conversationKeys);
      }
      
      await this.cache.mdel(keysToDelete);
      this.logger.debug(`Invalidated message cache for: ${messageId}`);
    } catch (error) {
      this.logger.error(`Failed to invalidate message cache: ${messageId}`, error);
    }
  }

  // Conversation caching methods

  /**
   * Get cached conversation by ID
   */
  async getCachedConversation(conversationId: string): Promise<ConversationMongoDB | null> {
    const cacheKey = `conversation:${conversationId}`;
    
    try {
      // Try cache first
      let conversation = await this.cache.get<ConversationMongoDB>(cacheKey);
      
      if (!conversation) {
        // Cache miss - get from database
        conversation = await this.conversationRepository.findById(conversationId);
        
        if (conversation) {
          // Cache for 30 minutes
          await this.cache.set(cacheKey, conversation, { ttl: 1800 });
        }
      }
      
      return conversation;
    } catch (error) {
      this.logger.error(`Failed to get cached conversation: ${conversationId}`, error);
      return await this.conversationRepository.findById(conversationId);
    }
  }

  /**
   * Get cached user conversations
   */
  async getCachedUserConversations(
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
  ): Promise<PaginatedResult<ConversationMongoDB>> {
    const cacheKey = `user:conversations:${userId}:${tenantId}:${options.limit || 50}:${options.offset || 0}:${options.sortBy || 'lastActivityAt'}`;
    
    try {
      // Try cache first
      let result = await this.cache.get<PaginatedResult<ConversationMongoDB>>(cacheKey);
      
      if (!result) {
        // Cache miss - get from database
        result = await this.conversationRepository.findByUserId(userId, tenantId, options);
        
        if (result && result.data.length > 0) {
          // Cache for 10 minutes
          await this.cache.set(cacheKey, result, { ttl: 600 });
        }
      }
      
      return result;
    } catch (error) {
      this.logger.error(`Failed to get cached user conversations: ${userId}`, error);
      return await this.conversationRepository.findByUserId(userId, tenantId, options);
    }
  }

  /**
   * Invalidate conversation cache
   */
  async invalidateConversationCache(conversationId: string, userId?: string): Promise<void> {
    try {
      const keysToDelete = [`conversation:${conversationId}`];
      
      if (userId) {
        // Invalidate user conversation lists
        const pattern = `user:conversations:${userId}:*`;
        const userKeys = await this.cache.keys(pattern);
        keysToDelete.push(...userKeys);
      }
      
      await this.cache.mdel(keysToDelete);
      this.logger.debug(`Invalidated conversation cache for: ${conversationId}`);
    } catch (error) {
      this.logger.error(`Failed to invalidate conversation cache: ${conversationId}`, error);
    }
  }

  // User conversation caching methods

  /**
   * Get cached user conversation
   */
  async getCachedUserConversation(
    userId: string,
    conversationId: string,
    tenantId: string,
  ): Promise<UserConversationMongoDB | null> {
    const cacheKey = `user_conversation:${userId}:${conversationId}:${tenantId}`;
    
    try {
      // Try cache first
      let userConversation = await this.cache.get<UserConversationMongoDB>(cacheKey);
      
      if (!userConversation) {
        // Cache miss - get from database
        userConversation = await this.userConversationRepository.findByUserAndConversation(
          userId,
          conversationId,
          tenantId,
        );
        
        if (userConversation) {
          // Cache for 15 minutes
          await this.cache.set(cacheKey, userConversation, { ttl: 900 });
        }
      }
      
      return userConversation;
    } catch (error) {
      this.logger.error(`Failed to get cached user conversation: ${userId} -> ${conversationId}`, error);
      return await this.userConversationRepository.findByUserAndConversation(userId, conversationId, tenantId);
    }
  }

  /**
   * Get cached unread conversations
   */
  async getCachedUnreadConversations(
    userId: string,
    tenantId: string,
    limit: number = 20,
  ): Promise<UserConversationMongoDB[]> {
    const cacheKey = `user:unread_conversations:${userId}:${tenantId}:${limit}`;
    
    try {
      // Try cache first
      let conversations = await this.cache.get<UserConversationMongoDB[]>(cacheKey);
      
      if (!conversations) {
        // Cache miss - get from database
        conversations = await this.userConversationRepository.getUnreadConversations(userId, tenantId, limit);
        
        if (conversations.length > 0) {
          // Cache for 2 minutes (unread count changes frequently)
          await this.cache.set(cacheKey, conversations, { ttl: 120 });
        }
      }
      
      return conversations;
    } catch (error) {
      this.logger.error(`Failed to get cached unread conversations: ${userId}`, error);
      return await this.userConversationRepository.getUnreadConversations(userId, tenantId, limit);
    }
  }

  /**
   * Invalidate user conversation cache
   */
  async invalidateUserConversationCache(userId: string, conversationId?: string): Promise<void> {
    try {
      const keysToDelete = [];
      
      if (conversationId) {
        // Invalidate specific user conversation
        const pattern = `user_conversation:${userId}:${conversationId}:*`;
        const specificKeys = await this.cache.keys(pattern);
        keysToDelete.push(...specificKeys);
      } else {
        // Invalidate all user conversations
        const pattern = `user_conversation:${userId}:*`;
        const userKeys = await this.cache.keys(pattern);
        keysToDelete.push(...userKeys);
      }
      
      // Invalidate user conversation lists
      const listPattern = `user:conversations:${userId}:*`;
      const listKeys = await this.cache.keys(listPattern);
      keysToDelete.push(...listKeys);
      
      // Invalidate unread conversations
      const unreadPattern = `user:unread_conversations:${userId}:*`;
      const unreadKeys = await this.cache.keys(unreadPattern);
      keysToDelete.push(...unreadKeys);
      
      await this.cache.mdel(keysToDelete);
      this.logger.debug(`Invalidated user conversation cache for: ${userId}`);
    } catch (error) {
      this.logger.error(`Failed to invalidate user conversation cache: ${userId}`, error);
    }
  }

  // Search caching methods

  /**
   * Get cached search results
   */
  async getCachedSearchResults(
    query: string,
    type: 'messages' | 'conversations',
    options: any = {},
  ): Promise<any> {
    const cacheKey = `search:${type}:${Buffer.from(query).toString('base64')}:${JSON.stringify(options)}`;
    
    try {
      // Try cache first
      let results = await this.cache.get(cacheKey);
      
      if (!results) {
        // Cache miss - get from database
        if (type === 'messages') {
          results = await this.messageRepository.search(options);
        } else if (type === 'conversations') {
          results = await this.conversationRepository.search(options);
        }
        
        if (results) {
          // Cache for 5 minutes
          await this.cache.set(cacheKey, results, { ttl: 300 });
        }
      }
      
      return results;
    } catch (error) {
      this.logger.error(`Failed to get cached search results: ${query}`, error);
      return null;
    }
  }

  /**
   * Invalidate search cache
   */
  async invalidateSearchCache(query?: string): Promise<void> {
    try {
      const keysToDelete = [];
      
      if (query) {
        // Invalidate specific search results
        const encodedQuery = Buffer.from(query).toString('base64');
        const pattern = `search:*:${encodedQuery}:*`;
        const searchKeys = await this.cache.keys(pattern);
        keysToDelete.push(...searchKeys);
      } else {
        // Invalidate all search results
        const pattern = 'search:*';
        const allSearchKeys = await this.cache.keys(pattern);
        keysToDelete.push(...allSearchKeys);
      }
      
      await this.cache.mdel(keysToDelete);
      this.logger.debug(`Invalidated search cache${query ? ` for: ${query}` : ''}`);
    } catch (error) {
      this.logger.error(`Failed to invalidate search cache${query ? ` for: ${query}` : ''}`, error);
    }
  }

  // Cache warming methods

  /**
   * Warm cache for user
   */
  async warmUserCache(userId: string, tenantId: string): Promise<void> {
    try {
      this.logger.debug(`Warming cache for user: ${userId}`);
      
      // Warm user conversations
      await this.getCachedUserConversations(userId, tenantId);
      
      // Warm unread conversations
      await this.getCachedUnreadConversations(userId, tenantId);
      
      this.logger.debug(`Cache warmed for user: ${userId}`);
    } catch (error) {
      this.logger.error(`Failed to warm cache for user: ${userId}`, error);
    }
  }

  /**
   * Warm cache for conversation
   */
  async warmConversationCache(conversationId: string): Promise<void> {
    try {
      this.logger.debug(`Warming cache for conversation: ${conversationId}`);
      
      // Warm conversation details
      await this.getCachedConversation(conversationId);
      
      // Warm recent messages
      await this.getCachedConversationMessages(conversationId, { limit: 50 });
      
      this.logger.debug(`Cache warmed for conversation: ${conversationId}`);
    } catch (error) {
      this.logger.error(`Failed to warm cache for conversation: ${conversationId}`, error);
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): any {
    return this.cache.getStats();
  }

  /**
   * Clear all cache
   */
  async clearAllCache(): Promise<boolean> {
    try {
      return await this.cache.clear();
    } catch (error) {
      this.logger.error('Failed to clear all cache', error);
      return false;
    }
  }
}