#!/bin/bash

# Comprehensive Workflow Validation Script
# This script runs all workflow validation tests in Docker environment
# Requirements: 1.1, 2.1, 6.1

set -e

echo "🚀 Starting Comprehensive Workflow Validation in Docker"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    local color=$1
    local message=$2
    echo -e "${color}${message}${NC}"
}

# Function to check if Docker is running
check_docker() {
    print_status $BLUE "🐳 Checking Docker availability..."
    
    if ! command -v docker &> /dev/null; then
        print_status $RED "❌ Docker is not installed or not in PATH"
        exit 1
    fi
    
    if ! docker info &> /dev/null; then
        print_status $RED "❌ Docker daemon is not running"
        exit 1
    fi
    
    if ! command -v docker-compose &> /dev/null; then
        print_status $RED "❌ Docker Compose is not installed or not in PATH"
        exit 1
    fi
    
    print_status $GREEN "✅ Docker and Docker Compose are available"
}

# Function to cleanup previous runs
cleanup_previous() {
    print_status $BLUE "🧹 Cleaning up previous Docker containers..."
    
    docker-compose -f docker-compose.workflow-validation.yml down -v --remove-orphans 2>/dev/null || true
    docker system prune -f --volumes 2>/dev/null || true
    
    print_status $GREEN "✅ Cleanup completed"
}

# Function to validate Docker Compose file
validate_compose_file() {
    print_status $BLUE "📋 Validating Docker Compose configuration..."
    
    if [ ! -f "docker-compose.workflow-validation.yml" ]; then
        print_status $RED "❌ Docker Compose file not found: docker-compose.workflow-validation.yml"
        exit 1
    fi
    
    if ! docker-compose -f docker-compose.workflow-validation.yml config &> /dev/null; then
        print_status $RED "❌ Docker Compose file is invalid"
        docker-compose -f docker-compose.workflow-validation.yml config
        exit 1
    fi
    
    print_status $GREEN "✅ Docker Compose configuration is valid"
}

# Function to pull Docker images
pull_images() {
    print_status $BLUE "📥 Pulling required Docker images..."
    
    docker-compose -f docker-compose.workflow-validation.yml pull --quiet
    
    print_status $GREEN "✅ Docker images pulled successfully"
}

# Function to build application image
build_application() {
    print_status $BLUE "🔨 Building application Docker image..."
    
    docker-compose -f docker-compose.workflow-validation.yml build --no-cache chemchat-workflow-test
    
    print_status $GREEN "✅ Application image built successfully"
}

# Function to start services
start_services() {
    print_status $BLUE "🚀 Starting Docker services..."
    
    docker-compose -f docker-compose.workflow-validation.yml up -d
    
    print_status $GREEN "✅ Docker services started"
}

# Function to wait for services to be healthy
wait_for_services() {
    print_status $BLUE "⏳ Waiting for services to be healthy..."
    
    local services=("postgres-workflow-test" "redis-workflow-test" "elasticsearch-workflow-test")
    local max_retries=30
    local retry_delay=10
    
    for service in "${services[@]}"; do
        local retries=0
        local healthy=false
        
        print_status $YELLOW "⏳ Waiting for $service to be healthy..."
        
        while [ $retries -lt $max_retries ] && [ "$healthy" = false ]; do
            if docker inspect --format='{{.State.Health.Status}}' "$service" 2>/dev/null | grep -q "healthy"; then
                healthy=true
                print_status $GREEN "✅ $service is healthy"
            else
                retries=$((retries + 1))
                if [ $retries -lt $max_retries ]; then
                    print_status $YELLOW "⏳ $service not ready yet, retrying... ($retries/$max_retries)"
                    sleep $retry_delay
                fi
            fi
        done
        
        if [ "$healthy" = false ]; then
            print_status $RED "❌ $service failed to become healthy within timeout"
            print_status $RED "Service logs:"
            docker-compose -f docker-compose.workflow-validation.yml logs "$service"
            exit 1
        fi
    done
    
    print_status $GREEN "✅ All services are healthy"
}

# Function to run workflow validation tests
run_validation_tests() {
    print_status $BLUE "🧪 Running workflow validation tests..."
    
    # Run the comprehensive Docker-based integration tests
    if docker-compose -f docker-compose.workflow-validation.yml exec -T chemchat-workflow-test npm run test:workflow; then
        print_status $GREEN "✅ Workflow validation tests passed"
    else
        print_status $RED "❌ Workflow validation tests failed"
        return 1
    fi
}

# Function to run script execution validation
run_script_validation() {
    print_status $BLUE "📜 Running script execution validation..."
    
    local scripts=(
        "npm install --frozen-lockfile"
        "npm run lint"
        "npm run prisma:generate"
        "npm run workflow:validate"
    )
    
    for script in "${scripts[@]}"; do
        print_status $YELLOW "🔄 Executing: $script"
        
        if docker-compose -f docker-compose.workflow-validation.yml exec -T chemchat-workflow-test bash -c "$script"; then
            print_status $GREEN "✅ Script executed successfully: $script"
        else
            print_status $RED "❌ Script failed: $script"
            return 1
        fi
    done
    
    print_status $GREEN "✅ All scripts executed successfully"
}

# Function to run load testing validation
run_load_test_validation() {
    print_status $BLUE "🚀 Running load test validation..."
    
    # Start the application
    print_status $YELLOW "🔄 Starting application for load testing..."
    docker-compose -f docker-compose.workflow-validation.yml exec -d chemchat-workflow-test npm run start:prod
    
    # Wait for application to start
    sleep 30
    
    # Check if application is responding
    if docker-compose -f docker-compose.workflow-validation.yml exec -T chemchat-workflow-test curl -f http://localhost:3000/health; then
        print_status $GREEN "✅ Application is responding"
    else
        print_status $RED "❌ Application is not responding"
        return 1
    fi
    
    # Run k6 load tests
    print_status $YELLOW "🔄 Running k6 load tests..."
    if docker-compose -f docker-compose.workflow-validation.yml --profile load-test run --rm k6-test run /scripts/simple-load-test.js; then
        print_status $GREEN "✅ Load tests completed successfully"
    else
        print_status $RED "❌ Load tests failed"
        return 1
    fi
}

# Function to validate Node.js version consistency
validate_nodejs_consistency() {
    print_status $BLUE "🔍 Validating Node.js version consistency..."
    
    local node_version
    node_version=$(docker-compose -f docker-compose.workflow-validation.yml exec -T chemchat-workflow-test node --version)
    
    if echo "$node_version" | grep -q "^v20\."; then
        print_status $GREEN "✅ Node.js version is correct: $node_version"
    else
        print_status $RED "❌ Node.js version is incorrect: $node_version (expected v20.x)"
        return 1
    fi
    
    # Check npm version
    local npm_version
    npm_version=$(docker-compose -f docker-compose.workflow-validation.yml exec -T chemchat-workflow-test npm --version)
    
    if echo "$npm_version" | grep -qE "^([8-9]|[1-9][0-9])\."; then
        print_status $GREEN "✅ npm version is correct: $npm_version"
    else
        print_status $RED "❌ npm version is incorrect: $npm_version (expected 8.x or higher)"
        return 1
    fi
}

# Function to cleanup after tests
cleanup_after_tests() {
    print_status $BLUE "🧹 Cleaning up Docker environment..."
    
    # Stop and remove containers
    docker-compose -f docker-compose.workflow-validation.yml down -v --remove-orphans
    
    # Clean up unused Docker resources
    docker system prune -f --volumes
    
    print_status $GREEN "✅ Cleanup completed"
}

# Function to generate validation report
generate_report() {
    local exit_code=$1
    
    print_status $BLUE "📊 Workflow Validation Report"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    if [ $exit_code -eq 0 ]; then
        print_status $GREEN "🎉 All workflow validations passed successfully!"
        echo ""
        print_status $GREEN "✅ Docker environment setup: PASSED"
        print_status $GREEN "✅ Node.js version consistency: PASSED"
        print_status $GREEN "✅ Package script execution: PASSED"
        print_status $GREEN "✅ Database operations: PASSED"
        print_status $GREEN "✅ Test execution: PASSED"
        print_status $GREEN "✅ Load testing: PASSED"
        echo ""
        print_status $BLUE "🚀 Your GitHub workflows are ready for CI/CD!"
        echo ""
        print_status $BLUE "Next steps:"
        echo "1. Commit and push changes to trigger CI workflow"
        echo "2. Monitor CI logs to ensure all jobs complete successfully"
        echo "3. Verify deployment pipeline works correctly"
        echo ""
        print_status $GREEN "Task 8 validation is complete! ✅"
    else
        print_status $RED "❌ Some workflow validations failed!"
        echo ""
        print_status $RED "Please check the logs above and fix the issues before proceeding."
        echo ""
        print_status $BLUE "Troubleshooting tips:"
        echo "1. Check Docker service logs: docker-compose -f docker-compose.workflow-validation.yml logs"
        echo "2. Verify all required files exist and have correct permissions"
        echo "3. Ensure all dependencies are properly installed"
        echo "4. Check environment variable configuration"
    fi
    
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

# Main execution function
main() {
    local exit_code=0
    
    # Trap to ensure cleanup on exit
    trap 'cleanup_after_tests' EXIT
    
    # Run all validation steps
    check_docker || exit_code=1
    
    if [ $exit_code -eq 0 ]; then
        cleanup_previous || exit_code=1
    fi
    
    if [ $exit_code -eq 0 ]; then
        validate_compose_file || exit_code=1
    fi
    
    if [ $exit_code -eq 0 ]; then
        pull_images || exit_code=1
    fi
    
    if [ $exit_code -eq 0 ]; then
        build_application || exit_code=1
    fi
    
    if [ $exit_code -eq 0 ]; then
        start_services || exit_code=1
    fi
    
    if [ $exit_code -eq 0 ]; then
        wait_for_services || exit_code=1
    fi
    
    if [ $exit_code -eq 0 ]; then
        validate_nodejs_consistency || exit_code=1
    fi
    
    if [ $exit_code -eq 0 ]; then
        run_script_validation || exit_code=1
    fi
    
    if [ $exit_code -eq 0 ]; then
        run_validation_tests || exit_code=1
    fi
    
    if [ $exit_code -eq 0 ]; then
        run_load_test_validation || exit_code=1
    fi
    
    # Generate final report
    generate_report $exit_code
    
    exit $exit_code
}

# Execute main function
main "$@"