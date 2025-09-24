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
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
  ApiParam,
} from '@nestjs/swagger';
import { TenantService } from '../services/tenant.service';
import { QuotaTrackingService, QuotaType } from '../services/quota-tracking.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantRequest, SubscriptionTier } from '../interfaces/tenant.interface';
import { TenantScoped } from '../decorators/tenant-scoped.decorator';

@ApiTags('tenant')
@ApiBearerAuth('JWT-auth')
@Controller('tenant')
@UseGuards(JwtAuthGuard)
@TenantScoped()
export class TenantController {
  constructor(
    private readonly tenantService: TenantService,
    private readonly quotaTrackingService: QuotaTrackingService,
  ) {}

  @ApiOperation({ summary: 'Create tenant', description: 'Create a new tenant with specified subscription tier and admin user' })
  @ApiBody({ schema: { type: 'object', properties: { name: { type: 'string' }, subscriptionTier: { type: 'string', enum: ['FREE', 'BASIC', 'PREMIUM', 'ENTERPRISE'] }, adminEmail: { type: 'string', format: 'email' }, adminName: { type: 'string' } }, required: ['name', 'subscriptionTier', 'adminEmail', 'adminName'] } })
  @ApiResponse({ status: 201, description: 'Tenant created successfully', schema: { type: 'object', properties: { statusCode: { type: 'number' }, message: { type: 'string' }, data: { type: 'object' } } } })
  @ApiResponse({ status: 400, description: 'Failed to create tenant' })
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

  @ApiOperation({ summary: 'Get tenant info', description: 'Get comprehensive tenant information including quota, usage, and settings' })
  @ApiResponse({ status: 200, description: 'Tenant information retrieved successfully', schema: { type: 'object', properties: { statusCode: { type: 'number' }, data: { type: 'object', properties: { tenant: { type: 'object' }, quota: { type: 'object' }, usage: { type: 'object' }, settings: { type: 'object' } } } } } })
  @ApiResponse({ status: 400, description: 'Tenant ID is required' })
  @ApiResponse({ status: 500, description: 'Failed to fetch tenant information' })
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

  @ApiOperation({ summary: 'Get quota usage', description: 'Get detailed quota usage information and utilization percentages' })
  @ApiResponse({ status: 200, description: 'Quota usage retrieved successfully', schema: { type: 'object', properties: { statusCode: { type: 'number' }, data: { type: 'object', properties: { quota: { type: 'object' }, usage: { type: 'object' }, utilization: { type: 'object', properties: { users: { type: 'number' }, conversations: { type: 'number' }, messagesDaily: { type: 'number' }, storage: { type: 'number' }, apiRequestsHourly: { type: 'number' } } } } } } } })
  @ApiResponse({ status: 400, description: 'Tenant ID is required' })
  @ApiResponse({ status: 500, description: 'Failed to fetch quota usage' })
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

  @ApiOperation({ summary: 'Check quota', description: 'Check if tenant has sufficient quota for a specific resource type' })
  @ApiParam({ name: 'type', description: 'Quota type to check', enum: ['MESSAGES', 'API_REQUESTS', 'CONNECTIONS', 'STORAGE', 'USERS'] })
  @ApiBody({ schema: { type: 'object', properties: { amount: { type: 'number', description: 'Amount to check (default: 1)' } } }, required: false })
  @ApiResponse({ status: 200, description: 'Quota check completed', schema: { type: 'object', properties: { statusCode: { type: 'number' }, data: { type: 'object' } } } })
  @ApiResponse({ status: 400, description: 'Invalid quota type or tenant ID required' })
  @ApiResponse({ status: 500, description: 'Failed to check quota' })
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
