export interface BaseRepository<T, ID = string> {
  /**
   * Find entity by ID
   */
  findById(id: ID): Promise<T | null>;

  /**
   * Find all entities with optional pagination
   */
  findAll(options?: PaginationOptions): Promise<PaginatedResult<T>>;

  /**
   * Create a new entity
   */
  create(entity: T): Promise<T>;

  /**
   * Update an existing entity
   */
  update(id: ID, entity: Partial<T>): Promise<T>;

  /**
   * Delete an entity by ID
   */
  delete(id: ID): Promise<void>;

  /**
   * Check if entity exists by ID
   */
  exists(id: ID): Promise<boolean>;

  /**
   * Count total entities with optional filter
   */
  count(filter?: Record<string, unknown>): Promise<number>;

  /**
   * Find entities by multiple IDs
   */
  findByIds(ids: ID[]): Promise<T[]>;

  /**
   * Create multiple entities in a transaction
   */
  createMany(entities: T[]): Promise<T[]>;

  /**
   * Update multiple entities in a transaction
   */
  updateMany(updates: Array<{ id: ID; data: Partial<T> }>): Promise<T[]>;

  /**
   * Delete multiple entities by IDs
   */
  deleteMany(ids: ID[]): Promise<void>;
}

export interface PaginationOptions {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

export interface FilterOptions {
  where?: Record<string, unknown>;
  include?: Record<string, unknown>;
  orderBy?: Record<string, 'asc' | 'desc'>;
}

export abstract class BaseRepositoryImpl<T, ID = string>
  implements BaseRepository<T, ID>
{
  protected abstract entityName: string;

  abstract findById(id: ID): Promise<T | null>;
  abstract findAll(options?: PaginationOptions): Promise<PaginatedResult<T>>;
  abstract create(entity: T): Promise<T>;
  abstract update(id: ID, entity: Partial<T>): Promise<T>;
  abstract delete(id: ID): Promise<void>;
  abstract exists(id: ID): Promise<boolean>;
  abstract count(filter?: Record<string, unknown>): Promise<number>;
  abstract findByIds(ids: ID[]): Promise<T[]>;
  abstract createMany(entities: T[]): Promise<T[]>;
  abstract updateMany(
    updates: Array<{ id: ID; data: Partial<T> }>,
  ): Promise<T[]>;
  abstract deleteMany(ids: ID[]): Promise<void>;

  /**
   * Create paginated result helper
   */
  protected createPaginatedResult<U>(
    data: U[],
    total: number,
    page: number,
    limit: number,
  ): PaginatedResult<U> {
    const totalPages = Math.ceil(total / limit);

    return {
      data,
      total,
      page,
      limit,
      totalPages,
      hasNext: page < totalPages,
      hasPrevious: page > 1,
    };
  }

  /**
   * Calculate pagination offset
   */
  protected calculateOffset(page: number, limit: number): number {
    return (page - 1) * limit;
  }

  /**
   * Validate pagination options
   */
  protected validatePaginationOptions(options?: PaginationOptions): {
    page: number;
    limit: number;
  } {
    const page = Math.max(1, options?.page || 1);
    const limit = Math.min(100, Math.max(1, options?.limit || 10));

    return { page, limit };
  }

  /**
   * Handle repository errors
   */
  protected handleError(error: unknown, operation: string): never {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const message = `${this.entityName} repository ${operation} failed: ${errorMessage}`;
    throw new Error(message);
  }
}
