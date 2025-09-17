import { Test, TestingModule } from '@nestjs/testing';
import { SequenceService } from './sequence.service';
import { RedisService } from '../../redis/redis.service';
import { PrismaService } from '../../prisma/prisma.service';
import { createMockRedisService } from '../../../test/mocks/redis.mock';
import { createMockPrismaService } from '../../../test/mocks/prisma.mock';
import { ConflictException } from '@nestjs/common';

describe('SequenceService', () => {
  let service: SequenceService;
  let redisService: any;
  let prismaService: any;

  beforeEach(async () => {
    const mockRedis = createMockRedisService();
    const mockPrisma = createMockPrismaService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SequenceService,
        { provide: RedisService, useValue: mockRedis },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<SequenceService>(SequenceService);
    redisService = module.get<RedisService>(RedisService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateSequenceNumber', () => {
    it('should generate sequence number from Redis', async () => {
      const conversationId = 'conv-1';
      redisService.incr = jest.fn().mockResolvedValue(5);

      const result = await service.generateSequenceNumber(conversationId);

      expect(redisService.incr).toHaveBeenCalledWith(`seq:${conversationId}`);
      expect(result).toBe(BigInt(5));
    });

    it('should fallback to database when Redis fails', async () => {
      const conversationId = 'conv-1';
      redisService.incr = jest.fn().mockRejectedValue(new Error('Redis error'));
      
      const mockConversationState = {
        lastSequenceNumber: BigInt(3),
      };
      
      prismaService.conversationState = {
        upsert: jest.fn().mockResolvedValue({
          ...mockConversationState,
          lastSequenceNumber: BigInt(4),
        }),
      };

      const result = await service.generateSequenceNumber(conversationId);

      expect(prismaService.conversationState.upsert).toHaveBeenCalledWith({
        where: { conversationId },
        update: { lastSequenceNumber: { increment: 1 } },
        create: { conversationId, lastSequenceNumber: BigInt(1) },
      });
      expect(result).toBe(BigInt(4));
    });
  });

  describe('reserveSequenceNumbers', () => {
    it('should reserve multiple sequence numbers', async () => {
      const conversationId = 'conv-1';
      const count = 3;
      
      redisService.incr = jest.fn()
        .mockResolvedValueOnce(5)
        .mockResolvedValueOnce(6)
        .mockResolvedValueOnce(7);

      const result = await service.reserveSequenceNumbers(conversationId, count);

      expect(redisService.incr).toHaveBeenCalledTimes(count);
      expect(result).toEqual([BigInt(5), BigInt(6), BigInt(7)]);
    });

    it('should handle partial Redis failures in batch reservation', async () => {
      const conversationId = 'conv-1';
      const count = 2;
      
      redisService.incr = jest.fn()
        .mockResolvedValueOnce(5)
        .mockRejectedValueOnce(new Error('Redis error'));

      prismaService.conversationState = {
        upsert: jest.fn().mockResolvedValue({
          lastSequenceNumber: BigInt(6),
        }),
      };

      const result = await service.reserveSequenceNumbers(conversationId, count);

      expect(result).toEqual([BigInt(5), BigInt(6)]);
    });
  });

  describe('getCurrentSequence', () => {
    it('should get current sequence from Redis', async () => {
      const conversationId = 'conv-1';
      redisService.get = jest.fn().mockResolvedValue('10');

      const result = await service.getCurrentSequence(conversationId);

      expect(redisService.get).toHaveBeenCalledWith(`seq:${conversationId}`);
      expect(result).toBe(BigInt(10));
    });

    it('should fallback to database when Redis returns null', async () => {
      const conversationId = 'conv-1';
      redisService.get = jest.fn().mockResolvedValue(null);
      
      prismaService.conversationState = {
        findUnique: jest.fn().mockResolvedValue({
          lastSequenceNumber: BigInt(5),
        }),
      };

      const result = await service.getCurrentSequence(conversationId);

      expect(prismaService.conversationState.findUnique).toHaveBeenCalledWith({
        where: { conversationId },
      });
      expect(result).toBe(BigInt(5));
    });

    it('should return 0 when no sequence exists', async () => {
      const conversationId = 'conv-1';
      redisService.get = jest.fn().mockResolvedValue(null);
      prismaService.conversationState = {
        findUnique: jest.fn().mockResolvedValue(null),
      };

      const result = await service.getCurrentSequence(conversationId);

      expect(result).toBe(BigInt(0));
    });
  });

  describe('validateSequenceOrder', () => {
    it('should validate correct sequence order', async () => {
      const conversationId = 'conv-1';
      const sequenceNumber = BigInt(5);
      
      redisService.get = jest.fn().mockResolvedValue('4');

      const result = await service.validateSequenceOrder(conversationId, sequenceNumber);

      expect(result).toBe(true);
    });

    it('should reject out-of-order sequence', async () => {
      const conversationId = 'conv-1';
      const sequenceNumber = BigInt(3);
      
      redisService.get = jest.fn().mockResolvedValue('5');

      const result = await service.validateSequenceOrder(conversationId, sequenceNumber);

      expect(result).toBe(false);
    });

    it('should handle missing current sequence', async () => {
      const conversationId = 'conv-1';
      const sequenceNumber = BigInt(1);
      
      redisService.get = jest.fn().mockResolvedValue(null);
      prismaService.conversationState = {
        findUnique: jest.fn().mockResolvedValue(null),
      };

      const result = await service.validateSequenceOrder(conversationId, sequenceNumber);

      expect(result).toBe(true);
    });
  });
});
