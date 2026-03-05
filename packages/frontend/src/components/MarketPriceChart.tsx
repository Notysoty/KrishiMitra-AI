import React from 'react';
import { MarketPrice } from '../services/marketClient';

interface Props {
  prices: MarketPrice[];
  lastUpdated: string;
}

function isStaleData(lastUpdated: string): boolean {
  const diff = Date.now() - new Date(lastUpdated).getTime();
  return diff > 7 * 24 * 60 * 60 * 1000;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatINR(amount: number): string {
  return `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const volatilityColors: Record<string, string> = {
  high: '#c62828',
  medium: '#f9a825',
  low: '#2e7d32',
};

export const MarketPriceChart: React.FC<Props> = ({ prices, lastUpdated }) => {
  if (prices.length === 0) {
    return <div data-testid="no-price-data">No market price data available.</div>;
  }

  // Group by market
  const markets = Array.from(new Set(prices.map((p) => p.market_name)));
  const latestByMarket = markets.map((market) => {
    const marketPrices = prices.filter((p) => p.market_name === market);
    return marketPrices.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
  });

  const stale = isStaleData(lastUpdated);

  // Simple text-based chart: show price bars per market
  const maxPrice = Math.max(...latestByMarket.map((p) => p.price));

  return (
    <div data-testid="market-price-chart" style={{ padding: 16 }}>
      <h3>Market Prices</h3>

      <div data-testid="last-updated" style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>
        Last Updated: {formatDate(lastUpdated)}
      </div>

      {stale && (
        <div data-testid="stale-data-warning" role="alert" style={{ padding: '8px 12px', backgroundColor: '#fff3e0', border: '1px solid #ffb74d', borderRadius: 6, marginBottom: 12, fontSize: 13, color: '#e65100' }}>
          ⚠️ Data may be outdated. Last updated: {formatDate(lastUpdated)}. Use with caution.
        </div>
      )}

      <div data-testid="price-comparison" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {latestByMarket.map((p) => (
          <div key={p.id} data-testid={`market-row-${p.market_name}`} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 140, fontSize: 13, fontWeight: 500 }}>{p.market_name}</div>
            <div style={{ flex: 1, height: 24, backgroundColor: '#e0e0e0', borderRadius: 4, position: 'relative' }}>
              <div
                style={{
                  width: `${(p.price / maxPrice) * 100}%`,
                  height: '100%',
                  backgroundColor: '#1976d2',
                  borderRadius: 4,
                }}
              />
            </div>
            <div style={{ width: 80, textAlign: 'right', fontWeight: 600, fontSize: 13 }}>
              {formatINR(p.price)}/{p.unit}
            </div>
            <span
              data-testid={`volatility-${p.market_name}`}
              style={{
                padding: '2px 8px',
                borderRadius: 8,
                fontSize: 11,
                fontWeight: 600,
                color: '#fff',
                backgroundColor: volatilityColors[p.volatility],
              }}
            >
              {p.volatility.charAt(0).toUpperCase() + p.volatility.slice(1)}
            </span>
            <span data-testid={`source-${p.market_name}`} style={{ fontSize: 11, color: '#888' }}>
              Source: {p.source}
            </span>
          </div>
        ))}
      </div>

      {/* Historical data table */}
      <details style={{ marginTop: 16 }}>
        <summary style={{ cursor: 'pointer', fontWeight: 500 }}>Historical Data (6 months)</summary>
        <div data-testid="historical-data" style={{ maxHeight: 300, overflowY: 'auto', marginTop: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #ccc' }}>
                <th style={{ textAlign: 'left', padding: 4 }}>Date</th>
                <th style={{ textAlign: 'left', padding: 4 }}>Market</th>
                <th style={{ textAlign: 'right', padding: 4 }}>Price</th>
                <th style={{ textAlign: 'center', padding: 4 }}>Volatility</th>
                <th style={{ textAlign: 'left', padding: 4 }}>Source</th>
              </tr>
            </thead>
            <tbody>
              {prices.slice(-30).map((p) => (
                <tr key={p.id} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: 4 }}>{formatDate(p.date)}</td>
                  <td style={{ padding: 4 }}>{p.market_name}</td>
                  <td style={{ padding: 4, textAlign: 'right' }}>{formatINR(p.price)}/{p.unit}</td>
                  <td style={{ padding: 4, textAlign: 'center', color: volatilityColors[p.volatility] }}>{p.volatility}</td>
                  <td style={{ padding: 4, fontSize: 11 }}>{p.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
};
