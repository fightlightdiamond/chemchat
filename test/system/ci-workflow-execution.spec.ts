/**
 * CI Workflow Execution Validation Tests
 *
 * This test suite validates that the complete CI workflow can execute successfully
 * with the new configurations, simulating the actual CI environment.
 *
 * Requirements: 1.1, 2.1, 6.1
 */

import { execSync, spawn } from 'child_process';
import { readFileSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import * as yaml from 'js-yaml';

describe('CI Workflow Execution Validation', () => {
  let ciWorkflow: any;
  let packageJson: any;

  beforeAll(() => {
    // Load CI workflow
    const ciWorkflowPath = join(process.cwd(), '.github/workflows/ci.yml');
    ciWorkflow = yaml.load(readFileSync(ciWorkflowPath, 'utf8'));

    // Load package.json
    const packageJsonPath = join(process.cwd(), 'package.json');
    packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  });

  describe('CI Environment Setup Validation', () => {
    it('should have all required environment variables defined', () => {
      const requiredEnvVars = ['NODE_VERSION', 'REGISTRY', 'IMAGE_NAME'];

      for (const envVar of requiredEnvVars) {
        expect(ciWorkflow.env).toHaveProperty(envVar);
        expect(ciWorkflow.env[envVar]).toBeTruthy();
      }
    });

    it('should have proper trigger configuration', () => {
      expect(ciWorkflow.on.push.branches).toContain('main');
      expect(ciWorkflow.on.push.branches).toContain('develop');
      expect(ciWorkflow.on.pull_request.branches).toContain('main');
      expect(ciWorkflow.on.pull_request.branches).toContain('develop');
    });

    it('should have all required services configured', () => {
      const testJob = ciWorkflow.jobs.test;
      expect(testJob.services).toHaveProperty('postgres');
      expect(testJob.services).toHaveProperty('redis');
      expect(testJob.services).toHaveProperty('elasticsearch');

      // Validate service configurations
      expect(testJob.services.postgres.image).toBe('postgres:15-alpine');
      expect(testJob.services.redis.image).toBe('redis:7-alpine');
      expect(testJob.services.elasticsearch.image).toBe('elasticsearch:8.11.0');
    });
  });

  describe('Test Job Execution Simulation', () => {
    const testEnv = {
      DATABASE_URL: 'postgresql://test:test@localhost:5432/chemchat_test',
      REDIS_HOST: 'localhost',
      REDIS_PORT: '6379',
      ELASTICSEARCH_NODE: 'http://localhost:9200',
      NODE_ENV: 'test',
    };

    it('should simulate checkout and setup steps', () => {
      // Verify we're in a git repository
      expect(() => {
        execSync('git rev-parse --git-dir', { stdio: 'pipe' });
      }).not.toThrow();

      // Verify npm is available
      expect(() => {
        execSync('npm --version', { stdio: 'pipe' });
      }).not.toThrow();

      // Verify Node.js version
      const nodeVersion = execSync('node --version', {
        encoding: 'utf8',
      }).trim();
      expect(nodeVersion).toMatch(/^v20\./);
    });

    it('should simulate dependency installation step', async () => {
      expect(() => {
        execSync('npm install --frozen-lockfile', {
          stdio: 'pipe',
          timeout: 120000,
          env: { ...process.env, ...testEnv },
        });
      }).not.toThrow();
    }, 120000);

    it('should simulate lint step execution', async () => {
      expect(() => {
        execSync('npm run lint', {
          stdio: 'pipe',
          timeout: 60000,
          env: { ...process.env, ...testEnv },
        });
      }).not.toThrow();
    }, 60000);

    it('should simulate type check step execution', async () => {
      expect(() => {
        execSync('npm run build', {
          stdio: 'pipe',
          timeout: 120000,
          env: { ...process.env, ...testEnv },
        });
      }).not.toThrow();
    }, 120000);

    it('should validate database setup commands', () => {
      // Verify the commands exist in package.json
      expect(packageJson.scripts['migrate:reset']).toBe(
        'prisma migrate reset --force',
      );
      expect(packageJson.scripts['db:seed']).toBe(
        'ts-node scripts/basic-seed.ts',
      );

      // Verify the script files exist
      expect(existsSync(join(process.cwd(), 'scripts/basic-seed.ts'))).toBe(
        true,
      );
    });

    it('should simulate unit test execution', async () => {
      expect(() => {
        execSync('npm run test:unit -- --passWithNoTests', {
          stdio: 'pipe',
          timeout: 60000,
          env: { ...process.env, ...testEnv },
        });
      }).not.toThrow();
    }, 60000);
  });

  describe('Security Job Execution Simulation', () => {
    it('should simulate security audit execution', async () => {
      expect(() => {
        execSync('npm audit --audit-level high', {
          stdio: 'pipe',
          timeout: 60000,
          env: { ...process.env, NODE_ENV: 'test' },
        });
      }).not.toThrow();
    }, 60000);

    it('should validate CodeQL configuration', () => {
      const securityJob = ciWorkflow.jobs.security;
      const codeqlSteps = securityJob.steps.filter(
        (step: any) => step.uses && step.uses.includes('github/codeql-action'),
      );

      expect(codeqlSteps.length).toBeGreaterThan(0);

      const initStep = codeqlSteps.find((step: any) =>
        step.uses.includes('codeql-action/init'),
      );
      expect(initStep.with.languages).toBe('javascript');
    });
  });

  describe('Build Job Execution Simulation', () => {
    it('should validate Docker build configuration', () => {
      const buildJob = ciWorkflow.jobs.build;
      expect(buildJob.needs).toContain('test');
      expect(buildJob.needs).toContain('security');

      const buildStep = buildJob.steps.find(
        (step: any) => step.name === 'Build and push Docker image',
      );
      expect(buildStep.with.platforms).toBe('linux/amd64,linux/arm64');
    });

    it('should validate Docker metadata extraction', () => {
      const buildJob = ciWorkflow.jobs.build;
      const metaStep = buildJob.steps.find(
        (step: any) => step.name === 'Extract metadata',
      );

      expect(metaStep.with.images).toBe(
        '${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}',
      );
      expect(metaStep.with.tags).toContain('type=ref,event=branch');
      expect(metaStep.with.tags).toContain('type=ref,event=pr');
    });

    it('should validate Trivy security scanning', () => {
      const buildJob = ciWorkflow.jobs.build;
      const trivyStep = buildJob.steps.find(
        (step: any) => step.name === 'Run Trivy vulnerability scanner',
      );

      expect(trivyStep.with.format).toBe('sarif');
      expect(trivyStep.with.output).toBe('trivy-results.sarif');
    });
  });

  describe('Performance Job Execution Simulation', () => {
    it('should validate performance job configuration', () => {
      const performanceJob = ciWorkflow.jobs.performance;
      expect(performanceJob.needs).toContain('build');
      expect(performanceJob.if).toBe(
        "github.event_name == 'push' && github.ref == 'refs/heads/main'",
      );
    });

    it('should validate k6 setup steps', () => {
      const performanceJob = ciWorkflow.jobs.performance;
      const stepNames = performanceJob.steps.map((step: any) => step.name);

      expect(stepNames).toContain('Pull k6 Docker image');
      expect(stepNames).toContain('Verify k6 installation');
      expect(stepNames).toContain('Run load tests');
    });

    it('should validate service startup sequence', () => {
      const performanceJob = ciWorkflow.jobs.performance;
      const stepNames = performanceJob.steps.map((step: any) => step.name);

      const expectedSequence = [
        'Start test environment',
        'Wait for PostgreSQL',
        'Wait for Redis',
        'Wait for Elasticsearch',
        'Wait for Kafka',
        'Wait for ChemChat application',
      ];

      for (const stepName of expectedSequence) {
        expect(stepNames).toContain(stepName);
      }
    });

    it('should validate load test file requirements', () => {
      expect(existsSync(join(process.cwd(), 'test/load/load-test.js'))).toBe(
        true,
      );
      expect(
        existsSync(join(process.cwd(), 'test/load/simple-load-test.js')),
      ).toBe(true);
    });
  });

  describe('Workflow Dependencies and Ordering', () => {
    it('should have proper job dependencies', () => {
      expect(ciWorkflow.jobs.build.needs).toEqual(['test', 'security']);
      expect(ciWorkflow.jobs.performance.needs).toEqual(['build']);
    });

    it('should validate step ordering in test job', () => {
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
      ];

      for (let i = 0; i < expectedOrder.length - 1; i++) {
        const currentIndex = stepNames.indexOf(expectedOrder[i]);
        const nextIndex = stepNames.indexOf(expectedOrder[i + 1]);
        expect(nextIndex).toBeGreaterThan(currentIndex);
      }
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should have proper cleanup steps in performance job', () => {
      const performanceJob = ciWorkflow.jobs.performance;
      const cleanupStep = performanceJob.steps.find(
        (step: any) => step.name === 'Cleanup',
      );

      expect(cleanupStep.if).toBe('always()');
      expect(cleanupStep.run).toContain('docker-compose');
      expect(cleanupStep.run).toContain('down -v');
    });

    it('should have failure logging in performance job', () => {
      const performanceJob = ciWorkflow.jobs.performance;
      const logsStep = performanceJob.steps.find(
        (step: any) => step.name === 'Display service logs on failure',
      );

      expect(logsStep.if).toBe('failure()');
      expect(logsStep.run).toContain('docker-compose logs');
    });

    it('should have proper artifact upload configuration', () => {
      const performanceJob = ciWorkflow.jobs.performance;
      const uploadStep = performanceJob.steps.find(
        (step: any) => step.name === 'Upload test results',
      );

      expect(uploadStep.if).toBe('always()');
      expect(uploadStep.with.name).toBe('k6-test-results');
    });
  });

  describe('Environment Configuration Validation', () => {
    it('should create proper environment file for docker-compose', () => {
      const performanceJob = ciWorkflow.jobs.performance;
      const envStep = performanceJob.steps.find(
        (step: any) =>
          step.name === 'Create environment file for docker-compose',
      );

      expect(envStep.run).toContain('cp .env.example .env.docker');
      expect(envStep.run).toContain('NODE_ENV=production');
      expect(envStep.run).toContain('DATABASE_URL=');
      expect(envStep.run).toContain('REDIS_HOST=redis');
    });

    it('should validate all required environment variables are set', () => {
      const testJob = ciWorkflow.jobs.test;
      const testSteps = testJob.steps.filter(
        (step: any) =>
          step.name &&
          step.name.startsWith('Run') &&
          step.name.includes('test'),
      );

      for (const step of testSteps) {
        expect(step.env).toHaveProperty('DATABASE_URL');
        expect(step.env).toHaveProperty('NODE_ENV');
        expect(step.env.NODE_ENV).toBe('test');
      }
    });
  });

  describe('Coverage and Reporting', () => {
    it('should have proper test coverage upload configuration', () => {
      const testJob = ciWorkflow.jobs.test;
      const coverageStep = testJob.steps.find(
        (step: any) => step.name === 'Upload test coverage',
      );

      expect(coverageStep.uses).toBe('codecov/codecov-action@v3');
      expect(coverageStep.with.file).toBe('./coverage/lcov.info');
      expect(coverageStep.with.flags).toBe('unittests');
    });

    it('should validate SARIF upload for security scanning', () => {
      const buildJob = ciWorkflow.jobs.build;
      const sarifStep = buildJob.steps.find(
        (step: any) => step.name === 'Upload Trivy scan results',
      );

      expect(sarifStep.uses).toBe('github/codeql-action/upload-sarif@v3');
      expect(sarifStep.with['sarif_file']).toBe('trivy-results.sarif');
    });
  });
});
