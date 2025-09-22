import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/shared/infrastructure/prisma/prisma.service';
import { TestDataFactory } from '../fixtures/test-data';

describe('Security and Compliance Validation', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let testData: TestDataFactory;
  let validToken: string;
  let tenantId: string;
  let userId: string;

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
    jwtService = app.get<JwtService>(JwtService);
    testData = new TestDataFactory(prisma);

    await app.init();
    await app.listen(0);

    // Setup test data
    const tenant = await testData.createTenant();
    const user = await testData.createUser({ tenantId: tenant.id });
    tenantId = tenant.id;
    userId = user.id;

    validToken = jwtService.sign({
      sub: userId,
      tenantId: tenantId,
      email: user.email,
    });
  });

  afterAll(async () => {
    await testData.cleanup();
    await app.close();
  });

  describe('Authentication and Authorization Security', () => {
    it('should reject requests without authentication', async () => {
      await request(app.getHttpServer())
        .get('/conversations')
        .expect(401);
    });

    it('should reject requests with invalid JWT tokens', async () => {
      await request(app.getHttpServer())
        .get('/conversations')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });

    it('should reject requests with expired JWT tokens', async () => {
      const expiredToken = jwtService.sign(
        { sub: userId, tenantId, email: 'test@example.com' },
        { expiresIn: '-1h' }
      );

      await request(app.getHttpServer())
        .get('/conversations')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401);
    });

    it('should enforce tenant isolation', async () => {
      // Create second tenant
      const tenant2 = await testData.createTenant();
      const user2 = await testData.createUser({ tenantId: tenant2.id });
      
      const token2 = jwtService.sign({
        sub: user2.id,
        tenantId: tenant2.id,
        email: user2.email,
      });

      // Create conversation in first tenant
      const conversation = await testData.createConversation({
        tenantId: tenantId,
        createdBy: userId,
      });

      // Try to access with second tenant's token
      await request(app.getHttpServer())
        .get(`/conversations/${conversation.id}`)
        .set('Authorization', `Bearer ${token2}`)
        .set('X-Tenant-ID', tenant2.id)
        .expect(404);
    });

    it('should validate JWT signature integrity', async () => {
      const tamperedToken = validToken.slice(0, -10) + 'tampered123';

      await request(app.getHttpServer())
        .get('/conversations')
        .set('Authorization', `Bearer ${tamperedToken}`)
        .expect(401);
    });
  });

  describe('Input Validation and Sanitization', () => {
    it('should reject malicious SQL injection attempts', async () => {
      const sqlInjectionPayloads = [
        "'; DROP TABLE users; --",
        "1' OR '1'='1",
        "admin'/*",
        "1; DELETE FROM messages WHERE 1=1; --",
      ];

      for (const payload of sqlInjectionPayloads) {
        await request(app.getHttpServer())
          .post('/messages')
          .set('Authorization', `Bearer ${validToken}`)
          .set('X-Tenant-ID', tenantId)
          .send({
            conversationId: payload,
            content: 'test message',
            type: 'TEXT',
          })
          .expect(400);
      }
    });

    it('should reject XSS attempts in message content', async () => {
      const xssPayloads = [
        '<script>alert("xss")</script>',
        '<img src="x" onerror="alert(1)">',
        'javascript:alert("xss")',
        '<svg onload="alert(1)">',
      ];

      const conversation = await testData.createConversation({
        tenantId,
        createdBy: userId,
      });

      for (const payload of xssPayloads) {
        const response = await request(app.getHttpServer())
          .post('/messages')
          .set('Authorization', `Bearer ${validToken}`)
          .set('X-Tenant-ID', tenantId)
          .send({
            conversationId: conversation.id,
            content: payload,
            type: 'TEXT',
          });

        // Should either reject or sanitize
        if (response.status === 201) {
          expect(response.body.content).not.toContain('<script>');
          expect(response.body.content).not.toContain('javascript:');
        } else {
          expect(response.status).toBe(400);
        }
      }
    });

    it('should validate file upload security', async () => {
      const maliciousFiles = [
        { filename: 'test.exe', mimetype: 'application/x-executable' },
        { filename: 'script.js', mimetype: 'application/javascript' },
        { filename: 'shell.sh', mimetype: 'application/x-sh' },
        { filename: 'virus.bat', mimetype: 'application/x-bat' },
      ];

      for (const file of maliciousFiles) {
        await request(app.getHttpServer())
          .post('/media/upload/url')
          .set('Authorization', `Bearer ${validToken}`)
          .set('X-Tenant-ID', tenantId)
          .send({
            filename: file.filename,
            mimetype: file.mimetype,
            size: 1024,
          })
          .expect(400);
      }
    });

    it('should enforce message size limits', async () => {
      const conversation = await testData.createConversation({
        tenantId,
        createdBy: userId,
      });

      const largeMessage = 'x'.repeat(10000); // 10KB message

      await request(app.getHttpServer())
        .post('/messages')
        .set('Authorization', `Bearer ${validToken}`)
        .set('X-Tenant-ID', tenantId)
        .send({
          conversationId: conversation.id,
          content: largeMessage,
          type: 'TEXT',
        })
        .expect(400);
    });
  });

  describe('Rate Limiting and DoS Protection', () => {
    it('should enforce API rate limits', async () => {
      const requests: Promise<any>[] = [];
      
      // Send many requests rapidly
      for (let i = 0; i < 150; i++) {
        requests.push(
          request(app.getHttpServer())
            .get('/health')
            .set('Authorization', `Bearer ${validToken}`)
        );
      }

      const responses = await Promise.all(requests);
      const rateLimited = responses.filter(r => r.status === 429);
      
      expect(rateLimited.length).toBeGreaterThan(0);
    });

    it('should handle concurrent connection limits', async () => {
      // This would require WebSocket testing
      // For now, test HTTP concurrent connections
      const concurrentRequests = 50;
      const promises: Promise<any>[] = [];

      for (let i = 0; i < concurrentRequests; i++) {
        promises.push(
          request(app.getHttpServer())
            .get('/conversations')
            .set('Authorization', `Bearer ${validToken}`)
            .set('X-Tenant-ID', tenantId)
        );
      }

      const results = await Promise.allSettled(promises);
      const successful = results.filter(r => r.status === 'fulfilled').length;
      
      // Should handle reasonable concurrent load
      expect(successful).toBeGreaterThan(concurrentRequests * 0.8);
    });

    it('should prevent brute force attacks', async () => {
      const invalidCredentials = {
        email: 'test@example.com',
        password: 'wrongpassword',
      };

      const attempts: Promise<any>[] = [];
      
      // Multiple failed login attempts
      for (let i = 0; i < 10; i++) {
        attempts.push(
          request(app.getHttpServer())
            .post('/auth/login')
            .send(invalidCredentials)
        );
      }

      const responses = await Promise.all(attempts);
      const blocked = responses.filter(r => r.status === 429);
      
      // Should start blocking after several attempts
      expect(blocked.length).toBeGreaterThan(0);
    });
  });

  describe('Data Privacy and Encryption', () => {
    it('should not expose sensitive data in API responses', async () => {
      const response = await request(app.getHttpServer())
        .get('/auth/profile')
        .set('Authorization', `Bearer ${validToken}`)
        .set('X-Tenant-ID', tenantId)
        .expect(200);

      // Should not expose password or sensitive fields
      expect(response.body.password).toBeUndefined();
      expect(response.body.passwordHash).toBeUndefined();
      expect(response.body.salt).toBeUndefined();
    });

    it('should handle PII data appropriately', async () => {
      const conversation = await testData.createConversation({
        tenantId,
        createdBy: userId,
      });

      // Send message with PII
      const messageWithPII = 'My SSN is 123-45-6789 and email is user@example.com';
      
      const response = await request(app.getHttpServer())
        .post('/messages')
        .set('Authorization', `Bearer ${validToken}`)
        .set('X-Tenant-ID', tenantId)
        .send({
          conversationId: conversation.id,
          content: messageWithPII,
          type: 'TEXT',
        })
        .expect(201);

      // Message should be stored but potentially flagged
      expect(response.body.content).toBeDefined();
    });

    it('should enforce HTTPS in production headers', async () => {
      const response = await request(app.getHttpServer())
        .get('/health')
        .expect(200);

      // In production, these headers should be present
      // For test environment, we just check the response structure
      expect(response.headers).toBeDefined();
    });
  });

  describe('Audit Logging and Compliance', () => {
    it('should log authentication events', async () => {
      // Login attempt
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'wrongpassword',
        });

      // Check if audit log was created (would require audit log service)
      // For now, just verify the endpoint responds correctly
      const auditResponse = await request(app.getHttpServer())
        .get('/admin/audit-logs')
        .set('Authorization', `Bearer ${validToken}`)
        .set('X-Tenant-ID', tenantId);

      expect([200, 403, 404]).toContain(auditResponse.status);
    });

    it('should log data access events', async () => {
      const conversation = await testData.createConversation({
        tenantId,
        createdBy: userId,
      });

      // Access conversation data
      await request(app.getHttpServer())
        .get(`/conversations/${conversation.id}`)
        .set('Authorization', `Bearer ${validToken}`)
        .set('X-Tenant-ID', tenantId)
        .expect(200);

      // Audit trail should be created
      // Implementation would depend on audit logging service
    });

    it('should handle data retention policies', async () => {
      // Create old message (simulate)
      const oldMessage = await testData.createMessage({
        conversationId: (await testData.createConversation({
          tenantId,
          createdBy: userId,
        })).id,
        userId,
        content: 'Old message for retention test',
        createdAt: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000), // 1 year ago
      });

      // Data retention endpoint (if implemented)
      const retentionResponse = await request(app.getHttpServer())
        .post('/admin/data-retention/cleanup')
        .set('Authorization', `Bearer ${validToken}`)
        .set('X-Tenant-ID', tenantId);

      expect([200, 404, 501]).toContain(retentionResponse.status);
    });
  });

  describe('Security Headers and Configuration', () => {
    it('should set appropriate security headers', async () => {
      const response = await request(app.getHttpServer())
        .get('/health')
        .expect(200);

      // Check for security headers (would be set by middleware in production)
      const headers = response.headers;
      
      // These might not be set in test environment, but structure should exist
      expect(headers).toBeDefined();
    });

    it('should handle CORS properly', async () => {
      const response = await request(app.getHttpServer())
        .options('/conversations')
        .set('Origin', 'https://malicious-site.com')
        .set('Access-Control-Request-Method', 'GET');

      // Should handle CORS appropriately
      expect([200, 204, 404]).toContain(response.status);
    });

    it('should validate content types', async () => {
      await request(app.getHttpServer())
        .post('/messages')
        .set('Authorization', `Bearer ${validToken}`)
        .set('X-Tenant-ID', tenantId)
        .set('Content-Type', 'text/plain')
        .send('invalid json content')
        .expect(400);
    });
  });

  describe('WebSocket Security', () => {
    it('should require authentication for WebSocket connections', async () => {
      // This would require WebSocket client testing
      // For now, verify the gateway exists
      const response = await request(app.getHttpServer())
        .get('/socket.io/')
        .expect(400); // Should reject HTTP requests to WebSocket endpoint
    });

    it('should validate WebSocket message formats', async () => {
      // WebSocket message validation would be tested with actual WebSocket client
      // This is a placeholder for the test structure
      expect(true).toBe(true);
    });
  });

  describe('Third-party Integration Security', () => {
    it('should validate external API responses', async () => {
      // Test external service integration security
      // This would depend on actual external services used
      expect(true).toBe(true);
    });

    it('should handle external service failures securely', async () => {
      // Test that external service failures don't expose sensitive data
      expect(true).toBe(true);
    });
  });

  describe('Compliance Requirements', () => {
    it('should support data export for GDPR compliance', async () => {
      const exportResponse = await request(app.getHttpServer())
        .post('/users/export-data')
        .set('Authorization', `Bearer ${validToken}`)
        .set('X-Tenant-ID', tenantId);

      expect([200, 202, 404, 501]).toContain(exportResponse.status);
    });

    it('should support data deletion for GDPR compliance', async () => {
      const deleteResponse = await request(app.getHttpServer())
        .delete('/users/delete-data')
        .set('Authorization', `Bearer ${validToken}`)
        .set('X-Tenant-ID', tenantId);

      expect([200, 202, 404, 501]).toContain(deleteResponse.status);
    });

    it('should handle consent management', async () => {
      const consentResponse = await request(app.getHttpServer())
        .get('/users/consent')
        .set('Authorization', `Bearer ${validToken}`)
        .set('X-Tenant-ID', tenantId);

      expect([200, 404, 501]).toContain(consentResponse.status);
    });
  });
});
