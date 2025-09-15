/**
 * API Examples for ChemChat Documentation
 * These examples are used in Swagger documentation to show request/response formats
 */

export const ApiExamples = {
  // Authentication Examples
  auth: {
    loginRequest: {
      email: 'user@example.com',
      password: 'securePassword123',
      deviceFingerprint: {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        language: 'en-US',
        timezone: 'America/New_York',
        screen: '1920x1080',
      },
    },
    loginResponse: {
      accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
      refreshToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
      user: {
        id: 'user-123',
        email: 'user@example.com',
        username: 'johndoe',
        displayName: 'John Doe',
        avatar: 'https://cdn.example.com/avatars/user-123.jpg',
        status: 'ACTIVE',
        lastSeen: '2023-12-01T10:00:00.000Z',
      },
      expiresIn: 900,
      tokenType: 'Bearer',
    },
    mfaSetupResponse: {
      secret: 'JBSWY3DPEHPK3PXP',
      qrCode: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...',
      backupCodes: [
        '12345678',
        '87654321',
        '11223344',
        '44332211',
        '55667788',
      ],
    },
  },

  // Chat Examples
  chat: {
    sendMessageRequest: {
      conversationId: 'conv-123',
      content: 'Hello, how are you today?',
      type: 'TEXT',
      clientMessageId: 'client-msg-456',
      replyToId: 'msg-789',
      metadata: {
        mentions: ['user-456'],
        attachments: ['attachment-123'],
      },
    },
    messageResponse: {
      id: 'msg-123',
      conversationId: 'conv-123',
      senderId: 'user-123',
      content: 'Hello, how are you today?',
      type: 'TEXT',
      sequenceNumber: 1001,
      clientMessageId: 'client-msg-456',
      replyToId: 'msg-789',
      editedAt: null,
      deletedAt: null,
      metadata: {
        mentions: ['user-456'],
        attachments: ['attachment-123'],
        readBy: [
          {
            userId: 'user-456',
            readAt: '2023-12-01T10:05:00.000Z',
          },
        ],
      },
      createdAt: '2023-12-01T10:00:00.000Z',
      updatedAt: '2023-12-01T10:00:00.000Z',
    },
    conversationResponse: {
      id: 'conv-123',
      name: 'Project Discussion',
      type: 'GROUP',
      description: 'Discussion about the new project features',
      avatar: 'https://cdn.example.com/conversations/conv-123.jpg',
      isPrivate: false,
      participants: [
        {
          userId: 'user-123',
          role: 'ADMIN',
          joinedAt: '2023-11-01T10:00:00.000Z',
          permissions: ['READ', 'WRITE', 'MANAGE'],
        },
        {
          userId: 'user-456',
          role: 'MEMBER',
          joinedAt: '2023-11-02T10:00:00.000Z',
          permissions: ['READ', 'WRITE'],
        },
      ],
      settings: {
        allowInvites: true,
        muteNotifications: false,
        retentionDays: 365,
      },
      lastMessage: {
        id: 'msg-123',
        content: 'Hello, how are you today?',
        senderId: 'user-123',
        createdAt: '2023-12-01T10:00:00.000Z',
      },
      unreadCount: 5,
      createdAt: '2023-11-01T10:00:00.000Z',
      updatedAt: '2023-12-01T10:00:00.000Z',
    },
  },

  // Search Examples
  search: {
    searchRequest: {
      query: 'project deadline',
      conversationIds: ['conv-123', 'conv-456'],
      senderIds: ['user-123'],
      messageTypes: ['TEXT', 'FILE'],
      dateRange: {
        from: '2023-11-01T00:00:00.000Z',
        to: '2023-12-01T23:59:59.000Z',
      },
      limit: 20,
      page: 1,
    },
    searchResponse: {
      data: [
        {
          id: 'msg-123',
          conversationId: 'conv-123',
          senderId: 'user-123',
          content: 'The project deadline is next Friday',
          type: 'TEXT',
          highlights: {
            content: 'The <em>project</em> <em>deadline</em> is next Friday',
          },
          score: 0.95,
          createdAt: '2023-11-15T10:00:00.000Z',
        },
      ],
      pagination: {
        total: 25,
        page: 1,
        limit: 20,
        totalPages: 2,
        hasNext: true,
        hasPrevious: false,
      },
    },
    suggestionsResponse: {
      suggestions: [
        {
          text: 'project deadline',
          type: 'CONTENT',
          score: 0.9,
        },
        {
          text: 'John Doe',
          type: 'USER',
          score: 0.8,
          userId: 'user-123',
        },
        {
          text: 'Project Discussion',
          type: 'CONVERSATION',
          score: 0.7,
          conversationId: 'conv-123',
        },
      ],
    },
  },

  // Media Examples
  media: {
    uploadUrlRequest: {
      filename: 'document.pdf',
      contentType: 'application/pdf',
      size: 1024000,
      conversationId: 'conv-123',
      metadata: {
        description: 'Project requirements document',
        tags: ['project', 'requirements'],
      },
    },
    uploadUrlResponse: {
      uploadUrl: 'https://s3.amazonaws.com/bucket/path?signature=...',
      attachmentId: 'attachment-123',
      expiresIn: 3600,
      fields: {
        key: 'attachments/tenant-123/attachment-123',
        'Content-Type': 'application/pdf',
        'x-amz-meta-tenant-id': 'tenant-123',
      },
    },
    attachmentResponse: {
      id: 'attachment-123',
      filename: 'document.pdf',
      originalName: 'Project Requirements.pdf',
      contentType: 'application/pdf',
      size: 1024000,
      url: 'https://cdn.example.com/attachments/attachment-123',
      thumbnailUrl: 'https://cdn.example.com/thumbnails/attachment-123',
      status: 'PROCESSED',
      metadata: {
        description: 'Project requirements document',
        tags: ['project', 'requirements'],
        dimensions: null,
        duration: null,
        hash: 'sha256:abc123...',
      },
      virusScanStatus: 'CLEAN',
      createdAt: '2023-12-01T10:00:00.000Z',
      processedAt: '2023-12-01T10:01:00.000Z',
    },
  },

  // Notification Examples
  notifications: {
    preferencesResponse: {
      userId: 'user-123',
      channels: {
        push: {
          enabled: true,
          types: ['MESSAGE', 'MENTION', 'CONVERSATION_INVITE'],
        },
        email: {
          enabled: true,
          types: ['DAILY_DIGEST', 'CONVERSATION_INVITE'],
        },
        sms: {
          enabled: false,
          types: [],
        },
      },
      quietHours: {
        enabled: true,
        start: '22:00',
        end: '08:00',
        timezone: 'America/New_York',
      },
      devices: [
        {
          id: 'device-123',
          type: 'WEB',
          token: 'fcm-token-123',
          userAgent: 'Mozilla/5.0...',
          lastSeen: '2023-12-01T10:00:00.000Z',
        },
      ],
    },
    notificationResponse: {
      id: 'notification-123',
      userId: 'user-456',
      type: 'MESSAGE',
      title: 'New message from John Doe',
      body: 'Hello, how are you today?',
      data: {
        conversationId: 'conv-123',
        messageId: 'msg-123',
        senderId: 'user-123',
      },
      channels: ['push', 'email'],
      status: 'DELIVERED',
      deliveredAt: '2023-12-01T10:00:30.000Z',
      readAt: null,
      createdAt: '2023-12-01T10:00:00.000Z',
    },
  },

  // Admin Examples
  admin: {
    moderationActionRequest: {
      userId: 'user-456',
      action: 'BAN',
      reason: 'Spam and inappropriate content',
      duration: 86400, // 24 hours in seconds
      metadata: {
        violationType: 'SPAM',
        severity: 'HIGH',
        evidence: ['msg-123', 'msg-456'],
      },
    },
    auditLogResponse: {
      data: [
        {
          id: 'audit-123',
          action: 'USER_BANNED',
          performedBy: 'admin-123',
          targetUserId: 'user-456',
          details: {
            reason: 'Spam and inappropriate content',
            duration: 86400,
            evidence: ['msg-123', 'msg-456'],
          },
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0...',
          createdAt: '2023-12-01T10:00:00.000Z',
        },
      ],
      pagination: {
        total: 100,
        page: 1,
        limit: 20,
        totalPages: 5,
        hasNext: true,
        hasPrevious: false,
      },
    },
  },

  // WebSocket Events
  websocket: {
    connectionAuth: {
      auth: {
        token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
      },
      query: {
        tenantId: 'tenant-123',
      },
    },
    messageEvent: {
      event: 'message_created',
      data: {
        id: 'msg-123',
        conversationId: 'conv-123',
        senderId: 'user-123',
        content: 'Hello, how are you today?',
        type: 'TEXT',
        sequenceNumber: 1001,
        createdAt: '2023-12-01T10:00:00.000Z',
      },
    },
    presenceEvent: {
      event: 'user_presence_changed',
      data: {
        userId: 'user-123',
        status: 'ONLINE',
        lastSeen: '2023-12-01T10:00:00.000Z',
        devices: [
          {
            id: 'device-123',
            type: 'WEB',
            status: 'ACTIVE',
          },
        ],
      },
    },
    typingEvent: {
      event: 'user_typing',
      data: {
        conversationId: 'conv-123',
        userId: 'user-123',
        isTyping: true,
      },
    },
  },
};
