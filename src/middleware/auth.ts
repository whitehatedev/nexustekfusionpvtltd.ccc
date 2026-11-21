import { Request, Response, NextFunction } from 'express';
import { eq } from 'drizzle-orm';
import {
  db,
  getLastDbError,
  isCloudDatabaseConfigured,
  isCloudDbReady,
  verifyCloudDatabaseConnection,
} from '../db/index.ts';
import { adminSessions } from '../db/schema.ts';
import { verifySupabaseAccessToken } from '../lib/supabase-admin.ts';
import {
  ADMIN_ROLES_SET,
  CustomerPermissions,
  getSessionContextByToken,
  getStaffCustomerPermissions,
  resolveOrProvisionCustomerFromOtp,
} from '../db/users.ts';
import {
  findPublicCustomerForUser,
  isPublicCustomersSchemaReady,
} from '../server/supabase-customers.ts';
import { parseCookies } from '../server/utils.ts';

export const ADMIN_SESSION_COOKIE = 'ntf_admin_session';
export const USER_SESSION_COOKIE = 'ntf_session';

export const ADMIN_ROLES = ADMIN_ROLES_SET;

export interface DbUser {
  id: number;
  uid: string;
  customerId?: string;
  authUserId?: string | null;
  email: string;
  fullName: string;
  mobile: string;
  companyOrCollege: string;
  fullAddress?: string;
  city?: string;
  state?: string;
  pinCode?: string;
  profilePhotoUrl?: string;
  customerType?: string;
  billingDetails?: Record<string, any>;
  accountStatus?: string;
  registrationDate?: string;
  lastLoginAt?: Date | string | null;
  role: string;
  emailVerified?: boolean;
  phoneVerified?: boolean;
  emailConfirmedAt?: string;
  phoneConfirmedAt?: string;
  notificationPreferences?: {
    emailUpdates: boolean;
    orderAlerts: boolean;
    quotationAlerts: boolean;
    promotionalEmails: boolean;
    whatsappAlerts: boolean;
  };
  isActive?: boolean;
  createdAt?: Date | string;
}

export interface AuthUserClaims {
  uid: string;
  email?: string;
  name?: string;
}

export interface AuthRequest extends Request {
  user?: AuthUserClaims;
  dbUser?: DbUser;
  activeCustomerId?: string;
  sessionScope?: 'customer' | 'admin';
}

async function enforcePublicCustomerActive(
  dbUser: DbUser,
  activeCustomerId?: string
): Promise<DbUser | null> {
  const effectiveCode =
    activeCustomerId ||
    dbUser.customerId ||
    (dbUser.uid?.startsWith('NTF-CUST-') ? dbUser.uid : '');

  if (ADMIN_ROLES_SET.has(dbUser.role)) return dbUser;
  if (!(await isPublicCustomersSchemaReady())) {
    return { ...dbUser, ...(effectiveCode ? { customerId: effectiveCode } : {}) };
  }

  const publicCust = await findPublicCustomerForUser({
    customerId: effectiveCode || undefined,
    authUserId: dbUser.authUserId,
    uid: dbUser.uid,
    id: dbUser.id,
    email: dbUser.email,
  });

  if (!publicCust) {
    return { ...dbUser, ...(effectiveCode ? { customerId: effectiveCode } : {}) };
  }

  if (publicCust.deletedAt) {
    await db.delete(adminSessions).where(eq(adminSessions.userId, dbUser.id)).catch(() => {});
    return null;
  }

  if (publicCust.accountStatus !== 'Active') {
    await db.delete(adminSessions).where(eq(adminSessions.userId, dbUser.id)).catch(() => {});
    const disabledErr = new Error(
      `Your account is currently ${publicCust.accountStatus}. Please contact support.`
    );
    (disabledErr as any).statusCode = 403;
    throw disabledErr;
  }

  return {
    ...dbUser,
    customerId: publicCust.customerId,
    fullName: publicCust.fullName || dbUser.fullName,
    mobile: publicCust.phoneNumber || dbUser.mobile,
    companyOrCollege: publicCust.companyOrCollege || dbUser.companyOrCollege,
    fullAddress: publicCust.fullAddress || dbUser.fullAddress,
    city: publicCust.city || dbUser.city,
    state: publicCust.state || dbUser.state,
    pinCode: publicCust.pinCode || dbUser.pinCode,
    profilePhotoUrl: publicCust.profilePhotoUrl || dbUser.profilePhotoUrl || '',
    customerType: publicCust.customerType || dbUser.customerType || 'Individual',
    billingDetails:
      publicCust.billingDetails && Object.keys(publicCust.billingDetails).length > 0
        ? publicCust.billingDetails
        : dbUser.billingDetails || {},
    accountStatus: publicCust.accountStatus || dbUser.accountStatus || 'Active',
    registrationDate: publicCust.registrationDate || dbUser.registrationDate,
    lastLoginAt: publicCust.lastLoginAt || dbUser.lastLoginAt,
  };
}

async function resolveUserFromRequest(
  req: Request
): Promise<{
  dbUser: DbUser;
  authUser?: AuthUserClaims;
  activeCustomerId?: string;
  sessionScope: 'customer' | 'admin';
} | null> {
  const fullPath = String(req.originalUrl || req.url || '');
  const isAdminApiEndpoint = fullPath.startsWith('/api/admin');
  const isAdminSyncEndpoint = fullPath.startsWith('/api/auth/sync-profile');

  // 1. Check explicit Bearer header FIRST so per-tab in-memory Bearer tokens never get shadowed by stale cookies
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice('Bearer '.length).trim();
    if (token && token !== 'null' && token !== 'undefined') {
      const sessionCtx = await getSessionContextByToken(token);
      if (sessionCtx?.user && sessionCtx.user.isActive !== false) {
        const checkedUser = await enforcePublicCustomerActive(sessionCtx.user, sessionCtx.activeCustomerId);
        if (!checkedUser) return null;
        const resolvedCode = checkedUser.customerId || sessionCtx.activeCustomerId || '';
        return {
          dbUser: checkedUser,
          activeCustomerId: resolvedCode,
          sessionScope: sessionCtx.sessionScope,
          authUser: { uid: checkedUser.uid, email: checkedUser.email, name: checkedUser.fullName },
        };
      }

      const verified = await verifySupabaseAccessToken(token);
      if (verified) {
        // Only allow Supabase Bearer to resolve Staff/Admin on explicit admin sync flow;
        // everywhere else (Customer OTP, /api/auth/session, /api/me), strictly force customerOnly: true!
        const allowStaffLookup = isAdminSyncEndpoint && req.headers['x-auth-mode'] === 'admin';
        const resolution = await resolveOrProvisionCustomerFromOtp({
          authUserId: verified.uid,
          email: verified.email,
          emailConfirmedAt: verified.emailConfirmedAt,
          fullName: verified.fullName,
          phone: verified.phone,
          customerOnly: !allowStaffLookup,
        });

        if (allowStaffLookup && resolution.kind === 'staff') {
          if (resolution.user.isActive === false) {
            const disabledErr = new Error('Account is disabled.');
            (disabledErr as any).statusCode = 403;
            throw disabledErr;
          }
          return {
            dbUser: resolution.user,
            sessionScope: 'admin',
            authUser: { uid: verified.uid, email: verified.email, name: resolution.user.fullName },
          };
        }

        if (resolution.kind === 'single') {
          const checkedUser = await enforcePublicCustomerActive(
            resolution.user,
            resolution.activeProfile.customerId
          );
          if (!checkedUser) return null;
          return {
            dbUser: checkedUser,
            activeCustomerId: resolution.activeProfile.customerId,
            sessionScope: 'customer',
            authUser: { uid: verified.uid, email: verified.email, name: checkedUser.fullName },
          };
        }

        return null;
      }

      // If an explicit Bearer token was provided and is neither a valid NTF session nor a valid Supabase JWT, do NOT fall back to cookies!
      return null;
    }
  }

  // 2. Check signed HTTP-only cookies with strict scope verification
  const cookies = parseCookies(req.headers.cookie);
  const adminCookie = cookies[ADMIN_SESSION_COOKIE];
  const userCookie = cookies[USER_SESSION_COOKIE];

  // On /api/admin/* endpoints check admin cookie first, then customer cookie (so customer gets 403 Forbidden)
  // On non-admin endpoints check customer cookie first so a customer session is never hijacked by a stale admin cookie
  const cookieChecks: Array<{ token: string | undefined; scope: 'customer' | 'admin' }> = isAdminApiEndpoint
    ? [
        { token: adminCookie, scope: 'admin' },
        { token: userCookie, scope: 'customer' },
      ]
    : [
        { token: userCookie, scope: 'customer' },
        { token: adminCookie, scope: 'admin' },
      ];

  for (const check of cookieChecks) {
    if (!check.token) continue;
    const ctx = await getSessionContextByToken(check.token, check.scope);
    if (ctx?.user && ctx.user.isActive !== false) {
      const checkedUser = await enforcePublicCustomerActive(ctx.user, ctx.activeCustomerId);
      if (!checkedUser) continue;
      const resolvedCode = checkedUser.customerId || ctx.activeCustomerId || '';
      return {
        dbUser: checkedUser,
        activeCustomerId: resolvedCode,
        sessionScope: ctx.sessionScope,
        authUser: { uid: checkedUser.uid, email: checkedUser.email, name: checkedUser.fullName },
      };
    }
  }

  return null;
}

export const requireAuth = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const resolved = await resolveUserFromRequest(req);
    if (!resolved) {
      const hasBearer = Boolean(
        req.headers.authorization &&
          req.headers.authorization.startsWith('Bearer ') &&
          !['', 'null', 'undefined'].includes(req.headers.authorization.slice('Bearer '.length).trim())
      );
      return res.status(401).json({
        error: hasBearer
          ? 'Invalid, expired, or incomplete authentication session.'
          : 'Authentication required. Please sign in.',
        code: hasBearer ? 'TOKEN_INVALID' : 'UNAUTHENTICATED',
      });
    }
    req.user = resolved.authUser;
    req.dbUser = resolved.dbUser;
    req.activeCustomerId = resolved.activeCustomerId;
    req.sessionScope = resolved.sessionScope;
    next();
  } catch (error: any) {
    const status = Number(error?.statusCode) || 401;
    if (status >= 500) {
      console.error('Auth verification system error:', error);
    }
    return res.status(status).json({ error: error?.message || 'Invalid or expired authentication token.' });
  }
};

export const optionalAuth = async (req: AuthRequest, _res: Response, next: NextFunction) => {
  try {
    const resolved = await resolveUserFromRequest(req);
    if (resolved) {
      req.user = resolved.authUser;
      req.dbUser = resolved.dbUser;
      req.activeCustomerId = resolved.activeCustomerId;
      req.sessionScope = resolved.sessionScope;
    }
  } catch {
    // Ignore optional auth failures on public routes
  }
  next();
};

export const requireAdmin = (allowedRoles?: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.dbUser) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    if (req.dbUser.isActive === false) {
      return res.status(403).json({ error: 'This staff account has been deactivated.' });
    }
    const role = req.dbUser.role;
    if (!ADMIN_ROLES.has(role)) {
      return res.status(403).json({ error: 'Admin access denied for your account role.' });
    }
    if (req.sessionScope !== 'admin') {
      return res.status(403).json({ error: 'Administrator session required for this resource.' });
    }
    if (allowedRoles && role !== 'super_admin' && role !== 'admin' && !allowedRoles.includes(role)) {
      return res.status(403).json({ error: `Role '${role}' is not authorized for this action.` });
    }
    next();
  };
};

export const requireCustomerPermission = (permissionKey: keyof CustomerPermissions) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.dbUser) {
        return res.status(401).json({ error: 'Authentication required.' });
      }
      if (!ADMIN_ROLES.has(req.dbUser.role)) {
        return res.status(403).json({ error: 'Access denied.' });
      }
      if (req.dbUser.role === 'super_admin') {
        return next();
      }
      const perms = await getStaffCustomerPermissions({
        id: req.dbUser.id,
        role: req.dbUser.role,
      });
      if (!perms[permissionKey]) {
        return res.status(403).json({
          error:
            permissionKey === 'canPermanentlyDeleteCustomers'
              ? 'Permanent customer deletion requires Super Admin permission.'
              : 'You do not have permission to perform this customer management action.',
          code: 'FORBIDDEN_CUSTOMER_PERMISSION',
        });
      }
      next();
    } catch (err) {
      console.error('Customer permission check error:', err);
      res.status(500).json({ error: 'Failed to verify permissions.' });
    }
  };
};

let testDbOverrideActive = false;
export function setTestCloudDbOverride(active: boolean) {
  testDbOverrideActive = active;
}

export const requireCloudDatabase = async (_req: Request, res: Response, next: NextFunction) => {
  if (testDbOverrideActive) {
    return next();
  }
  if (process.env.REQUIRE_CLOUD_DATABASE === 'true') {
    if (!isCloudDatabaseConfigured()) {
      return res.status(503).json({
        error:
          'Supabase PostgreSQL database is not configured. Please connect DATABASE_URL (or SQL_HOST/SQL_DATABASE) so business records are stored in the cloud.',
        code: 'CLOUD_DATABASE_UNAVAILABLE',
      });
    }
    if (!isCloudDbReady()) {
      const ok = await verifyCloudDatabaseConnection().catch(() => false);
      if (!ok) {
        return res.status(503).json({
          error:
            getLastDbError() ||
            'Unable to reach Supabase PostgreSQL database. Operation aborted to prevent local-only data loss.',
          code: 'CLOUD_DATABASE_UNAVAILABLE',
        });
      }
    }
  } else if (isCloudDatabaseConfigured() && !isCloudDbReady()) {
    await verifyCloudDatabaseConnection().catch(() => false);
  }
  next();
};


