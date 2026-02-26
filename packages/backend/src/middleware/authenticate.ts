import { Request, Response, NextFunction } from 'express';
import { verifyToken, TokenPayload } from '../services/auth';

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
  } catch {
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
