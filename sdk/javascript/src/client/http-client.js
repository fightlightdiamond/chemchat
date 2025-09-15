import axios from 'axios';
import { EventEmitter } from 'eventemitter3';

/**
 * HTTP client for ChemChat API
 */
export class ChemChatHttpClient extends EventEmitter {
  constructor(config) {
    super();
    
    this.config = config;
    this.accessToken = null;
    this.refreshToken = null;
    this.isRefreshing = false;
    this.refreshPromise = null;
    
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

  setupInterceptors() {
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
        
        const apiError = {
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

  async refreshAccessToken() {
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

  async performTokenRefresh() {
    if (!this.refreshToken) {
      throw new Error('No refresh token available');
    }

    const response = await axios.post(
      `${this.config.apiUrl}/api/v1/auth/refresh`,
      { refreshToken: this.refreshToken },
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

  setTokens(accessToken, refreshToken) {
    this.accessToken = accessToken;
    if (refreshToken) {
      this.refreshToken = refreshToken;
    }
  }

  clearTokens() {
    this.accessToken = null;
    this.refreshToken = null;
  }

  // Authentication Methods
  async login(credentials) {
    const response = await this.client.post('/auth/login', credentials);
    const { accessToken, refreshToken } = response.data;
    this.setTokens(accessToken, refreshToken);
    return response.data;
  }

  async logout() {
    await this.client.post('/auth/logout');
    this.clearTokens();
  }

  async refreshAuth() {
    if (!this.refreshToken) {
      throw new Error('No refresh token available');
    }
    
    const response = await this.client.post('/auth/refresh', {
      refreshToken: this.refreshToken,
    });
    
    const { accessToken, refreshToken } = response.data;
    this.setTokens(accessToken, refreshToken);
    return response.data;
  }

  // User Methods
  async getCurrentUser() {
    const response = await this.client.get('/users/me');
    return response.data;
  }

  async updateProfile(data) {
    const response = await this.client.put('/users/me', data);
    return response.data;
  }

  async getUser(userId) {
    const response = await this.client.get(`/users/${userId}`);
    return response.data;
  }

  // Message Methods
  async sendMessage(request) {
    const response = await this.client.post('/messages', request);
    return response.data;
  }

  async editMessage(request) {
    const { messageId, ...data } = request;
    const response = await this.client.put(`/messages/${messageId}`, data);
    return response.data;
  }

  async deleteMessage(messageId) {
    await this.client.delete(`/messages/${messageId}`);
  }

  async getMessage(messageId) {
    const response = await this.client.get(`/messages/${messageId}`);
    return response.data;
  }

  // Conversation Methods
  async getConversations(options) {
    const response = await this.client.get('/conversations', {
      params: options,
    });
    return response.data;
  }

  async getConversation(conversationId) {
    const response = await this.client.get(`/conversations/${conversationId}`);
    return response.data;
  }

  async createConversation(request) {
    const response = await this.client.post('/conversations', request);
    return response.data;
  }

  async updateConversation(request) {
    const { conversationId, ...data } = request;
    const response = await this.client.put(`/conversations/${conversationId}`, data);
    return response.data;
  }

  async joinConversation(request) {
    const { conversationId, ...data } = request;
    await this.client.post(`/conversations/${conversationId}/join`, data);
  }

  async leaveConversation(conversationId) {
    await this.client.post(`/conversations/${conversationId}/leave`);
  }

  async getConversationHistory(conversationId, options) {
    const response = await this.client.get(
      `/conversations/${conversationId}/messages`,
      { params: options }
    );
    return response.data;
  }

  // Search Methods
  async searchMessages(request) {
    const response = await this.client.get('/search/messages', {
      params: request,
    });
    return response.data;
  }

  async getSearchSuggestions(query) {
    const response = await this.client.get('/search/suggestions', {
      params: { query },
    });
    return response.data;
  }

  // Media Methods
  async requestUploadUrl(request) {
    const response = await this.client.post('/media/upload/url', request);
    return response.data;
  }

  async confirmUpload(attachmentId) {
    const response = await this.client.post(`/media/upload/${attachmentId}/confirm`);
    return response.data;
  }

  async getAttachment(attachmentId) {
    const response = await this.client.get(`/media/${attachmentId}`);
    return response.data;
  }

  async deleteAttachment(attachmentId) {
    await this.client.delete(`/media/${attachmentId}`);
  }

  async getDownloadUrl(attachmentId) {
    const response = await this.client.get(`/media/${attachmentId}/download`);
    return response.data;
  }

  // Notification Methods
  async getNotificationPreferences() {
    const response = await this.client.get('/notifications/preferences');
    return response.data;
  }

  async updateNotificationPreferences(preferences) {
    const response = await this.client.put('/notifications/preferences', preferences);
    return response.data;
  }

  async registerDevice(deviceToken, deviceType) {
    await this.client.post('/notifications/devices', {
      token: deviceToken,
      type: deviceType,
    });
  }

  async unregisterDevice(deviceId) {
    await this.client.delete(`/notifications/devices/${deviceId}`);
  }

  // Sync Methods
  async performSync(request) {
    const response = await this.client.post('/sync/delta', request);
    return response.data;
  }

  async getClientState(deviceId) {
    const response = await this.client.get(`/sync/state/${deviceId}`);
    return response.data;
  }

  async updateClientState(deviceId, state) {
    const response = await this.client.put(`/sync/state/${deviceId}`, state);
    return response.data;
  }

  // Health Methods
  async getHealth() {
    const response = await this.client.get('/health');
    return response.data;
  }
}
