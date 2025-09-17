import { Injectable, Logger } from '@nestjs/common';
import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { GetConversationHistoryQuery } from '../queries/get-conversation-history.query';
import { MessageMongoDBRepository } from '../../shared/domain/repositories/message-mongodb.repository';
import { PaginatedResult } from '../../shared/domain/repositories/base.repository';
import { MessageMongoDB } from '../../shared/domain/entities/message-mongodb.entity';

@Injectable()
@QueryHandler(GetConversationHistoryQuery)
export class GetConversationHistoryMongoDBHandler implements IQueryHandler<GetConversationHistoryQuery> {
  private readonly logger = new Logger(GetConversationHistoryMongoDBHandler.name);

  constructor(
    private readonly messageRepository: MessageMongoDBRepository,
  ) {}

  async execute(query: GetConversationHistoryQuery): Promise<PaginatedResult<MessageMongoDB>> {
    try {
      this.logger.debug(`Getting conversation history for: ${query.conversationId}`);

      // Convert string sequence to number for MongoDB
      const beforeSequence = query.beforeSequence ? parseInt(query.beforeSequence, 10) : undefined;
      const afterSequence = query.afterSequence ? parseInt(query.afterSequence, 10) : undefined;

      // Get messages from MongoDB
      const result = await this.messageRepository.findByConversation(
        query.conversationId,
        {
          limit: query.pagination?.limit || 50,
          beforeSequence,
          afterSequence,
          includeDeleted: false,
          tenantId: query.tenantId,
        }
      );

      this.logger.debug(`Found ${result.data.length} messages for conversation: ${query.conversationId}`);

      return result;
    } catch (error) {
      this.logger.error(`Failed to get conversation history: ${query.conversationId}`, error);
      throw error;
    }
  }
}