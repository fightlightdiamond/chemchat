import { Controller, Get, UseGuards, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MetricsService } from './metrics/metrics.service';
import { HealthCheckService, HealthStatus } from './health/health-check.service';
import { TracingService } from './tracing/tracing.service';

@ApiTags('observability')
@Controller('observability')
export class ObservabilityController {
  private readonly logger = new Logger(ObservabilityController.name);

  constructor(
    private readonly metricsService: MetricsService,
    private readonly healthCheckService: HealthCheckService,
    private readonly tracingService: TracingService
  ) {}

  @Get('metrics')
  @ApiOperation({ summary: 'Get Prometheus metrics' })
  @ApiResponse({ status: 200, description: 'Prometheus metrics in text format' })
  async getMetrics(): Promise<string> {
    this.logger.debug('Metrics endpoint accessed');
    return this.metricsService.getMetrics();
  }

  @Get('health')
  @ApiOperation({ summary: 'Get application health status' })
  @ApiResponse({ 
    status: 200, 
    description: 'Application health status',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['ok', 'error'] },
        details: { type: 'object' }
      }
    }
  })
  async getHealth(): Promise<HealthStatus> {
    this.logger.debug('Health check endpoint accessed');
    return this.healthCheckService.performHealthCheck();
  }

  @Get('health/detailed')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get detailed health status (authenticated)' })
  @ApiResponse({ 
    status: 200, 
    description: 'Detailed application health status with all dependencies' 
  })
  async getDetailedHealth(): Promise<HealthStatus> {
    this.logger.debug('Detailed health check endpoint accessed');
    
    // Include optional services in detailed check
    return this.healthCheckService.performHealthCheck();
  }

  @Get('info')
  @ApiOperation({ summary: 'Get application information' })
  @ApiResponse({ 
    status: 200, 
    description: 'Application information and runtime details' 
  })
  getApplicationInfo() {
    return {
      name: 'ChemChat API',
      version: '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      nodeVersion: process.version,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      timestamp: new Date().toISOString(),
      features: {
        tracing: true,
        metrics: true,
        healthChecks: true,
        multiTenant: true,
        websockets: true,
        search: true,
        notifications: true,
        mediaHandling: true,
      },
    };
  }

  @Get('trace/correlation')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Generate new correlation ID for tracing' })
  @ApiResponse({ 
    status: 200, 
    description: 'New correlation ID for request tracing' 
  })
  generateCorrelationId() {
    const correlationId = this.tracingService.generateCorrelationId();
    
    this.logger.debug(`Generated correlation ID: ${correlationId}`);
    
    return {
      correlationId,
      timestamp: new Date().toISOString(),
    };
  }
}
