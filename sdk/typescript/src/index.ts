/**
 * ChemChat TypeScript SDK
 * Official TypeScript SDK for ChemChat real-time chat system
 */

// Main client exports
export { ChemChatClient } from './client/chemchat-client';
export { ChemChatHttpClient } from './client/http-client';
export { ChemChatWebSocketClient } from './client/websocket-client';

// Type exports
export * from './types';

// Utility exports
export { createChemChatClient } from './utils/factory';
export { validateConfig } from './utils/validation';
export { ChemChatError, isChemChatError } from './utils/errors';

// Version
export const VERSION = '1.0.0';
