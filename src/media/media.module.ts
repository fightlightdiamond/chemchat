import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MediaService } from './services/media.service';
import { MediaValidationService } from './services/media-validation.service';
import { MediaProcessingWorker } from './workers/media-processing.worker';
import { MediaController } from './controllers/media.controller';
import { PrismaModule } from '../shared/infrastructure/prisma/prisma.module';
import { RedisModule } from '../shared/redis/redis.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    RedisModule,
    AuthModule,
  ],
  providers: [
    MediaService,
    MediaValidationService,
    MediaProcessingWorker,
  ],
  controllers: [MediaController],
  exports: [
    MediaService,
    MediaValidationService,
  ],
})
export class MediaModule {}
