import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './authenticate';
import { Role } from '../types/enums';
import { getPool } from '../db/pool';

// ── Permission definitions ──────────────────────────────────────

/**
 * Each permission represents a granular action in the system.
 * Endpoints declare which permission(s) they require.
 */
export enum Permission {
  // Farm
  FARM_CREATE = 'farm:create',
  FARM_READ = 'farm:read',
  FARM_UPDATE = 'farm:update',
  FARM_DELETE = 'farm:delete',

  // Crop / Input / Yield
  CROP_MANAGE = 'crop:manage',
  INPUT_LOG = 'input:log',
  YIELD_LOG = 'yield:log',

  // AI
  AI_CHAT = 'ai:chat',
  AI_CLASSIFY_DISEASE = 'ai:classify_disease',
  AI_WORKFLOW = 'ai:workflow',

  // Market
  MARKET_VIEW = 'market:view',
  MARKET_ALERTS_MANAGE = 'market:alerts_manage',

  // Sustainability
  SUSTAINABILITY_VIEW = 'sustainability:view',

  // Alerts
  ALERTS_VIEW = 'alerts:view',
  ALERTS_MANAGE_PREFS = 'alerts:manage_prefs',

  // Knowledge base
  KNOWLEDGE_CREATE = 'knowledge:create',
  KNOWLEDGE_APPROVE = 'knowledge:approve',

  // Groups (Field Officer)
  GROUP_MANAGE = 'group:manage',
  GROUP_BROADCAST = 'group:broadcast',

  // Tenant admin
  TENANT_USERS_MANAGE = 'tenant:users_manage',
  TENANT_SETTINGS = 'tenant:settings',
  TENANT_ANALYTICS = 'tenant:analytics',
  TENANT_CONTENT = 'tenant:content',

  // Platform admin
  PLATFORM_TENANTS_MANAGE = 'platform:tenants_manage',
  PLATFORM_CONFIG = 'platform:config',
  PLATFORM_ANALYTICS = 'platform:analytics',

  // ML Ops
  MLOPS_MODELS = 'mlops:models',
  MLOPS_PIPELINES = 'mlops:pipelines',
  MLOPS_MONITORING = 'mlops:monitoring',

  // Audit
  AUDIT_VIEW = 'audit:view',

  // Role management
  ROLE_ASSIGN = 'role:assign',
}

// ── Role → Permissions mapping ──────────────────────────────────

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  [Role.FARMER]: [
    Permission.FARM_CREATE,
    Permission.FARM_READ,
    Permission.FARM_UPDATE,
    Permission.FARM_DELETE,
    Permission.CROP_MANAGE,
    Permission.INPUT_LOG,
    Permission.YIELD_LOG,
    Permission.AI_CHAT,
    Permission.AI_CLASSIFY_DISEASE,
    Permission.AI_WORKFLOW,
    Permission.MARKET_VIEW,
    Permission.MARKET_ALERTS_MANAGE,
    Permission.SUSTAINABILITY_VIEW,
    Permission.ALERTS_VIEW,
    Permission.ALERTS_MANAGE_PREFS,
  ],

  [Role.FIELD_OFFICER]: [
    Permission.FARM_READ,
    Permission.AI_CHAT,
    Permission.AI_CLASSIFY_DISEASE,
    Permission.MARKET_VIEW,
    Permission.SUSTAINABILITY_VIEW,
    Permission.ALERTS_VIEW,
    Permission.ALERTS_MANAGE_PREFS,
    Permission.GROUP_MANAGE,
    Permission.GROUP_BROADCAST,
  ],

  [Role.AGRONOMIST]: [
    Permission.FARM_READ,
    Permission.AI_CHAT,
    Permission.AI_CLASSIFY_DISEASE,
    Permission.MARKET_VIEW,
    Permission.SUSTAINABILITY_VIEW,
    Permission.ALERTS_VIEW,
    Permission.KNOWLEDGE_CREATE,
    Permission.KNOWLEDGE_APPROVE,
  ],

  [Role.BUYER]: [
    Permission.MARKET_VIEW,
    Permission.MARKET_ALERTS_MANAGE,
    Permission.ALERTS_VIEW,
    Permission.ALERTS_MANAGE_PREFS,
  ],

  [Role.TENANT_ADMIN]: [
    Permission.FARM_READ,
    Permission.AI_CHAT,
    Permission.MARKET_VIEW,
    Permission.SUSTAINABILITY_VIEW,
    Permission.ALERTS_VIEW,
    Permission.KNOWLEDGE_CREATE,
    Permission.KNOWLEDGE_APPROVE,
    Permission.TENANT_USERS_MANAGE,
    Permission.TENANT_SETTINGS,
    Permission.TENANT_ANALYTICS,
    Permission.TENANT_CONTENT,
    Permission.ROLE_ASSIGN,
    Permission.AUDIT_VIEW,
  ],

  [Role.PLATFORM_ADMIN]: [
    Permission.FARM_READ,
    Permission.AI_CHAT,
    Permission.MARKET_VIEW,
    Permission.SUSTAINABILITY_VIEW,
    Permission.ALERTS_VIEW,
    Permission.KNOWLEDGE_CREATE,
    Permission.KNOWLEDGE_APPROVE,
    Permission.TENANT_USERS_MANAGE,
    Permission.TENANT_SETTINGS,
    Permission.TENANT_ANALYTICS,
    Permission.TENANT_CONTENT,
    Permission.ROLE_ASSIGN,
    Permission.AUDIT_VIEW,
    Permission.PLATFORM_TENANTS_MANAGE,
    Permission.PLATFORM_CONFIG,
    Permission.PLATFORM_ANALYTICS,
    Permission.MLOPS_MODELS,
    Permission.MLOPS_PIPELINES,
    Permission.MLOPS_MONITORING,
  ],

  [Role.ML_OPS]: [
    Permission.MLOPS_MODELS,
    Permission.MLOPS_PIPELINES,
    Permission.MLOPS_MONITORING,
    Permission.AUDIT_VIEW,
  ],
};

// ── Helpers ─────────────────────────────────────────────────────

/**
 * Compute the union of permissions for a set of roles.
 * Permissions are applied immediately from the user's current roles
 * (read from the JWT at request time), so changes take effect without re-login.
 */
export function getPermissionsForRoles(roles: string[]): Set<Permission> {
  const perms = new Set<Permission>();
  for (const role of roles) {
    const rolePerms = ROLE_PERMISSIONS[role as Role];
    if (rolePerms) {
      for (const p of rolePerms) {
        perms.add(p);
      }
    }
  }
  return perms;
}

/**
 * Check whether a set of roles satisfies ALL of the required permissions.
 */
export function hasPermissions(
  userRoles: string[],
  required: Permission[],
): boolean {
  const perms = getPermissionsForRoles(userRoles);
  return required.every((p) => perms.has(p));
}

// ── Privilege-escalation guard ──────────────────────────────────

/**
 * Roles that are allowed to assign roles, and the maximum roles they can assign.
 * Tenant_Admin can assign any role except Platform_Admin and ML_Ops.
 * Platform_Admin can assign any role.
 */
const ROLE_ASSIGNMENT_LIMITS: Record<string, Role[]> = {
  [Role.TENANT_ADMIN]: [
    Role.FARMER,
    Role.FIELD_OFFICER,
    Role.AGRONOMIST,
    Role.BUYER,
    Role.TENANT_ADMIN,
  ],
  [Role.PLATFORM_ADMIN]: [
    Role.FARMER,
    Role.FIELD_OFFICER,
    Role.AGRONOMIST,
    Role.BUYER,
    Role.TENANT_ADMIN,
    Role.PLATFORM_ADMIN,
    Role.ML_OPS,
  ],
};

/**
 * Returns true if the actor (with given roles) is allowed to assign `targetRole`.
 * Prevents privilege escalation: only authorized admins can assign roles,
 * and they cannot assign roles beyond their own authority.
 */
export function canAssignRole(actorRoles: string[], targetRole: Role): boolean {
  for (const actorRole of actorRoles) {
    const allowed = ROLE_ASSIGNMENT_LIMITS[actorRole];
    if (allowed && allowed.includes(targetRole)) {
      return true;
    }
  }
  return false;
}

// ── Audit logging ───────────────────────────────────────────────

/**
 * Log a role change to the audit_logs table.
 */
export async function logRoleChange(params: {
  actorId: string;
  targetUserId: string;
  tenantId: string;
  previousRoles: string[];
  newRoles: string[];
  ipAddress?: string;
  userAgent?: string;
}): Promise<void> {
  try {
    const pool = getPool();
    await pool.query(
      `INSERT INTO audit_logs (id, tenant_id, user_id, action, resource_type, resource_id, changes, ip_address, user_agent, timestamp)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
      [
        params.tenantId,
        params.actorId,
        'role_change',
        'user',
        params.targetUserId,
        JSON.stringify({
          previous_roles: params.previousRoles,
          new_roles: params.newRoles,
        }),
        params.ipAddress ?? null,
        params.userAgent ?? null,
      ],
    );
  } catch (err) {
    // Audit logging should not break the request — log and continue
    console.error('Failed to write role-change audit log:', err);
  }
}

// ── Middleware factory ───────────────────────────────────────────

/**
 * Express middleware that enforces RBAC.
 *
 * Usage:
 *   router.get('/farms', authenticate, requirePermissions(Permission.FARM_READ), handler);
 *
 * The middleware reads `req.user.roles` (set by the `authenticate` middleware)
 * and checks the union of permissions for those roles against the required set.
 * Permission changes are applied immediately because roles are read from the
 * token on every request — no re-login needed.
 */
export function requirePermissions(...required: Permission[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    if (!hasPermissions(user.roles, required)) {
      res.status(403).json({ error: 'Insufficient permissions.' });
      return;
    }

    next();
  };
}

/**
 * Convenience middleware that requires the user to have at least one of the listed roles.
 *
 * Usage:
 *   router.post('/admin/users', authenticate, requireRoles(Role.TENANT_ADMIN, Role.PLATFORM_ADMIN), handler);
 */
export function requireRoles(...roles: Role[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    const hasRole = user.roles.some((r) => roles.includes(r as Role));
    if (!hasRole) {
      res.status(403).json({ error: 'Insufficient permissions.' });
      return;
    }

    next();
  };
}

// ── IAM policy definitions (service-to-service) ─────────────────

/**
 * IAM role-based access policies for backend services.
 * Each service assumes only the IAM permissions it needs (least privilege).
 * These are used as reference for AWS IAM policy documents — the actual
 * enforcement happens at the AWS level via IAM roles attached to ECS tasks / Lambda.
 *
 * All AWS SDK calls use IAM roles (instance profiles / task roles), never long-lived keys.
 */
export const IAM_SERVICE_POLICIES = {
  authService: {
    description: 'Auth service — reads DB secrets, manages sessions',
    statements: [
      { effect: 'Allow', actions: ['secretsmanager:GetSecretValue'], resources: ['arn:aws:secretsmanager:*:*:secret:krishimitra/db-*'] },
    ],
  },
  aiService: {
    description: 'AI service — invokes Bedrock / SageMaker, reads S3 knowledge base',
    statements: [
      { effect: 'Allow', actions: ['bedrock:InvokeModel'], resources: ['*'] },
      { effect: 'Allow', actions: ['s3:GetObject'], resources: ['arn:aws:s3:::krishimitra-knowledge-*/*'] },
      { effect: 'Allow', actions: ['secretsmanager:GetSecretValue'], resources: ['arn:aws:secretsmanager:*:*:secret:krishimitra/db-*'] },
    ],
  },
  marketService: {
    description: 'Market service — reads S3 data, publishes CloudWatch metrics',
    statements: [
      { effect: 'Allow', actions: ['s3:GetObject'], resources: ['arn:aws:s3:::krishimitra-market-data-*/*'] },
      { effect: 'Allow', actions: ['cloudwatch:PutMetricData'], resources: ['*'] },
      { effect: 'Allow', actions: ['secretsmanager:GetSecretValue'], resources: ['arn:aws:secretsmanager:*:*:secret:krishimitra/db-*'] },
    ],
  },
  etlService: {
    description: 'ETL service — reads/writes S3, reads external APIs',
    statements: [
      { effect: 'Allow', actions: ['s3:GetObject', 's3:PutObject'], resources: ['arn:aws:s3:::krishimitra-etl-*/*'] },
      { effect: 'Allow', actions: ['secretsmanager:GetSecretValue'], resources: ['arn:aws:secretsmanager:*:*:secret:krishimitra/db-*'] },
    ],
  },
  mlOpsService: {
    description: 'ML Ops service — manages SageMaker endpoints, reads CloudWatch',
    statements: [
      { effect: 'Allow', actions: ['sagemaker:DescribeEndpoint', 'sagemaker:InvokeEndpoint'], resources: ['*'] },
      { effect: 'Allow', actions: ['cloudwatch:GetMetricData', 'cloudwatch:PutMetricData'], resources: ['*'] },
      { effect: 'Allow', actions: ['secretsmanager:GetSecretValue'], resources: ['arn:aws:secretsmanager:*:*:secret:krishimitra/db-*'] },
    ],
  },
} as const;

export { ROLE_PERMISSIONS, ROLE_ASSIGNMENT_LIMITS };
