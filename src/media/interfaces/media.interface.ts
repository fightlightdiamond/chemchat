import { 
  MediaUploadStatus, 
  MediaProcessingStatus, 
  MediaProcessingType, 
  ProcessingPriority, 
  VirusScanStatus 
} from '@prisma/client';

export interface MediaUploadRequest {
  filename: string;
  mimeType: string;
  fileSize: number;
  messageId?: string;
  tenantId?: string;
  userId: string;
  expiresIn?: number; // seconds
}

export interface MediaUploadResponse {
  uploadId: string;
  uploadUrl: string;
  fields?: Record<string, string>; // For S3 multipart upload
  expiresAt: Date;
}

export interface MediaMetadata {
  width?: number;
  height?: number;
  duration?: number; // for video/audio
  bitrate?: number;
  format?: string;
  exif?: Record<string, any>;
  colorSpace?: string;
  hasAlpha?: boolean;
  frameRate?: number;
  channels?: number; // for audio
  sampleRate?: number; // for audio
}

export interface MediaProcessingJob {
  id: string;
  attachmentId: string;
  jobType: MediaProcessingType;
  status: MediaProcessingStatus;
  priority: ProcessingPriority;
  inputUrl: string;
  outputUrl?: string;
  parameters?: MediaProcessingParameters;
  result?: MediaProcessingResult;
  error?: string;
  attempts: number;
  maxAttempts: number;
  scheduledAt?: Date;
  startedAt?: Date;
  completedAt?: Date;
}

export interface MediaProcessingParameters {
  // Thumbnail generation
  thumbnailWidth?: number;
  thumbnailHeight?: number;
  thumbnailQuality?: number;
  
  // Image resize
  targetWidth?: number;
  targetHeight?: number;
  maintainAspectRatio?: boolean;
  quality?: number;
  format?: string;
  
  // Video transcode
  videoCodec?: string;
  audioCodec?: string;
  videoBitrate?: number;
  audioBitrate?: number;
  resolution?: string;
  
  // Audio transcode
  sampleRate?: number;
  channels?: number;
  
  // Watermark
  watermarkText?: string;
  watermarkPosition?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';
  watermarkOpacity?: number;
  
  // General
  stripExif?: boolean;
  outputFormat?: string;
}

export interface MediaProcessingResult {
  outputUrl?: string;
  thumbnailUrl?: string;
  previewUrl?: string;
  metadata?: MediaMetadata;
  fileSize?: number;
  duration?: number;
  virusScanResult?: VirusScanResult;
  contentSafetyResult?: ContentSafetyResult;
}

export interface VirusScanResult {
  status: VirusScanStatus;
  scanEngine: string;
  scanDate: Date;
  threats?: string[];
  quarantined?: boolean;
}

export interface ContentSafetyResult {
  isAppropriate: boolean;
  confidence: number;
  categories: {
    adult?: number;
    violence?: number;
    hate?: number;
    selfHarm?: number;
    spam?: number;
  };
  moderationAction?: 'allow' | 'flag' | 'block';
}

export interface MediaQuotaInfo {
  tenantId: string;
  storageUsed: number;
  storageLimit: number;
  uploadCount: number;
  uploadLimit: number;
  bandwidthUsed: number;
  bandwidthLimit: number;
  resetAt: Date;
}

export interface MediaStorageConfig {
  provider: 'aws-s3' | 'minio' | 'gcs' | 'azure';
  bucket: string;
  region?: string;
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  cdnUrl?: string;
  signedUrlExpiry: number;
}

export interface MediaValidationRule {
  maxFileSize: number; // bytes
  allowedMimeTypes: string[];
  allowedExtensions: string[];
  requireVirusScan: boolean;
  requireContentModeration: boolean;
  autoGenerateThumbnails: boolean;
  stripExifData: boolean;
}

export interface MediaUploadOptions {
  generateThumbnail?: boolean;
  stripExif?: boolean;
  virusScan?: boolean;
  contentModeration?: boolean;
  watermark?: {
    text: string;
    position: string;
    opacity: number;
  };
  resize?: {
    width: number;
    height: number;
    quality: number;
  };
}

export enum MediaCategory {
  IMAGE = 'image',
  VIDEO = 'video',
  AUDIO = 'audio',
  DOCUMENT = 'document',
  ARCHIVE = 'archive',
  OTHER = 'other',
}

export interface MediaFilter {
  tenantId?: string;
  userId?: string;
  messageId?: string;
  category?: MediaCategory;
  mimeType?: string;
  uploadStatus?: MediaUploadStatus;
  processingStatus?: MediaProcessingStatus;
  virusScanStatus?: VirusScanStatus;
  minFileSize?: number;
  maxFileSize?: number;
  uploadedAfter?: Date;
  uploadedBefore?: Date;
}

export interface MediaSearchResult {
  attachments: MediaAttachment[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

export interface MediaAttachment {
  id: string;
  messageId: string;
  filename: string;
  originalFilename: string;
  mimeType: string;
  fileSize: number;
  fileHash: string;
  storageUrl: string;
  thumbnailUrl?: string;
  previewUrl?: string;
  cdnUrl?: string;
  uploadStatus: MediaUploadStatus;
  processingStatus: MediaProcessingStatus;
  virusScanStatus: VirusScanStatus;
  metadata?: MediaMetadata;
  contentSafety?: ContentSafetyResult;
  expiresAt?: Date;
  tenantId?: string;
  uploadedBy: string;
  createdAt: Date;
  updatedAt: Date;
}
