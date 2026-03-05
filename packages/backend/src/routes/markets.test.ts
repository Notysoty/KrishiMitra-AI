import request from 'supertest';
import express from 'express';
import { VolatilityLevel } from '../types';

// ── Mock dependencies ──────────────────────────────────────────

const mockGetPrices = jest.fn();
const mockGetHistoricalPrices = jest.fn();
const mockGetRecommendations = jest.fn();
const mockForecast = jest.fn();

jest.mock('../services/market', () => ({
  MarketService: jest.fn().mockImplementation(() => ({
    getPrices: mockGetPrices,
    getHistoricalPrices: mockGetHistoricalPrices,
  })),
  MarketIntelligence: jest.fn().mockImplementation(() => ({
    getRecommendations: mockGetRecommendations,
  })),
  PriceForecaster: jest.fn().mockImplementation(() => ({
    forecast: mockForecast,
  })),
  MarketError: class MarketError extends Error {
    statusCode: number;
    constructor(message: string, statusCode = 400) {
      super(message);
      this.name = 'MarketError';
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
  Permission: { MARKET_VIEW: 'market:view' },
}));

// Must import after mocks
import marketRoutes from './markets';

const app = express();
app.use(express.json());
app.use('/api/v1/markets', marketRoutes);

describe('GET /api/v1/markets/prices', () => {
  beforeEach(() => {
    mockGetPrices.mockReset();
    mockGetHistoricalPrices.mockReset();
    mockGetRecommendations.mockReset();
  });

  it('should return prices with required fields', async () => {
    mockGetPrices.mockResolvedValue({
      prices: [
        {
          id: 'p1',
          market_name: 'Azadpur Mandi',
          crop: 'wheat',
          price: 25,
          unit: 'per kg',
          date: new Date().toISOString(),
          source: 'Source: Synthetic Data (Demo)',
          location: { latitude: 28.7, longitude: 77.1 },
          volatility: VolatilityLevel.LOW,
          formatted_price: '₹25.00',
          last_updated: `Last Updated: ${new Date().toISOString()}`,
        },
      ],
      source: 'Source: Synthetic Data (Demo)',
      last_updated: `Last Updated: ${new Date().toISOString()}`,
    });

    const res = await request(app).get('/api/v1/markets/prices?crop=wheat');
    expect(res.status).toBe(200);
    expect(res.body.prices).toHaveLength(1);
    expect(res.body.prices[0].formatted_price).toMatch(/^₹/);
    expect(res.body.prices[0].last_updated).toContain('Last Updated:');
    expect(res.body.source).toContain('Source:');
  });

  it('should return 500 on unexpected error', async () => {
    mockGetPrices.mockRejectedValue(new Error('boom'));
    const res = await request(app).get('/api/v1/markets/prices?crop=wheat');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Internal server error.');
  });
});

describe('GET /api/v1/markets/prices/history', () => {
  beforeEach(() => {
    mockGetPrices.mockReset();
    mockGetHistoricalPrices.mockReset();
    mockGetRecommendations.mockReset();
  });

  it('should require crop query parameter', async () => {
    const res = await request(app).get('/api/v1/markets/prices/history');
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('crop');
  });

  it('should return historical data', async () => {
    mockGetHistoricalPrices.mockResolvedValue([
      {
        crop: 'wheat',
        market_name: 'Azadpur Mandi',
        period_months: 6,
        source: 'Source: Synthetic Data (Demo)',
        last_updated: `Last Updated: ${new Date().toISOString()}`,
        volatility: VolatilityLevel.MEDIUM,
        entries: [
          { date: '2024-01-01', price: 25, formatted_price: '₹25.00', market_name: 'Azadpur Mandi' },
        ],
      },
    ]);

    const res = await request(app).get('/api/v1/markets/prices/history?crop=wheat');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].period_months).toBe(6);
    expect(res.body[0].source).toContain('Source:');
    expect(res.body[0].last_updated).toContain('Last Updated:');
  });
});

describe('GET /api/v1/markets/recommendations', () => {
  beforeEach(() => {
    mockGetPrices.mockReset();
    mockGetHistoricalPrices.mockReset();
    mockGetRecommendations.mockReset();
  });

  it('should require crop query parameter', async () => {
    const res = await request(app).get(
      '/api/v1/markets/recommendations?latitude=28.6&longitude=77.2',
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('crop');
  });

  it('should require latitude and longitude', async () => {
    const res = await request(app).get(
      '/api/v1/markets/recommendations?crop=wheat',
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('latitude');
  });

  it('should reject invalid latitude/longitude', async () => {
    const res = await request(app).get(
      '/api/v1/markets/recommendations?crop=wheat&latitude=abc&longitude=77.2',
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Invalid');
  });

  it('should return recommendations with required fields', async () => {
    mockGetRecommendations.mockResolvedValue({
      crop: 'wheat',
      farm_location: { latitude: 28.6, longitude: 77.2 },
      recommendations: [
        {
          market_name: 'Azadpur Mandi',
          price: 25,
          distance: 15.5,
          transport_cost: 77.5,
          net_profit: -52.5,
          volatility: 'low',
          explanation: 'Highest price. Close distance. Stable prices',
          top_factors: ['Highest price: ₹25.00/kg', 'Lower distance: 15.5km', 'Stable prices'],
          logistics: 'Suitable for auto-rickshaw or small vehicle transport',
          confidence: 'High',
          warnings: [],
        },
      ],
      source: 'Source: Synthetic Data (Demo)',
      last_updated: `Last Updated: ${new Date().toISOString()}`,
    });

    const res = await request(app).get(
      '/api/v1/markets/recommendations?crop=wheat&latitude=28.6&longitude=77.2',
    );
    expect(res.status).toBe(200);
    expect(res.body.crop).toBe('wheat');
    expect(res.body.recommendations).toHaveLength(1);

    const rec = res.body.recommendations[0];
    expect(rec.market_name).toBe('Azadpur Mandi');
    expect(rec.top_factors.length).toBeLessThanOrEqual(3);
    expect(typeof rec.explanation).toBe('string');
    expect(typeof rec.logistics).toBe('string');
    expect(typeof rec.confidence).toBe('string');
    expect(Array.isArray(rec.warnings)).toBe(true);
  });

  it('should return 500 on unexpected error', async () => {
    mockGetRecommendations.mockRejectedValue(new Error('boom'));
    const res = await request(app).get(
      '/api/v1/markets/recommendations?crop=wheat&latitude=28.6&longitude=77.2',
    );
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Internal server error.');
  });
});

describe('GET /api/v1/markets/forecast', () => {
  beforeEach(() => {
    mockForecast.mockReset();
  });

  it('should require crop query parameter', async () => {
    const res = await request(app).get('/api/v1/markets/forecast');
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('crop');
  });

  it('should return forecast with required fields', async () => {
    mockForecast.mockResolvedValue({
      crop: 'wheat',
      forecast_days: 14,
      forecast_price: 25.5,
      formatted_forecast_price: '₹25.50',
      confidence_level: 'medium',
      confidence_interval: {
        lower: 20.0,
        upper: 31.0,
        formatted_range: '₹20.00-₹31.00 per kg',
      },
      daily_forecasts: [
        {
          date: '2024-07-01',
          forecast_price: 25.5,
          formatted_price: '₹25.50',
          confidence_interval: { lower: 20.0, upper: 31.0, formatted_lower: '₹20.00', formatted_upper: '₹31.00' },
        },
      ],
      methodology: 'Based on last 6 months of price patterns using moving average',
      disclaimer: 'Forecasts are estimates based on historical patterns and may not reflect actual future prices',
      significant_changes: [],
      last_updated: `Last Updated: ${new Date().toISOString()}`,
    });

    const res = await request(app).get('/api/v1/markets/forecast?crop=wheat');
    expect(res.status).toBe(200);
    expect(res.body.crop).toBe('wheat');
    expect(res.body.forecast_price).toBe(25.5);
    expect(res.body.confidence_level).toBe('medium');
    expect(res.body.confidence_interval.lower).toBeDefined();
    expect(res.body.confidence_interval.upper).toBeDefined();
    expect(res.body.methodology).toContain('moving average');
    expect(res.body.disclaimer).toContain('estimates');
    expect(res.body.last_updated).toContain('Last Updated:');
  });

  it('should accept optional days parameter', async () => {
    mockForecast.mockResolvedValue({
      crop: 'wheat',
      forecast_days: 7,
      forecast_price: 25.5,
      formatted_forecast_price: '₹25.50',
      confidence_level: 'high',
      confidence_interval: { lower: 22.0, upper: 29.0, formatted_range: '₹22.00-₹29.00 per kg' },
      daily_forecasts: [],
      methodology: 'Based on last 6 months of price patterns using moving average',
      disclaimer: 'Forecasts are estimates based on historical patterns and may not reflect actual future prices',
      significant_changes: [],
      last_updated: `Last Updated: ${new Date().toISOString()}`,
    });

    const res = await request(app).get('/api/v1/markets/forecast?crop=wheat&days=7');
    expect(res.status).toBe(200);
    expect(res.body.forecast_days).toBe(7);
  });

  it('should reject invalid days parameter', async () => {
    const res = await request(app).get('/api/v1/markets/forecast?crop=wheat&days=abc');
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('days');
  });

  it('should reject days out of range', async () => {
    const res = await request(app).get('/api/v1/markets/forecast?crop=wheat&days=50');
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('days');
  });

  it('should return 500 on unexpected error', async () => {
    mockForecast.mockRejectedValue(new Error('boom'));
    const res = await request(app).get('/api/v1/markets/forecast?crop=wheat');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Internal server error.');
  });
});
