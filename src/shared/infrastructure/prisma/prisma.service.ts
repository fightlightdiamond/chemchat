import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      // Basic logging configuration without event listeners
      log: ['warn', 'error'],
    });
  }

  async onModuleInit(): Promise<void> {
    // Connect to the database
    await this.$connect();
    this.logger.log('Connected to database');

    // Note: Prisma event logging disabled due to incomplete TypeScript definitions
    // Event logging can be re-enabled when Prisma provides proper type definitions
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log('Disconnected from database');
  }
}
