/**
 * Docker-based Workflow Integration Tests
 *
 * This test suite validates the complete CI workflow execution in a Docker environment
 * that closely mirrors the actual GitHub Actions CI environment.
 *
 * Requirements: 1.1, 2.1, 6.1
 */

import { execSync } from 'child_process';
import { readFileSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';

describe('Docker Workflow Integration Tests', () => {
  const composeFile = 'docker-compose.workflow-validation.yml';
  const testTimeout = 300000; // 5 minutes for Docker operations

  beforeAll(async () => {
    console.log('🐳 Setting up Docker environment for workflow validation...');

    // Ensure docker-compose file exists
    expect(existsSync(join(process.cwd(), composeFile))).toBe(true);

    // Pull required images
    execSync('docker-compose -f docker-compose.workflow-validation.yml pull', {
      stdio: 'inherit',
      timeout: 180000,
    });

    // Start services
    execSync('docker-compose -f docker-compose.workflow-validation.yml up -d', {
      stdio: 'inherit',
      timeout: 120000,
    });

    // Wait for services to be healthy
    await waitForServices();
  }, testTimeout);

  afterAll(async () => {
    console.log('🧹 Cleaning up Docker environment...');

    try {
      execSync(
        'docker-compose -f docker-compose.workflow-validation.yml down -v',
        {
          stdio: 'inherit',
          timeout: 60000,
        },
      );
    } catch (error) {
      console.warn(
        'Warning: Failed to clean up Docker environment:',
        error.message,
      );
    }
  }, 60000);

  async function waitForServices(): Promise<void> {
    console.log('⏳ Waiting for services to be ready...');

    const services = ['postgres-test', 'redis-test', 'elasticsearch-test'];
    const maxRetries = 30;
    const retryDelay = 5000;

    for (const service of services) {
      let retries = 0;
      let healthy = false;

      while (retries < maxRetries && !healthy) {
        try {
          const result = execSync(
            `docker-compose -f ${composeFile} ps --services --filter "status=running" | grep ${service}`,
            { encoding: 'utf8', timeout: 10000 },
          );

          if (result.trim() === service) {
            // Check health status
            const healthResult = execSync(
              `docker inspect --format='{{.State.Health.Status}}' ${service}-workflow-test`,
              { encoding: 'utf8', timeout: 10000 },
            );

            if (healthResult.trim() === 'healthy') {
              healthy = true;
              console.log(`✅ ${service} is healthy`);
            }
          }
        } catch (error) {
          // Service not ready yet
        }

        if (!healthy) {
          retries++;
          if (retries < maxRetries) {
            console.log(
              `⏳ Waiting for ${service}... (${retries}/${maxRetries})`,
            );
            await new Promise((resolve) => setTimeout(resolve, retryDelay));
          }
        }
      }

      if (!healthy) {
        throw new Error(
          `Service ${service} failed to become healthy within timeout`,
        );
      }
    }
  }

  function execInContainer(command: string, timeout: number = 60000): string {
    return execSync(
      `docker-compose -f ${composeFile} exec -T chemchat-workflow-test ${command}`,
      { encoding: 'utf8', timeout },
    );
  }

  describe('Docker Environment Setup', () => {
    it('should have all required services running', () => {
      const runningServices = execSync(
        `docker-compose -f ${composeFile} ps --services --filter "status=running"`,
        { encoding: 'utf8' },
      )
        .trim()
        .split('\n');

      expect(runningServices).toContain('chemchat-workflow-test');
      expect(runningServices).toContain('postgres-test');
      expect(runningServices).toContain('redis-test');
      expect(runningServices).toContain('elasticsearch-test');
    });

    it('should have correct Node.js version in container', () => {
      const nodeVersion = execInContainer('node --version').trim();
      expect(nodeVersion).toMatch(/^v20\./);
    });

    it('should have npm available in container', () => {
      const npmVersion = execInContainer('npm --version').trim();
      expect(npmVersion).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it('should have correct environment variables set', () => {
      const envVars = execInContainer(
        'env | grep -E "(NODE_ENV|DATABASE_URL|REDIS_HOST)"',
      );

      expect(envVars).toContain('NODE_ENV=test');
      expect(envVars).toContain(
        'DATABASE_URL=postgresql://test:test@postgres-test:5432/chemchat_test',
      );
      expect(envVars).toContain('REDIS_HOST=redis-test');
    });
  });

  describe('Database Connectivity', () => {
    it('should connect to PostgreSQL successfully', () => {
      const result = execInContainer(
        'psql $DATABASE_URL -c "SELECT version();"',
        30000,
      );
      expect(result).toContain('PostgreSQL');
    });

    it('should connect to Redis successfully', () => {
      const result = execInContainer('redis-cli -h redis-test ping', 15000);
      expect(result.trim()).toBe('PONG');
    });

    it('should connect to Elasticsearch successfully', () => {
      const result = execInContainer(
        'curl -f http://elasticsearch-test:9200/_cluster/health',
        30000,
      );
      expect(result).toContain('"status"');
    });
  });

  describe('Package Script Execution in Docker', () => {
    it('should install dependencies successfully', async () => {
      expect(() => {
        execInContainer('npm install --frozen-lockfile', 180000);
      }).not.toThrow();
    }, 200000);

    it('should execute lint script successfully', async () => {
      expect(() => {
        execInContainer('npm run lint', 90000);
      }).not.toThrow();
    }, 100000);

    it('should execute build script successfully', async () => {
      expect(() => {
        execInContainer('npm run build', 180000);
      }).not.toThrow();
    }, 200000);

    it('should generate Prisma client successfully', async () => {
      expect(() => {
        execInContainer('npm run prisma:generate', 60000);
      }).not.toThrow();
    }, 70000);
  });

  describe('Database Operations in Docker', () => {
    it('should execute database migration successfully', async () => {
      expect(() => {
        execInContainer('npm run migrate:reset', 60000);
      }).not.toThrow();
    }, 70000);

    it('should execute database seeding successfully', async () => {
      expect(() => {
        execInContainer('npm run db:seed', 45000);
      }).not.toThrow();
    }, 50000);

    it('should validate database operations successfully', async () => {
      expect(() => {
        execInContainer('npm run db:validate', 30000);
      }).not.toThrow();
    }, 35000);
  });

  describe('Test Execution in Docker', () => {
    it('should execute unit tests successfully', async () => {
      expect(() => {
        execInContainer('npm run test:unit -- --passWithNoTests', 90000);
      }).not.toThrow();
    }, 100000);

    it('should execute workflow validation tests successfully', async () => {
      expect(() => {
        execInContainer('npm run test:workflow', 120000);
      }).not.toThrow();
    }, 130000);

    it('should execute integration tests successfully', async () => {
      expect(() => {
        execInContainer(
          'npm run test:integration -- --passWithNoTests',
          120000,
        );
      }).not.toThrow();
    }, 130000);
  });

  describe('CI Workflow Simulation', () => {
    it('should simulate complete CI workflow steps', async () => {
      const steps = [
        {
          name: 'Install dependencies',
          command: 'npm install --frozen-lockfile',
          timeout: 180000,
        },
        { name: 'Lint code', command: 'npm run lint', timeout: 90000 },
        { name: 'Type check', command: 'npm run build', timeout: 180000 },
        {
          name: 'Setup database',
          command: 'npm run migrate:reset && npm run db:seed',
          timeout: 90000,
        },
        {
          name: 'Run unit tests',
          command: 'npm run test:unit -- --passWithNoTests',
          timeout: 90000,
        },
      ];

      for (const step of steps) {
        console.log(`🔄 Executing: ${step.name}`);
        expect(() => {
          execInContainer(step.command, step.timeout);
        }).not.toThrow();
        console.log(`✅ Completed: ${step.name}`);
      }
    }, 600000); // 10 minutes total
  });

  describe('Performance Testing Setup', () => {
    it('should validate k6 load test files exist', () => {
      const loadTestFiles = [
        'test/load/load-test.js',
        'test/load/simple-load-test.js',
      ];

      for (const file of loadTestFiles) {
        expect(existsSync(join(process.cwd(), file))).toBe(true);
      }
    });

    it('should start application for load testing', async () => {
      // Start the application in background
      execInContainer('npm run start:prod > /tmp/app.log 2>&1 &', 10000);

      // Wait for application to start
      await new Promise((resolve) => setTimeout(resolve, 30000));

      // Check if application is responding
      expect(() => {
        execInContainer('curl -f http://localhost:3000/health', 15000);
      }).not.toThrow();
    }, 50000);

    it('should execute k6 load tests', async () => {
      // Start k6 service for load testing
      execSync(
        `docker-compose -f ${composeFile} --profile load-test run --rm k6-test run /scripts/simple-load-test.js`,
        { stdio: 'inherit', timeout: 120000 },
      );
    }, 130000);
  });

  describe('Security Validation in Docker', () => {
    it('should execute security audit successfully', async () => {
      expect(() => {
        execInContainer('npm audit --audit-level high', 60000);
      }).not.toThrow();
    }, 70000);

    it('should validate container security configuration', () => {
      // Check that container is not running as root
      const user = execInContainer('whoami').trim();
      expect(user).not.toBe('root');
    });

    it('should validate environment variable security', () => {
      const envVars = execInContainer('env');

      // Ensure no sensitive data in environment variables
      expect(envVars).not.toContain('password=');
      expect(envVars).not.toContain('secret=');
      expect(envVars).not.toContain('key=');
    });
  });

  describe('Docker Resource Validation', () => {
    it('should validate container resource usage', () => {
      const stats = execSync(
        `docker stats chemchat-workflow-validation --no-stream --format "table {{.CPUPerc}}\t{{.MemUsage}}"`,
        { encoding: 'utf8' },
      );

      expect(stats).toContain('%');
      expect(stats).toContain('MiB');
    });

    it('should validate network connectivity between services', () => {
      // Test connectivity to all services
      expect(() => {
        execInContainer('nc -z postgres-test 5432', 10000);
      }).not.toThrow();

      expect(() => {
        execInContainer('nc -z redis-test 6379', 10000);
      }).not.toThrow();

      expect(() => {
        execInContainer('nc -z elasticsearch-test 9200', 10000);
      }).not.toThrow();
    });
  });

  describe('Cleanup and Validation', () => {
    it('should validate all services can be stopped cleanly', () => {
      expect(() => {
        execSync(`docker-compose -f ${composeFile} stop`, {
          stdio: 'pipe',
          timeout: 60000,
        });
      }).not.toThrow();
    });

    it('should validate all containers can be removed cleanly', () => {
      expect(() => {
        execSync(`docker-compose -f ${composeFile} rm -f`, {
          stdio: 'pipe',
          timeout: 30000,
        });
      }).not.toThrow();
    });
  });
});
