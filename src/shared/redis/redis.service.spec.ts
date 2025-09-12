import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { RedisService } from './redis.service';

// Mock ioredis
const mockRedisClient = {
  ping: jest.fn(),
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  exists: jest.fn(),
  incr: jest.fn(),
  setex: jest.fn(),
  expire: jest.fn(),
  ttl: jest.fn(),
  keys: jest.fn(),
  flushall: jest.fn(),
  disconnect: jest.fn(),
  quit: jest.fn(),
  on: jest.fn(),
  off: jest.fn(),
  connect: jest.fn(),
  status: 'ready',
};

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => mockRedisClient);
});

// Mock prom-client to avoid registration conflicts
jest.mock('prom-client', () => ({
  Histogram: jest.fn().mockImplementation(() => ({
    observe: jest.fn(),
    startTimer: jest.fn().mockReturnValue(() => {}),
  })),
  register: {
    clear: jest.fn(),
  },
}));

describe('RedisService', () => {
  let service: RedisService;
  let module: TestingModule;
  let mockLogger: Logger;

  beforeEach(async () => {
    // Reset all mocks
    jest.clearAllMocks();

    // Mock the logger
    mockLogger = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      verbose: jest.fn(),
    } as any;

    module = await Test.createTestingModule({
      providers: [
        RedisService,
        {
          provide: Logger,
          useValue: mockLogger,
        },
      ],
    }).compile();

    service = module.get<RedisService>(RedisService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('exec', () => {
    it('should execute Redis operations through circuit breaker', async () => {
      // Arrange
      const testResult = 'test-result';
      mockPool.acquire.mockResolvedValue(mockRedisClient);
      mockCircuitBreaker.fire.mockResolvedValue(testResult);

      const operation = jest.fn().mockResolvedValue(testResult);

      // Act
      const result = await service.exec(operation);

      // Assert
      expect(result).toBe(testResult);
      expect(mockPool.acquire).toHaveBeenCalled();
      expect(mockCircuitBreaker.fire).toHaveBeenCalledWith(
        operation,
        mockRedisClient,
      );
      expect(mockPool.release).toHaveBeenCalledWith(mockRedisClient);
    });

    it('should handle circuit breaker failures', async () => {
      // Arrange
      const error = new Error('Circuit breaker open');
      mockPool.acquire.mockResolvedValue(mockRedisClient);
      mockCircuitBreaker.fire.mockRejectedValue(error);

      const operation = jest.fn();

      // Act & Assert
      await expect(service.exec(operation)).rejects.toThrow(
        'Circuit breaker open',
      );
      expect(mockPool.release).toHaveBeenCalledWith(mockRedisClient);
    });

    it('should handle pool acquisition failures', async () => {
      // Arrange
      const error = new Error('Pool exhausted');
      mockPool.acquire.mockRejectedValue(error);

      const operation = jest.fn();

      // Act & Assert
      await expect(service.exec(operation)).rejects.toThrow('Pool exhausted');
      expect(mockPool.release).not.toHaveBeenCalled();
    });

    it('should release client even when operation throws', async () => {
      // Arrange
      const error = new Error('Operation failed');
      mockPool.acquire.mockResolvedValue(mockRedisClient);
      mockCircuitBreaker.fire.mockRejectedValue(error);

      const operation = jest.fn();

      // Act & Assert
      await expect(service.exec(operation)).rejects.toThrow('Operation failed');
      expect(mockPool.release).toHaveBeenCalledWith(mockRedisClient);
    });
  });

  describe('getHealthMetrics', () => {
    it('should return health metrics', async () => {
      // Arrange
      mockPool.acquire.mockResolvedValue(mockRedisClient);
      mockRedisClient.ping.mockResolvedValue('PONG');
      mockCircuitBreaker.fire.mockResolvedValue('PONG');

      // Act
      const metrics = await service.getHealthMetrics();

      // Assert
      expect(metrics).toEqual({
        status: 'healthy',
        latency: expect.any(Number),
        circuitBreakerStats: mockCircuitBreaker.stats,
        poolStats: {
          size: expect.any(Number),
          available: expect.any(Number),
          borrowed: expect.any(Number),
          invalid: expect.any(Number),
          pending: expect.any(Number),
        },
      });
    });

    it('should return unhealthy status when ping fails', async () => {
      // Arrange
      const error = new Error('Connection failed');
      mockRedisClient.ping.mockRejectedValue(error);
      mockCircuitBreaker.fire.mockRejectedValue(error);

      // Act
      const metrics = await service.getHealthMetrics();

      // Assert
      expect(metrics.status).toBe('unhealthy');
      expect(metrics.latency).toBeGreaterThanOrEqual(0);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Redis health check failed',
        error,
      );
    });
  });

  describe('onModuleDestroy', () => {
    it('should cleanup resources on module destroy', async () => {
      // Arrange
      mockPool.drain.mockResolvedValue(undefined);
      mockPool.clear.mockResolvedValue(undefined);

      // Act
      await service.onModuleDestroy();

      // Assert
      expect(mockPool.drain).toHaveBeenCalled();
      expect(mockPool.clear).toHaveBeenCalled();
      expect(mockRedisClient.quit).toHaveBeenCalled();
    });

    it('should handle cleanup errors gracefully', async () => {
      // Arrange
      mockPool.drain.mockRejectedValue(new Error('Drain failed'));
      mockPool.clear.mockRejectedValue(new Error('Clear failed'));

      // Act & Assert
      await expect(service.onModuleDestroy()).resolves.not.toThrow();
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error during Redis cleanup',
        expect.any(Error),
      );
    });
  });

  describe('circuit breaker integration', () => {
    it('should configure circuit breaker with correct options', () => {
      // The circuit breaker should be configured during service initialization
      expect(mockCircuitBreaker.on).toHaveBeenCalledWith(
        'open',
        expect.any(Function),
      );
      expect(mockCircuitBreaker.on).toHaveBeenCalledWith(
        'halfOpen',
        expect.any(Function),
      );
      expect(mockCircuitBreaker.on).toHaveBeenCalledWith(
        'close',
        expect.any(Function),
      );
    });
  });

  describe('connection pool integration', () => {
    it('should create pool with correct configuration', () => {
      // Pool should be created with the provided options
      const genericPool = await import('generic-pool');
      expect(genericPool.createPool).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.any(Function),
          destroy: expect.any(Function),
          validate: expect.any(Function),
        }),
        expect.objectContaining({
          min: redisOptions.pool?.min,
          max: redisOptions.pool?.max,
          idleTimeoutMillis: redisOptions.pool?.idleTimeoutMillis,
        }),
      );
    });
  });

  describe('error handling', () => {
    it('should handle Redis connection errors', async () => {
      // Arrange
      const connectionError = new Error('ECONNREFUSED');
      mockPool.acquire.mockRejectedValue(connectionError);

      const operation = jest.fn();

      // Act & Assert
      await expect(service.exec(operation)).rejects.toThrow('ECONNREFUSED');
    });

    it('should handle timeout errors', async () => {
      // Arrange
      const timeoutError = new Error('Operation timeout');
      mockPool.acquire.mockResolvedValue(mockRedisClient);
      mockCircuitBreaker.fire.mockRejectedValue(timeoutError);

      const operation = jest.fn();

      // Act & Assert
      await expect(service.exec(operation)).rejects.toThrow(
        'Operation timeout',
      );
    });
  });

  describe('metrics collection', () => {
    it('should track operation metrics', async () => {
      // Arrange
      mockPool.acquire.mockResolvedValue(mockRedisClient);
      mockCircuitBreaker.fire.mockResolvedValue('success');

      const operation = jest.fn().mockResolvedValue('success');

      // Act
      await service.exec(operation);

      // Assert
      expect(mockCircuitBreaker.fire).toHaveBeenCalled();
      // Metrics should be collected through the circuit breaker
    });
  });
});
