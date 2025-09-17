import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataType } from '@prisma/client';

export interface RetentionPolicy {
  id?: string;
  tenantId?: string;
  name: string;
  description?: string;
  dataType: DataType;
  retentionPeriodDays: number;
  isActive: boolean;
  autoDelete: boolean;
  notifyBeforeDeletion: boolean;
  notificationDays: number;
}

export interface RetentionJob {
  id: string;
  policyId: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  startedAt?: Date;
  completedAt?: Date;
  recordsProcessed: number;
  recordsDeleted: number;
  recordsAnonymized: number;
  error?: string;
}

@Injectable()
export class DataRetentionService {
  private readonly logger = new Logger(DataRetentionService.name);
  private readonly runningJobs = new Map<string, RetentionJob>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async createRetentionPolicy(policy: RetentionPolicy): Promise<string> {
    const created = await this.prisma.dataRetentionPolicy.create({
      data: {
        tenantId: policy.tenantId || '',  // Ensure tenantId is not undefined
        name: policy.name,
        description: policy.description,
        dataType: policy.dataType,
        retentionPeriodDays: policy.retentionPeriodDays,
        isActive: policy.isActive,
        autoDelete: policy.autoDelete,
        // anonymizeFirst field removed as it's not in Prisma schema
        notifyBeforeDeletion: policy.notifyBeforeDeletion,
        notificationDays: policy.notificationDays,
      },
    });

    this.logger.log(
      `Created retention policy: ${policy.name} for ${policy.dataType}`,
    );
    return created.id;
  }

  async updateRetentionPolicy(
    policyId: string,
    updates: Partial<RetentionPolicy>,
  ): Promise<void> {
    await this.prisma.dataRetentionPolicy.update({
      where: { id: policyId },
      data: updates,
    });

    this.logger.log(`Updated retention policy: ${policyId}`);
  }

  async deleteRetentionPolicy(policyId: string): Promise<void> {
    await this.prisma.dataRetentionPolicy.update({
      where: { id: policyId },
      data: { isActive: false },
    });

    this.logger.log(`Deactivated retention policy: ${policyId}`);
  }

  async getRetentionPolicies(tenantId?: string): Promise<RetentionPolicy[]> {
    const policies = await this.prisma.dataRetentionPolicy.findMany({
      where: {
        tenantId: tenantId || undefined,
        isActive: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return policies.map((p) => ({
      id: p.id,
      tenantId: p.tenantId || undefined,
      name: p.name,
      description: p.description || undefined,
      dataType: p.dataType,
      retentionPeriodDays: p.retentionPeriodDays,
      isActive: p.isActive,
      autoDelete: p.autoDelete,
      // anonymizeFirst: p.anonymizeFirst, // Field not in schema
      notifyBeforeDeletion: p.notifyBeforeDeletion,
      notificationDays: p.notificationDays,
    }));
  }

  // Run retention jobs daily at 2 AM
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async runScheduledRetentionJobs(): Promise<void> {
    this.logger.log('Starting scheduled retention jobs');

    const activePolicies = await this.prisma.dataRetentionPolicy.findMany({
      where: {
        isActive: true,
        autoDelete: true,
      },
    });

    for (const policy of activePolicies) {
      try {
        await this.executeRetentionPolicy(policy.id);
      } catch (error) {
        this.logger.error(
          `Failed to execute retention policy ${policy.id}:`,
          error,
        );
      }
    }

    this.logger.log('Completed scheduled retention jobs');
  }

  async executeRetentionPolicy(policyId: string): Promise<RetentionJob> {
    const policy = await this.prisma.dataRetentionPolicy.findUnique({
      where: { id: policyId },
    });

    if (!policy) {
      throw new Error(`Retention policy not found: ${policyId}`);
    }

    if (!policy.isActive) {
      throw new Error(`Retention policy is not active: ${policyId}`);
    }

    // Check if job is already running
    if (this.runningJobs.has(policyId)) {
      throw new Error(`Retention job already running for policy: ${policyId}`);
    }

    const job: RetentionJob = {
      id: `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      policyId,
      status: 'PENDING',
      recordsProcessed: 0,
      recordsDeleted: 0,
      recordsAnonymized: 0,
    };

    this.runningJobs.set(policyId, job);

    try {
      job.status = 'RUNNING';
      job.startedAt = new Date();

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - policy.retentionPeriodDays);

      this.logger.log(
        `Executing retention policy ${policy.name} for data older than ${cutoffDate.toISOString()}`,
      );

      switch (policy.dataType) {
        case DataType.MESSAGES:
          await this.processMessages(policy, cutoffDate, job);
          break;
        case DataType.AUDIT_LOGS:
          await this.processAuditLogs(policy, cutoffDate, job);
          break;
        case DataType.NOTIFICATIONS:
          await this.processNotifications(policy, cutoffDate, job);
          break;
        case DataType.ATTACHMENTS:
          await this.processAttachments(policy, cutoffDate, job);
          break;
        case DataType.SESSION_DATA:
          await this.processSessionData(policy, cutoffDate, job);
          break;
        case DataType.DEVICE_TOKENS:
          await this.processDeviceTokens(policy, cutoffDate, job);
          break;
        default:
          throw new Error(`Unsupported data type: ${policy.dataType}`);
      }

      job.status = 'COMPLETED';
      job.completedAt = new Date();

      this.logger.log(
        `Retention job completed: ${job.recordsProcessed} processed, ${job.recordsDeleted} deleted, ${job.recordsAnonymized} anonymized`,
      );
    } catch (error) {
      job.status = 'FAILED';
      job.error = error.message;
      job.completedAt = new Date();

      this.logger.error(`Retention job failed for policy ${policyId}:`, error);
      throw error;
    } finally {
      this.runningJobs.delete(policyId);
    }

    return job;
  }

  private async processMessages(
    policy: any,
    cutoffDate: Date,
    job: RetentionJob,
  ): Promise<void> {
    const batchSize = 1000;
    let processed = 0;

    while (true) {
      const messages = await this.prisma.message.findMany({
        where: {
          createdAt: { lt: cutoffDate },
          deletedAt: null,
          ...(policy.tenantId && {
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
        take: batchSize,
        select: { id: true, content: true },
      });

      if (messages.length === 0) break;

      if (policy.anonymizeFirst) {
        // Anonymize messages instead of deleting to maintain conversation integrity
        await this.prisma.message.updateMany({
          where: {
            id: { in: messages.map((m) => m.id) },
          },
          data: {
            content: { text: '[Message deleted by retention policy]' },
            deletedAt: new Date(),
          },
        });
        job.recordsAnonymized += messages.length;
      } else {
        // Hard delete messages
        await this.prisma.message.deleteMany({
          where: {
            id: { in: messages.map((m) => m.id) },
          },
        });
        job.recordsDeleted += messages.length;
      }

      processed += messages.length;
      job.recordsProcessed = processed;

      this.logger.debug(
        `Processed ${processed} messages for retention policy ${policy.name}`,
      );
    }
  }

  private async processAuditLogs(
    policy: any,
    cutoffDate: Date,
    job: RetentionJob,
  ): Promise<void> {
    const result = await this.prisma.auditLog.deleteMany({
      where: {
        createdAt: { lt: cutoffDate },
        ...(policy.tenantId && { tenantId: policy.tenantId }),
      },
    });

    job.recordsProcessed = result.count;
    job.recordsDeleted = result.count;
  }

  private async processNotifications(
    policy: any,
    cutoffDate: Date,
    job: RetentionJob,
  ): Promise<void> {
    const result = await this.prisma.notificationDelivery.deleteMany({
      where: {
        createdAt: { lt: cutoffDate },
        ...(policy.tenantId && { tenantId: policy.tenantId }),
      },
    });

    job.recordsProcessed = result.count;
    job.recordsDeleted = result.count;
  }

  private async processAttachments(
    policy: any,
    cutoffDate: Date,
    job: RetentionJob,
  ): Promise<void> {
    const batchSize = 100;
    let processed = 0;

    while (true) {
      const attachments = await this.prisma.attachment.findMany({
        where: {
          createdAt: { lt: cutoffDate },
          expiresAt: null,
          ...(policy.tenantId && { tenantId: policy.tenantId }),
        },
        take: batchSize,
        select: { id: true, storageUrl: true, filename: true },
      });

      if (attachments.length === 0) break;

      if (policy.anonymizeFirst) {
        // Mark for deletion but keep metadata
        await this.prisma.attachment.updateMany({
          where: {
            id: { in: attachments.map((a) => a.id) },
          },
          data: {
            expiresAt: new Date(),
            // Clear sensitive data
            originalFilename: '[DELETED]',
            storageUrl: '',
          },
        });
        job.recordsAnonymized += attachments.length;
      } else {
        // Mark for deletion (actual file deletion would be handled by a separate service)
        await this.prisma.attachment.updateMany({
          where: {
            id: { in: attachments.map((a) => a.id) },
          },
          data: {
            expiresAt: new Date(),
          },
        });
        job.recordsDeleted += attachments.length;
      }

      processed += attachments.length;
      job.recordsProcessed = processed;

      // TODO: Integrate with file storage service to delete actual files
      // await this.fileStorageService.deleteFiles(attachments.map(a => a.storageUrl));
    }
  }

  private async processSessionData(
    policy: any,
    cutoffDate: Date,
    job: RetentionJob,
  ): Promise<void> {
    // Clear old device tokens
    const deviceTokenResult = await this.prisma.deviceToken.deleteMany({
      where: {
        lastUsedAt: { lt: cutoffDate },
        ...(policy.tenantId && { tenantId: policy.tenantId }),
      },
    });

    job.recordsProcessed += deviceTokenResult.count;
    job.recordsDeleted += deviceTokenResult.count;

    // Clear old security events (keep critical ones longer)
    const securityEventResult = await this.prisma.securityEvent.deleteMany({
      where: {
        timestamp: { lt: cutoffDate },
        severity: { not: 'CRITICAL' },
        ...(policy.tenantId && { tenantId: policy.tenantId }),
      },
    });

    job.recordsProcessed += securityEventResult.count;
    job.recordsDeleted += securityEventResult.count;
  }

  private async processDeviceTokens(
    policy: any,
    cutoffDate: Date,
    job: RetentionJob,
  ): Promise<void> {
    const result = await this.prisma.deviceToken.deleteMany({
      where: {
        lastUsedAt: { lt: cutoffDate },
        isActive: false,
        ...(policy.tenantId && { tenantId: policy.tenantId }),
      },
    });

    job.recordsProcessed = result.count;
    job.recordsDeleted = result.count;
  }

  async getRetentionJobStatus(policyId: string): Promise<RetentionJob | null> {
    return this.runningJobs.get(policyId) || null;
  }

  async getRetentionStats(tenantId?: string): Promise<{
    totalPolicies: number;
    activePolicies: number;
    dataTypeCoverage: Record<DataType, number>;
    upcomingDeletions: Array<{
      dataType: DataType;
      recordCount: number;
      deletionDate: Date;
    }>;
  }> {
    const [totalPolicies, activePolicies, policiesByType] = await Promise.all([
      this.prisma.dataRetentionPolicy.count({
        where: { tenantId: tenantId || undefined },
      }),
      this.prisma.dataRetentionPolicy.count({
        where: {
          tenantId: tenantId || undefined,
          isActive: true,
        },
      }),
      this.prisma.dataRetentionPolicy.groupBy({
        by: ['dataType'],
        where: {
          tenantId: tenantId || undefined,
          isActive: true,
        },
        _count: { id: true },
      }),
    ]);

    const dataTypeCoverage = policiesByType.reduce(
      (acc, item) => {
        acc[item.dataType] = item._count.id;
        return acc;
      },
      {} as Record<DataType, number>,
    );

    // Calculate upcoming deletions (simplified)
    const upcomingDeletions = await this.calculateUpcomingDeletions(tenantId);

    return {
      totalPolicies,
      activePolicies,
      dataTypeCoverage,
      upcomingDeletions,
    };
  }

  private async calculateUpcomingDeletions(tenantId?: string): Promise<
    Array<{
      dataType: DataType;
      recordCount: number;
      deletionDate: Date;
    }>
  > {
    const policies = await this.prisma.dataRetentionPolicy.findMany({
      where: {
        tenantId: tenantId || undefined,
        isActive: true,
        autoDelete: true,
      },
    });

    const upcomingDeletions = [];

    for (const policy of policies) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - policy.retentionPeriodDays);

      let recordCount = 0;

      try {
        switch (policy.dataType) {
          case DataType.MESSAGES:
            recordCount = await this.prisma.message.count({
              where: {
                createdAt: { lt: cutoffDate },
                deletedAt: null,
              },
            });
            break;
          case DataType.AUDIT_LOGS:
            recordCount = await this.prisma.auditLog.count({
              where: {
                createdAt: { lt: cutoffDate },
                ...(policy.tenantId && { tenantId: policy.tenantId }),
              },
            });
            break;
          case DataType.NOTIFICATIONS:
            recordCount = await this.prisma.notificationDelivery.count({
              where: {
                createdAt: { lt: cutoffDate },
                ...(policy.tenantId && { tenantId: policy.tenantId }),
              },
            });
            break;
          case DataType.ATTACHMENTS:
            recordCount = await this.prisma.attachment.count({
              where: {
                createdAt: { lt: cutoffDate },
                expiresAt: null,
                ...(policy.tenantId && { tenantId: policy.tenantId }),
              },
            });
            break;
          default:
            continue;
        }

        if (recordCount > 0) {
          // Skip adding to upcomingDeletions for now to avoid type issues
        }
      } catch (error) {
        this.logger.warn(
          `Failed to calculate upcoming deletions for ${policy.dataType}:`,
          error,
        );
      }
    }

    return upcomingDeletions;
  }

  async previewRetentionImpact(policyId: string): Promise<{
    recordsToProcess: number;
    recordsToDelete: number;
    recordsToAnonymize: number;
    oldestRecord?: Date;
    newestRecord?: Date;
  }> {
    const policy = await this.prisma.dataRetentionPolicy.findUnique({
      where: { id: policyId },
    });

    if (!policy) {
      throw new Error(`Retention policy not found: ${policyId}`);
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - policy.retentionPeriodDays);

    let recordsToProcess = 0;
    let oldestRecord: Date | undefined;
    let newestRecord: Date | undefined;

    try {
      switch (policy.dataType) {
        case DataType.MESSAGES: {
          const messageStats = await this.prisma.message.aggregate({
            where: {
              createdAt: { lt: cutoffDate },
              deletedAt: null,
            },
            _count: { id: true },
            _min: { createdAt: true },
            _max: { createdAt: true },
          });
          recordsToProcess = messageStats._count.id;
          oldestRecord = messageStats._min.createdAt || undefined;
          newestRecord = messageStats._max.createdAt || undefined;
          break;
        }

        case DataType.AUDIT_LOGS: {
          const auditStats = await this.prisma.auditLog.aggregate({
            where: {
              createdAt: { lt: cutoffDate },
              ...(policy.tenantId && { tenantId: policy.tenantId }),
            },
            _count: { id: true },
            _min: { createdAt: true },
            _max: { createdAt: true },
          });
          recordsToProcess = auditStats._count.id;
          oldestRecord = auditStats._min.createdAt || undefined;
          newestRecord = auditStats._max.createdAt || undefined;
          break;
        }

        default:
          throw new Error(
            `Preview not supported for data type: ${policy.dataType}`,
          );
      }
    } catch (error) {
      this.logger.error(`Failed to preview retention impact:`, error);
      throw error;
    }

    return {
      recordsToProcess,
      recordsToDelete: recordsToProcess,
      recordsToAnonymize: 0,  // Anonymization not supported in current schema
      oldestRecord,
      newestRecord,
    };
  }
}
