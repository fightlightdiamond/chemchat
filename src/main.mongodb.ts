import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppMongoDBModule } from './app.module.mongodb';

async function bootstrap() {
  const app = await NestFactory.create(AppMongoDBModule);

  // Global validation pipe
  app.useGlobalPipes(new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }));

  // CORS configuration
  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',') || '*',
    credentials: true,
  });

  // Swagger documentation
  const config = new DocumentBuilder()
    .setTitle('Chat System MongoDB API')
    .setDescription('Chat system with MongoDB read database and PostgreSQL write database')
    .setVersion('1.0')
    .addTag('chat')
    .addTag('search')
    .addTag('analytics')
    .addTag('health')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  // Global prefix
  app.setGlobalPrefix('api/v1');

  const port = process.env.PORT || 3000;
  await app.listen(port);

  console.log(`🚀 Chat System MongoDB API running on port ${port}`);
  console.log(`📚 Swagger documentation available at http://localhost:${port}/api/docs`);
  console.log(`🏥 Health checks available at http://localhost:${port}/api/v1/health/mongodb`);
  console.log(`📊 Analytics available at http://localhost:${port}/api/v1/analytics`);
}

bootstrap().catch((error) => {
  console.error('Failed to start application:', error);
  process.exit(1);
});