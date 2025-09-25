/**
 * Database Scripts Unit Tests
 *
 * These tests validate that database scripts are properly configured
 * and available in package.json
 */

import { readFileSync } from 'fs';
import { join } from 'path';

describe('Database Scripts Configuration', () => {
  let packageJson: any;

  beforeAll(() => {
    const packageJsonPath = join(process.cwd(), 'package.json');
    const packageJsonContent = readFileSync(packageJsonPath, 'utf8');
    packageJson = JSON.parse(packageJsonContent);
  });

  describe('Package.json Scripts', () => {
    it('should have migrate:reset script defined', () => {
      expect(packageJson.scripts).toHaveProperty('migrate:reset');
      expect(packageJson.scripts['migrate:reset']).toBe(
        'prisma migrate reset --force',
      );
    });

    it('should have db:seed script defined', () => {
      expect(packageJson.scripts).toHaveProperty('db:seed');
      expect(packageJson.scripts['db:seed']).toBe(
        'ts-node scripts/basic-seed.ts',
      );
    });

    it('should have db:validate script defined', () => {
      expect(packageJson.scripts).toHaveProperty('db:validate');
      expect(packageJson.scripts['db:validate']).toBe(
        'ts-node scripts/validate-database-operations.ts',
      );
    });

    it('should have db:test-ci script defined', () => {
      expect(packageJson.scripts).toHaveProperty('db:test-ci');
      expect(packageJson.scripts['db:test-ci']).toBe(
        './scripts/ci-database-test.sh',
      );
    });

    it('should have all required test scripts', () => {
      const requiredTestScripts = ['test:unit', 'test:integration', 'test:e2e'];

      for (const script of requiredTestScripts) {
        expect(packageJson.scripts).toHaveProperty(script);
        expect(packageJson.scripts[script]).toBeDefined();
        expect(packageJson.scripts[script]).not.toBe('');
      }
    });
  });

  describe('Script Files Existence', () => {
    it('should have basic-seed.ts file', () => {
      expect(() => {
        readFileSync(join(process.cwd(), 'scripts/basic-seed.ts'), 'utf8');
      }).not.toThrow();
    });

    it('should have validate-database-operations.ts file', () => {
      expect(() => {
        readFileSync(
          join(process.cwd(), 'scripts/validate-database-operations.ts'),
          'utf8',
        );
      }).not.toThrow();
    });

    it('should have ci-database-test.sh file', () => {
      expect(() => {
        readFileSync(
          join(process.cwd(), 'scripts/ci-database-test.sh'),
          'utf8',
        );
      }).not.toThrow();
    });

    it('should have prisma schema file', () => {
      expect(() => {
        readFileSync(join(process.cwd(), 'prisma/schema.prisma'), 'utf8');
      }).not.toThrow();
    });
  });

  describe('Script Content Validation', () => {
    it('should have proper shebang in basic-seed.ts', () => {
      const content = readFileSync(
        join(process.cwd(), 'scripts/basic-seed.ts'),
        'utf8',
      );
      expect(content).toMatch(/^#!/);
      expect(content).toContain('ts-node');
    });

    it('should have proper shebang in ci-database-test.sh', () => {
      const content = readFileSync(
        join(process.cwd(), 'scripts/ci-database-test.sh'),
        'utf8',
      );
      expect(content).toMatch(/^#!/);
      expect(content).toContain('bash');
    });

    it('should import PrismaClient in basic-seed.ts', () => {
      const content = readFileSync(
        join(process.cwd(), 'scripts/basic-seed.ts'),
        'utf8',
      );
      expect(content).toContain('PrismaClient');
      expect(content).toContain('@prisma/client');
    });

    it('should have proper error handling in scripts', () => {
      const seedContent = readFileSync(
        join(process.cwd(), 'scripts/basic-seed.ts'),
        'utf8',
      );
      expect(seedContent).toContain('catch');
      expect(seedContent).toContain('error');

      const validatorContent = readFileSync(
        join(process.cwd(), 'scripts/validate-database-operations.ts'),
        'utf8',
      );
      expect(validatorContent).toContain('catch');
      expect(validatorContent).toContain('error');

      const ciTestContent = readFileSync(
        join(process.cwd(), 'scripts/ci-database-test.sh'),
        'utf8',
      );
      expect(ciTestContent).toContain('set -e');
    });
  });

  describe('Environment Variable Requirements', () => {
    it('should document required environment variables', () => {
      const validatorContent = readFileSync(
        join(process.cwd(), 'scripts/validate-database-operations.ts'),
        'utf8',
      );
      expect(validatorContent).toContain('DATABASE_URL');
      expect(validatorContent).toContain('NODE_ENV');

      const ciTestContent = readFileSync(
        join(process.cwd(), 'scripts/ci-database-test.sh'),
        'utf8',
      );
      expect(ciTestContent).toContain('DATABASE_URL');
      expect(ciTestContent).toContain('NODE_ENV');
    });

    it('should have proper environment variable validation', () => {
      const validatorContent = readFileSync(
        join(process.cwd(), 'scripts/validate-database-operations.ts'),
        'utf8',
      );
      expect(validatorContent).toContain('validateEnvironmentVariables');
      expect(validatorContent).toContain('required_vars');

      const ciTestContent = readFileSync(
        join(process.cwd(), 'scripts/ci-database-test.sh'),
        'utf8',
      );
      expect(ciTestContent).toContain('required_vars');
      expect(ciTestContent).toContain('if [ -z');
    });
  });
});
