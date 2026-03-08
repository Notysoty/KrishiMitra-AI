import React from 'react';
import { WaterEfficiencyData } from '../services/sustainabilityClient';

interface Props {
  data: WaterEfficiencyData | null;
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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export const WaterEfficiencyDisplay: React.FC<Props> = ({ data }) => {
  if (!data) {
    return (
      <div data-testid="water-efficiency-unavailable" className="empty-state">
        <div className="empty-icon">💧</div>
        <div className="empty-text">Water efficiency data is currently unavailable.</div>
      </div>
    );
  }

  const { liters_per_hectare, rating, explanation, benchmark_range, confidence, conservation_tips, last_updated } = data;
  const maxVal = Math.max(liters_per_hectare, benchmark_range.max) * 1.2;
  const usagePercent = (liters_per_hectare / maxVal) * 100;
  const benchMinPercent = (benchmark_range.min / maxVal) * 100;
  const benchMaxPercent = (benchmark_range.max / maxVal) * 100;

  return (
    <div data-testid="water-efficiency-display" className="card-body">
      <h3>💧 Water Efficiency</h3>

      <div data-testid="water-last-updated" style={{ fontSize: '0.75rem', color: 'var(--gray-500)', marginBottom: 8, marginTop: 4 }}>
        Last Updated: {formatDate(last_updated)}
      </div>

      <div data-testid="water-rating" className={ratingBadgeClass[rating] || 'badge badge-gray'}>
        {rating}
      </div>

      <div data-testid="water-confidence" className="badge badge-gray" style={{ marginLeft: 8 }}>
        Confidence: {confidence.charAt(0).toUpperCase() + confidence.slice(1)}
      </div>

      <div data-testid="water-explanation" style={{ marginTop: 16, fontSize: '0.8125rem', color: 'var(--gray-700)', lineHeight: 1.6 }}>
        {explanation}
      </div>

      <div data-testid="water-chart" style={{ marginTop: 20 }}>
        <div style={{ fontSize: '0.75rem', fontWeight: 600, marginBottom: 6, color: 'var(--gray-600)' }}>Usage vs Benchmark</div>
        <div className="progress-bar" style={{ height: 32, position: 'relative' }}>
          <div style={{
            position: 'absolute', left: `${benchMinPercent}%`, width: `${benchMaxPercent - benchMinPercent}%`,
            height: '100%', backgroundColor: 'var(--primary-100)', borderRadius: 'var(--radius-full)', opacity: 0.7,
          }} />
          <div className="progress-fill" style={{
            position: 'absolute', left: 0, width: `${usagePercent}%`, height: '100%',
            background: ratingBarColor[rating] || 'var(--accent)',
          }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.6875rem', color: 'var(--gray-500)', marginTop: 4 }}>
          <span>0</span>
          <span>Your usage: {liters_per_hectare.toLocaleString('en-IN')} L/ha</span>
          <span>Benchmark: {benchmark_range.min.toLocaleString('en-IN')}-{benchmark_range.max.toLocaleString('en-IN')} L/ha</span>
        </div>
      </div>

      {conservation_tips && conservation_tips.length > 0 && (
        <div data-testid="conservation-tips" className="alert-box alert-success" style={{ marginTop: 20, flexDirection: 'column' }}>
          <div style={{ fontWeight: 600, fontSize: '0.8125rem', marginBottom: 6 }}>💧 Water Conservation Tips</div>
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: '0.8125rem' }}>
            {conservation_tips.map((tip, i) => <li key={i} style={{ marginBottom: 4 }}>{tip}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
};
