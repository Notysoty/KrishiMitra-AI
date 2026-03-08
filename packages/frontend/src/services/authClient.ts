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

/** Converts a phone number to a deterministic UUID-format string safe for Postgres uuid columns. */
function phoneToUuid(phone: string): string {
  const digits = phone.replace(/\D/g, '').padStart(12, '0').slice(-12);
  return `00000000-0000-4000-8000-${digits}`;
}

function createMockJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = btoa(JSON.stringify(payload));
  const sig = btoa('mock-signature');
  return `${header}.${body}.${sig}`;
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

export async function login(phone: string): Promise<{ success: boolean; message: string }> {
  await new Promise(r => setTimeout(r, 100));
  return { success: true, message: 'OTP sent' };
}

export async function verifyOtp(phone: string, otp: string): Promise<{ success: boolean; token?: string; message: string }> {
  await new Promise(r => setTimeout(r, 100));
  if (otp.length < 4) return { success: false, message: 'Invalid OTP' };
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const token = createMockJwt({ sub: phoneToUuid(phone), phone, roles: ['farmer'], exp });
  storeToken(token);
  return { success: true, token, message: 'Verified' };
}

export async function register(phone: string, name: string): Promise<{ success: boolean; token?: string; message: string }> {
  await new Promise(r => setTimeout(r, 100));
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const token = createMockJwt({ sub: phoneToUuid(phone), phone, name, roles: ['farmer'], exp });
  storeToken(token);
  return { success: true, token, message: 'Registered' };
}

export async function refreshToken(): Promise<{ success: boolean; token?: string }> {
  const current = getToken();
  if (!current) return { success: false };
  const payload = decodeJwtPayload(current);
  if (!payload) return { success: false };
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const token = createMockJwt({ ...payload, exp, iat: Date.now() });
  storeToken(token);
  return { success: true, token };
}

export function logout(): void {
  clearToken();
}

export function isBiometricAvailable(): boolean {
  return typeof window !== 'undefined' && !!window.PublicKeyCredential;
}
