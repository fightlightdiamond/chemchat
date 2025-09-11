import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  IsUUID,
  IsEnum,
} from 'class-validator';
import { BaseCommand } from '../../shared/cqrs/base-command';
import { ConversationType } from '../../shared/domain/value-objects/conversation-type.vo';

export class CreateConversationCommand extends BaseCommand {
  @IsString()
  @IsNotEmpty()
  public readonly name: string;

  @IsOptional()
  @IsString()
  public readonly description?: string;

  @IsEnum(ConversationType)
  public readonly type: ConversationType;

  @IsArray()
  @IsUUID('4', { each: true })
  public readonly participantIds: string[];

  @IsOptional()
  @IsString()
  public readonly avatarUrl?: string;

  constructor(data: {
    name: string;
    description?: string;
    type: ConversationType;
    participantIds: string[];
    avatarUrl?: string;
    correlationId?: string;
    userId?: string;
    tenantId?: string;
  }) {
    super(data);
    this.name = data.name;
    this.description = data.description;
    this.type = data.type;
    this.participantIds = data.participantIds;
    this.avatarUrl = data.avatarUrl;
  }
}
