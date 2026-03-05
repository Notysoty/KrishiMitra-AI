/**
 * API client for Market Intelligence endpoints.
 * Returns mock responses with simulated delay for MVP.
 */

export interface MarketPrice {
  id: string;
  market_name: string;
  crop: string;
  price: number;
  unit: string;
  date: string;
  source: string;
  volatility: 'low' | 'medium' | 'high';
  location: { latitude: number; longitude: number };
}

export interface MarketPriceResponse {
  prices: MarketPrice[];
  last_updated: string;
}

export interface MarketRecommendation {
  market_name: string;
  price: number;
  distance: number;
  transport_cost: number;
  net_profit: number;
  volatility: 'low' | 'medium' | 'high';
  explanation: string;
  top_factors: string[];
}

export interface PriceForecastData {
  crop: string;
  forecast_price: number;
  confidence_level: 'high' | 'medium' | 'low';
  confidence_interval: { lower: number; upper: number };
  methodology: string;
  disclaimer: string;
  last_updated: string;
}

export interface PriceAlert {
  id: string;
  crop: string;
  market: string;
  condition: 'above' | 'below';
  threshold: number;
  active: boolean;
  created_at: string;
}

export interface AlertNotification {
  id: string;
  type: 'price_change' | 'threshold_crossed';
  title: string;
  message: string;
  crop: string;
  market: string;
  priority: 'low' | 'medium' | 'high';
  actionable_info: string;
  created_at: string;
  read: boolean;
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

function generateHistoricalPrices(crop: string): MarketPrice[] {
  const markets = ['Azadpur Mandi', 'Vashi Market', 'Koyambedu Market'];
  const prices: MarketPrice[] = [];
  const now = Date.now();
  for (let i = 180; i >= 0; i -= 7) {
    for (const market of markets) {
      prices.push({
        id: `mp-${market}-${i}`,
        market_name: market,
        crop,
        price: Math.round((25 + Math.random() * 20) * 100) / 100,
        unit: 'kg',
        date: new Date(now - i * 86400000).toISOString(),
        source: i % 2 === 0 ? 'Agmarknet' : 'Synthetic Data (Demo)',
        volatility: i % 3 === 0 ? 'high' : i % 3 === 1 ? 'medium' : 'low',
        location: { latitude: 28.6 + Math.random(), longitude: 77.2 + Math.random() },
      });
    }
  }
  return prices;
}

export async function getMarketPrices(crop: string): Promise<MarketPriceResponse> {
  await delay(300);
  return {
    prices: generateHistoricalPrices(crop),
    last_updated: new Date().toISOString(),
  };
}

export async function getMarketRecommendations(crop: string): Promise<MarketRecommendation[]> {
  await delay(300);
  return [
    {
      market_name: 'Azadpur Mandi',
      price: 38.5,
      distance: 25,
      transport_cost: 125,
      net_profit: 37.0,
      volatility: 'low',
      explanation: 'Highest price. Close distance. Stable prices.',
      top_factors: ['Higher price: ₹38.50/kg', 'Lower distance: 25km', 'Stable prices'],
    },
    {
      market_name: 'Vashi Market',
      price: 36.0,
      distance: 85,
      transport_cost: 425,
      net_profit: 31.75,
      volatility: 'medium',
      explanation: 'Competitive price. Moderate distance.',
      top_factors: ['Competitive price: ₹36.00/kg', 'Moderate distance: 85km'],
    },
    {
      market_name: 'Koyambedu Market',
      price: 40.0,
      distance: 150,
      transport_cost: 750,
      net_profit: 25.0,
      volatility: 'high',
      explanation: 'Highest price but long distance. Price volatility risk.',
      top_factors: ['Highest price: ₹40.00/kg', 'Long distance: 150km', 'Price volatility risk'],
    },
  ];
}

export async function getPriceForecast(crop: string): Promise<PriceForecastData> {
  await delay(300);
  return {
    crop,
    forecast_price: 35.5,
    confidence_level: 'medium',
    confidence_interval: { lower: 28.0, upper: 43.0 },
    methodology: 'Based on last 6 months of price patterns using moving average',
    disclaimer: 'Forecasts are estimates based on historical patterns and may not reflect actual future prices',
    last_updated: new Date().toISOString(),
  };
}

export async function createPriceAlert(alert: Omit<PriceAlert, 'id' | 'active' | 'created_at'>): Promise<PriceAlert> {
  await delay(300);
  return {
    ...alert,
    id: `alert-${Date.now()}`,
    active: true,
    created_at: new Date().toISOString(),
  };
}

export async function getPriceAlerts(): Promise<PriceAlert[]> {
  await delay(200);
  return [
    { id: 'alert-1', crop: 'Tomato', market: 'Azadpur Mandi', condition: 'above', threshold: 40, active: true, created_at: new Date().toISOString() },
    { id: 'alert-2', crop: 'Rice', market: 'Vashi Market', condition: 'below', threshold: 20, active: true, created_at: new Date().toISOString() },
  ];
}

export async function getAlertNotifications(): Promise<AlertNotification[]> {
  await delay(200);
  return [
    {
      id: 'notif-1',
      type: 'price_change',
      title: 'Tomato price alert',
      message: 'Tomato prices up 20% at Azadpur Mandi. Consider selling soon.',
      crop: 'Tomato',
      market: 'Azadpur Mandi',
      priority: 'high',
      actionable_info: 'Current price: ₹42.00/kg. Price increased 20% in the last 7 days.',
      created_at: new Date().toISOString(),
      read: false,
    },
    {
      id: 'notif-2',
      type: 'threshold_crossed',
      title: 'Rice price threshold',
      message: 'Rice price dropped below ₹20/kg at Vashi Market.',
      crop: 'Rice',
      market: 'Vashi Market',
      priority: 'medium',
      actionable_info: 'Current price: ₹18.50/kg. Your threshold was ₹20.00/kg.',
      created_at: new Date(Date.now() - 3600000).toISOString(),
      read: true,
    },
  ];
}
