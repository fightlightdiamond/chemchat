import { Injectable, Inject, Logger } from '@nestjs/common';
import Redis from 'ioredis';
// eslint-disable-next-line @typescript-eslint/no-require-imports
import CircuitBreaker = require('opossum');

@Injectable()
export class RedisService {
  private readonly logger = new Logger(RedisService.name);
  private circuitBreaker: CircuitBreaker<any, any>;

  constructor(@Inject('REDIS_CLIENT') private readonly redisClient: Redis) {
    // Set up circuit breaker for Redis operations
    this.circuitBreaker = new CircuitBreaker(
      async (command: string, ...args: any[]) => {
        try {
          const result = await (this.redisClient as any)[command](...args);
          return result;
        } catch (error) {
          this.logger.error(
            `Redis ${command} failed: ${error.message}`,
            error.stack,
          );
          throw error;
        }
      },
      {
        timeout: 5000, // 5 second timeout
        errorThresholdPercentage: 50, // Trip circuit if 50% of requests fail
        resetTimeout: 30000, // Wait 30 seconds before trying again
      },
    );

    // Circuit breaker event handlers
    // Note: fallback event not available in this version

    this.circuitBreaker.on('open', () =>
      this.logger.warn('Redis circuit breaker opened'),
    );
    this.circuitBreaker.on('halfOpen', () =>
      this.logger.warn('Redis circuit breaker half-open'),
    );
    this.circuitBreaker.on('close', () =>
      this.logger.warn('Redis circuit breaker closed'),
    );
  }

  // Basic Redis operations with circuit breaker
  async get(key: string): Promise<string | null> {
    return this.circuitBreaker.fire('get', key);
  }

  async set(
    key: string,
    value: string | number | Buffer,
    ttl?: number,
  ): Promise<'OK' | null> {
    if (ttl) {
      return this.circuitBreaker.fire('set', key, value, 'EX', ttl);
    }
    return this.circuitBreaker.fire('set', key, value);
  }

  async del(key: string): Promise<number> {
    return this.circuitBreaker.fire('del', key) || 0;
  }

  async expire(key: string, seconds: number): Promise<number> {
    const result = await this.circuitBreaker.fire('expire', key, seconds);
    return result ? 1 : 0;
  }

  // Sorted set operations
  async zadd(key: string, score: number, member: string): Promise<number> {
    return this.circuitBreaker.fire('zadd', key, score.toString(), member) || 0;
  }

  async zrange(
    key: string,
    start: number,
    stop: number,
    withScores = false,
  ): Promise<string[]> {
    if (withScores) {
      return (
        this.circuitBreaker.fire('zrange', key, start, stop, 'WITHSCORES') || []
      );
    }
    return this.circuitBreaker.fire('zrange', key, start, stop) || [];
  }

  async zremrangebyscore(
    key: string,
    min: number,
    max: number,
  ): Promise<number> {
    return this.circuitBreaker.fire('zremrangebyscore', key, min, max) || 0;
  }

  async zcount(key: string, min: number, max: number): Promise<number> {
    return this.circuitBreaker.fire('zcount', key, min, max) || 0;
  }

  // Set operations
  async sadd(key: string, ...members: string[]): Promise<number> {
    return this.circuitBreaker.fire('sadd', key, ...members) || 0;
  }

  async srem(key: string, ...members: string[]): Promise<number> {
    return this.circuitBreaker.fire('srem', key, ...members) || 0;
  }

  async smembers(key: string): Promise<string[]> {
    return this.circuitBreaker.fire('smembers', key) || [];
  }

  // Hash operations
  async hset(
    key: string,
    field: string,
    value: string | number,
  ): Promise<number> {
    return this.circuitBreaker.fire('hset', key, field, value) || 0;
  }

  async hget(key: string, field: string): Promise<string | null> {
    return this.circuitBreaker.fire('hget', key, field);
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    return this.circuitBreaker.fire('hgetall', key) || {};
  }

  // List operations
  async lpush(key: string, ...values: string[]): Promise<number> {
    return this.circuitBreaker.fire('lpush', key, ...values) || 0;
  }

  async rpop(key: string): Promise<string | null> {
    return this.circuitBreaker.fire('rpop', key);
  }

  // Key operations
  async exists(key: string): Promise<boolean> {
    return (await this.circuitBreaker.fire('exists', key)) === 1;
  }

  async ttl(key: string): Promise<number> {
    return (await this.circuitBreaker.fire('ttl', key)) || -2; // -2 means key doesn't exist
  }

  // Pub/Sub
  async publish(channel: string, message: string): Promise<number> {
    return this.circuitBreaker.fire('publish', channel, message) || 0;
  }

  // Additional Redis operations
  async setex(
    key: string,
    seconds: number,
    value: string,
  ): Promise<'OK' | null> {
    return this.circuitBreaker.fire('setex', key, seconds, value);
  }

  async incr(key: string): Promise<number> {
    return this.circuitBreaker.fire('incr', key) || 0;
  }

  async keys(pattern: string): Promise<string[]> {
    return this.circuitBreaker.fire('keys', pattern) || [];
  }

  async zcard(key: string): Promise<number> {
    return this.circuitBreaker.fire('zcard', key) || 0;
  }

  async lpop(key: string): Promise<string | null> {
    return this.circuitBreaker.fire('lpop', key);
  }

  async rpush(key: string, ...values: string[]): Promise<number> {
    return this.circuitBreaker.fire('rpush', key, ...values) || 0;
  }

  // Execute raw Redis commands
  async exec(command: string, ...args: any[]): Promise<any> {
    try {
      return await (this.redisClient as any)[command](...args);
    } catch (error) {
      this.logger.error(
        `Redis command ${command} failed: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  // Get the underlying Redis client (use with caution)
  getClient(): Redis {
    return this.redisClient;
  }
}
