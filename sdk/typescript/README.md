# ChemChat TypeScript SDK

Official TypeScript SDK for ChemChat real-time chat system.

## Installation

```bash
npm install @chemchat/typescript-sdk
```

## Quick Start

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

## Features

- **Full TypeScript Support**: Complete type definitions for all API responses
- **Real-time Communication**: WebSocket integration with automatic reconnection
- **Authentication**: JWT-based authentication with automatic token refresh
- **File Upload**: Pre-signed URL upload with progress tracking
- **Offline Support**: Client synchronization and conflict resolution
- **Error Handling**: Comprehensive error types and handling
- **Multi-tenant**: Built-in multi-tenant support

## Configuration

```typescript
interface ChemChatConfig {
  apiUrl: string;
  wsUrl?: string;
  tenantId: string;
  apiKey?: string;
  timeout?: number;
  retryAttempts?: number;
  retryDelay?: number;
}
```

## API Reference

### Client Creation

```typescript
import { 
  createChemChatClient, 
  createDevelopmentClient, 
  createProductionClient 
} from '@chemchat/typescript-sdk';

// Custom configuration
const client = createChemChatClient(config, options);

// Development preset
const devClient = createDevelopmentClient('tenant-id');

// Production preset
const prodClient = createProductionClient(
  'https://api.chemchat.com',
  'tenant-id',
  'api-key'
);
```

### Authentication

```typescript
// Login
const authResponse = await client.login({
  email: 'user@example.com',
  password: 'password',
  deviceFingerprint: {
    userAgent: navigator.userAgent,
    language: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
  }
});

// Set tokens manually
client.setTokens(accessToken, refreshToken);

// Logout
await client.logout();
```

### Messaging

```typescript
// Send message
const message = await client.sendMessage({
  conversationId: 'conv-123',
  content: 'Hello world!',
  type: MessageType.TEXT,
  clientMessageId: 'unique-client-id',
  replyToId: 'msg-456'
});

// Edit message
const editedMessage = await client.editMessage('msg-123', 'Updated content');

// Delete message
await client.deleteMessage('msg-123');
```

### Conversations

```typescript
// Get conversations
const conversations = await client.getConversations({
  page: 1,
  limit: 20
});

// Create conversation
const conversation = await client.createConversation({
  name: 'Project Discussion',
  type: ConversationType.GROUP,
  participantIds: ['user-1', 'user-2']
});

// Join conversation
await client.joinConversation('conv-123', 'invite-code');

// Get conversation history
const history = await client.getConversationHistory('conv-123', {
  limit: 50,
  cursor: 'cursor-string'
});
```

### Real-time Events

```typescript
// Message events
client.on('message_created', (message: Message) => {
  console.log('New message:', message);
});

client.on('message_edited', (message: Message) => {
  console.log('Message edited:', message);
});

client.on('message_deleted', (messageId: string) => {
  console.log('Message deleted:', messageId);
});

// Presence events
client.on('user_presence_changed', (presence: PresenceStatus) => {
  console.log('User presence changed:', presence);
});

// Typing indicators
client.on('user_typing', (typing: TypingIndicator) => {
  console.log('User typing:', typing);
});

// Connection events
client.on('connect', () => {
  console.log('Connected to server');
});

client.on('disconnect', (reason: string) => {
  console.log('Disconnected:', reason);
});
```

### File Upload

```typescript
// Upload file
const file = document.getElementById('file-input').files[0];

const attachment = await client.uploadFile(
  file,
  {
    filename: file.name,
    contentType: file.type,
    size: file.size,
    conversationId: 'conv-123'
  },
  (progress) => {
    console.log('Upload progress:', progress);
  }
);
```

### Search

```typescript
// Search messages
const searchResults = await client.searchMessages({
  query: 'project deadline',
  conversationIds: ['conv-123'],
  messageTypes: [MessageType.TEXT],
  dateRange: {
    from: '2023-11-01T00:00:00.000Z',
    to: '2023-12-01T23:59:59.000Z'
  }
});

// Get search suggestions
const suggestions = await client.getSearchSuggestions('project');
```

### Presence and Typing

```typescript
// Update presence
client.updatePresence(OnlineStatus.ONLINE);

// Start typing
client.startTyping('conv-123');

// Stop typing
client.stopTyping('conv-123');
```

## Error Handling

```typescript
import { 
  ChemChatError, 
  AuthenticationError, 
  RateLimitError,
  isChemChatError 
} from '@chemchat/typescript-sdk';

try {
  await client.sendMessage(messageData);
} catch (error) {
  if (isChemChatError(error)) {
    console.log('ChemChat error:', error.code, error.message);
    
    if (error instanceof AuthenticationError) {
      // Handle authentication error
      await client.refreshAuth();
    } else if (error instanceof RateLimitError) {
      // Handle rate limiting
      setTimeout(() => {
        // Retry after delay
      }, error.retryAfter * 1000);
    }
  }
}
```

## React Integration

```tsx
import React, { useEffect, useState } from 'react';
import { ChemChatClient, Message } from '@chemchat/typescript-sdk';

function useChemChat(config: ChemChatConfig) {
  const [client, setClient] = useState<ChemChatClient | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const chatClient = createChemChatClient(config);
    
    chatClient.on('message_created', (message) => {
      setMessages(prev => [...prev, message]);
    });
    
    chatClient.on('connect', () => setConnected(true));
    chatClient.on('disconnect', () => setConnected(false));
    
    setClient(chatClient);
    
    return () => {
      chatClient.disconnect();
    };
  }, []);

  return { client, messages, connected };
}
```

## Advanced Features

### Offline Support

```typescript
// Enable sync
const client = createChemChatClient(config, {
  enableSync: true,
  syncInterval: 30000
});

// Manual sync
const syncResult = await client.performSync();

// Get client state
const clientState = await client.getClientState();
```

### Custom Event Listeners

```typescript
// Helper methods for event management
const unsubscribeMessage = client.onMessage((message) => {
  // Handle message
});

const unsubscribePresence = client.onPresenceChange((presence) => {
  // Handle presence change
});

// Clean up
unsubscribeMessage();
unsubscribePresence();
```

## TypeScript Types

The SDK includes comprehensive TypeScript definitions:

```typescript
import {
  User,
  Message,
  Conversation,
  MessageType,
  ConversationType,
  OnlineStatus,
  PresenceStatus,
  TypingIndicator,
  PaginatedResult,
  ApiError
} from '@chemchat/typescript-sdk';
```

## License

MIT
