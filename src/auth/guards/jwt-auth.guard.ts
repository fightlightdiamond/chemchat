import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
  CanActivate,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request, Response } from 'express';
import { TokenService } from '../services/token.service';
import { TokenRevocationService } from '../services/token-revocation.service';
import { AuthService } from '../services/auth.service';
import { SecurityMonitoringService } from '../services/security-monitoring.service';
import { RateLimitingService } from '../services/rate-limiting.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly tokenService: TokenService,
    private readonly tokenRevocationService: TokenRevocationService,
    private readonly authService: AuthService,
    private readonly reflector: Reflector,
    private readonly securityMonitoringService: SecurityMonitoringService,
    private readonly rateLimitingService: RateLimitingService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check if route is marked as public
    const isPublic = this.reflector.getAllAndOverride<boolean>('isPublic', [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers.authorization;

    if (!authHeader) {
      throw new UnauthorizedException('Authorization header is missing');
    }

    const token = this.tokenService.extractTokenFromHeader(authHeader);
    if (!token) {
      throw new UnauthorizedException('Invalid authorization header format');
    }

    try {
      // Validate token format and signature
      const payload = await this.tokenService.validateAccessToken(token);

      // Check if token is revoked
      const isRevoked = this.tokenRevocationService.isTokenRevoked(token);
      if (isRevoked) {
        throw new UnauthorizedException('Token has been revoked');
      }

      // Check if all user tokens are revoked
      const areUserTokensRevoked =
        this.tokenRevocationService.areUserTokensRevoked(
          payload.sub,
          payload.iat!,
        );
      if (areUserTokensRevoked) {
        throw new UnauthorizedException('All user tokens have been revoked');
      }

      // Check for suspicious activity
      const isSuspicious = this.securityMonitoringService.detectTokenTheft(
        payload.sub,
        request.ip || '',
        request.headers['user-agent'] || '',
        payload.iat || 0,
      );
      if (isSuspicious) {
        throw new UnauthorizedException('Suspicious activity detected');
      }

      // Check if session tokens are revoked
      const areSessionTokensRevoked =
        this.tokenRevocationService.areSessionTokensRevoked(
          payload.sub,
          payload.sessionId,
          payload.iat!,
        );
      if (areSessionTokensRevoked) {
        throw new UnauthorizedException('Session tokens have been revoked');
      }

      // Check rate limiting
      const rateLimitResult = this.rateLimitingService.checkApiRateLimit(
        payload.sub,
      );
      if (!rateLimitResult.allowed) {
        throw new UnauthorizedException('Rate limit exceeded');
      }

      // Validate user and attach to request
      const user = await this.authService.validateUser(payload);
      (request as Request & { user: any }).user = user;

      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid token');
    }
  }
}
