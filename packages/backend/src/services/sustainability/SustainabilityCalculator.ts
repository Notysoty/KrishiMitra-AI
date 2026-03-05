import { BaseRepository } from '../../db/BaseRepository';
import { WaterEfficiency, EfficiencyRating, ConfidenceLevel, InputType, RiskLevel } from '../../types';

// ── Regional benchmarks (anonymized aggregate data) ─────────────
// Liters per hectare per crop cycle for common Indian crops.
const REGIONAL_BENCHMARKS: Record<string, { min: number; max: number }> = {
  wheat: { min: 3500, max: 5500 },
  rice: { min: 8000, max: 12000 },
  tomato: { min: 4000, max: 6000 },
  onion: { min: 3000, max: 5000 },
  potato: { min: 4000, max: 6500 },
  maize: { min: 4000, max: 6000 },
  cotton: { min: 5000, max: 8000 },
  sugarcane: { min: 15000, max: 25000 },
};

const DEFAULT_BENCHMARK = { min: 4000, max: 7000 };

// ── Input cost benchmarks (₹ per kg of produce) ────────────────
const INPUT_COST_BENCHMARKS: Record<string, { min: number; max: number }> = {
  wheat: { min: 8, max: 14 },
  rice: { min: 10, max: 18 },
  tomato: { min: 5, max: 12 },
  onion: { min: 4, max: 10 },
  potato: { min: 6, max: 12 },
  maize: { min: 7, max: 13 },
  cotton: { min: 20, max: 35 },
  sugarcane: { min: 1, max: 3 },
};

const DEFAULT_INPUT_COST_BENCHMARK = { min: 6, max: 15 };

// ── Weather forecast types ──────────────────────────────────────

export interface WeatherDay {
  date: string;
  temperature: number;
  rainfall: number;
  wind_speed: number;
  rainfall_probability: number;
}

// ── Synthetic weather data generator (MVP) ──────────────────────

function generateSyntheticWeather(days: number): WeatherDay[] {
  const forecast: WeatherDay[] = [];
  const now = new Date();
  for (let i = 0; i < days; i++) {
    const date = new Date(now);
    date.setDate(date.getDate() + i);
    forecast.push({
      date: date.toISOString().split('T')[0],
      temperature: 25 + Math.round(Math.random() * 15),
      rainfall: Math.round(Math.random() * 60),
      wind_speed: 5 + Math.round(Math.random() * 20),
      rainfall_probability: Math.round(Math.random() * 100),
    });
  }
  return forecast;
}

// ── Climate risk thresholds ─────────────────────────────────────
const HEAVY_RAINFALL_THRESHOLD = 100; // mm
const HEAT_STRESS_THRESHOLD = 40; // °C
const DROUGHT_RAINFALL_THRESHOLD = 5; // mm per day

// ── Water conservation tips ─────────────────────────────────────
const WATER_CONSERVATION_TIPS = [
  'Consider switching to drip irrigation to reduce water usage by up to 40%.',
  'Mulching around crops can reduce evaporation and conserve soil moisture.',
  'Schedule irrigation during early morning or late evening to minimize evaporation.',
  'Monitor soil moisture levels before irrigating to avoid over-watering.',
  'Use rainwater harvesting to supplement irrigation needs.',
];

// ── Constants ───────────────────────────────────────────────────
const ACRES_TO_HECTARES = 0.4047;
const HIGH_CONFIDENCE_THRESHOLD = 5;
const EXCESS_USAGE_THRESHOLD = 1.3; // 30% above max benchmark

// ── Response types ──────────────────────────────────────────────

export interface WaterEfficiencyResponse extends WaterEfficiency {
  crop: string;
  total_water_liters: number;
  total_hectares: number;
  data_points: number;
  conservation_tips?: string[];
}

export interface InputEfficiencyResponse {
  cost_per_kg: number;
  rating: EfficiencyRating;
  explanation: string;
  benchmark_range: { min: number; max: number };
  confidence: ConfidenceLevel;
  crop: string;
  total_input_cost: number;
  total_yield_kg: number;
  data_points: number;
  potential_savings?: number;
}

export interface ClimateRiskResponse {
  risk_level: RiskLevel;
  risks: Array<{ type: string; severity: RiskLevel; description: string }>;
  recommendations: string[];
  contributing_factors: string[];
  forecast: WeatherDay[];
  last_updated: string;
  weather_available: boolean;
}

export interface SustainabilityInsightsResponse {
  farm_id: string;
  water_efficiency: WaterEfficiencyResponse | null;
  input_efficiency: InputEfficiencyResponse | null;
  climate_risk: ClimateRiskResponse | null;
  generated_at: string;
}

// ── Error class ─────────────────────────────────────────────────

export class SustainabilityError extends Error {
  constructor(
    message: string,
    public statusCode: number = 400,
  ) {
    super(message);
    this.name = 'SustainabilityError';
  }
}


// ── Helpers (exported for testing) ──────────────────────────────

/**
 * Get the regional benchmark for a crop type.
 * Falls back to a default range for unknown crops.
 */
export function getRegionalBenchmark(cropType: string): { min: number; max: number } {
  return REGIONAL_BENCHMARKS[cropType.toLowerCase()] ?? DEFAULT_BENCHMARK;
}

/**
 * Calculate efficiency rating by comparing actual usage against benchmark.
 * - High Efficiency: usage <= benchmark min (using less than typical minimum)
 * - Medium Efficiency: usage between min and max (within typical range)
 * - Low Efficiency: usage > benchmark max (exceeding typical maximum)
 */
export function calculateEfficiencyRating(
  litersPerHectare: number,
  benchmark: { min: number; max: number },
): EfficiencyRating {
  if (litersPerHectare <= benchmark.min) return EfficiencyRating.HIGH;
  if (litersPerHectare <= benchmark.max) return EfficiencyRating.MEDIUM;
  return EfficiencyRating.LOW;
}

/**
 * Generate a human-readable explanation of water efficiency.
 */
export function generateWaterExplanation(
  litersPerHectare: number,
  benchmark: { min: number; max: number },
  crop: string,
): string {
  const comparison =
    litersPerHectare < benchmark.min
      ? 'below'
      : litersPerHectare > benchmark.max
        ? 'above'
        : 'similar to';

  return `Your water usage is ${Math.round(litersPerHectare)} liters/hectare, which is ${comparison} the typical range of ${benchmark.min}-${benchmark.max} liters/hectare for ${crop}`;
}

/**
 * Determine confidence level based on the number of data points.
 */
export function calculateConfidence(dataPoints: number): ConfidenceLevel {
  if (dataPoints >= HIGH_CONFIDENCE_THRESHOLD) return ConfidenceLevel.HIGH;
  if (dataPoints >= 2) return ConfidenceLevel.MEDIUM;
  return ConfidenceLevel.LOW;
}

/**
 * Check if water usage exceeds recommended levels by 30% and return tips.
 */
export function getConservationTips(
  litersPerHectare: number,
  benchmark: { min: number; max: number },
): string[] | undefined {
  if (litersPerHectare > benchmark.max * EXCESS_USAGE_THRESHOLD) {
    return WATER_CONSERVATION_TIPS;
  }
  return undefined;
}

// ── Input efficiency helpers (exported for testing) ─────────────

/**
 * Get the input cost benchmark for a crop type.
 */
export function getInputCostBenchmark(cropType: string): { min: number; max: number } {
  return INPUT_COST_BENCHMARKS[cropType.toLowerCase()] ?? DEFAULT_INPUT_COST_BENCHMARK;
}

/**
 * Calculate input efficiency rating by comparing cost per kg against benchmark.
 */
export function calculateInputEfficiencyRating(
  costPerKg: number,
  benchmark: { min: number; max: number },
): EfficiencyRating {
  if (costPerKg <= benchmark.min) return EfficiencyRating.HIGH;
  if (costPerKg <= benchmark.max) return EfficiencyRating.MEDIUM;
  return EfficiencyRating.LOW;
}

/**
 * Generate a human-readable explanation of input cost efficiency.
 */
export function generateInputExplanation(
  costPerKg: number,
  benchmark: { min: number; max: number },
  crop: string,
): string {
  const comparison =
    costPerKg < benchmark.min
      ? 'lower than'
      : costPerKg > benchmark.max
        ? 'higher than'
        : 'similar to';

  return `Your input cost is ₹${costPerKg.toFixed(2)} per kg, which is ${comparison} the typical range of ₹${benchmark.min}-${benchmark.max} per kg for ${crop}`;
}

/**
 * Estimate potential savings when cost exceeds benchmark max.
 */
export function estimateSavings(
  costPerKg: number,
  benchmark: { min: number; max: number },
  totalYieldKg: number,
): number | undefined {
  if (costPerKg > benchmark.max) {
    return Math.round((costPerKg - benchmark.max) * totalYieldKg * 100) / 100;
  }
  return undefined;
}

// ── Climate risk helpers (exported for testing) ─────────────────

export interface RiskFactor {
  type: string;
  severity: RiskLevel;
  description: string;
}

/**
 * Assess climate risks from a weather forecast.
 */
export function assessClimateRisks(forecast: WeatherDay[]): RiskFactor[] {
  const risks: RiskFactor[] = [];

  const heavyRainDays = forecast.filter(d => d.rainfall > HEAVY_RAINFALL_THRESHOLD);
  if (heavyRainDays.length > 0) {
    risks.push({
      type: 'heavy_rainfall',
      severity: RiskLevel.HIGH,
      description: `Heavy rainfall (>${HEAVY_RAINFALL_THRESHOLD}mm) forecasted on ${heavyRainDays.length} day(s)`,
    });
  }

  const heatDays = forecast.filter(d => d.temperature > HEAT_STRESS_THRESHOLD);
  if (heatDays.length > 0) {
    risks.push({
      type: 'heat_stress',
      severity: RiskLevel.HIGH,
      description: `High temperatures (>${HEAT_STRESS_THRESHOLD}°C) expected on ${heatDays.length} day(s)`,
    });
  }

  const allDry = forecast.length > 0 && forecast.every(d => d.rainfall < DROUGHT_RAINFALL_THRESHOLD);
  if (allDry) {
    risks.push({
      type: 'drought',
      severity: RiskLevel.MEDIUM,
      description: 'Low rainfall forecasted across all days — potential drought conditions',
    });
  }

  return risks;
}

/**
 * Calculate overall risk level from individual risk factors.
 */
export function calculateOverallRisk(risks: RiskFactor[]): RiskLevel {
  if (risks.some(r => r.severity === RiskLevel.HIGH)) return RiskLevel.HIGH;
  if (risks.some(r => r.severity === RiskLevel.MEDIUM)) return RiskLevel.MEDIUM;
  return RiskLevel.LOW;
}

/**
 * Generate actionable recommendations per risk type.
 */
export function generateRiskRecommendations(risks: RiskFactor[]): string[] {
  const recommendations: string[] = [];

  for (const risk of risks) {
    switch (risk.type) {
      case 'heavy_rainfall':
        recommendations.push('Ensure drainage channels are clear');
        recommendations.push('Consider delaying fertilizer application');
        break;
      case 'heat_stress':
        recommendations.push('Increase irrigation frequency');
        recommendations.push('Consider shade netting for sensitive crops');
        break;
      case 'drought':
        recommendations.push('Implement water conservation measures');
        recommendations.push('Consider drought-resistant crop varieties');
        break;
    }
  }

  return recommendations;
}

// ── SustainabilityCalculator ────────────────────────────────────

export class SustainabilityCalculator extends BaseRepository {
  private farmRepo = new BaseRepository('farms');
  private inputRepo = new BaseRepository('input_logs');
  private cropRepo = new BaseRepository('crops');

  constructor() {
    super('input_logs');
  }

  /**
   * Calculate water efficiency for a farm.
   *
   * 1. Fetch water input logs for the farm
   * 2. Fetch crop information for total acreage
   * 3. Calculate liters per hectare
   * 4. Compare against regional benchmarks
   * 5. Return rating, explanation, confidence, and optional conservation tips
   */
  async calculateWaterEfficiency(
    tenantId: string,
    farmId: string,
  ): Promise<WaterEfficiencyResponse> {
    // Verify farm exists
    const farm = await this.farmRepo.findById(tenantId, farmId);
    if (!farm) {
      throw new SustainabilityError('Farm not found.', 404);
    }

    // Get water input logs
    const waterLogsResult = await this.inputRepo.query(
      tenantId,
      `SELECT * FROM input_logs WHERE farm_id = $1 AND input_type = $2 ORDER BY date DESC`,
      [farmId, InputType.WATER],
    );
    const waterLogs = waterLogsResult.rows;

    if (waterLogs.length === 0) {
      throw new SustainabilityError(
        'No water usage data found. Please log irrigation events to track water efficiency.',
        404,
      );
    }

    // Get crops for the farm
    const cropsResult = await this.cropRepo.query(
      tenantId,
      `SELECT * FROM crops WHERE farm_id = $1`,
      [farmId],
    );
    const crops = cropsResult.rows;

    if (crops.length === 0) {
      throw new SustainabilityError(
        'No crops found for this farm. Please add crops to calculate water efficiency.',
        404,
      );
    }

    // Calculate totals
    const totalWater = waterLogs.reduce(
      (sum: number, log: Record<string, unknown>) => sum + (log.quantity as number),
      0,
    );
    const totalAcreage = crops.reduce(
      (sum: number, crop: Record<string, unknown>) => sum + (crop.acreage as number),
      0,
    );
    const totalHectares = totalAcreage * ACRES_TO_HECTARES;

    if (totalHectares <= 0) {
      throw new SustainabilityError('Total farm acreage must be greater than 0.', 400);
    }

    const litersPerHectare = totalWater / totalHectares;

    // Use the primary crop for benchmark comparison
    const primaryCrop = (crops[0].crop_type as string) || 'unknown';
    const benchmark = getRegionalBenchmark(primaryCrop);

    // Calculate rating, explanation, confidence, and tips
    const rating = calculateEfficiencyRating(litersPerHectare, benchmark);
    const explanation = generateWaterExplanation(litersPerHectare, benchmark, primaryCrop);
    const confidence = calculateConfidence(waterLogs.length);
    const conservationTips = getConservationTips(litersPerHectare, benchmark);

    return {
      liters_per_hectare: Math.round(litersPerHectare * 100) / 100,
      rating,
      explanation,
      benchmark_range: benchmark,
      confidence,
      crop: primaryCrop,
      total_water_liters: totalWater,
      total_hectares: Math.round(totalHectares * 100) / 100,
      data_points: waterLogs.length,
      ...(conservationTips ? { conservation_tips: conservationTips } : {}),
    };
  }

  /**
   * Calculate input cost efficiency for a farm.
   *
   * 1. Fetch all non-water input logs (fertilizer, pesticide, labor) with costs
   * 2. Fetch yield records for total production
   * 3. Calculate cost per kg of produce
   * 4. Compare against regional benchmarks
   * 5. Return rating, explanation, confidence, and potential savings
   */
  async calculateInputEfficiency(
    tenantId: string,
    farmId: string,
  ): Promise<InputEfficiencyResponse> {
    const farm = await this.farmRepo.findById(tenantId, farmId);
    if (!farm) {
      throw new SustainabilityError('Farm not found.', 404);
    }

    // Get all input logs with costs (fertilizer, pesticide, labor)
    const inputLogsResult = await this.inputRepo.query(
      tenantId,
      `SELECT * FROM input_logs WHERE farm_id = $1 AND input_type != $2 ORDER BY date DESC`,
      [farmId, InputType.WATER],
    );
    const inputLogs = inputLogsResult.rows;

    if (inputLogs.length === 0) {
      throw new SustainabilityError(
        'No input cost data found. Please log fertilizer and other input usage to track cost efficiency.',
        404,
      );
    }

    // Get yield records
    const yieldRepo = new BaseRepository('yield_records');
    const yieldResult = await yieldRepo.query(
      tenantId,
      `SELECT * FROM yield_records WHERE farm_id = $1`,
      [farmId],
    );
    const yields = yieldResult.rows;

    if (yields.length === 0) {
      throw new SustainabilityError(
        'No yield data found. Please log harvest information to calculate input efficiency.',
        404,
      );
    }

    // Get crops for benchmark
    const cropsResult = await this.cropRepo.query(
      tenantId,
      `SELECT * FROM crops WHERE farm_id = $1`,
      [farmId],
    );
    const crops = cropsResult.rows;

    if (crops.length === 0) {
      throw new SustainabilityError(
        'No crops found for this farm. Please add crops to calculate input efficiency.',
        404,
      );
    }

    const totalCost = inputLogs.reduce(
      (sum: number, log: Record<string, unknown>) => sum + ((log.cost as number) || 0),
      0,
    );
    const totalYieldKg = yields.reduce(
      (sum: number, y: Record<string, unknown>) => sum + ((y.quantity as number) || 0),
      0,
    );

    if (totalYieldKg <= 0) {
      throw new SustainabilityError('Total yield must be greater than 0.', 400);
    }

    const costPerKg = totalCost / totalYieldKg;
    const primaryCrop = (crops[0].crop_type as string) || 'unknown';
    const benchmark = getInputCostBenchmark(primaryCrop);

    const rating = calculateInputEfficiencyRating(costPerKg, benchmark);
    const explanation = generateInputExplanation(costPerKg, benchmark, primaryCrop);
    const confidence = calculateConfidence(inputLogs.length);
    const potentialSavings = estimateSavings(costPerKg, benchmark, totalYieldKg);

    return {
      cost_per_kg: Math.round(costPerKg * 100) / 100,
      rating,
      explanation,
      benchmark_range: benchmark,
      confidence,
      crop: primaryCrop,
      total_input_cost: Math.round(totalCost * 100) / 100,
      total_yield_kg: Math.round(totalYieldKg * 100) / 100,
      data_points: inputLogs.length,
      ...(potentialSavings !== undefined ? { potential_savings: potentialSavings } : {}),
    };
  }

  /**
   * Calculate climate risk index for a farm.
   *
   * 1. Get farm location
   * 2. Get weather forecast (synthetic data for MVP)
   * 3. Assess risks from forecast
   * 4. Calculate overall risk level
   * 5. Generate actionable recommendations
   */
  async calculateClimateRiskIndex(
    tenantId: string,
    farmId: string,
  ): Promise<ClimateRiskResponse> {
    const farm = await this.farmRepo.findById(tenantId, farmId);
    if (!farm) {
      throw new SustainabilityError('Farm not found.', 404);
    }

    let forecast: WeatherDay[];
    let weatherAvailable: boolean;

    try {
      forecast = await this.getWeatherForecast();
      weatherAvailable = true;
    } catch {
      // Handle unavailable weather data gracefully
      forecast = [];
      weatherAvailable = false;
    }

    if (!weatherAvailable || forecast.length === 0) {
      return {
        risk_level: RiskLevel.LOW,
        risks: [],
        recommendations: [],
        contributing_factors: [],
        forecast: [],
        last_updated: new Date().toISOString(),
        weather_available: false,
      };
    }

    const risks = assessClimateRisks(forecast);
    const riskLevel = calculateOverallRisk(risks);
    const recommendations = generateRiskRecommendations(risks);

    return {
      risk_level: riskLevel,
      risks,
      recommendations,
      contributing_factors: risks.map(r => r.description),
      forecast,
      last_updated: new Date().toISOString(),
      weather_available: true,
    };
  }

  /**
   * Get aggregated sustainability insights for a farm.
   */
  async getSustainabilityInsights(
    tenantId: string,
    farmId: string,
  ): Promise<SustainabilityInsightsResponse> {
    let waterEfficiency: WaterEfficiencyResponse | null = null;
    let inputEfficiency: InputEfficiencyResponse | null = null;
    let climateRisk: ClimateRiskResponse | null = null;

    try {
      waterEfficiency = await this.calculateWaterEfficiency(tenantId, farmId);
    } catch {
      // Water data may not be available
    }

    try {
      inputEfficiency = await this.calculateInputEfficiency(tenantId, farmId);
    } catch {
      // Input data may not be available
    }

    try {
      climateRisk = await this.calculateClimateRiskIndex(tenantId, farmId);
    } catch {
      // Climate data may not be available
    }

    return {
      farm_id: farmId,
      water_efficiency: waterEfficiency,
      input_efficiency: inputEfficiency,
      climate_risk: climateRisk,
      generated_at: new Date().toISOString(),
    };
  }

  /**
   * Get weather forecast. Uses synthetic data for MVP.
   * In production, this would integrate with a weather API.
   */
  private async getWeatherForecast(): Promise<WeatherDay[]> {
    return generateSyntheticWeather(7);
  }
}
