import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpStatus,
  HttpCode,
  ParseIntPipe,
  ParseUUIDPipe,
  ValidationPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AdminService } from '../services/admin.service';
import { AuditLogService } from '../services/audit-log.service';
import { AutoModerationService } from '../services/auto-moderation.service';
import { AdminPermissionGuard } from '../guards/admin-permission.guard';
import { RequirePermission } from '../decorators/require-permission.decorator';
import { TenantContext } from '../../shared/decorators/tenant-context.decorator';
import {
  ReportSearchFilters,
  ModerationActionSearchFilters,
} from '../interfaces/admin.interface';
import {
  ModerationContext,
} from '../services/auto-moderation.service';
import { AuditLogSearchFilters } from '../services/audit-log.service';
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
import { IsString, IsOptional, IsEnum, IsArray, IsBoolean, IsNumber, IsObject, IsDateString } from 'class-validator';

// DTOs for request validation
class CreateAdminRoleRequestDto {
  @IsString()
  userId: string;

  @IsOptional()
  @IsString()
  tenantId?: string;

  @IsEnum(AdminRoleType)
  role: AdminRoleType;

  @IsArray()
  @IsString({ each: true })
  permissions: string[];

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

class ModerationActionRequestDto {
  @IsEnum(ModerationTargetType)
  targetType: ModerationTargetType;

  @IsString()
  targetId: string;

  @IsEnum(ModerationActionType)
  actionType: ModerationActionType;

  @IsString()
  reason: string;

  @IsOptional()
  @IsNumber()
  duration?: number;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

class BanUserRequestDto {
  @IsString()
  userId: string;

  @IsEnum(BanType)
  banType: BanType;

  @IsString()
  reason: string;

  @IsOptional()
  @IsNumber()
  duration?: number;
}

class CreateReportRequestDto {
  @IsEnum(ModerationTargetType)
  targetType: ModerationTargetType;

  @IsString()
  targetId: string;

  @IsEnum(ReportType)
  reportType: ReportType;

  @IsString()
  reason: string;

  @IsOptional()
  @IsString()
  description?: string;
}

class UpdateReportRequestDto {
  @IsOptional()
  @IsEnum(ReportStatus)
  status?: ReportStatus;

  @IsOptional()
  @IsEnum(ReportPriority)
  priority?: ReportPriority;

  @IsOptional()
  @IsString()
  assignedTo?: string;

  @IsOptional()
  @IsString()
  resolution?: string;
}

class AutoModerationRuleRequestDto {
  @IsOptional()
  @IsString()
  tenantId?: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(AutoModerationRuleType)
  ruleType: AutoModerationRuleType;

  @IsObject()
  conditions: Record<string, any>;

  @IsObject()
  actions: Record<string, any>;

  @IsEnum(RuleSeverity)
  severity: RuleSeverity;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;
}

class AnalyzeContentRequestDto {
  @IsEnum(ModerationTargetType)
  targetType: ModerationTargetType;

  @IsString()
  targetId: string;

  @IsString()
  content: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

@Controller('admin')
@UseGuards(JwtAuthGuard, AdminPermissionGuard)
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly auditLogService: AuditLogService,
    private readonly autoModerationService: AutoModerationService,
  ) {}

  // Admin Role Management
  @Post('roles')
  @RequirePermission('admin_roles', 'create')
  @HttpCode(HttpStatus.CREATED)
  async createAdminRole(
    @Body(ValidationPipe) dto: CreateAdminRoleRequestDto,
    @Request() req: any,
    @TenantContext() tenantId?: string,
  ) {
    const adminRole = await this.adminService.createAdminRole(
      {
        ...dto,
        tenantId: dto.tenantId || tenantId,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
      },
      req.user.id,
    );

    await this.auditLogService.logAdminAction(
      req.user.id,
      'role_granted',
      'user',
      dto.userId,
      { role: dto.role, permissions: dto.permissions },
      tenantId,
      req.ip,
      req.get('User-Agent'),
    );

    return adminRole;
  }

  @Delete('roles/:userId/:role')
  @RequirePermission('admin_roles', 'delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeAdminRole(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Param('role') role: AdminRoleType,
    @Request() req: any,
    @TenantContext() tenantId?: string,
  ) {
    await this.adminService.revokeAdminRole(userId, tenantId || null, role, req.user.id);

    await this.auditLogService.logAdminAction(
      req.user.id,
      'role_revoked',
      'user',
      userId,
      { role },
      tenantId,
      req.ip,
      req.get('User-Agent'),
    );
  }

  @Get('users/:userId/permissions')
  @RequirePermission('admin_roles', 'read')
  async getUserPermissions(
    @Param('userId', ParseUUIDPipe) userId: string,
    @TenantContext() tenantId?: string,
  ) {
    return await this.adminService.getUserPermissions(userId, tenantId);
  }

  // Moderation Actions
  @Post('moderation/actions')
  @RequirePermission('moderation', 'create')
  @HttpCode(HttpStatus.CREATED)
  async createModerationAction(
    @Body(ValidationPipe) dto: ModerationActionRequestDto,
    @Request() req: any,
    @TenantContext() tenantId?: string,
  ) {
    const action = await this.adminService.createModerationAction(dto, req.user.id, tenantId);

    await this.auditLogService.logModerationAction(
      req.user.id,
      dto.actionType,
      dto.targetType,
      dto.targetId,
      dto.reason,
      dto.metadata,
      tenantId,
      req.ip,
      req.get('User-Agent'),
    );

    return action;
  }

  @Post('users/ban')
  @RequirePermission('users', 'ban')
  @HttpCode(HttpStatus.CREATED)
  async banUser(
    @Body(ValidationPipe) dto: BanUserRequestDto,
    @Request() req: any,
    @TenantContext() tenantId?: string,
  ) {
    const ban = await this.adminService.banUser(dto, req.user.id, tenantId);

    await this.auditLogService.logModerationAction(
      req.user.id,
      'ban',
      'user',
      dto.userId,
      dto.reason,
      { banType: dto.banType, duration: dto.duration },
      tenantId,
      req.ip,
      req.get('User-Agent'),
    );

    return ban;
  }

  @Delete('users/:userId/ban')
  @RequirePermission('users', 'unban')
  @HttpCode(HttpStatus.NO_CONTENT)
  async unbanUser(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Request() req: any,
    @TenantContext() tenantId?: string,
  ) {
    await this.adminService.unbanUser(userId, req.user.id, tenantId);

    await this.auditLogService.logModerationAction(
      req.user.id,
      'unban',
      'user',
      userId,
      'User unbanned by admin',
      {},
      tenantId,
      req.ip,
      req.get('User-Agent'),
    );
  }

  @Get('users/:userId/ban-status')
  @RequirePermission('users', 'read')
  async getUserBanStatus(
    @Param('userId', ParseUUIDPipe) userId: string,
    @TenantContext() tenantId?: string,
  ) {
    const isBanned = await this.adminService.isUserBanned(userId, tenantId);
    return { userId, isBanned };
  }

  // Content Reports
  @Post('reports')
  @HttpCode(HttpStatus.CREATED)
  async createReport(
    @Body(ValidationPipe) dto: CreateReportRequestDto,
    @Request() req: any,
    @TenantContext() tenantId?: string,
  ) {
    const report = await this.adminService.createReport(dto, req.user.id, tenantId);

    await this.auditLogService.logUserAction(
      req.user.id,
      'report_created',
      dto.targetType,
      dto.targetId,
      { reportType: dto.reportType, reason: dto.reason },
      tenantId,
      req.ip,
      req.get('User-Agent'),
    );

    return report;
  }

  @Put('reports/:reportId')
  @RequirePermission('reports', 'update')
  async updateReport(
    @Param('reportId', ParseUUIDPipe) reportId: string,
    @Body(ValidationPipe) dto: UpdateReportRequestDto,
    @Request() req: any,
    @TenantContext() tenantId?: string,
  ) {
    const report = await this.adminService.updateReport(reportId, dto, req.user.id);

    await this.auditLogService.logModerationAction(
      req.user.id,
      'report_updated',
      'report',
      reportId,
      'Report status updated',
      dto,
      tenantId,
      req.ip,
      req.get('User-Agent'),
    );

    return report;
  }

  @Get('reports')
  @RequirePermission('reports', 'read')
  async searchReports(
    @Query('status') status?: ReportStatus,
    @Query('priority') priority?: ReportPriority,
    @Query('reportType') reportType?: ReportType,
    @Query('targetType') targetType?: ModerationTargetType,
    @Query('assignedTo') assignedTo?: string,
    @Query('reporterId') reporterId?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('page', new ParseIntPipe({ optional: true })) page = 1,
    @Query('limit', new ParseIntPipe({ optional: true })) limit = 20,
    @TenantContext() tenantId?: string,
  ) {
    const filters: ReportSearchFilters = {
      status,
      priority,
      reportType,
      targetType,
      assignedTo,
      reporterId,
      dateFrom: dateFrom ? new Date(dateFrom) : undefined,
      dateTo: dateTo ? new Date(dateTo) : undefined,
    };

    return await this.adminService.searchReports(filters, page, limit, tenantId);
  }

  @Get('moderation/actions')
  @RequirePermission('moderation', 'read')
  async searchModerationActions(
    @Query('actionType') actionType?: ModerationActionType,
    @Query('targetType') targetType?: ModerationTargetType,
    @Query('moderatorId') moderatorId?: string,
    @Query('targetId') targetId?: string,
    @Query('isActive') isActive?: boolean,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('page', new ParseIntPipe({ optional: true })) page = 1,
    @Query('limit', new ParseIntPipe({ optional: true })) limit = 20,
    @TenantContext() tenantId?: string,
  ) {
    const filters: ModerationActionSearchFilters = {
      actionType,
      targetType,
      moderatorId,
      targetId,
      isActive,
      dateFrom: dateFrom ? new Date(dateFrom) : undefined,
      dateTo: dateTo ? new Date(dateTo) : undefined,
    };

    return await this.adminService.searchModerationActions(filters, page, limit, tenantId);
  }

  // Statistics and Analytics
  @Get('stats')
  @RequirePermission('admin', 'read')
  async getAdminStats(@TenantContext() tenantId?: string) {
    return await this.adminService.getAdminStats(tenantId);
  }

  @Get('users/:userId/moderation-history')
  @RequirePermission('users', 'read')
  async getUserModerationHistory(
    @Param('userId', ParseUUIDPipe) userId: string,
    @TenantContext() tenantId?: string,
  ) {
    return await this.adminService.getUserModerationHistory(userId, tenantId);
  }

  // Auto-Moderation Rules
  @Post('auto-moderation/rules')
  @RequirePermission('auto_moderation', 'create')
  @HttpCode(HttpStatus.CREATED)
  async createAutoModerationRule(
    @Body(ValidationPipe) dto: AutoModerationRuleRequestDto,
    @Request() req: any,
    @TenantContext() tenantId?: string,
  ) {
    const rule = await this.autoModerationService.createRule(
      { ...dto, tenantId: dto.tenantId || tenantId },
      req.user.id,
    );

    await this.auditLogService.logAdminAction(
      req.user.id,
      'auto_moderation_rule_created',
      'rule',
      rule.id,
      { name: dto.name, ruleType: dto.ruleType },
      tenantId,
      req.ip,
      req.get('User-Agent'),
    );

    return rule;
  }

  @Put('auto-moderation/rules/:ruleId')
  @RequirePermission('auto_moderation', 'update')
  async updateAutoModerationRule(
    @Param('ruleId', ParseUUIDPipe) ruleId: string,
    @Body(ValidationPipe) dto: Partial<AutoModerationRuleRequestDto>,
    @Request() req: any,
    @TenantContext() tenantId?: string,
  ) {
    const rule = await this.autoModerationService.updateRule(ruleId, dto);

    await this.auditLogService.logAdminAction(
      req.user.id,
      'auto_moderation_rule_updated',
      'rule',
      ruleId,
      dto,
      tenantId,
      req.ip,
      req.get('User-Agent'),
    );

    return rule;
  }

  @Delete('auto-moderation/rules/:ruleId')
  @RequirePermission('auto_moderation', 'delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAutoModerationRule(
    @Param('ruleId', ParseUUIDPipe) ruleId: string,
    @Request() req: any,
    @TenantContext() tenantId?: string,
  ) {
    await this.autoModerationService.deleteRule(ruleId);

    await this.auditLogService.logAdminAction(
      req.user.id,
      'auto_moderation_rule_deleted',
      'rule',
      ruleId,
      {},
      tenantId,
      req.ip,
      req.get('User-Agent'),
    );
  }

  @Get('auto-moderation/rules')
  @RequirePermission('auto_moderation', 'read')
  async getAutoModerationRules(
    @Query('ruleType') ruleType?: AutoModerationRuleType,
    @TenantContext() tenantId?: string,
  ) {
    return await this.autoModerationService.getRules(tenantId, ruleType);
  }

  // Content Analysis
  @Post('auto-moderation/analyze')
  @RequirePermission('moderation', 'create')
  async analyzeContent(
    @Body(ValidationPipe) dto: AnalyzeContentRequestDto,
    @Request() req: any,
    @TenantContext() tenantId?: string,
  ) {
    const context: ModerationContext = {
      userId: dto.userId,
      tenantId,
      targetType: dto.targetType,
      targetId: dto.targetId,
      content: dto.content,
      metadata: dto.metadata,
    };

    const result = await this.autoModerationService.analyzeContent(context);

    // Process violations if any are found
    if (result.violations.length > 0) {
      await this.autoModerationService.processViolations(context, result);
    }

    await this.auditLogService.logModerationAction(
      req.user.id,
      'content_analyzed',
      dto.targetType,
      dto.targetId,
      'Content analyzed for violations',
      { violationsFound: result.violations.length, confidence: result.confidence },
      tenantId,
      req.ip,
      req.get('User-Agent'),
    );

    return result;
  }

  // Violation Management
  @Get('auto-moderation/violations')
  @RequirePermission('moderation', 'read')
  async getViolations(
    @Query('userId') userId?: string,
    @Query('ruleId') ruleId?: string,
    @Query('severity') severity?: RuleSeverity,
    @Query('reviewStatus') reviewStatus?: ReviewStatus,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('page', new ParseIntPipe({ optional: true })) page = 1,
    @Query('limit', new ParseIntPipe({ optional: true })) limit = 50,
    @TenantContext() tenantId?: string,
  ) {
    const filters = {
      tenantId,
      userId,
      ruleId,
      severity,
      reviewStatus,
      dateFrom: dateFrom ? new Date(dateFrom) : undefined,
      dateTo: dateTo ? new Date(dateTo) : undefined,
    };

    return await this.autoModerationService.getViolations(filters, page, limit);
  }

  @Put('auto-moderation/violations/:violationId/review')
  @RequirePermission('moderation', 'update')
  async reviewViolation(
    @Param('violationId', ParseUUIDPipe) violationId: string,
    @Body('reviewStatus') reviewStatus: ReviewStatus,
    @Request() req: any,
    @TenantContext() tenantId?: string,
  ) {
    const violation = await this.autoModerationService.reviewViolation(
      violationId,
      reviewStatus,
      req.user.id,
    );

    await this.auditLogService.logModerationAction(
      req.user.id,
      'violation_reviewed',
      'violation',
      violationId,
      'Violation review completed',
      { reviewStatus },
      tenantId,
      req.ip,
      req.get('User-Agent'),
    );

    return violation;
  }

  // Audit Logs
  @Get('audit-logs')
  @RequirePermission('audit_logs', 'read')
  async searchAuditLogs(
    @Query('actorId') actorId?: string,
    @Query('action') action?: string,
    @Query('targetType') targetType?: string,
    @Query('targetId') targetId?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('ipAddress') ipAddress?: string,
    @Query('page', new ParseIntPipe({ optional: true })) page = 1,
    @Query('limit', new ParseIntPipe({ optional: true })) limit = 50,
    @TenantContext() tenantId?: string,
  ) {
    const filters: AuditLogSearchFilters = {
      tenantId,
      actorId,
      action,
      targetType,
      targetId,
      ipAddress,
      dateFrom: dateFrom ? new Date(dateFrom) : undefined,
      dateTo: dateTo ? new Date(dateTo) : undefined,
    };

    return await this.auditLogService.searchAuditLogs(filters, page, limit);
  }

  @Get('audit-logs/:id')
  @RequirePermission('audit_logs', 'read')
  async getAuditLogById(@Param('id', ParseUUIDPipe) id: string) {
    return await this.auditLogService.getAuditLogById(id);
  }

  @Get('audit-logs/users/:userId')
  @RequirePermission('audit_logs', 'read')
  async getUserAuditHistory(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Query('page', new ParseIntPipe({ optional: true })) page = 1,
    @Query('limit', new ParseIntPipe({ optional: true })) limit = 50,
    @TenantContext() tenantId?: string,
  ) {
    return await this.auditLogService.getUserAuditHistory(userId, page, limit, tenantId);
  }

  @Get('audit-logs/targets/:targetType/:targetId')
  @RequirePermission('audit_logs', 'read')
  async getTargetAuditHistory(
    @Param('targetType') targetType: string,
    @Param('targetId') targetId: string,
    @Query('page', new ParseIntPipe({ optional: true })) page = 1,
    @Query('limit', new ParseIntPipe({ optional: true })) limit = 50,
    @TenantContext() tenantId?: string,
  ) {
    return await this.auditLogService.getTargetAuditHistory(targetType, targetId, page, limit, tenantId);
  }

  @Get('audit-logs/stats')
  @RequirePermission('audit_logs', 'read')
  async getAuditStats(
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @TenantContext() tenantId?: string,
  ) {
    return await this.auditLogService.getAuditStats(
      tenantId,
      dateFrom ? new Date(dateFrom) : undefined,
      dateTo ? new Date(dateTo) : undefined,
    );
  }

  @Get('audit-logs/activity/timeline')
  @RequirePermission('audit_logs', 'read')
  async getActivityTimeline(
    @Query('targetType') targetType?: string,
    @Query('targetId') targetId?: string,
    @Query('hours', new ParseIntPipe({ optional: true })) hours = 24,
    @TenantContext() tenantId?: string,
  ) {
    return await this.auditLogService.getActivityTimeline(targetType, targetId, tenantId, hours);
  }

  // Maintenance
  @Delete('audit-logs/cleanup')
  @RequirePermission('audit_logs', 'delete')
  @HttpCode(HttpStatus.OK)
  async cleanupOldLogs(
    @Query('retentionDays', new ParseIntPipe({ optional: true })) retentionDays = 90,
    @Request() req: any,
    @TenantContext() tenantId?: string,
  ) {
    const deletedCount = await this.auditLogService.cleanupOldLogs(retentionDays);

    await this.auditLogService.logAdminAction(
      req.user.id,
      'audit_logs_cleanup',
      'system',
      'audit_logs',
      { deletedCount, retentionDays },
      tenantId,
      req.ip,
      req.get('User-Agent'),
    );

    return { deletedCount };
  }
}
