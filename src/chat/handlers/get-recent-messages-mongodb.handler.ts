import { Injectable, Logger } from '@nestjs/common';
import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { GetRecentMessagesQuery } from '../queries/get-recent-messages.query';
import { MessageMongoDBRepository } from '../../shared/domain/repositories/message-mongodb.repository';
import { MessageMongoDB } from '../../shared/domain/entities/message-mongodb.entity';

@Injectable()
@QueryHandler(GetRecentMessagesQuery)
export class GetRecentMessagesMongoDBHandler implements IQueryHandler<GetRecentMessagesQuery> {
  private readonly logger = new Logger(GetRecentMessagesMongoDBHandler.name);

  constructor(
    private readonly messageRepository: MessageMongoDBRepository,
  ) {}

  async execute(query: GetRecentMessagesQuery): Promise<MessageMongoDB[]> {
    try {
      this.logger.debug(`Getting recent messages for conversation: ${query.conversationId}`);

      // Get recent messages from MongoDB
      const messages = await this.messageRepository.getRecentMessages(
        query.conversationId,
        query.limit || 10,
        query.tenantId,
      );

      this.logger.debug(`Found ${messages.length} recent messages for conversation: ${query.conversationId}`);

      return messages;
    } catch (error) {
      this.logger.error(`Failed to get recent messages: ${query.conversationId}`, error);
      throw error;
    }
  }
}