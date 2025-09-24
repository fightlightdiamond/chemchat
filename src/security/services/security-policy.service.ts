import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../shared/infrastructure/prisma/prisma.service';
import { RedisService } from '../../shared/redis/redis.service';
import {
  SecurityPolicy,
  SecurityPolicyType,
} from '../interfaces/security.interface';

export interface PolicyEvaluationContext {
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
  action: string;
  resource?: string;
  metadata?: Record<string, any>;
  tenantId?: string;
  userRoles?: string[];
  requestMethod?: string;
  requestPath?: string;
  timestamp?: Date;
  deviceInfo?: Record<string, any>;
  locationInfo?: {
    country?: string;
    region?: string;
    city?: string;
    coordinates?: {
      latitude: number;
      longitude: number;
    };
  };
}

export interface SecurityPolicyAction {
  type: SecurityPolicyActionType;
  policyId: string;
  policyName: string;
  message: string;
  metadata: {
    policy: {
      id: string;
      name: string;
      priority?: number;
      conditions?: any;
    };
    context?: any;
  };
}

export enum SecurityPolicyActionType {
  ALLOW = 'ALLOW',
  DENY = 'DENY',
  LOG = 'LOG',
  NOTIFY = 'NOTIFY',
  REQUIRE_2FA = 'REQUIRE_2FA',
  REQUIRE_APPROVAL = 'REQUIRE_APPROVAL',
  QUARANTINE = 'QUARANTINE',
  RATE_LIMIT = 'RATE_LIMIT',
  BLOCK = 'BLOCK',
}

@Injectable()
export class SecurityPolicyService {
  private readonly logger = new Logger(SecurityPolicyService.name);
  private readonly POLICIES_CACHE_KEY = 'security:policies';
  private readonly CACHE_TTL = 5 * 60; // 5 minutes in seconds

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async createPolicyInDatabase(
    policy: Omit<SecurityPolicy, 'id' | 'createdAt' | 'updatedAt'> & {
      tenantId?: string;
    },
  ): Promise<SecurityPolicy> {
    const result = (await this.prisma.$queryRaw`
      INSERT INTO security_policies (
        name, 
        description, 
        is_enabled, 
        priority, 
        conditions, 
        actions, 
        tenant_id,
        type,
        rules
      ) VALUES (
        ${policy.name},
        ${policy.description || ''},
        ${policy.enabled || false},
        ${policy.priority || 0},
        ${JSON.stringify(policy.conditions || {})}::jsonb,
        ${JSON.stringify(policy.actions || [])}::text[],
        ${policy.tenantId || null},
        ${policy.type || 'access_control'},
        ${JSON.stringify(policy.rules || [])}::jsonb
      )
      RETURNING *;
    `) as any[];

    if (!result || !result[0]) {
      throw new Error('Failed to create security policy');
    }

    return this.mapDbToPolicy(result[0]);
  }

  async updatePolicy(
    id: string,
    updates: Partial<Omit<SecurityPolicy, 'id' | 'createdAt' | 'updatedAt'>> & {
      tenantId?: string;
    },
  ): Promise<SecurityPolicy | null> {
    // First check if the policy exists
    const existing = (await this.prisma.$queryRaw`
      SELECT id FROM security_policies WHERE id = ${id}::uuid LIMIT 1
    `) as any[];

    if (!existing || existing.length === 0) {
      return null;
    }

    // Build the SET clause dynamically based on provided updates
    const setClauses: string[] = [];
    const values: any[] = [id];
    let paramIndex = 2; // Start from $2 since $1 is the id

    if (updates.name !== undefined) {
      setClauses.push(`name = $${paramIndex++}`);
      values.push(updates.name);
    }

    if (updates.description !== undefined) {
      setClauses.push(`description = $${paramIndex++}`);
      values.push(updates.description);
    }

    if (updates.enabled !== undefined) {
      setClauses.push(`is_enabled = $${paramIndex++}`);
      values.push(updates.enabled);
    }

    if (updates.priority !== undefined) {
      setClauses.push(`priority = $${paramIndex++}`);
      values.push(updates.priority);
    }

    if (updates.conditions !== undefined) {
      setClauses.push(`conditions = $${paramIndex++}::jsonb`);
      values.push(JSON.stringify(updates.conditions));
    }

    if (updates.actions !== undefined) {
      setClauses.push(`actions = $${paramIndex++}::text[]`);
      values.push(updates.actions);
    }

    if (updates.tenantId !== undefined) {
      setClauses.push(`tenant_id = $${paramIndex++}`);
      values.push(updates.tenantId);
    }

    if (updates.type !== undefined) {
      setClauses.push(`type = $${paramIndex++}`);
      values.push(updates.type);
    }

    if (updates.rules !== undefined) {
      setClauses.push(`rules = $${paramIndex++}::jsonb`);
      values.push(JSON.stringify(updates.rules));
    }

    // Always update the updated_at timestamp
    setClauses.push('updated_at = NOW()');

    if (setClauses.length === 1) {
      // Only updated_at was added
      return this.getPolicyById(id);
    }

    const query = `
      UPDATE security_policies 
      SET ${setClauses.join(', ')}
      WHERE id = $1
      RETURNING *
    `;

    const result = (await this.prisma.$queryRawUnsafe(
      query,
      ...values,
    )) as any[];

    // Invalidate cache
    await this.invalidateCache();

    return result.length > 0 ? this.mapDbToPolicy(result[0]) : null;
  }

  async deletePolicy(id: string): Promise<boolean> {
    try {
      const result = await this.prisma.$executeRaw`
        DELETE FROM security_policies WHERE id = ${id}::uuid
      `;
      await this.invalidateCache();
      return result > 0;
    } catch (error) {
      this.logger.error(
        `Failed to delete policy ${id}: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  async getPolicy(id: string): Promise<SecurityPolicy | null> {
    const result = (await this.prisma.$queryRaw`
      SELECT * FROM security_policies WHERE id = ${id}::uuid LIMIT 1
    `) as any[];

    return result.length > 0 ? this.mapDbToPolicy(result[0]) : null;
  }

  async getPolicyById(id: string): Promise<SecurityPolicy | null> {
    try {
      const result = (await this.prisma.$queryRaw`
        SELECT * FROM security_policies WHERE id = ${id}::uuid LIMIT 1
      `) as any[];

      return result.length > 0 ? this.mapDbToPolicy(result[0]) : null;
    } catch (error) {
      this.logger.error(`Failed to get policy ${id}`, error);
      throw error;
    }
  }

  async listPolicies(includeDisabled = false): Promise<SecurityPolicy[]> {
    try {
      // Try to get from cache first
      const cachedPolicies = await this.redis.get(this.POLICIES_CACHE_KEY);
      if (cachedPolicies) {
        try {
          const parsed = JSON.parse(cachedPolicies) as SecurityPolicy[];
          return includeDisabled ? parsed : parsed.filter((p) => p.enabled);
        } catch (error) {
          this.logger.error('Failed to parse cached policies', error);
        }
      }

      // Fetch from database
      const whereClause = includeDisabled ? '' : 'WHERE is_enabled = true';
      const policies = (await this.prisma.$queryRaw`
        SELECT * FROM security_policies ${whereClause}
        ORDER BY priority DESC, name ASC
      `) as any[];

      const mappedPolicies = policies.map((policy) =>
        this.mapDbToPolicy(policy),
      );

      // Cache the result
      try {
        await this.redis.setex(
          this.POLICIES_CACHE_KEY,
          this.CACHE_TTL,
          JSON.stringify(mappedPolicies),
        );
      } catch (error) {
        this.logger.error('Failed to cache policies', error);
      }

      return mappedPolicies;
    } catch (error) {
      this.logger.error('Failed to list policies', error);
      throw error;
    }
  }

  async evaluatePolicies(
    context: PolicyEvaluationContext,
  ): Promise<SecurityPolicyAction[]> {
    try {
      if (!context) {
        throw new Error('Evaluation context is required');
      }

      const policies = await this.listPolicies();
      const actions: SecurityPolicyAction[] = [];

      if (!Array.isArray(policies)) {
        this.logger.warn('No policies found or invalid policies returned');
        return [];
      }

      const sortedPolicies = [...policies].sort(
        (a, b) => (b.priority || 0) - (a.priority || 0),
      );

      for (const policy of sortedPolicies) {
        if (this.matchesPolicy(policy, context)) {
          const action: SecurityPolicyAction = {
            type: policy.actions?.includes('allow')
              ? SecurityPolicyActionType.ALLOW
              : SecurityPolicyActionType.DENY,
            policyId: policy.id,
            policyName: policy.name || 'Unnamed Policy',
            message: this.getPolicyResultMessage(policy, context),
            metadata: {
              policy: {
                id: policy.id,
                name: policy.name || '',
                priority: policy.priority,
                conditions: policy.conditions || {},
              },
              context,
            },
          };
          actions.push(action);

          // If this policy has a final decision, stop evaluating
          if (policy.actions?.includes('final')) {
            break;
          }
        }
      }
      return actions;
    } catch (error) {
      this.logger.error('Error evaluating policies', error);
      return [];
    }
  }

  private async invalidateCache(): Promise<void> {
    try {
      if (!this.redis) {
        this.logger.warn('Redis client not available');
        return;
      }

      await this.redis.del(this.POLICIES_CACHE_KEY);
    } catch (error) {
      this.logger.error(
        `Failed to invalidate cache: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private matchesPolicy(
    policy: SecurityPolicy,
    context: PolicyEvaluationContext,
  ): boolean {
    if (!policy.enabled) return false;

    // Check if policy applies to the current tenant
    if (policy.tenantId && policy.tenantId !== context.tenantId) {
      return false;
    }

    // Check conditions if any
    if (policy.conditions && Object.keys(policy.conditions).length > 0) {
      return this.evaluateConditions(policy.conditions, context);
    }

    return true;
  }

  private evaluateConditions(
    conditions: Record<string, any>,
    context: PolicyEvaluationContext,
  ): boolean {
    return Object.entries(conditions).every(([key, condition]) => {
      const value = this.getValueFromContext(key, context);
      return this.evaluateCondition(value, condition, context);
    });
  }

  private evaluateCondition(
    value: any,
    condition: any,
    context: PolicyEvaluationContext,
  ): boolean {
    if (condition === undefined || condition === null) {
      return true;
    }

    // Handle different condition types
    if (typeof condition === 'object' && !Array.isArray(condition)) {
      return this.evaluateObjectCondition(value, condition, context);
    }

    // Simple equality check
    return value === condition;
  }

  private evaluateObjectCondition(
    value: any,
    condition: Record<string, any>,
    context: PolicyEvaluationContext,
  ): boolean {
    return Object.entries(condition).every(([op, opValue]) => {
      switch (op) {
        case '$eq':
          return value === opValue;
        case '$ne':
          return value !== opValue;
        case '$gt':
          return value > opValue;
        case '$gte':
          return value >= opValue;
        case '$lt':
          return value < opValue;
        case '$lte':
          return value <= opValue;
        case '$in':
          return Array.isArray(opValue) && opValue.includes(value);
        case '$nin':
          return Array.isArray(opValue) && !opValue.includes(value);
        case '$regex':
          return new RegExp(opValue).test(String(value));
        case '$exists':
          return (value !== undefined && value !== null) === opValue;
        case '$and':
          return (
            Array.isArray(opValue) &&
            opValue.every((c) => this.evaluateCondition(value, c, context))
          );
        case '$or':
          return (
            Array.isArray(opValue) &&
            opValue.some((c) => this.evaluateCondition(value, c, context))
          );
        case '$not':
          return !this.evaluateCondition(value, opValue, context);
        default:
          this.logger.warn(`Unsupported condition operator: ${op}`);
          return false;
      }
    });
  }

  private getValueFromContext(
    key: string,
    context: PolicyEvaluationContext,
  ): any {
    if (!key) return undefined;

    // Handle nested properties with dot notation
    return key.split('.').reduce((value, k) => {
      if (value === null || value === undefined) {
        return undefined;
      }
      return value[k];
    }, context as any);
  }

  private getPolicyResultMessage(
    policy: SecurityPolicy,
    context: PolicyEvaluationContext,
  ): string {
    const action = policy.actions?.includes('allow') ? 'Allowed' : 'Denied';
    const reason = policy.description || 'No reason provided';
    const policyName = policy.name || 'Unnamed Policy';
    const resource = context.resource ? ` on resource ${context.resource}` : '';

    return `${action} by policy "${policyName}"${resource}: ${reason}`;
  }

  private mapDbToPolicy(dbPolicy: any): SecurityPolicy {
    // Ensure we have a valid policy
    if (!dbPolicy) {
      throw new Error('Invalid policy data');
    }

    // Handle conditions - could be string or object
    let conditions: Record<string, unknown> = {};
    try {
      conditions =
        typeof dbPolicy.conditions === 'string'
          ? JSON.parse(dbPolicy.conditions)
          : dbPolicy.conditions || {};
    } catch (error) {
      this.logger.warn(
        `Failed to parse conditions for policy ${dbPolicy.id}`,
        error,
      );
      conditions = {};
    }

    // Handle actions - ensure it's always an array
    let actions: string[] = [];
    if (Array.isArray(dbPolicy.actions)) {
      actions = dbPolicy.actions;
    } else if (dbPolicy.actions) {
      actions = [dbPolicy.actions];
    }

    // Handle rules - ensure it's always an array
    let rules: any[] = [];
    try {
      if (Array.isArray(dbPolicy.rules)) {
        rules = dbPolicy.rules;
      } else if (typeof dbPolicy.rules === 'string') {
        rules = JSON.parse(dbPolicy.rules);
      } else if (dbPolicy.rules) {
        rules = [dbPolicy.rules];
      }
    } catch (error) {
      this.logger.warn(
        `Failed to parse rules for policy ${dbPolicy.id}`,
        error,
      );
      rules = [];
    }

    // Map database fields to SecurityPolicy interface
    return {
      id: dbPolicy.id,
      name: dbPolicy.name || '',
      description: dbPolicy.description || '',
      type:
        (dbPolicy.type as SecurityPolicyType) ||
        SecurityPolicyType.ACCESS_CONTROL,
      rules,
      enabled: Boolean(dbPolicy.enabled || dbPolicy.is_enabled),
      priority: Number(dbPolicy.priority) || 0,
      conditions,
      actions,
      createdAt: dbPolicy.created_at
        ? new Date(dbPolicy.created_at)
        : new Date(),
      updatedAt: dbPolicy.updated_at
        ? new Date(dbPolicy.updated_at)
        : new Date(),
      tenantId: dbPolicy.tenant_id || dbPolicy.tenantId || null,
    };
  }
}
