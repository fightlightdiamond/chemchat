import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../infrastructure/prisma/prisma.service';
import { IEvent } from '@nestjs/cqrs';

export interface EventStoreEvent {
  id: string;
  aggregateId: string;
  aggregateType: string;
  eventType: string;
  eventData: Record<string, any>;
  version: number;
  createdAt: Date;
  tenantId?: string;
  correlationId?: string;
}

export interface EventStoreQuery {
  aggregateId?: string;
  aggregateType?: string;
  eventType?: string;
  fromVersion?: number;
  toVersion?: number;
  tenantId?: string;
  limit?: number;
  offset?: number;
}

@Injectable()
export class EventStoreService {
  private readonly logger = new Logger(EventStoreService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Store events for an aggregate
   */
  async storeEvents(
    aggregateId: string,
    aggregateType: string,
    events: IEvent[],
    expectedVersion: number,
    tenantId?: string,
    correlationId?: string,
  ): Promise<void> {
    const transaction = await this.prisma.$transaction(async (tx) => {
      // Check current version
      const currentVersion = await this.getCurrentVersion(tx, aggregateId);
      
      if (currentVersion !== expectedVersion) {
        throw new Error(`Concurrency conflict: expected version ${expectedVersion}, got ${currentVersion}`);
      }

      // Store events
      const eventRecords = events.map((event, index) => ({
        id: `${aggregateId}_${expectedVersion + index + 1}`,
        aggregateId,
        aggregateType,
        eventType: event.constructor.name,
        eventData: (event as any).toJSON ? (event as any).toJSON() : event,
        version: expectedVersion + index + 1,
        tenantId,
        correlationId,
        createdAt: new Date(),
      }));

      await tx.eventStore.createMany({
        data: eventRecords,
      });

      this.logger.debug(`Stored ${events.length} events for aggregate ${aggregateId}`);
    });
  }

  /**
   * Get events for an aggregate
   */
  async getEvents(
    aggregateId: string,
    fromVersion: number = 0,
    tenantId?: string,
  ): Promise<EventStoreEvent[]> {
    const events = await this.prisma.eventStore.findMany({
      where: {
        aggregateId,
        version: { gte: fromVersion },
        tenantId,
      },
      orderBy: { version: 'asc' },
    });

    return events.map(event => ({
      id: event.id,
      aggregateId: event.aggregateId,
      aggregateType: event.aggregateType,
      eventType: event.eventType,
      eventData: event.eventData as Record<string, any>,
      version: event.version,
      createdAt: event.createdAt,
      tenantId: event.tenantId || undefined,
      correlationId: event.correlationId || undefined,
    }));
  }

  /**
   * Query events across aggregates
   */
  async queryEvents(query: EventStoreQuery): Promise<EventStoreEvent[]> {
    const where: any = {};

    if (query.aggregateId) where.aggregateId = query.aggregateId;
    if (query.aggregateType) where.aggregateType = query.aggregateType;
    if (query.eventType) where.eventType = query.eventType;
    if (query.tenantId) where.tenantId = query.tenantId;
    if (query.fromVersion) where.version = { gte: query.fromVersion };
    if (query.toVersion) where.version = { ...where.version, lte: query.toVersion };

    const events = await this.prisma.eventStore.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      take: query.limit || 100,
      skip: query.offset || 0,
    });

    return events.map(event => ({
      id: event.id,
      aggregateId: event.aggregateId,
      aggregateType: event.aggregateType,
      eventType: event.eventType,
      eventData: event.eventData as Record<string, any>,
      version: event.version,
      createdAt: event.createdAt,
      tenantId: event.tenantId || undefined,
      correlationId: event.correlationId || undefined,
    }));
  }

  /**
   * Get current version of an aggregate
   */
  private async getCurrentVersion(tx: any, aggregateId: string): Promise<number> {
    const lastEvent = await tx.eventStore.findFirst({
      where: { aggregateId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });

    return lastEvent?.version || 0;
  }

  /**
   * Get aggregate snapshot
   */
  async getSnapshot(aggregateId: string, tenantId?: string): Promise<any> {
    const snapshot = await this.prisma.aggregateSnapshot.findFirst({
      where: { aggregateId, tenantId },
      orderBy: { version: 'desc' },
    });

    return snapshot ? {
      aggregateId: snapshot.aggregateId,
      aggregateType: snapshot.aggregateType,
      data: snapshot.data as Record<string, any>,
      version: snapshot.version,
      createdAt: snapshot.createdAt,
    } : null;
  }

  /**
   * Save aggregate snapshot
   */
  async saveSnapshot(
    aggregateId: string,
    aggregateType: string,
    data: Record<string, any>,
    version: number,
    tenantId?: string,
  ): Promise<void> {
    await this.prisma.aggregateSnapshot.upsert({
      where: { 
        aggregateId_tenantId: { 
          aggregateId, 
          tenantId: tenantId || 'default' 
        } 
      },
      create: {
        aggregateId,
        aggregateType,
        data,
        version,
        tenantId: tenantId || 'default',
        createdAt: new Date(),
      },
      update: {
        data,
        version,
        createdAt: new Date(),
      },
    });
  }

  /**
   * Rebuild aggregate from events
   */
  async rebuildAggregate(
    aggregateId: string,
    tenantId?: string,
  ): Promise<{ data: any; version: number }> {
    const events = await this.getEvents(aggregateId, 0, tenantId);
    
    // This would be implemented by specific aggregate classes
    // For now, return the events for manual processing
    return {
      data: events,
      version: events.length > 0 ? events[events.length - 1].version : 0,
    };
  }
}