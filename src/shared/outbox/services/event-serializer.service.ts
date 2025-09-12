import { Injectable, Logger } from '@nestjs/common';
import { IEvent } from '@nestjs/cqrs';
import {
  SerializedEvent,
  EventMetadata,
} from '../../kafka/interfaces/kafka.interface';

@Injectable()
export class EventSerializerService {
  private readonly logger = new Logger(EventSerializerService.name);

  /**
   * Serialize an event for publishing
   */
  serialize(
    event: IEvent & { toJSON(): any },
    eventId: string,
    aggregateType: string,
    aggregateId: string,
    tenantId?: string,
    correlationId?: string,
  ): SerializedEvent {
    try {
      const eventData = event.toJSON() as Record<string, any>;
      const eventType =
        (eventData as { eventType?: string }).eventType ||
        event.constructor.name;

      const eventIdValue = aggregateId;
      const correlationIdValue = correlationId || crypto.randomUUID();
      const version = (event as { version?: string }).version || '1.0';

      const metadata: EventMetadata = {
        eventId: eventIdValue,
        eventType,
        aggregateType,
        aggregateId,
        version,
        timestamp: new Date().toISOString(),
        correlationId: correlationIdValue,
        tenantId,
      };

      const serializedEvent: SerializedEvent = {
        metadata,
        data: eventData,
      };

      return serializedEvent;
    } catch (error) {
      this.logger.error('Failed to serialize event', {
        error: error instanceof Error ? error.message : String(error),
        eventType: event.constructor.name,
        aggregateType,
        aggregateId,
      });
      throw error;
    }
  }

  /**
   * Deserialize an event from Kafka message
   */
  deserialize(serializedEvent: string): SerializedEvent {
    try {
      const parsed = JSON.parse(serializedEvent) as {
        metadata?: any;
        data?: any;
      };

      if (!parsed.metadata || !parsed.data) {
        throw new Error('Invalid serialized event format');
      }

      return parsed as SerializedEvent;
    } catch (error) {
      this.logger.error('Failed to deserialize event', {
        error: error instanceof Error ? error.message : String(error),
        serializedEvent: serializedEvent.substring(0, 200), // Log first 200 chars
      });
      throw error;
    }
  }

  /**
   * Validate event schema version compatibility
   */
  isCompatibleVersion(
    eventVersion: string,
    supportedVersions: string[],
  ): boolean {
    const [major, minor] = eventVersion.split('.').map(Number);
    const [supportedMajor, supportedMinor] = supportedVersions[0]
      .split('.')
      .map(Number);

    return major <= supportedMajor && minor <= supportedMinor;
  }

  /**
   * Migrate event data to newer version if needed
   */
  migrateEventData(
    eventType: string,
    data: Record<string, any>,
    fromVersion: string,
    toVersion: string,
  ): Record<string, any> {
    // This is a placeholder for event migration logic
    // In a real implementation, you would have specific migration handlers
    // for each event type and version combination

    this.logger.debug('Event migration', {
      eventType,
      fromVersion,
      toVersion,
    });

    // For now, return data as-is
    // TODO: Implement specific migration handlers
    return data;
  }

  /**
   * Get topic name for event type
   */
  getTopicForEventType(eventType: string, tenantId?: string): string {
    // Use tenant-specific topics if multi-tenancy is enabled
    const baseTopicMap: Record<string, string> = {
      MessageCreated: 'chat.messages',
      MessageEdited: 'chat.messages',
      MessageDeleted: 'chat.messages',
      ConversationCreated: 'chat.conversations',
      UserJoined: 'chat.users',
      UserLeft: 'chat.users',
      PresenceChanged: 'presence.status',
      TypingStarted: 'presence.typing',
      TypingStopped: 'presence.typing',
    };

    const baseTopic = baseTopicMap[eventType] || 'chat.events';

    // Add tenant prefix if multi-tenancy is enabled
    if (tenantId) {
      return `tenant.${tenantId}.${baseTopic}`;
    }

    return baseTopic;
  }

  /**
   * Validate serialized event structure
   */
  validateSerializedEvent(serializedEvent: SerializedEvent): boolean {
    try {
      const { metadata, data } = serializedEvent;

      // Validate metadata
      if (
        !metadata.eventId ||
        !metadata.eventType ||
        !metadata.aggregateType ||
        !metadata.aggregateId ||
        !metadata.timestamp ||
        !metadata.version
      ) {
        return false;
      }

      // Validate timestamp format
      const timestamp = new Date(metadata.timestamp);
      if (isNaN(timestamp.getTime())) {
        return false;
      }

      // Validate data is an object
      if (typeof data !== 'object' || data === null) {
        return false;
      }

      return true;
    } catch (error) {
      this.logger.error('Event validation failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }
}
