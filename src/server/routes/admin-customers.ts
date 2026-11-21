import crypto from 'crypto';
import { Router } from 'express';
import { and, desc, eq, isNull, or, sql } from 'drizzle-orm';
import { createPool, db } from '../../db/index.ts';
import { ensureCustomerManagementSchema } from '../../db/ensure-customer-mgmt.ts';
import {
  adminSessions,
  auditLogs,
  b2bEnquiries,
  customerActivityLogs,
  customerAddresses,
  customerDeletionAuditLogs,
  customers,
  droneRepairBookings,
  invoices,
  payments,
  pcbEnquiries,
  printingOrders,
  productEnquiries,
  productReviews,
  products,
  projectEnquiries,
  projects,
  storeOrders,
  supportTickets,
  users,
} from '../../db/schema.ts';
import {
  getStaffCustomerPermissions,
  listStaffWithCustomerPermissions,
  normalizeEmail,
  normalizeMobile,
  setStaffCustomerPermissions,
} from '../../db/users.ts';
import { AuthRequest, requireAdmin, requireCustomerPermission } from '../../middleware/auth.ts';
import {
  createPublicCustomerRecord,
  findPublicCustomerByKey,
  findSupabaseAuthUserIdByEmail,
  generateNextCustomerCodeFromDb,
  getCustomerDeletionPreview,
  isPublicCustomersSchemaReady,
  listPublicCustomers,
  permanentlyDeleteCustomerTransaction,
  PublicCustomerRecord,
  PublicCustomersMigrationStatus,
  reconcileDeletedCustomersFromPublic,
  recordCustomerIdHistory,
  subscribeCustomerStream,
  syncLocalWebUserFromPublicCustomer,
  updatePublicCustomerRecord,
  verifyPublicCustomersMigrationStatus,
} from '../supabase-customers.ts';
import { logAudit } from '../utils.ts';

export const adminCustomersRouter = Router();

const CUSTOMER_MANAGER_ROLES = [
  'super_admin',
  'admin',
  'sales_manager',
  'support_manager',
  'support_staff',
  'accounts_manager',
  'project_manager',
];

const VALID_ACCOUNT_STATUSES = new Set(['Active', 'Suspended', 'Deactivated']);

adminCustomersRouter.use(requireAdmin(CUSTOMER_MANAGER_ROLES));

function formatCustomerCode(id: number): string {
  return `NTF-CUST-${String(id).padStart(6, '0')}`;
}

function escapeXml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function escapeCsvCell(value: unknown): string {
  let s = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(s)) {
    s = `'${s}`;
  }
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toSafeCsv(headers: string[], rows: Array<Array<unknown>>): string {
  return [
    headers.map(escapeCsvCell).join(','),
    ...rows.map((r) => r.map(escapeCsvCell).join(',')),
  ].join('\n');
}

function toExcelSpreadsheetXml(
  sheetName: string,
  headers: string[],
  rows: Array<Array<unknown>>
): string {
  const safeSheet = escapeXml(sheetName).slice(0, 31) || 'Customers';
  const headerXml = `<Row>${headers
    .map((h) => `<Cell ss:StyleID="Header"><Data ss:Type="String">${escapeXml(h)}</Data></Cell>`)
    .join('')}</Row>`;

  const bodyXml = rows
    .map(
      (r) =>
        `<Row>${r
          .map((cell) => {
            if (typeof cell === 'number' && Number.isFinite(cell)) {
              return `<Cell><Data ss:Type="Number">${cell}</Data></Cell>`;
            }
            return `<Cell><Data ss:Type="String">${escapeXml(cell)}</Data></Cell>`;
          })
          .join('')}</Row>`
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal">
   <Font ss:FontName="Calibri" ss:Size="10" ss:Color="#123B5D"/>
  </Style>
  <Style ss:ID="Header">
   <Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Color="#FFFFFF"/>
   <Interior ss:Color="#123B5D" ss:Pattern="Solid"/>
  </Style>
 </Styles>
 <Worksheet ss:Name="${safeSheet}">
  <Table>
   ${headerXml}
   ${bodyXml}
  </Table>
 </Worksheet>
</Workbook>`;
}

export interface EnrichedCustomerRow {
  id: string | number;
  userId: number | null;
  authUserId: string | null;
  customerCode: string;
  uid: string;
  fullName: string;
  email: string;
  mobile: string;
  companyOrCollege: string;
  fullAddress: string;
  city: string;
  state: string;
  pinCode: string;
  role: string;
  accountStatus: string;
  statusReason: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  isActive: boolean;
  lastLoginAt: string | null;
  registrationDate: string;
  createdAt: string;
  updatedAt: string;
  addressesCount: number;
  ordersCount: number;
  projectsCount: number;
  enquiriesCount: number;
  totalSpentInr: number;
}

async function buildEnrichedCustomers(query?: {
  search?: string;
  status?: string;
  state?: string;
  role?: string;
  regFrom?: string;
  regTo?: string;
  sortBy?: string;
  sortDir?: string;
}): Promise<{
  source: 'public.customers' | 'web_platform.customers';
  migrationStatus: PublicCustomersMigrationStatus;
  customers: EnrichedCustomerRow[];
  summary: {
    total: number;
    active: number;
    suspended: number;
    deactivated: number;
    totalRevenueInr: number;
  };
  filterOptions: {
    states: string[];
    roles: string[];
  };
}> {
  await ensureCustomerManagementSchema();

  const migrationStatus = await verifyPublicCustomersMigrationStatus();
  const publicReady = await isPublicCustomersSchemaReady();
  const publicRows = publicReady ? await listPublicCustomers() : null;
  const usingPublic = publicReady && publicRows !== null;

  if (usingPublic) {
    // Reconcile any deletions that occurred in Supabase Table Editor while server was offline
    reconcileDeletedCustomersFromPublic().catch(() => {});
  }

  const [
    fallbackCustomers,
    allUsers,
    allAddresses,
    allStoreOrders,
    allPrintOrders,
    allProjectEnquiries,
    allProductEnquiries,
    allPcbEnquiries,
    allB2bEnquiries,
    allSupportTickets,
    allPayments,
  ] = await Promise.all([
    usingPublic
      ? Promise.resolve([] as Array<typeof customers.$inferSelect>)
      : db
          .select()
          .from(customers)
          .where(isNull(customers.deletedAt))
          .orderBy(desc(customers.registrationDate), desc(customers.id)),
    db.select().from(users).where(isNull(users.deletedAt)),
    db
      .select()
      .from(customerAddresses)
      .orderBy(desc(customerAddresses.isDefault), desc(customerAddresses.id)),
    db
      .select({
        id: storeOrders.id,
        userId: storeOrders.userId,
        totalInr: storeOrders.totalInr,
        paymentStatus: storeOrders.paymentStatus,
      })
      .from(storeOrders)
      .where(eq(storeOrders.isDeleted, false)),
    db
      .select({
        id: printingOrders.id,
        userId: printingOrders.userId,
        totalInr: printingOrders.totalInr,
        paymentStatus: printingOrders.paymentStatus,
      })
      .from(printingOrders),
    db
      .select({
        id: projectEnquiries.id,
        userId: projectEnquiries.userId,
        customerEmail: projectEnquiries.customerEmail,
      })
      .from(projectEnquiries)
      .where(eq(projectEnquiries.isDeleted, false)),
    db
      .select({
        id: productEnquiries.id,
        userId: productEnquiries.userId,
        email: productEnquiries.email,
      })
      .from(productEnquiries),
    db
      .select({
        id: pcbEnquiries.id,
        userId: pcbEnquiries.userId,
        email: pcbEnquiries.email,
      })
      .from(pcbEnquiries),
    db
      .select({
        id: b2bEnquiries.id,
        userId: b2bEnquiries.userId,
        email: b2bEnquiries.email,
      })
      .from(b2bEnquiries),
    db
      .select({
        id: supportTickets.id,
        userId: supportTickets.userId,
        email: supportTickets.email,
      })
      .from(supportTickets),
    db
      .select({
        id: payments.id,
        userId: payments.userId,
        amountInr: payments.amountInr,
        status: payments.status,
      })
      .from(payments),
  ]);

  const userById = new Map<number, typeof users.$inferSelect>();
  const userByUid = new Map<string, typeof users.$inferSelect>();
  const userByAuthId = new Map<string, typeof users.$inferSelect>();
  const userByEmail = new Map<string, typeof users.$inferSelect>();
  for (const u of allUsers) {
    userById.set(u.id, u);
    if (u.uid) userByUid.set(u.uid, u);
    if (u.authUserId && !userByAuthId.has(u.authUserId)) userByAuthId.set(u.authUserId, u);
    const eLower = normalizeEmail(u.email);
    if (eLower && !userByEmail.has(eLower)) userByEmail.set(eLower, u);
  }

  const addressesByUser = new Map<number, typeof allAddresses>();
  for (const addr of allAddresses) {
    const arr = addressesByUser.get(addr.userId) || [];
    arr.push(addr);
    addressesByUser.set(addr.userId, arr);
  }

  const storeOrdersByUser = new Map<number, number>();
  for (const so of allStoreOrders) {
    if (so.userId !== null) {
      storeOrdersByUser.set(so.userId, (storeOrdersByUser.get(so.userId) || 0) + 1);
    }
  }

  const printOrdersByUser = new Map<number, number>();
  for (const po of allPrintOrders) {
    if (po.userId !== null) {
      printOrdersByUser.set(po.userId, (printOrdersByUser.get(po.userId) || 0) + 1);
    }
  }

  const spentByUser = new Map<number, number>();
  for (const pay of allPayments) {
    if (pay.userId && pay.status === 'verified') {
      spentByUser.set(pay.userId, (spentByUser.get(pay.userId) || 0) + (pay.amountInr || 0));
    }
  }

  const buildRow = (opts: {
    id: string | number;
    customerCode: string;
    uid: string;
    authUserId: string | null;
    webUserId: number | null;
    fullName: string;
    email: string;
    phoneNumber: string;
    companyOrCollege: string;
    fullAddress: string;
    city: string;
    state: string;
    pinCode: string;
    accountStatus: string;
    statusReason: string;
    lastLoginAt: string | null;
    registrationDate: string;
    updatedAt: string;
  }): EnrichedCustomerRow => {
    const emailLower = normalizeEmail(opts.email);
    const legacyCand =
      (opts.authUserId ? userByAuthId.get(opts.authUserId) : undefined) ||
      userByEmail.get(emailLower);
    const linkedUser =
      (opts.webUserId ? userById.get(opts.webUserId) : undefined) ||
      userByUid.get(opts.customerCode) ||
      (opts.uid ? userByUid.get(opts.uid) : undefined) ||
      (legacyCand && !legacyCand.uid.startsWith('NTF-CUST-') ? legacyCand : undefined);
    const resolvedUserId = linkedUser?.id ?? opts.webUserId ?? null;

    const userAddresses = resolvedUserId ? addressesByUser.get(resolvedUserId) || [] : [];
    const defaultAddr = userAddresses[0];
    const addrLine = defaultAddr
      ? [defaultAddr.houseFlat, defaultAddr.streetArea, defaultAddr.landmark]
          .map((s) => String(s || '').trim())
          .filter(Boolean)
          .join(', ')
      : '';

    const fullAddress = String(opts.fullAddress || '').trim() || linkedUser?.fullAddress || addrLine || '';
    const city = String(opts.city || '').trim() || linkedUser?.city || defaultAddr?.city || '';
    const state = String(opts.state || '').trim() || linkedUser?.state || defaultAddr?.state || '';
    const pinCode = String(opts.pinCode || '').trim() || linkedUser?.pinCode || defaultAddr?.pinCode || '';

    const matchesCustomer = (row: { userId: number | null; email?: string | null }) =>
      resolvedUserId !== null
        ? row.userId === resolvedUserId || (!row.userId && normalizeEmail(row.email || '') === emailLower)
        : normalizeEmail(row.email || '') === emailLower;

    const projectsCount = allProjectEnquiries.filter((pe) =>
      resolvedUserId !== null
        ? pe.userId === resolvedUserId || (!pe.userId && normalizeEmail(pe.customerEmail) === emailLower)
        : normalizeEmail(pe.customerEmail) === emailLower
    ).length;

    const enquiriesCount =
      allProductEnquiries.filter(matchesCustomer).length +
      allPcbEnquiries.filter(matchesCustomer).length +
      allB2bEnquiries.filter(matchesCustomer).length +
      allSupportTickets.filter(matchesCustomer).length;

    const ordersCount = resolvedUserId
      ? (storeOrdersByUser.get(resolvedUserId) || 0) + (printOrdersByUser.get(resolvedUserId) || 0)
      : 0;
    const totalSpentInr = resolvedUserId ? spentByUser.get(resolvedUserId) || 0 : 0;
    const accountStatus = opts.accountStatus || 'Active';

    return {
      id: opts.id,
      userId: resolvedUserId,
      authUserId: opts.authUserId || linkedUser?.authUserId || null,
      customerCode: opts.customerCode,
      uid: opts.uid || opts.customerCode,
      fullName: opts.fullName || '',
      email: opts.email,
      mobile: opts.phoneNumber || linkedUser?.mobile || '',
      companyOrCollege: opts.companyOrCollege || linkedUser?.companyOrCollege || '',
      fullAddress,
      city,
      state,
      pinCode,
      role: linkedUser?.role || 'customer',
      accountStatus,
      statusReason: opts.statusReason || '',
      emailVerified: Boolean(linkedUser?.emailVerified),
      phoneVerified: Boolean(linkedUser?.phoneVerified),
      isActive: accountStatus === 'Active',
      lastLoginAt:
        opts.lastLoginAt ||
        (linkedUser?.lastLoginAt ? new Date(linkedUser.lastLoginAt).toISOString() : null),
      registrationDate: opts.registrationDate,
      createdAt: opts.registrationDate,
      updatedAt: opts.updatedAt,
      addressesCount: userAddresses.length,
      ordersCount,
      projectsCount,
      enquiriesCount,
      totalSpentInr,
    };
  };

  const enrichedAll: EnrichedCustomerRow[] = usingPublic
    ? (publicRows || []).map((c) =>
        buildRow({
          id: c.id,
          customerCode: c.customerId,
          uid: c.userUid || c.customerId,
          authUserId: c.authUserId,
          webUserId: c.webUserId,
          fullName: c.fullName,
          email: c.email,
          phoneNumber: c.phoneNumber,
          companyOrCollege: c.companyOrCollege,
          fullAddress: c.fullAddress,
          city: c.city,
          state: c.state,
          pinCode: c.pinCode,
          accountStatus: c.accountStatus,
          statusReason: c.statusReason,
          lastLoginAt: c.lastLoginAt,
          registrationDate: c.registrationDate,
          updatedAt: c.updatedAt,
        })
      )
    : fallbackCustomers.map((c) => {
        const regIso = new Date(c.registrationDate || c.createdAt).toISOString();
        return buildRow({
          id: c.id,
          customerCode: c.customerId || formatCustomerCode(c.id),
          uid: c.customerId || formatCustomerCode(c.id),
          authUserId: null,
          webUserId: c.userId,
          fullName: c.fullName || '',
          email: c.email,
          phoneNumber: c.phoneNumber || '',
          companyOrCollege: c.companyOrCollege || '',
          fullAddress: c.fullAddress || '',
          city: c.city || '',
          state: c.state || '',
          pinCode: c.pinCode || '',
          accountStatus: c.accountStatus || 'Active',
          statusReason: c.statusReason || '',
          lastLoginAt: c.lastLoginAt ? new Date(c.lastLoginAt).toISOString() : null,
          registrationDate: regIso,
          updatedAt: new Date(c.updatedAt).toISOString(),
        });
      });

  const states = Array.from(new Set(enrichedAll.map((c) => c.state).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b)
  );
  const roles = Array.from(new Set(enrichedAll.map((c) => c.role).filter(Boolean))).sort();

  const summary = {
    total: enrichedAll.length,
    active: enrichedAll.filter((c) => c.accountStatus === 'Active').length,
    suspended: enrichedAll.filter((c) => c.accountStatus === 'Suspended').length,
    deactivated: enrichedAll.filter((c) => c.accountStatus === 'Deactivated').length,
    totalRevenueInr: enrichedAll.reduce((acc, c) => acc + c.totalSpentInr, 0),
  };

  const searchNeedle = String(query?.search || '').trim().toLowerCase();
  const statusFilter = String(query?.status || 'all').trim();
  const stateFilter = String(query?.state || 'all').trim();
  const roleFilter = String(query?.role || 'all').trim();
  const regFromStr = String(query?.regFrom || '').trim();
  const regToStr = String(query?.regTo || '').trim();
  const regFromMs = regFromStr ? Date.parse(`${regFromStr}T00:00:00.000Z`) : NaN;
  const regToMs = regToStr ? Date.parse(`${regToStr}T23:59:59.999Z`) : NaN;
  const sortBy = String(query?.sortBy || 'created_at').trim();
  const sortDir = String(query?.sortDir || 'desc').trim().toLowerCase() === 'asc' ? 1 : -1;

  const filtered = enrichedAll.filter((c) => {
    if (statusFilter && statusFilter !== 'all' && c.accountStatus.toLowerCase() !== statusFilter.toLowerCase()) {
      return false;
    }
    if (stateFilter && stateFilter !== 'all' && c.state.toLowerCase() !== stateFilter.toLowerCase()) {
      return false;
    }
    if (roleFilter && roleFilter !== 'all' && c.role.toLowerCase() !== roleFilter.toLowerCase()) {
      return false;
    }
    if (Number.isFinite(regFromMs) || Number.isFinite(regToMs)) {
      const regMs = new Date(c.registrationDate || c.createdAt).getTime();
      if (Number.isFinite(regFromMs) && (!Number.isFinite(regMs) || regMs < regFromMs)) {
        return false;
      }
      if (Number.isFinite(regToMs) && (!Number.isFinite(regMs) || regMs > regToMs)) {
        return false;
      }
    }
    if (searchNeedle) {
      const hay = [
        String(c.id),
        c.customerCode,
        c.fullName,
        c.email,
        c.mobile,
        c.companyOrCollege,
        c.fullAddress,
        c.city,
        c.state,
        c.pinCode,
      ]
        .join(' ')
        .toLowerCase();
      if (!hay.includes(searchNeedle)) return false;
    }
    return true;
  });

  filtered.sort((a, b) => {
    let cmp = 0;
    switch (sortBy) {
      case 'id':
        cmp = a.customerCode.localeCompare(b.customerCode) || String(a.id).localeCompare(String(b.id));
        break;
      case 'full_name':
        cmp = a.fullName.localeCompare(b.fullName);
        break;
      case 'email':
        cmp = a.email.localeCompare(b.email);
        break;
      case 'city':
        cmp = a.city.localeCompare(b.city);
        break;
      case 'state':
        cmp = a.state.localeCompare(b.state);
        break;
      case 'account_status':
        cmp = a.accountStatus.localeCompare(b.accountStatus);
        break;
      case 'last_login':
        cmp =
          (a.lastLoginAt ? new Date(a.lastLoginAt).getTime() : 0) -
          (b.lastLoginAt ? new Date(b.lastLoginAt).getTime() : 0);
        break;
      case 'orders_count':
        cmp = a.ordersCount - b.ordersCount;
        break;
      case 'total_spent':
        cmp = a.totalSpentInr - b.totalSpentInr;
        break;
      case 'created_at':
      default:
        cmp = new Date(a.registrationDate).getTime() - new Date(b.registrationDate).getTime();
        break;
    }
    if (cmp === 0) cmp = String(a.id).localeCompare(String(b.id));
    return cmp * sortDir;
  });

  return {
    source: usingPublic ? 'public.customers' : 'web_platform.customers',
    migrationStatus,
    customers: filtered,
    summary,
    filterOptions: { states, roles },
  };
}

async function upsertDefaultCustomerAddress(
  userId: number,
  data: {
    fullName: string;
    mobile: string;
    fullAddress: string;
    city: string;
    state: string;
    pinCode: string;
  }
) {
  if (!data.fullAddress && !data.city && !data.state && !data.pinCode) return;

  const existingAddresses = await db
    .select()
    .from(customerAddresses)
    .where(eq(customerAddresses.userId, userId))
    .orderBy(desc(customerAddresses.isDefault), desc(customerAddresses.id))
    .limit(1);

  if (existingAddresses.length > 0) {
    const addr = existingAddresses[0];
    await db
      .update(customerAddresses)
      .set({
        fullName: data.fullName || addr.fullName,
        mobile: data.mobile || addr.mobile,
        houseFlat: data.fullAddress || addr.houseFlat,
        streetArea: data.fullAddress ? '' : addr.streetArea,
        city: data.city || addr.city,
        district: data.city || addr.district,
        state: data.state || addr.state,
        pinCode: data.pinCode || addr.pinCode,
        updatedAt: new Date(),
      })
      .where(eq(customerAddresses.id, addr.id));
  } else {
    await db.insert(customerAddresses).values({
      userId,
      label: 'Primary',
      addressType: 'both',
      fullName: data.fullName || 'Customer',
      mobile: data.mobile || '',
      houseFlat: data.fullAddress || data.city || 'Primary Address',
      streetArea: '',
      landmark: '',
      city: data.city || '',
      district: data.city || '',
      state: data.state || '',
      pinCode: data.pinCode || '',
      country: 'India',
      isDefault: true,
    });
  }
}

// 0. GET /api/admin/customers/stream — Real-time Server-Sent Events stream from Supabase public.customers
adminCustomersRouter.get('/stream', requireCustomerPermission('canViewCustomers'), (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  res.write(`event: connected\ndata: ${JSON.stringify({ ok: true, timestamp: new Date().toISOString() })}\n\n`);

  const unsubscribe = subscribeCustomerStream((event) => {
    try {
      res.write(`event: customer_change\ndata: ${JSON.stringify(event)}\n\n`);
    } catch {
      // connection closed
    }
  });

  const keepAlive = setInterval(() => {
    try {
      res.write(`: ping\n\n`);
    } catch {
      // connection closed
    }
  }, 25_000);

  req.on('close', () => {
    clearInterval(keepAlive);
    unsubscribe();
  });
});

// 0b. GET /api/admin/customers/migration-status — Verify public.customers, public.users(id), history tables & customers_user_id_fkey
adminCustomersRouter.get('/migration-status', requireCustomerPermission('canViewCustomers'), async (req, res) => {
  try {
    const forceRefresh = String(req.query.refresh || '').toLowerCase() === 'true';
    await ensureCustomerManagementSchema(forceRefresh);
    const status = await verifyPublicCustomersMigrationStatus(forceRefresh);
    res.json(status);
  } catch (error: any) {
    console.error('Migration status check error:', error);
    res.status(500).json({ error: error?.message || 'Failed to verify database migration status.' });
  }
});

// 0c. GET /api/admin/customers/permissions — Fetch caller's customer management RBAC + Super Admin staff assignment table
adminCustomersRouter.get('/permissions', async (req: AuthRequest, res) => {
  try {
    await ensureCustomerManagementSchema();
    const myPermissions = await getStaffCustomerPermissions({
      id: req.dbUser!.id,
      role: req.dbUser!.role,
    });
    const staff =
      req.dbUser!.role === 'super_admin'
        ? await listStaffWithCustomerPermissions()
        : undefined;
    res.json({ myPermissions, ...(staff ? { staff } : {}) });
  } catch (error: any) {
    console.error('Load customer permissions error:', error);
    res.status(500).json({ error: error?.message || 'Failed to load customer management permissions.' });
  }
});

// 0d. PUT /api/admin/customers/permissions/:userId — Super Admin configures staff/admin customer management permissions
adminCustomersRouter.put('/permissions/:userId', async (req: AuthRequest, res) => {
  try {
    await ensureCustomerManagementSchema();
    if (req.dbUser!.role !== 'super_admin') {
      return res.status(403).json({
        error: 'Only Super Admin can configure customer management permissions.',
      });
    }
    const targetUserId = Number(req.params.userId);
    if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
      return res.status(400).json({ error: 'Invalid staff user ID.' });
    }
    const updated = await setStaffCustomerPermissions({
      targetUserId,
      permissions: {
        canViewCustomers: req.body.canViewCustomers,
        canAddCustomers: req.body.canAddCustomers,
        canEditCustomers: req.body.canEditCustomers,
        canDeactivateCustomers: req.body.canDeactivateCustomers,
        canReactivateCustomers: req.body.canReactivateCustomers,
        canPermanentlyDeleteCustomers: req.body.canPermanentlyDeleteCustomers,
        canViewDeletionHistory: req.body.canViewDeletionHistory,
      },
      grantedByEmail: req.dbUser!.email,
    });

    await logAudit({
      actorUid: req.dbUser!.uid,
      actorEmail: req.dbUser!.email,
      action: 'SUPER_ADMIN_UPDATE_CUSTOMER_PERMISSIONS',
      entityType: 'staff_permission',
      entityId: String(targetUserId),
      details: { ...updated },
    });

    res.json({ ok: true, permissions: updated });
  } catch (error: any) {
    const status = Number(error?.statusCode) || 500;
    res.status(status).json({ error: error?.message || 'Failed to update staff permissions.' });
  }
});

// 0e. GET /api/admin/customers/deletion-history — Anonymized permanent deletion audit log
adminCustomersRouter.get(
  '/deletion-history',
  requireCustomerPermission('canViewDeletionHistory'),
  async (_req, res) => {
    try {
      await ensureCustomerManagementSchema();
      const logs = await db
        .select()
        .from(customerDeletionAuditLogs)
        .orderBy(desc(customerDeletionAuditLogs.createdAt))
        .limit(100);
      res.json({ logs });
    } catch (error: any) {
      console.error('Deletion history error:', error);
      res.status(500).json({ error: error?.message || 'Failed to load deletion audit history.' });
    }
  }
);

// 1. GET /api/admin/customers — List, search, filter, sort customers from public.customers
adminCustomersRouter.get('/', requireCustomerPermission('canViewCustomers'), async (req, res) => {
  try {
    const result = await buildEnrichedCustomers({
      search: String(req.query.search || ''),
      status: String(req.query.status || 'all'),
      state: String(req.query.state || 'all'),
      role: String(req.query.role || 'all'),
      regFrom: String(req.query.regFrom || ''),
      regTo: String(req.query.regTo || ''),
      sortBy: String(req.query.sortBy || 'created_at'),
      sortDir: String(req.query.sortDir || 'desc'),
    });
    const rawPage = req.query.page !== undefined ? Number(req.query.page) : NaN;
    const rawPageSize = req.query.pageSize !== undefined ? Number(req.query.pageSize) : 25;
    const total = result.customers.length;
    if (Number.isInteger(rawPage) && rawPage > 0) {
      const pageSize = Math.min(200, Math.max(1, Number.isInteger(rawPageSize) ? rawPageSize : 25));
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      const page = Math.min(totalPages, rawPage);
      const paged = result.customers.slice((page - 1) * pageSize, page * pageSize);
      return res.json({
        ...result,
        customers: paged,
        pagination: { page, pageSize, total, totalPages },
      });
    }
    res.json({
      ...result,
      pagination: { page: 1, pageSize: Math.max(1, total), total, totalPages: 1 },
    });
  } catch (error) {
    console.error('List customers error:', error);
    res.status(500).json({ error: 'Failed to load customers from Supabase.' });
  }
});

// 2. GET /api/admin/customers/export — Export filtered customer table to CSV or Excel (.xls)
adminCustomersRouter.get('/export', requireCustomerPermission('canViewCustomers'), async (req, res) => {
  try {
    const format = String(req.query.format || 'csv').trim().toLowerCase();
    const { customers: exportList } = await buildEnrichedCustomers({
      search: String(req.query.search || ''),
      status: String(req.query.status || 'all'),
      state: String(req.query.state || 'all'),
      role: String(req.query.role || 'all'),
      regFrom: String(req.query.regFrom || ''),
      regTo: String(req.query.regTo || ''),
      sortBy: String(req.query.sortBy || 'created_at'),
      sortDir: String(req.query.sortDir || 'desc'),
    });

    const headers = [
      'Customer ID',
      'Full Name',
      'Email Address',
      'Phone Number',
      'Company / College',
      'Full Address',
      'City',
      'State',
      'PIN Code',
      'Registration Date',
      'Last Login',
      'Account Status',
      'Total Orders',
      'Total Enquiries',
      'Total Projects',
      'Total Spent (INR)',
    ];

    const rows = exportList.map((c) => [
      c.customerCode,
      c.fullName,
      c.email,
      c.mobile,
      c.companyOrCollege,
      c.fullAddress,
      c.city,
      c.state,
      c.pinCode,
      c.registrationDate.slice(0, 10),
      c.lastLoginAt ? c.lastLoginAt.slice(0, 10) : 'Never',
      c.accountStatus,
      c.ordersCount,
      c.enquiriesCount,
      c.projectsCount,
      c.totalSpentInr,
    ]);

    const dateStamp = new Date().toISOString().slice(0, 10);

    if (format === 'xls' || format === 'excel' || format === 'xlsx') {
      const xml = toExcelSpreadsheetXml('Customers', headers, rows);
      res.setHeader('Content-Type', 'application/vnd.ms-excel; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="nexustekfusion-customers-${dateStamp}.xls"`
      );
      return res.send(xml);
    }

    const csv = `\uFEFF${toSafeCsv(headers, rows)}`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="nexustekfusion-customers-${dateStamp}.csv"`
    );
    res.send(csv);
  } catch (error) {
    console.error('Export customers error:', error);
    res.status(500).json({ error: 'Failed to export customer records.' });
  }
});

// 3. GET /api/admin/customers/:id/profile — Complete Customer Profile & Relational History
adminCustomersRouter.get('/:id/profile', requireCustomerPermission('canViewCustomers'), async (req, res) => {
  try {
    await ensureCustomerManagementSchema();
    const rawKey = String(req.params.id || '').trim();
    if (!rawKey) {
      return res.status(400).json({ error: 'Invalid customer ID.' });
    }

    const publicReady = await isPublicCustomersSchemaReady();
    let custData: {
      id: string | number;
      customerId: string;
      authUserId: string | null;
      webUserId: number | null;
      fullName: string;
      email: string;
      phoneNumber: string;
      companyOrCollege: string;
      fullAddress: string;
      city: string;
      state: string;
      pinCode: string;
      accountStatus: string;
      statusReason: string;
      lastLoginAt: string | null;
      registrationDate: string;
      updatedAt: string;
    } | null = null;

    if (publicReady) {
      const pub = await findPublicCustomerByKey(rawKey);
      if (pub) {
        custData = {
          id: pub.id,
          customerId: pub.customerId,
          authUserId: pub.authUserId,
          webUserId: pub.webUserId,
          fullName: pub.fullName,
          email: pub.email,
          phoneNumber: pub.phoneNumber,
          companyOrCollege: pub.companyOrCollege,
          fullAddress: pub.fullAddress,
          city: pub.city,
          state: pub.state,
          pinCode: pub.pinCode,
          accountStatus: pub.accountStatus,
          statusReason: pub.statusReason,
          lastLoginAt: pub.lastLoginAt,
          registrationDate: pub.registrationDate,
          updatedAt: pub.updatedAt,
        };
      }
    } else {
      const numId = Number(rawKey);
      const [custRow] = Number.isInteger(numId) && numId > 0
        ? await db.select().from(customers).where(and(eq(customers.id, numId), isNull(customers.deletedAt))).limit(1)
        : await db.select().from(customers).where(and(eq(customers.customerId, rawKey), isNull(customers.deletedAt))).limit(1);
      if (custRow) {
        const regIso = new Date(custRow.registrationDate || custRow.createdAt).toISOString();
        custData = {
          id: custRow.id,
          customerId: custRow.customerId || formatCustomerCode(custRow.id),
          authUserId: null,
          webUserId: custRow.userId,
          fullName: custRow.fullName || '',
          email: custRow.email,
          phoneNumber: custRow.phoneNumber || '',
          companyOrCollege: custRow.companyOrCollege || '',
          fullAddress: custRow.fullAddress || '',
          city: custRow.city || '',
          state: custRow.state || '',
          pinCode: custRow.pinCode || '',
          accountStatus: custRow.accountStatus || 'Active',
          statusReason: custRow.statusReason || '',
          lastLoginAt: custRow.lastLoginAt ? new Date(custRow.lastLoginAt).toISOString() : null,
          registrationDate: regIso,
          updatedAt: new Date(custRow.updatedAt).toISOString(),
        };
      }
    }

    if (!custData) {
      return res.status(404).json({ error: 'Customer record not found.' });
    }

    const emailLower = normalizeEmail(custData.email);
    let linkedUser: typeof users.$inferSelect | undefined;
    if (custData.webUserId) {
      const [u] = await db.select().from(users).where(eq(users.id, custData.webUserId)).limit(1);
      linkedUser = u;
    }
    if (!linkedUser && custData.customerId) {
      const [uByCode] = await db
        .select()
        .from(users)
        .where(and(eq(users.uid, custData.customerId), isNull(users.deletedAt)))
        .limit(1);
      linkedUser = uByCode;
    }
    if (!linkedUser) {
      const [uByEmail] = await db
        .select()
        .from(users)
        .where(and(sql`lower(${users.email}) = ${emailLower}`, isNull(users.deletedAt)))
        .limit(1);
      if (uByEmail && !uByEmail.uid.startsWith('NTF-CUST-')) {
        linkedUser = uByEmail;
      }
    }

    const uidForQuery = linkedUser?.id;

    const [
      addresses,
      custStoreOrders,
      custPrintOrders,
      custProjectEnquiries,
      custProjects,
      custProductEnquiries,
      custPcbEnquiries,
      custB2bEnquiries,
      custDroneRepairs,
      custPayments,
      custInvoices,
      custTickets,
      custReviewsRaw,
      allProdsMinimal,
      custActivityRows,
      recentAudits,
    ] = await Promise.all([
      uidForQuery
        ? db
            .select()
            .from(customerAddresses)
            .where(eq(customerAddresses.userId, uidForQuery))
            .orderBy(desc(customerAddresses.isDefault), desc(customerAddresses.id))
        : Promise.resolve([]),
      uidForQuery
        ? db
            .select()
            .from(storeOrders)
            .where(and(eq(storeOrders.userId, uidForQuery), eq(storeOrders.isDeleted, false)))
            .orderBy(desc(storeOrders.createdAt))
        : Promise.resolve([]),
      uidForQuery
        ? db
            .select()
            .from(printingOrders)
            .where(eq(printingOrders.userId, uidForQuery))
            .orderBy(desc(printingOrders.createdAt))
        : Promise.resolve([]),
      db
        .select()
        .from(projectEnquiries)
        .where(
          and(
            eq(projectEnquiries.isDeleted, false),
            uidForQuery
              ? or(eq(projectEnquiries.userId, uidForQuery), sql`lower(${projectEnquiries.customerEmail}) = ${emailLower}`)
              : sql`lower(${projectEnquiries.customerEmail}) = ${emailLower}`
          )
        )
        .orderBy(desc(projectEnquiries.createdAt)),
      uidForQuery
        ? db
            .select()
            .from(projects)
            .where(and(eq(projects.userId, uidForQuery), eq(projects.isDeleted, false)))
            .orderBy(desc(projects.createdAt))
        : Promise.resolve([]),
      db
        .select()
        .from(productEnquiries)
        .where(
          uidForQuery
            ? or(eq(productEnquiries.userId, uidForQuery), sql`lower(${productEnquiries.email}) = ${emailLower}`)
            : sql`lower(${productEnquiries.email}) = ${emailLower}`
        )
        .orderBy(desc(productEnquiries.createdAt)),
      db
        .select()
        .from(pcbEnquiries)
        .where(
          uidForQuery
            ? or(eq(pcbEnquiries.userId, uidForQuery), sql`lower(${pcbEnquiries.email}) = ${emailLower}`)
            : sql`lower(${pcbEnquiries.email}) = ${emailLower}`
        )
        .orderBy(desc(pcbEnquiries.createdAt)),
      db
        .select()
        .from(b2bEnquiries)
        .where(
          uidForQuery
            ? or(eq(b2bEnquiries.userId, uidForQuery), sql`lower(${b2bEnquiries.email}) = ${emailLower}`)
            : sql`lower(${b2bEnquiries.email}) = ${emailLower}`
        )
        .orderBy(desc(b2bEnquiries.createdAt)),
      db
        .select()
        .from(droneRepairBookings)
        .where(
          uidForQuery
            ? or(eq(droneRepairBookings.userId, uidForQuery), sql`lower(${droneRepairBookings.email}) = ${emailLower}`)
            : sql`lower(${droneRepairBookings.email}) = ${emailLower}`
        )
        .orderBy(desc(droneRepairBookings.createdAt)),
      uidForQuery
        ? db.select().from(payments).where(eq(payments.userId, uidForQuery)).orderBy(desc(payments.createdAt))
        : Promise.resolve([]),
      uidForQuery
        ? db
            .select()
            .from(invoices)
            .where(and(eq(invoices.userId, uidForQuery), eq(invoices.isDeleted, false)))
            .orderBy(desc(invoices.issuedAt))
        : Promise.resolve([]),
      db
        .select()
        .from(supportTickets)
        .where(
          uidForQuery
            ? or(eq(supportTickets.userId, uidForQuery), sql`lower(${supportTickets.email}) = ${emailLower}`)
            : sql`lower(${supportTickets.email}) = ${emailLower}`
        )
        .orderBy(desc(supportTickets.createdAt)),
      uidForQuery
        ? db.select().from(productReviews).where(eq(productReviews.userId, uidForQuery)).orderBy(desc(productReviews.createdAt))
        : Promise.resolve([]),
      db.select({ id: products.id, name: products.name, sku: products.sku, slug: products.slug }).from(products),
      db
        .select()
        .from(customerActivityLogs)
        .where(
          uidForQuery
            ? or(
                eq(customerActivityLogs.userId, uidForQuery),
                eq(customerActivityLogs.customerId, custData.customerId),
                sql`lower(${customerActivityLogs.email}) = ${emailLower}`
              )
            : or(
                eq(customerActivityLogs.customerId, custData.customerId),
                sql`lower(${customerActivityLogs.email}) = ${emailLower}`
              )
        )
        .orderBy(desc(customerActivityLogs.createdAt))
        .limit(60),
      db
        .select()
        .from(auditLogs)
        .where(
          or(
            and(
              or(eq(auditLogs.entityType, 'customer'), eq(auditLogs.entityType, 'user')),
              eq(auditLogs.entityId, String(custData.id))
            ),
            eq(auditLogs.actorUid, custData.customerId)
          )
        )
        .orderBy(desc(auditLogs.createdAt))
        .limit(40),
    ]);

    const prodById = new Map(allProdsMinimal.map((p) => [p.id, p]));
    const custReviews = custReviewsRaw.map((r) => {
      const p = prodById.get(r.productId);
      return {
        ...r,
        productName: p?.name || `Product #${r.productId}`,
        productSku: p?.sku || '',
        productSlug: p?.slug || '',
      };
    });

    const defaultAddr = addresses[0];
    const addrLine = defaultAddr
      ? [defaultAddr.houseFlat, defaultAddr.streetArea, defaultAddr.landmark]
          .map((s) => String(s || '').trim())
          .filter(Boolean)
          .join(', ')
      : '';

    const totalSpentInr = custPayments
      .filter((p) => p.status === 'verified')
      .reduce((sum, p) => sum + (p.amountInr || 0), 0);

    const totalEnquiriesCount =
      custProductEnquiries.length + custPcbEnquiries.length + custB2bEnquiries.length + custTickets.length;

    res.json({
      customer: {
        id: custData.id,
        userId: uidForQuery ?? null,
        authUserId: custData.authUserId || linkedUser?.authUserId || null,
        customerCode: custData.customerId,
        uid: custData.customerId,
        fullName: custData.fullName || '',
        email: custData.email,
        mobile: custData.phoneNumber || linkedUser?.mobile || '',
        companyOrCollege: custData.companyOrCollege || '',
        fullAddress: String(custData.fullAddress || '').trim() || addrLine || '',
        city: String(custData.city || '').trim() || defaultAddr?.city || '',
        state: String(custData.state || '').trim() || defaultAddr?.state || '',
        pinCode: String(custData.pinCode || '').trim() || defaultAddr?.pinCode || '',
        role: linkedUser?.role || 'customer',
        accountStatus: custData.accountStatus || 'Active',
        statusReason: custData.statusReason || '',
        emailVerified: Boolean(linkedUser?.emailVerified),
        phoneVerified: Boolean(linkedUser?.phoneVerified),
        isActive: custData.accountStatus === 'Active',
        lastLoginAt: custData.lastLoginAt,
        registrationDate: custData.registrationDate,
        createdAt: custData.registrationDate,
        updatedAt: custData.updatedAt,
        totalSpentInr,
        ordersCount: custStoreOrders.length + custPrintOrders.length,
        projectsCount: custProjectEnquiries.length,
        enquiriesCount: totalEnquiriesCount,
      },
      addresses,
      storeOrders: custStoreOrders,
      printingOrders: custPrintOrders,
      projectEnquiries: custProjectEnquiries,
      projects: custProjects,
      productEnquiries: custProductEnquiries,
      pcbEnquiries: custPcbEnquiries,
      b2bEnquiries: custB2bEnquiries,
      droneRepairs: custDroneRepairs,
      payments: custPayments,
      invoices: custInvoices,
      supportTickets: custTickets,
      reviews: custReviews,
      customerActivityLogs: custActivityRows,
      activityLogs: recentAudits,
    });
  } catch (error) {
    console.error('Get customer profile error:', error);
    res.status(500).json({ error: 'Failed to load complete customer profile.' });
  }
});

// 4. POST /api/admin/customers — Add New Customer Profile (Passwordless OTP Model; allows shared mobile/email)
adminCustomersRouter.post(
  '/',
  requireCustomerPermission('canAddCustomers'),
  async (req: AuthRequest, res) => {
    try {
      await ensureCustomerManagementSchema();

      const cleanFullName = String(req.body.fullName || '').trim();
      const cleanEmail = normalizeEmail(req.body.email);
      const cleanMobile = normalizeMobile(req.body.mobile);
      const cleanCompany = String(req.body.companyOrCollege || '').trim();
      const cleanFullAddress = String(req.body.fullAddress || '').trim();
      const cleanCity = String(req.body.city || '').trim();
      const cleanState = String(req.body.state || '').trim();
      const cleanPinCode = String(req.body.pinCode || '').trim();
      const rawStatus = String(req.body.accountStatus || 'Active').trim();
      const accountStatus = VALID_ACCOUNT_STATUSES.has(rawStatus) ? rawStatus : 'Active';

      if (!cleanFullName || cleanFullName.length < 2) {
        return res.status(400).json({ error: 'Full name is required (minimum 2 characters).' });
      }
      if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        return res.status(400).json({ error: 'Please enter a valid email address.' });
      }
      if (cleanMobile && !/^\+?\d{10,15}$/.test(cleanMobile)) {
        return res.status(400).json({ error: 'Please enter a valid 10-15 digit phone number.' });
      }
      if (cleanPinCode && !/^[0-9]{4,10}$/.test(cleanPinCode)) {
        return res.status(400).json({ error: 'PIN Code must be 4 to 10 digits.' });
      }

      const publicReady = await isPublicCustomersSchemaReady();
      const hasRealPostgres = Boolean(createPool());
      const now = new Date();

      // Link to existing verified Supabase Auth identity if already present (NEVER create passwords or duplicate auth identities)
      const existingAuthUserId = await findSupabaseAuthUserIdByEmail(cleanEmail).catch(() => null);
      const customerCode = await generateNextCustomerCodeFromDb();

      // Create an isolated web_platform.users row scoped strictly to this customer profile
      const [linkedUser] = await db
        .insert(users)
        .values({
          uid: customerCode,
          authUserId: existingAuthUserId,
          email: cleanEmail,
          fullName: cleanFullName,
          mobile: cleanMobile,
          companyOrCollege: cleanCompany,
          fullAddress: cleanFullAddress,
          city: cleanCity,
          state: cleanState,
          pinCode: cleanPinCode,
          role: 'customer',
          passwordHash: null,
          emailVerified: Boolean(existingAuthUserId),
          phoneVerified: false,
          emailConfirmedAt: existingAuthUserId ? now.toISOString() : '',
          phoneConfirmedAt: '',
          accountStatus,
          statusReason: accountStatus !== 'Active' ? 'Set during Admin customer creation' : '',
          isActive: accountStatus === 'Active',
        })
        .returning();

      let createdId: string | number;
      let createdCode = customerCode;
      try {
        let createdPub: PublicCustomerRecord | null = null;
        if (publicReady) {
          try {
            createdPub = await createPublicCustomerRecord({
              customerId: customerCode,
              authUserId: existingAuthUserId,
              userUid: customerCode,
              ...(hasRealPostgres ? { webUserId: linkedUser.id } : {}),
              fullName: cleanFullName,
              email: cleanEmail,
              phoneNumber: cleanMobile,
              companyOrCollege: cleanCompany,
              fullAddress: cleanFullAddress,
              city: cleanCity,
              state: cleanState,
              pinCode: cleanPinCode,
              accountStatus,
              statusReason: accountStatus !== 'Active' ? 'Set during Admin customer creation' : '',
              emailVerified: Boolean(existingAuthUserId),
              registrationDate: now,
            });
          } catch (pubErr: any) {
            if (/customer_profiles/i.test(String(pubErr?.message || ''))) {
              console.warn('Admin add customer Supabase trigger fallback:', pubErr?.message);
            } else {
              throw pubErr;
            }
          }
        }

        if (createdPub) {
          createdId = createdPub.id;
          createdCode = createdPub.customerId;
        } else {
          const [inserted] = await db
            .insert(customers)
            .values({
              customerId: customerCode,
              userId: linkedUser.id,
              authUserId: existingAuthUserId,
              fullName: cleanFullName,
              email: cleanEmail,
              phoneNumber: cleanMobile,
              companyOrCollege: cleanCompany,
              fullAddress: cleanFullAddress,
              city: cleanCity,
              state: cleanState,
              pinCode: cleanPinCode,
              passwordHash: '',
              emailVerified: Boolean(existingAuthUserId),
              accountStatus,
              statusReason: accountStatus !== 'Active' ? 'Set during Admin customer creation' : '',
              registrationDate: now,
            })
            .returning();
          createdId = inserted.id;
          createdCode = inserted.customerId;
        }

        await upsertDefaultCustomerAddress(linkedUser.id, {
          fullName: cleanFullName,
          mobile: cleanMobile,
          fullAddress: cleanFullAddress,
          city: cleanCity,
          state: cleanState,
          pinCode: cleanPinCode,
        });

        await recordCustomerIdHistory({
          customerDbId: String(createdId),
          authUserId: existingAuthUserId,
          email: cleanEmail,
          previousCustomerId: null,
          newCustomerId: createdCode,
          newAccountStatus: accountStatus,
          operationType: 'admin_create',
          reason: 'Created from Admin Customer Management Panel',
          changedBy: req.dbUser!.email,
        });
      } catch (custErr: any) {
        await db.delete(customerAddresses).where(eq(customerAddresses.userId, linkedUser.id)).catch(() => {});
        await db.delete(users).where(eq(users.id, linkedUser.id)).catch(() => {});
        throw custErr;
      }

      await logAudit({
        actorUid: req.dbUser!.uid,
        actorEmail: req.dbUser!.email,
        action: 'ADMIN_CREATE_CUSTOMER',
        entityType: 'customer',
        entityId: String(createdId),
        details: {
          customerCode: createdCode,
          email: cleanEmail,
          accountStatus,
          linkedExistingAuth: Boolean(existingAuthUserId),
        },
      });

      const { customers: list } = await buildEnrichedCustomers({ search: createdCode });
      const enriched = list.find((c) => String(c.id) === String(createdId));
      res.status(201).json({ customer: enriched || { id: createdId, customerCode: createdCode, email: cleanEmail } });
    } catch (error: any) {
      console.error('Create customer error:', error);
      res.status(500).json({ error: error?.message || 'Failed to add new customer.' });
    }
  }
);

// 5. PATCH /api/admin/customers/:id — Edit Customer (No passwords; allows shared email/mobile across profiles)
adminCustomersRouter.patch(
  '/:id',
  requireCustomerPermission('canEditCustomers'),
  async (req: AuthRequest, res) => {
    try {
      await ensureCustomerManagementSchema();

      const rawKey = String(req.params.id || '').trim();
      if (!rawKey) {
        return res.status(400).json({ error: 'Invalid customer ID.' });
      }

      const publicReady = await isPublicCustomersSchemaReady();
      const actorPerms = await getStaffCustomerPermissions({
        id: req.dbUser!.id,
        role: req.dbUser!.role,
      });

      if (publicReady) {
        const existing = await findPublicCustomerByKey(rawKey);
        if (!existing) {
          return res.status(404).json({ error: 'Customer record not found in Supabase public.customers.' });
        }

        const cleanFullName =
          req.body.fullName !== undefined ? String(req.body.fullName || '').trim() : existing.fullName;
        const cleanEmail =
          req.body.email !== undefined ? normalizeEmail(req.body.email) : normalizeEmail(existing.email);
        const cleanMobile =
          req.body.mobile !== undefined ? normalizeMobile(req.body.mobile) : existing.phoneNumber;
        const cleanCompany =
          req.body.companyOrCollege !== undefined
            ? String(req.body.companyOrCollege || '').trim()
            : existing.companyOrCollege;
        const cleanFullAddress =
          req.body.fullAddress !== undefined
            ? String(req.body.fullAddress || '').trim()
            : existing.fullAddress;
        const cleanCity = req.body.city !== undefined ? String(req.body.city || '').trim() : existing.city;
        const cleanState = req.body.state !== undefined ? String(req.body.state || '').trim() : existing.state;
        const cleanPinCode =
          req.body.pinCode !== undefined ? String(req.body.pinCode || '').trim() : existing.pinCode;
        const requestedStatus =
          req.body.accountStatus !== undefined
            ? String(req.body.accountStatus || '').trim()
            : existing.accountStatus;
        const statusReason =
          req.body.statusReason !== undefined
            ? String(req.body.statusReason || '').trim()
            : existing.statusReason;

        if (!cleanFullName || cleanFullName.length < 2) {
          return res.status(400).json({ error: 'Full name must be at least 2 characters.' });
        }
        if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
          return res.status(400).json({ error: 'Please enter a valid email address.' });
        }
        if (cleanMobile && !/^\+?\d{10,15}$/.test(cleanMobile)) {
          return res.status(400).json({ error: 'Please enter a valid 10-15 digit phone number.' });
        }
        if (cleanPinCode && !/^[0-9]{4,10}$/.test(cleanPinCode)) {
          return res.status(400).json({ error: 'PIN Code must be 4 to 10 digits.' });
        }
        if (!VALID_ACCOUNT_STATUSES.has(requestedStatus)) {
          return res.status(400).json({ error: 'Account Status must be Active, Suspended, or Deactivated.' });
        }

        if (requestedStatus !== existing.accountStatus) {
          if (requestedStatus === 'Active' && !actorPerms.canReactivateCustomers) {
            return res.status(403).json({ error: 'You do not have permission to reactivate customers.' });
          }
          if (requestedStatus !== 'Active' && !actorPerms.canDeactivateCustomers) {
            return res.status(403).json({ error: 'You do not have permission to deactivate/suspend customers.' });
          }
        }

        const authUserIdForEmail =
          cleanEmail !== normalizeEmail(existing.email)
            ? await findSupabaseAuthUserIdByEmail(cleanEmail).catch(() => null)
            : existing.authUserId;

        const updatedPub = await updatePublicCustomerRecord(existing.id, {
          fullName: cleanFullName,
          email: cleanEmail,
          ...(authUserIdForEmail !== existing.authUserId ? { authUserId: authUserIdForEmail } : {}),
          phoneNumber: cleanMobile,
          companyOrCollege: cleanCompany,
          fullAddress: cleanFullAddress,
          city: cleanCity,
          state: cleanState,
          pinCode: cleanPinCode,
          accountStatus: requestedStatus,
          statusReason: requestedStatus === 'Active' ? '' : statusReason,
        });

        if (!updatedPub) {
          return res.status(500).json({ error: 'Failed to update customer in Supabase public.customers.' });
        }

        const syncedUser = await syncLocalWebUserFromPublicCustomer(updatedPub);
        const targetUserId = syncedUser?.id ?? existing.webUserId;

        if (
          targetUserId &&
          (req.body.fullAddress !== undefined ||
            req.body.city !== undefined ||
            req.body.state !== undefined ||
            req.body.pinCode !== undefined)
        ) {
          await upsertDefaultCustomerAddress(targetUserId, {
            fullName: cleanFullName,
            mobile: cleanMobile,
            fullAddress: cleanFullAddress,
            city: cleanCity,
            state: cleanState,
            pinCode: cleanPinCode,
          });
        }

        if (requestedStatus !== 'Active' && targetUserId) {
          await db.delete(adminSessions).where(eq(adminSessions.userId, targetUserId)).catch(() => {});
        }

        await logAudit({
          actorUid: req.dbUser!.uid,
          actorEmail: req.dbUser!.email,
          action:
            requestedStatus !== existing.accountStatus
              ? `ADMIN_${requestedStatus.toUpperCase()}_CUSTOMER`
              : 'ADMIN_UPDATE_CUSTOMER',
          entityType: 'customer',
          entityId: updatedPub.id,
          details: {
            customerCode: updatedPub.customerId,
            email: updatedPub.email,
            accountStatus: updatedPub.accountStatus,
            city: updatedPub.city,
            state: updatedPub.state,
          },
        });

        const { customers: list } = await buildEnrichedCustomers({ search: updatedPub.customerId });
        const enriched = list.find((c) => String(c.id) === String(updatedPub.id));
        return res.json({ customer: enriched || updatedPub });
      }

      // Local Drizzle fallback when Supabase public.customers is not configured
      const numId = Number(rawKey);
      const [existing] = Number.isInteger(numId) && numId > 0
        ? await db.select().from(customers).where(and(eq(customers.id, numId), isNull(customers.deletedAt))).limit(1)
        : await db.select().from(customers).where(and(eq(customers.customerId, rawKey.toUpperCase()), isNull(customers.deletedAt))).limit(1);

      if (!existing) {
        return res.status(404).json({ error: 'Customer record not found.' });
      }
      const id = existing.id;

      const cleanFullName =
        req.body.fullName !== undefined ? String(req.body.fullName || '').trim() : existing.fullName;
      const cleanEmail =
        req.body.email !== undefined ? normalizeEmail(req.body.email) : normalizeEmail(existing.email);
      const cleanMobile =
        req.body.mobile !== undefined ? normalizeMobile(req.body.mobile) : existing.phoneNumber;
      const cleanCompany =
        req.body.companyOrCollege !== undefined
          ? String(req.body.companyOrCollege || '').trim()
          : existing.companyOrCollege;
      const cleanFullAddress =
        req.body.fullAddress !== undefined
          ? String(req.body.fullAddress || '').trim()
          : existing.fullAddress;
      const cleanCity = req.body.city !== undefined ? String(req.body.city || '').trim() : existing.city;
      const cleanState = req.body.state !== undefined ? String(req.body.state || '').trim() : existing.state;
      const cleanPinCode =
        req.body.pinCode !== undefined ? String(req.body.pinCode || '').trim() : existing.pinCode;
      const requestedStatus =
        req.body.accountStatus !== undefined
          ? String(req.body.accountStatus || '').trim()
          : existing.accountStatus;
      const statusReason =
        req.body.statusReason !== undefined
          ? String(req.body.statusReason || '').trim()
          : existing.statusReason;

      if (!cleanFullName || cleanFullName.length < 2) {
        return res.status(400).json({ error: 'Full name must be at least 2 characters.' });
      }
      if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        return res.status(400).json({ error: 'Please enter a valid email address.' });
      }
      if (cleanMobile && !/^\+?\d{10,15}$/.test(cleanMobile)) {
        return res.status(400).json({ error: 'Please enter a valid 10-15 digit phone number.' });
      }
      if (cleanPinCode && !/^[0-9]{4,10}$/.test(cleanPinCode)) {
        return res.status(400).json({ error: 'PIN Code must be 4 to 10 digits.' });
      }
      if (!VALID_ACCOUNT_STATUSES.has(requestedStatus)) {
        return res.status(400).json({ error: 'Account Status must be Active, Suspended, or Deactivated.' });
      }

      if (requestedStatus !== existing.accountStatus) {
        if (requestedStatus === 'Active' && !actorPerms.canReactivateCustomers) {
          return res.status(403).json({ error: 'You do not have permission to reactivate customers.' });
        }
        if (requestedStatus !== 'Active' && !actorPerms.canDeactivateCustomers) {
          return res.status(403).json({ error: 'You do not have permission to deactivate/suspend customers.' });
        }
      }

      const now = new Date();
      const [updatedCust] = await db
        .update(customers)
        .set({
          fullName: cleanFullName,
          email: cleanEmail,
          phoneNumber: cleanMobile,
          companyOrCollege: cleanCompany,
          fullAddress: cleanFullAddress,
          city: cleanCity,
          state: cleanState,
          pinCode: cleanPinCode,
          accountStatus: requestedStatus,
          statusReason: requestedStatus === 'Active' ? '' : statusReason,
          updatedAt: now,
        })
        .where(eq(customers.id, id))
        .returning();

      let targetUserId = existing.userId;
      if (!targetUserId && existing.customerId) {
        const [uByCode] = await db
          .select({ id: users.id })
          .from(users)
          .where(and(eq(users.uid, existing.customerId), isNull(users.deletedAt)))
          .limit(1);
        if (uByCode) targetUserId = uByCode.id;
      }

      if (targetUserId) {
        await db
          .update(users)
          .set({
            fullName: cleanFullName,
            email: cleanEmail,
            mobile: cleanMobile,
            companyOrCollege: cleanCompany,
            fullAddress: cleanFullAddress,
            city: cleanCity,
            state: cleanState,
            pinCode: cleanPinCode,
            accountStatus: requestedStatus,
            statusReason: requestedStatus === 'Active' ? '' : statusReason,
            isActive: requestedStatus === 'Active',
            updatedAt: now,
          })
          .where(eq(users.id, targetUserId));

        if (!existing.userId) {
          await db
            .update(customers)
            .set({ userId: targetUserId, updatedAt: now })
            .where(eq(customers.id, id));
        }

        if (
          req.body.fullAddress !== undefined ||
          req.body.city !== undefined ||
          req.body.state !== undefined ||
          req.body.pinCode !== undefined
        ) {
          await upsertDefaultCustomerAddress(targetUserId, {
            fullName: cleanFullName,
            mobile: cleanMobile,
            fullAddress: cleanFullAddress,
            city: cleanCity,
            state: cleanState,
            pinCode: cleanPinCode,
          });
        }

        if (requestedStatus !== 'Active') {
          await db.delete(adminSessions).where(eq(adminSessions.userId, targetUserId));
        }
      }

      await logAudit({
        actorUid: req.dbUser!.uid,
        actorEmail: req.dbUser!.email,
        action:
          requestedStatus !== existing.accountStatus
            ? `ADMIN_${requestedStatus.toUpperCase()}_CUSTOMER`
            : 'ADMIN_UPDATE_CUSTOMER',
        entityType: 'customer',
        entityId: id,
        details: {
          customerCode: updatedCust.customerId,
          email: updatedCust.email,
          accountStatus: updatedCust.accountStatus,
          city: updatedCust.city,
          state: updatedCust.state,
        },
      });

      const { customers: list } = await buildEnrichedCustomers({ search: updatedCust.customerId });
      const enriched = list.find((c) => Number(c.id) === id);
      res.json({ customer: enriched || updatedCust });
    } catch (error: any) {
      console.error('Update customer error:', error);
      res.status(500).json({ error: error?.message || 'Failed to update customer details.' });
    }
  }
);

// Helper to transition customer Active <-> Deactivated safely (preserves all records & financial history)
async function setCustomerActivationStatus(opts: {
  rawKey: string;
  targetStatus: 'Active' | 'Deactivated';
  reason: string;
  actor: { id: number; uid: string; email: string };
}) {
  const publicReady = await isPublicCustomersSchemaReady();
  const now = new Date();

  if (publicReady) {
    const existing = await findPublicCustomerByKey(opts.rawKey);
    if (!existing) {
      return null;
    }
    if (opts.targetStatus === 'Deactivated' && existing.webUserId === opts.actor.id) {
      throw new Error('You cannot deactivate your own active session account.');
    }

    const updated = await updatePublicCustomerRecord(existing.id, {
      accountStatus: opts.targetStatus,
      statusReason: opts.targetStatus === 'Active' ? '' : opts.reason,
    });
    if (!updated) throw new Error('Failed to update customer account status in Supabase.');

    const syncedUser = await syncLocalWebUserFromPublicCustomer(updated);
    const targetUserId = syncedUser?.id ?? existing.webUserId;
    if (targetUserId && opts.targetStatus !== 'Active') {
      await db.delete(adminSessions).where(eq(adminSessions.userId, targetUserId)).catch(() => {});
    }

    await recordCustomerIdHistory({
      customerDbId: existing.id,
      authUserId: existing.authUserId,
      email: existing.email,
      previousCustomerId: existing.customerId,
      newCustomerId: existing.customerId,
      previousAccountStatus: existing.accountStatus,
      newAccountStatus: opts.targetStatus,
      operationType: opts.targetStatus === 'Active' ? 'admin_reactivate' : 'admin_deactivate',
      reason: opts.reason,
      changedBy: opts.actor.email,
    });

    await logAudit({
      actorUid: opts.actor.uid,
      actorEmail: opts.actor.email,
      action: opts.targetStatus === 'Active' ? 'ADMIN_REACTIVATE_CUSTOMER' : 'ADMIN_DEACTIVATE_CUSTOMER',
      entityType: 'customer',
      entityId: existing.id,
      details: {
        customerCode: existing.customerId,
        email: existing.email,
        reason: opts.reason,
      },
    });

    return { id: existing.id, customerCode: existing.customerId, accountStatus: opts.targetStatus };
  }

  const numId = Number(opts.rawKey);
  const [existing] = Number.isInteger(numId) && numId > 0
    ? await db.select().from(customers).where(and(eq(customers.id, numId), isNull(customers.deletedAt))).limit(1)
    : await db.select().from(customers).where(and(eq(customers.customerId, opts.rawKey.toUpperCase()), isNull(customers.deletedAt))).limit(1);

  if (!existing) return null;
  if (opts.targetStatus === 'Deactivated' && existing.userId === opts.actor.id) {
    throw new Error('You cannot deactivate your own active session account.');
  }

  await db
    .update(customers)
    .set({
      accountStatus: opts.targetStatus,
      statusReason: opts.targetStatus === 'Active' ? '' : opts.reason,
      updatedAt: now,
    })
    .where(eq(customers.id, existing.id));

  let targetUserId = existing.userId;
  if (!targetUserId && existing.customerId) {
    const [uByCode] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.uid, existing.customerId), isNull(users.deletedAt)))
      .limit(1);
    if (uByCode) targetUserId = uByCode.id;
  }

  if (targetUserId) {
    await db
      .update(users)
      .set({
        accountStatus: opts.targetStatus,
        isActive: opts.targetStatus === 'Active',
        statusReason: opts.targetStatus === 'Active' ? '' : opts.reason,
        updatedAt: now,
      })
      .where(eq(users.id, targetUserId));

    if (opts.targetStatus !== 'Active') {
      await db.delete(adminSessions).where(eq(adminSessions.userId, targetUserId)).catch(() => {});
    }
  }

  await recordCustomerIdHistory({
    customerDbId: String(existing.id),
    authUserId: existing.authUserId,
    email: existing.email,
    previousCustomerId: existing.customerId,
    newCustomerId: existing.customerId,
    previousAccountStatus: existing.accountStatus,
    newAccountStatus: opts.targetStatus,
    operationType: opts.targetStatus === 'Active' ? 'admin_reactivate' : 'admin_deactivate',
    reason: opts.reason,
    changedBy: opts.actor.email,
  });

  await logAudit({
    actorUid: opts.actor.uid,
    actorEmail: opts.actor.email,
    action: opts.targetStatus === 'Active' ? 'ADMIN_REACTIVATE_CUSTOMER' : 'ADMIN_DEACTIVATE_CUSTOMER',
    entityType: 'customer',
    entityId: existing.id,
    details: {
      customerCode: existing.customerId,
      email: existing.email,
      reason: opts.reason,
    },
  });

  return { id: existing.id, customerCode: existing.customerId, accountStatus: opts.targetStatus };
}

// 6a. POST /api/admin/customers/:id/deactivate — Deactivate Customer (disables access, preserves all history)
adminCustomersRouter.post(
  '/:id/deactivate',
  requireCustomerPermission('canDeactivateCustomers'),
  async (req: AuthRequest, res) => {
    try {
      await ensureCustomerManagementSchema();
      const rawKey = String(req.params.id || '').trim();
      if (!rawKey) return res.status(400).json({ error: 'Invalid customer ID.' });

      const reason =
        String(req.body?.reason || '').trim() || 'Deactivated by authorized administrator';
      const result = await setCustomerActivationStatus({
        rawKey,
        targetStatus: 'Deactivated',
        reason,
        actor: req.dbUser!,
      });
      if (!result) return res.status(404).json({ error: 'Customer not found.' });
      res.json({ ok: true, ...result });
    } catch (error: any) {
      res.status(400).json({ error: error?.message || 'Failed to deactivate customer.' });
    }
  }
);

// 6b. POST /api/admin/customers/:id/reactivate — Restore Deactivated Customer
adminCustomersRouter.post(
  '/:id/reactivate',
  requireCustomerPermission('canReactivateCustomers'),
  async (req: AuthRequest, res) => {
    try {
      await ensureCustomerManagementSchema();
      const rawKey = String(req.params.id || '').trim();
      if (!rawKey) return res.status(400).json({ error: 'Invalid customer ID.' });

      const reason =
        String(req.body?.reason || '').trim() || 'Restored to Active by authorized administrator';
      const result = await setCustomerActivationStatus({
        rawKey,
        targetStatus: 'Active',
        reason,
        actor: req.dbUser!,
      });
      if (!result) return res.status(404).json({ error: 'Customer not found.' });
      res.json({ ok: true, ...result });
    } catch (error: any) {
      res.status(400).json({ error: error?.message || 'Failed to reactivate customer.' });
    }
  }
);

// 6c. GET /api/admin/customers/:id/deletion-preview — Inspect all affected vs preserved records before permanent deletion
adminCustomersRouter.get(
  '/:id/deletion-preview',
  requireCustomerPermission('canPermanentlyDeleteCustomers'),
  async (req: AuthRequest, res) => {
    try {
      await ensureCustomerManagementSchema();
      if (!['super_admin', 'admin'].includes(req.dbUser!.role)) {
        return res.status(403).json({ error: 'Employees are never permitted to permanently delete customers.' });
      }
      const rawKey = String(req.params.id || '').trim();
      if (!rawKey) return res.status(400).json({ error: 'Invalid customer ID.' });

      const preview = await getCustomerDeletionPreview(rawKey);
      if (!preview) return res.status(404).json({ error: 'Customer record not found.' });
      res.json({ preview });
    } catch (error: any) {
      console.error('Deletion preview error:', error);
      res.status(500).json({ error: error?.message || 'Failed to generate permanent deletion preview.' });
    }
  }
);

// 6d. DELETE /api/admin/customers/:id/permanent — Super-Admin (or explicitly granted Admin) Transactional Permanent Deletion
adminCustomersRouter.delete(
  '/:id/permanent',
  requireCustomerPermission('canPermanentlyDeleteCustomers'),
  async (req: AuthRequest, res) => {
    try {
      await ensureCustomerManagementSchema();
      if (!['super_admin', 'admin'].includes(req.dbUser!.role)) {
        return res.status(403).json({
          error: 'Employees are strictly prohibited from permanently deleting customer accounts.',
        });
      }

      const rawKey = String(req.params.id || '').trim();
      if (!rawKey) return res.status(400).json({ error: 'Invalid customer ID.' });

      const preview = await getCustomerDeletionPreview(rawKey);
      if (!preview) {
        return res.status(404).json({ error: 'Customer not found or already permanently deleted.' });
      }

      const confirmCustomerId = String(req.body?.confirmCustomerId || '').trim().toUpperCase();
      const expectedCode = preview.customer.customerCode.trim().toUpperCase();
      if (!confirmCustomerId || confirmCustomerId !== expectedCode) {
        return res.status(400).json({
          error: `Confirmation Customer ID mismatch. Please enter exact Customer ID '${expectedCode}'.`,
        });
      }

      if (req.body?.secondConfirmation !== true) {
        return res.status(400).json({
          error: 'Second confirmation acknowledgment is required before permanent deletion.',
        });
      }

      const reason =
        String(req.body?.reason || '').trim() ||
        'Permanently deleted by authorized administrator';

      const result = await permanentlyDeleteCustomerTransaction({
        rawKey,
        actor: {
          id: req.dbUser!.id,
          uid: req.dbUser!.uid,
          email: req.dbUser!.email,
          role: req.dbUser!.role,
        },
        reason,
      });

      await logAudit({
        actorUid: req.dbUser!.uid,
        actorEmail: req.dbUser!.email,
        action: 'ADMIN_PERMANENT_DELETE_CUSTOMER',
        entityType: 'customer',
        entityId: String(result.deletedId),
        details: {
          customerCode: result.customerCode,
          deletedAuthAccount: result.deletedAuthAccount,
          summaryCounts: result.summaryCounts,
          reason,
        },
      });

      res.json({ ok: true, ...result });
    } catch (error: any) {
      console.error('Permanent delete customer error:', error);
      res.status(500).json({ error: error?.message || 'Failed to permanently delete customer.' });
    }
  }
);

// 6e. DELETE /api/admin/customers/:id — Safe deactivation endpoint (never accidentally wipes without /permanent workflow)
adminCustomersRouter.delete(
  '/:id',
  requireCustomerPermission('canDeactivateCustomers'),
  async (req: AuthRequest, res) => {
    try {
      await ensureCustomerManagementSchema();
      if (req.body?.permanent === true || String(req.query.permanent || '') === 'true') {
        return res.status(400).json({
          error: 'Permanent deletion requires the /permanent confirmation endpoint and Super Admin permission.',
        });
      }
      const rawKey = String(req.params.id || '').trim();
      if (!rawKey) return res.status(400).json({ error: 'Invalid customer ID.' });

      const reason =
        String(req.body?.reason || req.query.reason || '').trim() ||
        'Deactivated from Customer Management Dashboard';

      const result = await setCustomerActivationStatus({
        rawKey,
        targetStatus: 'Deactivated',
        reason,
        actor: req.dbUser!,
      });
      if (!result) return res.status(404).json({ error: 'Customer not found.' });
      res.json({ ok: true, deactivated: true, ...result });
    } catch (error: any) {
      console.error('Deactivate customer error:', error);
      res.status(400).json({ error: error?.message || 'Failed to deactivate customer.' });
    }
  }
);

