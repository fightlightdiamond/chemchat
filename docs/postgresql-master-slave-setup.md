# PostgreSQL Master-Slave Setup for CQRS

## 1. Architecture Overview

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Write DB      │    │   Read DB       │    │   Search DB     │
│   (PostgreSQL   │    │   (PostgreSQL   │    │ (Elasticsearch) │
│    Master)      │    │    Slave)       │    │                 │
│                 │    │                 │    │                 │
│ • Commands      │    │ • Queries       │    │ • Search        │
│ • Events        │    │ • Read Models   │    │ • Analytics     │
│ • Aggregates    │    │ • Projections   │    │ • Full-text     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌─────────────────┐
                    │   Streaming     │
                    │   Replication  │
                    │                 │
                    │ • WAL Streaming │
                    │ • Logical Rep   │
                    │ • Real-time     │
                    └─────────────────┘
```

## 2. PostgreSQL Configuration

### Master Database (Write)
```sql
-- postgresql.conf
wal_level = logical
max_wal_senders = 10
max_replication_slots = 10
hot_standby = on

-- pg_hba.conf
host replication replicator 0.0.0.0/0 md5
```

### Slave Database (Read)
```sql
-- postgresql.conf
hot_standby = on
max_standby_streaming_delay = 30s
max_standby_archive_delay = 30s
```

## 3. Docker Compose Setup

```yaml
version: '3.8'
services:
  postgres-master:
    image: postgres:15
    environment:
      POSTGRES_DB: chat_write
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
      POSTGRES_REPLICATION_USER: replicator
      POSTGRES_REPLICATION_PASSWORD: replicator_password
    volumes:
      - ./postgres-master.conf:/etc/postgresql/postgresql.conf
      - postgres_master_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    command: >
      postgres
      -c wal_level=logical
      -c max_wal_senders=10
      -c max_replication_slots=10
      -c hot_standby=on

  postgres-slave:
    image: postgres:15
    environment:
      POSTGRES_DB: chat_read
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
      PGUSER: postgres
    volumes:
      - ./postgres-slave.conf:/etc/postgresql/postgresql.conf
      - postgres_slave_data:/var/lib/postgresql/data
    ports:
      - "5433:5432"
    depends_on:
      - postgres-master
    command: >
      bash -c "
      until pg_basebackup -h postgres-master -D /var/lib/postgresql/data -U replicator -v -P -W
      do
        echo 'Waiting for master to be available...'
        sleep 1s
      done
      echo 'Backup done, starting slave...'
      postgres -c hot_standby=on
      "

volumes:
  postgres_master_data:
  postgres_slave_data:
```

## 4. Application Configuration

### Environment Variables
```env
# Write Database (Master)
WRITE_DATABASE_URL="postgresql://postgres:password@localhost:5432/chat_write"

# Read Database (Slave)
READ_DATABASE_URL="postgresql://postgres:password@localhost:5433/chat_read"

# Search Database
ELASTICSEARCH_NODE="http://localhost:9200"
```

### Database Services
```typescript
// src/shared/infrastructure/database/write-database.service.ts
@Injectable()
export class WriteDatabaseService extends PrismaClient {
  constructor() {
    super({
      datasources: {
        db: {
          url: process.env.WRITE_DATABASE_URL,
        },
      },
      log: ['warn', 'error'],
    });
  }
}

// src/shared/infrastructure/database/read-database.service.ts
@Injectable()
export class ReadDatabaseService extends PrismaClient {
  constructor() {
    super({
      datasources: {
        db: {
          url: process.env.READ_DATABASE_URL,
        },
      },
      log: ['warn', 'error'],
    });
  }
}
```

## 5. Read Model Optimizations

### Indexes for Read Performance
```sql
-- Optimize for common read queries
CREATE INDEX CONCURRENTLY idx_messages_conversation_sequence 
ON messages (conversation_id, sequence_number DESC);

CREATE INDEX CONCURRENTLY idx_messages_sender_created 
ON messages (sender_id, created_at DESC);

CREATE INDEX CONCURRENTLY idx_conversations_tenant_updated 
ON conversations (tenant_id, updated_at DESC);

-- Partial indexes for better performance
CREATE INDEX CONCURRENTLY idx_messages_active 
ON messages (conversation_id, sequence_number DESC) 
WHERE deleted_at IS NULL;

CREATE INDEX CONCURRENTLY idx_messages_recent 
ON messages (created_at DESC) 
WHERE created_at > NOW() - INTERVAL '30 days';
```

### Read-Only Views
```sql
-- Denormalized view for conversation list
CREATE VIEW conversation_summary AS
SELECT 
  c.id,
  c.title,
  c.type,
  c.tenant_id,
  c.created_at,
  c.updated_at,
  COUNT(m.id) as message_count,
  MAX(m.created_at) as last_message_at,
  MAX(m.sequence_number) as last_sequence_number
FROM conversations c
LEFT JOIN messages m ON c.id = m.conversation_id 
  AND m.deleted_at IS NULL
GROUP BY c.id, c.title, c.type, c.tenant_id, c.created_at, c.updated_at;

-- User conversation membership view
CREATE VIEW user_conversation_membership AS
SELECT 
  ucm.user_id,
  ucm.conversation_id,
  ucm.joined_at,
  ucm.last_read_at,
  c.title as conversation_title,
  c.type as conversation_type,
  c.tenant_id,
  COUNT(m.id) FILTER (WHERE m.created_at > ucm.last_read_at) as unread_count
FROM user_conversations ucm
JOIN conversations c ON ucm.conversation_id = c.id
LEFT JOIN messages m ON c.id = m.conversation_id 
  AND m.deleted_at IS NULL
GROUP BY ucm.user_id, ucm.conversation_id, ucm.joined_at, 
         ucm.last_read_at, c.title, c.type, c.tenant_id;
```

## 6. Monitoring and Health Checks

### Replication Lag Monitoring
```typescript
@Injectable()
export class ReplicationMonitorService {
  constructor(
    private readonly writeDb: WriteDatabaseService,
    private readonly readDb: ReadDatabaseService,
  ) {}

  async getReplicationLag(): Promise<number> {
    // Check replication lag in seconds
    const result = await this.readDb.$queryRaw`
      SELECT EXTRACT(EPOCH FROM (now() - pg_last_xact_replay_timestamp())) as lag_seconds
    `;
    
    return Number((result as any)[0].lag_seconds);
  }

  async isReplicationHealthy(): Promise<boolean> {
    const lag = await this.getReplicationLag();
    return lag < 5; // Less than 5 seconds lag
  }
}
```

### Health Check Endpoint
```typescript
@Controller('health')
export class HealthController {
  constructor(
    private readonly replicationMonitor: ReplicationMonitorService,
  ) {}

  @Get('database')
  async checkDatabaseHealth() {
    const writeHealth = await this.checkWriteDatabase();
    const readHealth = await this.checkReadDatabase();
    const replicationHealth = await this.replicationMonitor.isReplicationHealthy();
    const lag = await this.replicationMonitor.getReplicationLag();

    return {
      write: writeHealth,
      read: readHealth,
      replication: {
        healthy: replicationHealth,
        lagSeconds: lag,
      },
    };
  }
}
```

## 7. Performance Optimizations

### Connection Pooling
```typescript
// Write DB - Smaller pool for transactions
const writeDbConfig = {
  datasources: {
    db: {
      url: process.env.WRITE_DATABASE_URL,
    },
  },
  // Smaller pool for write operations
  __internal: {
    engine: {
      connectionLimit: 10,
    },
  },
};

// Read DB - Larger pool for queries
const readDbConfig = {
  datasources: {
    db: {
      url: process.env.READ_DATABASE_URL,
    },
  },
  // Larger pool for read operations
  __internal: {
    engine: {
      connectionLimit: 50,
    },
  },
};
```

### Query Optimization
```typescript
@Injectable()
export class OptimizedMessageQueryService {
  constructor(private readonly readDb: ReadDatabaseService) {}

  async getConversationMessages(
    conversationId: string,
    limit: number = 50,
    beforeSequence?: bigint,
  ): Promise<Message[]> {
    // Use optimized query with proper indexes
    return await this.readDb.message.findMany({
      where: {
        conversationId,
        deletedAt: null,
        ...(beforeSequence && { sequenceNumber: { lt: beforeSequence } }),
      },
      orderBy: { sequenceNumber: 'desc' },
      take: limit,
      include: {
        sender: {
          select: { id: true, username: true, displayName: true },
        },
      },
    });
  }
}
```

## 8. Benefits of This Approach

### Immediate Benefits
- **Simple Implementation:** Minimal code changes
- **High Consistency:** ACID compliance maintained
- **Cost Effective:** No additional infrastructure
- **Team Familiarity:** Same technology stack

### Performance Benefits
- **Read Load Distribution:** Queries don't impact writes
- **Optimized Indexes:** Different indexes for read patterns
- **Connection Pooling:** Separate pools for read/write
- **Query Optimization:** Read-only optimizations

### Operational Benefits
- **Monitoring:** Built-in PostgreSQL monitoring
- **Backup:** Standard PostgreSQL backup procedures
- **Recovery:** Well-tested recovery procedures
- **Scaling:** Easy to add more read replicas

## 9. When to Consider Different Databases

### Consider Different DBs When:
- **Complex Search Requirements:** Need full-text search, faceted search
- **Analytics Heavy:** Complex aggregations, time-series data
- **High Read Volume:** Read operations 10x+ more than writes
- **Specialized Queries:** Graph queries, document queries
- **Global Scale:** Need geographic distribution

### Stick with PostgreSQL When:
- **Simple Queries:** Standard CRUD operations
- **ACID Requirements:** Strong consistency needed
- **Team Expertise:** Team comfortable with PostgreSQL
- **Budget Constraints:** Limited infrastructure budget
- **Rapid Development:** Need to move fast

## 10. Migration Strategy

### Phase 1: Setup Master-Slave
1. Configure PostgreSQL replication
2. Update application to use separate connections
3. Monitor replication lag
4. Optimize read queries

### Phase 2: Read Model Optimization
1. Create denormalized views
2. Add read-specific indexes
3. Implement caching layer
4. Monitor performance improvements

### Phase 3: Consider Advanced Options
1. Evaluate if different DBs needed
2. Implement if business requirements demand
3. Gradual migration if needed