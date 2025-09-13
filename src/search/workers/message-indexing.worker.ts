import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { KafkaService } from '../../shared/kafka';
import { ElasticsearchService } from '../services/elasticsearch.service';
import { MessageIndexService } from '../services/message-index.service';
import { SearchDocument } from '../interfaces/elasticsearch.interface';
import { PrismaService } from '../../shared/infrastructure/prisma/prisma.service';
import { Consumer } from 'kafkajs';

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
export class MessageIndexingWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MessageIndexingWorker.name);
  private consumer: Consumer | null = null;
  private isRunning = false;
  private readonly consumerGroupId: string;
  private readonly batchSize: number;
  private readonly batchTimeout: number;

  constructor(
    private readonly kafkaService: KafkaService,
    private readonly elasticsearchService: ElasticsearchService,
    private readonly messageIndexService: MessageIndexService,
    private readonly prismaService: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.consumerGroupId = this.configService.get<string>('KAFKA_SEARCH_CONSUMER_GROUP', 'search-indexing');
    this.batchSize = this.configService.get<number>('SEARCH_INDEXING_BATCH_SIZE', 100);
    this.batchTimeout = this.configService.get<number>('SEARCH_INDEXING_BATCH_TIMEOUT', 5000);
  }

  async onModuleInit(): Promise<void> {
    await this.startWorker();
  }

  async onModuleDestroy(): Promise<void> {
    await this.stopWorker();
  }

  private async startWorker(): Promise<void> {
    try {
      this.consumer = this.kafkaService.createConsumer(this.consumerGroupId);
      
      await this.consumer.subscribe({
        topics: ['message.created', 'message.edited', 'message.deleted'],
        fromBeginning: false,
      });

      this.isRunning = true;
      
      await this.consumer.run({
        eachBatch: async ({ batch, resolveOffset, heartbeat }) => {
          const messages = batch.messages;
          if (messages.length === 0) return;

          this.logger.debug(`Processing batch of ${messages.length} messages from topic ${batch.topic}`);

          for (const message of messages) {
            try {
              if (message.value) {
                await this.processMessage(batch.topic, message.value.toString());
              }
              resolveOffset(message.offset);
              await heartbeat();
            } catch (error) {
              this.logger.error(`Failed to process message from topic ${batch.topic}`, error);
              // Continue processing other messages in the batch
            }
          }
        },
      });

      this.logger.log('Message indexing worker started');
    } catch (error) {
      this.logger.error('Failed to start message indexing worker', error);
      throw error;
    }
  }

  private async stopWorker(): Promise<void> {
    if (this.consumer && this.isRunning) {
      this.isRunning = false;
      await this.consumer.disconnect();
      this.logger.log('Message indexing worker stopped');
    }
  }

  private async processMessage(topic: string, messageValue: string | undefined): Promise<void> {
    if (!messageValue) {
      this.logger.warn('Received empty message value');
      return;
    }

    try {
      const event = JSON.parse(messageValue);
      
      switch (topic) {
        case 'message.created':
          await this.handleMessageCreated(event as MessageCreatedEvent);
          break;
        case 'message.edited':
          await this.handleMessageEdited(event as MessageEditedEvent);
          break;
        case 'message.deleted':
          await this.handleMessageDeleted(event as MessageDeletedEvent);
          break;
        default:
          this.logger.warn(`Unknown topic: ${topic}`);
      }
    } catch (error) {
      this.logger.error(`Failed to process message from topic ${topic}`, error);
      throw error;
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
    consumerGroupId: string;
    batchSize: number;
    batchTimeout: number;
  }> {
    return {
      isRunning: this.isRunning,
      consumerGroupId: this.consumerGroupId,
      batchSize: this.batchSize,
      batchTimeout: this.batchTimeout,
    };
  }
}
