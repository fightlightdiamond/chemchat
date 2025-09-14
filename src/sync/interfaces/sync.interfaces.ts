export interface SyncRequest {
  lastSequenceNumber: bigint;
  conversationIds?: string[];
  deviceId: string;
  clientTimestamp: Date;
}

export interface SyncResponse {
  messages: SyncMessage[];
  conversations: SyncConversation[];
  deletedItems: any[];
  currentSequenceNumber: number;
  hasMoreData: boolean;
  metrics: SyncMetrics;
  serverTimestamp: Date;
  hasMore: boolean;
  nextCursor?: string;
}

export interface SyncMessage {
  id: string;
  conversationId: string;
  content: string;
  senderId: string;
  sequenceNumber: number;
  timestamp: Date;
  createdAt: Date;
  editedAt?: Date;
  messageType: string;
  attachments?: SyncAttachment[];
  isDeleted: boolean;
  version: number;
}

export interface SyncConversation {
  id: string;
  name?: string;
  type: string;
  participants: SyncParticipant[];
  lastMessageAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  isDeleted: boolean;
  version: number;
}

export interface SyncParticipant {
  userId: string;
  role: string;
  joinedAt: Date;
  lastReadSequence?: bigint;
}

export interface SyncAttachment {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
}

export interface ConflictResolution {
  messageId: string;
  conflictType: ConflictType;
  serverVersion: SyncMessage;
  clientVersion: Partial<SyncMessage>;
  resolution: ResolutionStrategy;
  resolvedMessage: SyncMessage;
  timestamp: Date;
}

export enum ConflictType {
  EDIT_CONFLICT = 'edit_conflict',
  DELETE_CONFLICT = 'delete_conflict',
  SEQUENCE_CONFLICT = 'sequence_conflict',
  TIMESTAMP_CONFLICT = 'timestamp_conflict',
}

export enum ResolutionStrategy {
  SERVER_WINS = 'server_wins',
  CLIENT_WINS = 'client_wins',
  MERGE = 'merge',
  MANUAL = 'manual',
}

export interface ClientState {
  deviceId: string;
  userId: string;
  tenantId: string;
  lastSyncTimestamp: Date;
  lastSequenceNumber: bigint;
  pendingOperations: PendingOperation[];
  conflictResolutions: ConflictResolution[];
}

export interface PendingOperation {
  id: string;
  type: OperationType;
  data: any;
  timestamp: Date;
  retryCount: number;
  maxRetries: number;
  ttl: Date;
  deviceId: string;
}

export enum OperationType {
  SEND_MESSAGE = 'send_message',
  EDIT_MESSAGE = 'edit_message',
  DELETE_MESSAGE = 'delete_message',
  JOIN_CONVERSATION = 'join_conversation',
  LEAVE_CONVERSATION = 'leave_conversation',
  MARK_READ = 'mark_read',
}

export interface OfflineQueueItem {
  id: string;
  operation: PendingOperation;
  priority: QueuePriority;
  createdAt: Date;
  scheduledAt: Date;
  attempts: number;
  lastError?: string;
  status: QueueStatus;
}

export enum QueuePriority {
  HIGH = 'high',
  NORMAL = 'normal',
  LOW = 'low',
}

export enum QueueStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  EXPIRED = 'expired',
}

export interface DeepLink {
  type: DeepLinkType;
  conversationId?: string;
  messageId?: string;
  userId?: string;
  parameters?: Record<string, string>;
}

export enum DeepLinkType {
  CONVERSATION = 'conversation',
  MESSAGE = 'message',
  USER_PROFILE = 'user_profile',
  NOTIFICATION = 'notification',
}

export interface SyncMetrics {
  messagesCount: number;
  conversationsCount: number;
  deletedItemsCount: number;
  syncDuration: number;
  lastSyncSequence: number;
  timestamp: Date;
}
