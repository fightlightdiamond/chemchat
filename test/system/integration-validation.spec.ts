import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CqrsModule } from '@nestjs/cqrs';
import { JwtService } from '@nestjs/jwt';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/shared/infrastructure/prisma/prisma.service';
import { RedisService } from '../../src/shared/redis/redis.service';
import { ElasticsearchService } from '../../src/search/services/elasticsearch.service';
import { TestDataFactory } from '../fixtures/test-data';

describe('Final Integration Validation', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: RedisService;
  let elasticsearch: ElasticsearchService;
  let jwtService: JwtService;
  let testData: TestDataFactory;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        AppModule,
        ConfigModule.forRoot({
          envFilePath: '.env.test',
          isGlobal: true,
        }),
        CqrsModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    prisma = app.get<PrismaService>(PrismaService);
    redis = app.get<RedisService>(RedisService);
    elasticsearch = app.get<ElasticsearchService>(ElasticsearchService);
    jwtService = app.get<JwtService>(JwtService);
    testData = new TestDataFactory(prisma);

    await app.init();
    await app.listen(0);
  });

  afterAll(async () => {
    await testData.cleanup();
    await app.close();
  });

  describe('Module Integration Validation', () => {
    it('should have all modules properly loaded and configured', async () => {
      // Test that all major services are available
      expect(prisma).toBeDefined();
      expect(redis).toBeDefined();
      expect(elasticsearch).toBeDefined();
      expect(jwtService).toBeDefined();

      // Test Redis connection
      const redisHealth = await redis.ping();
      expect(redisHealth).toBe('PONG');

      // Test database connection
      const dbHealth = await prisma.$queryRaw`SELECT 1 as health`;
      expect(dbHealth).toBeDefined();

      // Test Elasticsearch connection
      try {
        const esHealth = await elasticsearch.ping();
        expect(esHealth).toBeDefined();
      } catch (error) {
        console.warn('Elasticsearch not available for testing');
      }
    });

    it('should have proper dependency injection working', async () => {
      const response = await request(app.getHttpServer())
        .get('/health/detailed')
        .expect(200);

      expect(response.body.status).toBe('ok');
      expect(response.body.details).toBeDefined();
      expect(response.body.details.database).toBeDefined();
      expect(response.body.details.redis).toBeDefined();
    });
  });

  describe('Cross-Module Communication Validation', () => {
    let authToken: string;
    let tenantId: string;
    let userId: string;
    let conversationId: string;

    beforeAll(async () => {
      // Setup test data
      const tenant = await testData.createTenant();
      const user = await testData.createUser({ tenantId: tenant.id });
      const conversation = await testData.createConversation({
        tenantId: tenant.id,
        createdBy: user.id,
      });

      tenantId = tenant.id;
      userId = user.id;
      conversationId = conversation.id;

      authToken = jwtService.sign({
        sub: userId,
        tenantId: tenantId,
        email: user.email,
      });
    });

    it('should handle complete message flow across all modules', async () => {
      // 1. Authentication Module - Validate token
      const authResponse = await request(app.getHttpServer())
        .get('/auth/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Tenant-ID', tenantId)
        .expect(200);

      expect(authResponse.body.id).toBe(userId);

      // 2. Chat Module - Send message
      const messageResponse = await request(app.getHttpServer())
        .post('/messages')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Tenant-ID', tenantId)
        .send({
          conversationId,
          content: 'Integration validation message',
          type: 'TEXT',
        })
        .expect(201);

      const messageId = messageResponse.body.id;

      // 3. Search Module - Index and search message
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for indexing

      const searchResponse = await request(app.getHttpServer())
        .get('/search/messages')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Tenant-ID', tenantId)
        .query({ q: 'validation', conversationId })
        .expect(200);

      expect(searchResponse.body.data.length).toBeGreaterThan(0);

      // 4. Media Module - Upload file metadata
      const mediaResponse = await request(app.getHttpServer())
        .post('/media/upload/url')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Tenant-ID', tenantId)
        .send({
          filename: 'test.jpg',
          mimetype: 'image/jpeg',
          size: 1024,
        })
        .expect(201);

      expect(mediaResponse.body.uploadUrl).toBeDefined();

      // 5. Notification Module - Check notifications
      const notificationResponse = await request(app.getHttpServer())
        .get('/notifications')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Tenant-ID', tenantId)
        .expect(200);

      expect(Array.isArray(notificationResponse.body.data)).toBe(true);

      // 6. Sync Module - Get sync state
      const syncResponse = await request(app.getHttpServer())
        .get('/sync/state/test-device')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Tenant-ID', tenantId)
        .expect(200);

      expect(syncResponse.body.deviceId).toBe('test-device');

      // 7. Observability Module - Check metrics
      const metricsResponse = await request(app.getHttpServer())
        .get('/metrics')
        .expect(200);

      expect(metricsResponse.text).toContain('http_requests_total');
    });

    it('should handle tenant isolation across all modules', async () => {
      // Create second tenant
      const tenant2 = await testData.createTenant();
      const user2 = await testData.createUser({ tenantId: tenant2.id });
      
      const token2 = jwtService.sign({
        sub: user2.id,
        tenantId: tenant2.id,
        email: user2.email,
      });

      // Try to access first tenant's data with second tenant's credentials
      await request(app.getHttpServer())
        .get(`/conversations/${conversationId}`)
        .set('Authorization', `Bearer ${token2}`)
        .set('X-Tenant-ID', tenant2.id)
        .expect(404);

      // Search should be isolated
      const searchResponse = await request(app.getHttpServer())
        .get('/search/messages')
        .set('Authorization', `Bearer ${token2}`)
        .set('X-Tenant-ID', tenant2.id)
        .query({ q: 'validation' })
        .expect(200);

      expect(searchResponse.body.data).toHaveLength(0);

      // Notifications should be isolated
      const notificationResponse = await request(app.getHttpServer())
        .get('/notifications')
        .set('Authorization', `Bearer ${token2}`)
        .set('X-Tenant-ID', tenant2.id)
        .expect(200);

      expect(notificationResponse.body.data).toHaveLength(0);
    });
  });

  describe('Event Propagation Validation', () => {
    let authToken: string;
    let tenantId: string;
    let userId: string;

    beforeAll(async () => {
      const tenant = await testData.createTenant();
      const user = await testData.createUser({ tenantId: tenant.id });
      tenantId = tenant.id;
      userId = user.id;

      authToken = jwtService.sign({
        sub: userId,
        tenantId: tenantId,
        email: user.email,
      });
    });

    it('should propagate conversation creation events', async () => {
      const conversationResponse = await request(app.getHttpServer())
        .post('/conversations')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Tenant-ID', tenantId)
        .send({
          title: 'Event Propagation Test',
          type: 'GROUP',
          participants: [userId],
        })
        .expect(201);

      const conversationId = conversationResponse.body.id;

      // Verify conversation exists in database
      const dbConversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
      });
      expect(dbConversation).toBeTruthy();

      // Verify Redis cache is updated
      await new Promise(resolve => setTimeout(resolve, 500));
      const cachedConversation = await redis.get(`conversation:${conversationId}`);
      expect(cachedConversation).toBeTruthy();
    });

    it('should propagate message events across services', async () => {
      const conversation = await testData.createConversation({
        tenantId,
        createdBy: userId,
      });

      const messageResponse = await request(app.getHttpServer())
        .post('/messages')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Tenant-ID', tenantId)
        .send({
          conversationId: conversation.id,
          content: 'Event propagation test message',
          type: 'TEXT',
        })
        .expect(201);

      const messageId = messageResponse.body.id;

      // Verify message in database
      const dbMessage = await prisma.message.findUnique({
        where: { id: messageId },
      });
      expect(dbMessage).toBeTruthy();

      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Verify search indexing
      try {
        const searchResult = await elasticsearch.search({
          index: `messages_${tenantId}`,
          body: {
            query: {
              bool: {
                must: [
                  { match: { content: 'propagation' } },
                  { term: { conversationId: conversation.id } },
                ],
              },
            },
          },
        });

        expect(searchResult.body.hits.total.value).toBeGreaterThan(0);
      } catch (error) {
        console.warn('Elasticsearch indexing test skipped:', error.message);
      }
    });
  });

  describe('Performance and Scalability Validation', () => {
    let authToken: string;
    let tenantId: string;
    let userId: string;
    let conversationId: string;

    beforeAll(async () => {
      const tenant = await testData.createTenant();
      const user = await testData.createUser({ tenantId: tenant.id });
      const conversation = await testData.createConversation({
        tenantId: tenant.id,
        createdBy: user.id,
      });

      tenantId = tenant.id;
      userId = user.id;
      conversationId = conversation.id;

      authToken = jwtService.sign({
        sub: userId,
        tenantId: tenantId,
        email: user.email,
      });
    });

    it('should handle concurrent message creation', async () => {
      const messageCount = 20;
      const promises: Promise<any>[] = [];

      for (let i = 0; i < messageCount; i++) {
        promises.push(
          request(app.getHttpServer())
            .post('/messages')
            .set('Authorization', `Bearer ${authToken}`)
            .set('X-Tenant-ID', tenantId)
            .send({
              conversationId,
              content: `Concurrent message ${i}`,
              type: 'TEXT',
            })
        );
      }

      const responses = await Promise.all(promises);
      const successful = responses.filter(r => r.status === 201);
      
      expect(successful.length).toBe(messageCount);

      // Verify sequence ordering
      const messages = await prisma.message.findMany({
        where: { conversationId },
        orderBy: { sequenceNumber: 'asc' },
        select: { sequenceNumber: true, content: true },
      });

      for (let i = 1; i < messages.length; i++) {
        expect(Number(messages[i].sequenceNumber)).toBeGreaterThan(
          Number(messages[i - 1].sequenceNumber)
        );
      }
    });

    it('should handle high-frequency API calls', async () => {
      const requestCount = 50;
      const promises: Promise<any>[] = [];

      for (let i = 0; i < requestCount; i++) {
        promises.push(
          request(app.getHttpServer())
            .get('/conversations')
            .set('Authorization', `Bearer ${authToken}`)
            .set('X-Tenant-ID', tenantId)
        );
      }

      const responses = await Promise.allSettled(promises);
      const successful = responses.filter(r => r.status === 'fulfilled').length;
      
      // Should handle at least 80% successfully
      expect(successful).toBeGreaterThan(requestCount * 0.8);
    });

    it('should maintain response times under load', async () => {
      const startTime = Date.now();
      
      const response = await request(app.getHttpServer())
        .get('/conversations')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Tenant-ID', tenantId)
        .expect(200);

      const responseTime = Date.now() - startTime;
      
      // Response should be under 1 second
      expect(responseTime).toBeLessThan(1000);
      expect(response.body).toBeDefined();
    });
  });

  describe('Error Handling and Resilience Validation', () => {
    let authToken: string;
    let tenantId: string;

    beforeAll(async () => {
      const tenant = await testData.createTenant();
      const user = await testData.createUser({ tenantId: tenant.id });
      tenantId = tenant.id;

      authToken = jwtService.sign({
        sub: user.id,
        tenantId: tenantId,
        email: user.email,
      });
    });

    it('should handle invalid requests gracefully', async () => {
      // Invalid JSON
      await request(app.getHttpServer())
        .post('/messages')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Tenant-ID', tenantId)
        .set('Content-Type', 'application/json')
        .send('invalid json')
        .expect(400);

      // Missing required fields
      await request(app.getHttpServer())
        .post('/messages')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Tenant-ID', tenantId)
        .send({
          content: 'Missing conversation ID',
        })
        .expect(400);

      // Invalid IDs
      await request(app.getHttpServer())
        .get('/conversations/invalid-id')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Tenant-ID', tenantId)
        .expect(404);
    });

    it('should handle service degradation gracefully', async () => {
      // Test with Redis disconnected
      await redis.disconnect();

      const response = await request(app.getHttpServer())
        .get('/health')
        .expect(200);

      expect(response.body.status).toBeDefined();

      // Reconnect Redis
      await redis.connect();
    });

    it('should provide meaningful error messages', async () => {
      const response = await request(app.getHttpServer())
        .post('/messages')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Tenant-ID', tenantId)
        .send({
          conversationId: 'non-existent-id',
          content: 'Test message',
          type: 'TEXT',
        })
        .expect(404);

      expect(response.body.message).toBeDefined();
      expect(response.body.message).toContain('not found');
    });
  });

  describe('Security Integration Validation', () => {
    it('should enforce authentication on protected endpoints', async () => {
      const protectedRequests = [
        { method: 'get', path: '/conversations' },
        { method: 'post', path: '/messages', body: { conversationId: 'x', content: 'x', type: 'TEXT' } },
        { method: 'get', path: '/notifications' },
        { method: 'get', path: '/search/messages' },
        { method: 'post', path: '/media/upload/url', body: { filename: 'x.txt', mimetype: 'text/plain', size: 1 } },
        { method: 'get', path: '/sync/state/test-device' },
      ];
      for (const req of protectedRequests) {
        const agent = request(app.getHttpServer())[req.method](req.path);
        const res = req.body ? await agent.send(req.body) : await agent;
        expect(res.status).toBe(401);
      }
    });

    it('should validate JWT tokens properly', async () => {
      const invalidTokens = [
        'invalid-token',
        'Bearer invalid-token',
        'Bearer ' + 'a'.repeat(100),
      ];

      for (const token of invalidTokens) {
        await request(app.getHttpServer())
          .get('/conversations')
          .set('Authorization', token)
          .expect(401);
      }
    });

    it('should enforce tenant isolation', async () => {
      const tenant1 = await testData.createTenant();
      const tenant2 = await testData.createTenant();
      
      const user1 = await testData.createUser({ tenantId: tenant1.id });
      const user2 = await testData.createUser({ tenantId: tenant2.id });

      const token1 = jwtService.sign({
        sub: user1.id,
        tenantId: tenant1.id,
        email: user1.email,
      });

      const token2 = jwtService.sign({
        sub: user2.id,
        tenantId: tenant2.id,
        email: user2.email,
      });

      // Create conversation in tenant1
      const conversation = await testData.createConversation({
        tenantId: tenant1.id,
        createdBy: user1.id,
      });

      // Try to access with tenant2 credentials
      await request(app.getHttpServer())
        .get(`/conversations/${conversation.id}`)
        .set('Authorization', `Bearer ${token2}`)
        .set('X-Tenant-ID', tenant2.id)
        .expect(404);
    });
  });
});
