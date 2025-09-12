export interface OutboxEventData {
  id: string;
  tenantId?: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  eventData: Record<string, any>;
  createdAt: Date;
  publishedAt?: Date;
  retryCount: number;
}

export interface OutboxEventFilter {
  tenantId?: string;
  aggregateType?: string;
  aggregateId?: string;
  eventType?: string;
  published?: boolean;
  maxRetries?: number;
  limit?: number;
}

export interface OutboxPublishResult {
  success: boolean;
  eventId: string;
  error?: string;
  retryAfter?: number;
}

export interface OutboxWorkerConfig {
  batchSize: number;
  maxRetries: number;
  retryDelayMs: number;
  processingIntervalMs: number;
  enableDeadLetterQueue: boolean;
}
