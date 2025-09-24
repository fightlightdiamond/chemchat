#!/bin/bash

# ChemChat Local Development Setup Script
# This script sets up a local development environment without Docker for the app
# Only uses Docker for infrastructure services (PostgreSQL, Redis)

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

# Check if Node.js is installed
check_node() {
    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed. Please install Node.js 18+ and try again."
        exit 1
    fi
    
    local node_version=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$node_version" -lt 18 ]; then
        print_error "Node.js version 18+ is required. Current version: $(node --version)"
        exit 1
    fi
    
    print_success "Node.js $(node --version) is available"
}

# Check if npm is installed
check_npm() {
    if ! command -v npm &> /dev/null; then
        print_error "npm is not installed. Please install npm and try again."
        exit 1
    fi
    
    print_success "npm $(npm --version) is available"
}

# Start infrastructure services only
start_infrastructure() {
    print_status "Starting infrastructure services (PostgreSQL, Redis)..."
    
    # Create a minimal docker-compose for infrastructure only
    cat > docker-compose.infrastructure.yml << 'EOF'
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    container_name: chemchat-postgres-local
    environment:
      POSTGRES_DB: chemchat_dev
      POSTGRES_USER: chemchat
      POSTGRES_PASSWORD: chemchat123
    ports:
      - "5433:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./init-db.sql:/docker-entrypoint-initdb.d/init-db.sql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U chemchat -d chemchat_dev"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    container_name: chemchat-redis-local
    ports:
      - "6379:6379"
    command: redis-server --requirepass chemchat123
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "chemchat123", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  adminer:
    image: adminer:4.8.1
    container_name: chemchat-adminer-local
    ports:
      - "8080:8080"
    environment:
      ADMINER_DEFAULT_SERVER: postgres
    depends_on:
      - postgres

volumes:
  postgres_data:

networks:
  default:
    name: chemchat-local-network
EOF

    # Try to pull images with retries
    print_status "Pulling infrastructure images..."
    for i in {1..3}; do
        if docker-compose -f docker-compose.infrastructure.yml pull; then
            break
        else
            print_warning "Pull attempt $i failed, retrying..."
            sleep 5
        fi
    done
    
    # Start infrastructure services
    docker-compose -f docker-compose.infrastructure.yml up -d
    
    # Wait for services to be ready
    print_status "Waiting for PostgreSQL to be ready..."
    for i in {1..30}; do
        if docker-compose -f docker-compose.infrastructure.yml exec -T postgres pg_isready -U chemchat -d chemchat_dev > /dev/null 2>&1; then
            print_success "PostgreSQL is ready!"
            break
        fi
        echo -n "."
        sleep 2
    done
    
    print_status "Waiting for Redis to be ready..."
    for i in {1..30}; do
        if docker-compose -f docker-compose.infrastructure.yml exec -T redis redis-cli -a chemchat123 ping > /dev/null 2>&1; then
            print_success "Redis is ready!"
            break
        fi
        echo -n "."
        sleep 2
    done
}

# Setup local environment
setup_local_env() {
    print_status "Setting up local development environment..."
    
    # Copy environment file
    if [ ! -f .env.development ]; then
        print_error ".env.development file not found. Please ensure it exists."
        exit 1
    fi
    
    cp .env.development .env.local
    
    # Update database URL for local development
    sed -i.bak 's|DATABASE_URL=.*|DATABASE_URL="postgresql://chemchat:chemchat123@localhost:5433/chemchat_dev"|' .env.local
    sed -i.bak 's|REDIS_HOST=.*|REDIS_HOST=localhost|' .env.local
    sed -i.bak 's|REDIS_PORT=.*|REDIS_PORT=6379|' .env.local
    sed -i.bak 's|REDIS_PASSWORD=.*|REDIS_PASSWORD=chemchat123|' .env.local
    
    print_success "Local environment configured"
}

# Install dependencies
install_dependencies() {
    print_status "Installing npm dependencies..."
    
    # Set npm timeout and registry
    npm config set fetch-timeout 300000
    npm config set fetch-retry-mintimeout 20000
    npm config set fetch-retry-maxtimeout 120000
    
    # Install dependencies with retries
    for i in {1..3}; do
        if npm install; then
            print_success "Dependencies installed successfully!"
            break
        else
            print_warning "npm install attempt $i failed, retrying..."
            sleep 5
        fi
    done
}

# Setup database
setup_database() {
    print_status "Setting up database..."
    
    # Generate Prisma client
    print_status "Generating Prisma client..."
    npx prisma generate
    
    # Run migrations
    print_status "Running database migrations..."
    npx prisma migrate deploy
    
    # Seed database
    print_status "Seeding database with test data..."
    npx ts-node scripts/simple-seed.ts
    
    print_success "Database setup completed!"
}

# Start application
start_application() {
    print_status "Starting ChemChat application..."
    
    # Set environment
    export NODE_ENV=development
    export $(cat .env.local | grep -v '^#' | xargs)
    
    print_success "Starting application in development mode..."
    print_status "Application will be available at http://localhost:3000"
    print_status "Press Ctrl+C to stop the application"
    
    npm run start:dev
}

# Show service URLs
show_service_urls() {
    print_success "Local development environment is ready! 🚀"
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
    echo "🔄 Start app:             npm run start:dev"
    echo "🛠️  Run migrations:        npx prisma migrate dev"
    echo "🌱 Seed database:         npx ts-node scripts/simple-seed.ts"
    echo "🧪 Run tests:             npm test"
    echo "🔍 View DB:               npx prisma studio"
    echo ""
    echo "Infrastructure Commands:"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "📋 Infrastructure logs:   docker-compose -f docker-compose.infrastructure.yml logs -f"
    echo "🛑 Stop infrastructure:   docker-compose -f docker-compose.infrastructure.yml down"
}

# Stop services
stop_services() {
    print_status "Stopping infrastructure services..."
    if [ -f docker-compose.infrastructure.yml ]; then
        docker-compose -f docker-compose.infrastructure.yml down
    fi
    print_success "Infrastructure services stopped"
}

# Show status
show_status() {
    print_status "Infrastructure Service Status:"
    if [ -f docker-compose.infrastructure.yml ]; then
        docker-compose -f docker-compose.infrastructure.yml ps
    else
        print_warning "Infrastructure not started"
    fi
}

# Main function
main() {
    case "${1:-start}" in
        "start"|"up")
            check_node
            check_npm
            start_infrastructure
            setup_local_env
            install_dependencies
            setup_database
            show_service_urls
            echo ""
            print_status "To start the application, run: npm run start:dev"
            ;;
        "dev")
            check_node
            check_npm
            start_infrastructure
            setup_local_env
            install_dependencies
            setup_database
            start_application
            ;;
        "stop"|"down")
            stop_services
            ;;
        "status")
            show_status
            ;;
        "install")
            check_node
            check_npm
            install_dependencies
            ;;
        "migrate")
            print_status "Running database migrations..."
            npx prisma migrate dev
            ;;
        "seed")
            print_status "Seeding database..."
            npx ts-node scripts/simple-seed.ts
            ;;
        "help"|"-h"|"--help")
            echo "ChemChat Local Development Environment Setup"
            echo ""
            echo "Usage: $0 [command]"
            echo ""
            echo "Commands:"
            echo "  start, up      Setup infrastructure and prepare for local development"
            echo "  dev            Setup and start application in development mode"
            echo "  stop, down     Stop infrastructure services"
            echo "  status         Show infrastructure service status"
            echo "  install        Install npm dependencies only"
            echo "  migrate        Run database migrations"
            echo "  seed           Seed database with test data"
            echo "  help           Show this help message"
            echo ""
            echo "This setup uses:"
            echo "  - Local Node.js application (no Docker for app)"
            echo "  - Docker for PostgreSQL and Redis only"
            echo "  - Adminer for database management"
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
