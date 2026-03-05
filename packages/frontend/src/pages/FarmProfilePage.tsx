import React, { useState } from 'react';
import { GPSCapture, GPSCoordinates } from '../components/GPSCapture';
import { CropManager, Crop } from '../components/CropManager';

const IRRIGATION_TYPES = ['rainfed', 'drip', 'sprinkler', 'canal', 'well'] as const;
const SOIL_TYPES = ['alluvial', 'black', 'red', 'laterite', 'sandy'] as const;

export interface FarmProfile {
  farmName: string;
  totalAcreage: number;
  latitude: number | null;
  longitude: number | null;
  state: string;
  district: string;
  irrigationType: string;
  soilType: string;
  crops: Crop[];
}

const TOOLTIPS: Record<string, string> = {
  farmName: 'Give your farm a name, e.g. "Green Valley Farm"',
  totalAcreage: 'Total cultivable area in acres',
  location: 'Use GPS or enter coordinates manually. Must be within India.',
  state: 'State where your farm is located, e.g. "Maharashtra"',
  district: 'District name, e.g. "Pune"',
  irrigationType: 'Primary source of water for your crops',
  soilType: 'Predominant soil type on your farm',
};

const helpStyle: React.CSSProperties = { fontSize: 12, color: '#666', marginTop: 2 };
const fieldStyle: React.CSSProperties = { marginBottom: 12 };

export const FarmProfilePage: React.FC = () => {
  const [profile, setProfile] = useState<FarmProfile>({
    farmName: '',
    totalAcreage: 0,
    latitude: null,
    longitude: null,
    state: '',
    district: '',
    irrigationType: '',
    soilType: '',
    crops: [],
  });
  const [saved, setSaved] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);

  const handleGPS = (coords: GPSCoordinates) => {
    setProfile((p) => ({ ...p, latitude: coords.latitude, longitude: coords.longitude }));
  };

  const handleSave = () => {
    if (!profile.farmName.trim()) {
      setFailedAttempts((n) => n + 1);
      return;
    }
    try {
      localStorage.setItem('krishimitra_farm_profile', JSON.stringify(profile));
    } catch { /* ignore */ }
    setSaved(true);
    setFailedAttempts(0);
  };

  return (
    <div data-testid="farm-profile-page" style={{ maxWidth: 560, margin: '0 auto', padding: 24 }}>
      <h2>Farm Profile</h2>

      <div style={fieldStyle}>
        <label>Farm Name: <input value={profile.farmName} onChange={(e) => setProfile({ ...profile, farmName: e.target.value })} data-testid="farm-name" /></label>
        <div style={helpStyle}>{TOOLTIPS.farmName}</div>
      </div>

      <div style={fieldStyle}>
        <label>Total Acreage: <input type="number" value={profile.totalAcreage} onChange={(e) => setProfile({ ...profile, totalAcreage: Number(e.target.value) })} data-testid="farm-acreage" /></label>
        <div style={helpStyle}>{TOOLTIPS.totalAcreage}</div>
      </div>

      <div style={fieldStyle}>
        <label>Location:</label>
        <div style={helpStyle}>{TOOLTIPS.location}</div>
        <GPSCapture onCapture={handleGPS} value={profile.latitude !== null && profile.longitude !== null ? { latitude: profile.latitude, longitude: profile.longitude } : null} />
        <div style={{ marginTop: 4 }}>
          <label>Lat: <input type="number" step="0.0001" value={profile.latitude ?? ''} onChange={(e) => setProfile({ ...profile, latitude: e.target.value ? Number(e.target.value) : null })} data-testid="farm-lat" /></label>
          <label style={{ marginLeft: 8 }}>Lng: <input type="number" step="0.0001" value={profile.longitude ?? ''} onChange={(e) => setProfile({ ...profile, longitude: e.target.value ? Number(e.target.value) : null })} data-testid="farm-lng" /></label>
        </div>
      </div>

      <div style={fieldStyle}>
        <label>State: <input value={profile.state} onChange={(e) => setProfile({ ...profile, state: e.target.value })} data-testid="farm-state" /></label>
        <div style={helpStyle}>{TOOLTIPS.state}</div>
      </div>

      <div style={fieldStyle}>
        <label>District: <input value={profile.district} onChange={(e) => setProfile({ ...profile, district: e.target.value })} data-testid="farm-district" /></label>
        <div style={helpStyle}>{TOOLTIPS.district}</div>
      </div>

      <div style={fieldStyle}>
        <label>Irrigation Type:
          <select value={profile.irrigationType} onChange={(e) => setProfile({ ...profile, irrigationType: e.target.value })} data-testid="farm-irrigation">
            <option value="">Select...</option>
            {IRRIGATION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <div style={helpStyle}>{TOOLTIPS.irrigationType}</div>
      </div>

      <div style={fieldStyle}>
        <label>Soil Type:
          <select value={profile.soilType} onChange={(e) => setProfile({ ...profile, soilType: e.target.value })} data-testid="farm-soil">
            <option value="">Select...</option>
            {SOIL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <div style={helpStyle}>{TOOLTIPS.soilType}</div>
      </div>

      <CropManager crops={profile.crops} onChange={(crops) => setProfile({ ...profile, crops })} />

      <div style={{ marginTop: 16 }}>
        <button onClick={handleSave} type="button" data-testid="farm-save">Save Profile</button>
      </div>

      {saved && <div data-testid="farm-saved" role="status" style={{ color: 'green', marginTop: 8 }}>Profile saved successfully! 🎉</div>}

      {failedAttempts >= 3 && (
        <div data-testid="farm-help" role="alert" style={{ color: '#e65100', marginTop: 8 }}>
          Tip: Make sure to fill in at least the farm name. Check the help text below each field for guidance.
        </div>
      )}
    </div>
  );
};
