import { IsUUID, IsNotEmpty, IsOptional } from 'class-validator';
import { BaseQuery } from '../../shared/cqrs/base-query';
import { PaginationQuery } from '../../shared/cqrs/pagination.dto';

export class GetConversationHistoryQuery extends BaseQuery {
  @IsUUID()
  @IsNotEmpty()
  public readonly conversationId: string;

  @IsOptional()
  public readonly pagination?: PaginationQuery;

  @IsOptional()
  public readonly beforeSequence?: string; // bigint as string

  @IsOptional()
  public readonly afterSequence?: string; // bigint as string

  constructor(data: {
    conversationId: string;
    pagination?: PaginationQuery;
    beforeSequence?: string;
    afterSequence?: string;
    correlationId?: string;
    userId?: string;
    tenantId?: string;
  }) {
    super(data);
    this.conversationId = data.conversationId;
    this.pagination = data.pagination;
    this.beforeSequence = data.beforeSequence;
    this.afterSequence = data.afterSequence;
  }
}
