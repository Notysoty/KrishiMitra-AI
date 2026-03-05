import request from 'supertest';
import express from 'express';
import { EfficiencyRating, ConfidenceLevel, RiskLevel } from '../types/enums';

// ── Mock dependencies ──────────────────────────────────────────

const mockCalculateWaterEfficiency = jest.fn();
const mockCalculateInputEfficiency = jest.fn();
const mockCalculateClimateRiskIndex = jest.fn();
const mockGetSustainabilityInsights = jest.fn();

jest.mock('../services/sustainability', () => ({
  SustainabilityCalculator: jest.fn().mockImplementation(() => ({
    calculateWaterEfficiency: mockCalculateWaterEfficiency,
    calculateInputEfficiency: mockCalculateInputEfficiency,
    calculateClimateRiskIndex: mockCalculateClimateRiskIndex,
    getSustainabilityInsights: mockGetSustainabilityInsights,
  })),
  SustainabilityError: class SustainabilityError extends Error {
    statusCode: number;
    constructor(message: string, statusCode: number = 400) {
      super(message);
      this.name = 'SustainabilityError';
      this.statusCode = statusCode;
    }
  },
}));

jest.mock('../middleware/authenticate', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = { id: 'user-1', tenant_id: 'tenant-1', roles: ['farmer'], sessionId: 's1' };
    next();
  },
  AuthenticatedRequest: {},
}));

jest.mock('../middleware/rbac', () => ({
  requirePermissions: () => (_req: any, _res: any, next: any) => next(),
  Permission: {
    SUSTAINABILITY_VIEW: 'sustainability:view',
  },
}));

// Re-import the SustainabilityError from the mock so instanceof checks work
const { SustainabilityError } = jest.requireMock('../services/sustainability');

import sustainabilityRoutes from './sustainability';

const app = express();
app.use(express.json());
app.use('/api/v1/sustainability', sustainabilityRoutes);

describe('GET /api/v1/sustainability/water-efficiency/:farmId', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should return water efficiency data', async () => {
    mockCalculateWaterEfficiency.mockResolvedValue({
      liters_per_hectare: 3500,
      rating: EfficiencyRating.HIGH,
      explanation: 'Your water usage is 3500 liters/hectare, which is below the typical range of 3500-5500 liters/hectare for wheat',
      benchmark_range: { min: 3500, max: 5500 },
      confidence: ConfidenceLevel.HIGH,
      crop: 'wheat',
      total_water_liters: 14000,
      total_hectares: 4.05,
      data_points: 6,
    });

    const res = await request(app).get('/api/v1/sustainability/water-efficiency/farm-1');

    expect(res.status).toBe(200);
    expect(res.body.rating).toBe(EfficiencyRating.HIGH);
    expect(res.body.liters_per_hectare).toBe(3500);
    expect(res.body.explanation).toContain('liters/hectare');
    expect(res.body.confidence).toBe(ConfidenceLevel.HIGH);
    expect(res.body.crop).toBe('wheat');
    expect(mockCalculateWaterEfficiency).toHaveBeenCalledWith('tenant-1', 'farm-1');
  });

  it('should return conservation tips when included', async () => {
    mockCalculateWaterEfficiency.mockResolvedValue({
      liters_per_hectare: 9000,
      rating: EfficiencyRating.LOW,
      explanation: 'Your water usage is 9000 liters/hectare, which is above the typical range of 3500-5500 liters/hectare for wheat',
      benchmark_range: { min: 3500, max: 5500 },
      confidence: ConfidenceLevel.MEDIUM,
      crop: 'wheat',
      total_water_liters: 36000,
      total_hectares: 4.05,
      data_points: 3,
      conservation_tips: ['Consider switching to drip irrigation.'],
    });

    const res = await request(app).get('/api/v1/sustainability/water-efficiency/farm-1');

    expect(res.status).toBe(200);
    expect(res.body.rating).toBe(EfficiencyRating.LOW);
    expect(res.body.conservation_tips).toBeDefined();
    expect(res.body.conservation_tips.length).toBeGreaterThan(0);
  });

  it('should return 404 when farm not found', async () => {
    mockCalculateWaterEfficiency.mockRejectedValue(
      new SustainabilityError('Farm not found.', 404),
    );

    const res = await request(app).get('/api/v1/sustainability/water-efficiency/nonexistent');

    expect(res.status).toBe(404);
    expect(res.body.error).toContain('Farm not found');
  });

  it('should return 404 when no water data exists', async () => {
    mockCalculateWaterEfficiency.mockRejectedValue(
      new SustainabilityError('No water usage data found.', 404),
    );

    const res = await request(app).get('/api/v1/sustainability/water-efficiency/farm-1');

    expect(res.status).toBe(404);
    expect(res.body.error).toContain('No water usage data');
  });

  it('should return 500 on unexpected error', async () => {
    mockCalculateWaterEfficiency.mockRejectedValue(new Error('DB connection failed'));

    const res = await request(app).get('/api/v1/sustainability/water-efficiency/farm-1');

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Internal server error.');
  });
});

describe('GET /api/v1/sustainability/input-efficiency/:farmId', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should return input efficiency data', async () => {
    mockCalculateInputEfficiency.mockResolvedValue({
      cost_per_kg: 10,
      rating: EfficiencyRating.MEDIUM,
      explanation: 'Your input cost is ₹10.00 per kg, which is similar to the typical range of ₹8-14 per kg for wheat',
      benchmark_range: { min: 8, max: 14 },
      confidence: ConfidenceLevel.MEDIUM,
      crop: 'wheat',
      total_input_cost: 1000,
      total_yield_kg: 100,
      data_points: 3,
    });

    const res = await request(app).get('/api/v1/sustainability/input-efficiency/farm-1');

    expect(res.status).toBe(200);
    expect(res.body.cost_per_kg).toBe(10);
    expect(res.body.rating).toBe(EfficiencyRating.MEDIUM);
    expect(res.body.explanation).toContain('per kg');
    expect(res.body.crop).toBe('wheat');
    expect(mockCalculateInputEfficiency).toHaveBeenCalledWith('tenant-1', 'farm-1');
  });

  it('should return potential savings when included', async () => {
    mockCalculateInputEfficiency.mockResolvedValue({
      cost_per_kg: 20,
      rating: EfficiencyRating.LOW,
      explanation: 'Your input cost is ₹20.00 per kg',
      benchmark_range: { min: 8, max: 14 },
      confidence: ConfidenceLevel.LOW,
      crop: 'wheat',
      total_input_cost: 2000,
      total_yield_kg: 100,
      data_points: 1,
      potential_savings: 600,
    });

    const res = await request(app).get('/api/v1/sustainability/input-efficiency/farm-1');

    expect(res.status).toBe(200);
    expect(res.body.potential_savings).toBe(600);
  });

  it('should return 404 when farm not found', async () => {
    mockCalculateInputEfficiency.mockRejectedValue(
      new SustainabilityError('Farm not found.', 404),
    );

    const res = await request(app).get('/api/v1/sustainability/input-efficiency/nonexistent');

    expect(res.status).toBe(404);
    expect(res.body.error).toContain('Farm not found');
  });

  it('should return 500 on unexpected error', async () => {
    mockCalculateInputEfficiency.mockRejectedValue(new Error('DB error'));

    const res = await request(app).get('/api/v1/sustainability/input-efficiency/farm-1');

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Internal server error.');
  });
});

describe('GET /api/v1/sustainability/climate-risk/:farmId', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should return climate risk data', async () => {
    mockCalculateClimateRiskIndex.mockResolvedValue({
      risk_level: RiskLevel.HIGH,
      risks: [{ type: 'heavy_rainfall', severity: RiskLevel.HIGH, description: 'Heavy rainfall forecasted' }],
      recommendations: ['Ensure drainage channels are clear'],
      contributing_factors: ['Heavy rainfall forecasted'],
      forecast: [{ date: '2024-01-01', temperature: 30, rainfall: 150, wind_speed: 10, rainfall_probability: 90 }],
      last_updated: '2024-01-01T00:00:00.000Z',
      weather_available: true,
    });

    const res = await request(app).get('/api/v1/sustainability/climate-risk/farm-1');

    expect(res.status).toBe(200);
    expect(res.body.risk_level).toBe(RiskLevel.HIGH);
    expect(res.body.last_updated).toBeDefined();
    expect(res.body.weather_available).toBe(true);
    expect(res.body.recommendations.length).toBeGreaterThan(0);
    expect(mockCalculateClimateRiskIndex).toHaveBeenCalledWith('tenant-1', 'farm-1');
  });

  it('should handle unavailable weather data gracefully', async () => {
    mockCalculateClimateRiskIndex.mockResolvedValue({
      risk_level: RiskLevel.LOW,
      risks: [],
      recommendations: [],
      contributing_factors: [],
      forecast: [],
      last_updated: '2024-01-01T00:00:00.000Z',
      weather_available: false,
    });

    const res = await request(app).get('/api/v1/sustainability/climate-risk/farm-1');

    expect(res.status).toBe(200);
    expect(res.body.weather_available).toBe(false);
    expect(res.body.last_updated).toBeDefined();
  });

  it('should return 404 when farm not found', async () => {
    mockCalculateClimateRiskIndex.mockRejectedValue(
      new SustainabilityError('Farm not found.', 404),
    );

    const res = await request(app).get('/api/v1/sustainability/climate-risk/nonexistent');

    expect(res.status).toBe(404);
  });
});

describe('GET /api/v1/sustainability/insights/:farmId', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should return aggregated sustainability insights', async () => {
    mockGetSustainabilityInsights.mockResolvedValue({
      farm_id: 'farm-1',
      water_efficiency: { liters_per_hectare: 3500, rating: EfficiencyRating.HIGH },
      input_efficiency: { cost_per_kg: 10, rating: EfficiencyRating.MEDIUM },
      climate_risk: { risk_level: RiskLevel.LOW, weather_available: true },
      generated_at: '2024-01-01T00:00:00.000Z',
    });

    const res = await request(app).get('/api/v1/sustainability/insights/farm-1');

    expect(res.status).toBe(200);
    expect(res.body.farm_id).toBe('farm-1');
    expect(res.body.water_efficiency).toBeDefined();
    expect(res.body.input_efficiency).toBeDefined();
    expect(res.body.climate_risk).toBeDefined();
    expect(res.body.generated_at).toBeDefined();
    expect(mockGetSustainabilityInsights).toHaveBeenCalledWith('tenant-1', 'farm-1');
  });

  it('should handle partial data gracefully', async () => {
    mockGetSustainabilityInsights.mockResolvedValue({
      farm_id: 'farm-1',
      water_efficiency: null,
      input_efficiency: null,
      climate_risk: null,
      generated_at: '2024-01-01T00:00:00.000Z',
    });

    const res = await request(app).get('/api/v1/sustainability/insights/farm-1');

    expect(res.status).toBe(200);
    expect(res.body.water_efficiency).toBeNull();
    expect(res.body.input_efficiency).toBeNull();
    expect(res.body.climate_risk).toBeNull();
  });

  it('should return 500 on unexpected error', async () => {
    mockGetSustainabilityInsights.mockRejectedValue(new Error('DB error'));

    const res = await request(app).get('/api/v1/sustainability/insights/farm-1');

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Internal server error.');
  });
});
