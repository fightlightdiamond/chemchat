import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { RequestWithCorrelationId } from './shared/interfaces';

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
      const mockRequest: RequestWithCorrelationId = {
        correlationId: 'test-correlation-id',
      } as unknown as RequestWithCorrelationId;
      const result = appController.getHello(mockRequest);

      const { timestamp, ...rest } = result as { timestamp: string } & Record<
        string,
        unknown
      >;
      expect(rest).toEqual({
        message: 'Hello World!',
        correlationId: 'test-correlation-id',
      });
      expect(typeof timestamp).toBe('string');
    });
  });
});
