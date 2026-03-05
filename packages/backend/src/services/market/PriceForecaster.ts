import { PriceForecast } from '../../types';
import { ConfidenceLevel } from '../../types/enums';
import { MarketService, formatINR } from './MarketService';

// ── Constants ───────────────────────────────────────────────────

const HISTORICAL_DAYS = 180; // 6 months
const SMA_WINDOW = 30; // Last 30 days for moving average
const SIGNIFICANT_CHANGE_THRESHOLD = 0.20; // 20%
const FORECAST_DAYS_DEFAULT = 14;

// ── Response types ──────────────────────────────────────────────

export interface DailyForecastEntry {
  date: string;
  forecast_price: number;
  formatted_price: string;
  confidence_interval: {
    lower: number;
    upper: number;
    formatted_lower: string;
    formatted_upper: string;
  };
}

export interface PriceForecastResponse {
  crop: string;
  forecast_days: number;
  forecast_price: number;
  formatted_forecast_price: string;
  confidence_level: ConfidenceLevel;
  confidence_interval: {
    lower: number;
    upper: number;
    formatted_range: string;
  };
  daily_forecasts: DailyForecastEntry[];
  methodology: string;
  disclaimer: string;
  significant_changes: string[];
  last_updated: string;
}

// ── Helpers (exported for testing) ──────────────────────────────

/**
 * Calculate the standard deviation of a numeric array.
 */
export function calculateStdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const squaredDiffs = values.map((v) => (v - mean) ** 2);
  const variance = squaredDiffs.reduce((s, v) => s + v, 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * Calculate volatility from price returns and map to confidence level.
 * Lower volatility → higher confidence.
 */
export function volatilityToConfidence(prices: number[]): ConfidenceLevel {
  if (prices.length < 2) return ConfidenceLevel.LOW;

  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i - 1] !== 0) {
      returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
    }
  }

  if (returns.length === 0) return ConfidenceLevel.LOW;

  const vol = calculateStdDev(returns);
  if (vol < 0.05) return ConfidenceLevel.HIGH;
  if (vol < 0.15) return ConfidenceLevel.MEDIUM;
  return ConfidenceLevel.LOW;
}

/**
 * Simple moving average over the last `window` values.
 */
export function simpleMovingAverage(prices: number[], window: number): number {
  if (prices.length === 0) return 0;
  const slice = prices.slice(-window);
  return slice.reduce((s, p) => s + p, 0) / slice.length;
}

// ── PriceForecaster ─────────────────────────────────────────────

export class PriceForecaster {
  private marketService: MarketService;

  constructor(marketService?: MarketService) {
    this.marketService = marketService ?? new MarketService();
  }

  /**
   * Generate a price forecast for a crop.
   * Uses simple moving average of last 6 months of data.
   */
  async forecast(
    crop: string,
    tenantId: string,
    days: number = FORECAST_DAYS_DEFAULT,
  ): Promise<PriceForecastResponse> {
    // 1. Get historical prices (last 6 months)
    const historicalData = await this.marketService.getHistoricalPrices(
      tenantId,
      crop,
    );

    // Flatten all market entries into a single price series
    const allPrices = this.extractPriceSeries(historicalData);

    if (allPrices.length === 0) {
      return this.emptyForecast(crop, days);
    }

    // 2. Simple moving average forecast
    const forecastPrice = simpleMovingAverage(allPrices, SMA_WINDOW);
    const roundedForecast = Math.round(forecastPrice * 100) / 100;

    // 3. Calculate confidence based on historical volatility
    const confidence = volatilityToConfidence(allPrices);

    // 4. Calculate confidence interval using standard deviation
    const stdDev = calculateStdDev(allPrices);
    const margin = 1.96 * stdDev;
    const lower = Math.max(Math.round((roundedForecast - margin) * 100) / 100, 0);
    const upper = Math.round((roundedForecast + margin) * 100) / 100;

    // 5. Generate daily forecasts
    const dailyForecasts = this.generateDailyForecasts(
      roundedForecast,
      stdDev,
      days,
    );

    // 6. Detect significant price changes
    const significantChanges = this.detectSignificantChanges(
      allPrices,
      roundedForecast,
    );

    // 7. Build low-confidence warning if needed
    const disclaimer = this.buildDisclaimer(confidence);

    const now = new Date();

    return {
      crop,
      forecast_days: days,
      forecast_price: roundedForecast,
      formatted_forecast_price: formatINR(roundedForecast),
      confidence_level: confidence,
      confidence_interval: {
        lower,
        upper,
        formatted_range: `${formatINR(lower)}-${formatINR(upper)} per kg`,
      },
      daily_forecasts: dailyForecasts,
      methodology:
        'Based on last 6 months of price patterns using moving average',
      disclaimer,
      significant_changes: significantChanges,
      last_updated: `Last Updated: ${now.toISOString()}`,
    };
  }

  // ── Private helpers ─────────────────────────────────────────

  private extractPriceSeries(
    historicalData: Array<{ entries: Array<{ price: number }> }>,
  ): number[] {
    const prices: number[] = [];
    for (const market of historicalData) {
      for (const entry of market.entries) {
        prices.push(entry.price);
      }
    }
    return prices;
  }

  private generateDailyForecasts(
    basePrice: number,
    stdDev: number,
    days: number,
  ): DailyForecastEntry[] {
    const forecasts: DailyForecastEntry[] = [];
    const now = new Date();

    for (let i = 1; i <= days; i++) {
      const date = new Date(now);
      date.setDate(date.getDate() + i);

      // Widen confidence interval slightly for further-out days
      const dayFactor = 1 + (i - 1) * 0.02;
      const margin = 1.96 * stdDev * dayFactor;
      const lower = Math.max(Math.round((basePrice - margin) * 100) / 100, 0);
      const upper = Math.round((basePrice + margin) * 100) / 100;

      forecasts.push({
        date: date.toISOString().split('T')[0],
        forecast_price: basePrice,
        formatted_price: formatINR(basePrice),
        confidence_interval: {
          lower,
          upper,
          formatted_lower: formatINR(lower),
          formatted_upper: formatINR(upper),
        },
      });
    }

    return forecasts;
  }

  private detectSignificantChanges(
    historicalPrices: number[],
    forecastPrice: number,
  ): string[] {
    const changes: string[] = [];

    if (historicalPrices.length === 0) return changes;

    // Compare forecast to the average of the earliest month
    const earliestMonth = historicalPrices.slice(0, SMA_WINDOW);
    if (earliestMonth.length === 0) return changes;

    const earliestAvg =
      earliestMonth.reduce((s, p) => s + p, 0) / earliestMonth.length;

    if (earliestAvg === 0) return changes;

    const changePercent = (forecastPrice - earliestAvg) / earliestAvg;

    if (Math.abs(changePercent) > SIGNIFICANT_CHANGE_THRESHOLD) {
      const direction = changePercent > 0 ? 'increase' : 'decrease';
      const pct = Math.abs(Math.round(changePercent * 100));
      changes.push(
        `Significant price ${direction} of ${pct}% forecasted compared to 6 months ago (${formatINR(earliestAvg)} → ${formatINR(forecastPrice)})`,
      );
    }

    // Compare forecast to last month average
    const lastMonth = historicalPrices.slice(-SMA_WINDOW);
    const lastMonthAvg =
      lastMonth.reduce((s, p) => s + p, 0) / lastMonth.length;

    if (lastMonthAvg !== 0) {
      const recentChange = (forecastPrice - lastMonthAvg) / lastMonthAvg;
      if (Math.abs(recentChange) > SIGNIFICANT_CHANGE_THRESHOLD) {
        const dir = recentChange > 0 ? 'increase' : 'decrease';
        const pct = Math.abs(Math.round(recentChange * 100));
        changes.push(
          `Recent trend shows ${pct}% ${dir} compared to last month average`,
        );
      }
    }

    return changes;
  }

  private buildDisclaimer(confidence: ConfidenceLevel): string {
    const base =
      'Forecasts are estimates based on historical patterns and may not reflect actual future prices';
    if (confidence === ConfidenceLevel.LOW) {
      return `${base}. Prediction uncertainty is high. Use with caution.`;
    }
    return base;
  }

  private emptyForecast(crop: string, days: number): PriceForecastResponse {
    return {
      crop,
      forecast_days: days,
      forecast_price: 0,
      formatted_forecast_price: formatINR(0),
      confidence_level: ConfidenceLevel.LOW,
      confidence_interval: {
        lower: 0,
        upper: 0,
        formatted_range: `${formatINR(0)}-${formatINR(0)} per kg`,
      },
      daily_forecasts: [],
      methodology:
        'Based on last 6 months of price patterns using moving average',
      disclaimer:
        'Forecasts are estimates based on historical patterns and may not reflect actual future prices. Prediction uncertainty is high. Use with caution.',
      significant_changes: [],
      last_updated: `Last Updated: ${new Date().toISOString()}`,
    };
  }
}
