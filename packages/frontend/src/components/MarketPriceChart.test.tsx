import React from 'react';
import { render, screen } from '@testing-library/react';
import { MarketPriceChart } from './MarketPriceChart';
import { MarketPrice } from '../services/marketClient';

const makePrices = (overrides?: Partial<MarketPrice>[]): MarketPrice[] => [
  { id: 'p1', market_name: 'Azadpur Mandi', crop: 'Tomato', price: 38.5, unit: 'kg', date: new Date().toISOString(), source: 'Agmarknet', volatility: 'low', location: { latitude: 28.7, longitude: 77.2 }, ...overrides?.[0] },
  { id: 'p2', market_name: 'Vashi Market', crop: 'Tomato', price: 36.0, unit: 'kg', date: new Date().toISOString(), source: 'Synthetic Data (Demo)', volatility: 'medium', location: { latitude: 19.0, longitude: 73.0 }, ...overrides?.[1] },
  { id: 'p3', market_name: 'Koyambedu Market', crop: 'Tomato', price: 40.0, unit: 'kg', date: new Date().toISOString(), source: 'Agmarknet', volatility: 'high', location: { latitude: 13.0, longitude: 80.2 }, ...overrides?.[2] },
];

describe('MarketPriceChart', () => {
  it('renders empty state when no prices', () => {
    render(<MarketPriceChart prices={[]} lastUpdated={new Date().toISOString()} />);
    expect(screen.getByTestId('no-price-data')).toBeInTheDocument();
  });

  // Req 9.2: Data source labels
  it('displays data source labels for each market', () => {
    render(<MarketPriceChart prices={makePrices()} lastUpdated={new Date().toISOString()} />);
    expect(screen.getByTestId('source-Azadpur Mandi')).toHaveTextContent('Source: Agmarknet');
    expect(screen.getByTestId('source-Vashi Market')).toHaveTextContent('Source: Synthetic Data (Demo)');
  });

  // Req 9.3: Last Updated timestamp
  it('displays last updated timestamp', () => {
    render(<MarketPriceChart prices={makePrices()} lastUpdated={new Date().toISOString()} />);
    expect(screen.getByTestId('last-updated')).toHaveTextContent('Last Updated:');
  });

  // Req 9.4: Volatility indicators
  it('displays volatility indicators', () => {
    render(<MarketPriceChart prices={makePrices()} lastUpdated={new Date().toISOString()} />);
    expect(screen.getByTestId('volatility-Azadpur Mandi')).toHaveTextContent('Low');
    expect(screen.getByTestId('volatility-Vashi Market')).toHaveTextContent('Medium');
    expect(screen.getByTestId('volatility-Koyambedu Market')).toHaveTextContent('High');
  });

  // Req 9.5: Price comparison across 3+ markets
  it('shows price comparison across multiple markets', () => {
    render(<MarketPriceChart prices={makePrices()} lastUpdated={new Date().toISOString()} />);
    expect(screen.getByTestId('price-comparison')).toBeInTheDocument();
    expect(screen.getByTestId('market-row-Azadpur Mandi')).toBeInTheDocument();
    expect(screen.getByTestId('market-row-Vashi Market')).toBeInTheDocument();
    expect(screen.getByTestId('market-row-Koyambedu Market')).toBeInTheDocument();
  });

  // Req 9.6: Stale data warning
  it('shows stale data warning when data is older than 7 days', () => {
    const staleDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    render(<MarketPriceChart prices={makePrices()} lastUpdated={staleDate} />);
    expect(screen.getByTestId('stale-data-warning')).toHaveTextContent('Data may be outdated');
  });

  it('does not show stale warning for fresh data', () => {
    render(<MarketPriceChart prices={makePrices()} lastUpdated={new Date().toISOString()} />);
    expect(screen.queryByTestId('stale-data-warning')).not.toBeInTheDocument();
  });

  // Req 9.7: INR formatting
  it('displays prices in INR format', () => {
    render(<MarketPriceChart prices={makePrices()} lastUpdated={new Date().toISOString()} />);
    const row = screen.getByTestId('market-row-Azadpur Mandi');
    expect(row.textContent).toContain('₹');
    expect(row.textContent).toContain('/kg');
  });
});
