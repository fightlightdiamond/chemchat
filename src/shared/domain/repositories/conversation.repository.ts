import { Conversation } from '../entities/conversation.entity';
import { ConversationType } from '../value-objects/conversation-type.vo';
import {
  BaseRepository,
  PaginationOptions,
  PaginatedResult,
} from './base.repository';

export interface ConversationRepository extends BaseRepository<Conversation> {
  /**
   * Find conversations by owner ID
   */
  findByOwnerId(
    ownerId: string,
    options?: PaginationOptions,
  ): Promise<PaginatedResult<Conversation>>;

  /**
   * Find conversations by type
   */
  findByType(
    type: ConversationType,
    options?: PaginationOptions,
  ): Promise<PaginatedResult<Conversation>>;

  /**
   * Find conversations that a user is a member of
   */
  findByMemberId(
    userId: string,
    options?: PaginationOptions,
  ): Promise<PaginatedResult<Conversation>>;

  /**
   * Find conversations by user ID (alias for findByMemberId)
   */
  findByUserId(
    userId: string,
    options?: PaginationOptions,
    includeArchived?: boolean,
  ): Promise<PaginatedResult<Conversation>>;

  /**
   * Find direct message conversation between two users
   */
  findDirectMessage(
    userId1: string,
    userId2: string,
  ): Promise<Conversation | null>;

  /**
   * Search conversations by name
   */
  searchByName(query: string, limit?: number): Promise<Conversation[]>;

  /**
   * Find conversations created after a specific date
   */
  findRecentConversations(
    since: Date,
    options?: PaginationOptions,
  ): Promise<PaginatedResult<Conversation>>;

  /**
   * Find active conversations (with recent messages)
   */
  findActiveConversations(
    userId: string,
    sinceHours?: number,
    options?: PaginationOptions,
  ): Promise<PaginatedResult<Conversation>>;

  /**
   * Get conversation statistics
   */
  getConversationStats(): Promise<ConversationStats>;

  /**
   * Find conversations with unread messages for a user
   */
  findWithUnreadMessages(
    userId: string,
    options?: PaginationOptions,
  ): Promise<PaginatedResult<Conversation>>;

  /**
   * Check if user has access to conversation
   */
  hasUserAccess(conversationId: string, userId: string): Promise<boolean>;

  /**
   * Find conversations by multiple IDs with member count
   */
  findByIdsWithMemberCount(
    conversationIds: string[],
  ): Promise<ConversationWithMemberCount[]>;

  /**
   * Update conversation's last activity timestamp
   */
  updateLastActivity(conversationId: string): Promise<void>;
}

export interface ConversationStats {
  totalConversations: number;
  directMessages: number;
  groupConversations: number;
  activeConversations: number; // conversations with activity in last 24h
  recentConversations: number; // conversations created in last 30 days
}

export interface ConversationWithMemberCount extends Conversation {
  memberCount: number;
}
