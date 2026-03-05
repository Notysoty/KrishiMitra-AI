/**
 * Core API client with auth token injection, retry logic, and offline queue.
 * Validates: Requirements 34.4, 34.5, 35.6
 */

import { getToken, refreshToken } from './authClient';
import { enqueue } from './requestQueue';

const BASE_URL = process.env.REACT_APP_API_URL ?? 'http://localhost:3000';

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
  // Don't set Content-Type for FormData — browser sets it with boundary
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
          if (!retried.ok && retried.status === 401) {
            // Redirect to login
            window.location.href = '/login';
          }
          return retried;
        } else {
          window.location.href = '/login';
          throw new Error('Unauthorized');
        }
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
        await sleep(200 * Math.pow(2, attempt)); // exponential backoff: 200ms, 400ms
      } else {
        throw err;
      }
    }
  }

  throw new Error('Request failed after retries');
}

export async function sendMessage(text: string): Promise<AIResponse> {
  try {
    const res = await apiFetch('/api/v1/ai/chat', {
      method: 'POST',
      body: JSON.stringify({ message: text }),
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
    throw err;
  }
}

export async function classifyImage(file: File): Promise<ClassificationResult> {
  const form = new FormData();
  form.append('image', file);
  const res = await apiFetch('/api/v1/disease/classify', {
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
  const res = await apiFetch('/api/v1/ai/speech-to-text', {
    method: 'POST',
    body: form,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data.transcript ?? data.text ?? '';
}

export async function textToSpeech(text: string): Promise<Blob> {
  const res = await apiFetch('/api/v1/ai/text-to-speech', {
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
    const res = await apiFetch('/api/v1/disease/quality-check', {
      method: 'POST',
      body: form,
    });
    if (!res.ok) return { acceptable: true }; // degrade gracefully
    return res.json();
  } catch {
    return { acceptable: true }; // degrade gracefully when offline
  }
}
