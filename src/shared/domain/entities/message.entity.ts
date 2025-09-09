import { MessageContent } from '../value-objects/message-content.vo';
import { MessageType } from '../value-objects/message-type.vo';

export class Message {
  constructor(
    public readonly id: string,
    public readonly conversationId: string,
    public readonly senderId: string | null,
    public readonly clientMessageId: string | null,
    public readonly sequenceNumber: bigint,
    public readonly messageType: MessageType,
    public readonly content: MessageContent,
    public readonly editedAt: Date | null = null,
    public readonly deletedAt: Date | null = null,
    public readonly createdAt: Date = new Date(),
  ) {
    this.validateMessage();
  }

  private validateMessage(): void {
    if (!this.id || this.id.trim().length === 0) {
      throw new Error('Message ID is required');
    }

    if (!this.conversationId || this.conversationId.trim().length === 0) {
      throw new Error('Conversation ID is required');
    }

    if (this.sequenceNumber < 0n) {
      throw new Error('Sequence number must be non-negative');
    }

    if (!this.messageType) {
      throw new Error('Message type is required');
    }

    if (!this.content) {
      throw new Error('Message content is required');
    }

    // System messages don't require a sender
    if (
      this.messageType !== MessageType.SYSTEM &&
      (!this.senderId || this.senderId.trim().length === 0)
    ) {
      throw new Error('Sender ID is required for non-system messages');
    }

    // Client message ID validation for deduplication
    if (this.clientMessageId && this.clientMessageId.length > 100) {
      throw new Error('Client message ID must not exceed 100 characters');
    }

    // Validate edit/delete state consistency
    if (this.deletedAt && this.editedAt && this.deletedAt < this.editedAt) {
      throw new Error('Message cannot be deleted before it was edited');
    }
  }

  public editContent(
    newContent: MessageContent,
    editedAt: Date = new Date(),
  ): Message {
    if (this.isDeleted()) {
      throw new Error('Cannot edit deleted message');
    }

    if (this.messageType === MessageType.SYSTEM) {
      throw new Error('Cannot edit system messages');
    }

    if (editedAt < this.createdAt) {
      throw new Error('Edit time cannot be before creation time');
    }

    return new Message(
      this.id,
      this.conversationId,
      this.senderId,
      this.clientMessageId,
      this.sequenceNumber,
      this.messageType,
      newContent,
      editedAt,
      this.deletedAt,
      this.createdAt,
    );
  }

  public markAsDeleted(deletedAt: Date = new Date()): Message {
    if (this.isDeleted()) {
      throw new Error('Message is already deleted');
    }

    if (deletedAt < this.createdAt) {
      throw new Error('Delete time cannot be before creation time');
    }

    if (this.editedAt && deletedAt < this.editedAt) {
      throw new Error('Delete time cannot be before edit time');
    }

    return new Message(
      this.id,
      this.conversationId,
      this.senderId,
      this.clientMessageId,
      this.sequenceNumber,
      this.messageType,
      this.content,
      this.editedAt,
      deletedAt,
      this.createdAt,
    );
  }

  public isEdited(): boolean {
    return this.editedAt !== null;
  }

  public isDeleted(): boolean {
    return this.deletedAt !== null;
  }

  public isSystemMessage(): boolean {
    return this.messageType === MessageType.SYSTEM;
  }

  public hasClientMessageId(): boolean {
    return this.clientMessageId !== null && this.clientMessageId.length > 0;
  }

  public getDisplayContent(): MessageContent {
    if (this.isDeleted()) {
      return new MessageContent({ text: '[Message deleted]' });
    }
    return this.content;
  }

  public getAge(): number {
    return Date.now() - this.createdAt.getTime();
  }

  public isRecentlyCreated(thresholdMs: number = 5 * 60 * 1000): boolean {
    return this.getAge() < thresholdMs;
  }

  public canBeEdited(
    userId: string,
    timeLimit: number = 15 * 60 * 1000,
  ): boolean {
    if (this.isDeleted() || this.isSystemMessage()) {
      return false;
    }

    if (this.senderId !== userId) {
      return false;
    }

    return this.getAge() <= timeLimit;
  }

  public canBeDeleted(userId: string): boolean {
    if (this.isDeleted()) {
      return false;
    }

    return this.senderId === userId;
  }

  public getTimeSinceEdit(): number | null {
    if (!this.editedAt) {
      return null;
    }
    return Date.now() - this.editedAt.getTime();
  }

  public toJSON() {
    return {
      id: this.id,
      conversationId: this.conversationId,
      senderId: this.senderId,
      clientMessageId: this.clientMessageId,
      sequenceNumber: this.sequenceNumber.toString(),
      messageType: this.messageType,
      content: this.content.toJSON(),
      editedAt: this.editedAt,
      deletedAt: this.deletedAt,
      createdAt: this.createdAt,
      isEdited: this.isEdited(),
      isDeleted: this.isDeleted(),
      isRecentlyCreated: this.isRecentlyCreated(),
      age: this.getAge(),
    };
  }
}
