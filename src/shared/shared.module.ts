import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GlobalExceptionFilter } from './filters/global-exception.filter';
import { CorrelationIdMiddleware } from './middleware/correlation-id.middleware';
import { DatabaseService } from './services/database.service';
import databaseConfig from './config/database.config';

@Module({
  imports: [
    // Load environment variables globally so ConfigService works across modules
    ConfigModule.forRoot({ isGlobal: true }),
    // Register typed database configuration
    ConfigModule.forFeature(databaseConfig),
  ],
  providers: [GlobalExceptionFilter, CorrelationIdMiddleware, DatabaseService],
  exports: [GlobalExceptionFilter, CorrelationIdMiddleware, DatabaseService],
})
export class SharedModule {}
