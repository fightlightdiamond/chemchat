import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SharedModule } from './shared';
import { AuthModule } from './auth';
import { ChatModule } from './chat';
import { PresenceModule } from './presence';
import { NotificationModule } from './notification';
import { GlobalExceptionFilter } from './shared/filters/global-exception.filter';
import { CorrelationIdMiddleware } from './shared/middleware/correlation-id.middleware';

@Module({
  imports: [
    // Global modules
    SharedModule,
    ThrottlerModule.forRoot([
      {
        ttl: 60000, // 1 minute
        limit: 100, // 100 requests per minute
      },
    ]),

    // Feature modules
    AuthModule,
    ChatModule,
    PresenceModule,
    NotificationModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
