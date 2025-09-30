#!/bin/bash

# Script to run CD deployment compatibility tests inside Docker container
set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

error() {
    echo -e "${RED}[ERROR] $1${NC}"
    exit 1
}

# Check if docker-compose is running
check_containers() {
    log "Checking if containers are running..."
    
    if ! docker-compose -f docker-compose.yml -f docker-compose.workflow-validation.yml ps | grep -q "Up"; then
        log "Starting containers..."
        docker-compose -f docker-compose.yml -f docker-compose.workflow-validation.yml up -d --build
        
        # Wait for containers to be ready
        log "Waiting for containers to be ready..."
        sleep 30
    fi
    
    # Get the container name/ID for chemchat-app
    CONTAINER_NAME=$(docker-compose -f docker-compose.yml -f docker-compose.workflow-validation.yml ps -q chemchat-app)
    
    if [ -z "$CONTAINER_NAME" ]; then
        error "ChemChat app container not found or not running"
    fi
    
    log "Using container: $CONTAINER_NAME"
}

# Run tests inside the container
run_tests_in_container() {
    log "Running CD deployment compatibility tests inside Docker container..."
    
    # Run the specific test file inside the container
    docker exec "$CONTAINER_NAME" npm run test -- test/system/cd-deployment-compatibility.spec.ts --testTimeout=300000
    
    if [ $? -eq 0 ]; then
        log "✅ CD deployment compatibility tests passed!"
    else
        error "❌ CD deployment compatibility tests failed!"
    fi
}

# Main execution
main() {
    log "Starting CD deployment tests in Docker..."
    
    check_containers
    run_tests_in_container
    
    log "CD deployment tests completed successfully!"
}

# Run main function
main "$@"