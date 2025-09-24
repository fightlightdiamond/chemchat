import { Injectable } from '@nestjs/common';
import { Message } from '../../domain/entities/message.entity';
import { MessageType } from '../../domain/value-objects/message-type.vo';
import {
  MessageContent,
  MessageContentData,
} from '../../domain/value-objects/message-content.vo';
import {
  MessageRepository,
  MessagePaginationOptions,
  MessageStats,
} from '../../domain/repositories/message.repository';
import {
  BaseRepositoryImpl,
  PaginationOptions,
  PaginatedResult,
} from '../../domain/repositories/base.repository';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

// Use Prisma generated types
type PrismaMessage = Prisma.MessageGetPayload<object>;

@Injectable()
export class MessageRepositoryImpl
  extends BaseRepositoryImpl<Message, string>
  implements MessageRepository
{
  protected entityName = 'Message';

  constructor(protected readonly db: PrismaService) {
    super();
  }

  async findById(id: string): Promise<Message | null> {
    try {
      const message = await this.db.message.findUnique({
        where: { id },
      });

      return message ? this.mapToEntity(message) : null;
    } catch (error: unknown) {
      return this.handleError(error, 'findById');
    }
  }

  async findAll(
    options?: PaginationOptions,
  ): Promise<PaginatedResult<Message>> {
    try {
      const { page, limit } = this.validatePaginationOptions(options);
      const offset = this.calculateOffset(page, limit);

      const [messages, total] = await Promise.all([
        this.db.message.findMany({
          skip: offset,
          take: limit,
          orderBy: options?.sortBy
            ? { [options.sortBy]: options.sortOrder || 'asc' }
            : { sequenceNumber: 'desc' },
        }),
        this.db.message.count(),
      ]);

      const entities = messages.map((msg) => this.mapToEntity(msg));
      return this.createPaginatedResult(entities, total, page, limit);
    } catch (error: unknown) {
      return this.handleError(error, 'findAll');
    }
  }

  async create(message: Message): Promise<Message> {
    try {
      const created = await this.db.message.create({
        data: {
          id: message.id,
          conversationId: message.conversationId,
          senderId: message.senderId,
          clientMessageId: message.clientMessageId,
          sequenceNumber: message.sequenceNumber,
          messageType: this.convertMessageTypeToPrisma(message.messageType),
          content: message.content.toJSON() as Prisma.InputJsonValue,
          editedAt: message.editedAt,
          deletedAt: message.deletedAt,
          createdAt: message.createdAt,
        },
      });

      return this.mapToEntity(created);
    } catch (error: unknown) {
      return this.handleError(error, 'create');
    }
  }

  async update(id: string, messageData: Partial<Message>): Promise<Message> {
    try {
      const updated = await this.db.message.update({
        where: { id },
        data: {
          ...(messageData.content && {
            content: messageData.content.toJSON() as Prisma.InputJsonValue,
          }),
          ...(messageData.editedAt !== undefined && {
            editedAt: messageData.editedAt,
          }),
          ...(messageData.deletedAt !== undefined && {
            deletedAt: messageData.deletedAt,
          }),
        },
      });

      return this.mapToEntity(updated);
    } catch (error) {
      this.handleError(error, 'update');
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await this.db.message.delete({
        where: { id },
      });
    } catch (error) {
      this.handleError(error, 'delete');
    }
  }

  async exists(id: string): Promise<boolean> {
    try {
      const count = await this.db.message.count({
        where: { id },
      });
      return count > 0;
    } catch (error) {
      this.handleError(error, 'exists');
    }
  }

  async count(filter?: Record<string, unknown>): Promise<number> {
    try {
      return await this.db.message.count({
        where: filter,
      });
    } catch (error) {
      this.handleError(error, 'count');
    }
  }

  async findByIds(ids: string[]): Promise<Message[]> {
    try {
      const messages = await this.db.message.findMany({
        where: { id: { in: ids } },
        orderBy: { createdAt: 'desc' },
      });
      return messages.map((msg) => this.mapToEntity(msg));
    } catch (error) {
      this.handleError(error, 'findByIds');
    }
  }

  async createMany(messages: Message[]): Promise<Message[]> {
    try {
      const data = messages.map((message) => ({
        id: message.id,
        conversationId: message.conversationId,
        senderId: message.senderId,
        clientMessageId: message.clientMessageId,
        sequenceNumber: message.sequenceNumber,
        messageType: this.convertMessageTypeToPrisma(message.messageType),
        content: message.content.toJSON() as Prisma.InputJsonValue,
        editedAt: message.editedAt,
        deletedAt: message.deletedAt,
        createdAt: message.createdAt,
      }));

      await this.db.message.createMany({ data });
      return this.findByIds(messages.map((m) => m.id));
    } catch (error) {
      this.handleError(error, 'createMany');
    }
  }

  async updateMany(
    updates: Array<{ id: string; data: Partial<Message> }>,
  ): Promise<Message[]> {
    try {
      await this.db.$transaction(
        updates.map((update) =>
          this.db.message.update({
            where: { id: update.id },
            data: {
              ...(update.data.content && {
                content: update.data.content.toJSON() as Prisma.InputJsonValue,
              }),
              ...(update.data.editedAt !== undefined && {
                editedAt: update.data.editedAt,
              }),
              ...(update.data.deletedAt !== undefined && {
                deletedAt: update.data.deletedAt,
              }),
            },
          }),
        ),
      );

      return this.findByIds(updates.map((u) => u.id));
    } catch (error) {
      this.handleError(error, 'updateMany');
    }
  }

  async deleteMany(ids: string[]): Promise<void> {
    try {
      await this.db.message.deleteMany({
        where: {
          id: { in: ids },
        },
      });
    } catch (error) {
      this.handleError(error, 'deleteMany');
    }
  }

  async findByConversationId(
    conversationId: string,
    options?: MessagePaginationOptions,
  ): Promise<PaginatedResult<Message>> {
    try {
      const { page, limit } = this.validatePaginationOptions(options);
      const offset = this.calculateOffset(page, limit);

      const where: Record<string, any> = { conversationId };

      if (options?.beforeSequence) {
        where.sequenceNumber = { lt: options.beforeSequence };
      }

      if (options?.afterSequence) {
        where.sequenceNumber = { gt: options.afterSequence };
      }

      if (!options?.includeDeleted) {
        where.deletedAt = null;
      }

      const [messages, total] = await Promise.all([
        this.db.message.findMany({
          where,
          skip: offset,
          take: limit,
          orderBy: { sequenceNumber: 'desc' },
        }),
        this.db.message.count({ where }),
      ]);

      const entities = messages.map((msg) => this.mapToEntity(msg));
      return this.createPaginatedResult(entities, total, page, limit);
    } catch (error) {
      this.handleError(error, 'findByConversationId');
    }
  }

  async findBySenderId(
    senderId: string,
    options?: PaginationOptions,
  ): Promise<PaginatedResult<Message>> {
    try {
      const { page, limit } = this.validatePaginationOptions(options);
      const offset = this.calculateOffset(page, limit);

      const [messages, total] = await Promise.all([
        this.db.message.findMany({
          where: { senderId },
          skip: offset,
          take: limit,
          orderBy: { createdAt: 'desc' },
        }),
        this.db.message.count({
          where: { senderId },
        }),
      ]);

      const entities = messages.map((msg) => this.mapToEntity(msg));
      return this.createPaginatedResult(entities, total, page, limit);
    } catch (error) {
      this.handleError(error, 'findBySenderId');
    }
  }

  async findByClientMessageId(
    clientMessageId: string,
  ): Promise<Message | null> {
    try {
      const message = await this.db.message.findFirst({
        where: { clientMessageId },
      });

      return message ? this.mapToEntity(message) : null;
    } catch (error) {
      this.handleError(error, 'findByClientMessageId');
    }
  }

  async findAfterSequence(
    conversationId: string,
    sequenceNumber: bigint,
    limit = 50,
  ): Promise<Message[]> {
    try {
      const messages = await this.db.message.findMany({
        where: {
          conversationId,
          sequenceNumber: { gt: sequenceNumber },
        },
        take: limit,
        orderBy: { sequenceNumber: 'asc' },
      });

      return messages.map((msg) => this.mapToEntity(msg));
    } catch (error) {
      this.handleError(error, 'findAfterSequence');
    }
  }

  async findBeforeSequence(
    conversationId: string,
    sequenceNumber: bigint,
    limit = 50,
  ): Promise<Message[]> {
    try {
      const messages = await this.db.message.findMany({
        where: {
          conversationId,
          sequenceNumber: { lt: sequenceNumber },
        },
        take: limit,
        orderBy: { sequenceNumber: 'desc' },
      });

      return messages.map((msg) => this.mapToEntity(msg));
    } catch (error) {
      this.handleError(error, 'findBeforeSequence');
    }
  }

  async findLatestInConversation(
    conversationId: string,
  ): Promise<Message | null> {
    try {
      const message = await this.db.message.findFirst({
        where: { conversationId },
        orderBy: { sequenceNumber: 'desc' },
      });

      return message ? this.mapToEntity(message) : null;
    } catch (error) {
      this.handleError(error, 'findLatestInConversation');
    }
  }

  async getNextSequenceNumber(conversationId: string): Promise<bigint> {
    try {
      const latest = await this.db.message.findFirst({
        where: { conversationId },
        orderBy: { sequenceNumber: 'desc' },
        select: { sequenceNumber: true },
      });

      return latest ? latest.sequenceNumber + 1n : 1n;
    } catch (error) {
      this.handleError(error, 'getNextSequenceNumber');
    }
  }

  async searchByContent(
    query: string,
    conversationId?: string,
    options?: PaginationOptions,
  ): Promise<PaginatedResult<Message>> {
    try {
      const { page, limit } = this.validatePaginationOptions(options);
      const offset = this.calculateOffset(page, limit);

      const where: Record<string, any> = {
        content: {
          path: ['text'],
          string_contains: query,
        },
        deletedAt: null,
      };

      if (conversationId) {
        where.conversationId = conversationId;
      }

      const [messages, total] = await Promise.all([
        this.db.message.findMany({
          where,
          skip: offset,
          take: limit,
          orderBy: { createdAt: 'desc' },
        }),
        this.db.message.count({ where }),
      ]);

      const entities = messages.map((msg) => this.mapToEntity(msg));
      return this.createPaginatedResult(entities, total, page, limit);
    } catch (error) {
      this.handleError(error, 'searchByContent');
    }
  }

  async findByType(
    messageType: MessageType,
    options?: PaginationOptions,
  ): Promise<PaginatedResult<Message>> {
    try {
      const { page, limit } = this.validatePaginationOptions(options);
      const offset = this.calculateOffset(page, limit);

      const [messages, total] = await Promise.all([
        this.db.message.findMany({
          where: { messageType: this.convertMessageTypeToPrisma(messageType) },
          skip: offset,
          take: limit,
          orderBy: { createdAt: 'desc' },
        }),
        this.db.message.count({
          where: { messageType: this.convertMessageTypeToPrisma(messageType) },
        }),
      ]);

      const entities = messages.map((msg) => this.mapToEntity(msg));
      return this.createPaginatedResult(entities, total, page, limit);
    } catch (error) {
      this.handleError(error, 'findByType');
    }
  }

  async findUnreadMessages(
    conversationId: string,
    userId: string,
    lastReadSequence: bigint,
  ): Promise<Message[]> {
    try {
      const messages = await this.db.message.findMany({
        where: {
          conversationId,
          sequenceNumber: { gt: lastReadSequence },
          deletedAt: null,
        },
        orderBy: { sequenceNumber: 'asc' },
      });

      return messages.map((msg) => this.mapToEntity(msg));
    } catch (error) {
      this.handleError(error, 'findUnreadMessages');
    }
  }

  async getMessageCount(conversationId: string): Promise<number> {
    try {
      return await this.db.message.count({
        where: {
          conversationId,
          deletedAt: null,
        },
      });
    } catch (error) {
      this.handleError(error, 'getMessageCount');
    }
  }

  async getUnreadCount(
    conversationId: string,
    lastReadSequence: bigint,
  ): Promise<number> {
    try {
      return await this.db.message.count({
        where: {
          conversationId,
          sequenceNumber: { gt: lastReadSequence },
          deletedAt: null,
        },
      });
    } catch (error) {
      this.handleError(error, 'getUnreadCount');
    }
  }

  async findInDateRange(
    conversationId: string,
    startDate: Date,
    endDate: Date,
    options?: PaginationOptions,
  ): Promise<PaginatedResult<Message>> {
    try {
      const { page, limit } = this.validatePaginationOptions(options);
      const offset = this.calculateOffset(page, limit);

      const where = {
        conversationId,
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      };

      const [messages, total] = await Promise.all([
        this.db.message.findMany({
          where,
          skip: offset,
          take: limit,
          orderBy: { createdAt: 'desc' },
        }),
        this.db.message.count({ where }),
      ]);

      const entities = messages.map((msg) => this.mapToEntity(msg));
      return this.createPaginatedResult(entities, total, page, limit);
    } catch (error) {
      this.handleError(error, 'findInDateRange');
    }
  }

  async findEditedMessages(
    conversationId?: string,
    options?: PaginationOptions,
  ): Promise<PaginatedResult<Message>> {
    try {
      const { page, limit } = this.validatePaginationOptions(options);
      const offset = this.calculateOffset(page, limit);

      const where: Record<string, any> = {
        editedAt: { not: null },
      };

      if (conversationId) {
        where.conversationId = conversationId;
      }

      const [messages, total] = await Promise.all([
        this.db.message.findMany({
          where,
          skip: offset,
          take: limit,
          orderBy: { editedAt: 'desc' },
        }),
        this.db.message.count({ where }),
      ]);

      const entities = messages.map((msg) => this.mapToEntity(msg));
      return this.createPaginatedResult(entities, total, page, limit);
    } catch (error) {
      this.handleError(error, 'findEditedMessages');
    }
  }

  async findDeletedMessages(
    conversationId?: string,
    options?: PaginationOptions,
  ): Promise<PaginatedResult<Message>> {
    try {
      const { page, limit } = this.validatePaginationOptions(options);
      const offset = this.calculateOffset(page, limit);

      const where: Record<string, any> = {
        deletedAt: { not: null },
      };

      if (conversationId) {
        where.conversationId = conversationId;
      }

      const [messages, total] = await Promise.all([
        this.db.message.findMany({
          where,
          skip: offset,
          take: limit,
          orderBy: { deletedAt: 'desc' },
        }),
        this.db.message.count({ where }),
      ]);

      const entities = messages.map((msg) => this.mapToEntity(msg));
      return this.createPaginatedResult(entities, total, page, limit);
    } catch (error) {
      this.handleError(error, 'findDeletedMessages');
    }
  }

  async getMessageStats(conversationId?: string): Promise<MessageStats> {
    try {
      const where = conversationId ? { conversationId } : {};

      const [
        totalMessages,
        editedMessages,
        deletedMessages,
        systemMessages,
        messagesWithAttachments,
      ] = await Promise.all([
        this.db.message.count({ where }),
        this.db.message.count({ where: { ...where, editedAt: { not: null } } }),
        this.db.message.count({
          where: { ...where, deletedAt: { not: null } },
        }),
        this.db.message.count({ where: { ...where, messageType: 'SYSTEM' } }),
        this.db.message.count({
          where: {
            ...where,
            content: {
              path: ['attachments'],
              not: Prisma.JsonNull,
            },
          },
        }),
      ]);

      // Calculate average messages per day
      const firstMessage = await this.db.message.findFirst({
        where,
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      });

      let averageMessagesPerDay = 0;
      if (firstMessage && totalMessages > 0) {
        const daysSinceFirst = Math.max(
          1,
          Math.ceil(
            (Date.now() - firstMessage.createdAt.getTime()) /
              (1000 * 60 * 60 * 24),
          ),
        );
        averageMessagesPerDay = Math.round(totalMessages / daysSinceFirst);
      }

      // Find most active hour (simplified - would need more complex query for real implementation)
      const mostActiveHour = 14; // Default to 2 PM

      return {
        totalMessages,
        editedMessages,
        deletedMessages,
        systemMessages,
        messagesWithAttachments,
        averageMessagesPerDay,
        mostActiveHour,
      };
    } catch (error) {
      this.handleError(error, 'getMessageStats');
    }
  }

  async markMessagesAsRead(
    conversationId: string,
    userId: string,
    upToSequence: bigint,
  ): Promise<void> {
    try {
      await this.db.conversationMember.update({
        where: {
          conversationId_userId: {
            conversationId,
            userId,
          },
        },
        data: {
          lastReadSequence: upToSequence,
        },
      });
    } catch (error) {
      this.handleError(error, 'markMessagesAsRead');
    }
  }

  async findMessagesWithAttachments(
    conversationId?: string,
    options?: PaginationOptions,
  ): Promise<PaginatedResult<Message>> {
    try {
      const { page, limit } = this.validatePaginationOptions(options);
      const offset = this.calculateOffset(page, limit);

      const where: Record<string, any> = {
        content: {
          path: ['attachments'],
          not: null,
        },
      };

      if (conversationId) {
        where.conversationId = conversationId;
      }

      const [messages, total] = await Promise.all([
        this.db.message.findMany({
          where,
          skip: offset,
          take: limit,
          orderBy: { createdAt: 'desc' },
        }),
        this.db.message.count({ where }),
      ]);

      const entities = messages.map((msg) => this.mapToEntity(msg));
      return this.createPaginatedResult(entities, total, page, limit);
    } catch (error) {
      this.handleError(error, 'findMessagesWithAttachments');
    }
  }

  /**
   * Converts MessageType to Prisma MessageType enum
   */
  private convertMessageTypeToPrisma(
    messageType: MessageType,
  ): 'TEXT' | 'IMAGE' | 'FILE' | 'SYSTEM' {
    switch (messageType) {
      case MessageType.TEXT:
        return 'TEXT';
      case MessageType.IMAGE:
        return 'IMAGE';
      case MessageType.FILE:
        return 'FILE';
      case MessageType.SYSTEM:
        return 'SYSTEM';
      default:
        return 'TEXT';
    }
  }

  /**
   * Converts Prisma MessageType to domain MessageType
   */
  private convertPrismaMessageTypeToEnum(
    prismaType: 'TEXT' | 'IMAGE' | 'FILE' | 'SYSTEM',
  ): MessageType {
    switch (prismaType) {
      case 'TEXT':
        return MessageType.TEXT;
      case 'IMAGE':
        return MessageType.IMAGE;
      case 'FILE':
        return MessageType.FILE;
      case 'SYSTEM':
        return MessageType.SYSTEM;
      default:
        return MessageType.TEXT;
    }
  }

  /**
   * Maps a Prisma message to a domain entity
   */
  private mapToEntity(prismaMessage: PrismaMessage): Message {
    // Type-safe conversion of Prisma JSON to MessageContentData
    if (!prismaMessage.content || typeof prismaMessage.content !== 'object') {
      throw new Error('Invalid message content format');
    }

    const contentData = prismaMessage.content as MessageContentData;
    const content = new MessageContent(contentData);

    return new Message(
      prismaMessage.id,
      prismaMessage.conversationId,
      prismaMessage.senderId,
      prismaMessage.clientMessageId,
      BigInt(prismaMessage.sequenceNumber), // Ensure bigint type
      this.convertPrismaMessageTypeToEnum(
        prismaMessage.messageType as 'TEXT' | 'IMAGE' | 'FILE' | 'SYSTEM',
      ),
      content,
      prismaMessage.editedAt ? new Date(prismaMessage.editedAt) : null,
      prismaMessage.deletedAt ? new Date(prismaMessage.deletedAt) : null,
      new Date(prismaMessage.createdAt),
    );
  }

  async save(message: Message): Promise<Message> {
    // Alias for create method
    return this.create(message);
  }
}
