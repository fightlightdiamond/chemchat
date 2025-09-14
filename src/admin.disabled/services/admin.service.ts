import { Injectable, Logger, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../shared/infrastructure/prisma/prisma.service';
import { RedisService } from '../../shared/redis/redis.service';
import { Prisma } from '@prisma/client';
import {
  AdminRoleType,
  ModerationActionType,
  ModerationTargetType,
  BanType,
  ReportStatus,
  ReportPriority,
  ReportType,
  AutoModerationRuleType,
  RuleSeverity,
  ReviewStatus,
} from '../types/admin.enums';
import {
  CreateAdminRoleDto,
  ModerationActionDto,
  BanUserDto,
  CreateReportDto,
  UpdateReportDto,
  AdminStats,
  UserModerationHistory,
  ReportSearchFilters,
  ModerationActionSearchFilters
} from '../interfaces/admin.interface';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);
  private readonly ADMIN_CACHE_TTL = 300; // 5 minutes
  private readonly PERMISSIONS_CACHE_TTL = 600; // 10 minutes

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  // Admin Role Management
  async createAdminRole(dto: CreateAdminRoleDto, grantedBy: string): Promise<any> {
    try {
      // Verify the granter has permission to assign this role
      await this.verifyAdminPermission(grantedBy, 'admin_roles', 'create');

      const adminRole = await this.prisma.adminRole.create({
        data: {
          userId: dto.userId,
          tenantId: dto.tenantId,
          role: dto.role,
          permissions: dto.permissions,
          grantedBy,
          expiresAt: dto.expiresAt,
        },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              displayName: true,
              email: true,
            },
          },
          grantedByUser: {
            select: {
              id: true,
              username: true,
              displayName: true,
            },
          },
        },
      });

      // Clear user permissions cache
      await this.clearUserPermissionsCache(dto.userId, dto.tenantId);

      this.logger.log(`Admin role ${dto.role} granted to user ${dto.userId} by ${grantedBy}`);
      return adminRole;
    } catch (error) {
      this.logger.error(`Failed to create admin role: ${error.message}`, error.stack);
      throw error;
    }
  }

  async revokeAdminRole(userId: string, tenantId: string | null, role: AdminRoleType, revokedBy: string): Promise<void> {
    try {
      await this.verifyAdminPermission(revokedBy, 'admin_roles', 'delete');

      await this.prisma.adminRole.updateMany({
        where: {
          userId,
          tenantId,
          role,
          isActive: true,
        },
        data: {
          isActive: false,
          updatedAt: new Date(),
        },
      });

      await this.clearUserPermissionsCache(userId, tenantId || undefined);
      this.logger.log(`Admin role ${role} revoked from user ${userId} by ${revokedBy}`);
    } catch (error) {
      this.logger.error(`Failed to revoke admin role: ${error.message}`, error.stack);
      throw error;
    }
  }

  async getUserPermissions(userId: string, tenantId?: string): Promise<string[]> {
    const cacheKey = `user_permissions:${userId}:${tenantId || 'global'}`;
    
    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }

      const adminRoles = await this.prisma.adminRole.findMany({
        where: {
          userId,
          tenantId,
          isActive: true,
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: new Date() } },
          ],
        },
      });

      const permissions = new Set<string>();
      adminRoles.forEach(role => {
        role.permissions.forEach(permission => permissions.add(permission));
      });

      const permissionsArray = Array.from(permissions);
      await this.redis.setex(cacheKey, this.PERMISSIONS_CACHE_TTL, JSON.stringify(permissionsArray));

      return permissionsArray;
    } catch (error) {
      this.logger.error(`Failed to get user permissions: ${error.message}`, error.stack);
      return [];
    }
  }

  async hasPermission(userId: string, resource: string, action: string, tenantId?: string): Promise<boolean> {
    try {
      const permissions = await this.getUserPermissions(userId, tenantId);
      const requiredPermission = `${resource}:${action}`;
      const wildcardPermission = `${resource}:*`;
      const superAdminPermission = '*:*';

      return permissions.includes(requiredPermission) || 
             permissions.includes(wildcardPermission) || 
             permissions.includes(superAdminPermission);
    } catch (error) {
      this.logger.error(`Failed to check permission: ${error.message}`, error.stack);
      return false;
    }
  }

  // Moderation Actions
  async createModerationAction(dto: ModerationActionDto, moderatorId: string, tenantId?: string): Promise<any> {
    try {
      await this.verifyAdminPermission(moderatorId, 'moderation', 'create');

      const expiresAt = dto.duration 
        ? new Date(Date.now() + dto.duration * 60 * 1000)
        : null;

      const action = await this.prisma.moderationAction.create({
        data: {
          tenantId,
          moderatorId,
          targetType: dto.targetType,
          targetId: dto.targetId,
          actionType: dto.actionType,
          reason: dto.reason,
          duration: dto.duration,
          metadata: dto.metadata,
          expiresAt,
        },
        include: {
          moderator: {
            select: {
              id: true,
              username: true,
              displayName: true,
            },
          },
        },
      });

      // Apply the moderation action
      await this.applyModerationAction(action);

      this.logger.log(`Moderation action ${dto.actionType} applied to ${dto.targetType} ${dto.targetId} by ${moderatorId}`);
      return action;
    } catch (error) {
      this.logger.error(`Failed to create moderation action: ${error.message}`, error.stack);
      throw error;
    }
  }

  async banUser(dto: BanUserDto, moderatorId: string, tenantId?: string): Promise<any> {
    try {
      await this.verifyAdminPermission(moderatorId, 'users', 'ban');

      const expiresAt = dto.duration && dto.banType === BanType.TEMPORARY
        ? new Date(Date.now() + dto.duration * 60 * 1000)
        : null;

      const ban = await this.prisma.userBan.create({
        data: {
          tenantId,
          userId: dto.userId,
          bannedBy: moderatorId,
          banType: dto.banType,
          reason: dto.reason,
          duration: dto.duration,
          expiresAt,
        },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              displayName: true,
              email: true,
            },
          },
          moderator: {
            select: {
              id: true,
              username: true,
              displayName: true,
            },
          },
        },
      });

      // Disconnect user from all active sessions
      await this.disconnectBannedUser(dto.userId, tenantId);

      this.logger.log(`User ${dto.userId} banned (${dto.banType}) by ${moderatorId}: ${dto.reason}`);
      return ban;
    } catch (error) {
      this.logger.error(`Failed to ban user: ${error.message}`, error.stack);
      throw error;
    }
  }

  async unbanUser(userId: string, moderatorId: string, tenantId?: string): Promise<void> {
    try {
      await this.verifyAdminPermission(moderatorId, 'users', 'unban');

      await this.prisma.userBan.updateMany({
        where: {
          userId,
          tenantId,
          isActive: true,
        },
        data: {
          isActive: false,
          updatedAt: new Date(),
        },
      });

      this.logger.log(`User ${userId} unbanned by ${moderatorId}`);
    } catch (error) {
      this.logger.error(`Failed to unban user: ${error.message}`, error.stack);
      throw error;
    }
  }

  async isUserBanned(userId: string, tenantId?: string): Promise<boolean> {
    try {
      const activeBan = await this.prisma.userBan.findFirst({
        where: {
          userId,
          tenantId,
          isActive: true,
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: new Date() } },
          ],
        },
      });

      return !!activeBan;
    } catch (error) {
      this.logger.error(`Failed to check user ban status: ${error.message}`, error.stack);
      return false;
    }
  }

  // Content Reports
  async createReport(dto: CreateReportDto, reporterId: string, tenantId?: string): Promise<any> {
    try {
      const report = await this.prisma.contentReport.create({
        data: {
          tenantId,
          reporterId,
          targetType: dto.targetType,
          targetId: dto.targetId,
          reportType: dto.reportType,
          reason: dto.reason,
          description: dto.description,
        },
        include: {
          reporter: {
            select: {
              id: true,
              username: true,
              displayName: true,
            },
          },
        },
      });

      this.logger.log(`Content report created for ${dto.targetType} ${dto.targetId} by ${reporterId}`);
      return report;
    } catch (error) {
      this.logger.error(`Failed to create report: ${error.message}`, error.stack);
      throw error;
    }
  }

  async updateReport(reportId: string, dto: UpdateReportDto, moderatorId: string): Promise<any> {
    try {
      await this.verifyAdminPermission(moderatorId, 'reports', 'update');

      const updateData: any = { ...dto };
      if (dto.status === ReportStatus.RESOLVED) {
        updateData.resolvedAt = new Date();
      }

      const report = await this.prisma.contentReport.update({
        where: { id: reportId },
        data: updateData,
        include: {
          reporter: {
            select: {
              id: true,
              username: true,
              displayName: true,
            },
          },
          assignee: {
            select: {
              id: true,
              username: true,
              displayName: true,
            },
          },
        },
      });

      this.logger.log(`Report ${reportId} updated by ${moderatorId}`);
      return report;
    } catch (error) {
      this.logger.error(`Failed to update report: ${error.message}`, error.stack);
      throw error;
    }
  }

  // Statistics and Analytics
  async getAdminStats(tenantId?: string): Promise<AdminStats> {
    try {
      const [
        totalUsers,
        activeUsers,
        bannedUsers,
        totalReports,
        pendingReports,
        resolvedReports,
        moderationActions,
        autoModerationViolations,
      ] = await Promise.all([
        this.prisma.user.count(),
        this.prisma.user.count({
          where: {
            lastLoginAt: {
              gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
            },
          },
        }),
        this.prisma.userBan.count({
          where: {
            tenantId,
            isActive: true,
          },
        }),
        this.prisma.contentReport.count({ where: { tenantId } }),
        this.prisma.contentReport.count({
          where: {
            tenantId,
            status: ReportStatus.PENDING,
          },
        }),
        this.prisma.contentReport.count({
          where: {
            tenantId,
            status: ReportStatus.RESOLVED,
          },
        }),
        this.prisma.moderationAction.count({
          where: {
            tenantId,
            createdAt: {
              gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
            },
          },
        }),
        this.prisma.autoModerationViolation.count({
          where: {
            tenantId,
            createdAt: {
              gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
            },
          },
        }),
      ]);

      return {
        totalUsers,
        activeUsers,
        bannedUsers,
        totalReports,
        pendingReports,
        resolvedReports,
        moderationActions,
        autoModerationViolations,
      };
    } catch (error) {
      this.logger.error(`Failed to get admin stats: ${error.message}`, error.stack);
      throw error;
    }
  }

  async getUserModerationHistory(userId: string, tenantId?: string): Promise<UserModerationHistory> {
    try {
      const [warnings, mutes, kicks, bans, reports, violations, lastAction] = await Promise.all([
        this.prisma.moderationAction.count({
          where: {
            tenantId,
            targetType: ModerationTargetType.USER,
            targetId: userId,
            actionType: ModerationActionType.WARN,
          },
        }),
        this.prisma.moderationAction.count({
          where: {
            tenantId,
            targetType: ModerationTargetType.USER,
            targetId: userId,
            actionType: ModerationActionType.MUTE,
          },
        }),
        this.prisma.moderationAction.count({
          where: {
            tenantId,
            targetType: ModerationTargetType.USER,
            targetId: userId,
            actionType: ModerationActionType.KICK,
          },
        }),
        this.prisma.moderationAction.count({
          where: {
            tenantId,
            targetType: ModerationTargetType.USER,
            targetId: userId,
            actionType: ModerationActionType.BAN,
          },
        }),
        this.prisma.contentReport.count({
          where: {
            tenantId,
            targetType: ModerationTargetType.USER,
            targetId: userId,
          },
        }),
        this.prisma.autoModerationViolation.count({
          where: {
            tenantId,
            userId,
          },
        }),
        this.prisma.moderationAction.findFirst({
          where: {
            tenantId,
            targetType: ModerationTargetType.USER,
            targetId: userId,
          },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true },
        }),
      ]);

      return {
        userId,
        warnings,
        mutes,
        kicks,
        bans,
        reports,
        violations,
        lastAction: lastAction?.createdAt,
      };
    } catch (error) {
      this.logger.error(`Failed to get user moderation history: ${error.message}`, error.stack);
      throw error;
    }
  }

  // Search and Filtering
  async searchReports(filters: ReportSearchFilters, page = 1, limit = 20, tenantId?: string) {
    try {
      const where: Prisma.ContentReportWhereInput = {
        tenantId,
        ...(filters.status && { status: filters.status }),
        ...(filters.priority && { priority: filters.priority }),
        ...(filters.reportType && { reportType: filters.reportType }),
        ...(filters.targetType && { targetType: filters.targetType }),
        ...(filters.assignedTo && { assignedTo: filters.assignedTo }),
        ...(filters.reporterId && { reporterId: filters.reporterId }),
        ...(filters.dateFrom || filters.dateTo) && {
          createdAt: {
            ...(filters.dateFrom && { gte: filters.dateFrom }),
            ...(filters.dateTo && { lte: filters.dateTo }),
          },
        },
      };

      const [reports, total] = await Promise.all([
        this.prisma.contentReport.findMany({
          where,
          include: {
            reporter: {
              select: {
                id: true,
                username: true,
                displayName: true,
              },
            },
            assignee: {
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
        this.prisma.contentReport.count({ where }),
      ]);

      return {
        data: reports,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrevious: page > 1,
      };
    } catch (error) {
      this.logger.error(`Failed to search reports: ${error.message}`, error.stack);
      throw error;
    }
  }

  async searchModerationActions(filters: ModerationActionSearchFilters, page = 1, limit = 20, tenantId?: string) {
    try {
      const where: Prisma.ModerationActionWhereInput = {
        tenantId,
        ...(filters.actionType && { actionType: filters.actionType }),
        ...(filters.targetType && { targetType: filters.targetType }),
        ...(filters.moderatorId && { moderatorId: filters.moderatorId }),
        ...(filters.targetId && { targetId: filters.targetId }),
        ...(filters.isActive !== undefined && { isActive: filters.isActive }),
        ...(filters.dateFrom || filters.dateTo) && {
          createdAt: {
            ...(filters.dateFrom && { gte: filters.dateFrom }),
            ...(filters.dateTo && { lte: filters.dateTo }),
          },
        },
      };

      const [actions, total] = await Promise.all([
        this.prisma.moderationAction.findMany({
          where,
          include: {
            moderator: {
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
        this.prisma.moderationAction.count({ where }),
      ]);

      return {
        data: actions,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrevious: page > 1,
      };
    } catch (error) {
      this.logger.error(`Failed to search moderation actions: ${error.message}`, error.stack);
      throw error;
    }
  }

  // Private helper methods
  private async verifyAdminPermission(userId: string, resource: string, action: string, tenantId?: string): Promise<void> {
    const hasPermission = await this.hasPermission(userId, resource, action, tenantId);
    if (!hasPermission) {
      throw new ForbiddenException(`Insufficient permissions for ${resource}:${action}`);
    }
  }

  private async clearUserPermissionsCache(userId: string, tenantId?: string): Promise<void> {
    const cacheKey = `user_permissions:${userId}:${tenantId || 'global'}`;
    await this.redis.del(cacheKey);
  }

  private async applyModerationAction(action: any): Promise<void> {
    try {
      switch (action.actionType) {
        case ModerationActionType.DELETE:
          await this.handleDeleteAction(action);
          break;
        case ModerationActionType.MUTE:
          await this.handleMuteAction(action);
          break;
        case ModerationActionType.KICK:
          await this.handleKickAction(action);
          break;
        case ModerationActionType.QUARANTINE:
          await this.handleQuarantineAction(action);
          break;
        default:
          this.logger.log(`No specific handler for action type: ${action.actionType}`);
      }
    } catch (error) {
      this.logger.error(`Failed to apply moderation action: ${error.message}`, error.stack);
    }
  }

  private async handleDeleteAction(action: any): Promise<void> {
    if (action.targetType === ModerationTargetType.MESSAGE) {
      await this.prisma.message.update({
        where: { id: action.targetId },
        data: { deletedAt: new Date() },
      });
    }
  }

  private async handleMuteAction(action: any): Promise<void> {
    // Implementation would depend on your muting mechanism
    // This could involve setting user status, adding to muted users cache, etc.
    this.logger.log(`Mute action applied to ${action.targetType} ${action.targetId}`);
  }

  private async handleKickAction(action: any): Promise<void> {
    // Implementation would involve removing user from conversation
    if (action.targetType === ModerationTargetType.USER && action.metadata?.conversationId) {
      await this.prisma.conversationMember.delete({
        where: {
          conversationId_userId: {
            conversationId: action.metadata.conversationId,
            userId: action.targetId,
          },
        },
      });
    }
  }

  private async handleQuarantineAction(action: any): Promise<void> {
    // Implementation would involve marking content as quarantined
    this.logger.log(`Quarantine action applied to ${action.targetType} ${action.targetId}`);
  }

  private async disconnectBannedUser(userId: string, tenantId?: string): Promise<void> {
    try {
      // Publish ban event to disconnect user from all active sessions
      const banEvent = {
        type: 'user_banned',
        userId,
        tenantId,
        timestamp: new Date().toISOString(),
      };

      await this.redis.publish('moderation_events', JSON.stringify(banEvent));
    } catch (error) {
      this.logger.error(`Failed to disconnect banned user: ${error.message}`, error.stack);
    }
  }
}
