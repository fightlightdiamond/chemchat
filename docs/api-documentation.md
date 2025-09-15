# ChemChat API Documentation

## Overview

ChemChat is a comprehensive real-time chat system with advanced features including multi-tenancy, real-time messaging, media handling, search capabilities, and extensive observability.

## Base URL

- **Development**: `http://localhost:3000/api/v1`
- **Production**: `https://api.chemchat.com/api/v1`

## Authentication

All API endpoints require JWT authentication unless marked as public. Include the JWT token in the Authorization header:

```http
Authorization: Bearer <your-jwt-token>
```

### Multi-tenancy

All requests must include a tenant identifier via one of the following methods:

1. **Header**: `X-Tenant-ID: <tenant-id>`
2. **Subdomain**: `<tenant-id>.yourdomain.com`
3. **Query Parameter**: `?tenantId=<tenant-id>`

## Rate Limiting

API endpoints are rate-limited based on your subscription tier:

- **FREE**: 100 requests/hour
- **BASIC**: 1,000 requests/hour  
- **PREMIUM**: 10,000 requests/hour
- **ENTERPRISE**: 100,000 requests/hour

Rate limit headers are included in responses:

```http
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1640995200
```

## Error Handling

All API responses follow a consistent error format:

```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "error": "Bad Request",
  "timestamp": "2023-12-01T10:00:00.000Z",
  "path": "/api/v1/messages",
  "correlationId": "uuid-correlation-id",
  "details": [
    {
      "field": "content",
      "message": "Content is required"
    }
  ]
}
```

### Common HTTP Status Codes

- `200` - Success
- `201` - Created
- `400` - Bad Request (validation errors)
- `401` - Unauthorized (invalid or missing token)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found
- `429` - Too Many Requests (rate limited)
- `500` - Internal Server Error

## Pagination

List endpoints support cursor-based pagination:

```json
{
  "data": [...],
  "pagination": {
    "total": 100,
    "page": 1,
    "limit": 20,
    "totalPages": 5,
    "hasNext": true,
    "hasPrevious": false,
    "nextCursor": "cursor-string",
    "previousCursor": null
  }
}
```

## Authentication Endpoints

### Login

```http
POST /auth/login
```

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "securePassword123",
  "deviceFingerprint": {
    "userAgent": "Mozilla/5.0...",
    "language": "en-US",
    "timezone": "America/New_York",
    "screen": "1920x1080"
  },
  "mfaCode": "123456"
}
```

**Response:**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "user-123",
    "email": "user@example.com",
    "username": "johndoe",
    "displayName": "John Doe",
    "avatar": "https://cdn.example.com/avatars/user-123.jpg",
    "status": "ACTIVE",
    "lastSeen": "2023-12-01T10:00:00.000Z"
  },
  "expiresIn": 900,
  "tokenType": "Bearer"
}
```

### Refresh Token

```http
POST /auth/refresh
```

**Request Body:**
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### Logout

```http
POST /auth/logout
```

## User Management

### Get Current User

```http
GET /users/me
```

### Update Profile

```http
PUT /users/me
```

**Request Body:**
```json
{
  "displayName": "John Doe",
  "avatar": "https://cdn.example.com/avatars/new-avatar.jpg",
  "preferences": {
    "theme": "dark",
    "language": "en-US",
    "timezone": "America/New_York"
  }
}
```

### Get User by ID

```http
GET /users/{userId}
```

## Messaging

### Send Message

```http
POST /messages
```

**Request Body:**
```json
{
  "conversationId": "conv-123",
  "content": "Hello, how are you today?",
  "type": "TEXT",
  "clientMessageId": "client-msg-456",
  "replyToId": "msg-789",
  "metadata": {
    "mentions": ["user-456"],
    "attachments": ["attachment-123"]
  }
}
```

**Response:**
```json
{
  "id": "msg-123",
  "conversationId": "conv-123",
  "senderId": "user-123",
  "content": "Hello, how are you today?",
  "type": "TEXT",
  "sequenceNumber": 1001,
  "clientMessageId": "client-msg-456",
  "replyToId": "msg-789",
  "editedAt": null,
  "deletedAt": null,
  "metadata": {
    "mentions": ["user-456"],
    "attachments": ["attachment-123"],
    "readBy": [
      {
        "userId": "user-456",
        "readAt": "2023-12-01T10:05:00.000Z"
      }
    ]
  },
  "createdAt": "2023-12-01T10:00:00.000Z",
  "updatedAt": "2023-12-01T10:00:00.000Z"
}
```

### Edit Message

```http
PUT /messages/{messageId}
```

**Request Body:**
```json
{
  "content": "Updated message content",
  "metadata": {
    "edited": true
  }
}
```

### Delete Message

```http
DELETE /messages/{messageId}
```

### Get Message

```http
GET /messages/{messageId}
```

## Conversations

### List Conversations

```http
GET /conversations?page=1&limit=20
```

### Get Conversation

```http
GET /conversations/{conversationId}
```

### Create Conversation

```http
POST /conversations
```

**Request Body:**
```json
{
  "name": "Project Discussion",
  "type": "GROUP",
  "description": "Discussion about the new project features",
  "isPrivate": false,
  "participantIds": ["user-123", "user-456"],
  "settings": {
    "allowInvites": true,
    "muteNotifications": false,
    "retentionDays": 365
  }
}
```

### Update Conversation

```http
PUT /conversations/{conversationId}
```

### Join Conversation

```http
POST /conversations/{conversationId}/join
```

**Request Body:**
```json
{
  "inviteCode": "invite-code-123"
}
```

### Leave Conversation

```http
POST /conversations/{conversationId}/leave
```

### Get Conversation History

```http
GET /conversations/{conversationId}/messages?limit=50&cursor=cursor-string
```

## Search

### Search Messages

```http
GET /search/messages
```

**Query Parameters:**
- `query` (string, required): Search query
- `conversationIds` (array): Filter by conversation IDs
- `senderIds` (array): Filter by sender IDs
- `messageTypes` (array): Filter by message types
- `from` (string): Start date (ISO 8601)
- `to` (string): End date (ISO 8601)
- `limit` (number): Results per page (default: 20)
- `page` (number): Page number (default: 1)

**Response:**
```json
{
  "data": [
    {
      "id": "msg-123",
      "conversationId": "conv-123",
      "senderId": "user-123",
      "content": "The project deadline is next Friday",
      "type": "TEXT",
      "highlights": {
        "content": "The <em>project</em> <em>deadline</em> is next Friday"
      },
      "score": 0.95,
      "createdAt": "2023-11-15T10:00:00.000Z"
    }
  ],
  "pagination": {
    "total": 25,
    "page": 1,
    "limit": 20,
    "totalPages": 2,
    "hasNext": true,
    "hasPrevious": false
  }
}
```

### Get Search Suggestions

```http
GET /search/suggestions?query=project
```

## Media Handling

### Request Upload URL

```http
POST /media/upload/url
```

**Request Body:**
```json
{
  "filename": "document.pdf",
  "contentType": "application/pdf",
  "size": 1024000,
  "conversationId": "conv-123",
  "metadata": {
    "description": "Project requirements document",
    "tags": ["project", "requirements"]
  }
}
```

**Response:**
```json
{
  "uploadUrl": "https://s3.amazonaws.com/bucket/path?signature=...",
  "attachmentId": "attachment-123",
  "expiresIn": 3600,
  "fields": {
    "key": "attachments/tenant-123/attachment-123",
    "Content-Type": "application/pdf",
    "x-amz-meta-tenant-id": "tenant-123"
  }
}
```

### Confirm Upload

```http
POST /media/upload/{attachmentId}/confirm
```

### Get Attachment

```http
GET /media/{attachmentId}
```

### Get Download URL

```http
GET /media/{attachmentId}/download
```

### Delete Attachment

```http
DELETE /media/{attachmentId}
```

## Notifications

### Get Notification Preferences

```http
GET /notifications/preferences
```

### Update Notification Preferences

```http
PUT /notifications/preferences
```

**Request Body:**
```json
{
  "channels": {
    "push": {
      "enabled": true,
      "types": ["MESSAGE", "MENTION", "CONVERSATION_INVITE"]
    },
    "email": {
      "enabled": true,
      "types": ["DAILY_DIGEST", "CONVERSATION_INVITE"]
    },
    "sms": {
      "enabled": false,
      "types": []
    }
  },
  "quietHours": {
    "enabled": true,
    "start": "22:00",
    "end": "08:00",
    "timezone": "America/New_York"
  }
}
```

### Register Device

```http
POST /notifications/devices
```

**Request Body:**
```json
{
  "token": "fcm-token-123",
  "type": "WEB",
  "userAgent": "Mozilla/5.0..."
}
```

## WebSocket Connection

Connect to WebSocket for real-time features:

```javascript
const socket = io('ws://localhost:3000', {
  auth: {
    token: 'your-jwt-token'
  },
  query: {
    tenantId: 'your-tenant-id'
  }
});
```

### WebSocket Events

#### Outgoing Events (Client to Server)

- `send_message` - Send a new message
- `edit_message` - Edit an existing message
- `delete_message` - Delete a message
- `join_room` - Join a conversation room
- `leave_room` - Leave a conversation room
- `start_typing` - Start typing indicator
- `stop_typing` - Stop typing indicator
- `update_presence` - Update user presence status
- `heartbeat` - Send heartbeat for presence

#### Incoming Events (Server to Client)

- `message_created` - New message received
- `message_edited` - Message was edited
- `message_deleted` - Message was deleted
- `conversation_created` - New conversation created
- `conversation_updated` - Conversation updated
- `user_joined` - User joined conversation
- `user_left` - User left conversation
- `user_presence_changed` - User presence updated
- `user_typing` - User typing status changed
- `notification_received` - New notification

## Synchronization

### Perform Delta Sync

```http
POST /sync/delta
```

**Request Body:**
```json
{
  "deviceId": "device-123",
  "lastSequenceNumber": 1000,
  "includeDeleted": true
}
```

### Get Client State

```http
GET /sync/state/{deviceId}
```

### Update Client State

```http
PUT /sync/state/{deviceId}
```

## Health and Monitoring

### Health Check

```http
GET /health
```

### Metrics (Prometheus)

```http
GET /metrics
```

### Detailed Health

```http
GET /observability/health/detailed
```

## SDK Usage Examples

### TypeScript SDK

```typescript
import { createChemChatClient } from '@chemchat/typescript-sdk';

const client = createChemChatClient({
  apiUrl: 'https://api.chemchat.com',
  tenantId: 'your-tenant-id',
  apiKey: 'your-api-key'
});

// Login
const user = await client.login({
  email: 'user@example.com',
  password: 'password'
});

// Send message
const message = await client.sendMessage({
  conversationId: 'conv-123',
  content: 'Hello world!',
  type: 'TEXT'
});

// Listen for real-time events
client.onMessage((message) => {
  console.log('New message:', message);
});
```

### JavaScript SDK

```javascript
import { createChemChatClient } from '@chemchat/javascript-sdk';

const client = createChemChatClient({
  apiUrl: 'https://api.chemchat.com',
  tenantId: 'your-tenant-id'
});

// Login and connect
await client.login({
  email: 'user@example.com',
  password: 'password'
});

// Real-time messaging
client.on('message_created', (message) => {
  console.log('New message:', message);
});

// Send message
await client.sendMessage({
  conversationId: 'conv-123',
  content: 'Hello from JavaScript!',
  type: 'TEXT'
});
```

## Integration Examples

### React Integration

```jsx
import React, { useEffect, useState } from 'react';
import { createChemChatClient } from '@chemchat/javascript-sdk';

function ChatComponent() {
  const [client, setClient] = useState(null);
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    const chatClient = createChemChatClient({
      apiUrl: 'https://api.chemchat.com',
      tenantId: 'your-tenant-id'
    });

    chatClient.on('message_created', (message) => {
      setMessages(prev => [...prev, message]);
    });

    setClient(chatClient);

    return () => {
      chatClient.disconnect();
    };
  }, []);

  const sendMessage = async (content) => {
    if (client) {
      await client.sendMessage({
        conversationId: 'conv-123',
        content,
        type: 'TEXT'
      });
    }
  };

  return (
    <div>
      {messages.map(message => (
        <div key={message.id}>{message.content}</div>
      ))}
    </div>
  );
}
```

### Node.js Server Integration

```javascript
const { createChemChatClient } = require('@chemchat/javascript-sdk');

const client = createChemChatClient({
  apiUrl: 'https://api.chemchat.com',
  tenantId: 'your-tenant-id',
  apiKey: 'your-api-key'
});

// Server-side message processing
client.on('message_created', async (message) => {
  // Process message
  if (message.content.includes('@bot')) {
    await client.sendMessage({
      conversationId: message.conversationId,
      content: 'Bot response here',
      type: 'TEXT'
    });
  }
});
```

## Best Practices

### Authentication
- Always use HTTPS in production
- Implement proper token refresh logic
- Store refresh tokens securely
- Use device fingerprinting for security

### Real-time Communication
- Handle connection drops gracefully
- Implement exponential backoff for reconnections
- Use heartbeats to maintain presence
- Buffer messages during disconnections

### Error Handling
- Always check for rate limiting
- Implement retry logic with exponential backoff
- Log correlation IDs for debugging
- Handle network failures gracefully

### Performance
- Use pagination for large datasets
- Implement proper caching strategies
- Use WebSocket for real-time features
- Optimize media uploads with pre-signed URLs

### Security
- Validate all inputs on client and server
- Use proper CORS configuration
- Implement proper rate limiting
- Monitor for suspicious activity
