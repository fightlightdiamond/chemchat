import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../shared/redis/redis.service';
import { 
  ClientState, 
  PendingOperation, 
  ConflictResolution,
  OperationType 
} from '../interfaces/sync.interfaces';

@Injectable()
export class ClientStateService {
  private readonly logger = new Logger(ClientStateService.name);
  private readonly STATE_TTL = 86400 * 7; // 7 days
  private readonly OPERATION_TTL = 86400; // 24 hours

  constructor(
    private readonly redis: RedisService,
  ) {}

  async getClientState(
    userId: string,
    tenantId: string,
    deviceId: string,
  ): Promise<ClientState | null> {
    const key = `sync:state:${tenantId}:${userId}:${deviceId}`;
    
    try {
      const stateData = await this.redis.get(key);
      if (!stateData) {
        return null;
      }

      const state: ClientState = JSON.parse(stateData);
      
      // Convert string dates back to Date objects
      state.lastSyncTimestamp = new Date(state.lastSyncTimestamp);
      state.lastSequenceNumber = BigInt(state.lastSequenceNumber);
      
      state.pendingOperations = state.pendingOperations.map(op => ({
        ...op,
        timestamp: new Date(op.timestamp),
        ttl: new Date(op.ttl),
      }));

      state.conflictResolutions = state.conflictResolutions.map(cr => ({
        ...cr,
        timestamp: new Date(cr.timestamp),
      }));

      return state;

    } catch (error) {
      this.logger.warn(`Failed to get client state for ${deviceId}:`, error);
      return null;
    }
  }

  async updateClientState(
    userId: string,
    tenantId: string,
    deviceId: string,
    updates: Partial<ClientState>,
  ): Promise<void> {
    const key = `sync:state:${tenantId}:${userId}:${deviceId}`;
    
    try {
      const currentState = await this.getClientState(userId, tenantId, deviceId);
      
      const newState: ClientState = {
        deviceId,
        userId,
        tenantId,
        lastSyncTimestamp: new Date(),
        lastSequenceNumber: BigInt(0),
        pendingOperations: [],
        conflictResolutions: [],
        ...currentState,
        ...updates,
      };

      await this.redis.setex(key, this.STATE_TTL, JSON.stringify(newState));
      
      this.logger.debug(`Updated client state for device ${deviceId}`);

    } catch (error) {
      this.logger.error(`Failed to update client state for ${deviceId}:`, error);
      throw error;
    }
  }

  async addPendingOperation(
    userId: string,
    tenantId: string,
    deviceId: string,
    operation: PendingOperation,
  ): Promise<void> {
    try {
      const state = await this.getClientState(userId, tenantId, deviceId);
      const pendingOperations = state?.pendingOperations || [];
      
      // Remove expired operations
      const now = new Date();
      const validOperations = pendingOperations.filter(op => new Date(op.ttl) > now);
      
      // Add new operation
      validOperations.push(operation);

      await this.updateClientState(userId, tenantId, deviceId, {
        pendingOperations: validOperations,
      });

      this.logger.debug(`Added pending operation ${operation.id} for device ${deviceId}`);

    } catch (error) {
      this.logger.error(`Failed to add pending operation:`, error);
      throw error;
    }
  }

  async removePendingOperation(
    userId: string,
    tenantId: string,
    deviceId: string,
    operationId: string,
  ): Promise<void> {
    try {
      const state = await this.getClientState(userId, tenantId, deviceId);
      if (!state) {
        return;
      }

      const pendingOperations = state.pendingOperations.filter(
        op => op.id !== operationId
      );

      await this.updateClientState(userId, tenantId, deviceId, {
        pendingOperations,
      });

      this.logger.debug(`Removed pending operation ${operationId} for device ${deviceId}`);

    } catch (error) {
      this.logger.error(`Failed to remove pending operation:`, error);
      throw error;
    }
  }

  async getPendingOperations(
    userId: string,
    tenantId: string,
    deviceId: string,
  ): Promise<PendingOperation[]> {
    const state = await this.getClientState(userId, tenantId, deviceId);
    if (!state) {
      return [];
    }

    // Filter out expired operations
    const now = new Date();
    return state.pendingOperations.filter(op => new Date(op.ttl) > now);
  }

  async reconcileState(
    userId: string,
    tenantId: string,
    deviceId: string,
    serverSequenceNumber: bigint,
  ): Promise<{
    pendingOperations: PendingOperation[];
    conflictsDetected: boolean;
    staleOperations: PendingOperation[];
  }> {
    try {
      const state = await this.getClientState(userId, tenantId, deviceId);
      if (!state) {
        return {
          pendingOperations: [],
          conflictsDetected: false,
          staleOperations: [],
        };
      }

      const now = new Date();
      const validOperations: PendingOperation[] = [];
      const staleOperations: PendingOperation[] = [];
      let conflictsDetected = false;

      for (const operation of state.pendingOperations) {
        // Check if operation is expired
        if (new Date(operation.ttl) <= now) {
          staleOperations.push(operation);
          continue;
        }

        // Check if operation is based on stale state
        if (this.isOperationStale(operation, serverSequenceNumber)) {
          staleOperations.push(operation);
          conflictsDetected = true;
          continue;
        }

        validOperations.push(operation);
      }

      // Update state with valid operations only
      await this.updateClientState(userId, tenantId, deviceId, {
        pendingOperations: validOperations,
        lastSequenceNumber: serverSequenceNumber,
        lastSyncTimestamp: new Date(),
      });

      this.logger.log(`State reconciliation for device ${deviceId}: ${validOperations.length} valid, ${staleOperations.length} stale operations`);

      return {
        pendingOperations: validOperations,
        conflictsDetected,
        staleOperations,
      };

    } catch (error) {
      this.logger.error(`Failed to reconcile state for device ${deviceId}:`, error);
      throw error;
    }
  }

  private isOperationStale(operation: PendingOperation, serverSequenceNumber: bigint): boolean {
    // Check if operation is based on outdated sequence number
    if (operation.data.baseSequenceNumber) {
      const baseSequence = BigInt(operation.data.baseSequenceNumber);
      return baseSequence < serverSequenceNumber;
    }

    // For message operations, check if they're too old
    if (operation.type === OperationType.SEND_MESSAGE) {
      const operationAge = Date.now() - new Date(operation.timestamp).getTime();
      return operationAge > 300000; // 5 minutes
    }

    return false;
  }

  async addConflictResolution(
    userId: string,
    tenantId: string,
    deviceId: string,
    resolution: ConflictResolution,
  ): Promise<void> {
    try {
      const state = await this.getClientState(userId, tenantId, deviceId);
      const conflictResolutions = state?.conflictResolutions || [];
      
      // Keep only recent resolutions (last 100)
      conflictResolutions.push(resolution);
      if (conflictResolutions.length > 100) {
        conflictResolutions.splice(0, conflictResolutions.length - 100);
      }

      await this.updateClientState(userId, tenantId, deviceId, {
        conflictResolutions,
      });

      this.logger.debug(`Added conflict resolution for message ${resolution.messageId}`);

    } catch (error) {
      this.logger.error(`Failed to add conflict resolution:`, error);
      throw error;
    }
  }

  async getConflictResolutions(
    userId: string,
    tenantId: string,
    deviceId: string,
  ): Promise<ConflictResolution[]> {
    const state = await this.getClientState(userId, tenantId, deviceId);
    return state?.conflictResolutions || [];
  }

  async clearExpiredOperations(
    userId: string,
    tenantId: string,
    deviceId: string,
  ): Promise<number> {
    try {
      const state = await this.getClientState(userId, tenantId, deviceId);
      if (!state) {
        return 0;
      }

      const now = new Date();
      const validOperations = state.pendingOperations.filter(
        op => new Date(op.ttl) > now
      );

      const expiredCount = state.pendingOperations.length - validOperations.length;

      if (expiredCount > 0) {
        await this.updateClientState(userId, tenantId, deviceId, {
          pendingOperations: validOperations,
        });

        this.logger.debug(`Cleared ${expiredCount} expired operations for device ${deviceId}`);
      }

      return expiredCount;

    } catch (error) {
      this.logger.error(`Failed to clear expired operations:`, error);
      return 0;
    }
  }

  async resetClientState(
    userId: string,
    tenantId: string,
    deviceId: string,
  ): Promise<void> {
    const key = `sync:state:${tenantId}:${userId}:${deviceId}`;
    
    try {
      await this.redis.del(key);
      this.logger.log(`Reset client state for device ${deviceId}`);
    } catch (error) {
      this.logger.error(`Failed to reset client state:`, error);
      throw error;
    }
  }

  async clearUserState(
    userId: string,
    tenantId: string,
  ): Promise<void> {
    const pattern = `sync:state:${tenantId}:${userId}:*`;
    
    try {
      const keys = await this.redis.scanKeys(pattern);
      if (keys.length > 0) {
        await this.redis.exec(async (client) => {
          await client.del(...keys);
        });
      }
      
      this.logger.log(`Cleared sync state for user ${userId} in tenant ${tenantId}`);
    } catch (error) {
      this.logger.error(`Failed to clear user state for ${userId}:`, error);
      throw error;
    }
  }

  async getDeviceStates(
    userId: string,
    tenantId: string,
  ): Promise<ClientState[]> {
    const pattern = `sync:state:${tenantId}:${userId}:*`;
    
    try {
      const keys = await this.redis.scanKeys(pattern);
      const states: ClientState[] = [];

      for (const key of keys) {
        const stateData = await this.redis.get(key);
        if (stateData) {
          const state: ClientState = JSON.parse(stateData);
          state.lastSyncTimestamp = new Date(state.lastSyncTimestamp);
          state.lastSequenceNumber = BigInt(state.lastSequenceNumber);
          states.push(state);
        }
      }

      return states;

    } catch (error) {
      this.logger.error(`Failed to get device states:`, error);
      return [];
    }
  }

  async cleanupStaleStates(): Promise<void> {
    try {
      const pattern = 'sync:state:*';
      const keys = await this.redis.scanKeys(pattern);
      
      let cleanedCount = 0;
      const now = new Date();
      const staleThreshold = new Date(now.getTime() - this.STATE_TTL * 1000);

      for (const key of keys) {
        const stateData = await this.redis.get(key);
        if (stateData) {
          const state: ClientState = JSON.parse(stateData);
          const lastSync = new Date(state.lastSyncTimestamp);
          
          if (lastSync < staleThreshold) {
            await this.redis.del(key);
            cleanedCount++;
          }
        }
      }

      if (cleanedCount > 0) {
        this.logger.log(`Cleaned up ${cleanedCount} stale client states`);
      }

    } catch (error) {
      this.logger.error('Failed to cleanup stale states:', error);
    }
  }
}
