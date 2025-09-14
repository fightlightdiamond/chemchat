import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../shared/infrastructure/prisma/prisma.service';
import { RedisService } from '../../shared/redis/redis.service';
import {
  SyncRequest,
  SyncResponse,
  SyncMessage,
  SyncConversation,
  SyncMetrics,
} from '../interfaces/sync.interfaces';

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);
  private readonly SYNC_BATCH_SIZE = 100;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async performDeltaSync(
    userId: string,
    tenantId: string,
    request: SyncRequest,
  ): Promise<SyncResponse> {
    try {
      const { lastSequenceNumber, conversationIds } = request;
      
      // Get current sequence number
      const currentSequence = await this.getCurrentSequence();
      
      // Get incremental messages
      const messages = await this.getIncrementalMessages(
        tenantId,
        Number(lastSequenceNumber),
        conversationIds,
      );
      
      // Get conversations (simplified)
      const conversations = await this.getConversations(conversationIds);
      
      const startTime = Date.now();
      
      // Create sync metrics
      const metrics: SyncMetrics = {
        messagesCount: messages.length,
        conversationsCount: conversations.length,
        deletedItemsCount: 0,
        syncDuration: Date.now() - startTime,
        lastSyncSequence: Number(currentSequence),
        timestamp: new Date(),
      };

      return {
        messages,
        conversations,
        deletedItems: [],
        currentSequenceNumber: Number(currentSequence),
        hasMoreData: messages.length >= this.SYNC_BATCH_SIZE,
        metrics,
        serverTimestamp: new Date(),
        hasMore: messages.length >= this.SYNC_BATCH_SIZE,
      };
    } catch (error) {
      this.logger.error(`Delta sync failed for user ${userId}:`, error);
      throw error;
    }
  }

  private async getCurrentSequence(): Promise<bigint> {
    // Get the highest sequence number from conversation states
    const result = await this.prisma.conversationState.findFirst({
      orderBy: { lastSeq: 'desc' },
      select: { lastSeq: true },
    });
    
    return result?.lastSeq ?? BigInt(0);
  }

  private async getIncrementalMessages(
    tenantId: string,
    lastSequence: number,
    conversationIds?: string[],
  ): Promise<SyncMessage[]> {
    const whereClause: any = {
      sequenceNumber: {
        gt: BigInt(lastSequence),
      },
    };

    if (conversationIds && conversationIds.length > 0) {
      whereClause.conversationId = {
        in: conversationIds,
      };
    }

    const messages = await this.prisma.message.findMany({
      where: whereClause,
      include: {
        attachments: {
          select: {
            id: true,
            filename: true,
            mimeType: true,
            fileSize: true,
          },
        },
      },
      orderBy: { sequenceNumber: 'asc' },
      take: this.SYNC_BATCH_SIZE,
    });

    return messages.map(msg => ({
      id: msg.id,
      conversationId: msg.conversationId,
      content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
      senderId: msg.senderId || '',
      sequenceNumber: Number(msg.sequenceNumber),
      createdAt: msg.createdAt,
      timestamp: msg.createdAt,
      editedAt: msg.editedAt ?? undefined,
      messageType: msg.messageType,
      attachments: msg.attachments?.map(att => ({
        id: att.id,
        filename: att.filename,
        mimeType: att.mimeType,
        size: Number(att.fileSize || 0),
      })) || [],
      isDeleted: !!msg.deletedAt,
      version: 1,
    }));
  }

  private async getConversations(
    conversationIds?: string[],
  ): Promise<SyncConversation[]> {
    const whereClause: any = {};

    if (conversationIds && conversationIds.length > 0) {
      whereClause.id = {
        in: conversationIds,
      };
    }

    const conversations = await this.prisma.conversation.findMany({
      where: whereClause,
      include: {
        members: {
          select: {
            userId: true,
            role: true,
            joinedAt: true,
          },
        },
      },
      take: this.SYNC_BATCH_SIZE,
    });

    return conversations.map(conv => ({
      id: conv.id,
      name: conv.name ?? undefined,
      type: conv.type,
      participants: conv.members.map(m => ({
        userId: m.userId,
        role: m.role,
        joinedAt: m.joinedAt,
      })),
      lastMessageAt: undefined, // Not available in current schema
      createdAt: conv.createdAt,
      updatedAt: conv.updatedAt,
      isDeleted: false, // Not available in current schema
      version: 1, // Not available in current schema
    }));
  }

  async recordSyncMetrics(
    userId: string,
    tenantId: string,
    metrics: SyncMetrics,
  ): Promise<void> {
    try {
      const key = `sync:metrics:${tenantId}:${userId}`;
      await this.redis.exec(async (client) => {
        await client.setex(key, 3600, JSON.stringify(metrics));
      });
    } catch (error) {
      this.logger.warn('Failed to record sync metrics:', error);
    }
  }

  async getSyncMetrics(
    userId: string,
    tenantId: string,
  ): Promise<SyncMetrics | null> {
    try {
      const key = `sync:metrics:${tenantId}:${userId}`;
      const data = await this.redis.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      this.logger.warn('Failed to get sync metrics:', error);
      return null;
    }
  }

  async resetSyncState(
    userId: string,
    tenantId: string,
  ): Promise<void> {
    try {
      const pattern = `sync:*:${tenantId}:${userId}`;
      const keys = await this.redis.scanKeys(pattern);
      
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
      
      this.logger.log(`Reset sync state for user ${userId}`);
    } catch (error) {
      this.logger.error('Failed to reset sync state:', error);
      throw error;
    }
  }
}
