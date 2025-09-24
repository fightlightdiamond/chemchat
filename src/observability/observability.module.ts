import { Module, Global } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TracingService } from './tracing/tracing.service';
import { MetricsService } from './metrics/metrics.service';
import { HealthCheckService } from './health/health-check.service';
import { PerformanceMonitorService } from './performance/performance-monitor.service';
import { ObservabilityController } from './observability.controller';
import { MetricsInterceptor } from './interceptors/metrics.interceptor';
import { WebSocketTracingInterceptor } from './tracing/websocket-tracing.interceptor';
import { AuthModule } from '../auth/auth.module';
import { SharedModule } from '../shared/shared.module';
@Global()
@Module({
  imports: [AuthModule, SharedModule],
  providers: [
    TracingService,
    MetricsService,
    HealthCheckService,
    PerformanceMonitorService,
    {
      provide: APP_INTERCEPTOR,
      useClass: MetricsInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: WebSocketTracingInterceptor,
    },
  ],
  controllers: [ObservabilityController],
  exports: [
    TracingService,
    MetricsService,
    HealthCheckService,
    PerformanceMonitorService,
  ],
})
export class ObservabilityModule {}
