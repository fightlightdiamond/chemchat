import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { TenantContext } from '../../shared/decorators/tenant-context.decorator';
import { SyncService } from '../services/sync.service';
import { ConflictResolutionService } from '../services/conflict-resolution.service';
import { ClientStateService } from '../services/client-state.service';
import { OfflineQueueService } from '../services/offline-queue.service';
import { DeepLinkService } from '../services/deep-link.service';
import { 
  SyncRequest, 
  SyncResponse,
  ConflictResolution,
  ResolutionStrategy,
  PendingOperation,
  QueuePriority,
  DeepLink,
  ClientState 
} from '../interfaces/sync.interfaces';

@ApiTags('sync')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('sync')
export class SyncController {
  constructor(
    private readonly syncService: SyncService,
    private readonly conflictResolutionService: ConflictResolutionService,
    private readonly clientStateService: ClientStateService,
    private readonly offlineQueueService: OfflineQueueService,
    private readonly deepLinkService: DeepLinkService,
  ) {}

  @Post('delta')
  @ApiOperation({ summary: 'Perform delta synchronization' })
  @ApiResponse({ status: 200, description: 'Delta sync completed successfully' })
  @HttpCode(HttpStatus.OK)
  async performDeltaSync(
    @CurrentUser() user: any,
    @TenantContext() tenantId: string,
    @Body() request: SyncRequest,
  ): Promise<SyncResponse> {
    return this.syncService.performDeltaSync(user.id, tenantId, request);
  }

  @Get('state/:deviceId')
  @ApiOperation({ summary: 'Get client synchronization state' })
  @ApiResponse({ status: 200, description: 'Client state retrieved successfully' })
  async getClientState(
    @CurrentUser() user: any,
    @TenantContext() tenantId: string,
    @Param('deviceId') deviceId: string,
  ): Promise<ClientState | null> {
    return this.clientStateService.getClientState(user.id, tenantId, deviceId);
  }

  @Put('state/:deviceId')
  @ApiOperation({ summary: 'Update client synchronization state' })
  @ApiResponse({ status: 200, description: 'Client state updated successfully' })
  @HttpCode(HttpStatus.OK)
  async updateClientState(
    @CurrentUser() user: any,
    @TenantContext() tenantId: string,
    @Param('deviceId') deviceId: string,
    @Body() updates: Partial<ClientState>,
  ): Promise<void> {
    await this.clientStateService.updateClientState(user.id, tenantId, deviceId, updates);
  }

  @Post('state/:deviceId/reconcile')
  @ApiOperation({ summary: 'Reconcile client state with server' })
  @ApiResponse({ status: 200, description: 'State reconciliation completed' })
  @HttpCode(HttpStatus.OK)
  async reconcileState(
    @CurrentUser() user: any,
    @TenantContext() tenantId: string,
    @Param('deviceId') deviceId: string,
    @Body() body: { serverSequenceNumber: string },
  ): Promise<{
    pendingOperations: PendingOperation[];
    conflictsDetected: boolean;
    staleOperations: PendingOperation[];
  }> {
    const serverSequenceNumber = BigInt(body.serverSequenceNumber);
    return this.clientStateService.reconcileState(user.id, tenantId, deviceId, serverSequenceNumber);
  }

  @Delete('state/:deviceId/reset')
  @ApiOperation({ summary: 'Reset client synchronization state' })
  @ApiResponse({ status: 200, description: 'Client state reset successfully' })
  @HttpCode(HttpStatus.OK)
  async resetClientState(
    @CurrentUser() user: any,
    @TenantContext() tenantId: string,
    @Param('deviceId') deviceId: string,
  ): Promise<void> {
    await this.clientStateService.resetClientState(user.id, tenantId, deviceId);
  }

  @Get('conflicts')
  @ApiOperation({ summary: 'Get pending conflicts for resolution' })
  @ApiResponse({ status: 200, description: 'Conflicts retrieved successfully' })
  async getConflicts(
    @CurrentUser() user: any,
    @TenantContext() tenantId: string,
  ): Promise<ConflictResolution[]> {
    return this.conflictResolutionService.getConflicts(user.id, tenantId);
  }

  @Post('conflicts/:conflictId/resolve')
  @ApiOperation({ summary: 'Resolve a specific conflict' })
  @ApiResponse({ status: 200, description: 'Conflict resolved successfully' })
  @HttpCode(HttpStatus.OK)
  async resolveConflict(
    @CurrentUser() user: any,
    @TenantContext() tenantId: string,
    @Param('conflictId') conflictId: string,
    @Body() body: { strategy: ResolutionStrategy },
  ): Promise<ConflictResolution> {
    const result = await this.conflictResolutionService.resolveConflict(
      conflictId,
      body.strategy,
      user.id,
      tenantId
    );
    if (!result) {
      throw new NotFoundException('Conflict not found');
    }
    return result;
  }

  @Delete('conflicts')
  @ApiOperation({ summary: 'Clear all conflicts' })
  @ApiResponse({ status: 200, description: 'Conflicts cleared successfully' })
  @HttpCode(HttpStatus.OK)
  async clearConflicts(
    @CurrentUser() user: any,
    @TenantContext() tenantId: string,
  ): Promise<void> {
    await this.conflictResolutionService.clearConflicts(user.id, tenantId);
  }

  @Post('queue/:deviceId/enqueue')
  @ApiOperation({ summary: 'Enqueue operation for offline processing' })
  @ApiResponse({ status: 201, description: 'Operation enqueued successfully' })
  @HttpCode(HttpStatus.CREATED)
  async enqueueOperation(
    @CurrentUser() user: any,
    @TenantContext() tenantId: string,
    @Param('deviceId') deviceId: string,
    @Body() body: { operation: PendingOperation; priority?: QueuePriority },
  ): Promise<{ queueItemId: string }> {
    const queueItemId = await this.offlineQueueService.enqueueOperation(
      user.id,
      tenantId,
      deviceId,
      body.operation,
      body.priority,
    );
    return { queueItemId };
  }

  @Get('queue/:deviceId/status')
  @ApiOperation({ summary: 'Get offline queue status' })
  @ApiResponse({ status: 200, description: 'Queue status retrieved successfully' })
  async getQueueStatus(
    @CurrentUser() user: any,
    @TenantContext() tenantId: string,
    @Param('deviceId') deviceId: string,
  ): Promise<{
    pending: number;
    processing: number;
    completed: number;
    failed: number;
  }> {
    return this.offlineQueueService.getQueueStatus(user.id, tenantId, deviceId);
  }

  @Get('queue/:deviceId/failed')
  @ApiOperation({ summary: 'Get failed operations' })
  @ApiResponse({ status: 200, description: 'Failed operations retrieved successfully' })
  async getFailedOperations(
    @CurrentUser() user: any,
    @TenantContext() tenantId: string,
    @Param('deviceId') deviceId: string,
  ) {
    return this.offlineQueueService.getFailedOperations(user.id, tenantId, deviceId);
  }

  @Post('queue/:deviceId/retry/:queueItemId')
  @ApiOperation({ summary: 'Retry failed operation' })
  @ApiResponse({ status: 200, description: 'Operation retry scheduled' })
  @HttpCode(HttpStatus.OK)
  async retryFailedOperation(
    @CurrentUser() user: any,
    @TenantContext() tenantId: string,
    @Param('deviceId') deviceId: string,
    @Param('queueItemId') queueItemId: string,
  ): Promise<void> {
    await this.offlineQueueService.retryFailedOperation(user.id, tenantId, deviceId, queueItemId);
  }

  @Delete('queue/:deviceId/clear')
  @ApiOperation({ summary: 'Clear all queued operations' })
  @ApiResponse({ status: 200, description: 'Queue cleared successfully' })
  @HttpCode(HttpStatus.OK)
  async clearQueue(
    @CurrentUser() user: any,
    @TenantContext() tenantId: string,
    @Param('deviceId') deviceId: string,
  ): Promise<void> {
    await this.offlineQueueService.clearAllOperations(user.id, tenantId, deviceId);
  }

  @Post('deeplink/generate')
  @ApiOperation({ summary: 'Generate deep link' })
  @ApiResponse({ status: 200, description: 'Deep link generated successfully' })
  @HttpCode(HttpStatus.OK)
  async generateDeepLink(
    @Body() deepLink: DeepLink,
  ): Promise<{ url: string }> {
    const url = this.deepLinkService.generateDeepLink(deepLink);
    return { url };
  }

  @Post('deeplink/parse')
  @ApiOperation({ summary: 'Parse deep link URL' })
  @ApiResponse({ status: 200, description: 'Deep link parsed successfully' })
  @HttpCode(HttpStatus.OK)
  async parseDeepLink(
    @Body() body: { url: string },
  ): Promise<DeepLink | null> {
    return this.deepLinkService.parseDeepLink(body.url);
  }

  @Post('deeplink/notification')
  @ApiOperation({ summary: 'Generate notification deep link' })
  @ApiResponse({ status: 200, description: 'Notification deep link generated' })
  @HttpCode(HttpStatus.OK)
  async generateNotificationDeepLink(
    @Body() body: { 
      conversationId: string; 
      messageId?: string; 
      additionalParams?: Record<string, string> 
    },
  ): Promise<{ url: string }> {
    const url = this.deepLinkService.generateNotificationDeepLink(
      body.conversationId,
      body.messageId,
      body.additionalParams,
    );
    return { url };
  }

  @Post('deeplink/universal')
  @ApiOperation({ summary: 'Generate universal deep links for all platforms' })
  @ApiResponse({ status: 200, description: 'Universal deep links generated' })
  @HttpCode(HttpStatus.OK)
  async createUniversalLink(
    @Body() deepLink: DeepLink,
  ): Promise<{
    webUrl: string;
    iosUrl: string;
    androidUrl: string;
  }> {
    return this.deepLinkService.createUniversalLink(deepLink);
  }

  @Get('metrics')
  @ApiOperation({ summary: 'Get synchronization metrics' })
  @ApiResponse({ status: 200, description: 'Sync metrics retrieved successfully' })
  async getSyncMetrics(
    @CurrentUser() user: any,
    @TenantContext() tenantId: string,
  ) {
    return this.syncService.getSyncMetrics(user.id, tenantId);
  }

  @Post('force-reset')
  @ApiOperation({ summary: 'Force complete sync reset' })
  @ApiResponse({ status: 200, description: 'Sync reset completed' })
  @HttpCode(HttpStatus.OK)
  async forceSyncReset(
    @CurrentUser() user: any,
    @TenantContext() tenantId: string,
  ): Promise<void> {
    // Clear all sync state for the user
    await this.clientStateService.clearUserState(user.id, tenantId);
    
    // Clear any pending operations
    await this.offlineQueueService.clearQueue(user.id, tenantId);
    
    return;
  }

  @Get('devices')
  @ApiOperation({ summary: 'Get all device states for user' })
  @ApiResponse({ status: 200, description: 'Device states retrieved successfully' })
  async getDeviceStates(
    @CurrentUser() user: any,
    @TenantContext() tenantId: string,
  ): Promise<ClientState[]> {
    return this.clientStateService.getDeviceStates(user.id, tenantId);
  }

  @Post('cleanup/expired')
  @ApiOperation({ summary: 'Cleanup expired operations and states' })
  @ApiResponse({ status: 200, description: 'Cleanup completed' })
  @HttpCode(HttpStatus.OK)
  async cleanupExpired(
    @CurrentUser() user: any,
    @TenantContext() tenantId: string,
    @Query('deviceId') deviceId?: string,
  ): Promise<{ 
    expiredOperations: number; 
    expiredStates: number; 
  }> {
    let expiredOperations = 0;
    let expiredStates = 0;

    if (deviceId) {
      expiredOperations = await this.offlineQueueService.clearExpiredOperations(
        user.id, 
        tenantId, 
        deviceId
      );
      expiredStates = await this.clientStateService.clearExpiredOperations(
        user.id, 
        tenantId, 
        deviceId
      );
    } else {
      // Cleanup all devices for the user
      const deviceStates = await this.clientStateService.getDeviceStates(user.id, tenantId);
      
      for (const state of deviceStates) {
        const deviceExpiredOps = await this.offlineQueueService.clearExpiredOperations(
          user.id, 
          tenantId, 
          state.deviceId
        );
        const deviceExpiredStates = await this.clientStateService.clearExpiredOperations(
          user.id, 
          tenantId, 
          state.deviceId
        );
        
        expiredOperations += deviceExpiredOps;
        expiredStates += deviceExpiredStates;
      }
    }

    return { expiredOperations, expiredStates };
  }
}
