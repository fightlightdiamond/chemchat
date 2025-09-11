import { CommandHandler, EventBus } from '@nestjs/cqrs';
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { BaseCommandHandler } from '../../shared/cqrs/base-command-handler';
import { ValidateCommand } from '../../shared/cqrs/command-validation.decorator';
import { EditMessageCommand } from '../commands/edit-message.command';
import { Message } from '../../shared/domain/entities/message.entity';
import { MessageContent } from '../../shared/domain/value-objects/message-content.vo';
import { MessageRepository } from '../../shared/domain/repositories/message.repository';
import { MessageEditedEvent } from '../events/message-edited.event';

@Injectable()
@CommandHandler(EditMessageCommand)
export class EditMessageCommandHandler extends BaseCommandHandler<
  EditMessageCommand,
  Message
> {
  constructor(
    private readonly messageRepository: MessageRepository,
    private readonly eventBus: EventBus,
  ) {
    super();
  }

  @ValidateCommand()
  async execute(command: EditMessageCommand): Promise<Message> {
    this.logCommandExecution(command);

    try {
      // Find the message
      const message = await this.messageRepository.findById(command.messageId);
      if (!message) {
        throw new NotFoundException(
          `Message with ID ${command.messageId} not found`,
        );
      }

      // Check if user can edit this message
      if (!message.canBeEdited(command.userId!)) {
        throw new ForbiddenException('User cannot edit this message');
      }

      // Create new message content
      const newContent = new MessageContent({
        text: command.content,
        attachments: command.attachments?.map((att) => ({
          id: att.url,
          filename: att.name,
          mimeType: att.type,
          fileSize: parseInt(att.size || '0'),
          storageUrl: att.url,
        })),
        metadata: message.content.getMetadata(),
      });

      // Edit the message
      const editedMessage = message.editContent(newContent);

      // Save the edited message
      const savedMessage = await this.messageRepository.update(
        editedMessage.id,
        editedMessage,
      );

      // Publish domain event
      const messageEditedEvent = new MessageEditedEvent(
        savedMessage.id,
        savedMessage.conversationId,
        savedMessage.senderId!,
        savedMessage.content,
        savedMessage.editedAt!,
        command.correlationId,
        command.tenantId,
      );

      await this.eventBus.publish(messageEditedEvent);

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
