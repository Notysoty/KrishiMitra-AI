import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { getPool } from '../../db/pool';
import { Role } from '../../types/enums';

// ── Configuration ──────────────────────────────────────────────
const JWT_SECRET = process.env.JWT_SECRET || 'krishimitra-dev-secret';
const JWT_EXPIRY = '24h';
const OTP_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

// ── Types ──────────────────────────────────────────────────────
export interface RegisterInput {
  phone: string;
  name: string;
  tenant_id: string;
  email?: string;
  language_preference?: string;
  roles?: Role[];
}

export interface TokenPayload {
  userId: string;
  tenantId: string;
  roles: Role[];
  sessionId: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // seconds
}

interface OtpEntry {
  otp: string;
  expiresAt: number;
  userId: string;
  tenantId: string;
}

interface LockoutEntry {
  failedAttempts: number;
  lockedUntil: number | null;
}

// ── Mock OTP Store (in-memory for MVP) ─────────────────────────
const otpStore = new Map<string, OtpEntry>();
const lockoutStore = new Map<string, LockoutEntry>();

export function _getOtpStore() { return otpStore; }
export function _getLockoutStore() { return lockoutStore; }
export function _clearStores() {
  otpStore.clear();
  lockoutStore.clear();
}

// ── Helpers ────────────────────────────────────────────────────
function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function signToken(payload: TokenPayload, expiresIn: string = JWT_EXPIRY): string {
  // Cast payload to plain object for jwt.sign compatibility
  const data = { ...payload };
  return jwt.sign(data, JWT_SECRET, { expiresIn: expiresIn as unknown as number });
}

export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, JWT_SECRET) as TokenPayload;
}

// ── AuthService ────────────────────────────────────────────────
export class AuthService {

  /**
   * Register a new user within a tenant.
   * Returns the created user record.
   */
  async register(input: RegisterInput) {
    const pool = getPool();
    const { phone, name, tenant_id, email, language_preference, roles } = input;

    // Validate phone format (Indian mobile: 10 digits)
    if (!/^\d{10}$/.test(phone)) {
      throw new AuthError('Invalid phone number. Must be 10 digits.', 400);
    }

    // Check if user already exists in this tenant
    const existing = await pool.query(
      'SELECT id FROM users WHERE phone = $1 AND tenant_id = $2',
      [phone, tenant_id]
    );
    if (existing.rows.length > 0) {
      throw new AuthError('User with this phone already exists in this tenant.', 409);
    }

    // Verify tenant exists
    const tenant = await pool.query('SELECT id FROM tenants WHERE id = $1', [tenant_id]);
    if (tenant.rows.length === 0) {
      throw new AuthError('Tenant not found.', 404);
    }

    const userId = uuidv4();
    const userRoles = roles ?? [Role.FARMER];

    await pool.query(
      `INSERT INTO users (id, tenant_id, phone, email, name, roles, language_preference)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [userId, tenant_id, phone, email ?? null, name, userRoles, language_preference ?? 'en']
    );

    return {
      id: userId,
      tenant_id,
      phone,
      email: email ?? null,
      name,
      roles: userRoles,
      language_preference: language_preference ?? 'en',
    };
  }

  /**
   * Initiate login by sending an OTP to the user's phone.
   * Returns a masked confirmation (does not expose OTP in production).
   */
  async login(phone: string, tenantId: string) {
    // Check lockout
    const lockoutKey = `${tenantId}:${phone}`;
    const lockout = lockoutStore.get(lockoutKey);
    if (lockout?.lockedUntil && Date.now() < lockout.lockedUntil) {
      const remainingMs = lockout.lockedUntil - Date.now();
      const remainingMin = Math.ceil(remainingMs / 60000);
      throw new AuthError(
        `Account is locked. Try again in ${remainingMin} minute(s).`,
        429
      );
    }

    // Find user
    const pool = getPool();
    const result = await pool.query(
      'SELECT id, tenant_id FROM users WHERE phone = $1 AND tenant_id = $2',
      [phone, tenantId]
    );
    if (result.rows.length === 0) {
      throw new AuthError('User not found.', 404);
    }

    const user = result.rows[0];
    const otp = generateOtp();

    // Store OTP (mock provider — in production this would send SMS)
    otpStore.set(lockoutKey, {
      otp,
      expiresAt: Date.now() + OTP_EXPIRY_MS,
      userId: user.id,
      tenantId: user.tenant_id,
    });

    // In MVP, return the OTP for testing convenience
    return { message: 'OTP sent successfully', otp };
  }

  /**
   * Verify OTP and issue JWT tokens.
   */
  async verifyOtp(
    phone: string,
    tenantId: string,
    otp: string,
    deviceInfo?: string,
    ipAddress?: string
  ): Promise<AuthTokens> {
    const lockoutKey = `${tenantId}:${phone}`;

    // Check lockout
    const lockout = lockoutStore.get(lockoutKey);
    if (lockout?.lockedUntil && Date.now() < lockout.lockedUntil) {
      const remainingMs = lockout.lockedUntil - Date.now();
      const remainingMin = Math.ceil(remainingMs / 60000);
      throw new AuthError(
        `Account is locked. Try again in ${remainingMin} minute(s).`,
        429
      );
    }

    const entry = otpStore.get(lockoutKey);
    if (!entry) {
      this.recordFailedAttempt(lockoutKey);
      throw new AuthError('No OTP found. Please request a new one.', 400);
    }

    if (Date.now() > entry.expiresAt) {
      otpStore.delete(lockoutKey);
      this.recordFailedAttempt(lockoutKey);
      throw new AuthError('OTP has expired. Please request a new one.', 400);
    }

    if (entry.otp !== otp) {
      this.recordFailedAttempt(lockoutKey);
      const current = lockoutStore.get(lockoutKey);
      const remaining = MAX_FAILED_ATTEMPTS - (current?.failedAttempts ?? 0);
      throw new AuthError(
        `Invalid OTP. ${remaining} attempt(s) remaining.`,
        401
      );
    }

    // OTP valid — clear lockout and OTP
    otpStore.delete(lockoutKey);
    lockoutStore.delete(lockoutKey);

    // Fetch full user
    const pool = getPool();
    const userResult = await pool.query(
      'SELECT id, tenant_id, roles FROM users WHERE id = $1',
      [entry.userId]
    );
    const user = userResult.rows[0];

    // Update last_login
    await pool.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);

    // Create session and tokens
    const sessionId = uuidv4();
    const payload: TokenPayload = {
      userId: user.id,
      tenantId: user.tenant_id,
      roles: user.roles,
      sessionId,
    };

    const accessToken = signToken(payload, JWT_EXPIRY);
    const refreshToken = signToken({ ...payload, sessionId: `refresh:${sessionId}` }, '7d');

    // Store session
    await pool.query(
      `INSERT INTO sessions (id, user_id, token_hash, expires_at, device_info, ip_address)
       VALUES ($1, $2, $3, NOW() + INTERVAL '24 hours', $4, $5)`,
      [sessionId, user.id, hashToken(accessToken), deviceInfo ?? null, ipAddress ?? null]
    );

    return {
      accessToken,
      refreshToken,
      expiresIn: 86400, // 24 hours in seconds
    };
  }

  /**
   * Logout — invalidate ALL active sessions for the user.
   */
  async logout(userId: string) {
    const pool = getPool();
    await pool.query('DELETE FROM sessions WHERE user_id = $1', [userId]);
    return { message: 'Logged out successfully. All sessions invalidated.' };
  }

  /**
   * Refresh an access token using a valid refresh token.
   */
  async refreshToken(refreshTokenStr: string): Promise<AuthTokens> {
    let payload: TokenPayload;
    try {
      payload = verifyToken(refreshTokenStr);
    } catch {
      throw new AuthError('Invalid or expired refresh token.', 401);
    }

    // Verify user still exists
    const pool = getPool();
    const userResult = await pool.query(
      'SELECT id, tenant_id, roles FROM users WHERE id = $1',
      [payload.userId]
    );
    if (userResult.rows.length === 0) {
      throw new AuthError('User not found.', 404);
    }

    const user = userResult.rows[0];
    const sessionId = uuidv4();
    const newPayload: TokenPayload = {
      userId: user.id,
      tenantId: user.tenant_id,
      roles: user.roles,
      sessionId,
    };

    const accessToken = signToken(newPayload, JWT_EXPIRY);
    const newRefreshToken = signToken({ ...newPayload, sessionId: `refresh:${sessionId}` }, '7d');

    // Store new session
    await pool.query(
      `INSERT INTO sessions (id, user_id, token_hash, expires_at, device_info)
       VALUES ($1, $2, $3, NOW() + INTERVAL '24 hours', $4)`,
      [sessionId, user.id, hashToken(accessToken), null]
    );

    return {
      accessToken,
      refreshToken: newRefreshToken,
      expiresIn: 86400,
    };
  }

  /**
   * Get current user profile from token.
   */
  async me(userId: string) {
    const pool = getPool();
    const result = await pool.query(
      'SELECT id, tenant_id, phone, email, name, roles, language_preference, created_at, last_login FROM users WHERE id = $1',
      [userId]
    );
    if (result.rows.length === 0) {
      throw new AuthError('User not found.', 404);
    }
    return result.rows[0];
  }

  /**
   * Check if an account is currently locked.
   */
  isLocked(tenantId: string, phone: string): boolean {
    const lockoutKey = `${tenantId}:${phone}`;
    const lockout = lockoutStore.get(lockoutKey);
    return !!(lockout?.lockedUntil && Date.now() < lockout.lockedUntil);
  }

  /**
   * Get remaining failed attempts before lockout.
   */
  getRemainingAttempts(tenantId: string, phone: string): number {
    const lockoutKey = `${tenantId}:${phone}`;
    const lockout = lockoutStore.get(lockoutKey);
    return MAX_FAILED_ATTEMPTS - (lockout?.failedAttempts ?? 0);
  }

  private recordFailedAttempt(lockoutKey: string) {
    const current = lockoutStore.get(lockoutKey) ?? { failedAttempts: 0, lockedUntil: null };
    current.failedAttempts += 1;

    if (current.failedAttempts >= MAX_FAILED_ATTEMPTS) {
      current.lockedUntil = Date.now() + LOCKOUT_DURATION_MS;
    }

    lockoutStore.set(lockoutKey, current);
  }
}

// ── Auth Error ─────────────────────────────────────────────────
export class AuthError extends Error {
  statusCode: number;
  constructor(message: string, statusCode: number = 400) {
    super(message);
    this.name = 'AuthError';
    this.statusCode = statusCode;
  }
}
