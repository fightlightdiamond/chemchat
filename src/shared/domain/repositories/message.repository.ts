import { Message } from '../entities/message.entity';
import { MessageType } from '../value-objects/message-type.vo';
import {
  BaseRepository,
  PaginationOptions,
  PaginatedResult,
} from './base.repository';

export interface MessageRepository extends BaseRepository<Message> {
  /**
   * Save a message (alias for create)
   */
  save(message: Message): Promise<Message>;
  /**
   * Find messages by conversation ID with pagination
   */
  findByConversationId(
    conversationId: string,
    options?: MessagePaginationOptions,
  ): Promise<PaginatedResult<Message>>;

  /**
   * Find messages by sender ID
   */
  findBySenderId(
    senderId: string,
    options?: PaginationOptions,
  ): Promise<PaginatedResult<Message>>;

  /**
   * Find message by client message ID for deduplication
   */
  findByClientMessageId(clientMessageId: string): Promise<Message | null>;

  /**
   * Find messages after a specific sequence number
   */
  findAfterSequence(
    conversationId: string,
    sequenceNumber: bigint,
    limit?: number,
  ): Promise<Message[]>;

  /**
   * Find messages before a specific sequence number
   */
  findBeforeSequence(
    conversationId: string,
    sequenceNumber: bigint,
    limit?: number,
  ): Promise<Message[]>;

  /**
   * Get the latest message in a conversation
   */
  findLatestInConversation(conversationId: string): Promise<Message | null>;

  /**
   * Get the next sequence number for a conversation
   */
  getNextSequenceNumber(conversationId: string): Promise<bigint>;

  /**
   * Search messages by content
   */
  searchByContent(
    query: string,
    conversationId?: string,
    options?: PaginationOptions,
  ): Promise<PaginatedResult<Message>>;

  /**
   * Find messages by type
   */
  findByType(
    messageType: MessageType,
    options?: PaginationOptions,
  ): Promise<PaginatedResult<Message>>;

  /**
   * Find unread messages for a user in a conversation
   */
  findUnreadMessages(
    conversationId: string,
    userId: string,
    lastReadSequence: bigint,
  ): Promise<Message[]>;

  /**
   * Get message count for a conversation
   */
  getMessageCount(conversationId: string): Promise<number>;

  /**
   * Get unread message count for a user in a conversation
   */
  getUnreadCount(
    conversationId: string,
    lastReadSequence: bigint,
  ): Promise<number>;

  /**
   * Find messages in date range
   */
  findInDateRange(
    conversationId: string,
    startDate: Date,
    endDate: Date,
    options?: PaginationOptions,
  ): Promise<PaginatedResult<Message>>;

  /**
   * Find edited messages
   */
  findEditedMessages(
    conversationId?: string,
    options?: PaginationOptions,
  ): Promise<PaginatedResult<Message>>;

  /**
   * Find deleted messages (for audit purposes)
   */
  findDeletedMessages(
    conversationId?: string,
    options?: PaginationOptions,
  ): Promise<PaginatedResult<Message>>;

  /**
   * Get message statistics
   */
  getMessageStats(conversationId?: string): Promise<MessageStats>;

  /**
   * Bulk update message read status
   */
  markMessagesAsRead(
    conversationId: string,
    userId: string,
    upToSequence: bigint,
  ): Promise<void>;

  /**
   * Find messages with attachments
   */
  findMessagesWithAttachments(
    conversationId?: string,
    options?: PaginationOptions,
  ): Promise<PaginatedResult<Message>>;
}

export interface MessagePaginationOptions extends PaginationOptions {
  /**
   * Cursor for pagination
   */
  cursor?: string;
  /**
   * Load messages before this sequence number (for loading older messages)
   */
  beforeSequence?: bigint;
  /**
   * Load messages after this sequence number (for loading newer messages)
   */
  afterSequence?: bigint;
  /**
   * Include deleted messages in results
   */
  includeDeleted?: boolean;
}

export interface MessageStats {
  totalMessages: number;
  editedMessages: number;
  deletedMessages: number;
  systemMessages: number;
  messagesWithAttachments: number;
  averageMessagesPerDay: number;
  mostActiveHour: number; // 0-23
}
