# ChemChat Development Environment

This document provides comprehensive instructions for setting up and using the ChemChat development environment.

## Quick Start

```bash
# Clone and setup
git clone <repository-url>
cd chemchat

# Start development environment
npm run dev:setup

# View all services
npm run dev:status
```

## Prerequisites

- **Docker Desktop**: Required for running all services
- **Node.js 20+**: For local development and scripts
- **npm**: Package manager (`npm install -g npm`)

## Development Services

The development environment includes:

### Core Application

- **ChemChat API**: http://localhost:3000
- **API Documentation**: http://localhost:3000/api
- **Health Check**: http://localhost:3000/health

### Infrastructure Services

- **PostgreSQL**: localhost:5432 (Database)
- **Redis**: localhost:6379 (Cache & Pub/Sub)
- **Elasticsearch**: localhost:9200 (Search)
- **Kafka**: localhost:9092 (Event Streaming)

### Management Interfaces

- **Database Admin (Adminer)**: http://localhost:8080
- **Redis Commander**: http://localhost:8081
- **Kafka UI**: http://localhost:8082
- **Elasticsearch Head**: http://localhost:9100
- **Email Testing (MailHog)**: http://localhost:8025
- **MinIO Console**: http://localhost:9001

### Monitoring & Observability

- **Prometheus**: http://localhost:9090
- **Grafana**: http://localhost:3001 (admin/admin)
- **Jaeger Tracing**: http://localhost:16686

## Development Commands

### Environment Management

```bash
npm run dev:setup      # Start all services
npm run dev:stop       # Stop all services
npm run dev:restart    # Restart all services
npm run dev:status     # Check service status
npm run dev:logs       # View application logs
npm run dev:clean      # Clean up containers and volumes
npm run dev:shell      # Open shell in application container
```

### Database Operations

```bash
npm run dev:migrate    # Run database migrations
npm run dev:seed       # Seed database with test data
npm run prisma:studio  # Open Prisma Studio
npm run prisma:reset   # Reset database
```

### Testing

```bash
npm run test           # Run unit tests
npm run test:watch     # Run tests in watch mode
npm run test:e2e       # Run end-to-end tests
npm run test:integration # Run integration tests
npm run test:load      # Run load tests
```

### Docker Operations

```bash
npm run docker:build  # Build application image
npm run docker:up     # Start containers
npm run docker:down   # Stop containers
npm run docker:logs   # View all logs
npm run docker:ps     # List containers
```

### Monitoring

```bash
npm run monitoring:up   # Start monitoring services
npm run monitoring:down # Stop monitoring services
```

## Environment Configuration

### Development Environment Variables

The development environment uses `.env.development` with the following key configurations:

- **Database**: PostgreSQL with connection pooling
- **Redis**: Local Redis with password authentication
- **Kafka**: Single broker setup for development
- **Elasticsearch**: Single node cluster
- **JWT**: Development secrets (change in production)
- **Email**: MailHog for email testing
- **File Storage**: MinIO for S3-compatible storage
- **Monitoring**: Enabled metrics and tracing

### Hot Reload

The development setup includes:

- **Automatic restart** on file changes
- **TypeScript compilation** in watch mode
- **Volume mounting** for real-time code updates
- **Debugger support** on port 9229

## Database Seeding

### Simple Seed (Recommended for Development)

```bash
npm run dev:seed
```

Creates:

- 1 development tenant
- 3 test users (admin, alice, bob)
- 1 group conversation
- Sample messages
- All passwords: `password123`

### Advanced Seeding

```bash
# Custom seed with parameters
./scripts/dev-setup.sh seed --users 50 --conversations 10
```

## Debugging

### Application Debugging

1. Start development environment: `npm run dev:setup`
2. Attach debugger to port 9229
3. Set breakpoints in your IDE
4. Debug WebSocket connections via browser dev tools

### Service Debugging

```bash
# View specific service logs
docker-compose logs -f postgres
docker-compose logs -f redis
docker-compose logs -f elasticsearch

# Check service health
docker-compose ps
curl http://localhost:3000/health
```

## Development Workflow

### 1. Daily Development

```bash
# Start your day
npm run dev:setup
npm run dev:status

# Make changes to code (hot reload active)
# Test your changes
npm run test:watch

# View logs
npm run dev:logs
```

### 2. Database Changes

```bash
# Create migration
npx prisma migrate dev --name your-migration-name

# Apply migrations in Docker
npm run dev:migrate

# Reset if needed
npm run prisma:reset
npm run dev:seed
```

### 3. Testing New Features

```bash
# Run specific tests
npm run test -- --testNamePattern="YourFeature"

# Integration tests
npm run test:integration

# Load testing
npm run test:load
```

## Troubleshooting

### Common Issues

#### Services Won't Start

```bash
# Check Docker is running
docker --version

# Clean up and restart
npm run dev:clean
npm run dev:setup
```

#### Database Connection Issues

```bash
# Check PostgreSQL is healthy
docker-compose ps postgres

# Reset database
npm run prisma:reset
npm run dev:seed
```

#### Port Conflicts

If ports are already in use, modify `docker-compose.yml` to use different ports.

#### Performance Issues

```bash
# Check resource usage
docker stats

# Restart specific service
docker-compose restart chemchat-app
```

### Logs and Monitoring

#### Application Logs

```bash
# Real-time logs
npm run dev:logs

# Specific service
docker-compose logs -f chemchat-app
```

#### System Metrics

- **Grafana**: http://localhost:3001 (admin/admin)
- **Prometheus**: http://localhost:9090
- **Jaeger**: http://localhost:16686

#### Health Checks

```bash
# Application health
curl http://localhost:3000/health

# Service status
npm run dev:status
```

## Production Considerations

### Environment Differences

- Development uses single-node services
- Production requires clustering and high availability
- Security settings are relaxed in development
- Debug features are enabled in development

### Migration to Production

1. Update environment variables
2. Configure proper secrets management
3. Set up service clustering
4. Enable security hardening
5. Configure proper monitoring and alerting

## Contributing

### Code Style

```bash
# Format code
npm run format

# Lint code
npm run lint
```

### Testing Requirements

- Unit tests for all services
- Integration tests for API endpoints
- E2E tests for critical workflows
- Load tests for performance validation

### Development Guidelines

1. Use feature branches
2. Write tests for new features
3. Update documentation
4. Follow TypeScript best practices
5. Use proper error handling

## Support

For development environment issues:

1. Check this documentation
2. Review logs: `npm run dev:logs`
3. Check service status: `npm run dev:status`
4. Clean and restart: `npm run dev:clean && npm run dev:setup`

## Service URLs Reference

| Service         | URL                       | Credentials                                                   |
| --------------- | ------------------------- | ------------------------------------------------------------- |
| ChemChat API    | http://localhost:3000     | -                                                             |
| API Docs        | http://localhost:3000/api | -                                                             |
| Database Admin  | http://localhost:8080     | Server: postgres, User: chemchat, Password: chemchat_password |
| Redis Commander | http://localhost:8081     | -                                                             |
| Kafka UI        | http://localhost:8082     | -                                                             |
| Elasticsearch   | http://localhost:9100     | -                                                             |
| Email Testing   | http://localhost:8025     | -                                                             |
| MinIO Console   | http://localhost:9001     | minioadmin/minioadmin                                         |
| Grafana         | http://localhost:3001     | admin/admin                                                   |
| Prometheus      | http://localhost:9090     | -                                                             |
| Jaeger          | http://localhost:16686    | -                                                             |
