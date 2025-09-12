import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { TokenService } from '../services/token.service';
import { TokenRevocationService } from '../services/token-revocation.service';
import { AuthService } from '../services/auth.service';

// Socket client interface based on NestJS WebSocket context
interface SocketClient {
  handshake: {
    auth?: Record<string, unknown>;
    headers?: Record<string, string | string[]>;
    query?: Record<string, string | string[]>;
  };
  data: {
    userId?: string;
    tenantId?: string;
    deviceId?: string | null;
  };
}

// JWT payload with device info
interface JWTPayloadWithDevice {
  sub: string;
  tenantId?: string;
  deviceId?: string;
}

@Injectable()
export class WebSocketAuthGuard implements CanActivate {
  constructor(
    private readonly tokenService: TokenService,
    private readonly tokenRevocationService: TokenRevocationService,
    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
       
      const client = context.switchToWs().getClient();

      // Type guard to ensure client has expected structure
      if (!this.isSocketClient(client)) {
        throw new WsException('Invalid socket client');
      }

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

      // Store user information in socket data for later use

      if (!client.data) {
        client.data = {};
      }

      client.data.userId = payload.sub;

      client.data.tenantId = payload.tenantId;
      const payloadWithDevice = payload as JWTPayloadWithDevice;
      client.data.deviceId = payloadWithDevice.deviceId || null;

      return true;
    } catch (error: unknown) {
      const errorInstance =
        error instanceof Error ? error : new Error(String(error));

      if (error instanceof WsException) {
        throw error;
      }

      throw new WsException(errorInstance.message || 'Authentication failed');
    }
  }

  private isSocketClient(client: unknown): client is SocketClient {
    return (
      typeof client === 'object' &&
      client !== null &&
      'handshake' in client &&
      typeof (client as Record<string, unknown>).handshake === 'object'
    );
  }

  private extractTokenFromSocket(client: SocketClient): string | null {
    // Try to get token from handshake auth
    const authToken = client.handshake?.auth?.token;
    if (authToken && typeof authToken === 'string') {
      return authToken;
    }

    // Try to get token from authorization header

    const authHeader =
      client.handshake?.headers?.authorization ||
      client.handshake?.auth?.authorization;
    if (authHeader) {
      if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
        return authHeader.substring(7);
      }
      if (typeof authHeader === 'string' && !authHeader.startsWith('Bearer ')) {
        return authHeader;
      }
    }

    // Try to get token from query parameters
    const queryToken = client.handshake?.query?.token;
    if (queryToken && typeof queryToken === 'string') {
      return queryToken;
    }

    return null;
  }
}
