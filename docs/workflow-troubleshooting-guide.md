# GitHub Workflow Troubleshooting Guide

## Overview

This guide provides solutions for common issues encountered with the ChemChat GitHub workflows. It covers CI/CD pipeline failures, deployment issues, and general troubleshooting procedures.

## Quick Diagnosis Checklist

Before diving into specific issues, run through this quick checklist:

1. ✅ Check workflow status in GitHub Actions tab
2. ✅ Verify all required secrets are configured
3. ✅ Confirm Node.js version consistency (should be 20)
4. ✅ Validate package.json scripts exist
5. ✅ Check service dependencies are running
6. ✅ Review recent commits for breaking changes

## Common CI Pipeline Issues

### 1. Missing Scripts Error

**Symptom**:

```
npm ERR! missing script: migrate:reset
npm ERR! missing script: db:seed
```

**Cause**: Required scripts not defined in package.json

**Solution**:

```bash
# Verify scripts exist in package.json
npm run migrate:reset --dry-run
npm run db:seed --dry-run

# If missing, add to package.json:
{
  "scripts": {
    "migrate:reset": "prisma migrate reset --force",
    "db:seed": "ts-node scripts/basic-seed.ts"
  }
}
```

**Prevention**: Always validate package.json scripts before pushing changes.

### 2. Node.js Version Mismatch

**Symptom**:

```
Error: The engine "node" is incompatible with this module
Expected version ">=20.0.0". Got "18.x.x"
```

**Cause**: Inconsistent Node.js versions between workflows and package.json

**Solution**:

```yaml
# Update .github/workflows/*.yml
env:
  NODE_VERSION: '20'

# In setup steps:
- name: Setup Node.js
  uses: actions/setup-node@v4
  with:
    node-version: ${{ env.NODE_VERSION }}
```

**Verification**:

```bash
# Run validation script
npm run validate:nodejs-version
```

### 3. Database Connection Failures

**Symptom**:

```
Error: connect ECONNREFUSED 127.0.0.1:5432
```

**Cause**: Database service not ready or incorrect connection parameters

**Solution**:

```yaml
# Add proper service health checks
services:
  postgres:
    image: postgres:15-alpine
    env:
      POSTGRES_PASSWORD: test
      POSTGRES_USER: test
      POSTGRES_DB: chemchat_test
    options: >-
      --health-cmd pg_isready
      --health-interval 10s
      --health-timeout 5s
      --health-retries 5
    ports:
      - 5432:5432

# Add wait step before database operations
- name: Wait for PostgreSQL
  run: |
    timeout 60 bash -c 'until pg_isready -h localhost -p 5432 -U test; do sleep 2; done'
```

**Debug Commands**:

```bash
# Check database connectivity
docker-compose exec postgres pg_isready -U test
docker-compose logs postgres

# Validate database URL
echo $DATABASE_URL
```

### 4. Redis Connection Issues

**Symptom**:

```
Error: Redis connection failed: ECONNREFUSED
```

**Cause**: Redis service not available or authentication issues

**Solution**:

```yaml
# Ensure Redis service is properly configured
services:
  redis:
    image: redis:7-alpine
    options: >-
      --health-cmd "redis-cli ping"
      --health-interval 10s
      --health-timeout 5s
      --health-retries 5
    ports:
      - 6379:6379

# Add Redis connectivity check
- name: Wait for Redis
  run: |
    timeout 60 bash -c 'until redis-cli -h localhost -p 6379 ping; do sleep 2; done'
```

### 5. Test Failures Due to Missing Dependencies

**Symptom**:

```
Cannot find module '@testcontainers/postgresql'
```

**Cause**: Test dependencies not installed or outdated

**Solution**:

```bash
# Clear npm cache and reinstall
npm cache clean --force
rm -rf node_modules package-lock.json
npm install

# Update test dependencies
npm update @testcontainers/postgresql
npm update jest @types/jest
```

## Security Workflow Issues

### 1. Snyk Token Missing

**Symptom**:

```
Error: Snyk token is required but not provided
```

**Cause**: SNYK_TOKEN secret not configured

**Solution**:

1. Go to repository Settings → Secrets and variables → Actions
2. Add `SNYK_TOKEN` with your Snyk API token
3. Ensure the token has appropriate permissions

**Alternative**: Skip Snyk if token unavailable:

```yaml
- name: Run Snyk security scan
  if: ${{ secrets.SNYK_TOKEN != '' }}
  uses: snyk/actions/node@master
```

### 2. npm Audit Failures

**Symptom**:

```
npm audit found 5 high severity vulnerabilities
```

**Cause**: Vulnerable dependencies in package.json

**Solution**:

```bash
# Review vulnerabilities
npm audit

# Fix automatically where possible
npm audit fix

# For manual fixes, update specific packages
npm update package-name

# For unfixable issues, add to audit exceptions
npm audit --audit-level moderate
```

### 3. Container Scanning Failures

**Symptom**:

```
Trivy scan failed: image not found
```

**Cause**: Docker image not built or tagged incorrectly

**Solution**:

```bash
# Verify image exists
docker images | grep chemchat

# Rebuild image with correct tag
docker build -t chemchat:security-scan .

# Check Dockerfile for issues
docker build --no-cache -t chemchat:security-scan .
```

## Performance Testing Issues

### 1. k6 Installation Failures

**Symptom**:

```
k6: command not found
```

**Cause**: k6 not properly installed in CI environment

**Solution**:

```yaml
# Use Docker-based k6 instead of local installation
- name: Pull k6 Docker image
  run: docker pull grafana/k6:latest

- name: Verify k6 installation
  run: docker run --rm grafana/k6:latest version

# Run tests with Docker
- name: Run load tests
  run: |
    docker run --rm -v $(pwd)/test/load:/scripts \
      grafana/k6:latest run /scripts/load-test.js
```

### 2. Load Test File Not Found

**Symptom**:

```
Error: Load test file not found at test/load/load-test.js
```

**Cause**: Missing or incorrectly named load test files

**Solution**:

```bash
# Verify test file exists
ls -la test/load/

# Create missing test file if needed
mkdir -p test/load
cp test/load/simple-load-test.js test/load/load-test.js

# Validate test file syntax
node -c test/load/load-test.js
```

### 3. Docker Compose Service Startup Issues

**Symptom**:

```
ERROR: Service 'chemchat-app' failed to build
```

**Cause**: Docker compose configuration issues or missing environment files

**Solution**:

```bash
# Create required environment file
cp .env.example .env.docker

# Validate docker-compose configuration
docker-compose -f docker-compose.yml -f docker-compose.performance.yml config

# Check for missing services
docker-compose -f docker-compose.yml -f docker-compose.performance.yml ps

# View service logs
docker-compose logs chemchat-app
```

## Deployment Issues

### 1. Kubernetes Connection Failures

**Symptom**:

```
Error: Unable to connect to the server: x509: certificate signed by unknown authority
```

**Cause**: Invalid or missing Kubernetes configuration

**Solution**:

```bash
# Verify kubeconfig secret is properly base64 encoded
echo "${{ secrets.KUBE_CONFIG_STAGING }}" | base64 -d > kubeconfig
kubectl --kubeconfig=kubeconfig cluster-info

# Test connection
kubectl --kubeconfig=kubeconfig get nodes
```

**Debug Steps**:

1. Verify secret exists in GitHub repository settings
2. Ensure kubeconfig is valid and not expired
3. Check cluster accessibility from GitHub Actions IP ranges

### 2. Docker Image Pull Failures

**Symptom**:

```
Error: Failed to pull image "ghcr.io/repo/chemchat:sha"
```

**Cause**: Image not pushed or registry authentication issues

**Solution**:

```yaml
# Ensure proper registry login
- name: Log in to Container Registry
  uses: docker/login-action@v3
  with:
    registry: ${{ env.REGISTRY }}
    username: ${{ github.actor }}
    password: ${{ secrets.GITHUB_TOKEN }}

# Verify image was pushed
- name: Verify image exists
  run: |
    docker pull ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${{ github.sha }}
```

### 3. Database Migration Failures

**Symptom**:

```
Error: Migration failed: relation "users" already exists
```

**Cause**: Migration state inconsistency or concurrent migrations

**Solution**:

```bash
# Check migration status
kubectl exec -n chemchat deployment/postgres -- \
  psql -U chemchat -d chemchat -c "SELECT * FROM _prisma_migrations;"

# Reset migration state if needed
kubectl apply -f k8s/migration-reset-job.yaml

# Run migrations with proper locking
kubectl apply -f k8s/migration-job.yaml
kubectl wait --for=condition=complete job/chemchat-migration -n chemchat --timeout=600s
```

### 4. Health Check Failures

**Symptom**:

```
Health check failed: HTTP 503 Service Unavailable
```

**Cause**: Application not fully started or dependencies unavailable

**Solution**:

```bash
# Check pod status
kubectl get pods -n chemchat

# View application logs
kubectl logs -n chemchat deployment/chemchat-api --tail=100

# Check service endpoints
kubectl get endpoints -n chemchat

# Test health endpoint directly
kubectl port-forward -n chemchat deployment/chemchat-api 3000:3000
curl http://localhost:3000/health
```

## Environment-Specific Issues

### 1. Staging Environment Issues

**Common Problems**:

- Outdated staging database schema
- Incorrect environment variables
- Resource constraints

**Solutions**:

```bash
# Reset staging environment
kubectl delete namespace chemchat-staging
kubectl apply -f k8s/namespace.yaml

# Verify staging configuration
kubectl get configmap chemchat-config-staging -n chemchat-staging -o yaml

# Check resource usage
kubectl top pods -n chemchat-staging
```

### 2. Production Deployment Rollbacks

**When to Rollback**:

- Health checks fail after deployment
- Critical functionality broken
- Performance degradation detected

**Rollback Procedure**:

```bash
# Automatic rollback (built into CD pipeline)
kubectl rollout undo deployment/chemchat-api -n chemchat

# Manual rollback to specific revision
kubectl rollout history deployment/chemchat-api -n chemchat
kubectl rollout undo deployment/chemchat-api -n chemchat --to-revision=2

# Verify rollback
kubectl rollout status deployment/chemchat-api -n chemchat
```

## Monitoring and Debugging

### 1. Workflow Logs Analysis

**Accessing Logs**:

1. Go to GitHub repository → Actions tab
2. Select failed workflow run
3. Click on failed job to view detailed logs
4. Use "Download logs" for offline analysis

**Key Log Sections**:

- Setup steps (Node.js, dependencies)
- Test execution output
- Build and deployment logs
- Error stack traces

### 2. Real-time Debugging

**Enable Debug Logging**:

```yaml
# Add to workflow environment
env:
  ACTIONS_STEP_DEBUG: true
  ACTIONS_RUNNER_DEBUG: true
```

**SSH into Runner** (for self-hosted runners):

```yaml
- name: Setup tmate session
  uses: mxschmitt/action-tmate@v3
  if: failure()
```

### 3. Artifact Collection

**Collect Debug Artifacts**:

```yaml
- name: Upload debug artifacts
  uses: actions/upload-artifact@v4
  if: failure()
  with:
    name: debug-logs
    path: |
      logs/
      coverage/
      test-results/
      *.log
```

## Performance Optimization

### 1. Slow CI Builds

**Common Causes**:

- Large Docker images
- Inefficient dependency installation
- Slow test execution

**Solutions**:

```yaml
# Optimize Docker build
- name: Set up Docker Buildx
  uses: docker/setup-buildx-action@v3

- name: Build with cache
  uses: docker/build-push-action@v5
  with:
    cache-from: type=gha
    cache-to: type=gha,mode=max

# Optimize npm installation
- name: Setup Node.js
  uses: actions/setup-node@v4
  with:
    node-version: '20'
    cache: 'npm'

# Parallel test execution
- name: Run tests in parallel
  run: npm run test:ci -- --maxWorkers=4
```

### 2. Resource Constraints

**Symptoms**:

- Out of memory errors
- Timeout failures
- Slow performance

**Solutions**:

```yaml
# Increase job timeout
jobs:
  test:
    timeout-minutes: 30

# Optimize memory usage
- name: Run tests with memory limit
  run: npm run test:ci -- --maxWorkers=2 --workerIdleMemoryLimit=512MB
```

## Preventive Measures

### 1. Pre-commit Hooks

```bash
# Install pre-commit hooks
npm install --save-dev husky lint-staged

# Add to package.json
{
  "husky": {
    "hooks": {
      "pre-commit": "lint-staged"
    }
  },
  "lint-staged": {
    "*.{ts,js}": ["eslint --fix", "prettier --write"],
    "*.{json,md}": ["prettier --write"]
  }
}
```

### 2. Local Validation

```bash
# Validate workflows locally
npm run validate:scripts
npm run validate:nodejs-version
npm run validate:ci-workflow

# Test Docker build locally
docker build -t chemchat:local .
docker run --rm chemchat:local npm run test:unit
```

### 3. Dependency Management

```bash
# Regular dependency updates
npm audit
npm update
npm outdated

# Security scanning
npm audit --audit-level moderate
npx snyk test
```

## Emergency Procedures

### 1. Critical Production Issue

1. **Immediate Response**:

   ```bash
   # Rollback to last known good version
   kubectl rollout undo deployment/chemchat-api -n chemchat
   ```

2. **Incident Communication**:
   - Notify stakeholders via Slack
   - Update status page
   - Document incident timeline

3. **Root Cause Analysis**:
   - Collect logs and metrics
   - Identify failure point
   - Implement permanent fix

### 2. Complete Pipeline Failure

1. **Bypass CI** (emergency only):

   ```bash
   # Manual deployment with proper testing
   docker build -t chemchat:emergency .
   docker tag chemchat:emergency ghcr.io/repo/chemchat:emergency
   docker push ghcr.io/repo/chemchat:emergency
   ```

2. **Restore CI**:
   - Identify and fix root cause
   - Test fix in feature branch
   - Gradually re-enable pipeline components

## Getting Help

### 1. Internal Resources

- Check existing GitHub Issues and Discussions
- Review workflow run history for patterns
- Consult team documentation and runbooks

### 2. External Resources

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Docker Documentation](https://docs.docker.com/)
- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [Node.js Troubleshooting Guide](https://nodejs.org/en/docs/guides/debugging-getting-started/)

### 3. Community Support

- GitHub Actions Community Forum
- Stack Overflow with relevant tags
- Docker Community Forums
- Kubernetes Slack channels

Remember: Always test fixes in a non-production environment first, and maintain detailed documentation of any changes made during troubleshooting.
