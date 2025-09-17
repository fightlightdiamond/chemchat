import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AuthModule } from '../../src/auth/auth.module';
import { PrismaModule } from '../../src/prisma/prisma.module';
import { RedisModule } from '../../src/redis/redis.module';
import { ConfigModule } from '@nestjs/config';
import { getTestContext } from '../setup/integration-setup';
import { TestDataFactory } from '../fixtures/test-data';
import * as bcrypt from 'bcrypt';

describe('Auth Integration Tests', () => {
  let app: INestApplication;
  let testContext: any;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env.test' }),
        AuthModule,
        PrismaModule,
        RedisModule.forRoot({
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379'),
          db: parseInt(process.env.REDIS_TEST_DB || '1'),
        }),
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    testContext = getTestContext();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /auth/login', () => {
    it('should login with valid credentials', async () => {
      // Create test tenant and user
      const tenant = TestDataFactory.createTenant();
      const passwordHash = await bcrypt.hash('testpassword', 10);
      const user = TestDataFactory.createUser(tenant.id, {
        email: 'test@example.com',
        passwordHash,
      });

      await testContext.prisma.tenant.create({ data: tenant });
      await testContext.prisma.user.create({ data: user });

      const loginDto = {
        email: 'test@example.com',
        password: 'testpassword',
        deviceFingerprint: 'test-device',
      };

      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .set('x-tenant-id', tenant.id)
        .send(loginDto)
        .expect(200);

      expect(response.body).toHaveProperty('user');
      expect(response.body).toHaveProperty('tokens');
      expect(response.body.user.email).toBe(loginDto.email);
      expect(response.body.tokens).toHaveProperty('accessToken');
      expect(response.body.tokens).toHaveProperty('refreshToken');
    });

    it('should reject invalid credentials', async () => {
      const tenant = TestDataFactory.createTenant();
      await testContext.prisma.tenant.create({ data: tenant });

      const loginDto = {
        email: 'nonexistent@example.com',
        password: 'wrongpassword',
        deviceFingerprint: 'test-device',
      };

      await request(app.getHttpServer())
        .post('/auth/login')
        .set('x-tenant-id', tenant.id)
        .send(loginDto)
        .expect(401);
    });

    it('should validate required fields', async () => {
      const tenant = TestDataFactory.createTenant();
      await testContext.prisma.tenant.create({ data: tenant });

      await request(app.getHttpServer())
        .post('/auth/login')
        .set('x-tenant-id', tenant.id)
        .send({})
        .expect(400);
    });
  });

  describe('POST /auth/logout', () => {
    it('should logout authenticated user', async () => {
      // Create and authenticate user first
      const tenant = TestDataFactory.createTenant();
      const passwordHash = await bcrypt.hash('testpassword', 10);
      const user = TestDataFactory.createUser(tenant.id, {
        passwordHash,
      });

      await testContext.prisma.tenant.create({ data: tenant });
      await testContext.prisma.user.create({ data: user });

      // Login to get token
      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .set('x-tenant-id', tenant.id)
        .send({
          email: user.email,
          password: 'testpassword',
          deviceFingerprint: 'test-device',
        });

      const { accessToken } = loginResponse.body.tokens;

      // Logout
      await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('x-tenant-id', tenant.id)
        .send({ deviceFingerprint: 'test-device' })
        .expect(200);
    });
  });

  describe('POST /auth/refresh', () => {
    it('should refresh tokens with valid refresh token', async () => {
      const tenant = TestDataFactory.createTenant();
      const passwordHash = await bcrypt.hash('testpassword', 10);
      const user = TestDataFactory.createUser(tenant.id, {
        passwordHash,
      });

      await testContext.prisma.tenant.create({ data: tenant });
      await testContext.prisma.user.create({ data: user });

      // Login to get refresh token
      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .set('x-tenant-id', tenant.id)
        .send({
          email: user.email,
          password: 'testpassword',
          deviceFingerprint: 'test-device',
        });

      const { refreshToken } = loginResponse.body.tokens;

      // Refresh tokens
      const response = await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('x-tenant-id', tenant.id)
        .send({
          refreshToken,
          deviceFingerprint: 'test-device',
        })
        .expect(200);

      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
    });
  });

  describe('GET /auth/profile', () => {
    it('should get user profile with valid token', async () => {
      const tenant = TestDataFactory.createTenant();
      const passwordHash = await bcrypt.hash('testpassword', 10);
      const user = TestDataFactory.createUser(tenant.id, {
        passwordHash,
      });

      await testContext.prisma.tenant.create({ data: tenant });
      await testContext.prisma.user.create({ data: user });

      // Login to get token
      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .set('x-tenant-id', tenant.id)
        .send({
          email: user.email,
          password: 'testpassword',
          deviceFingerprint: 'test-device',
        });

      const { accessToken } = loginResponse.body.tokens;

      // Get profile
      const response = await request(app.getHttpServer())
        .get('/auth/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('x-tenant-id', tenant.id)
        .expect(200);

      expect(response.body.email).toBe(user.email);
      expect(response.body.id).toBe(user.id);
    });

    it('should reject request without token', async () => {
      const tenant = TestDataFactory.createTenant();
      await testContext.prisma.tenant.create({ data: tenant });

      await request(app.getHttpServer())
        .get('/auth/profile')
        .set('x-tenant-id', tenant.id)
        .expect(401);
    });
  });
});
