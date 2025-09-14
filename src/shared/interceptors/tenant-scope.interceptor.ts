import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { TenantRequest } from '../interfaces/tenant.interface';
import { TENANT_SCOPED_KEY } from '../decorators/tenant-scoped.decorator';

@Injectable()
export class TenantScopeInterceptor implements NestInterceptor {
  private readonly logger = new Logger(TenantScopeInterceptor.name);

  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<TenantRequest>();
    const handler = context.getHandler();
    const controller = context.getClass();

    // Check if tenant scoping is enabled for this handler or controller
    const isTenantScoped = this.reflector.getAllAndOverride<boolean>(TENANT_SCOPED_KEY, [
      handler,
      controller,
    ]);

    // Check if tenant scoping should be bypassed for this specific method
    const bypassTenantScope = this.reflector.get<boolean>('bypass_tenant_scope', handler);

    if (isTenantScoped && !bypassTenantScope && request.tenantId) {
      // Inject tenant context into the request for downstream services
      request.body = request.body || {};
      if (typeof request.body === 'object') {
        request.body.tenantId = request.tenantId;
      }

      // Add tenant ID to query parameters if not present
      request.query = request.query || {};
      if (!request.query.tenantId) {
        request.query.tenantId = request.tenantId;
      }

      this.logger.debug(`Tenant scope applied: ${request.tenantId}`);
    }

    return next.handle();
  }
}
