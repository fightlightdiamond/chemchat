import { 
  AdminRoleType, 
  ModerationActionType, 
  ModerationTargetType, 
  BanType,
  ReportStatus,
  ReportPriority,
  ReportType
} from '@prisma/client';

export interface AdminPermission {
  resource: string;
  actions: string[];
}

export interface CreateAdminRoleDto {
  userId: string;
  tenantId?: string;
  role: AdminRoleType;
  permissions: string[];
  expiresAt?: Date;
}

export interface ModerationActionDto {
  targetType: ModerationTargetType;
  targetId: string;
  actionType: ModerationActionType;
  reason: string;
  duration?: number; // minutes
  metadata?: Record<string, any>;
}

export interface BanUserDto {
  userId: string;
  banType: BanType;
  reason: string;
  duration?: number; // minutes for temporary bans
}

export interface CreateReportDto {
  targetType: ModerationTargetType;
  targetId: string;
  reportType: ReportType;
  reason: string;
  description?: string;
}

export interface UpdateReportDto {
  status?: ReportStatus;
  priority?: ReportPriority;
  assignedTo?: string;
  resolution?: string;
}

export interface AdminStats {
  totalUsers: number;
  activeUsers: number;
  bannedUsers: number;
  totalReports: number;
  pendingReports: number;
  resolvedReports: number;
  moderationActions: number;
  autoModerationViolations: number;
}

export interface UserModerationHistory {
  userId: string;
  warnings: number;
  mutes: number;
  kicks: number;
  bans: number;
  reports: number;
  violations: number;
  lastAction?: Date;
}

export interface AdminSearchFilters {
  role?: AdminRoleType;
  tenantId?: string;
  isActive?: boolean;
  permissions?: string[];
}

export interface ReportSearchFilters {
  status?: ReportStatus;
  priority?: ReportPriority;
  reportType?: ReportType;
  targetType?: ModerationTargetType;
  assignedTo?: string;
  reporterId?: string;
  dateFrom?: Date;
  dateTo?: Date;
}

export interface ModerationActionSearchFilters {
  actionType?: ModerationActionType;
  targetType?: ModerationTargetType;
  moderatorId?: string;
  targetId?: string;
  isActive?: boolean;
  dateFrom?: Date;
  dateTo?: Date;
}
