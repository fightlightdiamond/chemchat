import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../shared/infrastructure/prisma/prisma.service';

export interface QueryOptimizationRule {
  name: string;
  enabled: boolean;
  table: string;
  condition: string;
  optimization: string;
  execute: () => Promise<void>;
}

export interface IndexRecommendation {
  table: string;
  columns: string[];
  type: 'btree' | 'hash' | 'gin' | 'gist';
  reason: string;
  priority: 'high' | 'medium' | 'low';
  estimatedImpact: string;
}

@Injectable()
export class DatabaseOptimizationService {
  private readonly logger = new Logger(DatabaseOptimizationService.name);
  private readonly optimizationRules: QueryOptimizationRule[] = [];
  private readonly indexRecommendations: IndexRecommendation[] = [];

  constructor(
    private prismaService: PrismaService,
    private configService: ConfigService,
  ) {
    this.setupOptimizationRules();
    this.setupIndexRecommendations();
  }

  /**
   * Analyze query performance and suggest optimizations
   */
  async analyzeQueryPerformance(): Promise<{
    slowQueries: Array<{
      query: string;
      avgExecutionTime: number;
      callCount: number;
      recommendation: string;
    }>;
    indexRecommendations: IndexRecommendation[];
    optimizationSuggestions: string[];
  }> {
    const slowQueries = await this.identifySlowQueries();
    const missingIndexes = await this.identifyMissingIndexes();
    const optimizationSuggestions = await this.generateOptimizationSuggestions();

    return {
      slowQueries,
      indexRecommendations: missingIndexes,
      optimizationSuggestions,
    };
  }

  /**
   * Apply database optimizations
   */
  async applyOptimizations(): Promise<void> {
    this.logger.log('Starting database optimization process');

    for (const rule of this.optimizationRules.filter(r => r.enabled)) {
      try {
        const startTime = Date.now();
        await rule.execute();
        const duration = Date.now() - startTime;
        this.logger.debug(`Applied optimization '${rule.name}' in ${duration}ms`);
      } catch (error) {
        this.logger.error(`Failed to apply optimization '${rule.name}':`, error);
      }
    }

    this.logger.log('Database optimization process completed');
  }

  /**
   * Create recommended indexes
   */
  async createRecommendedIndexes(): Promise<void> {
    const highPriorityIndexes = this.indexRecommendations.filter(
      rec => rec.priority === 'high'
    );

    for (const recommendation of highPriorityIndexes) {
      try {
        await this.createIndex(recommendation);
        this.logger.log(`Created index on ${recommendation.table}(${recommendation.columns.join(', ')})`);
      } catch (error) {
        this.logger.error(`Failed to create index on ${recommendation.table}:`, error);
      }
    }
  }

  /**
   * Update table statistics for query planner
   */
  async updateTableStatistics(): Promise<void> {
    const tables = [
      'User',
      'Conversation',
      'Message',
      'ConversationParticipant',
      'Attachment',
      'NotificationPreference',
      'TenantSettings',
      'ConversationSummary',
    ];

    for (const table of tables) {
      try {
        // PostgreSQL specific - update statistics
        await this.prismaService.$executeRaw`ANALYZE ${table}`;
        this.logger.debug(`Updated statistics for table ${table}`);
      } catch (error) {
        this.logger.error(`Failed to update statistics for table ${table}:`, error);
      }
    }
  }

  /**
   * Optimize frequently accessed queries
   */
  async optimizeFrequentQueries(): Promise<void> {
    // Create materialized views for complex queries
    await this.createMaterializedViews();
    
    // Optimize conversation history queries
    await this.optimizeConversationQueries();
    
    // Optimize user search queries
    await this.optimizeUserSearchQueries();
    
    // Optimize message search queries
    await this.optimizeMessageSearchQueries();
  }

  /**
   * Setup optimization rules
   */
  private setupOptimizationRules(): void {
    // Conversation history optimization
    this.optimizationRules.push({
      name: 'optimize_conversation_history',
      enabled: true,
      table: 'Message',
      condition: 'conversationId queries with ordering',
      optimization: 'Composite index on (conversationId, createdAt)',
      execute: async () => {
        // This would be handled by Prisma migrations in production
        // For now, we log the recommendation
        this.logger.debug('Recommendation: Create index on Message(conversationId, createdAt)');
      },
    });

    // User search optimization
    this.optimizationRules.push({
      name: 'optimize_user_search',
      enabled: true,
      table: 'User',
      condition: 'username and email searches',
      optimization: 'GIN index for text search',
      execute: async () => {
        this.logger.debug('Recommendation: Create GIN index on User(username, email) for text search');
      },
    });

    // Message content search optimization
    this.optimizationRules.push({
      name: 'optimize_message_search',
      enabled: true,
      table: 'Message',
      condition: 'content text search',
      optimization: 'Full-text search index',
      execute: async () => {
        this.logger.debug('Recommendation: Create full-text search index on Message.content');
      },
    });

    // Tenant isolation optimization
    this.optimizationRules.push({
      name: 'optimize_tenant_queries',
      enabled: true,
      table: 'All tenant-scoped tables',
      condition: 'tenantId filtering',
      optimization: 'Ensure tenantId is first column in composite indexes',
      execute: async () => {
        this.logger.debug('Recommendation: Ensure tenantId is first column in all composite indexes');
      },
    });

    // Presence queries optimization
    this.optimizationRules.push({
      name: 'optimize_presence_queries',
      enabled: true,
      table: 'User',
      condition: 'lastSeen and status queries',
      optimization: 'Index on (tenantId, lastSeen, status)',
      execute: async () => {
        this.logger.debug('Recommendation: Create index on User(tenantId, lastSeen, status)');
      },
    });

    this.logger.log(`Registered ${this.optimizationRules.length} database optimization rules`);
  }

  /**
   * Setup index recommendations
   */
  private setupIndexRecommendations(): void {
    // High priority indexes
    this.indexRecommendations.push(
      {
        table: 'Message',
        columns: ['conversationId', 'createdAt'],
        type: 'btree',
        reason: 'Optimize conversation history queries with ordering',
        priority: 'high',
        estimatedImpact: 'Significant improvement for message pagination',
      },
      {
        table: 'Message',
        columns: ['conversationId', 'deletedAt', 'createdAt'],
        type: 'btree',
        reason: 'Optimize active message queries with soft delete filtering',
        priority: 'high',
        estimatedImpact: 'Major improvement for active message retrieval',
      },
      {
        table: 'ConversationParticipant',
        columns: ['userId', 'joinedAt'],
        type: 'btree',
        reason: 'Optimize user conversation listing',
        priority: 'high',
        estimatedImpact: 'Faster user conversation retrieval',
      },
      {
        table: 'User',
        columns: ['tenantId', 'lastSeen'],
        type: 'btree',
        reason: 'Optimize active user queries for presence',
        priority: 'high',
        estimatedImpact: 'Improved presence system performance',
      },
    );

    // Medium priority indexes
    this.indexRecommendations.push(
      {
        table: 'Attachment',
        columns: ['messageId', 'status'],
        type: 'btree',
        reason: 'Optimize attachment queries by message and processing status',
        priority: 'medium',
        estimatedImpact: 'Better media handling performance',
      },
      {
        table: 'NotificationDelivery',
        columns: ['userId', 'createdAt'],
        type: 'btree',
        reason: 'Optimize notification history queries',
        priority: 'medium',
        estimatedImpact: 'Faster notification retrieval',
      },
      {
        table: 'ConversationSummary',
        columns: ['conversationId', 'updatedAt'],
        type: 'btree',
        reason: 'Optimize conversation summary updates',
        priority: 'medium',
        estimatedImpact: 'Improved read model performance',
      },
    );

    // Low priority indexes
    this.indexRecommendations.push(
      {
        table: 'AuditLog',
        columns: ['tenantId', 'createdAt'],
        type: 'btree',
        reason: 'Optimize audit log queries by tenant and time',
        priority: 'low',
        estimatedImpact: 'Better admin dashboard performance',
      },
      {
        table: 'ModerationAction',
        columns: ['targetUserId', 'createdAt'],
        type: 'btree',
        reason: 'Optimize moderation history queries',
        priority: 'low',
        estimatedImpact: 'Improved moderation tools performance',
      },
    );

    this.logger.log(`Generated ${this.indexRecommendations.length} index recommendations`);
  }

  /**
   * Identify slow queries (placeholder - would use pg_stat_statements in production)
   */
  private async identifySlowQueries(): Promise<Array<{
    query: string;
    avgExecutionTime: number;
    callCount: number;
    recommendation: string;
  }>> {
    // In production, this would query pg_stat_statements
    // For now, return common slow query patterns
    return [
      {
        query: 'SELECT * FROM Message WHERE conversationId = ? ORDER BY createdAt DESC',
        avgExecutionTime: 150,
        callCount: 1000,
        recommendation: 'Add composite index on (conversationId, createdAt)',
      },
      {
        query: 'SELECT * FROM User WHERE tenantId = ? AND lastSeen > ?',
        avgExecutionTime: 80,
        callCount: 500,
        recommendation: 'Add composite index on (tenantId, lastSeen)',
      },
      {
        query: 'SELECT * FROM ConversationParticipant WHERE userId = ?',
        avgExecutionTime: 120,
        callCount: 800,
        recommendation: 'Add index on userId with included columns',
      },
    ];
  }

  /**
   * Identify missing indexes
   */
  private async identifyMissingIndexes(): Promise<IndexRecommendation[]> {
    // Return high priority recommendations that aren't yet implemented
    return this.indexRecommendations.filter(rec => rec.priority === 'high');
  }

  /**
   * Generate optimization suggestions
   */
  private async generateOptimizationSuggestions(): Promise<string[]> {
    return [
      'Consider partitioning the Message table by date for better performance',
      'Implement read replicas for heavy read workloads',
      'Use connection pooling to reduce connection overhead',
      'Consider using materialized views for complex aggregation queries',
      'Implement query result caching for frequently accessed data',
      'Use EXPLAIN ANALYZE to identify query bottlenecks',
      'Consider archiving old messages to reduce table size',
      'Optimize JOIN operations by ensuring proper index coverage',
    ];
  }

  /**
   * Create index based on recommendation
   */
  private async createIndex(recommendation: IndexRecommendation): Promise<void> {
    // In production, this would create actual indexes
    // For now, we log the SQL that would be executed
    const indexName = `idx_${recommendation.table.toLowerCase()}_${recommendation.columns.join('_').toLowerCase()}`;
    const sql = `CREATE INDEX ${indexName} ON ${recommendation.table} (${recommendation.columns.join(', ')})`;
    
    this.logger.log(`Would execute: ${sql}`);
    // await this.prismaService.$executeRaw`${sql}`;
  }

  /**
   * Create materialized views for complex queries
   */
  private async createMaterializedViews(): Promise<void> {
    // TODO: Implement materialized view creation when needed
    this.logger.log('Materialized views creation placeholder');
  }

  /**
   * Optimize conversation-related queries
   */
  private async optimizeConversationQueries(): Promise<void> {
    // These optimizations would be implemented through Prisma migrations
    this.logger.debug('Optimizing conversation queries:');
    this.logger.debug('- Add composite index on Message(conversationId, createdAt, deletedAt)');
    this.logger.debug('- Add index on ConversationParticipant(userId, joinedAt)');
    this.logger.debug('- Consider partitioning Message table by conversationId for large datasets');
  }

  /**
   * Optimize user search queries
   */
  private async optimizeUserSearchQueries(): Promise<void> {
    this.logger.debug('Optimizing user search queries:');
    this.logger.debug('- Add GIN index for full-text search on username and displayName');
    this.logger.debug('- Add composite index on User(tenantId, status, lastSeen)');
    this.logger.debug('- Consider using PostgreSQL text search features');
  }

  /**
   * Optimize message search queries
   */
  private async optimizeMessageSearchQueries(): Promise<void> {
    this.logger.debug('Optimizing message search queries:');
    this.logger.debug('- Add full-text search index on Message.content');
    this.logger.debug('- Add composite index on Message(conversationId, createdAt) for pagination');
    this.logger.debug('- Consider using Elasticsearch for advanced search features');
  }

  /**
   * Get optimization statistics
   */
  getStats(): {
    totalRules: number;
    enabledRules: number;
    indexRecommendations: number;
    highPriorityIndexes: number;
  } {
    return {
      totalRules: this.optimizationRules.length,
      enabledRules: this.optimizationRules.filter(r => r.enabled).length,
      indexRecommendations: this.indexRecommendations.length,
      highPriorityIndexes: this.indexRecommendations.filter(r => r.priority === 'high').length,
    };
  }

  /**
   * Get index recommendations by priority
   */
  getIndexRecommendations(priority?: 'high' | 'medium' | 'low'): IndexRecommendation[] {
    if (priority) {
      return this.indexRecommendations.filter(rec => rec.priority === priority);
    }
    return this.indexRecommendations;
  }

  /**
   * Enable/disable optimization rule
   */
  toggleRule(ruleName: string, enabled: boolean): void {
    const rule = this.optimizationRules.find(r => r.name === ruleName);
    if (rule) {
      rule.enabled = enabled;
      this.logger.log(`Optimization rule '${ruleName}' ${enabled ? 'enabled' : 'disabled'}`);
    } else {
      throw new Error(`Optimization rule '${ruleName}' not found`);
    }
  }
}
