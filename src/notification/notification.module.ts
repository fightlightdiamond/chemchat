import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CqrsModule } from '@nestjs/cqrs';
import { PrismaModule } from '../shared/infrastructure/prisma/prisma.module';
import { RedisModule } from '../shared/redis/redis.module';
import { NotificationService } from './services/notification.service';
import { NotificationPreferenceService } from './services/notification-preference.service';
import { NotificationTemplateService } from './services/notification-template.service';
import { PushNotificationWorker } from './workers/push-notification.worker';
import { EmailNotificationWorker } from './workers/email-notification.worker';
import { NotificationController } from './controllers/notification.controller';
import { NotificationIntegrationService } from './integration/notification-integration.service';
import { 
  MessageCreatedNotificationHandler,
  ConversationCreatedNotificationHandler 
} from './event-handlers/notification-event.handler';

@Module({
  imports: [
    ConfigModule,
    CqrsModule,
    PrismaModule,
    RedisModule,
  ],
  providers: [
    NotificationService,
    NotificationPreferenceService,
    NotificationTemplateService,
    NotificationIntegrationService,
    PushNotificationWorker,
    EmailNotificationWorker,
    MessageCreatedNotificationHandler,
    ConversationCreatedNotificationHandler,
  ],
  controllers: [
    NotificationController,
  ],
  exports: [
    NotificationService,
    NotificationPreferenceService,
    NotificationTemplateService,
    NotificationIntegrationService,
  ],
})
export class NotificationModule {}
