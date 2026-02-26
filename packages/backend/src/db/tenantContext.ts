import { Request, Response, NextFunction } from 'express';
import { getPool } from './pool';

/**
 * Express middleware that sets the `app.current_tenant` PostgreSQL session
 * variable for the current database connection. This enables Row-Level
 * Security (RLS) policies to automatically filter data by tenant.
 *
 * Expects `req.user.tenant_id` to be set by an upstream auth middleware.
 */
export function setTenantContext(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const tenantId = (req as TenantRequest).user?.tenant_id;

  if (!tenantId) {
    res.status(401).json({ error: 'Tenant context is required' });
    return;
  }

  // Validate UUID format to prevent SQL injection via session variable
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(tenantId)) {
    res.status(400).json({ error: 'Invalid tenant identifier' });
    return;
  }

  // Store tenant_id on the request for use by repositories
  (req as TenantRequest).tenantId = tenantId;
  next();
}

/**
 * Sets the PostgreSQL session variable `app.current_tenant` on a given
 * database client. Call this before executing tenant-scoped queries so
 * that RLS policies filter correctly.
 */
export async function setTenantOnClient(tenantId: string): Promise<void> {
  const pool = getPool();
  await pool.query(`SET LOCAL app.current_tenant = $1`, [tenantId]);
}

/** Extended Express Request carrying authenticated user and tenant info. */
export interface TenantRequest extends Request {
  user?: {
    id: string;
    tenant_id: string;
    roles: string[];
  };
  tenantId?: string;
}
