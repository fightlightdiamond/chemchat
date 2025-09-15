import { EventEmitter } from 'eventemitter3';
import { ChemChatHttpClient, HttpClientEvents } from './http-client';
import { ChemChatWebSocketClient, WebSocketClientEvents } from './websocket-client';
import {
  ChemChatConfig,
  ClientOptions,
  LoginCredentials,
  AuthResponse,
  User,
  Message,
  Conversation,
  SendMessageRequest,
  CreateConversationRequest,
  SearchRequest,
  MediaUploadRequest,
  NotificationPreferences,
  PresenceStatus,
  TypingIndicator,
  OnlineStatus,
  PaginatedResult,
  PaginationOptions,
  SyncRequest,
  SyncResponse,
  ClientState,
} from '../types';

export interface ChemChatClientEvents extends HttpClientEvents, WebSocketClientEvents {
  'auth:login': (user: User) => void;
  'auth:logout': () => void;
  'sync:completed': (result: SyncResponse) => void;
  'sync:conflict': (conflicts: any[]) => void;
}


export class ChemChatClient extends EventEmitter<ChemChatClientEvents> {
  private httpClient: ChemChatHttpClient;
  private wsClient?: ChemChatWebSocketClient;
  private currentUser?: User;
  private syncInterval?: NodeJS.Timeout;
  private deviceId: string;

  constructor(
    config: ChemChatConfig,
    private options: ClientOptions = {}
  ) {
    super();
    
    this.httpClient = new ChemChatHttpClient(config);
    this.deviceId = options.deviceId || this.generateDeviceId();
    
    if (options.enableWebSocket !== false) {
      this.wsClient = new ChemChatWebSocketClient(config);
      this.setupWebSocketEvents();
    }
    
    this.setupHttpEvents();
  }

  private generateDeviceId(): string {
    return `device-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private setupHttpEvents(): void {
    // Forward HTTP client events
    this.httpClient.on('auth:token-refreshed', (token) => {
      this.emit('auth:token-refreshed', token);
      if (this.wsClient) {
        this.wsClient.updateToken(token);
      }
    });

    this.httpClient.on('auth:token-expired', () => {
      this.emit('auth:token-expired');
      this.disconnect();
    });

    this.httpClient.on('request:start', (config) => {
      this.emit('request:start', config);
    });

    this.httpClient.on('request:success', (response) => {
      this.emit('request:success', response);
    });

    this.httpClient.on('request:error', (error) => {
      this.emit('request:error', error);
    });

    this.httpClient.on('rate-limit', (retryAfter) => {
      this.emit('rate-limit', retryAfter);
    });
  }

  private setupWebSocketEvents(): void {
    if (!this.wsClient) return;

    // Forward WebSocket events
    this.wsClient.on('connect', () => {
      this.emit('connect');
      this.startSync();
    });

    this.wsClient.on('disconnect', (reason) => {
      this.emit('disconnect', reason);
      this.stopSync();
    });

    this.wsClient.on('error', (error) => {
      this.emit('error', error);
    });

    this.wsClient.on('message_created', (message) => {
      this.emit('message_created', message);
    });

    this.wsClient.on('message_edited', (message) => {
      this.emit('message_edited', message);
    });

    this.wsClient.on('message_deleted', (messageId) => {
      this.emit('message_deleted', messageId);
    });

    this.wsClient.on('conversation_created', (conversation) => {
      this.emit('conversation_created', conversation);
    });

    this.wsClient.on('conversation_updated', (conversation) => {
      this.emit('conversation_updated', conversation);
    });

    this.wsClient.on('user_joined', (data) => {
      this.emit('user_joined', data);
    });

    this.wsClient.on('user_left', (data) => {
      this.emit('user_left', data);
    });

    this.wsClient.on('user_presence_changed', (presence) => {
      this.emit('user_presence_changed', presence);
    });

    this.wsClient.on('user_typing', (typing) => {
      this.emit('user_typing', typing);
    });

    this.wsClient.on('notification_received', (notification) => {
      this.emit('notification_received', notification);
    });
  }

  // Authentication Methods
  public async login(credentials: LoginCredentials): Promise<User> {
    const authResponse = await this.httpClient.login(credentials);
    this.currentUser = authResponse.user;
    
    if (this.wsClient) {
      await this.wsClient.connect(authResponse.accessToken);
    }
    
    this.emit('auth:login', this.currentUser);
    return this.currentUser;
  }

  public async logout(): Promise<void> {
    await this.httpClient.logout();
    this.disconnect();
    this.currentUser = undefined;
    this.emit('auth:logout');
  }

  public async refreshAuth(): Promise<AuthResponse> {
    const authResponse = await this.httpClient.refreshAuth();
    this.currentUser = authResponse.user;
    
    if (this.wsClient) {
      this.wsClient.updateToken(authResponse.accessToken);
    }
    
    return authResponse;
  }

  public setTokens(accessToken: string, refreshToken?: string): void {
    this.httpClient.setTokens(accessToken, refreshToken);
    if (this.wsClient) {
      this.wsClient.updateToken(accessToken);
    }
  }

  // Connection Management
  public async connect(accessToken?: string): Promise<void> {
    if (accessToken) {
      this.httpClient.setTokens(accessToken);
    }
    
    if (this.wsClient) {
      const token = accessToken || await this.getValidToken();
      await this.wsClient.connect(token);
    }
  }

  public disconnect(): void {
    this.stopSync();
    if (this.wsClient) {
      this.wsClient.disconnect();
    }
  }

  private async getValidToken(): Promise<string> {
    // This would typically get the current access token
    // For now, we'll assume it's handled by the HTTP client
    throw new Error('No access token available. Please login first.');
  }

  // User Methods
  public async getCurrentUser(): Promise<User> {
    if (!this.currentUser) {
      this.currentUser = await this.httpClient.getCurrentUser();
    }
    return this.currentUser;
  }

  public async updateProfile(data: Partial<User>): Promise<User> {
    const updatedUser = await this.httpClient.updateProfile(data);
    this.currentUser = updatedUser;
    return updatedUser;
  }

  public async getUser(userId: string): Promise<User> {
    return this.httpClient.getUser(userId);
  }

  // Message Methods
  public async sendMessage(request: SendMessageRequest): Promise<Message> {
    const message = await this.httpClient.sendMessage(request);
    
    // Also send via WebSocket for real-time delivery
    if (this.wsClient?.isConnectedToServer()) {
      this.wsClient.sendMessage({
        conversationId: request.conversationId,
        content: request.content,
        type: request.type,
        clientMessageId: request.clientMessageId,
        replyToId: request.replyToId,
      });
    }
    
    return message;
  }

  public async editMessage(messageId: string, content: string): Promise<Message> {
    const message = await this.httpClient.editMessage({ messageId, content });
    
    if (this.wsClient?.isConnectedToServer()) {
      this.wsClient.editMessage({ messageId, content });
    }
    
    return message;
  }

  public async deleteMessage(messageId: string): Promise<void> {
    await this.httpClient.deleteMessage(messageId);
    
    if (this.wsClient?.isConnectedToServer()) {
      this.wsClient.deleteMessage({ messageId });
    }
  }

  // Conversation Methods
  public async getConversations(options?: PaginationOptions): Promise<PaginatedResult<Conversation>> {
    return this.httpClient.getConversations(options);
  }

  public async getConversation(conversationId: string): Promise<Conversation> {
    return this.httpClient.getConversation(conversationId);
  }

  public async createConversation(request: CreateConversationRequest): Promise<Conversation> {
    return this.httpClient.createConversation(request);
  }

  public async joinConversation(conversationId: string, inviteCode?: string): Promise<void> {
    await this.httpClient.joinConversation({ conversationId, inviteCode });
    
    if (this.wsClient?.isConnectedToServer()) {
      this.wsClient.joinRoom(conversationId);
    }
  }

  public async leaveConversation(conversationId: string): Promise<void> {
    await this.httpClient.leaveConversation(conversationId);
    
    if (this.wsClient?.isConnectedToServer()) {
      this.wsClient.leaveRoom(conversationId);
    }
  }

  public async getConversationHistory(
    conversationId: string,
    options?: PaginationOptions
  ): Promise<PaginatedResult<Message>> {
    return this.httpClient.getConversationHistory(conversationId, options);
  }

  // Search Methods
  public async searchMessages(request: SearchRequest): Promise<PaginatedResult<any>> {
    return this.httpClient.searchMessages(request);
  }

  public async getSearchSuggestions(query: string): Promise<any[]> {
    return this.httpClient.getSearchSuggestions(query);
  }

  // Media Methods
  public async uploadFile(
    file: File | Buffer,
    request: MediaUploadRequest,
    onProgress?: (progress: number) => void
  ): Promise<any> {
    // Get upload URL
    const uploadResponse = await this.httpClient.requestUploadUrl(request);
    
    // Upload file to S3/storage
    const formData = new FormData();
    Object.entries(uploadResponse.fields).forEach(([key, value]) => {
      formData.append(key, value);
    });
    if (file instanceof File) {
      formData.append('file', file);
    } else {
      // Handle Buffer case - convert to Blob
      const blob = new Blob([new Uint8Array(file)]);
      formData.append('file', blob);
    }
    
    // Upload with progress tracking
    await fetch(uploadResponse.uploadUrl, {
      method: 'POST',
      body: formData,
    });
    
    // Confirm upload
    return this.httpClient.confirmUpload(uploadResponse.attachmentId);
  }

  // Presence Methods
  public updatePresence(status: OnlineStatus): void {
    if (this.wsClient?.isConnectedToServer()) {
      this.wsClient.updatePresence(status);
    }
  }

  public startTyping(conversationId: string): void {
    if (this.wsClient?.isConnectedToServer()) {
      this.wsClient.startTyping(conversationId);
    }
  }

  public stopTyping(conversationId: string): void {
    if (this.wsClient?.isConnectedToServer()) {
      this.wsClient.stopTyping(conversationId);
    }
  }

  // Notification Methods
  public async getNotificationPreferences(): Promise<NotificationPreferences> {
    return this.httpClient.getNotificationPreferences();
  }

  public async updateNotificationPreferences(
    preferences: Partial<NotificationPreferences>
  ): Promise<NotificationPreferences> {
    return this.httpClient.updateNotificationPreferences(preferences);
  }

  public async registerDevice(deviceToken: string, deviceType: string): Promise<void> {
    return this.httpClient.registerDevice(deviceToken, deviceType);
  }

  // Sync Methods
  private startSync(): void {
    if (!this.options.enableSync || this.syncInterval) return;
    
    const interval = this.options.syncInterval || 30000; // 30 seconds
    this.syncInterval = setInterval(() => {
      this.performSync().catch((error) => {
        console.error('Sync failed:', error);
      });
    }, interval);
  }

  private stopSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = undefined;
    }
  }

  public async performSync(lastSequenceNumber?: number): Promise<SyncResponse> {
    const request: SyncRequest = {
      deviceId: this.deviceId,
      lastSequenceNumber,
      includeDeleted: true,
    };
    
    const result = await this.httpClient.performSync(request);
    this.emit('sync:completed', result);
    
    return result;
  }

  public async getClientState(): Promise<ClientState> {
    return this.httpClient.getClientState(this.deviceId);
  }

  public async updateClientState(state: Partial<ClientState>): Promise<ClientState> {
    return this.httpClient.updateClientState(this.deviceId, state);
  }

  // Utility Methods
  public isConnected(): boolean {
    return this.wsClient?.isConnectedToServer() || false;
  }

  public getCurrentUserId(): string | undefined {
    return this.currentUser?.id;
  }

  public getDeviceId(): string {
    return this.deviceId;
  }

  // Event Listener Helpers
  public onMessage(callback: (message: Message) => void): () => void {
    this.on('message_created', callback);
    return () => this.off('message_created', callback);
  }

  public onPresenceChange(callback: (presence: PresenceStatus) => void): () => void {
    this.on('user_presence_changed', callback);
    return () => this.off('user_presence_changed', callback);
  }

  public onTyping(callback: (typing: TypingIndicator) => void): () => void {
    this.on('user_typing', callback);
    return () => this.off('user_typing', callback);
  }

  public onConnectionChange(callback: (connected: boolean) => void): () => void {
    const handler = () => callback(this.isConnected());
    
    this.on('connect', handler);
    this.on('disconnect', handler);
    
    return () => {
      this.off('connect', handler);
      this.off('disconnect', handler);
    };
  }
}
