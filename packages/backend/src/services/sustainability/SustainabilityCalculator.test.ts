import {
  getRegionalBenchmark,
  calculateEfficiencyRating,
  generateWaterExplanation,
  calculateConfidence,
  getConservationTips,
  getInputCostBenchmark,
  calculateInputEfficiencyRating,
  generateInputExplanation,
  estimateSavings,
  assessClimateRisks,
  calculateOverallRisk,
  generateRiskRecommendations,
  SustainabilityCalculator,
  SustainabilityError,
} from './SustainabilityCalculator';
import type { WeatherDay } from './SustainabilityCalculator';
import { EfficiencyRating, ConfidenceLevel, RiskLevel } from '../../types';

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

// ── Helper tests ───────────────────────────────────────────────

describe('getRegionalBenchmark', () => {
  it('should return benchmark for known crops', () => {
    const wheat = getRegionalBenchmark('wheat');
    expect(wheat).toEqual({ min: 3500, max: 5500 });

    const rice = getRegionalBenchmark('rice');
    expect(rice).toEqual({ min: 8000, max: 12000 });
  });

  it('should be case-insensitive', () => {
    expect(getRegionalBenchmark('Wheat')).toEqual({ min: 3500, max: 5500 });
    expect(getRegionalBenchmark('RICE')).toEqual({ min: 8000, max: 12000 });
  });

  it('should return default benchmark for unknown crops', () => {
    expect(getRegionalBenchmark('unknown_crop')).toEqual({ min: 4000, max: 7000 });
  });
});

describe('calculateEfficiencyRating', () => {
  const benchmark = { min: 4000, max: 6000 };

  it('should return High Efficiency when usage <= min', () => {
    expect(calculateEfficiencyRating(3000, benchmark)).toBe(EfficiencyRating.HIGH);
    expect(calculateEfficiencyRating(4000, benchmark)).toBe(EfficiencyRating.HIGH);
  });

  it('should return Medium Efficiency when usage is between min and max', () => {
    expect(calculateEfficiencyRating(5000, benchmark)).toBe(EfficiencyRating.MEDIUM);
    expect(calculateEfficiencyRating(6000, benchmark)).toBe(EfficiencyRating.MEDIUM);
  });

  it('should return Low Efficiency when usage > max', () => {
    expect(calculateEfficiencyRating(7000, benchmark)).toBe(EfficiencyRating.LOW);
    expect(calculateEfficiencyRating(10000, benchmark)).toBe(EfficiencyRating.LOW);
  });
});

describe('generateWaterExplanation', () => {
  const benchmark = { min: 4000, max: 6000 };

  it('should say "below" when usage is below min', () => {
    const explanation = generateWaterExplanation(3000, benchmark, 'wheat');
    expect(explanation).toContain('3000 liters/hectare');
    expect(explanation).toContain('below');
    expect(explanation).toContain('4000-6000');
    expect(explanation).toContain('wheat');
  });

  it('should say "above" when usage is above max', () => {
    const explanation = generateWaterExplanation(8000, benchmark, 'rice');
    expect(explanation).toContain('above');
    expect(explanation).toContain('rice');
  });

  it('should say "similar to" when usage is within range', () => {
    const explanation = generateWaterExplanation(5000, benchmark, 'tomato');
    expect(explanation).toContain('similar to');
  });
});

describe('calculateConfidence', () => {
  it('should return HIGH for 5+ data points', () => {
    expect(calculateConfidence(5)).toBe(ConfidenceLevel.HIGH);
    expect(calculateConfidence(10)).toBe(ConfidenceLevel.HIGH);
  });

  it('should return MEDIUM for 2-4 data points', () => {
    expect(calculateConfidence(2)).toBe(ConfidenceLevel.MEDIUM);
    expect(calculateConfidence(4)).toBe(ConfidenceLevel.MEDIUM);
  });

  it('should return LOW for 0-1 data points', () => {
    expect(calculateConfidence(1)).toBe(ConfidenceLevel.LOW);
    expect(calculateConfidence(0)).toBe(ConfidenceLevel.LOW);
  });
});


describe('getConservationTips', () => {
  const benchmark = { min: 4000, max: 6000 };

  it('should return tips when usage exceeds max by 30%', () => {
    // 6000 * 1.3 = 7800, so 8000 should trigger tips
    const tips = getConservationTips(8000, benchmark);
    expect(tips).toBeDefined();
    expect(tips!.length).toBeGreaterThan(0);
  });

  it('should return undefined when usage is within acceptable range', () => {
    expect(getConservationTips(5000, benchmark)).toBeUndefined();
    expect(getConservationTips(7000, benchmark)).toBeUndefined();
  });

  it('should return undefined at exactly 30% above max', () => {
    // 6000 * 1.3 = 7800 exactly — not strictly greater
    expect(getConservationTips(7800, benchmark)).toBeUndefined();
  });

  it('should return tips just above 30% threshold', () => {
    expect(getConservationTips(7801, benchmark)).toBeDefined();
  });
});

// ── SustainabilityCalculator integration tests ──────────────────

describe('SustainabilityCalculator', () => {
  const calculator = new SustainabilityCalculator();
  const tenantId = 'tenant-1';
  const farmId = 'farm-1';

  beforeEach(() => {
    mockQuery.mockReset();
    mockRelease.mockReset();
  });

  /** Helper to set up mock DB responses for a sequence of queries. */
  function mockDBSequence(responses: Array<{ rows: unknown[] } | undefined>) {
    for (const resp of responses) {
      mockQuery.mockResolvedValueOnce(resp);
    }
  }

  describe('calculateWaterEfficiency', () => {
    it('should return efficiency data for a farm with water logs', async () => {
      // findById for farm: BEGIN, SET LOCAL, SELECT, COMMIT
      mockDBSequence([
        undefined, // BEGIN
        undefined, // SET LOCAL
        { rows: [{ id: farmId, total_acreage: 10 }] }, // farm found
        undefined, // COMMIT
      ]);

      // water logs query: BEGIN, SET LOCAL, SELECT, COMMIT
      mockDBSequence([
        undefined,
        undefined,
        {
          rows: [
            { quantity: 2000, input_type: 'water', date: '2024-01-15' },
            { quantity: 3000, input_type: 'water', date: '2024-02-15' },
            { quantity: 2500, input_type: 'water', date: '2024-03-15' },
            { quantity: 2800, input_type: 'water', date: '2024-04-15' },
            { quantity: 3200, input_type: 'water', date: '2024-05-15' },
          ],
        },
        undefined,
      ]);

      // crops query: BEGIN, SET LOCAL, SELECT, COMMIT
      mockDBSequence([
        undefined,
        undefined,
        {
          rows: [
            { crop_type: 'wheat', acreage: 5 },
            { crop_type: 'wheat', acreage: 5 },
          ],
        },
        undefined,
      ]);

      const result = await calculator.calculateWaterEfficiency(tenantId, farmId);

      expect(result.rating).toBe(EfficiencyRating.HIGH);
      expect(result.crop).toBe('wheat');
      expect(result.total_water_liters).toBe(13500);
      expect(result.total_hectares).toBeCloseTo(10 * 0.4047, 2);
      expect(result.liters_per_hectare).toBeGreaterThan(0);
      expect(result.data_points).toBe(5);
      expect(result.confidence).toBe(ConfidenceLevel.HIGH);
      expect(result.explanation).toContain('liters/hectare');
      expect(result.explanation).toContain('wheat');
      expect(result.benchmark_range).toEqual({ min: 3500, max: 5500 });
    });

    it('should throw 404 when farm not found', async () => {
      mockDBSequence([
        undefined,
        undefined,
        { rows: [] }, // farm not found
        undefined,
      ]);

      try {
        await calculator.calculateWaterEfficiency(tenantId, farmId);
        fail('Expected SustainabilityError to be thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(SustainabilityError);
        expect((err as SustainabilityError).statusCode).toBe(404);
        expect((err as SustainabilityError).message).toBe('Farm not found.');
      }
    });

    it('should throw 404 when no water logs exist', async () => {
      // farm found
      mockDBSequence([undefined, undefined, { rows: [{ id: farmId }] }, undefined]);
      // no water logs
      mockDBSequence([undefined, undefined, { rows: [] }, undefined]);

      await expect(
        calculator.calculateWaterEfficiency(tenantId, farmId),
      ).rejects.toThrow('No water usage data found');
    });

    it('should throw 404 when no crops exist', async () => {
      // farm found
      mockDBSequence([undefined, undefined, { rows: [{ id: farmId }] }, undefined]);
      // water logs
      mockDBSequence([
        undefined,
        undefined,
        { rows: [{ quantity: 1000, input_type: 'water', date: '2024-01-15' }] },
        undefined,
      ]);
      // no crops
      mockDBSequence([undefined, undefined, { rows: [] }, undefined]);

      await expect(
        calculator.calculateWaterEfficiency(tenantId, farmId),
      ).rejects.toThrow('No crops found');
    });

    it('should include conservation tips when usage exceeds 30% above benchmark', async () => {
      // farm found
      mockDBSequence([undefined, undefined, { rows: [{ id: farmId }] }, undefined]);
      // very high water usage
      mockDBSequence([
        undefined,
        undefined,
        {
          rows: [
            { quantity: 50000, input_type: 'water', date: '2024-01-15' },
            { quantity: 50000, input_type: 'water', date: '2024-02-15' },
          ],
        },
        undefined,
      ]);
      // small acreage crop
      mockDBSequence([
        undefined,
        undefined,
        { rows: [{ crop_type: 'wheat', acreage: 1 }] },
        undefined,
      ]);

      const result = await calculator.calculateWaterEfficiency(tenantId, farmId);

      expect(result.rating).toBe(EfficiencyRating.LOW);
      expect(result.conservation_tips).toBeDefined();
      expect(result.conservation_tips!.length).toBeGreaterThan(0);
    });

    it('should return medium confidence for 2-4 data points', async () => {
      // farm found
      mockDBSequence([undefined, undefined, { rows: [{ id: farmId }] }, undefined]);
      // 3 water logs
      mockDBSequence([
        undefined,
        undefined,
        {
          rows: [
            { quantity: 1000, input_type: 'water', date: '2024-01-15' },
            { quantity: 1000, input_type: 'water', date: '2024-02-15' },
            { quantity: 1000, input_type: 'water', date: '2024-03-15' },
          ],
        },
        undefined,
      ]);
      // crops
      mockDBSequence([
        undefined,
        undefined,
        { rows: [{ crop_type: 'rice', acreage: 2 }] },
        undefined,
      ]);

      const result = await calculator.calculateWaterEfficiency(tenantId, farmId);
      expect(result.confidence).toBe(ConfidenceLevel.MEDIUM);
    });
  });
});


// ── Input efficiency helper tests ───────────────────────────────

describe('getInputCostBenchmark', () => {
  it('should return benchmark for known crops', () => {
    expect(getInputCostBenchmark('wheat')).toEqual({ min: 8, max: 14 });
    expect(getInputCostBenchmark('rice')).toEqual({ min: 10, max: 18 });
  });

  it('should be case-insensitive', () => {
    expect(getInputCostBenchmark('Wheat')).toEqual({ min: 8, max: 14 });
  });

  it('should return default benchmark for unknown crops', () => {
    expect(getInputCostBenchmark('unknown_crop')).toEqual({ min: 6, max: 15 });
  });
});

describe('calculateInputEfficiencyRating', () => {
  const benchmark = { min: 8, max: 14 };

  it('should return High Efficiency when cost <= min', () => {
    expect(calculateInputEfficiencyRating(6, benchmark)).toBe(EfficiencyRating.HIGH);
    expect(calculateInputEfficiencyRating(8, benchmark)).toBe(EfficiencyRating.HIGH);
  });

  it('should return Medium Efficiency when cost is between min and max', () => {
    expect(calculateInputEfficiencyRating(10, benchmark)).toBe(EfficiencyRating.MEDIUM);
    expect(calculateInputEfficiencyRating(14, benchmark)).toBe(EfficiencyRating.MEDIUM);
  });

  it('should return Low Efficiency when cost > max', () => {
    expect(calculateInputEfficiencyRating(20, benchmark)).toBe(EfficiencyRating.LOW);
  });
});

describe('generateInputExplanation', () => {
  const benchmark = { min: 8, max: 14 };

  it('should say "lower than" when cost is below min', () => {
    const explanation = generateInputExplanation(5, benchmark, 'wheat');
    expect(explanation).toContain('₹5.00 per kg');
    expect(explanation).toContain('lower than');
    expect(explanation).toContain('₹8-14');
    expect(explanation).toContain('wheat');
  });

  it('should say "higher than" when cost is above max', () => {
    const explanation = generateInputExplanation(20, benchmark, 'rice');
    expect(explanation).toContain('higher than');
  });

  it('should say "similar to" when cost is within range', () => {
    const explanation = generateInputExplanation(10, benchmark, 'tomato');
    expect(explanation).toContain('similar to');
  });
});

describe('estimateSavings', () => {
  const benchmark = { min: 8, max: 14 };

  it('should return savings when cost exceeds max', () => {
    // cost 20, max 14, yield 100 => (20-14)*100 = 600
    const savings = estimateSavings(20, benchmark, 100);
    expect(savings).toBe(600);
  });

  it('should return undefined when cost is within range', () => {
    expect(estimateSavings(10, benchmark, 100)).toBeUndefined();
  });

  it('should return undefined when cost equals max', () => {
    expect(estimateSavings(14, benchmark, 100)).toBeUndefined();
  });
});

// ── Climate risk helper tests ───────────────────────────────────

describe('assessClimateRisks', () => {
  it('should detect heavy rainfall risk', () => {
    const forecast: WeatherDay[] = [
      { date: '2024-01-01', temperature: 30, rainfall: 150, wind_speed: 10, rainfall_probability: 90 },
    ];
    const risks = assessClimateRisks(forecast);
    expect(risks).toHaveLength(1);
    expect(risks[0].type).toBe('heavy_rainfall');
    expect(risks[0].severity).toBe(RiskLevel.HIGH);
  });

  it('should detect heat stress risk', () => {
    const forecast: WeatherDay[] = [
      { date: '2024-01-01', temperature: 45, rainfall: 20, wind_speed: 10, rainfall_probability: 30 },
    ];
    const risks = assessClimateRisks(forecast);
    expect(risks.some(r => r.type === 'heat_stress')).toBe(true);
  });

  it('should detect drought risk when all days have low rainfall', () => {
    const forecast: WeatherDay[] = [
      { date: '2024-01-01', temperature: 30, rainfall: 2, wind_speed: 10, rainfall_probability: 10 },
      { date: '2024-01-02', temperature: 31, rainfall: 1, wind_speed: 12, rainfall_probability: 5 },
      { date: '2024-01-03', temperature: 29, rainfall: 0, wind_speed: 8, rainfall_probability: 0 },
    ];
    const risks = assessClimateRisks(forecast);
    expect(risks.some(r => r.type === 'drought')).toBe(true);
    expect(risks.find(r => r.type === 'drought')!.severity).toBe(RiskLevel.MEDIUM);
  });

  it('should return no risks for mild weather', () => {
    const forecast: WeatherDay[] = [
      { date: '2024-01-01', temperature: 28, rainfall: 20, wind_speed: 10, rainfall_probability: 40 },
      { date: '2024-01-02', temperature: 30, rainfall: 15, wind_speed: 8, rainfall_probability: 30 },
    ];
    const risks = assessClimateRisks(forecast);
    expect(risks).toHaveLength(0);
  });

  it('should return empty for empty forecast', () => {
    expect(assessClimateRisks([])).toHaveLength(0);
  });
});

describe('calculateOverallRisk', () => {
  it('should return HIGH when any risk is high', () => {
    const risks = [
      { type: 'heavy_rainfall', severity: RiskLevel.HIGH, description: 'test' },
      { type: 'drought', severity: RiskLevel.MEDIUM, description: 'test' },
    ];
    expect(calculateOverallRisk(risks)).toBe(RiskLevel.HIGH);
  });

  it('should return MEDIUM when highest risk is medium', () => {
    const risks = [
      { type: 'drought', severity: RiskLevel.MEDIUM, description: 'test' },
    ];
    expect(calculateOverallRisk(risks)).toBe(RiskLevel.MEDIUM);
  });

  it('should return LOW when no risks', () => {
    expect(calculateOverallRisk([])).toBe(RiskLevel.LOW);
  });
});

describe('generateRiskRecommendations', () => {
  it('should generate recommendations for heavy rainfall', () => {
    const risks = [{ type: 'heavy_rainfall', severity: RiskLevel.HIGH, description: 'test' }];
    const recs = generateRiskRecommendations(risks);
    expect(recs).toContain('Ensure drainage channels are clear');
    expect(recs).toContain('Consider delaying fertilizer application');
  });

  it('should generate recommendations for heat stress', () => {
    const risks = [{ type: 'heat_stress', severity: RiskLevel.HIGH, description: 'test' }];
    const recs = generateRiskRecommendations(risks);
    expect(recs).toContain('Increase irrigation frequency');
  });

  it('should generate recommendations for drought', () => {
    const risks = [{ type: 'drought', severity: RiskLevel.MEDIUM, description: 'test' }];
    const recs = generateRiskRecommendations(risks);
    expect(recs).toContain('Implement water conservation measures');
  });

  it('should return empty for no risks', () => {
    expect(generateRiskRecommendations([])).toHaveLength(0);
  });
});

// ── SustainabilityCalculator.calculateInputEfficiency tests ─────

describe('SustainabilityCalculator - calculateInputEfficiency', () => {
  const calculator = new SustainabilityCalculator();
  const tenantId = 'tenant-1';
  const farmId = 'farm-1';

  beforeEach(() => {
    mockQuery.mockReset();
    mockRelease.mockReset();
  });

  function mockDBSequence(responses: Array<{ rows: unknown[] } | undefined>) {
    for (const resp of responses) {
      mockQuery.mockResolvedValueOnce(resp);
    }
  }

  it('should return input efficiency data', async () => {
    // farm found
    mockDBSequence([undefined, undefined, { rows: [{ id: farmId }] }, undefined]);
    // input logs (non-water)
    mockDBSequence([
      undefined, undefined,
      {
        rows: [
          { cost: 500, quantity: 10, input_type: 'fertilizer', date: '2024-01-15' },
          { cost: 300, quantity: 5, input_type: 'pesticide', date: '2024-02-15' },
          { cost: 200, quantity: 8, input_type: 'labor', date: '2024-03-15' },
        ],
      },
      undefined,
    ]);
    // yield records
    mockDBSequence([
      undefined, undefined,
      { rows: [{ quantity: 100, harvest_date: '2024-06-01' }] },
      undefined,
    ]);
    // crops
    mockDBSequence([
      undefined, undefined,
      { rows: [{ crop_type: 'wheat', acreage: 5 }] },
      undefined,
    ]);

    const result = await calculator.calculateInputEfficiency(tenantId, farmId);

    expect(result.cost_per_kg).toBe(10); // 1000/100
    expect(result.rating).toBe(EfficiencyRating.MEDIUM); // wheat benchmark 8-14
    expect(result.explanation).toContain('₹10.00 per kg');
    expect(result.explanation).toContain('similar to');
    expect(result.crop).toBe('wheat');
    expect(result.total_input_cost).toBe(1000);
    expect(result.total_yield_kg).toBe(100);
    expect(result.data_points).toBe(3);
    expect(result.confidence).toBe(ConfidenceLevel.MEDIUM);
  });

  it('should throw 404 when farm not found', async () => {
    mockDBSequence([undefined, undefined, { rows: [] }, undefined]);

    await expect(
      calculator.calculateInputEfficiency(tenantId, farmId),
    ).rejects.toThrow('Farm not found.');
  });

  it('should throw 404 when no input logs exist', async () => {
    mockDBSequence([undefined, undefined, { rows: [{ id: farmId }] }, undefined]);
    mockDBSequence([undefined, undefined, { rows: [] }, undefined]);

    await expect(
      calculator.calculateInputEfficiency(tenantId, farmId),
    ).rejects.toThrow('No input cost data found');
  });

  it('should throw 404 when no yield data exists', async () => {
    mockDBSequence([undefined, undefined, { rows: [{ id: farmId }] }, undefined]);
    mockDBSequence([
      undefined, undefined,
      { rows: [{ cost: 500, quantity: 10, input_type: 'fertilizer', date: '2024-01-15' }] },
      undefined,
    ]);
    mockDBSequence([undefined, undefined, { rows: [] }, undefined]);

    await expect(
      calculator.calculateInputEfficiency(tenantId, farmId),
    ).rejects.toThrow('No yield data found');
  });

  it('should include potential savings when cost exceeds benchmark', async () => {
    mockDBSequence([undefined, undefined, { rows: [{ id: farmId }] }, undefined]);
    // High cost inputs
    mockDBSequence([
      undefined, undefined,
      { rows: [{ cost: 2000, quantity: 10, input_type: 'fertilizer', date: '2024-01-15' }] },
      undefined,
    ]);
    // Low yield
    mockDBSequence([
      undefined, undefined,
      { rows: [{ quantity: 100, harvest_date: '2024-06-01' }] },
      undefined,
    ]);
    // crops
    mockDBSequence([
      undefined, undefined,
      { rows: [{ crop_type: 'wheat', acreage: 5 }] },
      undefined,
    ]);

    const result = await calculator.calculateInputEfficiency(tenantId, farmId);

    expect(result.cost_per_kg).toBe(20); // 2000/100
    expect(result.rating).toBe(EfficiencyRating.LOW);
    expect(result.potential_savings).toBeDefined();
    expect(result.potential_savings).toBe(600); // (20-14)*100
  });
});

// ── SustainabilityCalculator.calculateClimateRiskIndex tests ────

describe('SustainabilityCalculator - calculateClimateRiskIndex', () => {
  const calculator = new SustainabilityCalculator();
  const tenantId = 'tenant-1';
  const farmId = 'farm-1';

  beforeEach(() => {
    mockQuery.mockReset();
    mockRelease.mockReset();
  });

  function mockDBSequence(responses: Array<{ rows: unknown[] } | undefined>) {
    for (const resp of responses) {
      mockQuery.mockResolvedValueOnce(resp);
    }
  }

  it('should return climate risk data with last_updated timestamp', async () => {
    mockDBSequence([
      undefined, undefined,
      { rows: [{ id: farmId, location: { latitude: 20.5, longitude: 78.9 } }] },
      undefined,
    ]);

    const result = await calculator.calculateClimateRiskIndex(tenantId, farmId);

    expect(result.last_updated).toBeDefined();
    expect(result.weather_available).toBe(true);
    expect(result.forecast).toHaveLength(7);
    expect([RiskLevel.LOW, RiskLevel.MEDIUM, RiskLevel.HIGH]).toContain(result.risk_level);
    expect(Array.isArray(result.risks)).toBe(true);
    expect(Array.isArray(result.recommendations)).toBe(true);
    expect(Array.isArray(result.contributing_factors)).toBe(true);
  });

  it('should throw 404 when farm not found', async () => {
    mockDBSequence([undefined, undefined, { rows: [] }, undefined]);

    await expect(
      calculator.calculateClimateRiskIndex(tenantId, farmId),
    ).rejects.toThrow('Farm not found.');
  });
});
