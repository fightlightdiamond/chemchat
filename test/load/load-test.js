import http from 'k6/http';
import ws from 'k6/ws';
import { check, sleep } from 'k6';
import { Rate, Counter, Trend } from 'k6/metrics';

// Custom metrics
const wsConnectionRate = new Rate('ws_connection_success');
const messagesSent = new Counter('messages_sent');
const messagesReceived = new Counter('messages_received');
const messageLatency = new Trend('message_latency');
const authFailures = new Counter('auth_failures');

// Test configuration
export const options = {
  scenarios: {
    // HTTP API Load Test
    http_load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 20 }, // Ramp up to 20 users over 2 minutes
        { duration: '5m', target: 20 }, // Stay at 20 users for 5 minutes
        { duration: '2m', target: 50 }, // Ramp up to 50 users over 2 minutes
        { duration: '5m', target: 50 }, // Stay at 50 users for 5 minutes
        { duration: '2m', target: 0 }, // Ramp down to 0 users
      ],
      exec: 'httpLoadTest',
    },
    // WebSocket Connection Test
    websocket_load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 10 }, // Ramp up to 10 WS connections
        { duration: '3m', target: 10 }, // Maintain 10 connections
        { duration: '1m', target: 25 }, // Ramp up to 25 connections
        { duration: '3m', target: 25 }, // Maintain 25 connections
        { duration: '1m', target: 0 }, // Ramp down
      ],
      exec: 'websocketLoadTest',
    },
    // Spike Test
    spike_test: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10s', target: 100 }, // Spike to 100 users
        { duration: '1m', target: 100 }, // Stay at 100 users
        { duration: '10s', target: 0 }, // Drop to 0 users
      ],
      exec: 'spikeTest',
      startTime: '16m', // Start after other tests
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% of requests must complete below 500ms
    http_req_failed: ['rate<0.05'], // Error rate must be below 5%
    ws_connection_success: ['rate>0.95'], // 95% of WS connections must succeed
    message_latency: ['p(95)<200'], // 95% of messages must have latency below 200ms
  },
};

// Test data
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const WS_URL = __ENV.WS_URL || 'ws://localhost:3000';

// Test users and authentication
let authTokens = [];
let testTenant = null;

export function setup() {
  // Create test tenant
  const tenantPayload = {
    name: 'Load Test Tenant',
    subdomain: `loadtest-${Date.now()}`,
  };

  const tenantResponse = http.post(
    `${BASE_URL}/tenants`,
    JSON.stringify(tenantPayload),
    {
      headers: { 'Content-Type': 'application/json' },
    },
  );

  if (tenantResponse.status !== 201) {
    console.error('Failed to create test tenant');
    return null;
  }

  testTenant = JSON.parse(tenantResponse.body);

  // Create test users and get auth tokens
  const tokens = [];
  for (let i = 0; i < 100; i++) {
    const userPayload = {
      email: `loadtest${i}@example.com`,
      username: `loadtest${i}`,
      displayName: `Load Test User ${i}`,
      password: 'testpassword123',
    };

    const userResponse = http.post(
      `${BASE_URL}/auth/register`,
      JSON.stringify(userPayload),
      {
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': testTenant.id,
        },
      },
    );

    if (userResponse.status === 201) {
      // Login to get token
      const loginPayload = {
        email: userPayload.email,
        password: userPayload.password,
        deviceFingerprint: `load-test-device-${i}`,
      };

      const loginResponse = http.post(
        `${BASE_URL}/auth/login`,
        JSON.stringify(loginPayload),
        {
          headers: {
            'Content-Type': 'application/json',
            'x-tenant-id': testTenant.id,
          },
        },
      );

      if (loginResponse.status === 200) {
        const loginData = JSON.parse(loginResponse.body);
        tokens.push(loginData.tokens.accessToken);
      }
    }
  }

  return {
    tenant: testTenant,
    tokens: tokens,
  };
}

export function httpLoadTest(data) {
  if (!data || !data.tokens || data.tokens.length === 0) {
    console.error('No auth tokens available');
    return;
  }

  const token = data.tokens[Math.floor(Math.random() * data.tokens.length)];
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    'x-tenant-id': data.tenant.id,
  };

  // Test conversation creation
  const conversationPayload = {
    title: `Load Test Conversation ${__VU}-${__ITER}`,
    type: 'DIRECT',
    participantIds: [],
  };

  const conversationResponse = http.post(
    `${BASE_URL}/chat/conversations`,
    JSON.stringify(conversationPayload),
    { headers },
  );

  check(conversationResponse, {
    'conversation created': (r) => r.status === 201,
  });

  if (conversationResponse.status !== 201) {
    authFailures.add(1);
    return;
  }

  const conversation = JSON.parse(conversationResponse.body);

  // Test message sending
  for (let i = 0; i < 5; i++) {
    const messagePayload = {
      content: `Load test message ${i} from VU ${__VU}`,
      type: 'TEXT',
    };

    const messageResponse = http.post(
      `${BASE_URL}/chat/conversations/${conversation.id}/messages`,
      JSON.stringify(messagePayload),
      { headers },
    );

    check(messageResponse, {
      'message sent': (r) => r.status === 201,
    });

    messagesSent.add(1);
    sleep(0.5);
  }

  // Test message retrieval
  const historyResponse = http.get(
    `${BASE_URL}/chat/conversations/${conversation.id}/messages?limit=20`,
    { headers },
  );

  check(historyResponse, {
    'history retrieved': (r) => r.status === 200,
    'messages in response': (r) => {
      const data = JSON.parse(r.body);
      return data.data && data.data.length > 0;
    },
  });

  // Test conversation listing
  const conversationsResponse = http.get(`${BASE_URL}/chat/conversations`, {
    headers,
  });

  check(conversationsResponse, {
    'conversations listed': (r) => r.status === 200,
  });

  sleep(1);
}

export function websocketLoadTest(data) {
  if (!data || !data.tokens || data.tokens.length === 0) {
    console.error('No auth tokens available');
    return;
  }

  const token = data.tokens[Math.floor(Math.random() * data.tokens.length)];
  const url = `${WS_URL}?token=${token}&tenantId=${data.tenant.id}`;

  const response = ws.connect(url, {}, function (socket) {
    wsConnectionRate.add(1);

    socket.on('open', () => {
      console.log(`VU ${__VU}: WebSocket connected`);

      // Create a test conversation first via HTTP
      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'x-tenant-id': data.tenant.id,
      };

      const conversationPayload = {
        title: `WS Test Conversation ${__VU}`,
        type: 'DIRECT',
        participantIds: [],
      };

      const conversationResponse = http.post(
        `${BASE_URL}/chat/conversations`,
        JSON.stringify(conversationPayload),
        { headers },
      );

      if (conversationResponse.status === 201) {
        const conversation = JSON.parse(conversationResponse.body);

        // Join the conversation
        socket.send(
          JSON.stringify({
            event: 'join_room',
            data: { conversationId: conversation.id },
          }),
        );

        // Send messages periodically
        let messageCount = 0;
        const messageInterval = setInterval(() => {
          if (messageCount >= 10) {
            clearInterval(messageInterval);
            socket.close();
            return;
          }

          const messageData = {
            event: 'send_message',
            data: {
              conversationId: conversation.id,
              content: `WebSocket message ${messageCount} from VU ${__VU}`,
              type: 'TEXT',
            },
          };

          const startTime = Date.now();
          socket.send(JSON.stringify(messageData));
          messagesSent.add(1);
          messageCount++;
        }, 2000);
      }
    });

    socket.on('message', (message) => {
      const data = JSON.parse(message);
      if (data.event === 'message_created') {
        messagesReceived.add(1);
        const latency = Date.now() - new Date(data.data.createdAt).getTime();
        messageLatency.add(latency);
      }
    });

    socket.on('error', (error) => {
      console.error(`VU ${__VU}: WebSocket error:`, error);
      wsConnectionRate.add(0);
    });

    socket.on('close', () => {
      console.log(`VU ${__VU}: WebSocket closed`);
    });

    // Keep connection alive for test duration
    sleep(30);
  });

  check(response, {
    'WebSocket connection established': (r) => r && r.status === 101,
  });
}

export function spikeTest(data) {
  // Simplified spike test - just hit the most critical endpoints
  if (!data || !data.tokens || data.tokens.length === 0) {
    return;
  }

  const token = data.tokens[Math.floor(Math.random() * data.tokens.length)];
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    'x-tenant-id': data.tenant.id,
  };

  // Test auth endpoint under load
  const profileResponse = http.get(`${BASE_URL}/auth/profile`, { headers });
  check(profileResponse, {
    'profile retrieved under spike': (r) => r.status === 200,
  });

  // Test conversation listing under load
  const conversationsResponse = http.get(`${BASE_URL}/chat/conversations`, {
    headers,
  });
  check(conversationsResponse, {
    'conversations listed under spike': (r) => r.status === 200,
  });

  sleep(0.1); // Minimal sleep for spike test
}

export function teardown(data) {
  if (data && data.tenant) {
    // Cleanup test tenant (if cleanup endpoint exists)
    console.log(`Cleaning up test tenant: ${data.tenant.id}`);
  }
}

// Default function for simple testing
export default function (data) {
  // Run a simple HTTP load test by default
  httpLoadTest(data);
}

// Helper function to generate random conversation data
function generateConversationData() {
  return {
    title: `Conversation ${Math.random().toString(36).substring(7)}`,
    type: Math.random() > 0.5 ? 'DIRECT' : 'GROUP',
    participantIds: [],
  };
}

// Helper function to generate random message data
function generateMessageData() {
  const messages = [
    'Hello there!',
    'How are you doing?',
    'This is a test message',
    'Load testing in progress',
    'Performance test message',
    'Random message content',
    'Testing chat functionality',
  ];

  return {
    content: messages[Math.floor(Math.random() * messages.length)],
    type: 'TEXT',
  };
}
