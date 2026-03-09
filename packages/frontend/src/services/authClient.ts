const TOKEN_KEY = 'krishimitra_token';

export interface AuthUser {
  phone: string;
  name?: string;
  sub?: string;
  roles?: string[];
}

export function hasRole(role: string): boolean {
  const user = getUser();
  return user?.roles?.includes(role) ?? false;
}

export function isAdmin(): boolean {
  return hasRole('admin') || hasRole('tenant_admin') || hasRole('platform_admin');
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    return JSON.parse(atob(parts[1]));
  } catch {
    return null;
  }
}

function storeToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function isTokenExpired(token: string): boolean {
  const payload = decodeJwtPayload(token);
  if (!payload || typeof payload.exp !== 'number') return false;
  return Date.now() >= payload.exp * 1000;
}

export function isAuthenticated(): boolean {
  const token = getToken();
  if (!token) return false;
  return !isTokenExpired(token);
}

export function getUser(): AuthUser | null {
  const token = getToken();
  if (!token) return null;
  const payload = decodeJwtPayload(token);
  if (!payload) return null;
  return {
    phone: payload.phone as string,
    name: payload.name as string | undefined,
    sub: payload.sub as string | undefined,
    roles: (payload.roles as string[] | undefined) ?? ['farmer'],
  };
}

const BASE_URL = (process.env.REACT_APP_API_URL ?? 'http://localhost:3000') + '/auth';
// Default tenant — single-tenant deployment
const TENANT_ID = process.env.REACT_APP_TENANT_ID ?? '10000000-0000-4000-8000-000000000001';

async function authFetch(path: string, body: Record<string, unknown>, token?: string): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return fetch(`${BASE_URL}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
}

export async function login(phone: string): Promise<{ success: boolean; message: string }> {
  try {
    const res = await authFetch('/login', { phone, tenant_id: TENANT_ID });
    const data = await res.json();
    if (!res.ok) return { success: false, message: data.error ?? data.message ?? 'Failed to send OTP' };
    return { success: true, message: data.message ?? 'OTP sent' };
  } catch {
    return { success: false, message: 'Network error — please try again' };
  }
}

export async function verifyOtp(phone: string, otp: string): Promise<{ success: boolean; token?: string; message: string }> {
  try {
    const res = await authFetch('/verify-otp', { phone, otp, tenant_id: TENANT_ID });
    const data = await res.json();
    if (!res.ok) return { success: false, message: data.error ?? data.message ?? 'Invalid OTP' };
    const token = (data.token ?? data.accessToken) as string | undefined;
    if (token) storeToken(token);
    return { success: true, token, message: data.message ?? 'Verified' };
  } catch {
    return { success: false, message: 'Network error — please try again' };
  }
}

export async function register(phone: string, name: string): Promise<{ success: boolean; token?: string; message: string }> {
  try {
    const res = await authFetch('/register', { phone, name, tenant_id: TENANT_ID });
    const data = await res.json();
    if (!res.ok) return { success: false, message: data.error ?? data.message ?? 'Registration failed' };
    const token = (data.token ?? data.accessToken) as string | undefined;
    if (token) storeToken(token);
    return { success: true, token, message: data.message ?? 'Registered' };
  } catch {
    return { success: false, message: 'Network error — please try again' };
  }
}

export async function refreshToken(): Promise<{ success: boolean; token?: string }> {
  const current = getToken();
  if (!current) return { success: false };
  try {
    const res = await authFetch('/refresh', { tenant_id: TENANT_ID }, current);
    if (!res.ok) return { success: false };
    const data = await res.json();
    const token = (data.token ?? data.accessToken) as string | undefined;
    if (token) storeToken(token);
    return { success: !!token, token };
  } catch {
    return { success: false };
  }
}

export function logout(): void {
  clearToken();
}

export function isBiometricAvailable(): boolean {
  return typeof window !== 'undefined' && !!window.PublicKeyCredential;
}
