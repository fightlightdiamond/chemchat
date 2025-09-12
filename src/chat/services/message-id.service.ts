import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../shared/redis/redis.service';

// Type alias for safe error handling
type SafeError = { stack?: string; message?: string };

@Injectable()
export class MessageIdService {
  private readonly logger = new Logger(MessageIdService.name);
  private readonly PREFIX = 'msgid:';
  private readonly TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

  constructor(private readonly redis: RedisService) {}

  /**
   * Check if a client message ID has been seen before
   * @param conversationId The conversation ID
   * @param clientMessageId The client-generated message ID
   * @returns True if the message ID is a duplicate, false otherwise
   */
  async isDuplicate(
    conversationId: string,
    clientMessageId: string,
  ): Promise<boolean> {
    if (!clientMessageId) return false;

    const key = this.getMessageIdKey(conversationId, clientMessageId);

    try {
      // Use SET with NX to atomically check and set the key
      const result = await this.redis.exec((client) =>
        client.set(key, '1', 'PX', this.TTL_MS, 'NX'),
      );

      // If result is null, the key already exists (duplicate)
      return result !== 'OK';
    } catch (error: unknown) {
      const safeError = error as SafeError;
      this.logger.error(
        `Failed to check message ID ${clientMessageId} for conversation ${conversationId}`,
        safeError.stack,
      );
      // In case of Redis failure, we'll assume it's not a duplicate
      // This is a fail-open approach to maintain availability
      return false;
    }
  }

  /**
   * Record a client message ID to prevent duplicates
   * @param conversationId The conversation ID
   * @param clientMessageId The client-generated message ID
   * @param ttlMs Optional TTL in milliseconds (defaults to 7 days)
   */
  async recordMessageId(
    conversationId: string,
    clientMessageId: string,
    ttlMs: number = this.TTL_MS,
  ): Promise<void> {
    if (!clientMessageId) return;

    const key = this.getMessageIdKey(conversationId, clientMessageId);

    try {
      await this.redis.exec((client) => client.set(key, '1', 'PX', ttlMs));
    } catch (error: unknown) {
      const safeError = error as SafeError;
      this.logger.error(
        `Failed to record message ID ${clientMessageId} for conversation ${conversationId}`,
        safeError.stack,
      );
      // Log the error but don't fail the operation
    }
  }

  /**
   * Extend the TTL of a client message ID
   * @param conversationId The conversation ID
   * @param clientMessageId The client-generated message ID
   * @param ttlMs Optional TTL in milliseconds (defaults to 7 days)
   */
  async extendMessageIdTtl(
    conversationId: string,
    clientMessageId: string,
    ttlMs: number = this.TTL_MS,
  ): Promise<void> {
    if (!clientMessageId) return;

    const key = this.getMessageIdKey(conversationId, clientMessageId);

    try {
      // Use PEXPIRE to extend the TTL of an existing key
      await this.redis.exec((client) => client.pexpire(key, ttlMs));
    } catch (error: unknown) {
      const safeError = error as SafeError;
      this.logger.error(
        `Failed to extend TTL for message ID ${clientMessageId} in conversation ${conversationId}`,
        safeError.stack,
      );
    }
  }

  /**
   * Remove a client message ID from the deduplication cache
   * @param conversationId The conversation ID
   * @param clientMessageId The client-generated message ID
   */
  async removeMessageId(
    conversationId: string,
    clientMessageId: string,
  ): Promise<void> {
    if (!clientMessageId) return;

    const key = this.getMessageIdKey(conversationId, clientMessageId);

    try {
      await this.redis.exec((client) => client.del(key));
    } catch (error: unknown) {
      const safeError = error as SafeError;
      this.logger.error(
        `Failed to remove message ID ${clientMessageId} from conversation ${conversationId}`,
        safeError.stack,
      );
    }
  }

  private getMessageIdKey(
    conversationId: string,
    clientMessageId: string,
  ): string {
    return `${this.PREFIX}${conversationId}:${clientMessageId}`;
  }
}
