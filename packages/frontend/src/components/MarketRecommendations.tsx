import React from 'react';
import { MarketRecommendation } from '../services/marketClient';

interface Props {
  recommendations: MarketRecommendation[];
}

function formatINR(amount: number): string {
  return `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const volatilityColors: Record<string, string> = {
  high: '#c62828',
  medium: '#f9a825',
  low: '#2e7d32',
};

export const MarketRecommendations: React.FC<Props> = ({ recommendations }) => {
  if (recommendations.length === 0) {
    return <div data-testid="no-recommendations">No market recommendations available.</div>;
  }

  return (
    <div data-testid="market-recommendations" style={{ padding: 16 }}>
      <h3>Market Recommendations</h3>
      <p style={{ fontSize: 12, color: '#666', marginBottom: 12 }}>
        Markets ranked by estimated net profit
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {recommendations.map((rec, idx) => (
          <div
            key={rec.market_name}
            data-testid={`recommendation-${idx}`}
            style={{
              border: '1px solid #e0e0e0',
              borderRadius: 8,
              padding: 12,
              backgroundColor: idx === 0 ? '#e8f5e9' : '#fff',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontWeight: 600, fontSize: 15 }}>
                  {idx + 1}. {rec.market_name}
                </span>
                {idx === 0 && (
                  <span style={{ marginLeft: 8, fontSize: 11, color: '#2e7d32', fontWeight: 600 }}>
                    ★ Best Option
                  </span>
                )}
              </div>
              <span
                data-testid={`rec-volatility-${idx}`}
                style={{
                  padding: '2px 8px',
                  borderRadius: 8,
                  fontSize: 11,
                  fontWeight: 600,
                  color: '#fff',
                  backgroundColor: volatilityColors[rec.volatility],
                }}
              >
                {rec.volatility.charAt(0).toUpperCase() + rec.volatility.slice(1)} Volatility
              </span>
            </div>

            <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 13 }}>
              <div>
                <div style={{ color: '#666' }}>Price</div>
                <div style={{ fontWeight: 600 }}>{formatINR(rec.price)}/kg</div>
              </div>
              <div>
                <div style={{ color: '#666' }}>Distance</div>
                <div style={{ fontWeight: 600 }}>{rec.distance}km</div>
              </div>
              <div>
                <div style={{ color: '#666' }}>Transport Cost</div>
                <div style={{ fontWeight: 600 }}>{formatINR(rec.transport_cost)}</div>
              </div>
              <div>
                <div style={{ color: '#666' }}>Net Profit</div>
                <div data-testid={`net-profit-${idx}`} style={{ fontWeight: 600, color: '#2e7d32' }}>
                  {formatINR(rec.net_profit)}/kg
                </div>
              </div>
            </div>

            {rec.distance > 100 && (
              <div data-testid={`distance-warning-${idx}`} role="alert" style={{ marginTop: 8, padding: '6px 10px', backgroundColor: '#fff3e0', borderRadius: 6, fontSize: 12, color: '#e65100' }}>
                ⚠️ Long distance may increase transportation costs and crop spoilage risk
              </div>
            )}

            <div data-testid={`explanation-${idx}`} style={{ marginTop: 8, fontSize: 12, color: '#555' }}>
              {rec.explanation}
            </div>

            <div data-testid={`top-factors-${idx}`} style={{ marginTop: 6 }}>
              <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>Top Factors:</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {rec.top_factors.map((factor, fi) => (
                  <span
                    key={fi}
                    style={{
                      padding: '2px 8px',
                      borderRadius: 12,
                      fontSize: 11,
                      backgroundColor: '#e3f2fd',
                      color: '#1565c0',
                    }}
                  >
                    {factor}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
