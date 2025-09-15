import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../shared/infrastructure/prisma/prisma.service';
import { CacheService } from './cache.service';

interface PreloadingRule {
  name: string;
  enabled: boolean;
  trigger: string;
  condition?: () => Promise<boolean>;
  action: () => Promise<void>;
}

@Injectable()
export class CachePreloadingService {
  private readonly logger = new Logger(CachePreloadingService.name);
  private readonly rules: PreloadingRule[] = [];
  private readonly thresholds = new Map<string, number>();

  constructor(
    private cacheService: CacheService,
    private prisma: PrismaService,
    private configService: ConfigService,
    private eventEmitter: EventEmitter2,
  ) {
    this.initializeRules();
    this.setupEventListeners();
  }

  /**
   * Initialize preloading rules
   */
  private initializeRules(): void {
    this.rules.push(
      {
        name: 'user_join_conversation',
        enabled: true,
        trigger: 'event',
        condition: async () => true,
        action: async () => this.preloadUserConversations('user-id'),
      },
      {
        name: 'user_profile_view',
        enabled: true,
        trigger: 'event',
        condition: async () => true,
        action: async () => this.preloadUserProfile('user-id'),
      },
      {
        name: 'high_miss_rate_preload',
        enabled: true,
        trigger: 'threshold',
        condition: async () => {
          const currentValue = await this.getCurrentThresholdValue('high_miss_rate_preload');
          const threshold = this.thresholds.get('high_miss_rate_preload') || 0.25;
          return currentValue > threshold;
        },
        action: async () => this.preloadPopularContent(),
      },
      {
        name: 'low_memory_preload',
        enabled: true,
        trigger: 'threshold',
        condition: async () => {
          const currentValue = await this.getCurrentThresholdValue('low_memory_preload');
          const threshold = this.thresholds.get('low_memory_preload') || 0.75;
          return currentValue > threshold;
        },
        action: async () => this.preloadCriticalData(),
      },
    );

    // Set default thresholds
    this.thresholds.set('high_miss_rate_preload', 0.25);
    this.thresholds.set('low_memory_preload', 0.75);
  }

  /**
   * Setup event listeners for preloading triggers
   */
  private setupEventListeners(): void {
    this.eventEmitter.on('user_join_conversation', async () => {
      await this.executeRule('user_join_conversation');
    });

    this.eventEmitter.on('user_profile_view', async () => {
      await this.executeRule('user_profile_view');
    });

    this.eventEmitter.on('message_created', async () => {
      await this.executeRule('message_created');
    });
  }

  /**
   * Execute a specific preloading rule
   */
  private async executeRule(ruleName: string): Promise<void> {
    const rule = this.rules.find(r => r.name === ruleName && r.enabled);
    if (!rule) return;

    try {
      if (rule.condition && !(await rule.condition())) {
        return;
      }

      await rule.action();
      this.logger.debug(`Executed preloading rule: ${ruleName}`);
    } catch (error) {
      this.logger.error(`Error executing preloading rule ${ruleName}:`, error);
    }
  }

  /**
   * Check and execute threshold-based rules
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async checkThresholds(): Promise<void> {
    for (const rule of this.rules.filter(r => r.enabled && r.trigger === 'threshold')) {
      try {
        if (rule.condition && await rule.condition()) {
          await rule.action();
          this.logger.debug(`Executed threshold rule: ${rule.name}`);
        }
      } catch (error) {
        this.logger.error(`Error checking threshold for rule ${rule.name}:`, error);
      }
    }
  }

  /**
   * Preload user conversations when they join
   */
  private async preloadUserConversations(userId: string): Promise<void> {
    try {
      const userConversations = await this.prisma.conversationMember.findMany({
        where: { userId },
        include: {
          conversation: {
            select: {
              id: true,
              name: true,
              type: true,
              updatedAt: true,
            },
          },
        },
        orderBy: {
          conversation: {
            updatedAt: 'desc',
          },
        },
        take: 20,
      });

      const conversationItems = userConversations.map(cp => ({
        key: `conversation:${cp.conversationId}`,
        value: cp.conversation,
        options: { ttl: 1800, tags: ['conversations'], namespace: 'conversations' },
      }));

      await this.cacheService.mset(conversationItems);

      this.logger.debug(`Preloaded ${userConversations.length} user conversations for ${userId}`);
    } catch (error) {
      this.logger.error('Failed to preload user conversations:', error);
    }
  }

  /**
   * Preload user profile data
   */
  private async preloadUserProfile(userId: string): Promise<void> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          username: true,
          displayName: true,
          createdAt: true,
        },
      });

      if (user) {
        await this.cacheService.set(`user:${userId}`, user, {
          ttl: 3600,
          tags: ['users'],
          namespace: 'users',
        });

        this.logger.debug(`Preloaded user profile for ${userId}`);
      }
    } catch (error) {
      this.logger.error('Failed to preload user profile:', error);
    }
  }

  /**
   * Preload popular content based on high cache miss rate
   */
  private async preloadPopularContent(): Promise<void> {
    try {
      // Preload recent messages from active conversations
      const recentMessages = await this.prisma.message.findMany({
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
        orderBy: { createdAt: 'desc' },
        take: 100,
      });

      const messageItems = recentMessages.map(message => ({
        key: `message:${message.id}`,
        value: message,
        options: { ttl: 1800, tags: ['messages'], namespace: 'messages' },
      }));

      await this.cacheService.mset(messageItems);

      this.logger.debug(`Preloaded ${recentMessages.length} popular messages`);
    } catch (error) {
      this.logger.error('Failed to preload popular content:', error);
    }
  }

  /**
   * Preload critical data for low memory situations
   */
  private async preloadCriticalData(): Promise<void> {
    try {
      // Preload active user data
      const activeUsers = await this.prisma.user.findMany({
        where: {
          updatedAt: {
            gte: new Date(Date.now() - 60 * 60 * 1000), // Last hour
          },
        },
        select: {
          id: true,
          username: true,
          updatedAt: true,
        },
        take: 50,
      });

      const userItems = activeUsers.map(user => ({
        key: `user:${user.id}`,
        value: user,
        options: { ttl: 600, tags: ['users'], namespace: 'users' },
      }));

      await this.cacheService.mset(userItems);

      this.logger.debug(`Preloaded ${activeUsers.length} critical user data for low memory`);
    } catch (error) {
      this.logger.error('Failed to preload critical data:', error);
    }
  }

  /**
   * Get current threshold value for a rule
   */
  private async getCurrentThresholdValue(ruleName: string): Promise<number> {
    switch (ruleName) {
      case 'high_miss_rate_preload':
        // This would come from cache metrics
        return 0.25; // Placeholder
      case 'low_memory_preload':
        // This would come from system metrics
        return 0.75; // Placeholder
      default:
        return 0;
    }
  }

  /**
   * Get preloading statistics
   */
  getStats(): {
    totalRules: number;
    enabledRules: number;
    rules: Array<{
      name: string;
      enabled: boolean;
      trigger: string;
    }>;
  } {
    return {
      totalRules: this.rules.length,
      enabledRules: this.rules.filter(r => r.enabled).length,
      rules: this.rules.map(r => ({
        name: r.name,
        enabled: r.enabled,
        trigger: r.trigger,
      })),
    };
  }

  /**
   * Enable/disable preloading rule
   */
  toggleRule(ruleName: string, enabled: boolean): void {
    const rule = this.rules.find(r => r.name === ruleName);
    if (rule) {
      rule.enabled = enabled;
      this.logger.log(`Preloading rule '${ruleName}' ${enabled ? 'enabled' : 'disabled'}`);
    } else {
      throw new Error(`Preloading rule '${ruleName}' not found`);
    }
  }
}
