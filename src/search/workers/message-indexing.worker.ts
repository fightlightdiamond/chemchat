import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { KafkaConsumerService, EventHandler } from '../../shared/kafka/services/kafka-consumer.service';
import { ElasticsearchService } from '../services/elasticsearch.service';
import { MessageIndexService } from '../services/message-index.service';
import { SearchDocument } from '../interfaces/elasticsearch.interface';
import { PrismaService } from '../../shared/infrastructure/prisma/prisma.service';
import { SerializedEvent } from '../../shared/kafka/interfaces/kafka.interface';

interface MessageCreatedEvent {
  messageId: string;
  conversationId: string;
  authorId: string;
  content: string;
  messageType: 'text' | 'media' | 'system';
  sequenceNumber: string;
  tenantId: string;
  createdAt: string;
  metadata?: Record<string, any>;
}

interface MessageEditedEvent {
  messageId: string;
  conversationId: string;
  content: string;
  tenantId: string;
  updatedAt: string;
  sequenceNumber: string;
}

interface MessageDeletedEvent {
  messageId: string;
  conversationId: string;
  tenantId: string;
  deletedAt: string;
}

@Injectable()
export class MessageIndexingWorker implements OnModuleInit, OnModuleDestroy, EventHandler {
  private readonly logger = new Logger(MessageIndexingWorker.name);
  private isRunning = false;
  private readonly batchSize: number;
  private readonly batchTimeout: number;
  
  readonly eventType = 'message.created';

  constructor(
    private readonly kafkaConsumerService: KafkaConsumerService,
    private readonly elasticsearchService: ElasticsearchService,
    private readonly messageIndexService: MessageIndexService,
    private readonly prismaService: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.batchSize = this.configService.get<number>('SEARCH_INDEXING_BATCH_SIZE', 100);
    this.batchTimeout = this.configService.get<number>('SEARCH_INDEXING_BATCH_TIMEOUT', 5000);
  }

  async onModuleInit() {
    try {
      this.logger.log('Initializing Message Indexing Worker');
      
      // Register this worker as an event handler
      this.kafkaConsumerService.registerEventHandler(this);
      
      this.isRunning = true;
      this.logger.log('Message Indexing Worker started successfully');
    } catch (error) {
      this.logger.error('Failed to start Message Indexing Worker', error);
      throw error;
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      this.logger.log('Shutting down Message Indexing Worker');
      this.isRunning = false;
      
      // Unregister the event handler
      this.kafkaConsumerService.unregisterEventHandler(this.eventType, this);
      
      this.logger.log('Message Indexing Worker shut down successfully');
    } catch (error) {
      this.logger.error('Error during Message Indexing Worker shutdown', error);
    }
  }

  /**
   * Handle incoming events from Kafka
   */
  async handle(event: SerializedEvent): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    try {
      await this.processEvent(event);
    } catch (error) {
      this.logger.error('Error processing event', {
        eventType: event.metadata.eventType,
        eventId: event.metadata.eventId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async processEvent(event: SerializedEvent): Promise<void> {
    const { metadata, data } = event;
    
    switch (metadata.eventType) {
      case 'message.created':
        await this.handleMessageCreated(data as MessageCreatedEvent);
        break;
      case 'message.edited':
        await this.handleMessageEdited(data as MessageEditedEvent);
        break;
      case 'message.deleted':
        await this.handleMessageDeleted(data as MessageDeletedEvent);
        break;
      default:
        this.logger.debug(`Ignoring event type: ${metadata.eventType}`);
    }
  }


  private async handleMessageCreated(event: MessageCreatedEvent): Promise<void> {
    try {
      // Get additional message details from database
      const message = await this.prismaService.message.findUnique({
        where: { id: event.messageId },
        include: {
          sender: {
            select: {
              id: true,
              username: true,
              displayName: true,
            },
          },
        },
      });

      if (!message) {
        this.logger.warn(`Message not found in database: ${event.messageId}`);
        return;
      }

      const searchDocument: SearchDocument = {
        id: `${event.tenantId}_${event.messageId}`,
        tenantId: event.tenantId,
        conversationId: event.conversationId,
        messageId: event.messageId,
        content: event.content,
        authorId: event.authorId,
        authorName: message.sender?.displayName || message.sender?.username || 'Unknown User',
        createdAt: new Date(event.createdAt),
        messageType: event.messageType,
        sequenceNumber: BigInt(event.sequenceNumber),
        isEdited: false,
        isDeleted: false,
        metadata: event.metadata,
      };

      const indexName = this.messageIndexService.getMessageIndexName(event.tenantId);
      const result = await this.elasticsearchService.indexDocument(indexName, searchDocument);

      if (result.success) {
        this.logger.debug(`Indexed message: ${event.messageId}`);
      } else {
        this.logger.error(`Failed to index message: ${event.messageId}`, result.error);
      }
    } catch (error) {
      this.logger.error(`Failed to handle message created event: ${event.messageId}`, error);
      throw error;
    }
  }

  private async handleMessageEdited(event: MessageEditedEvent): Promise<void> {
    try {
      // Get updated message details from database
      const message = await this.prismaService.message.findUnique({
        where: { id: event.messageId },
        include: {
          sender: {
            select: {
              id: true,
              username: true,
              displayName: true,
            },
          },
        },
      });

      if (!message) {
        this.logger.warn(`Message not found in database: ${event.messageId}`);
        return;
      }

      const documentId = `${event.tenantId}_${event.messageId}`;
      const updateDoc: Partial<SearchDocument> = {
        content: event.content,
        updatedAt: new Date(event.updatedAt),
        isEdited: true,
        sequenceNumber: BigInt(event.sequenceNumber),
      };

      const indexName = this.messageIndexService.getMessageIndexName(event.tenantId);
      const result = await this.elasticsearchService.updateDocument(indexName, documentId, updateDoc);

      if (result.success) {
        this.logger.debug(`Updated indexed message: ${event.messageId}`);
      } else {
        this.logger.error(`Failed to update indexed message: ${event.messageId}`, result.error);
      }
    } catch (error) {
      this.logger.error(`Failed to handle message edited event: ${event.messageId}`, error);
      throw error;
    }
  }

  private async handleMessageDeleted(event: MessageDeletedEvent): Promise<void> {
    try {
      const documentId = `${event.tenantId}_${event.messageId}`;
      const indexName = this.messageIndexService.getMessageIndexName(event.tenantId);
      
      // Mark as deleted instead of removing from index for audit purposes
      const updateDoc: Partial<SearchDocument> = {
        isDeleted: true,
        updatedAt: new Date(event.deletedAt),
      };

      const result = await this.elasticsearchService.updateDocument(indexName, documentId, updateDoc);

      if (result.success) {
        this.logger.debug(`Marked message as deleted in index: ${event.messageId}`);
      } else {
        this.logger.error(`Failed to mark message as deleted in index: ${event.messageId}`, result.error);
      }
    } catch (error) {
      this.logger.error(`Failed to handle message deleted event: ${event.messageId}`, error);
      throw error;
    }
  }

  async reindexAllMessages(tenantId?: string): Promise<void> {
    this.logger.log(`Starting reindexing of all messages${tenantId ? ` for tenant ${tenantId}` : ''}`);
    
    try {
      // Create or recreate the index
      await this.messageIndexService.createMessageIndex(tenantId);
      
      const batchSize = 1000;
      let skip = 0;
      let processedCount = 0;

      while (true) {
        const whereClause = tenantId ? { tenantId } : {};
        
        const messages = await this.prismaService.message.findMany({
          where: {
            ...whereClause,
            deletedAt: null, // Only index non-deleted messages
          },
          include: {
            sender: {
              select: {
                id: true,
                username: true,
                displayName: true,
              },
            },
          },
          orderBy: {
            sequenceNumber: 'asc',
          },
          skip,
          take: batchSize,
        });

        if (messages.length === 0) {
          break;
        }

        const searchDocuments: SearchDocument[] = messages.map((message) => ({
          id: `${tenantId || 'default'}_${message.id}`,
          tenantId: tenantId || 'default',
          conversationId: message.conversationId,
          messageId: message.id,
          content: typeof message.content === 'string' ? message.content : JSON.stringify(message.content),
          authorId: message.senderId || 'system',
          authorName: message.sender?.displayName || message.sender?.username || 'Unknown User',
          createdAt: message.createdAt,
          updatedAt: message.editedAt || undefined,
          messageType: message.messageType.toLowerCase() as 'text' | 'media' | 'system',
          sequenceNumber: message.sequenceNumber,
          isEdited: message.editedAt !== null,
          isDeleted: false,
          metadata: (message.content && typeof message.content === 'object' && message.content !== null) ? message.content as Record<string, any> : undefined,
        }));

        const indexName = this.messageIndexService.getMessageIndexName(tenantId);
        const result = await this.elasticsearchService.bulkIndex(indexName, searchDocuments);

        if (result.success) {
          processedCount += result.indexed;
          this.logger.log(`Reindexed batch: ${result.indexed} messages (total: ${processedCount})`);
        } else {
          this.logger.error(`Failed to reindex batch: ${result.errors.length} errors`);
          result.errors.forEach((error) => {
            this.logger.error(`Reindex error for document ${error.documentId}: ${error.error}`);
          });
        }

        skip += batchSize;
      }

      // Refresh the index to make documents searchable
      const indexName = this.messageIndexService.getMessageIndexName(tenantId);
      await this.elasticsearchService.refreshIndex(indexName);

      this.logger.log(`Completed reindexing: ${processedCount} messages processed`);
    } catch (error) {
      this.logger.error('Failed to reindex all messages', error);
      throw error;
    }
  }

  async getWorkerStatus(): Promise<{
    isRunning: boolean;
    eventType: string;
    batchSize: number;
    batchTimeout: number;
  }> {
    return {
      isRunning: this.isRunning,
      eventType: this.eventType,
      batchSize: this.batchSize,
      batchTimeout: this.batchTimeout,
    };
  }
}
