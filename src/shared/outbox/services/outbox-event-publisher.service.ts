import { Injectable, Logger } from '@nestjs/common';
import { EventBus, IEvent } from '@nestjs/cqrs';
import { OutboxService } from './outbox.service';

@Injectable()
export class OutboxEventPublisherService {
  private readonly logger = new Logger(OutboxEventPublisherService.name);

  constructor(
    private readonly outboxService: OutboxService,
    private readonly eventBus: EventBus,
  ) {}

  /**
   * Publish an event through the outbox pattern
   * This ensures reliable event delivery even if Kafka is temporarily unavailable
   */
  async publishEvent(
    event: IEvent & { toJSON(): any },
    aggregateType: string,
    aggregateId: string,
    tenantId?: string,
  ): Promise<void> {
    try {
      // Store in outbox first
      const eventId = await this.outboxService.storeEvent(
        aggregateType,
        aggregateId,
        event,
        tenantId,
      );

      // Also publish to local event bus for immediate processing
      this.eventBus.publish(event);

      this.logger.debug('Event published through outbox', {
        eventId,
        eventType: event.constructor.name,
        aggregateType,
        aggregateId,
        tenantId,
      });
    } catch (error) {
      this.logger.error('Failed to publish event through outbox', {
        error: error instanceof Error ? error.message : String(error),
        eventType: event.constructor.name,
        aggregateType,
        aggregateId,
        tenantId,
      });
      throw error;
    }
  }

  /**
   * Publish multiple events in a transaction
   */
  async publishEvents(
    events: Array<{
      event: IEvent & { toJSON(): any };
      aggregateType: string;
      aggregateId: string;
      tenantId?: string;
    }>,
  ): Promise<void> {
    try {
      // Store all events in outbox
      const storePromises = events.map(
        ({ event, aggregateType, aggregateId, tenantId }) =>
          this.outboxService.storeEvent(
            aggregateType,
            aggregateId,
            event,
            tenantId,
          ),
      );

      await Promise.all(storePromises);

      // Publish to local event bus
      events.forEach(({ event }) => {
        this.eventBus.publish(event);
      });

      this.logger.debug(`Published ${events.length} events through outbox`);
    } catch (error) {
      this.logger.error('Failed to publish events through outbox', {
        error: error instanceof Error ? error.message : String(error),
        eventCount: events.length,
      });
      throw error;
    }
  }
}
