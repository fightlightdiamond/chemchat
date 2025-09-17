import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  SecurityAuditService,
  SecurityEventType,
} from './security-audit.service';

export interface SecurityAlert {
  id: string;
  type: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  title: string;
  description: string;
  source: string;
  timestamp: Date;
  metadata?: Record<string, any>;
  resolved?: boolean;
  resolvedAt?: Date;
  resolvedBy?: string;
}

export interface ThreatIntelligence {
  ipAddress: string;
  threatType: string;
  severity: string;
  confidence: number;
  source: string;
  lastSeen: Date;
  metadata?: Record<string, any>;
}

@Injectable()
export class SecurityMonitoringService {
  private readonly logger = new Logger(SecurityMonitoringService.name);
  private readonly BLOCKED_IPS_KEY = 'security:blocked_ips';
  private readonly THREAT_INTEL_KEY = 'security:threat_intel';
  private readonly RATE_LIMIT_KEY = 'security:rate_limits';

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
    private readonly eventEmitter: EventEmitter2,
    private readonly securityAudit: SecurityAuditService,
  ) {
    // Start monitoring processes
    this.startContinuousMonitoring();
  }

  private async startContinuousMonitoring(): Promise<void> {
    // Monitor for suspicious patterns every 5 minutes
    setInterval(
      () => {
        this.detectSuspiciousPatterns().catch((err) =>
          this.logger.error('Error in suspicious pattern detection:', err),
        );
      },
      5 * 60 * 1000,
    );

    // Check for blocked IPs cleanup every hour
    setInterval(
      () => {
        this.cleanupExpiredBlocks().catch((err) =>
          this.logger.error('Error in cleanup expired blocks:', err),
        );
      },
      60 * 60 * 1000,
    );

    // Update threat intelligence every 30 minutes
    setInterval(
      () => {
        this.updateThreatIntelligence().catch((err) =>
          this.logger.error('Error updating threat intelligence:', err),
        );
      },
      30 * 60 * 1000,
    );
  }

  async blockIpAddress(
    ipAddress: string,
    reason: string,
    duration: number = 3600, // 1 hour default
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'MEDIUM',
  ): Promise<void> {
    const blockKey = `${this.BLOCKED_IPS_KEY}:${ipAddress}`;
    const blockData = {
      reason,
      severity,
      blockedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + duration * 1000).toISOString(),
    };

    await this.redis.setex(blockKey, duration, JSON.stringify(blockData));

    // Log the security event
    await this.securityAudit.logEvent({
      type: SecurityEventType.GEO_BLOCKED,
      ipAddress,
      metadata: {
        reason,
        severity,
        duration,
        action: 'ip_blocked',
      },
    });

    // Create security alert
    await this.createSecurityAlert({
      type: 'IP_BLOCKED',
      severity,
      title: `IP Address Blocked: ${ipAddress}`,
      description: `IP address ${ipAddress} has been blocked. Reason: ${reason}`,
      source: 'security_monitoring',
      metadata: {
        ipAddress,
        reason,
        duration,
      },
    });

    this.logger.warn(
      `Blocked IP address ${ipAddress} for ${duration}s. Reason: ${reason}`,
    );
  }

  async unblockIpAddress(ipAddress: string, reason?: string): Promise<void> {
    const blockKey = `${this.BLOCKED_IPS_KEY}:${ipAddress}`;
    await this.redis.del(blockKey);

    await this.securityAudit.logEvent({
      type: SecurityEventType.USER_UNBLOCKED,
      ipAddress,
      metadata: {
        reason: reason || 'manual_unblock',
        action: 'ip_unblocked',
      },
    });

    this.logger.log(
      `Unblocked IP address ${ipAddress}. Reason: ${reason || 'manual'}`,
    );
  }

  async isIpBlocked(ipAddress: string): Promise<boolean> {
    const blockKey = `${this.BLOCKED_IPS_KEY}:${ipAddress}`;
    const blockData = await this.redis.get(blockKey);
    return blockData !== null;
  }

  async getBlockedIps(): Promise<Array<{ ip: string; data: any }>> {
    const keys = await this.redis.keys(`${this.BLOCKED_IPS_KEY}:*`);
    const blockedIps: Array<{ ip: string; data: any }> = [];

    for (const key of keys) {
      const ip = key.replace(`${this.BLOCKED_IPS_KEY}:`, '');
      const data = await this.redis.get(key);
      if (data) {
        try {
          blockedIps.push({ ip, data: JSON.parse(data) });
        } catch {
          this.logger.warn(`Failed to parse blocked IP data for ${ip}`);
        }
      }
    }

    return blockedIps;
  }

  async detectSuspiciousPatterns(): Promise<void> {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    try {
      // Detect multiple failed logins from same IP
      await this.detectBruteForceAttempts(oneHourAgo);

      // Detect unusual access patterns
      await this.detectUnusualAccessPatterns(oneHourAgo);

      // Detect rapid permission changes
      await this.detectRapidPermissionChanges(oneHourAgo);

      // Detect bulk data operations
      await this.detectBulkDataOperations(oneHourAgo);

      // Detect geographic anomalies
      await this.detectGeographicAnomalies(oneHourAgo);
    } catch (error) {
      this.logger.error('Error in suspicious pattern detection:', error);
    }
  }

  private async detectBruteForceAttempts(since: Date): Promise<void> {
    const failedLogins = await this.prisma.securityEvent.groupBy({
      by: ['ipAddress'],
      where: {
        eventType: 'AUTHENTICATION_FAILURE',
        timestamp: { gte: since },
      },
      _count: {
        id: true,
      },
      having: {
        id: {
          _count: {
            gte: 5, // 5 or more failed attempts
          },
        },
      },
    });

    for (const login of failedLogins) {
      if (login.ipAddress && !(await this.isIpBlocked(login.ipAddress))) {
        await this.blockIpAddress(
          login.ipAddress,
          `Brute force detected: ${login._count.id} failed login attempts`,
          3600, // Block for 1 hour
          'HIGH',
        );

        // Create anomaly detection record
        await this.prisma.anomalyDetection.create({
          data: {
            tenantId: '', // Will be updated based on context
            anomalyType: 'EXCESSIVE_API_CALLS',
            severity: 'HIGH',
            confidence: 0.9,
            description: `Brute force attack detected from IP ${login.ipAddress}`,
            evidence: {
              ipAddress: login.ipAddress,
              failedAttempts: login._count.id,
              timeWindow: '1 hour',
            },
          },
        });
      }
    }
  }

  private async detectUnusualAccessPatterns(since: Date): Promise<void> {
    // Detect users accessing data at unusual times
    const unusualAccess = await this.prisma.securityEvent.findMany({
      where: {
        eventType: 'DATA_ACCESS',
        timestamp: { gte: since },
      },
      select: {
        userId: true,
        ipAddress: true,
        timestamp: true,
        details: true,
      },
    });

    for (const access of unusualAccess) {
      const hour = access.timestamp.getHours();

      // Flag access between 11 PM and 6 AM as potentially suspicious
      if (hour >= 23 || hour <= 6) {
        await this.createAnomalyDetection({
          userId: access.userId || undefined,
          anomalyType: 'UNUSUAL_LOGIN_TIME',
          severity: 'MEDIUM',
          confidence: 0.7,
          description: `User accessed data at unusual time: ${access.timestamp.toISOString()}`,
          evidence: {
            userId: access.userId,
            ipAddress: access.ipAddress,
            accessTime: access.timestamp,
            hour,
          },
        });
      }
    }
  }

  private async detectRapidPermissionChanges(since: Date): Promise<void> {
    const permissionChanges = await this.prisma.securityEvent.groupBy({
      by: ['userId'],
      where: {
        eventType: {
          in: [
            'PERMISSION_GRANTED',
            'PERMISSION_REVOKED',
            'ROLE_ASSIGNED',
            'ROLE_REVOKED',
          ],
        },
        timestamp: { gte: since },
      },
      _count: {
        id: true,
      },
      having: {
        id: {
          _count: {
            gte: 3, // 3 or more permission changes in an hour
          },
        },
      },
    });

    for (const change of permissionChanges) {
      if (change.userId) {
        await this.createAnomalyDetection({
          userId: change.userId,
          anomalyType: 'RAPID_PERMISSION_CHANGES',
          severity: 'HIGH',
          confidence: 0.8,
          description: `Rapid permission changes detected for user ${change.userId}`,
          evidence: {
            userId: change.userId,
            changeCount: change._count.id,
            timeWindow: '1 hour',
          },
        });
      }
    }
  }

  private async detectBulkDataOperations(since: Date): Promise<void> {
    const bulkOperations = await this.prisma.securityEvent.groupBy({
      by: ['userId'],
      where: {
        eventType: {
          in: [
            'DATA_ACCESS',
            'DATA_MODIFICATION',
            'DATA_DELETION',
            'DATA_EXPORT',
          ],
        },
        timestamp: { gte: since },
      },
      _count: {
        id: true,
      },
      having: {
        id: {
          _count: {
            gte: 50, // 50 or more data operations in an hour
          },
        },
      },
    });

    for (const operation of bulkOperations) {
      if (operation.userId) {
        await this.createAnomalyDetection({
          userId: operation.userId,
          anomalyType: 'BULK_DATA_OPERATIONS',
          severity: 'HIGH',
          confidence: 0.85,
          description: `Bulk data operations detected for user ${operation.userId}`,
          evidence: {
            userId: operation.userId,
            operationCount: operation._count.id,
            timeWindow: '1 hour',
          },
        });
      }
    }
  }

  private async detectGeographicAnomalies(since: Date): Promise<void> {
    // This would require IP geolocation service integration
    // For now, we'll create a placeholder implementation
    const recentLogins = await this.prisma.securityEvent.findMany({
      where: {
        eventType: 'AUTHENTICATION_SUCCESS',
        timestamp: { gte: since },
        userId: { not: null },
      },
      select: {
        userId: true,
        ipAddress: true,
        timestamp: true,
      },
      orderBy: {
        timestamp: 'desc',
      },
    });

    // Group by user and detect rapid location changes
    const userLogins = recentLogins.reduce(
      (acc, login) => {
        if (!acc[login.userId!]) {
          acc[login.userId!] = [];
        }
        acc[login.userId!].push(login);
        return acc;
      },
      {} as Record<string, typeof recentLogins>,
    );

    for (const [userId, logins] of Object.entries(userLogins)) {
      if (logins.length > 1) {
        // Check for different IP addresses in short time span
        const uniqueIps = new Set(logins.map((l) => l.ipAddress));
        if (uniqueIps.size > 2) {
          await this.createAnomalyDetection({
            userId,
            anomalyType: 'UNUSUAL_LOCATION',
            severity: 'MEDIUM',
            confidence: 0.6,
            description: `Multiple IP addresses detected for user ${userId} in short time span`,
            evidence: {
              userId,
              ipAddresses: Array.from(uniqueIps),
              loginCount: logins.length,
              timeWindow: '1 hour',
            },
          });
        }
      }
    }
  }

  private async createAnomalyDetection(data: {
    userId?: string;
    anomalyType: string;
    severity: string;
    confidence: number;
    description: string;
    evidence: Record<string, any>;
  }): Promise<void> {
    await this.prisma.anomalyDetection.create({
      data: {
        tenantId: '', // Will be updated based on context
        userId: data.userId,
        anomalyType: data.anomalyType as any,
        severity: data.severity as any,
        confidence: data.confidence,
        description: data.description,
        evidence: data.evidence,
      },
    });

    // Create security alert for high-severity anomalies
    if (data.severity === 'HIGH' || data.severity === 'CRITICAL') {
      await this.createSecurityAlert({
        type: 'ANOMALY_DETECTED',
        severity: data.severity as any,
        title: `Security Anomaly: ${data.anomalyType}`,
        description: data.description,
        source: 'anomaly_detection',
        metadata: {
          anomalyType: data.anomalyType,
          confidence: data.confidence,
          evidence: data.evidence,
        },
      });
    }
  }

  async createSecurityAlert(
    alert: Omit<SecurityAlert, 'id' | 'timestamp'>,
  ): Promise<string> {
    const alertId = `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const alertData: SecurityAlert = {
      id: alertId,
      timestamp: new Date(),
      ...alert,
    };

    // Store alert in Redis for quick access
    await this.redis.setex(
      `security:alerts:${alertId}`,
      24 * 60 * 60, // 24 hours
      JSON.stringify(alertData),
    );

    // Add to alerts list
    await this.redis.lpush('security:alerts:list', alertId);
    // Use Redis list operations through exec wrapper
    await this.redis.exec('ltrim', 'security:alerts:list', '0', '999'); // Keep last 1000 alerts

    // Emit event for real-time notifications
    this.eventEmitter.emit('security.alert.created', alertData);

    // Log security event
    await this.securityAudit.logEvent({
      type: SecurityEventType.SECURITY_ALERT,
      metadata: {
        alertId,
        alertType: alert.type,
        severity: alert.severity,
        source: alert.source,
      },
    });

    this.logger.warn(
      `Security alert created: ${alert.title} (${alert.severity})`,
    );

    return alertId;
  }

  async getSecurityAlerts(
    limit: number = 50,
    // offset parameter removed as it's not used in current implementation
    severity?: string,
    resolved?: boolean,
  ): Promise<SecurityAlert[]> {
    const alertIds = await this.redis.exec('lrange', 'security:alerts:list', '0', String(limit - 1)) as string[];
    const alerts: SecurityAlert[] = [];

    for (const alertId of alertIds) {
      const alertData = await this.redis.get(`security:alerts:${alertId}`);
      if (alertData) {
        try {
          const alert = JSON.parse(alertData) as SecurityAlert;

          // Apply filters
          if (severity && alert.severity !== severity) continue;
          if (resolved !== undefined && alert.resolved !== resolved) continue;

          alerts.push(alert);
        } catch {
          this.logger.warn(`Failed to get alert data for ${alertId}`);
        }
      }
    }

    return alerts;
  }

  async resolveSecurityAlert(
    alertId: string,
    resolvedBy: string,
    resolution?: string,
  ): Promise<void> {
    const alertData = await this.redis.get(`security:alerts:${alertId}`);
    if (alertData) {
      try {
        const alert = JSON.parse(alertData) as SecurityAlert;
        alert.resolved = true;
        alert.resolvedAt = new Date();
        alert.resolvedBy = resolvedBy;

        if (resolution) {
          alert.metadata = { ...alert.metadata, resolution };
        }

        await this.redis.setex(
          `security:alerts:${alertId}`,
          24 * 60 * 60,
          JSON.stringify(alert),
        );

        this.logger.log(`Security alert ${alertId} resolved by ${resolvedBy}`);
      } catch (error) {
        this.logger.error(`Failed to resolve alert ${alertId}:`, error);
      }
    }
  }

  private async cleanupExpiredBlocks(): Promise<void> {
    const keys = await this.redis.keys(`${this.BLOCKED_IPS_KEY}:*`);
    let cleanedCount = 0;

    for (const key of keys) {
      const ttl = await this.redis.ttl(key);
      if (ttl <= 0) {
        await this.redis.del(key);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      this.logger.log(`Cleaned up ${cleanedCount} expired IP blocks`);
    }
  }

  private async updateThreatIntelligence(): Promise<void> {
    // This would integrate with external threat intelligence feeds
    // For now, we'll implement a basic version that analyzes our own data

    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Find IPs with multiple security events
    const suspiciousIps = await this.prisma.securityEvent.groupBy({
      by: ['ipAddress'],
      where: {
        timestamp: { gte: oneDayAgo },
        eventType: {
          in: [
            'AUTHENTICATION_FAILURE',
            'RATE_LIMIT_EXCEEDED',
            'SUSPICIOUS_LOGIN',
            'ANOMALOUS_BEHAVIOR',
          ],
        },
      },
      _count: {
        id: true,
      },
      having: {
        id: {
          _count: {
            gte: 3,
          },
        },
      },
    });

    for (const ip of suspiciousIps) {
      if (ip.ipAddress) {
        const threatData: ThreatIntelligence = {
          ipAddress: ip.ipAddress,
          threatType: 'suspicious_activity',
          severity: ip._count.id >= 10 ? 'HIGH' : 'MEDIUM',
          confidence: Math.min(ip._count.id / 10, 1.0),
          source: 'internal_analysis',
          lastSeen: now,
          metadata: {
            eventCount: ip._count.id,
            analysisDate: now,
          },
        };

        await this.redis.setex(
          `${this.THREAT_INTEL_KEY}:${ip.ipAddress}`,
          7 * 24 * 60 * 60, // 7 days
          JSON.stringify(threatData),
        );
      }
    }

    this.logger.log(
      `Updated threat intelligence for ${suspiciousIps.length} IP addresses`,
    );
  }

  async getThreatIntelligence(
    ipAddress: string,
  ): Promise<ThreatIntelligence | null> {
    const data = await this.redis.get(`${this.THREAT_INTEL_KEY}:${ipAddress}`);
    if (data) {
      try {
        return JSON.parse(data) as ThreatIntelligence;
      } catch {
        this.logger.warn(
          `Failed to parse threat intelligence for ${ipAddress}`,
        );
      }
    }
    return null;
  }

  async getSecurityMetrics(
    timeRange: 'hour' | 'day' | 'week' = 'day',
  ): Promise<{
    totalEvents: number;
    eventsByType: Record<string, number>;
    eventsBySeverity: Record<string, number>;
    blockedIps: number;
    activeAlerts: number;
    resolvedAlerts: number;
    anomaliesDetected: number;
  }> {
    const now = new Date();
    let since: Date;

    switch (timeRange) {
      case 'hour':
        since = new Date(now.getTime() - 60 * 60 * 1000);
        break;
      case 'week':
        since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      default:
        since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }

    const [
      totalEvents,
      eventsByType,
      eventsBySeverity,
      blockedIps,
      alerts,
      anomalies,
    ] = await Promise.all([
      this.prisma.securityEvent.count({
        where: { timestamp: { gte: since } },
      }),
      this.prisma.securityEvent.groupBy({
        by: ['eventType'],
        where: { timestamp: { gte: since } },
        _count: { id: true },
      }),
      this.prisma.securityEvent.groupBy({
        by: ['severity'],
        where: { timestamp: { gte: since } },
        _count: { id: true },
      }),
      this.getBlockedIps(),
      this.getSecurityAlerts(1000),
      this.prisma.anomalyDetection.count({
        where: { timestamp: { gte: since } },
      }),
    ]);

    const eventsByTypeMap = eventsByType.reduce(
      (acc, item) => {
        acc[item.eventType] = item._count.id;
        return acc;
      },
      {} as Record<string, number>,
    );

    const eventsBySeverityMap = eventsBySeverity.reduce(
      (acc, item) => {
        acc[item.severity] = item._count.id;
        return acc;
      },
      {} as Record<string, number>,
    );

    const activeAlerts = alerts.filter((a) => !a.resolved).length;
    const resolvedAlerts = alerts.filter((a) => a.resolved).length;

    return {
      totalEvents,
      eventsByType: eventsByTypeMap,
      eventsBySeverity: eventsBySeverityMap,
      blockedIps: blockedIps.length,
      activeAlerts,
      resolvedAlerts,
      anomaliesDetected: anomalies,
    };
  }
}
