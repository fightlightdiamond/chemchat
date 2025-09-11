import { IQuery } from '@nestjs/cqrs';
import { IsUUID, IsOptional, IsString } from 'class-validator';

export abstract class BaseQuery implements IQuery {
  @IsOptional()
  @IsUUID()
  public readonly correlationId?: string;

  @IsOptional()
  @IsString()
  public readonly userId?: string;

  @IsOptional()
  @IsString()
  public readonly tenantId?: string;

  constructor(data: Partial<BaseQuery> = {}) {
    this.correlationId = data.correlationId;
    this.userId = data.userId;
    this.tenantId = data.tenantId;
  }
}
