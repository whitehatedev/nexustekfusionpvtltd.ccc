import { Router } from 'express';
import {
  ADMIN_ROLES_SET,
  AuthActionError,
  claimFirstRunAdminSetup,
  createAdminSession,
  deleteAdminSession,
  ensureInitialAdminUser,
  getAdminSetupStatus,
  getStaffCustomerPermissions,
  isAuthorizedAdminEmail,
  listActiveCustomerProfilesForAuth,
  resolveAdminByVerifiedAuth,
  resolveOrProvisionCustomerFromOtp,
  updateUserPassword,
  verifyAdminCredentials,
} from '../../db/users.ts';
import {
  ADMIN_SESSION_COOKIE,
  AuthRequest,
  optionalAuth,
  requireAdmin,
  requireAuth,
  requireCloudDatabase,
  USER_SESSION_COOKIE,
} from '../../middleware/auth.ts';
import { logAudit, parseCookies, verifyPassword } from '../utils.ts';
import { db, isCloudDatabaseConfigured, verifyCloudDatabaseConnection } from '../../db/index.ts';
import { customerActivityLogs, users } from '../../db/schema.ts';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { getSupabasePublicConfig, verifySupabaseAccessToken } from '../../lib/supabase-admin.ts';
import { getDashboardRouteForRole } from '../../lib/rbac.ts';
import { syncActivityLogToSupabase } from '../supabase-ecommerce.ts';
import { notifyAdmins } from '../project-lifecycle.ts';
import { emitAdminStreamEvent } from '../admin-realtime.ts';

const DEFAULT_NOTIFICATION_PREFS = {
  emailUpdates: true,
  orderAlerts: true,
  quotationAlerts: true,
  promotionalEmails: false,
  whatsappAlerts: true,
};

function isHttpsRequest(req: { secure?: boolean; headers: Record<string, any> }): boolean {
  const proto = String(req.headers['x-forwarded-proto'] || '').toLowerCase();
  return Boolean(req.secure || proto === 'https' || (process.env.APP_URL || '').startsWith('https://'));
}

function buildCookieOptions(req: { secure?: boolean; headers: Record<string, any> }, expires?: Date) {
  const isHttps = isHttpsRequest(req);
  return {
    httpOnly: true,
    sameSite: (isHttps ? 'none' : 'lax') as 'none' | 'lax',
    secure: isHttps,
    path: '/',
    ...(isHttps ? { partitioned: true } : {}),
    ...(expires ? { expires } : {}),
  } as any;
}

async function revokeAndClearCookies(
  req: { secure?: boolean; headers: Record<string, any> },
  res: any,
  which: Array<'user' | 'admin'> = ['user', 'admin']
) {
  const cookies = parseCookies(req.headers.cookie);
  const clearOpts = buildCookieOptions(req);
  if (which.includes('user')) {
    if (cookies[USER_SESSION_COOKIE]) {
      await deleteAdminSession(cookies[USER_SESSION_COOKIE]).catch(() => {});
    }
    res.clearCookie(USER_SESSION_COOKIE, clearOpts);
  }
  if (which.includes('admin')) {
    if (cookies[ADMIN_SESSION_COOKIE]) {
      await deleteAdminSession(cookies[ADMIN_SESSION_COOKIE]).catch(() => {});
    }
    res.clearCookie(ADMIN_SESSION_COOKIE, clearOpts);
  }
}

function serializeSafeUser(
  u: {
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
    createdAt?: Date | string;
    lastLoginAt?: Date | string | null;
    role: string;
    emailVerified?: boolean;
    phoneVerified?: boolean;
    isActive?: boolean;
    notificationPreferences?: any;
  },
  activeCustomerId?: string
) {
  const isStaff = ADMIN_ROLES_SET.has(u.role);
  const effectiveCustomerId = isStaff
    ? ''
    : activeCustomerId || u.customerId || (u.uid?.startsWith('NTF-CUST-') ? u.uid : '');
  const registrationDate = u.registrationDate
    ? String(u.registrationDate)
    : u.createdAt
    ? new Date(u.createdAt).toISOString()
    : undefined;
  const lastLoginAt = u.lastLoginAt ? new Date(u.lastLoginAt).toISOString() : null;
  return {
    id: u.id,
    uid: u.uid,
    ...(effectiveCustomerId ? { customerId: effectiveCustomerId } : {}),
    email: u.email,
    fullName: u.fullName,
    mobile: u.mobile,
    companyOrCollege: u.companyOrCollege,
    fullAddress: u.fullAddress || '',
    city: u.city || '',
    state: u.state || '',
    pinCode: u.pinCode || '',
    profilePhotoUrl: u.profilePhotoUrl || '',
    customerType: u.customerType || 'Individual',
    billingDetails: u.billingDetails && typeof u.billingDetails === 'object' ? u.billingDetails : {},
    accountStatus: u.accountStatus || 'Active',
    ...(registrationDate ? { registrationDate } : {}),
    lastLoginAt,
    role: u.role,
    emailVerified: u.emailVerified,
    phoneVerified: u.phoneVerified,
    isActive: u.isActive,
    notificationPreferences: {
      ...DEFAULT_NOTIFICATION_PREFS,
      ...(u.notificationPreferences && typeof u.notificationPreferences === 'object'
        ? u.notificationPreferences
        : {}),
    },
  };
}

function extractBearerToken(req: { headers: Record<string, any> }): string {
  const authHeader = String(req.headers.authorization || '');
  if (!authHeader.startsWith('Bearer ')) return '';
  const token = authHeader.slice('Bearer '.length).trim();
  if (!token || token === 'null' || token === 'undefined') return '';
  return token;
}

export const authRouter = Router();

authRouter.get('/session', optionalAuth, async (req: AuthRequest, res) => {
  if (!req.dbUser) {
    const cookies = parseCookies(req.headers.cookie);
    if (cookies[USER_SESSION_COOKIE] || cookies[ADMIN_SESSION_COOKIE]) {
      const clearOpts = buildCookieOptions(req);
      res.clearCookie(USER_SESSION_COOKIE, clearOpts);
      res.clearCookie(ADMIN_SESSION_COOKIE, clearOpts);
    }
    return res.json({
      authenticated: false,
      user: null,
      availableProfiles: [],
      sessionScope: null,
      redirectTo: null,
    });
  }

  let availableProfiles: any[] = [];
  let customerPermissions = null;

  if (ADMIN_ROLES_SET.has(req.dbUser.role)) {
    customerPermissions = await getStaffCustomerPermissions({
      id: req.dbUser.id,
      role: req.dbUser.role,
    }).catch(() => null);
  } else {
    const listRes = await listActiveCustomerProfilesForAuth({
      authUserId: req.dbUser.authUserId || '',
      email: req.dbUser.email,
    }).catch(() => null);
    availableProfiles = listRes?.activeProfiles || [];
  }

  const sessionScope =
    req.sessionScope || (ADMIN_ROLES_SET.has(req.dbUser.role) ? 'admin' : 'customer');

  return res.json({
    authenticated: true,
    sessionScope,
    redirectTo: getDashboardRouteForRole(req.dbUser.role),
    user: serializeSafeUser(req.dbUser, req.activeCustomerId),
    availableProfiles,
    customerPermissions,
  });
});

authRouter.get('/oauth-status', async (req, res) => {
  const pub = getSupabasePublicConfig();
  const envAppUrl = (process.env.APP_URL || '').trim().replace(/\/+$/, '');
  const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0].trim();
  const origin = envAppUrl || `${proto}://${req.get('host') || 'localhost:3000'}`;
  const redirectTo = `${origin}/auth/callback`;

  let googleProviderReady: boolean | null = null;
  let googleProviderError: string | null = null;

  if (pub.configured && req.query.probe === 'google') {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);
      const probeRes = await fetch(
        `${pub.url}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(redirectTo)}`,
        { redirect: 'manual', signal: controller.signal }
      );
      clearTimeout(timer);

      if (probeRes.status >= 300 && probeRes.status < 400) {
        googleProviderReady = true;
      } else {
        googleProviderReady = false;
        const body = (await probeRes.json().catch(() => ({}))) as { msg?: string; error_code?: string };
        googleProviderError = body?.msg || `HTTP ${probeRes.status}`;
      }
    } catch {
      googleProviderReady = null;
    }
  }

  res.json({
    supabaseConfigured: pub.configured,
    supabaseUrlOrigin: pub.url || null,
    supabaseCallbackUrl: pub.url ? `${pub.url}/auth/v1/callback` : null,
    googleProviderReady,
    googleProviderError,
    recommendedRedirectUrls: Array.from(
      new Set([
        redirectTo,
        `${origin}/auth/callback`,
      ])
    ),
  });
});

// Staff / Admin OAuth sync only (customer Google OAuth removed)
authRouter.post('/sync-profile', requireCloudDatabase, optionalAuth, async (req: AuthRequest, res) => {
  try {
    const token = extractBearerToken(req);
    let userRow: any =
      req.dbUser && req.sessionScope === 'admin' && ADMIN_ROLES_SET.has(req.dbUser.role)
        ? req.dbUser
        : null;
    if (!userRow) {
      if (!token) {
        return res.status(401).json({ error: 'Authentication required. Please sign in.' });
      }
      const verified = await verifySupabaseAccessToken(token);
      if (!verified || !verified.email) {
        return res.status(401).json({ error: 'Invalid or expired OAuth session token.' });
      }
      userRow = await resolveAdminByVerifiedAuth({
        authUserId: verified.uid,
        email: verified.email,
        fullName: verified.fullName,
        phone: verified.phone,
        emailConfirmedAt: verified.emailConfirmedAt,
        phoneConfirmedAt: verified.phoneConfirmedAt,
      });
    }

    if (!ADMIN_ROLES_SET.has(userRow.role)) {
      return res.status(403).json({
        error: 'Google Sign-In is disabled for customer accounts. Please sign in using Email OTP.',
      });
    }
    if (userRow.isActive === false) {
      return res.status(403).json({ error: 'This staff account has been deactivated.' });
    }

    // Revoke any prior customer/admin cookies so admin session is strictly isolated
    await revokeAndClearCookies(req, res, ['user', 'admin']);

    const ua = String(req.headers['user-agent'] || '');
    const session = await createAdminSession(userRow.id, ua, '', 'admin');
    res.cookie(ADMIN_SESSION_COOKIE, session.cookieValue, buildCookieOptions(req, session.expiresAt));
    const customerPermissions = await getStaffCustomerPermissions({
      id: userRow.id,
      role: userRow.role,
    }).catch(() => null);
    res.json({
      sessionToken: session.cookieValue,
      sessionScope: 'admin',
      redirectTo: getDashboardRouteForRole(userRow.role),
      user: serializeSafeUser(userRow),
      customerPermissions,
    });
  } catch (error: any) {
    const status = error instanceof AuthActionError ? error.statusCode : 500;
    if (status >= 500) {
      console.error('OAuth profile sync error:', error);
    }
    res.status(status).json({ error: error?.message || 'Failed to synchronize OAuth profile.' });
  }
});

// Admin Email OTP Pre-Authorization Check (rejects non-admin emails before sending OTP)
authRouter.post('/admin-otp/request', requireCloudDatabase, async (req, res) => {
  try {
    await ensureInitialAdminUser();
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Please enter a valid administrator email address.' });
    }
    const authorized = await isAuthorizedAdminEmail(email);
    if (!authorized) {
      await logAudit({
        actorUid: 'anonymous',
        actorEmail: email,
        action: 'ADMIN_OTP_UNAUTHORIZED_EMAIL',
        entityType: 'admin_auth',
        details: { reason: 'Non-admin email attempted Admin OTP request' },
      });
      return res.status(403).json({ error: 'This email is not authorized for administrator access.' });
    }
    res.json({ authorized: true });
  } catch (error) {
    console.error('Admin OTP precheck error:', error);
    res.status(500).json({ error: 'Unable to verify administrator email.' });
  }
});

// Admin Email + 6-Digit OTP Session Exchange (STRICTLY Admin/Staff-only)
authRouter.post('/admin-otp/session', requireCloudDatabase, async (req, res) => {
  try {
    await ensureInitialAdminUser();
    const token = extractBearerToken(req);
    if (!token) {
      return res.status(401).json({ error: 'Verified Supabase OTP access token is required.' });
    }
    const verified = await verifySupabaseAccessToken(token);
    if (!verified || !verified.email) {
      return res.status(401).json({ error: 'Invalid or expired OTP session token. Please request a new code.' });
    }

    const adminUser = await resolveAdminByVerifiedAuth({
      authUserId: verified.uid,
      email: verified.email,
      fullName: verified.fullName,
      phone: verified.phone,
      emailConfirmedAt: verified.emailConfirmedAt,
      phoneConfirmedAt: verified.phoneConfirmedAt,
    });

    await revokeAndClearCookies(req, res, ['user', 'admin']);
    const ua = String(req.headers['user-agent'] || '');
    const session = await createAdminSession(adminUser.id, ua, '', 'admin');
    res.cookie(ADMIN_SESSION_COOKIE, session.cookieValue, buildCookieOptions(req, session.expiresAt));

    const customerPermissions = await getStaffCustomerPermissions({
      id: adminUser.id,
      role: adminUser.role,
    }).catch(() => null);

    await logAudit({
      actorUid: adminUser.uid,
      actorEmail: adminUser.email,
      action: 'ADMIN_OTP_LOGIN_SUCCESS',
      entityType: 'admin_auth',
      entityId: adminUser.id,
      details: { role: adminUser.role },
    });

    res.json({
      sessionToken: session.cookieValue,
      sessionScope: 'admin',
      redirectTo: getDashboardRouteForRole(adminUser.role),
      user: serializeSafeUser(adminUser),
      customerPermissions,
    });
  } catch (error: any) {
    const status = error instanceof AuthActionError ? error.statusCode : 500;
    if (status >= 500) {
      console.error('Admin OTP login error:', error);
    }
    res.status(status).json({ error: error?.message || 'Unable to verify administrator OTP session.' });
  }
});

// Customer Email OTP Session Exchange (Automatic UPSERT Provisioning — STRICTLY Customer-only)
authRouter.post('/otp/session', requireCloudDatabase, async (req, res) => {
  try {
    await ensureInitialAdminUser();
    const token = extractBearerToken(req);
    if (!token) {
      return res.status(401).json({ error: 'Verified Supabase OTP access token is required.' });
    }
    const verified = await verifySupabaseAccessToken(token);
    if (!verified || !verified.email) {
      return res.status(401).json({ error: 'Invalid or expired OTP session token. Please request a new code.' });
    }

    const resolution = await resolveOrProvisionCustomerFromOtp({
      authUserId: verified.uid,
      email: verified.email,
      emailConfirmedAt: verified.emailConfirmedAt,
      fullName: verified.fullName,
      phone: verified.phone,
      customerOnly: true,
    });

    if (resolution.kind === 'staff' || ADMIN_ROLES_SET.has(resolution.user.role)) {
      return res.status(403).json({
        error: 'This email is not eligible for customer sign-in. Please use a customer email address.',
      });
    }

    // Revoke and clear any previous admin or customer cookie so customer session cannot inherit admin access
    await revokeAndClearCookies(req, res, ['admin', 'user']);

    const ua = String(req.headers['user-agent'] || '');
    const session = await createAdminSession(
      resolution.user.id,
      ua,
      resolution.activeProfile.customerId,
      'customer'
    );
    res.cookie(USER_SESSION_COOKIE, session.cookieValue, buildCookieOptions(req, session.expiresAt));

    const auditAction = resolution.isNewCustomer ? 'CUSTOMER_OTP_AUTO_REGISTERED' : 'CUSTOMER_OTP_LOGIN';
    await logAudit({
      actorUid: resolution.activeProfile.customerId,
      actorEmail: resolution.user.email,
      action: auditAction,
      entityType: 'customer',
      entityId: String(resolution.activeProfile.id),
      details: {
        customerId: resolution.activeProfile.customerId,
        role: resolution.user.role,
        isNewCustomer: resolution.isNewCustomer,
      },
    });

    await db
      .insert(customerActivityLogs)
      .values({
        userId: resolution.user.id,
        customerId: resolution.activeProfile.customerId,
        email: resolution.user.email,
        category: resolution.isNewCustomer ? 'account' : 'security',
        action: resolution.isNewCustomer ? 'CUSTOMER_ACCOUNT_CREATED' : 'CUSTOMER_OTP_LOGIN',
        entityType: 'auth',
        entityId: resolution.activeProfile.customerId,
        description: resolution.isNewCustomer
          ? 'Customer account and permanent Customer ID automatically created via Email OTP.'
          : 'Signed in via verified Email OTP.',
        metadata: { method: 'email_otp', isNewCustomer: resolution.isNewCustomer },
      })
      .catch(() => {});
    syncActivityLogToSupabase({
      userUid: resolution.user.uid,
      customerId: resolution.activeProfile.customerId,
      action: resolution.isNewCustomer ? 'CUSTOMER_ACCOUNT_CREATED' : 'CUSTOMER_OTP_LOGIN',
      entityType: 'auth',
      entityId: resolution.activeProfile.customerId,
      details: { method: 'email_otp', isNewCustomer: resolution.isNewCustomer },
    }).catch(() => {});

    if (resolution.isNewCustomer) {
      notifyAdmins({
        type: 'customer',
        entityType: 'customer',
        entityId: resolution.activeProfile.customerId,
        customerId: resolution.activeProfile.customerId,
        title: `New Customer Registered — ${resolution.activeProfile.customerId}`,
        message: `${resolution.user.fullName || resolution.user.email} (${resolution.user.email}) registered via Email OTP.`,
        link: '/admin/customers',
      }).catch(() => {});
    } else {
      emitAdminStreamEvent({
        type: 'customer',
        action: 'login',
        id: resolution.activeProfile.customerId,
        customerId: resolution.activeProfile.customerId,
        summary: `${resolution.user.email} signed in`,
      });
    }

    return res.json({
      status: 'authenticated',
      isNewCustomer: resolution.isNewCustomer,
      sessionToken: session.cookieValue,
      sessionScope: 'customer',
      redirectTo: getDashboardRouteForRole(resolution.user.role),
      user: serializeSafeUser(resolution.user, resolution.activeProfile.customerId),
      activeProfile: resolution.activeProfile,
      availableProfiles: resolution.profiles,
    });
  } catch (error: any) {
    const status = error instanceof AuthActionError ? error.statusCode : 500;
    if (status >= 500) {
      console.error('OTP session resolution error:', error);
    }
    return res.status(status).json({ error: error?.message || 'Unable to verify OTP session.' });
  }
});

// Legacy Customer ID login, profile switching, and manual registration endpoints removed — Email + OTP only
authRouter.post('/select-profile', (_req, res) => {
  res.status(410).json({
    error: 'Customer profile switching has been retired. Each verified email has a single permanent Customer Account.',
    code: 'EMAIL_OTP_ONLY',
  });
});

authRouter.post('/complete-registration', (_req, res) => {
  res.status(410).json({
    error: 'Manual registration form is retired. Customer accounts are created automatically upon Email OTP verification.',
    code: 'EMAIL_OTP_ONLY',
  });
});

authRouter.post('/customer-id-lookup', (_req, res) => {
  res.status(410).json({
    error: 'Customer ID login has been removed. Please sign in using your email address and 6-digit OTP.',
    code: 'CUSTOMER_ID_LOGIN_REMOVED',
  });
});

authRouter.post('/customer-id-login', (_req, res) => {
  res.status(410).json({
    error: 'Customer ID and password login have been removed. Please sign in using your email address and 6-digit OTP.',
    code: 'CUSTOMER_ID_LOGIN_REMOVED',
  });
});

// Customer password login & registration removed — Email OTP only
authRouter.post('/register', (_req, res) => {
  res.status(410).json({
    error: 'Password registration has been removed. Please verify your email using Email OTP to register.',
    code: 'EMAIL_OTP_REQUIRED',
  });
});

authRouter.post('/login', (_req, res) => {
  res.status(410).json({
    error: 'Password login has been removed for customers. Please sign in with your Email OTP.',
    code: 'EMAIL_OTP_REQUIRED',
  });
});

authRouter.post('/logout', async (req, res) => {
  try {
    await revokeAndClearCookies(req, res, ['user', 'admin']);
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      await deleteAdminSession(authHeader.split('Bearer ')[1]).catch(() => {});
    }
  } catch {
    // ignore
  }
  res.json({ ok: true });
});

authRouter.get('/admin-setup-status', async (_req, res) => {
  try {
    const dbReady = isCloudDatabaseConfigured() && (await verifyCloudDatabaseConnection().catch(() => false));
    if (!dbReady && process.env.REQUIRE_CLOUD_DATABASE === 'true') {
      return res.json({
        configured: true,
        hasPasswordAdmin: false,
        envConfigured: Boolean(process.env.INITIAL_ADMIN_EMAIL && process.env.INITIAL_ADMIN_PASSWORD),
        allowFirstRunSetup: false,
        cloudDatabaseRequired: true,
      });
    }
    await ensureInitialAdminUser();
    const status = await getAdminSetupStatus();
    res.json({ ...status, cloudDatabaseRequired: false });
  } catch {
    res.status(500).json({ error: 'Failed to inspect admin setup status.' });
  }
});

authRouter.post('/admin-setup', requireCloudDatabase, async (req, res) => {
  try {
    await ensureInitialAdminUser();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const fullName = String(req.body.fullName || '').trim();

    const adminUser = await claimFirstRunAdminSetup({ email, password, fullName });

    await revokeAndClearCookies(req, res, ['user', 'admin']);
    const ua = String(req.headers['user-agent'] || '');
    const session = await createAdminSession(adminUser.id, ua, '', 'admin');
    res.cookie(ADMIN_SESSION_COOKIE, session.cookieValue, buildCookieOptions(req, session.expiresAt));

    const customerPermissions = await getStaffCustomerPermissions({
      id: adminUser.id,
      role: adminUser.role,
    }).catch(() => null);

    await logAudit({
      actorUid: adminUser.uid,
      actorEmail: adminUser.email,
      action: 'FIRST_RUN_ADMIN_CLAIMED',
      entityType: 'admin_auth',
      entityId: adminUser.id,
      details: { role: adminUser.role },
    });

    res.status(201).json({
      sessionToken: session.cookieValue,
      sessionScope: 'admin',
      redirectTo: getDashboardRouteForRole(adminUser.role),
      user: serializeSafeUser(adminUser),
      customerPermissions,
    });
  } catch (error: any) {
    const status = error instanceof AuthActionError ? error.statusCode : 500;
    if (status >= 500) {
      console.error('Admin first-run setup error:', error);
    }
    res.status(status).json({ error: error?.message || 'Failed to complete initial administrator setup.' });
  }
});

authRouter.post('/admin-login', requireCloudDatabase, async (req, res) => {
  try {
    await ensureInitialAdminUser();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const user = await verifyAdminCredentials(email, password);
    if (!user || !ADMIN_ROLES_SET.has(user.role)) {
      await logAudit({
        actorUid: 'anonymous',
        actorEmail: email,
        action: 'ADMIN_LOGIN_FAILED',
        entityType: 'admin_auth',
        details: { reason: 'Invalid credentials or unauthorized role' },
      });
      return res.status(401).json({ error: 'Invalid admin email or password.' });
    }

    // Revoke and clear any prior customer or admin session cookies
    await revokeAndClearCookies(req, res, ['user', 'admin']);
    const bearer = extractBearerToken(req);
    if (bearer) {
      await deleteAdminSession(bearer).catch(() => {});
    }

    const ua = String(req.headers['user-agent'] || '');
    const session = await createAdminSession(user.id, ua, '', 'admin');

    res.cookie(ADMIN_SESSION_COOKIE, session.cookieValue, buildCookieOptions(req, session.expiresAt));

    await logAudit({
      actorUid: user.uid,
      actorEmail: user.email,
      action: 'ADMIN_LOGIN_SUCCESS',
      entityType: 'admin_auth',
      entityId: user.id,
      details: { role: user.role },
    });

    res.json({
      sessionToken: session.cookieValue,
      sessionScope: 'admin',
      redirectTo: getDashboardRouteForRole(user.role),
      user: serializeSafeUser(user),
    });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({ error: 'Unable to sign in right now.' });
  }
});

authRouter.post('/admin-logout', async (req, res) => {
  try {
    await revokeAndClearCookies(req, res, ['admin', 'user']);
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      await deleteAdminSession(authHeader.split('Bearer ')[1]).catch(() => {});
    }
  } catch {
    // ignore
  }
  res.json({ ok: true });
});

authRouter.post('/admin-change-password', requireCloudDatabase, requireAuth, requireAdmin(), async (req: AuthRequest, res) => {
  try {
    const currentPassword = String(req.body.currentPassword || '');
    const newPassword = String(req.body.newPassword || '');
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters long.' });
    }

    const [userRow] = await db.select().from(users).where(eq(users.id, req.dbUser!.id)).limit(1);
    if (!userRow) return res.status(404).json({ error: 'User not found.' });

    if (userRow.passwordHash) {
      if (!verifyPassword(currentPassword, userRow.passwordHash)) {
        return res.status(400).json({ error: 'Current password is incorrect.' });
      }
    } else {
      if (!currentPassword) {
        return res.status(400).json({ error: 'Current password is required.' });
      }
      const { createAnonServerSupabaseClient } = await import('../../lib/supabase-admin.ts');
      const anonClient = createAnonServerSupabaseClient();
      if (anonClient) {
        const { error: checkErr } = await anonClient.auth.signInWithPassword({
          email: userRow.email,
          password: currentPassword,
        });
        if (checkErr) {
          return res.status(400).json({ error: 'Current password is incorrect.' });
        }
      }
    }

    await updateUserPassword(userRow.id, newPassword);
    await logAudit({
      actorUid: userRow.uid,
      actorEmail: userRow.email,
      action: 'ADMIN_PASSWORD_CHANGED',
      entityType: 'user',
      entityId: userRow.id,
    });

    res.json({ ok: true });
  } catch (error) {
    console.error('Password update error:', error);
    res.status(500).json({ error: 'Failed to update password.' });
  }
});

// Admin Forgot / Reset Password (Email-dispatched short-lived token)
const passwordResetTokens = new Map<string, { userId: number; email: string; expiresAt: number }>();

authRouter.post('/admin-forgot-password', requireCloudDatabase, async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ error: 'Admin email is required.' });

    const [userRow] = await db
      .select()
      .from(users)
      .where(
        and(
          sql`lower(${users.email}) = ${email}`,
          isNull(users.deletedAt),
          inArray(users.role, Array.from(ADMIN_ROLES_SET))
        )
      )
      .limit(1);
    if (!userRow || !ADMIN_ROLES_SET.has(userRow.role) || !userRow.isActive) {
      // Return neutral confirmation to avoid account enumeration
      return res.json({ ok: true, message: 'If an active administrator account matches this email, recovery instructions have been dispatched.' });
    }

    const crypto = await import('crypto');
    const token = crypto.randomBytes(24).toString('hex');
    passwordResetTokens.set(token, {
      userId: userRow.id,
      email: userRow.email,
      expiresAt: Date.now() + 30 * 60 * 1000,
    });

    const { dispatchLifecycleEmail } = await import('../email.ts');
    const delivery = await dispatchLifecycleEmail({
      userId: userRow.id,
      recipientEmail: userRow.email,
      eventType: 'admin_password_reset',
      vars: {
        customerName: userRow.fullName || userRow.email,
        summary: `Use reset token ${token} (valid for 30 minutes) on the Admin Login Reset form.`,
      },
    });

    await logAudit({
      actorUid: userRow.uid,
      actorEmail: userRow.email,
      action: 'ADMIN_PASSWORD_RESET_REQUESTED',
      entityType: 'user',
      entityId: userRow.id,
      details: { deliveryStatus: delivery.deliveryStatus },
    });

    res.json({
      ok: true,
      deliveryStatus: delivery.deliveryStatus,
      message:
        delivery.deliveryStatus === 'sent'
          ? 'Recovery instructions sent to your administrator email.'
          : 'Contact Customer Care (info@nexustekfusion.in) or your Super Admin for password recovery.',
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Failed to process password reset request.' });
  }
});

authRouter.post('/admin-reset-password', requireCloudDatabase, async (req, res) => {
  try {
    const token = String(req.body.token || '').trim();
    const newPassword = String(req.body.newPassword || '');
    if (!token || newPassword.length < 8) {
      return res.status(400).json({ error: 'Valid reset token and new password (min 8 chars) are required.' });
    }

    const entry = passwordResetTokens.get(token);
    if (!entry || entry.expiresAt < Date.now()) {
      passwordResetTokens.delete(token);
      return res.status(400).json({ error: 'Reset token is invalid or expired.' });
    }

    await updateUserPassword(entry.userId, newPassword);
    passwordResetTokens.delete(token);

    await logAudit({
      actorUid: String(entry.userId),
      actorEmail: entry.email,
      action: 'ADMIN_PASSWORD_RESET_COMPLETED',
      entityType: 'user',
      entityId: entry.userId,
    });

    res.json({ ok: true });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Failed to reset password.' });
  }
});

