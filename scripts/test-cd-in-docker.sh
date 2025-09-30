#!/bin/bash

# Simple script to run CD tests inside Docker container
set -e

echo "🚀 Starting CD deployment compatibility tests in Docker..."

# Start containers if not running
echo "📦 Starting Docker containers..."
docker-compose -f docker-compose.yml -f docker-compose.workflow-validation.yml up -d --build

# Wait for containers to be ready
echo "⏳ Waiting for containers to be ready..."
sleep 30

# Get container name
CONTAINER_NAME=$(docker-compose -f docker-compose.yml -f docker-compose.workflow-validation.yml ps -q chemchat-app)

if [ -z "$CONTAINER_NAME" ]; then
    echo "❌ ChemChat app container not found!"
    exit 1
fi

echo "🧪 Running tests inside container: $CONTAINER_NAME"

# Run the test inside the container
docker exec "$CONTAINER_NAME" npm run test -- test/system/cd-deployment-compatibility.spec.ts --testTimeout=300000

echo "✅ CD deployment compatibility tests completed!"