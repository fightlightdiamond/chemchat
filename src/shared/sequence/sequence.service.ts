import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { DatabaseService } from '../services/database.service';

type SafeError = Error & { stack?: string };

@Injectable()
export class SequenceService {
  private readonly logger = new Logger(SequenceService.name);
  private readonly REDIS_KEY_PREFIX = 'seq:';
  private readonly LOCK_TIMEOUT_MS = 5000; // 5 seconds lock
  private readonly LOCK_RETRY_DELAY = 100; // 100ms between retries
  private readonly MAX_RETRIES = 3;

  constructor(
    private readonly redis: RedisService,
    private readonly prisma: DatabaseService,
  ) {}

  private readonly TTL_MS = 5000; // 5 seconds lock for distributed locks

  /**
   * Get the next sequence number for a conversation
   * Uses Redis INCR with database fallback
   */
  async getNextSequence(conversationId: string): Promise<bigint> {
    const redisKey = this.getRedisKey(conversationId);

    try {
      // Try to increment in Redis first
      const nextSeq = await this.redis.exec((client) => client.incr(redisKey));

      if (nextSeq === 1) {
        // First time in Redis, need to sync with database
        await this.syncWithDatabase(conversationId, BigInt(nextSeq));
      }

      return BigInt(nextSeq);
    } catch (error: unknown) {
      const safeError = error as SafeError;
      this.logger.warn(
        `Redis sequence increment failed for ${conversationId}: ${safeError.message}`,
        safeError.stack,
      );

      // Fallback to database with locking
      return this.getNextSequenceFromDatabase(conversationId);
    }
  }

  /**
   * Batch get next sequence numbers
   * @param conversationId Conversation ID
   * @param count Number of sequences to reserve
   */
  async getNextSequences(
    conversationId: string,
    count: number,
  ): Promise<{ start: bigint; end: bigint }> {
    if (count < 1) {
      throw new Error('Count must be greater than 0');
    }

    const redisKey = this.getRedisKey(conversationId);

    try {
      // Use INCRBY to reserve a range of sequence numbers
      const end = await this.redis.exec((client) =>
        client.incrby(redisKey, count),
      );
      const start = end - count + 1;

      if (start === 1) {
        // First time in Redis, need to sync with database
        await this.syncWithDatabase(conversationId, BigInt(end));
      }

      return { start: BigInt(start), end: BigInt(end) };
    } catch (error: unknown) {
      const safeError = error as SafeError;
      this.logger.warn(
        `Redis bulk sequence increment failed for ${conversationId}, falling back to database`,
        safeError.stack,
      );

      // Fallback to database with locking
      return this.getNextSequencesFromDatabase(conversationId, count);
    }
  }

  /**
   * Get the current sequence number without incrementing
   */
  async getCurrentSequence(conversationId: string): Promise<bigint> {
    const redisKey = this.getRedisKey(conversationId);

    try {
      const current = await this.redis.exec((client) => client.get(redisKey));
      if (current) {
        return BigInt(current);
      }
    } catch (error: unknown) {
      const safeError = error as SafeError;
      this.logger.warn(
        `Redis get sequence failed for ${conversationId}, falling back to database`,
        safeError.stack,
      );
    }

    // Fallback to database
    const lastMessage = await this.prisma.message.findFirst({
      where: { conversationId },
      orderBy: { sequenceNumber: 'desc' },
      select: { sequenceNumber: true },
    });

    return lastMessage?.sequenceNumber ?? 0n;
  }

  /**
   * Reset sequence number (for testing purposes)
   */
  async resetSequence(conversationId: string): Promise<void> {
    const redisKey = this.getRedisKey(conversationId);
    try {
      await this.redis.exec((client) => client.pexpire(redisKey, this.TTL_MS));
    } catch (error: unknown) {
      const safeError = error as SafeError;
      this.logger.warn(
        `Failed to reset Redis sequence for ${conversationId}`,
        safeError.stack,
      );
    }
  }

  private getRedisKey(conversationId: string): string {
    return `${this.REDIS_KEY_PREFIX}${conversationId}`;
  }

  private async syncWithDatabase(
    conversationId: string,
    currentValue: bigint,
  ): Promise<void> {
    try {
      // Get the latest sequence from the database
      const lastMessage = await this.prisma.message.findFirst({
        where: { conversationId },
        orderBy: { sequenceNumber: 'desc' },
        select: { sequenceNumber: true },
      });

      const dbSequence = lastMessage?.sequenceNumber ?? 0n;

      // If the database has a higher sequence, update Redis
      if (dbSequence >= currentValue) {
        await this.redis.exec((client) =>
          client.set(this.getRedisKey(conversationId), dbSequence.toString()),
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to sync sequence with database for ${conversationId}`,
      );
      throw error;
    }
  }

  private async getNextSequenceFromDatabase(
    conversationId: string,
    retryCount = 0,
  ): Promise<bigint> {
    const lockKey = `lock:${this.getRedisKey(conversationId)}`;

    try {
      // Try to acquire a distributed lock
      const acquired = await this.acquireLock(lockKey);
      if (!acquired) {
        if (retryCount < this.MAX_RETRIES) {
          await new Promise((resolve) =>
            setTimeout(resolve, this.LOCK_RETRY_DELAY),
          );
          return this.getNextSequenceFromDatabase(
            conversationId,
            retryCount + 1,
          );
        }
        throw new Error('Failed to acquire lock for sequence generation');
      }

      try {
        // Get the latest sequence from the database
        const lastMessage = await this.prisma.message.findFirst({
          where: { conversationId },
          orderBy: { sequenceNumber: 'desc' },
          select: { sequenceNumber: true },
        });

        const nextSequence = (lastMessage?.sequenceNumber ?? 0n) + 1n;

        // Update Redis cache for future requests
        try {
          await this.redis.exec((client) =>
            client.set(
              this.getRedisKey(conversationId),
              nextSequence.toString(),
            ),
          );
        } catch (redisError: unknown) {
          const safeRedisError = redisError as SafeError;
          this.logger.warn(
            'Failed to update Redis sequence after database fallback',
            safeRedisError,
          );
        }

        return nextSequence;
      } finally {
        // Always release the lock
        await this.releaseLock(lockKey);
      }
    } catch (error: unknown) {
      const safeError = error as SafeError;
      this.logger.error(
        `Failed to get next sequence from database for ${conversationId}`,
        safeError.stack,
      );
      throw error;
    }
  }

  private async getNextSequencesFromDatabase(
    conversationId: string,
    count: number,
    retryCount = 0,
  ): Promise<{ start: bigint; end: bigint }> {
    const lockKey = `lock:${this.getRedisKey(conversationId)}`;

    try {
      // Try to acquire a distributed lock
      const acquired = await this.acquireLock(lockKey);
      if (!acquired) {
        if (retryCount < this.MAX_RETRIES) {
          await new Promise((resolve) =>
            setTimeout(resolve, this.LOCK_RETRY_DELAY),
          );
          return this.getNextSequencesFromDatabase(
            conversationId,
            count,
            retryCount + 1,
          );
        }
        throw new Error('Failed to acquire lock for sequence generation');
      }

      try {
        // Get the latest sequence from the database
        const lastMessage = await this.prisma.message.findFirst({
          where: { conversationId },
          orderBy: { sequenceNumber: 'desc' },
          select: { sequenceNumber: true },
        });

        const startSequence = (lastMessage?.sequenceNumber ?? 0n) + 1n;
        const endSequence = startSequence + BigInt(count - 1);

        // Update Redis cache for future requests
        try {
          await this.redis.exec((client) =>
            client.set(
              this.getRedisKey(conversationId),
              endSequence.toString(),
            ),
          );
        } catch (redisError: unknown) {
          const safeRedisError = redisError as SafeError;
          this.logger.warn(
            'Failed to update Redis sequence after database fallback',
            safeRedisError,
          );
        }

        return { start: startSequence, end: endSequence };
      } finally {
        // Always release the lock
        await this.releaseLock(lockKey);
      }
    } catch (error: unknown) {
      const safeError = error as SafeError;
      this.logger.error(
        `Failed to get next sequences from database for ${conversationId}`,
        safeError.stack,
      );
      throw error;
    }
  }

  private async acquireLock(lockKey: string): Promise<boolean> {
    try {
      // Use SET with NX to atomically check and set the key
      const result = await this.redis.exec((client) =>
        client.set(lockKey, '1', 'PX', this.TTL_MS, 'NX'),
      );
      return result === 'OK';
    } catch (error: unknown) {
      const safeError = error as SafeError;
      this.logger.warn(
        `Failed to acquire lock: ${safeError.message}`,
        safeError.stack,
      );
      return false;
    }
  }

  private async releaseLock(lockKey: string): Promise<void> {
    try {
      await this.redis.exec((client) => client.del(lockKey));
    } catch (error: unknown) {
      const safeError = error as SafeError;
      this.logger.warn(
        `Failed to release lock: ${safeError.message}`,
        safeError.stack,
      );
    }
  }
}
