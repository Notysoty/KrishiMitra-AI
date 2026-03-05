import React, { useState } from 'react';
import { PriceAlert } from '../services/marketClient';

interface Props {
  existingAlerts: PriceAlert[];
  onCreateAlert: (alert: { crop: string; market: string; condition: 'above' | 'below'; threshold: number }) => void;
}

const CROPS = ['Tomato', 'Rice', 'Wheat', 'Onion', 'Potato'];
const MARKETS = ['Azadpur Mandi', 'Vashi Market', 'Koyambedu Market'];

export const PriceAlertConfig: React.FC<Props> = ({ existingAlerts, onCreateAlert }) => {
  const [crop, setCrop] = useState('');
  const [market, setMarket] = useState('');
  const [condition, setCondition] = useState<'above' | 'below'>('above');
  const [threshold, setThreshold] = useState<number>(0);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!crop || !market || threshold <= 0) return;
    onCreateAlert({ crop, market, condition, threshold });
    setSubmitted(true);
    setCrop('');
    setMarket('');
    setThreshold(0);
    setTimeout(() => setSubmitted(false), 3000);
  };

  return (
    <div data-testid="price-alert-config" style={{ padding: 16 }}>
      <h3>Price Alerts</h3>

      <form onSubmit={handleSubmit} data-testid="alert-form" style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
        <div>
          <label htmlFor="alert-crop">Crop: </label>
          <select id="alert-crop" value={crop} onChange={(e) => setCrop(e.target.value)} data-testid="alert-crop-select">
            <option value="">Select crop...</option>
            {CROPS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div>
          <label htmlFor="alert-market">Market: </label>
          <select id="alert-market" value={market} onChange={(e) => setMarket(e.target.value)} data-testid="alert-market-select">
            <option value="">Select market...</option>
            {MARKETS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>

        <div>
          <label htmlFor="alert-condition">Alert when price goes: </label>
          <select id="alert-condition" value={condition} onChange={(e) => setCondition(e.target.value as 'above' | 'below')} data-testid="alert-condition-select">
            <option value="above">Above</option>
            <option value="below">Below</option>
          </select>
        </div>

        <div>
          <label htmlFor="alert-threshold">Threshold (₹/kg): </label>
          <input
            id="alert-threshold"
            type="number"
            min="0"
            step="0.5"
            value={threshold || ''}
            onChange={(e) => setThreshold(Number(e.target.value))}
            data-testid="alert-threshold-input"
          />
        </div>

        <button type="submit" data-testid="create-alert-btn" style={{ alignSelf: 'flex-start', padding: '6px 16px', borderRadius: 6, border: 'none', backgroundColor: '#1976d2', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>
          Create Alert
        </button>
      </form>

      {submitted && (
        <div data-testid="alert-created-msg" role="status" style={{ color: '#2e7d32', marginBottom: 12, fontSize: 13 }}>
          ✅ Alert created successfully!
        </div>
      )}

      {existingAlerts.length > 0 && (
        <div data-testid="existing-alerts">
          <h4>Active Alerts</h4>
          {existingAlerts.map((alert) => (
            <div key={alert.id} data-testid={`alert-item-${alert.id}`} style={{ padding: '8px 12px', border: '1px solid #e0e0e0', borderRadius: 6, marginBottom: 6, fontSize: 13 }}>
              <strong>{alert.crop}</strong> at {alert.market} — Alert when price goes {alert.condition} ₹{alert.threshold}/kg
              {alert.active && <span style={{ marginLeft: 8, color: '#2e7d32', fontSize: 11 }}>● Active</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
