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
import { MessageAttachment } from './send-message.command';

export class EditMessageCommand extends BaseCommand {
  @IsUUID()
  @IsNotEmpty()
  public readonly messageId: string;

  @IsString()
  @IsNotEmpty()
  public readonly content: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MessageAttachment)
  public readonly attachments?: MessageAttachment[];

  constructor(data: {
    messageId: string;
    content: string;
    attachments?: MessageAttachment[];
    correlationId?: string;
    userId?: string;
    tenantId?: string;
  }) {
    super(data);
    this.messageId = data.messageId;
    this.content = data.content;
    this.attachments = data.attachments;
  }
}
