#!/usr/bin/env node

/**
 * Simple validation script - không phức tạp, chỉ kiểm tra những gì cần thiết
 */

const { execSync } = require('child_process');
const { readFileSync, existsSync } = require('fs');
const { join } = require('path');

function log(message, type = 'info') {
  const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : 'ℹ️';
  console.log(`${prefix} ${message}`);
}

function validatePackageScripts() {
  log('Checking package.json scripts...');

  const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
  const requiredScripts = [
    'lint',
    'build',
    'migrate:reset',
    'db:seed',
    'test:unit',
  ];

  for (const script of requiredScripts) {
    if (packageJson.scripts[script]) {
      log(`Script ${script}: OK`, 'success');
    } else {
      log(`Script ${script}: MISSING`, 'error');
      return false;
    }
  }
  return true;
}

function validateNodeVersion() {
  log('Checking Node.js version consistency...');

  try {
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
    const dockerfile = readFileSync('Dockerfile', 'utf8');

    // Check package.json
    if (packageJson.engines.node === '>=20.0.0') {
      log('package.json Node version: OK', 'success');
    } else {
      log('package.json Node version: WRONG', 'error');
      return false;
    }

    // Check Dockerfile
    if (dockerfile.includes('FROM node:20-alpine')) {
      log('Dockerfile Node version: OK', 'success');
    } else {
      log('Dockerfile Node version: WRONG', 'error');
      return false;
    }

    return true;
  } catch (error) {
    log(`Node version check failed: ${error.message}`, 'error');
    return false;
  }
}

function validateRequiredFiles() {
  log('Checking required files...');

  const requiredFiles = [
    'scripts/basic-seed.ts',
    'scripts/validate-database-operations.ts',
    '.github/workflows/ci.yml',
    'docker-compose.yml',
    'Dockerfile',
    'prisma/schema.prisma',
  ];

  for (const file of requiredFiles) {
    if (existsSync(file)) {
      log(`File ${file}: OK`, 'success');
    } else {
      log(`File ${file}: MISSING`, 'error');
      return false;
    }
  }
  return true;
}

function runSimpleTests() {
  log('Running simple executable tests...');

  try {
    // Test lint
    execSync('npm run lint', { stdio: 'pipe', timeout: 60000 });
    log('Lint test: OK', 'success');

    // Test build
    execSync('npm run build', { stdio: 'pipe', timeout: 120000 });
    log('Build test: OK', 'success');

    return true;
  } catch (error) {
    log(`Test execution failed: ${error.message}`, 'error');
    return false;
  }
}

function main() {
  console.log('🚀 Starting simple workflow validation...\n');

  const checks = [
    validatePackageScripts,
    validateNodeVersion,
    validateRequiredFiles,
    runSimpleTests,
  ];

  let allPassed = true;

  for (const check of checks) {
    if (!check()) {
      allPassed = false;
    }
    console.log('');
  }

  if (allPassed) {
    log('🎉 All validations passed!', 'success');
    process.exit(0);
  } else {
    log('💥 Some validations failed!', 'error');
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
