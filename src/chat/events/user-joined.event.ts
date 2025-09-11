import { IEvent } from '@nestjs/cqrs';

export class UserJoinedEvent implements IEvent {
  constructor(
    public readonly userId: string,
    public readonly conversationId: string,
    public readonly joinedAt: Date,
    public readonly invitedBy?: string,
    public readonly correlationId?: string,
    public readonly tenantId?: string,
  ) {}

  toJSON() {
    return {
      userId: this.userId,
      conversationId: this.conversationId,
      joinedAt: this.joinedAt.toISOString(),
      invitedBy: this.invitedBy,
      correlationId: this.correlationId,
      tenantId: this.tenantId,
      eventType: 'UserJoined',
      version: '1.0',
    };
  }
}
