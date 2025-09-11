import { QueryHandler } from '@nestjs/cqrs';
import { Injectable, ForbiddenException } from '@nestjs/common';
import { BaseQueryHandler } from '../../shared/cqrs/base-query-handler';
import { SearchMessagesQuery } from '../queries/search-messages.query';
import { PaginatedResult } from '../../shared/cqrs/pagination.dto';
import { Message } from '../../shared/domain/entities/message.entity';
import { MessageRepository } from '../../shared/domain/repositories/message.repository';
import { ConversationRepository } from '../../shared/domain/repositories/conversation.repository';

@Injectable()
@QueryHandler(SearchMessagesQuery)
export class SearchMessagesQueryHandler extends BaseQueryHandler<
  SearchMessagesQuery,
  PaginatedResult<Message>
> {
  constructor(
    private readonly messageRepository: MessageRepository,
    private readonly conversationRepository: ConversationRepository,
  ) {
    super();
  }

  async execute(query: SearchMessagesQuery): Promise<PaginatedResult<Message>> {
    this.logQueryExecution(query);

    try {
      // If searching within a specific conversation, check user access
      if (query.conversationId) {
        const conversation = await this.conversationRepository.findById(
          query.conversationId,
        );
        if (conversation && !conversation.isMember(query.userId!)) {
          throw new ForbiddenException(
            'User is not a member of this conversation',
          );
        }
      }

      // Build pagination options
      const paginationOptions = {
        limit: query.pagination?.limit || 20,
        cursor: query.pagination?.cursor,
        sortOrder: (query.pagination?.order || 'desc') as 'asc' | 'desc',
      };

      // Search messages
      const result = await this.messageRepository.searchByContent(
        query.searchTerm,
        query.conversationId,
        paginationOptions,
      );

      // Filter results to only include conversations the user has access to
      const filteredItems: Message[] = [];
      const conversationCache = new Map<string, boolean>();

      for (const message of result.data) {
        let hasAccess = conversationCache.get(message.conversationId);

        if (hasAccess === undefined) {
          const conversation = await this.conversationRepository.findById(
            message.conversationId,
          );
          hasAccess = conversation
            ? conversation.isMember(query.userId!)
            : false;
          conversationCache.set(message.conversationId, hasAccess);
        }

        if (hasAccess) {
          filteredItems.push(message);
        }
      }

      const filteredResult: PaginatedResult<Message> = {
        data: filteredItems,
        total: filteredItems.length,
        page: result.page,
        limit: result.limit,
        totalPages: Math.ceil(filteredItems.length / result.limit),
        hasNext: result.hasNext,
        hasPrevious: result.hasPrevious,
      };

      this.logQuerySuccess(query, filteredResult);
      return filteredResult;
    } catch (error) {
      this.logQueryError(query, error as Error);
      throw error;
    }
  }
}
