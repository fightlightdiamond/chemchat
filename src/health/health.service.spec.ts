import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { HealthService, HealthCheckResult } from './health.service';
import { PrismaService } from '../shared/infrastructure/prisma/prisma.service';
import { RedisService } from '../shared/redis/redis.service';

describe('HealthService', () => {
  let service: HealthService;
  let prismaService: jest.Mocked<PrismaService>;
  let redisService: jest.Mocked<RedisService>;

  const mockPrismaService = {
    $queryRaw: jest.fn(),
  };

  const mockRedisService = {
    exec: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
      ],
    }).compile();

    service = module.get<HealthService>(HealthService);
    prismaService = module.get(PrismaService);
    redisService = module.get(RedisService);

    // Mock logger to avoid console output during tests
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('check', () => {
    it('should return healthy status when all services are healthy', async () => {
      // Arrange
      prismaService.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
      redisService.exec.mockResolvedValue('PONG');

      // Act
      const result = await service.check();

      // Assert
      expect(result.status).toBe('ok');
      expect(result.services.database).toBe('healthy');
      expect(result.services.redis).toBe('healthy');
      expect(result.timestamp).toBeDefined();
      expect(result.uptime).toBeGreaterThan(0);
      expect(result.version).toBeDefined();
      expect(result.environment).toBeDefined();
    });

    it('should return error status when database is unhealthy', async () => {
      // Arrange
      prismaService.$queryRaw.mockRejectedValue(
        new Error('Database connection failed'),
      );
      redisService.exec.mockResolvedValue('PONG');

      // Act
      const result = await service.check();

      // Assert
      expect(result.status).toBe('error');
      expect(result.services.database).toBe('unhealthy');
      expect(result.services.redis).toBe('healthy');
    });

    it('should return error status when Redis is unhealthy', async () => {
      // Arrange
      prismaService.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
      redisService.exec.mockRejectedValue(new Error('Redis connection failed'));

      // Act
      const result = await service.check();

      // Assert
      expect(result.status).toBe('error');
      expect(result.services.database).toBe('healthy');
      expect(result.services.redis).toBe('unhealthy');
    });

    it('should return error status when both services are unhealthy', async () => {
      // Arrange
      prismaService.$queryRaw.mockRejectedValue(new Error('Database failed'));
      redisService.exec.mockRejectedValue(new Error('Redis failed'));

      // Act
      const result = await service.check();

      // Assert
      expect(result.status).toBe('error');
      expect(result.services.database).toBe('unhealthy');
      expect(result.services.redis).toBe('unhealthy');
    });

    it('should include correct metadata in response', async () => {
      // Arrange
      const originalEnv = process.env.NODE_ENV;
      const originalVersion = process.env.npm_package_version;

      process.env.NODE_ENV = 'test';
      process.env.npm_package_version = '1.2.3';

      prismaService.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
      redisService.exec.mockResolvedValue('PONG');

      // Act
      const result = await service.check();

      // Assert
      expect(result.environment).toBe('test');
      expect(result.version).toBe('1.2.3');
      expect(typeof result.timestamp).toBe('string');
      expect(typeof result.uptime).toBe('number');

      // Cleanup
      process.env.NODE_ENV = originalEnv;
      process.env.npm_package_version = originalVersion;
    });
  });

  describe('readiness', () => {
    it('should return ready when all services are healthy', async () => {
      // Arrange
      prismaService.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
      redisService.exec.mockResolvedValue('PONG');

      // Act
      const result = await service.readiness();

      // Assert
      expect(result.status).toBe('ready');
      expect(result.ready).toBe(true);
    });

    it('should return not ready when database is unhealthy', async () => {
      // Arrange
      prismaService.$queryRaw.mockRejectedValue(new Error('Database failed'));
      redisService.exec.mockResolvedValue('PONG');

      // Act
      const result = await service.readiness();

      // Assert
      expect(result.status).toBe('not ready');
      expect(result.ready).toBe(false);
    });

    it('should return not ready when Redis is unhealthy', async () => {
      // Arrange
      prismaService.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
      redisService.exec.mockRejectedValue(new Error('Redis failed'));

      // Act
      const result = await service.readiness();

      // Assert
      expect(result.status).toBe('not ready');
      expect(result.ready).toBe(false);
    });

    it('should handle unexpected errors gracefully', async () => {
      // Arrange
      prismaService.$queryRaw.mockImplementation(() => {
        throw new Error('Unexpected error');
      });

      // Act
      const result = await service.readiness();

      // Assert
      expect(result.status).toBe('not ready');
      expect(result.ready).toBe(false);
    });
  });

  describe('liveness', () => {
    it('should always return alive', () => {
      // Act
      const result = service.liveness();

      // Assert
      expect(result.status).toBe('alive');
      expect(result.alive).toBe(true);
    });
  });

  describe('checkDatabase', () => {
    it('should return healthy when database query succeeds', async () => {
      // Arrange
      prismaService.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);

      // Act
      const result = await (service as any).checkDatabase();

      // Assert
      expect(result).toBe('healthy');
      expect(prismaService.$queryRaw).toHaveBeenCalledWith(expect.anything());
    });

    it('should return unhealthy when database query fails', async () => {
      // Arrange
      prismaService.$queryRaw.mockRejectedValue(
        new Error('Connection timeout'),
      );

      // Act
      const result = await (service as any).checkDatabase();

      // Assert
      expect(result).toBe('unhealthy');
    });
  });

  describe('checkRedis', () => {
    it('should return healthy when Redis ping succeeds', async () => {
      // Arrange
      redisService.exec.mockResolvedValue('PONG');

      // Act
      const result = await (service as any).checkRedis();

      // Assert
      expect(result).toBe('healthy');
      expect(redisService.exec).toHaveBeenCalledWith(expect.any(Function));
    });

    it('should return unhealthy when Redis ping fails', async () => {
      // Arrange
      redisService.exec.mockRejectedValue(new Error('Connection refused'));

      // Act
      const result = await (service as any).checkRedis();

      // Assert
      expect(result).toBe('unhealthy');
    });
  });
});
