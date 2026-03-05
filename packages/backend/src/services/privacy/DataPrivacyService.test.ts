import {
  DataPrivacyService,
  PrivacyError,
  DATA_RETENTION_YEARS,
  DELETION_SLA_DAYS,
} from './DataPrivacyService';

// ── Mock pg Pool ───────────────────────────────────────────────
const mockQuery = jest.fn();
const mockConnect = jest.fn();

jest.mock('../../db/pool', () => ({
  getPool: () => ({ query: mockQuery, connect: mockConnect }),
}));

describe('DataPrivacyService', () => {
  let service: DataPrivacyService;

  beforeEach(() => {
    service = new DataPrivacyService();
    mockQuery.mockReset();
    mockConnect.mockReset();
  });

  // ── maskSensitiveData ──────────────────────────────────────

  describe('maskSensitiveData', () => {
    it('should redact known PII field names', () => {
      const data = {
        phone: '9876543210',
        email: 'farmer@example.com',
        name: 'Ravi Kumar',
        action: 'login',
      };

      const masked = service.maskSensitiveData(data);

      expect(masked.phone).toBe('[REDACTED]');
      expect(masked.email).toBe('[REDACTED]');
      expect(masked.name).toBe('[REDACTED]');
      expect(masked.action).toBe('login'); // non-PII field preserved
    });

    it('should redact password and token fields', () => {
      const data = { password: 'secret123', token: 'jwt.abc.xyz', user_id: 'u-1' };
      const masked = service.maskSensitiveData(data);

      expect(masked.password).toBe('[REDACTED]');
      expect(masked.token).toBe('[REDACTED]');
      expect(masked.user_id).toBe('u-1');
    });

    it('should redact nested PII fields', () => {
      const data = {
        user: { name: 'Priya', email: 'priya@test.com', role: 'farmer' },
        meta: { action: 'update' },
      };

      const masked = service.maskSensitiveData(data);

      expect((masked.user as Record<string, unknown>).name).toBe('[REDACTED]');
      expect((masked.user as Record<string, unknown>).email).toBe('[REDACTED]');
      expect((masked.user as Record<string, unknown>).role).toBe('farmer');
    });

    it('should apply regex patterns to string values', () => {
      const data = {
        message: 'User 9876543210 logged in from 192.168.1.100',
      };

      const masked = service.maskSensitiveData(data);

      expect(masked.message).toContain('[PHONE_REDACTED]');
      expect(masked.message).toContain('[IP_REDACTED]');
    });

    it('should handle arrays of objects', () => {
      const data = {
        users: [
          { name: 'Alice', role: 'farmer' },
          { name: 'Bob', role: 'admin' },
        ],
      };

      const masked = service.maskSensitiveData(data);
      const users = masked.users as Array<Record<string, unknown>>;

      expect(users[0].name).toBe('[REDACTED]');
      expect(users[1].name).toBe('[REDACTED]');
      expect(users[0].role).toBe('farmer');
    });

    it('should not modify non-PII fields', () => {
      const data = { crop: 'tomato', price: 25, market: 'Delhi APMC' };
      const masked = service.maskSensitiveData(data);

      expect(masked.crop).toBe('tomato');
      expect(masked.price).toBe(25);
      expect(masked.market).toBe('Delhi APMC');
    });
  });

  // ── maskString ─────────────────────────────────────────────

  describe('maskString', () => {
    it('should redact phone numbers', () => {
      const result = service.maskString('Call 9876543210 for support');
      expect(result).toContain('[PHONE_REDACTED]');
      expect(result).not.toContain('9876543210');
    });

    it('should redact email addresses', () => {
      const result = service.maskString('Contact user@example.com for help');
      expect(result).toContain('[EMAIL_REDACTED]');
    });

    it('should redact IP addresses', () => {
      const result = service.maskString('Request from 10.0.0.1 failed');
      expect(result).toContain('[IP_REDACTED]');
    });

    it('should redact JSON password fields', () => {
      const result = service.maskString('{"password":"mysecret","user":"admin"}');
      expect(result).toContain('"password":"[REDACTED]"');
      expect(result).not.toContain('mysecret');
    });

    it('should return unchanged string with no PII', () => {
      const result = service.maskString('Tomato price is ₹25/kg at Delhi market');
      expect(result).toBe('Tomato price is ₹25/kg at Delhi market');
    });
  });

  // ── exportUserData ─────────────────────────────────────────

  describe('exportUserData', () => {
    const userId = 'user-1';
    const tenantId = 'tenant-1';

    const userRow = {
      id: userId,
      tenant_id: tenantId,
      phone: '9876543210',
      email: 'farmer@test.com',
      name: 'Ravi Kumar',
      roles: ['farmer'],
      language_preference: 'hi',
      created_at: new Date().toISOString(),
      last_login: new Date().toISOString(),
    };

    it('should return complete user data export in JSON format', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [userRow] })          // user profile
        .mockResolvedValueOnce({ rows: [] })                  // farms
        .mockResolvedValueOnce({ rows: [] })                  // conversations
        .mockResolvedValueOnce({ rows: [] })                  // alerts
        .mockResolvedValueOnce({ rows: [] })                  // audit trail
        .mockResolvedValueOnce({ rows: [] });                 // logDataAccess INSERT

      const result = await service.exportUserData(userId, tenantId);

      expect(result.user_id).toBe(userId);
      expect(result.tenant_id).toBe(tenantId);
      expect(result.export_id).toBeDefined();
      expect(result.exported_at).toBeDefined();
      expect(result.profile).toEqual(userRow);
      expect(Array.isArray(result.farms)).toBe(true);
      expect(Array.isArray(result.conversations)).toBe(true);
      expect(Array.isArray(result.alerts)).toBe(true);
      expect(Array.isArray(result.audit_trail)).toBe(true);
    });

    it('should throw PrivacyError when user not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await expect(service.exportUserData('nonexistent', tenantId)).rejects.toThrow(PrivacyError);
    });

    it('should throw with User not found message when user not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await expect(service.exportUserData('nonexistent', tenantId)).rejects.toThrow('User not found');
    });

    it('should log data access event after export', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [userRow] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] }); // audit INSERT

      await service.exportUserData(userId, tenantId);

      // Last query should be the audit log INSERT
      const lastCall = mockQuery.mock.calls[mockQuery.mock.calls.length - 1];
      expect(lastCall[0]).toContain('INSERT INTO audit_logs');
    });

    it('should include export_id as a unique identifier', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [userRow] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const result1 = await service.exportUserData(userId, tenantId);

      mockQuery
        .mockResolvedValueOnce({ rows: [userRow] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const result2 = await service.exportUserData(userId, tenantId);

      expect(result1.export_id).not.toBe(result2.export_id);
    });
  });

  // ── deleteUserData ─────────────────────────────────────────

  describe('deleteUserData', () => {
    const userId = 'user-1';
    const tenantId = 'tenant-1';
    const requestedBy = 'admin-1';

    const mockClient = {
      query: jest.fn(),
      release: jest.fn(),
    };

    beforeEach(() => {
      mockConnect.mockResolvedValue(mockClient);
      mockClient.query.mockReset();
      mockClient.release.mockReset();
    });

    it('should anonymize personal data and preserve analytics', async () => {
      // user exists check
      mockQuery.mockResolvedValueOnce({ rows: [{ id: userId }] });
      // transaction queries
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({}) // anonymize conversations
        .mockResolvedValueOnce({}) // anonymize input_logs
        .mockResolvedValueOnce({}) // anonymize farms
        .mockResolvedValueOnce({}) // anonymize user
        .mockResolvedValueOnce({}) // delete alerts
        .mockResolvedValueOnce({}); // COMMIT
      // audit log
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await service.deleteUserData(userId, tenantId, requestedBy);

      expect(result.user_id).toBe(userId);
      expect(result.personal_data_removed).toBe(true);
      expect(result.analytics_preserved).toBe(true);
      expect(result.deletion_scheduled_by).toBe(requestedBy);
      expect(result.deleted_at).toBeDefined();
    });

    it('should throw PrivacyError when user not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(service.deleteUserData('nonexistent', tenantId, requestedBy)).rejects.toThrow(PrivacyError);
    });

    it('should rollback transaction on error', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: userId }] });
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockRejectedValueOnce(new Error('DB error')); // fail on first UPDATE

      await expect(service.deleteUserData(userId, tenantId, requestedBy)).rejects.toThrow('DB error');

      const rollbackCall = mockClient.query.mock.calls.find(
        (call: unknown[]) => call[0] === 'ROLLBACK',
      );
      expect(rollbackCall).toBeDefined();
    });

    it('should anonymize user phone with a placeholder', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: userId }] });
      mockClient.query
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({});
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await service.deleteUserData(userId, tenantId, requestedBy);

      // Find the UPDATE users call
      const updateUsersCall = mockClient.query.mock.calls.find(
        (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('UPDATE users'),
      );
      expect(updateUsersCall).toBeDefined();
      // The phone replacement should start with [deleted-
      expect((updateUsersCall![1] as string[])[1]).toMatch(/^\[deleted-/);
    });
  });

  // ── enforceRetentionPolicy ─────────────────────────────────

  describe('enforceRetentionPolicy', () => {
    it('should delete records older than 3 years from all relevant tables', async () => {
      mockQuery
        .mockResolvedValueOnce({ rowCount: 5 })   // conversations
        .mockResolvedValueOnce({ rowCount: 12 })  // alerts
        .mockResolvedValueOnce({ rowCount: 3 });  // input_logs

      const result = await service.enforceRetentionPolicy();

      expect(result.records_deleted).toBe(20);
      expect(result.tables_processed).toContain('conversations');
      expect(result.tables_processed).toContain('alerts');
      expect(result.tables_processed).toContain('input_logs');
      expect(result.cutoff_date).toBeDefined();
    });

    it('should use the correct cutoff date (3 years ago)', async () => {
      mockQuery
        .mockResolvedValueOnce({ rowCount: 0 })
        .mockResolvedValueOnce({ rowCount: 0 })
        .mockResolvedValueOnce({ rowCount: 0 });

      await service.enforceRetentionPolicy();

      // All DELETE queries should use a date parameter
      for (const call of mockQuery.mock.calls) {
        expect(call[0]).toContain('DELETE FROM');
        expect(call[1][0]).toBeInstanceOf(Date);
      }
    });

    it('should return 0 deleted when no old records exist', async () => {
      mockQuery
        .mockResolvedValueOnce({ rowCount: 0 })
        .mockResolvedValueOnce({ rowCount: 0 })
        .mockResolvedValueOnce({ rowCount: 0 });

      const result = await service.enforceRetentionPolicy();
      expect(result.records_deleted).toBe(0);
    });
  });

  // ── validateDataMinimization ───────────────────────────────

  describe('validateDataMinimization', () => {
    it('should return empty array when all fields are allowed', () => {
      const collected = ['name', 'phone', 'language_preference'];
      const allowed = ['name', 'phone', 'language_preference', 'roles'];

      const excess = service.validateDataMinimization(collected, allowed);
      expect(excess).toHaveLength(0);
    });

    it('should return excess fields not in allowed list', () => {
      const collected = ['name', 'phone', 'biometric_data', 'browsing_history'];
      const allowed = ['name', 'phone'];

      const excess = service.validateDataMinimization(collected, allowed);
      expect(excess).toContain('biometric_data');
      expect(excess).toContain('browsing_history');
      expect(excess).not.toContain('name');
      expect(excess).not.toContain('phone');
    });

    it('should return all fields as excess when allowed list is empty', () => {
      const collected = ['name', 'phone'];
      const excess = service.validateDataMinimization(collected, []);
      expect(excess).toEqual(['name', 'phone']);
    });
  });

  // ── getRetentionCutoffDate ─────────────────────────────────

  describe('getRetentionCutoffDate', () => {
    it('should return a date exactly 3 years in the past', () => {
      const cutoff = service.getRetentionCutoffDate();
      const expected = new Date();
      expected.setFullYear(expected.getFullYear() - DATA_RETENTION_YEARS);

      expect(Math.abs(cutoff.getTime() - expected.getTime())).toBeLessThan(1000);
    });

    it('should return a date in the past', () => {
      const cutoff = service.getRetentionCutoffDate();
      expect(cutoff.getTime()).toBeLessThan(Date.now());
    });
  });

  // ── generateSecurityAuditReport ───────────────────────────

  describe('generateSecurityAuditReport', () => {
    it('should return a report with required security fields', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ cnt: '42' }] })  // sensitive accesses
        .mockResolvedValueOnce({ rows: [{ cnt: '3' }] })   // suspicious activities
        .mockResolvedValueOnce({ rows: [{ cnt: '7' }] });  // data deletions

      const report = await service.generateSecurityAuditReport('tenant-1');

      expect(report.tenant_id).toBe('tenant-1');
      expect(report.sensitive_data_accesses).toBe(42);
      expect(report.suspicious_activities).toBe(3);
      expect(report.data_deletions).toBe(7);
      expect(report.encryption_at_rest).toContain('AES-256');
      expect(report.tls_version).toContain('TLS 1.3');
      expect(report.secrets_management).toContain('AWS Secrets Manager');
      expect(report.iam_policy).toContain('least-privilege');
    });
  });

  // ── constants ──────────────────────────────────────────────

  describe('constants', () => {
    it('should have 3-year retention period', () => {
      expect(DATA_RETENTION_YEARS).toBe(3);
    });

    it('should have 30-day deletion SLA', () => {
      expect(DELETION_SLA_DAYS).toBe(30);
    });
  });

  // ── logDataAccess ──────────────────────────────────────────

  describe('logDataAccess', () => {
    it('should insert an audit log entry for data access', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const entry = await service.logDataAccess({
        user_id: 'user-1',
        accessor_id: 'admin-1',
        action: 'data_export',
        resource: 'user_data',
      });

      expect(entry.action).toBe('data_export');
      expect(entry.masked).toBe(true);
      expect(entry.id).toBeDefined();
      expect(mockQuery.mock.calls[0][0]).toContain('INSERT INTO audit_logs');
    });
  });
});
