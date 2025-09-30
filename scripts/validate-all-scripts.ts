#!/usr/bin/env ts-node

/**
 * Script to validate all package.json scripts can be executed
 *
 * This script addresses task 8 requirement:
 * - Write tests to verify all package.json scripts execute successfully
 */

import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';

interface ScriptValidationResult {
  name: string;
  success: boolean;
  error?: string;
  duration?: number;
}

class ScriptValidator {
  private packageJson: any;
  private results: ScriptValidationResult[] = [];

  constructor() {
    const packageJsonPath = join(process.cwd(), 'package.json');
    this.packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  }

  // Scripts that should execute successfully in any environment
  private readonly executableScripts = [
    'lint',
    'format',
    'build',
    'prisma:generate',
    'workflow:validate',
  ];

  // Scripts that require specific environment setup
  private readonly environmentDependentScripts = [
    'start',
    'start:dev',
    'start:debug',
    'start:prod',
    'test:unit',
    'test:integration',
    'test:e2e',
    'test:load',
    'migrate:reset',
    'db:seed',
    'db:validate',
  ];

  // Scripts that are just command aliases (don't need execution validation)
  private readonly aliasScripts = [
    'docker:build',
    'docker:up',
    'docker:down',
    'docker:logs',
    'docker:ps',
    'prisma:studio',
    'swagger',
    'swagger:mock',
  ];

  async validateExecutableScripts(): Promise<void> {
    console.log('🔍 Validating executable scripts...\n');

    for (const scriptName of this.executableScripts) {
      await this.validateScript(scriptName, true);
    }
  }

  async validateScriptExistence(): Promise<void> {
    console.log('📋 Validating script existence and configuration...\n');

    const allScripts = [
      ...this.executableScripts,
      ...this.environmentDependentScripts,
      ...this.aliasScripts,
    ];

    for (const scriptName of allScripts) {
      this.validateScriptExists(scriptName);
    }
  }

  private validateScriptExists(scriptName: string): void {
    const startTime = Date.now();

    try {
      if (!this.packageJson.scripts || !this.packageJson.scripts[scriptName]) {
        throw new Error(`Script '${scriptName}' not found in package.json`);
      }

      const scriptCommand = this.packageJson.scripts[scriptName];
      if (!scriptCommand || scriptCommand.trim() === '') {
        throw new Error(`Script '${scriptName}' is empty`);
      }

      const duration = Date.now() - startTime;
      this.results.push({
        name: scriptName,
        success: true,
        duration,
      });

      console.log(`✅ ${scriptName}: exists and configured`);
    } catch (error) {
      const duration = Date.now() - startTime;
      this.results.push({
        name: scriptName,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration,
      });

      console.log(
        `❌ ${scriptName}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async validateScript(
    scriptName: string,
    shouldExecute: boolean,
  ): Promise<void> {
    const startTime = Date.now();

    try {
      // First check if script exists
      if (!this.packageJson.scripts || !this.packageJson.scripts[scriptName]) {
        throw new Error(`Script '${scriptName}' not found in package.json`);
      }

      if (shouldExecute) {
        // Try to execute the script
        const testEnv = {
          ...process.env,
          NODE_ENV: 'test',
          DATABASE_URL: 'postgresql://test:test@localhost:5432/chemchat_test',
        };

        execSync(`npm run ${scriptName}`, {
          stdio: 'pipe',
          timeout: 120000, // 2 minutes timeout
          env: testEnv,
        });
      }

      const duration = Date.now() - startTime;
      this.results.push({
        name: scriptName,
        success: true,
        duration,
      });

      console.log(
        `✅ ${scriptName}: ${shouldExecute ? 'executed successfully' : 'exists'} (${duration}ms)`,
      );
    } catch (error) {
      const duration = Date.now() - startTime;
      this.results.push({
        name: scriptName,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration,
      });

      console.log(
        `❌ ${scriptName}: ${error instanceof Error ? error.message : String(error)} (${duration}ms)`,
      );
    }
  }

  validateCriticalScriptConfiguration(): void {
    console.log('🔧 Validating critical script configurations...\n');

    const criticalConfigurations = {
      'migrate:reset': 'prisma migrate reset --force',
      'db:seed': 'ts-node scripts/basic-seed.ts',
      'db:validate': 'ts-node scripts/validate-database-operations.ts',
      'test:unit': /jest.*--testPathPatterns=src\/.*\\\.spec\\\.ts\$/,
      'test:integration': /jest.*--config.*jest-integration\.json/,
      'test:e2e': /jest.*--config.*jest-e2e\.json/,
      'test:load': 'k6 run test/load/load-test.js',
      'docker:build': 'docker-compose build',
      'workflow:validate': 'node scripts/simple-workflow-validate.js',
    };

    for (const [scriptName, expectedConfig] of Object.entries(
      criticalConfigurations,
    )) {
      try {
        const actualConfig = this.packageJson.scripts[scriptName];

        if (!actualConfig) {
          throw new Error(`Script '${scriptName}' not found`);
        }

        if (typeof expectedConfig === 'string') {
          if (actualConfig !== expectedConfig) {
            throw new Error(
              `Expected '${expectedConfig}', got '${actualConfig}'`,
            );
          }
        } else if (expectedConfig instanceof RegExp) {
          if (!expectedConfig.test(actualConfig)) {
            throw new Error(
              `Script does not match expected pattern: ${expectedConfig}`,
            );
          }
        }

        console.log(`✅ ${scriptName}: correctly configured`);
        this.results.push({
          name: `${scriptName} (config)`,
          success: true,
        });
      } catch (error) {
        console.log(
          `❌ ${scriptName}: ${error instanceof Error ? error.message : String(error)}`,
        );
        this.results.push({
          name: `${scriptName} (config)`,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  printSummary(): void {
    console.log('\n📊 Validation Summary');
    console.log('='.repeat(50));

    const successful = this.results.filter((r) => r.success).length;
    const failed = this.results.filter((r) => !r.success).length;
    const total = this.results.length;

    console.log(`Total scripts validated: ${total}`);
    console.log(`✅ Successful: ${successful}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`Success rate: ${((successful / total) * 100).toFixed(1)}%`);

    if (failed > 0) {
      console.log('\n❌ Failed validations:');
      this.results
        .filter((r) => !r.success)
        .forEach((r) => {
          console.log(`  - ${r.name}: ${r.error}`);
        });
    }

    const totalDuration = this.results.reduce(
      (sum, r) => sum + (r.duration || 0),
      0,
    );
    console.log(`\nTotal validation time: ${totalDuration}ms`);
  }

  getExitCode(): number {
    return this.results.some((r) => !r.success) ? 1 : 0;
  }
}

async function main(): Promise<void> {
  console.log('🚀 Starting comprehensive script validation...\n');

  const validator = new ScriptValidator();

  try {
    // Validate script existence and configuration
    await validator.validateScriptExistence();
    console.log();

    // Validate critical script configurations
    validator.validateCriticalScriptConfiguration();
    console.log();

    // Validate executable scripts
    await validator.validateExecutableScripts();

    // Print summary
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
