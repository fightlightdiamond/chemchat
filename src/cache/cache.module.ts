import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CacheService } from './services/cache.service';
import { CacheInvalidationService } from './services/cache-invalidation.service';
import { CacheWarmupService } from './services/cache-warmup.service';
import { CachePreloadingService } from './services/cache-preloading.service';
import { DatabaseOptimizationService } from './services/database-optimization.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    CacheService,
    CacheInvalidationService,
    CacheWarmupService,
    CachePreloadingService,
    DatabaseOptimizationService,
  ],
  exports: [
    CacheService,
    CacheInvalidationService,
    CacheWarmupService,
    CachePreloadingService,
    DatabaseOptimizationService,
  ],
})
export class CacheModule {}
