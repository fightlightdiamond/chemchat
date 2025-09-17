# ChemChat Testing Documentation

This directory contains comprehensive testing infrastructure for the ChemChat real-time chat system.

## Test Structure

```
test/
├── e2e/                    # End-to-end tests
├── fixtures/               # Test data factories and fixtures
├── integration/            # Integration tests
├── load/                   # Load testing scripts (k6)
├── mocks/                  # Mock implementations
├── setup/                  # Test setup and configuration
└── websocket/              # WebSocket-specific tests
```

## Test Types

### 1. Unit Tests
Located in `src/**/*.spec.ts` files alongside the source code.

**Coverage:**
- Service layer business logic
- Command and query handlers
- Domain entities and value objects
- Utility functions

**Run:** `npm run test:unit`

### 2. Integration Tests
Located in `test/integration/` directory.

**Coverage:**
- API endpoint functionality
- Database operations
- Redis operations
- Service integrations

**Run:** `npm run test:integration`

### 3. End-to-End Tests
Located in `test/e2e/` directory.

**Coverage:**
- Complete user workflows
- Multi-step operations
- Cross-service functionality
- Real-time features

**Run:** `npm run test:e2e`

### 4. WebSocket Tests
Located in `test/websocket/` directory.

**Coverage:**
- WebSocket connection management
- Real-time message delivery
- Typing indicators
- Presence management
- Multi-client scenarios

**Run:** `jest --config ./test/jest-websocket.json`

### 5. Load Tests
Located in `test/load/` directory using k6.

**Coverage:**
- HTTP API performance
- WebSocket connection limits
- Concurrent user scenarios
- Spike testing

**Run:** `npm run test:load`

## Test Configuration

### Environment Setup
- **Test Database:** Uses separate test database (see `.env.test`)
- **Redis:** Uses separate Redis database (DB 1)
- **External Services:** Mocked for isolated testing

### Jest Configuration
- **Unit Tests:** Standard Jest configuration in `package.json`
- **Integration Tests:** Custom configuration in `test/jest-integration.json`
- **E2E Tests:** Custom configuration in `test/jest-e2e.json`

### Test Data Management
- **Factories:** `TestDataFactory` for generating test data
- **Fixtures:** Pre-defined test scenarios
- **Cleanup:** Automatic database cleanup between tests

## Running Tests

### All Tests
```bash
npm run test:all
```

### Specific Test Types
```bash
npm run test:unit           # Unit tests only
npm run test:integration    # Integration tests only
npm run test:e2e           # End-to-end tests only
npm run test:load          # Load tests with k6
```

### With Coverage
```bash
npm run test:cov           # Unit tests with coverage
npm run test:ci            # All tests with coverage (CI mode)
```

### Watch Mode
```bash
npm run test:watch         # Watch mode for development
```

## Test Utilities

### Mock Services
- **MockPrismaService:** In-memory database operations
- **MockRedisService:** In-memory Redis operations
- **External Service Mocks:** HTTP service mocking with nock

### Test Fixtures
- **TestDataFactory:** Generates realistic test data
- **Pre-seeded Data:** Common test scenarios
- **Relationship Management:** Handles foreign key relationships

### WebSocket Testing
- **socket.io-client:** Real WebSocket connections
- **Multi-client Testing:** Concurrent connection scenarios
- **Event Verification:** Message delivery and ordering

## Load Testing with k6

### Test Scenarios
1. **HTTP Load Test:** Gradual ramp-up to 50 concurrent users
2. **WebSocket Load Test:** 25 concurrent WebSocket connections
3. **Spike Test:** Sudden spike to 100 users

### Metrics Tracked
- HTTP request duration and failure rate
- WebSocket connection success rate
- Message latency and throughput
- Authentication failure rate

### Running Load Tests
```bash
# Install k6 first
brew install k6  # macOS
# or download from https://k6.io/docs/getting-started/installation/

# Run load tests
npm run test:load
```

## CI/CD Integration

### GitHub Actions Example
```yaml
- name: Run Tests
  run: |
    npm ci
    npm run test:ci
    
- name: Upload Coverage
  uses: codecov/codecov-action@v3
  with:
    file: ./coverage/lcov.info
```

### Test Thresholds
- **Unit Test Coverage:** > 80%
- **Integration Test Coverage:** > 70%
- **Load Test Requirements:**
  - 95% of requests < 500ms
  - Error rate < 5%
  - WebSocket connection success > 95%

## Debugging Tests

### Debug Mode
```bash
npm run test:debug         # Debug with Node inspector
```

### Verbose Output
```bash
npm test -- --verbose      # Detailed test output
```

### Test-specific Debugging
```bash
# Run specific test file
npx jest src/chat/services/message.service.spec.ts

# Run tests matching pattern
npx jest --testNamePattern="should create message"
```

## Best Practices

### Writing Tests
1. **Arrange-Act-Assert:** Clear test structure
2. **Descriptive Names:** Test names should explain the scenario
3. **Isolated Tests:** Each test should be independent
4. **Mock External Dependencies:** Use mocks for external services
5. **Test Edge Cases:** Include error scenarios and boundary conditions

### Test Data
1. **Use Factories:** Generate data with `TestDataFactory`
2. **Realistic Data:** Use faker.js for realistic test data
3. **Cleanup:** Always clean up test data
4. **Relationships:** Maintain proper foreign key relationships

### Performance
1. **Parallel Execution:** Tests run in parallel by default
2. **Database Transactions:** Use transactions for faster cleanup
3. **Selective Testing:** Run only changed tests during development
4. **Resource Management:** Properly close connections and clean up

## Troubleshooting

### Common Issues

#### Database Connection Errors
```bash
# Ensure test database exists
createdb chemchat_test

# Run migrations
npm run prisma:migrate
```

#### Redis Connection Errors
```bash
# Start Redis server
redis-server

# Verify connection
redis-cli ping
```

#### WebSocket Test Failures
- Ensure proper async/await usage
- Check for proper event listener cleanup
- Verify authentication token validity

#### Load Test Issues
- Install k6: `brew install k6`
- Check server is running on correct port
- Verify test data setup in k6 script

### Getting Help
- Check test logs for detailed error messages
- Use `--verbose` flag for more detailed output
- Review test setup in `test/setup/integration-setup.ts`
- Ensure all environment variables are set in `.env.test`

## Contributing

### Adding New Tests
1. Follow existing test structure and naming conventions
2. Add appropriate mocks for external dependencies
3. Include both success and failure scenarios
4. Update this documentation if adding new test types

### Test Coverage Goals
- **Services:** 90%+ coverage
- **Controllers:** 85%+ coverage
- **Command/Query Handlers:** 95%+ coverage
- **Critical Business Logic:** 100% coverage
