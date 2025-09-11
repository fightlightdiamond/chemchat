import { CommandHandler, EventBus } from '@nestjs/cqrs';
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { BaseCommandHandler } from '../../shared/cqrs/base-command-handler';
import { ValidateCommand } from '../../shared/cqrs/command-validation.decorator';
import { DeleteMessageCommand } from '../commands/delete-message.command';
import { Message } from '../../shared/domain/entities/message.entity';
import { MessageRepository } from '../../shared/domain/repositories/message.repository';
import { MessageDeletedEvent } from '../events/message-deleted.event';

@Injectable()
@CommandHandler(DeleteMessageCommand)
export class DeleteMessageCommandHandler extends BaseCommandHandler<
  DeleteMessageCommand,
  Message
> {
  constructor(
    private readonly messageRepository: MessageRepository,
    private readonly eventBus: EventBus,
  ) {
    super();
  }

  @ValidateCommand()
  async execute(command: DeleteMessageCommand): Promise<Message> {
    this.logCommandExecution(command);

    try {
      // Find the message
      const message = await this.messageRepository.findById(command.messageId);
      if (!message) {
        throw new NotFoundException(
          `Message with ID ${command.messageId} not found`,
        );
      }

      // Check if user can delete this message
      if (!message.canBeDeleted(command.userId!)) {
        throw new ForbiddenException('User cannot delete this message');
      }

      // Mark message as deleted
      const deletedMessage = message.markAsDeleted();

      // Save the deleted message
      const savedMessage = await this.messageRepository.update(
        deletedMessage.id,
        deletedMessage,
      );

      // Publish domain event
      const messageDeletedEvent = new MessageDeletedEvent(
        savedMessage.id,
        savedMessage.conversationId,
        savedMessage.senderId!,
        savedMessage.deletedAt!,
        command.correlationId,
        command.tenantId,
      );

      await this.eventBus.publish(messageDeletedEvent);

      this.logCommandSuccess(command, savedMessage);
      return savedMessage;
    } catch (error: unknown) {
      const errorInstance =
        error instanceof Error ? error : new Error(String(error));
      this.logCommandError(command, errorInstance);
      throw errorInstance;
    }
  }
}
