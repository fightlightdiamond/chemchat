import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WsException,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { UseGuards, UsePipes, ValidationPipe, Logger } from '@nestjs/common';
import { WebSocketAuthGuard } from '../../auth/guards/websocket-auth.guard';
import { PresenceService } from '../services/presence.service';
import { TypingIndicatorService } from '../services/typing-indicator.service';
import { PresenceStatusType } from '../../shared/domain/value-objects/presence-status.vo';

// WebSocket event DTOs
export interface SetPresenceDto {
  status: 'online' | 'away' | 'busy' | 'offline';
  metadata?: Record<string, unknown>;
}

export interface TypingDto {
  conversationId: string;
  isTyping: boolean;
}

export interface GetPresenceDto {
  userIds: string[];
}

// Extended Socket interface with user data
interface AuthenticatedSocket extends Socket {
  data: {
    userId: string;
    tenantId?: string;
    deviceId?: string | null;
  };
}

@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
  },
  namespace: '/presence',
  transports: ['websocket', 'polling'],
})
@UseGuards(WebSocketAuthGuard)
export class PresenceGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(PresenceGateway.name);

  constructor(
    private readonly presenceService: PresenceService,
    private readonly typingService: TypingIndicatorService,
  ) {}

  afterInit() {
    this.logger.log('Presence WebSocket Gateway initialized');
  }

  async handleConnection(client: AuthenticatedSocket) {
    try {
      const { userId, tenantId, deviceId } = client.data;

      this.logger.log(
        `Presence client connected: ${client.id} (User: ${userId})`,
      );

      // Set user as online
      await this.presenceService.setPresence(
        userId,
        PresenceStatusType.ONLINE,
        deviceId,
        tenantId,
      );

      // Join user to their personal presence room for direct updates
      void client.join(`user:${userId}`);

      // Emit connection success with current presence
      const currentPresence = await this.presenceService.getPresence(userId);
      client.emit('presence_connected', {
        socketId: client.id,
        userId,
        presence: currentPresence,
        timestamp: new Date().toISOString(),
      });

      // Broadcast presence update to relevant conversations
      this.server.emit('presence_update', {
        userId,
        status: 'online',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.logger.error('Error handling presence connection:', error);
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: AuthenticatedSocket) {
    try {
      const { userId } = client.data;

      this.logger.log(
        `Presence client disconnected: ${client.id} (User: ${userId})`,
      );

      // Stop all typing indicators for this user
      await this.typingService.stopAllTyping(userId);

      // Set user as offline
      await this.presenceService.setOffline(userId);

      // Broadcast offline status
      this.server.emit('presence_update', {
        userId,
        status: 'offline',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.logger.error('Error handling presence disconnect:', error);
    }
  }

  @SubscribeMessage('set_presence')
  @UsePipes(new ValidationPipe({ transform: true }))
  async handleSetPresence(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: SetPresenceDto,
  ) {
    try {
      const { userId, tenantId, deviceId } = client.data;

      // Convert string status to PresenceStatusType enum
      let status: PresenceStatusType;
      switch (data.status) {
        case 'online':
          status = PresenceStatusType.ONLINE;
          break;
        case 'away':
          status = PresenceStatusType.AWAY;
          break;
        case 'busy':
          status = PresenceStatusType.BUSY;
          break;
        case 'offline':
          status = PresenceStatusType.OFFLINE;
          break;
        default:
          throw new WsException('Invalid presence status');
      }

      await this.presenceService.setPresence(
        userId,
        status,
        deviceId,
        tenantId,
        data.metadata,
      );

      // Broadcast presence update
      this.server.emit('presence_update', {
        userId,
        status: data.status,
        metadata: data.metadata,
        timestamp: new Date().toISOString(),
      });

      // Send confirmation to client
      client.emit('presence_set', {
        status: data.status,
        timestamp: new Date().toISOString(),
      });

      this.logger.debug(`User ${userId} set presence to ${data.status}`);
    } catch (error: unknown) {
      const safeError = error as Error;
      this.logger.error('Error setting presence:', safeError);
      client.emit('error', {
        event: 'set_presence',
        message:
          safeError instanceof WsException
            ? safeError.message
            : 'Failed to set presence',
      });
    }
  }

  @SubscribeMessage('get_presence')
  @UsePipes(new ValidationPipe({ transform: true }))
  async handleGetPresence(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: GetPresenceDto,
  ) {
    try {
      const presences = await this.presenceService.getMultiplePresences(
        data.userIds,
      );

      const presenceData = Array.from(presences.entries()).map(
        ([userId, presence]) => ({
          userId,
          status: presence.status.toString(),
          lastSeen: presence.lastSeen,
          deviceId: presence.deviceId,
          metadata: presence.metadata,
        }),
      );

      client.emit('presence_data', {
        presences: presenceData,
        timestamp: new Date().toISOString(),
      });
    } catch (error: unknown) {
      const safeError = error as Error;
      this.logger.error('Error getting presence:', safeError);
      client.emit('error', {
        event: 'get_presence',
        message: 'Failed to get presence data',
      });
    }
  }

  @SubscribeMessage('heartbeat')
  async handleHeartbeat(@ConnectedSocket() client: AuthenticatedSocket) {
    try {
      const { userId } = client.data;

      await this.presenceService.updateHeartbeat(userId);

      client.emit('heartbeat_ack', {
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.logger.error('Error handling heartbeat:', error);
    }
  }

  @SubscribeMessage('typing')
  @UsePipes(new ValidationPipe({ transform: true }))
  async handleTyping(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: TypingDto,
  ) {
    try {
      const { userId, tenantId, deviceId } = client.data;
      const { conversationId, isTyping } = data;

      if (isTyping) {
        await this.typingService.startTyping(
          userId,
          conversationId,
          deviceId,
          tenantId,
        );
      } else {
        await this.typingService.stopTyping(userId, conversationId);
      }

      // Broadcast typing indicator to conversation members (excluding sender)
      const eventName = isTyping ? 'typing_start' : 'typing_stop';
      client.to(conversationId).emit(eventName, {
        userId,
        conversationId,
        timestamp: new Date().toISOString(),
      });

      this.logger.debug(
        `User ${userId} ${isTyping ? 'started' : 'stopped'} typing in conversation ${conversationId}`,
      );
    } catch (error: unknown) {
      const safeError = error as Error;
      this.logger.error('Error handling typing indicator:', safeError);
      client.emit('error', {
        event: 'typing_indicator',
        message: 'Failed to handle typing indicator',
      });
    }
  }

  @SubscribeMessage('get_typing')
  async handleGetTyping(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { conversationId: string },
  ) {
    try {
      const typingUsers = await this.typingService.getTypingUsers(
        data.conversationId,
      );

      client.emit('typing_users', {
        conversationId: data.conversationId,
        users: typingUsers.map((indicator) => ({
          userId: indicator.userId,
          startedAt: indicator.startedAt,
          deviceId: indicator.deviceId,
        })),
        timestamp: new Date().toISOString(),
      });
    } catch (error: unknown) {
      const safeError = error as Error;
      this.logger.error('Error getting typing users:', safeError);
      client.emit('error', {
        event: 'get_typing_users',
        message: 'Failed to get typing users',
      });
    }
  }

  @SubscribeMessage('join_conversation')
  handleJoinConversation(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { conversationId: string },
  ) {
    try {
      void client.join(data.conversationId);

      client.emit('conversation_joined', {
        conversationId: data.conversationId,
        timestamp: new Date().toISOString(),
      });

      this.logger.debug(
        `User ${client.data.userId} joined conversation ${data.conversationId} for presence updates`,
      );
    } catch (error: unknown) {
      const safeError = error as Error;
      this.logger.error('Error joining conversation for presence:', safeError);
      client.emit('error', {
        event: 'join_conversation',
        message: 'Failed to join conversation',
      });
    }
  }

  @SubscribeMessage('leave_conversation')
  async handleLeaveConversation(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { conversationId: string },
  ) {
    try {
      const { userId } = client.data;
      const { conversationId } = data;

      // Stop typing in this conversation
      await this.typingService.stopTyping(userId, conversationId);

      void client.leave(conversationId);

      client.emit('conversation_left', {
        conversationId,
        timestamp: new Date().toISOString(),
      });

      this.logger.debug(
        `User ${userId} left conversation ${conversationId} for presence updates`,
      );
    } catch (error: unknown) {
      const safeError = error as Error;
      this.logger.error('Error leaving conversation for presence:', safeError);
      client.emit('error', {
        event: 'leave_conversation',
        message: 'Failed to leave conversation',
      });
    }
  }

  @SubscribeMessage('get_stats')
  async handleGetStats(@ConnectedSocket() client: AuthenticatedSocket) {
    try {
      const { tenantId } = client.data;

      const [presenceStats, typingStats] = await Promise.all([
        this.presenceService.getPresenceStats(tenantId),
        this.typingService.getTypingStats(),
      ]);

      client.emit('stats_data', {
        presence: presenceStats,
        typing: typingStats,
        timestamp: new Date().toISOString(),
      });
    } catch (error: unknown) {
      const safeError = error as Error;
      this.logger.error('Error updating heartbeat:', safeError);
      client.emit('error', {
        event: 'heartbeat',
        message: 'Failed to update heartbeat',
      });
    }
  }
}
