import { Injectable, CanActivate, ExecutionContext, ForbiddenException, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AdminService } from '../services/admin.service';
import { PERMISSION_KEY, RequiredPermission } from '../decorators/require-permission.decorator';

@Injectable()
export class AdminPermissionGuard implements CanActivate {
  private readonly logger = new Logger(AdminPermissionGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly adminService: AdminService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermission = this.reflector.getAllAndOverride<RequiredPermission>(
      PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermission) {
      // No permission requirement specified, allow access
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const tenantId = request.tenantId || request.headers['x-tenant-id'] || request.query.tenantId;

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    try {
      const hasPermission = await this.adminService.hasPermission(
        user.id,
        requiredPermission.resource,
        requiredPermission.action,
        tenantId,
      );

      if (!hasPermission) {
        this.logger.warn(
          `Access denied for user ${user.id}: missing permission ${requiredPermission.resource}:${requiredPermission.action}`,
        );
        throw new ForbiddenException(
          `Insufficient permissions: ${requiredPermission.resource}:${requiredPermission.action}`,
        );
      }

      this.logger.debug(
        `Access granted for user ${user.id}: ${requiredPermission.resource}:${requiredPermission.action}`,
      );
      return true;
    } catch (error) {
      if (error instanceof ForbiddenException) {
        throw error;
      }
      
      this.logger.error(`Permission check failed: ${error.message}`, error.stack);
      throw new ForbiddenException('Permission check failed');
    }
  }
}
