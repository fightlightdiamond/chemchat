import { EventEmitter } from 'eventemitter3';
import { ChemChatHttpClient } from './http-client.js';
import { ChemChatWebSocketClient } from './websocket-client.js';

/**
 * Main ChemChat client that combines HTTP and WebSocket functionality
 */
export class ChemChatClient extends EventEmitter {
  constructor(config, options = {}) {
    super();
    
    this.config = config;
    this.options = {
      enableWebSocket: true,
      enableSync: true,
      syncInterval: 30000,
      deviceId: this.generateDeviceId(),
      ...options,
    };
    
    this.httpClient = new ChemChatHttpClient(config);
    this.currentUser = null;
    this.syncInterval = null;
    this.deviceId = this.options.deviceId;
    
    if (this.options.enableWebSocket) {
      this.wsClient = new ChemChatWebSocketClient(config);
      this.setupWebSocketEvents();
    }
    
    this.setupHttpEvents();
  }

  generateDeviceId() {
    return `device-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  setupHttpEvents() {
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

  setupWebSocketEvents() {
    if (!this.wsClient) return;

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
  async login(credentials) {
    const authResponse = await this.httpClient.login(credentials);
    this.currentUser = authResponse.user;
    
    if (this.wsClient) {
      await this.wsClient.connect(authResponse.accessToken);
    }
    
    this.emit('auth:login', this.currentUser);
    return this.currentUser;
  }

  async logout() {
    await this.httpClient.logout();
    this.disconnect();
    this.currentUser = null;
    this.emit('auth:logout');
  }

  async refreshAuth() {
    const authResponse = await this.httpClient.refreshAuth();
    this.currentUser = authResponse.user;
    
    if (this.wsClient) {
      this.wsClient.updateToken(authResponse.accessToken);
    }
    
    return authResponse;
  }

  setTokens(accessToken, refreshToken) {
    this.httpClient.setTokens(accessToken, refreshToken);
    if (this.wsClient) {
      this.wsClient.updateToken(accessToken);
    }
  }

  // Connection Management
  async connect(accessToken) {
    if (accessToken) {
      this.httpClient.setTokens(accessToken);
    }
    
    if (this.wsClient) {
      const token = accessToken || await this.getValidToken();
      await this.wsClient.connect(token);
    }
  }

  disconnect() {
    this.stopSync();
    if (this.wsClient) {
      this.wsClient.disconnect();
    }
  }

  async getValidToken() {
    throw new Error('No access token available. Please login first.');
  }

  // User Methods
  async getCurrentUser() {
    if (!this.currentUser) {
      this.currentUser = await this.httpClient.getCurrentUser();
    }
    return this.currentUser;
  }

  async updateProfile(data) {
    const updatedUser = await this.httpClient.updateProfile(data);
    this.currentUser = updatedUser;
    return updatedUser;
  }

  async getUser(userId) {
    return this.httpClient.getUser(userId);
  }

  // Message Methods
  async sendMessage(request) {
    const message = await this.httpClient.sendMessage(request);
    
    if (this.wsClient && this.wsClient.isConnectedToServer()) {
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

  async editMessage(messageId, content) {
    const message = await this.httpClient.editMessage({ messageId, content });
    
    if (this.wsClient && this.wsClient.isConnectedToServer()) {
      this.wsClient.editMessage({ messageId, content });
    }
    
    return message;
  }

  async deleteMessage(messageId) {
    await this.httpClient.deleteMessage(messageId);
    
    if (this.wsClient && this.wsClient.isConnectedToServer()) {
      this.wsClient.deleteMessage({ messageId });
    }
  }

  // Conversation Methods
  async getConversations(options) {
    return this.httpClient.getConversations(options);
  }

  async getConversation(conversationId) {
    return this.httpClient.getConversation(conversationId);
  }

  async createConversation(request) {
    return this.httpClient.createConversation(request);
  }

  async joinConversation(conversationId, inviteCode) {
    await this.httpClient.joinConversation({ conversationId, inviteCode });
    
    if (this.wsClient && this.wsClient.isConnectedToServer()) {
      this.wsClient.joinRoom(conversationId);
    }
  }

  async leaveConversation(conversationId) {
    await this.httpClient.leaveConversation(conversationId);
    
    if (this.wsClient && this.wsClient.isConnectedToServer()) {
      this.wsClient.leaveRoom(conversationId);
    }
  }

  async getConversationHistory(conversationId, options) {
    return this.httpClient.getConversationHistory(conversationId, options);
  }

  // Search Methods
  async searchMessages(request) {
    return this.httpClient.searchMessages(request);
  }

  async getSearchSuggestions(query) {
    return this.httpClient.getSearchSuggestions(query);
  }

  // Media Methods
  async uploadFile(file, request, onProgress) {
    const uploadResponse = await this.httpClient.requestUploadUrl(request);
    
    const formData = new FormData();
    Object.entries(uploadResponse.fields).forEach(([key, value]) => {
      formData.append(key, value);
    });
    formData.append('file', file);
    
    // Upload with progress tracking
    await fetch(uploadResponse.uploadUrl, {
      method: 'POST',
      body: formData,
    });
    
    return this.httpClient.confirmUpload(uploadResponse.attachmentId);
  }

  // Presence Methods
  updatePresence(status) {
    if (this.wsClient && this.wsClient.isConnectedToServer()) {
      this.wsClient.updatePresence(status);
    }
  }

  startTyping(conversationId) {
    if (this.wsClient && this.wsClient.isConnectedToServer()) {
      this.wsClient.startTyping(conversationId);
    }
  }

  stopTyping(conversationId) {
    if (this.wsClient && this.wsClient.isConnectedToServer()) {
      this.wsClient.stopTyping(conversationId);
    }
  }

  // Notification Methods
  async getNotificationPreferences() {
    return this.httpClient.getNotificationPreferences();
  }

  async updateNotificationPreferences(preferences) {
    return this.httpClient.updateNotificationPreferences(preferences);
  }

  async registerDevice(deviceToken, deviceType) {
    return this.httpClient.registerDevice(deviceToken, deviceType);
  }

  // Sync Methods
  startSync() {
    if (!this.options.enableSync || this.syncInterval) return;
    
    const interval = this.options.syncInterval || 30000;
    this.syncInterval = setInterval(() => {
      this.performSync().catch((error) => {
        console.error('Sync failed:', error);
      });
    }, interval);
  }

  stopSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  async performSync(lastSequenceNumber) {
    const request = {
      deviceId: this.deviceId,
      lastSequenceNumber,
      includeDeleted: true,
    };
    
    const result = await this.httpClient.performSync(request);
    this.emit('sync:completed', result);
    
    return result;
  }

  async getClientState() {
    return this.httpClient.getClientState(this.deviceId);
  }

  async updateClientState(state) {
    return this.httpClient.updateClientState(this.deviceId, state);
  }

  // Utility Methods
  isConnected() {
    return this.wsClient ? this.wsClient.isConnectedToServer() : false;
  }

  getCurrentUserId() {
    return this.currentUser ? this.currentUser.id : null;
  }

  getDeviceId() {
    return this.deviceId;
  }

  // Event Listener Helpers
  onMessage(callback) {
    this.on('message_created', callback);
    return () => this.off('message_created', callback);
  }

  onPresenceChange(callback) {
    this.on('user_presence_changed', callback);
    return () => this.off('user_presence_changed', callback);
  }

  onTyping(callback) {
    this.on('user_typing', callback);
    return () => this.off('user_typing', callback);
  }

  onConnectionChange(callback) {
    const handler = () => callback(this.isConnected());
    
    this.on('connect', handler);
    this.on('disconnect', handler);
    
    return () => {
      this.off('connect', handler);
      this.off('disconnect', handler);
    };
  }
}
