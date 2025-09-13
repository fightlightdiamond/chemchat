import { IsOptional, IsString, IsEnum, IsDateString, IsInt, Min, Max, IsBoolean } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { BaseQuery } from '../../shared/cqrs/base-query';

export class SearchMessagesQuery extends BaseQuery {
  @IsOptional()
  @IsString()
  query?: string;

  declare tenantId: string;

  @IsOptional()
  @IsString()
  conversationId?: string;

  @IsOptional()
  @IsString()
  authorId?: string;

  @IsOptional()
  @IsEnum(['text', 'media', 'system'])
  messageType?: 'text' | 'media' | 'system';

  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @IsOptional()
  @IsDateString()
  toDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @IsEnum(['relevance', 'date', 'sequence'])
  sortBy?: 'relevance' | 'date' | 'sequence' = 'relevance';

  @IsOptional()
  @IsEnum(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  includeDeleted?: boolean = false;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  highlights?: boolean = false;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  includeHighlights?: boolean = false;

  constructor(data: Partial<SearchMessagesQuery>) {
    super(data);
    Object.assign(this, data);
  }
}
