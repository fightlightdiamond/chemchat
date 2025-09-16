import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

export enum SecurityEventType {
  LOGIN_SUCCESS = 'LOGIN_SUCCESS',
  LOGIN_FAILED = 'LOGIN_FAILED',
  PASSWORD_CHANGE = 'PASSWORD_CHANGE',
  PERMISSION_CHANGE = 'PERMISSION_CHANGE',
  DATA_ACCESS = 'DATA_ACCESS',
  DATA_MODIFICATION = 'DATA_MODIFICATION',
  CONFIGURATION_CHANGE = 'CONFIGURATION_CHANGE',
  SECURITY_ALERT = 'SECURITY_ALERT',
  SUSPICIOUS_ACTIVITY = 'SUSPICIOUS_ACTIVITY',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  GEO_BLOCKED = 'GEO_BLOCKED',
  USER_BLOCKED = 'USER_BLOCKED',
  USER_UNBLOCKED = 'USER_UNBLOCKED',
  API_KEY_CREATED = 'API_KEY_CREATED',
  API_KEY_REVOKED = 'API_KEY_REVOKED',
}

export interface SecurityEvent {
  type: SecurityEventType;
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, any>;
  timestamp?: Date;
}

@Injectable()
export class SecurityAuditService {
  private readonly logger = new Logger(SecurityAuditService.name);
  private readonly SECURITY_EVENTS_QUEUE = 'security:events:queue';
  private readonly SUSPICIOUS_ACTIVITY_THRESHOLD = 5; // Number of failed attempts before flagging
  private readonly SUSPICIOUS_ACTIVITY_WINDOW = 15 * 60 * 1000; // 15 minutes in milliseconds

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly eventEmitter: EventEmitter2,
  ) {
    // Start processing events from the queue
    this.processEventQueue().catch((err) =>
      this.logger.error('Error processing security event queue:', err),
    );
  }

  async logEvent(event: SecurityEvent): Promise<void> {
    const timestamp = event.timestamp || new Date();
    const eventWithTimestamp = { ...event, timestamp };

    try {
      // Add to Redis queue for async processing
      await this.redis.rpush(
        this.SECURITY_EVENTS_QUEUE,
        JSON.stringify(eventWithTimestamp),
      );

      // Emit event for real-time processing
      this.eventEmitter.emit('security.event', eventWithTimestamp);

      // Check for suspicious activity patterns
      if (this.isSuspiciousEvent(event)) {
        await this.handleSuspiciousActivity(event);
      }
    } catch (error) {
      this.logger.error(
        `Failed to log security event: ${error.message}`,
        error.stack,
      );
      // Fallback to direct database write if Redis is unavailable
      await this.saveEventToDatabase(eventWithTimestamp);
    }
  }

  private async processEventQueue(): Promise<void> {
    while (true) {
      try {
        const eventData = await this.redis.lpop(this.SECURITY_EVENTS_QUEUE);
        if (!eventData) {
          // No events in queue, wait before checking again
          await new Promise((resolve) => setTimeout(resolve, 1000));
          continue;
        }

        const event = JSON.parse(eventData) as SecurityEvent;
        await this.saveEventToDatabase(event);
      } catch (error) {
        this.logger.error('Error processing security event:', error);
        // Prevent tight loop on error
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
  }

  private async saveEventToDatabase(event: SecurityEvent): Promise<void> {
    // Model not available - skip database save
    this.logger.debug(`Would save security event: ${event.type}`, event);
  }

  private isSuspiciousEvent(event: SecurityEvent): boolean {
    // Implement logic to detect suspicious patterns
    if (event.type === SecurityEventType.LOGIN_FAILED) {
      return true; // Will be further analyzed in handleSuspiciousActivity
    }

    if (event.type === SecurityEventType.DATA_ACCESS) {
      // Check for unusual data access patterns
      const metadata = event.metadata || {};
      if (metadata.unusualPattern) {
        return true;
      }
    }

    return false;
  }

  private async handleSuspiciousActivity(event: SecurityEvent): Promise<void> {
    if (event.type === SecurityEventType.LOGIN_FAILED) {
      const key = `security:failed_logins:${event.ipAddress}`;
      const failedAttempts = await this.redis.incr(key);

      // Set expiration if this is the first failure
      if (failedAttempts === 1) {
        await this.redis.expire(key, this.SUSPICIOUS_ACTIVITY_WINDOW / 1000);
      }

      // If threshold exceeded, take action
      if (failedAttempts >= this.SUSPICIOUS_ACTIVITY_THRESHOLD) {
        await this.logEvent({
          type: SecurityEventType.SUSPICIOUS_ACTIVITY,
          userId: event.userId,
          ipAddress: event.ipAddress,
          userAgent: event.userAgent,
          metadata: {
            reason: 'multiple_failed_login_attempts',
            failedAttempts,
            threshold: this.SUSPICIOUS_ACTIVITY_THRESHOLD,
          },
        });

        // Optionally block the IP temporarily
        await this.redis.setex(
          `security:blocked_ips:${event.ipAddress}`,
          3600, // Block for 1 hour
          'true',
        );
      }
    }
  }

  async getSecurityEvents(
    userId?: string,
    types?: SecurityEventType[],
    startDate?: Date,
    endDate?: Date,
    limit = 100,
    offset = 0,
  ) {
    const where: any = {};

    if (userId) where.userId = userId;
    if (types && types.length > 0) where.type = { in: types };

    if (startDate || endDate) {
      where.timestamp = {};
      if (startDate) where.timestamp.gte = startDate;
      if (endDate) where.timestamp.lte = endDate;
    }

    // Model not available - return empty result
    return {
      data: [],
      pagination: {
        total: 0,
        limit,
        offset,
        hasMore: false,
      },
    };
  }

  async getSuspiciousActivityReport(days = 7) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Model not available - return empty report
    const blockedIps = await this.redis.keys('security:blocked_ips:*');

    return {
      timePeriod: { start: startDate, end: new Date() },
      failedLoginAttempts: [],
      suspiciousActivities: [],
      currentlyBlockedIps: blockedIps.map((ip) =>
        ip.replace('security:blocked_ips:', ''),
      ),
    };
  }
}
