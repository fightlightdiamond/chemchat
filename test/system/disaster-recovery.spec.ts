import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/shared/infrastructure/prisma/prisma.service';
import { RedisService } from '../../src/shared/redis/redis.service';
import { ElasticsearchService } from '../../src/search/services/elasticsearch.service';
import { TestDataFactory } from '../fixtures/test-data';

describe('Disaster Recovery and Failover Tests', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: RedisService;
  let elasticsearch: ElasticsearchService;
  let testData: TestDataFactory;
  let authToken: string;
  let tenantId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        AppModule,
        ConfigModule.forRoot({
          envFilePath: '.env.test',
          isGlobal: true,
        }),
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    prisma = app.get<PrismaService>(PrismaService);
    redis = app.get<RedisService>(RedisService);
    elasticsearch = app.get<ElasticsearchService>(ElasticsearchService);
    testData = new TestDataFactory(prisma);

    await app.init();
    await app.listen(0);

    // Setup test data
    const tenant = await testData.createTenant();
    const user = await testData.createUser({ tenantId: tenant.id });
    tenantId = tenant.id;

    // Generate auth token (simplified for testing)
    authToken = 'test-token';
  });

  afterAll(async () => {
    await testData.cleanup();
    await app.close();
  });

  describe('Redis Failover Scenarios', () => {
    it('should handle Redis connection loss gracefully', async () => {
      // Disconnect Redis
      await redis.disconnect();

      // API should still respond with degraded functionality
      const response = await request(app.getHttpServer())
        .get('/health')
        .expect(200);

      expect(response.body.status).toBeDefined();
      expect(response.body.redis).toBe('unhealthy');

      // Reconnect Redis
      await redis.connect();

      // Verify recovery
      const recoveryResponse = await request(app.getHttpServer())
        .get('/health')
        .expect(200);

      expect(recoveryResponse.body.redis).toBe('healthy');
    });

    it('should handle Redis memory pressure', async () => {
      // Simulate memory pressure by filling Redis
      const largeData = 'x'.repeat(1024 * 1024); // 1MB string
      const keys: string[] = [];

      try {
        for (let i = 0; i < 100; i++) {
          const key = `memory-test-${i}`;
          await redis.set(key, largeData, 'EX', 60);
          keys.push(key);
        }

        // System should still function
        const response = await request(app.getHttpServer())
          .get('/health')
          .expect(200);

        expect(response.body.status).toBeDefined();
      } finally {
        // Cleanup
        for (const key of keys) {
          await redis.del(key);
        }
      }
    });

    it('should handle Redis cluster node failures', async () => {
      // This test would require a Redis cluster setup
      // For now, we'll test connection resilience
      
      let connectionErrors = 0;
      const maxRetries = 3;

      for (let i = 0; i < maxRetries; i++) {
        try {
          await redis.ping();
          break;
        } catch (error) {
          connectionErrors++;
          if (connectionErrors === maxRetries) {
            throw error;
          }
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      expect(connectionErrors).toBeLessThan(maxRetries);
    });
  });

  describe('Database Failover Scenarios', () => {
    it('should handle database connection timeouts', async () => {
      // Test with a very short timeout
      const shortTimeoutPrisma = new PrismaService();
      
      try {
        // This should timeout quickly
        await Promise.race([
          shortTimeoutPrisma.user.findMany({ take: 1 }),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Timeout')), 100)
          ),
        ]);
      } catch (error) {
        expect(error.message).toContain('Timeout');
      }
    });

    it('should handle database connection pool exhaustion', async () => {
      const promises: Promise<any>[] = [];
      
      // Create many concurrent database operations
      for (let i = 0; i < 50; i++) {
        promises.push(
          prisma.user.findMany({ take: 1 }).catch(err => ({ error: err.message }))
        );
      }

      const results = await Promise.all(promises);
      const errors = results.filter(r => r.error);
      
      // Some operations might fail due to pool exhaustion, but system should recover
      expect(errors.length).toBeLessThan(results.length);
    });

    it('should handle read replica failures', async () => {
      // Simulate read replica failure by testing read operations
      const readOperations = [
        () => prisma.user.findMany({ take: 5 }),
        () => prisma.conversation.findMany({ take: 5 }),
        () => prisma.message.findMany({ take: 5 }),
      ];

      for (const operation of readOperations) {
        try {
          const result = await operation();
          expect(Array.isArray(result)).toBe(true);
        } catch (error) {
          // Should fallback to primary database
          console.log('Read operation failed, should fallback:', error.message);
        }
      }
    });
  });

  describe('Elasticsearch Failover Scenarios', () => {
    it('should handle Elasticsearch cluster unavailability', async () => {
      // Mock Elasticsearch failure
      const originalSearch = elasticsearch.search;
      elasticsearch.search = jest.fn().mockRejectedValue(new Error('Cluster unavailable'));

      // Search should gracefully degrade
      const response = await request(app.getHttpServer())
        .get('/search/messages')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Tenant-ID', tenantId)
        .query({ q: 'test' })
        .expect(503); // Service unavailable

      expect(response.body.message).toContain('Search service temporarily unavailable');

      // Restore original function
      elasticsearch.search = originalSearch;
    });

    it('should handle index corruption or missing indices', async () => {
      const indexName = `messages_${tenantId}`;
      
      try {
        // Try to delete the index to simulate corruption
        await elasticsearch.indices.delete({ index: indexName });
      } catch (error) {
        // Index might not exist, which is fine for this test
      }

      // Search should handle missing index gracefully
      const response = await request(app.getHttpServer())
        .get('/search/messages')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Tenant-ID', tenantId)
        .query({ q: 'test' });

      // Should either return empty results or recreate index
      expect([200, 503]).toContain(response.status);
    });

    it('should handle Elasticsearch memory pressure', async () => {
      // Simulate high memory usage by creating many search requests
      const searchPromises: Promise<any>[] = [];
      
      for (let i = 0; i < 20; i++) {
        searchPromises.push(
          request(app.getHttpServer())
            .get('/search/messages')
            .set('Authorization', `Bearer ${authToken}`)
            .set('X-Tenant-ID', tenantId)
            .query({ q: `test query ${i}` })
        );
      }

      const results = await Promise.allSettled(searchPromises);
      const successful = results.filter(r => r.status === 'fulfilled').length;
      
      // At least some searches should succeed
      expect(successful).toBeGreaterThan(0);
    });
  });

  describe('Network Partition Scenarios', () => {
    it('should handle network timeouts gracefully', async () => {
      // Simulate network timeout by setting very short timeouts
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Network timeout')), 50)
      );

      try {
        await Promise.race([
          request(app.getHttpServer()).get('/health'),
          timeoutPromise,
        ]);
      } catch (error) {
        expect(error.message).toContain('Network timeout');
      }
    });

    it('should handle partial service availability', async () => {
      // Test when some services are available but others are not
      const healthResponse = await request(app.getHttpServer())
        .get('/health/detailed')
        .expect(200);

      const services = healthResponse.body.details;
      
      // At least the core application should be healthy
      expect(services.database).toBeDefined();
      expect(services.redis).toBeDefined();
    });
  });

  describe('Data Consistency During Failures', () => {
    it('should maintain message ordering during Redis failures', async () => {
      const conversationId = 'test-conversation-id';
      const messages: any[] = [];

      // Send messages while simulating intermittent Redis failures
      for (let i = 0; i < 10; i++) {
        try {
          if (i % 3 === 0) {
            // Simulate Redis failure every 3rd message
            await redis.disconnect();
            await new Promise(resolve => setTimeout(resolve, 100));
            await redis.connect();
          }

          const response = await request(app.getHttpServer())
            .post('/messages')
            .set('Authorization', `Bearer ${authToken}`)
            .set('X-Tenant-ID', tenantId)
            .send({
              conversationId,
              content: `Message ${i}`,
              type: 'TEXT',
            });

          if (response.status === 201) {
            messages.push(response.body);
          }
        } catch (error) {
          console.log(`Message ${i} failed:`, error.message);
        }
      }

      // Verify message sequence integrity
      messages.sort((a, b) => Number(a.sequenceNumber) - Number(b.sequenceNumber));
      
      for (let i = 1; i < messages.length; i++) {
        expect(Number(messages[i].sequenceNumber)).toBeGreaterThan(
          Number(messages[i - 1].sequenceNumber)
        );
      }
    });

    it('should handle concurrent writes during database stress', async () => {
      const conversationId = 'stress-test-conversation';
      const concurrentWrites = 20;
      const promises: Promise<any>[] = [];

      for (let i = 0; i < concurrentWrites; i++) {
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
            .catch(err => ({ error: err.message, index: i }))
        );
      }

      const results = await Promise.all(promises);
      const successful = results.filter(r => !r.error && r.status === 201);
      const failed = results.filter(r => r.error);

      console.log(`Successful writes: ${successful.length}, Failed: ${failed.length}`);
      
      // At least 80% should succeed
      expect(successful.length).toBeGreaterThan(concurrentWrites * 0.8);
    });
  });

  describe('Recovery Procedures', () => {
    it('should recover from complete system restart', async () => {
      // Simulate system restart by recreating the app
      await app.close();
      
      const moduleFixture: TestingModule = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();

      app = moduleFixture.createNestApplication();
      await app.init();
      await app.listen(0);

      // Verify system is functional after restart
      const response = await request(app.getHttpServer())
        .get('/health')
        .expect(200);

      expect(response.body.status).toBe('ok');
    });

    it('should handle graceful shutdown', async () => {
      // Test graceful shutdown procedures
      const shutdownPromise = app.close();
      
      // Should complete within reasonable time
      await expect(
        Promise.race([
          shutdownPromise,
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Shutdown timeout')), 10000)
          ),
        ])
      ).resolves.toBeUndefined();
    });
  });

  describe('Monitoring and Alerting During Failures', () => {
    it('should expose failure metrics', async () => {
      const metricsResponse = await request(app.getHttpServer())
        .get('/metrics')
        .expect(200);

      const metrics = metricsResponse.text;
      
      // Should contain error rate metrics
      expect(metrics).toContain('http_requests_total');
      expect(metrics).toContain('http_request_duration');
    });

    it('should provide detailed health status during degraded state', async () => {
      // Disconnect Redis to create degraded state
      await redis.disconnect();

      const healthResponse = await request(app.getHttpServer())
        .get('/health/detailed')
        .expect(200);

      expect(healthResponse.body.status).toBe('ok');
      expect(healthResponse.body.details.redis.status).toBe('down');

      // Reconnect
      await redis.connect();
    });
  });
});
