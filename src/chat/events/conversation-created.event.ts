import { IEvent } from '@nestjs/cqrs';
import { ConversationType } from '../../shared/domain/value-objects/conversation-type.vo';

export class ConversationCreatedEvent implements IEvent {
  constructor(
    public readonly conversationId: string,
    public readonly name: string,
    public readonly type: ConversationType,
    public readonly createdBy: string,
    public readonly participantIds: string[],
    public readonly createdAt: Date,
    public readonly correlationId?: string,
    public readonly tenantId?: string,
  ) {}

  toJSON() {
    return {
      conversationId: this.conversationId,
      name: this.name,
      type: this.type,
      createdBy: this.createdBy,
      participantIds: this.participantIds,
      createdAt: this.createdAt.toISOString(),
      correlationId: this.correlationId,
      tenantId: this.tenantId,
      eventType: 'ConversationCreated',
      version: '1.0',
    };
  }
}
