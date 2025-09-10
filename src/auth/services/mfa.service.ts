import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as speakeasy from 'speakeasy';
import * as QRCode from 'qrcode';
import { MfaSetupResponse } from '../interfaces/auth.interface';

@Injectable()
export class MfaService {
  private readonly appName: string;
  private readonly issuer: string;

  constructor(private readonly configService: ConfigService) {
    this.appName = this.configService.get<string>('APP_NAME', 'ChemChat');
    this.issuer = this.configService.get<string>('MFA_ISSUER', 'ChemChat');
  }

  /**
   * Generate MFA secret and QR code for user setup
   */
  async generateMfaSetup(userEmail: string): Promise<MfaSetupResponse> {
    // Generate secret
    const secret = speakeasy.generateSecret({
      name: `${this.appName} (${userEmail})`,
      issuer: this.issuer,
      length: 32,
    });

    // Generate QR code URL
    const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url!);

    // Generate backup codes
    const backupCodes = this.generateBackupCodes();

    return {
      secret: secret.base32,
      qrCodeUrl,
      backupCodes,
    };
  }

  /**
   * Verify TOTP code
   */
  verifyTotp(secret: string, token: string): boolean {
    return speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token,
      window: 2, // Allow 2 time steps before/after current time
    });
  }

  /**
   * Verify backup code
   */
  verifyBackupCode(
    userId: string,
    backupCode: string,
    usedBackupCodes: string[],
  ): boolean {
    // Check if backup code was already used
    if (usedBackupCodes.includes(backupCode)) {
      return false;
    }

    // In a real implementation, you would store and verify against
    // the user's actual backup codes from the database
    // For now, we'll assume the backup code format is valid
    const isValidFormat = /^[A-Z0-9]{8}$/.test(backupCode);

    return isValidFormat;
  }

  /**
   * Generate backup codes
   */
  private generateBackupCodes(count: number = 10): string[] {
    const codes: string[] = [];
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

    for (let i = 0; i < count; i++) {
      let code = '';
      for (let j = 0; j < 8; j++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      codes.push(code);
    }

    return codes;
  }

  /**
   * Generate current TOTP token (for testing purposes)
   */
  generateCurrentToken(secret: string): string {
    return speakeasy.totp({
      secret,
      encoding: 'base32',
    });
  }
}
