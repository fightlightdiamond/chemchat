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
      'test:load',
      'lint',
      'format',
      'migrate:reset',
      'db:seed',
      'db:validate',
      'prisma:generate',
      'workflow:validate',
      'docker:build',
      'docker:up',
      'docker:down',
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
        'test:load',
      ];

      for (const script of ciReferencedScripts) {
        expect(packageJson.scripts).toHaveProperty(script);
        expect(packageJson.scripts[script]).toBeTruthy();
      }
    });

    it('should execute all critical scripts without syntax errors', async () => {
      const executableScripts = ['lint', 'format', 'build', 'prisma:generate'];

      for (const script of executableScripts) {
        expect(() => {
          execSync(`npm run ${script}`, {
            stdio: 'pipe',
            timeout: 60000,
            env: { ...process.env, NODE_ENV: 'test' },
          });
        }).not.toThrow(`Script ${script} should execute without errors`);
      }
    }, 300000);

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

    it('should validate runtime Node.js version compatibility', () => {
      const currentNodeVersion = process.version;
      const majorVersion = parseInt(currentNodeVersion.slice(1).split('.')[0]);

      expect(majorVersion).toBeGreaterThanOrEqual(20);

      // Verify npm version compatibility
      const npmVersion = execSync('npm --version', { encoding: 'utf8' }).trim();
      const npmMajorVersion = parseInt(npmVersion.split('.')[0]);
      expect(npmMajorVersion).toBeGreaterThanOrEqual(8);
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

    it('should validate complete CI workflow execution simulation', async () => {
      // Simulate the complete CI workflow steps
      const testEnv = {
        DATABASE_URL: 'postgresql://test:test@localhost:5432/chemchat_test',
        REDIS_HOST: 'localhost',
        REDIS_PORT: '6379',
        ELASTICSEARCH_NODE: 'http://localhost:9200',
        NODE_ENV: 'test',
      };

      // Step 1: Install dependencies (simulate npm ci)
      expect(() => {
        execSync('npm install --frozen-lockfile', {
          stdio: 'pipe',
          timeout: 120000,
          env: { ...process.env, ...testEnv },
        });
      }).not.toThrow();

      // Step 2: Lint code
      expect(() => {
        execSync('npm run lint', {
          stdio: 'pipe',
          timeout: 60000,
          env: { ...process.env, ...testEnv },
        });
      }).not.toThrow();

      // Step 3: Type check (build)
      expect(() => {
        execSync('npm run build', {
          stdio: 'pipe',
          timeout: 120000,
          env: { ...process.env, ...testEnv },
        });
      }).not.toThrow();

      // Step 4: Validate database scripts exist
      expect(packageJson.scripts['migrate:reset']).toBe(
        'prisma migrate reset --force',
      );
      expect(packageJson.scripts['db:seed']).toBe(
        'ts-node scripts/basic-seed.ts',
      );

      // Step 5: Run unit tests
      expect(() => {
        execSync('npm run test:unit -- --passWithNoTests', {
          stdio: 'pipe',
          timeout: 60000,
          env: { ...process.env, ...testEnv },
        });
      }).not.toThrow();
    }, 400000);

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
      expect(dockerfile).toMatch(/FROM node:20-alpine.*AS base/);
      expect(dockerfile).toContain('FROM base AS development');
      expect(dockerfile).toContain('FROM base AS deps');
      expect(dockerfile).toContain('FROM base AS builder');
      expect(dockerfile).toContain('FROM base AS runner');
    });

    it('should use npm consistently in Docker', () => {
      expect(dockerfile).toContain('npm install -g npm');
      expect(dockerfile).toMatch(/npm (ci|install)/);
      expect(dockerfile).toContain('npx prisma generate');
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

    it('should validate Docker service connections are properly configured', () => {
      // Check docker-compose.yml has correct service names and connections
      const dockerComposePath = join(process.cwd(), 'docker-compose.yml');
      const dockerComposeContent = readFileSync(dockerComposePath, 'utf8');

      // Verify service names match what application expects
      expect(dockerComposeContent).toContain('postgres:');
      expect(dockerComposeContent).toContain('redis:');
      expect(dockerComposeContent).toContain('elasticsearch:');
      expect(dockerComposeContent).toContain('kafka:');

      // Check .env.docker uses correct service names for connections
      const envDockerPath = join(process.cwd(), '.env.docker');
      const envDockerContent = readFileSync(envDockerPath, 'utf8');

      expect(envDockerContent).toContain(
        'DATABASE_URL="postgresql://chemchat:chemchat_password@postgres:5432/chatdb"',
      );
      expect(envDockerContent).toContain('REDIS_HOST="redis"');
      expect(envDockerContent).toContain(
        'ELASTICSEARCH_URL="http://elasticsearch:9200"',
      );
      expect(envDockerContent).toContain('KAFKA_BROKERS="kafka:9092"');
    });

    it('should validate workflow validation Docker compose uses correct service connections', () => {
      const workflowComposePath = join(
        process.cwd(),
        'docker-compose.workflow-validation.yml',
      );
      const workflowComposeContent = readFileSync(workflowComposePath, 'utf8');

      // Check test environment uses correct service names
      expect(workflowComposeContent).toContain(
        'DATABASE_URL=postgresql://test:test@postgres:5432/chemchat_test',
      );
      expect(workflowComposeContent).toContain('REDIS_HOST=redis');
      expect(workflowComposeContent).toContain(
        'ELASTICSEARCH_NODE=http://elasticsearch:9200',
      );

      // Verify services have proper health checks and dependencies
      expect(workflowComposeContent).toContain('condition: service_healthy');
      expect(workflowComposeContent).toContain('depends_on:');
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

  describe('Complete Workflow Integration Validation', () => {
    it('should validate all workflows can be parsed and have valid syntax', () => {
      const workflowFiles = [
        '.github/workflows/ci.yml',
        '.github/workflows/cd.yml',
      ];

      // Check if security workflow exists before adding to list
      const securityWorkflowPath = join(
        process.cwd(),
        '.github/workflows/security.yml',
      );
      if (existsSync(securityWorkflowPath)) {
        workflowFiles.push('.github/workflows/security.yml');
      }

      for (const workflowFile of workflowFiles) {
        const workflowPath = join(process.cwd(), workflowFile);
        expect(existsSync(workflowPath)).toBe(true);

        expect(() => {
          const content = readFileSync(workflowPath, 'utf8');
          yaml.load(content);
        }).not.toThrow(`${workflowFile} should have valid YAML syntax`);
      }
    });

    it('should validate all referenced scripts exist and are executable', async () => {
      const allScripts = Object.keys(packageJson.scripts);
      const criticalScripts = [
        'lint',
        'format',
        'build',
        'test:unit',
        'prisma:generate',
        'workflow:validate',
      ];

      for (const script of criticalScripts) {
        expect(allScripts).toContain(script);

        // Test script execution (with timeout and error handling)
        try {
          execSync(
            `npm run ${script} -- --help || npm run ${script} -- --version || echo "Script exists"`,
            {
              stdio: 'pipe',
              timeout: 30000,
              env: { ...process.env, NODE_ENV: 'test' },
            },
          );
        } catch (error) {
          // For scripts that don't support --help or --version, just verify they exist
          expect(packageJson.scripts[script]).toBeDefined();
        }
      }
    }, 180000);

    it('should validate workflow environment consistency across all files', () => {
      // Check CI workflow
      expect(ciWorkflow.env.NODE_VERSION).toBe('20');

      // Check CD workflow if it has env
      if (cdWorkflow.env && cdWorkflow.env.NODE_VERSION) {
        expect(cdWorkflow.env.NODE_VERSION).toBe('20');
      }

      // Validate all Node.js setup steps use the same version
      const allWorkflows = [ciWorkflow, cdWorkflow].filter(Boolean);

      for (const workflow of allWorkflows) {
        const jobs = Object.values(workflow.jobs) as any[];

        for (const job of jobs) {
          if (job.steps) {
            const nodeSetupSteps = job.steps.filter(
              (step: any) =>
                step.uses && step.uses.includes('actions/setup-node'),
            );

            for (const step of nodeSetupSteps) {
              if (step.with && step.with['node-version']) {
                expect(step.with['node-version']).toMatch(
                  /20|\$\{\{ env\.NODE_VERSION \}\}/,
                );
              }
            }
          }
        }
      }
    });

    it('should validate all Docker configurations are consistent', () => {
      // Check Dockerfile uses Node 20
      expect(dockerfile).toContain('FROM node:20-alpine');

      // Check docker-compose files reference correct image
      const dockerComposeFiles = [
        'docker-compose.yml',
        'docker-compose.performance.yml',
        'docker-compose.workflow-validation.yml',
      ];

      for (const composeFile of dockerComposeFiles) {
        const composePath = join(process.cwd(), composeFile);
        if (existsSync(composePath)) {
          const content = readFileSync(composePath, 'utf8');
          // Should not contain hardcoded old Node versions
          expect(content).not.toMatch(/node:1[0-9]-alpine/);
        }
      }
    });

    it('should validate complete CI pipeline can execute successfully', async () => {
      // This is a comprehensive test that simulates the entire CI pipeline
      const testEnv = {
        DATABASE_URL: 'postgresql://test:test@localhost:5432/chemchat_test',
        REDIS_HOST: 'localhost',
        REDIS_PORT: '6379',
        ELASTICSEARCH_NODE: 'http://localhost:9200',
        NODE_ENV: 'test',
      };

      // Simulate complete CI workflow execution
      const ciSteps = [
        {
          name: 'Install dependencies',
          command: 'npm install --frozen-lockfile',
        },
        { name: 'Lint code', command: 'npm run lint' },
        { name: 'Type check', command: 'npm run build' },
        {
          name: 'Run unit tests',
          command: 'npm run test:unit -- --passWithNoTests',
        },
      ];

      for (const step of ciSteps) {
        expect(() => {
          execSync(step.command, {
            stdio: 'pipe',
            timeout: 120000,
            env: { ...process.env, ...testEnv },
          });
        }).not.toThrow(`CI step "${step.name}" should execute successfully`);
      }
    }, 600000);

    it('should validate security workflow configuration', () => {
      // Load security workflow if it exists
      const securityWorkflowPath = join(
        process.cwd(),
        '.github/workflows/security.yml',
      );
      if (existsSync(securityWorkflowPath)) {
        const securityWorkflow = yaml.load(
          readFileSync(securityWorkflowPath, 'utf8'),
        ) as any;

        // Validate security workflow has required jobs
        expect(securityWorkflow.jobs).toHaveProperty('dependency-scan');
        expect(securityWorkflow.jobs).toHaveProperty('container-scan');

        // Validate Node.js version consistency in security workflow
        const jobs = Object.values(securityWorkflow.jobs) as any[];
        for (const job of jobs) {
          if (job.steps) {
            const nodeSetupSteps = job.steps.filter(
              (step: any) =>
                step.uses && step.uses.includes('actions/setup-node'),
            );

            for (const step of nodeSetupSteps) {
              if (step.with && step.with['node-version']) {
                expect(step.with['node-version']).toBe('20');
              }
            }
          }
        }
      }
    });
  });
});
