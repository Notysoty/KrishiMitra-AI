/**
 * Core API client with auth token injection, retry logic, and offline queue.
 * Validates: Requirements 34.4, 34.5, 35.6
 */

import { getToken, refreshToken } from './authClient';
import { enqueue } from './requestQueue';

const BASE_URL = process.env.REACT_APP_API_URL ?? 'http://localhost:3000';
const API_PREFIX = process.env.REACT_APP_API_PREFIX ?? '/api/v1';

export interface AIResponse {
  text: string;
  confidence: number;
  citations: { title: string; url: string }[];
  disclaimer: string;
  safetyRefusal?: string;
}

export interface ClassificationResult {
  diseaseName: string;
  confidence: number;
  recommendations: string[];
  alternativeDiagnoses: { name: string; confidence: number }[];
}

export interface ImageQualityResult {
  acceptable: boolean;
  issue?: 'blur' | 'low_light' | 'wrong_angle';
  message?: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function apiFetch(
  path: string,
  options: RequestInit = {},
  retries = 2
): Promise<Response> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  // Do not set Content-Type for FormData; browser sets it with boundary
  if (!(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const url = `${BASE_URL}${path}`;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { ...options, headers });

      if (res.status === 401) {
        // Try token refresh once
        const refreshed = await refreshToken();
        if (refreshed.success && refreshed.token) {
          headers['Authorization'] = `Bearer ${refreshed.token}`;
          const retried = await fetch(url, { ...options, headers });
          // Only redirect if refresh also fails
          if (!retried.ok && retried.status === 401) {
            throw new Error('Unauthorized');
          }
          return retried;
        }
        throw new Error('Unauthorized');
      }

      return res;
    } catch (err) {
      const isNetworkError = err instanceof TypeError;
      if (isNetworkError && !navigator.onLine) {
        // Queue for later sync
        enqueue(url, options.method ?? 'GET', options.body as string | undefined, headers);
        throw new Error('Offline: request queued');
      }
      if (attempt < retries) {
        await sleep(200 * Math.pow(2, attempt));
      } else {
        throw err;
      }
    }
  }

  throw new Error('Request failed after retries');
}

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface FarmContext {
  farmName?: string;
  state?: string;
  district?: string;
  soilType?: string;
  irrigationType?: string;
  crops?: string[];
  latitude?: number | null;
  longitude?: number | null;
}

function createFallbackAdvice(query: string, farm?: FarmContext | null, userName?: string): AIResponse {
  const normalizedQuery = query.toLowerCase();
  const location = [farm?.district, farm?.state].filter(Boolean).join(', ');
  const cropList = farm?.crops && farm.crops.length > 0 ? farm.crops.join(', ') : 'your main crop';
  const greeting = userName ? `${userName}, ` : '';

  let text: string;
  if (/market|price|mandi|sell|rate/.test(normalizedQuery)) {
    text = `${greeting}Demo mode is active because live assistant service is unavailable. For ${cropList}, compare rates from at least 2 nearby mandis, prioritize markets with lower transport cost, and avoid immediate sale if rates are below your last 7-day average.`;
  } else if (/rain|weather|forecast|monsoon/.test(normalizedQuery)) {
    text = `${greeting}Demo mode is active because live assistant service is unavailable. For the next 48 hours, avoid spraying before possible rain, keep field drainage clear, and monitor leaf wetness to reduce fungal risk.`;
  } else if (/disease|leaf|spot|blight|pest|insect/.test(normalizedQuery)) {
    text = `${greeting}Demo mode is active because live assistant service is unavailable. Isolate affected plants, remove heavily infected leaves, and capture clear close-up photos in daylight for final diagnosis when live assistant is restored.`;
  } else if (/fertilizer|nutrient|urea|dap|npk/.test(normalizedQuery)) {
    text = `${greeting}Demo mode is active because live assistant service is unavailable. Apply nutrients only after soil moisture check, split doses instead of one heavy application, and avoid fertilizer use just before expected rain.`;
  } else {
    text = `${greeting}Demo mode is active because live assistant service is unavailable. Share crop, growth stage, and recent weather so I can provide a tighter recommendation while backend service is being restored.`;
  }

  if (location) {
    text += `\n\nContext used: ${location}.`;
  }

  return {
    text,
    confidence: 0.45,
    citations: [],
    disclaimer: 'Demo response shown because live assistant service is currently unreachable.',
  };
}

export async function sendMessage(
  text: string,
  language = 'en',
  history?: ConversationMessage[],
  farm?: FarmContext | null,
  userName?: string,
): Promise<AIResponse> {
  try {
    const body: Record<string, unknown> = { query: text, language };
    if (history && history.length > 0) body.history = history;
    if (farm) body.farm = farm;
    if (userName) body.userName = userName;

    const res = await apiFetch(`${API_PREFIX}/ai/chat`, {
      method: 'POST',
      body: JSON.stringify(body),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return {
      text: data.response ?? data.text ?? '',
      confidence: data.confidence ?? 0.8,
      citations: data.citations ?? [],
      disclaimer: data.disclaimer ?? 'AI-generated advice. Consult local experts.',
      safetyRefusal: data.safetyRefusal,
    };
  } catch (err) {
    if ((err as Error).message === 'Offline: request queued') {
      return {
        text: 'Your message has been queued and will be sent when you reconnect.',
        confidence: 0,
        citations: [],
        disclaimer: '',
      };
    }

    return createFallbackAdvice(text, farm, userName);
  }
}

export async function classifyImage(file: File): Promise<ClassificationResult> {
  const form = new FormData();
  form.append('image', file);
  const res = await apiFetch(`${API_PREFIX}/disease/classify`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return {
    diseaseName: data.diseaseName ?? data.disease_name ?? 'Unknown',
    confidence: data.confidence ?? 0,
    recommendations: data.recommendations ?? [],
    alternativeDiagnoses: data.alternativeDiagnoses ?? data.alternative_diagnoses ?? [],
  };
}

export async function speechToText(audio: Blob): Promise<string> {
  const form = new FormData();
  form.append('audio', audio, 'recording.webm');
  const res = await apiFetch(`${API_PREFIX}/ai/speech-to-text`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data.transcript ?? data.text ?? '';
}

export async function textToSpeech(text: string): Promise<Blob> {
  const res = await apiFetch(`${API_PREFIX}/ai/text-to-speech`, {
    method: 'POST',
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.blob();
}

export async function checkImageQuality(file: File): Promise<ImageQualityResult> {
  const form = new FormData();
  form.append('image', file);
  try {
    const res = await apiFetch(`${API_PREFIX}/disease/quality-check`, {
      method: 'POST',
      body: form,
    });
    if (!res.ok) return { acceptable: true };
    return res.json();
  } catch {
    return { acceptable: true };
  }
}
