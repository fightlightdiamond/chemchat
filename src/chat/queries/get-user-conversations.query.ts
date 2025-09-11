import { IsUUID, IsNotEmpty, IsOptional } from 'class-validator';
import { BaseQuery } from '../../shared/cqrs/base-query';
import { PaginationQuery } from '../../shared/cqrs/pagination.dto';

export class GetUserConversationsQuery extends BaseQuery {
  @IsUUID()
  @IsNotEmpty()
  public readonly userId: string;

  @IsOptional()
  public readonly pagination?: PaginationQuery;

  @IsOptional()
  public readonly includeArchived?: boolean;

  constructor(data: {
    userId: string;
    pagination?: PaginationQuery;
    includeArchived?: boolean;
    correlationId?: string;
    tenantId?: string;
  }) {
    super(data);
    this.userId = data.userId;
    this.pagination = data.pagination;
    this.includeArchived = data.includeArchived;
  }
}
