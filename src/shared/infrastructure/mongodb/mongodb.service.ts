import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MongoClient, Db, Collection, ClientSession } from 'mongodb';

export interface MongoDBConfig {
  uri: string;
  database: string;
  maxPoolSize: number;
  minPoolSize: number;
  maxIdleTimeMS: number;
  serverSelectionTimeoutMS: number;
}

@Injectable()
export class MongoDBService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MongoDBService.name);
  private client: MongoClient;
  private db: Db;
  private readonly config: MongoDBConfig;

  constructor(private readonly configService: ConfigService) {
    this.config = {
      uri: this.configService.get<string>('MONGODB_URI', 'mongodb://localhost:27017'),
      database: this.configService.get<string>('MONGODB_DATABASE', 'chat_read'),
      maxPoolSize: this.configService.get<number>('MONGODB_MAX_POOL_SIZE', 50),
      minPoolSize: this.configService.get<number>('MONGODB_MIN_POOL_SIZE', 5),
      maxIdleTimeMS: this.configService.get<number>('MONGODB_MAX_IDLE_TIME_MS', 30000),
      serverSelectionTimeoutMS: this.configService.get<number>('MONGODB_SERVER_SELECTION_TIMEOUT_MS', 5000),
    };
  }

  async onModuleInit(): Promise<void> {
    try {
      this.client = new MongoClient(this.config.uri, {
        maxPoolSize: this.config.maxPoolSize,
        minPoolSize: this.config.minPoolSize,
        maxIdleTimeMS: this.config.maxIdleTimeMS,
        serverSelectionTimeoutMS: this.config.serverSelectionTimeoutMS,
      });

      await this.client.connect();
      this.db = this.client.db(this.config.database);
      
      // Test connection
      await this.db.admin().ping();
      
      this.logger.log(`Connected to MongoDB: ${this.config.database}`);
      
      // Create indexes
      await this.createIndexes();
      
    } catch (error) {
      this.logger.error('Failed to connect to MongoDB', error);
      throw error;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.logger.log('Disconnected from MongoDB');
    }
  }

  getCollection<T>(name: string): Collection<T> {
    return this.db.collection<T>(name);
  }

  getDatabase(): Db {
    return this.db;
  }

  getClient(): MongoClient {
    return this.client;
  }

  /**
   * Start a new session for transactions
   */
  startSession(): ClientSession {
    return this.client.startSession();
  }

  /**
   * Execute operation with transaction
   */
  async withTransaction<T>(
    operation: (session: ClientSession) => Promise<T>,
  ): Promise<T> {
    const session = this.startSession();
    
    try {
      return await session.withTransaction(operation);
    } finally {
      await session.endSession();
    }
  }

  /**
   * Get database statistics
   */
  async getDatabaseStats(): Promise<any> {
    try {
      const stats = await this.db.stats();
      return {
        collections: stats.collections,
        dataSize: stats.dataSize,
        indexSize: stats.indexSize,
        storageSize: stats.storageSize,
        objects: stats.objects,
        avgObjSize: stats.avgObjSize,
      };
    } catch (error) {
      this.logger.error('Failed to get database stats', error);
      throw error;
    }
  }

  /**
   * Get collection statistics
   */
  async getCollectionStats(collectionName: string): Promise<any> {
    try {
      const collection = this.getCollection(collectionName);
      const stats = await collection.stats();
      return {
        count: stats.count,
        size: stats.size,
        avgObjSize: stats.avgObjSize,
        storageSize: stats.storageSize,
        totalIndexSize: stats.totalIndexSize,
        indexSizes: stats.indexSizes,
      };
    } catch (error) {
      this.logger.error(`Failed to get collection stats for ${collectionName}`, error);
      throw error;
    }
  }

  /**
   * Check if collection exists
   */
  async collectionExists(collectionName: string): Promise<boolean> {
    try {
      const collections = await this.db.listCollections({ name: collectionName }).toArray();
      return collections.length > 0;
    } catch (error) {
      this.logger.error(`Failed to check if collection ${collectionName} exists`, error);
      return false;
    }
  }

  /**
   * Create all necessary indexes
   */
  private async createIndexes(): Promise<void> {
    try {
      await Promise.all([
        this.createMessageIndexes(),
        this.createConversationIndexes(),
        this.createUserConversationIndexes(),
        this.createSequenceIndexes(),
      ]);
      
      this.logger.log('All indexes created successfully');
    } catch (error) {
      this.logger.error('Failed to create indexes', error);
      throw error;
    }
  }

  /**
   * Create indexes for messages collection
   */
  private async createMessageIndexes(): Promise<void> {
    const collection = this.getCollection('messages');
    
    const indexes = [
      // Compound indexes for common queries
      { key: { conversationId: 1, sequenceNumber: -1 }, name: 'conversation_sequence' },
      { key: { conversationId: 1, createdAt: -1 }, name: 'conversation_created' },
      { key: { senderId: 1, createdAt: -1 }, name: 'sender_created' },
      { key: { tenantId: 1, createdAt: -1 }, name: 'tenant_created' },
      
      // Text search index
      { 
        key: { 
          searchText: 'text',
          conversationId: 1,
          tenantId: 1
        }, 
        name: 'text_search',
        options: {
          weights: {
            searchText: 10,
            conversationId: 1,
            tenantId: 1
          }
        }
      },
      
      // Partial indexes for performance
      { 
        key: { conversationId: 1, sequenceNumber: -1 }, 
        name: 'conversation_sequence_active',
        partialFilterExpression: { deletedAt: null }
      },
      
      // TTL index for old messages (1 year)
      { 
        key: { createdAt: 1 }, 
        name: 'created_at_ttl',
        expireAfterSeconds: 31536000
      },
      
      // Unique index for messageId
      { key: { messageId: 1 }, name: 'message_id_unique', unique: true },
    ];

    for (const index of indexes) {
      try {
        await collection.createIndex(index.key, {
          name: index.name,
          unique: index.unique || false,
          partialFilterExpression: index.partialFilterExpression,
          expireAfterSeconds: index.expireAfterSeconds,
          weights: index.options?.weights,
        });
        this.logger.debug(`Created index: ${index.name}`);
      } catch (error) {
        // Index might already exist, log warning but continue
        this.logger.warn(`Index ${index.name} might already exist: ${error.message}`);
      }
    }
  }

  /**
   * Create indexes for conversations collection
   */
  private async createConversationIndexes(): Promise<void> {
    const collection = this.getCollection('conversations');
    
    const indexes = [
      { key: { tenantId: 1, updatedAt: -1 }, name: 'tenant_updated' },
      { key: { createdBy: 1 }, name: 'created_by' },
      { key: { type: 1, tenantId: 1 }, name: 'type_tenant' },
      { key: { 'members.userId': 1, tenantId: 1 }, name: 'members_user_tenant' },
      { key: { title: 'text', description: 'text' }, name: 'title_description_text' },
      { key: { conversationId: 1 }, name: 'conversation_id_unique', unique: true },
    ];

    for (const index of indexes) {
      try {
        await collection.createIndex(index.key, {
          name: index.name,
          unique: index.unique || false,
        });
        this.logger.debug(`Created index: ${index.name}`);
      } catch (error) {
        this.logger.warn(`Index ${index.name} might already exist: ${error.message}`);
      }
    }
  }

  /**
   * Create indexes for user_conversations collection
   */
  private async createUserConversationIndexes(): Promise<void> {
    const collection = this.getCollection('user_conversations');
    
    const indexes = [
      { key: { userId: 1, tenantId: 1, lastActivityAt: -1 }, name: 'user_tenant_activity' },
      { key: { userId: 1, unreadCount: -1 }, name: 'user_unread' },
      { key: { conversationId: 1, userId: 1 }, name: 'conversation_user_unique', unique: true },
      { key: { userId: 1, isActive: 1, lastActivityAt: -1 }, name: 'user_active_activity' },
    ];

    for (const index of indexes) {
      try {
        await collection.createIndex(index.key, {
          name: index.name,
          unique: index.unique || false,
        });
        this.logger.debug(`Created index: ${index.name}`);
      } catch (error) {
        this.logger.warn(`Index ${index.name} might already exist: ${error.message}`);
      }
    }
  }

  /**
   * Create indexes for sequences collection
   */
  private async createSequenceIndexes(): Promise<void> {
    const collection = this.getCollection('sequences');
    
    const indexes = [
      { key: { _id: 1 }, name: 'conversation_id_unique', unique: true },
    ];

    for (const index of indexes) {
      try {
        await collection.createIndex(index.key, {
          name: index.name,
          unique: index.unique || false,
        });
        this.logger.debug(`Created index: ${index.name}`);
      } catch (error) {
        this.logger.warn(`Index ${index.name} might already exist: ${error.message}`);
      }
    }
  }

  /**
   * Health check for MongoDB connection
   */
  async healthCheck(): Promise<{ status: string; details: any }> {
    try {
      const startTime = Date.now();
      await this.db.admin().ping();
      const responseTime = Date.now() - startTime;
      
      const stats = await this.getDatabaseStats();
      
      return {
        status: 'healthy',
        details: {
          responseTime,
          database: this.config.database,
          collections: stats.collections,
          dataSize: stats.dataSize,
          indexSize: stats.indexSize,
        },
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        details: {
          error: error.message,
          database: this.config.database,
        },
      };
    }
  }
}