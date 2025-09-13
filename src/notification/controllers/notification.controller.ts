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

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationController {
  constructor(
    private readonly notificationService: NotificationService,
    private readonly preferenceService: NotificationPreferenceService,
    private readonly templateService: NotificationTemplateService,
  ) {}

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

  @Get('templates')
  async getTemplates(@CurrentUser() user: AuthenticatedUser) {
    const templates = await this.templateService.getTemplatesByTenant(user.tenantId);
    
    return {
      success: true,
      data: templates,
      message: 'Notification templates retrieved successfully',
    };
  }

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
