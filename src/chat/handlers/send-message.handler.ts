import { CommandHandler, EventBus, IEvent } from '@nestjs/cqrs';
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { BaseCommandHandler } from '../../shared/cqrs/base-command-handler';
import { ValidateCommand } from '../../shared/cqrs/command-validation.decorator';
import { SendMessageCommand } from '../commands/send-message.command';
import { Message } from '../../shared/domain/entities/message.entity';
import { MessageContent } from '../../shared/domain/value-objects/message-content.vo';
import { MessageType } from '../../shared/domain/value-objects/message-type.vo';
import { MessageRepository } from '../../shared/domain/repositories/message.repository';
import { ConversationRepository } from '../../shared/domain/repositories/conversation.repository';
import { MessageCreatedEvent } from '../events/message-created.event';
import { OutboxEventPublisherService } from '../../shared/outbox/services/outbox-event-publisher.service';

// ------------------------------------------------------------
// Nếu import Event bị "trôi type" (JS / barrel sai) -> ESLint báo no-unsafe-call.
// Alias dưới đây ép kiểu constructor ngay tại chỗ dùng, triệt tiêu lỗi.
// Nếu file Event của bạn là TS chuẩn rồi, alias này vẫn vô hại.
// ------------------------------------------------------------
type MessageCreatedEventCtor = new (
  messageId: string,
  conversationId: string,
  senderId: string | null,
  content: MessageContent,
  sequenceNumber: bigint,
  createdAt: Date,
  correlationId?: string,
  tenantId?: string,
) => IEvent & {
  toJSON(): {
    messageId: string;
    conversationId: string;
    senderId: string | null;
    content: ReturnType<MessageContent['toJSON']>;
    sequenceNumber: string;
    createdAt: string;
    correlationId?: string;
    tenantId?: string;
    eventType: 'MessageCreated';
    version: '1.0';
  };
};

const MessageCreatedEventSafe =
  MessageCreatedEvent as unknown as MessageCreatedEventCtor;

@Injectable()
@CommandHandler(SendMessageCommand)
export class SendMessageCommandHandler extends BaseCommandHandler<
  SendMessageCommand,
  Message
> {
  constructor(
    private readonly messageRepository: MessageRepository,
    private readonly conversationRepository: ConversationRepository,
    private readonly eventBus: EventBus,
    private readonly outboxPublisher: OutboxEventPublisherService,
  ) {
    super();
  }

  @ValidateCommand()
  async execute(command: SendMessageCommand): Promise<Message> {
    this.logCommandExecution(command);

    try {
      // --------- Guards đầu vào để khỏi dùng "!" ----------
      if (!command.userId) {
        throw new ForbiddenException('Missing userId');
      }

      // --------- Conversation tồn tại + quyền truy cập ----------
      const conversation = await this.conversationRepository.findById(
        command.conversationId,
      );
      if (!conversation) {
        throw new NotFoundException(
          `Conversation with ID ${command.conversationId} not found`,
        );
      }
      if (!conversation.isMember(command.userId)) {
        throw new ForbiddenException(
          'User is not a member of this conversation',
        );
      }

      // --------- Chống trùng clientMessageId ----------
      if (command.clientMessageId) {
        const existingMessage: Message | null =
          await this.messageRepository.findByClientMessageId(
            command.clientMessageId,
          );
        if (existingMessage) {
          this.logger.warn(
            `Duplicate message detected with client ID: ${command.clientMessageId}`,
          );
          return existingMessage; // Type chuẩn -> không "unsafe-assignment"
        }
      }

      // --------- Lấy sequenceNumber ----------
      // Khuyến nghị: repository trả bigint luôn cho nhất quán.
      let sequenceNumber: bigint =
        (await this.messageRepository.getNextSequenceNumber(
          command.conversationId,
        )) as unknown as bigint; // nếu interface đã là bigint thì bỏ "as unknown as bigint"
      if (typeof sequenceNumber !== 'bigint') {
        // fallback an toàn nếu repo trả number/string
        sequenceNumber = BigInt(sequenceNumber as unknown as number);
      }
      if (sequenceNumber < 0n) {
        throw new Error('sequenceNumber must be non-negative');
      }

      // --------- Tạo VO content an toàn ----------
      const attachments =
        command.attachments?.map((att) => ({
          id: att.url,
          filename: att.name,
          mimeType: att.type,
          fileSize: Number.isFinite(Number(att.size))
            ? Number(att.size)
            : Number.parseInt(att.size ?? '0', 10),
          storageUrl: att.url,
        })) ?? [];

      const messageContent = new MessageContent({
        text: command.content,
        attachments,
        metadata: command.replyToMessageId
          ? { replyToMessageId: command.replyToMessageId }
          : undefined,
      });

      // --------- Tạo entity Message an toàn ----------
      const now = new Date();
      const message = new Message(
        uuidv4(),
        command.conversationId,
        command.userId, // có guard ở trên -> string
        command.clientMessageId ?? null,
        sequenceNumber, // bigint
        MessageType.TEXT,
        messageContent,
        null, // editedAt
        null, // deletedAt
        now,
      );

      // --------- Lưu DB (interface trả Promise<Message>) ----------
      const savedMessage: Message = await this.messageRepository.save(message);

      // --------- Publish domain event through outbox pattern ----------
      // Dùng ctor đã ép kiểu -> không "no-unsafe-call"
      const evt = new MessageCreatedEventSafe(
        savedMessage.id,
        savedMessage.conversationId,
        savedMessage.senderId ?? null,
        savedMessage.content, // VO thật
        savedMessage.sequenceNumber as unknown as bigint, // entity của bạn là bigint → giữ nguyên
        savedMessage.createdAt instanceof Date
          ? savedMessage.createdAt
          : new Date(savedMessage.createdAt),
        command.correlationId,
        command.tenantId,
      );

      // Publish through outbox for reliable delivery
      await this.outboxPublisher.publishEvent(
        evt,
        'Message',
        savedMessage.id,
        command.tenantId,
      );

      this.logCommandSuccess(command, savedMessage);
      return savedMessage;
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logCommandError(command, err);
      throw err;
    }
  }
}
