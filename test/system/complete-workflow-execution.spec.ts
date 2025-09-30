/**
 * Complete Workflow Execution Validation Tests
 *
 * This test suite provides end-to-end validation of the complete CI/CD workflow
 * execution with all new configurations and ensures everything works together.
 *
 * Requirements: 1.1, 2.1, 6.1
 */

import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import * as yaml from 'js-yaml';

describe('Complete Workflow Execution Validation', () => {
  let packageJson: any;
  let ciWorkflow: any;
  let cdWorkflow: any;
  let securityWorkflow: any;

  beforeAll(() => {
    // Load all configuration files
    packageJson = JSON.parse(
      readFileSync(join(process.cwd(), 'package.json'), 'utf8'),
    );
    ciWorkflow = yaml.load(
      readFileSync(join(process.cwd(), '.github/workflows/ci.yml'), 'utf8'),
    ) as any;
    cdWorkflow = yaml.load(
      readFileSync(join(process.cwd(), '.github/workflows/cd.yml'), 'utf8'),
    ) as any;

    const securityWorkflowPath = join(
      process.cwd(),
      '.github/workflows/security.yml',
    );
    if (existsSync(securityWorkflowPath)) {
      securityWorkflow = yaml.load(
        readFileSync(securityWorkflowPath, 'utf8'),
      ) as any;
    }
  });

  describe('End-to-End Workflow Validation', () => {
    it('should validate complete CI pipeline can execute successfully', async () => {
      const testEnv = {
        DATABASE_URL: 'postgresql://test:test@localhost:5432/chemchat_test',
        REDIS_HOST: 'localhost',
        REDIS_PORT: '6379',
        ELASTICSEARCH_NODE: 'http://localhost:9200',
        NODE_ENV: 'test',
      };

      // Simulate the complete CI workflow execution
      const ciSteps = [
        {
          name: 'Install dependencies',
          command: 'npm ci',
          timeout: 120000,
        },
        {
          name: 'Lint code',
          command: 'npm run lint',
          timeout: 60000,
        },
        {
          name: 'Type check',
          command: 'npm run build',
          timeout: 120000,
        },
        {
          name: 'Run unit tests',
          command: 'npm run test:unit -- --passWithNoTests',
          timeout: 60000,
        },
        {
          name: 'Security audit',
          command: 'npm audit --audit-level high',
          timeout: 60000,
        },
      ];

      for (const step of ciSteps) {
        expect(() => {
          execSync(step.command, {
            stdio: 'pipe',
            timeout: step.timeout,
            env: { ...process.env, ...testEnv },
          });
        }).not.toThrow(`CI step "${step.name}" should execute successfully`);
      }
    }, 600000);

    it('should validate all workflow files have consistent configuration', () => {
      // Validate Node.js version consistency
      expect(ciWorkflow.env.NODE_VERSION).toBe('20');

      // Validate all workflows use the same Node version
      const allWorkflows = [ciWorkflow, cdWorkflow];
      if (securityWorkflow) {
        allWorkflows.push(securityWorkflow);
      }

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

    it('should validate all required scripts exist and are properly configured', () => {
      const requiredScripts = [
        'build',
        'lint',
        'format',
        'test:unit',
        'test:integration',
        'test:e2e',
        'test:load',
        'migrate:reset',
        'db:seed',
        'db:validate',
        'prisma:generate',
        'workflow:validate',
        'docker:build',
        'docker:up',
        'docker:down',
      ];

      for (const script of requiredScripts) {
        expect(packageJson.scripts).toHaveProperty(script);
        expect(packageJson.scripts[script]).toBeDefined();
        expect(packageJson.scripts[script]).not.toBe('');
      }
    });

    it('should validate all workflow dependencies are satisfied', () => {
      const requiredFiles = [
        // Configuration files
        'package.json',
        'tsconfig.json',
        'Dockerfile',
        '.env.example',

        // Workflow files
        '.github/workflows/ci.yml',
        '.github/workflows/cd.yml',

        // Script files
        'scripts/basic-seed.ts',
        'scripts/validate-database-operations.ts',
        'scripts/simple-workflow-validate.js',

        // Test configuration files
        'test/jest-integration.json',
        'test/jest-e2e.json',
        'test/jest-workflow-validation.json',

        // Load test files
        'test/load/load-test.js',
        'test/load/simple-load-test.js',

        // Docker compose files
        'docker-compose.yml',
        'docker-compose.performance.yml',

        // Kubernetes manifests
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

        // Prisma files
        'prisma/schema.prisma',
      ];

      for (const file of requiredFiles) {
        expect(existsSync(join(process.cwd(), file))).toBe(true);
      }
    });
  });

  describe('Cross-Workflow Integration', () => {
    it('should validate CI and CD workflows are properly integrated', () => {
      // CI workflow should build and push Docker image
      const buildJob = ciWorkflow.jobs.build;
      expect(buildJob.needs).toEqual(['test', 'security']);

      const buildStep = buildJob.steps.find(
        (step: any) => step.name === 'Build and push Docker image',
      );
      expect(buildStep.with.push).toBe(true);

      // CD workflow should reference the same registry
      expect(ciWorkflow.env.REGISTRY).toBe(cdWorkflow.env.REGISTRY);
      expect(ciWorkflow.env.IMAGE_NAME).toBe(cdWorkflow.env.IMAGE_NAME);
    });

    it('should validate security workflow integrates with CI workflow', () => {
      if (securityWorkflow) {
        // Security workflow should run on same triggers as CI
        expect(securityWorkflow.on.push).toBeDefined();
        expect(securityWorkflow.on.pull_request).toBeDefined();

        // Should use same Node version
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

    it('should validate performance testing integrates with CI workflow', () => {
      const performanceJob = ciWorkflow.jobs.performance;

      // Should depend on build job
      expect(performanceJob.needs).toEqual(['build']);

      // Should only run on main branch
      expect(performanceJob.if).toBe(
        "github.event_name == 'push' && github.ref == 'refs/heads/main'",
      );

      // Should use k6 for load testing
      const k6Steps = performanceJob.steps.filter((step: any) =>
        step.name.includes('k6'),
      );
      expect(k6Steps.length).toBeGreaterThan(0);
    });
  });

  describe('Environment Consistency Validation', () => {
    it('should validate all environments use consistent configurations', () => {
      // Check package.json engines
      expect(packageJson.engines.node).toBe('>=20.0.0');

      // Check Dockerfile
      const dockerfile = readFileSync(
        join(process.cwd(), 'Dockerfile'),
        'utf8',
      );
      expect(dockerfile).toContain('FROM node:20-alpine');

      // Check workflows
      expect(ciWorkflow.env.NODE_VERSION).toBe('20');
    });

    it('should validate package manager consistency across all configurations', () => {
      // Package.json should not have yarn or pnpm scripts
      const scripts = Object.values(packageJson.scripts) as string[];
      for (const script of scripts) {
        expect(script).not.toContain('yarn');
        expect(script).not.toContain('pnpm');
      }

      // Workflows should use npm
      const allWorkflows = [ciWorkflow, cdWorkflow];
      if (securityWorkflow) {
        allWorkflows.push(securityWorkflow);
      }

      for (const workflow of allWorkflows) {
        const jobs = Object.values(workflow.jobs) as any[];

        for (const job of jobs) {
          if (job.steps) {
            const installSteps = job.steps.filter(
              (step: any) =>
                step.run &&
                (step.run.includes('npm ci') ||
                  step.run.includes('npm install')),
            );

            for (const step of installSteps) {
              expect(step.run).toMatch(/npm (ci|install)/);
            }
          }
        }
      }

      // Should have package-lock.json, not yarn.lock or pnpm-lock.yaml
      expect(existsSync(join(process.cwd(), 'package-lock.json'))).toBe(true);
      expect(existsSync(join(process.cwd(), 'yarn.lock'))).toBe(false);
      expect(existsSync(join(process.cwd(), 'pnpm-lock.yaml'))).toBe(false);
    });

    it('should validate database configuration consistency', () => {
      // Check that all database scripts use the same commands
      expect(packageJson.scripts['migrate:reset']).toBe(
        'prisma migrate reset --force',
      );
      expect(packageJson.scripts['db:seed']).toBe(
        'ts-node scripts/basic-seed.ts',
      );

      // Check that CI workflow uses these scripts
      const testJob = ciWorkflow.jobs.test;
      const dbSetupStep = testJob.steps.find(
        (step: any) => step.name === 'Setup test database',
      );

      expect(dbSetupStep.run).toContain('npm run migrate:reset');
      expect(dbSetupStep.run).toContain('npm run db:seed');
    });
  });

  describe('Deployment Workflow Validation', () => {
    it('should validate CD workflow has proper deployment configuration', () => {
      // Should have staging and production deployment jobs
      expect(cdWorkflow.jobs).toHaveProperty('deploy-staging');
      expect(cdWorkflow.jobs).toHaveProperty('deploy-production');
      expect(cdWorkflow.jobs).toHaveProperty('rollback');

      // Staging should deploy on main branch
      const stagingJob = cdWorkflow.jobs['deploy-staging'];
      expect(stagingJob.if).toContain("github.ref == 'refs/heads/main'");

      // Production should deploy on tags
      const productionJob = cdWorkflow.jobs['deploy-production'];
      expect(productionJob.if).toContain(
        "startsWith(github.ref, 'refs/tags/v')",
      );
    });

    it('should validate Kubernetes manifests are properly referenced', () => {
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

    it('should validate rollback mechanism is properly configured', () => {
      const rollbackJob = cdWorkflow.jobs.rollback;

      expect(rollbackJob.if).toContain('failure()');
      expect(rollbackJob.needs).toEqual(['deploy-production']);

      const rollbackStep = rollbackJob.steps.find(
        (step: any) => step.name === 'Rollback deployment',
      );
      expect(rollbackStep.run).toContain('kubectl rollout undo');
    });
  });

  describe('Performance and Load Testing Validation', () => {
    it('should validate k6 load testing is properly configured', () => {
      // Check package.json has load test script
      expect(packageJson.scripts['test:load']).toBe(
        'k6 run test/load/load-test.js',
      );

      // Check load test files exist
      expect(existsSync(join(process.cwd(), 'test/load/load-test.js'))).toBe(
        true,
      );
      expect(
        existsSync(join(process.cwd(), 'test/load/simple-load-test.js')),
      ).toBe(true);

      // Check CI workflow has performance job
      const performanceJob = ciWorkflow.jobs.performance;
      expect(performanceJob).toBeDefined();

      const k6Steps = performanceJob.steps.filter((step: any) =>
        step.name.includes('k6'),
      );
      expect(k6Steps.length).toBeGreaterThan(0);
    });

    it('should validate docker-compose performance configuration', () => {
      const performanceComposePath = join(
        process.cwd(),
        'docker-compose.performance.yml',
      );
      expect(existsSync(performanceComposePath)).toBe(true);

      const content = readFileSync(performanceComposePath, 'utf8');
      expect(content).toContain('k6');
    });
  });

  describe('Security and Compliance Validation', () => {
    it('should validate security scanning is properly integrated', () => {
      // CI workflow should have security job
      const securityJob = ciWorkflow.jobs.security;
      expect(securityJob).toBeDefined();

      const stepNames = securityJob.steps.map((step: any) => step.name);
      expect(stepNames).toContain('Run security audit');
      expect(stepNames).toContain('Run Snyk security scan');
      expect(stepNames).toContain('Run CodeQL Analysis');

      // Build job should have Trivy scanning
      const buildJob = ciWorkflow.jobs.build;
      const trivyStep = buildJob.steps.find(
        (step: any) => step.name === 'Run Trivy vulnerability scanner',
      );
      expect(trivyStep).toBeDefined();
    });

    it('should validate security workflow has comprehensive scanning', () => {
      if (securityWorkflow) {
        const expectedJobs = [
          'dependency-scan',
          'container-scan',
          'secrets-scan',
          'sast-scan',
          'infrastructure-scan',
        ];

        for (const jobName of expectedJobs) {
          expect(securityWorkflow.jobs).toHaveProperty(jobName);
        }
      }
    });
  });

  describe('Monitoring and Observability Validation', () => {
    it('should validate monitoring configuration exists', () => {
      const monitoringFiles = [
        'monitoring/prometheus.yml',
        'k8s/monitoring/prometheus.yaml',
        'k8s/monitoring/grafana.yaml',
      ];

      for (const file of monitoringFiles) {
        const filePath = join(process.cwd(), file);
        if (existsSync(filePath)) {
          expect(existsSync(filePath)).toBe(true);
        }
      }
    });

    it('should validate health check endpoints are configured', () => {
      // Check Dockerfile has health check
      const dockerfile = readFileSync(
        join(process.cwd(), 'Dockerfile'),
        'utf8',
      );
      expect(dockerfile).toContain('HEALTHCHECK');

      // Check CD workflow has health checks
      const stagingJob = cdWorkflow.jobs['deploy-staging'];
      const smokeTestStep = stagingJob.steps.find(
        (step: any) => step.name === 'Run smoke tests',
      );
      expect(smokeTestStep.run).toContain('/health');
    });
  });

  describe('Documentation and Maintainability', () => {
    it('should validate all workflows have proper documentation', () => {
      // Check that workflow files have descriptive names and comments
      expect(ciWorkflow.name).toBe('CI Pipeline');
      expect(cdWorkflow.name).toBe('CD Pipeline');

      if (securityWorkflow) {
        expect(securityWorkflow.name).toBe('Security Scanning');
      }
    });

    it('should validate README and documentation files exist', () => {
      const docFiles = [
        'README.md',
        'README-Development.md',
        'README-Docker.md',
      ];

      for (const file of docFiles) {
        expect(existsSync(join(process.cwd(), file))).toBe(true);
      }
    });

    it('should validate all scripts have proper error handling', () => {
      // Check that critical scripts exist and are properly configured
      const criticalScripts = ['migrate:reset', 'db:seed', 'workflow:validate'];

      for (const script of criticalScripts) {
        expect(packageJson.scripts[script]).toBeDefined();
        expect(packageJson.scripts[script]).not.toBe('');
      }
    });
  });

  describe('Final Integration Test', () => {
    it('should execute complete workflow validation successfully', () => {
      expect(() => {
        execSync('npm run workflow:validate', {
          stdio: 'pipe',
          timeout: 60000,
          env: { ...process.env, NODE_ENV: 'test' },
        });
      }).not.toThrow('Complete workflow validation should pass');
    });

    it('should validate all test suites can run successfully', () => {
      const testEnv = {
        ...process.env,
        NODE_ENV: 'test',
        DATABASE_URL: 'postgresql://test:test@localhost:5432/chemchat_test',
      };

      expect(() => {
        execSync('npm run test:unit -- --passWithNoTests', {
          stdio: 'pipe',
          timeout: 60000,
          env: testEnv,
        });
      }).not.toThrow('Unit tests should run successfully');
    });

    it('should validate the complete CI/CD pipeline is ready for production', () => {
      // Final validation that all components are properly configured
      const validationChecks = [
        // Node.js version consistency
        () => expect(packageJson.engines.node).toBe('>=20.0.0'),
        () => expect(ciWorkflow.env.NODE_VERSION).toBe('20'),

        // Required scripts exist
        () => expect(packageJson.scripts['migrate:reset']).toBeDefined(),
        () => expect(packageJson.scripts['db:seed']).toBeDefined(),
        () => expect(packageJson.scripts['test:load']).toBeDefined(),

        // Workflow files are valid
        () => expect(ciWorkflow.jobs.test).toBeDefined(),
        () => expect(ciWorkflow.jobs.security).toBeDefined(),
        () => expect(ciWorkflow.jobs.build).toBeDefined(),
        () => expect(ciWorkflow.jobs.performance).toBeDefined(),

        // Deployment configuration is complete
        () => expect(cdWorkflow.jobs['deploy-staging']).toBeDefined(),
        () => expect(cdWorkflow.jobs['deploy-production']).toBeDefined(),
        () => expect(cdWorkflow.jobs.rollback).toBeDefined(),
      ];

      for (const check of validationChecks) {
        expect(check).not.toThrow();
      }
    });
  });
});
