import { io, Socket } from 'socket.io-client';
import { EventEmitter } from 'eventemitter3';
import {
  ChemChatConfig,
  WebSocketEvents,
  Message,
  Conversation,
  User,
  PresenceStatus,
  TypingIndicator,
  Notification,
  OnlineStatus,
} from '../types';

export interface WebSocketClientEvents extends WebSocketEvents {
  'connection:connecting': () => void;
  'connection:connected': () => void;
  'connection:disconnected': (reason: string) => void;
  'connection:reconnecting': (attempt: number) => void;
  'connection:reconnected': () => void;
  'connection:error': (error: Error) => void;
}

export interface ConnectionOptions {
  autoConnect?: boolean;
  reconnection?: boolean;
  reconnectionAttempts?: number;
  reconnectionDelay?: number;
  timeout?: number;
}

export class ChemChatWebSocketClient extends EventEmitter<WebSocketClientEvents> {
  private socket?: Socket;
  private accessToken?: string;
  private isConnected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts: number;

  constructor(
    private config: ChemChatConfig,
    private options: ConnectionOptions = {}
  ) {
    super();
    
    this.maxReconnectAttempts = options.reconnectionAttempts || 5;
  }

  public connect(accessToken: string): Promise<void> {
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
        autoConnect: this.options.autoConnect !== false,
        reconnection: this.options.reconnection !== false,
        reconnectionAttempts: this.maxReconnectAttempts,
        reconnectionDelay: this.options.reconnectionDelay || 1000,
        timeout: this.options.timeout || 20000,
        transports: ['websocket'],
        upgrade: true,
        rememberUpgrade: true,
      });

      this.setupEventHandlers();

      // Connection events
      this.socket.on('connect', () => {
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.emit('connection:connected');
        this.emit('connect');
        resolve();
      });

      this.socket.on('connect_error', (error: any) => {
        this.emit('connection:error', error);
        this.emit('error', error);
        reject(error);
      });

      this.socket.on('disconnect', (reason: any) => {
        this.isConnected = false;
        this.emit('connection:disconnected', reason);
        this.emit('disconnect', reason);
      });

      // Manual connection if autoConnect is disabled
      if (this.options.autoConnect === false) {
        this.socket.connect();
      }
    });
  }

  public disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = undefined;
    }
    this.isConnected = false;
    this.accessToken = undefined;
  }

  public reconnect(): void {
    if (this.socket && this.accessToken) {
      this.socket.auth = { token: this.accessToken };
      this.socket.connect();
    }
  }

  public updateToken(accessToken: string): void {
    this.accessToken = accessToken;
    if (this.socket) {
      this.socket.auth = { token: accessToken };
    }
  }

  private setupEventHandlers(): void {
    if (!this.socket) return;

    // Reconnection events
    this.socket.on('reconnect_attempt', (attempt: any) => {
      this.reconnectAttempts = attempt;
      this.emit('connection:reconnecting', attempt);
    });

    this.socket.on('reconnect', () => {
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.emit('connection:reconnected');
    });

    // Message events
    this.socket.on('message_created', (message: Message) => {
      this.emit('message_created', message);
    });

    this.socket.on('message_edited', (message: Message) => {
      this.emit('message_edited', message);
    });

    this.socket.on('message_deleted', (data: { messageId: string; conversationId: string }) => {
      this.emit('message_deleted', data.messageId);
    });

    // Conversation events
    this.socket.on('conversation_created', (conversation: Conversation) => {
      this.emit('conversation_created', conversation);
    });

    this.socket.on('conversation_updated', (conversation: Conversation) => {
      this.emit('conversation_updated', conversation);
    });

    this.socket.on('user_joined', (data: { conversationId: string; user: User }) => {
      this.emit('user_joined', data);
    });

    this.socket.on('user_left', (data: { conversationId: string; userId: string }) => {
      this.emit('user_left', data);
    });

    // Presence events
    this.socket.on('user_presence_changed', (presence: PresenceStatus) => {
      this.emit('user_presence_changed', presence);
    });

    this.socket.on('user_typing', (typing: TypingIndicator) => {
      this.emit('user_typing', typing);
    });

    // Notification events
    this.socket.on('notification_received', (notification: Notification) => {
      this.emit('notification_received', notification);
    });
  }

  // Message Methods
  public sendMessage(data: {
    conversationId: string;
    content: string;
    type: string;
    clientMessageId?: string;
    replyToId?: string;
  }): void {
    this.emit('send_message', data);
  }

  public editMessage(data: {
    messageId: string;
    content: string;
  }): void {
    this.emit('edit_message', data);
  }

  public deleteMessage(data: {
    messageId: string;
  }): void {
    this.emit('delete_message', data);
  }

  // Conversation Methods
  public joinRoom(conversationId: string): void {
    this.emit('join_room', { conversationId });
  }

  public leaveRoom(conversationId: string): void {
    this.emit('leave_room', { conversationId });
  }

  public getHistory(data: {
    conversationId: string;
    limit?: number;
    cursor?: string;
  }): void {
    this.emit('get_history', data);
  }

  // Presence Methods
  public updatePresence(status: OnlineStatus): void {
    this.emit('update_presence', { status });
  }

  public sendHeartbeat(): void {
    this.emit('heartbeat', { timestamp: Date.now() });
  }

  // Typing Indicators
  public startTyping(conversationId: string): void {
    this.emit('start_typing', { conversationId });
  }

  public stopTyping(conversationId: string): void {
    this.emit('stop_typing', { conversationId });
  }

  // Utility Methods
  public isConnectedToServer(): boolean {
    return this.isConnected && this.socket?.connected === true;
  }

  public getConnectionState(): {
    connected: boolean;
    reconnectAttempts: number;
    socketId?: string;
  } {
    return {
      connected: this.isConnected,
      reconnectAttempts: this.reconnectAttempts,
      socketId: this.socket?.id,
    };
  }

  // Event emission wrapper
  public emit(event: string, data?: any): boolean {
    if (this.socket && this.isConnected) {
      this.socket.emit(event, data);
      return true;
    }
    return false;
  }

  // Listener management
  public onMessage(callback: (message: Message) => void): () => void {
    super.on('message_created', callback);
    return () => super.off('message_created', callback);
  }

  public onPresenceChange(callback: (presence: PresenceStatus) => void): () => void {
    super.on('user_presence_changed', callback);
    return () => super.off('user_presence_changed', callback);
  }

  public onTyping(callback: (typing: TypingIndicator) => void): () => void {
    super.on('user_typing', callback);
    return () => super.off('user_typing', callback);
  }

  public onNotification(callback: (notification: Notification) => void): () => void {
    super.on('notification_received', callback);
    return () => super.off('notification_received', callback);
  }

  public onConnectionChange(callback: (connected: boolean) => void): () => void {
    const handler = () => callback(this.isConnected);
    
    super.on('connection:connected', handler);
    super.on('connection:disconnected', handler);
    
    return () => {
      super.off('connection:connected', handler);
      super.off('connection:disconnected', handler);
    };
  }
}
