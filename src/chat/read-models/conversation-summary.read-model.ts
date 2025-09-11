export interface ConversationSummaryData {
  id: string;
  name: string;
  type: string;
  participantCount: number;
  lastMessageAt?: Date;
  lastMessageContent?: string;
  lastMessageSender?: string | null;
  unreadCount: number;
  isArchived: boolean;
  avatarUrl?: string;
  createdAt: Date;
}

export interface ConversationSummaryFilter {
  userId?: string;
  type?: string;
  isArchived?: boolean;
  hasUnread?: boolean;
  participantId?: string;
}
