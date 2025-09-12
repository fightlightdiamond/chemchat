export interface OutboxEventRecord {
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

export interface TypedOutboxEvent {
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
