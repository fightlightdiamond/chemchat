import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { MongoDBService } from './mongodb.service';
import { MessageMongoDBRepository } from '../../domain/repositories/message-mongodb.repository';
import { MongoDBMonitorService } from '../../monitoring/mongodb-monitor.service';
import { MongoDBHealthController } from '../../controllers/mongodb-health.controller';
import { MessageSyncRecoveryService } from '../../sync/handlers/message-sync-mongodb.handler';

@Module({
  imports: [
    ConfigModule,
    ScheduleModule.forRoot(),
  ],
  providers: [
    MongoDBService,
    MessageMongoDBRepository,
    MongoDBMonitorService,
    MessageSyncRecoveryService,
  ],
  controllers: [
    MongoDBHealthController,
  ],
  exports: [
    MongoDBService,
    MessageMongoDBRepository,
    MongoDBMonitorService,
    MessageSyncRecoveryService,
  ],
})
export class MongoDBModule {}