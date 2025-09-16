import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { DataType } from '@prisma/client';
import { ComplianceService } from './compliance.service';

@Injectable()
export class DataRetentionService {
  private readonly logger = new Logger(DataRetentionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly complianceService: ComplianceService,
  ) {}

  // Run daily at 2 AM
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async runDailyRetentionCleanup(): Promise<void> {
    this.logger.log('Starting daily data retention cleanup');

    try {
      const tenants = await this.prisma.tenant.findMany({
        where: { isActive: true },
        select: { id: true, name: true },
      });

      for (const tenant of tenants) {
        await this.processTenantRetention(tenant.id);
      }

      // Process global retention policies (no tenant)
      await this.processTenantRetention(null);

      this.logger.log('Daily data retention cleanup completed');
    } catch (error) {
      this.logger.error('Failed to run daily retention cleanup:', error);
    }
  }

  // Run weekly on Sunday at 3 AM for inactive users
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async runWeeklyInactiveUserCleanup(): Promise<void> {
    this.logger.log('Starting weekly inactive user cleanup');

    try {
      const inactiveUserRetentionDays = this.config.get<number>(
        'INACTIVE_USER_RETENTION_DAYS',
        365, // 1 year default
      );

      const tenants = await this.prisma.tenant.findMany({
        where: { isActive: true },
        select: { id: true, name: true },
      });

      for (const tenant of tenants) {
        const result = await this.complianceService.processInactiveUsers(
          inactiveUserRetentionDays,
          tenant.id,
          true, // Anonymize instead of delete
        );

        this.logger.log(
          `Processed ${result.processed} inactive users for tenant ${tenant.name}`,
        );

        if (result.errors.length > 0) {
          this.logger.warn(
            `Errors processing inactive users for tenant ${tenant.name}:`,
            result.errors,
          );
        }
      }

      this.logger.log('Weekly inactive user cleanup completed');
    } catch (error) {
      this.logger.error('Failed to run weekly inactive user cleanup:', error);
    }
  }

  private async processTenantRetention(tenantId: string | null): Promise<void> {
    const policies = await this.prisma.dataRetentionPolicy.findMany({
      where: {
        tenantId: tenantId || undefined,
        isActive: true,
      },
    });

    for (const policy of policies) {
      try {
        await this.complianceService.enforceDataRetention(
          policy.dataType,
          policy.retentionPeriodDays,
          tenantId || undefined,
        );

        this.logger.log(
          `Applied retention policy ${policy.name} for ${policy.dataType}`,
        );
      } catch (error) {
        this.logger.error(
          `Failed to apply retention policy ${policy.name}:`,
          error,
        );
      }
    }
  }

  async createDefaultRetentionPolicies(tenantId?: string): Promise<void> {
    const defaultPolicies = [
      {
        name: 'Audit Logs Retention',
        dataType: DataType.AUDIT_LOGS,
        retentionPeriodDays: 2555, // 7 years for compliance
        autoDelete: true,
        anonymizeFirst: false,
      },
      {
        name: 'Message Retention',
        dataType: DataType.MESSAGES,
        retentionPeriodDays: 1095, // 3 years
        autoDelete: false,
        anonymizeFirst: true,
      },
      {
        name: 'Notification Retention',
        dataType: DataType.NOTIFICATIONS,
        retentionPeriodDays: 90, // 3 months
        autoDelete: true,
        anonymizeFirst: true,
      },
      {
        name: 'Attachment Retention',
        dataType: DataType.ATTACHMENTS,
        retentionPeriodDays: 1095, // 3 years
        autoDelete: false,
        anonymizeFirst: true,
      },
      {
        name: 'Session Data Retention',
        dataType: DataType.SESSION_DATA,
        retentionPeriodDays: 30, // 1 month
        autoDelete: true,
        anonymizeFirst: false,
      },
    ];

    for (const policyData of defaultPolicies) {
      await this.prisma.dataRetentionPolicy.upsert({
        where: {
          tenantId_name: {
            tenantId: tenantId || '',
            name: policyData.name,
          },
        },
        create: {
          ...policyData,
          tenantId: tenantId || '',
        },
        update: {
          // Don't overwrite existing policies
        },
      });
    }

    this.logger.log(
      `Created default retention policies for tenant ${tenantId || 'global'}`,
    );
  }

  async getRetentionStatus(tenantId?: string): Promise<{
    policies: any[];
    lastRun: Date | null;
    nextRun: Date;
    stats: Record<string, number>;
  }> {
    const policies = await this.prisma.dataRetentionPolicy.findMany({
      where: {
        tenantId: tenantId || undefined,
        isActive: true,
      },
    });

    // Calculate next run time (daily at 2 AM)
    const nextRun = new Date();
    nextRun.setHours(2, 0, 0, 0);
    if (nextRun <= new Date()) {
      nextRun.setDate(nextRun.getDate() + 1);
    }

    // Get statistics for each data type
    const stats: Record<string, number> = {};

    for (const policy of policies) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - policy.retentionPeriodDays);

      let count = 0;
      switch (policy.dataType) {
        case DataType.AUDIT_LOGS:
          count = await this.prisma.auditLog.count({
            where: {
              createdAt: { lt: cutoffDate },
              ...(tenantId && { tenantId }),
            },
          });
          break;
        case DataType.MESSAGES:
          count = await this.prisma.message.count({
            where: {
              createdAt: { lt: cutoffDate },
              deletedAt: null,
            },
          });
          break;
        case DataType.NOTIFICATIONS:
          count = await this.prisma.notificationDelivery.count({
            where: {
              createdAt: { lt: cutoffDate },
              ...(tenantId && { tenantId }),
            },
          });
          break;
        case DataType.ATTACHMENTS:
          count = await this.prisma.attachment.count({
            where: {
              createdAt: { lt: cutoffDate },
              expiresAt: null,
              ...(tenantId && { tenantId }),
            },
          });
          break;
        case DataType.SESSION_DATA:
          count = await this.prisma.deviceToken.count({
            where: {
              lastUsedAt: { lt: cutoffDate },
              ...(tenantId && { tenantId }),
            },
          });
          break;
      }

      stats[policy.dataType] = count;
    }

    return {
      policies,
      lastRun: null, // Would track this in a separate table in production
      nextRun,
      stats,
    };
  }

  async manualRetentionRun(
    tenantId?: string,
    dataType?: DataType,
  ): Promise<{ processed: number; errors: string[] }> {
    this.logger.log(
      `Starting manual retention run for tenant ${tenantId || 'global'}${
        dataType ? ` and data type ${dataType}` : ''
      }`,
    );

    let processed = 0;
    const errors: string[] = [];

    const policies = await this.prisma.dataRetentionPolicy.findMany({
      where: {
        tenantId: tenantId || undefined,
        isActive: true,
        ...(dataType && { dataType }),
      },
    });

    for (const policy of policies) {
      try {
        await this.complianceService.enforceDataRetention(
          policy.dataType,
          policy.retentionPeriodDays,
          tenantId || undefined,
        );
        processed++;
      } catch (error) {
        const errorMsg = `Failed to process ${policy.dataType}: ${error.message}`;
        errors.push(errorMsg);
        this.logger.error(errorMsg);
      }
    }

    this.logger.log(
      `Manual retention run completed: ${processed} policies processed, ${errors.length} errors`,
    );

    return { processed, errors };
  }
}
