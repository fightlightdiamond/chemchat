import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GlobalExceptionFilter } from './filters/global-exception.filter';
import { CorrelationIdMiddleware } from './middleware/correlation-id.middleware';
import { DatabaseService } from './services/database.service';
import databaseConfig from './config/database.config';

@Module({
  imports: [ConfigModule.forFeature(databaseConfig)],
  providers: [GlobalExceptionFilter, CorrelationIdMiddleware, DatabaseService],
  exports: [GlobalExceptionFilter, CorrelationIdMiddleware, DatabaseService],
})
export class SharedModule {}
