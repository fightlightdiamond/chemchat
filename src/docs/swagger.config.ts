import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { INestApplication } from '@nestjs/common';

export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('ChemChat API')
    .setDescription(`
# ChemChat Real-time Chat System API

A comprehensive real-time chat system with advanced features including:

- **Multi-tenant Architecture**: Complete tenant isolation and resource management
- **Real-time Messaging**: WebSocket-based chat with presence indicators
- **Advanced Search**: Elasticsearch-powered message search and indexing
- **Media Handling**: File upload, processing, and CDN integration
- **Notifications**: Multi-channel notification system (push, email, SMS)
- **Admin & Moderation**: Comprehensive moderation tools and automated content filtering
- **Observability**: OpenTelemetry tracing, Prometheus metrics, and health monitoring
- **Offline Support**: Client synchronization and conflict resolution

## Authentication

All API endpoints require JWT authentication unless marked as public. Include the JWT token in the Authorization header:

\`\`\`
Authorization: Bearer <your-jwt-token>
\`\`\`

## Multi-tenancy

All requests must include a tenant identifier via one of the following methods:

1. **Header**: \`X-Tenant-ID: <tenant-id>\`
2. **Subdomain**: \`<tenant-id>.yourdomain.com\`
3. **Query Parameter**: \`?tenantId=<tenant-id>\`

## Rate Limiting

API endpoints are rate-limited based on your subscription tier:

- **FREE**: 100 requests/hour
- **BASIC**: 1,000 requests/hour  
- **PREMIUM**: 10,000 requests/hour
- **ENTERPRISE**: 100,000 requests/hour

## WebSocket Connection

Connect to WebSocket for real-time features:

\`\`\`javascript
const socket = io('ws://localhost:3000', {
  auth: {
    token: 'your-jwt-token'
  },
  query: {
    tenantId: 'your-tenant-id'
  }
});
\`\`\`

## Error Handling

All API responses follow a consistent error format:

\`\`\`json
{
  "statusCode": 400,
  "message": "Validation failed",
  "error": "Bad Request",
  "timestamp": "2023-12-01T10:00:00.000Z",
  "path": "/api/v1/messages",
  "correlationId": "uuid-correlation-id"
}
\`\`\`

## Pagination

List endpoints support cursor-based pagination:

\`\`\`json
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
\`\`\`
    `)
    .setVersion('1.0.0')
    .setContact('ChemChat Team', 'https://chemchat.com', 'support@chemchat.com')
    .setLicense('MIT', 'https://opensource.org/licenses/MIT')
    .addServer('http://localhost:3000', 'Development Server')
    .addServer('https://api.chemchat.com', 'Production Server')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'Enter JWT token',
        in: 'header',
      },
      'JWT-auth',
    )
    .addApiKey(
      {
        type: 'apiKey',
        name: 'X-Tenant-ID',
        in: 'header',
        description: 'Tenant identifier for multi-tenant requests',
      },
      'tenant-auth',
    )
    .addTag('auth', 'Authentication and authorization endpoints')
    .addTag('chat', 'Real-time chat and messaging')
    .addTag('conversations', 'Conversation management and history')
    .addTag('users', 'User profile and management')
    .addTag('admin', 'Admin panel and moderation tools')
    .addTag('search', 'Message search and indexing')
    .addTag('media', 'File upload and media handling')
    .addTag('notifications', 'Push notifications and preferences')
    .addTag('sync', 'Client synchronization and offline support')
    .addTag('observability', 'Monitoring, metrics, and health checks')
    .addTag('tenant', 'Multi-tenant management and quotas')
    .build();

  const document = SwaggerModule.createDocument(app, config, {
    operationIdFactory: (controllerKey: string, methodKey: string) => methodKey,
    deepScanRoutes: true,
  });

  // Add custom CSS for better styling
  const customCss = `
    .swagger-ui .topbar { display: none; }
    .swagger-ui .info .title { color: #2c3e50; }
    .swagger-ui .scheme-container { background: #f8f9fa; padding: 10px; border-radius: 5px; }
  `;

  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
      docExpansion: 'none',
      filter: true,
      showExtensions: true,
      showCommonExtensions: true,
      tryItOutEnabled: true,
    },
    customCss,
    customSiteTitle: 'ChemChat API Documentation',
    customfavIcon: '/favicon.ico',
  });
}
