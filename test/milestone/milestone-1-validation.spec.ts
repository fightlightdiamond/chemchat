import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import * as request from 'supertest';
import { io, Socket } from 'socket.io-client';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import * as bcrypt from 'bcrypt';

describe('Milestone 1: Core Chat Foundation Validation', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let testTenant: any;
  let testUsers: any[];
  let authTokens: string[];
  let wsClients: Socket[];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    prisma = app.get<PrismaService>(PrismaService);
    
    await app.init();
    await app.listen(0); // Random port for testing

    // Setup test data
    await setupTestData();
  });

  afterAll(async () => {
    // Cleanup WebSocket connections
    wsClients.forEach(client => client.disconnect());
    
    // Cleanup test data
    await cleanupTestData();
    
    await app.close();
  });

  describe('Task 1: Database Schema and Models', () => {
    it('should have all required database models', async () => {
      // Verify core models exist and are accessible
      expect(prisma.tenant).toBeDefined();
      expect(prisma.user).toBeDefined();
      expect(prisma.conversation).toBeDefined();
      expect(prisma.message).toBeDefined();
      expect(prisma.conversationParticipant).toBeDefined();
    });

    it('should create tenant with proper schema', async () => {
      const tenant = await prisma.tenant.findUnique({
        where: { id: testTenant.id }
      });
      
      expect(tenant).toBeDefined();
      expect(tenant.name).toBe('Test Tenant');
      expect(tenant.subscriptionTier).toBe('ENTERPRISE');
      expect(tenant.status).toBe('ACTIVE');
    });

    it('should create users with proper relationships', async () => {
      const users = await prisma.user.findMany({
        where: { tenantId: testTenant.id }
      });
      
      expect(users).toHaveLength(3);
      users.forEach(user => {
        expect(user.tenantId).toBe(testTenant.id);
        expect(user.email).toContain('@test.com');
        expect(user.passwordHash).toBeDefined();
      });
    });

    it('should support conversation and message relationships', async () => {
      const conversation = await prisma.conversation.findFirst({
        where: { tenantId: testTenant.id },
        include: {
          participants: true,
          messages: true
        }
      });
      
      expect(conversation).toBeDefined();
      expect(conversation.participants.length).toBeGreaterThan(0);
      expect(conversation.messages).toBeDefined();
    });
  });

  describe('Task 2: User Management and Authentication', () => {
    it('should register new users successfully', async () => {
      const newUser = {
        email: 'newuser@test.com',
        username: 'newuser',
        displayName: 'New User',
        password: 'password123'
      };

      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send(newUser)
        .expect(201);

      expect(response.body.user).toBeDefined();
      expect(response.body.user.email).toBe(newUser.email);
      expect(response.body.accessToken).toBeDefined();
    });

    it('should authenticate users and return JWT tokens', async () => {
      const loginData = {
        email: testUsers[0].email,
        password: 'password123'
      };

      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send(loginData)
        .expect(200);

      expect(response.body.accessToken).toBeDefined();
      expect(response.body.refreshToken).toBeDefined();
      expect(response.body.user).toBeDefined();
      expect(response.body.user.id).toBe(testUsers[0].id);
    });

    it('should protect routes with JWT authentication', async () => {
      // Test without token
      await request(app.getHttpServer())
        .get('/auth/profile')
        .expect(401);

      // Test with valid token
      await request(app.getHttpServer())
        .get('/auth/profile')
        .set('Authorization', `Bearer ${authTokens[0]}`)
        .expect(200);
    });

    it('should refresh JWT tokens', async () => {
      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: testUsers[0].email,
          password: 'password123'
        });

      const refreshResponse = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({
          refreshToken: loginResponse.body.refreshToken
        })
        .expect(200);

      expect(refreshResponse.body.accessToken).toBeDefined();
      expect(refreshResponse.body.accessToken).not.toBe(loginResponse.body.accessToken);
    });
  });

  describe('Task 4.1: CQRS Command Infrastructure', () => {
    it('should handle SendMessage command', async () => {
      const conversation = await prisma.conversation.findFirst({
        where: { tenantId: testTenant.id }
      });

      const messageData = {
        conversationId: conversation.id,
        content: 'Test message from CQRS command',
        type: 'TEXT'
      };

      const response = await request(app.getHttpServer())
        .post('/chat/messages')
        .set('Authorization', `Bearer ${authTokens[0]}`)
        .send(messageData)
        .expect(201);

      expect(response.body.id).toBeDefined();
      expect(response.body.content).toBe(messageData.content);
      expect(response.body.sequenceNumber).toBeDefined();
    });

    it('should handle CreateConversation command', async () => {
      const conversationData = {
        name: 'Test Conversation from CQRS',
        type: 'GROUP',
        participantIds: [testUsers[0].id, testUsers[1].id]
      };

      const response = await request(app.getHttpServer())
        .post('/chat/conversations')
        .set('Authorization', `Bearer ${authTokens[0]}`)
        .send(conversationData)
        .expect(201);

      expect(response.body.id).toBeDefined();
      expect(response.body.name).toBe(conversationData.name);
      expect(response.body.type).toBe(conversationData.type);
    });

    it('should validate commands properly', async () => {
      // Test invalid message command
      await request(app.getHttpServer())
        .post('/chat/messages')
        .set('Authorization', `Bearer ${authTokens[0]}`)
        .send({
          conversationId: 'invalid-id',
          content: '', // Empty content should fail validation
          type: 'INVALID_TYPE'
        })
        .expect(400);
    });
  });

  describe('Task 5.1: Message Ordering and Sequence Management', () => {
    it('should assign sequential sequence numbers to messages', async () => {
      const conversation = await prisma.conversation.findFirst({
        where: { tenantId: testTenant.id }
      });

      // Send multiple messages
      const messages = [];
      for (let i = 0; i < 5; i++) {
        const response = await request(app.getHttpServer())
          .post('/chat/messages')
          .set('Authorization', `Bearer ${authTokens[0]}`)
          .send({
            conversationId: conversation.id,
            content: `Sequential message ${i + 1}`,
            type: 'TEXT'
          })
          .expect(201);
        
        messages.push(response.body);
      }

      // Verify sequence numbers are sequential
      for (let i = 1; i < messages.length; i++) {
        const prevSeq = BigInt(messages[i - 1].sequenceNumber);
        const currSeq = BigInt(messages[i].sequenceNumber);
        expect(currSeq).toBeGreaterThan(prevSeq);
      }
    });

    it('should handle idempotency for duplicate messages', async () => {
      const conversation = await prisma.conversation.findFirst({
        where: { tenantId: testTenant.id }
      });

      const messageData = {
        conversationId: conversation.id,
        content: 'Idempotent test message',
        type: 'TEXT',
        clientMessageId: 'unique-client-id-123'
      };

      // Send same message twice
      const response1 = await request(app.getHttpServer())
        .post('/chat/messages')
        .set('Authorization', `Bearer ${authTokens[0]}`)
        .send(messageData)
        .expect(201);

      const response2 = await request(app.getHttpServer())
        .post('/chat/messages')
        .set('Authorization', `Bearer ${authTokens[0]}`)
        .send(messageData)
        .expect(200); // Should return existing message

      expect(response1.body.id).toBe(response2.body.id);
      expect(response1.body.sequenceNumber).toBe(response2.body.sequenceNumber);
    });
  });

  describe('Task 6.1: WebSocket Gateway and Real-time Communication', () => {
    it('should establish WebSocket connection with authentication', (done) => {
      const client = io(`http://localhost:${app.getHttpAdapter().getHttpServer().address().port}`, {
        auth: {
          token: authTokens[0]
        }
      });

      client.on('connect', () => {
        expect(client.connected).toBe(true);
        wsClients.push(client);
        done();
      });

      client.on('connect_error', (error) => {
        done(error);
      });
    });

    it('should join and leave rooms', (done) => {
      const client = wsClients[0];
      
      prisma.conversation.findFirst({
        where: { tenantId: testTenant.id }
      }).then(conversation => {
        client.emit('join_room', { conversationId: conversation.id });
        
        client.on('room_joined', (data) => {
          expect(data.conversationId).toBe(conversation.id);
          
          client.emit('leave_room', { conversationId: conversation.id });
          
          client.on('room_left', (data) => {
            expect(data.conversationId).toBe(conversation.id);
            done();
          });
        });
      });
    });

    it('should broadcast messages in real-time', (done) => {
      // Setup two WebSocket clients
      const client1 = wsClients[0];
      const client2 = io(`http://localhost:${app.getHttpAdapter().getHttpServer().address().port}`, {
        auth: {
          token: authTokens[1]
        }
      });

      client2.on('connect', () => {
        wsClients.push(client2);
        
        prisma.conversation.findFirst({
          where: { tenantId: testTenant.id }
        }).then(conversation => {
          // Both clients join the same room
          client1.emit('join_room', { conversationId: conversation.id });
          client2.emit('join_room', { conversationId: conversation.id });
          
          // Client2 listens for new messages
          client2.on('message_created', (data) => {
            expect(data.content).toBe('Real-time broadcast test');
            expect(data.conversationId).toBe(conversation.id);
            done();
          });
          
          // Client1 sends a message
          setTimeout(() => {
            client1.emit('send_message', {
              conversationId: conversation.id,
              content: 'Real-time broadcast test',
              type: 'TEXT'
            });
          }, 100);
        });
      });
    });

    it('should handle WebSocket authentication errors', (done) => {
      const client = io(`http://localhost:${app.getHttpAdapter().getHttpServer().address().port}`, {
        auth: {
          token: 'invalid-token'
        }
      });

      client.on('connect_error', (error) => {
        expect(error.message).toContain('Authentication failed');
        done();
      });
    });
  });

  describe('Task 21: Development Environment', () => {
    it('should have all required services running', async () => {
      // Test database connection
      const dbTest = await prisma.$queryRaw`SELECT 1 as test`;
      expect(dbTest).toBeDefined();

      // Test Redis connection (if available)
      // Test Elasticsearch connection (if available)
      // These would require additional setup in test environment
    });

    it('should have proper environment configuration', () => {
      expect(process.env.NODE_ENV).toBeDefined();
      expect(process.env.DATABASE_URL).toBeDefined();
      expect(process.env.JWT_ACCESS_SECRET).toBeDefined();
    });
  });

  describe('Integration: Complete Chat Flow', () => {
    it('should complete full chat workflow', async () => {
      // 1. Create conversation
      const conversationResponse = await request(app.getHttpServer())
        .post('/chat/conversations')
        .set('Authorization', `Bearer ${authTokens[0]}`)
        .send({
          name: 'Integration Test Chat',
          type: 'GROUP',
          participantIds: [testUsers[0].id, testUsers[1].id]
        })
        .expect(201);

      const conversationId = conversationResponse.body.id;

      // 2. Send messages
      const message1 = await request(app.getHttpServer())
        .post('/chat/messages')
        .set('Authorization', `Bearer ${authTokens[0]}`)
        .send({
          conversationId,
          content: 'First message in integration test',
          type: 'TEXT'
        })
        .expect(201);

      const message2 = await request(app.getHttpServer())
        .post('/chat/messages')
        .set('Authorization', `Bearer ${authTokens[1]}`)
        .send({
          conversationId,
          content: 'Second message in integration test',
          type: 'TEXT'
        })
        .expect(201);

      // 3. Retrieve conversation history
      const historyResponse = await request(app.getHttpServer())
        .get(`/chat/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${authTokens[0]}`)
        .expect(200);

      expect(historyResponse.body.data).toHaveLength(2);
      expect(historyResponse.body.data[0].content).toBe('First message in integration test');
      expect(historyResponse.body.data[1].content).toBe('Second message in integration test');

      // 4. Verify sequence numbers are correct
      expect(BigInt(historyResponse.body.data[1].sequenceNumber))
        .toBeGreaterThan(BigInt(historyResponse.body.data[0].sequenceNumber));
    });
  });

  // Helper functions
  async function setupTestData() {
    // Create test tenant
    testTenant = await prisma.tenant.create({
      data: {
        name: 'Test Tenant',
        subscriptionTier: 'ENTERPRISE',
        status: 'ACTIVE'
      }
    });

    // Create test users
    const hashedPassword = await bcrypt.hash('password123', 10);
    testUsers = await Promise.all([
      prisma.user.create({
        data: {
          email: 'user1@test.com',
          username: 'user1',
          displayName: 'Test User 1',
          passwordHash: hashedPassword,
          tenantId: testTenant.id
        }
      }),
      prisma.user.create({
        data: {
          email: 'user2@test.com',
          username: 'user2',
          displayName: 'Test User 2',
          passwordHash: hashedPassword,
          tenantId: testTenant.id
        }
      }),
      prisma.user.create({
        data: {
          email: 'user3@test.com',
          username: 'user3',
          displayName: 'Test User 3',
          passwordHash: hashedPassword,
          tenantId: testTenant.id
        }
      })
    ]);

    // Get auth tokens for users
    authTokens = [];
    for (const user of testUsers) {
      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: user.email,
          password: 'password123'
        });
      authTokens.push(loginResponse.body.accessToken);
    }

    // Create test conversation
    const conversation = await prisma.conversation.create({
      data: {
        name: 'Test Conversation',
        type: 'GROUP',
        tenantId: testTenant.id,
        createdById: testUsers[0].id
      }
    });

    // Add participants
    await Promise.all(
      testUsers.map(user =>
        prisma.conversationParticipant.create({
          data: {
            conversationId: conversation.id,
            userId: user.id,
            role: 'MEMBER'
          }
        })
      )
    );

    wsClients = [];
  }

  async function cleanupTestData() {
    // Clean up in reverse order of dependencies
    await prisma.message.deleteMany({
      where: {
        conversation: {
          tenantId: testTenant.id
        }
      }
    });

    await prisma.conversationParticipant.deleteMany({
      where: {
        conversation: {
          tenantId: testTenant.id
        }
      }
    });

    await prisma.conversation.deleteMany({
      where: { tenantId: testTenant.id }
    });

    await prisma.user.deleteMany({
      where: { tenantId: testTenant.id }
    });

    await prisma.tenant.delete({
      where: { id: testTenant.id }
    });
  }
});
