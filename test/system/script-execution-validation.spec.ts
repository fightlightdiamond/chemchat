/**
 * Script Execution Validation Tests
 *
 * This test suite validates that all package.json scripts can be executed successfully
 * in a CI-like environment. These tests actually run the scripts to ensure they work.
 *
 * Requirements: 1.1, 2.1, 6.1
 */

import { execSync, spawn } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('Script Execution Validation', () => {
  let packageJson: any;

  beforeAll(() => {
    const packageJsonPath = join(process.cwd(), 'package.json');
    packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  });

  describe('Build and Compilation Scripts', () => {
    it('should execute lint script successfully', async () => {
      expect(() => {
        execSync('pnpm run lint', {
          stdio: 'pipe',
          timeout: 60000,
          env: { ...process.env, NODE_ENV: 'test' },
        });
      }).not.toThrow();
    }, 60000);

    it('should execute build script successfully', async () => {
      expect(() => {
        execSync('pnpm run build', {
          stdio: 'pipe',
          timeout: 120000,
          env: { ...process.env, NODE_ENV: 'test' },
        });
      }).not.toThrow();
    }, 120000);

    it('should execute prisma generate successfully', async () => {
      expect(() => {
        execSync('pnpm run prisma:generate', {
          stdio: 'pipe',
          timeout: 60000,
          env: { ...process.env, NODE_ENV: 'test' },
        });
      }).not.toThrow();
    }, 60000);
  });

  describe('Database Scripts Execution', () => {
    const testDatabaseUrl =
      process.env.DATABASE_URL ||
      'postgresql://test:test@localhost:5432/chemchat_test_validation';

    beforeAll(() => {
      // Set test environment variables
      process.env.DATABASE_URL = testDatabaseUrl;
      process.env.NODE_ENV = 'test';
    });

    it('should validate database script files exist and are executable', () => {
      const dbScripts = [
        'scripts/basic-seed.ts',
        'scripts/validate-database-operations.ts',
        'scripts/ci-database-test.sh',
      ];

      for (const script of dbScripts) {
        expect(() => {
          readFileSync(join(process.cwd(), script), 'utf8');
        }).not.toThrow();
      }
    });

    it('should execute db:validate script successfully', async () => {
      expect(() => {
        execSync('pnpm run db:validate', {
          stdio: 'pipe',
          timeout: 30000,
          env: {
            ...process.env,
            DATABASE_URL: testDatabaseUrl,
            NODE_ENV: 'test',
          },
        });
      }).not.toThrow();
    }, 30000);

    // Note: migrate:reset and db:seed require actual database connection
    // These are tested in integration tests with testcontainers
    it('should have proper migrate:reset script configuration', () => {
      expect(packageJson.scripts['migrate:reset']).toBe(
        'prisma migrate reset --force',
      );
    });

    it('should have proper db:seed script configuration', () => {
      expect(packageJson.scripts['db:seed']).toBe(
        'ts-node scripts/basic-seed.ts',
      );
    });
  });

  describe('Test Scripts Validation', () => {
    it('should have all test scripts properly configured', () => {
      const testScripts = {
        'test:unit': 'jest --testPathPatterns=src/.*\\.spec\\.ts$',
        'test:integration': 'jest --config ./test/jest-integration.json',
        'test:e2e': 'jest --config ./test/jest-e2e.json',
      };

      for (const [scriptName, expectedCommand] of Object.entries(testScripts)) {
        expect(packageJson.scripts[scriptName]).toBe(expectedCommand);
      }
    });

    it('should execute test:unit script successfully', async () => {
      expect(() => {
        execSync('pnpm run test:unit -- --passWithNoTests', {
          stdio: 'pipe',
          timeout: 60000,
          env: { ...process.env, NODE_ENV: 'test' },
        });
      }).not.toThrow();
    }, 60000);

    // Note: Integration and E2E tests require database and services
    // These are validated in the actual CI environment
  });

  describe('Development Scripts Validation', () => {
    it('should have proper development scripts configured', () => {
      const devScripts = ['start', 'start:dev', 'start:debug', 'start:prod'];

      for (const script of devScripts) {
        expect(packageJson.scripts).toHaveProperty(script);
        expect(packageJson.scripts[script]).toBeTruthy();
      }
    });

    it('should have proper docker scripts configured', () => {
      const dockerScripts = ['docker:build', 'docker:up', 'docker:down'];

      for (const script of dockerScripts) {
        expect(packageJson.scripts).toHaveProperty(script);
        expect(packageJson.scripts[script]).toBeTruthy();
      }
    });
  });

  describe('CI-specific Script Validation', () => {
    it('should execute format script successfully', async () => {
      expect(() => {
        execSync('pnpm run format', {
          stdio: 'pipe',
          timeout: 60000,
          env: { ...process.env, NODE_ENV: 'test' },
        });
      }).not.toThrow();
    }, 60000);

    it('should have test:ci script properly configured', () => {
      expect(packageJson.scripts['test:ci']).toContain('--ci');
      expect(packageJson.scripts['test:ci']).toContain('--coverage');
      expect(packageJson.scripts['test:ci']).toContain('--watchAll=false');
    });

    it('should have proper swagger generation scripts', () => {
      const swaggerScripts = ['swagger', 'swagger:mock'];

      for (const script of swaggerScripts) {
        expect(packageJson.scripts).toHaveProperty(script);
        expect(packageJson.scripts[script]).toContain('ts-node scripts/');
      }
    });
  });

  describe('Performance Testing Scripts', () => {
    it('should have k6 load testing script configured', () => {
      expect(packageJson.scripts['test:load']).toBe(
        'k6 run test/load/load-test.js',
      );
    });

    it('should validate load test files exist', () => {
      const loadTestFiles = [
        'test/load/load-test.js',
        'test/load/simple-load-test.js',
      ];

      for (const file of loadTestFiles) {
        expect(() => {
          readFileSync(join(process.cwd(), file), 'utf8');
        }).not.toThrow();
      }
    });
  });

  describe('Script Dependencies Validation', () => {
    it('should have all required dependencies for scripts', () => {
      const requiredDeps = [
        '@nestjs/cli',
        'ts-node',
        'typescript',
        'jest',
        'prettier',
        'eslint',
        'prisma',
      ];

      for (const dep of requiredDeps) {
        expect(
          packageJson.dependencies[dep] || packageJson.devDependencies[dep],
        ).toBeDefined();
      }
    });

    it('should have proper Node.js and pnpm engine requirements', () => {
      expect(packageJson.engines.node).toBe('>=20.0.0');
      expect(packageJson.engines.pnpm).toBe('>=8.0.0');
    });
  });

  describe('Environment Variable Validation', () => {
    it('should handle missing environment variables gracefully', () => {
      // Test that scripts don't crash when optional env vars are missing
      const originalEnv = process.env.NODE_ENV;
      delete process.env.NODE_ENV;

      expect(() => {
        execSync('pnpm run lint', {
          stdio: 'pipe',
          timeout: 30000,
        });
      }).not.toThrow();

      process.env.NODE_ENV = originalEnv;
    });

    it('should validate required environment variables for database scripts', () => {
      const dbValidationScript = readFileSync(
        join(process.cwd(), 'scripts/validate-database-operations.ts'),
        'utf8',
      );

      expect(dbValidationScript).toContain('DATABASE_URL');
      expect(dbValidationScript).toContain('NODE_ENV');
    });
  });

  describe('Script Error Handling', () => {
    it('should have proper error handling in TypeScript scripts', () => {
      const tsScripts = [
        'scripts/basic-seed.ts',
        'scripts/validate-database-operations.ts',
      ];

      for (const script of tsScripts) {
        const content = readFileSync(join(process.cwd(), script), 'utf8');
        expect(content).toContain('catch');
        expect(content).toContain('error');
        expect(content).toContain('process.exit');
      }
    });

    it('should have proper error handling in shell scripts', () => {
      const shellScript = readFileSync(
        join(process.cwd(), 'scripts/ci-database-test.sh'),
        'utf8',
      );

      expect(shellScript).toContain('set -e');
      expect(shellScript).toContain('exit 1');
    });
  });
});
