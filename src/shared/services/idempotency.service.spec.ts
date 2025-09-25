import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { IdempotencyService, IdempotentCommand } from './idempotency.service';
import { RedisService } from '../redis/redis.service';
import { MessageIdService } from '../../chat/services/message-id.service';

describe('IdempotencyService', () => {
  let service: IdempotencyService;
  // let redisService: jest.Mocked<RedisService>;
  let messageIdService: jest.Mocked<MessageIdService>;
  let reflector: jest.Mocked<Reflector>;

  const mockRedisService = {
    exec: jest.fn(),
  };

  const mockMessageIdService = {
    isDuplicate: jest.fn(),
    recordMessageId: jest.fn(),
  };

  const mockReflector = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IdempotencyService,
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
        {
          provide: MessageIdService,
          useValue: mockMessageIdService,
        },
        {
          provide: Reflector,
          useValue: mockReflector,
        },
      ],
    }).compile();

    service = module.get<IdempotencyService>(IdempotencyService);
    // redisService = mockRedisService as any;
    messageIdService = module.get(MessageIdService);
    reflector = module.get(Reflector);

    // Mock logger to avoid console output during tests
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('checkIdempotency', () => {
    const mockCommand: IdempotentCommand = {
      messageId: 'test-message-id',
      tenantId: 'test-tenant-id',
      userId: 'test-user-id',
      conversationId: 'test-conversation-id',
      content: 'test message',
    };

    const mockHandler = jest.fn();

    beforeEach(() => {
      mockHandler.constructor = { name: 'TestHandler' };
    });

    it('should return not duplicate when handler is not marked as idempotent', async () => {
      // Arrange
      reflector.get.mockReturnValue(false);

      // Act
      const result = await service.checkIdempotency(mockCommand, mockHandler);

      // Assert
      expect(result).toEqual({
        isDuplicate: false,
        cachedResult: undefined,
      });
      expect(reflector.get).toHaveBeenCalledWith(
        'idempotent',
        mockHandler.constructor,
      );
    });

    it('should check message ID duplication for idempotent handlers', async () => {
      // Arrange
      reflector.get.mockReturnValue(true);
      messageIdService.isDuplicate.mockResolvedValue(false);

      // Act
      const result = await service.checkIdempotency(mockCommand, mockHandler);

      // Assert
      expect(result).toEqual({
        isDuplicate: false,
        cachedResult: undefined,
      });

      expect(messageIdService.isDuplicate).toHaveBeenCalledWith(
        mockCommand.messageId,
        mockCommand.tenantId,
      );
    });

    it('should return duplicate when message ID already exists', async () => {
      // Arrange
      reflector.get.mockReturnValue(true);
      messageIdService.isDuplicate.mockResolvedValue(true);

      // Act
      const result = await service.checkIdempotency(mockCommand, mockHandler);

      // Assert
      expect(result).toEqual({
        isDuplicate: true,
        cachedResult: undefined,
      });
    });

    it('should handle missing messageId gracefully', async () => {
      // Arrange
      const commandWithoutMessageId = {
        ...mockCommand,
        messageId: undefined,
      } as IdempotentCommand;

      reflector.get.mockReturnValue(true);

      // Act
      const result = await service.checkIdempotency(
        commandWithoutMessageId,
        mockHandler,
      );

      // Assert
      expect(result).toEqual({
        isDuplicate: false,
        cachedResult: undefined,
      });
      expect(messageIdService.isDuplicate).not.toHaveBeenCalled();
    });

    it('should handle MessageIdService errors gracefully', async () => {
      // Arrange
      reflector.get.mockReturnValue(true);
      messageIdService.isDuplicate.mockRejectedValue(
        new Error('Redis connection failed'),
      );

      // Act
      const result = await service.checkIdempotency(mockCommand, mockHandler);

      // Assert
      expect(result).toEqual({
        isDuplicate: false,
        cachedResult: undefined,
      });
    });
  });

  describe('recordExecution', () => {
    const mockCommand: IdempotentCommand = {
      messageId: 'test-message-id',
      tenantId: 'test-tenant-id',
      userId: 'test-user-id',
      conversationId: 'test-conversation-id',
      content: 'test message',
    };

    const mockHandler = jest.fn();

    beforeEach(() => {
      mockHandler.constructor = { name: 'TestHandler' };
    });

    it('should record execution for idempotent handlers', async () => {
      // Arrange
      reflector.get.mockReturnValue(true);
      messageIdService.recordMessageId.mockResolvedValue(undefined);

      // Act
      await service.recordExecution(mockCommand, mockHandler);

      // Assert
      expect(messageIdService.recordMessageId).toHaveBeenCalledWith(
        mockCommand.messageId,
        mockCommand.tenantId,
      );
    });

    it('should not record execution for non-idempotent handlers', async () => {
      // Arrange
      reflector.get.mockReturnValue(false);

      // Act
      await service.recordExecution(mockCommand, mockHandler);

      // Assert
      expect(messageIdService.recordMessageId).not.toHaveBeenCalled();
    });

    it('should handle missing messageId gracefully', async () => {
      // Arrange
      const commandWithoutMessageId = {
        ...mockCommand,
        messageId: undefined,
      } as IdempotentCommand;

      reflector.get.mockReturnValue(true);

      // Act
      await service.recordExecution(commandWithoutMessageId, mockHandler);

      // Assert
      expect(messageIdService.recordMessageId).not.toHaveBeenCalled();
    });

    it('should handle MessageIdService errors gracefully', async () => {
      // Arrange
      reflector.get.mockReturnValue(true);
      messageIdService.recordMessageId.mockRejectedValue(
        new Error('Redis connection failed'),
      );

      // Act & Assert
      await expect(
        service.recordExecution(mockCommand, mockHandler),
      ).resolves.not.toThrow();
    });
  });

  describe('detectEditConflict', () => {
    const messageId = 'test-message-id';
    const expectedVersion = new Date('2024-01-01T10:00:00Z');
    const currentVersion = new Date('2024-01-01T11:00:00Z');

    it('should detect conflict when versions differ', () => {
      // Act
      const hasConflict = service.detectEditConflict(
        messageId,
        expectedVersion,
        currentVersion,
      );

      // Assert
      expect(hasConflict).toBe(true);
    });

    it('should not detect conflict when versions match', () => {
      // Act
      const hasConflict = service.detectEditConflict(
        messageId,
        expectedVersion,
        expectedVersion,
      );

      // Assert
      expect(hasConflict).toBe(false);
    });

    it('should handle same timestamp in milliseconds', () => {
      // Arrange
      const timestamp = new Date('2024-01-01T10:00:00.123Z');
      const sameTimestamp = new Date('2024-01-01T10:00:00.123Z');

      // Act
      const hasConflict = service.detectEditConflict(
        messageId,
        timestamp,
        sameTimestamp,
      );

      // Assert
      expect(hasConflict).toBe(false);
    });
  });

  describe('resolveEditConflict', () => {
    const messageId = 'test-message-id';
    const expectedContent = 'original content';
    const currentContent = 'modified content';

    it('should return reject strategy for edit conflicts', () => {
      // Act
      const resolution = service.resolveEditConflict(
        messageId,
        expectedContent,
        currentContent,
      );

      // Assert
      expect(resolution).toEqual({
        strategy: 'reject',
        result: {
          error: 'EDIT_CONFLICT',
          message:
            'Message was modified by another user. Please refresh and try again.',
          currentContent,
        },
      });
    });

    it('should handle empty content gracefully', () => {
      // Act
      const resolution = service.resolveEditConflict(messageId, '', '');

      // Assert
      expect(resolution.strategy).toBe('reject');
      expect(resolution.result.currentContent).toBe('');
    });

    it('should handle null/undefined content', () => {
      // Act
      const resolution = service.resolveEditConflict(
        messageId,
        null as any,
        undefined as any,
      );

      // Assert
      expect(resolution.strategy).toBe('reject');
      expect(resolution.result).toBeDefined();
    });
  });
});
