import { AppValidationError, toUserFriendlyError, toInternalErrorLog } from './errors';

describe('AppValidationError', () => {
  it('should store field-level errors', () => {
    const err = new AppValidationError([
      { field: 'email', message: 'Invalid email format', code: 'INVALID_EMAIL' },
      { field: 'phone', message: 'Phone is required', code: 'REQUIRED' },
    ]);

    expect(err.fields).toHaveLength(2);
    expect(err.fields[0].field).toBe('email');
    expect(err.fields[1].code).toBe('REQUIRED');
    expect(err.statusCode).toBe(400);
    expect(err.name).toBe('AppValidationError');
  });

  it('should produce a user-friendly response', () => {
    const err = new AppValidationError([
      { field: 'latitude', message: 'Latitude must be between -90 and 90', code: 'INVALID_LATITUDE' },
    ]);

    const response = err.toResponse();
    expect(response.error).toContain('Validation failed');
    expect(response.fields).toHaveLength(1);
    expect(response.fields[0].field).toBe('latitude');
  });
});

describe('toUserFriendlyError', () => {
  it('should hide technical details for generic errors', () => {
    const result = toUserFriendlyError(new Error('ECONNREFUSED 127.0.0.1:5432'));

    expect(result.error).toBe('An unexpected error occurred. Please try again later.');
    expect(result.errorId).toMatch(/^err_/);
    expect(result.statusCode).toBe(500);
    // Must NOT contain technical details
    expect(result.error).not.toContain('ECONNREFUSED');
    expect(result.error).not.toContain('127.0.0.1');
  });

  it('should return 400 for validation errors', () => {
    const err = new AppValidationError([
      { field: 'name', message: 'Required', code: 'REQUIRED' },
    ]);
    const result = toUserFriendlyError(err);
    expect(result.statusCode).toBe(400);
    expect(result.errorId).toMatch(/^err_/);
  });

  it('should handle non-Error objects', () => {
    const result = toUserFriendlyError('string error');
    expect(result.error).toBe('An unexpected error occurred. Please try again later.');
    expect(result.statusCode).toBe(500);
  });
});

describe('toInternalErrorLog', () => {
  it('should include full error details for debugging', () => {
    const err = new Error('DB connection failed');
    const log = toInternalErrorLog(err, { endpoint: '/api/v1/farms', userId: 'u-1' });

    expect(log.errorType).toBe('Error');
    expect(log.message).toBe('DB connection failed');
    expect(log.stack).toBeDefined();
    expect(log.endpoint).toBe('/api/v1/farms');
    expect(log.userId).toBe('u-1');
    expect(log.timestamp).toBeDefined();
  });

  it('should handle non-Error objects', () => {
    const log = toInternalErrorLog('raw string');
    expect(log.message).toBe('raw string');
  });
});
