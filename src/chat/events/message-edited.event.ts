import { IEvent } from '@nestjs/cqrs';
import { MessageContent } from '../../shared/domain/value-objects/message-content.vo';

export class MessageEditedEvent implements IEvent {
  constructor(
    public readonly messageId: string,
    public readonly conversationId: string,
    public readonly senderId: string,
    public readonly content: MessageContent,
    public readonly editedAt: Date,
    public readonly correlationId?: string,
    public readonly tenantId?: string,
  ) {}

  toJSON() {
    return {
      messageId: this.messageId,
      conversationId: this.conversationId,
      senderId: this.senderId,
      content: this.content.toJSON(),
      editedAt: this.editedAt.toISOString(),
      correlationId: this.correlationId,
      tenantId: this.tenantId,
      eventType: 'MessageEdited',
      version: '1.0',
    };
  }
}
