import { Module } from '@nestjs/common';
import { RedisModule } from '../shared/redis/redis.module';
import { MessageIdService } from './services/message-id.service';

@Module({
  imports: [RedisModule],
  providers: [MessageIdService],
  exports: [MessageIdService],
})
export class MessageIdModule {}
