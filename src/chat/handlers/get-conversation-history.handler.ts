import { QueryHandler } from '@nestjs/cqrs';
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Inject,
} from '@nestjs/common';
import { BaseQueryHandler } from '../../shared/cqrs/base-query-handler';
import { GetConversationHistoryQuery } from '../queries/get-conversation-history.query';
import { PaginatedResult } from '../../shared/cqrs/pagination.dto';
import { Message } from '../../shared/domain/entities/message.entity';
import {
  MessageRepository,
  MessagePaginationOptions,
} from '../../shared/domain/repositories/message.repository';
import { ConversationRepository } from '../../shared/domain/repositories/conversation.repository';

@Injectable()
@QueryHandler(GetConversationHistoryQuery)
export class GetConversationHistoryQueryHandler extends BaseQueryHandler<
  GetConversationHistoryQuery,
  PaginatedResult<Message>
> {
  constructor(
    @Inject('MessageRepository')
    private readonly messageRepository: MessageRepository,
    @Inject('ConversationRepository')
    private readonly conversationRepository: ConversationRepository,
  ) {
    super();
  }

  async execute(
    query: GetConversationHistoryQuery,
  ): Promise<PaginatedResult<Message>> {
    this.logQueryExecution(query);

    try {
      // Check if conversation exists and user has access
      const conversation = await this.conversationRepository.findById(
        query.conversationId,
      );
      if (!conversation) {
        throw new NotFoundException(
          `Conversation with ID ${query.conversationId} not found`,
        );
      }

      // Check if user is a member of the conversation
      if (!conversation.isMember(query.userId!)) {
        throw new ForbiddenException(
          'User is not a member of this conversation',
        );
      }

      // Build pagination options
      const paginationOptions: MessagePaginationOptions = {
        limit: query.pagination?.limit || 20,
        cursor: query.pagination?.cursor,
        sortOrder: query.pagination?.order || 'desc',
        beforeSequence: query.beforeSequence
          ? BigInt(query.beforeSequence)
          : undefined,
        afterSequence: query.afterSequence
          ? BigInt(query.afterSequence)
          : undefined,
        includeDeleted: false, // Don't include deleted messages by default
      };

      // Get messages with pagination
      const result = await this.messageRepository.findByConversationId(
        query.conversationId,
        paginationOptions,
      );

      this.logQuerySuccess(query, result);
      return result;
    } catch (error) {
      this.logQueryError(query, error as Error);
      throw error;
    }
  }
}
