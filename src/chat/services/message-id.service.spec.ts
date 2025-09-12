import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { MessageIdService } from './message-id.service';
import { RedisService } from '../../shared/redis/redis.service';

describe('MessageIdService', () => {
  let service: MessageIdService;
  let redisService: jest.Mocked<RedisService>;

  const mockRedisService = {
    exec: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessageIdService,
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
      ],
    }).compile();

    service = module.get<MessageIdService>(MessageIdService);
    redisService = module.get(RedisService);

    // Mock logger to avoid console output during tests
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('isDuplicate', () => {
    const conversationId = 'test-conversation-id';
    const clientMessageId = 'test-client-message-id';

    it('should return false when message ID does not exist (SET NX succeeds)', async () => {
      // Arrange
      redisService.exec.mockResolvedValue('OK');

      // Act
      const result = await service.isDuplicate(conversationId, clientMessageId);

      // Assert
      expect(result).toBe(false);
      expect(redisService.exec).toHaveBeenCalledWith(expect.any(Function));
    });

    it('should return true when message ID exists (SET NX fails)', async () => {
      // Arrange
      redisService.exec.mockResolvedValue(null);

      // Act
      const result = await service.isDuplicate(conversationId, clientMessageId);

      // Assert
      expect(result).toBe(true);
      expect(redisService.exec).toHaveBeenCalledWith(expect.any(Function));
    });

    it('should handle Redis errors gracefully', async () => {
      // Arrange
      redisService.exec.mockRejectedValue(new Error('Redis connection failed'));

      // Act
      const result = await service.isDuplicate(conversationId, clientMessageId);

      // Assert
      expect(result).toBe(false);
    });

    it('should generate correct Redis key', async () => {
      // Arrange
      redisService.exec.mockResolvedValue('OK');

      // Act
      await service.isDuplicate(conversationId, clientMessageId);

      // Assert
      expect(redisService.exec).toHaveBeenCalledWith(expect.any(Function));

      // Verify the function calls Redis with correct parameters
      const callArgs = redisService.exec.mock.calls[0][0];
      const mockClient = { set: jest.fn().mockResolvedValue('OK') };
      await callArgs(mockClient);

      expect(mockClient.set).toHaveBeenCalledWith(
        `msgid:${conversationId}:${clientMessageId}`,
        '1',
        'PX',
        7 * 24 * 60 * 60 * 1000, // 7 days TTL
        'NX',
      );
    });

    it('should handle empty clientMessageId', async () => {
      // Act
      const result = await service.isDuplicate(conversationId, '');

      // Assert
      expect(result).toBe(false);
      expect(redisService.exec).not.toHaveBeenCalled();
    });
  });

  describe('recordMessageId', () => {
    const conversationId = 'test-conversation-id';
    const clientMessageId = 'test-client-message-id';

    it('should record message ID with TTL', async () => {
      // Arrange
      redisService.exec.mockResolvedValue('OK');

      // Act
      await service.recordMessageId(conversationId, clientMessageId);

      // Assert
      expect(redisService.exec).toHaveBeenCalledWith(expect.any(Function));
    });

    it('should use correct TTL for message ID', async () => {
      // Arrange
      redisService.exec.mockResolvedValue('OK');

      // Act
      await service.recordMessageId(conversationId, clientMessageId);

      // Assert
      const callArgs = redisService.exec.mock.calls[0][0];
      const mockClient = {
        set: jest.fn().mockResolvedValue('OK'),
      };
      await callArgs(mockClient);

      expect(mockClient.set).toHaveBeenCalledWith(
        `msgid:${conversationId}:${clientMessageId}`,
        '1',
        'PX',
        7 * 24 * 60 * 60 * 1000, // 7 days TTL
      );
    });

    it('should handle Redis errors gracefully', async () => {
      // Arrange
      redisService.exec.mockRejectedValue(new Error('Redis connection failed'));

      // Act & Assert
      await expect(
        service.recordMessageId(conversationId, clientMessageId),
      ).resolves.not.toThrow();
    });

    it('should handle empty clientMessageId gracefully', async () => {
      // Act
      await service.recordMessageId(conversationId, '');

      // Assert
      expect(redisService.exec).not.toHaveBeenCalled();
    });
  });

  describe('extendMessageIdTtl', () => {
    const conversationId = 'test-conversation-id';
    const clientMessageId = 'test-client-message-id';

    it('should extend TTL for existing message ID', async () => {
      // Arrange
      redisService.exec.mockResolvedValue(1);

      // Act
      await service.extendMessageIdTtl(conversationId, clientMessageId);

      // Assert
      expect(redisService.exec).toHaveBeenCalledWith(expect.any(Function));
    });

    it('should handle empty clientMessageId gracefully', async () => {
      // Act
      await service.extendMessageIdTtl(conversationId, '');

      // Assert
      expect(redisService.exec).not.toHaveBeenCalled();
    });
  });

  describe('removeMessageId', () => {
    const conversationId = 'test-conversation-id';
    const clientMessageId = 'test-client-message-id';

    it('should remove message ID from cache', async () => {
      // Arrange
      redisService.exec.mockResolvedValue(1);

      // Act
      await service.removeMessageId(conversationId, clientMessageId);

      // Assert
      expect(redisService.exec).toHaveBeenCalledWith(expect.any(Function));
    });

    it('should handle empty clientMessageId gracefully', async () => {
      // Act
      await service.removeMessageId(conversationId, '');

      // Assert
      expect(redisService.exec).not.toHaveBeenCalled();
    });
  });
});
