import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(config: ConfigService) {
    super({
      datasources: {
        db: {
          url: config.get('DATABASE_URL'),
        },
      },
      log: [
        { level: 'query', emit: 'event' },
        { level: 'error', emit: 'stdout' },
        { level: 'warn', emit: 'stdout' },
      ],
    });

    // Add query logging in development
    if (process.env.NODE_ENV === 'development') {
      // @ts-expect-error - Event emitter types
      this.$on('query' as any, (e: any) => {
        console.log('Query: ' + e.query);
        console.log('Duration: ' + e.duration + 'ms');
      });
    }
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  async enableShutdownHooks(app: any) {
    // Setup graceful shutdown
    process.on('SIGINT', async () => {
      await this.$disconnect();
      await app.close();
    });

    process.on('SIGTERM', async () => {
      await this.$disconnect();
      await app.close();
    });
  }

  // Helper method for transactions
  async transaction<T>(
    callback: (prisma: PrismaService) => Promise<T>,
    options?: { maxWait?: number; timeout?: number },
  ): Promise<T> {
    return this.$transaction(async (prisma) => {
      return callback(prisma as unknown as PrismaService);
    }, options);
  }

  // Soft delete helpers
  get deletedAtField() {
    return { deletedAt: null };
  }

  exclude<T, Key extends keyof T>(model: T, keys: Key[]): Omit<T, Key> {
    return Object.fromEntries(
      Object.entries(model as any).filter(
        ([key]) => !keys.includes(key as any),
      ),
    ) as Omit<T, Key>;
  }
}
