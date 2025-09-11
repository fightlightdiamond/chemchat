import { IEvent } from '@nestjs/cqrs';

export class MessageDeletedEvent implements IEvent {
  constructor(
    public readonly messageId: string,
    public readonly conversationId: string,
    public readonly senderId: string,
    public readonly deletedAt: Date,
    public readonly correlationId?: string,
    public readonly tenantId?: string,
  ) {}

  toJSON() {
    return {
      messageId: this.messageId,
      conversationId: this.conversationId,
      senderId: this.senderId,
      deletedAt: this.deletedAt.toISOString(),
      correlationId: this.correlationId,
      tenantId: this.tenantId,
      eventType: 'MessageDeleted',
      version: '1.0',
    };
  }
}
