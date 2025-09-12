import { Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { MessageIdService } from '../../chat/services/message-id.service';
import { IDEMPOTENT_KEY } from '../decorators/idempotent.decorator';

// Type alias for safe error handling
type SafeError = { stack?: string; message?: string };

// Interface for commands that support idempotency
export interface IdempotentCommand {
  conversationId: string;
  clientMessageId?: string;
  userId: string;
}

// Interface for idempotency result
export interface IdempotencyResult<T = unknown> {
  isDuplicate: boolean;
  cachedResult?: T;
}

@Injectable()
export class IdempotencyService {
  private readonly logger = new Logger(IdempotencyService.name);

  constructor(
    private readonly messageIdService: MessageIdService,
    private readonly reflector: Reflector,
  ) {}

  /**
   * Check if a command is idempotent and handle deduplication
   * @param command The command to check
   * @param handler The command handler class
   * @returns IdempotencyResult indicating if it's a duplicate
   */
  async checkIdempotency<T extends IdempotentCommand>(
    command: T,
    handler: unknown,
  ): Promise<IdempotencyResult> {
    try {
      // Check if the handler is marked as idempotent
      const isIdempotent = this.reflector.get<boolean>(
        IDEMPOTENT_KEY,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument
        (handler as any).constructor,
      );

      if (!isIdempotent || !command.clientMessageId) {
        return { isDuplicate: false };
      }

      // Check for duplicate using MessageIdService
      const isDuplicate = await this.messageIdService.isDuplicate(
        command.conversationId,
        command.clientMessageId,
      );

      if (isDuplicate) {
        this.logger.debug(
          `Duplicate command detected: ${command.clientMessageId} for conversation ${command.conversationId}`,
        );
        return { isDuplicate: true };
      }

      return { isDuplicate: false };
    } catch (error: unknown) {
      const safeError = error as SafeError;
      this.logger.error(
        `Error checking idempotency for command ${command.clientMessageId}`,
        safeError.stack,
      );
      // In case of error, assume it's not a duplicate to maintain availability
      return { isDuplicate: false };
    }
  }

  /**
   * Record a successful command execution for idempotency
   * @param command The executed command
   * @param handler The command handler class
   */
  async recordExecution<T extends IdempotentCommand>(
    command: T,
    handler: unknown,
  ): Promise<void> {
    try {
      // Check if the handler is marked as idempotent
      const isIdempotent = this.reflector.get<boolean>(
        IDEMPOTENT_KEY,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument
        (handler as any).constructor,
      );

      if (!isIdempotent || !command.clientMessageId) {
        return;
      }

      // Record the message ID to prevent future duplicates
      await this.messageIdService.recordMessageId(
        command.conversationId,
        command.clientMessageId,
      );

      this.logger.debug(
        `Recorded successful execution: ${command.clientMessageId} for conversation ${command.conversationId}`,
      );
    } catch (error: unknown) {
      const safeError = error as SafeError;
      this.logger.error(
        `Error recording command execution ${command.clientMessageId}`,
        safeError.stack,
      );
      // Don't throw here to avoid failing the main operation
    }
  }

  /**
   * Handle conflict detection for message edits
   * @param messageId The message ID being edited
   * @param expectedVersion The expected version/timestamp for optimistic locking
   * @param currentVersion The current version/timestamp from database
   * @returns True if there's a conflict, false otherwise
   */
  detectEditConflict(
    messageId: string,
    expectedVersion: Date,
    currentVersion: Date,
  ): boolean {
    const conflict = expectedVersion.getTime() !== currentVersion.getTime();

    if (conflict) {
      this.logger.warn(
        `Edit conflict detected for message ${messageId}: expected ${expectedVersion.toISOString()}, got ${currentVersion.toISOString()}`,
      );
    }

    return conflict;
  }

  /**
   * Generate a conflict resolution strategy for message edits
   * @param messageId The message ID with conflict
   * @param userEdit The user's edit attempt
   * @param currentContent The current message content
   * @returns Conflict resolution result
   */
  resolveEditConflict(
    messageId: string,
    userEdit: unknown,
    currentContent: unknown,
  ): { strategy: 'reject' | 'merge' | 'overwrite'; result?: unknown } {
    // For now, implement a simple "reject" strategy
    // In the future, this could be enhanced with more sophisticated merge logic
    this.logger.warn(
      `Rejecting conflicting edit for message ${messageId} - concurrent modification detected`,
    );

    return {
      strategy: 'reject',
      result: {
        error: 'EDIT_CONFLICT',
        message:
          'Message was modified by another user. Please refresh and try again.',
        currentContent,
      },
    };
  }
}
