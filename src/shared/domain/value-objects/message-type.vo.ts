export enum MessageType {
  TEXT = 'text',
  IMAGE = 'image',
  FILE = 'file',
  SYSTEM = 'system',
}

export class MessageTypeValidator {
  private static readonly allowedMimeTypes: Partial<
    Record<MessageType, string[]>
  > = {
    [MessageType.IMAGE]: [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'image/svg+xml',
    ],
    [MessageType.FILE]: [
      // Documents
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain',
      'text/csv',
      'application/json',
      'application/xml',

      // Archives
      'application/zip',
      'application/x-rar-compressed',
      'application/x-7z-compressed',
      'application/gzip',
      'application/x-tar',

      // Audio
      'audio/mpeg',
      'audio/wav',
      'audio/ogg',
      'audio/mp4',
      'audio/webm',

      // Video
      'video/mp4',
      'video/webm',
      'video/ogg',
      'video/quicktime',
      'video/x-msvideo',
    ],
  };

  private static readonly maxFileSizes = {
    [MessageType.TEXT]: 0, // No file attachments for text messages
    [MessageType.IMAGE]: 10 * 1024 * 1024, // 10MB for images
    [MessageType.FILE]: 100 * 1024 * 1024, // 100MB for files
    [MessageType.SYSTEM]: 0, // No file attachments for system messages
  };

  public static isValidType(type: string): type is MessageType {
    return (Object.values(MessageType) as string[]).includes(type);
  }

  public static fromString(typeString: string): MessageType {
    if (!this.isValidType(typeString)) {
      throw new Error(`Invalid message type: ${typeString}`);
    }
    return typeString;
  }

  public static getDisplayName(type: MessageType): string {
    switch (type) {
      case MessageType.TEXT:
        return 'Text Message';
      case MessageType.IMAGE:
        return 'Image';
      case MessageType.FILE:
        return 'File';
      case MessageType.SYSTEM:
        return 'System Message';
      default:
        throw new Error('Invalid message type');
    }
  }

  public static getDescription(type: MessageType): string {
    switch (type) {
      case MessageType.TEXT:
        return 'Plain text message with optional formatting';
      case MessageType.IMAGE:
        return 'Image file with optional caption';
      case MessageType.FILE:
        return 'File attachment with metadata';
      case MessageType.SYSTEM:
        return 'System-generated message for events and notifications';
      default:
        throw new Error('Invalid message type');
    }
  }

  public static requiresContent(type: MessageType): boolean {
    // All message types require some form of content
    switch (type) {
      case MessageType.TEXT:
        return true; // Text messages must have text content
      case MessageType.IMAGE:
        return true; // Image messages must have image attachment
      case MessageType.FILE:
        return true; // File messages must have file attachment
      case MessageType.SYSTEM:
        return true; // System messages must have system-generated content
      default:
        return true;
    }
  }

  public static allowsEditing(type: MessageType): boolean {
    // System messages cannot be edited
    return type !== MessageType.SYSTEM;
  }

  public static allowsDeletion(type: MessageType): boolean {
    // System messages cannot be deleted by users
    return type !== MessageType.SYSTEM;
  }

  public static allowsReactions(type: MessageType): boolean {
    // Most message types allow reactions, but we can customize per type
    switch (type) {
      case MessageType.TEXT:
      case MessageType.IMAGE:
      case MessageType.FILE:
        return true; // User messages allow reactions
      case MessageType.SYSTEM:
        return false; // System messages typically don't allow reactions
      default:
        return true;
    }
  }

  public static getMaxFileSize(type: MessageType): number {
    return this.maxFileSizes[type] ?? 0;
  }

  public static getAllowedMimeTypes(type: MessageType): string[] {
    return this.allowedMimeTypes[type] ?? [];
  }

  public static isValidMimeType(type: MessageType, mimeType: string): boolean {
    const allowedTypes = this.getAllowedMimeTypes(type);
    return allowedTypes.length === 0 || allowedTypes.includes(mimeType);
  }

  public static validateFileSize(type: MessageType, fileSize: number): boolean {
    const maxSize = this.getMaxFileSize(type);
    return maxSize === 0 || fileSize <= maxSize;
  }

  public static getFileTypeFromMimeType(mimeType: string): MessageType | null {
    for (const [type, mimeTypes] of Object.entries(this.allowedMimeTypes)) {
      if (mimeTypes && mimeTypes.includes(mimeType)) {
        return type as MessageType;
      }
    }
    return null;
  }

  public static isImageType(mimeType: string): boolean {
    return (
      this.allowedMimeTypes[MessageType.IMAGE]?.includes(mimeType) ?? false
    );
  }

  public static isVideoType(mimeType: string): boolean {
    return (
      mimeType.startsWith('video/') &&
      (this.allowedMimeTypes[MessageType.FILE]?.includes(mimeType) ?? false)
    );
  }

  public static isAudioType(mimeType: string): boolean {
    return (
      mimeType.startsWith('audio/') &&
      (this.allowedMimeTypes[MessageType.FILE]?.includes(mimeType) ?? false)
    );
  }

  public static isDocumentType(mimeType: string): boolean {
    const documentTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain',
      'text/csv',
      'application/json',
      'application/xml',
    ];
    return documentTypes.includes(mimeType);
  }

  public static requiresThumbnail(
    type: MessageType,
    mimeType: string,
  ): boolean {
    return type === MessageType.IMAGE || this.isVideoType(mimeType);
  }

  public static getIconName(type: MessageType, mimeType?: string): string {
    switch (type) {
      case MessageType.TEXT:
        return 'message-text';
      case MessageType.IMAGE:
        return 'image';
      case MessageType.SYSTEM:
        return 'info-circle';
      case MessageType.FILE:
        if (!mimeType) return 'file';
        if (this.isVideoType(mimeType)) return 'video';
        if (this.isAudioType(mimeType)) return 'audio';
        if (this.isDocumentType(mimeType)) return 'file-text';
        return 'file';
      default:
        return 'message';
    }
  }
}
