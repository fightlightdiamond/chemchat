import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsNumber, Min, Max } from 'class-validator';

export class PaginationDto {
  @ApiProperty({
    description: 'Page number (1-based)',
    example: 1,
    minimum: 1,
    default: 1,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiProperty({
    description: 'Number of items per page',
    example: 20,
    minimum: 1,
    maximum: 100,
    default: 20,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiProperty({
    description: 'Cursor for pagination (alternative to page-based)',
    example: 'eyJpZCI6MTIzLCJ0aW1lc3RhbXAiOiIyMDIzLTEyLTAxVDEwOjAwOjAwLjAwMFoifQ==',
    required: false,
  })
  @IsOptional()
  @IsString()
  cursor?: string;
}

export class PaginatedResponseDto<T> {
  @ApiProperty({
    description: 'Array of data items',
    isArray: true,
  })
  data: T[];

  @ApiProperty({
    description: 'Pagination metadata',
    type: 'object',
    properties: {
      total: { type: 'number', description: 'Total number of items' },
      page: { type: 'number', description: 'Current page number' },
      limit: { type: 'number', description: 'Items per page' },
      totalPages: { type: 'number', description: 'Total number of pages' },
      hasNext: { type: 'boolean', description: 'Whether there is a next page' },
      hasPrevious: { type: 'boolean', description: 'Whether there is a previous page' },
      nextCursor: { type: 'string', description: 'Cursor for next page', nullable: true },
      previousCursor: { type: 'string', description: 'Cursor for previous page', nullable: true },
    },
  })
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNext: boolean;
    hasPrevious: boolean;
    nextCursor?: string;
    previousCursor?: string;
  };
}

export class ErrorResponseDto {
  @ApiProperty({
    description: 'HTTP status code',
    example: 400,
  })
  statusCode: number;

  @ApiProperty({
    description: 'Error message',
    example: 'Validation failed',
  })
  message: string;

  @ApiProperty({
    description: 'Error type',
    example: 'Bad Request',
  })
  error: string;

  @ApiProperty({
    description: 'Request timestamp',
    example: '2023-12-01T10:00:00.000Z',
  })
  timestamp: string;

  @ApiProperty({
    description: 'Request path',
    example: '/api/v1/messages',
  })
  path: string;

  @ApiProperty({
    description: 'Correlation ID for request tracing',
    example: 'uuid-correlation-id',
  })
  correlationId: string;

  @ApiProperty({
    description: 'Validation errors (if applicable)',
    required: false,
    isArray: true,
    type: Object,
  })
  details?: any[];
}

export class SuccessResponseDto {
  @ApiProperty({
    description: 'Success message',
    example: 'Operation completed successfully',
  })
  message: string;

  @ApiProperty({
    description: 'HTTP status code',
    example: 200,
  })
  statusCode: number;

  @ApiProperty({
    description: 'Request timestamp',
    example: '2023-12-01T10:00:00.000Z',
  })
  timestamp: string;

  @ApiProperty({
    description: 'Correlation ID for request tracing',
    example: 'uuid-correlation-id',
  })
  correlationId: string;
}
