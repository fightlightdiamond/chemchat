import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Request,
  HttpStatus,
  HttpException,
} from '@nestjs/common';
import { TenantService } from '../services/tenant.service';
import { QuotaTrackingService, QuotaType } from '../services/quota-tracking.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantRequest, SubscriptionTier } from '../interfaces/tenant.interface';
import { TenantScoped } from '../decorators/tenant-scoped.decorator';

@Controller('tenant')
@UseGuards(JwtAuthGuard)
@TenantScoped()
export class TenantController {
  constructor(
    private readonly tenantService: TenantService,
    private readonly quotaTrackingService: QuotaTrackingService,
  ) {}

  @Post()
  async createTenant(@Body() createTenantDto: {
    name: string;
    subscriptionTier: SubscriptionTier;
    adminEmail: string;
    adminName: string;
  }) {
    try {
      const tenant = await this.tenantService.createTenant(createTenantDto);
      return {
        statusCode: HttpStatus.CREATED,
        message: 'Tenant created successfully',
        data: tenant,
      };
    } catch (error) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Failed to create tenant',
          error: error.message,
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Get('info')
  async getTenantInfo(@Request() req: TenantRequest) {
    const tenantId = req.tenantId;
    if (!tenantId) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Tenant ID is required',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      const [tenant, quota, usage, settings] = await Promise.all([
        this.tenantService.getTenant(tenantId),
        this.tenantService.getTenantQuota(tenantId),
        this.tenantService.getTenantUsage(tenantId),
        this.tenantService.getTenantSettings(tenantId),
      ]);

      return {
        statusCode: HttpStatus.OK,
        data: {
          tenant,
          quota,
          usage,
          settings,
        },
      };
    } catch (error) {
      throw new HttpException(
        {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Failed to fetch tenant information',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('quota/usage')
  async getQuotaUsage(@Request() req: TenantRequest) {
    const tenantId = req.tenantId;
    if (!tenantId) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Tenant ID is required',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      const [quota, usage] = await Promise.all([
        this.tenantService.getTenantQuota(tenantId),
        this.tenantService.getTenantUsage(tenantId),
      ]);

      // Get current usage for different quota types
      const [
        currentMessages,
        currentApiRequests,
        currentConnections,
      ] = await Promise.all([
        this.quotaTrackingService.getCurrentUsage(tenantId, QuotaType.MESSAGES),
        this.quotaTrackingService.getCurrentUsage(tenantId, QuotaType.API_REQUESTS),
        this.quotaTrackingService.getCurrentUsage(tenantId, QuotaType.CONNECTIONS),
      ]);

      return {
        statusCode: HttpStatus.OK,
        data: {
          quota,
          usage: {
            ...usage,
            messagesUsedToday: currentMessages,
            apiRequestsThisHour: currentApiRequests,
            currentConnections,
          },
          utilization: quota ? {
            users: quota.maxUsers > 0 ? (usage?.currentUsers || 0) / quota.maxUsers : 0,
            conversations: quota.maxConversations > 0 ? (usage?.currentConversations || 0) / quota.maxConversations : 0,
            messagesDaily: quota.maxMessagesPerDay > 0 ? currentMessages / quota.maxMessagesPerDay : 0,
            storage: quota.maxStorageBytes > 0 ? (usage?.storageUsedBytes || 0) / Number(quota.maxStorageBytes) : 0,
            apiRequestsHourly: quota.maxApiRequestsPerHour > 0 ? currentApiRequests / quota.maxApiRequestsPerHour : 0,
          } : null,
        },
      };
    } catch (error) {
      throw new HttpException(
        {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Failed to fetch quota usage',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('quota/check/:type')
  async checkQuota(
    @Request() req: TenantRequest,
    @Param('type') type: string,
    @Body() body: { amount?: number } = {},
  ) {
    const tenantId = req.tenantId;
    if (!tenantId) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Tenant ID is required',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    // Validate quota type
    const quotaType = type.toUpperCase() as QuotaType;
    if (!Object.values(QuotaType).includes(quotaType)) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Invalid quota type',
          validTypes: Object.values(QuotaType),
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      const result = await this.quotaTrackingService.checkQuota(
        tenantId,
        quotaType,
        body.amount || 1,
      );

      return {
        statusCode: HttpStatus.OK,
        data: result,
      };
    } catch (error) {
      throw new HttpException(
        {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Failed to check quota',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
