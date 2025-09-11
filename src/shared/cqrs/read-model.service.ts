import { Injectable, Logger } from '@nestjs/common';
import { PaginatedResult, PaginationQuery } from './pagination.dto';

export interface ReadModelProjection<T> {
  id: string;
  data: T;
  version: number;
  lastUpdated: Date;
  tenantId?: string;
}

@Injectable()
export abstract class BaseReadModelService<T> {
  protected readonly logger = new Logger(this.constructor.name);

  abstract findById(
    id: string,
    tenantId?: string,
  ): Promise<ReadModelProjection<T> | null>;
  abstract findMany(
    filter: Partial<T>,
    pagination?: PaginationQuery,
    tenantId?: string,
  ): Promise<PaginatedResult<ReadModelProjection<T>>>;
  abstract upsert(projection: ReadModelProjection<T>): Promise<void>;
  abstract delete(id: string, tenantId?: string): Promise<void>;
  abstract rebuild(fromVersion?: number): Promise<void>;

  public createProjection(
    id: string,
    data: T,
    version: number = 1,
    tenantId?: string,
  ): ReadModelProjection<T> {
    return {
      id,
      data,
      version,
      lastUpdated: new Date(),
      tenantId,
    };
  }

  protected logProjectionUpdate(id: string, version: number): void {
    this.logger.log(
      `Updated read model projection: ${id} (version: ${version})`,
    );
  }

  protected logProjectionError(id: string, error: Error): void {
    this.logger.error(`Failed to update read model projection: ${id}`, {
      error: error.message,
      stack: error.stack,
    });
  }
}
