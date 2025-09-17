import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export interface CacheOptions {
  ttl?: number; // Time to live in seconds
  prefix?: string;
  serialize?: boolean;
}

export interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  hitRate: number;
}

@Injectable()
export class RedisCacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisCacheService.name);
  private redis: Redis;
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    sets: 0,
    deletes: 0,
    hitRate: 0,
  };

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit(): Promise<void> {
    try {
      const redisConfig = {
        host: this.configService.get<string>('REDIS_HOST', 'localhost'),
        port: this.configService.get<number>('REDIS_PORT', 6379),
        password: this.configService.get<string>('REDIS_PASSWORD'),
        db: this.configService.get<number>('REDIS_DB', 0),
        retryDelayOnFailover: 100,
        maxRetriesPerRequest: 3,
        lazyConnect: true,
        keepAlive: 30000,
      };

      this.redis = new Redis(redisConfig);

      this.redis.on('connect', () => {
        this.logger.log('Connected to Redis');
      });

      this.redis.on('error', (error) => {
        this.logger.error('Redis connection error:', error);
      });

      this.redis.on('close', () => {
        this.logger.warn('Redis connection closed');
      });

      // Test connection
      await this.redis.ping();
      
      this.logger.log('Redis cache service initialized');
    } catch (error) {
      this.logger.error('Failed to initialize Redis cache service', error);
      throw error;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
      this.logger.log('Redis cache service disconnected');
    }
  }

  /**
   * Get value from cache
   */
  async get<T>(key: string, options: CacheOptions = {}): Promise<T | null> {
    try {
      const fullKey = this.buildKey(key, options.prefix);
      const value = await this.redis.get(fullKey);

      if (value === null) {
        this.stats.misses++;
        this.updateHitRate();
        return null;
      }

      this.stats.hits++;
      this.updateHitRate();

      if (options.serialize !== false) {
        return JSON.parse(value);
      }

      return value as T;
    } catch (error) {
      this.logger.error(`Failed to get cache key: ${key}`, error);
      this.stats.misses++;
      this.updateHitRate();
      return null;
    }
  }

  /**
   * Set value in cache
   */
  async set<T>(key: string, value: T, options: CacheOptions = {}): Promise<boolean> {
    try {
      const fullKey = this.buildKey(key, options.prefix);
      let serializedValue: string;

      if (options.serialize !== false) {
        serializedValue = JSON.stringify(value);
      } else {
        serializedValue = value as string;
      }

      if (options.ttl) {
        await this.redis.setex(fullKey, options.ttl, serializedValue);
      } else {
        await this.redis.set(fullKey, serializedValue);
      }

      this.stats.sets++;
      return true;
    } catch (error) {
      this.logger.error(`Failed to set cache key: ${key}`, error);
      return false;
    }
  }

  /**
   * Delete value from cache
   */
  async delete(key: string, options: CacheOptions = {}): Promise<boolean> {
    try {
      const fullKey = this.buildKey(key, options.prefix);
      const result = await this.redis.del(fullKey);
      
      this.stats.deletes++;
      return result > 0;
    } catch (error) {
      this.logger.error(`Failed to delete cache key: ${key}`, error);
      return false;
    }
  }

  /**
   * Check if key exists in cache
   */
  async exists(key: string, options: CacheOptions = {}): Promise<boolean> {
    try {
      const fullKey = this.buildKey(key, options.prefix);
      const result = await this.redis.exists(fullKey);
      return result === 1;
    } catch (error) {
      this.logger.error(`Failed to check cache key existence: ${key}`, error);
      return false;
    }
  }

  /**
   * Set expiration for key
   */
  async expire(key: string, ttl: number, options: CacheOptions = {}): Promise<boolean> {
    try {
      const fullKey = this.buildKey(key, options.prefix);
      const result = await this.redis.expire(fullKey, ttl);
      return result === 1;
    } catch (error) {
      this.logger.error(`Failed to set expiration for cache key: ${key}`, error);
      return false;
    }
  }

  /**
   * Get TTL for key
   */
  async ttl(key: string, options: CacheOptions = {}): Promise<number> {
    try {
      const fullKey = this.buildKey(key, options.prefix);
      return await this.redis.ttl(fullKey);
    } catch (error) {
      this.logger.error(`Failed to get TTL for cache key: ${key}`, error);
      return -1;
    }
  }

  /**
   * Increment numeric value
   */
  async increment(key: string, amount: number = 1, options: CacheOptions = {}): Promise<number> {
    try {
      const fullKey = this.buildKey(key, options.prefix);
      return await this.redis.incrby(fullKey, amount);
    } catch (error) {
      this.logger.error(`Failed to increment cache key: ${key}`, error);
      return 0;
    }
  }

  /**
   * Decrement numeric value
   */
  async decrement(key: string, amount: number = 1, options: CacheOptions = {}): Promise<number> {
    try {
      const fullKey = this.buildKey(key, options.prefix);
      return await this.redis.decrby(fullKey, amount);
    } catch (error) {
      this.logger.error(`Failed to decrement cache key: ${key}`, error);
      return 0;
    }
  }

  /**
   * Get multiple keys
   */
  async mget<T>(keys: string[], options: CacheOptions = {}): Promise<(T | null)[]> {
    try {
      const fullKeys = keys.map(key => this.buildKey(key, options.prefix));
      const values = await this.redis.mget(...fullKeys);

      return values.map(value => {
        if (value === null) {
          this.stats.misses++;
          return null;
        }

        this.stats.hits++;
        return options.serialize !== false ? JSON.parse(value) : value as T;
      });
    } catch (error) {
      this.logger.error('Failed to get multiple cache keys', error);
      return keys.map(() => null);
    } finally {
      this.updateHitRate();
    }
  }

  /**
   * Set multiple keys
   */
  async mset<T>(keyValuePairs: Record<string, T>, options: CacheOptions = {}): Promise<boolean> {
    try {
      const pipeline = this.redis.pipeline();
      
      for (const [key, value] of Object.entries(keyValuePairs)) {
        const fullKey = this.buildKey(key, options.prefix);
        let serializedValue: string;

        if (options.serialize !== false) {
          serializedValue = JSON.stringify(value);
        } else {
          serializedValue = value as string;
        }

        if (options.ttl) {
          pipeline.setex(fullKey, options.ttl, serializedValue);
        } else {
          pipeline.set(fullKey, serializedValue);
        }
      }

      await pipeline.exec();
      this.stats.sets += Object.keys(keyValuePairs).length;
      return true;
    } catch (error) {
      this.logger.error('Failed to set multiple cache keys', error);
      return false;
    }
  }

  /**
   * Delete multiple keys
   */
  async mdel(keys: string[], options: CacheOptions = {}): Promise<number> {
    try {
      const fullKeys = keys.map(key => this.buildKey(key, options.prefix));
      const result = await this.redis.del(...fullKeys);
      
      this.stats.deletes += result;
      return result;
    } catch (error) {
      this.logger.error('Failed to delete multiple cache keys', error);
      return 0;
    }
  }

  /**
   * Get keys matching pattern
   */
  async keys(pattern: string, options: CacheOptions = {}): Promise<string[]> {
    try {
      const fullPattern = this.buildKey(pattern, options.prefix);
      return await this.redis.keys(fullPattern);
    } catch (error) {
      this.logger.error(`Failed to get keys matching pattern: ${pattern}`, error);
      return [];
    }
  }

  /**
   * Clear all cache
   */
  async clear(): Promise<boolean> {
    try {
      await this.redis.flushdb();
      this.logger.log('Cache cleared successfully');
      return true;
    } catch (error) {
      this.logger.error('Failed to clear cache', error);
      return false;
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return { ...this.stats };
  }

  /**
   * Reset cache statistics
   */
  resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      hitRate: 0,
    };
  }

  /**
   * Get Redis info
   */
  async getInfo(): Promise<any> {
    try {
      return await this.redis.info();
    } catch (error) {
      this.logger.error('Failed to get Redis info', error);
      return null;
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{ status: string; responseTime: number }> {
    try {
      const startTime = Date.now();
      await this.redis.ping();
      const responseTime = Date.now() - startTime;

      return {
        status: 'healthy',
        responseTime,
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        responseTime: -1,
      };
    }
  }

  /**
   * Build cache key with prefix
   */
  private buildKey(key: string, prefix?: string): string {
    const defaultPrefix = this.configService.get<string>('REDIS_KEY_PREFIX', 'chat');
    const keyPrefix = prefix || defaultPrefix;
    return `${keyPrefix}:${key}`;
  }

  /**
   * Update hit rate
   */
  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 ? (this.stats.hits / total) * 100 : 0;
  }
}