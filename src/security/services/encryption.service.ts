import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';

type Algorithm = 'aes-256-cbc' | 'aes-192-cbc' | 'aes-128-cbc';

@Injectable()
export class EncryptionService {
  private readonly algorithm: Algorithm = 'aes-256-cbc';
  private readonly key: Buffer;
  private readonly ivLength = 16; // For AES, this is always 16
  private readonly saltRounds = 10;

  constructor(private readonly configService: ConfigService) {
    const encryptionKey = this.configService.get<string>('ENCRYPTION_KEY');
    if (!encryptionKey) {
      throw new Error('ENCRYPTION_KEY is not defined in environment variables');
    }
    
    // Ensure the key is the correct length for the algorithm (32 bytes for aes-256-cbc)
    this.key = crypto.scryptSync(encryptionKey, 'salt', 32);
  }

  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, this.saltRounds);
  }

  async comparePassword(
    plainTextPassword: string,
    hashedPassword: string,
  ): Promise<boolean> {
    return bcrypt.compare(plainTextPassword, hashedPassword);
  }

  encrypt(text: string): string {
    const iv = crypto.randomBytes(this.ivLength);
    const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    // Return iv + encrypted data
    return iv.toString('hex') + ':' + encrypted;
  }

  decrypt(encryptedText: string): string {
    const textParts = encryptedText.split(':');
    const iv = Buffer.from(textParts.shift()!, 'hex');
    const encrypted = textParts.join(':');
    
    const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }

  generateRandomString(length = 32): string {
    return crypto.randomBytes(Math.ceil(length / 2))
      .toString('hex')
      .slice(0, length);
  }

  generateKeyPair(): { publicKey: string; privateKey: string } {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 4096,
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem',
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem',
        cipher: 'aes-256-cbc',
        passphrase: this.configService.get<string>('RSA_PASSPHRASE') || '',
      },
    });

    return { publicKey, privateKey };
  }

  createHmac(data: string, secret: string): string {
    return crypto
      .createHmac('sha256', secret)
      .update(data)
      .digest('hex');
  }

  verifyHmac(data: string, hash: string, secret: string): boolean {
    const computedHash = this.createHmac(data, secret);
    return crypto.timingSafeEqual(
      Buffer.from(computedHash, 'hex'),
      Buffer.from(hash, 'hex'),
    );
  }
}
