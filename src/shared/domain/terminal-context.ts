/**
 * Terminal context validation and scope definitions
 * Ensures terminal sessions are bound to valid bench/site context
 */

import type { TerminalSessionId } from './terminal-session';

/**
 * Validated context scope for a terminal session
 */
export interface TerminalContext {
  readonly benchId: string;
  readonly siteId: string | null;
  readonly workspacePath: string;
}

/**
 * Terminal context validation result
 */
export interface ContextValidationResult {
  readonly valid: boolean;
  readonly context: TerminalContext | null;
  readonly errors: readonly string[];
}

/**
 * Context resolution error types
 */
export const ContextErrorCode = {
  INVALID_BENCH_ID: 'INVALID_BENCH_ID',
  INVALID_SITE_ID: 'INVALID_SITE_ID',
  BENCH_NOT_FOUND: 'BENCH_NOT_FOUND',
  SITE_NOT_FOUND: 'SITE_NOT_FOUND',
  PATH_ESCAPE_ATTEMPT: 'PATH_ESCAPE_ATTEMPT',
  INVALID_PATH_SYNTAX: 'INVALID_PATH_SYNTAX',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
} as const;

export type ContextErrorCode = (typeof ContextErrorCode)[keyof typeof ContextErrorCode];

/**
 * Validation error with code and details
 */
export interface ContextValidationError {
  readonly code: ContextErrorCode;
  readonly message: string;
  readonly details?: Record<string, unknown>;
}

/**
 * Validates bench ID format
 * - Must be non-empty alphanumeric with hyphens/underscores
 * - Protects against path traversal attempts
 */
export const validateBenchId = (benchId: string): boolean => {
  if (!benchId || typeof benchId !== 'string') return false;
  // Only allow alphanumeric, hyphens, underscores
  return /^[a-zA-Z0-9_-]+$/.test(benchId) && benchId.length <= 255;
};

/**
 * Validates site ID format (optional)
 * - Must be non-empty alphanumeric with hyphens/underscores if provided
 * - Protects against path traversal attempts
 */
export const validateSiteId = (siteId: string | null): boolean => {
  if (siteId === null) return true;
  if (!siteId || typeof siteId !== 'string') return false;
  // Only allow alphanumeric, hyphens, underscores
  return /^[a-zA-Z0-9_-]+$/.test(siteId) && siteId.length <= 255;
};

/**
 * Validates workspace path safety.
 * The path is resolved from trusted repository state, so absolute paths are allowed.
 */
export const validateWorkspacePath = (workspacePath: string): boolean => {
  if (!workspacePath || typeof workspacePath !== 'string') {
    return false;
  }

  if (workspacePath.includes('\0')) {
    return false;
  }

  return workspacePath.length <= 4096;
};

/**
 * Safely resolves context IDs to ensure they don't escape workspace boundaries
 */
export const validateTerminalContext = (
  benchId: string,
  siteId: string | null,
  workspacePath: string
): ContextValidationResult => {
  const errors: string[] = [];

  // Validate bench ID
  if (!validateBenchId(benchId)) {
    errors.push(`Invalid bench ID: ${benchId}`);
  }

  // Validate site ID if provided
  if (!validateSiteId(siteId)) {
    errors.push(`Invalid site ID: ${siteId}`);
  }

  // Validate workspace path
  if (!validateWorkspacePath(workspacePath)) {
    errors.push(`Invalid workspace path: ${workspacePath}`);
  }

  if (errors.length > 0) {
    return {
      valid: false,
      context: null,
      errors,
    };
  }

  return {
    valid: true,
    context: {
      benchId,
      siteId,
      workspacePath,
    },
    errors: [],
  };
};

/**
 * Build a safe working directory from context
 * Ensures the path stays within workspace boundaries
 */
export const buildWorkingDirectory = (context: TerminalContext): string => {
  // Return the workspace path as working directory
  // This is the root for all terminal operations
  return context.workspacePath;
};

/**
 * Scope validation - ensures terminal operations are within valid context
 */
export const isScopeValid = (context: TerminalContext): boolean => {
  return (
    validateBenchId(context.benchId) &&
    validateSiteId(context.siteId) &&
    validateWorkspacePath(context.workspacePath)
  );
};
