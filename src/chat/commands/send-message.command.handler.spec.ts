import { Test, TestingModule } from '@nestjs/testing';
import { SendMessageCommandHandler } from './send-message.command.handler';
import { SendMessageCommand } from './send-message.command';
import { MessageService } from '../services/message.service';
import { EventBus } from '@nestjs/cqrs';
import { MessageCreatedEvent } from '../events/message-created.event';
import { TestDataFactory } from '../../../test/fixtures/test-data';
import { MessageType } from '@prisma/client';

describe('SendMessageCommandHandler', () => {
  let handler: SendMessageCommandHandler;
  let messageService: any;
  let eventBus: any;

  beforeEach(async () => {
    const mockMessageService = {
      createMessage: jest.fn(),
    };

    const mockEventBus = {
      publish: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SendMessageCommandHandler,
        { provide: MessageService, useValue: mockMessageService },
        { provide: EventBus, useValue: mockEventBus },
      ],
    }).compile();

    handler = module.get<SendMessageCommandHandler>(SendMessageCommandHandler);
    messageService = module.get<MessageService>(MessageService);
    eventBus = module.get<EventBus>(EventBus);
  });

  it('should be defined', () => {
    expect(handler).toBeDefined();
  });

  describe('execute', () => {
    it('should create message and publish event', async () => {
      const tenant = TestDataFactory.createTenant();
      const user = TestDataFactory.createUser(tenant.id);
      const conversation = TestDataFactory.createConversation(tenant.id);
      const message = TestDataFactory.createMessage(conversation.id, user.id, tenant.id);

      const command = new SendMessageCommand({
        content: 'Test message',
        type: MessageType.TEXT,
        conversationId: conversation.id,
        userId: user.id,
        tenantId: tenant.id,
        correlationId: 'test-correlation',
      });

      messageService.createMessage.mockResolvedValue(message);

      const result = await handler.execute(command);

      expect(messageService.createMessage).toHaveBeenCalledWith({
        content: command.content,
        type: command.type,
        conversationId: command.conversationId,
        authorId: command.userId,
        tenantId: command.tenantId,
      });

      expect(eventBus.publish).toHaveBeenCalledWith(
        expect.any(MessageCreatedEvent)
      );

      expect(result).toEqual(message);
    });

    it('should handle message creation failure', async () => {
      const command = new SendMessageCommand({
        content: 'Test message',
        type: MessageType.TEXT,
        conversationId: 'conv-1',
        userId: 'user-1',
        tenantId: 'tenant-1',
        correlationId: 'test-correlation',
      });

      messageService.createMessage.mockRejectedValue(new Error('Creation failed'));

      await expect(handler.execute(command)).rejects.toThrow('Creation failed');
      expect(eventBus.publish).not.toHaveBeenCalled();
    });

    it('should validate required fields', async () => {
      const invalidCommand = new SendMessageCommand({
        content: '',
        type: MessageType.TEXT,
        conversationId: 'conv-1',
        userId: 'user-1',
        tenantId: 'tenant-1',
        correlationId: 'test-correlation',
      });

      await expect(handler.execute(invalidCommand)).rejects.toThrow();
    });
  });
});
