#!/bin/bash

# Simple Docker-based Workflow Validation Test Runner
# This script runs workflow validation tests using Docker Compose

set -e

echo "🐳 Running Workflow Validation Tests in Docker..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if Docker and docker-compose are available
if ! command -v docker &> /dev/null; then
    print_error "Docker is not installed"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    print_error "docker-compose is not installed"
    exit 1
fi

# Cleanup function
cleanup() {
    print_status "Cleaning up..."
    docker-compose -f docker-compose.workflow-validation.yml down -v --remove-orphans 2>/dev/null || true
}

# Set trap for cleanup
trap cleanup EXIT

# Start services and run tests
print_status "Starting test services..."
docker-compose -f docker-compose.workflow-validation.yml up -d postgres redis elasticsearch

# Wait for services to be healthy
print_status "Waiting for services to be ready..."
docker-compose -f docker-compose.workflow-validation.yml exec -T postgres pg_isready -U test -d chemchat_test || {
    print_status "Waiting for PostgreSQL to be ready..."
    sleep 10
    docker-compose -f docker-compose.workflow-validation.yml exec -T postgres pg_isready -U test -d chemchat_test
}

docker-compose -f docker-compose.workflow-validation.yml exec -T redis redis-cli ping || {
    print_status "Waiting for Redis to be ready..."
    sleep 5
    docker-compose -f docker-compose.workflow-validation.yml exec -T redis redis-cli ping
}

# Test 1: Simple workflow validation (no external dependencies)
print_status "Running Simple Workflow Validation..."
if docker-compose -f docker-compose.workflow-validation.yml run --rm simple-validator; then
    print_success "✅ Simple Workflow Validation: PASSED"
else
    print_error "❌ Simple Workflow Validation: FAILED"
    FAILED_TESTS=1
fi

# Test 2: Node.js version consistency
print_status "Running Node.js Version Consistency Validation..."
if docker-compose -f docker-compose.workflow-validation.yml run --rm node-validator; then
    print_success "✅ Node.js Version Consistency: PASSED"
else
    print_error "❌ Node.js Version Consistency: FAILED"
    FAILED_TESTS=1
fi

# Test 3: Script execution validation
print_status "Running Script Execution Validation..."
if docker-compose -f docker-compose.workflow-validation.yml run --rm script-validator; then
    print_success "✅ Script Execution Validation: PASSED"
else
    print_error "❌ Script Execution Validation: FAILED"
    FAILED_TESTS=1
fi

# Test 4: CI workflow execution validation
print_status "Running CI Workflow Execution Validation..."
if docker-compose -f docker-compose.workflow-validation.yml run --rm ci-validator; then
    print_success "✅ CI Workflow Execution: PASSED"
else
    print_error "❌ CI Workflow Execution: FAILED"
    FAILED_TESTS=1
fi

# Test 5: Complete workflow validation
print_status "Running Complete Workflow Validation..."
if docker-compose -f docker-compose.workflow-validation.yml run --rm complete-validator; then
    print_success "✅ Complete Workflow Validation: PASSED"
else
    print_error "❌ Complete Workflow Validation: FAILED"
    FAILED_TESTS=1
fi

# Final results
echo ""
echo "=========================================="
if [ "${FAILED_TESTS:-0}" -eq 1 ]; then
    print_error "❌ Some workflow validation tests failed!"
    echo "=========================================="
    exit 1
else
    print_success "🎉 All workflow validation tests passed!"
    echo "=========================================="
fi