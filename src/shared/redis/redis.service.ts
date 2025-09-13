import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis, { Redis as RedisClient, RedisOptions } from 'ioredis';
import * as genericPool from 'generic-pool';
import { REDIS_OPTIONS } from './redis.constants';
import { RedisModuleOptions } from './redis.types';
import * as prom from 'prom-client';
import SafeCircuitBreaker from './circuit-breaker-wrapper';

type Pool<T> = genericPool.Pool<T>;

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);

  private base!: RedisClient; // client chính (publisher/query)
  private subscriber!: RedisClient; // client cho Pub/Sub (tách riêng)
  private pool?: Pool<RedisClient>; // pool các conn phụ (optional)
  private breaker!: SafeCircuitBreaker<unknown>;

  // metrics
  private readonly histLatency = new prom.Histogram({
    name: 'redis_command_latency_ms',
    help: 'Latency of Redis exec operation',
    buckets: [5, 10, 20, 50, 100, 200, 400, 800, 1600],
  });
  private readonly counterErrors = new prom.Counter({
    name: 'redis_errors_total',
    help: 'Total Redis errors',
  });

  constructor(
    @Inject(REDIS_OPTIONS) private readonly opts: RedisModuleOptions,
  ) {
    const ioredisOpts: RedisOptions = {
      host: opts.host,
      port: opts.port,
      db: opts.db ?? 0,
      password: opts.password,
      keyPrefix: opts.keyPrefix,
      enableAutoPipelining: opts.enableAutoPipelining ?? true,
      maxRetriesPerRequest: opts.maxRetriesPerRequest ?? 3,
      // Handle TLS options with proper type safety
      tls: opts.tls
        ? (() => {
            const tlsOptions =
              typeof opts.tls === 'boolean'
                ? { rejectUnauthorized: true }
                : { ...opts.tls, rejectUnauthorized: true };
            // We need to use a type assertion here due to differences between ioredis and Node.js TLS types
            return tlsOptions as unknown as RedisOptions['tls'];
          })()
        : undefined,
      // backoff tăng dần
      retryStrategy: (retries: number) => Math.min(1000 + retries * 200, 5000),
      // reconnect khi gặp một số lỗi TCP/cluster
      reconnectOnError: (err: Error) => {
        const codes = opts.reconnectOnErrorCodes ?? [
          'READONLY',
          'ECONNRESET',
          'ETIMEDOUT',
        ];
        return codes.some((code) => (err.message || '').includes(code));
      },
    };

    // tạo base + subscriber (duplicate để tái dùng config)
    this.base = new Redis(ioredisOpts);
    this.subscriber = this.base.duplicate();

    this.base.on('error', (e: Error) => {
      this.counterErrors.inc();
      this.logger.error('Redis base error', e.stack);
    });
    this.subscriber.on('error', (e: Error) => {
      this.counterErrors.inc();
      this.logger.error('Redis subscriber error', e.stack);
    });

    this.base.on('connect', () => this.logger.log('Redis base connected'));
    this.subscriber.on('connect', () =>
      this.logger.log('Redis subscriber connected'),
    );

    // optional: pool (dùng duplicate cho nhẹ)
    if (opts.pool?.max && opts.pool.max > 0) {
      const factory: genericPool.Factory<RedisClient> = {
        create: async () => {
          const c = this.base.duplicate();
          await c.ping();
          return c;
        },
        destroy: async (client) => {
          await client.quit();
        },
        validate: async (client) => {
          try {
            await client.ping();
            return true;
          } catch {
            return false;
          }
        },
      };
      this.pool = genericPool.createPool(factory, {
        min: opts.pool.min ?? 0,
        max: opts.pool.max,
        idleTimeoutMillis: opts.pool.idleTimeoutMillis ?? 30000,
      });
    }

    // Initialize the circuit breaker with proper error handling
    try {
      // Create a type-safe wrapper for the circuit breaker
      const breaker = new SafeCircuitBreaker<unknown>(
        async (operation) => {
          const client = await this.acquire();
          const end = this.histLatency.startTimer();
          try {
            const result = await operation(client);
            end();
            return result;
          } catch (e) {
            end();
            this.counterErrors.inc();

            throw e;
          } finally {
            await this.release(client);
          }
        },
        {
          timeout: opts.circuitBreaker?.timeout ?? 1500,
          errorThresholdPercentage:
            opts.circuitBreaker?.errorThresholdPercentage ?? 50,
          resetTimeout: opts.circuitBreaker?.resetTimeout ?? 10000,
        },
      );

      // Set up event listeners with proper chaining and formatting
      breaker
        .on('open', () => this.logger.warn('Redis circuit OPEN'))
        .on('halfOpen', () => {
          this.logger.warn('Redis circuit HALF-OPEN');
        })
        .on('close', () => this.logger.log('Redis circuit CLOSED'));

      this.breaker = breaker;
    } catch (error) {
      this.logger.error('Failed to initialize circuit breaker', error);
      throw new Error('Failed to initialize circuit breaker');
    }
  }

  // ===== Acquire/Release (pool nếu có, không thì dùng base) =====
  private async acquire(): Promise<RedisClient> {
    if (this.pool) return this.pool.acquire();
    return this.base;
  }
  private async release(client: RedisClient): Promise<void> {
    if (this.pool && client !== this.base) {
      await this.pool.release(client);
    }
  }

  // ===== API công dụng chung =====
  /** Thực thi 1 hàm với client (được bảo vệ bởi circuit breaker) */
  async exec<T>(
    fn: (client: RedisClient) => Promise<T>,
    clientType: 'base' | 'subscriber' = 'base',
  ): Promise<T> {
    if (!this.breaker) {
      throw new Error('Circuit breaker not initialized');
    }

    try {
      const result = await this.breaker.fire(async (client: RedisClient) => {
        const targetClient =
          clientType === 'subscriber' ? this.subscriber : client;
        return await fn(targetClient);
      });
      return result as T;
    } catch (error) {
      this.logger.error('Circuit breaker execution failed', error);
      throw error;
    }
  }

  /** Publish tiện lợi */
  async publish(channel: string, payload: unknown): Promise<number> {
    return this.exec((c) => c.publish(channel, JSON.stringify(payload)));
  }

  /** Subscribe tiện lợi */
  async subscribe(
    channel: string,
    onMessage: (message: string, channel: string) => void,
  ): Promise<void> {
    await this.subscriber.subscribe(channel);
    this.subscriber.on('message', (ch: string, msg: string) =>
      onMessage(msg, ch),
    );
  }

  /** Unsubscribe */
  async unsubscribe(channel: string): Promise<void> {
    await this.subscriber.unsubscribe(channel);
  }

  /** Lấy client base nếu thật sự cần dùng API thấp */
  getClient(): RedisClient {
    return this.base;
  }
  /** Lấy client subscriber (đã kết nối) */
  getSubscriber(): RedisClient {
    return this.subscriber;
  }

  /** Scan theo pattern (tránh KEYS) */
  async scanKeys(pattern: string, count = 200): Promise<string[]> {
    return this.exec(async (c) => {
      const out: string[] = [];
      let cursor = '0';
      do {
        const [next, keys] = await c.scan(
          cursor,
          'MATCH',
          pattern,
          'COUNT',
          count,
        );
        out.push(...keys);
        cursor = next;
      } while (cursor !== '0');
      return out;
    });
  }

  // ===== Common Redis Commands =====
  /** Get a value by key */
  async get(key: string): Promise<string | null> {
    return this.exec(async (client) => client.get(key));
  }

  /** Set a value with expiration */
  async setex(key: string, seconds: number, value: string): Promise<string> {
    return this.exec(async (client) => client.setex(key, seconds, value));
  }

  /** Delete keys */
  async del(...keys: string[]): Promise<number> {
    return this.exec(async (client) => client.del(...keys));
  }

  /** Push to list (left) */
  async lpush(key: string, ...values: string[]): Promise<number> {
    return this.exec(async (client) => client.lpush(key, ...values));
  }

  /** Get range from list */
  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    return this.exec(async (client) => client.lrange(key, start, stop));
  }

  /** Trim list */
  async ltrim(key: string, start: number, stop: number): Promise<string> {
    return this.exec(async (client) => client.ltrim(key, start, stop));
  }

  /** Add to set */
  async sadd(key: string, ...members: string[]): Promise<number> {
    return this.exec(async (client) => client.sadd(key, ...members));
  }

  /** Set expiration */
  async expire(key: string, seconds: number): Promise<number> {
    return this.exec(async (client) => client.expire(key, seconds));
  }

  /** Increment by value */
  async incrby(key: string, increment: number): Promise<number> {
    return this.exec(async (client) => client.incrby(key, increment));
  }

  /** Health check + basic stats */
  async health(): Promise<{
    ok: boolean;
    latencyMs: number;
    role?: string;
    usedMemoryBytes?: number;
  }> {
    const start = Date.now();
    try {
      await this.base.ping();
      const info = await this.base.info('server', 'memory');
      const latencyMs = Date.now() - start;

      const roleMatch = info.match(/role:(\w+)/);
      const memMatch = info.match(/used_memory:(\d+)/);

      return {
        ok: true,
        latencyMs,
        role: roleMatch?.[1],
        usedMemoryBytes: memMatch ? Number(memMatch[1]) : undefined,
      };
    } catch {
      return { ok: false, latencyMs: -1 };
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      if (this.pool) await this.pool.drain().then(() => this.pool?.clear());
      await Promise.allSettled([this.subscriber.quit(), this.base.quit()]);
    } catch (e) {
      this.logger.error('Error closing Redis', (e as Error)?.stack);
    }
  }
}
