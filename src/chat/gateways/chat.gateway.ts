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
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { WebSocketAuthGuard } from '../../auth/guards/websocket-auth.guard';
import { ConnectionManagerService } from '../services/connection-manager.service';
import { RoomManagerService } from '../services/room-manager.service';
import { MessageBroadcastService } from '../services/message-broadcast.service';
import { PresenceService } from '../../presence/services/presence.service';
import { TypingIndicatorService } from '../../presence/services/typing-indicator.service';
import { PresenceStatusType } from '../../shared/domain/value-objects/presence-status.vo';

import { SendMessageCommand } from '../commands/send-message.command';
import { EditMessageCommand } from '../commands/edit-message.command';
import { DeleteMessageCommand } from '../commands/delete-message.command';
import { GetConversationHistoryQuery } from '../queries/get-conversation-history.query';
import { PaginationQuery } from '../../shared/cqrs/pagination.dto';
import { Message } from '../../shared/domain/entities/message.entity';
import { PaginatedResult } from '../../shared/domain/repositories/base.repository';

// Type guards for command/query bus results
function isMessage(value: unknown): value is Message {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const obj = value as Record<string, unknown>;
  return (
    typeof obj.id === 'string' &&
    typeof obj.conversationId === 'string' &&
    (obj.createdAt instanceof Date || typeof obj.createdAt === 'string')
  );
}

function isPaginatedResult(value: unknown): value is PaginatedResult<Message> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const obj = value as Record<string, unknown>;
  return (
    Array.isArray(obj.data) &&
    typeof obj.total === 'number' &&
    typeof obj.hasNext === 'boolean' &&
    typeof obj.hasPrevious === 'boolean'
  );
}

// WebSocket event DTOs
export interface JoinRoomDto {
  conversationId: string;
}

export interface LeaveRoomDto {
  conversationId: string;
}

export interface SendMessageDto {
  conversationId: string;
  content: string;
  clientMessageId?: string;
  replyToMessageId?: string;
  attachments?: Array<{
    name: string;
    type: string;
    size: string;
    url: string;
  }>;
}

export interface EditMessageDto {
  messageId: string;
  content: string;
}

export interface DeleteMessageDto {
  messageId: string;
}

export interface GetHistoryDto {
  conversationId: string;
  pagination?: PaginationQuery;
  beforeSequence?: string;
  afterSequence?: string;
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
  namespace: '/chat',
  transports: ['websocket', 'polling'],
})
@UseGuards(WebSocketAuthGuard)
export class ChatGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(ChatGateway.name);

  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
    private readonly connectionManager: ConnectionManagerService,
    private readonly roomManager: RoomManagerService,
    private readonly messageBroadcast: MessageBroadcastService,
    private readonly presenceService: PresenceService,
    private readonly typingService: TypingIndicatorService,
  ) {
    // Ensure proper initialization order
    this.validateDependencies();
  }

  private validateDependencies(): void {
    if (
      !this.roomManager ||
      !this.messageBroadcast ||
      !this.connectionManager
    ) {
      throw new Error('Required dependencies not properly injected');
    }
  }

  afterInit() {
    this.logger.log('WebSocket Gateway initialized');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    (this.messageBroadcast as any).setServer(this.server);
  }

  async handleConnection(client: AuthenticatedSocket) {
    try {
      const { userId, tenantId, deviceId } = client.data;

      this.logger.log(`Client connected: ${client.id} (User: ${userId})`);

      // Register connection
      await this.connectionManager.addConnection(userId, client.id, tenantId);

      // Set user presence as online
      await this.presenceService.setPresence(
        userId,
        PresenceStatusType.ONLINE,
        deviceId,
        tenantId,
      );

      // Emit connection success
      client.emit('connected', {
        socketId: client.id,
        userId,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.logger.error('Error handling connection:', error);
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: AuthenticatedSocket) {
    try {
      const { userId } = client.data;

      this.logger.log(`Client disconnected: ${client.id} (User: ${userId})`);

      // Stop all typing indicators for this user
      await this.typingService.stopAllTyping(userId);

      // Leave all rooms
      await this.roomManager.leaveAllRooms(client.id, userId);

      // Remove connection
      await this.connectionManager.removeConnection(userId, client.id);

      // Set user as offline
      await this.presenceService.setOffline(userId);
    } catch (error) {
      this.logger.error('Error handling disconnect:', error);
    }
  }

  @SubscribeMessage('join_room')
  @UsePipes(new ValidationPipe({ transform: true }))
  async handleJoinRoom(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: JoinRoomDto,
  ) {
    try {
      const { userId, tenantId } = client.data;
      const { conversationId } = data;

      // Check if user has access to the conversation
      const canJoin = await this.roomManager.canUserJoinRoom(
        userId,
        conversationId,
        tenantId,
      );

      if (!canJoin) {
        throw new WsException('Access denied to conversation');
      }

      // Join the room
      await this.roomManager.joinRoom(client.id, userId, conversationId);
      void client.join(conversationId);

      // Notify room members
      void this.messageBroadcast.broadcastUserJoined(conversationId, userId);
      client.to(conversationId).emit('user_joined', {
        userId,
        conversationId,
        timestamp: new Date().toISOString(),
      });

      // Send confirmation to client
      client.emit('room_joined', {
        conversationId,
        timestamp: new Date().toISOString(),
      });

      this.logger.log(`User ${userId} joined room ${conversationId}`);
    } catch (error) {
      this.logger.error('Error joining room:', error);
      client.emit('error', {
        event: 'join_room',
        message:
          error instanceof WsException ? error.message : 'Failed to join room',
      });
    }
  }

  @SubscribeMessage('leave_room')
  @UsePipes(new ValidationPipe({ transform: true }))
  async handleLeaveRoom(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: LeaveRoomDto,
  ) {
    try {
      const { userId } = client.data;
      const { conversationId } = data;

      // Leave the room
      await this.roomManager.leaveRoom(client.id, userId, conversationId);
      void client.leave(conversationId);

      // Notify room members
      client.to(conversationId).emit('user_left', {
        userId,
        conversationId,
        timestamp: new Date().toISOString(),
      });

      // Send confirmation to client
      client.emit('room_left', {
        conversationId,
        timestamp: new Date().toISOString(),
      });

      this.logger.log(`User ${userId} left room ${conversationId}`);
    } catch (error) {
      this.logger.error('Error leaving room:', error);
      client.emit('error', {
        event: 'leave_room',
        message: 'Failed to leave room',
      });
    }
  }

  @SubscribeMessage('send_message')
  @UsePipes(new ValidationPipe({ transform: true }))
  async handleSendMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: SendMessageDto,
  ) {
    try {
      const { userId, tenantId } = client.data;

      const command = new SendMessageCommand({
        conversationId: data.conversationId,
        content: data.content,
        clientMessageId: data.clientMessageId,
        replyToMessageId: data.replyToMessageId,
        attachments: data.attachments,
        correlationId: client.id,
        userId,
        tenantId,
      });

      // Execute command - CommandBus returns any by design
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const result = await this.commandBus.execute(command);

      // Type guard to ensure result is a Message
      if (!isMessage(result)) {
        throw new WsException('Invalid message result from command');
      }

      // Result is now properly typed as Message after type guard
      const message = result;

      // Broadcast message to room members
      void this.messageBroadcast.broadcastMessage(data.conversationId, message);

      // Send confirmation to sender
      client.emit('message_sent', {
        messageId: message.id,
        clientMessageId: data.clientMessageId,
        timestamp: message.createdAt,
      });
    } catch (error) {
      this.logger.error('Error sending message:', error);
      client.emit('error', {
        event: 'send_message',
        message:
          error instanceof Error ? error.message : 'Failed to send message',
        clientMessageId: data.clientMessageId,
      });
    }
  }

  @SubscribeMessage('edit_message')
  @UsePipes(new ValidationPipe({ transform: true }))
  async handleEditMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: EditMessageDto,
  ) {
    try {
      const { userId, tenantId } = client.data;

      const command = new EditMessageCommand({
        messageId: data.messageId,
        content: data.content,
        correlationId: client.id,
        userId,
        tenantId,
      });

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const result = await this.commandBus.execute(command);

      if (!isMessage(result)) {
        throw new WsException('Invalid message result from command bus');
      }

      // Broadcast edit to room members
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      await (this.messageBroadcast as any).broadcastMessageEdit(result);

      // Send confirmation to sender
      client.emit('message_edited', {
        messageId: result.id,
        timestamp: result.editedAt,
      });
    } catch (error) {
      this.logger.error('Error editing message:', error);
      client.emit('error', {
        event: 'edit_message',
        message:
          error instanceof Error ? error.message : 'Failed to edit message',
      });
    }
  }

  @SubscribeMessage('delete_message')
  @UsePipes(new ValidationPipe({ transform: true }))
  async handleDeleteMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: DeleteMessageDto,
  ) {
    try {
      const { userId, tenantId } = client.data;

      const command = new DeleteMessageCommand({
        messageId: data.messageId,
        correlationId: client.id,
        userId,
        tenantId,
      });

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const result = await this.commandBus.execute(command);

      if (!isMessage(result)) {
        throw new WsException('Invalid message result from command bus');
      }

      // Broadcast deletion to room members
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      await (this.messageBroadcast as any).broadcastMessageDelete(result);

      // Send confirmation to sender
      client.emit('message_deleted', {
        messageId: result.id,
        timestamp: result.deletedAt,
      });
    } catch (error) {
      this.logger.error('Error deleting message:', error);
      client.emit('error', {
        event: 'delete_message',
        message:
          error instanceof Error ? error.message : 'Failed to delete message',
      });
    }
  }

  @SubscribeMessage('get_history')
  @UsePipes(new ValidationPipe({ transform: true }))
  async handleGetHistory(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: GetHistoryDto,
  ) {
    try {
      const { userId, tenantId } = client.data;

      const query = new GetConversationHistoryQuery({
        conversationId: data.conversationId,
        pagination: data.pagination,
        beforeSequence: data.beforeSequence,
        afterSequence: data.afterSequence,
        correlationId: client.id,
        userId,
        tenantId,
      });

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const result = await this.queryBus.execute(query);

      if (!isPaginatedResult(result)) {
        throw new WsException('Invalid paginated result from query bus');
      }

      client.emit('history_received', {
        conversationId: data.conversationId,
        messages: result.data,
        pagination: {
          total: result.total,
          hasNext: result.hasNext,
          hasPrevious: result.hasPrevious,
        },
      });
    } catch (error) {
      this.logger.error('Error getting history:', error);
      client.emit('error', {
        event: 'get_history',
        message:
          error instanceof Error ? error.message : 'Failed to get history',
      });
    }
  }

  @SubscribeMessage('typing_start')
  handleTypingStart(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { conversationId: string },
  ) {
    const { userId } = client.data;

    client.to(data.conversationId).emit('typing_start', {
      userId,
      conversationId: data.conversationId,
      timestamp: new Date().toISOString(),
    });
  }

  @SubscribeMessage('typing_stop')
  handleTypingStop(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { conversationId: string },
  ) {
    const { userId } = client.data;

    client.to(data.conversationId).emit('typing_stop', {
      userId,
      conversationId: data.conversationId,
      timestamp: new Date().toISOString(),
    });
  }
}
