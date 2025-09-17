import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { MongoDBModule } from '../shared/infrastructure/mongodb/mongodb.module';
import { SearchMessagesMongoDBHandler } from './handlers/search-messages-mongodb.handler';

@Module({
  imports: [
    CqrsModule,
    MongoDBModule,
  ],
  providers: [
    SearchMessagesMongoDBHandler,
  ],
  exports: [
    SearchMessagesMongoDBHandler,
  ],
})
export class SearchMongoDBModule {}