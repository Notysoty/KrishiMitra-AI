import React, { useState } from 'react';

export interface Crop {
  id: string;
  type: string;
  variety: string;
  acreage: number;
  plantingDate: string;
  expectedHarvestDate: string;
  status: 'planned' | 'planted' | 'growing' | 'harvested';
}

export interface CropManagerProps {
  crops: Crop[];
  onChange: (crops: Crop[]) => void;
}

const STATUSES: Crop['status'][] = ['planned', 'planted', 'growing', 'harvested'];

const STATUS_BADGE: Record<Crop['status'], string> = {
  planned: 'badge badge-blue',
  planted: 'badge badge-yellow',
  growing: 'badge badge-green',
  harvested: 'badge badge-purple',
};

const emptyCrop = (): Omit<Crop, 'id'> => ({
  type: '',
  variety: '',
  acreage: 0,
  plantingDate: '',
  expectedHarvestDate: '',
  status: 'planned',
});

export const CropManager: React.FC<CropManagerProps> = ({ crops, onChange }) => {
  const [form, setForm] = useState(emptyCrop());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!form.type.trim()) e.type = 'Crop type is required';
    if (!form.variety.trim()) e.variety = 'Variety is required';
    if (form.acreage <= 0) e.acreage = 'Acreage must be greater than 0';
    if (!form.plantingDate) e.plantingDate = 'Planting date is required';
    if (!form.expectedHarvestDate) e.expectedHarvestDate = 'Expected harvest date is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleAdd = () => {
    if (!validate()) return;
    if (editingId) {
      onChange(crops.map((c) => (c.id === editingId ? { ...form, id: editingId } : c)));
      setEditingId(null);
    } else {
      onChange([...crops, { ...form, id: Date.now().toString() }]);
    }
    setForm(emptyCrop());
    setErrors({});
  };

  const handleEdit = (crop: Crop) => {
    setEditingId(crop.id);
    setForm({ type: crop.type, variety: crop.variety, acreage: crop.acreage, plantingDate: crop.plantingDate, expectedHarvestDate: crop.expectedHarvestDate, status: crop.status });
    setErrors({});
  };

  const handleRemove = (id: string) => {
    onChange(crops.filter((c) => c.id !== id));
    setConfirmRemoveId(null);
  };

  const handleCancel = () => {
    setEditingId(null);
    setForm(emptyCrop());
    setErrors({});
  };

  return (
    <div data-testid="crop-manager" className="form-section">
      <div className="form-section-title">🌱 Crops</div>
      {crops.length > 0 && (
        <div data-testid="crop-list" className="mb-3">
          {crops.map((crop) => (
            <div key={crop.id} data-testid={`crop-${crop.id}`} className="crop-list-item">
              <div className="crop-info">
                <span className="crop-name">{crop.type}</span>
                <div className="crop-details">{crop.variety} · {crop.acreage} acres · <span className={STATUS_BADGE[crop.status]}>{crop.status}</span></div>
              </div>
              <div className="crop-actions">
                <button className="btn btn-ghost btn-sm" onClick={() => handleEdit(crop)} type="button">✏️ Edit</button>
                {confirmRemoveId === crop.id ? (
                  <span className="flex items-center gap-2">
                    <span className="text-sm">Remove?</span>
                    <button className="btn btn-danger btn-sm" onClick={() => handleRemove(crop.id)} type="button" data-testid="confirm-remove">Yes</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setConfirmRemoveId(null)} type="button">No</button>
                  </span>
                ) : (
                  <button className="btn btn-ghost btn-sm" onClick={() => setConfirmRemoveId(crop.id)} type="button">🗑️ Remove</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {crops.length === 0 && (
        <div className="empty-state mb-3">
          <div className="empty-icon">🌾</div>
          <div className="empty-text">No crops added yet</div>
        </div>
      )}
      <div data-testid="crop-form" className="card">
        <div className="card-header">{editingId ? '✏️ Edit Crop' : '➕ Add Crop'}</div>
        <div className="card-body">
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Crop Type</label>
              <input className="form-input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} data-testid="crop-type" placeholder="e.g. Rice, Wheat" />
              {errors.type && <span role="alert" className="form-error">{errors.type}</span>}
            </div>
            <div className="form-group">
              <label className="form-label">Variety</label>
              <input className="form-input" value={form.variety} onChange={(e) => setForm({ ...form, variety: e.target.value })} data-testid="crop-variety" placeholder="e.g. Basmati" />
              {errors.variety && <span role="alert" className="form-error">{errors.variety}</span>}
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Acreage</label>
            <input className="form-input" type="number" value={form.acreage} onChange={(e) => setForm({ ...form, acreage: Number(e.target.value) })} data-testid="crop-acreage" />
            {errors.acreage && <span role="alert" className="form-error">{errors.acreage}</span>}
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Planting Date</label>
              <input className="form-input" type="date" value={form.plantingDate} onChange={(e) => setForm({ ...form, plantingDate: e.target.value })} data-testid="crop-planting-date" />
              {errors.plantingDate && <span role="alert" className="form-error">{errors.plantingDate}</span>}
            </div>
            <div className="form-group">
              <label className="form-label">Expected Harvest</label>
              <input className="form-input" type="date" value={form.expectedHarvestDate} onChange={(e) => setForm({ ...form, expectedHarvestDate: e.target.value })} data-testid="crop-harvest-date" />
              {errors.expectedHarvestDate && <span role="alert" className="form-error">{errors.expectedHarvestDate}</span>}
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Status</label>
            <select className="form-select" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Crop['status'] })} data-testid="crop-status">
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="flex gap-2">
            <button className="btn btn-primary" onClick={handleAdd} type="button" data-testid="crop-submit">{editingId ? '✅ Update Crop' : '➕ Add Crop'}</button>
            {editingId && <button className="btn btn-secondary" onClick={handleCancel} type="button">Cancel</button>}
          </div>
        </div>
      </div>
    </div>
  );
};
