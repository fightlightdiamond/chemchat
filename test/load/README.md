# Performance Testing với k6

Thư mục này chứa các load test sử dụng k6 để kiểm tra hiệu suất của ChemChat application.

## Các loại test

### 1. Simple Load Test (`simple-load-test.js`)

- Test cơ bản chỉ kiểm tra health endpoint
- Sử dụng cho CI/CD pipeline
- Thời gian chạy ngắn (10 giây)
- Phù hợp để validate rằng application có thể handle basic load

### 2. Full Load Test (`load-test.js`)

- Test toàn diện với nhiều scenarios:
  - HTTP API load testing
  - WebSocket connection testing
  - Spike testing
- Bao gồm authentication flow
- Test với real-world scenarios
- Thời gian chạy dài hơn (16+ phút)

## Cách chạy

### Sử dụng Docker (Recommended)

#### Simple test:

```bash
./scripts/run-performance-tests.sh simple
```

#### Full test:

```bash
./scripts/run-performance-tests.sh full
```

### Sử dụng docker-compose trực tiếp

#### Simple test:

```bash
docker-compose -f docker-compose.yml -f docker-compose.performance.yml up -d
docker-compose -f docker-compose.yml -f docker-compose.performance.yml run --rm k6-simple run /scripts/simple-load-test.js
```

#### Full test:

```bash
docker-compose -f docker-compose.yml -f docker-compose.performance.yml up -d
docker-compose -f docker-compose.yml -f docker-compose.performance.yml run --rm k6 run /scripts/load-test.js
```

## Environment Variables

- `BASE_URL`: URL của ChemChat application (default: http://localhost:3000)
- `WS_URL`: WebSocket URL (default: ws://localhost:3000)
- `K6_PROMETHEUS_RW_SERVER_URL`: Prometheus remote write URL (optional)

## Test Results

Kết quả test được lưu trong thư mục `test-results/` dưới dạng JSON format.

## Thresholds

### Simple Load Test

- HTTP request duration p95 < 1000ms
- HTTP request failure rate < 10%

### Full Load Test

- HTTP request duration p95 < 500ms
- HTTP request failure rate < 5%
- WebSocket connection success rate > 95%
- Message latency p95 < 200ms

## CI/CD Integration

Performance tests được tích hợp vào GitHub Actions CI pipeline:

- Chỉ chạy khi push lên main branch
- Sử dụng simple load test để tránh làm chậm CI
- Upload test results như artifacts
- Display service logs nếu test fail

## Troubleshooting

### Services không start được

1. Kiểm tra Docker có đang chạy không
2. Kiểm tra ports có bị conflict không
3. Xem logs: `docker-compose logs [service-name]`

### Load tests fail

1. Kiểm tra application có healthy không: `curl http://localhost:3000/health`
2. Kiểm tra network connectivity giữa k6 container và app
3. Xem k6 logs để debug

### Performance issues

1. Monitor resource usage: `docker stats`
2. Check database connections
3. Review application logs
4. Adjust test parameters nếu cần
