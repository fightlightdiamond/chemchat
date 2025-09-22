#!/bin/bash

# ChemChat System Integration and Testing Script
# This script runs comprehensive system tests including integration, load, and disaster recovery tests

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
TEST_ENV=${TEST_ENV:-test}
LOAD_TEST_DURATION=${LOAD_TEST_DURATION:-5m}
CONCURRENT_USERS=${CONCURRENT_USERS:-50}
BASE_URL=${BASE_URL:-http://localhost:3000}
WS_URL=${WS_URL:-ws://localhost:3000}

echo -e "${BLUE}🚀 ChemChat System Integration Testing${NC}"
echo "=================================="
echo "Environment: $TEST_ENV"
echo "Base URL: $BASE_URL"
echo "WebSocket URL: $WS_URL"
echo "Load Test Duration: $LOAD_TEST_DURATION"
echo "Concurrent Users: $CONCURRENT_USERS"
echo ""

# Function to check if service is running
check_service() {
    local service_name=$1
    local url=$2
    local max_attempts=30
    local attempt=1

    echo -e "${YELLOW}Checking $service_name...${NC}"
    
    while [ $attempt -le $max_attempts ]; do
        if curl -s "$url" > /dev/null 2>&1; then
            echo -e "${GREEN}✅ $service_name is running${NC}"
            return 0
        fi
        
        echo -e "${YELLOW}⏳ Waiting for $service_name (attempt $attempt/$max_attempts)${NC}"
        sleep 2
        ((attempt++))
    done
    
    echo -e "${RED}❌ $service_name is not responding${NC}"
    return 1
}

# Function to run tests with error handling
run_test_suite() {
    local test_name=$1
    local test_command=$2
    
    echo -e "${BLUE}🧪 Running $test_name${NC}"
    echo "Command: $test_command"
    echo ""
    
    if eval "$test_command"; then
        echo -e "${GREEN}✅ $test_name PASSED${NC}"
        return 0
    else
        echo -e "${RED}❌ $test_name FAILED${NC}"
        return 1
    fi
}

# Function to setup test environment
setup_test_environment() {
    echo -e "${BLUE}🔧 Setting up test environment${NC}"
    
    # Copy test environment file
    if [ ! -f .env.test ]; then
        echo "Creating .env.test file..."
        cp .env.example .env.test
        
        # Update test-specific configurations
        sed -i '' 's/DATABASE_URL=.*/DATABASE_URL="postgresql:\/\/postgres:password@localhost:5432\/chemchat_test"/' .env.test
        sed -i '' 's/REDIS_HOST=.*/REDIS_HOST=localhost/' .env.test
        sed -i '' 's/REDIS_PORT=.*/REDIS_PORT=6379/' .env.test
        sed -i '' 's/REDIS_DB=.*/REDIS_DB=1/' .env.test
        sed -i '' 's/ELASTICSEARCH_NODE=.*/ELASTICSEARCH_NODE=http:\/\/localhost:9200/' .env.test
    fi
    
    # Install dependencies if needed
    if [ ! -d node_modules ]; then
        echo "Installing dependencies..."
        npm install
    fi
    
    # Build the application
    echo "Building application..."
    npm run build
    
    echo -e "${GREEN}✅ Test environment setup complete${NC}"
}

# Function to start required services
start_services() {
    echo -e "${BLUE}🚀 Starting required services${NC}"
    
    # Check if Docker is running
    if ! docker info > /dev/null 2>&1; then
        echo -e "${RED}❌ Docker is not running. Please start Docker Desktop.${NC}"
        exit 1
    fi
    
    # Start services using docker-compose
    if [ -f docker-compose.yml ]; then
        echo "Starting services with Docker Compose..."
        docker-compose -f docker-compose.yml up -d postgres redis elasticsearch kafka zookeeper
        
        # Wait for services to be ready
        sleep 10
        
        # Check service health
        check_service "PostgreSQL" "postgresql://postgres:password@localhost:5432"
        check_service "Redis" "redis://localhost:6379"
        check_service "Elasticsearch" "http://localhost:9200"
    else
        echo -e "${YELLOW}⚠️  docker-compose.yml not found. Assuming services are already running.${NC}"
    fi
    
    echo -e "${GREEN}✅ Services started successfully${NC}"
}

# Function to run database migrations
run_migrations() {
    echo -e "${BLUE}🗄️  Running database migrations${NC}"
    
    # Run Prisma migrations
    npx prisma migrate deploy --schema=./prisma/schema.prisma
    
    # Generate Prisma client
    npx prisma generate --schema=./prisma/schema.prisma
    
    echo -e "${GREEN}✅ Database migrations completed${NC}"
}

# Function to seed test data
seed_test_data() {
    echo -e "${BLUE}🌱 Seeding test data${NC}"
    
    # Run test data seeding if script exists
    if [ -f scripts/seed-test-data.js ]; then
        node scripts/seed-test-data.js
    else
        echo -e "${YELLOW}⚠️  Test data seeding script not found. Skipping.${NC}"
    fi
    
    echo -e "${GREEN}✅ Test data seeding completed${NC}"
}

# Function to run unit and integration tests
run_unit_integration_tests() {
    echo -e "${BLUE}🧪 Running Unit and Integration Tests${NC}"
    
    local failed_tests=0
    
    # Run unit tests
    if ! run_test_suite "Unit Tests" "npm run test:unit"; then
        ((failed_tests++))
    fi
    
    # Run integration tests
    if ! run_test_suite "Integration Tests" "npm run test:integration"; then
        ((failed_tests++))
    fi
    
    # Run system integration tests
    if ! run_test_suite "System Integration Tests" "npm run test -- test/integration/system-integration.spec.ts"; then
        ((failed_tests++))
    fi
    
    return $failed_tests
}

# Function to run end-to-end tests
run_e2e_tests() {
    echo -e "${BLUE}🌐 Running End-to-End Tests${NC}"
    
    local failed_tests=0
    
    # Start the application in background
    echo "Starting application for E2E tests..."
    npm start &
    APP_PID=$!
    
    # Wait for application to start
    sleep 10
    check_service "ChemChat API" "$BASE_URL/health"
    
    # Run E2E tests
    if ! run_test_suite "End-to-End Tests" "npm run test:e2e"; then
        ((failed_tests++))
    fi
    
    # Stop the application
    kill $APP_PID 2>/dev/null || true
    
    return $failed_tests
}

# Function to run load tests
run_load_tests() {
    echo -e "${BLUE}⚡ Running Load Tests${NC}"
    
    # Check if k6 is installed
    if ! command -v k6 &> /dev/null; then
        echo -e "${YELLOW}⚠️  k6 not found. Installing k6...${NC}"
        if [[ "$OSTYPE" == "darwin"* ]]; then
            brew install k6
        else
            echo -e "${RED}❌ Please install k6 manually: https://k6.io/docs/getting-started/installation/${NC}"
            return 1
        fi
    fi
    
    # Start the application
    echo "Starting application for load testing..."
    npm start &
    APP_PID=$!
    
    # Wait for application to start
    sleep 10
    check_service "ChemChat API" "$BASE_URL/health"
    
    # Run load tests
    local failed_tests=0
    
    export BASE_URL=$BASE_URL
    export WS_URL=$WS_URL
    
    if ! run_test_suite "Load Tests" "k6 run test/system/load-test-scenarios.js"; then
        ((failed_tests++))
    fi
    
    # Stop the application
    kill $APP_PID 2>/dev/null || true
    
    return $failed_tests
}

# Function to run disaster recovery tests
run_disaster_recovery_tests() {
    echo -e "${BLUE}🚨 Running Disaster Recovery Tests${NC}"
    
    local failed_tests=0
    
    if ! run_test_suite "Disaster Recovery Tests" "npm run test -- test/system/disaster-recovery.spec.ts"; then
        ((failed_tests++))
    fi
    
    return $failed_tests
}

# Function to run security compliance tests
run_security_tests() {
    echo -e "${BLUE}🔒 Running Security Compliance Tests${NC}"
    
    local failed_tests=0
    
    # Start the application
    echo "Starting application for security testing..."
    npm start &
    APP_PID=$!
    
    # Wait for application to start
    sleep 10
    check_service "ChemChat API" "$BASE_URL/health"
    
    if ! run_test_suite "Security Compliance Tests" "npm run test -- test/system/security-compliance.spec.ts"; then
        ((failed_tests++))
    fi
    
    # Stop the application
    kill $APP_PID 2>/dev/null || true
    
    return $failed_tests
}

# Function to generate test report
generate_test_report() {
    local total_failed=$1
    
    echo ""
    echo -e "${BLUE}📊 Test Report Summary${NC}"
    echo "========================"
    
    if [ $total_failed -eq 0 ]; then
        echo -e "${GREEN}🎉 All tests passed successfully!${NC}"
        echo -e "${GREEN}✅ System is ready for production deployment${NC}"
    else
        echo -e "${RED}❌ $total_failed test suite(s) failed${NC}"
        echo -e "${RED}🚨 System requires fixes before production deployment${NC}"
    fi
    
    echo ""
    echo "Test artifacts:"
    echo "- Load test results: load-test-results.json"
    echo "- Load test summary: load-test-summary.html"
    echo "- Test coverage: coverage/"
    echo ""
    
    # Generate timestamp for report
    echo "Test completed at: $(date)"
    echo "Environment: $TEST_ENV"
    echo "Total failed test suites: $total_failed"
}

# Function to cleanup test environment
cleanup_test_environment() {
    echo -e "${BLUE}🧹 Cleaning up test environment${NC}"
    
    # Stop any running processes
    pkill -f "npm start" 2>/dev/null || true
    pkill -f "node" 2>/dev/null || true
    
    # Stop Docker services if they were started by this script
    if [ -f docker-compose.yml ]; then
        docker-compose -f docker-compose.yml down
    fi
    
    echo -e "${GREEN}✅ Cleanup completed${NC}"
}

# Main execution flow
main() {
    local total_failed=0
    
    # Trap to ensure cleanup on exit
    trap cleanup_test_environment EXIT
    
    echo -e "${BLUE}Starting ChemChat System Testing Pipeline${NC}"
    echo ""
    
    # Setup phase
    setup_test_environment
    start_services
    run_migrations
    seed_test_data
    
    echo ""
    echo -e "${BLUE}🎯 Beginning Test Execution${NC}"
    echo ""
    
    # Test execution phase
    if ! run_unit_integration_tests; then
        ((total_failed++))
    fi
    
    if ! run_e2e_tests; then
        ((total_failed++))
    fi
    
    if ! run_load_tests; then
        ((total_failed++))
    fi
    
    if ! run_disaster_recovery_tests; then
        ((total_failed++))
    fi
    
    if ! run_security_tests; then
        ((total_failed++))
    fi
    
    # Report generation
    generate_test_report $total_failed
    
    # Exit with appropriate code
    if [ $total_failed -eq 0 ]; then
        exit 0
    else
        exit 1
    fi
}

# Script execution
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
