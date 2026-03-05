import React from 'react';
import { WaterEfficiencyData } from '../services/sustainabilityClient';

interface Props {
  data: WaterEfficiencyData | null;
}

const ratingColors: Record<string, string> = {
  'High Efficiency': '#2e7d32',
  'Medium Efficiency': '#f9a825',
  'Low Efficiency': '#c62828',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export const WaterEfficiencyDisplay: React.FC<Props> = ({ data }) => {
  if (!data) {
    return (
      <div data-testid="water-efficiency-unavailable" style={{ padding: 16, color: '#888' }}>
        Water efficiency data is currently unavailable.
      </div>
    );
  }

  const { liters_per_hectare, rating, explanation, benchmark_range, confidence, conservation_tips, last_updated } = data;
  const maxVal = Math.max(liters_per_hectare, benchmark_range.max) * 1.2;
  const usagePercent = (liters_per_hectare / maxVal) * 100;
  const benchMinPercent = (benchmark_range.min / maxVal) * 100;
  const benchMaxPercent = (benchmark_range.max / maxVal) * 100;

  return (
    <div data-testid="water-efficiency-display" style={{ padding: 16 }}>
      <h3>Water Efficiency</h3>

      <div data-testid="water-last-updated" style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>
        Last Updated: {formatDate(last_updated)}
      </div>

      <div data-testid="water-rating" style={{
        display: 'inline-block', padding: '4px 12px', borderRadius: 12,
        fontWeight: 600, fontSize: 14, color: '#fff',
        backgroundColor: ratingColors[rating] || '#666',
      }}>
        {rating}
      </div>

      <div data-testid="water-confidence" style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
        Confidence: {confidence.charAt(0).toUpperCase() + confidence.slice(1)}
      </div>

      <div data-testid="water-explanation" style={{ marginTop: 12, fontSize: 13, color: '#333', lineHeight: 1.5 }}>
        {explanation}
      </div>

      {/* Visual bar chart */}
      <div data-testid="water-chart" style={{ marginTop: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 4 }}>Usage vs Benchmark</div>
        <div style={{ position: 'relative', height: 32, backgroundColor: '#e0e0e0', borderRadius: 4 }}>
          {/* Benchmark range */}
          <div style={{
            position: 'absolute', left: `${benchMinPercent}%`, width: `${benchMaxPercent - benchMinPercent}%`,
            height: '100%', backgroundColor: '#c8e6c9', borderRadius: 4, opacity: 0.7,
          }} />
          {/* Usage bar */}
          <div style={{
            position: 'absolute', left: 0, width: `${usagePercent}%`, height: '100%',
            backgroundColor: ratingColors[rating] || '#1976d2', borderRadius: 4, opacity: 0.8,
          }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#888', marginTop: 2 }}>
          <span>0</span>
          <span>Your usage: {liters_per_hectare.toLocaleString('en-IN')} L/ha</span>
          <span>Benchmark: {benchmark_range.min.toLocaleString('en-IN')}-{benchmark_range.max.toLocaleString('en-IN')} L/ha</span>
        </div>
      </div>

      {conservation_tips && conservation_tips.length > 0 && (
        <div data-testid="conservation-tips" style={{ marginTop: 16, padding: 12, backgroundColor: '#e8f5e9', borderRadius: 8 }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>💧 Water Conservation Tips</div>
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13 }}>
            {conservation_tips.map((tip, i) => <li key={i} style={{ marginBottom: 4 }}>{tip}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
};
