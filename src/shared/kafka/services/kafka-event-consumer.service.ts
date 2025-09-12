import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { KafkaConsumerService } from './kafka-consumer.service';
import {
  NotificationEventHandler,
  SearchIndexEventHandler,
  ConversationEventHandler,
  UserEventHandler,
} from '../handlers/notification-event.handler';

@Injectable()
export class KafkaEventConsumerService implements OnModuleInit {
  private readonly logger = new Logger(KafkaEventConsumerService.name);

  constructor(
    private readonly kafkaConsumer: KafkaConsumerService,
    private readonly notificationHandler: NotificationEventHandler,
    private readonly searchIndexHandler: SearchIndexEventHandler,
    private readonly conversationHandler: ConversationEventHandler,
    private readonly userHandler: UserEventHandler,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      // Register event handlers
      this.kafkaConsumer.registerEventHandler(this.notificationHandler);
      this.kafkaConsumer.registerEventHandler(this.searchIndexHandler);
      this.kafkaConsumer.registerEventHandler(this.conversationHandler);
      this.kafkaConsumer.registerEventHandler(this.userHandler);

      // Subscribe to topics
      await this.kafkaConsumer.subscribe({
        topics: [
          'chat.messages',
          'chat.conversations',
          'chat.users',
          'presence.status',
          'presence.typing',
          // Dead letter queues
          'dlq.chat.messages',
          'dlq.chat.conversations',
          'dlq.chat.users',
        ],
        fromBeginning: false,
      });

      this.logger.log('Kafka event consumer initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize Kafka event consumer', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}
