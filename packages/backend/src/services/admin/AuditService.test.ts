import { AuditService, AUDIT_RETENTION_YEARS } from './AuditService';

// ── Mock pg Pool ───────────────────────────────────────────────
const mockQuery = jest.fn();

jest.mock('../../db/pool', () => ({
  getPool: () => ({ query: mockQuery }),
}));

describe('AuditService', () => {
  let service: AuditService;

  beforeEach(() => {
    service = new AuditService();
    mockQuery.mockReset();
  });

  const tenantId = 'tenant-1';
  const userId = 'user-1';
  const now = new Date().toISOString();

  const baseLogRow = {
    id: 'log-1',
    tenant_id: tenantId,
    user_id: userId,
    action: 'add_user',
    resource_type: 'user',
    resource_id: 'target-user-1',
    changes: null,
    ip_address: '192.168.1.1',
    user_agent: 'Mozilla/5.0',
    timestamp: now,
    is_sensitive: false,
    is_suspicious: false,
    suspicious_reason: null,
  };

  // ── log ─────────────────────────────────────────────────────

  describe('log', () => {
    it('should insert an audit log entry and return it', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [baseLogRow] });
      // suspicious check query
      mockQuery.mockResolvedValueOnce({ rows: [{ cnt: '0' }] });

      const entry = await service.log({
        tenant_id: tenantId,
        user_id: userId,
        action: 'add_user',
        resource_type: 'user',
        resource_id: 'target-user-1',
        ip_address: '192.168.1.1',
        user_agent: 'Mozilla/5.0',
      });

      expect(entry.id).toBe('log-1');
      expect(entry.action).toBe('add_user');
      expect(entry.is_sensitive).toBe(false);
      // Verify INSERT was called
      expect(mockQuery.mock.calls[0][0]).toContain('INSERT INTO audit_logs');
    });

    it('should flag sensitive actions automatically', async () => {
      const sensitiveRow = { ...baseLogRow, action: 'view_user_data', is_sensitive: true };
      mockQuery.mockResolvedValueOnce({ rows: [sensitiveRow] });
      // suspicious check queries (unusual_data_access rule matches)
      mockQuery.mockResolvedValueOnce({ rows: [{ cnt: '0' }] });

      const entry = await service.log({
        tenant_id: tenantId,
        user_id: userId,
        action: 'view_user_data',
        resource_type: 'user',
        resource_id: 'target-user-1',
      });

      expect(entry.is_sensitive).toBe(true);
      // Verify is_sensitive param was passed as true
      const insertParams = mockQuery.mock.calls[0][1];
      expect(insertParams[8]).toBe(true); // is_sensitive param
    });

    it('should handle missing optional fields', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...baseLogRow, tenant_id: null, ip_address: null, user_agent: null, changes: null }],
      });

      const entry = await service.log({
        user_id: userId,
        action: 'system_action',
        resource_type: 'system',
        resource_id: 'sys-1',
      });

      expect(entry.tenant_id).toBeNull();
    });
  });

  // ── logSensitiveAccess ──────────────────────────────────────

  describe('logSensitiveAccess', () => {
    it('should log with view_user_data action', async () => {
      const sensitiveRow = { ...baseLogRow, action: 'view_user_data', is_sensitive: true };
      mockQuery.mockResolvedValueOnce({ rows: [sensitiveRow] });
      mockQuery.mockResolvedValueOnce({ rows: [{ cnt: '0' }] });

      const entry = await service.logSensitiveAccess({
        tenant_id: tenantId,
        user_id: userId,
        resource_type: 'user',
        resource_id: 'target-user-1',
      });

      expect(entry.action).toBe('view_user_data');
      expect(entry.is_sensitive).toBe(true);
    });
  });

  // ── search ──────────────────────────────────────────────────

  describe('search', () => {
    it('should return paginated results with no filters', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '2' }] });
      mockQuery.mockResolvedValueOnce({ rows: [baseLogRow, { ...baseLogRow, id: 'log-2' }] });

      const result = await service.search({});
      expect(result.total).toBe(2);
      expect(result.logs).toHaveLength(2);
    });

    it('should filter by tenant_id', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '1' }] });
      mockQuery.mockResolvedValueOnce({ rows: [baseLogRow] });

      const result = await service.search({ tenant_id: tenantId });
      expect(result.total).toBe(1);
      expect(mockQuery.mock.calls[0][0]).toContain('tenant_id');
    });

    it('should filter by date range', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '1' }] });
      mockQuery.mockResolvedValueOnce({ rows: [baseLogRow] });

      const result = await service.search({
        start_date: new Date('2024-01-01'),
        end_date: new Date('2024-12-31'),
      });

      expect(result.total).toBe(1);
      const countQuery = mockQuery.mock.calls[0][0];
      expect(countQuery).toContain('timestamp >=');
      expect(countQuery).toContain('timestamp <=');
    });

    it('should filter by action and resource_type', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '1' }] });
      mockQuery.mockResolvedValueOnce({ rows: [baseLogRow] });

      await service.search({ action: 'add_user', resource_type: 'user' });

      const countQuery = mockQuery.mock.calls[0][0];
      expect(countQuery).toContain('action');
      expect(countQuery).toContain('resource_type');
    });

    it('should filter by is_sensitive and is_suspicious', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '0' }] });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await service.search({ is_sensitive: true, is_suspicious: false });

      const countQuery = mockQuery.mock.calls[0][0];
      expect(countQuery).toContain('is_sensitive');
      expect(countQuery).toContain('is_suspicious');
    });

    it('should use default limit and offset', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '0' }] });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await service.search({});

      const dataParams = mockQuery.mock.calls[1][1];
      expect(dataParams).toContain(50); // default limit
      expect(dataParams).toContain(0);  // default offset
    });
  });

  // ── exportCsv ───────────────────────────────────────────────

  describe('exportCsv', () => {
    it('should return CSV with header and data rows', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [baseLogRow] });

      const csv = await service.exportCsv({ tenant_id: tenantId });
      const lines = csv.split('\n');

      expect(lines[0]).toBe(
        'id,tenant_id,user_id,action,resource_type,resource_id,ip_address,timestamp,is_sensitive,is_suspicious,suspicious_reason',
      );
      expect(lines).toHaveLength(2);
      expect(lines[1]).toContain('log-1');
      expect(lines[1]).toContain('add_user');
    });

    it('should return only header when no logs', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const csv = await service.exportCsv({});
      const lines = csv.split('\n');
      expect(lines).toHaveLength(1);
    });

    it('should escape CSV values with commas', async () => {
      const rowWithComma = { ...baseLogRow, action: 'action,with,commas' };
      mockQuery.mockResolvedValueOnce({ rows: [rowWithComma] });

      const csv = await service.exportCsv({});
      expect(csv).toContain('"action,with,commas"');
    });
  });

  // ── checkSuspiciousActivity ─────────────────────────────────

  describe('checkSuspiciousActivity', () => {
    it('should not flag when count is below threshold', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ cnt: '2' }] });

      const flagged = await service.checkSuspiciousActivity(userId, 'failed_login');
      expect(flagged).toBe(false);
    });

    it('should flag when failed_login count exceeds threshold', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ cnt: '10' }] });
      mockQuery.mockResolvedValueOnce({ rows: [] }); // UPDATE

      const flagged = await service.checkSuspiciousActivity(userId, 'failed_login');
      expect(flagged).toBe(true);
      // Verify UPDATE was called to flag the entry
      expect(mockQuery.mock.calls[1][0]).toContain('is_suspicious = TRUE');
    });

    it('should flag unusual data access volume', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ cnt: '50' }] });
      mockQuery.mockResolvedValueOnce({ rows: [] }); // UPDATE

      const flagged = await service.checkSuspiciousActivity(userId, 'view_user_data');
      expect(flagged).toBe(true);
    });

    it('should not flag unrelated actions', async () => {
      const flagged = await service.checkSuspiciousActivity(userId, 'update_branding');
      expect(flagged).toBe(false);
      expect(mockQuery).not.toHaveBeenCalled();
    });
  });

  // ── getSuspiciousActivity ───────────────────────────────────

  describe('getSuspiciousActivity', () => {
    it('should search with is_suspicious filter', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '1' }] });
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...baseLogRow, is_suspicious: true, suspicious_reason: 'Multiple failed login attempts' }],
      });

      const result = await service.getSuspiciousActivity({ tenant_id: tenantId });
      expect(result.total).toBe(1);
      expect(result.logs[0].is_suspicious).toBe(true);
    });
  });

  // ── retention ───────────────────────────────────────────────

  describe('retention', () => {
    it('should return 3 years retention period', () => {
      expect(service.getRetentionYears()).toBe(3);
      expect(AUDIT_RETENTION_YEARS).toBe(3);
    });

    it('should return a cutoff date 3 years in the past', () => {
      const cutoff = service.getRetentionCutoffDate();
      const threeYearsAgo = new Date();
      threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);

      // Allow 1 second tolerance
      expect(Math.abs(cutoff.getTime() - threeYearsAgo.getTime())).toBeLessThan(1000);
    });
  });
});
