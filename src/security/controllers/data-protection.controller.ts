import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import {
  DataProtectionService,
  DataSubjectRequest,
  ConsentUpdate,
} from '../services/data-protection.service';
import { DataRetentionService } from '../services/data-retention.service';
import { ComplianceService } from '../services/compliance.service';
import { DataSubjectRequestType, ConsentType, DataType } from '@prisma/client';

@ApiTags('Data Protection')
@Controller('data-protection')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class DataProtectionController {
  constructor(
    private readonly dataProtectionService: DataProtectionService,
    private readonly dataRetentionService: DataRetentionService,
    private readonly complianceService: ComplianceService,
  ) {}

  @Post('requests')
  @ApiOperation({ summary: 'Submit a data subject request (GDPR)' })
  @ApiResponse({ status: 201, description: 'Request submitted successfully' })
  @HttpCode(HttpStatus.ACCEPTED)
  async submitDataSubjectRequest(
    @CurrentUser() user: any,
    @Body()
    requestData: {
      requestType: DataSubjectRequestType;
      data?: any;
      metadata?: Record<string, any>;
    },
  ) {
    const request: DataSubjectRequest = {
      userId: user.id,
      tenantId: user.tenantId,
      requestType: requestData.requestType,
      data: requestData.data,
      metadata: requestData.metadata,
    };

    await this.dataProtectionService.processDataSubjectRequest(request);

    return {
      message: 'Data subject request submitted successfully',
      requestType: requestData.requestType,
      status: 'processing',
    };
  }

  @Get('requests/:requestId')
  @ApiOperation({ summary: 'Get data subject request status' })
  @ApiResponse({ status: 200, description: 'Request status retrieved' })
  async getRequestStatus(@Param('requestId') requestId: string) {
    const request =
      await this.dataProtectionService.getRequestStatus(requestId);

    if (!request) {
      throw new NotFoundException('Request not found');
    }

    return {
      requestId: request.requestId,
      status: request.status,
      requestType: request.requestType,
      createdAt: request.createdAt,
      completedAt: request.completedAt,
      error: request.error || null,
    };
  }

  @Get('export')
  @ApiOperation({ summary: 'Export user data (GDPR Article 20)' })
  @ApiResponse({ status: 200, description: 'Data export initiated' })
  async exportUserData(@CurrentUser() user: any) {
    await this.dataProtectionService.processDataSubjectRequest({
      userId: user.id,
      tenantId: user.tenantId,
      requestType: DataSubjectRequestType.EXPORT,
      metadata: {
        reason: 'user_initiated_export',
        timestamp: new Date(),
      },
    });

    return {
      message: 'Data export request submitted',
      status: 'processing',
    };
  }

  @Delete('account')
  @ApiOperation({ summary: 'Request account deletion (GDPR Article 17)' })
  @ApiResponse({ status: 202, description: 'Deletion request submitted' })
  @HttpCode(HttpStatus.ACCEPTED)
  async requestAccountDeletion(@CurrentUser() user: any) {
    await this.dataProtectionService.processDataSubjectRequest({
      userId: user.id,
      tenantId: user.tenantId,
      requestType: DataSubjectRequestType.DELETION,
      metadata: {
        reason: 'user_initiated_deletion',
        timestamp: new Date(),
      },
    });

    return {
      message: 'Account deletion request submitted',
      status: 'processing',
      note: 'Your account will be anonymized or deleted according to our data retention policies',
    };
  }

  @Put('rectification')
  @ApiOperation({ summary: 'Request data rectification (GDPR Article 16)' })
  @ApiResponse({ status: 200, description: 'Data rectification completed' })
  async requestDataRectification(
    @CurrentUser() user: any,
    @Body()
    rectificationData: {
      displayName?: string;
      email?: string;
    },
  ) {
    await this.dataProtectionService.processDataSubjectRequest({
      userId: user.id,
      tenantId: user.tenantId,
      requestType: DataSubjectRequestType.RECTIFICATION,
      data: rectificationData,
      metadata: {
        reason: 'user_initiated_rectification',
        timestamp: new Date(),
      },
    });

    return {
      message: 'Data rectification request submitted',
      status: 'processing',
    };
  }

  @Get('consent')
  @ApiOperation({ summary: 'Get current consent status' })
  @ApiResponse({ status: 200, description: 'Consent status retrieved' })
  async getConsentStatus(@CurrentUser() user: any) {
    const consent = await this.dataProtectionService.getUserConsent(
      user.id,
      user.tenantId,
    );

    return {
      userId: user.id,
      consent,
      lastUpdated: new Date(),
    };
  }

  @Put('consent')
  @ApiOperation({ summary: 'Update consent preferences' })
  @ApiResponse({ status: 200, description: 'Consent updated successfully' })
  async updateConsent(
    @CurrentUser() user: any,
    @Body()
    consentData: {
      consentType: ConsentType;
      granted: boolean;
      version?: string;
    },
  ) {
    const consentUpdate: ConsentUpdate = {
      userId: user.id,
      tenantId: user.tenantId,
      consentType: consentData.consentType,
      granted: consentData.granted,
      version: consentData.version || '1.0',
      metadata: {
        updatedBy: 'user',
        timestamp: new Date(),
      },
    };

    await this.dataProtectionService.updateConsent(consentUpdate);

    return {
      message: 'Consent updated successfully',
      consentType: consentData.consentType,
      granted: consentData.granted,
    };
  }

  @Post('retention/apply')
  @ApiOperation({ summary: 'Apply data retention policies (Admin only)' })
  @ApiResponse({ status: 200, description: 'Retention policies applied' })
  async applyRetentionPolicies(
    @CurrentUser() user: any,
    @Body()
    options: {
      dataType?: DataType;
      dryRun?: boolean;
    } = {},
  ) {
    // In a real implementation, you'd check for admin permissions here
    if (!user.isAdmin) {
      throw new BadRequestException('Admin access required');
    }

    if (options.dryRun) {
      const status = await this.dataRetentionService.getRetentionStatus(
        user.tenantId,
      );
      return {
        message: 'Dry run completed',
        wouldProcess: status.stats,
        policies: status.policies,
      };
    }

    const result = await this.dataRetentionService.manualRetentionRun(
      user.tenantId,
      options.dataType,
    );

    return {
      message: 'Retention policies applied',
      processed: result.processed,
      errors: result.errors,
    };
  }

  @Get('retention/status')
  @ApiOperation({ summary: 'Get data retention status' })
  @ApiResponse({ status: 200, description: 'Retention status retrieved' })
  async getRetentionStatus(@CurrentUser() user: any) {
    const status = await this.dataRetentionService.getRetentionStatus(
      user.tenantId,
    );

    return {
      tenantId: user.tenantId,
      ...status,
    };
  }

  @Get('compliance/report')
  @ApiOperation({ summary: 'Generate compliance report (Admin only)' })
  @ApiResponse({ status: 200, description: 'Compliance report generated' })
  async generateComplianceReport(@CurrentUser() user: any) {
    // In a real implementation, you'd check for admin permissions here
    if (!user.isAdmin) {
      throw new BadRequestException('Admin access required');
    }

    const report = await this.complianceService.generateComplianceReport(
      user.tenantId,
    );

    return report;
  }

  @Post('retention/policies/default')
  @ApiOperation({ summary: 'Create default retention policies (Admin only)' })
  @ApiResponse({ status: 201, description: 'Default policies created' })
  async createDefaultRetentionPolicies(@CurrentUser() user: any) {
    // In a real implementation, you'd check for admin permissions here
    if (!user.isAdmin) {
      throw new BadRequestException('Admin access required');
    }

    await this.dataRetentionService.createDefaultRetentionPolicies(
      user.tenantId,
    );

    return {
      message: 'Default retention policies created successfully',
      tenantId: user.tenantId,
    };
  }
}
