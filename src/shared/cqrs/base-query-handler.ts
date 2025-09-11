import { BaseQuery } from './base-query';
import { Logger } from '@nestjs/common';

export abstract class BaseQueryHandler<T extends BaseQuery, R = unknown> {
  protected readonly logger = new Logger(this.constructor.name);

  abstract execute(query: T): Promise<R>;

  protected logQueryExecution(query: T): void {
    this.logger.log(`Executing query: ${query.constructor.name}`, {
      correlationId: query.correlationId,
      userId: query.userId,
      tenantId: query.tenantId,
    });
  }

  protected logQuerySuccess(query: T, result?: R): void {
    this.logger.log(`Query executed successfully: ${query.constructor.name}`, {
      correlationId: query.correlationId,
      userId: query.userId,
      tenantId: query.tenantId,
      resultCount: Array.isArray(result) ? result.length : undefined,
    });
  }

  protected logQueryError(query: T, error: Error): void {
    this.logger.error(`Query execution failed: ${query.constructor.name}`, {
      correlationId: query.correlationId,
      userId: query.userId,
      tenantId: query.tenantId,
      error: error.message,
      stack: error.stack,
    });
  }
}
