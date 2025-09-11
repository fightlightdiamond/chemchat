import { Module } from '@nestjs/common';
import { CqrsModule } from '../shared/cqrs/cqrs.module';

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

@Module({
  imports: [CqrsModule],
  providers: [
    ...CommandHandlers,
    ...QueryHandlers,
    ...EventHandlers,
    ConversationSummaryService,
  ],
  controllers: [],
  exports: [ConversationSummaryService],
})
export class ChatModule {}
