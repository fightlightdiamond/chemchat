#!/bin/bash

# ChemChat Minimal Development Environment Setup Script
# This script sets up a minimal development environment to avoid network issues

set -e

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

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to wait for service to be healthy
wait_for_service() {
    local service_name=$1
    local max_attempts=30
    local attempt=1

    print_status "Waiting for $service_name to be healthy..."
    
    while [ $attempt -le $max_attempts ]; do
        if docker-compose -f docker-compose.minimal.yml ps $service_name | grep -q "healthy\|Up"; then
            print_success "$service_name is ready!"
            return 0
        fi
        
        echo -n "."
        sleep 2
        attempt=$((attempt + 1))
    done
    
    print_error "$service_name failed to start within expected time"
    return 1
}

# Function to start minimal services
start_minimal_services() {
    print_status "Starting minimal development services..."
    
    # Try to pull images with retries
    print_status "Pulling Docker images with retries..."
    for i in {1..3}; do
        if docker-compose -f docker-compose.minimal.yml pull; then
            break
        else
            print_warning "Pull attempt $i failed, retrying..."
            sleep 5
        fi
    done
    
    # Build application image
    print_status "Building application image..."
    docker-compose -f docker-compose.minimal.yml build chemchat-app
    
    # Start services
    print_status "Starting core services..."
    docker-compose -f docker-compose.minimal.yml up -d postgres redis
    
    # Wait for core services
    wait_for_service postgres
    wait_for_service redis
    
    # Start application
    print_status "Starting ChemChat application..."
    docker-compose -f docker-compose.minimal.yml up -d chemchat-app
    
    wait_for_service chemchat-app
    
    # Start adminer
    print_status "Starting database management interface..."
    docker-compose -f docker-compose.minimal.yml up -d adminer
    
    print_success "Minimal development environment started successfully!"
}

# Function to setup database
setup_database() {
    print_status "Setting up database..."
    
    # Run Prisma migrations
    print_status "Running database migrations..."
    docker-compose -f docker-compose.minimal.yml exec chemchat-app npx prisma migrate deploy
    
    # Generate Prisma client
    print_status "Generating Prisma client..."
    docker-compose -f docker-compose.minimal.yml exec chemchat-app npx prisma generate
    
    # Seed database with test data
    print_status "Seeding database with test data..."
    docker-compose -f docker-compose.minimal.yml exec chemchat-app npx ts-node scripts/simple-seed.ts
    
    print_success "Database setup completed!"
}

# Function to show service URLs
show_service_urls() {
    print_success "Minimal development environment is ready! 🚀"
    echo ""
    echo "Service URLs:"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "🚀 ChemChat API:          http://localhost:3000"
    echo "📖 API Documentation:     http://localhost:3000/api"
    echo "🔍 Health Check:          http://localhost:3000/health"
    echo "🗄️  Database (Adminer):    http://localhost:8080"
    echo ""
    echo "Development Commands:"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "📋 View logs:             docker-compose -f docker-compose.minimal.yml logs -f chemchat-app"
    echo "🔄 Restart app:           docker-compose -f docker-compose.minimal.yml restart chemchat-app"
    echo "🛠️  Run migrations:        docker-compose -f docker-compose.minimal.yml exec chemchat-app npx prisma migrate dev"
    echo "🌱 Seed database:         docker-compose -f docker-compose.minimal.yml exec chemchat-app npx ts-node scripts/simple-seed.ts"
    echo "🧪 Run tests:             docker-compose -f docker-compose.minimal.yml exec chemchat-app npm test"
    echo "🔍 Shell access:          docker-compose -f docker-compose.minimal.yml exec chemchat-app sh"
    echo ""
    echo "Note: This is a minimal setup. For full monitoring and additional services,"
    echo "use the full docker-compose.yml when network issues are resolved."
}

# Function to stop services
stop_services() {
    print_status "Stopping minimal services..."
    docker-compose -f docker-compose.minimal.yml down
    print_success "All services stopped"
}

# Function to show status
show_status() {
    print_status "Minimal Service Status:"
    docker-compose -f docker-compose.minimal.yml ps
}

# Function to show logs
show_logs() {
    local service=${1:-chemchat-app}
    docker-compose -f docker-compose.minimal.yml logs -f $service
}

# Main function
main() {
    case "${1:-start}" in
        "start"|"up")
            start_minimal_services
            setup_database
            show_service_urls
            ;;
        "stop"|"down")
            stop_services
            ;;
        "restart")
            stop_services
            sleep 2
            main start
            ;;
        "status")
            show_status
            ;;
        "logs")
            show_logs $2
            ;;
        "seed")
            print_status "Seeding database..."
            docker-compose -f docker-compose.minimal.yml exec chemchat-app npx ts-node scripts/simple-seed.ts
            ;;
        "migrate")
            print_status "Running database migrations..."
            docker-compose -f docker-compose.minimal.yml exec chemchat-app npx prisma migrate dev
            ;;
        "shell")
            docker-compose -f docker-compose.minimal.yml exec chemchat-app sh
            ;;
        "help"|"-h"|"--help")
            echo "ChemChat Minimal Development Environment Setup"
            echo ""
            echo "Usage: $0 [command] [options]"
            echo ""
            echo "Commands:"
            echo "  start, up      Start minimal development services (default)"
            echo "  stop, down     Stop all services"
            echo "  restart        Restart all services"
            echo "  status         Show service status"
            echo "  logs [service] Show logs for service (default: chemchat-app)"
            echo "  seed           Seed database with test data"
            echo "  migrate        Run database migrations"
            echo "  shell          Open shell in application container"
            echo "  help           Show this help message"
            echo ""
            echo "This minimal setup includes only:"
            echo "  - PostgreSQL database"
            echo "  - Redis cache"
            echo "  - ChemChat application"
            echo "  - Adminer database interface"
            ;;
        *)
            print_error "Unknown command: $1"
            echo "Use '$0 help' for usage information"
            exit 1
            ;;
    esac
}

# Run main function with all arguments
main "$@"
