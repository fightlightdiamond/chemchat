/**
 * ChemChat TypeScript SDK Types
 * Comprehensive type definitions for the ChemChat API
 */

// Base Types
export interface BaseEntity {
  id: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaginationOptions {
  page?: number;
  limit?: number;
  cursor?: string;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNext: boolean;
    hasPrevious: boolean;
    nextCursor?: string;
    previousCursor?: string;
  };
}

// Authentication Types
export interface LoginCredentials {
  email: string;
  password: string;
  deviceFingerprint?: DeviceFingerprint;
  mfaCode?: string;
}

export interface DeviceFingerprint {
  userAgent: string;
  language: string;
  timezone: string;
  screen?: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
  expiresIn: number;
  tokenType: string;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

// User Types
export interface User extends BaseEntity {
  email: string;
  username: string;
  displayName: string;
  avatar?: string;
  status: UserStatus;
  lastSeen: string;
  preferences?: UserPreferences;
}

export enum UserStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  BANNED = 'BANNED',
  PENDING = 'PENDING',
}

export interface UserPreferences {
  theme: 'light' | 'dark' | 'auto';
  language: string;
  timezone: string;
  notifications: NotificationPreferences;
}

// Message Types
export interface Message extends BaseEntity {
  conversationId: string;
  senderId: string;
  content: string;
  type: MessageType;
  sequenceNumber: number;
  clientMessageId?: string;
  replyToId?: string;
  editedAt?: string;
  deletedAt?: string;
  metadata?: MessageMetadata;
}

export enum MessageType {
  TEXT = 'TEXT',
  IMAGE = 'IMAGE',
  FILE = 'FILE',
  AUDIO = 'AUDIO',
  VIDEO = 'VIDEO',
  SYSTEM = 'SYSTEM',
}

export interface MessageMetadata {
  mentions?: string[];
  attachments?: string[];
  readBy?: MessageReadStatus[];
  reactions?: MessageReaction[];
  links?: LinkPreview[];
}

export interface MessageReadStatus {
  userId: string;
  readAt: string;
}

export interface MessageReaction {
  userId: string;
  emoji: string;
  createdAt: string;
}

export interface LinkPreview {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
}

// Conversation Types
export interface Conversation extends BaseEntity {
  name: string;
  type: ConversationType;
  description?: string;
  avatar?: string;
  isPrivate: boolean;
  participants: ConversationParticipant[];
  settings: ConversationSettings;
  lastMessage?: Message;
  unreadCount: number;
}

export enum ConversationType {
  DIRECT = 'DIRECT',
  GROUP = 'GROUP',
  CHANNEL = 'CHANNEL',
}

export interface ConversationParticipant {
  userId: string;
  role: ParticipantRole;
  joinedAt: string;
  permissions: Permission[];
}

export enum ParticipantRole {
  OWNER = 'OWNER',
  ADMIN = 'ADMIN',
  MODERATOR = 'MODERATOR',
  MEMBER = 'MEMBER',
}

export enum Permission {
  READ = 'READ',
  WRITE = 'WRITE',
  MANAGE = 'MANAGE',
  INVITE = 'INVITE',
  KICK = 'KICK',
  BAN = 'BAN',
}

export interface ConversationSettings {
  allowInvites: boolean;
  muteNotifications: boolean;
  retentionDays: number;
}

// Search Types
export interface SearchRequest {
  query: string;
  conversationIds?: string[];
  senderIds?: string[];
  messageTypes?: MessageType[];
  dateRange?: DateRange;
  limit?: number;
  page?: number;
}

export interface DateRange {
  from: string;
  to: string;
}

export interface SearchResult {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  type: MessageType;
  highlights?: SearchHighlights;
  score: number;
  createdAt: string;
}

export interface SearchHighlights {
  content?: string;
  [key: string]: string | undefined;
}

export interface SearchSuggestion {
  text: string;
  type: SuggestionType;
  score: number;
  userId?: string;
  conversationId?: string;
}

export enum SuggestionType {
  CONTENT = 'CONTENT',
  USER = 'USER',
  CONVERSATION = 'CONVERSATION',
}

// Media Types
export interface MediaUploadRequest {
  filename: string;
  contentType: string;
  size: number;
  conversationId: string;
  metadata?: MediaMetadata;
}

export interface MediaMetadata {
  description?: string;
  tags?: string[];
  [key: string]: any;
}

export interface MediaUploadResponse {
  uploadUrl: string;
  attachmentId: string;
  expiresIn: number;
  fields: Record<string, string>;
}

export interface Attachment extends BaseEntity {
  filename: string;
  originalName: string;
  contentType: string;
  size: number;
  url: string;
  thumbnailUrl?: string;
  status: MediaUploadStatus;
  metadata?: MediaMetadata;
  virusScanStatus: VirusScanStatus;
  processedAt?: string;
}

export enum MediaUploadStatus {
  PENDING = 'PENDING',
  UPLOADING = 'UPLOADING',
  PROCESSING = 'PROCESSING',
  PROCESSED = 'PROCESSED',
  FAILED = 'FAILED',
}

export enum VirusScanStatus {
  PENDING = 'PENDING',
  SCANNING = 'SCANNING',
  CLEAN = 'CLEAN',
  INFECTED = 'INFECTED',
  QUARANTINED = 'QUARANTINED',
}

// Notification Types
export interface NotificationPreferences {
  channels: {
    push: ChannelPreference;
    email: ChannelPreference;
    sms: ChannelPreference;
  };
  quietHours?: QuietHours;
  devices: Device[];
}

export interface ChannelPreference {
  enabled: boolean;
  types: NotificationType[];
}

export enum NotificationType {
  MESSAGE = 'MESSAGE',
  MENTION = 'MENTION',
  CONVERSATION_INVITE = 'CONVERSATION_INVITE',
  DAILY_DIGEST = 'DAILY_DIGEST',
}

export interface QuietHours {
  enabled: boolean;
  start: string; // HH:mm format
  end: string; // HH:mm format
  timezone: string;
}

export interface Device {
  id: string;
  type: DeviceType;
  token: string;
  userAgent: string;
  lastSeen: string;
}

export enum DeviceType {
  WEB = 'WEB',
  IOS = 'IOS',
  ANDROID = 'ANDROID',
}

// Presence Types
export interface PresenceStatus {
  userId: string;
  status: OnlineStatus;
  lastSeen: string;
  devices: DevicePresence[];
}

export enum OnlineStatus {
  ONLINE = 'ONLINE',
  AWAY = 'AWAY',
  BUSY = 'BUSY',
  OFFLINE = 'OFFLINE',
}

export interface DevicePresence {
  id: string;
  type: DeviceType;
  status: DeviceStatus;
}

export enum DeviceStatus {
  ACTIVE = 'ACTIVE',
  IDLE = 'IDLE',
  BACKGROUND = 'BACKGROUND',
}

// Typing Indicator Types
export interface TypingIndicator {
  conversationId: string;
  userId: string;
  isTyping: boolean;
}

// WebSocket Event Types
export interface WebSocketEvents {
  // Connection events
  connect: () => void;
  disconnect: (reason: string) => void;
  error: (error: Error) => void;

  // Message events
  message_created: (message: Message) => void;
  message_edited: (message: Message) => void;
  message_deleted: (messageId: string) => void;

  // Conversation events
  conversation_created: (conversation: Conversation) => void;
  conversation_updated: (conversation: Conversation) => void;
  user_joined: (data: { conversationId: string; user: User }) => void;
  user_left: (data: { conversationId: string; userId: string }) => void;

  // Presence events
  user_presence_changed: (presence: PresenceStatus) => void;
  user_typing: (typing: TypingIndicator) => void;

  // Notification events
  notification_received: (notification: Notification) => void;
}

export interface Notification extends BaseEntity {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data: Record<string, any>;
  channels: string[];
  status: NotificationStatus;
  deliveredAt?: string;
  readAt?: string;
}

export enum NotificationStatus {
  PENDING = 'PENDING',
  DELIVERED = 'DELIVERED',
  READ = 'READ',
  FAILED = 'FAILED',
}

// Error Types
export interface ApiError {
  statusCode: number;
  message: string;
  error: string;
  timestamp: string;
  path: string;
  correlationId: string;
  details?: any[];
}

// SDK Configuration
export interface ChemChatConfig {
  apiUrl: string;
  wsUrl?: string;
  tenantId: string;
  apiKey?: string;
  timeout?: number;
  retryAttempts?: number;
  retryDelay?: number;
}

export interface ClientOptions {
  autoConnect?: boolean;
  reconnection?: boolean;
  reconnectionDelay?: number;
  timeout?: number;
  maxReconnectAttempts?: number;
  enableWebSocket?: boolean;
  enableSync?: boolean;
  syncInterval?: number;
  deviceId?: string;
}

// Request/Response Types
export interface SendMessageRequest {
  conversationId: string;
  content: string;
  type: MessageType;
  clientMessageId?: string;
  replyToId?: string;
  metadata?: MessageMetadata;
}

export interface EditMessageRequest {
  messageId: string;
  content: string;
  metadata?: MessageMetadata;
}

export interface CreateConversationRequest {
  name: string;
  type: ConversationType;
  description?: string;
  isPrivate?: boolean;
  participantIds: string[];
  settings?: Partial<ConversationSettings>;
}

export interface UpdateConversationRequest {
  conversationId: string;
  name?: string;
  description?: string;
  avatar?: string;
  settings?: Partial<ConversationSettings>;
}

export interface JoinConversationRequest {
  conversationId: string;
  inviteCode?: string;
}

// Sync Types
export interface SyncRequest {
  lastSequenceNumber?: number;
  deviceId: string;
  includeDeleted?: boolean;
}

export interface SyncResponse {
  messages: Message[];
  conversations: Conversation[];
  lastSequenceNumber: number;
  hasMore: boolean;
}

export interface ClientState {
  deviceId: string;
  lastSyncAt: string;
  pendingOperations: PendingOperation[];
  conflicts: Conflict[];
}

export interface PendingOperation {
  id: string;
  type: OperationType;
  data: any;
  timestamp: string;
  retryCount: number;
}

export enum OperationType {
  SEND_MESSAGE = 'SEND_MESSAGE',
  EDIT_MESSAGE = 'EDIT_MESSAGE',
  DELETE_MESSAGE = 'DELETE_MESSAGE',
  CREATE_CONVERSATION = 'CREATE_CONVERSATION',
  JOIN_CONVERSATION = 'JOIN_CONVERSATION',
}

export interface Conflict {
  id: string;
  type: ConflictType;
  localOperation: PendingOperation;
  serverData: any;
  resolution?: ConflictResolution;
}

export enum ConflictType {
  EDIT_CONFLICT = 'EDIT_CONFLICT',
  DELETE_CONFLICT = 'DELETE_CONFLICT',
  SEQUENCE_CONFLICT = 'SEQUENCE_CONFLICT',
}

export enum ConflictResolution {
  SERVER_WINS = 'SERVER_WINS',
  CLIENT_WINS = 'CLIENT_WINS',
  MERGE = 'MERGE',
  MANUAL = 'MANUAL',
}
