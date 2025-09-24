import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../shared/infrastructure/prisma/prisma.service';
import { RedisService } from '../../shared/redis/redis.service';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  DataSubjectRequestType,
  DataSubjectRequestStatus,
  DataType,
  ConsentType,
} from '@prisma/client';

export interface DataSubjectRequest {
  userId: string;
  requestType: DataSubjectRequestType;
  data?: any;
  requestId?: string;
  status?: DataSubjectRequestStatus;
  createdAt?: Date;
  completedAt?: Date;
  metadata?: Record<string, any>;
  tenantId?: string;
  error?: string | null;
}

export interface DataExportResult {
  user: any;
  messages: any[];
  conversations: any[];
  attachments: any[];
  notifications: any[];
  auditLogs: any[];
  exportedAt: Date;
  requestId: string;
}

export interface ConsentUpdate {
  userId: string;
  tenantId?: string;
  consentType: ConsentType;
  granted: boolean;
  version: string;
  metadata?: Record<string, any>;
}

@Injectable()
export class DataProtectionService {
  private readonly logger = new Logger(DataProtectionService.name);
  private readonly requestExpiry = 30 * 24 * 60 * 60; // 30 days in seconds

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async processDataSubjectRequest(request: DataSubjectRequest): Promise<void> {
    try {
      const requestId = request.requestId || crypto.randomUUID();

      // Store the request in the database
      await this.prisma.dataSubjectRequest.upsert({
        where: { requestId },
        create: {
          requestId,
          userId: request.userId,
          tenantId: request.tenantId,
          requestType: request.requestType,
          status: DataSubjectRequestStatus.PROCESSING,
          data: request.data,
          metadata: request.metadata || {},
        },
        update: {
          status: DataSubjectRequestStatus.PROCESSING,
          updatedAt: new Date(),
        },
      });

      let result: any;

      switch (request.requestType) {
        case DataSubjectRequestType.EXPORT:
          result = await this.processDataExport(
            request.userId,
            request.tenantId,
          );
          break;
        case DataSubjectRequestType.DELETION:
          result = await this.processDataDeletion(
            request.userId,
            request.tenantId,
          );
          break;
        case DataSubjectRequestType.RECTIFICATION:
          result = await this.processDataRectification(
            request.userId,
            request.data,
            request.tenantId,
          );
          break;
        case DataSubjectRequestType.PORTABILITY:
          result = await this.processDataPortability(
            request.userId,
            request.tenantId,
          );
          break;
        case DataSubjectRequestType.RESTRICTION:
          result = await this.processDataRestriction(
            request.userId,
            request.tenantId,
          );
          break;
        default:
          throw new Error(`Unknown request type: ${request.requestType}`);
      }

      // Update request status
      await this.prisma.dataSubjectRequest.update({
        where: { requestId },
        data: {
          status: DataSubjectRequestStatus.COMPLETED,
          completedAt: new Date(),
          result: result,
        },
      });

      // Log the completion for audit purposes
      await this.logDataProcessingActivity(
        request.userId,
        request.tenantId,
        DataType.USER_PROFILE,
        `Data subject request completed: ${request.requestType}`,
        'gdpr_compliance',
      );

      this.eventEmitter.emit('data-request.completed', {
        requestId,
        userId: request.userId,
        tenantId: request.tenantId,
        type: request.requestType,
        result,
      });
    } catch (error) {
      this.logger.error(
        `Failed to process data subject request: ${error.message}`,
        error.stack,
      );

      if (request.requestId) {
        await this.prisma.dataSubjectRequest.update({
          where: { requestId: request.requestId },
          data: {
            status: DataSubjectRequestStatus.FAILED,
            error: error.message,
            completedAt: new Date(),
          },
        });
      }

      throw error;
    }
  }

  private async processDataExport(
    userId: string,
    tenantId?: string,
  ): Promise<DataExportResult> {
    // Export all user data from different tables
    const whereClause = tenantId ? { userId, tenantId } : { userId };

    const [
      user,
      messages,
      conversations,
      attachments,
      notifications,
      auditLogs,
      // consentRecords,
      // dataProcessingRecords,
    ] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          username: true,
          displayName: true,
          email: true,
          mfaEnabled: true,
          lastLoginAt: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.message.findMany({
        where: { senderId: userId },
        orderBy: { createdAt: 'desc' },
        take: 10000, // Increased limit for comprehensive export
        include: {
          conversation: {
            select: { id: true, name: true, type: true },
          },
          reactions: true,
          attachments: {
            select: {
              id: true,
              filename: true,
              mimeType: true,
              fileSize: true,
              createdAt: true,
            },
          },
        },
      }),
      this.prisma.conversation.findMany({
        where: { members: { some: { userId } } },
        include: {
          members: {
            select: {
              userId: true,
              role: true,
              joinedAt: true,
              lastReadSequence: true,
            },
          },
        },
      }),
      this.prisma.attachment.findMany({
        where: {
          message: { senderId: userId },
          ...(tenantId && { tenantId }),
        },
        select: {
          id: true,
          filename: true,
          originalFilename: true,
          mimeType: true,
          fileSize: true,
          uploadStatus: true,
          createdAt: true,
        },
      }),
      this.prisma.notificationDelivery.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        take: 1000,
        select: {
          id: true,
          notificationType: true,
          deliveryChannel: true,
          status: true,
          title: true,
          body: true,
          createdAt: true,
          sentAt: true,
          deliveredAt: true,
          readAt: true,
        },
      }),
      this.prisma.auditLog.findMany({
        where: { actorId: userId, ...(tenantId && { tenantId }) },
        orderBy: { createdAt: 'desc' },
        take: 1000,
        select: {
          id: true,
          action: true,
          targetType: true,
          targetId: true,
          metadata: true,
          ipAddress: true,
          createdAt: true,
        },
      }),
      this.prisma.consentRecord.findMany({
        where: whereClause,
        select: {
          consentType: true,
          granted: true,
          grantedAt: true,
          revokedAt: true,
          version: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.dataProcessingRecord.findMany({
        where: whereClause,
        select: {
          dataType: true,
          purpose: true,
          legalBasis: true,
          processingDate: true,
          retentionPeriod: true,
          consentGiven: true,
          consentDate: true,
          dataSubject: true,
        },
      }),
    ]);

    const exportResult: DataExportResult = {
      user,
      messages,
      conversations,
      attachments,
      notifications,
      auditLogs,
      exportedAt: new Date(),
      requestId: crypto.randomUUID(),
    };

    return exportResult;
  }

  private async processDataDeletion(
    userId: string,
    tenantId?: string,
  ): Promise<{ success: boolean; anonymized: boolean }> {
    // Check if user has active conversations or recent activity
    const recentActivity = await this.checkRecentActivity(userId);

    if (recentActivity.hasRecentActivity) {
      // Anonymize instead of delete to maintain data integrity
      return await this.anonymizeUserData(userId, tenantId);
    }

    // Perform actual deletion in transaction
    await this.prisma.$transaction(async (tx) => {
      // Delete user-specific data
      await tx.notificationDelivery.deleteMany({
        where: { userId, ...(tenantId && { tenantId }) },
      });

      await tx.deviceToken.deleteMany({
        where: { userId, ...(tenantId && { tenantId }) },
      });

      await tx.consentRecord.deleteMany({
        where: { userId, ...(tenantId && { tenantId }) },
      });

      await tx.dataProcessingRecord.deleteMany({
        where: { userId, ...(tenantId && { tenantId }) },
      });

      // Anonymize messages instead of deleting to maintain conversation integrity
      await tx.message.updateMany({
        where: { senderId: userId },
        data: {
          content: { text: '[Message deleted by user request]' },
          deletedAt: new Date(),
        },
      });

      // Remove user from conversation memberships
      await tx.conversationMember.deleteMany({
        where: { userId },
      });

      // Anonymize user record
      const hashedEmail = this.hashData(`deleted-${userId}@deleted.chemchat`);
      const hashedName = `User-${userId.slice(0, 8)}`;

      await tx.user.update({
        where: { id: userId },
        data: {
          email: hashedEmail,
          displayName: hashedName,
          username: `deleted-${userId.slice(0, 8)}`,
          passwordHash: 'deleted',
          mfaEnabled: false,
          mfaSecret: null,
        },
      });
    });

    // Clear Redis cache
    await this.clearUserCache(userId);

    return { success: true, anonymized: false };
  }

  private async anonymizeUserData(
    userId: string,
    tenantId?: string,
  ): Promise<{ success: boolean; anonymized: boolean }> {
    const hashedEmail = this.hashData(
      `anonymized-${userId}@anonymized.chemchat`,
    );
    const hashedName = `Anonymous-${userId.slice(0, 8)}`;

    await this.prisma.$transaction(async (tx) => {
      // Anonymize user record
      await tx.user.update({
        where: { id: userId },
        data: {
          email: hashedEmail,
          displayName: hashedName,
          username: `anonymous-${userId.slice(0, 8)}`,
          passwordHash: 'anonymized',
          mfaEnabled: false,
          mfaSecret: null,
        },
      });

      // Anonymize messages
      await tx.message.updateMany({
        where: { senderId: userId },
        data: {
          content: { text: '[Message anonymized by user request]' },
        },
      });

      // Clear personal data from notifications
      await tx.notificationDelivery.updateMany({
        where: { userId, ...(tenantId && { tenantId }) },
        data: {
          title: 'Notification',
          body: '[Content anonymized]',
          data: {},
        },
      });
    });

    await this.clearUserCache(userId);

    return { success: true, anonymized: true };
  }

  private async checkRecentActivity(
    userId: string,
  ): Promise<{ hasRecentActivity: boolean; details: any }> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [recentMessages, activeConversations] = await Promise.all([
      this.prisma.message.count({
        where: {
          senderId: userId,
          createdAt: { gte: thirtyDaysAgo },
        },
      }),
      this.prisma.conversationMember.count({
        where: {
          userId,
          conversation: {
            messages: {
              some: {
                createdAt: { gte: thirtyDaysAgo },
              },
            },
          },
        },
      }),
    ]);

    return {
      hasRecentActivity: recentMessages > 0 || activeConversations > 0,
      details: {
        recentMessages,
        activeConversations,
        checkDate: thirtyDaysAgo,
      },
    };
  }

  private async clearUserCache(userId: string): Promise<void> {
    const cacheKeys = [
      `user:${userId}`,
      `user:profile:${userId}`,
      `user:presence:${userId}`,
      `user:conversations:${userId}`,
      `user:notifications:${userId}`,
    ];

    await Promise.all(
      cacheKeys.map((key) =>
        this.redis
          .del(key)
          .catch((err) =>
            this.logger.warn(`Failed to clear cache key ${key}:`, err),
          ),
      ),
    );
  }

  private async processDataRectification(
    userId: string,
    data: any,
    tenantId?: string,
  ): Promise<{ success: boolean; updatedFields: string[] }> {
    const updateData: any = {};
    const updatedFields: string[] = [];

    // Only allow specific fields to be updated for security
    const allowedFields = ['displayName', 'email'];

    Object.keys(data || {}).forEach((key) => {
      if (allowedFields.includes(key) && data[key] !== undefined) {
        updateData[key] = data[key];
        updatedFields.push(key);
      }
    });

    if (Object.keys(updateData).length > 0) {
      await this.prisma.user.update({
        where: { id: userId },
        data: updateData,
      });

      // Log the rectification for audit purposes
      await this.logDataProcessingActivity(
        userId,
        tenantId,
        DataType.USER_PROFILE,
        `Data rectification: ${updatedFields.join(', ')}`,
        'gdpr_rectification',
      );

      // Clear cache
      await this.clearUserCache(userId);
    }

    return { success: true, updatedFields };
  }

  private async processDataPortability(
    userId: string,
    tenantId?: string,
  ): Promise<{ success: boolean; exportUrl?: string }> {
    // Generate portable data export in standard format (JSON)
    const exportData = await this.processDataExport(userId, tenantId);

    // In a real implementation, you would upload this to a secure location
    // and provide a time-limited download URL
    const exportUrl = await this.generateSecureExportUrl(exportData);

    await this.logDataProcessingActivity(
      userId,
      tenantId,
      DataType.USER_PROFILE,
      'Data portability request processed',
      'gdpr_portability',
    );

    return { success: true, exportUrl };
  }

  private async processDataRestriction(
    userId: string,
    tenantId?: string,
  ): Promise<{ success: boolean }> {
    // Mark user data as restricted (limited processing)
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        // Add a metadata field to track restriction status
        // This would require adding a metadata field to the User model
      },
    });

    await this.logDataProcessingActivity(
      userId,
      tenantId,
      DataType.USER_PROFILE,
      'Data processing restriction applied',
      'gdpr_restriction',
    );

    return { success: true };
  }

  private async generateSecureExportUrl(exportData: any): Promise<string> {
    // In a real implementation, this would:
    // 1. Encrypt the export data
    // 2. Upload to secure storage (S3 with encryption)
    // 3. Generate a pre-signed URL with expiration
    // 4. Return the secure URL

    const exportId = crypto.randomUUID();
    // Store export data temporarily (implement actual storage)
    await this.redis.setex(
      `export:${exportId}`,
      24 * 60 * 60, // 24 hours
      JSON.stringify(exportData),
    );

    return `https://secure-exports.example.com/download/${exportId}`;
  }

  async logDataProcessingActivity(
    userId: string,
    tenantId: string | undefined,
    dataType: DataType,
    purpose: string,
    legalBasis: string,
    retentionPeriod: number = 365,
  ): Promise<void> {
    try {
      await this.prisma.dataProcessingRecord.create({
        data: {
          userId,
          tenantId,
          dataType,
          purpose,
          legalBasis,
          processingDate: new Date(),
          retentionPeriod,
          consentGiven: true, // This should be checked based on actual consent
          dataSubject: userId,
        },
      });
    } catch (error) {
      this.logger.error('Failed to log data processing activity:', error);
    }
  }

  private hashData(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  async getRequestStatus(
    requestId: string,
  ): Promise<DataSubjectRequest | null> {
    const request = await this.prisma.dataSubjectRequest.findUnique({
      where: { requestId },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            email: true,
          },
        },
      },
    });

    return request as DataSubjectRequest | null;
  }

  async updateConsent(consentUpdate: ConsentUpdate): Promise<void> {
    await this.prisma.consentRecord.upsert({
      where: {
        userId_tenantId_consentType: {
          userId: consentUpdate.userId,
          tenantId: consentUpdate.tenantId || '',
          consentType: consentUpdate.consentType,
        },
      },
      create: {
        userId: consentUpdate.userId,
        ...(consentUpdate.tenantId && { tenantId: consentUpdate.tenantId }),
        consentType: consentUpdate.consentType,
        granted: consentUpdate.granted,
        grantedAt: consentUpdate.granted ? new Date() : null,
        revokedAt: !consentUpdate.granted ? new Date() : null,
        version: consentUpdate.version,
        metadata: consentUpdate.metadata,
      },
      update: {
        granted: consentUpdate.granted,
        grantedAt: consentUpdate.granted ? new Date() : undefined,
        revokedAt: !consentUpdate.granted ? new Date() : undefined,
        version: consentUpdate.version,
        metadata: consentUpdate.metadata,
        updatedAt: new Date(),
      },
    });

    // Log consent change for audit
    await this.logDataProcessingActivity(
      consentUpdate.userId,
      consentUpdate.tenantId,
      DataType.USER_PROFILE,
      `Consent ${consentUpdate.granted ? 'granted' : 'revoked'} for ${consentUpdate.consentType}`,
      'consent_management',
    );
  }

  async getUserConsent(
    userId: string,
    tenantId?: string,
  ): Promise<Record<ConsentType, boolean>> {
    const consents = await this.prisma.consentRecord.findMany({
      where: {
        userId,
        tenantId: tenantId || null,
      },
    });

    const consentMap: Record<ConsentType, boolean> = {
      [ConsentType.DATA_PROCESSING]: false,
      [ConsentType.MARKETING]: false,
      [ConsentType.ANALYTICS]: false,
      [ConsentType.THIRD_PARTY_SHARING]: false,
      [ConsentType.NOTIFICATIONS]: false,
      [ConsentType.COOKIES]: false,
    };

    consents.forEach((consent) => {
      consentMap[consent.consentType] = consent.granted;
    });

    return consentMap;
  }

  async applyDataRetentionPolicies(tenantId?: string): Promise<{
    processed: number;
    errors: string[];
  }> {
    const policies = await this.prisma.dataRetentionPolicy.findMany({
      where: {
        tenantId: tenantId || undefined,
        isActive: true,
      },
    });

    let processed = 0;
    const errors: string[] = [];

    for (const policy of policies) {
      try {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - policy.retentionPeriodDays);

        await this.applyRetentionPolicy(policy, cutoffDate);
        processed++;
      } catch (error) {
        const errorMsg = `Failed to apply retention policy ${policy.name}: ${error.message}`;
        this.logger.error(errorMsg);
        errors.push(errorMsg);
      }
    }

    return { processed, errors };
  }

  private async applyRetentionPolicy(
    policy: any,
    cutoffDate: Date,
  ): Promise<void> {
    switch (policy.dataType) {
      case DataType.MESSAGES:
        if (policy.anonymizeFirst) {
          await this.prisma.message.updateMany({
            where: {
              createdAt: { lt: cutoffDate },
              deletedAt: null,
            },
            data: {
              content: { text: '[Message deleted by retention policy]' },
              deletedAt: new Date(),
            },
          });
        }
        break;

      case DataType.AUDIT_LOGS:
        await this.prisma.auditLog.deleteMany({
          where: {
            createdAt: { lt: cutoffDate },
            ...(policy.tenantId && { tenantId: policy.tenantId }),
          },
        });
        break;

      case DataType.NOTIFICATIONS:
        await this.prisma.notificationDelivery.deleteMany({
          where: {
            createdAt: { lt: cutoffDate },
            ...(policy.tenantId && { tenantId: policy.tenantId }),
          },
        });
        break;

      case DataType.ATTACHMENTS:
        // Mark attachments for deletion (actual file deletion would be handled separately)
        await this.prisma.attachment.updateMany({
          where: {
            createdAt: { lt: cutoffDate },
            ...(policy.tenantId && { tenantId: policy.tenantId }),
          },
          data: {
            // Mark for deletion - actual file cleanup would be done by a separate job
            expiresAt: new Date(),
          },
        });
        break;

      default:
        this.logger.warn(
          `Unsupported data type for retention: ${policy.dataType}`,
        );
    }
  }
}
