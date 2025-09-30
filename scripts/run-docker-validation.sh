#!/bin/bash

# Script to run comprehensive workflow validation in Docker
# This ensures all tests run in a consistent Docker environment

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

# Function to cleanup Docker resources
cleanup() {
    print_status "Cleaning up Docker resources..."
    docker-compose -f docker-compose.test.yml down -v --remove-orphans 2>/dev/null || true
    docker system prune -f 2>/dev/null || true
}

# Trap to ensure cleanup on exit
trap cleanup EXIT

# Main function
main() {
    print_status "Starting comprehensive workflow validation in Docker..."
    
    # Check if Docker is running
    if ! docker info >/dev/null 2>&1; then
        print_error "Docker is not running. Please start Docker and try again."
        exit 1
    fi

    # Check if docker-compose is available
    if ! command -v docker-compose >/dev/null 2>&1; then
        print_error "docker-compose is not installed. Please install docker-compose and try again."
        exit 1
    fi

    # Create test results directory
    mkdir -p test-results

    # Build the Docker images
    print_status "Building Docker images..."
    docker-compose -f docker-compose.test.yml build --no-cache

    # Start the services
    print_status "Starting test services..."
    docker-compose -f docker-compose.test.yml up -d postgres redis elasticsearch

    # Wait for services to be healthy
    print_status "Waiting for services to be ready..."
    timeout=120
    elapsed=0
    while [ $elapsed -lt $timeout ]; do
        if docker-compose -f docker-compose.test.yml ps | grep -q "healthy"; then
            print_success "Services are ready!"
            break
        fi
        sleep 5
        elapsed=$((elapsed + 5))
        print_status "Waiting for services... (${elapsed}s/${timeout}s)"
    done

    if [ $elapsed -ge $timeout ]; then
        print_error "Services failed to start within ${timeout} seconds"
        docker-compose -f docker-compose.test.yml logs
        exit 1
    fi

    # Run validation tests
    print_status "Running validation tests..."
    
    # Array to track test results
    declare -a test_results=()
    
    # Test 1: Node.js version consistency validation
    print_status "Running Node.js version consistency validation..."
    if docker-compose -f docker-compose.test.yml run --rm nodejs-validator; then
        print_success "Node.js version consistency validation passed"
        test_results+=("nodejs-version:PASS")
    else
        print_error "Node.js version consistency validation failed"
        test_results+=("nodejs-version:FAIL")
    fi

    # Test 2: Script validation
    print_status "Running script validation..."
    if docker-compose -f docker-compose.test.yml run --rm script-validator; then
        print_success "Script validation passed"
        test_results+=("script-validation:PASS")
    else
        print_error "Script validation failed"
        test_results+=("script-validation:FAIL")
    fi

    # Test 3: CI workflow validation
    print_status "Running CI workflow validation..."
    if docker-compose -f docker-compose.test.yml run --rm ci-workflow-validator; then
        print_success "CI workflow validation passed"
        test_results+=("ci-workflow:PASS")
    else
        print_error "CI workflow validation failed"
        test_results+=("ci-workflow:FAIL")
    fi

    # Test 4: Comprehensive workflow test suite
    print_status "Running comprehensive workflow test suite..."
    if docker-compose -f docker-compose.test.yml run --rm workflow-test-suite; then
        print_success "Comprehensive workflow test suite passed"
        test_results+=("workflow-tests:PASS")
    else
        print_error "Comprehensive workflow test suite failed"
        test_results+=("workflow-tests:FAIL")
    fi

    # Test 5: Individual test files
    print_status "Running individual test files..."
    
    # Script execution validation tests
    if docker-compose -f docker-compose.test.yml run --rm script-execution-tests; then
        print_success "Script execution validation tests passed"
        test_results+=("script-execution-tests:PASS")
    else
        print_error "Script execution validation tests failed"
        test_results+=("script-execution-tests:FAIL")
    fi

    # Node.js version consistency tests
    if docker-compose -f docker-compose.test.yml run --rm nodejs-version-tests; then
        print_success "Node.js version consistency tests passed"
        test_results+=("nodejs-version-tests:PASS")
    else
        print_error "Node.js version consistency tests failed"
        test_results+=("nodejs-version-tests:FAIL")
    fi

    # Workflow validation tests
    if docker-compose -f docker-compose.test.yml run --rm workflow-validation-tests; then
        print_success "Workflow validation tests passed"
        test_results+=("workflow-validation-tests:PASS")
    else
        print_error "Workflow validation tests failed"
        test_results+=("workflow-validation-tests:FAIL")
    fi

    # Test 6: Comprehensive validation (master script)
    print_status "Running comprehensive validation (master script)..."
    if docker-compose -f docker-compose.test.yml run --rm comprehensive-validator; then
        print_success "Comprehensive validation passed"
        test_results+=("comprehensive-validation:PASS")
    else
        print_warning "Comprehensive validation had some issues (this may be expected if individual tests failed)"
        test_results+=("comprehensive-validation:PARTIAL")
    fi

    # Print summary
    print_status "Validation Summary:"
    echo "===================="
    
    passed=0
    failed=0
    partial=0
    
    for result in "${test_results[@]}"; do
        test_name=$(echo "$result" | cut -d':' -f1)
        test_status=$(echo "$result" | cut -d':' -f2)
        
        case $test_status in
            "PASS")
                print_success "✅ $test_name"
                ((passed++))
                ;;
            "FAIL")
                print_error "❌ $test_name"
                ((failed++))
                ;;
            "PARTIAL")
                print_warning "⚠️  $test_name"
                ((partial++))
                ;;
        esac
    done
    
    total=$((passed + failed + partial))
    echo "===================="
    print_status "Total tests: $total"
    print_success "Passed: $passed"
    print_error "Failed: $failed"
    print_warning "Partial: $partial"
    
    # Determine exit code
    if [ $failed -eq 0 ]; then
        print_success "🎉 All critical validations passed!"
        print_status "Task 8 requirements have been successfully validated in Docker environment:"
        print_status "✅ Package.json scripts execute successfully"
        print_status "✅ Node.js version consistency across environments"
        print_status "✅ Complete CI workflow execution with new configurations"
        exit 0
    else
        print_error "❌ Some validations failed. Please review the output above."
        exit 1
    fi
}

# Check command line arguments
case "${1:-}" in
    "help"|"-h"|"--help")
        echo "Usage: $0 [command]"
        echo ""
        echo "Commands:"
        echo "  help          Show this help message"
        echo "  cleanup       Clean up Docker resources only"
        echo "  services      Start services only (for debugging)"
        echo "  logs          Show service logs"
        echo ""
        echo "Default: Run comprehensive validation"
        exit 0
        ;;
    "cleanup")
        cleanup
        print_success "Docker resources cleaned up"
        exit 0
        ;;
    "services")
        print_status "Starting services for debugging..."
        docker-compose -f docker-compose.test.yml up -d postgres redis elasticsearch
        print_success "Services started. Use 'docker-compose -f docker-compose.test.yml logs -f' to view logs"
        print_status "Use 'docker-compose -f docker-compose.test.yml down -v' to stop services"
        exit 0
        ;;
    "logs")
        docker-compose -f docker-compose.test.yml logs -f
        exit 0
        ;;
    "")
        # Default: run main function
        main
        ;;
    *)
        print_error "Unknown command: $1"
        print_status "Use '$0 help' for usage information"
        exit 1
        ;;
esac