import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Get,
  Ip,
  Headers,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from '../services/auth.service';
import { MfaService } from '../services/mfa.service';
import { RateLimitingService } from '../services/rate-limiting.service';
import { SecurityMonitoringService } from '../services/security-monitoring.service';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { Public } from '../decorators/public.decorator';
import { CurrentUser } from '../decorators/current-user.decorator';
import {
  LoginRequest,
  LoginResponse,
  RefreshTokenRequest,
  LogoutRequest,
  AuthenticatedUser,
} from '../interfaces/auth.interface';
import { MfaCompleteRequest } from '../interfaces/request.interface';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly mfaService: MfaService,
    private readonly rateLimitingService: RateLimitingService,
    private readonly securityMonitoringService: SecurityMonitoringService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() loginRequest: LoginRequest,
    @Ip() ipAddress: string,
    @Headers('user-agent') userAgent: string,
  ): Promise<LoginResponse> {
    // Check rate limiting
    const rateLimitResult = this.rateLimitingService.checkLoginRateLimit(
      `${loginRequest.email}:${ipAddress}`,
    );

    if (!rateLimitResult.allowed) {
      throw new Error(
        `Too many login attempts. Try again in ${rateLimitResult.retryAfter} seconds.`,
      );
    }

    // Add IP and user agent to device fingerprint
    const deviceFingerprint = {
      ...loginRequest.deviceFingerprint,
      ipAddress,
      userAgent,
    };

    try {
      const result = await this.authService.login({
        ...loginRequest,
        deviceFingerprint,
      });

      // Log security event
      this.securityMonitoringService.analyzeLoginAttempt(
        result.user?.id || 'unknown',
        ipAddress,
        userAgent,
        true,
      );

      return result;
    } catch (error) {
      // Log failed attempt
      this.securityMonitoringService.analyzeLoginAttempt(
        'unknown',
        ipAddress,
        userAgent,
        false,
      );

      throw error;
    }
  }

  @Public()
  @Post('mfa/complete')
  @HttpCode(HttpStatus.OK)
  async completeMfaLogin(
    @Body()
    body: MfaCompleteRequest,
    @Ip() ipAddress: string,
    @Headers('user-agent') userAgent: string,
  ): Promise<LoginResponse> {
    // Check MFA rate limiting
    const rateLimitResult = this.rateLimitingService.checkMfaRateLimit(
      `${body.mfaToken}:${ipAddress}`,
    );

    if (!rateLimitResult.allowed) {
      throw new Error(
        `Too many MFA attempts. Try again in ${rateLimitResult.retryAfter} seconds.`,
      );
    }

    const deviceFingerprint = {
      ...body.deviceFingerprint,
      ipAddress,
      userAgent,
    };

    return this.authService.completeMfaLogin(
      body.mfaToken,
      body.mfaCode,
      deviceFingerprint,
    );
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refreshToken(
    @Body() refreshRequest: RefreshTokenRequest,
    @Ip() ipAddress: string,
    @Headers('user-agent') userAgent: string,
  ): Promise<LoginResponse> {
    const deviceFingerprint = {
      ...refreshRequest.deviceFingerprint,
      ipAddress,
      userAgent,
    };

    return this.authService.refreshToken({
      ...refreshRequest,
      deviceFingerprint,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  logout(
    @Body() logoutRequest: LogoutRequest,
    @CurrentUser() user: AuthenticatedUser,
  ): void {
    this.authService.logout(logoutRequest, user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  getProfile(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }

  @UseGuards(JwtAuthGuard)
  @Post('websocket-token')
  @HttpCode(HttpStatus.OK)
  async getWebSocketToken(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ wsToken: string; expiresIn: number }> {
    return this.authService.generateWebSocketToken(user);
  }

  @UseGuards(JwtAuthGuard)
  @Post('change-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async changePassword(
    @Body() body: { currentPassword: string; newPassword: string },
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.authService.changePassword(
      user.id,
      body.currentPassword,
      body.newPassword,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post('mfa/setup')
  async setupMfa(@CurrentUser() user: AuthenticatedUser) {
    return this.mfaService.generateMfaSetup(user.email);
  }

  @UseGuards(JwtAuthGuard)
  @Post('mfa/verify-setup')
  @HttpCode(HttpStatus.OK)
  verifyMfaSetup(@Body() body: { secret: string; token: string }): {
    success: boolean;
  } {
    const isValid = this.mfaService.verifyTotp(body.secret, body.token);

    if (isValid) {
      // In a real implementation, you would save the MFA secret to the user's profile
      // await this.userRepository.enableMfa(user.id, body.secret);
    }

    return { success: isValid };
  }

  @UseGuards(JwtAuthGuard)
  @Get('security/events')
  getSecurityEvents(@CurrentUser() user: AuthenticatedUser): any[] {
    return this.securityMonitoringService.getUserSecurityEvents(user.id);
  }
}
