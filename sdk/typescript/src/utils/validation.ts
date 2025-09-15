import { ChemChatConfig } from '../types';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

/**
 * Validate ChemChat configuration
 */
export function validateConfig(config: ChemChatConfig): ValidationResult {
  const errors: string[] = [];

  // Required fields
  if (!config.apiUrl) {
    errors.push('apiUrl is required');
  } else if (!isValidUrl(config.apiUrl)) {
    errors.push('apiUrl must be a valid URL');
  }

  if (!config.tenantId) {
    errors.push('tenantId is required');
  } else if (typeof config.tenantId !== 'string' || config.tenantId.trim().length === 0) {
    errors.push('tenantId must be a non-empty string');
  }

  // Optional fields validation
  if (config.wsUrl && !isValidUrl(config.wsUrl)) {
    errors.push('wsUrl must be a valid URL');
  }

  if (config.timeout && (typeof config.timeout !== 'number' || config.timeout <= 0)) {
    errors.push('timeout must be a positive number');
  }

  if (config.retryAttempts && (typeof config.retryAttempts !== 'number' || config.retryAttempts < 0)) {
    errors.push('retryAttempts must be a non-negative number');
  }

  if (config.retryDelay && (typeof config.retryDelay !== 'number' || config.retryDelay < 0)) {
    errors.push('retryDelay must be a non-negative number');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validate URL format
 */
function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate tenant ID format
 */
export function validateTenantId(tenantId: string): boolean {
  // Tenant ID should be alphanumeric with hyphens and underscores
  const tenantIdRegex = /^[a-zA-Z0-9_-]+$/;
  return tenantIdRegex.test(tenantId) && tenantId.length >= 3 && tenantId.length <= 50;
}

/**
 * Validate email format
 */
export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate password strength
 */
export function validatePassword(password: string): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (password.length < 8) {
    errors.push('Password must be at least 8 characters long');
  }

  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }

  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }

  if (!/\d/.test(password)) {
    errors.push('Password must contain at least one number');
  }

  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}
