import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConversationRepository } from '../../shared/domain/repositories/conversation.repository';
import { RedisService } from '../../shared/redis/redis.service';

export interface RoomMember {
  userId: string;
  socketId: string;
  joinedAt: Date;
  tenantId?: string;
}

@Injectable()
export class RoomManagerService {
  private readonly logger = new Logger(RoomManagerService.name);
  private readonly ROOM_MEMBERS_PREFIX = 'ws:room_members';
  private readonly USER_ROOMS_PREFIX = 'ws:user_rooms';
  private readonly ROOM_TTL = 86400; // 24 hours

  constructor(
    @Inject('ConversationRepository')
    private readonly conversationRepository: ConversationRepository,
    private readonly redis: RedisService,
  ) {}

  /**
   * Check if user can join a room (conversation)
   */
  async canUserJoinRoom(
    userId: string,
    conversationId: string,
    tenantId?: string,
  ): Promise<boolean> {
    try {
      // Get conversation and check if user is a member
      const conversation =
        await this.conversationRepository.findById(conversationId);

      if (!conversation) {
        this.logger.warn(`Conversation not found: ${conversationId}`);
        return false;
      }

      // Check if user belongs to the same tenant as the conversation
      // Note: tenantId property may not exist on all conversation types
      const conversationTenantId =
        'tenantId' in conversation
          ? (conversation as { tenantId?: string }).tenantId
          : undefined;
      if (conversationTenantId && conversationTenantId !== tenantId) {
        this.logger.warn(
          `User ${userId} attempted to join conversation ${conversationId} from different tenant`,
        );
        return false;
      }

      // Check if user is a member of the conversation
      const isMember = conversation.isMember(userId);
      if (!isMember) {
        this.logger.warn(
          `User ${userId} is not a member of conversation ${conversationId}`,
        );
        return false;
      }

      return true;
    } catch (error) {
      this.logger.error('Error checking room access:', error);
      return false;
    }
  }

  /**
   * Add user to a room
   */
  async joinRoom(
    socketId: string,
    userId: string,
    conversationId: string,
    tenantId?: string,
  ): Promise<void> {
    try {
      const roomMember: RoomMember = {
        userId,
        socketId,
        joinedAt: new Date(),
        tenantId,
      };

      const roomKey = `${this.ROOM_MEMBERS_PREFIX}:${conversationId}`;
      const userRoomsKey = `${this.USER_ROOMS_PREFIX}:${userId}`;

      // Store member info in room hash and set TTL
      await this.redis.exec(async (client) => {
        await client.hset(
          roomKey,
          roomMember.userId,
          JSON.stringify(roomMember),
        );
        await client.expire(roomKey, this.ROOM_TTL);
      });

      // Add room to user's room set and set TTL
      await this.redis.exec(async (client) => {
        await client.sadd(userRoomsKey, conversationId);
        await client.expire(userRoomsKey, this.ROOM_TTL);
      });

      this.logger.log(
        `User ${userId} (socket: ${socketId}) joined room ${conversationId}`,
      );
    } catch (error) {
      this.logger.error('Error joining room:', error);
      throw error;
    }
  }

  /**
   * Remove user from a room
   */
  async leaveRoom(
    socketId: string,
    userId: string,
    conversationId: string,
  ): Promise<void> {
    try {
      const roomKey = `${this.ROOM_MEMBERS_PREFIX}:${conversationId}`;

      // Remove member from room hash
      await this.redis.exec(async (client) => {
        await client.hdel(roomKey, userId);
      });

      // Check if user has other sockets in the room
      const userSocketsInRoom = await this.getUserSocketsInRoom(
        userId,
        conversationId,
      );

      // If no other sockets, remove room from user's rooms
      if (userSocketsInRoom.length === 0) {
        await this.redis.exec(async (client) => {
          await client.srem(
            `${this.USER_ROOMS_PREFIX}:${userId}`,
            conversationId,
          );
        });
      }

      // Check if room is empty and clean up if needed
      const memberCount = await this.redis.exec(async (client) => {
        return await client.hlen(roomKey);
      });

      if (memberCount === 0) {
        await this.redis.exec(async (client) => {
          await client.del(roomKey);
        });
      }

      this.logger.log(
        `User ${userId} (socket: ${socketId}) left room ${conversationId}`,
      );
    } catch (error) {
      this.logger.error('Error leaving room:', error);
    }
  }

  /**
   * Remove user from all rooms (on disconnect)
   */
  async leaveAllRooms(socketId: string, userId: string): Promise<void> {
    try {
      const rooms = await this.getUserRooms(userId);

      for (const conversationId of rooms) {
        await this.leaveRoom(socketId, userId, conversationId);
      }

      this.logger.log(`User ${userId} (socket: ${socketId}) left all rooms`);
    } catch (error) {
      this.logger.error('Error leaving all rooms:', error);
    }
  }

  /**
   * Get all members in a room
   */
  async getRoomMembers(conversationId: string): Promise<RoomMember[]> {
    try {
      const roomKey = `${this.ROOM_MEMBERS_PREFIX}:${conversationId}`;
      const members = await this.redis.exec(async (client) => {
        return await client.smembers(roomKey);
      });

      return members.map((memberData: string) => {
        return JSON.parse(memberData) as RoomMember;
      });
    } catch (error) {
      this.logger.error('Error getting room members:', error);
      return [];
    }
  }

  /**
   * Get all socket IDs in a room
   */
  async getRoomSockets(conversationId: string): Promise<string[]> {
    try {
      const roomKey = `${this.ROOM_MEMBERS_PREFIX}:${conversationId}`;
      return await this.redis.exec(async (client) => {
        return await client.smembers(roomKey);
      });
    } catch (error) {
      this.logger.error('Error getting room sockets:', error);
      return [];
    }
  }

  /**
   * Get unique user IDs in a room
   */
  async getRoomUsers(conversationId: string): Promise<string[]> {
    try {
      const members = await this.getRoomMembers(conversationId);
      const uniqueUsers = new Set(members.map((member) => member.userId));
      return Array.from(uniqueUsers);
    } catch (error) {
      this.logger.error('Error getting room users:', error);
      return [];
    }
  }

  /**
   * Get user's socket IDs in a specific room
   */
  async getUserSocketsInRoom(
    userId: string,
    conversationId: string,
  ): Promise<string[]> {
    try {
      const members = await this.getRoomMembers(conversationId);
      return members
        .filter((member) => member.userId === userId)
        .map((member) => member.socketId);
    } catch (error) {
      this.logger.error('Error getting user sockets in room:', error);
      return [];
    }
  }

  /**
   * Get all rooms a user is in
   */
  async getUserRooms(userId: string): Promise<string[]> {
    try {
      const userRoomsKey = `${this.USER_ROOMS_PREFIX}:${userId}`;
      return await this.redis.exec(async (client) => {
        return await client.smembers(userRoomsKey);
      });
    } catch (error) {
      this.logger.error('Error getting user rooms:', error);
      return [];
    }
  }

  /**
   * Check if user is in a room
   */
  async isUserInRoom(userId: string, conversationId: string): Promise<boolean> {
    try {
      const userRoomsKey = `${this.USER_ROOMS_PREFIX}:${userId}`;
      const exists = await this.redis.exec(async (client) => {
        return await client.sismember(userRoomsKey, conversationId);
      });
      return exists === 1;
    } catch (error) {
      this.logger.error('Error checking if user is in room:', error);
      return false;
    }
  }

  /**
   * Get room statistics
   */
  async getRoomStats(conversationId: string): Promise<{
    memberCount: number;
    uniqueUsers: number;
    members: RoomMember[];
  }> {
    try {
      const members = await this.getRoomMembers(conversationId);
      const uniqueUsers = new Set(members.map((member) => member.userId)).size;

      return {
        memberCount: members.length,
        uniqueUsers,
        members,
      };
    } catch (error) {
      this.logger.error('Error getting room stats:', error);
      return {
        memberCount: 0,
        uniqueUsers: 0,
        members: [],
      };
    }
  }

  /**
   * Get all active rooms
   */
  async getActiveRooms(): Promise<string[]> {
    try {
      const pattern = `${this.ROOM_MEMBERS_PREFIX}:*`;
      const roomKeys = await this.redis.exec(async (client) => {
        return await client.keys(pattern);
      });

      return roomKeys.map((key: string) =>
        key.replace(`${this.ROOM_MEMBERS_PREFIX}:`, ''),
      );
    } catch (error) {
      this.logger.error('Error getting active rooms:', error);
      return [];
    }
  }

  /**
   * Cleanup empty rooms
   */
  async cleanupEmptyRooms(): Promise<void> {
    try {
      const activeRooms = await this.getActiveRooms();

      for (const conversationId of activeRooms) {
        const roomKey = `${this.ROOM_MEMBERS_PREFIX}:${conversationId}`;
        const memberCount = await this.redis.exec(async (client) => {
          return await client.hlen(roomKey);
        });

        if (memberCount === 0) {
          await this.redis.exec(async (client) => {
            await client.del(roomKey);
          });
        }
      }
    } catch (error) {
      this.logger.error('Error cleaning up empty rooms:', error);
    }
  }

  /**
   * Force remove user from room (for moderation)
   */
  async forceLeaveRoom(
    userId: string,
    conversationId: string,
  ): Promise<string[]> {
    try {
      const userSockets = await this.getUserSocketsInRoom(
        userId,
        conversationId,
      );

      for (const socketId of userSockets) {
        await this.leaveRoom(socketId, userId, conversationId);
      }

      this.logger.log(
        `Force removed user ${userId} from room ${conversationId}`,
      );

      return userSockets;
    } catch (error) {
      this.logger.error('Error force removing user from room:', error);
      return [];
    }
  }

  /**
   * Get global room statistics
   */
  async getGlobalRoomStats(): Promise<{
    totalRooms: number;
    totalConnections: number;
    roomsWithMembers: Record<string, number>;
  }> {
    try {
      const activeRooms = await this.getActiveRooms();
      const roomsWithMembers: Record<string, number> = {};
      let totalConnections = 0;

      for (const conversationId of activeRooms) {
        const roomMembersKey = `${this.ROOM_MEMBERS_PREFIX}:${conversationId}`;
        const count = await this.redis.exec(async (client) => {
          return await client.hlen(roomMembersKey);
        });
        roomsWithMembers[conversationId] = count;
        totalConnections += count;
      }

      return {
        totalRooms: activeRooms.length,
        totalConnections,
        roomsWithMembers,
      };
    } catch (error) {
      this.logger.error('Error getting global room stats:', error);
      return {
        totalRooms: 0,
        totalConnections: 0,
        roomsWithMembers: {},
      };
    }
  }
}
