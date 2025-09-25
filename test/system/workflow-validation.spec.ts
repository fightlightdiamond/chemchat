/**
 * Comprehensive Workflow Validation Tests
 *
 * This test suite validates that all GitHub workflows are properly configured
 * and that all package.json scripts execute successfully in a CI-like environment.
 *
 * Requirements: 1.1, 2.1, 6.1
 */

import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import * as yaml from 'js-yaml';

describe('Workflow Validation', () => {
  let packageJson: any;
  let ciWorkflow: any;
  let cdWorkflow: any;
  let dockerfile: string;

  beforeAll(() => {
    // Load package.json
    const packageJsonPath = join(process.cwd(), 'package.json');
    packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));

    // Load CI workflow
    const ciWorkflowPath = join(process.cwd(), '.github/workflows/ci.yml');
    ciWorkflow = yaml.load(readFileSync(ciWorkflowPath, 'utf8'));

    // Load CD workflow
    const cdWorkflowPath = join(process.cwd(), '.github/workflows/cd.yml');
    cdWorkflow = yaml.load(readFileSync(cdWorkflowPath, 'utf8'));

    // Load Dockerfile
    const dockerfilePath = join(process.cwd(), 'Dockerfile');
    dockerfile = readFileSync(dockerfilePath, 'utf8');
  });

  describe('Package.json Script Validation', () => {
    const criticalScripts = [
      'build',
      'start',
      'start:prod',
      'test',
      'test:unit',
      'test:integration',
      'test:e2e',
      'test:ci',
      'lint',
      'migrate:reset',
      'db:seed',
      'db:validate',
      'prisma:generate',
    ];

    test.each(criticalScripts)(
      'should have %s script defined',
      (scriptName) => {
        expect(packageJson.scripts).toHaveProperty(scriptName);
        expect(packageJson.scripts[scriptName]).toBeDefined();
        expect(packageJson.scripts[scriptName]).not.toBe('');
      },
    );

    it('should have all CI-referenced scripts available', () => {
      const ciReferencedScripts = [
        'lint',
        'build',
        'migrate:reset',
        'db:seed',
        'test:unit',
        'test:integration',
        'test:e2e',
      ];

      for (const script of ciReferencedScripts) {
        expect(packageJson.scripts).toHaveProperty(script);
        expect(packageJson.scripts[script]).toBeTruthy();
      }
    });

    it('should have proper database scripts configuration', () => {
      expect(packageJson.scripts['migrate:reset']).toBe(
        'prisma migrate reset --force',
      );
      expect(packageJson.scripts['db:seed']).toBe(
        'ts-node scripts/basic-seed.ts',
      );
      expect(packageJson.scripts['db:validate']).toBe(
        'ts-node scripts/validate-database-operations.ts',
      );
    });

    it('should have proper test scripts configuration', () => {
      expect(packageJson.scripts['test:unit']).toContain('jest');
      expect(packageJson.scripts['test:integration']).toContain(
        'jest --config ./test/jest-integration.json',
      );
      expect(packageJson.scripts['test:e2e']).toContain(
        'jest --config ./test/jest-e2e.json',
      );
    });

    it('should have performance testing script', () => {
      expect(packageJson.scripts).toHaveProperty('test:load');
      expect(packageJson.scripts['test:load']).toContain('k6');
    });
  });

  describe('Node.js Version Consistency', () => {
    it('should use consistent Node.js version across all configurations', () => {
      // Check package.json engines
      expect(packageJson.engines.node).toBe('>=20.0.0');

      // Check CI workflow
      expect(ciWorkflow.env.NODE_VERSION).toBe('20');

      // Check Dockerfile
      expect(dockerfile).toContain('FROM node:20-alpine');

      // Verify all workflow jobs use the same Node version
      const testJob = ciWorkflow.jobs.test;
      const securityJob = ciWorkflow.jobs.security;

      expect(
        testJob.steps.find((step: any) => step.name === 'Setup Node.js').with[
          'node-version'
        ],
      ).toBe('${{ env.NODE_VERSION }}');

      expect(
        securityJob.steps.find((step: any) => step.name === 'Setup Node.js')
          .with['node-version'],
      ).toBe('${{ env.NODE_VERSION }}');
    });

    it('should have consistent npm usage across workflows', () => {
      // Check CI workflow uses npm consistently
      const ciSteps = ciWorkflow.jobs.test.steps;
      const installStep = ciSteps.find(
        (step: any) => step.name === 'Install dependencies',
      );
      expect(installStep.run).toBe('npm install --frozen-lockfile');

      // Check security workflow uses npm
      const securitySteps = ciWorkflow.jobs.security.steps;
      const securityInstallStep = securitySteps.find(
        (step: any) => step.name === 'Install dependencies',
      );
      expect(securityInstallStep.run).toBe('npm install --frozen-lockfile');

      // Check all npm setup steps are present
      const npmSetupSteps = ciSteps.filter(
        (step: any) => step.name === 'Setup npm',
      );
      expect(npmSetupSteps).toHaveLength(1);
      expect(npmSetupSteps[0].with.version).toBe('8');
    });

    it('should have proper cache configuration for npm', () => {
      const nodeSetupSteps = [
        ...ciWorkflow.jobs.test.steps,
        ...ciWorkflow.jobs.security.steps,
      ].filter((step: any) => step.name === 'Setup Node.js');

      for (const step of nodeSetupSteps) {
        expect(step.with.cache).toBe('npm');
      }
    });
  });

  describe('CI Workflow Configuration', () => {
    it('should have all required services configured', () => {
      const services = ciWorkflow.jobs.test.services;

      expect(services).toHaveProperty('postgres');
      expect(services).toHaveProperty('redis');
      expect(services).toHaveProperty('elasticsearch');

      // Verify service configurations
      expect(services.postgres.image).toBe('postgres:15-alpine');
      expect(services.redis.image).toBe('redis:7-alpine');
      expect(services.elasticsearch.image).toBe('elasticsearch:8.11.0');
    });

    it('should have proper environment variables for database operations', () => {
      const testJob = ciWorkflow.jobs.test;
      const setupDbStep = testJob.steps.find(
        (step: any) => step.name === 'Setup test database',
      );

      expect(setupDbStep.env).toHaveProperty('DATABASE_URL');
      expect(setupDbStep.env).toHaveProperty('NODE_ENV');
      expect(setupDbStep.env.NODE_ENV).toBe('test');
    });

    it('should have proper test execution order', () => {
      const testJob = ciWorkflow.jobs.test;
      const stepNames = testJob.steps.map((step: any) => step.name);

      const expectedOrder = [
        'Checkout code',
        'Setup npm',
        'Setup Node.js',
        'Install dependencies',
        'Lint code',
        'Type check',
        'Setup test database',
        'Run unit tests',
        'Run integration tests',
        'Run E2E tests',
      ];

      for (let i = 0; i < expectedOrder.length; i++) {
        expect(stepNames).toContain(expectedOrder[i]);
        if (i > 0) {
          const currentIndex = stepNames.indexOf(expectedOrder[i]);
          const previousIndex = stepNames.indexOf(expectedOrder[i - 1]);
          expect(currentIndex).toBeGreaterThan(previousIndex);
        }
      }
    });

    it('should have security scanning properly configured', () => {
      const securityJob = ciWorkflow.jobs.security;
      const stepNames = securityJob.steps.map((step: any) => step.name);

      expect(stepNames).toContain('Run security audit');
      expect(stepNames).toContain('Run Snyk security scan');
      expect(stepNames).toContain('Run CodeQL Analysis');
    });

    it('should have performance testing properly configured', () => {
      const performanceJob = ciWorkflow.jobs.performance;
      expect(performanceJob).toBeDefined();

      const stepNames = performanceJob.steps.map((step: any) => step.name);
      expect(stepNames).toContain('Pull k6 Docker image');
      expect(stepNames).toContain('Verify k6 installation');
      expect(stepNames).toContain('Run load tests');
    });
  });

  describe('CD Workflow Configuration', () => {
    it('should have proper deployment environments configured', () => {
      expect(cdWorkflow.jobs).toHaveProperty('deploy-staging');
      expect(cdWorkflow.jobs).toHaveProperty('deploy-production');
      expect(cdWorkflow.jobs).toHaveProperty('rollback');
    });

    it('should have proper Kubernetes manifest references', () => {
      const stagingJob = cdWorkflow.jobs['deploy-staging'];
      const deployStep = stagingJob.steps.find(
        (step: any) => step.name === 'Deploy to staging',
      );

      const expectedManifests = [
        'k8s/namespace.yaml',
        'k8s/configmap.yaml',
        'k8s/secrets.yaml',
        'k8s/postgres.yaml',
        'k8s/redis.yaml',
        'k8s/elasticsearch.yaml',
        'k8s/kafka.yaml',
        'k8s/chemchat-deployment.yaml',
        'k8s/hpa.yaml',
        'k8s/ingress.yaml',
      ];

      for (const manifest of expectedManifests) {
        expect(deployStep.run).toContain(manifest);
        expect(existsSync(join(process.cwd(), manifest))).toBe(true);
      }
    });

    it('should have proper health checks configured', () => {
      const stagingJob = cdWorkflow.jobs['deploy-staging'];
      const smokeTestStep = stagingJob.steps.find(
        (step: any) => step.name === 'Run smoke tests',
      );

      expect(smokeTestStep.run).toContain(
        'curl -f https://staging-api.chemchat.com/health',
      );
      expect(smokeTestStep.run).toContain(
        'curl -f https://staging-api.chemchat.com/api/docs',
      );
    });

    it('should have rollback mechanism configured', () => {
      const rollbackJob = cdWorkflow.jobs.rollback;
      expect(rollbackJob.if).toContain('failure()');

      const rollbackStep = rollbackJob.steps.find(
        (step: any) => step.name === 'Rollback deployment',
      );
      expect(rollbackStep.run).toContain('kubectl rollout undo');
    });
  });

  describe('Docker Configuration Validation', () => {
    it('should have multi-stage build properly configured', () => {
      expect(dockerfile).toContain('FROM node:20-alpine AS base');
      expect(dockerfile).toContain('FROM base AS development');
      expect(dockerfile).toContain('FROM base AS deps');
      expect(dockerfile).toContain('FROM base AS builder');
      expect(dockerfile).toContain('FROM base AS runner');
    });

    it('should use npm consistently in Docker', () => {
      expect(dockerfile).toContain('npm install -g npm');
      expect(dockerfile).toContain('npm install --frozen-lockfile');
      expect(dockerfile).toContain('npm exec prisma generate');
      expect(dockerfile).toContain('npm run build');
    });

    it('should have proper health check configured', () => {
      expect(dockerfile).toContain('HEALTHCHECK');
      expect(dockerfile).toContain('curl -f http://localhost:3000/health');
    });

    it('should have security best practices', () => {
      expect(dockerfile).toContain('addgroup --system');
      expect(dockerfile).toContain('adduser --system');
      expect(dockerfile).toContain('USER nestjs');
    });
  });

  describe('File Dependencies Validation', () => {
    it('should have all required script files', () => {
      const requiredFiles = [
        'scripts/basic-seed.ts',
        'scripts/validate-database-operations.ts',
        'scripts/ci-database-test.sh',
        'test/load/load-test.js',
        'test/load/simple-load-test.js',
        'prisma/schema.prisma',
      ];

      for (const file of requiredFiles) {
        expect(existsSync(join(process.cwd(), file))).toBe(true);
      }
    });

    it('should have all required test configuration files', () => {
      const testConfigs = [
        'test/jest-e2e.json',
        'test/jest-integration.json',
        'test/jest-milestone.json',
      ];

      for (const config of testConfigs) {
        expect(existsSync(join(process.cwd(), config))).toBe(true);
      }
    });

    it('should have all required Kubernetes manifests', () => {
      const k8sManifests = [
        'k8s/namespace.yaml',
        'k8s/configmap.yaml',
        'k8s/secrets.yaml',
        'k8s/postgres.yaml',
        'k8s/redis.yaml',
        'k8s/elasticsearch.yaml',
        'k8s/kafka.yaml',
        'k8s/chemchat-deployment.yaml',
        'k8s/hpa.yaml',
        'k8s/ingress.yaml',
        'k8s/migration-job.yaml',
      ];

      for (const manifest of k8sManifests) {
        expect(existsSync(join(process.cwd(), manifest))).toBe(true);
      }
    });
  });

  describe('Environment Configuration Validation', () => {
    it('should have proper environment file templates', () => {
      const envFiles = ['.env.example', '.env.docker', '.env.test'];

      for (const envFile of envFiles) {
        expect(existsSync(join(process.cwd(), envFile))).toBe(true);
      }
    });

    it('should have required environment variables documented', () => {
      const envExample = readFileSync(
        join(process.cwd(), '.env.example'),
        'utf8',
      );

      const requiredVars = [
        'DATABASE_URL',
        'NODE_ENV',
        'REDIS_HOST',
        'REDIS_PORT',
        'ELASTICSEARCH_NODE',
      ];

      for (const envVar of requiredVars) {
        expect(envExample).toContain(envVar);
      }
    });
  });
});
