import React from 'react';
import { InputEfficiencyData } from '../services/sustainabilityClient';

interface Props {
  data: InputEfficiencyData | null;
}

const ratingBadgeClass: Record<string, string> = {
  'High Efficiency': 'badge badge-green',
  'Medium Efficiency': 'badge badge-yellow',
  'Low Efficiency': 'badge badge-red',
};

const ratingBarColor: Record<string, string> = {
  'High Efficiency': 'var(--primary)',
  'Medium Efficiency': 'var(--warning)',
  'Low Efficiency': 'var(--danger)',
};

function formatINR(amount: number): string {
  return `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export const InputEfficiencyDisplay: React.FC<Props> = ({ data }) => {
  if (!data) {
    return (
      <div data-testid="input-efficiency-unavailable" className="empty-state">
        <div className="empty-icon">📊</div>
        <div className="empty-text">Input efficiency data is currently unavailable.</div>
      </div>
    );
  }

  const { cost_per_kg, rating, explanation, benchmark_range, confidence, potential_savings, last_updated } = data;
  const maxVal = Math.max(cost_per_kg, benchmark_range.max) * 1.3;
  const costPercent = (cost_per_kg / maxVal) * 100;
  const benchMinPercent = (benchmark_range.min / maxVal) * 100;
  const benchMaxPercent = (benchmark_range.max / maxVal) * 100;

  return (
    <div data-testid="input-efficiency-display" className="card-body">
      <h3>📊 Input Cost / Yield Tracking</h3>

      <div data-testid="input-last-updated" style={{ fontSize: '0.75rem', color: 'var(--gray-500)', marginBottom: 8, marginTop: 4 }}>
        Last Updated: {formatDate(last_updated)}
      </div>

      <div data-testid="input-rating" className={ratingBadgeClass[rating] || 'badge badge-gray'}>
        {rating}
      </div>

      <div data-testid="input-confidence" className="badge badge-gray" style={{ marginLeft: 8 }}>
        Confidence: {confidence.charAt(0).toUpperCase() + confidence.slice(1)}
      </div>

      <div data-testid="input-explanation" style={{ marginTop: 16, fontSize: '0.8125rem', color: 'var(--gray-700)', lineHeight: 1.6 }}>
        {explanation}
      </div>

      <div data-testid="input-chart" style={{ marginTop: 20 }}>
        <div style={{ fontSize: '0.75rem', fontWeight: 600, marginBottom: 6, color: 'var(--gray-600)' }}>Cost per kg vs Benchmark</div>
        <div className="progress-bar" style={{ height: 32, position: 'relative' }}>
          <div style={{
            position: 'absolute', left: `${benchMinPercent}%`, width: `${benchMaxPercent - benchMinPercent}%`,
            height: '100%', backgroundColor: 'var(--primary-100)', borderRadius: 'var(--radius-full)', opacity: 0.7,
          }} />
          <div className="progress-fill" style={{
            position: 'absolute', left: 0, width: `${costPercent}%`, height: '100%',
            background: ratingBarColor[rating] || 'var(--accent)',
          }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.6875rem', color: 'var(--gray-500)', marginTop: 4 }}>
          <span>₹0</span>
          <span>Your cost: {formatINR(cost_per_kg)}/kg</span>
          <span>Benchmark: {formatINR(benchmark_range.min)}-{formatINR(benchmark_range.max)}/kg</span>
        </div>
      </div>

      {potential_savings != null && potential_savings > 0 && (
        <div data-testid="potential-savings" className="alert-box alert-info" style={{ marginTop: 20 }}>
          <span style={{ fontWeight: 600, fontSize: '0.8125rem' }}>
            💰 Estimated Potential Savings: {formatINR(potential_savings)}
          </span>
        </div>
      )}
    </div>
  );
};
