/**
 * Docker-based Workflow Validation Tests
 *
 * This test suite validates workflows using Docker containers to simulate
 * the actual CI environment more accurately.
 *
 * Requirements: 1.1, 2.1, 6.1
 */

import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

describe('Docker-based Workflow Validation', () => {
  const isDockerAvailable = () => {
    try {
      execSync('docker --version', { stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  };

  const isDockerComposeAvailable = () => {
    try {
      execSync('docker-compose --version', { stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  };

  beforeAll(() => {
    if (!isDockerAvailable()) {
      console.log('Docker not available, skipping Docker-based tests');
      return;
    }
  });

  describe('Docker Environment Validation', () => {
    it('should have Docker available', () => {
      expect(isDockerAvailable()).toBe(true);
    });

    it('should have docker-compose available', () => {
      expect(isDockerComposeAvailable()).toBe(true);
    });

    it('should validate Dockerfile syntax', () => {
      const dockerfilePath = join(process.cwd(), 'Dockerfile');
      expect(existsSync(dockerfilePath)).toBe(true);

      // Validate Dockerfile syntax by checking content
      const dockerfile = readFileSync(
        join(process.cwd(), 'Dockerfile'),
        'utf8',
      );
      expect(dockerfile).toContain('FROM node:20-alpine');
      expect(dockerfile).toContain('WORKDIR /app');
      expect(dockerfile).toContain('COPY package.json');
    });

    it('should validate docker-compose files syntax', () => {
      const composeFiles = [
        'docker-compose.yml',
        'docker-compose.workflow-validation.yml',
      ];

      for (const composeFile of composeFiles) {
        const composePath = join(process.cwd(), composeFile);
        if (existsSync(composePath)) {
          expect(() => {
            execSync(`docker-compose -f ${composeFile} config`, {
              stdio: 'pipe',
              timeout: 30000,
            });
          }).not.toThrow(`${composeFile} should have valid syntax`);
        }
      }
    });
  });

  describe('Docker-based Script Execution', () => {
    it('should execute workflow validation in Docker container', async () => {
      if (!isDockerAvailable()) {
        console.log('Skipping Docker test - Docker not available');
        return;
      }

      // Build the Docker image for testing
      expect(() => {
        execSync('docker build -t chemchat:workflow-test .', {
          stdio: 'pipe',
          timeout: 300000,
        });
      }).not.toThrow('Docker build should succeed');

      // Run workflow validation inside container
      const dockerCommand = `
        docker run --rm 
        -e NODE_ENV=test 
        -e DATABASE_URL=postgresql://test:test@localhost:5432/chemchat_test
        chemchat:workflow-test 
        npm run workflow:validate
      `
        .replace(/\s+/g, ' ')
        .trim();

      expect(() => {
        execSync(dockerCommand, {
          stdio: 'pipe',
          timeout: 120000,
        });
      }).not.toThrow('Workflow validation should succeed in Docker');
    }, 600000);

    it('should execute lint and build in Docker container', async () => {
      if (!isDockerAvailable()) {
        console.log('Skipping Docker test - Docker not available');
        return;
      }

      const testCommands = [
        'npm run lint',
        'npm run build',
        'npm run prisma:generate',
      ];

      for (const command of testCommands) {
        const dockerCommand = `
          docker run --rm 
          -e NODE_ENV=test 
          chemchat:workflow-test 
          ${command}
        `
          .replace(/\s+/g, ' ')
          .trim();

        expect(() => {
          execSync(dockerCommand, {
            stdio: 'pipe',
            timeout: 120000,
          });
        }).not.toThrow(`Command "${command}" should succeed in Docker`);
      }
    }, 600000);
  });

  describe('Docker Compose Workflow Validation', () => {
    it('should start services with docker-compose', async () => {
      if (!isDockerComposeAvailable()) {
        console.log(
          'Skipping docker-compose test - docker-compose not available',
        );
        return;
      }

      const composeFile = 'docker-compose.workflow-validation.yml';
      if (!existsSync(join(process.cwd(), composeFile))) {
        console.log(`Skipping test - ${composeFile} not found`);
        return;
      }

      try {
        // Start services
        execSync(`docker-compose -f ${composeFile} up -d`, {
          stdio: 'pipe',
          timeout: 180000,
        });

        // Wait for services to be ready
        await new Promise((resolve) => setTimeout(resolve, 30000));

        // Check if services are running
        const services = execSync(
          `docker-compose -f ${composeFile} ps --services`,
          {
            encoding: 'utf8',
            timeout: 30000,
          },
        )
          .trim()
          .split('\n');

        for (const service of services) {
          if (service.trim()) {
            const status = execSync(
              `docker-compose -f ${composeFile} ps ${service.trim()}`,
              { encoding: 'utf8', timeout: 30000 },
            );
            expect(status).toContain('Up');
          }
        }

        // Run workflow validation with services
        execSync(
          `docker-compose -f ${composeFile} exec -T chemchat-app npm run workflow:validate`,
          {
            stdio: 'pipe',
            timeout: 120000,
          },
        );
      } finally {
        // Cleanup
        try {
          execSync(`docker-compose -f ${composeFile} down -v`, {
            stdio: 'pipe',
            timeout: 60000,
          });
        } catch (error) {
          console.log('Cleanup error:', error);
        }
      }
    }, 600000);

    it('should validate database operations in Docker environment', async () => {
      if (!isDockerComposeAvailable()) {
        console.log(
          'Skipping docker-compose test - docker-compose not available',
        );
        return;
      }

      const composeFile = 'docker-compose.workflow-validation.yml';
      if (!existsSync(join(process.cwd(), composeFile))) {
        console.log(`Skipping test - ${composeFile} not found`);
        return;
      }

      try {
        // Start services
        execSync(`docker-compose -f ${composeFile} up -d postgres redis`, {
          stdio: 'pipe',
          timeout: 120000,
        });

        // Wait for database to be ready
        await new Promise((resolve) => setTimeout(resolve, 20000));

        // Test database operations
        const dbCommands = ['npm run db:validate'];

        for (const command of dbCommands) {
          execSync(
            `docker-compose -f ${composeFile} run --rm chemchat-app ${command}`,
            {
              stdio: 'pipe',
              timeout: 60000,
            },
          );
        }
      } finally {
        // Cleanup
        try {
          execSync(`docker-compose -f ${composeFile} down -v`, {
            stdio: 'pipe',
            timeout: 60000,
          });
        } catch (error) {
          console.log('Cleanup error:', error);
        }
      }
    }, 300000);
  });

  describe('Performance Testing in Docker', () => {
    it('should validate k6 load testing setup', async () => {
      if (!isDockerComposeAvailable()) {
        console.log(
          'Skipping docker-compose test - docker-compose not available',
        );
        return;
      }

      const performanceComposeFile = 'docker-compose.performance.yml';
      if (!existsSync(join(process.cwd(), performanceComposeFile))) {
        console.log(`Skipping test - ${performanceComposeFile} not found`);
        return;
      }

      // Just validate the compose file and k6 image availability
      expect(() => {
        execSync(
          `docker-compose -f docker-compose.yml -f ${performanceComposeFile} config`,
          {
            stdio: 'pipe',
            timeout: 30000,
          },
        );
      }).not.toThrow(
        'Performance docker-compose should have valid configuration',
      );

      // Pull k6 image to validate it's available
      expect(() => {
        execSync('docker pull grafana/k6:latest', {
          stdio: 'pipe',
          timeout: 120000,
        });
      }).not.toThrow('k6 Docker image should be available');
    }, 180000);
  });

  describe('CI Environment Simulation', () => {
    it('should simulate complete CI pipeline in Docker', async () => {
      if (!isDockerAvailable()) {
        console.log('Skipping Docker test - Docker not available');
        return;
      }

      // Build image with CI-like environment
      const buildCommand = `
        docker build 
        --build-arg NODE_ENV=test 
        --build-arg NODE_VERSION=20 
        -t chemchat:ci-test .
      `
        .replace(/\s+/g, ' ')
        .trim();

      expect(() => {
        execSync(buildCommand, {
          stdio: 'pipe',
          timeout: 300000,
        });
      }).not.toThrow('CI Docker build should succeed');

      // Run CI-like commands
      const ciCommands = [
        'npm run lint',
        'npm run build',
        'npm run test:unit -- --passWithNoTests',
      ];

      for (const command of ciCommands) {
        const runCommand = `
          docker run --rm 
          -e NODE_ENV=test 
          -e CI=true
          chemchat:ci-test 
          ${command}
        `
          .replace(/\s+/g, ' ')
          .trim();

        expect(() => {
          execSync(runCommand, {
            stdio: 'pipe',
            timeout: 180000,
          });
        }).not.toThrow(`CI command "${command}" should succeed`);
      }
    }, 900000);

    it('should validate Docker multi-stage build', () => {
      if (!isDockerAvailable()) {
        console.log('Skipping Docker test - Docker not available');
        return;
      }

      const dockerfile = readFileSync(
        join(process.cwd(), 'Dockerfile'),
        'utf8',
      );

      // Validate multi-stage build stages (handle SHA hash in FROM statement)
      expect(dockerfile).toMatch(/FROM node:20-alpine.*AS base/);
      expect(dockerfile).toContain('FROM base AS deps');
      expect(dockerfile).toContain('FROM base AS builder');
      expect(dockerfile).toContain('FROM base AS runner');

      // Build specific stage to validate it works
      expect(() => {
        execSync('docker build --target deps -t chemchat:deps-test .', {
          stdio: 'pipe',
          timeout: 180000,
        });
      }).not.toThrow('Docker multi-stage build should work');
    }, 300000);
  });

  afterAll(() => {
    // Cleanup any remaining test containers/images
    try {
      execSync(
        'docker rmi chemchat:workflow-test chemchat:ci-test chemchat:deps-test',
        {
          stdio: 'pipe',
          timeout: 30000,
        },
      );
    } catch {
      // Ignore cleanup errors
    }
  });
});
