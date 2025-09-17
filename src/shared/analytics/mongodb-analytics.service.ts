import { Injectable, Logger } from '@nestjs/common';
import { MongoDBService } from '../infrastructure/mongodb/mongodb.service';
import { MessageMongoDBRepository } from '../domain/repositories/message-mongodb.repository';
import { ConversationMongoDBRepository } from '../domain/repositories/conversation-mongodb.repository';
import { UserConversationMongoDBRepository } from '../domain/repositories/user-conversation-mongodb.repository';

export interface AnalyticsTimeRange {
  startDate: Date;
  endDate: Date;
  granularity: 'hour' | 'day' | 'week' | 'month';
}

export interface MessageAnalytics {
  totalMessages: number;
  messagesByType: Array<{ type: string; count: number; percentage: number }>;
  messagesByTime: Array<{ period: string; count: number }>;
  topSenders: Array<{ senderId: string; senderName: string; count: number; percentage: number }>;
  averageMessagesPerDay: number;
  peakActivityHours: Array<{ hour: number; count: number }>;
  messageGrowthRate: number;
}

export interface ConversationAnalytics {
  totalConversations: number;
  conversationsByType: Array<{ type: string; count: number; percentage: number }>;
  conversationsByTime: Array<{ period: string; count: number }>;
  averageMembersPerConversation: number;
  mostActiveConversations: Array<{ 
    conversationId: string; 
    title: string; 
    messageCount: number; 
    memberCount: number; 
  }>;
  conversationGrowthRate: number;
}

export interface UserAnalytics {
  totalUsers: number;
  activeUsers: Array<{ period: string; count: number }>;
  userEngagement: Array<{ 
    userId: string; 
    userName: string; 
    messageCount: number; 
    conversationCount: number; 
    lastActivityAt: Date;
  }>;
  averageMessagesPerUser: number;
  averageConversationsPerUser: number;
  userRetentionRate: number;
}

export interface SystemAnalytics {
  databaseSize: number;
  collectionSizes: Array<{ collection: string; size: number; count: number }>;
  indexUsage: Array<{ index: string; usage: number; efficiency: number }>;
  queryPerformance: Array<{ 
    operation: string; 
    averageTime: number; 
    maxTime: number; 
    count: number; 
  }>;
  errorRate: number;
  uptime: number;
}

export interface ComprehensiveAnalytics {
  timeRange: AnalyticsTimeRange;
  messages: MessageAnalytics;
  conversations: ConversationAnalytics;
  users: UserAnalytics;
  system: SystemAnalytics;
  generatedAt: Date;
}

@Injectable()
export class MongoDBAnalyticsService {
  private readonly logger = new Logger(MongoDBAnalyticsService.name);

  constructor(
    private readonly mongoDB: MongoDBService,
    private readonly messageRepository: MessageMongoDBRepository,
    private readonly conversationRepository: ConversationMongoDBRepository,
    private readonly userConversationRepository: UserConversationMongoDBRepository,
  ) {}

  /**
   * Get comprehensive analytics for a time range
   */
  async getComprehensiveAnalytics(
    timeRange: AnalyticsTimeRange,
    tenantId?: string,
  ): Promise<ComprehensiveAnalytics> {
    try {
      this.logger.debug(`Generating comprehensive analytics for ${timeRange.startDate} to ${timeRange.endDate}`);

      const [messages, conversations, users, system] = await Promise.all([
        this.getMessageAnalytics(timeRange, tenantId),
        this.getConversationAnalytics(timeRange, tenantId),
        this.getUserAnalytics(timeRange, tenantId),
        this.getSystemAnalytics(),
      ]);

      const analytics: ComprehensiveAnalytics = {
        timeRange,
        messages,
        conversations,
        users,
        system,
        generatedAt: new Date(),
      };

      this.logger.debug('Comprehensive analytics generated successfully');
      return analytics;
    } catch (error) {
      this.logger.error('Failed to generate comprehensive analytics', error);
      throw error;
    }
  }

  /**
   * Get message analytics
   */
  async getMessageAnalytics(
    timeRange: AnalyticsTimeRange,
    tenantId?: string,
  ): Promise<MessageAnalytics> {
    try {
      const collection = this.mongoDB.getCollection('messages');
      
      const filter: any = {
        createdAt: {
          $gte: timeRange.startDate,
          $lte: timeRange.endDate,
        },
        deletedAt: null,
      };
      
      if (tenantId) {
        filter.tenantId = tenantId;
      }

      const [
        totalMessages,
        messagesByType,
        messagesByTime,
        topSenders,
        peakActivityHours,
      ] = await Promise.all([
        collection.countDocuments(filter),
        this.getMessagesByType(filter, collection),
        this.getMessagesByTime(filter, collection, timeRange.granularity),
        this.getTopSenders(filter, collection),
        this.getPeakActivityHours(filter, collection),
      ]);

      // Calculate additional metrics
      const daysInRange = Math.ceil((timeRange.endDate.getTime() - timeRange.startDate.getTime()) / (1000 * 60 * 60 * 24));
      const averageMessagesPerDay = totalMessages / daysInRange;

      // Calculate growth rate (compare with previous period)
      const previousPeriodStart = new Date(timeRange.startDate.getTime() - (timeRange.endDate.getTime() - timeRange.startDate.getTime()));
      const previousPeriodFilter = { ...filter, createdAt: { $gte: previousPeriodStart, $lt: timeRange.startDate } };
      const previousPeriodMessages = await collection.countDocuments(previousPeriodFilter);
      const messageGrowthRate = previousPeriodMessages > 0 
        ? ((totalMessages - previousPeriodMessages) / previousPeriodMessages) * 100 
        : 0;

      return {
        totalMessages,
        messagesByType: messagesByType.map(item => ({
          ...item,
          percentage: totalMessages > 0 ? (item.count / totalMessages) * 100 : 0,
        })),
        messagesByTime,
        topSenders: topSenders.map(item => ({
          ...item,
          percentage: totalMessages > 0 ? (item.count / totalMessages) * 100 : 0,
        })),
        averageMessagesPerDay,
        peakActivityHours,
        messageGrowthRate,
      };
    } catch (error) {
      this.logger.error('Failed to get message analytics', error);
      throw error;
    }
  }

  /**
   * Get conversation analytics
   */
  async getConversationAnalytics(
    timeRange: AnalyticsTimeRange,
    tenantId?: string,
  ): Promise<ConversationAnalytics> {
    try {
      const collection = this.mongoDB.getCollection('conversations');
      
      const filter: any = {
        createdAt: {
          $gte: timeRange.startDate,
          $lte: timeRange.endDate,
        },
        isActive: true,
      };
      
      if (tenantId) {
        filter.tenantId = tenantId;
      }

      const [
        totalConversations,
        conversationsByType,
        conversationsByTime,
        averageMembersPerConversation,
        mostActiveConversations,
      ] = await Promise.all([
        collection.countDocuments(filter),
        this.getConversationsByType(filter, collection),
        this.getConversationsByTime(filter, collection, timeRange.granularity),
        this.getAverageMembersPerConversation(filter, collection),
        this.getMostActiveConversations(filter, collection),
      ]);

      // Calculate growth rate
      const previousPeriodStart = new Date(timeRange.startDate.getTime() - (timeRange.endDate.getTime() - timeRange.startDate.getTime()));
      const previousPeriodFilter = { ...filter, createdAt: { $gte: previousPeriodStart, $lt: timeRange.startDate } };
      const previousPeriodConversations = await collection.countDocuments(previousPeriodFilter);
      const conversationGrowthRate = previousPeriodConversations > 0 
        ? ((totalConversations - previousPeriodConversations) / previousPeriodConversations) * 100 
        : 0;

      return {
        totalConversations,
        conversationsByType: conversationsByType.map(item => ({
          ...item,
          percentage: totalConversations > 0 ? (item.count / totalConversations) * 100 : 0,
        })),
        conversationsByTime,
        averageMembersPerConversation,
        mostActiveConversations,
        conversationGrowthRate,
      };
    } catch (error) {
      this.logger.error('Failed to get conversation analytics', error);
      throw error;
    }
  }

  /**
   * Get user analytics
   */
  async getUserAnalytics(
    timeRange: AnalyticsTimeRange,
    tenantId?: string,
  ): Promise<UserAnalytics> {
    try {
      const userConversationCollection = this.mongoDB.getCollection('user_conversations');
      const messageCollection = this.mongoDB.getCollection('messages');
      
      const filter: any = {
        lastActivityAt: {
          $gte: timeRange.startDate,
          $lte: timeRange.endDate,
        },
        isActive: true,
      };
      
      if (tenantId) {
        filter.tenantId = tenantId;
      }

      const [
        totalUsers,
        activeUsers,
        userEngagement,
        averageMessagesPerUser,
        averageConversationsPerUser,
      ] = await Promise.all([
        this.getTotalUsers(filter, userConversationCollection),
        this.getActiveUsers(filter, userConversationCollection, timeRange.granularity),
        this.getUserEngagement(filter, userConversationCollection, messageCollection),
        this.getAverageMessagesPerUser(filter, messageCollection),
        this.getAverageConversationsPerUser(filter, userConversationCollection),
      ]);

      // Calculate retention rate (users active in both current and previous period)
      const previousPeriodStart = new Date(timeRange.startDate.getTime() - (timeRange.endDate.getTime() - timeRange.startDate.getTime()));
      const previousPeriodFilter = { ...filter, lastActivityAt: { $gte: previousPeriodStart, $lt: timeRange.startDate } };
      const previousPeriodUsers = await this.getTotalUsers(previousPeriodFilter, userConversationCollection);
      const userRetentionRate = previousPeriodUsers > 0 ? (totalUsers / previousPeriodUsers) * 100 : 0;

      return {
        totalUsers,
        activeUsers,
        userEngagement,
        averageMessagesPerUser,
        averageConversationsPerUser,
        userRetentionRate,
      };
    } catch (error) {
      this.logger.error('Failed to get user analytics', error);
      throw error;
    }
  }

  /**
   * Get system analytics
   */
  async getSystemAnalytics(): Promise<SystemAnalytics> {
    try {
      const [databaseStats, collectionSizes, indexUsage, queryPerformance] = await Promise.all([
        this.mongoDB.getDatabaseStats(),
        this.getCollectionSizes(),
        this.getIndexUsage(),
        this.getQueryPerformance(),
      ]);

      return {
        databaseSize: databaseStats.dataSize,
        collectionSizes,
        indexUsage,
        queryPerformance,
        errorRate: 0, // Would need to track errors
        uptime: 100, // Would need to track uptime
      };
    } catch (error) {
      this.logger.error('Failed to get system analytics', error);
      throw error;
    }
  }

  /**
   * Get real-time metrics
   */
  async getRealTimeMetrics(tenantId?: string): Promise<{
    activeUsers: number;
    messagesLastHour: number;
    conversationsLastHour: number;
    averageResponseTime: number;
    systemLoad: number;
  }> {
    try {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      
      const messageCollection = this.mongoDB.getCollection('messages');
      const conversationCollection = this.mongoDB.getCollection('conversations');
      const userConversationCollection = this.mongoDB.getCollection('user_conversations');

      const filter: any = {
        createdAt: { $gte: oneHourAgo },
      };
      
      if (tenantId) {
        filter.tenantId = tenantId;
      }

      const [
        messagesLastHour,
        conversationsLastHour,
        activeUsers,
      ] = await Promise.all([
        messageCollection.countDocuments(filter),
        conversationCollection.countDocuments({ ...filter, isActive: true }),
        userConversationCollection.countDocuments({
          ...filter,
          isActive: true,
          lastActivityAt: { $gte: oneHourAgo },
        }),
      ]);

      return {
        activeUsers,
        messagesLastHour,
        conversationsLastHour,
        averageResponseTime: 0, // Would need to track response times
        systemLoad: 0, // Would need to track system load
      };
    } catch (error) {
      this.logger.error('Failed to get real-time metrics', error);
      throw error;
    }
  }

  // Helper methods for analytics calculations

  private async getMessagesByType(filter: any, collection: any): Promise<Array<{ type: string; count: number }>> {
    const result = await collection.aggregate([
      { $match: filter },
      { $group: { _id: '$messageType', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]).toArray();

    return result.map(item => ({ type: item._id, count: item.count }));
  }

  private async getMessagesByTime(filter: any, collection: any, granularity: string): Promise<Array<{ period: string; count: number }>> {
    const format = granularity === 'hour' ? '%Y-%m-%d %H:00' :
                   granularity === 'day' ? '%Y-%m-%d' :
                   granularity === 'week' ? '%Y-%U' : '%Y-%m';

    const result = await collection.aggregate([
      { $match: filter },
      {
        $group: {
          _id: {
            $dateToString: { format, date: '$createdAt' }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } },
    ]).toArray();

    return result.map(item => ({ period: item._id, count: item.count }));
  }

  private async getTopSenders(filter: any, collection: any): Promise<Array<{ senderId: string; senderName: string; count: number }>> {
    const result = await collection.aggregate([
      { $match: filter },
      { $group: { _id: { senderId: '$senderId', senderName: '$senderName' }, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]).toArray();

    return result.map(item => ({ 
      senderId: item._id.senderId, 
      senderName: item._id.senderName, 
      count: item.count 
    }));
  }

  private async getPeakActivityHours(filter: any, collection: any): Promise<Array<{ hour: number; count: number }>> {
    const result = await collection.aggregate([
      { $match: filter },
      {
        $group: {
          _id: { $hour: '$createdAt' },
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 24 },
    ]).toArray();

    return result.map(item => ({ hour: item._id, count: item.count }));
  }

  private async getConversationsByType(filter: any, collection: any): Promise<Array<{ type: string; count: number }>> {
    const result = await collection.aggregate([
      { $match: filter },
      { $group: { _id: '$type', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]).toArray();

    return result.map(item => ({ type: item._id, count: item.count }));
  }

  private async getConversationsByTime(filter: any, collection: any, granularity: string): Promise<Array<{ period: string; count: number }>> {
    const format = granularity === 'hour' ? '%Y-%m-%d %H:00' :
                   granularity === 'day' ? '%Y-%m-%d' :
                   granularity === 'week' ? '%Y-%U' : '%Y-%m';

    const result = await collection.aggregate([
      { $match: filter },
      {
        $group: {
          _id: {
            $dateToString: { format, date: '$createdAt' }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } },
    ]).toArray();

    return result.map(item => ({ period: item._id, count: item.count }));
  }

  private async getAverageMembersPerConversation(filter: any, collection: any): Promise<number> {
    const result = await collection.aggregate([
      { $match: filter },
      { $group: { _id: null, avgMembers: { $avg: '$memberCount' } } },
    ]).toArray();

    return result.length > 0 ? result[0].avgMembers : 0;
  }

  private async getMostActiveConversations(filter: any, collection: any): Promise<Array<{ 
    conversationId: string; 
    title: string; 
    messageCount: number; 
    memberCount: number; 
  }>> {
    const result = await collection.aggregate([
      { $match: filter },
      { $sort: { totalMessages: -1 } },
      { $limit: 10 },
      { $project: {
        conversationId: 1,
        title: 1,
        messageCount: '$totalMessages',
        memberCount: 1,
      }},
    ]).toArray();

    return result.map(item => ({
      conversationId: item.conversationId,
      title: item.title,
      messageCount: item.messageCount,
      memberCount: item.memberCount,
    }));
  }

  private async getTotalUsers(filter: any, collection: any): Promise<number> {
    const result = await collection.aggregate([
      { $match: filter },
      { $group: { _id: '$userId' } },
      { $count: 'total' },
    ]).toArray();

    return result.length > 0 ? result[0].total : 0;
  }

  private async getActiveUsers(filter: any, collection: any, granularity: string): Promise<Array<{ period: string; count: number }>> {
    const format = granularity === 'hour' ? '%Y-%m-%d %H:00' :
                   granularity === 'day' ? '%Y-%m-%d' :
                   granularity === 'week' ? '%Y-%U' : '%Y-%m';

    const result = await collection.aggregate([
      { $match: filter },
      {
        $group: {
          _id: {
            period: { $dateToString: { format, date: '$lastActivityAt' } },
            userId: '$userId'
          }
        }
      },
      {
        $group: {
          _id: '$_id.period',
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } },
    ]).toArray();

    return result.map(item => ({ period: item._id, count: item.count }));
  }

  private async getUserEngagement(filter: any, userConversationCollection: any, messageCollection: any): Promise<Array<{ 
    userId: string; 
    userName: string; 
    messageCount: number; 
    conversationCount: number; 
    lastActivityAt: Date;
  }>> {
    const result = await userConversationCollection.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$userId',
          conversationCount: { $sum: 1 },
          lastActivityAt: { $max: '$lastActivityAt' },
        }
      },
      { $sort: { conversationCount: -1 } },
      { $limit: 20 },
    ]).toArray();

    // Get message counts for each user
    const userIds = result.map(item => item._id);
    const messageCounts = await messageCollection.aggregate([
      { $match: { senderId: { $in: userIds }, deletedAt: null } },
      { $group: { _id: '$senderId', messageCount: { $sum: 1 } } },
    ]).toArray();

    const messageCountMap = new Map(messageCounts.map(item => [item._id, item.messageCount]));

    return result.map(item => ({
      userId: item._id,
      userName: 'Unknown', // Would need to join with user data
      messageCount: messageCountMap.get(item._id) || 0,
      conversationCount: item.conversationCount,
      lastActivityAt: item.lastActivityAt,
    }));
  }

  private async getAverageMessagesPerUser(filter: any, collection: any): Promise<number> {
    const result = await collection.aggregate([
      { $match: { ...filter, deletedAt: null } },
      { $group: { _id: '$senderId' } },
      { $count: 'totalUsers' },
    ]).toArray();

    const totalUsers = result.length > 0 ? result[0].totalUsers : 0;
    const totalMessages = await collection.countDocuments({ ...filter, deletedAt: null });

    return totalUsers > 0 ? totalMessages / totalUsers : 0;
  }

  private async getAverageConversationsPerUser(filter: any, collection: any): Promise<number> {
    const result = await collection.aggregate([
      { $match: filter },
      { $group: { _id: '$userId' } },
      { $count: 'totalUsers' },
    ]).toArray();

    const totalUsers = result.length > 0 ? result[0].totalUsers : 0;
    const totalConversations = await collection.countDocuments(filter);

    return totalUsers > 0 ? totalConversations / totalUsers : 0;
  }

  private async getCollectionSizes(): Promise<Array<{ collection: string; size: number; count: number }>> {
    const collections = ['messages', 'conversations', 'user_conversations'];
    const sizes = [];

    for (const collectionName of collections) {
      try {
        const stats = await this.mongoDB.getCollectionStats(collectionName);
        sizes.push({
          collection: collectionName,
          size: stats.size,
          count: stats.count,
        });
      } catch (error) {
        this.logger.warn(`Failed to get stats for collection: ${collectionName}`, error);
      }
    }

    return sizes;
  }

  private async getIndexUsage(): Promise<Array<{ index: string; usage: number; efficiency: number }>> {
    // This would require MongoDB's index usage statistics
    // For now, return empty array
    return [];
  }

  private async getQueryPerformance(): Promise<Array<{ 
    operation: string; 
    averageTime: number; 
    maxTime: number; 
    count: number; 
  }>> {
    // This would require MongoDB's query profiling
    // For now, return empty array
    return [];
  }
}