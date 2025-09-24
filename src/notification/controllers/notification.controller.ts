import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { NotificationService } from '../services/notification.service';
import { NotificationPreferenceService } from '../services/notification-preference.service';
import { NotificationTemplateService } from '../services/notification-template.service';
import {
  NotificationPayload,
  NotificationPreferences,
  DeviceTokenInfo,
  NotificationFilter,
} from '../interfaces/notification.interface';
import { NotificationType, NotificationChannel, NotificationStatus } from '@prisma/client';

interface AuthenticatedUser {
  id: string;
  username: string;
  tenantId?: string;
}

@ApiTags('notifications')
@ApiBearerAuth('JWT-auth')
@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationController {
  constructor(
    private readonly notificationService: NotificationService,
    private readonly preferenceService: NotificationPreferenceService,
    private readonly templateService: NotificationTemplateService,
  ) {}

  @ApiOperation({ summary: 'Send notification', description: 'Send a notification to users' })
  @ApiBody({ schema: { type: 'object', properties: { type: { type: 'string' }, title: { type: 'string' }, message: { type: 'string' }, channels: { type: 'array', items: { type: 'string' } } } } })
  @ApiResponse({ status: 201, description: 'Notification sent successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async sendNotification(
    @CurrentUser() user: AuthenticatedUser,
    @Body() payload: Omit<NotificationPayload, 'userId' | 'tenantId'>,
  ) {
    const fullPayload: NotificationPayload = {
      ...payload,
      userId: user.id,
      tenantId: user.tenantId,
    };

    const results = await this.notificationService.sendNotification(fullPayload);
    
    return {
      success: true,
      data: results,
      message: 'Notification sent successfully',
    };
  }

  @ApiOperation({ summary: 'Get notifications', description: 'Get user notifications with optional filters' })
  @ApiQuery({ name: 'type', required: false, description: 'Filter by notification type' })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by notification status' })
  @ApiQuery({ name: 'channel', required: false, description: 'Filter by notification channel' })
  @ApiQuery({ name: 'startDate', required: false, description: 'Filter from start date' })
  @ApiQuery({ name: 'endDate', required: false, description: 'Filter to end date' })
  @ApiQuery({ name: 'limit', required: false, description: 'Limit number of results' })
  @ApiQuery({ name: 'offset', required: false, description: 'Offset for pagination' })
  @ApiResponse({ status: 200, description: 'Notifications retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @Get()
  async getNotifications(
    @CurrentUser() user: AuthenticatedUser,
    @Query('type') type?: NotificationType,
    @Query('status') status?: NotificationStatus,
    @Query('channel') channel?: NotificationChannel,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const filter: NotificationFilter = {
      userId: user.id,
      tenantId: user.tenantId,
      type,
      status,
      channel,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    };

    const notifications = await this.notificationService.getNotifications(filter);
    
    return {
      success: true,
      data: notifications,
      message: 'Notifications retrieved successfully',
    };
  }

  @ApiOperation({ summary: 'Mark as read', description: 'Mark a notification as read' })
  @ApiParam({ name: 'id', description: 'Notification ID' })
  @ApiResponse({ status: 200, description: 'Notification marked as read' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @Put(':id/read')
  @HttpCode(HttpStatus.OK)
  async markAsRead(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') notificationId: string,
  ) {
    await this.notificationService.markAsRead(notificationId);
    
    return {
      success: true,
      message: 'Notification marked as read',
    };
  }

  @ApiOperation({ summary: 'Get notification stats', description: 'Get notification statistics for user' })
  @ApiQuery({ name: 'startDate', required: false, description: 'Stats from start date' })
  @ApiQuery({ name: 'endDate', required: false, description: 'Stats to end date' })
  @ApiResponse({ status: 200, description: 'Notification statistics retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @Get('stats')
  async getNotificationStats(
    @CurrentUser() user: AuthenticatedUser,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const stats = await this.notificationService.getNotificationStats(
      user.id,
      user.tenantId,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
    
    return {
      success: true,
      data: stats,
      message: 'Notification statistics retrieved successfully',
    };
  }

  @ApiOperation({ summary: 'Get preferences', description: 'Get user notification preferences' })
  @ApiResponse({ status: 200, description: 'Notification preferences retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @Get('preferences')
  async getPreferences(@CurrentUser() user: AuthenticatedUser) {
    const preferences = await this.preferenceService.getUserPreferences(
      user.id,
      user.tenantId,
    );
    
    return {
      success: true,
      data: preferences,
      message: 'Notification preferences retrieved successfully',
    };
  }

  @ApiOperation({ summary: 'Update preferences', description: 'Update user notification preferences' })
  @ApiBody({ schema: { type: 'object', properties: { emailEnabled: { type: 'boolean' }, pushEnabled: { type: 'boolean' }, smsEnabled: { type: 'boolean' } } } })
  @ApiResponse({ status: 200, description: 'Notification preferences updated successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @Put('preferences')
  @HttpCode(HttpStatus.OK)
  async updatePreferences(
    @CurrentUser() user: AuthenticatedUser,
    @Body() preferences: Partial<NotificationPreferences>,
  ) {
    const updated = await this.preferenceService.updateUserPreferences(
      user.id,
      preferences,
      user.tenantId,
    );
    
    return {
      success: true,
      data: updated,
      message: 'Notification preferences updated successfully',
    };
  }

  @ApiOperation({ summary: 'Register device', description: 'Register device token for push notifications' })
  @ApiBody({ schema: { type: 'object', properties: { token: { type: 'string' }, platform: { type: 'string' }, deviceId: { type: 'string' } } } })
  @ApiResponse({ status: 201, description: 'Device token registered successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @Post('devices')
  @HttpCode(HttpStatus.CREATED)
  async registerDevice(
    @CurrentUser() user: AuthenticatedUser,
    @Body() deviceInfo: Omit<DeviceTokenInfo, 'userId' | 'tenantId'>,
  ) {
    const fullDeviceInfo: DeviceTokenInfo = {
      ...deviceInfo,
      userId: user.id,
      tenantId: user.tenantId,
    };

    const deviceToken = await this.preferenceService.registerDeviceToken(fullDeviceInfo);
    
    return {
      success: true,
      data: deviceToken,
      message: 'Device token registered successfully',
    };
  }

  @ApiOperation({ summary: 'Get devices', description: 'Get registered device tokens' })
  @ApiResponse({ status: 200, description: 'Device tokens retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @Get('devices')
  async getDevices(@CurrentUser() user: AuthenticatedUser) {
    const devices = await this.preferenceService.getActiveDeviceTokens(
      user.id,
      user.tenantId,
    );
    
    return {
      success: true,
      data: devices,
      message: 'Device tokens retrieved successfully',
    };
  }

  @ApiOperation({ summary: 'Deactivate device', description: 'Deactivate a device token' })
  @ApiParam({ name: 'deviceId', description: 'Device ID to deactivate' })
  @ApiResponse({ status: 200, description: 'Device token deactivated successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @Delete('devices/:deviceId')
  @HttpCode(HttpStatus.OK)
  async deactivateDevice(
    @CurrentUser() user: AuthenticatedUser,
    @Param('deviceId') deviceId: string,
  ) {
    await this.preferenceService.deactivateDeviceToken(
      user.id,
      deviceId,
      user.tenantId,
    );
    
    return {
      success: true,
      message: 'Device token deactivated successfully',
    };
  }

  @ApiOperation({ summary: 'Get templates', description: 'Get notification templates for tenant' })
  @ApiResponse({ status: 200, description: 'Notification templates retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @Get('templates')
  async getTemplates(@CurrentUser() user: AuthenticatedUser) {
    const templates = await this.templateService.getTemplatesByTenant(user.tenantId);
    
    return {
      success: true,
      data: templates,
      message: 'Notification templates retrieved successfully',
    };
  }

  @ApiOperation({ summary: 'Create template', description: 'Create a new notification template' })
  @ApiBody({ schema: { type: 'object', properties: { name: { type: 'string' }, subject: { type: 'string' }, body: { type: 'string' }, type: { type: 'string' } } } })
  @ApiResponse({ status: 201, description: 'Notification template created successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @Post('templates')
  @HttpCode(HttpStatus.CREATED)
  async createTemplate(
    @CurrentUser() user: AuthenticatedUser,
    @Body() template: any,
  ) {
    const created = await this.templateService.createTemplate({
      ...template,
      tenantId: user.tenantId,
    });
    
    return {
      success: true,
      data: created,
      message: 'Notification template created successfully',
    };
  }

  @ApiOperation({ summary: 'Update template', description: 'Update a notification template' })
  @ApiParam({ name: 'id', description: 'Template ID' })
  @ApiBody({ schema: { type: 'object', properties: { name: { type: 'string' }, subject: { type: 'string' }, body: { type: 'string' } } } })
  @ApiResponse({ status: 200, description: 'Notification template updated successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @Put('templates/:id')
  @HttpCode(HttpStatus.OK)
  async updateTemplate(
    @Param('id') templateId: string,
    @Body() updates: any,
  ) {
    const updated = await this.templateService.updateTemplate(templateId, updates);
    
    return {
      success: true,
      data: updated,
      message: 'Notification template updated successfully',
    };
  }
}
