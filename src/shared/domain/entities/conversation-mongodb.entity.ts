import { ObjectId } from 'mongodb';

export interface ConversationMember {
  userId: string;
  username: string;
  displayName: string;
  avatar?: string;
  role: 'admin' | 'member' | 'moderator';
  joinedAt: Date;
  lastReadAt?: Date;
  lastReadSequence?: number;
  isActive: boolean;
  permissions?: {
    canSendMessages: boolean;
    canEditMessages: boolean;
    canDeleteMessages: boolean;
    canInviteMembers: boolean;
    canRemoveMembers: boolean;
    canManageSettings: boolean;
  };
}

export interface ConversationSettings {
  allowFileUpload: boolean;
  allowMentions: boolean;
  muteNotifications: boolean;
  archiveAfterDays: number;
  maxMembers: number;
  allowMemberInvites: boolean;
  requireApprovalForJoins: boolean;
  autoDeleteMessages: boolean;
  autoDeleteAfterDays: number;
  customFields?: Record<string, any>;
}

export interface ConversationMongoDB {
  _id?: ObjectId;
  conversationId: string;
  title: string;
  type: 'direct' | 'group' | 'channel';
  description?: string;
  avatar?: string;
  tenantId: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  
  // Members with denormalized data
  members: ConversationMember[];
  
  // Aggregated data
  memberCount: number;
  lastMessage?: {
    messageId: string;
    content: string;
    senderId: string;
    senderName: string;
    createdAt: Date;
    sequenceNumber: number;
  };
  
  // Statistics
  totalMessages: number;
  unreadCount: number;
  
  // Settings
  settings: ConversationSettings;
  
  // Status
  isActive: boolean;
  isArchived: boolean;
  archivedAt?: Date;
  
  // Metadata
  tags: string[];
  searchText: string;
  
  // System fields
  version: number;
  lastUpdatedAt: Date;
}

export interface ConversationCreateInput {
  conversationId: string;
  title: string;
  type: 'direct' | 'group' | 'channel';
  description?: string;
  avatar?: string;
  tenantId: string;
  createdBy: string;
  members: ConversationMember[];
  settings?: Partial<ConversationSettings>;
}

export interface ConversationUpdateInput {
  title?: string;
  description?: string;
  avatar?: string;
  members?: ConversationMember[];
  settings?: Partial<ConversationSettings>;
  isActive?: boolean;
  isArchived?: boolean;
  archivedAt?: Date;
}

export interface ConversationQuery {
  tenantId?: string;
  type?: string;
  createdBy?: string;
  memberUserId?: string;
  isActive?: boolean;
  isArchived?: boolean;
  searchText?: string;
  tags?: string[];
  limit?: number;
  offset?: number;
  sortBy?: 'updatedAt' | 'createdAt' | 'memberCount' | 'lastMessageAt';
  sortOrder?: 'asc' | 'desc';
}

export interface ConversationSearchResult {
  conversations: ConversationMongoDB[];
  total: number;
  hasMore: boolean;
  hasPrevious: boolean;
  searchTime: number;
  facets?: {
    types: Array<{ type: string; count: number }>;
    creators: Array<{ createdBy: string; count: number }>;
    tags: Array<{ tag: string; count: number }>;
  };
}

/**
 * Helper class for Conversation operations
 */
export class ConversationMongoDBHelper {
  /**
   * Generate search text for indexing
   */
  static generateSearchText(
    title: string,
    description?: string,
    members: ConversationMember[] = [],
  ): string {
    const memberNames = members.map(m => m.displayName || m.username).join(' ');
    return `${title} ${description || ''} ${memberNames}`.toLowerCase().trim();
  }

  /**
   * Extract tags from conversation data
   */
  static extractTags(
    title: string,
    description?: string,
    type: string,
  ): string[] {
    const tags: string[] = [];
    
    // Add type as tag
    tags.push(type.toLowerCase());
    
    // Extract hashtags from title and description
    const text = `${title} ${description || ''}`;
    const hashtags = text.match(/#\w+/g) || [];
    tags.push(...hashtags.map(tag => tag.toLowerCase()));
    
    // Add common tags based on type
    if (type === 'direct') {
      tags.push('private', 'one-on-one');
    } else if (type === 'group') {
      tags.push('group', 'team');
    } else if (type === 'channel') {
      tags.push('channel', 'public');
    }
    
    // Remove duplicates
    return [...new Set(tags)];
  }

  /**
   * Create a new conversation document
   */
  static createConversation(input: ConversationCreateInput): ConversationMongoDB {
    const now = new Date();
    const searchText = this.generateSearchText(input.title, input.description, input.members);
    const tags = this.extractTags(input.title, input.description, input.type);

    const defaultSettings: ConversationSettings = {
      allowFileUpload: true,
      allowMentions: true,
      muteNotifications: false,
      archiveAfterDays: 365,
      maxMembers: 1000,
      allowMemberInvites: true,
      requireApprovalForJoins: false,
      autoDeleteMessages: false,
      autoDeleteAfterDays: 0,
      customFields: {},
    };

    return {
      conversationId: input.conversationId,
      title: input.title,
      type: input.type,
      description: input.description,
      avatar: input.avatar,
      tenantId: input.tenantId,
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
      members: input.members,
      memberCount: input.members.length,
      lastMessage: undefined,
      totalMessages: 0,
      unreadCount: 0,
      settings: { ...defaultSettings, ...input.settings },
      isActive: true,
      isArchived: false,
      archivedAt: undefined,
      tags,
      searchText,
      version: 1,
      lastUpdatedAt: now,
    };
  }

  /**
   * Update conversation with new data
   */
  static updateConversation(
    existingConversation: ConversationMongoDB,
    update: ConversationUpdateInput,
  ): ConversationMongoDB {
    const now = new Date();
    const updatedConversation = { ...existingConversation };

    // Update basic fields
    if (update.title !== undefined) {
      updatedConversation.title = update.title;
    }
    if (update.description !== undefined) {
      updatedConversation.description = update.description;
    }
    if (update.avatar !== undefined) {
      updatedConversation.avatar = update.avatar;
    }
    if (update.members !== undefined) {
      updatedConversation.members = update.members;
      updatedConversation.memberCount = update.members.length;
    }
    if (update.settings !== undefined) {
      updatedConversation.settings = { ...updatedConversation.settings, ...update.settings };
    }
    if (update.isActive !== undefined) {
      updatedConversation.isActive = update.isActive;
    }
    if (update.isArchived !== undefined) {
      updatedConversation.isArchived = update.isArchived;
      updatedConversation.archivedAt = update.isArchived ? now : undefined;
    }

    // Update search text and tags
    updatedConversation.searchText = this.generateSearchText(
      updatedConversation.title,
      updatedConversation.description,
      updatedConversation.members,
    );
    updatedConversation.tags = this.extractTags(
      updatedConversation.title,
      updatedConversation.description,
      updatedConversation.type,
    );

    // Update timestamps and version
    updatedConversation.updatedAt = now;
    updatedConversation.lastUpdatedAt = now;
    updatedConversation.version = existingConversation.version + 1;

    return updatedConversation;
  }

  /**
   * Add member to conversation
   */
  static addMember(
    conversation: ConversationMongoDB,
    member: ConversationMember,
  ): ConversationMongoDB {
    const members = [...conversation.members];
    
    // Check if member already exists
    const existingIndex = members.findIndex(m => m.userId === member.userId);
    if (existingIndex >= 0) {
      // Update existing member
      members[existingIndex] = { ...members[existingIndex], ...member };
    } else {
      // Add new member
      members.push(member);
    }

    return {
      ...conversation,
      members,
      memberCount: members.length,
      updatedAt: new Date(),
      lastUpdatedAt: new Date(),
      version: conversation.version + 1,
    };
  }

  /**
   * Remove member from conversation
   */
  static removeMember(
    conversation: ConversationMongoDB,
    userId: string,
  ): ConversationMongoDB {
    const members = conversation.members.filter(m => m.userId !== userId);

    return {
      ...conversation,
      members,
      memberCount: members.length,
      updatedAt: new Date(),
      lastUpdatedAt: new Date(),
      version: conversation.version + 1,
    };
  }

  /**
   * Update member's last read position
   */
  static updateMemberReadPosition(
    conversation: ConversationMongoDB,
    userId: string,
    lastReadAt: Date,
    lastReadSequence: number,
  ): ConversationMongoDB {
    const members = conversation.members.map(member => {
      if (member.userId === userId) {
        return {
          ...member,
          lastReadAt,
          lastReadSequence,
        };
      }
      return member;
    });

    return {
      ...conversation,
      members,
      updatedAt: new Date(),
      lastUpdatedAt: new Date(),
      version: conversation.version + 1,
    };
  }

  /**
   * Update last message
   */
  static updateLastMessage(
    conversation: ConversationMongoDB,
    lastMessage: ConversationMongoDB['lastMessage'],
  ): ConversationMongoDB {
    return {
      ...conversation,
      lastMessage,
      updatedAt: new Date(),
      lastUpdatedAt: new Date(),
      version: conversation.version + 1,
    };
  }

  /**
   * Validate conversation data
   */
  static validateConversation(conversation: Partial<ConversationMongoDB>): string[] {
    const errors: string[] = [];

    if (!conversation.conversationId) {
      errors.push('conversationId is required');
    }

    if (!conversation.title) {
      errors.push('title is required');
    }

    if (!conversation.type) {
      errors.push('type is required');
    }

    if (!conversation.tenantId) {
      errors.push('tenantId is required');
    }

    if (!conversation.createdBy) {
      errors.push('createdBy is required');
    }

    if (!conversation.members || conversation.members.length === 0) {
      errors.push('at least one member is required');
    }

    if (conversation.members && conversation.members.length > 0) {
      // Check if creator is in members
      const creatorInMembers = conversation.members.some(m => m.userId === conversation.createdBy);
      if (!creatorInMembers) {
        errors.push('creator must be in members list');
      }
    }

    return errors;
  }
}