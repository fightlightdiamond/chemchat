import { Global, Module } from '@nestjs/common';
import { CqrsModule } from '../shared/cqrs/cqrs.module';
import { AuthModule } from '../auth/auth.module';
import { SequenceModule } from '../shared/sequence/sequence.module';
import { IdempotencyModule } from '../shared/middleware/idempotency.module';
import { MessageIdModule } from './message-id.module';
import { PresenceModule } from '../presence/presence.module';
import { OutboxModule } from '../shared/outbox/outbox.module';
import { KafkaModule } from '../shared/kafka/kafka.module';
import { PrismaModule } from '../shared/infrastructure/prisma/prisma.module';
import { RedisModule } from '../shared/redis/redis.module';
import { SharedModule } from '../shared/shared.module';

// Command Handlers
import { SendMessageCommandHandler } from './handlers/send-message.handler';
import { EditMessageCommandHandler } from './handlers/edit-message.handler';
import { DeleteMessageCommandHandler } from './handlers/delete-message.handler';
import { CreateConversationCommandHandler } from './handlers/create-conversation.handler';

// Query Handlers
import { GetConversationHistoryQueryHandler } from './handlers/get-conversation-history.handler';
import { SearchMessagesQueryHandler } from './handlers/search-messages.handler';
import { GetUserConversationsQueryHandler } from './handlers/get-user-conversations.handler';

// Event Handlers
import { MessageCreatedEventHandler } from './handlers/message-created.event-handler';
import { ConversationCreatedEventHandler } from './handlers/conversation-created.event-handler';

// Read Model Services
import { ConversationSummaryService } from './read-models/conversation-summary.service';

// WebSocket Gateway and Services
import { ChatGateway } from './gateways/chat.gateway';
import { ConnectionManagerService } from './services/connection-manager.service';
import { RoomManagerService } from './services/room-manager.service';
import { MessageBroadcastService } from './services/message-broadcast.service';

// Services
import { MessageIdService } from './services/message-id.service';
import { MessageRepositoryImpl } from '../shared/infrastructure/repositories/message.repository.impl';
import { ConversationRepositoryImpl } from '../shared/infrastructure/repositories/conversation.repository.impl';
import { ConversationMemberRepositoryImpl } from '../shared/infrastructure/repositories/conversation-member.repository.impl';

const CommandHandlers = [
  SendMessageCommandHandler,
  EditMessageCommandHandler,
  DeleteMessageCommandHandler,
  CreateConversationCommandHandler,
];

const QueryHandlers = [
  GetConversationHistoryQueryHandler,
  SearchMessagesQueryHandler,
  GetUserConversationsQueryHandler,
];

const EventHandlers = [
  MessageCreatedEventHandler,
  ConversationCreatedEventHandler,
];

const Services = [
  ConnectionManagerService,
  RoomManagerService,
  MessageBroadcastService,
  MessageIdService,
];

@Global()
@Module({
  imports: [
    CqrsModule,
    AuthModule,
    SequenceModule,
    IdempotencyModule,
    MessageIdModule,
    PresenceModule,
    OutboxModule,
    KafkaModule.forRoot(),
    PrismaModule,
    RedisModule,
    SharedModule,
  ],
  providers: [
    ...CommandHandlers,
    ...QueryHandlers,
    ...EventHandlers,
    ...Services,
    ConversationSummaryService,
    ChatGateway,
    {
      provide: 'MessageRepository',
      useClass: MessageRepositoryImpl,
    },
    {
      provide: 'ConversationRepository',
      useClass: ConversationRepositoryImpl,
    },
    {
      provide: 'ConversationMemberRepository',
      useClass: ConversationMemberRepositoryImpl,
    },
  ],
  exports: [ChatGateway, SequenceModule, IdempotencyModule, MessageIdModule],
})
export class ChatModule {}
