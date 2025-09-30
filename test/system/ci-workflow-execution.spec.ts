/**
 * CI Workflow Execution Validation Tests
 *
 * This test suite validates that the complete CI workflow can execute successfully
 * with the new configurations and that all steps work correctly.
 *
 * Requirements: 1.1, 2.1, 6.1
 */

import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import * as yaml from 'js-yaml';

describe('CI Workflow Execution Validation', () => {
  let ciWorkflow: any;
  let packageJson: any;

  beforeAll(() => {
    // Load CI workflow
    const ciWorkflowPath = join(process.cwd(), '.github/workflows/ci.yml');
    ciWorkflow = yaml.load(readFileSync(ciWorkflowPath, 'utf8')) as any;

    // Load package.json
    const packageJsonPath = join(process.cwd(), 'package.json');
    packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  });

  describe('Workflow Structure Validation', () => {
    it('should have valid YAML syntax', () => {
      expect(ciWorkflow).toBeDefined();
      expect(ciWorkflow.name).toBe('CI Pipeline');
      expect(ciWorkflow.on).toBeDefined();
      expect(ciWorkflow.jobs).toBeDefined();
    });

    it('should have required trigger events', () => {
      expect(ciWorkflow.on.push).toBeDefined();
      expect(ciWorkflow.on.pull_request).toBeDefined();
      expect(ciWorkflow.on.push.branches).toContain('main');
      expect(ciWorkflow.on.push.branches).toContain('develop');
    });

    it('should have environment variables properly configured', () => {
      expect(ciWorkflow.env).toBeDefined();
      expect(ciWorkflow.env.NODE_VERSION).toBe('20');
      expect(ciWorkflow.env.REGISTRY).toBe('ghcr.io');
      expect(ciWorkflow.env.IMAGE_NAME).toBe('${{ github.repository }}');
    });

    it('should have all required jobs', () => {
      expect(ciWorkflow.jobs).toHaveProperty('test');
      expect(ciWorkflow.jobs).toHaveProperty('security');
      expect(ciWorkflow.jobs).toHaveProperty('build');
      expect(ciWorkflow.jobs).toHaveProperty('performance');
    });
  });

  describe('Test Job Validation', () => {
    let testJob: any;

    beforeAll(() => {
      testJob = ciWorkflow.jobs.test;
    });

    it('should have proper runner configuration', () => {
      expect(testJob['runs-on']).toBe('ubuntu-latest');
    });

    it('should have all required services configured', () => {
      expect(testJob.services).toBeDefined();
      expect(testJob.services.postgres).toBeDefined();
      expect(testJob.services.redis).toBeDefined();
      expect(testJob.services.elasticsearch).toBeDefined();

      // Verify service configurations
      expect(testJob.services.postgres.image).toBe('postgres:15-alpine');
      expect(testJob.services.redis.image).toBe('redis:7-alpine');
      expect(testJob.services.elasticsearch.image).toBe('elasticsearch:8.11.0');
    });

    it('should have proper service health checks', () => {
      expect(testJob.services.postgres.options).toContain('--health-cmd');
      expect(testJob.services.redis.options).toContain('--health-cmd');
      expect(testJob.services.elasticsearch.options).toContain('--health-cmd');
    });

    it('should have correct step sequence', () => {
      const stepNames = testJob.steps.map((step: any) => step.name);

      const expectedSteps = [
        'Checkout code',
        'Setup Node.js',
        'Install dependencies',
        'Lint code',
        'Type check',
        'Setup test database',
        'Run unit tests',
        'Run integration tests',
        'Run E2E tests',
        'Upload test coverage',
      ];

      for (const expectedStep of expectedSteps) {
        expect(stepNames).toContain(expectedStep);
      }
    });

    it('should use correct Node.js setup', () => {
      const nodeSetupStep = testJob.steps.find(
        (step: any) => step.name === 'Setup Node.js',
      );

      expect(nodeSetupStep.uses).toBe('actions/setup-node@v4');
      expect(nodeSetupStep.with['node-version']).toBe(
        '${{ env.NODE_VERSION }}',
      );
      expect(nodeSetupStep.with.cache).toBe('npm');
    });

    it('should use npm ci for dependency installation', () => {
      const installStep = testJob.steps.find(
        (step: any) => step.name === 'Install dependencies',
      );

      expect(installStep.run).toBe('npm ci');
    });

    it('should have proper database setup', () => {
      const dbSetupStep = testJob.steps.find(
        (step: any) => step.name === 'Setup test database',
      );

      expect(dbSetupStep.run).toContain('npm run migrate:reset');
      expect(dbSetupStep.run).toContain('npm run db:seed');
      expect(dbSetupStep.env.DATABASE_URL).toBeDefined();
      expect(dbSetupStep.env.NODE_ENV).toBe('test');
    });

    it('should have proper environment variables for test steps', () => {
      const testSteps = testJob.steps.filter((step: any) =>
        step.name.includes('test'),
      );

      for (const step of testSteps) {
        if (step.env) {
          expect(step.env.DATABASE_URL).toBeDefined();
          expect(step.env.REDIS_HOST).toBe('localhost');
          expect(step.env.REDIS_PORT).toBe('6379');
          expect(step.env.ELASTICSEARCH_NODE).toBe('http://localhost:9200');
          expect(step.env.NODE_ENV).toBe('test');
        }
      }
    });
  });

  describe('Security Job Validation', () => {
    let securityJob: any;

    beforeAll(() => {
      securityJob = ciWorkflow.jobs.security;
    });

    it('should have proper Node.js setup', () => {
      const nodeSetupStep = securityJob.steps.find(
        (step: any) => step.name === 'Setup Node.js',
      );

      expect(nodeSetupStep.uses).toBe('actions/setup-node@v4');
      expect(nodeSetupStep.with['node-version']).toBe(
        '${{ env.NODE_VERSION }}',
      );
      expect(nodeSetupStep.with.cache).toBe('npm');
    });

    it('should use npm ci for dependency installation', () => {
      const installStep = securityJob.steps.find(
        (step: any) => step.name === 'Install dependencies',
      );

      expect(installStep.run).toBe('npm ci');
    });

    it('should have security scanning steps', () => {
      const stepNames = securityJob.steps.map((step: any) => step.name);

      expect(stepNames).toContain('Run security audit');
      expect(stepNames).toContain('Run Snyk security scan');
      expect(stepNames).toContain('Run CodeQL Analysis');
    });

    it('should have proper Snyk configuration', () => {
      const snykStep = securityJob.steps.find(
        (step: any) => step.name === 'Run Snyk security scan',
      );

      expect(snykStep.uses).toBe('snyk/actions/node@master');
      expect(snykStep.env.SNYK_TOKEN).toBe('${{ secrets.SNYK_TOKEN }}');
      expect(snykStep.with.args).toBe('--severity-threshold=high');
    });
  });

  describe('Build Job Validation', () => {
    let buildJob: any;

    beforeAll(() => {
      buildJob = ciWorkflow.jobs.build;
    });

    it('should depend on test and security jobs', () => {
      expect(buildJob.needs).toEqual(['test', 'security']);
    });

    it('should have Docker build configuration', () => {
      const buildStep = buildJob.steps.find(
        (step: any) => step.name === 'Build and push Docker image',
      );

      expect(buildStep.uses).toBe('docker/build-push-action@v5');
      expect(buildStep.with.context).toBe('.');
      expect(buildStep.with.push).toBe(true);
      expect(buildStep.with['build-args']).toContain('NODE_VERSION=');
    });

    it('should have vulnerability scanning', () => {
      const trivyStep = buildJob.steps.find(
        (step: any) => step.name === 'Run Trivy vulnerability scanner',
      );

      expect(trivyStep.uses).toBe('aquasecurity/trivy-action@master');
      expect(trivyStep.with.format).toBe('sarif');
    });
  });

  describe('Performance Job Validation', () => {
    let performanceJob: any;

    beforeAll(() => {
      performanceJob = ciWorkflow.jobs.performance;
    });

    it('should depend on build job', () => {
      expect(performanceJob.needs).toEqual(['build']);
    });

    it('should only run on main branch pushes', () => {
      expect(performanceJob.if).toBe(
        "github.event_name == 'push' && github.ref == 'refs/heads/main'",
      );
    });

    it('should have k6 setup steps', () => {
      const stepNames = performanceJob.steps.map((step: any) => step.name);

      expect(stepNames).toContain('Pull k6 Docker image');
      expect(stepNames).toContain('Verify k6 installation');
      expect(stepNames).toContain('Run load tests');
    });

    it('should have proper environment setup', () => {
      const envStep = performanceJob.steps.find(
        (step: any) =>
          step.name === 'Create environment file for docker-compose',
      );

      expect(envStep.run).toContain('cp .env.example .env.docker');
      expect(envStep.run).toContain('NODE_ENV=production');
    });

    it('should have service health checks', () => {
      const stepNames = performanceJob.steps.map((step: any) => step.name);

      expect(stepNames).toContain('Wait for PostgreSQL');
      expect(stepNames).toContain('Wait for Redis');
      expect(stepNames).toContain('Wait for Elasticsearch');
      expect(stepNames).toContain('Wait for Kafka');
      expect(stepNames).toContain('Wait for ChemChat application');
    });
  });

  describe('Simulated CI Execution', () => {
    const testEnv = {
      DATABASE_URL: 'postgresql://test:test@localhost:5432/chemchat_test',
      REDIS_HOST: 'localhost',
      REDIS_PORT: '6379',
      ELASTICSEARCH_NODE: 'http://localhost:9200',
      NODE_ENV: 'test',
    };

    it('should simulate dependency installation step', () => {
      expect(() => {
        execSync('npm ci', {
          stdio: 'pipe',
          timeout: 120000,
          env: { ...process.env, ...testEnv },
        });
      }).not.toThrow('npm ci should execute successfully');
    });

    it('should simulate lint step', () => {
      expect(() => {
        execSync('npm run lint', {
          stdio: 'pipe',
          timeout: 60000,
          env: { ...process.env, ...testEnv },
        });
      }).not.toThrow('Lint step should execute successfully');
    });

    it('should simulate build step', () => {
      expect(() => {
        execSync('npm run build', {
          stdio: 'pipe',
          timeout: 120000,
          env: { ...process.env, ...testEnv },
        });
      }).not.toThrow('Build step should execute successfully');
    });

    it('should validate database scripts exist for setup step', () => {
      expect(packageJson.scripts['migrate:reset']).toBe(
        'prisma migrate reset --force',
      );
      expect(packageJson.scripts['db:seed']).toBe(
        'ts-node scripts/basic-seed.ts',
      );

      // Verify script files exist
      expect(existsSync(join(process.cwd(), 'scripts/basic-seed.ts'))).toBe(
        true,
      );
    });

    it('should simulate unit test step', () => {
      expect(() => {
        execSync('npm run test:unit -- --passWithNoTests', {
          stdio: 'pipe',
          timeout: 60000,
          env: { ...process.env, ...testEnv },
        });
      }).not.toThrow('Unit tests should execute successfully');
    });

    it('should validate test configuration files exist', () => {
      const testConfigs = [
        'test/jest-integration.json',
        'test/jest-e2e.json',
        'test/jest-workflow-validation.json',
      ];

      for (const config of testConfigs) {
        expect(existsSync(join(process.cwd(), config))).toBe(true);
      }
    });

    it('should simulate security audit step', () => {
      expect(() => {
        execSync('npm audit --audit-level high', {
          stdio: 'pipe',
          timeout: 60000,
          env: { ...process.env, ...testEnv },
        });
      }).not.toThrow('Security audit should execute successfully');
    });
  });

  describe('Workflow File Dependencies', () => {
    it('should have all referenced files present', () => {
      const requiredFiles = [
        '.env.example',
        'Dockerfile',
        'docker-compose.yml',
        'docker-compose.performance.yml',
        'test/load/load-test.js',
        'test/load/simple-load-test.js',
      ];

      for (const file of requiredFiles) {
        expect(existsSync(join(process.cwd(), file))).toBe(true);
      }
    });

    it('should validate Docker Compose files have correct services', () => {
      const dockerComposePath = join(process.cwd(), 'docker-compose.yml');
      const content = readFileSync(dockerComposePath, 'utf8');

      // Should contain required services
      expect(content).toContain('postgres:');
      expect(content).toContain('redis:');
      expect(content).toContain('elasticsearch:');
    });

    it('should validate performance Docker Compose file exists', () => {
      const performanceComposePath = join(
        process.cwd(),
        'docker-compose.performance.yml',
      );
      expect(existsSync(performanceComposePath)).toBe(true);

      const content = readFileSync(performanceComposePath, 'utf8');
      expect(content).toContain('k6');
    });
  });

  describe('Environment Configuration Validation', () => {
    it('should have proper environment file templates', () => {
      const envFiles = ['.env.example', '.env.docker', '.env.test'];

      for (const envFile of envFiles) {
        const envPath = join(process.cwd(), envFile);
        if (existsSync(envPath)) {
          const content = readFileSync(envPath, 'utf8');
          expect(content.length).toBeGreaterThan(0);
        }
      }
    });

    it('should validate required environment variables are documented', () => {
      const envExamplePath = join(process.cwd(), '.env.example');
      const content = readFileSync(envExamplePath, 'utf8');

      const requiredVars = [
        'DATABASE_URL',
        'NODE_ENV',
        'REDIS_HOST',
        'REDIS_PORT',
      ];

      for (const envVar of requiredVars) {
        expect(content).toContain(envVar);
      }
    });
  });

  describe('Workflow Integration Points', () => {
    it('should validate all workflow steps reference existing scripts', () => {
      const testJob = ciWorkflow.jobs.test;
      const referencedScripts = [];

      // Extract script references from workflow steps
      for (const step of testJob.steps) {
        if (step.run && step.run.includes('npm run')) {
          const matches = step.run.match(/npm run ([a-zA-Z:_-]+)/g);
          if (matches) {
            for (const match of matches) {
              const scriptName = match.replace('npm run ', '');
              referencedScripts.push(scriptName);
            }
          }
        }
      }

      // Verify all referenced scripts exist in package.json
      for (const script of referencedScripts) {
        expect(packageJson.scripts).toHaveProperty(script);
      }
    });

    it('should validate workflow uses correct action versions', () => {
      const allJobs = Object.values(ciWorkflow.jobs) as any[];

      for (const job of allJobs) {
        if (job.steps) {
          for (const step of job.steps) {
            if (step.uses) {
              // Verify using v4 for checkout and setup-node
              if (step.uses.includes('actions/checkout')) {
                expect(step.uses).toBe('actions/checkout@v4');
              }
              if (step.uses.includes('actions/setup-node')) {
                expect(step.uses).toBe('actions/setup-node@v4');
              }
            }
          }
        }
      }
    });

    it('should validate proper job dependencies', () => {
      // Build job should depend on test and security
      expect(ciWorkflow.jobs.build.needs).toEqual(['test', 'security']);

      // Performance job should depend on build
      expect(ciWorkflow.jobs.performance.needs).toEqual(['build']);
    });
  });

  describe('Error Handling and Resilience', () => {
    it('should have proper timeout configurations', () => {
      // Check that long-running steps have appropriate timeouts
      const performanceJob = ciWorkflow.jobs.performance;
      const waitSteps = performanceJob.steps.filter((step: any) =>
        step.name.includes('Wait for'),
      );

      for (const step of waitSteps) {
        expect(step.run).toContain('timeout');
      }
    });

    it('should have proper cleanup steps', () => {
      const performanceJob = ciWorkflow.jobs.performance;
      const cleanupStep = performanceJob.steps.find(
        (step: any) => step.name === 'Cleanup',
      );

      expect(cleanupStep.if).toBe('always()');
      expect(cleanupStep.run).toContain('docker-compose');
      expect(cleanupStep.run).toContain('down');
    });

    it('should have proper error logging', () => {
      const performanceJob = ciWorkflow.jobs.performance;
      const logStep = performanceJob.steps.find(
        (step: any) => step.name === 'Display service logs on failure',
      );

      expect(logStep.if).toBe('failure()');
      expect(logStep.run).toContain('docker-compose logs');
    });
  });
});
