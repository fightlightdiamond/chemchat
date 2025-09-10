export interface TokenPayload {
  sub: string; // user ID
  email: string;
  tenantId: string;
  deviceId?: string;
  sessionId: string;
  iat?: number;
  exp?: number;
}

export interface RefreshTokenPayload {
  sub: string;
  email: string;
  tenantId: string;
  deviceId: string;
  sessionId: string;
  fingerprint: string;
  iat?: number;
  exp?: number;
}

export interface WebSocketTokenPayload {
  sub: string;
  email: string;
  tenantId: string;
  sessionId: string;
  connectionId: string;
  iat?: number;
  exp?: number;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  refreshExpiresIn: number;
}

export interface WebSocketTokenResponse {
  wsToken: string;
  expiresIn: number;
}

export interface DeviceFingerprint {
  userAgent: string;
  ipAddress: string;
  acceptLanguage?: string;
  timezone?: string;
}
