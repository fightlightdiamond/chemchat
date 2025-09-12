import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { RedisModule } from '../redis/redis.module';
import { IdempotencyMiddleware } from './idempotency.middleware';

@Module({
  imports: [RedisModule],
  providers: [IdempotencyMiddleware],
  exports: [IdempotencyMiddleware],
})
export class IdempotencyModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Apply idempotency middleware to all routes by default
    consumer.apply(IdempotencyMiddleware).forRoutes('*');
  }
}
