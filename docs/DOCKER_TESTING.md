# Docker Testing Guide

Hướng dẫn chạy comprehensive workflow validation tests trong môi trường Docker.

## Tổng quan

Tất cả các test validation cho task 8 đã được cấu hình để chạy hoàn toàn trong môi trường Docker, đảm bảo tính nhất quán và độ tin cậy.

## Yêu cầu

- Docker Engine 20.10+
- Docker Compose 2.0+
- Ít nhất 4GB RAM khả dụng
- Ít nhất 10GB dung lượng đĩa trống

## Cấu trúc Files

```
├── docker-compose.test.yml          # Docker compose cho testing
├── Dockerfile.test                  # Dockerfile tối ưu cho testing
├── .env.test.docker                # Environment variables cho testing
├── scripts/
│   ├── run-docker-validation.sh    # Script chính chạy tất cả validation
│   └── docker-test-runner.sh       # Script linh hoạt cho các test cụ thể
```

## Cách sử dụng

### 1. Chạy tất cả validation tests

```bash
# Sử dụng npm script
npm run docker:test

# Hoặc chạy trực tiếp script
./scripts/run-docker-validation.sh
```

### 2. Chạy các test cụ thể

```bash
# Chạy tất cả tests
npm run docker:test:all

# Chỉ chạy script validation
npm run docker:test:scripts

# Chỉ chạy Node.js version consistency tests
npm run docker:test:nodejs

# Chỉ chạy CI workflow validation
npm run docker:test:ci-workflow

# Chạy comprehensive test suite
npm run docker:test:comprehensive
```

### 3. Quản lý services

```bash
# Khởi động services để debug
npm run docker:test:services

# Dọn dẹp Docker resources
npm run docker:test:cleanup

# Xem logs của services
./scripts/docker-test-runner.sh logs

# Kiểm tra status của services
./scripts/docker-test-runner.sh status
```

### 4. Debug và troubleshooting

```bash
# Mở shell trong test container
./scripts/docker-test-runner.sh shell

# Build lại Docker images
./scripts/docker-test-runner.sh build

# Xem help
./scripts/docker-test-runner.sh help
```

## Test Coverage

### Task 8 Requirements Coverage

✅ **Write tests to verify all package.json scripts execute successfully**

- Script validation runner: `script-validator`
- Script execution tests: `script-execution-tests`
- Comprehensive script validation: `validate:scripts`

✅ **Create validation for Node.js version consistency across environments**

- Node.js version validator: `nodejs-validator`
- Node.js version tests: `nodejs-version-tests`
- Cross-environment consistency checks

✅ **Test complete CI workflow execution with new configurations**

- CI workflow validator: `ci-workflow-validator`
- Complete workflow execution simulation
- Service configuration validation

### Test Services

Các test chạy với các services sau trong Docker:

- **PostgreSQL 15-alpine**: Database cho integration tests
- **Redis 7-alpine**: Cache và session store
- **Elasticsearch 8.11.0**: Search engine testing

## Environment Variables

File `.env.test.docker` chứa tất cả environment variables cần thiết:

```bash
NODE_ENV=test
DATABASE_URL=postgresql://test:test@postgres:5432/chemchat_test
REDIS_HOST=redis
REDIS_PORT=6379
ELASTICSEARCH_NODE=http://elasticsearch:9200
DOCKER_ENV=true
CI=true
```

## Troubleshooting

### Lỗi thường gặp

1. **Docker không chạy**

   ```bash
   # Kiểm tra Docker status
   docker info

   # Khởi động Docker service
   sudo systemctl start docker
   ```

2. **Services không healthy**

   ```bash
   # Xem logs của services
   ./scripts/docker-test-runner.sh logs

   # Kiểm tra status
   ./scripts/docker-test-runner.sh status
   ```

3. **Thiếu memory**

   ```bash
   # Dọn dẹp Docker resources
   npm run docker:test:cleanup

   # Xóa unused images
   docker system prune -a
   ```

4. **Port conflicts**

   ```bash
   # Kiểm tra ports đang sử dụng
   netstat -tulpn | grep -E ':(5432|6379|9200)'

   # Stop conflicting services
   sudo systemctl stop postgresql redis-server elasticsearch
   ```

### Debug tips

1. **Chạy services riêng biệt để debug**

   ```bash
   ./scripts/docker-test-runner.sh start-services
   ```

2. **Mở shell trong container**

   ```bash
   ./scripts/docker-test-runner.sh shell
   ```

3. **Chạy test cụ thể**
   ```bash
   # Trong container shell
   npm run validate:scripts
   npm run validate:nodejs-version
   npm run validate:ci-workflow
   ```

## Performance

### Thời gian chạy ước tính

- **Comprehensive validation**: ~5-10 phút
- **Script validation**: ~2-3 phút
- **Node.js version tests**: ~30 giây
- **CI workflow validation**: ~3-5 phút

### Tối ưu hóa

1. **Build cache**: Docker images sử dụng layer caching
2. **Parallel execution**: Một số tests chạy song song
3. **Service reuse**: Services được khởi động một lần cho nhiều tests

## CI/CD Integration

### GitHub Actions

```yaml
- name: Run Docker Validation Tests
  run: |
    npm run docker:test
```

### Local Development

```bash
# Chạy trước khi commit
npm run docker:test:all

# Chạy quick validation
npm run docker:test:scripts
```

## Kết quả

Sau khi chạy thành công, bạn sẽ thấy:

```
📊 Comprehensive Workflow Validation Summary
==================================================
Total validations: 8
✅ Successful: 8
❌ Failed: 0
Success rate: 100.0%

🎉 All critical validations passed!
Task 8 requirements have been successfully validated in Docker environment:
✅ Package.json scripts execute successfully
✅ Node.js version consistency across environments
✅ Complete CI workflow execution with new configurations
```

## Liên hệ

Nếu gặp vấn đề, vui lòng:

1. Kiểm tra logs: `./scripts/docker-test-runner.sh logs`
2. Chạy cleanup: `npm run docker:test:cleanup`
3. Thử lại với: `npm run docker:test`
