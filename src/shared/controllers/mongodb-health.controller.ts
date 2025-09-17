import { Controller, Get, Param, HttpStatus, HttpException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { MongoDBMonitorService, MongoDBHealthStatus, MongoDBMetrics } from '../monitoring/mongodb-monitor.service';

@ApiTags('MongoDB Health')
@Controller('health/mongodb')
export class MongoDBHealthController {
  constructor(private readonly monitor: MongoDBMonitorService) {}

  @Get()
  @ApiOperation({ summary: 'Get MongoDB health status' })
  @ApiResponse({ 
    status: 200, 
    description: 'MongoDB health status',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['healthy', 'unhealthy', 'degraded'] },
        responseTime: { type: 'number' },
        database: { type: 'string' },
        collections: { type: 'number' },
        dataSize: { type: 'number' },
        indexSize: { type: 'number' },
        connectionPool: {
          type: 'object',
          properties: {
            current: { type: 'number' },
            available: { type: 'number' },
            total: { type: 'number' },
          },
        },
        lastChecked: { type: 'string', format: 'date-time' },
        errors: { type: 'array', items: { type: 'string' } },
      },
    },
  })
  async getHealthStatus(): Promise<MongoDBHealthStatus> {
    try {
      return await this.monitor.getHealthStatus();
    } catch (error) {
      throw new HttpException(
        'Failed to get MongoDB health status',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('metrics')
  @ApiOperation({ summary: 'Get MongoDB metrics' })
  @ApiResponse({ 
    status: 200, 
    description: 'MongoDB metrics',
    schema: {
      type: 'object',
      properties: {
        messages: {
          type: 'object',
          properties: {
            total: { type: 'number' },
            byType: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  type: { type: 'string' },
                  count: { type: 'number' },
                },
              },
            },
            byDay: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  date: { type: 'string' },
                  count: { type: 'number' },
                },
              },
            },
            topSenders: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  senderId: { type: 'string' },
                  senderName: { type: 'string' },
                  count: { type: 'number' },
                },
              },
            },
          },
        },
        sync: {
          type: 'object',
          properties: {
            totalErrors: { type: 'number' },
            pendingErrors: { type: 'number' },
            processedErrors: { type: 'number' },
            errorsByType: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  eventType: { type: 'string' },
                  count: { type: 'number' },
                },
              },
            },
          },
        },
        performance: {
          type: 'object',
          properties: {
            avgQueryTime: { type: 'number' },
            slowQueries: { type: 'number' },
            indexUsage: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  index: { type: 'string' },
                  usage: { type: 'number' },
                },
              },
            },
          },
        },
      },
    },
  })
  async getMetrics(): Promise<MongoDBMetrics> {
    try {
      return await this.monitor.getMetrics();
    } catch (error) {
      throw new HttpException(
        'Failed to get MongoDB metrics',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('collection/:name')
  @ApiOperation({ summary: 'Get collection health status' })
  @ApiParam({ name: 'name', description: 'Collection name' })
  @ApiResponse({ 
    status: 200, 
    description: 'Collection health status',
    schema: {
      type: 'object',
      properties: {
        exists: { type: 'boolean' },
        count: { type: 'number' },
        size: { type: 'number' },
        avgObjSize: { type: 'number' },
        indexCount: { type: 'number' },
        health: { type: 'string', enum: ['healthy', 'unhealthy'] },
      },
    },
  })
  async getCollectionHealth(@Param('name') collectionName: string): Promise<{
    exists: boolean;
    count: number;
    size: number;
    avgObjSize: number;
    indexCount: number;
    health: 'healthy' | 'unhealthy';
  }> {
    try {
      return await this.monitor.checkCollectionHealth(collectionName);
    } catch (error) {
      throw new HttpException(
        `Failed to get collection health for ${collectionName}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('refresh')
  @ApiOperation({ summary: 'Force refresh of health status and metrics' })
  @ApiResponse({ 
    status: 200, 
    description: 'Refreshed health status and metrics',
  })
  async refresh(): Promise<{
    health: MongoDBHealthStatus;
    metrics: MongoDBMetrics;
  }> {
    try {
      return await this.monitor.refresh();
    } catch (error) {
      throw new HttpException(
        'Failed to refresh MongoDB status',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('cached')
  @ApiOperation({ summary: 'Get cached health status and metrics' })
  @ApiResponse({ 
    status: 200, 
    description: 'Cached health status and metrics',
  })
  async getCached(): Promise<{
    health: MongoDBHealthStatus | null;
    metrics: MongoDBMetrics | null;
  }> {
    try {
      return {
        health: this.monitor.getCachedHealthStatus(),
        metrics: this.monitor.getCachedMetrics(),
      };
    } catch (error) {
      throw new HttpException(
        'Failed to get cached MongoDB status',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}