import { Injectable, Logger } from '@nestjs/common';
import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { GetUserMessagesQuery } from '../queries/get-user-messages.query';
import { MessageMongoDBRepository } from '../../shared/domain/repositories/message-mongodb.repository';
import { PaginatedResult } from '../../shared/domain/repositories/base.repository';
import { MessageMongoDB } from '../../shared/domain/entities/message-mongodb.entity';

@Injectable()
@QueryHandler(GetUserMessagesQuery)
export class GetUserMessagesMongoDBHandler implements IQueryHandler<GetUserMessagesQuery> {
  private readonly logger = new Logger(GetUserMessagesMongoDBHandler.name);

  constructor(
    private readonly messageRepository: MessageMongoDBRepository,
  ) {}

  async execute(query: GetUserMessagesQuery): Promise<PaginatedResult<MessageMongoDB>> {
    try {
      this.logger.debug(`Getting messages for user: ${query.userId}`);

      // Get messages from MongoDB
      const result = await this.messageRepository.findBySender(
        query.userId,
        {
          limit: query.pagination?.limit || 50,
          offset: query.pagination?.offset || 0,
          tenantId: query.tenantId,
          includeDeleted: false,
        }
      );

      this.logger.debug(`Found ${result.data.length} messages for user: ${query.userId}`);

      return result;
    } catch (error) {
      this.logger.error(`Failed to get user messages: ${query.userId}`, error);
      throw error;
    }
  }
}