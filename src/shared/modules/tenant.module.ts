import { Module, Global } from '@nestjs/common';
import { TenantService } from '../services/tenant.service';
import { QuotaTrackingService } from '../services/quota-tracking.service';
import { TenantController } from '../controllers/tenant.controller';
import { TenantContextMiddleware } from '../middleware/tenant-context.middleware';
import { TenantRateLimitMiddleware } from '../middleware/tenant-rate-limit.middleware';
import { TenantScopeInterceptor } from '../interceptors/tenant-scope.interceptor';
import { PrismaService } from '../infrastructure/prisma/prisma.service';
import { RedisModule } from '../redis/redis.module';
import { AuthModule } from '../../auth/auth.module';

@Global()
@Module({
  imports: [RedisModule, AuthModule],
  controllers: [TenantController],
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
