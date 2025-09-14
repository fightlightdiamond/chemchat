import { Injectable, Logger } from '@nestjs/common';

export interface HealthStatus {
  status: 'ok' | 'error';
  info?: Record<string, any>;
  error?: Record<string, any>;
  details: Record<string, any>;
}

export interface ServiceHealthCheck {
  name: string;
  status: 'healthy' | 'unhealthy' | 'degraded';
  responseTime?: number;
  error?: string;
  details?: Record<string, any>;
}

@Injectable()
export class HealthCheckService {
  private readonly logger = new Logger(HealthCheckService.name);

  constructor() {}

  /**
   * Check memory usage
   */
  checkMemory(): { status: 'healthy' | 'unhealthy'; details: Record<string, any> } {
    const memoryUsage = process.memoryUsage();
    const heapUsedThreshold = 150 * 1024 * 1024; // 150MB
    const isHealthy = memoryUsage.heapUsed < heapUsedThreshold;
    
    return {
      status: isHealthy ? 'healthy' : 'unhealthy',
      details: {
        heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
        external: `${Math.round(memoryUsage.external / 1024 / 1024)}MB`,
        rss: `${Math.round(memoryUsage.rss / 1024 / 1024)}MB`,
        threshold: `${Math.round(heapUsedThreshold / 1024 / 1024)}MB`,
        healthy: isHealthy,
      },
    };
  }

  /**
   * Basic health check for system resources
   */
  async performHealthCheck(): Promise<HealthStatus> {
    const checks: ServiceHealthCheck[] = [];
    let overallStatus: 'ok' | 'error' = 'ok';
    const details: Record<string, any> = {};

    // Memory check
    try {
      const memoryCheck = this.checkMemory();
      checks.push({
        name: 'memory',
        status: memoryCheck.status,
        details: memoryCheck.details,
      });
      details.memory = memoryCheck.details;
      
      if (memoryCheck.status === 'unhealthy') {
        overallStatus = 'error';
      }
    } catch (error) {
      overallStatus = 'error';
      checks.push({
        name: 'memory',
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      details.memory = { status: 'error', error: error instanceof Error ? error.message : 'Unknown error' };
    }

    // System info
    details.system = {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      uptime: process.uptime(),
      pid: process.pid,
    };

    return {
      status: overallStatus,
      details: {
        ...details,
        checks,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
      },
    };
  }
}
