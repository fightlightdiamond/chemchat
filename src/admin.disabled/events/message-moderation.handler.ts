import { Injectable, Logger } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { MessageCreatedEvent } from '../../chat/events/message-created.event';
import { AutoModerationService, ModerationContext } from '../services/auto-moderation.service';
import { AuditLogService } from '../services/audit-log.service';
// Define ModerationTargetType locally until Prisma is regenerated
enum ModerationTargetType {
  USER = 'user',
  MESSAGE = 'message',
  CONVERSATION = 'conversation',
  ATTACHMENT = 'attachment'
}

@Injectable()
@EventsHandler(MessageCreatedEvent)
export class MessageModerationHandler implements IEventHandler<MessageCreatedEvent> {
  private readonly logger = new Logger(MessageModerationHandler.name);

  constructor(
    private readonly autoModerationService: AutoModerationService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async handle(event: MessageCreatedEvent): Promise<void> {
    try {
      // Extract message content for analysis
      const content = this.extractMessageContent(event.content);
      
      if (!content || content.trim().length === 0) {
        return; // Skip empty messages
      }

      const moderationContext: ModerationContext = {
        userId: event.senderId || undefined,
        tenantId: event.tenantId,
        targetType: ModerationTargetType.MESSAGE,
        targetId: event.messageId,
        content,
        metadata: {
          conversationId: event.conversationId,
          sequenceNumber: event.sequenceNumber.toString(),
          createdAt: event.createdAt.toISOString(),
        },
      };

      // Analyze content for violations
      const analysisResult = await this.autoModerationService.analyzeContent(moderationContext);

      // Process any violations found
      if (analysisResult.violations.length > 0) {
        await this.autoModerationService.processViolations(moderationContext, analysisResult);

        // Log the moderation event
        await this.auditLogService.logSystemAction(
          'auto_moderation_triggered',
          'message',
          event.messageId,
          {
            violationsCount: analysisResult.violations.length,
            confidence: analysisResult.confidence,
            violations: analysisResult.violations.map(v => ({
              ruleType: v.ruleType,
              severity: v.severity,
              confidence: v.confidence,
            })),
          },
          event.tenantId,
        );

        this.logger.log(
          `Auto-moderation triggered for message ${event.messageId}: ${analysisResult.violations.length} violations found`
        );
      }
    } catch (error) {
      this.logger.error(`Failed to process message moderation: ${error.message}`, error.stack);
      
      // Log the error for audit purposes
      await this.auditLogService.logSystemAction(
        'auto_moderation_error',
        'message',
        event.messageId,
        { error: error.message },
        event.tenantId,
      );
    }
  }

  private extractMessageContent(content: any): string {
    if (typeof content === 'string') {
      return content;
    }

    if (typeof content === 'object' && content !== null) {
      // Handle structured content (e.g., rich text, mentions, etc.)
      if (content.text) {
        return content.text;
      }
      
      if (content.body) {
        return content.body;
      }

      if (content.message) {
        return content.message;
      }

      // Extract text from complex structures
      return JSON.stringify(content);
    }

    return '';
  }
}
