import { registerAs } from '@nestjs/config';

export default registerAs('database', () => ({
  url:
    process.env.DATABASE_URL ||
    'postgresql://username:password@localhost:5432/chatdb',

  // Connection pool configuration
  connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT || '10', 10),

  // Connection timeout settings
  connectTimeout: parseInt(process.env.DB_CONNECT_TIMEOUT || '60000', 10), // 60 seconds
  acquireTimeout: parseInt(process.env.DB_ACQUIRE_TIMEOUT || '60000', 10), // 60 seconds
  timeout: parseInt(process.env.DB_TIMEOUT || '5000', 10), // 5 seconds

  // Retry configuration
  retryAttempts: parseInt(process.env.DB_RETRY_ATTEMPTS || '3', 10),
  retryDelay: parseInt(process.env.DB_RETRY_DELAY || '1000', 10), // 1 second

  // Health check configuration
  healthCheckInterval: parseInt(
    process.env.DB_HEALTH_CHECK_INTERVAL || '30000',
    10,
  ), // 30 seconds

  // Logging configuration
  logQueries: process.env.NODE_ENV === 'development',
  logSlowQueries: true,
  slowQueryThreshold: parseInt(
    process.env.DB_SLOW_QUERY_THRESHOLD || '1000',
    10,
  ), // 1 second
}));
