import { IsUUID, IsNotEmpty } from 'class-validator';
import { BaseCommand } from '../../shared/cqrs/base-command';

export class DeleteMessageCommand extends BaseCommand {
  @IsUUID()
  @IsNotEmpty()
  public readonly messageId: string;

  constructor(data: {
    messageId: string;
    correlationId?: string;
    userId?: string;
    tenantId?: string;
  }) {
    super(data);
    this.messageId = data.messageId;
  }
}
