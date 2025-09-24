import { Module } from '@nestjs/common';
import { SharedModule } from '../shared/shared.module';
import { AuthModule } from '../auth/auth.module';
import { SyncService } from './services/sync.service';
import { ConflictResolutionService } from './services/conflict-resolution.service';
import { ClientStateService } from './services/client-state.service';
import { OfflineQueueService } from './services/offline-queue.service';
import { DeepLinkService } from './services/deep-link.service';
import { SyncController } from './controllers/sync.controller';

@Module({
  imports: [SharedModule, AuthModule],
  providers: [
    SyncService,
    ConflictResolutionService,
    ClientStateService,
    OfflineQueueService,
    DeepLinkService,
  ],
  controllers: [SyncController],
  exports: [
    SyncService,
    ConflictResolutionService,
    ClientStateService,
    OfflineQueueService,
    DeepLinkService,
  ],
})
export class SyncModule {}
