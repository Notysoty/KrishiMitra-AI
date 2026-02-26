import { CropService, CropError } from './CropService';
import { InputType, CropStatus } from '../../types';

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

describe('CropService', () => {
  const service = new CropService();
  const tenantId = 'tenant-1';
  const farmId = 'farm-1';

  beforeEach(() => {
    mockQuery.mockReset();
    mockRelease.mockReset();
  });

  /** Helper: mock a successful findById (farm exists) */
  function mockFarmExists() {
    mockQuery
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce(undefined) // SET LOCAL
      .mockResolvedValueOnce({ rows: [{ id: farmId, tenant_id: tenantId }] })
      .mockResolvedValueOnce(undefined); // COMMIT
  }

  /** Helper: mock a findById that returns no rows (farm not found) */
  function mockFarmNotFound() {
    mockQuery
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce(undefined);
  }

  /** Helper: mock the INSERT returning a row */
  function mockInsertReturning(row: Record<string, unknown>) {
    mockQuery
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce(undefined) // SET LOCAL
      .mockResolvedValueOnce({ rows: [row] })
      .mockResolvedValueOnce(undefined); // COMMIT
  }

  // ── addCrop ────────────────────────────────────────────────

  describe('addCrop', () => {
    const validInput = {
      crop_type: 'wheat',
      acreage: 2.5,
      planting_date: '2024-06-01',
      expected_harvest_date: '2024-10-15',
    };

    it('should add a crop to an existing farm', async () => {
      mockFarmExists();
      mockInsertReturning({
        id: 'crop-1',
        farm_id: farmId,
        crop_type: 'wheat',
        variety: null,
        acreage: 2.5,
        planting_date: '2024-06-01',
        expected_harvest_date: '2024-10-15',
        status: 'planned',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      const crop = await service.addCrop(tenantId, farmId, validInput);
      expect(crop.id).toBe('crop-1');
      expect(crop.crop_type).toBe('wheat');
    });

    it('should throw 404 when farm does not exist', async () => {
      mockFarmNotFound();
      await expect(service.addCrop(tenantId, 'no-farm', validInput)).rejects.toThrow('Farm not found');
    });

    it('should reject empty crop_type', async () => {
      mockFarmExists();
      await expect(
        service.addCrop(tenantId, farmId, { ...validInput, crop_type: '  ' })
      ).rejects.toThrow('crop_type is required');
    });

    it('should reject zero acreage', async () => {
      mockFarmExists();
      await expect(
        service.addCrop(tenantId, farmId, { ...validInput, acreage: 0 })
      ).rejects.toThrow('acreage must be greater than 0');
    });

    it('should reject missing planting_date', async () => {
      mockFarmExists();
      await expect(
        service.addCrop(tenantId, farmId, { ...validInput, planting_date: '' })
      ).rejects.toThrow('planting_date is required');
    });

    it('should reject invalid status', async () => {
      mockFarmExists();
      await expect(
        service.addCrop(tenantId, farmId, { ...validInput, status: 'invalid' as CropStatus })
      ).rejects.toThrow('Invalid status');
    });
  });

  // ── logInput ───────────────────────────────────────────────

  describe('logInput', () => {
    const validInput = {
      input_type: InputType.WATER,
      quantity: 500,
      unit: 'liters',
      date: '2024-07-01',
    };

    it('should log an input for an existing farm', async () => {
      mockFarmExists();
      mockInsertReturning({
        id: 'input-1',
        farm_id: farmId,
        crop_id: null,
        input_type: 'water',
        quantity: 500,
        unit: 'liters',
        cost: null,
        date: '2024-07-01',
        notes: null,
        created_at: new Date().toISOString(),
      });

      const log = await service.logInput(tenantId, farmId, validInput);
      expect(log.id).toBe('input-1');
      expect(log.input_type).toBe('water');
    });

    it('should throw 404 when farm does not exist', async () => {
      mockFarmNotFound();
      await expect(service.logInput(tenantId, 'no-farm', validInput)).rejects.toThrow('Farm not found');
    });

    it('should reject invalid input_type', async () => {
      mockFarmExists();
      await expect(
        service.logInput(tenantId, farmId, { ...validInput, input_type: 'seeds' as InputType })
      ).rejects.toThrow('Invalid input_type');
    });

    it('should reject invalid unit for input_type', async () => {
      mockFarmExists();
      await expect(
        service.logInput(tenantId, farmId, { ...validInput, unit: 'tonnes' })
      ).rejects.toThrow("Invalid unit 'tonnes' for input_type 'water'");
    });

    it('should accept valid units for fertilizer', async () => {
      mockFarmExists();
      mockInsertReturning({
        id: 'input-2',
        farm_id: farmId,
        input_type: 'fertilizer',
        quantity: 10,
        unit: 'kg',
        date: '2024-07-01',
        created_at: new Date().toISOString(),
      });

      const log = await service.logInput(tenantId, farmId, {
        input_type: InputType.FERTILIZER,
        quantity: 10,
        unit: 'kg',
        date: '2024-07-01',
      });
      expect(log.input_type).toBe('fertilizer');
    });

    it('should reject zero quantity', async () => {
      mockFarmExists();
      await expect(
        service.logInput(tenantId, farmId, { ...validInput, quantity: 0 })
      ).rejects.toThrow('quantity must be greater than 0');
    });

    it('should reject negative cost', async () => {
      mockFarmExists();
      await expect(
        service.logInput(tenantId, farmId, { ...validInput, cost: -10 })
      ).rejects.toThrow('cost cannot be negative');
    });

    it('should reject missing date', async () => {
      mockFarmExists();
      await expect(
        service.logInput(tenantId, farmId, { ...validInput, date: '' })
      ).rejects.toThrow('date is required');
    });
  });

  // ── recordYield ────────────────────────────────────────────

  describe('recordYield', () => {
    const validInput = {
      crop_id: 'crop-1',
      quantity: 100,
      unit: 'kg',
      harvest_date: '2024-10-20',
    };

    it('should record yield for an existing farm', async () => {
      mockFarmExists();
      mockInsertReturning({
        id: 'yield-1',
        farm_id: farmId,
        crop_id: 'crop-1',
        quantity: 100,
        unit: 'kg',
        harvest_date: '2024-10-20',
        quality_grade: null,
        created_at: new Date().toISOString(),
      });

      const record = await service.recordYield(tenantId, farmId, validInput);
      expect(record.id).toBe('yield-1');
      expect(record.quantity).toBe(100);
    });

    it('should throw 404 when farm does not exist', async () => {
      mockFarmNotFound();
      await expect(service.recordYield(tenantId, 'no-farm', validInput)).rejects.toThrow('Farm not found');
    });

    it('should reject missing crop_id', async () => {
      mockFarmExists();
      await expect(
        service.recordYield(tenantId, farmId, { ...validInput, crop_id: '' })
      ).rejects.toThrow('crop_id is required');
    });

    it('should reject zero quantity', async () => {
      mockFarmExists();
      await expect(
        service.recordYield(tenantId, farmId, { ...validInput, quantity: 0 })
      ).rejects.toThrow('quantity must be greater than 0');
    });

    it('should reject invalid unit', async () => {
      mockFarmExists();
      await expect(
        service.recordYield(tenantId, farmId, { ...validInput, unit: 'liters' })
      ).rejects.toThrow('Invalid unit');
    });

    it('should reject missing harvest_date', async () => {
      mockFarmExists();
      await expect(
        service.recordYield(tenantId, farmId, { ...validInput, harvest_date: '' })
      ).rejects.toThrow('harvest_date is required');
    });
  });
});
