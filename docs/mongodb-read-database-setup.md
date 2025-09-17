# MongoDB Read Database Setup for CQRS

## 1. Architecture Overview

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Write DB      │    │   Read DB       │    │   Search DB     │
│   (PostgreSQL)  │    │   (MongoDB)     │    │ (Elasticsearch) │
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
                    │ • Data Sync     │
                    │ • Projections   │
                    │ • Consistency   │
                    └─────────────────┘
```

## 2. MongoDB Collections Design

### Messages Collection
```javascript
// messages collection
{
  _id: ObjectId,
  messageId: "msg_123",
  conversationId: "conv_456",
  senderId: "user_789",
  senderName: "John Doe",
  senderAvatar: "https://...",
  content: {
    text: "Hello world!",
    attachments: [
      {
        id: "att_001",
        filename: "image.jpg",
        mimeType: "image/jpeg",
        size: 1024000,
        url: "https://..."
      }
    ],
    metadata: {
      replyToMessageId: "msg_122",
      mentions: ["user_790", "user_791"]
    }
  },
  messageType: "text", // text, media, system
  sequenceNumber: NumberLong(12345),
  createdAt: ISODate("2024-01-15T10:30:00Z"),
  editedAt: null,
  deletedAt: null,
  tenantId: "tenant_001",
  
  // Denormalized fields for performance
  conversationTitle: "Project Discussion",
  conversationType: "group",
  isEdited: false,
  isDeleted: false,
  
  // Indexing fields
  searchText: "hello world project discussion", // For text search
  tags: ["project", "discussion", "urgent"]
}
```

### Conversations Collection
```javascript
// conversations collection
{
  _id: ObjectId,
  conversationId: "conv_456",
  title: "Project Discussion",
  type: "group", // direct, group, channel
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
      role: "admin", // admin, member, moderator
      joinedAt: ISODate("2024-01-15T09:00:00Z"),
      lastReadAt: ISODate("2024-01-15T10:25:00Z"),
      isActive: true
    },
    {
      userId: "user_790",
      username: "jane.smith",
      displayName: "Jane Smith",
      avatar: "https://...",
      role: "member",
      joinedAt: ISODate("2024-01-15T09:05:00Z"),
      lastReadAt: ISODate("2024-01-15T10:20:00Z"),
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
```

### User Conversations Collection (Denormalized)
```javascript
// user_conversations collection
{
  _id: ObjectId,
  userId: "user_789",
  conversationId: "conv_456",
  tenantId: "tenant_001",
  
  // Conversation details (denormalized)
  conversationTitle: "Project Discussion",
  conversationType: "group",
  conversationDescription: "Discussion about the new project",
  
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

## 3. MongoDB Indexes

### Messages Collection Indexes
```javascript
// Compound indexes for common queries
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

db.messages.createIndex(
  { "createdAt": -1 },
  { partialFilterExpression: { "deletedAt": null } }
)

// TTL index for old messages
db.messages.createIndex(
  { "createdAt": 1 },
  { expireAfterSeconds: 31536000 } // 1 year
)
```

### Conversations Collection Indexes
```javascript
db.conversations.createIndex({ "tenantId": 1, "updatedAt": -1 })
db.conversations.createIndex({ "createdBy": 1 })
db.conversations.createIndex({ "type": 1, "tenantId": 1 })

// Compound index for member queries
db.conversations.createIndex({ 
  "members.userId": 1, 
  "tenantId": 1 
})

// Text search for conversation titles
db.conversations.createIndex({ 
  "title": "text",
  "description": "text"
})
```

### User Conversations Collection Indexes
```javascript
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

## 4. MongoDB Service Implementation

### MongoDB Connection Service
```typescript
// src/shared/infrastructure/mongodb/mongodb.service.ts
import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MongoClient, Db, Collection } from 'mongodb';

@Injectable()
export class MongoDBService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MongoDBService.name);
  private client: MongoClient;
  private db: Db;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const connectionString = this.configService.get<string>('MONGODB_URI');
    
    this.client = new MongoClient(connectionString, {
      maxPoolSize: 50,
      minPoolSize: 5,
      maxIdleTimeMS: 30000,
      serverSelectionTimeoutMS: 5000,
    });

    await this.client.connect();
    this.db = this.client.db('chat_read');
    
    this.logger.log('Connected to MongoDB');
    await this.createIndexes();
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.close();
    this.logger.log('Disconnected from MongoDB');
  }

  getCollection<T>(name: string): Collection<T> {
    return this.db.collection<T>(name);
  }

  private async createIndexes(): Promise<void> {
    // Create all indexes
    await Promise.all([
      this.createMessageIndexes(),
      this.createConversationIndexes(),
      this.createUserConversationIndexes(),
    ]);
  }

  private async createMessageIndexes(): Promise<void> {
    const collection = this.getCollection('messages');
    
    await Promise.all([
      collection.createIndex({ conversationId: 1, sequenceNumber: -1 }),
      collection.createIndex({ conversationId: 1, createdAt: -1 }),
      collection.createIndex({ senderId: 1, createdAt: -1 }),
      collection.createIndex({ tenantId: 1, createdAt: -1 }),
      collection.createIndex({ 
        searchText: 'text', 
        conversationId: 1, 
        tenantId: 1 
      }),
      collection.createIndex(
        { conversationId: 1, sequenceNumber: -1 },
        { partialFilterExpression: { deletedAt: null } }
      ),
    ]);
  }

  private async createConversationIndexes(): Promise<void> {
    const collection = this.getCollection('conversations');
    
    await Promise.all([
      collection.createIndex({ tenantId: 1, updatedAt: -1 }),
      collection.createIndex({ createdBy: 1 }),
      collection.createIndex({ type: 1, tenantId: 1 }),
      collection.createIndex({ 'members.userId': 1, tenantId: 1 }),
      collection.createIndex({ title: 'text', description: 'text' }),
    ]);
  }

  private async createUserConversationIndexes(): Promise<void> {
    const collection = this.getCollection('user_conversations');
    
    await Promise.all([
      collection.createIndex({ 
        userId: 1, 
        tenantId: 1, 
        lastActivityAt: -1 
      }),
      collection.createIndex({ userId: 1, unreadCount: -1 }),
      collection.createIndex({ 
        conversationId: 1, 
        userId: 1 
      }, { unique: true }),
    ]);
  }
}
```

### Message Read Repository
```typescript
// src/shared/domain/repositories/message-read.repository.ts
import { Injectable } from '@nestjs/common';
import { MongoDBService } from '../../infrastructure/mongodb/mongodb.service';
import { PaginatedResult } from './base.repository';

export interface MessageReadModel {
  messageId: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  content: {
    text: string;
    attachments?: Array<{
      id: string;
      filename: string;
      mimeType: string;
      size: number;
      url: string;
    }>;
    metadata?: Record<string, any>;
  };
  messageType: string;
  sequenceNumber: bigint;
  createdAt: Date;
  editedAt?: Date;
  deletedAt?: Date;
  tenantId: string;
  conversationTitle: string;
  conversationType: string;
  isEdited: boolean;
  isDeleted: boolean;
}

@Injectable()
export class MessageReadRepository {
  constructor(private readonly mongoDB: MongoDBService) {}

  async findById(messageId: string): Promise<MessageReadModel | null> {
    const collection = this.mongoDB.getCollection<MessageReadModel>('messages');
    const message = await collection.findOne({ messageId });
    return message;
  }

  async findByConversationId(
    conversationId: string,
    limit: number = 50,
    beforeSequence?: bigint,
    tenantId?: string,
  ): Promise<PaginatedResult<MessageReadModel>> {
    const collection = this.mongoDB.getCollection<MessageReadModel>('messages');
    
    const filter: any = {
      conversationId,
      deletedAt: null,
    };
    
    if (tenantId) {
      filter.tenantId = tenantId;
    }
    
    if (beforeSequence) {
      filter.sequenceNumber = { $lt: beforeSequence };
    }

    const [messages, total] = await Promise.all([
      collection
        .find(filter)
        .sort({ sequenceNumber: -1 })
        .limit(limit)
        .toArray(),
      collection.countDocuments(filter),
    ]);

    return {
      data: messages,
      total,
      hasNext: messages.length === limit,
      hasPrevious: beforeSequence ? true : false,
    };
  }

  async findByUserId(
    userId: string,
    limit: number = 50,
    offset: number = 0,
    tenantId?: string,
  ): Promise<PaginatedResult<MessageReadModel>> {
    const collection = this.mongoDB.getCollection<MessageReadModel>('messages');
    
    const filter: any = {
      senderId: userId,
      deletedAt: null,
    };
    
    if (tenantId) {
      filter.tenantId = tenantId;
    }

    const [messages, total] = await Promise.all([
      collection
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(offset)
        .limit(limit)
        .toArray(),
      collection.countDocuments(filter),
    ]);

    return {
      data: messages,
      total,
      hasNext: offset + messages.length < total,
      hasPrevious: offset > 0,
    };
  }

  async searchMessages(
    query: string,
    conversationId?: string,
    tenantId?: string,
    limit: number = 20,
  ): Promise<MessageReadModel[]> {
    const collection = this.mongoDB.getCollection<MessageReadModel>('messages');
    
    const filter: any = {
      $text: { $search: query },
      deletedAt: null,
    };
    
    if (conversationId) {
      filter.conversationId = conversationId;
    }
    
    if (tenantId) {
      filter.tenantId = tenantId;
    }

    return await collection
      .find(filter)
      .sort({ score: { $meta: 'textScore' } })
      .limit(limit)
      .toArray();
  }

  async getRecentMessages(
    conversationId: string,
    limit: number = 10,
    tenantId?: string,
  ): Promise<MessageReadModel[]> {
    const collection = this.mongoDB.getCollection<MessageReadModel>('messages');
    
    const filter: any = {
      conversationId,
      deletedAt: null,
    };
    
    if (tenantId) {
      filter.tenantId = tenantId;
    }

    return await collection
      .find(filter)
      .sort({ sequenceNumber: -1 })
      .limit(limit)
      .toArray();
  }
}
```

### Conversation Read Repository
```typescript
// src/shared/domain/repositories/conversation-read.repository.ts
import { Injectable } from '@nestjs/common';
import { MongoDBService } from '../../infrastructure/mongodb/mongodb.service';

export interface ConversationReadModel {
  conversationId: string;
  title: string;
  type: string;
  description?: string;
  tenantId: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  members: Array<{
    userId: string;
    username: string;
    displayName: string;
    avatar?: string;
    role: string;
    joinedAt: Date;
    lastReadAt?: Date;
    isActive: boolean;
  }>;
  memberCount: number;
  lastMessage?: {
    messageId: string;
    content: string;
    senderId: string;
    senderName: string;
    createdAt: Date;
    sequenceNumber: bigint;
  };
  totalMessages: number;
  unreadCount: number;
  settings: Record<string, any>;
}

@Injectable()
export class ConversationReadRepository {
  constructor(private readonly mongoDB: MongoDBService) {}

  async findById(conversationId: string): Promise<ConversationReadModel | null> {
    const collection = this.mongoDB.getCollection<ConversationReadModel>('conversations');
    return await collection.findOne({ conversationId });
  }

  async findByUserId(
    userId: string,
    tenantId: string,
    limit: number = 50,
    offset: number = 0,
  ): Promise<ConversationReadModel[]> {
    const collection = this.mongoDB.getCollection<ConversationReadModel>('conversations');
    
    return await collection
      .find({
        'members.userId': userId,
        tenantId,
        'members.isActive': true,
      })
      .sort({ updatedAt: -1 })
      .skip(offset)
      .limit(limit)
      .toArray();
  }

  async searchConversations(
    query: string,
    userId: string,
    tenantId: string,
    limit: number = 20,
  ): Promise<ConversationReadModel[]> {
    const collection = this.mongoDB.getCollection<ConversationReadModel>('conversations');
    
    return await collection
      .find({
        $text: { $search: query },
        'members.userId': userId,
        tenantId,
        'members.isActive': true,
      })
      .sort({ score: { $meta: 'textScore' } })
      .limit(limit)
      .toArray();
  }

  async getUnreadConversations(
    userId: string,
    tenantId: string,
  ): Promise<ConversationReadModel[]> {
    const collection = this.mongoDB.getCollection<ConversationReadModel>('conversations');
    
    return await collection
      .find({
        'members.userId': userId,
        tenantId,
        'members.isActive': true,
        unreadCount: { $gt: 0 },
      })
      .sort({ updatedAt: -1 })
      .toArray();
  }
}
```

## 5. Event Handlers for Data Sync

### Message Created Event Handler
```typescript
// src/shared/sync/handlers/message-created-mongodb.handler.ts
import { Injectable, Logger } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { MessageCreatedEvent } from '../../chat/events/message-created.event';
import { MongoDBService } from '../infrastructure/mongodb/mongodb.service';
import { WriteDatabaseService } from '../infrastructure/database/write-database.service';

@Injectable()
@EventsHandler(MessageCreatedEvent)
export class MessageCreatedMongoDBHandler implements IEventHandler<MessageCreatedEvent> {
  private readonly logger = new Logger(MessageCreatedMongoDBHandler.name);

  constructor(
    private readonly mongoDB: MongoDBService,
    private readonly writeDB: WriteDatabaseService,
  ) {}

  async handle(event: MessageCreatedEvent): Promise<void> {
    try {
      // Get additional data from write DB
      const [message, sender, conversation] = await Promise.all([
        this.writeDB.message.findUnique({
          where: { id: event.messageId },
        }),
        this.writeDB.user.findUnique({
          where: { id: event.senderId },
          select: { username: true, displayName: true, avatar: true },
        }),
        this.writeDB.conversation.findUnique({
          where: { id: event.conversationId },
          select: { title: true, type: true },
        }),
      ]);

      if (!message || !sender || !conversation) {
        this.logger.warn(`Missing data for message ${event.messageId}`);
        return;
      }

      // Create MongoDB document
      const messageDoc = {
        messageId: event.messageId,
        conversationId: event.conversationId,
        senderId: event.senderId,
        senderName: sender.displayName || sender.username,
        senderAvatar: sender.avatar,
        content: {
          text: event.content.getText() || '[Media]',
          attachments: event.content.getAttachments() || [],
          metadata: event.content.getMetadata() || {},
        },
        messageType: message.messageType.toLowerCase(),
        sequenceNumber: event.sequenceNumber,
        createdAt: event.createdAt,
        editedAt: null,
        deletedAt: null,
        tenantId: event.tenantId || 'default',
        conversationTitle: conversation.title,
        conversationType: conversation.type,
        isEdited: false,
        isDeleted: false,
        searchText: this.generateSearchText(event.content, conversation.title),
        tags: this.extractTags(event.content),
      };

      // Insert into MongoDB
      const collection = this.mongoDB.getCollection('messages');
      await collection.insertOne(messageDoc);

      // Update conversation summary
      await this.updateConversationSummary(event.conversationId, messageDoc);

      this.logger.debug(`Synced message ${event.messageId} to MongoDB`);
    } catch (error) {
      this.logger.error(`Failed to sync message ${event.messageId} to MongoDB`, error);
      throw error;
    }
  }

  private generateSearchText(content: any, conversationTitle: string): string {
    const text = content.getText() || '';
    const attachments = content.getAttachments() || [];
    const attachmentText = attachments.map((att: any) => att.filename).join(' ');
    
    return `${text} ${attachmentText} ${conversationTitle}`.toLowerCase();
  }

  private extractTags(content: any): string[] {
    // Extract hashtags, mentions, etc.
    const text = content.getText() || '';
    const hashtags = text.match(/#\w+/g) || [];
    const mentions = text.match(/@\w+/g) || [];
    
    return [...hashtags, ...mentions].map(tag => tag.toLowerCase());
  }

  private async updateConversationSummary(
    conversationId: string,
    messageDoc: any,
  ): Promise<void> {
    const collection = this.mongoDB.getCollection('conversations');
    
    await collection.updateOne(
      { conversationId },
      {
        $set: {
          updatedAt: messageDoc.createdAt,
          lastMessage: {
            messageId: messageDoc.messageId,
            content: messageDoc.content.text,
            senderId: messageDoc.senderId,
            senderName: messageDoc.senderName,
            createdAt: messageDoc.createdAt,
            sequenceNumber: messageDoc.sequenceNumber,
          },
        },
        $inc: {
          totalMessages: 1,
          unreadCount: 1,
        },
      },
    );
  }
}
```

## 6. Configuration

### Environment Variables
```env
# Write Database (PostgreSQL)
WRITE_DATABASE_URL="postgresql://postgres:password@localhost:5432/chat_write"

# Read Database (MongoDB)
MONGODB_URI="mongodb://localhost:27017/chat_read"
MONGODB_DATABASE="chat_read"

# Search Database (Elasticsearch)
ELASTICSEARCH_NODE="http://localhost:9200"
```

### Module Configuration
```typescript
// src/shared/infrastructure/infrastructure.module.ts
@Module({
  imports: [
    // Write Database
    {
      provide: 'WRITE_DATABASE',
      useClass: WriteDatabaseService,
    },
    // Read Database
    MongoDBModule,
    // Search Database
    ElasticsearchModule,
  ],
  providers: [
    WriteDatabaseService,
    MongoDBService,
    ElasticsearchService,
  ],
  exports: [
    WriteDatabaseService,
    MongoDBService,
    ElasticsearchService,
  ],
})
export class InfrastructureModule {}
```

## 7. Benefits of This Approach

### Performance Benefits
- **Document Structure:** Natural fit for chat data
- **Aggregation Pipeline:** Powerful analytics queries
- **Flexible Indexing:** Optimize for different query patterns
- **Horizontal Scaling:** Shard by tenant or conversation

### Development Benefits
- **Schema Flexibility:** Easy to add new fields
- **Rich Queries:** Complex aggregations and filtering
- **Real-time Features:** Change streams for live updates
- **JSON Native:** Perfect for API responses

### Operational Benefits
- **Independent Scaling:** Scale read/write separately
- **Backup Strategy:** Different backup strategies
- **Monitoring:** MongoDB-specific monitoring tools
- **Cost Optimization:** Use appropriate instance types

## 8. Challenges and Solutions

### Data Consistency
- **Challenge:** Eventual consistency between PostgreSQL and MongoDB
- **Solution:** Event-driven sync with retry mechanisms

### Schema Evolution
- **Challenge:** Schema changes in MongoDB
- **Solution:** Versioned documents and migration scripts

### Performance Monitoring
- **Challenge:** Monitor both databases
- **Solution:** Unified monitoring dashboard

### Backup and Recovery
- **Challenge:** Different backup strategies
- **Solution:** Coordinated backup procedures