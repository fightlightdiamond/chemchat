import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { CqrsModule } from '@nestjs/cqrs';

// Shared modules
import { MongoDBModule } from './shared/infrastructure/mongodb/mongodb.module';
import { SyncModule } from './shared/sync/sync.module';

// Feature modules
import { ChatMongoDBModule } from './chat/chat-mongodb.module';
import { SearchMongoDBModule } from './search/search-mongdb.module';

// Original modules (for write operations)
import { ChatModule } from './chat/chat.module';
import { SearchModule } from './search/search.module';
import { NotificationModule } from './notification/notification.module';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.mongodb', '.env'],
    }),
    
    // Core modules
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot({
      global: true,
    }),
    CqrsModule,
    
    // MongoDB modules
    MongoDBModule,
    SyncModule,
    
    // Feature modules with MongoDB
    ChatMongoDBModule,
    SearchMongoDBModule,
    
    // Original modules (for write operations)
    ChatModule,
    SearchModule,
    NotificationModule,
  ],
  controllers: [],
  providers: [],
})
export class AppMongoDBModule {}