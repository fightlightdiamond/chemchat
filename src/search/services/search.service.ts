import { Injectable, Logger } from '@nestjs/common';
import { ElasticsearchService } from './elasticsearch.service';
import { MessageIndexService } from './message-index.service';
import { SearchQuery, SearchResult, SearchDocument } from '../interfaces/elasticsearch.interface';

export interface SearchMessageQuery {
  query: string;
  tenantId: string;
  conversationId?: string;
  authorId?: string;
  messageType?: 'text' | 'media' | 'system';
  fromDate?: Date;
  toDate?: Date;
  page?: number;
  limit?: number;
  offset?: number;
  sortBy?: 'relevance' | 'date' | 'sequence';
  sortOrder?: 'asc' | 'desc';
  includeHighlights?: boolean;
}

export interface SearchMessageResult {
  messages: SearchDocument[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
  highlights?: Record<string, string[]>;
  took: number;
}

export interface SearchSuggestion {
  text: string;
  type: 'content' | 'author';
  count: number;
}

export interface SearchAnalytics {
  totalSearches: number;
  topQueries: Array<{ query: string; count: number }>;
  searchTrends: Array<{ date: string; count: number }>;
}

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    private readonly elasticsearchService: ElasticsearchService,
    private readonly messageIndexService: MessageIndexService,
  ) {}

  async searchMessages(query: SearchMessageQuery): Promise<SearchMessageResult> {
    try {
      this.logger.debug(`Searching messages with query: ${query.query}`);

      // Validate and normalize the query
      const normalizedQuery = this.normalizeSearchQuery(query);
      
      // Check if index exists
      const indexName = this.messageIndexService.getMessageIndexName(query.tenantId);
      const indexExists = await this.elasticsearchService.indexExists(indexName);
      
      if (!indexExists) {
        this.logger.warn(`Search index does not exist for tenant: ${query.tenantId}`);
        return this.createEmptySearchResult(query);
      }

      // Perform the search
      const searchResult = await this.elasticsearchService.search(indexName, normalizedQuery);
      
      // Transform and return the result
      return this.transformSearchResult(searchResult, query);
    } catch (error) {
      this.logger.error('Failed to search messages', error);
      return this.createEmptySearchResult(query);
    }
  }

  async searchWithHighlights(query: SearchMessageQuery): Promise<SearchMessageResult> {
    try {
      // Validate and normalize the query
      const normalizedQuery = this.normalizeSearchQuery(query);
      
      // Check if index exists
      const indexName = this.messageIndexService.getMessageIndexName(query.tenantId);
      const indexExists = await this.elasticsearchService.indexExists(indexName);
      
      if (!indexExists) {
        return this.createEmptySearchResult(query);
      }

      // Build search body with highlights
      const searchBody: any = {
        query: {
          bool: {
            must: [],
            filter: [
              { term: { tenantId: query.tenantId } },
              { term: { isDeleted: false } },
            ],
          },
        },
        highlight: {
          fields: {
            content: {
              fragment_size: 150,
              number_of_fragments: 3,
              pre_tags: ['<mark>'],
              post_tags: ['</mark>'],
            },
            authorName: {
              fragment_size: 50,
              number_of_fragments: 1,
              pre_tags: ['<mark>'],
              post_tags: ['</mark>'],
            },
          },
        },
        from: normalizedQuery.offset || 0,
        size: normalizedQuery.limit || 20,
      };

      // Add text search
      if (normalizedQuery.query && normalizedQuery.query.trim()) {
        searchBody.query.bool.must.push({
          multi_match: {
            query: normalizedQuery.query,
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
      this.addFiltersToQuery(searchBody, query);

      // Add sorting
      this.addSortingToQuery(searchBody, query);

      const client = this.elasticsearchService.getClient();
      const response = await client.search({
        index: indexName,
        body: searchBody,
      });

      return this.transformSearchResultWithHighlights(response, query);
    } catch (error) {
      this.logger.error('Failed to search messages with highlights', error);
      return this.createEmptySearchResult(query);
    }
  }

  async getSuggestions(query: string, tenantId: string, limit: number = 5): Promise<SearchSuggestion[]> {
    try {
      this.logger.debug(`Getting search suggestions for: ${query}`);

      const indexName = this.messageIndexService.getMessageIndexName(tenantId);
      const indexExists = await this.elasticsearchService.indexExists(indexName);
      
      if (!indexExists) {
        return [];
      }

      const client = this.elasticsearchService.getClient();
      
      const response = await client.search({
        index: indexName,
        query: {
          bool: {
            filter: [
              { term: { tenantId } },
              { term: { isDeleted: false } },
            ],
            should: [
              {
                match_phrase_prefix: {
                  content: {
                    query: query.toLowerCase(),
                    max_expansions: 10,
                  },
                },
              },
              {
                match_phrase_prefix: {
                  authorName: {
                    query: query.toLowerCase(),
                    max_expansions: 5,
                  },
                },
              },
            ],
            minimum_should_match: 1,
          },
        },
        aggs: {
          content_suggestions: {
            terms: {
              field: 'content.keyword',
              size: limit,
              include: `.*${query.toLowerCase()}.*`,
            },
          },
          author_suggestions: {
            terms: {
              field: 'authorName.keyword',
              size: limit,
              include: `.*${query.toLowerCase()}.*`,
            },
          },
        },
        size: 0,
      });

      const suggestions: SearchSuggestion[] = [];

      // Process content suggestions
      if (response.aggregations?.content_suggestions && 'buckets' in response.aggregations.content_suggestions) {
        (response.aggregations.content_suggestions as any).buckets.forEach((bucket: any) => {
          suggestions.push({
            text: bucket.key,
            type: 'content',
            count: bucket.doc_count,
          });
        });
      }

      // Process author suggestions
      if (response.aggregations?.author_suggestions && 'buckets' in response.aggregations.author_suggestions) {
        (response.aggregations.author_suggestions as any).buckets.forEach((bucket: any) => {
          suggestions.push({
            text: bucket.key,
            type: 'author',
            count: bucket.doc_count,
          });
        });
      }

      return suggestions.slice(0, limit);
    } catch (error) {
      this.logger.error('Failed to get search suggestions', error);
      return [];
    }
  }

  async getSearchAnalytics(): Promise<SearchAnalytics> {
    // TODO: Implement search analytics tracking
    // This would typically involve storing search queries and their metadata
    // in a separate analytics index or database
    return {
      totalSearches: 0,
      topQueries: [],
      searchTrends: [],
    };
  }

  private normalizeSearchQuery(query: SearchMessageQuery): SearchQuery {
    const normalized: SearchQuery = {
      query: query.query || '',
      tenantId: query.tenantId,
      conversationId: query.conversationId,
      authorId: query.authorId,
      messageType: query.messageType,
      fromDate: query.fromDate,
      toDate: query.toDate,
      limit: Math.min(query.limit || 20, 100),
      offset: Math.max(query.offset || 0, 0),
      page: query.page,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    };
    
    return normalized;
  }

  private addFiltersToQuery(searchBody: any, query: SearchQuery): void {
    // Add conversation filter
    if (query.conversationId) {
      searchBody.query.bool.filter.push({
        term: { conversationId: query.conversationId },
      });
    }

    // Add author filter
    if (query.authorId) {
      searchBody.query.bool.filter.push({
        term: { authorId: query.authorId },
      });
    }

    // Add message type filter
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
  }

  private addSortingToQuery(searchBody: any, query: SearchQuery): void {
    const sortBy = query.sortBy || 'relevance';
    const sortOrder = query.sortOrder || 'desc';

    if (!searchBody.sort) {
      searchBody.sort = [];
    }

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
  }

  private transformSearchResult(searchResult: SearchResult, query: SearchQuery): SearchMessageResult {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const totalPages = Math.ceil(searchResult.total / limit);
    const hasNext = page < totalPages;
    const hasPrevious = page > 1;

    return {
      messages: searchResult.documents,
      total: searchResult.total,
      page,
      limit,
      totalPages,
      hasNext,
      hasPrevious,
      took: searchResult.took,
    };
  }

  private transformSearchResultWithHighlights(response: any, query: SearchQuery): SearchMessageResult {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const total = typeof response.hits.total === 'number' ? response.hits.total : response.hits.total?.value || 0;
    const totalPages = Math.ceil(total / limit);
    const hasNext = page < totalPages;
    const hasPrevious = page > 1;

    const messages: SearchDocument[] = response.hits.hits.map((hit: any) => ({
      ...hit._source,
      sequenceNumber: BigInt(hit._source.sequenceNumber),
      createdAt: new Date(hit._source.createdAt),
      updatedAt: hit._source.updatedAt ? new Date(hit._source.updatedAt) : undefined,
    }));

    const highlights: Record<string, string[]> = {};
    response.hits.hits.forEach((hit: any) => {
      if (hit.highlight) {
        highlights[hit._id] = hit.highlight;
      }
    });

    return {
      messages,
      total,
      page,
      limit,
      totalPages,
      hasNext,
      hasPrevious,
      highlights,
      took: response.took || 0,
    };
  }

  private createEmptySearchResult(query: SearchMessageQuery): SearchMessageResult {
    const page = query.page || 1;
    const limit = query.limit || 20;

    return {
      messages: [],
      total: 0,
      page,
      limit,
      totalPages: 0,
      hasNext: false,
      hasPrevious: false,
      took: 0,
    };
  }
}
