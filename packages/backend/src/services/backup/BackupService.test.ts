import {
  BackupService,
  BackupError,
  BACKUP_RETENTION_DAYS,
  RTO_HOURS,
  RPO_HOURS,
} from './BackupService';

// ── Mock pg Pool ───────────────────────────────────────────────
const mockQuery = jest.fn();

jest.mock('../../db/pool', () => ({
  getPool: () => ({ query: mockQuery }),
}));

// ── Mock AuditService ──────────────────────────────────────────
const mockAuditLog = jest.fn().mockResolvedValue({});

jest.mock('../admin/AuditService', () => ({
  AuditService: jest.fn().mockImplementation(() => ({
    log: mockAuditLog,
  })),
}));

// ── Helpers ────────────────────────────────────────────────────

function makeBackupRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'backup-1',
    type: 'rds_snapshot',
    status: 'completed',
    region: 'ap-south-1',
    source: 'krishimitra-prod-db',
    size_bytes: 1024 * 1024 * 500,
    created_at: new Date().toISOString(),
    verified_at: null,
    error: null,
    metadata: JSON.stringify({ snapshot_id: 'rds:snap-abc123' }),
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────

describe('BackupService', () => {
  let service: BackupService;

  beforeEach(() => {
    service = new BackupService();
    mockQuery.mockReset();
    mockAuditLog.mockReset();
    mockAuditLog.mockResolvedValue({});
  });

  // ── constants ────────────────────────────────────────────────

  describe('constants', () => {
    it('should have 30-day retention period', () => {
      expect(BACKUP_RETENTION_DAYS).toBe(30);
    });

    it('should have 8-hour RTO target', () => {
      expect(RTO_HOURS).toBe(8);
    });

    it('should have 12-hour RPO target', () => {
      expect(RPO_HOURS).toBe(12);
    });
  });

  // ── verifyBackupIntegrity ────────────────────────────────────

  describe('verifyBackupIntegrity', () => {
    it('should return valid result for a healthy completed backup', async () => {
      const row = makeBackupRow();
      mockQuery
        .mockResolvedValueOnce({ rows: [row] })   // SELECT backup
        .mockResolvedValueOnce({ rows: [] });      // UPDATE verified_at

      const result = await service.verifyBackupIntegrity('backup-1');

      expect(result.backup_id).toBe('backup-1');
      expect(result.valid).toBe(true);
      expect(result.checks_passed).toContain('record_exists');
      expect(result.checks_passed).toContain('status_not_failed');
      expect(result.checks_passed).toContain('within_retention_window');
      expect(result.checks_passed).toContain('region_specified');
      expect(result.checks_passed).toContain('metadata_present');
      expect(result.checks_failed).toHaveLength(0);
      expect(result.verified_at).toBeInstanceOf(Date);
    });

    it('should return invalid result for a failed backup', async () => {
      const row = makeBackupRow({ status: 'failed', error: 'Snapshot timed out' });
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      const result = await service.verifyBackupIntegrity('backup-1');

      expect(result.valid).toBe(false);
      expect(result.checks_failed).toContain('status_not_failed');
    });

    it('should fail the retention check for an old backup', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 35); // 35 days ago
      const row = makeBackupRow({ created_at: oldDate.toISOString() });
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      const result = await service.verifyBackupIntegrity('backup-1');

      expect(result.valid).toBe(false);
      expect(result.checks_failed).toContain('within_retention_window');
    });

    it('should fail when region is missing', async () => {
      const row = makeBackupRow({ region: '' });
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      const result = await service.verifyBackupIntegrity('backup-1');

      expect(result.valid).toBe(false);
      expect(result.checks_failed).toContain('region_specified');
    });

    it('should throw BackupError when backup is not found', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await expect(service.verifyBackupIntegrity('nonexistent')).rejects.toThrow(BackupError);
      await expect(service.verifyBackupIntegrity('nonexistent')).rejects.toThrow('Backup not found');
    });

    it('should update status to verified when all checks pass', async () => {
      const row = makeBackupRow();
      mockQuery
        .mockResolvedValueOnce({ rows: [row] })
        .mockResolvedValueOnce({ rows: [] }); // UPDATE

      await service.verifyBackupIntegrity('backup-1');

      const updateCall = mockQuery.mock.calls.find(
        (call: unknown[]) =>
          typeof call[0] === 'string' && (call[0] as string).includes("status = 'verified'"),
      );
      expect(updateCall).toBeDefined();
    });

    it('should log the verification event to the audit trail', async () => {
      const row = makeBackupRow();
      mockQuery
        .mockResolvedValueOnce({ rows: [row] })
        .mockResolvedValueOnce({ rows: [] });

      await service.verifyBackupIntegrity('backup-1');

      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'backup_integrity_verified',
          resource_type: 'backup',
          resource_id: 'backup-1',
        }),
      );
    });
  });

  // ── listRecentBackups ────────────────────────────────────────

  describe('listRecentBackups', () => {
    it('should return backups from the last N days', async () => {
      const rows = [makeBackupRow({ id: 'b-1' }), makeBackupRow({ id: 'b-2' })];
      mockQuery.mockResolvedValueOnce({ rows });

      const result = await service.listRecentBackups(7);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('b-1');
      expect(result[1].id).toBe('b-2');
    });

    it('should return empty array when no recent backups exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await service.listRecentBackups(7);
      expect(result).toHaveLength(0);
    });

    it('should throw BackupError when days is less than 1', async () => {
      await expect(service.listRecentBackups(0)).rejects.toThrow(BackupError);
      await expect(service.listRecentBackups(0)).rejects.toThrow('days must be between 1');
    });

    it('should throw BackupError when days exceeds retention period', async () => {
      await expect(service.listRecentBackups(BACKUP_RETENTION_DAYS + 1)).rejects.toThrow(BackupError);
    });

    it('should accept exactly 30 days (retention boundary)', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await expect(service.listRecentBackups(BACKUP_RETENTION_DAYS)).resolves.toEqual([]);
    });

    it('should parse metadata JSON from DB rows', async () => {
      const row = makeBackupRow({ metadata: JSON.stringify({ snapshot_id: 'snap-xyz' }) });
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      const result = await service.listRecentBackups(7);
      expect(result[0].metadata).toEqual({ snapshot_id: 'snap-xyz' });
    });
  });

  // ── validateDataConsistency ──────────────────────────────────

  describe('validateDataConsistency', () => {
    it('should return healthy when all checks pass', async () => {
      // SELECT 1 + 4 table COUNT queries + orphan check
      mockQuery
        .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] })  // SELECT 1
        .mockResolvedValueOnce({ rows: [{ count: '5' }] })      // tenants
        .mockResolvedValueOnce({ rows: [{ count: '10' }] })     // users
        .mockResolvedValueOnce({ rows: [{ count: '3' }] })      // farms
        .mockResolvedValueOnce({ rows: [{ count: '8' }] })      // conversations
        .mockResolvedValueOnce({ rows: [{ cnt: '0' }] });       // orphan check

      const result = await service.validateDataConsistency();

      expect(result.healthy).toBe(true);
      expect(result.checks.every((c) => c.passed)).toBe(true);
      expect(result.checked_at).toBeInstanceOf(Date);
    });

    it('should return unhealthy when DB connection fails', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Connection refused'));
      // remaining queries succeed
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [{ cnt: '0' }] });

      const result = await service.validateDataConsistency();

      expect(result.healthy).toBe(false);
      const dbCheck = result.checks.find((c) => c.name === 'db_connection');
      expect(dbCheck?.passed).toBe(false);
      expect(dbCheck?.detail).toContain('Connection refused');
    });

    it('should detect orphaned users', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] })
        .mockResolvedValueOnce({ rows: [{ count: '5' }] })
        .mockResolvedValueOnce({ rows: [{ count: '10' }] })
        .mockResolvedValueOnce({ rows: [{ count: '3' }] })
        .mockResolvedValueOnce({ rows: [{ count: '8' }] })
        .mockResolvedValueOnce({ rows: [{ cnt: '3' }] }); // 3 orphans

      const result = await service.validateDataConsistency();

      expect(result.healthy).toBe(false);
      const orphanCheck = result.checks.find((c) => c.name === 'no_orphaned_users');
      expect(orphanCheck?.passed).toBe(false);
      expect(orphanCheck?.detail).toContain('3 orphaned user(s)');
    });

    it('should log the consistency check to the audit trail', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [{ cnt: '0' }] });

      await service.validateDataConsistency();

      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'data_consistency_validated',
          resource_type: 'database',
        }),
      );
    });
  });

  // ── recordBackup ─────────────────────────────────────────────

  describe('recordBackup', () => {
    it('should insert a new backup record with pending status', async () => {
      const row = makeBackupRow({ status: 'pending' });
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      const result = await service.recordBackup({
        type: 'rds_snapshot',
        region: 'ap-south-1',
        source: 'krishimitra-prod-db',
      });

      expect(result.status).toBe('pending');
      const insertCall = mockQuery.mock.calls[0];
      expect(insertCall[0]).toContain('INSERT INTO backup_records');
      expect(insertCall[1]).toContain('rds_snapshot');
    });

    it('should log backup_recorded to audit trail', async () => {
      const row = makeBackupRow({ status: 'pending' });
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      await service.recordBackup({
        type: 's3_object',
        region: 'us-east-1',
        source: 'krishimitra-backups-bucket',
      });

      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'backup_recorded',
          resource_type: 'backup',
        }),
      );
    });
  });

  // ── updateBackupStatus ───────────────────────────────────────

  describe('updateBackupStatus', () => {
    it('should update status to completed', async () => {
      const row = makeBackupRow({ status: 'completed' });
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      const result = await service.updateBackupStatus('backup-1', 'completed');
      expect(result.status).toBe('completed');
    });

    it('should update status to failed with error message', async () => {
      const row = makeBackupRow({ status: 'failed', error: 'Timeout' });
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      const result = await service.updateBackupStatus('backup-1', 'failed', 'Timeout');
      expect(result.status).toBe('failed');
    });

    it('should throw BackupError when backup not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(service.updateBackupStatus('nonexistent', 'completed')).rejects.toThrow(
        BackupError,
      );
    });

    it('should log status update to audit trail', async () => {
      const row = makeBackupRow({ status: 'completed' });
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      await service.updateBackupStatus('backup-1', 'completed');

      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'backup_status_updated',
          resource_type: 'backup',
          resource_id: 'backup-1',
        }),
      );
    });
  });
});
