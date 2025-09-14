import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../shared/infrastructure/prisma/prisma.service';
import { RedisService } from '../../shared/redis/redis.service';
import { Prisma } from '@prisma/client';
import {
  AdminRoleType,
  ModerationActionType,
  ModerationTargetType,
  BanType,
  ReportStatus,
  ReportPriority,
  ReportType,
  AutoModerationRuleType,
  RuleSeverity,
  ReviewStatus,
} from '@prisma/client';

export interface AutoModerationRuleDto {
  tenantId?: string;
  name: string;
  description?: string;
  ruleType: AutoModerationRuleType;
  conditions: Record<string, any>;
  actions: Record<string, any>;
  severity: RuleSeverity;
  isEnabled?: boolean;
}

export interface ContentAnalysisResult {
  violations: ViolationResult[];
  confidence: number;
  metadata: Record<string, any>;
}

export interface ViolationResult {
  ruleId: string;
  ruleName: string;
  ruleType: AutoModerationRuleType;
  severity: RuleSeverity;
  confidence: number;
  triggeredConditions: string[];
  suggestedActions: string[];
  metadata: Record<string, any>;
}

export interface ModerationContext {
  userId?: string;
  tenantId?: string;
  targetType: ModerationTargetType;
  targetId: string;
  content: string;
  metadata?: Record<string, any>;
}

@Injectable()
export class AutoModerationService {
  private readonly logger = new Logger(AutoModerationService.name);
  private readonly RATE_LIMIT_WINDOW = 60; // 1 minute
  private readonly SPAM_THRESHOLD = 5;
  private readonly PROFANITY_WORDS = new Set([
    // Basic profanity list - in production, use a comprehensive external service
    'spam', 'fuck', 'shit', 'damn', 'hell', 'bitch', 'ass', 'bastard'
  ]);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  // Rule Management
  async createRule(dto: AutoModerationRuleDto, createdBy: string): Promise<any> {
    try {
      const rule = await this.prisma.autoModerationRule.create({
        data: {
          tenantId: dto.tenantId,
          name: dto.name,
          description: dto.description,
          ruleType: dto.ruleType,
          conditions: dto.conditions,
          actions: dto.actions,
          severity: dto.severity,
          isEnabled: dto.isEnabled ?? true,
          createdBy,
        },
        include: {
          creator: {
            select: {
              id: true,
              username: true,
              displayName: true,
            },
          },
        },
      });

      this.logger.log(`Auto-moderation rule created: ${dto.name} (${dto.ruleType})`);
      return rule;
    } catch (error) {
      this.logger.error(`Failed to create auto-moderation rule: ${error.message}`, error.stack);
      throw error;
    }
  }

  async updateRule(ruleId: string, updates: Partial<AutoModerationRuleDto>): Promise<any> {
    try {
      const rule = await this.prisma.autoModerationRule.update({
        where: { id: ruleId },
        data: {
          ...(updates.name && { name: updates.name }),
          ...(updates.description !== undefined && { description: updates.description }),
          ...(updates.conditions && { conditions: updates.conditions }),
          ...(updates.actions && { actions: updates.actions }),
          ...(updates.severity && { severity: updates.severity }),
          ...(updates.isEnabled !== undefined && { isEnabled: updates.isEnabled }),
        },
        include: {
          creator: {
            select: {
              id: true,
              username: true,
              displayName: true,
            },
          },
        },
      });

      this.logger.log(`Auto-moderation rule updated: ${ruleId}`);
      return rule;
    } catch (error) {
      this.logger.error(`Failed to update auto-moderation rule: ${error.message}`, error.stack);
      throw error;
    }
  }

  async deleteRule(ruleId: string): Promise<void> {
    try {
      await this.prisma.autoModerationRule.delete({
        where: { id: ruleId },
      });

      this.logger.log(`Auto-moderation rule deleted: ${ruleId}`);
    } catch (error) {
      this.logger.error(`Failed to delete auto-moderation rule: ${error.message}`, error.stack);
      throw error;
    }
  }

  async getRules(tenantId?: string, ruleType?: AutoModerationRuleType): Promise<any[]> {
    try {
      return await this.prisma.autoModerationRule.findMany({
        where: {
          ...(tenantId && { tenantId }),
          ...(ruleType && { ruleType }),
          isEnabled: true,
        },
        include: {
          creator: {
            select: {
              id: true,
              username: true,
              displayName: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
    } catch (error) {
      this.logger.error(`Failed to get auto-moderation rules: ${error.message}`, error.stack);
      throw error;
    }
  }

  // Content Analysis and Moderation
  async analyzeContent(context: ModerationContext): Promise<ContentAnalysisResult> {
    try {
      const rules = await this.getRules(context.tenantId);
      const violations: ViolationResult[] = [];

      for (const rule of rules) {
        const violation = await this.checkRule(rule, context);
        if (violation) {
          violations.push(violation);
        }
      }

      // Calculate overall confidence based on violations
      const confidence = violations.length > 0 
        ? Math.max(...violations.map(v => v.confidence))
        : 0;

      return {
        violations,
        confidence,
        metadata: {
          rulesChecked: rules.length,
          violationsFound: violations.length,
          highestSeverity: violations.length > 0 
            ? Math.max(...violations.map(v => this.getSeverityScore(v.severity)))
            : 0,
        },
      };
    } catch (error) {
      this.logger.error(`Failed to analyze content: ${error.message}`, error.stack);
      return {
        violations: [],
        confidence: 0,
        metadata: { error: error.message },
      };
    }
  }

  async processViolations(
    context: ModerationContext,
    analysisResult: ContentAnalysisResult,
  ): Promise<void> {
    try {
      for (const violation of analysisResult.violations) {
        // Record the violation
        await this.prisma.autoModerationViolation.create({
          data: {
            tenantId: context.tenantId,
            ruleId: violation.ruleId,
            targetType: context.targetType,
            targetId: context.targetId,
            userId: context.userId,
            severity: violation.severity,
            content: context.content.substring(0, 1000), // Limit content length
            confidence: violation.confidence,
            metadata: violation.metadata,
            actionTaken: violation.suggestedActions,
          },
        });

        // Execute automatic actions based on severity and confidence
        if (violation.confidence >= 0.8 && violation.severity !== RuleSeverity.LOW) {
          await this.executeAutomaticActions(violation, context);
        }

        this.logger.log(
          `Auto-moderation violation recorded: ${violation.ruleName} (${violation.severity}) - Confidence: ${violation.confidence}`
        );
      }
    } catch (error) {
      this.logger.error(`Failed to process violations: ${error.message}`, error.stack);
    }
  }

  // Specific Rule Implementations
  private async checkRule(rule: any, context: ModerationContext): Promise<ViolationResult | null> {
    try {
      switch (rule.ruleType) {
        case AutoModerationRuleType.SPAM_DETECTION:
          return await this.checkSpamRule(rule, context);
        case AutoModerationRuleType.PROFANITY_FILTER:
          return await this.checkProfanityRule(rule, context);
        case AutoModerationRuleType.RATE_LIMITING:
          return await this.checkRateLimitRule(rule, context);
        case AutoModerationRuleType.CONTENT_SIMILARITY:
          return await this.checkSimilarityRule(rule, context);
        case AutoModerationRuleType.LINK_FILTER:
          return await this.checkLinkRule(rule, context);
        case AutoModerationRuleType.CAPS_FILTER:
          return await this.checkCapsRule(rule, context);
        case AutoModerationRuleType.MENTION_SPAM:
          return await this.checkMentionSpamRule(rule, context);
        default:
          this.logger.warn(`Unknown rule type: ${rule.ruleType}`);
          return null;
      }
    } catch (error) {
      this.logger.error(`Failed to check rule ${rule.id}: ${error.message}`, error.stack);
      return null;
    }
  }

  private async checkSpamRule(rule: any, context: ModerationContext): Promise<ViolationResult | null> {
    const conditions = rule.conditions;
    const content = context.content.toLowerCase();
    
    let confidence = 0;
    const triggeredConditions: string[] = [];
    
    // Check for spam keywords
    if (conditions.spamKeywords) {
      const spamWords = conditions.spamKeywords as string[];
      const foundSpamWords = spamWords.filter(word => content.includes(word.toLowerCase()));
      if (foundSpamWords.length > 0) {
        confidence += 0.3 * (foundSpamWords.length / spamWords.length);
        triggeredConditions.push(`spam_keywords: ${foundSpamWords.join(', ')}`);
      }
    }

    // Check for excessive repetition
    if (conditions.repetitionThreshold) {
      const repetitionScore = this.calculateRepetitionScore(content);
      if (repetitionScore > conditions.repetitionThreshold) {
        confidence += 0.4;
        triggeredConditions.push(`excessive_repetition: ${repetitionScore.toFixed(2)}`);
      }
    }

    // Check for excessive links
    if (conditions.linkThreshold) {
      const linkCount = (content.match(/https?:\/\/[^\s]+/g) || []).length;
      if (linkCount > conditions.linkThreshold) {
        confidence += 0.3;
        triggeredConditions.push(`excessive_links: ${linkCount}`);
      }
    }

    if (confidence >= (conditions.confidenceThreshold || 0.5)) {
      return {
        ruleId: rule.id,
        ruleName: rule.name,
        ruleType: rule.ruleType,
        severity: rule.severity,
        confidence,
        triggeredConditions,
        suggestedActions: rule.actions.automatic || [],
        metadata: { spamScore: confidence },
      };
    }

    return null;
  }

  private async checkProfanityRule(rule: any, context: ModerationContext): Promise<ViolationResult | null> {
    const conditions = rule.conditions;
    const content = context.content.toLowerCase();
    
    let confidence = 0;
    const triggeredConditions: string[] = [];
    const foundProfanity: string[] = [];

    // Check built-in profanity list
    for (const word of this.PROFANITY_WORDS) {
      if (content.includes(word)) {
        foundProfanity.push(word);
      }
    }

    // Check custom profanity list
    if (conditions.customProfanity) {
      const customWords = conditions.customProfanity as string[];
      for (const word of customWords) {
        if (content.includes(word.toLowerCase())) {
          foundProfanity.push(word);
        }
      }
    }

    if (foundProfanity.length > 0) {
      confidence = Math.min(0.9, foundProfanity.length * 0.3);
      triggeredConditions.push(`profanity_detected: ${foundProfanity.join(', ')}`);

      return {
        ruleId: rule.id,
        ruleName: rule.name,
        ruleType: rule.ruleType,
        severity: rule.severity,
        confidence,
        triggeredConditions,
        suggestedActions: rule.actions.automatic || [],
        metadata: { profanityWords: foundProfanity },
      };
    }

    return null;
  }

  private async checkRateLimitRule(rule: any, context: ModerationContext): Promise<ViolationResult | null> {
    if (!context.userId) return null;

    const conditions = rule.conditions;
    const windowSeconds = conditions.windowSeconds || this.RATE_LIMIT_WINDOW;
    const maxMessages = conditions.maxMessages || this.SPAM_THRESHOLD;
    
    const cacheKey = `rate_limit:${context.userId}:${context.tenantId || 'global'}`;
    
    try {
      const currentCount = await this.redis.client.incr(cacheKey);
      if (currentCount === 1) {
        await this.redis.expire(cacheKey, windowSeconds);
      }

      if (currentCount > maxMessages) {
        const confidence = Math.min(0.9, (currentCount - maxMessages) / maxMessages);
        
        return {
          ruleId: rule.id,
          ruleName: rule.name,
          ruleType: rule.ruleType,
          severity: rule.severity,
          confidence,
          triggeredConditions: [`rate_limit_exceeded: ${currentCount}/${maxMessages} in ${windowSeconds}s`],
          suggestedActions: rule.actions.automatic || [],
          metadata: { 
            messageCount: currentCount,
            maxMessages,
            windowSeconds,
          },
        };
      }
    } catch (error) {
      this.logger.error(`Failed to check rate limit: ${error.message}`, error.stack);
    }

    return null;
  }

  private async checkSimilarityRule(rule: any, context: ModerationContext): Promise<ViolationResult | null> {
    const conditions = rule.conditions;
    const similarityThreshold = conditions.similarityThreshold || 0.8;
    const lookbackMinutes = conditions.lookbackMinutes || 60;

    try {
      // Get recent messages from the same user
      const recentMessages = await this.prisma.message.findMany({
        where: {
          senderId: context.userId,
          createdAt: {
            gte: new Date(Date.now() - lookbackMinutes * 60 * 1000),
          },
          deletedAt: null,
        },
        select: { content: true },
        orderBy: { createdAt: 'desc' },
        take: 10,
      });

      for (const message of recentMessages) {
        const messageContent = typeof message.content === 'string' 
          ? message.content 
          : JSON.stringify(message.content);
        
        const similarity = this.calculateStringSimilarity(context.content, messageContent);
        
        if (similarity >= similarityThreshold) {
          return {
            ruleId: rule.id,
            ruleName: rule.name,
            ruleType: rule.ruleType,
            severity: rule.severity,
            confidence: similarity,
            triggeredConditions: [`content_similarity: ${(similarity * 100).toFixed(1)}%`],
            suggestedActions: rule.actions.automatic || [],
            metadata: { 
              similarity,
              similarContent: messageContent.substring(0, 100),
            },
          };
        }
      }
    } catch (error) {
      this.logger.error(`Failed to check content similarity: ${error.message}`, error.stack);
    }

    return null;
  }

  private async checkLinkRule(rule: any, context: ModerationContext): Promise<ViolationResult | null> {
    const conditions = rule.conditions;
    const content = context.content;
    
    const linkRegex = /https?:\/\/[^\s]+/g;
    const links = content.match(linkRegex) || [];
    
    if (links.length === 0) return null;

    let confidence = 0;
    const triggeredConditions: string[] = [];

    // Check link count threshold
    if (conditions.maxLinks && links.length > conditions.maxLinks) {
      confidence += 0.4;
      triggeredConditions.push(`excessive_links: ${links.length}/${conditions.maxLinks}`);
    }

    // Check for suspicious domains
    if (conditions.blockedDomains) {
      const blockedDomains = conditions.blockedDomains as string[];
      const suspiciousLinks = links.filter(link => {
        try {
          const domain = new URL(link).hostname.toLowerCase();
          return blockedDomains.some(blocked => domain.includes(blocked.toLowerCase()));
        } catch {
          return false;
        }
      });

      if (suspiciousLinks.length > 0) {
        confidence += 0.6;
        triggeredConditions.push(`blocked_domains: ${suspiciousLinks.length}`);
      }
    }

    // Check for URL shorteners
    if (conditions.blockShorteners) {
      const shorteners = ['bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'ow.ly'];
      const shortenerLinks = links.filter(link => {
        try {
          const domain = new URL(link).hostname.toLowerCase();
          return shorteners.some(shortener => domain.includes(shortener));
        } catch {
          return false;
        }
      });

      if (shortenerLinks.length > 0) {
        confidence += 0.3;
        triggeredConditions.push(`url_shorteners: ${shortenerLinks.length}`);
      }
    }

    if (confidence >= (conditions.confidenceThreshold || 0.5)) {
      return {
        ruleId: rule.id,
        ruleName: rule.name,
        ruleType: rule.ruleType,
        severity: rule.severity,
        confidence,
        triggeredConditions,
        suggestedActions: rule.actions.automatic || [],
        metadata: { 
          linkCount: links.length,
          links: links.slice(0, 5), // Limit stored links
        },
      };
    }

    return null;
  }

  private async checkCapsRule(rule: any, context: ModerationContext): Promise<ViolationResult | null> {
    const conditions = rule.conditions;
    const content = context.content;
    
    const capsThreshold = conditions.capsThreshold || 0.7;
    const minLength = conditions.minLength || 10;
    
    if (content.length < minLength) return null;

    const uppercaseCount = (content.match(/[A-Z]/g) || []).length;
    const letterCount = (content.match(/[A-Za-z]/g) || []).length;
    
    if (letterCount === 0) return null;

    const capsRatio = uppercaseCount / letterCount;
    
    if (capsRatio >= capsThreshold) {
      return {
        ruleId: rule.id,
        ruleName: rule.name,
        ruleType: rule.ruleType,
        severity: rule.severity,
        confidence: Math.min(0.9, capsRatio),
        triggeredConditions: [`excessive_caps: ${(capsRatio * 100).toFixed(1)}%`],
        suggestedActions: rule.actions.automatic || [],
        metadata: { 
          capsRatio,
          uppercaseCount,
          letterCount,
        },
      };
    }

    return null;
  }

  private async checkMentionSpamRule(rule: any, context: ModerationContext): Promise<ViolationResult | null> {
    const conditions = rule.conditions;
    const content = context.content;
    
    const mentionRegex = /@\w+/g;
    const mentions = content.match(mentionRegex) || [];
    
    const maxMentions = conditions.maxMentions || 5;
    
    if (mentions.length > maxMentions) {
      const confidence = Math.min(0.9, mentions.length / (maxMentions * 2));
      
      return {
        ruleId: rule.id,
        ruleName: rule.name,
        ruleType: rule.ruleType,
        severity: rule.severity,
        confidence,
        triggeredConditions: [`excessive_mentions: ${mentions.length}/${maxMentions}`],
        suggestedActions: rule.actions.automatic || [],
        metadata: { 
          mentionCount: mentions.length,
          mentions: mentions.slice(0, 10),
        },
      };
    }

    return null;
  }

  // Helper methods
  private calculateRepetitionScore(content: string): number {
    const words = content.toLowerCase().split(/\s+/);
    if (words.length < 3) return 0;

    const wordCounts = new Map<string, number>();
    words.forEach(word => {
      wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
    });

    const maxCount = Math.max(...wordCounts.values());
    return maxCount / words.length;
  }

  private calculateStringSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;
    
    const editDistance = this.levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));
    
    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;
    
    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,
          matrix[j - 1][i] + 1,
          matrix[j - 1][i - 1] + indicator
        );
      }
    }
    
    return matrix[str2.length][str1.length];
  }

  private getSeverityScore(severity: RuleSeverity): number {
    switch (severity) {
      case RuleSeverity.LOW: return 1;
      case RuleSeverity.MEDIUM: return 2;
      case RuleSeverity.HIGH: return 3;
      case RuleSeverity.CRITICAL: return 4;
      default: return 1;
    }
  }

  private async executeAutomaticActions(
    violation: ViolationResult,
    context: ModerationContext,
  ): Promise<void> {
    try {
      for (const action of violation.suggestedActions) {
        switch (action) {
          case 'delete_message':
            if (context.targetType === ModerationTargetType.MESSAGE) {
              await this.prisma.message.update({
                where: { id: context.targetId },
                data: { deletedAt: new Date() },
              });
            }
            break;
          case 'mute_user':
            if (context.userId) {
              // Implementation would depend on your muting system
              this.logger.log(`Auto-mute triggered for user ${context.userId}`);
            }
            break;
          case 'flag_for_review':
            await this.prisma.autoModerationViolation.update({
              where: { id: violation.ruleId },
              data: { reviewStatus: ReviewStatus.PENDING },
            });
            break;
        }
      }
    } catch (error) {
      this.logger.error(`Failed to execute automatic actions: ${error.message}`, error.stack);
    }
  }

  // Violation Management
  async getViolations(
    filters: {
      tenantId?: string;
      userId?: string;
      ruleId?: string;
      severity?: RuleSeverity;
      reviewStatus?: ReviewStatus;
      dateFrom?: Date;
      dateTo?: Date;
    },
    page = 1,
    limit = 50,
  ) {
    try {
      const where: Prisma.AutoModerationViolationWhereInput = {
        ...(filters.tenantId && { tenantId: filters.tenantId }),
        ...(filters.userId && { userId: filters.userId }),
        ...(filters.ruleId && { ruleId: filters.ruleId }),
        ...(filters.severity && { severity: filters.severity }),
        ...(filters.reviewStatus && { reviewStatus: filters.reviewStatus }),
        ...(filters.dateFrom || filters.dateTo) && {
          createdAt: {
            ...(filters.dateFrom && { gte: filters.dateFrom }),
            ...(filters.dateTo && { lte: filters.dateTo }),
          },
        },
      };

      const [violations, total] = await Promise.all([
        this.prisma.autoModerationViolation.findMany({
          where,
          include: {
            rule: {
              select: {
                id: true,
                name: true,
                ruleType: true,
                severity: true,
              },
            },
            user: {
              select: {
                id: true,
                username: true,
                displayName: true,
              },
            },
            reviewer: {
              select: {
                id: true,
                username: true,
                displayName: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        this.prisma.autoModerationViolation.count({ where }),
      ]);

      return {
        data: violations,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrevious: page > 1,
      };
    } catch (error) {
      this.logger.error(`Failed to get violations: ${error.message}`, error.stack);
      throw error;
    }
  }

  async reviewViolation(
    violationId: string,
    reviewStatus: ReviewStatus,
    reviewerId: string,
  ): Promise<any> {
    try {
      return await this.prisma.autoModerationViolation.update({
        where: { id: violationId },
        data: {
          reviewStatus,
          reviewedBy: reviewerId,
          reviewedAt: new Date(),
        },
        include: {
          rule: true,
          user: {
            select: {
              id: true,
              username: true,
              displayName: true,
            },
          },
          reviewer: {
            select: {
              id: true,
              username: true,
              displayName: true,
            },
          },
        },
      });
    } catch (error) {
      this.logger.error(`Failed to review violation: ${error.message}`, error.stack);
      throw error;
    }
  }
}
