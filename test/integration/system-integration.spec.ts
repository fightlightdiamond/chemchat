import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CqrsModule } from '@nestjs/cqrs';
import { JwtService } from '@nestjs/jwt';
import { io, Socket } from 'socket.io-client';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/shared/infrastructure/prisma/prisma.service';
import { RedisService } from '../../src/shared/redis/redis.service';
import { ElasticsearchService } from '../../src/search/services/elasticsearch.service';
import { TestDataFactory } from '../fixtures/test-data';

describe('System Integration Tests', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: RedisService;
  let elasticsearch: ElasticsearchService;
  let jwtService: JwtService;
  let testData: TestDataFactory;
  let authToken: string;
  let userId: string;
  let tenantId: string;
  let conversationId: string;

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
    await app.listen(0); // Use random port for testing

    // Setup test data
    const tenant = await testData.createTenant();
    const user = await testData.createUser({ tenantId: tenant.id });
    const conversation = await testData.createConversation({ 
      tenantId: tenant.id,
      createdBy: user.id 
    });

    tenantId = tenant.id;
    userId = user.id;
    conversationId = conversation.id;

    // Generate auth token
    authToken = jwtService.sign({
      sub: userId,
      tenantId: tenantId,
      email: user.email,
    });
  });

  afterAll(async () => {
    // Cleanup test data
    await testData.cleanup();
    await app.close();
  });

  describe('Complete Message Flow Integration', () => {
    let clientSocket: Socket;
    let messageId: string;

    beforeEach((done) => {
      const serverAddress = app.getHttpServer().address();
      const port = typeof serverAddress === 'string' ? 3000 : serverAddress?.port || 3000;
      
      clientSocket = io(`http://localhost:${port}`, {
        auth: { token: authToken },
        transports: ['websocket'],
      });

      clientSocket.on('connect', () => {
        done();
      });
    });

    afterEach(() => {
      if (clientSocket.connected) {
        clientSocket.disconnect();
      }
    });

    it('should handle complete message lifecycle: send -> store -> index -> broadcast', async () => {
      const messageContent = 'Integration test message for search indexing';
      let messageReceived = false;
      let messageIndexed = false;

      // Step 1: Join conversation room
      await new Promise<void>((resolve) => {
        clientSocket.emit('join_room', { conversationId });
        clientSocket.on('room_joined', () => resolve());
      });

      // Step 2: Set up message reception listener
      clientSocket.on('message_created', (data) => {
        expect(data.content).toBe(messageContent);
        expect(data.conversationId).toBe(conversationId);
        messageId = data.id;
        messageReceived = true;
      });

      // Step 3: Send message via WebSocket
      clientSocket.emit('send_message', {
        conversationId,
        content: messageContent,
        type: 'TEXT',
      });

      // Step 4: Wait for message to be received
      await new Promise<void>((resolve) => {
        const checkMessage = () => {
          if (messageReceived) {
            resolve();
          } else {
            setTimeout(checkMessage, 100);
          }
        };
        checkMessage();
      });

      // Step 5: Verify message is stored in database
      const storedMessage = await prisma.message.findUnique({
        where: { id: messageId },
        include: { conversation: true },
      });

      expect(storedMessage).toBeTruthy();
      expect(storedMessage?.content).toBe(messageContent);
      expect(storedMessage?.conversationId).toBe(conversationId);
      expect(storedMessage?.userId).toBe(userId);

      // Step 6: Wait for Elasticsearch indexing (async process)
      await new Promise<void>((resolve) => {
        const checkIndex = async () => {
          try {
            const searchResult = await elasticsearch.search({
              index: `messages_${tenantId}`,
              body: {
                query: {
                  bool: {
                    must: [
                      { match: { content: messageContent } },
                      { term: { conversationId } },
                    ],
                  },
                },
              },
            });

            if (searchResult.body.hits.total.value > 0) {
              messageIndexed = true;
              resolve();
            } else {
              setTimeout(checkIndex, 500);
            }
          } catch (error) {
            setTimeout(checkIndex, 500);
          }
        };
        setTimeout(checkIndex, 1000); // Initial delay for indexing
      });

      expect(messageIndexed).toBe(true);
    }, 30000);

    it('should handle message editing with proper event propagation', async () => {
      // Create initial message
      const initialContent = 'Original message content';
      const editedContent = 'Edited message content';
      let editReceived = false;

      await new Promise<void>((resolve) => {
        clientSocket.emit('join_room', { conversationId });
        clientSocket.on('room_joined', () => resolve());
      });

      // Send initial message
      clientSocket.emit('send_message', {
        conversationId,
        content: initialContent,
        type: 'TEXT',
      });

      let createdMessageId: string;
      await new Promise<void>((resolve) => {
        clientSocket.on('message_created', (data) => {
          createdMessageId = data.id;
          resolve();
        });
      });

      // Set up edit listener
      clientSocket.on('message_edited', (data) => {
        expect(data.content).toBe(editedContent);
        expect(data.id).toBe(createdMessageId);
        editReceived = true;
      });

      // Edit the message
      clientSocket.emit('edit_message', {
        messageId: createdMessageId,
        content: editedContent,
      });

      // Wait for edit confirmation
      await new Promise<void>((resolve) => {
        const checkEdit = () => {
          if (editReceived) {
            resolve();
          } else {
            setTimeout(checkEdit, 100);
          }
        };
        checkEdit();
      });

      // Verify edit in database
      const editedMessage = await prisma.message.findUnique({
        where: { id: createdMessageId },
      });

      expect(editedMessage?.content).toBe(editedContent);
      expect(editedMessage?.editedAt).toBeTruthy();
    }, 15000);
  });

  describe('Cross-Service Communication', () => {
    it('should propagate events across all relevant services', async () => {
      // Test notification system integration
      const response = await request(app.getHttpServer())
        .post('/conversations')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Tenant-ID', tenantId)
        .send({
          name: 'Integration Test Conversation',
          type: 'GROUP',
          participants: [userId],
        })
        .expect(201);

      const newConversationId = response.body.id;

      // Verify conversation created in database
      const conversation = await prisma.conversation.findUnique({
        where: { id: newConversationId },
      });
      expect(conversation).toBeTruthy();

      // Verify Redis cache updated
      const cachedConversation = await redis.get(`conversation:${newConversationId}`);
      expect(cachedConversation).toBeTruthy();

      // Test search indexing for conversation
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for async indexing

      const searchResponse = await request(app.getHttpServer())
        .get('/search/messages')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Tenant-ID', tenantId)
        .query({ conversationId: newConversationId })
        .expect(200);

      expect(searchResponse.body).toBeDefined();
    });

    it('should handle tenant isolation across all services', async () => {
      // Create second tenant
      const tenant2 = await testData.createTenant();
      const user2 = await testData.createUser({ tenantId: tenant2.id });
      
      const token2 = jwtService.sign({
        sub: user2.id,
        tenantId: tenant2.id,
        email: user2.email,
      });

      // Try to access first tenant's data with second tenant's token
      await request(app.getHttpServer())
        .get(`/conversations/${conversationId}`)
        .set('Authorization', `Bearer ${token2}`)
        .set('X-Tenant-ID', tenant2.id)
        .expect(404); // Should not find conversation from different tenant

      // Verify search isolation
      const searchResponse = await request(app.getHttpServer())
        .get('/search/messages')
        .set('Authorization', `Bearer ${token2}`)
        .set('X-Tenant-ID', tenant2.id)
        .query({ q: 'test' })
        .expect(200);

      expect(searchResponse.body.data).toHaveLength(0); // No results from other tenant
    });
  });

  describe('Presence and Real-time Features', () => {
    let clientSocket1: Socket;
    let clientSocket2: Socket;

    beforeEach((done) => {
      const serverAddress = app.getHttpServer().address();
      const port = typeof serverAddress === 'string' ? 3000 : serverAddress?.port || 3000;
      
      let connectionsReady = 0;
      const checkReady = () => {
        connectionsReady++;
        if (connectionsReady === 2) done();
      };

      clientSocket1 = io(`http://localhost:${port}`, {
        auth: { token: authToken },
        transports: ['websocket'],
      });

      clientSocket2 = io(`http://localhost:${port}`, {
        auth: { token: authToken },
        transports: ['websocket'],
      });

      clientSocket1.on('connect', checkReady);
      clientSocket2.on('connect', checkReady);
    });

    afterEach(() => {
      if (clientSocket1?.connected) clientSocket1.disconnect();
      if (clientSocket2?.connected) clientSocket2.disconnect();
    });

    it('should handle presence updates across multiple connections', async () => {
      let presenceUpdates = 0;

      // Both clients join the same conversation
      await Promise.all([
        new Promise<void>((resolve) => {
          clientSocket1.emit('join_room', { conversationId });
          clientSocket1.on('room_joined', () => resolve());
        }),
        new Promise<void>((resolve) => {
          clientSocket2.emit('join_room', { conversationId });
          clientSocket2.on('room_joined', () => resolve());
        }),
      ]);

      // Set up presence listeners
      clientSocket1.on('user_presence_changed', () => presenceUpdates++);
      clientSocket2.on('user_presence_changed', () => presenceUpdates++);

      // Trigger presence update
      clientSocket1.emit('update_presence', { status: 'AWAY' });

      // Wait for presence propagation
      await new Promise<void>((resolve) => {
        const checkPresence = () => {
          if (presenceUpdates > 0) {
            resolve();
          } else {
            setTimeout(checkPresence, 100);
          }
        };
        setTimeout(checkPresence, 500);
      });

      expect(presenceUpdates).toBeGreaterThan(0);
    });

    it('should handle typing indicators with proper cleanup', async () => {
      let typingIndicatorReceived = false;
      let typingStoppedReceived = false;

      // Join room
      await new Promise<void>((resolve) => {
        clientSocket1.emit('join_room', { conversationId });
        clientSocket1.on('room_joined', () => resolve());
      });

      await new Promise<void>((resolve) => {
        clientSocket2.emit('join_room', { conversationId });
        clientSocket2.on('room_joined', () => resolve());
      });

      // Set up typing listeners
      clientSocket2.on('user_typing', (data) => {
        expect(data.userId).toBe(userId);
        expect(data.conversationId).toBe(conversationId);
        typingIndicatorReceived = true;
      });

      clientSocket2.on('user_stopped_typing', (data) => {
        expect(data.userId).toBe(userId);
        typingStoppedReceived = true;
      });

      // Start typing
      clientSocket1.emit('start_typing', { conversationId });

      // Wait for typing indicator
      await new Promise<void>((resolve) => {
        const checkTyping = () => {
          if (typingIndicatorReceived) {
            resolve();
          } else {
            setTimeout(checkTyping, 100);
          }
        };
        setTimeout(checkTyping, 500);
      });

      // Stop typing
      clientSocket1.emit('stop_typing', { conversationId });

      // Wait for stop typing
      await new Promise<void>((resolve) => {
        const checkStopTyping = () => {
          if (typingStoppedReceived) {
            resolve();
          } else {
            setTimeout(checkStopTyping, 100);
          }
        };
        setTimeout(checkStopTyping, 500);
      });

      expect(typingIndicatorReceived).toBe(true);
      expect(typingStoppedReceived).toBe(true);
    });
  });

  describe('Error Handling and Resilience', () => {
    it('should handle Redis connection failures gracefully', async () => {
      // Temporarily disable Redis connection
      await redis.disconnect();

      // API should still work with degraded functionality
      const response = await request(app.getHttpServer())
        .get('/health')
        .expect(200);

      expect(response.body.status).toBeDefined();

      // Reconnect Redis
      await redis.connect();
    });

    it('should handle database connection issues', async () => {
      // This test would require more sophisticated setup to simulate DB failures
      // For now, we'll test basic error handling
      
      const response = await request(app.getHttpServer())
        .get('/conversations/invalid-id')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Tenant-ID', tenantId)
        .expect(404);

      expect(response.body.message).toBeDefined();
    });
  });

  describe('Performance and Load Characteristics', () => {
    it('should handle concurrent message sending', async () => {
      const messageCount = 10;
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
            .expect(201)
        );
      }

      const responses = await Promise.all(promises);
      expect(responses).toHaveLength(messageCount);

      // Verify all messages are stored
      const messages = await prisma.message.findMany({
        where: { conversationId },
        orderBy: { createdAt: 'desc' },
        take: messageCount,
      });

      expect(messages).toHaveLength(messageCount);
    });

    it('should maintain proper sequence ordering under load', async () => {
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
              content: `Sequence test message ${i}`,
              type: 'TEXT',
            })
        );
      }

      await Promise.all(promises);

      // Verify sequence numbers are properly ordered
      const messages = await prisma.message.findMany({
        where: { conversationId },
        orderBy: { sequenceNumber: 'asc' },
        select: { sequenceNumber: true },
      });

      for (let i = 1; i < messages.length; i++) {
        expect(Number(messages[i].sequenceNumber)).toBeGreaterThan(
          Number(messages[i - 1].sequenceNumber)
        );
      }
    });
  });
});
