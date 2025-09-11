import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Server } from 'socket.io';
import { Message } from '../../shared/domain/entities/message.entity';
import { RoomManagerService } from './room-manager.service';
import { RedisService } from '../../shared/redis/redis.service';

export interface BroadcastMessage {
  type:
    | 'message_created'
    | 'message_edited'
    | 'message_deleted'
    | 'user_joined'
    | 'user_left'
    | 'typing_start'
    | 'typing_stop';
  conversationId: string;
  data: unknown;
  timestamp: string;
  senderId?: string | null;
}

@Injectable()
export class MessageBroadcastService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MessageBroadcastService.name);
  private server!: Server;
  private static readonly BROADCAST_CHANNEL = 'chat:broadcast';

  constructor(
    private readonly roomManager: RoomManagerService,
    private readonly redis: RedisService,
  ) {}

  setServer(server: Server): void {
    this.server = server;
  }

  // ---------- Lifecycle hooks: đảm bảo subscriber được bật/tắt đúng chuẩn ----------
  async onModuleInit(): Promise<void> {
    await this.redis.subscribe(
      MessageBroadcastService.BROADCAST_CHANNEL,
      (message) => {
        void this.handleIncoming(message);
      },
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.unsubscribe(MessageBroadcastService.BROADCAST_CHANNEL);
  }

  private async handleIncoming(raw: string): Promise<void> {
    try {
      const data = JSON.parse(raw) as BroadcastMessage;
      this.logger.debug(
        `Received broadcast: ${data.type} for ${data.conversationId}`,
      );
      await this.handleBroadcastMessage(data);
    } catch (error) {
      this.logger.error(
        'Error handling broadcast message',
        (error as Error)?.stack,
      );
    }
  }

  // ---------- Publish helpers ----------
  private async publish(data: BroadcastMessage): Promise<void> {
    await this.redis.publish(MessageBroadcastService.BROADCAST_CHANNEL, data);
    await this.handleBroadcastMessage(data); // local
  }

  // ---------- Public APIs ----------
  async broadcastMessage(
    message: Message,
    conversationId: string,
  ): Promise<void> {
    try {
      await this.publish({
        type: 'message_created',
        conversationId,
        data: {
          id: message.id,
          conversationId: message.conversationId,
          senderId: message.senderId,
          clientMessageId: message.clientMessageId,
          sequenceNumber: String(message.sequenceNumber),
          type: message.messageType?.toString() ?? 'text',
          content: message.content.toJSON(),
          editedAt: message.editedAt?.toISOString(),
          deletedAt: message.deletedAt?.toISOString(),
          createdAt: message.createdAt.toISOString(),
        },
        timestamp: new Date().toISOString(),
        senderId: message.senderId,
      });
    } catch (error) {
      this.logger.error('Error broadcasting message', (error as Error)?.stack);
    }
  }

  async broadcastMessageEdit(message: Message): Promise<void> {
    try {
      await this.publish({
        type: 'message_edited',
        conversationId: message.conversationId,
        data: {
          id: message.id,
          conversationId: message.conversationId,
          senderId: message.senderId,
          content: message.content.toJSON(),
          editedAt: message.editedAt?.toISOString(),
          sequenceNumber: String(message.sequenceNumber),
        },
        timestamp: new Date().toISOString(),
        senderId: message.senderId,
      });
    } catch (error) {
      this.logger.error(
        'Error broadcasting message edit',
        (error as Error)?.stack,
      );
    }
  }

  async broadcastMessageDelete(message: Message): Promise<void> {
    try {
      await this.publish({
        type: 'message_deleted',
        conversationId: message.conversationId,
        data: {
          id: message.id,
          conversationId: message.conversationId,
          senderId: message.senderId,
          deletedAt: message.deletedAt?.toISOString(),
          sequenceNumber: String(message.sequenceNumber),
        },
        timestamp: new Date().toISOString(),
        senderId: message.senderId,
      });
    } catch (error) {
      this.logger.error(
        'Error broadcasting message deletion',
        (error as Error)?.stack,
      );
    }
  }

  async broadcastUserJoined(
    conversationId: string,
    userId: string,
  ): Promise<void> {
    try {
      await this.publish({
        type: 'user_joined',
        conversationId,
        data: { userId, conversationId },
        timestamp: new Date().toISOString(),
        senderId: userId,
      });
    } catch (error) {
      this.logger.error(
        'Error broadcasting user joined',
        (error as Error)?.stack,
      );
    }
  }

  async broadcastUserLeft(
    userId: string,
    conversationId: string,
  ): Promise<void> {
    try {
      await this.publish({
        type: 'user_left',
        conversationId,
        data: { userId, conversationId },
        timestamp: new Date().toISOString(),
        senderId: userId,
      });
    } catch (error) {
      this.logger.error(
        'Error broadcasting user left',
        (error as Error)?.stack,
      );
    }
  }

  async broadcastTyping(
    userId: string,
    conversationId: string,
    isTyping: boolean,
  ): Promise<void> {
    try {
      if (!this.server) return;

      const eventName = isTyping ? 'typing_start' : 'typing_stop';
      const data = {
        userId,
        conversationId,
        timestamp: new Date().toISOString(),
      };

      // Loại trừ socket của sender khỏi broadcast (socket.id là 1 "room" mặc định)
      const exclude = await this.roomManager.getUserSocketsInRoom(
        userId,
        conversationId,
      );
      this.server.to(conversationId).except(exclude).emit(eventName, data);
    } catch (error) {
      this.logger.error(
        'Error broadcasting typing indicator',
        (error as Error)?.stack,
      );
    }
  }

  async broadcastPresence(
    userId: string,
    status: 'online' | 'offline' | 'away',
    conversationIds: string[] = [],
  ): Promise<void> {
    try {
      if (!this.server) return;

      const data = { userId, status, timestamp: new Date().toISOString() };
      if (conversationIds.length > 0) {
        conversationIds.forEach((cid) =>
          this.server.to(cid).emit('presence_update', data),
        );
      } else {
        const rooms = await this.roomManager.getUserRooms(userId);
        rooms.forEach((cid) =>
          this.server.to(cid).emit('presence_update', data),
        );
      }
    } catch (error) {
      this.logger.error('Error broadcasting presence', (error as Error)?.stack);
    }
  }

  async sendToUser(
    userId: string,
    event: string,
    data: unknown,
  ): Promise<void> {
    try {
      if (!this.server) return;

      // gom tất cả socketId của user
      const rooms = await this.roomManager.getUserRooms(userId);
      const sockIds = new Set<string>();
      const lists = await Promise.all(
        rooms.map((cid) => this.roomManager.getUserSocketsInRoom(userId, cid)),
      );
      lists.forEach((arr) => arr.forEach((id) => sockIds.add(id)));

      sockIds.forEach((id) => this.server.to(id).emit(event, data));
      this.logger.debug(
        `Sent ${event} to ${sockIds.size} sockets for user ${userId}`,
      );
    } catch (error) {
      this.logger.error(
        'Error sending message to user',
        (error as Error)?.stack,
      );
    }
  }

  private async handleBroadcastMessage(bm: BroadcastMessage): Promise<void> {
    if (!this.server) {
      this.logger.warn('Server not set, cannot broadcast message');
      return;
    }

    try {
      const { type, conversationId, data } = bm;
      const roomSockets = await this.roomManager.getRoomSockets(conversationId);
      if (roomSockets.length === 0) {
        this.logger.debug(
          `No sockets in room ${conversationId} to broadcast to`,
        );
        return;
      }

      switch (type) {
        case 'message_created':
          this.server.to(conversationId).emit('message_received', data);
          break;
        case 'message_edited':
          this.server.to(conversationId).emit('message_edited', data);
          break;
        case 'message_deleted':
          this.server.to(conversationId).emit('message_deleted', data);
          break;
        case 'user_joined': {
          const exclude = await this.roomManager.getUserSocketsInRoom(
            String((data as { userId?: string }).userId ?? ''),
            conversationId,
          );
          this.server
            .to(conversationId)
            .except(exclude)
            .emit('user_joined', data);
          break;
        }
        case 'user_left':
          this.server.to(conversationId).emit('user_left', data);
          break;
        default:
          this.logger.warn(`Unknown broadcast message type: ${type as string}`);
      }

      this.logger.debug(
        `Broadcasted ${type} to ${roomSockets.length} sockets in room ${conversationId}`,
      );
    } catch (error) {
      this.logger.error(
        'Error handling broadcast message',
        (error as Error)?.stack,
      );
    }
  }
}
