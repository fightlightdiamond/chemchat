import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GlobalExceptionFilter } from './filters/global-exception.filter';
import { CorrelationIdMiddleware } from './middleware/correlation-id.middleware';
import { DatabaseService } from './services/database.service';
import { UserRepositoryImpl } from './infrastructure/repositories/user.repository.impl';
import { ConversationMemberRepositoryImpl } from './infrastructure/repositories/conversation-member.repository.impl';
import { PrismaModule } from './infrastructure/prisma/prisma.module';
import databaseConfig from './config/database.config';

@Module({
  imports: [ConfigModule.forFeature(databaseConfig), PrismaModule],
  providers: [
    GlobalExceptionFilter, 
    CorrelationIdMiddleware, 
    DatabaseService,
    {
      provide: 'UserRepository',
      useClass: UserRepositoryImpl,
    },
    {
      provide: 'ConversationMemberRepository',
      useClass: ConversationMemberRepositoryImpl,
    },
  ],
  exports: [
    GlobalExceptionFilter, 
    CorrelationIdMiddleware, 
    DatabaseService,
    'UserRepository',
    'ConversationMemberRepository',
  ],
})
export class SharedModule {}
