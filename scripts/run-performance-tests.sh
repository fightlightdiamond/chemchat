#!/bin/bash

# Performance Testing Script for ChemChat
# This script runs k6 load tests using Docker
# Usage: ./run-performance-tests.sh [simple|full]

set -e

TEST_TYPE=${1:-simple}

echo "🚀 Starting ChemChat Performance Tests (${TEST_TYPE})"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    print_error "Docker is not running. Please start Docker and try again."
    exit 1
fi

# Check if docker-compose is available
if ! command -v docker-compose &> /dev/null; then
    print_error "docker-compose is not installed. Please install docker-compose and try again."
    exit 1
fi

# Create test results directory
mkdir -p test-results

print_status "Pulling latest k6 Docker image..."
docker pull grafana/k6:latest

print_status "Starting ChemChat services..."
docker-compose -f docker-compose.yml -f docker-compose.performance.yml up -d --build

print_status "Waiting for services to be healthy..."

# Wait for PostgreSQL
print_status "Waiting for PostgreSQL..."
timeout 120 bash -c 'until docker-compose exec -T postgres pg_isready -U chemchat -d chatdb; do echo "Waiting for PostgreSQL..."; sleep 5; done' || {
    print_error "PostgreSQL failed to start"
    docker-compose -f docker-compose.yml -f docker-compose.performance.yml logs postgres
    exit 1
}

# Wait for Redis
print_status "Waiting for Redis..."
timeout 120 bash -c 'until docker-compose exec -T redis redis-cli -a redis_password ping; do echo "Waiting for Redis..."; sleep 5; done' || {
    print_error "Redis failed to start"
    docker-compose -f docker-compose.yml -f docker-compose.performance.yml logs redis
    exit 1
}

# Wait for Elasticsearch
print_status "Waiting for Elasticsearch..."
timeout 120 bash -c 'until curl -f http://localhost:9200/_cluster/health; do echo "Waiting for Elasticsearch..."; sleep 5; done' || {
    print_error "Elasticsearch failed to start"
    docker-compose -f docker-compose.yml -f docker-compose.performance.yml logs elasticsearch
    exit 1
}

# Wait for ChemChat application
print_status "Waiting for ChemChat application..."
timeout 300 bash -c 'until curl -f http://localhost:3000/health; do echo "Waiting for ChemChat app..."; sleep 10; done' || {
    print_error "ChemChat application failed to start"
    docker-compose -f docker-compose.yml -f docker-compose.performance.yml logs chemchat-app
    exit 1
}

print_status "All services are ready! Starting performance tests..."

# Choose test script and service based on test type
if [ "$TEST_TYPE" = "simple" ]; then
    TEST_SCRIPT="simple-load-test.js"
    K6_SERVICE="k6-simple"
    print_status "Running simple health check performance test..."
else
    TEST_SCRIPT="load-test.js"
    K6_SERVICE="k6"
    print_status "Running full load test suite..."
fi

# Run the performance tests
if docker-compose -f docker-compose.yml -f docker-compose.performance.yml run --rm $K6_SERVICE \
    run /scripts/$TEST_SCRIPT --out json=/results/test-results.json; then
    print_status "Performance tests completed successfully!"
    
    # Display results if available
    if [ -f "test-results/test-results.json" ]; then
        print_status "Test results saved to test-results/test-results.json"
        
        # Extract key metrics (if jq is available)
        if command -v jq &> /dev/null; then
            echo ""
            echo "📊 Key Performance Metrics:"
            echo "================================"
            
            # HTTP request duration
            http_req_duration=$(jq -r '.metrics.http_req_duration | select(.!=null) | .values.p95' test-results/test-results.json 2>/dev/null || echo "N/A")
            echo "HTTP Request Duration (p95): ${http_req_duration}ms"
            
            # HTTP request failure rate
            http_req_failed=$(jq -r '.metrics.http_req_failed | select(.!=null) | .values.rate' test-results/test-results.json 2>/dev/null || echo "N/A")
            echo "HTTP Request Failure Rate: ${http_req_failed}"
            
            # WebSocket connection success rate
            ws_success=$(jq -r '.metrics.ws_connection_success | select(.!=null) | .values.rate' test-results/test-results.json 2>/dev/null || echo "N/A")
            echo "WebSocket Connection Success Rate: ${ws_success}"
            
            echo "================================"
        fi
    fi
else
    print_error "Performance tests failed!"
    
    print_warning "Displaying service logs for debugging:"
    echo ""
    echo "=== ChemChat App Logs ==="
    docker-compose -f docker-compose.yml -f docker-compose.performance.yml logs --tail=50 chemchat-app
    echo ""
    echo "=== PostgreSQL Logs ==="
    docker-compose -f docker-compose.yml -f docker-compose.performance.yml logs --tail=20 postgres
    echo ""
    echo "=== Redis Logs ==="
    docker-compose -f docker-compose.yml -f docker-compose.performance.yml logs --tail=20 redis
    
    exit 1
fi

# Cleanup
print_status "Cleaning up services..."
docker-compose -f docker-compose.yml -f docker-compose.performance.yml down -v

print_status "Performance testing completed! 🎉"