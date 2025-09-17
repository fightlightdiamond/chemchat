import { Controller, Get, Query, Param, HttpStatus, HttpException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiParam } from '@nestjs/swagger';
import { MongoDBAnalyticsService, AnalyticsTimeRange } from '../analytics/mongodb-analytics.service';

@ApiTags('Analytics')
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: MongoDBAnalyticsService) {}

  @Get('comprehensive')
  @ApiOperation({ summary: 'Get comprehensive analytics for a time range' })
  @ApiQuery({ name: 'startDate', required: true, description: 'Start date (ISO string)' })
  @ApiQuery({ name: 'endDate', required: true, description: 'End date (ISO string)' })
  @ApiQuery({ name: 'granularity', required: false, enum: ['hour', 'day', 'week', 'month'], description: 'Time granularity' })
  @ApiQuery({ name: 'tenantId', required: false, description: 'Tenant ID for filtering' })
  @ApiResponse({ 
    status: 200, 
    description: 'Comprehensive analytics data',
    schema: {
      type: 'object',
      properties: {
        timeRange: {
          type: 'object',
          properties: {
            startDate: { type: 'string', format: 'date-time' },
            endDate: { type: 'string', format: 'date-time' },
            granularity: { type: 'string', enum: ['hour', 'day', 'week', 'month'] },
          },
        },
        messages: {
          type: 'object',
          properties: {
            totalMessages: { type: 'number' },
            messagesByType: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  type: { type: 'string' },
                  count: { type: 'number' },
                  percentage: { type: 'number' },
                },
              },
            },
            averageMessagesPerDay: { type: 'number' },
            messageGrowthRate: { type: 'number' },
          },
        },
        conversations: {
          type: 'object',
          properties: {
            totalConversations: { type: 'number' },
            conversationsByType: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  type: { type: 'string' },
                  count: { type: 'number' },
                  percentage: { type: 'number' },
                },
              },
            },
            averageMembersPerConversation: { type: 'number' },
            conversationGrowthRate: { type: 'number' },
          },
        },
        users: {
          type: 'object',
          properties: {
            totalUsers: { type: 'number' },
            averageMessagesPerUser: { type: 'number' },
            averageConversationsPerUser: { type: 'number' },
            userRetentionRate: { type: 'number' },
          },
        },
        system: {
          type: 'object',
          properties: {
            databaseSize: { type: 'number' },
            collectionSizes: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  collection: { type: 'string' },
                  size: { type: 'number' },
                  count: { type: 'number' },
                },
              },
            },
          },
        },
        generatedAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  async getComprehensiveAnalytics(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('granularity') granularity: 'hour' | 'day' | 'week' | 'month' = 'day',
    @Query('tenantId') tenantId?: string,
  ) {
    try {
      const timeRange: AnalyticsTimeRange = {
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        granularity,
      };

      return await this.analyticsService.getComprehensiveAnalytics(timeRange, tenantId);
    } catch (error) {
      throw new HttpException(
        'Failed to get comprehensive analytics',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('messages')
  @ApiOperation({ summary: 'Get message analytics' })
  @ApiQuery({ name: 'startDate', required: true, description: 'Start date (ISO string)' })
  @ApiQuery({ name: 'endDate', required: true, description: 'End date (ISO string)' })
  @ApiQuery({ name: 'granularity', required: false, enum: ['hour', 'day', 'week', 'month'] })
  @ApiQuery({ name: 'tenantId', required: false })
  @ApiResponse({ status: 200, description: 'Message analytics data' })
  async getMessageAnalytics(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('granularity') granularity: 'hour' | 'day' | 'week' | 'month' = 'day',
    @Query('tenantId') tenantId?: string,
  ) {
    try {
      const timeRange: AnalyticsTimeRange = {
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        granularity,
      };

      return await this.analyticsService.getMessageAnalytics(timeRange, tenantId);
    } catch (error) {
      throw new HttpException(
        'Failed to get message analytics',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('conversations')
  @ApiOperation({ summary: 'Get conversation analytics' })
  @ApiQuery({ name: 'startDate', required: true, description: 'Start date (ISO string)' })
  @ApiQuery({ name: 'endDate', required: true, description: 'End date (ISO string)' })
  @ApiQuery({ name: 'granularity', required: false, enum: ['hour', 'day', 'week', 'month'] })
  @ApiQuery({ name: 'tenantId', required: false })
  @ApiResponse({ status: 200, description: 'Conversation analytics data' })
  async getConversationAnalytics(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('granularity') granularity: 'hour' | 'day' | 'week' | 'month' = 'day',
    @Query('tenantId') tenantId?: string,
  ) {
    try {
      const timeRange: AnalyticsTimeRange = {
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        granularity,
      };

      return await this.analyticsService.getConversationAnalytics(timeRange, tenantId);
    } catch (error) {
      throw new HttpException(
        'Failed to get conversation analytics',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('users')
  @ApiOperation({ summary: 'Get user analytics' })
  @ApiQuery({ name: 'startDate', required: true, description: 'Start date (ISO string)' })
  @ApiQuery({ name: 'endDate', required: true, description: 'End date (ISO string)' })
  @ApiQuery({ name: 'granularity', required: false, enum: ['hour', 'day', 'week', 'month'] })
  @ApiQuery({ name: 'tenantId', required: false })
  @ApiResponse({ status: 200, description: 'User analytics data' })
  async getUserAnalytics(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('granularity') granularity: 'hour' | 'day' | 'week' | 'month' = 'day',
    @Query('tenantId') tenantId?: string,
  ) {
    try {
      const timeRange: AnalyticsTimeRange = {
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        granularity,
      };

      return await this.analyticsService.getUserAnalytics(timeRange, tenantId);
    } catch (error) {
      throw new HttpException(
        'Failed to get user analytics',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('system')
  @ApiOperation({ summary: 'Get system analytics' })
  @ApiResponse({ status: 200, description: 'System analytics data' })
  async getSystemAnalytics() {
    try {
      return await this.analyticsService.getSystemAnalytics();
    } catch (error) {
      throw new HttpException(
        'Failed to get system analytics',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('realtime')
  @ApiOperation({ summary: 'Get real-time metrics' })
  @ApiQuery({ name: 'tenantId', required: false })
  @ApiResponse({ status: 200, description: 'Real-time metrics data' })
  async getRealTimeMetrics(@Query('tenantId') tenantId?: string) {
    try {
      return await this.analyticsService.getRealTimeMetrics(tenantId);
    } catch (error) {
      throw new HttpException(
        'Failed to get real-time metrics',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('dashboard/:tenantId')
  @ApiOperation({ summary: 'Get dashboard data for tenant' })
  @ApiParam({ name: 'tenantId', description: 'Tenant ID' })
  @ApiResponse({ status: 200, description: 'Dashboard data' })
  async getDashboardData(@Param('tenantId') tenantId: string) {
    try {
      // Get data for last 30 days
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);

      const timeRange: AnalyticsTimeRange = {
        startDate,
        endDate,
        granularity: 'day',
      };

      const [comprehensiveAnalytics, realTimeMetrics] = await Promise.all([
        this.analyticsService.getComprehensiveAnalytics(timeRange, tenantId),
        this.analyticsService.getRealTimeMetrics(tenantId),
      ]);

      return {
        ...comprehensiveAnalytics,
        realTime: realTimeMetrics,
      };
    } catch (error) {
      throw new HttpException(
        'Failed to get dashboard data',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}