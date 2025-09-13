import { IsString, IsOptional, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { BaseQuery } from '../../shared/cqrs/base-query';

export class GetSearchSuggestionsQuery extends BaseQuery {
  @IsString()
  query!: string;

  declare tenantId: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit?: number = 5;

  constructor(data: Partial<GetSearchSuggestionsQuery>) {
    super(data);
    Object.assign(this, data);
  }
}
