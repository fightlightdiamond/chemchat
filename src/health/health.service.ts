import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../shared/infrastructure/prisma/prisma.service';
import { RedisService } from '../shared/redis/redis.service';

export interface HealthCheckResult {
  status: 'ok' | 'error';
  timestamp: string;
  uptime: number;
  services: {
    database: 'healthy' | 'unhealthy';
    redis: 'healthy' | 'unhealthy';
    kafka?: 'healthy' | 'unhealthy';
  };
  version?: string;
  environment?: string;
}

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async check(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    const services = {
      database: await this.checkDatabase(),
      redis: await this.checkRedis(),
    };

    const allHealthy = Object.values(services).every(
      (status) => status === 'healthy',
    );

    const result: HealthCheckResult = {
      status: allHealthy ? 'ok' : 'error',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      services,
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
    };

    this.logger.log(
      `Health check completed in ${Date.now() - startTime}ms: ${result.status}`,
    );

    return result;
  }

  async readiness(): Promise<{ status: string; ready: boolean }> {
    try {
      const dbHealthy = (await this.checkDatabase()) === 'healthy';
      const redisHealthy = (await this.checkRedis()) === 'healthy';

      const ready = dbHealthy && redisHealthy;

      return {
        status: ready ? 'ready' : 'not ready',
        ready,
      };
    } catch (error) {
      this.logger.error('Readiness check failed:', error);
      return {
        status: 'not ready',
        ready: false,
      };
    }
  }

  liveness(): { status: string; alive: boolean } {
    return {
      status: 'alive',
      alive: true,
    };
  }

  private async checkDatabase(): Promise<'healthy' | 'unhealthy'> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return 'healthy';
    } catch (error) {
      this.logger.error('Database health check failed:', error);
      return 'unhealthy';
    }
  }

  private async checkRedis(): Promise<'healthy' | 'unhealthy'> {
    try {
      await this.redis.exec(async (client) => {
        await client.ping();
      });
      return 'healthy';
    } catch (error) {
      this.logger.error('Redis health check failed:', error);
      return 'unhealthy';
    }
  }
}
