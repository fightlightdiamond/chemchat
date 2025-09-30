import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';

describe('CD Deployment Compatibility Tests', () => {
  describe('Kubernetes Manifest Validation', () => {
    it('should have all required Kubernetes manifest files', () => {
      const requiredFiles = [
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

      requiredFiles.forEach((file) => {
        expect(fs.existsSync(file)).toBe(true);
      });
    });

    it('should have correct image references in deployment manifest', () => {
      const deploymentContent = fs.readFileSync(
        'k8s/chemchat-deployment.yaml',
        'utf8',
      );

      // Should have placeholder for image replacement (CD workflow compatibility)
      expect(deploymentContent).toContain('image: chemchat:latest');

      // Should have proper health check paths (deployment compatibility)
      expect(deploymentContent).toContain('path: /health');
      expect(deploymentContent).toContain('path: /health/ready');
    });

    it('should have correct database references in migration job', () => {
      const migrationContent = fs.readFileSync(
        'k8s/migration-job.yaml',
        'utf8',
      );

      // Should reference correct postgres service (deployment compatibility)
      expect(migrationContent).toContain('postgres-service');

      // Should use correct database name
      expect(migrationContent).toContain('chemchat');

      // Should reference correct secret keys (fixed in task 9)
      expect(migrationContent).toContain('POSTGRES_PASSWORD');
    });
  });

  describe('CD Workflow Configuration', () => {
    it('should have correct registry configuration', () => {
      const cdWorkflowContent = fs.readFileSync(
        '.github/workflows/cd.yml',
        'utf8',
      );

      // Registry configuration (task 9 requirement)
      expect(cdWorkflowContent).toContain('REGISTRY: ghcr.io');
      expect(cdWorkflowContent).toContain(
        'IMAGE_NAME: ${{ github.repository }}',
      );
    });

    it('should have proper deployment steps with health checks', () => {
      const cdWorkflowContent = fs.readFileSync(
        '.github/workflows/cd.yml',
        'utf8',
      );

      // Should have staging deployment
      expect(cdWorkflowContent).toContain('deploy-staging');

      // Should have production deployment
      expect(cdWorkflowContent).toContain('deploy-production');

      // Should have rollback mechanism (task 9 requirement)
      expect(cdWorkflowContent).toContain('rollback');

      // Should have health check validation (task 9 requirement)
      expect(cdWorkflowContent).toContain(
        'curl -f https://api.chemchat.com/health',
      );
      expect(cdWorkflowContent).toContain(
        'curl -f https://staging-api.chemchat.com/health',
      );
    });

    it('should have correct image tagging strategy', () => {
      const cdWorkflowContent = fs.readFileSync(
        '.github/workflows/cd.yml',
        'utf8',
      );

      // Should create environment-specific deployment files (task 9 fix)
      expect(cdWorkflowContent).toContain(
        'cp k8s/chemchat-deployment.yaml k8s/chemchat-deployment-staging.yaml',
      );
      expect(cdWorkflowContent).toContain(
        'cp k8s/chemchat-deployment.yaml k8s/chemchat-deployment-production.yaml',
      );

      // Should have proper image tag replacement (task 9 fix)
      expect(cdWorkflowContent).toContain(
        '${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${{ github.sha }}',
      );
    });
  });

  describe('Docker Configuration Validation', () => {
    it('should have correct Dockerfile configuration', () => {
      const dockerfileContent = fs.readFileSync('Dockerfile', 'utf8');

      // Should use Node.js 20 (consistency requirement)
      expect(dockerfileContent).toContain('node:20');

      // Should have health check (deployment compatibility)
      expect(dockerfileContent).toContain('HEALTHCHECK');

      // Should expose port 3000
      expect(dockerfileContent).toContain('EXPOSE 3000');
    });

    it('should have docker-compose configuration for testing', () => {
      expect(fs.existsSync('docker-compose.yml')).toBe(true);
      expect(fs.existsSync('docker-compose.workflow-validation.yml')).toBe(
        true,
      );
    });
  });

  describe('Health Check Endpoint Configuration', () => {
    it('should have health controller with required endpoints', () => {
      const healthControllerContent = fs.readFileSync(
        'src/health/health.controller.ts',
        'utf8',
      );

      // Should have main health endpoint
      expect(healthControllerContent).toContain('@Get()');

      // Should have readiness endpoint (required for K8s deployment)
      expect(healthControllerContent).toContain("@Get('ready')");

      // Should have liveness endpoint (required for K8s deployment)
      expect(healthControllerContent).toContain("@Get('live')");
    });
  });
});
