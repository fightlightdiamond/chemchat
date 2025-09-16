import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Put,
  UseGuards,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/enums/user-role.enum';
import { CreateSecurityPolicyDto } from '../dto/create-security-policy.dto';
import {
  SecurityAuditService,
  SecurityEventType,
} from '../services/security-audit.service';
import { DataType } from '@prisma/client';
import {
  SecurityPolicyService,
  PolicyEvaluationContext,
} from '../services/security-policy.service';
import { SecurityPolicy } from '../interfaces/security.interface';
import {
  VulnerabilityScanningService,
  ScanType,
  ScanResult,
} from '../services/vulnerability-scanning.service';
import { ComplianceService } from '../services/compliance.service';

export class UpdateSecurityPolicyDto {
  name?: string;
  description?: string;
  isEnabled?: boolean;
  priority?: number;
  conditions?: Record<string, any>;
  actions?: string[];
}

export class EvaluatePolicyDto implements PolicyEvaluationContext {
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
  action: string;
  resource?: string;
  metadata?: Record<string, any>;
}

@ApiTags('security')
@ApiBearerAuth()
@Controller('security')
@UseGuards(JwtAuthGuard)
export class SecurityController {
  constructor(
    private readonly securityAuditService: SecurityAuditService,
    private readonly securityPolicyService: SecurityPolicyService,
    private readonly vulnerabilityScanningService: VulnerabilityScanningService,
    private readonly complianceService: ComplianceService,
  ) {}

  @Get('policies')
  @Roles(UserRole.ADMIN, UserRole.SECURITY_OFFICER)
  @ApiOperation({ summary: 'List all security policies' })
  @ApiResponse({
    status: 200,
    description: 'List of security policies',
    type: 'array',
  })
  @ApiQuery({ name: 'includeDisabled', required: false, type: Boolean })
  async listPolicies(
    @Query('includeDisabled') includeDisabled = false,
  ): Promise<SecurityPolicy[]> {
    return this.securityPolicyService.listPolicies(includeDisabled);
  }

  @Get('policies/:id')
  @Roles(UserRole.ADMIN, UserRole.SECURITY_OFFICER)
  @ApiOperation({ summary: 'Get a security policy by ID' })
  @ApiResponse({
    status: 200,
    description: 'The security policy',
  })
  @ApiResponse({ status: 404, description: 'Policy not found' })
  async getPolicy(@Param('id') id: string): Promise<SecurityPolicy | null> {
    return this.securityPolicyService.getPolicy(id);
  }

  @Post('policies')
  @Roles(UserRole.ADMIN, UserRole.SECURITY_OFFICER)
  @ApiOperation({ summary: 'Create a new security policy' })
  @ApiResponse({
    status: 201,
    description: 'The created security policy',
  })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  async createPolicy(
    @Body() dto: CreateSecurityPolicyDto,
  ): Promise<SecurityPolicy> {
    return this.securityPolicyService.createPolicyInDatabase({
      ...dto,
      description: dto.description || '',
      enabled: dto.enabled ?? true,
      rules: dto.rules ?? [],
    });
  }

  @Put('policies/:id')
  @Roles(UserRole.ADMIN, UserRole.SECURITY_OFFICER)
  @ApiOperation({ summary: 'Update a security policy' })
  @ApiResponse({
    status: 200,
    description: 'The updated security policy',
  })
  @ApiResponse({ status: 404, description: 'Policy not found' })
  async updatePolicy(
    @Param('id') id: string,
    @Body() updates: UpdateSecurityPolicyDto,
  ): Promise<SecurityPolicy | null> {
    return this.securityPolicyService.updatePolicy(id, updates);
  }

  @Delete('policies/:id')
  @Roles(UserRole.ADMIN, UserRole.SECURITY_OFFICER)
  @ApiOperation({ summary: 'Delete a security policy' })
  @ApiResponse({ status: 200, description: 'Policy deleted successfully' })
  @ApiResponse({ status: 404, description: 'Policy not found' })
  async deletePolicy(@Param('id') id: string): Promise<{ success: boolean }> {
    const result = await this.securityPolicyService.deletePolicy(id);
    return { success: result };
  }

  @Post('policies/evaluate')
  @Roles(UserRole.ADMIN, UserRole.SECURITY_OFFICER)
  @ApiOperation({ summary: 'Evaluate policies against a context' })
  @ApiResponse({ status: 200, description: 'Policy evaluation result' })
  async evaluatePolicies(@Body() context: EvaluatePolicyDto) {
    return this.securityPolicyService.evaluatePolicies(context);
  }

  @Get('scans')
  @Roles(UserRole.ADMIN, UserRole.SECURITY_OFFICER)
  @ApiOperation({ summary: 'List vulnerability scan results' })
  @ApiResponse({
    status: 200,
    description: 'List of scan results',
    type: 'array',
  })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async listScans(@Query('limit') limit = 10): Promise<ScanResult[]> {
    return this.vulnerabilityScanningService.getLatestScanResults(limit);
  }

  @Post('scans/start')
  @Roles(UserRole.ADMIN, UserRole.SECURITY_OFFICER)
  @ApiOperation({ summary: 'Start a new vulnerability scan' })
  @ApiResponse({ status: 201, description: 'Scan started', type: Object })
  @ApiQuery({ name: 'type', required: true, enum: ScanType })
  async startScan(@Query('type') type: ScanType): Promise<{ scanId: string }> {
    const scanId = await this.vulnerabilityScanningService.startScan(type);
    return { scanId };
  }

  @Get('scans/:id')
  @Roles(UserRole.ADMIN, UserRole.SECURITY_OFFICER)
  @ApiOperation({ summary: 'Get vulnerability scan result by ID' })
  @ApiResponse({ status: 200, description: 'Scan result' })
  @ApiResponse({ status: 404, description: 'Scan not found' })
  async getScanResult(@Param('id') id: string): Promise<ScanResult | null> {
    return this.vulnerabilityScanningService.getScanResult(id);
  }

  @Post('data-retention/process')
  @Roles(UserRole.ADMIN, UserRole.SECURITY_OFFICER)
  @ApiOperation({ summary: 'Process data retention policies' })
  @ApiResponse({
    status: 200,
    description: 'Data retention processing started',
  })
  async processDataRetention(): Promise<{ success: boolean }> {
    await this.complianceService.enforceDataRetention(DataType.AUDIT_LOGS, 90);
    return { success: true };
  }

  @Get('audit-logs')
  @Roles(UserRole.ADMIN, UserRole.SECURITY_OFFICER)
  @ApiOperation({ summary: 'Get security audit logs' })
  @ApiResponse({ status: 200, description: 'List of security events' })
  @ApiQuery({ name: 'type', required: false, enum: SecurityEventType })
  @ApiQuery({ name: 'userId', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getAuditLogs(
    @Query('type') type?: SecurityEventType,
    @Query('userId') userId?: string,
    @Query('limit') limit = 100,
  ) {
    return this.securityAuditService.getSecurityEvents(
      userId,
      type ? [type] : undefined,
      undefined, // startDate
      undefined, // endDate
      undefined, // tenantId
      limit,
    );
  }
}
