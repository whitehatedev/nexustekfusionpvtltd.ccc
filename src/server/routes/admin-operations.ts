import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { Router } from 'express';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import {
  adminNotifications,
  b2bEnquiries,
  customers,
  invoices,
  payments,
  pcbEnquiries,
  productEnquiries,
  projectEnquiries,
  projectMessages,
  projectQuotations,
  projects,
  serviceRecords,
  siteSettings,
  storeOrders,
  supportTickets,
  users,
} from '../../db/schema.ts';
import { AuthRequest, requireAdmin } from '../../middleware/auth.ts';
import {
  emitAdminStreamEvent,
  subscribeAdminStream,
  syncAdminNotificationReadToSupabase,
} from '../admin-realtime.ts';
import { dispatchLifecycleEmail } from '../email.ts';
import {
  syncB2bEnquiryToSupabase,
  syncEnquiryToSupabase,
  syncInvoiceToSupabase,
  syncPaymentToSupabase,
  syncPcbEnquiryToSupabase,
  syncProductEnquiryToSupabase,
  syncStoreOrderToSupabase,
  syncSupportTicketToSupabase,
} from '../supabase-ecommerce.ts';
import { syncProjectMessageToSupabase } from '../supabase-projects.ts';
import { isPublicCustomersSchemaReady, listPublicCustomers } from '../supabase-customers.ts';
import {
  downloadFromSupabaseStorage,
  isSupabaseStorageConfigured,
  uploadProjectDocumentToSupabase,
  uploadSupportFileToSupabase,
} from '../../lib/supabase-admin.ts';
import { recordEntityStatusChange } from '../record-history.ts';
import { emitCustomerStreamEvent } from '../customer-realtime.ts';
import {
  createOrSyncServiceRecord,
  listActiveServicesCatalog,
  updateServiceRecordByAdmin,
} from '../service-records-service.ts';
import {
  createMemoryUploadMiddleware,
  createNotification,
  generateCode,
  logAudit,
  UPLOADS_ROOT,
} from '../utils.ts';

export const adminOperationsRouter = Router();

const enquiryReplyUpload = createMemoryUploadMiddleware(
  ['.pdf', '.png', '.jpg', '.jpeg', '.webp', '.doc', '.docx', '.xls', '.xlsx', '.csv', '.zip', '.txt', '.stl', '.step'],
  40
);

const projectDesignDocUpload = createMemoryUploadMiddleware(
  ['.pdf', '.png', '.jpg', '.jpeg', '.webp', '.doc', '.docx', '.xls', '.xlsx', '.csv', '.zip', '.txt', '.stl', '.step', '.dwg', '.dxf'],
  60
);

function csvCell(val: unknown): string {
  const s = String(val ?? '').replace(/\r?\n/g, ' ');
  return `"${s.replace(/"/g, '""')}"`;
}

function buildCsv(headers: string[], rows: unknown[][]): string {
  return `\uFEFF${[headers.map(csvCell).join(','), ...rows.map((r) => r.map(csvCell).join(','))].join('\n')}`;
}

function normalizeEmail(val: string | null | undefined): string {
  return String(val || '').trim().toLowerCase();
}

function parseDateBounds(dateFrom?: unknown, dateTo?: unknown): { fromMs: number; toMs: number } {
  const f = String(dateFrom || '').trim();
  const t = String(dateTo || '').trim();
  const fromMs = f ? Date.parse(`${f}T00:00:00.000Z`) : NaN;
  const toMs = t ? Date.parse(`${t}T23:59:59.999Z`) : NaN;
  return { fromMs, toMs };
}

function withinDateBounds(dt: Date | string | null | undefined, fromMs: number, toMs: number): boolean {
  if (!Number.isFinite(fromMs) && !Number.isFinite(toMs)) return true;
  if (!dt) return false;
  const ms = new Date(dt).getTime();
  if (!Number.isFinite(ms)) return false;
  if (Number.isFinite(fromMs) && ms < fromMs) return false;
  if (Number.isFinite(toMs) && ms > toMs) return false;
  return true;
}

async function buildCustomerCodeLookup() {
  const [allUsers, localCustomers, publicReady] = await Promise.all([
    db.select().from(users).where(isNull(users.deletedAt)),
    db.select().from(customers).where(isNull(customers.deletedAt)),
    isPublicCustomersSchemaReady().catch(() => false),
  ]);
  const publicCustomers = (publicReady ? await listPublicCustomers().catch(() => []) : []) || [];

  const userById = new Map<number, typeof users.$inferSelect>();
  const codeByUserId = new Map<number, string>();
  const codeByEmail = new Map<string, string>();
  const userByEmail = new Map<string, typeof users.$inferSelect>();

  for (const u of allUsers) {
    userById.set(u.id, u);
    const em = normalizeEmail(u.email);
    if (em && !userByEmail.has(em)) userByEmail.set(em, u);
    if (u.uid && u.uid.startsWith('NTF-CUST-')) {
      codeByUserId.set(u.id, u.uid);
      if (em) codeByEmail.set(em, u.uid);
    }
  }

  for (const c of localCustomers) {
    const code = c.customerId;
    if (!code) continue;
    if (c.userId) codeByUserId.set(c.userId, code);
    const em = normalizeEmail(c.email);
    if (em) codeByEmail.set(em, code);
  }

  for (const pc of publicCustomers) {
    const code = pc.customerId;
    if (!code) continue;
    if (pc.webUserId) codeByUserId.set(pc.webUserId, code);
    const em = normalizeEmail(pc.email);
    if (em) codeByEmail.set(em, code);
  }

  const resolveCustomerId = (userId: number | null | undefined, email?: string | null, explicitCode?: string | null): string => {
    if (explicitCode && explicitCode.trim()) return explicitCode.trim();
    if (userId && codeByUserId.has(userId)) return codeByUserId.get(userId)!;
    const em = normalizeEmail(email);
    if (em && codeByEmail.has(em)) return codeByEmail.get(em)!;
    if (userId && userById.has(userId)) return userById.get(userId)!.uid;
    return '';
  };

  return { userById, userByEmail, resolveCustomerId };
}

// ============================================================================
// 1. REAL-TIME SSE STREAM FOR ADMIN PORTAL
// ============================================================================
adminOperationsRouter.get('/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  res.write(`event: connected\ndata: ${JSON.stringify({ ok: true, timestamp: new Date().toISOString() })}\n\n`);

  const unsubscribe = subscribeAdminStream((event) => {
    try {
      res.write(`event: admin_event\ndata: ${JSON.stringify(event)}\n\n`);
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

// ============================================================================
// 2. ADMIN NOTIFICATION CENTER
// ============================================================================
adminOperationsRouter.get('/notifications', async (req, res) => {
  try {
    const unreadOnly = String(req.query.unreadOnly || '') === 'true';
    const limit = Math.min(200, Math.max(10, Number(req.query.limit || 60)));
    const allRows = await db.select().from(adminNotifications).orderBy(desc(adminNotifications.createdAt)).limit(200);
    const unreadCount = allRows.filter((n) => !n.isRead).length;
    const items = (unreadOnly ? allRows.filter((n) => !n.isRead) : allRows).slice(0, limit);
    res.json({ items, unreadCount });
  } catch (error) {
    console.error('Load admin notifications error:', error);
    res.status(500).json({ error: 'Failed to load admin notifications.' });
  }
});

adminOperationsRouter.post('/notifications/:id/read', async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid notification ID.' });
    const [updated] = await db
      .update(adminNotifications)
      .set({ isRead: true, readBy: req.dbUser!.email })
      .where(eq(adminNotifications.id, id))
      .returning();
    if (!updated) return res.status(404).json({ error: 'Notification not found.' });
    syncAdminNotificationReadToSupabase({ sourceId: id, readBy: req.dbUser!.email }).catch(() => {});
    emitAdminStreamEvent({ type: 'notification', action: 'read', id });
    res.json({ notification: updated });
  } catch {
    res.status(500).json({ error: 'Failed to mark notification as read.' });
  }
});

adminOperationsRouter.post('/notifications/read-all', async (req: AuthRequest, res) => {
  try {
    await db
      .update(adminNotifications)
      .set({ isRead: true, readBy: req.dbUser!.email })
      .where(eq(adminNotifications.isRead, false));
    syncAdminNotificationReadToSupabase({ markAll: true, readBy: req.dbUser!.email }).catch(() => {});
    emitAdminStreamEvent({ type: 'notification', action: 'read_all' });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Failed to mark all notifications as read.' });
  }
});

// ============================================================================
// 3. CENTRALIZED ALL ORDERS MANAGEMENT + PAYMENT VERIFICATION + CSV
// ============================================================================
async function queryFilteredOrders(query: Record<string, any>) {
  const [{ userById, resolveCustomerId }, rawOrders] = await Promise.all([
    buildCustomerCodeLookup(),
    db.select().from(storeOrders).where(eq(storeOrders.isDeleted, false)).orderBy(desc(storeOrders.createdAt)),
  ]);

  const search = String(query.search || '').trim().toLowerCase();
  const statusFilter = String(query.status || 'all').trim();
  const paymentFilter = String(query.paymentStatus || 'all').trim().toLowerCase();
  const { fromMs, toMs } = parseDateBounds(query.dateFrom, query.dateTo);

  const enriched = rawOrders.map((o) => {
    const u = o.userId ? userById.get(o.userId) : undefined;
    const ship = (o.shippingAddress || {}) as Record<string, any>;
    const bill = (o.billingAddress || {}) as Record<string, any>;
    const customerEmail = u?.email || String(ship.email || bill.email || '');
    const customerName = u?.fullName || String(ship.fullName || bill.fullName || 'Customer');
    const customerPhone = u?.mobile || String(ship.mobile || bill.mobile || '');
    const customerId = resolveCustomerId(o.userId, customerEmail, o.customerId);
    const items = Array.isArray(o.items) ? o.items : [];
    const totalQty = items.reduce((s, it) => s + Math.max(1, Number(it.qty || 1)), 0);
    const productNames = items.map((it) => `${it.name} ×${it.qty}`).join(', ');
    return {
      ...o,
      customerId,
      customerName,
      customerEmail,
      customerPhone,
      paymentMethod: o.paymentMethod || (o.razorpayPaymentId?.startsWith('pay_test_') ? 'Razorpay (Test)' : 'Razorpay'),
      totalQty,
      productNames,
    };
  });

  const filtered = enriched.filter((o) => {
    if (statusFilter && statusFilter !== 'all' && o.orderStatus.toLowerCase() !== statusFilter.toLowerCase()) {
      return false;
    }
    if (paymentFilter && paymentFilter !== 'all' && o.paymentStatus.toLowerCase() !== paymentFilter) {
      return false;
    }
    if (!withinDateBounds(o.createdAt, fromMs, toMs)) return false;
    if (search) {
      const hay = [
        o.orderNumber,
        o.customerId,
        o.customerName,
        o.customerEmail,
        o.customerPhone,
        o.productNames,
        o.trackingId,
        o.orderStatus,
        o.paymentStatus,
      ]
        .join(' ')
        .toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });

  return { enriched, filtered };
}

adminOperationsRouter.get('/orders', async (req, res) => {
  try {
    const { enriched, filtered } = await queryFilteredOrders(req.query);
    const page = Math.max(1, Number(req.query.page || 1));
    const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize || 20)));
    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(totalPages, page);
    const items = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

    res.json({
      items,
      pagination: { page: safePage, pageSize, total, totalPages },
      summary: {
        total: enriched.length,
        newOrders: enriched.filter((o) => ['New', 'Order Placed', 'Pending Payment'].includes(o.orderStatus)).length,
        processing: enriched.filter((o) =>
          ['Confirmed', 'Payment Confirmed', 'Processing', 'Order Processing', 'Quality Inspection', 'Ready for Dispatch', 'Shipped', 'Out for Delivery'].includes(o.orderStatus)
        ).length,
        completed: enriched.filter((o) => ['Delivered', 'Completed'].includes(o.orderStatus)).length,
        cancelled: enriched.filter((o) => ['Cancelled', 'Refunded', 'Refund Initiated'].includes(o.orderStatus)).length,
      },
    });
  } catch (error) {
    console.error('Admin orders list error:', error);
    res.status(500).json({ error: 'Failed to load orders.' });
  }
});

adminOperationsRouter.get('/orders/export', async (req, res) => {
  try {
    const { filtered } = await queryFilteredOrders(req.query);
    const headers = [
      'Order ID',
      'Customer ID',
      'Customer Name',
      'Customer Email',
      'Phone',
      'Products',
      'Total Qty',
      'Order Amount (INR)',
      'Payment Status',
      'Payment Method',
      'Order Date',
      'Delivery Address',
      'Order Status',
      'Tracking Courier',
      'Tracking Number',
    ];
    const rows = filtered.map((o) => {
      const addr = (o.shippingAddress || {}) as Record<string, any>;
      const addrText = [addr.line1, addr.line2, addr.city, addr.state, addr.pinCode].filter(Boolean).join(', ');
      return [
        o.orderNumber,
        o.customerId,
        o.customerName,
        o.customerEmail,
        o.customerPhone,
        o.productNames,
        o.totalQty,
        o.totalInr,
        o.paymentStatus,
        o.paymentMethod,
        new Date(o.createdAt).toISOString().slice(0, 10),
        addrText,
        o.orderStatus,
        o.trackingCourier || '',
        o.trackingId || '',
      ];
    });
    const csv = buildCsv(headers, rows);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="nexustekfusion-orders-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csv);
  } catch {
    res.status(500).json({ error: 'Failed to export orders CSV.' });
  }
});

adminOperationsRouter.post('/store-orders/:id/verify-payment', async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const [existing] = await db.select().from(storeOrders).where(eq(storeOrders.id, id)).limit(1);
    if (!existing) return res.status(404).json({ error: 'Store order not found.' });

    const paymentMethod = String(req.body.paymentMethod || existing.paymentMethod || 'Manual / Admin Verified').trim();
    const referenceNo = String(req.body.referenceNo || existing.razorpayPaymentId || generateCode('NTF-MAN')).trim();
    const nextOrderStatus = ['New', 'Order Placed', 'Pending Payment'].includes(existing.orderStatus)
      ? 'Confirmed'
      : existing.orderStatus;

    const prevHistory = existing.statusHistory || [];
    const nextHistory = [
      ...prevHistory,
      {
        status: nextOrderStatus,
        timestamp: new Date().toISOString(),
        note: `Payment manually verified by admin (${paymentMethod}${referenceNo ? ` · Ref: ${referenceNo}` : ''}).`,
        actor: req.dbUser!.email,
      },
    ];

    const [updated] = await db
      .update(storeOrders)
      .set({
        paymentStatus: 'paid',
        paymentMethod,
        razorpayPaymentId: existing.razorpayPaymentId || referenceNo,
        orderStatus: nextOrderStatus,
        statusHistory: nextHistory,
        updatedAt: new Date(),
      })
      .where(eq(storeOrders.id, id))
      .returning();

    const paymentRef = generateCode('NTF-PAY');
    const [existingPay] = await db
      .select()
      .from(payments)
      .where(and(eq(payments.entityType, 'store_order'), eq(payments.entityId, updated.id), eq(payments.status, 'verified')))
      .limit(1);

    let payRecord = existingPay;
    if (!payRecord) {
      const [createdPay] = await db
        .insert(payments)
        .values({
          paymentRef,
          userId: updated.userId,
          entityType: 'store_order',
          entityId: updated.id,
          paymentStage: 'store',
          razorpayOrderId: updated.razorpayOrderId || '',
          razorpayPaymentId: updated.razorpayPaymentId || referenceNo,
          amountInr: updated.totalInr,
          amountPaise: Math.round(updated.totalInr * 100),
          mode: 'admin_verified',
          status: 'verified',
          verifiedAt: new Date(),
        })
        .returning();
      payRecord = createdPay;
    }

    const [existingInv] = await db
      .select()
      .from(invoices)
      .where(and(eq(invoices.entityType, 'store_order'), eq(invoices.entityId, updated.id), eq(invoices.isDeleted, false)))
      .limit(1);

    const [customer] = updated.userId
      ? await db.select().from(users).where(eq(users.id, updated.userId)).limit(1)
      : [];

    let invoiceRecord = existingInv;
    if (!invoiceRecord) {
      const [companyRow] = await db.select().from(siteSettings).where(eq(siteSettings.key, 'companyInfo')).limit(1);
      const companyInfo = (companyRow?.value as { gstin?: string }) || {};
      const addrState = String(updated.shippingAddress?.state || updated.billingAddress?.state || '').trim();
      const isIntraState = /maharashtra/i.test(addrState);
      const cgstInr = isIntraState ? Math.floor(updated.gstInr / 2) : 0;
      const sgstInr = isIntraState ? updated.gstInr - cgstInr : 0;
      const igstInr = isIntraState ? 0 : updated.gstInr;

      const [createdInv] = await db
        .insert(invoices)
        .values({
          invoiceNumber: generateCode('NTF-INV'),
          userId: updated.userId,
          entityType: 'store_order',
          entityId: updated.id,
          docType: companyInfo.gstin ? 'GST Tax Invoice' : 'Tax Invoice',
          amountInr: updated.totalInr,
          gstInr: updated.gstInr,
          payload: {
            orderNumber: updated.orderNumber,
            items: updated.items,
            shippingAddress: updated.shippingAddress,
            billingAddress: updated.billingAddress || updated.shippingAddress,
            customerName: updated.shippingAddress?.fullName || customer?.fullName || customer?.email || 'Customer',
            customerPhone: updated.shippingAddress?.mobile || customer?.mobile || '',
            customerEmail: customer?.email || '',
            subtotalInr: updated.subtotalInr,
            discountInr: updated.discountInr,
            shippingInr: updated.shippingInr,
            gstInr: updated.gstInr,
            cgstInr,
            sgstInr,
            igstInr,
            isIntraState,
            paymentMethod,
            razorpayPaymentId: updated.razorpayPaymentId || referenceNo,
            razorpayOrderId: updated.razorpayOrderId || '',
          },
        })
        .returning();
      invoiceRecord = createdInv;
    }

    if (updated.userId) {
      createNotification({
        userId: updated.userId,
        title: `Payment Verified — ${updated.orderNumber}`,
        message: `Your payment of ₹${updated.totalInr.toLocaleString('en-IN')} has been verified. Order status: ${updated.orderStatus}.`,
        link: '/my-account',
      }).catch(() => {});
    }

    syncStoreOrderToSupabase({
      orderNumber: updated.orderNumber,
      userUid: customer?.uid || '',
      customerEmail: customer?.email || '',
      billingAddress: updated.billingAddress,
      shippingAddress: updated.shippingAddress,
      items: updated.items,
      subtotalInr: updated.subtotalInr,
      discountInr: updated.discountInr,
      shippingInr: updated.shippingInr,
      gstInr: updated.gstInr,
      totalInr: updated.totalInr,
      couponCode: updated.couponCode,
      paymentStatus: updated.paymentStatus,
      refundStatus: updated.refundStatus,
      orderStatus: updated.orderStatus,
      razorpayOrderId: updated.razorpayOrderId,
      razorpayPaymentId: updated.razorpayPaymentId,
    }).catch(() => {});

    if (payRecord) {
      syncPaymentToSupabase({
        paymentRef: payRecord.paymentRef,
        userUid: customer?.uid || '',
        entityType: 'store_order',
        entityRef: String(updated.id),
        razorpayOrderId: payRecord.razorpayOrderId,
        razorpayPaymentId: payRecord.razorpayPaymentId,
        amountInr: payRecord.amountInr,
        amountPaise: payRecord.amountPaise,
        mode: payRecord.mode,
        status: payRecord.status,
        verifiedAt: payRecord.verifiedAt,
      }).catch(() => {});
    }

    if (invoiceRecord) {
      syncInvoiceToSupabase({
        invoiceNumber: invoiceRecord.invoiceNumber,
        userUid: customer?.uid || '',
        entityType: invoiceRecord.entityType,
        entityId: invoiceRecord.entityId,
        docType: invoiceRecord.docType,
        amountInr: invoiceRecord.amountInr,
        gstInr: invoiceRecord.gstInr,
        payload: (invoiceRecord.payload as Record<string, unknown>) || {},
      }).catch(() => {});
    }

    await logAudit({
      actorUid: req.dbUser!.uid,
      actorEmail: req.dbUser!.email,
      action: 'ADMIN_VERIFY_STORE_ORDER_PAYMENT',
      entityType: 'store_order',
      entityId: updated.id,
      details: { orderNumber: updated.orderNumber, paymentMethod, referenceNo },
    });

    emitAdminStreamEvent({ type: 'order', action: 'payment_verified', id: updated.orderNumber });
    emitAdminStreamEvent({ type: 'invoice', action: 'created', id: invoiceRecord?.invoiceNumber });

    res.json({ order: updated, payment: payRecord, invoice: invoiceRecord });
  } catch (error) {
    console.error('Verify store order payment error:', error);
    res.status(500).json({ error: 'Failed to verify order payment.' });
  }
});

// ============================================================================
// 4. UNIFIED HIGH-PRIORITY CUSTOMER ENQUIRIES CENTER
// ============================================================================
export type EnquirySource = 'product' | 'support' | 'project' | 'pcb' | 'b2b';

export interface UnifiedEnquiryRecord {
  uidKey: string;
  source: EnquirySource;
  sourceId: number;
  enquiryNumber: string;
  customerId: string;
  userId: number | null;
  customerName: string;
  customerEmail: string;
  phone: string;
  category: string;
  subject: string;
  description: string;
  attachments: Array<{ originalName: string; storagePath: string; sizeBytes?: number }>;
  priority: string;
  assignedStaff: string;
  status: string;
  internalNotes: string;
  replies: Array<{
    sender: string;
    role: string;
    message: string;
    attachments?: Array<{ originalName: string; storagePath: string; sizeBytes?: number }>;
    timestamp: string;
  }>;
  createdAt: string;
  updatedAt: string;
  meta?: Record<string, any>;
}

const RESPONDED_ENQUIRY_STATUSES = new Set([
  'Contacted',
  'Quoted',
  'Quotation Sent',
  'Replied',
  'Approved',
  'Resolved',
  'Closed',
  'Quotation Prepared',
  'Quotation Approved by Customer',
  'Completed',
]);

async function buildUnifiedEnquiries(includeArchived = false): Promise<UnifiedEnquiryRecord[]> {
  const [{ resolveCustomerId }, prodRows, supportRows, projRows, pcbRows, b2bRows, projMsgRows] = await Promise.all([
    buildCustomerCodeLookup(),
    includeArchived
      ? db.select().from(productEnquiries).orderBy(desc(productEnquiries.createdAt))
      : db.select().from(productEnquiries).where(eq(productEnquiries.isDeleted, false)).orderBy(desc(productEnquiries.createdAt)),
    includeArchived
      ? db.select().from(supportTickets).orderBy(desc(supportTickets.createdAt))
      : db.select().from(supportTickets).where(eq(supportTickets.isDeleted, false)).orderBy(desc(supportTickets.createdAt)),
    includeArchived
      ? db.select().from(projectEnquiries).orderBy(desc(projectEnquiries.createdAt))
      : db.select().from(projectEnquiries).where(eq(projectEnquiries.isDeleted, false)).orderBy(desc(projectEnquiries.createdAt)),
    includeArchived
      ? db.select().from(pcbEnquiries).orderBy(desc(pcbEnquiries.createdAt))
      : db.select().from(pcbEnquiries).where(eq(pcbEnquiries.isDeleted, false)).orderBy(desc(pcbEnquiries.createdAt)),
    includeArchived
      ? db.select().from(b2bEnquiries).orderBy(desc(b2bEnquiries.createdAt))
      : db.select().from(b2bEnquiries).where(eq(b2bEnquiries.isDeleted, false)).orderBy(desc(b2bEnquiries.createdAt)),
    db.select().from(projectMessages).orderBy(desc(projectMessages.createdAt)),
  ]);

  const msgsByEnquiryId = new Map<number, typeof projMsgRows>();
  for (const m of projMsgRows) {
    const arr = msgsByEnquiryId.get(m.enquiryId) || [];
    arr.push(m);
    msgsByEnquiryId.set(m.enquiryId, arr);
  }

  const unified: UnifiedEnquiryRecord[] = [];

  for (const r of prodRows) {
    unified.push({
      uidKey: `product:${r.id}`,
      source: 'product',
      sourceId: r.id,
      enquiryNumber: r.enquiryNumber,
      customerId: resolveCustomerId(r.userId, r.email, r.customerId),
      userId: r.userId,
      customerName: r.fullName,
      customerEmail: r.email,
      phone: r.mobile,
      category: r.category || (r.interestedProduct.toUpperCase().includes('KRASHIVANTRI') ? 'Drone Manufacturing' : 'Product Enquiry'),
      subject: r.subject || `${r.interestedProduct} (Qty ${r.quantity})`,
      description:
        r.message ||
        `Product: ${r.interestedProduct} · Qty: ${r.quantity} · Application: ${r.intendedApplication} · Location: ${r.district}, ${r.state}`,
      attachments: Array.isArray(r.attachments) ? r.attachments : [],
      priority: r.priority || 'Normal',
      assignedStaff: r.assignedStaff || '',
      status: r.status || 'New',
      internalNotes: r.internalNotes || '',
      replies: Array.isArray(r.replies) ? r.replies : [],
      createdAt: new Date(r.createdAt).toISOString(),
      updatedAt: new Date(r.updatedAt).toISOString(),
      meta: {
        interestedProduct: r.interestedProduct,
        quantity: r.quantity,
        organizationOrFarmName: r.organizationOrFarmName,
        state: r.state,
        district: r.district,
      },
    });
  }

  for (const r of supportRows) {
    const atts: Array<{ originalName: string; storagePath: string; sizeBytes?: number }> = r.attachmentPath
      ? [{ originalName: path.basename(r.attachmentPath), storagePath: r.attachmentPath }]
      : [];
    const mappedReplies = (Array.isArray(r.messages) ? r.messages : []).map((m) => ({
      sender: m.sender,
      role: m.role,
      message: m.text,
      attachments: (m as any).attachments || [],
      timestamp: m.timestamp,
    }));
    unified.push({
      uidKey: `support:${r.id}`,
      source: 'support',
      sourceId: r.id,
      enquiryNumber: r.ticketNumber,
      customerId: resolveCustomerId(r.userId, r.email, r.customerId),
      userId: r.userId,
      customerName: r.name,
      customerEmail: r.email,
      phone: r.mobile || '',
      category: r.category || r.serviceCategory || 'General Enquiry',
      subject: r.subject,
      description: r.message,
      attachments: atts,
      priority: r.priority || 'Normal',
      assignedStaff: r.assignedStaff || '',
      status: r.status === 'Open' ? 'New' : r.status,
      internalNotes: r.internalNotes || '',
      replies: mappedReplies,
      createdAt: new Date(r.createdAt).toISOString(),
      updatedAt: new Date(r.updatedAt).toISOString(),
      meta: { rawStatus: r.status, serviceCategory: r.serviceCategory },
    });
  }

  for (const r of projRows) {
    const pMsgs = (msgsByEnquiryId.get(r.id) || []).map((m) => ({
      sender: m.senderName,
      role: m.senderRole,
      message: m.message,
      attachments: Array.isArray(m.attachments) ? m.attachments : [],
      timestamp: new Date(m.createdAt).toISOString(),
    }));
    unified.push({
      uidKey: `project:${r.id}`,
      source: 'project',
      sourceId: r.id,
      enquiryNumber: r.enquiryNumber,
      customerId: resolveCustomerId(r.userId, r.customerEmail, r.customerId),
      userId: r.userId,
      customerName: r.customerName,
      customerEmail: r.customerEmail,
      phone: r.customerPhone,
      category: r.projectCategory || 'Engineering Services',
      subject: r.projectTitle,
      description: r.projectDescription,
      attachments: Array.isArray(r.attachments) ? r.attachments : [],
      priority: r.priority || 'Normal',
      assignedStaff: r.assignedEngineer || '',
      status: r.status,
      internalNotes: r.internalNotes || '',
      replies: pMsgs.reverse(),
      createdAt: new Date(r.createdAt).toISOString(),
      updatedAt: new Date(r.updatedAt).toISOString(),
      meta: {
        engineeringBranch: r.engineeringBranch,
        estimatedBudget: r.estimatedBudget,
        companyOrCollege: r.companyOrCollege,
      },
    });
  }

  for (const r of pcbRows) {
    unified.push({
      uidKey: `pcb:${r.id}`,
      source: 'pcb',
      sourceId: r.id,
      enquiryNumber: r.enquiryNumber,
      customerId: resolveCustomerId(r.userId, r.email, r.customerId),
      userId: r.userId,
      customerName: r.customerName,
      customerEmail: r.email,
      phone: r.mobile,
      category: 'Engineering Services',
      subject: `PCB Fabrication ${r.layerCount}-Layer (${r.boardDimensionsMm}, Qty ${r.boardQuantity})`,
      description: r.specialInstructions || `Dimensions: ${r.boardDimensionsMm}, Finish: ${r.surfaceFinish}, Mask: ${r.solderMaskColor}`,
      attachments: Array.isArray(r.attachments) ? r.attachments : [],
      priority: r.priority || 'Normal',
      assignedStaff: r.assignedStaff || '',
      status: r.status,
      internalNotes: r.adminNotes || '',
      replies: Array.isArray(r.replies) ? r.replies : [],
      createdAt: new Date(r.createdAt).toISOString(),
      updatedAt: new Date(r.updatedAt).toISOString(),
      meta: { layerCount: r.layerCount, boardQuantity: r.boardQuantity, quotedAmountInr: r.quotedAmountInr },
    });
  }

  for (const r of b2bRows) {
    unified.push({
      uidKey: `b2b:${r.id}`,
      source: 'b2b',
      sourceId: r.id,
      enquiryNumber: r.enquiryNumber,
      customerId: resolveCustomerId(r.userId, r.email, r.customerId),
      userId: r.userId,
      customerName: `${r.contactPerson} (${r.companyName})`,
      customerEmail: r.email,
      phone: r.mobile,
      category: 'Bulk Orders',
      subject: `B2B Bulk RFQ: ${r.requirementCategory} (Qty ${r.quantity})`,
      description: r.technicalSpecs,
      attachments: Array.isArray(r.attachments) ? r.attachments : [],
      priority: r.priority || 'High',
      assignedStaff: r.assignedStaff || '',
      status: r.status,
      internalNotes: r.adminNotes || '',
      replies: Array.isArray(r.replies) ? r.replies : [],
      createdAt: new Date(r.createdAt).toISOString(),
      updatedAt: new Date(r.updatedAt).toISOString(),
      meta: { companyName: r.companyName, gstin: r.gstin, quantity: r.quantity },
    });
  }

  unified.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return unified;
}

function filterUnifiedEnquiries(all: UnifiedEnquiryRecord[], query: Record<string, any>) {
  const search = String(query.search || '').trim().toLowerCase();
  const category = String(query.category || 'all').trim().toLowerCase();
  const status = String(query.status || 'all').trim().toLowerCase();
  const priority = String(query.priority || 'all').trim().toLowerCase();
  const source = String(query.source || 'all').trim().toLowerCase();
  const assignedStaff = String(query.assignedStaff || 'all').trim().toLowerCase();
  const { fromMs, toMs } = parseDateBounds(query.dateFrom, query.dateTo);

  return all.filter((e) => {
    if (category && category !== 'all' && e.category.toLowerCase() !== category) return false;
    if (status && status !== 'all' && e.status.toLowerCase() !== status) return false;
    if (priority && priority !== 'all' && e.priority.toLowerCase() !== priority) return false;
    if (source && source !== 'all' && e.source !== source) return false;
    if (assignedStaff && assignedStaff !== 'all' && e.assignedStaff.toLowerCase() !== assignedStaff) return false;
    if (!withinDateBounds(e.createdAt, fromMs, toMs)) return false;
    if (search) {
      const hay = [
        e.enquiryNumber,
        e.customerId,
        e.customerName,
        e.customerEmail,
        e.phone,
        e.category,
        e.subject,
        e.description,
        e.assignedStaff,
        e.status,
      ]
        .join(' ')
        .toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });
}

adminOperationsRouter.get('/enquiries', async (req, res) => {
  try {
    const includeArchived = req.query.includeArchived === 'true';
    const all = await buildUnifiedEnquiries(includeArchived);
    const filtered = filterUnifiedEnquiries(all, req.query);
    const page = Math.max(1, Number(req.query.page || 1));
    const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize || 20)));
    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(totalPages, page);
    const items = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

    const categories = Array.from(new Set(all.map((e) => e.category).filter(Boolean))).sort();
    const statuses = Array.from(new Set(all.map((e) => e.status).filter(Boolean))).sort();
    const staff = Array.from(new Set(all.map((e) => e.assignedStaff).filter(Boolean))).sort();

    res.json({
      items,
      pagination: { page: safePage, pageSize, total, totalPages },
      summary: {
        total: all.length,
        newCount: all.filter((e) => ['New', 'Open', 'Submitted', 'Submitted – Under Review'].includes(e.status)).length,
        pendingCount: all.filter((e) => !RESPONDED_ENQUIRY_STATUSES.has(e.status) && e.status !== 'Rejected').length,
        respondedCount: all.filter((e) => RESPONDED_ENQUIRY_STATUSES.has(e.status)).length,
      },
      filterOptions: { categories, statuses, staff },
    });
  } catch (error) {
    console.error('Admin unified enquiries error:', error);
    res.status(500).json({ error: 'Failed to load enquiries.' });
  }
});

adminOperationsRouter.get('/enquiries/export', async (req, res) => {
  try {
    const all = await buildUnifiedEnquiries();
    const filtered = filterUnifiedEnquiries(all, req.query);
    const headers = [
      'Enquiry ID',
      'Source',
      'Customer ID',
      'Customer Name',
      'Email',
      'Phone',
      'Category',
      'Subject',
      'Description',
      'Priority',
      'Assigned Staff',
      'Status',
      'Submitted Date',
    ];
    const rows = filtered.map((e) => [
      e.enquiryNumber,
      e.source.toUpperCase(),
      e.customerId,
      e.customerName,
      e.customerEmail,
      e.phone,
      e.category,
      e.subject,
      e.description,
      e.priority,
      e.assignedStaff,
      e.status,
      e.createdAt.slice(0, 10),
    ]);
    const csv = buildCsv(headers, rows);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="nexustekfusion-enquiries-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csv);
  } catch {
    res.status(500).json({ error: 'Failed to export enquiries CSV.' });
  }
});

adminOperationsRouter.patch('/enquiries/:source/:id', async (req: AuthRequest, res) => {
  try {
    const source = String(req.params.source || '') as EnquirySource;
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid enquiry ID.' });

    const { status, priority, assignedStaff, internalNotes, category, rejectionReason } = req.body || {};
    const cleanReason = String(rejectionReason || '').trim();
    if (status === 'Rejected' && !cleanReason) {
      return res.status(400).json({ error: 'A clear rejection reason is required when rejecting an enquiry.' });
    }

    if (source === 'product') {
      const [existing] = await db.select().from(productEnquiries).where(eq(productEnquiries.id, id)).limit(1);
      if (!existing) return res.status(404).json({ error: 'Enquiry not found.' });
      const [updated] = await db
        .update(productEnquiries)
        .set({
          status: status ?? existing.status,
          priority: priority ?? existing.priority,
          assignedStaff: assignedStaff ?? existing.assignedStaff,
          internalNotes: internalNotes ?? existing.internalNotes,
          category: category ?? existing.category,
          rejectionReason: status === 'Rejected' ? cleanReason : rejectionReason !== undefined ? cleanReason : existing.rejectionReason,
          rejectedBy: status === 'Rejected' ? req.dbUser!.email : existing.rejectedBy,
          rejectedAt: status === 'Rejected' ? new Date() : existing.rejectedAt,
          updatedAt: new Date(),
        })
        .where(eq(productEnquiries.id, id))
        .returning();
      if (status && status !== existing.status) {
        await recordEntityStatusChange({
          entityType: 'product_enquiry',
          entityId: existing.id,
          entityCode: existing.enquiryNumber,
          customerId: existing.customerId,
          userId: existing.userId,
          customerEmail: existing.email,
          previousStatus: existing.status,
          newStatus: updated.status,
          actionType: status === 'Rejected' ? 'rejection' : 'status_change',
          reason: cleanReason || updated.internalNotes || `Updated to ${updated.status}`,
          adminId: req.dbUser!.uid,
          adminEmail: req.dbUser!.email,
          originalRecord: existing as unknown as Record<string, unknown>,
        });
        if (existing.userId) {
          await createNotification({
            userId: existing.userId,
            title: `Enquiry ${updated.enquiryNumber}: ${updated.status}`,
            message:
              status === 'Rejected' && cleanReason
                ? `Your enquiry was marked Rejected: ${cleanReason}`
                : cleanReason || updated.internalNotes || `Status updated to ${updated.status}.`,
            link: '/my-account?tab=enquiries',
          }).catch(() => {});
        }
      }
      syncProductEnquiryToSupabase({
        enquiryNumber: updated.enquiryNumber,
        fullName: updated.fullName,
        mobile: updated.mobile,
        email: updated.email,
        interestedProduct: updated.interestedProduct,
        status: updated.status,
        assignedStaff: updated.assignedStaff,
        internalNotes: updated.internalNotes,
      }).catch(() => {});
      emitAdminStreamEvent({ type: 'enquiry', action: 'updated', id: updated.enquiryNumber });
      return res.json({ ok: true, updated });
    }

    if (source === 'support') {
      const [existing] = await db.select().from(supportTickets).where(eq(supportTickets.id, id)).limit(1);
      if (!existing) return res.status(404).json({ error: 'Enquiry not found.' });
      const [updated] = await db
        .update(supportTickets)
        .set({
          status: status ?? existing.status,
          priority: priority ?? existing.priority,
          assignedStaff: assignedStaff ?? existing.assignedStaff,
          internalNotes: internalNotes ?? existing.internalNotes,
          category: category ?? existing.category,
          rejectionReason: status === 'Rejected' ? cleanReason : rejectionReason !== undefined ? cleanReason : existing.rejectionReason,
          updatedAt: new Date(),
        })
        .where(eq(supportTickets.id, id))
        .returning();
      if (status && status !== existing.status) {
        await recordEntityStatusChange({
          entityType: 'support_ticket',
          entityId: existing.id,
          entityCode: existing.ticketNumber,
          customerId: existing.customerId,
          userId: existing.userId,
          customerEmail: existing.email,
          previousStatus: existing.status,
          newStatus: updated.status,
          actionType: status === 'Rejected' ? 'rejection' : 'status_change',
          reason: cleanReason || updated.internalNotes || `Updated to ${updated.status}`,
          adminId: req.dbUser!.uid,
          adminEmail: req.dbUser!.email,
          originalRecord: existing as unknown as Record<string, unknown>,
        });
        if (existing.userId) {
          await createNotification({
            userId: existing.userId,
            title: `Ticket ${updated.ticketNumber}: ${updated.status}`,
            message:
              status === 'Rejected' && cleanReason
                ? `Marked Rejected: ${cleanReason}`
                : cleanReason || updated.internalNotes || `Status updated to ${updated.status}.`,
            link: '/my-account?tab=enquiries',
          }).catch(() => {});
        }
      }
      syncSupportTicketToSupabase({
        ticketNumber: updated.ticketNumber,
        userUid: '',
        subject: updated.subject,
        serviceCategory: updated.serviceCategory,
        status: updated.status,
        messages: updated.messages,
      }).catch(() => {});
      emitAdminStreamEvent({ type: 'enquiry', action: 'updated', id: updated.ticketNumber });
      return res.json({ ok: true, updated });
    }

    if (source === 'project') {
      const [existing] = await db.select().from(projectEnquiries).where(eq(projectEnquiries.id, id)).limit(1);
      if (!existing) return res.status(404).json({ error: 'Project enquiry not found.' });
      const [updated] = await db
        .update(projectEnquiries)
        .set({
          status: status ?? existing.status,
          priority: priority ?? existing.priority,
          assignedEngineer: assignedStaff ?? existing.assignedEngineer,
          internalNotes: internalNotes ?? existing.internalNotes,
          rejectionReason: status === 'Rejected' ? cleanReason : rejectionReason !== undefined ? cleanReason : existing.rejectionReason,
          rejectedBy: status === 'Rejected' ? req.dbUser!.email : existing.rejectedBy,
          rejectedAt: status === 'Rejected' ? new Date() : existing.rejectedAt,
          updatedAt: new Date(),
        })
        .where(eq(projectEnquiries.id, id))
        .returning();
      if (status && status !== existing.status) {
        await recordEntityStatusChange({
          entityType: 'project_enquiry',
          entityId: existing.id,
          entityCode: existing.enquiryNumber,
          customerId: existing.customerId,
          userId: existing.userId,
          customerEmail: existing.customerEmail,
          previousStatus: existing.status,
          newStatus: updated.status,
          actionType: status === 'Rejected' ? 'rejection' : 'status_change',
          reason: cleanReason || updated.internalNotes || `Updated to ${updated.status}`,
          adminId: req.dbUser!.uid,
          adminEmail: req.dbUser!.email,
          originalRecord: existing as unknown as Record<string, unknown>,
        });
        await db
          .update(serviceRecords)
          .set({
            status: updated.status,
            ...(cleanReason ? { adminRemarks: cleanReason } : {}),
            updatedAt: new Date(),
          })
          .where(eq(serviceRecords.sourceEntityId, updated.enquiryNumber))
          .catch(() => {});
        if (existing.userId) {
          await createNotification({
            userId: existing.userId,
            title: `Project Enquiry ${updated.enquiryNumber}: ${updated.status}`,
            message:
              status === 'Rejected' && cleanReason
                ? `Project enquiry rejected: ${cleanReason}`
                : cleanReason || updated.internalNotes || `Status updated to ${updated.status}.`,
            link: '/my-account?tab=enquiries',
          }).catch(() => {});
        }
      }
      emitAdminStreamEvent({ type: 'enquiry', action: 'updated', id: updated.enquiryNumber });
      return res.json({ ok: true, updated });
    }

    if (source === 'pcb') {
      const [existing] = await db.select().from(pcbEnquiries).where(eq(pcbEnquiries.id, id)).limit(1);
      if (!existing) return res.status(404).json({ error: 'PCB enquiry not found.' });
      const [updated] = await db
        .update(pcbEnquiries)
        .set({
          status: status ?? existing.status,
          priority: priority ?? existing.priority,
          assignedStaff: assignedStaff ?? existing.assignedStaff,
          adminNotes: internalNotes ?? existing.adminNotes,
          rejectionReason: status === 'Rejected' ? cleanReason : rejectionReason !== undefined ? cleanReason : existing.rejectionReason,
          rejectedBy: status === 'Rejected' ? req.dbUser!.email : existing.rejectedBy,
          rejectedAt: status === 'Rejected' ? new Date() : existing.rejectedAt,
          updatedAt: new Date(),
        })
        .where(eq(pcbEnquiries.id, id))
        .returning();
      if (status && status !== existing.status) {
        await recordEntityStatusChange({
          entityType: 'pcb_enquiry',
          entityId: existing.id,
          entityCode: existing.enquiryNumber,
          customerId: existing.customerId,
          userId: existing.userId,
          customerEmail: existing.email,
          previousStatus: existing.status,
          newStatus: updated.status,
          actionType: status === 'Rejected' ? 'rejection' : 'status_change',
          reason: cleanReason || updated.adminNotes || `Updated to ${updated.status}`,
          adminId: req.dbUser!.uid,
          adminEmail: req.dbUser!.email,
          originalRecord: existing as unknown as Record<string, unknown>,
        });
        await db
          .update(serviceRecords)
          .set({
            status: updated.status,
            ...(cleanReason ? { adminRemarks: cleanReason } : {}),
            updatedAt: new Date(),
          })
          .where(eq(serviceRecords.sourceEntityId, updated.enquiryNumber))
          .catch(() => {});
        if (existing.userId) {
          await createNotification({
            userId: existing.userId,
            title: `PCB Enquiry ${updated.enquiryNumber}: ${updated.status}`,
            message:
              status === 'Rejected' && cleanReason
                ? `PCB enquiry rejected: ${cleanReason}`
                : cleanReason || updated.adminNotes || `Status updated to ${updated.status}.`,
            link: '/my-account?tab=enquiries',
          }).catch(() => {});
        }
      }
      syncPcbEnquiryToSupabase({
        enquiryNumber: updated.enquiryNumber,
        userUid: '',
        customerName: updated.customerName,
        email: updated.email,
        mobile: updated.mobile,
        boardDimensionsMm: updated.boardDimensionsMm,
        layerCount: updated.layerCount,
        boardQuantity: updated.boardQuantity,
        assemblyRequired: updated.assemblyRequired,
        status: updated.status,
      }).catch(() => {});
      emitAdminStreamEvent({ type: 'enquiry', action: 'updated', id: updated.enquiryNumber });
      return res.json({ ok: true, updated });
    }

    if (source === 'b2b') {
      const [existing] = await db.select().from(b2bEnquiries).where(eq(b2bEnquiries.id, id)).limit(1);
      if (!existing) return res.status(404).json({ error: 'B2B enquiry not found.' });
      const [updated] = await db
        .update(b2bEnquiries)
        .set({
          status: status ?? existing.status,
          priority: priority ?? existing.priority,
          assignedStaff: assignedStaff ?? existing.assignedStaff,
          adminNotes: internalNotes ?? existing.adminNotes,
          rejectionReason: status === 'Rejected' ? cleanReason : rejectionReason !== undefined ? cleanReason : existing.rejectionReason,
          rejectedBy: status === 'Rejected' ? req.dbUser!.email : existing.rejectedBy,
          rejectedAt: status === 'Rejected' ? new Date() : existing.rejectedAt,
          updatedAt: new Date(),
        })
        .where(eq(b2bEnquiries.id, id))
        .returning();
      if (status && status !== existing.status) {
        await recordEntityStatusChange({
          entityType: 'b2b_enquiry',
          entityId: existing.id,
          entityCode: existing.enquiryNumber,
          customerId: existing.customerId,
          userId: existing.userId,
          customerEmail: existing.email,
          previousStatus: existing.status,
          newStatus: updated.status,
          actionType: status === 'Rejected' ? 'rejection' : 'status_change',
          reason: cleanReason || updated.adminNotes || `Updated to ${updated.status}`,
          adminId: req.dbUser!.uid,
          adminEmail: req.dbUser!.email,
          originalRecord: existing as unknown as Record<string, unknown>,
        });
        await db
          .update(serviceRecords)
          .set({
            status: updated.status,
            ...(cleanReason ? { adminRemarks: cleanReason } : {}),
            updatedAt: new Date(),
          })
          .where(eq(serviceRecords.sourceEntityId, updated.enquiryNumber))
          .catch(() => {});
        if (existing.userId) {
          await createNotification({
            userId: existing.userId,
            title: `B2B RFQ ${updated.enquiryNumber}: ${updated.status}`,
            message:
              status === 'Rejected' && cleanReason
                ? `B2B RFQ rejected: ${cleanReason}`
                : cleanReason || updated.adminNotes || `Status updated to ${updated.status}.`,
            link: '/my-account?tab=enquiries',
          }).catch(() => {});
        }
      }
      syncB2bEnquiryToSupabase({
        enquiryNumber: updated.enquiryNumber,
        userUid: '',
        companyName: updated.companyName,
        contactPerson: updated.contactPerson,
        email: updated.email,
        mobile: updated.mobile,
        requirementCategory: updated.requirementCategory,
        quantity: updated.quantity,
        technicalSpecs: updated.technicalSpecs,
        shippingLocation: updated.shippingLocation,
        status: updated.status,
      }).catch(() => {});
      emitAdminStreamEvent({ type: 'enquiry', action: 'updated', id: updated.enquiryNumber });
      return res.json({ ok: true, updated });
    }

    return res.status(400).json({ error: `Unsupported enquiry source '${source}'.` });
  } catch (error) {
    console.error('Update enquiry error:', error);
    res.status(500).json({ error: 'Failed to update enquiry.' });
  }
});

// Non-Destructive Soft-Archive for Enquiries (preserves original record, reason & audit trail)
adminOperationsRouter.delete('/enquiries/:source/:id', async (req: AuthRequest, res) => {
  try {
    const source = String(req.params.source || '') as EnquirySource;
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid enquiry ID.' });
    const reason = String(req.body?.reason || req.query?.reason || 'Archived by Admin').trim();
    const now = new Date();

    if (source === 'product') {
      const [existing] = await db.select().from(productEnquiries).where(eq(productEnquiries.id, id)).limit(1);
      if (!existing) return res.status(404).json({ error: 'Enquiry not found.' });
      const [archived] = await db
        .update(productEnquiries)
        .set({ isDeleted: true, archivedAt: now, archivedReason: reason, archivedBy: req.dbUser!.email, updatedAt: now })
        .where(eq(productEnquiries.id, id))
        .returning();
      await recordEntityStatusChange({
        entityType: 'product_enquiry',
        entityId: existing.id,
        entityCode: existing.enquiryNumber,
        customerId: existing.customerId,
        userId: existing.userId,
        customerEmail: existing.email,
        previousStatus: existing.status,
        newStatus: 'Archived',
        actionType: 'archive',
        reason,
        adminId: req.dbUser!.uid,
        adminEmail: req.dbUser!.email,
        originalRecord: existing as unknown as Record<string, unknown>,
      });
      if (existing.userId) {
        await createNotification({
          userId: existing.userId,
          title: `Enquiry ${existing.enquiryNumber} Archived`,
          message: `Reason: ${reason}. Full record remains saved in your Enquiry History.`,
          link: '/my-account?tab=enquiries',
        }).catch(() => {});
      }
      return res.json({ archived: true, updated: archived });
    }

    if (source === 'support') {
      const [existing] = await db.select().from(supportTickets).where(eq(supportTickets.id, id)).limit(1);
      if (!existing) return res.status(404).json({ error: 'Ticket not found.' });
      const [archived] = await db
        .update(supportTickets)
        .set({ isDeleted: true, archivedAt: now, archivedReason: reason, archivedBy: req.dbUser!.email, updatedAt: now })
        .where(eq(supportTickets.id, id))
        .returning();
      await recordEntityStatusChange({
        entityType: 'support_ticket',
        entityId: existing.id,
        entityCode: existing.ticketNumber,
        customerId: existing.customerId,
        userId: existing.userId,
        customerEmail: existing.email,
        previousStatus: existing.status,
        newStatus: 'Archived',
        actionType: 'archive',
        reason,
        adminId: req.dbUser!.uid,
        adminEmail: req.dbUser!.email,
        originalRecord: existing as unknown as Record<string, unknown>,
      });
      if (existing.userId) {
        await createNotification({
          userId: existing.userId,
          title: `Ticket ${existing.ticketNumber} Archived`,
          message: `Reason: ${reason}. Full record remains saved in your Enquiry History.`,
          link: '/my-account?tab=enquiries',
        }).catch(() => {});
      }
      return res.json({ archived: true, updated: archived });
    }

    if (source === 'project') {
      const [existing] = await db.select().from(projectEnquiries).where(eq(projectEnquiries.id, id)).limit(1);
      if (!existing) return res.status(404).json({ error: 'Project enquiry not found.' });
      const [archived] = await db
        .update(projectEnquiries)
        .set({ isDeleted: true, archivedAt: now, archivedReason: reason, archivedBy: req.dbUser!.email, updatedAt: now })
        .where(eq(projectEnquiries.id, id))
        .returning();
      await recordEntityStatusChange({
        entityType: 'project_enquiry',
        entityId: existing.id,
        entityCode: existing.enquiryNumber,
        customerId: existing.customerId,
        userId: existing.userId,
        customerEmail: existing.customerEmail,
        previousStatus: existing.status,
        newStatus: 'Archived',
        actionType: 'archive',
        reason,
        adminId: req.dbUser!.uid,
        adminEmail: req.dbUser!.email,
        originalRecord: existing as unknown as Record<string, unknown>,
      });
      await db
        .update(serviceRecords)
        .set({ isDeleted: true, archivedAt: now, archivedReason: reason, archivedBy: req.dbUser!.email, status: 'Archived', updatedAt: now })
        .where(eq(serviceRecords.sourceEntityId, existing.enquiryNumber))
        .catch(() => {});
      if (existing.userId) {
        await createNotification({
          userId: existing.userId,
          title: `Project Enquiry ${existing.enquiryNumber} Archived`,
          message: `Reason: ${reason}. Full record remains saved in your Enquiry History.`,
          link: '/my-account?tab=enquiries',
        }).catch(() => {});
      }
      return res.json({ archived: true, updated: archived });
    }

    if (source === 'pcb') {
      const [existing] = await db.select().from(pcbEnquiries).where(eq(pcbEnquiries.id, id)).limit(1);
      if (!existing) return res.status(404).json({ error: 'PCB enquiry not found.' });
      const [archived] = await db
        .update(pcbEnquiries)
        .set({ isDeleted: true, archivedAt: now, archivedReason: reason, archivedBy: req.dbUser!.email, updatedAt: now })
        .where(eq(pcbEnquiries.id, id))
        .returning();
      await recordEntityStatusChange({
        entityType: 'pcb_enquiry',
        entityId: existing.id,
        entityCode: existing.enquiryNumber,
        customerId: existing.customerId,
        userId: existing.userId,
        customerEmail: existing.email,
        previousStatus: existing.status,
        newStatus: 'Archived',
        actionType: 'archive',
        reason,
        adminId: req.dbUser!.uid,
        adminEmail: req.dbUser!.email,
        originalRecord: existing as unknown as Record<string, unknown>,
      });
      await db
        .update(serviceRecords)
        .set({ isDeleted: true, archivedAt: now, archivedReason: reason, archivedBy: req.dbUser!.email, status: 'Archived', updatedAt: now })
        .where(eq(serviceRecords.sourceEntityId, existing.enquiryNumber))
        .catch(() => {});
      if (existing.userId) {
        await createNotification({
          userId: existing.userId,
          title: `PCB Enquiry ${existing.enquiryNumber} Archived`,
          message: `Reason: ${reason}. Full record remains saved in your Enquiry History.`,
          link: '/my-account?tab=enquiries',
        }).catch(() => {});
      }
      return res.json({ archived: true, updated: archived });
    }

    if (source === 'b2b') {
      const [existing] = await db.select().from(b2bEnquiries).where(eq(b2bEnquiries.id, id)).limit(1);
      if (!existing) return res.status(404).json({ error: 'B2B enquiry not found.' });
      const [archived] = await db
        .update(b2bEnquiries)
        .set({ isDeleted: true, archivedAt: now, archivedReason: reason, archivedBy: req.dbUser!.email, updatedAt: now })
        .where(eq(b2bEnquiries.id, id))
        .returning();
      await recordEntityStatusChange({
        entityType: 'b2b_enquiry',
        entityId: existing.id,
        entityCode: existing.enquiryNumber,
        customerId: existing.customerId,
        userId: existing.userId,
        customerEmail: existing.email,
        previousStatus: existing.status,
        newStatus: 'Archived',
        actionType: 'archive',
        reason,
        adminId: req.dbUser!.uid,
        adminEmail: req.dbUser!.email,
        originalRecord: existing as unknown as Record<string, unknown>,
      });
      await db
        .update(serviceRecords)
        .set({ isDeleted: true, archivedAt: now, archivedReason: reason, archivedBy: req.dbUser!.email, status: 'Archived', updatedAt: now })
        .where(eq(serviceRecords.sourceEntityId, existing.enquiryNumber))
        .catch(() => {});
      if (existing.userId) {
        await createNotification({
          userId: existing.userId,
          title: `B2B RFQ ${existing.enquiryNumber} Archived`,
          message: `Reason: ${reason}. Full record remains saved in your Enquiry History.`,
          link: '/my-account?tab=enquiries',
        }).catch(() => {});
      }
      return res.json({ archived: true, updated: archived });
    }

    return res.status(400).json({ error: `Unsupported enquiry source '${source}'.` });
  } catch (error) {
    console.error('Archive enquiry error:', error);
    res.status(500).json({ error: 'Failed to archive enquiry.' });
  }
});

adminOperationsRouter.post(
  '/enquiries/:source/:id/reply',
  enquiryReplyUpload.array('attachments', 5),
  async (req: AuthRequest, res) => {
    try {
      const source = String(req.params.source || '') as EnquirySource;
      const id = Number(req.params.id);
      const messageText = String(req.body.message || '').trim();
      const nextStatus = req.body.status ? String(req.body.status).trim() : '';
      const priority = req.body.priority ? String(req.body.priority).trim() : '';
      const assignedStaff = req.body.assignedStaff !== undefined ? String(req.body.assignedStaff) : undefined;
      const internalNotes = req.body.internalNotes !== undefined ? String(req.body.internalNotes) : undefined;
      const sendEmail = req.body.sendEmail === true || req.body.sendEmail === 'true';

      const files = (req.files as Express.Multer.File[]) || [];
      if (!messageText && files.length === 0) {
        return res.status(400).json({ error: 'Please enter a reply message or attach a quotation/document.' });
      }
      if (files.length > 0 && !isSupabaseStorageConfigured()) {
        return res.status(503).json({
          error: 'Supabase Storage is not configured. Configure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to store reply attachments.',
        });
      }

      const uploadedAttachments = await Promise.all(
        files.map(async (f) => {
          const uploaded =
            source === 'project'
              ? await uploadProjectDocumentToSupabase({
                  buffer: f.buffer,
                  originalName: f.originalname,
                  mimeType: f.mimetype || 'application/octet-stream',
                  ownerUid: `enquiry_${id}`,
                  folder: `reply-attachments`,
                })
              : await uploadSupportFileToSupabase({
                  buffer: f.buffer,
                  originalName: f.originalname,
                  mimeType: f.mimetype || 'application/octet-stream',
                  ownerUid: `${source}_${id}`,
                });
          return {
            originalName: f.originalname,
            storagePath: uploaded.storagePath,
            storageBucket: uploaded.bucket,
            sizeBytes: f.size,
          };
        })
      );

      const replyEntry = {
        sender: req.dbUser!.fullName || req.dbUser!.email,
        role: 'admin',
        message: messageText || `Attached ${uploadedAttachments.length} document(s).`,
        attachments: uploadedAttachments,
        timestamp: new Date().toISOString(),
      };

      let recipientEmail = '';
      let recipientName = 'Customer';
      let targetUserId: number | null = null;
      let enquiryNumber = '';
      let subjectLabel = 'Your Enquiry';
      let finalStatus = nextStatus;

      if (source === 'product') {
        const [existing] = await db.select().from(productEnquiries).where(eq(productEnquiries.id, id)).limit(1);
        if (!existing) return res.status(404).json({ error: 'Enquiry not found.' });
        finalStatus = nextStatus || (uploadedAttachments.length > 0 ? 'Quotation Sent' : 'Contacted');
        const [updated] = await db
          .update(productEnquiries)
          .set({
            status: finalStatus,
            priority: priority || existing.priority,
            assignedStaff: assignedStaff !== undefined ? assignedStaff : existing.assignedStaff,
            internalNotes: internalNotes !== undefined ? internalNotes : existing.internalNotes,
            attachments: [...(existing.attachments || []), ...uploadedAttachments],
            replies: [...(existing.replies || []), replyEntry],
            updatedAt: new Date(),
          })
          .where(eq(productEnquiries.id, id))
          .returning();
        recipientEmail = updated.email;
        recipientName = updated.fullName;
        targetUserId = updated.userId;
        enquiryNumber = updated.enquiryNumber;
        subjectLabel = updated.subject || updated.interestedProduct;
        syncProductEnquiryToSupabase({
          enquiryNumber: updated.enquiryNumber,
          fullName: updated.fullName,
          mobile: updated.mobile,
          email: updated.email,
          interestedProduct: updated.interestedProduct,
          status: updated.status,
          assignedStaff: updated.assignedStaff,
          internalNotes: updated.internalNotes,
        }).catch(() => {});
      } else if (source === 'support') {
        const [existing] = await db.select().from(supportTickets).where(eq(supportTickets.id, id)).limit(1);
        if (!existing) return res.status(404).json({ error: 'Ticket not found.' });
        finalStatus = nextStatus || (uploadedAttachments.length > 0 ? 'Quotation Sent' : 'Contacted');
        const nextMessages = [
          ...(existing.messages || []),
          {
            sender: replyEntry.sender,
            role: 'admin',
            text: replyEntry.message,
            attachments: uploadedAttachments,
            timestamp: replyEntry.timestamp,
          },
        ];
        const [updated] = await db
          .update(supportTickets)
          .set({
            status: finalStatus,
            priority: priority || existing.priority,
            assignedStaff: assignedStaff !== undefined ? assignedStaff : existing.assignedStaff,
            internalNotes: internalNotes !== undefined ? internalNotes : existing.internalNotes,
            messages: nextMessages,
            updatedAt: new Date(),
          })
          .where(eq(supportTickets.id, id))
          .returning();
        recipientEmail = updated.email;
        recipientName = updated.name;
        targetUserId = updated.userId;
        enquiryNumber = updated.ticketNumber;
        subjectLabel = updated.subject;
        syncEnquiryToSupabase({
          ticketNumber: updated.ticketNumber,
          name: updated.name,
          email: updated.email,
          mobile: updated.mobile,
          category: updated.serviceCategory,
          subject: updated.subject,
          message: updated.message,
          status: updated.status,
          staffReply: replyEntry.message,
        }).catch(() => {});
        syncSupportTicketToSupabase({
          ticketNumber: updated.ticketNumber,
          userUid: '',
          subject: updated.subject,
          serviceCategory: updated.serviceCategory,
          status: updated.status,
          messages: updated.messages,
        }).catch(() => {});
      } else if (source === 'project') {
        const [existing] = await db.select().from(projectEnquiries).where(eq(projectEnquiries.id, id)).limit(1);
        if (!existing) return res.status(404).json({ error: 'Project enquiry not found.' });
        finalStatus = nextStatus || existing.status;
        const [projRow] = await db.select().from(projects).where(eq(projects.enquiryId, existing.id)).limit(1);
        const [createdMsg] = await db
          .insert(projectMessages)
          .values({
            enquiryId: existing.id,
            projectId: projRow?.id || null,
            userId: existing.userId,
            senderEmail: req.dbUser!.email,
            senderName: req.dbUser!.fullName || req.dbUser!.email,
            senderRole: 'admin',
            message: replyEntry.message,
            attachments: uploadedAttachments,
          })
          .returning();
        await db
          .update(projectEnquiries)
          .set({
            status: finalStatus,
            priority: priority || existing.priority,
            assignedEngineer: assignedStaff !== undefined ? assignedStaff : existing.assignedEngineer,
            internalNotes: internalNotes !== undefined ? internalNotes : existing.internalNotes,
            attachments: [...(existing.attachments || []), ...uploadedAttachments],
            updatedAt: new Date(),
          })
          .where(eq(projectEnquiries.id, existing.id));
        recipientEmail = existing.customerEmail;
        recipientName = existing.customerName;
        targetUserId = existing.userId;
        enquiryNumber = existing.enquiryNumber;
        subjectLabel = existing.projectTitle;
        syncProjectMessageToSupabase({
          registrationNumber: existing.enquiryNumber,
          userUid: '',
          senderEmail: req.dbUser!.email,
          senderName: replyEntry.sender,
          senderRole: 'admin',
          message: createdMsg.message,
          attachments: uploadedAttachments,
        }).catch(() => {});
      } else if (source === 'pcb') {
        const [existing] = await db.select().from(pcbEnquiries).where(eq(pcbEnquiries.id, id)).limit(1);
        if (!existing) return res.status(404).json({ error: 'PCB enquiry not found.' });
        finalStatus = nextStatus || (uploadedAttachments.length > 0 ? 'Quotation Sent' : 'Contacted');
        const [updated] = await db
          .update(pcbEnquiries)
          .set({
            status: finalStatus,
            priority: priority || existing.priority,
            assignedStaff: assignedStaff !== undefined ? assignedStaff : existing.assignedStaff,
            adminNotes: internalNotes !== undefined ? internalNotes : existing.adminNotes,
            attachments: [...(existing.attachments || []), ...uploadedAttachments],
            replies: [...(existing.replies || []), replyEntry],
            updatedAt: new Date(),
          })
          .where(eq(pcbEnquiries.id, id))
          .returning();
        recipientEmail = updated.email;
        recipientName = updated.customerName;
        targetUserId = updated.userId;
        enquiryNumber = updated.enquiryNumber;
        subjectLabel = `PCB Fabrication (${updated.boardDimensionsMm})`;
        syncPcbEnquiryToSupabase({
          enquiryNumber: updated.enquiryNumber,
          userUid: '',
          customerName: updated.customerName,
          email: updated.email,
          mobile: updated.mobile,
          boardDimensionsMm: updated.boardDimensionsMm,
          layerCount: updated.layerCount,
          boardQuantity: updated.boardQuantity,
          assemblyRequired: updated.assemblyRequired,
          status: updated.status,
        }).catch(() => {});
      } else if (source === 'b2b') {
        const [existing] = await db.select().from(b2bEnquiries).where(eq(b2bEnquiries.id, id)).limit(1);
        if (!existing) return res.status(404).json({ error: 'B2B enquiry not found.' });
        finalStatus = nextStatus || (uploadedAttachments.length > 0 ? 'Quotation Sent' : 'Contacted');
        const [updated] = await db
          .update(b2bEnquiries)
          .set({
            status: finalStatus,
            priority: priority || existing.priority,
            assignedStaff: assignedStaff !== undefined ? assignedStaff : existing.assignedStaff,
            adminNotes: internalNotes !== undefined ? internalNotes : existing.adminNotes,
            attachments: [...(existing.attachments || []), ...uploadedAttachments],
            replies: [...(existing.replies || []), replyEntry],
            updatedAt: new Date(),
          })
          .where(eq(b2bEnquiries.id, id))
          .returning();
        recipientEmail = updated.email;
        recipientName = updated.contactPerson;
        targetUserId = updated.userId;
        enquiryNumber = updated.enquiryNumber;
        subjectLabel = `B2B Bulk RFQ (${updated.requirementCategory})`;
        syncB2bEnquiryToSupabase({
          enquiryNumber: updated.enquiryNumber,
          userUid: '',
          companyName: updated.companyName,
          contactPerson: updated.contactPerson,
          email: updated.email,
          mobile: updated.mobile,
          requirementCategory: updated.requirementCategory,
          quantity: updated.quantity,
          technicalSpecs: updated.technicalSpecs,
          shippingLocation: updated.shippingLocation,
          status: updated.status,
        }).catch(() => {});
      } else {
        return res.status(400).json({ error: `Unsupported enquiry source '${source}'.` });
      }

      if (targetUserId) {
        createNotification({
          userId: targetUserId,
          title: `Response to Enquiry ${enquiryNumber}`,
          message: `${replyEntry.message.slice(0, 140)} (Status: ${finalStatus})`,
          link: '/my-account',
        }).catch(() => {});
      }

      if (sendEmail && recipientEmail) {
        await dispatchLifecycleEmail({
          userId: targetUserId,
          recipientEmail,
          eventType: 'enquiry_reply',
          vars: {
            customerName: recipientName,
            enquiryNumber,
            subject: subjectLabel,
            replyMessage: replyEntry.message,
            status: finalStatus,
          },
        }).catch(() => {});
      }

      await logAudit({
        actorUid: req.dbUser!.uid,
        actorEmail: req.dbUser!.email,
        action: 'ADMIN_REPLY_ENQUIRY',
        entityType: `enquiry_${source}`,
        entityId: enquiryNumber || id,
        details: { status: finalStatus, attachmentsCount: uploadedAttachments.length, sendEmail },
      });

      emitAdminStreamEvent({ type: 'enquiry', action: 'replied', id: enquiryNumber });
      res.status(201).json({ ok: true, reply: replyEntry, status: finalStatus });
    } catch (error) {
      console.error('Reply to enquiry error:', error);
      res.status(500).json({ error: 'Failed to send enquiry reply.' });
    }
  }
);

adminOperationsRouter.get('/enquiries/attachment', async (req, res) => {
  try {
    const rawPath = String(req.query.path || '').trim();
    const bucketParam = String(req.query.bucket || '').trim();
    if (!rawPath) return res.status(400).json({ error: 'Attachment path is required.' });

    const candidateBuckets = bucketParam
      ? [bucketParam]
      : [
          'project-attachments',
          'project-agreements',
          'company-assets',
          'support-files',
          'project-documents',
          'pcb-files',
          'customer-uploads',
          'project-files',
          'agreements',
          'printing-files',
        ];
    for (const bucket of candidateBuckets) {
      const remoteBuf = await downloadFromSupabaseStorage(bucket, rawPath);
      if (remoteBuf) {
        res.setHeader('Cache-Control', 'no-store, private');
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(path.basename(rawPath))}"`);
        return res.send(remoteBuf);
      }
    }

    const resolved = path.isAbsolute(rawPath) ? path.resolve(rawPath) : path.resolve(UPLOADS_ROOT, rawPath);
    if (!resolved.startsWith(UPLOADS_ROOT) || !fs.existsSync(resolved)) {
      return res.status(404).json({ error: 'Attachment file not found in Supabase Storage.' });
    }
    res.download(resolved, path.basename(resolved));
  } catch {
    res.status(500).json({ error: 'Failed to download attachment.' });
  }
});

// ============================================================================
// 5. ENGINEERING PROJECTS DOCUMENTS & CSV EXPORT
// ============================================================================
adminOperationsRouter.post(
  '/projects/:id/documents',
  projectDesignDocUpload.array('documents', 8),
  async (req: AuthRequest, res) => {
    try {
      const projectId = Number(req.params.id);
      const [existing] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
      if (!existing) return res.status(404).json({ error: 'Project not found.' });

      const files = (req.files as Express.Multer.File[]) || [];
      if (files.length === 0) {
        return res.status(400).json({ error: 'Please select at least one design document or quotation file.' });
      }
      if (!isSupabaseStorageConfigured()) {
        return res.status(503).json({
          error: 'Supabase Storage is not configured. Configure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to store project documents.',
        });
      }
      const docKind = String(req.body.kind || 'design_document').trim();
      const nowIso = new Date().toISOString();

      const addedDocs = await Promise.all(
        files.map(async (f) => {
          const uploaded = await uploadProjectDocumentToSupabase({
            buffer: f.buffer,
            originalName: f.originalname,
            mimeType: f.mimetype || 'application/octet-stream',
            ownerUid: existing.customerId || existing.projectCode,
            folder: `${existing.projectCode}-design-docs`,
          });
          return {
            originalName: f.originalname,
            storagePath: uploaded.storagePath,
            storageBucket: uploaded.bucket,
            sizeBytes: f.size,
            uploadedBy: req.dbUser!.email,
            uploadedAt: nowIso,
            kind: docKind,
          };
        })
      );

      const nextDocs = [...(Array.isArray(existing.designDocuments) ? existing.designDocuments : []), ...addedDocs];
      const [updated] = await db
        .update(projects)
        .set({ designDocuments: nextDocs, updatedAt: new Date() })
        .where(eq(projects.id, projectId))
        .returning();

      if (updated.userId) {
        createNotification({
          userId: updated.userId,
          title: `New Project Document Uploaded — ${updated.projectCode}`,
          message: `${addedDocs.map((d) => d.originalName).join(', ')} uploaded to your project workspace.`,
          link: '/my-account/project-enquiries',
        }).catch(() => {});
      }

      emitAdminStreamEvent({ type: 'project', action: 'documents_uploaded', id: updated.projectCode });
      res.status(201).json({ project: updated, addedDocuments: addedDocs });
    } catch (error) {
      console.error('Upload project design docs error:', error);
      res.status(500).json({ error: 'Failed to upload project documents.' });
    }
  }
);

adminOperationsRouter.get('/projects/export', async (_req, res) => {
  try {
    const [{ userById, resolveCustomerId }, allProj, allEnq] = await Promise.all([
      buildCustomerCodeLookup(),
      db.select().from(projects).where(eq(projects.isDeleted, false)).orderBy(desc(projects.createdAt)),
      db.select().from(projectEnquiries).where(eq(projectEnquiries.isDeleted, false)),
    ]);
    const enqById = new Map(allEnq.map((e) => [e.id, e]));
    const headers = [
      'Project ID',
      'Enquiry ID',
      'Customer ID',
      'Customer Name',
      'Email',
      'Project Title',
      'Category',
      'Budget (INR)',
      'Total Quoted (INR)',
      'Paid (INR)',
      'Balance (INR)',
      'Assigned Engineer',
      'Status',
      'Progress %',
      'Created Date',
    ];
    const rows = allProj.map((p) => {
      const enq = enqById.get(p.enquiryId);
      const u = p.userId ? userById.get(p.userId) : undefined;
      const cid = resolveCustomerId(p.userId, enq?.customerEmail || u?.email, p.customerId || enq?.customerId);
      return [
        p.projectCode,
        enq?.enquiryNumber || '',
        cid,
        enq?.customerName || u?.fullName || '',
        enq?.customerEmail || u?.email || '',
        p.title,
        p.category || enq?.projectCategory || '',
        p.budgetInr || p.totalAmountInr || 0,
        p.totalAmountInr,
        p.paidAmountInr,
        p.balanceAmountInr,
        p.assignedEngineer,
        p.status,
        p.progressPercent,
        new Date(p.createdAt).toISOString().slice(0, 10),
      ];
    });
    const csv = buildCsv(headers, rows);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="nexustekfusion-projects-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csv);
  } catch {
    res.status(500).json({ error: 'Failed to export projects CSV.' });
  }
});

// ============================================================================
// 6. INVOICES & BILLING REPORT (PAID / UNPAID, SEARCH BY INVOICE / CUSTOMER ID)
// ============================================================================
async function queryEnrichedInvoices(query: Record<string, any>) {
  const [{ userById, resolveCustomerId }, allInv, allStoreOrders, allPayments, allQuotations, allEnq] = await Promise.all([
    buildCustomerCodeLookup(),
    db.select().from(invoices).where(eq(invoices.isDeleted, false)).orderBy(desc(invoices.issuedAt)),
    db.select().from(storeOrders).where(eq(storeOrders.isDeleted, false)),
    db.select().from(payments),
    db.select().from(projectQuotations),
    db.select().from(projectEnquiries).where(eq(projectEnquiries.isDeleted, false)),
  ]);

  const orderById = new Map(allStoreOrders.map((o) => [o.id, o]));
  const quoteById = new Map(allQuotations.map((q) => [q.id, q]));
  const enqById = new Map(allEnq.map((e) => [e.id, e]));
  const paidEntityKeys = new Set(
    allPayments.filter((p) => p.status === 'verified').map((p) => `${p.entityType}:${p.entityId}`)
  );

  const enriched = allInv.map((inv) => {
    const payload = (inv.payload || {}) as Record<string, any>;
    const u = inv.userId ? userById.get(inv.userId) : undefined;
    const customerEmail = String(payload.customerEmail || u?.email || '');
    const customerName = String(payload.customerName || u?.fullName || 'Customer');
    const customerId = resolveCustomerId(inv.userId, customerEmail);

    let linkedRef = String(payload.orderNumber || payload.projectCode || payload.enquiryNumber || '');
    let isPaid = paidEntityKeys.has(`${inv.entityType}:${inv.entityId}`);
    if (inv.entityType === 'store_order') {
      const ord = orderById.get(inv.entityId);
      if (ord) {
        linkedRef = linkedRef || ord.orderNumber;
        if (ord.paymentStatus === 'paid') isPaid = true;
      }
    } else if (inv.entityType === 'project_quotation') {
      const q = quoteById.get(inv.entityId);
      if (q) {
        const enq = enqById.get(q.enquiryId);
        linkedRef = linkedRef || q.quotationNumber || enq?.enquiryNumber || '';
        if (q.paymentStatus === 'paid' || q.paidAmountInr > 0) isPaid = true;
      }
    }

    return {
      ...inv,
      customerId,
      customerName,
      customerEmail,
      linkedRef,
      paymentStatus: isPaid ? 'paid' : 'unpaid',
    };
  });

  const search = String(query.search || '').trim().toLowerCase();
  const paymentStatusFilter = String(query.paymentStatus || 'all').trim().toLowerCase();
  const { fromMs, toMs } = parseDateBounds(query.dateFrom, query.dateTo);

  const filtered = enriched.filter((inv) => {
    if (paymentStatusFilter !== 'all' && inv.paymentStatus !== paymentStatusFilter) return false;
    if (!withinDateBounds(inv.issuedAt, fromMs, toMs)) return false;
    if (search) {
      const hay = [inv.invoiceNumber, inv.customerId, inv.customerName, inv.customerEmail, inv.linkedRef, inv.docType]
        .join(' ')
        .toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });

  return { enriched, filtered };
}

adminOperationsRouter.get('/invoices/report', async (req, res) => {
  try {
    const { enriched, filtered } = await queryEnrichedInvoices(req.query);
    const page = Math.max(1, Number(req.query.page || 1));
    const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize || 25)));
    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(totalPages, page);

    res.json({
      items: filtered.slice((safePage - 1) * pageSize, safePage * pageSize),
      pagination: { page: safePage, pageSize, total, totalPages },
      summary: {
        totalInvoices: enriched.length,
        paidCount: enriched.filter((i) => i.paymentStatus === 'paid').length,
        unpaidCount: enriched.filter((i) => i.paymentStatus === 'unpaid').length,
        totalBilledInr: filtered.reduce((s, i) => s + (i.amountInr || 0), 0),
        totalTaxInr: filtered.reduce((s, i) => s + (i.gstInr || 0), 0),
      },
    });
  } catch (error) {
    console.error('Invoices report error:', error);
    res.status(500).json({ error: 'Failed to load billing report.' });
  }
});

adminOperationsRouter.get('/invoices/export', async (req, res) => {
  try {
    const { filtered } = await queryEnrichedInvoices(req.query);
    const headers = [
      'Invoice Number',
      'Document Type',
      'Customer ID',
      'Customer Name',
      'Customer Email',
      'Linked Order / Project',
      'Payment Status',
      'Amount (INR)',
      'GST (INR)',
      'Issued Date',
    ];
    const rows = filtered.map((inv) => [
      inv.invoiceNumber,
      inv.docType,
      inv.customerId,
      inv.customerName,
      inv.customerEmail,
      inv.linkedRef,
      inv.paymentStatus.toUpperCase(),
      inv.amountInr,
      inv.gstInr,
      new Date(inv.issuedAt).toISOString().slice(0, 10),
    ]);
    const csv = buildCsv(headers, rows);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="nexustekfusion-billing-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csv);
  } catch {
    res.status(500).json({ error: 'Failed to export billing CSV.' });
  }
});

// Unified Service Records Management (Admin View, Create, Assign, Remarks, Pricing, Soft-Archive)
adminOperationsRouter.get('/service-records', async (req, res) => {
  try {
    const includeArchived = req.query.includeArchived !== 'false';
    const category = String(req.query.category || '').trim();
    const status = String(req.query.status || '').trim();
    const [allRows, catalog] = await Promise.all([
      db.select().from(serviceRecords).orderBy(desc(serviceRecords.createdAt)),
      listActiveServicesCatalog(),
    ]);
    const filtered = allRows.filter((r) => {
      if (!includeArchived && r.isDeleted) return false;
      if (category && category !== 'all' && r.category !== category) return false;
      if (status && status !== 'all' && r.status !== status) return false;
      return true;
    });
    res.json({ serviceRecords: filtered, services: catalog });
  } catch (error) {
    console.error('Admin service records list error:', error);
    res.status(500).json({ error: 'Failed to load service records.' });
  }
});

adminOperationsRouter.post('/service-records', async (req: AuthRequest, res) => {
  try {
    const b = req.body || {};
    const serviceName = String(b.serviceName || '').trim();
    const category = String(b.category || 'Engineering').trim();
    if (serviceName.length < 2) {
      return res.status(400).json({ error: 'Service name is required.' });
    }

    let resolvedUserId = b.userId ? Number(b.userId) : null;
    let resolvedUid = '';
    let resolvedCustomerId = String(b.customerId || '').trim();
    let resolvedEmail = String(b.customerEmail || '').trim().toLowerCase();

    if (!resolvedUserId && resolvedEmail) {
      const [matchedUser] = await db
        .select()
        .from(users)
        .where(eq(users.email, resolvedEmail))
        .limit(1);
      if (matchedUser) {
        resolvedUserId = matchedUser.id;
        resolvedUid = matchedUser.uid;
        resolvedCustomerId = resolvedCustomerId || matchedUser.uid;
      }
    } else if (resolvedUserId) {
      const [matchedUser] = await db
        .select()
        .from(users)
        .where(eq(users.id, resolvedUserId))
        .limit(1);
      if (matchedUser) {
        resolvedUid = matchedUser.uid;
        resolvedEmail = resolvedEmail || matchedUser.email;
        resolvedCustomerId = resolvedCustomerId || matchedUser.uid;
      }
    }

    const record = await createOrSyncServiceRecord({
      serviceCode: b.serviceCode ? String(b.serviceCode) : undefined,
      userId: resolvedUserId,
      userUid: resolvedUid,
      customerId: resolvedCustomerId,
      customerEmail: resolvedEmail,
      serviceName,
      category,
      description: String(b.description || ''),
      specifications: String(b.specifications || ''),
      selectedOptions: b.selectedOptions && typeof b.selectedOptions === 'object' ? b.selectedOptions : {},
      quantity: Math.max(1, Number(b.quantity || 1)),
      unitPriceInr: Number(b.unitPriceInr || 0),
      taxInr: Number(b.taxInr || 0),
      totalAmountInr: Number(b.totalAmountInr || 0),
      status: String(b.status || 'Pending'),
      adminRemarks: String(b.adminRemarks || ''),
      assignedTeam: String(b.assignedTeam || ''),
      sourceEntityType: String(b.sourceEntityType || 'admin_created'),
      sourceEntityId: String(b.sourceEntityId || generateCode('NTF-ADM-SRV')),
    });

    await logAudit({
      actorUid: req.dbUser!.uid,
      actorEmail: req.dbUser!.email,
      action: 'CREATE_SERVICE_RECORD',
      entityType: 'service_record',
      entityId: record.serviceRecordNumber,
      details: { serviceName: record.serviceName, customerId: record.customerId },
    });

    if (resolvedUserId) {
      emitCustomerStreamEvent(resolvedUserId, {
        type: 'service_record',
        action: 'created',
        id: record.serviceRecordNumber,
        summary: record.serviceName,
      });
    }

    res.status(201).json({ serviceRecord: record });
  } catch (error) {
    console.error('Admin create service record error:', error);
    res.status(500).json({ error: 'Failed to create service record.' });
  }
});

adminOperationsRouter.patch('/service-records/:id', async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Invalid service record ID.' });
    }
    const b = req.body || {};
    const updated = await updateServiceRecordByAdmin({
      id,
      status: b.status !== undefined ? String(b.status) : undefined,
      adminRemarks: b.adminRemarks !== undefined ? String(b.adminRemarks) : undefined,
      assignedTeam: b.assignedTeam !== undefined ? String(b.assignedTeam) : undefined,
      unitPriceInr: b.unitPriceInr !== undefined ? Number(b.unitPriceInr) : undefined,
      taxInr: b.taxInr !== undefined ? Number(b.taxInr) : undefined,
      totalAmountInr: b.totalAmountInr !== undefined ? Number(b.totalAmountInr) : undefined,
      archive: Boolean(b.archive),
      archivedReason: b.archivedReason ? String(b.archivedReason) : undefined,
      adminUid: req.dbUser!.uid,
      adminEmail: req.dbUser!.email,
    });
    if (!updated) return res.status(404).json({ error: 'Service record not found.' });
    res.json({ serviceRecord: updated });
  } catch (error) {
    console.error('Admin update service record error:', error);
    res.status(500).json({ error: 'Failed to update service record.' });
  }
});

adminOperationsRouter.delete('/service-records/:id', async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Invalid service record ID.' });
    }
    const reason = String(req.body?.reason || req.query?.reason || 'Archived by Administrator').trim();
    const updated = await updateServiceRecordByAdmin({
      id,
      archive: true,
      archivedReason: reason,
      adminUid: req.dbUser!.uid,
      adminEmail: req.dbUser!.email,
    });
    if (!updated) return res.status(404).json({ error: 'Service record not found.' });
    res.json({ archived: true, serviceRecord: updated });
  } catch (error) {
    console.error('Admin archive service record error:', error);
    res.status(500).json({ error: 'Failed to archive service record.' });
  }
});
