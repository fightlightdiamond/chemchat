import { IEvent } from '@nestjs/cqrs';
import { Injectable, Logger } from '@nestjs/common';

export interface SerializedEvent {
  eventType: string;
  version: string;
  data: unknown;
  metadata: {
    correlationId?: string;
    tenantId?: string;
    timestamp: string;
    eventId: string;
  };
}

export interface EventSchema {
  eventType: string;
  version: string;
  schema: unknown; // JSON Schema or similar
}

interface EventData {
  eventType?: string;
  version?: string;
  correlationId?: string;
  tenantId?: string;
}

@Injectable()
export class EventSerializer {
  private readonly logger = new Logger(EventSerializer.name);
  private readonly schemas = new Map<string, EventSchema>();

  registerSchema(schema: EventSchema): void {
    const key = `${schema.eventType}:${schema.version}`;
    this.schemas.set(key, schema);
    this.logger.log(`Registered event schema: ${key}`);
  }

  serialize(event: IEvent & { toJSON?: () => EventData }): SerializedEvent {
    try {
      const eventData: EventData = event.toJSON
        ? event.toJSON()
        : (event as EventData);
      const eventType: string = eventData.eventType || event.constructor.name;
      const version: string = eventData.version || '1.0';

      return {
        eventType,
        version,
        data: eventData,
        metadata: {
          correlationId: eventData.correlationId,
          tenantId: eventData.tenantId,
          timestamp: new Date().toISOString(),
          eventId: this.generateEventId(),
        },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to serialize event', {
        eventType: event.constructor.name,
        error: errorMessage,
      });
      throw error;
    }
  }

  deserialize<T extends IEvent>(serializedEvent: SerializedEvent): T {
    try {
      const schemaKey = `${serializedEvent.eventType}:${serializedEvent.version}`;
      const schema = this.schemas.get(schemaKey);

      if (!schema) {
        this.logger.warn(`No schema found for event: ${schemaKey}`);
      }

      // In a real implementation, you would validate against the schema here
      // and potentially transform the data for backward compatibility

      return serializedEvent.data as T;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to deserialize event', {
        eventType: serializedEvent.eventType,
        version: serializedEvent.version,
        error: errorMessage,
      });
      throw error;
    }
  }

  isCompatible(eventType: string, version: string): boolean {
    const schemaKey = `${eventType}:${version}`;
    return this.schemas.has(schemaKey);
  }

  private generateEventId(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
