import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { GPSCapture, GPSCoordinates } from '../components/GPSCapture';
import { CropManager, Crop } from '../components/CropManager';
import { useToast } from '../contexts/ToastContext';
import { useTranslation } from '../i18n';
import { getDiseaseHistory, DiseaseDetection } from '../services/diseaseClient';

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

// ── Crop Calendar ────────────────────────────────────────────────

interface CropAdvisory {
  week: number;
  label: string;
  tasks: string[];
  icon: string;
}

function getCropAdvisories(cropName: string): CropAdvisory[] {
  const name = cropName.toLowerCase();
  if (name.includes('wheat')) return [
    { week: 1, label: 'Soil prep & sowing', tasks: ['Deep ploughing', 'Apply basal fertilizer (DAP)', 'Sow seeds at 100–125 kg/ha'], icon: '🌱' },
    { week: 3, label: 'First irrigation', tasks: ['Crown root initiation stage irrigation', 'Monitor for termite damage'], icon: '💧' },
    { week: 6, label: 'Tillering stage', tasks: ['Apply urea top-dressing', 'Weed control (narrow-leaf weeds)'], icon: '🌿' },
    { week: 10, label: 'Boot/ear emergence', tasks: ['Second irrigation at flag-leaf stage', 'Scout for yellow rust, aphids'], icon: '🌾' },
    { week: 14, label: 'Grain filling', tasks: ['Foliar spray for leaf blight if needed', 'Reduce irrigation frequency'], icon: '🟡' },
    { week: 17, label: 'Harvest ready', tasks: ['Test grain moisture (<14%)', 'Arrange combine harvester'], icon: '🚜' },
  ];
  if (name.includes('tomato')) return [
    { week: 1, label: 'Nursery preparation', tasks: ['Prepare raised nursery beds', 'Sow seeds, apply fungicide drench'], icon: '🌱' },
    { week: 4, label: 'Transplanting', tasks: ['Transplant 25–30 day old seedlings', 'Apply 10t/ha FYM before transplanting'], icon: '🪴' },
    { week: 6, label: 'Vegetative stage', tasks: ['Stake plants', 'Apply NPK fertilizer', 'Scout for whitefly, thrips'], icon: '🌿' },
    { week: 9, label: 'Flowering', tasks: ['Apply potassium for fruit set', 'Spray neem oil for pest control'], icon: '🌸' },
    { week: 12, label: 'Fruit development', tasks: ['Drip irrigation critical — no water stress', 'Monitor for early blight (yellow spots)'], icon: '🍅' },
    { week: 16, label: 'Harvest', tasks: ['Pick at breaker stage for distant markets', 'Check mandi prices before selling'], icon: '🛒' },
  ];
  if (name.includes('rice') || name.includes('paddy')) return [
    { week: 1, label: 'Nursery & land prep', tasks: ['Flood field, puddle soil', 'Sow pre-germinated seeds in nursery'], icon: '🌱' },
    { week: 3, label: 'Transplanting', tasks: ['Transplant 21-day seedlings, 2–3 per hill', 'Maintain 2–3 cm flood'], icon: '🌾' },
    { week: 5, label: 'Tillering', tasks: ['Apply urea split dose', 'Drain field for 3 days (AWD technique)'], icon: '💧' },
    { week: 9, label: 'Panicle initiation', tasks: ['Apply potash', 'Scout for stem borer (deadheart symptoms)'], icon: '🌿' },
    { week: 12, label: 'Flowering/heading', tasks: ['Keep field flooded', 'Spray for leaf blast if humid'], icon: '🌸' },
    { week: 16, label: 'Harvest', tasks: ['Drain field 10 days before harvest', 'Harvest when 80% grains golden yellow'], icon: '🚜' },
  ];
  // Generic advisories for other crops
  return [
    { week: 1, label: 'Land preparation', tasks: ['Plough and level field', 'Test soil pH, apply lime if needed', 'Apply organic manure'], icon: '🌱' },
    { week: 3, label: 'Sowing / planting', tasks: ['Use certified seeds', 'Apply basal fertilizer'], icon: '🪴' },
    { week: 7, label: 'Crop establishment', tasks: ['Weed management', 'Monitor pests and diseases'], icon: '🌿' },
    { week: 12, label: 'Mid-season', tasks: ['Top-dress fertilizer', 'Irrigation as per crop stage'], icon: '💧' },
    { week: 18, label: 'Pre-harvest', tasks: ['Reduce irrigation', 'Arrange storage/market'], icon: '🌾' },
    { week: 22, label: 'Harvest', tasks: ['Harvest at optimal maturity', 'Post-harvest handling'], icon: '🚜' },
  ];
}

const CropCalendar: React.FC<{ crops: Crop[] }> = ({ crops }) => {
  const [activeCrop, setActiveCrop] = useState(0);
  const advisories = useMemo(() => getCropAdvisories(crops[activeCrop]?.type ?? ''), [crops, activeCrop]);

  if (crops.length === 0) return null;

  return (
    <div className="form-section crop-calendar" style={{ marginTop: '2rem' }}>
      <div className="form-section-title">📅 Crop Calendar</div>
      {crops.length > 1 && (
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          {crops.map((c, i) => (
            <button
              key={c.id}
              className={`btn ${i === activeCrop ? 'btn-primary' : 'btn-ghost'}`}
              style={{ padding: '0.25rem 0.75rem', fontSize: '0.85rem' }}
              onClick={() => setActiveCrop(i)}
            >
              {c.type}
            </button>
          ))}
        </div>
      )}
      <div style={{ overflowX: 'auto' }}>
        <div style={{ display: 'flex', gap: '0.75rem', minWidth: 'max-content', paddingBottom: '0.5rem' }}>
          {advisories.map((adv) => (
            <div
              key={adv.week}
              style={{
                background: 'var(--card-bg, #fff)',
                border: '1px solid var(--border-color, #e2e8f0)',
                borderRadius: '10px',
                padding: '1rem',
                minWidth: '160px',
                maxWidth: '180px',
              }}
            >
              <div style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>{adv.icon}</div>
              <div style={{ fontWeight: 600, fontSize: '0.75rem', color: 'var(--text-muted, #64748b)', marginBottom: '0.25rem' }}>Week {adv.week}</div>
              <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: '0.5rem' }}>{adv.label}</div>
              <ul style={{ margin: 0, padding: '0 0 0 1rem', fontSize: '0.75rem', color: 'var(--text-secondary, #475569)' }}>
                {adv.tasks.map((task, i) => <li key={i}>{task}</li>)}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted, #64748b)', marginTop: '0.5rem' }}>
        Scroll to see full season plan. Ask KrishiMitra AI for personalized advice.
      </div>
    </div>
  );
};

// ── Crop Health Timeline ──────────────────────────────────────

function severityDot(severity: DiseaseDetection['severity']): string {
  if (severity === 'healthy') return '🟢';
  if (severity === 'mild') return '🟡';
  if (severity === 'severe') return '🔴';
  return '⚪';
}

function severityLabel(severity: DiseaseDetection['severity']): string {
  if (severity === 'healthy') return 'Healthy';
  if (severity === 'mild') return 'Mild';
  if (severity === 'severe') return 'Severe';
  return 'Unknown';
}

function formatDetectedAt(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return iso;
  }
}

const CropHealthTimeline: React.FC<{ crops: Crop[]; onGoToChat: () => void }> = ({ crops, onGoToChat }) => {
  const cropNames = useMemo(
    () => Array.from(new Set(crops.map((c) => c.type.toLowerCase()))),
    [crops],
  );

  const [activeFilter, setActiveFilter] = useState<string>('all');
  const [detections, setDetections] = useState<DiseaseDetection[]>([]);
  const [loading, setLoading] = useState(true);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      const filter = activeFilter === 'all' ? undefined : activeFilter;
      const data = await getDiseaseHistory(filter);
      setDetections(data);
    } finally {
      setLoading(false);
    }
  }, [activeFilter]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  return (
    <div className="form-section" style={{ marginTop: '2rem' }}>
      <div className="form-section-title">📸 Crop Health Timeline</div>

      {/* Crop filter tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <button
          className={`btn ${activeFilter === 'all' ? 'btn-primary' : 'btn-ghost'}`}
          style={{ padding: '0.25rem 0.75rem', fontSize: '0.85rem' }}
          onClick={() => setActiveFilter('all')}
        >
          All crops
        </button>
        {cropNames.map((name) => (
          <button
            key={name}
            className={`btn ${activeFilter === name ? 'btn-primary' : 'btn-ghost'}`}
            style={{ padding: '0.25rem 0.75rem', fontSize: '0.85rem', textTransform: 'capitalize' }}
            onClick={() => setActiveFilter(name)}
          >
            {name}
          </button>
        ))}
      </div>

      {/* Timeline */}
      {loading ? (
        <div style={{ color: 'var(--text-muted, #64748b)', fontSize: '0.9rem', padding: '1rem 0' }}>
          Loading health history...
        </div>
      ) : detections.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: '2rem',
            background: 'var(--card-bg, #fff)',
            border: '1px dashed var(--border-color, #e2e8f0)',
            borderRadius: '10px',
          }}
        >
          <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>📷</div>
          <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>No health history yet</div>
          <div style={{ color: 'var(--text-muted, #64748b)', fontSize: '0.9rem', marginBottom: '1rem' }}>
            Upload a crop photo to get disease detection started.
          </div>
          <button className="btn btn-primary" onClick={onGoToChat} style={{ padding: '0.5rem 1.25rem' }}>
            📸 Upload crop photo
          </button>
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
            position: 'relative',
          }}
        >
          {/* Vertical line */}
          <div
            style={{
              position: 'absolute',
              left: '20px',
              top: 0,
              bottom: 0,
              width: '2px',
              background: 'var(--border-color, #e2e8f0)',
            }}
          />
          {detections.map((d) => (
            <div
              key={d.id}
              style={{
                display: 'flex',
                gap: '0.75rem',
                alignItems: 'flex-start',
                paddingLeft: '0.5rem',
              }}
            >
              {/* Dot on the timeline */}
              <div
                style={{
                  flexShrink: 0,
                  width: '40px',
                  textAlign: 'center',
                  fontSize: '1.2rem',
                  zIndex: 1,
                  background: 'var(--bg, #f8fafc)',
                  paddingTop: '0.15rem',
                }}
              >
                {severityDot(d.severity)}
              </div>

              {/* Card */}
              <div
                style={{
                  flex: 1,
                  background: 'var(--card-bg, #fff)',
                  border: '1px solid var(--border-color, #e2e8f0)',
                  borderRadius: '10px',
                  padding: '0.85rem 1rem',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.25rem' }}>
                  <span style={{ fontWeight: 700, fontSize: '0.95rem', textTransform: 'capitalize' }}>
                    {d.crop_type}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted, #64748b)' }}>
                    {formatDetectedAt(d.detected_at)}
                  </span>
                </div>

                <div style={{ marginTop: '0.35rem', fontSize: '0.9rem' }}>
                  <span style={{ fontWeight: 600 }}>
                    {d.disease_name ?? 'Unknown'}
                  </span>
                  {' — '}
                  <span
                    style={{
                      fontSize: '0.8rem',
                      padding: '0.1rem 0.45rem',
                      borderRadius: '999px',
                      background:
                        d.severity === 'healthy' ? '#dcfce7' :
                        d.severity === 'mild' ? '#fef9c3' :
                        d.severity === 'severe' ? '#fee2e2' : '#f1f5f9',
                      color:
                        d.severity === 'healthy' ? '#166534' :
                        d.severity === 'mild' ? '#854d0e' :
                        d.severity === 'severe' ? '#991b1b' : '#475569',
                    }}
                  >
                    {severityLabel(d.severity)}
                  </span>
                </div>

                {d.confidence != null && (
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted, #64748b)', marginTop: '0.2rem' }}>
                    Confidence: {Math.round(d.confidence * 100)}%
                  </div>
                )}

                {d.treatment_plan && (
                  <div
                    style={{
                      marginTop: '0.5rem',
                      fontSize: '0.8rem',
                      color: 'var(--text-secondary, #475569)',
                      borderTop: '1px solid var(--border-color, #e2e8f0)',
                      paddingTop: '0.4rem',
                    }}
                  >
                    <strong>Treatment:</strong> {d.treatment_plan}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted, #64748b)', marginTop: '0.75rem' }}>
        Showing last {detections.length} detection{detections.length !== 1 ? 's' : ''}.
        Scan a new photo in the AI Chat to add entries.
      </div>
    </div>
  );
};

// ── Tab types ────────────────────────────────────────────────

type FarmTab = 'profile' | 'calendar' | 'health';

export const FarmProfilePage: React.FC = () => {
  const [profile, setProfile] = useState<FarmProfile>(() => {
    try {
      const saved = localStorage.getItem('krishimitra_farm_profile');
      if (saved) return JSON.parse(saved) as FarmProfile;
    } catch { /* ignore */ }
    return {
      farmName: '',
      totalAcreage: 0,
      latitude: null,
      longitude: null,
      state: '',
      district: '',
      irrigationType: '',
      soilType: '',
      crops: [],
    };
  });
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [activeTab, setActiveTab] = useState<FarmTab>('profile');
  const { showToast } = useToast();
  const { t } = useTranslation();

  const handleGPS = (coords: GPSCoordinates) => {
    setProfile((p) => ({ ...p, latitude: coords.latitude, longitude: coords.longitude }));
  };

  const handleSave = async () => {
    if (!profile.farmName.trim()) {
      setFailedAttempts((n) => n + 1);
      showToast(t('farmNameRequired'), 'warning');
      return;
    }
    setSaving(true);
    try {
      localStorage.setItem('krishimitra_farm_profile', JSON.stringify(profile));
    } catch { /* ignore */ }
    await new Promise((r) => setTimeout(r, 500));
    setSaving(false);
    setSaved(true);
    setFailedAttempts(0);
    showToast(t('profileSaved'), 'success');
  };

  return (
    <div data-testid="farm-profile-page" className="page-container">
      <div className="page-header">
        <h2>🌾 {t('farmProfile')}</h2>
        <p className="page-subtitle">{t('farmProfileSubtitle')}</p>
      </div>

      {/* Tab navigation */}
      <div style={{ display: 'flex', gap: '0', borderBottom: '2px solid var(--border-color, #e2e8f0)', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        {(
          [
            { id: 'profile', label: '📋 Farm Profile' },
            { id: 'calendar', label: '📅 Crop Calendar' },
            { id: 'health', label: '📸 Health History' },
          ] as { id: FarmTab; label: string }[]
        ).map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            style={{
              background: 'none',
              border: 'none',
              borderBottom: activeTab === id ? '3px solid var(--primary, #16a34a)' : '3px solid transparent',
              padding: '0.6rem 1rem',
              fontWeight: activeTab === id ? 700 : 400,
              color: activeTab === id ? 'var(--primary, #16a34a)' : 'var(--text-muted, #64748b)',
              cursor: 'pointer',
              fontSize: '0.9rem',
              marginBottom: '-2px',
              transition: 'color 0.15s',
            }}
            data-testid={`tab-${id}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Profile tab ── */}
      {activeTab === 'profile' && (
        <>
          <div className="form-section">
            <div className="form-section-title">📋 {t('basicInfo')}</div>

            <div className="form-group">
              <div className="form-floating">
                <input className="form-input" value={profile.farmName} onChange={(e) => setProfile({ ...profile, farmName: e.target.value })} data-testid="farm-name" placeholder=" " />
                <label className="form-label">{t('farmNameLabel')}</label>
              </div>
              <div className="form-hint">{TOOLTIPS.farmName}</div>
            </div>

            <div className="form-group">
              <div className="form-floating">
                <input className="form-input" type="number" value={profile.totalAcreage} onChange={(e) => setProfile({ ...profile, totalAcreage: Number(e.target.value) })} data-testid="farm-acreage" placeholder=" " />
                <label className="form-label">{t('totalAcreageLabel')}</label>
              </div>
              <div className="form-hint">{TOOLTIPS.totalAcreage}</div>
            </div>
          </div>

          <div className="form-section">
            <div className="form-section-title">📍 {t('locationSection')}</div>
            <div className="form-hint mb-3">{TOOLTIPS.location}</div>
            <GPSCapture onCapture={handleGPS} value={profile.latitude !== null && profile.longitude !== null ? { latitude: profile.latitude, longitude: profile.longitude } : null} />
            <div className="form-row mt-3">
              <div className="form-group">
                <div className="form-floating">
                  <input className="form-input" type="number" step="0.0001" value={profile.latitude ?? ''} onChange={(e) => setProfile({ ...profile, latitude: e.target.value ? Number(e.target.value) : null })} data-testid="farm-lat" placeholder=" " />
                  <label className="form-label">{t('latitudeLabel')}</label>
                </div>
              </div>
              <div className="form-group">
                <div className="form-floating">
                  <input className="form-input" type="number" step="0.0001" value={profile.longitude ?? ''} onChange={(e) => setProfile({ ...profile, longitude: e.target.value ? Number(e.target.value) : null })} data-testid="farm-lng" placeholder=" " />
                  <label className="form-label">{t('longitudeLabel')}</label>
                </div>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <div className="form-floating">
                  <input className="form-input" value={profile.state} onChange={(e) => setProfile({ ...profile, state: e.target.value })} data-testid="farm-state" placeholder=" " />
                  <label className="form-label">{t('stateLabel')}</label>
                </div>
                <div className="form-hint">{TOOLTIPS.state}</div>
              </div>
              <div className="form-group">
                <div className="form-floating">
                  <input className="form-input" value={profile.district} onChange={(e) => setProfile({ ...profile, district: e.target.value })} data-testid="farm-district" placeholder=" " />
                  <label className="form-label">{t('districtLabel')}</label>
                </div>
                <div className="form-hint">{TOOLTIPS.district}</div>
              </div>
            </div>
          </div>

          <div className="form-section">
            <div className="form-section-title">💧 {t('farmDetailsSection')}</div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">{t('irrigationTypeLabel')}</label>
                <select className="form-select" value={profile.irrigationType} onChange={(e) => setProfile({ ...profile, irrigationType: e.target.value })} data-testid="farm-irrigation">
                  <option value="">{t('selectOption')}</option>
                  {IRRIGATION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <div className="form-hint">{TOOLTIPS.irrigationType}</div>
              </div>
              <div className="form-group">
                <label className="form-label">{t('soilTypeLabel')}</label>
                <select className="form-select" value={profile.soilType} onChange={(e) => setProfile({ ...profile, soilType: e.target.value })} data-testid="farm-soil">
                  <option value="">{t('selectOption')}</option>
                  {SOIL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <div className="form-hint">{TOOLTIPS.soilType}</div>
              </div>
            </div>
          </div>

          <CropManager crops={profile.crops} onChange={(crops) => setProfile({ ...profile, crops })} />

          <div className="mt-4">
            <button className={`btn btn-primary btn-lg ${saving ? 'btn-loading' : ''}`} onClick={handleSave} disabled={saving} type="button" data-testid="farm-save">{saving && <span className="btn-spinner" />}{saving ? t('saving') : `💾 ${t('saveProfile')}`}</button>
          </div>

          {saved && <div data-testid="farm-saved" role="status" className="alert-box alert-success mt-3">{t('profileSaved')} 🎉</div>}

          {failedAttempts >= 3 && (
            <div data-testid="farm-help" role="alert" className="alert-box alert-warning mt-3">
              Tip: Make sure to fill in at least the farm name. Check the help text below each field for guidance.
            </div>
          )}
        </>
      )}

      {/* ── Crop Calendar tab ── */}
      {activeTab === 'calendar' && (
        profile.crops.length > 0
          ? <CropCalendar crops={profile.crops} />
          : (
            <div className="form-section" style={{ textAlign: 'center', padding: '2rem' }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🌱</div>
              <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>No crops added yet</div>
              <div style={{ color: 'var(--text-muted, #64748b)', fontSize: '0.9rem' }}>
                Go to Farm Profile and add your crops to see a seasonal calendar.
              </div>
              <button className="btn btn-ghost mt-3" onClick={() => setActiveTab('profile')} style={{ marginTop: '0.75rem' }}>
                Go to Profile
              </button>
            </div>
          )
      )}

      {/* ── Health History tab ── */}
      {activeTab === 'health' && (
        <CropHealthTimeline
          crops={profile.crops}
          onGoToChat={() => {
            // Navigate to /chat — works with hash or BrowserRouter
            window.location.hash = '#/chat';
            if (window.location.hash !== '#/chat') {
              window.location.pathname = '/chat';
            }
          }}
        />
      )}
    </div>
  );
};
