import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MongoDBChangeStreamsService, ChangeStreamEvent } from './mongodb-change-streams.service';
import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';

export interface RealtimeEvent {
  type: string;
  data: any;
  tenantId?: string;
  userId?: string;
  timestamp: Date;
}

export interface UserPresence {
  userId: string;
  status: 'online' | 'away' | 'busy' | 'offline';
  lastSeen: Date;
  deviceId?: string;
  tenantId?: string;
}

@Injectable()
@WebSocketGateway({
  namespace: '/realtime',
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
  },
})
export class RealtimeEventsService implements OnModuleInit {
  private readonly logger = new Logger(RealtimeEventsService.name);
  private userPresence: Map<string, UserPresence> = new Map();
  private userRooms: Map<string, Set<string>> = new Map(); // userId -> Set of room IDs

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly changeStreams: MongoDBChangeStreamsService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.setupChangeStreamListeners();
    await this.setupEventListeners();
  }

  /**
   * Setup MongoDB change stream listeners
   */
  private async setupChangeStreamListeners(): Promise<void> {
    // Listen to messages collection changes
    this.changeStreams.subscribe('messages', (event: ChangeStreamEvent) => {
      this.handleMessageChange(event);
    });

    // Listen to conversations collection changes
    this.changeStreams.subscribe('conversations', (event: ChangeStreamEvent) => {
      this.handleConversationChange(event);
    });

    // Listen to user_conversations collection changes
    this.changeStreams.subscribe('user_conversations', (event: ChangeStreamEvent) => {
      this.handleUserConversationChange(event);
    });

    this.logger.log('Change stream listeners setup completed');
  }

  /**
   * Setup application event listeners
   */
  private async setupEventListeners(): Promise<void> {
    // Listen to custom application events
    this.eventEmitter.on('message.created', (data: any) => {
      this.broadcastToConversation(data.conversationId, 'message.created', data);
    });

    this.eventEmitter.on('message.edited', (data: any) => {
      this.broadcastToConversation(data.conversationId, 'message.edited', data);
    });

    this.eventEmitter.on('message.deleted', (data: any) => {
      this.broadcastToConversation(data.conversationId, 'message.deleted', data);
    });

    this.eventEmitter.on('conversation.created', (data: any) => {
      this.broadcastToTenant(data.tenantId, 'conversation.created', data);
    });

    this.eventEmitter.on('conversation.updated', (data: any) => {
      this.broadcastToConversation(data.conversationId, 'conversation.updated', data);
    });

    this.eventEmitter.on('user.joined', (data: any) => {
      this.broadcastToConversation(data.conversationId, 'user.joined', data);
    });

    this.eventEmitter.on('user.left', (data: any) => {
      this.broadcastToConversation(data.conversationId, 'user.left', data);
    });

    this.logger.log('Application event listeners setup completed');
  }

  /**
   * Handle message change events
   */
  private handleMessageChange(event: ChangeStreamEvent): void {
    try {
      const message = event.fullDocument;
      if (!message) return;

      const realtimeEvent: RealtimeEvent = {
        type: `message.${event.operationType}`,
        data: {
          messageId: message.messageId,
          conversationId: message.conversationId,
          senderId: message.senderId,
          content: message.content,
          createdAt: message.createdAt,
          isEdited: message.isEdited,
          isDeleted: message.isDeleted,
        },
        tenantId: message.tenantId,
        userId: message.senderId,
        timestamp: event.timestamp,
      };

      // Broadcast to conversation room
      this.broadcastToConversation(message.conversationId, realtimeEvent.type, realtimeEvent.data);

      // Update user activity
      if (message.senderId) {
        this.updateUserActivity(message.senderId, message.tenantId);
      }

      this.logger.debug(`Handled message change: ${event.operationType}`, {
        messageId: message.messageId,
        conversationId: message.conversationId,
      });
    } catch (error) {
      this.logger.error('Failed to handle message change', error);
    }
  }

  /**
   * Handle conversation change events
   */
  private handleConversationChange(event: ChangeStreamEvent): void {
    try {
      const conversation = event.fullDocument;
      if (!conversation) return;

      const realtimeEvent: RealtimeEvent = {
        type: `conversation.${event.operationType}`,
        data: {
          conversationId: conversation.conversationId,
          title: conversation.title,
          type: conversation.type,
          memberCount: conversation.memberCount,
          lastMessage: conversation.lastMessage,
          updatedAt: conversation.updatedAt,
        },
        tenantId: conversation.tenantId,
        timestamp: event.timestamp,
      };

      // Broadcast to conversation room
      this.broadcastToConversation(conversation.conversationId, realtimeEvent.type, realtimeEvent.data);

      this.logger.debug(`Handled conversation change: ${event.operationType}`, {
        conversationId: conversation.conversationId,
      });
    } catch (error) {
      this.logger.error('Failed to handle conversation change', error);
    }
  }

  /**
   * Handle user conversation change events
   */
  private handleUserConversationChange(event: ChangeStreamEvent): void {
    try {
      const userConversation = event.fullDocument;
      if (!userConversation) return;

      const realtimeEvent: RealtimeEvent = {
        type: `user_conversation.${event.operationType}`,
        data: {
          userId: userConversation.userId,
          conversationId: userConversation.conversationId,
          unreadCount: userConversation.unreadCount,
          lastReadAt: userConversation.lastReadAt,
          isMuted: userConversation.isMuted,
          isPinned: userConversation.isPinned,
          preferences: userConversation.preferences,
        },
        tenantId: userConversation.tenantId,
        userId: userConversation.userId,
        timestamp: event.timestamp,
      };

      // Broadcast to user's personal room
      this.broadcastToUser(userConversation.userId, realtimeEvent.type, realtimeEvent.data);

      this.logger.debug(`Handled user conversation change: ${event.operationType}`, {
        userId: userConversation.userId,
        conversationId: userConversation.conversationId,
      });
    } catch (error) {
      this.logger.error('Failed to handle user conversation change', error);
    }
  }

  /**
   * Broadcast event to conversation room
   */
  private broadcastToConversation(conversationId: string, eventType: string, data: any): void {
    try {
      const room = `conversation:${conversationId}`;
      this.server.to(room).emit(eventType, {
        ...data,
        timestamp: new Date().toISOString(),
      });

      this.logger.debug(`Broadcasted to conversation room: ${room}`, { eventType });
    } catch (error) {
      this.logger.error(`Failed to broadcast to conversation ${conversationId}:`, error);
    }
  }

  /**
   * Broadcast event to user's personal room
   */
  private broadcastToUser(userId: string, eventType: string, data: any): void {
    try {
      const room = `user:${userId}`;
      this.server.to(room).emit(eventType, {
        ...data,
        timestamp: new Date().toISOString(),
      });

      this.logger.debug(`Broadcasted to user room: ${room}`, { eventType });
    } catch (error) {
      this.logger.error(`Failed to broadcast to user ${userId}:`, error);
    }
  }

  /**
   * Broadcast event to tenant
   */
  private broadcastToTenant(tenantId: string, eventType: string, data: any): void {
    try {
      const room = `tenant:${tenantId}`;
      this.server.to(room).emit(eventType, {
        ...data,
        timestamp: new Date().toISOString(),
      });

      this.logger.debug(`Broadcasted to tenant room: ${room}`, { eventType });
    } catch (error) {
      this.logger.error(`Failed to broadcast to tenant ${tenantId}:`, error);
    }
  }

  /**
   * Update user activity
   */
  private updateUserActivity(userId: string, tenantId?: string): void {
    try {
      const presence: UserPresence = {
        userId,
        status: 'online',
        lastSeen: new Date(),
        tenantId,
      };

      this.userPresence.set(userId, presence);

      // Broadcast presence update
      this.broadcastToUser(userId, 'presence.updated', presence);
    } catch (error) {
      this.logger.error(`Failed to update user activity for ${userId}:`, error);
    }
  }

  /**
   * Set user presence
   */
  setUserPresence(userId: string, status: UserPresence['status'], deviceId?: string, tenantId?: string): void {
    try {
      const presence: UserPresence = {
        userId,
        status,
        lastSeen: new Date(),
        deviceId,
        tenantId,
      };

      this.userPresence.set(userId, presence);

      // Broadcast presence update
      this.broadcastToUser(userId, 'presence.updated', presence);

      this.logger.debug(`Set user presence: ${userId} -> ${status}`);
    } catch (error) {
      this.logger.error(`Failed to set user presence for ${userId}:`, error);
    }
  }

  /**
   * Get user presence
   */
  getUserPresence(userId: string): UserPresence | undefined {
    return this.userPresence.get(userId);
  }

  /**
   * Get all online users
   */
  getOnlineUsers(): UserPresence[] {
    return Array.from(this.userPresence.values()).filter(presence => presence.status === 'online');
  }

  /**
   * Join user to room
   */
  joinUserToRoom(userId: string, roomId: string): void {
    try {
      if (!this.userRooms.has(userId)) {
        this.userRooms.set(userId, new Set());
      }
      
      this.userRooms.get(userId)!.add(roomId);
      
      this.logger.debug(`User ${userId} joined room: ${roomId}`);
    } catch (error) {
      this.logger.error(`Failed to join user ${userId} to room ${roomId}:`, error);
    }
  }

  /**
   * Remove user from room
   */
  removeUserFromRoom(userId: string, roomId: string): void {
    try {
      const userRooms = this.userRooms.get(userId);
      if (userRooms) {
        userRooms.delete(roomId);
        if (userRooms.size === 0) {
          this.userRooms.delete(userId);
        }
      }
      
      this.logger.debug(`User ${userId} left room: ${roomId}`);
    } catch (error) {
      this.logger.error(`Failed to remove user ${userId} from room ${roomId}:`, error);
    }
  }

  /**
   * Get user rooms
   */
  getUserRooms(userId: string): string[] {
    const userRooms = this.userRooms.get(userId);
    return userRooms ? Array.from(userRooms) : [];
  }

  /**
   * Broadcast typing indicator
   */
  broadcastTypingIndicator(conversationId: string, userId: string, isTyping: boolean): void {
    try {
      const room = `conversation:${conversationId}`;
      this.server.to(room).emit('typing.indicator', {
        conversationId,
        userId,
        isTyping,
        timestamp: new Date().toISOString(),
      });

      this.logger.debug(`Broadcasted typing indicator: ${userId} -> ${conversationId}`);
    } catch (error) {
      this.logger.error(`Failed to broadcast typing indicator:`, error);
    }
  }

  /**
   * Get realtime statistics
   */
  getStatistics(): {
    connectedUsers: number;
    activeRooms: number;
    onlineUsers: number;
    changeStreamSubscriptions: number;
  } {
    return {
      connectedUsers: this.server.sockets.sockets.size,
      activeRooms: this.server.sockets.adapter.rooms.size,
      onlineUsers: this.getOnlineUsers().length,
      changeStreamSubscriptions: this.changeStreams.getActiveSubscriptions().length,
    };
  }
}