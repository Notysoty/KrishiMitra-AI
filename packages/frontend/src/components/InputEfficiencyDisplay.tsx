import React from 'react';
import { InputEfficiencyData } from '../services/sustainabilityClient';

interface Props {
  data: InputEfficiencyData | null;
}

const ratingColors: Record<string, string> = {
  'High Efficiency': '#2e7d32',
  'Medium Efficiency': '#f9a825',
  'Low Efficiency': '#c62828',
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
      <div data-testid="input-efficiency-unavailable" style={{ padding: 16, color: '#888' }}>
        Input efficiency data is currently unavailable.
      </div>
    );
  }

  const { cost_per_kg, rating, explanation, benchmark_range, confidence, potential_savings, last_updated } = data;
  const maxVal = Math.max(cost_per_kg, benchmark_range.max) * 1.3;
  const costPercent = (cost_per_kg / maxVal) * 100;
  const benchMinPercent = (benchmark_range.min / maxVal) * 100;
  const benchMaxPercent = (benchmark_range.max / maxVal) * 100;

  return (
    <div data-testid="input-efficiency-display" style={{ padding: 16 }}>
      <h3>Input Cost / Yield Tracking</h3>

      <div data-testid="input-last-updated" style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>
        Last Updated: {formatDate(last_updated)}
      </div>

      <div data-testid="input-rating" style={{
        display: 'inline-block', padding: '4px 12px', borderRadius: 12,
        fontWeight: 600, fontSize: 14, color: '#fff',
        backgroundColor: ratingColors[rating] || '#666',
      }}>
        {rating}
      </div>

      <div data-testid="input-confidence" style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
        Confidence: {confidence.charAt(0).toUpperCase() + confidence.slice(1)}
      </div>

      <div data-testid="input-explanation" style={{ marginTop: 12, fontSize: 13, color: '#333', lineHeight: 1.5 }}>
        {explanation}
      </div>

      {/* Visual bar chart */}
      <div data-testid="input-chart" style={{ marginTop: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 4 }}>Cost per kg vs Benchmark</div>
        <div style={{ position: 'relative', height: 32, backgroundColor: '#e0e0e0', borderRadius: 4 }}>
          <div style={{
            position: 'absolute', left: `${benchMinPercent}%`, width: `${benchMaxPercent - benchMinPercent}%`,
            height: '100%', backgroundColor: '#c8e6c9', borderRadius: 4, opacity: 0.7,
          }} />
          <div style={{
            position: 'absolute', left: 0, width: `${costPercent}%`, height: '100%',
            backgroundColor: ratingColors[rating] || '#1976d2', borderRadius: 4, opacity: 0.8,
          }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#888', marginTop: 2 }}>
          <span>₹0</span>
          <span>Your cost: {formatINR(cost_per_kg)}/kg</span>
          <span>Benchmark: {formatINR(benchmark_range.min)}-{formatINR(benchmark_range.max)}/kg</span>
        </div>
      </div>

      {potential_savings != null && potential_savings > 0 && (
        <div data-testid="potential-savings" style={{ marginTop: 16, padding: 12, backgroundColor: '#e3f2fd', borderRadius: 8 }}>
          <div style={{ fontWeight: 600, fontSize: 13 }}>
            💰 Estimated Potential Savings: {formatINR(potential_savings)}
          </div>
        </div>
      )}
    </div>
  );
};
