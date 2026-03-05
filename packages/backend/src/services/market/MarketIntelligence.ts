import { MarketRecommendation } from '../../types';
import { VolatilityLevel } from '../../types/enums';
import { Location } from '../../types/base';
import {
  MarketService,
  MarketPriceResponse,
  formatINR,
} from './MarketService';

// ── Constants ───────────────────────────────────────────────────

const TRANSPORT_COST_PER_KM = 5; // ₹5/km baseline
const LONG_DISTANCE_THRESHOLD_KM = 100;
const EARTH_RADIUS_KM = 6371;
const MAX_RECOMMENDATIONS = 5;

// ── Response types ──────────────────────────────────────────────

export interface MarketRecommendationResponse extends MarketRecommendation {
  logistics: string;
  confidence: string;
  warnings: string[];
}

export interface RecommendationsResult {
  crop: string;
  farm_location: Location;
  recommendations: MarketRecommendationResponse[];
  source: string;
  last_updated: string;
}

// ── Haversine helpers (exported for testing) ────────────────────

export function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Calculate the great-circle distance between two points using the Haversine formula.
 * Returns distance in kilometres.
 */
export function haversineDistance(from: Location, to: Location): number {
  const dLat = toRadians(to.latitude - from.latitude);
  const dLon = toRadians(to.longitude - from.longitude);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(from.latitude)) *
      Math.cos(toRadians(to.latitude)) *
      Math.sin(dLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

/**
 * Estimate transportation cost based on distance.
 * Baseline: ₹5 per km.
 */
export function estimateTransportCost(distanceKm: number): number {
  return Math.round(distanceKm * TRANSPORT_COST_PER_KM * 100) / 100;
}

// ── MarketIntelligence ──────────────────────────────────────────

export class MarketIntelligence {
  private marketService: MarketService;

  constructor(marketService?: MarketService) {
    this.marketService = marketService ?? new MarketService();
  }

  /**
   * Get ranked market recommendations for a crop based on net profit.
   */
  async getRecommendations(
    crop: string,
    farmLocation: Location,
    tenantId: string,
  ): Promise<RecommendationsResult> {
    const pricesResult = await this.marketService.getPrices(tenantId, crop);
    const prices = pricesResult.prices;

    if (prices.length === 0) {
      return {
        crop,
        farm_location: farmLocation,
        recommendations: [],
        source: pricesResult.source,
        last_updated: pricesResult.last_updated,
      };
    }

    const recommendations = prices.map((market) =>
      this.buildRecommendation(market, farmLocation, prices),
    );

    // Rank by net profit descending
    recommendations.sort((a, b) => b.net_profit - a.net_profit);

    return {
      crop,
      farm_location: farmLocation,
      recommendations: recommendations.slice(0, MAX_RECOMMENDATIONS),
      source: pricesResult.source,
      last_updated: pricesResult.last_updated,
    };
  }

  // ── Private helpers ─────────────────────────────────────────

  private buildRecommendation(
    market: MarketPriceResponse,
    farmLocation: Location,
    allPrices: MarketPriceResponse[],
  ): MarketRecommendationResponse {
    const distance = haversineDistance(farmLocation, market.location);
    const roundedDistance = Math.round(distance * 100) / 100;
    const transportCost = estimateTransportCost(roundedDistance);
    const netProfit = Math.round((market.price - transportCost) * 100) / 100;

    const warnings: string[] = [];
    if (distance > LONG_DISTANCE_THRESHOLD_KM) {
      warnings.push(
        'Long distance may increase transportation costs and crop spoilage risk',
      );
    }

    const confidence = this.assessConfidence(market);
    const topFactors = this.identifyTopFactors(market, roundedDistance, allPrices);
    const explanation = this.generateExplanation(market, roundedDistance, allPrices);
    const logistics = this.getLogisticsInfo(roundedDistance);

    return {
      market_name: market.market_name,
      price: market.price,
      distance: roundedDistance,
      transport_cost: transportCost,
      net_profit: netProfit,
      volatility: market.volatility,
      explanation,
      top_factors: topFactors,
      logistics,
      confidence,
      warnings,
    };
  }

  private identifyTopFactors(
    market: MarketPriceResponse,
    distance: number,
    allPrices: MarketPriceResponse[],
  ): string[] {
    const factors: string[] = [];
    const maxPrice = Math.max(...allPrices.map((p) => p.price));

    // Price factor
    if (market.price >= maxPrice) {
      factors.push(`Highest price: ${formatINR(market.price)}/kg`);
    } else if (market.price >= maxPrice * 0.9) {
      factors.push(`Competitive price: ${formatINR(market.price)}/kg`);
    } else {
      factors.push(`Price: ${formatINR(market.price)}/kg`);
    }

    // Distance factor
    if (distance < 50) {
      factors.push(`Lower distance: ${distance.toFixed(1)}km`);
    } else if (distance <= LONG_DISTANCE_THRESHOLD_KM) {
      factors.push(`Moderate distance: ${distance.toFixed(1)}km`);
    } else {
      factors.push(`Long distance: ${distance.toFixed(1)}km`);
    }

    // Volatility factor
    if (market.volatility === VolatilityLevel.LOW) {
      factors.push('Stable prices');
    } else if (market.volatility === VolatilityLevel.MEDIUM) {
      factors.push('Moderate price volatility');
    } else {
      factors.push('High price volatility risk');
    }

    return factors.slice(0, 3);
  }

  private generateExplanation(
    market: MarketPriceResponse,
    distance: number,
    allPrices: MarketPriceResponse[],
  ): string {
    const parts: string[] = [];
    const maxPrice = Math.max(...allPrices.map((p) => p.price));

    if (market.price >= maxPrice) {
      parts.push('Highest price');
    } else if (market.price >= maxPrice * 0.95) {
      parts.push('Competitive price');
    }

    if (distance < 50) {
      parts.push('Close distance');
    } else if (distance > LONG_DISTANCE_THRESHOLD_KM) {
      parts.push('Long distance may increase costs');
    }

    if (market.volatility === VolatilityLevel.LOW) {
      parts.push('Stable prices');
    } else if (market.volatility === VolatilityLevel.HIGH) {
      parts.push('Price volatility risk');
    }

    return parts.length > 0
      ? parts.join('. ')
      : `Market price: ${formatINR(market.price)}/kg at ${distance.toFixed(1)}km`;
  }

  private assessConfidence(market: MarketPriceResponse): string {
    // Check for stale data or other quality indicators
    if (market.stale_warning) {
      return 'Limited data available. Recommendation confidence: Low';
    }
    return 'High';
  }

  private getLogisticsInfo(distanceKm: number): string {
    if (distanceKm < 30) {
      return 'Suitable for auto-rickshaw or small vehicle transport';
    }
    if (distanceKm < 100) {
      return 'Suitable for pickup truck or mini-truck transport';
    }
    return 'Requires truck transport; consider cold chain for perishables';
  }
}
