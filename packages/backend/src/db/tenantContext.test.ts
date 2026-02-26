import { Request, Response, NextFunction } from 'express';
import { setTenantContext, TenantRequest } from './tenantContext';

describe('setTenantContext', () => {
  let req: Partial<TenantRequest>;
  let res: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    req = {};
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    next = jest.fn();
  });

  it('returns 401 when user is not set on request', () => {
    setTenantContext(req as Request, res as Response, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Tenant context is required' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when tenant_id is missing from user', () => {
    req.user = { id: 'u1', tenant_id: '', roles: [] };
    setTenantContext(req as Request, res as Response, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid UUID format', () => {
    req.user = { id: 'u1', tenant_id: 'not-a-uuid', roles: [] };
    setTenantContext(req as Request, res as Response, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid tenant identifier' });
    expect(next).not.toHaveBeenCalled();
  });

  it('sets tenantId on request and calls next for valid UUID', () => {
    const tenantId = '550e8400-e29b-41d4-a716-446655440000';
    req.user = { id: 'u1', tenant_id: tenantId, roles: ['farmer'] };
    setTenantContext(req as Request, res as Response, next);
    expect((req as TenantRequest).tenantId).toBe(tenantId);
    expect(next).toHaveBeenCalled();
  });

  it('accepts uppercase UUID', () => {
    const tenantId = '550E8400-E29B-41D4-A716-446655440000';
    req.user = { id: 'u1', tenant_id: tenantId, roles: [] };
    setTenantContext(req as Request, res as Response, next);
    expect((req as TenantRequest).tenantId).toBe(tenantId);
    expect(next).toHaveBeenCalled();
  });
});
