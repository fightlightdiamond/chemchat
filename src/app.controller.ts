import { Controller, Get, Req } from '@nestjs/common';
import { AppService } from './app.service';
import { RequestWithCorrelationId } from './shared/interfaces';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(@Req() req: RequestWithCorrelationId) {
    return {
      message: this.appService.getHello(),
      correlationId: req.correlationId,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('health')
  getHealth(@Req() req: RequestWithCorrelationId) {
    return {
      status: 'ok',
      correlationId: req.correlationId,
      timestamp: new Date().toISOString(),
      modules: ['shared', 'auth', 'chat', 'presence', 'notification'],
    };
  }
}
