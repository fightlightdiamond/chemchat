#!/bin/bash

# ChemChat Docker Development Scripts
# Usage: ./scripts/docker-dev.sh [command]

set -e

PROJECT_NAME="chemchat"
COMPOSE_FILE="docker-compose.yml"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if Docker is running
check_docker() {
    if ! docker info > /dev/null 2>&1; then
        log_error "Docker is not running. Please start Docker Desktop."
        exit 1
    fi
}

# Build and start all services
start() {
    log_info "Starting ChemChat development environment..."
    check_docker
    
    # Copy environment file
    if [ ! -f .env ]; then
        log_info "Creating .env file from .env.docker..."
        cp .env.docker .env
    fi
    
    # Build and start services
    docker-compose -f $COMPOSE_FILE up -d --build
    
    log_success "Services started successfully!"
    log_info "Available services:"
    echo "  - ChemChat API: http://localhost:3000"
    echo "  - Database Admin: http://localhost:8080"
    echo "  - Elasticsearch: http://localhost:9200"
    echo "  - Redis: localhost:6379"
    
    # Wait for services to be healthy
    log_info "Waiting for services to be healthy..."
    sleep 10
    
    # Run database migrations
    migrate
}

# Stop all services
stop() {
    log_info "Stopping ChemChat services..."
    docker-compose -f $COMPOSE_FILE down
    log_success "Services stopped successfully!"
}

# Restart all services
restart() {
    log_info "Restarting ChemChat services..."
    stop
    start
}

# View logs
logs() {
    SERVICE=${1:-"chemchat-app"}
    log_info "Showing logs for $SERVICE..."
    docker-compose -f $COMPOSE_FILE logs -f $SERVICE
}

# Run database migrations
migrate() {
    log_info "Running database migrations..."
    
    # Wait for database to be ready
    log_info "Waiting for database to be ready..."
    docker-compose -f $COMPOSE_FILE exec -T postgres pg_isready -U chemchat -d chatdb
    
    # Generate Prisma client and run migrations
    docker-compose -f $COMPOSE_FILE exec -T chemchat-app npx prisma generate
    docker-compose -f $COMPOSE_FILE exec -T chemchat-app npx prisma migrate deploy
    
    log_success "Database migrations completed!"
}

# Reset database
reset_db() {
    log_warning "This will delete all data in the database!"
    read -p "Are you sure? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        log_info "Resetting database..."
        docker-compose -f $COMPOSE_FILE exec -T chemchat-app npx prisma migrate reset --force
        log_success "Database reset completed!"
    else
        log_info "Database reset cancelled."
    fi
}

# Show service status
status() {
    log_info "Service status:"
    docker-compose -f $COMPOSE_FILE ps
    
    log_info "Health checks:"
    curl -s http://localhost:3000/health || log_error "ChemChat API is not responding"
    curl -s http://localhost:9200/_cluster/health || log_error "Elasticsearch is not responding"
}

# Clean up Docker resources
clean() {
    log_warning "This will remove all Docker containers, networks, and volumes for this project!"
    read -p "Are you sure? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        log_info "Cleaning up Docker resources..."
        docker-compose -f $COMPOSE_FILE down -v --remove-orphans
        docker system prune -f
        log_success "Cleanup completed!"
    else
        log_info "Cleanup cancelled."
    fi
}

# Show help
help() {
    echo "ChemChat Docker Development Scripts"
    echo ""
    echo "Usage: $0 [command]"
    echo ""
    echo "Commands:"
    echo "  start     - Build and start all services"
    echo "  stop      - Stop all services"
    echo "  restart   - Restart all services"
    echo "  logs      - Show logs (optional: service name)"
    echo "  migrate   - Run database migrations"
    echo "  reset-db  - Reset database (WARNING: deletes all data)"
    echo "  status    - Show service status and health"
    echo "  clean     - Clean up Docker resources (WARNING: removes all data)"
    echo "  help      - Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 start"
    echo "  $0 logs chemchat-app"
    echo "  $0 logs postgres"
}

# Main script logic
case "${1:-help}" in
    start)
        start
        ;;
    stop)
        stop
        ;;
    restart)
        restart
        ;;
    logs)
        logs $2
        ;;
    migrate)
        migrate
        ;;
    reset-db)
        reset_db
        ;;
    status)
        status
        ;;
    clean)
        clean
        ;;
    help|*)
        help
        ;;
esac
