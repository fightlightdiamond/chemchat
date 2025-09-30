#!/usr/bin/env node

/**
 * Simple test script to validate workflow in Docker environment
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function isDockerEnvironment() {
  return (
    process.env.DOCKER_ENV === 'true' ||
    fs.existsSync('/.dockerenv') ||
    process.env.CI === 'true'
  );
}

function testNodeVersion() {
  console.log('🔍 Testing Node.js version...');
  const nodeVersion = process.version;
  if (!nodeVersion.match(/^v20\./)) {
    throw new Error(`Expected Node.js v20.x, got ${nodeVersion}`);
  }
  console.log(`✅ Node.js version: ${nodeVersion}`);
}

function testNpmVersion() {
  console.log('🔍 Testing npm version...');
  const npmVersion = execSync('npm --version', { encoding: 'utf8' }).trim();
  const majorVersion = parseInt(npmVersion.split('.')[0]);
  if (majorVersion < 8) {
    throw new Error(`Expected npm >= 8, got ${npmVersion}`);
  }
  console.log(`✅ npm version: ${npmVersion}`);
}

function testEnvironmentVariables() {
  console.log('🔍 Testing environment variables...');

  if (process.env.NODE_ENV !== 'test') {
    throw new Error(`Expected NODE_ENV=test, got ${process.env.NODE_ENV}`);
  }
  console.log('✅ NODE_ENV is set correctly');

  if (process.env.DOCKER_ENV !== 'true') {
    throw new Error('DOCKER_ENV should be true in Docker environment');
  }
  console.log('✅ DOCKER_ENV is set correctly');
}

function testScriptExecution() {
  console.log('🔍 Testing script execution...');

  const scripts = [
    { name: 'workflow:validate', timeout: 30000 },
    { name: 'lint', timeout: 60000 },
    { name: 'build', timeout: 120000 },
    { name: 'prisma:generate', timeout: 60000 },
  ];

  for (const script of scripts) {
    console.log(`  🔄 Testing: npm run ${script.name}`);
    try {
      execSync(`npm run ${script.name}`, {
        stdio: 'pipe',
        timeout: script.timeout,
      });
      console.log(`  ✅ ${script.name} executed successfully`);
    } catch (error) {
      throw new Error(`Script ${script.name} failed: ${error.message}`);
    }
  }
}

function testFileAccess() {
  console.log('🔍 Testing file access...');

  const requiredFiles = [
    'package.json',
    'prisma/schema.prisma',
    'scripts/basic-seed.ts',
    '.github/workflows/ci.yml',
    '.github/workflows/cd.yml',
  ];

  for (const file of requiredFiles) {
    if (!fs.existsSync(file)) {
      throw new Error(`Required file not found: ${file}`);
    }
    console.log(`  ✅ ${file} exists`);
  }
}

function testPackageConfiguration() {
  console.log('🔍 Testing package configuration...');

  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));

  // Test Node.js version requirement
  if (packageJson.engines.node !== '>=20.0.0') {
    throw new Error(
      `Expected engines.node to be >=20.0.0, got ${packageJson.engines.node}`,
    );
  }
  console.log('✅ Node.js engine requirement is correct');

  // Test required scripts
  const requiredScripts = [
    'build',
    'lint',
    'test:unit',
    'migrate:reset',
    'db:seed',
    'workflow:validate',
  ];

  for (const script of requiredScripts) {
    if (!packageJson.scripts[script]) {
      throw new Error(`Required script missing: ${script}`);
    }
    console.log(`  ✅ Script ${script} is defined`);
  }
}

function main() {
  console.log('🐳 Starting Docker workflow validation tests...\n');

  if (!isDockerEnvironment()) {
    console.log('⚠️  Warning: Not running in Docker environment');
    console.log('💡 This test is designed to run inside Docker containers');
  }

  const tests = [
    testNodeVersion,
    testNpmVersion,
    testEnvironmentVariables,
    testFileAccess,
    testPackageConfiguration,
    testScriptExecution,
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      test();
      passed++;
    } catch (error) {
      console.error(`❌ ${test.name} failed:`, error.message);
      failed++;
    }
    console.log('');
  }

  console.log('📊 Test Summary:');
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📈 Total: ${passed + failed}`);

  if (failed === 0) {
    console.log('\n🎉 All Docker workflow validation tests passed!');
    process.exit(0);
  } else {
    console.log('\n💥 Some tests failed!');
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
