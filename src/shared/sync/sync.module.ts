import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { MongoDBModule } from '../infrastructure/mongodb/mongodb.module';
import { MessageCreatedMongoDBSyncHandler } from './handlers/message-sync-mongodb.handler';
import { MessageEditedMongoDBSyncHandler } from './handlers/message-sync-mongodb.handler';
import { MessageDeletedMongoDBSyncHandler } from './handlers/message-sync-mongodb.handler';

@Module({
  imports: [
    CqrsModule,
    MongoDBModule,
  ],
  providers: [
    MessageCreatedMongoDBSyncHandler,
    MessageEditedMongoDBSyncHandler,
    MessageDeletedMongoDBSyncHandler,
  ],
  exports: [
    MessageCreatedMongoDBSyncHandler,
    MessageEditedMongoDBSyncHandler,
    MessageDeletedMongoDBSyncHandler,
  ],
})
export class SyncModule {}