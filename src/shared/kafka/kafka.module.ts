import { Module, DynamicModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { KafkaProducerService } from './services/kafka-producer.service';
import { KafkaConsumerService } from './services/kafka-consumer.service';
import { KafkaModuleOptions } from './interfaces/kafka.interface';

@Module({})
export class KafkaModule {
  static forRoot(options?: KafkaModuleOptions): DynamicModule {
    return {
      module: KafkaModule,
      imports: [ConfigModule],
      providers: [
        KafkaProducerService,
        KafkaConsumerService,
        {
          provide: 'KAFKA_OPTIONS',
          useValue: options || {},
        },
      ],
      exports: [KafkaProducerService, KafkaConsumerService],
      global: true,
    };
  }
}
