import React from 'react';
import { PriceForecastData } from '../services/marketClient';

interface Props {
  forecast: PriceForecastData | null;
}

function formatINR(amount: number): string {
  return `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const confidenceColors: Record<string, string> = {
  high: '#2e7d32',
  medium: '#f9a825',
  low: '#c62828',
};

export const PriceForecast: React.FC<Props> = ({ forecast }) => {
  if (!forecast) {
    return <div data-testid="no-forecast">No forecast data available.</div>;
  }

  const changePercent = forecast.confidence_interval.upper > 0
    ? Math.round(((forecast.confidence_interval.upper - forecast.confidence_interval.lower) / forecast.forecast_price) * 100)
    : 0;

  return (
    <div data-testid="price-forecast" style={{ padding: 16 }}>
      <h3>Price Forecast — {forecast.crop}</h3>

      <div style={{ display: 'flex', gap: 16, marginTop: 12, flexWrap: 'wrap' }}>
        <div style={{ border: '1px solid #e0e0e0', borderRadius: 8, padding: 12, flex: 1, minWidth: 140 }}>
          <div style={{ fontSize: 12, color: '#666' }}>Forecast Price (14 days)</div>
          <div data-testid="forecast-price" style={{ fontSize: 24, fontWeight: 700, color: '#1976d2' }}>
            {formatINR(forecast.forecast_price)}/kg
          </div>
        </div>

        <div style={{ border: '1px solid #e0e0e0', borderRadius: 8, padding: 12, flex: 1, minWidth: 140 }}>
          <div style={{ fontSize: 12, color: '#666' }}>Confidence Interval</div>
          <div data-testid="confidence-interval" style={{ fontSize: 18, fontWeight: 600 }}>
            {formatINR(forecast.confidence_interval.lower)} – {formatINR(forecast.confidence_interval.upper)}/kg
          </div>
        </div>

        <div style={{ border: '1px solid #e0e0e0', borderRadius: 8, padding: 12, minWidth: 100 }}>
          <div style={{ fontSize: 12, color: '#666' }}>Confidence</div>
          <div
            data-testid="confidence-level"
            style={{
              fontSize: 16,
              fontWeight: 700,
              color: confidenceColors[forecast.confidence_level],
            }}
          >
            {forecast.confidence_level.charAt(0).toUpperCase() + forecast.confidence_level.slice(1)}
          </div>
        </div>
      </div>

      {forecast.confidence_level === 'low' && (
        <div data-testid="low-confidence-warning" role="alert" style={{ marginTop: 12, padding: '8px 12px', backgroundColor: '#ffebee', border: '1px solid #ef9a9a', borderRadius: 6, fontSize: 13, color: '#c62828' }}>
          ⚠️ Prediction uncertainty is high. Use with caution.
        </div>
      )}

      {changePercent > 20 && (
        <div data-testid="significant-change-warning" role="alert" style={{ marginTop: 12, padding: '8px 12px', backgroundColor: '#fff3e0', border: '1px solid #ffb74d', borderRadius: 6, fontSize: 13, color: '#e65100' }}>
          ⚠️ Significant price variation ({changePercent}%) forecasted. Monitor closely.
        </div>
      )}

      <div data-testid="methodology" style={{ marginTop: 12, padding: '8px 12px', backgroundColor: '#f5f5f5', borderRadius: 6, fontSize: 12, color: '#555' }}>
        <strong>Methodology:</strong> {forecast.methodology}
      </div>

      <div data-testid="forecast-disclaimer" style={{ marginTop: 8, fontSize: 11, fontStyle: 'italic', color: '#757575' }}>
        {forecast.disclaimer}
      </div>

      <div data-testid="forecast-last-updated" style={{ marginTop: 4, fontSize: 11, color: '#999' }}>
        Last Updated: {new Date(forecast.last_updated).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })}
      </div>
    </div>
  );
};
