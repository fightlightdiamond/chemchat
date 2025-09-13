import { Client } from '@elastic/elasticsearch';

export interface ElasticsearchConfig {
  node: string;
  auth?: {
    username: string;
    password: string;
  };
  tls?: {
    ca?: string;
    rejectUnauthorized?: boolean;
  };
  requestTimeout?: number;
  pingTimeout?: number;
  maxRetries?: number;
}

export interface IndexMapping {
  properties: Record<string, any>;
  settings?: {
    number_of_shards?: number;
    number_of_replicas?: number;
    analysis?: any;
    max_result_window?: number;
    [key: string]: any;
  };
}

export interface SearchDocument {
  id: string;
  tenantId: string;
  conversationId: string;
  messageId: string;
  content: string;
  authorId: string;
  authorName: string;
  createdAt: Date;
  updatedAt?: Date;
  messageType: 'text' | 'media' | 'system';
  sequenceNumber: bigint;
  isEdited: boolean;
  isDeleted: boolean;
  metadata?: Record<string, any>;
}

export interface SearchQuery {
  query: string;
  tenantId: string;
  conversationId?: string;
  authorId?: string;
  messageType?: string;
  fromDate?: Date;
  toDate?: Date;
  limit?: number;
  offset?: number;
  page?: number;
  sortBy?: 'relevance' | 'date' | 'sequence';
  sortOrder?: 'asc' | 'desc';
}

export interface SearchResult {
  documents: SearchDocument[];
  total: number;
  maxScore: number;
  took: number;
  hasMore: boolean;
}

export interface IndexOperationResult {
  success: boolean;
  documentId?: string;
  error?: string;
  took?: number;
}

export interface BulkOperationResult {
  success: boolean;
  indexed: number;
  errors: Array<{
    documentId: string;
    error: string;
  }>;
  took: number;
}

export interface ElasticsearchHealthStatus {
  status: 'green' | 'yellow' | 'red';
  clusterName: string;
  numberOfNodes: number;
  numberOfDataNodes: number;
  activePrimaryShards: number;
  activeShards: number;
  relocatingShards: number;
  initializingShards: number;
  unassignedShards: number;
}

export interface IElasticsearchService {
  getClient(): Client;
  createIndex(indexName: string, mapping: IndexMapping): Promise<boolean>;
  deleteIndex(indexName: string): Promise<boolean>;
  indexExists(indexName: string): Promise<boolean>;
  indexDocument(indexName: string, document: SearchDocument): Promise<IndexOperationResult>;
  updateDocument(indexName: string, documentId: string, document: Partial<SearchDocument>): Promise<IndexOperationResult>;
  deleteDocument(indexName: string, documentId: string): Promise<IndexOperationResult>;
  bulkIndex(indexName: string, documents: SearchDocument[]): Promise<BulkOperationResult>;
  search(indexName: string, query: SearchQuery): Promise<SearchResult>;
  getHealth(): Promise<ElasticsearchHealthStatus>;
  refreshIndex(indexName: string): Promise<boolean>;
}
