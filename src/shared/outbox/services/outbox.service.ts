import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import {
  OutboxEventData,
  OutboxEventFilter,
} from '../interfaces/outbox-event.interface';
import { IEvent } from '@nestjs/cqrs';

@Injectable()
export class OutboxService {
  private readonly logger = new Logger(OutboxService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Store an event in the outbox for reliable publishing
   */
  async storeEvent(
    aggregateType: string,
    aggregateId: string,
    event: IEvent & { toJSON(): any },
    tenantId?: string,
  ): Promise<string> {
    try {
      const eventData = event.toJSON() as Record<string, any>;
      const eventType =
        (eventData as { eventType?: string }).eventType ||
        event.constructor.name;

      const outboxEvent = await this.prisma.outboxEvent.create({
        data: {
          tenantId,
          aggregateType,
          aggregateId,
          eventType,
          eventData: eventData,
          retryCount: 0,
        },
      });

      this.logger.debug(
        `Stored event ${eventType} for aggregate ${aggregateId}`,
        {
          eventId: outboxEvent.id,
          aggregateType,
          aggregateId,
          tenantId,
        },
      );

      return outboxEvent.id;
    } catch (error) {
      this.logger.error('Failed to store outbox event', {
        error: error instanceof Error ? error.message : String(error),
        aggregateType,
        aggregateId,
        eventType: event.constructor.name,
        tenantId,
      });
      throw error;
    }
  }

  /**
   * Get unpublished events for processing
   */
  async getUnpublishedEvents(
    filter: OutboxEventFilter = {},
  ): Promise<OutboxEventData[]> {
    const {
      tenantId,
      aggregateType,
      aggregateId,
      eventType,
      maxRetries = 5,
      limit = 100,
    } = filter;

    try {
      const events = await this.prisma.outboxEvent.findMany({
        where: {
          tenantId,
          aggregateType,
          aggregateId,
          eventType,
          publishedAt: null,
          retryCount: {
            lt: maxRetries,
          },
        },
        orderBy: {
          createdAt: 'asc',
        },
        take: limit,
      });

      return events.map((event) => ({
        id: event.id,
        tenantId: event.tenantId || undefined,
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        eventType: event.eventType,
        eventData: event.eventData as Record<string, any>,
        createdAt: event.createdAt,
        publishedAt: event.publishedAt || undefined,
        retryCount: event.retryCount,
      }));
    } catch (error) {
      this.logger.error('Failed to get unpublished events', {
        error: error instanceof Error ? error.message : String(error),
        filter,
      });
      throw error;
    }
  }

  /**
   * Mark an event as published
   */
  async markAsPublished(eventId: string): Promise<void> {
    try {
      await this.prisma.outboxEvent.update({
        where: { id: eventId },
        data: {
          publishedAt: new Date(),
        },
      });

      this.logger.debug(`Marked event ${eventId} as published`);
    } catch (error) {
      this.logger.error('Failed to mark event as published', {
        error: error instanceof Error ? error.message : String(error),
        eventId,
      });
      throw error;
    }
  }

  /**
   * Increment retry count for failed event
   */
  async incrementRetryCount(eventId: string): Promise<void> {
    try {
      await this.prisma.outboxEvent.update({
        where: { id: eventId },
        data: {
          retryCount: {
            increment: 1,
          },
        },
      });

      this.logger.debug(`Incremented retry count for event ${eventId}`);
    } catch (error) {
      this.logger.error('Failed to increment retry count', {
        error: error instanceof Error ? error.message : String(error),
        eventId,
      });
      throw error;
    }
  }

  /**
   * Get events that have exceeded max retries (dead letter queue)
   */
  async getDeadLetterEvents(
    maxRetries = 5,
    limit = 100,
  ): Promise<OutboxEventData[]> {
    try {
      const events = await this.prisma.outboxEvent.findMany({
        where: {
          publishedAt: null,
          retryCount: {
            gte: maxRetries,
          },
        },
        orderBy: {
          createdAt: 'asc',
        },
        take: limit,
      });

      return events.map((event) => ({
        id: event.id,
        tenantId: event.tenantId || undefined,
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        eventType: event.eventType,
        eventData: event.eventData as Record<string, any>,
        createdAt: event.createdAt,
        publishedAt: event.publishedAt || undefined,
        retryCount: event.retryCount,
      }));
    } catch (error) {
      this.logger.error('Failed to get dead letter events', {
        error: error instanceof Error ? error.message : String(error),
        maxRetries,
        limit,
      });
      throw error;
    }
  }

  /**
   * Clean up old published events
   */
  async cleanupPublishedEvents(olderThanDays = 30): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

      const result = await this.prisma.outboxEvent.deleteMany({
        where: {
          publishedAt: {
            not: null,
            lt: cutoffDate,
          },
        },
      });

      this.logger.log(
        `Cleaned up ${result.count} published events older than ${olderThanDays} days`,
      );
      return result.count;
    } catch (error) {
      this.logger.error('Failed to cleanup published events', {
        error: error instanceof Error ? error.message : String(error),
        olderThanDays,
      });
      throw error;
    }
  }

  /**
   * Get outbox statistics
   */
  async getStatistics(): Promise<{
    totalEvents: number;
    publishedEvents: number;
    pendingEvents: number;
    failedEvents: number;
  }> {
    try {
      const [totalEvents, publishedEvents, failedEvents] = await Promise.all([
        this.prisma.outboxEvent.count(),
        this.prisma.outboxEvent.count({
          where: { publishedAt: { not: null } },
        }),
        this.prisma.outboxEvent.count({
          where: {
            publishedAt: null,
            retryCount: { gte: 5 },
          },
        }),
      ]);

      const pendingEvents = totalEvents - publishedEvents - failedEvents;

      return {
        totalEvents,
        publishedEvents,
        pendingEvents,
        failedEvents,
      };
    } catch (error) {
      this.logger.error('Failed to get outbox statistics', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}
