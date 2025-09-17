# CQRS Improvements - Database Separation

## 1. Database Separation Architecture

### Current State
- Single PostgreSQL database for both read and write operations
- Elasticsearch only for search functionality
- All commands and queries use the same database connection

### Proposed Improvement: Read/Write Database Separation

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Write DB      │    │   Read DB       │    │   Search DB    │
│   (PostgreSQL)  │    │   (PostgreSQL) │    │ (Elasticsearch)│
│                 │    │                 │    │                 │
│ • Commands      │    │ • Queries       │    │ • Search        │
│ • Events        │    │ • Read Models   │    │ • Analytics     │
│ • Aggregates    │    │ • Projections   │    │ • Full-text     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌─────────────────┐
                    │   Event Bus     │
                    │   (Kafka)       │
                    │                 │
                    │ • Event Sync    │
                    │ • Data Sync     │
                    │ • Consistency   │
                    └─────────────────┘
```

## 2. Implementation Strategy

### Phase 1: Database Connection Separation

#### Write Database Service
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
```

#### Read Database Service
```typescript
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

### Phase 2: Repository Pattern Enhancement

#### Write Repository (Commands)
```typescript
// src/shared/domain/repositories/message-write.repository.ts
export interface MessageWriteRepository {
  save(message: Message): Promise<Message>;
  update(message: Message): Promise<Message>;
  delete(messageId: string): Promise<void>;
  findByClientMessageId(clientMessageId: string): Promise<Message | null>;
}
```

#### Read Repository (Queries)
```typescript
// src/shared/domain/repositories/message-read.repository.ts
export interface MessageReadRepository {
  findById(messageId: string): Promise<Message | null>;
  findByConversationId(conversationId: string, pagination: PaginationQuery): Promise<PaginatedResult<Message>>;
  findByUserId(userId: string, pagination: PaginationQuery): Promise<PaginatedResult<Message>>;
  findRecentMessages(conversationId: string, limit: number): Promise<Message[]>;
}
```

### Phase 3: Event-Driven Data Synchronization

#### Event Handler for Data Sync
```typescript
// src/shared/sync/handlers/database-sync.handler.ts
@Injectable()
@EventsHandler(MessageCreatedEvent)
export class DatabaseSyncHandler implements IEventHandler<MessageCreatedEvent> {
  constructor(
    private readonly readDatabase: ReadDatabaseService,
    private readonly writeDatabase: WriteDatabaseService,
  ) {}

  async handle(event: MessageCreatedEvent): Promise<void> {
    // Sync data from write DB to read DB
    await this.syncMessageToReadDatabase(event);
  }

  private async syncMessageToReadDatabase(event: MessageCreatedEvent): Promise<void> {
    // Get message from write DB
    const message = await this.writeDatabase.message.findUnique({
      where: { id: event.messageId },
    });

    if (message) {
      // Insert/Update in read DB
      await this.readDatabase.message.upsert({
        where: { id: message.id },
        create: message,
        update: message,
      });
    }
  }
}
```

## 3. Benefits of Database Separation

### Performance Benefits
- **Write DB**: Optimized for ACID transactions, fewer indexes
- **Read DB**: Optimized for queries, more indexes, read replicas
- **Independent Scaling**: Scale read and write independently

### Consistency Benefits
- **Eventual Consistency**: Acceptable for most use cases
- **Strong Consistency**: Where needed (critical operations)
- **Data Integrity**: Outbox pattern ensures no data loss

### Operational Benefits
- **Backup Strategy**: Different backup strategies for read/write
- **Maintenance**: Maintenance on read DB doesn't affect writes
- **Monitoring**: Separate metrics and monitoring

## 4. Configuration Changes

### Environment Variables
```env
# Write Database (Primary)
WRITE_DATABASE_URL="postgresql://user:pass@write-db:5432/chat_write"

# Read Database (Replica/Optimized)
READ_DATABASE_URL="postgresql://user:pass@read-db:5432/chat_read"

# Search Database
ELASTICSEARCH_NODE="http://elasticsearch:9200"
```

### Module Configuration
```typescript
@Module({
  imports: [
    // Write Database
    {
      provide: 'WRITE_DATABASE',
      useClass: WriteDatabaseService,
    },
    // Read Database
    {
      provide: 'READ_DATABASE', 
      useClass: ReadDatabaseService,
    },
    // Search Database
    ElasticsearchModule,
  ],
})
export class DatabaseModule {}
```

## 5. Migration Strategy

### Step 1: Dual Write Phase
- Write to both databases simultaneously
- Read from write database
- Monitor for consistency issues

### Step 2: Read Migration Phase
- Gradually migrate reads to read database
- Keep write database as fallback
- Monitor performance improvements

### Step 3: Full Separation Phase
- All reads from read database
- All writes to write database
- Event-driven synchronization only

## 6. Monitoring and Observability

### Metrics to Track
- **Write DB**: Transaction latency, connection pool usage
- **Read DB**: Query performance, cache hit rates
- **Sync Lag**: Time between write and read DB updates
- **Event Processing**: Kafka consumer lag, processing time

### Health Checks
```typescript
@Injectable()
export class DatabaseHealthService {
  async checkWriteDatabaseHealth(): Promise<HealthStatus> {
    // Check write DB connectivity and performance
  }

  async checkReadDatabaseHealth(): Promise<HealthStatus> {
    // Check read DB connectivity and sync lag
  }

  async checkDataConsistency(): Promise<ConsistencyReport> {
    // Compare data between write and read DBs
  }
}
```

## 7. Error Handling and Recovery

### Sync Failure Recovery
```typescript
@Injectable()
export class SyncRecoveryService {
  async recoverFailedSync(eventId: string): Promise<void> {
    // Retry failed synchronization
    // Implement exponential backoff
    // Dead letter queue for persistent failures
  }

  async fullDataResync(): Promise<void> {
    // Complete resync of all data
    // Useful for disaster recovery
  }
}
```

## 8. Testing Strategy

### Unit Tests
- Test command handlers with write database
- Test query handlers with read database
- Mock event synchronization

### Integration Tests
- Test end-to-end data flow
- Test sync lag scenarios
- Test failure recovery

### Performance Tests
- Load test write database
- Load test read database
- Test sync performance under load