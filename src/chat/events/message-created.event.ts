import { IEvent } from '@nestjs/cqrs';
import { MessageContent } from '../../shared/domain/value-objects/message-content.vo';

export class MessageCreatedEvent implements IEvent {
  constructor(
    public readonly messageId: string,
    public readonly conversationId: string,
    public readonly senderId: string | null,
    public readonly content: MessageContent,
    public readonly sequenceNumber: bigint,
    public readonly createdAt: Date,
    public readonly correlationId?: string,
    public readonly tenantId?: string,
  ) {}

  toJSON() {
    return {
      messageId: this.messageId,
      conversationId: this.conversationId,
      senderId: this.senderId,
      content: this.content.toJSON(),
      sequenceNumber: this.sequenceNumber.toString(),
      createdAt: this.createdAt.toISOString(),
      correlationId: this.correlationId,
      tenantId: this.tenantId,
      eventType: 'MessageCreated',
      version: '1.0',
    };
  }
}
