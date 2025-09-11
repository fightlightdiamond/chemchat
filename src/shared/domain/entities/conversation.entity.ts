import { ConversationType } from '../value-objects/conversation-type.vo';

export class Conversation {
  constructor(
    public readonly id: string,
    public readonly type: ConversationType,
    public readonly name: string | null,
    public readonly ownerId: string | null,
    public readonly createdAt: Date = new Date(),
    public readonly updatedAt: Date = new Date(),
  ) {
    this.validateConversation();
  }

  private validateConversation(): void {
    if (!this.id || this.id.trim().length === 0) {
      throw new Error('Conversation ID is required');
    }

    if (!this.type) {
      throw new Error('Conversation type is required');
    }

    // Group conversations must have a name and owner
    if (this.type === ConversationType.GROUP) {
      if (!this.name || this.name.trim().length === 0) {
        throw new Error('Group conversations must have a name');
      }

      if (this.name.length > 100) {
        throw new Error('Conversation name must not exceed 100 characters');
      }

      if (!this.ownerId || this.ownerId.trim().length === 0) {
        throw new Error('Group conversations must have an owner');
      }
    }

    // Direct messages should not have a name or owner
    if (this.type === ConversationType.DM) {
      if (this.name !== null) {
        throw new Error('Direct message conversations should not have a name');
      }

      if (this.ownerId !== null) {
        throw new Error(
          'Direct message conversations should not have an owner',
        );
      }
    }
  }

  public updateName(newName: string): Conversation {
    if (this.type === ConversationType.DM) {
      throw new Error('Cannot update name of direct message conversation');
    }

    if (!newName || newName.trim().length === 0) {
      throw new Error('Group conversation name cannot be empty');
    }

    if (newName.length > 100) {
      throw new Error('Conversation name must not exceed 100 characters');
    }

    return new Conversation(
      this.id,
      this.type,
      newName.trim(),
      this.ownerId,
      this.createdAt,
      new Date(),
    );
  }

  public transferOwnership(newOwnerId: string): Conversation {
    if (this.type === ConversationType.DM) {
      throw new Error(
        'Cannot transfer ownership of direct message conversation',
      );
    }

    if (!newOwnerId || newOwnerId.trim().length === 0) {
      throw new Error('New owner ID is required');
    }

    return new Conversation(
      this.id,
      this.type,
      this.name,
      newOwnerId,
      this.createdAt,
      new Date(),
    );
  }

  public isDirectMessage(): boolean {
    return this.type === ConversationType.DM;
  }

  public isGroupConversation(): boolean {
    return this.type === ConversationType.GROUP;
  }

  public getAge(): number {
    return Date.now() - this.createdAt.getTime();
  }

  public isRecentlyCreated(thresholdMs: number = 24 * 60 * 60 * 1000): boolean {
    return this.getAge() < thresholdMs;
  }

  public isOwnedBy(userId: string): boolean {
    return this.ownerId === userId;
  }

  public getDisplayName(): string {
    if (this.isDirectMessage()) {
      return 'Direct Message';
    }
    return this.name || 'Unnamed Conversation';
  }

  public canBeRenamed(): boolean {
    return this.isGroupConversation();
  }

  public canTransferOwnership(): boolean {
    return this.isGroupConversation();
  }

  public isMember(userId: string): boolean {
    // This is a placeholder - in real implementation, this would check
    // the conversation_members table through a repository
    // For now, we'll assume the user has access if they're querying
    return userId !== null && userId.length > 0;
  }

  public toJSON() {
    return {
      id: this.id,
      type: this.type,
      name: this.name,
      ownerId: this.ownerId,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      displayName: this.getDisplayName(),
      isRecentlyCreated: this.isRecentlyCreated(),
      canBeRenamed: this.canBeRenamed(),
    };
  }
}
