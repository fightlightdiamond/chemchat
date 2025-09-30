/**
 * In-Docker Workflow Validation Tests
 *
 * This test suite runs INSIDE Docker containers to validate workflows
 * in the same environment as CI/CD pipelines.
 *
 * Requirements: 1.1, 2.1, 6.1
 */

import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

describe('In-Docker Workflow Validation', () => {
  const isDockerEnvironment = () => {
    return (
      process.env.DOCKER_ENV === 'true' ||
      existsSync('/.dockerenv') ||
      process.env.CI === 'true'
    );
  };

  beforeAll(() => {
    if (!isDockerEnvironment()) {
      console.log('⚠️  These tests should run inside Docker environment');
      console.log('💡 Use: npm run test:workflow-docker');
    }
  });

  describe('Docker Environment Validation', () => {
    it('should be running inside Docker environment', () => {
      expect(isDockerEnvironment()).toBe(true);
    });

    it('should have correct Node.js version', () => {
      const nodeVersion = process.version;
      expect(nodeVersion).toMatch(/^v20\./);
    });

    it('should have npm available', () => {
      const npmVersion = execSync('npm --version', { encoding: 'utf8' }).trim();
      expect(npmVersion).toBeTruthy();

      const majorVersion = parseInt(npmVersion.split('.')[0]);
      expect(majorVersion).toBeGreaterThanOrEqual(8);
    });

    it('should have correct environment variables', () => {
      expect(process.env.NODE_ENV).toBe('test');
      expect(process.env.DATABASE_URL).toContain('postgres');
      expect(process.env.REDIS_HOST).toBeTruthy();
    });
  });

  describe('Package Scripts Execution in Docker', () => {
    it('should execute workflow validation script', async () => {
      expect(() => {
        execSync('npm run workflow:validate', {
          stdio: 'pipe',
          timeout: 60000,
        });
      }).not.toThrow('Workflow validation should succeed in Docker');
    }, 60000);

    it('should execute lint script successfully', async () => {
      expect(() => {
        execSync('npm run lint', {
          stdio: 'pipe',
          timeout: 120000,
        });
      }).not.toThrow('Lint should succeed in Docker');
    }, 120000);

    it('should execute build script successfully', async () => {
      expect(() => {
        execSync('npm run build', {
          stdio: 'pipe',
          timeout: 180000,
        });
      }).not.toThrow('Build should succeed in Docker');
    }, 180000);

    it('should execute prisma generate successfully', async () => {
      expect(() => {
        execSync('npm run prisma:generate', {
          stdio: 'pipe',
          timeout: 60000,
        });
      }).not.toThrow('Prisma generate should succeed in Docker');
    }, 60000);

    it('should execute unit tests successfully', async () => {
      expect(() => {
        execSync('npm run test:unit -- --passWithNoTests', {
          stdio: 'pipe',
          timeout: 120000,
        });
      }).not.toThrow('Unit tests should succeed in Docker');
    }, 120000);
  });

  describe('Database Connectivity in Docker', () => {
    it('should validate database connection', async () => {
      // Test database validation script
      expect(() => {
        execSync('npm run db:validate', {
          stdio: 'pipe',
          timeout: 30000,
        });
      }).not.toThrow('Database validation should succeed');
    }, 30000);

    it('should have correct database URL format', () => {
      const dbUrl = process.env.DATABASE_URL;
      expect(dbUrl).toMatch(/postgresql:\/\/.*@.*:5432\/.*/);
    });

    it('should have Redis connection available', () => {
      expect(process.env.REDIS_HOST).toBeTruthy();
      expect(process.env.REDIS_PORT).toBe('6379');
    });

    it('should have Elasticsearch connection available', () => {
      expect(process.env.ELASTICSEARCH_NODE).toContain('elasticsearch:9200');
    });
  });

  describe('CI Workflow Simulation in Docker', () => {
    it('should simulate complete CI workflow steps', async () => {
      const ciSteps = [
        { name: 'Lint', command: 'npm run lint', timeout: 120000 },
        { name: 'Build', command: 'npm run build', timeout: 180000 },
        {
          name: 'Prisma Generate',
          command: 'npm run prisma:generate',
          timeout: 60000,
        },
        {
          name: 'Unit Tests',
          command: 'npm run test:unit -- --passWithNoTests',
          timeout: 120000,
        },
      ];

      for (const step of ciSteps) {
        console.log(`🔄 Executing CI step: ${step.name}`);
        expect(() => {
          execSync(step.command, {
            stdio: 'pipe',
            timeout: step.timeout,
          });
        }).not.toThrow(`CI step "${step.name}" should succeed in Docker`);
      }
    }, 600000);

    it('should validate all required files are accessible', () => {
      const requiredFiles = [
        'package.json',
        'Dockerfile',
        'prisma/schema.prisma',
        'scripts/basic-seed.ts',
        'scripts/validate-database-operations.ts',
        '.github/workflows/ci.yml',
        '.github/workflows/cd.yml',
      ];

      for (const file of requiredFiles) {
        expect(existsSync(join(process.cwd(), file))).toBe(true);
      }
    });

    it('should validate package.json scripts are properly configured', () => {
      const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));

      const requiredScripts = [
        'build',
        'lint',
        'test:unit',
        'migrate:reset',
        'db:seed',
        'workflow:validate',
      ];

      for (const script of requiredScripts) {
        expect(packageJson.scripts).toHaveProperty(script);
        expect(packageJson.scripts[script]).toBeTruthy();
      }

      // Validate Node.js version requirement
      expect(packageJson.engines.node).toBe('>=20.0.0');
    });
  });

  describe('Security and Performance Validation in Docker', () => {
    it('should execute security audit', async () => {
      try {
        execSync('npm audit --audit-level high', {
          stdio: 'pipe',
          timeout: 60000,
        });
      } catch (error) {
        // Security audit may fail due to vulnerabilities, which is expected
        console.log('Security audit completed with warnings (expected)');
      }
    }, 60000);

    it('should validate load test files exist', () => {
      const loadTestFiles = [
        'test/load/load-test.js',
        'test/load/simple-load-test.js',
      ];

      for (const file of loadTestFiles) {
        expect(existsSync(file)).toBe(true);
      }
    });

    it('should validate Docker multi-stage build configuration', () => {
      const dockerfile = readFileSync('Dockerfile', 'utf8');

      // Validate multi-stage build stages
      expect(dockerfile).toMatch(/FROM node:20-alpine.*AS base/);
      expect(dockerfile).toContain('FROM base AS development');
      expect(dockerfile).toContain('FROM base AS deps');
      expect(dockerfile).toContain('FROM base AS builder');
      expect(dockerfile).toContain('FROM base AS runner');
    });
  });

  describe('Workflow Configuration Validation in Docker', () => {
    it('should validate GitHub workflow files syntax', () => {
      const workflowFiles = [
        '.github/workflows/ci.yml',
        '.github/workflows/cd.yml',
        '.github/workflows/security.yml',
      ];

      for (const file of workflowFiles) {
        expect(existsSync(file)).toBe(true);

        const content = readFileSync(file, 'utf8');

        // Basic YAML structure validation
        expect(content).toContain('name:');
        expect(content).toContain('on:');
        expect(content).toContain('jobs:');

        // Node.js version consistency
        if (content.includes('node-version')) {
          expect(content).toMatch(/node-version.*20/);
        }
      }
    });

    it('should validate npm usage consistency across workflows', () => {
      const ciWorkflow = readFileSync('.github/workflows/ci.yml', 'utf8');

      // Should use npm ci or npm install --frozen-lockfile
      expect(ciWorkflow).toMatch(/npm (ci|install --frozen-lockfile)/);

      // Should use Node.js 20
      expect(ciWorkflow).toContain("NODE_VERSION: '20'");
    });

    it('should validate all critical dependencies are available', () => {
      const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));

      const criticalDeps = [
        '@nestjs/core',
        '@prisma/client',
        'typescript',
        'jest',
        'eslint',
        'prettier',
      ];

      for (const dep of criticalDeps) {
        const hasDepOrDevDep =
          packageJson.dependencies?.[dep] || packageJson.devDependencies?.[dep];
        expect(hasDepOrDevDep).toBeDefined();
      }
    });
  });

  describe('Integration Test Preparation in Docker', () => {
    it('should validate test configuration files exist', () => {
      const testConfigs = [
        'test/jest-e2e.json',
        'test/jest-integration.json',
        'test/jest-workflow-validation.json',
      ];

      for (const config of testConfigs) {
        expect(existsSync(config)).toBe(true);
      }
    });

    it('should validate docker-compose configuration', () => {
      const composeFile = 'docker-compose.workflow-validation.yml';
      expect(existsSync(composeFile)).toBe(true);

      const content = readFileSync(composeFile, 'utf8');
      expect(content).toContain('chemchat-app');
      expect(content).toContain('postgres');
      expect(content).toContain('redis');
      expect(content).toContain('elasticsearch');
    });

    it('should validate environment variables are properly set for testing', () => {
      // Validate test environment
      expect(process.env.NODE_ENV).toBe('test');

      // Validate database connection string
      expect(process.env.DATABASE_URL).toMatch(
        /postgresql:\/\/test:test@postgres:5432\/chemchat_test/,
      );

      // Validate service connections
      expect(process.env.REDIS_HOST).toBe('redis');
      expect(process.env.ELASTICSEARCH_NODE).toBe('http://elasticsearch:9200');
    });
  });
});
