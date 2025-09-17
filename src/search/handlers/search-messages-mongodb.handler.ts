import { Injectable, Logger } from '@nestjs/common';
import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { SearchMessagesQuery } from '../queries/search-messages.query';
import { MessageMongoDBRepository } from '../../shared/domain/repositories/message-mongodb.repository';
import { MessageQuery, MessageSearchResult } from '../../shared/domain/entities/message-mongodb.entity';

@Injectable()
@QueryHandler(SearchMessagesQuery)
export class SearchMessagesMongoDBHandler implements IQueryHandler<SearchMessagesQuery> {
  private readonly logger = new Logger(SearchMessagesMongoDBHandler.name);

  constructor(
    private readonly messageRepository: MessageMongoDBRepository,
  ) {}

  async execute(query: SearchMessagesQuery): Promise<MessageSearchResult> {
    try {
      this.logger.debug(`Searching messages with query: ${query.query}`);

      // Build MongoDB query
      const mongoQuery: MessageQuery = {
        searchText: query.query,
        conversationId: query.conversationId,
        senderId: query.authorId,
        tenantId: query.tenantId,
        messageType: query.messageType,
        fromDate: query.fromDate,
        toDate: query.toDate,
        limit: query.limit || 20,
        offset: query.offset || 0,
        sortBy: query.sortBy === 'relevance' ? 'relevance' : 'createdAt',
        sortOrder: query.sortOrder || 'desc',
      };

      // Search messages in MongoDB
      const result = await this.messageRepository.search(mongoQuery);

      this.logger.debug(`Found ${result.messages.length} messages in ${result.searchTime}ms`);

      return result;
    } catch (error) {
      this.logger.error('Failed to search messages', error);
      throw error;
    }
  }
}