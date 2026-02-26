import {
  validateLocation,
  checkMissingFields,
  encryptData,
  decryptData,
  FarmService,
  FarmError,
} from './FarmService';
import { IrrigationType } from '../../types';

// ── Mock pg Pool ───────────────────────────────────────────────
const mockQuery = jest.fn();
const mockRelease = jest.fn();
const mockClient = { query: mockQuery, release: mockRelease };

jest.mock('../../db/pool', () => ({
  getPool: () => ({
    query: mockQuery,
    connect: jest.fn().mockResolvedValue(mockClient),
  }),
}));

describe('FarmService', () => {
  const service = new FarmService();
  const tenantId = 'tenant-1';
  const userId = 'user-1';

  beforeEach(() => {
    mockQuery.mockReset();
    mockRelease.mockReset();
  });

  // ── Validation helpers ─────────────────────────────────────

  describe('validateLocation', () => {
    it('should accept valid India coordinates', () => {
      expect(validateLocation({ latitude: 28.6, longitude: 77.2 })).toBeNull();
      expect(validateLocation({ latitude: 13.08, longitude: 80.27 })).toBeNull();
    });

    it('should reject coordinates outside India', () => {
      expect(validateLocation({ latitude: 51.5, longitude: -0.12 })).toContain('India bounds');
      expect(validateLocation({ latitude: 5.0, longitude: 77.0 })).toContain('India bounds');
      expect(validateLocation({ latitude: 28.6, longitude: 100.0 })).toContain('India bounds');
    });

    it('should reject non-numeric coordinates', () => {
      expect(validateLocation({ latitude: 'abc' as unknown as number, longitude: 77.2 })).toContain('numeric');
    });
  });

  describe('checkMissingFields', () => {
    it('should return empty array for complete input', () => {
      const result = checkMissingFields({
        name: 'My Farm',
        location: { latitude: 28.6, longitude: 77.2 },
        total_acreage: 5,
        irrigation_type: IrrigationType.DRIP,
      });
      expect(result).toEqual([]);
    });

    it('should list all missing fields', () => {
      const result = checkMissingFields({});
      expect(result).toHaveLength(4);
      expect(result.map((f) => f.field)).toEqual(['name', 'location', 'total_acreage', 'irrigation_type']);
    });
  });

  // ── Encryption ─────────────────────────────────────────────

  describe('encryptData / decryptData', () => {
    it('should round-trip encrypt and decrypt', () => {
      const original = JSON.stringify({ latitude: 28.6, longitude: 77.2 });
      const encrypted = encryptData(original);
      expect(encrypted).not.toBe(original);
      expect(encrypted).toContain(':');
      expect(decryptData(encrypted)).toBe(original);
    });
  });

  // ── createFarm ─────────────────────────────────────────────

  describe('createFarm', () => {
    const validInput = {
      name: 'Green Acres',
      location: { latitude: 28.6, longitude: 77.2, state: 'Delhi' },
      total_acreage: 5,
      irrigation_type: IrrigationType.DRIP,
    };

    it('should create a farm and return decrypted location', async () => {
      // BEGIN, SET LOCAL, INSERT, COMMIT
      mockQuery
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce(undefined) // SET LOCAL
        .mockResolvedValueOnce({
          rows: [{
            id: 'farm-1',
            tenant_id: tenantId,
            user_id: userId,
            name: 'Green Acres',
            location: JSON.stringify({ latitude: 28.6, longitude: 77.2, state: 'Delhi' }),
            total_acreage: 5,
            irrigation_type: 'drip',
            created_at: new Date(),
            updated_at: new Date(),
          }],
        })
        .mockResolvedValueOnce(undefined); // COMMIT

      const farm = await service.createFarm(tenantId, userId, validInput);
      expect(farm.name).toBe('Green Acres');
      expect(farm.id).toBe('farm-1');
    });

    it('should reject incomplete input with missing fields', async () => {
      await expect(
        service.createFarm(tenantId, userId, { name: '' } as any)
      ).rejects.toThrow(FarmError);

      try {
        await service.createFarm(tenantId, userId, {} as any);
      } catch (err) {
        expect(err).toBeInstanceOf(FarmError);
        expect((err as FarmError).missingFields).toBeDefined();
        expect((err as FarmError).missingFields!.length).toBeGreaterThan(0);
      }
    });

    it('should reject location outside India', async () => {
      await expect(
        service.createFarm(tenantId, userId, {
          ...validInput,
          location: { latitude: 51.5, longitude: -0.12 },
        })
      ).rejects.toThrow('India bounds');
    });

    it('should reject invalid irrigation type', async () => {
      await expect(
        service.createFarm(tenantId, userId, {
          ...validInput,
          irrigation_type: 'canal' as IrrigationType,
        })
      ).rejects.toThrow('Invalid irrigation type');
    });

    it('should reject zero or negative acreage', async () => {
      await expect(
        service.createFarm(tenantId, userId, { ...validInput, total_acreage: 0 })
      ).rejects.toThrow('greater than 0');
    });
  });

  // ── getFarm ────────────────────────────────────────────────

  describe('getFarm', () => {
    it('should return farm with crops', async () => {
      // Farm query
      mockQuery
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce(undefined) // SET LOCAL
        .mockResolvedValueOnce({
          rows: [{
            id: 'farm-1',
            tenant_id: tenantId,
            user_id: userId,
            name: 'Green Acres',
            location: { latitude: 28.6, longitude: 77.2 },
            total_acreage: 5,
            irrigation_type: 'drip',
            created_at: new Date(),
            updated_at: new Date(),
          }],
        })
        .mockResolvedValueOnce(undefined) // COMMIT
        // Crops query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce(undefined) // SET LOCAL
        .mockResolvedValueOnce({
          rows: [
            { id: 'crop-1', farm_id: 'farm-1', crop_type: 'wheat', status: 'planted' },
          ],
        })
        .mockResolvedValueOnce(undefined); // COMMIT

      const farm = await service.getFarm(tenantId, 'farm-1');
      expect(farm.name).toBe('Green Acres');
      expect(farm.crops).toHaveLength(1);
      expect(farm.crops[0].crop_type).toBe('wheat');
    });

    it('should throw 404 for non-existent farm', async () => {
      mockQuery
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce(undefined);

      await expect(service.getFarm(tenantId, 'nonexistent')).rejects.toThrow('Farm not found');
    });
  });

  // ── updateFarm ─────────────────────────────────────────────

  describe('updateFarm', () => {
    it('should update farm name', async () => {
      // findById
      mockQuery
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({
          rows: [{ id: 'farm-1', tenant_id: tenantId }],
        })
        .mockResolvedValueOnce(undefined)
        // update query
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({
          rows: [{
            id: 'farm-1',
            tenant_id: tenantId,
            name: 'Updated Farm',
            location: { latitude: 28.6, longitude: 77.2 },
            total_acreage: 5,
            irrigation_type: 'drip',
            created_at: new Date(),
            updated_at: new Date(),
          }],
        })
        .mockResolvedValueOnce(undefined);

      const farm = await service.updateFarm(tenantId, 'farm-1', { name: 'Updated Farm' });
      expect(farm.name).toBe('Updated Farm');
    });

    it('should throw 404 for non-existent farm', async () => {
      mockQuery
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce(undefined);

      await expect(
        service.updateFarm(tenantId, 'nonexistent', { name: 'X' })
      ).rejects.toThrow('Farm not found');
    });

    it('should reject empty update', async () => {
      mockQuery
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({ rows: [{ id: 'farm-1' }] })
        .mockResolvedValueOnce(undefined);

      await expect(
        service.updateFarm(tenantId, 'farm-1', {})
      ).rejects.toThrow('No fields to update');
    });
  });

  // ── deleteFarm ─────────────────────────────────────────────

  describe('deleteFarm', () => {
    it('should delete farm and anonymize data', async () => {
      // findById
      mockQuery
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({ rows: [{ id: 'farm-1' }] })
        .mockResolvedValueOnce(undefined)
        // transaction: BEGIN, SET LOCAL, anonymize yield, anonymize inputs, delete crops, delete farm, COMMIT
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce(undefined) // SET LOCAL
        .mockResolvedValueOnce(undefined) // UPDATE yield_records
        .mockResolvedValueOnce(undefined) // UPDATE input_logs
        .mockResolvedValueOnce(undefined) // DELETE crops
        .mockResolvedValueOnce(undefined) // DELETE farms
        .mockResolvedValueOnce(undefined); // COMMIT

      const result = await service.deleteFarm(tenantId, 'farm-1');
      expect(result.message).toContain('deleted');
      expect(result.message).toContain('anonymized');
    });

    it('should throw 404 for non-existent farm', async () => {
      mockQuery
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce(undefined);

      await expect(service.deleteFarm(tenantId, 'nonexistent')).rejects.toThrow('Farm not found');
    });
  });
});
