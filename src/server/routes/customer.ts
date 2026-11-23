import { Router } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { and, desc, eq, gte, inArray, isNull, or, sql } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import {
  ADMIN_ROLES_SET,
  listActiveCustomerProfilesForAuth,
  normalizeMobile,
} from '../../db/users.ts';
import {
  b2bEnquiries,
  customerActivityLogs,
  customerAddresses,
  customerCarts,
  customers,
  dronePilots,
  droneRepairBookings,
  enquiryAttachments,
  farmers,
  invoices,
  notifications,
  paymentClearanceCertificates,
  paymentInstallments,
  paymentReceipts,
  paymentReminders,
  paymentTransactions,
  payments,
  pcbEnquiries,
  printingMachines,
  printingMaterials,
  printingOrders,
  productEnquiries,
  productReviews,
  products,
  projectAcceptances,
  projectAgreements,
  projectAttachments,
  projectDeliveryRecords,
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
  recordStatusHistory,
  siteSettings,
  storeOrders,
  supportTickets,
  users,
  wishlists,
} from '../../db/schema.ts';
import { dispatchAdminNotificationEmail, dispatchLifecycleEmail } from '../email.ts';
import {
  ADMIN_ROLES,
  ADMIN_SESSION_COOKIE,
  AuthRequest,
  requireAuth,
  requireCloudDatabase,
  USER_SESSION_COOKIE,
} from '../../middleware/auth.ts';
import { analyzeAndSliceModel } from '../slicer.ts';
import { createRazorpayOrder, getRazorpayCredentials, verifyRazorpaySignature } from '../razorpay.ts';
import {
  downloadFromSupabaseStorage,
  downloadPrintingFileFromSupabase,
  getSigned3DModelUrl,
  getSignedPrivateStorageUrl,
  isSupabaseStorageConfigured,
  upload3DModelToSupabase,
  uploadAgreementPdfToSupabase,
  uploadPcbFileToSupabase,
  uploadPrivateBufferToSupabaseStorage,
  uploadProjectAttachmentToSupabase,
  uploadProjectDocumentToSupabase,
} from '../../lib/supabase-admin.ts';
import {
  createOriginal3DModelMemoryUploadMiddleware,
  getPaymentStatusDisplay,
  recordPrintingDownloadLog,
  runSingleUploadWithJsonErrors,
} from '../printing-security.ts';
import {
  deleteCustomerAddressFromSupabase,
  syncActivityLogToSupabase,
  syncB2bEnquiryToSupabase,
  syncCartToSupabase,
  syncCustomerAddressToSupabase,
  syncEnquiryAttachmentToSupabase,
  syncInvoiceToSupabase,
  syncNotificationToSupabase,
  syncPaymentToSupabase,
  syncPcbEnquiryToSupabase,
  syncPrintingOrderToSupabase,
  syncProductReviewToSupabase,
  syncProjectAgreementToSupabase,
  syncStoreOrderToSupabase,
  syncSupportTicketToSupabase,
  syncWishlistToSupabase,
} from '../supabase-ecommerce.ts';
import {
  syncProjectAttachmentRecordToSupabase,
  syncProjectMessageToSupabase,
  syncProjectPaymentAndHandoverToSupabase,
  syncProjectQuotationToSupabase,
  syncProjectRegistrationToSupabase,
} from '../supabase-projects.ts';
import {
  createPublicCustomerRecord,
  findPublicCustomerForUser,
  isPublicCustomersSchemaReady,
  permanentlyDeleteCustomerTransaction,
  updatePublicCustomerRecord,
} from '../supabase-customers.ts';
import { notifyAdmins, reconcileProjectQuotationPayment } from '../project-lifecycle.ts';
import {
  buildAgreementModelForContext,
  recordInstallmentPayment,
} from '../project-upgrade-service.ts';
import {
  generateAndStoreInstallmentReceiptPdf,
  generateAndStoreInvoicePdf,
  type ProjectAgreementDocumentModel,
  renderProjectAgreementPdfBuffer,
} from '../pdf-storage.ts';
import { recordEntityStatusChange } from '../record-history.ts';
import { emitAdminStreamEvent } from '../admin-realtime.ts';
import { emitCustomerStreamEvent, subscribeCustomerStream } from '../customer-realtime.ts';
import {
  clearGuestCartState,
  getCustomerCartState,
  mergeGuestCartIntoCustomer,
  saveCustomerCartState,
} from '../cart-service.ts';
import {
  createOrSyncServiceRecord,
  listActiveServicesCatalog,
  listCustomerServiceRecords,
} from '../service-records-service.ts';
import {
  createMemoryUploadMiddleware,
  createNotification,
  generateCode,
  isValidIndianPin,
  UPLOADS_ROOT,
} from '../utils.ts';

export const customerRouter = Router();
customerRouter.use((req, res, next) => {
  if (req.path.startsWith('/admin')) return next();
  return requireCloudDatabase(req, res, next);
});

const DEFAULT_NOTIFICATION_PREFS = {
  emailUpdates: true,
  orderAlerts: true,
  quotationAlerts: true,
  promotionalEmails: false,
  whatsappAlerts: true,
};

const VALID_CUSTOMER_TYPES = new Set(['Individual', 'Business', 'Academic', 'FPO / Agri']);

function sanitizeUserForClient(u: any, activeCustomerId?: string) {
  if (!u) return u;
  const { passwordHash, passwordConfigured, ...rest } = u;
  const customerId = ADMIN_ROLES_SET.has(u.role)
    ? undefined
    : activeCustomerId || u.customerId || (u.uid?.startsWith('NTF-CUST-') ? u.uid : undefined);
  const registrationDate = u.registrationDate
    ? String(u.registrationDate)
    : u.createdAt
    ? new Date(u.createdAt).toISOString()
    : undefined;
  const lastLoginAt = u.lastLoginAt ? new Date(u.lastLoginAt).toISOString() : null;
  return {
    ...rest,
    ...(customerId ? { customerId } : {}),
    profilePhotoUrl: u.profilePhotoUrl || '',
    customerType: u.customerType || 'Individual',
    billingDetails: u.billingDetails && typeof u.billingDetails === 'object' ? u.billingDetails : {},
    accountStatus: u.accountStatus || 'Active',
    ...(registrationDate ? { registrationDate } : {}),
    lastLoginAt,
    notificationPreferences: {
      ...DEFAULT_NOTIFICATION_PREFS,
      ...(u.notificationPreferences && typeof u.notificationPreferences === 'object'
        ? u.notificationPreferences
        : {}),
    },
  };
}

async function logCustomerActivity(
  reqUser: { id: number; uid: string; email?: string; customerId?: string },
  activeCustomerId: string | undefined,
  action: string,
  entityType: string,
  entityId: string | number,
  details: Record<string, any> = {}
) {
  const customerCode = activeCustomerId || reqUser.customerId || reqUser.uid || '';
  await db
    .insert(customerActivityLogs)
    .values({
      userId: reqUser.id,
      customerId: customerCode,
      email: reqUser.email || '',
      category: entityType,
      action,
      entityType,
      entityId: String(entityId),
      description: `${action.replace(/_/g, ' ').toLowerCase()} (${String(entityId)})`,
      metadata: details,
    })
    .catch(() => {});
  syncActivityLogToSupabase({
    userUid: reqUser.uid,
    customerId: customerCode,
    action,
    entityType,
    entityId: String(entityId),
    details,
  }).catch(() => {});
}

// Cart hydration/summary helpers live in ../cart-service.ts

const modelUpload = createOriginal3DModelMemoryUploadMiddleware(80);
const projectUpload = createMemoryUploadMiddleware(
  [
    '.pdf',
    '.doc',
    '.docx',
    '.ppt',
    '.pptx',
    '.xls',
    '.xlsx',
    '.csv',
    '.txt',
    '.png',
    '.jpg',
    '.jpeg',
    '.webp',
    '.mp4',
    '.mov',
    '.avi',
    '.mkv',
    '.zip',
    '.rar',
    '.stl',
    '.obj',
    '.3mf',
    '.step',
    '.stp',
    '.iges',
    '.igs',
    '.dwg',
    '.dxf',
    '.gbr',
    '.kicad_pcb',
    '.sch',
    '.brd',
  ],
  80
);
const pcbUpload = createMemoryUploadMiddleware(
  ['.zip', '.rar', '.gbr', '.gerber', '.pdf', '.csv', '.xlsx', '.png', '.jpg', '.jpeg'],
  40
);
const b2bUpload = createMemoryUploadMiddleware(
  ['.pdf', '.doc', '.docx', '.xlsx', '.csv', '.zip', '.png', '.jpg', '.jpeg'],
  40
);
const agreementSignedUpload = createMemoryUploadMiddleware(['.pdf'], 25);

// Profile & Unified Customer Dashboard Summary
customerRouter.get('/me', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.dbUser!.id;
    const [
      addresses,
      myStoreOrders,
      myPrintOrders,
      myEnquiries,
      myProjects,
      myPcb,
      myB2b,
      myRepairs,
      myPayments,
      myInvoices,
      myReceipts,
      myClearances,
      myWorkOrders,
      myHandoverDocs,
      myWishlist,
      myNotifications,
      myTickets,
      myFarmerRows,
      myPilotRows,
      myProductEnquiries,
      myReviews,
      myActivityLogs,
      cartState,
      myAgreements,
      myPaymentLinks,
      myRecordHistory,
      serviceCatalog,
      myServiceRecords,
      archivedProjEnq,
      archivedProdEnq,
      archivedPcbEnq,
      archivedB2bEnq,
      archivedTickets,
    ] = await Promise.all([
      db.select().from(customerAddresses).where(eq(customerAddresses.userId, userId)).orderBy(desc(customerAddresses.isDefault)),
      db.select().from(storeOrders).where(and(eq(storeOrders.userId, userId), eq(storeOrders.isDeleted, false))).orderBy(desc(storeOrders.createdAt)),
      db.select().from(printingOrders).where(and(eq(printingOrders.userId, userId), eq(printingOrders.isDeleted, false))).orderBy(desc(printingOrders.createdAt)),
      db.select().from(projectEnquiries).where(and(eq(projectEnquiries.userId, userId), eq(projectEnquiries.isDeleted, false))).orderBy(desc(projectEnquiries.createdAt)),
      db.select().from(projects).where(and(eq(projects.userId, userId), eq(projects.isDeleted, false))).orderBy(desc(projects.createdAt)),
      db.select().from(pcbEnquiries).where(and(eq(pcbEnquiries.userId, userId), eq(pcbEnquiries.isDeleted, false))).orderBy(desc(pcbEnquiries.createdAt)),
      db.select().from(b2bEnquiries).where(and(eq(b2bEnquiries.userId, userId), eq(b2bEnquiries.isDeleted, false))).orderBy(desc(b2bEnquiries.createdAt)),
      db.select().from(droneRepairBookings).where(eq(droneRepairBookings.userId, userId)).orderBy(desc(droneRepairBookings.createdAt)),
      db.select().from(payments).where(eq(payments.userId, userId)).orderBy(desc(payments.createdAt)),
      db.select().from(invoices).where(and(eq(invoices.userId, userId), eq(invoices.isDeleted, false))).orderBy(desc(invoices.issuedAt)),
      db.select().from(paymentReceipts).where(eq(paymentReceipts.userId, userId)).orderBy(desc(paymentReceipts.issuedAt)),
      db.select().from(paymentClearanceCertificates).where(eq(paymentClearanceCertificates.userId, userId)).orderBy(desc(paymentClearanceCertificates.issuedAt)),
      db.select().from(projectWorkOrders).where(eq(projectWorkOrders.userId, userId)).orderBy(desc(projectWorkOrders.issuedAt)),
      db.select().from(projectHandoverDocuments).where(and(eq(projectHandoverDocuments.userId, userId), eq(projectHandoverDocuments.isDeleted, false))).orderBy(desc(projectHandoverDocuments.createdAt)),
      db
        .select({ wishlist: wishlists, product: products })
        .from(wishlists)
        .innerJoin(products, eq(wishlists.productId, products.id))
        .where(eq(wishlists.userId, userId)),
      db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt)).limit(30),
      db.select().from(supportTickets).where(and(eq(supportTickets.userId, userId), eq(supportTickets.isDeleted, false))).orderBy(desc(supportTickets.createdAt)),
      db.select().from(farmers).where(eq(farmers.userId, userId)).limit(1),
      db.select().from(dronePilots).where(eq(dronePilots.userId, userId)).limit(1),
      db
        .select()
        .from(productEnquiries)
        .where(and(eq(productEnquiries.isDeleted, false), or(eq(productEnquiries.userId, userId), eq(productEnquiries.email, req.dbUser!.email))))
        .orderBy(desc(productEnquiries.createdAt)),
      db.select().from(productReviews).where(eq(productReviews.userId, userId)).orderBy(desc(productReviews.createdAt)),
      db.select().from(customerActivityLogs).where(eq(customerActivityLogs.userId, userId)).orderBy(desc(customerActivityLogs.createdAt)).limit(50),
      getCustomerCartState(userId),
      db.select().from(projectAgreements).where(and(eq(projectAgreements.userId, userId), eq(projectAgreements.isDeleted, false))).orderBy(desc(projectAgreements.createdAt)),
      db.select().from(razorpayPaymentLinks).where(eq(razorpayPaymentLinks.userId, userId)).orderBy(desc(razorpayPaymentLinks.createdAt)),
      db.select().from(recordStatusHistory).where(eq(recordStatusHistory.userId, userId)).orderBy(desc(recordStatusHistory.actionDate)).limit(60),
      listActiveServicesCatalog(),
      listCustomerServiceRecords(userId),
      db.select().from(projectEnquiries).where(and(eq(projectEnquiries.userId, userId), eq(projectEnquiries.isDeleted, true))).orderBy(desc(projectEnquiries.archivedAt)),
      db.select().from(productEnquiries).where(and(eq(productEnquiries.isDeleted, true), or(eq(productEnquiries.userId, userId), eq(productEnquiries.email, req.dbUser!.email)))).orderBy(desc(productEnquiries.archivedAt)),
      db.select().from(pcbEnquiries).where(and(eq(pcbEnquiries.userId, userId), eq(pcbEnquiries.isDeleted, true))).orderBy(desc(pcbEnquiries.archivedAt)),
      db.select().from(b2bEnquiries).where(and(eq(b2bEnquiries.userId, userId), eq(b2bEnquiries.isDeleted, true))).orderBy(desc(b2bEnquiries.archivedAt)),
      db.select().from(supportTickets).where(and(eq(supportTickets.userId, userId), eq(supportTickets.isDeleted, true))).orderBy(desc(supportTickets.archivedAt)),
    ]);

    const enquiryIds = myEnquiries.map((e) => e.id);
    const projectIds = myProjects.map((p) => p.id);
    const [
      allQuotations,
      allPlans,
      allMilestones,
      allAcceptances,
      allDeliveries,
      allMessages,
      allProjPayments,
      allInstallments,
      allTransactions,
      allReminders,
      allProjAttachments,
    ] = await Promise.all([
      enquiryIds.length > 0 ? db.select().from(projectQuotations).orderBy(desc(projectQuotations.createdAt)) : Promise.resolve([]),
      enquiryIds.length > 0 ? db.select().from(projectPaymentPlans).orderBy(desc(projectPaymentPlans.createdAt)) : Promise.resolve([]),
      enquiryIds.length > 0 ? db.select().from(projectPaymentMilestones) : Promise.resolve([]),
      enquiryIds.length > 0 ? db.select().from(projectAcceptances).orderBy(desc(projectAcceptances.acceptedAt)) : Promise.resolve([]),
      projectIds.length > 0 ? db.select().from(projectDeliveryRecords).orderBy(desc(projectDeliveryRecords.createdAt)) : Promise.resolve([]),
      enquiryIds.length > 0 ? db.select().from(projectMessages).orderBy(desc(projectMessages.createdAt)) : Promise.resolve([]),
      projectIds.length > 0 ? db.select().from(projectPayments).where(inArray(projectPayments.projectId, projectIds)) : Promise.resolve([]),
      projectIds.length > 0 ? db.select().from(paymentInstallments).where(inArray(paymentInstallments.projectId, projectIds)) : Promise.resolve([]),
      projectIds.length > 0 ? db.select().from(paymentTransactions).where(inArray(paymentTransactions.projectId, projectIds)).orderBy(desc(paymentTransactions.createdAt)) : Promise.resolve([]),
      projectIds.length > 0 ? db.select().from(paymentReminders).where(inArray(paymentReminders.projectId, projectIds)).orderBy(desc(paymentReminders.sentAt)) : Promise.resolve([]),
      enquiryIds.length > 0 || projectIds.length > 0
        ? db.select().from(projectAttachments).orderBy(desc(projectAttachments.createdAt))
        : Promise.resolve([]),
    ]);

    // Customers MUST NOT see unpublished/Draft quotations
    const myQuotations = allQuotations.filter(
      (q) => enquiryIds.includes(q.enquiryId) && q.status !== 'Draft' && (q.approvedByAdmin !== false || q.status !== 'Draft')
    );
    const myQuoteIds = new Set(myQuotations.map((q) => q.id));
    const myPaymentPlans = allPlans.filter((p) => enquiryIds.includes(p.enquiryId));
    const myPaymentMilestones = allMilestones.filter((m) => myQuoteIds.has(m.quotationId));
    const myAcceptances = allAcceptances.filter((a) => enquiryIds.includes(a.enquiryId));
    const myDeliveryRecords = allDeliveries.filter((d) => projectIds.includes(d.projectId));
    const myProjectMessages = allMessages
      .filter((m) => enquiryIds.includes(m.enquiryId))
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const myProjectAttachments = allProjAttachments.filter(
      (att) =>
        (att.projectId !== null && projectIds.includes(att.projectId)) ||
        (att.enquiryId !== null && enquiryIds.includes(att.enquiryId))
    );

    // Gate storagePath exposure for unpaid locked handover documents
    const projectMap = Object.fromEntries(myProjects.map((p) => [p.id, p]));
    const safeHandoverDocs = myHandoverDocs.map((doc) => {
      const proj = projectMap[doc.projectId];
      const unlocked = Boolean(proj && (proj.handoverUnlocked || proj.handoverExceptionAuthorized));
      return {
        ...doc,
        storagePath: unlocked ? doc.storagePath : '',
        downloadToken: unlocked ? doc.downloadToken : '',
        unlocked,
      };
    });

    const enrichedPrintOrders = myPrintOrders.map((po) => {
      const payDisp = getPaymentStatusDisplay(po.paymentStatus, po.refundStatus);
      const downloadUnlocked = po.customerDownloadEnabled !== false;
      return {
        ...po,
        fileStoragePath: downloadUnlocked ? po.fileStoragePath : '',
        downloadUnlocked,
        downloadLockReason:
          po.customerDownloadEnabled === false
            ? 'Customer download disabled by administrator.'
            : '',
        paymentLabel: payDisp.label,
        paymentWarning: payDisp.warning,
      };
    });

    const profilesData = !ADMIN_ROLES.has(req.dbUser!.role)
      ? await listActiveCustomerProfilesForAuth({
          authUserId: req.dbUser!.authUserId || '',
          email: req.dbUser!.email,
        }).catch(() => null)
      : null;

    const safeUser = sanitizeUserForClient(req.dbUser!, req.activeCustomerId);

    res.json({
      user: safeUser,
      settings: {
        notificationPreferences: safeUser.notificationPreferences,
      },
      availableProfiles: profilesData?.activeProfiles || [],
      addresses,
      cartItems: cartState.items,
      cartRawItems: cartState.rawItems,
      cartSummary: cartState.summary,
      storeOrders: myStoreOrders,
      printingOrders: enrichedPrintOrders,
      projectEnquiries: myEnquiries,
      quotations: myQuotations,
      projects: myProjects,
      projectMessages: myProjectMessages,
      paymentPlans: myPaymentPlans,
      paymentMilestones: myPaymentMilestones,
      acceptances: myAcceptances,
      receipts: myReceipts,
      clearanceCertificates: myClearances,
      workOrders: myWorkOrders,
      handoverDocuments: safeHandoverDocs,
      deliveryRecords: myDeliveryRecords,
      pcbEnquiries: myPcb,
      b2bEnquiries: myB2b,
      droneRepairs: myRepairs,
      serviceCatalog,
      serviceRecords: myServiceRecords,
      archivedEnquiries: {
        projectEnquiries: archivedProjEnq,
        productEnquiries: archivedProdEnq,
        pcbEnquiries: archivedPcbEnq,
        b2bEnquiries: archivedB2bEnq,
        supportTickets: archivedTickets,
      },
      payments: myPayments,
      invoices: myInvoices,
      agreements: myAgreements,
      paymentLinks: myPaymentLinks,
      recordHistory: myRecordHistory,
      wishlist: myWishlist.map((w) => w.product),
      notifications: myNotifications,
      supportTickets: myTickets,
      activityLogs: myActivityLogs,
      farmerProfile: myFarmerRows[0] || null,
      pilotProfile: myPilotRows[0] || null,
      productEnquiries: myProductEnquiries,
      myReviews,
      projectPayments: allProjPayments,
      paymentInstallments: allInstallments,
      paymentTransactions: allTransactions,
      paymentReminders: allReminders,
      projectAttachments: myProjectAttachments,
    });
  } catch (error) {
    console.error('Profile summary error:', error);
    res.status(500).json({ error: 'Failed to load account dashboard.' });
  }
});

customerRouter.put('/me', requireAuth, async (req: AuthRequest, res) => {
  try {
    const activeCode = req.activeCustomerId || req.dbUser!.customerId || '';
    if (
      req.body?.customerId !== undefined &&
      String(req.body.customerId).trim() &&
      activeCode &&
      String(req.body.customerId).trim().toUpperCase() !== activeCode.toUpperCase()
    ) {
      return res.status(403).json({
        error: 'Customer ID is permanent and read-only. You cannot modify your Customer ID.',
      });
    }
    if (
      req.body?.email !== undefined &&
      String(req.body.email).trim() &&
      String(req.body.email).trim().toLowerCase() !== String(req.dbUser!.email || '').trim().toLowerCase()
    ) {
      return res.status(403).json({
        error: 'Verified email address cannot be modified from profile settings.',
      });
    }
    if (
      req.body?.role !== undefined ||
      req.body?.isActive !== undefined ||
      req.body?.accountStatus !== undefined ||
      req.body?.uid !== undefined ||
      req.body?.authUserId !== undefined
    ) {
      return res.status(403).json({
        error: 'Account role and system status fields cannot be modified.',
      });
    }

    const {
      fullName,
      mobile,
      companyOrCollege,
      fullAddress,
      city,
      state,
      pinCode,
      profilePhotoUrl,
      customerType,
      billingDetails,
    } = req.body;
    const cleanFullName = String(fullName ?? req.dbUser!.fullName).trim();
    const cleanMobile = normalizeMobile(mobile ?? req.dbUser!.mobile);
    const cleanCompany = String(companyOrCollege ?? req.dbUser!.companyOrCollege).trim();

    if (cleanFullName.length < 2) {
      return res.status(400).json({ error: 'Full Name must be at least 2 characters.' });
    }
    if (cleanMobile && !/^\+?\d{10,15}$/.test(cleanMobile)) {
      return res.status(400).json({ error: 'Please enter a valid 10-digit mobile number.' });
    }
    if (pinCode !== undefined && String(pinCode).trim() && !/^[0-9]{4,10}$/.test(String(pinCode).trim())) {
      return res.status(400).json({ error: 'PIN Code must be 4 to 10 numeric digits.' });
    }

    const rawPhoto = profilePhotoUrl !== undefined ? String(profilePhotoUrl || '').trim() : undefined;
    if (rawPhoto && rawPhoto.length > 500 && !rawPhoto.startsWith('data:image/')) {
      return res.status(400).json({ error: 'Profile photo URL is too long.' });
    }

    const resolvedCustomerType =
      customerType !== undefined && VALID_CUSTOMER_TYPES.has(String(customerType).trim())
        ? String(customerType).trim()
        : undefined;

    const cleanBilling =
      billingDetails !== undefined && billingDetails && typeof billingDetails === 'object'
        ? {
            gstin: String(billingDetails.gstin || '').trim().toUpperCase().slice(0, 20),
            billingName: String(billingDetails.billingName || '').trim().slice(0, 120),
            billingEmail: String(billingDetails.billingEmail || '').trim().toLowerCase().slice(0, 120),
            pan: String(billingDetails.pan || '').trim().toUpperCase().slice(0, 16),
            billingAddress: String(billingDetails.billingAddress || '').trim().slice(0, 300),
          }
        : undefined;

    const publicReady = await isPublicCustomersSchemaReady();
    const existingPublic = publicReady
      ? await findPublicCustomerForUser({
          customerId: req.activeCustomerId || req.dbUser!.customerId,
          authUserId: req.dbUser!.authUserId,
          uid: req.dbUser!.uid,
          id: req.dbUser!.id,
          email: req.dbUser!.email,
        })
      : null;

    const updatePayload: Record<string, any> = {
      fullName: cleanFullName,
      mobile: cleanMobile,
      companyOrCollege: cleanCompany,
      updatedAt: new Date(),
    };
    if (fullAddress !== undefined) updatePayload.fullAddress = String(fullAddress || '').trim();
    if (city !== undefined) updatePayload.city = String(city || '').trim();
    if (state !== undefined) updatePayload.state = String(state || '').trim();
    if (pinCode !== undefined) updatePayload.pinCode = String(pinCode || '').trim();
    if (rawPhoto !== undefined) updatePayload.profilePhotoUrl = rawPhoto;
    if (resolvedCustomerType !== undefined) updatePayload.customerType = resolvedCustomerType;
    if (cleanBilling !== undefined) updatePayload.billingDetails = cleanBilling;

    if (req.body?.notificationPreferences && typeof req.body.notificationPreferences === 'object') {
      updatePayload.notificationPreferences = {
        ...DEFAULT_NOTIFICATION_PREFS,
        ...(req.dbUser!.notificationPreferences || {}),
        emailUpdates: Boolean(req.body.notificationPreferences.emailUpdates ?? true),
        orderAlerts: Boolean(req.body.notificationPreferences.orderAlerts ?? true),
        quotationAlerts: Boolean(req.body.notificationPreferences.quotationAlerts ?? true),
        promotionalEmails: Boolean(req.body.notificationPreferences.promotionalEmails ?? false),
        whatsappAlerts: Boolean(req.body.notificationPreferences.whatsappAlerts ?? true),
      };
    }

    const [updated] = await db
      .update(users)
      .set(updatePayload)
      .where(eq(users.id, req.dbUser!.id))
      .returning();

    // Mirror to local web_platform.customers table as well
    if (req.dbUser!.role === 'customer') {
      const custPatch: Record<string, any> = {
        fullName: cleanFullName,
        phoneNumber: cleanMobile,
        companyOrCollege: cleanCompany,
        updatedAt: new Date(),
      };
      if (fullAddress !== undefined) custPatch.fullAddress = String(fullAddress || '').trim();
      if (city !== undefined) custPatch.city = String(city || '').trim();
      if (state !== undefined) custPatch.state = String(state || '').trim();
      if (pinCode !== undefined) custPatch.pinCode = String(pinCode || '').trim();
      if (rawPhoto !== undefined) custPatch.profilePhotoUrl = rawPhoto;
      if (resolvedCustomerType !== undefined) custPatch.customerType = resolvedCustomerType;
      if (cleanBilling !== undefined) custPatch.billingDetails = cleanBilling;
      await db
        .update(customers)
        .set(custPatch)
        .where(
          activeCode
            ? eq(customers.customerId, activeCode)
            : eq(customers.userId, req.dbUser!.id)
        )
        .catch(() => {});
    }

    if (publicReady) {
      if (existingPublic) {
        await updatePublicCustomerRecord(existingPublic.id, {
          fullName: cleanFullName,
          phoneNumber: cleanMobile,
          companyOrCollege: cleanCompany,
          ...(fullAddress !== undefined ? { fullAddress: String(fullAddress || '').trim() } : {}),
          ...(city !== undefined ? { city: String(city || '').trim() } : {}),
          ...(state !== undefined ? { state: String(state || '').trim() } : {}),
          ...(pinCode !== undefined ? { pinCode: String(pinCode || '').trim() } : {}),
          ...(rawPhoto !== undefined ? { profilePhotoUrl: rawPhoto } : {}),
          ...(resolvedCustomerType !== undefined ? { customerType: resolvedCustomerType } : {}),
          ...(cleanBilling !== undefined ? { billingDetails: cleanBilling } : {}),
        }).catch(() => {});
      } else if (req.dbUser!.role === 'customer') {
        await createPublicCustomerRecord({
          customerId: req.activeCustomerId || (req.dbUser!.uid.startsWith('NTF-CUST-') ? req.dbUser!.uid : undefined),
          authUserId: req.dbUser!.authUserId,
          userUid: req.dbUser!.uid,
          webUserId: req.dbUser!.id,
          fullName: cleanFullName,
          email: req.dbUser!.email,
          phoneNumber: cleanMobile,
          companyOrCollege: cleanCompany,
          fullAddress: fullAddress !== undefined ? String(fullAddress || '').trim() : updated.fullAddress,
          city: city !== undefined ? String(city || '').trim() : updated.city,
          state: state !== undefined ? String(state || '').trim() : updated.state,
          pinCode: pinCode !== undefined ? String(pinCode || '').trim() : updated.pinCode,
          profilePhotoUrl: rawPhoto ?? updated.profilePhotoUrl,
          customerType: resolvedCustomerType ?? updated.customerType,
          billingDetails: cleanBilling ?? (updated.billingDetails as any),
          accountStatus: updated.accountStatus || 'Active',
        }).catch(() => {});
      }
    }

    await logCustomerActivity(
      req.dbUser!,
      existingPublic?.customerId || req.activeCustomerId,
      'PROFILE_UPDATED',
      'customer_profile',
      req.dbUser!.id,
      { fullName: cleanFullName, city: updated.city, customerType: updated.customerType }
    );

    res.json({
      user: sanitizeUserForClient(updated, existingPublic?.customerId || req.activeCustomerId),
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile.' });
  }
});

// Notification Preferences & Account Settings
customerRouter.put('/me/settings', requireAuth, async (req: AuthRequest, res) => {
  try {
    const incoming = req.body?.notificationPreferences || req.body || {};
    const mergedPrefs = {
      ...DEFAULT_NOTIFICATION_PREFS,
      ...(req.dbUser!.notificationPreferences || {}),
      emailUpdates: Boolean(incoming.emailUpdates ?? req.dbUser!.notificationPreferences?.emailUpdates ?? true),
      orderAlerts: Boolean(incoming.orderAlerts ?? req.dbUser!.notificationPreferences?.orderAlerts ?? true),
      quotationAlerts: Boolean(incoming.quotationAlerts ?? req.dbUser!.notificationPreferences?.quotationAlerts ?? true),
      promotionalEmails: Boolean(incoming.promotionalEmails ?? req.dbUser!.notificationPreferences?.promotionalEmails ?? false),
      whatsappAlerts: Boolean(incoming.whatsappAlerts ?? req.dbUser!.notificationPreferences?.whatsappAlerts ?? true),
    };

    const [updated] = await db
      .update(users)
      .set({ notificationPreferences: mergedPrefs, updatedAt: new Date() })
      .where(eq(users.id, req.dbUser!.id))
      .returning();

    const activeCode = req.activeCustomerId || req.dbUser!.customerId;
    if (activeCode) {
      await db
        .update(customers)
        .set({ notificationPreferences: mergedPrefs, updatedAt: new Date() })
        .where(eq(customers.customerId, activeCode))
        .catch(() => {});
    }

    await logCustomerActivity(
      req.dbUser!,
      activeCode,
      'SETTINGS_UPDATED',
      'settings',
      req.dbUser!.id,
      { notificationPreferences: mergedPrefs }
    );

    res.json({
      notificationPreferences: mergedPrefs,
      user: sanitizeUserForClient(updated, activeCode),
    });
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({ error: 'Failed to save account settings.' });
  }
});

// Customer passwords are completely removed (Email + OTP authentication only)
customerRouter.post('/me/password', (_req, res) => {
  res.status(410).json({
    error: 'Customer password management has been removed. Your account uses passwordless Email OTP authentication.',
    code: 'EMAIL_OTP_ONLY',
  });
});

// Self-service Customer Account Deletion (preserves orders & invoices; Customer ID is never reused)
customerRouter.delete('/me', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (ADMIN_ROLES.has(req.dbUser!.role)) {
      return res.status(403).json({
        error: 'Administrator accounts cannot be self-deleted from the customer endpoint.',
      });
    }

    const activeCustomerId = req.activeCustomerId || req.dbUser!.customerId || req.dbUser!.uid;
    const confirmId = String(req.body?.confirmCustomerId || '').trim().toUpperCase();
    if (confirmId && activeCustomerId && confirmId !== activeCustomerId.toUpperCase()) {
      return res.status(400).json({
        error: 'Confirmation Customer ID does not match your active account.',
      });
    }

    const targetKey = activeCustomerId || String(req.dbUser!.id);
    const result = await permanentlyDeleteCustomerTransaction({
      rawKey: targetKey,
      actor: {
        id: req.dbUser!.id,
        uid: req.dbUser!.uid,
        email: req.dbUser!.email,
        role: req.dbUser!.role,
      },
      reason: String(req.body?.reason || 'Customer requested self-service account deletion').slice(0, 300),
      allowSelfDelete: true,
    });

    const isHttps = Boolean(
      req.secure ||
        String(req.headers['x-forwarded-proto'] || '').toLowerCase() === 'https' ||
        (process.env.APP_URL || '').startsWith('https://')
    );
    const clearOpts = {
      httpOnly: true,
      sameSite: (isHttps ? 'none' : 'lax') as 'none' | 'lax',
      secure: isHttps,
      path: '/',
    };
    res.clearCookie(USER_SESSION_COOKIE, clearOpts);
    res.clearCookie(ADMIN_SESSION_COOKIE, clearOpts);

    return res.json({
      ok: true,
      deletedCustomerId: result.customerCode,
      preservedSummary: result.summaryCounts,
      message: 'Your customer account has been deleted. Existing invoices and order records remain archived.',
    });
  } catch (error: any) {
    console.error('Self-delete customer error:', error);
    return res.status(400).json({ error: error?.message || 'Unable to delete customer account.' });
  }
});

// Persistent Customer Cart Sync (Supabase + PostgreSQL) with full product hydration & summary
customerRouter.get('/cart', requireAuth, async (req: AuthRequest, res) => {
  try {
    const state = await getCustomerCartState(req.dbUser!.id);
    res.json(state);
  } catch (error) {
    console.error('Load saved cart error:', error);
    res.status(500).json({ error: 'Failed to load saved cart.' });
  }
});

customerRouter.put('/cart', requireAuth, async (req: AuthRequest, res) => {
  try {
    const incoming = Array.isArray(req.body?.items) ? req.body.items : [];
    const couponCode = req.body?.couponCode !== undefined ? String(req.body.couponCode || '') : undefined;
    const saved = await saveCustomerCartState({
      userId: req.dbUser!.id,
      userUid: req.dbUser!.uid,
      customerId: req.activeCustomerId || req.dbUser!.customerId,
      rawItems: incoming,
      couponCode,
    });
    res.json(saved);
  } catch (error) {
    console.error('Save cart error:', error);
    res.status(500).json({ error: 'Failed to save cart.' });
  }
});

customerRouter.post('/cart/items', requireAuth, async (req: AuthRequest, res) => {
  try {
    const productId = Number(req.body?.productId || req.body?.product?.id || 0);
    const qty = Math.max(1, Math.floor(Number(req.body?.qty || 1)));
    const variant = req.body?.variant ? String(req.body.variant) : undefined;
    const color = req.body?.color ? String(req.body.color) : undefined;
    if (!Number.isFinite(productId) || productId <= 0) {
      return res.status(400).json({ error: 'Valid productId is required.' });
    }
    const current = await getCustomerCartState(req.dbUser!.id);
    const saved = await saveCustomerCartState({
      userId: req.dbUser!.id,
      userUid: req.dbUser!.uid,
      customerId: req.activeCustomerId || req.dbUser!.customerId,
      rawItems: [...current.rawItems, { productId, qty, variant, color }],
      couponCode: current.summary.couponCode,
    });
    res.json(saved);
  } catch (error) {
    console.error('Cart add item error:', error);
    res.status(500).json({ error: 'Failed to add item to cart.' });
  }
});

customerRouter.patch('/cart/items', requireAuth, async (req: AuthRequest, res) => {
  try {
    const productId = Number(req.body?.productId || 0);
    const qty = Math.floor(Number(req.body?.qty || 0));
    const variant = req.body?.variant ? String(req.body.variant) : undefined;
    const color = req.body?.color ? String(req.body.color) : undefined;
    if (!Number.isFinite(productId) || productId <= 0) {
      return res.status(400).json({ error: 'Valid productId is required.' });
    }
    const current = await getCustomerCartState(req.dbUser!.id);
    const nextRaw =
      qty <= 0
        ? current.rawItems.filter(
            (i) => !(i.productId === productId && i.variant === variant && i.color === color)
          )
        : current.rawItems.map((i) =>
            i.productId === productId && i.variant === variant && i.color === color
              ? { ...i, qty }
              : i
          );
    const saved = await saveCustomerCartState({
      userId: req.dbUser!.id,
      userUid: req.dbUser!.uid,
      customerId: req.activeCustomerId || req.dbUser!.customerId,
      rawItems: nextRaw,
      couponCode: current.summary.couponCode,
    });
    res.json(saved);
  } catch (error) {
    console.error('Cart patch item error:', error);
    res.status(500).json({ error: 'Failed to update cart item.' });
  }
});

customerRouter.delete('/cart/items', requireAuth, async (req: AuthRequest, res) => {
  try {
    const clearAll = req.query.clear === '1' || req.query.clear === 'true';
    const productId = Number(req.query.productId || req.body?.productId || 0);
    const variant = req.query.variant
      ? String(req.query.variant)
      : req.body?.variant
        ? String(req.body.variant)
        : undefined;
    const color = req.query.color
      ? String(req.query.color)
      : req.body?.color
        ? String(req.body.color)
        : undefined;
    const current = await getCustomerCartState(req.dbUser!.id);
    const nextRaw =
      clearAll || !productId
        ? []
        : current.rawItems.filter(
            (i) => !(i.productId === productId && i.variant === variant && i.color === color)
          );
    const saved = await saveCustomerCartState({
      userId: req.dbUser!.id,
      userUid: req.dbUser!.uid,
      customerId: req.activeCustomerId || req.dbUser!.customerId,
      rawItems: nextRaw,
      couponCode: clearAll ? '' : current.summary.couponCode,
    });
    res.json(saved);
  } catch (error) {
    console.error('Cart delete item error:', error);
    res.status(500).json({ error: 'Failed to remove cart item.' });
  }
});

customerRouter.post('/cart/merge', requireAuth, async (req: AuthRequest, res) => {
  try {
    const extraItems = Array.isArray(req.body?.extraItems) ? req.body.extraItems : [];
    const merged = await mergeGuestCartIntoCustomer({
      req,
      res,
      userId: req.dbUser!.id,
      userUid: req.dbUser!.uid,
      customerId: req.activeCustomerId || req.dbUser!.customerId,
      extraItems,
    });
    res.json(merged);
  } catch (error) {
    console.error('Cart merge error:', error);
    res.status(500).json({ error: 'Failed to merge guest cart.' });
  }
});

// Real-time Customer Dashboard SSE Stream (fallback alongside Supabase Realtime)
customerRouter.get('/customer/stream', requireAuth, (req: AuthRequest, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  res.write(
    `data: ${JSON.stringify({
      type: 'profile',
      action: 'connected',
      timestamp: new Date().toISOString(),
    })}\n\n`
  );

  const unsubscribe = subscribeCustomerStream(req.dbUser!.id, (evt) => {
    try {
      res.write(`data: ${JSON.stringify(evt)}\n\n`);
    } catch {
      // Ignore closed stream writes
    }
  });

  const keepAlive = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch {
      // Ignore closed stream writes
    }
  }, 25000);

  req.on('close', () => {
    clearInterval(keepAlive);
    unsubscribe();
    res.end();
  });
});

// Customer Unified Service Records (3D Printing, PCB, Projects, Drone Repair, Custom Requests)
customerRouter.get('/service-records', requireAuth, async (req: AuthRequest, res) => {
  try {
    const [records, catalog] = await Promise.all([
      listCustomerServiceRecords(req.dbUser!.id),
      listActiveServicesCatalog(),
    ]);
    res.json({ serviceRecords: records, services: catalog });
  } catch (error) {
    console.error('List service records error:', error);
    res.status(500).json({ error: 'Failed to load service records.' });
  }
});

customerRouter.post('/service-records', requireAuth, async (req: AuthRequest, res) => {
  try {
    const b = req.body || {};
    const serviceName = String(b.serviceName || '').trim();
    const category = String(b.category || 'Engineering').trim();
    const specifications = String(b.specifications || '').trim();
    const description = String(b.description || '').trim();
    if (serviceName.length < 3) {
      return res.status(400).json({ error: 'Service name is required.' });
    }
    const quantity = Math.max(1, Math.floor(Number(b.quantity || 1)));
    const record = await createOrSyncServiceRecord({
      serviceCode: b.serviceCode ? String(b.serviceCode) : undefined,
      userId: req.dbUser!.id,
      userUid: req.dbUser!.uid,
      customerId: req.activeCustomerId || req.dbUser!.customerId || req.dbUser!.uid,
      customerEmail: req.dbUser!.email,
      serviceName,
      category,
      description,
      specifications,
      selectedOptions: b.selectedOptions && typeof b.selectedOptions === 'object' ? b.selectedOptions : {},
      uploadedFiles: Array.isArray(b.uploadedFiles) ? b.uploadedFiles : [],
      quantity,
      unitPriceInr: Number(b.unitPriceInr || 0),
      taxInr: Number(b.taxInr || 0),
      totalAmountInr: Number(b.totalAmountInr || 0),
      status: 'Pending',
      sourceEntityType: 'custom_service',
      sourceEntityId: generateCode('NTF-REQ'),
    });

    await Promise.all([
      createNotification({
        userId: req.dbUser!.id,
        title: `Service Request ${record.serviceRecordNumber} Logged`,
        message: `${record.serviceName} (${record.category}) has been saved to your account.`,
        link: '/my-account?tab=services',
      }),
      notifyAdmins({
        type: 'project',
        entityType: 'service_record',
        entityId: record.serviceRecordNumber,
        customerId: req.activeCustomerId || req.dbUser!.customerId || '',
        title: `New Service Request — ${record.serviceRecordNumber}`,
        message: `${req.dbUser!.fullName || req.dbUser!.email} requested ${record.serviceName}.`,
        link: '/admin/service-records',
      }),
    ]);

    res.status(201).json({ serviceRecord: record });
  } catch (error) {
    console.error('Create service record error:', error);
    res.status(500).json({ error: 'Failed to create service request.' });
  }
});

customerRouter.post('/notifications/:id/read', requireAuth, async (req: AuthRequest, res) => {
  try {
    await db
      .update(notifications)
      .set({ isRead: true })
      .where(and(eq(notifications.id, Number(req.params.id)), eq(notifications.userId, req.dbUser!.id)));
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Failed to update notification.' });
  }
});

customerRouter.post('/notifications/read-all', requireAuth, async (req: AuthRequest, res) => {
  try {
    await db
      .update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.userId, req.dbUser!.id));
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Failed to mark notifications as read.' });
  }
});

// Address Management
customerRouter.post('/addresses', requireAuth, async (req: AuthRequest, res) => {
  try {
    const b = req.body;
    if (!b.fullName || !b.mobile || !b.houseFlat || !b.streetArea || !b.city || !b.district || !b.state || !b.pinCode) {
      return res.status(400).json({ error: 'All required address fields must be completed.' });
    }
    if ((b.country || 'India') === 'India' && !isValidIndianPin(String(b.pinCode))) {
      return res.status(400).json({ error: 'Please enter a valid 6-digit Indian PIN code.' });
    }
    if (b.isDefault) {
      await db
        .update(customerAddresses)
        .set({ isDefault: false })
        .where(eq(customerAddresses.userId, req.dbUser!.id));
    }
    const [created] = await db
      .insert(customerAddresses)
      .values({
        userId: req.dbUser!.id,
        label: String(b.label || 'Delivery').trim(),
        addressType: String(b.addressType || 'both'),
        fullName: String(b.fullName).trim(),
        mobile: String(b.mobile).trim(),
        houseFlat: String(b.houseFlat).trim(),
        streetArea: String(b.streetArea).trim(),
        landmark: String(b.landmark || '').trim(),
        city: String(b.city).trim(),
        district: String(b.district).trim(),
        state: String(b.state).trim(),
        pinCode: String(b.pinCode).trim(),
        country: String(b.country || 'India').trim(),
        isDefault: Boolean(b.isDefault),
      })
      .returning();

    syncCustomerAddressToSupabase({
      sourceAddressId: created.id,
      userUid: req.dbUser!.uid,
      customerId: req.activeCustomerId || req.dbUser!.customerId,
      label: created.label,
      addressType: created.addressType,
      fullName: created.fullName,
      mobile: created.mobile,
      houseFlat: created.houseFlat,
      streetArea: created.streetArea,
      landmark: created.landmark,
      city: created.city,
      district: created.district,
      state: created.state,
      pinCode: created.pinCode,
      country: created.country,
      isDefault: created.isDefault,
    }).catch(() => {});

    await logCustomerActivity(
      req.dbUser!,
      req.activeCustomerId,
      'ADDRESS_ADDED',
      'customer_address',
      created.id,
      { label: created.label, city: created.city, pinCode: created.pinCode }
    );

    res.status(201).json({ address: created });
  } catch (error) {
    console.error('Address create error:', error);
    res.status(500).json({ error: 'Failed to save address.' });
  }
});

customerRouter.put('/addresses/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const b = req.body;
    if ((b.country || 'India') === 'India' && b.pinCode && !isValidIndianPin(String(b.pinCode))) {
      return res.status(400).json({ error: 'Please enter a valid 6-digit Indian PIN code.' });
    }
    if (b.isDefault) {
      await db
        .update(customerAddresses)
        .set({ isDefault: false })
        .where(eq(customerAddresses.userId, req.dbUser!.id));
    }
    const [updated] = await db
      .update(customerAddresses)
      .set({
        label: b.label,
        addressType: b.addressType,
        fullName: b.fullName,
        mobile: b.mobile,
        houseFlat: b.houseFlat,
        streetArea: b.streetArea,
        landmark: b.landmark || '',
        city: b.city,
        district: b.district,
        state: b.state,
        pinCode: b.pinCode,
        country: b.country || 'India',
        isDefault: Boolean(b.isDefault),
        updatedAt: new Date(),
      })
      .where(and(eq(customerAddresses.id, id), eq(customerAddresses.userId, req.dbUser!.id)))
      .returning();

    if (!updated) return res.status(404).json({ error: 'Address not found.' });

    syncCustomerAddressToSupabase({
      sourceAddressId: updated.id,
      userUid: req.dbUser!.uid,
      customerId: req.activeCustomerId || req.dbUser!.customerId,
      label: updated.label,
      addressType: updated.addressType,
      fullName: updated.fullName,
      mobile: updated.mobile,
      houseFlat: updated.houseFlat,
      streetArea: updated.streetArea,
      landmark: updated.landmark,
      city: updated.city,
      district: updated.district,
      state: updated.state,
      pinCode: updated.pinCode,
      country: updated.country,
      isDefault: updated.isDefault,
    }).catch(() => {});

    await logCustomerActivity(
      req.dbUser!,
      req.activeCustomerId,
      'ADDRESS_UPDATED',
      'customer_address',
      updated.id,
      { label: updated.label, city: updated.city }
    );

    res.json({ address: updated });
  } catch (error) {
    console.error('Address update error:', error);
    res.status(500).json({ error: 'Failed to update address.' });
  }
});

customerRouter.post('/addresses/:id/default', requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const [target] = await db
      .select()
      .from(customerAddresses)
      .where(and(eq(customerAddresses.id, id), eq(customerAddresses.userId, req.dbUser!.id)))
      .limit(1);
    if (!target) return res.status(404).json({ error: 'Address not found.' });

    await db
      .update(customerAddresses)
      .set({ isDefault: false, updatedAt: new Date() })
      .where(eq(customerAddresses.userId, req.dbUser!.id));

    const [updated] = await db
      .update(customerAddresses)
      .set({ isDefault: true, updatedAt: new Date() })
      .where(and(eq(customerAddresses.id, id), eq(customerAddresses.userId, req.dbUser!.id)))
      .returning();

    syncCustomerAddressToSupabase({
      sourceAddressId: updated.id,
      userUid: req.dbUser!.uid,
      customerId: req.activeCustomerId || req.dbUser!.customerId,
      label: updated.label,
      addressType: updated.addressType,
      fullName: updated.fullName,
      mobile: updated.mobile,
      houseFlat: updated.houseFlat,
      streetArea: updated.streetArea,
      landmark: updated.landmark,
      city: updated.city,
      district: updated.district,
      state: updated.state,
      pinCode: updated.pinCode,
      country: updated.country,
      isDefault: updated.isDefault,
    }).catch(() => {});

    await logCustomerActivity(
      req.dbUser!,
      req.activeCustomerId,
      'ADDRESS_DEFAULT_CHANGED',
      'customer_address',
      updated.id,
      { label: updated.label }
    );

    res.json({ address: updated });
  } catch (error) {
    console.error('Set default address error:', error);
    res.status(500).json({ error: 'Failed to set default address.' });
  }
});

customerRouter.delete('/addresses/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    await db
      .delete(customerAddresses)
      .where(and(eq(customerAddresses.id, id), eq(customerAddresses.userId, req.dbUser!.id)));

    deleteCustomerAddressFromSupabase(id).catch(() => {});
    await logCustomerActivity(req.dbUser!, req.activeCustomerId, 'ADDRESS_DELETED', 'customer_address', id);

    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Failed to remove address.' });
  }
});

// Wishlist & Verified Product Reviews
customerRouter.post('/wishlist/toggle', requireAuth, async (req: AuthRequest, res) => {
  try {
    const productId = Number(req.body.productId);
    const [prod] = await db.select().from(products).where(eq(products.id, productId)).limit(1);
    const existing = await db
      .select()
      .from(wishlists)
      .where(and(eq(wishlists.userId, req.dbUser!.id), eq(wishlists.productId, productId)))
      .limit(1);

    if (existing.length > 0) {
      await db.delete(wishlists).where(eq(wishlists.id, existing[0].id));
      syncWishlistToSupabase({
        userUid: req.dbUser!.uid,
        productId,
        productSlug: prod?.slug,
        wishlisted: false,
      }).catch(() => {});
      await logCustomerActivity(
        req.dbUser!,
        req.activeCustomerId,
        'WISHLIST_REMOVED',
        'wishlist',
        productId,
        { productName: prod?.name }
      );
      return res.json({ wishlisted: false });
    }
    await db.insert(wishlists).values({ userId: req.dbUser!.id, productId });
    syncWishlistToSupabase({
      userUid: req.dbUser!.uid,
      productId,
      productSlug: prod?.slug,
      wishlisted: true,
    }).catch(() => {});
    await logCustomerActivity(
      req.dbUser!,
      req.activeCustomerId,
      'WISHLIST_ADDED',
      'wishlist',
      productId,
      { productName: prod?.name }
    );
    res.json({ wishlisted: true });
  } catch {
    res.status(500).json({ error: 'Failed to update wishlist.' });
  }
});

customerRouter.post('/reviews', requireAuth, async (req: AuthRequest, res) => {
  try {
    const productId = Number(req.body.productId);
    const rating = Math.min(5, Math.max(1, Number(req.body.rating || 5)));
    const comment = String(req.body.comment || '').trim();
    if (!comment) return res.status(400).json({ error: 'Review comment is required.' });

    const userOrders = await db
      .select()
      .from(storeOrders)
      .where(and(eq(storeOrders.userId, req.dbUser!.id), eq(storeOrders.paymentStatus, 'paid')));

    const hasPurchased = userOrders.some((order) =>
      order.items.some((item) => item.productId === productId)
    );

    if (!hasPurchased) {
      return res.status(403).json({
        error: 'Verified-purchase policy: you can submit a review after purchasing this product.',
      });
    }

    const [review] = await db
      .insert(productReviews)
      .values({
        productId,
        userId: req.dbUser!.id,
        authorName: req.dbUser!.fullName || req.dbUser!.email.split('@')[0],
        rating,
        comment,
        verifiedPurchase: true,
      })
      .returning();

    syncProductReviewToSupabase({
      productId: review.productId,
      userUid: req.dbUser!.uid,
      authorName: review.authorName,
      rating: review.rating,
      comment: review.comment,
      verifiedPurchase: review.verifiedPurchase,
    }).catch(() => {});
    await logCustomerActivity(
      req.dbUser!,
      req.activeCustomerId,
      'REVIEW_SUBMITTED',
      'review',
      review.id,
      { productId, rating }
    );

    res.status(201).json({ review });
  } catch (error) {
    console.error('Review error:', error);
    res.status(500).json({ error: 'Failed to submit review.' });
  }
});

// 3D Printing Slicing & Order Endpoints
customerRouter.post(
  '/3d-printing/slice',
  requireAuth,
  runSingleUploadWithJsonErrors(modelUpload, 'model'),
  async (req: AuthRequest, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          error: 'Please upload a valid original 3D CAD file (.STL, .OBJ, .3MF, .STEP/.STP, or .IGES/.IGS).',
        });
      }

      const technology = String(req.body.technology || 'FDM');
      const materialId = Number(req.body.materialId || 0);
      const colorName = String(req.body.colorName || 'Black');
      const layerHeightMm = Number(req.body.layerHeightMm || 0.2);
      const infillPercent = Number(req.body.infillPercent || 20);
      const wallCount = Math.max(1, Math.min(12, Number(req.body.wallCount || 3)));
      const printSpeedMmS = Math.max(15, Math.min(300, Number(req.body.printSpeedMmS || 60)));
      const nozzleDiameterMm = Math.max(0.15, Math.min(1.2, Number(req.body.nozzleDiameterMm || 0.4)));
      const buildOrientation = String(req.body.buildOrientation || 'Auto Optimal');
      const scalePercent = Math.max(10, Math.min(500, Number(req.body.scalePercent || 100)));
      const supportEnabled = req.body.supportEnabled !== 'false';
      const quantity = Math.max(1, Number(req.body.quantity || 1));
      const finishingOption = String(req.body.finishingOption || 'Standard As-Printed');

      const [materials, machines, shippingRows] = await Promise.all([
        db.select().from(printingMaterials).where(eq(printingMaterials.isActive, true)),
        db.select().from(printingMachines).where(eq(printingMachines.isActive, true)),
        db.select().from(siteSettings).where(eq(siteSettings.key, 'shippingConfig')).limit(1),
      ]);

      const material =
        materials.find((m) => m.id === materialId) ||
        materials.find((m) => m.technology === technology) ||
        materials[0];
      const machine = machines.find((m) => m.technology === technology) || machines[0];

      if (!material || !machine) {
        return res.status(400).json({ error: 'No active 3D printer or material configured.' });
      }

      const shippingCfg = (shippingRows[0]?.value as { standardShippingInr?: number; defaultGstPercent?: number }) || {};

      const buffer = req.file.buffer;
      const slicing = analyzeAndSliceModel({
        fileBuffer: buffer,
        fileName: req.file.originalname,
        fileSizeBytes: req.file.size,
        technology,
        material: {
          name: material.name,
          densityGcm3: material.densityGcm3,
          ratePerGramInr: material.ratePerGramInr,
        },
        machine,
        layerHeightMm,
        infillPercent,
        wallCount,
        printSpeedMmS,
        nozzleDiameterMm,
        buildOrientation,
        scalePercent,
        supportEnabled,
        quantity,
        finishingOption,
        gstPercent: shippingCfg.defaultGstPercent ?? 18,
        shippingInr: shippingCfg.standardShippingInr ?? 99,
      });

      if (!isSupabaseStorageConfigured()) {
        return res.status(503).json({
          error: 'Supabase Storage is not configured. Configure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before uploading 3D CAD files.',
        });
      }

      const sbUpload = await upload3DModelToSupabase({
        buffer,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype || 'application/octet-stream',
        folder: `original/u_${req.dbUser!.id}`,
      });
      if (!sbUpload) {
        return res.status(502).json({ error: 'Failed to upload 3D model to Supabase Storage.' });
      }

      res.json({
        upload: {
          fileName: req.file.originalname,
          fileSizeBytes: req.file.size,
          fileStoragePath: sbUpload.storagePath,
          storageBucket: sbUpload.bucket,
          uploadedAt: new Date().toISOString(),
        },
        slicing,
        materialName: material.name,
        machineName: machine.name,
        colorName,
      });
    } catch (error: any) {
      console.error('3D Slicing error:', error);
      res.status(400).json({ error: error?.message || 'Failed to slice 3D model.' });
    }
  }
);

customerRouter.post('/3d-printing/orders', requireAuth, async (req: AuthRequest, res) => {
  try {
    const b = req.body;
    const canonicalStoragePath = String(b.fileStoragePath || '');
    if (!canonicalStoragePath || !b.fileName) {
      return res.status(400).json({ error: 'Uploaded 3D model file and configuration are required.' });
    }

    const deliveryAddressSnapshot =
      b.deliveryAddress && typeof b.deliveryAddress === 'object'
        ? b.deliveryAddress
        : {
            fullName: req.dbUser!.fullName || req.dbUser!.email,
            mobile: req.dbUser!.mobile || '',
            email: req.dbUser!.email,
            houseFlat: req.dbUser!.fullAddress || '',
            streetArea: '',
            city: req.dbUser!.city || '',
            state: req.dbUser!.state || '',
            pinCode: req.dbUser!.pinCode || '',
            country: 'India',
          };

    const ext = path.extname(String(b.fileName)).toLowerCase();
    if (['.gcode', '.gco', '.g', '.bgcode', '.gx', '.x3g', '.ctb', '.goo', '.pwmo', '.sl1'].includes(ext)) {
      return res.status(400).json({
        error: 'Sliced printer files are not accepted. Please upload an original 3D CAD design file (.STL, .OBJ, .3MF, .STEP/.STP, .IGES/.IGS).',
      });
    }

    if (!canonicalStoragePath.startsWith(`original/u_${req.dbUser!.id}/`)) {
      return res.status(403).json({ error: 'Invalid cloud storage path for this customer account.' });
    }

    const remoteBuffer = await downloadPrintingFileFromSupabase(canonicalStoragePath);
    if (!remoteBuffer) {
      return res.status(404).json({
        error: 'Uploaded 3D model file not found in Supabase Storage. Please upload again.',
      });
    }

    const [materials, machines, shippingRows] = await Promise.all([
      db.select().from(printingMaterials).where(eq(printingMaterials.isActive, true)),
      db.select().from(printingMachines).where(eq(printingMachines.isActive, true)),
      db.select().from(siteSettings).where(eq(siteSettings.key, 'shippingConfig')).limit(1),
    ]);

    const technology = String(b.technology || 'FDM');
    const material =
      materials.find((m) => m.name === b.materialName && m.technology === technology) ||
      materials.find((m) => m.technology === technology) ||
      materials[0];
    const machine = machines.find((m) => m.technology === technology) || machines[0];
    const shippingCfg = (shippingRows[0]?.value as { standardShippingInr?: number; defaultGstPercent?: number }) || {};

    const layerHeightMm = Number(b.layerHeightMm || 0.2);
    const infillPercent = Number(b.infillPercent || 20);
    const wallCount = Math.max(1, Math.min(12, Number(b.wallCount || 3)));
    const printSpeedMmS = Math.max(15, Math.min(300, Number(b.printSpeedMmS || 60)));
    const nozzleDiameterMm = Math.max(0.15, Math.min(1.2, Number(b.nozzleDiameterMm || 0.4)));
    const buildOrientation = String(b.buildOrientation || 'Auto Optimal');
    const scalePercent = Math.max(10, Math.min(500, Number(b.scalePercent || 100)));
    const supportEnabled = Boolean(b.supportEnabled ?? true);
    const quantity = Math.max(1, Number(b.quantity || 1));
    const finishingOption = String(b.finishingOption || 'Standard As-Printed');
    const colorName = String(b.colorName || 'Black');
    const specialInstructions = String(b.specialInstructions || '');

    // Re-run authoritative server-side slicing & pricing calculation
    const slicing = analyzeAndSliceModel({
      fileBuffer: remoteBuffer,
      fileName: String(b.fileName),
      fileSizeBytes: remoteBuffer.length,
      technology,
      material: {
        name: material.name,
        densityGcm3: material.densityGcm3,
        ratePerGramInr: material.ratePerGramInr,
      },
      machine,
      layerHeightMm,
      infillPercent,
      wallCount,
      printSpeedMmS,
      nozzleDiameterMm,
      buildOrientation,
      scalePercent,
      supportEnabled,
      quantity,
      finishingOption,
      gstPercent: shippingCfg.defaultGstPercent ?? 18,
      shippingInr: shippingCfg.standardShippingInr ?? 99,
    });

    const uploadedAtDate = b.uploadedAt ? new Date(String(b.uploadedAt)) : new Date();
    const fileSizeBytes = remoteBuffer.length;
    const storageBucket = 'printing-files';

    const customerParametersSnapshot = {
      originalFilename: String(b.fileName),
      fileFormat: slicing.fileFormat,
      fileSizeBytes,
      storageBucket,
      fileVersion: 'v1',
      uploadedAt: uploadedAtDate.toISOString(),
      technology,
      printerName: machine.name,
      materialName: material.name,
      colorName,
      layerHeightMm,
      infillPercent,
      wallCount,
      printSpeedMmS,
      nozzleDiameterMm,
      supportEnabled,
      buildOrientation,
      scalePercent,
      dimensionsMm: slicing.boundingBoxMm,
      volumeCm3: slicing.volumeCm3,
      estimatedWeightG: slicing.estimatedWeightG,
      estimatedPrintMinutes: slicing.estimatedPrintMinutes,
      quantity,
      finishingOption,
      specialInstructions,
      pricingBreakdown: slicing.pricingBreakdown,
    };

    const resolvedCustomerId = req.activeCustomerId || req.dbUser!.customerId || req.dbUser!.uid;
    const resolvedCustomerName =
      String(deliveryAddressSnapshot?.fullName || req.dbUser!.fullName || req.dbUser!.email).trim();
    const resolvedEmail = req.dbUser!.email;
    const resolvedPhone = String(req.dbUser!.mobile || deliveryAddressSnapshot?.mobile || '').trim();
    const initialStatus = slicing.technicalReviewRequired ? 'File Under Review' : 'Pending Payment';

    const orderNumber = generateCode('NTF-3DP');
    const [order] = await db
      .insert(printingOrders)
      .values({
        orderNumber,
        userId: req.dbUser!.id,
        customerId: resolvedCustomerId,
        customerName: resolvedCustomerName,
        email: resolvedEmail,
        phone: resolvedPhone,
        fileName: String(b.fileName),
        fileFormat: slicing.fileFormat,
        fileSizeBytes,
        fileStoragePath: canonicalStoragePath,
        fileVersion: 'v1',
        storageBucket,
        boundingBoxMm: slicing.boundingBoxMm,
        volumeCm3: slicing.volumeCm3,
        estimatedWeightG: slicing.estimatedWeightG,
        estimatedPrintMinutes: slicing.estimatedPrintMinutes,
        technology,
        printerName: machine.name,
        materialName: material.name,
        colorName,
        layerHeightMm,
        infillPercent,
        wallCount,
        printSpeedMmS,
        nozzleDiameterMm,
        buildOrientation,
        scalePercent,
        supportEnabled,
        quantity,
        finishingOption,
        specialInstructions,
        customerParameters: customerParametersSnapshot,
        confirmedParameters: null,
        pricingBreakdown: slicing.pricingBreakdown,
        quotedPriceInr: slicing.technicalReviewRequired ? null : slicing.pricingBreakdown.totalInr,
        totalInr: slicing.pricingBreakdown.totalInr,
        deliveryAddress: deliveryAddressSnapshot,
        slicingStatus: slicing.slicingStatus,
        orderStatus: initialStatus,
        paymentStatus: 'pending',
        refundStatus: 'none',
        customerDownloadEnabled: true,
        uploadedAt: uploadedAtDate,
      })
      .returning();

    await Promise.all([
      createNotification({
        userId: req.dbUser!.id,
        title: `3D Printing Enquiry ${order.orderNumber} Submitted`,
        message: slicing.technicalReviewRequired
          ? 'Your 3D model has been uploaded and queued for engineering review and quotation.'
          : `Enquiry saved with estimated total ₹${order.totalInr}. Payment status: Pending Payment.`,
        link: '/my-account',
      }),
      notifyAdmins({
        type: 'order',
        entityType: 'printing_order',
        entityId: order.orderNumber,
        customerId: resolvedCustomerId,
        title: `New 3D Printing Enquiry: ${order.orderNumber}`,
        message: `${resolvedCustomerName} uploaded ${order.fileName} (${order.fileFormat}). File is ready for immediate review & download.`,
        link: '/admin/printing',
      }),
    ]);
    emitAdminStreamEvent({ type: 'order', action: 'created', id: order.orderNumber, summary: order.fileName });

    syncPrintingOrderToSupabase({
      orderNumber: order.orderNumber,
      customerId: resolvedCustomerId,
      customerName: resolvedCustomerName,
      email: resolvedEmail,
      phone: resolvedPhone,
      fileName: order.fileName,
      fileFormat: order.fileFormat,
      fileSizeBytes: order.fileSizeBytes,
      fileStoragePath: order.fileStoragePath,
      storageBucket: order.storageBucket,
      technology: order.technology,
      materialName: order.materialName,
      colorName: order.colorName,
      quotedPriceInr: order.quotedPriceInr,
      totalInr: order.totalInr,
      paymentStatus: order.paymentStatus,
      refundStatus: order.refundStatus,
      orderStatus: order.orderStatus,
    }).catch(() => {});

    await logCustomerActivity(
      req.dbUser!,
      req.activeCustomerId,
      'PRINTING_3D_SUBMITTED',
      'printing_3d',
      order.orderNumber,
      { fileName: order.fileName, materialName: order.materialName, totalInr: order.totalInr }
    );

    createOrSyncServiceRecord({
      serviceCode: 'SRV-3DP',
      userId: req.dbUser!.id,
      userUid: req.dbUser!.uid,
      customerId: resolvedCustomerId,
      customerEmail: resolvedEmail,
      serviceName: `3D Printing — ${order.fileName}`,
      category: 'Manufacturing',
      description: `${order.technology} · ${order.materialName} (${order.colorName})`,
      specifications: `Layer ${order.layerHeightMm}mm, Infill ${order.infillPercent}%, ${order.finishingOption}`,
      selectedOptions: {
        technology: order.technology,
        materialName: order.materialName,
        colorName: order.colorName,
        layerHeightMm: order.layerHeightMm,
        infillPercent: order.infillPercent,
        finishingOption: order.finishingOption,
      },
      uploadedFiles: [
        {
          originalName: order.fileName,
          storagePath: order.fileStoragePath,
          bucket: order.storageBucket,
          sizeBytes: order.fileSizeBytes,
        },
      ],
      quantity: order.quantity,
      unitPriceInr: Math.round(order.totalInr / Math.max(1, order.quantity)),
      taxInr: order.pricingBreakdown?.gstInr ?? 0,
      totalAmountInr: order.totalInr,
      status: order.orderStatus,
      sourceEntityType: 'printing_order',
      sourceEntityId: order.orderNumber,
    }).catch(() => {});

    res.status(201).json({ order });
  } catch (error) {
    console.error('Create 3D print order error:', error);
    res.status(500).json({ error: 'Failed to create 3D printing order.' });
  }
});

// Owner-Scoped Original 3D Model Download (Customers can ONLY access their own uploaded enquiry files)
customerRouter.get('/3d-printing/orders/:id/download-original', requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const [order] = await db.select().from(printingOrders).where(eq(printingOrders.id, id)).limit(1);

    if (!order) {
      return res.status(404).json({ error: '3D printing enquiry not found.' });
    }
    const isAdmin = ADMIN_ROLES.has(req.dbUser!.role);
    if (order.userId !== req.dbUser!.id && !isAdmin) {
      await recordPrintingDownloadLog({
        printingOrderId: order.id,
        orderNumber: order.orderNumber,
        userId: req.dbUser!.id,
        actorUid: req.dbUser!.uid,
        actorEmail: req.dbUser!.email,
        actorRole: req.dbUser!.role || 'customer',
        fileKind: 'original',
        fileName: order.fileName,
        accessGranted: false,
        denialReason: 'Unauthorized user attempted download.',
        ipAddress: req.ip || '',
      });
      return res.status(403).json({ error: 'You are not authorized to access another customer’s 3D model file.' });
    }

    if (!isAdmin && order.customerDownloadEnabled === false) {
      await recordPrintingDownloadLog({
        printingOrderId: order.id,
        orderNumber: order.orderNumber,
        userId: req.dbUser!.id,
        actorUid: req.dbUser!.uid,
        actorEmail: req.dbUser!.email,
        actorRole: req.dbUser!.role || 'customer',
        fileKind: 'original',
        fileName: order.fileName,
        accessGranted: false,
        denialReason: 'Customer download disabled by administrator.',
        ipAddress: req.ip || '',
      });
      return res.status(403).json({ error: 'Customer file download has been disabled by administrator.', locked: true });
    }

    await recordPrintingDownloadLog({
      printingOrderId: order.id,
      orderNumber: order.orderNumber,
      userId: req.dbUser!.id,
      actorUid: req.dbUser!.uid,
      actorEmail: req.dbUser!.email,
      actorRole: req.dbUser!.role || 'customer',
      fileKind: 'original',
      fileName: order.fileName,
      accessGranted: true,
      ipAddress: req.ip || '',
    });

    if (order.storageBucket === 'printing-files') {
      if (req.query.proxy === '1') {
        const remoteBuf = await downloadPrintingFileFromSupabase(order.fileStoragePath);
        if (remoteBuf) {
          res.setHeader('Cache-Control', 'no-store, private');
          res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(order.fileName)}"`);
          return res.send(remoteBuf);
        }
      }
      const signedUrl = await getSigned3DModelUrl(order.fileStoragePath, 120, order.fileName);
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
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(order.fileName)}"`);
    return res.sendFile(absFile);
  } catch (error) {
    console.error('Customer 3D file download error:', error);
    res.status(500).json({ error: 'Failed to process 3D file download.' });
  }
});

// Explicit guard: Customers can never delete 3D printing enquiries (Admin-only operation)
customerRouter.delete('/3d-printing/orders/:id', requireAuth, async (req: AuthRequest, res) => {
  if (!ADMIN_ROLES.has(req.dbUser!.role)) {
    return res.status(403).json({
      error: 'Customers are not permitted to delete 3D printing enquiries. Please contact support.',
    });
  }
  return res.status(400).json({
    error: 'Use the Admin Dashboard deletion endpoint (/api/admin/printing-orders/:id).',
  });
});

// Store Order Creation (Atomic Stock Check & Reservation + Idempotency Guard)
customerRouter.post('/store-orders', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { items, billingAddress, shippingAddress, couponCode } = req.body;
    if (!Array.isArray(items) || items.length === 0 || !shippingAddress) {
      return res.status(400).json({ error: 'Cart items and delivery address are required.' });
    }

    // 60-second duplicate submission prevention for identical unpaid pending order
    const recentPending = await db
      .select()
      .from(storeOrders)
      .where(
        and(
          eq(storeOrders.userId, req.dbUser!.id),
          eq(storeOrders.paymentStatus, 'pending'),
          eq(storeOrders.isDeleted, false),
          gte(storeOrders.createdAt, new Date(Date.now() - 60_000))
        )
      )
      .orderBy(desc(storeOrders.createdAt))
      .limit(1);

    if (recentPending.length > 0) {
      const existing = recentPending[0];
      const sameItems =
        existing.items.length === items.length &&
        existing.items.every(
          (ei, idx) =>
            Number(ei.productId) === Number(items[idx].productId) &&
            Number(ei.qty) === Math.max(1, Math.floor(Number(items[idx].qty || 1)))
        );
      if (sameItems && existing.orderStatus === 'Order Placed') {
        return res.status(200).json({ order: existing, reused: true });
      }
    }

    const result = await db.transaction(async (tx) => {
      let subtotalInr = 0;
      let gstInr = 0;
      const lineItems: Array<{
        productId: number;
        sku: string;
        hsnCode?: string;
        name: string;
        imageUrl?: string;
        variant?: string;
        color?: string;
        qty: number;
        unitPriceInr: number;
        gstPercent: number;
        lineTotalInr: number;
      }> = [];

      for (const reqItem of items) {
        const productId = Number(reqItem.productId);
        const qty = Math.max(1, Math.floor(Number(reqItem.qty || 1)));

        const updatedRows = await tx
          .update(products)
          .set({
            stockQty: sql`${products.stockQty} - ${qty}`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(products.id, productId),
              eq(products.isPublished, true),
              eq(products.isDeleted, false),
              gte(products.stockQty, qty)
            )
          )
          .returning();

        if (updatedRows.length === 0) {
          throw new Error(`Insufficient stock or unavailable product (ID ${productId}).`);
        }

        const prod = updatedRows[0];
        if (prod.productType === 'quote_only' || prod.priceInr <= 0) {
          throw new Error(`"${prod.name}" requires a custom quotation. Please use Request a Quote.`);
        }
        const unitPrice =
          prod.discountPriceInr !== null && prod.discountPriceInr < prod.priceInr
            ? prod.discountPriceInr
            : prod.priceInr;
        const lineTotal = unitPrice * qty;
        subtotalInr += lineTotal;
        gstInr += Math.round((lineTotal * prod.gstPercent) / 100);

        lineItems.push({
          productId: prod.id,
          sku: prod.sku,
          hsnCode: prod.hsnCode || (prod.slug.includes('krashivantri') ? '8806' : '8807'),
          name: prod.name,
          imageUrl: prod.imageUrl || '',
          variant: reqItem.variant || undefined,
          color: reqItem.color || undefined,
          qty,
          unitPriceInr: unitPrice,
          gstPercent: prod.gstPercent,
          lineTotalInr: lineTotal,
        });
      }

      const [shippingRow] = await tx
        .select()
        .from(siteSettings)
        .where(eq(siteSettings.key, 'shippingConfig'))
        .limit(1);
      const shippingCfg = (shippingRow?.value as { standardShippingInr?: number; freeShippingAboveInr?: number }) || {};
      const freeThreshold = shippingCfg.freeShippingAboveInr ?? 2500;
      const shippingInr = subtotalInr >= freeThreshold ? 0 : (shippingCfg.standardShippingInr ?? 99);

      let discountInr = 0;
      let appliedCoupon = '';
      if (couponCode) {
        const code = String(couponCode).trim().toUpperCase();
        const { coupons } = await import('../../db/schema.ts');
        const [coupon] = await tx
          .select()
          .from(coupons)
          .where(and(eq(coupons.code, code), eq(coupons.isActive, true)))
          .limit(1);
        if (coupon && subtotalInr >= coupon.minOrderInr) {
          appliedCoupon = coupon.code;
          discountInr =
            coupon.discountType === 'percent'
              ? Math.round((subtotalInr * coupon.discountValue) / 100)
              : Math.min(subtotalInr, coupon.discountValue);
        }
      }

      const totalInr = Math.max(1, subtotalInr - discountInr + shippingInr + gstInr);
      const orderNumber = generateCode('NTF-ORD');

      const [order] = await tx
        .insert(storeOrders)
        .values({
          orderNumber,
          userId: req.dbUser!.id,
          customerId: req.activeCustomerId || req.dbUser!.customerId || '',
          billingAddress: billingAddress || shippingAddress,
          shippingAddress,
          items: lineItems,
          subtotalInr,
          discountInr,
          shippingInr,
          gstInr,
          totalInr,
          couponCode: appliedCoupon,
          paymentStatus: 'pending',
          paymentMethod: 'Razorpay',
          orderStatus: 'Order Placed',
          statusHistory: [
            {
              status: 'Order Placed',
              timestamp: new Date().toISOString(),
              note: 'Order created and stock reserved pending payment verification.',
              actor: req.dbUser!.email,
            },
          ],
        })
        .returning();

      return order;
    });

    await Promise.all([
      createNotification({
        userId: req.dbUser!.id,
        title: `Order ${result.orderNumber} Placed`,
        message: `Total ₹${result.totalInr.toLocaleString('en-IN')}. Complete payment to confirm dispatch.`,
        link: '/my-account',
      }),
      notifyAdmins({
        type: 'order',
        entityType: 'store_order',
        entityId: result.orderNumber,
        customerId: req.activeCustomerId || req.dbUser!.customerId || '',
        title: `New Store Order — ${result.orderNumber}`,
        message: `${req.dbUser!.fullName || req.dbUser!.email} placed an order worth ₹${result.totalInr.toLocaleString('en-IN')}.`,
        link: '/admin/store-orders',
      }),
      dispatchLifecycleEmail({
        userId: req.dbUser!.id,
        recipientEmail: req.dbUser!.email,
        eventType: 'store_order_placed',
        vars: {
          customerName: req.dbUser!.fullName || req.dbUser!.email,
          orderNumber: result.orderNumber,
          totalInr: result.totalInr,
        },
      }),
    ]);
    emitAdminStreamEvent({ type: 'order', action: 'created', id: result.orderNumber, summary: `₹${result.totalInr}` });

    syncStoreOrderToSupabase({
      orderNumber: result.orderNumber,
      userUid: req.dbUser!.uid,
      customerEmail: req.dbUser!.email,
      billingAddress: result.billingAddress,
      shippingAddress: result.shippingAddress,
      items: result.items,
      subtotalInr: result.subtotalInr,
      discountInr: result.discountInr,
      shippingInr: result.shippingInr,
      gstInr: result.gstInr,
      totalInr: result.totalInr,
      couponCode: result.couponCode,
      paymentStatus: result.paymentStatus,
      refundStatus: result.refundStatus,
      orderStatus: result.orderStatus,
    }).catch(() => {});

    await logCustomerActivity(
      req.dbUser!,
      req.activeCustomerId,
      'ORDER_PLACED',
      'store_order',
      result.orderNumber,
      { totalInr: result.totalInr, itemCount: result.items.length }
    );

    res.status(201).json({ order: result });
  } catch (error: any) {
    console.error('Store order creation error:', error);
    res.status(400).json({ error: error?.message || 'Failed to place store order.' });
  }
});

// Customer Self-Service Order Cancellation (Allowed before shipping)
customerRouter.post('/store-orders/:id/cancel', requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const reason = String(req.body?.reason || 'Cancelled by customer before dispatch').trim();
    const [existing] = await db
      .select()
      .from(storeOrders)
      .where(and(eq(storeOrders.id, id), eq(storeOrders.userId, req.dbUser!.id), eq(storeOrders.isDeleted, false)))
      .limit(1);

    if (!existing) return res.status(404).json({ error: 'Order not found.' });
    const cancellableStatuses = new Set([
      'Order Placed',
      'Pending Payment',
      'Payment Confirmed',
      'Order Processing',
    ]);
    if (!cancellableStatuses.has(existing.orderStatus)) {
      return res.status(400).json({
        error: `Order in stage '${existing.orderStatus}' cannot be cancelled online. Please raise a support ticket.`,
      });
    }

    const updated = await db.transaction(async (tx) => {
      // Restore inventory quantities for cancelled items
      for (const item of existing.items || []) {
        await tx
          .update(products)
          .set({
            stockQty: sql`${products.stockQty} + ${Number(item.qty || 1)}`,
            updatedAt: new Date(),
          })
          .where(eq(products.id, item.productId));
      }

      const nextHistory = [
        ...(existing.statusHistory || []),
        {
          status: 'Cancelled',
          timestamp: new Date().toISOString(),
          note: reason,
          actor: req.dbUser!.email,
        },
      ];

      const [row] = await tx
        .update(storeOrders)
        .set({
          orderStatus: 'Cancelled',
          cancelledReason: reason,
          cancelledAt: new Date(),
          statusHistory: nextHistory,
          updatedAt: new Date(),
        })
        .where(eq(storeOrders.id, existing.id))
        .returning();
      return row;
    });

    await Promise.all([
      createNotification({
        userId: req.dbUser!.id,
        title: `Order ${updated.orderNumber} Cancelled`,
        message: `Reason: ${reason}. ${updated.paymentStatus === 'paid' ? 'Refund processing will be initiated by accounts.' : ''}`,
        link: '/my-account',
      }),
      notifyAdmins({
        title: `Store Order ${updated.orderNumber} Cancelled`,
        message: `Customer ${req.dbUser!.email} cancelled order (${reason}).`,
        link: '/admin/dashboard',
      }),
      dispatchLifecycleEmail({
        userId: req.dbUser!.id,
        recipientEmail: req.dbUser!.email,
        eventType: 'store_order_cancelled',
        vars: {
          customerName: req.dbUser!.fullName || req.dbUser!.email,
          orderNumber: updated.orderNumber,
          reason,
        },
      }),
    ]);

    syncStoreOrderToSupabase({
      orderNumber: updated.orderNumber,
      userUid: req.dbUser!.uid,
      customerEmail: req.dbUser!.email,
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
    }).catch(() => {});

    res.json({ order: updated });
  } catch (error: any) {
    console.error('Cancel order error:', error);
    res.status(500).json({ error: error?.message || 'Failed to cancel store order.' });
  }
});

// Paid-Only Invoice Access & Cloud PDF Download
customerRouter.get('/invoices/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const [inv] = await db
      .select()
      .from(invoices)
      .where(and(eq(invoices.id, id), eq(invoices.isDeleted, false)))
      .limit(1);

    if (!inv) return res.status(404).json({ error: 'Invoice not found.' });
    const isAdmin = ADMIN_ROLES.has(req.dbUser!.role);
    if (!isAdmin && inv.userId !== req.dbUser!.id) {
      return res.status(403).json({ error: 'Not authorized to access this invoice.' });
    }

    if (inv.entityType === 'store_order' && inv.entityId > 0) {
      const [ord] = await db
        .select()
        .from(storeOrders)
        .where(eq(storeOrders.id, inv.entityId))
        .limit(1);
      if (!ord || ord.paymentStatus !== 'paid') {
        return res.status(403).json({ error: 'Tax Invoice is only available for paid orders.' });
      }
    }

    res.json({ invoice: inv });
  } catch {
    res.status(500).json({ error: 'Failed to retrieve invoice.' });
  }
});

customerRouter.get('/invoices/:id/download', requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const [inv] = await db
      .select()
      .from(invoices)
      .where(and(eq(invoices.id, id), eq(invoices.isDeleted, false)))
      .limit(1);

    if (!inv) return res.status(404).json({ error: 'Invoice not found.' });
    const isAdmin = ADMIN_ROLES.has(req.dbUser!.role);
    if (!isAdmin && inv.userId !== req.dbUser!.id) {
      return res.status(403).json({ error: 'Not authorized to access this invoice.' });
    }

    if (inv.entityType === 'store_order' && inv.entityId > 0) {
      const [ord] = await db
        .select()
        .from(storeOrders)
        .where(eq(storeOrders.id, inv.entityId))
        .limit(1);
      if (!ord || ord.paymentStatus !== 'paid') {
        return res.status(403).json({ error: 'Tax Invoice is only available for paid orders.' });
      }
    }

    let bucket = inv.storageBucket || 'invoices-pdf';
    let pdfPath = inv.pdfStoragePath || '';
    let buffer: Buffer | null = null;

    if (pdfPath && isSupabaseStorageConfigured()) {
      if (req.query.format === 'json') {
        const signedUrl = await getSignedPrivateStorageUrl(bucket, pdfPath, 300, `${inv.invoiceNumber}.pdf`);
        if (signedUrl) {
          return res.json({ signedUrl, fileName: `${inv.invoiceNumber}.pdf` });
        }
      }
      buffer = await downloadFromSupabaseStorage(bucket, pdfPath);
    }

    if (!buffer) {
      const generated = await generateAndStoreInvoicePdf(inv.id);
      if (!generated) return res.status(500).json({ error: 'Failed to generate invoice PDF.' });
      buffer = generated.buffer;
      bucket = generated.bucket;
      pdfPath = generated.storagePath;
      if (req.query.format === 'json' && pdfPath) {
        const signedUrl = await getSignedPrivateStorageUrl(bucket, pdfPath, 300, `${inv.invoiceNumber}.pdf`);
        if (signedUrl) {
          return res.json({ signedUrl, fileName: `${inv.invoiceNumber}.pdf` });
        }
      }
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Cache-Control', 'no-store, private');
    res.setHeader('Content-Disposition', `attachment; filename="${inv.invoiceNumber}.pdf"`);
    return res.send(buffer);
  } catch (error) {
    console.error('Invoice PDF download error:', error);
    res.status(500).json({ error: 'Failed to download invoice PDF.' });
  }
});

customerRouter.get('/receipts/:id/download', requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const [rcp] = await db.select().from(paymentReceipts).where(eq(paymentReceipts.id, id)).limit(1);
    if (!rcp) return res.status(404).json({ error: 'Payment receipt not found.' });

    const isAdmin = ADMIN_ROLES.has(req.dbUser!.role);
    if (!isAdmin && rcp.userId !== req.dbUser!.id) {
      return res.status(403).json({ error: 'Not authorized to access this payment receipt.' });
    }

    let buffer: Buffer | null = null;
    if (rcp.pdfStoragePath && isSupabaseStorageConfigured()) {
      buffer = await downloadFromSupabaseStorage(rcp.storageBucket || 'payment-receipts', rcp.pdfStoragePath);
    }
    if (!buffer) {
      const generated = await generateAndStoreInstallmentReceiptPdf({ receiptId: rcp.id });
      buffer = generated?.buffer || null;
    }
    if (!buffer) {
      return res.status(500).json({ error: 'Failed to generate payment receipt PDF.' });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Cache-Control', 'no-store, private');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(rcp.receiptNumber)}.pdf"`);
    return res.send(buffer);
  } catch (error) {
    console.error('Receipt PDF download error:', error);
    res.status(500).json({ error: 'Failed to download payment receipt PDF.' });
  }
});

// Project Agreements: Customer Download, Digital Acceptance & Upload Signed PDF
customerRouter.get('/agreements/:id/download', requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const [agreement] = await db
      .select()
      .from(projectAgreements)
      .where(and(eq(projectAgreements.id, id), eq(projectAgreements.isDeleted, false)))
      .limit(1);
    if (!agreement) return res.status(404).json({ error: 'Agreement not found.' });

    const isAdmin = ADMIN_ROLES.has(req.dbUser!.role);
    if (!isAdmin && agreement.userId !== req.dbUser!.id) {
      return res.status(403).json({ error: 'Not authorized to access this agreement.' });
    }

    const useSigned = req.query.kind === 'signed' && Boolean(agreement.signedPdfPath);
    const bucket = useSigned
      ? agreement.signedPdfBucket || 'project-agreements'
      : agreement.storageBucket || 'project-agreements';
    const pathKey = useSigned
      ? agreement.signedPdfPath
      : agreement.signedPdfPath && req.query.kind !== 'original'
      ? agreement.signedPdfPath
      : agreement.storagePath;
    const fileName = useSigned
      ? agreement.signedFileName || `${agreement.agreementNumber}-signed.pdf`
      : agreement.fileName || `${agreement.agreementNumber}.pdf`;

    if (req.query.format === 'json' && pathKey && isSupabaseStorageConfigured()) {
      const signedUrl = await getSignedPrivateStorageUrl(bucket, pathKey, 300, fileName);
      if (signedUrl) return res.json({ signedUrl, fileName });
    }

    let buf: Buffer | null = null;
    if (pathKey && isSupabaseStorageConfigured()) {
      const candidateBuckets = Array.from(new Set([bucket, 'project-agreements', 'agreements']));
      for (const bkt of candidateBuckets) {
        buf = await downloadFromSupabaseStorage(bkt, pathKey);
        if (buf) break;
      }
    }

    if (!buf && req.query.kind !== 'signed') {
      const storedModel = agreement.agreementData as unknown as ProjectAgreementDocumentModel | undefined;
      if (storedModel && storedModel.projectTitle) {
        const rendered = await renderProjectAgreementPdfBuffer({
          ...storedModel,
          status: agreement.status,
          acceptedAt: agreement.acceptedAt ? new Date(agreement.acceptedAt).toISOString() : storedModel.acceptedAt || null,
          acceptedByName: agreement.acceptedByName || storedModel.acceptedByName || '',
          acceptedByEmail: agreement.acceptedByEmail || storedModel.acceptedByEmail || '',
          acceptanceIp: agreement.acceptanceIp || storedModel.acceptanceIp || '',
        });
        buf = rendered.buffer;
      } else if (agreement.projectId || agreement.enquiryId) {
        const built = await buildAgreementModelForContext({
          projectId: agreement.projectId ?? undefined,
          enquiryId: agreement.enquiryId ?? undefined,
          status: agreement.status,
          agreementNumber: agreement.agreementNumber,
          acceptedAt: agreement.acceptedAt ? new Date(agreement.acceptedAt).toISOString() : null,
          acceptedByName: agreement.acceptedByName,
          acceptedByEmail: agreement.acceptedByEmail,
          acceptanceIp: agreement.acceptanceIp,
        });
        const rendered = await renderProjectAgreementPdfBuffer(built.model);
        buf = rendered.buffer;
      }
    }

    if (!buf) {
      return res.status(404).json({ error: 'Agreement PDF missing from cloud storage.' });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Cache-Control', 'no-store, private');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
    return res.send(buf);
  } catch (error) {
    console.error('Agreement download error:', error);
    res.status(500).json({ error: 'Failed to download agreement PDF.' });
  }
});

// Digital Agreement Acceptance by Customer (never auto-triggered by company stamp/signature image)
customerRouter.post('/agreements/:id/accept', requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const [agreement] = await db
      .select()
      .from(projectAgreements)
      .where(and(eq(projectAgreements.id, id), eq(projectAgreements.isDeleted, false)))
      .limit(1);
    if (!agreement) return res.status(404).json({ error: 'Agreement not found.' });
    if (agreement.userId !== req.dbUser!.id && !ADMIN_ROLES.has(req.dbUser!.role)) {
      return res.status(403).json({ error: 'Not authorized to accept this agreement.' });
    }

    const acceptedName = String(req.body?.acceptedName || req.dbUser!.fullName || '').trim();
    const agreeToTerms = req.body?.agreeToTerms === true || req.body?.agreeToTerms === 'true';
    const acceptanceNotes = String(req.body?.notes || '').trim();
    if (!acceptedName) {
      return res.status(400).json({ error: 'Full name is required to digitally accept this agreement.' });
    }
    if (!agreeToTerms) {
      return res.status(400).json({ error: 'Please confirm agreement to terms & conditions before accepting.' });
    }
    if (agreement.status === 'Accepted' && agreement.acceptedAt) {
      return res.json({ agreement, alreadyAccepted: true });
    }

    const now = new Date();
    const clientIp =
      String(req.headers['x-forwarded-for'] || req.ip || '')
        .split(',')[0]
        .trim() || 'unknown';
    const userAgent = String(req.headers['user-agent'] || '').slice(0, 240);
    const prevStatus = agreement.status;

    const acceptanceRecord = {
      acceptedAt: now.toISOString(),
      acceptedByName: acceptedName,
      acceptedByEmail: req.dbUser!.email,
      acceptanceIp: clientIp,
      userAgent,
      notes: acceptanceNotes,
      verificationMethod: 'authenticated_portal_digital_acceptance',
    };

    const existingModel = (agreement.agreementData || {}) as unknown as ProjectAgreementDocumentModel;
    const updatedModel: ProjectAgreementDocumentModel =
      existingModel && existingModel.projectTitle
        ? {
            ...existingModel,
            status: 'Accepted',
            acceptedAt: now.toISOString(),
            acceptedByName: acceptedName,
            acceptedByEmail: req.dbUser!.email,
            acceptanceIp: clientIp,
          }
        : (
            await buildAgreementModelForContext({
              projectId: agreement.projectId ?? undefined,
              enquiryId: agreement.enquiryId ?? undefined,
              status: 'Accepted',
              agreementNumber: agreement.agreementNumber,
              acceptedAt: now.toISOString(),
              acceptedByName: acceptedName,
              acceptedByEmail: req.dbUser!.email,
              acceptanceIp: clientIp,
            })
          ).model;

    let signedPdfBucket = agreement.signedPdfBucket || 'project-agreements';
    let signedPdfPath = agreement.signedPdfPath || '';
    let signedFileName = agreement.signedFileName || `${agreement.agreementNumber}-accepted.pdf`;

    const renderedAcceptedPdf = await renderProjectAgreementPdfBuffer(updatedModel);
    if (isSupabaseStorageConfigured()) {
      const up = await uploadAgreementPdfToSupabase({
        buffer: renderedAcceptedPdf.buffer,
        originalName: signedFileName,
        ownerUid: req.dbUser!.uid,
        folder: `${agreement.agreementNumber}/accepted`,
      });
      signedPdfBucket = up.bucket;
      signedPdfPath = up.storagePath;
    }

    const [updated] = await db
      .update(projectAgreements)
      .set({
        status: 'Accepted',
        acceptedAt: now,
        acceptedByName: acceptedName,
        acceptedByEmail: req.dbUser!.email,
        acceptanceIp: clientIp,
        acceptanceUserAgent: userAgent,
        acceptanceRecord,
        signedByCustomer: `${acceptedName} (${req.dbUser!.email})`,
        signedAt: now,
        signedPdfBucket,
        signedPdfPath,
        signedFileName,
        agreementData: updatedModel as unknown as Record<string, unknown>,
        updatedAt: now,
      })
      .where(eq(projectAgreements.id, agreement.id))
      .returning();

    await Promise.all([
      syncProjectAgreementToSupabase({
        sourceId: updated.id,
        agreementNumber: updated.agreementNumber,
        projectCode: updated.projectCode,
        enquiryNumber: updated.enquiryNumber,
        customerId: updated.customerId,
        userUid: req.dbUser!.uid,
        title: updated.title,
        versionLabel: updated.versionLabel,
        status: updated.status,
        storageBucket: updated.storageBucket,
        storagePath: updated.storagePath,
        fileName: updated.fileName,
        fileSizeBytes: updated.fileSizeBytes,
        signedPdfBucket: updated.signedPdfBucket,
        signedPdfPath: updated.signedPdfPath,
        signedFileName: updated.signedFileName,
        signedByCustomer: updated.signedByCustomer,
        signedAt: updated.signedAt,
        acceptedAt: updated.acceptedAt,
        acceptedByName: updated.acceptedByName,
        acceptedByEmail: updated.acceptedByEmail,
        acceptanceIp: updated.acceptanceIp,
        uploadedBy: updated.uploadedBy,
        notes: updated.notes,
      }),
      recordEntityStatusChange({
        entityType: 'project_agreement',
        entityId: updated.id,
        entityCode: updated.agreementNumber,
        customerId: updated.customerId,
        userId: updated.userId,
        userUid: req.dbUser!.uid,
        customerEmail: req.dbUser!.email,
        previousStatus: prevStatus,
        newStatus: 'Accepted',
        actionType: 'status_change',
        reason: `Customer digitally accepted agreement (${acceptedName}, IP ${clientIp})`,
        adminId: req.dbUser!.uid,
        adminEmail: req.dbUser!.email,
        originalRecord: agreement as unknown as Record<string, unknown>,
      }),
      notifyAdmins({
        type: 'project',
        entityType: 'project_agreement',
        entityId: updated.agreementNumber,
        customerId: updated.customerId,
        title: `Agreement Accepted — ${updated.agreementNumber}`,
        message: `${acceptedName} (${req.dbUser!.email}) digitally accepted ${updated.title}.`,
        link: '/admin/projects',
      }),
      dispatchLifecycleEmail({
        userId: req.dbUser!.id,
        projectId: updated.projectId,
        enquiryId: updated.enquiryId,
        recipientEmail: req.dbUser!.email,
        eventType: 'agreement_accepted_confirmation',
        vars: {
          customerName: acceptedName,
          agreementNumber: updated.agreementNumber,
          projectCode: updated.projectCode || updated.enquiryNumber,
          acceptedAt: now.toLocaleString('en-IN'),
        },
      }).catch(() => {}),
      dispatchAdminNotificationEmail({
        eventType: 'agreement_accepted_confirmation',
        subject: `Agreement Accepted: ${updated.agreementNumber} (${updated.projectCode || updated.enquiryNumber})`,
        body: `Customer ${acceptedName} (${req.dbUser!.email}) accepted Project Agreement ${updated.agreementNumber} on ${now.toLocaleString('en-IN')} from IP ${clientIp}.`,
        projectId: updated.projectId,
        enquiryId: updated.enquiryId,
      }),
    ]);

    emitAdminStreamEvent({
      type: 'project',
      action: 'agreement_accepted',
      id: updated.agreementNumber,
      summary: updated.title,
    });

    res.json({ agreement: updated });
  } catch (error: any) {
    console.error('Accept agreement error:', error);
    res.status(500).json({ error: error?.message || 'Failed to accept agreement.' });
  }
});

customerRouter.post(
  '/agreements/:id/upload-signed',
  requireAuth,
  runSingleUploadWithJsonErrors(agreementSignedUpload, 'file'),
  async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      const [agreement] = await db
        .select()
        .from(projectAgreements)
        .where(and(eq(projectAgreements.id, id), eq(projectAgreements.isDeleted, false)))
        .limit(1);
      if (!agreement) return res.status(404).json({ error: 'Agreement not found.' });
      if (agreement.userId !== req.dbUser!.id && !ADMIN_ROLES.has(req.dbUser!.role)) {
        return res.status(403).json({ error: 'Not authorized to upload signed agreement for another customer.' });
      }
      if (!req.file) {
        return res.status(400).json({ error: 'Please attach the signed agreement PDF (.pdf).' });
      }
      if (!isSupabaseStorageConfigured()) {
        return res.status(503).json({
          error: 'Supabase Storage is not configured. Signed agreement PDF must be uploaded to cloud storage.',
        });
      }

      const uploaded = await uploadAgreementPdfToSupabase({
        buffer: req.file.buffer,
        originalName: req.file.originalname,
        ownerUid: req.dbUser!.uid,
        folder: `${agreement.agreementNumber}/signed`,
      });

      const prevStatus = agreement.status;
      const now = new Date();
      const clientIp =
        String(req.headers['x-forwarded-for'] || req.ip || '')
          .split(',')[0]
          .trim() || 'unknown';
      const userAgent = String(req.headers['user-agent'] || '').slice(0, 240);
      const acceptedName = req.dbUser!.fullName || req.dbUser!.email;

      const [updated] = await db
        .update(projectAgreements)
        .set({
          signedPdfBucket: uploaded.bucket,
          signedPdfPath: uploaded.storagePath,
          signedFileName: req.file.originalname,
          signedByCustomer: req.dbUser!.email,
          signedAt: now,
          acceptedAt: now,
          acceptedByName: acceptedName,
          acceptedByEmail: req.dbUser!.email,
          acceptanceIp: clientIp,
          acceptanceUserAgent: userAgent,
          acceptanceRecord: {
            acceptedAt: now.toISOString(),
            acceptedByName: acceptedName,
            acceptedByEmail: req.dbUser!.email,
            acceptanceIp: clientIp,
            userAgent,
            verificationMethod: 'signed_pdf_upload',
          },
          status: 'Accepted',
          updatedAt: now,
        })
        .where(eq(projectAgreements.id, agreement.id))
        .returning();

      await Promise.all([
        syncProjectAgreementToSupabase({
          sourceId: updated.id,
          agreementNumber: updated.agreementNumber,
          projectCode: updated.projectCode,
          enquiryNumber: updated.enquiryNumber,
          customerId: updated.customerId,
          userUid: req.dbUser!.uid,
          title: updated.title,
          versionLabel: updated.versionLabel,
          status: updated.status,
          storageBucket: updated.storageBucket,
          storagePath: updated.storagePath,
          fileName: updated.fileName,
          fileSizeBytes: updated.fileSizeBytes,
          signedPdfBucket: updated.signedPdfBucket,
          signedPdfPath: updated.signedPdfPath,
          signedFileName: updated.signedFileName,
          signedByCustomer: updated.signedByCustomer,
          signedAt: updated.signedAt,
          acceptedAt: updated.acceptedAt,
          acceptedByName: updated.acceptedByName,
          acceptedByEmail: updated.acceptedByEmail,
          acceptanceIp: updated.acceptanceIp,
          uploadedBy: updated.uploadedBy,
          notes: updated.notes,
        }),
        recordEntityStatusChange({
          entityType: 'project_agreement',
          entityId: updated.id,
          entityCode: updated.agreementNumber,
          customerId: updated.customerId,
          userId: updated.userId,
          userUid: req.dbUser!.uid,
          customerEmail: req.dbUser!.email,
          previousStatus: prevStatus,
          newStatus: 'Accepted',
          actionType: 'status_change',
          reason: `Customer uploaded signed PDF (${req.file.originalname})`,
          adminId: req.dbUser!.uid,
          adminEmail: req.dbUser!.email,
          originalRecord: agreement as unknown as Record<string, unknown>,
        }),
        notifyAdmins({
          type: 'project',
          entityType: 'project_agreement',
          entityId: updated.agreementNumber,
          customerId: updated.customerId,
          title: `Signed Agreement Uploaded — ${updated.agreementNumber}`,
          message: `${acceptedName} signed and uploaded ${updated.title}.`,
          link: '/admin/projects',
        }),
        dispatchAdminNotificationEmail({
          eventType: 'agreement_accepted_confirmation',
          subject: `Signed Agreement Uploaded: ${updated.agreementNumber}`,
          body: `${acceptedName} (${req.dbUser!.email}) uploaded a signed copy of ${updated.agreementNumber}.`,
          projectId: updated.projectId,
          enquiryId: updated.enquiryId,
        }),
      ]);

      emitAdminStreamEvent({
        type: 'project',
        action: 'agreement_signed',
        id: updated.agreementNumber,
        summary: updated.title,
      });

      res.json({ agreement: updated });
    } catch (error: any) {
      console.error('Upload signed agreement error:', error);
      res.status(500).json({ error: error?.message || 'Failed to upload signed agreement.' });
    }
  }
);

// Project Registration & Quotation Responses
customerRouter.post(
  '/project-enquiries',
  requireAuth,
  projectUpload.array('attachments', 12),
  async (req: AuthRequest, res) => {
    try {
      const b = req.body;
      if (!b.projectTitle || !b.projectCategory || !b.projectDescription) {
        return res.status(400).json({ error: 'Project title, category, and description are required.' });
      }

      const acceptedTerms = b.acceptedTerms === true || b.acceptedTerms === 'true';
      const acceptedPrivacyPolicy = b.acceptedPrivacyPolicy === true || b.acceptedPrivacyPolicy === 'true';
      if (!acceptedTerms || !acceptedPrivacyPolicy) {
        return res.status(400).json({ error: 'Please accept the Terms and Conditions and Privacy Policy to submit.' });
      }

      const billingAddress =
        typeof b.billingAddress === 'string' ? JSON.parse(b.billingAddress) : b.billingAddress;
      const deliveryAddress =
        typeof b.deliveryAddress === 'string' ? JSON.parse(b.deliveryAddress) : b.deliveryAddress;

      if (!billingAddress || !deliveryAddress) {
        return res.status(400).json({ error: 'Billing and delivery addresses are required.' });
      }

      const files = (req.files as Express.Multer.File[]) || [];
      let attachmentCategories: string[] = [];
      try {
        if (typeof b.attachmentCategories === 'string') {
          attachmentCategories = JSON.parse(b.attachmentCategories);
        } else if (Array.isArray(b.attachmentCategories)) {
          attachmentCategories = b.attachmentCategories;
        }
      } catch {
        attachmentCategories = [];
      }

      const dedupCutoff = new Date(Date.now() - 60 * 1000);
      const recentProjDup = await db
        .select()
        .from(projectEnquiries)
        .where(
          and(
            eq(projectEnquiries.userId, req.dbUser!.id),
            eq(projectEnquiries.projectTitle, String(b.projectTitle).trim()),
            gte(projectEnquiries.createdAt, dedupCutoff)
          )
        )
        .limit(1);
      if (recentProjDup.length > 0) {
        return res.status(200).json({
          deduplicated: true,
          enquiry: recentProjDup[0],
          projectRegistrationId: recentProjDup[0].enquiryNumber,
        });
      }

      const enquiryNumber = generateCode('NTF-ENQ');
      if (files.length > 0 && !isSupabaseStorageConfigured()) {
        return res.status(503).json({
          error: 'Supabase Storage is not configured. Project documents must be uploaded to cloud storage.',
        });
      }

      const attachments =
        files.length > 0
          ? await Promise.all(
              files.map(async (f, idx) => {
                const category = String(attachmentCategories[idx] || b.attachmentCategory || 'supporting_document');
                const uploadedDoc = await uploadProjectAttachmentToSupabase({
                  buffer: f.buffer,
                  originalName: f.originalname,
                  mimeType: f.mimetype || 'application/octet-stream',
                  ownerUid: req.dbUser!.uid,
                  folder: `${enquiryNumber}-registrations`,
                });
                return {
                  originalName: f.originalname,
                  storagePath: uploadedDoc.storagePath,
                  bucket: uploadedDoc.bucket,
                  mimeType: f.mimetype || 'application/octet-stream',
                  sizeBytes: f.size,
                  category,
                };
              })
            )
          : [];

      const parseBool = (val: unknown, fallback = false) =>
        val === undefined ? fallback : val === true || val === 'true' || val === 'yes';

      const flags =
        typeof b.flags === 'string'
          ? JSON.parse(b.flags)
          : b.flags && typeof b.flags === 'object'
          ? b.flags
          : {};

      const requiresPhysicalPrototype = parseBool(b.requiresPhysicalPrototype, Boolean(flags.hardwarePrototype ?? true));
      const requiresWebOrMobileApp = parseBool(b.requiresWebOrMobileApp, Boolean(flags.softwareApp));
      const requiresDocumentation = parseBool(b.requiresDocumentation, Boolean(flags.documentation ?? true));

      const mergedFlags = {
        ...flags,
        hardwarePrototype: requiresPhysicalPrototype,
        softwareApp: requiresWebOrMobileApp,
        documentation: requiresDocumentation,
      };

      const engineeringDomain = String(b.engineeringDomain || b.engineeringBranch || b.projectCategory).trim();
      const customerCategory = String(b.customerCategory || b.academicLevel || 'Student').trim();

      const [enquiry] = await db
        .insert(projectEnquiries)
        .values({
          enquiryNumber,
          userId: req.dbUser!.id,
          customerId: req.activeCustomerId || req.dbUser!.customerId || '',
          customerName: String(b.customerName || req.dbUser!.fullName || req.dbUser!.email).trim(),
          customerEmail: String(b.customerEmail || req.dbUser!.email).trim(),
          customerPhone: String(b.customerPhone || req.dbUser!.mobile || '').trim(),
          whatsappNumber: String(b.whatsappNumber || b.customerPhone || req.dbUser!.mobile || '').trim(),
          companyOrCollege: String(b.companyOrCollege || '').trim(),
          courseDepartment: String(b.courseDepartment || '').trim(),
          city: String(b.city || billingAddress?.city || '').trim(),
          state: String(b.state || billingAddress?.state || '').trim(),
          customerCategory,
          teamType: String(b.teamType || 'Individual'),
          teamCount: Math.max(1, Number(b.teamCount || 1)),
          projectTitle: String(b.projectTitle).trim(),
          engineeringBranch: String(b.engineeringBranch || engineeringDomain).trim(),
          engineeringDomain,
          academicLevel: String(b.academicLevel || customerCategory),
          projectCategory: String(b.projectCategory).trim(),
          projectType: String(b.projectType || 'Prototype').trim(),
          projectDescription: String(b.projectDescription).trim(),
          problemStatement: String(b.problemStatement || '').trim(),
          objective: String(b.objective || '').trim(),
          expectedWorking: String(b.expectedWorking || b.expectedFunctionality || '').trim(),
          expectedFunctionality: String(b.expectedFunctionality || b.expectedWorking || '').trim(),
          requiredFeatures: String(b.requiredFeatures || '').trim(),
          requiredTechnologies: String(b.requiredTechnologies || '').trim(),
          hardwareRequirements: String(b.hardwareRequirements || '').trim(),
          softwareRequirements: String(b.softwareRequirements || '').trim(),
          componentsRequired: String(b.componentsRequired || '').trim(),
          expectedOutput: String(b.expectedOutput || b.expectedDeliverables || '').trim(),
          expectedDeliverables: String(b.expectedDeliverables || b.expectedOutput || '').trim(),
          targetCompletionDate: String(b.targetCompletionDate || '').trim(),
          estimatedBudget: String(b.estimatedBudget || '').trim(),
          budgetMinInr: b.budgetMinInr ? Number(b.budgetMinInr) : null,
          budgetMaxInr: b.budgetMaxInr ? Number(b.budgetMaxInr) : null,
          complexityLevel: String(b.complexityLevel || 'Intermediate').trim(),
          prototypeRequirements: String(b.prototypeRequirements || '').trim(),
          preferredCommunicationMethod: String(b.preferredCommunicationMethod || 'WhatsApp & Email').trim(),
          requiresPhysicalPrototype,
          requiresWebOrMobileApp,
          requiresDocumentation,
          acceptedTerms: true,
          acceptedPrivacyPolicy: true,
          flags: mergedFlags,
          specialRequirements: String(b.specialRequirements || '').trim(),
          attachments,
          billingAddress,
          deliveryAddress,
          addressHistory: [
            {
              changedAt: new Date().toISOString(),
              changedBy: req.dbUser!.email,
              deliveryAddress,
            },
          ],
          status: 'Submitted – Under Review',
        })
        .returning();

      if (attachments.length > 0) {
        for (const att of attachments) {
          await db.insert(projectAttachments).values({
            projectId: null,
            enquiryId: enquiry.id,
            userId: req.dbUser!.id,
            fileName: att.originalName,
            storageBucket: att.bucket,
            storagePath: att.storagePath,
            mimeType: att.mimeType,
            fileSizeBytes: att.sizeBytes,
            category: att.category,
            uploadedBy: req.dbUser!.email,
          }).catch(() => {});
          syncProjectAttachmentRecordToSupabase({
            enquiryId: enquiry.id,
            fileName: att.originalName,
            storageBucket: att.bucket,
            storagePath: att.storagePath,
            mimeType: att.mimeType,
            fileSizeBytes: att.sizeBytes,
            category: att.category,
            uploadedBy: req.dbUser!.email,
          }).catch(() => {});
        }
      }

      await createNotification({
        userId: req.dbUser!.id,
        title: `Project ${enquiry.enquiryNumber} Registered`,
        message: `Your custom project "${enquiry.projectTitle}" is now Submitted – Under Review.`,
        link: '/my-account/project-enquiries',
      });

      await notifyAdmins({
        type: 'project',
        entityType: 'project_enquiry',
        entityId: enquiry.enquiryNumber,
        customerId: enquiry.customerId || req.activeCustomerId || req.dbUser!.customerId || '',
        title: `New Project Registration — ${enquiry.enquiryNumber}`,
        message: `${enquiry.customerName} (${enquiry.customerCategory}) registered "${enquiry.projectTitle}".`,
        link: '/admin/project-enquiries',
      });
      emitAdminStreamEvent({ type: 'enquiry', action: 'created', id: enquiry.enquiryNumber, summary: enquiry.projectTitle });

      await dispatchLifecycleEmail({
        userId: req.dbUser!.id,
        enquiryId: enquiry.id,
        recipientEmail: enquiry.customerEmail || req.dbUser!.email,
        eventType: 'enquiry_submitted',
        vars: {
          customerName: enquiry.customerName,
          enquiryNumber: enquiry.enquiryNumber,
          projectTitle: enquiry.projectTitle,
        },
      });

      dispatchAdminNotificationEmail({
        eventType: 'enquiry_submitted',
        subject: `New Project Request: ${enquiry.enquiryNumber} — ${enquiry.projectTitle}`,
        body: `Customer ${enquiry.customerName} (${enquiry.customerEmail}) submitted project "${enquiry.projectTitle}".`,
        enquiryId: enquiry.id,
      }).catch(() => {});

      syncProjectRegistrationToSupabase({
        enquiry,
        userUid: req.dbUser!.uid,
      }).catch(() => {});

      if (attachments.length > 0) {
        for (const att of attachments) {
          db.insert(enquiryAttachments)
            .values({
              enquirySource: 'project',
              enquiryId: enquiry.id,
              enquiryNumber: enquiry.enquiryNumber,
              userId: req.dbUser!.id,
              customerId: enquiry.customerId || '',
              fileName: att.originalName,
              mimeType: att.mimeType,
              sizeBytes: att.sizeBytes,
              storageBucket: att.bucket,
              storagePath: att.storagePath,
              uploadedBy: req.dbUser!.email,
            })
            .catch(() => {});
          syncEnquiryAttachmentToSupabase({
            enquirySource: 'project',
            enquiryId: enquiry.id,
            enquiryNumber: enquiry.enquiryNumber,
            userUid: req.dbUser!.uid,
            customerId: enquiry.customerId || '',
            fileName: att.originalName,
            mimeType: att.mimeType,
            sizeBytes: att.sizeBytes,
            storageBucket: att.bucket,
            storagePath: att.storagePath,
            uploadedBy: req.dbUser!.email,
          }).catch(() => {});
        }
      }

      createOrSyncServiceRecord({
        serviceCode: 'SRV-CUSTOM-ENG',
        userId: req.dbUser!.id,
        userUid: req.dbUser!.uid,
        customerId: enquiry.customerId || req.activeCustomerId || req.dbUser!.customerId || req.dbUser!.uid,
        customerEmail: enquiry.customerEmail || req.dbUser!.email,
        serviceName: `Project Development — ${enquiry.projectTitle}`,
        category: 'Engineering',
        description: enquiry.projectDescription,
        specifications: `${enquiry.projectCategory} · ${enquiry.engineeringDomain}`,
        selectedOptions: {
          projectCategory: enquiry.projectCategory,
          complexityLevel: enquiry.complexityLevel,
          estimatedBudget: enquiry.estimatedBudget,
          requiresPhysicalPrototype: enquiry.requiresPhysicalPrototype,
          requiresWebOrMobileApp: enquiry.requiresWebOrMobileApp,
          requiresDocumentation: enquiry.requiresDocumentation,
        },
        uploadedFiles: attachments,
        quantity: 1,
        status: enquiry.status,
        sourceEntityType: 'project_enquiry',
        sourceEntityId: enquiry.enquiryNumber,
      }).catch(() => {});

      res.status(201).json({ enquiry, projectRegistrationId: enquiry.enquiryNumber });
    } catch (error) {
      console.error('Project registration error:', error);
      res.status(500).json({ error: 'Failed to submit project registration.' });
    }
  }
);

// Customer replies or submits additional documents for a registered project
customerRouter.post(
  '/project-enquiries/:id/messages',
  requireAuth,
  projectUpload.array('attachments', 6),
  async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      const text = String(req.body.message || '').trim();
      const [enquiry] = await db
        .select()
        .from(projectEnquiries)
        .where(and(eq(projectEnquiries.id, id), eq(projectEnquiries.userId, req.dbUser!.id)))
        .limit(1);
      if (!enquiry) return res.status(404).json({ error: 'Project registration not found.' });

      const files = (req.files as Express.Multer.File[]) || [];
      if (!text && files.length === 0) {
        return res.status(400).json({ error: 'Please enter a message or attach at least one document.' });
      }

      if (files.length > 0 && !isSupabaseStorageConfigured()) {
        return res.status(503).json({
          error: 'Supabase Storage is not configured. Project message attachments require cloud storage.',
        });
      }

      const uploaded = await Promise.all(
        files.map(async (f) => {
          const uploadedDoc = await uploadProjectDocumentToSupabase({
            buffer: f.buffer,
            originalName: f.originalname,
            mimeType: f.mimetype || 'application/octet-stream',
            ownerUid: req.dbUser!.uid,
            folder: `${enquiry.enquiryNumber}-messages`,
          });
          return {
            originalName: f.originalname,
            storagePath: uploadedDoc.storagePath,
            bucket: uploadedDoc.bucket,
            sizeBytes: f.size,
            category: String(req.body.category || 'additional_document'),
          };
        })
      );

      const [projRow] = await db.select().from(projects).where(eq(projects.enquiryId, enquiry.id)).limit(1);

      const [createdMsg] = await db
        .insert(projectMessages)
        .values({
          enquiryId: enquiry.id,
          projectId: projRow?.id || null,
          userId: enquiry.userId,
          senderEmail: req.dbUser!.email,
          senderName: req.dbUser!.fullName || enquiry.customerName,
          senderRole: 'customer',
          message: text || `Uploaded ${uploaded.length} supporting document(s).`,
          attachments: uploaded,
        })
        .returning();

      const nextAttachments = [...(enquiry.attachments || []), ...uploaded];
      const nextStatus =
        enquiry.status === 'Additional Information Required' || enquiry.status === 'Clarification Needed'
          ? 'Under Technical Evaluation'
          : enquiry.status;

      const [updatedEnquiry] = await db
        .update(projectEnquiries)
        .set({
          attachments: nextAttachments,
          status: nextStatus,
          updatedAt: new Date(),
        })
        .where(eq(projectEnquiries.id, enquiry.id))
        .returning();

      await notifyAdmins({
        type: 'enquiry',
        entityType: 'project_enquiry',
        entityId: enquiry.enquiryNumber,
        customerId: enquiry.customerId || req.activeCustomerId || req.dbUser!.customerId || '',
        title: `Customer Response — ${enquiry.enquiryNumber}`,
        message: `${enquiry.customerName}: ${(text || 'Submitted additional documents').slice(0, 120)}`,
        link: '/admin/project-enquiries',
      });
      emitAdminStreamEvent({ type: 'project', action: 'message', id: enquiry.enquiryNumber, summary: enquiry.customerName });

      syncProjectMessageToSupabase({
        registrationNumber: enquiry.enquiryNumber,
        userUid: req.dbUser!.uid,
        senderEmail: req.dbUser!.email,
        senderName: req.dbUser!.fullName || enquiry.customerName,
        senderRole: 'customer',
        message: createdMsg.message,
        attachments: uploaded,
      }).catch(() => {});

      res.status(201).json({ message: createdMsg, enquiry: updatedEnquiry });
    } catch (error) {
      console.error('Customer project message error:', error);
      res.status(500).json({ error: 'Failed to send project message.' });
    }
  }
);

customerRouter.patch('/project-enquiries/:id/delivery-address', requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const { deliveryAddress } = req.body;
    const [existing] = await db
      .select()
      .from(projectEnquiries)
      .where(and(eq(projectEnquiries.id, id), eq(projectEnquiries.userId, req.dbUser!.id)))
      .limit(1);

    if (!existing) return res.status(404).json({ error: 'Project enquiry not found.' });
    if (['Dispatched', 'Completed'].includes(existing.status)) {
      return res.status(400).json({ error: 'Address cannot be modified after dispatch.' });
    }

    const updatedHistory = [
      ...existing.addressHistory,
      {
        changedAt: new Date().toISOString(),
        changedBy: req.dbUser!.email,
        deliveryAddress,
      },
    ];

    const [updated] = await db
      .update(projectEnquiries)
      .set({
        deliveryAddress,
        addressHistory: updatedHistory,
        updatedAt: new Date(),
      })
      .where(eq(projectEnquiries.id, id))
      .returning();

    res.json({ enquiry: updated });
  } catch (error) {
    console.error('Update enquiry address error:', error);
    res.status(500).json({ error: 'Failed to update delivery address.' });
  }
});

customerRouter.post('/quotations/:id/respond', requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const { action, feedback } = req.body; // accept | modify | reject

    const [quotation] = await db
      .select()
      .from(projectQuotations)
      .where(eq(projectQuotations.id, id))
      .limit(1);
    if (!quotation || quotation.status === 'Draft') {
      return res.status(404).json({ error: 'Published quotation not found.' });
    }

    const [enquiry] = await db
      .select()
      .from(projectEnquiries)
      .where(and(eq(projectEnquiries.id, quotation.enquiryId), eq(projectEnquiries.userId, req.dbUser!.id)))
      .limit(1);
    if (!enquiry) return res.status(403).json({ error: 'Unauthorized quotation access.' });

    let nextQuotationStatus = quotation.status;
    let nextEnquiryStatus = enquiry.status;
    if (action === 'accept') {
      nextQuotationStatus = 'Accepted';
      nextEnquiryStatus = 'Advance Payment Pending';
    } else if (action === 'modify') {
      nextQuotationStatus = 'Modification Requested';
      nextEnquiryStatus = 'Under Technical Evaluation';
    } else if (action === 'reject') {
      nextQuotationStatus = 'Rejected';
      nextEnquiryStatus = 'Closed';
    } else {
      return res.status(400).json({ error: 'Invalid quotation action.' });
    }

    const [updatedQuotation] = await db
      .update(projectQuotations)
      .set({
        status: nextQuotationStatus,
        customerFeedback: String(feedback || ''),
      })
      .where(eq(projectQuotations.id, id))
      .returning();

    await db
      .update(projectEnquiries)
      .set({ status: nextEnquiryStatus, updatedAt: new Date() })
      .where(eq(projectEnquiries.id, enquiry.id));

    await notifyAdmins({
      title: `Quotation ${quotation.quotationNumber}: ${nextQuotationStatus}`,
      message: `${enquiry.customerName} responded "${nextQuotationStatus}" for ${enquiry.enquiryNumber}.`,
      link: '/admin/project-enquiries',
    });

    syncProjectQuotationToSupabase({
      registrationNumber: enquiry.enquiryNumber,
      quotation: updatedQuotation,
    }).catch(() => {});

    let acceptance: any = null;
    let milestones: any[] = [];
    if (action === 'accept') {
      const [acc] = await db
        .insert(projectAcceptances)
        .values({
          enquiryId: enquiry.id,
          quotationId: quotation.id,
          userId: req.dbUser!.id,
          acceptedByEmail: req.dbUser!.email,
          notes: String(feedback || ''),
        })
        .returning();
      acceptance = acc;

      // Ensure payment plan & milestones exist for this quotation
      const existingPlans = await db
        .select()
        .from(projectPaymentPlans)
        .where(eq(projectPaymentPlans.quotationId, quotation.id))
        .limit(1);

      let plan = existingPlans[0];
      const advPct = Number(quotation.advancePercent || 50);
      const finPct = Math.max(0, 100 - advPct);
      if (!plan) {
        const [createdPlan] = await db
          .insert(projectPaymentPlans)
          .values({
            enquiryId: enquiry.id,
            quotationId: quotation.id,
            planType: advPct === 100 ? 'full_100' : advPct === 50 ? '50_50_split' : 'custom_split',
            advancePercent: advPct,
            finalPercent: finPct,
            allowFullPayment: quotation.allowFullPayment ?? true,
            isOverride: Boolean(quotation.planOverrideReason),
            overrideReason: quotation.planOverrideReason || '',
            createdBy: 'system',
          })
          .returning();
        plan = createdPlan;
      }

      const existingMilestones = await db
        .select()
        .from(projectPaymentMilestones)
        .where(eq(projectPaymentMilestones.quotationId, quotation.id));

      if (existingMilestones.length === 0) {
        const m1 = await db
          .insert(projectPaymentMilestones)
          .values({
            planId: plan.id,
            quotationId: quotation.id,
            stageName: 'Advance Payment',
            stageOrder: 1,
            percent: advPct,
            amountInr: quotation.advanceAmountInr,
            amountPaise: Math.round(quotation.advanceAmountInr * 100),
            dueTrigger: 'on_acceptance',
            status: 'pending',
          })
          .returning();
        milestones.push(...m1);

        if (quotation.balanceAmountInr > 0) {
          const m2 = await db
            .insert(projectPaymentMilestones)
            .values({
              planId: plan.id,
              quotationId: quotation.id,
              stageName: 'Final Balance Payment',
              stageOrder: 2,
              percent: finPct,
              amountInr: quotation.balanceAmountInr,
              amountPaise: Math.round(quotation.balanceAmountInr * 100),
              dueTrigger: 'on_completion',
              status: 'pending',
            })
            .returning();
          milestones.push(...m2);
        }
      } else {
        milestones = existingMilestones;
      }

      await dispatchLifecycleEmail({
        userId: req.dbUser!.id,
        enquiryId: enquiry.id,
        recipientEmail: enquiry.customerEmail || req.dbUser!.email,
        eventType: 'project_approved',
        vars: {
          customerName: enquiry.customerName,
          enquiryNumber: enquiry.enquiryNumber,
          quotationNumber: quotation.quotationNumber || `REV-${quotation.revisionNumber}`,
          advancePercent: advPct,
          advanceAmountInr: quotation.advanceAmountInr,
          balanceAmountInr: quotation.balanceAmountInr,
          totalAmountInr: quotation.totalAmountInr,
        },
      });
    }

    res.json({ quotation: updatedQuotation, acceptance, milestones });
  } catch (error) {
    console.error('Quotation respond error:', error);
    res.status(500).json({ error: 'Failed to update quotation response.' });
  }
});

// PCB & B2B Enquiries
customerRouter.post(
  '/pcb-enquiries',
  requireAuth,
  pcbUpload.array('attachments', 5),
  async (req: AuthRequest, res) => {
    try {
      const b = req.body;
      if (!b.boardDimensionsMm || !b.customerName || !b.mobile) {
        return res.status(400).json({ error: 'Customer name, mobile, and board dimensions are required.' });
      }
      const files = (req.files as Express.Multer.File[]) || [];
      if (files.length > 0 && !isSupabaseStorageConfigured()) {
        return res.status(503).json({
          error: 'Supabase Storage is not configured. PCB Gerber/BOM files require cloud storage.',
        });
      }
      const attachments = await Promise.all(
        files.map(async (f) => {
          const up = await uploadPcbFileToSupabase({
            buffer: f.buffer,
            originalName: f.originalname,
            mimeType: f.mimetype || 'application/octet-stream',
            ownerUid: req.dbUser!.uid,
          });
          return {
            originalName: f.originalname,
            storagePath: up.storagePath,
            bucket: up.bucket,
            sizeBytes: f.size,
          };
        })
      );

      const pcbCutoff = new Date(Date.now() - 60 * 1000);
      const recentPcbDup = await db
        .select()
        .from(pcbEnquiries)
        .where(
          and(
            eq(pcbEnquiries.userId, req.dbUser!.id),
            eq(pcbEnquiries.boardDimensionsMm, String(b.boardDimensionsMm).trim()),
            eq(pcbEnquiries.layerCount, Number(b.layerCount || 2)),
            gte(pcbEnquiries.createdAt, pcbCutoff)
          )
        )
        .limit(1);
      if (recentPcbDup.length > 0) {
        return res.status(200).json({ deduplicated: true, enquiry: recentPcbDup[0] });
      }

      const enquiryNumber = generateCode('NTF-PCB');
      const [created] = await db
        .insert(pcbEnquiries)
        .values({
          enquiryNumber,
          userId: req.dbUser!.id,
          customerId: req.activeCustomerId || req.dbUser!.customerId || '',
          customerName: String(b.customerName).trim(),
          email: String(b.email || req.dbUser!.email).trim(),
          mobile: String(b.mobile).trim(),
          boardDimensionsMm: String(b.boardDimensionsMm).trim(),
          layerCount: Number(b.layerCount || 2),
          boardQuantity: Math.max(1, Number(b.boardQuantity || 5)),
          assemblyRequired: b.assemblyRequired === 'true' || b.assemblyRequired === true,
          surfaceFinish: String(b.surfaceFinish || 'HASL Lead-Free'),
          specialInstructions: String(b.specialInstructions || ''),
          attachments,
          status: 'Submitted',
        })
        .returning();

      await Promise.all([
        createNotification({
          userId: req.dbUser!.id,
          title: `PCB Enquiry ${created.enquiryNumber} Submitted`,
          message: `${created.layerCount}-layer PCB (${created.boardDimensionsMm} mm, Qty ${created.boardQuantity}) queued for engineering review.`,
          link: '/my-account/pcb',
        }),
        notifyAdmins({
          type: 'enquiry',
          entityType: 'pcb_enquiry',
          entityId: created.enquiryNumber,
          customerId: req.activeCustomerId || req.dbUser!.customerId || '',
          title: `New PCB Enquiry: ${created.enquiryNumber}`,
          message: `${created.customerName} submitted PCB enquiry (${created.layerCount} layers, ${created.boardQuantity} boards).`,
          link: '/admin/enquiries',
        }),
      ]);

      for (const att of attachments) {
        db.insert(enquiryAttachments)
          .values({
            enquirySource: 'pcb',
            enquiryId: created.id,
            enquiryNumber: created.enquiryNumber,
            userId: req.dbUser!.id,
            customerId: created.customerId || '',
            fileName: att.originalName,
            sizeBytes: att.sizeBytes,
            storageBucket: att.bucket,
            storagePath: att.storagePath,
            uploadedBy: created.email,
          })
          .catch(() => {});
        syncEnquiryAttachmentToSupabase({
          enquirySource: 'pcb',
          enquiryId: created.id,
          enquiryNumber: created.enquiryNumber,
          userUid: req.dbUser!.uid,
          customerId: created.customerId || '',
          fileName: att.originalName,
          sizeBytes: att.sizeBytes,
          storageBucket: att.bucket,
          storagePath: att.storagePath,
          uploadedBy: created.email,
        }).catch(() => {});
      }

      createOrSyncServiceRecord({
        serviceCode: 'SRV-PCB',
        userId: req.dbUser!.id,
        userUid: req.dbUser!.uid,
        customerId: created.customerId || req.activeCustomerId || req.dbUser!.customerId || req.dbUser!.uid,
        customerEmail: created.email,
        serviceName: `PCB Fabrication — ${created.layerCount}L (${created.boardDimensionsMm} mm)`,
        category: 'PCB',
        description: created.specialInstructions || `${created.layerCount}-Layer ${created.surfaceFinish} PCB`,
        specifications: `${created.boardDimensionsMm} mm · ${created.surfaceFinish} · Assembly: ${created.assemblyRequired ? 'Yes' : 'No'}`,
        selectedOptions: {
          layerCount: created.layerCount,
          boardDimensionsMm: created.boardDimensionsMm,
          surfaceFinish: created.surfaceFinish,
          assemblyRequired: created.assemblyRequired,
        },
        uploadedFiles: attachments,
        quantity: created.boardQuantity,
        status: created.status,
        sourceEntityType: 'pcb_enquiry',
        sourceEntityId: created.enquiryNumber,
      }).catch(() => {});

      syncPcbEnquiryToSupabase({
        enquiryNumber: created.enquiryNumber,
        userUid: req.dbUser!.uid,
        customerId: req.activeCustomerId || req.dbUser!.customerId,
        customerName: created.customerName,
        email: created.email,
        mobile: created.mobile,
        boardDimensionsMm: created.boardDimensionsMm,
        layerCount: created.layerCount,
        boardQuantity: created.boardQuantity,
        assemblyRequired: created.assemblyRequired,
        surfaceFinish: created.surfaceFinish,
        specialInstructions: created.specialInstructions,
        attachments: created.attachments,
        quotedAmountInr: created.quotedAmountInr,
        paymentStatus: created.paymentStatus,
        status: created.status,
      }).catch(() => {});
      await logCustomerActivity(
        req.dbUser!,
        req.activeCustomerId,
        'PCB_ENQUIRY_SUBMITTED',
        'pcb_enquiry',
        created.enquiryNumber,
        { layerCount: created.layerCount, boardQuantity: created.boardQuantity }
      );

      res.status(201).json({ enquiry: created });
    } catch (error) {
      console.error('PCB enquiry error:', error);
      res.status(500).json({ error: 'Failed to submit PCB enquiry.' });
    }
  }
);

customerRouter.post(
  '/b2b-enquiries',
  requireAuth,
  b2bUpload.array('attachments', 5),
  async (req: AuthRequest, res) => {
    try {
      const b = req.body;
      if (!b.companyName || !b.contactPerson || !b.mobile || !b.technicalSpecs || !b.shippingLocation) {
        return res.status(400).json({ error: 'Company name, contact, mobile, specs, and shipping location are required.' });
      }
      const files = (req.files as Express.Multer.File[]) || [];
      if (files.length > 0 && !isSupabaseStorageConfigured()) {
        return res.status(503).json({
          error: 'Supabase Storage is not configured. B2B RFQ attachments require cloud storage.',
        });
      }
      const attachments = await Promise.all(
        files.map(async (f) => {
          const up = await uploadPrivateBufferToSupabaseStorage({
            bucket: 'customer-uploads',
            buffer: f.buffer,
            originalName: f.originalname,
            mimeType: f.mimetype || 'application/octet-stream',
            ownerPrefix: req.dbUser!.uid,
            folder: 'b2b-rfq',
          });
          return {
            originalName: f.originalname,
            storagePath: up.storagePath,
            bucket: up.bucket,
            sizeBytes: f.size,
          };
        })
      );

      const b2bCutoff = new Date(Date.now() - 60 * 1000);
      const recentB2bDup = await db
        .select()
        .from(b2bEnquiries)
        .where(
          and(
            eq(b2bEnquiries.userId, req.dbUser!.id),
            eq(b2bEnquiries.companyName, String(b.companyName).trim()),
            eq(b2bEnquiries.requirementCategory, String(b.requirementCategory || 'Bulk Hardware')),
            gte(b2bEnquiries.createdAt, b2bCutoff)
          )
        )
        .limit(1);
      if (recentB2bDup.length > 0) {
        return res.status(200).json({ deduplicated: true, enquiry: recentB2bDup[0] });
      }

      const enquiryNumber = generateCode('NTF-B2B');
      const [created] = await db
        .insert(b2bEnquiries)
        .values({
          enquiryNumber,
          userId: req.dbUser!.id,
          customerId: req.activeCustomerId || req.dbUser!.customerId || '',
          companyName: String(b.companyName).trim(),
          contactPerson: String(b.contactPerson).trim(),
          email: String(b.email || req.dbUser!.email).trim(),
          mobile: String(b.mobile).trim(),
          gstin: String(b.gstin || '').trim(),
          requirementCategory: String(b.requirementCategory || 'Bulk Hardware'),
          quantity: Math.max(1, Number(b.quantity || 10)),
          technicalSpecs: String(b.technicalSpecs).trim(),
          expectedDeliveryDate: String(b.expectedDeliveryDate || ''),
          shippingLocation: String(b.shippingLocation).trim(),
          attachments,
          status: 'Submitted',
        })
        .returning();

      await Promise.all([
        createNotification({
          userId: req.dbUser!.id,
          title: `B2B RFQ ${created.enquiryNumber} Submitted`,
          message: `Business enquiry for ${created.requirementCategory} (Qty ${created.quantity}) has been logged for quotation.`,
          link: '/my-account/b2b-support',
        }),
        notifyAdmins({
          type: 'enquiry',
          entityType: 'b2b_enquiry',
          entityId: created.enquiryNumber,
          customerId: req.activeCustomerId || req.dbUser!.customerId || '',
          title: `New B2B RFQ: ${created.enquiryNumber}`,
          message: `${created.companyName} (${created.contactPerson}) submitted B2B request for ${created.requirementCategory}.`,
          link: '/admin/enquiries',
        }),
      ]);

      for (const att of attachments) {
        db.insert(enquiryAttachments)
          .values({
            enquirySource: 'b2b',
            enquiryId: created.id,
            enquiryNumber: created.enquiryNumber,
            userId: req.dbUser!.id,
            customerId: created.customerId || '',
            fileName: att.originalName,
            sizeBytes: att.sizeBytes,
            storageBucket: att.bucket,
            storagePath: att.storagePath,
            uploadedBy: created.email,
          })
          .catch(() => {});
        syncEnquiryAttachmentToSupabase({
          enquirySource: 'b2b',
          enquiryId: created.id,
          enquiryNumber: created.enquiryNumber,
          userUid: req.dbUser!.uid,
          customerId: created.customerId || '',
          fileName: att.originalName,
          sizeBytes: att.sizeBytes,
          storageBucket: att.bucket,
          storagePath: att.storagePath,
          uploadedBy: created.email,
        }).catch(() => {});
      }

      createOrSyncServiceRecord({
        serviceCode: 'SRV-B2B-MFG',
        userId: req.dbUser!.id,
        userUid: req.dbUser!.uid,
        customerId: created.customerId || req.activeCustomerId || req.dbUser!.customerId || req.dbUser!.uid,
        customerEmail: created.email,
        serviceName: `B2B RFQ — ${created.requirementCategory}`,
        category: 'B2B',
        description: created.technicalSpecs,
        specifications: `${created.companyName} · Delivery: ${created.shippingLocation}`,
        selectedOptions: {
          gstin: created.gstin,
          expectedDeliveryDate: created.expectedDeliveryDate,
          shippingLocation: created.shippingLocation,
        },
        uploadedFiles: attachments,
        quantity: created.quantity,
        status: created.status,
        sourceEntityType: 'b2b_enquiry',
        sourceEntityId: created.enquiryNumber,
      }).catch(() => {});

      syncB2bEnquiryToSupabase({
        enquiryNumber: created.enquiryNumber,
        userUid: req.dbUser!.uid,
        customerId: req.activeCustomerId || req.dbUser!.customerId,
        companyName: created.companyName,
        contactPerson: created.contactPerson,
        email: created.email,
        mobile: created.mobile,
        gstin: created.gstin,
        requirementCategory: created.requirementCategory,
        quantity: created.quantity,
        technicalSpecs: created.technicalSpecs,
        expectedDeliveryDate: created.expectedDeliveryDate,
        shippingLocation: created.shippingLocation,
        attachments: created.attachments,
        quotedAmountInr: created.quotedAmountInr,
        paymentStatus: created.paymentStatus,
        status: created.status,
      }).catch(() => {});
      await logCustomerActivity(
        req.dbUser!,
        req.activeCustomerId,
        'B2B_ENQUIRY_SUBMITTED',
        'b2b_enquiry',
        created.enquiryNumber,
        { companyName: created.companyName, quantity: created.quantity }
      );

      res.status(201).json({ enquiry: created });
    } catch (error) {
      console.error('B2B enquiry error:', error);
      res.status(500).json({ error: 'Failed to submit B2B enquiry.' });
    }
  }
);

// Unified Payment Order Creation & Verification (Store, 3D Printing, Project Quotation, PCB, B2B)
customerRouter.post('/payments/create-order', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { entityType, entityId } = req.body;
    const id = Number(entityId);
    let amountInr = 0;
    let receipt = '';

    if (entityType === 'store_order') {
      const [row] = await db
        .select()
        .from(storeOrders)
        .where(and(eq(storeOrders.id, id), eq(storeOrders.userId, req.dbUser!.id)))
        .limit(1);
      if (!row) return res.status(404).json({ error: 'Order not found.' });
      if (row.paymentStatus === 'paid') return res.status(400).json({ error: 'Order already paid.' });
      amountInr = row.totalInr;
      receipt = row.orderNumber;
    } else if (entityType === 'printing_order') {
      const [row] = await db
        .select()
        .from(printingOrders)
        .where(and(eq(printingOrders.id, id), eq(printingOrders.userId, req.dbUser!.id)))
        .limit(1);
      if (!row) return res.status(404).json({ error: 'Printing enquiry not found.' });
      if (row.paymentStatus === 'paid' && row.refundStatus === 'none') {
        return res.status(400).json({ error: 'This 3D printing enquiry is already paid in full.' });
      }
      if (row.orderStatus === 'Cancelled' || row.orderStatus === 'Rejected') {
        return res.status(400).json({ error: `${row.orderStatus} enquiries cannot be paid.` });
      }
      if (
        row.totalInr <= 0 ||
        (row.pricingBreakdown.technicalReviewRequired &&
          row.quotedPriceInr === null &&
          (row.orderStatus === 'File Under Review' || row.orderStatus === 'Technical Review'))
      ) {
        return res.status(400).json({ error: 'This CAD enquiry is awaiting an engineering quotation from Admin before payment.' });
      }
      amountInr = row.totalInr;
      receipt = row.orderNumber;
    } else if (entityType === 'project_quotation') {
      const paymentMode = String(req.body.paymentMode || 'advance'); // advance | full | balance
      const [q] = await db.select().from(projectQuotations).where(eq(projectQuotations.id, id)).limit(1);
      if (!q) return res.status(404).json({ error: 'Quotation not found.' });
      const [enq] = await db
        .select()
        .from(projectEnquiries)
        .where(and(eq(projectEnquiries.id, q.enquiryId), eq(projectEnquiries.userId, req.dbUser!.id)))
        .limit(1);
      if (!enq) return res.status(403).json({ error: 'Unauthorized quotation payment.' });
      if (q.status !== 'Accepted') {
        return res.status(400).json({ error: 'Please accept the quotation before paying.' });
      }
      const alreadyPaid = Number(q.paidAmountInr || 0);
      const remaining = Math.max(0, q.totalAmountInr - alreadyPaid);
      if (remaining <= 0 || q.paymentStatus === 'paid') {
        return res.status(400).json({ error: 'Quotation is already paid in full.' });
      }
      if (paymentMode === 'full') {
        if (q.allowFullPayment === false && alreadyPaid === 0) {
          return res.status(400).json({ error: 'Full upfront payment is disabled for this quotation; please pay advance.' });
        }
        amountInr = remaining;
      } else if (paymentMode === 'balance') {
        amountInr = remaining;
      } else {
        amountInr = alreadyPaid > 0 ? remaining : q.advanceAmountInr;
      }
      receipt = `${enq.enquiryNumber}-Q${q.revisionNumber}-${paymentMode.toUpperCase()}`;
    } else if (entityType === 'project_installment') {
      const [inst] = await db.select().from(paymentInstallments).where(eq(paymentInstallments.id, id)).limit(1);
      if (!inst) return res.status(404).json({ error: 'Project installment not found.' });
      const [proj] = await db
        .select()
        .from(projects)
        .where(and(eq(projects.id, inst.projectId), eq(projects.userId, req.dbUser!.id)))
        .limit(1);
      if (!proj) return res.status(403).json({ error: 'Unauthorized project installment payment.' });
      if (inst.status === 'Paid') return res.status(400).json({ error: 'Installment is already paid in full.' });
      const remaining = Math.max(0, Number(inst.amountInr || 0) - Number(inst.paidAmountInr || 0));
      if (remaining < 1) return res.status(400).json({ error: 'No pending balance on this installment.' });
      amountInr = remaining;
      receipt = `${proj.projectCode}-INST${inst.installmentNumber}`;
    } else if (entityType === 'pcb_enquiry') {
      const [pcb] = await db
        .select()
        .from(pcbEnquiries)
        .where(and(eq(pcbEnquiries.id, id), eq(pcbEnquiries.userId, req.dbUser!.id)))
        .limit(1);
      if (!pcb || !pcb.quotedAmountInr) {
        return res.status(400).json({ error: 'PCB quotation has not been issued yet.' });
      }
      amountInr = pcb.quotedAmountInr;
      receipt = pcb.enquiryNumber;
    } else if (entityType === 'b2b_enquiry') {
      const [b2b] = await db
        .select()
        .from(b2bEnquiries)
        .where(and(eq(b2bEnquiries.id, id), eq(b2bEnquiries.userId, req.dbUser!.id)))
        .limit(1);
      if (!b2b || !b2b.quotedAmountInr) {
        return res.status(400).json({ error: 'B2B quotation has not been issued yet.' });
      }
      amountInr = b2b.quotedAmountInr;
      receipt = b2b.enquiryNumber;
    } else {
      return res.status(400).json({ error: 'Unsupported payment entity type.' });
    }

    const rzp = await createRazorpayOrder({
      amountInr,
      receipt,
      notes: { entityType, entityId: String(id), userId: String(req.dbUser!.id) },
    });

    // Save order ID on target record
    if (entityType === 'store_order') {
      await db.update(storeOrders).set({ razorpayOrderId: rzp.razorpayOrderId }).where(eq(storeOrders.id, id));
    } else if (entityType === 'printing_order') {
      await db.update(printingOrders).set({ razorpayOrderId: rzp.razorpayOrderId }).where(eq(printingOrders.id, id));
    } else if (entityType === 'project_quotation') {
      await db.update(projectQuotations).set({ razorpayOrderId: rzp.razorpayOrderId }).where(eq(projectQuotations.id, id));
    } else if (entityType === 'project_installment') {
      await db.update(paymentInstallments).set({ razorpayOrderId: rzp.razorpayOrderId }).where(eq(paymentInstallments.id, id));
    } else if (entityType === 'pcb_enquiry') {
      await db.update(pcbEnquiries).set({ razorpayOrderId: rzp.razorpayOrderId }).where(eq(pcbEnquiries.id, id));
    } else if (entityType === 'b2b_enquiry') {
      await db.update(b2bEnquiries).set({ razorpayOrderId: rzp.razorpayOrderId }).where(eq(b2bEnquiries.id, id));
    }

    res.json({
      ...rzp,
      amountInr,
      amountPaise: Math.round(amountInr * 100),
      receipt,
      customer: {
        name: req.dbUser!.fullName || req.dbUser!.email,
        email: req.dbUser!.email,
        contact: req.dbUser!.mobile || '',
      },
    });
  } catch (error: any) {
    console.error('Payment create-order error:', error);
    res.status(500).json({ error: error?.message || 'Failed to initiate payment.' });
  }
});

customerRouter.post('/payments/verify', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { entityType, entityId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;
    const id = Number(entityId);

    const creds = await getRazorpayCredentials();
    const hasLiveOrTestKeys = Boolean(creds.keyId && creds.keySecret);
    if (hasLiveOrTestKeys && (!razorpayPaymentId || !razorpaySignature || !razorpayOrderId)) {
      return res.status(400).json({ error: 'Missing Razorpay payment verification parameters.' });
    }

    const paymentIdToVerify = hasLiveOrTestKeys
      ? String(razorpayPaymentId)
      : String(razorpayPaymentId || `pay_test_${crypto.randomBytes(6).toString('hex')}`);
    const signatureToVerify = hasLiveOrTestKeys
      ? String(razorpaySignature)
      : String(razorpaySignature || 'test_sig');

    const valid = await verifyRazorpaySignature({
      razorpayOrderId: String(razorpayOrderId || ''),
      razorpayPaymentId: paymentIdToVerify,
      razorpaySignature: signatureToVerify,
    });

    if (!valid) {
      return res.status(400).json({ error: 'Payment signature verification failed.' });
    }

    // Idempotency check
    const existingPayment = await db
      .select()
      .from(payments)
      .where(eq(payments.razorpayPaymentId, paymentIdToVerify))
      .limit(1);
    if (existingPayment.length > 0) {
      return res.json({ verified: true, payment: existingPayment[0], duplicate: true });
    }

    if (entityType === 'project_installment') {
      const [inst] = await db.select().from(paymentInstallments).where(eq(paymentInstallments.id, id)).limit(1);
      if (!inst) return res.status(404).json({ error: 'Project installment not found.' });
      const [proj] = await db
        .select()
        .from(projects)
        .where(and(eq(projects.id, inst.projectId), eq(projects.userId, req.dbUser!.id)))
        .limit(1);
      if (!proj) return res.status(403).json({ error: 'Unauthorized project installment payment.' });

      const payableAmt = Math.max(0, Number(inst.amountInr || 0) - Number(inst.paidAmountInr || 0));
      const rec = await recordInstallmentPayment({
        projectId: proj.id,
        installmentNumber: inst.installmentNumber === 2 ? 2 : 1,
        amountInr: payableAmt > 0 ? payableAmt : inst.amountInr,
        paymentMethod: 'razorpay_checkout',
        transactionRef: paymentIdToVerify,
        razorpayOrderId: String(razorpayOrderId || inst.razorpayOrderId || ''),
        razorpayPaymentId: paymentIdToVerify,
        razorpaySignature: signatureToVerify,
        recordedBy: req.dbUser!.email,
        notes: 'Verified via Razorpay Checkout.',
      });
      await db.insert(payments).values({
        paymentRef: rec.transaction.transactionRef,
        userId: req.dbUser!.id,
        customerId: proj.customerId,
        entityType: 'project_installment',
        entityId: inst.id,
        projectId: proj.id,
        projectCode: proj.projectCode,
        paymentStage: inst.installmentNumber === 1 ? 'advance' : 'final',
        razorpayOrderId: String(razorpayOrderId || ''),
        razorpayPaymentId: paymentIdToVerify,
        razorpaySignature: signatureToVerify,
        amountInr: rec.transaction.amountInr,
        amountPaise: rec.transaction.amountInr * 100,
        mode: paymentIdToVerify.startsWith('pay_test_') ? 'test_mode' : 'live_razorpay',
        status: 'verified',
        paymentDate: new Date(),
        verifiedAt: new Date(),
      }).catch(() => {});

      emitAdminStreamEvent({ type: 'project', action: 'installment_paid', id: proj.projectCode });
      return res.json({
        verified: true,
        installment: rec.installment,
        transaction: rec.transaction,
        project: rec.project,
        receipt: rec.receipt,
        finalInvoice: rec.finalInvoice,
      });
    }

    if (entityType === 'project_quotation') {
      try {
        const result = await reconcileProjectQuotationPayment({
          quotationId: id,
          razorpayOrderId: String(razorpayOrderId || ''),
          razorpayPaymentId: paymentIdToVerify,
          razorpaySignature: signatureToVerify,
          paymentMode: String(req.body.paymentMode || 'advance'),
          expectedUserId: req.dbUser!.id,
        });
        return res.json({
          verified: true,
          duplicate: result.duplicate,
          payment: result.payment,
          receipt: (result as any).receipt,
          invoice: (result as any).invoice,
          clearanceCertificate: (result as any).clearanceCertificate,
          project: (result as any).project,
        });
      } catch (err: any) {
        return res.status(err?.status || 400).json({ error: err?.message || 'Project payment verification failed.' });
      }
    }

    const [[companyRow], [projCfgRow]] = await Promise.all([
      db.select().from(siteSettings).where(eq(siteSettings.key, 'companyInfo')).limit(1),
      db.select().from(siteSettings).where(eq(siteSettings.key, 'projectPaymentSettings')).limit(1),
    ]);
    const companyInfo = (companyRow?.value as { gstin?: string }) || {};
    const projCfg = (projCfgRow?.value as { enableGstTax?: boolean }) || {};
    const isGstEnabled = Boolean(companyInfo.gstin && companyInfo.gstin.trim() && projCfg.enableGstTax);
    const docType = isGstEnabled ? 'GST Tax Invoice' : 'Proforma Invoice / Payment Receipt';

    let amountInr = 0;
    let gstInr = 0;
    const paymentStage = entityType === 'store_order' ? 'store' : entityType;
    let payload: Record<string, unknown> = {};

    if (entityType === 'store_order') {
      const [existingOrd] = await db
        .select()
        .from(storeOrders)
        .where(and(eq(storeOrders.id, id), eq(storeOrders.userId, req.dbUser!.id)))
        .limit(1);
      if (!existingOrd) return res.status(404).json({ error: 'Order not found.' });

      const nextHistory = [
        ...(existingOrd.statusHistory || [
          {
            status: 'Order Placed',
            timestamp: existingOrd.createdAt.toISOString(),
            note: 'Order created.',
            actor: req.dbUser!.email,
          },
        ]),
        {
          status: 'Payment Confirmed',
          timestamp: new Date().toISOString(),
          note: `Razorpay payment verified (${paymentIdToVerify}).`,
          actor: 'Razorpay Gateway',
        },
      ];

      const [order] = await db
        .update(storeOrders)
        .set({
          paymentStatus: 'paid',
          orderStatus: 'Payment Confirmed',
          razorpayPaymentId: paymentIdToVerify,
          statusHistory: nextHistory,
          updatedAt: new Date(),
        })
        .where(eq(storeOrders.id, existingOrd.id))
        .returning();

      saveCustomerCartState({
        userId: req.dbUser!.id,
        userUid: req.dbUser!.uid,
        customerId: req.activeCustomerId || req.dbUser!.customerId,
        rawItems: [],
        couponCode: '',
      }).catch(() => {});
      clearGuestCartState(req, res).catch(() => {});
      emitCustomerStreamEvent(req.dbUser!.id, {
        type: 'cart',
        action: 'cleared',
        id: order.orderNumber,
      });

      amountInr = order.totalInr;
      gstInr = order.gstInr;
      const addrState = String(order.shippingAddress?.state || order.billingAddress?.state || '').trim();
      const isIntraState = /maharashtra/i.test(addrState);
      const cgstInr = isIntraState ? Math.floor(gstInr / 2) : 0;
      const sgstInr = isIntraState ? gstInr - cgstInr : 0;
      const igstInr = isIntraState ? 0 : gstInr;

      payload = {
        orderNumber: order.orderNumber,
        items: order.items,
        shippingAddress: order.shippingAddress,
        billingAddress: order.billingAddress || order.shippingAddress,
        customerName: order.shippingAddress?.fullName || req.dbUser!.fullName || req.dbUser!.email,
        customerPhone: order.shippingAddress?.mobile || req.dbUser!.mobile || '',
        customerEmail: req.dbUser!.email,
        subtotalInr: order.subtotalInr,
        discountInr: order.discountInr,
        shippingInr: order.shippingInr,
        gstInr: order.gstInr,
        cgstInr,
        sgstInr,
        igstInr,
        isIntraState,
        paymentMethod: 'Razorpay',
        razorpayPaymentId: paymentIdToVerify,
        razorpayOrderId: String(razorpayOrderId || order.razorpayOrderId || ''),
      };
    } else if (entityType === 'printing_order') {
      const [order] = await db
        .update(printingOrders)
        .set({
          paymentStatus: 'paid',
          refundStatus: 'none',
          paymentVerifiedAt: new Date(),
          orderStatus: 'Payment Completed',
          razorpayPaymentId: paymentIdToVerify,
          updatedAt: new Date(),
        })
        .where(and(eq(printingOrders.id, id), eq(printingOrders.userId, req.dbUser!.id)))
        .returning();
      if (!order) return res.status(404).json({ error: 'Printing enquiry not found.' });
      syncPrintingOrderToSupabase({
        orderNumber: order.orderNumber,
        customerId: order.customerId,
        customerName: order.customerName,
        email: order.email,
        phone: order.phone,
        fileName: order.fileName,
        fileFormat: order.fileFormat,
        fileSizeBytes: order.fileSizeBytes,
        fileStoragePath: order.fileStoragePath,
        storageBucket: order.storageBucket,
        technology: order.technology,
        materialName: order.materialName,
        colorName: order.colorName,
        quotedPriceInr: order.quotedPriceInr,
        totalInr: order.totalInr,
        paymentStatus: order.paymentStatus,
        refundStatus: order.refundStatus,
        razorpayOrderId: order.razorpayOrderId,
        razorpayPaymentId: order.razorpayPaymentId,
        orderStatus: order.orderStatus,
        rejectionReason: order.rejectionReason,
      }).catch(() => {});
      await Promise.all([
        createNotification({
          userId: req.dbUser!.id,
          title: `3D Print Payment Verified — ${order.orderNumber}`,
          message: `Payment of ₹${order.totalInr.toLocaleString('en-IN')} is verified (Payment Completed). Your job is ready for printing authorization.`,
          link: '/my-account',
        }),
        dispatchLifecycleEmail({
          userId: req.dbUser!.id,
          recipientEmail: order.email || req.dbUser!.email,
          eventType: 'printing_payment_confirmed',
          vars: {
            customerName: order.customerName || req.dbUser!.fullName || req.dbUser!.email,
            orderNumber: order.orderNumber,
            fileName: order.fileName,
            amountInr: order.totalInr,
          },
        }),
      ]);
      amountInr = order.totalInr;
      gstInr = order.pricingBreakdown.gstInr;
      payload = {
        orderNumber: order.orderNumber,
        fileName: order.fileName,
        material: `${order.materialName} (${order.colorName})`,
        pricingBreakdown: order.pricingBreakdown,
      };
    } else if (entityType === 'pcb_enquiry') {
      const [pcb] = await db
        .update(pcbEnquiries)
        .set({ paymentStatus: 'paid', status: 'In Production', updatedAt: new Date() })
        .where(and(eq(pcbEnquiries.id, id), eq(pcbEnquiries.userId, req.dbUser!.id)))
        .returning();
      if (!pcb) return res.status(404).json({ error: 'PCB enquiry not found.' });
      amountInr = pcb.quotedAmountInr || 0;
      payload = { enquiryNumber: pcb.enquiryNumber, boardDimensionsMm: pcb.boardDimensionsMm };
    } else if (entityType === 'b2b_enquiry') {
      const [b2b] = await db
        .update(b2bEnquiries)
        .set({ paymentStatus: 'paid', status: 'Order Confirmed', updatedAt: new Date() })
        .where(and(eq(b2bEnquiries.id, id), eq(b2bEnquiries.userId, req.dbUser!.id)))
        .returning();
      if (!b2b) return res.status(404).json({ error: 'B2B enquiry not found.' });
      amountInr = b2b.quotedAmountInr || 0;
      payload = { enquiryNumber: b2b.enquiryNumber, companyName: b2b.companyName };
    }

    const customerCode = req.activeCustomerId || req.dbUser!.customerId || req.dbUser!.uid || '';
    const mode = paymentIdToVerify.startsWith('pay_test_') ? 'test_mode' : 'live_razorpay';
    const paymentRef = generateCode('NTF-PAY');
    const [paymentRecord] = await db
      .insert(payments)
      .values({
        paymentRef,
        userId: req.dbUser!.id,
        customerId: customerCode,
        entityType,
        entityId: id,
        paymentStage,
        razorpayOrderId: String(razorpayOrderId),
        razorpayPaymentId: paymentIdToVerify,
        razorpaySignature: signatureToVerify,
        amountInr,
        amountPaise: Math.round(amountInr * 100),
        mode,
        status: 'verified',
        paymentDate: new Date(),
        verifiedAt: new Date(),
      })
      .returning();

    const [receiptRecord] = await db
      .insert(paymentReceipts)
      .values({
        receiptNumber: generateCode('NTF-RCP'),
        paymentRef,
        userId: req.dbUser!.id,
        entityType,
        entityId: id,
        paymentStage,
        amountInr,
        amountPaise: Math.round(amountInr * 100),
        razorpayPaymentId: paymentIdToVerify,
        payload,
      })
      .returning();

    const [invoiceRecord] = await db
      .insert(invoices)
      .values({
        invoiceNumber: generateCode('NTF-INV'),
        userId: req.dbUser!.id,
        customerId: customerCode,
        entityType,
        entityId: id,
        docType,
        amountInr,
        gstInr,
        payload,
      })
      .returning();

    if (invoiceRecord) {
      await generateAndStoreInvoicePdf(invoiceRecord.id).catch((err) => {
        console.error('Invoice PDF generation warning:', err);
      });
    }

    syncPaymentToSupabase({
      paymentRef,
      userUid: req.dbUser!.uid,
      entityType,
      entityRef: String(id),
      razorpayOrderId: String(razorpayOrderId),
      razorpayPaymentId: paymentIdToVerify,
      amountInr,
      amountPaise: Math.round(amountInr * 100),
      mode,
      status: 'verified',
      verifiedAt: new Date(),
    }).catch(() => {});

    if (entityType === 'store_order') {
      const [paidOrder] = await db.select().from(storeOrders).where(eq(storeOrders.id, id)).limit(1);
      if (paidOrder) {
        await Promise.all([
          createNotification({
            userId: req.dbUser!.id,
            title: `Payment Confirmed — ${paidOrder.orderNumber}`,
            message: `Tax Invoice ${invoiceRecord.invoiceNumber} generated for ₹${paidOrder.totalInr.toLocaleString('en-IN')}.`,
            link: '/my-account',
          }),
          dispatchLifecycleEmail({
            userId: req.dbUser!.id,
            recipientEmail: req.dbUser!.email,
            eventType: 'store_payment_confirmed',
            vars: {
              customerName: paidOrder.shippingAddress?.fullName || req.dbUser!.fullName || req.dbUser!.email,
              orderNumber: paidOrder.orderNumber,
              amountInr: paidOrder.totalInr,
              invoiceNumber: invoiceRecord.invoiceNumber,
            },
          }),
        ]);

        syncStoreOrderToSupabase({
          orderNumber: paidOrder.orderNumber,
          userUid: req.dbUser!.uid,
          customerEmail: req.dbUser!.email,
          billingAddress: paidOrder.billingAddress,
          shippingAddress: paidOrder.shippingAddress,
          items: paidOrder.items,
          subtotalInr: paidOrder.subtotalInr,
          discountInr: paidOrder.discountInr,
          shippingInr: paidOrder.shippingInr,
          gstInr: paidOrder.gstInr,
          totalInr: paidOrder.totalInr,
          couponCode: paidOrder.couponCode,
          paymentStatus: paidOrder.paymentStatus,
          refundStatus: paidOrder.refundStatus,
          orderStatus: paidOrder.orderStatus,
          razorpayOrderId: paidOrder.razorpayOrderId,
          razorpayPaymentId: paidOrder.razorpayPaymentId,
        }).catch(() => {});
      }
    }

    syncInvoiceToSupabase({
      invoiceNumber: invoiceRecord.invoiceNumber,
      userUid: req.dbUser!.uid,
      entityType: invoiceRecord.entityType,
      entityId: invoiceRecord.entityId,
      docType: invoiceRecord.docType,
      amountInr: invoiceRecord.amountInr,
      gstInr: invoiceRecord.gstInr,
      payload: (invoiceRecord.payload as Record<string, unknown>) || {},
    }).catch(() => {});

    await notifyAdmins({
      type: 'payment',
      entityType,
      entityId: String(id),
      customerId: req.activeCustomerId || req.dbUser!.customerId || '',
      title: `Payment Received — ₹${amountInr.toLocaleString('en-IN')}`,
      message: `${req.dbUser!.fullName || req.dbUser!.email} completed verified payment (${paymentRef}, Invoice ${invoiceRecord.invoiceNumber}).`,
      link: entityType === 'store_order' ? '/admin/store-orders' : '/admin/payments_invoices',
    }).catch(() => {});
    emitAdminStreamEvent({ type: 'order', action: 'payment_verified', id, summary: `₹${amountInr}` });
    emitAdminStreamEvent({ type: 'invoice', action: 'created', id: invoiceRecord.invoiceNumber, summary: `₹${amountInr}` });

    await logCustomerActivity(
      req.dbUser!,
      req.activeCustomerId,
      'PAYMENT_VERIFIED',
      entityType,
      id,
      { amountInr, invoiceNumber: invoiceRecord.invoiceNumber, paymentRef }
    );

    res.json({
      verified: true,
      payment: paymentRecord,
      receipt: receiptRecord,
      invoice: invoiceRecord,
      clearanceCertificate: null,
    });
  } catch (error) {
    console.error('Verify payment error:', error);
    res.status(500).json({ error: 'Payment verification failed.' });
  }
});

// Failed Razorpay Payment Logging (from checkout payment.failed event)
customerRouter.post('/payments/failed', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { entityType, entityId, razorpayOrderId, razorpayPaymentId, errorCode, failureReason } = req.body || {};
    const id = Number(entityId || 0);
    const paymentId = String(razorpayPaymentId || `fail_${crypto.randomBytes(6).toString('hex')}`);

    // Prevent duplicate recording of the exact same failed attempt
    const existing = await db
      .select()
      .from(payments)
      .where(eq(payments.razorpayPaymentId, paymentId))
      .limit(1);
    if (existing.length > 0) {
      return res.json({ recorded: true, duplicate: true, payment: existing[0] });
    }

    let amountInr = 0;
    if (entityType === 'store_order' && id > 0) {
      const [ord] = await db
        .select()
        .from(storeOrders)
        .where(and(eq(storeOrders.id, id), eq(storeOrders.userId, req.dbUser!.id)))
        .limit(1);
      if (ord) {
        amountInr = ord.totalInr;
        if (ord.paymentStatus !== 'paid') {
          await db
            .update(storeOrders)
            .set({ paymentStatus: 'failed', updatedAt: new Date() })
            .where(eq(storeOrders.id, ord.id));
        }
      }
    } else if (entityType === 'printing_order' && id > 0) {
      const [ord] = await db
        .select()
        .from(printingOrders)
        .where(and(eq(printingOrders.id, id), eq(printingOrders.userId, req.dbUser!.id)))
        .limit(1);
      if (ord) {
        amountInr = ord.totalInr;
        if (ord.paymentStatus !== 'paid') {
          const [updatedFailPo] = await db
            .update(printingOrders)
            .set({ paymentStatus: 'failed', orderStatus: 'Payment Pending', updatedAt: new Date() })
            .where(eq(printingOrders.id, ord.id))
            .returning();
          if (updatedFailPo) {
            syncPrintingOrderToSupabase({
              orderNumber: updatedFailPo.orderNumber,
              customerId: updatedFailPo.customerId,
              customerName: updatedFailPo.customerName,
              email: updatedFailPo.email,
              phone: updatedFailPo.phone,
              fileName: updatedFailPo.fileName,
              fileFormat: updatedFailPo.fileFormat,
              fileSizeBytes: updatedFailPo.fileSizeBytes,
              fileStoragePath: updatedFailPo.fileStoragePath,
              storageBucket: updatedFailPo.storageBucket,
              technology: updatedFailPo.technology,
              materialName: updatedFailPo.materialName,
              colorName: updatedFailPo.colorName,
              quotedPriceInr: updatedFailPo.quotedPriceInr,
              totalInr: updatedFailPo.totalInr,
              paymentStatus: updatedFailPo.paymentStatus,
              refundStatus: updatedFailPo.refundStatus,
              razorpayOrderId: updatedFailPo.razorpayOrderId,
              razorpayPaymentId: updatedFailPo.razorpayPaymentId,
              orderStatus: updatedFailPo.orderStatus,
              rejectionReason: updatedFailPo.rejectionReason,
            }).catch(() => {});
          }
        }
      }
    } else if (entityType === 'project_quotation' && id > 0) {
      const [q] = await db.select().from(projectQuotations).where(eq(projectQuotations.id, id)).limit(1);
      if (q) {
        const [enq] = await db
          .select()
          .from(projectEnquiries)
          .where(and(eq(projectEnquiries.id, q.enquiryId), eq(projectEnquiries.userId, req.dbUser!.id)))
          .limit(1);
        if (enq) {
          amountInr = q.paidAmountInr > 0 ? Math.max(0, q.totalAmountInr - q.paidAmountInr) : q.advanceAmountInr;
          await dispatchLifecycleEmail({
            userId: req.dbUser!.id,
            enquiryId: enq.id,
            recipientEmail: enq.customerEmail || req.dbUser!.email,
            eventType: 'payment_failed',
            vars: {
              customerName: enq.customerName,
              enquiryNumber: enq.enquiryNumber,
              quotationNumber: q.quotationNumber || `REV-${q.revisionNumber}`,
              amountInr,
              reason: String(failureReason || 'Transaction was declined or cancelled at payment gateway.'),
            },
          });
        }
      }
    } else if (entityType === 'project_installment' && id > 0) {
      const [inst] = await db.select().from(paymentInstallments).where(eq(paymentInstallments.id, id)).limit(1);
      if (inst) {
        const [proj] = await db
          .select()
          .from(projects)
          .where(and(eq(projects.id, inst.projectId), eq(projects.userId, req.dbUser!.id)))
          .limit(1);
        if (proj) {
          amountInr = Math.max(0, Number(inst.amountInr || 0) - Number(inst.paidAmountInr || 0));
          await recordInstallmentPayment({
            projectId: proj.id,
            installmentNumber: inst.installmentNumber === 2 ? 2 : 1,
            amountInr,
            paymentMethod: 'razorpay_checkout',
            transactionRef: paymentId,
            razorpayOrderId: String(razorpayOrderId || ''),
            razorpayPaymentId: paymentId,
            recordedBy: req.dbUser!.email,
            isFailure: true,
            failureReason: String(failureReason || 'Payment failed or cancelled.'),
          }).catch(() => {});
        }
      }
    }

    const paymentRef = generateCode('NTF-FAIL');
    const [failedRow] = await db
      .insert(payments)
      .values({
        paymentRef,
        userId: req.dbUser!.id,
        entityType: String(entityType || 'store_order'),
        entityId: id,
        paymentStage: String(entityType || 'store_order'),
        razorpayOrderId: String(razorpayOrderId || ''),
        razorpayPaymentId: paymentId,
        razorpaySignature: '',
        amountInr,
        amountPaise: Math.round(amountInr * 100),
        mode: process.env.RAZORPAY_KEY_ID?.startsWith('rzp_live_') ? 'live_razorpay' : 'test_mode',
        status: 'failed',
        errorCode: String(errorCode || 'PAYMENT_FAILED'),
        failureReason: String(failureReason || 'Transaction was declined or cancelled at payment gateway.'),
      })
      .returning();

    syncPaymentToSupabase({
      paymentRef,
      userUid: req.dbUser!.uid,
      entityType: String(entityType || 'store_order'),
      entityRef: String(id),
      razorpayOrderId: String(razorpayOrderId || ''),
      razorpayPaymentId: paymentId,
      amountInr,
      amountPaise: Math.round(amountInr * 100),
      mode: failedRow.mode,
      status: 'failed',
      errorCode: failedRow.errorCode,
      failureReason: failedRow.failureReason,
    }).catch(() => {});

    res.status(201).json({ recorded: true, payment: failedRow });
  } catch (error) {
    console.error('Failed payment log error:', error);
    res.status(500).json({ error: 'Unable to log failed payment attempt.' });
  }
});

// Gated Time-Limited Project Handover Document Download
customerRouter.get('/projects/:projectId/handover-documents/:docId/download', async (req: AuthRequest, res) => {
  try {
    const projectId = Number(req.params.projectId);
    const docId = Number(req.params.docId);
    const token = String(req.query.token || '').trim();

    const [proj] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
    const [doc] = await db
      .select()
      .from(projectHandoverDocuments)
      .where(
        and(
          eq(projectHandoverDocuments.id, docId),
          eq(projectHandoverDocuments.projectId, projectId),
          eq(projectHandoverDocuments.isDeleted, false)
        )
      )
      .limit(1);

    if (!proj || !doc) {
      return res.status(404).json({ error: 'Handover deliverable not found.' });
    }

    const isTokenAuthorized = token && token === doc.downloadToken;
    // If no token provided, try session/bearer auth via optionalAuth or require token
    if (!isTokenAuthorized) {
      return res.status(403).json({ error: 'Valid signed download token is required.' });
    }

    if (doc.tokenExpiresAt && new Date(doc.tokenExpiresAt) < new Date()) {
      return res.status(403).json({ error: 'Download link has expired. Request link renewal from your dashboard or admin.' });
    }

    if (!proj.handoverUnlocked && !proj.handoverExceptionAuthorized) {
      return res.status(403).json({
        error: 'Project handover is locked until remaining balance payment is cleared or authorized by Super Admin.',
      });
    }

    await db
      .update(projectHandoverDocuments)
      .set({
        downloadCount: (doc.downloadCount || 0) + 1,
        lastDownloadedAt: new Date(),
      })
      .where(eq(projectHandoverDocuments.id, doc.id));

    for (const bucket of ['project-documents', 'project-files']) {
      const remoteBuf = await downloadFromSupabaseStorage(bucket, doc.storagePath);
      if (remoteBuf) {
        res.setHeader('Cache-Control', 'no-store, private');
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(doc.fileName)}"`);
        return res.send(remoteBuf);
      }
    }

    const absPath = path.resolve(UPLOADS_ROOT, doc.storagePath);
    if (!absPath.startsWith(UPLOADS_ROOT) || !fs.existsSync(absPath)) {
      return res.status(404).json({ error: 'Deliverable file missing from storage.' });
    }

    res.download(absPath, doc.fileName);
  } catch (error) {
    console.error('Handover document download error:', error);
    res.status(500).json({ error: 'Failed to download handover deliverable.' });
  }
});

// Customer Handover Receipt Acknowledgment -> Generates Completion Certificate
customerRouter.post('/projects/:id/acknowledge-handover', requireAuth, async (req: AuthRequest, res) => {
  try {
    const projectId = Number(req.params.id);
    const [proj] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.userId, req.dbUser!.id)))
      .limit(1);
    if (!proj) return res.status(404).json({ error: 'Project not found.' });

    if (!proj.handoverUnlocked && !proj.handoverExceptionAuthorized) {
      return res.status(400).json({ error: 'Final payment clearance is required before handover acknowledgment.' });
    }

    const completionNo = proj.completionCertificateNumber || generateCode('NTF-CMP');
    const nowIso = new Date().toISOString();
    const nextUpdates = [
      ...(proj.updates || []),
      {
        id: `u-ack-${Date.now()}`,
        timestamp: nowIso,
        author: req.dbUser!.fullName || req.dbUser!.email,
        category: 'Project Completion',
        title: 'Project Handover Acknowledged by Customer',
        description: `Customer acknowledged receipt of project deliverables. Completion Certificate ${completionNo} issued.`,
        summary: `Customer acknowledged receipt of project deliverables. Completion Certificate ${completionNo} issued.`,
        progressPercentage: 100,
      },
    ];

    const [updated] = await db
      .update(projects)
      .set({
        customerAcknowledgedAt: nowIso,
        customerAcknowledgedBy: req.dbUser!.email,
        completionCertificateNumber: completionNo,
        status: 'Delivered / Handed Over',
        progressPercent: 100,
        completedAt: proj.completedAt || nowIso,
        updates: nextUpdates,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, projectId))
      .returning();

    const [enq] = await db
      .update(projectEnquiries)
      .set({ status: 'Delivered / Handed Over', updatedAt: new Date() })
      .where(eq(projectEnquiries.id, proj.enquiryId))
      .returning();

    await dispatchLifecycleEmail({
      userId: req.dbUser!.id,
      projectId: updated.id,
      enquiryId: updated.enquiryId,
      recipientEmail: req.dbUser!.email,
      eventType: 'project_delivered',
      vars: {
        customerName: req.dbUser!.fullName || req.dbUser!.email,
        projectCode: updated.projectCode,
        projectTitle: updated.title,
      },
    });

    if (enq) {
      syncProjectPaymentAndHandoverToSupabase({
        projectCode: updated.projectCode,
        registrationNumber: enq.enquiryNumber,
        userUid: req.dbUser!.uid,
        handoverUnlocked: updated.handoverUnlocked,
        completionCertificateNumber: completionNo,
      }).catch(() => {});
    }

    res.json({ project: updated, completionCertificateNumber: completionNo });
  } catch (error) {
    console.error('Acknowledge handover error:', error);
    res.status(500).json({ error: 'Failed to acknowledge project handover.' });
  }
});

// Customer Drone Repair Booking Submission
const repairUpload = createMemoryUploadMiddleware(['.png', '.jpg', '.jpeg', '.webp', '.mp4', '.mov'], 50);
customerRouter.post(
  '/drone-repairs',
  requireAuth,
  repairUpload.fields([
    { name: 'photos', maxCount: 5 },
    { name: 'video', maxCount: 1 },
  ]),
  async (req: AuthRequest, res) => {
    try {
      const b = req.body;
      if (!b.customerName || !b.mobile || !b.droneBrandModel || !b.problemDescription) {
        return res.status(400).json({ error: 'Customer name, mobile, drone brand/model, and issue description are required.' });
      }
      const filesObj = (req.files as Record<string, Express.Multer.File[]>) || {};
      const photoFiles = filesObj.photos || [];
      const vid = filesObj.video?.[0];
      if ((photoFiles.length > 0 || vid) && !isSupabaseStorageConfigured()) {
        return res.status(503).json({
          error: 'Supabase Storage is not configured. Repair media uploads require cloud storage.',
        });
      }

      const photos = await Promise.all(
        photoFiles.map(async (f) => {
          const up = await uploadPrivateBufferToSupabaseStorage({
            bucket: 'customer-uploads',
            buffer: f.buffer,
            originalName: f.originalname,
            mimeType: f.mimetype || 'image/jpeg',
            ownerPrefix: req.dbUser!.uid,
            folder: 'drone-repairs',
          });
          return {
            originalName: f.originalname,
            storagePath: up.storagePath,
            bucket: up.bucket,
            mimeType: f.mimetype,
            sizeBytes: f.size,
          };
        })
      );
      const videoFile = vid
        ? await (async () => {
            const up = await uploadPrivateBufferToSupabaseStorage({
              bucket: 'customer-uploads',
              buffer: vid.buffer,
              originalName: vid.originalname,
              mimeType: vid.mimetype || 'video/mp4',
              ownerPrefix: req.dbUser!.uid,
              folder: 'drone-repairs',
            });
            return {
              originalName: vid.originalname,
              storagePath: up.storagePath,
              bucket: up.bucket,
              mimeType: vid.mimetype,
              sizeBytes: vid.size,
            };
          })()
        : null;

      const ref = generateCode('NTF-REP');
      const [booking] = await db
        .insert(droneRepairBookings)
        .values({
          referenceNumber: ref,
          userId: req.dbUser!.id,
          serviceMode: b.serviceMode === 'field_visit' ? 'field_visit' : 'service_centre',
          customerName: String(b.customerName).trim(),
          mobile: String(b.mobile).trim(),
          email: String(b.email || req.dbUser!.email).trim(),
          address: String(b.address || '').trim(),
          city: String(b.city || '').trim(),
          district: String(b.district || '').trim(),
          pinCode: String(b.pinCode || '').trim(),
          droneBrandModel: String(b.droneBrandModel).trim(),
          droneType: String(b.droneType || 'Agriculture').trim(),
          problemDescription: String(b.problemDescription).trim(),
          photos,
          videoFile,
          preferredDate: String(b.preferredDate || ''),
          preferredTime: String(b.preferredTime || ''),
          additionalInfo: String(b.additionalInfo || ''),
          status: 'Booking received',
          statusHistory: [
            {
              status: 'Booking received',
              timestamp: new Date().toISOString(),
              note: 'Repair booking logged for Nagpur diagnostics review.',
              actor: req.dbUser!.email,
            },
          ],
        })
        .returning();

      await Promise.all([
        createNotification({
          userId: req.dbUser!.id,
          title: `Drone Repair ${booking.referenceNumber} Booked`,
          message: `${booking.droneBrandModel} diagnostics scheduled (${booking.serviceMode}).`,
          link: '/my-account?tab=services',
        }),
        notifyAdmins({
          type: 'enquiry',
          entityType: 'drone_repair',
          entityId: booking.referenceNumber,
          customerId: req.activeCustomerId || req.dbUser!.customerId || '',
          title: `New Drone Repair Booking — ${booking.referenceNumber}`,
          message: `${booking.customerName} (${booking.droneBrandModel}): ${booking.problemDescription.slice(0, 100)}`,
          link: '/admin/service-records',
        }),
      ]);

      createOrSyncServiceRecord({
        serviceCode: 'SRV-DRONE-REPAIR',
        userId: req.dbUser!.id,
        userUid: req.dbUser!.uid,
        customerId: req.activeCustomerId || req.dbUser!.customerId || req.dbUser!.uid,
        customerEmail: booking.email,
        serviceName: `Drone Repair — ${booking.droneBrandModel}`,
        category: 'Drone Services',
        description: booking.problemDescription,
        specifications: `${booking.droneType} · Mode: ${booking.serviceMode}`,
        selectedOptions: {
          serviceMode: booking.serviceMode,
          droneType: booking.droneType,
          preferredDate: booking.preferredDate,
          preferredTime: booking.preferredTime,
        },
        uploadedFiles: [...photos, ...(videoFile ? [videoFile] : [])],
        quantity: 1,
        status: booking.status,
        sourceEntityType: 'drone_repair',
        sourceEntityId: booking.referenceNumber,
      }).catch(() => {});

      emitAdminStreamEvent({
        type: 'enquiry',
        action: 'created',
        id: booking.referenceNumber,
        summary: booking.droneBrandModel,
      });

      res.status(201).json({ booking });
    } catch (error: any) {
      console.error('Drone repair create error:', error);
      res.status(500).json({ error: error?.message || 'Failed to submit drone repair booking.' });
    }
  }
);

// Create & Reply Support Tickets
customerRouter.post('/support-tickets', requireAuth, async (req: AuthRequest, res) => {
  try {
    const subject = String(req.body?.subject || '').trim();
    const serviceCategory = String(req.body?.serviceCategory || 'General Support').trim() || 'General Support';
    const message = String(req.body?.message || '').trim();

    if (subject.length < 3) {
      return res.status(400).json({ error: 'Please provide a descriptive support ticket subject.' });
    }
    if (message.length < 5) {
      return res.status(400).json({ error: 'Please enter details of your support request.' });
    }

    const tktCutoff = new Date(Date.now() - 60 * 1000);
    const recentTkt = await db
      .select()
      .from(supportTickets)
      .where(
        and(
          eq(supportTickets.userId, req.dbUser!.id),
          eq(supportTickets.subject, subject),
          gte(supportTickets.createdAt, tktCutoff)
        )
      )
      .limit(1);
    if (recentTkt.length > 0 && String(recentTkt[0].message || '').trim() === message) {
      return res.status(200).json({ deduplicated: true, ticket: recentTkt[0] });
    }

    const ticketNumber = generateCode('NTF-TKT');
    const [created] = await db
      .insert(supportTickets)
      .values({
        ticketNumber,
        userId: req.dbUser!.id,
        customerId: req.activeCustomerId || req.dbUser!.customerId || '',
        name: req.dbUser!.fullName || req.dbUser!.email,
        email: req.dbUser!.email,
        mobile: req.dbUser!.mobile || '',
        subject,
        serviceCategory,
        category: serviceCategory,
        message,
        status: 'Open',
        messages: [
          {
            sender: req.dbUser!.fullName || req.dbUser!.email,
            role: 'customer',
            text: message,
            timestamp: new Date().toISOString(),
          },
        ],
      })
      .returning();

    await Promise.all([
      createNotification({
        userId: req.dbUser!.id,
        title: `Support Ticket ${created.ticketNumber} Opened`,
        message: `${subject} (${serviceCategory}) — our technical support team will respond shortly.`,
        link: '/my-account/b2b-support',
      }),
      notifyAdmins({
        type: 'enquiry',
        entityType: 'support_ticket',
        entityId: created.ticketNumber,
        customerId: req.activeCustomerId || req.dbUser!.customerId || '',
        title: `New Customer Enquiry / Ticket: ${created.ticketNumber}`,
        message: `${req.dbUser!.fullName || req.dbUser!.email}: ${subject}`,
        link: '/admin/enquiries',
      }),
    ]);

    syncSupportTicketToSupabase({
      ticketNumber: created.ticketNumber,
      userUid: req.dbUser!.uid,
      customerId: req.activeCustomerId || req.dbUser!.customerId,
      subject: created.subject,
      serviceCategory: created.serviceCategory,
      status: created.status,
      messages: created.messages,
    }).catch(() => {});
    await logCustomerActivity(
      req.dbUser!,
      req.activeCustomerId,
      'SUPPORT_TICKET_OPENED',
      'support_ticket',
      created.ticketNumber,
      { subject, serviceCategory }
    );

    res.status(201).json({ ticket: created });
  } catch (error) {
    console.error('Create support ticket error:', error);
    res.status(500).json({ error: 'Failed to create support ticket.' });
  }
});

// Support Ticket Replies
customerRouter.post('/support-tickets/:id/reply', requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const text = String(req.body.message || '').trim();
    if (!text) return res.status(400).json({ error: 'Reply message cannot be empty.' });

    const [ticket] = await db
      .select()
      .from(supportTickets)
      .where(and(eq(supportTickets.id, id), eq(supportTickets.userId, req.dbUser!.id)))
      .limit(1);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found.' });

    const updatedMessages = [
      ...ticket.messages,
      {
        sender: req.dbUser!.fullName || req.dbUser!.email,
        role: 'customer',
        text,
        timestamp: new Date().toISOString(),
      },
    ];

    const [updated] = await db
      .update(supportTickets)
      .set({ messages: updatedMessages, status: 'Open', updatedAt: new Date() })
      .where(eq(supportTickets.id, id))
      .returning();

    syncSupportTicketToSupabase({
      ticketNumber: updated.ticketNumber,
      userUid: req.dbUser!.uid,
      customerId: req.activeCustomerId || req.dbUser!.customerId,
      subject: updated.subject,
      serviceCategory: updated.serviceCategory,
      status: updated.status,
      messages: updated.messages,
    }).catch(() => {});
    notifyAdmins({
      type: 'enquiry',
      entityType: 'support_ticket',
      entityId: updated.ticketNumber,
      customerId: req.activeCustomerId || req.dbUser!.customerId || '',
      title: `Customer Reply — ${updated.ticketNumber}`,
      message: `${req.dbUser!.fullName || req.dbUser!.email}: ${text.slice(0, 120)}`,
      link: '/admin/enquiries',
    }).catch(() => {});

    await logCustomerActivity(
      req.dbUser!,
      req.activeCustomerId,
      'SUPPORT_TICKET_REPLIED',
      'support_ticket',
      updated.ticketNumber
    );

    res.json({ ticket: updated });
  } catch {
    res.status(500).json({ error: 'Failed to reply to support ticket.' });
  }
});

// Secure Private File Download (Authorized Owner or Admin Only — Cloud Supabase Storage First)
customerRouter.get('/files/download', requireAuth, async (req: AuthRequest, res) => {
  try {
    const relPath = String(req.query.path || '').trim();
    const requestedBucket = String(req.query.bucket || '').trim();
    if (!relPath || relPath.includes('..')) return res.status(400).json({ error: 'Valid file path is required.' });

    const isAdmin = ADMIN_ROLES.has(req.dbUser!.role);
    if (!isAdmin) {
      // Verify file belongs to one of this user's records
      const uid = req.dbUser!.id;
      const [printRows, projEnqRows, activeProjRows, msgRows, pcbRows, b2bRows, agreementRows, projAttachmentRows] = await Promise.all([
        db.select().from(printingOrders).where(eq(printingOrders.userId, uid)),
        db.select().from(projectEnquiries).where(eq(projectEnquiries.userId, uid)),
        db.select().from(projects).where(eq(projects.userId, uid)),
        db.select().from(projectMessages).where(eq(projectMessages.userId, uid)),
        db.select().from(pcbEnquiries).where(eq(pcbEnquiries.userId, uid)),
        db.select().from(b2bEnquiries).where(eq(b2bEnquiries.userId, uid)),
        db.select().from(projectAgreements).where(eq(projectAgreements.userId, uid)),
        db.select().from(projectAttachments).where(eq(projectAttachments.userId, uid)),
      ]);

      const ownedInProjects = activeProjRows.some(
        (p) =>
          (p.completionProof || []).some((a) => a.storagePath === relPath) ||
          (p.designDocuments || []).some((a: any) => a.storagePath === relPath) ||
          (p.updates || []).some(
            (u) =>
              (u.photos || []).some((a) => a.storagePath === relPath) ||
              (u.videos || []).some((a) => a.storagePath === relPath) ||
              (u.reports || []).some((a) => a.storagePath === relPath)
          )
      );

      const owned =
        printRows.some((r) => r.fileStoragePath === relPath) ||
        projEnqRows.some((r) => r.attachments.some((a) => a.storagePath === relPath)) ||
        msgRows.some((m) => (m.attachments || []).some((a) => a.storagePath === relPath)) ||
        ownedInProjects ||
        pcbRows.some((r) => r.attachments.some((a) => a.storagePath === relPath)) ||
        b2bRows.some((r) => r.attachments.some((a) => a.storagePath === relPath)) ||
        agreementRows.some((a) => a.storagePath === relPath || a.signedPdfPath === relPath) ||
        projAttachmentRows.some((a) => a.storagePath === relPath);

      if (!owned) {
        return res.status(403).json({ error: 'You are not authorized to access this private file.' });
      }
    }

    const candidateBuckets = Array.from(
      new Set(
        [
          requestedBucket,
          'project-attachments',
          'project-agreements',
          'company-assets',
          'customer-uploads',
          'agreements',
          'invoices-pdf',
        ].filter(Boolean)
      )
    );

    for (const bucket of candidateBuckets) {
      const remoteBuf = await downloadFromSupabaseStorage(bucket, relPath);
      if (remoteBuf) {
        res.setHeader('Cache-Control', 'no-store, private');
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(path.basename(relPath))}"`);
        return res.send(remoteBuf);
      }
    }

    const absPath = path.resolve(UPLOADS_ROOT, relPath);
    if (!absPath.startsWith(UPLOADS_ROOT) || !fs.existsSync(absPath)) {
      return res.status(404).json({ error: 'File not found in cloud or private storage.' });
    }

    res.download(absPath);
  } catch (error) {
    console.error('File download error:', error);
    res.status(500).json({ error: 'Failed to download file.' });
  }
});
