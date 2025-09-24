import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
// import { APP_GUARD } from '@nestjs/core';

// Services
import { TokenService } from './services/token.service';
import { AuthService } from './services/auth.service';
import { MfaService } from './services/mfa.service';
import { TokenRevocationService } from './services/token-revocation.service';
import { RateLimitingService } from './services/rate-limiting.service';
import { SecurityMonitoringService } from './services/security-monitoring.service';

// Guards
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { WebSocketAuthGuard } from './guards/websocket-auth.guard';

// Controllers
import { AuthController } from './controllers/auth.controller';

// Import shared module for repositories
import { SharedModule } from '../shared/shared.module';

@Module({
  imports: [
    SharedModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>(
          'JWT_ACCESS_SECRET',
          'default-secret',
        ),
        signOptions: {
          expiresIn: configService.get<string>('JWT_ACCESS_EXPIRES_IN', '15m'),
        },
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [
    // Services
    TokenService,
    AuthService,
    MfaService,
    TokenRevocationService,
    RateLimitingService,
    SecurityMonitoringService,

    // Guards
    JwtAuthGuard,
    WebSocketAuthGuard,

    // Global guard - temporarily disabled to resolve dependency injection issues
    // {
    //   provide: APP_GUARD,
    //   useClass: JwtAuthGuard,
    // },
  ],
  controllers: [AuthController],
  exports: [
    JwtModule,
    PassportModule,
    TokenService,
    AuthService,
    MfaService,
    TokenRevocationService,
    RateLimitingService,
    SecurityMonitoringService,
    JwtAuthGuard,
    WebSocketAuthGuard,
  ],
})
export class AuthModule {}
