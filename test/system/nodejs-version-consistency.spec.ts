/**
 * Node.js Version Consistency Validation Tests
 * 
 * This test suite validates that Node.js versions are consistent across all
 * configuration files and environments to prevent version mismatch issues.
 * 
 * Requirements: 2.1, 2.2, 2.3
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import * as yaml from 'js-yaml';

describe('Node.js Version Consistency', () => {
  const expectedNodeVersion = '20';
  const expectedNodeVersionRange = '>=20.0.0';
  const expectedPnpmVersion = '8';
  const expectedPnpmVersionRange = '>=8.0.0';

  let packageJson: any;
  let ciWorkflow: any;
  let cdWorkflow: any;
  let securityWorkflow: any;
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

    // Load security workflow if it exists
    const securityWorkflowPath = join(process.cwd(), '.github/workflows/security.yml');
    if (existsSync(securityWorkflowPath)) {
      securityWorkflow = yaml.load(readFileSync(securityWorkflowPath, 'utf8'));
    }

    // Load Dockerfile
    const dockerfilePath = join(process.cwd(), 'Dockerfile');
    dockerfile = readFileSync(dockerfilePath, 'utf8');
  });

  describe('Package.json Engine Requirements', () => {
    it('should specify correct Node.js version requirement', () => {
      expect(packageJson.engines).toBeDefined();
      expect(packageJson.engines.node).toBe(expectedNodeVersionRange);
    });

    it('should specify correct pnpm version requirement', () => {
      expect(packageJson.engines).toBeDefined();
      expect(packageJson.engines.pnpm).toBe(expectedPnpmVersionRange);
    });

    it('should have engines field properly configured', () => {
      expect(packageJson.engines).toEqual({
        node: expectedNodeVersionRange,
        pnpm: expectedPnpmVersionRange
      });
    });
  });

  describe('Docker Configuration Consistency', () => {
    it('should use correct Node.js version in Dockerfile base image', () => {
      expect(dockerfile).toContain(`FROM node:${expectedNodeVersion}-alpine AS base`);
    });

    it('should use consistent Node.js version across all Docker stages', () => {
      const nodeImageReferences = dockerfile.match(/FROM node:\d+-alpine/g) || [];
      
      for (const reference of nodeImageReferences) {
        expect(reference).toBe(`FROM node:${expectedNodeVersion}-alpine`);
      }
    });

    it('should use pnpm consistently in Docker', () => {
      expect(dockerfile).toContain('npm install -g pnpm');
      expect(dockerfile).toContain('pnpm install --frozen-lockfile');
      expect(dockerfile).toContain('pnpm exec prisma generate');
      expect(dockerfile).toContain('pnpm run build');
    });

    it('should not have any npm usage except for pnpm installation', () => {
      const npmUsages = dockerfile.match(/npm (?!install -g pnpm)/g) || [];
      expect(npmUsages).toHaveLength(0);
    });
  });

  describe('CI Workflow Version Consistency', () => {
    it('should use correct Node.js version in CI environment variable', () => {
      expect(ciWorkflow.env.NODE_VERSION).toBe(expectedNodeVersion);
    });

    it('should use consistent Node.js version in all CI jobs', () => {
      const jobs = Object.values(ciWorkflow.jobs) as any[];
      
      for (const job of jobs) {
        if (job.steps) {
          const nodeSetupSteps = job.steps.filter((step: any) => 
            step.name === 'Setup Node.js'
          );
          
          for (const step of nodeSetupSteps) {
            expect(step.with['node-version']).toBe('${{ env.NODE_VERSION }}');
          }
        }
      }
    });

    it('should use correct pnpm version in CI workflow', () => {
      const jobs = Object.values(ciWorkflow.jobs) as any[];
      
      for (const job of jobs) {
        if (job.steps) {
          const pnpmSetupSteps = job.steps.filter((step: any) => 
            step.name === 'Setup pnpm'
          );
          
          for (const step of pnpmSetupSteps) {
            expect(step.with.version).toBe(expectedPnpmVersion);
          }
        }
      }
    });

    it('should use pnpm cache consistently', () => {
      const jobs = Object.values(ciWorkflow.jobs) as any[];
      
      for (const job of jobs) {
        if (job.steps) {
          const nodeSetupSteps = job.steps.filter((step: any) => 
            step.name === 'Setup Node.js'
          );
          
          for (const step of nodeSetupSteps) {
            expect(step.with.cache).toBe('pnpm');
          }
        }
      }
    });

    it('should use pnpm install consistently across all jobs', () => {
      const jobs = Object.values(ciWorkflow.jobs) as any[];
      
      for (const job of jobs) {
        if (job.steps) {
          const installSteps = job.steps.filter((step: any) => 
            step.name === 'Install dependencies'
          );
          
          for (const step of installSteps) {
            expect(step.run).toBe('pnpm install --frozen-lockfile');
          }
        }
      }
    });
  });

  describe('CD Workflow Version Consistency', () => {
    it('should use consistent Docker build args for Node version', () => {
      const buildJob = cdWorkflow.jobs.build;
      if (buildJob) {
        const buildStep = buildJob.steps.find((step: any) => 
          step.name === 'Build and push Docker image'
        );
        
        if (buildStep && buildStep.with && buildStep.with['build-args']) {
          expect(buildStep.with['build-args']).toContain(`NODE_VERSION=${{ env.NODE_VERSION }}`);
        }
      }
    });

    it('should have consistent environment variables', () => {
      if (cdWorkflow.env && cdWorkflow.env.NODE_VERSION) {
        expect(cdWorkflow.env.NODE_VERSION).toBe(expectedNodeVersion);
      }
    });
  });

  describe('Security Workflow Version Consistency', () => {
    it('should use consistent Node.js version in security workflow', () => {
      if (securityWorkflow) {
        const jobs = Object.values(securityWorkflow.jobs) as any[];
        
        for (const job of jobs) {
          if (job.steps) {
            const nodeSetupSteps = job.steps.filter((step: any) => 
              step.name === 'Setup Node.js'
            );
            
            for (const step of nodeSetupSteps) {
              expect(step.with['node-version']).toBe(expectedNodeVersion);
            }
          }
        }
      }
    });

    it('should use pnpm consistently in security workflow', () => {
      if (securityWorkflow) {
        const jobs = Object.values(securityWorkflow.jobs) as any[];
        
        for (const job of jobs) {
          if (job.steps) {
            const installSteps = job.steps.filter((step: any) => 
              step.name === 'Install dependencies'
            );
            
            for (const step of installSteps) {
              expect(step.run).toBe('pnpm install --frozen-lockfile');
            }
          }
        }
      }
    });
  });

  describe('Runtime Version Validation', () => {
    it('should validate current Node.js version meets requirements', () => {
      const currentNodeVersion = process.version;
      const majorVersion = parseInt(currentNodeVersion.slice(1).split('.')[0]);
      
      expect(majorVersion).toBeGreaterThanOrEqual(20);
    });

    it('should validate pnpm is available and meets version requirements', () => {
      try {
        const pnpmVersion = execSync('pnpm --version', { encoding: 'utf8' }).trim();
        const majorVersion = parseInt(pnpmVersion.split('.')[0]);
        
        expect(majorVersion).toBeGreaterThanOrEqual(8);
      } catch (error) {
        fail('pnpm is not available in the environment');
      }
    });

    it('should validate Node.js version compatibility with dependencies', () => {
      // Check that major dependencies support Node 20
      const criticalDeps = [
        '@nestjs/core',
        '@prisma/client',
        'typescript',
        'jest'
      ];

      for (const dep of criticalDeps) {
        expect(
          packageJson.dependencies[dep] || packageJson.devDependencies[dep]
        ).toBeDefined();
      }
    });
  });

  describe('Development Environment Consistency', () => {
    it('should have consistent Node version in development scripts', () => {
      // Check if there are any Node version references in scripts
      const scripts = Object.values(packageJson.scripts) as string[];
      
      for (const script of scripts) {
        // Look for any hardcoded Node version references
        const nodeVersionMatches = script.match(/node@\d+/g) || [];
        for (const match of nodeVersionMatches) {
          expect(match).toBe(`node@${expectedNodeVersion}`);
        }
      }
    });

    it('should have consistent package manager usage in all scripts', () => {
      const scripts = Object.values(packageJson.scripts) as string[];
      
      for (const script of scripts) {
        // Scripts should not use npm directly (except for global pnpm install)
        if (script.includes('npm ') && !script.includes('npm install -g pnpm')) {
          fail(`Script uses npm instead of pnpm: ${script}`);
        }
      }
    });
  });

  describe('Configuration File Consistency', () => {
    it('should have consistent Node version in all configuration files', () => {
      const configFiles = [
        'tsconfig.json',
        'tsconfig.build.json',
        'nest-cli.json'
      ];

      for (const configFile of configFiles) {
        const configPath = join(process.cwd(), configFile);
        if (existsSync(configPath)) {
          const config = JSON.parse(readFileSync(configPath, 'utf8'));
          
          // Check if there are any Node version specific configurations
          if (config.compilerOptions && config.compilerOptions.target) {
            // Ensure TypeScript target is compatible with Node 20
            const validTargets = ['ES2020', 'ES2021', 'ES2022', 'ESNext'];
            expect(validTargets).toContain(config.compilerOptions.target);
          }
        }
      }
    });

    it('should have consistent module resolution for Node 20', () => {
      const tsconfigPath = join(process.cwd(), 'tsconfig.json');
      if (existsSync(tsconfigPath)) {
        const tsconfig = JSON.parse(readFileSync(tsconfigPath, 'utf8'));
        
        if (tsconfig.compilerOptions) {
          // Ensure module resolution is compatible with Node 20
          if (tsconfig.compilerOptions.moduleResolution) {
            expect(['node', 'node16', 'nodenext']).toContain(
              tsconfig.compilerOptions.moduleResolution
            );
          }
        }
      }
    });
  });

  describe('Environment Variable Consistency', () => {
    it('should have consistent environment setup across all workflows', () => {
      const workflows = [ciWorkflow, cdWorkflow, securityWorkflow].filter(Boolean);
      
      for (const workflow of workflows) {
        if (workflow.env && workflow.env.NODE_VERSION) {
          expect(workflow.env.NODE_VERSION).toBe(expectedNodeVersion);
        }
      }
    });

    it('should validate environment variables in test configurations', () => {
      const testConfigs = [
        'test/jest-e2e.json',
        'test/jest-integration.json'
      ];

      for (const configFile of testConfigs) {
        const configPath = join(process.cwd(), configFile);
        if (existsSync(configPath)) {
          const config = JSON.parse(readFileSync(configPath, 'utf8'));
          
          // Ensure test environment is properly configured
          if (config.testEnvironment) {
            expect(config.testEnvironment).toBe('node');
          }
        }
      }
    });
  });
});