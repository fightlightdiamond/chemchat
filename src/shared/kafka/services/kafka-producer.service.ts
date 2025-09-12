import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Producer, ProducerRecord } from 'kafkajs';
import {
  KafkaMessage,
  KafkaPublishResult,
  SerializedEvent,
} from '../interfaces/kafka.interface';

@Injectable()
export class KafkaProducerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaProducerService.name);
  private kafka: Kafka;
  private producer: Producer;
  private isConnected = false;

  constructor(private readonly configService: ConfigService) {
    this.kafka = new Kafka({
      clientId: this.configService.get('KAFKA_CLIENT_ID', 'chemchat-producer'),
      brokers: this.configService
        .get<string>('KAFKA_BROKERS', 'localhost:9092')
        .split(','),
      retry: {
        initialRetryTime: 100,
        retries: 8,
      },
    });

    this.producer = this.kafka.producer({
      maxInFlightRequests: 1,
      idempotent: true,
      transactionTimeout: 30000,
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.producer.connect();
      this.isConnected = true;
      this.logger.log('Kafka producer connected successfully');
    } catch (error) {
      this.logger.error('Failed to connect Kafka producer', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      if (this.isConnected) {
        await this.producer.disconnect();
        this.isConnected = false;
        this.logger.log('Kafka producer disconnected');
      }
    } catch (error) {
      this.logger.error('Error disconnecting Kafka producer', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Publish a single message to Kafka
   */
  async publishMessage(message: KafkaMessage): Promise<KafkaPublishResult> {
    if (!this.isConnected) {
      throw new Error('Kafka producer is not connected');
    }

    try {
      const record: ProducerRecord = {
        topic: message.topic,
        messages: [
          {
            partition: message.partition,
            key: message.key,
            value: message.value,
            headers: message.headers,
          },
        ],
      };

      const result = await this.producer.send(record);
      const metadata = result[0];

      this.logger.debug('Message published successfully', {
        topic: message.topic,
        partition: metadata.partition,
        offset: metadata.offset,
        key: message.key,
      });

      return {
        success: true,
        topic: message.topic,
        partition: metadata.partition,
        offset: metadata.offset,
      };
    } catch (error) {
      this.logger.error('Failed to publish message', {
        error: error instanceof Error ? error.message : String(error),
        topic: message.topic,
        key: message.key,
      });

      return {
        success: false,
        topic: message.topic,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Publish multiple messages in a batch
   */
  async publishBatch(messages: KafkaMessage[]): Promise<KafkaPublishResult[]> {
    if (!this.isConnected) {
      throw new Error('Kafka producer is not connected');
    }

    const results: KafkaPublishResult[] = [];

    try {
      // Group messages by topic
      const messagesByTopic = messages.reduce(
        (acc, message) => {
          if (!acc[message.topic]) {
            acc[message.topic] = [];
          }
          acc[message.topic].push(message);
          return acc;
        },
        {} as Record<string, KafkaMessage[]>,
      );

      // Send messages for each topic
      for (const [topic, topicMessages] of Object.entries(messagesByTopic)) {
        const producerRecord: ProducerRecord = {
          topic,
          messages: topicMessages.map((msg) => ({
            partition: msg.partition,
            key: msg.key,
            value: msg.value,
            headers: msg.headers,
          })),
        };

        const kafkaResults = await this.producer.send(producerRecord);
        kafkaResults.forEach((metadata) => {
          results.push({
            success: true,
            topic,
            partition: metadata.partition,
            offset: metadata.offset,
          });
        });
      }

      this.logger.debug(`Published batch of ${messages.length} messages`);
      return results;
    } catch (error) {
      this.logger.error('Failed to publish batch', {
        error: error instanceof Error ? error.message : String(error),
        messageCount: messages.length,
      });

      // Return error results for all messages
      return messages.map((msg) => ({
        success: false,
        topic: msg.topic,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }

  /**
   * Publish a serialized event
   */
  async publishEvent(
    event: SerializedEvent,
    topic: string,
  ): Promise<KafkaPublishResult> {
    const message: KafkaMessage = {
      topic,
      key: event.metadata.aggregateId, // Use aggregateId as partition key for ordering
      value: JSON.stringify(event),
      headers: {
        'event-type': event.metadata.eventType,
        'aggregate-type': event.metadata.aggregateType,
        'correlation-id': event.metadata.correlationId || '',
        'tenant-id': event.metadata.tenantId || '',
        'content-type': 'application/json',
      },
    };

    return this.publishMessage(message);
  }

  /**
   * Check if producer is healthy
   */
  isHealthy(): boolean {
    return this.isConnected;
  }

  /**
   * Get producer metrics
   */
  getMetrics(): Record<string, any> {
    try {
      // KafkaJS doesn't expose detailed metrics, but we can provide basic info
      return {
        connected: this.isConnected,
        producerConnected: this.isConnected,
      };
    } catch {
      throw new Error('Failed to get producer metrics');
    }
  }
}
