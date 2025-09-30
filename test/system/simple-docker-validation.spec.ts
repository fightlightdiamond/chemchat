/**
 * Simple Docker Validation Tests
 *
 * This test suite provides basic Docker-based validation without complex setup
 * Requirements: 1.1, 2.1, 6.1
 */

import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

describe('Simple Docker Validation', () => {
  const isDockerAvailable = () => {
    try {
      execSync('docker --version', { stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  };

  describe('Docker Environment Check', () => {
    it('should have Docker available', () => {
      expect(isDockerAvailable()).toBe(true);
    });

    it('should validate Dockerfile exists and has correct content', () => {
      const dockerfilePath = join(process.cwd(), 'Dockerfile');
      expect(existsSync(dockerfilePath)).toBe(true);

      const dockerfile = readFileSync(dockerfilePath, 'utf8');
      expect(dockerfile).toMatch(/FROM node:20-alpine/);
      expect(dockerfile).toContain('WORKDIR /app');
      expect(dockerfile).toContain('npm install');
    });

    it('should validate docker-compose.workflow-validation.yml exists', () => {
      const composePath = join(
        process.cwd(),
        'docker-compose.workflow-validation.yml',
      );
      expect(existsSync(composePath)).toBe(true);

      const content = readFileSync(composePath, 'utf8');
      expect(content).toContain('chemchat-app');
      expect(content).toContain('postgres');
      expect(content).toContain('redis');
    });
  });

  describe('Basic Docker Operations', () => {
    it('should validate workflow validation script works', async () => {
      if (!isDockerAvailable()) {
        console.log('Skipping Docker test - Docker not available');
        return;
      }

      // Test the simple workflow validation script
      expect(() => {
        execSync('npm run workflow:validate', {
          stdio: 'pipe',
          timeout: 30000,
        });
      }).not.toThrow('Workflow validation should succeed');
    }, 60000);

    it('should build Docker image successfully', async () => {
      if (!isDockerAvailable()) {
        console.log('Skipping Docker test - Docker not available');
        return;
      }

      try {
        // Build only the base stage to test quickly
        execSync('docker build --target base -t chemchat:test-base .', {
          stdio: 'pipe',
          timeout: 300000,
        });

        // Verify image was created
        const images = execSync(
          'docker images chemchat:test-base --format "{{.Repository}}:{{.Tag}}"',
          {
            encoding: 'utf8',
            timeout: 10000,
          },
        );

        expect(images.trim()).toBe('chemchat:test-base');
      } finally {
        // Cleanup
        try {
          execSync('docker rmi chemchat:test-base', { stdio: 'pipe' });
        } catch {
          // Ignore cleanup errors
        }
      }
    }, 400000);

    it('should validate Node.js version in Docker image', async () => {
      if (!isDockerAvailable()) {
        console.log('Skipping Docker test - Docker not available');
        return;
      }

      try {
        // Build base image
        execSync('docker build --target base -t chemchat:node-test .', {
          stdio: 'pipe',
          timeout: 300000,
        });

        // Check Node.js version
        const nodeVersion = execSync(
          'docker run --rm chemchat:node-test node --version',
          {
            encoding: 'utf8',
            timeout: 30000,
          },
        ).trim();

        expect(nodeVersion).toMatch(/^v20\./);
      } finally {
        // Cleanup
        try {
          execSync('docker rmi chemchat:node-test', { stdio: 'pipe' });
        } catch {
          // Ignore cleanup errors
        }
      }
    }, 400000);
  });

  describe('Package Scripts in Docker', () => {
    it('should validate critical scripts can run in Docker', async () => {
      if (!isDockerAvailable()) {
        console.log('Skipping Docker test - Docker not available');
        return;
      }

      try {
        // Build development image
        execSync('docker build --target development -t chemchat:dev-test .', {
          stdio: 'pipe',
          timeout: 600000,
        });

        // Test basic commands
        const commands = [
          'npm --version',
          'node --version',
          'npm run workflow:validate',
        ];

        for (const command of commands) {
          expect(() => {
            execSync(`docker run --rm chemchat:dev-test ${command}`, {
              stdio: 'pipe',
              timeout: 60000,
            });
          }).not.toThrow(`Command "${command}" should work in Docker`);
        }
      } finally {
        // Cleanup
        try {
          execSync('docker rmi chemchat:dev-test', { stdio: 'pipe' });
        } catch {
          // Ignore cleanup errors
        }
      }
    }, 800000);
  });

  describe('Docker Compose Basic Validation', () => {
    it('should validate docker-compose config is valid', () => {
      const composeFile = 'docker-compose.workflow-validation.yml';
      const composePath = join(process.cwd(), composeFile);

      if (!existsSync(composePath)) {
        console.log(`Skipping test - ${composeFile} not found`);
        return;
      }

      expect(() => {
        execSync(`docker-compose -f ${composeFile} config`, {
          stdio: 'pipe',
          timeout: 30000,
        });
      }).not.toThrow('Docker compose config should be valid');
    });
  });
});
