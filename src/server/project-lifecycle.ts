import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db/index.ts';
import {
  adminNotifications,
  invoices,
  paymentClearanceCertificates,
  paymentReceipts,
  payments,
  projectEnquiries,
  projectPaymentMilestones,
  projectQuotations,
  projectWorkOrders,
  projects,
  siteSettings,
  users,
} from '../db/schema.ts';
import { emitAdminStreamEvent, syncAdminNotificationToSupabase, type AdminStreamEntityType } from './admin-realtime.ts';
import { dispatchLifecycleEmail } from './email.ts';
import { generateAndStoreInvoicePdf } from './pdf-storage.ts';
import { syncPaymentToSupabase } from './supabase-ecommerce.ts';
import { syncProjectPaymentAndHandoverToSupabase, syncProjectQuotationToSupabase } from './supabase-projects.ts';
import { createNotification, generateCode } from './utils.ts';

export const PROJECT_LIFECYCLE_STATUSES = [
  'Submitted – Under Review',
  'Additional Information Required',
  'Under Technical Evaluation',
  'Quotation Prepared',
  'Quotation Approved by Customer',
  'Advance Payment Pending',
  'Advance Payment Received',
  'Project Development Started',
  'In Progress',
  'Testing and Quality Assurance',
  'Project Completed',
  'Final Payment Pending',
  'Ready for Handover',
  'Delivered / Handed Over',
  'Closed',
] as const;

export const PROJECT_UPDATE_CATEGORIES = [
  'Project Planning',
  'Research and Technical Design',
  'Component Procurement',
  'Circuit and PCB Development',
  'Hardware Assembly',
  'Software Development',
  'Mechanical Design',
  'Prototype Manufacturing',
  'Integration',
  'Testing',
  'Debugging',
  'Final Quality Inspection',
  'Project Completion',
] as const;

export const ADVANCE_REQUIRED_STATUSES = new Set([
  'Project Development Started',
  'In Progress',
  'Testing and Quality Assurance',
  'Project Completed',
  'Final Payment Pending',
  'Ready for Handover',
  'Delivered / Handed Over',
  'Closed',
  // Legacy aliases
  'Project Started',
  'Testing',
  'Project Completed – Awaiting Final Payment',
  'Payment Cleared – Ready for Handover',
  'Ready for Delivery',
  'Dispatched',
  'Delivered',
  'Completed',
]);

export const FINAL_CLEARANCE_REQUIRED_STATUSES = new Set([
  'Ready for Handover',
  'Delivered / Handed Over',
  'Closed',
  'Payment Cleared – Ready for Handover',
  'Ready for Delivery',
  'Dispatched',
  'Delivered',
  'Completed',
]);

export async function notifyAdmins(params: {
  title: string;
  message: string;
  link?: string;
  type?: AdminStreamEntityType;
  entityType?: string;
  entityId?: string;
  customerId?: string;
}) {
  try {
    const notifType = params.type || 'system';
    const [recorded] = await db
      .insert(adminNotifications)
      .values({
        type: notifType,
        title: params.title,
        message: params.message,
        entityType: params.entityType || '',
        entityId: params.entityId || '',
        customerId: params.customerId || '',
        link: params.link || '/admin/dashboard',
        isRead: false,
      })
      .returning()
      .catch(() => [null]);

    if (recorded) {
      syncAdminNotificationToSupabase({
        sourceId: recorded.id,
        type: recorded.type,
        title: recorded.title,
        message: recorded.message,
        entityType: recorded.entityType,
        entityId: recorded.entityId,
        customerId: recorded.customerId,
        link: recorded.link,
        isRead: recorded.isRead,
        createdAt: recorded.createdAt,
      }).catch(() => {});
    }

    emitAdminStreamEvent({
      type: notifType,
      action: 'notification',
      id: params.entityId || recorded?.id,
      summary: params.title,
      customerId: params.customerId,
    });
    if (notifType !== 'notification') {
      emitAdminStreamEvent({
        type: 'notification',
        action: 'created',
        id: recorded?.id,
        summary: params.title,
        customerId: params.customerId,
      });
    }

    const adminUsers = await db
      .select({ id: users.id })
      .from(users)
      .where(inArray(users.role, ['super_admin', 'admin', 'project_manager', 'accounts_manager']));
    await Promise.all(
      adminUsers.map((adm) =>
        createNotification({
          userId: adm.id,
          title: params.title,
          message: params.message,
          link: params.link || '/admin/project-enquiries',
        })
      )
    );
  } catch (err) {
    console.error('Admin notification dispatch failed:', err);
  }
}

export async function reconcileProjectQuotationPayment(params: {
  quotationId: number;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
  paymentMode?: string;
  paymentLinkId?: string;
  paymentUrl?: string;
  expectedUserId?: number;
}) {
  const {
    quotationId,
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature,
    paymentMode = 'advance',
    paymentLinkId = '',
    paymentUrl = '',
    expectedUserId,
  } = params;

  // Idempotency guard by razorpayPaymentId
  const existingPay = await db
    .select()
    .from(payments)
    .where(eq(payments.razorpayPaymentId, razorpayPaymentId))
    .limit(1);
  if (existingPay.length > 0) {
    return { duplicate: true, payment: existingPay[0] };
  }

  const [existingQ] = await db
    .select()
    .from(projectQuotations)
    .where(eq(projectQuotations.id, quotationId))
    .limit(1);
  if (!existingQ) {
    throw new Error('Quotation not found.');
  }

  const [existingEnq] = await db
    .select()
    .from(projectEnquiries)
    .where(eq(projectEnquiries.id, existingQ.enquiryId))
    .limit(1);
  if (!existingEnq) {
    throw new Error('Project registration not found.');
  }

  if (expectedUserId !== undefined && existingEnq.userId !== expectedUserId) {
    const err: any = new Error('Unauthorized quotation payment.');
    err.status = 403;
    throw err;
  }

  if (existingQ.razorpayOrderId && razorpayOrderId && existingQ.razorpayOrderId !== razorpayOrderId) {
    const err: any = new Error('Razorpay order ID mismatch.');
    err.status = 400;
    throw err;
  }

  const [ownerUser] = existingEnq.userId
    ? await db.select().from(users).where(eq(users.id, existingEnq.userId)).limit(1)
    : [];
  const [[companyRow], [projCfgRow]] = await Promise.all([
    db.select().from(siteSettings).where(eq(siteSettings.key, 'companyInfo')).limit(1),
    db.select().from(siteSettings).where(eq(siteSettings.key, 'projectPaymentSettings')).limit(1),
  ]);
  const companyInfo = (companyRow?.value as { gstin?: string }) || {};
  const projCfg = (projCfgRow?.value as { enableGstTax?: boolean }) || {};
  const isGstEnabled = Boolean(companyInfo.gstin && companyInfo.gstin.trim() && projCfg.enableGstTax);

  const prevPaid = Number(existingQ.paidAmountInr || 0);
  const remaining = Math.max(0, existingQ.totalAmountInr - prevPaid);
  if (remaining <= 0) {
    throw new Error('Quotation already paid in full.');
  }

  const chargeAmount =
    paymentMode === 'full' || paymentMode === 'balance'
      ? remaining
      : prevPaid > 0
      ? remaining
      : existingQ.advanceAmountInr;

  const newPaidTotal = Math.min(existingQ.totalAmountInr, prevPaid + chargeAmount);
  const isFullyPaid = newPaidTotal >= existingQ.totalAmountInr;
  const isAdvance = prevPaid === 0 && !isFullyPaid;
  const paymentStage = isAdvance ? 'advance' : isFullyPaid && prevPaid === 0 ? 'full' : 'final';

  const docType = isGstEnabled
    ? isAdvance
      ? 'Advance GST Tax Invoice'
      : 'Final GST Tax Invoice'
    : isAdvance
    ? 'Advance Payment Invoice / Receipt'
    : 'Final Payment Invoice / Receipt';

  const [q] = await db
    .update(projectQuotations)
    .set({
      paidAmountInr: newPaidTotal,
      paidAmountPaise: Math.round(newPaidTotal * 100),
      paymentStatus: isFullyPaid ? 'paid' : 'partial',
      razorpayPaymentId,
    })
    .where(eq(projectQuotations.id, existingQ.id))
    .returning();

  const nextEnqStatus = isFullyPaid ? 'Ready for Handover' : 'Advance Payment Received';
  const [enq] = await db
    .update(projectEnquiries)
    .set({
      status: nextEnqStatus,
      updatedAt: new Date(),
    })
    .where(eq(projectEnquiries.id, existingEnq.id))
    .returning();

  const existingProjects = await db
    .select()
    .from(projects)
    .where(eq(projects.enquiryId, enq.id))
    .limit(1);

  let activeProject = existingProjects[0];
  const balanceRemaining = Math.max(0, q.totalAmountInr - newPaidTotal);

  if (!activeProject) {
    const projectCode = generateCode('NTF-PRJ');
    const todayIso = new Date().toISOString().slice(0, 10);
    const [createdProject] = await db
      .insert(projects)
      .values({
        projectCode,
        enquiryId: enq.id,
        quotationId: q.id,
        userId: enq.userId,
        title: enq.projectTitle,
        assignedEngineer: enq.assignedEngineer || 'Lead Systems Engineer',
        status: isFullyPaid ? 'Ready for Handover' : 'Advance Payment Received',
        progressPercent: isFullyPaid ? 100 : 10,
        startDate: todayIso,
        estimatedCompletionDate: q.estimatedDeliveryDate || enq.targetCompletionDate || q.estimatedDuration || '',
        totalAmountInr: q.totalAmountInr,
        paidAmountInr: newPaidTotal,
        balanceAmountInr: balanceRemaining,
        paymentClearanceStatus: isFullyPaid ? 'Cleared' : 'Advance Paid',
        handoverUnlocked: isFullyPaid,
        milestones: [
          {
            id: 'm1',
            title: 'Project Planning & Component Procurement',
            dueDate: '',
            status: 'In Progress',
            notes: `Activated upon verified ${isAdvance ? '50% advance' : 'full'} payment of ₹${chargeAmount.toLocaleString('en-IN')}.`,
          },
          {
            id: 'm2',
            title: 'Engineering Design, Hardware & Software Development',
            dueDate: '',
            status: 'Pending',
            notes: '',
          },
          {
            id: 'm3',
            title: 'Testing, Quality Assurance & Handover',
            dueDate: q.estimatedDeliveryDate || enq.targetCompletionDate || '',
            status: 'Pending',
            notes: '',
          },
        ],
        updates: [
          {
            id: `u-${Date.now()}`,
            timestamp: new Date().toISOString(),
            author: 'NexusTekFusion Operations',
            category: 'Project Planning',
            title: isFullyPaid ? 'Full Payment Verified & Project Activated' : '50% Advance Payment Verified',
            description: `Work order ${projectCode} activated after verified payment of ₹${chargeAmount.toLocaleString('en-IN')} (Razorpay Ref: ${razorpayPaymentId}).`,
            summary: `Work order ${projectCode} activated after verified payment of ₹${chargeAmount.toLocaleString('en-IN')}.`,
            progressPercentage: isFullyPaid ? 100 : 10,
            adminComments: 'Advance payment confirmed. Engineering team can now start development.',
          },
        ],
      })
      .returning();
    activeProject = createdProject;

    await db.insert(projectWorkOrders).values({
      workOrderNumber: generateCode('NTF-WRK'),
      projectId: activeProject.id,
      enquiryId: enq.id,
      quotationId: q.id,
      userId: enq.userId,
      assignedEngineer: activeProject.assignedEngineer,
      estimatedCompletionDate: activeProject.estimatedCompletionDate,
      scopeSummary: q.technicalScope || enq.projectDescription,
    });

    if (enq.userId) {
      await createNotification({
        userId: enq.userId,
        title: `Advance Payment Received — ${createdProject.projectCode}`,
        message: `₹${chargeAmount.toLocaleString('en-IN')} verified. Development workflow is now unlocked.`,
        link: '/my-account/project-enquiries',
      });
    }
  } else {
    const nextUpdates = [
      ...(activeProject.updates || []),
      {
        id: `u-${Date.now()}`,
        timestamp: new Date().toISOString(),
        author: 'NexusTekFusion Accounts',
        category: isFullyPaid ? 'Project Completion' : 'Project Planning',
        title: isFullyPaid ? 'Remaining 50% Final Payment Verified' : 'Project Installment Verified',
        description: isFullyPaid
          ? `Final balance payment of ₹${chargeAmount.toLocaleString('en-IN')} verified (Ref: ${razorpayPaymentId}). Payment Cleared & Ready for Handover.`
          : `Payment of ₹${chargeAmount.toLocaleString('en-IN')} verified. Remaining balance: ₹${balanceRemaining.toLocaleString('en-IN')}.`,
        summary: isFullyPaid
          ? `Final balance payment of ₹${chargeAmount.toLocaleString('en-IN')} verified. Ready for Handover unlocked.`
          : `Payment of ₹${chargeAmount.toLocaleString('en-IN')} verified. Remaining balance: ₹${balanceRemaining.toLocaleString('en-IN')}.`,
        progressPercentage: isFullyPaid ? Math.max(95, activeProject.progressPercent || 95) : activeProject.progressPercent || 10,
      },
    ];
    const [updatedProj] = await db
      .update(projects)
      .set({
        paidAmountInr: newPaidTotal,
        balanceAmountInr: balanceRemaining,
        paymentClearanceStatus: isFullyPaid ? 'Cleared' : 'Advance Paid',
        handoverUnlocked: isFullyPaid || activeProject.handoverExceptionAuthorized,
        status: isFullyPaid ? 'Ready for Handover' : activeProject.status,
        progressPercent: isFullyPaid ? 100 : activeProject.progressPercent || 10,
        updates: nextUpdates,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, activeProject.id))
      .returning();
    activeProject = updatedProj;

    if (enq.userId) {
      await createNotification({
        userId: enq.userId,
        title: isFullyPaid
          ? `Ready for Handover — ${activeProject.projectCode}`
          : `Project Payment Received (${activeProject.projectCode})`,
        message: `Verified payment of ₹${chargeAmount.toLocaleString('en-IN')}. Total paid ₹${newPaidTotal.toLocaleString('en-IN')} of ₹${q.totalAmountInr.toLocaleString('en-IN')}.`,
        link: '/my-account/project-enquiries',
      });
    }
  }

  const amountInr = chargeAmount;
  const gstInr = isAdvance
    ? Math.round((q.gstInr * chargeAmount) / Math.max(1, q.totalAmountInr))
    : q.gstInr - Math.round((q.gstInr * prevPaid) / Math.max(1, q.totalAmountInr));
  const payload = {
    projectCode: activeProject.projectCode,
    enquiryNumber: enq.enquiryNumber,
    projectTitle: enq.projectTitle,
    customerName: enq.customerName,
    customerPhone: enq.customerPhone,
    billingAddress: enq.billingAddress,
    quotationId: q.id,
    quotationNumber: q.quotationNumber || `REV-${q.revisionNumber}`,
    totalAmountInr: q.totalAmountInr,
    paidTotalInr: newPaidTotal,
    balanceRemainingInr: balanceRemaining,
    razorpayOrderId,
    razorpayPaymentId,
    paymentMethod: razorpayPaymentId.startsWith('pay_test_') ? 'Razorpay Test / Sandbox' : 'Razorpay',
    paymentMode,
    paymentStage,
  };

  const resolvedCustomerId =
    enq.customerId ||
    ownerUser?.uid ||
    '';
  const mode = razorpayPaymentId.startsWith('pay_test_') ? 'test_mode' : 'live_razorpay';
  const paymentRef = generateCode('NTF-PAY');
  const paidNow = new Date();
  const [paymentRecord] = await db
    .insert(payments)
    .values({
      paymentRef,
      userId: enq.userId,
      customerId: resolvedCustomerId,
      entityType: 'project_quotation',
      entityId: q.id,
      projectId: activeProject.id,
      projectCode: activeProject.projectCode,
      paymentStage,
      paymentLinkId,
      paymentUrl,
      razorpayOrderId: String(razorpayOrderId),
      razorpayPaymentId,
      razorpaySignature,
      amountInr,
      amountPaise: Math.round(amountInr * 100),
      mode,
      status: 'verified',
      paymentDate: paidNow,
      verifiedAt: paidNow,
    })
    .returning();

  const [receiptRecord] = await db
    .insert(paymentReceipts)
    .values({
      receiptNumber: generateCode('NTF-RCP'),
      paymentRef,
      userId: enq.userId,
      entityType: 'project_quotation',
      entityId: q.id,
      paymentStage,
      amountInr,
      amountPaise: Math.round(amountInr * 100),
      razorpayPaymentId,
      payload,
    })
    .returning();

  const [invoiceRecord] = await db
    .insert(invoices)
    .values({
      invoiceNumber: generateCode('NTF-INV'),
      userId: enq.userId,
      customerId: resolvedCustomerId,
      entityType: 'project_quotation',
      entityId: q.id,
      docType,
      amountInr,
      gstInr,
      payload,
    })
    .returning();

  if (invoiceRecord?.id) {
    await generateAndStoreInvoicePdf(invoiceRecord.id).catch((err) => {
      console.warn('[Invoice PDF] Generation warning:', (err as Error)?.message);
    });
  }

  const msRows = await db
    .select()
    .from(projectPaymentMilestones)
    .where(eq(projectPaymentMilestones.quotationId, q.id));

  for (const ms of msRows) {
    await db
      .update(projectPaymentMilestones)
      .set({ projectId: activeProject.id })
      .where(eq(projectPaymentMilestones.id, ms.id));
    if (isFullyPaid || (isAdvance && ms.stageOrder === 1)) {
      await db
        .update(projectPaymentMilestones)
        .set({ status: 'paid', paymentRef, paidAt: new Date() })
        .where(eq(projectPaymentMilestones.id, ms.id));
    }
  }

  let clearanceCertificate: any = null;
  if (isFullyPaid) {
    const existingClr = await db
      .select()
      .from(paymentClearanceCertificates)
      .where(eq(paymentClearanceCertificates.projectId, activeProject.id))
      .limit(1);
    if (existingClr.length === 0) {
      const allProjPayments = await db
        .select()
        .from(payments)
        .where(and(eq(payments.entityType, 'project_quotation'), eq(payments.entityId, q.id)));
      const refs = allProjPayments.map((p) => p.paymentRef);
      const certNo = generateCode('NTF-CLR');
      const [clr] = await db
        .insert(paymentClearanceCertificates)
        .values({
          certificateNumber: certNo,
          projectId: activeProject.id,
          enquiryId: enq.id,
          quotationId: q.id,
          userId: enq.userId,
          totalAmountInr: q.totalAmountInr,
          advancePaidInr: prevPaid || (isAdvance ? amountInr : 0),
          finalPaidInr: prevPaid > 0 ? amountInr : q.totalAmountInr,
          balanceInr: 0,
          paymentRefs: refs,
          issuedBy: 'NEXUSTEKFUSION ACCOUNTS',
        })
        .returning();
      clearanceCertificate = clr;

      await dispatchLifecycleEmail({
        userId: enq.userId,
        projectId: activeProject.id,
        enquiryId: enq.id,
        recipientEmail: enq.customerEmail || ownerUser?.email || '',
        eventType: 'final_payment_confirmed',
        vars: {
          customerName: enq.customerName,
          projectCode: activeProject.projectCode,
          projectTitle: activeProject.title,
          amountInr,
          paymentRef,
          certificateNumber: certNo,
        },
      });
    }
  } else {
    await dispatchLifecycleEmail({
      userId: enq.userId,
      projectId: activeProject.id,
      enquiryId: enq.id,
      recipientEmail: enq.customerEmail || ownerUser?.email || '',
      eventType: 'advance_payment_confirmed',
      vars: {
        customerName: enq.customerName,
        projectCode: activeProject.projectCode,
        projectTitle: activeProject.title,
        amountInr,
        paymentRef,
        assignedEngineer: activeProject.assignedEngineer,
      },
    });
  }

  await notifyAdmins({
    type: 'payment',
    entityType: 'project',
    entityId: activeProject.projectCode,
    customerId: enq.customerId || '',
    title: isFullyPaid
      ? `Final 50% Payment Verified — ${activeProject.projectCode}`
      : `50% Advance Payment Verified — ${activeProject.projectCode}`,
    message: `${enq.customerName} (${enq.enquiryNumber}) paid ₹${amountInr.toLocaleString('en-IN')}. ${
      isFullyPaid ? 'Project is now Ready for Handover.' : 'Project development is unlocked.'
    }`,
    link: '/admin/project-enquiries',
  });
  emitAdminStreamEvent({ type: 'project', action: 'payment_verified', id: activeProject.id, summary: activeProject.projectCode });
  emitAdminStreamEvent({ type: 'invoice', action: 'created', id: invoiceRecord.invoiceNumber, summary: `₹${amountInr}` });

  syncPaymentToSupabase({
    paymentRef,
    userUid: ownerUser?.uid || '',
    entityType: 'project_quotation',
    entityRef: String(q.id),
    razorpayOrderId: String(razorpayOrderId),
    razorpayPaymentId,
    amountInr,
    amountPaise: Math.round(amountInr * 100),
    mode,
    status: 'verified',
    verifiedAt: new Date(),
  }).catch(() => {});

  syncProjectQuotationToSupabase({
    registrationNumber: enq.enquiryNumber,
    quotation: q,
  }).catch(() => {});

  syncProjectPaymentAndHandoverToSupabase({
    projectCode: activeProject.projectCode,
    registrationNumber: enq.enquiryNumber,
    paymentRef,
    quotationNumber: q.quotationNumber,
    userUid: ownerUser?.uid || '',
    paymentStage,
    amountInr,
    razorpayOrderId,
    razorpayPaymentId,
    invoiceNumber: invoiceRecord.invoiceNumber,
    docType,
    gstInr,
    handoverUnlocked: activeProject.handoverUnlocked,
    clearanceCertificateNumber: clearanceCertificate?.certificateNumber || '',
  }).catch(() => {});

  return {
    duplicate: false,
    payment: paymentRecord,
    receipt: receiptRecord,
    invoice: invoiceRecord,
    clearanceCertificate,
    project: activeProject,
  };
}
