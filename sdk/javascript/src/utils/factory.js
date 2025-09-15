import { ChemChatClient } from '../client/chemchat-client.js';
import { validateConfig } from './validation.js';
import { ChemChatError } from './errors.js';

/**
 * Factory function to create a ChemChat client with validation
 */
export function createChemChatClient(config, options) {
  const validationResult = validateConfig(config);
  if (!validationResult.isValid) {
    throw new ChemChatError(
      'Invalid configuration',
      'CONFIG_VALIDATION_ERROR',
      { errors: validationResult.errors }
    );
  }

  return new ChemChatClient(config, options);
}

/**
 * Create a client with default development configuration
 */
export function createDevelopmentClient(tenantId, options) {
  const config = {
    apiUrl: 'http://localhost:3000',
    wsUrl: 'ws://localhost:3000',
    tenantId,
    timeout: 30000,
    retryAttempts: 3,
    retryDelay: 1000,
  };

  return createChemChatClient(config, {
    enableWebSocket: true,
    enableSync: true,
    syncInterval: 30000,
    ...options,
  });
}

/**
 * Create a client with production configuration
 */
export function createProductionClient(apiUrl, tenantId, apiKey, options) {
  const config = {
    apiUrl,
    wsUrl: apiUrl.replace(/^http/, 'ws'),
    tenantId,
    apiKey,
    timeout: 30000,
    retryAttempts: 5,
    retryDelay: 2000,
  };

  return createChemChatClient(config, {
    enableWebSocket: true,
    enableSync: true,
    syncInterval: 60000,
    ...options,
  });
}
