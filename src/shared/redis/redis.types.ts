import type { TlsOptions } from 'tls';

export interface RedisPoolOptions {
  min?: number; // default 0
  max?: number; // e.g. 5–20 (đừng quá cao)
  idleTimeoutMillis?: number; // default 30000
}

export interface CircuitBreakerOptions {
  timeout?: number; // ms cho 1 op, vd 1500
  errorThresholdPercentage?: number; // % lỗi để "open", vd 50
  resetTimeout?: number; // ms để thử "half-open", vd 10000
}

export interface RedisModuleOptions {
  host: string;
  port: number;
  db?: number;
  password?: string;
  keyPrefix?: string;
  enableAutoPipelining?: boolean; // ioredis feature
  tls?: boolean | TlsOptions;
  pool?: RedisPoolOptions; // bật pool nếu cần
  circuitBreaker?: CircuitBreakerOptions;
  maxRetriesPerRequest?: number; // ioredis
  reconnectOnErrorCodes?: string[]; // mặc định vài lỗi phổ biến
}
