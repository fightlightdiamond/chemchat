import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MongoDBService } from '../infrastructure/mongodb/mongodb.service';
import { ChangeStream, ChangeStreamDocument } from 'mongodb';

export interface ChangeStreamEvent {
  operationType: 'insert' | 'update' | 'replace' | 'delete' | 'invalidate' | 'drop' | 'dropDatabase' | 'rename';
  collection: string;
  documentId: string;
  documentKey: any;
  fullDocument?: any;
  updateDescription?: {
    updatedFields: any;
    removedFields: string[];
  };
  tenantId?: string;
  timestamp: Date;
}

export interface ChangeStreamSubscription {
  id: string;
  collection: string;
  filter?: any;
  tenantId?: string;
  callback: (event: ChangeStreamEvent) => void;
  isActive: boolean;
}

@Injectable()
export class MongoDBChangeStreamsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MongoDBChangeStreamsService.name);
  private changeStreams: Map<string, ChangeStream> = new Map();
  private subscriptions: Map<string, ChangeStreamSubscription> = new Map();
  private isRunning = false;

  constructor(
    private readonly mongoDB: MongoDBService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.startChangeStreams();
  }

  async onModuleDestroy(): Promise<void> {
    await this.stopChangeStreams();
  }

  /**
   * Start change streams for all collections
   */
  private async startChangeStreams(): Promise<void> {
    try {
      this.isRunning = true;
      
      // Start change streams for each collection
      await Promise.all([
        this.startCollectionChangeStream('messages'),
        this.startCollectionChangeStream('conversations'),
        this.startCollectionChangeStream('user_conversations'),
      ]);

      this.logger.log('MongoDB change streams started successfully');
    } catch (error) {
      this.logger.error('Failed to start change streams', error);
      throw error;
    }
  }

  /**
   * Stop all change streams
   */
  private async stopChangeStreams(): Promise<void> {
    try {
      this.isRunning = false;
      
      // Close all change streams
      for (const [collection, changeStream] of this.changeStreams) {
        await changeStream.close();
        this.logger.debug(`Closed change stream for collection: ${collection}`);
      }
      
      this.changeStreams.clear();
      this.subscriptions.clear();
      
      this.logger.log('MongoDB change streams stopped successfully');
    } catch (error) {
      this.logger.error('Failed to stop change streams', error);
    }
  }

  /**
   * Start change stream for a specific collection
   */
  private async startCollectionChangeStream(collectionName: string): Promise<void> {
    try {
      const collection = this.mongoDB.getCollection(collectionName);
      
      const changeStream = collection.watch([], {
        fullDocument: 'updateLookup',
        resumeAfter: undefined, // Would store resume token in production
      });

      changeStream.on('change', (change: ChangeStreamDocument) => {
        this.handleChangeEvent(collectionName, change);
      });

      changeStream.on('error', (error: Error) => {
        this.logger.error(`Change stream error for collection ${collectionName}:`, error);
      });

      changeStream.on('close', () => {
        this.logger.warn(`Change stream closed for collection: ${collectionName}`);
      });

      this.changeStreams.set(collectionName, changeStream);
      this.logger.debug(`Started change stream for collection: ${collectionName}`);
    } catch (error) {
      this.logger.error(`Failed to start change stream for collection ${collectionName}:`, error);
      throw error;
    }
  }

  /**
   * Handle change event from MongoDB
   */
  private handleChangeEvent(collectionName: string, change: ChangeStreamDocument): void {
    try {
      const event: ChangeStreamEvent = {
        operationType: change.operationType,
        collection: collectionName,
        documentId: change.documentKey._id?.toString() || '',
        documentKey: change.documentKey,
        fullDocument: change.fullDocument,
        updateDescription: change.updateDescription,
        tenantId: change.fullDocument?.tenantId,
        timestamp: new Date(),
      };

      // Emit global change event
      this.eventEmitter.emit('mongodb.change', event);

      // Emit collection-specific events
      this.eventEmitter.emit(`mongodb.change.${collectionName}`, event);
      this.eventEmitter.emit(`mongodb.change.${collectionName}.${change.operationType}`, event);

      // Notify specific subscriptions
      this.notifySubscriptions(event);

      this.logger.debug(`Processed change event: ${collectionName}.${change.operationType}`, {
        documentId: event.documentId,
        tenantId: event.tenantId,
      });
    } catch (error) {
      this.logger.error('Failed to handle change event', error);
    }
  }

  /**
   * Notify subscriptions about change events
   */
  private notifySubscriptions(event: ChangeStreamEvent): void {
    for (const [subscriptionId, subscription] of this.subscriptions) {
      if (!subscription.isActive) {
        continue;
      }

      // Check if subscription matches the event
      if (subscription.collection !== event.collection) {
        continue;
      }

      if (subscription.tenantId && subscription.tenantId !== event.tenantId) {
        continue;
      }

      if (subscription.filter && !this.matchesFilter(event, subscription.filter)) {
        continue;
      }

      try {
        subscription.callback(event);
      } catch (error) {
        this.logger.error(`Error in subscription callback ${subscriptionId}:`, error);
      }
    }
  }

  /**
   * Check if event matches filter
   */
  private matchesFilter(event: ChangeStreamEvent, filter: any): boolean {
    try {
      // Simple filter matching - in production, you'd want more sophisticated filtering
      if (filter.operationType && filter.operationType !== event.operationType) {
        return false;
      }

      if (filter.tenantId && filter.tenantId !== event.tenantId) {
        return false;
      }

      return true;
    } catch (error) {
      this.logger.error('Error matching filter:', error);
      return false;
    }
  }

  /**
   * Subscribe to change events
   */
  subscribe(
    collection: string,
    callback: (event: ChangeStreamEvent) => void,
    options: {
      filter?: any;
      tenantId?: string;
    } = {},
  ): string {
    const subscriptionId = `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const subscription: ChangeStreamSubscription = {
      id: subscriptionId,
      collection,
      filter: options.filter,
      tenantId: options.tenantId,
      callback,
      isActive: true,
    };

    this.subscriptions.set(subscriptionId, subscription);
    
    this.logger.debug(`Created subscription: ${subscriptionId} for collection: ${collection}`);
    
    return subscriptionId;
  }

  /**
   * Unsubscribe from change events
   */
  unsubscribe(subscriptionId: string): boolean {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) {
      this.logger.warn(`Subscription not found: ${subscriptionId}`);
      return false;
    }

    subscription.isActive = false;
    this.subscriptions.delete(subscriptionId);
    
    this.logger.debug(`Removed subscription: ${subscriptionId}`);
    return true;
  }

  /**
   * Get active subscriptions
   */
  getActiveSubscriptions(): ChangeStreamSubscription[] {
    return Array.from(this.subscriptions.values()).filter(sub => sub.isActive);
  }

  /**
   * Get change stream status
   */
  getStatus(): {
    isRunning: boolean;
    activeStreams: string[];
    activeSubscriptions: number;
  } {
    return {
      isRunning: this.isRunning,
      activeStreams: Array.from(this.changeStreams.keys()),
      activeSubscriptions: this.getActiveSubscriptions().length,
    };
  }

  /**
   * Restart change streams (useful for recovery)
   */
  async restartChangeStreams(): Promise<void> {
    this.logger.log('Restarting change streams...');
    await this.stopChangeStreams();
    await this.startChangeStreams();
  }

  /**
   * Get change stream statistics
   */
  async getStatistics(): Promise<{
    totalEvents: number;
    eventsByCollection: Record<string, number>;
    eventsByOperation: Record<string, number>;
    eventsByTenant: Record<string, number>;
  }> {
    // This would require storing event statistics
    // For now, return basic info
    return {
      totalEvents: 0,
      eventsByCollection: {},
      eventsByOperation: {},
      eventsByTenant: {},
    };
  }
}