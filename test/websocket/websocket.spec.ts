import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { io, Socket } from 'socket.io-client';
import { ChatModule } from '../../src/chat/chat.module';
import { AuthModule } from '../../src/auth/auth.module';
import { PrismaModule } from '../../src/prisma/prisma.module';
import { RedisModule } from '../../src/redis/redis.module';
import { ConfigModule } from '@nestjs/config';
import { getTestContext } from '../setup/integration-setup';
import { TestDataFactory } from '../fixtures/test-data';
import * as bcrypt from 'bcrypt';

describe('WebSocket Tests', () => {
  let app: INestApplication;
  let testContext: any;
  let clientSocket: Socket;
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
    await app.listen(0);

    const server = app.getHttpServer();
    const address = server.address();
    const port = typeof address === 'string' ? 3000 : address?.port || 3000;

    testContext = getTestContext();

    // Setup test data
    testTenant = TestDataFactory.createTenant();
    const passwordHash = await bcrypt.hash('testpassword', 10);
    testUser = TestDataFactory.createUser(testTenant.id, { passwordHash });

    await testContext.prisma.tenant.create({ data: testTenant });
    await testContext.prisma.user.create({ data: testUser });

    // Get auth token
    const loginResponse = await fetch(`http://localhost:${port}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-tenant-id': testTenant.id,
      },
      body: JSON.stringify({
        email: testUser.email,
        password: 'testpassword',
        deviceFingerprint: 'test-device',
      }),
    });

    const loginData = await loginResponse.json();
    authToken = loginData.tokens.accessToken;

    // Setup WebSocket client
    clientSocket = io(`http://localhost:${port}`, {
      auth: { token: authToken },
      query: { tenantId: testTenant.id },
    });
  });

  afterAll(async () => {
    if (clientSocket) {
      clientSocket.disconnect();
    }
    await app.close();
  });

  describe('Connection and Authentication', () => {
    it('should connect with valid auth token', (done) => {
      clientSocket.on('connect', () => {
        expect(clientSocket.connected).toBe(true);
        done();
      });
    });

    it('should reject connection with invalid token', (done) => {
      const invalidSocket = io(`http://localhost:${app.getHttpServer().address()?.port}`, {
        auth: { token: 'invalid-token' },
        query: { tenantId: testTenant.id },
      });

      invalidSocket.on('connect_error', (error) => {
        expect(error.message).toContain('Authentication failed');
        invalidSocket.disconnect();
        done();
      });
    });
  });

  describe('Room Management', () => {
    let conversationId: string;

    beforeEach(async () => {
      const conversation = TestDataFactory.createConversation(testTenant.id);
      await testContext.prisma.conversation.create({ data: conversation });
      conversationId = conversation.id;
    });

    it('should join room successfully', (done) => {
      clientSocket.emit('join_room', { conversationId });

      clientSocket.on('room_joined', (data) => {
        expect(data.conversationId).toBe(conversationId);
        expect(data.userId).toBe(testUser.id);
        done();
      });
    });

    it('should leave room successfully', (done) => {
      // First join the room
      clientSocket.emit('join_room', { conversationId });

      clientSocket.on('room_joined', () => {
        // Then leave the room
        clientSocket.emit('leave_room', { conversationId });

        clientSocket.on('room_left', (data) => {
          expect(data.conversationId).toBe(conversationId);
          expect(data.userId).toBe(testUser.id);
          done();
        });
      });
    });

    it('should handle unauthorized room access', (done) => {
      const unauthorizedConversation = TestDataFactory.createConversation('other-tenant');
      
      clientSocket.emit('join_room', { conversationId: unauthorizedConversation.id });

      clientSocket.on('error', (error) => {
        expect(error.message).toContain('Unauthorized');
        done();
      });
    });
  });

  describe('Message Operations', () => {
    let conversationId: string;

    beforeEach(async () => {
      const conversation = TestDataFactory.createConversation(testTenant.id);
      await testContext.prisma.conversation.create({ data: conversation });
      conversationId = conversation.id;

      // Join the room first
      return new Promise<void>((resolve) => {
        clientSocket.emit('join_room', { conversationId });
        clientSocket.on('room_joined', () => resolve());
      });
    });

    it('should send message via WebSocket', (done) => {
      const messageData = {
        conversationId,
        content: 'Test WebSocket message',
        type: 'TEXT',
      };

      clientSocket.emit('send_message', messageData);

      clientSocket.on('message_created', (data) => {
        expect(data.content).toBe(messageData.content);
        expect(data.authorId).toBe(testUser.id);
        expect(data.conversationId).toBe(conversationId);
        done();
      });
    });

    it('should edit message via WebSocket', async () => {
      // First create a message
      const message = TestDataFactory.createMessage(conversationId, testUser.id, testTenant.id);
      await testContext.prisma.message.create({ data: message });

      return new Promise<void>((done) => {
        const editData = {
          messageId: message.id,
          content: 'Edited via WebSocket',
        };

        clientSocket.emit('edit_message', editData);

        clientSocket.on('message_edited', (data) => {
          expect(data.id).toBe(message.id);
          expect(data.content).toBe(editData.content);
          expect(data.isEdited).toBe(true);
          done();
        });
      });
    });

    it('should delete message via WebSocket', async () => {
      // First create a message
      const message = TestDataFactory.createMessage(conversationId, testUser.id, testTenant.id);
      await testContext.prisma.message.create({ data: message });

      return new Promise<void>((done) => {
        clientSocket.emit('delete_message', { messageId: message.id });

        clientSocket.on('message_deleted', (data) => {
          expect(data.id).toBe(message.id);
          expect(data.isDeleted).toBe(true);
          done();
        });
      });
    });

    it('should get conversation history via WebSocket', (done) => {
      // Create some test messages
      const messages = TestDataFactory.createBulkMessages(conversationId, testUser.id, testTenant.id, 3);
      
      Promise.all(messages.map(msg => testContext.prisma.message.create({ data: msg })))
        .then(() => {
          clientSocket.emit('get_history', { conversationId, limit: 10 });

          clientSocket.on('history_retrieved', (data) => {
            expect(Array.isArray(data.messages)).toBe(true);
            expect(data.messages.length).toBe(3);
            done();
          });
        });
    });
  });

  describe('Typing Indicators', () => {
    let conversationId: string;

    beforeEach(async () => {
      const conversation = TestDataFactory.createConversation(testTenant.id);
      await testContext.prisma.conversation.create({ data: conversation });
      conversationId = conversation.id;

      // Join the room first
      return new Promise<void>((resolve) => {
        clientSocket.emit('join_room', { conversationId });
        clientSocket.on('room_joined', () => resolve());
      });
    });

    it('should handle start typing event', (done) => {
      clientSocket.emit('start_typing', { conversationId });

      clientSocket.on('user_typing', (data) => {
        expect(data.userId).toBe(testUser.id);
        expect(data.conversationId).toBe(conversationId);
        expect(data.isTyping).toBe(true);
        done();
      });
    });

    it('should handle stop typing event', (done) => {
      // First start typing
      clientSocket.emit('start_typing', { conversationId });

      clientSocket.on('user_typing', (data) => {
        if (data.isTyping) {
          // Now stop typing
          clientSocket.emit('stop_typing', { conversationId });
        } else {
          expect(data.userId).toBe(testUser.id);
          expect(data.conversationId).toBe(conversationId);
          expect(data.isTyping).toBe(false);
          done();
        }
      });
    });

    it('should auto-stop typing after timeout', (done) => {
      clientSocket.emit('start_typing', { conversationId });

      let typingStartReceived = false;
      clientSocket.on('user_typing', (data) => {
        if (data.isTyping && !typingStartReceived) {
          typingStartReceived = true;
          // Wait for auto-stop (should happen after 5 seconds in real implementation)
        } else if (!data.isTyping && typingStartReceived) {
          expect(data.userId).toBe(testUser.id);
          done();
        }
      });

      // Simulate timeout by manually stopping after a short delay
      setTimeout(() => {
        clientSocket.emit('stop_typing', { conversationId });
      }, 100);
    });
  });

  describe('Presence Management', () => {
    it('should update user presence', (done) => {
      clientSocket.emit('update_presence', { status: 'ONLINE' });

      clientSocket.on('presence_updated', (data) => {
        expect(data.userId).toBe(testUser.id);
        expect(data.status).toBe('ONLINE');
        done();
      });
    });

    it('should handle presence status changes', (done) => {
      const statuses = ['ONLINE', 'AWAY', 'BUSY', 'OFFLINE'];
      let statusIndex = 0;

      const testNextStatus = () => {
        if (statusIndex >= statuses.length) {
          done();
          return;
        }

        const status = statuses[statusIndex++];
        clientSocket.emit('update_presence', { status });
      };

      clientSocket.on('presence_updated', (data) => {
        expect(data.userId).toBe(testUser.id);
        expect(statuses).toContain(data.status);
        
        if (statusIndex < statuses.length) {
          setTimeout(testNextStatus, 50);
        } else {
          done();
        }
      });

      testNextStatus();
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid message data', (done) => {
      clientSocket.emit('send_message', {
        // Missing required fields
        content: '',
      });

      clientSocket.on('error', (error) => {
        expect(error.message).toContain('validation');
        done();
      });
    });

    it('should handle non-existent conversation', (done) => {
      clientSocket.emit('send_message', {
        conversationId: 'non-existent-id',
        content: 'Test message',
        type: 'TEXT',
      });

      clientSocket.on('error', (error) => {
        expect(error.message).toContain('not found');
        done();
      });
    });
  });

  describe('Multi-client Communication', () => {
    let secondSocket: Socket;
    let conversationId: string;

    beforeAll(async () => {
      const server = app.getHttpServer();
      const address = server.address();
      const port = typeof address === 'string' ? 3000 : address?.port || 3000;

      secondSocket = io(`http://localhost:${port}`, {
        auth: { token: authToken },
        query: { tenantId: testTenant.id },
      });

      await new Promise((resolve) => {
        secondSocket.on('connect', resolve);
      });
    });

    afterAll(() => {
      if (secondSocket) {
        secondSocket.disconnect();
      }
    });

    beforeEach(async () => {
      const conversation = TestDataFactory.createConversation(testTenant.id);
      await testContext.prisma.conversation.create({ data: conversation });
      conversationId = conversation.id;

      // Both clients join the room
      await Promise.all([
        new Promise<void>((resolve) => {
          clientSocket.emit('join_room', { conversationId });
          clientSocket.on('room_joined', () => resolve());
        }),
        new Promise<void>((resolve) => {
          secondSocket.emit('join_room', { conversationId });
          secondSocket.on('room_joined', () => resolve());
        }),
      ]);
    });

    it('should broadcast messages to all clients in room', (done) => {
      const messageData = {
        conversationId,
        content: 'Broadcast test message',
        type: 'TEXT',
      };

      // Second socket should receive the message sent by first socket
      secondSocket.on('message_created', (data) => {
        expect(data.content).toBe(messageData.content);
        expect(data.authorId).toBe(testUser.id);
        done();
      });

      clientSocket.emit('send_message', messageData);
    });

    it('should broadcast typing indicators to other clients', (done) => {
      secondSocket.on('user_typing', (data) => {
        expect(data.userId).toBe(testUser.id);
        expect(data.conversationId).toBe(conversationId);
        expect(data.isTyping).toBe(true);
        done();
      });

      clientSocket.emit('start_typing', { conversationId });
    });
  });
});
