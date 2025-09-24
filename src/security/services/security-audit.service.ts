import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../shared/infrastructure/prisma/prisma.service';
import { RedisService } from '../../shared/redis/redis.service';
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
    try {
      await this.prisma.securityEvent.create({
        data: {
          tenantId: event.metadata?.tenantId || '',
          eventType: this.mapEventTypeToEnum(event.type),
          severity: this.mapSeverityToEnum(event.type),
          source: 'security_audit_service',
          userId: event.userId,
          ipAddress: event.ipAddress || 'unknown',
          userAgent: event.userAgent,
          details: {
            originalType: event.type,
            metadata: event.metadata,
            timestamp: event.timestamp,
          },
          tags: this.generateEventTags(event),
        },
      });
    } catch (error) {
      this.logger.error('Failed to save security event to database:', error);
      // Don't throw - we don't want to break the application flow
    }
  }

  private mapEventTypeToEnum(eventType: SecurityEventType): any {
    // Map our internal event types to the database enum
    const mapping: Record<SecurityEventType, string> = {
      [SecurityEventType.LOGIN_SUCCESS]: 'AUTHENTICATION_SUCCESS',
      [SecurityEventType.LOGIN_FAILED]: 'AUTHENTICATION_FAILURE',
      [SecurityEventType.PASSWORD_CHANGE]: 'PASSWORD_CHANGE',
      [SecurityEventType.PERMISSION_CHANGE]: 'PERMISSION_GRANTED',
      [SecurityEventType.DATA_ACCESS]: 'DATA_ACCESS',
      [SecurityEventType.DATA_MODIFICATION]: 'DATA_MODIFICATION',
      [SecurityEventType.CONFIGURATION_CHANGE]: 'POLICY_UPDATED',
      [SecurityEventType.SECURITY_ALERT]: 'ANOMALOUS_BEHAVIOR',
      [SecurityEventType.SUSPICIOUS_ACTIVITY]: 'SUSPICIOUS_LOGIN',
      [SecurityEventType.RATE_LIMIT_EXCEEDED]: 'RATE_LIMIT_EXCEEDED',
      [SecurityEventType.GEO_BLOCKED]: 'GEO_BLOCKED',
      [SecurityEventType.USER_BLOCKED]: 'POLICY_VIOLATION',
      [SecurityEventType.USER_UNBLOCKED]: 'POLICY_UPDATED',
      [SecurityEventType.API_KEY_CREATED]: 'PERMISSION_GRANTED',
      [SecurityEventType.API_KEY_REVOKED]: 'PERMISSION_REVOKED',
    };

    return mapping[eventType] || 'ANOMALOUS_BEHAVIOR';
  }

  private mapSeverityToEnum(eventType: SecurityEventType): any {
    // Map event types to severity levels
    const severityMapping: Record<SecurityEventType, string> = {
      [SecurityEventType.LOGIN_SUCCESS]: 'INFO',
      [SecurityEventType.LOGIN_FAILED]: 'MEDIUM',
      [SecurityEventType.PASSWORD_CHANGE]: 'MEDIUM',
      [SecurityEventType.PERMISSION_CHANGE]: 'HIGH',
      [SecurityEventType.DATA_ACCESS]: 'LOW',
      [SecurityEventType.DATA_MODIFICATION]: 'MEDIUM',
      [SecurityEventType.CONFIGURATION_CHANGE]: 'HIGH',
      [SecurityEventType.SECURITY_ALERT]: 'HIGH',
      [SecurityEventType.SUSPICIOUS_ACTIVITY]: 'HIGH',
      [SecurityEventType.RATE_LIMIT_EXCEEDED]: 'MEDIUM',
      [SecurityEventType.GEO_BLOCKED]: 'HIGH',
      [SecurityEventType.USER_BLOCKED]: 'HIGH',
      [SecurityEventType.USER_UNBLOCKED]: 'MEDIUM',
      [SecurityEventType.API_KEY_CREATED]: 'MEDIUM',
      [SecurityEventType.API_KEY_REVOKED]: 'HIGH',
    };

    return severityMapping[eventType] || 'MEDIUM';
  }

  private generateEventTags(event: SecurityEvent): string[] {
    const tags: string[] = [];

    // Add category tags
    if (event.type.includes('LOGIN')) tags.push('authentication');
    if (event.type.includes('DATA')) tags.push('data_access');
    if (
      event.type.includes('PERMISSION') ||
      event.type.includes('CONFIGURATION')
    ) {
      tags.push('authorization');
    }
    if (event.type.includes('SUSPICIOUS') || event.type.includes('BLOCKED')) {
      tags.push('threat_detection');
    }

    // Add context tags
    if (event.userId) tags.push('user_action');
    if (event.ipAddress) tags.push('network_event');
    if (event.metadata?.automated) tags.push('automated');

    return tags;
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
    tenantId?: string,
    limit = 100,
    offset = 0,
  ) {
    const where: any = {};

    if (userId) where.userId = userId;
    if (tenantId) where.tenantId = tenantId;

    if (types && types.length > 0) {
      where.eventType = {
        in: types.map((type) => this.mapEventTypeToEnum(type)),
      };
    }

    if (startDate || endDate) {
      where.timestamp = {};
      if (startDate) where.timestamp.gte = startDate;
      if (endDate) where.timestamp.lte = endDate;
    }

    const [events, total] = await Promise.all([
      this.prisma.securityEvent.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        take: limit,
        skip: offset,
        select: {
          id: true,
          eventType: true,
          severity: true,
          source: true,
          userId: true,
          ipAddress: true,
          userAgent: true,
          details: true,
          timestamp: true,
          resolved: true,
          resolvedAt: true,
          tags: true,
        },
      }),
      this.prisma.securityEvent.count({ where }),
    ]);

    return {
      data: events,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    };
  }

  async getSuspiciousActivityReport(days = 7, tenantId?: string) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const [failedLogins, suspiciousActivities, blockedIps, anomalies] =
      await Promise.all([
        this.prisma.securityEvent.findMany({
          where: {
            eventType: 'AUTHENTICATION_FAILURE',
            timestamp: { gte: startDate },
            ...(tenantId && { tenantId }),
          },
          select: {
            ipAddress: true,
            userId: true,
            timestamp: true,
            details: true,
          },
          orderBy: { timestamp: 'desc' },
        }),
        this.prisma.securityEvent.findMany({
          where: {
            eventType: 'ANOMALOUS_BEHAVIOR',
            timestamp: { gte: startDate },
            ...(tenantId && { tenantId }),
          },
          select: {
            id: true,
            severity: true,
            ipAddress: true,
            userId: true,
            timestamp: true,
            details: true,
            resolved: true,
          },
          orderBy: { timestamp: 'desc' },
        }),
        this.redis.keys('security:blocked_ips:*'),
        this.prisma.anomalyDetection.findMany({
          where: {
            timestamp: { gte: startDate },
            ...(tenantId && { tenantId }),
          },
          select: {
            id: true,
            anomalyType: true,
            severity: true,
            confidence: true,
            description: true,
            timestamp: true,
            investigated: true,
            falsePositive: true,
          },
          orderBy: { timestamp: 'desc' },
          take: 50,
        }),
      ]);

    // Group failed logins by IP
    const failedLoginsByIp = failedLogins.reduce(
      (acc: Record<string, { count: number; attempts: any[] }>, login: any) => {
        const ip = login.ipAddress;
        if (!acc[ip]) {
          acc[ip] = { count: 0, attempts: [] };
        }
        acc[ip].count++;
        acc[ip].attempts.push({
          userId: login.userId,
          timestamp: login.timestamp,
          details: login.details,
        });
        return acc;
      },
      {} as Record<string, { count: number; attempts: any[] }>,
    );

    return {
      timePeriod: { start: startDate, end: new Date() },
      summary: {
        totalFailedLogins: failedLogins.length,
        uniqueIpsWithFailures: Object.keys(failedLoginsByIp).length,
        suspiciousActivities: suspiciousActivities.length,
        unresolvedSuspiciousActivities: suspiciousActivities.filter(
          (a: any) => !a.resolved,
        ).length,
        anomaliesDetected: anomalies.length,
        currentlyBlockedIps: blockedIps.length,
      },
      failedLoginsByIp,
      suspiciousActivities,
      anomalies,
      currentlyBlockedIps: blockedIps.map((ip: string) =>
        ip.replace('security:blocked_ips:', ''),
      ),
    };
  }

  async resolveSecurityEvent(
    eventId: string,
    resolvedBy: string,
    resolution?: string,
  ): Promise<void> {
    await this.prisma.securityEvent.update({
      where: { id: eventId },
      data: {
        resolved: true,
        resolvedAt: new Date(),
        resolvedBy,
        details: {
          // Preserve existing details and add resolution
          ...(((
            await this.prisma.securityEvent.findUnique({
              where: { id: eventId },
              select: { details: true },
            })
          )?.details as object) || {}),
          resolution,
          resolvedBy,
          resolvedAt: new Date(),
        },
      },
    });

    this.logger.log(`Security event ${eventId} resolved by ${resolvedBy}`);
  }

  async createSecurityIncident(
    title: string,
    description: string,
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
    category: string,
    tenantId?: string,
    relatedEventIds: string[] = [],
  ): Promise<string> {
    const incident = await this.prisma.securityIncident.create({
      data: {
        tenantId: tenantId || '',
        title,
        description,
        severity: severity as any,
        status: 'OPEN' as any,
        category: category as any,
        events: relatedEventIds,
        metadata: {
          createdBy: 'security_audit_service',
          autoGenerated: true,
        },
      },
    });

    this.logger.log(`Created security incident ${incident.id}: ${title}`);

    // Emit event for incident response automation
    this.eventEmitter.emit('security.incident.created', {
      incidentId: incident.id,
      severity,
      category,
      tenantId,
    });

    return incident.id;
  }
}
