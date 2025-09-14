import { Injectable, Logger, ConflictException } from '@nestjs/common';
import { PrismaService } from '../infrastructure/prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { TenantContext, TenantSettings, TenantQuota, TenantUsage, SubscriptionTier } from '../interfaces/tenant.interface';

@Injectable()
export class TenantService {
  private readonly logger = new Logger(TenantService.name);
  private readonly TENANT_CACHE_PREFIX = 'tenant:';
  private readonly CACHE_TTL = 300; // 5 minutes

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async getTenant(tenantId: string): Promise<TenantContext | null> {
    try {
      // Check cache first
      const cacheKey = `${this.TENANT_CACHE_PREFIX}${tenantId}`;
      const cached = await this.redis.get(cacheKey);
      
      if (cached) {
        this.logger.debug(`Tenant found in cache: ${tenantId}`);
        return JSON.parse(cached);
      }

      // TODO: Uncomment after database migration is applied
      // const tenant = await this.prisma.tenant.findUnique({
      //   where: { id: tenantId },
      //   include: {
      //     settings: true,
      //   },
      // });
      
      // Temporary: Return null until migration is complete
      this.logger.debug(`Tenant lookup for ${tenantId} - migration pending`);
      return null;
    } catch (error) {
      this.logger.error(`Error fetching tenant ${tenantId}: ${error.message}`, error.stack);
      throw error;
    }
  }

  async createTenant(data: {
    name: string;
    subscriptionTier: SubscriptionTier;
    adminEmail: string;
    adminName: string;
  }): Promise<TenantContext> {
    try {
      // TODO: Uncomment after database migration is applied
      // const existing = await this.prisma.tenant.findFirst({
      //   where: { name: data.name },
      // });
      const existing = null; // Temporary until migration

      if (existing) {
        throw new ConflictException('Tenant name already exists');
      }

      // Temporary mock tenant until migration
      const tenant = {
        id: 'temp-tenant-id',
        name: data.name,
        subscriptionTier: data.subscriptionTier,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const tenantContext: TenantContext = {
        tenantId: tenant.id,
        tenantName: tenant.name,
        subscriptionTier: tenant.subscriptionTier,
        isActive: tenant.isActive,
        createdAt: tenant.createdAt,
        updatedAt: tenant.updatedAt,
      };

      this.logger.log(`Created new tenant: ${tenant.id} (${tenant.name})`);
      return tenantContext;
    } catch (error) {
      this.logger.error(`Error creating tenant: ${error.message}`, error.stack);
      throw error;
    }
  }

  async getTenantQuota(tenantId: string): Promise<TenantQuota | null> {
    try {
      // TODO: Uncomment after database migration is applied
      // const quota = await this.prisma.tenantQuota.findUnique({
      //   where: { tenantId },
      // });
      const quota = null; // Temporary until migration

      this.logger.debug(`Getting tenant quota for ${tenantId}`);
      return quota;
    } catch (error) {
      this.logger.error(`Error fetching tenant quota ${tenantId}: ${error.message}`, error.stack);
      throw error;
    }
  }

  async getTenantUsage(tenantId: string): Promise<TenantUsage | null> {
    try {
      // TODO: Uncomment after database migration is applied
      // const usage = await this.prisma.tenantUsage.findUnique({
      //   where: { tenantId },
      // });
      const usage = null; // Temporary until migration

      this.logger.debug(`Getting tenant usage for ${tenantId}`);
      return usage;
    } catch (error) {
      this.logger.error(`Error fetching tenant usage ${tenantId}: ${error.message}`, error.stack);
      throw error;
    }
  }

  async updateTenantUsage(tenantId: string, updates: Partial<TenantUsage>): Promise<void> {
    try {
      // TODO: Uncomment after database migration is applied
      // await this.prisma.tenantUsage.update({
      //   where: { tenantId },
      //   data: {
      //     ...updates,
      //     updatedAt: new Date(),
      //   },
      // });
      this.logger.debug(`Updated tenant usage for ${tenantId} with ${Object.keys(updates).length} fields`);
    } catch (error) {
      this.logger.error(`Error updating tenant usage ${tenantId}: ${error.message}`, error.stack);
      throw error;
    }
  }

  async getTenantSettings(tenantId: string): Promise<TenantSettings | null> {
    try {
      // TODO: Uncomment after database migration is applied
      // const settings = await this.prisma.tenantSettings.findUnique({
      //   where: { tenantId },
      // });
      const settings = null; // Temporary until migration

      this.logger.debug(`Getting tenant settings for ${tenantId}`);
      return settings;
    } catch (error) {
      this.logger.error(`Error fetching tenant settings ${tenantId}: ${error.message}`, error.stack);
      throw error;
    }
  }

  async invalidateTenantCache(tenantId: string): Promise<void> {
    try {
      const cacheKey = `${this.TENANT_CACHE_PREFIX}${tenantId}`;
      await this.redis.del(cacheKey);
      this.logger.debug(`Invalidated tenant cache: ${tenantId}`);
    } catch (error) {
      this.logger.error(`Error invalidating tenant cache ${tenantId}: ${error.message}`, error.stack);
    }
  }

  private getDefaultTenantSettings(tier: SubscriptionTier): Partial<TenantSettings> {
    const baseSettings = {
      allowFileUploads: true,
      retentionDays: 90,
      enableNotifications: true,
      enableSearch: true,
      customBranding: false,
      ssoEnabled: false,
    };

    switch (tier) {
      case SubscriptionTier.FREE:
        return {
          ...baseSettings,
          maxFileSize: 5 * 1024 * 1024, // 5MB
          allowedFileTypes: ['image/jpeg', 'image/png', 'text/plain'],
        };
      case SubscriptionTier.BASIC:
        return {
          ...baseSettings,
          maxFileSize: 25 * 1024 * 1024, // 25MB
          allowedFileTypes: ['image/*', 'text/*', 'application/pdf'],
        };
      case SubscriptionTier.PREMIUM:
        return {
          ...baseSettings,
          maxFileSize: 100 * 1024 * 1024, // 100MB
          allowedFileTypes: ['*/*'],
          customBranding: true,
        };
      case SubscriptionTier.ENTERPRISE:
        return {
          ...baseSettings,
          maxFileSize: 500 * 1024 * 1024, // 500MB
          allowedFileTypes: ['*/*'],
          customBranding: true,
          ssoEnabled: true,
        };
      default:
        return baseSettings;
    }
  }

  private getDefaultTenantQuota(tier: SubscriptionTier): Partial<TenantQuota> {
    switch (tier) {
      case SubscriptionTier.FREE:
        return {
          maxUsers: 5,
          maxConversations: 10,
          maxMessagesPerDay: 100,
          maxStorageBytes: 100 * 1024 * 1024, // 100MB
          maxConnectionsPerUser: 2,
          maxApiRequestsPerHour: 100,
        };
      case SubscriptionTier.BASIC:
        return {
          maxUsers: 25,
          maxConversations: 50,
          maxMessagesPerDay: 1000,
          maxStorageBytes: 1024 * 1024 * 1024, // 1GB
          maxConnectionsPerUser: 5,
          maxApiRequestsPerHour: 1000,
        };
      case SubscriptionTier.PREMIUM:
        return {
          maxUsers: 100,
          maxConversations: 200,
          maxMessagesPerDay: 10000,
          maxStorageBytes: 10 * 1024 * 1024 * 1024, // 10GB
          maxConnectionsPerUser: 10,
          maxApiRequestsPerHour: 10000,
        };
      case SubscriptionTier.ENTERPRISE:
        return {
          maxUsers: -1, // Unlimited
          maxConversations: -1, // Unlimited
          maxMessagesPerDay: -1, // Unlimited
          maxStorageBytes: 100 * 1024 * 1024 * 1024, // 100GB
          maxConnectionsPerUser: 25,
          maxApiRequestsPerHour: 100000,
        };
      default:
        return {
          maxUsers: 5,
          maxConversations: 10,
          maxMessagesPerDay: 100,
          maxStorageBytes: 100 * 1024 * 1024,
          maxConnectionsPerUser: 2,
          maxApiRequestsPerHour: 100,
        };
    }
  }
}
