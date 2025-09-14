import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const TenantContext = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): string | undefined => {
    const request = ctx.switchToHttp().getRequest();
    
    // Try multiple sources for tenant ID
    return (
      request.tenantId ||
      request.headers['x-tenant-id'] ||
      request.query.tenantId ||
      request.body?.tenantId
    );
  },
);
