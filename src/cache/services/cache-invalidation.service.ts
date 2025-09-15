import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { CacheService } from './cache.service';

export interface InvalidationRule {
  event: string;
  tags: string[];
  keys?: string[];
  pattern?: string;
  condition?: (payload: any) => boolean;
}

@Injectable()
export class CacheInvalidationService {
  private readonly logger = new Logger(CacheInvalidationService.name);
  private readonly rules: Map<string, InvalidationRule[]> = new Map();

  constructor(
    private cacheService: CacheService,
    private eventEmitter: EventEmitter2,
  ) {
    this.setupDefaultRules();
  }

  /**
   * Register cache invalidation rule
   */
  registerRule(rule: InvalidationRule): void {
    const existingRules = this.rules.get(rule.event) || [];
    existingRules.push(rule);
    this.rules.set(rule.event, existingRules);
    
    this.logger.debug(`Registered invalidation rule for event: ${rule.event}`);
  }

  /**
   * Remove invalidation rule
   */
  unregisterRule(event: string, ruleIndex?: number): void {
    if (ruleIndex !== undefined) {
      const rules = this.rules.get(event) || [];
      rules.splice(ruleIndex, 1);
      if (rules.length === 0) {
        this.rules.delete(event);
      } else {
        this.rules.set(event, rules);
      }
    } else {
      this.rules.delete(event);
    }
    
    this.logger.debug(`Unregistered invalidation rule(s) for event: ${event}`);
  }

  /**
   * Manually invalidate cache by tags
   */
  async invalidateByTags(tags: string[]): Promise<void> {
    await this.cacheService.invalidateByTags(tags);
    this.logger.debug(`Manually invalidated cache for tags: ${tags.join(', ')}`);
  }

  /**
   * Manually invalidate cache by keys
   */
  async invalidateByKeys(keys: string[], namespace?: string): Promise<void> {
    await Promise.all(
      keys.map(key => this.cacheService.del(key, namespace))
    );
    this.logger.debug(`Manually invalidated cache for keys: ${keys.join(', ')}`);
  }

  /**
   * Invalidate cache by pattern (use with caution)
   */
  async invalidateByPattern(pattern: string): Promise<void> {
    // This would require Redis SCAN operation for safety
    this.logger.warn(`Pattern invalidation not implemented for safety: ${pattern}`);
  }

  /**
   * Handle cache invalidation events
   */
  @OnEvent('**', { async: true })
  async handleEvent(payload: any, event?: string): Promise<void> {
    if (!event) return;

    const rules = this.rules.get(event);
    if (!rules || rules.length === 0) return;

    for (const rule of rules) {
      try {
        // Check condition if provided
        if (rule.condition && !rule.condition(payload)) {
          continue;
        }

        // Invalidate by tags
        if (rule.tags && rule.tags.length > 0) {
          await this.cacheService.invalidateByTags(rule.tags);
        }

        // Invalidate by specific keys
        if (rule.keys && rule.keys.length > 0) {
          await this.invalidateByKeys(rule.keys);
        }

        // Invalidate by pattern (if implemented)
        if (rule.pattern) {
          await this.invalidateByPattern(rule.pattern);
        }

        this.logger.debug(`Applied invalidation rule for event: ${event}`);
      } catch (error) {
        this.logger.error(`Error applying invalidation rule for event ${event}:`, error);
      }
    }
  }

  /**
   * Setup default invalidation rules
   */
  private setupDefaultRules(): void {
    // User-related invalidations
    this.registerRule({
      event: 'user.updated',
      tags: ['users'],
      keys: [],
      condition: (payload) => payload?.userId,
    });

    this.registerRule({
      event: 'user.profile.updated',
      tags: ['user_profiles'],
      condition: (payload) => payload?.userId,
    });

    // Message-related invalidations
    this.registerRule({
      event: 'message.created',
      tags: ['conversations', 'conversation_summaries'],
      condition: (payload) => payload?.conversationId,
    });

    this.registerRule({
      event: 'message.edited',
      tags: ['messages', 'conversation_summaries'],
      condition: (payload) => payload?.messageId,
    });

    this.registerRule({
      event: 'message.deleted',
      tags: ['messages', 'conversation_summaries'],
      condition: (payload) => payload?.messageId,
    });

    // Conversation-related invalidations
    this.registerRule({
      event: 'conversation.created',
      tags: ['conversations', 'user_conversations'],
      condition: (payload) => payload?.conversationId,
    });

    this.registerRule({
      event: 'conversation.updated',
      tags: ['conversations', 'conversation_summaries'],
      condition: (payload) => payload?.conversationId,
    });

    this.registerRule({
      event: 'conversation.participant.added',
      tags: ['conversations', 'user_conversations'],
      condition: (payload) => payload?.conversationId && payload?.userId,
    });

    this.registerRule({
      event: 'conversation.participant.removed',
      tags: ['conversations', 'user_conversations'],
      condition: (payload) => payload?.conversationId && payload?.userId,
    });

    // Presence-related invalidations
    this.registerRule({
      event: 'presence.updated',
      tags: ['user_presence'],
      condition: (payload) => payload?.userId,
    });

    // Notification-related invalidations
    this.registerRule({
      event: 'notification.preferences.updated',
      tags: ['notification_preferences'],
      condition: (payload) => payload?.userId,
    });

    // Tenant-related invalidations
    this.registerRule({
      event: 'tenant.settings.updated',
      tags: ['tenant_settings', 'tenant_quotas'],
      condition: (payload) => payload?.tenantId,
    });

    this.registerRule({
      event: 'tenant.quota.updated',
      tags: ['tenant_quotas'],
      condition: (payload) => payload?.tenantId,
    });

    // Media-related invalidations
    this.registerRule({
      event: 'media.processed',
      tags: ['attachments'],
      condition: (payload) => payload?.attachmentId,
    });

    this.registerRule({
      event: 'media.deleted',
      tags: ['attachments'],
      condition: (payload) => payload?.attachmentId,
    });

    // Search index invalidations
    this.registerRule({
      event: 'search.index.updated',
      tags: ['search_results', 'search_suggestions'],
    });

    this.logger.log('Default cache invalidation rules registered');
  }

  /**
   * Get all registered rules for debugging
   */
  getRules(): Map<string, InvalidationRule[]> {
    return new Map(this.rules);
  }

  /**
   * Get statistics about invalidation rules
   */
  getStats(): {
    totalRules: number;
    eventCount: number;
    rulesByEvent: Record<string, number>;
  } {
    const rulesByEvent: Record<string, number> = {};
    let totalRules = 0;

    for (const [event, rules] of this.rules.entries()) {
      rulesByEvent[event] = rules.length;
      totalRules += rules.length;
    }

    return {
      totalRules,
      eventCount: this.rules.size,
      rulesByEvent,
    };
  }
}
