import { describe, it, expect, beforeAll } from '@jest/globals';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

describe('CD Workflow Validation', () => {
  const workspaceRoot = process.cwd();
  const dockerComposeFiles = [
    'docker-compose.yml',
    'docker-compose.override.yml',
    'docker-compose.minimal.yml',
    'docker-compose.performance.yml',
  ];
  const workflowFile = path.join(workspaceRoot, '.github/workflows/cd.yml');

  beforeAll(() => {
    // Ensure we're in the correct directory
    expect(fs.existsSync(workflowFile)).toBe(true);
    dockerComposeFiles.forEach((file) => {
      expect(fs.existsSync(path.join(workspaceRoot, file))).toBe(true);
    });
  });

  describe('Docker Compose Configuration', () => {
    it.each(dockerComposeFiles)('should have valid %s file', (composeFile) => {
      const filePath = path.join(workspaceRoot, composeFile);
      expect(fs.existsSync(filePath)).toBe(true);

      const content = fs.readFileSync(filePath, 'utf8');
      expect(content.trim()).not.toBe('');

      // Validate YAML syntax
      expect(() => yaml.load(content)).not.toThrow();
    });

    it('should have required services in main docker-compose.yml', () => {
      const mainComposeFile = path.join(workspaceRoot, 'docker-compose.yml');
      const content = fs.readFileSync(mainComposeFile, 'utf8');
      const compose = yaml.load(content) as any;

      const requiredServices = [
        'postgres',
        'redis',
        'elasticsearch',
        'kafka',
        'chemchat-app',
      ];

      requiredServices.forEach((service) => {
        expect(compose.services).toHaveProperty(service);
      });
    });

    it('should have proper health checks for core services', () => {
      const mainComposeFile = path.join(workspaceRoot, 'docker-compose.yml');
      const content = fs.readFileSync(mainComposeFile, 'utf8');
      const compose = yaml.load(content) as any;

      // Check postgres health check
      expect(compose.services.postgres.healthcheck).toBeDefined();
      expect(compose.services.postgres.healthcheck.test).toContain(
        'pg_isready',
      );

      // Check redis health check
      expect(compose.services.redis.healthcheck).toBeDefined();

      // Check chemchat-app health check
      expect(compose.services['chemchat-app'].healthcheck).toBeDefined();
      expect(compose.services['chemchat-app'].healthcheck.test).toContain(
        '/health',
      );
    });

    it('should have proper environment configuration', () => {
      const mainComposeFile = path.join(workspaceRoot, 'docker-compose.yml');
      const content = fs.readFileSync(mainComposeFile, 'utf8');
      const compose = yaml.load(content) as any;

      const app = compose.services['chemchat-app'];
      expect(app.env_file).toBeDefined();
      expect(app.environment).toBeDefined();

      // Check for required environment variables
      const envVars = app.environment;
      const hasNodeEnv = envVars.some((env: string) =>
        env.includes('NODE_ENV'),
      );
      expect(hasNodeEnv).toBe(true);
    });

    it('should have proper volume configuration', () => {
      const mainComposeFile = path.join(workspaceRoot, 'docker-compose.yml');
      const content = fs.readFileSync(mainComposeFile, 'utf8');
      const compose = yaml.load(content) as any;

      // Check that volumes are defined
      expect(compose.volumes).toBeDefined();
      expect(compose.volumes).toHaveProperty('postgres_data');
      expect(compose.volumes).toHaveProperty('redis_data');

      // Check that services use volumes
      expect(compose.services.postgres.volumes).toBeDefined();
      expect(compose.services.redis.volumes).toBeDefined();
    });

    it('should have performance testing configuration', () => {
      const perfComposeFile = path.join(
        workspaceRoot,
        'docker-compose.performance.yml',
      );
      const content = fs.readFileSync(perfComposeFile, 'utf8');
      const compose = yaml.load(content) as any;

      expect(compose.services).toHaveProperty('k6');
      expect(compose.services).toHaveProperty('k6-simple');

      const k6Service = compose.services.k6;
      expect(k6Service.image).toBe('grafana/k6:latest');
      expect(k6Service.volumes).toContain('./test/load:/scripts');
    });
  });

  describe('CD Workflow Configuration', () => {
    let workflowContent: string;
    let workflow: any;

    beforeAll(() => {
      workflowContent = fs.readFileSync(workflowFile, 'utf8');
      workflow = yaml.load(workflowContent) as any;
    });

    it('should have correct registry configuration', () => {
      expect(workflow.env.REGISTRY).toBe('ghcr.io');
      expect(workflow.env.IMAGE_NAME).toBe('${{ github.repository }}');
      expect(workflow.env.DOCKER_COMPOSE_VERSION).toBeDefined();
    });

    it('should have staging deployment job', () => {
      expect(workflow.jobs['deploy-staging']).toBeDefined();

      const stagingJob = workflow.jobs['deploy-staging'];
      expect(stagingJob.environment.name).toBe('staging');
      expect(stagingJob.environment.url).toBe(
        'https://staging-api.chemchat.com',
      );
    });

    it('should have production deployment job', () => {
      expect(workflow.jobs['deploy-production']).toBeDefined();

      const prodJob = workflow.jobs['deploy-production'];
      expect(prodJob.environment.name).toBe('production');
      expect(prodJob.environment.url).toBe('https://api.chemchat.com');
      expect(prodJob.needs).toContain('deploy-staging');
    });

    it('should have rollback job', () => {
      expect(workflow.jobs['rollback']).toBeDefined();

      const rollbackJob = workflow.jobs['rollback'];
      expect(rollbackJob.needs).toContain('deploy-production');
      expect(rollbackJob.if).toContain('failure()');
    });

    it('should create environment-specific configurations', () => {
      const stagingSteps = workflow.jobs['deploy-staging'].steps;
      const createEnvStep = stagingSteps.find(
        (step: any) => step.name === 'Create staging environment file',
      );

      expect(createEnvStep).toBeDefined();
      expect(createEnvStep.run).toContain('.env.staging');
      expect(createEnvStep.run).toContain('NODE_ENV=staging');

      const createComposeStep = stagingSteps.find(
        (step: any) => step.name === 'Create staging docker-compose override',
      );

      expect(createComposeStep).toBeDefined();
      expect(createComposeStep.run).toContain('docker-compose.staging.yml');
    });

    it('should have proper health checks', () => {
      const stagingSteps = workflow.jobs['deploy-staging'].steps;
      const smokeTestStep = stagingSteps.find(
        (step: any) => step.name === 'Run staging smoke tests',
      );

      expect(smokeTestStep).toBeDefined();
      expect(smokeTestStep.run).toContain(
        'curl -f https://staging-api.chemchat.com/health',
      );
      expect(smokeTestStep.run).toContain(
        'curl -f https://staging-api.chemchat.com/api/docs',
      );

      const prodSteps = workflow.jobs['deploy-production'].steps;
      const prodSmokeTestStep = prodSteps.find(
        (step: any) => step.name === 'Run production smoke tests',
      );

      expect(prodSmokeTestStep).toBeDefined();
      expect(prodSmokeTestStep.run).toContain(
        'curl -f https://api.chemchat.com/health',
      );
      expect(prodSmokeTestStep.run).toContain('socket.io-client');
    });

    it('should have blue-green deployment strategy', () => {
      const prodSteps = workflow.jobs['deploy-production'].steps;
      const deployStep = prodSteps.find(
        (step: any) =>
          step.name === 'Deploy to production with blue-green strategy',
      );

      expect(deployStep).toBeDefined();
      expect(deployStep.uses).toBe('appleboy/ssh-action@v1.0.0');
      expect(deployStep.with.script).toContain('blue-green deployment');
      expect(deployStep.with.script).toContain('canary');
      expect(deployStep.with.script).toContain('rollback');
    });

    it('should have database backup and migration', () => {
      const prodSteps = workflow.jobs['deploy-production'].steps;

      const deployStep = prodSteps.find(
        (step: any) =>
          step.name === 'Deploy to production with blue-green strategy',
      );

      expect(deployStep.with.script).toContain('pg_dump');
      expect(deployStep.with.script).toContain('migrate:deploy');
    });

    it('should use SSH deployment for remote servers', () => {
      const stagingSteps = workflow.jobs['deploy-staging'].steps;
      const deployStep = stagingSteps.find(
        (step: any) => step.name === 'Deploy to staging server',
      );

      expect(deployStep).toBeDefined();
      expect(deployStep.uses).toBe('appleboy/ssh-action@v1.0.0');
      expect(deployStep.with).toHaveProperty('host');
      expect(deployStep.with).toHaveProperty('username');
      expect(deployStep.with).toHaveProperty('key');
    });
  });

  describe('Docker Image Tagging', () => {
    it('should validate image tag replacement logic', () => {
      const workflowContent = fs.readFileSync(workflowFile, 'utf8');

      // Check staging image tag replacement
      expect(workflowContent).toContain(
        '${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${{ github.sha }}',
      );

      // Check production image tag replacement with conditional logic
      expect(workflowContent).toContain(
        'if [[ $GITHUB_REF == refs/tags/* ]]; then',
      );
      expect(workflowContent).toContain('TAG=${GITHUB_REF#refs/tags/}');
      expect(workflowContent).toContain('${{ steps.tag.outputs.tag }}');
    });

    it('should use correct docker-compose override files', () => {
      const workflowContent = fs.readFileSync(workflowFile, 'utf8');

      // Check that staging uses staging-specific compose file
      expect(workflowContent).toContain('docker-compose.staging.yml');

      // Check that production uses production-specific compose file
      expect(workflowContent).toContain('docker-compose.production.yml');
    });
  });

  describe('Health Check Endpoints', () => {
    it('should validate health endpoint availability in source code', () => {
      const healthControllerPath = path.join(
        workspaceRoot,
        'src/health/health.controller.ts',
      );
      expect(fs.existsSync(healthControllerPath)).toBe(true);

      const content = fs.readFileSync(healthControllerPath, 'utf8');
      expect(content).toContain('@Get()');
      expect(content).toContain("@Get('ready')");
      expect(content).toContain("@Get('live')");
    });

    it('should validate Dockerfile health check', () => {
      const dockerfilePath = path.join(workspaceRoot, 'Dockerfile');
      expect(fs.existsSync(dockerfilePath)).toBe(true);

      const content = fs.readFileSync(dockerfilePath, 'utf8');
      expect(content).toContain('HEALTHCHECK');
      expect(content).toContain('/health');
    });
  });

  describe('Rollback Mechanism', () => {
    it('should have proper rollback configuration', () => {
      const workflowContent = fs.readFileSync(workflowFile, 'utf8');
      const workflow = yaml.load(workflowContent) as any;

      const rollbackJob = workflow.jobs['rollback'];
      expect(rollbackJob.if).toContain('failure()');
      expect(rollbackJob.needs).toContain('deploy-production');

      const rollbackSteps = rollbackJob.steps;
      const rollbackStep = rollbackSteps.find(
        (step: any) => step.name === 'Rollback production deployment',
      );

      expect(rollbackStep).toBeDefined();
      expect(rollbackStep.uses).toBe('appleboy/ssh-action@v1.0.0');
      expect(rollbackStep.with.script).toContain(
        'Rolling back to previous version',
      );
    });
  });

  describe('Environment Configuration', () => {
    it('should have example environment file', () => {
      const envExamplePath = path.join(workspaceRoot, '.env.example');
      expect(fs.existsSync(envExamplePath)).toBe(true);

      const content = fs.readFileSync(envExamplePath, 'utf8');
      expect(content).toContain('NODE_ENV');
      expect(content).toContain('DATABASE_URL');
    });

    it('should have docker-specific environment files', () => {
      const dockerEnvFiles = ['.env.docker', '.env.docker.test'];

      dockerEnvFiles.forEach((envFile) => {
        const envPath = path.join(workspaceRoot, envFile);
        if (fs.existsSync(envPath)) {
          const content = fs.readFileSync(envPath, 'utf8');
          expect(content.trim()).not.toBe('');
        }
      });
    });
  });

  describe('Migration Scripts', () => {
    it('should have migration scripts available', () => {
      const packageJsonPath = path.join(workspaceRoot, 'package.json');
      const content = fs.readFileSync(packageJsonPath, 'utf8');
      const packageJson = JSON.parse(content);

      expect(packageJson.scripts).toHaveProperty('migrate:deploy');
      expect(packageJson.scripts).toHaveProperty('migrate:reset');
    });

    it('should have seed scripts available', () => {
      const packageJsonPath = path.join(workspaceRoot, 'package.json');
      const content = fs.readFileSync(packageJsonPath, 'utf8');
      const packageJson = JSON.parse(content);

      expect(packageJson.scripts).toHaveProperty('db:seed');

      const seedScriptPath = path.join(workspaceRoot, 'scripts/basic-seed.ts');
      expect(fs.existsSync(seedScriptPath)).toBe(true);
    });
  });
});
