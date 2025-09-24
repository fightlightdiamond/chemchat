import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { ConfigModule } from '@nestjs/config';

// Services
import { ElasticsearchService } from './services/elasticsearch.service';
import { MessageIndexService } from './services/message-index.service';
import { SearchService } from './services/search.service';

// Workers
import { MessageIndexingWorker } from './workers/message-indexing.worker';

// Controllers
import { SearchController } from './controllers/search.controller';

// Handlers
import { SearchMessagesHandler } from './handlers/search-messages.handler';
import { GetSearchSuggestionsHandler } from './handlers/get-search-suggestions.handler';

// Shared modules
import { KafkaModule } from '../shared/kafka/kafka.module';
import { SharedModule } from '../shared/shared.module';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../shared/infrastructure/prisma/prisma.module';

const queryHandlers = [
  SearchMessagesHandler,
  GetSearchSuggestionsHandler,
];

const services = [
  ElasticsearchService,
  MessageIndexService,
  SearchService,
];

const workers = [
  MessageIndexingWorker,
];

@Module({
  imports: [
    CqrsModule,
    ConfigModule,
    SharedModule,
    PrismaModule,
    KafkaModule.forRoot(),
    AuthModule,
  ],
  controllers: [SearchController],
  providers: [
    ...services,
    ...workers,
    ...queryHandlers,
  ],
  exports: [
    ElasticsearchService,
    MessageIndexService,
    SearchService,
    MessageIndexingWorker,
  ],
})
export class SearchModule {}
