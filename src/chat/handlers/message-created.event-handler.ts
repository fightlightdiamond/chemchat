import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { Injectable } from '@nestjs/common';
import { MessageCreatedEvent } from '../events/message-created.event';
import { ConversationSummaryService } from '../read-models/conversation-summary.service';

@Injectable()
@EventsHandler(MessageCreatedEvent)
export class MessageCreatedEventHandler
  implements IEventHandler<MessageCreatedEvent>
{
  constructor(
    private readonly conversationSummaryService: ConversationSummaryService,
  ) {}

  async handle(event: MessageCreatedEvent): Promise<void> {
    try {
      // Update conversation summary with latest message
      await this.conversationSummaryService.updateLastMessage(
        event.conversationId,
        event.content.getText() || '[Media]',
        event.senderId,
        event.createdAt,
        event.tenantId,
      );

      // Increment unread count for conversation members
      await this.conversationSummaryService.incrementUnreadCount(
        event.conversationId,
        event.tenantId,
      );
    } catch (error) {
      console.error('Error handling MessageCreatedEvent:', error);
    }
  }
}
