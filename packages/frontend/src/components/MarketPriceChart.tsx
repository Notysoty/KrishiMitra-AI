import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
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

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

function formatINR(amount: number): string {
  return `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const volatilityBadge: Record<string, string> = {
  high: 'badge badge-red',
  medium: 'badge badge-yellow',
  low: 'badge badge-green',
};

const CHART_COLORS = ['#16a34a', '#2563eb', '#d97706', '#dc2626', '#7c3aed'];

export const MarketPriceChart: React.FC<Props> = ({ prices, lastUpdated }) => {
  if (prices.length === 0) {
    return <div data-testid="no-price-data" className="empty-state"><span className="empty-icon">📉</span><span className="empty-text">No market price data available.</span></div>;
  }

  const markets = Array.from(new Set(prices.map((p) => p.market_name)));
  const latestByMarket = markets.map((market) => {
    const marketPrices = prices.filter((p) => p.market_name === market);
    return marketPrices.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
  });

  const dates = Array.from(new Set(prices.map((p) => p.date))).sort();
  const chartData = dates.map((date) => {
    const entry: Record<string, string | number> = { date: formatShortDate(date) };
    markets.forEach((market) => {
      const found = prices.find((p) => p.date === date && p.market_name === market);
      if (found) entry[market] = found.price;
    });
    return entry;
  });

  const stale = isStaleData(lastUpdated);
  const maxPrice = Math.max(...latestByMarket.map((p) => p.price));

  return (
    <div data-testid="market-price-chart" className="card">
      <div className="card-header">
        <h3>📊 Market Prices</h3>
      </div>
      <div className="card-body">
        <div data-testid="last-updated" className="text-xs text-muted mb-3">
          Last Updated: {formatDate(lastUpdated)}
        </div>

        {stale && (
          <div data-testid="stale-data-warning" role="alert" className="alert-box alert-warning mb-3">
            ⚠️ Data may be outdated. Last updated: {formatDate(lastUpdated)}. Use with caution.
          </div>
        )}

        <div style={{ width: '100%', height: 280, marginBottom: 24 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#9ca3af" />
              <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af" tickFormatter={(v: number) => `₹${v}`} />
              <Tooltip formatter={(value) => [formatINR(Number(value ?? 0)), '']} labelStyle={{ fontWeight: 600 }} />
              <Legend />
              {markets.map((market, i) => (
                <Line
                  key={market}
                  type="monotone"
                  dataKey={market}
                  stroke={CHART_COLORS[i % CHART_COLORS.length]}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div data-testid="price-comparison" className="flex flex-col gap-3">
          {latestByMarket.map((p) => (
            <div key={p.id} data-testid={`market-row-${p.market_name}`} className="flex items-center gap-2">
              <div className="font-semibold text-sm" style={{ width: 140 }}>{p.market_name}</div>
              <div className="progress-bar" style={{ flex: 1 }}>
                <div
                  className="progress-fill"
                  style={{ width: `${(p.price / maxPrice) * 100}%` }}
                />
              </div>
              <div className="font-semibold text-sm" style={{ width: 80, textAlign: 'right' }}>
                {formatINR(p.price)}/{p.unit}
              </div>
              <span data-testid={`volatility-${p.market_name}`} className={volatilityBadge[p.volatility]}>
                {p.volatility.charAt(0).toUpperCase() + p.volatility.slice(1)}
              </span>
              <span data-testid={`source-${p.market_name}`} className="text-xs text-muted">
                Source: {p.source}
              </span>
            </div>
          ))}
        </div>

        <details className="mt-4">
          <summary className="font-semibold" style={{ cursor: 'pointer' }}>Historical Data (6 months)</summary>
          <div data-testid="historical-data" className="mt-2" style={{ maxHeight: 300, overflowY: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Market</th>
                  <th style={{ textAlign: 'right' }}>Price</th>
                  <th style={{ textAlign: 'center' }}>Volatility</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                {prices.slice(-30).map((p) => (
                  <tr key={p.id}>
                    <td>{formatDate(p.date)}</td>
                    <td>{p.market_name}</td>
                    <td style={{ textAlign: 'right' }}>{formatINR(p.price)}/{p.unit}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span className={volatilityBadge[p.volatility]}>{p.volatility}</span>
                    </td>
                    <td className="text-xs">{p.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </div>
    </div>
  );
};
