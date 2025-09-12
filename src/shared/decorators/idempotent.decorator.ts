import { SetMetadata } from '@nestjs/common';

export const IDEMPOTENT_KEY = 'idempotent';

/**
 * Decorator to mark command handlers as idempotent
 * This enables automatic deduplication based on client message IDs
 */
export const Idempotent = () => SetMetadata(IDEMPOTENT_KEY, true);
