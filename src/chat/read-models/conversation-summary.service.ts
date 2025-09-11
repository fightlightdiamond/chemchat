import { Injectable } from '@nestjs/common';
import {
  BaseReadModelService,
  ReadModelProjection,
} from '../../shared/cqrs/read-model.service';
import {
  PaginatedResult,
  PaginationQuery,
} from '../../shared/cqrs/pagination.dto';
import {
  ConversationSummaryData,
  ConversationSummaryFilter,
} from './conversation-summary.read-model';

@Injectable()
export class ConversationSummaryService extends BaseReadModelService<ConversationSummaryData> {
  private readonly projections = new Map<
    string,
    ReadModelProjection<ConversationSummaryData>
  >();

  findById(
    id: string,
    tenantId?: string,
  ): Promise<ReadModelProjection<ConversationSummaryData> | null> {
    const key = this.getKey(id, tenantId);
    return Promise.resolve(this.projections.get(key) || null);
  }

  findMany(
    filter: ConversationSummaryFilter,
    pagination?: PaginationQuery,
    tenantId?: string,
  ): Promise<PaginatedResult<ReadModelProjection<ConversationSummaryData>>> {
    let filtered = Array.from(this.projections.values());

    // Apply tenant filter
    if (tenantId) {
      filtered = filtered.filter((p) => p.tenantId === tenantId);
    }

    // Apply filters
    if (filter.type) {
      filtered = filtered.filter((p) => p.data.type === filter.type);
    }

    if (filter.isArchived !== undefined) {
      filtered = filtered.filter(
        (p) => p.data.isArchived === filter.isArchived,
      );
    }

    if (filter.hasUnread !== undefined) {
      filtered = filtered.filter((p) =>
        filter.hasUnread ? p.data.unreadCount > 0 : p.data.unreadCount === 0,
      );
    }

    // Sort by last message date (newest first)
    filtered.sort((a, b) => {
      const aDate = a.data.lastMessageAt || a.data.createdAt;
      const bDate = b.data.lastMessageAt || b.data.createdAt;
      return bDate.getTime() - aDate.getTime();
    });

    // Apply pagination
    const limit = pagination?.limit || 20;
    const offset = pagination?.cursor ? parseInt(pagination.cursor) : 0;
    const items = filtered.slice(offset, offset + limit);
    const hasNextPage = offset + limit < filtered.length;

    return Promise.resolve({
      data: items,
      total: filtered.length,
      page: Math.floor(offset / limit),
      limit,
      totalPages: Math.ceil(filtered.length / limit),
      hasNext: hasNextPage,
      hasPrevious: offset > 0,
    });
  }

  upsert(
    projection: ReadModelProjection<ConversationSummaryData>,
  ): Promise<void> {
    const key = this.getKey(projection.id, projection.tenantId);
    this.projections.set(key, projection);
    this.logProjectionUpdate(projection.id, projection.version);
    return Promise.resolve();
  }

  delete(id: string, tenantId?: string): Promise<void> {
    const key = this.getKey(id, tenantId);
    this.projections.delete(key);
    return Promise.resolve();
  }

  rebuild(fromVersion?: number): Promise<void> {
    this.logger.log(
      `Rebuilding conversation summary projections from version ${fromVersion || 'beginning'}...`,
    );
    this.projections.clear();
    // In a real implementation, this would replay events from the event store
    return Promise.resolve();
  }

  async updateLastMessage(
    conversationId: string,
    messageContent: string,
    senderId: string | null,
    timestamp: Date,
    tenantId?: string,
  ): Promise<void> {
    const existing = await this.findById(conversationId, tenantId);
    if (existing) {
      const updated = {
        ...existing,
        data: {
          ...existing.data,
          lastMessageAt: timestamp,
          lastMessageContent: messageContent,
          lastMessageSender: senderId,
        },
        version: existing.version + 1,
        lastUpdated: new Date(),
      };
      await this.upsert(updated);
    }
  }

  async incrementUnreadCount(
    conversationId: string,
    tenantId?: string,
  ): Promise<void> {
    const existing = await this.findById(conversationId, tenantId);
    if (existing) {
      const updated = {
        ...existing,
        data: {
          ...existing.data,
          unreadCount: existing.data.unreadCount + 1,
        },
        version: existing.version + 1,
        lastUpdated: new Date(),
      };
      await this.upsert(updated);
    }
  }

  async resetUnreadCount(
    conversationId: string,
    tenantId?: string,
  ): Promise<void> {
    const existing = await this.findById(conversationId, tenantId);
    if (existing) {
      const updated = {
        ...existing,
        data: {
          ...existing.data,
          unreadCount: 0,
        },
        version: existing.version + 1,
        lastUpdated: new Date(),
      };
      await this.upsert(updated);
    }
  }

  private getKey(id: string, tenantId?: string): string {
    return tenantId ? `${tenantId}:${id}` : id;
  }
}
