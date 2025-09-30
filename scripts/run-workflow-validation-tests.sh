#!/bin/bash

# Workflow Validation Test Runner
# This script runs comprehensive workflow validation tests in Docker environment

set -e

echo "🚀 Starting Workflow Validation Tests in Docker..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if Docker is available
if ! command -v docker &> /dev/null; then
    print_error "Docker is not installed or not available in PATH"
    exit 1
fi

# Check if docker-compose is available
if ! command -v docker-compose &> /dev/null; then
    print_error "docker-compose is not installed or not available in PATH"
    exit 1
fi

# Create test environment
print_status "Setting up test environment..."

# Copy environment file for testing
if [ ! -f .env.test ]; then
    if [ -f .env.example ]; then
        cp .env.example .env.test
        echo "NODE_ENV=test" >> .env.test
        echo "DATABASE_URL=postgresql://test:test@postgres:5432/chemchat_test" >> .env.test
        echo "REDIS_HOST=redis" >> .env.test
        echo "REDIS_PORT=6379" >> .env.test
        echo "ELASTICSEARCH_NODE=http://elasticsearch:9200" >> .env.test
        print_success "Created .env.test file"
    else
        print_error ".env.example file not found"
        exit 1
    fi
fi

# Build the test image
print_status "Building Docker image for testing..."
docker build -t chemchat:test-validation . || {
    print_error "Failed to build Docker image"
    exit 1
}

# Start test services
print_status "Starting test services..."
docker-compose -f docker-compose.yml up -d postgres redis elasticsearch || {
    print_error "Failed to start test services"
    exit 1
}

# Wait for services to be ready
print_status "Waiting for services to be ready..."

# Wait for PostgreSQL
print_status "Waiting for PostgreSQL..."
timeout 60 bash -c 'until docker-compose exec -T postgres pg_isready -U test -d chemchat_test; do echo "Waiting for PostgreSQL..."; sleep 2; done' || {
    print_error "PostgreSQL failed to start"
    docker-compose logs postgres
    exit 1
}

# Wait for Redis
print_status "Waiting for Redis..."
timeout 60 bash -c 'until docker-compose exec -T redis redis-cli ping; do echo "Waiting for Redis..."; sleep 2; done' || {
    print_error "Redis failed to start"
    docker-compose logs redis
    exit 1
}

# Wait for Elasticsearch
print_status "Waiting for Elasticsearch..."
timeout 60 bash -c 'until curl -f http://localhost:9200/_cluster/health; do echo "Waiting for Elasticsearch..."; sleep 2; done' || {
    print_error "Elasticsearch failed to start"
    docker-compose logs elasticsearch
    exit 1
}

print_success "All services are ready!"

# Run workflow validation tests in Docker
print_status "Running workflow validation tests..."

# Test 1: Script Execution Validation
print_status "Running Script Execution Validation..."
docker run --rm \
    --network="$(docker-compose ps -q postgres | xargs docker inspect --format='{{range .NetworkSettings.Networks}}{{.NetworkID}}{{end}}' | head -1)" \
    -e NODE_ENV=test \
    -e DATABASE_URL=postgresql://test:test@postgres:5432/chemchat_test \
    -e REDIS_HOST=redis \
    -e REDIS_PORT=6379 \
    -e ELASTICSEARCH_NODE=http://elasticsearch:9200 \
    -v "$(pwd):/app" \
    -w /app \
    chemchat:test-validation \
    npm run test:workflow -- --testPathPattern=script-execution-validation.spec.ts || {
    print_error "Script execution validation failed"
    FAILED_TESTS=1
}

# Test 2: Node.js Version Consistency
print_status "Running Node.js Version Consistency Validation..."
docker run --rm \
    -v "$(pwd):/app" \
    -w /app \
    chemchat:test-validation \
    npm run test:workflow -- --testPathPattern=nodejs-version-consistency.spec.ts || {
    print_error "Node.js version consistency validation failed"
    FAILED_TESTS=1
}

# Test 3: CI Workflow Execution
print_status "Running CI Workflow Execution Validation..."
docker run --rm \
    --network="$(docker-compose ps -q postgres | xargs docker inspect --format='{{range .NetworkSettings.Networks}}{{.NetworkID}}{{end}}' | head -1)" \
    -e NODE_ENV=test \
    -e DATABASE_URL=postgresql://test:test@postgres:5432/chemchat_test \
    -e REDIS_HOST=redis \
    -e REDIS_PORT=6379 \
    -e ELASTICSEARCH_NODE=http://elasticsearch:9200 \
    -v "$(pwd):/app" \
    -w /app \
    chemchat:test-validation \
    npm run test:workflow -- --testPathPattern=ci-workflow-execution.spec.ts || {
    print_error "CI workflow execution validation failed"
    FAILED_TESTS=1
}

# Test 4: Complete Workflow Validation
print_status "Running Complete Workflow Validation..."
docker run --rm \
    --network="$(docker-compose ps -q postgres | xargs docker inspect --format='{{range .NetworkSettings.Networks}}{{.NetworkID}}{{end}}' | head -1)" \
    -e NODE_ENV=test \
    -e DATABASE_URL=postgresql://test:test@postgres:5432/chemchat_test \
    -e REDIS_HOST=redis \
    -e REDIS_PORT=6379 \
    -e ELASTICSEARCH_NODE=http://elasticsearch:9200 \
    -v "$(pwd):/app" \
    -w /app \
    chemchat:test-validation \
    npm run test:workflow -- --testPathPattern=complete-workflow-execution.spec.ts || {
    print_error "Complete workflow validation failed"
    FAILED_TESTS=1
}

# Test 5: Original Workflow Validation
print_status "Running Original Workflow Validation..."
docker run --rm \
    --network="$(docker-compose ps -q postgres | xargs docker inspect --format='{{range .NetworkSettings.Networks}}{{.NetworkID}}{{end}}' | head -1)" \
    -e NODE_ENV=test \
    -e DATABASE_URL=postgresql://test:test@postgres:5432/chemchat_test \
    -e REDIS_HOST=redis \
    -e REDIS_PORT=6379 \
    -e ELASTICSEARCH_NODE=http://elasticsearch:9200 \
    -v "$(pwd):/app" \
    -w /app \
    chemchat:test-validation \
    npm run test:workflow -- --testPathPattern=workflow-validation.spec.ts || {
    print_error "Original workflow validation failed"
    FAILED_TESTS=1
}

# Run simple workflow validation (non-Docker dependent)
print_status "Running Simple Workflow Validation..."
docker run --rm \
    -v "$(pwd):/app" \
    -w /app \
    chemchat:test-validation \
    npm run workflow:validate || {
    print_error "Simple workflow validation failed"
    FAILED_TESTS=1
}

# Cleanup
print_status "Cleaning up test environment..."
docker-compose down -v || print_warning "Failed to clean up docker-compose services"

# Remove test environment file
rm -f .env.test

# Final results
echo ""
echo "=========================================="
if [ "${FAILED_TESTS:-0}" -eq 1 ]; then
    print_error "Some workflow validation tests failed!"
    echo "=========================================="
    exit 1
else
    print_success "All workflow validation tests passed!"
    echo "=========================================="
    print_success "✅ Script Execution Validation: PASSED"
    print_success "✅ Node.js Version Consistency: PASSED"
    print_success "✅ CI Workflow Execution: PASSED"
    print_success "✅ Complete Workflow Validation: PASSED"
    print_success "✅ Original Workflow Validation: PASSED"
    print_success "✅ Simple Workflow Validation: PASSED"
    echo "=========================================="
    print_success "🎉 All comprehensive workflow validation tests completed successfully!"
fi