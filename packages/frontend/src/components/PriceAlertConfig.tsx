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
    <div data-testid="price-alert-config" className="card mt-3">
      <div className="card-header">
        <h3>🔔 Price Alerts</h3>
      </div>
      <div className="card-body">
        <form onSubmit={handleSubmit} data-testid="alert-form" className="form-section">
          <div className="form-group">
            <label htmlFor="alert-crop" className="form-label">Crop</label>
            <select id="alert-crop" value={crop} onChange={(e) => setCrop(e.target.value)} data-testid="alert-crop-select" className="form-select">
              <option value="">Select crop...</option>
              {CROPS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="alert-market" className="form-label">Market</label>
            <select id="alert-market" value={market} onChange={(e) => setMarket(e.target.value)} data-testid="alert-market-select" className="form-select">
              <option value="">Select market...</option>
              {MARKETS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="alert-condition" className="form-label">Alert when price goes</label>
            <select id="alert-condition" value={condition} onChange={(e) => setCondition(e.target.value as 'above' | 'below')} data-testid="alert-condition-select" className="form-select">
              <option value="above">Above</option>
              <option value="below">Below</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="alert-threshold" className="form-label">Threshold (₹/kg)</label>
            <input
              id="alert-threshold"
              type="number"
              min="0"
              step="0.5"
              value={threshold || ''}
              onChange={(e) => setThreshold(Number(e.target.value))}
              data-testid="alert-threshold-input"
              className="form-input"
            />
          </div>

          <button type="submit" data-testid="create-alert-btn" className="btn btn-accent">
            Create Alert
          </button>
        </form>

        {submitted && (
          <div data-testid="alert-created-msg" role="status" className="alert-box alert-success mt-3">
            ✅ Alert created successfully!
          </div>
        )}

        {existingAlerts.length > 0 && (
          <div data-testid="existing-alerts" className="mt-4">
            <h4 className="mb-3">Active Alerts</h4>
            {existingAlerts.map((alert) => (
              <div key={alert.id} data-testid={`alert-item-${alert.id}`} className="crop-list-item">
                <div className="crop-info">
                  <div className="crop-name">{alert.crop}</div>
                  <div className="crop-details">
                    {alert.market} — Alert when price goes {alert.condition} ₹{alert.threshold}/kg
                  </div>
                </div>
                {alert.active && <span className="badge badge-green">● Active</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
