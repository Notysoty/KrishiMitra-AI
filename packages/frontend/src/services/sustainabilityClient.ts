/**
 * API client for Sustainability Dashboard endpoints.
 * Returns mock responses with simulated delay for MVP.
 */

export type EfficiencyRating = 'High Efficiency' | 'Medium Efficiency' | 'Low Efficiency';
export type ConfidenceLevel = 'high' | 'medium' | 'low';
export type RiskLevel = 'low' | 'medium' | 'high';

export interface WaterEfficiencyData {
  liters_per_hectare: number;
  rating: EfficiencyRating;
  explanation: string;
  benchmark_range: { min: number; max: number };
  confidence: ConfidenceLevel;
  crop: string;
  total_water_liters: number;
  total_hectares: number;
  data_points: number;
  conservation_tips?: string[];
  last_updated: string;
}

export interface InputEfficiencyData {
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
  last_updated: string;
}

export interface WeatherDay {
  date: string;
  temperature: number;
  rainfall: number;
  wind_speed: number;
  rainfall_probability: number;
}

export interface RiskFactor {
  type: string;
  severity: RiskLevel;
  description: string;
}

export interface ClimateRiskData {
  risk_level: RiskLevel;
  risks: RiskFactor[];
  recommendations: string[];
  contributing_factors: string[];
  forecast: WeatherDay[];
  last_updated: string;
  weather_available: boolean;
}

export interface WeatherAlert {
  id: string;
  type: 'heavy_rain' | 'heatwave' | 'high_wind' | 'drought';
  severity: 'warning' | 'emergency';
  title: string;
  message: string;
  advice: string;
  created_at: string;
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function getWaterEfficiency(farmId: string): Promise<WaterEfficiencyData> {
  await delay(300);
  return {
    liters_per_hectare: 5200,
    rating: 'Medium Efficiency',
    explanation:
      'Your water usage is 5,200 liters/hectare, which is similar to the typical range of 4,000-6,000 liters/hectare for Tomato',
    benchmark_range: { min: 4000, max: 6000 },
    confidence: 'high',
    crop: 'Tomato',
    total_water_liters: 26000,
    total_hectares: 5,
    data_points: 12,
    conservation_tips: [
      'Consider switching to drip irrigation to reduce water usage by up to 40%.',
      'Mulching around crops can reduce evaporation and conserve soil moisture.',
    ],
    last_updated: new Date().toISOString(),
  };
}

export async function getInputEfficiency(farmId: string): Promise<InputEfficiencyData> {
  await delay(300);
  return {
    cost_per_kg: 8.5,
    rating: 'Medium Efficiency',
    explanation:
      'Your input cost is ₹8.50 per kg, which is similar to the typical range of ₹5-12 per kg',
    benchmark_range: { min: 5, max: 12 },
    confidence: 'medium',
    crop: 'Tomato',
    total_input_cost: 42500,
    total_yield_kg: 5000,
    data_points: 8,
    potential_savings: 5000,
    last_updated: new Date().toISOString(),
  };
}

export async function getClimateRisk(farmId: string): Promise<ClimateRiskData> {
  await delay(300);
  const now = new Date();
  const forecast: WeatherDay[] = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date(now);
    date.setDate(date.getDate() + i);
    forecast.push({
      date: date.toISOString().split('T')[0],
      temperature: 28 + Math.round(Math.random() * 10),
      rainfall: Math.round(Math.random() * 50),
      wind_speed: 8 + Math.round(Math.random() * 15),
      rainfall_probability: 20 + Math.round(Math.random() * 60),
    });
  }
  return {
    risk_level: 'medium',
    risks: [
      { type: 'heavy_rainfall', severity: 'medium', description: 'Moderate rainfall expected during flowering stage' },
      { type: 'heat_stress', severity: 'low', description: 'Temperatures within acceptable range' },
    ],
    recommendations: [
      'Ensure drainage channels are clear before expected rainfall.',
      'Monitor soil moisture levels closely this week.',
    ],
    contributing_factors: [
      'Moderate rainfall expected during flowering stage',
      'Temperatures within acceptable range',
    ],
    forecast,
    last_updated: new Date().toISOString(),
    weather_available: true,
  };
}

export async function getWeatherAlerts(farmId: string): Promise<WeatherAlert[]> {
  await delay(200);
  return [
    {
      id: 'wa-1',
      type: 'heavy_rain',
      severity: 'warning',
      title: 'Heavy Rain Expected',
      message: 'Heavy rainfall (60-80mm) expected in the next 48 hours.',
      advice: 'Ensure drainage channels are clear. Delay any planned spraying.',
      created_at: new Date().toISOString(),
    },
    {
      id: 'wa-2',
      type: 'high_wind',
      severity: 'warning',
      title: 'Strong Winds Forecast',
      message: 'Wind speeds of 25-35 km/h expected tomorrow.',
      advice: 'Secure any temporary structures. Avoid pesticide application.',
      created_at: new Date(Date.now() - 3600000).toISOString(),
    },
  ];
}
