import { NestFactory } from '@nestjs/core';
import escapeHtml from 'escape-html';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';
import { Module, Controller, Get, Post, Put, Delete, Body, Query, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiProperty } from '@nestjs/swagger';

// Helper function to HTML-escape all string properties of an object (shallow)
function escapeStringsInObject(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  const escaped: any = {};
  for (const key of Object.keys(obj)) {
    if (typeof obj[key] === 'string') {
      escaped[key] = escapeHtml(obj[key]);
    } else {
      escaped[key] = obj[key];
    }
  }
  return escaped;
}

// Mock DTOs for Swagger documentation
class LoginRequest {
  @ApiProperty({ example: 'user@example.com' })
  email: string;

  @ApiProperty({ example: 'password123' })
  password: string;

  @ApiProperty({ required: false })
  deviceFingerprint?: any;
}

class LoginResponse {
  @ApiProperty()
  accessToken: string;

  @ApiProperty()
  refreshToken: string;

  @ApiProperty()
  user: any;
}

class SearchRequest {
  @ApiProperty({ required: false })
  q?: string;

  @ApiProperty({ required: false })
  conversationId?: string;

  @ApiProperty({ required: false })
  page?: number;

  @ApiProperty({ required: false })
  limit?: number;
}

class NotificationRequest {
  @ApiProperty()
  title: string;

  @ApiProperty()
  message: string;

  @ApiProperty({ required: false })
  type?: string;
}

// Mock Controllers with full API documentation
@ApiTags('auth-hot-reload-test')
@Controller('auth')
class MockAuthController {
  @Post('login')
  @ApiOperation({ summary: 'User login with email and password' })
  @ApiResponse({ status: 200, description: 'Login successful', type: LoginResponse })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(@Body() loginRequest: LoginRequest): Promise<LoginResponse> {
    return {
      accessToken: 'mock-jwt-token',
      refreshToken: 'mock-refresh-token',
      user: { id: '1', email: loginRequest.email }
    };
  }

  @Post('logout')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'User logout' })
  @ApiResponse({ status: 200, description: 'Logout successful' })
  async logout(): Promise<{ message: string }> {
    return { message: 'Logged out successfully' };
  }

  @Post('refresh')
  @ApiOperation({ summary: 'Refresh access token' })
  @ApiResponse({ status: 200, description: 'Token refreshed' })
  async refresh(@Body() body: { refreshToken: string }): Promise<LoginResponse> {
    return {
      accessToken: 'new-mock-jwt-token',
      refreshToken: 'new-mock-refresh-token',
      user: { id: '1', email: 'user@example.com' }
    };
  }

  @Get('me')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({ status: 200, description: 'User profile retrieved' })
  async getProfile(): Promise<any> {
    return { id: '1', email: 'user@example.com', name: 'Mock User' };
  }

  @Post('mfa/setup')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Setup Multi-Factor Authentication' })
  @ApiResponse({ status: 200, description: 'MFA setup initiated' })
  async setupMFA(): Promise<any> {
    return { qrCode: 'mock-qr-code', secret: 'mock-secret' };
  }

  @Post('mfa/complete')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Complete MFA verification' })
  @ApiResponse({ status: 200, description: 'MFA completed' })
  async completeMFA(@Body() body: { code: string }): Promise<any> {
    return { success: true, backupCodes: ['code1', 'code2'] };
  }

  @Post('websocket-token')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Generate WebSocket authentication token' })
  @ApiResponse({ status: 200, description: 'WebSocket token generated' })
  async getWebSocketToken(): Promise<{ token: string }> {
    return { token: 'mock-websocket-token' };
  }

  @Post('change-password')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Change user password' })
  @ApiResponse({ status: 200, description: 'Password changed successfully' })
  async changePassword(@Body() body: { currentPassword: string; newPassword: string }): Promise<any> {
    return { message: 'Password changed successfully' };
  }

  @Get('security/events')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get security events for user' })
  @ApiResponse({ status: 200, description: 'Security events retrieved' })
  async getSecurityEvents(): Promise<any[]> {
    return [
      { id: '1', type: 'login', timestamp: new Date(), ipAddress: '192.168.1.1' },
      { id: '2', type: 'password_change', timestamp: new Date(), ipAddress: '192.168.1.1' }
    ];
  }
}

@ApiTags('Search')
@Controller('search')
class MockSearchController {
  @Get('messages')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Search messages with full-text search' })
  @ApiResponse({ status: 200, description: 'Search results retrieved' })
  async searchMessages(@Query() query: SearchRequest): Promise<any> {
    return {
      results: [
        { id: '1', content: 'Mock message 1', author: 'User 1', timestamp: new Date() },
        { id: '2', content: 'Mock message 2', author: 'User 2', timestamp: new Date() }
      ],
      total: 2,
      page: query.page || 1,
      limit: query.limit || 10
    };
  }

  @Get('suggestions')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get search suggestions' })
  @ApiResponse({ status: 200, description: 'Search suggestions retrieved' })
  async getSearchSuggestions(@Query('q') query: string): Promise<string[]> {
    return ['suggestion 1', 'suggestion 2', 'suggestion 3'];
  }

  @Get('health')
  @ApiOperation({ summary: 'Search service health check' })
  @ApiResponse({ status: 200, description: 'Search service is healthy' })
  async getSearchHealth(): Promise<any> {
    return { status: 'healthy', elasticsearch: 'connected' };
  }
}

@ApiTags('notifications')
@Controller('notifications')
class MockNotificationController {
  @Post()
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Send notification' })
  @ApiResponse({ status: 201, description: 'Notification sent' })
  async sendNotification(@Body() notification: NotificationRequest): Promise<any> {
    return { id: 'notif-1', status: 'sent', ...escapeStringsInObject(notification) };
  }

  @Get()
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get user notifications' })
  @ApiResponse({ status: 200, description: 'Notifications retrieved' })
  async getNotifications(@Query('page') page?: number, @Query('limit') limit?: number): Promise<any> {
    return {
      notifications: [
        { id: '1', title: 'Welcome', message: 'Welcome to ChemChat', read: false },
        { id: '2', title: 'New Message', message: 'You have a new message', read: true }
      ],
      total: 2,
      page: page || 1,
      limit: limit || 10
    };
  }

  @Put(':id/read')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Mark notification as read' })
  @ApiResponse({ status: 200, description: 'Notification marked as read' })
  async markAsRead(@Param('id') id: string): Promise<any> {
    return { id, read: true };
  }

  @Get('preferences')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get notification preferences' })
  @ApiResponse({ status: 200, description: 'Preferences retrieved' })
  async getPreferences(): Promise<any> {
    return { email: true, push: true, sms: false };
  }

  @Put('preferences')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Update notification preferences' })
  @ApiResponse({ status: 200, description: 'Preferences updated' })
  async updatePreferences(@Body() preferences: any): Promise<any> {
    return { ...preferences, updated: true };
  }
}

@ApiTags('media')
@Controller('media')
class MockMediaController {
  @Post('upload-url')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Generate presigned upload URL' })
  @ApiResponse({ status: 200, description: 'Upload URL generated' })
  async generateUploadUrl(@Body() body: { filename: string; contentType: string }): Promise<any> {
    return {
      uploadUrl: 'https://mock-s3.com/upload-url',
      fileId: 'file-123',
      expiresIn: 3600
    };
  }

  @Post('confirm-upload')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Confirm file upload completion' })
  @ApiResponse({ status: 200, description: 'Upload confirmed' })
  async confirmUpload(@Body() body: { fileId: string }): Promise<any> {
    return { fileId: body.fileId, status: 'confirmed', url: 'https://mock-cdn.com/file-123' };
  }

  @Get('attachments')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get user attachments' })
  @ApiResponse({ status: 200, description: 'Attachments retrieved' })
  async getAttachments(): Promise<any> {
    return {
      attachments: [
        { id: '1', filename: 'document.pdf', size: 1024, uploadedAt: new Date() },
        { id: '2', filename: 'image.jpg', size: 2048, uploadedAt: new Date() }
      ]
    };
  }

  @Get('quota')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get storage quota information' })
  @ApiResponse({ status: 200, description: 'Quota information retrieved' })
  async getQuota(): Promise<any> {
    return { used: 1024000, limit: 10240000, percentage: 10 };
  }
}

@ApiTags('Health')
@Controller('health')
class MockHealthController {
  @Get()
  @ApiOperation({ summary: 'Basic health check' })
  @ApiResponse({ status: 200, description: 'Service is healthy' })
  async getHealth(): Promise<any> {
    return { status: 'ok', timestamp: new Date() };
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe' })
  @ApiResponse({ status: 200, description: 'Service is ready' })
  async getReadiness(): Promise<any> {
    return { status: 'ready', services: { database: 'ok', redis: 'ok' } };
  }

  @Get('live')
  @ApiOperation({ summary: 'Liveness probe' })
  @ApiResponse({ status: 200, description: 'Service is alive' })
  async getLiveness(): Promise<any> {
    return { status: 'alive', uptime: '1h 30m' };
  }
}

@Module({
  controllers: [
    MockAuthController,
    MockSearchController,
    MockNotificationController,
    MockMediaController,
    MockHealthController,
  ],
})
class MockAppModule {}

async function bootstrapMockSwagger() {
  const app = await NestFactory.create(MockAppModule, {
    logger: ['error', 'warn', 'log'],
  });

  app.enableCors({
    origin: ['http://localhost:3000', 'http://localhost:3001'],
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('ChemChat API - Mock Documentation')
    .setDescription(`
# ChemChat Enterprise Real-time Chat System API

This is a **mock version** of the ChemChat API for testing and documentation purposes.
All endpoints return mock data and do not require actual database connections.

## Features
- 🔐 **Authentication & Security**: JWT-based auth, MFA, security monitoring
- 💬 **Real-time Chat**: WebSocket messaging, presence, typing indicators  
- 🔍 **Search**: Full-text search with Elasticsearch
- 🔔 **Notifications**: Multi-channel notification system
- 📁 **Media**: File upload/download with S3/MinIO
- 🏢 **Multi-tenancy**: Tenant isolation and management
- 🛡️ **Security & Compliance**: GDPR, audit logging, threat detection
- 🔄 **Synchronization**: Offline support, conflict resolution
- 📊 **Observability**: Metrics, health checks, tracing

## Authentication
Most endpoints require a JWT token. Use the login endpoint to get a token, then include it in the Authorization header:
\`Authorization: Bearer <your-jwt-token>\`

## Rate Limiting
All endpoints are protected by rate limiting to prevent abuse.

## Error Handling
All endpoints return consistent error responses with correlation IDs for tracking.
    `)
    .setVersion('1.0.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'Enter JWT token (use mock-jwt-token for testing)',
        in: 'header',
      },
      'JWT-auth',
    )
    .addServer('http://localhost:3001', 'Mock Development Server')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
      filter: true,
      showExtensions: true,
      showCommonExtensions: true,
      defaultModelsExpandDepth: 2,
      defaultModelExpandDepth: 2,
      docExpansion: 'list',
    },
    customSiteTitle: 'ChemChat API Documentation',
    customfavIcon: 'https://swagger.io/favicon.ico',
  });

  const port = process.env.PORT || 3001;
  await app.listen(port);

  console.log(`
🚀 ChemChat Mock API Documentation is running!

📖 Swagger UI: http://localhost:${port}/api/docs
🔗 API Base URL: http://localhost:${port}
⚡ Mock Mode: All endpoints return sample data

📊 Available Mock APIs:
- 🔐 Authentication (9 endpoints) - /auth/*
- 🔍 Search (3 endpoints) - /search/*  
- 🔔 Notifications (5 endpoints) - /notifications/*
- 📁 Media (4 endpoints) - /media/*
- ❤️ Health (3 endpoints) - /health/*

🧪 Test Authentication:
1. POST /auth/login with any email/password
2. Use returned token: "mock-jwt-token"
3. Test other endpoints with Bearer token

Total: 24+ Mock API endpoints ready for testing!
  `);
}

bootstrapMockSwagger().catch((error) => {
  console.error('Failed to start mock Swagger server:', error);
  process.exit(1);
});
