import { Injectable } from '@nestjs/common';
import { ConversationType as PrismaConversationType } from '@prisma/client';
import { Conversation } from '../../domain/entities/conversation.entity';
import { ConversationType } from '../../domain/value-objects/conversation-type.vo';
import {
  ConversationRepository,
  ConversationStats,
  ConversationWithMemberCount,
} from '../../domain/repositories/conversation.repository';
import {
  BaseRepositoryImpl,
  PaginationOptions,
  PaginatedResult,
} from '../../domain/repositories/base.repository';
import { DatabaseService } from '../../services/database.service';

@Injectable()
export class ConversationRepositoryImpl
  extends BaseRepositoryImpl<Conversation, string>
  implements ConversationRepository
{
  protected entityName = 'Conversation';

  constructor(protected readonly db: DatabaseService) {
    super();
  }

  async findById(id: string): Promise<Conversation | null> {
    try {
      const conversation = await this.db.conversation.findUnique({
        where: { id },
      });

      return conversation ? this.mapToEntity(conversation) : null;
    } catch (error) {
      this.handleError(error, 'findById');
    }
  }

  async findAll(
    options?: PaginationOptions,
  ): Promise<PaginatedResult<Conversation>> {
    try {
      const { page, limit } = this.validatePaginationOptions(options);
      const offset = this.calculateOffset(page, limit);

      const [conversations, total] = await Promise.all([
        this.db.conversation.findMany({
          skip: offset,
          take: limit,
          orderBy: options?.sortBy
            ? { [options.sortBy]: options.sortOrder || 'asc' }
            : { createdAt: 'desc' },
        }),
        this.db.conversation.count(),
      ]);

      const entities = conversations.map((conv) => this.mapToEntity(conv));
      return this.createPaginatedResult(entities, total, page, limit);
    } catch (error) {
      this.handleError(error, 'findAll');
    }
  }

  async create(conversation: Conversation): Promise<Conversation> {
    try {
      const created = await this.db.conversation.create({
        data: {
          id: conversation.id,
          type: conversation.type === ConversationType.DM ? 'DM' : 'GROUP',
          name: conversation.name,
          ownerId: conversation.ownerId,
          createdAt: conversation.createdAt,
          updatedAt: conversation.updatedAt,
        },
      });

      return this.mapToEntity(created);
    } catch (error) {
      this.handleError(error, 'create');
    }
  }

  async update(
    id: string,
    conversationData: Partial<Conversation>,
  ): Promise<Conversation> {
    try {
      const updated = await this.db.conversation.update({
        where: { id },
        data: {
          ...(conversationData.name && {
            name: conversationData.name,
          }),
          ...(conversationData.ownerId && {
            ownerId: conversationData.ownerId,
          }),
          updatedAt: new Date(),
        },
      });

      return this.mapToEntity(updated);
    } catch (error) {
      this.handleError(error, 'update');
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await this.db.conversation.delete({ where: { id } });
    } catch (error) {
      this.handleError(error, 'delete');
    }
  }

  async exists(id: string): Promise<boolean> {
    try {
      const count = await this.db.conversation.count({
        where: { id },
      });
      return count > 0;
    } catch (error) {
      this.handleError(error, 'exists');
    }
  }

  async count(filter?: Record<string, unknown>): Promise<number> {
    try {
      return await this.db.conversation.count({
        where: filter,
      });
    } catch (error) {
      this.handleError(error, 'count');
    }
  }

  async findByIds(ids: string[]): Promise<Conversation[]> {
    try {
      const conversations = await this.db.conversation.findMany({
        where: { id: { in: ids } },
      });

      return conversations.map((conv) => this.mapToEntity(conv));
    } catch (error) {
      this.handleError(error, 'findByIds');
    }
  }

  async createMany(conversations: Conversation[]): Promise<Conversation[]> {
    try {
      const data = conversations.map((conv) => ({
        id: conv.id,
        type: (conv.type === ConversationType.DM
          ? 'DM'
          : 'GROUP') as PrismaConversationType,
        name: conv.name,
        ownerId: conv.ownerId,
        createdAt: conv.createdAt,
        updatedAt: conv.updatedAt,
      }));

      await this.db.conversation.createMany({ data });
      return this.findByIds(conversations.map((c) => c.id));
    } catch (error) {
      this.handleError(error, 'createMany');
    }
  }

  async updateMany(
    updates: Array<{ id: string; data: Partial<Conversation> }>,
  ): Promise<Conversation[]> {
    try {
      await this.db.$transaction(
        updates.map((update) =>
          this.db.conversation.update({
            where: { id: update.id },
            data: {
              ...(update.data.name && { name: update.data.name }),
              ...(update.data.ownerId && {
                ownerId: update.data.ownerId,
              }),
              updatedAt: new Date(),
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
      await this.db.conversation.deleteMany({
        where: { id: { in: ids } },
      });
    } catch (error) {
      this.handleError(error, 'deleteMany');
    }
  }

  async findByOwnerId(
    ownerId: string,
    options?: PaginationOptions,
  ): Promise<PaginatedResult<Conversation>> {
    try {
      const { page, limit } = this.validatePaginationOptions(options);
      const offset = this.calculateOffset(page, limit);

      const [conversations, total] = await Promise.all([
        this.db.conversation.findMany({
          where: { ownerId },
          skip: offset,
          take: limit,
          orderBy: { createdAt: 'desc' },
        }),
        this.db.conversation.count({ where: { ownerId } }),
      ]);

      const entities = conversations.map((conv) => this.mapToEntity(conv));
      return this.createPaginatedResult(entities, total, page, limit);
    } catch (error) {
      this.handleError(error, 'findByOwnerId');
    }
  }

  async findByType(
    type: ConversationType,
    options?: PaginationOptions,
  ): Promise<PaginatedResult<Conversation>> {
    try {
      const { page, limit } = this.validatePaginationOptions(options);
      const offset = this.calculateOffset(page, limit);
      const prismaType = type === ConversationType.DM ? 'DM' : 'GROUP';

      const [conversations, total] = await Promise.all([
        this.db.conversation.findMany({
          where: { type: prismaType },
          skip: offset,
          take: limit,
          orderBy: { createdAt: 'desc' },
        }),
        this.db.conversation.count({
          where: { type: prismaType },
        }),
      ]);

      const entities = conversations.map((conv) => this.mapToEntity(conv));
      return this.createPaginatedResult(entities, total, page, limit);
    } catch (error) {
      this.handleError(error, 'findByType');
    }
  }

  async findByOwner(
    ownerId: string,
    options?: PaginationOptions,
  ): Promise<PaginatedResult<Conversation>> {
    try {
      const { page, limit } = this.validatePaginationOptions(options);
      const offset = this.calculateOffset(page, limit);

      const [conversations, total] = await Promise.all([
        this.db.conversation.findMany({
          where: { ownerId },
          skip: offset,
          take: limit,
          orderBy: { createdAt: 'desc' },
        }),
        this.db.conversation.count({ where: { ownerId } }),
      ]);

      const entities = conversations.map((conv) => this.mapToEntity(conv));
      return this.createPaginatedResult(entities, total, page, limit);
    } catch (error) {
      this.handleError(error, 'findByOwner');
    }
  }

  async findByMemberId(
    userId: string,
    options?: PaginationOptions,
  ): Promise<PaginatedResult<Conversation>> {
    try {
      const { page, limit } = this.validatePaginationOptions(options);
      const offset = this.calculateOffset(page, limit);

      const [conversations, total] = await Promise.all([
        this.db.conversation.findMany({
          where: {
            members: {
              some: { userId },
            },
          },
          skip: offset,
          take: limit,
          orderBy: { updatedAt: 'desc' },
        }),
        this.db.conversation.count({
          where: {
            members: {
              some: { userId },
            },
          },
        }),
      ]);

      const entities = conversations.map((conv) => this.mapToEntity(conv));
      return this.createPaginatedResult(entities, total, page, limit);
    } catch (error) {
      this.handleError(error, 'findByMemberId');
    }
  }

  async findByUserId(
    userId: string,
    options?: PaginationOptions,
    includeArchived: boolean = false,
  ): Promise<PaginatedResult<Conversation>> {
    // Alias for findByMemberId with additional archived filter support
    // TODO: Implement archived filtering when needed
    const result = await this.findByMemberId(userId, options);

    if (!includeArchived) {
      // Filter out archived conversations when implemented
      // For now, return all results as no archived field exists yet
    }

    return result;
  }

  async findDirectMessage(
    userId1: string,
    userId2: string,
  ): Promise<Conversation | null> {
    try {
      const conversation = await this.db.conversation.findFirst({
        where: {
          type: 'DM' as PrismaConversationType,
          members: {
            every: {
              userId: { in: [userId1, userId2] },
            },
          },
          AND: [
            { members: { some: { userId: userId1 } } },
            { members: { some: { userId: userId2 } } },
          ],
        },
      });

      return conversation ? this.mapToEntity(conversation) : null;
    } catch (error) {
      this.handleError(error, 'findDirectMessage');
    }
  }

  async searchByName(query: string, limit = 10): Promise<Conversation[]> {
    try {
      const conversations = await this.db.conversation.findMany({
        where: {
          name: {
            contains: query,
            mode: 'insensitive',
          },
        },
        take: limit,
        orderBy: { updatedAt: 'desc' },
      });

      return conversations.map((conv) => this.mapToEntity(conv));
    } catch (error) {
      this.handleError(error, 'searchByName');
    }
  }

  async findRecentConversations(
    since: Date,
    options?: PaginationOptions,
  ): Promise<PaginatedResult<Conversation>> {
    try {
      const { page, limit } = this.validatePaginationOptions(options);
      const offset = this.calculateOffset(page, limit);

      const [conversations, total] = await Promise.all([
        this.db.conversation.findMany({
          where: {
            updatedAt: { gte: since },
          },
          skip: offset,
          take: limit,
          orderBy: { updatedAt: 'desc' },
        }),
        this.db.conversation.count({
          where: {
            updatedAt: { gte: since },
          },
        }),
      ]);

      const entities = conversations.map((conv) => this.mapToEntity(conv));
      return this.createPaginatedResult(entities, total, page, limit);
    } catch (error) {
      this.handleError(error, 'findRecentConversations');
    }
  }

  async findActiveConversations(
    userId: string,
    sinceHours = 24,
    options?: PaginationOptions,
  ): Promise<PaginatedResult<Conversation>> {
    try {
      const { page, limit } = this.validatePaginationOptions(options);
      const offset = this.calculateOffset(page, limit);
      const since = new Date(Date.now() - sinceHours * 60 * 60 * 1000);

      const [conversations, total] = await Promise.all([
        this.db.conversation.findMany({
          where: {
            members: {
              some: { userId },
            },
            updatedAt: { gte: since },
          },
          skip: offset,
          take: limit,
          orderBy: { updatedAt: 'desc' },
        }),
        this.db.conversation.count({
          where: {
            members: {
              some: { userId },
            },
            updatedAt: { gte: since },
          },
        }),
      ]);

      const entities = conversations.map((conv) => this.mapToEntity(conv));
      return this.createPaginatedResult(entities, total, page, limit);
    } catch (error) {
      this.handleError(error, 'findActiveConversations');
    }
  }

  async getConversationStats(): Promise<ConversationStats> {
    try {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      const [
        totalConversations,
        directMessages,
        groupConversations,
        activeConversations,
        recentConversations,
      ] = await Promise.all([
        this.db.conversation.count(),
        this.db.conversation.count({
          where: { type: 'DM' },
        }),
        this.db.conversation.count({
          where: { type: 'GROUP' },
        }),
        this.db.conversation.count({
          where: {
            updatedAt: { gte: twentyFourHoursAgo },
          },
        }),
        this.db.conversation.count({
          where: {
            createdAt: { gte: thirtyDaysAgo },
          },
        }),
      ]);

      return {
        totalConversations,
        directMessages,
        groupConversations,
        activeConversations,
        recentConversations,
      };
    } catch (error) {
      this.handleError(error, 'getConversationStats');
    }
  }

  async findWithUnreadMessages(
    userId: string,
    options?: PaginationOptions,
  ): Promise<PaginatedResult<Conversation>> {
    try {
      const { page, limit } = this.validatePaginationOptions(options);
      const offset = this.calculateOffset(page, limit);

      const [conversations, total] = await Promise.all([
        this.db.conversation.findMany({
          where: {
            members: {
              some: {
                userId,
              },
            },
            messages: {
              some: {},
            },
          },
          skip: offset,
          take: limit,
          orderBy: { updatedAt: 'desc' },
        }),
        this.db.conversation.count({
          where: {
            members: {
              some: {
                userId,
              },
            },
            messages: {
              some: {},
            },
          },
        }),
      ]);

      const entities = conversations.map((conv) => this.mapToEntity(conv));
      return this.createPaginatedResult(entities, total, page, limit);
    } catch (error) {
      this.handleError(error, 'findWithUnreadMessages');
    }
  }

  async hasUserAccess(
    conversationId: string,
    userId: string,
  ): Promise<boolean> {
    try {
      const count = await this.db.conversationMember.count({
        where: {
          conversationId,
          userId,
        },
      });
      return count > 0;
    } catch (error) {
      this.handleError(error, 'hasUserAccess');
    }
  }

  async findByIdsWithMemberCount(
    conversationIds: string[],
  ): Promise<ConversationWithMemberCount[]> {
    try {
      const conversations = await this.db.conversation.findMany({
        where: { id: { in: conversationIds } },
        include: {
          _count: {
            select: { members: true },
          },
        },
      });

      return conversations.map((conv) => {
        const entity = this.mapToEntity(conv);
        return {
          ...entity,
          memberCount: conv._count.members,
        } as ConversationWithMemberCount;
      });
    } catch (error) {
      this.handleError(error, 'findByIdsWithMemberCount');
    }
  }

  async getLastActivity(
    conversationId: string,
    userId: string,
  ): Promise<Date | null> {
    try {
      const count = await this.db.conversationMember.count({
        where: {
          conversationId,
          userId,
        },
      });
      return count > 0 ? new Date() : null;
    } catch (error) {
      this.handleError(error, 'getLastActivity');
    }
  }

  async updateLastActivity(conversationId: string): Promise<void> {
    try {
      await this.db.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      });
    } catch (error) {
      this.handleError(error, 'updateLastActivity');
    }
  }

  private mapToEntity(data: {
    id: string;
    type: PrismaConversationType;
    name: string | null;
    ownerId: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): Conversation {
    return new Conversation(
      data.id,
      data.type as ConversationType,
      data.name,
      data.ownerId,
      data.createdAt,
      data.updatedAt,
    );
  }
}
