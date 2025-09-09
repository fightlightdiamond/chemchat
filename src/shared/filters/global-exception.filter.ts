import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';

export abstract class DomainError extends Error {
  abstract readonly code: string;
  abstract readonly statusCode: number;
}

export class ValidationError extends DomainError {
  readonly code = 'VALIDATION_ERROR';
  readonly statusCode = 400;
}

export class UnauthorizedError extends DomainError {
  readonly code = 'UNAUTHORIZED';
  readonly statusCode = 401;
}

export class ConversationNotFoundError extends DomainError {
  readonly code = 'CONVERSATION_NOT_FOUND';
  readonly statusCode = 404;
}

export class RateLimitExceededError extends DomainError {
  readonly code = 'RATE_LIMIT_EXCEEDED';
  readonly statusCode = 429;
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // Ensure correlation ID exists
    const correlationId = (request as any).correlationId || uuidv4();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let code = 'INTERNAL_ERROR';

    if (exception instanceof DomainError) {
      status = exception.statusCode;
      message = exception.message;
      code = exception.code;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      message = exception.message;
      code = 'HTTP_EXCEPTION';
    }

    // Structured logging with correlation ID
    this.logger.error({
      correlationId,
      error: {
        name: exception instanceof Error ? exception.name : 'Unknown',
        message:
          exception instanceof Error ? exception.message : 'Unknown error',
        stack: exception instanceof Error ? exception.stack : undefined,
      },
      request: {
        method: request.method,
        url: request.url,
        userAgent: request.get('User-Agent'),
        ip: request.ip,
      },
      timestamp: new Date().toISOString(),
    });

    const errorResponse = {
      code,
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
      correlationId,
    };

    response.status(status).json(errorResponse);
  }
}
