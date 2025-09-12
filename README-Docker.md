# ChemChat Docker Setup

Complete Docker development environment for ChemChat real-time chat system.

## Quick Start

1. **Prerequisites**
   - Docker Desktop installed and running
   - Git (to clone the repository)

2. **Start Development Environment**
   ```bash
   # Make script executable (first time only)
   chmod +x scripts/docker-dev.sh
   
   # Start all services
   ./scripts/docker-dev.sh start
   ```

3. **Access Services**
   - **ChemChat API**: http://localhost:3000
   - **API Documentation**: http://localhost:3000/api (Swagger)
   - **Database Admin**: http://localhost:8080 (Adminer)
   - **Elasticsearch**: http://localhost:9200
   - **Health Check**: http://localhost:3000/health

## Services Included

### Core Application
- **ChemChat API** (Port 3000): NestJS application with WebSocket support
- **PostgreSQL** (Port 5432): Primary database
- **Redis** (Port 6379): Cache, sessions, and real-time data
- **Elasticsearch** (Port 9200): Search and indexing

### Supporting Services
- **Kafka + Zookeeper**: Event streaming and messaging
- **Adminer** (Port 8080): Database management interface

## Management Commands

```bash
# Start all services
./scripts/docker-dev.sh start

# Stop all services
./scripts/docker-dev.sh stop

# Restart services
./scripts/docker-dev.sh restart

# View logs
./scripts/docker-dev.sh logs                    # App logs
./scripts/docker-dev.sh logs postgres          # Database logs
./scripts/docker-dev.sh logs redis             # Redis logs

# Database operations
./scripts/docker-dev.sh migrate                # Run migrations
./scripts/docker-dev.sh reset-db               # Reset database (WARNING: deletes data)

# System status
./scripts/docker-dev.sh status                 # Check service health

# Cleanup
./scripts/docker-dev.sh clean                  # Remove all containers and volumes
```

## Environment Configuration

The system uses `.env.docker` for Docker-specific configuration:

```env
# Database
DATABASE_URL="postgresql://chemchat:chemchat_password@postgres:5432/chatdb"

# Redis
REDIS_HOST="redis"
REDIS_PORT=6379
REDIS_PASSWORD="redis_password"

# Kafka
KAFKA_BROKERS="kafka:9092"

# Elasticsearch
ELASTICSEARCH_URL="http://elasticsearch:9200"
```

## Development Workflow

1. **Initial Setup**
   ```bash
   git clone <repository>
   cd chemchat
   ./scripts/docker-dev.sh start
   ```

2. **Code Changes**
   - Edit source code in `src/`
   - Container will auto-reload on changes (development mode)

3. **Database Changes**
   ```bash
   # After modifying Prisma schema
   ./scripts/docker-dev.sh migrate
   ```

4. **Viewing Logs**
   ```bash
   # Real-time application logs
   ./scripts/docker-dev.sh logs
   
   # Database logs
   ./scripts/docker-dev.sh logs postgres
   ```

## Health Monitoring

### Health Check Endpoints
- `GET /health` - Overall system health
- `GET /health/ready` - Readiness probe
- `GET /health/live` - Liveness probe

### Service Status
```bash
# Check all service status
./scripts/docker-dev.sh status

# Manual health checks
curl http://localhost:3000/health
curl http://localhost:9200/_cluster/health
```

## Database Management

### Using Adminer (Web Interface)
1. Open http://localhost:8080
2. Login with:
   - **System**: PostgreSQL
   - **Server**: postgres
   - **Username**: chemchat
   - **Password**: chemchat_password
   - **Database**: chatdb

### Using CLI
```bash
# Connect to database
docker-compose exec postgres psql -U chemchat -d chatdb

# Run migrations
./scripts/docker-dev.sh migrate

# Reset database (WARNING: deletes all data)
./scripts/docker-dev.sh reset-db
```

## Troubleshooting

### Common Issues

1. **Port Already in Use**
   ```bash
   # Check what's using the port
   lsof -i :3000
   
   # Stop conflicting services or change ports in docker-compose.yml
   ```

2. **Services Not Starting**
   ```bash
   # Check Docker is running
   docker info
   
   # View service logs
   ./scripts/docker-dev.sh logs
   
   # Restart services
   ./scripts/docker-dev.sh restart
   ```

3. **Database Connection Issues**
   ```bash
   # Check database is ready
   docker-compose exec postgres pg_isready -U chemchat -d chatdb
   
   # Reset database
   ./scripts/docker-dev.sh reset-db
   ```

4. **Clean Start**
   ```bash
   # Remove all containers and start fresh
   ./scripts/docker-dev.sh clean
   ./scripts/docker-dev.sh start
   ```

### Performance Tuning

1. **Increase Docker Resources**
   - Docker Desktop → Settings → Resources
   - Recommended: 4GB RAM, 2 CPUs minimum

2. **Volume Performance**
   - Use Docker Desktop's file sharing optimization
   - Consider using named volumes for better performance

## Production Deployment

For production deployment:

1. **Environment Variables**
   - Use proper secrets management
   - Set strong passwords and JWT secrets
   - Configure proper database URLs

2. **Security**
   - Remove Adminer service
   - Use proper SSL certificates
   - Configure firewall rules

3. **Scaling**
   - Use Docker Swarm or Kubernetes
   - Configure load balancers
   - Set up monitoring and logging

## Architecture Overview

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   ChemChat API  │    │   PostgreSQL    │    │      Redis      │
│   (NestJS)      │◄──►│   (Database)    │    │   (Cache/Pub)   │
│   Port 3000     │    │   Port 5432     │    │   Port 6379     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         │              ┌─────────────────┐             │
         └──────────────►│  Elasticsearch  │◄────────────┘
                        │    (Search)     │
                        │   Port 9200     │
                        └─────────────────┘
                                 │
                        ┌─────────────────┐
                        │      Kafka      │
                        │   (Events)      │
                        │   Port 9092     │
                        └─────────────────┘
```

## Next Steps

After setting up the Docker environment:

1. **Test API Endpoints**
   - Visit http://localhost:3000/api for Swagger documentation
   - Test authentication endpoints
   - Try WebSocket connections

2. **Implement Remaining Features**
   - Search and Indexing (Task 8)
   - Notification System (Task 9)
   - Media Handling (Task 10)
   - Multi-tenancy (Task 11)

3. **Load Testing**
   - Use tools like Artillery or k6
   - Test WebSocket connections
   - Monitor performance metrics
