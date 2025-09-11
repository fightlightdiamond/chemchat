import { IsString, IsNotEmpty, IsOptional, IsUUID } from 'class-validator';
import { BaseQuery } from '../../shared/cqrs/base-query';
import { PaginationQuery } from '../../shared/cqrs/pagination.dto';

export class SearchMessagesQuery extends BaseQuery {
  @IsString()
  @IsNotEmpty()
  public readonly searchTerm: string;

  @IsOptional()
  @IsUUID()
  public readonly conversationId?: string;

  @IsOptional()
  public readonly pagination?: PaginationQuery;

  @IsOptional()
  public readonly startDate?: Date;

  @IsOptional()
  public readonly endDate?: Date;

  constructor(data: {
    searchTerm: string;
    conversationId?: string;
    pagination?: PaginationQuery;
    startDate?: Date;
    endDate?: Date;
    correlationId?: string;
    userId?: string;
    tenantId?: string;
  }) {
    super(data);
    this.searchTerm = data.searchTerm;
    this.conversationId = data.conversationId;
    this.pagination = data.pagination;
    this.startDate = data.startDate;
    this.endDate = data.endDate;
  }
}
