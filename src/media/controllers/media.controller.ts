import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpStatus,
  HttpCode,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { MediaService } from '../services/media.service';
import { MediaValidationService } from '../services/media-validation.service';
import {
  MediaUploadRequest,
  MediaUploadResponse,
  MediaAttachment,
  MediaFilter,
  MediaSearchResult,
  MediaQuotaInfo,
  MediaCategory,
} from '../interfaces/media.interface';
// TODO: Uncomment when Prisma schema is applied to database
// import {
//   MediaUploadStatus,
//   MediaProcessingStatus,
//   VirusScanStatus,
// } from '@prisma/client';

// Temporary enum definitions until Prisma client is updated
enum MediaUploadStatus {
  PENDING = 'PENDING',
  UPLOADING = 'UPLOADING',
  UPLOADED = 'UPLOADED',
  FAILED = 'FAILED'
}

enum MediaProcessingStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED'
}

enum VirusScanStatus {
  PENDING = 'PENDING',
  SCANNING = 'SCANNING',
  CLEAN = 'CLEAN',
  INFECTED = 'INFECTED',
  FAILED = 'FAILED'
}

@Controller('media')
@UseGuards(JwtAuthGuard)
export class MediaController {
  constructor(
    private readonly mediaService: MediaService,
    private readonly validationService: MediaValidationService,
  ) {}

  @Post('upload/url')
  @HttpCode(HttpStatus.OK)
  async generateUploadUrl(
    @Body() request: MediaUploadRequest,
    @CurrentUser() user: any,
  ): Promise<MediaUploadResponse> {
    // Set user ID from authenticated user
    request.userId = user.id;
    request.tenantId = user.tenantId;

    // Validate the upload request
    await this.validationService.validateUploadRequest(request);

    return await this.mediaService.generateUploadUrl(request);
  }

  @Post('upload/:uploadId/confirm')
  @HttpCode(HttpStatus.CREATED)
  async confirmUpload(
    @Param('uploadId') uploadId: string,
    @Body() options: any = {},
  ): Promise<MediaAttachment> {
    return await this.mediaService.confirmUpload(uploadId, options);
  }

  @Get(':id')
  async getAttachment(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ): Promise<MediaAttachment> {
    const attachment = await this.mediaService.getAttachment(id, user.tenantId);
    
    if (!attachment) {
      throw new NotFoundException('Attachment not found');
    }

    return attachment;
  }

  @Get(':id/download')
  async getDownloadUrl(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Query('expires') expires: string = '3600',
  ): Promise<{ downloadUrl: string; expiresAt: Date }> {
    const expiresIn = parseInt(expires, 10);
    
    if (isNaN(expiresIn) || expiresIn < 60 || expiresIn > 86400) {
      throw new BadRequestException('Expires must be between 60 and 86400 seconds');
    }

    const downloadUrl = await this.mediaService.generateDownloadUrl(
      id,
      user.tenantId,
      expiresIn,
    );

    return {
      downloadUrl,
      expiresAt: new Date(Date.now() + expiresIn * 1000),
    };
  }

  @Get()
  async searchAttachments(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
    @Query('category') category?: MediaCategory,
    @Query('mimeType') mimeType?: string,
    @Query('uploadStatus') uploadStatus?: MediaUploadStatus,
    @Query('processingStatus') processingStatus?: MediaProcessingStatus,
    @Query('virusScanStatus') virusScanStatus?: VirusScanStatus,
    @Query('minFileSize') minFileSize?: string,
    @Query('maxFileSize') maxFileSize?: string,
    @Query('uploadedAfter') uploadedAfter?: string,
    @Query('uploadedBefore') uploadedBefore?: string,
    @Query('userId') userId?: string,
    @Query('messageId') messageId?: string,
    @CurrentUser() user?: any,
  ): Promise<MediaSearchResult> {
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);

    if (isNaN(pageNum) || pageNum < 1) {
      throw new BadRequestException('Page must be a positive integer');
    }

    if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
      throw new BadRequestException('Limit must be between 1 and 100');
    }

    const filter: MediaFilter = {
      tenantId: user.tenantId,
      ...(category && { category }),
      ...(mimeType && { mimeType }),
      ...(uploadStatus && { uploadStatus }),
      ...(processingStatus && { processingStatus }),
      ...(virusScanStatus && { virusScanStatus }),
      ...(minFileSize && { minFileSize: parseInt(minFileSize, 10) }),
      ...(maxFileSize && { maxFileSize: parseInt(maxFileSize, 10) }),
      ...(uploadedAfter && { uploadedAfter: new Date(uploadedAfter) }),
      ...(uploadedBefore && { uploadedBefore: new Date(uploadedBefore) }),
      ...(userId && { userId }),
      ...(messageId && { messageId }),
    };

    return await this.mediaService.searchAttachments(filter, pageNum, limitNum);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAttachment(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ): Promise<void> {
    // Verify attachment exists and user has permission
    const attachment = await this.mediaService.getAttachment(id, user.tenantId);
    
    if (!attachment) {
      throw new NotFoundException('Attachment not found');
    }

    // Only allow deletion by the uploader or admin
    if (attachment.uploadedBy !== user.id && !user.roles?.includes('admin')) {
      throw new BadRequestException('You can only delete your own attachments');
    }

    await this.mediaService.deleteAttachment(id, user.tenantId);
  }

  @Get('quota/info')
  async getQuotaInfo(@CurrentUser() user: any): Promise<MediaQuotaInfo> {
    if (!user.tenantId) {
      throw new BadRequestException('Tenant ID is required');
    }

    return await this.mediaService.getQuotaInfo(user.tenantId);
  }

  @Get('stats/summary')
  async getMediaStats(
    @Query('period') period: string = '30d',
    @CurrentUser() user: any,
  ): Promise<any> {
    // Calculate date range based on period
    const now = new Date();
    let startDate: Date;

    switch (period) {
      case '24h':
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      default:
        throw new BadRequestException('Invalid period. Use: 24h, 7d, 30d, or 90d');
    }

    const filter: MediaFilter = {
      tenantId: user.tenantId,
      uploadedAfter: startDate,
    };

    const result = await this.mediaService.searchAttachments(filter, 1, 1000);
    
    // Calculate statistics
    const stats = {
      totalFiles: result.total,
      totalSize: result.attachments.reduce((sum, att) => sum + att.fileSize, 0),
      byCategory: {} as Record<string, number>,
      byStatus: {
        uploaded: 0,
        processing: 0,
        completed: 0,
        failed: 0,
      },
      byVirusScan: {
        clean: 0,
        infected: 0,
        pending: 0,
        failed: 0,
      },
      period,
      startDate,
      endDate: now,
    };

    // Calculate category breakdown
    for (const attachment of result.attachments) {
      const category = this.validationService.getMediaCategory(attachment.mimeType);
      stats.byCategory[category] = (stats.byCategory[category] || 0) + 1;

      // Status breakdown
      switch (attachment.processingStatus) {
        case MediaProcessingStatus.PENDING:
          stats.byStatus.processing++;
          break;
        case MediaProcessingStatus.PROCESSING:
          stats.byStatus.processing++;
          break;
        case MediaProcessingStatus.COMPLETED:
          stats.byStatus.completed++;
          break;
        case MediaProcessingStatus.FAILED:
          stats.byStatus.failed++;
          break;
      }

      // Virus scan breakdown
      switch (attachment.virusScanStatus) {
        case VirusScanStatus.CLEAN:
          stats.byVirusScan.clean++;
          break;
        case VirusScanStatus.INFECTED:
          stats.byVirusScan.infected++;
          break;
        case VirusScanStatus.PENDING:
        case VirusScanStatus.SCANNING:
          stats.byVirusScan.pending++;
          break;
        case VirusScanStatus.FAILED:
          stats.byVirusScan.failed++;
          break;
      }
    }

    return stats;
  }

  @Post('validate')
  @HttpCode(HttpStatus.OK)
  async validateFile(
    @Body() request: MediaUploadRequest,
    @CurrentUser() user: any,
  ): Promise<{ valid: boolean; errors?: string[] }> {
    try {
      request.userId = user.id;
      request.tenantId = user.tenantId;
      
      await this.validationService.validateUploadRequest(request);
      
      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        errors: [error.message],
      };
    }
  }

  @Get('categories/allowed')
  async getAllowedCategories(): Promise<{
    categories: MediaCategory[];
    mimeTypes: Record<MediaCategory, string[]>;
    maxFileSize: number;
  }> {
    return {
      categories: Object.values(MediaCategory),
      mimeTypes: {
        [MediaCategory.IMAGE]: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
        [MediaCategory.VIDEO]: ['video/mp4', 'video/avi', 'video/mov', 'video/webm'],
        [MediaCategory.AUDIO]: ['audio/mp3', 'audio/wav', 'audio/ogg', 'audio/m4a'],
        [MediaCategory.DOCUMENT]: ['application/pdf', 'application/msword'],
        [MediaCategory.ARCHIVE]: ['application/zip', 'application/x-rar-compressed'],
        [MediaCategory.OTHER]: [],
      },
      maxFileSize: parseInt(process.env.MEDIA_MAX_FILE_SIZE || '104857600', 10),
    };
  }
}
