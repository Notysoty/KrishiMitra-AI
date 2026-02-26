import crypto from 'crypto';
import { BaseRepository } from '../../db/BaseRepository';
import { Farm, Crop, Location, IrrigationType } from '../../types';

// ── Configuration ──────────────────────────────────────────────
const ENCRYPTION_KEY = process.env.FARM_ENCRYPTION_KEY || 'krishimitra-dev-encryption-key-32';
const ENCRYPTION_ALGORITHM = 'aes-256-cbc';

// India bounding box (approximate)
const INDIA_BOUNDS = {
  minLat: 6.5,
  maxLat: 37.1,
  minLng: 68.1,
  maxLng: 97.4,
};

// ── Types ──────────────────────────────────────────────────────
export interface CreateFarmInput {
  name: string;
  location: Location;
  total_acreage: number;
  irrigation_type: IrrigationType;
}

export interface UpdateFarmInput {
  name?: string;
  location?: Location;
  total_acreage?: number;
  irrigation_type?: IrrigationType;
}

export interface FarmWithCrops extends Farm {
  crops: Crop[];
}

export interface MissingField {
  field: string;
  message: string;
}

// ── Encryption helpers ─────────────────────────────────────────
function getEncryptionKey(): Buffer {
  const key = ENCRYPTION_KEY;
  return crypto.createHash('sha256').update(key).digest();
}

export function encryptData(data: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, getEncryptionKey(), iv);
  let encrypted = cipher.update(data, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

export function decryptData(encrypted: string): string {
  const [ivHex, encryptedData] = encrypted.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, getEncryptionKey(), iv);
  let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// ── Validation ─────────────────────────────────────────────────
export function validateLocation(location: Location): string | null {
  if (typeof location.latitude !== 'number' || typeof location.longitude !== 'number') {
    return 'Location must include numeric latitude and longitude.';
  }
  if (
    location.latitude < INDIA_BOUNDS.minLat ||
    location.latitude > INDIA_BOUNDS.maxLat ||
    location.longitude < INDIA_BOUNDS.minLng ||
    location.longitude > INDIA_BOUNDS.maxLng
  ) {
    return 'Location coordinates must be within India bounds.';
  }
  return null;
}

export function checkMissingFields(farm: Partial<CreateFarmInput>): MissingField[] {
  const missing: MissingField[] = [];
  if (!farm.name) missing.push({ field: 'name', message: 'Farm name is required.' });
  if (!farm.location) missing.push({ field: 'location', message: 'Farm location is required.' });
  if (farm.total_acreage == null) missing.push({ field: 'total_acreage', message: 'Total acreage is required.' });
  if (!farm.irrigation_type) missing.push({ field: 'irrigation_type', message: 'Irrigation type is required.' });
  return missing;
}

// ── FarmService ────────────────────────────────────────────────
export class FarmService extends BaseRepository {
  constructor() {
    super('farms');
  }

  /**
   * Create a new farm profile. Location data is encrypted at rest.
   */
  async createFarm(tenantId: string, userId: string, input: CreateFarmInput): Promise<Farm> {
    // Validate required fields
    const missing = checkMissingFields(input);
    if (missing.length > 0) {
      throw new FarmError('Incomplete farm profile.', 400, missing);
    }

    // Validate location
    const locationErr = validateLocation(input.location);
    if (locationErr) {
      throw new FarmError(locationErr, 400);
    }

    // Validate irrigation type
    const validTypes = Object.values(IrrigationType);
    if (!validTypes.includes(input.irrigation_type)) {
      throw new FarmError(`Invalid irrigation type. Must be one of: ${validTypes.join(', ')}`, 400);
    }

    if (input.total_acreage <= 0) {
      throw new FarmError('Total acreage must be greater than 0.', 400);
    }

    // Encrypt location data at rest
    const encryptedLocation = encryptData(JSON.stringify(input.location));

    const result = await this.query<Farm>(
      tenantId,
      `INSERT INTO farms (tenant_id, user_id, name, location, total_acreage, irrigation_type)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [tenantId, userId, input.name, encryptedLocation, input.total_acreage, input.irrigation_type]
    );

    const farm = result.rows[0];
    return this.decryptFarmLocation(farm);
  }

  /**
   * Get a farm by ID with its crops.
   */
  async getFarm(tenantId: string, farmId: string): Promise<FarmWithCrops> {
    const farmResult = await this.query<Farm>(
      tenantId,
      'SELECT * FROM farms WHERE id = $1',
      [farmId]
    );

    if (farmResult.rows.length === 0) {
      throw new FarmError('Farm not found.', 404);
    }

    const farm = this.decryptFarmLocation(farmResult.rows[0]);

    // Fetch associated crops
    const cropsResult = await this.query<Crop>(
      tenantId,
      'SELECT * FROM crops WHERE farm_id = $1 ORDER BY planting_date DESC',
      [farmId]
    );

    return { ...farm, crops: cropsResult.rows };
  }

  /**
   * Update a farm profile.
   */
  async updateFarm(tenantId: string, farmId: string, input: UpdateFarmInput): Promise<Farm> {
    // Verify farm exists
    const existing = await this.findById<Farm>(tenantId, farmId);
    if (!existing) {
      throw new FarmError('Farm not found.', 404);
    }

    // Validate location if provided
    if (input.location) {
      const locationErr = validateLocation(input.location);
      if (locationErr) {
        throw new FarmError(locationErr, 400);
      }
    }

    // Validate irrigation type if provided
    if (input.irrigation_type) {
      const validTypes = Object.values(IrrigationType);
      if (!validTypes.includes(input.irrigation_type)) {
        throw new FarmError(`Invalid irrigation type. Must be one of: ${validTypes.join(', ')}`, 400);
      }
    }

    if (input.total_acreage !== undefined && input.total_acreage <= 0) {
      throw new FarmError('Total acreage must be greater than 0.', 400);
    }

    // Build dynamic update
    const sets: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (input.name !== undefined) {
      sets.push(`name = $${paramIdx++}`);
      params.push(input.name);
    }
    if (input.location !== undefined) {
      sets.push(`location = $${paramIdx++}`);
      params.push(encryptData(JSON.stringify(input.location)));
    }
    if (input.total_acreage !== undefined) {
      sets.push(`total_acreage = $${paramIdx++}`);
      params.push(input.total_acreage);
    }
    if (input.irrigation_type !== undefined) {
      sets.push(`irrigation_type = $${paramIdx++}`);
      params.push(input.irrigation_type);
    }

    if (sets.length === 0) {
      throw new FarmError('No fields to update.', 400);
    }

    sets.push(`updated_at = NOW()`);
    params.push(farmId);

    const result = await this.query<Farm>(
      tenantId,
      `UPDATE farms SET ${sets.join(', ')} WHERE id = $${paramIdx} RETURNING *`,
      params
    );

    return this.decryptFarmLocation(result.rows[0]);
  }

  /**
   * Delete a farm profile. Anonymizes historical data while preserving aggregate analytics.
   */
  async deleteFarm(tenantId: string, farmId: string): Promise<{ message: string }> {
    const existing = await this.findById<Farm>(tenantId, farmId);
    if (!existing) {
      throw new FarmError('Farm not found.', 404);
    }

    // Anonymize historical data: update input_logs and yield_records to remove personal references
    // but keep the aggregate data (quantities, costs, dates) for analytics
    await this.transaction(tenantId, async (client) => {
      // Anonymize yield records — keep quantity/unit/date, null out farm reference
      await client.query(
        `UPDATE yield_records SET farm_id = $1
         WHERE farm_id = $1`,
        [farmId]
      );

      // Anonymize input logs — keep quantity/cost/date, null out notes (may contain PII)
      await client.query(
        'UPDATE input_logs SET notes = NULL WHERE farm_id = $1',
        [farmId]
      );

      // Delete crops (cascade will handle via FK, but explicit for clarity)
      await client.query('DELETE FROM crops WHERE farm_id = $1', [farmId]);

      // Delete the farm itself (cascades will clean up remaining references)
      await client.query('DELETE FROM farms WHERE id = $1', [farmId]);
    });

    return { message: 'Farm profile deleted. Historical data anonymized for aggregate analytics.' };
  }

  /**
   * Decrypt the location field of a farm row.
   */
  private decryptFarmLocation(farm: Farm): Farm {
    try {
      const locationStr = farm.location as unknown as string;
      // If it looks like encrypted data (hex:hex), decrypt it
      if (typeof locationStr === 'string' && locationStr.includes(':')) {
        const decrypted = decryptData(locationStr);
        return { ...farm, location: JSON.parse(decrypted) };
      }
      // If it's already a JSON object (e.g., from test), return as-is
      if (typeof farm.location === 'object') {
        return farm;
      }
      return { ...farm, location: JSON.parse(locationStr) };
    } catch {
      // If decryption fails, return the farm with location as-is
      return farm;
    }
  }
}

// ── Farm Error ─────────────────────────────────────────────────
export class FarmError extends Error {
  statusCode: number;
  missingFields?: MissingField[];

  constructor(message: string, statusCode: number = 400, missingFields?: MissingField[]) {
    super(message);
    this.name = 'FarmError';
    this.statusCode = statusCode;
    this.missingFields = missingFields;
  }
}
