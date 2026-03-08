import React from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { PriceForecastData } from '../services/marketClient';

interface Props {
  forecast: PriceForecastData | null;
}

function formatINR(amount: number): string {
  return `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const confidenceBadge: Record<string, string> = {
  high: 'badge badge-green',
  medium: 'badge badge-yellow',
  low: 'badge badge-red',
};

export const PriceForecast: React.FC<Props> = ({ forecast }) => {
  if (!forecast) {
    return <div data-testid="no-forecast" className="empty-state"><span className="empty-icon">🔮</span><span className="empty-text">No forecast data available.</span></div>;
  }

  const changePercent = forecast.confidence_interval.upper > 0
    ? Math.round(((forecast.confidence_interval.upper - forecast.confidence_interval.lower) / forecast.forecast_price) * 100)
    : 0;

  return (
    <div data-testid="price-forecast" className="card">
      <div className="card-header">
        <h3>🔮 Price Forecast — {forecast.crop}</h3>
      </div>
      <div className="card-body">
        <div className="stat-grid">
          <div className="stat-card" style={{ background: 'var(--accent-light)', border: '1px solid #bfdbfe', borderRadius: 'var(--radius-md)' }}>
            <div className="stat-label">Forecast Price (14 days)</div>
            <div data-testid="forecast-price" className="stat-value" style={{ color: 'var(--accent)' }}>
              {formatINR(forecast.forecast_price)}/kg
            </div>
          </div>

          <div className="stat-card" style={{ background: 'var(--gray-50)', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-md)' }}>
            <div className="stat-label">Confidence Interval</div>
            <div data-testid="confidence-interval" className="stat-value" style={{ fontSize: '1.125rem' }}>
              {formatINR(forecast.confidence_interval.lower)} – {formatINR(forecast.confidence_interval.upper)}/kg
            </div>
          </div>

          <div className="stat-card" style={{ background: 'var(--gray-50)', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-md)' }}>
            <div className="stat-label">Confidence</div>
            <div data-testid="confidence-level">
              <span className={confidenceBadge[forecast.confidence_level]}>
                {forecast.confidence_level.charAt(0).toUpperCase() + forecast.confidence_level.slice(1)}
              </span>
            </div>
          </div>
        </div>

        {forecast.confidence_level === 'low' && (
          <div data-testid="low-confidence-warning" role="alert" className="alert-box alert-error mt-3">
            ⚠️ Prediction uncertainty is high. Use with caution.
          </div>
        )}

        {changePercent > 20 && (
          <div data-testid="significant-change-warning" role="alert" className="alert-box alert-warning mt-3">
            ⚠️ Significant price variation ({changePercent}%) forecasted. Monitor closely.
          </div>
        )}

        <div style={{ width: '100%', height: 200, marginTop: 16, marginBottom: 8 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={[
                { day: 'Today', price: forecast.confidence_interval.lower + (forecast.forecast_price - forecast.confidence_interval.lower) * 0.6, lower: forecast.confidence_interval.lower, upper: forecast.confidence_interval.upper },
                { day: 'Day 3', price: forecast.confidence_interval.lower + (forecast.forecast_price - forecast.confidence_interval.lower) * 0.75, lower: forecast.confidence_interval.lower * 0.98, upper: forecast.confidence_interval.upper * 1.01 },
                { day: 'Day 7', price: forecast.forecast_price * 0.97, lower: forecast.confidence_interval.lower * 0.97, upper: forecast.confidence_interval.upper * 1.02 },
                { day: 'Day 10', price: forecast.forecast_price * 0.99, lower: forecast.confidence_interval.lower * 0.96, upper: forecast.confidence_interval.upper * 1.03 },
                { day: 'Day 14', price: forecast.forecast_price, lower: forecast.confidence_interval.lower, upper: forecast.confidence_interval.upper },
              ]}
              margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="#9ca3af" />
              <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af" tickFormatter={(v: number) => `₹${v}`} domain={['auto', 'auto']} />
              <Tooltip formatter={(value) => [formatINR(Number(value ?? 0)), '']} />
              <Area type="monotone" dataKey="upper" stroke="transparent" fill="#bbf7d0" fillOpacity={0.5} name="Upper Bound" />
              <Area type="monotone" dataKey="lower" stroke="transparent" fill="#ffffff" fillOpacity={1} name="Lower Bound" />
              <Area type="monotone" dataKey="price" stroke="#16a34a" fill="#dcfce7" fillOpacity={0.6} strokeWidth={2} name="Forecast" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div data-testid="methodology" className="alert-box alert-info mt-3">
          <strong>Methodology:</strong> {forecast.methodology}
        </div>

        <div data-testid="forecast-disclaimer" className="disclaimer-text">
          {forecast.disclaimer}
        </div>

        <div data-testid="forecast-last-updated" className="text-xs text-muted mt-2">
          Last Updated: {new Date(forecast.last_updated).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })}
        </div>
      </div>
    </div>
  );
};
