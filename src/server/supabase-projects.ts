import { getServerSupabaseClient, getServiceRoleSupabaseClient } from '../lib/supabase-admin.ts';
import {
  createPublicCustomerRecord,
  findPublicCustomerByEmail,
  isPublicCustomersSchemaReady,
  isUuidStr,
  updatePublicCustomerRecord,
} from './supabase-customers.ts';

function getWriteClient() {
  return getServiceRoleSupabaseClient() || getServerSupabaseClient();
}

export async function syncProjectRegistrationToSupabase(params: {
  enquiry: {
    enquiryNumber: string;
    customerName: string;
    customerEmail: string;
    customerPhone: string;
    whatsappNumber?: string;
    companyOrCollege?: string;
    courseDepartment?: string;
    city?: string;
    state?: string;
    customerCategory?: string;
    projectTitle: string;
    projectCategory: string;
    engineeringDomain?: string;
    projectType: string;
    projectDescription: string;
    problemStatement?: string;
    objective?: string;
    expectedWorking?: string;
    requiredFeatures?: string;
    requiredTechnologies?: string;
    hardwareRequirements?: string;
    softwareRequirements?: string;
    componentsRequired?: string;
    expectedOutput?: string;
    requiresPhysicalPrototype?: boolean;
    requiresWebOrMobileApp?: boolean;
    requiresDocumentation?: boolean;
    estimatedBudget?: string;
    targetCompletionDate?: string;
    complexityLevel?: string;
    prototypeRequirements?: string;
    preferredCommunicationMethod?: string;
    specialRequirements?: string;
    acceptedTerms?: boolean;
    acceptedPrivacyPolicy?: boolean;
    status: string;
    assignedEngineer?: string;
    attachments?: Array<{ originalName: string; storagePath: string; sizeBytes: number; category?: string }>;
  };
  userUid: string;
}) {
  const client = getWriteClient();
  if (!client) return;
  const e = params.enquiry;
  try {
    const cleanEmail = String(e.customerEmail || '').trim().toLowerCase();
    if (await isPublicCustomersSchemaReady()) {
      const existingPub = cleanEmail ? await findPublicCustomerByEmail(cleanEmail) : null;
      if (existingPub) {
        await updatePublicCustomerRecord(existingPub.id, {
          ...(e.city ? { city: e.city } : {}),
          ...(e.state ? { state: e.state } : {}),
          ...(e.companyOrCollege ? { companyOrCollege: e.companyOrCollege } : {}),
        }).catch(() => {});
      } else if (cleanEmail) {
        await createPublicCustomerRecord({
          authUserId: isUuidStr(params.userUid) ? params.userUid : null,
          userUid: params.userUid,
          fullName: e.customerName,
          email: cleanEmail,
          phoneNumber: e.customerPhone,
          companyOrCollege: e.companyOrCollege || '',
          city: e.city || '',
          state: e.state || '',
          accountStatus: 'Active',
        }).catch(() => {});
      }
    } else {
      const { data: existingCust } = cleanEmail
        ? await client.from('customers').select('id').ilike('email', cleanEmail).limit(1)
        : { data: null };

      if (existingCust && existingCust.length > 0) {
        await client
          .from('customers')
          .update({
            whatsapp_number: e.whatsappNumber || '',
            department: e.courseDepartment || '',
            customer_category: e.customerCategory || 'Student',
            ...(e.city ? { city: e.city } : {}),
            ...(e.state ? { state: e.state } : {}),
            ...(e.companyOrCollege
              ? { organization: e.companyOrCollege, company_or_college: e.companyOrCollege }
              : {}),
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingCust[0].id);
      } else {
        await client.from('customers').insert({
          user_uid: params.userUid,
          full_name: e.customerName,
          email: cleanEmail,
          mobile: e.customerPhone,
          phone_number: e.customerPhone,
          whatsapp_number: e.whatsappNumber || '',
          organization: e.companyOrCollege || '',
          company_or_college: e.companyOrCollege || '',
          department: e.courseDepartment || '',
          city: e.city || '',
          state: e.state || '',
          customer_category: e.customerCategory || 'Student',
          updated_at: new Date().toISOString(),
        });
      }
    }

    await client.from('project_registrations').upsert(
      {
        registration_number: e.enquiryNumber,
        user_uid: params.userUid,
        customer_name: e.customerName,
        customer_email: e.customerEmail,
        customer_phone: e.customerPhone,
        whatsapp_number: e.whatsappNumber || '',
        company_or_college: e.companyOrCollege || '',
        department: e.courseDepartment || '',
        city: e.city || '',
        state: e.state || '',
        customer_category: e.customerCategory || 'Student',
        project_title: e.projectTitle,
        project_category: e.projectCategory,
        engineering_domain: e.engineeringDomain || '',
        project_type: e.projectType,
        project_description: e.projectDescription,
        problem_statement: e.problemStatement || '',
        objective: e.objective || '',
        expected_working: e.expectedWorking || '',
        required_features: e.requiredFeatures || '',
        preferred_technologies: e.requiredTechnologies || '',
        hardware_requirements: e.hardwareRequirements || '',
        software_requirements: e.softwareRequirements || '',
        components_required: e.componentsRequired || '',
        expected_output: e.expectedOutput || '',
        requires_physical_prototype: e.requiresPhysicalPrototype ?? true,
        requires_web_or_mobile_app: e.requiresWebOrMobileApp ?? false,
        requires_documentation: e.requiresDocumentation ?? true,
        expected_budget: e.estimatedBudget || '',
        target_completion_date: e.targetCompletionDate || '',
        complexity_level: e.complexityLevel || 'Intermediate',
        prototype_requirements: e.prototypeRequirements || '',
        preferred_communication_method: e.preferredCommunicationMethod || 'WhatsApp & Dashboard',
        additional_requirements: e.specialRequirements || '',
        accepted_terms: e.acceptedTerms ?? true,
        accepted_privacy_policy: e.acceptedPrivacyPolicy ?? true,
        status: e.status,
        assigned_engineer: e.assignedEngineer || '',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'registration_number' }
    );

    if (e.attachments?.length) {
      for (const att of e.attachments) {
        await client.from('project_attachments').insert({
          registration_number: e.enquiryNumber,
          user_uid: params.userUid,
          file_name: att.originalName,
          storage_path: att.storagePath,
          file_size_bytes: att.sizeBytes,
          category: att.category || 'supporting_document',
        });
      }
    }
  } catch {
    // Non-blocking Supabase sync
  }
}

export async function syncProjectReviewToSupabase(params: {
  registrationNumber: string;
  reviewerEmail: string;
  decisionStatus: string;
  assignedEngineer?: string;
  internalNotes?: string;
  clarificationNotes?: string;
  rejectionReason?: string;
}) {
  const client = getWriteClient();
  if (!client) return;
  try {
    await client
      .from('project_registrations')
      .update({
        status: params.decisionStatus,
        assigned_engineer: params.assignedEngineer || '',
        updated_at: new Date().toISOString(),
      })
      .eq('registration_number', params.registrationNumber);

    await client.from('project_reviews').insert({
      registration_number: params.registrationNumber,
      reviewer_email: params.reviewerEmail,
      decision_status: params.decisionStatus,
      assigned_engineer: params.assignedEngineer || '',
      internal_notes: params.internalNotes || '',
      clarification_notes: params.clarificationNotes || '',
      rejection_reason: params.rejectionReason || '',
    });
  } catch {
    // Non-blocking sync
  }
}

export async function syncProjectQuotationToSupabase(params: {
  registrationNumber: string;
  quotation: {
    quotationNumber: string;
    revisionNumber: number;
    totalAmountInr: number;
    advanceAmountInr: number;
    balanceAmountInr: number;
    gstInr: number;
    discountInr: number;
    estimatedDeliveryDate?: string;
    validityDays: number;
    status: string;
    approvedByAdmin?: boolean;
    publishedAt?: Date | string | null;
    paidAmountInr?: number;
    paymentStatus?: string;
    razorpayOrderId?: string;
    razorpayPaymentId?: string;
    hardwareCostInr?: number;
    softwareCostInr?: number;
    testingChargesInr?: number;
    documentationChargesInr?: number;
    costCategories?: Record<string, number>;
    items?: unknown[];
  };
}) {
  const client = getWriteClient();
  if (!client) return;
  const q = params.quotation;
  const cc = q.costCategories || {};
  try {
    await client.from('project_quotations').upsert(
      {
        quotation_number: q.quotationNumber,
        registration_number: params.registrationNumber,
        revision_number: q.revisionNumber,
        total_amount_inr: q.totalAmountInr,
        advance_amount_inr: q.advanceAmountInr,
        balance_amount_inr: q.balanceAmountInr,
        gst_inr: q.gstInr,
        discount_inr: q.discountInr,
        estimated_delivery_date: q.estimatedDeliveryDate || '',
        validity_days: q.validityDays,
        status: q.status,
        approved_by_admin: Boolean(q.approvedByAdmin),
        published_at: q.publishedAt ? new Date(q.publishedAt).toISOString() : null,
        paid_amount_inr: q.paidAmountInr || 0,
        payment_status: q.paymentStatus || 'pending',
        razorpay_order_id: q.razorpayOrderId || '',
        razorpay_payment_id: q.razorpayPaymentId || '',
      },
      { onConflict: 'quotation_number' }
    );

    await client.from('project_cost_breakdown').insert({
      quotation_number: q.quotationNumber,
      hardware_cost_inr: Number(cc.hardware ?? q.hardwareCostInr ?? 0),
      software_cost_inr: Number(cc.software ?? q.softwareCostInr ?? 0),
      component_cost_inr: Number(cc.sensors ?? 0),
      pcb_cost_inr: Number(cc.pcb ?? 0),
      printing_3d_cost_inr: Number((cc.printing3d || 0) + (cc.mechanical || 0)),
      engineering_charges_inr: Number((cc.development || 0) + (cc.droneRobotics || 0) + (cc.aiMl || 0) + (cc.iot || 0)),
      testing_qa_charges_inr: Number(cc.testing ?? q.testingChargesInr ?? 0),
      documentation_charges_inr: Number(cc.documentation ?? q.documentationChargesInr ?? 0),
      other_charges_inr: Number((cc.other || 0) + (cc.delivery || 0)),
      taxes_inr: q.gstInr,
      custom_items: q.items || [],
    });
  } catch {
    // Non-blocking sync
  }
}

export async function syncProjectUpdateToSupabase(params: {
  projectCode: string;
  registrationNumber: string;
  update: {
    category?: string;
    title?: string;
    description?: string;
    summary: string;
    progressPercentage?: number;
    photos?: unknown[];
    videos?: unknown[];
    reports?: unknown[];
    adminComments?: string;
    author: string;
  };
}) {
  const client = getWriteClient();
  if (!client) return;
  try {
    await client.from('project_updates').insert({
      project_code: params.projectCode,
      registration_number: params.registrationNumber,
      update_category: params.update.category || 'Development Update',
      update_title: params.update.title || 'Progress Update',
      description: params.update.description || params.update.summary,
      progress_percentage: Number(params.update.progressPercentage || 0),
      photos: params.update.photos || [],
      videos: params.update.videos || [],
      reports: params.update.reports || [],
      admin_comments: params.update.adminComments || '',
      author_email: params.update.author,
    });
  } catch {
    // Non-blocking sync
  }
}

export async function syncProjectMessageToSupabase(params: {
  registrationNumber: string;
  userUid: string;
  senderEmail: string;
  senderName: string;
  senderRole: string;
  message: string;
  attachments?: unknown[];
}) {
  const client = getWriteClient();
  if (!client) return;
  try {
    await client.from('project_messages').insert({
      registration_number: params.registrationNumber,
      user_uid: params.userUid,
      sender_email: params.senderEmail,
      sender_name: params.senderName,
      sender_role: params.senderRole,
      message: params.message,
      attachments: params.attachments || [],
    });
  } catch {
    // Non-blocking sync
  }
}

export async function syncProjectPaymentAndHandoverToSupabase(params: {
  projectCode: string;
  registrationNumber: string;
  paymentRef?: string;
  quotationNumber?: string;
  userUid?: string;
  paymentStage?: string;
  amountInr?: number;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  invoiceNumber?: string;
  docType?: string;
  gstInr?: number;
  handoverUnlocked?: boolean;
  clearanceCertificateNumber?: string;
  completionCertificateNumber?: string;
}) {
  const client = getWriteClient();
  if (!client) return;
  try {
    if (params.paymentRef && params.amountInr) {
      await client.from('project_payments').upsert(
        {
          payment_ref: params.paymentRef,
          registration_number: params.registrationNumber,
          quotation_number: params.quotationNumber || '',
          user_uid: params.userUid || '',
          payment_stage: params.paymentStage || 'advance',
          amount_inr: params.amountInr,
          amount_paise: Math.round(params.amountInr * 100),
          razorpay_order_id: params.razorpayOrderId || '',
          razorpay_payment_id: params.razorpayPaymentId || '',
          status: 'verified',
          verified_at: new Date().toISOString(),
        },
        { onConflict: 'payment_ref' }
      );
    }

    if (params.invoiceNumber && params.docType) {
      await client.from('project_invoices').upsert(
        {
          invoice_number: params.invoiceNumber,
          registration_number: params.registrationNumber,
          doc_type: params.docType,
          amount_inr: params.amountInr || 0,
          gst_inr: params.gstInr || 0,
          user_uid: params.userUid || '',
        },
        { onConflict: 'invoice_number' }
      );
    }

    await client.from('project_handover').upsert(
      {
        project_code: params.projectCode,
        registration_number: params.registrationNumber,
        handover_unlocked: Boolean(params.handoverUnlocked),
        clearance_certificate_number: params.clearanceCertificateNumber || '',
        completion_certificate_number: params.completionCertificateNumber || '',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'project_code' }
    );
  } catch {
    // Non-blocking sync
  }
}

export async function syncProjectRecordToSupabase(proj: {
  projectCode: string;
  enquiryId: number;
  quotationId?: number | null;
  customerId?: string;
  title: string;
  category?: string;
  description?: string;
  budgetInr?: number;
  status: string;
  progressPercent?: number;
  totalAmountInr?: number;
  paidAmountInr?: number;
  balanceAmountInr?: number;
  paymentClearanceStatus?: string;
  assignedEngineer?: string;
}) {
  const client = getWriteClient();
  if (!client || !proj.projectCode) return;
  try {
    await client.from('projects').upsert(
      {
        project_code: proj.projectCode,
        enquiry_id: proj.enquiryId,
        quotation_id: proj.quotationId ?? null,
        customer_id: proj.customerId || '',
        title: proj.title,
        category: proj.category || '',
        description: proj.description || '',
        budget_inr: proj.budgetInr || 0,
        status: proj.status,
        progress_percent: proj.progressPercent || 0,
        total_amount_inr: proj.totalAmountInr || 0,
        paid_amount_inr: proj.paidAmountInr || 0,
        balance_amount_inr: proj.balanceAmountInr || 0,
        payment_clearance_status: proj.paymentClearanceStatus || 'Pending',
        assigned_engineer: proj.assignedEngineer || 'Engineering Team',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'project_code' }
    );
  } catch {
    // Non-blocking sync
  }
}

export async function syncProjectPaymentSummaryToSupabase(summary: {
  projectId: number;
  projectCode: string;
  customerId?: string;
  totalAmountInr: number;
  paidAmountInr: number;
  pendingAmountInr: number;
  status: string;
  notes?: string;
  createdBy?: string;
}) {
  const client = getWriteClient();
  if (!client || !summary.projectCode) return;
  try {
    await client.from('project_payments').upsert(
      {
        project_id: summary.projectId,
        project_code: summary.projectCode,
        customer_id: summary.customerId || '',
        total_amount_inr: summary.totalAmountInr,
        paid_amount_inr: summary.paidAmountInr,
        pending_amount_inr: summary.pendingAmountInr,
        status: summary.status,
        notes: summary.notes || '',
        created_by: summary.createdBy || '',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'project_id' }
    );
  } catch {
    // Non-blocking sync
  }
}

export async function syncPaymentInstallmentToSupabase(inst: {
  id: number;
  projectId: number;
  installmentNumber: number;
  title: string;
  milestoneName?: string;
  percentage: number;
  amountInr: number;
  paidAmountInr: number;
  status: string;
  dueDate?: string;
  razorpayPaymentLinkId?: string;
  paymentLinkUrl?: string;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  paymentMethod?: string;
  paidAt?: Date | string | null;
}) {
  const client = getWriteClient();
  if (!client) return;
  try {
    await client.from('payment_installments').upsert(
      {
        id: inst.id,
        project_id: inst.projectId,
        installment_number: inst.installmentNumber,
        title: inst.title,
        milestone_name: inst.milestoneName || '',
        percentage: inst.percentage,
        amount_inr: inst.amountInr,
        paid_amount_inr: inst.paidAmountInr,
        status: inst.status,
        due_date: inst.dueDate || '',
        razorpay_payment_link_id: inst.razorpayPaymentLinkId || '',
        payment_link_url: inst.paymentLinkUrl || '',
        razorpay_order_id: inst.razorpayOrderId || '',
        razorpay_payment_id: inst.razorpayPaymentId || '',
        payment_method: inst.paymentMethod || '',
        paid_at: inst.paidAt ? new Date(inst.paidAt).toISOString() : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );
  } catch {
    // Non-blocking sync
  }
}

export async function syncPaymentReminderToSupabase(rem: {
  projectId: number;
  installmentId?: number | null;
  recipientEmail: string;
  installmentNumber: number;
  amountInr: number;
  reminderType: string;
  deliveryStatus: string;
  sentBy?: string;
}) {
  const client = getWriteClient();
  if (!client) return;
  try {
    await client.from('payment_reminders').insert({
      project_id: rem.projectId,
      installment_id: rem.installmentId ?? null,
      recipient_email: rem.recipientEmail,
      installment_number: rem.installmentNumber,
      amount_inr: rem.amountInr,
      reminder_type: rem.reminderType,
      delivery_status: rem.deliveryStatus,
      sent_by: rem.sentBy || 'system',
      sent_at: new Date().toISOString(),
    });
  } catch {
    // Non-blocking sync
  }
}

export async function syncPaymentTransactionToSupabase(tx: {
  projectId: number;
  installmentId?: number | null;
  installmentNumber: number;
  customerId?: string;
  amountInr: number;
  paymentMethod: string;
  transactionRef: string;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  paymentLinkId?: string;
  status: string;
  failureReason?: string;
  recordedBy?: string;
  notes?: string;
  paidAt?: Date | string | null;
}) {
  const client = getWriteClient();
  if (!client) return;
  try {
    await client.from('payment_transactions').insert({
      project_id: tx.projectId,
      installment_id: tx.installmentId ?? null,
      installment_number: tx.installmentNumber,
      customer_id: tx.customerId || '',
      amount_inr: tx.amountInr,
      payment_method: tx.paymentMethod,
      transaction_ref: tx.transactionRef,
      razorpay_order_id: tx.razorpayOrderId || '',
      razorpay_payment_id: tx.razorpayPaymentId || '',
      payment_link_id: tx.paymentLinkId || '',
      status: tx.status,
      failure_reason: tx.failureReason || '',
      recorded_by: tx.recordedBy || '',
      notes: tx.notes || '',
      paid_at: tx.paidAt ? new Date(tx.paidAt).toISOString() : null,
    });
  } catch {
    // Non-blocking sync
  }
}

export async function syncProjectAttachmentRecordToSupabase(att: {
  projectId?: number | null;
  enquiryId?: number | null;
  customerId?: string;
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  storageBucket: string;
  storagePath: string;
  category?: string;
  uploadedBy?: string;
}) {
  const client = getWriteClient();
  if (!client) return;
  try {
    await client.from('project_attachments').insert({
      project_id: att.projectId ?? null,
      enquiry_id: att.enquiryId ?? null,
      customer_id: att.customerId || '',
      file_name: att.fileName,
      mime_type: att.mimeType,
      file_size_bytes: att.fileSizeBytes,
      storage_bucket: att.storageBucket,
      storage_path: att.storagePath,
      category: att.category || 'supporting_document',
      uploaded_by: att.uploadedBy || '',
    });
  } catch {
    // Non-blocking sync
  }
}

export async function syncAgreementSettingsToSupabase(settings: Record<string, unknown>) {
  const client = getWriteClient();
  if (!client) return;
  try {
    await client.from('agreement_settings').upsert(
      {
        id: 1,
        company_name: settings.companyName,
        company_logo_url: settings.companyLogoUrl,
        company_address: settings.companyAddress,
        contact_email: settings.contactEmail,
        contact_phone: settings.contactPhone,
        gstin: settings.gstin || '',
        cin: settings.cin || '',
        default_scope_template: settings.defaultScopeTemplate,
        default_timeline_text: settings.defaultTimelineText,
        advance_payment_terms: settings.advancePaymentTerms,
        second_payment_terms: settings.secondPaymentTerms,
        terms_and_conditions: settings.termsAndConditions,
        cancellation_refund_policy: settings.cancellationRefundPolicy,
        signatory_name: settings.signatoryName,
        signatory_designation: settings.signatoryDesignation,
        stamp_asset_id: settings.stampAssetId ?? null,
        signature_asset_id: settings.signatureAssetId ?? null,
        updated_by: settings.updatedBy || '',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );
  } catch {
    // Non-blocking sync
  }
}

export async function syncDocumentSettingsToSupabase(settings: Record<string, unknown>) {
  const client = getWriteClient();
  if (!client) return;
  try {
    await client.from('document_settings').upsert(
      {
        id: Number(settings.id || 1),
        letterhead_file_path: settings.letterheadFilePath || '',
        letterhead_file_name: settings.letterheadFileName || '',
        letterhead_mime_type: settings.letterheadMimeType || '',
        stamp_file_path: settings.stampFilePath || '',
        stamp_file_name: settings.stampFileName || '',
        stamp_mime_type: settings.stampMimeType || '',
        signature_file_path: settings.signatureFilePath || '',
        signature_file_name: settings.signatureFileName || '',
        signature_mime_type: settings.signatureMimeType || '',
        storage_bucket: settings.storageBucket || 'company-assets',
        stamp_position: settings.stampPosition || { preset: 'bottom-left', xMm: 22, yMm: 238 },
        stamp_size: settings.stampSize || { widthMm: 30, heightMm: 30 },
        signature_position: settings.signaturePosition || { preset: 'bottom-right', xMm: 140, yMm: 244 },
        signature_size: settings.signatureSize || { widthMm: 48, heightMm: 20 },
        updated_by: settings.updatedBy || '',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );
  } catch {
    // Non-blocking sync
  }
}

export async function syncPaymentReceiptToSupabase(rcp: {
  receiptNumber: string;
  paymentRef: string;
  projectId?: number | null;
  installmentId?: number | null;
  entityType: string;
  entityId: number;
  paymentStage: string;
  amountInr: number;
  amountPaise: number;
  razorpayPaymentId?: string;
  storageBucket?: string;
  pdfStoragePath?: string;
  pdfGeneratedAt?: Date | string | null;
  payload?: Record<string, unknown>;
}) {
  const client = getWriteClient();
  if (!client) return;
  try {
    await client.from('payment_receipts').upsert(
      {
        receipt_number: rcp.receiptNumber,
        payment_ref: rcp.paymentRef,
        project_id: rcp.projectId ?? null,
        installment_id: rcp.installmentId ?? null,
        entity_type: rcp.entityType,
        entity_id: rcp.entityId,
        payment_stage: rcp.paymentStage,
        amount_inr: rcp.amountInr,
        amount_paise: rcp.amountPaise,
        razorpay_payment_id: rcp.razorpayPaymentId || '',
        storage_bucket: rcp.storageBucket || 'payment-receipts',
        pdf_storage_path: rcp.pdfStoragePath || '',
        pdf_generated_at: rcp.pdfGeneratedAt ? new Date(rcp.pdfGeneratedAt).toISOString() : null,
        payload: rcp.payload || {},
      },
      { onConflict: 'receipt_number' }
    );
  } catch {
    // Non-blocking sync
  }
}
