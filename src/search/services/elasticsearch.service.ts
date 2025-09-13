import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from '@elastic/elasticsearch';
import {
  ElasticsearchConfig,
  IndexMapping,
  SearchDocument,
  SearchQuery,
  SearchResult,
  IndexOperationResult,
  BulkOperationResult,
  ElasticsearchHealthStatus,
  IElasticsearchService,
} from '../interfaces/elasticsearch.interface';

@Injectable()
export class ElasticsearchService implements IElasticsearchService, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ElasticsearchService.name);
  private client: Client;
  private readonly config: ElasticsearchConfig;

  constructor(private readonly configService: ConfigService) {
    this.config = {
      node: this.configService.get<string>('ELASTICSEARCH_NODE', 'http://localhost:9200'),
      auth: this.configService.get<string>('ELASTICSEARCH_USERNAME')
        ? {
            username: this.configService.get<string>('ELASTICSEARCH_USERNAME')!,
            password: this.configService.get<string>('ELASTICSEARCH_PASSWORD', ''),
          }
        : undefined,
      requestTimeout: this.configService.get<number>('ELASTICSEARCH_REQUEST_TIMEOUT', 30000),
      pingTimeout: this.configService.get<number>('ELASTICSEARCH_PING_TIMEOUT', 3000),
      maxRetries: this.configService.get<number>('ELASTICSEARCH_MAX_RETRIES', 3),
    };
  }

  async onModuleInit(): Promise<void> {
    try {
      this.client = new Client(this.config);
      
      // Test connection
      const health = await this.client.cluster.health();
      this.logger.log(`Connected to Elasticsearch cluster: ${health.cluster_name} (${health.status})`);
    } catch (error) {
      this.logger.error('Failed to connect to Elasticsearch', error);
      throw error;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.logger.log('Elasticsearch connection closed');
    }
  }

  getClient(): Client {
    return this.client;
  }

  async createIndex(indexName: string, mapping: IndexMapping): Promise<boolean> {
    try {
      const exists = await this.indexExists(indexName);
      if (exists) {
        this.logger.warn(`Index ${indexName} already exists`);
        return true;
      }

      await this.client.indices.create({
        index: indexName,
        mappings: {
          properties: mapping.properties,
        },
        settings: mapping.settings || {
          number_of_shards: 1,
          number_of_replicas: 1,
        },
      });

      this.logger.log(`Created index: ${indexName}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to create index ${indexName}`, error);
      return false;
    }
  }

  async deleteIndex(indexName: string): Promise<boolean> {
    try {
      const exists = await this.indexExists(indexName);
      if (!exists) {
        this.logger.warn(`Index ${indexName} does not exist`);
        return true;
      }

      await this.client.indices.delete({
        index: indexName,
      });

      this.logger.log(`Deleted index: ${indexName}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to delete index ${indexName}`, error);
      return false;
    }
  }

  async indexExists(indexName: string): Promise<boolean> {
    try {
      const response = await this.client.indices.exists({
        index: indexName,
      });
      return response;
    } catch (error) {
      this.logger.error(`Failed to check if index ${indexName} exists`, error);
      return false;
    }
  }

  async indexDocument(indexName: string, document: SearchDocument): Promise<IndexOperationResult> {
    try {
      const response = await this.client.index({
        index: indexName,
        id: document.id,
        document: {
          ...document,
          sequenceNumber: document.sequenceNumber.toString(), // Convert bigint to string for ES
        },
      });

      return {
        success: true,
        documentId: response._id,
        took: (response as any).took || 0,
      };
    } catch (error) {
      this.logger.error(`Failed to index document ${document.id}`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async updateDocument(
    indexName: string,
    documentId: string,
    document: Partial<SearchDocument>,
  ): Promise<IndexOperationResult> {
    try {
      const updateDoc = { ...document };
      if (updateDoc.sequenceNumber) {
        updateDoc.sequenceNumber = updateDoc.sequenceNumber.toString() as any;
      }

      const response = await this.client.update({
        index: indexName,
        id: documentId,
        doc: updateDoc,
      });

      return {
        success: true,
        documentId: response._id,
        took: (response as any).took || 0,
      };
    } catch (error) {
      this.logger.error(`Failed to update document ${documentId}`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async deleteDocument(indexName: string, documentId: string): Promise<IndexOperationResult> {
    try {
      const response = await this.client.delete({
        index: indexName,
        id: documentId,
      });

      return {
        success: true,
        documentId: response._id,
        took: (response as any).took || 0,
      };
    } catch (error) {
      this.logger.error(`Failed to delete document ${documentId}`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async bulkIndex(indexName: string, documents: SearchDocument[]): Promise<BulkOperationResult> {
    try {
      const body = documents.flatMap((doc) => [
        { index: { _index: indexName, _id: doc.id } },
        {
          ...doc,
          sequenceNumber: doc.sequenceNumber.toString(), // Convert bigint to string for ES
        },
      ]);

      const response = await this.client.bulk({ body });

      const errors: Array<{ documentId: string; error: string }> = [];
      let indexed = 0;

      if (response.items) {
        response.items.forEach((item: any) => {
          if (item.index?.error) {
            errors.push({
              documentId: item.index._id,
              error: item.index.error.reason || 'Unknown error',
            });
          } else {
            indexed++;
          }
        });
      }

      return {
        success: errors.length === 0,
        indexed,
        errors,
        took: response.took || 0,
      };
    } catch (error) {
      this.logger.error('Failed to bulk index documents', error);
      return {
        success: false,
        indexed: 0,
        errors: [
          {
            documentId: 'bulk_operation',
            error: error instanceof Error ? error.message : 'Unknown error',
          },
        ],
        took: 0,
      };
    }
  }

  async search(indexName: string, query: SearchQuery): Promise<SearchResult> {
    try {
      const searchBody: any = {
        query: {
          bool: {
            must: [],
            filter: [],
          },
        },
        sort: [],
        from: query.offset || 0,
        size: query.limit || 20,
      };

      // Add tenant isolation
      searchBody.query.bool.filter.push({
        term: { tenantId: query.tenantId },
      });

      // Add text search
      if (query.query && query.query.trim()) {
        searchBody.query.bool.must.push({
          multi_match: {
            query: query.query,
            fields: ['content^2', 'authorName'],
            type: 'best_fields',
            fuzziness: 'AUTO',
          },
        });
      } else {
        searchBody.query.bool.must.push({
          match_all: {},
        });
      }

      // Add filters
      if (query.conversationId) {
        searchBody.query.bool.filter.push({
          term: { conversationId: query.conversationId },
        });
      }

      if (query.authorId) {
        searchBody.query.bool.filter.push({
          term: { authorId: query.authorId },
        });
      }

      if (query.messageType) {
        searchBody.query.bool.filter.push({
          term: { messageType: query.messageType },
        });
      }

      // Add date range filter
      if (query.fromDate || query.toDate) {
        const dateRange: any = {};
        if (query.fromDate) {
          dateRange.gte = query.fromDate.toISOString();
        }
        if (query.toDate) {
          dateRange.lte = query.toDate.toISOString();
        }
        searchBody.query.bool.filter.push({
          range: { createdAt: dateRange },
        });
      }

      // Add sorting
      const sortBy = query.sortBy || 'relevance';
      const sortOrder = query.sortOrder || 'desc';

      if (sortBy === 'relevance') {
        searchBody.sort.push({ _score: { order: sortOrder } });
      } else if (sortBy === 'date') {
        searchBody.sort.push({ createdAt: { order: sortOrder } });
      } else if (sortBy === 'sequence') {
        searchBody.sort.push({ sequenceNumber: { order: sortOrder } });
      }

      // Add secondary sort by sequence number for consistent ordering
      if (sortBy !== 'sequence') {
        searchBody.sort.push({ sequenceNumber: { order: 'desc' } });
      }

      const response = await this.client.search({
        index: indexName,
        body: searchBody,
      });

      const documents: SearchDocument[] = response.hits.hits.map((hit: any) => ({
        ...hit._source,
        sequenceNumber: BigInt(hit._source.sequenceNumber), // Convert back to bigint
      }));

      return {
        documents,
        total: typeof response.hits.total === 'number' ? response.hits.total : response.hits.total?.value || 0,
        maxScore: response.hits.max_score || 0,
        took: response.took || 0,
        hasMore: (query.offset || 0) + documents.length < (typeof response.hits.total === 'number' ? response.hits.total : response.hits.total?.value || 0),
      };
    } catch (error) {
      this.logger.error('Failed to search documents', error);
      return {
        documents: [],
        total: 0,
        maxScore: 0,
        took: 0,
        hasMore: false,
      };
    }
  }

  async getHealth(): Promise<ElasticsearchHealthStatus> {
    try {
      const response = await this.client.cluster.health();
      return {
        status: response.status as 'green' | 'yellow' | 'red',
        clusterName: response.cluster_name,
        numberOfNodes: response.number_of_nodes,
        numberOfDataNodes: response.number_of_data_nodes,
        activePrimaryShards: response.active_primary_shards,
        activeShards: response.active_shards,
        relocatingShards: response.relocating_shards,
        initializingShards: response.initializing_shards,
        unassignedShards: response.unassigned_shards,
      };
    } catch (error) {
      this.logger.error('Failed to get Elasticsearch health', error);
      throw error;
    }
  }

  async refreshIndex(indexName: string): Promise<boolean> {
    try {
      await this.client.indices.refresh({
        index: indexName,
      });
      return true;
    } catch (error) {
      this.logger.error(`Failed to refresh index ${indexName}`, error);
      return false;
    }
  }
}
