import { Injectable, Logger, BadRequestException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PrismaService } from '../../shared/infrastructure/prisma/prisma.service';
import { RedisService } from '../../shared/redis/redis.service';
import { 
  MediaUploadRequest, 
  MediaUploadResponse, 
  MediaAttachment, 
  MediaFilter, 
  MediaSearchResult,
  MediaStorageConfig,
  MediaValidationRule,
  MediaUploadOptions,
  MediaCategory,
  MediaQuotaInfo,
} from '../interfaces/media.interface';

// Temporary interface until added to media.interface.ts
interface CreateAttachmentOptions {
  tenantId?: string;
  uploaderId?: string;
}
import { 
  Attachment, 
} from '@prisma/client';

// Temporary enum definitions until Prisma client is updated
// eslint-disable-next-line @typescript-eslint/no-unused-vars
enum MediaUploadStatus {
  PENDING = 'PENDING',
  UPLOADING = 'UPLOADING', 
  UPLOADED = 'UPLOADED',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
enum MediaProcessingStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED', 
  FAILED = 'FAILED',
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
enum VirusScanStatus {
  PENDING = 'PENDING',
  SCANNING = 'SCANNING',
  CLEAN = 'CLEAN',
  INFECTED = 'INFECTED',
  FAILED = 'FAILED',
}

import * as crypto from 'crypto';
import * as path from 'path';
import * as mime from 'mime-types';

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);
  private readonly s3Client: S3Client;
  private readonly storageConfig: MediaStorageConfig;
  private readonly validationRules: MediaValidationRule;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {
    this.storageConfig = {
      provider: this.config.get('MEDIA_STORAGE_PROVIDER', 'aws-s3') as any,
      bucket: this.config.get('MEDIA_STORAGE_BUCKET', 'chemchat-media'),
      region: this.config.get('MEDIA_STORAGE_REGION', 'us-east-1'),
      endpoint: this.config.get('MEDIA_STORAGE_ENDPOINT'),
      accessKeyId: this.config.get('MEDIA_STORAGE_ACCESS_KEY'),
      secretAccessKey: this.config.get('MEDIA_STORAGE_SECRET_KEY'),
      cdnUrl: this.config.get('MEDIA_CDN_URL'),
      signedUrlExpiry: parseInt(this.config.get('MEDIA_SIGNED_URL_EXPIRY', '3600'), 10),
    };

    this.validationRules = {
      maxFileSize: parseInt(this.config.get('MEDIA_MAX_FILE_SIZE', '104857600'), 10), // 100MB
      allowedMimeTypes: this.config.get('MEDIA_ALLOWED_MIME_TYPES', 'image/*,video/*,audio/*,application/pdf').split(','),
      allowedExtensions: this.config.get('MEDIA_ALLOWED_EXTENSIONS', '.jpg,.jpeg,.png,.gif,.webp,.mp4,.mov,.avi,.mp3,.wav,.pdf').split(','),
      requireVirusScan: this.config.get('MEDIA_REQUIRE_VIRUS_SCAN', 'true') === 'true',
      requireContentModeration: this.config.get('MEDIA_REQUIRE_CONTENT_MODERATION', 'true') === 'true',
      autoGenerateThumbnails: this.config.get('MEDIA_AUTO_GENERATE_THUMBNAILS', 'true') === 'true',
      stripExifData: this.config.get('MEDIA_STRIP_EXIF', 'true') === 'true',
    };

    this.s3Client = new S3Client({
      region: this.storageConfig.region,
      endpoint: this.storageConfig.endpoint,
      credentials: this.storageConfig.accessKeyId ? {
        accessKeyId: this.storageConfig.accessKeyId,
        secretAccessKey: this.storageConfig.secretAccessKey!,
      } : undefined,
      forcePathStyle: this.storageConfig.provider === 'minio',
    });
  }

  async generateUploadUrl(request: MediaUploadRequest): Promise<MediaUploadResponse> {
    this.logger.log(`Generating upload URL for file: ${request.filename}`);

    // Validate request
    await this.validateUploadRequest(request);

    // Check quota
    if (request.tenantId) {
      await this.checkQuota(request.tenantId, request.fileSize);
    }

    // Generate unique filename
    const fileExtension = path.extname(request.filename);
    const baseName = path.basename(request.filename, fileExtension);
    const timestamp = Date.now();
    const randomId = crypto.randomBytes(8).toString('hex');
    const uniqueFilename = `${baseName}_${timestamp}_${randomId}${fileExtension}`;

    // Generate storage key
    const storageKey = this.generateStorageKey(request.tenantId, request.userId, uniqueFilename);

    // Generate upload ID
    const uploadId = crypto.randomUUID();

    // Create pre-signed URL
    const command = new PutObjectCommand({
      Bucket: this.storageConfig.bucket,
      Key: storageKey,
      ContentType: request.mimeType,
      ContentLength: request.fileSize,
      Metadata: {
        'original-filename': request.filename,
        'upload-id': uploadId,
        'user-id': request.userId,
        'tenant-id': request.tenantId || 'default',
        'message-id': request.messageId || '',
      },
    });

    const expiresIn = request.expiresIn || this.storageConfig.signedUrlExpiry;
    const uploadUrl = await getSignedUrl(this.s3Client, command, { expiresIn });
    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    // Store upload metadata in Redis
    const uploadMetadata = {
      uploadId,
      filename: uniqueFilename,
      originalFilename: request.filename,
      mimeType: request.mimeType,
      fileSize: request.fileSize,
      storageKey,
      messageId: request.messageId,
      tenantId: request.tenantId,
      userId: request.userId,
      expiresAt: expiresAt.toISOString(),
    };

    await (this.redis as any).setex(
      `media:upload:${uploadId}`,
      expiresIn,
      JSON.stringify(uploadMetadata)
    );

    return {
      uploadId,
      uploadUrl,
      expiresAt,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async confirmUpload(uploadId: string, _options?: MediaUploadOptions): Promise<MediaAttachment> {
     
    this.logger.log(`Confirming upload: ${uploadId}`);

    // Get upload metadata from Redis
    const metadataJson = await this.redis.get(`media:upload:${uploadId}`);
    if (!metadataJson) {
      throw new BadRequestException('Upload not found or expired');
    }

    const metadata = JSON.parse(metadataJson);

    // Verify file exists in storage
    const fileExists = await this.verifyFileExists(metadata.storageKey);
    if (!fileExists) {
      throw new BadRequestException('File not found in storage');
    }

    // Generate file hash
    const fileHash = await this.generateFileHash(metadata.storageKey);

    // Check for duplicate files
    const existingFile = await this.findByHash(fileHash, metadata.tenantId);
    if (existingFile) {
      this.logger.log(`Duplicate file detected: ${fileHash}`);
      // Delete the new upload and return existing file
      await this.deleteFromStorage(metadata.storageKey);
      return this.mapAttachmentToInterface(existingFile);
    }

    // Create attachment record
    const storageUrl = this.generateStorageUrl(metadata.storageKey);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const cdnUrl = this.getCDNUrl(storageUrl);

    const attachment = await this.prisma.attachment.create({
      data: {
        messageId: metadata.messageId,
        filename: metadata.filename,
        mimeType: metadata.mimeType,
        fileSize: BigInt(metadata.fileSize),
        fileHash,
        storageUrl,
        originalFilename: metadata.filename,
        uploadedBy: metadata.uploaderId || 'system',
      } as any,
      // Include relationships when available in schema
      // include: {
      //   uploader: true,
      //   message: true,
      // },
    });

    // Update quota
    if (metadata.tenantId) {
      await this.updateQuota(metadata.tenantId, metadata.fileSize, 1);
    }

    // Queue processing jobs
    await this.scheduleProcessingJobs(attachment.id, metadata.mimeType);

    // Clean up Redis
    await this.redis.del(`media:upload:${uploadId}`);

    this.logger.log(`Upload confirmed: ${attachment.id}`);
    return this.mapAttachmentToInterface(attachment);
  }

  async createAttachment(
    messageId: string,
    filename: string,
    mimeType: string,
    fileSize: number,
    fileHash: string,
    storageUrl: string,
    thumbnailUrl?: string,
    _options?: CreateAttachmentOptions,
  ): Promise<Attachment> {
    this.logger.log(`Confirming upload: ${filename}`);

    // Create attachment record
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const cdnUrl = this.storageConfig.cdnUrl 
      ? `${this.storageConfig.cdnUrl}/${storageUrl}`
      : storageUrl;

    const attachment = await this.prisma.attachment.create({
      data: {
        messageId,
        filename,
        mimeType,
        fileSize: BigInt(fileSize),
        fileHash,
        storageUrl,
        thumbnailUrl,
        originalFilename: filename,
        uploadedBy: _options?.uploaderId || 'system',
      } as any,
      // Include relationships when available in schema
      // include: {
      //   uploader: true,
      //   message: true,
      // },
    });

    // Update quota
    if (_options?.tenantId) {
      await this.updateQuota(_options.tenantId, fileSize, 1);
    }

    // Queue processing jobs
    await this.scheduleProcessingJobs(attachment.id, mimeType);

    this.logger.log(`Upload confirmed: ${attachment.id}`);
    return attachment;
  }

  async getAttachment(id: string, tenantId?: string): Promise<MediaAttachment | null> {
    const attachment = await this.prisma.attachment.findFirst({
      where: {
        id,
        ...(tenantId && { tenantId }),
      },
      include: {
        uploader: true,
        message: true,
      },
    });

    return attachment ? this.mapAttachmentToInterface(attachment) : null;
  }

  async searchAttachments(filter: MediaFilter, page = 1, limit = 20): Promise<MediaSearchResult> {
    const offset = (page - 1) * limit;

    const where: any = {};
    
    if (filter.tenantId) where.tenantId = filter.tenantId;
    if (filter.userId) where.uploadedBy = filter.userId;
    if (filter.messageId) where.messageId = filter.messageId;
    if (filter.mimeType) where.mimeType = { contains: filter.mimeType };
    if (filter.uploadStatus) where.uploadStatus = filter.uploadStatus;
    if (filter.processingStatus) where.processingStatus = filter.processingStatus;
    if (filter.virusScanStatus) where.virusScanStatus = filter.virusScanStatus;
    if (filter.minFileSize) where.fileSize = { gte: BigInt(filter.minFileSize) };
    if (filter.maxFileSize) where.fileSize = { ...where.fileSize, lte: BigInt(filter.maxFileSize) };
    if (filter.uploadedAfter) where.createdAt = { gte: filter.uploadedAfter };
    if (filter.uploadedBefore) where.createdAt = { ...where.createdAt, lte: filter.uploadedBefore };

    // Category filter
    if (filter.category) {
      const mimeTypePatterns = this.getCategoryMimeTypes(filter.category);
      where.mimeType = { in: mimeTypePatterns };
    }

    const [attachments, total] = await Promise.all([
      this.prisma.attachment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
      }),
      this.prisma.attachment.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      attachments: attachments.map(a => this.mapAttachmentToInterface(a)),
      total,
      page,
      limit,
      totalPages,
      hasNext: page < totalPages,
      hasPrevious: page > 1,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async deleteAttachment(id: string, _mimeType: string): Promise<void> {
    const attachment = await this.prisma.attachment.findFirst({
      where: {
        id,
      },
    });

    if (!attachment) {
      throw new BadRequestException('Attachment not found');
    }

    // Delete from storage
    const storageKey = this.extractStorageKey(attachment.storageUrl);
    await this.deleteFromStorage(storageKey);

    // Delete thumbnails and previews
    if (attachment.thumbnailUrl) {
      const thumbnailKey = this.extractStorageKey(attachment.thumbnailUrl);
      await this.deleteFromStorage(thumbnailKey);
    }

    // Preview URL cleanup - field not available in current schema
    // if (attachment.previewUrl) {
    //   const previewKey = this.extractStorageKey(attachment.previewUrl);
    //   await this.deleteFromStorage(previewKey);
    // }

    // Delete from database
    await this.prisma.attachment.delete({ where: { id } });

    // Update quota - using uploadedBy as tenant identifier temporarily
    // if (attachment.tenantId) {
    //   await this.updateQuota(attachment.tenantId, -Number(attachment.fileSize), -1);
    // }

    this.logger.log(`Attachment deleted: ${id}`);
  }

  async getQuotaInfo(tenantId: string): Promise<MediaQuotaInfo> {
    let quota = await (this.prisma as any).mediaQuota.findUnique({
      where: { tenantId },
    });

    if (!quota) {
      // Create default quota
      const defaultStorageLimit = parseInt(this.config.get('MEDIA_DEFAULT_STORAGE_LIMIT', '10737418240'), 10); // 10GB
      const defaultUploadLimit = parseInt(this.config.get('MEDIA_DEFAULT_UPLOAD_LIMIT', '1000'), 10);
      const defaultBandwidthLimit = parseInt(this.config.get('MEDIA_DEFAULT_BANDWIDTH_LIMIT', '107374182400'), 10); // 100GB

      quota = await (this.prisma as any).mediaQuota.create({
        data: {
          tenantId,
          storageLimit: BigInt(defaultStorageLimit),
          uploadLimit: defaultUploadLimit,
          bandwidthLimit: BigInt(defaultBandwidthLimit),
          resetAt: this.getNextResetDate(),
        },
      });
    }

    return {
      tenantId: quota.tenantId,
      storageUsed: Number(quota.storageUsed),
      storageLimit: Number(quota.storageLimit),
      uploadCount: quota.uploadCount,
      uploadLimit: quota.uploadLimit,
      bandwidthUsed: Number(quota.bandwidthUsed),
      bandwidthLimit: Number(quota.bandwidthLimit),
      resetAt: quota.resetAt,
    };
  }

  async generateDownloadUrl(id: string, tenantId?: string, expiresIn = 3600): Promise<string> {
    const attachment = await this.getAttachment(id, tenantId);
    if (!attachment) {
      throw new BadRequestException('Attachment not found');
    }

    // If CDN URL is available and no expiry needed, return it
    if (attachment.cdnUrl && expiresIn >= 86400) { // 24 hours
      return attachment.cdnUrl;
    }

    // Generate signed URL
    const storageKey = this.extractStorageKey(attachment.storageUrl);
    const command = new GetObjectCommand({
      Bucket: this.storageConfig.bucket,
      Key: storageKey,
    });

    return await getSignedUrl(this.s3Client, command, { expiresIn });
  }

  // Private helper methods
  private async validateUploadRequest(request: MediaUploadRequest): Promise<void> {
    // File size validation
    if (request.fileSize > this.validationRules.maxFileSize) {
      throw new BadRequestException(`File size exceeds maximum allowed size of ${this.validationRules.maxFileSize} bytes`);
    }

    // MIME type validation
    const isAllowedMimeType = this.validationRules.allowedMimeTypes.some(pattern => {
      if (pattern.endsWith('/*')) {
        return request.mimeType.startsWith(pattern.slice(0, -1));
      }
      return request.mimeType === pattern;
    });

    if (!isAllowedMimeType) {
      throw new BadRequestException(`MIME type ${request.mimeType} is not allowed`);
    }

    // File extension validation
    const extension = path.extname(request.filename).toLowerCase();
    if (!this.validationRules.allowedExtensions.includes(extension)) {
      throw new BadRequestException(`File extension ${extension} is not allowed`);
    }

    // Verify MIME type matches extension
    const expectedMimeType = mime.lookup(request.filename);
    if (expectedMimeType && expectedMimeType !== request.mimeType) {
      throw new BadRequestException('MIME type does not match file extension');
    }
  }

  private async checkQuota(tenantId: string, fileSize: number): Promise<void> {
    const quota = await this.getQuotaInfo(tenantId);
    
    if (quota.storageUsed + fileSize > quota.storageLimit) {
      throw new ForbiddenException('Storage quota exceeded');
    }

    if (quota.uploadCount >= quota.uploadLimit) {
      throw new ForbiddenException('Upload limit exceeded');
    }
  }

  private async updateQuota(tenantId: string, storageChange: number, uploadChange: number): Promise<void> {
    await (this.prisma as any).mediaQuota.upsert({
      where: { tenantId },
      update: {
        storageUsed: { increment: BigInt(storageChange) },
        uploadCount: { increment: uploadChange },
      },
      create: {
        tenantId,
        storageUsed: BigInt(Math.max(0, storageChange)),
        uploadCount: Math.max(0, uploadChange),
        storageLimit: BigInt(parseInt(this.config.get('MEDIA_DEFAULT_STORAGE_LIMIT', '10737418240'), 10)),
        uploadLimit: parseInt(this.config.get('MEDIA_DEFAULT_UPLOAD_LIMIT', '1000'), 10),
        bandwidthLimit: BigInt(parseInt(this.config.get('MEDIA_DEFAULT_BANDWIDTH_LIMIT', '107374182400'), 10)),
        resetAt: this.getNextResetDate(),
      },
    });
  }

  private generateStorageKey(tenantId: string | undefined, userId: string, filename: string): string {
    const tenant = tenantId || 'default';
    const year = new Date().getFullYear();
    const month = String(new Date().getMonth() + 1).padStart(2, '0');
    return `${tenant}/${year}/${month}/${userId}/${filename}`;
  }

  private generateStorageUrl(storageKey: string): string {
    if (this.storageConfig.endpoint) {
      return `${this.storageConfig.endpoint}/${this.storageConfig.bucket}/${storageKey}`;
    }
    return `https://${this.storageConfig.bucket}.s3.${this.storageConfig.region}.amazonaws.com/${storageKey}`;
  }

  private getCDNUrl(storageUrl: string): string {
    if (this.storageConfig.cdnUrl) {
      return `${this.storageConfig.cdnUrl}/${storageUrl}`;
    }
    return storageUrl;
  }

  private extractStorageKey(storageUrl: string): string {
    const url = new URL(storageUrl);
    return url.pathname.substring(1); // Remove leading slash
  }

  private async verifyFileExists(storageKey: string): Promise<boolean> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.storageConfig.bucket,
        Key: storageKey,
      });
      await this.s3Client.send(command);
      return true;
    } catch {
      return false;
    }
  }

  private async generateFileHash(storageKey: string): Promise<string> {
    // For now, generate a hash based on storage key and timestamp
    // In production, you might want to download and hash the actual file content
    const content = `${storageKey}:${Date.now()}`;
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  private async findByHash(fileHash: string, tenantId?: string): Promise<Attachment | null> {
    return await this.prisma.attachment.findFirst({
      where: {
        fileHash,
        ...(tenantId && { tenantId }),
      },
    });
  }

  private async deleteFromStorage(storageKey: string): Promise<void> {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.storageConfig.bucket,
        Key: storageKey,
      });
      await this.s3Client.send(command);
    } catch (error) {
      this.logger.error(`Failed to delete file from storage: ${storageKey}`, error);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private async scheduleProcessingJobs(attachmentId: string, _mimeType: string): Promise<void> {
    const jobs: Array<{ type: string; priority: string }> = [];

    // Virus scan
    if (this.validationRules.requireVirusScan) {
      jobs.push({ type: 'VIRUS_SCAN', priority: 'HIGH' });
    }

    // Content moderation
    if (this.validationRules.requireContentModeration) {
      jobs.push({ type: 'CONTENT_MODERATION', priority: 'HIGH' });
    }

    // Thumbnail generation
    if (this.validationRules.autoGenerateThumbnails) {
      jobs.push({ type: 'THUMBNAIL_GENERATION', priority: 'NORMAL' });
    }

    // EXIF stripping
    if (this.validationRules.stripExifData) {
      jobs.push({ type: 'EXIF_STRIP', priority: 'NORMAL' });
    }

    // Queue jobs in Redis
    for (const job of jobs) {
      const jobData = {
        attachmentId,
        type: job.type,
        priority: job.priority,
        createdAt: new Date().toISOString(),
      };

      await this.redis.lpush(
        `media:processing:${job.priority.toLowerCase()}`,
        JSON.stringify(jobData)
      );
    }
  }

  private getCategoryMimeTypes(category: MediaCategory): string[] {
    switch (category) {
      case MediaCategory.IMAGE:
        return ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
      case MediaCategory.VIDEO:
        return ['video/mp4', 'video/avi', 'video/mov', 'video/wmv', 'video/webm'];
      case MediaCategory.AUDIO:
        return ['audio/mp3', 'audio/wav', 'audio/ogg', 'audio/m4a', 'audio/flac'];
      case MediaCategory.DOCUMENT:
        return ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
      case MediaCategory.ARCHIVE:
        return ['application/zip', 'application/x-rar-compressed', 'application/x-7z-compressed'];
      default:
        return [];
    }
  }

  private getNextResetDate(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 1); // First day of next month
  }

  private mapAttachmentToInterface(attachment: any): MediaAttachment {
    return {
      id: attachment.id,
      messageId: attachment.messageId,
      filename: attachment.filename,
      originalFilename: attachment.originalFilename,
      mimeType: attachment.mimeType,
      fileSize: Number(attachment.fileSize),
      fileHash: attachment.fileHash,
      storageUrl: attachment.storageUrl,
      previewUrl: attachment.thumbnailUrl || null,
      cdnUrl: attachment.cdnUrl,
      uploadStatus: attachment.uploadStatus,
      processingStatus: attachment.processingStatus,
      virusScanStatus: attachment.virusScanStatus,
      metadata: attachment.metadata,
      contentSafety: attachment.contentSafety,
      expiresAt: attachment.expiresAt,
      tenantId: attachment.tenantId,
      uploadedBy: attachment.uploadedBy,
      createdAt: attachment.createdAt,
      updatedAt: attachment.updatedAt,
    };
  }
}
