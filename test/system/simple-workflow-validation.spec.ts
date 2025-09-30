/**
 * Simple Workflow Validation Tests
 *
 * Đơn giản, tập trung vào những gì cần thiết để chạy trong Docker
 * Requirements: 1.1, 2.1, 6.1
 */

import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import * as yaml from 'js-yaml';

describe('Simple Workflow Validation', () => {
  let packageJson: any;
  let ciWorkflow: any;

  beforeAll(() => {
    const packageJsonPath = join(process.cwd(), 'package.json');
    packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));

    const ciWorkflowPath = join(process.cwd(), '.github/workflows/ci.yml');
    ciWorkflow = yaml.load(readFileSync(ciWorkflowPath, 'utf8'));
  });

  describe('Essential Script Validation', () => {
    // Chỉ test những script quan trọng nhất
    const essentialScripts = ['lint', 'build', 'migrate:reset', 'db:seed'];

    test.each(essentialScripts)('should have %s script', (scriptName) => {
      expect(packageJson.scripts).toHaveProperty(scriptName);
      expect(packageJson.scripts[scriptName]).toBeTruthy();
    });

    it('should execute lint successfully', () => {
      expect(() => {
        execSync('npm run lint', { stdio: 'pipe', timeout: 60000 });
      }).not.toThrow();
    });

    it('should execute build successfully', () => {
      expect(() => {
        execSync('npm run build', { stdio: 'pipe', timeout: 120000 });
      }).not.toThrow();
    });
  });

  describe('Node Version Consistency', () => {
    it('should use Node 20 consistently', () => {
      // Package.json
      expect(packageJson.engines.node).toBe('>=20.0.0');

      // CI workflow
      expect(ciWorkflow.env.NODE_VERSION).toBe('20');

      // Dockerfile
      const dockerfile = readFileSync(
        join(process.cwd(), 'Dockerfile'),
        'utf8',
      );
      expect(dockerfile).toContain('FROM node:20-alpine');
    });

    it('should use npm consistently', () => {
      expect(existsSync(join(process.cwd(), 'package-lock.json'))).toBe(true);
      expect(existsSync(join(process.cwd(), 'yarn.lock'))).toBe(false);
    });
  });

  describe('CI Workflow Structure', () => {
    it('should have required jobs', () => {
      expect(ciWorkflow.jobs).toHaveProperty('test');
      expect(ciWorkflow.jobs).toHaveProperty('security');
      expect(ciWorkflow.jobs).toHaveProperty('build');
    });

    it('should have correct services', () => {
      const services = ciWorkflow.jobs.test.services;
      expect(services.postgres.image).toBe('postgres:15-alpine');
      expect(services.redis.image).toBe('redis:7-alpine');
      expect(services.elasticsearch.image).toBe('elasticsearch:8.11.0');
    });

    it('should have proper environment variables', () => {
      const testJob = ciWorkflow.jobs.test;
      const setupDbStep = testJob.steps.find(
        (step: any) => step.name === 'Setup test database',
      );

      expect(setupDbStep.env.DATABASE_URL).toContain('postgresql://');
      expect(setupDbStep.env.NODE_ENV).toBe('test');
    });
  });

  describe('Docker Configuration', () => {
    it('should have proper docker-compose setup', () => {
      expect(existsSync(join(process.cwd(), 'docker-compose.yml'))).toBe(true);
      expect(existsSync(join(process.cwd(), 'Dockerfile'))).toBe(true);
    });

    it('should have docker scripts', () => {
      expect(packageJson.scripts['docker:build']).toBe('docker-compose build');
      expect(packageJson.scripts['docker:up']).toBe('docker-compose up -d');
      expect(packageJson.scripts['docker:down']).toBe('docker-compose down');
    });
  });

  describe('Required Files Exist', () => {
    const requiredFiles = [
      'scripts/basic-seed.ts',
      'scripts/validate-database-operations.ts',
      'test/jest-e2e.json',
      'test/jest-integration.json',
      'prisma/schema.prisma',
    ];

    test.each(requiredFiles)('should have %s', (filePath) => {
      expect(existsSync(join(process.cwd(), filePath))).toBe(true);
    });
  });
});
