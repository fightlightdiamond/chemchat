import { CommandHandler, EventBus } from '@nestjs/cqrs';
import { Injectable, BadRequestException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { BaseCommandHandler } from '../../shared/cqrs/base-command-handler';
import { ValidateCommand } from '../../shared/cqrs/command-validation.decorator';
import { CreateConversationCommand } from '../commands/create-conversation.command';
import { Conversation } from '../../shared/domain/entities/conversation.entity';
import { ConversationMember } from '../../shared/domain/entities/conversation-member.entity';
import { ConversationRole } from '../../shared/domain/value-objects/conversation-role.vo';
import { ConversationRepository } from '../../shared/domain/repositories/conversation.repository';
import { UserRepository } from '../../shared/domain/repositories/user.repository';
import { ConversationMemberRepository } from '../../shared/domain/repositories/conversation-member.repository';
import { ConversationCreatedEvent } from '../events/conversation-created.event';

@Injectable()
@CommandHandler(CreateConversationCommand)
export class CreateConversationCommandHandler extends BaseCommandHandler<
  CreateConversationCommand,
  Conversation
> {
  constructor(
    private readonly conversationRepository: ConversationRepository,
    private readonly userRepository: UserRepository,
    private readonly conversationMemberRepository: ConversationMemberRepository,
    private readonly eventBus: EventBus,
  ) {
    super();
  }

  @ValidateCommand()
  async execute(command: CreateConversationCommand): Promise<Conversation> {
    this.logCommandExecution(command);

    try {
      // Validate that all participant users exist
      const users = await Promise.all(
        command.participantIds.map((id) => this.userRepository.findById(id)),
      );

      const missingUsers = command.participantIds.filter(
        (id, index) => !users[index],
      );
      if (missingUsers.length > 0) {
        throw new BadRequestException(
          `Users not found: ${missingUsers.join(', ')}`,
        );
      }

      // Validate userId is provided
      if (!command.userId) {
        throw new BadRequestException('User ID is required');
      }

      // Create conversation entity
      const conversation = new Conversation(
        uuidv4(),
        command.type,
        command.name,
        command.userId,
      );

      // Create conversation members
      const members = [
        new ConversationMember(
          conversation.id,
          command.userId,
          ConversationRole.OWNER,
        ),
      ];

      // Add other participants as members
      if (command.participantIds && command.participantIds.length > 0) {
        for (const participantId of command.participantIds) {
          members.push(
            new ConversationMember(
              conversation.id,
              participantId,
              ConversationRole.MEMBER,
            ),
          );
        }
      }

      // Save conversation
      const savedConversation =
        await this.conversationRepository.create(conversation);

      // Save conversation members
      await Promise.all(
        members.map((member) =>
          this.conversationMemberRepository.create(member),
        ),
      );

      // Publish domain event
      const conversationCreatedEvent = new ConversationCreatedEvent(
        savedConversation.id,
        savedConversation.name || 'Untitled Conversation',
        savedConversation.type,
        savedConversation.ownerId || command.userId,
        command.participantIds,
        savedConversation.createdAt,
        command.correlationId,
        command.tenantId,
      );

      await this.eventBus.publish(conversationCreatedEvent);

      this.logCommandSuccess(command, savedConversation);
      return savedConversation;
    } catch (error: unknown) {
      const errorInstance =
        error instanceof Error ? error : new Error(String(error));
      this.logCommandError(command, errorInstance);
      throw errorInstance;
    }
  }
}
