import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { 
  MediaValidationRule, 
  MediaUploadRequest, 
  VirusScanResult, 
  ContentSafetyResult,
  MediaCategory 
} from '../interfaces/media.interface';
// TODO: Uncomment when Prisma schema is applied to database
// import { VirusScanStatus } from '@prisma/client';

// Temporary enum definition until Prisma client is updated
enum VirusScanStatus {
  PENDING = 'PENDING',
  SCANNING = 'SCANNING',
  CLEAN = 'CLEAN',
  INFECTED = 'INFECTED',
  FAILED = 'FAILED'
}
import * as crypto from 'crypto';
import * as path from 'path';
import * as mime from 'mime-types';

@Injectable()
export class MediaValidationService {
  private readonly logger = new Logger(MediaValidationService.name);
  private readonly validationRules: MediaValidationRule;
  private readonly dangerousExtensions: Set<string>;
  private readonly executableMimeTypes: Set<string>;

  constructor(private readonly config: ConfigService) {
    this.validationRules = {
      maxFileSize: parseInt(this.config.get('MEDIA_MAX_FILE_SIZE', '104857600'), 10), // 100MB
      allowedMimeTypes: this.config.get('MEDIA_ALLOWED_MIME_TYPES', 'image/*,video/*,audio/*,application/pdf').split(','),
      allowedExtensions: this.config.get('MEDIA_ALLOWED_EXTENSIONS', '.jpg,.jpeg,.png,.gif,.webp,.mp4,.mov,.avi,.mp3,.wav,.pdf').split(','),
      requireVirusScan: this.config.get('MEDIA_REQUIRE_VIRUS_SCAN', 'true') === 'true',
      requireContentModeration: this.config.get('MEDIA_REQUIRE_CONTENT_MODERATION', 'true') === 'true',
      autoGenerateThumbnails: this.config.get('MEDIA_AUTO_GENERATE_THUMBNAILS', 'true') === 'true',
      stripExifData: this.config.get('MEDIA_STRIP_EXIF', 'true') === 'true',
    };

    // Dangerous file extensions that should never be allowed
    this.dangerousExtensions = new Set([
      '.exe', '.bat', '.cmd', '.com', '.pif', '.scr', '.vbs', '.js', '.jar',
      '.app', '.deb', '.pkg', '.dmg', '.run', '.msi', '.dll', '.so', '.dylib',
      '.sh', '.bash', '.zsh', '.fish', '.ps1', '.psm1', '.psd1', '.ps1xml',
      '.reg', '.inf', '.sys', '.drv', '.ocx', '.cpl', '.gadget', '.msc',
      '.hta', '.wsf', '.wsh', '.scf', '.lnk', '.url', '.desktop', '.action'
    ]);

    // Executable MIME types that should be blocked
    this.executableMimeTypes = new Set([
      'application/x-executable',
      'application/x-msdos-program',
      'application/x-msdownload',
      'application/x-winexe',
      'application/x-apple-diskimage',
      'application/vnd.microsoft.portable-executable',
      'application/x-dosexec',
      'application/x-sharedlib',
      'application/x-shellscript',
      'text/x-shellscript',
      'application/javascript',
      'text/javascript',
      'application/x-javascript'
    ]);
  }

  async validateUploadRequest(request: MediaUploadRequest): Promise<void> {
    this.logger.log(`Validating upload request for file: ${request.filename}`);

    // Basic validation
    await this.validateBasicRequirements(request);
    
    // Security validation
    await this.validateSecurity(request);
    
    // Content validation
    await this.validateContent(request);

    this.logger.log(`Upload request validation passed for: ${request.filename}`);
  }

  async scanFileContent(buffer: Buffer, filename: string): Promise<VirusScanResult> {
    this.logger.log(`Scanning file content: ${filename}`);

    try {
      // Basic file signature validation
      const isValidSignature = this.validateFileSignature(buffer, filename);
      if (!isValidSignature) {
        return {
          status: VirusScanStatus.FAILED,
          scanEngine: 'signature-validator',
          scanDate: new Date(),
          threats: ['Invalid file signature'],
          quarantined: true,
        };
      }

      // Check for embedded executables
      const hasEmbeddedExecutable = this.detectEmbeddedExecutables(buffer);
      if (hasEmbeddedExecutable) {
        return {
          status: VirusScanStatus.INFECTED,
          scanEngine: 'embedded-executable-detector',
          scanDate: new Date(),
          threats: ['Embedded executable detected'],
          quarantined: true,
        };
      }

      // Check for suspicious patterns
      const suspiciousPatterns = this.detectSuspiciousPatterns(buffer);
      if (suspiciousPatterns.length > 0) {
        return {
          status: VirusScanStatus.INFECTED,
          scanEngine: 'pattern-detector',
          scanDate: new Date(),
          threats: suspiciousPatterns,
          quarantined: true,
        };
      }

      // In a real implementation, you would integrate with actual antivirus APIs
      // like ClamAV, VirusTotal, or cloud-based scanning services
      
      return {
        status: VirusScanStatus.CLEAN,
        scanEngine: 'basic-validator',
        scanDate: new Date(),
        threats: [],
        quarantined: false,
      };

    } catch (error) {
      this.logger.error(`Virus scan failed for ${filename}:`, error);
      return {
        status: VirusScanStatus.FAILED,
        scanEngine: 'basic-validator',
        scanDate: new Date(),
        threats: ['Scan failed'],
        quarantined: true,
      };
    }
  }

  async moderateContent(buffer: Buffer, mimeType: string): Promise<ContentSafetyResult> {
    this.logger.log(`Moderating content for MIME type: ${mimeType}`);

    try {
      // Basic content analysis
      const isImage = mimeType.startsWith('image/');
      const isVideo = mimeType.startsWith('video/');
      
      if (!isImage && !isVideo) {
        // For non-visual content, return safe by default
        return {
          isAppropriate: true,
          confidence: 1.0,
          categories: {},
          moderationAction: 'allow',
        };
      }

      // In a real implementation, you would integrate with content moderation APIs
      // like Azure Content Moderator, AWS Rekognition, Google Cloud Vision API, etc.
      
      // For now, implement basic checks
      const fileSize = buffer.length;
      const isReasonableSize = fileSize > 1024 && fileSize < 50 * 1024 * 1024; // 1KB to 50MB
      
      if (!isReasonableSize) {
        return {
          isAppropriate: false,
          confidence: 0.8,
          categories: { spam: 0.8 },
          moderationAction: 'flag',
        };
      }

      // Check for suspicious file patterns
      const suspiciousScore = this.calculateSuspiciousScore(buffer);
      
      return {
        isAppropriate: suspiciousScore < 0.5,
        confidence: Math.max(0.6, 1 - suspiciousScore),
        categories: {
          adult: suspiciousScore * 0.3,
          violence: suspiciousScore * 0.2,
          hate: suspiciousScore * 0.1,
          spam: suspiciousScore * 0.4,
        },
        moderationAction: suspiciousScore > 0.7 ? 'block' : suspiciousScore > 0.3 ? 'flag' : 'allow',
      };

    } catch (error) {
      this.logger.error(`Content moderation failed:`, error);
      return {
        isAppropriate: false,
        confidence: 0.5,
        categories: {},
        moderationAction: 'flag',
      };
    }
  }

  getMediaCategory(mimeType: string): MediaCategory {
    if (mimeType.startsWith('image/')) return MediaCategory.IMAGE;
    if (mimeType.startsWith('video/')) return MediaCategory.VIDEO;
    if (mimeType.startsWith('audio/')) return MediaCategory.AUDIO;
    if (mimeType === 'application/pdf' || 
        mimeType.includes('document') || 
        mimeType.includes('spreadsheet') || 
        mimeType.includes('presentation')) {
      return MediaCategory.DOCUMENT;
    }
    if (mimeType.includes('zip') || 
        mimeType.includes('rar') || 
        mimeType.includes('7z') || 
        mimeType.includes('tar')) {
      return MediaCategory.ARCHIVE;
    }
    return MediaCategory.OTHER;
  }

  generateFileHash(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  // Private validation methods
  private async validateBasicRequirements(request: MediaUploadRequest): Promise<void> {
    // File size validation
    if (request.fileSize <= 0) {
      throw new BadRequestException('File size must be greater than 0');
    }

    if (request.fileSize > this.validationRules.maxFileSize) {
      throw new BadRequestException(
        `File size ${request.fileSize} exceeds maximum allowed size of ${this.validationRules.maxFileSize} bytes`
      );
    }

    // Filename validation
    if (!request.filename || request.filename.trim().length === 0) {
      throw new BadRequestException('Filename is required');
    }

    if (request.filename.length > 255) {
      throw new BadRequestException('Filename is too long (maximum 255 characters)');
    }

    // Check for path traversal attempts
    if (request.filename.includes('..') || request.filename.includes('/') || request.filename.includes('\\')) {
      throw new BadRequestException('Invalid filename: path traversal detected');
    }

    // MIME type validation
    if (!request.mimeType || request.mimeType.trim().length === 0) {
      throw new BadRequestException('MIME type is required');
    }
  }

  private async validateSecurity(request: MediaUploadRequest): Promise<void> {
    const extension = path.extname(request.filename).toLowerCase();
    
    // Check dangerous extensions
    if (this.dangerousExtensions.has(extension)) {
      throw new BadRequestException(`File extension ${extension} is not allowed for security reasons`);
    }

    // Check executable MIME types
    if (this.executableMimeTypes.has(request.mimeType.toLowerCase())) {
      throw new BadRequestException(`MIME type ${request.mimeType} is not allowed for security reasons`);
    }

    // Verify MIME type matches extension
    const expectedMimeType = mime.lookup(request.filename);
    if (expectedMimeType && expectedMimeType !== request.mimeType) {
      // Allow some common mismatches
      const allowedMismatches = new Map([
        ['image/jpg', 'image/jpeg'],
        ['image/jpeg', 'image/jpg'],
      ]);

      const isAllowedMismatch = allowedMismatches.get(request.mimeType) === expectedMimeType ||
                               allowedMismatches.get(expectedMimeType) === request.mimeType;

      if (!isAllowedMismatch) {
        throw new BadRequestException(
          `MIME type ${request.mimeType} does not match file extension ${extension}`
        );
      }
    }
  }

  private async validateContent(request: MediaUploadRequest): Promise<void> {
    // MIME type whitelist validation
    const isAllowedMimeType = this.validationRules.allowedMimeTypes.some(pattern => {
      if (pattern.endsWith('/*')) {
        return request.mimeType.startsWith(pattern.slice(0, -1));
      }
      return request.mimeType === pattern;
    });

    if (!isAllowedMimeType) {
      throw new BadRequestException(`MIME type ${request.mimeType} is not allowed`);
    }

    // Extension whitelist validation
    const extension = path.extname(request.filename).toLowerCase();
    if (!this.validationRules.allowedExtensions.includes(extension)) {
      throw new BadRequestException(`File extension ${extension} is not allowed`);
    }
  }

  private validateFileSignature(buffer: Buffer, filename: string): boolean {
    if (buffer.length < 4) return false;

    const extension = path.extname(filename).toLowerCase();
    const signature = buffer.subarray(0, 8);

    // Common file signatures
    const signatures = {
      '.jpg': [[0xFF, 0xD8, 0xFF]],
      '.jpeg': [[0xFF, 0xD8, 0xFF]],
      '.png': [[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]],
      '.gif': [[0x47, 0x49, 0x46, 0x38, 0x37, 0x61], [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]],
      '.webp': [[0x52, 0x49, 0x46, 0x46]], // RIFF header
      '.pdf': [[0x25, 0x50, 0x44, 0x46]], // %PDF
      '.mp4': [[0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70], [0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70]],
      '.mp3': [[0x49, 0x44, 0x33], [0xFF, 0xFB], [0xFF, 0xF3], [0xFF, 0xF2]],
      '.wav': [[0x52, 0x49, 0x46, 0x46]], // RIFF header
    };

    const expectedSignatures = signatures[extension];
    if (!expectedSignatures) {
      // If we don't have a signature for this extension, allow it
      return true;
    }

    return expectedSignatures.some(expectedSig => {
      return expectedSig.every((byte, index) => signature[index] === byte);
    });
  }

  private detectEmbeddedExecutables(buffer: Buffer): boolean {
    // Check for common executable signatures within the file
    const executableSignatures = [
      [0x4D, 0x5A], // MZ (DOS/Windows executable)
      [0x7F, 0x45, 0x4C, 0x46], // ELF (Linux executable)
      [0xCF, 0xFA, 0xED, 0xFE], // Mach-O (macOS executable)
      [0xFE, 0xED, 0xFA, 0xCE], // Mach-O (macOS executable, different endian)
    ];

    for (let i = 0; i < buffer.length - 4; i++) {
      for (const signature of executableSignatures) {
        let match = true;
        for (let j = 0; j < signature.length; j++) {
          if (buffer[i + j] !== signature[j]) {
            match = false;
            break;
          }
        }
        if (match) return true;
      }
    }

    return false;
  }

  private detectSuspiciousPatterns(buffer: Buffer): string[] {
    const threats: string[] = [];
    const content = buffer.toString('ascii', 0, Math.min(buffer.length, 8192)); // Check first 8KB

    // Check for suspicious strings
    const suspiciousPatterns = [
      /eval\s*\(/gi,
      /document\.write/gi,
      /innerHTML\s*=/gi,
      /<script[^>]*>/gi,
      /javascript:/gi,
      /vbscript:/gi,
      /onload\s*=/gi,
      /onerror\s*=/gi,
      /base64_decode/gi,
      /shell_exec/gi,
      /system\s*\(/gi,
      /exec\s*\(/gi,
    ];

    for (const pattern of suspiciousPatterns) {
      if (pattern.test(content)) {
        threats.push(`Suspicious pattern detected: ${pattern.source}`);
      }
    }

    return threats;
  }

  private calculateSuspiciousScore(buffer: Buffer): number {
    let score = 0;

    // Check file size anomalies
    const fileSize = buffer.length;
    if (fileSize < 100) score += 0.3; // Too small
    if (fileSize > 100 * 1024 * 1024) score += 0.2; // Very large

    // Check for high entropy (possible encryption/obfuscation)
    const entropy = this.calculateEntropy(buffer.subarray(0, Math.min(buffer.length, 4096)));
    if (entropy > 7.5) score += 0.4;

    // Check for suspicious byte patterns
    const suspiciousBytes = this.countSuspiciousBytes(buffer);
    if (suspiciousBytes > 0.1) score += 0.3;

    return Math.min(score, 1.0);
  }

  private calculateEntropy(buffer: Buffer): number {
    const frequencies = new Array(256).fill(0);
    
    for (let i = 0; i < buffer.length; i++) {
      frequencies[buffer[i]]++;
    }

    let entropy = 0;
    const length = buffer.length;

    for (let i = 0; i < 256; i++) {
      if (frequencies[i] > 0) {
        const probability = frequencies[i] / length;
        entropy -= probability * Math.log2(probability);
      }
    }

    return entropy;
  }

  private countSuspiciousBytes(buffer: Buffer): number {
    let suspiciousCount = 0;
    
    for (let i = 0; i < buffer.length; i++) {
      const byte = buffer[i];
      // Count control characters and high-value bytes
      if ((byte < 32 && byte !== 9 && byte !== 10 && byte !== 13) || byte > 126) {
        suspiciousCount++;
      }
    }

    return suspiciousCount / buffer.length;
  }
}
