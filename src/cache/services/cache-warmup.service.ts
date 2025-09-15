import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CacheService } from './cache.service';
import { PrismaService } from '../../shared/infrastructure/prisma/prisma.service';

export interface WarmupStrategy {
  name: string;
  enabled: boolean;
  priority: number;
  schedule?: string;
  execute: () => Promise<void>;
}

@Injectable()
export class CacheWarmupService implements OnApplicationBootstrap {
  private readonly logger = new Logger(CacheWarmupService.name);
  private readonly strategies: WarmupStrategy[] = [];
  private isWarming = false;

  constructor(
    private cacheService: CacheService,
    private prismaService: PrismaService,
    private configService: ConfigService,
  ) {
    this.setupWarmupStrategies();
  }

  async onApplicationBootstrap(): Promise<void> {
    if (this.configService.get('CACHE_WARMUP_ON_STARTUP', 'true') === 'true') {
      await this.warmupAll();
    }
  }

  /**
   * Execute all warmup strategies
   */
  async warmupAll(): Promise<void> {
    if (this.isWarming) {
      this.logger.warn('Cache warmup already in progress, skipping');
      return;
    }

    this.isWarming = true;
    const startTime = Date.now();

    try {
      this.logger.log('Starting cache warmup process');

      // Sort strategies by priority (higher priority first)
      const enabledStrategies = this.strategies
        .filter(strategy => strategy.enabled)
        .sort((a, b) => b.priority - a.priority);

      for (const strategy of enabledStrategies) {
        try {
          const strategyStart = Date.now();
          await strategy.execute();
          const duration = Date.now() - strategyStart;
          this.logger.debug(`Warmup strategy '${strategy.name}' completed in ${duration}ms`);
        } catch (error) {
          this.logger.error(`Warmup strategy '${strategy.name}' failed:`, error);
        }
      }

      const totalDuration = Date.now() - startTime;
      this.logger.log(`Cache warmup completed in ${totalDuration}ms`);
    } catch (error) {
      this.logger.error('Cache warmup process failed:', error);
    } finally {
      this.isWarming = false;
    }
  }

  /**
   * Execute specific warmup strategy
   */
  async warmupStrategy(strategyName: string): Promise<void> {
    const strategy = this.strategies.find(s => s.name === strategyName);
    if (!strategy) {
      throw new Error(`Warmup strategy '${strategyName}' not found`);
    }

    if (!strategy.enabled) {
      this.logger.warn(`Warmup strategy '${strategyName}' is disabled`);
      return;
    }

    const startTime = Date.now();
    try {
      await strategy.execute();
      const duration = Date.now() - startTime;
      this.logger.log(`Warmup strategy '${strategyName}' completed in ${duration}ms`);
    } catch (error) {
      this.logger.error(`Warmup strategy '${strategyName}' failed:`, error);
      throw error;
    }
  }

  /**
   * Scheduled warmup - runs every hour
   */
  async scheduledWarmup(): Promise<void> {
    if (this.configService.get('CACHE_SCHEDULED_WARMUP', 'true') === 'true') {
      await this.warmupAll();
    }
  }

  /**
   * Setup warmup strategies
   */
  private setupWarmupStrategies(): void {
    // Active users warmup
    this.strategies.push({
      name: 'active_users',
      enabled: true,
      priority: 100,
      execute: async () => {
        const activeUsers = await this.prismaService.user.findMany({
          where: {
            lastLoginAt: {
              gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
            },
          },
          select: {
            id: true,
            email: true,
            username: true,
            displayName: true,
            lastLoginAt: true,
          },
          take: 1000,
        });

        const cacheItems = activeUsers.map(user => ({
          key: `user:${user.id}`,
          value: user,
          options: { ttl: 3600, tags: ['users'], namespace: 'users' },
        }));

        await this.cacheService.mset(cacheItems);
        this.logger.debug(`Warmed up ${activeUsers.length} active users`);
      },
    });

    // Popular conversations warmup
    this.strategies.push({
      name: 'popular_conversations',
      enabled: true,
      priority: 90,
      execute: async () => {
        const conversations = await this.prismaService.conversation.findMany({
          where: {
            updatedAt: {
              gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
            },
          },
          include: {
            members: {
              take: 10,
              include: {
                user: {
                  select: {
                    id: true,
                    username: true,
                    displayName: true,
                  },
                },
              },
            },
          },
          orderBy: {
            updatedAt: 'desc',
          },
          take: 500,
        });

        const cacheItems = conversations.map(conversation => ({
          key: `conversation:${conversation.id}`,
          value: conversation,
          options: { ttl: 1800, tags: ['conversations'], namespace: 'conversations' },
        }));

        await this.cacheService.mset(cacheItems);
        this.logger.debug(`Warmed up ${conversations.length} popular conversations`);
      },
    });

    // Recent messages warmup
    this.strategies.push({
      name: 'recent_messages',
      enabled: true,
      priority: 80,
      execute: async () => {
        const recentMessages = await this.prismaService.message.findMany({
          where: {
            createdAt: {
              gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
            },
          },
          include: {
            sender: {
              select: {
                id: true,
                username: true,
                displayName: true,
              },
            },
          },
          orderBy: {
            createdAt: 'desc',
          },
          take: 500,
        });

        const cacheItems = recentMessages.map(message => ({
          key: `message:${message.id}`,
          value: message,
          options: { ttl: 600, tags: ['messages'], namespace: 'messages' },
        }));

        await this.cacheService.mset(cacheItems);
        this.logger.debug(`Warmed up ${recentMessages.length} recent messages`);
      },
    });

    // User presence warmup
    this.strategies.push({
      name: 'user_presence',
      enabled: true,
      priority: 70,
      execute: async () => {
        const activeUsers = await this.prismaService.user.findMany({
          where: {
            updatedAt: {
              gte: new Date(Date.now() - 60 * 60 * 1000), // Last hour
            },
          },
          select: {
            id: true,
            updatedAt: true,
          },
          take: 500,
        });

        const cacheItems = activeUsers.map(user => ({
          key: `presence:${user.id}`,
          value: {
            userId: user.id,
            status: 'ONLINE',
            lastSeen: user.updatedAt,
            devices: [],
          },
          options: { ttl: 300, tags: ['user_presence'], namespace: 'presence' },
        }));

        await this.cacheService.mset(cacheItems);
        this.logger.debug(`Warmed up ${activeUsers.length} user presence entries`);
      },
    });

    // Recent attachments warmup
    this.strategies.push({
      name: 'recent_attachments',
      enabled: true,
      priority: 40,
      execute: async () => {
        const recentAttachments = await this.prismaService.attachment.findMany({
          where: {
            createdAt: {
              gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
            },
          },
          orderBy: {
            createdAt: 'desc',
          },
          take: 1000,
        });

        const cacheItems = recentAttachments.map(attachment => ({
          key: `attachment:${attachment.id}`,
          value: attachment,
          options: { ttl: 1800, tags: ['attachments'], namespace: 'media' },
        }));

        await this.cacheService.mset(cacheItems);
        this.logger.debug(`Warmed up ${recentAttachments.length} recent attachments`);
      },
    });

    this.logger.log(`Registered ${this.strategies.length} cache warmup strategies`);
  }

  /**
   * Get warmup statistics
   */
  getStats(): {
    totalStrategies: number;
    enabledStrategies: number;
    isWarming: boolean;
    strategies: Array<{
      name: string;
      enabled: boolean;
      priority: number;
    }>;
  } {
    return {
      totalStrategies: this.strategies.length,
      enabledStrategies: this.strategies.filter(s => s.enabled).length,
      isWarming: this.isWarming,
      strategies: this.strategies.map(s => ({
        name: s.name,
        enabled: s.enabled,
        priority: s.priority,
      })),
    };
  }

  /**
   * Enable/disable warmup strategy
   */
  toggleStrategy(strategyName: string, enabled: boolean): void {
    const strategy = this.strategies.find(s => s.name === strategyName);
    if (strategy) {
      strategy.enabled = enabled;
      this.logger.log(`Warmup strategy '${strategyName}' ${enabled ? 'enabled' : 'disabled'}`);
    } else {
      throw new Error(`Warmup strategy '${strategyName}' not found`);
    }
  }
}
