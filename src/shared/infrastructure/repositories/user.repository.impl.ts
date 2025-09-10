import { Injectable } from '@nestjs/common';
import { User as PrismaUser } from '@prisma/client';
import { User } from '../../domain/entities/user.entity';
import {
  UserRepository,
  UserStats,
} from '../../domain/repositories/user.repository';
import {
  BaseRepositoryImpl,
  PaginationOptions,
  PaginatedResult,
} from '../../domain/repositories/base.repository';
import { DatabaseService } from '../../services/database.service';

@Injectable()
export class UserRepositoryImpl
  extends BaseRepositoryImpl<User>
  implements UserRepository
{
  protected entityName = 'User';

  constructor(private readonly db: DatabaseService) {
    super();
  }

  async findById(id: string): Promise<User | null> {
    try {
      const user = await this.db.user.findUnique({
        where: { id },
      });

      return user ? this.mapToEntity(user) : null;
    } catch (error) {
      this.handleError(error, 'findById');
    }
  }

  async findByUsername(username: string): Promise<User | null> {
    try {
      const user = await this.db.user.findUnique({
        where: { username },
      });

      return user ? this.mapToEntity(user) : null;
    } catch (error) {
      this.handleError(error, 'findByUsername');
    }
  }

  async findByEmail(email: string): Promise<User | null> {
    try {
      const user = await this.db.user.findUnique({
        where: { email },
      });

      return user ? this.mapToEntity(user) : null;
    } catch (error) {
      this.handleError(error, 'findByEmail');
    }
  }

  async findAll(options?: PaginationOptions): Promise<PaginatedResult<User>> {
    try {
      const { page, limit } = this.validatePaginationOptions(options);
      const offset = this.calculateOffset(page, limit);

      const [users, total] = await Promise.all([
        this.db.user.findMany({
          skip: offset,
          take: limit,
          orderBy: options?.sortBy
            ? { [options.sortBy]: options.sortOrder || 'asc' }
            : { createdAt: 'desc' },
        }),
        this.db.user.count(),
      ]);

      const entities = users.map((user) => this.mapToEntity(user));
      return this.createPaginatedResult(entities, total, page, limit);
    } catch (error) {
      this.handleError(error, 'findAll');
    }
  }

  async create(user: User): Promise<User> {
    try {
      const created = await this.db.user.create({
        data: {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          email: user.email,
          passwordHash: user.passwordHash,
          mfaEnabled: user.mfaEnabled,
          mfaSecret: user.mfaSecret,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
      });

      return this.mapToEntity(created);
    } catch (error) {
      this.handleError(error, 'create');
    }
  }

  async update(id: string, userData: Partial<User>): Promise<User> {
    try {
      const updated = await this.db.user.update({
        where: { id },
        data: {
          ...(userData.username && { username: userData.username }),
          ...(userData.displayName && { displayName: userData.displayName }),
          ...(userData.email && { email: userData.email }),
          ...(userData.passwordHash && { passwordHash: userData.passwordHash }),
          ...(userData.mfaEnabled !== undefined && {
            mfaEnabled: userData.mfaEnabled,
          }),
          ...(userData.mfaSecret !== undefined && {
            mfaSecret: userData.mfaSecret,
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
      await this.db.user.delete({
        where: { id },
      });
    } catch (error) {
      this.handleError(error, 'delete');
    }
  }

  async exists(id: string): Promise<boolean> {
    try {
      const count = await this.db.user.count({
        where: { id },
      });
      return count > 0;
    } catch (error) {
      this.handleError(error, 'exists');
    }
  }

  async count(filter?: Record<string, any>): Promise<number> {
    try {
      return await this.db.user.count({
        where: filter,
      });
    } catch (error) {
      this.handleError(error, 'count');
    }
  }

  async findByIds(ids: string[]): Promise<User[]> {
    try {
      const users = await this.db.user.findMany({
        where: {
          id: { in: ids },
        },
      });

      return users.map((user) => this.mapToEntity(user));
    } catch (error) {
      this.handleError(error, 'findByIds');
    }
  }

  async createMany(users: User[]): Promise<User[]> {
    try {
      const data = users.map((user) => ({
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        email: user.email,
        passwordHash: user.passwordHash,
        mfaEnabled: user.mfaEnabled,
        mfaSecret: user.mfaSecret,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      }));

      await this.db.user.createMany({ data });

      // Return the created users
      return this.findByIds(users.map((u) => u.id));
    } catch (error) {
      this.handleError(error, 'createMany');
    }
  }

  async updateMany(
    updates: Array<{ id: string; data: Partial<User> }>,
  ): Promise<User[]> {
    try {
      await this.db.$transaction(
        updates.map((update) =>
          this.db.user.update({
            where: { id: update.id },
            data: {
              ...(update.data.username && { username: update.data.username }),
              ...(update.data.displayName && {
                displayName: update.data.displayName,
              }),
              ...(update.data.email && { email: update.data.email }),
              ...(update.data.passwordHash && {
                passwordHash: update.data.passwordHash,
              }),
              ...(update.data.mfaEnabled !== undefined && {
                mfaEnabled: update.data.mfaEnabled,
              }),
              ...(update.data.mfaSecret !== undefined && {
                mfaSecret: update.data.mfaSecret,
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
      await this.db.user.deleteMany({
        where: {
          id: { in: ids },
        },
      });
    } catch (error) {
      this.handleError(error, 'deleteMany');
    }
  }

  async searchByUsername(query: string, limit = 10): Promise<User[]> {
    try {
      const users = await this.db.user.findMany({
        where: {
          username: {
            contains: query,
            mode: 'insensitive',
          },
        },
        take: limit,
        orderBy: { username: 'asc' },
      });

      return users.map((user) => this.mapToEntity(user));
    } catch (error) {
      this.handleError(error, 'searchByUsername');
    }
  }

  async findRecentUsers(
    since: Date,
    options?: PaginationOptions,
  ): Promise<PaginatedResult<User>> {
    try {
      const { page, limit } = this.validatePaginationOptions(options);
      const offset = this.calculateOffset(page, limit);

      const [users, total] = await Promise.all([
        this.db.user.findMany({
          where: {
            createdAt: { gte: since },
          },
          skip: offset,
          take: limit,
          orderBy: { createdAt: 'desc' },
        }),
        this.db.user.count({
          where: {
            createdAt: { gte: since },
          },
        }),
      ]);

      const entities = users.map((user) => this.mapToEntity(user));
      return this.createPaginatedResult(entities, total, page, limit);
    } catch (error) {
      this.handleError(error, 'findRecentUsers');
    }
  }

  async findUsersWithMFA(
    options?: PaginationOptions,
  ): Promise<PaginatedResult<User>> {
    try {
      const { page, limit } = this.validatePaginationOptions(options);
      const offset = this.calculateOffset(page, limit);

      const [users, total] = await Promise.all([
        this.db.user.findMany({
          where: { mfaEnabled: true },
          skip: offset,
          take: limit,
          orderBy: { createdAt: 'desc' },
        }),
        this.db.user.count({
          where: { mfaEnabled: true },
        }),
      ]);

      const entities = users.map((user) => this.mapToEntity(user));
      return this.createPaginatedResult(entities, total, page, limit);
    } catch (error) {
      this.handleError(error, 'findUsersWithMFA');
    }
  }

  async isUsernameAvailable(username: string): Promise<boolean> {
    try {
      const count = await this.db.user.count({
        where: { username },
      });
      return count === 0;
    } catch (error) {
      this.handleError(error, 'isUsernameAvailable');
    }
  }

  async isEmailAvailable(email: string): Promise<boolean> {
    try {
      const count = await this.db.user.count({
        where: { email },
      });
      return count === 0;
    } catch (error) {
      this.handleError(error, 'isEmailAvailable');
    }
  }

  async updateLastLogin(userId: string): Promise<void> {
    try {
      await this.db.user.update({
        where: { id: userId },
        data: {
          updatedAt: new Date(),
        },
      });
    } catch (error) {
      this.handleError(error, 'updateLastLogin');
    }
  }

  async getUserStats(): Promise<UserStats> {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const [totalUsers, usersWithMFA, recentUsers, activeUsers] =
        await Promise.all([
          this.db.user.count(),
          this.db.user.count({ where: { mfaEnabled: true } }),
          this.db.user.count({
            where: { createdAt: { gte: thirtyDaysAgo } },
          }),
          this.db.user.count({
            where: { updatedAt: { gte: thirtyDaysAgo } },
          }),
        ]);

      return {
        totalUsers,
        usersWithMFA,
        recentUsers,
        activeUsers,
      };
    } catch (error) {
      this.handleError(error, 'getUserStats');
    }
  }

  async findByUsernames(usernames: string[]): Promise<User[]> {
    try {
      const users = await this.db.user.findMany({
        where: {
          username: { in: usernames },
        },
      });

      return users.map((user) => this.mapToEntity(user));
    } catch (error) {
      this.handleError(error, 'findByUsernames');
    }
  }

  async findByEmails(emails: string[]): Promise<User[]> {
    try {
      const users = await this.db.user.findMany({
        where: {
          email: { in: emails },
        },
      });

      return users.map((user) => this.mapToEntity(user));
    } catch (error) {
      this.handleError(error, 'findByEmails');
    }
  }

  private mapToEntity(prismaUser: PrismaUser): User {
    return new User(
      prismaUser.id,
      prismaUser.username,
      prismaUser.displayName,
      prismaUser.email,
      prismaUser.passwordHash,
      prismaUser.mfaEnabled,
      prismaUser.mfaSecret || undefined,
      prismaUser.createdAt,
      prismaUser.updatedAt,
    );
  }
}
