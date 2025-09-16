import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { Response as SupertestResponse } from 'supertest';
import { Server } from 'http';
import { DatabaseService } from '../src/shared/services/database.service';
import { AppModule } from './../src/app.module';

describe('AppController (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    process.env.JWT_SECRET =
      process.env.JWT_SECRET ||
      'test_jwt_secret_012345678901234567890123456789';
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DatabaseService)
      .useValue({
        $connect: async () => undefined,
        $disconnect: async () => undefined,
        $queryRaw: async () => 1,
      })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/ (GET)', async () => {
    const server: Server = app.getHttpServer() as Server;
    const response: SupertestResponse = await request(server).get('/');
    expect(response.status).toBe(200);
    const body = response.body as Record<string, unknown>;
    expect(body).toMatchObject({
      message: 'Hello World!',
    });
    expect(typeof body.correlationId).toBe('string');
  });
});
