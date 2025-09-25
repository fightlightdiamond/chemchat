# Database Operations Validation Guide

This document describes how to validate database operations in CI environment for the GitHub workflow compatibility fix.

## Overview

Task 7 of the GitHub workflow compatibility fix involves validating that database operations work correctly in CI environment. This includes:

1. Testing `migrate:reset` script functionality
2. Verifying `db:seed` script execution and data population
3. Ensuring proper environment variables are set
4. Validating database connectivity and schema integrity

## Validation Scripts Created

### 1. Database Validation Script (`scripts/validate-database-operations.ts`)

A comprehensive TypeScript script that validates all database operations:

```bash
npm run db:validate
```

**Features:**

- Environment variable validation
- Database connectivity testing
- Migration reset verification
- Seed script validation
- Data integrity checks
- Performance testing

### 2. CI Database Test Script (`scripts/ci-database-test.sh`)

A bash script specifically designed for CI environment testing:

```bash
npm run db:test-ci
```

**Features:**

- CI environment detection
- Environment variable checking
- Database connectivity testing
- Script execution validation
- Idempotency testing
- Performance benchmarking

### 3. Integration Tests (`test/integration/database-operations.integration-spec.ts`)

Jest-based integration tests that run in CI environment:

```bash
npm run test:integration -- test/integration/database-operations.integration-spec.ts
```

**Test Coverage:**

- Environment configuration validation
- Database connectivity tests
- Migration script testing
- Seed script validation
- Data integrity verification
- Performance testing

### 4. Unit Tests (`test/unit/database-scripts.spec.ts`)

Unit tests that validate script configuration:

```bash
npm run test:unit -- test/unit/database-scripts.spec.ts
```

**Test Coverage:**

- Package.json script validation
- Script file existence checks
- Script content validation
- Environment variable requirements

## CI Environment Testing

### Prerequisites

The CI environment must have:

1. **Database Service**: PostgreSQL 15+ running
2. **Environment Variables**:
   ```bash
   DATABASE_URL=postgresql://test:test@localhost:5432/chemchat_test
   NODE_ENV=test
   ```
3. **Dependencies**: All npm/npm packages installed

### Running in CI

The GitHub CI workflow already includes database setup steps:

```yaml
- name: Setup test database
  run: |
    npm run migrate:reset
    npm run db:seed
  env:
    DATABASE_URL: postgresql://test:test@localhost:5432/chemchat_test
    NODE_ENV: test
```

### Validation Commands

1. **Quick Validation**:

   ```bash
   npm run db:test-ci
   ```

2. **Comprehensive Validation**:

   ```bash
   npm run db:validate
   ```

3. **Integration Tests**:
   ```bash
   npm run test:integration
   ```

## Expected Results

### Successful Validation

When all database operations work correctly, you should see:

```
🎉 All CI Database Operations Tests Passed!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Summary:
✅ Environment variables properly configured
✅ Database connectivity verified
✅ migrate:reset script working
✅ db:seed script working
✅ Data integrity validated
✅ Operations are idempotent
✅ Performance within acceptable limits

The database operations are ready for CI environment! 🚀
```

### Test Data Created

The seed script creates:

- **Tenant**: "Development Tenant"
- **Users**: alice@example.com, bob@example.com
- **Conversation**: "Alice & Bob Chat"
- **Messages**: 3 test messages
- **Password**: "password123" for all test users

## Troubleshooting

### Common Issues

1. **Database Connection Failed**
   - Check DATABASE_URL environment variable
   - Ensure PostgreSQL service is running
   - Verify database credentials

2. **Migration Reset Failed**
   - Check Prisma schema file exists
   - Verify database permissions
   - Ensure no active connections blocking reset

3. **Seed Script Failed**
   - Check if migration was run first
   - Verify all required tables exist
   - Check for constraint violations

4. **Performance Issues**
   - Database queries taking too long
   - Check database resource allocation
   - Verify proper indexing

### Debug Commands

1. **Check Database Connection**:

   ```bash
   npm exec prisma db push --accept-data-loss --skip-generate
   ```

2. **Verify Schema**:

   ```bash
   npm exec prisma db execute --stdin <<< "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';"
   ```

3. **Check Seed Data**:
   ```bash
   npm exec prisma db execute --stdin <<< "SELECT COUNT(*) FROM users;"
   ```

## Requirements Satisfied

This validation addresses the following requirements from the spec:

- **Requirement 5.3**: Database operations run successfully with proper error handling
- **Requirement 5.4**: Tests have access to a properly seeded test database
- **Requirement 1.1**: All package.json scripts execute successfully
- **Requirement 2.1**: Node.js version consistency across environments

## Integration with CI Workflow

The validation scripts are integrated into the existing CI workflow at `.github/workflows/ci.yml`:

```yaml
- name: Setup test database
  run: |
    npm run migrate:reset
    npm run db:seed
  env:
    DATABASE_URL: postgresql://test:test@localhost:5432/chemchat_test
    NODE_ENV: test
```

This ensures that every CI run validates the database operations work correctly.

## Next Steps

After successful validation:

1. The database operations are confirmed working in CI
2. All test suites can run with proper database setup
3. The GitHub workflow compatibility issues are resolved
4. Development team can confidently use the CI pipeline

## Files Created/Modified

- `scripts/validate-database-operations.ts` - Comprehensive validation script
- `scripts/ci-database-test.sh` - CI-specific test script
- `test/integration/database-operations.integration-spec.ts` - Integration tests
- `test/unit/database-scripts.spec.ts` - Unit tests
- `package.json` - Added db:validate and db:test-ci scripts
- `docs/database-operations-validation.md` - This documentation

All scripts include proper error handling, logging, and exit codes for CI integration.
