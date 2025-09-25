import 'jest-extended';

// Global test setup
// Set test environment variables early (before any imports)
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://chemchat:chemchat123@localhost:5432/chemchat_test';
process.env.REDIS_URL = process.env.TEST_REDIS_URL || 'redis://localhost:6379/1';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.JWT_EXPIRES_IN = '1h';

// Global test timeout
jest.setTimeout(60000);
