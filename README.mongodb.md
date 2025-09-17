# Chat System với MongoDB Read Database

Hệ thống chat với kiến trúc hybrid sử dụng PostgreSQL cho write operations và MongoDB cho read operations.

## 🏗️ Kiến trúc

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   PostgreSQL    │    │     MongoDB     │    │  Elasticsearch  │
│   (Write DB)    │    │   (Read DB)     │    │   (Search DB)   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Commands      │    │     Queries     │    │    Search       │
│   (CQRS)        │    │     (CQRS)      │    │   Operations    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Event Bus     │    │   Change Streams │    │   Real-time     │
│   (Sync)        │    │   (Real-time)    │    │   Features      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## 🚀 Tính năng chính

### **1. Hybrid Database Architecture**
- **PostgreSQL**: Write operations, transactions, consistency
- **MongoDB**: Read operations, denormalized data, performance
- **Elasticsearch**: Search operations, full-text search
- **Redis**: Caching layer, session management

### **2. CQRS Implementation**
- **Commands**: Write operations → PostgreSQL
- **Queries**: Read operations → MongoDB
- **Events**: Data synchronization between databases
- **Event Handlers**: Real-time data sync

### **3. Real-time Features**
- **MongoDB Change Streams**: Real-time data changes
- **WebSocket**: Real-time communication
- **Event Broadcasting**: Live updates to clients
- **User Presence**: Online/offline status

### **4. Advanced Analytics**
- **Message Analytics**: Volume, types, trends
- **User Analytics**: Engagement, retention, activity
- **Conversation Analytics**: Growth, activity, metrics
- **System Analytics**: Performance, health, usage

### **5. Caching Layer**
- **Redis Cache**: High-performance caching
- **Smart Invalidation**: Automatic cache updates
- **Cache Warming**: Proactive cache loading
- **Performance Optimization**: Reduced database load

## 📁 Cấu trúc thư mục

```
src/
├── shared/
│   ├── infrastructure/
│   │   └── mongodb/
│   │       ├── mongodb.service.ts          # Core MongoDB service
│   │       └── mongodb.module.ts           # MongoDB module
│   ├── domain/
│   │   ├── entities/
│   │   │   ├── message-mongodb.entity.ts      # Message schema
│   │   │   ├── conversation-mongodb.entity.ts # Conversation schema
│   │   │   └── user-conversation-mongodb.entity.ts # User conversation schema
│   │   └── repositories/
│   │       ├── message-mongodb.repository.ts      # Message repository
│   │       ├── conversation-mongodb.repository.ts # Conversation repository
│   │       └── user-conversation-mongodb.repository.ts # User conversation repository
│   ├── sync/
│   │   └── handlers/
│   │       └── message-sync-mongodb.handler.ts # Data sync handlers
│   ├── analytics/
│   │   ├── mongodb-analytics.service.ts    # Analytics service
│   │   └── analytics.controller.ts         # Analytics API
│   ├── realtime/
│   │   ├── mongodb-change-streams.service.ts # Change streams
│   │   └── realtime-events.service.ts      # Real-time events
│   ├── cache/
│   │   ├── redis-cache.service.ts          # Redis cache
│   │   └── cached-repositories.service.ts  # Cached repositories
│   ├── monitoring/
│   │   └── mongodb-monitor.service.ts      # Health monitoring
│   └── controllers/
│       ├── mongodb-health.controller.ts    # Health API
│       └── analytics.controller.ts          # Analytics API
├── chat/
│   └── handlers/
│       ├── get-conversation-history-mongodb.handler.ts
│       ├── get-user-messages-mongodb.handler.ts
│       └── get-recent-messages-mongodb.handler.ts
└── search/
    └── handlers/
        └── search-messages-mongodb.handler.ts
```

## 🛠️ Setup và Installation

### **1. Prerequisites**
```bash
# Install dependencies
npm install

# Install MongoDB
docker run -d --name mongodb -p 27017:27017 mongo:7.0

# Install Redis
docker run -d --name redis -p 6379:6379 redis:7-alpine

# Install PostgreSQL (for write operations)
docker run -d --name postgres -p 5432:5432 -e POSTGRES_PASSWORD=password postgres:15
```

### **2. Environment Configuration**
```bash
# Copy environment file
cp .env.mongodb.example .env

# Update configuration
MONGODB_URI=mongodb://localhost:27017
MONGODB_DATABASE=chat_read
REDIS_HOST=localhost
REDIS_PORT=6379
WRITE_DATABASE_URL=postgresql://postgres:password@localhost:5432/chat_write
```

### **3. Start Services**
```bash
# Start all services with Docker Compose
docker-compose -f docker-compose.mongodb.yml up -d

# Start application
npm run start:dev:mongodb
```

## 📊 API Endpoints

### **Health & Monitoring**
```bash
# MongoDB health
GET /api/v1/health/mongodb

# Analytics
GET /api/v1/analytics/comprehensive?startDate=2024-01-01&endDate=2024-01-31

# Real-time metrics
GET /api/v1/analytics/realtime
```

### **Chat Operations**
```bash
# Get conversation history (from MongoDB)
GET /api/v1/chat/conversations/{id}/history

# Get user messages (from MongoDB)
GET /api/v1/chat/users/{id}/messages

# Search messages (from MongoDB)
GET /api/v1/search/messages?query=hello
```

### **Analytics**
```bash
# Message analytics
GET /api/v1/analytics/messages?startDate=2024-01-01&endDate=2024-01-31

# User analytics
GET /api/v1/analytics/users?startDate=2024-01-01&endDate=2024-01-31

# System analytics
GET /api/v1/analytics/system
```

## 🔄 Data Flow

### **Write Operations**
1. **Command** → PostgreSQL (Write DB)
2. **Event** → Event Bus
3. **Event Handler** → MongoDB (Read DB)
4. **Change Stream** → Real-time updates

### **Read Operations**
1. **Query** → MongoDB (Read DB)
2. **Cache Check** → Redis
3. **Cache Miss** → MongoDB
4. **Cache Update** → Redis

### **Search Operations**
1. **Search Query** → Elasticsearch
2. **Results** → MongoDB (for full data)
3. **Cache** → Redis (for performance)

## 📈 Performance Benefits

### **Read Performance**
- **MongoDB**: Optimized for read operations
- **Denormalized Data**: Reduced joins
- **Proper Indexing**: Fast queries
- **Caching**: Redis layer

### **Write Performance**
- **PostgreSQL**: ACID compliance
- **Transactions**: Data consistency
- **Event-driven**: Async processing
- **Batch Operations**: Efficient writes

### **Real-time Performance**
- **Change Streams**: Native MongoDB feature
- **WebSocket**: Low latency
- **Event Broadcasting**: Efficient updates
- **Connection Pooling**: Scalable

## 🔧 Configuration

### **MongoDB Configuration**
```typescript
{
  uri: 'mongodb://localhost:27017',
  database: 'chat_read',
  maxPoolSize: 50,
  minPoolSize: 5,
  maxIdleTimeMS: 30000,
  serverSelectionTimeoutMS: 5000,
}
```

### **Redis Configuration**
```typescript
{
  host: 'localhost',
  port: 6379,
  db: 0,
  retryDelayOnFailover: 100,
  maxRetriesPerRequest: 3,
  keepAlive: 30000,
}
```

## 🚀 Deployment

### **Production Setup**
```bash
# Build application
npm run build:mongodb

# Start production
npm run start:mongodb

# Docker deployment
docker-compose -f docker-compose.mongodb.yml up -d
```

### **Scaling**
- **Horizontal Scaling**: MongoDB sharding
- **Read Replicas**: MongoDB replica sets
- **Cache Clustering**: Redis cluster
- **Load Balancing**: Multiple instances

## 📝 Monitoring

### **Health Checks**
- **MongoDB**: Connection, performance, indexes
- **Redis**: Memory usage, hit rate, connections
- **Application**: Response time, error rate
- **System**: CPU, memory, disk usage

### **Analytics**
- **Message Volume**: Daily, hourly trends
- **User Activity**: Engagement metrics
- **Performance**: Query times, cache hit rates
- **Errors**: Error rates, failure patterns

## 🔒 Security

### **Database Security**
- **Authentication**: MongoDB auth
- **Authorization**: Role-based access
- **Encryption**: TLS connections
- **Network**: Firewall rules

### **Application Security**
- **Input Validation**: Data sanitization
- **Rate Limiting**: API protection
- **CORS**: Cross-origin policies
- **Authentication**: JWT tokens

## 📚 Documentation

- **API Documentation**: Swagger UI at `/api/docs`
- **Health Monitoring**: `/api/v1/health/mongodb`
- **Analytics Dashboard**: `/api/v1/analytics`
- **Real-time Status**: WebSocket connections

## 🤝 Contributing

1. Fork the repository
2. Create feature branch
3. Commit changes
4. Push to branch
5. Create Pull Request

## 📄 License

This project is licensed under the MIT License.