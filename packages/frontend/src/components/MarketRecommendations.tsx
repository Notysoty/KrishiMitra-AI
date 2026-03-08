import React from 'react';
import { MarketRecommendation } from '../services/marketClient';

interface Props {
  recommendations: MarketRecommendation[];
}

function formatINR(amount: number): string {
  return `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const volatilityBadge: Record<string, string> = {
  high: 'badge badge-red',
  medium: 'badge badge-yellow',
  low: 'badge badge-green',
};

export const MarketRecommendations: React.FC<Props> = ({ recommendations }) => {
  if (recommendations.length === 0) {
    return <div data-testid="no-recommendations" className="empty-state"><span className="empty-icon">📋</span><span className="empty-text">No market recommendations available.</span></div>;
  }

  return (
    <div data-testid="market-recommendations" className="flex flex-col gap-3">
      <div className="card-header">
        <h3>🏪 Market Recommendations</h3>
        <span className="text-xs text-muted">Markets ranked by estimated net profit</span>
      </div>

      {recommendations.map((rec, idx) => (
        <div
          key={rec.market_name}
          data-testid={`recommendation-${idx}`}
          className={`card ${idx === 0 ? '' : ''}`}
          style={idx === 0 ? { borderColor: 'var(--primary-light)', background: 'var(--success-light)' } : {}}
        >
          <div className="card-body">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-semibold" style={{ fontSize: '0.9375rem' }}>
                  {idx + 1}. {rec.market_name}
                </span>
                {idx === 0 && (
                  <span className="badge badge-green" style={{ marginLeft: 8 }}>
                    ★ Best Option
                  </span>
                )}
              </div>
              <span
                data-testid={`rec-volatility-${idx}`}
                className={volatilityBadge[rec.volatility]}
              >
                {rec.volatility.charAt(0).toUpperCase() + rec.volatility.slice(1)} Volatility
              </span>
            </div>

            <div className="stat-grid mt-3">
              <div className="stat-card" style={{ background: 'var(--gray-50)', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-md)' }}>
                <div className="stat-label">Price</div>
                <div className="stat-value" style={{ fontSize: '1rem' }}>{formatINR(rec.price)}/kg</div>
              </div>
              <div className="stat-card" style={{ background: 'var(--gray-50)', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-md)' }}>
                <div className="stat-label">Distance</div>
                <div className="stat-value" style={{ fontSize: '1rem' }}>{rec.distance}km</div>
              </div>
              <div className="stat-card" style={{ background: 'var(--gray-50)', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-md)' }}>
                <div className="stat-label">Transport Cost</div>
                <div className="stat-value" style={{ fontSize: '1rem' }}>{formatINR(rec.transport_cost)}</div>
              </div>
              <div className="stat-card" style={{ background: 'var(--success-light)', border: '1px solid var(--primary-light)', borderRadius: 'var(--radius-md)' }}>
                <div className="stat-label">Net Profit</div>
                <div data-testid={`net-profit-${idx}`} className="stat-value" style={{ fontSize: '1rem', color: 'var(--primary-700)' }}>
                  {formatINR(rec.net_profit)}/kg
                </div>
              </div>
            </div>

            {rec.distance > 100 && (
              <div data-testid={`distance-warning-${idx}`} role="alert" className="alert-box alert-warning mt-3">
                ⚠️ Long distance may increase transportation costs and crop spoilage risk
              </div>
            )}

            <div data-testid={`explanation-${idx}`} className="text-sm text-muted mt-3">
              {rec.explanation}
            </div>

            <div data-testid={`top-factors-${idx}`} className="mt-2">
              <div className="text-xs text-muted mb-2">Top Factors:</div>
              <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
                {rec.top_factors.map((factor, fi) => (
                  <span key={fi} className="badge badge-blue">
                    {factor}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
