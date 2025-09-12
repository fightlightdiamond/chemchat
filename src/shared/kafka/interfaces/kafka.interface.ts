import { KafkaConfig, ProducerConfig, ConsumerConfig } from 'kafkajs';

export interface KafkaModuleOptions {
  client: KafkaConfig;
  producer?: ProducerConfig;
  consumer?: ConsumerConfig;
}

export interface KafkaMessage {
  topic: string;
  partition?: number;
  key?: string;
  value: string;
  headers?: Record<string, string>;
}

export interface KafkaPublishResult {
  success: boolean;
  topic: string;
  partition?: number;
  offset?: string;
  error?: string;
}

export interface EventMetadata {
  eventId: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  tenantId?: string;
  correlationId?: string;
  causationId?: string;
  timestamp: string;
  version: string;
}

export interface SerializedEvent {
  metadata: EventMetadata;
  data: Record<string, any>;
}
