import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SharedModule } from './shared';
import { AuthModule } from './auth';
import { ChatModule } from './chat';
import { PresenceModule } from './presence';
import { NotificationModule } from './notification';
import { MediaModule } from './media/media.module';
import { SearchModule } from './search/search.module';
import { TenantModule } from './shared/modules/tenant.module';
import { SecurityModule } from './security/security.module';
import { SyncModule } from './sync/sync.module';
import { HealthModule } from './health';
import { ObservabilityModule } from './observability/observability.module';
import { GlobalExceptionFilter } from './shared/filters/global-exception.filter';
import { CorrelationIdMiddleware } from './shared/middleware/correlation-id.middleware';
import { RedisModule } from './shared/redis/redis.module';

@Module({
  imports: [
    // Global modules
    SharedModule,
    RedisModule.forRoot({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      db: parseInt(process.env.REDIS_DB || '0', 10),
      password: process.env.REDIS_PASSWORD,
      keyPrefix: 'ws:',
      enableAutoPipelining: true,
      maxRetriesPerRequest: 3,
      pool: { min: 0, max: 10, idleTimeoutMillis: 30000 },
      circuitBreaker: {
        timeout: 1500,
        errorThresholdPercentage: 50,
        resetTimeout: 10000,
      },
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000, // 1 minute
        limit: 100, // 100 requests per minute
      },
    ]),

    // Feature modules
    AuthModule,
    ChatModule,
    PresenceModule,
    NotificationModule,
    MediaModule,
    SearchModule,
    TenantModule,
    SecurityModule,
    SyncModule,
    HealthModule,
    ObservabilityModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
