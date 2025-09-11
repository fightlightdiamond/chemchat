import { Server } from 'socket.io';

/**
 * Connection Manager Service Interface
 * Used to avoid circular dependencies in ChatGateway
 */
export interface IConnectionManager {
  addConnection(
    userId: string,
    socketId: string,
    tenantId?: string,
    deviceId?: string | null,
  ): Promise<void>;
  removeConnection(userId: string, socketId: string): Promise<void>;
  getConnection(socketId: string): Promise<any>;
  getUserSockets(userId: string): Promise<string[]>;
}

/**
 * Room Manager Service Interface
 * Used to avoid circular dependencies in ChatGateway
 */
export interface IRoomManager {
  canUserJoinRoom(
    userId: string,
    conversationId: string,
    tenantId?: string,
  ): Promise<boolean>;
  joinRoom(
    socketId: string,
    userId: string,
    conversationId: string,
  ): Promise<void>;
  leaveRoom(
    socketId: string,
    userId: string,
    conversationId: string,
  ): Promise<void>;
}

/**
 * Message Broadcast Service Interface
 * Used to avoid circular dependencies in ChatGateway
 */
export interface IMessageBroadcast {
  setServer(server: Server): void;
  broadcastUserJoined(conversationId: string, userId: string): Promise<void>;
}
