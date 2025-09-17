import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { ChatModule } from '../../src/chat/chat.module';
import { AuthModule } from '../../src/auth/auth.module';
import { PrismaModule } from '../../src/prisma/prisma.module';
import { RedisModule } from '../../src/redis/redis.module';
import { ConfigModule } from '@nestjs/config';
import { getTestContext } from '../setup/integration-setup';
import { TestDataFactory } from '../fixtures/test-data';
import { MessageType } from '@prisma/client';
import * as bcrypt from 'bcrypt';

describe('Chat Integration Tests', () => {
  let app: INestApplication;
  let testContext: any;
  let authToken: string;
  let testUser: any;
  let testTenant: any;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env.test' }),
        ChatModule,
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

    // Setup test user and authentication
    testTenant = TestDataFactory.createTenant();
    const passwordHash = await bcrypt.hash('testpassword', 10);
    testUser = TestDataFactory.createUser(testTenant.id, { passwordHash });

    await testContext.prisma.tenant.create({ data: testTenant });
    await testContext.prisma.user.create({ data: testUser });

    // Get auth token
    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .set('x-tenant-id', testTenant.id)
      .send({
        email: testUser.email,
        password: 'testpassword',
        deviceFingerprint: 'test-device',
      });

    authToken = loginResponse.body.tokens.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /chat/conversations', () => {
    it('should create a new conversation', async () => {
      const conversationDto = {
        title: 'Test Conversation',
        type: 'DIRECT',
        participantIds: [testUser.id],
      };

      const response = await request(app.getHttpServer())
        .post('/chat/conversations')
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-tenant-id', testTenant.id)
        .send(conversationDto)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.title).toBe(conversationDto.title);
      expect(response.body.type).toBe(conversationDto.type);
    });

    it('should validate conversation data', async () => {
      await request(app.getHttpServer())
        .post('/chat/conversations')
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-tenant-id', testTenant.id)
        .send({})
        .expect(400);
    });
  });

  describe('POST /chat/conversations/:id/messages', () => {
    let conversationId: string;

    beforeEach(async () => {
      const conversation = TestDataFactory.createConversation(testTenant.id);
      await testContext.prisma.conversation.create({ data: conversation });
      conversationId = conversation.id;
    });

    it('should send a message to conversation', async () => {
      const messageDto = {
        content: 'Hello, this is a test message',
        type: MessageType.TEXT,
      };

      const response = await request(app.getHttpServer())
        .post(`/chat/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-tenant-id', testTenant.id)
        .send(messageDto)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.content).toBe(messageDto.content);
      expect(response.body.type).toBe(messageDto.type);
      expect(response.body.authorId).toBe(testUser.id);
    });

    it('should validate message content', async () => {
      await request(app.getHttpServer())
        .post(`/chat/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-tenant-id', testTenant.id)
        .send({ content: '', type: MessageType.TEXT })
        .expect(400);
    });
  });

  describe('GET /chat/conversations/:id/messages', () => {
    let conversationId: string;

    beforeEach(async () => {
      const conversation = TestDataFactory.createConversation(testTenant.id);
      await testContext.prisma.conversation.create({ data: conversation });
      conversationId = conversation.id;

      // Create test messages
      const messages = TestDataFactory.createBulkMessages(
        conversationId,
        testUser.id,
        testTenant.id,
        5
      );

      for (const message of messages) {
        await testContext.prisma.message.create({ data: message });
      }
    });

    it('should retrieve conversation messages', async () => {
      const response = await request(app.getHttpServer())
        .get(`/chat/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-tenant-id', testTenant.id)
        .expect(200);

      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBe(5);
      expect(response.body).toHaveProperty('pagination');
    });

    it('should support pagination', async () => {
      const response = await request(app.getHttpServer())
        .get(`/chat/conversations/${conversationId}/messages`)
        .query({ limit: 2 })
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-tenant-id', testTenant.id)
        .expect(200);

      expect(response.body.data.length).toBe(2);
      expect(response.body.pagination.hasNext).toBe(true);
    });
  });

  describe('PUT /chat/messages/:id', () => {
    let messageId: string;

    beforeEach(async () => {
      const conversation = TestDataFactory.createConversation(testTenant.id);
      await testContext.prisma.conversation.create({ data: conversation });

      const message = TestDataFactory.createMessage(
        conversation.id,
        testUser.id,
        testTenant.id
      );
      await testContext.prisma.message.create({ data: message });
      messageId = message.id;
    });

    it('should update message content', async () => {
      const updateDto = {
        content: 'Updated message content',
      };

      const response = await request(app.getHttpServer())
        .put(`/chat/messages/${messageId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-tenant-id', testTenant.id)
        .send(updateDto)
        .expect(200);

      expect(response.body.content).toBe(updateDto.content);
      expect(response.body.isEdited).toBe(true);
    });

    it('should prevent editing others messages', async () => {
      const otherUser = TestDataFactory.createUser(testTenant.id);
      await testContext.prisma.user.create({ data: otherUser });

      const conversation = TestDataFactory.createConversation(testTenant.id);
      await testContext.prisma.conversation.create({ data: conversation });

      const otherMessage = TestDataFactory.createMessage(
        conversation.id,
        otherUser.id,
        testTenant.id
      );
      await testContext.prisma.message.create({ data: otherMessage });

      await request(app.getHttpServer())
        .put(`/chat/messages/${otherMessage.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-tenant-id', testTenant.id)
        .send({ content: 'Unauthorized edit' })
        .expect(403);
    });
  });

  describe('DELETE /chat/messages/:id', () => {
    let messageId: string;

    beforeEach(async () => {
      const conversation = TestDataFactory.createConversation(testTenant.id);
      await testContext.prisma.conversation.create({ data: conversation });

      const message = TestDataFactory.createMessage(
        conversation.id,
        testUser.id,
        testTenant.id
      );
      await testContext.prisma.message.create({ data: message });
      messageId = message.id;
    });

    it('should delete message', async () => {
      await request(app.getHttpServer())
        .delete(`/chat/messages/${messageId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-tenant-id', testTenant.id)
        .expect(200);

      // Verify message is soft deleted
      const deletedMessage = await testContext.prisma.message.findUnique({
        where: { id: messageId },
      });
      expect(deletedMessage.isDeleted).toBe(true);
    });
  });

  describe('GET /chat/conversations', () => {
    beforeEach(async () => {
      // Create test conversations
      const conversations = [
        TestDataFactory.createConversation(testTenant.id, { title: 'Conv 1' }),
        TestDataFactory.createConversation(testTenant.id, { title: 'Conv 2' }),
      ];

      for (const conversation of conversations) {
        await testContext.prisma.conversation.create({ data: conversation });
      }
    });

    it('should list user conversations', async () => {
      const response = await request(app.getHttpServer())
        .get('/chat/conversations')
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-tenant-id', testTenant.id)
        .expect(200);

      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);
    });
  });
});
