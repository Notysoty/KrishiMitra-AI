import { BaseRepository } from '../../db/BaseRepository';
import { Crop, InputLog, YieldRecord, InputType, CropStatus } from '../../types';

// ── Valid units per input type ─────────────────────────────────
const VALID_UNITS: Record<InputType, string[]> = {
  [InputType.WATER]: ['liters', 'gallons', 'cubic_meters'],
  [InputType.FERTILIZER]: ['kg', 'liters', 'bags'],
  [InputType.PESTICIDE]: ['liters', 'kg', 'ml'],
  [InputType.LABOR]: ['hours', 'days', 'person_days'],
};

const VALID_YIELD_UNITS = ['kg', 'quintals', 'tonnes', 'bags'];

// ── Input types ────────────────────────────────────────────────
export interface CreateCropInput {
  crop_type: string;
  variety?: string;
  acreage: number;
  planting_date: string;
  expected_harvest_date?: string;
  status?: CropStatus;
}

export interface CreateInputLogInput {
  crop_id?: string;
  input_type: InputType;
  quantity: number;
  unit: string;
  cost?: number;
  date: string;
  notes?: string;
}

export interface CreateYieldRecordInput {
  crop_id: string;
  quantity: number;
  unit: string;
  harvest_date: string;
  quality_grade?: string;
}

// ── CropService ────────────────────────────────────────────────
export class CropService {
  private cropRepo = new BaseRepository('crops');
  private inputRepo = new BaseRepository('input_logs');
  private yieldRepo = new BaseRepository('yield_records');
  private farmRepo = new BaseRepository('farms');

  /** Verify the farm exists within the tenant scope. */
  private async assertFarmExists(tenantId: string, farmId: string): Promise<void> {
    const farm = await this.farmRepo.findById(tenantId, farmId);
    if (!farm) {
      throw new CropError('Farm not found.', 404);
    }
  }

  // ── Crops ──────────────────────────────────────────────────

  async addCrop(tenantId: string, farmId: string, input: CreateCropInput): Promise<Crop> {
    await this.assertFarmExists(tenantId, farmId);

    if (!input.crop_type?.trim()) {
      throw new CropError('crop_type is required.', 400);
    }
    if (input.acreage == null || input.acreage <= 0) {
      throw new CropError('acreage must be greater than 0.', 400);
    }
    if (!input.planting_date) {
      throw new CropError('planting_date is required.', 400);
    }

    const status = input.status ?? CropStatus.PLANNED;
    const validStatuses = Object.values(CropStatus);
    if (!validStatuses.includes(status)) {
      throw new CropError(`Invalid status. Must be one of: ${validStatuses.join(', ')}`, 400);
    }

    const result = await this.cropRepo.query<Crop>(
      tenantId,
      `INSERT INTO crops (farm_id, crop_type, variety, acreage, planting_date, expected_harvest_date, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        farmId,
        input.crop_type.trim(),
        input.variety?.trim() || null,
        input.acreage,
        input.planting_date,
        input.expected_harvest_date || null,
        status,
      ],
    );

    return result.rows[0];
  }

  // ── Input Logs ─────────────────────────────────────────────

  async logInput(tenantId: string, farmId: string, input: CreateInputLogInput): Promise<InputLog> {
    await this.assertFarmExists(tenantId, farmId);

    // Validate input_type
    const validTypes = Object.values(InputType);
    if (!validTypes.includes(input.input_type)) {
      throw new CropError(`Invalid input_type. Must be one of: ${validTypes.join(', ')}`, 400);
    }

    // Validate unit for the given input_type
    const allowedUnits = VALID_UNITS[input.input_type];
    if (!allowedUnits.includes(input.unit)) {
      throw new CropError(
        `Invalid unit '${input.unit}' for input_type '${input.input_type}'. Allowed: ${allowedUnits.join(', ')}`,
        400,
      );
    }

    if (input.quantity == null || input.quantity <= 0) {
      throw new CropError('quantity must be greater than 0.', 400);
    }
    if (!input.date) {
      throw new CropError('date is required.', 400);
    }
    if (input.cost !== undefined && input.cost < 0) {
      throw new CropError('cost cannot be negative.', 400);
    }

    const result = await this.inputRepo.query<InputLog>(
      tenantId,
      `INSERT INTO input_logs (farm_id, crop_id, input_type, quantity, unit, cost, date, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        farmId,
        input.crop_id || null,
        input.input_type,
        input.quantity,
        input.unit,
        input.cost ?? null,
        input.date,
        input.notes?.trim() || null,
      ],
    );

    return result.rows[0];
  }

  // ── Yield Records ──────────────────────────────────────────

  async recordYield(tenantId: string, farmId: string, input: CreateYieldRecordInput): Promise<YieldRecord> {
    await this.assertFarmExists(tenantId, farmId);

    if (!input.crop_id) {
      throw new CropError('crop_id is required.', 400);
    }
    if (input.quantity == null || input.quantity <= 0) {
      throw new CropError('quantity must be greater than 0.', 400);
    }
    if (!VALID_YIELD_UNITS.includes(input.unit)) {
      throw new CropError(`Invalid unit. Must be one of: ${VALID_YIELD_UNITS.join(', ')}`, 400);
    }
    if (!input.harvest_date) {
      throw new CropError('harvest_date is required.', 400);
    }

    const result = await this.yieldRepo.query<YieldRecord>(
      tenantId,
      `INSERT INTO yield_records (farm_id, crop_id, quantity, unit, harvest_date, quality_grade)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        farmId,
        input.crop_id,
        input.quantity,
        input.unit,
        input.harvest_date,
        input.quality_grade?.trim() || null,
      ],
    );

    return result.rows[0];
  }
}

// ── CropError ──────────────────────────────────────────────────
export class CropError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number = 400) {
    super(message);
    this.name = 'CropError';
    this.statusCode = statusCode;
  }
}
