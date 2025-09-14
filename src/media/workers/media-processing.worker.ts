import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../shared/infrastructure/prisma/prisma.service';
import { RedisService } from '../../shared/redis/redis.service';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { 
  MediaProcessingResult, 
  MediaMetadata
} from '../interfaces/media.interface';

// Temporary enum definitions until Prisma client is updated
enum ProcessingPriority {
  LOW = 'LOW',
  NORMAL = 'NORMAL', 
  HIGH = 'HIGH',
  URGENT = 'URGENT'
}

enum MediaProcessingType {
  THUMBNAIL_GENERATION = 'THUMBNAIL_GENERATION',
  EXIF_STRIPPING = 'EXIF_STRIPPING',
  VIRUS_SCAN = 'VIRUS_SCAN',
  CONTENT_MODERATION = 'CONTENT_MODERATION',
  TRANSCODING = 'TRANSCODING'
}

enum MediaProcessingStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING', 
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED'
}
import { MediaValidationService } from '../services/media-validation.service';
import sharp from 'sharp';
import ffmpeg from 'fluent-ffmpeg';
import * as exifParser from 'exif-parser';
import * as path from 'path';
import { Readable } from 'stream';

@Injectable()
export class MediaProcessingWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MediaProcessingWorker.name);
  private readonly s3Client: S3Client;
  private readonly storageConfig: any;
  private processingInterval: NodeJS.Timeout | null = null;
  private isProcessing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
    private readonly validationService: MediaValidationService,
  ) {
    this.storageConfig = {
      bucket: this.config.get('MEDIA_STORAGE_BUCKET', 'chemchat-media'),
      region: this.config.get('MEDIA_STORAGE_REGION', 'us-east-1'),
      endpoint: this.config.get('MEDIA_STORAGE_ENDPOINT'),
      accessKeyId: this.config.get('MEDIA_STORAGE_ACCESS_KEY'),
      secretAccessKey: this.config.get('MEDIA_STORAGE_SECRET_KEY'),
    };

    this.s3Client = new S3Client({
      region: this.storageConfig.region,
      endpoint: this.storageConfig.endpoint,
      credentials: this.storageConfig.accessKeyId ? {
        accessKeyId: this.storageConfig.accessKeyId,
        secretAccessKey: this.storageConfig.secretAccessKey,
      } : undefined,
      forcePathStyle: this.config.get('MEDIA_STORAGE_PROVIDER') === 'minio',
    });

    // Configure FFmpeg path if needed
    const ffmpegPath = this.config.get('FFMPEG_PATH');
    if (ffmpegPath) {
      ffmpeg.setFfmpegPath(ffmpegPath);
    }
  }

  async onModuleInit() {
    this.logger.log('Starting media processing worker');
    this.startProcessing();
  }

  async onModuleDestroy() {
    this.logger.log('Stopping media processing worker');
    this.stopProcessing();
  }

  private startProcessing() {
    const intervalMs = parseInt(this.config.get('MEDIA_PROCESSING_INTERVAL', '5000'), 10);
    
    this.processingInterval = setInterval(async () => {
      if (!this.isProcessing) {
        await this.processQueues();
      }
    }, intervalMs);
  }

  private stopProcessing() {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
  }

  private async processQueues() {
    this.isProcessing = true;
    
    try {
      const priorities = [ProcessingPriority.URGENT, ProcessingPriority.HIGH, ProcessingPriority.NORMAL, ProcessingPriority.LOW];
      const batchSize = parseInt(this.config.get('MEDIA_PROCESSING_BATCH_SIZE', '5'), 10);

      for (const priority of priorities) {
        await this.processQueue(priority, batchSize);
      }
    } catch (error) {
      this.logger.error('Error processing media queues:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  private async processQueue(priority: ProcessingPriority, batchSize: number): Promise<void> {
    const queueName = `media:processing:${priority.toLowerCase()}`;
    
    try {
      const jobs = await (this.redis as any).lrange(queueName, 0, batchSize - 1);
      if (jobs.length === 0) return;

      // Remove processed jobs from queue
      await (this.redis as any).ltrim(queueName, jobs.length, -1);

      // Process jobs sequentially to avoid overwhelming the system
      for (const jobData of jobs) {
        try {
          const job = JSON.parse(jobData);
          await this.processJob(job);
        } catch (error) {
          this.logger.error(`Failed to process job: ${jobData}`, error);
        }
      }

      this.logger.log(`Processed ${jobs.length} ${priority} priority jobs`);
    } catch (error) {
      this.logger.error(`Error processing ${priority} queue:`, error);
    }
  }

  private async processJob(jobData: any): Promise<void> {
    const { attachmentId, type, options } = jobData;
    
    this.logger.log(`Processing job: ${type} for attachment ${attachmentId}`);

    // Get attachment from database
    const attachment = await this.prisma.attachment.findUnique({
      where: { id: attachmentId },
    });

    if (!attachment) {
      this.logger.error(`Attachment not found: ${attachmentId}`);
      return;
    }

    // Check if there are existing jobs for the same attachment
    const existingJobs = await (this.prisma as any).mediaProcessing.findMany({
      where: { attachmentId, status: { not: MediaProcessingStatus.COMPLETED } },
    });

    if (existingJobs.length > 0) {
      this.logger.log(`Skipping job: ${type} for attachment ${attachmentId} due to existing jobs`);
      return;
    }

    // Create processing record
    const processingJob = await (this.prisma as any).mediaProcessing.create({
      data: {
        attachmentId,
        jobType: type as MediaProcessingType,
        status: MediaProcessingStatus.PROCESSING,
        priority: 'NORMAL' as ProcessingPriority,
        inputUrl: attachment.storageUrl,
        parameters: options || {},
        startedAt: new Date(),
      },
    });

    try {
      let result: MediaProcessingResult;

      switch (type) {
        case 'THUMBNAIL_GENERATION':
          result = await this.generateThumbnail(attachment, options);
          break;
        case 'IMAGE_RESIZE':
          result = await this.resizeImage(attachment, options);
          break;
        case 'EXIF_STRIP':
          result = await this.stripExifData(attachment);
          break;
        case 'VIDEO_TRANSCODE':
          result = await this.transcodeVideo(attachment, options);
          break;
        case 'AUDIO_TRANSCODE':
          result = await this.transcodeAudio(attachment, options);
          break;
        case 'VIRUS_SCAN':
          result = await this.scanForViruses(attachment);
          break;
        case 'CONTENT_MODERATION':
          result = await this.moderateContent(attachment);
          break;
        default:
          throw new Error(`Unknown job type: ${type}`);
      }

      // Update processing record
      await (this.prisma as any).mediaProcessing.update({
        where: { id: processingJob.id },
        data: {
          status: MediaProcessingStatus.COMPLETED,
          outputUrl: result.outputUrl,
          result: result as any,
          completedAt: new Date(),
        },
      });

      // Update attachment with results
      await this.updateAttachmentWithResults(attachmentId, type, result);

      this.logger.log(`Completed job: ${type} for attachment ${attachmentId}`);

    } catch (error) {
      this.logger.error(`Job failed: ${type} for attachment ${attachmentId}`, error);

      // Update processing record with error
      await (this.prisma as any).mediaProcessing.update({
        where: { id: processingJob.id },
        data: {
          status: MediaProcessingStatus.FAILED,
          error: error.message,
          attempts: { increment: 1 },
          completedAt: new Date(),
        },
      });

      // Retry if under max attempts
      const existingJob = await (this.prisma as any).mediaProcessing.findFirst({
        where: { id: processingJob.id },
      });

      if (existingJob && existingJob.attempts < existingJob.maxAttempts) {
        // Re-queue with exponential backoff
        const delay = Math.pow(2, existingJob.attempts) * 1000; // 2^attempts seconds
        setTimeout(async () => {
          await (this.redis as any).lpush(
            `media:processing:${existingJob.priority.toLowerCase()}`,
            JSON.stringify(jobData)
          );
        }, delay);
      }
    }
  }

  private async generateThumbnail(attachment: any, _options?: any): Promise<MediaProcessingResult> {
    const { width = 300, height = 300, quality = 80 } = _options || {};

    if (!attachment.mimeType.startsWith('image/') && !attachment.mimeType.startsWith('video/')) {
      throw new Error('Thumbnail generation only supported for images and videos');
    }

    const inputBuffer = await this.downloadFile(attachment.storageUrl);
    let thumbnailBuffer: Buffer;

    if (attachment.mimeType.startsWith('image/')) {
      // Generate image thumbnail using Sharp
      thumbnailBuffer = await sharp(inputBuffer)
        .resize(width, height, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality })
        .toBuffer();
    } else {
      // Generate video thumbnail using FFmpeg
      thumbnailBuffer = await this.generateVideoThumbnail(inputBuffer, width, height);
    }

    // Upload thumbnail
    const thumbnailKey = this.generateThumbnailKey(attachment.storageUrl);
    const thumbnailUrl = await this.uploadFile(thumbnailKey, thumbnailBuffer, 'image/jpeg');

    return {
      thumbnailUrl,
      fileSize: thumbnailBuffer.length,
      metadata: {
        width,
        height,
        format: 'jpeg',
      },
    };
  }

  private async resizeImage(attachment: any, options: any): Promise<MediaProcessingResult> {
    const { targetWidth, targetHeight, quality = 85, format } = options;

    if (!attachment.mimeType.startsWith('image/')) {
      throw new Error('Image resize only supported for images');
    }

    const inputBuffer = await this.downloadFile(attachment.storageUrl);
    
    let sharpInstance = sharp(inputBuffer);
    
    if (targetWidth || targetHeight) {
      sharpInstance = sharpInstance.resize(targetWidth, targetHeight, {
        fit: 'inside',
        withoutEnlargement: true,
      });
    }

    // Apply format conversion if specified
    if (format) {
      switch (format.toLowerCase()) {
        case 'jpeg':
        case 'jpg':
          sharpInstance = sharpInstance.jpeg({ quality });
          break;
        case 'png':
          sharpInstance = sharpInstance.png({ quality });
          break;
        case 'webp':
          sharpInstance = sharpInstance.webp({ quality });
          break;
      }
    }

    const outputBuffer = await sharpInstance.toBuffer();
    const metadata = await sharp(outputBuffer).metadata();

    // Upload resized image
    const outputKey = this.generateProcessedKey(attachment.storageUrl, 'resized');
    const outputUrl = await this.uploadFile(outputKey, outputBuffer, `image/${format || 'jpeg'}`);

    return {
      outputUrl,
      fileSize: outputBuffer.length,
      metadata: {
        width: metadata.width,
        height: metadata.height,
        format: metadata.format,
      },
    };
  }

  private async stripExifData(attachment: any): Promise<MediaProcessingResult> {
    if (!attachment.mimeType.startsWith('image/')) {
      throw new Error('EXIF stripping only supported for images');
    }

    const inputBuffer = await this.downloadFile(attachment.storageUrl);
    
    // Extract EXIF data before stripping
    let exifData = null;
    try {
      const parser = exifParser.create(inputBuffer);
      exifData = parser.parse();
    } catch (error) {
      this.logger.warn(`Could not parse EXIF data: ${error.message}`);
    }

    // Strip EXIF data using Sharp
    const outputBuffer = await sharp(inputBuffer)
      .rotate() // Auto-rotate based on EXIF orientation
      .withMetadata({}) // Remove all metadata
      .toBuffer();

    // Upload cleaned image
    const outputKey = this.generateProcessedKey(attachment.storageUrl, 'clean');
    const outputUrl = await this.uploadFile(outputKey, outputBuffer, attachment.mimeType);

    return {
      outputUrl,
      fileSize: outputBuffer.length,
      metadata: {
        exif: exifData || undefined,
      },
    };
  }

  private async transcodeVideo(attachment: any, options: any): Promise<MediaProcessingResult> {
    if (!attachment.mimeType.startsWith('video/')) {
      throw new Error('Video transcoding only supported for videos');
    }

    // Use options to configure transcoding parameters
    const quality = options?.quality || 'medium';
    const format = options?.format || 'mp4';
    
    this.logger.log(`Transcoding video with quality: ${quality}, format: ${format}`);
    
    // For now, return a placeholder result
    // In a real implementation, you would use FFmpeg to transcode the video
    return {
      outputUrl: attachment.storageUrl, // Placeholder
      metadata: {
        quality,
        format,
        // Placeholder metadata - would include video processing details
      } as any,
    };
  }

  private async transcodeAudio(attachment: any, options: any): Promise<MediaProcessingResult> {
    const { /* codec = 'mp3', */ bitrate = '128k', sampleRate = 44100 } = options;

    if (!attachment.mimeType.startsWith('audio/')) {
      throw new Error('Audio transcoding only supported for audio files');
    }

    // For now, return a placeholder result
    // In a real implementation, you would use FFmpeg to transcode the audio
    return {
      outputUrl: attachment.storageUrl, // Placeholder
      metadata: {
        // codec,
        bitrate: parseInt(bitrate),
        sampleRate,
      },
    };
  }

  private async scanForViruses(attachment: any): Promise<MediaProcessingResult> {
    const inputBuffer = await this.downloadFile(attachment.storageUrl);
    const scanResult = await this.validationService.scanFileContent(inputBuffer, attachment.filename);

    return {
      virusScanResult: scanResult,
    };
  }

  private async moderateContent(attachment: any): Promise<MediaProcessingResult> {
    const inputBuffer = await this.downloadFile(attachment.storageUrl);
    const moderationResult = await this.validationService.moderateContent(inputBuffer, attachment.mimeType);

    return {
      contentSafetyResult: moderationResult,
    };
  }

  private async downloadFile(storageUrl: string): Promise<Buffer> {
    const key = this.extractStorageKey(storageUrl);
    
    const command = new GetObjectCommand({
      Bucket: this.storageConfig.bucket,
      Key: key,
    });

    const response = await this.s3Client.send(command);
    const stream = response.Body as Readable;
    
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    
    return Buffer.concat(chunks);
  }

  private async uploadFile(key: string, buffer: Buffer, mimeType: string): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.storageConfig.bucket,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
    });

    await this.s3Client.send(command);
    
    if (this.storageConfig.endpoint) {
      return `${this.storageConfig.endpoint}/${this.storageConfig.bucket}/${key}`;
    }
    return `https://${this.storageConfig.bucket}.s3.${this.storageConfig.region}.amazonaws.com/${key}`;
  }

  private async generateVideoThumbnail(videoBuffer: Buffer, width: number, height: number): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      // Create a temporary readable stream from buffer
      const stream = new Readable();
      stream.push(videoBuffer);
      stream.push(null);

      const chunks: Buffer[] = [];
      
      ffmpeg(stream)
        .screenshots({
          count: 1,
          timemarks: ['00:00:01'],
          size: `${width}x${height}`,
        })
        .on('end', () => {
          if (chunks.length > 0) {
            resolve(Buffer.concat(chunks));
          } else {
            reject(new Error('No thumbnail generated'));
          }
        })
        .on('error', reject)
        .pipe()
        .on('data', (chunk: Buffer) => chunks.push(chunk));
    });
  }

  private async updateAttachmentWithResults(
    attachmentId: string, 
    jobType: string, 
    result: MediaProcessingResult
  ): Promise<void> {
    const updateData: any = {};

    if (result.thumbnailUrl) {
      updateData.thumbnailUrl = result.thumbnailUrl;
    }

    if (result.outputUrl && jobType !== 'THUMBNAIL_GENERATION') {
      updateData.previewUrl = result.outputUrl;
    }

    if (result.metadata) {
      updateData.metadata = result.metadata;
    }

    if (result.virusScanResult) {
      updateData.virusScanStatus = result.virusScanResult.status;
      updateData.virusScanResult = JSON.stringify(result.virusScanResult);
    }

    if (result.contentSafetyResult) {
      updateData.contentSafety = result.contentSafetyResult;
    }

    // Update processing status if all required jobs are complete
    if (jobType === 'VIRUS_SCAN' || jobType === 'CONTENT_MODERATION') {
      updateData.processingStatus = MediaProcessingStatus.COMPLETED;
    }

    if (Object.keys(updateData).length > 0) {
      await this.prisma.attachment.update({
        where: { id: attachmentId },
        data: updateData,
      });
    }
  }

  private extractStorageKey(storageUrl: string): string {
    const url = new URL(storageUrl);
    return url.pathname.substring(1); // Remove leading slash
  }

  private generateThumbnailKey(originalKey: string): string {
    const key = this.extractStorageKey(originalKey);
    const ext = path.extname(key);
    const base = key.substring(0, key.length - ext.length);
    return `${base}_thumb.jpg`;
  }

  private generateProcessedKey(originalKey: string, suffix: string): string {
    const key = this.extractStorageKey(originalKey);
    const ext = path.extname(key);
    const base = key.substring(0, key.length - ext.length);
    return `${base}_${suffix}${ext}`;
  }
}
