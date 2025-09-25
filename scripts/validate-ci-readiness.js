#!/usr/bin/env node

/**
 * CI Readiness Validation Script
 *
 * This script validates that all database operations are ready for CI environment
 * without requiring actual database connection (for local testing)
 */

const fs = require('fs');
const path = require('path');

console.log('🚀 Validating CI Readiness for Database Operations');
console.log(
  '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
);

let allChecksPass = true;

function checkFailed(message) {
  console.log('❌', message);
  allChecksPass = false;
}

function checkPassed(message) {
  console.log('✅', message);
}

// 1. Check package.json scripts
console.log('\n📦 Checking Package.json Scripts...');
try {
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));

  const requiredScripts = {
    'migrate:reset': 'prisma migrate reset --force',
    'db:seed': 'ts-node scripts/basic-seed.ts',
    'db:validate': 'ts-node scripts/validate-database-operations.ts',
    'db:test-ci': './scripts/ci-database-test.sh',
  };

  for (const [scriptName, expectedCommand] of Object.entries(requiredScripts)) {
    if (packageJson.scripts[scriptName] === expectedCommand) {
      checkPassed(`Script "${scriptName}" configured correctly`);
    } else if (packageJson.scripts[scriptName]) {
      checkFailed(
        `Script "${scriptName}" exists but has unexpected command: ${packageJson.scripts[scriptName]}`,
      );
    } else {
      checkFailed(`Script "${scriptName}" is missing`);
    }
  }
} catch (error) {
  checkFailed(`Failed to read package.json: ${error.message}`);
}

// 2. Check script files exist
console.log('\n📁 Checking Script Files...');
const scriptFiles = [
  'scripts/basic-seed.ts',
  'scripts/validate-database-operations.ts',
  'scripts/ci-database-test.sh',
];

for (const file of scriptFiles) {
  if (fs.existsSync(file)) {
    checkPassed(`File exists: ${file}`);
  } else {
    checkFailed(`File missing: ${file}`);
  }
}

// 3. Check script permissions
console.log('\n🔐 Checking Script Permissions...');
try {
  const stats = fs.statSync('scripts/ci-database-test.sh');
  if (stats.mode & parseInt('111', 8)) {
    checkPassed('ci-database-test.sh is executable');
  } else {
    checkFailed('ci-database-test.sh is not executable');
  }
} catch (error) {
  checkFailed(`Failed to check script permissions: ${error.message}`);
}

// 4. Check Prisma schema exists
console.log('\n🗄️  Checking Database Schema...');
if (fs.existsSync('prisma/schema.prisma')) {
  checkPassed('Prisma schema file exists');

  // Check for essential models
  const schemaContent = fs.readFileSync('prisma/schema.prisma', 'utf8');
  const requiredModels = ['User', 'Conversation', 'Message', 'Tenant'];

  for (const model of requiredModels) {
    if (schemaContent.includes(`model ${model}`)) {
      checkPassed(`Model ${model} found in schema`);
    } else {
      checkFailed(`Model ${model} missing from schema`);
    }
  }
} else {
  checkFailed('Prisma schema file missing');
}

// 5. Check test files exist
console.log('\n🧪 Checking Test Files...');
const testFiles = [
  'test/integration/database-operations.integration-spec.ts',
  'test/unit/database-scripts.spec.ts',
];

for (const file of testFiles) {
  if (fs.existsSync(file)) {
    checkPassed(`Test file exists: ${file}`);
  } else {
    checkFailed(`Test file missing: ${file}`);
  }
}

// 6. Check CI workflow configuration
console.log('\n⚙️  Checking CI Workflow...');
if (fs.existsSync('.github/workflows/ci.yml')) {
  checkPassed('CI workflow file exists');

  const ciContent = fs.readFileSync('.github/workflows/ci.yml', 'utf8');

  if (ciContent.includes('migrate:reset') && ciContent.includes('db:seed')) {
    checkPassed('CI workflow includes database setup steps');
  } else {
    checkFailed('CI workflow missing database setup steps');
  }

  if (ciContent.includes('DATABASE_URL') && ciContent.includes('NODE_ENV')) {
    checkPassed('CI workflow includes required environment variables');
  } else {
    checkFailed('CI workflow missing required environment variables');
  }
} else {
  checkFailed('CI workflow file missing');
}

// 7. Check documentation
console.log('\n📚 Checking Documentation...');
if (fs.existsSync('docs/database-operations-validation.md')) {
  checkPassed('Database operations documentation exists');
} else {
  checkFailed('Database operations documentation missing');
}

// Final summary
console.log('\n📊 Validation Summary');
console.log(
  '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
);

if (allChecksPass) {
  console.log(
    '🎉 All checks passed! Database operations are ready for CI environment.',
  );
  console.log('\nNext steps:');
  console.log('1. Commit and push changes to trigger CI workflow');
  console.log(
    '2. Monitor CI logs to ensure database operations work correctly',
  );
  console.log('3. Verify all tests pass with proper database setup');
  console.log('\nTask 7 validation is complete! ✅');
  process.exit(0);
} else {
  console.log(
    '❌ Some checks failed. Please fix the issues above before proceeding.',
  );
  console.log(
    '\nRefer to docs/database-operations-validation.md for troubleshooting.',
  );
  process.exit(1);
}
