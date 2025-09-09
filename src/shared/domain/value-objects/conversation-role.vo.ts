export enum ConversationRole {
  OWNER = 'owner',
  ADMIN = 'admin',
  MEMBER = 'member',
}

export class ConversationRolePermissions {
  private static readonly roleHierarchy = {
    [ConversationRole.OWNER]: 3,
    [ConversationRole.ADMIN]: 2,
    [ConversationRole.MEMBER]: 1,
  };

  private static readonly permissions = {
    // Message permissions
    sendMessage: [
      ConversationRole.OWNER,
      ConversationRole.ADMIN,
      ConversationRole.MEMBER,
    ],
    editOwnMessage: [
      ConversationRole.OWNER,
      ConversationRole.ADMIN,
      ConversationRole.MEMBER,
    ],
    deleteOwnMessage: [
      ConversationRole.OWNER,
      ConversationRole.ADMIN,
      ConversationRole.MEMBER,
    ],
    editAnyMessage: [ConversationRole.OWNER, ConversationRole.ADMIN],
    deleteAnyMessage: [ConversationRole.OWNER, ConversationRole.ADMIN],

    // Member management permissions
    inviteMembers: [ConversationRole.OWNER, ConversationRole.ADMIN],
    removeMembers: [ConversationRole.OWNER, ConversationRole.ADMIN],
    promoteToAdmin: [ConversationRole.OWNER],
    demoteFromAdmin: [ConversationRole.OWNER],
    transferOwnership: [ConversationRole.OWNER],

    // Conversation management permissions
    updateConversationName: [ConversationRole.OWNER, ConversationRole.ADMIN],
    updateConversationSettings: [
      ConversationRole.OWNER,
      ConversationRole.ADMIN,
    ],
    deleteConversation: [ConversationRole.OWNER],

    // Moderation permissions
    muteMembers: [ConversationRole.OWNER, ConversationRole.ADMIN],
    banMembers: [ConversationRole.OWNER, ConversationRole.ADMIN],
    viewAuditLogs: [ConversationRole.OWNER, ConversationRole.ADMIN],

    // Media permissions
    uploadMedia: [
      ConversationRole.OWNER,
      ConversationRole.ADMIN,
      ConversationRole.MEMBER,
    ],
    deleteMedia: [ConversationRole.OWNER, ConversationRole.ADMIN],
  };

  public static hasPermission(
    role: ConversationRole,
    permission: keyof typeof ConversationRolePermissions.permissions,
  ): boolean {
    if (!Object.values(ConversationRole).includes(role)) {
      throw new Error('Invalid conversation role');
    }

    const allowedRoles = this.permissions[permission];
    if (!allowedRoles) {
      throw new Error(`Unknown permission: ${permission}`);
    }

    return allowedRoles.includes(role);
  }

  public static canManage(
    managerRole: ConversationRole,
    targetRole: ConversationRole,
  ): boolean {
    if (
      !Object.values(ConversationRole).includes(managerRole) ||
      !Object.values(ConversationRole).includes(targetRole)
    ) {
      throw new Error('Invalid conversation role');
    }

    const managerLevel = this.roleHierarchy[managerRole];
    const targetLevel = this.roleHierarchy[targetRole];

    return managerLevel > targetLevel;
  }

  public static canPromoteTo(
    promoterRole: ConversationRole,
    targetRole: ConversationRole,
  ): boolean {
    if (
      !Object.values(ConversationRole).includes(promoterRole) ||
      !Object.values(ConversationRole).includes(targetRole)
    ) {
      throw new Error('Invalid conversation role');
    }

    // Only owners can promote to admin
    if (targetRole === ConversationRole.ADMIN) {
      return promoterRole === ConversationRole.OWNER;
    }

    // Only owners can transfer ownership
    if (targetRole === ConversationRole.OWNER) {
      return promoterRole === ConversationRole.OWNER;
    }

    // Admins and owners can promote to member
    if (targetRole === ConversationRole.MEMBER) {
      return (
        promoterRole === ConversationRole.OWNER ||
        promoterRole === ConversationRole.ADMIN
      );
    }

    return false;
  }

  public static canDemoteFrom(
    demoterRole: ConversationRole,
    targetRole: ConversationRole,
  ): boolean {
    if (
      !Object.values(ConversationRole).includes(demoterRole) ||
      !Object.values(ConversationRole).includes(targetRole)
    ) {
      throw new Error('Invalid conversation role');
    }

    // Only owners can demote admins
    if (targetRole === ConversationRole.ADMIN) {
      return demoterRole === ConversationRole.OWNER;
    }

    // Cannot demote owners
    if (targetRole === ConversationRole.OWNER) {
      return false;
    }

    // Admins and owners can demote members (though this doesn't make much sense)
    if (targetRole === ConversationRole.MEMBER) {
      return (
        demoterRole === ConversationRole.OWNER ||
        demoterRole === ConversationRole.ADMIN
      );
    }

    return false;
  }

  public static getAvailablePermissions(role: ConversationRole): string[] {
    if (!Object.values(ConversationRole).includes(role)) {
      throw new Error('Invalid conversation role');
    }

    return Object.entries(this.permissions)
      .filter(([, allowedRoles]) => allowedRoles.includes(role))
      .map(([permission]) => permission);
  }

  public static getRoleDisplayName(role: ConversationRole): string {
    switch (role) {
      case ConversationRole.OWNER:
        return 'Owner';
      case ConversationRole.ADMIN:
        return 'Admin';
      case ConversationRole.MEMBER:
        return 'Member';
      default:
        throw new Error('Invalid conversation role');
    }
  }

  public static getRoleDescription(role: ConversationRole): string {
    switch (role) {
      case ConversationRole.OWNER:
        return 'Full control over the conversation, including member management and settings';
      case ConversationRole.ADMIN:
        return 'Can manage members, moderate messages, and update conversation settings';
      case ConversationRole.MEMBER:
        return 'Can send messages and participate in the conversation';
      default:
        throw new Error('Invalid conversation role');
    }
  }

  public static isValidRole(role: string): role is ConversationRole {
    return Object.values(ConversationRole).includes(role as ConversationRole);
  }

  public static fromString(roleString: string): ConversationRole {
    if (!this.isValidRole(roleString)) {
      throw new Error(`Invalid conversation role: ${roleString}`);
    }
    return roleString;
  }
}
