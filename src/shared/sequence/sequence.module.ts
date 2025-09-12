import { Global, Module } from '@nestjs/common';
import { SequenceService } from './sequence.service';
import { RedisModule } from '../redis/redis.module';
import { DatabaseService } from '../services/database.service';

@Global()
@Module({
  imports: [RedisModule],
  providers: [DatabaseService, SequenceService],
  exports: [SequenceService],
})
export class SequenceModule {}
