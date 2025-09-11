import { DynamicModule, Global, Module } from '@nestjs/common';
import { REDIS_OPTIONS } from './redis.constants';
import { RedisModuleOptions } from './redis.types';
import { RedisService } from './redis.service';

@Global()
@Module({})
export class RedisModule {
  static forRoot(options: RedisModuleOptions): DynamicModule {
    return {
      module: RedisModule,
      providers: [{ provide: REDIS_OPTIONS, useValue: options }, RedisService],
      exports: [RedisService],
    };
  }
}
