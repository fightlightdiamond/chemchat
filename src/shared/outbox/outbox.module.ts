import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CqrsModule } from '@nestjs/cqrs';
import { PrismaModule } from '../infrastructure/prisma/prisma.module';
import { KafkaModule } from '../kafka/kafka.module';
import { OutboxService } from './services/outbox.service';
import { OutboxWorkerService } from './services/outbox-worker.service';
import { EventSerializerService } from './services/event-serializer.service';
import { OutboxEventPublisherService } from './services/outbox-event-publisher.service';

@Module({
  imports: [ConfigModule, CqrsModule, PrismaModule, KafkaModule.forRoot()],
  providers: [OutboxService, OutboxWorkerService, EventSerializerService, OutboxEventPublisherService],
  exports: [OutboxService, OutboxWorkerService, EventSerializerService, OutboxEventPublisherService],
})
export class OutboxModule {}
