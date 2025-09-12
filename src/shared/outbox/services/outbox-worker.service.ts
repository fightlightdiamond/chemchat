import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OutboxService } from './outbox.service';
import { KafkaProducerService } from '../../kafka/services/kafka-producer.service';
import { EventSerializerService } from './event-serializer.service';
import { OutboxWorkerConfig } from '../interfaces/outbox-event.interface';
import { TypedOutboxEvent } from '../interfaces/outbox-event-data.interface';

@Injectable()
export class OutboxWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxWorkerService.name);
  private processingInterval: NodeJS.Timeout | null = null;
  private isProcessing = false;
  private isShuttingDown = false;

  private readonly config: OutboxWorkerConfig;

  constructor(
    private readonly outboxService: OutboxService,
    private readonly kafkaProducer: KafkaProducerService,
    private readonly eventSerializer: EventSerializerService,
    private readonly configService: ConfigService,
  ) {
    this.config = {
      batchSize: this.configService.get('OUTBOX_BATCH_SIZE', 50),
      maxRetries: this.configService.get('OUTBOX_MAX_RETRIES', 5),
      retryDelayMs: this.configService.get('OUTBOX_RETRY_DELAY_MS', 5000),
      processingIntervalMs: this.configService.get(
        'OUTBOX_PROCESSING_INTERVAL_MS',
        1000,
      ),
      enableDeadLetterQueue: this.configService.get('OUTBOX_ENABLE_DLQ', true),
    };
  }

  onModuleInit(): void {
    this.logger.log('Starting outbox worker', this.config);
    this.startProcessing();
  }

  async onModuleDestroy(): Promise<void> {
    this.logger.log('Shutting down outbox worker');
    this.isShuttingDown = true;

    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }

    // Wait for current processing to complete
    let attempts = 0;
    while (this.isProcessing && attempts < 30) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      attempts++;
    }

    if (this.isProcessing) {
      this.logger.warn('Forced shutdown while processing events');
    }
  }

  private startProcessing(): void {
    this.processingInterval = setInterval(() => {
      if (!this.isProcessing && !this.isShuttingDown) {
        void this.processEvents();
      }
    }, this.config.processingIntervalMs);
  }

  private async processEvents(): Promise<void> {
    if (this.isProcessing || this.isShuttingDown) {
      return;
    }

    this.isProcessing = true;

    try {
      // Check if Kafka producer is healthy
      if (!this.kafkaProducer.isHealthy()) {
        this.logger.warn(
          'Kafka producer is not healthy, skipping event processing',
        );
        return;
      }

      // Get unpublished events
      const events = await this.outboxService.getUnpublishedEvents({
        maxRetries: this.config.maxRetries,
        limit: this.config.batchSize,
      });

      if (events.length === 0) {
        return;
      }

      this.logger.debug(`Processing ${events.length} outbox events`);

      // Process events in parallel with controlled concurrency
      const promises = events.map((event) => this.processEvent(event));
      await Promise.allSettled(promises);

      // Handle dead letter queue if enabled
      if (this.config.enableDeadLetterQueue) {
        await this.processDeadLetterQueue();
      }
    } catch (error) {
      this.logger.error('Error in outbox worker processing', {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.isProcessing = false;
    }
  }

  private async processEvent(event: TypedOutboxEvent): Promise<void> {
    try {
      // Serialize the event
      const serializedEvent = this.eventSerializer.serialize(
        { toJSON: () => event.eventData } as { toJSON(): any },
        event.id,
        event.aggregateType,
        event.aggregateId,
        event.tenantId,
        (event.eventData as { correlationId?: string }).correlationId,
      );

      // Get topic for event type
      const topic = this.eventSerializer.getTopicForEventType(
        event.eventType,
        event.tenantId,
      );

      // Publish to Kafka
      const result = await this.kafkaProducer.publishEvent(
        serializedEvent,
        topic,
      );

      if (result.success) {
        // Mark as published
        await this.outboxService.markAsPublished(event.id);

        this.logger.debug('Event published successfully', {
          eventId: event.id,
          eventType: event.eventType,
          topic,
          partition: result.partition,
          offset: result.offset,
        });
      } else {
        // Increment retry count
        await this.outboxService.incrementRetryCount(event.id);

        this.logger.warn('Failed to publish event, will retry', {
          eventId: event.id,
          eventType: event.eventType,
          error: result.error,
          retryCount: event.retryCount + 1,
        });
      }
    } catch (error) {
      // Increment retry count on any error
      await this.outboxService.incrementRetryCount(event.id);

      this.logger.error('Error processing outbox event', {
        eventId: event.id,
        eventType: event.eventType,
        error: error instanceof Error ? error.message : String(error),
        retryCount: event.retryCount + 1,
      });
    }
  }

  private async processDeadLetterQueue(): Promise<void> {
    try {
      const deadLetterEvents = await this.outboxService.getDeadLetterEvents(
        this.config.maxRetries,
        10, // Process smaller batches for DLQ
      );

      if (deadLetterEvents.length === 0) {
        return;
      }

      this.logger.warn(
        `Found ${deadLetterEvents.length} events in dead letter queue`,
      );

      // For now, just log the dead letter events
      // In a production system, you might want to:
      // 1. Send to a dead letter topic
      // 2. Send alerts
      // 3. Store in a separate table for manual review
      for (const event of deadLetterEvents) {
        this.logger.error('Event in dead letter queue', {
          eventId: event.id,
          eventType: event.eventType,
          aggregateType: event.aggregateType,
          aggregateId: event.aggregateId,
          retryCount: event.retryCount,
          createdAt: event.createdAt,
        });

        // Optionally publish to dead letter topic
        try {
          const serializedEvent = this.eventSerializer.serialize(
            { toJSON: () => event.eventData } as { toJSON(): any },
            event.id,
            event.aggregateType,
            event.aggregateId,
            event.tenantId,
            (event.eventData as { correlationId?: string }).correlationId,
          );

          const dlqTopic = `dlq.${this.eventSerializer.getTopicForEventType(
            event.eventType,
            event.tenantId,
          )}`;

          await this.kafkaProducer.publishEvent(serializedEvent, dlqTopic);

          // Mark as published to prevent reprocessing
          await this.outboxService.markAsPublished(event.id);

          this.logger.log('Event moved to dead letter topic', {
            eventId: event.id,
            dlqTopic,
          });
        } catch (dlqError) {
          this.logger.error('Failed to publish to dead letter topic', {
            eventId: event.id,
            error:
              dlqError instanceof Error ? dlqError.message : String(dlqError),
          });
        }
      }
    } catch (error) {
      this.logger.error('Error processing dead letter queue', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get worker statistics
   */
  async getStatistics(): Promise<{
    isProcessing: boolean;
    config: OutboxWorkerConfig;
    outboxStats: any;
  }> {
    const outboxStats = await this.outboxService.getStatistics();

    return {
      isProcessing: this.isProcessing,
      config: this.config,
      outboxStats,
    };
  }

  /**
   * Manually trigger event processing (useful for testing)
   */
  async triggerProcessing(): Promise<void> {
    if (!this.isProcessing) {
      await this.processEvents();
    }
  }
}
