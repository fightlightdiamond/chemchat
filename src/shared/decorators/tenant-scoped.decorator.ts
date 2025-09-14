import { SetMetadata } from '@nestjs/common';

export const TENANT_SCOPED_KEY = 'tenant_scoped';

/**
 * Decorator to mark a service or repository as tenant-scoped.
 * This ensures all operations are automatically filtered by tenant ID.
 */
export const TenantScoped = () => SetMetadata(TENANT_SCOPED_KEY, true);

/**
 * Decorator to mark specific methods that should bypass tenant scoping.
 * Use with caution - only for admin operations or cross-tenant functionality.
 */
export const BypassTenantScope = () => SetMetadata('bypass_tenant_scope', true);
