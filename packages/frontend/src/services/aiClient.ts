/**
 * AI/speech/disease API client.
 * Validates: Requirements 34.4, 35.6
 */

import { getToken, refreshToken } from './authClient';

const BASE_URL = process.env.REACT_APP_API_URL ?? 'http://localhost:3000';

export interface ChatResponse {
  text: string;
  confidence: number;
  citations: { title: string; url: string }[];
  disclaimer: string;
  safetyRefusal?: string;
  sessionId?: string;
}

export interface DiseaseClassification {
  diseaseName: string;
  confidence: number;
  recommendations: string[];
  alternativeDiagnoses: { name: string; confidence: number }[];
}

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface WorkflowResult {
  workflowId: string;
  status: 'completed' | 'pending' | 'failed';
  result?: Record<string, unknown>;
}

async function aiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (!(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });

  if (res.status === 401) {
    const refreshed = await refreshToken();
    if (refreshed.success && refreshed.token) {
      headers['Authorization'] = `Bearer ${refreshed.token}`;
      return fetch(`${BASE_URL}${path}`, { ...options, headers });
    }
    throw new Error('Unauthorized');
  }

  return res;
}

export async function sendChatMessage(text: string, language = 'en'): Promise<ChatResponse> {
  const res = await aiFetch('/api/v1/ai/chat', {
    method: 'POST',
    body: JSON.stringify({ message: text, language }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return {
    text: data.response ?? data.text ?? '',
    confidence: data.confidence ?? 0.8,
    citations: data.citations ?? [],
    disclaimer: data.disclaimer ?? 'AI-generated advice. Consult local experts.',
    safetyRefusal: data.safetyRefusal,
    sessionId: data.sessionId,
  };
}

export async function classifyDisease(imageFile: File): Promise<DiseaseClassification> {
  const form = new FormData();
  form.append('image', imageFile);
  const res = await aiFetch('/api/v1/disease/classify', {
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

export async function speechToText(audioBlob: Blob, language = 'en'): Promise<string> {
  const form = new FormData();
  form.append('audio', audioBlob, 'recording.webm');
  form.append('language', language);
  const res = await aiFetch('/api/v1/ai/speech-to-text', {
    method: 'POST',
    body: form,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data.transcript ?? data.text ?? '';
}

export async function textToSpeech(text: string, language = 'en'): Promise<Blob> {
  const res = await aiFetch('/api/v1/ai/text-to-speech', {
    method: 'POST',
    body: JSON.stringify({ text, language }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.blob();
}

export async function getConversationHistory(): Promise<ConversationMessage[]> {
  const res = await aiFetch('/api/v1/ai/history');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data.messages ?? data ?? [];
}

export async function executeWorkflow(
  type: string,
  params: Record<string, unknown>
): Promise<WorkflowResult> {
  const res = await aiFetch(`/api/v1/ai/workflow/${type}`, {
    method: 'POST',
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
