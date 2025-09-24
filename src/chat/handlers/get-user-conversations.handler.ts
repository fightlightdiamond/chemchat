import { QueryHandler } from '@nestjs/cqrs';
import { Injectable, Inject } from '@nestjs/common';
import { BaseQueryHandler } from '../../shared/cqrs/base-query-handler';
import { GetUserConversationsQuery } from '../queries/get-user-conversations.query';
import { PaginatedResult } from '../../shared/cqrs/pagination.dto';
import { Conversation } from '../../shared/domain/entities/conversation.entity';
import { ConversationRepository } from '../../shared/domain/repositories/conversation.repository';

@Injectable()
@QueryHandler(GetUserConversationsQuery)
export class GetUserConversationsQueryHandler extends BaseQueryHandler<
  GetUserConversationsQuery,
  PaginatedResult<Conversation>
> {
  constructor(
    @Inject('ConversationRepository')
    private readonly conversationRepository: ConversationRepository,
  ) {
    super();
  }

  async execute(
    query: GetUserConversationsQuery,
  ): Promise<PaginatedResult<Conversation>> {
    this.logQueryExecution(query);

    try {
      // Build pagination options
      const paginationOptions = {
        limit: query.pagination?.limit || 20,
        cursor: query.pagination?.cursor,
        sortOrder: (query.pagination?.order || 'desc') as 'asc' | 'desc',
      };

      // Get user's conversations
      const result = await this.conversationRepository.findByUserId(
        query.userId,
        paginationOptions,
        query.includeArchived || false,
      );

      this.logQuerySuccess(query, result);
      return result;
    } catch (error) {
      this.logQueryError(query, error as Error);
      throw error;
    }
  }
}
