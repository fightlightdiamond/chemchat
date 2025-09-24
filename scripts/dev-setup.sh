#!/bin/bash

# ChemChat Development Environment Setup Script
# This script sets up the complete development environment with all services

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_NAME="chemchat"
COMPOSE_FILE="docker-compose.yml"
ENV_FILE=".env.docker"

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

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to wait for service to be healthy
wait_for_service() {
    local service_name=$1
    local max_attempts=30
    local attempt=1

    print_status "Waiting for $service_name to be healthy..."
    
    while [ $attempt -le $max_attempts ]; do
        if docker-compose ps $service_name | grep -q "healthy\|Up"; then
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

# Function to setup environment
setup_environment() {
    print_status "Setting up environment variables..."
    
    if [ ! -f "$ENV_FILE" ]; then
        print_warning "$ENV_FILE not found, creating from template..."
        cp .env.example $ENV_FILE
        print_success "Created $ENV_FILE from template"
    fi
    
    # Generate random secrets if they don't exist
    if ! grep -q "JWT_ACCESS_SECRET=your-super-secret" $ENV_FILE; then
        print_status "Environment already configured"
    else
        print_status "Generating secure JWT secrets..."
        
        # Generate random secrets
        ACCESS_SECRET=$(openssl rand -base64 32)
        REFRESH_SECRET=$(openssl rand -base64 32)
        WS_SECRET=$(openssl rand -base64 32)
        MFA_SECRET=$(openssl rand -base64 32)
        
        # Update environment file
        sed -i.bak "s/JWT_ACCESS_SECRET=.*/JWT_ACCESS_SECRET=$ACCESS_SECRET/" $ENV_FILE
        sed -i.bak "s/JWT_REFRESH_SECRET=.*/JWT_REFRESH_SECRET=$REFRESH_SECRET/" $ENV_FILE
        sed -i.bak "s/JWT_WS_SECRET=.*/JWT_WS_SECRET=$WS_SECRET/" $ENV_FILE
        sed -i.bak "s/JWT_MFA_SECRET=.*/JWT_MFA_SECRET=$MFA_SECRET/" $ENV_FILE
        
        rm $ENV_FILE.bak
        print_success "Generated secure JWT secrets"
    fi
}

# Function to check prerequisites
check_prerequisites() {
    print_status "Checking prerequisites..."
    
    if ! command_exists docker; then
        print_error "Docker is not installed. Please install Docker Desktop."
        exit 1
    fi
    
    if ! command_exists docker-compose; then
        print_error "Docker Compose is not installed. Please install Docker Compose."
        exit 1
    fi
    
    if ! command_exists node; then
        print_warning "Node.js is not installed. Some development scripts may not work."
    fi
    
    if ! command_exists pnpm; then
        print_warning "pnpm is not installed. Installing globally..."
        npm install -g pnpm
    fi
    
    print_success "Prerequisites check completed"
}

# Function to start services
start_services() {
    print_status "Starting development services..."
    
    # Pull latest images
    print_status "Pulling latest Docker images..."
    docker-compose pull
    
    # Build application image
    print_status "Building application image..."
    docker-compose build chemchat-app
    
    # Start infrastructure services first
    print_status "Starting infrastructure services..."
    docker-compose up -d postgres redis elasticsearch kafka zookeeper
    
    # Wait for infrastructure to be ready
    wait_for_service postgres
    wait_for_service redis
    wait_for_service elasticsearch
    wait_for_service kafka
    
    # Start monitoring and management services
    print_status "Starting monitoring and management services..."
    docker-compose up -d prometheus grafana jaeger adminer redis-commander kafka-ui elasticsearch-head mailhog
    
    # Start the application
    print_status "Starting ChemChat application..."
    docker-compose up -d chemchat-app
    
    wait_for_service chemchat-app
    
    print_success "All services started successfully!"
}

# Function to setup database
setup_database() {
    print_status "Setting up database..."
    
    # Run Prisma migrations
    print_status "Running database migrations..."
    docker-compose exec chemchat-app npx prisma migrate deploy
    
    # Generate Prisma client
    print_status "Generating Prisma client..."
    docker-compose exec chemchat-app npx prisma generate
    
    # Seed database with test data
    print_status "Seeding database with test data..."
    docker-compose exec chemchat-app npx ts-node scripts/basic-seed.ts
    
    print_success "Database setup completed!"
}

# Function to show service URLs
show_service_urls() {
    print_success "Development environment is ready! 🚀"
    echo ""
    echo "Service URLs:"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "🚀 ChemChat API:          http://localhost:3000"
    echo "📖 API Documentation:     http://localhost:3000/api"
    echo "🔍 Health Check:          http://localhost:3000/health"
    echo ""
    echo "Management Interfaces:"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "🗄️  Database (Adminer):    http://localhost:8080"
    echo "🔴 Redis (Commander):     http://localhost:8081"
    echo "📊 Kafka (UI):            http://localhost:8082"
    echo "🔍 Elasticsearch (Head):  http://localhost:9100"
    echo "📧 Email (MailHog):       http://localhost:8025"
    echo ""
    echo "Monitoring & Observability:"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "📈 Metrics (Prometheus):  http://localhost:9090"
    echo "📊 Dashboards (Grafana):  http://localhost:3001 (admin/admin)"
    echo "🔍 Tracing (Jaeger):      http://localhost:16686"
    echo ""
    echo "Development Commands:"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "📋 View logs:             docker-compose logs -f chemchat-app"
    echo "🔄 Restart app:           docker-compose restart chemchat-app"
    echo "🛠️  Run migrations:        docker-compose exec chemchat-app npx prisma migrate dev"
    echo "🌱 Seed database:         docker-compose exec chemchat-app npx ts-node scripts/basic-seed.ts"
    echo "🧪 Run tests:             docker-compose exec chemchat-app npm test"
    echo "🔍 Shell access:          docker-compose exec chemchat-app sh"
    echo ""
}

# Function to stop services
stop_services() {
    print_status "Stopping all services..."
    docker-compose down
    print_success "All services stopped"
}

# Function to clean up
cleanup() {
    print_status "Cleaning up development environment..."
    docker-compose down -v --remove-orphans
    docker system prune -f
    print_success "Cleanup completed"
}

# Function to show logs
show_logs() {
    local service=${1:-chemchat-app}
    docker-compose logs -f $service
}

# Function to show status
show_status() {
    print_status "Service Status:"
    docker-compose ps
}

# Main function
main() {
    case "${1:-start}" in
        "start"|"up")
            check_prerequisites
            setup_environment
            start_services
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
        "cleanup"|"clean")
            cleanup
            ;;
        "seed")
            print_status "Seeding database..."
            docker-compose exec chemchat-app npx ts-node scripts/basic-seed.ts $2 $3 $4 $5
            ;;
        "migrate")
            print_status "Running database migrations..."
            docker-compose exec chemchat-app npx prisma migrate dev
            ;;
        "shell")
            docker-compose exec chemchat-app sh
            ;;
        "help"|"-h"|"--help")
            echo "ChemChat Development Environment Setup"
            echo ""
            echo "Usage: $0 [command] [options]"
            echo ""
            echo "Commands:"
            echo "  start, up      Start all development services (default)"
            echo "  stop, down     Stop all services"
            echo "  restart        Restart all services"
            echo "  status         Show service status"
            echo "  logs [service] Show logs for service (default: chemchat-app)"
            echo "  cleanup, clean Clean up all containers and volumes"
            echo "  seed [options] Seed database with test data"
            echo "  migrate        Run database migrations"
            echo "  shell          Open shell in application container"
            echo "  help           Show this help message"
            echo ""
            echo "Examples:"
            echo "  $0 start                    # Start all services"
            echo "  $0 logs                     # Show app logs"
            echo "  $0 logs postgres            # Show postgres logs"
            echo "  $0 seed --users 100         # Seed with 100 users"
            echo "  $0 cleanup                  # Clean up everything"
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
