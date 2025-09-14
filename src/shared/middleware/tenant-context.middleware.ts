import { Injectable, NestMiddleware, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { TenantRequest } from '../interfaces/tenant.interface';
import { TenantService } from '../services/tenant.service';
import { Logger } from '@nestjs/common';

@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  private readonly logger = new Logger(TenantContextMiddleware.name);

  constructor(private readonly tenantService: TenantService) {}

  async use(req: TenantRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      // Extract tenant ID from various sources
      const tenantId = this.extractTenantId(req);
      
      if (!tenantId) {
        this.logger.warn('No tenant ID found in request');
        throw new UnauthorizedException('Tenant ID is required');
      }

      // Validate and fetch tenant context
      const tenant = await this.tenantService.getTenant(tenantId);
      
      if (!tenant) {
        this.logger.warn(`Tenant not found: ${tenantId}`);
        throw new UnauthorizedException('Invalid tenant');
      }

      if (!tenant.isActive) {
        this.logger.warn(`Inactive tenant access attempt: ${tenantId}`);
        throw new ForbiddenException('Tenant account is inactive');
      }

      // Attach tenant context to request
      req.tenant = tenant;
      req.tenantId = tenantId;

      // Log tenant access for audit
      this.logger.debug(`Tenant context set: ${tenantId} (${tenant.tenantName})`);

      next();
    } catch (error) {
      this.logger.error(`Tenant context middleware error: ${error.message}`, error.stack);
      next(error);
    }
  }

  private extractTenantId(req: Request): string | null {
    // Priority order for tenant ID extraction:
    // 1. Header: X-Tenant-ID
    // 2. Subdomain: tenant.example.com
    // 3. Query parameter: ?tenant=xxx
    // 4. JWT token payload (if available)

    // Check header
    const headerTenantId = req.headers['x-tenant-id'] as string;
    if (headerTenantId) {
      return headerTenantId;
    }

    // Check subdomain
    const host = req.headers.host;
    if (host) {
      const subdomain = host.split('.')[0];
      if (subdomain && subdomain !== 'www' && subdomain !== 'api') {
        return subdomain;
      }
    }

    // Check query parameter
    const queryTenantId = req.query.tenant as string;
    if (queryTenantId) {
      return queryTenantId;
    }

    // Check JWT token if available
    const user = (req as any).user;
    if (user && user.tenantId) {
      return user.tenantId;
    }

    return null;
  }
}
