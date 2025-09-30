#!/usr/bin/env ts-node

/**
 * Script to validate Node.js version consistency across all environments
 *
 * This script addresses task 8 requirement:
 * - Create validation for Node.js version consistency across environments
 */

import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import * as yaml from 'js-yaml';

interface VersionCheckResult {
  location: string;
  expectedVersion: string;
  actualVersion: string;
  success: boolean;
  error?: string;
}

class NodeVersionValidator {
  private readonly expectedNodeVersion = '20';
  private readonly expectedNodeEngineVersion = '>=20.0.0';
  private results: VersionCheckResult[] = [];

  async validateAllVersions(): Promise<void> {
    console.log(
      '🔍 Validating Node.js version consistency across all environments...\n',
    );

    // Validate package.json engines
    this.validatePackageJsonEngines();

    // Validate Dockerfile
    this.validateDockerfile();

    // Validate CI workflow
    this.validateCIWorkflow();

    // Validate CD workflow
    this.validateCDWorkflow();

    // Validate security workflow if exists
    this.validateSecurityWorkflow();

    // Validate docker-compose files
    this.validateDockerComposeFiles();

    // Validate runtime version
    this.validateRuntimeVersion();

    // Validate npm version compatibility
    this.validateNpmVersion();

    // Validate package manager consistency
    this.validatePackageManagerConsistency();
  }

  private validatePackageJsonEngines(): void {
    try {
      const packageJsonPath = join(process.cwd(), 'package.json');
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));

      if (!packageJson.engines || !packageJson.engines.node) {
        throw new Error('Node.js version not specified in engines');
      }

      const nodeVersion = packageJson.engines.node;
      const success = nodeVersion === this.expectedNodeEngineVersion;

      this.results.push({
        location: 'package.json engines.node',
        expectedVersion: this.expectedNodeEngineVersion,
        actualVersion: nodeVersion,
        success,
        error: success
          ? undefined
          : `Expected ${this.expectedNodeEngineVersion}, got ${nodeVersion}`,
      });

      console.log(
        `${success ? '✅' : '❌'} package.json engines.node: ${nodeVersion}`,
      );
    } catch (error) {
      this.results.push({
        location: 'package.json engines.node',
        expectedVersion: this.expectedNodeEngineVersion,
        actualVersion: 'not found',
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });

      console.log(
        `❌ package.json engines.node: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private validateDockerfile(): void {
    try {
      const dockerfilePath = join(process.cwd(), 'Dockerfile');
      const dockerfile = readFileSync(dockerfilePath, 'utf8');

      const expectedImage = `FROM node:${this.expectedNodeVersion}-alpine`;
      const hasCorrectVersion = dockerfile.includes(expectedImage);

      // Check for any old Node versions
      const hasOldVersions =
        /node:1[0-9]-alpine/.test(dockerfile) ||
        /node:18/.test(dockerfile) ||
        /node:16/.test(dockerfile);

      const success = hasCorrectVersion && !hasOldVersions;

      this.results.push({
        location: 'Dockerfile',
        expectedVersion: `node:${this.expectedNodeVersion}-alpine`,
        actualVersion: hasCorrectVersion
          ? `node:${this.expectedNodeVersion}-alpine`
          : 'incorrect version found',
        success,
        error: success
          ? undefined
          : 'Dockerfile does not use Node.js 20 consistently',
      });

      console.log(
        `${success ? '✅' : '❌'} Dockerfile: ${hasCorrectVersion ? 'Node 20' : 'incorrect Node version'}`,
      );
    } catch (error) {
      this.results.push({
        location: 'Dockerfile',
        expectedVersion: `node:${this.expectedNodeVersion}-alpine`,
        actualVersion: 'not found',
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });

      console.log(
        `❌ Dockerfile: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private validateCIWorkflow(): void {
    try {
      const ciWorkflowPath = join(process.cwd(), '.github/workflows/ci.yml');
      const ciWorkflow = yaml.load(readFileSync(ciWorkflowPath, 'utf8')) as any;

      // Check environment variable
      const envNodeVersion = ciWorkflow.env?.NODE_VERSION;
      const envSuccess = envNodeVersion === this.expectedNodeVersion;

      this.results.push({
        location: 'CI workflow env.NODE_VERSION',
        expectedVersion: this.expectedNodeVersion,
        actualVersion: envNodeVersion || 'not set',
        success: envSuccess,
        error: envSuccess
          ? undefined
          : `Expected ${this.expectedNodeVersion}, got ${envNodeVersion}`,
      });

      console.log(
        `${envSuccess ? '✅' : '❌'} CI workflow env.NODE_VERSION: ${envNodeVersion || 'not set'}`,
      );

      // Check all jobs use the same Node version
      const jobs = Object.values(ciWorkflow.jobs) as any[];
      let allJobsConsistent = true;

      for (const job of jobs) {
        if (job.steps) {
          const nodeSetupSteps = job.steps.filter(
            (step: any) =>
              step.uses && step.uses.includes('actions/setup-node'),
          );

          for (const step of nodeSetupSteps) {
            if (step.with && step.with['node-version']) {
              const nodeVersion = step.with['node-version'];
              const isCorrect =
                nodeVersion === '${{ env.NODE_VERSION }}' ||
                nodeVersion === this.expectedNodeVersion;

              if (!isCorrect) {
                allJobsConsistent = false;
                console.log(
                  `❌ CI job uses incorrect Node version: ${nodeVersion}`,
                );
              }
            }
          }
        }
      }

      if (allJobsConsistent) {
        console.log('✅ All CI jobs use consistent Node version');
      }

      this.results.push({
        location: 'CI workflow jobs',
        expectedVersion: '${{ env.NODE_VERSION }}',
        actualVersion: allJobsConsistent ? 'consistent' : 'inconsistent',
        success: allJobsConsistent,
        error: allJobsConsistent
          ? undefined
          : 'Some jobs use inconsistent Node versions',
      });
    } catch (error) {
      this.results.push({
        location: 'CI workflow',
        expectedVersion: this.expectedNodeVersion,
        actualVersion: 'not found',
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });

      console.log(
        `❌ CI workflow: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private validateCDWorkflow(): void {
    try {
      const cdWorkflowPath = join(process.cwd(), '.github/workflows/cd.yml');
      const cdWorkflow = yaml.load(readFileSync(cdWorkflowPath, 'utf8')) as any;

      const jobs = Object.values(cdWorkflow.jobs) as any[];
      let allJobsConsistent = true;

      for (const job of jobs) {
        if (job.steps) {
          const nodeSetupSteps = job.steps.filter(
            (step: any) =>
              step.uses && step.uses.includes('actions/setup-node'),
          );

          for (const step of nodeSetupSteps) {
            if (step.with && step.with['node-version']) {
              const nodeVersion = step.with['node-version'];
              const isCorrect =
                nodeVersion === this.expectedNodeVersion ||
                nodeVersion === '${{ env.NODE_VERSION }}';

              if (!isCorrect) {
                allJobsConsistent = false;
                console.log(
                  `❌ CD job uses incorrect Node version: ${nodeVersion}`,
                );
              }
            }
          }
        }
      }

      this.results.push({
        location: 'CD workflow',
        expectedVersion: this.expectedNodeVersion,
        actualVersion: allJobsConsistent ? 'consistent' : 'inconsistent',
        success: allJobsConsistent,
        error: allJobsConsistent
          ? undefined
          : 'Some CD jobs use inconsistent Node versions',
      });

      console.log(
        `${allJobsConsistent ? '✅' : '❌'} CD workflow: ${allJobsConsistent ? 'consistent' : 'inconsistent'}`,
      );
    } catch (error) {
      this.results.push({
        location: 'CD workflow',
        expectedVersion: this.expectedNodeVersion,
        actualVersion: 'not found',
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });

      console.log(
        `❌ CD workflow: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private validateSecurityWorkflow(): void {
    const securityWorkflowPath = join(
      process.cwd(),
      '.github/workflows/security.yml',
    );

    if (!existsSync(securityWorkflowPath)) {
      console.log('ℹ️  Security workflow not found, skipping validation');
      return;
    }

    try {
      const securityWorkflow = yaml.load(
        readFileSync(securityWorkflowPath, 'utf8'),
      ) as any;

      const jobs = Object.values(securityWorkflow.jobs) as any[];
      let allJobsConsistent = true;

      for (const job of jobs) {
        if (job.steps) {
          const nodeSetupSteps = job.steps.filter(
            (step: any) =>
              step.uses && step.uses.includes('actions/setup-node'),
          );

          for (const step of nodeSetupSteps) {
            if (step.with && step.with['node-version']) {
              const nodeVersion = step.with['node-version'];
              const isCorrect = nodeVersion === this.expectedNodeVersion;

              if (!isCorrect) {
                allJobsConsistent = false;
                console.log(
                  `❌ Security job uses incorrect Node version: ${nodeVersion}`,
                );
              }
            }
          }
        }
      }

      this.results.push({
        location: 'Security workflow',
        expectedVersion: this.expectedNodeVersion,
        actualVersion: allJobsConsistent ? 'consistent' : 'inconsistent',
        success: allJobsConsistent,
        error: allJobsConsistent
          ? undefined
          : 'Some security jobs use inconsistent Node versions',
      });

      console.log(
        `${allJobsConsistent ? '✅' : '❌'} Security workflow: ${allJobsConsistent ? 'consistent' : 'inconsistent'}`,
      );
    } catch (error) {
      this.results.push({
        location: 'Security workflow',
        expectedVersion: this.expectedNodeVersion,
        actualVersion: 'not found',
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });

      console.log(
        `❌ Security workflow: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private validateDockerComposeFiles(): void {
    const dockerComposeFiles = [
      'docker-compose.yml',
      'docker-compose.performance.yml',
      'docker-compose.workflow-validation.yml',
      'docker-compose.minimal.yml',
    ];

    for (const composeFile of dockerComposeFiles) {
      const composePath = join(process.cwd(), composeFile);

      if (!existsSync(composePath)) {
        console.log(`ℹ️  ${composeFile} not found, skipping validation`);
        continue;
      }

      try {
        const content = readFileSync(composePath, 'utf8');

        // Check for old Node versions
        const hasOldVersions =
          /node:1[0-9]-alpine/.test(content) ||
          /node:18/.test(content) ||
          /node:16/.test(content);

        const success = !hasOldVersions;

        this.results.push({
          location: composeFile,
          expectedVersion: 'no old Node versions',
          actualVersion: hasOldVersions ? 'contains old versions' : 'clean',
          success,
          error: success
            ? undefined
            : 'Contains references to old Node versions',
        });

        console.log(
          `${success ? '✅' : '❌'} ${composeFile}: ${hasOldVersions ? 'contains old Node versions' : 'clean'}`,
        );
      } catch (error) {
        this.results.push({
          location: composeFile,
          expectedVersion: 'no old Node versions',
          actualVersion: 'error reading file',
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });

        console.log(
          `❌ ${composeFile}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  private validateRuntimeVersion(): void {
    try {
      const currentNodeVersion = process.version;
      const majorVersion = parseInt(currentNodeVersion.slice(1).split('.')[0]);
      const success = majorVersion >= 20;

      this.results.push({
        location: 'Runtime Node.js version',
        expectedVersion: '>=20.0.0',
        actualVersion: currentNodeVersion,
        success,
        error: success
          ? undefined
          : `Runtime Node version ${currentNodeVersion} is less than 20`,
      });

      console.log(
        `${success ? '✅' : '❌'} Runtime Node.js version: ${currentNodeVersion}`,
      );
    } catch (error) {
      this.results.push({
        location: 'Runtime Node.js version',
        expectedVersion: '>=20.0.0',
        actualVersion: 'unknown',
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });

      console.log(
        `❌ Runtime Node.js version: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private validateNpmVersion(): void {
    try {
      const npmVersion = execSync('npm --version', { encoding: 'utf8' }).trim();
      const npmMajorVersion = parseInt(npmVersion.split('.')[0]);
      const success = npmMajorVersion >= 8; // Node 20 comes with npm 8+

      this.results.push({
        location: 'npm version',
        expectedVersion: '>=8.0.0',
        actualVersion: npmVersion,
        success,
        error: success
          ? undefined
          : `npm version ${npmVersion} may not be compatible with Node 20`,
      });

      console.log(`${success ? '✅' : '❌'} npm version: ${npmVersion}`);
    } catch (error) {
      this.results.push({
        location: 'npm version',
        expectedVersion: '>=8.0.0',
        actualVersion: 'unknown',
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });

      console.log(
        `❌ npm version: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private validatePackageManagerConsistency(): void {
    try {
      // Check lockfile exists
      const packageLockExists = existsSync(
        join(process.cwd(), 'package-lock.json'),
      );
      const yarnLockExists = existsSync(join(process.cwd(), 'yarn.lock'));
      const pnpmLockExists = existsSync(join(process.cwd(), 'pnpm-lock.yaml'));

      const success = packageLockExists && !yarnLockExists && !pnpmLockExists;

      this.results.push({
        location: 'Package manager lockfiles',
        expectedVersion: 'npm (package-lock.json only)',
        actualVersion: `npm:${packageLockExists}, yarn:${yarnLockExists}, pnpm:${pnpmLockExists}`,
        success,
        error: success
          ? undefined
          : 'Multiple package manager lockfiles found or npm lockfile missing',
      });

      console.log(
        `${success ? '✅' : '❌'} Package manager consistency: ${success ? 'npm only' : 'mixed/missing'}`,
      );
    } catch (error) {
      this.results.push({
        location: 'Package manager lockfiles',
        expectedVersion: 'npm (package-lock.json only)',
        actualVersion: 'unknown',
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });

      console.log(
        `❌ Package manager consistency: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  printSummary(): void {
    console.log('\n📊 Node.js Version Consistency Summary');
    console.log('='.repeat(50));

    const successful = this.results.filter((r) => r.success).length;
    const failed = this.results.filter((r) => !r.success).length;
    const total = this.results.length;

    console.log(`Total checks: ${total}`);
    console.log(`✅ Successful: ${successful}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`Success rate: ${((successful / total) * 100).toFixed(1)}%`);

    if (failed > 0) {
      console.log('\n❌ Failed checks:');
      this.results
        .filter((r) => !r.success)
        .forEach((r) => {
          console.log(`  - ${r.location}: ${r.error}`);
        });
    }

    console.log('\n📋 Detailed Results:');
    this.results.forEach((r) => {
      console.log(
        `  ${r.success ? '✅' : '❌'} ${r.location}: ${r.actualVersion}`,
      );
    });
  }

  getExitCode(): number {
    return this.results.some((r) => !r.success) ? 1 : 0;
  }
}

async function main(): Promise<void> {
  console.log('🚀 Starting Node.js version consistency validation...\n');

  const validator = new NodeVersionValidator();

  try {
    await validator.validateAllVersions();
    validator.printSummary();
    process.exit(validator.getExitCode());
  } catch (error) {
    console.error('💥 Validation failed with error:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('💥 Unexpected error:', error);
    process.exit(1);
  });
}
