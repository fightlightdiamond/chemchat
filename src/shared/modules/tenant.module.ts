import { Module, Global } from '@nestjs/common';
import { TenantService } from '../services/tenant.service';
import { QuotaTrackingService } from '../services/quota-tracking.service';
import { TenantContextMiddleware } from '../middleware/tenant-context.middleware';
import { TenantRateLimitMiddleware } from '../middleware/tenant-rate-limit.middleware';
import { TenantScopeInterceptor } from '../interceptors/tenant-scope.interceptor';
import { PrismaService } from '../infrastructure/prisma/prisma.service';
import { RedisModule } from '../redis/redis.module';

@Global()
@Module({
  imports: [RedisModule],
  providers: [
    TenantService,
    QuotaTrackingService,
    TenantContextMiddleware,
    TenantRateLimitMiddleware,
    TenantScopeInterceptor,
    PrismaService,
  ],
  exports: [
    TenantService,
    QuotaTrackingService,
    TenantContextMiddleware,
    TenantRateLimitMiddleware,
    TenantScopeInterceptor,
  ],
})
export class TenantModule {}
