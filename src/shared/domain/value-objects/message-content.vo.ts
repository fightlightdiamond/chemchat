export interface MessageContentData {
  text?: string;
  attachments?: Array<{
    id: string;
    filename: string;
    mimeType: string;
    fileSize: number;
    storageUrl: string;
    thumbnailUrl?: string;
  }>;
  metadata?: Record<string, any>;
}

export class MessageContent {
  private readonly data: MessageContentData;

  constructor(data: MessageContentData) {
    this.validateContent(data);
    this.data = { ...data };
  }

  private validateContent(data: MessageContentData): void {
    if (!data) {
      throw new Error('Message content data is required');
    }

    // At least text or attachments must be present
    if (!data.text && (!data.attachments || data.attachments.length === 0)) {
      throw new Error('Message must have either text content or attachments');
    }

    // Validate text content
    if (data.text !== undefined) {
      if (typeof data.text !== 'string') {
        throw new Error('Text content must be a string');
      }

      if (data.text.length > 4000) {
        throw new Error('Text content must not exceed 4000 characters');
      }
    }

    // Validate attachments
    if (data.attachments) {
      if (!Array.isArray(data.attachments)) {
        throw new Error('Attachments must be an array');
      }

      if (data.attachments.length > 10) {
        throw new Error('Maximum 10 attachments allowed per message');
      }

      data.attachments.forEach((attachment, index) => {
        this.validateAttachment(attachment, index);
      });
    }

    // Validate metadata
    if (data.metadata && typeof data.metadata !== 'object') {
      throw new Error('Metadata must be an object');
    }
  }

  private validateAttachment(attachment: unknown, index: number): void {
    if (!attachment || typeof attachment !== 'object') {
      throw new Error(`Attachment at index ${index} must be an object`);
    }

    const obj = attachment as Record<string, unknown>;

    if (!obj.id || typeof obj.id !== 'string') {
      throw new Error(`Attachment at index ${index} must have a valid ID`);
    }

    if (!obj.filename || typeof obj.filename !== 'string') {
      throw new Error(
        `Attachment at index ${index} must have a valid filename`,
      );
    }

    if (obj.filename.length > 255) {
      throw new Error(
        `Attachment filename at index ${index} must not exceed 255 characters`,
      );
    }

    if (!obj.mimeType || typeof obj.mimeType !== 'string') {
      throw new Error(
        `Attachment at index ${index} must have a valid MIME type`,
      );
    }

    if (
      !obj.fileSize ||
      typeof obj.fileSize !== 'number' ||
      obj.fileSize <= 0
    ) {
      throw new Error(
        `Attachment at index ${index} must have a valid file size`,
      );
    }

    // 100MB limit per attachment
    if (obj.fileSize > 100 * 1024 * 1024) {
      throw new Error(
        `Attachment at index ${index} exceeds maximum file size (100MB)`,
      );
    }

    if (!obj.storageUrl || typeof obj.storageUrl !== 'string') {
      throw new Error(
        `Attachment at index ${index} must have a valid storage URL`,
      );
    }

    // Optional thumbnail URL validation
    if (obj.thumbnailUrl && typeof obj.thumbnailUrl !== 'string') {
      throw new Error(
        `Attachment at index ${index} thumbnail URL must be a string`,
      );
    }
  }

  public getText(): string | undefined {
    return this.data.text;
  }

  public getAttachments(): MessageContentData['attachments'] {
    return this.data.attachments ? [...this.data.attachments] : undefined;
  }

  public getMetadata(): Record<string, any> | undefined {
    return this.data.metadata ? { ...this.data.metadata } : undefined;
  }

  public hasText(): boolean {
    return this.data.text !== undefined && this.data.text.length > 0;
  }

  public hasAttachments(): boolean {
    return (
      this.data.attachments !== undefined && this.data.attachments.length > 0
    );
  }

  public getAttachmentCount(): number {
    return this.data.attachments ? this.data.attachments.length : 0;
  }

  public getTotalAttachmentSize(): number {
    if (!this.data.attachments) {
      return 0;
    }

    return this.data.attachments.reduce(
      (total, attachment) => total + attachment.fileSize,
      0,
    );
  }

  public getPlainTextPreview(maxLength: number = 100): string {
    if (!this.hasText()) {
      if (this.hasAttachments()) {
        const count = this.getAttachmentCount();
        return `[${count} attachment${count > 1 ? 's' : ''}]`;
      }
      return '[No content]';
    }

    const text = this.data.text!;
    if (text.length <= maxLength) {
      return text;
    }

    return text.substring(0, maxLength - 3) + '...';
  }

  public withUpdatedText(newText: string): MessageContent {
    return new MessageContent({
      ...this.data,
      text: newText,
    });
  }

  public withAddedAttachment(
    attachment: NonNullable<MessageContentData['attachments']>[0],
  ): MessageContent {
    const currentAttachments = this.data.attachments || [];

    if (currentAttachments.length >= 10) {
      throw new Error('Maximum 10 attachments allowed per message');
    }

    return new MessageContent({
      ...this.data,
      attachments: [...currentAttachments, attachment],
    });
  }

  public withMetadata(metadata: Record<string, any>): MessageContent {
    return new MessageContent({
      ...this.data,
      metadata: { ...metadata },
    });
  }

  public toJSON(): MessageContentData {
    return {
      text: this.data.text,
      attachments: this.data.attachments
        ? [...this.data.attachments]
        : undefined,
      metadata: this.data.metadata ? { ...this.data.metadata } : undefined,
    };
  }

  public equals(other: MessageContent): boolean {
    return JSON.stringify(this.toJSON()) === JSON.stringify(other.toJSON());
  }
}
