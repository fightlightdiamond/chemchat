# ChemChat JavaScript SDK

Official JavaScript SDK for ChemChat real-time chat system. Compatible with Node.js and modern browsers.

## Installation

```bash
npm install @chemchat/javascript-sdk
```

## Quick Start

```javascript
import { createChemChatClient } from '@chemchat/javascript-sdk';

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
client.on('message_created', (message) => {
  console.log('New message:', message);
});
```

## Browser Usage

```html
<script src="https://unpkg.com/@chemchat/javascript-sdk/dist/index.umd.js"></script>
<script>
  const client = ChemChat.createChemChatClient({
    apiUrl: 'https://api.chemchat.com',
    tenantId: 'your-tenant-id'
  });
</script>
```

## Features

- **Universal Compatibility**: Works in Node.js and browsers
- **Real-time Communication**: WebSocket integration with automatic reconnection
- **Authentication**: JWT-based authentication with automatic token refresh
- **File Upload**: Pre-signed URL upload with progress tracking
- **Offline Support**: Client synchronization and conflict resolution
- **Error Handling**: Comprehensive error handling and retry logic
- **Multi-tenant**: Built-in multi-tenant support

## API Reference

### Client Creation

```javascript
import { 
  createChemChatClient, 
  createDevelopmentClient, 
  createProductionClient 
} from '@chemchat/javascript-sdk';

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

```javascript
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

```javascript
// Send message
const message = await client.sendMessage({
  conversationId: 'conv-123',
  content: 'Hello world!',
  type: 'TEXT',
  clientMessageId: 'unique-client-id',
  replyToId: 'msg-456'
});

// Edit message
const editedMessage = await client.editMessage('msg-123', 'Updated content');

// Delete message
await client.deleteMessage('msg-123');
```

### Real-time Events

```javascript
// Message events
client.on('message_created', (message) => {
  console.log('New message:', message);
});

client.on('message_edited', (message) => {
  console.log('Message edited:', message);
});

client.on('message_deleted', (messageId) => {
  console.log('Message deleted:', messageId);
});

// Presence events
client.on('user_presence_changed', (presence) => {
  console.log('User presence changed:', presence);
});

// Typing indicators
client.on('user_typing', (typing) => {
  console.log('User typing:', typing);
});

// Connection events
client.on('connect', () => {
  console.log('Connected to server');
});

client.on('disconnect', (reason) => {
  console.log('Disconnected:', reason);
});
```

### File Upload

```javascript
// Upload file (browser)
const fileInput = document.getElementById('file-input');
const file = fileInput.files[0];

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

## React Integration

```jsx
import React, { useEffect, useState } from 'react';
import { createChemChatClient } from '@chemchat/javascript-sdk';

function useChemChat(config) {
  const [client, setClient] = useState(null);
  const [messages, setMessages] = useState([]);
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

function ChatComponent() {
  const { client, messages, connected } = useChemChat({
    apiUrl: 'https://api.chemchat.com',
    tenantId: 'your-tenant-id'
  });

  const sendMessage = async (content) => {
    if (client && connected) {
      await client.sendMessage({
        conversationId: 'conv-123',
        content,
        type: 'TEXT'
      });
    }
  };

  return (
    <div>
      <div>Status: {connected ? 'Connected' : 'Disconnected'}</div>
      {messages.map(message => (
        <div key={message.id}>{message.content}</div>
      ))}
    </div>
  );
}
```

## Vue.js Integration

```vue
<template>
  <div>
    <div>Status: {{ connected ? 'Connected' : 'Disconnected' }}</div>
    <div v-for="message in messages" :key="message.id">
      {{ message.content }}
    </div>
  </div>
</template>

<script>
import { createChemChatClient } from '@chemchat/javascript-sdk';

export default {
  data() {
    return {
      client: null,
      messages: [],
      connected: false
    };
  },
  
  async mounted() {
    this.client = createChemChatClient({
      apiUrl: 'https://api.chemchat.com',
      tenantId: 'your-tenant-id'
    });
    
    this.client.on('message_created', (message) => {
      this.messages.push(message);
    });
    
    this.client.on('connect', () => {
      this.connected = true;
    });
    
    this.client.on('disconnect', () => {
      this.connected = false;
    });
  },
  
  beforeUnmount() {
    if (this.client) {
      this.client.disconnect();
    }
  }
};
</script>
```

## Node.js Server Integration

```javascript
const { createChemChatClient } = require('@chemchat/javascript-sdk');

const client = createChemChatClient({
  apiUrl: 'https://api.chemchat.com',
  tenantId: 'your-tenant-id',
  apiKey: 'your-api-key'
});

// Bot functionality
client.on('message_created', async (message) => {
  if (message.content.startsWith('/bot')) {
    const command = message.content.substring(4).trim();
    
    let response;
    switch (command) {
      case 'help':
        response = 'Available commands: /bot help, /bot time, /bot weather';
        break;
      case 'time':
        response = `Current time: ${new Date().toISOString()}`;
        break;
      default:
        response = 'Unknown command. Type /bot help for available commands.';
    }
    
    await client.sendMessage({
      conversationId: message.conversationId,
      content: response,
      type: 'TEXT'
    });
  }
});
```

## Error Handling

```javascript
import { 
  ChemChatError, 
  AuthenticationError, 
  RateLimitError,
  isChemChatError 
} from '@chemchat/javascript-sdk';

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

## Constants

```javascript
import { 
  MessageType, 
  UserStatus, 
  OnlineStatus, 
  ConversationType 
} from '@chemchat/javascript-sdk';

// Message types
MessageType.TEXT
MessageType.IMAGE
MessageType.FILE
MessageType.AUDIO
MessageType.VIDEO
MessageType.SYSTEM

// User status
UserStatus.ACTIVE
UserStatus.INACTIVE
UserStatus.BANNED
UserStatus.PENDING

// Online status
OnlineStatus.ONLINE
OnlineStatus.AWAY
OnlineStatus.BUSY
OnlineStatus.OFFLINE

// Conversation types
ConversationType.DIRECT
ConversationType.GROUP
ConversationType.CHANNEL
```

## Advanced Features

### Offline Support

```javascript
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

```javascript
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

### Presence and Typing

```javascript
// Update presence
client.updatePresence('ONLINE');

// Start typing
client.startTyping('conv-123');

// Stop typing
client.stopTyping('conv-123');
```

## Browser Compatibility

- Chrome 60+
- Firefox 55+
- Safari 12+
- Edge 79+

## License

MIT
