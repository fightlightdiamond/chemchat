import { Global, Module } from '@nestjs/common';
import { IdempotencyService } from '../services/idempotency.service';
import { IdempotencyInterceptor } from '../interceptors/idempotency.interceptor';
import { MessageIdService } from '../../chat/services/message-id.service';
import { RedisModule } from '../redis/redis.module';

@Global()
@Module({
  imports: [RedisModule],
  providers: [MessageIdService, IdempotencyService, IdempotencyInterceptor],
  exports: [IdempotencyService, IdempotencyInterceptor, MessageIdService],
})
export class IdempotencyModule {}
