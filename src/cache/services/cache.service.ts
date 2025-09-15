import { Injectable, Inject, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { RedisService } from '../../shared/redis/redis.service';
import { CacheMetricsService } from './cache-metrics.service';

export interface CacheOptions {
  ttl?: number;
  tags?: string[];
  namespace?: string;
}

export interface CacheKey {
  key: string;
  namespace?: string;
  tags?: string[];
}

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);

  constructor(
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private redisService: RedisService,
    private metricsService: CacheMetricsService,
  ) {}

  /**
   * Get value from cache with metrics tracking
   */
  async get<T>(key: string, options?: CacheOptions): Promise<T | null> {
    const fullKey = this.buildKey(key, options?.namespace);
    const startTime = Date.now();

    try {
      const value = await this.cacheManager.get<T>(fullKey);
      const duration = Date.now() - startTime;

      if (value !== null && value !== undefined) {
        this.metricsService.recordCacheHit(fullKey, duration);
        this.logger.debug(`Cache HIT for key: ${fullKey}`);
        return value;
      } else {
        this.metricsService.recordCacheMiss(fullKey, duration);
        this.logger.debug(`Cache MISS for key: ${fullKey}`);
        return null;
      }
    } catch (error) {
      this.metricsService.recordCacheError(fullKey, error);
      this.logger.error(`Cache GET error for key ${fullKey}:`, error);
      return null;
    }
  }

  /**
   * Set value in cache with optional TTL and tags
   */
  async set<T>(
    key: string,
    value: T,
    options?: CacheOptions,
  ): Promise<void> {
    const fullKey = this.buildKey(key, options?.namespace);
    const ttl = options?.ttl || 300; // 5 minutes default

    try {
      await this.cacheManager.set(fullKey, value, ttl * 1000);
      
      // Store tags for invalidation if provided
      if (options?.tags && options.tags.length > 0) {
        await this.storeTags(fullKey, options.tags);
      }

      this.metricsService.recordCacheSet(fullKey);
      this.logger.debug(`Cache SET for key: ${fullKey}, TTL: ${ttl}s`);
    } catch (error) {
      this.metricsService.recordCacheError(fullKey, error);
      this.logger.error(`Cache SET error for key ${fullKey}:`, error);
      throw error;
    }
  }

  /**
   * Delete value from cache
   */
  async del(key: string, namespace?: string): Promise<void> {
    const fullKey = this.buildKey(key, namespace);

    try {
      await this.cacheManager.del(fullKey);
      await this.removeTags(fullKey);
      this.metricsService.recordCacheDelete(fullKey);
      this.logger.debug(`Cache DELETE for key: ${fullKey}`);
    } catch (error) {
      this.metricsService.recordCacheError(fullKey, error);
      this.logger.error(`Cache DELETE error for key ${fullKey}:`, error);
      throw error;
    }
  }

  /**
   * Get or set pattern - fetch from cache or execute function and cache result
   */
  async getOrSet<T>(
    key: string,
    fetchFn: () => Promise<T>,
    options?: CacheOptions,
  ): Promise<T> {
    const cached = await this.get<T>(key, options);
    
    if (cached !== null) {
      return cached;
    }

    const value = await fetchFn();
    await this.set(key, value, options);
    return value;
  }

  /**
   * Get multiple keys at once
   */
  async mget<T>(keys: string[], namespace?: string): Promise<(T | null)[]> {
    const fullKeys = keys.map(key => this.buildKey(key, namespace));
    const startTime = Date.now();

    try {
      const values = await Promise.all(
        fullKeys.map(key => this.cacheManager.get<T>(key))
      );

      const duration = Date.now() - startTime;
      values.forEach((value, index) => {
        if (value !== null && value !== undefined) {
          this.metricsService.recordCacheHit(fullKeys[index], duration);
        } else {
          this.metricsService.recordCacheMiss(fullKeys[index], duration);
        }
      });

      return values.map(value => value || null);
    } catch (error) {
      fullKeys.forEach(key => {
        this.metricsService.recordCacheError(key, error);
      });
      this.logger.error(`Cache MGET error for keys ${fullKeys.join(', ')}:`, error);
      return keys.map(() => null);
    }
  }

  /**
   * Set multiple key-value pairs at once
   */
  async mset<T>(
    items: Array<{ key: string; value: T; options?: CacheOptions }>,
    namespace?: string,
  ): Promise<void> {
    try {
      await Promise.all(
        items.map(item => 
          this.set(item.key, item.value, {
            ...item.options,
            namespace: namespace || item.options?.namespace,
          })
        )
      );
    } catch (error) {
      this.logger.error('Cache MSET error:', error);
      throw error;
    }
  }

  /**
   * Invalidate cache by tags
   */
  async invalidateByTags(tags: string[]): Promise<void> {
    try {
      const keysToDelete: string[] = [];

      for (const tag of tags) {
        const tagKey = this.buildTagKey(tag);
        const keys = await this.redisService.exec((client) => client.smembers(tagKey));
        
        if (Array.isArray(keys)) {
          keysToDelete.push(...keys);
        }
      }

      if (keysToDelete.length > 0) {
        await Promise.all([
          ...keysToDelete.map(key => this.cacheManager.del(key)),
          ...tags.map(tag => this.redisService.exec((client) => client.del(this.buildTagKey(tag)))),
        ]);

        this.logger.debug(`Invalidated ${keysToDelete.length} cache entries for tags: ${tags.join(', ')}`);
      }
    } catch (error) {
      this.logger.error(`Cache invalidation error for tags ${tags.join(', ')}:`, error);
      throw error;
    }
  }

  /**
   * Clear all cache entries (use with caution)
   */
  async clear(): Promise<void> {
    try {
      // Clear all cache entries - cache-manager doesn't have reset method
      // We'll implement a custom clear method
      await this.clearAllKeys();
      this.logger.warn('Cache cleared completely');
    } catch (error) {
      this.logger.error('Cache clear error:', error);
      throw error;
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{
    hits: number;
    misses: number;
    hitRate: number;
    totalKeys: number;
  }> {
    const stats = this.metricsService.getStats();
    const defaultStats = stats['default'] || { hits: 0, misses: 0, hitRate: 0, totalKeys: 0 };
    return {
      hits: defaultStats.hits,
      misses: defaultStats.misses,
      hitRate: defaultStats.hitRate,
      totalKeys: defaultStats.totalOperations || 0,
    };
  }

  /**
   * Warm up cache with predefined data
   */
  async warmup(items: Array<{ key: string; value: any; options?: CacheOptions }>): Promise<void> {
    this.logger.log(`Warming up cache with ${items.length} items`);
    
    try {
      await this.mset(items);
      this.logger.log('Cache warmup completed successfully');
    } catch (error) {
      this.logger.error('Cache warmup failed:', error);
      throw error;
    }
  }

  /**
   * Build full cache key with namespace
   */
  private buildKey(key: string, namespace?: string): string {
    return namespace ? `${namespace}:${key}` : key;
  }

  /**
   * Build tag key for tracking
   */
  private buildTagKey(tag: string): string {
    return `cache_tags:${tag}`;
  }

  /**
   * Store tags for a cache key
   */
  private async storeTags(key: string, tags: string[]): Promise<void> {
    try {
      await Promise.all(
        tags.map(tag => 
          this.redisService.exec((client) => client.sadd(this.buildTagKey(tag), key))
        )
      );
    } catch (error) {
      this.logger.error(`Error storing tags for key ${key}:`, error);
    }
  }

  /**
   * Clear all cache keys (internal method)
   */
  private async clearAllKeys(): Promise<void> {
    try {
      // Get all cache keys and delete them
      const keys = await this.redisService.exec((client) => client.keys('*'));
      if (Array.isArray(keys) && keys.length > 0) {
        await Promise.all(keys.map(key => this.cacheManager.del(key)));
      }
    } catch (error) {
      this.logger.error('Error clearing all cache keys:', error);
      throw error;
    }
  }

  /**
   * Remove tags for a cache key
   */
  private async removeTags(key: string): Promise<void> {
    try {
      // Find all tag sets that contain this key and remove it
      const tagPattern = this.buildTagKey('*');
      const tagKeys = await this.redisService.exec((client) => client.keys(tagPattern));
      
      if (Array.isArray(tagKeys)) {
        await Promise.all(
          tagKeys.map(tagKey => 
            this.redisService.exec((client) => client.srem(tagKey, key))
          )
        );
      }
    } catch (error) {
      this.logger.error(`Error removing tags for key ${key}:`, error);
    }
  }
}
