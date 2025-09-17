import { Test, TestingModule } from '@nestjs/testing';
import { MessageService } from './message.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { SequenceService } from '../../sequence/services/sequence.service';
import { createMockPrismaService } from '../../../test/mocks/prisma.mock';
import { createMockRedisService } from '../../../test/mocks/redis.mock';
import { TestDataFactory } from '../../../test/fixtures/test-data';
import { MessageType } from '@prisma/client';

describe('MessageService', () => {
  let service: MessageService;
  let prismaService: any;
  let redisService: any;
  let sequenceService: any;

  beforeEach(async () => {
    const mockPrisma = createMockPrismaService();
    const mockRedis = createMockRedisService();
    const mockSequence = {
      generateSequenceNumber: jest.fn().mockResolvedValue(BigInt(1)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessageService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
        { provide: SequenceService, useValue: mockSequence },
      ],
    }).compile();

    service = module.get<MessageService>(MessageService);
    prismaService = module.get<PrismaService>(PrismaService);
    redisService = module.get<RedisService>(RedisService);
    sequenceService = module.get<SequenceService>(SequenceService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createMessage', () => {
    it('should create a message with sequence number', async () => {
      const tenant = TestDataFactory.createTenant();
      const user = TestDataFactory.createUser(tenant.id);
      const conversation = TestDataFactory.createConversation(tenant.id);

      const messageData = {
        content: 'Test message',
        type: MessageType.TEXT,
        conversationId: conversation.id,
        authorId: user.id,
        tenantId: tenant.id,
      };

      sequenceService.generateSequenceNumber.mockResolvedValue(BigInt(5));

      const result = await service.createMessage(messageData);

      expect(sequenceService.generateSequenceNumber).toHaveBeenCalledWith(conversation.id);
      expect(prismaService.message.create).toHaveBeenCalledWith({
        data: {
          ...messageData,
          sequenceNumber: BigInt(5),
        },
      });
      expect(result).toBeDefined();
    });

    it('should handle message creation failure', async () => {
      const messageData = {
        content: 'Test message',
        type: MessageType.TEXT,
        conversationId: 'conv-1',
        authorId: 'user-1',
        tenantId: 'tenant-1',
      };

      prismaService.message.create.mockRejectedValue(new Error('Database error'));

      await expect(service.createMessage(messageData)).rejects.toThrow('Database error');
    });
  });

  describe('updateMessage', () => {
    it('should update an existing message', async () => {
      const messageId = 'message-1';
      const updateData = { content: 'Updated content' };
      const existingMessage = TestDataFactory.createMessage('conv-1', 'user-1', 'tenant-1');

      prismaService.message.findUnique.mockResolvedValue(existingMessage);
      prismaService.message.update.mockResolvedValue({ ...existingMessage, ...updateData });

      const result = await service.updateMessage(messageId, updateData);

      expect(prismaService.message.update).toHaveBeenCalledWith({
        where: { id: messageId },
        data: updateData,
      });
      expect(result.content).toBe(updateData.content);
    });

    it('should throw error when message not found', async () => {
      const messageId = 'non-existent';
      const updateData = { content: 'Updated content' };

      prismaService.message.findUnique.mockResolvedValue(null);

      await expect(service.updateMessage(messageId, updateData)).rejects.toThrow('Message not found');
    });
  });

  describe('deleteMessage', () => {
    it('should soft delete a message', async () => {
      const messageId = 'message-1';
      const existingMessage = TestDataFactory.createMessage('conv-1', 'user-1', 'tenant-1');

      prismaService.message.findUnique.mockResolvedValue(existingMessage);
      prismaService.message.update.mockResolvedValue({ ...existingMessage, isDeleted: true });

      const result = await service.deleteMessage(messageId);

      expect(prismaService.message.update).toHaveBeenCalledWith({
        where: { id: messageId },
        data: { isDeleted: true, deletedAt: expect.any(Date) },
      });
      expect(result.isDeleted).toBe(true);
    });
  });

  describe('getMessagesByConversation', () => {
    it('should retrieve messages with pagination', async () => {
      const conversationId = 'conv-1';
      const messages = TestDataFactory.createBulkMessages(conversationId, 'user-1', 'tenant-1', 5);

      prismaService.message.findMany.mockResolvedValue(messages);

      const result = await service.getMessagesByConversation(conversationId, {
        limit: 10,
        cursor: undefined,
      });

      expect(prismaService.message.findMany).toHaveBeenCalledWith({
        where: { conversationId, isDeleted: false },
        orderBy: { sequenceNumber: 'desc' },
        take: 10,
      });
      expect(result).toHaveLength(5);
    });

    it('should handle cursor-based pagination', async () => {
      const conversationId = 'conv-1';
      const cursor = 'message-cursor';
      const messages = TestDataFactory.createBulkMessages(conversationId, 'user-1', 'tenant-1', 3);

      prismaService.message.findMany.mockResolvedValue(messages);

      await service.getMessagesByConversation(conversationId, {
        limit: 5,
        cursor,
      });

      expect(prismaService.message.findMany).toHaveBeenCalledWith({
        where: { conversationId, isDeleted: false },
        orderBy: { sequenceNumber: 'desc' },
        take: 5,
        cursor: { id: cursor },
        skip: 1,
      });
    });
  });

  describe('searchMessages', () => {
    it('should search messages by content', async () => {
      const query = 'test search';
      const tenantId = 'tenant-1';
      const messages = TestDataFactory.createBulkMessages('conv-1', 'user-1', tenantId, 2);

      prismaService.message.findMany.mockResolvedValue(messages);

      const result = await service.searchMessages(query, tenantId, {
        limit: 10,
        offset: 0,
      });

      expect(prismaService.message.findMany).toHaveBeenCalledWith({
        where: {
          tenantId,
          isDeleted: false,
          content: { contains: query, mode: 'insensitive' },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
        skip: 0,
      });
      expect(result).toHaveLength(2);
    });
  });
});
