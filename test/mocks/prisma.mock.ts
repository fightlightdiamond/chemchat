import { jest } from '@jest/globals';
import { PrismaClient } from '@prisma/client';
import { TestDataFactory } from '../fixtures/test-data';

export class MockPrismaService {
  private data = {
    users: new Map(),
    tenants: new Map(),
    conversations: new Map(),
    messages: new Map(),
    conversationParticipants: new Map(),
  };

  // User operations
  user = {
    create: jest.fn(async (args: any) => {
      const user = { ...args.data, id: args.data.id || TestDataFactory.createUser('').id };
      this.data.users.set(user.id, user);
      return user;
    }),

    findUnique: jest.fn(async (args: any) => {
      if (args.where.id) {
        return this.data.users.get(args.where.id) || null;
      }
      if (args.where.email) {
        return Array.from(this.data.users.values()).find((u: any) => u.email === args.where.email) || null;
      }
      return null;
    }),

    findMany: jest.fn(async (args: any = {}) => {
      let users = Array.from(this.data.users.values());
      
      if (args.where?.tenantId) {
        users = users.filter((u: any) => u.tenantId === args.where.tenantId);
      }
      
      if (args.take) {
        users = users.slice(0, args.take);
      }
      
      return users;
    }),

    update: jest.fn(async (args: any) => {
      const user = this.data.users.get(args.where.id);
      if (!user) throw new Error('User not found');
      
      const updated = { ...user, ...args.data };
      this.data.users.set(args.where.id, updated);
      return updated;
    }),

    delete: jest.fn(async (args: any) => {
      const user = this.data.users.get(args.where.id);
      if (!user) throw new Error('User not found');
      
      this.data.users.delete(args.where.id);
      return user;
    }),

    deleteMany: jest.fn(async () => {
      const count = this.data.users.size;
      this.data.users.clear();
      return { count };
    }),
  };

  // Tenant operations
  tenant = {
    create: jest.fn(async (args: any) => {
      const tenant = { ...args.data, id: args.data.id || TestDataFactory.createTenant().id };
      this.data.tenants.set(tenant.id, tenant);
      return tenant;
    }),

    findUnique: jest.fn(async (args: any) => {
      if (args.where.id) {
        return this.data.tenants.get(args.where.id) || null;
      }
      if (args.where.subdomain) {
        return Array.from(this.data.tenants.values()).find((t: any) => t.subdomain === args.where.subdomain) || null;
      }
      return null;
    }),

    deleteMany: jest.fn(async () => {
      const count = this.data.tenants.size;
      this.data.tenants.clear();
      return { count };
    }),
  };

  // Conversation operations
  conversation = {
    create: jest.fn(async (args: any) => {
      const conversation = { ...args.data, id: args.data.id || TestDataFactory.createConversation('').id };
      this.data.conversations.set(conversation.id, conversation);
      return conversation;
    }),

    findUnique: jest.fn(async (args: any) => {
      return this.data.conversations.get(args.where.id) || null;
    }),

    findMany: jest.fn(async (args: any = {}) => {
      let conversations = Array.from(this.data.conversations.values());
      
      if (args.where?.tenantId) {
        conversations = conversations.filter((c: any) => c.tenantId === args.where.tenantId);
      }
      
      return conversations;
    }),

    deleteMany: jest.fn(async () => {
      const count = this.data.conversations.size;
      this.data.conversations.clear();
      return { count };
    }),
  };

  // Message operations
  message = {
    create: jest.fn(async (args: any) => {
      const message = { 
        ...args.data, 
        id: args.data.id || TestDataFactory.createMessage('', '', '').id,
        sequenceNumber: args.data.sequenceNumber || BigInt(Date.now())
      };
      this.data.messages.set(message.id, message);
      return message;
    }),

    findUnique: jest.fn(async (args: any) => {
      return this.data.messages.get(args.where.id) || null;
    }),

    findMany: jest.fn(async (args: any = {}) => {
      let messages = Array.from(this.data.messages.values());
      
      if (args.where?.conversationId) {
        messages = messages.filter((m: any) => m.conversationId === args.where.conversationId);
      }
      
      if (args.orderBy?.sequenceNumber) {
        messages.sort((a: any, b: any) => {
          const aSeq = Number(a.sequenceNumber);
          const bSeq = Number(b.sequenceNumber);
          return args.orderBy.sequenceNumber === 'asc' ? aSeq - bSeq : bSeq - aSeq;
        });
      }
      
      if (args.take) {
        messages = messages.slice(0, args.take);
      }
      
      return messages;
    }),

    update: jest.fn(async (args: any) => {
      const message = this.data.messages.get(args.where.id);
      if (!message) throw new Error('Message not found');
      
      const updated = { ...message, ...args.data };
      this.data.messages.set(args.where.id, updated);
      return updated;
    }),

    delete: jest.fn(async (args: any) => {
      const message = this.data.messages.get(args.where.id);
      if (!message) throw new Error('Message not found');
      
      this.data.messages.delete(args.where.id);
      return message;
    }),

    deleteMany: jest.fn(async () => {
      const count = this.data.messages.size;
      this.data.messages.clear();
      return { count };
    }),
  };

  // Conversation participants
  conversationParticipant = {
    create: jest.fn(async (args: any) => {
      const participant = { ...args.data, id: Date.now().toString() };
      this.data.conversationParticipants.set(participant.id, participant);
      return participant;
    }),

    deleteMany: jest.fn(async () => {
      const count = this.data.conversationParticipants.size;
      this.data.conversationParticipants.clear();
      return { count };
    }),
  };

  // Additional mock operations
  messageReaction = {
    deleteMany: jest.fn(async () => ({ count: 0 })),
  };

  // Transaction support
  $transaction = jest.fn(async (operations: any[]) => {
    const results = [];
    for (const operation of operations) {
      results.push(await operation);
    }
    return results;
  });

  // Reset mock data
  resetMockData() {
    this.data.users.clear();
    this.data.tenants.clear();
    this.data.conversations.clear();
    this.data.messages.clear();
    this.data.conversationParticipants.clear();
  }

  // Seed mock data
  seedMockData() {
    const tenant = TestDataFactory.createTenant();
    const user = TestDataFactory.createUser(tenant.id);
    const conversation = TestDataFactory.createConversation(tenant.id);
    const message = TestDataFactory.createMessage(conversation.id, user.id, tenant.id);

    this.data.tenants.set(tenant.id, tenant);
    this.data.users.set(user.id, user);
    this.data.conversations.set(conversation.id, conversation);
    this.data.messages.set(message.id, message);

    return { tenant, user, conversation, message };
  }
}

export const createMockPrismaService = () => new MockPrismaService();
