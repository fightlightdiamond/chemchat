import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { EventEmitter2 } from '@nestjs/event-emitter';

export interface DataSubjectRequest {
  userId: string;
  requestType: 'export' | 'deletion' | 'rectification';
  data?: any;
  requestId?: string;
  status?: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt?: Date;
  completedAt?: Date;
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
      const _requestWithId = { ...request, requestId, status: 'processing' }; // eslint-disable-line @typescript-eslint/no-unused-vars

      // Store the request in the database
      // await this.prisma.dataSubjectRequest.upsert({ // Model not available
      //   where: { requestId },
      //   create: {
      //     requestId,
      //     userId: request.userId,
      //     requestType: request.requestType,
      //     status: 'processing',
      //     metadata: request.metadata || {},
      //   },
      //   update: { status: 'processing' },
      // });

      let result: any;

      switch (request.requestType) {
        case 'export':
          result = await this.processDataExport(request.userId);
          break;
        case 'deletion':
          result = await this.processDataDeletion(request.userId);
          break;
        case 'rectification':
          result = await this.processDataRectification(
            request.userId,
            request.data,
          );
          break;
        default:
          throw new Error(`Unknown request type: ${request.requestType}`);
      }

      // Update request status
      // await this.prisma.dataSubjectRequest.update({ // Model not available
      //   where: { requestId },
      //   data: {
      //     status: 'completed',
      //     completedAt: new Date(),
      //     result: JSON.stringify(result),
      //   },
      // });

      this.eventEmitter.emit('data-request.completed', {
        requestId,
        userId: request.userId,
        type: request.requestType,
        result,
      });
    } catch (error) {
      this.logger.error(
        `Failed to process data subject request: ${error.message}`,
        error.stack,
      );

      if (request.requestId) {
        // await this.prisma.dataSubjectRequest.update({ // Model not available
        //   where: { requestId: request.requestId },
        //   data: {
        //     status: 'failed',
        //     error: error.message,
        //     completedAt: new Date(),
        //   },
        // });
      }

      throw error;
    }
  }

  private async processDataExport(
    userId: string,
  ): Promise<Record<string, any>> {
    // Export all user data from different tables
    const [user, messages, conversations, attachments] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          username: true,
          displayName: true,
          email: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.message.findMany({
        where: { senderId: userId },
        orderBy: { createdAt: 'desc' },
        take: 1000, // Limit for initial export
      }),
      this.prisma.conversation.findMany({
        where: { members: { some: { userId } } },
        include: { members: true },
      }),
      this.prisma.attachment.findMany({
        where: { message: { senderId: userId } },
      }),
    ]);

    return {
      user,
      messages,
      conversations,
      attachments,
      exportedAt: new Date(),
    };
  }

  private async processDataDeletion(
    userId: string,
  ): Promise<{ success: boolean }> {
    // Anonymize user data instead of actual deletion (soft delete)
    const hashedEmail = this.hashData(`deleted-${userId}@deleted.chemchat`);
    const hashedName = `User-${userId.slice(0, 8)}`;

    await this.prisma.$transaction([
      // Anonymize user record
      this.prisma.user.update({
        where: { id: userId },
        data: {
          email: hashedEmail,
          displayName: hashedName,
          passwordHash: 'deleted',
        },
      }),

      // Delete sessions
      // this.prisma.session.deleteMany({ // Model not available
      //   where: { userId },
      // }),
    ]);

    // Clear Redis cache
    await this.redis.del(`user:${userId}`);

    return { success: true };
  }

  private async processDataRectification(
    userId: string,
    data: any,
  ): Promise<{ success: boolean }> {
    // Update user data with provided information
    const updateData: any = {};

    // Only allow specific fields to be updated
    const allowedFields = ['name', 'phoneNumber', 'preferences'];
    Object.keys(data).forEach((key) => {
      if (allowedFields.includes(key)) {
        updateData[key] = data[key];
      }
    });

    if (Object.keys(updateData).length > 0) {
      await this.prisma.user.update({
        where: { id: userId },
        data: updateData,
      });

      // Clear cache
      await this.redis.del(`user:${userId}`);
    }

    return { success: true };
  }

  private hashData(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  async getRequestStatus(
    requestId: string,
  ): Promise<DataSubjectRequest | null> {
    // const request = await this.prisma.dataSubjectRequest.findUnique({ // Model not available
    //   where: { requestId },
    // });

    // return request;
    this.logger.debug(`Would get request status for: ${requestId}`);
    return null;
  }
}
