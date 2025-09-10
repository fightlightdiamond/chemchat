import { Test, TestingModule } from '@nestjs/testing';
import { Request } from 'express';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      const mockRequest = {
        correlationId: 'test-correlation-id',
      } as Request & { correlationId: string };
      const result = appController.getHello(mockRequest);

      expect(result).toEqual({
        message: 'Hello World!',
        correlationId: 'test-correlation-id',
        timestamp: expect.any(String) as string,
      });
    });
  });
});
