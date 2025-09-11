import {
  IsUUID,
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { BaseCommand } from '../../shared/cqrs/base-command';

export class MessageAttachment {
  @IsString()
  @IsNotEmpty()
  url!: string;

  @IsString()
  @IsNotEmpty()
  type!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  size?: string;
}

export class SendMessageCommand extends BaseCommand {
  @IsUUID()
  @IsNotEmpty()
  public readonly conversationId: string;

  @IsString()
  @IsNotEmpty()
  public readonly content: string;

  @IsOptional()
  @IsString()
  public readonly clientMessageId?: string;

  @IsOptional()
  @IsUUID()
  public readonly replyToMessageId?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MessageAttachment)
  public readonly attachments?: MessageAttachment[];

  constructor(data: {
    conversationId: string;
    content: string;
    clientMessageId?: string;
    replyToMessageId?: string;
    attachments?: MessageAttachment[];
    correlationId?: string;
    userId?: string;
    tenantId?: string;
  }) {
    super(data);
    this.conversationId = data.conversationId;
    this.content = data.content;
    this.clientMessageId = data.clientMessageId;
    this.replyToMessageId = data.replyToMessageId;
    this.attachments = data.attachments;
  }
}
