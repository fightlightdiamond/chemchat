import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { io, Socket } from 'socket.io-client';
import { AppModule } from '../../src/app.module';
import { getTestContext } from '../setup/integration-setup';
import { TestDataFactory } from '../fixtures/test-data';
import * as bcrypt from 'bcrypt';

describe('Chat Workflow E2E Tests', () => {
  let app: INestApplication;
  let testContext: any;
  let clientSocket: Socket;
  let authToken: string;
  let testUser: any;
  let testTenant: any;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    await app.listen(0); // Listen on random port
    
    const server = app.getHttpServer();
    const address = server.address();
    const port = typeof address === 'string' ? 3000 : address?.port || 3000;

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

    // Setup WebSocket client
    clientSocket = io(`http://localhost:${port}`, {
      auth: { token: authToken },
      query: { tenantId: testTenant.id },
    });

    await new Promise((resolve) => {
      clientSocket.on('connect', resolve);
    });
  });

  afterAll(async () => {
    if (clientSocket) {
      clientSocket.disconnect();
    }
    await app.close();
  });

  describe('Complete Chat Workflow', () => {
    it('should complete full chat workflow: create conversation, send messages, edit, delete', async () => {
      // Step 1: Create a conversation
      const conversationResponse = await request(app.getHttpServer())
        .post('/chat/conversations')
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-tenant-id', testTenant.id)
        .send({
          title: 'E2E Test Conversation',
          type: 'DIRECT',
          participantIds: [testUser.id],
        })
        .expect(201);

      const conversationId = conversationResponse.body.id;
      expect(conversationId).toBeDefined();

      // Step 2: Join the conversation via WebSocket
      const joinPromise = new Promise((resolve) => {
        clientSocket.on('room_joined', resolve);
      });

      clientSocket.emit('join_room', { conversationId });
      await joinPromise;

      // Step 3: Send a message via REST API
      const messageResponse = await request(app.getHttpServer())
        .post(`/chat/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-tenant-id', testTenant.id)
        .send({
          content: 'Hello from E2E test!',
          type: 'TEXT',
        })
        .expect(201);

      const messageId = messageResponse.body.id;
      expect(messageId).toBeDefined();

      // Step 4: Verify message received via WebSocket
      const messageReceivedPromise = new Promise((resolve) => {
        clientSocket.on('message_created', (data) => {
          if (data.id === messageId) {
            resolve(data);
          }
        });
      });

      const receivedMessage = await messageReceivedPromise;
      expect(receivedMessage).toMatchObject({
        id: messageId,
        content: 'Hello from E2E test!',
        authorId: testUser.id,
      });

      // Step 5: Send message via WebSocket
      const wsMessagePromise = new Promise((resolve) => {
        clientSocket.on('message_created', (data) => {
          if (data.content === 'WebSocket message') {
            resolve(data);
          }
        });
      });

      clientSocket.emit('send_message', {
        conversationId,
        content: 'WebSocket message',
        type: 'TEXT',
      });

      const wsMessage = await wsMessagePromise;
      expect(wsMessage).toMatchObject({
        content: 'WebSocket message',
        authorId: testUser.id,
      });

      // Step 6: Edit the first message
      const editResponse = await request(app.getHttpServer())
        .put(`/chat/messages/${messageId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-tenant-id', testTenant.id)
        .send({
          content: 'Edited message content',
        })
        .expect(200);

      expect(editResponse.body.content).toBe('Edited message content');
      expect(editResponse.body.isEdited).toBe(true);

      // Step 7: Get conversation history
      const historyResponse = await request(app.getHttpServer())
        .get(`/chat/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-tenant-id', testTenant.id)
        .expect(200);

      expect(historyResponse.body.data).toHaveLength(2);
      expect(historyResponse.body.data[0].content).toBe('WebSocket message');
      expect(historyResponse.body.data[1].content).toBe('Edited message content');

      // Step 8: Delete a message
      await request(app.getHttpServer())
        .delete(`/chat/messages/${messageId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-tenant-id', testTenant.id)
        .expect(200);

      // Step 9: Verify message is soft deleted
      const updatedHistoryResponse = await request(app.getHttpServer())
        .get(`/chat/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-tenant-id', testTenant.id)
        .expect(200);

      expect(updatedHistoryResponse.body.data).toHaveLength(1);
      expect(updatedHistoryResponse.body.data[0].content).toBe('WebSocket message');
    });

    it('should handle typing indicators', async () => {
      // Create conversation
      const conversationResponse = await request(app.getHttpServer())
        .post('/chat/conversations')
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-tenant-id', testTenant.id)
        .send({
          title: 'Typing Test Conversation',
          type: 'DIRECT',
          participantIds: [testUser.id],
        });

      const conversationId = conversationResponse.body.id;

      // Join room
      clientSocket.emit('join_room', { conversationId });

      // Test typing indicators
      const typingStartPromise = new Promise((resolve) => {
        clientSocket.on('user_typing', resolve);
      });

      clientSocket.emit('start_typing', { conversationId });
      const typingData = await typingStartPromise;

      expect(typingData).toMatchObject({
        userId: testUser.id,
        conversationId,
        isTyping: true,
      });

      // Test stop typing
      const typingStopPromise = new Promise((resolve) => {
        clientSocket.on('user_typing', (data) => {
          if (!data.isTyping) {
            resolve(data);
          }
        });
      });

      clientSocket.emit('stop_typing', { conversationId });
      const stopTypingData = await typingStopPromise;

      expect(stopTypingData).toMatchObject({
        userId: testUser.id,
        conversationId,
        isTyping: false,
      });
    });

    it('should handle user presence', async () => {
      // Test presence updates
      const presencePromise = new Promise((resolve) => {
        clientSocket.on('presence_updated', resolve);
      });

      clientSocket.emit('update_presence', { status: 'ONLINE' });
      const presenceData = await presencePromise;

      expect(presenceData).toMatchObject({
        userId: testUser.id,
        status: 'ONLINE',
      });
    });

    it('should handle real-time message delivery across multiple users', async () => {
      // Create second user
      const secondUser = TestDataFactory.createUser(testTenant.id, {
        email: 'user2@example.com',
        passwordHash: await bcrypt.hash('testpassword', 10),
      });
      await testContext.prisma.user.create({ data: secondUser });

      // Login second user
      const loginResponse2 = await request(app.getHttpServer())
        .post('/auth/login')
        .set('x-tenant-id', testTenant.id)
        .send({
          email: secondUser.email,
          password: 'testpassword',
          deviceFingerprint: 'test-device-2',
        });

      const authToken2 = loginResponse2.body.tokens.accessToken;

      // Create second WebSocket connection
      const server = app.getHttpServer();
      const address = server.address();
      const port = typeof address === 'string' ? 3000 : address?.port || 3000;

      const clientSocket2 = io(`http://localhost:${port}`, {
        auth: { token: authToken2 },
        query: { tenantId: testTenant.id },
      });

      await new Promise((resolve) => {
        clientSocket2.on('connect', resolve);
      });

      // Create conversation with both users
      const conversationResponse = await request(app.getHttpServer())
        .post('/chat/conversations')
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-tenant-id', testTenant.id)
        .send({
          title: 'Multi-user Conversation',
          type: 'GROUP',
          participantIds: [testUser.id, secondUser.id],
        });

      const conversationId = conversationResponse.body.id;

      // Both users join the room
      clientSocket.emit('join_room', { conversationId });
      clientSocket2.emit('join_room', { conversationId });

      // User 2 should receive message from User 1
      const messageReceivedPromise = new Promise((resolve) => {
        clientSocket2.on('message_created', resolve);
      });

      clientSocket.emit('send_message', {
        conversationId,
        content: 'Message from User 1',
        type: 'TEXT',
      });

      const receivedMessage = await messageReceivedPromise;
      expect(receivedMessage).toMatchObject({
        content: 'Message from User 1',
        authorId: testUser.id,
      });

      clientSocket2.disconnect();
    });
  });
});
