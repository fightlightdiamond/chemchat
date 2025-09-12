import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Kafka,
  Consumer,
  EachMessagePayload,
  ConsumerSubscribeTopics,
} from 'kafkajs';
import { EventSerializerService } from '../../outbox/services/event-serializer.service';
import { SerializedEvent } from '../interfaces/kafka.interface';

export interface EventHandler {
  eventType: string;
  handle(event: SerializedEvent): Promise<void>;
}

@Injectable()
export class KafkaConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaConsumerService.name);
  private kafka: Kafka;
  private consumer: Consumer;
  private isConnected = false;
  private eventHandlers = new Map<string, EventHandler[]>();

  constructor(
    private readonly configService: ConfigService,
    private readonly eventSerializer: EventSerializerService,
  ) {
    this.kafka = new Kafka({
      clientId: this.configService.get('KAFKA_CLIENT_ID', 'chemchat-consumer'),
      brokers: this.configService
        .get<string>('KAFKA_BROKERS', 'localhost:9092')
        .split(','),
      retry: {
        initialRetryTime: 100,
        retries: 8,
      },
    });

    this.consumer = this.kafka.consumer({
      groupId: this.configService.get(
        'KAFKA_CONSUMER_GROUP',
        'chemchat-consumers',
      ),
      sessionTimeout: 30000,
      heartbeatInterval: 3000,
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.consumer.connect();
      this.isConnected = true;
      this.logger.log('Kafka consumer connected successfully');

      // Set up message processing
      await this.consumer.run({
        eachMessage: this.processMessage.bind(this) as (
          payload: EachMessagePayload,
        ) => Promise<void>,
      });
    } catch (err) {
      this.logger.error('Failed to get consumer metrics', {
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      if (this.isConnected) {
        await this.consumer.disconnect();
        this.isConnected = false;
        this.logger.log('Kafka consumer disconnected');
      }
    } catch (error) {
      this.logger.error('Error disconnecting Kafka consumer', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Subscribe to topics
   */
  async subscribe(topics: ConsumerSubscribeTopics): Promise<void> {
    if (!this.isConnected) {
      throw new Error('Kafka consumer is not connected');
    }

    try {
      await this.consumer.subscribe(topics);
      this.logger.log('Subscribed to topics', { topics: topics.topics });
    } catch (error) {
      this.logger.error('Failed to subscribe to topics', {
        error: error instanceof Error ? error.message : String(error),
        topics: topics.topics,
      });
      throw error;
    }
  }

  /**
   * Register an event handler
   */
  registerEventHandler(handler: EventHandler): void {
    if (!this.eventHandlers.has(handler.eventType)) {
      this.eventHandlers.set(handler.eventType, []);
    }

    const handlers = this.eventHandlers.get(handler.eventType);
    if (handlers) {
      handlers.push(handler);
      this.logger.debug(
        `Registered handler for event type: ${handler.eventType}`,
      );
    }
  }

  /**
   * Unregister an event handler
   */
  unregisterEventHandler(eventType: string, handler: EventHandler): void {
    const handlers = this.eventHandlers.get(eventType);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
        this.logger.debug(`Unregistered handler for event type: ${eventType}`);
      }
    }
  }

  /**
   * Process incoming Kafka message
   */
  private async processMessage(payload: EachMessagePayload): Promise<void> {
    const { topic, partition, message } = payload;

    try {
      if (!message.value) {
        this.logger.warn('Received message with no value', {
          topic,
          partition,
        });
        return;
      }

      // Deserialize the event
      const serializedEvent = this.eventSerializer.deserialize(
        message.value.toString(),
      );

      // Validate the event
      if (!this.eventSerializer.validateSerializedEvent(serializedEvent)) {
        this.logger.error('Invalid event format', {
          topic,
          partition,
          offset: message.offset,
        });
        return;
      }

      const { metadata } = serializedEvent;

      this.logger.debug('Processing event', {
        eventId: metadata.eventId,
        eventType: metadata.eventType,
        topic,
        partition,
        offset: message.offset,
      });

      // Get handlers for this event type
      const handlers = this.eventHandlers.get(metadata.eventType) || [];

      if (handlers.length === 0) {
        this.logger.warn('No handlers registered for event type', {
          eventType: metadata.eventType,
          eventId: metadata.eventId,
        });
        return;
      }

      // Process with all registered handlers
      const handlerPromises = handlers.map(async (handler) => {
        try {
          await handler.handle(serializedEvent);
          this.logger.debug('Event processed successfully', {
            eventId: metadata.eventId,
            eventType: metadata.eventType,
            handlerName: handler.constructor.name,
          });
        } catch (error) {
          this.logger.error('Handler failed to process event', {
            eventId: metadata.eventId,
            eventType: metadata.eventType,
            handlerName: handler.constructor.name,
            error: error instanceof Error ? error.message : String(error),
          });
          // Don't rethrow - we want to continue processing with other handlers
        }
      });

      await Promise.allSettled(handlerPromises);
    } catch (error) {
      this.logger.error('Failed to process message', {
        topic,
        partition,
        offset: message.offset,
        error: error instanceof Error ? error.message : String(error),
      });

      // In a production system, you might want to:
      // 1. Send to dead letter queue
      // 2. Implement retry logic
      // 3. Alert monitoring systems
      throw error; // This will cause the consumer to retry or move to DLQ
    }
  }

  /**
   * Check if consumer is healthy
   */
  isHealthy(): boolean {
    return this.isConnected;
  }

  /**
   * Get consumer metrics
   */
  getMetrics(): {
    connected: boolean;
    registeredHandlers: { eventType: string; handlerCount: number }[];
  } {
    try {
      return {
        connected: this.isConnected,
        registeredHandlers: Array.from(this.eventHandlers.entries()).map(
          ([eventType, handlers]) => ({
            eventType,
            handlerCount: handlers.length,
          }),
        ),
      };
    } catch {
      throw new Error('Failed to get consumer metrics');
    }
  }
}
