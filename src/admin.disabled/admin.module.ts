import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { AdminController } from './controllers/admin.controller';
import { AdminService } from './services/admin.service';
import { AuditLogService } from './services/audit-log.service';
import { AutoModerationService } from './services/auto-moderation.service';
import { AdminPermissionGuard } from './guards/admin-permission.guard';
import { MessageModerationHandler } from './events/message-moderation.handler';
import { UserBanHandler } from './events/user-ban.handler';
import { SharedModule } from '../shared/shared.module';

@Module({
  imports: [SharedModule, CqrsModule],
  controllers: [AdminController],
  providers: [
    AdminService,
    AuditLogService,
    AutoModerationService,
    AdminPermissionGuard,
    MessageModerationHandler,
    UserBanHandler,
  ],
  exports: [
    AdminService,
    AuditLogService,
    AutoModerationService,
  ],
})
export class AdminModule {}
