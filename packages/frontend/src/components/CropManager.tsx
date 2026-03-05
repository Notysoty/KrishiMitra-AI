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
    <div data-testid="crop-manager">
      <h3>Crops</h3>
      {crops.length > 0 && (
        <ul data-testid="crop-list">
          {crops.map((crop) => (
            <li key={crop.id} data-testid={`crop-${crop.id}`} style={{ marginBottom: 8 }}>
              <strong>{crop.type}</strong> — {crop.variety} ({crop.acreage} acres, {crop.status})
              <button onClick={() => handleEdit(crop)} style={{ marginLeft: 8 }} type="button">Edit</button>
              {confirmRemoveId === crop.id ? (
                <span style={{ marginLeft: 8 }}>
                  <span>Remove this crop?</span>
                  <button onClick={() => handleRemove(crop.id)} type="button" data-testid="confirm-remove">Yes</button>
                  <button onClick={() => setConfirmRemoveId(null)} type="button">No</button>
                </span>
              ) : (
                <button onClick={() => setConfirmRemoveId(crop.id)} style={{ marginLeft: 4 }} type="button">Remove</button>
              )}
            </li>
          ))}
        </ul>
      )}
      <div data-testid="crop-form" style={{ border: '1px solid #ccc', padding: 12, marginTop: 8 }}>
        <h4>{editingId ? 'Edit Crop' : 'Add Crop'}</h4>
        <div>
          <label>Crop Type: <input value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} data-testid="crop-type" /></label>
          {errors.type && <span role="alert" style={{ color: 'red' }}>{errors.type}</span>}
        </div>
        <div>
          <label>Variety: <input value={form.variety} onChange={(e) => setForm({ ...form, variety: e.target.value })} data-testid="crop-variety" /></label>
          {errors.variety && <span role="alert" style={{ color: 'red' }}>{errors.variety}</span>}
        </div>
        <div>
          <label>Acreage: <input type="number" value={form.acreage} onChange={(e) => setForm({ ...form, acreage: Number(e.target.value) })} data-testid="crop-acreage" /></label>
          {errors.acreage && <span role="alert" style={{ color: 'red' }}>{errors.acreage}</span>}
        </div>
        <div>
          <label>Planting Date: <input type="date" value={form.plantingDate} onChange={(e) => setForm({ ...form, plantingDate: e.target.value })} data-testid="crop-planting-date" /></label>
          {errors.plantingDate && <span role="alert" style={{ color: 'red' }}>{errors.plantingDate}</span>}
        </div>
        <div>
          <label>Expected Harvest: <input type="date" value={form.expectedHarvestDate} onChange={(e) => setForm({ ...form, expectedHarvestDate: e.target.value })} data-testid="crop-harvest-date" /></label>
          {errors.expectedHarvestDate && <span role="alert" style={{ color: 'red' }}>{errors.expectedHarvestDate}</span>}
        </div>
        <div>
          <label>Status:
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Crop['status'] })} data-testid="crop-status">
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
        </div>
        <button onClick={handleAdd} type="button" data-testid="crop-submit">{editingId ? 'Update Crop' : 'Add Crop'}</button>
        {editingId && <button onClick={handleCancel} type="button" style={{ marginLeft: 8 }}>Cancel</button>}
      </div>
    </div>
  );
};
