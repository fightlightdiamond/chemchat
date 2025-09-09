import { ConversationRole } from '../value-objects/conversation-role.vo';

export class ConversationMember {
  constructor(
    public readonly conversationId: string,
    public readonly userId: string,
    public readonly role: ConversationRole,
    public readonly lastReadMessageId: string | null = null,
    public readonly lastReadSequence: bigint = 0n,
    public readonly joinedAt: Date = new Date(),
  ) {
    this.validateMember();
  }

  private validateMember(): void {
    if (!this.conversationId || this.conversationId.trim().length === 0) {
      throw new Error('Conversation ID is required');
    }

    if (!this.userId || this.userId.trim().length === 0) {
      throw new Error('User ID is required');
    }

    if (!this.role) {
      throw new Error('Member role is required');
    }

    if (this.lastReadSequence < 0n) {
      throw new Error('Last read sequence must be non-negative');
    }
  }

  public updateRole(newRole: ConversationRole): ConversationMember {
    if (!newRole) {
      throw new Error('New role is required');
    }

    return new ConversationMember(
      this.conversationId,
      this.userId,
      newRole,
      this.lastReadMessageId,
      this.lastReadSequence,
      this.joinedAt,
    );
  }

  public updateLastRead(
    messageId: string,
    sequenceNumber: bigint,
  ): ConversationMember {
    if (!messageId || messageId.trim().length === 0) {
      throw new Error('Message ID is required');
    }

    if (sequenceNumber < 0n) {
      throw new Error('Sequence number must be non-negative');
    }

    // Ensure we don't go backwards in sequence
    if (sequenceNumber < this.lastReadSequence) {
      throw new Error('Cannot update last read to an earlier sequence number');
    }

    return new ConversationMember(
      this.conversationId,
      this.userId,
      this.role,
      messageId,
      sequenceNumber,
      this.joinedAt,
    );
  }

  public isOwner(): boolean {
    return this.role === ConversationRole.OWNER;
  }

  public isAdmin(): boolean {
    return this.role === ConversationRole.ADMIN;
  }

  public isMember(): boolean {
    return this.role === ConversationRole.MEMBER;
  }

  public canModerate(): boolean {
    return this.isOwner() || this.isAdmin();
  }

  public canManageMembers(): boolean {
    return this.isOwner() || this.isAdmin();
  }

  public canDeleteMessages(): boolean {
    return this.isOwner() || this.isAdmin();
  }

  public hasReadMessage(sequenceNumber: bigint): boolean {
    return this.lastReadSequence >= sequenceNumber;
  }

  public getUnreadCount(latestSequence: bigint): bigint {
    if (latestSequence <= this.lastReadSequence) {
      return 0n;
    }
    return latestSequence - this.lastReadSequence;
  }

  public toJSON() {
    return {
      conversationId: this.conversationId,
      userId: this.userId,
      role: this.role,
      lastReadMessageId: this.lastReadMessageId,
      lastReadSequence: this.lastReadSequence.toString(),
      joinedAt: this.joinedAt,
      isOwner: this.isOwner(),
      isAdmin: this.isAdmin(),
      canModerate: this.canModerate(),
    };
  }
}
