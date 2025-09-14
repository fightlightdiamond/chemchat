// Local enum definitions for admin module until Prisma client is regenerated
export enum AdminRoleType {
  SUPER_ADMIN = 'super_admin',
  TENANT_ADMIN = 'tenant_admin',
  MODERATOR = 'moderator',
  SUPPORT = 'support'
}

export enum ModerationTargetType {
  USER = 'user',
  MESSAGE = 'message',
  CONVERSATION = 'conversation',
  ATTACHMENT = 'attachment'
}

export enum ModerationActionType {
  WARN = 'warn',
  MUTE = 'mute',
  KICK = 'kick',
  BAN = 'ban',
  DELETE = 'delete',
  EDIT = 'edit',
  QUARANTINE = 'quarantine',
  RESTORE = 'restore'
}

export enum ReportType {
  SPAM = 'spam',
  HARASSMENT = 'harassment',
  HATE_SPEECH = 'hate_speech',
  VIOLENCE = 'violence',
  INAPPROPRIATE_CONTENT = 'inappropriate_content',
  COPYRIGHT = 'copyright',
  IMPERSONATION = 'impersonation',
  OTHER = 'other'
}

export enum ReportStatus {
  PENDING = 'pending',
  INVESTIGATING = 'investigating',
  RESOLVED = 'resolved',
  DISMISSED = 'dismissed',
  ESCALATED = 'escalated'
}

export enum ReportPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent'
}

export enum AutoModerationRuleType {
  SPAM_DETECTION = 'spam_detection',
  PROFANITY_FILTER = 'profanity_filter',
  RATE_LIMITING = 'rate_limiting',
  CONTENT_SIMILARITY = 'content_similarity',
  LINK_FILTER = 'link_filter',
  CAPS_FILTER = 'caps_filter',
  MENTION_SPAM = 'mention_spam',
  IMAGE_MODERATION = 'image_moderation'
}

export enum RuleSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export enum ReviewStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  ESCALATED = 'escalated'
}

export enum BanType {
  TEMPORARY = 'temporary',
  PERMANENT = 'permanent',
  SHADOW = 'shadow'
}
