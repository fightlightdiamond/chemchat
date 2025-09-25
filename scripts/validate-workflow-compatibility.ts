#!/usr/bin/env ts-node

/**
 * Comprehensive Workflow Compatibility Validation Script
 *
 * This script validates that all GitHub workflows are compatible with the current
 * codebase configuration and that all required scripts and dependencies are in place.
 *
 * Requirements: 1.1, 2.1, 6.1
 */

import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import * as yaml from 'js-yaml';

interface ValidationResult {
  category: string;
  test: string;
  status: 'PASS' | 'FAIL' | 'WARN';
  message: string;
  details?: string;
}

class WorkflowValidator {
  private results: ValidationResult[] = [];
  private packageJson: any;
  private ciWorkflow: any;
  private cdWorkflow: any;
  private dockerfile: string;

  constructor() {
    this.loadConfigurations();
  }

  private loadConfigurations(): void {
    try {
      // Load package.json
      const packageJsonPath = join(process.cwd(), 'package.json');
      this.packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));

      // Load CI workflow
      const ciWorkflowPath = join(process.cwd(), '.github/workflows/ci.yml');
      this.ciWorkflow = yaml.load(readFileSync(ciWorkflowPath, 'utf8'));

      // Load CD workflow
      const cdWorkflowPath = join(process.cwd(), '.github/workflows/cd.yml');
      this.cdWorkflow = yaml.load(readFileSync(cdWorkflowPath, 'utf8'));

      // Load Dockerfile
      const dockerfilePath = join(process.cwd(), 'Dockerfile');
      this.dockerfile = readFileSync(dockerfilePath, 'utf8');

      this.addResult(
        'Configuration',
        'Load configurations',
        'PASS',
        'All configuration files loaded successfully',
      );
    } catch (error) {
      this.addResult(
        'Configuration',
        'Load configurations',
        'FAIL',
        `Failed to load configurations: ${error.message}`,
      );
    }
  }

  private addResult(
    category: string,
    test: string,
    status: 'PASS' | 'FAIL' | 'WARN',
    message: string,
    details?: string,
  ): void {
    this.results.push({ category, test, status, message, details });
  }

  public validatePackageScripts(): void {
    console.log('🔍 Validating Package.json Scripts...');

    const requiredScripts = {
      'migrate:reset': 'prisma migrate reset --force',
      'db:seed': 'ts-node scripts/basic-seed.ts',
      'db:validate': 'ts-node scripts/validate-database-operations.ts',
      'test:unit': 'jest --testPathPatterns=src/.*\\.spec\\.ts$',
      'test:integration': 'jest --config ./test/jest-integration.json',
      'test:e2e': 'jest --config ./test/jest-e2e.json',
      'test:load': 'k6 run test/load/load-test.js',
      build: 'nest build',
      lint: 'eslint "{src,apps,libs,test}/**/*.ts" --fix',
    };

    for (const [scriptName, expectedCommand] of Object.entries(
      requiredScripts,
    )) {
      if (this.packageJson.scripts[scriptName] === expectedCommand) {
        this.addResult(
          'Scripts',
          scriptName,
          'PASS',
          'Script configured correctly',
        );
      } else if (this.packageJson.scripts[scriptName]) {
        this.addResult(
          'Scripts',
          scriptName,
          'WARN',
          'Script exists but command differs',
          `Expected: ${expectedCommand}, Got: ${this.packageJson.scripts[scriptName]}`,
        );
      } else {
        this.addResult(
          'Scripts',
          scriptName,
          'FAIL',
          'Script missing from package.json',
        );
      }
    }

    // Validate script files exist
    const scriptFiles = [
      'scripts/basic-seed.ts',
      'scripts/validate-database-operations.ts',
      'scripts/ci-database-test.sh',
      'test/load/load-test.js',
      'test/load/simple-load-test.js',
    ];

    for (const file of scriptFiles) {
      if (existsSync(join(process.cwd(), file))) {
        this.addResult(
          'Scripts',
          `File: ${file}`,
          'PASS',
          'Script file exists',
        );
      } else {
        this.addResult(
          'Scripts',
          `File: ${file}`,
          'FAIL',
          'Script file missing',
        );
      }
    }
  }

  public validateNodeVersionConsistency(): void {
    console.log('🔍 Validating Node.js Version Consistency...');

    const expectedNodeVersion = '20';
    const expectedNodeVersionRange = '>=20.0.0';

    // Check package.json engines
    if (this.packageJson.engines?.node === expectedNodeVersionRange) {
      this.addResult(
        'Node Version',
        'package.json engines',
        'PASS',
        'Node version requirement correct',
      );
    } else {
      this.addResult(
        'Node Version',
        'package.json engines',
        'FAIL',
        `Node version requirement incorrect. Expected: ${expectedNodeVersionRange}, Got: ${this.packageJson.engines?.node}`,
      );
    }

    // Check CI workflow
    if (this.ciWorkflow.env?.NODE_VERSION === expectedNodeVersion) {
      this.addResult(
        'Node Version',
        'CI workflow env',
        'PASS',
        'CI workflow Node version correct',
      );
    } else {
      this.addResult(
        'Node Version',
        'CI workflow env',
        'FAIL',
        `CI workflow Node version incorrect. Expected: ${expectedNodeVersion}, Got: ${this.ciWorkflow.env?.NODE_VERSION}`,
      );
    }

    // Check Dockerfile
    if (this.dockerfile.includes(`FROM node:${expectedNodeVersion}-alpine`)) {
      this.addResult(
        'Node Version',
        'Dockerfile',
        'PASS',
        'Dockerfile Node version correct',
      );
    } else {
      this.addResult(
        'Node Version',
        'Dockerfile',
        'FAIL',
        'Dockerfile Node version incorrect',
      );
    }

    // Check current runtime version
    try {
      const currentVersion = execSync('node --version', {
        encoding: 'utf8',
      }).trim();
      const majorVersion = parseInt(currentVersion.slice(1).split('.')[0]);

      if (majorVersion >= 20) {
        this.addResult(
          'Node Version',
          'Runtime version',
          'PASS',
          `Current Node version: ${currentVersion}`,
        );
      } else {
        this.addResult(
          'Node Version',
          'Runtime version',
          'FAIL',
          `Current Node version too old: ${currentVersion}. Required: >= 20.0.0`,
        );
      }
    } catch (error) {
      this.addResult(
        'Node Version',
        'Runtime version',
        'FAIL',
        'Failed to check Node version',
      );
    }
  }

  public validatenpmConsistency(): void {
    console.log('🔍 Validating npm Consistency...');

    // Check CI workflow uses npm
    const jobs = Object.values(this.ciWorkflow.jobs) as any[];
    let npmUsageCorrect = true;

    for (const job of jobs) {
      if (job.steps) {
        const installSteps = job.steps.filter(
          (step: any) => step.name === 'Install dependencies',
        );

        for (const step of installSteps) {
          if (step.run !== 'npm install --frozen-lockfile') {
            npmUsageCorrect = false;
            this.addResult(
              'npm',
              'CI install command',
              'FAIL',
              `Incorrect install command: ${step.run}`,
            );
          }
        }
      }
    }

    if (npmUsageCorrect) {
      this.addResult(
        'npm',
        'CI install commands',
        'PASS',
        'All CI jobs use correct npm install command',
      );
    }

    // Check Dockerfile uses npm
    if (this.dockerfile.includes('npm install --frozen-lockfile')) {
      this.addResult(
        'npm',
        'Dockerfile',
        'PASS',
        'Dockerfile uses npm correctly',
      );
    } else {
      this.addResult(
        'npm',
        'Dockerfile',
        'FAIL',
        'Dockerfile does not use npm correctly',
      );
    }

    // Check npm availability
    try {
      const npmVersion = execSync('npm --version', {
        encoding: 'utf8',
      }).trim();
      this.addResult(
        'npm',
        'Runtime availability',
        'PASS',
        `npm version: ${npmVersion}`,
      );
    } catch (error) {
      this.addResult(
        'npm',
        'Runtime availability',
        'FAIL',
        'npm not available',
      );
    }
  }

  public validateCIWorkflowConfiguration(): void {
    console.log('🔍 Validating CI Workflow Configuration...');

    // Check required services
    const requiredServices = ['postgres', 'redis', 'elasticsearch'];
    const services = this.ciWorkflow.jobs.test.services;

    for (const service of requiredServices) {
      if (services[service]) {
        this.addResult(
          'CI Services',
          service,
          'PASS',
          `Service ${service} configured`,
        );
      } else {
        this.addResult(
          'CI Services',
          service,
          'FAIL',
          `Service ${service} missing`,
        );
      }
    }

    // Check job dependencies
    if (
      this.ciWorkflow.jobs.build.needs?.includes('test') &&
      this.ciWorkflow.jobs.build.needs?.includes('security')
    ) {
      this.addResult(
        'CI Dependencies',
        'Build job dependencies',
        'PASS',
        'Build job has correct dependencies',
      );
    } else {
      this.addResult(
        'CI Dependencies',
        'Build job dependencies',
        'FAIL',
        'Build job dependencies incorrect',
      );
    }

    // Check performance job configuration
    if (this.ciWorkflow.jobs.performance?.needs?.includes('build')) {
      this.addResult(
        'CI Dependencies',
        'Performance job dependencies',
        'PASS',
        'Performance job has correct dependencies',
      );
    } else {
      this.addResult(
        'CI Dependencies',
        'Performance job dependencies',
        'FAIL',
        'Performance job dependencies incorrect',
      );
    }
  }

  public validateKubernetesManifests(): void {
    console.log('🔍 Validating Kubernetes Manifests...');

    const requiredManifests = [
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

    for (const manifest of requiredManifests) {
      if (existsSync(join(process.cwd(), manifest))) {
        this.addResult(
          'K8s Manifests',
          manifest,
          'PASS',
          'Manifest file exists',
        );
      } else {
        this.addResult(
          'K8s Manifests',
          manifest,
          'FAIL',
          'Manifest file missing',
        );
      }
    }
  }

  public validateTestConfigurations(): void {
    console.log('🔍 Validating Test Configurations...');

    const testConfigs = [
      'test/jest-e2e.json',
      'test/jest-integration.json',
      'test/jest-milestone.json',
    ];

    for (const config of testConfigs) {
      if (existsSync(join(process.cwd(), config))) {
        this.addResult(
          'Test Configs',
          config,
          'PASS',
          'Test configuration exists',
        );
      } else {
        this.addResult(
          'Test Configs',
          config,
          'FAIL',
          'Test configuration missing',
        );
      }
    }
  }

  public executeScriptValidation(): void {
    console.log('🔍 Executing Script Validation...');

    const scriptsToTest = [
      { name: 'lint', timeout: 60000 },
      { name: 'build', timeout: 120000 },
      { name: 'prisma:generate', timeout: 60000 },
      { name: 'test:unit -- --passWithNoTests', timeout: 60000 },
    ];

    for (const script of scriptsToTest) {
      try {
        execSync(`npm run ${script.name}`, {
          stdio: 'pipe',
          timeout: script.timeout,
          env: { ...process.env, NODE_ENV: 'test' },
        });
        this.addResult(
          'Script Execution',
          script.name,
          'PASS',
          'Script executed successfully',
        );
      } catch (error) {
        this.addResult(
          'Script Execution',
          script.name,
          'FAIL',
          `Script execution failed: ${error.message}`,
        );
      }
    }
  }

  public generateReport(): void {
    console.log('\n📊 Workflow Compatibility Validation Report');
    console.log('━'.repeat(80));

    const categories = [...new Set(this.results.map((r) => r.category))];
    let totalTests = 0;
    let passedTests = 0;
    let failedTests = 0;
    let warnings = 0;

    for (const category of categories) {
      console.log(`\n📁 ${category}`);
      console.log('─'.repeat(40));

      const categoryResults = this.results.filter(
        (r) => r.category === category,
      );

      for (const result of categoryResults) {
        const icon =
          result.status === 'PASS'
            ? '✅'
            : result.status === 'FAIL'
              ? '❌'
              : '⚠️';
        console.log(`${icon} ${result.test}: ${result.message}`);

        if (result.details) {
          console.log(`   Details: ${result.details}`);
        }

        totalTests++;
        if (result.status === 'PASS') passedTests++;
        else if (result.status === 'FAIL') failedTests++;
        else warnings++;
      }
    }

    console.log('\n📈 Summary');
    console.log('━'.repeat(40));
    console.log(`Total Tests: ${totalTests}`);
    console.log(`✅ Passed: ${passedTests}`);
    console.log(`❌ Failed: ${failedTests}`);
    console.log(`⚠️  Warnings: ${warnings}`);
    console.log(
      `Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`,
    );

    if (failedTests === 0) {
      console.log(
        '\n🎉 All critical validations passed! Workflows are ready for CI/CD.',
      );
      console.log('\nNext steps:');
      console.log('1. Commit and push changes to trigger CI workflow');
      console.log(
        '2. Monitor CI logs to ensure all jobs complete successfully',
      );
      console.log('3. Verify deployment pipeline works correctly');
      process.exit(0);
    } else {
      console.log(
        '\n❌ Some validations failed. Please fix the issues above before proceeding.',
      );
      console.log(
        '\nRefer to the task requirements and design document for guidance.',
      );
      process.exit(1);
    }
  }

  public async runAllValidations(): Promise<void> {
    console.log('🚀 Starting Comprehensive Workflow Compatibility Validation');
    console.log('━'.repeat(80));

    this.validatePackageScripts();
    this.validateNodeVersionConsistency();
    this.validatenpmConsistency();
    this.validateCIWorkflowConfiguration();
    this.validateKubernetesManifests();
    this.validateTestConfigurations();
    this.executeScriptValidation();

    this.generateReport();
  }
}

// Main execution
async function main(): Promise<void> {
  const validator = new WorkflowValidator();
  await validator.runAllValidations();
}

if (require.main === module) {
  main().catch((error) => {
    console.error('❌ Validation failed with error:', error);
    process.exit(1);
  });
}

export { WorkflowValidator };
