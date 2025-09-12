import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { SequenceService } from './sequence.service';
import { RedisService } from '../redis/redis.service';
import { PrismaService } from '../infrastructure/prisma/prisma.service';

describe('SequenceService', () => {
  let service: SequenceService;
  let redisService: jest.Mocked<RedisService>;
  let prismaService: jest.Mocked<PrismaService>;

  const mockRedisService = {
    exec: jest.fn(),
  };

  const mockPrismaService = {
    conversationState: {
      upsert: jest.fn(),
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SequenceService,
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<SequenceService>(SequenceService);
    redisService = module.get(RedisService);
    prismaService = module.get(PrismaService);

    // Mock logger to avoid console output during tests
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('generateSequenceNumber', () => {
    const conversationId = 'test-conversation-id';
    const tenantId = 'test-tenant-id';

    it('should generate sequence number using Redis INCR', async () => {
      // Arrange
      const expectedSequence = 5;
      redisService.exec.mockResolvedValue(expectedSequence);

      // Act
      const result = await service.generateSequenceNumber(
        conversationId,
        tenantId,
      );

      // Assert
      expect(result).toBe(expectedSequence);
      expect(redisService.exec).toHaveBeenCalledWith(expect.any(Function));
    });

    it('should fallback to database when Redis fails', async () => {
      // Arrange
      const expectedSequence = 3;
      redisService.exec.mockRejectedValue(new Error('Redis connection failed'));

      mockPrismaService.conversationState.upsert.mockResolvedValue({
        id: 'state-id',
        conversationId,
        tenantId,
        lastSequenceNumber: expectedSequence,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Act
      const result = await service.generateSequenceNumber(
        conversationId,
        tenantId,
      );

      // Assert
      expect(result).toBe(expectedSequence);
      expect(prismaService.conversationState.upsert).toHaveBeenCalledWith({
        where: {
          conversationId_tenantId: {
            conversationId,
            tenantId,
          },
        },
        update: {
          lastSequenceNumber: {
            increment: 1,
          },
        },
        create: {
          conversationId,
          tenantId,
          lastSequenceNumber: 1,
        },
      });
    });

    it('should handle database fallback failure', async () => {
      // Arrange
      redisService.exec.mockRejectedValue(new Error('Redis failed'));
      mockPrismaService.conversationState.upsert.mockRejectedValue(
        new Error('Database failed'),
      );

      // Act & Assert
      await expect(
        service.generateSequenceNumber(conversationId, tenantId),
      ).rejects.toThrow('Failed to generate sequence number');
    });
  });

  describe('generateBatchSequenceNumbers', () => {
    const conversationId = 'test-conversation-id';
    const tenantId = 'test-tenant-id';
    const count = 3;

    it('should generate batch sequence numbers using Redis', async () => {
      // Arrange
      const startSequence = 10;
      redisService.exec.mockResolvedValue(startSequence + count - 1);

      // Act
      const result = await service.generateBatchSequenceNumbers(
        conversationId,
        tenantId,
        count,
      );

      // Assert
      expect(result).toEqual([10, 11, 12]);
      expect(redisService.exec).toHaveBeenCalledWith(expect.any(Function));
    });

    it('should fallback to database for batch generation', async () => {
      // Arrange
      redisService.exec.mockRejectedValue(new Error('Redis failed'));

      mockPrismaService.conversationState.upsert.mockResolvedValue({
        id: 'state-id',
        conversationId,
        tenantId,
        lastSequenceNumber: 7,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Act
      const result = await service.generateBatchSequenceNumbers(
        conversationId,
        tenantId,
        count,
      );

      // Assert
      expect(result).toEqual([5, 6, 7]);
      expect(prismaService.conversationState.upsert).toHaveBeenCalledWith({
        where: {
          conversationId_tenantId: {
            conversationId,
            tenantId,
          },
        },
        update: {
          lastSequenceNumber: {
            increment: count,
          },
        },
        create: {
          conversationId,
          tenantId,
          lastSequenceNumber: count,
        },
      });
    });

    it('should handle invalid count parameter', async () => {
      // Act & Assert
      await expect(
        service.generateBatchSequenceNumbers(conversationId, tenantId, 0),
      ).rejects.toThrow('Count must be greater than 0');

      await expect(
        service.generateBatchSequenceNumbers(conversationId, tenantId, -1),
      ).rejects.toThrow('Count must be greater than 0');
    });
  });

  describe('getCurrentSequenceNumber', () => {
    const conversationId = 'test-conversation-id';
    const tenantId = 'test-tenant-id';

    it('should get current sequence number from Redis', async () => {
      // Arrange
      const expectedSequence = 15;
      redisService.exec.mockResolvedValue(expectedSequence);

      // Act
      const result = await service.getCurrentSequenceNumber(
        conversationId,
        tenantId,
      );

      // Assert
      expect(result).toBe(expectedSequence);
      expect(redisService.exec).toHaveBeenCalledWith(expect.any(Function));
    });

    it('should fallback to database when Redis fails', async () => {
      // Arrange
      redisService.exec.mockRejectedValue(new Error('Redis failed'));

      mockPrismaService.conversationState.findUnique.mockResolvedValue({
        id: 'state-id',
        conversationId,
        tenantId,
        lastSequenceNumber: 8,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Act
      const result = await service.getCurrentSequenceNumber(
        conversationId,
        tenantId,
      );

      // Assert
      expect(result).toBe(8);
      expect(prismaService.conversationState.findUnique).toHaveBeenCalledWith({
        where: {
          conversationId_tenantId: {
            conversationId,
            tenantId,
          },
        },
      });
    });

    it('should return 0 when no sequence exists', async () => {
      // Arrange
      redisService.exec.mockRejectedValue(new Error('Redis failed'));
      mockPrismaService.conversationState.findUnique.mockResolvedValue(null);

      // Act
      const result = await service.getCurrentSequenceNumber(
        conversationId,
        tenantId,
      );

      // Assert
      expect(result).toBe(0);
    });
  });

  describe('resetSequenceNumber', () => {
    const conversationId = 'test-conversation-id';
    const tenantId = 'test-tenant-id';

    it('should reset sequence number in both Redis and database', async () => {
      // Arrange
      redisService.exec.mockResolvedValue('OK');
      mockPrismaService.conversationState.upsert.mockResolvedValue({
        id: 'state-id',
        conversationId,
        tenantId,
        lastSequenceNumber: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Act
      await service.resetSequenceNumber(conversationId, tenantId);

      // Assert
      expect(redisService.exec).toHaveBeenCalledWith(expect.any(Function));
      expect(prismaService.conversationState.upsert).toHaveBeenCalledWith({
        where: {
          conversationId_tenantId: {
            conversationId,
            tenantId,
          },
        },
        update: {
          lastSequenceNumber: 0,
        },
        create: {
          conversationId,
          tenantId,
          lastSequenceNumber: 0,
        },
      });
    });

    it('should continue with database reset even if Redis fails', async () => {
      // Arrange
      redisService.exec.mockRejectedValue(new Error('Redis failed'));
      mockPrismaService.conversationState.upsert.mockResolvedValue({
        id: 'state-id',
        conversationId,
        tenantId,
        lastSequenceNumber: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Act
      await service.resetSequenceNumber(conversationId, tenantId);

      // Assert
      expect(prismaService.conversationState.upsert).toHaveBeenCalled();
    });
  });
});
