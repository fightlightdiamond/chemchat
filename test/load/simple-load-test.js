import http from 'k6/http';
import { check, sleep } from 'k6';

// Simple test configuration for basic validation
export const options = {
  vus: 2,
  duration: '10s',
  thresholds: {
    http_req_duration: ['p(95)<1000'], // 95% of requests must complete below 1000ms
    http_req_failed: ['rate<0.1'], // Error rate must be below 10%
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export default function () {
  // Test health endpoint
  const healthResponse = http.get(`${BASE_URL}/health`);

  check(healthResponse, {
    'health check status is 200': (r) => r.status === 200,
    'health check response time < 500ms': (r) => r.timings.duration < 500,
  });

  sleep(1);
}
