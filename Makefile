# ChemChat Development Makefile
# Comprehensive Docker and development operations

.PHONY: help install build test lint clean
.PHONY: docker-up docker-down docker-restart docker-logs docker-status
.PHONY: docker-build docker-rebuild docker-clean docker-prune
.PHONY: db-migrate db-reset db-seed db-studio db-backup db-restore
.PHONY: redis-cli redis-flush cache-clear
.PHONY: dev dev-watch dev-debug
.PHONY: prod prod-build prod-deploy
.PHONY: health check-services monitor
.PHONY: test-unit test-integration test-e2e test-websocket test-load test-coverage test-watch test-all test-ci
.PHONY: format format-check security-scan

# Variables
COMPOSE_FILE := docker-compose.yml
APP_NAME := chemchat
DOCKER_IMAGE := $(APP_NAME):latest
NODE_ENV := development

# Colors for output
RED := \033[0;31m
GREEN := \033[0;32m
YELLOW := \033[1;33m
BLUE := \033[0;34m
NC := \033[0m # No Color

##@ Help
help: ## Display this help message
	@echo "$(BLUE)ChemChat Development Makefile$(NC)"
	@echo "$(YELLOW)Available commands:$(NC)"
	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage:\n  make \033[36m<target>\033[0m\n"} /^[a-zA-Z_0-9-]+:.*?##/ { printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2 } /^##@/ { printf "\n\033[1m%s\033[0m\n", substr($$0, 5) } ' $(MAKEFILE_LIST)

##@ Development
install: ## Install dependencies
	@echo "$(BLUE)Installing dependencies...$(NC)"
	npm install

build: ## Build the application
	@echo "$(BLUE)Building application...$(NC)"
	npm run build

dev: docker-up ## Start development environment
	@echo "$(GREEN)Development environment started!$(NC)"
	@echo "$(YELLOW)Services available at:$(NC)"
	@echo "  - ChemChat API: http://localhost:3000"
	@echo "  - Adminer (DB): http://localhost:8080"
	@echo "  - Elasticsearch: http://localhost:9200"
	@echo "  - Redis: localhost:6379"

dev-watch: ## Start development with file watching
	@echo "$(BLUE)Starting development with hot reload...$(NC)"
	npm run start:dev

dev-debug: ## Start development in debug mode
	@echo "$(BLUE)Starting development in debug mode...$(NC)"
	npm run start:debug

##@ Docker Operations
docker-up: ## Start all Docker services
	@echo "$(BLUE)Starting Docker services...$(NC)"
	chmod +x scripts/docker-dev.sh
	./scripts/docker-dev.sh start

docker-down: ## Stop all Docker services
	@echo "$(YELLOW)Stopping Docker services...$(NC)"
	./scripts/docker-dev.sh stop

docker-restart: docker-down docker-up ## Restart all Docker services

docker-logs: ## Show logs from all services
	@echo "$(BLUE)Showing Docker logs...$(NC)"
	./scripts/docker-dev.sh logs

docker-status: ## Check status of all services
	@echo "$(BLUE)Checking service status...$(NC)"
	./scripts/docker-dev.sh status

docker-build: ## Build Docker images
	@echo "$(BLUE)Building Docker images...$(NC)"
	docker-compose -f $(COMPOSE_FILE) build

docker-rebuild: ## Rebuild Docker images from scratch
	@echo "$(BLUE)Rebuilding Docker images...$(NC)"
	docker-compose -f $(COMPOSE_FILE) build --no-cache

docker-clean: ## Clean up Docker containers and volumes
	@echo "$(YELLOW)Cleaning up Docker resources...$(NC)"
	docker-compose -f $(COMPOSE_FILE) down -v --remove-orphans
	docker system prune -f

docker-prune: ## Remove all unused Docker resources
	@echo "$(RED)Removing all unused Docker resources...$(NC)"
	docker system prune -a -f --volumes

##@ Database Operations
db-migrate: ## Run database migrations
	@echo "$(BLUE)Running database migrations...$(NC)"
	./scripts/docker-dev.sh migrate

db-reset: ## Reset database (drop and recreate)
	@echo "$(RED)Resetting database...$(NC)"
	docker-compose -f $(COMPOSE_FILE) exec postgres psql -U chemchat_user -d chemchat_db -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
	$(MAKE) db-migrate

db-seed: ## Seed database with test data
	@echo "$(BLUE)Seeding database...$(NC)"
	npm run db:seed

db-studio: ## Open Prisma Studio
	@echo "$(BLUE)Opening Prisma Studio...$(NC)"
	npx prisma studio

db-backup: ## Backup database
	@echo "$(BLUE)Creating database backup...$(NC)"
	docker-compose -f $(COMPOSE_FILE) exec postgres pg_dump -U chemchat_user chemchat_db > backup_$$(date +%Y%m%d_%H%M%S).sql

db-restore: ## Restore database from backup (usage: make db-restore FILE=backup.sql)
	@echo "$(BLUE)Restoring database from $(FILE)...$(NC)"
	docker-compose -f $(COMPOSE_FILE) exec -T postgres psql -U chemchat_user -d chemchat_db < $(FILE)

##@ Redis Operations
redis-cli: ## Connect to Redis CLI
	@echo "$(BLUE)Connecting to Redis CLI...$(NC)"
	docker-compose -f $(COMPOSE_FILE) exec redis redis-cli -a chemchat_redis_pass

redis-flush: ## Flush all Redis data
	@echo "$(RED)Flushing Redis data...$(NC)"
	docker-compose -f $(COMPOSE_FILE) exec redis redis-cli -a chemchat_redis_pass FLUSHALL

cache-clear: redis-flush ## Clear application cache

##@ Testing
test: ## Run basic unit tests
	@echo "$(BLUE)Running basic unit tests...$(NC)"
	npm test

test-unit: ## Run unit tests only
	@echo "$(BLUE)Running unit tests...$(NC)"
	npm run test:unit

test-integration: ## Run integration tests
	@echo "$(BLUE)Running integration tests...$(NC)"
	npm run test:integration

test-e2e: ## Run end-to-end tests
	@echo "$(BLUE)Running e2e tests...$(NC)"
	npm run test:e2e

test-websocket: ## Run WebSocket tests
	@echo "$(BLUE)Running WebSocket tests...$(NC)"
	jest --config ./test/jest-websocket.json

test-load: ## Run k6 load tests
	@echo "$(BLUE)Running k6 load tests...$(NC)"
	@command -v k6 >/dev/null 2>&1 || { echo "$(RED)k6 is not installed. Install it first: brew install k6$(NC)"; exit 1; }
	npm run test:load

test-all: ## Run all test suites
	@echo "$(BLUE)Running all test suites...$(NC)"
	npm run test:all

test-ci: ## Run tests in CI mode with coverage
	@echo "$(BLUE)Running tests in CI mode...$(NC)"
	npm run test:ci

test-coverage: ## Run tests with coverage report
	@echo "$(BLUE)Running tests with coverage...$(NC)"
	npm run test:cov

test-watch: ## Run tests in watch mode
	@echo "$(BLUE)Running tests in watch mode...$(NC)"
	npm run test:watch

test-debug: ## Run tests in debug mode
	@echo "$(BLUE)Running tests in debug mode...$(NC)"
	npm run test:debug

##@ Code Quality
lint: ## Run ESLint
	@echo "$(BLUE)Running ESLint...$(NC)"
	npm run lint

lint-fix: ## Run ESLint with auto-fix
	@echo "$(BLUE)Running ESLint with auto-fix...$(NC)"
	npm run lint -- --fix

format: ## Format code with Prettier
	@echo "$(BLUE)Formatting code...$(NC)"
	npm run format

format-check: ## Check code formatting
	@echo "$(BLUE)Checking code formatting...$(NC)"
	npm run format -- --check

security-scan: ## Run security audit
	@echo "$(BLUE)Running security audit...$(NC)"
	npm audit

##@ Health & Monitoring
health: ## Check application health
	@echo "$(BLUE)Checking application health...$(NC)"
	curl -f http://localhost:3000/health || echo "$(RED)Health check failed$(NC)"

check-services: ## Check all service endpoints
	@echo "$(BLUE)Checking service endpoints...$(NC)"
	@echo "$(YELLOW)ChemChat API:$(NC)"
	@curl -s http://localhost:3000/health | jq . || echo "$(RED)API not responding$(NC)"
	@echo "$(YELLOW)Elasticsearch:$(NC)"
	@curl -s http://localhost:9200/_cluster/health | jq . || echo "$(RED)Elasticsearch not responding$(NC)"
	@echo "$(YELLOW)Redis:$(NC)"
	@docker-compose -f $(COMPOSE_FILE) exec redis redis-cli -a chemchat_redis_pass ping || echo "$(RED)Redis not responding$(NC)"

monitor: ## Show real-time service monitoring
	@echo "$(BLUE)Starting service monitoring...$(NC)"
	watch -n 2 'make check-services'

##@ Production
prod-build: ## Build for production
	@echo "$(BLUE)Building for production...$(NC)"
	NODE_ENV=production npm run build

prod-deploy: prod-build ## Deploy to production
	@echo "$(BLUE)Deploying to production...$(NC)"
	# Add your deployment commands here
	@echo "$(GREEN)Production deployment completed!$(NC)"

##@ Cleanup
clean: ## Clean build artifacts and dependencies
	@echo "$(YELLOW)Cleaning build artifacts...$(NC)"
	rm -rf dist/
	rm -rf node_modules/
	rm -rf coverage/

clean-all: clean docker-clean ## Clean everything including Docker resources

##@ Quick Commands
quick-start: install docker-up ## Quick start for new developers
	@echo "$(GREEN)🚀 ChemChat is ready for development!$(NC)"
	@echo "$(YELLOW)Next steps:$(NC)"
	@echo "  1. Run 'make dev-watch' to start development with hot reload"
	@echo "  2. Visit http://localhost:3000/health to check API"
	@echo "  3. Visit http://localhost:8080 for database management"

quick-test: docker-up test ## Quick test run with Docker services

test-setup: docker-up ## Setup test environment
	@echo "$(BLUE)Setting up test environment...$(NC)"
	@echo "$(YELLOW)Starting services for testing...$(NC)"
	sleep 5
	@echo "$(GREEN)Test environment ready!$(NC)"

test-teardown: ## Cleanup test environment
	@echo "$(YELLOW)Cleaning up test environment...$(NC)"
	docker-compose -f $(COMPOSE_FILE) exec redis redis-cli -a chemchat_redis_pass FLUSHALL
	@echo "$(GREEN)Test environment cleaned!$(NC)"

test-full: test-setup test-all test-teardown ## Full test suite with setup and cleanup

test-report: ## Generate comprehensive test report
	@echo "$(BLUE)Generating test report...$(NC)"
	npm run test:ci
	@echo "$(GREEN)Test report generated in coverage/ directory$(NC)"
	@echo "$(YELLOW)Open coverage/lcov-report/index.html to view detailed report$(NC)"

quick-reset: docker-down docker-clean docker-up db-migrate ## Quick environment reset

##@ Information
info: ## Show environment information
	@echo "$(BLUE)ChemChat Environment Information$(NC)"
	@echo "$(YELLOW)Node.js version:$(NC) $$(node --version)"
	@echo "$(YELLOW)npm version:$(NC) $$(npm --version)"
	@echo "$(YELLOW)Docker version:$(NC) $$(docker --version)"
	@echo "$(YELLOW)Docker Compose version:$(NC) $$(docker-compose --version)"
	@echo "$(YELLOW)Current directory:$(NC) $$(pwd)"
	@echo "$(YELLOW)Git branch:$(NC) $$(git branch --show-current 2>/dev/null || echo 'Not a git repository')"

# Default target
.DEFAULT_GOAL := help
