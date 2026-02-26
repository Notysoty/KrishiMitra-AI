import { VolatilityLevel, ConfidenceLevel } from './enums';
import { Location } from './base';

export interface MarketPrice {
  id: string;
  market_name: string;
  crop: string;
  price: number;
  unit: string;
  date: Date;
  source: string;
  location: Location;
  created_at: Date;
}

export interface MarketRecommendation {
  market_name: string;
  price: number;
  distance: number;
  transport_cost: number;
  net_profit: number;
  volatility: VolatilityLevel;
  explanation: string;
  top_factors: string[];
}

export interface PriceForecast {
  crop: string;
  forecast_price: number;
  confidence_level: ConfidenceLevel;
  confidence_interval: {
    lower: number;
    upper: number;
  };
  methodology: string;
  disclaimer: string;
  last_updated: Date;
}
