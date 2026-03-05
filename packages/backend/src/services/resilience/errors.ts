/**
 * Application error classes and user-friendly error formatting.
 * Returns user-friendly messages without technical details.
 *
 * Requirements: 31.4, 31.8, 31.9
 */

import { v4 as uuid } from 'uuid';
import { FieldValidationError, UserFriendlyError } from '../../types/resilience';

/**
 * Validation error with field-level details.
 */
export class AppValidationError extends Error {
  public readonly fields: FieldValidationError[];
  public readonly statusCode = 400;

  constructor(fields: FieldValidationError[]) {
    const summary = fields.map((f) => `${f.field}: ${f.message}`).join('; ');
    super(`Validation failed: ${summary}`);
    this.name = 'AppValidationError';
    this.fields = fields;
  }

  toResponse(): { error: string; fields: FieldValidationError[] } {
    return {
      error: 'Validation failed. Please check the highlighted fields.',
      fields: this.fields,
    };
  }
}

/**
 * Format any error into a user-friendly response.
 * Hides stack traces and internal details from the user.
 */
export function toUserFriendlyError(error: unknown): UserFriendlyError & { statusCode: number } {
  const errorId = `err_${uuid().replace(/-/g, '').slice(0, 12)}`;

  if (error instanceof AppValidationError) {
    return {
      error: 'Please correct the errors in your input and try again.',
      errorId,
      statusCode: error.statusCode,
    };
  }

  // Generic user-facing message — no technical details
  return {
    error: 'An unexpected error occurred. Please try again later.',
    errorId,
    statusCode: 500,
  };
}

/**
 * Build the internal log payload for an error (for debugging).
 * This is NOT sent to the user.
 */
export function toInternalErrorLog(
  error: unknown,
  context?: Record<string, unknown>,
): Record<string, unknown> {
  const err = error instanceof Error ? error : new Error(String(error));
  return {
    errorType: err.name,
    message: err.message,
    stack: err.stack,
    ...(context ?? {}),
    timestamp: new Date().toISOString(),
  };
}
