import { ConversationMember } from '../entities/conversation-member.entity';
import { ConversationRole } from '../value-objects/conversation-role.vo';
import {
  BaseRepository,
  PaginationOptions,
  PaginatedResult,
} from './base.repository';

export interface ConversationMemberRepository
  extends BaseRepository<ConversationMember, string> {
  /**
   * Find member by conversation and user ID
   */
  findByConversationAndUser(
    conversationId: string,
    userId: string,
  ): Promise<ConversationMember | null>;

  /**
   * Find all members of a conversation
   */
  findByConversationId(
    conversationId: string,
    options?: PaginationOptions,
  ): Promise<PaginatedResult<ConversationMember>>;

  /**
   * Find all conversations a user is a member of
   */
  findByUserId(
    userId: string,
    options?: PaginationOptions,
  ): Promise<PaginatedResult<ConversationMember>>;

  /**
   * Find members by role in a conversation
   */
  findByRole(
    conversationId: string,
    role: ConversationRole,
    options?: PaginationOptions,
  ): Promise<PaginatedResult<ConversationMember>>;

  /**
   * Find conversation owners
   */
  findOwners(conversationId: string): Promise<ConversationMember[]>;

  /**
   * Find conversation admins
   */
  findAdmins(conversationId: string): Promise<ConversationMember[]>;

  /**
   * Get member count for a conversation
   */
  getMemberCount(conversationId: string): Promise<number>;

  /**
   * Get member count by role
   */
  getMemberCountByRole(
    conversationId: string,
    role: ConversationRole,
  ): Promise<number>;

  /**
   * Check if user is member of conversation
   */
  isMember(conversationId: string, userId: string): Promise<boolean>;

  /**
   * Check if user has specific role in conversation
   */
  hasRole(
    conversationId: string,
    userId: string,
    role: ConversationRole,
  ): Promise<boolean>;

  /**
   * Check if user can perform action (based on role permissions)
   */
  canPerformAction(
    conversationId: string,
    userId: string,
    action: string,
  ): Promise<boolean>;

  /**
   * Add member to conversation
   */
  addMember(
    conversationId: string,
    userId: string,
    role: ConversationRole,
  ): Promise<ConversationMember>;

  /**
   * Remove member from conversation
   */
  removeMember(conversationId: string, userId: string): Promise<void>;

  /**
   * Update member role
   */
  updateMemberRole(
    conversationId: string,
    userId: string,
    newRole: ConversationRole,
  ): Promise<ConversationMember>;

  /**
   * Update last read message for member
   */
  updateLastRead(
    conversationId: string,
    userId: string,
    messageId: string,
    sequenceNumber: bigint,
  ): Promise<ConversationMember>;

  /**
   * Find members with unread messages
   */
  findMembersWithUnreadMessages(
    conversationId: string,
    latestSequence: bigint,
  ): Promise<ConversationMember[]>;

  /**
   * Get conversation members with their unread counts
   */
  findMembersWithUnreadCounts(
    conversationId: string,
    latestSequence: bigint,
  ): Promise<MemberWithUnreadCount[]>;

  /**
   * Find recently joined members
   */
  findRecentMembers(
    conversationId: string,
    since: Date,
  ): Promise<ConversationMember[]>;

  /**
   * Bulk add members to conversation
   */
  addMembers(
    conversationId: string,
    members: Array<{ userId: string; role: ConversationRole }>,
  ): Promise<ConversationMember[]>;

  /**
   * Bulk remove members from conversation
   */
  removeMembers(conversationId: string, userIds: string[]): Promise<void>;

  /**
   * Transfer ownership to another member
   */
  transferOwnership(
    conversationId: string,
    currentOwnerId: string,
    newOwnerId: string,
  ): Promise<void>;
}

export interface MemberWithUnreadCount extends ConversationMember {
  unreadCount: bigint;
}
