import { BaseRepository } from '../../db/BaseRepository';
import { MarketPrice, VolatilityLevel } from '../../types';
import { AgmarknetClient } from './AgmarknetClient';

// ── Constants ───────────────────────────────────────────────────

const STALE_DATA_THRESHOLD_DAYS = 7;
const HISTORICAL_MONTHS = 6;
const MIN_MARKETS_PER_CROP = 3;

// ── Response types ──────────────────────────────────────────────

export interface MarketPriceResponse {
  id: string;
  market_name: string;
  crop: string;
  price: number;
  unit: string;
  date: string;
  source: string;
  location: { latitude: number; longitude: number };
  volatility: VolatilityLevel;
  formatted_price: string;
  last_updated: string;
  stale_warning?: string;
}

export interface HistoricalPriceEntry {
  date: string;
  price: number;
  formatted_price: string;
  market_name: string;
}

export interface HistoricalPricesResponse {
  crop: string;
  market_name: string;
  period_months: number;
  source: string;
  last_updated: string;
  volatility: VolatilityLevel;
  entries: HistoricalPriceEntry[];
  stale_warning?: string;
}

export interface MarketPricesResult {
  prices: MarketPriceResponse[];
  source: string;
  last_updated: string;
  stale_warning?: string;
}

// ── Error class ─────────────────────────────────────────────────

export class MarketError extends Error {
  constructor(
    message: string,
    public statusCode: number = 400,
  ) {
    super(message);
    this.name = 'MarketError';
  }
}

// ── Helpers (exported for testing) ──────────────────────────────

/**
 * Format a price in INR with the ₹ symbol and Indian number formatting.
 */
export function formatINR(price: number): string {
  return `₹${price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Calculate volatility level from a series of prices.
 * Uses coefficient of variation (stddev / mean).
 */
export function calculateVolatility(prices: number[]): VolatilityLevel {
  if (prices.length < 2) return VolatilityLevel.LOW;

  const mean = prices.reduce((s, p) => s + p, 0) / prices.length;
  if (mean === 0) return VolatilityLevel.LOW;

  const variance = prices.reduce((s, p) => s + (p - mean) ** 2, 0) / prices.length;
  const cv = Math.sqrt(variance) / mean;

  if (cv < 0.05) return VolatilityLevel.LOW;
  if (cv < 0.15) return VolatilityLevel.MEDIUM;
  return VolatilityLevel.HIGH;
}

/**
 * Returns a stale-data warning string if the date is older than 7 days, or undefined.
 */
export function getStaleWarning(lastDate: Date): string | undefined {
  const diffMs = Date.now() - lastDate.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  if (diffDays > STALE_DATA_THRESHOLD_DAYS) {
    return `Data may be outdated. Last updated: ${lastDate.toISOString().split('T')[0]}`;
  }
  return undefined;
}


// ── Synthetic data generator ────────────────────────────────────

/**
 * Generate synthetic market price data for demo purposes.
 * Produces 6 months of daily prices across multiple markets for a crop.
 */
export function generateSyntheticPrices(
  crop: string,
  markets: string[],
  basePrice: number,
): Array<{
  market_name: string;
  crop: string;
  price: number;
  unit: string;
  date: Date;
  source: string;
  location: { latitude: number; longitude: number };
}> {
  const entries: Array<{
    market_name: string;
    crop: string;
    price: number;
    unit: string;
    date: Date;
    source: string;
    location: { latitude: number; longitude: number };
  }> = [];

  const now = new Date();
  const startDate = new Date(now);
  startDate.setMonth(startDate.getMonth() - HISTORICAL_MONTHS);

  // Synthetic market locations (approximate Indian market coordinates)
  const marketLocations: Record<string, { latitude: number; longitude: number }> = {
    'Azadpur Mandi': { latitude: 28.7041, longitude: 77.1025 },
    'Vashi APMC': { latitude: 19.076, longitude: 72.9981 },
    'Koyambedu Market': { latitude: 13.0694, longitude: 80.1948 },
    'Yeshwanthpur APMC': { latitude: 13.0206, longitude: 77.5381 },
    'Bowenpally Market': { latitude: 17.4684, longitude: 78.4747 },
  };

  for (const market of markets) {
    let price = basePrice;
    const loc = marketLocations[market] ?? { latitude: 20.5937, longitude: 78.9629 };
    const current = new Date(startDate);

    while (current <= now) {
      // Random walk with slight mean reversion
      const change = (Math.random() - 0.5) * basePrice * 0.04;
      const reversion = (basePrice - price) * 0.02;
      price = Math.max(price + change + reversion, basePrice * 0.5);

      entries.push({
        market_name: market,
        crop,
        price: Math.round(price * 100) / 100,
        unit: 'per kg',
        date: new Date(current),
        source: 'Synthetic Data (Demo)',
        location: loc,
      });

      current.setDate(current.getDate() + 1);
    }
  }

  return entries;
}

// ── Default crop configs ────────────────────────────────────────

const DEFAULT_CROPS: Record<string, { markets: string[]; basePrice: number }> = {
  wheat: { markets: ['Azadpur Mandi', 'Vashi APMC', 'Koyambedu Market'], basePrice: 25 },
  rice: { markets: ['Azadpur Mandi', 'Koyambedu Market', 'Yeshwanthpur APMC'], basePrice: 35 },
  tomato: { markets: ['Azadpur Mandi', 'Vashi APMC', 'Bowenpally Market'], basePrice: 30 },
  onion: { markets: ['Vashi APMC', 'Yeshwanthpur APMC', 'Bowenpally Market'], basePrice: 20 },
  potato: { markets: ['Azadpur Mandi', 'Vashi APMC', 'Koyambedu Market'], basePrice: 18 },
};

// ── MarketService ───────────────────────────────────────────────

export class MarketService extends BaseRepository {
  /** In-memory synthetic cache keyed by crop. */
  private syntheticCache = new Map<
    string,
    ReturnType<typeof generateSyntheticPrices>
  >();
  private agmarknet = new AgmarknetClient();

  constructor() {
    super('market_prices');
  }

  /**
   * Get current prices for a crop across markets.
   * Falls back to synthetic data when no DB rows exist.
   */
  async getPrices(
    tenantId: string,
    crop?: string,
  ): Promise<MarketPricesResult> {
    // 1. Try DB first
    const dbPrices = await this.fetchFromDB(tenantId, crop);
    if (dbPrices.length > 0) {
      return this.buildPricesResult(dbPrices);
    }

    // 2. Try real Agmarknet API
    if (this.agmarknet.isConfigured() && crop) {
      const livePrices = await this.agmarknet.fetchPrices(crop);
      if (livePrices.length > 0) {
        return this.buildAgmarknetPricesResult(livePrices, crop);
      }
    }

    // 3. Fallback to synthetic data
    const crops = crop ? [crop] : Object.keys(DEFAULT_CROPS);
    const allEntries: ReturnType<typeof generateSyntheticPrices> = [];

    for (const c of crops) {
      allEntries.push(...this.getSyntheticData(c));
    }

    return this.buildSyntheticPricesResult(allEntries, crop);
  }

  /**
   * Get historical prices for a crop at a specific market.
   * Returns minimum 6 months of data.
   */
  async getHistoricalPrices(
    tenantId: string,
    crop: string,
    marketName?: string,
  ): Promise<HistoricalPricesResponse[]> {
    // Try DB first
    const dbPrices = await this.fetchHistoricalFromDB(tenantId, crop, marketName);
    if (dbPrices.length > 0) {
      return this.buildHistoricalResult(dbPrices, crop);
    }

    // Fallback to synthetic data
    const entries = this.getSyntheticData(crop);
    const markets = marketName
      ? entries.filter((e) => e.market_name === marketName)
      : entries;

    return this.buildSyntheticHistoricalResult(markets, crop);
  }

  // ── Private helpers ─────────────────────────────────────────

  private async fetchFromDB(
    tenantId: string,
    crop?: string,
  ): Promise<Array<Record<string, unknown>>> {
    try {
      const where = crop
        ? 'WHERE crop = $1 ORDER BY date DESC'
        : 'ORDER BY date DESC';
      const params = crop ? [crop] : [];
      const result = await this.query(
        tenantId,
        `SELECT * FROM market_prices ${where} LIMIT 100`,
        params,
      );
      return result.rows;
    } catch {
      return [];
    }
  }

  private async fetchHistoricalFromDB(
    tenantId: string,
    crop: string,
    marketName?: string,
  ): Promise<Array<Record<string, unknown>>> {
    try {
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - HISTORICAL_MONTHS);

      let sql = `SELECT * FROM market_prices WHERE crop = $1 AND date >= $2`;
      const params: unknown[] = [crop, sixMonthsAgo];

      if (marketName) {
        sql += ` AND market_name = $3`;
        params.push(marketName);
      }
      sql += ` ORDER BY date ASC`;

      const result = await this.query(tenantId, sql, params);
      return result.rows;
    } catch {
      return [];
    }
  }

  private getSyntheticData(crop: string): ReturnType<typeof generateSyntheticPrices> {
    if (this.syntheticCache.has(crop)) {
      return this.syntheticCache.get(crop)!;
    }

    const config = DEFAULT_CROPS[crop] ?? {
      markets: ['Azadpur Mandi', 'Vashi APMC', 'Koyambedu Market'],
      basePrice: 25,
    };

    const data = generateSyntheticPrices(crop, config.markets, config.basePrice);
    this.syntheticCache.set(crop, data);
    return data;
  }

  private buildAgmarknetPricesResult(
    livePrices: import('./AgmarknetClient').AgmarknetPrice[],
    crop: string,
  ): MarketPricesResult {
    const now = new Date();
    const latestDate = livePrices.reduce(
      (latest, p) => (p.date > latest ? p.date : latest),
      livePrices[0].date,
    );
    const staleWarning = getStaleWarning(latestDate);

    // Deduplicate by market (keep latest)
    const byMarket = new Map<string, typeof livePrices[0]>();
    for (const p of livePrices) {
      const existing = byMarket.get(p.marketName);
      if (!existing || p.date > existing.date) byMarket.set(p.marketName, p);
    }

    const allPriceValues = livePrices.map((p) => p.pricePerKg);

    const prices: MarketPriceResponse[] = Array.from(byMarket.values()).map((p) => ({
      id: `agmarknet-${p.marketName}-${crop}-${p.date.toISOString().split('T')[0]}`,
      market_name: `${p.marketName} (${p.district}, ${p.state})`,
      crop,
      price: p.pricePerKg,
      unit: 'per kg',
      date: p.date.toISOString(),
      source: 'Source: Agmarknet / data.gov.in',
      location: { latitude: 20.5937, longitude: 78.9629 },
      volatility: calculateVolatility(allPriceValues),
      formatted_price: formatINR(p.pricePerKg),
      last_updated: `Last Updated: ${now.toISOString()}`,
      stale_warning: staleWarning,
    }));

    return {
      prices,
      source: 'Source: Agmarknet / data.gov.in (Live)',
      last_updated: `Last Updated: ${latestDate.toISOString()}`,
      stale_warning: staleWarning,
    };
  }

  private buildPricesResult(
    rows: Array<Record<string, unknown>>,
  ): MarketPricesResult {
    const now = new Date();
    const latestDate = rows.length > 0 ? new Date(rows[0].date as string) : now;
    const staleWarning = getStaleWarning(latestDate);

    // Group by market to get latest per market
    const byMarket = new Map<string, Record<string, unknown>>();
    for (const row of rows) {
      const key = `${row.market_name}-${row.crop}`;
      if (!byMarket.has(key)) byMarket.set(key, row);
    }

    const prices: MarketPriceResponse[] = [];
    for (const row of byMarket.values()) {
      const allPricesForMarket = rows
        .filter((r) => r.market_name === row.market_name && r.crop === row.crop)
        .map((r) => r.price as number);

      const price = row.price as number;
      const date = new Date(row.date as string);

      prices.push({
        id: row.id as string,
        market_name: row.market_name as string,
        crop: row.crop as string,
        price,
        unit: row.unit as string,
        date: date.toISOString(),
        source: `Source: ${row.source as string}`,
        location: row.location as { latitude: number; longitude: number },
        volatility: calculateVolatility(allPricesForMarket),
        formatted_price: formatINR(price),
        last_updated: `Last Updated: ${latestDate.toISOString()}`,
        stale_warning: getStaleWarning(date),
      });
    }

    return {
      prices,
      source: `Source: ${rows[0]?.source ?? 'Unknown'}`,
      last_updated: `Last Updated: ${latestDate.toISOString()}`,
      stale_warning: staleWarning,
    };
  }

  private buildSyntheticPricesResult(
    entries: ReturnType<typeof generateSyntheticPrices>,
    crop?: string,
  ): MarketPricesResult {
    const now = new Date();
    const today = now.toISOString().split('T')[0];

    // Get latest entry per market+crop
    const byKey = new Map<string, (typeof entries)[0]>();
    for (const e of entries) {
      const key = `${e.market_name}-${e.crop}`;
      const existing = byKey.get(key);
      if (!existing || e.date > existing.date) byKey.set(key, e);
    }

    const prices: MarketPriceResponse[] = [];
    for (const e of byKey.values()) {
      if (crop && e.crop !== crop) continue;

      const allPricesForMarket = entries
        .filter((x) => x.market_name === e.market_name && x.crop === e.crop)
        .map((x) => x.price);

      prices.push({
        id: `synth-${e.market_name}-${e.crop}-${today}`,
        market_name: e.market_name,
        crop: e.crop,
        price: e.price,
        unit: e.unit,
        date: e.date.toISOString(),
        source: 'Source: Synthetic Data (Demo)',
        location: e.location,
        volatility: calculateVolatility(allPricesForMarket),
        formatted_price: formatINR(e.price),
        last_updated: `Last Updated: ${now.toISOString()}`,
      });
    }

    return {
      prices,
      source: 'Source: Synthetic Data (Demo)',
      last_updated: `Last Updated: ${now.toISOString()}`,
    };
  }

  private buildHistoricalResult(
    rows: Array<Record<string, unknown>>,
    crop: string,
  ): HistoricalPricesResponse[] {
    const byMarket = new Map<string, Array<Record<string, unknown>>>();
    for (const row of rows) {
      const market = row.market_name as string;
      if (!byMarket.has(market)) byMarket.set(market, []);
      byMarket.get(market)!.push(row);
    }

    const results: HistoricalPricesResponse[] = [];
    for (const [market, marketRows] of byMarket) {
      const prices = marketRows.map((r) => r.price as number);
      const dates = marketRows.map((r) => new Date(r.date as string));
      const latestDate = dates.reduce((a, b) => (a > b ? a : b), dates[0]);

      results.push({
        crop,
        market_name: market,
        period_months: HISTORICAL_MONTHS,
        source: `Source: ${marketRows[0]?.source ?? 'Unknown'}`,
        last_updated: `Last Updated: ${latestDate.toISOString()}`,
        volatility: calculateVolatility(prices),
        entries: marketRows.map((r) => ({
          date: new Date(r.date as string).toISOString().split('T')[0],
          price: r.price as number,
          formatted_price: formatINR(r.price as number),
          market_name: market,
        })),
        stale_warning: getStaleWarning(latestDate),
      });
    }

    return results;
  }

  private buildSyntheticHistoricalResult(
    entries: ReturnType<typeof generateSyntheticPrices>,
    crop: string,
  ): HistoricalPricesResponse[] {
    const now = new Date();
    const byMarket = new Map<string, (typeof entries)>();
    for (const e of entries) {
      if (!byMarket.has(e.market_name)) byMarket.set(e.market_name, []);
      byMarket.get(e.market_name)!.push(e);
    }

    const results: HistoricalPricesResponse[] = [];
    for (const [market, marketEntries] of byMarket) {
      const prices = marketEntries.map((e) => e.price);

      results.push({
        crop,
        market_name: market,
        period_months: HISTORICAL_MONTHS,
        source: 'Source: Synthetic Data (Demo)',
        last_updated: `Last Updated: ${now.toISOString()}`,
        volatility: calculateVolatility(prices),
        entries: marketEntries.map((e) => ({
          date: e.date.toISOString().split('T')[0],
          price: e.price,
          formatted_price: formatINR(e.price),
          market_name: market,
        })),
      });
    }

    return results;
  }
}
