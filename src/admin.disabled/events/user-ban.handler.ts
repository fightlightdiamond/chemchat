import { Injectable, Logger } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { RedisService } from '../../shared/services/redis.service';

export class UserBannedEvent {
  constructor(
    public readonly userId: string,
    public readonly tenantId: string | null,
    public readonly bannedBy: string,
    public readonly reason: string,
    public readonly banType: string,
    public readonly expiresAt?: Date,
  ) {}
}

@Injectable()
@EventsHandler(UserBannedEvent)
export class UserBanHandler implements IEventHandler<UserBannedEvent> {
  private readonly logger = new Logger(UserBanHandler.name);

  constructor(private readonly redis: RedisService) {}

  async handle(event: UserBannedEvent): Promise<void> {
    try {
      // Publish ban event to disconnect user from all active sessions
      const banNotification = {
        type: 'user_banned',
        userId: event.userId,
        tenantId: event.tenantId,
        reason: event.reason,
        banType: event.banType,
        expiresAt: event.expiresAt?.toISOString(),
        timestamp: new Date().toISOString(),
      };

      await this.redis.publish('moderation_events', JSON.stringify(banNotification));

      // Add user to banned users cache for quick lookup
      const banCacheKey = `banned_user:${event.userId}:${event.tenantId || 'global'}`;
      const ttl = event.expiresAt 
        ? Math.floor((event.expiresAt.getTime() - Date.now()) / 1000)
        : 86400 * 365; // 1 year for permanent bans

      await this.redis.setex(banCacheKey, ttl, JSON.stringify({
        bannedBy: event.bannedBy,
        reason: event.reason,
        banType: event.banType,
        bannedAt: new Date().toISOString(),
        expiresAt: event.expiresAt?.toISOString(),
      }));

      this.logger.log(`User ban event processed for user ${event.userId}`);
    } catch (error) {
      this.logger.error(`Failed to process user ban event: ${error.message}`, error.stack);
    }
  }
}
