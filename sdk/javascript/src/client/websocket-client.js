import { io } from 'socket.io-client';
import { EventEmitter } from 'eventemitter3';

/**
 * WebSocket client for ChemChat real-time communication
 */
export class ChemChatWebSocketClient extends EventEmitter {
  constructor(config, options = {}) {
    super();
    
    this.config = config;
    this.options = {
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      timeout: 20000,
      ...options,
    };
    
    this.socket = null;
    this.accessToken = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = this.options.reconnectionAttempts;
  }

  async connect(accessToken) {
    return new Promise((resolve, reject) => {
      this.accessToken = accessToken;
      
      const wsUrl = this.config.wsUrl || this.config.apiUrl.replace(/^http/, 'ws');
      
      this.socket = io(wsUrl, {
        auth: {
          token: accessToken,
        },
        query: {
          tenantId: this.config.tenantId,
        },
        autoConnect: this.options.autoConnect,
        reconnection: this.options.reconnection,
        reconnectionAttempts: this.maxReconnectAttempts,
        reconnectionDelay: this.options.reconnectionDelay,
        timeout: this.options.timeout,
        transports: ['websocket', 'polling'],
      });

      this.setupEventHandlers();

      this.socket.on('connect', () => {
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.emit('connection:connected');
        this.emit('connect');
        resolve();
      });

      this.socket.on('connect_error', (error) => {
        this.emit('connection:error', error);
        this.emit('error', error);
        reject(error);
      });

      this.socket.on('disconnect', (reason) => {
        this.isConnected = false;
        this.emit('connection:disconnected', reason);
        this.emit('disconnect', reason);
      });

      if (!this.options.autoConnect) {
        this.socket.connect();
      }
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.isConnected = false;
    this.accessToken = null;
  }

  reconnect() {
    if (this.socket && this.accessToken) {
      this.socket.auth = { token: this.accessToken };
      this.socket.connect();
    }
  }

  updateToken(accessToken) {
    this.accessToken = accessToken;
    if (this.socket) {
      this.socket.auth = { token: accessToken };
    }
  }

  setupEventHandlers() {
    if (!this.socket) return;

    // Reconnection events
    this.socket.on('reconnect_attempt', (attempt) => {
      this.reconnectAttempts = attempt;
      this.emit('connection:reconnecting', attempt);
    });

    this.socket.on('reconnect', () => {
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.emit('connection:reconnected');
    });

    // Message events
    this.socket.on('message_created', (message) => {
      this.emit('message_created', message);
    });

    this.socket.on('message_edited', (message) => {
      this.emit('message_edited', message);
    });

    this.socket.on('message_deleted', (data) => {
      this.emit('message_deleted', data.messageId);
    });

    // Conversation events
    this.socket.on('conversation_created', (conversation) => {
      this.emit('conversation_created', conversation);
    });

    this.socket.on('conversation_updated', (conversation) => {
      this.emit('conversation_updated', conversation);
    });

    this.socket.on('user_joined', (data) => {
      this.emit('user_joined', data);
    });

    this.socket.on('user_left', (data) => {
      this.emit('user_left', data);
    });

    // Presence events
    this.socket.on('user_presence_changed', (presence) => {
      this.emit('user_presence_changed', presence);
    });

    this.socket.on('user_typing', (typing) => {
      this.emit('user_typing', typing);
    });

    // Notification events
    this.socket.on('notification_received', (notification) => {
      this.emit('notification_received', notification);
    });
  }

  // Message Methods
  sendMessage(data) {
    this.emitEvent('send_message', data);
  }

  editMessage(data) {
    this.emitEvent('edit_message', data);
  }

  deleteMessage(data) {
    this.emitEvent('delete_message', data);
  }

  // Conversation Methods
  joinRoom(conversationId) {
    this.emitEvent('join_room', { conversationId });
  }

  leaveRoom(conversationId) {
    this.emitEvent('leave_room', { conversationId });
  }

  getHistory(data) {
    this.emitEvent('get_history', data);
  }

  // Presence Methods
  updatePresence(status) {
    this.emitEvent('update_presence', { status });
  }

  sendHeartbeat() {
    this.emitEvent('heartbeat', { timestamp: Date.now() });
  }

  // Typing Indicators
  startTyping(conversationId) {
    this.emitEvent('start_typing', { conversationId });
  }

  stopTyping(conversationId) {
    this.emitEvent('stop_typing', { conversationId });
  }

  // Utility Methods
  isConnectedToServer() {
    return this.isConnected && this.socket && this.socket.connected;
  }

  getConnectionState() {
    return {
      connected: this.isConnected,
      reconnectAttempts: this.reconnectAttempts,
      socketId: this.socket ? this.socket.id : null,
    };
  }

  // Event emission wrapper
  emitEvent(event, data) {
    if (this.socket && this.isConnected) {
      this.socket.emit(event, data);
    }
  }

  // Listener management
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

  onNotification(callback) {
    this.on('notification_received', callback);
    return () => this.off('notification_received', callback);
  }

  onConnectionChange(callback) {
    const handler = () => callback(this.isConnected);
    
    this.on('connection:connected', handler);
    this.on('connection:disconnected', handler);
    
    return () => {
      this.off('connection:connected', handler);
      this.off('connection:disconnected', handler);
    };
  }
}
