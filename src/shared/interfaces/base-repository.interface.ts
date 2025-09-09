export interface BaseRepository<T, ID> {
  findById(id: ID): Promise<T | null>;
  save(entity: T): Promise<T>;
  delete(id: ID): Promise<void>;
  findAll(criteria?: any): Promise<T[]>;
}

export interface QueryCriteria {
  limit?: number;
  offset?: number;
  orderBy?: string;
  orderDirection?: 'ASC' | 'DESC';
}

export interface Pagination {
  limit: number;
  offset: number;
}

export interface PageResult<T> {
  data: T[];
  total: number;
  hasMore: boolean;
}
