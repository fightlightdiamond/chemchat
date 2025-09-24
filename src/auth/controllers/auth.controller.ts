import {
  Controller,
  Post,
  Body,
  UseGuards,
  Get,
  HttpStatus,
  HttpCode,
  Ip,
  Headers,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiBearerAuth,
} from '@nestjs/swagger';
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
import {
  LoginRequestDto,
  LoginResponseDto,
  RefreshTokenRequestDto,
  LogoutRequestDto,
  MfaCompleteRequestDto,
  AuthenticatedUserDto,
  ChangePasswordDto,
  MfaSetupDto,
  WebSocketTokenResponseDto,
} from '../dto/auth.dto';

@ApiTags('auth-hot-reload-test')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly mfaService: MfaService,
    private readonly rateLimitingService: RateLimitingService,
    private readonly securityMonitoringService: SecurityMonitoringService,
  ) {}

  @ApiOperation({
    summary: 'User login',
    description: 'Authenticate user with email and password - HOT RELOAD TEST',
  })
  @ApiBody({ type: LoginRequestDto })
  @ApiResponse({
    status: 200,
    description: 'Login successful',
    type: LoginResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  @ApiResponse({ status: 429, description: 'Too many login attempts' })
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

  @ApiOperation({
    summary: 'Complete MFA login',
    description: 'Complete multi-factor authentication login',
  })
  @ApiBody({ type: MfaCompleteRequestDto })
  @ApiResponse({
    status: 200,
    description: 'MFA login completed',
    type: LoginResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Invalid MFA code' })
  @ApiResponse({ status: 429, description: 'Too many MFA attempts' })
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

  @ApiOperation({
    summary: 'Refresh token',
    description: 'Refresh JWT access token using refresh token',
  })
  @ApiBody({ type: RefreshTokenRequestDto })
  @ApiResponse({
    status: 200,
    description: 'Token refreshed successfully',
    type: LoginResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Invalid refresh token' })
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

  @ApiOperation({
    summary: 'User logout',
    description: 'Logout user and invalidate tokens',
  })
  @ApiBearerAuth('JWT-auth')
  @ApiBody({ type: LogoutRequestDto })
  @ApiResponse({ status: 204, description: 'Logout successful' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  logout(
    @Body() logoutRequest: LogoutRequest,
    @CurrentUser() user: AuthenticatedUser,
  ): void {
    this.authService.logout(logoutRequest, user.id);
  }

  @ApiOperation({
    summary: 'Get user profile',
    description: 'Get current authenticated user profile',
  })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({
    status: 200,
    description: 'User profile retrieved',
    type: AuthenticatedUserDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @UseGuards(JwtAuthGuard)
  @Get('me')
  getProfile(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }

  @ApiOperation({
    summary: 'Get WebSocket token',
    description: 'Generate token for WebSocket authentication',
  })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({
    status: 200,
    description: 'WebSocket token generated',
    type: WebSocketTokenResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @UseGuards(JwtAuthGuard)
  @Post('websocket-token')
  @HttpCode(HttpStatus.OK)
  async getWebSocketToken(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ wsToken: string; expiresIn: number }> {
    return this.authService.generateWebSocketToken(user);
  }

  @ApiOperation({
    summary: 'Change password',
    description: 'Change user password',
  })
  @ApiBearerAuth('JWT-auth')
  @ApiBody({ type: ChangePasswordDto })
  @ApiResponse({ status: 204, description: 'Password changed successfully' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized or invalid current password',
  })
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

  @ApiOperation({
    summary: 'Setup MFA',
    description: 'Generate MFA setup QR code and secret',
  })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 200, description: 'MFA setup data generated' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @UseGuards(JwtAuthGuard)
  @Post('mfa/setup')
  async setupMfa(@CurrentUser() user: AuthenticatedUser) {
    return this.mfaService.generateMfaSetup(user.email);
  }

  @ApiOperation({
    summary: 'Verify MFA setup',
    description: 'Verify MFA setup with TOTP token',
  })
  @ApiBearerAuth('JWT-auth')
  @ApiBody({ type: MfaSetupDto })
  @ApiResponse({
    status: 200,
    description: 'MFA verification result',
    schema: { type: 'object', properties: { success: { type: 'boolean' } } },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
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

  @ApiOperation({
    summary: 'Get security events',
    description: 'Get user security events and login history',
  })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({
    status: 200,
    description: 'Security events retrieved',
    schema: { type: 'array', items: { type: 'object' } },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @UseGuards(JwtAuthGuard)
  @Get('security/events')
  getSecurityEvents(@CurrentUser() user: AuthenticatedUser): any[] {
    return this.securityMonitoringService.getUserSecurityEvents(user.id);
  }
}
