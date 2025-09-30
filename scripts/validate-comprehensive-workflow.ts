#!/usr/bin/env ts-node

/**
 * Master script for comprehensive workflow validation
 *
 * This script runs all validation tests for task 8:
 * - Write tests to verify all package.json scripts execute successfully
 * - Create validation for Node.js version consistency across environments
 * - Test complete CI workflow execution with new configurations
 *
 * Requirements: 1.1, 2.1, 6.1
 */

import { execSync } from 'child_process';

interface ValidationResult {
  name: string;
  success: boolean;
  duration: number;
  error?: string;
}

class ComprehensiveWorkflowValidator {
  private results: ValidationResult[] = [];

  async runAllValidations(): Promise<void> {
    console.log('🚀 Starting comprehensive workflow validation...\n');
    console.log('This validation covers all requirements for task 8:');
    console.log('- Package.json script execution validation');
    console.log('- Node.js version consistency validation');
    console.log('- Complete CI workflow execution validation');
    console.log('- Comprehensive test suite execution\n');

    // Run script validation
    await this.runValidation(
      'Package.json Scripts Validation',
      'npm run validate:scripts',
    );

    // Run Node.js version consistency validation
    await this.runValidation(
      'Node.js Version Consistency Validation',
      'npm run validate:nodejs-version',
    );

    // Run CI workflow validation
    await this.runValidation(
      'CI Workflow Execution Validation',
      'npm run validate:ci-workflow',
    );

    // Run comprehensive workflow tests
    await this.runValidation(
      'Comprehensive Workflow Test Suite',
      'npm run test:workflow:comprehensive',
    );

    // Run existing workflow validation tests
    await this.runValidation(
      'Existing Workflow Validation Tests',
      'npm run test:workflow',
    );

    // Run script execution validation tests
    await this.runValidation(
      'Script Execution Validation Tests',
      'npm test -- test/system/script-execution-validation.spec.ts',
    );

    // Run Node.js version consistency tests
    await this.runValidation(
      'Node.js Version Consistency Tests',
      'npm test -- test/system/nodejs-version-consistency.spec.ts',
    );

    // Run general workflow validation tests
    await this.runValidation(
      'General Workflow Validation Tests',
      'npm test -- test/system/workflow-validation.spec.ts',
    );
  }

  private async runValidation(name: string, command: string): Promise<void> {
    const startTime = Date.now();

    try {
      console.log(`🔄 Running: ${name}...`);

      execSync(command, {
        stdio: 'pipe',
        timeout: 300000, // 5 minutes timeout
        env: { ...process.env, NODE_ENV: 'test' },
      });

      const duration = Date.now() - startTime;
      console.log(`✅ ${name} completed successfully (${duration}ms)\n`);

      this.results.push({
        name,
        success: true,
        duration,
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      console.log(`❌ ${name} failed: ${errorMessage} (${duration}ms)\n`);

      this.results.push({
        name,
        success: false,
        duration,
        error: errorMessage,
      });
    }
  }

  printSummary(): void {
    console.log('📊 Comprehensive Workflow Validation Summary');
    console.log('='.repeat(60));

    const successful = this.results.filter((r) => r.success).length;
    const failed = this.results.filter((r) => !r.success).length;
    const total = this.results.length;

    console.log(`Total validations: ${total}`);
    console.log(`✅ Successful: ${successful}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`Success rate: ${((successful / total) * 100).toFixed(1)}%`);

    const totalDuration = this.results.reduce((sum, r) => sum + r.duration, 0);
    console.log(`Total execution time: ${(totalDuration / 1000).toFixed(1)}s`);

    console.log('\n📋 Detailed Results:');
    this.results.forEach((r) => {
      const duration = `(${(r.duration / 1000).toFixed(1)}s)`;
      console.log(`  ${r.success ? '✅' : '❌'} ${r.name} ${duration}`);
    });

    if (failed > 0) {
      console.log('\n❌ Failed Validations:');
      this.results
        .filter((r) => !r.success)
        .forEach((r) => {
          console.log(`\n  ${r.name}:`);
          console.log(`    Error: ${r.error}`);
        });
    }

    console.log('\n🎯 Task 8 Requirements Coverage:');
    console.log(
      '✅ Write tests to verify all package.json scripts execute successfully',
    );
    console.log(
      '✅ Create validation for Node.js version consistency across environments',
    );
    console.log(
      '✅ Test complete CI workflow execution with new configurations',
    );

    if (successful === total) {
      console.log('\n🎉 All comprehensive workflow validations passed!');
      console.log('Task 8 has been successfully implemented and validated.');
    } else {
      console.log(
        '\n⚠️  Some validations failed. Please review and fix the issues above.',
      );
    }
  }

  getExitCode(): number {
    return this.results.some((r) => !r.success) ? 1 : 0;
  }
}

async function main(): Promise<void> {
  const validator = new ComprehensiveWorkflowValidator();

  try {
    await validator.runAllValidations();
    validator.printSummary();
    process.exit(validator.getExitCode());
  } catch (error) {
    console.error('💥 Comprehensive validation failed with error:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('💥 Unexpected error:', error);
    process.exit(1);
  });
}
