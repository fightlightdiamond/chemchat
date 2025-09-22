import http from 'k6/http';
import ws from 'k6/ws';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

// Custom metrics
const messagesSent = new Counter('messages_sent');
const messagesReceived = new Counter('messages_received');
const connectionErrors = new Rate('connection_errors');
const messageLatency = new Trend('message_latency');

// Test configuration
export const options = {
  scenarios: {
    // Scenario 1: Gradual ramp-up of concurrent users
    ramp_up_users: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 50 },   // Ramp up to 50 users
        { duration: '5m', target: 50 },   // Stay at 50 users
        { duration: '2m', target: 100 },  // Ramp up to 100 users
        { duration: '5m', target: 100 },  // Stay at 100 users
        { duration: '2m', target: 0 },    // Ramp down
      ],
    },
    
    // Scenario 2: Spike testing
    spike_test: {
      executor: 'ramping-vus',
      startTime: '15m',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 200 }, // Sudden spike
        { duration: '1m', target: 200 },  // Maintain spike
        { duration: '30s', target: 0 },   // Drop back down
      ],
    },
    
    // Scenario 3: Constant load for endurance testing
    endurance_test: {
      executor: 'constant-vus',
      vus: 30,
      duration: '20m',
      startTime: '20m',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% of requests under 500ms
    http_req_failed: ['rate<0.05'],   // Error rate under 5%
    connection_errors: ['rate<0.1'],  // Connection error rate under 10%
    message_latency: ['p(95)<1000'],  // 95% of messages under 1s latency
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const WS_URL = __ENV.WS_URL || 'ws://localhost:3000';

// Test data
const testUsers = [
  { email: 'test1@example.com', password: 'password123' },
  { email: 'test2@example.com', password: 'password123' },
  { email: 'test3@example.com', password: 'password123' },
];

let authToken = '';
let conversationId = '';

export function setup() {
  // Setup phase - create test data
  console.log('Setting up test environment...');
  
  // Login and get auth token
  const loginResponse = http.post(`${BASE_URL}/auth/login`, {
    email: testUsers[0].email,
    password: testUsers[0].password,
  });
  
  check(loginResponse, {
    'login successful': (r) => r.status === 200,
  });
  
  const authData = JSON.parse(loginResponse.body);
  authToken = authData.accessToken;
  
  // Create test conversation
  const conversationResponse = http.post(
    `${BASE_URL}/conversations`,
    JSON.stringify({
      name: 'Load Test Conversation',
      type: 'GROUP',
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
        'X-Tenant-ID': 'test-tenant',
      },
    }
  );
  
  check(conversationResponse, {
    'conversation created': (r) => r.status === 201,
  });
  
  const conversationData = JSON.parse(conversationResponse.body);
  conversationId = conversationData.id;
  
  return { authToken, conversationId };
}

export default function (data) {
  const { authToken, conversationId } = data;
  
  // Test scenario selection based on VU ID
  const scenario = Math.floor(Math.random() * 3);
  
  switch (scenario) {
    case 0:
      testRESTAPI(authToken, conversationId);
      break;
    case 1:
      testWebSocketCommunication(authToken, conversationId);
      break;
    case 2:
      testMixedWorkload(authToken, conversationId);
      break;
  }
  
  sleep(1);
}

function testRESTAPI(authToken, conversationId) {
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${authToken}`,
    'X-Tenant-ID': 'test-tenant',
  };
  
  // Send message via REST API
  const messageResponse = http.post(
    `${BASE_URL}/messages`,
    JSON.stringify({
      conversationId,
      content: `REST API message from VU ${__VU} at ${new Date().toISOString()}`,
      type: 'TEXT',
    }),
    { headers }
  );
  
  check(messageResponse, {
    'message sent via REST': (r) => r.status === 201,
  });
  
  messagesSent.add(1);
  
  // Get conversation history
  const historyResponse = http.get(
    `${BASE_URL}/conversations/${conversationId}/messages`,
    { headers }
  );
  
  check(historyResponse, {
    'history retrieved': (r) => r.status === 200,
  });
  
  // Search messages
  const searchResponse = http.get(
    `${BASE_URL}/search/messages?q=message&conversationId=${conversationId}`,
    { headers }
  );
  
  check(searchResponse, {
    'search completed': (r) => r.status === 200,
  });
}

function testWebSocketCommunication(authToken, conversationId) {
  const url = `${WS_URL}/socket.io/?EIO=4&transport=websocket`;
  
  const response = ws.connect(url, {
    headers: {
      'Authorization': `Bearer ${authToken}`,
    },
  }, function (socket) {
    let messageReceived = false;
    const startTime = Date.now();
    
    socket.on('open', () => {
      console.log(`VU ${__VU}: WebSocket connected`);
      
      // Join conversation room
      socket.send(JSON.stringify({
        type: 'join_room',
        data: { conversationId },
      }));
    });
    
    socket.on('message', (data) => {
      const message = JSON.parse(data);
      
      if (message.type === 'room_joined') {
        // Send a message
        socket.send(JSON.stringify({
          type: 'send_message',
          data: {
            conversationId,
            content: `WebSocket message from VU ${__VU} at ${new Date().toISOString()}`,
            type: 'TEXT',
          },
        }));
        
        messagesSent.add(1);
      }
      
      if (message.type === 'message_created') {
        messageReceived = true;
        messagesReceived.add(1);
        
        const latency = Date.now() - startTime;
        messageLatency.add(latency);
      }
    });
    
    socket.on('error', (e) => {
      console.log(`VU ${__VU}: WebSocket error:`, e);
      connectionErrors.add(1);
    });
    
    // Keep connection alive for 10 seconds
    socket.setTimeout(() => {
      socket.close();
    }, 10000);
  });
  
  check(response, {
    'websocket connection established': (r) => r && r.status === 101,
  });
}

function testMixedWorkload(authToken, conversationId) {
  // Simulate realistic user behavior with mixed operations
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${authToken}`,
    'X-Tenant-ID': 'test-tenant',
  };
  
  // 1. Check presence
  const presenceResponse = http.get(`${BASE_URL}/presence/status`, { headers });
  check(presenceResponse, {
    'presence check': (r) => r.status === 200,
  });
  
  sleep(0.5);
  
  // 2. Send message
  const messageResponse = http.post(
    `${BASE_URL}/messages`,
    JSON.stringify({
      conversationId,
      content: `Mixed workload message from VU ${__VU}`,
      type: 'TEXT',
    }),
    { headers }
  );
  
  check(messageResponse, {
    'mixed workload message sent': (r) => r.status === 201,
  });
  
  messagesSent.add(1);
  
  sleep(1);
  
  // 3. Get notifications
  const notificationsResponse = http.get(`${BASE_URL}/notifications`, { headers });
  check(notificationsResponse, {
    'notifications retrieved': (r) => r.status === 200,
  });
  
  sleep(0.5);
  
  // 4. Update user presence
  const updatePresenceResponse = http.put(
    `${BASE_URL}/presence/status`,
    JSON.stringify({ status: 'ACTIVE' }),
    { headers }
  );
  
  check(updatePresenceResponse, {
    'presence updated': (r) => r.status === 200,
  });
}

export function teardown(data) {
  console.log('Tearing down test environment...');
  // Cleanup operations would go here
}

// Handle different test phases
export function handleSummary(data) {
  return {
    'load-test-results.json': JSON.stringify(data, null, 2),
    'load-test-summary.html': generateHTMLReport(data),
  };
}

function generateHTMLReport(data) {
  const { metrics } = data;
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>ChemChat Load Test Results</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .metric { margin: 10px 0; padding: 10px; border: 1px solid #ddd; }
        .passed { background-color: #d4edda; }
        .failed { background-color: #f8d7da; }
      </style>
    </head>
    <body>
      <h1>ChemChat Load Test Results</h1>
      <div class="metric ${metrics.http_req_duration.values.p95 < 500 ? 'passed' : 'failed'}">
        <h3>HTTP Request Duration (P95)</h3>
        <p>${metrics.http_req_duration.values.p95.toFixed(2)}ms (threshold: <500ms)</p>
      </div>
      <div class="metric ${metrics.http_req_failed.values.rate < 0.05 ? 'passed' : 'failed'}">
        <h3>HTTP Request Failure Rate</h3>
        <p>${(metrics.http_req_failed.values.rate * 100).toFixed(2)}% (threshold: <5%)</p>
      </div>
      <div class="metric">
        <h3>Messages Sent</h3>
        <p>${metrics.messages_sent ? metrics.messages_sent.values.count : 0}</p>
      </div>
      <div class="metric">
        <h3>Messages Received</h3>
        <p>${metrics.messages_received ? metrics.messages_received.values.count : 0}</p>
      </div>
    </body>
    </html>
  `;
}
