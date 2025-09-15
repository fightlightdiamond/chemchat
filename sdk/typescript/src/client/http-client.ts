import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { EventEmitter } from 'eventemitter3';
import {
  ChemChatConfig,
  ApiError,
  AuthResponse,
  LoginCredentials,
  RefreshTokenRequest,
  User,
  Message,
  Conversation,
  SendMessageRequest,
  EditMessageRequest,
  CreateConversationRequest,
  UpdateConversationRequest,
  JoinConversationRequest,
  SearchRequest,
  SearchResult,
  SearchSuggestion,
  MediaUploadRequest,
  MediaUploadResponse,
  Attachment,
  NotificationPreferences,
  PaginatedResult,
  PaginationOptions,
  SyncRequest,
  SyncResponse,
  ClientState,
} from '../types';

export interface HttpClientEvents {
  'auth:token-refreshed': (token: string) => void;
  'auth:token-expired': () => void;
  'request:start': (config: AxiosRequestConfig) => void;
  'request:success': (response: AxiosResponse) => void;
  'request:error': (error: ApiError) => void;
  'rate-limit': (retryAfter: number) => void;
}

export class ChemChatHttpClient extends EventEmitter<HttpClientEvents> {
  private client: AxiosInstance;
  private accessToken?: string;
  private refreshToken?: string;
  private isRefreshing = false;
  private refreshPromise?: Promise<string>;

  constructor(private config: ChemChatConfig) {
    super();
    
    this.client = axios.create({
      baseURL: `${config.apiUrl}/api/v1`,
      timeout: config.timeout || 30000,
      headers: {
        'Content-Type': 'application/json',
        'X-Tenant-ID': config.tenantId,
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    // Request interceptor
    this.client.interceptors.request.use(
      (config) => {
        this.emit('request:start', config);
        
        if (this.accessToken) {
          config.headers.Authorization = `Bearer ${this.accessToken}`;
        }
        
        if (this.config.apiKey) {
          config.headers['X-API-Key'] = this.config.apiKey;
        }
        
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor
    this.client.interceptors.response.use(
      (response) => {
        this.emit('request:success', response);
        return response;
      },
      async (error) => {
        const originalRequest = error.config;
        
        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;
          
          if (this.refreshToken && !this.isRefreshing) {
            try {
              const newToken = await this.refreshAccessToken();
              originalRequest.headers.Authorization = `Bearer ${newToken}`;
              return this.client(originalRequest);
            } catch (refreshError) {
              this.emit('auth:token-expired');
              throw refreshError;
            }
          }
        }
        
        if (error.response?.status === 429) {
          const retryAfter = parseInt(error.response.headers['retry-after'] || '60');
          this.emit('rate-limit', retryAfter);
        }
        
        const apiError: ApiError = {
          statusCode: error.response?.status || 500,
          message: error.response?.data?.message || error.message,
          error: error.response?.data?.error || 'Internal Server Error',
          timestamp: error.response?.data?.timestamp || new Date().toISOString(),
          path: error.response?.data?.path || originalRequest.url,
          correlationId: error.response?.data?.correlationId || '',
          details: error.response?.data?.details,
        };
        
        this.emit('request:error', apiError);
        throw apiError;
      }
    );
  }

  private async refreshAccessToken(): Promise<string> {
    if (this.isRefreshing && this.refreshPromise) {
      return this.refreshPromise;
    }

    this.isRefreshing = true;
    this.refreshPromise = this.performTokenRefresh();

    try {
      const token = await this.refreshPromise;
      this.isRefreshing = false;
      return token;
    } catch (error) {
      this.isRefreshing = false;
      throw error;
    }
  }

  private async performTokenRefresh(): Promise<string> {
    if (!this.refreshToken) {
      throw new Error('No refresh token available');
    }

    const response = await axios.post<AuthResponse>(
      `${this.config.apiUrl}/api/v1/auth/refresh`,
      { refreshToken: this.refreshToken } as RefreshTokenRequest,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-ID': this.config.tenantId,
        },
      }
    );

    const { accessToken, refreshToken } = response.data;
    this.setTokens(accessToken, refreshToken);
    this.emit('auth:token-refreshed', accessToken);
    
    return accessToken;
  }

  public setTokens(accessToken: string, refreshToken?: string): void {
    this.accessToken = accessToken;
    if (refreshToken) {
      this.refreshToken = refreshToken;
    }
  }

  public clearTokens(): void {
    this.accessToken = undefined;
    this.refreshToken = undefined;
  }

  // Authentication Methods
  public async login(credentials: LoginCredentials): Promise<AuthResponse> {
    const response = await this.client.post<AuthResponse>('/auth/login', credentials);
    const { accessToken, refreshToken } = response.data;
    this.setTokens(accessToken, refreshToken);
    return response.data;
  }

  public async logout(): Promise<void> {
    await this.client.post('/auth/logout');
    this.clearTokens();
  }

  public async refreshAuth(): Promise<AuthResponse> {
    if (!this.refreshToken) {
      throw new Error('No refresh token available');
    }
    
    const response = await this.client.post<AuthResponse>('/auth/refresh', {
      refreshToken: this.refreshToken,
    } as RefreshTokenRequest);
    
    const { accessToken, refreshToken } = response.data;
    this.setTokens(accessToken, refreshToken);
    return response.data;
  }

  // User Methods
  public async getCurrentUser(): Promise<User> {
    const response = await this.client.get<User>('/users/me');
    return response.data;
  }

  public async updateProfile(data: Partial<User>): Promise<User> {
    const response = await this.client.put<User>('/users/me', data);
    return response.data;
  }

  public async getUser(userId: string): Promise<User> {
    const response = await this.client.get<User>(`/users/${userId}`);
    return response.data;
  }

  // Message Methods
  public async sendMessage(request: SendMessageRequest): Promise<Message> {
    const response = await this.client.post<Message>('/messages', request);
    return response.data;
  }

  public async editMessage(request: EditMessageRequest): Promise<Message> {
    const { messageId, ...data } = request;
    const response = await this.client.put<Message>(`/messages/${messageId}`, data);
    return response.data;
  }

  public async deleteMessage(messageId: string): Promise<void> {
    await this.client.delete(`/messages/${messageId}`);
  }

  public async getMessage(messageId: string): Promise<Message> {
    const response = await this.client.get<Message>(`/messages/${messageId}`);
    return response.data;
  }

  // Conversation Methods
  public async getConversations(options?: PaginationOptions): Promise<PaginatedResult<Conversation>> {
    const response = await this.client.get<PaginatedResult<Conversation>>('/conversations', {
      params: options,
    });
    return response.data;
  }

  public async getConversation(conversationId: string): Promise<Conversation> {
    const response = await this.client.get<Conversation>(`/conversations/${conversationId}`);
    return response.data;
  }

  public async createConversation(request: CreateConversationRequest): Promise<Conversation> {
    const response = await this.client.post<Conversation>('/conversations', request);
    return response.data;
  }

  public async updateConversation(request: UpdateConversationRequest): Promise<Conversation> {
    const { conversationId, ...data } = request;
    const response = await this.client.put<Conversation>(`/conversations/${conversationId}`, data);
    return response.data;
  }

  public async joinConversation(request: JoinConversationRequest): Promise<void> {
    const { conversationId, ...data } = request;
    await this.client.post(`/conversations/${conversationId}/join`, data);
  }

  public async leaveConversation(conversationId: string): Promise<void> {
    await this.client.post(`/conversations/${conversationId}/leave`);
  }

  public async getConversationHistory(
    conversationId: string,
    options?: PaginationOptions
  ): Promise<PaginatedResult<Message>> {
    const response = await this.client.get<PaginatedResult<Message>>(
      `/conversations/${conversationId}/messages`,
      { params: options }
    );
    return response.data;
  }

  // Search Methods
  public async searchMessages(request: SearchRequest): Promise<PaginatedResult<SearchResult>> {
    const response = await this.client.get<PaginatedResult<SearchResult>>('/search/messages', {
      params: request,
    });
    return response.data;
  }

  public async getSearchSuggestions(query: string): Promise<SearchSuggestion[]> {
    const response = await this.client.get<SearchSuggestion[]>('/search/suggestions', {
      params: { query },
    });
    return response.data;
  }

  // Media Methods
  public async requestUploadUrl(request: MediaUploadRequest): Promise<MediaUploadResponse> {
    const response = await this.client.post<MediaUploadResponse>('/media/upload/url', request);
    return response.data;
  }

  public async confirmUpload(attachmentId: string): Promise<Attachment> {
    const response = await this.client.post<Attachment>(`/media/upload/${attachmentId}/confirm`);
    return response.data;
  }

  public async getAttachment(attachmentId: string): Promise<Attachment> {
    const response = await this.client.get<Attachment>(`/media/${attachmentId}`);
    return response.data;
  }

  public async deleteAttachment(attachmentId: string): Promise<void> {
    await this.client.delete(`/media/${attachmentId}`);
  }

  public async getDownloadUrl(attachmentId: string): Promise<{ url: string; expiresIn: number }> {
    const response = await this.client.get<{ url: string; expiresIn: number }>(
      `/media/${attachmentId}/download`
    );
    return response.data;
  }

  // Notification Methods
  public async getNotificationPreferences(): Promise<NotificationPreferences> {
    const response = await this.client.get<NotificationPreferences>('/notifications/preferences');
    return response.data;
  }

  public async updateNotificationPreferences(
    preferences: Partial<NotificationPreferences>
  ): Promise<NotificationPreferences> {
    const response = await this.client.put<NotificationPreferences>(
      '/notifications/preferences',
      preferences
    );
    return response.data;
  }

  public async registerDevice(deviceToken: string, deviceType: string): Promise<void> {
    await this.client.post('/notifications/devices', {
      token: deviceToken,
      type: deviceType,
    });
  }

  public async unregisterDevice(deviceId: string): Promise<void> {
    await this.client.delete(`/notifications/devices/${deviceId}`);
  }

  // Sync Methods
  public async performSync(request: SyncRequest): Promise<SyncResponse> {
    const response = await this.client.post<SyncResponse>('/sync/delta', request);
    return response.data;
  }

  public async getClientState(deviceId: string): Promise<ClientState> {
    const response = await this.client.get<ClientState>(`/sync/state/${deviceId}`);
    return response.data;
  }

  public async updateClientState(deviceId: string, state: Partial<ClientState>): Promise<ClientState> {
    const response = await this.client.put<ClientState>(`/sync/state/${deviceId}`, state);
    return response.data;
  }

  // Health Methods
  public async getHealth(): Promise<{ status: string; timestamp: string }> {
    const response = await this.client.get<{ status: string; timestamp: string }>('/health');
    return response.data;
  }
}
