import { ICommand } from '@nestjs/cqrs';
import { IsUUID, IsOptional, IsString } from 'class-validator';

export abstract class BaseCommand implements ICommand {
  @IsOptional()
  @IsUUID()
  public readonly correlationId?: string;

  @IsOptional()
  @IsString()
  public readonly userId?: string;

  @IsOptional()
  @IsString()
  public readonly tenantId?: string;

  constructor(data: Partial<BaseCommand> = {}) {
    this.correlationId = data.correlationId;
    this.userId = data.userId;
    this.tenantId = data.tenantId;
  }
}
