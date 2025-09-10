import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { TokenService } from '../services/token.service';
import { TokenRevocationService } from '../services/token-revocation.service';
import { AuthService } from '../services/auth.service';

@Injectable()
export class WebSocketAuthGuard implements CanActivate {
  constructor(
    private readonly tokenService: TokenService,
    private readonly tokenRevocationService: TokenRevocationService,
    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const client = context.switchToWs().getClient();
      // Extract token from handshake auth or query
      const token = this.extractTokenFromSocket(client);
      if (!token) {
        throw new WsException('Authentication token is missing');
      }

      // Validate WebSocket token
      const payload = await this.tokenService.validateWebSocketToken(token);

      // Check if token is revoked
      const isRevoked = this.tokenRevocationService.isTokenRevoked(token);
      if (isRevoked) {
        throw new WsException('Token has been revoked');
      }

      // Check if all user tokens are revoked
      const areUserTokensRevoked =
        this.tokenRevocationService.areUserTokensRevoked(
          payload.sub,
          payload.iat!,
        );
      if (areUserTokensRevoked) {
        throw new WsException('All user tokens have been revoked');
      }

      // Check if session tokens are revoked
      const areSessionTokensRevoked =
        this.tokenRevocationService.areSessionTokensRevoked(
          payload.sub,
          payload.sessionId,
          payload.iat!,
        );
      if (areSessionTokensRevoked) {
        throw new WsException('Session tokens have been revoked');
      }

      // Validate user and attach to socket
      const user = await this.authService.validateUser(payload);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if (client.data) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        client.data.user = user;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        client.data.connectionId = payload.connectionId;
      }

      return true;
    } catch (error) {
      if (error instanceof WsException) {
        throw error;
      }
      throw new WsException('Invalid authentication token');
    }
  }

  /**
   * Extract token from WebSocket connection
   */
  private extractTokenFromSocket(client: any): string | null {
    // Try to get token from handshake auth
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const authHeader =
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      client.handshake.auth?.token ||
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      client.handshake.headers?.authorization;
    if (authHeader) {
      if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
        return authHeader.substring(7);
      }
      if (typeof authHeader === 'string' && !authHeader.startsWith('Bearer ')) {
        return authHeader;
      }
    }

    // Try to get token from query parameters
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
    const queryToken = client.handshake.query?.token;
    if (queryToken && typeof queryToken === 'string') {
      return queryToken;
    }

    return null;
  }
}
