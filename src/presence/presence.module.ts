import { Module } from '@nestjs/common';
import { PresenceService } from './services/presence.service';
import { TypingIndicatorService } from './services/typing-indicator.service';
import { PresenceGateway } from './gateways/presence.gateway';
import { RedisModule } from '../shared/redis/redis.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [RedisModule, AuthModule],
  providers: [PresenceService, TypingIndicatorService, PresenceGateway],
  controllers: [],
  exports: [PresenceService, TypingIndicatorService],
})
export class PresenceModule {}
