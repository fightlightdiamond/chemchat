import { Module } from '@nestjs/common';
import { CqrsModule as NestCqrsModule } from '@nestjs/cqrs';
import { EventSerializer } from './event-serializer';

@Module({
  imports: [NestCqrsModule],
  providers: [EventSerializer],
  exports: [NestCqrsModule, EventSerializer],
})
export class CqrsModule {}
