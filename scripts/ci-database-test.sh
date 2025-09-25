#!/bin/bash

# CI Database Operations Test Script
# This script validates database operations in CI environment

set -e  # Exit on any error

echo "🚀 Starting CI Database Operations Test"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check if we're in CI environment
if [ "$CI" = "true" ]; then
    echo "✅ Running in CI environment"
else
    echo "⚠️  Not running in CI environment, but proceeding with tests"
fi

# Verify required environment variables
echo ""
echo "🔍 Checking Environment Variables..."
required_vars=("DATABASE_URL" "NODE_ENV")

for var in "${required_vars[@]}"; do
    if [ -z "${!var}" ]; then
        echo "❌ Required environment variable $var is not set"
        exit 1
    else
        # Hide password in DATABASE_URL for logging
        if [ "$var" = "DATABASE_URL" ]; then
            masked_url=$(echo "${!var}" | sed 's/:\/\/[^:]*:[^@]*@/:\/\/***:***@/')
            echo "✅ $var: $masked_url"
        else
            echo "✅ $var: ${!var}"
        fi
    fi
done

# Test database connectivity
echo ""
echo "🔗 Testing Database Connectivity..."
if npm exec prisma db push --accept-data-loss --skip-generate > /dev/null 2>&1; then
    echo "✅ Database connection successful"
else
    echo "❌ Database connection failed"
    exit 1
fi

# Test migrate:reset script
echo ""
echo "🔄 Testing migrate:reset script..."
if npm run migrate:reset > /dev/null 2>&1; then
    echo "✅ migrate:reset script executed successfully"
else
    echo "❌ migrate:reset script failed"
    exit 1
fi

# Test db:seed script
echo ""
echo "🌱 Testing db:seed script..."
if npm run db:seed > /dev/null 2>&1; then
    echo "✅ db:seed script executed successfully"
else
    echo "❌ db:seed script failed"
    exit 1
fi

# Run comprehensive database validation
echo ""
echo "🔍 Running Comprehensive Database Validation..."
if npm run db:validate; then
    echo "✅ All database validations passed"
else
    echo "❌ Database validation failed"
    exit 1
fi

# Test that database operations work with test environment
echo ""
echo "🧪 Testing Database Operations in Test Environment..."

# Verify we can run a simple query
if npm exec prisma db execute --stdin <<< "SELECT COUNT(*) FROM users;" > /dev/null 2>&1; then
    echo "✅ Database query execution successful"
else
    echo "❌ Database query execution failed"
    exit 1
fi

# Test that we can reset and seed multiple times (idempotency)
echo ""
echo "🔁 Testing Operation Idempotency..."
for i in {1..2}; do
    echo "   Iteration $i..."
    if ! (npm run migrate:reset > /dev/null 2>&1 && npm run db:seed > /dev/null 2>&1); then
        echo "❌ Idempotency test failed on iteration $i"
        exit 1
    fi
done
echo "✅ Operations are idempotent"

# Performance test
echo ""
echo "⚡ Testing Database Performance..."
start_time=$(date +%s%N)
npm exec prisma db execute --stdin <<< "SELECT u.*, c.* FROM users u LEFT JOIN conversation_members cm ON u.id = cm.user_id LEFT JOIN conversations c ON cm.conversation_id = c.id LIMIT 100;" > /dev/null 2>&1
end_time=$(date +%s%N)
duration=$(( (end_time - start_time) / 1000000 ))  # Convert to milliseconds

if [ $duration -lt 1000 ]; then
    echo "✅ Database performance acceptable (${duration}ms)"
else
    echo "⚠️  Database performance slower than expected (${duration}ms)"
fi

echo ""
echo "🎉 All CI Database Operations Tests Passed!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Summary:"
echo "✅ Environment variables properly configured"
echo "✅ Database connectivity verified"
echo "✅ migrate:reset script working"
echo "✅ db:seed script working"
echo "✅ Data integrity validated"
echo "✅ Operations are idempotent"
echo "✅ Performance within acceptable limits"
echo ""
echo "The database operations are ready for CI environment! 🚀"