import {
  Controller,
  Get,
  Query,
  UseGuards,
  Logger,
  ValidationPipe,
  UsePipes,
} from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { SearchMessagesQuery } from '../queries/search-messages.query';
import { GetSearchSuggestionsQuery } from '../queries/get-search-suggestions.query';
import { SearchMessageResult, SearchSuggestion } from '../services/search.service';

interface AuthenticatedUser {
  id: string;
  tenantId: string;
  username: string;
}

@ApiTags('Search')
@ApiBearerAuth()
@Controller('search')
@UseGuards(JwtAuthGuard)
export class SearchController {
  private readonly logger = new Logger(SearchController.name);

  constructor(private readonly queryBus: QueryBus) {}

  @Get('messages')
  @ApiOperation({ summary: 'Search messages with full-text search and filtering' })
  @ApiResponse({ 
    status: 200, 
    description: 'Search results with pagination and metadata',
    schema: {
      type: 'object',
      properties: {
        messages: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              messageId: { type: 'string' },
              conversationId: { type: 'string' },
              content: { type: 'string' },
              authorId: { type: 'string' },
              authorName: { type: 'string' },
              createdAt: { type: 'string', format: 'date-time' },
              updatedAt: { type: 'string', format: 'date-time' },
              messageType: { type: 'string', enum: ['text', 'media', 'system'] },
              sequenceNumber: { type: 'string' },
              isEdited: { type: 'boolean' },
              isDeleted: { type: 'boolean' },
              score: { type: 'number' },
              highlights: {
                type: 'object',
                properties: {
                  content: { type: 'array', items: { type: 'string' } },
                  authorName: { type: 'array', items: { type: 'string' } },
                },
              },
            },
          },
        },
        pagination: {
          type: 'object',
          properties: {
            page: { type: 'number' },
            limit: { type: 'number' },
            total: { type: 'number' },
            totalPages: { type: 'number' },
            hasNext: { type: 'boolean' },
            hasPrevious: { type: 'boolean' },
          },
        },
        searchMetadata: {
          type: 'object',
          properties: {
            took: { type: 'number' },
            maxScore: { type: 'number' },
            query: { type: 'string' },
          },
        },
      },
    },
  })
  @ApiQuery({ name: 'q', required: false, description: 'Search query text' })
  @ApiQuery({ name: 'conversationId', required: false, description: 'Filter by conversation ID' })
  @ApiQuery({ name: 'authorId', required: false, description: 'Filter by author ID' })
  @ApiQuery({ name: 'messageType', required: false, enum: ['text', 'media', 'system'] })
  @ApiQuery({ name: 'fromDate', required: false, description: 'Filter messages from date (ISO string)' })
  @ApiQuery({ name: 'toDate', required: false, description: 'Filter messages to date (ISO string)' })
  @ApiQuery({ name: 'page', required: false, type: 'number', description: 'Page number (1-based)' })
  @ApiQuery({ name: 'limit', required: false, type: 'number', description: 'Results per page (1-100)' })
  @ApiQuery({ name: 'sortBy', required: false, enum: ['relevance', 'date', 'sequence'] })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'] })
  @ApiQuery({ name: 'includeDeleted', required: false, type: 'boolean' })
  @ApiQuery({ name: 'highlights', required: false, type: 'boolean', description: 'Include search highlights' })
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async searchMessages(
    @CurrentUser() user: AuthenticatedUser,
    @Query('q') query?: string,
    @Query('conversationId') conversationId?: string,
    @Query('authorId') authorId?: string,
    @Query('messageType') messageType?: 'text' | 'media' | 'system',
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('sortBy') sortBy?: 'relevance' | 'date' | 'sequence',
    @Query('sortOrder') sortOrder?: 'asc' | 'desc',
    @Query('includeDeleted') includeDeleted?: boolean,
    @Query('highlights') highlights?: boolean,
  ): Promise<SearchMessageResult> {
    this.logger.debug(`Search request from user ${user.id}: "${query || 'empty'}"`);

    const searchQuery = new SearchMessagesQuery({
      query,
      tenantId: user.tenantId,
      conversationId,
      authorId,
      messageType,
      fromDate,
      toDate,
      page,
      limit,
      sortBy,
      sortOrder,
      includeDeleted,
      highlights,
      userId: user.id,
      correlationId: `search-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    });

    return await this.queryBus.execute(searchQuery);
  }

  @Get('suggestions')
  @ApiOperation({ summary: 'Get search suggestions based on partial query' })
  @ApiResponse({ 
    status: 200, 
    description: 'List of search suggestions',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          score: { type: 'number' },
          type: { type: 'string', enum: ['content', 'author', 'conversation'] },
        },
      },
    },
  })
  @ApiQuery({ name: 'q', required: true, description: 'Partial search query' })
  @ApiQuery({ name: 'limit', required: false, type: 'number', description: 'Maximum suggestions (1-20)' })
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async getSearchSuggestions(
    @CurrentUser() user: AuthenticatedUser,
    @Query('q') query: string,
    @Query('limit') limit?: number,
  ): Promise<SearchSuggestion[]> {
    this.logger.debug(`Suggestions request from user ${user.id}: "${query}"`);

    const suggestionsQuery = new GetSearchSuggestionsQuery({
      query,
      tenantId: user.tenantId,
      limit,
      userId: user.id,
      correlationId: `suggestions-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    });

    return await this.queryBus.execute(suggestionsQuery);
  }

  @Get('health')
  @ApiOperation({ summary: 'Check search service health' })
  @ApiResponse({ 
    status: 200, 
    description: 'Search service health status',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['healthy', 'degraded', 'unhealthy'] },
        elasticsearch: {
          type: 'object',
          properties: {
            connected: { type: 'boolean' },
            clusterHealth: { type: 'string' },
            indexExists: { type: 'boolean' },
          },
        },
        indexingWorker: {
          type: 'object',
          properties: {
            running: { type: 'boolean' },
            consumerGroup: { type: 'string' },
          },
        },
      },
    },
  })
  async getHealthStatus(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    elasticsearch: {
      connected: boolean;
      clusterHealth: string;
      indexExists: boolean;
    };
    indexingWorker: {
      running: boolean;
      consumerGroup: string;
    };
  }> {
    // This would be implemented with proper health checks
    // For now, return a basic status
    return {
      status: 'healthy',
      elasticsearch: {
        connected: true,
        clusterHealth: 'green',
        indexExists: true,
      },
      indexingWorker: {
        running: true,
        consumerGroup: 'search-indexing',
      },
    };
  }
}
