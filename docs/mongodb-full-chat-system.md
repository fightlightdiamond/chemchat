# MongoDB for Full Chat System Architecture

## 1. Recommended Architecture: Hybrid Approach

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Core Data     │    │   Chat Data     │    │   Search DB     │
│   (PostgreSQL)  │    │   (MongoDB)     │    │ (Elasticsearch) │
│                 │    │                 │    │                 │
│ • Users         │    │ • Messages      │    │ • Search        │
│ • Auth          │    │ • Conversations│    │ • Analytics     │
│ • Permissions   │    │ • Real-time     │    │ • Full-text     │
│ • Audit         │    │ • Notifications │    │ • Reports       │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌─────────────────┐
                    │   Event Bus     │
                    │   (Kafka)       │
                    │                 │
                    │ • Data Sync     │
                    │ • Consistency   │
                    │ • Notifications │
                    └─────────────────┘
```

## 2. Data Distribution Strategy

### PostgreSQL (Core Data)
```sql
-- Users table
CREATE TABLE users (
  id UUID PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  display_name VARCHAR(100),
  avatar_url VARCHAR(500),
  tenant_id UUID,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- User sessions
CREATE TABLE user_sessions (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  device_id VARCHAR(100),
  ip_address INET,
  user_agent TEXT,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Permissions and roles
CREATE TABLE user_permissions (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  permission VARCHAR(100) NOT NULL,
  resource_id UUID,
  tenant_id UUID,
  granted_at TIMESTAMP DEFAULT NOW()
);

-- Audit logs
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(50),
  resource_id UUID,
  old_values JSONB,
  new_values JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### MongoDB (Chat Data)
```javascript
// Messages collection
{
  _id: ObjectId,
  messageId: "msg_123",
  conversationId: "conv_456",
  senderId: "user_789",
  senderName: "John Doe",
  senderAvatar: "https://...",
  content: {
    text: "Hello world!",
    attachments: [...],
    metadata: {...}
  },
  messageType: "text",
  sequenceNumber: NumberLong(12345),
  createdAt: ISODate("2024-01-15T10:30:00Z"),
  editedAt: null,
  deletedAt: null,
  tenantId: "tenant_001",
  
  // Denormalized for performance
  conversationTitle: "Project Discussion",
  conversationType: "group",
  isEdited: false,
  isDeleted: false,
  
  // Indexing fields
  searchText: "hello world project discussion",
  tags: ["project", "discussion"]
}

// Conversations collection
{
  _id: ObjectId,
  conversationId: "conv_456",
  title: "Project Discussion",
  type: "group",
  description: "Discussion about the new project",
  tenantId: "tenant_001",
  createdBy: "user_789",
  createdAt: ISODate("2024-01-15T09:00:00Z"),
  updatedAt: ISODate("2024-01-15T10:30:00Z"),
  
  // Members with denormalized data
  members: [
    {
      userId: "user_789",
      username: "john.doe",
      displayName: "John Doe",
      avatar: "https://...",
      role: "admin",
      joinedAt: ISODate("2024-01-15T09:00:00Z"),
      lastReadAt: ISODate("2024-01-15T10:25:00Z"),
      isActive: true
    }
  ],
  
  // Aggregated data
  memberCount: 2,
  lastMessage: {
    messageId: "msg_123",
    content: "Hello world!",
    senderId: "user_789",
    senderName: "John Doe",
    createdAt: ISODate("2024-01-15T10:30:00Z"),
    sequenceNumber: NumberLong(12345)
  },
  
  // Statistics
  totalMessages: 15,
  unreadCount: 3,
  
  // Settings
  settings: {
    allowFileUpload: true,
    allowMentions: true,
    muteNotifications: false,
    archiveAfterDays: 30
  }
}

// User conversations (denormalized for performance)
{
  _id: ObjectId,
  userId: "user_789",
  conversationId: "conv_456",
  tenantId: "tenant_001",
  
  // Conversation details (denormalized)
  conversationTitle: "Project Discussion",
  conversationType: "group",
  
  // User's relationship to conversation
  role: "admin",
  joinedAt: ISODate("2024-01-15T09:00:00Z"),
  lastReadAt: ISODate("2024-01-15T10:25:00Z"),
  lastReadSequence: NumberLong(12340),
  
  // Unread tracking
  unreadCount: 3,
  unreadMessages: [
    {
      messageId: "msg_123",
      sequenceNumber: NumberLong(12345),
      createdAt: ISODate("2024-01-15T10:30:00Z")
    }
  ],
  
  // User preferences
  preferences: {
    muteNotifications: false,
    hideFromList: false,
    pinToTop: true,
    customTitle: "My Project Chat"
  },
  
  // Activity tracking
  isActive: true,
  lastActivityAt: ISODate("2024-01-15T10:25:00Z")
}
```

## 3. MongoDB Transaction Strategy

### Message Creation with Transaction
```typescript
// src/chat/services/message.service.ts
import { Injectable } from '@nestjs/common';
import { MongoClient, ClientSession } from 'mongodb';
import { MongoDBService } from '../../shared/infrastructure/mongodb/mongodb.service';

@Injectable()
export class MessageService {
  constructor(private readonly mongoDB: MongoDBService) {}

  async createMessage(messageData: CreateMessageDto): Promise<Message> {
    const session = this.mongoDB.client.startSession();
    
    try {
      await session.withTransaction(async () => {
        // 1. Create message
        const message = await this.createMessageDocument(messageData, session);
        
        // 2. Update conversation last message
        await this.updateConversationLastMessage(
          messageData.conversationId, 
          message, 
          session
        );
        
        // 3. Update user conversation unread count
        await this.updateUserConversationUnreadCount(
          messageData.conversationId,
          messageData.senderId,
          session
        );
        
        // 4. Update conversation statistics
        await this.updateConversationStats(
          messageData.conversationId,
          session
        );
        
        return message;
      });
    } finally {
      await session.endSession();
    }
  }

  private async createMessageDocument(
    messageData: CreateMessageDto,
    session: ClientSession,
  ): Promise<Message> {
    const collection = this.mongoDB.getCollection('messages');
    
    const message = {
      messageId: messageData.messageId,
      conversationId: messageData.conversationId,
      senderId: messageData.senderId,
      senderName: messageData.senderName,
      senderAvatar: messageData.senderAvatar,
      content: messageData.content,
      messageType: messageData.messageType,
      sequenceNumber: messageData.sequenceNumber,
      createdAt: new Date(),
      editedAt: null,
      deletedAt: null,
      tenantId: messageData.tenantId,
      conversationTitle: messageData.conversationTitle,
      conversationType: messageData.conversationType,
      isEdited: false,
      isDeleted: false,
      searchText: this.generateSearchText(messageData.content),
      tags: this.extractTags(messageData.content),
    };

    await collection.insertOne(message, { session });
    return message;
  }

  private async updateConversationLastMessage(
    conversationId: string,
    message: Message,
    session: ClientSession,
  ): Promise<void> {
    const collection = this.mongoDB.getCollection('conversations');
    
    await collection.updateOne(
      { conversationId },
      {
        $set: {
          updatedAt: message.createdAt,
          lastMessage: {
            messageId: message.messageId,
            content: message.content.text,
            senderId: message.senderId,
            senderName: message.senderName,
            createdAt: message.createdAt,
            sequenceNumber: message.sequenceNumber,
          },
        },
      },
      { session }
    );
  }

  private async updateUserConversationUnreadCount(
    conversationId: string,
    senderId: string,
    session: ClientSession,
  ): Promise<void> {
    const collection = this.mongoDB.getCollection('user_conversations');
    
    // Increment unread count for all members except sender
    await collection.updateMany(
      {
        conversationId,
        userId: { $ne: senderId },
        isActive: true,
      },
      {
        $inc: { unreadCount: 1 },
        $push: {
          unreadMessages: {
            messageId: message.messageId,
            sequenceNumber: message.sequenceNumber,
            createdAt: message.createdAt,
          },
        },
      },
      { session }
    );
  }

  private async updateConversationStats(
    conversationId: string,
    session: ClientSession,
  ): Promise<void> {
    const collection = this.mongoDB.getCollection('conversations');
    
    await collection.updateOne(
      { conversationId },
      {
        $inc: {
          totalMessages: 1,
          unreadCount: 1,
        },
      },
      { session }
    );
  }
}
```

## 4. Sequence Number Management

### Distributed Sequence Generator
```typescript
// src/shared/services/sequence.service.ts
import { Injectable } from '@nestjs/common';
import { MongoDBService } from '../infrastructure/mongodb/mongodb.service';

@Injectable()
export class SequenceService {
  constructor(private readonly mongoDB: MongoDBService) {}

  async getNextSequence(conversationId: string): Promise<bigint> {
    const collection = this.mongoDB.getCollection('sequences');
    
    const result = await collection.findOneAndUpdate(
      { _id: conversationId },
      { $inc: { sequence: 1 } },
      { 
        upsert: true, 
        returnDocument: 'after' 
      }
    );
    
    return BigInt(result.sequence);
  }

  async getCurrentSequence(conversationId: string): Promise<bigint> {
    const collection = this.mongoDB.getCollection('sequences');
    
    const doc = await collection.findOne({ _id: conversationId });
    return doc ? BigInt(doc.sequence) : 0n;
  }
}
```

## 5. Data Consistency Strategies

### Eventual Consistency Handling
```typescript
// src/shared/services/consistency.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { MongoDBService } from '../infrastructure/mongodb/mongodb.service';

@Injectable()
export class ConsistencyService {
  private readonly logger = new Logger(ConsistencyService.name);

  constructor(private readonly mongoDB: MongoDBService) {}

  async ensureMessageOrdering(conversationId: string): Promise<void> {
    const collection = this.mongoDB.getCollection('messages');
    
    // Check for out-of-order messages
    const messages = await collection
      .find({ conversationId })
      .sort({ sequenceNumber: 1 })
      .toArray();

    let expectedSequence = 1n;
    const outOfOrderMessages = [];

    for (const message of messages) {
      if (message.sequenceNumber !== expectedSequence) {
        outOfOrderMessages.push({
          messageId: message.messageId,
          expectedSequence,
          actualSequence: message.sequenceNumber,
        });
      }
      expectedSequence++;
    }

    if (outOfOrderMessages.length > 0) {
      this.logger.warn(`Out-of-order messages detected`, {
        conversationId,
        outOfOrderMessages,
      });
      
      // Trigger reordering process
      await this.reorderMessages(conversationId, outOfOrderMessages);
    }
  }

  private async reorderMessages(
    conversationId: string,
    outOfOrderMessages: any[],
  ): Promise<void> {
    // Implement message reordering logic
    // This might involve updating sequence numbers
    // or triggering a full conversation rebuild
  }
}
```

## 6. Performance Optimizations

### Indexing Strategy
```javascript
// Messages collection indexes
db.messages.createIndex({ 
  "conversationId": 1, 
  "sequenceNumber": -1 
})

db.messages.createIndex({ 
  "conversationId": 1, 
  "createdAt": -1 
})

db.messages.createIndex({ 
  "senderId": 1, 
  "createdAt": -1 
})

db.messages.createIndex({ 
  "tenantId": 1, 
  "createdAt": -1 
})

// Text search index
db.messages.createIndex({ 
  "searchText": "text",
  "conversationId": 1,
  "tenantId": 1
})

// Partial indexes for performance
db.messages.createIndex(
  { "conversationId": 1, "sequenceNumber": -1 },
  { partialFilterExpression: { "deletedAt": null } }
)

// TTL index for old messages
db.messages.createIndex(
  { "createdAt": 1 },
  { expireAfterSeconds: 31536000 } // 1 year
)

// Conversations collection indexes
db.conversations.createIndex({ "tenantId": 1, "updatedAt": -1 })
db.conversations.createIndex({ "createdBy": 1 })
db.conversations.createIndex({ "type": 1, "tenantId": 1 })
db.conversations.createIndex({ "members.userId": 1, "tenantId": 1 })

// User conversations indexes
db.user_conversations.createIndex({ 
  "userId": 1, 
  "tenantId": 1, 
  "lastActivityAt": -1 
})

db.user_conversations.createIndex({ 
  "userId": 1, 
  "unreadCount": -1 
})

db.user_conversations.createIndex({ 
  "conversationId": 1, 
  "userId": 1 
}, { unique: true })
```

### Caching Strategy
```typescript
// src/shared/services/cache.service.ts
import { Injectable } from '@nestjs/common';
import { RedisService } from './redis.service';

@Injectable()
export class CacheService {
  constructor(private readonly redis: RedisService) {}

  async cacheConversationMessages(
    conversationId: string,
    messages: Message[],
    ttl: number = 300,
  ): Promise<void> {
    const key = `conversation:${conversationId}:messages`;
    await this.redis.setex(key, ttl, JSON.stringify(messages));
  }

  async getCachedConversationMessages(
    conversationId: string,
  ): Promise<Message[] | null> {
    const key = `conversation:${conversationId}:messages`;
    const cached = await this.redis.get(key);
    return cached ? JSON.parse(cached) : null;
  }

  async cacheUserConversations(
    userId: string,
    conversations: Conversation[],
    ttl: number = 600,
  ): Promise<void> {
    const key = `user:${userId}:conversations`;
    await this.redis.setex(key, ttl, JSON.stringify(conversations));
  }

  async invalidateConversationCache(conversationId: string): Promise<void> {
    const pattern = `conversation:${conversationId}:*`;
    const keys = await this.redis.keys(pattern);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }
}
```

## 7. Monitoring and Observability

### MongoDB Metrics
```typescript
// src/shared/monitoring/mongodb-monitor.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { MongoDBService } from '../infrastructure/mongodb/mongodb.service';

@Injectable()
export class MongoDBMonitorService {
  private readonly logger = new Logger(MongoDBMonitorService.name);

  constructor(private readonly mongoDB: MongoDBService) {}

  async getDatabaseStats(): Promise<any> {
    const stats = await this.mongoDB.db.stats();
    return {
      collections: stats.collections,
      dataSize: stats.dataSize,
      indexSize: stats.indexSize,
      storageSize: stats.storageSize,
      objects: stats.objects,
    };
  }

  async getCollectionStats(collectionName: string): Promise<any> {
    const collection = this.mongoDB.getCollection(collectionName);
    const stats = await collection.stats();
    return {
      count: stats.count,
      size: stats.size,
      avgObjSize: stats.avgObjSize,
      storageSize: stats.storageSize,
      totalIndexSize: stats.totalIndexSize,
      indexSizes: stats.indexSizes,
    };
  }

  async getSlowQueries(): Promise<any[]> {
    // Enable profiling for slow queries
    await this.mongoDB.db.setProfilingLevel(1, { slowms: 100 });
    
    const collection = this.mongoDB.getCollection('system.profile');
    return await collection
      .find({})
      .sort({ ts: -1 })
      .limit(10)
      .toArray();
  }
}
```

## 8. Migration Strategy

### Phase 1: Setup MongoDB
1. Setup MongoDB cluster
2. Create collections and indexes
3. Implement basic CRUD operations
4. Setup monitoring

### Phase 2: Migrate Chat Data
1. Migrate existing messages to MongoDB
2. Migrate conversations to MongoDB
3. Update application to use MongoDB
4. Verify data consistency

### Phase 3: Optimize Performance
1. Implement caching layer
2. Optimize queries and indexes
3. Setup sharding if needed
4. Monitor and tune performance

## 9. Benefits of Full MongoDB Approach

### Development Benefits
- **Unified Data Model:** Single database for chat data
- **Schema Flexibility:** Easy to add new fields
- **Rich Queries:** Aggregation pipeline for complex queries
- **JSON Native:** Perfect for API responses

### Performance Benefits
- **No JOINs:** Denormalized data for faster queries
- **Horizontal Scaling:** Shard by tenant or conversation
- **Flexible Indexing:** Optimize for different query patterns
- **Real-time Features:** Change streams for live updates

### Operational Benefits
- **Simplified Architecture:** One database to manage
- **Consistent Tooling:** MongoDB tools and monitoring
- **Backup Strategy:** Single backup strategy
- **Cost Optimization:** Use appropriate instance types

## 10. Challenges and Mitigations

### Data Consistency
- **Challenge:** Eventual consistency in distributed environment
- **Mitigation:** Use transactions for critical operations, implement consistency checks

### Complex Queries
- **Challenge:** Some queries might be complex in MongoDB
- **Mitigation:** Use aggregation pipeline, consider denormalization

### Learning Curve
- **Challenge:** Team needs to learn MongoDB
- **Mitigation:** Training, documentation, gradual migration

### Monitoring
- **Challenge:** Different monitoring approach
- **Mitigation:** Use MongoDB monitoring tools, implement custom metrics