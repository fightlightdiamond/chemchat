import { Controller, Get, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AppService } from './app.service';
import { Request } from 'express';

@ApiTags('Health')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @ApiOperation({ summary: 'API Status', description: 'Get API status and basic information' })
  @ApiResponse({ status: 200, description: 'API status retrieved successfully', schema: { type: 'object', properties: { message: { type: 'string' }, correlationId: { type: 'string' }, timestamp: { type: 'string' } } } })
  @Get()
  getHello(@Req() req: Request): object {
    return {
      message: this.appService.getHello(),
      correlationId: (req as Request & { correlationId?: string })
        .correlationId,
      timestamp: new Date().toISOString(),
    };
  }

  @ApiOperation({ summary: 'Health Check', description: 'Get application health status and loaded modules' })
  @ApiResponse({ status: 200, description: 'Health status retrieved successfully', schema: { type: 'object', properties: { status: { type: 'string' }, correlationId: { type: 'string' }, timestamp: { type: 'string' }, modules: { type: 'array', items: { type: 'string' } } } } })
  @Get('health')
  getHealth(@Req() req: Request): object {
    return {
      status: 'ok',
      correlationId: (req as Request & { correlationId?: string })
        .correlationId,
      timestamp: new Date().toISOString(),
      modules: ['shared', 'auth', 'chat', 'presence', 'notification'],
    };
  }
}
