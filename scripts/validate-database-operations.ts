#!/usr/bin/env ts-node

/**
 * Database Operations Validation Script
 *
 * This script validates that database operations work correctly in CI environment:
 * 1. Tests migrate:reset script functionality
 * 2. Verifies db:seed script execution and data population
 * 3. Ensures proper environment variables are set
 * 4. Validates database connectivity and schema integrity
 */

import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';
import * as process from 'process';

interface ValidationResult {
  step: string;
  success: boolean;
  message: string;
  details?: any;
}

class DatabaseValidator {
  private prisma: PrismaClient;
  private results: ValidationResult[] = [];

  constructor() {
    this.prisma = new PrismaClient();
  }

  private log(step: string, success: boolean, message: string, details?: any) {
    const result: ValidationResult = { step, success, message, details };
    this.results.push(result);

    const status = success ? '✅' : '❌';
    console.log(`${status} ${step}: ${message}`);
    if (details && !success) {
      console.log(`   Details: ${JSON.stringify(details, null, 2)}`);
    }
  }

  async validateEnvironmentVariables(): Promise<void> {
    console.log('\n🔍 Validating Environment Variables...');

    const requiredEnvVars = ['DATABASE_URL', 'NODE_ENV'];

    const optionalEnvVars = ['REDIS_HOST', 'REDIS_PORT', 'ELASTICSEARCH_NODE'];

    // Check required environment variables
    for (const envVar of requiredEnvVars) {
      const value = process.env[envVar];
      if (!value) {
        this.log(
          'Environment Variables',
          false,
          `Required environment variable ${envVar} is not set`,
        );
        return;
      }
    }

    // Log optional environment variables
    for (const envVar of optionalEnvVars) {
      const value = process.env[envVar];
      if (value) {
        console.log(`   ${envVar}: ${value}`);
      }
    }

    this.log(
      'Environment Variables',
      true,
      'All required environment variables are properly set',
      {
        DATABASE_URL: process.env.DATABASE_URL?.replace(/:[^:@]*@/, ':***@'), // Hide password
        NODE_ENV: process.env.NODE_ENV,
      },
    );
  }

  async validateDatabaseConnection(): Promise<void> {
    console.log('\n🔗 Validating Database Connection...');

    try {
      await this.prisma.$connect();

      // Test basic query
      const result = await this.prisma.$queryRaw`SELECT 1 as test`;

      this.log(
        'Database Connection',
        true,
        'Successfully connected to database and executed test query',
        { testResult: result },
      );
    } catch (error) {
      this.log('Database Connection', false, 'Failed to connect to database', {
        error: error.message,
      });
      throw error;
    }
  }

  async validateMigrateResetScript(): Promise<void> {
    console.log('\n🔄 Validating migrate:reset Script...');

    try {
      // Execute migrate:reset script
      const output = execSync('npm run migrate:reset', {
        encoding: 'utf8',
        stdio: 'pipe',
        env: { ...process.env },
      });

      // Verify database schema exists after reset
      const tables = (await this.prisma.$queryRaw`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
      `) as Array<{ table_name: string }>;

      const expectedTables = [
        'users',
        'conversations',
        'messages',
        'conversation_members',
        'tenants',
      ];

      const tableNames = tables.map((t) => t.table_name);
      const missingTables = expectedTables.filter(
        (table) => !tableNames.includes(table),
      );

      if (missingTables.length > 0) {
        this.log(
          'Migrate Reset',
          false,
          'Database schema is incomplete after migration reset',
          { missingTables, foundTables: tableNames },
        );
        return;
      }

      this.log(
        'Migrate Reset',
        true,
        'migrate:reset script executed successfully and database schema is complete',
        {
          tablesFound: tableNames.length,
          sampleTables: tableNames.slice(0, 5),
        },
      );
    } catch (error) {
      this.log(
        'Migrate Reset',
        false,
        'migrate:reset script failed to execute',
        { error: error.message },
      );
      throw error;
    }
  }

  async validateDbSeedScript(): Promise<void> {
    console.log('\n🌱 Validating db:seed Script...');

    try {
      // Execute db:seed script
      const output = execSync('npm run db:seed', {
        encoding: 'utf8',
        stdio: 'pipe',
        env: { ...process.env },
      });

      // Verify seed data was created
      const tenantCount = await this.prisma.tenant.count();
      const userCount = await this.prisma.user.count();
      const conversationCount = await this.prisma.conversation.count();
      const messageCount = await this.prisma.message.count();

      if (
        tenantCount === 0 ||
        userCount === 0 ||
        conversationCount === 0 ||
        messageCount === 0
      ) {
        this.log(
          'Database Seeding',
          false,
          'Seed script did not create expected test data',
          {
            tenants: tenantCount,
            users: userCount,
            conversations: conversationCount,
            messages: messageCount,
          },
        );
        return;
      }

      // Verify specific test data
      const testTenant = await this.prisma.tenant.findFirst({
        where: { name: 'Development Tenant' },
      });

      const testUsers = await this.prisma.user.findMany({
        where: { username: { in: ['alice', 'bob'] } },
      });

      if (!testTenant || testUsers.length !== 2) {
        this.log(
          'Database Seeding',
          false,
          'Expected test data not found after seeding',
          {
            tenantFound: !!testTenant,
            usersFound: testUsers.length,
            expectedUsers: 2,
          },
        );
        return;
      }

      this.log(
        'Database Seeding',
        true,
        'db:seed script executed successfully and populated test data',
        {
          tenants: tenantCount,
          users: userCount,
          conversations: conversationCount,
          messages: messageCount,
          testTenant: testTenant.name,
          testUsers: testUsers.map((u) => u.username),
        },
      );
    } catch (error) {
      this.log('Database Seeding', false, 'db:seed script failed to execute', {
        error: error.message,
      });
      throw error;
    }
  }

  async validateDataIntegrity(): Promise<void> {
    console.log('\n🔍 Validating Data Integrity...');

    try {
      // Test foreign key relationships
      const conversationWithMembers = await this.prisma.conversation.findFirst({
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
        },
      });

      if (!conversationWithMembers) {
        this.log(
          'Data Integrity',
          false,
          'No conversation found for integrity testing',
        );
        return;
      }

      // Verify relationships are properly established
      const hasMembers = conversationWithMembers.members.length > 0;
      const hasMessages = conversationWithMembers.messages.length > 0;
      const membersHaveUsers = conversationWithMembers.members.every(
        (m) => m.user !== null,
      );
      const messagesHaveSenders = conversationWithMembers.messages.every(
        (m) => m.sender !== null,
      );

      if (
        !hasMembers ||
        !hasMessages ||
        !membersHaveUsers ||
        !messagesHaveSenders
      ) {
        this.log(
          'Data Integrity',
          false,
          'Data integrity issues found in relationships',
          {
            hasMembers,
            hasMessages,
            membersHaveUsers,
            messagesHaveSenders,
          },
        );
        return;
      }

      this.log(
        'Data Integrity',
        true,
        'All data relationships are properly established',
        {
          conversationId: conversationWithMembers.id,
          memberCount: conversationWithMembers.members.length,
          messageCount: conversationWithMembers.messages.length,
        },
      );
    } catch (error) {
      this.log('Data Integrity', false, 'Failed to validate data integrity', {
        error: error.message,
      });
      throw error;
    }
  }

  async validateDatabasePerformance(): Promise<void> {
    console.log('\n⚡ Validating Database Performance...');

    try {
      const startTime = Date.now();

      // Test query performance
      const users = await this.prisma.user.findMany({
        include: {
          conversationMembers: {
            include: {
              conversation: true,
            },
          },
        },
      });

      const queryTime = Date.now() - startTime;

      // Performance should be reasonable (under 1 second for test data)
      const performanceThreshold = 1000; // 1 second
      const isPerformant = queryTime < performanceThreshold;

      this.log(
        'Database Performance',
        isPerformant,
        `Query execution time: ${queryTime}ms`,
        {
          queryTime,
          threshold: performanceThreshold,
          recordsReturned: users.length,
        },
      );
    } catch (error) {
      this.log(
        'Database Performance',
        false,
        'Failed to validate database performance',
        { error: error.message },
      );
    }
  }

  async cleanup(): Promise<void> {
    try {
      await this.prisma.$disconnect();
    } catch (error) {
      console.log('Warning: Error during cleanup:', error.message);
    }
  }

  printSummary(): void {
    console.log('\n📊 Validation Summary');
    console.log(
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    );

    const totalTests = this.results.length;
    const passedTests = this.results.filter((r) => r.success).length;
    const failedTests = totalTests - passedTests;

    console.log(`Total Tests: ${totalTests}`);
    console.log(`Passed: ${passedTests} ✅`);
    console.log(`Failed: ${failedTests} ❌`);
    console.log(
      `Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`,
    );

    if (failedTests > 0) {
      console.log('\n❌ Failed Tests:');
      this.results
        .filter((r) => !r.success)
        .forEach((r) => console.log(`   - ${r.step}: ${r.message}`));
    }

    console.log(
      '\n' +
        (failedTests === 0
          ? '🎉 All database operations validated successfully!'
          : '⚠️  Some validations failed. Check the logs above.'),
    );
  }

  async runAllValidations(): Promise<boolean> {
    console.log('🚀 Starting Database Operations Validation');
    console.log(
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    );

    try {
      await this.validateEnvironmentVariables();
      await this.validateDatabaseConnection();
      await this.validateMigrateResetScript();
      await this.validateDbSeedScript();
      await this.validateDataIntegrity();
      await this.validateDatabasePerformance();
    } catch (error) {
      console.error('\n💥 Validation failed with error:', error.message);
    } finally {
      await this.cleanup();
    }

    this.printSummary();

    const allPassed = this.results.every((r) => r.success);
    process.exit(allPassed ? 0 : 1);
  }
}

// Run validation if this script is executed directly
if (require.main === module) {
  const validator = new DatabaseValidator();
  validator.runAllValidations().catch((error) => {
    console.error('Unexpected error:', error);
    process.exit(1);
  });
}

export { DatabaseValidator };
