import { ObjectId } from 'mongodb';

export interface UserConversationPreferences {
  muteNotifications: boolean;
  hideFromList: boolean;
  pinToTop: boolean;
  customTitle?: string;
  customAvatar?: string;
  customColor?: string;
  showPreview: boolean;
  autoMarkAsRead: boolean;
  customFields?: Record<string, any>;
}

export interface UserConversationMongoDB {
  _id?: ObjectId;
  userId: string;
  conversationId: string;
  tenantId: string;
  
  // Conversation details (denormalized for performance)
  conversationTitle: string;
  conversationType: 'direct' | 'group' | 'channel';
  conversationDescription?: string;
  conversationAvatar?: string;
  
  // User's relationship to conversation
  role: 'admin' | 'member' | 'moderator';
  joinedAt: Date;
  lastReadAt?: Date;
  lastReadSequence?: number;
  
  // Unread tracking
  unreadCount: number;
  unreadMessages: Array<{
    messageId: string;
    sequenceNumber: number;
    createdAt: Date;
    senderId: string;
    senderName: string;
  }>;
  
  // User preferences
  preferences: UserConversationPreferences;
  
  // Activity tracking
  isActive: boolean;
  lastActivityAt: Date;
  lastMessageAt?: Date;
  
  // Status
  isMuted: boolean;
  isPinned: boolean;
  isArchived: boolean;
  archivedAt?: Date;
  
  // System fields
  version: number;
  lastUpdatedAt: Date;
}

export interface UserConversationCreateInput {
  userId: string;
  conversationId: string;
  tenantId: string;
  conversationTitle: string;
  conversationType: 'direct' | 'group' | 'channel';
  conversationDescription?: string;
  conversationAvatar?: string;
  role: 'admin' | 'member' | 'moderator';
  preferences?: Partial<UserConversationPreferences>;
}

export interface UserConversationUpdateInput {
  role?: 'admin' | 'member' | 'moderator';
  lastReadAt?: Date;
  lastReadSequence?: number;
  unreadCount?: number;
  unreadMessages?: Array<{
    messageId: string;
    sequenceNumber: number;
    createdAt: Date;
    senderId: string;
    senderName: string;
  }>;
  preferences?: Partial<UserConversationPreferences>;
  isActive?: boolean;
  lastActivityAt?: Date;
  lastMessageAt?: Date;
  isMuted?: boolean;
  isPinned?: boolean;
  isArchived?: boolean;
  archivedAt?: Date;
}

export interface UserConversationQuery {
  userId?: string;
  conversationId?: string;
  tenantId?: string;
  role?: string;
  isActive?: boolean;
  isMuted?: boolean;
  isPinned?: boolean;
  isArchived?: boolean;
  hasUnread?: boolean;
  limit?: number;
  offset?: number;
  sortBy?: 'lastActivityAt' | 'lastMessageAt' | 'joinedAt' | 'unreadCount';
  sortOrder?: 'asc' | 'desc';
}

export interface UserConversationSearchResult {
  userConversations: UserConversationMongoDB[];
  total: number;
  hasMore: boolean;
  hasPrevious: boolean;
  searchTime: number;
  facets?: {
    roles: Array<{ role: string; count: number }>;
    types: Array<{ type: string; count: number }>;
    statuses: Array<{ status: string; count: number }>;
  };
}

/**
 * Helper class for UserConversation operations
 */
export class UserConversationMongoDBHelper {
  /**
   * Create a new user conversation document
   */
  static createUserConversation(input: UserConversationCreateInput): UserConversationMongoDB {
    const now = new Date();
    
    const defaultPreferences: UserConversationPreferences = {
      muteNotifications: false,
      hideFromList: false,
      pinToTop: false,
      showPreview: true,
      autoMarkAsRead: false,
      customFields: {},
    };

    return {
      userId: input.userId,
      conversationId: input.conversationId,
      tenantId: input.tenantId,
      conversationTitle: input.conversationTitle,
      conversationType: input.conversationType,
      conversationDescription: input.conversationDescription,
      conversationAvatar: input.conversationAvatar,
      role: input.role,
      joinedAt: now,
      lastReadAt: undefined,
      lastReadSequence: undefined,
      unreadCount: 0,
      unreadMessages: [],
      preferences: { ...defaultPreferences, ...input.preferences },
      isActive: true,
      lastActivityAt: now,
      lastMessageAt: undefined,
      isMuted: false,
      isPinned: false,
      isArchived: false,
      archivedAt: undefined,
      version: 1,
      lastUpdatedAt: now,
    };
  }

  /**
   * Update user conversation with new data
   */
  static updateUserConversation(
    existingUserConversation: UserConversationMongoDB,
    update: UserConversationUpdateInput,
  ): UserConversationMongoDB {
    const now = new Date();
    const updatedUserConversation = { ...existingUserConversation };

    // Update basic fields
    if (update.role !== undefined) {
      updatedUserConversation.role = update.role;
    }
    if (update.lastReadAt !== undefined) {
      updatedUserConversation.lastReadAt = update.lastReadAt;
    }
    if (update.lastReadSequence !== undefined) {
      updatedUserConversation.lastReadSequence = update.lastReadSequence;
    }
    if (update.unreadCount !== undefined) {
      updatedUserConversation.unreadCount = update.unreadCount;
    }
    if (update.unreadMessages !== undefined) {
      updatedUserConversation.unreadMessages = update.unreadMessages;
    }
    if (update.preferences !== undefined) {
      updatedUserConversation.preferences = { 
        ...updatedUserConversation.preferences, 
        ...update.preferences 
      };
    }
    if (update.isActive !== undefined) {
      updatedUserConversation.isActive = update.isActive;
    }
    if (update.lastActivityAt !== undefined) {
      updatedUserConversation.lastActivityAt = update.lastActivityAt;
    }
    if (update.lastMessageAt !== undefined) {
      updatedUserConversation.lastMessageAt = update.lastMessageAt;
    }
    if (update.isMuted !== undefined) {
      updatedUserConversation.isMuted = update.isMuted;
    }
    if (update.isPinned !== undefined) {
      updatedUserConversation.isPinned = update.isPinned;
    }
    if (update.isArchived !== undefined) {
      updatedUserConversation.isArchived = update.isArchived;
      updatedUserConversation.archivedAt = update.isArchived ? now : undefined;
    }

    // Update timestamps and version
    updatedUserConversation.lastUpdatedAt = now;
    updatedUserConversation.version = existingUserConversation.version + 1;

    return updatedUserConversation;
  }

  /**
   * Add unread message
   */
  static addUnreadMessage(
    userConversation: UserConversationMongoDB,
    message: {
      messageId: string;
      sequenceNumber: number;
      createdAt: Date;
      senderId: string;
      senderName: string;
    },
  ): UserConversationMongoDB {
    const unreadMessages = [...userConversation.unreadMessages];
    
    // Check if message already exists
    const existingIndex = unreadMessages.findIndex(m => m.messageId === message.messageId);
    if (existingIndex >= 0) {
      // Update existing message
      unreadMessages[existingIndex] = message;
    } else {
      // Add new message
      unreadMessages.push(message);
    }

    return {
      ...userConversation,
      unreadMessages,
      unreadCount: unreadMessages.length,
      lastMessageAt: message.createdAt,
      lastUpdatedAt: new Date(),
      version: userConversation.version + 1,
    };
  }

  /**
   * Mark messages as read
   */
  static markMessagesAsRead(
    userConversation: UserConversationMongoDB,
    upToSequence: number,
  ): UserConversationMongoDB {
    const unreadMessages = userConversation.unreadMessages.filter(
      m => m.sequenceNumber > upToSequence
    );

    return {
      ...userConversation,
      unreadMessages,
      unreadCount: unreadMessages.length,
      lastReadSequence: upToSequence,
      lastReadAt: new Date(),
      lastUpdatedAt: new Date(),
      version: userConversation.version + 1,
    };
  }

  /**
   * Update conversation details (when conversation is updated)
   */
  static updateConversationDetails(
    userConversation: UserConversationMongoDB,
    conversationDetails: {
      title?: string;
      description?: string;
      avatar?: string;
      type?: 'direct' | 'group' | 'channel';
    },
  ): UserConversationMongoDB {
    return {
      ...userConversation,
      conversationTitle: conversationDetails.title || userConversation.conversationTitle,
      conversationDescription: conversationDetails.description || userConversation.conversationDescription,
      conversationAvatar: conversationDetails.avatar || userConversation.conversationAvatar,
      conversationType: conversationDetails.type || userConversation.conversationType,
      lastUpdatedAt: new Date(),
      version: userConversation.version + 1,
    };
  }

  /**
   * Validate user conversation data
   */
  static validateUserConversation(userConversation: Partial<UserConversationMongoDB>): string[] {
    const errors: string[] = [];

    if (!userConversation.userId) {
      errors.push('userId is required');
    }

    if (!userConversation.conversationId) {
      errors.push('conversationId is required');
    }

    if (!userConversation.tenantId) {
      errors.push('tenantId is required');
    }

    if (!userConversation.conversationTitle) {
      errors.push('conversationTitle is required');
    }

    if (!userConversation.conversationType) {
      errors.push('conversationType is required');
    }

    if (!userConversation.role) {
      errors.push('role is required');
    }

    if (userConversation.unreadCount !== undefined && userConversation.unreadCount < 0) {
      errors.push('unreadCount must be non-negative');
    }

    return errors;
  }

  /**
   * Calculate unread count from unread messages
   */
  static calculateUnreadCount(unreadMessages: UserConversationMongoDB['unreadMessages']): number {
    return unreadMessages.length;
  }

  /**
   * Get display title (custom or conversation title)
   */
  static getDisplayTitle(userConversation: UserConversationMongoDB): string {
    return userConversation.preferences.customTitle || userConversation.conversationTitle;
  }

  /**
   * Check if user has permission
   */
  static hasPermission(
    userConversation: UserConversationMongoDB,
    permission: 'canSendMessages' | 'canEditMessages' | 'canDeleteMessages' | 'canInviteMembers' | 'canRemoveMembers' | 'canManageSettings',
  ): boolean {
    // This would typically come from the conversation's member permissions
    // For now, we'll use role-based permissions
    switch (permission) {
      case 'canSendMessages':
        return userConversation.isActive && !userConversation.isMuted;
      case 'canEditMessages':
        return userConversation.role === 'admin' || userConversation.role === 'moderator';
      case 'canDeleteMessages':
        return userConversation.role === 'admin';
      case 'canInviteMembers':
        return userConversation.role === 'admin' || userConversation.role === 'moderator';
      case 'canRemoveMembers':
        return userConversation.role === 'admin';
      case 'canManageSettings':
        return userConversation.role === 'admin';
      default:
        return false;
    }
  }
}