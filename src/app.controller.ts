import { Controller, Get, Req } from '@nestjs/common';
import { AppService } from './app.service';
import { Request } from 'express';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(@Req() req: Request): any {
    return {
      message: this.appService.getHello(),
      correlationId: (req as any).correlationId,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('health')
  getHealth(@Req() req: Request): any {
    return {
      status: 'ok',
      correlationId: (req as any).correlationId,
      timestamp: new Date().toISOString(),
      modules: ['shared', 'auth', 'chat', 'presence', 'notification'],
    };
  }
}
