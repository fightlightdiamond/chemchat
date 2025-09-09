import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class DatabaseService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(DatabaseService.name);

  constructor(private configService: ConfigService) {
    const databaseUrl = configService.get<string>('DATABASE_URL');

    super({
      datasources: {
        db: {
          url: databaseUrl,
        },
      },
      log:
        process.env.NODE_ENV === 'development'
          ? [
              { level: 'query', emit: 'event' },
              { level: 'error', emit: 'stdout' },
              { level: 'info', emit: 'stdout' },
              { level: 'warn', emit: 'stdout' },
            ]
          : [
              { level: 'error', emit: 'stdout' },
              { level: 'warn', emit: 'stdout' },
            ],
      errorFormat: 'pretty',
    });

    // Set up query logging in onModuleInit to avoid type issues
  }

  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log('Successfully connected to database');

      // Query logging is handled by Prisma's log configuration

      // Test database connection
      await this.$queryRaw`SELECT 1`;
      this.logger.log('Database health check passed');
    } catch (error) {
      this.logger.error('Failed to connect to database', error);
      throw error;
    }
  }

  async onModuleDestroy() {
    try {
      await this.$disconnect();
      this.logger.log('Disconnected from database');
    } catch (error) {
      this.logger.error('Error disconnecting from database', error);
    }
  }

  /**
   * Execute a query with retry logic
   */
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    maxRetries = 3,
    delay = 1000,
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;

        // Don't retry on certain errors
        if (this.isNonRetryableError(error)) {
          throw error;
        }

        if (attempt === maxRetries) {
          this.logger.error(
            `Operation failed after ${maxRetries} attempts`,
            lastError,
          );
          throw lastError;
        }

        const waitTime = delay * Math.pow(2, attempt - 1); // Exponential backoff
        this.logger.warn(
          `Operation failed (attempt ${attempt}/${maxRetries}), retrying in ${waitTime}ms`,
          error,
        );

        await this.sleep(waitTime);
      }
    }

    throw lastError!;
  }

  /**
   * Check if an error should not be retried
   */
  private isNonRetryableError(error: unknown): boolean {
    // Don't retry validation errors, constraint violations, etc.
    const nonRetryableCodes = [
      'P2002', // Unique constraint violation
      'P2003', // Foreign key constraint violation
      'P2025', // Record not found
      'P2014', // Invalid ID
      'P2015', // Related record not found
      'P2016', // Query interpretation error
      'P2017', // Records not connected
    ];

    const errorCode = (error as { code?: string })?.code;
    return nonRetryableCodes.includes(errorCode || '');
  }

  /**
   * Sleep utility for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get database connection status
   */
  async getConnectionStatus(): Promise<{
    connected: boolean;
    latency?: number;
  }> {
    try {
      const start = Date.now();
      await this.$queryRaw`SELECT 1`;
      const latency = Date.now() - start;

      return { connected: true, latency };
    } catch (error) {
      this.logger.error('Database connection check failed', error);
      return { connected: false };
    }
  }
}
