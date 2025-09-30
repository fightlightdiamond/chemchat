#!/bin/bash

# Test CD Deployment Compatibility Script
# This script simulates CD workflow operations in a local Docker environment

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

warn() {
    echo -e "${YELLOW}[WARNING] $1${NC}"
}

error() {
    echo -e "${RED}[ERROR] $1${NC}"
    exit 1
}

# Check prerequisites
check_prerequisites() {
    log "Checking prerequisites..."
    
    if ! command -v docker &> /dev/null; then
        error "Docker is not installed or not in PATH"
    fi
    
    if ! command -v docker-compose &> /dev/null; then
        error "Docker Compose is not installed or not in PATH"
    fi
    
    if ! docker info &> /dev/null; then
        error "Docker daemon is not running"
    fi
    
    log "Prerequisites check passed"
}

# Validate Kubernetes manifests
validate_k8s_manifests() {
    log "Validating Kubernetes manifest files..."
    
    local manifests=(
        "k8s/namespace.yaml"
        "k8s/configmap.yaml"
        "k8s/secrets.yaml"
        "k8s/postgres.yaml"
        "k8s/redis.yaml"
        "k8s/elasticsearch.yaml"
        "k8s/kafka.yaml"
        "k8s/chemchat-deployment.yaml"
        "k8s/hpa.yaml"
        "k8s/ingress.yaml"
        "k8s/migration-job.yaml"
    )
    
    for manifest in "${manifests[@]}"; do
        if [[ ! -f "$manifest" ]]; then
            error "Required manifest file not found: $manifest"
        fi
        log "✓ Found $manifest"
    done
    
    # Check if deployment has correct image placeholder
    if ! grep -q "image: chemchat:latest" k8s/chemchat-deployment.yaml; then
        error "Deployment manifest should have 'image: chemchat:latest' placeholder"
    fi
    
    # Check health check paths
    if ! grep -q "path: /health" k8s/chemchat-deployment.yaml; then
        error "Deployment manifest missing health check path"
    fi
    
    if ! grep -q "path: /health/ready" k8s/chemchat-deployment.yaml; then
        error "Deployment manifest missing readiness check path"
    fi
    
    log "Kubernetes manifests validation passed"
}

# Test Docker image building and tagging
test_docker_image_tagging() {
    log "Testing Docker image building and tagging..."
    
    # Build image with test tag
    log "Building Docker image..."
    docker build -t chemchat:test . || error "Failed to build Docker image"
    
    # Verify image exists
    if ! docker images chemchat:test --format "{{.Repository}}:{{.Tag}}" | grep -q "chemchat:test"; then
        error "Built image not found"
    fi
    
    # Test image tagging (simulating CD workflow)
    docker tag chemchat:test chemchat:staging-$(date +%Y%m%d-%H%M%S)
    docker tag chemchat:test chemchat:production-$(date +%Y%m%d-%H%M%S)
    
    log "Docker image tagging test passed"
}

# Test deployment with docker-compose
test_deployment() {
    log "Testing deployment with docker-compose..."
    
    # Clean up any existing containers
    docker-compose -f docker-compose.yml -f docker-compose.workflow-validation.yml down -v || true
    
    # Start services
    log "Starting services..."
    docker-compose -f docker-compose.yml -f docker-compose.workflow-validation.yml up -d --build
    
    # Wait for services to start
    log "Waiting for services to start..."
    sleep 30
    
    # Check if containers are running
    local running_containers
    running_containers=$(docker-compose -f docker-compose.yml -f docker-compose.workflow-validation.yml ps --services --filter "status=running")
    
    if ! echo "$running_containers" | grep -q "postgres"; then
        error "PostgreSQL container is not running"
    fi
    
    if ! echo "$running_containers" | grep -q "redis"; then
        error "Redis container is not running"
    fi
    
    if ! echo "$running_containers" | grep -q "chemchat-app"; then
        error "ChemChat app container is not running"
    fi
    
    log "All services are running"
}

# Test database operations (simulating CD workflow database tasks)
test_database_operations() {
    log "Testing database operations..."
    
    # Test database connectivity
    log "Testing database connectivity..."
    docker-compose -f docker-compose.yml -f docker-compose.workflow-validation.yml exec -T chemchat-app npm run db:status || error "Database connectivity test failed"
    
    # Test database migration
    log "Testing database migration..."
    docker-compose -f docker-compose.yml -f docker-compose.workflow-validation.yml exec -T chemchat-app npm run migrate:deploy || error "Database migration failed"
    
    # Test database backup (simulating CD workflow backup)
    log "Testing database backup..."
    docker-compose -f docker-compose.yml -f docker-compose.workflow-validation.yml exec -T postgres pg_dump -U chemchat chemchat > backup-test-$(date +%Y%m%d-%H%M%S).sql || error "Database backup failed"
    
    log "Database operations test passed"
}

# Test health check endpoints (from inside container network)
test_health_checks() {
    log "Testing health check endpoints from inside container network..."
    
    # Wait for app to be fully ready
    sleep 20
    
    # Test main health endpoint from inside container
    log "Testing /health endpoint from inside container..."
    if ! docker-compose -f docker-compose.yml -f docker-compose.workflow-validation.yml exec -T chemchat-app curl -f http://localhost:3000/health; then
        error "Health check endpoint failed"
    fi
    
    # Test readiness endpoint from inside container
    log "Testing /health/ready endpoint from inside container..."
    if ! docker-compose -f docker-compose.yml -f docker-compose.workflow-validation.yml exec -T chemchat-app curl -f http://localhost:3000/health/ready; then
        error "Readiness check endpoint failed"
    fi
    
    # Test liveness endpoint from inside container
    log "Testing /health/live endpoint from inside container..."
    if ! docker-compose -f docker-compose.yml -f docker-compose.workflow-validation.yml exec -T chemchat-app curl -f http://localhost:3000/health/live; then
        error "Liveness check endpoint failed"
    fi
    
    log "Health check endpoints test passed"
}

# Test rollback mechanism
test_rollback_mechanism() {
    log "Testing rollback mechanism..."
    
    # Create a "previous" version
    docker tag chemchat:test chemchat:previous
    
    # Create a "new" version (simulate deployment)
    docker tag chemchat:test chemchat:new
    
    # Simulate rollback
    log "Simulating rollback to previous version..."
    docker tag chemchat:previous chemchat:test
    
    # Restart service with "rolled back" version
    docker-compose -f docker-compose.yml -f docker-compose.workflow-validation.yml up -d chemchat-app
    
    # Wait for restart
    sleep 20
    
    # Verify service is still healthy after rollback (from inside container)
    if ! docker-compose -f docker-compose.yml -f docker-compose.workflow-validation.yml exec -T chemchat-app curl -f http://localhost:3000/health; then
        error "Service not healthy after rollback"
    fi
    
    log "Rollback mechanism test passed"
}

# Cleanup
cleanup() {
    log "Cleaning up..."
    docker-compose -f docker-compose.yml -f docker-compose.workflow-validation.yml down -v || true
    
    # Remove test images
    docker rmi chemchat:test chemchat:previous chemchat:new || true
    docker rmi $(docker images chemchat --filter "dangling=true" -q) 2>/dev/null || true
    
    # Remove backup files
    rm -f backup-test-*.sql
    
    log "Cleanup completed"
}

# Main execution
main() {
    log "Starting CD Deployment Compatibility Tests"
    
    # Set trap for cleanup on exit
    trap cleanup EXIT
    
    check_prerequisites
    validate_k8s_manifests
    test_docker_image_tagging
    test_deployment
    test_database_operations
    test_health_checks
    test_rollback_mechanism
    
    log "All CD deployment compatibility tests passed! ✅"
}

# Run main function
main "$@"