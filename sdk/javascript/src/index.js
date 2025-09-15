/**
 * ChemChat JavaScript SDK
 * Official JavaScript SDK for ChemChat real-time chat system
 */

import { ChemChatClient } from './client/chemchat-client.js';
import { ChemChatHttpClient } from './client/http-client.js';
import { ChemChatWebSocketClient } from './client/websocket-client.js';
import { createChemChatClient, createDevelopmentClient, createProductionClient } from './utils/factory.js';
import { validateConfig, validateEmail, validatePassword } from './utils/validation.js';
import { ChemChatError, isChemChatError } from './utils/errors.js';

// Main exports
export {
  ChemChatClient,
  ChemChatHttpClient,
  ChemChatWebSocketClient,
  createChemChatClient,
  createDevelopmentClient,
  createProductionClient,
  validateConfig,
  validateEmail,
  validatePassword,
  ChemChatError,
  isChemChatError,
};

// Constants
export const VERSION = '1.0.0';

// Message Types
export const MessageType = {
  TEXT: 'TEXT',
  IMAGE: 'IMAGE',
  FILE: 'FILE',
  AUDIO: 'AUDIO',
  VIDEO: 'VIDEO',
  SYSTEM: 'SYSTEM',
};

// User Status
export const UserStatus = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  BANNED: 'BANNED',
  PENDING: 'PENDING',
};

// Online Status
export const OnlineStatus = {
  ONLINE: 'ONLINE',
  AWAY: 'AWAY',
  BUSY: 'BUSY',
  OFFLINE: 'OFFLINE',
};

// Conversation Types
export const ConversationType = {
  DIRECT: 'DIRECT',
  GROUP: 'GROUP',
  CHANNEL: 'CHANNEL',
};

// Participant Roles
export const ParticipantRole = {
  OWNER: 'OWNER',
  ADMIN: 'ADMIN',
  MODERATOR: 'MODERATOR',
  MEMBER: 'MEMBER',
};

// Permissions
export const Permission = {
  READ: 'READ',
  WRITE: 'WRITE',
  MANAGE: 'MANAGE',
  INVITE: 'INVITE',
  KICK: 'KICK',
  BAN: 'BAN',
};

// Default export for UMD builds
export default {
  ChemChatClient,
  ChemChatHttpClient,
  ChemChatWebSocketClient,
  createChemChatClient,
  createDevelopmentClient,
  createProductionClient,
  validateConfig,
  validateEmail,
  validatePassword,
  ChemChatError,
  isChemChatError,
  VERSION,
  MessageType,
  UserStatus,
  OnlineStatus,
  ConversationType,
  ParticipantRole,
  Permission,
};
