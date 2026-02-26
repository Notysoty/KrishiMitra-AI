import {
  formatINR,
  calculateVolatility,
  getStaleWarning,
  generateSyntheticPrices,
  MarketService,
} from './MarketService';
import { VolatilityLevel } from '../../types';

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

describe('MarketService helpers', () => {
  // ── formatINR ──────────────────────────────────────────────

  describe('formatINR', () => {
    it('should format price with ₹ symbol and 2 decimals', () => {
      expect(formatINR(25)).toBe('₹25.00');
      expect(formatINR(1234.5)).toBe('₹1,234.50');
      expect(formatINR(0)).toBe('₹0.00');
    });
  });

  // ── calculateVolatility ────────────────────────────────────

  describe('calculateVolatility', () => {
    it('should return LOW for stable prices', () => {
      expect(calculateVolatility([25, 25, 25, 25])).toBe(VolatilityLevel.LOW);
    });

    it('should return LOW for single price', () => {
      expect(calculateVolatility([25])).toBe(VolatilityLevel.LOW);
    });

    it('should return LOW for empty array', () => {
      expect(calculateVolatility([])).toBe(VolatilityLevel.LOW);
    });

    it('should return MEDIUM for moderate variation', () => {
      // CV ~0.1 → MEDIUM
      expect(calculateVolatility([20, 22, 18, 21, 19])).toBe(VolatilityLevel.MEDIUM);
    });

    it('should return HIGH for large variation', () => {
      // CV > 0.15 → HIGH
      expect(calculateVolatility([10, 30, 15, 35, 5])).toBe(VolatilityLevel.HIGH);
    });
  });

  // ── getStaleWarning ────────────────────────────────────────

  describe('getStaleWarning', () => {
    it('should return undefined for recent data', () => {
      expect(getStaleWarning(new Date())).toBeUndefined();
    });

    it('should return warning for data older than 7 days', () => {
      const old = new Date();
      old.setDate(old.getDate() - 10);
      const warning = getStaleWarning(old);
      expect(warning).toContain('Data may be outdated');
      expect(warning).toContain('Last updated');
    });
  });
});

describe('generateSyntheticPrices', () => {
  it('should generate entries for all markets', () => {
    const markets = ['Market A', 'Market B', 'Market C'];
    const entries = generateSyntheticPrices('wheat', markets, 25);

    const uniqueMarkets = new Set(entries.map((e) => e.market_name));
    expect(uniqueMarkets.size).toBe(3);
  });

  it('should cover at least 6 months of data', () => {
    const entries = generateSyntheticPrices('wheat', ['Market A'], 25);
    const dates = entries.map((e) => e.date.getTime());
    const minDate = Math.min(...dates);
    const maxDate = Math.max(...dates);
    const diffMonths = (maxDate - minDate) / (1000 * 60 * 60 * 24 * 30);
    expect(diffMonths).toBeGreaterThanOrEqual(5.5); // ~6 months
  });

  it('should label source as Synthetic Data (Demo)', () => {
    const entries = generateSyntheticPrices('rice', ['Market A'], 35);
    expect(entries[0].source).toBe('Synthetic Data (Demo)');
  });

  it('should produce positive prices', () => {
    const entries = generateSyntheticPrices('tomato', ['Market A'], 30);
    for (const e of entries) {
      expect(e.price).toBeGreaterThan(0);
    }
  });
});

describe('MarketService', () => {
  const service = new MarketService();
  const tenantId = 'tenant-1';

  beforeEach(() => {
    mockQuery.mockReset();
    mockRelease.mockReset();
  });

  describe('getPrices', () => {
    it('should return synthetic data when DB is empty', async () => {
      // DB query returns empty
      mockQuery
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce(undefined) // SET LOCAL
        .mockResolvedValueOnce({ rows: [] }) // SELECT
        .mockResolvedValueOnce(undefined); // COMMIT

      const result = await service.getPrices(tenantId, 'wheat');

      expect(result.source).toBe('Source: Synthetic Data (Demo)');
      expect(result.last_updated).toContain('Last Updated:');
      expect(result.prices.length).toBeGreaterThanOrEqual(3); // min 3 markets
      for (const p of result.prices) {
        expect(p.formatted_price).toMatch(/^₹/);
        expect(p.source).toBe('Source: Synthetic Data (Demo)');
        expect(p.last_updated).toContain('Last Updated:');
        expect([VolatilityLevel.LOW, VolatilityLevel.MEDIUM, VolatilityLevel.HIGH]).toContain(
          p.volatility,
        );
      }
    });

    it('should return DB data when available', async () => {
      const now = new Date();
      mockQuery
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'mp-1',
              market_name: 'Azadpur Mandi',
              crop: 'wheat',
              price: 25.5,
              unit: 'per kg',
              date: now.toISOString(),
              source: 'eNAM',
              location: { latitude: 28.7, longitude: 77.1 },
            },
          ],
        })
        .mockResolvedValueOnce(undefined);

      const result = await service.getPrices(tenantId, 'wheat');
      expect(result.prices).toHaveLength(1);
      expect(result.prices[0].formatted_price).toBe('₹25.50');
      expect(result.source).toBe('Source: eNAM');
    });

    it('should fall back to synthetic on DB error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB down'));

      const result = await service.getPrices(tenantId, 'wheat');
      expect(result.source).toBe('Source: Synthetic Data (Demo)');
    });
  });

  describe('getHistoricalPrices', () => {
    it('should return synthetic historical data when DB is empty', async () => {
      mockQuery
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce(undefined);

      const result = await service.getHistoricalPrices(tenantId, 'wheat');

      expect(result.length).toBeGreaterThanOrEqual(3); // min 3 markets
      for (const market of result) {
        expect(market.crop).toBe('wheat');
        expect(market.period_months).toBe(6);
        expect(market.source).toBe('Source: Synthetic Data (Demo)');
        expect(market.last_updated).toContain('Last Updated:');
        expect(market.entries.length).toBeGreaterThan(100); // ~180 days
        for (const entry of market.entries.slice(0, 5)) {
          expect(entry.formatted_price).toMatch(/^₹/);
        }
      }
    });

    it('should filter by market name', async () => {
      mockQuery
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce(undefined);

      const result = await service.getHistoricalPrices(
        tenantId,
        'wheat',
        'Azadpur Mandi',
      );

      expect(result).toHaveLength(1);
      expect(result[0].market_name).toBe('Azadpur Mandi');
    });
  });
});
