export interface LoginRequest {
  email: string;
  password: string;
  deviceFingerprint: {
    userAgent: string;
    ipAddress: string;
    acceptLanguage?: string;
    timezone?: string;
  };
  mfaCode?: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  refreshExpiresIn: number;
  user: {
    id: string;
    email: string;
    tenantId: string;
    mfaEnabled: boolean;
  };
  requiresMfa?: boolean;
  mfaToken?: string;
}

export interface RefreshTokenRequest {
  refreshToken: string;
  deviceFingerprint: {
    userAgent: string;
    ipAddress: string;
    acceptLanguage?: string;
    timezone?: string;
  };
}

export interface LogoutRequest {
  refreshToken?: string;
  sessionId?: string;
  allDevices?: boolean;
}

export interface MfaSetupResponse {
  secret: string;
  qrCodeUrl: string;
  backupCodes: string[];
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  tenantId: string;
  sessionId: string;
  deviceId?: string;
}
