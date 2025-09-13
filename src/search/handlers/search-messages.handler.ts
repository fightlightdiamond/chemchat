import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Logger } from '@nestjs/common';
import { SearchMessagesQuery } from '../queries/search-messages.query';
import { SearchService, SearchMessageResult } from '../services/search.service';
import { BaseQueryHandler } from '../../shared/cqrs/base-query-handler';

@QueryHandler(SearchMessagesQuery)
export class SearchMessagesHandler 
  extends BaseQueryHandler<SearchMessagesQuery, SearchMessageResult>
  implements IQueryHandler<SearchMessagesQuery, SearchMessageResult> {
  
  protected readonly logger = new Logger(SearchMessagesHandler.name);

  constructor(private readonly searchService: SearchService) {
    super();
  }

  async execute(query: SearchMessagesQuery): Promise<SearchMessageResult> {
    this.logger.debug(`Executing search messages query: ${query.query || 'empty'}`);

    try {
      const searchQuery = {
        query: query.query || '',
        tenantId: query.tenantId,
        conversationId: query.conversationId,
        authorId: query.authorId,
        messageType: query.messageType,
        fromDate: query.fromDate ? new Date(query.fromDate) : undefined,
        toDate: query.toDate ? new Date(query.toDate) : undefined,
        page: query.page,
        limit: query.limit,
        sortBy: query.sortBy,
        sortOrder: query.sortOrder,
        includeHighlights: query.includeHighlights,
      };

      let result: SearchMessageResult;
      
      if (query.includeHighlights) {
        result = await this.searchService.searchWithHighlights(searchQuery);
      } else {
        result = await this.searchService.searchMessages(searchQuery);
      }

      this.logger.debug(`Search completed: ${result.messages.length} results in ${result.took}ms`);
      
      return result;
    } catch (error) {
      this.logger.error('Failed to execute search messages query', error);
      throw error;
    }
  }
}
