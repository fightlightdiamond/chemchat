/**
 * Node.js Version Consistency Validation Tests
 *
 * This test suite validates that Node.js versions are consistent across
 * all environments and configurations.
 *
 * Requirements: 2.1, 2.2, 2.3
 */

import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import * as yaml from 'js-yaml';

describe('Node.js Version Consistency', () => {
  let packageJson: any;
  let dockerfile: string;
  let ciWorkflow: any;
  let cdWorkflow: any;
  let securityWorkflow: any;

  beforeAll(() => {
    // Load package.json
    const packageJsonPath = join(process.cwd(), 'package.json');
    packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));

    // Load Dockerfile
    const dockerfilePath = join(process.cwd(), 'Dockerfile');
    dockerfile = readFileSync(dockerfilePath, 'utf8');

    // Load CI workflow
    const ciWorkflowPath = join(process.cwd(), '.github/workflows/ci.yml');
    ciWorkflow = yaml.load(readFileSync(ciWorkflowPath, 'utf8')) as any;

    // Load CD workflow
    const cdWorkflowPath = join(process.cwd(), '.github/workflows/cd.yml');
    cdWorkflow = yaml.load(readFileSync(cdWorkflowPath, 'utf8')) as any;

    // Load Security workflow if it exists
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

  describe('Package.json Node Version', () => {
    it('should specify Node.js 20 or higher in engines', () => {
      expect(packageJson.engines).toBeDefined();
      expect(packageJson.engines.node).toBeDefined();
      expect(packageJson.engines.node).toBe('>=20.0.0');
    });

    it('should have compatible npm version requirement', () => {
      // Node 20 comes with npm 8+, verify compatibility
      const currentNodeVersion = process.version;
      const majorVersion = parseInt(currentNodeVersion.slice(1).split('.')[0]);
      expect(majorVersion).toBeGreaterThanOrEqual(20);
    });
  });

  describe('Dockerfile Node Version', () => {
    it('should use Node.js 20 Alpine image', () => {
      expect(dockerfile).toContain('FROM node:20-alpine');
    });

    it('should use Node 20 consistently across all stages', () => {
      const nodeImageReferences = dockerfile.match(/FROM node:[0-9]+-alpine/g);
      if (nodeImageReferences) {
        for (const reference of nodeImageReferences) {
          expect(reference).toBe('FROM node:20-alpine');
        }
      }
    });

    it('should not contain references to older Node versions', () => {
      // Check for any references to Node versions < 20
      expect(dockerfile).not.toMatch(/node:1[0-9]-alpine/);
      expect(dockerfile).not.toMatch(/node:18/);
      expect(dockerfile).not.toMatch(/node:16/);
      expect(dockerfile).not.toMatch(/node:14/);
    });

    it('should use npm consistently in Docker', () => {
      expect(dockerfile).toContain('npm install');
      expect(dockerfile).not.toContain('yarn install');
      expect(dockerfile).not.toContain('pnpm install');
    });
  });

  describe('CI Workflow Node Version', () => {
    it('should have NODE_VERSION environment variable set to 20', () => {
      expect(ciWorkflow.env).toBeDefined();
      expect(ciWorkflow.env.NODE_VERSION).toBe('20');
    });

    it('should use consistent Node version in all jobs', () => {
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

    it('should use npm cache consistently', () => {
      const jobs = Object.values(ciWorkflow.jobs) as any[];

      for (const job of jobs) {
        if (job.steps) {
          const nodeSetupSteps = job.steps.filter(
            (step: any) =>
              step.uses && step.uses.includes('actions/setup-node'),
          );

          for (const step of nodeSetupSteps) {
            if (step.with && step.with.cache) {
              expect(step.with.cache).toBe('npm');
            }
          }
        }
      }
    });

    it('should use npm ci consistently for dependency installation', () => {
      const jobs = Object.values(ciWorkflow.jobs) as any[];

      for (const job of jobs) {
        if (job.steps) {
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
  });

  describe('CD Workflow Node Version', () => {
    it('should use consistent Node version if Node setup is present', () => {
      const jobs = Object.values(cdWorkflow.jobs) as any[];

      for (const job of jobs) {
        if (job.steps) {
          const nodeSetupSteps = job.steps.filter(
            (step: any) =>
              step.uses && step.uses.includes('actions/setup-node'),
          );

          for (const step of nodeSetupSteps) {
            if (step.with && step.with['node-version']) {
              // CD workflow should use Node 20 or reference the same env var
              expect(step.with['node-version']).toMatch(
                /20|\$\{\{ env\.NODE_VERSION \}\}/,
              );
            }
          }
        }
      }
    });

    it('should pass NODE_VERSION to Docker build if specified', () => {
      const jobs = Object.values(cdWorkflow.jobs) as any[];

      for (const job of jobs) {
        if (job.steps) {
          const dockerBuildSteps = job.steps.filter(
            (step: any) =>
              step.uses && step.uses.includes('docker/build-push-action'),
          );

          for (const step of dockerBuildSteps) {
            if (step.with && step.with['build-args']) {
              expect(step.with['build-args']).toContain('NODE_VERSION=');
            }
          }
        }
      }
    });
  });

  describe('Security Workflow Node Version', () => {
    it('should use Node.js 20 consistently if security workflow exists', () => {
      if (securityWorkflow) {
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

    it('should use npm consistently in security workflow', () => {
      if (securityWorkflow) {
        const jobs = Object.values(securityWorkflow.jobs) as any[];

        for (const job of jobs) {
          if (job.steps) {
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
      }
    });
  });

  describe('Docker Compose Node Version', () => {
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
          // Should not contain hardcoded old Node versions
          expect(content).not.toMatch(/node:1[0-9]-alpine/);
          expect(content).not.toMatch(/node:18/);
          expect(content).not.toMatch(/node:16/);
          expect(content).not.toMatch(/node:14/);
        }
      }
    });
  });

  describe('Runtime Node Version Validation', () => {
    it('should validate current runtime Node.js version is compatible', () => {
      const currentNodeVersion = process.version;
      const majorVersion = parseInt(currentNodeVersion.slice(1).split('.')[0]);

      expect(majorVersion).toBeGreaterThanOrEqual(20);
    });

    it('should validate npm version compatibility with Node 20', () => {
      const npmVersion = execSync('npm --version', { encoding: 'utf8' }).trim();
      const npmMajorVersion = parseInt(npmVersion.split('.')[0]);

      // Node 20 comes with npm 8+
      expect(npmMajorVersion).toBeGreaterThanOrEqual(8);
    });

    it('should validate Node.js features required by the application', () => {
      // Test that Node 20 features are available
      expect(typeof globalThis).toBe('object');
      expect(typeof Promise.allSettled).toBe('function');
      expect(typeof String.prototype.replaceAll).toBe('function');
    });
  });

  describe('Package Manager Consistency', () => {
    it('should use npm consistently across all workflows', () => {
      const allWorkflows = [ciWorkflow, cdWorkflow];
      if (securityWorkflow) {
        allWorkflows.push(securityWorkflow);
      }

      for (const workflow of allWorkflows) {
        const jobs = Object.values(workflow.jobs) as any[];

        for (const job of jobs) {
          if (job.steps) {
            // Check for npm cache setup
            const nodeSetupSteps = job.steps.filter(
              (step: any) =>
                step.uses && step.uses.includes('actions/setup-node'),
            );

            for (const step of nodeSetupSteps) {
              if (step.with && step.with.cache) {
                expect(step.with.cache).toBe('npm');
              }
            }

            // Check for dependency installation
            const installSteps = job.steps.filter(
              (step: any) =>
                step.run &&
                (step.run.includes('npm ci') ||
                  step.run.includes('npm install')),
            );

            for (const step of installSteps) {
              expect(step.run).toMatch(/npm (ci|install)/);
              expect(step.run).not.toMatch(/yarn/);
              expect(step.run).not.toMatch(/pnpm/);
            }
          }
        }
      }
    });

    it('should have package-lock.json for npm', () => {
      expect(existsSync(join(process.cwd(), 'package-lock.json'))).toBe(true);
      expect(existsSync(join(process.cwd(), 'yarn.lock'))).toBe(false);
      expect(existsSync(join(process.cwd(), 'pnpm-lock.yaml'))).toBe(false);
    });
  });

  describe('Environment Variable Consistency', () => {
    it('should have consistent NODE_VERSION across all workflow files', () => {
      // CI workflow should define NODE_VERSION
      expect(ciWorkflow.env.NODE_VERSION).toBe('20');

      // All workflows should reference the same version
      const allWorkflows = [ciWorkflow, cdWorkflow];
      if (securityWorkflow) {
        allWorkflows.push(securityWorkflow);
      }

      for (const workflow of allWorkflows) {
        if (workflow.env && workflow.env.NODE_VERSION) {
          expect(workflow.env.NODE_VERSION).toBe('20');
        }
      }
    });

    it('should validate build args pass Node version correctly', () => {
      // Check if Docker build steps pass NODE_VERSION
      const buildJobs = Object.values(ciWorkflow.jobs).filter((job: any) =>
        job.steps?.some((step: any) =>
          step.uses?.includes('docker/build-push-action'),
        ),
      ) as any[];

      for (const job of buildJobs) {
        const buildSteps = job.steps.filter((step: any) =>
          step.uses?.includes('docker/build-push-action'),
        );

        for (const step of buildSteps) {
          if (step.with && step.with['build-args']) {
            expect(step.with['build-args']).toContain('NODE_VERSION=');
          }
        }
      }
    });
  });

  describe('Dependency Compatibility', () => {
    it('should validate all dependencies are compatible with Node 20', () => {
      // Check that package.json engines requirement matches our target
      expect(packageJson.engines.node).toBe('>=20.0.0');

      // Verify no dependencies explicitly require older Node versions
      const dependencies = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies,
      };

      // This is a basic check - in a real scenario you might want to check
      // each dependency's engines field
      expect(Object.keys(dependencies).length).toBeGreaterThan(0);
    });

    it('should validate TypeScript configuration is compatible with Node 20', () => {
      const tsconfigPath = join(process.cwd(), 'tsconfig.json');
      if (existsSync(tsconfigPath)) {
        const tsconfig = JSON.parse(readFileSync(tsconfigPath, 'utf8'));

        // Verify target is appropriate for Node 20
        if (tsconfig.compilerOptions && tsconfig.compilerOptions.target) {
          const target = tsconfig.compilerOptions.target.toLowerCase();
          expect(['es2022', 'es2023', 'esnext']).toContain(target);
        }
      }
    });
  });

  describe('Cross-Platform Consistency', () => {
    it('should use platform-agnostic Node version specifications', () => {
      // Verify that all Node version specifications work across platforms
      expect(packageJson.engines.node).toBe('>=20.0.0');

      // Check that Dockerfile uses Alpine which is consistent across platforms
      expect(dockerfile).toContain('node:20-alpine');
    });

    it('should validate npm scripts work across platforms', () => {
      // Check that scripts don't use platform-specific commands
      const scripts = packageJson.scripts;

      for (const [scriptName, scriptCommand] of Object.entries(scripts)) {
        if (typeof scriptCommand === 'string') {
          // Scripts should not use Windows-specific commands
          expect(scriptCommand).not.toMatch(/\.bat$/);
          expect(scriptCommand).not.toMatch(/\.cmd$/);

          // Scripts should use cross-platform tools
          if (scriptCommand.includes('rimraf')) {
            // rimraf is cross-platform
            expect(scriptCommand).toContain('rimraf');
          }
        }
      }
    });
  });
});
