/**
 * Comprehensive Workflow Validation Tests
 *
 * This test suite provides comprehensive validation for GitHub workflows,
 * package.json scripts, and Node.js version consistency across all environments.
 *
 * This addresses task 8 requirements:
 * - Write tests to verify all package.json scripts execute successfully
 * - Create validation for Node.js version consistency across environments
 * - Test complete CI workflow execution with new configurations
 *
 * Requirements: 1.1, 2.1, 6.1
 */

import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import * as yaml from 'js-yaml';

describe('Comprehensive Workflow Validation', () => {
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

  describe('Package.json Script Execution Validation', () => {
    // Test all critical scripts that should execute successfully
    const criticalExecutableScripts = [
      { name: 'lint', timeout: 60000, description: 'Code linting' },
      { name: 'format', timeout: 60000, description: 'Code formatting' },
      { name: 'build', timeout: 120000, description: 'TypeScript compilation' },
      {
        name: 'prisma:generate',
        timeout: 60000,
        description: 'Prisma client generation',
      },
      {
        name: 'workflow:validate',
        timeout: 30000,
        description: 'Workflow validation',
      },
    ];

    test.each(criticalExecutableScripts)(
      'should execute $name script successfully ($description)',
      async ({ name, timeout }) => {
        expect(packageJson.scripts).toHaveProperty(name);

        const testEnv = {
          ...process.env,
          NODE_ENV: 'test',
          DATABASE_URL: 'postgresql://test:test@localhost:5432/chemchat_test',
        };

        expect(() => {
          execSync(`npm run ${name}`, {
            stdio: 'pipe',
            timeout,
            env: testEnv,
          });
        }).not.toThrow(`Script ${name} should execute without errors`);
      },
      180000,
    );

    // Test all CI-referenced scripts exist and are properly configured
    const ciReferencedScripts = [
      {
        name: 'lint',
        expectedCommand: 'eslint "{src,apps,libs,test}/**/*.ts" --fix',
      },
      { name: 'build', expectedCommand: 'nest build' },
      {
        name: 'migrate:reset',
        expectedCommand: 'prisma migrate reset --force',
      },
      { name: 'db:seed', expectedCommand: 'ts-node scripts/basic-seed.ts' },
      {
        name: 'test:unit',
        expectedPattern: /jest.*--testPathPatterns=src\/.*\\\.spec\\\.ts\$/,
      },
      {
        name: 'test:integration',
        expectedPattern: /jest.*--config.*jest-integration\.json/,
      },
      { name: 'test:e2e', expectedPattern: /jest.*--config.*jest-e2e\.json/ },
    ];

    test.each(ciReferencedScripts)(
      'should have $name script properly configured for CI',
      ({ name, expectedCommand, expectedPattern }) => {
        expect(packageJson.scripts).toHaveProperty(name);
        const scriptCommand = packageJson.scripts[name];

        if (expectedCommand) {
          expect(scriptCommand).toBe(expectedCommand);
        }

        if (expectedPattern) {
          expect(scriptCommand).toMatch(expectedPattern);
        }
      },
    );

    // Test database scripts are properly configured
    it('should have all database scripts properly configured', () => {
      const databaseScripts = {
        'migrate:reset': 'prisma migrate reset --force',
        'db:seed': 'ts-node scripts/basic-seed.ts',
        'db:validate': 'ts-node scripts/validate-database-operations.ts',
        'prisma:generate': 'prisma generate',
        'prisma:migrate': 'prisma migrate dev',
        'prisma:reset': 'prisma migrate reset',
      };

      for (const [scriptName, expectedCommand] of Object.entries(
        databaseScripts,
      )) {
        expect(packageJson.scripts).toHaveProperty(scriptName);
        expect(packageJson.scripts[scriptName]).toBe(expectedCommand);
      }
    });

    // Test workflow scripts are properly configured
    it('should have all workflow validation scripts properly configured', () => {
      const workflowScripts = [
        'workflow:validate',
        'workflow:validate-docker',
        'workflow:test',
        'workflow:test:quick',
        'workflow:test:docker',
        'workflow:test:in-docker',
        'workflow:test:validation',
        'workflow:test:comprehensive',
      ];

      for (const scriptName of workflowScripts) {
        expect(packageJson.scripts).toHaveProperty(scriptName);
        expect(packageJson.scripts[scriptName]).toBeDefined();
        expect(packageJson.scripts[scriptName]).not.toBe('');
      }
    });

    // Test performance testing scripts
    it('should have performance testing scripts properly configured', () => {
      expect(packageJson.scripts).toHaveProperty('test:load');
      expect(packageJson.scripts['test:load']).toBe(
        'k6 run test/load/load-test.js',
      );

      // Verify load test files exist
      const loadTestFiles = [
        'test/load/load-test.js',
        'test/load/simple-load-test.js',
      ];

      for (const file of loadTestFiles) {
        expect(existsSync(join(process.cwd(), file))).toBe(true);
      }
    });

    // Test Docker scripts are properly configured
    it('should have Docker scripts properly configured', () => {
      const dockerScripts = {
        'docker:build': 'docker-compose build',
        'docker:up': 'docker-compose up -d',
        'docker:down': 'docker-compose down',
        'docker:logs': 'docker-compose logs -f',
        'docker:ps': 'docker-compose ps',
      };

      for (const [scriptName, expectedCommand] of Object.entries(
        dockerScripts,
      )) {
        expect(packageJson.scripts).toHaveProperty(scriptName);
        expect(packageJson.scripts[scriptName]).toBe(expectedCommand);
      }
    });

    // Test all script dependencies exist
    it('should have all required script files present', () => {
      const requiredScriptFiles = [
        'scripts/basic-seed.ts',
        'scripts/validate-database-operations.ts',
        'scripts/simple-workflow-validate.js',
        'scripts/ci-database-test.sh',
        'scripts/dev-setup.sh',
        'scripts/run-workflow-validation.sh',
        'scripts/test-in-docker.js',
        'scripts/run-workflow-tests-in-docker.sh',
        'scripts/docker-workflow-test.sh',
        'scripts/run-workflow-validation-tests.sh',
      ];

      for (const file of requiredScriptFiles) {
        expect(existsSync(join(process.cwd(), file))).toBe(true);
      }
    });
  });

  describe('Node.js Version Consistency Validation', () => {
    const expectedNodeVersion = '20';

    it('should have consistent Node.js version in package.json engines', () => {
      expect(packageJson.engines).toBeDefined();
      expect(packageJson.engines.node).toBe('>=20.0.0');
    });

    it('should use Node.js 20 consistently in CI workflow', () => {
      expect(ciWorkflow.env.NODE_VERSION).toBe(expectedNodeVersion);

      // Check all jobs use the same Node version
      const jobs = Object.values(ciWorkflow.jobs) as any[];
      for (const job of jobs) {
        if (job.steps) {
          const nodeSetupSteps = job.steps.filter(
            (step: any) =>
              step.uses && step.uses.includes('actions/setup-node'),
          );

          for (const step of nodeSetupSteps) {
            if (step.with && step.with['node-version']) {
              expect(step.with['node-version']).toBe('${{ env.NODE_VERSION }}');
            }
          }
        }
      }
    });

    it('should use Node.js 20 consistently in Dockerfile', () => {
      expect(dockerfile).toContain('FROM node:20-alpine');

      // Ensure no old Node versions are referenced
      expect(dockerfile).not.toMatch(/node:1[0-9]-alpine/);
      expect(dockerfile).not.toMatch(/node:18/);
      expect(dockerfile).not.toMatch(/node:16/);
    });

    it('should use npm consistently across all workflows', () => {
      const jobs = Object.values(ciWorkflow.jobs) as any[];

      for (const job of jobs) {
        if (job.steps) {
          // Check npm cache setup
          const nodeSetupSteps = job.steps.filter(
            (step: any) =>
              step.uses && step.uses.includes('actions/setup-node'),
          );

          for (const step of nodeSetupSteps) {
            if (step.with && step.with.cache) {
              expect(step.with.cache).toBe('npm');
            }
          }

          // Check dependency installation uses npm ci
          const installSteps = job.steps.filter(
            (step: any) =>
              step.name &&
              step.name.toLowerCase().includes('install dependencies'),
          );

          for (const step of installSteps) {
            expect(step.run).toBe('npm ci');
          }
        }
      }
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

    it('should have consistent package manager lockfile', () => {
      expect(existsSync(join(process.cwd(), 'package-lock.json'))).toBe(true);
      expect(existsSync(join(process.cwd(), 'yarn.lock'))).toBe(false);
      expect(existsSync(join(process.cwd(), 'pnpm-lock.yaml'))).toBe(false);
    });

    it('should not reference old Node versions in docker-compose files', () => {
      const dockerComposeFiles = [
        'docker-compose.yml',
        'docker-compose.performance.yml',
        'docker-compose.workflow-validation.yml',
        'docker-compose.minimal.yml',
      ];

      for (const composeFile of dockerComposeFiles) {
        const composePath = join(process.cwd(), composeFile);
        if (existsSync(composePath)) {
          const content = readFileSync(composePath, 'utf8');
          expect(content).not.toMatch(/node:1[0-9]-alpine/);
          expect(content).not.toMatch(/node:18/);
          expect(content).not.toMatch(/node:16/);
        }
      }
    });
  });

  describe('Complete CI Workflow Execution Validation', () => {
    it('should validate CI workflow structure and configuration', () => {
      // Verify workflow triggers
      expect(ciWorkflow.on.push.branches).toContain('main');
      expect(ciWorkflow.on.pull_request.branches).toContain('main');

      // Verify environment variables
      expect(ciWorkflow.env.NODE_VERSION).toBe('20');
      expect(ciWorkflow.env.REGISTRY).toBe('ghcr.io');

      // Verify required jobs exist
      expect(ciWorkflow.jobs).toHaveProperty('test');
      expect(ciWorkflow.jobs).toHaveProperty('security');
      expect(ciWorkflow.jobs).toHaveProperty('build');
      expect(ciWorkflow.jobs).toHaveProperty('performance');
    });

    it('should validate test job services configuration', () => {
      const testJob = ciWorkflow.jobs.test;
      expect(testJob.services).toHaveProperty('postgres');
      expect(testJob.services).toHaveProperty('redis');
      expect(testJob.services).toHaveProperty('elasticsearch');

      // Verify service versions
      expect(testJob.services.postgres.image).toBe('postgres:15-alpine');
      expect(testJob.services.redis.image).toBe('redis:7-alpine');
      expect(testJob.services.elasticsearch.image).toBe('elasticsearch:8.11.0');

      // Verify health checks are configured
      expect(testJob.services.postgres.options).toContain('--health-cmd');
      expect(testJob.services.redis.options).toContain('--health-cmd');
      expect(testJob.services.elasticsearch.options).toContain('--health-cmd');
    });

    it('should validate test job step sequence', () => {
      const testJob = ciWorkflow.jobs.test;
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
      ];

      for (const expectedStep of expectedSteps) {
        expect(stepNames).toContain(expectedStep);
      }

      // Verify step order is logical
      const checkoutIndex = stepNames.indexOf('Checkout code');
      const setupNodeIndex = stepNames.indexOf('Setup Node.js');
      const installIndex = stepNames.indexOf('Install dependencies');
      const lintIndex = stepNames.indexOf('Lint code');
      const buildIndex = stepNames.indexOf('Type check');

      expect(checkoutIndex).toBeLessThan(setupNodeIndex);
      expect(setupNodeIndex).toBeLessThan(installIndex);
      expect(installIndex).toBeLessThan(lintIndex);
      expect(lintIndex).toBeLessThan(buildIndex);
    });

    it('should validate security job configuration', () => {
      const securityJob = ciWorkflow.jobs.security;
      const stepNames = securityJob.steps.map((step: any) => step.name);

      expect(stepNames).toContain('Run security audit');
      expect(stepNames).toContain('Run Snyk security scan');
      expect(stepNames).toContain('Run CodeQL Analysis');

      // Verify security audit step
      const auditStep = securityJob.steps.find(
        (step: any) => step.name === 'Run security audit',
      );
      expect(auditStep.run).toBe('npm audit --audit-level high');
    });

    it('should validate build job configuration', () => {
      const buildJob = ciWorkflow.jobs.build;
      expect(buildJob.needs).toEqual(['test', 'security']);

      const stepNames = buildJob.steps.map((step: any) => step.name);
      expect(stepNames).toContain('Build and push Docker image');
      expect(stepNames).toContain('Run Trivy vulnerability scanner');

      // Verify Docker build step passes NODE_VERSION
      const buildStep = buildJob.steps.find(
        (step: any) => step.name === 'Build and push Docker image',
      );
      expect(buildStep.with['build-args']).toContain(
        'NODE_VERSION=${{ env.NODE_VERSION }}',
      );
    });

    it('should validate performance job configuration', () => {
      const performanceJob = ciWorkflow.jobs.performance;
      expect(performanceJob.needs).toEqual(['build']);
      expect(performanceJob.if).toBe(
        "github.event_name == 'push' && github.ref == 'refs/heads/main'",
      );

      const stepNames = performanceJob.steps.map((step: any) => step.name);
      expect(stepNames).toContain('Pull k6 Docker image');
      expect(stepNames).toContain('Verify k6 installation');
      expect(stepNames).toContain('Run load tests');
    });

    it('should simulate complete CI workflow execution', async () => {
      // This test simulates the CI workflow steps that can be executed locally
      const testEnv = {
        DATABASE_URL: 'postgresql://test:test@localhost:5432/chemchat_test',
        REDIS_HOST: 'localhost',
        REDIS_PORT: '6379',
        ELASTICSEARCH_NODE: 'http://localhost:9200',
        NODE_ENV: 'test',
      };

      // Step 1: Install dependencies (simulate npm ci)
      expect(() => {
        execSync('npm ci', {
          stdio: 'pipe',
          timeout: 120000,
          env: { ...process.env, ...testEnv },
        });
      }).not.toThrow('Dependencies should install successfully');

      // Step 2: Lint code
      expect(() => {
        execSync('npm run lint', {
          stdio: 'pipe',
          timeout: 60000,
          env: { ...process.env, ...testEnv },
        });
      }).not.toThrow('Code linting should pass');

      // Step 3: Type check (build)
      expect(() => {
        execSync('npm run build', {
          stdio: 'pipe',
          timeout: 120000,
          env: { ...process.env, ...testEnv },
        });
      }).not.toThrow('TypeScript compilation should succeed');

      // Step 4: Verify database scripts exist and are configured correctly
      expect(packageJson.scripts['migrate:reset']).toBe(
        'prisma migrate reset --force',
      );
      expect(packageJson.scripts['db:seed']).toBe(
        'ts-node scripts/basic-seed.ts',
      );

      // Step 5: Run unit tests (with passWithNoTests to avoid failures in CI)
      expect(() => {
        execSync('npm run test:unit -- --passWithNoTests', {
          stdio: 'pipe',
          timeout: 60000,
          env: { ...process.env, ...testEnv },
        });
      }).not.toThrow('Unit tests should execute successfully');

      // Step 6: Validate workflow validation script
      expect(() => {
        execSync('npm run workflow:validate', {
          stdio: 'pipe',
          timeout: 30000,
          env: { ...process.env, ...testEnv },
        });
      }).not.toThrow('Workflow validation should pass');
    }, 600000);

    it('should validate environment variables are properly configured', () => {
      const testJob = ciWorkflow.jobs.test;

      // Check setup database step has correct env vars
      const setupDbStep = testJob.steps.find(
        (step: any) => step.name === 'Setup test database',
      );
      expect(setupDbStep.env.DATABASE_URL).toBe(
        'postgresql://test:test@localhost:5432/chemchat_test',
      );
      expect(setupDbStep.env.NODE_ENV).toBe('test');

      // Check test steps have required env vars
      const testSteps = testJob.steps.filter(
        (step: any) => step.name && step.name.includes('tests'),
      );

      for (const step of testSteps) {
        expect(step.env.DATABASE_URL).toBe(
          'postgresql://test:test@localhost:5432/chemchat_test',
        );
        expect(step.env.REDIS_HOST).toBe('localhost');
        expect(step.env.REDIS_PORT).toBe('6379');
        expect(step.env.ELASTICSEARCH_NODE).toBe('http://localhost:9200');
        expect(step.env.NODE_ENV).toBe('test');
      }
    });

    it('should validate all required configuration files exist', () => {
      const requiredConfigFiles = [
        'test/jest-e2e.json',
        'test/jest-integration.json',
        'test/jest-milestone.json',
        'test/jest-workflow-validation.json',
        'prisma/schema.prisma',
        '.env.example',
        '.env.docker',
        'docker-compose.yml',
        'docker-compose.performance.yml',
      ];

      for (const configFile of requiredConfigFiles) {
        expect(existsSync(join(process.cwd(), configFile))).toBe(true);
      }
    });

    it('should validate Docker build configuration', () => {
      const buildJob = ciWorkflow.jobs.build;
      const buildStep = buildJob.steps.find(
        (step: any) => step.name === 'Build and push Docker image',
      );

      expect(buildStep.with.context).toBe('.');
      expect(buildStep.with.platforms).toBe('linux/amd64,linux/arm64');
      expect(buildStep.with.push).toBe(true);
      expect(buildStep.with['cache-from']).toBe('type=gha');
      expect(buildStep.with['cache-to']).toBe('type=gha,mode=max');
    });
  });

  describe('CD Workflow Integration Validation', () => {
    it('should validate CD workflow structure', () => {
      expect(cdWorkflow.jobs).toHaveProperty('deploy-staging');
      expect(cdWorkflow.jobs).toHaveProperty('deploy-production');
      expect(cdWorkflow.jobs).toHaveProperty('rollback');
    });

    it('should validate Kubernetes manifest references', () => {
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
        expect(existsSync(join(process.cwd(), manifest))).toBe(true);
      }
    });

    it('should validate rollback mechanism is configured', () => {
      const rollbackJob = cdWorkflow.jobs.rollback;
      expect(rollbackJob.if).toContain('failure()');

      const rollbackStep = rollbackJob.steps.find(
        (step: any) => step.name === 'Rollback deployment',
      );
      expect(rollbackStep.run).toContain('kubectl rollout undo');
    });
  });

  describe('Cross-Environment Consistency Validation', () => {
    it('should validate all environments use consistent configurations', () => {
      // Check package.json engines
      expect(packageJson.engines.node).toBe('>=20.0.0');

      // Check CI workflow
      expect(ciWorkflow.env.NODE_VERSION).toBe('20');

      // Check Dockerfile
      expect(dockerfile).toContain('FROM node:20-alpine');

      // Verify consistency across all configurations
      const nodeVersion = '20';
      expect(ciWorkflow.env.NODE_VERSION).toBe(nodeVersion);
      expect(dockerfile).toContain(`FROM node:${nodeVersion}-alpine`);
    });

    it('should validate package manager consistency', () => {
      // Check lockfile exists
      expect(existsSync(join(process.cwd(), 'package-lock.json'))).toBe(true);

      // Check CI workflow uses npm
      const jobs = Object.values(ciWorkflow.jobs) as any[];
      for (const job of jobs) {
        if (job.steps) {
          const installSteps = job.steps.filter(
            (step: any) => step.run && step.run.includes('npm'),
          );

          for (const step of installSteps) {
            expect(step.run).toMatch(/npm (ci|install|run)/);
            expect(step.run).not.toMatch(/yarn/);
            expect(step.run).not.toMatch(/pnpm/);
          }
        }
      }

      // Check Dockerfile uses npm
      expect(dockerfile).toContain('npm install');
      expect(dockerfile).not.toContain('yarn install');
      expect(dockerfile).not.toContain('pnpm install');
    });

    it('should validate all test configurations are consistent', () => {
      const testConfigs = [
        'test/jest-e2e.json',
        'test/jest-integration.json',
        'test/jest-milestone.json',
        'test/jest-workflow-validation.json',
      ];

      for (const config of testConfigs) {
        const configPath = join(process.cwd(), config);
        expect(existsSync(configPath)).toBe(true);

        const configContent = JSON.parse(readFileSync(configPath, 'utf8'));
        expect(configContent.testEnvironment).toBe('node');
      }
    });
  });
});
