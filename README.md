# ChemChat - Enterprise Real-Time Chat System

A production-ready, scalable real-time chat system built with NestJS, designed to handle millions of concurrent users through advanced architectural patterns including CQRS, event-driven architecture, and horizontal scaling capabilities.

## 🚀 Quick Start

```bash
# Clone and setup
git clone <repository-url>
cd chemchat

# Quick start for new developers
make quick-start

# Start development with hot reload
make dev-watch
```

**Access Points:**

- 🌐 **API**: http://localhost:3000
- 📊 **Health Check**: http://localhost:3000/health
- 📚 **API Docs**: http://localhost:3000/api/docs
- 🗄️ **Database Admin**: http://localhost:8080
- 🔍 **Elasticsearch**: http://localhost:9200
- 📈 **Metrics**: http://localhost:3000/metrics

## 📋 Table of Contents

- [Architecture Overview](#-architecture-overview)
- [Key Features](#-key-features)
- [Technology Stack](#-technology-stack)
- [Project Structure](#-project-structure)
- [Installation & Setup](#-installation--setup)
- [Development](#-development)
- [API Documentation](#-api-documentation)
- [Database Schema](#-database-schema)
- [Real-time Features](#-real-time-features)
- [Security & Authentication](#-security--authentication)
- [Monitoring & Observability](#-monitoring--observability)
- [Testing](#-testing)
- [Deployment](#-deployment)
- [Performance & Scaling](#-performance--scaling)
- [Contributing](#-contributing)

## 🏗️ Architecture Overview

ChemChat implements a sophisticated microservices-inspired architecture within a NestJS monolith, designed for enterprise-scale real-time communication.

### High-Level Architecture

```mermaid
graph TB
    subgraph "Client Layer"
        WEB[Web Client]
        MOBILE[Mobile Client]
        SDK[SDK Integrations]
    end

    subgraph "API Gateway & Load Balancer"
        LB[Load Balancer]
        GATEWAY[API Gateway]
    end

    subgraph "NestJS Application Layer"
        subgraph "WebSocket Gateways"
            WS1[WS Gateway 1]
            WS2[WS Gateway 2]
            WSN[WS Gateway N]
        end

        subgraph "Core Services"
            AUTH[Auth Service]
            CHAT[Chat Service]
            PRESENCE[Presence Service]
            NOTIF[Notification Service]
            MEDIA[Media Service]
            SEARCH[Search Service]
        end

        subgraph "Background Workers"
            OUTBOX[Outbox Worker]
            INDEXER[Search Indexer]
            MEDIA_PROC[Media Processor]
        end
    end

    subgraph "Message Bus & Events"
        KAFKA[Kafka Cluster]
        REDIS_PUB[Redis Pub/Sub]
    end

    subgraph "Data Layer"
        POSTGRES[(PostgreSQL)]
        REDIS[(Redis Cluster)]
        ELASTIC[(Elasticsearch)]
        S3[(S3/MinIO)]
    end

    WEB --> LB
    MOBILE --> LB
    SDK --> LB
    LB --> GATEWAY
    GATEWAY --> WS1
    GATEWAY --> AUTH
    GATEWAY --> CHAT

    CHAT --> KAFKA
    KAFKA --> OUTBOX
    KAFKA --> INDEXER
    OUTBOX --> REDIS_PUB
    REDIS_PUB --> WS1

    AUTH --> POSTGRES
    CHAT --> POSTGRES
    SEARCH --> ELASTIC
    MEDIA --> S3
```

### Core Design Principles

- **🎯 Event-Driven Architecture**: CQRS with CommandBus and EventBus for scalability
- **📈 Horizontal Scalability**: Stateless services with Redis-based coordination
- **🔄 Data Consistency**: Outbox pattern with Kafka for reliable event distribution
- **📊 Message Ordering**: Monotonic sequence numbers per conversation with idempotency
- **⚡ Performance**: Read models and caching for optimal query performance
- **🛡️ Security**: Defense in depth with encryption, authentication, and authorization
- **👁️ Observability**: End-to-end tracing with OpenTelemetry and SLO monitoring

## ✨ Key Features

### 💬 Real-Time Communication

- **WebSocket-based messaging** with automatic reconnection
- **Message ordering** with sequence numbers and idempotency
- **Typing indicators** and presence status
- **Message reactions** and editing capabilities
- **File attachments** with media processing pipeline

### 🔐 Enterprise Security

- **Multi-factor authentication** (TOTP)
- **JWT token management** (access, refresh, WebSocket tokens)
- **Device binding** and token revocation
- **Rate limiting** and DDoS protection
- **End-to-end encryption** support (optional)

### 📊 Advanced Features

- **Full-text search** powered by Elasticsearch
- **Message history** with pagination
- **Read receipts** and delivery status
- **Push notifications** with fallback to email
- **Multi-tenancy** support with data isolation
- **Content moderation** and admin controls

### 🚀 Scalability & Performance

- **Horizontal scaling** with Redis adapter
- **Event streaming** with Kafka
- **Circuit breakers** and graceful degradation
- **Caching strategies** for optimal performance
- **Database sharding** support
- **CDN integration** for media delivery

### 🔍 Monitoring & Observability

- **OpenTelemetry** distributed tracing
- **Prometheus metrics** with custom dashboards
- **Structured logging** with correlation IDs
- **Health checks** and SLO monitoring
- **Performance budgets** and alerting

## 🛠️ Technology Stack

### Core Framework

- **[NestJS](https://nestjs.com/)** - Progressive Node.js framework
- **[TypeScript](https://www.typescriptlang.org/)** - Type-safe JavaScript
- **[Node.js 18+](https://nodejs.org/)** - Runtime environment

### Database & Storage

- **[PostgreSQL 15+](https://www.postgresql.org/)** - Primary database with JSONB support
- **[Prisma](https://www.prisma.io/)** - Database ORM and migrations
- **[Redis 7+](https://redis.io/)** - Caching, sessions, and pub/sub
- **[Elasticsearch 8+](https://www.elastic.co/)** - Full-text search and analytics
- **[MinIO/S3](https://min.io/)** - Object storage for media files

### Real-Time & Messaging

- **[Socket.IO](https://socket.io/)** - WebSocket communication
- **[KafkaJS](https://kafka.js.org/)** - Event streaming and message bus
- **[Redis Pub/Sub](https://redis.io/docs/manual/pubsub/)** - Real-time message distribution

### Authentication & Security

- **[Passport.js](http://www.passportjs.org/)** - Authentication strategies
- **[JWT](https://jwt.io/)** - Token-based authentication
- **[bcryptjs](https://github.com/dcodeIO/bcrypt.js)** - Password hashing
- **[Speakeasy](https://github.com/speakeasyjs/speakeasy)** - TOTP for MFA

### Media Processing

- **[Sharp](https://sharp.pixelplumbing.com/)** - Image processing
- **[FFmpeg](https://ffmpeg.org/)** - Video/audio processing
- **[AWS SDK](https://aws.amazon.com/sdk-for-javascript/)** - Cloud storage integration

### Monitoring & Observability

- **[OpenTelemetry](https://opentelemetry.io/)** - Distributed tracing
- **[Prometheus](https://prometheus.io/)** - Metrics collection
- **[Winston](https://github.com/winstonjs/winston)** - Structured logging

### Development & Testing

- **[Jest](https://jestjs.io/)** - Testing framework
- **[ESLint](https://eslint.org/)** - Code linting
- **[Prettier](https://prettier.io/)** - Code formatting
- **[Docker](https://www.docker.com/)** - Containerization

## 📁 Project Structure

```
chemchat/
├── 📁 src/                          # Source code
│   ├── 📁 auth/                     # Authentication & authorization
│   │   ├── 📁 controllers/          # Auth REST endpoints
│   │   ├── 📁 services/             # Auth business logic
│   │   ├── 📁 guards/               # JWT & WebSocket guards
│   │   └── 📁 decorators/           # Auth decorators
│   ├── 📁 chat/                     # Core chat functionality
│   │   ├── 📁 commands/             # CQRS command definitions
│   │   ├── 📁 queries/              # CQRS query definitions
│   │   ├── 📁 events/               # Domain events
│   │   ├── 📁 handlers/             # Command/Query/Event handlers
│   │   ├── 📁 gateways/             # WebSocket gateways
│   │   ├── 📁 services/             # Chat business services
│   │   └── 📁 read-models/          # Optimized read models
│   ├── 📁 presence/                 # User presence & activity
│   │   ├── 📁 services/             # Presence management
│   │   └── 📁 gateways/             # Presence WebSocket events
│   ├── 📁 notification/             # Push notifications & alerts
│   │   ├── 📁 services/             # Notification delivery
│   │   ├── 📁 workers/              # Background notification jobs
│   │   └── 📁 integration/          # External service integrations
│   ├── 📁 media/                    # File upload & processing
│   │   ├── 📁 controllers/          # Media REST endpoints
│   │   ├── 📁 services/             # Media processing logic
│   │   └── 📁 workers/              # Background media jobs
│   ├── 📁 search/                   # Full-text search
│   │   ├── 📁 services/             # Elasticsearch integration
│   │   ├── 📁 queries/              # Search query builders
│   │   └── 📁 workers/              # Search indexing jobs
│   ├── 📁 security/                 # Security middleware & services
│   │   ├── 📁 middleware/           # Security middleware
│   │   └── 📁 services/             # Security monitoring
│   ├── 📁 sync/                     # Client synchronization
│   │   ├── 📁 controllers/          # Sync REST endpoints
│   │   └── 📁 services/             # Delta sync logic
│   ├── 📁 health/                   # Health checks & monitoring
│   ├── 📁 observability/            # Tracing, metrics, logging
│   │   ├── 📁 tracing/              # OpenTelemetry setup
│   │   ├── 📁 metrics/              # Prometheus metrics
│   │   └── 📁 performance/          # Performance monitoring
│   └── 📁 shared/                   # Shared utilities & infrastructure
│       ├── 📁 config/               # Configuration management
│       ├── 📁 cqrs/                 # CQRS infrastructure
│       ├── 📁 domain/               # Domain entities & value objects
│       ├── 📁 infrastructure/       # Database, Redis, Kafka clients
│       ├── 📁 filters/              # Global exception filters
│       ├── 📁 middleware/           # Common middleware
│       ├── 📁 outbox/               # Outbox pattern implementation
│       ├── 📁 sequence/             # Sequence number generation
│       └── 📁 kafka/                # Kafka event bus
├── 📁 prisma/                       # Database schema & migrations
│   └── 📄 schema.prisma             # Prisma schema definition
├── 📁 test/                         # Test files
│   ├── 📁 unit/                     # Unit tests
│   ├── 📁 integration/              # Integration tests
│   └── 📁 e2e/                      # End-to-end tests
├── 📁 docs/                         # Documentation
│   ├── 📄 api-documentation.md     # API documentation
│   └── 📄 deployment-architecture.md # Deployment guide
├── 📁 scripts/                      # Development scripts
│   └── 📄 docker-dev.sh             # Docker development helper
├── 📁 .kiro/                        # Kiro AI specifications
│   └── 📁 specs/                    # Detailed system specifications
├── 📄 docker-compose.yml            # Docker services configuration
├── 📄 Dockerfile                    # Production Docker image
├── 📄 Makefile                      # Development automation
└── 📄 package.json                  # Node.js dependencies
```

## 🔧 Installation & Setup

### Prerequisites

- **Node.js 18+** and **pnpm**
- **Docker** and **Docker Compose**
- **Git**

### Quick Setup

```bash
# 1. Clone the repository
git clone <repository-url>
cd chemchat

# 2. Install dependencies
pnpm install

# 3. Copy environment configuration
cp .env.example .env

# 4. Start all services with Docker
make docker-up

# 5. Run database migrations
make db-migrate

# 6. Start development server
make dev-watch
```

### Manual Setup

```bash
# Install dependencies
pnpm install

# Generate Prisma client
pnpm prisma generate

# Start infrastructure services
docker-compose up -d postgres redis elasticsearch kafka

# Run database migrations
pnpm prisma migrate dev

# Start the application
pnpm start:dev
```

### Environment Configuration

Key environment variables in `.env`:

```bash
# Database
DATABASE_URL="postgresql://chemchat:chemchat_password@localhost:5432/chatdb"

# JWT Secrets (generate secure secrets for production)
JWT_ACCESS_SECRET="your-super-secret-access-token-key"
JWT_REFRESH_SECRET="your-super-secret-refresh-token-key"
JWT_WS_SECRET="your-super-secret-websocket-token-key"

# Redis
REDIS_HOST="localhost"
REDIS_PORT=6379
REDIS_PASSWORD="redis_password"

# Kafka
KAFKA_BROKERS="localhost:9092"

# Elasticsearch
ELASTICSEARCH_URL="http://localhost:9200"
```

## 💻 Development

### Available Commands

```bash
# Development
make dev              # Start full development environment
make dev-watch        # Start with hot reload
make dev-debug        # Start in debug mode

# Docker Operations
make docker-up        # Start all services
make docker-down      # Stop all services
make docker-logs      # View service logs
make docker-status    # Check service health

# Database Operations
make db-migrate       # Run migrations
make db-reset         # Reset database
make db-studio        # Open Prisma Studio
make db-backup        # Backup database

# Testing
make test             # Run all tests
make test-unit        # Unit tests only
make test-e2e         # End-to-end tests
make test-coverage    # Coverage report

# Code Quality
make lint             # Run ESLint
make format           # Format with Prettier
make security-scan    # Security audit

# Monitoring
make health           # Check application health
make check-services   # Check all service endpoints
make monitor          # Real-time monitoring
```

### Development Workflow

1. **Start Development Environment**

   ```bash
   make quick-start
   ```

2. **Make Changes**
   - Edit source code in `src/`
   - Hot reload automatically updates the application

3. **Run Tests**

   ```bash
   make test-unit      # Quick unit tests
   make test-e2e       # Full integration tests
   ```

4. **Check Code Quality**

   ```bash
   make lint           # Check for issues
   make format         # Auto-format code
   ```

5. **Commit Changes**
   ```bash
   git add .
   git commit -m "feat: add new feature"
   ```

### Adding New Features

1. **Create Module Structure**

   ```bash
   # Example: Adding a new "rooms" feature
   mkdir -p src/rooms/{controllers,services,handlers,events}
   ```

2. **Implement CQRS Pattern**

   ```typescript
   // src/rooms/commands/create-room.command.ts
   export class CreateRoomCommand {
     constructor(
       public readonly name: string,
       public readonly ownerId: string,
     ) {}
   }

   // src/rooms/handlers/create-room.handler.ts
   @CommandHandler(CreateRoomCommand)
   export class CreateRoomHandler {
     async execute(command: CreateRoomCommand): Promise<void> {
       // Implementation
     }
   }
   ```

3. **Add to Module**
   ```typescript
   // src/rooms/rooms.module.ts
   @Module({
     providers: [CreateRoomHandler],
     // ...
   })
   export class RoomsModule {}
   ```

## 📚 API Documentation

### REST API Endpoints

#### Authentication

```http
POST /api/v1/auth/login          # User login
POST /api/v1/auth/refresh        # Refresh token
POST /api/v1/auth/logout         # User logout
POST /api/v1/auth/mfa/enable     # Enable MFA
POST /api/v1/auth/mfa/verify     # Verify MFA token
```

#### Chat & Conversations

```http
GET    /api/v1/conversations                    # List user conversations
POST   /api/v1/conversations                    # Create conversation
GET    /api/v1/conversations/:id/messages       # Get message history
POST   /api/v1/conversations/:id/messages       # Send message
PUT    /api/v1/messages/:id                     # Edit message
DELETE /api/v1/messages/:id                     # Delete message
POST   /api/v1/messages/:id/reactions           # Add reaction
```

#### Search

```http
GET /api/v1/search/messages?q=query&conversation_id=id  # Search messages
GET /api/v1/search/conversations?q=query                # Search conversations
```

#### Media

```http
POST /api/v1/media/upload        # Upload file
GET  /api/v1/media/:id           # Get file metadata
GET  /api/v1/media/:id/download  # Download file
```

### WebSocket Events

#### Connection & Authentication

```typescript
// Client connects with JWT token
socket.emit('authenticate', { token: 'jwt_token' });

// Server confirms authentication
socket.on('authenticated', { userId: 'user_id' });
```

#### Real-time Messaging

```typescript
// Send message
socket.emit('message.send', {
  conversationId: 'conv_id',
  content: 'Hello world!',
  clientMessageId: 'client_123',
});

// Receive message
socket.on('message.created', {
  id: 'msg_id',
  conversationId: 'conv_id',
  senderId: 'user_id',
  content: 'Hello world!',
  sequenceNumber: 12345,
  timestamp: '2024-01-01T00:00:00Z',
});
```

#### Presence & Typing

```typescript
// Join conversation
socket.emit('conversation.join', { conversationId: 'conv_id' });

// Start typing
socket.emit('typing.start', { conversationId: 'conv_id' });

// Receive typing indicator
socket.on('typing.started', {
  conversationId: 'conv_id',
  userId: 'user_id',
  displayName: 'John Doe',
});
```

### Interactive API Documentation

When running in development mode, visit:

- **Swagger UI**: http://localhost:3000/api/docs
- **OpenAPI JSON**: http://localhost:3000/api/docs-json

## 🗄️ Database Schema

### Core Entities

#### Users & Authentication

```sql
-- Users with MFA support
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(50) UNIQUE NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    mfa_enabled BOOLEAN DEFAULT FALSE,
    mfa_secret VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### Conversations & Messages

```sql
-- Conversations (DM or Group)
CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(20) NOT NULL CHECK (type IN ('dm', 'group')),
    name VARCHAR(100),
    owner_id UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Messages with sequence ordering
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id UUID REFERENCES users(id),
    client_message_id VARCHAR(100),
    sequence_number BIGINT NOT NULL,
    message_type VARCHAR(20) NOT NULL DEFAULT 'text',
    content JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(conversation_id, sequence_number),
    UNIQUE(conversation_id, client_message_id, sender_id)
);
```

#### Multi-Tenancy Support

```sql
-- Tenants for enterprise features
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) UNIQUE NOT NULL,
    subscription_tier VARCHAR(20) DEFAULT 'FREE',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tenant quotas and usage tracking
CREATE TABLE tenant_quotas (
    tenant_id UUID PRIMARY KEY REFERENCES tenants(id),
    max_users INTEGER NOT NULL,
    max_conversations INTEGER NOT NULL,
    max_messages_per_day INTEGER NOT NULL,
    max_storage_bytes BIGINT NOT NULL
);
```

### Database Migrations

```bash
# Create new migration
pnpm prisma migrate dev --name add_new_feature

# Apply migrations
pnpm prisma migrate deploy

# Reset database (development only)
pnpm prisma migrate reset
```

### Performance Optimizations

- **Partitioning**: Messages table partitioned by time
- **Indexing**: Optimized indexes for common queries
- **Read Replicas**: Separate read/write database connections
- **Connection Pooling**: PgBouncer for connection management

## ⚡ Real-time Features

### WebSocket Architecture

```mermaid
sequenceDiagram
    participant C1 as Client 1
    participant GW as WebSocket Gateway
    participant REDIS as Redis Pub/Sub
    participant C2 as Client 2

    C1->>GW: Send Message
    GW->>REDIS: Publish to Room Channel
    REDIS->>GW: Broadcast to Subscribers
    GW->>C2: Deliver Message
    GW->>C1: Acknowledge Receipt
```

### Message Ordering & Consistency

- **Sequence Numbers**: Monotonic per-conversation ordering
- **Idempotency**: Client message IDs prevent duplicates
- **Conflict Resolution**: Last-writer-wins with timestamps
- **Delta Sync**: Efficient reconnection synchronization

### Presence System

```typescript
// Presence status tracking
interface PresenceStatus {
  status: 'online' | 'offline' | 'away';
  lastSeen: Date;
  devices: DeviceInfo[];
}

// Typing indicators with TTL
interface TypingIndicator {
  userId: string;
  conversationId: string;
  startedAt: Date;
  expiresAt: Date;
}
```

### Scaling WebSocket Connections

- **Redis Adapter**: Cross-instance message distribution
- **Sticky Sessions**: Load balancer session affinity
- **Connection Pooling**: Efficient resource utilization
- **Graceful Shutdown**: Zero-downtime deployments

## 🔐 Security & Authentication

### Multi-Factor Authentication

```typescript
// Enable MFA for user
POST /api/v1/auth/mfa/enable
{
  "secret": "base32_secret",
  "token": "123456"
}

// Verify MFA during login
POST /api/v1/auth/login
{
  "username": "user@example.com",
  "password": "password",
  "mfaToken": "123456"
}
```

### Token Management

- **Access Tokens**: Short-lived (15 minutes) for API access
- **Refresh Tokens**: Long-lived (7 days) for token renewal
- **WebSocket Tokens**: Medium-lived (1 hour) for WS connections
- **Device Binding**: Refresh tokens bound to device fingerprints

### Security Features

- **Rate Limiting**: Per-user and per-IP rate limits
- **CORS Protection**: Configurable origin restrictions
- **Input Validation**: Comprehensive DTO validation
- **SQL Injection Prevention**: Parameterized queries with Prisma
- **XSS Protection**: Content sanitization and CSP headers

### Audit Logging

```sql
-- Comprehensive audit trail
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID REFERENCES users(id),
    action VARCHAR(50) NOT NULL,
    target_type VARCHAR(50) NOT NULL,
    target_id UUID NOT NULL,
    metadata JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## 📊 Monitoring & Observability

### OpenTelemetry Integration

```typescript
// Distributed tracing setup
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';

const sdk = new NodeSDK({
  instrumentations: [getNodeAutoInstrumentations()],
  serviceName: 'chemchat-api',
  serviceVersion: '1.0.0',
});

sdk.start();
```

### Custom Metrics

```typescript
// Prometheus metrics
const messagesSentCounter = new Counter({
  name: 'chat_messages_sent_total',
  help: 'Total number of messages sent',
  labelNames: ['conversation_type', 'message_type'],
});

const activeConnectionsGauge = new Gauge({
  name: 'chat_active_connections',
  help: 'Number of active WebSocket connections',
});

const messageLatencyHistogram = new Histogram({
  name: 'chat_message_latency_seconds',
  help: 'Message delivery latency',
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
});
```

### Health Checks

```typescript
// Comprehensive health monitoring
@Controller('health')
export class HealthController {
  @Get()
  async getHealth(): Promise<HealthStatus> {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      services: {
        database: await this.checkDatabase(),
        redis: await this.checkRedis(),
        kafka: await this.checkKafka(),
        elasticsearch: await this.checkElasticsearch(),
      },
    };
  }
}
```

### Alerting Rules

```yaml
# Prometheus alerting rules
groups:
  - name: chemchat.rules
    rules:
      - alert: HighMessageLatency
        expr: histogram_quantile(0.95, chat_message_latency_seconds) > 0.25
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: 'High message delivery latency detected'

      - alert: DatabaseConnectionsHigh
        expr: pg_stat_activity_count > 80
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: 'Database connection pool near capacity'
```

## 🧪 Testing

### Testing Strategy

```mermaid
graph TB
    subgraph "Testing Pyramid"
        E2E[End-to-End Tests<br/>- Full user journeys<br/>- WebSocket flows<br/>- Multi-service integration]
        INTEGRATION[Integration Tests<br/>- API endpoints<br/>- Database operations<br/>- Event publishing]
        UNIT[Unit Tests<br/>- Domain logic<br/>- Command/Query handlers<br/>- Services and utilities]
    end

    E2E --> INTEGRATION
    INTEGRATION --> UNIT
```

### Running Tests

```bash
# All tests
make test

# Unit tests only
make test-unit

# Integration tests
make test-integration

# End-to-end tests
make test-e2e

# Coverage report
make test-coverage

# Watch mode for development
make test-watch
```

### Test Examples

#### Unit Test

```typescript
describe('SendMessageCommandHandler', () => {
  it('should create message with sequence number', async () => {
    // Arrange
    const command = new SendMessageCommand(conversationId, senderId, content);
    const mockRepo = createMockRepository();
    const handler = new SendMessageCommandHandler(mockRepo, eventBus);

    // Act
    await handler.handle(command);

    // Assert
    expect(mockRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        sequenceNumber: expect.any(Number),
        content: content,
      }),
    );
  });
});
```

#### Integration Test

```typescript
describe('ChatController (Integration)', () => {
  it('should send message and publish event', async () => {
    // Arrange
    const app = await createTestApp();
    const user = await createTestUser();
    const conversation = await createTestConversation();

    // Act
    const response = await request(app.getHttpServer())
      .post(`/conversations/${conversation.id}/messages`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ content: 'Hello world' });

    // Assert
    expect(response.status).toBe(201);
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.any(MessageCreatedEvent),
    );
  });
});
```

#### E2E Test

```typescript
describe('Real-time messaging (E2E)', () => {
  it('should deliver message to all room participants', async () => {
    // Arrange
    const [client1, client2] = await createWebSocketClients(2);
    const room = await createTestRoom();
    await Promise.all([client1.joinRoom(room.id), client2.joinRoom(room.id)]);

    // Act
    await client1.sendMessage(room.id, 'Hello everyone!');

    // Assert
    const message = await client2.waitForMessage();
    expect(message.content).toBe('Hello everyone!');
  });
});
```

## 🚀 Deployment

### Docker Deployment

```bash
# Build production image
docker build -t chemchat:latest .

# Run with Docker Compose
docker-compose -f docker-compose.yml up -d

# Scale WebSocket gateways
docker-compose up -d --scale chemchat-app=3
```

### Kubernetes Deployment

```yaml
# HPA based on custom metrics
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: chemchat-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: chemchat-app
  minReplicas: 3
  maxReplicas: 100
  metrics:
    - type: Pods
      pods:
        metric:
          name: socket_connections_per_pod
        target:
          type: AverageValue
          averageValue: '1000'
```

### Environment-Specific Configuration

#### Development

```bash
NODE_ENV=development
LOG_LEVEL=debug
CORS_ORIGINS=http://localhost:3000,http://localhost:3001
```

#### Production

```bash
NODE_ENV=production
LOG_LEVEL=info
CORS_ORIGINS=https://app.chemchat.com
JWT_ACCESS_SECRET=<secure-secret-from-vault>
DATABASE_URL=<production-database-url>
```

### Zero-Downtime Deployment

1. **Database Migrations**: Run before deployment
2. **Rolling Updates**: Gradual instance replacement
3. **Health Checks**: Ensure new instances are healthy
4. **Graceful Shutdown**: Complete existing requests

## ⚡ Performance & Scaling

### Service Level Objectives (SLOs)

- **Message Delivery**: p95 ≤ 250ms in-region
- **API Response Time**: p95 ≤ 150ms for recent messages
- **Search Performance**: p95 ≤ 500ms for full-text search
- **Availability**: 99.9% uptime
- **Message Durability**: 99.999% delivery guarantee

### Scaling Strategies

#### Horizontal Scaling

- **Stateless Services**: All application state in external stores
- **Load Balancing**: Distribute traffic across instances
- **Database Sharding**: Partition data by conversation ID
- **CDN Integration**: Global content delivery

#### Performance Optimizations

- **Connection Pooling**: Efficient database connections
- **Caching Layers**: Redis for frequently accessed data
- **Read Replicas**: Separate read/write database traffic
- **Message Batching**: Bulk operations for efficiency

#### Resource Management

```typescript
// Circuit breaker for external services
@Injectable()
export class CircuitBreakerService {
  async execute<T>(
    key: string,
    operation: () => Promise<T>,
    options: CircuitBreakerOptions = {},
  ): Promise<T> {
    const breaker = this.getOrCreateBreaker(key, options);
    return breaker.execute(operation);
  }
}
```

### Load Testing

```javascript
// k6 load test script
import ws from 'k6/ws';
import { check } from 'k6';

export const options = {
  stages: [
    { duration: '2m', target: 1000 }, // Ramp up
    { duration: '5m', target: 1000 }, // Stay at 1000 users
    { duration: '2m', target: 10000 }, // Ramp up to 10k
    { duration: '10m', target: 10000 }, // Stay at 10k
    { duration: '2m', target: 0 }, // Ramp down
  ],
};
```

## 🤝 Contributing

### Development Setup

1. **Fork the repository**
2. **Create feature branch**: `git checkout -b feature/amazing-feature`
3. **Make changes and test**: `make test`
4. **Commit changes**: `git commit -m 'feat: add amazing feature'`
5. **Push to branch**: `git push origin feature/amazing-feature`
6. **Open Pull Request**

### Code Standards

- **TypeScript**: Strict type checking enabled
- **ESLint**: Airbnb configuration with custom rules
- **Prettier**: Consistent code formatting
- **Conventional Commits**: Semantic commit messages
- **Test Coverage**: Minimum 80% coverage required

### Pull Request Process

1. **Update Documentation**: Include relevant documentation updates
2. **Add Tests**: Ensure new features have appropriate tests
3. **Pass CI/CD**: All checks must pass
4. **Code Review**: At least one approval required
5. **Merge**: Squash and merge to main branch

## 📄 License

This project is licensed under the **UNLICENSED** license - see the [LICENSE](LICENSE) file for details.

## 🆘 Support & Documentation

- **📚 Full Documentation**: [docs/](./docs/)
- **🔧 API Reference**: http://localhost:3000/api/docs (when running)
- **🏗️ Architecture Guide**: [docs/deployment-architecture.md](./docs/deployment-architecture.md)
- **📊 Performance Guide**: [.kiro/specs/real-time-chat-system/](./kiro/specs/real-time-chat-system/)

## 🎯 Roadmap

- [ ] **End-to-End Encryption**: Optional E2EE for sensitive conversations
- [ ] **Voice/Video Calls**: WebRTC integration for real-time communication
- [ ] **Mobile SDKs**: Native iOS and Android SDKs
- [ ] **Advanced Analytics**: Conversation insights and usage analytics
- [ ] **AI Integration**: Smart replies and content moderation
- [ ] **Federation**: Cross-instance communication protocol

---

**Built with ❤️ by the ChemChat Team**

_For questions, issues, or contributions, please refer to our [Contributing Guidelines](CONTRIBUTING.md) or open an issue on GitHub._
