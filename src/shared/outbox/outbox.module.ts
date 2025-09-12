import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../infrastructure/prisma/prisma.module';
import { KafkaModule } from '../kafka/kafka.module';
import { OutboxService } from './services/outbox.service';
import { OutboxWorkerService } from './services/outbox-worker.service';
import { EventSerializerService } from './services/event-serializer.service';

@Module({
  imports: [ConfigModule, PrismaModule, KafkaModule.forRoot()],
  providers: [OutboxService, OutboxWorkerService, EventSerializerService],
  exports: [OutboxService, OutboxWorkerService, EventSerializerService],
})
export class OutboxModule {}
