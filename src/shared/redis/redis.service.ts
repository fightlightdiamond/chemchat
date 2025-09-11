import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis, { Redis as RedisClient, RedisOptions } from 'ioredis';
import * as genericPool from 'generic-pool';
import CircuitBreaker from 'opossum';
import { REDIS_OPTIONS } from './redis.constants';
import { RedisModuleOptions } from './redis.types';
import * as prom from 'prom-client';

type Pool<T> = genericPool.Pool<T>;

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);

  private base!: RedisClient; // client chính (publisher/query)
  private subscriber!: RedisClient; // client cho Pub/Sub (tách riêng)
  private pool?: Pool<RedisClient>; // pool các conn phụ (optional)
  private breaker!: CircuitBreaker<
    [(c: RedisClient) => Promise<unknown>],
    unknown
  >;

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
      tls: opts.tls as any,
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

    // circuit breaker bao quanh mọi exec operation
    this.breaker = new CircuitBreaker(
      async (operation: (c: RedisClient) => Promise<unknown>) => {
        const client = await this.acquire();
        const end = this.histLatency.startTimer();
        try {
          const res = await operation(client);
          end();
          return res;
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

    this.breaker.on('open', () => this.logger.warn('Redis circuit OPEN'));
    this.breaker.on('halfOpen', () =>
      this.logger.warn('Redis circuit HALF-OPEN'),
    );
    this.breaker.on('close', () => this.logger.log('Redis circuit CLOSED'));
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
  async exec<T>(fn: (client: RedisClient) => Promise<T>): Promise<T> {
    return this.breaker.fire(fn) as Promise<T>;
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
