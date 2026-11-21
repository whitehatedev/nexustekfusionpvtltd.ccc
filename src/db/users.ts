import crypto from 'crypto';
import { and, eq, gt, inArray, isNull, or, sql } from 'drizzle-orm';
import { createPool, db } from './index.ts';
import {
  adminSessions,
  customers,
  staffPermissions,
  users,
} from './schema.ts';
import { ensureCustomerManagementSchema } from './ensure-customer-mgmt.ts';
import { hashPassword, verifyPassword } from '../server/utils.ts';
import {
  createAnonServerSupabaseClient,
  getServiceRoleSupabaseClient,
} from '../lib/supabase-admin.ts';
import {
  createPublicCustomerRecord,
  findPublicCustomerByKey,
  findPublicCustomerForUser,
  generateNextCustomerCodeFromDb,
  isPublicCustomersSchemaReady,
  listAllPublicCustomersForAuth,
  PublicCustomerRecord,
  recordCustomerIdHistory,
  syncLocalWebUserFromPublicCustomer,
  updatePublicCustomerRecord,
} from '../server/supabase-customers.ts';

const DEFAULT_ADMIN_EMAILS = ['info.nexustekfusion@gmail.com', 'info@nexustekfusion.in'];

export const ADMIN_ROLES_SET = new Set([
  'super_admin',
  'admin',
  'website_manager',
  'product_manager',
  'sales_manager',
  'project_manager',
  'engineer',
  'printing_operator',
  'inventory_manager',
  'accounts_manager',
  'support_manager',
  'support_staff',
]);

export class AuthActionError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = 'AuthActionError';
    this.statusCode = statusCode;
  }
}

export function isUuid(value?: string | null): boolean {
  return Boolean(
    value && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim())
  );
}

export function normalizeEmail(email?: string | null): string {
  return String(email || '').trim().toLowerCase();
}

export function normalizeMobile(mobile?: string | null): string {
  let cleaned = String(mobile || '').trim().replace(/[\s()-]+/g, '');
  if (/^\+91[6-9]\d{9}$/.test(cleaned)) {
    cleaned = cleaned.slice(3);
  } else if (/^91[6-9]\d{9}$/.test(cleaned)) {
    cleaned = cleaned.slice(2);
  }
  return cleaned;
}

const FALLBACK_SESSION_SECRET = crypto
  .createHash('sha256')
  .update(
    `ntf-session-v1-${
      process.env.DATABASE_URL ||
      process.env.SUPABASE_URL ||
      process.env.SQL_HOST ||
      'nexustekfusion-local'
    }`
  )
  .digest('hex');

function getSessionSecret(): string {
  return (
    process.env.ADMIN_SESSION_SECRET ||
    process.env.SESSION_SECRET ||
    FALLBACK_SESSION_SECRET
  );
}

function signSessionToken(rawToken: string): string {
  const sig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(rawToken)
    .digest('hex');
  return `${rawToken}.${sig}`;
}

function verifySignedSessionToken(signed: string): string | null {
  const parts = signed.split('.');
  if (parts.length !== 2) return null;
  const [rawToken, providedSig] = parts;
  if (!rawToken || !providedSig) return null;
  const expectedSig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(rawToken)
    .digest('hex');
  try {
    const a = Buffer.from(providedSig, 'hex');
    const b = Buffer.from(expectedSig, 'hex');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    return rawToken;
  } catch {
    return null;
  }
}

export function isBootstrapAdminEmail(email: string): boolean {
  const configured = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const envInitial = (process.env.INITIAL_ADMIN_EMAIL || '').trim().toLowerCase();
  if (envInitial) configured.push(envInitial);
  const allAdmins = new Set([...DEFAULT_ADMIN_EMAILS, ...configured]);
  return allAdmins.has(email.trim().toLowerCase());
}

export async function isAuthorizedAdminEmail(email: string): Promise<boolean> {
  const cleanEmail = normalizeEmail(email);
  if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) return false;
  const [staffRow] = await db
    .select({ id: users.id, isActive: users.isActive, accountStatus: users.accountStatus })
    .from(users)
    .where(
      and(
        sql`lower(${users.email}) = ${cleanEmail}`,
        isNull(users.deletedAt),
        inArray(users.role, Array.from(ADMIN_ROLES_SET))
      )
    )
    .limit(1);

  if (staffRow) {
    return Boolean(staffRow.isActive && staffRow.accountStatus === 'Active');
  }
  return isBootstrapAdminEmail(cleanEmail);
}

export async function ensureInitialAdminUser(): Promise<void> {
  const email = (process.env.INITIAL_ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.INITIAL_ADMIN_PASSWORD || '';
  const name = (process.env.INITIAL_ADMIN_NAME || 'Super Admin').trim();

  if (!email || !password) return;

  try {
    const existing = await db
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

    if (existing.length > 0) {
      const current = existing[0];
      if (!current.passwordHash && !current.authUserId) {
        const serviceClient = getServiceRoleSupabaseClient();
        if (serviceClient) {
          const { data: created } = await serviceClient.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: { full_name: current.fullName || name },
          });
          if (created?.user?.id) {
            await db
              .update(users)
              .set({
                authUserId: created.user.id,
                fullName: current.fullName || name,
                isActive: true,
                accountStatus: 'Active',
                emailVerified: true,
                emailConfirmedAt: created.user.email_confirmed_at || new Date().toISOString(),
                updatedAt: new Date(),
              })
              .where(eq(users.id, current.id));
            return;
          }
        }
        await db
          .update(users)
          .set({
            fullName: current.fullName || name,
            passwordHash: hashPassword(password),
            isActive: true,
            updatedAt: new Date(),
          })
          .where(eq(users.id, current.id));
      }
      return;
    }

    const serviceClient = getServiceRoleSupabaseClient();
    if (serviceClient) {
      const { data: created } = await serviceClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: name },
      });
      if (created?.user?.id) {
        await db
          .insert(users)
          .values({
            uid: created.user.id,
            authUserId: created.user.id,
            email,
            fullName: name,
            role: 'super_admin',
            passwordHash: null,
            emailVerified: true,
            emailConfirmedAt: created.user.email_confirmed_at || new Date().toISOString(),
            accountStatus: 'Active',
            isActive: true,
          })
          .onConflictDoUpdate({
            target: users.uid,
            set: {
              authUserId: created.user.id,
              role: 'super_admin',
              fullName: name,
              accountStatus: 'Active',
              isActive: true,
              updatedAt: new Date(),
            },
          });
        return;
      }
    }

    await db.insert(users).values({
      uid: `admin_${crypto.randomBytes(6).toString('hex')}`,
      email,
      fullName: name,
      role: 'super_admin',
      passwordHash: hashPassword(password),
      isActive: true,
    });
  } catch (error) {
    console.error('Failed to ensure initial admin user:', error);
  }
}

export async function getAdminSetupStatus() {
  const activeAdmins = await db
    .select({
      id: users.id,
      passwordHash: users.passwordHash,
      passwordConfigured: users.passwordConfigured,
    })
    .from(users)
    .where(
      and(
        eq(users.isActive, true),
        isNull(users.deletedAt),
        inArray(users.role, Array.from(ADMIN_ROLES_SET))
      )
    );
  const hasAnyActiveAdmin = activeAdmins.length > 0;
  const hasPasswordAdmin = activeAdmins.some(
    (a) => Boolean((a.passwordHash && a.passwordHash.trim() !== '') || a.passwordConfigured)
  );
  const envConfigured = Boolean(process.env.INITIAL_ADMIN_EMAIL && process.env.INITIAL_ADMIN_PASSWORD);
  const configured = hasAnyActiveAdmin || envConfigured;
  return {
    configured,
    hasPasswordAdmin,
    envConfigured,
    allowFirstRunSetup: !configured,
  };
}

export async function claimFirstRunAdminSetup(opts: {
  email: string;
  password: string;
  fullName?: string;
}) {
  const cleanEmail = normalizeEmail(opts.email);
  const plainPassword = String(opts.password || '');
  const cleanName = String(opts.fullName || '').trim() || 'Super Admin';

  if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    throw new AuthActionError('Please enter a valid administrator email address.', 400);
  }
  if (plainPassword.length < 8) {
    throw new AuthActionError('Administrator password must be at least 8 characters long.', 400);
  }
  if (process.env.INITIAL_ADMIN_EMAIL && process.env.INITIAL_ADMIN_PASSWORD) {
    throw new AuthActionError(
      'Administrator access is already configured via environment secrets. Please sign in below.',
      403
    );
  }
  if ((process.env.ADMIN_EMAILS || '').trim() && !isBootstrapAdminEmail(cleanEmail)) {
    throw new AuthActionError(
      'This email is not authorized for administrator setup.',
      403
    );
  }

  return withCustomerProvisionLock('__admin_first_run_setup__', async () => {
    const status = await getAdminSetupStatus();
    if (status.configured) {
      throw new AuthActionError(
        'First-run administrator setup is already completed and locked. Sign in with your admin password or use Forgot Password.',
        403
      );
    }

    const now = new Date();
    const hashed = hashPassword(plainPassword);
    let authId: string | null = null;

    const serviceClient = getServiceRoleSupabaseClient();
    if (serviceClient) {
      try {
        const { data: created } = await serviceClient.auth.admin.createUser({
          email: cleanEmail,
          password: plainPassword,
          email_confirm: true,
          user_metadata: { full_name: cleanName },
        });
        if (created?.user?.id) {
          authId = created.user.id;
        }
      } catch {
        // Proceed cleanly with server-side scrypt hash
      }
    }

    const [existingStaff] = await db
      .select()
      .from(users)
      .where(
        and(
          sql`lower(${users.email}) = ${cleanEmail}`,
          isNull(users.deletedAt),
          inArray(users.role, Array.from(ADMIN_ROLES_SET))
        )
      )
      .limit(1);

    if (existingStaff) {
      const [updated] = await db
        .update(users)
        .set({
          authUserId: authId || existingStaff.authUserId,
          fullName: existingStaff.fullName || cleanName,
          role: 'super_admin',
          passwordHash: hashed,
          passwordConfigured: true,
          emailVerified: true,
          emailConfirmedAt: existingStaff.emailConfirmedAt || now.toISOString(),
          accountStatus: 'Active',
          isActive: true,
          lastLoginAt: now,
          updatedAt: now,
        })
        .where(eq(users.id, existingStaff.id))
        .returning();
      return updated;
    }

    const [inserted] = await db
      .insert(users)
      .values({
        uid: authId || `admin_${crypto.randomBytes(6).toString('hex')}`,
        authUserId: authId,
        email: cleanEmail,
        fullName: cleanName,
        role: 'super_admin',
        passwordHash: hashed,
        passwordConfigured: true,
        emailVerified: true,
        emailConfirmedAt: now.toISOString(),
        accountStatus: 'Active',
        isActive: true,
        lastLoginAt: now,
      })
      .returning();

    return inserted;
  });
}

export async function resolveAdminByVerifiedAuth(opts: {
  authUserId: string;
  email: string;
  fullName?: string;
  phone?: string;
  emailConfirmedAt?: string;
  phoneConfirmedAt?: string;
}) {
  const cleanEmail = normalizeEmail(opts.email);
  if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    throw new AuthActionError('A valid verified email address is required.', 400);
  }

  const validAuthUuid = isUuid(opts.authUserId) ? opts.authUserId : null;
  const conds = [sql`lower(${users.email}) = ${cleanEmail}`];
  if (validAuthUuid) {
    conds.push(eq(users.authUserId, validAuthUuid));
  }
  if (opts.authUserId) {
    conds.push(eq(users.uid, opts.authUserId));
  }

  const [staffRow] = await db
    .select()
    .from(users)
    .where(
      and(
        isNull(users.deletedAt),
        inArray(users.role, Array.from(ADMIN_ROLES_SET)),
        or(...conds)
      )
    )
    .limit(1);

  if (staffRow) {
    if (!staffRow.isActive || staffRow.accountStatus !== 'Active') {
      throw new AuthActionError('This administrator or staff account has been deactivated.', 403);
    }
    const now = new Date();
    const [updated] = await db
      .update(users)
      .set({
        authUserId: validAuthUuid || staffRow.authUserId,
        emailVerified: true,
        emailConfirmedAt: opts.emailConfirmedAt || staffRow.emailConfirmedAt || now.toISOString(),
        lastLoginAt: now,
        updatedAt: now,
      })
      .where(eq(users.id, staffRow.id))
      .returning();
    return updated || staffRow;
  }

  if (isBootstrapAdminEmail(cleanEmail)) {
    const provisioned = await getOrCreateUser(opts.authUserId, cleanEmail, opts.fullName, {
      phone: opts.phone,
      emailConfirmedAt: opts.emailConfirmedAt,
      phoneConfirmedAt: opts.phoneConfirmedAt,
    });
    if (ADMIN_ROLES_SET.has(provisioned.role)) {
      return provisioned;
    }
  }

  throw new AuthActionError(
    'This email is not authorized for administrator access.',
    403
  );
}

async function migrateLegacyUserToSupabaseAuth(
  user: typeof users.$inferSelect,
  plainPassword: string
): Promise<typeof users.$inferSelect> {
  if (!ADMIN_ROLES_SET.has(user.role)) return user;
  if (user.authUserId) return user;
  const serviceClient = getServiceRoleSupabaseClient();
  if (!serviceClient) return user;

  try {
    const cleanEmail = normalizeEmail(user.email);
    const { data, error } = await serviceClient.auth.admin.createUser({
      email: cleanEmail,
      password: plainPassword,
      email_confirm: true,
      user_metadata: {
        full_name: user.fullName || '',
        phone: user.mobile || '',
        company_or_college: user.companyOrCollege || '',
      },
    });

    if (error || !data?.user?.id) {
      return user;
    }

    const authId = data.user.id;
    const [updated] = await db
      .update(users)
      .set({
        authUserId: authId,
        passwordHash: null,
        passwordConfigured: true,
        emailVerified: true,
        emailConfirmedAt: user.emailConfirmedAt || data.user.email_confirmed_at || new Date().toISOString(),
        lastLoginAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id))
      .returning();

    return updated || user;
  } catch {
    return user;
  }
}

export async function verifyAdminCredentials(email: string, password: string) {
  const cleanEmail = normalizeEmail(email);
  if (!cleanEmail || !password) return null;

  // 1. Try Supabase Auth first if the admin exists in Supabase Auth
  const anonClient = createAnonServerSupabaseClient();
  if (anonClient) {
    const { data, error } = await anonClient.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });
    if (!error && data?.user?.id) {
      const [dbRow] = await db
        .select()
        .from(users)
        .where(
          and(
            isNull(users.deletedAt),
            inArray(users.role, Array.from(ADMIN_ROLES_SET)),
            or(
              eq(users.authUserId, data.user.id),
              eq(users.uid, data.user.id),
              sql`lower(${users.email}) = ${cleanEmail}`
            )
          )
        )
        .limit(1);

      if (dbRow) {
        if (dbRow.isActive && dbRow.accountStatus === 'Active' && ADMIN_ROLES_SET.has(dbRow.role)) {
          const [updated] = await db
            .update(users)
            .set({ authUserId: data.user.id, passwordConfigured: true, lastLoginAt: new Date(), updatedAt: new Date() })
            .where(eq(users.id, dbRow.id))
            .returning();
          return updated || dbRow;
        }
        return null;
      }

      if (isBootstrapAdminEmail(cleanEmail)) {
        const meta = data.user.user_metadata || {};
        const created = await getOrCreateUser(data.user.id, cleanEmail, String(meta.full_name || meta.name || ''), {
          phone: data.user.phone || '',
          emailConfirmedAt: data.user.email_confirmed_at || new Date().toISOString(),
        });
        if (ADMIN_ROLES_SET.has(created.role) && created.isActive && created.accountStatus === 'Active') {
          await db
            .update(users)
            .set({ passwordConfigured: true, updatedAt: new Date() })
            .where(eq(users.id, created.id))
            .catch(() => {});
          return created;
        }
      }

      return null;
    }
  }

  // 2. Fallback to server-side scrypt passwordHash for existing/first-run admin accounts
  const rows = await db
    .select()
    .from(users)
    .where(
      and(
        sql`lower(${users.email}) = ${cleanEmail}`,
        isNull(users.deletedAt),
        inArray(users.role, Array.from(ADMIN_ROLES_SET))
      )
    )
    .limit(1);

  const user = rows[0];
  if (!user || !user.isActive || user.accountStatus !== 'Active' || !ADMIN_ROLES_SET.has(user.role)) {
    return null;
  }
  if (!user.passwordHash || !verifyPassword(password, user.passwordHash)) {
    return null;
  }

  return await migrateLegacyUserToSupabaseAuth(user, password);
}

export interface CustomerPermissions {
  canViewCustomers: boolean;
  canAddCustomers: boolean;
  canEditCustomers: boolean;
  canDeactivateCustomers: boolean;
  canReactivateCustomers: boolean;
  canPermanentlyDeleteCustomers: boolean;
  canViewDeletionHistory: boolean;
}

export function getDefaultCustomerPermissions(role: string): CustomerPermissions {
  if (role === 'super_admin') {
    return {
      canViewCustomers: true,
      canAddCustomers: true,
      canEditCustomers: true,
      canDeactivateCustomers: true,
      canReactivateCustomers: true,
      canPermanentlyDeleteCustomers: true,
      canViewDeletionHistory: true,
    };
  }
  if (role === 'admin') {
    return {
      canViewCustomers: true,
      canAddCustomers: true,
      canEditCustomers: true,
      canDeactivateCustomers: true,
      canReactivateCustomers: true,
      canPermanentlyDeleteCustomers: false, // Must be explicitly granted by Super Admin
      canViewDeletionHistory: false,
    };
  }
  if (['sales_manager', 'support_manager', 'support_staff', 'accounts_manager', 'project_manager'].includes(role)) {
    return {
      canViewCustomers: true,
      canAddCustomers: false,
      canEditCustomers: false,
      canDeactivateCustomers: false,
      canReactivateCustomers: false,
      canPermanentlyDeleteCustomers: false,
      canViewDeletionHistory: false,
    };
  }
  return {
    canViewCustomers: false,
    canAddCustomers: false,
    canEditCustomers: false,
    canDeactivateCustomers: false,
    canReactivateCustomers: false,
    canPermanentlyDeleteCustomers: false,
    canViewDeletionHistory: false,
  };
}

export async function getStaffCustomerPermissions(dbUser: {
  id: number;
  role: string;
}): Promise<CustomerPermissions> {
  const defaults = getDefaultCustomerPermissions(dbUser.role);
  if (dbUser.role === 'super_admin') {
    return defaults;
  }
  if (!ADMIN_ROLES_SET.has(dbUser.role)) {
    return getDefaultCustomerPermissions('customer');
  }

  try {
    const [row] = await db
      .select()
      .from(staffPermissions)
      .where(eq(staffPermissions.userId, dbUser.id))
      .limit(1);

    if (!row) return defaults;

    // Security invariant: Employees CANNOT permanently delete customers under any circumstances.
    // Only Admin can permanently delete when explicitly granted by Super Admin.
    const canPermDelete =
      dbUser.role === 'admin' ? Boolean(row.canPermanentlyDeleteCustomers) : false;

    return {
      canViewCustomers: Boolean(row.canViewCustomers),
      canAddCustomers: Boolean(row.canAddCustomers),
      canEditCustomers: Boolean(row.canEditCustomers),
      canDeactivateCustomers: Boolean(row.canDeactivateCustomers),
      canReactivateCustomers: Boolean(row.canReactivateCustomers),
      canPermanentlyDeleteCustomers: canPermDelete,
      canViewDeletionHistory: Boolean(row.canViewDeletionHistory),
    };
  } catch {
    return defaults;
  }
}

export async function setStaffCustomerPermissions(opts: {
  targetUserId: number;
  permissions: Partial<CustomerPermissions>;
  grantedByEmail: string;
}): Promise<CustomerPermissions> {
  const [target] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, opts.targetUserId), isNull(users.deletedAt)))
    .limit(1);

  if (!target || !ADMIN_ROLES_SET.has(target.role)) {
    throw new AuthActionError('Target staff/admin user not found.', 404);
  }
  if (target.role === 'super_admin') {
    throw new AuthActionError('Super Admin permissions are immutable.', 400);
  }

  const current = await getStaffCustomerPermissions(target);
  const next: CustomerPermissions = {
    canViewCustomers: opts.permissions.canViewCustomers ?? current.canViewCustomers,
    canAddCustomers: opts.permissions.canAddCustomers ?? current.canAddCustomers,
    canEditCustomers: opts.permissions.canEditCustomers ?? current.canEditCustomers,
    canDeactivateCustomers: opts.permissions.canDeactivateCustomers ?? current.canDeactivateCustomers,
    canReactivateCustomers: opts.permissions.canReactivateCustomers ?? current.canReactivateCustomers,
    // Employees NEVER get permanent delete under any circumstances
    canPermanentlyDeleteCustomers:
      target.role === 'admin'
        ? Boolean(opts.permissions.canPermanentlyDeleteCustomers ?? current.canPermanentlyDeleteCustomers)
        : false,
    canViewDeletionHistory: opts.permissions.canViewDeletionHistory ?? current.canViewDeletionHistory,
  };

  const now = new Date();
  const [existingRow] = await db
    .select({ id: staffPermissions.id })
    .from(staffPermissions)
    .where(eq(staffPermissions.userId, target.id))
    .limit(1);

  if (existingRow) {
    await db
      .update(staffPermissions)
      .set({
        ...next,
        grantedBy: opts.grantedByEmail,
        updatedAt: now,
      })
      .where(eq(staffPermissions.userId, target.id));
  } else {
    await db.insert(staffPermissions).values({
      userId: target.id,
      ...next,
      grantedBy: opts.grantedByEmail,
      createdAt: now,
      updatedAt: now,
    });
  }

  return next;
}

export async function listStaffWithCustomerPermissions() {
  const staffRows = await db
    .select()
    .from(users)
    .where(and(inArray(users.role, Array.from(ADMIN_ROLES_SET)), isNull(users.deletedAt)));

  const permRows = await db.select().from(staffPermissions).catch(() => []);
  const permByUserId = new Map<number, typeof staffPermissions.$inferSelect>();
  for (const p of permRows) {
    permByUserId.set(p.userId, p);
  }

  return staffRows.map((u) => {
    const defaults = getDefaultCustomerPermissions(u.role);
    const stored = permByUserId.get(u.id);
    const permissions: CustomerPermissions =
      u.role === 'super_admin'
        ? defaults
        : stored
          ? {
              canViewCustomers: Boolean(stored.canViewCustomers),
              canAddCustomers: Boolean(stored.canAddCustomers),
              canEditCustomers: Boolean(stored.canEditCustomers),
              canDeactivateCustomers: Boolean(stored.canDeactivateCustomers),
              canReactivateCustomers: Boolean(stored.canReactivateCustomers),
              canPermanentlyDeleteCustomers:
                u.role === 'admin' ? Boolean(stored.canPermanentlyDeleteCustomers) : false,
              canViewDeletionHistory: Boolean(stored.canViewDeletionHistory),
            }
          : defaults;

    return {
      userId: u.id,
      uid: u.uid,
      email: u.email,
      fullName: u.fullName || u.email,
      role: u.role,
      isActive: u.isActive,
      permissions,
      grantedBy: stored?.grantedBy || '',
      updatedAt: stored?.updatedAt ? new Date(stored.updatedAt).toISOString() : null,
    };
  });
}

export interface CustomerProfileSummary {
  id: string | number;
  customerId: string;
  webUserId: number | null;
  authUserId: string | null;
  fullName: string;
  email: string;
  mobile: string;
  companyOrCollege: string;
  fullAddress: string;
  city: string;
  state: string;
  pinCode: string;
  profilePhotoUrl: string;
  customerType: string;
  billingDetails: Record<string, any>;
  accountStatus: string;
  registrationDate: string;
  lastLoginAt: string | null;
}

function mapPublicRecordToSummary(r: PublicCustomerRecord): CustomerProfileSummary {
  return {
    id: r.id,
    customerId: r.customerId,
    webUserId: r.webUserId,
    authUserId: r.authUserId,
    fullName: r.fullName,
    email: r.email,
    mobile: r.phoneNumber,
    companyOrCollege: r.companyOrCollege,
    fullAddress: r.fullAddress,
    city: r.city,
    state: r.state,
    pinCode: r.pinCode,
    profilePhotoUrl: r.profilePhotoUrl || '',
    customerType: r.customerType || 'Individual',
    billingDetails: r.billingDetails || {},
    accountStatus: r.accountStatus || 'Active',
    registrationDate: r.registrationDate,
    lastLoginAt: r.lastLoginAt,
  };
}

function mapLocalCustToSummary(c: typeof customers.$inferSelect): CustomerProfileSummary {
  return {
    id: c.id,
    customerId: c.customerId,
    webUserId: c.userId,
    authUserId: c.authUserId || null,
    fullName: c.fullName,
    email: c.email,
    mobile: c.phoneNumber,
    companyOrCollege: c.companyOrCollege,
    fullAddress: c.fullAddress,
    city: c.city,
    state: c.state,
    pinCode: c.pinCode,
    profilePhotoUrl: c.profilePhotoUrl || '',
    customerType: c.customerType || 'Individual',
    billingDetails: (c.billingDetails as Record<string, any>) || {},
    accountStatus: c.accountStatus || 'Active',
    registrationDate: new Date(c.registrationDate || c.createdAt).toISOString(),
    lastLoginAt: c.lastLoginAt ? new Date(c.lastLoginAt).toISOString() : null,
  };
}

async function ensureLocalUserForCustomerProfile(opts: {
  authUserId: string;
  email: string;
  emailConfirmedAt?: string;
  publicRecord?: PublicCustomerRecord | null;
  localCustomer?: typeof customers.$inferSelect | null;
  fullName?: string;
  phone?: string;
  profilePhotoUrl?: string;
}): Promise<typeof users.$inferSelect> {
  const cleanEmail = normalizeEmail(opts.email);
  const now = new Date();
  const hasRealPostgres = Boolean(createPool());
  const validAuthUuid = isUuid(opts.authUserId) ? opts.authUserId : null;
  const incomingName = String(opts.fullName || '').trim();
  const incomingPhone = normalizeMobile(opts.phone);
  const incomingPhoto = String(opts.profilePhotoUrl || '').trim();

  if (opts.publicRecord) {
    const pub = opts.publicRecord;
    const mergedName = pub.fullName || incomingName;
    const mergedPhone = pub.phoneNumber || incomingPhone;
    const mergedPhoto = pub.profilePhotoUrl || incomingPhoto;

    await updatePublicCustomerRecord(pub.id, {
      ...(validAuthUuid && pub.authUserId !== validAuthUuid ? { authUserId: validAuthUuid } : {}),
      ...(mergedName && !pub.fullName ? { fullName: mergedName } : {}),
      ...(mergedPhone && !pub.phoneNumber ? { phoneNumber: mergedPhone } : {}),
      ...(mergedPhoto && !pub.profilePhotoUrl ? { profilePhotoUrl: mergedPhoto } : {}),
      emailVerified: true,
      ...(opts.emailConfirmedAt ? { emailConfirmedAt: opts.emailConfirmedAt } : {}),
      lastLoginAt: now,
    }).catch(() => {});

    const synced = await syncLocalWebUserFromPublicCustomer({
      ...pub,
      authUserId: validAuthUuid || pub.authUserId,
      fullName: mergedName,
      phoneNumber: mergedPhone,
      profilePhotoUrl: mergedPhoto,
      emailVerified: true,
      lastLoginAt: now.toISOString(),
    });
    if (synced && !ADMIN_ROLES_SET.has(synced.role)) {
      if (hasRealPostgres && pub.webUserId !== synced.id) {
        await updatePublicCustomerRecord(pub.id, { webUserId: synced.id }).catch(() => {});
      }
      return synced;
    }

    const [uidCollision] = await db.select({ id: users.id, role: users.role }).from(users).where(eq(users.uid, pub.customerId)).limit(1);
    const safeUid =
      uidCollision && ADMIN_ROLES_SET.has(uidCollision.role)
        ? `${pub.customerId}-${crypto.randomBytes(3).toString('hex')}`
        : pub.customerId;
    const [inserted] = await db
      .insert(users)
      .values({
        uid: safeUid,
        authUserId: validAuthUuid,
        email: cleanEmail,
        fullName: mergedName,
        mobile: mergedPhone,
        companyOrCollege: pub.companyOrCollege,
        fullAddress: pub.fullAddress,
        city: pub.city,
        state: pub.state,
        pinCode: pub.pinCode,
        profilePhotoUrl: mergedPhoto,
        customerType: pub.customerType || 'Individual',
        billingDetails: pub.billingDetails || {},
        role: 'customer',
        passwordHash: null,
        passwordConfigured: false,
        emailVerified: true,
        emailConfirmedAt: opts.emailConfirmedAt || now.toISOString(),
        accountStatus: 'Active',
        isActive: true,
        lastLoginAt: now,
      })
      .returning();

    if (hasRealPostgres) {
      await updatePublicCustomerRecord(pub.id, { webUserId: inserted.id }).catch(() => {});
    }
    return inserted;
  }

  const lc = opts.localCustomer!;
  const mergedName = lc.fullName || incomingName;
  const mergedPhone = lc.phoneNumber || incomingPhone;
  const mergedPhoto = lc.profilePhotoUrl || incomingPhoto;

  if (lc.userId) {
    const [existingUser] = await db
      .select()
      .from(users)
      .where(and(eq(users.id, lc.userId), isNull(users.deletedAt)))
      .limit(1);
    if (existingUser && !ADMIN_ROLES_SET.has(existingUser.role)) {
      const [updated] = await db
        .update(users)
        .set({
          authUserId: validAuthUuid || existingUser.authUserId,
          email: cleanEmail,
          fullName: existingUser.fullName || mergedName,
          mobile: existingUser.mobile || mergedPhone,
          profilePhotoUrl: existingUser.profilePhotoUrl || mergedPhoto,
          customerType: existingUser.customerType || lc.customerType || 'Individual',
          billingDetails:
            existingUser.billingDetails && Object.keys(existingUser.billingDetails).length > 0
              ? existingUser.billingDetails
              : (lc.billingDetails as any) || {},
          emailVerified: true,
          emailConfirmedAt: opts.emailConfirmedAt || existingUser.emailConfirmedAt || now.toISOString(),
          lastLoginAt: now,
          updatedAt: now,
        })
        .where(eq(users.id, existingUser.id))
        .returning();
      await db
        .update(customers)
        .set({
          authUserId: validAuthUuid || lc.authUserId,
          fullName: lc.fullName || mergedName,
          phoneNumber: lc.phoneNumber || mergedPhone,
          profilePhotoUrl: lc.profilePhotoUrl || mergedPhoto,
          emailVerified: true,
          lastLoginAt: now,
          updatedAt: now,
        })
        .where(eq(customers.id, lc.id))
        .catch(() => {});
      return updated || existingUser;
    }
  }

  const [byCode] = await db
    .select()
    .from(users)
    .where(and(eq(users.uid, lc.customerId), isNull(users.deletedAt)))
    .limit(1);
  if (byCode && !ADMIN_ROLES_SET.has(byCode.role)) {
    const [updated] = await db
      .update(users)
      .set({
        authUserId: validAuthUuid || byCode.authUserId,
        fullName: byCode.fullName || mergedName,
        mobile: byCode.mobile || mergedPhone,
        profilePhotoUrl: byCode.profilePhotoUrl || mergedPhoto,
        emailVerified: true,
        emailConfirmedAt: opts.emailConfirmedAt || byCode.emailConfirmedAt || now.toISOString(),
        lastLoginAt: now,
        updatedAt: now,
      })
      .where(eq(users.id, byCode.id))
      .returning();
    await db
      .update(customers)
      .set({
        userId: byCode.id,
        authUserId: validAuthUuid || lc.authUserId,
        emailVerified: true,
        lastLoginAt: now,
        updatedAt: now,
      })
      .where(eq(customers.id, lc.id))
      .catch(() => {});
    return updated || byCode;
  }

  const [inserted] = await db
    .insert(users)
    .values({
      uid: lc.customerId,
      authUserId: validAuthUuid,
      email: cleanEmail,
      fullName: mergedName,
      mobile: mergedPhone,
      companyOrCollege: lc.companyOrCollege,
      fullAddress: lc.fullAddress,
      city: lc.city,
      state: lc.state,
      pinCode: lc.pinCode,
      profilePhotoUrl: mergedPhoto,
      customerType: lc.customerType || 'Individual',
      billingDetails: (lc.billingDetails as any) || {},
      role: 'customer',
      passwordHash: null,
      passwordConfigured: false,
      emailVerified: true,
      emailConfirmedAt: opts.emailConfirmedAt || now.toISOString(),
      accountStatus: 'Active',
      isActive: true,
      lastLoginAt: now,
    })
    .returning();

  await db
    .update(customers)
    .set({
      userId: inserted.id,
      authUserId: validAuthUuid || lc.authUserId,
      emailVerified: true,
      lastLoginAt: now,
      updatedAt: now,
    })
    .where(eq(customers.id, lc.id))
    .catch(() => {});

  return inserted;
}

export async function listActiveCustomerProfilesForAuth(opts: {
  authUserId: string;
  email: string;
}): Promise<{
  publicReady: boolean;
  allProfiles: CustomerProfileSummary[];
  activeProfiles: CustomerProfileSummary[];
  inactiveProfiles: CustomerProfileSummary[];
  publicRecordsMap: Map<string, PublicCustomerRecord>;
  localRecordsMap: Map<string, typeof customers.$inferSelect>;
}> {
  const cleanEmail = normalizeEmail(opts.email);
  const publicReady = await isPublicCustomersSchemaReady();
  const publicRecordsMap = new Map<string, PublicCustomerRecord>();
  const localRecordsMap = new Map<string, typeof customers.$inferSelect>();

  let allProfiles: CustomerProfileSummary[] = [];

  if (publicReady) {
    const pubs = await listAllPublicCustomersForAuth({
      authUserId: opts.authUserId,
      email: cleanEmail,
      includeDeleted: false,
    });
    for (const p of pubs) {
      publicRecordsMap.set(p.customerId, p);
    }
    allProfiles = pubs.map(mapPublicRecordToSummary);

    const conds = [sql`lower(${customers.email}) = ${cleanEmail}`];
    if (isUuid(opts.authUserId)) {
      conds.push(eq(customers.authUserId, opts.authUserId));
    }
    const localRows = await db
      .select()
      .from(customers)
      .where(and(isNull(customers.deletedAt), or(...conds)))
      .catch(() => []);
    for (const lc of localRows) {
      localRecordsMap.set(lc.customerId, lc);
      if (!publicRecordsMap.has(lc.customerId)) {
        allProfiles.push(mapLocalCustToSummary(lc));
      }
    }
  } else {
    const conds = [sql`lower(${customers.email}) = ${cleanEmail}`];
    if (isUuid(opts.authUserId)) {
      conds.push(eq(customers.authUserId, opts.authUserId));
    }
    const localRows = await db
      .select()
      .from(customers)
      .where(and(isNull(customers.deletedAt), or(...conds)));
    for (const lc of localRows) {
      localRecordsMap.set(lc.customerId, lc);
    }
    allProfiles = localRows.map(mapLocalCustToSummary);
  }

  // Deterministic ordering: exact authUserId match first, then earliest registration
  allProfiles.sort((a, b) => {
    const aMatch = opts.authUserId && a.authUserId === opts.authUserId ? 1 : 0;
    const bMatch = opts.authUserId && b.authUserId === opts.authUserId ? 1 : 0;
    if (aMatch !== bMatch) return bMatch - aMatch;
    return new Date(a.registrationDate).getTime() - new Date(b.registrationDate).getTime();
  });

  const activeProfiles = allProfiles.filter((p) => p.accountStatus === 'Active');
  const inactiveProfiles = allProfiles.filter((p) => p.accountStatus !== 'Active');

  return {
    publicReady,
    allProfiles,
    activeProfiles,
    inactiveProfiles,
    publicRecordsMap,
    localRecordsMap,
  };
}

// Per-identity async mutex to serialize concurrent OTP registrations/logins for the same email/authUserId
const otpProvisionLocks = new Map<string, Promise<unknown>>();

async function withCustomerProvisionLock<T>(lockKey: string, fn: () => Promise<T>): Promise<T> {
  const key = String(lockKey || '').trim().toLowerCase() || '__default__';
  const prev = otpProvisionLocks.get(key) || Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const chained = prev.catch(() => {}).then(() => current);
  otpProvisionLocks.set(key, chained);

  await prev.catch(() => {});
  try {
    return await fn();
  } finally {
    release();
    if (otpProvisionLocks.get(key) === chained) {
      otpProvisionLocks.delete(key);
    }
  }
}

export async function resolveOrProvisionCustomerFromOtp(opts: {
  authUserId: string;
  email: string;
  emailConfirmedAt?: string;
  fullName?: string;
  phone?: string;
  profilePhotoUrl?: string;
  customerOnly?: boolean;
}): Promise<
  | {
      kind: 'staff';
      user: typeof users.$inferSelect;
    }
  | {
      kind: 'single';
      isNewCustomer: boolean;
      user: typeof users.$inferSelect;
      activeProfile: CustomerProfileSummary;
      profiles: CustomerProfileSummary[];
    }
> {
  await ensureCustomerManagementSchema();
  const cleanEmail = normalizeEmail(opts.email);
  if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    throw new AuthActionError('A valid verified email address is required.', 400);
  }

  return withCustomerProvisionLock(cleanEmail || opts.authUserId, async () => {
    const now = new Date();
    const validAuthUuid = isUuid(opts.authUserId) ? opts.authUserId : null;

    const staffConds = [eq(users.uid, opts.authUserId)];
    if (validAuthUuid) staffConds.push(eq(users.authUserId, validAuthUuid));
    staffConds.push(sql`lower(${users.email}) = ${cleanEmail}`);
    const matchedStaffRows = await db
      .select()
      .from(users)
      .where(
        and(
          isNull(users.deletedAt),
          inArray(users.role, Array.from(ADMIN_ROLES_SET)),
          or(...staffConds)
        )
      );
    const staffMatch = matchedStaffRows[0];

    if (!opts.customerOnly && staffMatch) {
      if (!staffMatch.isActive || staffMatch.accountStatus !== 'Active') {
        throw new AuthActionError('Your staff account is currently inactive. Please contact Super Admin.', 403);
      }
      const [updatedStaff] = await db
        .update(users)
        .set({
          authUserId: validAuthUuid || staffMatch.authUserId,
          emailVerified: true,
          emailConfirmedAt: opts.emailConfirmedAt || staffMatch.emailConfirmedAt || now.toISOString(),
          lastLoginAt: now,
          updatedAt: now,
        })
        .where(eq(users.id, staffMatch.id))
        .returning();
      return { kind: 'staff', user: updatedStaff || staffMatch };
    }

    const { allProfiles, activeProfiles, inactiveProfiles, publicRecordsMap, localRecordsMap, publicReady } =
      await listActiveCustomerProfilesForAuth({ authUserId: opts.authUserId, email: cleanEmail });

    if (allProfiles.length > 0 && activeProfiles.length === 0) {
      const statusLabel = inactiveProfiles[0]?.accountStatus || 'Deactivated';
      for (const p of inactiveProfiles) {
        if (p.webUserId) {
          await db.delete(adminSessions).where(eq(adminSessions.userId, p.webUserId)).catch(() => {});
        }
      }
      throw new AuthActionError(
        `Your customer account is currently ${statusLabel}. Please contact support.`,
        403
      );
    }

    // Existing active customer -> UPSERT & retrieve existing account (never duplicate!)
    if (activeProfiles.length > 0) {
      const target = activeProfiles[0];
      const linkedUser = await ensureLocalUserForCustomerProfile({
        authUserId: opts.authUserId,
        email: cleanEmail,
        emailConfirmedAt: opts.emailConfirmedAt,
        publicRecord: publicRecordsMap.get(target.customerId) || null,
        localCustomer: localRecordsMap.get(target.customerId) || null,
        fullName: opts.fullName,
        phone: opts.phone,
        profilePhotoUrl: opts.profilePhotoUrl,
      });
      const resolvedProfile: CustomerProfileSummary = {
        ...target,
        webUserId: linkedUser.id,
        authUserId: validAuthUuid || target.authUserId,
        fullName: linkedUser.fullName || target.fullName,
        mobile: linkedUser.mobile || target.mobile,
        profilePhotoUrl: linkedUser.profilePhotoUrl || target.profilePhotoUrl,
        customerType: linkedUser.customerType || target.customerType,
        billingDetails: (linkedUser.billingDetails as any) || target.billingDetails || {},
        lastLoginAt: now.toISOString(),
      };
      return {
        kind: 'single',
        isNewCustomer: false,
        user: linkedUser,
        activeProfile: resolvedProfile,
        profiles: [resolvedProfile],
      };
    }

    if (opts.customerOnly && staffMatch) {
      throw new AuthActionError(
        'This email is not eligible for customer sign-in. Please use a customer email address.',
        403
      );
    }

    // Brand new customer (or re-registering after previous deletion) ->
    // Automatically provision account & generate sequential permanent NTF-CUST-XXXXXX ID
    const cleanFullName = String(opts.fullName || '').trim() || cleanEmail.split('@')[0];
    const cleanPhone = normalizeMobile(opts.phone);
    const cleanPhoto = String(opts.profilePhotoUrl || '').trim();
    const hasRealPostgres = Boolean(createPool());
    const customerCode = await generateNextCustomerCodeFromDb();

    const [linkedUser] = await db
      .insert(users)
      .values({
        uid: customerCode,
        authUserId: validAuthUuid,
        email: cleanEmail,
        fullName: cleanFullName,
        mobile: cleanPhone,
        companyOrCollege: '',
        fullAddress: '',
        city: '',
        state: '',
        pinCode: '',
        profilePhotoUrl: cleanPhoto,
        customerType: 'Individual',
        billingDetails: {},
        role: 'customer',
        passwordHash: null,
        passwordConfigured: false,
        emailVerified: true,
        phoneVerified: false,
        emailConfirmedAt: opts.emailConfirmedAt || now.toISOString(),
        phoneConfirmedAt: '',
        accountStatus: 'Active',
        isActive: true,
        lastLoginAt: now,
      })
      .returning();

    let activeProfile: CustomerProfileSummary;
    try {
      let persistedPublic: PublicCustomerRecord | null = null;
      if (publicReady) {
        try {
          persistedPublic = await createPublicCustomerRecord({
            customerId: customerCode,
            authUserId: validAuthUuid,
            userUid: customerCode,
            ...(hasRealPostgres ? { webUserId: linkedUser.id } : {}),
            fullName: cleanFullName,
            email: cleanEmail,
            phoneNumber: cleanPhone,
            profilePhotoUrl: cleanPhoto,
            customerType: 'Individual',
            billingDetails: {},
            accountStatus: 'Active',
            emailVerified: true,
            emailConfirmedAt: opts.emailConfirmedAt || now,
            registrationDate: now,
            lastLoginAt: now,
          });
        } catch (pubErr: any) {
          if (/customer_profiles/i.test(String(pubErr?.message || ''))) {
            console.warn('Supabase public.customers auto-provision trigger fallback:', pubErr?.message);
          } else {
            throw pubErr;
          }
        }
      }

      if (persistedPublic) {
        activeProfile = {
          ...mapPublicRecordToSummary(persistedPublic),
          webUserId: linkedUser.id,
        };
      } else {
        const [insertedCust] = await db
          .insert(customers)
          .values({
            customerId: customerCode,
            userId: linkedUser.id,
            authUserId: validAuthUuid,
            fullName: cleanFullName,
            email: cleanEmail,
            phoneNumber: cleanPhone,
            profilePhotoUrl: cleanPhoto,
            customerType: 'Individual',
            billingDetails: {},
            passwordHash: '',
            passwordConfigured: false,
            emailVerified: true,
            accountStatus: 'Active',
            registrationDate: now,
            lastLoginAt: now,
          })
          .returning();
        activeProfile = mapLocalCustToSummary(insertedCust);
      }

      await recordCustomerIdHistory({
        customerDbId: activeProfile.id,
        authUserId: validAuthUuid,
        email: cleanEmail,
        previousCustomerId: null,
        newCustomerId: customerCode,
        newAccountStatus: 'Active',
        operationType: 'otp_auto_registration',
        reason: 'Automatically created customer account and Customer ID on verified Email OTP login',
        changedBy: cleanEmail,
      });
    } catch (err: any) {
      await db.delete(users).where(eq(users.id, linkedUser.id)).catch(() => {});

      const errCode = String(err?.code || err?.cause?.code || '');
      const errMsg = String(err?.message || '');
      if (errCode === '23505' || /duplicate key|already exists/i.test(errMsg)) {
        const retryProfiles = await listActiveCustomerProfilesForAuth({
          authUserId: opts.authUserId,
          email: cleanEmail,
        });
        if (retryProfiles.activeProfiles.length > 0) {
          const target = retryProfiles.activeProfiles[0];
          const existingLinked = await ensureLocalUserForCustomerProfile({
            authUserId: opts.authUserId,
            email: cleanEmail,
            emailConfirmedAt: opts.emailConfirmedAt,
            publicRecord: retryProfiles.publicRecordsMap.get(target.customerId) || null,
            localCustomer: retryProfiles.localRecordsMap.get(target.customerId) || null,
            fullName: opts.fullName,
            phone: opts.phone,
            profilePhotoUrl: opts.profilePhotoUrl,
          });
          const resolvedExisting: CustomerProfileSummary = {
            ...target,
            webUserId: existingLinked.id,
            authUserId: validAuthUuid || target.authUserId,
            fullName: existingLinked.fullName || target.fullName,
            mobile: existingLinked.mobile || target.mobile,
            profilePhotoUrl: existingLinked.profilePhotoUrl || target.profilePhotoUrl,
            customerType: existingLinked.customerType || target.customerType,
            billingDetails: (existingLinked.billingDetails as any) || target.billingDetails || {},
            lastLoginAt: now.toISOString(),
          };
          return {
            kind: 'single',
            isNewCustomer: false,
            user: existingLinked,
            activeProfile: resolvedExisting,
            profiles: [resolvedExisting],
          };
        }
      }

      if (err instanceof AuthActionError) throw err;
      throw new AuthActionError(err?.message || 'Failed to automatically provision customer account.', 500);
    }

    return {
      kind: 'single',
      isNewCustomer: true,
      user: linkedUser,
      activeProfile,
      profiles: [activeProfile],
    };
  });
}

export async function resolveCustomerProfilesByVerifiedAuth(opts: {
  authUserId: string;
  email: string;
  emailConfirmedAt?: string;
  customerOnly?: boolean;
}) {
  return resolveOrProvisionCustomerFromOtp(opts);
}

export async function createAdminSession(
  userId: number,
  userAgent = '',
  activeCustomerId = '',
  sessionScope?: 'customer' | 'admin'
) {
  const [userRow] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, userId), isNull(users.deletedAt)))
    .limit(1);

  if (!userRow || !userRow.isActive || userRow.accountStatus !== 'Active') {
    throw new AuthActionError('Account is inactive or unavailable.', 403);
  }

  const isStaffUser = ADMIN_ROLES_SET.has(userRow.role);
  const resolvedScope: 'customer' | 'admin' =
    sessionScope || (isStaffUser ? 'admin' : 'customer');

  if (resolvedScope === 'admin' && !isStaffUser) {
    throw new AuthActionError(
      'Security check failed: Cannot issue an admin session for a customer account.',
      403
    );
  }
  if (resolvedScope === 'customer' && isStaffUser) {
    throw new AuthActionError(
      'This email is not eligible for customer sign-in. Please use a customer email address.',
      403
    );
  }

  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await db.insert(adminSessions).values({
    tokenHash,
    userId,
    activeCustomerId: resolvedScope === 'customer' ? activeCustomerId || '' : '',
    sessionScope: resolvedScope,
    userAgent: userAgent.slice(0, 240),
    expiresAt,
  });

  return {
    cookieValue: signSessionToken(rawToken),
    expiresAt,
    sessionScope: resolvedScope,
  };
}

export async function getSessionContextByToken(
  signedToken: string,
  expectedScope?: 'customer' | 'admin'
): Promise<{
  user: typeof users.$inferSelect;
  activeCustomerId: string;
  sessionScope: 'customer' | 'admin';
} | null> {
  const rawToken = verifySignedSessionToken(signedToken);
  if (!rawToken) return null;
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

  const rows = await db
    .select({
      user: users,
      activeCustomerId: adminSessions.activeCustomerId,
      sessionScope: adminSessions.sessionScope,
    })
    .from(adminSessions)
    .innerJoin(users, eq(adminSessions.userId, users.id))
    .where(
      and(
        eq(adminSessions.tokenHash, tokenHash),
        gt(adminSessions.expiresAt, new Date()),
        isNull(users.deletedAt)
      )
    )
    .limit(1);

  const row = rows[0];
  if (!row?.user || !row.user.isActive || row.user.accountStatus !== 'Active') return null;

  const isStaffUser = ADMIN_ROLES_SET.has(row.user.role);
  const scope: 'customer' | 'admin' =
    row.sessionScope === 'admin' || row.sessionScope === 'customer'
      ? row.sessionScope
      : isStaffUser
      ? 'admin'
      : 'customer';

  // Strict DB role <-> sessionScope verification
  if (scope === 'admin' && !isStaffUser) return null;
  if (scope === 'customer' && isStaffUser) return null;
  if (expectedScope && scope !== expectedScope) return null;

  return {
    user: row.user,
    activeCustomerId:
      scope === 'customer'
        ? row.activeCustomerId || (row.user.uid.startsWith('NTF-CUST-') ? row.user.uid : '')
        : '',
    sessionScope: scope,
  };
}

export async function getUserBySessionToken(signedToken: string) {
  const ctx = await getSessionContextByToken(signedToken);
  return ctx?.user || null;
}

export async function deleteAdminSession(signedToken: string) {
  const rawToken = verifySignedSessionToken(signedToken);
  if (!rawToken) return;
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  await db.delete(adminSessions).where(eq(adminSessions.tokenHash, tokenHash));
}

export async function updateUserPassword(userId: number, newPassword: string) {
  const [userRow] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!userRow) throw new AuthActionError('User not found.', 404);

  const now = new Date();
  const isStaff = ADMIN_ROLES_SET.has(userRow.role);
  const serviceClient = getServiceRoleSupabaseClient();

  if (!isStaff) {
    throw new AuthActionError(
      'Customer accounts use passwordless Email OTP authentication only.',
      410
    );
  }

  if (serviceClient) {
    let targetAuthId = userRow.authUserId || (isUuid(userRow.uid) ? userRow.uid : null);
    if (targetAuthId) {
      const { error } = await serviceClient.auth.admin.updateUserById(targetAuthId, {
        password: newPassword,
      });
      if (error) {
        throw new AuthActionError(error.message || 'Failed to update password in Supabase Auth.', 400);
      }
    } else {
      const { data: created, error } = await serviceClient.auth.admin.createUser({
        email: normalizeEmail(userRow.email),
        password: newPassword,
        email_confirm: true,
        user_metadata: {
          full_name: userRow.fullName || '',
          phone: userRow.mobile || '',
          company_or_college: userRow.companyOrCollege || '',
        },
      });
      if (error || !created?.user?.id) {
        throw new AuthActionError(error?.message || 'Failed to sync password with Supabase Auth.', 400);
      }
      targetAuthId = created.user.id;
    }

    await db
      .update(users)
      .set({
        authUserId: targetAuthId,
        passwordHash: null,
        passwordConfigured: true,
        updatedAt: now,
      })
      .where(eq(users.id, userId));
    return;
  }

  await db
    .update(users)
    .set({
      passwordHash: hashPassword(newPassword),
      passwordConfigured: true,
      updatedAt: now,
    })
    .where(eq(users.id, userId));
}

export async function getOrCreateUser(
  uid: string,
  email: string,
  fullName?: string,
  extra?: {
    phone?: string;
    companyOrCollege?: string;
    emailConfirmedAt?: string;
    phoneConfirmedAt?: string;
  }
) {
  try {
    const cleanEmail = normalizeEmail(email);
    const authUuid = isUuid(uid) ? uid : null;
    const incomingPhone = normalizeMobile(extra?.phone);
    const incomingCompany = String(extra?.companyOrCollege || '').trim();
    const shouldBeSuperAdmin = cleanEmail ? isBootstrapAdminEmail(cleanEmail) : false;
    const emailVerified = Boolean(extra?.emailConfirmedAt);
    const phoneVerified = Boolean(extra?.phoneConfirmedAt);

    const publicReady = await isPublicCustomersSchemaReady();
    const publicCust =
      publicReady && !shouldBeSuperAdmin
        ? await findPublicCustomerForUser({ authUserId: authUuid, uid, email: cleanEmail })
        : null;

    const safeIncomingPhone = incomingPhone;

    const existing = await db
      .select()
      .from(users)
      .where(
        and(
          isNull(users.deletedAt),
          shouldBeSuperAdmin ? inArray(users.role, Array.from(ADMIN_ROLES_SET)) : eq(users.role, 'customer'),
          authUuid ? or(eq(users.authUserId, authUuid), eq(users.uid, uid)) : eq(users.uid, uid)
        )
      )
      .limit(1);

    let resultUser: typeof users.$inferSelect;

    if (existing.length > 0) {
      const current = existing[0];
      // Preserve existing role & uid strictly — never convert a customer account into Admin or mutate UUIDs
      const [updated] = await db
        .update(users)
        .set({
          authUserId: authUuid || current.authUserId,
          email: cleanEmail || current.email,
          fullName: publicCust?.fullName || current.fullName || fullName || '',
          mobile: publicCust?.phoneNumber || current.mobile || safeIncomingPhone,
          companyOrCollege: publicCust?.companyOrCollege || current.companyOrCollege || incomingCompany,
          accountStatus: publicCust ? publicCust.accountStatus : current.accountStatus,
          isActive: publicCust ? publicCust.accountStatus === 'Active' : current.isActive,
          emailVerified: current.emailVerified || emailVerified,
          phoneVerified: current.phoneVerified || phoneVerified,
          emailConfirmedAt: extra?.emailConfirmedAt || current.emailConfirmedAt,
          phoneConfirmedAt: extra?.phoneConfirmedAt || current.phoneConfirmedAt,
          lastLoginAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(users.id, current.id))
        .returning();
      resultUser = updated;
    } else if (cleanEmail) {
      const byEmail = await db
        .select()
        .from(users)
        .where(
          and(
            sql`lower(${users.email}) = ${cleanEmail}`,
            isNull(users.deletedAt),
            shouldBeSuperAdmin ? inArray(users.role, Array.from(ADMIN_ROLES_SET)) : eq(users.role, 'customer')
          )
        )
        .limit(1);

      if (byEmail.length > 0) {
        const current = byEmail[0];
        const [linked] = await db
          .update(users)
          .set({
            authUserId: authUuid || current.authUserId,
            fullName: publicCust?.fullName || current.fullName || fullName || '',
            mobile: publicCust?.phoneNumber || current.mobile || safeIncomingPhone,
            companyOrCollege: publicCust?.companyOrCollege || current.companyOrCollege || incomingCompany,
            accountStatus: publicCust ? publicCust.accountStatus : current.accountStatus,
            isActive: publicCust ? publicCust.accountStatus === 'Active' : current.isActive,
            emailVerified: current.emailVerified || emailVerified,
            phoneVerified: current.phoneVerified || phoneVerified,
            emailConfirmedAt: extra?.emailConfirmedAt || current.emailConfirmedAt,
            phoneConfirmedAt: extra?.phoneConfirmedAt || current.phoneConfirmedAt,
            lastLoginAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(users.id, current.id))
          .returning();
        resultUser = linked;
      } else {
        const isolatedAdminUid =
          shouldBeSuperAdmin
            ? `admin_${crypto.randomBytes(6).toString('hex')}`
            : uid;
        const [existingUidCollision] = shouldBeSuperAdmin
          ? await db.select({ id: users.id }).from(users).where(eq(users.uid, uid)).limit(1)
          : [];
        const insertUid = existingUidCollision ? isolatedAdminUid : uid;
        const [inserted] = await db
          .insert(users)
          .values({
            uid: insertUid,
            authUserId: authUuid,
            email: cleanEmail,
            fullName: publicCust?.fullName || fullName || '',
            mobile: publicCust?.phoneNumber || safeIncomingPhone,
            companyOrCollege: publicCust?.companyOrCollege || incomingCompany,
            fullAddress: publicCust?.fullAddress || '',
            city: publicCust?.city || '',
            state: publicCust?.state || '',
            pinCode: publicCust?.pinCode || '',
            passwordHash: null,
            emailVerified,
            phoneVerified,
            emailConfirmedAt: extra?.emailConfirmedAt || '',
            phoneConfirmedAt: extra?.phoneConfirmedAt || '',
            role: shouldBeSuperAdmin ? 'super_admin' : 'customer',
            accountStatus: publicCust ? publicCust.accountStatus : 'Active',
            isActive: publicCust ? publicCust.accountStatus === 'Active' : true,
            lastLoginAt: new Date(),
          })
          .onConflictDoUpdate({
            target: users.uid,
            set: {
              authUserId: authUuid,
              email: cleanEmail,
              mobile: publicCust?.phoneNumber || safeIncomingPhone,
              companyOrCollege: publicCust?.companyOrCollege || incomingCompany,
              emailVerified,
              phoneVerified,
              lastLoginAt: new Date(),
              updatedAt: new Date(),
            },
          })
          .returning();
        resultUser = inserted;
      }
    } else {
      const [inserted] = await db
        .insert(users)
        .values({
          uid,
          authUserId: authUuid,
          email: cleanEmail,
          fullName: fullName || '',
          mobile: safeIncomingPhone,
          companyOrCollege: incomingCompany,
          passwordHash: null,
          emailVerified,
          phoneVerified,
          emailConfirmedAt: extra?.emailConfirmedAt || '',
          phoneConfirmedAt: extra?.phoneConfirmedAt || '',
          role: 'customer',
          accountStatus: 'Active',
          isActive: true,
          lastLoginAt: new Date(),
        })
        .onConflictDoUpdate({
          target: users.uid,
          set: { authUserId: authUuid, email: cleanEmail, lastLoginAt: new Date(), updatedAt: new Date() },
        })
        .returning();
      resultUser = inserted;
    }

    // Enforce Supabase public.customers synchronization for non-staff customer accounts
    if (publicReady && !ADMIN_ROLES_SET.has(resultUser.role)) {
      const hasRealPostgres = Boolean(createPool());
      if (publicCust) {
        if (publicCust.deletedAt) {
          throw new AuthActionError('Your customer account has been removed.', 401);
        }
        await updatePublicCustomerRecord(publicCust.id, {
          ...(authUuid && publicCust.authUserId !== authUuid ? { authUserId: authUuid } : {}),
          ...(hasRealPostgres && publicCust.webUserId !== resultUser.id ? { webUserId: resultUser.id } : {}),
          lastLoginAt: new Date(),
        }).catch(() => {});
      } else if (cleanEmail) {
        // Ensure existing/new customer profile is persisted cleanly into public.customers
        await createPublicCustomerRecord({
          authUserId: authUuid,
          userUid: authUuid || resultUser.uid,
          ...(hasRealPostgres ? { webUserId: resultUser.id } : {}),
          fullName: resultUser.fullName || cleanEmail.split('@')[0],
          email: cleanEmail,
          phoneNumber: resultUser.mobile || safeIncomingPhone,
          companyOrCollege: resultUser.companyOrCollege || incomingCompany,
          accountStatus: resultUser.accountStatus || 'Active',
          lastLoginAt: new Date(),
        }).catch(() => {});
      }
    }

    import('../server/supabase-ecommerce.ts')
      .then(({ syncCustomerProfileToSupabase }) =>
        syncCustomerProfileToSupabase({
          uid: resultUser.uid,
          email: resultUser.email,
          fullName: resultUser.fullName,
          mobile: resultUser.mobile,
          companyOrCollege: resultUser.companyOrCollege,
          role: resultUser.role,
          emailVerified: resultUser.emailVerified,
          phoneVerified: resultUser.phoneVerified,
          emailConfirmedAt: resultUser.emailConfirmedAt,
          phoneConfirmedAt: resultUser.phoneConfirmedAt,
        })
      )
      .catch(() => {});

    return resultUser;
  } catch (error) {
    if (error instanceof AuthActionError) throw error;
    console.error('Failed to upsert user:', error);
    throw new Error('Failed to synchronize user account.', { cause: error });
  }
}

export async function getUserByUid(uid: string) {
  try {
    const rows = await db
      .select()
      .from(users)
      .where(and(eq(users.uid, uid), isNull(users.deletedAt)))
      .limit(1);
    return rows[0] || null;
  } catch (error) {
    console.error('Failed to fetch user:', error);
    throw new Error('Failed to retrieve user record.', { cause: error });
  }
}
