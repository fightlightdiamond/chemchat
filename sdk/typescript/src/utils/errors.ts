/**
 * Custom error classes for ChemChat SDK
 */

export class ChemChatError extends Error {
  public readonly code: string;
  public readonly details?: any;
  public readonly timestamp: string;

  constructor(message: string, code: string, details?: any) {
    super(message);
    this.name = 'ChemChatError';
    this.code = code;
    this.details = details;
    this.timestamp = new Date().toISOString();

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ChemChatError);
    }
  }

  public toJSON(): object {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      details: this.details,
      timestamp: this.timestamp,
      stack: this.stack,
    };
  }
}

export class AuthenticationError extends ChemChatError {
  constructor(message: string, details?: any) {
    super(message, 'AUTHENTICATION_ERROR', details);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends ChemChatError {
  constructor(message: string, details?: any) {
    super(message, 'AUTHORIZATION_ERROR', details);
    this.name = 'AuthorizationError';
  }
}

export class ValidationError extends ChemChatError {
  constructor(message: string, details?: any) {
    super(message, 'VALIDATION_ERROR', details);
    this.name = 'ValidationError';
  }
}

export class NetworkError extends ChemChatError {
  constructor(message: string, details?: any) {
    super(message, 'NETWORK_ERROR', details);
    this.name = 'NetworkError';
  }
}

export class RateLimitError extends ChemChatError {
  public readonly retryAfter: number;

  constructor(message: string, retryAfter: number, details?: any) {
    super(message, 'RATE_LIMIT_ERROR', details);
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

export class WebSocketError extends ChemChatError {
  constructor(message: string, details?: any) {
    super(message, 'WEBSOCKET_ERROR', details);
    this.name = 'WebSocketError';
  }
}

export class SyncError extends ChemChatError {
  constructor(message: string, details?: any) {
    super(message, 'SYNC_ERROR', details);
    this.name = 'SyncError';
  }
}

export class MediaError extends ChemChatError {
  constructor(message: string, details?: any) {
    super(message, 'MEDIA_ERROR', details);
    this.name = 'MediaError';
  }
}

/**
 * Type guard to check if an error is a ChemChatError
 */
export function isChemChatError(error: any): error is ChemChatError {
  return error instanceof ChemChatError;
}

/**
 * Type guard to check if an error is an AuthenticationError
 */
export function isAuthenticationError(error: any): error is AuthenticationError {
  return error instanceof AuthenticationError;
}

/**
 * Type guard to check if an error is a RateLimitError
 */
export function isRateLimitError(error: any): error is RateLimitError {
  return error instanceof RateLimitError;
}

/**
 * Convert API error response to appropriate ChemChat error
 */
export function createErrorFromResponse(response: any): ChemChatError {
  const { statusCode, message, error, details } = response;

  switch (statusCode) {
    case 401:
      return new AuthenticationError(message || 'Authentication failed', details);
    case 403:
      return new AuthorizationError(message || 'Access denied', details);
    case 400:
      return new ValidationError(message || 'Validation failed', details);
    case 429:
      const retryAfter = parseInt(response.headers?.['retry-after'] || '60');
      return new RateLimitError(message || 'Rate limit exceeded', retryAfter, details);
    case 500:
    case 502:
    case 503:
    case 504:
      return new NetworkError(message || 'Server error', details);
    default:
      return new ChemChatError(message || 'Unknown error', error || 'UNKNOWN_ERROR', details);
  }
}
