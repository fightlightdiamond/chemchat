import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { HealthService, HealthCheckResult } from './health.service';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @Public()
  @ApiOperation({ summary: 'Health check endpoint' })
  @ApiResponse({
    status: 200,
    description: 'Service is healthy',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'ok' },
        timestamp: { type: 'string', example: '2024-01-01T00:00:00.000Z' },
        uptime: { type: 'number', example: 123.456 },
        services: {
          type: 'object',
          properties: {
            database: { type: 'string', example: 'healthy' },
            redis: { type: 'string', example: 'healthy' },
            kafka: { type: 'string', example: 'healthy' },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 503,
    description: 'Service is unhealthy',
  })
  async check(): Promise<HealthCheckResult> {
    return await this.healthService.check();
  }

  @Get('ready')
  @Public()
  @ApiOperation({ summary: 'Readiness check endpoint' })
  @ApiResponse({
    status: 200,
    description: 'Service is ready',
  })
  @ApiResponse({
    status: 503,
    description: 'Service is not ready',
  })
  async readiness(): Promise<{ status: string; ready: boolean }> {
    return await this.healthService.readiness();
  }

  @Get('live')
  @Public()
  @ApiOperation({ summary: 'Liveness check endpoint' })
  @ApiResponse({
    status: 200,
    description: 'Service is alive',
  })
  liveness(): { status: string; alive: boolean } {
    return this.healthService.liveness();
  }
}
