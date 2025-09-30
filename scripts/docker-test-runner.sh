#!/bin/bash

# Docker Test Runner Script
# Provides easy commands to run specific tests in Docker environment

set -e

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

# Function to show usage
show_usage() {
    echo "Docker Test Runner for ChemChat Workflow Validation"
    echo ""
    echo "Usage: $0 <command> [options]"
    echo ""
    echo "Commands:"
    echo "  all                    Run all validation tests"
    echo "  scripts               Run script validation tests"
    echo "  nodejs                Run Node.js version consistency tests"
    echo "  ci-workflow           Run CI workflow validation tests"
    echo "  comprehensive         Run comprehensive workflow test suite"
    echo "  individual            Run individual test files"
    echo ""
    echo "Service commands:"
    echo "  start-services        Start test services (postgres, redis, elasticsearch)"
    echo "  stop-services         Stop test services"
    echo "  logs                  Show service logs"
    echo "  status                Show service status"
    echo ""
    echo "Utility commands:"
    echo "  build                 Build Docker images"
    echo "  cleanup               Clean up Docker resources"
    echo "  shell                 Open shell in test container"
    echo "  help                  Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 all                # Run all tests"
    echo "  $0 scripts            # Run only script validation"
    echo "  $0 start-services     # Start services for debugging"
    echo "  $0 shell              # Open shell for manual testing"
}

# Function to check Docker availability
check_docker() {
    if ! docker info >/dev/null 2>&1; then
        print_error "Docker is not running. Please start Docker and try again."
        exit 1
    fi

    if ! command -v docker-compose >/dev/null 2>&1; then
        print_error "docker-compose is not installed. Please install docker-compose and try again."
        exit 1
    fi
}

# Function to build Docker images
build_images() {
    print_status "Building Docker images..."
    docker-compose -f docker-compose.test.yml build --no-cache
    print_success "Docker images built successfully"
}

# Function to start services
start_services() {
    print_status "Starting test services..."
    docker-compose -f docker-compose.test.yml up -d postgres redis elasticsearch
    
    print_status "Waiting for services to be ready..."
    timeout=120
    elapsed=0
    while [ $elapsed -lt $timeout ]; do
        if docker-compose -f docker-compose.test.yml ps | grep -q "healthy"; then
            print_success "Services are ready!"
            return 0
        fi
        sleep 5
        elapsed=$((elapsed + 5))
        print_status "Waiting for services... (${elapsed}s/${timeout}s)"
    done

    print_error "Services failed to start within ${timeout} seconds"
    docker-compose -f docker-compose.test.yml logs
    return 1
}

# Function to stop services
stop_services() {
    print_status "Stopping test services..."
    docker-compose -f docker-compose.test.yml down -v --remove-orphans
    print_success "Services stopped"
}

# Function to show service logs
show_logs() {
    docker-compose -f docker-compose.test.yml logs -f
}

# Function to show service status
show_status() {
    docker-compose -f docker-compose.test.yml ps
}

# Function to cleanup Docker resources
cleanup() {
    print_status "Cleaning up Docker resources..."
    docker-compose -f docker-compose.test.yml down -v --remove-orphans 2>/dev/null || true
    docker system prune -f 2>/dev/null || true
    print_success "Docker resources cleaned up"
}

# Function to open shell in test container
open_shell() {
    print_status "Opening shell in test container..."
    docker-compose -f docker-compose.test.yml run --rm comprehensive-validator /bin/bash
}

# Function to run specific test
run_test() {
    local test_name=$1
    local service_name=$2
    
    print_status "Running $test_name..."
    if docker-compose -f docker-compose.test.yml run --rm "$service_name"; then
        print_success "$test_name passed"
        return 0
    else
        print_error "$test_name failed"
        return 1
    fi
}

# Main execution
main() {
    local command=${1:-help}
    
    case $command in
        "all")
            check_docker
            build_images
            start_services
            
            print_status "Running all validation tests..."
            
            # Track results
            local failed_tests=()
            
            # Run all tests
            run_test "Node.js version consistency validation" "nodejs-validator" || failed_tests+=("nodejs-version")
            run_test "Script validation" "script-validator" || failed_tests+=("script-validation")
            run_test "CI workflow validation" "ci-workflow-validator" || failed_tests+=("ci-workflow")
            run_test "Comprehensive workflow test suite" "workflow-test-suite" || failed_tests+=("workflow-tests")
            run_test "Script execution tests" "script-execution-tests" || failed_tests+=("script-execution")
            run_test "Node.js version tests" "nodejs-version-tests" || failed_tests+=("nodejs-tests")
            run_test "Workflow validation tests" "workflow-validation-tests" || failed_tests+=("workflow-validation")
            run_test "Comprehensive validation" "comprehensive-validator" || failed_tests+=("comprehensive")
            
            # Summary
            if [ ${#failed_tests[@]} -eq 0 ]; then
                print_success "🎉 All tests passed!"
            else
                print_error "❌ Failed tests: ${failed_tests[*]}"
                exit 1
            fi
            ;;
            
        "scripts")
            check_docker
            build_images
            start_services
            run_test "Script validation" "script-validator"
            run_test "Script execution tests" "script-execution-tests"
            ;;
            
        "nodejs")
            check_docker
            build_images
            run_test "Node.js version consistency validation" "nodejs-validator"
            run_test "Node.js version tests" "nodejs-version-tests"
            ;;
            
        "ci-workflow")
            check_docker
            build_images
            start_services
            run_test "CI workflow validation" "ci-workflow-validator"
            ;;
            
        "comprehensive")
            check_docker
            build_images
            start_services
            run_test "Comprehensive workflow test suite" "workflow-test-suite"
            run_test "Comprehensive validation" "comprehensive-validator"
            ;;
            
        "individual")
            check_docker
            build_images
            start_services
            run_test "Script execution tests" "script-execution-tests"
            run_test "Node.js version tests" "nodejs-version-tests"
            run_test "Workflow validation tests" "workflow-validation-tests"
            ;;
            
        "start-services")
            check_docker
            build_images
            start_services
            print_success "Services started. Use '$0 logs' to view logs or '$0 stop-services' to stop."
            ;;
            
        "stop-services")
            stop_services
            ;;
            
        "logs")
            show_logs
            ;;
            
        "status")
            show_status
            ;;
            
        "build")
            check_docker
            build_images
            ;;
            
        "cleanup")
            cleanup
            ;;
            
        "shell")
            check_docker
            build_images
            start_services
            open_shell
            ;;
            
        "help"|"-h"|"--help")
            show_usage
            ;;
            
        *)
            print_error "Unknown command: $command"
            echo ""
            show_usage
            exit 1
            ;;
    esac
}

# Trap to ensure cleanup on exit for long-running commands
trap cleanup EXIT

# Run main function
main "$@"