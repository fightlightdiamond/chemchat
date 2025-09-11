import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { Injectable } from '@nestjs/common';
import { ConversationCreatedEvent } from '../events/conversation-created.event';
import { ConversationSummaryService } from '../read-models/conversation-summary.service';

@Injectable()
@EventsHandler(ConversationCreatedEvent)
export class ConversationCreatedEventHandler
  implements IEventHandler<ConversationCreatedEvent>
{
  constructor(
    private readonly conversationSummaryService: ConversationSummaryService,
  ) {}

  async handle(event: ConversationCreatedEvent): Promise<void> {
    try {
      // Create conversation summary projection
      const summaryProjection =
        this.conversationSummaryService.createProjection(
          event.conversationId,
          {
            id: event.conversationId,
            name: event.name,
            type: event.type,
            participantCount: event.participantIds.length,
            lastMessageAt: undefined,
            lastMessageContent: undefined,
            lastMessageSender: undefined,
            unreadCount: 0,
            isArchived: false,
            avatarUrl: undefined,
            createdAt: event.createdAt,
          },
          1,
          event.tenantId,
        );

      await this.conversationSummaryService.upsert(summaryProjection);
    } catch (error) {
      console.error('Error handling ConversationCreatedEvent:', error);
    }
  }
}
