import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../shared/infrastructure/prisma/prisma.service';
import { RedisService } from '../../shared/redis/redis.service';
import {
  ConflictResolution,
  ConflictType,
  PendingOperation,
  OperationType,
  SyncMessage,
  ResolutionStrategy as ConflictResolutionStrategy,
} from '../interfaces/sync.interfaces';

@Injectable()
export class ConflictResolutionService {
  private readonly logger = new Logger(ConflictResolutionService.name);
  private readonly CONFLICT_TTL = 86400; // 24 hours

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async detectConflicts(
    userId: string,
    tenantId: string,
    operation: PendingOperation,
  ): Promise<ConflictResolution[]> {
    const conflicts: ConflictResolution[] = [];

    try {
      switch (operation.type) {
        case OperationType.EDIT_MESSAGE: {
          const editConflicts = await this.detectEditConflicts(userId, tenantId, operation);
          conflicts.push(...editConflicts);
          break;
        }
        case OperationType.DELETE_MESSAGE: {
          const deleteConflicts = await this.detectDeleteConflicts(userId, tenantId, operation);
          conflicts.push(...deleteConflicts);
          break;
        }
        case OperationType.SEND_MESSAGE: {
          const sequenceConflicts = await this.detectSequenceConflicts(userId, tenantId, operation);
          conflicts.push(...sequenceConflicts);
          break;
        }
      }

      // Store conflicts for later resolution
      if (conflicts.length > 0) {
        await this.storeConflicts(userId, tenantId, conflicts);
      }

      return conflicts;
    } catch (error) {
      this.logger.error(`Conflict detection failed for operation ${operation.id}:`, error);
      throw error;
    }
  }

  private async detectEditConflicts(
    userId: string,
    tenantId: string,
    operation: PendingOperation,
  ): Promise<ConflictResolution[]> {
    const { messageId, content, editedAt } = operation.data;
    
    // Get current message from database
    const currentMessage = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: { attachments: true },
    });

    if (!currentMessage) {
      return [{
        messageId,
        conflictType: ConflictType.DELETE_CONFLICT,
        serverVersion: null as any,
        clientVersion: { content, editedAt },
        resolution: ConflictResolutionStrategy.SERVER_WINS,
        resolvedMessage: null as any,
        timestamp: new Date(),
      }];
    }

    // Check if message was edited after client's last known version
    const clientEditTime = new Date(editedAt);
    const serverEditTime = currentMessage.editedAt || currentMessage.createdAt;

    if (serverEditTime > clientEditTime) {
      const serverVersion: SyncMessage = {
        id: currentMessage.id,
        conversationId: currentMessage.conversationId,
        content: typeof currentMessage.content === 'string' ? currentMessage.content : JSON.stringify(currentMessage.content),
        senderId: currentMessage.senderId || '',
        sequenceNumber: Number(currentMessage.sequenceNumber),
        timestamp: currentMessage.createdAt,
        editedAt: currentMessage.editedAt || undefined,
        isDeleted: !!currentMessage.deletedAt,
        attachments: currentMessage.attachments?.map(att => ({
          id: att.id,
          filename: att.filename,
          mimeType: att.mimeType,
          size: Number(att.fileSize || 0),
        })) || [],
        version: 1,
        messageType: currentMessage.messageType,
        createdAt: currentMessage.createdAt,
      };

      return [{
        messageId,
        conflictType: ConflictType.EDIT_CONFLICT,
        serverVersion,
        clientVersion: { content, editedAt },
        resolution: ConflictResolutionStrategy.MANUAL,
        resolvedMessage: serverVersion,
        timestamp: new Date(),
      }];
    }

    return [];
  }

  private async detectDeleteConflicts(
    userId: string,
    tenantId: string,
    operation: PendingOperation,
  ): Promise<ConflictResolution[]> {
    const { messageId } = operation.data;
    
    const currentMessage = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: { attachments: true },
    });

    if (!currentMessage) {
      // Message already deleted - no conflict
      return [];
    }

    if (currentMessage && !currentMessage.deletedAt) {
      // Message still exists but client wants to delete
      const serverVersion: SyncMessage = {
        id: currentMessage.id,
        conversationId: currentMessage.conversationId,
        content: typeof currentMessage.content === 'string' ? currentMessage.content : JSON.stringify(currentMessage.content),
        senderId: currentMessage.senderId || '',
        sequenceNumber: Number(currentMessage.sequenceNumber),
        timestamp: currentMessage.createdAt,
        editedAt: currentMessage.editedAt || undefined,
        isDeleted: !!currentMessage.deletedAt,
        attachments: currentMessage.attachments?.map(att => ({
          id: att.id,
          filename: att.filename,
          mimeType: att.mimeType,
          size: Number(att.fileSize || 0),
        })) || [],
        version: 1,
        messageType: currentMessage.messageType,
        createdAt: currentMessage.createdAt,
      };

      return [{
        messageId,
        conflictType: ConflictType.DELETE_CONFLICT,
        serverVersion,
        clientVersion: { isDeleted: true },
        resolution: ConflictResolutionStrategy.MANUAL,
        resolvedMessage: serverVersion,
        timestamp: new Date(),
      }];
    }

    return [];
  }

  private async detectSequenceConflicts(
    userId: string,
    tenantId: string,
    operation: PendingOperation,
  ): Promise<ConflictResolution[]> {
    const { clientSequence } = operation.data;
    
    // Get current conversation sequence
    const conversationState = await this.prisma.conversationState.findUnique({
      where: {
        conversationId: operation.data.conversationId,
      },
    });

    if (!conversationState) {
      return [];
    }

    if (conversationState && operation.data.sequenceNumber <= Number(conversationState.lastSeq)) {
      const serverSequence = conversationState.lastSeq;
      const expectedSequence = BigInt(clientSequence);

      if (serverSequence !== expectedSequence) {
        return [{
          messageId: operation.id,
          conflictType: ConflictType.SEQUENCE_CONFLICT,
          serverVersion: { sequenceNumber: serverSequence } as any,
          clientVersion: { sequenceNumber: Number(expectedSequence) },
          resolution: ConflictResolutionStrategy.SERVER_WINS,
          resolvedMessage: { sequenceNumber: serverSequence } as any,
          timestamp: new Date(),
        }];
      }
    }

    return [];
  }

  async resolveConflict(
    userId: string,
    tenantId: string,
    conflictId: string,
    resolution: ConflictResolutionStrategy,
  ): Promise<ConflictResolution | null> {
    const conflictData = await this.redis.exec(async (client) => {
      return await client.hget(this.getConflictKey(userId, tenantId), conflictId);
    });
    
    if (!conflictData) {
      throw new Error('Conflict not found');
    }

    const conflict = JSON.parse(conflictData as string);

    let resolvedMessage: SyncMessage;

    switch (resolution) {
      case ConflictResolutionStrategy.SERVER_WINS:
        resolvedMessage = conflict.serverVersion;
        break;

      case ConflictResolutionStrategy.CLIENT_WINS:
        resolvedMessage = { ...conflict.serverVersion, ...conflict.clientVersion } as SyncMessage;
        break;

      case ConflictResolutionStrategy.MERGE:
        resolvedMessage = await this.mergeVersions(conflict.serverVersion, conflict.clientVersion);
        break;

      default:
        throw new Error(`Unsupported resolution strategy: ${resolution}`);
    }

    const resolvedConflict: ConflictResolution = {
      ...conflict,
      resolution,
      resolvedMessage,
      timestamp: new Date(),
    };

    // Apply the resolution
    await this.applyResolution(userId, tenantId, resolvedConflict);

    // Remove from conflicts store
    await this.redis.exec(async (client) => {
      await client.hdel(this.getConflictKey(userId, tenantId), conflictId);
    });

    return resolvedConflict;
  }

  private async mergeVersions(
    serverVersion: SyncMessage,
    clientVersion: Partial<SyncMessage>,
  ): Promise<SyncMessage> {
    // Simple merge: take server version and apply non-conflicting client changes
    const merged = { ...serverVersion };

    // Apply client changes that don't conflict
    if (clientVersion.content && clientVersion.content !== serverVersion.content) {
      merged.content = clientVersion.content;
    }

    return merged;
  }

  private async applyResolution(
    userId: string,
    tenantId: string,
    resolution: ConflictResolution,
  ): Promise<void> {
    if (!resolution.resolvedMessage) {
      return;
    }

    // Apply resolution to database
    try {
      await this.prisma.message.update({
        where: { 
          id: resolution.messageId,
        },
        data: {
          content: resolution.resolvedMessage.content,
          editedAt: resolution.resolvedMessage.editedAt || new Date(),
        },
      });

      this.logger.log(`Applied conflict resolution for message ${resolution.messageId}`);
    } catch (error) {
      this.logger.error(`Failed to apply conflict resolution:`, error);
      throw error;
    }
  }

  private async storeConflicts(
    userId: string,
    tenantId: string,
    conflicts: ConflictResolution[],
  ): Promise<void> {
    const conflictKey = this.getConflictKey(userId, tenantId);
      
    for (const conflict of conflicts) {
      const conflictId = `${conflict.messageId}:${conflict.conflictType}:${Date.now()}`;
      await this.redis.exec(async (client) => {
        await client.hset(conflictKey, conflictId, JSON.stringify(conflict));
        await client.expire(conflictKey, this.CONFLICT_TTL);
      });
    }
  }

  private getConflictKey(userId: string, tenantId: string): string {
    return `sync:conflicts:${tenantId}:${userId}`;
  }

  async removeConflict(
    userId: string,
    tenantId: string,
    conflictId: string,
  ): Promise<void> {
    await this.redis.exec(async (client) => {
      await client.hdel(this.getConflictKey(userId, tenantId), conflictId);
    });
  }

  async getConflicts(
    userId: string,
    tenantId: string,
  ): Promise<ConflictResolution[]> {
    const conflictData = await this.redis.exec(async (client) => {
      return await client.hgetall(this.getConflictKey(userId, tenantId));
    });
    return Object.values(conflictData as Record<string, string>).map(data => JSON.parse(data));
  }

  async clearConflicts(userId: string, tenantId: string): Promise<void> {
    const key = `sync:conflicts:${tenantId}:${userId}`;
    
    try {
      await this.redis.del(key);
    } catch (error) {
      this.logger.warn('Failed to clear conflicts:', error);
    }
  }
}
