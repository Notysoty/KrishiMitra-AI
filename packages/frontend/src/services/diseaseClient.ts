/**
 * diseaseClient.ts
 * API client for the Crop Health Timeline (T3-7).
 * Wraps GET /api/v1/disease/detections and POST /api/v1/disease/detections.
 */

import { getToken } from './authClient';

const BASE_URL = process.env.REACT_APP_API_URL ?? 'http://localhost:3000';

export interface DiseaseDetection {
  id: string;
  crop_type: string;
  image_s3_key?: string | null;
  disease_name: string | null;
  confidence: number | null;
  severity: 'healthy' | 'mild' | 'severe' | null;
  treatment_plan: string | null;
  detected_at: string;
}

export interface SaveDetectionPayload {
  cropType: string;
  diseaseName?: string;
  confidence?: number;
  severity?: 'healthy' | 'mild' | 'severe';
  treatmentPlan?: string;
  imageS3Key?: string;
}

/** Mock data returned when the backend is unreachable (dev / offline). */
const MOCK_DETECTIONS: DiseaseDetection[] = [
  {
    id: 'mock-1',
    crop_type: 'wheat',
    disease_name: 'Leaf Blight',
    confidence: 0.82,
    severity: 'mild',
    treatment_plan: 'Remove infected leaves. Apply copper-based fungicide as directed by an agronomist.',
    detected_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'mock-2',
    crop_type: 'rice',
    disease_name: 'Healthy',
    confidence: 0.95,
    severity: 'healthy',
    treatment_plan: null,
    detected_at: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'mock-3',
    crop_type: 'tomato',
    disease_name: 'Powdery Mildew',
    confidence: 0.74,
    severity: 'severe',
    treatment_plan: 'Apply neem oil spray. Improve ventilation around plants.',
    detected_at: new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

async function authFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return fetch(`${BASE_URL}${path}`, { ...options, headers });
}

/**
 * Fetch the authenticated user's disease detection history.
 * Falls back to mock data when the backend returns a non-2xx status or is unreachable.
 */
export async function getDiseaseHistory(cropType?: string): Promise<DiseaseDetection[]> {
  try {
    const qs = cropType ? `?cropType=${encodeURIComponent(cropType)}` : '';
    const res = await authFetch(`/api/v1/disease/detections${qs}`);
    if (!res.ok) {
      // Graceful fallback — new endpoint may not be deployed yet
      const filtered = cropType
        ? MOCK_DETECTIONS.filter((d) => d.crop_type.toLowerCase() === cropType.toLowerCase())
        : MOCK_DETECTIONS;
      return filtered;
    }
    const data = await res.json();
    return (data.detections ?? []) as DiseaseDetection[];
  } catch {
    // Network error / backend not running — return mock data
    const filtered = cropType
      ? MOCK_DETECTIONS.filter((d) => d.crop_type.toLowerCase() === cropType.toLowerCase())
      : MOCK_DETECTIONS;
    return filtered;
  }
}

/**
 * Persist a disease detection result (called after a successful classify call).
 * Returns the assigned detection id, or a mock id on failure.
 */
export async function saveDiseaseDetection(payload: SaveDetectionPayload): Promise<string> {
  try {
    const res = await authFetch('/api/v1/disease/detections', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (!res.ok) return `local_${Date.now()}`;
    const data = await res.json();
    return data.id ?? `local_${Date.now()}`;
  } catch {
    return `local_${Date.now()}`;
  }
}
