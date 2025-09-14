import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../shared/infrastructure/prisma/prisma.service';
import { RedisService } from '../../shared/redis/redis.service';
import { Prisma } from '@prisma/client';

export interface AuditLogEntry {
  tenantId?: string;
  actorId?: string;
  action: string;
  targetType: string;
  targetId: string;
  metadata?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
}

export interface AuditLogSearchFilters {
  actorId?: string;
  action?: string;
  targetType?: string;
  targetId?: string;
  tenantId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  ipAddress?: string;
}

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);
  private readonly BATCH_SIZE = 100;
  private readonly BATCH_INTERVAL = 5000; // 5 seconds
  private auditQueue: AuditLogEntry[] = [];
  private batchTimer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {
    this.startBatchProcessor();
  }

  // Core audit logging methods
  async log(entry: AuditLogEntry): Promise<void> {
    try {
      // Add to batch queue for performance
      this.auditQueue.push({
        ...entry,
        metadata: entry.metadata ? JSON.parse(JSON.stringify(entry.metadata)) : undefined,
      });

      // Process immediately if queue is full
      if (this.auditQueue.length >= this.BATCH_SIZE) {
        await this.processBatch();
      }
    } catch (error) {
      this.logger.error(`Failed to queue audit log entry: ${error.message}`, error.stack);
    }
  }

  // Convenience methods for common audit actions
  async logUserAction(
    actorId: string,
    action: string,
    targetType: string,
    targetId: string,
    metadata?: Record<string, any>,
    tenantId?: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<void> {
    await this.log({
      tenantId,
      actorId,
      action,
      targetType,
      targetId,
      metadata,
      ipAddress,
      userAgent,
    });
  }

  async logModerationAction(
    moderatorId: string,
    action: string,
    targetType: string,
    targetId: string,
    reason: string,
    metadata?: Record<string, any>,
    tenantId?: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<void> {
    await this.log({
      tenantId,
      actorId: moderatorId,
      action: `moderation.${action}`,
      targetType,
      targetId,
      metadata: {
        reason,
        ...metadata,
      },
      ipAddress,
      userAgent,
    });
  }

  async logAdminAction(
    adminId: string,
    action: string,
    targetType: string,
    targetId: string,
    metadata?: Record<string, any>,
    tenantId?: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<void> {
    await this.log({
      tenantId,
      actorId: adminId,
      action: `admin.${action}`,
      targetType,
      targetId,
      metadata,
      ipAddress,
      userAgent,
    });
  }

  async logSystemAction(
    action: string,
    targetType: string,
    targetId: string,
    metadata?: Record<string, any>,
    tenantId?: string,
  ): Promise<void> {
    await this.log({
      tenantId,
      action: `system.${action}`,
      targetType,
      targetId,
      metadata,
    });
  }

  async logSecurityEvent(
    action: string,
    targetType: string,
    targetId: string,
    metadata?: Record<string, any>,
    tenantId?: string,
    actorId?: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<void> {
    await this.log({
      tenantId,
      actorId,
      action: `security.${action}`,
      targetType,
      targetId,
      metadata,
      ipAddress,
      userAgent,
    });
  }

  // Search and retrieval methods
  async searchAuditLogs(
    filters: AuditLogSearchFilters,
    page = 1,
    limit = 50,
  ) {
    try {
      const where: Prisma.AuditLogWhereInput = {
        ...(filters.tenantId && { tenantId: filters.tenantId }),
        ...(filters.actorId && { actorId: filters.actorId }),
        ...(filters.action && { 
          action: { 
            contains: filters.action, 
            mode: 'insensitive' 
          } 
        }),
        ...(filters.targetType && { targetType: filters.targetType }),
        ...(filters.targetId && { targetId: filters.targetId }),
        ...(filters.ipAddress && { ipAddress: filters.ipAddress }),
        ...(filters.dateFrom || filters.dateTo) && {
          createdAt: {
            ...(filters.dateFrom && { gte: filters.dateFrom }),
            ...(filters.dateTo && { lte: filters.dateTo }),
          },
        },
      };

      const [logs, total] = await Promise.all([
        this.prisma.auditLog.findMany({
          where,
          include: {
            actor: {
              select: {
                id: true,
                username: true,
                displayName: true,
                email: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        this.prisma.auditLog.count({ where }),
      ]);

      return {
        data: logs,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrevious: page > 1,
      };
    } catch (error) {
      this.logger.error(`Failed to search audit logs: ${error.message}`, error.stack);
      throw error;
    }
  }

  async getAuditLogById(id: string) {
    try {
      return await this.prisma.auditLog.findUnique({
        where: { id },
        include: {
          actor: {
            select: {
              id: true,
              username: true,
              displayName: true,
              email: true,
            },
          },
        },
      });
    } catch (error) {
      this.logger.error(`Failed to get audit log: ${error.message}`, error.stack);
      throw error;
    }
  }

  async getUserAuditHistory(
    userId: string,
    page = 1,
    limit = 50,
    tenantId?: string,
  ) {
    try {
      const where: Prisma.AuditLogWhereInput = {
        actorId: userId,
        ...(tenantId && { tenantId }),
      };

      const [logs, total] = await Promise.all([
        this.prisma.auditLog.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        this.prisma.auditLog.count({ where }),
      ]);

      return {
        data: logs,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrevious: page > 1,
      };
    } catch (error) {
      this.logger.error(`Failed to get user audit history: ${error.message}`, error.stack);
      throw error;
    }
  }

  async getTargetAuditHistory(
    targetType: string,
    targetId: string,
    page = 1,
    limit = 50,
    tenantId?: string,
  ) {
    try {
      const where: Prisma.AuditLogWhereInput = {
        targetType,
        targetId,
        ...(tenantId && { tenantId }),
      };

      const [logs, total] = await Promise.all([
        this.prisma.auditLog.findMany({
          where,
          include: {
            actor: {
              select: {
                id: true,
                username: true,
                displayName: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        this.prisma.auditLog.count({ where }),
      ]);

      return {
        data: logs,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrevious: page > 1,
      };
    } catch (error) {
      this.logger.error(`Failed to get target audit history: ${error.message}`, error.stack);
      throw error;
    }
  }

  // Analytics and reporting methods
  async getAuditStats(tenantId?: string, dateFrom?: Date, dateTo?: Date) {
    try {
      const where: Prisma.AuditLogWhereInput = {
        ...(tenantId && { tenantId }),
        ...(dateFrom || dateTo) && {
          createdAt: {
            ...(dateFrom && { gte: dateFrom }),
            ...(dateTo && { lte: dateTo }),
          },
        },
      };

      const [
        totalLogs,
        uniqueActors,
        topActions,
        topTargetTypes,
        securityEvents,
        moderationEvents,
        adminEvents,
      ] = await Promise.all([
        this.prisma.auditLog.count({ where }),
        this.prisma.auditLog.findMany({
          where: {
            ...where,
            actorId: { not: null },
          },
          select: { actorId: true },
          distinct: ['actorId'],
        }),
        this.prisma.auditLog.groupBy({
          by: ['action'],
          where,
          _count: { action: true },
          orderBy: { _count: { action: 'desc' } },
          take: 10,
        }),
        this.prisma.auditLog.groupBy({
          by: ['targetType'],
          where,
          _count: { targetType: true },
          orderBy: { _count: { targetType: 'desc' } },
          take: 10,
        }),
        this.prisma.auditLog.count({
          where: {
            ...where,
            action: { startsWith: 'security.' },
          },
        }),
        this.prisma.auditLog.count({
          where: {
            ...where,
            action: { startsWith: 'moderation.' },
          },
        }),
        this.prisma.auditLog.count({
          where: {
            ...where,
            action: { startsWith: 'admin.' },
          },
        }),
      ]);

      return {
        totalLogs,
        uniqueActors: uniqueActors.length,
        topActions: topActions.map(item => ({
          action: item.action,
          count: item._count.action,
        })),
        topTargetTypes: topTargetTypes.map(item => ({
          targetType: item.targetType,
          count: item._count.targetType,
        })),
        eventCounts: {
          security: securityEvents,
          moderation: moderationEvents,
          admin: adminEvents,
        },
      };
    } catch (error) {
      this.logger.error(`Failed to get audit stats: ${error.message}`, error.stack);
      throw error;
    }
  }

  async getActivityTimeline(
    targetType?: string,
    targetId?: string,
    tenantId?: string,
    hours = 24,
  ) {
    try {
      const dateFrom = new Date(Date.now() - hours * 60 * 60 * 1000);
      
      const where: Prisma.AuditLogWhereInput = {
        createdAt: { gte: dateFrom },
        ...(tenantId && { tenantId }),
        ...(targetType && { targetType }),
        ...(targetId && { targetId }),
      };

      const logs = await this.prisma.auditLog.findMany({
        where,
        include: {
          actor: {
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

      return logs;
    } catch (error) {
      this.logger.error(`Failed to get activity timeline: ${error.message}`, error.stack);
      throw error;
    }
  }

  // Cleanup and maintenance
  async cleanupOldLogs(retentionDays = 90): Promise<number> {
    try {
      const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
      
      const result = await this.prisma.auditLog.deleteMany({
        where: {
          createdAt: { lt: cutoffDate },
        },
      });

      this.logger.log(`Cleaned up ${result.count} audit logs older than ${retentionDays} days`);
      return result.count;
    } catch (error) {
      this.logger.error(`Failed to cleanup old logs: ${error.message}`, error.stack);
      throw error;
    }
  }

  // Private batch processing methods
  private startBatchProcessor(): void {
    this.batchTimer = setInterval(async () => {
      if (this.auditQueue.length > 0) {
        await this.processBatch();
      }
    }, this.BATCH_INTERVAL);
  }

  private async processBatch(): Promise<void> {
    if (this.auditQueue.length === 0) return;

    const batch = this.auditQueue.splice(0, this.BATCH_SIZE);
    
    try {
      await this.prisma.auditLog.createMany({
        data: batch.map(entry => ({
          tenantId: entry.tenantId,
          actorId: entry.actorId,
          action: entry.action,
          targetType: entry.targetType,
          targetId: entry.targetId,
          metadata: entry.metadata,
          ipAddress: entry.ipAddress,
          userAgent: entry.userAgent,
        })),
        skipDuplicates: true,
      });

      this.logger.debug(`Processed batch of ${batch.length} audit log entries`);
    } catch (error) {
      this.logger.error(`Failed to process audit log batch: ${error.message}`, error.stack);
      
      // Re-queue failed entries for retry
      this.auditQueue.unshift(...batch);
    }
  }

  // Graceful shutdown
  async onModuleDestroy(): Promise<void> {
    if (this.batchTimer) {
      clearInterval(this.batchTimer);
    }
    
    // Process remaining queue items
    if (this.auditQueue.length > 0) {
      await this.processBatch();
    }
  }
}
