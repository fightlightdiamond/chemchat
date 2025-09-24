import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, IsOptional, IsObject } from 'class-validator';

export class LoginRequestDto {
  @ApiProperty({ example: 'alice@example.com', description: 'User email address' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'password123', description: 'User password' })
  @IsString()
  password: string;

  @ApiProperty({ 
    required: false,
    description: 'Device fingerprint for security tracking',
    example: { userAgent: 'Mozilla/5.0...', screen: '1920x1080' }
  })
  @IsOptional()
  @IsObject()
  deviceFingerprint?: Record<string, any>;
}

export class LoginResponseDto {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...', description: 'JWT access token' })
  accessToken: string;

  @ApiProperty({ example: 'refresh_token_here', description: 'Refresh token for token renewal' })
  refreshToken: string;

  @ApiProperty({ example: 3600, description: 'Token expiration time in seconds' })
  expiresIn: number;

  @ApiProperty({ 
    description: 'User information',
    example: {
      id: 'user-id',
      email: 'alice@example.com',
      name: 'Alice Smith',
      tenantId: 'tenant-id'
    }
  })
  user: {
    id: string;
    email: string;
    name: string;
    tenantId: string;
  };

  @ApiProperty({ required: false, example: 'mfa_token_here', description: 'MFA token if MFA is required' })
  mfaToken?: string;

  @ApiProperty({ required: false, example: true, description: 'Whether MFA is required' })
  requiresMfa?: boolean;
}

export class RefreshTokenRequestDto {
  @ApiProperty({ example: 'refresh_token_here', description: 'Refresh token' })
  @IsString()
  refreshToken: string;

  @ApiProperty({ 
    required: false,
    description: 'Device fingerprint for security tracking',
    example: { userAgent: 'Mozilla/5.0...', screen: '1920x1080' }
  })
  @IsOptional()
  @IsObject()
  deviceFingerprint?: Record<string, any>;
}

export class LogoutRequestDto {
  @ApiProperty({ example: 'refresh_token_here', description: 'Refresh token to invalidate' })
  @IsString()
  refreshToken: string;

  @ApiProperty({ required: false, example: true, description: 'Logout from all devices' })
  @IsOptional()
  allDevices?: boolean;
}

export class MfaCompleteRequestDto {
  @ApiProperty({ example: 'mfa_token_here', description: 'MFA token from login response' })
  @IsString()
  mfaToken: string;

  @ApiProperty({ example: '123456', description: '6-digit MFA code from authenticator app' })
  @IsString()
  mfaCode: string;

  @ApiProperty({ 
    required: false,
    description: 'Device fingerprint for security tracking',
    example: { userAgent: 'Mozilla/5.0...', screen: '1920x1080' }
  })
  @IsOptional()
  @IsObject()
  deviceFingerprint?: Record<string, any>;
}

export class AuthenticatedUserDto {
  @ApiProperty({ example: 'user-id', description: 'User ID' })
  id: string;

  @ApiProperty({ example: 'alice@example.com', description: 'User email' })
  email: string;

  @ApiProperty({ example: 'Alice Smith', description: 'User display name' })
  name: string;

  @ApiProperty({ example: 'tenant-id', description: 'Tenant ID' })
  tenantId: string;

  @ApiProperty({ example: ['user'], description: 'User roles' })
  roles: string[];

  @ApiProperty({ example: { theme: 'dark' }, description: 'User preferences' })
  preferences: Record<string, any>;
}

export class ChangePasswordDto {
  @ApiProperty({ example: 'current_password', description: 'Current password' })
  @IsString()
  currentPassword: string;

  @ApiProperty({ example: 'new_password', description: 'New password' })
  @IsString()
  newPassword: string;
}

export class MfaSetupDto {
  @ApiProperty({ example: 'JBSWY3DPEHPK3PXP', description: 'MFA secret key' })
  @IsString()
  secret: string;

  @ApiProperty({ example: '123456', description: '6-digit verification code' })
  @IsString()
  token: string;
}

export class WebSocketTokenResponseDto {
  @ApiProperty({ example: 'ws_token_here', description: 'WebSocket authentication token' })
  wsToken: string;

  @ApiProperty({ example: 3600, description: 'Token expiration time in seconds' })
  expiresIn: number;
}
