import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../infrastructure/prisma/prisma.service';

export interface TenantScopedQuery {
  tenantId: string;
  [key: string]: any;
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

@Injectable()
export abstract class BaseTenantRepository {
  protected readonly logger = new Logger(this.constructor.name);

  constructor(protected readonly prisma: PrismaService) {}

  /**
   * Ensures all queries include tenant filtering
   */
  protected addTenantScope(query: any, tenantId: string): TenantScopedQuery {
    return {
      ...query,
      tenantId,
    };
  }

  /**
   * Creates a tenant-scoped where clause
   */
  protected createTenantWhere(where: any, tenantId: string): any {
    if (!where) {
      return { tenantId };
    }

    if (typeof where === 'object' && !Array.isArray(where)) {
      return {
        ...where,
        tenantId,
      };
    }

    return {
      AND: [
        { tenantId },
        where,
      ],
    };
  }

  /**
   * Validates that the result belongs to the correct tenant
   */
  protected validateTenantOwnership(result: any, tenantId: string): boolean {
    if (!result) {
      return true; // null/undefined results are valid
    }

    if (Array.isArray(result)) {
      return result.every(item => !item.tenantId || item.tenantId === tenantId);
    }

    return !result.tenantId || result.tenantId === tenantId;
  }

  /**
   * Generic find method with tenant scoping
   */
  protected async findManyWithTenant<TModel>(
    model: any,
    tenantId: string,
    options: {
      where?: any;
      include?: any;
      select?: any;
      orderBy?: any;
      skip?: number;
      take?: number;
    } = {}
  ): Promise<TModel[]> {
    const { where, ...restOptions } = options;
    
    const results = await model.findMany({
      ...restOptions,
      where: this.createTenantWhere(where, tenantId),
    });

    // Validate tenant ownership
    if (!this.validateTenantOwnership(results, tenantId)) {
      this.logger.error(`Tenant validation failed for findMany operation: ${tenantId}`);
      throw new Error('Tenant validation failed');
    }

    return results;
  }

  /**
   * Generic find unique method with tenant scoping
   */
  protected async findUniqueWithTenant<TModel>(
    model: any,
    tenantId: string,
    options: {
      where: any;
      include?: any;
      select?: any;
    }
  ): Promise<TModel | null> {
    const { where, ...restOptions } = options;
    
    const result = await model.findFirst({
      ...restOptions,
      where: this.createTenantWhere(where, tenantId),
    });

    // Validate tenant ownership
    if (!this.validateTenantOwnership(result, tenantId)) {
      this.logger.error(`Tenant validation failed for findUnique operation: ${tenantId}`);
      throw new Error('Tenant validation failed');
    }

    return result;
  }

  /**
   * Generic create method with tenant scoping
   */
  protected async createWithTenant<TModel>(
    model: any,
    tenantId: string,
    data: any,
    options: {
      include?: any;
      select?: any;
    } = {}
  ): Promise<TModel> {
    const tenantScopedData = {
      ...data,
      tenantId,
    };

    return await model.create({
      data: tenantScopedData,
      ...options,
    });
  }

  /**
   * Generic update method with tenant scoping
   */
  protected async updateWithTenant<TModel>(
    model: any,
    tenantId: string,
    where: any,
    data: any,
    options: {
      include?: any;
      select?: any;
    } = {}
  ): Promise<TModel> {
    const result = await model.update({
      where: this.createTenantWhere(where, tenantId),
      data,
      ...options,
    });

    // Validate tenant ownership
    if (!this.validateTenantOwnership(result, tenantId)) {
      this.logger.error(`Tenant validation failed for update operation: ${tenantId}`);
      throw new Error('Tenant validation failed');
    }

    return result;
  }

  /**
   * Generic delete method with tenant scoping
   */
  protected async deleteWithTenant<TModel>(
    model: any,
    tenantId: string,
    where: any
  ): Promise<TModel> {
    const result = await model.delete({
      where: this.createTenantWhere(where, tenantId),
    });

    // Validate tenant ownership
    if (!this.validateTenantOwnership(result, tenantId)) {
      this.logger.error(`Tenant validation failed for delete operation: ${tenantId}`);
      throw new Error('Tenant validation failed');
    }

    return result;
  }

  /**
   * Generic count method with tenant scoping
   */
  protected async countWithTenant(
    model: any,
    tenantId: string,
    where: any = {}
  ): Promise<number> {
    return await model.count({
      where: this.createTenantWhere(where, tenantId),
    });
  }

  /**
   * Paginated query with tenant scoping
   */
  protected async findManyPaginatedWithTenant<TModel>(
    model: any,
    tenantId: string,
    options: {
      where?: any;
      include?: any;
      select?: any;
      orderBy?: any;
      page?: number;
      limit?: number;
    } = {}
  ): Promise<PaginatedResult<TModel>> {
    const { where, page = 1, limit = 20, ...restOptions } = options;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.findManyWithTenant<TModel>(model, tenantId, {
        ...restOptions,
        where,
        skip,
        take: limit,
      }),
      this.countWithTenant(model, tenantId, where),
    ]);

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
}
