export interface TenantContext {
  tenantId: string;
  tenantName: string;
  subscriptionTier: SubscriptionTier;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface TenantQuota {
  tenantId: string;
  maxUsers: number;
  maxConversations: number;
  maxMessagesPerDay: number;
  maxStorageBytes: number;
  maxConnectionsPerUser: number;
  maxApiRequestsPerHour: number;
}

export interface TenantUsage {
  tenantId: string;
  currentUsers: number;
  currentConversations: number;
  messagesUsedToday: number;
  storageUsedBytes: number;
  currentConnections: number;
  apiRequestsThisHour: number;
  lastUpdated: Date;
}

export enum SubscriptionTier {
  FREE = 'free',
  BASIC = 'basic',
  PREMIUM = 'premium',
  ENTERPRISE = 'enterprise'
}

export interface TenantSettings {
  tenantId: string;
  allowFileUploads: boolean;
  maxFileSize: number;
  allowedFileTypes: string[];
  retentionDays: number;
  enableNotifications: boolean;
  enableSearch: boolean;
  customBranding: boolean;
  ssoEnabled: boolean;
}

import { Request } from 'express';

export interface TenantRequest extends Request {
  tenant?: TenantContext;
  tenantId?: string;
}
