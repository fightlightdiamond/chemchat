import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from '../src/app.module';

async function bootstrapSwaggerOnly() {
  // Create a minimal app instance for Swagger documentation
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  // Enable CORS
  app.enableCors({
    origin: ['http://localhost:3000', 'http://localhost:3001'],
    credentials: true,
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Swagger configuration
  const config = new DocumentBuilder()
    .setTitle('ChemChat API')
    .setDescription('Enterprise Real-time Chat System API Documentation')
    .setVersion('1.0.0')
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
    .addTag('auth-hot-reload-test', 'Authentication and Security')
    .addTag('Health', 'Health Check Endpoints')
    .addTag('Search', 'Message Search and Indexing')
    .addTag('notifications', 'Notification System')
    .addTag('media', 'Media Upload and Management')
    .addTag('tenant', 'Multi-tenant Management')
    .addTag('Security', 'Security and Compliance')
    .addTag('sync', 'Synchronization and Offline Support')
    .addTag('observability', 'Monitoring and Observability')
    .addServer('http://localhost:3000', 'Development Server')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
      filter: true,
      showExtensions: true,
      showCommonExtensions: true,
    },
    customSiteTitle: 'ChemChat API Documentation',
    customfavIcon: 'https://swagger.io/favicon.ico',
    customJs: [
      'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.15.5/swagger-ui-bundle.min.js',
      'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.15.5/swagger-ui-standalone-preset.min.js',
    ],
    customCssUrl: [
      'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.15.5/swagger-ui.min.css',
    ],
  });

  // Start the application
  const port = process.env.PORT || 3000;
  await app.listen(port);

  console.log(`
🚀 ChemChat API Documentation is running!

📖 Swagger UI: http://localhost:${port}/api/docs
🔗 API Base URL: http://localhost:${port}
⚡ Hot Reload: Enabled

📊 Available APIs:
- 🔐 Authentication (9 endpoints)
- 💬 Chat & WebSocket (8+ events) 
- 🔍 Search (3 endpoints)
- 🔔 Notifications (11 endpoints)
- 📁 Media (9 endpoints)
- 🏢 Tenant (4 endpoints)
- 🛡️ Security (25+ endpoints)
- 🔄 Sync (20+ endpoints)
- 📊 Observability (5 endpoints)

Total: 80+ API endpoints ready for testing!
  `);
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

bootstrapSwaggerOnly().catch((error) => {
  console.error('Failed to start Swagger documentation server:', error);
  process.exit(1);
});
