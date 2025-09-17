import { ObjectId } from 'mongodb';

export interface MessageAttachment {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  url: string;
  thumbnailUrl?: string;
  metadata?: Record<string, any>;
}

export interface MessageContent {
  text: string;
  attachments?: MessageAttachment[];
  metadata?: {
    replyToMessageId?: string;
    mentions?: string[];
    hashtags?: string[];
    links?: Array<{
      url: string;
      title?: string;
      description?: string;
    }>;
    [key: string]: any;
  };
}

export interface MessageMongoDB {
  _id?: ObjectId;
  messageId: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  senderUsername?: string;
  content: MessageContent;
  messageType: 'text' | 'media' | 'system' | 'file';
  sequenceNumber: number;
  createdAt: Date;
  editedAt?: Date;
  deletedAt?: Date;
  tenantId: string;
  
  // Denormalized fields for performance
  conversationTitle: string;
  conversationType: 'direct' | 'group' | 'channel';
  
  // Status flags
  isEdited: boolean;
  isDeleted: boolean;
  isPinned: boolean;
  
  // Indexing fields
  searchText: string;
  tags: string[];
  
  // Additional metadata
  clientMessageId?: string;
  editHistory?: Array<{
    content: MessageContent;
    editedAt: Date;
    editedBy: string;
  }>;
  
  // Reactions
  reactions?: Array<{
    emoji: string;
    userId: string;
    userName: string;
    createdAt: Date;
  }>;
  
  // Read receipts
  readBy?: Array<{
    userId: string;
    userName: string;
    readAt: Date;
  }>;
  
  // System fields
  version: number;
  lastUpdatedAt: Date;
}

export interface MessageCreateInput {
  messageId: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  senderUsername?: string;
  content: MessageContent;
  messageType: 'text' | 'media' | 'system' | 'file';
  sequenceNumber: number;
  tenantId: string;
  conversationTitle: string;
  conversationType: 'direct' | 'group' | 'channel';
  clientMessageId?: string;
}

export interface MessageUpdateInput {
  content?: MessageContent;
  editedAt?: Date;
  deletedAt?: Date;
  isEdited?: boolean;
  isDeleted?: boolean;
  isPinned?: boolean;
  reactions?: Array<{
    emoji: string;
    userId: string;
    userName: string;
    createdAt: Date;
  }>;
  readBy?: Array<{
    userId: string;
    userName: string;
    readAt: Date;
  }>;
}

export interface MessageQuery {
  conversationId?: string;
  senderId?: string;
  tenantId?: string;
  messageType?: string;
  isDeleted?: boolean;
  searchText?: string;
  tags?: string[];
  fromDate?: Date;
  toDate?: Date;
  limit?: number;
  offset?: number;
  sortBy?: 'sequenceNumber' | 'createdAt' | 'relevance';
  sortOrder?: 'asc' | 'desc';
}

export interface MessageSearchResult {
  messages: MessageMongoDB[];
  total: number;
  hasMore: boolean;
  hasPrevious: boolean;
  searchTime: number;
  facets?: {
    messageTypes: Array<{ type: string; count: number }>;
    senders: Array<{ senderId: string; senderName: string; count: number }>;
    tags: Array<{ tag: string; count: number }>;
  };
}

/**
 * Helper class for Message operations
 */
export class MessageMongoDBHelper {
  /**
   * Generate search text for indexing
   */
  static generateSearchText(content: MessageContent, conversationTitle: string): string {
    const text = content.text || '';
    const attachments = content.attachments || [];
    const attachmentText = attachments.map(att => att.filename).join(' ');
    const mentions = content.metadata?.mentions || [];
    const hashtags = content.metadata?.hashtags || [];
    
    return `${text} ${attachmentText} ${conversationTitle} ${mentions.join(' ')} ${hashtags.join(' ')}`
      .toLowerCase()
      .trim();
  }

  /**
   * Extract tags from message content
   */
  static extractTags(content: MessageContent): string[] {
    const tags: string[] = [];
    
    // Extract hashtags from text
    const hashtags = content.text?.match(/#\w+/g) || [];
    tags.push(...hashtags.map(tag => tag.toLowerCase()));
    
    // Add hashtags from metadata
    if (content.metadata?.hashtags) {
      tags.push(...content.metadata.hashtags.map(tag => tag.toLowerCase()));
    }
    
    // Extract mentions
    const mentions = content.text?.match(/@\w+/g) || [];
    tags.push(...mentions.map(mention => mention.toLowerCase()));
    
    // Add mentions from metadata
    if (content.metadata?.mentions) {
      tags.push(...content.metadata.mentions.map(mention => mention.toLowerCase()));
    }
    
    // Remove duplicates
    return [...new Set(tags)];
  }

  /**
   * Create a new message document
   */
  static createMessage(input: MessageCreateInput): MessageMongoDB {
    const now = new Date();
    const searchText = this.generateSearchText(input.content, input.conversationTitle);
    const tags = this.extractTags(input.content);

    return {
      messageId: input.messageId,
      conversationId: input.conversationId,
      senderId: input.senderId,
      senderName: input.senderName,
      senderAvatar: input.senderAvatar,
      senderUsername: input.senderUsername,
      content: input.content,
      messageType: input.messageType,
      sequenceNumber: input.sequenceNumber,
      createdAt: now,
      editedAt: null,
      deletedAt: null,
      tenantId: input.tenantId,
      conversationTitle: input.conversationTitle,
      conversationType: input.conversationType,
      isEdited: false,
      isDeleted: false,
      isPinned: false,
      searchText,
      tags,
      clientMessageId: input.clientMessageId,
      editHistory: [],
      reactions: [],
      readBy: [],
      version: 1,
      lastUpdatedAt: now,
    };
  }

  /**
   * Update message with new content
   */
  static updateMessage(
    existingMessage: MessageMongoDB,
    update: MessageUpdateInput,
  ): MessageMongoDB {
    const now = new Date();
    const updatedMessage = { ...existingMessage };

    // Update content if provided
    if (update.content) {
      // Add to edit history
      updatedMessage.editHistory = [
        ...(updatedMessage.editHistory || []),
        {
          content: existingMessage.content,
          editedAt: existingMessage.editedAt || existingMessage.createdAt,
          editedBy: existingMessage.senderId,
        },
      ];

      updatedMessage.content = update.content;
      updatedMessage.isEdited = true;
      updatedMessage.editedAt = now;
      updatedMessage.searchText = this.generateSearchText(
        update.content,
        existingMessage.conversationTitle,
      );
      updatedMessage.tags = this.extractTags(update.content);
    }

    // Update other fields
    if (update.deletedAt !== undefined) {
      updatedMessage.deletedAt = update.deletedAt;
      updatedMessage.isDeleted = update.deletedAt !== null;
    }

    if (update.isPinned !== undefined) {
      updatedMessage.isPinned = update.isPinned;
    }

    if (update.reactions) {
      updatedMessage.reactions = update.reactions;
    }

    if (update.readBy) {
      updatedMessage.readBy = update.readBy;
    }

    // Update version and timestamp
    updatedMessage.version = existingMessage.version + 1;
    updatedMessage.lastUpdatedAt = now;

    return updatedMessage;
  }

  /**
   * Add reaction to message
   */
  static addReaction(
    message: MessageMongoDB,
    emoji: string,
    userId: string,
    userName: string,
  ): MessageMongoDB {
    const now = new Date();
    const reactions = [...(message.reactions || [])];

    // Remove existing reaction from same user
    const existingIndex = reactions.findIndex(r => r.userId === userId);
    if (existingIndex >= 0) {
      reactions.splice(existingIndex, 1);
    }

    // Add new reaction
    reactions.push({
      emoji,
      userId,
      userName,
      createdAt: now,
    });

    return {
      ...message,
      reactions,
      version: message.version + 1,
      lastUpdatedAt: now,
    };
  }

  /**
   * Mark message as read by user
   */
  static markAsRead(
    message: MessageMongoDB,
    userId: string,
    userName: string,
  ): MessageMongoDB {
    const now = new Date();
    const readBy = [...(message.readBy || [])];

    // Remove existing read receipt from same user
    const existingIndex = readBy.findIndex(r => r.userId === userId);
    if (existingIndex >= 0) {
      readBy.splice(existingIndex, 1);
    }

    // Add new read receipt
    readBy.push({
      userId,
      userName,
      readAt: now,
    });

    return {
      ...message,
      readBy,
      version: message.version + 1,
      lastUpdatedAt: now,
    };
  }

  /**
   * Validate message data
   */
  static validateMessage(message: Partial<MessageMongoDB>): string[] {
    const errors: string[] = [];

    if (!message.messageId) {
      errors.push('messageId is required');
    }

    if (!message.conversationId) {
      errors.push('conversationId is required');
    }

    if (!message.senderId) {
      errors.push('senderId is required');
    }

    if (!message.content) {
      errors.push('content is required');
    }

    if (!message.tenantId) {
      errors.push('tenantId is required');
    }

    if (message.sequenceNumber === undefined || message.sequenceNumber === null) {
      errors.push('sequenceNumber is required');
    }

    if (message.content && !message.content.text && !message.content.attachments?.length) {
      errors.push('content must have text or attachments');
    }

    return errors;
  }
}