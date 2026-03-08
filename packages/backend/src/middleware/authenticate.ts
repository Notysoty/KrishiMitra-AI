import { Request, Response, NextFunction } from 'express';
import { verifyToken, TokenPayload } from '../services/auth';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toUuid(sub: string): string {
  if (UUID_RE.test(sub)) return sub;
  const digits = sub.replace(/\D/g, '').padStart(12, '0').slice(-12);
  return `00000000-0000-4000-8000-${digits}`;
}

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    tenant_id: string;
    roles: string[];
    sessionId: string;
  };
}

/**
 * Middleware that verifies the JWT Bearer token and attaches user info to the request.
 */
export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required. Provide a Bearer token.' });
    return;
  }

  const token = authHeader.slice(7);
  try {
    const payload: TokenPayload = verifyToken(token);
    (req as AuthenticatedRequest).user = {
      id: payload.userId,
      tenant_id: payload.tenantId,
      roles: payload.roles,
      sessionId: payload.sessionId,
    };
    next();
  } catch (err) {
    // Development fallback to allow frontend's mock token
    if (process.env.NODE_ENV !== 'production' && token.endsWith('bW9jay1zaWduYXR1cmU=')) {
      try {
        const payloadStr = Buffer.from(token.split('.')[1], 'base64').toString();
        const mockPayload = JSON.parse(payloadStr);
        (req as AuthenticatedRequest).user = {
          id: toUuid(mockPayload.sub || '000000000001'),
          tenant_id: '00000000-0000-4000-8000-000000000002',
          roles: ['farmer'],
          sessionId: 'mock-session-id',
        };
        next();
        return;
      } catch (parseErr) {
        // Fall back to original error
      }
    }
    res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

/**
 * Middleware that enforces HTTPS in production.
 * In development/test, this is a no-op.
 */
export function requireHttps(req: Request, res: Response, next: NextFunction): void {
  if (
    process.env.NODE_ENV === 'production' &&
    req.headers['x-forwarded-proto'] !== 'https' &&
    !req.secure
  ) {
    res.status(403).json({ error: 'HTTPS is required for authentication endpoints.' });
    return;
  }
  next();
}
