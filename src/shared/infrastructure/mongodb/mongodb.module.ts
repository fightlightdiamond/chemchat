import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { MongoDBService } from './mongodb.service';
import { MessageMongoDBRepository } from '../../domain/repositories/message-mongodb.repository';
import { ConversationMongoDBRepository } from '../../domain/repositories/conversation-mongodb.repository';
import { UserConversationMongoDBRepository } from '../../domain/repositories/user-conversation-mongodb.repository';
import { MongoDBMonitorService } from '../../monitoring/mongodb-monitor.service';
import { MongoDBHealthController } from '../../controllers/mongodb-health.controller';
import { MessageSyncRecoveryService } from '../../sync/handlers/message-sync-mongodb.handler';
import { MongoDBAnalyticsService } from '../../analytics/mongodb-analytics.service';
import { AnalyticsController } from '../../controllers/analytics.controller';
import { MongoDBChangeStreamsService } from '../../realtime/mongodb-change-streams.service';
import { RealtimeEventsService } from '../../realtime/realtime-events.service';
import { RedisCacheService } from '../../cache/redis-cache.service';
import { CachedRepositoriesService } from '../../cache/cached-repositories.service';

@Module({
  imports: [
    ConfigModule,
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot(),
  ],
  providers: [
    // Core MongoDB services
    MongoDBService,
    
    // Repositories
    MessageMongoDBRepository,
    ConversationMongoDBRepository,
    UserConversationMongoDBRepository,
    
    // Monitoring and health
    MongoDBMonitorService,
    MessageSyncRecoveryService,
    
    // Analytics
    MongoDBAnalyticsService,
    
    // Real-time features
    MongoDBChangeStreamsService,
    RealtimeEventsService,
    
    // Caching
    RedisCacheService,
    CachedRepositoriesService,
  ],
  controllers: [
    MongoDBHealthController,
    AnalyticsController,
  ],
  exports: [
    // Core services
    MongoDBService,
    
    // Repositories
    MessageMongoDBRepository,
    ConversationMongoDBRepository,
    UserConversationMongoDBRepository,
    
    // Monitoring
    MongoDBMonitorService,
    MessageSyncRecoveryService,
    
    // Analytics
    MongoDBAnalyticsService,
    
    // Real-time
    MongoDBChangeStreamsService,
    RealtimeEventsService,
    
    // Caching
    RedisCacheService,
    CachedRepositoriesService,
  ],
})
export class MongoDBModule {}