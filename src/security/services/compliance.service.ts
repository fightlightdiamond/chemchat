import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../shared/infrastructure/prisma/prisma.service';
import { RedisService } from '../../shared/redis/redis.service';
import { DataType, ConsentType } from '@prisma/client';
import { DataProtectionService } from './data-protection.service';

@Injectable()
export class ComplianceService {
  private readonly logger = new Logger(ComplianceService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly dataProtectionService: DataProtectionService,
  ) {}

  async enforceDataRetention(
    dataType: DataType,
    retentionDays: number,
    tenantId?: string,
  ) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    this.logger.log(
      `Enforcing data retention for ${dataType} with ${retentionDays} days retention`,
    );

    switch (dataType) {
      case DataType.AUDIT_LOGS:
        await this.processAuditLogs(cutoffDate, tenantId);
        break;
      case DataType.MESSAGES:
        await this.processMessages(cutoffDate, tenantId);
        break;
      case DataType.NOTIFICATIONS:
        await this.processNotifications(cutoffDate, tenantId);
        break;
      case DataType.ATTACHMENTS:
        await this.processAttachments(cutoffDate, tenantId);
        break;
      case DataType.SESSION_DATA:
        await this.processSessionData(cutoffDate, tenantId);
        break;
      default:
        this.logger.warn(`Unknown data type for retention: ${dataType}`);
    }
  }

  private async processAuditLogs(cutoffDate: Date, tenantId?: string) {
    const result = await this.prisma.auditLog.deleteMany({
      where: {
        createdAt: { lt: cutoffDate },
        ...(tenantId && { tenantId }),
      },
    });

    this.logger.log(`Deleted ${result.count} audit logs before ${cutoffDate}`);
  }

  private async processMessages(cutoffDate: Date, tenantId?: string) {
    // Anonymize old messages instead of deleting to maintain conversation integrity
    const result = await this.prisma.message.updateMany({
      where: {
        createdAt: { lt: cutoffDate },
        deletedAt: null,
        ...(tenantId && {
          conversation: {
            members: {
              some: {
                user: {
                  // Add tenant filtering if needed
                },
              },
            },
          },
        }),
      },
      data: {
        content: { text: '[Message deleted by retention policy]' },
        deletedAt: new Date(),
      },
    });

    this.logger.log(`Anonymized ${result.count} messages before ${cutoffDate}`);
  }

  private async processNotifications(cutoffDate: Date, tenantId?: string) {
    const result = await this.prisma.notificationDelivery.deleteMany({
      where: {
        createdAt: { lt: cutoffDate },
        ...(tenantId && { tenantId }),
      },
    });

    this.logger.log(
      `Deleted ${result.count} notifications before ${cutoffDate}`,
    );
  }

  private async processAttachments(cutoffDate: Date, tenantId?: string) {
    // Mark attachments for deletion (actual file deletion handled separately)
    const result = await this.prisma.attachment.updateMany({
      where: {
        createdAt: { lt: cutoffDate },
        expiresAt: null,
        ...(tenantId && { tenantId }),
      },
      data: {
        expiresAt: new Date(),
      },
    });

    this.logger.log(
      `Marked ${result.count} attachments for deletion before ${cutoffDate}`,
    );
  }

  private async processSessionData(cutoffDate: Date, tenantId?: string) {
    // Clear old device tokens and session data
    const result = await this.prisma.deviceToken.deleteMany({
      where: {
        lastUsedAt: { lt: cutoffDate },
        ...(tenantId && { tenantId }),
      },
    });

    this.logger.log(
      `Deleted ${result.count} old device tokens before ${cutoffDate}`,
    );
  }

  async processInactiveUsers(
    retentionDays: number,
    tenantId?: string,
    anonymize = true,
  ) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const users = await this.prisma.user.findMany({
      where: {
        lastLoginAt: { lt: cutoffDate },
        // Add tenant filtering if needed
      },
      select: { id: true, email: true, displayName: true },
    });

    let processed = 0;
    const errors: string[] = [];

    for (const user of users) {
      try {
        if (anonymize) {
          await this.dataProtectionService.processDataSubjectRequest({
            userId: user.id,
            tenantId,
            requestType: 'DELETION' as any, // Will be anonymized due to recent activity
            metadata: {
              reason: 'inactive_user_cleanup',
              lastLoginCutoff: cutoffDate,
            },
          });
        } else {
          await this.dataProtectionService.processDataSubjectRequest({
            userId: user.id,
            tenantId,
            requestType: 'DELETION' as any,
            metadata: {
              reason: 'inactive_user_deletion',
              lastLoginCutoff: cutoffDate,
            },
          });
        }
        processed++;
      } catch (error) {
        const errorMsg = `Failed to process inactive user ${user.id}: ${error.message}`;
        this.logger.error(errorMsg);
        errors.push(errorMsg);
      }
    }

    this.logger.log(
      `Processed ${processed} inactive users, ${errors.length} errors`,
    );
    return { processed, errors };
  }

  async exportUserData(userId: string, tenantId?: string) {
    // Use the data protection service for comprehensive export
    return await this.dataProtectionService.processDataSubjectRequest({
      userId,
      tenantId,
      requestType: 'EXPORT' as any,
      metadata: {
        reason: 'gdpr_export_request',
      },
    });
  }

  async deleteUserDataRequest(userId: string, tenantId?: string) {
    // Process deletion request through data protection service
    await this.dataProtectionService.processDataSubjectRequest({
      userId,
      tenantId,
      requestType: 'DELETION' as any,
      metadata: {
        reason: 'user_deletion_request',
      },
    });

    return { success: true, message: 'User data deletion request processed' };
  }

  async updateUserConsent(
    userId: string,
    consent: Record<ConsentType, boolean>,
    tenantId?: string,
    version: string = '1.0',
  ) {
    const updates = Object.entries(consent).map(([consentType, granted]) =>
      this.dataProtectionService.updateConsent({
        userId,
        tenantId,
        consentType: consentType as ConsentType,
        granted,
        version,
      }),
    );

    await Promise.all(updates);

    return { success: true, message: 'User consent updated' };
  }

  async generateComplianceReport(tenantId?: string) {
    const [
      totalUsers,
      activeUsers,
      dataSubjectRequests,
      consentRecords,
      retentionPolicies,
      auditLogCount,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({
        where: {
          lastLoginAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
          },
        },
      }),
      this.prisma.dataSubjectRequest.groupBy({
        by: ['requestType', 'status'],
        where: tenantId ? { tenantId } : undefined,
        _count: true,
      }),
      this.prisma.consentRecord.groupBy({
        by: ['consentType', 'granted'],
        where: tenantId ? { tenantId } : undefined,
        _count: true,
      }),
      this.prisma.dataRetentionPolicy.count({
        where: {
          tenantId: tenantId || undefined,
          isActive: true,
        },
      }),
      this.prisma.auditLog.count({
        where: {
          ...(tenantId && { tenantId }),
          createdAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
          },
        },
      }),
    ]);

    return {
      generatedAt: new Date(),
      tenantId,
      userMetrics: {
        totalUsers,
        activeUsers,
        inactiveUsers: totalUsers - activeUsers,
      },
      dataSubjectRequests: dataSubjectRequests.reduce(
        (acc, item) => {
          const key = `${item.requestType}_${item.status}`;
          acc[key] = item._count;
          return acc;
        },
        {} as Record<string, number>,
      ),
      consentMetrics: consentRecords.reduce(
        (acc, item) => {
          const key = `${item.consentType}_${item.granted ? 'granted' : 'revoked'}`;
          acc[key] = item._count;
          return acc;
        },
        {} as Record<string, number>,
      ),
      retentionPolicies: {
        active: retentionPolicies,
      },
      auditActivity: {
        last30Days: auditLogCount,
      },
      complianceScore: this.calculateComplianceScore({
        hasRetentionPolicies: retentionPolicies > 0,
        hasConsentManagement: consentRecords.length > 0,
        hasAuditLogging: auditLogCount > 0,
        processesDataRequests: dataSubjectRequests.length > 0,
      }),
    };
  }

  private calculateComplianceScore(metrics: {
    hasRetentionPolicies: boolean;
    hasConsentManagement: boolean;
    hasAuditLogging: boolean;
    processesDataRequests: boolean;
  }): number {
    let score = 0;
    const maxScore = 100;

    if (metrics.hasRetentionPolicies) score += 25;
    if (metrics.hasConsentManagement) score += 25;
    if (metrics.hasAuditLogging) score += 25;
    if (metrics.processesDataRequests) score += 25;

    return Math.round((score / maxScore) * 100);
  }
}
