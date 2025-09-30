#!/bin/bash

# Script to run workflow validation tests inside Docker environment
# This ensures tests run in the same environment as CI

set -e

echo "🐳 Running workflow validation tests in Docker..."

# Build the test image
echo "📦 Building Docker image for testing..."
docker build --target development -t chemchat:workflow-test .

# Create test network
echo "🌐 Creating test network..."
docker network create chemchat-test-net 2>/dev/null || true

# Start required services
echo "🚀 Starting test services..."
docker-compose -f docker-compose.workflow-validation.yml up -d postgres redis elasticsearch

# Wait for services to be ready
echo "⏳ Waiting for services to be ready..."
sleep 30

# Run the workflow validation tests inside Docker
echo "🧪 Running workflow validation tests..."
docker run --rm \
  --network chemchat-test-net \
  -e NODE_ENV=test \
  -e DATABASE_URL=postgresql://test:test@postgres:5432/chemchat_test \
  -e REDIS_HOST=redis \
  -e REDIS_PORT=6379 \
  -e ELASTICSEARCH_NODE=http://elasticsearch:9200 \
  -e DOCKER_ENV=true \
  -v "$(pwd):/app" \
  -w /app \
  chemchat:workflow-test \
  npm run test:workflow-docker

# Cleanup
echo "🧹 Cleaning up..."
docker-compose -f docker-compose.workflow-validation.yml down -v
docker network rm chemchat-test-net 2>/dev/null || true
docker rmi chemchat:workflow-test 2>/dev/null || true

echo "✅ Workflow validation tests completed!"