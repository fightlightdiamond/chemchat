import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        // Do not fall back to an insecure default secret
        secret: (() => {
          const secret = configService.get<string>('JWT_SECRET');
          if (!secret || secret.trim().length < 32) {
            throw new Error(
              'JWT_SECRET must be set and at least 32 characters for security',
            );
          }
          return secret;
        })(),
        signOptions: {
          expiresIn: configService.get<string>('JWT_EXPIRES_IN', '1h'),
        },
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [],
  controllers: [],
  exports: [JwtModule, PassportModule],
})
export class AuthModule {}
