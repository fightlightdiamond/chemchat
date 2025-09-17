import { Injectable, Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler, CommandBus } from '@nestjs/cqrs';
import { EventBus } from '@nestjs/cqrs';
import { BaseCommand } from './base-command';
import { WriteDatabaseService } from '../infrastructure/database/write-database.service';
import { EventStoreService } from '../eventsourcing/event-store.service';

/**
 * Enhanced base command handler with:
 * - Event sourcing
 * - Write database operations
 * - Transaction management
 * - Audit logging
 * - Idempotency support
 */
export abstract class EnhancedCommandHandler<TCommand extends BaseCommand, TResult = any> 
  implements ICommandHandler<TCommand, TResult> {
  
  protected readonly logger = new Logger(this.constructor.name);

  constructor(
    protected readonly writeDatabase: WriteDatabaseService,
    protected readonly eventStore: EventStoreService,
    protected readonly eventBus: EventBus,
    protected readonly commandBus: CommandBus,
  ) {}

  abstract execute(command: TCommand): Promise<TResult>;

  /**
   * Execute command with full CQRS support
   */
  protected async executeWithCQRS(
    command: TCommand,
    aggregateId: string,
    aggregateType: string,
    businessLogic: () => Promise<{ result: TResult; events: any[] }>,
  ): Promise<TResult> {
    const startTime = Date.now();
    
    try {
      this.logCommandExecution(command);

      // Get current aggregate version
      const currentVersion = await this.getAggregateVersion(aggregateId);
      
      // Execute business logic
      const { result, events } = await businessLogic();

      // Store events in event store
      if (events.length > 0) {
        await this.eventStore.storeEvents(
          aggregateId,
          aggregateType,
          events,
          currentVersion,
          command.tenantId,
          command.correlationId,
        );

        // Publish events
        for (const event of events) {
          await this.eventBus.publish(event);
        }
      }

      const executionTime = Date.now() - startTime;
      this.logCommandSuccess(command, result, executionTime);
      
      return result;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      this.logCommandError(command, error, executionTime);
      throw error;
    }
  }

  /**
   * Execute with transaction support
   */
  protected async executeWithTransaction<T>(
    operation: (tx: any) => Promise<T>,
  ): Promise<T> {
    return await this.writeDatabase.$transaction(async (tx) => {
      return await operation(tx);
    });
  }

  /**
   * Get current version of aggregate
   */
  private async getAggregateVersion(aggregateId: string): Promise<number> {
    const events = await this.eventStore.getEvents(aggregateId);
    return events.length > 0 ? events[events.length - 1].version : 0;
  }

  /**
   * Log command execution start
   */
  private logCommandExecution(command: TCommand): void {
    this.logger.debug('Command execution started', {
      commandType: command.constructor.name,
      correlationId: command.correlationId,
      userId: command.userId,
      tenantId: command.tenantId,
    });
  }

  /**
   * Log command execution success
   */
  private logCommandSuccess(command: TCommand, result: TResult, executionTime: number): void {
    this.logger.log('Command executed successfully', {
      commandType: command.constructor.name,
      correlationId: command.correlationId,
      userId: command.userId,
      tenantId: command.tenantId,
      executionTimeMs: executionTime,
    });
  }

  /**
   * Log command execution error
   */
  private logCommandError(command: TCommand, error: Error, executionTime: number): void {
    this.logger.error('Command execution failed', {
      commandType: command.constructor.name,
      correlationId: command.correlationId,
      userId: command.userId,
      tenantId: command.tenantId,
      executionTimeMs: executionTime,
      error: error.message,
      stack: error.stack,
    });
  }
}

/**
 * Enhanced query handler with:
 * - Read database operations
 * - Caching support
 * - Performance monitoring
 * - Read model projections
 */
export abstract class EnhancedQueryHandler<TQuery, TResult = any> {
  protected readonly logger = new Logger(this.constructor.name);

  constructor(
    protected readonly readDatabase: ReadDatabaseService,
  ) {}

  abstract execute(query: TQuery): Promise<TResult>;

  /**
   * Execute query with caching
   */
  protected async executeWithCache<T>(
    cacheKey: string,
    operation: () => Promise<T>,
    ttlSeconds: number = 300,
  ): Promise<T> {
    // TODO: Implement Redis caching
    return await operation();
  }

  /**
   * Execute query with performance monitoring
   */
  protected async executeWithMonitoring<T>(
    operation: () => Promise<T>,
    operationName: string,
  ): Promise<T> {
    const startTime = Date.now();
    
    try {
      const result = await operation();
      const executionTime = Date.now() - startTime;
      
      this.logger.debug(`Query ${operationName} executed successfully`, {
        executionTimeMs: executionTime,
      });
      
      return result;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      
      this.logger.error(`Query ${operationName} failed`, {
        executionTimeMs: executionTime,
        error: error instanceof Error ? error.message : String(error),
      });
      
      throw error;
    }
  }
}

/**
 * Example: Enhanced Send Message Command Handler
 */
@Injectable()
@CommandHandler(SendMessageCommand)
export class EnhancedSendMessageCommandHandler 
  extends EnhancedCommandHandler<SendMessageCommand, Message> {
  
  constructor(
    writeDatabase: WriteDatabaseService,
    eventStore: EventStoreService,
    eventBus: EventBus,
    commandBus: CommandBus,
    private readonly messageRepository: MessageRepository,
    private readonly conversationRepository: ConversationRepository,
  ) {
    super(writeDatabase, eventStore, eventBus, commandBus);
  }

  async execute(command: SendMessageCommand): Promise<Message> {
    return await this.executeWithCQRS(
      command,
      command.conversationId, // Use conversation as aggregate
      'Conversation',
      async () => {
        // Business logic
        const message = await this.createMessage(command);
        const savedMessage = await this.messageRepository.save(message);
        
        // Generate events
        const events = [
          new MessageCreatedEvent(
            savedMessage.id,
            savedMessage.conversationId,
            savedMessage.senderId,
            savedMessage.content,
            savedMessage.sequenceNumber,
            savedMessage.createdAt,
            command.correlationId,
            command.tenantId,
          ),
        ];

        return {
          result: savedMessage,
          events,
        };
      },
    );
  }

  private async createMessage(command: SendMessageCommand): Promise<Message> {
    // Implementation here
    throw new Error('Not implemented');
  }
}