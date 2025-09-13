import { NotificationType, NotificationChannel, NotificationStatus, DevicePlatform } from '@prisma/client';

export interface NotificationPayload {
  userId: string;
  tenantId?: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, any>;
  channels?: NotificationChannel[];
  scheduledAt?: Date;
  priority?: NotificationPriority;
}

export interface PushNotificationPayload {
  deviceTokens: string[];
  title: string;
  body: string;
  data?: Record<string, any>;
  badge?: number;
  sound?: string;
  priority?: 'high' | 'normal';
  ttl?: number;
}

export interface EmailNotificationPayload {
  to: string;
  subject: string;
  html: string;
  text?: string;
  templateId?: string;
  templateData?: Record<string, any>;
}

export interface NotificationTemplate {
  id: string;
  name: string;
  type: NotificationType;
  channel: NotificationChannel;
  subject?: string;
  title: string;
  body: string;
  variables?: Record<string, any>;
}

export interface NotificationPreferences {
  userId: string;
  tenantId?: string;
  pushEnabled: boolean;
  emailEnabled: boolean;
  mentionNotifications: boolean;
  dmNotifications: boolean;
  groupNotifications: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart?: string;
  quietHoursEnd?: string;
  timezone: string;
}

export interface DeviceTokenInfo {
  userId: string;
  tenantId?: string;
  deviceId: string;
  token: string;
  platform: DevicePlatform;
  appVersion?: string;
}

export interface NotificationDeliveryResult {
  id: string;
  status: NotificationStatus;
  externalId?: string;
  errorMessage?: string;
  deliveredAt?: Date;
}

export enum NotificationPriority {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high',
  URGENT = 'urgent'
}

export interface NotificationFilter {
  userId?: string;
  tenantId?: string;
  type?: NotificationType;
  status?: NotificationStatus;
  channel?: NotificationChannel;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

export interface NotificationStats {
  totalSent: number;
  totalDelivered: number;
  totalFailed: number;
  deliveryRate: number;
  averageDeliveryTime: number;
  byChannel: Record<NotificationChannel, {
    sent: number;
    delivered: number;
    failed: number;
  }>;
}
