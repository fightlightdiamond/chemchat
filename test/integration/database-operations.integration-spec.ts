/**
 * Database Operations Integration Tests
 *
 * These tests validate that database operations work correctly in CI environment:
 * - migrate:reset script functionality
 * - db:seed script execution and data population
 * - proper environment variables configuration
 * - database connectivity and schema integrity
 */

import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';
import { DatabaseValidator } from '../../scripts/validate-database-operations';

describe('Database Operations Integration Tests', () => {
  let prisma: PrismaClient;
  let validator: DatabaseValidator;

  beforeAll(async () => {
    prisma = new PrismaClient();
    validator = new DatabaseValidator();

    // Ensure we're in test environment
    expect(process.env.NODE_ENV).toBe('test');
    expect(process.env.DATABASE_URL).toBeDefined();
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await validator.cleanup();
  });

  describe('Environment Configuration', () => {
    it('should have all required environment variables set', () => {
      const requiredVars = ['DATABASE_URL', 'NODE_ENV'];

      for (const envVar of requiredVars) {
        expect(process.env[envVar]).toBeDefined();
        expect(process.env[envVar]).not.toBe('');
      }
    });

    it('should be configured for test environment', () => {
      expect(process.env.NODE_ENV).toBe('test');
      expect(process.env.DATABASE_URL).toContain('test');
    });
  });

  describe('Database Connectivity', () => {
    it('should connect to database successfully', async () => {
      await expect(prisma.$connect()).resolves.not.toThrow();
    });

    it('should execute basic queries', async () => {
      const result = await prisma.$queryRaw`SELECT 1 as test`;
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should have proper database permissions', async () => {
      // Test that we can create and drop a test table
      await expect(
        prisma.$executeRaw`CREATE TABLE IF NOT EXISTS test_permissions (id SERIAL PRIMARY KEY)`,
      ).resolves.not.toThrow();

      await expect(
        prisma.$executeRaw`DROP TABLE IF EXISTS test_permissions`,
      ).resolves.not.toThrow();
    });
  });

  describe('migrate:reset Script', () => {
    it('should execute migrate:reset script successfully', () => {
      expect(() => {
        execSync('npm run migrate:reset', {
          stdio: 'pipe',
          env: { ...process.env },
        });
      }).not.toThrow();
    });

    it('should create all required database tables', async () => {
      // Execute migrate:reset to ensure clean state
      execSync('npm run migrate:reset', {
        stdio: 'pipe',
        env: { ...process.env },
      });

      const tables = (await prisma.$queryRaw`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
      `) as Array<{ table_name: string }>;

      const tableNames = tables.map((t) => t.table_name);

      // Check for essential tables
      const expectedTables = [
        'users',
        'conversations',
        'messages',
        'conversation_members',
        'tenants',
        'conversation_state',
      ];

      for (const expectedTable of expectedTables) {
        expect(tableNames).toContain(expectedTable);
      }
    });

    it('should create proper database schema with constraints', async () => {
      // Check that foreign key constraints exist
      const constraints = (await prisma.$queryRaw`
        SELECT 
          tc.constraint_name,
          tc.table_name,
          kcu.column_name,
          ccu.table_name AS foreign_table_name,
          ccu.column_name AS foreign_column_name
        FROM information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
      `) as Array<any>;

      expect(constraints.length).toBeGreaterThan(0);

      // Verify some key relationships exist
      const constraintNames = constraints.map(
        (c) =>
          `${c.table_name}.${c.column_name} -> ${c.foreign_table_name}.${c.foreign_column_name}`,
      );
      expect(
        constraintNames.some(
          (c) => c.includes('messages') && c.includes('conversations'),
        ),
      ).toBe(true);
      expect(
        constraintNames.some(
          (c) => c.includes('conversation_members') && c.includes('users'),
        ),
      ).toBe(true);
    });
  });

  describe('db:seed Script', () => {
    beforeEach(async () => {
      // Reset database before each test
      execSync('npm run migrate:reset', {
        stdio: 'pipe',
        env: { ...process.env },
      });
    });

    it('should execute db:seed script successfully', () => {
      expect(() => {
        execSync('npm run db:seed', {
          stdio: 'pipe',
          env: { ...process.env },
        });
      }).not.toThrow();
    });

    it('should create test tenant data', async () => {
      execSync('npm run db:seed', {
        stdio: 'pipe',
        env: { ...process.env },
      });

      const tenant = await prisma.tenant.findFirst({
        where: { name: 'Development Tenant' },
      });

      expect(tenant).toBeDefined();
      expect(tenant?.name).toBe('Development Tenant');
      expect(tenant?.isActive).toBe(true);
    });

    it('should create test user data', async () => {
      execSync('npm run db:seed', {
        stdio: 'pipe',
        env: { ...process.env },
      });

      const users = await prisma.user.findMany({
        where: { username: { in: ['alice', 'bob'] } },
      });

      expect(users).toHaveLength(2);
      expect(users.map((u) => u.username).sort()).toEqual(['alice', 'bob']);

      // Verify users have proper data
      for (const user of users) {
        expect(user.displayName).toBeDefined();
        expect(user.email).toBeDefined();
        expect(user.passwordHash).toBeDefined();
        expect(user.email).toContain('@example.com');
      }
    });

    it('should create test conversation data', async () => {
      execSync('npm run db:seed', {
        stdio: 'pipe',
        env: { ...process.env },
      });

      const conversation = await prisma.conversation.findFirst({
        where: { name: 'Alice & Bob Chat' },
        include: {
          members: {
            include: {
              user: true,
            },
          },
        },
      });

      expect(conversation).toBeDefined();
      expect(conversation?.name).toBe('Alice & Bob Chat');
      expect(conversation?.members).toHaveLength(2);

      const memberUsernames = conversation?.members
        .map((m) => m.user.username)
        .sort();
      expect(memberUsernames).toEqual(['alice', 'bob']);
    });

    it('should create test message data', async () => {
      execSync('npm run db:seed', {
        stdio: 'pipe',
        env: { ...process.env },
      });

      const messages = await prisma.message.findMany({
        include: {
          sender: true,
          conversation: true,
        },
      });

      expect(messages.length).toBeGreaterThan(0);

      // Verify messages have proper structure
      for (const message of messages) {
        expect(message.content).toBeDefined();
        expect(message.sender).toBeDefined();
        expect(message.conversation).toBeDefined();
        expect(message.sequenceNumber).toBeDefined();
        expect(typeof message.sequenceNumber).toBe('bigint');
      }
    });

    it('should be idempotent (can run multiple times)', async () => {
      // Run seed script twice
      execSync('npm run db:seed', {
        stdio: 'pipe',
        env: { ...process.env },
      });

      const firstRunCounts = {
        tenants: await prisma.tenant.count(),
        users: await prisma.user.count(),
        conversations: await prisma.conversation.count(),
        messages: await prisma.message.count(),
      };

      execSync('npm run db:seed', {
        stdio: 'pipe',
        env: { ...process.env },
      });

      const secondRunCounts = {
        tenants: await prisma.tenant.count(),
        users: await prisma.user.count(),
        conversations: await prisma.conversation.count(),
        messages: await prisma.message.count(),
      };

      // Counts should be the same (idempotent)
      expect(secondRunCounts).toEqual(firstRunCounts);
    });
  });

  describe('Data Integrity', () => {
    beforeEach(async () => {
      execSync('npm run migrate:reset', {
        stdio: 'pipe',
        env: { ...process.env },
      });
      execSync('npm run db:seed', {
        stdio: 'pipe',
        env: { ...process.env },
      });
    });

    it('should maintain referential integrity', async () => {
      const conversationWithRelations = await prisma.conversation.findFirst({
        include: {
          members: {
            include: {
              user: true,
            },
          },
          messages: {
            include: {
              sender: true,
            },
          },
          owner: true,
        },
      });

      expect(conversationWithRelations).toBeDefined();

      // All members should have valid users
      for (const member of conversationWithRelations!.members) {
        expect(member.user).toBeDefined();
        expect(member.user.id).toBeDefined();
      }

      // All messages should have valid senders
      for (const message of conversationWithRelations!.messages) {
        expect(message.sender).toBeDefined();
        expect(message.sender!.id).toBeDefined();
      }

      // Owner should be valid
      expect(conversationWithRelations!.owner).toBeDefined();
    });

    it('should have proper sequence numbers', async () => {
      const messages = await prisma.message.findMany({
        orderBy: { sequenceNumber: 'asc' },
      });

      expect(messages.length).toBeGreaterThan(0);

      // Sequence numbers should start from 1 and be consecutive
      for (let i = 0; i < messages.length; i++) {
        expect(Number(messages[i].sequenceNumber)).toBe(i + 1);
      }
    });

    it('should have conversation state properly set', async () => {
      const conversationState = await prisma.conversationState.findFirst();
      const messageCount = await prisma.message.count();

      expect(conversationState).toBeDefined();
      expect(Number(conversationState!.lastSeq)).toBe(messageCount);
    });
  });

  describe('Database Performance', () => {
    beforeEach(async () => {
      execSync('npm run migrate:reset', {
        stdio: 'pipe',
        env: { ...process.env },
      });
      execSync('npm run db:seed', {
        stdio: 'pipe',
        env: { ...process.env },
      });
    });

    it('should execute queries within reasonable time', async () => {
      const startTime = Date.now();

      await prisma.user.findMany({
        include: {
          conversationMembers: {
            include: {
              conversation: {
                include: {
                  messages: true,
                },
              },
            },
          },
        },
      });

      const queryTime = Date.now() - startTime;

      // Should complete within 1 second for test data
      expect(queryTime).toBeLessThan(1000);
    });

    it('should handle concurrent operations', async () => {
      const promises = Array.from({ length: 5 }, (_, i) =>
        prisma.user.findMany({
          where: {
            username: { contains: 'a' },
          },
        }),
      );

      await expect(Promise.all(promises)).resolves.not.toThrow();
    });
  });

  describe('Comprehensive Validation', () => {
    beforeEach(async () => {
      execSync('npm run migrate:reset', {
        stdio: 'pipe',
        env: { ...process.env },
      });
      execSync('npm run db:seed', {
        stdio: 'pipe',
        env: { ...process.env },
      });
    });

    it('should pass all validation checks', async () => {
      // This test runs the comprehensive validator
      await expect(
        validator.validateEnvironmentVariables(),
      ).resolves.not.toThrow();
      await expect(
        validator.validateDatabaseConnection(),
      ).resolves.not.toThrow();
      await expect(validator.validateDataIntegrity()).resolves.not.toThrow();
      await expect(
        validator.validateDatabasePerformance(),
      ).resolves.not.toThrow();
    });
  });
});
