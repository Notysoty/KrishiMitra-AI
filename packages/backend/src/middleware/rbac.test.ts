import { Request, Response, NextFunction } from 'express';
import { Role } from '../types/enums';
import {
  Permission,
  getPermissionsForRoles,
  hasPermissions,
  canAssignRole,
  requirePermissions,
  requireRoles,
  logRoleChange,
  ROLE_PERMISSIONS,
  ROLE_ASSIGNMENT_LIMITS,
} from './rbac';
import { AuthenticatedRequest } from './authenticate';

// ── Mock DB pool ────────────────────────────────────────────────
const mockQuery = jest.fn();
jest.mock('../db/pool', () => ({
  getPool: () => ({ query: mockQuery }),
}));

// ── Helpers ─────────────────────────────────────────────────────
function mockReqResNext(user?: AuthenticatedRequest['user']) {
  const req = { user } as AuthenticatedRequest;
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as unknown as Response;
  const next = jest.fn() as NextFunction;
  return { req, res, next };
}

// ── Tests ───────────────────────────────────────────────────────

describe('RBAC Middleware', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  // ── getPermissionsForRoles ──────────────────────────────────
  describe('getPermissionsForRoles', () => {
    it('returns empty set for empty roles', () => {
      expect(getPermissionsForRoles([]).size).toBe(0);
    });

    it('returns correct permissions for FARMER', () => {
      const perms = getPermissionsForRoles([Role.FARMER]);
      expect(perms.has(Permission.FARM_CREATE)).toBe(true);
      expect(perms.has(Permission.AI_CHAT)).toBe(true);
      expect(perms.has(Permission.PLATFORM_TENANTS_MANAGE)).toBe(false);
    });

    it('computes union of permissions for multiple roles', () => {
      const perms = getPermissionsForRoles([Role.FARMER, Role.FIELD_OFFICER]);
      // FARMER has FARM_CREATE, FIELD_OFFICER does not
      expect(perms.has(Permission.FARM_CREATE)).toBe(true);
      // FIELD_OFFICER has GROUP_MANAGE, FARMER does not
      expect(perms.has(Permission.GROUP_MANAGE)).toBe(true);
    });

    it('ignores unknown roles gracefully', () => {
      const perms = getPermissionsForRoles(['unknown_role']);
      expect(perms.size).toBe(0);
    });
  });

  // ── hasPermissions ──────────────────────────────────────────
  describe('hasPermissions', () => {
    it('returns true when user has all required permissions', () => {
      expect(hasPermissions([Role.FARMER], [Permission.FARM_CREATE, Permission.AI_CHAT])).toBe(true);
    });

    it('returns false when user lacks a required permission', () => {
      expect(hasPermissions([Role.BUYER], [Permission.FARM_CREATE])).toBe(false);
    });

    it('returns true for empty required permissions', () => {
      expect(hasPermissions([Role.FARMER], [])).toBe(true);
    });
  });

  // ── canAssignRole ───────────────────────────────────────────
  describe('canAssignRole', () => {
    it('allows TENANT_ADMIN to assign FARMER', () => {
      expect(canAssignRole([Role.TENANT_ADMIN], Role.FARMER)).toBe(true);
    });

    it('prevents TENANT_ADMIN from assigning PLATFORM_ADMIN', () => {
      expect(canAssignRole([Role.TENANT_ADMIN], Role.PLATFORM_ADMIN)).toBe(false);
    });

    it('prevents TENANT_ADMIN from assigning ML_OPS', () => {
      expect(canAssignRole([Role.TENANT_ADMIN], Role.ML_OPS)).toBe(false);
    });

    it('allows PLATFORM_ADMIN to assign any role', () => {
      for (const role of Object.values(Role)) {
        expect(canAssignRole([Role.PLATFORM_ADMIN], role)).toBe(true);
      }
    });

    it('prevents FARMER from assigning any role', () => {
      expect(canAssignRole([Role.FARMER], Role.FARMER)).toBe(false);
    });

    it('uses union: FARMER+TENANT_ADMIN can assign FARMER', () => {
      expect(canAssignRole([Role.FARMER, Role.TENANT_ADMIN], Role.FARMER)).toBe(true);
    });
  });

  // ── requirePermissions middleware ───────────────────────────
  describe('requirePermissions', () => {
    it('calls next() when user has required permissions', () => {
      const { req, res, next } = mockReqResNext({
        id: 'u1', tenant_id: 't1', roles: [Role.FARMER], sessionId: 's1',
      });
      requirePermissions(Permission.FARM_CREATE)(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('returns 403 when user lacks permissions', () => {
      const { req, res, next } = mockReqResNext({
        id: 'u1', tenant_id: 't1', roles: [Role.BUYER], sessionId: 's1',
      });
      requirePermissions(Permission.FARM_CREATE)(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('returns 401 when user is not authenticated', () => {
      const { req, res, next } = mockReqResNext(undefined);
      requirePermissions(Permission.FARM_CREATE)(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
    });
  });

  // ── requireRoles middleware ─────────────────────────────────
  describe('requireRoles', () => {
    it('calls next() when user has one of the required roles', () => {
      const { req, res, next } = mockReqResNext({
        id: 'u1', tenant_id: 't1', roles: [Role.TENANT_ADMIN], sessionId: 's1',
      });
      requireRoles(Role.TENANT_ADMIN, Role.PLATFORM_ADMIN)(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('returns 403 when user has none of the required roles', () => {
      const { req, res, next } = mockReqResNext({
        id: 'u1', tenant_id: 't1', roles: [Role.FARMER], sessionId: 's1',
      });
      requireRoles(Role.TENANT_ADMIN, Role.PLATFORM_ADMIN)(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('returns 401 when user is not authenticated', () => {
      const { req, res, next } = mockReqResNext(undefined);
      requireRoles(Role.TENANT_ADMIN)(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
    });
  });

  // ── logRoleChange ───────────────────────────────────────────
  describe('logRoleChange', () => {
    it('inserts an audit log entry', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await logRoleChange({
        actorId: 'admin-1',
        targetUserId: 'user-1',
        tenantId: 'tenant-1',
        previousRoles: ['farmer'],
        newRoles: ['farmer', 'field_officer'],
      });
      expect(mockQuery).toHaveBeenCalledTimes(1);
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain('INSERT INTO audit_logs');
      expect(params[2]).toBe('role_change');
      expect(params[3]).toBe('user');
      expect(params[4]).toBe('user-1');
      expect(JSON.parse(params[5])).toEqual({
        previous_roles: ['farmer'],
        new_roles: ['farmer', 'field_officer'],
      });
    });

    it('does not throw when DB write fails', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB down'));
      await expect(
        logRoleChange({
          actorId: 'admin-1',
          targetUserId: 'user-1',
          tenantId: 'tenant-1',
          previousRoles: ['farmer'],
          newRoles: ['farmer', 'field_officer'],
        }),
      ).resolves.toBeUndefined();
    });
  });

  // ── Role permission coverage ────────────────────────────────
  describe('ROLE_PERMISSIONS coverage', () => {
    it('every Role enum value has a permissions entry', () => {
      for (const role of Object.values(Role)) {
        expect(ROLE_PERMISSIONS[role]).toBeDefined();
        expect(Array.isArray(ROLE_PERMISSIONS[role])).toBe(true);
      }
    });

    it('PLATFORM_ADMIN has all permissions that TENANT_ADMIN has', () => {
      const tenantPerms = new Set(ROLE_PERMISSIONS[Role.TENANT_ADMIN]);
      const platformPerms = new Set(ROLE_PERMISSIONS[Role.PLATFORM_ADMIN]);
      for (const p of tenantPerms) {
        expect(platformPerms.has(p)).toBe(true);
      }
    });
  });

  // ── ROLE_ASSIGNMENT_LIMITS ──────────────────────────────────
  describe('ROLE_ASSIGNMENT_LIMITS', () => {
    it('only TENANT_ADMIN and PLATFORM_ADMIN can assign roles', () => {
      expect(Object.keys(ROLE_ASSIGNMENT_LIMITS)).toEqual(
        expect.arrayContaining([Role.TENANT_ADMIN, Role.PLATFORM_ADMIN]),
      );
      expect(Object.keys(ROLE_ASSIGNMENT_LIMITS).length).toBe(2);
    });
  });
});
