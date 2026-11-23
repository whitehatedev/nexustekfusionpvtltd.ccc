import crypto from 'crypto';
import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { and, asc, desc, eq, isNull, lte } from 'drizzle-orm';
import { createPool, db } from '../../db/index.ts';
import {
  adminNotifications,
  adminSessions,
  agreementSettings,
  auditLogs,
  b2bEnquiries,
  blogs,
  brands,
  caseStudies,
  cmsPages,
  cmsRevisions,
  coupons,
  crmLeads,
  crmNotes,
  customerCarts,
  customers,
  droneRepairBookings,
  inventoryMovements,
  invoices,
  mediaAssets,
  newsletterSubscribers,
  paymentClearanceCertificates,
  paymentInstallments,
  paymentReceipts,
  paymentRefunds,
  paymentReminders,
  paymentTransactions,
  payments,
  pcbEnquiries,
  printingFileDownloadLogs,
  printingMachines,
  printingMaterials,
  printingOrders,
  printingProductionFiles,
  productCategories,
  productEnquiries,
  products,
  projectAcceptances,
  projectAgreements,
  projectAttachments,
  projectDeliveryRecords,
  projectEmailNotifications,
  projectEnquiries,
  projectHandoverDocuments,
  projectMessages,
  projectPaymentMilestones,
  projectPaymentPlans,
  projectPayments,
  projectQuotations,
  projectWorkOrders,
  projects,
  razorpayPaymentLinks,
  serviceRecords,
  siteSettings,
  storeOrders,
  supportTickets,
  teamMembers,
  users,
  websiteBanners,
} from '../../db/schema.ts';
import { ADMIN_ROLES, AuthRequest, requireAdmin, requireAuth, requireCloudDatabase } from '../../middleware/auth.ts';
import {
  createMemoryUploadMiddleware,
  createNotification,
  generateCode,
  logAudit,
  UPLOADS_ROOT,
} from '../utils.ts';
import { createRazorpayPaymentLink, createRazorpayRefund, encryptSecret, getRazorpayCredentials } from '../razorpay.ts';
import {
  deleteCmsMediaFromSupabase,
  downloadPrintingFileFromSupabase,
  getSigned3DModelUrl,
  isSupabaseStorageConfigured,
  upload3DModelToSupabase,
  uploadCmsMediaToSupabase,
  uploadProductImageToSupabase,
  uploadProjectAttachmentToSupabase,
  uploadProjectDocumentToSupabase,
  uploadProjectFileToSupabase,
} from '../../lib/supabase-admin.ts';
import {
  checkPrintingAuthorization,
  createProduction3DMemoryUploadMiddleware,
  getPaymentStatusDisplay,
  PRINTING_EXECUTION_STATUSES,
  PRINTING_ORDER_STATUSES,
  recordPrintingDownloadLog,
  runSingleUploadWithJsonErrors,
} from '../printing-security.ts';
import {
  archivePrintingOrderInSupabase,
  syncPrintingOrderToSupabase,
  syncProductEnquiryToSupabase,
  syncProductToSupabase,
  syncRazorpayPaymentLinkToSupabase,
  syncRefundToSupabase,
  syncStoreOrderToSupabase,
} from '../supabase-ecommerce.ts';
import {
  syncPaymentInstallmentToSupabase,
  syncProjectAttachmentRecordToSupabase,
  syncProjectMessageToSupabase,
  syncProjectPaymentAndHandoverToSupabase,
  syncProjectQuotationToSupabase,
  syncProjectReviewToSupabase,
  syncProjectUpdateToSupabase,
} from '../supabase-projects.ts';
import {
  ADVANCE_REQUIRED_STATUSES,
  FINAL_CLEARANCE_REQUIRED_STATUSES,
  PROJECT_UPDATE_CATEGORIES,
} from '../project-lifecycle.ts';
import {
  autoGenerateAgreementOnProjectApproval,
  ensureProjectForEnquiry,
  getOrCreateAgreementSettings,
  recordInstallmentPayment,
  sendInstallmentPaymentReminder,
  setupProjectPaymentAndInstallments,
} from '../project-upgrade-service.ts';
import { recordEntityStatusChange } from '../record-history.ts';
import { DEFAULT_HOMEPAGE_SECTIONS } from '../seed.ts';
import { listActiveServicesCatalog } from '../service-records-service.ts';
import {
  CMS_MEDIA_CATEGORIES,
  DEFAULT_CMS_BUNDLE,
  DEFAULT_SEO_CONFIG,
  pickNeutralAvatar,
} from '../cms-defaults.ts';
import { DEFAULT_PROJECT_EMAIL_TEMPLATES, dispatchAdminNotificationEmail, dispatchLifecycleEmail } from '../email.ts';
import { adminCustomersRouter } from './admin-customers.ts';
import { adminOperationsRouter } from './admin-operations.ts';
import { adminCloudRouter } from './admin-cloud.ts';
import { emitAdminStreamEvent } from '../admin-realtime.ts';
import {
  findPublicCustomerForUser,
  isPublicCustomersSchemaReady,
  listPublicCustomers,
  updatePublicCustomerRecord,
} from '../supabase-customers.ts';

export const adminRouter = Router();

adminRouter.use(requireAuth);
adminRouter.use(requireAdmin());
adminRouter.use(requireCloudDatabase);
adminRouter.use('/customers', adminCustomersRouter);
adminRouter.use('/', adminOperationsRouter);
adminRouter.use('/', adminCloudRouter);

const mediaUpload = createMemoryUploadMiddleware(
  [
    '.png',
    '.jpg',
    '.jpeg',
    '.webp',
    '.gif',
    '.svg',
    '.mp4',
    '.webm',
    '.mov',
    '.m4v',
    '.pdf',
    '.stl',
    '.obj',
    '.glb',
    '.step',
    '.stp',
  ],
  150
);

function detectMediaKind(mimeType: string, fileName: string): 'image' | 'video' | 'model3d' | 'document' {
  const mime = (mimeType || '').toLowerCase();
  const ext = path.extname(fileName || '').toLowerCase();
  if (mime.startsWith('video/') || ['.mp4', '.webm', '.mov', '.m4v'].includes(ext)) return 'video';
  if (mime.startsWith('image/') || ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'].includes(ext)) return 'image';
  if (['.stl', '.obj', '.glb', '.gltf', '.step', '.stp', '.3mf'].includes(ext)) return 'model3d';
  return 'document';
}

async function syncTeamSettingFromTable() {
  const rows = await db
    .select()
    .from(teamMembers)
    .orderBy(asc(teamMembers.displayOrder), asc(teamMembers.id));
  const mapped = rows.map((m) => ({
    id: m.slugKey,
    dbId: m.id,
    name: m.fullName,
    designation: m.designation,
    department: m.department,
    professionalCategory: m.professionalCategory,
    qualifications: m.qualifications,
    experience: m.experience,
    biography: m.shortBiography,
    detailedBiography: m.detailedBiography,
    responsibilities: m.responsibilities,
    skills: Array.isArray(m.skills) ? m.skills : [],
    linkedinUrl: m.linkedinUrl,
    photoUrl: m.profilePhotoUrl || pickNeutralAvatar(m.slugKey || m.id),
    photoAlt: m.photoAlt || `${m.fullName} — ${m.designation}`,
    displayOrder: m.displayOrder,
    status: (m.status === 'draft' ? 'draft' : 'published') as 'published' | 'draft',
    isFeatured: Boolean(m.isFeatured),
    isActive: Boolean(m.isActive),
  }));
  await db
    .insert(siteSettings)
    .values({ key: 'aboutTeam', value: mapped, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: siteSettings.key,
      set: { value: mapped, updatedAt: new Date() },
    });
  return mapped;
}

const projectUpdateUpload = createMemoryUploadMiddleware(
  ['.png', '.jpg', '.jpeg', '.webp', '.mp4', '.mov', '.avi', '.mkv', '.pdf', '.doc', '.docx', '.zip', '.csv', '.txt'],
  100
);

const projectMessageUpload = createMemoryUploadMiddleware(
  ['.pdf', '.doc', '.docx', '.png', '.jpg', '.jpeg', '.webp', '.mp4', '.zip', '.csv', '.txt'],
  50
);

const handoverUpload = createMemoryUploadMiddleware(
  ['.zip', '.pdf', '.png', '.jpg', '.jpeg', '.doc', '.docx', '.txt', '.csv', '.mp4', '.bin', '.hex'],
  100
);

function toCsv(headers: string[], rows: Array<Array<string | number | boolean | null | undefined>>): string {
  const esc = (v: unknown) => {
    const s = String(v ?? '');
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.map(esc).join(','), ...rows.map((r) => r.map(esc).join(','))].join('\n');
}

function parseCsvRows(csvText: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < csvText.length; i++) {
    const ch = csvText[i];
    if (inQuotes) {
      if (ch === '"' && csvText[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(cell.trim());
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && csvText[i + 1] === '\n') i++;
      row.push(cell.trim());
      if (row.some((c) => c.length > 0)) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell.trim());
    if (row.some((c) => c.length > 0)) rows.push(row);
  }
  return rows;
}

// Overview, Real Database Metrics & Analytics Series
adminRouter.get('/overview', async (req, res) => {
  try {
    const dateFromStr = String(req.query.dateFrom || '').trim();
    const dateToStr = String(req.query.dateTo || '').trim();
    const dateFromMs = dateFromStr ? Date.parse(`${dateFromStr}T00:00:00.000Z`) : NaN;
    const dateToMs = dateToStr ? Date.parse(`${dateToStr}T23:59:59.999Z`) : NaN;
    const inRange = (dt: Date | string | null | undefined) => {
      if (!Number.isFinite(dateFromMs) && !Number.isFinite(dateToMs)) return true;
      if (!dt) return false;
      const ms = new Date(dt).getTime();
      if (!Number.isFinite(ms)) return false;
      if (Number.isFinite(dateFromMs) && ms < dateFromMs) return false;
      if (Number.isFinite(dateToMs) && ms > dateToMs) return false;
      return true;
    };

    const [
      allUsers,
      allStoreOrders,
      allPrintOrders,
      allEnquiries,
      allQuotations,
      allProjects,
      allPayments,
      lowStockProducts,
      recentAudit,
      allPcb,
      allB2b,
      allTickets,
      recentMovements,
      subscribers,
      pages,
      allCategories,
      allProducts,
      allBrands,
      allMedia,
      allBlogs,
      allCaseStudies,
      allCoupons,
      allInvoices,
      allLeads,
      allNotes,
      allReceipts,
      allClearanceCerts,
      allWorkOrders,
      allHandoverDocs,
      allDeliveryRecords,
      allPaymentPlans,
      allPaymentMilestones,
      allEmailLogs,
      allDroneRepairs,
      allRefunds,
      allProjectMessages,
      allTeamMembers,
      allWebsiteBanners,
      allPrintProductionFiles,
      allPrintDownloadLogs,
      allProductEnquiries,
      allAdminNotifications,
      localCustomersList,
      publicCustReady,
      allProjectPayments,
      allInstallments,
      allPaymentTransactions,
      allPaymentReminders,
      allProjectAttachments,
      allProjectAgreements,
      allPaymentLinks,
      activeAgreementSettings,
      serviceCatalog,
      allServiceRecords,
      allCustomerCarts,
    ] = await Promise.all([
      db.select().from(users).where(isNull(users.deletedAt)).orderBy(desc(users.createdAt)),
      db.select().from(storeOrders).where(eq(storeOrders.isDeleted, false)).orderBy(desc(storeOrders.createdAt)),
      db.select().from(printingOrders).where(eq(printingOrders.isDeleted, false)).orderBy(desc(printingOrders.createdAt)),
      db.select().from(projectEnquiries).where(eq(projectEnquiries.isDeleted, false)).orderBy(desc(projectEnquiries.createdAt)),
      db.select().from(projectQuotations).orderBy(desc(projectQuotations.createdAt)),
      db.select().from(projects).where(eq(projects.isDeleted, false)).orderBy(desc(projects.createdAt)),
      db.select().from(payments).orderBy(desc(payments.createdAt)),
      db.select().from(products).where(and(eq(products.isDeleted, false), lte(products.stockQty, 5))),
      db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(40),
      db.select().from(pcbEnquiries).where(eq(pcbEnquiries.isDeleted, false)).orderBy(desc(pcbEnquiries.createdAt)),
      db.select().from(b2bEnquiries).where(eq(b2bEnquiries.isDeleted, false)).orderBy(desc(b2bEnquiries.createdAt)),
      db.select().from(supportTickets).where(eq(supportTickets.isDeleted, false)).orderBy(desc(supportTickets.createdAt)),
      db.select().from(inventoryMovements).orderBy(desc(inventoryMovements.createdAt)).limit(40),
      db.select().from(newsletterSubscribers).orderBy(desc(newsletterSubscribers.createdAt)),
      db.select().from(cmsPages).orderBy(desc(cmsPages.updatedAt)),
      db.select().from(productCategories).orderBy(asc(productCategories.sortOrder)),
      db.select().from(products).where(eq(products.isDeleted, false)).orderBy(asc(products.sortOrder), desc(products.createdAt)),
      db.select().from(brands).orderBy(asc(brands.name)),
      db.select().from(mediaAssets).orderBy(desc(mediaAssets.createdAt)).limit(250),
      db.select().from(blogs).orderBy(desc(blogs.publishedAt)),
      db.select().from(caseStudies).orderBy(desc(caseStudies.createdAt)),
      db.select().from(coupons).orderBy(desc(coupons.createdAt)),
      db.select().from(invoices).where(eq(invoices.isDeleted, false)).orderBy(desc(invoices.issuedAt)),
      db.select().from(crmLeads).where(eq(crmLeads.isDeleted, false)).orderBy(desc(crmLeads.updatedAt)),
      db.select().from(crmNotes).orderBy(desc(crmNotes.createdAt)).limit(150),
      db.select().from(paymentReceipts).orderBy(desc(paymentReceipts.issuedAt)),
      db.select().from(paymentClearanceCertificates).orderBy(desc(paymentClearanceCertificates.issuedAt)),
      db.select().from(projectWorkOrders).orderBy(desc(projectWorkOrders.issuedAt)),
      db.select().from(projectHandoverDocuments).where(eq(projectHandoverDocuments.isDeleted, false)).orderBy(desc(projectHandoverDocuments.createdAt)),
      db.select().from(projectDeliveryRecords).orderBy(desc(projectDeliveryRecords.createdAt)),
      db.select().from(projectPaymentPlans).orderBy(desc(projectPaymentPlans.createdAt)),
      db.select().from(projectPaymentMilestones).orderBy(asc(projectPaymentMilestones.stageOrder)),
      db.select().from(projectEmailNotifications).orderBy(desc(projectEmailNotifications.createdAt)).limit(60),
      db.select().from(droneRepairBookings).orderBy(desc(droneRepairBookings.createdAt)),
      db.select().from(paymentRefunds).orderBy(desc(paymentRefunds.createdAt)),
      db.select().from(projectMessages).orderBy(asc(projectMessages.createdAt)),
      db.select().from(teamMembers).orderBy(asc(teamMembers.displayOrder), asc(teamMembers.id)),
      db.select().from(websiteBanners).orderBy(asc(websiteBanners.sortOrder), asc(websiteBanners.id)),
      db.select().from(printingProductionFiles).orderBy(desc(printingProductionFiles.createdAt)),
      db.select().from(printingFileDownloadLogs).orderBy(desc(printingFileDownloadLogs.createdAt)).limit(250),
      db.select().from(productEnquiries).where(eq(productEnquiries.isDeleted, false)).orderBy(desc(productEnquiries.createdAt)),
      db.select().from(adminNotifications).orderBy(desc(adminNotifications.createdAt)).limit(100),
      db.select().from(customers).where(isNull(customers.deletedAt)),
      isPublicCustomersSchemaReady().catch(() => false),
      db.select().from(projectPayments).orderBy(desc(projectPayments.createdAt)),
      db.select().from(paymentInstallments).orderBy(asc(paymentInstallments.installmentNumber)),
      db.select().from(paymentTransactions).orderBy(desc(paymentTransactions.createdAt)).limit(250),
      db.select().from(paymentReminders).orderBy(desc(paymentReminders.sentAt)).limit(250),
      db.select().from(projectAttachments).orderBy(desc(projectAttachments.createdAt)),
      db.select().from(projectAgreements).where(eq(projectAgreements.isDeleted, false)).orderBy(desc(projectAgreements.createdAt)),
      db.select().from(razorpayPaymentLinks).orderBy(desc(razorpayPaymentLinks.createdAt)).limit(250),
      getOrCreateAgreementSettings().catch(() => null),
      listActiveServicesCatalog().catch(() => []),
      db.select().from(serviceRecords).orderBy(desc(serviceRecords.createdAt)),
      db.select().from(customerCarts),
    ]);

    const publicCustomersRows = (publicCustReady ? await listPublicCustomers().catch(() => []) : []) || [];
    const rangedStoreOrders = allStoreOrders.filter((o) => inRange(o.createdAt));
    const rangedPrintOrders = allPrintOrders.filter((o) => inRange(o.createdAt));
    const rangedPayments = allPayments.filter((p) => inRange(p.createdAt));
    const rangedInvoices = allInvoices.filter((i) => inRange(i.issuedAt));
    const rangedProjects = allProjects.filter((p) => inRange(p.createdAt));
    const rangedProjectEnquiries = allEnquiries.filter((e) => inRange(e.createdAt));
    const rangedProductEnquiries = allProductEnquiries.filter((e) => inRange(e.createdAt));
    const rangedTickets = allTickets.filter((t) => inRange(t.createdAt));
    const rangedPcb = allPcb.filter((e) => inRange(e.createdAt));
    const rangedB2b = allB2b.filter((e) => inRange(e.createdAt));

    const verifiedPayments = rangedPayments.filter((p) => p.status === 'verified');
    const totalRevenueInr = verifiedPayments.reduce((sum, p) => sum + p.amountInr, 0);

    const now = new Date();
    const todayKey = now.toISOString().slice(0, 10);
    const monthKey = now.toISOString().slice(0, 7);
    const yearKey = String(now.getUTCFullYear());

    const todayRevenueInr = verifiedPayments
      .filter((p) => new Date(p.createdAt).toISOString().slice(0, 10) === todayKey)
      .reduce((s, p) => s + p.amountInr, 0);
    const monthRevenueInr = verifiedPayments
      .filter((p) => new Date(p.createdAt).toISOString().slice(0, 7) === monthKey)
      .reduce((s, p) => s + p.amountInr, 0);
    const annualRevenueInr = verifiedPayments
      .filter((p) => String(new Date(p.createdAt).getUTCFullYear()) === yearKey)
      .reduce((s, p) => s + p.amountInr, 0);

    // 14-day revenue chart series
    const dailyRevenueSeries: Array<{ date: string; label: string; amountInr: number }> = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now);
      d.setUTCDate(now.getUTCDate() - i);
      const iso = d.toISOString().slice(0, 10);
      const amt = verifiedPayments
        .filter((p) => new Date(p.createdAt).toISOString().slice(0, 10) === iso)
        .reduce((s, p) => s + p.amountInr, 0);
      dailyRevenueSeries.push({
        date: iso,
        label: d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
        amountInr: amt,
      });
    }

    // 6-month revenue chart series
    const monthlyRevenueSeries: Array<{ month: string; label: string; amountInr: number }> = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      const mKey = d.toISOString().slice(0, 7);
      const amt = verifiedPayments
        .filter((p) => new Date(p.createdAt).toISOString().slice(0, 7) === mKey)
        .reduce((s, p) => s + p.amountInr, 0);
      monthlyRevenueSeries.push({
        month: mKey,
        label: d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }),
        amountInr: amt,
      });
    }

    // Revenue by Category / Stream
    const catNameById = Object.fromEntries(allCategories.map((c) => [c.id, c.name]));
    const prodById = Object.fromEntries(allProducts.map((p) => [p.id, p]));
    const categoryTotals: Record<string, number> = {};
    for (const ord of allStoreOrders.filter((o) => o.paymentStatus === 'paid')) {
      for (const item of ord.items) {
        const prod = prodById[item.productId];
        const cname = (prod?.categoryId && catNameById[prod.categoryId]) || 'Hardware Store';
        categoryTotals[cname] = (categoryTotals[cname] || 0) + item.lineTotalInr;
      }
    }
    const printPaidTotal = verifiedPayments
      .filter((p) => p.entityType === 'printing_order')
      .reduce((s, p) => s + p.amountInr, 0);
    if (printPaidTotal > 0) categoryTotals['3D Printing Lab'] = printPaidTotal;
    const projectPaidTotal = verifiedPayments
      .filter((p) => p.entityType === 'project_quotation')
      .reduce((s, p) => s + p.amountInr, 0);
    if (projectPaidTotal > 0) categoryTotals['Engineering Projects'] = projectPaidTotal;

    const revenueByCategory = Object.entries(categoryTotals).map(([category, amountInr]) => ({
      category,
      amountInr,
    }));

    const pendingStorePayments = allStoreOrders
      .filter((o) => o.paymentStatus === 'pending')
      .reduce((sum, o) => sum + o.totalInr, 0);
    const pendingPrintPayments = allPrintOrders
      .filter((o) => o.paymentStatus === 'pending')
      .reduce((sum, o) => sum + o.totalInr, 0);

    const sanitizedUsers = allUsers.map(({ passwordHash: _ph, ...safe }) => safe);
    const userById = new Map(sanitizedUsers.map((u) => [u.id, u]));
    const prodFilesByOrderId = new Map<number, typeof allPrintProductionFiles>();
    for (const pf of allPrintProductionFiles) {
      const arr = prodFilesByOrderId.get(pf.printingOrderId) || [];
      arr.push(pf);
      prodFilesByOrderId.set(pf.printingOrderId, arr);
    }
    const dlLogsByOrderId = new Map<number, typeof allPrintDownloadLogs>();
    for (const dl of allPrintDownloadLogs) {
      const arr = dlLogsByOrderId.get(dl.printingOrderId) || [];
      arr.push(dl);
      dlLogsByOrderId.set(dl.printingOrderId, arr);
    }
    const enrichedPrintOrders = allPrintOrders.map((po) => {
      const cust = po.userId ? userById.get(po.userId) : undefined;
      const payDisp = getPaymentStatusDisplay(po.paymentStatus, po.refundStatus);
      const printAuth = checkPrintingAuthorization(po);
      const addr = (po.deliveryAddress as Record<string, any>) || {};
      const customerName = po.customerName || cust?.fullName || addr.fullName || '';
      const customerEmail = po.email || cust?.email || addr.email || '';
      const customerMobile = po.phone || cust?.mobile || addr.mobile || '';
      const customerId = po.customerId || cust?.uid || (po.userId ? `USER-${po.userId}` : '');
      return {
        ...po,
        customerId,
        customerName,
        email: customerEmail,
        phone: customerMobile,
        customerEmail,
        customerMobile,
        customerDetails: {
          customerId,
          fullName: customerName,
          email: customerEmail,
          mobile: customerMobile,
          companyOrCollege: cust?.companyOrCollege || '',
          fullAddress:
            cust?.fullAddress ||
            [addr.houseFlat, addr.streetArea, addr.line1, addr.city, addr.state, addr.pinCode]
              .filter(Boolean)
              .join(', '),
          city: cust?.city || addr.city || '',
          state: cust?.state || addr.state || '',
          pinCode: cust?.pinCode || addr.pinCode || '',
          accountStatus: cust?.accountStatus || 'Active',
          registrationDate: cust?.createdAt ? new Date(cust.createdAt).toISOString() : undefined,
        },
        downloadUnlocked: true, // Admins can ALWAYS view, inspect, and download 3D CAD files regardless of payment
        downloadLockReason: '',
        printingAuthorized: printAuth.authorized,
        printingBlockReason: printAuth.reason,
        paymentLabel: payDisp.label,
        paymentWarning: payDisp.warning,
        productionFiles: prodFilesByOrderId.get(po.id) || [],
        downloadLogs: dlLogsByOrderId.get(po.id) || [],
      };
    });

    const customerUsers = sanitizedUsers.filter((u) => u.role === 'customer');
    const rangedCustomerUsers = customerUsers.filter((u) => inRange(u.createdAt));
    const totalCustomersCount =
      publicCustReady && publicCustomersRows.length > 0
        ? publicCustomersRows.filter((c) => inRange(c.registrationDate || c.createdAt)).length
        : localCustomersList.length > 0
        ? localCustomersList.filter((c) => inRange(c.registrationDate || c.createdAt)).length
        : rangedCustomerUsers.length;

    const custCodeByUserId = new Map<number, string>();
    for (const c of localCustomersList) {
      if (c.userId && c.customerId) custCodeByUserId.set(c.userId, c.customerId);
    }
    for (const pc of publicCustomersRows) {
      if (pc.webUserId && pc.customerId) custCodeByUserId.set(pc.webUserId, pc.customerId);
    }
    for (const u of customerUsers) {
      if (u.uid && u.uid.startsWith('NTF-CUST-') && !custCodeByUserId.has(u.id)) {
        custCodeByUserId.set(u.id, u.uid);
      }
    }

    const NEW_ORDER_SET = new Set(['New', 'Order Placed', 'Pending Payment', 'Uploaded – Pending Review']);
    const PROC_ORDER_SET = new Set([
      'Confirmed',
      'Payment Confirmed',
      'Processing',
      'Order Processing',
      'Quality Inspection',
      'Ready for Dispatch',
      'Shipped',
      'Out for Delivery',
      'Payment Completed',
      'In Production',
      'Printing Started',
      'Post-Processing',
      'Ready to Dispatch',
    ]);
    const DONE_ORDER_SET = new Set(['Delivered', 'Completed']);
    const CANCEL_ORDER_SET = new Set(['Cancelled', 'Refunded', 'Refund Initiated', 'File Rejected']);

    const allCombinedOrdersStatuses = [
      ...rangedStoreOrders.map((o) => o.orderStatus),
      ...rangedPrintOrders.map((o) => o.orderStatus),
    ];
    const newOrdersCount = allCombinedOrdersStatuses.filter((s) => NEW_ORDER_SET.has(s)).length;
    const processingOrdersCount = allCombinedOrdersStatuses.filter((s) => PROC_ORDER_SET.has(s)).length;
    const completedOrdersCount = allCombinedOrdersStatuses.filter((s) => DONE_ORDER_SET.has(s)).length;
    const cancelledOrdersCount = allCombinedOrdersStatuses.filter((s) => CANCEL_ORDER_SET.has(s)).length;

    const RESPONDED_ENQ_SET = new Set([
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
    const NEW_ENQ_SET = new Set(['New', 'Open', 'Submitted', 'Submitted – Under Review', 'Order received']);
    const allEnquiryStatuses = [
      ...rangedProductEnquiries.map((e) => e.status),
      ...rangedTickets.map((t) => t.status),
      ...rangedProjectEnquiries.map((e) => e.status),
      ...rangedPcb.map((e) => e.status),
      ...rangedB2b.map((e) => e.status),
    ];
    const totalEnquiriesCount = allEnquiryStatuses.length;
    const newEnquiriesCount = allEnquiryStatuses.filter((s) => NEW_ENQ_SET.has(s)).length;
    const respondedEnquiriesCount = allEnquiryStatuses.filter((s) => RESPONDED_ENQ_SET.has(s)).length;
    const pendingEnquiriesCount = Math.max(0, totalEnquiriesCount - respondedEnquiriesCount);

    const COMPLETED_PROJ_SET = new Set(['Completed', 'Project Completed', 'Delivered / Handed Over', 'Delivered', 'Closed']);
    const activeProjectsCount = rangedProjects.filter((p) => !COMPLETED_PROJ_SET.has(p.status)).length;
    const completedProjectsCount = rangedProjects.filter((p) => COMPLETED_PROJ_SET.has(p.status)).length;

    const customerRegistrationSeries: Array<{ date: string; label: string; count: number }> = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now);
      d.setUTCDate(now.getUTCDate() - i);
      const iso = d.toISOString().slice(0, 10);
      const regCount = (publicCustReady && publicCustomersRows.length > 0
        ? publicCustomersRows.map((c) => c.registrationDate || c.createdAt)
        : customerUsers.map((u) => u.createdAt)
      ).filter((dt) => dt && new Date(dt).toISOString().slice(0, 10) === iso).length;
      customerRegistrationSeries.push({
        date: iso,
        label: d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
        count: regCount,
      });
    }

    const orderStatusMap: Record<string, number> = {};
    for (const s of allCombinedOrdersStatuses) {
      orderStatusMap[s] = (orderStatusMap[s] || 0) + 1;
    }
    const orderStatusBreakdown = Object.entries(orderStatusMap).map(([status, count]) => ({ status, count }));

    const enquiryCategoryMap: Record<string, number> = {
      'Product & Drone': rangedProductEnquiries.length,
      'Support & Contact': rangedTickets.length,
      'Engineering Projects': rangedProjectEnquiries.length,
      'PCB Fabrication': rangedPcb.length,
      'B2B Bulk RFQ': rangedB2b.length,
    };
    const enquiryCategoryBreakdown = Object.entries(enquiryCategoryMap).map(([category, count]) => ({ category, count }));

    res.json({
      kpis: {
        totalRevenueInr,
        todayRevenueInr,
        monthRevenueInr,
        annualRevenueInr,
        totalOrders: rangedStoreOrders.length + rangedPrintOrders.length,
        totalRegisteredOrders: rangedStoreOrders.length + rangedPrintOrders.length,
        newOrders: newOrdersCount,
        processingOrders: processingOrdersCount,
        completedOrders: completedOrdersCount,
        cancelledOrders: cancelledOrdersCount,
        pendingPaymentsInr: pendingStorePayments + pendingPrintPayments,
        totalCustomers: totalCustomersCount,
        totalEnquiries: totalEnquiriesCount,
        newEnquiries: newEnquiriesCount,
        pendingEnquiries: pendingEnquiriesCount,
        respondedEnquiries: respondedEnquiriesCount,
        newProjectEnquiries: rangedProjectEnquiries.filter(
          (e) => e.status === 'Submitted – Under Review' || e.status === 'Submitted'
        ).length,
        totalEngineeringProjects: rangedProjects.length,
        totalProjectRegistrations: rangedProjectEnquiries.length,
        activeProjects: activeProjectsCount,
        completedProjects: completedProjectsCount,
        totalInvoices: rangedInvoices.length,
        pendingQuotations: allQuotations.filter((q) => q.status === 'Sent' || q.status === 'Draft').length,
        printingOrdersCount: rangedPrintOrders.length,
        storeOrdersCount: rangedStoreOrders.length,
        lowStockCount: lowStockProducts.length,
        subscribersCount: subscribers.length,
        openLeadsCount: allLeads.filter((l) => !['Won', 'Lost'].includes(l.stage)).length,
        unreadAdminNotificationsCount: allAdminNotifications.filter((n) => !n.isRead).length,
      },
      analytics: {
        dailyRevenueSeries,
        monthlyRevenueSeries,
        revenueByCategory,
        customerRegistrationSeries,
        orderStatusBreakdown,
        enquiryCategoryBreakdown,
        serviceBreakdown: [
          { label: 'Store Orders', count: rangedStoreOrders.length },
          { label: '3D Print Jobs', count: rangedPrintOrders.length },
          { label: 'Engineering Enquiries', count: rangedProjectEnquiries.length },
          { label: 'PCB Enquiries', count: rangedPcb.length },
          { label: 'B2B Bulk Enquiries', count: rangedB2b.length },
        ],
      },
      users: sanitizedUsers,
      storeOrders: allStoreOrders.map((so) => {
        const u = so.userId ? userById.get(so.userId) : undefined;
        const ship = (so.shippingAddress as any) || {};
        return {
          ...so,
          customerId: so.customerId || (so.userId ? custCodeByUserId.get(so.userId) || u?.uid : '') || '',
          customerEmail: u?.email || ship.email || '',
          customerName: u?.fullName || ship.fullName || '',
          customerPhone: u?.mobile || ship.mobile || '',
          paymentMethod: so.paymentMethod || (so.razorpayPaymentId?.startsWith('pay_test_') ? 'Razorpay (Test)' : 'Razorpay'),
        };
      }),
      printingOrders: enrichedPrintOrders,
      projectEnquiries: allEnquiries,
      productEnquiries: allProductEnquiries,
      quotations: allQuotations,
      projects: allProjects.map((p) => {
        const u = p.userId ? userById.get(p.userId) : undefined;
        return {
          ...p,
          customerId: p.customerId || (p.userId ? custCodeByUserId.get(p.userId) || u?.uid : '') || '',
        };
      }),
      projectMessages: allProjectMessages,
      pcbEnquiries: allPcb,
      b2bEnquiries: allB2b,
      payments: allPayments,
      invoices: allInvoices,
      lowStockProducts,
      inventoryMovements: recentMovements,
      newsletterSubscribers: subscribers,
      cmsPages: pages,
      categories: allCategories,
      products: allProducts,
      brands: allBrands,
      mediaAssets: allMedia,
      blogs: allBlogs,
      caseStudies: allCaseStudies,
      coupons: allCoupons,
      crmLeads: allLeads,
      crmNotes: allNotes,
      supportTickets: allTickets,
      recentAudit,
      receipts: allReceipts,
      clearanceCertificates: allClearanceCerts,
      workOrders: allWorkOrders,
      handoverDocuments: allHandoverDocs,
      deliveryRecords: allDeliveryRecords,
      projectPaymentPlans: allPaymentPlans,
      projectPaymentMilestones: allPaymentMilestones,
      emailNotifications: allEmailLogs,
      droneRepairs: allDroneRepairs,
      refunds: allRefunds,
      teamMembers: allTeamMembers,
      websiteBanners: allWebsiteBanners,
      adminNotifications: allAdminNotifications,
      projectPayments: allProjectPayments,
      paymentInstallments: allInstallments,
      paymentTransactions: allPaymentTransactions,
      paymentReminders: allPaymentReminders,
      projectAttachments: allProjectAttachments,
      projectAgreements: allProjectAgreements,
      razorpayPaymentLinks: allPaymentLinks,
      agreementSettings: activeAgreementSettings,
      serviceCatalog,
      serviceRecords: allServiceRecords,
      customerCartsCount: allCustomerCarts.filter((c) => Array.isArray(c.items) && c.items.length > 0).length,
    });
  } catch (error) {
    console.error('Admin overview error:', error);
    res.status(500).json({ error: 'Failed to load admin overview.' });
  }
});

// Staff Role Management (Super Admin Only — Customer accounts are NEVER converted into Admin accounts)
adminRouter.patch('/users/:id/role', requireAdmin(['super_admin']), async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const role = String(req.body.role || '').trim();
    if (!ADMIN_ROLES.has(role)) {
      return res.status(400).json({
        error: 'Invalid staff role. Customer accounts and Admin accounts must remain completely separate.',
      });
    }
    if (id === req.dbUser!.id) {
      return res.status(400).json({ error: 'You cannot change your own active Super Admin role.' });
    }

    const [existing] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!existing) return res.status(404).json({ error: 'User not found.' });

    if (existing.role === 'customer' || existing.uid.startsWith('NTF-CUST-')) {
      return res.status(400).json({
        error: 'Customer accounts cannot be converted into Admin accounts. Create a separate Admin/Staff account instead.',
      });
    }

    const [updated] = await db
      .update(users)
      .set({ role, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();

    await logAudit({
      actorUid: req.dbUser!.uid,
      actorEmail: req.dbUser!.email,
      action: 'UPDATE_USER_ROLE',
      entityType: 'user',
      entityId: id,
      details: { previousRole: existing.role, newRole: role, targetEmail: updated.email },
    });

    const { passwordHash: _ph, ...safe } = updated;
    res.json({ user: safe });
  } catch {
    res.status(500).json({ error: 'Failed to update user role.' });
  }
});

adminRouter.patch('/users/:id/status', requireAdmin(['super_admin']), async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const isActive = Boolean(req.body.isActive);
    if (id === req.dbUser!.id && !isActive) {
      return res.status(400).json({ error: 'You cannot deactivate your own active session account.' });
    }
    const nextStatus = isActive ? 'Active' : 'Suspended';
    const [updated] = await db
      .update(users)
      .set({
        isActive,
        accountStatus: nextStatus,
        deletedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
      .returning();

    if (!updated) return res.status(404).json({ error: 'User not found.' });

    if (!isActive) {
      await db.delete(adminSessions).where(eq(adminSessions.userId, id)).catch(() => {});
    }

    if (await isPublicCustomersSchemaReady()) {
      const pubCust = await findPublicCustomerForUser({
        authUserId: updated.authUserId,
        uid: updated.uid,
        id: updated.id,
        email: updated.email,
      });
      if (pubCust) {
        await updatePublicCustomerRecord(pubCust.id, {
          accountStatus: nextStatus,
          statusReason: isActive ? '' : 'Updated from Users management',
        }).catch(() => {});
      }
    }

    await logAudit({
      actorUid: req.dbUser!.uid,
      actorEmail: req.dbUser!.email,
      action: isActive ? 'ACTIVATE_USER' : 'DEACTIVATE_USER',
      entityType: 'user',
      entityId: id,
    });
    const { passwordHash: _ph, ...safe } = updated;
    res.json({ user: safe });
  } catch {
    res.status(500).json({ error: 'Failed to update user account status.' });
  }
});

// Media Library (Images, Videos, Multi-File Uploads, Metadata & File Replacement)
adminRouter.get('/media', async (_req, res) => {
  const rows = await db.select().from(mediaAssets).orderBy(desc(mediaAssets.createdAt));
  res.json({ items: rows, categories: CMS_MEDIA_CATEGORIES });
});

async function persistUploadedMediaFile(
  file: Express.Multer.File,
  meta: {
    title?: string;
    description?: string;
    category?: string;
    altText?: string;
    thumbnailUrl?: string;
    folder?: string;
    uploadedBy: string;
  }
) {
  if (!isSupabaseStorageConfigured()) {
    throw new Error('Supabase Storage is not configured. Configure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to upload media.');
  }

  const mediaKind = detectMediaKind(file.mimetype || '', file.originalname);
  const category = String(meta.category || 'Company Branding').trim();
  const folder = String(meta.folder || category || 'general').trim();
  const buffer = file.buffer;
  let url = '';

  const sbUploaded = await uploadCmsMediaToSupabase({
    buffer,
    originalName: file.originalname,
    mimeType: file.mimetype || (mediaKind === 'video' ? 'video/mp4' : 'application/octet-stream'),
    folder,
  });
  if (sbUploaded?.publicUrl) {
    url = sbUploaded.publicUrl;
  } else if (mediaKind === 'image') {
    const legacySb = await uploadProductImageToSupabase({
      buffer,
      originalName: file.originalname,
      mimeType: file.mimetype,
      folder,
    });
    if (legacySb?.publicUrl) url = legacySb.publicUrl;
  }

  if (!url) {
    throw new Error('Failed to store uploaded media in Supabase Storage.');
  }

  const cleanBaseName = path.basename(file.originalname, path.extname(file.originalname)).replace(/[-_]+/g, ' ').trim();
  const [asset] = await db
    .insert(mediaAssets)
    .values({
      fileName: file.originalname,
      title: String(meta.title || cleanBaseName || file.originalname).trim(),
      description: String(meta.description || '').trim(),
      category,
      thumbnailUrl: String(meta.thumbnailUrl || '').trim(),
      mediaKind,
      url,
      mimeType: file.mimetype || 'application/octet-stream',
      sizeBytes: file.size,
      altText: String(meta.altText || cleanBaseName || file.originalname).trim(),
      folder,
      uploadedBy: meta.uploadedBy,
    })
    .returning();
  return asset;
}

adminRouter.post('/media/upload', mediaUpload.single('file'), async (req: AuthRequest, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Please select or drop a file to upload.' });
    }
    const asset = await persistUploadedMediaFile(req.file, {
      title: req.body.title,
      description: req.body.description,
      category: req.body.category,
      altText: req.body.altText,
      thumbnailUrl: req.body.thumbnailUrl,
      folder: req.body.folder,
      uploadedBy: req.dbUser!.email,
    });

    await logAudit({
      actorUid: req.dbUser!.uid,
      actorEmail: req.dbUser!.email,
      action: 'UPLOAD_MEDIA_ASSET',
      entityType: 'media_asset',
      entityId: asset.id,
      details: { fileName: asset.fileName, category: asset.category, mediaKind: asset.mediaKind, url: asset.url },
    });

    res.status(201).json({ asset: { ...asset, fileUrl: asset.url } });
  } catch (error: any) {
    res.status(503).json({ error: error?.message || 'Failed to upload media asset.' });
  }
});

adminRouter.post('/media/upload-batch', mediaUpload.array('files', 12), async (req: AuthRequest, res) => {
  try {
    const files = (req.files as Express.Multer.File[]) || [];
    if (files.length === 0) {
      return res.status(400).json({ error: 'Please select or drop one or more files to upload.' });
    }
    const assets = [];
    for (const f of files) {
      const asset = await persistUploadedMediaFile(f, {
        category: req.body.category,
        folder: req.body.folder,
        uploadedBy: req.dbUser!.email,
      });
      assets.push({ ...asset, fileUrl: asset.url });
    }

    await logAudit({
      actorUid: req.dbUser!.uid,
      actorEmail: req.dbUser!.email,
      action: 'UPLOAD_MEDIA_BATCH',
      entityType: 'media_asset',
      details: { count: assets.length, category: req.body.category || 'Company Branding' },
    });

    res.status(201).json({ assets });
  } catch (error: any) {
    res.status(503).json({ error: error?.message || 'Failed to upload media files.' });
  }
});

adminRouter.post('/media/:id/replace', mediaUpload.single('file'), async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    if (!req.file) return res.status(400).json({ error: 'Replacement file is required.' });
    if (!isSupabaseStorageConfigured()) {
      return res.status(503).json({ error: 'Supabase Storage is not configured.' });
    }
    const [existing] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, id)).limit(1);
    if (!existing) return res.status(404).json({ error: 'Media asset not found.' });

    const mediaKind = detectMediaKind(req.file.mimetype || '', req.file.originalname);
    const sbUploaded = await uploadCmsMediaToSupabase({
      buffer: req.file.buffer,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype || 'application/octet-stream',
      folder: existing.category || existing.folder || 'cms',
    });
    const url = sbUploaded?.publicUrl || existing.url;
    if (!sbUploaded?.publicUrl) {
      return res.status(503).json({ error: 'Failed to store replacement media in Supabase Storage.' });
    }

    if (existing.url && !existing.url.startsWith('/uploads/media/')) {
      await deleteCmsMediaFromSupabase(existing.url);
    }

    const [updated] = await db
      .update(mediaAssets)
      .set({
        fileName: req.file.originalname,
        url,
        mimeType: req.file.mimetype || 'application/octet-stream',
        sizeBytes: req.file.size,
        mediaKind,
      })
      .where(eq(mediaAssets.id, id))
      .returning();

    await logAudit({
      actorUid: req.dbUser!.uid,
      actorEmail: req.dbUser!.email,
      action: 'REPLACE_MEDIA_ASSET',
      entityType: 'media_asset',
      entityId: id,
      details: { previousFile: existing.fileName, newFile: updated.fileName, url },
    });

    res.json({ asset: { ...updated, fileUrl: updated.url } });
  } catch (error: any) {
    res.status(400).json({ error: error?.message || 'Failed to replace media file.' });
  }
});

adminRouter.patch('/media/:id', async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const b = req.body || {};
    const [updated] = await db
      .update(mediaAssets)
      .set({
        fileName: b.fileName !== undefined ? String(b.fileName).trim() : undefined,
        title: b.title !== undefined ? String(b.title).trim() : undefined,
        description: b.description !== undefined ? String(b.description).trim() : undefined,
        category: b.category !== undefined ? String(b.category).trim() : undefined,
        thumbnailUrl: b.thumbnailUrl !== undefined ? String(b.thumbnailUrl).trim() : undefined,
        altText: b.altText !== undefined ? String(b.altText).trim() : undefined,
        folder: b.folder !== undefined ? String(b.folder).trim() : undefined,
      })
      .where(eq(mediaAssets.id, id))
      .returning();
    if (!updated) return res.status(404).json({ error: 'Media asset not found.' });

    await logAudit({
      actorUid: req.dbUser!.uid,
      actorEmail: req.dbUser!.email,
      action: 'UPDATE_MEDIA_METADATA',
      entityType: 'media_asset',
      entityId: id,
      details: { fileName: updated.fileName, category: updated.category },
    });

    res.json({ asset: updated });
  } catch {
    res.status(500).json({ error: 'Failed to update media asset.' });
  }
});

adminRouter.delete('/media/:id', async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const [existing] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, id)).limit(1);
    if (!existing) return res.status(404).json({ error: 'Media asset not found.' });
    await db.delete(mediaAssets).where(eq(mediaAssets.id, id));
    if (existing.url.startsWith('/uploads/media/')) {
      const target = path.resolve(UPLOADS_ROOT, 'media', path.basename(existing.url));
      if (target.startsWith(path.join(UPLOADS_ROOT, 'media')) && fs.existsSync(target)) {
        fs.unlinkSync(target);
      }
    } else {
      await deleteCmsMediaFromSupabase(existing.url);
    }
    await logAudit({
      actorUid: req.dbUser!.uid,
      actorEmail: req.dbUser!.email,
      action: 'DELETE_MEDIA_ASSET',
      entityType: 'media_asset',
      entityId: id,
      details: { fileName: existing.fileName },
    });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Failed to delete media asset.' });
  }
});

// Categories CRUD
adminRouter.get('/categories', async (_req, res) => {
  const rows = await db.select().from(productCategories).orderBy(asc(productCategories.sortOrder));
  res.json({ items: rows });
});

adminRouter.post('/categories', async (req: AuthRequest, res) => {
  try {
    const { name, slug, storeScope, description, sortOrder } = req.body;
    const [created] = await db
      .insert(productCategories)
      .values({
        name: String(name).trim(),
        slug: String(slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')).trim(),
        storeScope: storeScope === '3d_printed' ? '3d_printed' : 'general',
        description: String(description || ''),
        sortOrder: Number(sortOrder || 0),
        isActive: true,
      })
      .returning();
    await logAudit({
      actorUid: req.dbUser!.uid,
      actorEmail: req.dbUser!.email,
      action: 'CREATE_CATEGORY',
      entityType: 'category',
      entityId: created.id,
    });
    res.status(201).json({ category: created });
  } catch (error: any) {
    res.status(400).json({ error: error?.message || 'Failed to create category.' });
  }
});

adminRouter.put('/categories/:id', async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const b = req.body;
    const [updated] = await db
      .update(productCategories)
      .set({
        name: b.name !== undefined ? String(b.name).trim() : undefined,
        slug: b.slug !== undefined ? String(b.slug).trim() : undefined,
        storeScope: b.storeScope !== undefined ? (b.storeScope === '3d_printed' ? '3d_printed' : 'general') : undefined,
        description: b.description !== undefined ? String(b.description) : undefined,
        sortOrder: b.sortOrder !== undefined ? Number(b.sortOrder) : undefined,
        isActive: b.isActive !== undefined ? Boolean(b.isActive) : undefined,
      })
      .where(eq(productCategories.id, id))
      .returning();
    if (!updated) return res.status(404).json({ error: 'Category not found.' });
    res.json({ category: updated });
  } catch (error: any) {
    res.status(400).json({ error: error?.message || 'Failed to update category.' });
  }
});

adminRouter.delete('/categories/:id', async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    await db.delete(productCategories).where(eq(productCategories.id, id));
    await logAudit({
      actorUid: req.dbUser!.uid,
      actorEmail: req.dbUser!.email,
      action: 'DELETE_CATEGORY',
      entityType: 'category',
      entityId: id,
    });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Failed to delete category.' });
  }
});

// Brands CRUD
adminRouter.get('/brands', async (_req, res) => {
  const rows = await db.select().from(brands).orderBy(asc(brands.name));
  res.json({ items: rows });
});

adminRouter.post('/brands', async (req: AuthRequest, res) => {
  try {
    const b = req.body;
    const name = String(b.name || '').trim();
    const slug = String(b.slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')).trim();
    const [created] = await db
      .insert(brands)
      .values({
        name,
        slug,
        logoUrl: String(b.logoUrl || ''),
        description: String(b.description || ''),
        isActive: b.isActive !== false,
      })
      .returning();
    res.status(201).json({ brand: created });
  } catch (error: any) {
    res.status(400).json({ error: error?.message || 'Failed to create brand.' });
  }
});

adminRouter.put('/brands/:id', async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const b = req.body;
    const [updated] = await db
      .update(brands)
      .set({
        name: b.name !== undefined ? String(b.name).trim() : undefined,
        slug: b.slug !== undefined ? String(b.slug).trim() : undefined,
        logoUrl: b.logoUrl !== undefined ? String(b.logoUrl) : undefined,
        description: b.description !== undefined ? String(b.description) : undefined,
        isActive: b.isActive !== undefined ? Boolean(b.isActive) : undefined,
      })
      .where(eq(brands.id, id))
      .returning();
    if (!updated) return res.status(404).json({ error: 'Brand not found.' });
    res.json({ brand: updated });
  } catch (error: any) {
    res.status(400).json({ error: error?.message || 'Failed to update brand.' });
  }
});

adminRouter.delete('/brands/:id', async (req: AuthRequest, res) => {
  try {
    await db.delete(brands).where(eq(brands.id, Number(req.params.id)));
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Failed to delete brand.' });
  }
});

// WooCommerce-style Products CRUD + Duplicate + Soft Delete
adminRouter.get('/products', async (_req, res) => {
  const rows = await db
    .select()
    .from(products)
    .where(eq(products.isDeleted, false))
    .orderBy(asc(products.sortOrder), desc(products.createdAt));
  res.json({ items: rows });
});

adminRouter.post('/products', async (req: AuthRequest, res) => {
  try {
    const b = req.body;
    const slug = String(b.slug || b.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')).trim();
    const status = String(b.status || (b.isPublished === false ? 'draft' : 'published'));
    const [created] = await db
      .insert(products)
      .values({
        categoryId: b.categoryId ? Number(b.categoryId) : null,
        sku: String(b.sku).trim().toUpperCase(),
        hsnCode: String(b.hsnCode || '8807').trim(),
        name: String(b.name).trim(),
        slug,
        brand: String(b.brand || 'NexusTekFusion').trim(),
        productType: String(b.productType || 'simple'),
        modelNumber: String(b.modelNumber || '').trim(),
        subcategory: String(b.subcategory || '').trim(),
        shortDescription: String(b.shortDescription || '').trim(),
        storeScope: b.storeScope === '3d_printed' ? '3d_printed' : 'general',
        description: String(b.description || ''),
        technicalSpecs: b.technicalSpecs || {},
        features: Array.isArray(b.features) ? b.features : [],
        compatibility: String(b.compatibility || ''),
        packageContents: Array.isArray(b.packageContents) ? b.packageContents : [],
        applications: String(b.applications || ''),
        productFaqs: Array.isArray(b.productFaqs) ? b.productFaqs : [],
        tags: Array.isArray(b.tags) ? b.tags : [],
        relatedProductIds: Array.isArray(b.relatedProductIds) ? b.relatedProductIds.map(Number) : [],
        boughtTogetherIds: Array.isArray(b.boughtTogetherIds) ? b.boughtTogetherIds.map(Number) : [],
        videoUrl: String(b.videoUrl || ''),
        lowStockThreshold: Number(b.lowStockThreshold ?? 5),
        priceInr: b.priceInr !== undefined && b.priceInr !== '' ? Number(b.priceInr) : 0,
        discountPriceInr: b.discountPriceInr ? Number(b.discountPriceInr) : null,
        gstPercent: Number(b.gstPercent ?? 18),
        stockQty: Number(b.stockQty ?? 0),
        dimensions: String(b.dimensions || ''),
        weightGrams: Number(b.weightGrams || 0),
        shippingWeightGrams: Number(b.shippingWeightGrams || 0),
        deliveryInfo: String(b.deliveryInfo || ''),
        material: String(b.material || ''),
        availableColors: Array.isArray(b.availableColors) ? b.availableColors : [],
        availableVariants: Array.isArray(b.availableVariants) ? b.availableVariants : [],
        productionTimeDays: Number(b.productionTimeDays ?? 2),
        warrantyInfo: String(b.warrantyInfo || ''),
        imageUrl: String(b.imageUrl || '/src/assets/images/service_pcb_electronics_1794981062614.jpg'),
        galleryUrls: Array.isArray(b.galleryUrls) ? b.galleryUrls : [],
        datasheetUrl: String(b.datasheetUrl || ''),
        brochureUrl: String(b.brochureUrl || ''),
        model3dUrl: String(b.model3dUrl || ''),
        seoTitle: String(b.seoTitle || ''),
        seoDescription: String(b.seoDescription || ''),
        status,
        publishedAt: b.publishedAt ? new Date(b.publishedAt) : null,
        isFeatured: Boolean(b.isFeatured),
        isBestseller: Boolean(b.isBestseller),
        isNewArrival: b.isNewArrival !== false,
        isPublished: status !== 'draft' && b.isPublished !== false,
        sortOrder: Number(b.sortOrder || 0),
        isDeleted: false,
      })
      .returning();

    syncProductToSupabase(created).catch(() => {});

    await logAudit({
      actorUid: req.dbUser!.uid,
      actorEmail: req.dbUser!.email,
      action: 'CREATE_PRODUCT',
      entityType: 'product',
      entityId: created.id,
      details: { sku: created.sku, name: created.name },
    });
    res.status(201).json({ product: created });
  } catch (error: any) {
    res.status(400).json({ error: error?.message || 'Failed to create product.' });
  }
});

adminRouter.put('/products/:id', async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const b = req.body;
    const status = b.status !== undefined ? String(b.status) : undefined;
    const isPublishedNext =
      b.isPublished !== undefined
        ? Boolean(b.isPublished)
        : status !== undefined
        ? status !== 'draft'
        : undefined;

    const [updated] = await db
      .update(products)
      .set({
        ...b,
        hsnCode: b.hsnCode !== undefined ? String(b.hsnCode).trim() : undefined,
        categoryId: b.categoryId === null || b.categoryId === '' ? null : b.categoryId !== undefined ? Number(b.categoryId) : undefined,
        priceInr: b.priceInr !== undefined ? Number(b.priceInr) : undefined,
        discountPriceInr:
          b.discountPriceInr === null || b.discountPriceInr === ''
            ? null
            : b.discountPriceInr !== undefined
            ? Number(b.discountPriceInr)
            : undefined,
        stockQty: b.stockQty !== undefined ? Number(b.stockQty) : undefined,
        weightGrams: b.weightGrams !== undefined ? Number(b.weightGrams) : undefined,
        shippingWeightGrams: b.shippingWeightGrams !== undefined ? Number(b.shippingWeightGrams) : undefined,
        gstPercent: b.gstPercent !== undefined ? Number(b.gstPercent) : undefined,
        productionTimeDays: b.productionTimeDays !== undefined ? Number(b.productionTimeDays) : undefined,
        lowStockThreshold: b.lowStockThreshold !== undefined ? Number(b.lowStockThreshold) : undefined,
        publishedAt: b.publishedAt ? new Date(b.publishedAt) : b.publishedAt === null ? null : undefined,
        status,
        isPublished: isPublishedNext,
        updatedAt: new Date(),
      })
      .where(eq(products.id, id))
      .returning();

    if (!updated) return res.status(404).json({ error: 'Product not found.' });
    syncProductToSupabase(updated).catch(() => {});
    await logAudit({
      actorUid: req.dbUser!.uid,
      actorEmail: req.dbUser!.email,
      action: 'UPDATE_PRODUCT',
      entityType: 'product',
      entityId: id,
    });
    res.json({ product: updated });
  } catch (error: any) {
    res.status(400).json({ error: error?.message || 'Failed to update product.' });
  }
});

adminRouter.post('/products/:id/duplicate', async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const [orig] = await db.select().from(products).where(eq(products.id, id)).limit(1);
    if (!orig) return res.status(404).json({ error: 'Product not found.' });

    const suffix = Date.now().toString().slice(-4);
    const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = orig;
    const [copy] = await db
      .insert(products)
      .values({
        ...rest,
        sku: `${orig.sku}-COPY-${suffix}`,
        name: `${orig.name} (Copy)`,
        slug: `${orig.slug}-copy-${suffix}`,
        status: 'draft',
        isPublished: false,
        isDeleted: false,
      })
      .returning();

    await logAudit({
      actorUid: req.dbUser!.uid,
      actorEmail: req.dbUser!.email,
      action: 'DUPLICATE_PRODUCT',
      entityType: 'product',
      entityId: copy.id,
      details: { sourceId: id },
    });
    res.status(201).json({ product: copy });
  } catch (error: any) {
    res.status(400).json({ error: error?.message || 'Failed to duplicate product.' });
  }
});

adminRouter.delete('/products/:id', async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    await db
      .update(products)
      .set({ isDeleted: true, isPublished: false, status: 'draft', updatedAt: new Date() })
      .where(eq(products.id, id));
    await logAudit({
      actorUid: req.dbUser!.uid,
      actorEmail: req.dbUser!.email,
      action: 'SOFT_DELETE_PRODUCT',
      entityType: 'product',
      entityId: id,
    });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Failed to delete product.' });
  }
});

// Inventory Stock Adjustments + Movement Log
adminRouter.post('/inventory/adjust', async (req: AuthRequest, res) => {
  try {
    const productId = Number(req.body.productId);
    const deltaQty = Math.trunc(Number(req.body.deltaQty || 0));
    const reason = String(req.body.reason || 'Manual Stock Adjustment').trim();

    if (!productId || deltaQty === 0) {
      return res.status(400).json({ error: 'Product ID and non-zero stock delta are required.' });
    }

    const [prod] = await db.select().from(products).where(eq(products.id, productId)).limit(1);
    if (!prod) return res.status(404).json({ error: 'Product not found.' });

    const nextQty = Math.max(0, prod.stockQty + deltaQty);
    const [updated] = await db
      .update(products)
      .set({ stockQty: nextQty, updatedAt: new Date() })
      .where(eq(products.id, productId))
      .returning();

    const [movement] = await db
      .insert(inventoryMovements)
      .values({
        productId,
        deltaQty: nextQty - prod.stockQty,
        previousQty: prod.stockQty,
        newQty: nextQty,
        reason,
        actorEmail: req.dbUser!.email,
      })
      .returning();

    await logAudit({
      actorUid: req.dbUser!.uid,
      actorEmail: req.dbUser!.email,
      action: 'ADJUST_INVENTORY',
      entityType: 'product',
      entityId: productId,
      details: { previousQty: prod.stockQty, newQty: nextQty, reason },
    });

    res.json({ product: updated, movement });
  } catch (error) {
    console.error('Inventory adjust error:', error);
    res.status(500).json({ error: 'Failed to adjust inventory.' });
  }
});

// Bulk Product CSV Export & Import
adminRouter.get('/products/csv-export', async (_req, res) => {
  const all = await db.select().from(products).where(eq(products.isDeleted, false)).orderBy(desc(products.createdAt));
  const csv = toCsv(
    ['sku', 'name', 'brand', 'productType', 'modelNumber', 'storeScope', 'priceInr', 'discountPriceInr', 'gstPercent', 'stockQty', 'material', 'dimensions', 'isFeatured', 'isBestseller', 'isNewArrival', 'isPublished', 'description'],
    all.map((p) => [
      p.sku,
      p.name,
      p.brand,
      p.productType,
      p.modelNumber,
      p.storeScope,
      p.priceInr,
      p.discountPriceInr ?? '',
      p.gstPercent,
      p.stockQty,
      p.material,
      p.dimensions,
      p.isFeatured,
      p.isBestseller,
      p.isNewArrival,
      p.isPublished,
      p.description,
    ])
  );
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="nexustekfusion-products.csv"');
  res.send(csv);
});

adminRouter.post('/products/csv-import', async (req: AuthRequest, res) => {
  try {
    const csvText = String(req.body.csvText || '').trim();
    if (!csvText) return res.status(400).json({ error: 'CSV content is empty.' });

    const rows = parseCsvRows(csvText);
    if (rows.length < 2) return res.status(400).json({ error: 'CSV must include header row and at least one product row.' });

    const header = rows[0].map((h) => h.toLowerCase());
    const idx = (k: string) => header.indexOf(k.toLowerCase());
    let createdCount = 0;
    let updatedCount = 0;

    for (const r of rows.slice(1)) {
      const sku = (r[idx('sku')] || '').trim().toUpperCase();
      const name = (r[idx('name')] || '').trim();
      const priceInr = Number(r[idx('priceinr')] || 0);
      if (!sku || !name) continue;

      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + sku.toLowerCase();
      const [existing] = await db.select().from(products).where(eq(products.sku, sku)).limit(1);
      const values = {
        sku,
        name,
        brand: (idx('brand') >= 0 ? r[idx('brand')] : '') || 'NexusTekFusion',
        productType: (idx('producttype') >= 0 ? r[idx('producttype')] : '') || 'simple',
        modelNumber: (idx('modelnumber') >= 0 ? r[idx('modelnumber')] : '') || '',
        storeScope: (idx('storescope') >= 0 && r[idx('storescope')] === '3d_printed') ? '3d_printed' : 'general',
        priceInr,
        discountPriceInr: idx('discountpriceinr') >= 0 && r[idx('discountpriceinr')] ? Number(r[idx('discountpriceinr')]) : null,
        gstPercent: idx('gstpercent') >= 0 && r[idx('gstpercent')] ? Number(r[idx('gstpercent')]) : 18,
        stockQty: idx('stockqty') >= 0 && r[idx('stockqty')] ? Number(r[idx('stockqty')]) : 0,
        material: (idx('material') >= 0 ? r[idx('material')] : '') || '',
        dimensions: (idx('dimensions') >= 0 ? r[idx('dimensions')] : '') || '',
        description: (idx('description') >= 0 ? r[idx('description')] : '') || '',
        isFeatured: idx('isfeatured') >= 0 ? r[idx('isfeatured')] === 'true' : false,
        isBestseller: idx('isbestseller') >= 0 ? r[idx('isbestseller')] === 'true' : false,
        isNewArrival: idx('isnewarrival') >= 0 ? r[idx('isnewarrival')] !== 'false' : true,
        isPublished: idx('ispublished') >= 0 ? r[idx('ispublished')] !== 'false' : true,
        isDeleted: false,
        updatedAt: new Date(),
      };

      if (existing) {
        await db.update(products).set(values).where(eq(products.id, existing.id));
        updatedCount++;
      } else {
        await db.insert(products).values({
          ...values,
          slug,
          imageUrl: '/src/assets/images/service_pcb_electronics_1794981062614.jpg',
        });
        createdCount++;
      }
    }

    await logAudit({
      actorUid: req.dbUser!.uid,
      actorEmail: req.dbUser!.email,
      action: 'CSV_IMPORT_PRODUCTS',
      entityType: 'product',
      details: { createdCount, updatedCount },
    });

    res.json({ ok: true, createdCount, updatedCount });
  } catch (error: any) {
    console.error('CSV import error:', error);
    res.status(400).json({ error: error?.message || 'CSV import failed.' });
  }
});

// Operational CSV Reports Export
adminRouter.get('/export/:type', async (req, res) => {
  const type = req.params.type;
  let csv = '';
  const filename = `nexustekfusion-${type}.csv`;

  if (type === 'orders') {
    const rows = await db.select().from(storeOrders).where(eq(storeOrders.isDeleted, false)).orderBy(desc(storeOrders.createdAt));
    csv = toCsv(
      ['Order Number', 'Status', 'Payment Status', 'Subtotal', 'Discount', 'Shipping', 'GST', 'Total', 'Tracking Courier', 'Tracking ID', 'Created At'],
      rows.map((r) => [r.orderNumber, r.orderStatus, r.paymentStatus, r.subtotalInr, r.discountInr, r.shippingInr, r.gstInr, r.totalInr, r.trackingCourier, r.trackingId, r.createdAt.toISOString()])
    );
  } else if (type === '3d-orders') {
    const rows = await db.select().from(printingOrders).orderBy(desc(printingOrders.createdAt));
    csv = toCsv(
      ['Order Number', 'File', 'Tech', 'Material', 'Qty', 'Total INR', 'Order Status', 'Payment Status', 'Created At'],
      rows.map((r) => [r.orderNumber, r.fileName, r.technology, r.materialName, r.quantity, r.totalInr, r.orderStatus, r.paymentStatus, r.createdAt.toISOString()])
    );
  } else if (type === 'customers') {
    const publicReady = await isPublicCustomersSchemaReady();
    const pubList = publicReady ? await listPublicCustomers() : null;
    if (pubList) {
      csv = toCsv(
        ['Customer ID', 'Email', 'Full Name', 'Phone Number', 'Company/College', 'Full Address', 'City', 'State', 'PIN Code', 'Account Status', 'Registration Date'],
        pubList.map((c) => [c.customerId, c.email, c.fullName, c.phoneNumber, c.companyOrCollege, c.fullAddress, c.city, c.state, c.pinCode, c.accountStatus, c.registrationDate])
      );
    } else {
      const rows = await db
        .select()
        .from(users)
        .where(isNull(users.deletedAt))
        .orderBy(desc(users.createdAt));
      csv = toCsv(
        ['ID', 'Email', 'Full Name', 'Mobile', 'Company/College', 'Full Address', 'City', 'State', 'PIN Code', 'Role', 'Account Status', 'Created At'],
        rows.map((u) => [u.id, u.email, u.fullName, u.mobile, u.companyOrCollege, u.fullAddress, u.city, u.state, u.pinCode, u.role, u.accountStatus, u.createdAt.toISOString()])
      );
    }
  } else if (type === 'enquiries') {
    const rows = await db.select().from(projectEnquiries).where(eq(projectEnquiries.isDeleted, false)).orderBy(desc(projectEnquiries.createdAt));
    csv = toCsv(
      ['Enquiry No', 'Project Title', 'Customer Name', 'Email', 'Phone', 'Branch', 'Category', 'Budget', 'Status', 'Assigned Engineer', 'Created At'],
      rows.map((e) => [e.enquiryNumber, e.projectTitle, e.customerName, e.customerEmail, e.customerPhone, e.engineeringBranch, e.projectCategory, e.estimatedBudget, e.status, e.assignedEngineer, e.createdAt.toISOString()])
    );
  } else if (type === 'payments') {
    const rows = await db.select().from(payments).orderBy(desc(payments.createdAt));
    csv = toCsv(
      ['Payment Ref', 'Entity Type', 'Entity ID', 'Amount INR', 'Mode', 'Status', 'Razorpay Order ID', 'Razorpay Payment ID', 'Created At'],
      rows.map((p) => [p.paymentRef, p.entityType, p.entityId, p.amountInr, p.mode, p.status, p.razorpayOrderId, p.razorpayPaymentId, p.createdAt.toISOString()])
    );
  } else if (type === 'invoices') {
    const rows = await db.select().from(invoices).where(eq(invoices.isDeleted, false)).orderBy(desc(invoices.issuedAt));
    csv = toCsv(
      ['Invoice Number', 'Doc Type', 'Entity Type', 'Entity ID', 'Amount INR', 'GST INR', 'Issued At'],
      rows.map((inv) => [inv.invoiceNumber, inv.docType, inv.entityType, inv.entityId, inv.amountInr, inv.gstInr, inv.issuedAt.toISOString()])
    );
  } else if (type === 'newsletter') {
    const rows = await db.select().from(newsletterSubscribers).orderBy(desc(newsletterSubscribers.createdAt));
    csv = toCsv(
      ['Email', 'Source', 'Subscribed At'],
      rows.map((s) => [s.email, s.source, s.createdAt.toISOString()])
    );
  } else if (type === 'sales') {
    const rows = await db
      .select()
      .from(storeOrders)
      .where(and(eq(storeOrders.isDeleted, false), eq(storeOrders.paymentStatus, 'paid')))
      .orderBy(desc(storeOrders.createdAt));
    csv = toCsv(
      ['Order Number', 'Customer Name', 'Mobile', 'City', 'Subtotal INR', 'Discount INR', 'Shipping INR', 'GST INR', 'Total INR', 'Refund Status', 'Razorpay Payment ID', 'Created At'],
      rows.map((r) => [
        r.orderNumber,
        (r.shippingAddress as any)?.fullName || '',
        (r.shippingAddress as any)?.mobile || '',
        (r.shippingAddress as any)?.city || '',
        r.subtotalInr,
        r.discountInr,
        r.shippingInr,
        r.gstInr,
        r.totalInr,
        r.refundStatus || 'none',
        r.razorpayPaymentId,
        r.createdAt.toISOString(),
      ])
    );
  } else {
    return res.status(400).json({ error: 'Unsupported export type.' });
  }

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
});

// Razorpay Payment Refund Initiation & Tracking
adminRouter.post(
  '/payments/:id/refund',
  requireAdmin(['super_admin', 'accounts_manager']),
  async (req: AuthRequest, res) => {
    try {
      const paymentId = Number(req.params.id);
      const amountInrReq = req.body.amountInr ? Number(req.body.amountInr) : 0;
      const reason = String(req.body.reason || 'Customer refund approved by administrator').trim();

      const [payment] = await db.select().from(payments).where(eq(payments.id, paymentId)).limit(1);
      if (!payment) return res.status(404).json({ error: 'Payment record not found.' });
      if (payment.status === 'failed') {
        return res.status(400).json({ error: 'Failed transactions cannot be refunded.' });
      }
      const maxRefundable = Math.max(0, payment.amountInr - (payment.refundedAmountInr || 0));
      if (maxRefundable <= 0) {
        return res.status(400).json({ error: 'This payment has already been fully refunded.' });
      }

      const refundAmountInr =
        amountInrReq > 0 ? Math.min(maxRefundable, Math.round(amountInrReq)) : maxRefundable;
      const refundAmountPaise = Math.round(refundAmountInr * 100);

      const rzpRefund = await createRazorpayRefund({
        razorpayPaymentId: payment.razorpayPaymentId,
        amountPaise: refundAmountPaise,
        notes: { reason, paymentRef: payment.paymentRef, actor: req.dbUser!.email },
      });

      const refundRef = generateCode('NTF-RFND');
      const [refundRecord] = await db
        .insert(paymentRefunds)
        .values({
          refundRef,
          paymentId: payment.id,
          entityType: payment.entityType,
          entityId: payment.entityId,
          razorpayPaymentId: payment.razorpayPaymentId,
          razorpayRefundId: rzpRefund.razorpayRefundId,
          amountInr: refundAmountInr,
          amountPaise: refundAmountPaise,
          reason,
          status: rzpRefund.status,
          initiatedBy: req.dbUser!.email,
          processedAt: rzpRefund.status === 'processed' ? new Date() : null,
        })
        .returning();

      const totalRefunded = (payment.refundedAmountInr || 0) + refundAmountInr;
      const isFullRefund = totalRefunded >= payment.amountInr;
      const nextRefundStatus =
        rzpRefund.status === 'failed' ? 'failed' : isFullRefund ? 'full' : 'partial';

      const [updatedPayment] = await db
        .update(payments)
        .set({
          refundedAmountInr: totalRefunded,
          refundStatus: nextRefundStatus,
          status: isFullRefund ? 'refunded' : 'partially_refunded',
        })
        .where(eq(payments.id, payment.id))
        .returning();

      if (payment.entityType === 'store_order' && payment.entityId > 0) {
        await db
          .update(storeOrders)
          .set({
            refundStatus: nextRefundStatus,
            paymentStatus: isFullRefund ? 'refunded' : 'partially_refunded',
            orderStatus: isFullRefund ? 'Refunded' : 'Partially Refunded',
            updatedAt: new Date(),
          })
          .where(eq(storeOrders.id, payment.entityId));
      } else if (payment.entityType === 'printing_order' && payment.entityId > 0) {
        const [existingPo] = await db
          .select()
          .from(printingOrders)
          .where(eq(printingOrders.id, payment.entityId))
          .limit(1);
        const revertedOrderStatus =
          existingPo && isFullRefund && PRINTING_EXECUTION_STATUSES.has(existingPo.orderStatus)
            ? 'Pending Payment'
            : existingPo?.orderStatus;
        const [updatedPo] = await db
          .update(printingOrders)
          .set({
            refundStatus: nextRefundStatus,
            paymentStatus: isFullRefund ? 'refunded' : 'partially_refunded',
            ...(revertedOrderStatus ? { orderStatus: revertedOrderStatus } : {}),
            updatedAt: new Date(),
          })
          .where(eq(printingOrders.id, payment.entityId))
          .returning();
        if (updatedPo) {
          syncPrintingOrderToSupabase({
            orderNumber: updatedPo.orderNumber,
            customerId: updatedPo.customerId,
            customerName: updatedPo.customerName,
            email: updatedPo.email,
            phone: updatedPo.phone,
            fileName: updatedPo.fileName,
            fileFormat: updatedPo.fileFormat,
            fileSizeBytes: updatedPo.fileSizeBytes,
            fileStoragePath: updatedPo.fileStoragePath,
            storageBucket: updatedPo.storageBucket,
            technology: updatedPo.technology,
            materialName: updatedPo.materialName,
            colorName: updatedPo.colorName,
            quotedPriceInr: updatedPo.quotedPriceInr,
            totalInr: updatedPo.totalInr,
            paymentStatus: updatedPo.paymentStatus,
            refundStatus: updatedPo.refundStatus,
            razorpayOrderId: updatedPo.razorpayOrderId,
            razorpayPaymentId: updatedPo.razorpayPaymentId,
            orderStatus: updatedPo.orderStatus,
            rejectionReason: updatedPo.rejectionReason,
          }).catch(() => {});
        }
      }

      syncRefundToSupabase({
        refundRef,
        razorpayPaymentId: payment.razorpayPaymentId,
        razorpayRefundId: rzpRefund.razorpayRefundId,
        amountInr: refundAmountInr,
        amountPaise: refundAmountPaise,
        reason,
        status: rzpRefund.status,
        initiatedBy: req.dbUser!.email,
        processedAt: refundRecord.processedAt,
      }).catch(() => {});

      await logAudit({
        actorUid: req.dbUser!.uid,
        actorEmail: req.dbUser!.email,
        action: 'INITIATE_REFUND',
        entityType: 'payment',
        entityId: payment.id,
        details: { refundRef, amountInr: refundAmountInr, reason, status: rzpRefund.status },
      });

      res.status(201).json({ refund: refundRecord, payment: updatedPayment });
    } catch (error: any) {
      console.error('Admin refund error:', error);
      res.status(400).json({ error: error?.message || 'Failed to initiate refund.' });
    }
  }
);

// Store Orders Status, Status History Timeline, Shipment Tracking, Internal Notes & Soft Delete
adminRouter.patch('/store-orders/:id', async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const {
      orderStatus,
      trackingCourier,
      trackingId,
      trackingUrl,
      dispatchDate,
      expectedDeliveryDate,
      internalNotes,
      statusNote,
      shippingAddress,
      paymentMethod,
    } = req.body;
    const [existing] = await db.select().from(storeOrders).where(eq(storeOrders.id, id)).limit(1);
    if (!existing) return res.status(404).json({ error: 'Store order not found.' });

    const nextStatus = orderStatus ?? existing.orderStatus;
    const prevHistory = existing.statusHistory || [
      {
        status: existing.orderStatus,
        timestamp: existing.createdAt.toISOString(),
        note: 'Initial order recorded.',
        actor: 'system',
      },
    ];
    const nextHistory =
      orderStatus && orderStatus !== existing.orderStatus
        ? [
            ...prevHistory,
            {
              status: nextStatus,
              timestamp: new Date().toISOString(),
              note:
                String(statusNote || '').trim() ||
                (trackingId ? `Tracking: ${trackingCourier || 'Courier'} (${trackingId})` : `Updated to ${nextStatus}`),
              actor: req.dbUser!.email,
            },
          ]
        : prevHistory;

    const mergedShipping =
      shippingAddress && typeof shippingAddress === 'object'
        ? { ...(existing.shippingAddress || {}), ...shippingAddress }
        : existing.shippingAddress;

    const [updated] = await db
      .update(storeOrders)
      .set({
        orderStatus: nextStatus,
        trackingCourier: trackingCourier ?? existing.trackingCourier,
        trackingId: trackingId ?? existing.trackingId,
        trackingUrl: trackingUrl ?? existing.trackingUrl,
        dispatchDate: dispatchDate ?? existing.dispatchDate,
        expectedDeliveryDate: expectedDeliveryDate ?? existing.expectedDeliveryDate,
        internalNotes: internalNotes ?? existing.internalNotes,
        shippingAddress: mergedShipping,
        paymentMethod: paymentMethod ?? existing.paymentMethod,
        statusHistory: nextHistory,
        updatedAt: new Date(),
      })
      .where(eq(storeOrders.id, id))
      .returning();

    const [customer] = updated.userId
      ? await db.select().from(users).where(eq(users.id, updated.userId)).limit(1)
      : [];

    await Promise.all([
      updated.userId
        ? createNotification({
            userId: updated.userId,
            title: `Order ${updated.orderNumber}: ${updated.orderStatus}`,
            message: updated.trackingId
              ? `Shipped via ${updated.trackingCourier} (${updated.trackingId}).`
              : `Order status updated to ${updated.orderStatus}.`,
            link: '/my-account',
          })
        : Promise.resolve(),
      customer?.email
        ? dispatchLifecycleEmail({
            userId: updated.userId,
            recipientEmail: customer.email,
            eventType: 'store_order_status_updated',
            vars: {
              customerName: customer.fullName || updated.shippingAddress?.fullName || customer.email,
              orderNumber: updated.orderNumber,
              orderStatus: updated.orderStatus,
              trackingInfo: updated.trackingId
                ? `Courier: ${updated.trackingCourier} · AWB: ${updated.trackingId}`
                : 'No courier AWB attached yet.',
            },
          })
        : Promise.resolve(),
    ]);

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
      trackingCourier: updated.trackingCourier,
      trackingId: updated.trackingId,
      trackingUrl: updated.trackingUrl,
      dispatchDate: updated.dispatchDate,
      expectedDeliveryDate: updated.expectedDeliveryDate,
      statusHistory: updated.statusHistory,
    }).catch(() => {});

    await logAudit({
      actorUid: req.dbUser!.uid,
      actorEmail: req.dbUser!.email,
      action: 'UPDATE_STORE_ORDER',
      entityType: 'store_order',
      entityId: id,
      details: { orderStatus: updated.orderStatus, trackingId: updated.trackingId },
    });
    emitAdminStreamEvent({ type: 'order', action: 'updated', id: updated.orderNumber, summary: updated.orderStatus });
    res.json({ order: updated });
  } catch {
    res.status(500).json({ error: 'Failed to update store order.' });
  }
});

// Paid-Only Tax Invoice Regeneration / Issuance by Admin
adminRouter.post('/invoices/:orderId/regenerate', async (req: AuthRequest, res) => {
  try {
    const orderId = Number(req.params.orderId);
    const [order] = await db.select().from(storeOrders).where(eq(storeOrders.id, orderId)).limit(1);
    if (!order) return res.status(404).json({ error: 'Store order not found.' });
    if (order.paymentStatus !== 'paid') {
      return res.status(400).json({ error: 'Tax invoices can only be generated or regenerated for PAID orders.' });
    }

    const [[customer], [companyRow]] = await Promise.all([
      order.userId ? db.select().from(users).where(eq(users.id, order.userId)).limit(1) : Promise.resolve([]),
      db.select().from(siteSettings).where(eq(siteSettings.key, 'companyInfo')).limit(1),
    ]);
    const companyInfo = (companyRow?.value as { gstin?: string }) || {};
    const addrState = String(order.shippingAddress?.state || order.billingAddress?.state || '').trim();
    const isIntraState = /maharashtra/i.test(addrState);
    const cgstInr = isIntraState ? Math.floor(order.gstInr / 2) : 0;
    const sgstInr = isIntraState ? order.gstInr - cgstInr : 0;
    const igstInr = isIntraState ? 0 : order.gstInr;

    const payload = {
      orderNumber: order.orderNumber,
      items: order.items,
      shippingAddress: order.shippingAddress,
      billingAddress: order.billingAddress || order.shippingAddress,
      customerName: order.shippingAddress?.fullName || customer?.fullName || customer?.email || 'Customer',
      customerPhone: order.shippingAddress?.mobile || customer?.mobile || '',
      customerEmail: customer?.email || '',
      subtotalInr: order.subtotalInr,
      discountInr: order.discountInr,
      shippingInr: order.shippingInr,
      gstInr: order.gstInr,
      cgstInr,
      sgstInr,
      igstInr,
      isIntraState,
      paymentMethod: 'Razorpay',
      razorpayPaymentId: order.razorpayPaymentId || '',
      razorpayOrderId: order.razorpayOrderId || '',
    };

    const [existingInv] = await db
      .select()
      .from(invoices)
      .where(and(eq(invoices.entityType, 'store_order'), eq(invoices.entityId, order.id), eq(invoices.isDeleted, false)))
      .limit(1);

    let invoiceRecord;
    if (existingInv) {
      const [upd] = await db
        .update(invoices)
        .set({
          docType: companyInfo.gstin ? 'GST Tax Invoice' : 'Tax Invoice',
          amountInr: order.totalInr,
          gstInr: order.gstInr,
          payload,
          issuedAt: new Date(),
        })
        .where(eq(invoices.id, existingInv.id))
        .returning();
      invoiceRecord = upd;
    } else {
      const [createdInv] = await db
        .insert(invoices)
        .values({
          invoiceNumber: generateCode('NTF-INV'),
          userId: order.userId,
          entityType: 'store_order',
          entityId: order.id,
          docType: companyInfo.gstin ? 'GST Tax Invoice' : 'Tax Invoice',
          amountInr: order.totalInr,
          gstInr: order.gstInr,
          payload,
        })
        .returning();
      invoiceRecord = createdInv;
    }

    await logAudit({
      actorUid: req.dbUser!.uid,
      actorEmail: req.dbUser!.email,
      action: 'REGENERATE_INVOICE',
      entityType: 'invoice',
      entityId: invoiceRecord.id,
      details: { orderNumber: order.orderNumber, invoiceNumber: invoiceRecord.invoiceNumber },
    });

    res.json({ invoice: invoiceRecord });
  } catch (error) {
    console.error('Regenerate invoice error:', error);
    res.status(500).json({ error: 'Failed to regenerate invoice.' });
  }
});

// Product / KRASHIVANTRI Drone Enquiry Status & Staff Assignment
adminRouter.patch('/product-enquiries/:id', async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const { status, assignedStaff, internalNotes } = req.body;
    const [existing] = await db.select().from(productEnquiries).where(eq(productEnquiries.id, id)).limit(1);
    if (!existing) return res.status(404).json({ error: 'Product enquiry not found.' });

    const [updated] = await db
      .update(productEnquiries)
      .set({
        status: status ?? existing.status,
        assignedStaff: assignedStaff ?? existing.assignedStaff,
        internalNotes: internalNotes ?? existing.internalNotes,
        updatedAt: new Date(),
      })
      .where(eq(productEnquiries.id, id))
      .returning();

    if (updated.userId) {
      await createNotification({
        userId: updated.userId,
        title: `Drone Enquiry ${updated.enquiryNumber}: ${updated.status}`,
        message: `Your enquiry for ${updated.interestedProduct} is now marked "${updated.status}".`,
        link: '/my-account',
      });
    }

    syncProductEnquiryToSupabase({
      enquiryNumber: updated.enquiryNumber,
      fullName: updated.fullName,
      mobile: updated.mobile,
      email: updated.email,
      state: updated.state,
      district: updated.district,
      organizationOrFarmName: updated.organizationOrFarmName,
      interestedProduct: updated.interestedProduct,
      productSlug: updated.productSlug,
      quantity: updated.quantity,
      intendedApplication: updated.intendedApplication,
      message: updated.message,
      status: updated.status,
      assignedStaff: updated.assignedStaff,
      internalNotes: updated.internalNotes,
    }).catch(() => {});

    await logAudit({
      actorUid: req.dbUser!.uid,
      actorEmail: req.dbUser!.email,
      action: 'UPDATE_PRODUCT_ENQUIRY',
      entityType: 'product_enquiry',
      entityId: id,
      details: { enquiryNumber: updated.enquiryNumber, status: updated.status, assignedStaff: updated.assignedStaff },
    });

    res.json({ enquiry: updated });
  } catch {
    res.status(500).json({ error: 'Failed to update product enquiry.' });
  }
});

adminRouter.delete('/store-orders/:id', async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const reason = String(req.body?.reason || req.query?.reason || 'Archived by Admin').trim();
    const [existing] = await db.select().from(storeOrders).where(eq(storeOrders.id, id)).limit(1);
    if (!existing) return res.status(404).json({ error: 'Store order not found.' });

    const [archived] = await db
      .update(storeOrders)
      .set({
        isDeleted: true,
        archivedAt: new Date(),
        archivedReason: reason,
        archivedBy: req.dbUser!.email,
        updatedAt: new Date(),
      })
      .where(eq(storeOrders.id, id))
      .returning();

    const [owner] = existing.userId
      ? await db.select().from(users).where(eq(users.id, existing.userId)).limit(1)
      : [];

    await recordEntityStatusChange({
      entityType: 'store_order',
      entityId: existing.id,
      entityCode: existing.orderNumber,
      customerId: existing.customerId || owner?.uid || '',
      userId: existing.userId,
      userUid: owner?.authUserId || owner?.uid || '',
      customerEmail: owner?.email || '',
      previousStatus: existing.orderStatus,
      newStatus: 'Archived',
      actionType: 'archive',
      reason,
      adminId: req.dbUser!.uid,
      adminEmail: req.dbUser!.email,
      originalRecord: existing as unknown as Record<string, unknown>,
    });

    syncStoreOrderToSupabase({
      orderNumber: archived.orderNumber,
      userUid: owner?.uid || '',
      customerEmail: owner?.email || '',
      billingAddress: archived.billingAddress,
      shippingAddress: archived.shippingAddress,
      items: archived.items,
      subtotalInr: archived.subtotalInr,
      discountInr: archived.discountInr,
      shippingInr: archived.shippingInr,
      gstInr: archived.gstInr,
      totalInr: archived.totalInr,
      couponCode: archived.couponCode,
      paymentStatus: archived.paymentStatus,
      refundStatus: archived.refundStatus,
      orderStatus: archived.orderStatus,
    }).catch(() => {});

    res.json({ ok: true, archived: true, order: archived });
  } catch {
    res.status(500).json({ error: 'Failed to archive store order.' });
  }
});

// 3D Printing Materials, Machines & Orders
adminRouter.get('/printing-config', async (_req, res) => {
  const [materials, machines] = await Promise.all([
    db.select().from(printingMaterials),
    db.select().from(printingMachines),
  ]);
  res.json({ materials, machines });
});

adminRouter.post('/printing-materials', async (req: AuthRequest, res) => {
  try {
    const b = req.body;
    const [created] = await db
      .insert(printingMaterials)
      .values({
        name: String(b.name).trim(),
        technology: String(b.technology || 'FDM'),
        densityGcm3: Number(b.densityGcm3 || 1.24),
        ratePerGramInr: Number(b.ratePerGramInr || 6),
        availableColors: b.availableColors || [{ name: 'Black', hex: '#18181b' }],
        layerHeightsMm: b.layerHeightsMm || [0.15, 0.2],
        description: String(b.description || ''),
        isActive: b.isActive !== false,
      })
      .returning();
    await logAudit({
      actorUid: req.dbUser!.uid,
      actorEmail: req.dbUser!.email,
      action: 'CREATE_3DP_MATERIAL',
      entityType: 'printing_material',
      entityId: created.id,
    });
    res.status(201).json({ material: created });
  } catch (error: any) {
    res.status(400).json({ error: error?.message || 'Failed to add material.' });
  }
});

adminRouter.put('/printing-machines/:id', async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const b = req.body;
    const [updated] = await db
      .update(printingMachines)
      .set({
        name: b.name,
        hourlyRateInr: Number(b.hourlyRateInr),
        minOrderInr: Number(b.minOrderInr),
        wastagePercent: Number(b.wastagePercent),
        labourFeeInr: Number(b.labourFeeInr),
        finishingFeeInr: Number(b.finishingFeeInr),
        isActive: Boolean(b.isActive),
      })
      .where(eq(printingMachines.id, id))
      .returning();
    if (!updated) return res.status(404).json({ error: 'Machine not found.' });
    await logAudit({
      actorUid: req.dbUser!.uid,
      actorEmail: req.dbUser!.email,
      action: 'UPDATE_3DP_MACHINE',
      entityType: 'printing_machine',
      entityId: id,
    });
    res.json({ machine: updated });
  } catch {
    res.status(500).json({ error: 'Failed to update printer rate.' });
  }
});

const productionFileUpload = createProduction3DMemoryUploadMiddleware(100);

// Filterable 3D Printing Enquiries & Admin CAD Vault
adminRouter.get('/printing-orders', async (req: AuthRequest, res) => {
  try {
    const paymentFilter = String(req.query.paymentStatus || '').trim().toLowerCase();
    const statusFilter = String(req.query.orderStatus || '').trim();
    const includeArchived = req.query.includeArchived === 'true';
    const q = String(req.query.q || '').trim().toLowerCase();
    const dateFrom = String(req.query.dateFrom || '').trim();
    const dateTo = String(req.query.dateTo || '').trim();

    const [orders, allUsers, prodFiles, dlLogs] = await Promise.all([
      includeArchived
        ? db.select().from(printingOrders).orderBy(desc(printingOrders.createdAt))
        : db.select().from(printingOrders).where(eq(printingOrders.isDeleted, false)).orderBy(desc(printingOrders.createdAt)),
      db.select().from(users),
      db.select().from(printingProductionFiles).orderBy(desc(printingProductionFiles.createdAt)),
      db.select().from(printingFileDownloadLogs).orderBy(desc(printingFileDownloadLogs.createdAt)).limit(300),
    ]);

    const userMap = new Map(allUsers.map((u) => [u.id, u]));
    const prodMap = new Map<number, typeof prodFiles>();
    for (const pf of prodFiles) {
      const list = prodMap.get(pf.printingOrderId) || [];
      list.push(pf);
      prodMap.set(pf.printingOrderId, list);
    }
    const logMap = new Map<number, typeof dlLogs>();
    for (const dl of dlLogs) {
      const list = logMap.get(dl.printingOrderId) || [];
      list.push(dl);
      logMap.set(dl.printingOrderId, list);
    }

    const enriched = orders.map((po) => {
      const cust = po.userId ? userMap.get(po.userId) : undefined;
      const payDisp = getPaymentStatusDisplay(po.paymentStatus, po.refundStatus);
      const printAuth = checkPrintingAuthorization(po);
      const addr = (po.deliveryAddress as Record<string, any>) || {};
      const customerName = po.customerName || cust?.fullName || addr.fullName || '';
      const customerEmail = po.email || cust?.email || addr.email || '';
      const customerMobile = po.phone || cust?.mobile || addr.mobile || '';
      const customerId = po.customerId || cust?.uid || (po.userId ? `USER-${po.userId}` : '');
      return {
        ...po,
        customerId,
        customerName,
        email: customerEmail,
        phone: customerMobile,
        customerEmail,
        customerMobile,
        customerDetails: {
          customerId,
          fullName: customerName,
          email: customerEmail,
          mobile: customerMobile,
          companyOrCollege: cust?.companyOrCollege || '',
          fullAddress:
            cust?.fullAddress ||
            [addr.houseFlat, addr.streetArea, addr.line1, addr.city, addr.state, addr.pinCode]
              .filter(Boolean)
              .join(', '),
          city: cust?.city || addr.city || '',
          state: cust?.state || addr.state || '',
          pinCode: cust?.pinCode || addr.pinCode || '',
          accountStatus: cust?.accountStatus || 'Active',
          registrationDate: cust?.createdAt ? new Date(cust.createdAt).toISOString() : undefined,
        },
        downloadUnlocked: true,
        downloadLockReason: '',
        printingAuthorized: printAuth.authorized,
        printingBlockReason: printAuth.reason,
        paymentLabel: payDisp.label,
        paymentWarning: payDisp.warning,
        productionFiles: prodMap.get(po.id) || [],
        downloadLogs: logMap.get(po.id) || [],
      };
    });

    const filtered = enriched.filter((o) => {
      if (paymentFilter) {
        const normCode = getPaymentStatusDisplay(o.paymentStatus, o.refundStatus).code;
        if (String(o.paymentStatus).toLowerCase() !== paymentFilter && normCode !== paymentFilter) {
          return false;
        }
      }
      if (statusFilter && o.orderStatus !== statusFilter) return false;
      if (dateFrom && new Date(o.createdAt) < new Date(`${dateFrom}T00:00:00.000Z`)) return false;
      if (dateTo && new Date(o.createdAt) > new Date(`${dateTo}T23:59:59.999Z`)) return false;
      if (q) {
        const hay = `${o.orderNumber} ${o.fileName} ${o.customerId} ${o.customerName} ${o.customerEmail} ${o.customerMobile} ${o.materialName} ${o.technology}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    res.json({ orders: filtered, statuses: PRINTING_ORDER_STATUSES });
  } catch (error) {
    console.error('Admin list 3D printing orders error:', error);
    res.status(500).json({ error: 'Failed to load 3D printing enquiries.' });
  }
});

// Update 3D Printing Enquiry Quotation, Status, Confirmed Parameters & Logistics
// Enforces separate permission: Printing execution statuses are strictly blocked until paymentStatus === 'paid'.
adminRouter.patch('/printing-orders/:id', async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const {
      orderStatus,
      slicingStatus,
      totalInr,
      quotedPriceInr,
      paymentStatus,
      razorpayPaymentId,
      rejectionReason,
      trackingCourier,
      trackingId,
      trackingUrl,
      productionNotes,
      confirmedParameters,
      customerDownloadEnabled,
    } = req.body;

    const [existing] = await db.select().from(printingOrders).where(eq(printingOrders.id, id)).limit(1);
    if (!existing) return res.status(404).json({ error: '3D printing enquiry not found.' });

    if (
      orderStatus !== undefined &&
      !PRINTING_ORDER_STATUSES.includes(orderStatus as any) &&
      ![
        'Order Placed',
        'Payment Confirmed',
        'Technical Review',
        'Slicing Completed',
        'Printing Scheduled',
        'Packaging',
        'Shipped',
        'Delivered',
      ].includes(String(orderStatus))
    ) {
      return res.status(400).json({ error: `Invalid printing status '${orderStatus}'.` });
    }

    // Optional payment status transition (explicitly submitted)
    let nextPaymentStatus = existing.paymentStatus;
    let nextRefundStatus = existing.refundStatus;
    let nextPaymentVerifiedAt = existing.paymentVerifiedAt;
    let nextRazorpayPaymentId = existing.razorpayPaymentId;

    if (paymentStatus !== undefined) {
      const normalized = String(paymentStatus).trim().toLowerCase();
      if (!['pending', 'paid', 'failed', 'refunded'].includes(normalized)) {
        return res.status(400).json({ error: `Invalid payment status '${paymentStatus}'.` });
      }
      nextPaymentStatus = normalized;
      if (normalized === 'paid') {
        nextRefundStatus = 'none';
        nextPaymentVerifiedAt = new Date();
        if (razorpayPaymentId !== undefined) {
          nextRazorpayPaymentId = String(razorpayPaymentId).trim();
        } else if (!nextRazorpayPaymentId) {
          nextRazorpayPaymentId = `ADMIN_VERIFIED_${Date.now()}`;
        }
      } else if (normalized === 'refunded') {
        nextRefundStatus = 'full';
      } else {
        nextRefundStatus = 'none';
        nextPaymentVerifiedAt = null;
      }
    } else if (razorpayPaymentId !== undefined) {
      nextRazorpayPaymentId = String(razorpayPaymentId).trim();
    }

    const effectiveNextOrderStatus = orderStatus ?? existing.orderStatus;

    // Enforce Printing Authorization Rule: cannot mark ready/approved/in-progress until payment verified!
    if (
      orderStatus !== undefined &&
      PRINTING_EXECUTION_STATUSES.has(String(orderStatus))
    ) {
      const authCheck = checkPrintingAuthorization({
        paymentStatus: nextPaymentStatus,
        refundStatus: nextRefundStatus,
        orderStatus: effectiveNextOrderStatus,
      });
      if (!authCheck.authorized) {
        return res.status(400).json({
          error: authCheck.reason,
          printingBlocked: true,
        });
      }
    }

    const incomingQuoteRaw = quotedPriceInr !== undefined ? quotedPriceInr : totalInr;
    const hasQuoteUpdate = incomingQuoteRaw !== undefined && Number(incomingQuoteRaw) > 0;
    const nextTotal = hasQuoteUpdate ? Math.round(Number(incomingQuoteRaw)) : existing.totalInr;
    const nextQuotedPrice = hasQuoteUpdate ? nextTotal : existing.quotedPriceInr;

    const nextSlicingStatus =
      slicingStatus ??
      (hasQuoteUpdate && existing.slicingStatus === 'Technical Review Required'
        ? 'Slicing Completed'
        : existing.slicingStatus);

    const nextPricing = {
      ...existing.pricingBreakdown,
      totalInr: nextTotal,
      technicalReviewRequired:
        hasQuoteUpdate || nextSlicingStatus === 'Slicing Completed'
          ? false
          : existing.pricingBreakdown.technicalReviewRequired,
    };

    const nextConfirmedParams =
      confirmedParameters && typeof confirmedParameters === 'object'
        ? {
            ...(existing.confirmedParameters || {}),
            ...confirmedParameters,
            confirmedBy: req.dbUser!.email,
            confirmedAt: new Date().toISOString(),
          }
        : existing.confirmedParameters;

    let finalOrderStatus = orderStatus ?? existing.orderStatus;
    if (
      orderStatus === undefined &&
      nextPaymentStatus !== 'paid' &&
      PRINTING_EXECUTION_STATUSES.has(existing.orderStatus)
    ) {
      finalOrderStatus = 'Pending Payment';
    } else if (
      orderStatus === undefined &&
      hasQuoteUpdate &&
      ['New Order', 'File Under Review'].includes(existing.orderStatus) &&
      nextPaymentStatus !== 'paid'
    ) {
      finalOrderStatus = 'Pending Payment';
    }

    const isBecomingApprovedForPrint =
      finalOrderStatus !== existing.orderStatus &&
      ['Ready for Printing', 'Approved for Printing', 'Printing Scheduled', 'Printing in Progress'].includes(finalOrderStatus);

    const [updated] = await db
      .update(printingOrders)
      .set({
        orderStatus: finalOrderStatus,
        slicingStatus: nextSlicingStatus,
        totalInr: nextTotal,
        quotedPriceInr: nextQuotedPrice,
        pricingBreakdown: nextPricing,
        confirmedParameters: nextConfirmedParams,
        paymentStatus: nextPaymentStatus,
        refundStatus: nextRefundStatus,
        paymentVerifiedAt: nextPaymentVerifiedAt,
        razorpayPaymentId: nextRazorpayPaymentId,
        rejectionReason: rejectionReason !== undefined ? String(rejectionReason) : existing.rejectionReason,
        printingApprovedAt: isBecomingApprovedForPrint ? new Date() : existing.printingApprovedAt,
        printingApprovedBy: isBecomingApprovedForPrint ? req.dbUser!.email : existing.printingApprovedBy,
        customerDownloadEnabled:
          typeof customerDownloadEnabled === 'boolean'
            ? customerDownloadEnabled
            : existing.customerDownloadEnabled,
        trackingCourier: trackingCourier ?? existing.trackingCourier,
        trackingId: trackingId ?? existing.trackingId,
        trackingUrl: trackingUrl ?? existing.trackingUrl,
        productionNotes: productionNotes ?? existing.productionNotes,
        updatedAt: new Date(),
      })
      .where(eq(printingOrders.id, id))
      .returning();

    syncPrintingOrderToSupabase({
      orderNumber: updated.orderNumber,
      customerId: updated.customerId,
      customerName: updated.customerName,
      email: updated.email,
      phone: updated.phone,
      fileName: updated.fileName,
      fileFormat: updated.fileFormat,
      fileSizeBytes: updated.fileSizeBytes,
      fileStoragePath: updated.fileStoragePath,
      storageBucket: updated.storageBucket,
      technology: updated.technology,
      materialName: updated.materialName,
      colorName: updated.colorName,
      quotedPriceInr: updated.quotedPriceInr,
      totalInr: updated.totalInr,
      paymentStatus: updated.paymentStatus,
      refundStatus: updated.refundStatus,
      razorpayOrderId: updated.razorpayOrderId,
      razorpayPaymentId: updated.razorpayPaymentId,
      orderStatus: updated.orderStatus,
      rejectionReason: updated.rejectionReason,
    }).catch(() => {});

    let recipientEmail = updated.email || (updated.deliveryAddress as any)?.email || '';
    if (!recipientEmail && updated.userId) {
      const [uRow] = await db.select().from(users).where(eq(users.id, updated.userId)).limit(1);
      recipientEmail = uRow?.email || '';
    }
    const custName = updated.customerName || (updated.deliveryAddress as any)?.fullName || 'Customer';

    if (updated.userId) {
      await createNotification({
        userId: updated.userId,
        title: `3D Print Enquiry ${updated.orderNumber}: ${updated.orderStatus}`,
        message: hasQuoteUpdate
          ? `Quotation updated to ₹${nextTotal.toLocaleString('en-IN')}. Status: ${updated.orderStatus}.`
          : `Status updated to ${updated.orderStatus}.`,
        link: '/my-account',
      });
    }

    if (recipientEmail) {
      if (finalOrderStatus !== existing.orderStatus && ['Completed', 'Dispatched / Delivered', 'Shipped', 'Delivered'].includes(finalOrderStatus)) {
        await dispatchLifecycleEmail({
          userId: updated.userId,
          recipientEmail,
          eventType: 'printing_status_completed',
          vars: {
            customerName: custName,
            orderNumber: updated.orderNumber,
            fileName: updated.fileName,
            orderStatus: updated.orderStatus,
            trackingNote: updated.trackingId ? `Tracking: ${updated.trackingCourier || 'Courier'} (${updated.trackingId})` : '',
          },
        });
      } else if (finalOrderStatus === 'Rejected' && existing.orderStatus !== 'Rejected') {
        await dispatchLifecycleEmail({
          userId: updated.userId,
          recipientEmail,
          eventType: 'printing_rejected',
          vars: {
            customerName: custName,
            orderNumber: updated.orderNumber,
            fileName: updated.fileName,
            reason: updated.rejectionReason || 'Rejected during engineering review.',
          },
        });
      } else if (isBecomingApprovedForPrint) {
        await dispatchLifecycleEmail({
          userId: updated.userId,
          recipientEmail,
          eventType: 'printing_approved',
          vars: {
            customerName: custName,
            orderNumber: updated.orderNumber,
            fileName: updated.fileName,
            orderStatus: updated.orderStatus,
          },
        });
      } else if (nextPaymentStatus === 'paid' && existing.paymentStatus !== 'paid') {
        await dispatchLifecycleEmail({
          userId: updated.userId,
          recipientEmail,
          eventType: 'printing_payment_confirmed',
          vars: {
            customerName: custName,
            orderNumber: updated.orderNumber,
            fileName: updated.fileName,
            amountInr: updated.quotedPriceInr ?? updated.totalInr,
          },
        });
      } else if (hasQuoteUpdate) {
        await dispatchLifecycleEmail({
          userId: updated.userId,
          recipientEmail,
          eventType: 'printing_quotation_updated',
          vars: {
            customerName: custName,
            orderNumber: updated.orderNumber,
            fileName: updated.fileName,
            quotedPriceInr: nextTotal.toLocaleString('en-IN'),
          },
        });
      }
    }

    await logAudit({
      actorUid: req.dbUser!.uid,
      actorEmail: req.dbUser!.email,
      action: 'UPDATE_3DP_ORDER',
      entityType: 'printing_order',
      entityId: id,
      details: {
        orderStatus: updated.orderStatus,
        slicingStatus: updated.slicingStatus,
        paymentStatus: updated.paymentStatus,
        totalInr: nextTotal,
        confirmedParametersUpdated: Boolean(confirmedParameters),
      },
    });
    res.json({ order: updated });
  } catch (err) {
    console.error('Admin update 3D printing order error:', err);
    res.status(500).json({ error: 'Failed to update 3D printing enquiry.' });
  }
});

// Explicit Admin Payment Status Update
adminRouter.patch('/printing-orders/:id/payment-status', async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const rawStatus = String(req.body?.paymentStatus || '').trim().toLowerCase();
    const paymentIdInput = String(req.body?.paymentId || req.body?.razorpayPaymentId || '').trim();
    const note = String(req.body?.note || '').trim();

    if (!['pending', 'paid', 'failed', 'refunded'].includes(rawStatus)) {
      return res.status(400).json({
        error: 'Payment status must be Pending Payment (pending), Payment Successful (paid), Payment Failed (failed), or Payment Refunded (refunded).',
      });
    }

    const [existing] = await db.select().from(printingOrders).where(eq(printingOrders.id, id)).limit(1);
    if (!existing) return res.status(404).json({ error: '3D printing enquiry not found.' });

    const nextRefundStatus = rawStatus === 'refunded' ? 'full' : 'none';
    const nextPaymentVerifiedAt = rawStatus === 'paid' ? new Date() : null;
    const nextPaymentId =
      paymentIdInput ||
      (rawStatus === 'paid' ? existing.razorpayPaymentId || `ADMIN_VERIFIED_${Date.now()}` : existing.razorpayPaymentId);

    let nextOrderStatus = existing.orderStatus;
    if (
      rawStatus === 'paid' &&
      ['New Order', 'Pending Payment', 'Payment Pending', 'File Under Review', 'Quotation Sent'].includes(
        existing.orderStatus
      )
    ) {
      nextOrderStatus = 'Payment Completed';
    } else if (rawStatus !== 'paid' && PRINTING_EXECUTION_STATUSES.has(existing.orderStatus)) {
      nextOrderStatus = 'Pending Payment';
    }

    const nextNotes = note
      ? [existing.productionNotes, `[Payment ${rawStatus.toUpperCase()} by ${req.dbUser!.email}]: ${note}`]
          .filter(Boolean)
          .join('\n')
      : existing.productionNotes;

    const [updated] = await db
      .update(printingOrders)
      .set({
        paymentStatus: rawStatus,
        refundStatus: nextRefundStatus,
        paymentVerifiedAt: nextPaymentVerifiedAt,
        razorpayPaymentId: nextPaymentId,
        orderStatus: nextOrderStatus,
        productionNotes: nextNotes,
        updatedAt: new Date(),
      })
      .where(eq(printingOrders.id, id))
      .returning();

    syncPrintingOrderToSupabase({
      orderNumber: updated.orderNumber,
      customerId: updated.customerId,
      customerName: updated.customerName,
      email: updated.email,
      phone: updated.phone,
      fileName: updated.fileName,
      fileFormat: updated.fileFormat,
      fileSizeBytes: updated.fileSizeBytes,
      fileStoragePath: updated.fileStoragePath,
      storageBucket: updated.storageBucket,
      technology: updated.technology,
      materialName: updated.materialName,
      colorName: updated.colorName,
      quotedPriceInr: updated.quotedPriceInr,
      totalInr: updated.totalInr,
      paymentStatus: updated.paymentStatus,
      refundStatus: updated.refundStatus,
      razorpayOrderId: updated.razorpayOrderId,
      razorpayPaymentId: updated.razorpayPaymentId,
      orderStatus: updated.orderStatus,
      rejectionReason: updated.rejectionReason,
    }).catch(() => {});

    const payDisp = getPaymentStatusDisplay(updated.paymentStatus, updated.refundStatus);
    if (updated.userId) {
      await createNotification({
        userId: updated.userId,
        title: `3D Print ${updated.orderNumber}: ${payDisp.label}`,
        message: `Payment status updated to ${payDisp.label}.`,
        link: '/my-account',
      });
    }
    if (rawStatus === 'paid') {
      let recipientEmail = updated.email || (updated.deliveryAddress as any)?.email || '';
      if (!recipientEmail && updated.userId) {
        const [uRow] = await db.select().from(users).where(eq(users.id, updated.userId)).limit(1);
        recipientEmail = uRow?.email || '';
      }
      if (recipientEmail) {
        await dispatchLifecycleEmail({
          userId: updated.userId,
          recipientEmail,
          eventType: 'printing_payment_confirmed',
          vars: {
            customerName: updated.customerName || (updated.deliveryAddress as any)?.fullName || 'Customer',
            orderNumber: updated.orderNumber,
            fileName: updated.fileName,
            amountInr: updated.quotedPriceInr ?? updated.totalInr,
          },
        });
      }
    }

    await logAudit({
      actorUid: req.dbUser!.uid,
      actorEmail: req.dbUser!.email,
      action: 'UPDATE_3DP_PAYMENT_STATUS',
      entityType: 'printing_order',
      entityId: id,
      details: {
        orderNumber: updated.orderNumber,
        paymentStatus: updated.paymentStatus,
        paymentLabel: payDisp.label,
        razorpayPaymentId: nextPaymentId,
      },
    });

    res.json({ order: updated, paymentLabel: payDisp.label });
  } catch (err) {
    console.error('Update 3D payment status error:', err);
    res.status(500).json({ error: 'Failed to update payment status.' });
  }
});

// Explicit Approve for Printing (Strictly Blocked Unless Payment Verified)
adminRouter.post('/printing-orders/:id/approve-printing', async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const nextStatus = String(req.body?.orderStatus || 'Ready for Printing').trim();

    const [existing] = await db.select().from(printingOrders).where(eq(printingOrders.id, id)).limit(1);
    if (!existing) return res.status(404).json({ error: '3D printing enquiry not found.' });

    const authCheck = checkPrintingAuthorization(existing);
    if (!authCheck.authorized) {
      return res.status(400).json({
        error: authCheck.reason,
        printingBlocked: true,
      });
    }

    const [updated] = await db
      .update(printingOrders)
      .set({
        orderStatus: PRINTING_EXECUTION_STATUSES.has(nextStatus) ? nextStatus : 'Ready for Printing',
        printingApprovedAt: new Date(),
        printingApprovedBy: req.dbUser!.email,
        updatedAt: new Date(),
      })
      .where(eq(printingOrders.id, id))
      .returning();

    syncPrintingOrderToSupabase({
      orderNumber: updated.orderNumber,
      customerId: updated.customerId,
      customerName: updated.customerName,
      email: updated.email,
      phone: updated.phone,
      fileName: updated.fileName,
      fileFormat: updated.fileFormat,
      fileSizeBytes: updated.fileSizeBytes,
      fileStoragePath: updated.fileStoragePath,
      storageBucket: updated.storageBucket,
      technology: updated.technology,
      materialName: updated.materialName,
      colorName: updated.colorName,
      quotedPriceInr: updated.quotedPriceInr,
      totalInr: updated.totalInr,
      paymentStatus: updated.paymentStatus,
      refundStatus: updated.refundStatus,
      razorpayOrderId: updated.razorpayOrderId,
      razorpayPaymentId: updated.razorpayPaymentId,
      orderStatus: updated.orderStatus,
      rejectionReason: updated.rejectionReason,
    }).catch(() => {});

    if (updated.userId) {
      await createNotification({
        userId: updated.userId,
        title: `3D Print ${updated.orderNumber}: Approved for Printing`,
        message: `Your payment is verified and your CAD model is approved for 3D printing (${updated.orderStatus}).`,
        link: '/my-account',
      });
    }
    {
      let recipientEmail = updated.email || (updated.deliveryAddress as any)?.email || '';
      if (!recipientEmail && updated.userId) {
        const [uRow] = await db.select().from(users).where(eq(users.id, updated.userId)).limit(1);
        recipientEmail = uRow?.email || '';
      }
      if (recipientEmail) {
        await dispatchLifecycleEmail({
          userId: updated.userId,
          recipientEmail,
          eventType: 'printing_approved',
          vars: {
            customerName: updated.customerName || (updated.deliveryAddress as any)?.fullName || 'Customer',
            orderNumber: updated.orderNumber,
            fileName: updated.fileName,
            orderStatus: updated.orderStatus,
          },
        });
      }
    }

    await logAudit({
      actorUid: req.dbUser!.uid,
      actorEmail: req.dbUser!.email,
      action: 'APPROVE_3DP_PRINTING',
      entityType: 'printing_order',
      entityId: id,
      details: { orderNumber: updated.orderNumber, orderStatus: updated.orderStatus },
    });

    res.json({ order: updated });
  } catch (err) {
    console.error('Approve 3D printing error:', err);
    res.status(500).json({ error: 'Failed to approve enquiry for printing.' });
  }
});

// Explicit Reject Enquiry (Non-destructive + preserves status & reason history)
adminRouter.post('/printing-orders/:id/reject', async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const reason = String(req.body?.reason || '').trim();
    if (!reason) {
      return res.status(400).json({ error: 'Rejection reason is required to reject a 3D printing enquiry.' });
    }

    const [existing] = await db.select().from(printingOrders).where(eq(printingOrders.id, id)).limit(1);
    if (!existing) return res.status(404).json({ error: '3D printing enquiry not found.' });

    const [updated] = await db
      .update(printingOrders)
      .set({
        orderStatus: 'Rejected',
        rejectionReason: reason,
        rejectedBy: req.dbUser!.email,
        rejectedAt: new Date(),
        productionNotes: [existing.productionNotes, `[Rejected by ${req.dbUser!.email}]: ${reason}`].filter(Boolean).join('\n'),
        updatedAt: new Date(),
      })
      .where(eq(printingOrders.id, id))
      .returning();

    syncPrintingOrderToSupabase({
      orderNumber: updated.orderNumber,
      customerId: updated.customerId,
      customerName: updated.customerName,
      email: updated.email,
      phone: updated.phone,
      fileName: updated.fileName,
      fileFormat: updated.fileFormat,
      fileSizeBytes: updated.fileSizeBytes,
      fileStoragePath: updated.fileStoragePath,
      storageBucket: updated.storageBucket,
      technology: updated.technology,
      materialName: updated.materialName,
      colorName: updated.colorName,
      quotedPriceInr: updated.quotedPriceInr,
      totalInr: updated.totalInr,
      paymentStatus: updated.paymentStatus,
      refundStatus: updated.refundStatus,
      razorpayOrderId: updated.razorpayOrderId,
      razorpayPaymentId: updated.razorpayPaymentId,
      orderStatus: updated.orderStatus,
      rejectionReason: updated.rejectionReason,
    }).catch(() => {});

    const [owner] = updated.userId
      ? await db.select().from(users).where(eq(users.id, updated.userId)).limit(1)
      : [];

    await recordEntityStatusChange({
      entityType: 'printing_order',
      entityId: existing.id,
      entityCode: existing.orderNumber,
      customerId: existing.customerId || owner?.uid || '',
      userId: existing.userId,
      userUid: owner?.authUserId || owner?.uid || '',
      customerEmail: updated.email || owner?.email || '',
      previousStatus: existing.orderStatus,
      newStatus: 'Rejected',
      actionType: 'rejection',
      reason,
      adminId: req.dbUser!.uid,
      adminEmail: req.dbUser!.email,
      originalRecord: existing as unknown as Record<string, unknown>,
    });

    if (updated.userId) {
      await createNotification({
        userId: updated.userId,
        title: `3D Print Enquiry ${updated.orderNumber}: Rejected`,
        message: `Reason: ${reason}`,
        link: '/my-account',
      });
    }
    {
      const recipientEmail = updated.email || owner?.email || (updated.deliveryAddress as any)?.email || '';
      if (recipientEmail) {
        await dispatchLifecycleEmail({
          userId: updated.userId,
          recipientEmail,
          eventType: 'printing_rejected',
          vars: {
            customerName: updated.customerName || (updated.deliveryAddress as any)?.fullName || 'Customer',
            orderNumber: updated.orderNumber,
            fileName: updated.fileName,
            reason: updated.rejectionReason || 'Rejected during engineering review.',
          },
        });
      }
    }

    res.json({ order: updated });
  } catch (err) {
    console.error('Reject 3D printing enquiry error:', err);
    res.status(500).json({ error: 'Failed to reject 3D printing enquiry.' });
  }
});

// Non-Destructive Soft-Archive of 3D Printing Enquiry (Preserves original record, files & history)
adminRouter.delete('/printing-orders/:id', async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const reason = String(req.body?.reason || req.query?.reason || 'Archived by Admin').trim();
    const [existing] = await db.select().from(printingOrders).where(eq(printingOrders.id, id)).limit(1);
    if (!existing) return res.status(404).json({ error: '3D printing enquiry not found.' });

    const [archived] = await db
      .update(printingOrders)
      .set({
        isDeleted: true,
        archivedAt: new Date(),
        archivedReason: reason,
        archivedBy: req.dbUser!.email,
        updatedAt: new Date(),
      })
      .where(eq(printingOrders.id, id))
      .returning();

    const [owner] = existing.userId
      ? await db.select().from(users).where(eq(users.id, existing.userId)).limit(1)
      : [];

    await archivePrintingOrderInSupabase(existing.orderNumber, reason, req.dbUser!.email);

    await recordEntityStatusChange({
      entityType: 'printing_order',
      entityId: existing.id,
      entityCode: existing.orderNumber,
      customerId: existing.customerId || owner?.uid || '',
      userId: existing.userId,
      userUid: owner?.authUserId || owner?.uid || '',
      customerEmail: existing.email || owner?.email || '',
      previousStatus: existing.orderStatus,
      newStatus: 'Archived',
      actionType: 'archive',
      reason,
      adminId: req.dbUser!.uid,
      adminEmail: req.dbUser!.email,
      originalRecord: existing as unknown as Record<string, unknown>,
    });

    res.json({
      archived: true,
      deleted: false,
      id,
      orderNumber: existing.orderNumber,
      order: archived,
    });
  } catch (err) {
    console.error('Archive 3D printing enquiry error:', err);
    res.status(500).json({ error: 'Failed to archive 3D printing enquiry.' });
  }
});

// Unrestricted Admin Original 3D Model Download & Preview (Always allowed even when Payment Status is Pending)
adminRouter.get('/printing-orders/:id/download-original', async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const [order] = await db.select().from(printingOrders).where(eq(printingOrders.id, id)).limit(1);

    if (!order) {
      return res.status(404).json({ error: '3D printing enquiry not found.' });
    }

    await recordPrintingDownloadLog({
      printingOrderId: order.id,
      orderNumber: order.orderNumber,
      userId: req.dbUser!.id,
      actorUid: req.dbUser!.uid,
      actorEmail: req.dbUser!.email,
      actorRole: req.dbUser!.role || 'admin',
      fileKind: 'original',
      fileName: order.fileName,
      accessGranted: true,
      ipAddress: req.ip || '',
    });

    const isPreview = req.query.mode === 'preview';

    if (order.storageBucket === 'printing-files') {
      if (req.query.proxy === '1') {
        const remoteBuf = await downloadPrintingFileFromSupabase(order.fileStoragePath);
        if (remoteBuf) {
          res.setHeader('Cache-Control', 'no-store, private');
          if (!isPreview) {
            res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(order.fileName)}"`);
          }
          return res.send(remoteBuf);
        }
      }
      const signedUrl = await getSigned3DModelUrl(
        order.fileStoragePath,
        120,
        isPreview ? undefined : order.fileName
      );
      if (signedUrl) {
        if (req.query.format === 'json') {
          return res.json({ signedUrl, fileName: order.fileName, expiresInSeconds: 120 });
        }
        return res.redirect(signedUrl);
      }
    }

    const fallbackLocalPath =
      (order.customerParameters as Record<string, any> | null)?.localStoragePath || order.fileStoragePath;
    const absFile = path.resolve(UPLOADS_ROOT, String(fallbackLocalPath || ''));
    if (!absFile.startsWith(UPLOADS_ROOT) || !fs.existsSync(absFile)) {
      return res.status(404).json({ error: 'Original 3D design file missing from private storage.' });
    }

    res.setHeader('Cache-Control', 'no-store, private');
    if (!isPreview) {
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(order.fileName)}"`);
    }
    return res.sendFile(absFile);
  } catch (error) {
    console.error('Admin 3D file download error:', error);
    res.status(500).json({ error: 'Failed to process original 3D file download.' });
  }
});

// Download Order & Complete Engineering Specifications Report
adminRouter.get('/printing-orders/:id/spec-sheet', async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const [order] = await db.select().from(printingOrders).where(eq(printingOrders.id, id)).limit(1);
    if (!order) return res.status(404).json({ error: '3D printing order not found.' });

    const [customer] = order.userId
      ? await db.select().from(users).where(eq(users.id, order.userId)).limit(1)
      : [];
    const prodFiles = await db
      .select()
      .from(printingProductionFiles)
      .where(eq(printingProductionFiles.printingOrderId, order.id));

    await recordPrintingDownloadLog({
      printingOrderId: order.id,
      orderNumber: order.orderNumber,
      userId: req.dbUser!.id,
      actorUid: req.dbUser!.uid,
      actorEmail: req.dbUser!.email,
      actorRole: req.dbUser!.role || 'admin',
      fileKind: 'spec_sheet',
      fileName: `${order.orderNumber}-spec-sheet.json`,
      accessGranted: true,
      ipAddress: req.ip || '',
    });

    const specPayload = {
      generatedAt: new Date().toISOString(),
      generatedBy: req.dbUser!.email,
      orderNumber: order.orderNumber,
      orderStatus: order.orderStatus,
      paymentStatus: order.paymentStatus,
      refundStatus: order.refundStatus,
      razorpayOrderId: order.razorpayOrderId,
      razorpayPaymentId: order.razorpayPaymentId,
      customer: {
        id: order.userId,
        fullName: customer?.fullName || (order.deliveryAddress as any)?.fullName || '',
        email: customer?.email || '',
        mobile: customer?.mobile || (order.deliveryAddress as any)?.mobile || '',
        deliveryAddress: order.deliveryAddress,
      },
      originalFile: {
        fileName: order.fileName,
        fileFormat: order.fileFormat,
        fileSizeBytes: order.fileSizeBytes,
        fileVersion: order.fileVersion,
        storageBucket: order.storageBucket,
        uploadedAt: order.uploadedAt || order.createdAt,
      },
      customerOriginalParameters: order.customerParameters || {
        technology: order.technology,
        printerName: order.printerName,
        materialName: order.materialName,
        colorName: order.colorName,
        layerHeightMm: order.layerHeightMm,
        infillPercent: order.infillPercent,
        wallCount: order.wallCount,
        printSpeedMmS: order.printSpeedMmS,
        nozzleDiameterMm: order.nozzleDiameterMm,
        buildOrientation: order.buildOrientation,
        scalePercent: order.scalePercent,
        supportEnabled: order.supportEnabled,
        quantity: order.quantity,
        finishingOption: order.finishingOption,
        specialInstructions: order.specialInstructions,
        dimensionsMm: order.boundingBoxMm,
      },
      adminConfirmedParameters: order.confirmedParameters || null,
      pricingBreakdown: order.pricingBreakdown,
      totalInr: order.totalInr,
      productionNotes: order.productionNotes,
      productionFiles: prodFiles.map((f) => ({
        fileName: f.fileName,
        fileFormat: f.fileFormat,
        fileKind: f.fileKind,
        fileSizeBytes: f.fileSizeBytes,
        uploadedBy: f.uploadedBy,
        createdAt: f.createdAt,
      })),
    };

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${order.orderNumber}-printing-specs.json"`
    );
    res.send(JSON.stringify(specPayload, null, 2));
  } catch (error) {
    console.error('Spec sheet error:', error);
    res.status(500).json({ error: 'Failed to generate order specification sheet.' });
  }
});

// Upload Separate Production / Sliced File (Never overwrites original file)
adminRouter.post(
  '/printing-orders/:id/production-files',
  runSingleUploadWithJsonErrors(productionFileUpload, 'file'),
  async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      const [order] = await db.select().from(printingOrders).where(eq(printingOrders.id, id)).limit(1);
      if (!order) return res.status(404).json({ error: '3D printing order not found.' });
      if (!req.file) {
        return res.status(400).json({ error: 'Please select a production/sliced file (.gcode, .3mf, .stl, .zip, .pdf).' });
      }

      const fileKind = String(req.body.fileKind || 'sliced_gcode');
      const notes = String(req.body.notes || '');
      if (!isSupabaseStorageConfigured()) {
        return res.status(503).json({
          error: 'Supabase Storage is not configured. Configure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to store production files.',
        });
      }

      const sbUpload = await upload3DModelToSupabase({
        buffer: req.file.buffer,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype || 'application/octet-stream',
        folder: `production/o_${order.id}`,
      });
      if (!sbUpload) {
        return res.status(503).json({ error: 'Failed to upload production file to Supabase Storage.' });
      }
      const storageBucket = sbUpload.bucket;
      const storagePath = sbUpload.storagePath;

      const [created] = await db
        .insert(printingProductionFiles)
        .values({
          printingOrderId: order.id,
          fileName: req.file.originalname,
          fileFormat: path.extname(req.file.originalname).replace('.', '').toUpperCase() || 'FILE',
          fileSizeBytes: req.file.size,
          fileStoragePath: storagePath,
          storageBucket,
          fileKind,
          notes,
          uploadedBy: req.dbUser!.email,
        })
        .returning();

      await logAudit({
        actorUid: req.dbUser!.uid,
        actorEmail: req.dbUser!.email,
        action: 'UPLOAD_3DP_PRODUCTION_FILE',
        entityType: 'printing_order',
        entityId: order.id,
        details: {
          orderNumber: order.orderNumber,
          productionFileId: created.id,
          fileName: created.fileName,
          fileKind,
        },
      });

      res.status(201).json({ productionFile: created });
    } catch (error) {
      console.error('Upload 3D production file error:', error);
      res.status(500).json({ error: 'Failed to upload separate production file.' });
    }
  }
);

// Download Separate Production / Sliced File (Admin)
adminRouter.get('/printing-orders/:id/production-files/:fileId/download', async (req: AuthRequest, res) => {
  try {
    const orderId = Number(req.params.id);
    const fileId = Number(req.params.fileId);

    const [[order], [prodFile]] = await Promise.all([
      db.select().from(printingOrders).where(eq(printingOrders.id, orderId)).limit(1),
      db
        .select()
        .from(printingProductionFiles)
        .where(
          and(
            eq(printingProductionFiles.id, fileId),
            eq(printingProductionFiles.printingOrderId, orderId)
          )
        )
        .limit(1),
    ]);

    if (!order || !prodFile) {
      return res.status(404).json({ error: 'Production file not found.' });
    }

    await recordPrintingDownloadLog({
      printingOrderId: order.id,
      orderNumber: order.orderNumber,
      userId: req.dbUser!.id,
      actorUid: req.dbUser!.uid,
      actorEmail: req.dbUser!.email,
      actorRole: req.dbUser!.role || 'admin',
      fileKind: 'production',
      fileName: prodFile.fileName,
      accessGranted: true,
      ipAddress: req.ip || '',
    });

    if (prodFile.storageBucket === 'printing-files') {
      if (req.query.proxy === '1') {
        const remoteBuf = await downloadPrintingFileFromSupabase(prodFile.fileStoragePath);
        if (remoteBuf) {
          res.setHeader('Cache-Control', 'no-store, private');
          res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(prodFile.fileName)}"`);
          return res.send(remoteBuf);
        }
      }
      const signedUrl = await getSigned3DModelUrl(prodFile.fileStoragePath, 120, prodFile.fileName);
      if (signedUrl) {
        if (req.query.format === 'json') {
          return res.json({ signedUrl, fileName: prodFile.fileName, expiresInSeconds: 120 });
        }
        return res.redirect(signedUrl);
      }
    }

    const absFile = path.resolve(UPLOADS_ROOT, prodFile.fileStoragePath);
    if (!absFile.startsWith(UPLOADS_ROOT) || !fs.existsSync(absFile)) {
      return res.status(404).json({ error: 'Production file not found on storage.' });
    }

    res.setHeader('Cache-Control', 'no-store, private');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(prodFile.fileName)}"`);
    return res.sendFile(absFile);
  } catch (error) {
    console.error('Download 3D production file error:', error);
    res.status(500).json({ error: 'Failed to download production file.' });
  }
});

// Project Enquiries (Accept / Reject w/ Mandatory Reason / Request Info / Assign), Quotations & Active Projects
adminRouter.patch('/project-enquiries/:id', async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const { status, assignedEngineer, internalNotes, rejectionReason, clarificationNotes } = req.body;

    if (status === 'Rejected' && !String(rejectionReason || '').trim()) {
      return res.status(400).json({ error: 'A clear rejection reason is required when rejecting an enquiry.' });
    }

    const [existing] = await db.select().from(projectEnquiries).where(eq(projectEnquiries.id, id)).limit(1);
    if (!existing) return res.status(404).json({ error: 'Enquiry not found.' });

    const [updated] = await db
      .update(projectEnquiries)
      .set({
        status: status ?? existing.status,
        assignedEngineer: assignedEngineer ?? existing.assignedEngineer,
        internalNotes: internalNotes ?? existing.internalNotes,
        rejectionReason: rejectionReason !== undefined ? String(rejectionReason).trim() : existing.rejectionReason,
        rejectedBy: status === 'Rejected' ? req.dbUser!.email : existing.rejectedBy,
        rejectedAt: status === 'Rejected' ? new Date() : existing.rejectedAt,
        clarificationNotes: clarificationNotes !== undefined ? String(clarificationNotes).trim() : existing.clarificationNotes,
        updatedAt: new Date(),
      })
      .where(eq(projectEnquiries.id, id))
      .returning();

    if (status && status !== existing.status) {
      const [owner] = updated.userId
        ? await db.select().from(users).where(eq(users.id, updated.userId)).limit(1)
        : [];
      await recordEntityStatusChange({
        entityType: 'project_enquiry',
        entityId: existing.id,
        entityCode: existing.enquiryNumber,
        customerId: existing.customerId || owner?.uid || '',
        userId: existing.userId,
        userUid: owner?.authUserId || owner?.uid || '',
        customerEmail: updated.customerEmail,
        previousStatus: existing.status,
        newStatus: updated.status,
        actionType: status === 'Rejected' ? 'rejection' : 'status_change',
        reason: updated.rejectionReason || updated.clarificationNotes || updated.internalNotes || `Updated to ${updated.status}`,
        adminId: req.dbUser!.uid,
        adminEmail: req.dbUser!.email,
        originalRecord: existing as unknown as Record<string, unknown>,
      });
    }

    if (status === 'Rejected') {
      if (updated.userId) {
        await createNotification({
          userId: updated.userId,
          title: `Project Registration ${updated.enquiryNumber} Declined`,
          message: `Reason: ${updated.rejectionReason}`,
          link: '/my-account/project-enquiries',
        });
      }
      await dispatchLifecycleEmail({
        userId: updated.userId,
        enquiryId: updated.id,
        recipientEmail: updated.customerEmail,
        eventType: 'enquiry_rejected',
        vars: {
          customerName: updated.customerName,
          enquiryNumber: updated.enquiryNumber,
          reason: updated.rejectionReason,
        },
      });
    } else if (
      (status === 'Additional Information Required' || status === 'Clarification Needed') &&
      updated.clarificationNotes
    ) {
      await db.insert(projectMessages).values({
        enquiryId: updated.id,
        projectId: null,
        userId: updated.userId,
        senderEmail: req.dbUser!.email,
        senderName: req.dbUser!.fullName || 'NexusTekFusion Engineering Review',
        senderRole: 'admin',
        message: updated.clarificationNotes,
        attachments: [],
      });

      if (updated.userId) {
        await createNotification({
          userId: updated.userId,
          title: `Additional Information Required (${updated.enquiryNumber})`,
          message: updated.clarificationNotes,
          link: '/my-account/project-enquiries',
        });
      }

      await dispatchLifecycleEmail({
        userId: updated.userId,
        enquiryId: updated.id,
        recipientEmail: updated.customerEmail,
        eventType: 'additional_info_requested',
        vars: {
          customerName: updated.customerName,
          enquiryNumber: updated.enquiryNumber,
          projectTitle: updated.projectTitle,
          clarificationNotes: updated.clarificationNotes,
        },
      });
    } else if (
      status === 'Under Technical Evaluation' ||
      status === 'Accepted' ||
      status === 'Approved' ||
      status === 'Under Technical Review'
    ) {
      if (updated.userId) {
        await createNotification({
          userId: updated.userId,
          title: `Project ${updated.enquiryNumber}: ${updated.status}`,
          message: updated.assignedEngineer
            ? `Assigned to ${updated.assignedEngineer}. ${status === 'Approved' || status === 'Accepted' ? 'Project approved and agreement generated.' : 'Technical evaluation is underway.'}`
            : status === 'Approved' || status === 'Accepted'
            ? 'Your project request has been approved and your agreement is ready.'
            : 'Technical evaluation is underway.',
          link: '/my-account/project-enquiries',
        });
      }
      await dispatchLifecycleEmail({
        userId: updated.userId,
        enquiryId: updated.id,
        recipientEmail: updated.customerEmail,
        eventType: 'enquiry_under_review',
        vars: {
          customerName: updated.customerName,
          enquiryNumber: updated.enquiryNumber,
          projectTitle: updated.projectTitle,
        },
      });
    }

    // Auto-create Active Project ("Awaiting Advance Payment") & Auto-Generate PDF Agreement ("Awaiting Acceptance") on approval
    let autoCreatedProject: typeof projects.$inferSelect | null = null;
    let autoGeneratedAgreement: typeof projectAgreements.$inferSelect | null = null;
    const isApprovalTransition =
      (status === 'Approved' ||
        status === 'Accepted' ||
        status === 'Quotation Approved by Customer' ||
        req.body?.approveProject === true) &&
      (existing.status !== updated.status || req.body?.approveProject === true);

    if (isApprovalTransition) {
      try {
        const requestedCost = Number(req.body?.totalAmountInr || 0);
        autoCreatedProject = await ensureProjectForEnquiry({
          enquiryId: updated.id,
          totalAmountInr: requestedCost > 0 ? requestedCost : undefined,
          initialStatus: 'Awaiting Advance Payment',
          actorEmail: req.dbUser!.email,
        });
        if (requestedCost > 0) {
          await setupProjectPaymentAndInstallments({
            projectId: autoCreatedProject.id,
            totalAmountInr: requestedCost,
            actorEmail: req.dbUser!.email,
            sendNotificationEmail: true,
          });
        }
        autoGeneratedAgreement = await autoGenerateAgreementOnProjectApproval({
          enquiryId: updated.id,
          projectId: autoCreatedProject.id,
          actorEmail: req.dbUser!.email,
          status: 'Awaiting Acceptance',
        });
      } catch (autoErr) {
        console.error('Auto-project / auto-agreement creation warning:', autoErr);
      }
    }

    syncProjectReviewToSupabase({
      registrationNumber: updated.enquiryNumber,
      reviewerEmail: req.dbUser!.email,
      decisionStatus: updated.status,
      assignedEngineer: updated.assignedEngineer,
      internalNotes: updated.internalNotes,
      clarificationNotes: updated.clarificationNotes,
      rejectionReason: updated.rejectionReason,
    }).catch(() => {});

    await logAudit({
      actorUid: req.dbUser!.uid,
      actorEmail: req.dbUser!.email,
      action: 'UPDATE_PROJECT_ENQUIRY',
      entityType: 'project_enquiry',
      entityId: id,
      details: {
        status: updated.status,
        assignedEngineer: updated.assignedEngineer,
        rejectionReason: updated.rejectionReason,
        autoProjectCode: autoCreatedProject?.projectCode || null,
        autoAgreementNumber: autoGeneratedAgreement?.agreementNumber || null,
      },
    });
    res.json({
      enquiry: updated,
      autoCreatedProject,
      autoGeneratedAgreement,
    });
  } catch {
    res.status(500).json({ error: 'Failed to update enquiry.' });
  }
});

// Admin-Customer Communication Thread on Project Enquiry
adminRouter.post(
  '/project-enquiries/:id/messages',
  projectMessageUpload.array('attachments', 5),
  async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      const text = String(req.body.message || '').trim();
      const [enquiry] = await db.select().from(projectEnquiries).where(eq(projectEnquiries.id, id)).limit(1);
      if (!enquiry) return res.status(404).json({ error: 'Project registration not found.' });

      const files = (req.files as Express.Multer.File[]) || [];
      if (!text && files.length === 0) {
        return res.status(400).json({ error: 'Message text or attachment is required.' });
      }

      if (files.length > 0 && !isSupabaseStorageConfigured()) {
        return res.status(503).json({ error: 'Supabase Storage is not configured for message attachments.' });
      }

      const uploaded = await Promise.all(
        files.map(async (f) => {
          const sb = await uploadProjectDocumentToSupabase({
            buffer: f.buffer,
            originalName: f.originalname,
            mimeType: f.mimetype || 'application/octet-stream',
            ownerUid: enquiry.customerId || enquiry.enquiryNumber,
            folder: `${enquiry.enquiryNumber}-messages`,
          });
          return {
            originalName: f.originalname,
            storagePath: sb.storagePath,
            storageBucket: sb.bucket,
            sizeBytes: f.size,
            category: 'admin_note',
          };
        })
      );

      const [projRow] = await db.select().from(projects).where(eq(projects.enquiryId, enquiry.id)).limit(1);
      const [msg] = await db
        .insert(projectMessages)
        .values({
          enquiryId: enquiry.id,
          projectId: projRow?.id || null,
          userId: enquiry.userId,
          senderEmail: req.dbUser!.email,
          senderName: req.dbUser!.fullName || 'NexusTekFusion Engineering',
          senderRole: 'admin',
          message: text || `Shared ${uploaded.length} file(s).`,
          attachments: uploaded,
        })
        .returning();

      if (enquiry.userId) {
        await createNotification({
          userId: enquiry.userId,
          title: `Engineering Team Message — ${enquiry.enquiryNumber}`,
          message: msg.message.slice(0, 140),
          link: '/my-account/project-enquiries',
        });
      }

      const [owner] = enquiry.userId
        ? await db.select({ uid: users.uid }).from(users).where(eq(users.id, enquiry.userId)).limit(1)
        : [];
      syncProjectMessageToSupabase({
        registrationNumber: enquiry.enquiryNumber,
        userUid: owner?.uid || '',
        senderEmail: req.dbUser!.email,
        senderName: msg.senderName,
        senderRole: 'admin',
        message: msg.message,
        attachments: uploaded,
      }).catch(() => {});

      res.status(201).json({ message: msg });
    } catch (error) {
      console.error('Admin project message error:', error);
      res.status(500).json({ error: 'Failed to send project message.' });
    }
  }
);

function buildCostBreakdownAndTotals(b: Record<string, any>) {
  const items = Array.isArray(b.items) ? b.items : [];
  const itemsSum = items.reduce(
    (s: number, it: { qty?: number; unitPriceInr?: number }) =>
      s + Number(it.qty || 1) * Number(it.unitPriceInr || 0),
    0
  );

  const cc = b.costCategories || {};
  const costCategories = {
    development: Number(cc.development ?? b.designDevChargesInr ?? 0),
    hardware: Number(cc.hardware ?? b.hardwareCostInr ?? 0),
    sensors: Number(cc.sensors || 0),
    pcb: Number(cc.pcb || 0),
    mechanical: Number(cc.mechanical || 0),
    printing3d: Number(cc.printing3d || 0),
    software: Number(cc.software ?? b.softwareCostInr ?? 0),
    aiMl: Number(cc.aiMl || 0),
    iot: Number(cc.iot || 0),
    droneRobotics: Number(cc.droneRobotics || 0),
    testing: Number(cc.testing ?? b.testingChargesInr ?? 0),
    documentation: Number(cc.documentation ?? b.documentationChargesInr ?? 0),
    delivery: Number(cc.delivery ?? b.deliveryChargesInr ?? 0),
    other: Number(cc.other || 0),
  };

  const categoriesSum = Object.values(costCategories).reduce((s, n) => s + n, 0);
  const discountInr = Number(b.discountInr || 0);
  const gstInr = Number(b.gstInr || 0);
  const totalAmountInr = Math.max(1, itemsSum + categoriesSum + gstInr - discountInr);

  return { items, costCategories, discountInr, gstInr, totalAmountInr };
}

adminRouter.post('/quotations', async (req: AuthRequest, res) => {
  try {
    const b = req.body;
    const enquiryId = Number(b.enquiryId);
    const [enquiry] = await db
      .select()
      .from(projectEnquiries)
      .where(eq(projectEnquiries.id, enquiryId))
      .limit(1);
    if (!enquiry) return res.status(404).json({ error: 'Enquiry not found.' });

    const [existingQuotes, [payCfgRow]] = await Promise.all([
      db.select().from(projectQuotations).where(eq(projectQuotations.enquiryId, enquiryId)),
      db.select().from(siteSettings).where(eq(siteSettings.key, 'projectPaymentSettings')).limit(1),
    ]);
    const payCfg = (payCfgRow?.value as {
      advancePercent?: number;
      allowFullPayment?: boolean;
      quotationPrefix?: string;
      quotationValidityDays?: number;
    }) || {};
    const revisionNumber = existingQuotes.length + 1;

    const { items, costCategories, discountInr, gstInr, totalAmountInr } = buildCostBreakdownAndTotals(b);
    const defaultAdv = Number(payCfg.advancePercent ?? 50);
    const advancePercent = Math.min(100, Math.max(10, Number(b.advancePercent ?? defaultAdv)));
    const finalPercent = Math.max(0, 100 - advancePercent);
    const advanceAmountInr = Math.round((totalAmountInr * advancePercent) / 100);
    const balanceAmountInr = totalAmountInr - advanceAmountInr;
    const quotationNumber = generateCode(payCfg.quotationPrefix || 'NTF-QTN');
    const allowFullPayment = b.allowFullPayment !== undefined ? Boolean(b.allowFullPayment) : payCfg.allowFullPayment !== false;
    const shouldPublish = b.publish !== false && b.saveAsDraft !== true;

    const [quotation] = await db
      .insert(projectQuotations)
      .values({
        enquiryId,
        quotationNumber,
        revisionNumber,
        items,
        hardwareCostInr: costCategories.hardware + costCategories.sensors + costCategories.pcb + costCategories.mechanical + costCategories.printing3d,
        softwareCostInr: costCategories.software + costCategories.aiMl + costCategories.iot,
        designDevChargesInr: costCategories.development + costCategories.droneRobotics + costCategories.other,
        testingChargesInr: costCategories.testing,
        documentationChargesInr: costCategories.documentation,
        deliveryChargesInr: costCategories.delivery,
        costCategories,
        technicalScope: String(b.technicalScope || '').trim(),
        estimatedDeliveryDate: String(b.estimatedDeliveryDate || enquiry.targetCompletionDate || '').trim(),
        validityDays: Number(b.validityDays || payCfg.quotationValidityDays || 15),
        estimatedDuration: String(b.estimatedDuration || '3–4 Weeks'),
        paymentTerms: String(
          b.paymentTerms ||
            (finalPercent > 0
              ? `${advancePercent}% Advance Payment, ${finalPercent}% Final Balance before Handover`
              : '100% Upfront Payment')
        ),
        paymentDueDate: String(b.paymentDueDate || ''),
        termsAndConditions: String(b.termsAndConditions || ''),
        allowFullPayment,
        discountInr,
        gstInr,
        totalAmountInr,
        totalAmountPaise: Math.round(totalAmountInr * 100),
        advancePercent,
        advanceAmountInr,
        advanceAmountPaise: Math.round(advanceAmountInr * 100),
        balanceAmountInr,
        balanceAmountPaise: Math.round(balanceAmountInr * 100),
        approvedByAdmin: shouldPublish,
        publishedAt: shouldPublish ? new Date() : null,
        status: shouldPublish ? 'Sent' : 'Draft',
      })
      .returning();

    const [plan] = await db
      .insert(projectPaymentPlans)
      .values({
        enquiryId,
        quotationId: quotation.id,
        planType: advancePercent === 100 ? 'full_100' : advancePercent === 50 ? '50_50_split' : 'custom_split',
        advancePercent,
        finalPercent,
        allowFullPayment,
        isOverride: Boolean(b.advancePercent !== undefined && Number(b.advancePercent) !== defaultAdv),
        overrideReason: String(b.planOverrideReason || ''),
        createdBy: req.dbUser!.email,
      })
      .returning();

    await db.insert(projectPaymentMilestones).values({
      planId: plan.id,
      quotationId: quotation.id,
      stageName: 'Advance Payment',
      stageOrder: 1,
      percent: advancePercent,
      amountInr: advanceAmountInr,
      amountPaise: Math.round(advanceAmountInr * 100),
      dueTrigger: 'on_acceptance',
      status: 'pending',
    });

    if (balanceAmountInr > 0) {
      await db.insert(projectPaymentMilestones).values({
        planId: plan.id,
        quotationId: quotation.id,
        stageName: 'Final Balance Payment',
        stageOrder: 2,
        percent: finalPercent,
        amountInr: balanceAmountInr,
        amountPaise: Math.round(balanceAmountInr * 100),
        dueTrigger: 'on_completion',
        status: 'pending',
      });
    }

    if (shouldPublish) {
      await db
        .update(projectEnquiries)
        .set({ status: 'Quotation Prepared', updatedAt: new Date() })
        .where(eq(projectEnquiries.id, enquiryId));

      if (enquiry.userId) {
        await createNotification({
          userId: enquiry.userId,
          title: `Quotation ${quotationNumber} Ready (${enquiry.enquiryNumber})`,
          message: `Revision #${revisionNumber} totaling ₹${totalAmountInr.toLocaleString('en-IN')} (${advancePercent}% Advance ₹${advanceAmountInr.toLocaleString('en-IN')}) is ready for review.`,
          link: '/my-account/project-enquiries',
        });
      }

      await dispatchLifecycleEmail({
        userId: enquiry.userId,
        enquiryId,
        recipientEmail: enquiry.customerEmail,
        eventType: 'quotation_sent',
        vars: {
          customerName: enquiry.customerName,
          enquiryNumber: enquiry.enquiryNumber,
          quotationNumber,
          totalAmountInr,
          advanceAmountInr,
          balanceAmountInr,
        },
      });
    }

    syncProjectQuotationToSupabase({
      registrationNumber: enquiry.enquiryNumber,
      quotation,
    }).catch(() => {});

    await logAudit({
      actorUid: req.dbUser!.uid,
      actorEmail: req.dbUser!.email,
      action: shouldPublish ? 'CREATE_AND_PUBLISH_QUOTATION' : 'CREATE_DRAFT_QUOTATION',
      entityType: 'project_quotation',
      entityId: quotation.id,
      details: { enquiryId, quotationNumber, totalAmountInr, status: quotation.status },
    });

    res.status(201).json({ quotation, plan });
  } catch (error) {
    console.error('Create quotation error:', error);
    res.status(500).json({ error: 'Failed to create quotation.' });
  }
});

// Edit Draft (or unaccepted) Quotation before Customer Acceptance
adminRouter.put('/quotations/:id', async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const [existingQ] = await db.select().from(projectQuotations).where(eq(projectQuotations.id, id)).limit(1);
    if (!existingQ) return res.status(404).json({ error: 'Quotation not found.' });
    if (existingQ.status === 'Accepted' || existingQ.paidAmountInr > 0) {
      return res.status(400).json({ error: 'Accepted or paid quotations cannot be modified. Issue a new revision instead.' });
    }

    const b = req.body;
    const [enquiry] = await db.select().from(projectEnquiries).where(eq(projectEnquiries.id, existingQ.enquiryId)).limit(1);
    if (!enquiry) return res.status(404).json({ error: 'Enquiry not found.' });

    const { items, costCategories, discountInr, gstInr, totalAmountInr } = buildCostBreakdownAndTotals(b);
    const advancePercent = Math.min(100, Math.max(10, Number(b.advancePercent ?? existingQ.advancePercent ?? 50)));
    const finalPercent = Math.max(0, 100 - advancePercent);
    const advanceAmountInr = Math.round((totalAmountInr * advancePercent) / 100);
    const balanceAmountInr = totalAmountInr - advanceAmountInr;
    const shouldPublish = b.publish === true || (b.saveAsDraft !== true && existingQ.status !== 'Draft');

    const [updatedQ] = await db
      .update(projectQuotations)
      .set({
        items,
        hardwareCostInr: costCategories.hardware + costCategories.sensors + costCategories.pcb + costCategories.mechanical + costCategories.printing3d,
        softwareCostInr: costCategories.software + costCategories.aiMl + costCategories.iot,
        designDevChargesInr: costCategories.development + costCategories.droneRobotics + costCategories.other,
        testingChargesInr: costCategories.testing,
        documentationChargesInr: costCategories.documentation,
        deliveryChargesInr: costCategories.delivery,
        costCategories,
        technicalScope: b.technicalScope !== undefined ? String(b.technicalScope).trim() : existingQ.technicalScope,
        estimatedDeliveryDate:
          b.estimatedDeliveryDate !== undefined ? String(b.estimatedDeliveryDate).trim() : existingQ.estimatedDeliveryDate,
        validityDays: Number(b.validityDays ?? existingQ.validityDays ?? 15),
        estimatedDuration: b.estimatedDuration !== undefined ? String(b.estimatedDuration) : existingQ.estimatedDuration,
        paymentTerms:
          b.paymentTerms !== undefined
            ? String(b.paymentTerms)
            : finalPercent > 0
            ? `${advancePercent}% Advance Payment, ${finalPercent}% Final Balance before Handover`
            : '100% Upfront Payment',
        allowFullPayment: b.allowFullPayment !== undefined ? Boolean(b.allowFullPayment) : existingQ.allowFullPayment,
        discountInr,
        gstInr,
        totalAmountInr,
        totalAmountPaise: Math.round(totalAmountInr * 100),
        advancePercent,
        advanceAmountInr,
        advanceAmountPaise: Math.round(advanceAmountInr * 100),
        balanceAmountInr,
        balanceAmountPaise: Math.round(balanceAmountInr * 100),
        approvedByAdmin: shouldPublish,
        publishedAt: shouldPublish ? existingQ.publishedAt || new Date() : null,
        status: shouldPublish ? 'Sent' : 'Draft',
      })
      .where(eq(projectQuotations.id, id))
      .returning();

    syncProjectQuotationToSupabase({
      registrationNumber: enquiry.enquiryNumber,
      quotation: updatedQ,
    }).catch(() => {});

    res.json({ quotation: updatedQ });
  } catch (error) {
    console.error('Update quotation error:', error);
    res.status(500).json({ error: 'Failed to update quotation.' });
  }
});

// Approve & Publish a Draft Quotation to Customer
adminRouter.post('/quotations/:id/publish', async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const [existingQ] = await db.select().from(projectQuotations).where(eq(projectQuotations.id, id)).limit(1);
    if (!existingQ) return res.status(404).json({ error: 'Quotation not found.' });

    const [enquiry] = await db.select().from(projectEnquiries).where(eq(projectEnquiries.id, existingQ.enquiryId)).limit(1);
    if (!enquiry) return res.status(404).json({ error: 'Enquiry not found.' });

    const [updatedQ] = await db
      .update(projectQuotations)
      .set({
        status: existingQ.status === 'Draft' ? 'Sent' : existingQ.status,
        approvedByAdmin: true,
        publishedAt: new Date(),
      })
      .where(eq(projectQuotations.id, id))
      .returning();

    await db
      .update(projectEnquiries)
      .set({ status: 'Quotation Prepared', updatedAt: new Date() })
      .where(eq(projectEnquiries.id, enquiry.id));

    if (enquiry.userId) {
      await createNotification({
        userId: enquiry.userId,
        title: `Quotation ${updatedQ.quotationNumber} Published (${enquiry.enquiryNumber})`,
        message: `Total: ₹${updatedQ.totalAmountInr.toLocaleString('en-IN')} (${updatedQ.advancePercent}% Advance ₹${updatedQ.advanceAmountInr.toLocaleString('en-IN')}).`,
        link: '/my-account/project-enquiries',
      });
    }

    await dispatchLifecycleEmail({
      userId: enquiry.userId,
      enquiryId: enquiry.id,
      recipientEmail: enquiry.customerEmail,
      eventType: 'quotation_sent',
      vars: {
        customerName: enquiry.customerName,
        enquiryNumber: enquiry.enquiryNumber,
        quotationNumber: updatedQ.quotationNumber,
        totalAmountInr: updatedQ.totalAmountInr,
        advanceAmountInr: updatedQ.advanceAmountInr,
        balanceAmountInr: updatedQ.balanceAmountInr,
      },
    });

    syncProjectQuotationToSupabase({
      registrationNumber: enquiry.enquiryNumber,
      quotation: updatedQ,
    }).catch(() => {});

    await logAudit({
      actorUid: req.dbUser!.uid,
      actorEmail: req.dbUser!.email,
      action: 'PUBLISH_QUOTATION',
      entityType: 'project_quotation',
      entityId: id,
      details: { quotationNumber: updatedQ.quotationNumber, enquiryId: enquiry.id },
    });

    res.json({ quotation: updatedQ });
  } catch (error) {
    console.error('Publish quotation error:', error);
    res.status(500).json({ error: 'Failed to publish quotation.' });
  }
});

adminRouter.patch('/projects/:id', async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const {
      status,
      assignedEngineer,
      progressPercent,
      milestones,
      updates,
      deliverables,
      trackingCourier,
      trackingId,
      trackingUrl,
      budgetInr,
      technicalNotes,
      technicalRequirements,
      category,
      description,
    } = req.body;

    const [existing] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
    if (!existing) return res.status(404).json({ error: 'Project not found.' });

    // Strict Payment Gate: Development cannot start before 50% advance payment is verified
    if (status && ADVANCE_REQUIRED_STATUSES.has(status) && existing.totalAmountInr > 0 && existing.paidAmountInr <= 0) {
      return res.status(400).json({
        error: '50% advance payment must be verified before starting project development.',
      });
    }

    // Strict Handover Gate: Handover / Delivery / Closure requires 100% clearance (or Super Admin exception)
    if (
      status &&
      FINAL_CLEARANCE_REQUIRED_STATUSES.has(status) &&
      existing.balanceAmountInr > 0 &&
      !existing.handoverUnlocked &&
      !existing.handoverExceptionAuthorized
    ) {
      return res.status(400).json({
        error: 'Remaining 50% final payment must be verified before unlocking handover or marking delivered.',
      });
    }

    const normalizedStatus =
      status === 'Project Completed' && existing.balanceAmountInr > 0 ? 'Final Payment Pending' : status ?? existing.status;

    const parsedBudget = budgetInr !== undefined && budgetInr !== '' ? Math.max(0, Math.round(Number(budgetInr))) : existing.budgetInr;

    const [updated] = await db
      .update(projects)
      .set({
        status: normalizedStatus,
        assignedEngineer: assignedEngineer ?? existing.assignedEngineer,
        progressPercent:
          progressPercent !== undefined ? Math.min(100, Math.max(0, Number(progressPercent))) : existing.progressPercent,
        milestones: milestones ?? existing.milestones,
        updates: updates ?? existing.updates,
        deliverables: deliverables ?? existing.deliverables,
        trackingCourier: trackingCourier ?? existing.trackingCourier,
        trackingId: trackingId ?? existing.trackingId,
        trackingUrl: trackingUrl ?? existing.trackingUrl,
        budgetInr: Number.isFinite(parsedBudget) ? parsedBudget : existing.budgetInr,
        technicalNotes: technicalNotes ?? existing.technicalNotes,
        technicalRequirements: technicalRequirements ?? existing.technicalRequirements,
        category: category ?? existing.category,
        description: description ?? existing.description,
        completedAt:
          normalizedStatus === 'Project Completed' ||
          normalizedStatus === 'Final Payment Pending' ||
          normalizedStatus === 'Delivered / Handed Over' ||
          normalizedStatus === 'Closed' ||
          normalizedStatus === 'Completed'
            ? existing.completedAt || new Date().toISOString()
            : existing.completedAt,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, id))
      .returning();

    const [enq] = await db
      .update(projectEnquiries)
      .set({
        status: updated.status,
        assignedEngineer: updated.assignedEngineer,
        updatedAt: new Date(),
      })
      .where(eq(projectEnquiries.id, updated.enquiryId))
      .returning();

    if (updated.userId) {
      await createNotification({
        userId: updated.userId,
        title: `Project ${updated.projectCode} Update`,
        message: `Status: ${updated.status} (${updated.progressPercent}%). Check your dashboard for progress updates.`,
        link: '/my-account/project-enquiries',
      });
    }

    if (enq?.customerEmail && status && status !== existing.status) {
      const latestSummary =
        Array.isArray(updated.updates) && updated.updates.length > 0
          ? updated.updates[updated.updates.length - 1].summary
          : `Status changed to ${updated.status}`;
      const eventType =
        normalizedStatus === 'Project Development Started' || normalizedStatus === 'Development'
          ? 'project_started'
          : normalizedStatus === 'Testing and Quality Assurance' || normalizedStatus === 'Testing'
          ? 'testing_completed'
          : normalizedStatus === 'Final Payment Pending'
          ? 'project_ready_for_final_payment'
          : normalizedStatus === 'Delivered / Handed Over' || normalizedStatus === 'Closed' || normalizedStatus === 'Delivered'
          ? 'project_delivered'
          : 'milestone_updated';

      await dispatchLifecycleEmail({
        userId: updated.userId,
        projectId: updated.id,
        enquiryId: updated.enquiryId,
        recipientEmail: enq.customerEmail,
        eventType,
        vars: {
          customerName: enq.customerName,
          projectCode: updated.projectCode,
          projectTitle: updated.title,
          summary: latestSummary,
          balanceAmountInr: updated.balanceAmountInr,
          assignedEngineer: updated.assignedEngineer,
        },
      });
    }

    await logAudit({
      actorUid: req.dbUser!.uid,
      actorEmail: req.dbUser!.email,
      action: 'UPDATE_PROJECT',
      entityType: 'project',
      entityId: id,
      details: { status: updated.status, progressPercent: updated.progressPercent, budgetInr: updated.budgetInr },
    });
    emitAdminStreamEvent({ type: 'project', action: 'updated', id: updated.projectCode, summary: updated.status });
    res.json({ project: updated });
  } catch {
    res.status(500).json({ error: 'Failed to update project.' });
  }
});

// Admin Publishes Structured Progress Update with Photos, Videos, Reports & % Progress
adminRouter.post(
  '/projects/:id/progress-updates',
  projectUpdateUpload.fields([
    { name: 'photos', maxCount: 8 },
    { name: 'videos', maxCount: 3 },
    { name: 'reports', maxCount: 5 },
  ]),
  async (req: AuthRequest, res) => {
    try {
      const projectId = Number(req.params.id);
      const [existing] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
      if (!existing) return res.status(404).json({ error: 'Project not found.' });

      if (existing.totalAmountInr > 0 && existing.paidAmountInr <= 0) {
        return res.status(400).json({
          error: '50% advance payment must be verified before publishing development progress updates.',
        });
      }

      const b = req.body;
      const category = String(b.category || PROJECT_UPDATE_CATEGORIES[0]).trim();
      const title = String(b.title || `${category} Update`).trim();
      const description = String(b.description || b.summary || '').trim();
      if (!description) {
        return res.status(400).json({ error: 'Progress update description is required.' });
      }
      const progressPercentage = Math.min(100, Math.max(0, Number(b.progressPercentage ?? existing.progressPercent ?? 0)));
      const adminComments = String(b.adminComments || '').trim();
      const requestedStatus = String(b.nextStatus || '').trim();

      if (
        requestedStatus &&
        FINAL_CLEARANCE_REQUIRED_STATUSES.has(requestedStatus) &&
        existing.balanceAmountInr > 0 &&
        !existing.handoverUnlocked &&
        !existing.handoverExceptionAuthorized
      ) {
        return res.status(400).json({
          error: 'Remaining 50% final payment must be verified before transitioning to handover.',
        });
      }

      const [enq] = await db.select().from(projectEnquiries).where(eq(projectEnquiries.id, existing.enquiryId)).limit(1);
      const regNo = enq?.enquiryNumber || existing.projectCode;

      const filesObj = (req.files as Record<string, Express.Multer.File[]>) || {};
      const totalFilesCount =
        (filesObj.photos?.length || 0) + (filesObj.videos?.length || 0) + (filesObj.reports?.length || 0);
      if (totalFilesCount > 0 && !isSupabaseStorageConfigured()) {
        return res.status(503).json({ error: 'Supabase Storage is not configured for progress media.' });
      }
      const mapFiles = async (arr: Express.Multer.File[] = [], kind: string) =>
        Promise.all(
          arr.map(async (f) => {
            const sb = await uploadProjectDocumentToSupabase({
              buffer: f.buffer,
              originalName: f.originalname,
              mimeType: f.mimetype || 'application/octet-stream',
              ownerUid: existing.customerId || regNo,
              folder: `${regNo}-updates-${kind}`,
            });
            return {
              originalName: f.originalname,
              storagePath: sb.storagePath,
              storageBucket: sb.bucket,
              sizeBytes: f.size,
              mimeType: f.mimetype,
            };
          })
        );

      const [photos, videos, reports] = await Promise.all([
        mapFiles(filesObj.photos, 'photos'),
        mapFiles(filesObj.videos, 'videos'),
        mapFiles(filesObj.reports, 'reports'),
      ]);

      const newUpdate = {
        id: `upd-${Date.now()}`,
        timestamp: new Date().toISOString(),
        author: req.dbUser!.email,
        category,
        title,
        description,
        summary: `[${category} · ${progressPercentage}%] ${title}: ${description}`,
        progressPercentage,
        photos,
        videos,
        reports,
        adminComments,
      };

      let nextStatus = requestedStatus || existing.status;
      if (!requestedStatus && ['Advance Payment Received', 'Project Started'].includes(existing.status)) {
        nextStatus =
          category === 'Testing' || category === 'Final Quality Inspection'
            ? 'Testing and Quality Assurance'
            : category === 'Project Completion'
            ? existing.balanceAmountInr > 0
              ? 'Final Payment Pending'
              : 'Ready for Handover'
            : 'In Progress';
      } else if (nextStatus === 'Project Completed' && existing.balanceAmountInr > 0) {
        nextStatus = 'Final Payment Pending';
      }

      const nextUpdates = [...(existing.updates || []), newUpdate];
      const [updated] = await db
        .update(projects)
        .set({
          status: nextStatus,
          progressPercent: progressPercentage,
          updates: nextUpdates,
          updatedAt: new Date(),
        })
        .where(eq(projects.id, projectId))
        .returning();

      if (enq) {
        await db
          .update(projectEnquiries)
          .set({ status: nextStatus, updatedAt: new Date() })
          .where(eq(projectEnquiries.id, enq.id));
      }

      if (updated.userId) {
        await createNotification({
          userId: updated.userId,
          title: `${updated.projectCode}: ${title} (${progressPercentage}%)`,
          message: `${category} — ${description.slice(0, 140)}`,
          link: '/my-account/project-enquiries',
        });
      }

      if (enq?.customerEmail) {
        const isTesting = category === 'Testing' || nextStatus === 'Testing and Quality Assurance';
        await dispatchLifecycleEmail({
          userId: updated.userId,
          projectId: updated.id,
          enquiryId: updated.enquiryId,
          recipientEmail: enq.customerEmail,
          eventType: isTesting ? 'testing_completed' : 'milestone_updated',
          vars: {
            customerName: enq.customerName,
            projectCode: updated.projectCode,
            projectTitle: updated.title,
            category,
            title,
            progressPercentage,
            summary: newUpdate.summary,
          },
        });
      }

      syncProjectUpdateToSupabase({
        projectCode: updated.projectCode,
        registrationNumber: regNo,
        update: newUpdate,
      }).catch(() => {});

      await logAudit({
        actorUid: req.dbUser!.uid,
        actorEmail: req.dbUser!.email,
        action: 'PUBLISH_PROJECT_PROGRESS_UPDATE',
        entityType: 'project',
        entityId: projectId,
        details: { category, title, progressPercentage, nextStatus },
      });

      res.status(201).json({ project: updated, update: newUpdate });
    } catch (error) {
      console.error('Publish progress update error:', error);
      res.status(500).json({ error: 'Failed to publish progress update.' });
    }
  }
);

// Admin Marks Project Completed + Uploads Completion Proof -> Triggers Final Payment Pending
adminRouter.post(
  '/projects/:id/complete',
  projectUpdateUpload.array('proofFiles', 8),
  async (req: AuthRequest, res) => {
    try {
      const projectId = Number(req.params.id);
      const [existing] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
      if (!existing) return res.status(404).json({ error: 'Project not found.' });

      if (existing.totalAmountInr > 0 && existing.paidAmountInr <= 0) {
        return res.status(400).json({ error: '50% advance payment must be verified before marking project completed.' });
      }

      const [enq] = await db.select().from(projectEnquiries).where(eq(projectEnquiries.id, existing.enquiryId)).limit(1);
      const regNo = enq?.enquiryNumber || existing.projectCode;
      const files = (req.files as Express.Multer.File[]) || [];
      if (files.length > 0 && !isSupabaseStorageConfigured()) {
        return res.status(503).json({ error: 'Supabase Storage is not configured for completion proof files.' });
      }

      const uploadedProof = await Promise.all(
        files.map(async (f) => {
          const sb = await uploadProjectDocumentToSupabase({
            buffer: f.buffer,
            originalName: f.originalname,
            mimeType: f.mimetype || 'application/octet-stream',
            ownerUid: existing.customerId || regNo,
            folder: `${regNo}-completion-proof`,
          });
          return {
            originalName: f.originalname,
            storagePath: sb.storagePath,
            storageBucket: sb.bucket,
            mediaType: f.mimetype || 'application/octet-stream',
          };
        })
      );

      const completionNotes = String(
        req.body.notes || 'Engineering build, validation testing, and quality inspection completed.'
      ).trim();
      const nextStatus = existing.balanceAmountInr > 0 ? 'Final Payment Pending' : 'Ready for Handover';
      const nowIso = new Date().toISOString();

      const completionUpdate = {
        id: `upd-cmp-${Date.now()}`,
        timestamp: nowIso,
        author: req.dbUser!.email,
        category: 'Project Completion',
        title: 'Project Completed — Quality Inspection Passed',
        description:
          existing.balanceAmountInr > 0
            ? `${completionNotes} Remaining balance of ₹${existing.balanceAmountInr.toLocaleString('en-IN')} is now due to unlock handover deliverables.`
            : `${completionNotes} Full payment verified. Project is Ready for Handover.`,
        summary:
          existing.balanceAmountInr > 0
            ? `Project Completed. Remaining ₹${existing.balanceAmountInr.toLocaleString('en-IN')} final payment requested.`
            : 'Project Completed & Ready for Handover.',
        progressPercentage: 100,
        reports: uploadedProof,
        adminComments: completionNotes,
      };

      const [updated] = await db
        .update(projects)
        .set({
          status: nextStatus,
          progressPercent: 100,
          completedAt: existing.completedAt || nowIso,
          completionProof: [...(existing.completionProof || []), ...uploadedProof],
          updates: [...(existing.updates || []), completionUpdate],
          updatedAt: new Date(),
        })
        .where(eq(projects.id, projectId))
        .returning();

      if (enq) {
        await db
          .update(projectEnquiries)
          .set({ status: nextStatus, updatedAt: new Date() })
          .where(eq(projectEnquiries.id, enq.id));
      }

      if (updated.userId) {
        await createNotification({
          userId: updated.userId,
          title:
            updated.balanceAmountInr > 0
              ? `Project Completed — Pay Remaining 50% (${updated.projectCode})`
              : `Project Completed — Ready for Handover (${updated.projectCode})`,
          message:
            updated.balanceAmountInr > 0
              ? `Your project is ready! Complete the final ₹${updated.balanceAmountInr.toLocaleString('en-IN')} payment to unlock handover files.`
              : 'All deliverables and documentation are unlocked in your dashboard.',
          link: '/my-account/project-enquiries',
        });
      }

      if (enq?.customerEmail) {
        await dispatchLifecycleEmail({
          userId: updated.userId,
          projectId: updated.id,
          enquiryId: updated.enquiryId,
          recipientEmail: enq.customerEmail,
          eventType: updated.balanceAmountInr > 0 ? 'project_ready_for_final_payment' : 'handover_ready',
          vars: {
            customerName: enq.customerName,
            projectCode: updated.projectCode,
            projectTitle: updated.title,
            balanceAmountInr: updated.balanceAmountInr,
            finalPercent: 50,
          },
        });
      }

      syncProjectUpdateToSupabase({
        projectCode: updated.projectCode,
        registrationNumber: regNo,
        update: completionUpdate,
      }).catch(() => {});

      await logAudit({
        actorUid: req.dbUser!.uid,
        actorEmail: req.dbUser!.email,
        action: 'COMPLETE_PROJECT_WORK',
        entityType: 'project',
        entityId: projectId,
        details: { nextStatus, proofCount: uploadedProof.length },
      });

      res.json({ project: updated });
    } catch (error) {
      console.error('Complete project error:', error);
      res.status(500).json({ error: 'Failed to mark project completed.' });
    }
  }
);

// PCB & B2B Quotations
adminRouter.patch('/pcb-enquiries/:id', async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const { quotedAmountInr, status, adminNotes } = req.body;
    const [updated] = await db
      .update(pcbEnquiries)
      .set({
        quotedAmountInr: quotedAmountInr ? Number(quotedAmountInr) : null,
        status,
        adminNotes: adminNotes ?? '',
        updatedAt: new Date(),
      })
      .where(eq(pcbEnquiries.id, id))
      .returning();
    if (!updated) return res.status(404).json({ error: 'PCB enquiry not found.' });
    if (updated.userId && quotedAmountInr) {
      await createNotification({
        userId: updated.userId,
        title: `PCB Quote Ready (${updated.enquiryNumber})`,
        message: `Quoted amount ₹${quotedAmountInr}. You can pay directly from your dashboard.`,
        link: '/my-account',
      });
    }
    res.json({ enquiry: updated });
  } catch {
    res.status(500).json({ error: 'Failed to update PCB enquiry.' });
  }
});

adminRouter.patch('/b2b-enquiries/:id', async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const { quotedAmountInr, volumeDiscountPercent, status, adminNotes } = req.body;
    const [updated] = await db
      .update(b2bEnquiries)
      .set({
        quotedAmountInr: quotedAmountInr ? Number(quotedAmountInr) : null,
        volumeDiscountPercent: Number(volumeDiscountPercent || 0),
        status,
        adminNotes: adminNotes ?? '',
        updatedAt: new Date(),
      })
      .where(eq(b2bEnquiries.id, id))
      .returning();
    if (!updated) return res.status(404).json({ error: 'B2B enquiry not found.' });
    if (updated.userId && quotedAmountInr) {
      await createNotification({
        userId: updated.userId,
        title: `B2B Bulk Quote Ready (${updated.enquiryNumber})`,
        message: `Quoted amount ₹${quotedAmountInr}. Proceed to payment in your account.`,
        link: '/my-account',
      });
    }
    res.json({ enquiry: updated });
  } catch {
    res.status(500).json({ error: 'Failed to update B2B enquiry.' });
  }
});

// Coupons CRUD
adminRouter.get('/coupons', async (_req, res) => {
  res.json({ items: await db.select().from(coupons).orderBy(desc(coupons.createdAt)) });
});

adminRouter.post('/coupons', async (req, res) => {
  try {
    const b = req.body;
    const [created] = await db
      .insert(coupons)
      .values({
        code: String(b.code).trim().toUpperCase(),
        discountType: b.discountType === 'flat' ? 'flat' : 'percent',
        discountValue: Number(b.discountValue),
        minOrderInr: Number(b.minOrderInr || 0),
        isActive: b.isActive !== false,
      })
      .returning();
    res.status(201).json({ coupon: created });
  } catch (error: any) {
    res.status(400).json({ error: error?.message || 'Failed to create coupon.' });
  }
});

adminRouter.patch('/coupons/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [updated] = await db
      .update(coupons)
      .set({
        isActive: req.body.isActive !== undefined ? Boolean(req.body.isActive) : undefined,
        discountValue: req.body.discountValue !== undefined ? Number(req.body.discountValue) : undefined,
        minOrderInr: req.body.minOrderInr !== undefined ? Number(req.body.minOrderInr) : undefined,
      })
      .where(eq(coupons.id, id))
      .returning();
    if (!updated) return res.status(404).json({ error: 'Coupon not found.' });
    res.json({ coupon: updated });
  } catch {
    res.status(500).json({ error: 'Failed to update coupon.' });
  }
});

adminRouter.delete('/coupons/:id', async (req, res) => {
  try {
    await db.delete(coupons).where(eq(coupons.id, Number(req.params.id)));
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Failed to delete coupon.' });
  }
});

// Blogs CRUD
adminRouter.get('/blogs', async (_req, res) => {
  res.json({ items: await db.select().from(blogs).orderBy(desc(blogs.publishedAt)) });
});

adminRouter.post('/blogs', async (req: AuthRequest, res) => {
  try {
    const b = req.body;
    const slug = String(b.slug || b.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')).trim();
    const [created] = await db
      .insert(blogs)
      .values({
        title: String(b.title).trim(),
        slug,
        category: String(b.category || 'Engineering'),
        tags: Array.isArray(b.tags) ? b.tags : [],
        excerpt: String(b.excerpt || ''),
        content: String(b.content || ''),
        coverImageUrl: String(b.coverImageUrl || '/src/assets/images/hero_nexustek_engineering_1794981062404.jpg'),
        seoTitle: String(b.seoTitle || b.title),
        seoDescription: String(b.seoDescription || b.excerpt || ''),
        isPublished: b.isPublished !== false,
      })
      .returning();
    res.status(201).json({ blog: created });
  } catch (error: any) {
    res.status(400).json({ error: error?.message || 'Failed to publish blog.' });
  }
});

adminRouter.put('/blogs/:id', async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const b = req.body;
    const [updated] = await db
      .update(blogs)
      .set({
        title: b.title !== undefined ? String(b.title).trim() : undefined,
        slug: b.slug !== undefined ? String(b.slug).trim() : undefined,
        category: b.category !== undefined ? String(b.category) : undefined,
        tags: Array.isArray(b.tags) ? b.tags : undefined,
        excerpt: b.excerpt !== undefined ? String(b.excerpt) : undefined,
        content: b.content !== undefined ? String(b.content) : undefined,
        coverImageUrl: b.coverImageUrl !== undefined ? String(b.coverImageUrl) : undefined,
        seoTitle: b.seoTitle !== undefined ? String(b.seoTitle) : undefined,
        seoDescription: b.seoDescription !== undefined ? String(b.seoDescription) : undefined,
        isPublished: b.isPublished !== undefined ? Boolean(b.isPublished) : undefined,
        updatedAt: new Date(),
      })
      .where(eq(blogs.id, id))
      .returning();
    if (!updated) return res.status(404).json({ error: 'Article not found.' });
    res.json({ blog: updated });
  } catch (error: any) {
    res.status(400).json({ error: error?.message || 'Failed to update article.' });
  }
});

adminRouter.delete('/blogs/:id', async (req: AuthRequest, res) => {
  try {
    await db.delete(blogs).where(eq(blogs.id, Number(req.params.id)));
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Failed to delete article.' });
  }
});

// Engineering R&D & Academic Projects (caseStudies) CRUD
adminRouter.get('/case-studies', async (_req, res) => {
  res.json({ items: await db.select().from(caseStudies).orderBy(desc(caseStudies.createdAt)) });
});

adminRouter.post('/case-studies', async (req, res) => {
  try {
    const b = req.body;
    const slug = String(b.slug || b.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')).trim();
    const [created] = await db
      .insert(caseStudies)
      .values({
        title: String(b.title).trim(),
        slug,
        technologyUsed: String(b.technologyUsed || ''),
        applications: String(b.applications || ''),
        outcomes: String(b.outcomes || ''),
        relatedServices: Array.isArray(b.relatedServices) ? b.relatedServices : [],
        description: String(b.description || ''),
        imageUrl: String(b.imageUrl || '/src/assets/images/service_robotics_automation_1794981063545.jpg'),
        videoUrl: String(b.videoUrl || ''),
        isPublished: b.isPublished !== false,
      })
      .returning();
    res.status(201).json({ caseStudy: created });
  } catch (error: any) {
    res.status(400).json({ error: error?.message || 'Failed to create project showcase.' });
  }
});

adminRouter.put('/case-studies/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const b = req.body;
    const [updated] = await db
      .update(caseStudies)
      .set({
        title: b.title !== undefined ? String(b.title).trim() : undefined,
        slug: b.slug !== undefined ? String(b.slug).trim() : undefined,
        technologyUsed: b.technologyUsed !== undefined ? String(b.technologyUsed) : undefined,
        applications: b.applications !== undefined ? String(b.applications) : undefined,
        outcomes: b.outcomes !== undefined ? String(b.outcomes) : undefined,
        relatedServices: Array.isArray(b.relatedServices) ? b.relatedServices : undefined,
        description: b.description !== undefined ? String(b.description) : undefined,
        imageUrl: b.imageUrl !== undefined ? String(b.imageUrl) : undefined,
        videoUrl: b.videoUrl !== undefined ? String(b.videoUrl) : undefined,
        isPublished: b.isPublished !== undefined ? Boolean(b.isPublished) : undefined,
      })
      .where(eq(caseStudies.id, id))
      .returning();
    if (!updated) return res.status(404).json({ error: 'Project showcase not found.' });
    res.json({ caseStudy: updated });
  } catch (error: any) {
    res.status(400).json({ error: error?.message || 'Failed to update project showcase.' });
  }
});

adminRouter.delete('/case-studies/:id', async (req, res) => {
  try {
    await db.delete(caseStudies).where(eq(caseStudies.id, Number(req.params.id)));
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Failed to delete project showcase.' });
  }
});

// CRM Leads Pipeline & Follow-Up Notes
adminRouter.get('/crm/leads', async (_req, res) => {
  const [leads, notes] = await Promise.all([
    db.select().from(crmLeads).where(eq(crmLeads.isDeleted, false)).orderBy(desc(crmLeads.updatedAt)),
    db.select().from(crmNotes).orderBy(desc(crmNotes.createdAt)).limit(200),
  ]);
  res.json({ leads, notes });
});

adminRouter.post('/crm/leads', async (req: AuthRequest, res) => {
  try {
    const b = req.body;
    if (!b.name) return res.status(400).json({ error: 'Lead name is required.' });
    const [created] = await db
      .insert(crmLeads)
      .values({
        name: String(b.name).trim(),
        email: String(b.email || '').trim(),
        phone: String(b.phone || '').trim(),
        companyOrCollege: String(b.companyOrCollege || '').trim(),
        source: String(b.source || 'manual'),
        stage: String(b.stage || 'New Lead'),
        assignedTo: String(b.assignedTo || ''),
        estimatedValueInr: Number(b.estimatedValueInr || 0),
        nextFollowUpDate: String(b.nextFollowUpDate || ''),
        summary: String(b.summary || ''),
      })
      .returning();
    await logAudit({
      actorUid: req.dbUser!.uid,
      actorEmail: req.dbUser!.email,
      action: 'CREATE_CRM_LEAD',
      entityType: 'crm_lead',
      entityId: created.id,
    });
    res.status(201).json({ lead: created });
  } catch (error: any) {
    res.status(400).json({ error: error?.message || 'Failed to create CRM lead.' });
  }
});

adminRouter.patch('/crm/leads/:id', async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const b = req.body;
    const [updated] = await db
      .update(crmLeads)
      .set({
        stage: b.stage !== undefined ? String(b.stage) : undefined,
        assignedTo: b.assignedTo !== undefined ? String(b.assignedTo) : undefined,
        estimatedValueInr: b.estimatedValueInr !== undefined ? Number(b.estimatedValueInr) : undefined,
        nextFollowUpDate: b.nextFollowUpDate !== undefined ? String(b.nextFollowUpDate) : undefined,
        summary: b.summary !== undefined ? String(b.summary) : undefined,
        updatedAt: new Date(),
      })
      .where(eq(crmLeads.id, id))
      .returning();
    if (!updated) return res.status(404).json({ error: 'Lead not found.' });
    res.json({ lead: updated });
  } catch {
    res.status(500).json({ error: 'Failed to update CRM lead.' });
  }
});

adminRouter.delete('/crm/leads/:id', async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const archivedReason = String(req.body?.reason || req.query?.reason || 'Archived by Admin').trim();
    await db.update(crmLeads).set({ isDeleted: true, updatedAt: new Date() }).where(eq(crmLeads.id, id));
    await logAudit({
      actorUid: req.dbUser!.uid,
      actorEmail: req.dbUser!.email,
      action: 'ARCHIVE_CRM_LEAD',
      entityType: 'crm_lead',
      entityId: id,
      details: { archivedReason },
    });
    res.json({ ok: true, archivedReason });
  } catch {
    res.status(500).json({ error: 'Failed to archive lead.' });
  }
});

adminRouter.post('/crm/notes', async (req: AuthRequest, res) => {
  try {
    const { entityType, entityId, note } = req.body;
    if (!entityType || !entityId || !String(note || '').trim()) {
      return res.status(400).json({ error: 'Entity type, ID, and note text are required.' });
    }
    const [created] = await db
      .insert(crmNotes)
      .values({
        entityType: String(entityType),
        entityId: Number(entityId),
        authorEmail: req.dbUser!.email,
        note: String(note).trim(),
      })
      .returning();
    res.status(201).json({ note: created });
  } catch {
    res.status(500).json({ error: 'Failed to save follow-up note.' });
  }
});

// Site Settings & CMS
adminRouter.put('/settings/:key', async (req: AuthRequest, res) => {
  try {
    const key = req.params.key;
    const value = req.body.value;
    const [saved] = await db
      .insert(siteSettings)
      .values({ key, value, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: siteSettings.key,
        set: { value, updatedAt: new Date() },
      })
      .returning();

    await logAudit({
      actorUid: req.dbUser!.uid,
      actorEmail: req.dbUser!.email,
      action: 'UPDATE_CMS_SETTING',
      entityType: 'site_settings',
      entityId: key,
    });

    res.json({ setting: saved });
  } catch {
    res.status(500).json({ error: 'Failed to update setting.' });
  }
});

// ============================================================================
// TEAM MEMBERS CRUD (Founder & CEO + All Staff)
// ============================================================================
adminRouter.get('/team', async (_req, res) => {
  try {
    const rows = await db
      .select()
      .from(teamMembers)
      .orderBy(asc(teamMembers.displayOrder), asc(teamMembers.id));
    res.json({ items: rows });
  } catch {
    res.status(500).json({ error: 'Failed to load team members.' });
  }
});

adminRouter.post('/team', async (req: AuthRequest, res) => {
  try {
    const b = req.body || {};
    const fullName = String(b.fullName || b.name || '').trim();
    const designation = String(b.designation || '').trim();
    if (!fullName || !designation) {
      return res.status(400).json({ error: 'Full name and designation are required.' });
    }

    const existingRows = await db.select({ id: teamMembers.id }).from(teamMembers);
    const baseSlug =
      String(b.slugKey || b.id || fullName)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || `member-${Date.now()}`;
    const [dup] = await db
      .select({ id: teamMembers.id })
      .from(teamMembers)
      .where(eq(teamMembers.slugKey, baseSlug))
      .limit(1);
    const slugKey = dup ? `${baseSlug}-${Date.now().toString().slice(-4)}` : baseSlug;

    const skills = Array.isArray(b.skills)
      ? b.skills.map((s: unknown) => String(s).trim()).filter(Boolean)
      : String(b.skills || '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);

    const status = b.status === 'draft' ? 'draft' : 'published';
    const profilePhotoUrl = String(b.profilePhotoUrl || b.photoUrl || '').trim() || pickNeutralAvatar(slugKey);

    const [created] = await db
      .insert(teamMembers)
      .values({
        slugKey,
        fullName,
        designation,
        department: String(b.department || 'Engineering & Innovation').trim(),
        professionalCategory: String(b.professionalCategory || b.department || 'Engineering & Innovation').trim(),
        profilePhotoUrl,
        photoAlt: String(b.photoAlt || `${fullName} — ${designation}`).trim(),
        shortBiography: String(b.shortBiography || b.biography || '').trim(),
        detailedBiography: String(b.detailedBiography || '').trim(),
        qualifications: String(b.qualifications || '').trim(),
        experience: String(b.experience || '').trim(),
        responsibilities: String(b.responsibilities || '').trim(),
        skills,
        linkedinUrl: String(b.linkedinUrl || '').trim(),
        displayOrder: Number(b.displayOrder ?? existingRows.length + 1),
        status,
        isFeatured: Boolean(b.isFeatured),
        isActive: b.isActive !== false,
        updatedBy: req.dbUser!.email,
      })
      .returning();

    const aboutTeam = await syncTeamSettingFromTable();
    await logAudit({
      actorUid: req.dbUser!.uid,
      actorEmail: req.dbUser!.email,
      action: 'CREATE_TEAM_MEMBER',
      entityType: 'team_member',
      entityId: created.id,
      details: { fullName: created.fullName, designation: created.designation, status: created.status },
    });

    res.status(201).json({ member: created, aboutTeam });
  } catch (error: any) {
    res.status(400).json({ error: error?.message || 'Failed to create team member.' });
  }
});

adminRouter.put('/team/:id', async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const b = req.body || {};
    const [existing] = await db.select().from(teamMembers).where(eq(teamMembers.id, id)).limit(1);
    if (!existing) return res.status(404).json({ error: 'Team member profile not found.' });

    const skills =
      b.skills !== undefined
        ? Array.isArray(b.skills)
          ? b.skills.map((s: unknown) => String(s).trim()).filter(Boolean)
          : String(b.skills || '')
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
        : existing.skills;

    const rawPhoto = b.profilePhotoUrl !== undefined ? b.profilePhotoUrl : b.photoUrl;
    const nextPhotoUrl =
      rawPhoto !== undefined ? String(rawPhoto).trim() || pickNeutralAvatar(existing.slugKey) : existing.profilePhotoUrl;

    const nextStatus = b.status !== undefined ? (b.status === 'draft' ? 'draft' : 'published') : existing.status;

    const [updated] = await db
      .update(teamMembers)
      .set({
        fullName: b.fullName !== undefined ? String(b.fullName).trim() : b.name !== undefined ? String(b.name).trim() : existing.fullName,
        designation: b.designation !== undefined ? String(b.designation).trim() : existing.designation,
        department: b.department !== undefined ? String(b.department).trim() : existing.department,
        professionalCategory: b.professionalCategory !== undefined ? String(b.professionalCategory).trim() : existing.professionalCategory,
        profilePhotoUrl: nextPhotoUrl,
        photoAlt: b.photoAlt !== undefined ? String(b.photoAlt).trim() : existing.photoAlt,
        shortBiography:
          b.shortBiography !== undefined
            ? String(b.shortBiography).trim()
            : b.biography !== undefined
            ? String(b.biography).trim()
            : existing.shortBiography,
        detailedBiography: b.detailedBiography !== undefined ? String(b.detailedBiography).trim() : existing.detailedBiography,
        qualifications: b.qualifications !== undefined ? String(b.qualifications).trim() : existing.qualifications,
        experience: b.experience !== undefined ? String(b.experience).trim() : existing.experience,
        responsibilities: b.responsibilities !== undefined ? String(b.responsibilities).trim() : existing.responsibilities,
        skills,
        linkedinUrl: b.linkedinUrl !== undefined ? String(b.linkedinUrl).trim() : existing.linkedinUrl,
        displayOrder: b.displayOrder !== undefined ? Number(b.displayOrder) : existing.displayOrder,
        status: nextStatus,
        isFeatured: b.isFeatured !== undefined ? Boolean(b.isFeatured) : existing.isFeatured,
        isActive: b.isActive !== undefined ? Boolean(b.isActive) : existing.isActive,
        updatedBy: req.dbUser!.email,
        updatedAt: new Date(),
      })
      .where(eq(teamMembers.id, id))
      .returning();

    const aboutTeam = await syncTeamSettingFromTable();
    await logAudit({
      actorUid: req.dbUser!.uid,
      actorEmail: req.dbUser!.email,
      action: 'UPDATE_TEAM_MEMBER',
      entityType: 'team_member',
      entityId: id,
      details: { fullName: updated.fullName, designation: updated.designation, status: updated.status },
    });

    res.json({ member: updated, aboutTeam });
  } catch (error: any) {
    res.status(400).json({ error: error?.message || 'Failed to update team member.' });
  }
});

adminRouter.patch('/team/:id/status', async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const status = req.body.status === 'draft' ? 'draft' : 'published';
    const isActive = req.body.isActive !== undefined ? Boolean(req.body.isActive) : status === 'published';
    const [updated] = await db
      .update(teamMembers)
      .set({ status, isActive, updatedBy: req.dbUser!.email, updatedAt: new Date() })
      .where(eq(teamMembers.id, id))
      .returning();
    if (!updated) return res.status(404).json({ error: 'Team member not found.' });
    const aboutTeam = await syncTeamSettingFromTable();
    await logAudit({
      actorUid: req.dbUser!.uid,
      actorEmail: req.dbUser!.email,
      action: status === 'published' ? 'PUBLISH_TEAM_MEMBER' : 'UNPUBLISH_TEAM_MEMBER',
      entityType: 'team_member',
      entityId: id,
    });
    res.json({ member: updated, aboutTeam });
  } catch {
    res.status(500).json({ error: 'Failed to update team member visibility.' });
  }
});

adminRouter.post('/team/reorder', async (req: AuthRequest, res) => {
  try {
    const orderedIds = Array.isArray(req.body.orderedIds) ? req.body.orderedIds.map(Number) : [];
    for (let i = 0; i < orderedIds.length; i++) {
      const id = orderedIds[i];
      if (!Number.isFinite(id)) continue;
      await db
        .update(teamMembers)
        .set({ displayOrder: i + 1, updatedBy: req.dbUser!.email, updatedAt: new Date() })
        .where(eq(teamMembers.id, id));
    }
    const aboutTeam = await syncTeamSettingFromTable();
    await logAudit({
      actorUid: req.dbUser!.uid,
      actorEmail: req.dbUser!.email,
      action: 'REORDER_TEAM_MEMBERS',
      entityType: 'team_member',
      details: { orderedIds },
    });
    res.json({ ok: true, aboutTeam });
  } catch {
    res.status(500).json({ error: 'Failed to reorder team members.' });
  }
});

adminRouter.delete('/team/:id', async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const [existing] = await db.select().from(teamMembers).where(eq(teamMembers.id, id)).limit(1);
    if (!existing) return res.status(404).json({ error: 'Team member not found.' });

    const isFounderProfile =
      existing.slugKey.includes('sahil') ||
      existing.designation.toLowerCase().includes('founder') ||
      existing.designation.toLowerCase().includes('ceo');

    const confirmed = req.body?.confirmCeoDeletion === true || req.query.confirm === 'true';
    if (isFounderProfile && !confirmed) {
      return res.status(400).json({
        error: 'Deleting the Founder & CEO profile requires explicit confirmation.',
        requiresCeoConfirmation: true,
      });
    }

    await db.delete(teamMembers).where(eq(teamMembers.id, id));
    const aboutTeam = await syncTeamSettingFromTable();

    await logAudit({
      actorUid: req.dbUser!.uid,
      actorEmail: req.dbUser!.email,
      action: 'DELETE_TEAM_MEMBER',
      entityType: 'team_member',
      entityId: id,
      details: { fullName: existing.fullName, isFounderProfile },
    });
    res.json({ ok: true, aboutTeam });
  } catch {
    res.status(500).json({ error: 'Failed to delete team member.' });
  }
});

// ============================================================================
// WEBSITE BANNERS CRUD
// ============================================================================
adminRouter.get('/banners', async (_req, res) => {
  try {
    const rows = await db
      .select()
      .from(websiteBanners)
      .orderBy(asc(websiteBanners.sortOrder), asc(websiteBanners.id));
    res.json({ items: rows });
  } catch {
    res.status(500).json({ error: 'Failed to load website banners.' });
  }
});

adminRouter.post('/banners', async (req: AuthRequest, res) => {
  try {
    const b = req.body || {};
    const title = String(b.title || '').trim();
    if (!title) return res.status(400).json({ error: 'Banner title is required.' });
    const bannerKey =
      String(b.bannerKey || title)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || `banner-${Date.now()}`;
    const [dup] = await db.select({ id: websiteBanners.id }).from(websiteBanners).where(eq(websiteBanners.bannerKey, bannerKey)).limit(1);
    const finalKey = dup ? `${bannerKey}-${Date.now().toString().slice(-4)}` : bannerKey;

    const [created] = await db
      .insert(websiteBanners)
      .values({
        bannerKey: finalKey,
        title,
        subtitle: String(b.subtitle || '').trim(),
        placement: String(b.placement || 'homepage_promo').trim(),
        imageUrl: String(b.imageUrl || '').trim(),
        videoUrl: String(b.videoUrl || '').trim(),
        ctaLabel: String(b.ctaLabel || 'Explore').trim(),
        ctaLink: String(b.ctaLink || '/krashivantri').trim(),
        sortOrder: Number(b.sortOrder ?? 1),
        isActive: b.isActive !== false,
        status: b.status === 'draft' ? 'draft' : 'published',
        updatedBy: req.dbUser!.email,
      })
      .returning();

    await logAudit({
      actorUid: req.dbUser!.uid,
      actorEmail: req.dbUser!.email,
      action: 'CREATE_WEBSITE_BANNER',
      entityType: 'website_banner',
      entityId: created.id,
      details: { title: created.title, placement: created.placement },
    });
    res.status(201).json({ banner: created });
  } catch (error: any) {
    res.status(400).json({ error: error?.message || 'Failed to create banner.' });
  }
});

adminRouter.put('/banners/:id', async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const b = req.body || {};
    const [existing] = await db.select().from(websiteBanners).where(eq(websiteBanners.id, id)).limit(1);
    if (!existing) return res.status(404).json({ error: 'Banner not found.' });

    const [updated] = await db
      .update(websiteBanners)
      .set({
        title: b.title !== undefined ? String(b.title).trim() : existing.title,
        subtitle: b.subtitle !== undefined ? String(b.subtitle).trim() : existing.subtitle,
        placement: b.placement !== undefined ? String(b.placement).trim() : existing.placement,
        imageUrl: b.imageUrl !== undefined ? String(b.imageUrl).trim() : existing.imageUrl,
        videoUrl: b.videoUrl !== undefined ? String(b.videoUrl).trim() : existing.videoUrl,
        ctaLabel: b.ctaLabel !== undefined ? String(b.ctaLabel).trim() : existing.ctaLabel,
        ctaLink: b.ctaLink !== undefined ? String(b.ctaLink).trim() : existing.ctaLink,
        sortOrder: b.sortOrder !== undefined ? Number(b.sortOrder) : existing.sortOrder,
        isActive: b.isActive !== undefined ? Boolean(b.isActive) : existing.isActive,
        status: b.status !== undefined ? (b.status === 'draft' ? 'draft' : 'published') : existing.status,
        updatedBy: req.dbUser!.email,
        updatedAt: new Date(),
      })
      .where(eq(websiteBanners.id, id))
      .returning();

    await logAudit({
      actorUid: req.dbUser!.uid,
      actorEmail: req.dbUser!.email,
      action: 'UPDATE_WEBSITE_BANNER',
      entityType: 'website_banner',
      entityId: id,
    });
    res.json({ banner: updated });
  } catch (error: any) {
    res.status(400).json({ error: error?.message || 'Failed to update banner.' });
  }
});

adminRouter.delete('/banners/:id', async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    await db.delete(websiteBanners).where(eq(websiteBanners.id, id));
    await logAudit({
      actorUid: req.dbUser!.uid,
      actorEmail: req.dbUser!.email,
      action: 'DELETE_WEBSITE_BANNER',
      entityType: 'website_banner',
      entityId: id,
    });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Failed to delete banner.' });
  }
});

// ============================================================================
// CENTRALIZED WEBSITE CMS WORKSPACE (Draft -> Preview -> Publish -> Rollback)
// ============================================================================
adminRouter.get('/cms/workspace', async (_req, res) => {
  try {
    const [rows, pages, revisions, teamRows, bannerRows, mediaRows] = await Promise.all([
      db.select().from(siteSettings),
      db.select().from(cmsPages).orderBy(desc(cmsPages.updatedAt)),
      db.select().from(cmsRevisions).orderBy(desc(cmsRevisions.createdAt)).limit(40),
      db.select().from(teamMembers).orderBy(asc(teamMembers.displayOrder), asc(teamMembers.id)),
      db.select().from(websiteBanners).orderBy(asc(websiteBanners.sortOrder), asc(websiteBanners.id)),
      db.select().from(mediaAssets).orderBy(desc(mediaAssets.createdAt)).limit(250),
    ]);

    const settingsMap: Record<string, unknown> = {};
    for (const r of rows) {
      if (r.key === 'paymentGatewayConfig') continue;
      settingsMap[r.key] = r.value;
    }

    if (!settingsMap.homepageLayout) {
      settingsMap.homepageLayout = {
        draft: DEFAULT_HOMEPAGE_SECTIONS,
        published: DEFAULT_HOMEPAGE_SECTIONS,
      };
    }
    if (!settingsMap.cmsWorkspace) {
      settingsMap.cmsWorkspace = {
        draft: DEFAULT_CMS_BUNDLE,
        published: DEFAULT_CMS_BUNDLE,
      };
    }
    if (!settingsMap.seoConfig) {
      settingsMap.seoConfig = DEFAULT_SEO_CONFIG;
    }

    res.json({
      settings: settingsMap,
      pages,
      revisions,
      teamMembers: teamRows,
      banners: bannerRows,
      mediaAssets: mediaRows,
      mediaCategories: CMS_MEDIA_CATEGORIES,
    });
  } catch (error) {
    console.error('CMS workspace load error:', error);
    res.status(500).json({ error: 'Failed to load Centralized CMS Workspace.' });
  }
});

adminRouter.put('/cms/draft', async (req: AuthRequest, res) => {
  try {
    const b = req.body || {};
    const [existingWsRow] = await db
      .select()
      .from(siteSettings)
      .where(eq(siteSettings.key, 'cmsWorkspace'))
      .limit(1);
    const prevWs = (existingWsRow?.value as { draft?: any; published?: any; publishedAt?: string }) || {};
    const nextDraftBundle = b.draftBundle ? b.draftBundle : prevWs.draft || DEFAULT_CMS_BUNDLE;

    const nextWs = {
      draft: nextDraftBundle,
      published: prevWs.published || DEFAULT_CMS_BUNDLE,
      publishedAt: prevWs.publishedAt,
      updatedAt: new Date().toISOString(),
      updatedBy: req.dbUser!.email,
    };

    await db
      .insert(siteSettings)
      .values({ key: 'cmsWorkspace', value: nextWs, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: siteSettings.key,
        set: { value: nextWs, updatedAt: new Date() },
      });

    let nextHomepageLayout: unknown = null;
    if (Array.isArray(b.homepageSections)) {
      const [existingHomeRow] = await db
        .select()
        .from(siteSettings)
        .where(eq(siteSettings.key, 'homepageLayout'))
        .limit(1);
      const prevHome = (existingHomeRow?.value as { published?: unknown[]; publishedAt?: string }) || {};
      nextHomepageLayout = {
        draft: b.homepageSections,
        published: prevHome.published || DEFAULT_HOMEPAGE_SECTIONS,
        publishedAt: prevHome.publishedAt,
      };
      await db
        .insert(siteSettings)
        .values({ key: 'homepageLayout', value: nextHomepageLayout, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: siteSettings.key,
          set: { value: nextHomepageLayout, updatedAt: new Date() },
        });
    }

    await logAudit({
      actorUid: req.dbUser!.uid,
      actorEmail: req.dbUser!.email,
      action: 'SAVE_CMS_DRAFT',
      entityType: 'cms_workspace',
      entityId: 'cmsWorkspace',
    });

    res.json({ cmsWorkspace: nextWs, homepageLayout: nextHomepageLayout });
  } catch (error) {
    console.error('CMS draft save error:', error);
    res.status(500).json({ error: 'Failed to save CMS draft.' });
  }
});

adminRouter.post('/cms/publish', async (req: AuthRequest, res) => {
  try {
    const b = req.body || {};
    const label = String(b.label || `CMS Publish ${new Date().toLocaleString('en-IN')}`);
    const [existingWsRow] = await db
      .select()
      .from(siteSettings)
      .where(eq(siteSettings.key, 'cmsWorkspace'))
      .limit(1);
    const prevWs = (existingWsRow?.value as { draft?: any; published?: any }) || {};
    const bundleToPublish = b.draftBundle || prevWs.draft || DEFAULT_CMS_BUNDLE;

    const nowIso = new Date().toISOString();
    const nextWs = {
      draft: bundleToPublish,
      published: bundleToPublish,
      publishedAt: nowIso,
      updatedAt: nowIso,
      updatedBy: req.dbUser!.email,
    };

    await db
      .insert(siteSettings)
      .values({ key: 'cmsWorkspace', value: nextWs, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: siteSettings.key,
        set: { value: nextWs, updatedAt: new Date() },
      });

    // Sync servicesCatalog & homepageLayout if provided
    if (bundleToPublish?.services?.services && Array.isArray(bundleToPublish.services.services)) {
      await db
        .insert(siteSettings)
        .values({ key: 'servicesCatalog', value: bundleToPublish.services.services, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: siteSettings.key,
          set: { value: bundleToPublish.services.services, updatedAt: new Date() },
        });
    }

    let nextHomeVal: unknown = null;
    if (Array.isArray(b.homepageSections)) {
      nextHomeVal = {
        draft: b.homepageSections,
        published: b.homepageSections,
        publishedAt: nowIso,
      };
      await db
        .insert(siteSettings)
        .values({ key: 'homepageLayout', value: nextHomeVal, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: siteSettings.key,
          set: { value: nextHomeVal, updatedAt: new Date() },
        });
    } else {
      const [existingHome] = await db.select().from(siteSettings).where(eq(siteSettings.key, 'homepageLayout')).limit(1);
      const prevHome = (existingHome?.value as { draft?: unknown[] }) || {};
      if (Array.isArray(prevHome.draft)) {
        nextHomeVal = { draft: prevHome.draft, published: prevHome.draft, publishedAt: nowIso };
        await db
          .update(siteSettings)
          .set({ value: nextHomeVal, updatedAt: new Date() })
          .where(eq(siteSettings.key, 'homepageLayout'));
      }
    }

    const optionalSettingsKeys = [
      'krashivantriCatalog',
      'seoConfig',
      'companyInfo',
      'announcementBar',
      'navigationMenus',
      'appLinks',
    ] as const;
    for (const sKey of optionalSettingsKeys) {
      if (b[sKey] !== undefined) {
        await db
          .insert(siteSettings)
          .values({ key: sKey, value: b[sKey], updatedAt: new Date() })
          .onConflictDoUpdate({
            target: siteSettings.key,
            set: { value: b[sKey], updatedAt: new Date() },
          });
      }
    }

    const [revision] = await db
      .insert(cmsRevisions)
      .values({
        targetKey: 'cmsWorkspace',
        label,
        snapshot: {
          bundle: bundleToPublish,
          homepageSections: (nextHomeVal as any)?.published || null,
          krashivantriCatalog: b.krashivantriCatalog,
          seoConfig: b.seoConfig,
          companyInfo: b.companyInfo,
        },
        createdBy: req.dbUser!.email,
      })
      .returning();

    await logAudit({
      actorUid: req.dbUser!.uid,
      actorEmail: req.dbUser!.email,
      action: 'PUBLISH_CMS_WORKSPACE',
      entityType: 'cms_workspace',
      entityId: revision.id,
      details: { label },
    });

    res.json({ cmsWorkspace: nextWs, homepageLayout: nextHomeVal, revision });
  } catch (error) {
    console.error('CMS publish error:', error);
    res.status(500).json({ error: 'Failed to publish CMS changes.' });
  }
});

adminRouter.post('/cms/discard', async (req: AuthRequest, res) => {
  try {
    const [existingWsRow] = await db.select().from(siteSettings).where(eq(siteSettings.key, 'cmsWorkspace')).limit(1);
    const prevWs = (existingWsRow?.value as { published?: any; publishedAt?: string }) || {};
    const published = prevWs.published || DEFAULT_CMS_BUNDLE;
    const nextWs = {
      draft: published,
      published,
      publishedAt: prevWs.publishedAt,
      updatedAt: new Date().toISOString(),
      updatedBy: req.dbUser!.email,
    };
    await db
      .insert(siteSettings)
      .values({ key: 'cmsWorkspace', value: nextWs, updatedAt: new Date() })
      .onConflictDoUpdate({ target: siteSettings.key, set: { value: nextWs, updatedAt: new Date() } });

    const [existingHome] = await db.select().from(siteSettings).where(eq(siteSettings.key, 'homepageLayout')).limit(1);
    const prevHome = (existingHome?.value as { published?: unknown[]; publishedAt?: string }) || {};
    const nextHome = {
      draft: prevHome.published || DEFAULT_HOMEPAGE_SECTIONS,
      published: prevHome.published || DEFAULT_HOMEPAGE_SECTIONS,
      publishedAt: prevHome.publishedAt,
    };
    await db
      .insert(siteSettings)
      .values({ key: 'homepageLayout', value: nextHome, updatedAt: new Date() })
      .onConflictDoUpdate({ target: siteSettings.key, set: { value: nextHome, updatedAt: new Date() } });

    await logAudit({
      actorUid: req.dbUser!.uid,
      actorEmail: req.dbUser!.email,
      action: 'DISCARD_CMS_DRAFT',
      entityType: 'cms_workspace',
    });

    res.json({ cmsWorkspace: nextWs, homepageLayout: nextHome });
  } catch {
    res.status(500).json({ error: 'Failed to discard draft changes.' });
  }
});

adminRouter.post('/cms/rollback/:revisionId', async (req: AuthRequest, res) => {
  try {
    const revisionId = Number(req.params.revisionId);
    const publishImmediately = req.body?.publishImmediately !== false;
    const [rev] = await db.select().from(cmsRevisions).where(eq(cmsRevisions.id, revisionId)).limit(1);
    if (!rev) return res.status(404).json({ error: 'Revision not found.' });

    const snap = rev.snapshot as any;
    const nowIso = new Date().toISOString();

    if (rev.targetKey === 'cmsWorkspace' && snap?.bundle) {
      const [existingWsRow] = await db.select().from(siteSettings).where(eq(siteSettings.key, 'cmsWorkspace')).limit(1);
      const prevWs = (existingWsRow?.value as { published?: any; publishedAt?: string }) || {};
      const nextWs = {
        draft: snap.bundle,
        published: publishImmediately ? snap.bundle : prevWs.published || DEFAULT_CMS_BUNDLE,
        publishedAt: publishImmediately ? nowIso : prevWs.publishedAt,
        updatedAt: nowIso,
        updatedBy: req.dbUser!.email,
      };
      await db
        .insert(siteSettings)
        .values({ key: 'cmsWorkspace', value: nextWs, updatedAt: new Date() })
        .onConflictDoUpdate({ target: siteSettings.key, set: { value: nextWs, updatedAt: new Date() } });

      if (publishImmediately && Array.isArray(snap.homepageSections)) {
        const nextHome = {
          draft: snap.homepageSections,
          published: snap.homepageSections,
          publishedAt: nowIso,
        };
        await db
          .insert(siteSettings)
          .values({ key: 'homepageLayout', value: nextHome, updatedAt: new Date() })
          .onConflictDoUpdate({ target: siteSettings.key, set: { value: nextHome, updatedAt: new Date() } });
      }
      if (publishImmediately && snap.krashivantriCatalog) {
        await db
          .insert(siteSettings)
          .values({ key: 'krashivantriCatalog', value: snap.krashivantriCatalog, updatedAt: new Date() })
          .onConflictDoUpdate({ target: siteSettings.key, set: { value: snap.krashivantriCatalog, updatedAt: new Date() } });
      }
      if (publishImmediately && snap.seoConfig) {
        await db
          .insert(siteSettings)
          .values({ key: 'seoConfig', value: snap.seoConfig, updatedAt: new Date() })
          .onConflictDoUpdate({ target: siteSettings.key, set: { value: snap.seoConfig, updatedAt: new Date() } });
      }
    } else {
      const restored = Array.isArray(snap) ? snap : DEFAULT_HOMEPAGE_SECTIONS;
      const [existing] = await db.select().from(siteSettings).where(eq(siteSettings.key, 'homepageLayout')).limit(1);
      const prev = (existing?.value as { published?: unknown[]; publishedAt?: string }) || {};
      const nextVal = {
        draft: restored,
        published: publishImmediately ? restored : prev.published || DEFAULT_HOMEPAGE_SECTIONS,
        publishedAt: publishImmediately ? nowIso : prev.publishedAt,
      };
      await db
        .insert(siteSettings)
        .values({ key: 'homepageLayout', value: nextVal, updatedAt: new Date() })
        .onConflictDoUpdate({ target: siteSettings.key, set: { value: nextVal, updatedAt: new Date() } });
    }

    await logAudit({
      actorUid: req.dbUser!.uid,
      actorEmail: req.dbUser!.email,
      action: 'ROLLBACK_CMS_REVISION',
      entityType: 'cms_revisions',
      entityId: revisionId,
      details: { targetKey: rev.targetKey, publishImmediately },
    });

    res.json({ ok: true });
  } catch (error) {
    console.error('CMS rollback error:', error);
    res.status(500).json({ error: 'Failed to rollback CMS revision.' });
  }
});

// Visual Website Editor APIs (Draft, Publish, Revision History, Rollback, Custom Pages)
adminRouter.get('/website-editor/state', async (_req, res) => {
  try {
    const [rows, pages, revisions] = await Promise.all([
      db.select().from(siteSettings),
      db.select().from(cmsPages).orderBy(desc(cmsPages.updatedAt)),
      db.select().from(cmsRevisions).orderBy(desc(cmsRevisions.createdAt)).limit(30),
    ]);
    const settingsMap: Record<string, unknown> = {};
    for (const r of rows) {
      if (r.key === 'paymentGatewayConfig') continue;
      settingsMap[r.key] = r.value;
    }
    if (!settingsMap.homepageLayout) {
      settingsMap.homepageLayout = {
        draft: DEFAULT_HOMEPAGE_SECTIONS,
        published: DEFAULT_HOMEPAGE_SECTIONS,
      };
    }
    res.json({ settings: settingsMap, pages, revisions });
  } catch (error) {
    console.error('Website editor state error:', error);
    res.status(500).json({ error: 'Failed to load Website Editor state.' });
  }
});

adminRouter.put('/website-editor/draft', async (req: AuthRequest, res) => {
  try {
    const { sections } = req.body;
    if (!Array.isArray(sections)) {
      return res.status(400).json({ error: 'Sections array is required.' });
    }
    const [existing] = await db
      .select()
      .from(siteSettings)
      .where(eq(siteSettings.key, 'homepageLayout'))
      .limit(1);
    const prev = (existing?.value as { published?: unknown[]; publishedAt?: string }) || {};
    const nextVal = {
      draft: sections,
      published: prev.published || DEFAULT_HOMEPAGE_SECTIONS,
      publishedAt: prev.publishedAt,
    };

    await db
      .insert(siteSettings)
      .values({ key: 'homepageLayout', value: nextVal, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: siteSettings.key,
        set: { value: nextVal, updatedAt: new Date() },
      });

    res.json({ homepageLayout: nextVal });
  } catch (error) {
    console.error('Save draft error:', error);
    res.status(500).json({ error: 'Failed to save homepage draft.' });
  }
});

adminRouter.post('/website-editor/publish', async (req: AuthRequest, res) => {
  try {
    const label = String(req.body.label || `Publish ${new Date().toLocaleString('en-IN')}`);
    const [existing] = await db
      .select()
      .from(siteSettings)
      .where(eq(siteSettings.key, 'homepageLayout'))
      .limit(1);
    const prev = (existing?.value as { draft?: unknown[]; published?: unknown[] }) || {};
    const draftToPublish = Array.isArray(req.body.sections)
      ? req.body.sections
      : prev.draft || DEFAULT_HOMEPAGE_SECTIONS;

    const nextVal = {
      draft: draftToPublish,
      published: draftToPublish,
      publishedAt: new Date().toISOString(),
    };

    await db
      .insert(siteSettings)
      .values({ key: 'homepageLayout', value: nextVal, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: siteSettings.key,
        set: { value: nextVal, updatedAt: new Date() },
      });

    const [revision] = await db
      .insert(cmsRevisions)
      .values({
        targetKey: 'homepageLayout',
        label,
        snapshot: draftToPublish,
        createdBy: req.dbUser!.email,
      })
      .returning();

    await logAudit({
      actorUid: req.dbUser!.uid,
      actorEmail: req.dbUser!.email,
      action: 'PUBLISH_WEBSITE_LAYOUT',
      entityType: 'site_settings',
      entityId: 'homepageLayout',
      details: { revisionId: revision.id, label },
    });

    res.json({ homepageLayout: nextVal, revision });
  } catch (error) {
    console.error('Publish layout error:', error);
    res.status(500).json({ error: 'Failed to publish homepage.' });
  }
});

adminRouter.post('/website-editor/rollback/:revisionId', async (req: AuthRequest, res) => {
  try {
    const revisionId = Number(req.params.revisionId);
    const publishImmediately = Boolean(req.body.publishImmediately);
    const [rev] = await db.select().from(cmsRevisions).where(eq(cmsRevisions.id, revisionId)).limit(1);
    if (!rev) return res.status(404).json({ error: 'Revision not found.' });

    const [existing] = await db
      .select()
      .from(siteSettings)
      .where(eq(siteSettings.key, 'homepageLayout'))
      .limit(1);
    const prev = (existing?.value as { published?: unknown[]; publishedAt?: string }) || {};
    const restored = Array.isArray(rev.snapshot) ? rev.snapshot : DEFAULT_HOMEPAGE_SECTIONS;

    const nextVal = {
      draft: restored,
      published: publishImmediately ? restored : prev.published || DEFAULT_HOMEPAGE_SECTIONS,
      publishedAt: publishImmediately ? new Date().toISOString() : prev.publishedAt,
    };

    await db
      .insert(siteSettings)
      .values({ key: 'homepageLayout', value: nextVal, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: siteSettings.key,
        set: { value: nextVal, updatedAt: new Date() },
      });

    await logAudit({
      actorUid: req.dbUser!.uid,
      actorEmail: req.dbUser!.email,
      action: 'ROLLBACK_WEBSITE_LAYOUT',
      entityType: 'cms_revisions',
      entityId: revisionId,
      details: { publishImmediately },
    });

    res.json({ homepageLayout: nextVal });
  } catch (error) {
    console.error('Rollback error:', error);
    res.status(500).json({ error: 'Failed to rollback layout.' });
  }
});

adminRouter.post('/website-editor/pages', async (req: AuthRequest, res) => {
  try {
    const b = req.body;
    const title = String(b.title || '').trim();
    const slug = String(b.slug || title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')).trim();
    if (!title || !slug) return res.status(400).json({ error: 'Page title and slug are required.' });

    const draftContent = b.draftContent || {
      heroHeadline: title,
      heroSubheadline: b.seoDescription || 'Custom landing page engineered by NexusTekFusion.',
      ctaLabel: 'Contact Engineering Team',
      ctaLink: '/contact',
      blocks: [{ id: 'b1', heading: 'Overview', body: 'Edit this block in Website CMS Studio.' }],
    };

    const publishNow = b.status === 'published';
    const [created] = await db
      .insert(cmsPages)
      .values({
        title,
        slug,
        seoTitle: String(b.seoTitle || title),
        seoDescription: String(b.seoDescription || ''),
        draftContent,
        publishedContent: publishNow ? draftContent : null,
        status: publishNow ? 'published' : 'draft',
        updatedBy: req.dbUser!.email,
      })
      .returning();

    await logAudit({
      actorUid: req.dbUser!.uid,
      actorEmail: req.dbUser!.email,
      action: 'CREATE_CMS_PAGE',
      entityType: 'cms_page',
      entityId: created.id,
      details: { slug: created.slug, status: created.status },
    });

    res.status(201).json({ page: created });
  } catch (error: any) {
    res.status(400).json({ error: error?.message || 'Failed to create page.' });
  }
});

adminRouter.put('/website-editor/pages/:id', async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const b = req.body;
    const [existing] = await db.select().from(cmsPages).where(eq(cmsPages.id, id)).limit(1);
    if (!existing) return res.status(404).json({ error: 'Page not found.' });

    const unpublish = b.status === 'draft' || b.unpublish === true;
    const publishNow = !unpublish && (b.publish === true || b.status === 'published');
    const nextDraft = b.draftContent ?? existing.draftContent;
    const [updated] = await db
      .update(cmsPages)
      .set({
        title: b.title ?? existing.title,
        seoTitle: b.seoTitle ?? existing.seoTitle,
        seoDescription: b.seoDescription ?? existing.seoDescription,
        draftContent: nextDraft,
        publishedContent: publishNow ? nextDraft : unpublish ? null : existing.publishedContent,
        status: publishNow ? 'published' : unpublish ? 'draft' : b.status ?? existing.status,
        updatedBy: req.dbUser!.email,
        updatedAt: new Date(),
      })
      .where(eq(cmsPages.id, id))
      .returning();

    await logAudit({
      actorUid: req.dbUser!.uid,
      actorEmail: req.dbUser!.email,
      action: publishNow ? 'PUBLISH_CMS_PAGE' : unpublish ? 'UNPUBLISH_CMS_PAGE' : 'UPDATE_CMS_PAGE',
      entityType: 'cms_page',
      entityId: id,
    });

    res.json({ page: updated });
  } catch (error: any) {
    res.status(400).json({ error: error?.message || 'Failed to update page.' });
  }
});

adminRouter.delete('/website-editor/pages/:id', async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    await db.delete(cmsPages).where(eq(cmsPages.id, id));
    await logAudit({
      actorUid: req.dbUser!.uid,
      actorEmail: req.dbUser!.email,
      action: 'DELETE_CMS_PAGE',
      entityType: 'cms_page',
      entityId: id,
    });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Failed to delete page.' });
  }
});

adminRouter.post('/support-tickets/:id/reply', async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const { message, status, assignedStaff } = req.body;
    const [ticket] = await db.select().from(supportTickets).where(eq(supportTickets.id, id)).limit(1);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found.' });

    const nextMessages = message
      ? [
          ...ticket.messages,
          {
            sender: req.dbUser!.fullName || req.dbUser!.email,
            role: 'admin',
            text: String(message).trim(),
            timestamp: new Date().toISOString(),
          },
        ]
      : ticket.messages;

    const [updated] = await db
      .update(supportTickets)
      .set({
        messages: nextMessages,
        status: status || 'Replied',
        assignedStaff: assignedStaff ?? ticket.assignedStaff,
        updatedAt: new Date(),
      })
      .where(eq(supportTickets.id, id))
      .returning();

    res.json({ ticket: updated });
  } catch {
    res.status(500).json({ error: 'Failed to update support ticket.' });
  }
});

adminRouter.get('/invoices', async (_req, res) => {
  res.json({ items: await db.select().from(invoices).where(eq(invoices.isDeleted, false)).orderBy(desc(invoices.issuedAt)) });
});

// Super Admin Encrypted Payment Gateway Configuration
adminRouter.get('/payment-settings', requireAdmin(['super_admin']), async (_req, res) => {
  try {
    const creds = await getRazorpayCredentials();
    const maskedKey = creds.keyId
      ? `${creds.keyId.slice(0, 8)}••••${creds.keyId.slice(-4)}`
      : '';
    res.json({
      configured: Boolean(creds.keyId && creds.keySecret),
      source: creds.source,
      keyIdMasked: maskedKey,
      hasKeySecret: Boolean(creds.keySecret),
      hasWebhookSecret: Boolean(creds.webhookSecret),
    });
  } catch {
    res.status(500).json({ error: 'Failed to inspect payment settings.' });
  }
});

adminRouter.put('/payment-settings', requireAdmin(['super_admin']), async (req: AuthRequest, res) => {
  try {
    const { keyId, keySecret, webhookSecret, clear } = req.body;
    if (clear) {
      await db.delete(siteSettings).where(eq(siteSettings.key, 'paymentGatewayConfig'));
      await logAudit({
        actorUid: req.dbUser!.uid,
        actorEmail: req.dbUser!.email,
        action: 'CLEAR_PAYMENT_GATEWAY',
        entityType: 'site_settings',
        entityId: 'paymentGatewayConfig',
      });
      return res.json({ ok: true, cleared: true });
    }

    const existing = await getRazorpayCredentials();
    const finalKeyId = String(keyId || existing.keyId || '').trim();
    const finalKeySecret = String(keySecret || existing.keySecret || '').trim();
    const finalWebhook = String(webhookSecret || existing.webhookSecret || '').trim();

    if (!finalKeyId || !finalKeySecret) {
      return res.status(400).json({ error: 'Razorpay Key ID and Key Secret are required.' });
    }

    await db
      .insert(siteSettings)
      .values({
        key: 'paymentGatewayConfig',
        value: {
          keyIdEnc: encryptSecret(finalKeyId),
          keySecretEnc: encryptSecret(finalKeySecret),
          webhookSecretEnc: finalWebhook ? encryptSecret(finalWebhook) : '',
          updatedBy: req.dbUser!.email,
          updatedAt: new Date().toISOString(),
        },
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: siteSettings.key,
        set: {
          value: {
            keyIdEnc: encryptSecret(finalKeyId),
            keySecretEnc: encryptSecret(finalKeySecret),
            webhookSecretEnc: finalWebhook ? encryptSecret(finalWebhook) : '',
            updatedBy: req.dbUser!.email,
            updatedAt: new Date().toISOString(),
          },
          updatedAt: new Date(),
        },
      });

    await logAudit({
      actorUid: req.dbUser!.uid,
      actorEmail: req.dbUser!.email,
      action: 'UPDATE_PAYMENT_GATEWAY',
      entityType: 'site_settings',
      entityId: 'paymentGatewayConfig',
      details: { keyIdPrefix: finalKeyId.slice(0, 8) },
    });

    res.json({ ok: true });
  } catch (error) {
    console.error('Save payment settings error:', error);
    res.status(500).json({ error: 'Failed to save encrypted payment settings.' });
  }
});

// ============================================================================
// MODULE 1: PROJECT PAYMENT PLANS, FINAL PAYMENT WORKFLOW, HANDOVER & FINANCE
// ============================================================================
adminRouter.get('/settings/project-payments', async (_req, res) => {
  const [row] = await db
    .select()
    .from(siteSettings)
    .where(eq(siteSettings.key, 'projectPaymentSettings'))
    .limit(1);
  res.json({ settings: row?.value || {} });
});

adminRouter.put('/settings/project-payments', requireAdmin(['super_admin']), async (req: AuthRequest, res) => {
  try {
    const b = req.body;
    const advancePercent = Math.min(100, Math.max(10, Number(b.advancePercent ?? 50)));
    const finalPercent = Math.max(0, 100 - advancePercent);
    if (b.finalPercent !== undefined && advancePercent + Number(b.finalPercent) !== 100) {
      return res.status(400).json({ error: 'Advance % and Final % must total 100%.' });
    }

    const nextVal = {
      defaultPlanType: advancePercent === 100 ? 'full_100' : advancePercent === 50 ? '50_50_split' : 'custom_split',
      advancePercent,
      finalPercent,
      allowFullPayment: b.allowFullPayment !== false,
      enableGstTax: Boolean(b.enableGstTax),
      gstPercent: Number(b.gstPercent ?? 18),
      quotationValidityDays: Math.max(1, Number(b.quotationValidityDays ?? 15)),
      quotationPrefix: String(b.quotationPrefix || 'NTF-QTN').trim().toUpperCase(),
      projectPrefix: String(b.projectPrefix || 'NTF-PRJ').trim().toUpperCase(),
      paymentPrefix: String(b.paymentPrefix || 'NTF-PAY').trim().toUpperCase(),
      invoicePrefix: String(b.invoicePrefix || 'NTF-INV').trim().toUpperCase(),
      receiptPrefix: String(b.receiptPrefix || 'NTF-RCP').trim().toUpperCase(),
      clearancePrefix: String(b.clearancePrefix || 'NTF-CLR').trim().toUpperCase(),
      workOrderPrefix: String(b.workOrderPrefix || 'NTF-WRK').trim().toUpperCase(),
      handoverDownloadExpiryDays: Math.max(1, Number(b.handoverDownloadExpiryDays ?? 30)),
      reminderIntervalsDays: Array.isArray(b.reminderIntervalsDays) ? b.reminderIntervalsDays.map(Number) : [3, 7, 14],
      allowHandoverExceptionBySuperAdmin: b.allowHandoverExceptionBySuperAdmin !== false,
      cancellationRefundPolicy: String(b.cancellationRefundPolicy || ''),
    };

    await db
      .insert(siteSettings)
      .values({ key: 'projectPaymentSettings', value: nextVal, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: siteSettings.key,
        set: { value: nextVal, updatedAt: new Date() },
      });

    await logAudit({
      actorUid: req.dbUser!.uid,
      actorEmail: req.dbUser!.email,
      action: 'UPDATE_PROJECT_PAYMENT_SETTINGS',
      entityType: 'site_settings',
      entityId: 'projectPaymentSettings',
      details: nextVal as unknown as Record<string, unknown>,
    });

    res.json({ settings: nextVal });
  } catch {
    res.status(500).json({ error: 'Failed to update project payment settings.' });
  }
});

adminRouter.get('/settings/project-email-templates', async (_req, res) => {
  const [row] = await db
    .select()
    .from(siteSettings)
    .where(eq(siteSettings.key, 'projectEmailTemplates'))
    .limit(1);
  res.json({ templates: Array.isArray(row?.value) ? row.value : DEFAULT_PROJECT_EMAIL_TEMPLATES });
});

adminRouter.put('/settings/project-email-templates', requireAdmin(['super_admin']), async (req: AuthRequest, res) => {
  try {
    const templates = req.body.templates;
    if (!Array.isArray(templates)) return res.status(400).json({ error: 'Templates array is required.' });
    await db
      .insert(siteSettings)
      .values({ key: 'projectEmailTemplates', value: templates, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: siteSettings.key,
        set: { value: templates, updatedAt: new Date() },
      });

    await logAudit({
      actorUid: req.dbUser!.uid,
      actorEmail: req.dbUser!.email,
      action: 'UPDATE_PROJECT_EMAIL_TEMPLATES',
      entityType: 'site_settings',
      entityId: 'projectEmailTemplates',
    });

    res.json({ templates });
  } catch {
    res.status(500).json({ error: 'Failed to save email templates.' });
  }
});

adminRouter.post('/projects/:id/override-payment-plan', requireAdmin(['super_admin']), async (req: AuthRequest, res) => {
  try {
    const projectId = Number(req.params.id);
    const { advancePercent, allowFullPayment, reason } = req.body;
    if (!String(reason || '').trim()) {
      return res.status(400).json({ error: 'A clear reason is mandatory to override a project payment plan.' });
    }

    const [proj] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
    if (!proj || !proj.quotationId) return res.status(404).json({ error: 'Project or linked quotation not found.' });

    const [quot] = await db.select().from(projectQuotations).where(eq(projectQuotations.id, proj.quotationId)).limit(1);
    if (!quot) return res.status(404).json({ error: 'Quotation not found.' });

    const nextAdvPct = Math.min(100, Math.max(10, Number(advancePercent ?? 50)));
    const nextFinalPct = 100 - nextAdvPct;
    const newAdvInr = Math.round((quot.totalAmountInr * nextAdvPct) / 100);
    const newBalInr = quot.totalAmountInr - newAdvInr;

    await db
      .update(projectQuotations)
      .set({
        advancePercent: nextAdvPct,
        advanceAmountInr: newAdvInr,
        advanceAmountPaise: Math.round(newAdvInr * 100),
        balanceAmountInr: newBalInr,
        balanceAmountPaise: Math.round(newBalInr * 100),
        allowFullPayment: allowFullPayment !== undefined ? Boolean(allowFullPayment) : quot.allowFullPayment,
        planOverrideReason: String(reason).trim(),
        planOverrideBy: req.dbUser!.email,
      })
      .where(eq(projectQuotations.id, quot.id));

    await db.insert(projectPaymentPlans).values({
      projectId: proj.id,
      enquiryId: proj.enquiryId,
      quotationId: quot.id,
      planType: nextAdvPct === 100 ? 'full_100' : nextAdvPct === 50 ? '50_50_split' : 'custom_split',
      advancePercent: nextAdvPct,
      finalPercent: nextFinalPct,
      allowFullPayment: allowFullPayment !== undefined ? Boolean(allowFullPayment) : quot.allowFullPayment,
      isOverride: true,
      overrideReason: String(reason).trim(),
      createdBy: req.dbUser!.email,
    });

    await logAudit({
      actorUid: req.dbUser!.uid,
      actorEmail: req.dbUser!.email,
      action: 'OVERRIDE_PROJECT_PAYMENT_PLAN',
      entityType: 'project',
      entityId: projectId,
      details: { advancePercent: nextAdvPct, finalPercent: nextFinalPct, reason: String(reason).trim() },
    });

    res.json({ ok: true, advancePercent: nextAdvPct, advanceAmountInr: newAdvInr, balanceAmountInr: newBalInr });
  } catch {
    res.status(500).json({ error: 'Failed to override project payment plan.' });
  }
});

adminRouter.post('/projects/:id/request-final-payment', async (req: AuthRequest, res) => {
  try {
    const projectId = Number(req.params.id);
    const [proj] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
    if (!proj) return res.status(404).json({ error: 'Project not found.' });

    const nextUpdates = [
      ...(proj.updates || []),
      {
        id: `u-fin-${Date.now()}`,
        timestamp: new Date().toISOString(),
        author: req.dbUser!.email,
        summary: `Project work completed. Final balance payment of ₹${proj.balanceAmountInr.toLocaleString('en-IN')} requested before handover.`,
      },
    ];

    const [updated] = await db
      .update(projects)
      .set({
        status: proj.balanceAmountInr > 0 ? 'Final Payment Pending' : 'Ready for Handover',
        progressPercent: 100,
        updates: nextUpdates,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, projectId))
      .returning();

    await db
      .update(projectEnquiries)
      .set({ status: updated.status, updatedAt: new Date() })
      .where(eq(projectEnquiries.id, updated.enquiryId));

    const [enq] = await db.select().from(projectEnquiries).where(eq(projectEnquiries.id, updated.enquiryId)).limit(1);
    if (updated.userId) {
      await createNotification({
        userId: updated.userId,
        title: `Final Payment Required — ${updated.projectCode}`,
        message: `Project engineering is complete. Remaining balance ₹${updated.balanceAmountInr.toLocaleString('en-IN')} unlocks deliverable handover.`,
        link: '/my-account/project-enquiries',
      });
    }

    if (enq?.customerEmail && updated.balanceAmountInr > 0) {
      await dispatchLifecycleEmail({
        userId: updated.userId,
        projectId: updated.id,
        enquiryId: updated.enquiryId,
        recipientEmail: enq.customerEmail,
        eventType: 'project_ready_for_final_payment',
        vars: {
          customerName: enq.customerName,
          projectCode: updated.projectCode,
          balanceAmountInr: updated.balanceAmountInr,
          finalPercent: 50,
        },
      });
    }

    await logAudit({
      actorUid: req.dbUser!.uid,
      actorEmail: req.dbUser!.email,
      action: 'REQUEST_FINAL_PAYMENT',
      entityType: 'project',
      entityId: projectId,
      details: { balanceAmountInr: updated.balanceAmountInr },
    });

    res.json({ project: updated });
  } catch {
    res.status(500).json({ error: 'Failed to mark project awaiting final payment.' });
  }
});

adminRouter.post('/projects/:id/send-payment-reminder', async (req: AuthRequest, res) => {
  try {
    const projectId = Number(req.params.id);
    const [proj] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
    if (!proj) return res.status(404).json({ error: 'Project not found.' });

    const [enq] = await db.select().from(projectEnquiries).where(eq(projectEnquiries.id, proj.enquiryId)).limit(1);
    if (proj.userId) {
      await createNotification({
        userId: proj.userId,
        title: `Payment Reminder — ${proj.projectCode}`,
        message: `Pending balance: ₹${proj.balanceAmountInr.toLocaleString('en-IN')}. Complete payment in your dashboard.`,
        link: '/my-account/project-enquiries',
      });
    }

    const emailResult = enq?.customerEmail
      ? await dispatchLifecycleEmail({
          userId: proj.userId,
          projectId: proj.id,
          enquiryId: proj.enquiryId,
          recipientEmail: enq.customerEmail,
          eventType: 'final_payment_reminder',
          vars: {
            customerName: enq.customerName,
            projectCode: proj.projectCode,
            balanceAmountInr: proj.balanceAmountInr,
          },
        })
      : null;

    res.json({ ok: true, emailResult });
  } catch {
    res.status(500).json({ error: 'Failed to send payment reminder.' });
  }
});

adminRouter.post('/projects/:id/authorize-handover-exception', requireAdmin(['super_admin']), async (req: AuthRequest, res) => {
  try {
    const projectId = Number(req.params.id);
    const reason = String(req.body.reason || '').trim();
    if (!reason) {
      return res.status(400).json({ error: 'Mandatory audit reason is required to authorize a handover exception.' });
    }

    const [proj] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
    if (!proj) return res.status(404).json({ error: 'Project not found.' });

    const nowIso = new Date().toISOString();
    const [updated] = await db
      .update(projects)
      .set({
        handoverExceptionAuthorized: true,
        handoverExceptionReason: reason,
        handoverExceptionBy: req.dbUser!.email,
        handoverExceptionAt: nowIso,
        handoverUnlocked: true,
        paymentClearanceStatus: proj.balanceAmountInr === 0 ? 'Cleared' : 'Override Authorized',
        updatedAt: new Date(),
      })
      .where(eq(projects.id, projectId))
      .returning();

    await logAudit({
      actorUid: req.dbUser!.uid,
      actorEmail: req.dbUser!.email,
      action: 'AUTHORIZE_HANDOVER_EXCEPTION',
      entityType: 'project',
      entityId: projectId,
      details: { reason, balanceAmountInr: proj.balanceAmountInr },
    });

    res.json({ project: updated });
  } catch {
    res.status(500).json({ error: 'Failed to authorize handover exception.' });
  }
});

adminRouter.post(
  '/projects/:id/handover-documents',
  handoverUpload.single('file'),
  async (req: AuthRequest, res) => {
    try {
      const projectId = Number(req.params.id);
      const [proj] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
      if (!proj) return res.status(404).json({ error: 'Project not found.' });
      if (!req.file) return res.status(400).json({ error: 'Deliverable file is required.' });

      if (!isSupabaseStorageConfigured()) {
        return res.status(503).json({ error: 'Supabase Storage is not configured for handover deliverables.' });
      }
      const sbHandover = await uploadProjectDocumentToSupabase({
        buffer: req.file.buffer,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype || 'application/octet-stream',
        ownerUid: proj.customerId || proj.projectCode,
        folder: `${proj.projectCode}-handover`,
      });

      const [cfgRow] = await db
        .select()
        .from(siteSettings)
        .where(eq(siteSettings.key, 'projectPaymentSettings'))
        .limit(1);
      const expiryDays = Number((cfgRow?.value as { handoverDownloadExpiryDays?: number })?.handoverDownloadExpiryDays || 30);
      const expiresAt = new Date(Date.now() + expiryDays * 86400000);
      const downloadToken = crypto.randomBytes(24).toString('hex');

      const [doc] = await db
        .insert(projectHandoverDocuments)
        .values({
          projectId,
          userId: proj.userId,
          title: String(req.body.title || req.file.originalname).trim(),
          category: String(req.body.category || 'source_code').trim(),
          fileName: req.file.originalname,
          storagePath: sbHandover.storagePath,
          fileSizeBytes: req.file.size,
          versionLabel: String(req.body.versionLabel || 'v1.0').trim(),
          notes: String(req.body.notes || '').trim(),
          downloadToken,
          tokenExpiresAt: expiresAt,
          uploadedBy: req.dbUser!.email,
        })
        .returning();

      const [enq] = await db.select().from(projectEnquiries).where(eq(projectEnquiries.id, proj.enquiryId)).limit(1);
      if (proj.userId) {
        await createNotification({
          userId: proj.userId,
          title: `Deliverable Uploaded — ${proj.projectCode}`,
          message: `${doc.title} (${doc.versionLabel}) uploaded. ${
            proj.handoverUnlocked ? 'Ready to download in your dashboard.' : 'Available once final balance payment is cleared.'
          }`,
          link: '/my-account/project-enquiries',
        });
      }

      if (enq?.customerEmail && proj.handoverUnlocked) {
        await dispatchLifecycleEmail({
          userId: proj.userId,
          projectId: proj.id,
          enquiryId: proj.enquiryId,
          recipientEmail: enq.customerEmail,
          eventType: 'handover_ready',
          vars: { customerName: enq.customerName, projectCode: proj.projectCode },
        });
      }

      res.status(201).json({ document: doc });
    } catch (error: any) {
      res.status(400).json({ error: error?.message || 'Failed to upload handover document.' });
    }
  }
);

adminRouter.delete('/projects/:id/handover-documents/:docId', async (req: AuthRequest, res) => {
  try {
    const docId = Number(req.params.docId);
    await db
      .update(projectHandoverDocuments)
      .set({ isDeleted: true })
      .where(eq(projectHandoverDocuments.id, docId));
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Failed to remove handover document.' });
  }
});

adminRouter.post('/projects/:id/delivery', async (req: AuthRequest, res) => {
  try {
    const projectId = Number(req.params.id);
    const [proj] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
    if (!proj) return res.status(404).json({ error: 'Project not found.' });

    const { courierName, trackingNumber, trackingUrl, dispatchDate, expectedDeliveryDate, actualDeliveryDate, dispatchNotes } = req.body;
    const [record] = await db
      .insert(projectDeliveryRecords)
      .values({
        projectId,
        courierName: String(courierName || '').trim(),
        trackingNumber: String(trackingNumber || '').trim(),
        trackingUrl: String(trackingUrl || '').trim(),
        dispatchDate: String(dispatchDate || new Date().toISOString().slice(0, 10)),
        expectedDeliveryDate: String(expectedDeliveryDate || ''),
        actualDeliveryDate: String(actualDeliveryDate || ''),
        dispatchNotes: String(dispatchNotes || '').trim(),
        updatedBy: req.dbUser!.email,
      })
      .returning();

    if (!proj.handoverUnlocked && !proj.handoverExceptionAuthorized) {
      return res.status(400).json({
        error: 'Remaining 50% final payment must be verified before marking project dispatched/delivered.',
      });
    }

    const nextStatus = actualDeliveryDate ? 'Delivered / Handed Over' : 'Ready for Handover';
    const [updatedProj] = await db
      .update(projects)
      .set({
        trackingCourier: record.courierName || proj.trackingCourier,
        trackingId: record.trackingNumber || proj.trackingId,
        trackingUrl: record.trackingUrl || proj.trackingUrl,
        status: nextStatus,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, projectId))
      .returning();

    const [enq] = await db
      .update(projectEnquiries)
      .set({ status: nextStatus, updatedAt: new Date() })
      .where(eq(projectEnquiries.id, proj.enquiryId))
      .returning();
    if (enq?.customerEmail) {
      await dispatchLifecycleEmail({
        userId: proj.userId,
        projectId: proj.id,
        enquiryId: proj.enquiryId,
        recipientEmail: enq.customerEmail,
        eventType: 'project_dispatched',
        vars: {
          customerName: enq.customerName,
          projectCode: proj.projectCode,
          courierName: record.courierName,
          trackingNumber: record.trackingNumber,
        },
      });
      syncProjectPaymentAndHandoverToSupabase({
        projectCode: updatedProj.projectCode,
        registrationNumber: enq.enquiryNumber,
        handoverUnlocked: updatedProj.handoverUnlocked,
      }).catch(() => {});
    }

    res.status(201).json({ deliveryRecord: record, project: updatedProj });
  } catch {
    res.status(500).json({ error: 'Failed to log project dispatch record.' });
  }
});

adminRouter.get('/project-finance', async (req, res) => {
  try {
    const startDate = String(req.query.startDate || '').trim();
    const endDate = String(req.query.endDate || '').trim();
    const status = String(req.query.status || '').trim();
    const paymentStatus = String(req.query.paymentStatus || '').trim();
    const engineer = String(req.query.engineer || '').trim();
    const search = String(req.query.search || '').trim().toLowerCase();

    const [allProjects, allEnquiries, allQuotations, allPayments, allReceipts, allCerts] = await Promise.all([
      db.select().from(projects).where(eq(projects.isDeleted, false)).orderBy(desc(projects.createdAt)),
      db.select().from(projectEnquiries).where(eq(projectEnquiries.isDeleted, false)),
      db.select().from(projectQuotations),
      db.select().from(payments).where(eq(payments.entityType, 'project_quotation')),
      db.select().from(paymentReceipts).where(eq(paymentReceipts.entityType, 'project_quotation')),
      db.select().from(paymentClearanceCertificates),
    ]);

    const enqById = Object.fromEntries(allEnquiries.map((e) => [e.id, e]));
    const qById = Object.fromEntries(allQuotations.map((q) => [q.id, q]));

    const filtered = allProjects.filter((p) => {
      const enq = enqById[p.enquiryId];
      const created = new Date(p.createdAt).toISOString().slice(0, 10);
      if (startDate && created < startDate) return false;
      if (endDate && created > endDate) return false;
      if (status && p.status !== status) return false;
      if (paymentStatus && p.paymentClearanceStatus !== paymentStatus) return false;
      if (engineer && p.assignedEngineer !== engineer) return false;
      if (search) {
        const hay = `${p.projectCode} ${p.title} ${enq?.customerName || ''} ${enq?.customerEmail || ''} ${enq?.enquiryNumber || ''}`.toLowerCase();
        if (!hay.includes(search)) return false;
      }
      return true;
    });

    const totalQuotedInr = filtered.reduce((s, p) => s + p.totalAmountInr, 0);
    const totalCollectedInr = filtered.reduce((s, p) => s + p.paidAmountInr, 0);
    const totalOutstandingInr = filtered.reduce((s, p) => s + p.balanceAmountInr, 0);
    const clearedProjectsCount = filtered.filter((p) => p.paymentClearanceStatus === 'Cleared').length;
    const awaitingFinalCount = filtered.filter(
      (p) => p.balanceAmountInr > 0 && p.status.includes('Awaiting Final Payment')
    ).length;

    const rows = filtered.map((p) => {
      const enq = enqById[p.enquiryId] || null;
      const quot = p.quotationId ? qById[p.quotationId] || null : null;
      const cert = allCerts.find((c) => c.projectId === p.id) || null;
      return {
        ...p,
        customerName: enq?.customerName || '',
        customerEmail: enq?.customerEmail || '',
        enquiryNumber: enq?.enquiryNumber || '',
        quotationNumber: quot?.quotationNumber || '',
        advancePercent: quot?.advancePercent ?? 50,
        clearanceCertificate: cert,
      };
    });

    res.json({
      summary: {
        projectCount: filtered.length,
        totalQuotedInr,
        totalCollectedInr,
        totalOutstandingInr,
        clearedProjectsCount,
        awaitingFinalCount,
      },
      projects: rows,
      payments: allPayments,
      receipts: allReceipts,
      clearanceCertificates: allCerts,
    });
  } catch (error) {
    console.error('Project finance error:', error);
    res.status(500).json({ error: 'Failed to load project finance data.' });
  }
});

adminRouter.get('/export/project-finance', async (_req, res) => {
  try {
    const [allProjects, allEnquiries] = await Promise.all([
      db.select().from(projects).where(eq(projects.isDeleted, false)).orderBy(desc(projects.createdAt)),
      db.select().from(projectEnquiries),
    ]);
    const enqById = Object.fromEntries(allEnquiries.map((e) => [e.id, e]));
    const csv = toCsv(
      ['Project Code', 'Title', 'Customer', 'Email', 'Engineer', 'Total INR', 'Paid INR', 'Balance INR', 'Clearance Status', 'Project Status', 'Completion Cert'],
      allProjects.map((p) => {
        const enq = enqById[p.enquiryId];
        return [
          p.projectCode,
          p.title,
          enq?.customerName || '',
          enq?.customerEmail || '',
          p.assignedEngineer,
          p.totalAmountInr,
          p.paidAmountInr,
          p.balanceAmountInr,
          p.paymentClearanceStatus,
          p.status,
          p.completionCertificateNumber || '',
        ];
      })
    );
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="nexustekfusion-project-finance.csv"');
    res.send(csv);
  } catch {
    res.status(500).json({ error: 'Failed to export project finance CSV.' });
  }
});

adminRouter.patch('/drone-repairs/:id', async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const { status, assignedEngineer, inspectionChargeInr, repairQuotationInr, repairQuotationNotes, adminNotes } = req.body;
    const [existing] = await db.select().from(droneRepairBookings).where(eq(droneRepairBookings.id, id)).limit(1);
    if (!existing) return res.status(404).json({ error: 'Drone repair booking not found.' });

    const nextHistory = [
      ...(existing.statusHistory || []),
      {
        status: status || existing.status,
        timestamp: new Date().toISOString(),
        note: adminNotes || repairQuotationNotes || `Updated by ${req.dbUser!.email}`,
        actor: req.dbUser!.email,
      },
    ];

    const [updated] = await db
      .update(droneRepairBookings)
      .set({
        status: status ?? existing.status,
        assignedEngineer: assignedEngineer ?? existing.assignedEngineer,
        inspectionChargeInr: inspectionChargeInr !== undefined ? Number(inspectionChargeInr) : existing.inspectionChargeInr,
        repairQuotationInr: repairQuotationInr !== undefined ? Number(repairQuotationInr) : existing.repairQuotationInr,
        repairQuotationNotes: repairQuotationNotes ?? existing.repairQuotationNotes,
        adminNotes: adminNotes ?? existing.adminNotes,
        statusHistory: nextHistory,
        updatedAt: new Date(),
      })
      .where(eq(droneRepairBookings.id, id))
      .returning();

    res.json({ booking: updated });
  } catch {
    res.status(500).json({ error: 'Failed to update drone repair booking.' });
  }
});

// ============================================================================
// PROJECT DEVELOPMENT UPGRADE — TWO-50% INSTALLMENTS, PAYMENTS, REMINDERS & OPTIONAL ATTACHMENTS
// ============================================================================

const projectUpgradeAttachmentUpload = createMemoryUploadMiddleware(
  ['.pdf', '.png', '.jpg', '.jpeg', '.webp', '.doc', '.docx', '.xls', '.xlsx', '.csv', '.zip', '.txt', '.stl', '.step', '.dwg', '.dxf'],
  50
);

adminRouter.post('/projects', async (req: AuthRequest, res) => {
  try {
    const b = req.body || {};
    let enquiryId = b.enquiryId ? Number(b.enquiryId) : 0;

    if (!enquiryId) {
      const targetUserId = b.userId ? Number(b.userId) : null;
      let targetUser: typeof users.$inferSelect | undefined;
      if (targetUserId) {
        [targetUser] = await db.select().from(users).where(eq(users.id, targetUserId)).limit(1);
      } else if (b.customerEmail) {
        [targetUser] = await db
          .select()
          .from(users)
          .where(eq(users.email, String(b.customerEmail).trim().toLowerCase()))
          .limit(1);
      }
      const customerEmail = String(b.customerEmail || targetUser?.email || '').trim();
      const customerName = String(b.customerName || targetUser?.fullName || customerEmail || 'Customer').trim();
      const title = String(b.title || b.projectTitle || '').trim();
      if (!title || !customerEmail) {
        return res.status(400).json({ error: 'Project title and customer email (or enquiryId) are required.' });
      }
      const [createdEnq] = await db
        .insert(projectEnquiries)
        .values({
          enquiryNumber: generateCode('NTF-ENQ'),
          userId: targetUser?.id ?? null,
          customerId: targetUser?.uid || String(b.customerId || '').trim(),
          customerName,
          customerEmail,
          customerPhone: String(b.customerPhone || targetUser?.mobile || '').trim(),
          projectTitle: title,
          engineeringBranch: String(b.engineeringBranch || b.category || 'Engineering Prototype').trim(),
          engineeringDomain: String(b.engineeringDomain || b.category || 'Engineering Prototype').trim(),
          projectCategory: String(b.category || 'Engineering Prototype').trim(),
          projectType: String(b.projectType || 'Prototype').trim(),
          projectDescription: String(b.description || title).trim(),
          assignedEngineer: String(b.assignedEngineer || 'Engineering Team').trim(),
          attachments: [],
          billingAddress: {},
          deliveryAddress: {},
          status: 'Approved',
          acceptedTerms: true,
          acceptedPrivacyPolicy: true,
        })
        .returning();
      enquiryId = createdEnq.id;
    }

    const totalCost = Math.max(0, Math.round(Number(b.totalAmountInr || b.budgetInr || 0)));
    const projectRow = await ensureProjectForEnquiry({
      enquiryId,
      totalAmountInr: totalCost > 0 ? totalCost : undefined,
      initialStatus: 'Awaiting Advance Payment',
      actorEmail: req.dbUser!.email,
    });

    let paymentSetup = null;
    if (totalCost > 0) {
      paymentSetup = await setupProjectPaymentAndInstallments({
        projectId: projectRow.id,
        totalAmountInr: totalCost,
        advanceDueDate: String(b.advanceDueDate || ''),
        finalDueDate: String(b.finalDueDate || ''),
        notes: String(b.notes || ''),
        actorEmail: req.dbUser!.email,
        sendNotificationEmail: b.sendNotificationEmail !== false,
      });
    }

    let agreement = null;
    if (b.autoGenerateAgreement !== false) {
      agreement = await autoGenerateAgreementOnProjectApproval({
        projectId: projectRow.id,
        enquiryId,
        actorEmail: req.dbUser!.email,
        status: 'Awaiting Acceptance',
      }).catch(() => null);
    }

    res.status(201).json({
      project: paymentSetup?.project || projectRow,
      paymentSummary: paymentSetup?.paymentSummary || null,
      installments: paymentSetup?.installments || [],
      agreement,
    });
  } catch (error: any) {
    console.error('Admin create project error:', error);
    res.status(500).json({ error: error?.message || 'Failed to create project.' });
  }
});

adminRouter.get('/projects/:id/payments', async (req, res) => {
  try {
    const projectId = Number(req.params.id);
    const [proj] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
    if (!proj) return res.status(404).json({ error: 'Project not found.' });

    const [summaryRows, instRows, txRows, remRows, attRows, agRows] = await Promise.all([
      db.select().from(projectPayments).where(eq(projectPayments.projectId, projectId)).limit(1),
      db.select().from(paymentInstallments).where(eq(paymentInstallments.projectId, projectId)).orderBy(asc(paymentInstallments.installmentNumber)),
      db.select().from(paymentTransactions).where(eq(paymentTransactions.projectId, projectId)).orderBy(desc(paymentTransactions.createdAt)),
      db.select().from(paymentReminders).where(eq(paymentReminders.projectId, projectId)).orderBy(desc(paymentReminders.sentAt)),
      db.select().from(projectAttachments).where(eq(projectAttachments.projectId, projectId)).orderBy(desc(projectAttachments.createdAt)),
      db.select().from(projectAgreements).where(and(eq(projectAgreements.projectId, projectId), eq(projectAgreements.isDeleted, false))).orderBy(desc(projectAgreements.createdAt)),
    ]);

    res.json({
      project: proj,
      paymentSummary: summaryRows[0] || null,
      installments: instRows,
      transactions: txRows,
      reminders: remRows,
      attachments: attRows,
      agreements: agRows,
    });
  } catch (error) {
    console.error('Get project payments error:', error);
    res.status(500).json({ error: 'Failed to load project payment ledger.' });
  }
});

adminRouter.post('/projects/:id/payment-request', async (req: AuthRequest, res) => {
  try {
    const projectId = Number(req.params.id);
    const b = req.body || {};
    const totalAmountInr = Math.round(Number(b.totalAmountInr || 0));
    if (!Number.isFinite(totalAmountInr) || totalAmountInr < 1) {
      return res.status(400).json({ error: 'Valid totalAmountInr (>= ₹1) is required.' });
    }

    const result = await setupProjectPaymentAndInstallments({
      projectId,
      totalAmountInr,
      advanceDueDate: String(b.advanceDueDate || ''),
      finalDueDate: String(b.finalDueDate || ''),
      notes: String(b.notes || ''),
      actorEmail: req.dbUser!.email,
      sendNotificationEmail: b.sendNotificationEmail !== false,
    });

    await logAudit({
      actorUid: req.dbUser!.uid,
      actorEmail: req.dbUser!.email,
      action: 'SETUP_PROJECT_PAYMENT_REQUEST',
      entityType: 'project',
      entityId: projectId,
      details: { totalAmountInr, first: result.installments[0]?.amountInr, second: result.installments[1]?.amountInr },
    });
    emitAdminStreamEvent({ type: 'project', action: 'payment_request_updated', id: result.project.projectCode });

    res.status(201).json(result);
  } catch (error: any) {
    console.error('Setup project payment request error:', error);
    res.status(500).json({ error: error?.message || 'Failed to configure project payment request.' });
  }
});

adminRouter.post('/projects/:id/installments/:installmentNumber/payment-link', async (req: AuthRequest, res) => {
  try {
    const projectId = Number(req.params.id);
    const installmentNumber = Number(req.params.installmentNumber) === 2 ? 2 : 1;
    const [proj] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
    if (!proj) return res.status(404).json({ error: 'Project not found.' });

    const [inst] = await db
      .select()
      .from(paymentInstallments)
      .where(and(eq(paymentInstallments.projectId, projectId), eq(paymentInstallments.installmentNumber, installmentNumber)))
      .limit(1);
    if (!inst) {
      return res.status(404).json({ error: `Installment #${installmentNumber} has not been initialized yet. Enter total project cost first.` });
    }
    if (inst.status === 'Paid') {
      return res.status(400).json({ error: `Installment #${installmentNumber} is already paid.` });
    }

    const [enq] = await db.select().from(projectEnquiries).where(eq(projectEnquiries.id, proj.enquiryId)).limit(1);
    const customerEmail = String(req.body?.customerEmail || enq?.customerEmail || '').trim();
    const customerName = String(req.body?.customerName || enq?.customerName || 'Customer').trim();
    const customerPhone = String(req.body?.customerPhone || enq?.customerPhone || '').trim();
    const payableInr = Math.max(1, Number(inst.amountInr || 0) - Number(inst.paidAmountInr || 0));
    const refCode = `${proj.projectCode}-INST${installmentNumber}-${Date.now().toString(36).toUpperCase()}`;
    const appBase = (process.env.APP_URL || '').replace(/\/+$/, '');
    const creds = await getRazorpayCredentials();

    let paymentLinkId = '';
    let shortUrl = '';
    let rzpStatus = 'created';
    let linkMode: 'live_razorpay' | 'test_mode' | 'dashboard_checkout' = 'test_mode';

    if (creds.keyId && creds.keySecret && customerEmail) {
      const linkResp = await createRazorpayPaymentLink({
        amountInr: payableInr,
        referenceId: refCode,
        description: `${inst.title} — ${proj.projectCode}`,
        customerName,
        customerEmail,
        customerPhone,
        callbackUrl: appBase ? `${appBase}/my-account?tab=projects&installment=${inst.id}` : undefined,
        notes: {
          entityType: 'project_installment',
          entityId: String(inst.id),
          projectId: String(proj.id),
          projectCode: proj.projectCode,
          installmentNumber: String(installmentNumber),
        },
      });
      paymentLinkId = linkResp.paymentLinkId;
      shortUrl = linkResp.shortUrl;
      rzpStatus = linkResp.status || 'created';
      linkMode = linkResp.mode;
    } else {
      // Trackable checkout link when Razorpay live/test API keys are not configured in environment
      paymentLinkId = `plink_sandbox_${crypto.randomBytes(6).toString('hex')}`;
      shortUrl = `${appBase}/my-account?tab=projects&payInstallment=${inst.id}`;
      linkMode = 'dashboard_checkout';
    }

    const [savedLink] = await db
      .insert(razorpayPaymentLinks)
      .values({
        paymentLinkId,
        shortUrl,
        referenceId: refCode,
        entityType: 'project_installment',
        entityId: inst.id,
        projectId: proj.id,
        projectCode: proj.projectCode,
        customerId: proj.customerId,
        userId: proj.userId,
        customerName,
        customerEmail,
        customerPhone,
        amountInr: payableInr,
        amountPaise: payableInr * 100,
        paymentStage: installmentNumber === 1 ? 'advance' : 'final',
        description: `${inst.title} — ${proj.title}`,
        status: rzpStatus,
        createdBy: req.dbUser!.email,
        metadata: { mode: linkMode, installmentNumber },
      })
      .returning();

    const [updatedInst] = await db
      .update(paymentInstallments)
      .set({
        razorpayPaymentLinkId: paymentLinkId,
        paymentLinkUrl: shortUrl,
        updatedAt: new Date(),
      })
      .where(eq(paymentInstallments.id, inst.id))
      .returning();

    syncPaymentInstallmentToSupabase(updatedInst).catch(() => {});
    syncRazorpayPaymentLinkToSupabase({
      sourceId: savedLink.id,
      paymentLinkId: savedLink.paymentLinkId,
      shortUrl: savedLink.shortUrl,
      referenceId: savedLink.referenceId,
      entityType: savedLink.entityType,
      entityId: savedLink.entityId,
      projectCode: savedLink.projectCode,
      customerId: savedLink.customerId,
      userUid: savedLink.customerId,
      customerName: savedLink.customerName,
      customerEmail: savedLink.customerEmail,
      customerPhone: savedLink.customerPhone,
      amountInr: savedLink.amountInr,
      amountPaise: savedLink.amountPaise,
      paymentStage: savedLink.paymentStage,
      description: savedLink.description,
      status: savedLink.status,
      createdBy: savedLink.createdBy,
    }).catch(() => {});

    if (proj.userId) {
      await createNotification({
        userId: proj.userId,
        title: `Payment Link Ready: ${inst.title}`,
        message: `Pay ₹${payableInr.toLocaleString('en-IN')} for ${proj.projectCode} using ${shortUrl}`,
        link: '/my-account?tab=projects',
      }).catch(() => {});
    }

    if (customerEmail && req.body?.sendEmail !== false) {
      await dispatchLifecycleEmail({
        userId: proj.userId,
        projectId: proj.id,
        enquiryId: proj.enquiryId,
        recipientEmail: customerEmail,
        eventType: 'installment_payment_link',
        vars: {
          customerName,
          projectCode: proj.projectCode,
          installmentTitle: inst.title,
          amountInr: payableInr.toLocaleString('en-IN'),
          paymentUrl: shortUrl,
        },
      }).catch(() => {});
    }

    res.status(201).json({
      installment: updatedInst,
      paymentLink: savedLink,
      mode: linkMode,
    });
  } catch (error: any) {
    console.error('Create installment payment link error:', error);
    res.status(400).json({ error: error?.message || 'Failed to generate installment payment link.' });
  }
});

adminRouter.post('/projects/:id/installments/:installmentNumber/manual-payment', async (req: AuthRequest, res) => {
  try {
    const projectId = Number(req.params.id);
    const installmentNumber = Number(req.params.installmentNumber) === 2 ? 2 : 1;
    const b = req.body || {};
    const amountInr = Math.round(Number(b.amountInr || 0));
    const isFailure = b.isFailure === true || b.status === 'Failed';
    if (!isFailure && (!Number.isFinite(amountInr) || amountInr < 1)) {
      return res.status(400).json({ error: 'Valid payment amount (>= ₹1) is required.' });
    }

    const result = await recordInstallmentPayment({
      projectId,
      installmentNumber,
      amountInr,
      paymentMethod: String(b.paymentMethod || 'manual_bank_transfer').trim(),
      transactionRef: String(b.transactionRef || '').trim(),
      razorpayPaymentId: String(b.razorpayPaymentId || '').trim(),
      recordedBy: req.dbUser!.email,
      notes: String(b.notes || 'Recorded manually by Admin').trim(),
      isFailure,
      failureReason: String(b.failureReason || '').trim(),
    });

    await logAudit({
      actorUid: req.dbUser!.uid,
      actorEmail: req.dbUser!.email,
      action: isFailure ? 'RECORD_FAILED_PROJECT_PAYMENT' : 'RECORD_MANUAL_PROJECT_PAYMENT',
      entityType: 'project',
      entityId: projectId,
      details: { installmentNumber, amountInr, transactionRef: result.transaction.transactionRef },
    });
    emitAdminStreamEvent({ type: 'project', action: 'installment_payment_recorded', id: result.project.projectCode });

    res.status(201).json(result);
  } catch (error: any) {
    console.error('Manual installment payment error:', error);
    res.status(400).json({ error: error?.message || 'Failed to record payment.' });
  }
});

adminRouter.post('/projects/:id/installments/:installmentNumber/remind', async (req: AuthRequest, res) => {
  try {
    const projectId = Number(req.params.id);
    const installmentNumber = Number(req.params.installmentNumber) === 2 ? 2 : 1;
    const reminder = await sendInstallmentPaymentReminder({
      projectId,
      installmentNumber,
      reminderType: 'manual',
      actorEmail: req.dbUser!.email,
    });
    res.status(201).json({ reminder });
  } catch (error: any) {
    console.error('Send installment reminder error:', error);
    res.status(400).json({ error: error?.message || 'Failed to send payment reminder.' });
  }
});

adminRouter.post(
  '/projects/:id/attachments',
  projectUpgradeAttachmentUpload.array('files', 10),
  async (req: AuthRequest, res) => {
    try {
      const projectId = Number(req.params.id);
      const [proj] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
      if (!proj) return res.status(404).json({ error: 'Project not found.' });

      const files = (req.files as Express.Multer.File[]) || [];
      if (files.length === 0) {
        return res.json({ attachments: [], message: 'No attachments uploaded (attachments are optional).' });
      }
      if (!isSupabaseStorageConfigured()) {
        return res.status(503).json({
          error: 'Supabase Storage is not configured. Configure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to store attachments.',
        });
      }

      const category = String(req.body?.category || 'project_document').trim();
      const inserted = [];
      for (const f of files) {
        const up = await uploadProjectAttachmentToSupabase({
          buffer: f.buffer,
          originalName: f.originalname,
          mimeType: f.mimetype || 'application/octet-stream',
          ownerUid: proj.customerId || proj.projectCode,
          folder: proj.projectCode,
        });
        const [att] = await db
          .insert(projectAttachments)
          .values({
            projectId: proj.id,
            enquiryId: proj.enquiryId,
            userId: proj.userId,
            fileName: f.originalname,
            storageBucket: up.bucket,
            storagePath: up.storagePath,
            mimeType: f.mimetype || 'application/octet-stream',
            fileSizeBytes: f.size,
            category,
            uploadedBy: req.dbUser!.email,
          })
          .returning();
        inserted.push(att);
        syncProjectAttachmentRecordToSupabase({
          projectId: proj.id,
          enquiryId: proj.enquiryId,
          fileName: att.fileName,
          storageBucket: att.storageBucket,
          storagePath: att.storagePath,
          mimeType: att.mimeType,
          fileSizeBytes: att.fileSizeBytes,
          category: att.category,
          uploadedBy: att.uploadedBy,
        }).catch(() => {});
      }

      res.status(201).json({ attachments: inserted });
    } catch (error: any) {
      console.error('Upload project attachments error:', error);
      res.status(500).json({ error: error?.message || 'Failed to upload project attachments.' });
    }
  }
);

adminRouter.delete('/projects/:id/attachments/:attId', async (req: AuthRequest, res) => {
  try {
    const projectId = Number(req.params.id);
    const attId = Number(req.params.attId);
    const [updated] = await db
      .delete(projectAttachments)
      .where(and(eq(projectAttachments.id, attId), eq(projectAttachments.projectId, projectId)))
      .returning();
    if (!updated) return res.status(404).json({ error: 'Attachment not found.' });
    res.json({ removed: true, attachment: updated });
  } catch {
    res.status(500).json({ error: 'Failed to remove attachment.' });
  }
});
