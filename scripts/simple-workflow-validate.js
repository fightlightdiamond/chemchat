#!/usr/bin/env node

/**
 * Simple workflow validation script that doesn't require external dependencies
 * This is used for Docker-based testing where we want minimal dependencies
 */

const fs = require('fs');
const path = require('path');

function validateWorkflowFiles() {
  console.log('🔍 Validating workflow files...');

  const workflowFiles = [
    '.github/workflows/ci.yml',
    '.github/workflows/cd.yml',
    '.github/workflows/security.yml',
  ];

  let allValid = true;

  for (const file of workflowFiles) {
    const filePath = path.join(process.cwd(), file);

    if (!fs.existsSync(filePath)) {
      console.error(`❌ Missing workflow file: ${file}`);
      allValid = false;
      continue;
    }

    try {
      const content = fs.readFileSync(filePath, 'utf8');

      // Basic YAML syntax validation
      if (!content.trim()) {
        console.error(`❌ Empty workflow file: ${file}`);
        allValid = false;
        continue;
      }

      // Check for basic workflow structure
      if (
        !content.includes('name:') ||
        !content.includes('on:') ||
        !content.includes('jobs:')
      ) {
        console.error(`❌ Invalid workflow structure in: ${file}`);
        allValid = false;
        continue;
      }

      // Check for Node.js version consistency
      if (content.includes('node-version') && !content.includes('20')) {
        console.error(`❌ Inconsistent Node.js version in: ${file}`);
        allValid = false;
        continue;
      }

      console.log(`✅ Valid workflow file: ${file}`);
    } catch (error) {
      console.error(`❌ Error reading workflow file ${file}:`, error.message);
      allValid = false;
    }
  }

  return allValid;
}

function validatePackageScripts() {
  console.log('🔍 Validating package.json scripts...');

  const packagePath = path.join(process.cwd(), 'package.json');

  if (!fs.existsSync(packagePath)) {
    console.error('❌ Missing package.json');
    return false;
  }

  try {
    const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

    const requiredScripts = [
      'build',
      'lint',
      'test:unit',
      'migrate:reset',
      'db:seed',
      'prisma:generate',
    ];

    let allValid = true;

    for (const script of requiredScripts) {
      if (!packageJson.scripts || !packageJson.scripts[script]) {
        console.error(`❌ Missing required script: ${script}`);
        allValid = false;
      } else {
        console.log(`✅ Found script: ${script}`);
      }
    }

    // Check Node.js version requirement
    if (
      !packageJson.engines ||
      !packageJson.engines.node ||
      !packageJson.engines.node.includes('20')
    ) {
      console.error('❌ Missing or incorrect Node.js version requirement');
      allValid = false;
    } else {
      console.log('✅ Node.js version requirement is correct');
    }

    return allValid;
  } catch (error) {
    console.error('❌ Error parsing package.json:', error.message);
    return false;
  }
}

function validateDockerfile() {
  console.log('🔍 Validating Dockerfile...');

  // Skip Dockerfile validation if running inside Docker
  if (process.env.DOCKER_ENV === 'true') {
    console.log('⏭️  Skipping Dockerfile validation (running inside Docker)');
    return true;
  }

  const dockerfilePath = path.join(process.cwd(), 'Dockerfile');

  if (!fs.existsSync(dockerfilePath)) {
    console.error('❌ Missing Dockerfile');
    return false;
  }

  try {
    const content = fs.readFileSync(dockerfilePath, 'utf8');

    // Check for Node.js 20
    if (!content.includes('node:20-alpine')) {
      console.error('❌ Dockerfile does not use Node.js 20');
      return false;
    }

    // Check for multi-stage build
    if (
      !content.includes('AS base') ||
      !content.includes('AS deps') ||
      !content.includes('AS builder')
    ) {
      console.error('❌ Dockerfile missing multi-stage build stages');
      return false;
    }

    console.log('✅ Dockerfile validation passed');
    return true;
  } catch (error) {
    console.error('❌ Error reading Dockerfile:', error.message);
    return false;
  }
}

function main() {
  console.log('🚀 Starting workflow validation...\n');

  const results = [
    validateWorkflowFiles(),
    validatePackageScripts(),
    validateDockerfile(),
  ];

  const allPassed = results.every((result) => result === true);

  console.log('\n📊 Validation Summary:');
  console.log(`Workflow files: ${results[0] ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Package scripts: ${results[1] ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Dockerfile: ${results[2] ? '✅ PASS' : '❌ FAIL'}`);

  if (allPassed) {
    console.log('\n🎉 All validations passed!');
    process.exit(0);
  } else {
    console.log('\n💥 Some validations failed!');
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  validateWorkflowFiles,
  validatePackageScripts,
  validateDockerfile,
};
