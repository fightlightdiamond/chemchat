import { Injectable } from '@nestjs/common';
import { ConversationMember } from '../../domain/entities/conversation-member.entity';
import { ConversationRole } from '../../domain/value-objects/conversation-role.vo';
import {
  ConversationMemberRepository,
  type MemberWithUnreadCount,
} from '../../domain/repositories/conversation-member.repository';
import { PrismaClient, Prisma } from '@prisma/client';
import { BaseRepositoryImpl } from '../../domain/repositories/base.repository';
import type {
  PaginatedResult,
  PaginationOptions,
} from '../../domain/repositories/base.repository';

// Use Prisma generated types
type PrismaConversationMember = Prisma.ConversationMemberGetPayload<object>;

// Type for update data that matches Prisma's UpdateInput
type PrismaUpdateData = {
  role?: 'OWNER' | 'ADMIN' | 'MEMBER';
  lastReadMessageId?: string | null;
  lastReadSequence?: bigint;
};

// Type for the composite key used in Prisma queries
type ConversationMemberCompositeKey = {
  conversationId: string;
  userId: string;
};

@Injectable()
export class ConversationMemberRepositoryImpl
  extends BaseRepositoryImpl<ConversationMember, string>
  implements ConversationMemberRepository
{
  protected entityName = 'ConversationMember';

  constructor(private readonly db: PrismaClient) {
    super();
  }

  /**
   * Converts a ConversationRole to Prisma MemberRole
   * @param role The role to convert
   * @returns Prisma MemberRole enum value
   */
  private toPrismaRole(role: ConversationRole): 'OWNER' | 'ADMIN' | 'MEMBER' {
    switch (role) {
      case ConversationRole.OWNER:
        return 'OWNER';
      case ConversationRole.ADMIN:
        return 'ADMIN';
      case ConversationRole.MEMBER:
        return 'MEMBER';
      default:
        return 'MEMBER';
    }
  }

  /**
   * Converts a ConversationRole to Prisma MemberRole string
   * @param role The role to convert
   * @returns Prisma MemberRole enum value
   */
  private convertRoleToString(
    role: ConversationRole,
  ): 'OWNER' | 'ADMIN' | 'MEMBER' {
    return this.toPrismaRole(role);
  }

  /**
   * Creates a composite key object for Prisma queries
   * @param id The composite ID in format "conversationId_userId"
   * @returns The composite key object for Prisma
   * @throws Error if the ID is not in the correct format
   */
  private parseCompositeId(id: string): ConversationMemberCompositeKey {
    const [conversationId, userId] = id.split('_');
    if (!conversationId || !userId) {
      throw new Error(`Invalid composite ID format: ${id}`);
    }
    return { conversationId, userId };
  }

  /**
   * Converts update data to a format suitable for Prisma
   * @param data The update data
   * @returns Prisma-compatible update data
   */
  private toPrismaUpdateData(
    data: Partial<ConversationMember>,
  ): PrismaUpdateData {
    const updateData: PrismaUpdateData = {};

    if (data.role) {
      updateData.role = this.convertRoleToString(data.role);
    }
    if ('lastReadMessageId' in data) {
      updateData.lastReadMessageId = data.lastReadMessageId ?? null;
    }
    if ('lastReadSequence' in data && data.lastReadSequence !== undefined) {
      updateData.lastReadSequence = data.lastReadSequence;
    }

    return updateData;
  }

  /**
   * Maps a Prisma conversation member to a domain entity
   */
  protected mapToEntity(record: PrismaConversationMember): ConversationMember {
    if (!record) {
      throw new Error('Cannot map null or undefined record to entity');
    }

    try {
      return new ConversationMember(
        record.conversationId,
        record.userId,
        this.convertPrismaRoleToEnum(record.role),
        record.lastReadMessageId,
        record.lastReadSequence,
        record.joinedAt,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to map conversation member: ${errorMessage}`);
    }
  }

  async findById(id: string): Promise<ConversationMember | null> {
    try {
      // Parse composite ID (format: "conversationId_userId")
      const [conversationId, userId] = id.split('_');
      if (!conversationId || !userId) {
        return null;
      }

      const member = await this.db.conversationMember.findUnique({
        where: {
          conversationId_userId: {
            conversationId,
            userId,
          },
        },
      });

      if (!member) {
        return null;
      }

      return this.mapToEntity(member);
    } catch (error: unknown) {
      return this.handleError(error, 'findById');
    }
  }

  async findByConversationAndUser(
    conversationId: string,
    userId: string,
  ): Promise<ConversationMember | null> {
    try {
      const member = await this.db.conversationMember.findUnique({
        where: {
          conversationId_userId: {
            conversationId,
            userId,
          },
        },
      });

      return member ? this.mapToEntity(member) : null;
    } catch (error: unknown) {
      return this.handleError(error, 'findByConversationAndUser');
    }
  }

  async findAll(
    options?: PaginationOptions,
  ): Promise<PaginatedResult<ConversationMember>> {
    try {
      const { page, limit } = this.validatePaginationOptions(options);
      const offset = this.calculateOffset(page, limit);

      const [members, total] = await Promise.all([
        this.db.conversationMember.findMany({
          skip: offset,
          take: limit,
          orderBy: options?.sortBy
            ? { [options.sortBy]: options.sortOrder || 'asc' }
            : { joinedAt: 'desc' },
        }),
        this.db.conversationMember.count(),
      ]);

      const entities = members.map((member) => this.mapToEntity(member));
      return this.createPaginatedResult(entities, total, page, limit);
    } catch (error: unknown) {
      return this.handleError(error, 'findAll');
    }
  }

  async create(member: ConversationMember): Promise<ConversationMember> {
    try {
      const created = await this.db.conversationMember.create({
        data: {
          conversationId: member.conversationId,
          userId: member.userId,
          role: this.convertRoleToString(member.role),
          lastReadMessageId: member.lastReadMessageId,
          lastReadSequence: member.lastReadSequence,
          joinedAt: member.joinedAt,
        },
      });

      return this.mapToEntity(created);
    } catch (error: unknown) {
      return this.handleError(error, 'create');
    }
  }

  async update(
    id: string,
    memberData: Partial<ConversationMember>,
  ): Promise<ConversationMember> {
    try {
      const [conversationId, userId] = id.split('_');
      if (!conversationId || !userId) {
        throw new Error('Invalid composite ID format');
      }

      const updated = await this.db.conversationMember.update({
        where: {
          conversationId_userId: {
            conversationId,
            userId,
          },
        },
        data: {
          ...(memberData.role && { role: this.toPrismaRole(memberData.role) }),
          ...(memberData.lastReadMessageId !== undefined && {
            lastReadMessageId: memberData.lastReadMessageId,
          }),
          ...(memberData.lastReadSequence !== undefined && {
            lastReadSequence: memberData.lastReadSequence,
          }),
        },
      });

      return this.mapToEntity(updated);
    } catch (error: unknown) {
      return this.handleError(error, 'update');
    }
  }

  async delete(id: string): Promise<void> {
    try {
      const [conversationId, userId] = id.split('_');
      if (!conversationId || !userId) {
        throw new Error('Invalid composite ID format');
      }

      await this.db.conversationMember.delete({
        where: {
          conversationId_userId: {
            conversationId,
            userId,
          },
        },
      });
    } catch (error: unknown) {
      return this.handleError(error, 'delete');
    }
  }

  async exists(id: string): Promise<boolean> {
    try {
      const [conversationId, userId] = id.split('_');
      if (!conversationId || !userId) {
        return false;
      }

      const count = await this.db.conversationMember.count({
        where: {
          conversationId,
          userId,
        },
      });
      return count > 0;
    } catch (error: unknown) {
      return this.handleError(error, 'exists');
    }
  }

  async count(filter?: Record<string, unknown>): Promise<number> {
    try {
      return await this.db.conversationMember.count({
        where: filter,
      });
    } catch (error: unknown) {
      return this.handleError(error, 'count');
    }
  }

  async findByIds(ids: string[]): Promise<ConversationMember[]> {
    try {
      // Parse composite IDs and create where conditions
      const whereConditions = ids
        .map((id) => {
          const [conversationId, userId] = id.split('_');
          if (!conversationId || !userId) return null;
          return {
            conversationId_userId: {
              conversationId,
              userId,
            },
          };
        })
        .filter(
          (condition): condition is NonNullable<typeof condition> =>
            condition !== null,
        );

      if (whereConditions.length === 0) {
        return [];
      }

      const members = await this.db.conversationMember.findMany({
        where: {
          OR: whereConditions as Prisma.ConversationMemberWhereInput[],
        },
      });

      return members.map((member) => this.mapToEntity(member));
    } catch (error: unknown) {
      return this.handleError(error, 'findByIds');
    }
  }

  async createMany(
    members: ConversationMember[],
  ): Promise<ConversationMember[]> {
    try {
      const data = members.map((member) => ({
        conversationId: member.conversationId,
        userId: member.userId,
        role: this.convertRoleToString(member.role),
        lastReadMessageId: member.lastReadMessageId,
        lastReadSequence: member.lastReadSequence,
        joinedAt: member.joinedAt,
      }));

      await this.db.conversationMember.createMany({ data });

      // Return created members by finding them using proper Prisma where conditions
      const created = await this.db.conversationMember.findMany({
        where: {
          OR: members.map((m) => ({
            conversationId_userId: {
              conversationId: m.conversationId,
              userId: m.userId,
            },
          })) as Prisma.ConversationMemberWhereInput[],
        },
      });

      return created.map((member) => this.mapToEntity(member));
    } catch (error: unknown) {
      return this.handleError(error, 'createMany');
    }
  }

  async updateMany(
    updates: Array<{ id: string; data: Partial<ConversationMember> }>,
  ): Promise<ConversationMember[]> {
    if (updates.length === 0) {
      return [];
    }

    try {
      // Process updates in batches to avoid overwhelming the database
      const BATCH_SIZE = 100;
      const results: ConversationMember[] = [];

      for (let i = 0; i < updates.length; i += BATCH_SIZE) {
        const batch = updates.slice(i, i + BATCH_SIZE);
        const batchResults = await this.processUpdateBatch(batch);
        results.push(...batchResults);
      }

      return results;
    } catch (error: unknown) {
      this.handleError(error, 'updateMany');
      return [];
    }
  }

  /**
   * Processes a batch of updates
   * @param updates Array of updates to process
   * @returns Array of successfully updated conversation members
   */
  private async processUpdateBatch(
    updates: Array<{ id: string; data: Partial<ConversationMember> }>,
  ): Promise<ConversationMember[]> {
    const updatePromises = updates.map(async (update) => {
      try {
        const { conversationId, userId } = this.parseCompositeId(update.id);
        const updateData = this.toPrismaUpdateData(update.data);

        const updated = await this.db.conversationMember.update({
          where: { conversationId_userId: { conversationId, userId } },
          data: updateData,
        });

        return {
          success: true as const,
          data: this.mapToEntity(updated),
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        console.error(`Failed to update member ${update.id}:`, errorMessage);
        return {
          success: false as const,
          id: update.id,
          error: errorMessage,
        };
      }
    });

    const results = await Promise.all(updatePromises);
    return results
      .filter(
        (result): result is { success: true; data: ConversationMember } =>
          result.success,
      )
      .map((result) => result.data);
  }

  async deleteMany(ids: string[]): Promise<void> {
    if (ids.length === 0) {
      return;
    }

    try {
      // Process deletes in batches to avoid overwhelming the database
      const BATCH_SIZE = 100;

      for (let i = 0; i < ids.length; i += BATCH_SIZE) {
        const batch = ids.slice(i, i + BATCH_SIZE);
        await this.processDeleteBatch(batch);
      }
    } catch (error) {
      this.handleError(error, 'deleteMany');
    }
  }

  /**
   * Processes a batch of deletes
   * @param ids Array of composite IDs to delete
   */
  private async processDeleteBatch(ids: string[]): Promise<void> {
    try {
      await this.db.$transaction(
        ids.map((id) => {
          const { conversationId, userId } = this.parseCompositeId(id);
          return this.db.conversationMember.delete({
            where: { conversationId_userId: { conversationId, userId } },
          });
        }),
      );
    } catch (error) {
      console.error('Failed to delete batch of members:', error);
      throw error; // Re-throw to be handled by deleteMany
    }
  }

  async findByConversationId(
    conversationId: string,
    options?: PaginationOptions,
  ): Promise<PaginatedResult<ConversationMember>> {
    try {
      const { page, limit } = this.validatePaginationOptions(options);
      const offset = this.calculateOffset(page, limit);

      const [members, total] = await Promise.all([
        this.db.conversationMember.findMany({
          where: { conversationId },
          skip: offset,
          take: limit,
          orderBy: { joinedAt: 'asc' },
        }),
        this.db.conversationMember.count({
          where: { conversationId },
        }),
      ]);

      const entities = members.map((member) => this.mapToEntity(member));
      return this.createPaginatedResult(entities, total, page, limit);
    } catch (error: unknown) {
      return this.handleError(error, 'findByConversationId');
    }
  }

  async findByUserId(
    userId: string,
    options?: PaginationOptions,
  ): Promise<PaginatedResult<ConversationMember>> {
    try {
      const { page, limit } = this.validatePaginationOptions(options);
      const offset = this.calculateOffset(page, limit);

      const [members, total] = await Promise.all([
        this.db.conversationMember.findMany({
          where: { userId },
          skip: offset,
          take: limit,
          orderBy: { joinedAt: 'desc' },
        }),
        this.db.conversationMember.count({
          where: { userId },
        }),
      ]);

      const entities = members.map((member) => this.mapToEntity(member));
      return this.createPaginatedResult(entities, total, page, limit);
    } catch (error: unknown) {
      return this.handleError(error, 'findByUserId');
    }
  }

  async findByRole(
    conversationId: string,
    role: ConversationRole,
    options?: PaginationOptions,
  ): Promise<PaginatedResult<ConversationMember>> {
    try {
      const { page, limit } = this.validatePaginationOptions(options);
      const offset = this.calculateOffset(page, limit);

      // Use the role directly since it matches Prisma's enum values
      const [members, total] = await Promise.all([
        this.db.conversationMember.findMany({
          where: {
            conversationId,
            role: this.convertRoleToString(role),
          },
          skip: offset,
          take: limit,
          orderBy: { joinedAt: 'asc' },
        }),
        this.db.conversationMember.count({
          where: {
            conversationId,
            role: this.convertRoleToString(role),
          },
        }),
      ]);

      const entities = members.map((member) => this.mapToEntity(member));
      return this.createPaginatedResult(entities, total, page, limit);
    } catch (error: unknown) {
      return this.handleError(error, 'findByRole');
    }
  }

  async findOwners(conversationId: string): Promise<ConversationMember[]> {
    try {
      const members = await this.db.conversationMember.findMany({
        where: {
          conversationId,
          role: 'OWNER',
        },
        orderBy: { joinedAt: 'asc' },
      });

      return members.map((member) => this.mapToEntity(member));
    } catch (error: unknown) {
      return this.handleError(error, 'findOwners');
    }
  }

  async findAdmins(conversationId: string): Promise<ConversationMember[]> {
    try {
      const members = await this.db.conversationMember.findMany({
        where: {
          conversationId,
          role: 'ADMIN',
        },
        orderBy: { joinedAt: 'asc' },
      });

      return members.map((member) => this.mapToEntity(member));
    } catch (error: unknown) {
      return this.handleError(error, 'findAdmins');
    }
  }

  async getMemberCount(conversationId: string): Promise<number> {
    try {
      return await this.db.conversationMember.count({
        where: { conversationId },
      });
    } catch (error: unknown) {
      return this.handleError(error, 'getMemberCount');
    }
  }

  async findByConversationAndRole(
    conversationId: string,
    role: ConversationRole,
  ): Promise<ConversationMember[]> {
    try {
      const members = await this.db.conversationMember.findMany({
        where: {
          conversationId,
          role: this.convertRoleToString(role),
        },
      });
      return members.map((member) => this.mapToEntity(member));
    } catch (error: unknown) {
      return this.handleError(error, 'findByConversationAndRole');
    }
  }

  async getMemberCountByRole(
    conversationId: string,
    role: ConversationRole,
  ): Promise<number> {
    try {
      return await this.db.conversationMember.count({
        where: {
          conversationId,
          role: this.convertRoleToString(role),
        },
      });
    } catch (error: unknown) {
      return this.handleError(error, 'getMemberCountByRole');
    }
  }

  async isMember(conversationId: string, userId: string): Promise<boolean> {
    try {
      const count = await this.db.conversationMember.count({
        where: { conversationId, userId },
      });
      return count > 0;
    } catch (error: unknown) {
      return this.handleError(error, 'isMember');
    }
  }

  async hasRole(
    conversationId: string,
    userId: string,
    role: ConversationRole,
  ): Promise<boolean> {
    try {
      const count = await this.db.conversationMember.count({
        where: {
          conversationId,
          userId,
          role: this.convertRoleToString(role),
        },
      });
      return count > 0;
    } catch (error: unknown) {
      return this.handleError(error, 'hasRole');
    }
  }

  async canPerformAction(
    conversationId: string,
    userId: string,
    action: string,
  ): Promise<boolean> {
    try {
      const member = await this.findByConversationAndUser(
        conversationId,
        userId,
      );
      if (!member) {
        return false;
      }

      // Simple permission check based on role
      return (
        member.role === ConversationRole.OWNER ||
        (member.role === ConversationRole.ADMIN &&
          action !== 'DELETE_CONVERSATION')
      );
    } catch (error: unknown) {
      return this.handleError(error, 'canPerformAction');
    }
  }

  async addMember(
    conversationId: string,
    userId: string,
    role: ConversationRole,
  ): Promise<ConversationMember> {
    try {
      const member = new ConversationMember(
        conversationId,
        userId,
        role,
        null,
        0n,
        new Date(),
      );

      return this.create(member);
    } catch (error: unknown) {
      return this.handleError(error, 'addMember');
    }
  }

  async removeMember(conversationId: string, userId: string): Promise<void> {
    try {
      await this.db.conversationMember.delete({
        where: {
          conversationId_userId: {
            conversationId,
            userId,
          },
        },
      });
    } catch (error: unknown) {
      return this.handleError(error, 'removeMember');
    }
  }

  async updateMemberRole(
    conversationId: string,
    userId: string,
    newRole: ConversationRole,
  ): Promise<ConversationMember> {
    try {
      const updated = await this.db.conversationMember.update({
        where: {
          conversationId_userId: {
            conversationId,
            userId,
          },
        },
        data: { role: this.convertRoleToString(newRole) },
      });

      return this.mapToEntity(updated);
    } catch (error: unknown) {
      return this.handleError(error, 'updateMemberRole');
    }
  }

  async updateLastRead(
    conversationId: string,
    userId: string,
    messageId: string,
    sequenceNumber: bigint,
  ): Promise<ConversationMember> {
    try {
      const updated = await this.db.conversationMember.update({
        where: {
          conversationId_userId: {
            conversationId,
            userId,
          },
        },
        data: {
          lastReadMessageId: messageId,
          lastReadSequence: sequenceNumber,
        },
      });

      return this.mapToEntity(updated);
    } catch (error: unknown) {
      return this.handleError(error, 'updateLastRead');
    }
  }

  async findMembersWithUnreadMessages(
    conversationId: string,
    latestSequence: bigint,
  ): Promise<ConversationMember[]> {
    try {
      const members = await this.db.conversationMember.findMany({
        where: {
          conversationId,
          lastReadSequence: { lt: latestSequence },
        },
      });

      return members.map((member) => this.mapToEntity(member));
    } catch (error: unknown) {
      return this.handleError(error, 'findMembersWithUnreadMessages');
    }
  }

  async findMembersWithUnreadCounts(
    conversationId: string,
    latestSequence: bigint,
  ): Promise<MemberWithUnreadCount[]> {
    try {
      const members = await this.db.conversationMember.findMany({
        where: { conversationId },
      });

      return members.map((member) => {
        const unreadCount =
          latestSequence > member.lastReadSequence
            ? latestSequence - member.lastReadSequence
            : 0n;

        const memberEntity = this.mapToEntity(member);
        return Object.assign(memberEntity, { unreadCount });
      });
    } catch (error: unknown) {
      return this.handleError(error, 'findMembersWithUnreadCounts');
    }
  }

  async findRecentMembers(
    conversationId: string,
    since: Date,
  ): Promise<ConversationMember[]> {
    try {
      const members = await this.db.conversationMember.findMany({
        where: {
          conversationId,
          joinedAt: { gte: since },
        },
        orderBy: { joinedAt: 'desc' },
      });

      return members.map((member) => this.mapToEntity(member));
    } catch (error: unknown) {
      return this.handleError(error, 'findRecentMembers');
    }
  }

  async addMembers(
    conversationId: string,
    members: Array<{ userId: string; role: ConversationRole }>,
  ): Promise<ConversationMember[]> {
    try {
      const memberEntities = members.map(
        (m) =>
          new ConversationMember(
            conversationId,
            m.userId,
            m.role,
            null,
            0n,
            new Date(),
          ),
      );

      return this.createMany(memberEntities);
    } catch (error: unknown) {
      return this.handleError(error, 'addMembers');
    }
  }

  async removeMembers(
    conversationId: string,
    userIds: string[],
  ): Promise<void> {
    try {
      await this.db.conversationMember.deleteMany({
        where: {
          conversationId,
          userId: { in: userIds },
        },
      });
    } catch (error: unknown) {
      return this.handleError(error, 'removeMembers');
    }
  }

  async transferOwnership(
    conversationId: string,
    currentOwnerId: string,
    newOwnerId: string,
  ): Promise<void> {
    try {
      await this.db.$transaction([
        // Demote current owner to admin
        this.db.conversationMember.update({
          where: {
            conversationId_userId: {
              conversationId,
              userId: currentOwnerId,
            },
          },
          data: { role: 'ADMIN' },
        }),
        // Promote new member to owner
        this.db.conversationMember.update({
          where: {
            conversationId_userId: {
              conversationId,
              userId: newOwnerId,
            },
          },
          data: { role: 'OWNER' },
        }),
        // Update conversation owner
        this.db.conversation.update({
          where: { id: conversationId },
          data: { ownerId: newOwnerId },
        }),
      ]);
    } catch (error: unknown) {
      return this.handleError(error, 'transferOwnership');
    }
  }

  protected handleError(error: unknown, method: string): never {
    let errorMessage = 'Unknown error';
    let stack: string | undefined;

    if (error instanceof Error) {
      errorMessage = error.message;
      stack = error.stack;
    } else if (typeof error === 'string') {
      errorMessage = error;
    }

    // Using console.error since we don't have access to logger in the base class
    console.error(
      `Error in ${this.entityName}Repository.${method}: ${errorMessage}`,
      { stack },
    );
    throw new Error(`Failed to ${method}: ${errorMessage}`);
  }

  private convertPrismaRoleToEnum(
    prismaRole: 'OWNER' | 'ADMIN' | 'MEMBER',
  ): ConversationRole {
    switch (prismaRole) {
      case 'OWNER':
        return ConversationRole.OWNER;
      case 'ADMIN':
        return ConversationRole.ADMIN;
      case 'MEMBER':
        return ConversationRole.MEMBER;
      default:
        return ConversationRole.MEMBER;
    }
  }
}
