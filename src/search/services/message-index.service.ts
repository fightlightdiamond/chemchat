import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ElasticsearchService } from './elasticsearch.service';
import { IndexMapping } from '../interfaces/elasticsearch.interface';

@Injectable()
export class MessageIndexService implements OnModuleInit {
  private readonly logger = new Logger(MessageIndexService.name);
  private readonly indexPrefix: string;
  private readonly defaultShards: number;
  private readonly defaultReplicas: number;

  constructor(
    private readonly elasticsearchService: ElasticsearchService,
    private readonly configService: ConfigService,
  ) {
    this.indexPrefix = this.configService.get<string>('ELASTICSEARCH_INDEX_PREFIX', 'chemchat');
    this.defaultShards = this.configService.get<number>('ELASTICSEARCH_DEFAULT_SHARDS', 1);
    this.defaultReplicas = this.configService.get<number>('ELASTICSEARCH_DEFAULT_REPLICAS', 1);
  }

  async onModuleInit(): Promise<void> {
    await this.createMessageIndex();
  }

  getMessageIndexName(tenantId?: string): string {
    if (tenantId) {
      return `${this.indexPrefix}_messages_${tenantId}`;
    }
    return `${this.indexPrefix}_messages`;
  }

  private getMessageIndexMapping(): IndexMapping {
    return {
      properties: {
        id: {
          type: 'keyword',
        },
        tenantId: {
          type: 'keyword',
        },
        conversationId: {
          type: 'keyword',
        },
        messageId: {
          type: 'keyword',
        },
        content: {
          type: 'text',
          analyzer: 'standard',
          fields: {
            keyword: {
              type: 'keyword',
              ignore_above: 256,
            },
            search: {
              type: 'text',
              analyzer: 'search_analyzer',
            },
          },
        },
        authorId: {
          type: 'keyword',
        },
        authorName: {
          type: 'text',
          analyzer: 'standard',
          fields: {
            keyword: {
              type: 'keyword',
              ignore_above: 256,
            },
          },
        },
        createdAt: {
          type: 'date',
          format: 'strict_date_optional_time||epoch_millis',
        },
        updatedAt: {
          type: 'date',
          format: 'strict_date_optional_time||epoch_millis',
        },
        messageType: {
          type: 'keyword',
        },
        sequenceNumber: {
          type: 'long',
        },
        isEdited: {
          type: 'boolean',
        },
        isDeleted: {
          type: 'boolean',
        },
        metadata: {
          type: 'object',
          dynamic: true,
        },
      },
      settings: {
        number_of_shards: this.defaultShards,
        number_of_replicas: this.defaultReplicas,
        analysis: {
          analyzer: {
            search_analyzer: {
              type: 'custom',
              tokenizer: 'standard',
              filter: ['lowercase', 'stop', 'snowball'],
            },
            multilang_analyzer: {
              type: 'custom',
              tokenizer: 'standard',
              filter: [
                'lowercase',
                'stop',
                'snowball',
                'asciifolding',
              ],
            },
          },
          normalizer: {
            keyword_normalizer: {
              type: 'custom',
              filter: ['lowercase', 'asciifolding'],
            },
          },
        },
        max_result_window: 50000, // Allow deep pagination up to 50k results
      },
    };
  }

  async createMessageIndex(tenantId?: string): Promise<boolean> {
    const indexName = this.getMessageIndexName(tenantId);
    const mapping = this.getMessageIndexMapping();

    try {
      const success = await this.elasticsearchService.createIndex(indexName, mapping);
      if (success) {
        this.logger.log(`Message index created: ${indexName}`);
      }
      return success;
    } catch (error) {
      this.logger.error(`Failed to create message index ${indexName}`, error);
      return false;
    }
  }

  async deleteMessageIndex(tenantId?: string): Promise<boolean> {
    const indexName = this.getMessageIndexName(tenantId);
    
    try {
      const success = await this.elasticsearchService.deleteIndex(indexName);
      if (success) {
        this.logger.log(`Message index deleted: ${indexName}`);
      }
      return success;
    } catch (error) {
      this.logger.error(`Failed to delete message index ${indexName}`, error);
      return false;
    }
  }

  async reindexMessages(tenantId?: string): Promise<boolean> {
    const indexName = this.getMessageIndexName(tenantId);
    
    try {
      // Delete existing index
      await this.deleteMessageIndex(tenantId);
      
      // Recreate index with updated mapping
      const success = await this.createMessageIndex(tenantId);
      
      if (success) {
        this.logger.log(`Message index reindexed: ${indexName}`);
        // Note: Actual data reindexing would be handled by the message indexing worker
        // by processing all messages from the database
      }
      
      return success;
    } catch (error) {
      this.logger.error(`Failed to reindex messages for ${indexName}`, error);
      return false;
    }
  }

  async getIndexHealth(tenantId?: string): Promise<any> {
    const indexName = this.getMessageIndexName(tenantId);
    
    try {
      const client = this.elasticsearchService.getClient();
      const response = await client.indices.stats({
        index: indexName,
      });
      
      return {
        indexName,
        health: response.indices?.[indexName] || null,
      };
    } catch (error) {
      this.logger.error(`Failed to get index health for ${indexName}`, error);
      return {
        indexName,
        health: null,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
