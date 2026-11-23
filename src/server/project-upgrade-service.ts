import crypto from 'crypto';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '../db/index.ts';
import {
  adminNotifications,
  agreementSettings,
  notifications,
  paymentInstallments,
  paymentReceipts,
  paymentReminders,
  paymentTransactions,
  projectAgreements,
  projectEnquiries,
  projectPaymentMilestones,
  projectPaymentPlans,
  projectPayments,
  projectQuotations,
  projects,
  users,
} from '../db/schema.ts';
import { isSupabaseStorageConfigured, uploadAgreementPdfToSupabase } from '../lib/supabase-admin.ts';
import { dispatchAdminNotificationEmail, dispatchLifecycleEmail } from './email.ts';
import {
  generateAndStoreFinalProjectInvoicePdf,
  generateAndStoreInstallmentReceiptPdf,
  ProjectAgreementDocumentModel,
  renderProjectAgreementPdfBuffer,
} from './pdf-storage.ts';
import { notifyAdmins } from './project-lifecycle.ts';
import { syncProjectAgreementToSupabase } from './supabase-ecommerce.ts';
import {
  syncAgreementSettingsToSupabase,
  syncPaymentInstallmentToSupabase,
  syncPaymentReminderToSupabase,
  syncPaymentTransactionToSupabase,
  syncProjectPaymentSummaryToSupabase,
  syncProjectRecordToSupabase,
} from './supabase-projects.ts';

function splitFiftyFifty(totalInr: number): { first: number; second: number } {
  const safeTotal = Math.max(0, Math.round(Number(totalInr || 0)));
  const first = Math.round(safeTotal * 0.5);
  const second = Math.max(0, safeTotal - first);
  return { first, second };
}

export async function getOrCreateAgreementSettings() {
  const existing = await db.select().from(agreementSettings).limit(1);
  if (existing.length > 0) return existing[0];
  const [created] = await db
    .insert(agreementSettings)
    .values({
      companyName: 'NEXUSTEKFUSION PRIVATE LIMITED',
      companyLogoUrl: '/assets/aistudio/image_1a5ac752.png',
      companyAddress: 'Amravati, Maharashtra, India',
      contactEmail: 'support@nexustekfusion.com',
      contactPhone: '+91-9876543210',
    })
    .returning();
  return created;
}

export async function ensureProjectForEnquiry(params: {
  enquiryId: number;
  quotationId?: number | null;
  totalAmountInr?: number;
  initialStatus?: string;
  actorEmail?: string;
}) {
  const [enq] = await db
    .select()
    .from(projectEnquiries)
    .where(eq(projectEnquiries.id, params.enquiryId))
    .limit(1);
  if (!enq) throw new Error('Project enquiry not found.');

  const existing = await db
    .select()
    .from(projects)
    .where(and(eq(projects.enquiryId, enq.id), eq(projects.isDeleted, false)))
    .limit(1);

  if (existing.length > 0) {
    const cur = existing[0];
    if (
      params.totalAmountInr !== undefined &&
      params.totalAmountInr > 0 &&
      Number(cur.totalAmountInr || 0) === 0
    ) {
      const [updated] = await db
        .update(projects)
        .set({
          totalAmountInr: params.totalAmountInr,
          budgetInr: cur.budgetInr > 0 ? cur.budgetInr : params.totalAmountInr,
          balanceAmountInr: Math.max(0, params.totalAmountInr - Number(cur.paidAmountInr || 0)),
          quotationId: params.quotationId ?? cur.quotationId,
          updatedAt: new Date(),
        })
        .where(eq(projects.id, cur.id))
        .returning();
      return updated;
    }
    return cur;
  }

  let linkedQuot = null;
  if (params.quotationId) {
    const [q] = await db.select().from(projectQuotations).where(eq(projectQuotations.id, params.quotationId)).limit(1);
    linkedQuot = q || null;
  } else {
    const qRows = await db
      .select()
      .from(projectQuotations)
      .where(eq(projectQuotations.enquiryId, enq.id))
      .orderBy(desc(projectQuotations.id));
    linkedQuot = qRows[0] || null;
  }

  const totalCost = Math.max(
    0,
    Math.round(
      Number(
        params.totalAmountInr ??
          linkedQuot?.totalAmountInr ??
          enq.budgetMaxInr ??
          enq.budgetMinInr ??
          0
      )
    )
  );

  const projectCode = `PRJ-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
  const initialStatus = params.initialStatus || 'Awaiting Advance Payment';

  const [created] = await db
    .insert(projects)
    .values({
      projectCode,
      enquiryId: enq.id,
      quotationId: linkedQuot?.id ?? null,
      userId: enq.userId,
      customerId: enq.customerId || '',
      title: enq.projectTitle,
      category: enq.projectCategory,
      description: enq.projectDescription,
      budgetInr: totalCost,
      technicalRequirements: enq.requiredTechnologies || enq.hardwareRequirements || '',
      assignedEngineer: enq.assignedEngineer || 'Engineering Team',
      status: initialStatus,
      progressPercent: 0,
      estimatedCompletionDate: linkedQuot?.estimatedDeliveryDate || enq.targetCompletionDate || '',
      totalAmountInr: totalCost,
      paidAmountInr: 0,
      balanceAmountInr: totalCost,
      paymentClearanceStatus: 'Pending',
    })
    .returning();

  await syncProjectRecordToSupabase({
    projectCode: created.projectCode,
    enquiryId: created.enquiryId,
    quotationId: created.quotationId,
    customerId: created.customerId,
    title: created.title,
    category: created.category,
    description: created.description,
    budgetInr: created.budgetInr,
    status: created.status,
    progressPercent: created.progressPercent,
    totalAmountInr: created.totalAmountInr,
    paidAmountInr: created.paidAmountInr,
    balanceAmountInr: created.balanceAmountInr,
    paymentClearanceStatus: created.paymentClearanceStatus,
    assignedEngineer: created.assignedEngineer,
  });

  return created;
}

export async function setupProjectPaymentAndInstallments(params: {
  projectId?: number;
  enquiryId?: number;
  quotationId?: number | null;
  totalAmountInr: number;
  advanceDueDate?: string;
  finalDueDate?: string;
  notes?: string;
  actorEmail: string;
  sendNotificationEmail?: boolean;
}) {
  const safeTotal = Math.max(1, Math.round(Number(params.totalAmountInr || 0)));
  let projectRow = null;

  if (params.projectId) {
    const [p] = await db.select().from(projects).where(eq(projects.id, params.projectId)).limit(1);
    projectRow = p || null;
  }
  if (!projectRow && params.enquiryId) {
    projectRow = await ensureProjectForEnquiry({
      enquiryId: params.enquiryId,
      quotationId: params.quotationId,
      totalAmountInr: safeTotal,
      initialStatus: 'Awaiting Advance Payment',
      actorEmail: params.actorEmail,
    });
  }
  if (!projectRow) throw new Error('Project not found.');

  const { first, second } = splitFiftyFifty(safeTotal);

  const existingSummary = await db
    .select()
    .from(projectPayments)
    .where(eq(projectPayments.projectId, projectRow.id))
    .limit(1);

  let paymentSummary;
  if (existingSummary.length > 0) {
    const currentPaid = Number(existingSummary[0].paidAmountInr || 0);
    const pending = Math.max(0, safeTotal - currentPaid);
    const nextStatus = currentPaid >= safeTotal ? 'Paid' : currentPaid > 0 ? 'Partially Paid' : 'Pending';
    const [updated] = await db
      .update(projectPayments)
      .set({
        totalAmountInr: safeTotal,
        pendingAmountInr: pending,
        status: nextStatus,
        quotationId: params.quotationId ?? existingSummary[0].quotationId,
        notes: params.notes ?? existingSummary[0].notes,
        updatedAt: new Date(),
      })
      .where(eq(projectPayments.id, existingSummary[0].id))
      .returning();
    paymentSummary = updated;
  } else {
    const [inserted] = await db
      .insert(projectPayments)
      .values({
        projectId: projectRow.id,
        enquiryId: projectRow.enquiryId,
        quotationId: params.quotationId ?? projectRow.quotationId,
        userId: projectRow.userId,
        customerId: projectRow.customerId || '',
        projectCode: projectRow.projectCode,
        totalAmountInr: safeTotal,
        paidAmountInr: Number(projectRow.paidAmountInr || 0),
        pendingAmountInr: Math.max(0, safeTotal - Number(projectRow.paidAmountInr || 0)),
        status: Number(projectRow.paidAmountInr || 0) >= safeTotal ? 'Paid' : Number(projectRow.paidAmountInr || 0) > 0 ? 'Partially Paid' : 'Pending',
        createdBy: params.actorEmail,
        notes: params.notes || '',
      })
      .returning();
    paymentSummary = inserted;
  }

  const existingInstallments = await db
    .select()
    .from(paymentInstallments)
    .where(eq(paymentInstallments.projectId, projectRow.id))
    .orderBy(paymentInstallments.installmentNumber);

  const upsertInstallment = async (num: 1 | 2, amountInr: number, dueDate: string) => {
    const cur = existingInstallments.find((i) => i.installmentNumber === num);
    const title = num === 1 ? 'First Installment (50% Advance Payment)' : 'Second Installment (50% Milestone Balance)';
    const milestoneName = num === 1 ? 'Before Project Commencement (50%)' : 'Second Payment Milestone / Handover (50%)';
    const dueTrigger = num === 1 ? 'before_commencement' : 'second_milestone';

    if (cur) {
      const paidAmt = Number(cur.paidAmountInr || 0);
      const nextStatus = paidAmt >= amountInr ? 'Paid' : paidAmt > 0 ? 'Partially Paid' : cur.status === 'Paid' ? 'Paid' : 'Pending';
      const [updated] = await db
        .update(paymentInstallments)
        .set({
          projectPaymentId: paymentSummary.id,
          amountInr,
          dueDate: dueDate || cur.dueDate,
          status: nextStatus,
          updatedAt: new Date(),
        })
        .where(eq(paymentInstallments.id, cur.id))
        .returning();
      return updated;
    }

    const [created] = await db
      .insert(paymentInstallments)
      .values({
        projectId: projectRow.id,
        projectPaymentId: paymentSummary.id,
        installmentNumber: num,
        title,
        milestoneName,
        percentage: 50,
        amountInr,
        paidAmountInr: 0,
        status: 'Pending',
        dueDate: dueDate || '',
        dueTrigger,
      })
      .returning();
    return created;
  };

  const inst1 = await upsertInstallment(1, first, params.advanceDueDate || '');
  const inst2 = await upsertInstallment(2, second, params.finalDueDate || '');

  // Keep projects row & milestone status synchronized
  const totalPaid = Number(inst1.paidAmountInr || 0) + Number(inst2.paidAmountInr || 0);
  const pendingBalance = Math.max(0, safeTotal - totalPaid);
  const firstPaid = inst1.status === 'Paid';
  const bothPaid = firstPaid && inst2.status === 'Paid';

  const projectNextStatus = !firstPaid
    ? 'Awaiting Advance Payment'
    : bothPaid && (projectRow.status === 'Awaiting Advance Payment' || projectRow.status === 'Final Payment Pending')
    ? 'Ready for Handover'
    : projectRow.status === 'Awaiting Advance Payment'
    ? 'Advance Payment Received'
    : projectRow.status;

  const [updatedProject] = await db
    .update(projects)
    .set({
      totalAmountInr: safeTotal,
      budgetInr: safeTotal,
      paidAmountInr: totalPaid,
      balanceAmountInr: pendingBalance,
      paymentClearanceStatus: bothPaid ? 'Cleared' : firstPaid ? 'Advance Paid' : 'Pending',
      handoverUnlocked: bothPaid ? true : projectRow.handoverUnlocked,
      status: projectNextStatus,
      updatedAt: new Date(),
    })
    .where(eq(projects.id, projectRow.id))
    .returning();

  await db
    .update(projectPayments)
    .set({
      paidAmountInr: totalPaid,
      pendingAmountInr: pendingBalance,
      status: bothPaid ? 'Paid' : totalPaid > 0 ? 'Partially Paid' : 'Pending',
      updatedAt: new Date(),
    })
    .where(eq(projectPayments.id, paymentSummary.id));

  await Promise.all([
    syncProjectRecordToSupabase({
      projectCode: updatedProject.projectCode,
      enquiryId: updatedProject.enquiryId,
      quotationId: updatedProject.quotationId,
      customerId: updatedProject.customerId,
      title: updatedProject.title,
      category: updatedProject.category,
      description: updatedProject.description,
      budgetInr: updatedProject.budgetInr,
      status: updatedProject.status,
      progressPercent: updatedProject.progressPercent,
      totalAmountInr: updatedProject.totalAmountInr,
      paidAmountInr: updatedProject.paidAmountInr,
      balanceAmountInr: updatedProject.balanceAmountInr,
      paymentClearanceStatus: updatedProject.paymentClearanceStatus,
      assignedEngineer: updatedProject.assignedEngineer,
    }),
    syncProjectPaymentSummaryToSupabase({
      projectId: updatedProject.id,
      projectCode: updatedProject.projectCode,
      customerId: updatedProject.customerId,
      totalAmountInr: safeTotal,
      paidAmountInr: totalPaid,
      pendingAmountInr: pendingBalance,
      status: bothPaid ? 'Paid' : totalPaid > 0 ? 'Partially Paid' : 'Pending',
      notes: params.notes,
      createdBy: params.actorEmail,
    }),
    syncPaymentInstallmentToSupabase(inst1),
    syncPaymentInstallmentToSupabase(inst2),
  ]);

  if (params.sendNotificationEmail !== false) {
    const [enq] = await db
      .select()
      .from(projectEnquiries)
      .where(eq(projectEnquiries.id, updatedProject.enquiryId))
      .limit(1);
    if (updatedProject.userId) {
      await db.insert(notifications).values({
        userId: updatedProject.userId,
        title: `Project Payment Schedule Ready — ${updatedProject.projectCode}`,
        message: `Total project cost ₹${safeTotal.toLocaleString('en-IN')} divided into 1st Installment (50%): ₹${first.toLocaleString('en-IN')} and 2nd Installment (50%): ₹${second.toLocaleString('en-IN')}.`,
        link: '/my-account?tab=projects',
      }).catch(() => {});
    }
    if (enq?.customerEmail) {
      await dispatchLifecycleEmail({
        userId: updatedProject.userId,
        projectId: updatedProject.id,
        enquiryId: updatedProject.enquiryId,
        recipientEmail: enq.customerEmail,
        eventType: 'project_payment_request',
        vars: {
          customerName: enq.customerName,
          projectCode: updatedProject.projectCode,
          projectTitle: updatedProject.title,
          totalAmountInr: safeTotal.toLocaleString('en-IN'),
          firstInstallmentInr: first.toLocaleString('en-IN'),
          secondInstallmentInr: second.toLocaleString('en-IN'),
        },
      }).catch(() => {});
    }
  }

  return { project: updatedProject, paymentSummary, installments: [inst1, inst2] };
}

export async function recordInstallmentPayment(params: {
  projectId: number;
  installmentNumber: 1 | 2;
  amountInr: number;
  paymentMethod: string;
  transactionRef: string;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  razorpaySignature?: string;
  paymentLinkId?: string;
  recordedBy: string;
  notes?: string;
  isFailure?: boolean;
  failureReason?: string;
}) {
  const [proj] = await db.select().from(projects).where(eq(projects.id, params.projectId)).limit(1);
  if (!proj) throw new Error('Project not found.');

  let instRows = await db
    .select()
    .from(paymentInstallments)
    .where(eq(paymentInstallments.projectId, proj.id))
    .orderBy(paymentInstallments.installmentNumber);

  if (instRows.length === 0 && Number(proj.totalAmountInr || proj.budgetInr || 0) > 0) {
    const setup = await setupProjectPaymentAndInstallments({
      projectId: proj.id,
      totalAmountInr: Number(proj.totalAmountInr || proj.budgetInr),
      actorEmail: params.recordedBy,
      sendNotificationEmail: false,
    });
    instRows = setup.installments;
  }

  const targetInst = instRows.find((i) => i.installmentNumber === params.installmentNumber);
  if (!targetInst) throw new Error(`Installment #${params.installmentNumber} not initialized for this project.`);

  const [summary] = await db
    .select()
    .from(projectPayments)
    .where(eq(projectPayments.projectId, proj.id))
    .limit(1);

  const safeAmt = Math.max(0, Math.round(Number(params.amountInr || 0)));
  const now = new Date();

  if (params.isFailure) {
    const [txFail] = await db
      .insert(paymentTransactions)
      .values({
        projectId: proj.id,
        projectPaymentId: summary?.id ?? null,
        installmentId: targetInst.id,
        installmentNumber: targetInst.installmentNumber,
        userId: proj.userId,
        customerId: proj.customerId || '',
        amountInr: safeAmt || targetInst.amountInr,
        paymentMethod: params.paymentMethod || 'razorpay_checkout',
        transactionRef: params.transactionRef || `FAIL-${Date.now()}`,
        razorpayOrderId: params.razorpayOrderId || '',
        razorpayPaymentId: params.razorpayPaymentId || '',
        razorpaySignature: params.razorpaySignature || '',
        paymentLinkId: params.paymentLinkId || '',
        status: 'Failed',
        failureReason: params.failureReason || 'Payment failed or declined',
        recordedBy: params.recordedBy,
        notes: params.notes || '',
      })
      .returning();

    if (targetInst.status !== 'Paid') {
      await db
        .update(paymentInstallments)
        .set({ status: 'Failed', updatedAt: now })
        .where(eq(paymentInstallments.id, targetInst.id));
    }

    await syncPaymentTransactionToSupabase({
      projectId: proj.id,
      installmentId: targetInst.id,
      installmentNumber: targetInst.installmentNumber,
      customerId: proj.customerId,
      amountInr: txFail.amountInr,
      paymentMethod: txFail.paymentMethod,
      transactionRef: txFail.transactionRef,
      razorpayOrderId: txFail.razorpayOrderId,
      razorpayPaymentId: txFail.razorpayPaymentId,
      paymentLinkId: txFail.paymentLinkId,
      status: 'Failed',
      failureReason: txFail.failureReason,
      recordedBy: params.recordedBy,
      notes: txFail.notes,
    });

    return { transaction: txFail, installment: targetInst, project: proj };
  }

  const newPaidForInst = Number(targetInst.paidAmountInr || 0) + safeAmt;
  const instStatus =
    newPaidForInst >= Number(targetInst.amountInr || 0)
      ? 'Paid'
      : newPaidForInst > 0
      ? 'Partially Paid'
      : 'Pending';

  const [updatedInst] = await db
    .update(paymentInstallments)
    .set({
      paidAmountInr: newPaidForInst,
      status: instStatus,
      razorpayOrderId: params.razorpayOrderId || targetInst.razorpayOrderId,
      razorpayPaymentId: params.razorpayPaymentId || targetInst.razorpayPaymentId,
      paymentMethod: params.paymentMethod || targetInst.paymentMethod,
      paidAt: instStatus === 'Paid' ? now : targetInst.paidAt,
      updatedAt: now,
    })
    .where(eq(paymentInstallments.id, targetInst.id))
    .returning();

  const [tx] = await db
    .insert(paymentTransactions)
    .values({
      projectId: proj.id,
      projectPaymentId: summary?.id ?? null,
      installmentId: updatedInst.id,
      installmentNumber: updatedInst.installmentNumber,
      userId: proj.userId,
      customerId: proj.customerId || '',
      amountInr: safeAmt,
      paymentMethod: params.paymentMethod || 'manual',
      transactionRef: params.transactionRef || `TXN-${Date.now().toString(36).toUpperCase()}`,
      razorpayOrderId: params.razorpayOrderId || '',
      razorpayPaymentId: params.razorpayPaymentId || '',
      razorpaySignature: params.razorpaySignature || '',
      paymentLinkId: params.paymentLinkId || '',
      status: 'Paid',
      recordedBy: params.recordedBy,
      notes: params.notes || '',
      paidAt: now,
    })
    .returning();

  const refreshedInsts = await db
    .select()
    .from(paymentInstallments)
    .where(eq(paymentInstallments.projectId, proj.id));

  const inst1 = refreshedInsts.find((i) => i.installmentNumber === 1);
  const inst2 = refreshedInsts.find((i) => i.installmentNumber === 2);

  const totalProjectCost = Math.max(
    Number(summary?.totalAmountInr || proj.totalAmountInr || 0),
    Number(inst1?.amountInr || 0) + Number(inst2?.amountInr || 0)
  );
  const totalPaid = refreshedInsts.reduce((s, i) => s + Number(i.paidAmountInr || 0), 0);
  const pendingAmount = Math.max(0, totalProjectCost - totalPaid);
  const firstPaid = inst1?.status === 'Paid';
  const secondPaid = inst2?.status === 'Paid';
  const summaryStatus = totalPaid >= totalProjectCost ? 'Paid' : totalPaid > 0 ? 'Partially Paid' : 'Pending';

  if (summary) {
    await db
      .update(projectPayments)
      .set({
        totalAmountInr: totalProjectCost,
        paidAmountInr: totalPaid,
        pendingAmountInr: pendingAmount,
        status: summaryStatus,
        updatedAt: now,
      })
      .where(eq(projectPayments.id, summary.id));
  }

  let nextProjectStatus = proj.status;
  if (!firstPaid) {
    nextProjectStatus = 'Awaiting Advance Payment';
  } else if (firstPaid && secondPaid) {
    if (
      proj.status === 'Awaiting Advance Payment' ||
      proj.status === 'Final Payment Pending' ||
      proj.status === 'Project Completed'
    ) {
      nextProjectStatus = 'Ready for Handover';
    }
  } else if (proj.status === 'Awaiting Advance Payment' || proj.status === 'Advance Payment Pending') {
    nextProjectStatus = 'Advance Payment Received';
  }

  const [updatedProject] = await db
    .update(projects)
    .set({
      totalAmountInr: totalProjectCost,
      paidAmountInr: totalPaid,
      balanceAmountInr: pendingAmount,
      paymentClearanceStatus: firstPaid && secondPaid ? 'Cleared' : firstPaid ? 'Advance Paid' : 'Pending',
      handoverUnlocked: firstPaid && secondPaid ? true : proj.handoverUnlocked,
      status: nextProjectStatus,
      updatedAt: now,
    })
    .where(eq(projects.id, proj.id))
    .returning();

  // Also keep projectPaymentMilestones in sync if linked quotation exists
  if (proj.quotationId) {
    const stageOrder = params.installmentNumber;
    const msRows = await db
      .select()
      .from(projectPaymentMilestones)
      .where(and(eq(projectPaymentMilestones.projectId, proj.id), eq(projectPaymentMilestones.stageOrder, stageOrder)));
    if (msRows.length > 0 && instStatus === 'Paid') {
      await db
        .update(projectPaymentMilestones)
        .set({ status: 'paid', paymentRef: tx.transactionRef, paidAt: now })
        .where(eq(projectPaymentMilestones.id, msRows[0].id));
    }
  }

  const [enq] = await db
    .select()
    .from(projectEnquiries)
    .where(eq(projectEnquiries.id, proj.enquiryId))
    .limit(1);

  const [createdReceipt] = await db
    .insert(paymentReceipts)
    .values({
      receiptNumber: `RCP-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`,
      paymentRef: tx.transactionRef,
      userId: proj.userId,
      projectId: proj.id,
      installmentId: updatedInst.id,
      entityType: 'project_installment',
      entityId: updatedInst.id,
      paymentStage: params.installmentNumber === 1 ? 'advance' : 'final',
      amountInr: safeAmt,
      amountPaise: safeAmt * 100,
      razorpayPaymentId: params.razorpayPaymentId || tx.transactionRef,
      storageBucket: 'payment-receipts',
      payload: {
        projectCode: proj.projectCode,
        projectTitle: proj.title,
        customerName: enq?.customerName || '',
        customerEmail: enq?.customerEmail || '',
        installmentNumber: params.installmentNumber,
        installmentTitle: updatedInst.title,
        paymentMethod: tx.paymentMethod,
        totalProjectCostInr: totalProjectCost,
        totalPaidToDateInr: totalPaid,
        remainingBalanceInr: pendingAmount,
      },
    })
    .returning();

  if (createdReceipt?.id) {
    await generateAndStoreInstallmentReceiptPdf({ receiptId: createdReceipt.id }).catch((err) => {
      console.warn('[Receipt PDF] Generation warning:', (err as Error)?.message);
    });
  }

  let finalInvoiceRecord: any = null;
  if (pendingAmount <= 0 || (firstPaid && secondPaid)) {
    const finRes = await generateAndStoreFinalProjectInvoicePdf({ projectId: proj.id }).catch((err) => {
      console.warn('[Final Invoice PDF] Generation warning:', (err as Error)?.message);
      return null;
    });
    finalInvoiceRecord = finRes?.invoice || null;
  }

  if (proj.userId) {
    await db.insert(notifications).values({
      userId: proj.userId,
      title: `Installment ${params.installmentNumber} Payment Confirmed — ${proj.projectCode}`,
      message: `₹${safeAmt.toLocaleString('en-IN')} confirmed (Ref: ${tx.transactionRef}). Paid: ₹${totalPaid.toLocaleString('en-IN')} | Pending: ₹${pendingAmount.toLocaleString('en-IN')}.`,
      link: '/my-account?tab=projects',
    }).catch(() => {});
  }

  await notifyAdmins({
    type: 'payment',
    title:
      params.installmentNumber === 1
        ? `Advance Payment Received — ${proj.projectCode}`
        : `Second Installment Received — ${proj.projectCode}`,
    message: `₹${safeAmt.toLocaleString('en-IN')} verified via ${tx.paymentMethod} for ${proj.title}. Status: ${updatedProject.status}.`,
    entityType: 'project',
    entityId: String(proj.id),
    customerId: proj.customerId,
    link: '/admin/dashboard?tab=projects',
  });

  if (enq?.customerEmail) {
    await dispatchLifecycleEmail({
      userId: proj.userId,
      projectId: proj.id,
      enquiryId: proj.enquiryId,
      recipientEmail: enq.customerEmail,
      eventType: 'installment_paid_confirmation',
      vars: {
        customerName: enq.customerName,
        projectCode: proj.projectCode,
        installmentNumber: params.installmentNumber,
        installmentTitle: updatedInst.title,
        amountInr: safeAmt.toLocaleString('en-IN'),
        transactionRef: tx.transactionRef,
        paidAmountInr: totalPaid.toLocaleString('en-IN'),
        pendingAmountInr: pendingAmount.toLocaleString('en-IN'),
      },
    }).catch(() => {});
  }

  await dispatchAdminNotificationEmail({
    eventType: 'installment_paid_confirmation',
    subject: `Admin Alert: Installment ${params.installmentNumber} Paid (₹${safeAmt.toLocaleString('en-IN')}) — ${proj.projectCode}`,
    body: `Payment of ₹${safeAmt.toLocaleString('en-IN')} received for ${proj.projectCode} (${proj.title}).`,
    projectId: proj.id,
    enquiryId: proj.enquiryId,
  });

  await Promise.all([
    syncPaymentInstallmentToSupabase(updatedInst),
    syncPaymentTransactionToSupabase({
      projectId: proj.id,
      installmentId: updatedInst.id,
      installmentNumber: updatedInst.installmentNumber,
      customerId: proj.customerId,
      amountInr: tx.amountInr,
      paymentMethod: tx.paymentMethod,
      transactionRef: tx.transactionRef,
      razorpayOrderId: tx.razorpayOrderId,
      razorpayPaymentId: tx.razorpayPaymentId,
      paymentLinkId: tx.paymentLinkId,
      status: 'Paid',
      recordedBy: params.recordedBy,
      notes: tx.notes,
      paidAt: now,
    }),
    syncProjectPaymentSummaryToSupabase({
      projectId: proj.id,
      projectCode: proj.projectCode,
      customerId: proj.customerId,
      totalAmountInr: totalProjectCost,
      paidAmountInr: totalPaid,
      pendingAmountInr: pendingAmount,
      status: summaryStatus,
    }),
    syncProjectRecordToSupabase({
      projectCode: updatedProject.projectCode,
      enquiryId: updatedProject.enquiryId,
      quotationId: updatedProject.quotationId,
      customerId: updatedProject.customerId,
      title: updatedProject.title,
      category: updatedProject.category,
      description: updatedProject.description,
      budgetInr: updatedProject.budgetInr,
      status: updatedProject.status,
      progressPercent: updatedProject.progressPercent,
      totalAmountInr: updatedProject.totalAmountInr,
      paidAmountInr: updatedProject.paidAmountInr,
      balanceAmountInr: updatedProject.balanceAmountInr,
      paymentClearanceStatus: updatedProject.paymentClearanceStatus,
      assignedEngineer: updatedProject.assignedEngineer,
    }),
  ]);

  return {
    transaction: tx,
    installment: updatedInst,
    project: updatedProject,
    receipt: createdReceipt,
    finalInvoice: finalInvoiceRecord,
  };
}

export async function sendInstallmentPaymentReminder(params: {
  installmentId?: number;
  projectId?: number;
  installmentNumber?: 1 | 2;
  reminderType: 'automatic' | 'manual';
  actorEmail?: string;
}) {
  let inst = null;
  if (params.installmentId) {
    const [row] = await db
      .select()
      .from(paymentInstallments)
      .where(eq(paymentInstallments.id, params.installmentId))
      .limit(1);
    inst = row || null;
  } else if (params.projectId && params.installmentNumber) {
    const rows = await db
      .select()
      .from(paymentInstallments)
      .where(
        and(
          eq(paymentInstallments.projectId, params.projectId),
          eq(paymentInstallments.installmentNumber, params.installmentNumber)
        )
      )
      .limit(1);
    inst = rows[0] || null;
  }

  if (!inst) throw new Error('Installment not found.');
  if (inst.status === 'Paid') throw new Error('Installment is already paid.');

  const [proj] = await db.select().from(projects).where(eq(projects.id, inst.projectId)).limit(1);
  if (!proj) throw new Error('Project not found.');
  const [enq] = await db.select().from(projectEnquiries).where(eq(projectEnquiries.id, proj.enquiryId)).limit(1);
  const recipientEmail = enq?.customerEmail || '';
  if (!recipientEmail) throw new Error('Customer email unavailable.');

  const pendingAmt = Math.max(0, Number(inst.amountInr || 0) - Number(inst.paidAmountInr || 0));
  const eventType = inst.installmentNumber === 1 ? 'first_installment_reminder' : 'second_installment_reminder';
  const emailRes = await dispatchLifecycleEmail({
    userId: proj.userId,
    projectId: proj.id,
    enquiryId: proj.enquiryId,
    recipientEmail,
    eventType,
    vars: {
      customerName: enq?.customerName || 'Customer',
      projectCode: proj.projectCode,
      projectTitle: proj.title,
      amountInr: pendingAmt.toLocaleString('en-IN'),
      paymentLinkNote: inst.paymentLinkUrl
        ? `Pay directly via Razorpay link: ${inst.paymentLinkUrl}`
        : 'Pay directly from your NexusTekFusion My Projects dashboard.',
    },
  });

  if (proj.userId) {
    await db.insert(notifications).values({
      userId: proj.userId,
      title: `Payment Reminder: ${inst.title} (${proj.projectCode})`,
      message: `₹${pendingAmt.toLocaleString('en-IN')} is pending for ${inst.title}. Please complete payment to keep your project on schedule.`,
      link: '/my-account?tab=projects',
    }).catch(() => {});
  }

  const now = new Date();
  const [rem] = await db
    .insert(paymentReminders)
    .values({
      projectId: proj.id,
      installmentId: inst.id,
      userId: proj.userId,
      recipientEmail,
      installmentNumber: inst.installmentNumber,
      amountInr: pendingAmt,
      reminderType: params.reminderType,
      channel: 'email',
      deliveryStatus: emailRes.deliveryStatus || 'queued',
      errorMessage: emailRes.errorMessage || '',
      sentBy: params.actorEmail || 'system',
      sentAt: now,
    })
    .returning();

  await db
    .update(paymentInstallments)
    .set({
      lastReminderAt: now,
      reminderCount: Number(inst.reminderCount || 0) + 1,
      updatedAt: now,
    })
    .where(eq(paymentInstallments.id, inst.id));

  await syncPaymentReminderToSupabase({
    projectId: proj.id,
    installmentId: inst.id,
    recipientEmail,
    installmentNumber: inst.installmentNumber,
    amountInr: pendingAmt,
    reminderType: params.reminderType,
    deliveryStatus: rem.deliveryStatus,
    sentBy: rem.sentBy,
  });

  return rem;
}

let reminderSweepRunning = false;
export async function runScheduledInstallmentReminders() {
  if (reminderSweepRunning) return { checked: 0, sent: 0 };
  reminderSweepRunning = true;
  try {
    const unpaid = await db
      .select()
      .from(paymentInstallments)
      .where(inArray(paymentInstallments.status, ['Pending', 'Partially Paid', 'Failed']));

    const nowMs = Date.now();
    const minIntervalMs = 24 * 60 * 60 * 1000; // minimum 24h spacing between automated reminders
    let sent = 0;

    for (const inst of unpaid) {
      if (Number(inst.amountInr || 0) <= 0) continue;
      // Only remind Installment 2 automatically once Installment 1 is paid or project reached milestone
      const ageMs = nowMs - new Date(inst.createdAt).getTime();
      if (ageMs < minIntervalMs) continue;
      if (inst.lastReminderAt && nowMs - new Date(inst.lastReminderAt).getTime() < minIntervalMs) continue;

      if (inst.installmentNumber === 2) {
        const siblings = await db
          .select()
          .from(paymentInstallments)
          .where(eq(paymentInstallments.projectId, inst.projectId));
        const inst1 = siblings.find((s) => s.installmentNumber === 1);
        if (inst1 && inst1.status !== 'Paid') continue;
      }

      await sendInstallmentPaymentReminder({
        installmentId: inst.id,
        reminderType: 'automatic',
        actorEmail: 'scheduler',
      }).catch(() => null);
      sent++;
    }

    return { checked: unpaid.length, sent };
  } catch {
    return { checked: 0, sent: 0 };
  } finally {
    reminderSweepRunning = false;
  }
}

export async function buildAgreementModelForContext(params: {
  enquiryId?: number;
  projectId?: number;
  status?: 'Draft' | 'Generated' | 'Awaiting Acceptance' | 'Accepted' | string;
  acceptedAt?: string | null;
  acceptedByName?: string;
  acceptedByEmail?: string;
  acceptanceIp?: string;
  agreementNumber?: string;
  customOverrides?: Partial<ProjectAgreementDocumentModel>;
}): Promise<{
  model: ProjectAgreementDocumentModel;
  project: typeof projects.$inferSelect | null;
  enquiry: typeof projectEnquiries.$inferSelect | null;
}> {
  const settings = await getOrCreateAgreementSettings();
  let projectRow = params.projectId
    ? (await db.select().from(projects).where(eq(projects.id, params.projectId)).limit(1))[0] || null
    : null;
  let enqRow = params.enquiryId
    ? (await db.select().from(projectEnquiries).where(eq(projectEnquiries.id, params.enquiryId)).limit(1))[0] || null
    : null;

  if (projectRow && !enqRow) {
    enqRow = (await db.select().from(projectEnquiries).where(eq(projectEnquiries.id, projectRow.enquiryId)).limit(1))[0] || null;
  }
  if (!projectRow && enqRow) {
    const pRows = await db.select().from(projects).where(and(eq(projects.enquiryId, enqRow.id), eq(projects.isDeleted, false))).limit(1);
    projectRow = pRows[0] || null;
  }

  const instRows = projectRow
    ? await db.select().from(paymentInstallments).where(eq(paymentInstallments.projectId, projectRow.id))
    : [];
  const quotRow = projectRow?.quotationId
    ? (await db.select().from(projectQuotations).where(eq(projectQuotations.id, projectRow.quotationId)).limit(1))[0] || null
    : enqRow
    ? (await db.select().from(projectQuotations).where(eq(projectQuotations.enquiryId, enqRow.id)).orderBy(desc(projectQuotations.id)).limit(1))[0] || null
    : null;

  const totalCost = Math.max(
    0,
    Number(
      params.customOverrides?.totalProjectCostInr ??
        projectRow?.totalAmountInr ??
        projectRow?.budgetInr ??
        quotRow?.totalAmountInr ??
        enqRow?.budgetMaxInr ??
        enqRow?.budgetMinInr ??
        0
    )
  );

  const inst1 = instRows.find((i) => i.installmentNumber === 1);
  const inst2 = instRows.find((i) => i.installmentNumber === 2);
  const split = splitFiftyFifty(totalCost);

  const addrObj = (enqRow?.deliveryAddress || enqRow?.billingAddress || {}) as Record<string, any>;
  const customerAddress = [addrObj.houseFlat, addrObj.streetArea, addrObj.city, addrObj.state, addrObj.pinCode]
    .filter(Boolean)
    .join(', ');

  const deliverablesText = [
    quotRow?.technicalScope,
    enqRow?.expectedDeliverables,
    enqRow?.requiredFeatures ? `Required Features: ${enqRow.requiredFeatures}` : '',
    settings.defaultScopeTemplate,
  ]
    .filter(Boolean)
    .join('\n\n');

  const agreementNumber =
    params.agreementNumber ||
    `AGR-${new Date().getFullYear()}-${String(projectRow?.projectCode || enqRow?.enquiryNumber || Date.now()).replace(/[^A-Z0-9]/gi, '').slice(-8)}`;

  const model: ProjectAgreementDocumentModel = {
    agreementNumber,
    agreementDate: new Date().toLocaleDateString('en-IN'),
    status: params.status || 'Awaiting Acceptance',
    companyName: settings.companyName,
    companyLogoUrl: settings.companyLogoUrl,
    companyAddress: settings.companyAddress,
    companyContactEmail: settings.contactEmail,
    companyContactPhone: settings.contactPhone,
    companyGstin: settings.gstin,
    companyCin: settings.cin,
    customerName: enqRow?.customerName || 'Valued Client',
    customerEmail: enqRow?.customerEmail || '',
    customerPhone: enqRow?.customerPhone || '',
    customerOrganization: enqRow?.companyOrCollege || '',
    customerAddress,
    projectCode: projectRow?.projectCode || enqRow?.enquiryNumber || 'PENDING',
    enquiryNumber: enqRow?.enquiryNumber || '',
    projectTitle: projectRow?.title || enqRow?.projectTitle || 'Custom Engineering Project',
    projectDescription: projectRow?.description || enqRow?.projectDescription || '',
    scopeAndDeliverables: deliverablesText,
    totalProjectCostInr: totalCost,
    firstInstallmentInr: inst1?.amountInr ?? split.first,
    secondInstallmentInr: inst2?.amountInr ?? split.second,
    advancePaymentTerms: settings.advancePaymentTerms,
    secondPaymentTerms: settings.secondPaymentTerms,
    projectTimeline:
      quotRow?.estimatedDuration ||
      (projectRow?.estimatedCompletionDate ? `Target Completion: ${projectRow.estimatedCompletionDate}` : '') ||
      (enqRow?.targetCompletionDate ? `Target Completion: ${enqRow.targetCompletionDate}` : '') ||
      settings.defaultTimelineText,
    termsAndConditions: quotRow?.termsAndConditions || settings.termsAndConditions,
    cancellationAndRefundPolicy: settings.cancellationRefundPolicy,
    signatoryName: settings.signatoryName,
    signatoryDesignation: settings.signatoryDesignation,
    stampAssetId: settings.stampAssetId,
    signatureAssetId: settings.signatureAssetId,
    acceptedAt: params.acceptedAt || null,
    acceptedByName: params.acceptedByName || '',
    acceptedByEmail: params.acceptedByEmail || '',
    acceptanceIp: params.acceptanceIp || '',
    ...(params.customOverrides || {}),
  };

  return { model, project: projectRow, enquiry: enqRow };
}

export async function autoGenerateAgreementOnProjectApproval(params: {
  enquiryId?: number;
  projectId?: number;
  actorEmail: string;
  status?: 'Draft' | 'Generated' | 'Awaiting Acceptance';
  notes?: string;
  forceNew?: boolean;
}) {
  // Ensure project exists when approving enquiry
  let projectRow = params.projectId
    ? (await db.select().from(projects).where(eq(projects.id, params.projectId)).limit(1))[0] || null
    : null;
  if (!projectRow && params.enquiryId) {
    projectRow = await ensureProjectForEnquiry({
      enquiryId: params.enquiryId,
      initialStatus: 'Awaiting Advance Payment',
      actorEmail: params.actorEmail,
    });
  }
  if (!projectRow && !params.enquiryId) {
    throw new Error('Project ID or Enquiry ID required to generate agreement.');
  }

  // Avoid duplicate auto-generation unless forceNew is set
  if (!params.forceNew && projectRow) {
    const existing = await db
      .select()
      .from(projectAgreements)
      .where(and(eq(projectAgreements.projectId, projectRow.id), eq(projectAgreements.isDeleted, false)));
    if (existing.length > 0) {
      return existing[0];
    }
  }

  const targetStatus = params.status || 'Awaiting Acceptance';
  const agreementNumber = `AGR-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;

  const { model, project, enquiry } = await buildAgreementModelForContext({
    projectId: projectRow?.id,
    enquiryId: params.enquiryId ?? projectRow?.enquiryId,
    status: targetStatus,
    agreementNumber,
  });

  // Initialize 50%/50% payment installments if total cost > 0 and installments don't exist yet
  if (project && model.totalProjectCostInr > 0) {
    const existingInst = await db
      .select()
      .from(paymentInstallments)
      .where(eq(paymentInstallments.projectId, project.id))
      .limit(1);
    if (existingInst.length === 0) {
      await setupProjectPaymentAndInstallments({
        projectId: project.id,
        totalAmountInr: model.totalProjectCostInr,
        actorEmail: params.actorEmail,
        sendNotificationEmail: false,
      }).catch(() => {});
    }
  }

  const pdfResult = await renderProjectAgreementPdfBuffer(model);
  const fileName = `${agreementNumber}.pdf`;

  let storageBucket = 'project-agreements';
  let storagePath = '';
  if (isSupabaseStorageConfigured()) {
    const uploaded = await uploadAgreementPdfToSupabase({
      buffer: pdfResult.buffer,
      originalName: fileName,
      ownerUid: project?.customerId || enquiry?.customerId || 'shared',
      folder: project?.projectCode || enquiry?.enquiryNumber || 'agreements',
    });
    storageBucket = uploaded.bucket;
    storagePath = uploaded.storagePath;
  }

  const now = new Date();
  const [created] = await db
    .insert(projectAgreements)
    .values({
      agreementNumber,
      projectId: project?.id ?? null,
      enquiryId: enquiry?.id ?? project?.enquiryId ?? null,
      projectCode: project?.projectCode || '',
      enquiryNumber: enquiry?.enquiryNumber || '',
      userId: project?.userId ?? enquiry?.userId ?? null,
      customerId: project?.customerId || enquiry?.customerId || '',
      title: `Project Development Agreement — ${model.projectTitle}`,
      versionLabel: 'v1.0',
      // NEVER mark Accepted/Signed simply because company signature image was inserted
      status: targetStatus,
      storageBucket,
      storagePath,
      fileName,
      fileSizeBytes: pdfResult.buffer.length,
      mimeType: 'application/pdf',
      uploadedBy: params.actorEmail,
      generatedAt: now,
      awaitingAcceptanceAt: targetStatus === 'Awaiting Acceptance' ? now : null,
      companyStampAssetId: pdfResult.stampAssetId,
      companySignatureAssetId: pdfResult.signatureAssetId,
      agreementData: model as unknown as Record<string, unknown>,
      notes: params.notes || 'Automatically generated on project approval.',
    })
    .returning();

  await syncProjectAgreementToSupabase({
    sourceId: created.id,
    agreementNumber: created.agreementNumber,
    projectCode: created.projectCode,
    enquiryNumber: created.enquiryNumber,
    userUid: created.customerId,
    customerId: created.customerId,
    title: created.title,
    versionLabel: created.versionLabel,
    status: created.status,
    storageBucket: created.storageBucket,
    storagePath: created.storagePath,
    fileName: created.fileName,
    fileSizeBytes: created.fileSizeBytes,
    uploadedBy: created.uploadedBy,
    notes: created.notes,
  });

  if (created.userId) {
    await db.insert(notifications).values({
      userId: created.userId,
      title: `Project Agreement Ready (${created.agreementNumber})`,
      message: `Your Project Development Agreement for "${model.projectTitle}" is awaiting your review and digital acceptance.`,
      link: '/my-account?tab=projects',
    }).catch(() => {});
  }

  if (enquiry?.customerEmail) {
    await dispatchLifecycleEmail({
      userId: created.userId,
      projectId: created.projectId,
      enquiryId: created.enquiryId,
      recipientEmail: enquiry.customerEmail,
      eventType: targetStatus === 'Awaiting Acceptance' ? 'agreement_awaiting_acceptance' : 'agreement_generated',
      vars: {
        customerName: enquiry.customerName,
        agreementNumber: created.agreementNumber,
        projectCode: created.projectCode || created.enquiryNumber,
        projectTitle: model.projectTitle,
      },
    }).catch(() => {});
  }

  return created;
}
