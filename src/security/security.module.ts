import { Module, Global, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { RequestMethod } from '@nestjs/common/enums';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { SecurityHardeningService } from './services/security-hardening.service';
import { InputValidationService } from './services/input-validation.service';
import { EncryptionService } from './services/encryption.service';
import { ComplianceService } from './services/compliance.service';
import { SecurityAuditService } from './services/security-audit.service';
import { VulnerabilityScanningService } from './services/vulnerability-scanning.service';
import { SecurityPolicyService } from './services/security-policy.service';
import { DataProtectionService } from './services/data-protection.service';
import { DataRetentionService } from './services/data-retention.service';
import { RateLimitService } from './services/rate-limit.service';
import { SecurityController } from './controllers/security.controller';
import { ComplianceController } from './controllers/compliance.controller';
import { DataProtectionController } from './controllers/data-protection.controller';
import { SecurityHeadersMiddleware } from './middleware/security-headers.middleware';
import { InputSanitizationMiddleware } from './middleware/input-sanitization.middleware';
import { DdosProtectionMiddleware } from './middleware/ddos-protection.middleware';
import { SecurityInterceptor } from './interceptors/security.interceptor';
import { EncryptionInterceptor } from './interceptors/encryption.interceptor';
import { RedisModule } from '../redis/redis.module';
import { PrismaModule } from '../prisma/prisma.module';

@Global()
@Module({
  imports: [
    ConfigModule,
    RedisModule,
    PrismaModule,
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
  ],
  providers: [
    SecurityHardeningService,
    InputValidationService,
    EncryptionService,
    ComplianceService,
    SecurityAuditService,
    VulnerabilityScanningService,
    SecurityPolicyService,
    DataProtectionService,
    DataRetentionService,
    RateLimitService,
    SecurityInterceptor,
    EncryptionInterceptor,
    SecurityHeadersMiddleware,
    InputSanitizationMiddleware,
    DdosProtectionMiddleware,
  ],
  controllers: [
    SecurityController,
    ComplianceController,
    DataProtectionController,
  ],
  exports: [
    SecurityHardeningService,
    InputValidationService,
    EncryptionService,
    ComplianceService,
    SecurityAuditService,
    VulnerabilityScanningService,
    SecurityPolicyService,
    DataProtectionService,
    DataRetentionService,
    RateLimitService,
    SecurityInterceptor,
    EncryptionInterceptor,
  ],
})
export class SecurityModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Apply security headers to all routes
    consumer.apply(SecurityHeadersMiddleware).forRoutes('*');

    // Apply DDoS protection to all routes
    consumer.apply(DdosProtectionMiddleware).forRoutes('*');

    // Apply input sanitization to all POST, PUT, and PATCH routes
    consumer
      .apply(InputSanitizationMiddleware)
      .forRoutes(
        { path: '*', method: RequestMethod.POST },
        { path: '*', method: RequestMethod.PUT },
        { path: '*', method: RequestMethod.PATCH },
      );
  }
}
