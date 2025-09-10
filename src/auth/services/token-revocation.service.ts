import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';

@Injectable()
export class TokenRevocationService {
  private readonly redisKeyPrefix: string;
  private readonly defaultTtl: number;

  constructor(
    private readonly configService: ConfigService,
    // Note: Redis client would be injected here in a real implementation
    // private readonly redisClient: Redis,
  ) {
    this.redisKeyPrefix = this.configService.get<string>(
      'REDIS_TOKEN_REVOCATION_PREFIX',
      'revoked_tokens:',
    );
    this.defaultTtl = this.configService.get<number>(
      'TOKEN_REVOCATION_TTL',
      604800,
    ); // 7 days
  }

  /**
   * Revoke a specific token
   */
  revokeToken(token: string, ttl?: number): void {
    const tokenHash = this.hashToken(token);
    const key = `${this.redisKeyPrefix}${tokenHash}`;
    const expiry = ttl || this.defaultTtl;

    // In a real implementation, this would use Redis
    // await this.redisClient.setex(key, expiry, '1');

    // For now, we'll use an in-memory store (not suitable for production)
    this.inMemoryRevokedTokens.set(key, {
      revokedAt: Date.now(),
      expiresAt: Date.now() + expiry * 1000,
    });
  }

  /**
   * Check if a token is revoked
   */
  isTokenRevoked(token: string): boolean {
    const tokenHash = this.hashToken(token);
    const key = `${this.redisKeyPrefix}${tokenHash}`;

    // In a real implementation, this would use Redis
    // const result = await this.redisClient.get(key);
    // return result !== null;

    // For now, check in-memory store
    const revokedToken = this.inMemoryRevokedTokens.get(key);
    if (!revokedToken) {
      return false;
    }

    // Check if the revocation has expired
    if (Date.now() > revokedToken.expiresAt) {
      this.inMemoryRevokedTokens.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Revoke all tokens for a specific user
   */
  revokeAllUserTokens(userId: string): void {
    // In a real implementation, this would:
    // 1. Add user to a revoked users set with timestamp
    // 2. All token validations would check this set first
    // await this.redisClient.setex(userKey, this.defaultTtl, Date.now().toString());

    // For now, use in-memory store
    this.inMemoryRevokedUsers.set(userId, Date.now());
  }

  /**
   * Revoke all tokens for a specific session
   */
  revokeSessionTokens(userId: string, sessionId: string): void {
    // In a real implementation, this would use Redis
    // await this.redisClient.setex(sessionKey, this.defaultTtl, Date.now().toString());

    // For now, use in-memory store
    this.inMemoryRevokedSessions.set(`${userId}:${sessionId}`, Date.now());
  }

  /**
   * Check if all user tokens are revoked
   */
  areUserTokensRevoked(userId: string, tokenIssuedAt: number): boolean {
    // In a real implementation, this would use Redis
    // const userRevocationTime = await this.redisClient.get(`${this.redisKeyPrefix}user:${userId}`);
    // if (userRevocationTime) {
    //   return parseInt(userRevocationTime) > tokenIssuedAt * 1000;
    // }

    // For now, check in-memory store
    const userRevocationTime = this.inMemoryRevokedUsers.get(userId);
    if (userRevocationTime) {
      return userRevocationTime > tokenIssuedAt * 1000;
    }

    return false;
  }

  /**
   * Check if session tokens are revoked
   */
  areSessionTokensRevoked(
    userId: string,
    sessionId: string,
    tokenIssuedAt: number,
  ): boolean {
    // In a real implementation, this would use Redis
    // const sessionRevocationTime = await this.redisClient.get(`${this.redisKeyPrefix}session:${userId}:${sessionId}`);
    // if (sessionRevocationTime) {
    //   return parseInt(sessionRevocationTime) > tokenIssuedAt * 1000;
    // }

    // For now, check in-memory store
    const sessionRevocationTime = this.inMemoryRevokedSessions.get(
      `${userId}:${sessionId}`,
    );
    if (sessionRevocationTime) {
      return sessionRevocationTime > tokenIssuedAt * 1000;
    }

    return false;
  }

  /**
   * Clean up expired revocation entries
   */
  cleanupExpiredRevocations(): void {
    const now = Date.now();

    // Clean up expired tokens
    for (const [key, value] of this.inMemoryRevokedTokens.entries()) {
      if (now > value.expiresAt) {
        this.inMemoryRevokedTokens.delete(key);
      }
    }

    // In a real implementation, this would be handled by Redis TTL
    // and you might run a periodic cleanup job
  }

  /**
   * Hash token for storage (to avoid storing actual tokens)
   */
  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  // In-memory stores (for development only - use Redis in production)
  private readonly inMemoryRevokedTokens = new Map<
    string,
    { revokedAt: number; expiresAt: number }
  >();
  private readonly inMemoryRevokedUsers = new Map<string, number>();
  private readonly inMemoryRevokedSessions = new Map<string, number>();
}
