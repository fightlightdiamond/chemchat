export enum ConversationType {
  DM = 'dm',
  GROUP = 'group',
}

export class ConversationTypeValidator {
  public static isValidType(type: string): type is ConversationType {
    return Object.values(ConversationType).includes(type as ConversationType);
  }

  public static fromString(typeString: string): ConversationType {
    if (!this.isValidType(typeString)) {
      throw new Error(`Invalid conversation type: ${typeString}`);
    }
    return typeString;
  }

  public static getDisplayName(type: ConversationType): string {
    switch (type) {
      case ConversationType.DM:
        return 'Direct Message';
      case ConversationType.GROUP:
        return 'Group Conversation';
      default:
        throw new Error('Invalid conversation type');
    }
  }

  public static getDescription(type: ConversationType): string {
    switch (type) {
      case ConversationType.DM:
        return 'Private conversation between two users';
      case ConversationType.GROUP:
        return 'Group conversation with multiple participants';
      default:
        throw new Error('Invalid conversation type');
    }
  }

  public static getMaxMembers(type: ConversationType): number {
    switch (type) {
      case ConversationType.DM:
        return 2;
      case ConversationType.GROUP:
        return 1000; // Configurable limit for group conversations
      default:
        throw new Error('Invalid conversation type');
    }
  }

  public static requiresName(type: ConversationType): boolean {
    return type === ConversationType.GROUP;
  }

  public static requiresOwner(type: ConversationType): boolean {
    return type === ConversationType.GROUP;
  }

  public static allowsInvites(type: ConversationType): boolean {
    return type === ConversationType.GROUP;
  }

  public static allowsRoleManagement(type: ConversationType): boolean {
    return type === ConversationType.GROUP;
  }

  public static getDefaultMemberLimit(type: ConversationType): number {
    switch (type) {
      case ConversationType.DM:
        return 2;
      case ConversationType.GROUP:
        return 100; // Default limit, can be increased
      default:
        throw new Error('Invalid conversation type');
    }
  }
}
