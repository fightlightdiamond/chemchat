import { Module } from '@nestjs/common';
import { CqrsModule } from '../shared/cqrs/cqrs.module';
import { AuthModule } from '../auth/auth.module';

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

const WebSocketServices = [
  ConnectionManagerService,
  RoomManagerService,
  MessageBroadcastService,
];

@Module({
  imports: [CqrsModule, AuthModule],
  providers: [
    ...CommandHandlers,
    ...QueryHandlers,
    ...EventHandlers,
    ...WebSocketServices,
    ConversationSummaryService,
    ChatGateway,
  ],
  controllers: [],
  exports: [ConversationSummaryService, ...WebSocketServices],
})
export class ChatModule {}
