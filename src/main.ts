// Initialize OpenTelemetry before importing any other modules
import { initializeTelemetry } from './observability/telemetry';
initializeTelemetry();

import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';
// import { CorrelationIdMiddleware } from './observability/tracing/correlation-id.middleware';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  
  try {
    const app = await NestFactory.create(AppModule, {
      logger: ['error', 'warn', 'log', 'debug', 'verbose'],
    });

    // Global validation pipe
    app.useGlobalPipes(new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }));

    // Enable CORS
    app.enableCors({
      origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
      credentials: true,
    });

    // Apply correlation ID middleware globally
    // const correlationIdMiddleware = app.get(CorrelationIdMiddleware);
    // app.use(correlationIdMiddleware.use.bind(correlationIdMiddleware));

    // Swagger documentation
    if (process.env.NODE_ENV !== 'production') {
      const { setupSwagger } = await import('./docs/swagger.config');
      setupSwagger(app);
      logger.log('Swagger documentation available at /api/docs');
    }

    // Global prefix for API routes
    app.setGlobalPrefix('api/v1', {
      exclude: ['health', 'metrics', 'api/docs'],
    });

    const port = process.env.PORT ?? 3000;
    const host = process.env.HOST ?? '0.0.0.0';
    await app.listen(port, host);
    
    logger.log(' ChemChat API is running on 0.0.0.0:3000 - HOT RELOAD TEST');
    logger.log(' Metrics available at /metrics');
    logger.log(' Health checks available at /health');
    logger.log(` API documentation available at http://localhost:3000/api/docs`);

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      logger.log('SIGTERM received, shutting down gracefully');
      await app.close();
      process.exit(0);
    });

    process.on('SIGINT', async () => {
      logger.log('SIGINT received, shutting down gracefully');
      await app.close();
      process.exit(0);
    });

  } catch (error) {
    logger.error('Failed to start application', error);
    process.exit(1);
  }
}

void bootstrap();
