import { Injectable, UnauthorizedException, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { TokenService } from './token.service';
import { MfaService } from './mfa.service';
import { TokenRevocationService } from './token-revocation.service';
import {
  LoginRequest,
  LoginResponse,
  RefreshTokenRequest,
  LogoutRequest,
  AuthenticatedUser,
} from '../interfaces/auth.interface';
import { DeviceFingerprint } from '../interfaces/token.interface';
import { UserRepository } from '../../shared/domain/repositories/user.repository';

@Injectable()
export class AuthService {
  constructor(
    private readonly tokenService: TokenService,
    private readonly mfaService: MfaService,
    private readonly tokenRevocationService: TokenRevocationService,
    @Inject('UserRepository') private readonly userRepository: UserRepository,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Authenticate user with email and password
   */
  async login(loginRequest: LoginRequest): Promise<LoginResponse> {
    const { email, password, deviceFingerprint, mfaCode } = loginRequest;

    // Find user by email
    const user = await this.userRepository.findByEmail(email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Check if user is active
    if (!user.isActive) {
      throw new UnauthorizedException('Account is deactivated');
    }

    // Handle MFA if enabled
    if (user.mfaEnabled) {
      if (!mfaCode) {
        // Generate temporary MFA token
        const mfaToken = await this.generateMfaToken(
          user.id,
          user.email,
          user.tenantId,
        );
        return {
          requiresMfa: true,
          mfaToken,
          user: {
            id: user.id,
            email: user.email,
            tenantId: user.tenantId,
            mfaEnabled: user.mfaEnabled,
          },
        } as LoginResponse;
      }

      // Verify MFA code
      const isMfaValid = this.mfaService.verifyTotp(user.mfaSecret!, mfaCode);
      if (!isMfaValid) {
        throw new UnauthorizedException('Invalid MFA code');
      }
    }

    // Generate token pair
    const tokenPair = await this.tokenService.generateTokenPair(
      user.id,
      user.email,
      user.tenantId,
      deviceFingerprint,
    );

    // Update last login
    await this.userRepository.updateLastLogin(user.id);

    return {
      ...tokenPair,
      user: {
        id: user.id,
        email: user.email,
        tenantId: user.tenantId,
        mfaEnabled: user.mfaEnabled,
      },
    };
  }

  /**
   * Complete MFA login with temporary MFA token
   */
  async completeMfaLogin(
    mfaToken: string,
    mfaCode: string,
    deviceFingerprint: DeviceFingerprint,
  ): Promise<LoginResponse> {
    // Validate MFA token
    const mfaPayload = await this.validateMfaToken(mfaToken);

    // Get user
    const user = await this.userRepository.findById(mfaPayload.sub);
    if (!user) {
      throw new UnauthorizedException('Invalid MFA token');
    }

    // Verify MFA code
    const isMfaValid = this.mfaService.verifyTotp(user.mfaSecret!, mfaCode);
    if (!isMfaValid) {
      throw new UnauthorizedException('Invalid MFA code');
    }

    // Generate token pair
    const tokenPair = await this.tokenService.generateTokenPair(
      user.id,
      user.email,
      user.tenantId,
      deviceFingerprint,
    );

    // Update last login
    await this.userRepository.updateLastLogin(user.id);

    return {
      ...tokenPair,
      user: {
        id: user.id,
        email: user.email,
        tenantId: user.tenantId,
        mfaEnabled: user.mfaEnabled,
      },
    };
  }

  /**
   * Refresh access token
   */
  async refreshToken(
    refreshRequest: RefreshTokenRequest,
  ): Promise<LoginResponse> {
    const { refreshToken, deviceFingerprint } = refreshRequest;

    // Check if token is revoked
    const isRevoked = this.tokenRevocationService.isTokenRevoked(refreshToken);
    if (isRevoked) {
      throw new UnauthorizedException('Token has been revoked');
    }

    // Refresh token
    const tokenPair = await this.tokenService.refreshAccessToken(
      refreshToken,
      deviceFingerprint,
    );

    // Get user info from token
    const payload = await this.tokenService.validateRefreshToken(
      refreshToken,
      deviceFingerprint,
    );
    const user = await this.userRepository.findById(payload.sub);

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return {
      ...tokenPair,
      user: {
        id: user.id,
        email: user.email,
        tenantId: user.tenantId,
        mfaEnabled: user.mfaEnabled,
      },
    };
  }

  /**
   * Logout user
   */
  logout(logoutRequest: LogoutRequest, userId: string): void {
    const { refreshToken, sessionId, allDevices } = logoutRequest;

    if (allDevices) {
      // Revoke all tokens for user
      this.tokenRevocationService.revokeAllUserTokens(userId);
    } else if (refreshToken) {
      // Revoke the refresh token
      this.tokenRevocationService.revokeToken(refreshToken);
    } else if (sessionId) {
      // Revoke tokens for specific session
      this.tokenRevocationService.revokeSessionTokens(userId, sessionId);
    }
  }

  /**
   * Validate user from token payload
   */
  async validateUser(payload: {
    sub: string;
    sessionId: string;
    deviceId?: string;
  }): Promise<AuthenticatedUser> {
    const user = await this.userRepository.findById(payload.sub);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or inactive');
    }

    return {
      id: user.id,
      email: user.email,
      tenantId: user.tenantId,
      sessionId: payload.sessionId,
      deviceId: payload.deviceId,
    };
  }

  /**
   * Generate WebSocket token for authenticated user
   */
  async generateWebSocketToken(
    user: AuthenticatedUser,
  ): Promise<{ wsToken: string; expiresIn: number }> {
    return this.tokenService.generateWebSocketToken(
      user.id,
      user.email,
      user.tenantId,
      user.sessionId,
    );
  }

  /**
   * Change user password
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(
      currentPassword,
      user.passwordHash,
    );
    if (!isCurrentPasswordValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    // Hash the new password
    const saltRounds = this.configService.get<number>('BCRYPT_SALT_ROUNDS', 12);
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    // Update password in database
    await this.userRepository.updatePassword(userId, hashedPassword);

    // Revoke all existing tokens to force re-login
    this.tokenRevocationService.revokeAllUserTokens(userId);
  }

  /**
   * Generate temporary MFA token
   */
  private async generateMfaToken(
    userId: string,
    email: string,
    tenantId: string,
  ): Promise<string> {
    const payload = {
      sub: userId,
      email,
      tenantId,
      type: 'mfa',
    };

    return this.tokenService['jwtService'].signAsync(payload, {
      secret: this.configService.get<string>('JWT_MFA_SECRET', 'mfa-secret'),
      expiresIn: '5m', // MFA token expires in 5 minutes
    });
  }

  /**
   * Validate temporary MFA token
   */
  private async validateMfaToken(
    token: string,
  ): Promise<{ sub: string; email: string; tenantId: string }> {
    try {
      return await this.tokenService['jwtService'].verifyAsync(token, {
        secret: this.configService.get<string>('JWT_MFA_SECRET', 'mfa-secret'),
      });
    } catch {
      throw new UnauthorizedException('Invalid MFA token');
    }
  }
}
