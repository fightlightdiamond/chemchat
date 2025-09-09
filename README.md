# Real-Time Chat System

A scalable, production-ready real-time chat system built with NestJS, implementing CQRS patterns, WebSocket communication, and event-driven architecture.

## Project Structure

```
src/
├── shared/           # Shared utilities, interfaces, and middleware
│   ├── interfaces/   # Common interfaces and types
│   ├── filters/      # Global exception filters
│   └── middleware/   # Common middleware (correlation ID, etc.)
├── auth/            # Authentication and authorization
├── chat/            # Core chat functionality (CQRS)
├── presence/        # User presence and activity tracking
└── notification/    # Push notifications and alerts
```

## Key Features

- **Event-Driven Architecture**: CQRS with CommandBus and EventBus
- **Global Exception Handling**: Structured error responses with correlation IDs
- **Correlation ID Tracking**: Request tracing across services
- **Modular Architecture**: Clean separation of concerns
- **TypeScript**: Full type safety and modern JavaScript features

## Installation

```bash
$ pnpm install
```

## Environment Setup

Copy the example environment file and configure your settings:

```bash
$ cp .env.example .env
```

## Database Setup

```bash
# Generate Prisma client
$ pnpm run prisma:generate

# Run database migrations
$ pnpm run prisma:migrate

# Open Prisma Studio (optional)
$ pnpm run prisma:studio
```

## Running the app

```bash
# development
$ pnpm run start

# watch mode
$ pnpm run start:dev

# production mode
$ pnpm run start:prod
```

## API Endpoints

- `GET /` - Hello world with correlation ID
- `GET /health` - Health check endpoint

## Test

```bash
# unit tests
$ pnpm run test

# e2e tests
$ pnpm run test:e2e

# test coverage
$ pnpm run test:cov
```

## Architecture

This project follows the specifications outlined in `.kiro/specs/real-time-chat-system/` including:

- Requirements document with EARS format acceptance criteria
- Comprehensive design document with system architecture
- Detailed implementation tasks for incremental development

## Dependencies

### Core Framework

- **NestJS**: Progressive Node.js framework
- **TypeScript**: Type-safe JavaScript

### CQRS & Events

- **@nestjs/cqrs**: Command Query Responsibility Segregation
- **@nestjs/websockets**: WebSocket support

### Authentication & Security

- **@nestjs/jwt**: JWT token management
- **@nestjs/passport**: Authentication strategies
- **@nestjs/throttler**: Rate limiting

### Database & Caching

- **Prisma**: Database ORM and migrations
- **Redis**: Caching and pub/sub
- **KafkaJS**: Event streaming

### Validation & Documentation

- **class-validator**: DTO validation
- **class-transformer**: Object transformation
- **@nestjs/swagger**: API documentation

## License

This project is licensed under the UNLICENSED license.
