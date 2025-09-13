import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Logger } from '@nestjs/common';
import { GetSearchSuggestionsQuery } from '../queries/get-search-suggestions.query';
import { SearchService, SearchSuggestion } from '../services/search.service';
import { BaseQueryHandler } from '../../shared/cqrs/base-query-handler';

@QueryHandler(GetSearchSuggestionsQuery)
export class GetSearchSuggestionsHandler 
  extends BaseQueryHandler<GetSearchSuggestionsQuery, SearchSuggestion[]>
  implements IQueryHandler<GetSearchSuggestionsQuery, SearchSuggestion[]> {
  
  protected readonly logger = new Logger(GetSearchSuggestionsHandler.name);

  constructor(private readonly searchService: SearchService) {
    super();
  }

  async execute(query: GetSearchSuggestionsQuery): Promise<SearchSuggestion[]> {
    this.logger.debug(`Getting search suggestions for: ${query.query}`);

    try {
      const suggestions = await this.searchService.getSuggestions(
        query.tenantId!,
        query.query,
        query.limit,
      );

      this.logger.debug(`Found ${suggestions.length} suggestions`);
      
      return suggestions;
    } catch (error) {
      this.logger.error('Failed to get search suggestions', error);
      throw error;
    }
  }
}
