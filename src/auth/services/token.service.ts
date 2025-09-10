import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'crypto';
import {
  TokenPayload,
  RefreshTokenPayload,
  WebSocketTokenPayload,
  TokenPair,
  WebSocketTokenResponse,
  DeviceFingerprint,
} from '../interfaces/token.interface';

@Injectable()
export class TokenService {
  private readonly accessTokenSecret: string;
  private readonly refreshTokenSecret: string;
  private readonly wsTokenSecret: string;
  private readonly accessTokenExpiry: string;
  private readonly refreshTokenExpiry: string;
  private readonly wsTokenExpiry: string;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    this.accessTokenSecret = this.configService.get<string>(
      'JWT_ACCESS_SECRET',
      'access-secret',
    );
    this.refreshTokenSecret = this.configService.get<string>(
      'JWT_REFRESH_SECRET',
      'refresh-secret',
    );
    this.wsTokenSecret = this.configService.get<string>(
      'JWT_WS_SECRET',
      'ws-secret',
    );
    this.accessTokenExpiry = this.configService.get<string>(
      'JWT_ACCESS_EXPIRES_IN',
      '15m',
    );
    this.refreshTokenExpiry = this.configService.get<string>(
      'JWT_REFRESH_EXPIRES_IN',
      '7d',
    );
    this.wsTokenExpiry = this.configService.get<string>(
      'JWT_WS_EXPIRES_IN',
      '1h',
    );
  }

  /**
   * Generate access and refresh token pair
   */
  async generateTokenPair(
    userId: string,
    email: string,
    tenantId: string,
    deviceFingerprint: DeviceFingerprint,
    deviceId?: string,
  ): Promise<TokenPair> {
    const sessionId = this.generateSessionId();
    const fingerprint = this.generateFingerprint(deviceFingerprint);

    const accessTokenPayload: TokenPayload = {
      sub: userId,
      email,
      tenantId,
      deviceId,
      sessionId,
    };

    const refreshTokenPayload: RefreshTokenPayload = {
      sub: userId,
      email,
      tenantId,
      deviceId: deviceId || this.generateDeviceId(),
      sessionId,
      fingerprint,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(accessTokenPayload, {
        secret: this.accessTokenSecret,
        expiresIn: this.accessTokenExpiry,
      }),
      this.jwtService.signAsync(refreshTokenPayload, {
        secret: this.refreshTokenSecret,
        expiresIn: this.refreshTokenExpiry,
      }),
    ]);

    return {
      accessToken,
      refreshToken,
      expiresIn: this.parseExpiryToSeconds(this.accessTokenExpiry),
      refreshExpiresIn: this.parseExpiryToSeconds(this.refreshTokenExpiry),
    };
  }

  /**
   * Generate WebSocket token for real-time connections
   */
  async generateWebSocketToken(
    userId: string,
    email: string,
    tenantId: string,
    sessionId: string,
  ): Promise<WebSocketTokenResponse> {
    const connectionId = this.generateConnectionId();

    const wsTokenPayload: WebSocketTokenPayload = {
      sub: userId,
      email,
      tenantId,
      sessionId,
      connectionId,
    };

    const wsToken = await this.jwtService.signAsync(wsTokenPayload, {
      secret: this.wsTokenSecret,
      expiresIn: this.wsTokenExpiry,
    });

    return {
      wsToken,
      expiresIn: this.parseExpiryToSeconds(this.wsTokenExpiry),
    };
  }

  /**
   * Validate and decode access token
   */
  async validateAccessToken(token: string): Promise<TokenPayload> {
    try {
      return await this.jwtService.verifyAsync<TokenPayload>(token, {
        secret: this.accessTokenSecret,
      });
    } catch {
      throw new UnauthorizedException('Invalid access token');
    }
  }

  /**
   * Validate and decode refresh token
   */
  async validateRefreshToken(
    token: string,
    deviceFingerprint: DeviceFingerprint,
  ): Promise<RefreshTokenPayload> {
    try {
      const payload = await this.jwtService.verifyAsync<RefreshTokenPayload>(
        token,
        {
          secret: this.refreshTokenSecret,
        },
      );

      // Verify device fingerprint
      const expectedFingerprint = this.generateFingerprint(deviceFingerprint);
      if (payload.fingerprint !== expectedFingerprint) {
        throw new UnauthorizedException('Device fingerprint mismatch');
      }

      return payload;
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  /**
   * Validate and decode WebSocket token
   */
  async validateWebSocketToken(token: string): Promise<WebSocketTokenPayload> {
    try {
      return await this.jwtService.verifyAsync<WebSocketTokenPayload>(token, {
        secret: this.wsTokenSecret,
      });
    } catch {
      throw new UnauthorizedException('Invalid WebSocket token');
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(
    refreshToken: string,
    deviceFingerprint: DeviceFingerprint,
  ): Promise<TokenPair> {
    const refreshPayload = await this.validateRefreshToken(
      refreshToken,
      deviceFingerprint,
    );

    return this.generateTokenPair(
      refreshPayload.sub,
      refreshPayload.email,
      refreshPayload.tenantId,
      deviceFingerprint,
      refreshPayload.deviceId,
    );
  }

  /**
   * Extract token from Authorization header
   */
  extractTokenFromHeader(authHeader: string): string | null {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }
    return authHeader.substring(7);
  }

  /**
   * Generate session ID
   */
  private generateSessionId(): string {
    return randomBytes(16).toString('hex');
  }

  /**
   * Generate device ID
   */
  private generateDeviceId(): string {
    return randomBytes(12).toString('hex');
  }

  /**
   * Generate connection ID for WebSocket
   */
  private generateConnectionId(): string {
    return randomBytes(8).toString('hex');
  }

  /**
   * Generate device fingerprint hash
   */
  private generateFingerprint(deviceFingerprint: DeviceFingerprint): string {
    const fingerprintString = [
      deviceFingerprint.userAgent,
      deviceFingerprint.ipAddress,
      deviceFingerprint.acceptLanguage || '',
      deviceFingerprint.timezone || '',
    ].join('|');

    return createHash('sha256').update(fingerprintString).digest('hex');
  }

  /**
   * Parse expiry string to seconds
   */
  private parseExpiryToSeconds(expiry: string): number {
    const match = expiry.match(/^(\d+)([smhd])$/);
    if (!match) return 3600; // default 1 hour

    const value = parseInt(match[1]);
    const unit = match[2];

    switch (unit) {
      case 's':
        return value;
      case 'm':
        return value * 60;
      case 'h':
        return value * 3600;
      case 'd':
        return value * 86400;
      default:
        return 3600;
    }
  }
}
