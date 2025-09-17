import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { MongoDBModule } from '../shared/infrastructure/mongodb/mongodb.module';
import { GetConversationHistoryMongoDBHandler } from './handlers/get-conversation-history-mongodb.handler';
import { GetUserMessagesMongoDBHandler } from './handlers/get-user-messages-mongodb.handler';
import { GetRecentMessagesMongoDBHandler } from './handlers/get-recent-messages-mongodb.handler';

@Module({
  imports: [
    CqrsModule,
    MongoDBModule,
  ],
  providers: [
    GetConversationHistoryMongoDBHandler,
    GetUserMessagesMongoDBHandler,
    GetRecentMessagesMongoDBHandler,
  ],
  exports: [
    GetConversationHistoryMongoDBHandler,
    GetUserMessagesMongoDBHandler,
    GetRecentMessagesMongoDBHandler,
  ],
})
export class ChatMongoDBModule {}