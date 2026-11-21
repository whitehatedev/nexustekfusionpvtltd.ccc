import { eq, inArray, and, isNull } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { projectEmailNotifications, siteSettings, users } from '../db/schema.ts';

export interface EmailTemplateDef {
  eventType: string;
  label: string;
  enabled: boolean;
  subject: string;
  body: string;
}

export const DEFAULT_PROJECT_EMAIL_TEMPLATES: EmailTemplateDef[] = [
  {
    eventType: 'enquiry_submitted',
    label: 'Project Enquiry Received',
    enabled: true,
    subject: 'Project Enquiry Received — {{enquiryNumber}} | NexusTekFusion',
    body: 'Dear {{customerName}}, we have received your project enquiry "{{projectTitle}}" ({{enquiryNumber}}). Our engineering team will review and respond shortly.',
  },
  {
    eventType: 'enquiry_under_review',
    label: 'Project Under Technical Review',
    enabled: true,
    subject: 'Technical Evaluation Started — {{enquiryNumber}}',
    body: 'Dear {{customerName}}, your project registration {{enquiryNumber}} ("{{projectTitle}}") is currently under technical evaluation by our engineering team.',
  },
  {
    eventType: 'additional_info_requested',
    label: 'Additional Information Requested',
    enabled: true,
    subject: 'Action Required: Additional Information Needed — {{enquiryNumber}}',
    body: 'Dear {{customerName}}, our engineering team requires additional details or supporting files for {{enquiryNumber}} ("{{projectTitle}}"): {{notes}}. Please reply or upload documents from your My Projects dashboard.',
  },
  {
    eventType: 'quotation_sent',
    label: 'Quotation Published',
    enabled: true,
    subject: 'Project Quotation Ready — {{quotationNumber}} ({{enquiryNumber}})',
    body: 'Dear {{customerName}}, your itemized quotation {{quotationNumber}} totaling ₹{{totalAmountInr}} (50% Advance: ₹{{advanceAmountInr}}, Balance: ₹{{balanceAmountInr}}) is published in your My Projects dashboard.',
  },
  {
    eventType: 'project_approved',
    label: 'Quotation Approved — Advance Payment Required',
    enabled: true,
    subject: 'Quotation Approved — {{advancePercent}}% Advance Payment Pending ({{enquiryNumber}})',
    body: 'Dear {{customerName}}, thank you for approving quotation {{quotationNumber}}. Please pay the {{advancePercent}}% advance (₹{{advanceAmountInr}}) to activate your project development.',
  },
  {
    eventType: 'advance_payment_confirmed',
    label: 'Advance Payment Confirmed & Project Activated',
    enabled: true,
    subject: 'Advance Payment Received — Project {{projectCode}} Activated',
    body: 'Dear {{customerName}}, we have verified your advance payment of ₹{{amountInr}} (Ref: {{paymentRef}}). Project {{projectCode}} is now active.',
  },
  {
    eventType: 'project_started',
    label: 'Project Development Started',
    enabled: true,
    subject: 'Project Development Started — {{projectCode}}',
    body: 'Dear {{customerName}}, development work has started on project {{projectCode}} ("{{projectTitle}}"). Assigned Engineer: {{assignedEngineer}}.',
  },
  {
    eventType: 'milestone_updated',
    label: 'Project Progress Updated',
    enabled: true,
    subject: 'Project Progress Update ({{progressPercentage}}%) — {{projectCode}}',
    body: 'Dear {{customerName}}, project {{projectCode}} has a new progress update: {{summary}}.',
  },
  {
    eventType: 'testing_completed',
    label: 'Testing and Quality Assurance Update',
    enabled: true,
    subject: 'Testing & QA Update — {{projectCode}}',
    body: 'Dear {{customerName}}, testing and quality assurance inspection is underway/completed for {{projectCode}} ("{{projectTitle}}"). {{summary}}',
  },
  {
    eventType: 'project_ready_for_final_payment',
    label: 'Project Completed — Final Payment Required',
    enabled: true,
    subject: 'Project Completed — Pay Remaining {{finalPercent}}% Balance ({{projectCode}})',
    body: 'Dear {{customerName}}, development & testing for {{projectCode}} are complete. Please pay the remaining balance of ₹{{balanceAmountInr}} to unlock Ready for Handover deliverables.',
  },
  {
    eventType: 'final_payment_reminder',
    label: 'Final Payment Reminder',
    enabled: true,
    subject: 'Payment Reminder: Remaining Balance ₹{{balanceAmountInr}} — {{projectCode}}',
    body: 'Dear {{customerName}}, this is a friendly reminder to complete the remaining balance payment of ₹{{balanceAmountInr}} for {{projectCode}} so we can proceed with handover.',
  },
  {
    eventType: 'final_payment_confirmed',
    label: 'Final Payment Confirmed & Ready for Handover',
    enabled: true,
    subject: 'Final Payment Verified — {{projectCode}} Ready for Handover',
    body: 'Dear {{customerName}}, your final payment of ₹{{amountInr}} (Ref: {{paymentRef}}) is verified. Clearance Certificate {{certificateNumber}} is issued and your project deliverables are now unlocked.',
  },
  {
    eventType: 'handover_ready',
    label: 'Project Ready for Handover',
    enabled: true,
    subject: 'Project Deliverables Ready for Handover — {{projectCode}}',
    body: 'Dear {{customerName}}, final deliverables for {{projectCode}} are available in your NexusTekFusion My Projects dashboard.',
  },
  {
    eventType: 'project_dispatched',
    label: 'Physical Hardware / Kit Dispatched',
    enabled: true,
    subject: 'Hardware Dispatched — {{projectCode}} via {{courierName}}',
    body: 'Dear {{customerName}}, your deliverables for {{projectCode}} have been dispatched via {{courierName}} (Tracking: {{trackingNumber}}).',
  },
  {
    eventType: 'project_delivered',
    label: 'Project Delivered / Handed Over',
    enabled: true,
    subject: 'Project Delivered / Handed Over — {{projectCode}}',
    body: 'Dear {{customerName}}, project {{projectCode}} has been marked Delivered / Handed Over. Thank you for partnering with NEXUSTEKFUSION PRIVATE LIMITED.',
  },
  {
    eventType: 'enquiry_reply',
    label: 'Enquiry Response & Quotation Update',
    enabled: true,
    subject: 'Response to Your Enquiry {{enquiryNumber}} — {{subject}} | NexusTekFusion',
    body: 'Dear {{customerName}},\n\n{{replyMessage}}\n\nCurrent Status: {{status}}\n\nYou can also view full details and attachments inside your NexusTekFusion My Account portal.',
  },
  {
    eventType: 'payment_failed',
    label: 'Payment Failed / Cancelled',
    enabled: true,
    subject: 'Payment Attempt Unsuccessful — {{projectCode}}',
    body: 'Dear {{customerName}}, a recent payment attempt for {{projectCode}} did not complete. Please retry from your account dashboard.',
  },
  {
    eventType: 'enquiry_rejected',
    label: 'Project Proposal Declined',
    enabled: true,
    subject: 'Update on Project Registration {{enquiryNumber}}',
    body: 'Dear {{customerName}}, thank you for reaching out. Unfortunately project registration {{enquiryNumber}} could not proceed: {{reason}}.',
  },
  {
    eventType: 'store_order_placed',
    label: 'Store Order Placed',
    enabled: true,
    subject: 'Order Placed — {{orderNumber}} | NexusTekFusion Store',
    body: 'Dear {{customerName}}, we have received your order {{orderNumber}} totaling ₹{{totalInr}}. Complete payment or track your order anytime from My Account.',
  },
  {
    eventType: 'store_payment_confirmed',
    label: 'Store Payment Confirmed',
    enabled: true,
    subject: 'Payment Confirmed & Tax Invoice Ready — {{orderNumber}}',
    body: 'Dear {{customerName}}, your payment of ₹{{totalInr}} (Ref: {{paymentId}}) for order {{orderNumber}} has been verified. Your official invoice {{invoiceNumber}} is ready in My Account.',
  },
  {
    eventType: 'store_order_status_updated',
    label: 'Store Order Status Updated',
    enabled: true,
    subject: 'Order {{orderNumber}} Update: {{orderStatus}}',
    body: 'Dear {{customerName}}, your order {{orderNumber}} status is now "{{orderStatus}}". {{trackingNote}}',
  },
  {
    eventType: 'store_order_cancelled',
    label: 'Store Order Cancelled',
    enabled: true,
    subject: 'Order Cancelled — {{orderNumber}}',
    body: 'Dear {{customerName}}, your order {{orderNumber}} has been cancelled. Reason: {{reason}}.',
  },
  {
    eventType: 'product_enquiry_received',
    label: 'KRASHIVANTRI Drone Enquiry Received',
    enabled: true,
    subject: 'Enquiry Received ({{enquiryNumber}}) — {{interestedProduct}} | NexusTekFusion',
    body: 'Dear {{fullName}}, thank you for enquiring about {{interestedProduct}} (Qty {{quantity}}). Our agricultural drone specialists will contact you shortly regarding verified specifications, pricing, and delivery.',
  },
  {
    eventType: 'printing_quotation_updated',
    label: '3D Printing Quotation Updated',
    enabled: true,
    subject: '3D Printing Quotation Ready — {{orderNumber}} | NexusTekFusion',
    body: 'Dear {{customerName}}, our engineering team has reviewed your 3D CAD file ({{fileName}}) for enquiry {{orderNumber}} and updated your quotation to ₹{{quotedPriceInr}}. Please complete payment in My Account to authorize 3D printing.',
  },
  {
    eventType: 'printing_payment_confirmed',
    label: '3D Printing Payment Verified',
    enabled: true,
    subject: 'Payment Verified — 3D Print Enquiry {{orderNumber}}',
    body: 'Dear {{customerName}}, your payment of ₹{{amountInr}} for 3D printing enquiry {{orderNumber}} ({{fileName}}) is verified as Payment Successful. Your job is now eligible for printing authorization.',
  },
  {
    eventType: 'printing_approved',
    label: '3D Printing Approved & Scheduled',
    enabled: true,
    subject: 'Approved for 3D Printing — {{orderNumber}}',
    body: 'Dear {{customerName}}, your 3D printing enquiry {{orderNumber}} ({{fileName}}) has been approved for printing and queued for fabrication ({{orderStatus}}).',
  },
  {
    eventType: 'printing_status_completed',
    label: '3D Printing Job Completed / Dispatched',
    enabled: true,
    subject: '3D Print Job {{orderStatus}} — {{orderNumber}}',
    body: 'Dear {{customerName}}, your 3D printing enquiry {{orderNumber}} ({{fileName}}) is now marked "{{orderStatus}}". {{trackingNote}}',
  },
  {
    eventType: 'printing_rejected',
    label: '3D Printing Enquiry Rejected',
    enabled: true,
    subject: 'Update on 3D Printing Enquiry {{orderNumber}}',
    body: 'Dear {{customerName}}, unfortunately your 3D printing enquiry {{orderNumber}} ({{fileName}}) could not proceed: {{reason}}.',
  },
  {
    eventType: 'agreement_generated',
    label: 'Project Agreement Generated',
    enabled: true,
    subject: 'Project Development Agreement Ready — {{agreementNumber}} ({{projectCode}})',
    body: 'Dear {{customerName}}, your Project Development Agreement {{agreementNumber}} for "{{projectTitle}}" is generated and ready for your review & digital acceptance in My Projects.',
  },
  {
    eventType: 'agreement_awaiting_acceptance',
    label: 'Project Agreement Awaiting Acceptance',
    enabled: true,
    subject: 'Action Required: Accept Project Agreement {{agreementNumber}} — {{projectCode}}',
    body: 'Dear {{customerName}}, please review, download, and accept your Project Development Agreement ({{agreementNumber}}) for "{{projectTitle}}" from your My Projects dashboard.',
  },
  {
    eventType: 'agreement_accepted_confirmation',
    label: 'Project Agreement Accepted Confirmation',
    enabled: true,
    subject: 'Agreement Accepted — {{agreementNumber}} ({{projectCode}})',
    body: 'Dear {{customerName}}, thank you. Your digital acceptance for Project Agreement {{agreementNumber}} ("{{projectTitle}}") has been recorded on {{acceptedAt}}.',
  },
  {
    eventType: 'project_payment_request',
    label: 'Project Payment Request & Two 50% Installments',
    enabled: true,
    subject: 'Payment Schedule Created (₹{{totalAmountInr}}) — {{projectCode}} | NexusTekFusion',
    body: 'Dear {{customerName}}, the total project cost of ₹{{totalAmountInr}} for {{projectCode}} ("{{projectTitle}}") is structured into two 50% installments: 1st Installment (50% Advance): ₹{{firstInstallmentInr}} (due before project commencement) and 2nd Installment (50% Milestone): ₹{{secondInstallmentInr}}.',
  },
  {
    eventType: 'installment_payment_link',
    label: 'Razorpay Payment Link for Installment',
    enabled: true,
    subject: 'Payment Link: Installment {{installmentNumber}} (₹{{amountInr}}) — {{projectCode}}',
    body: 'Dear {{customerName}}, please complete Installment {{installmentNumber}} ({{installmentTitle}}) of ₹{{amountInr}} for project {{projectCode}} using the secure Razorpay payment link: {{paymentLinkUrl}}',
  },
  {
    eventType: 'first_installment_reminder',
    label: 'First Installment (50% Advance) Payment Reminder',
    enabled: true,
    subject: 'Reminder: 1st Installment (50% Advance ₹{{amountInr}}) Pending — {{projectCode}}',
    body: 'Dear {{customerName}}, your project {{projectCode}} ("{{projectTitle}}") is currently Awaiting Advance Payment. Please complete your First Installment (50% Advance) of ₹{{amountInr}} so engineering work can commence. {{paymentLinkNote}}',
  },
  {
    eventType: 'second_installment_reminder',
    label: 'Second Installment (50% Milestone) Payment Reminder',
    enabled: true,
    subject: 'Reminder: 2nd Installment (50% Milestone ₹{{amountInr}}) Pending — {{projectCode}}',
    body: 'Dear {{customerName}}, this is a reminder to pay the Second Installment (50% Milestone) of ₹{{amountInr}} for project {{projectCode}} ("{{projectTitle}}"). {{paymentLinkNote}}',
  },
  {
    eventType: 'installment_paid_confirmation',
    label: 'Project Installment Payment Confirmed',
    enabled: true,
    subject: 'Payment Confirmed: Installment {{installmentNumber}} (₹{{amountInr}}) — {{projectCode}}',
    body: 'Dear {{customerName}}, we received your payment of ₹{{amountInr}} for Installment {{installmentNumber}} ({{installmentTitle}}) of project {{projectCode}} (Ref: {{transactionRef}}). Total Paid: ₹{{paidAmountInr}} | Remaining Pending: ₹{{pendingAmountInr}}.',
  },
];

function interpolateTemplate(tpl: string, vars: Record<string, string | number | undefined>): string {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_m, k) => (vars[k] !== undefined ? String(vars[k]) : ''));
}

export async function dispatchLifecycleEmail(params: {
  userId?: number | null;
  projectId?: number | null;
  enquiryId?: number | null;
  recipientEmail: string;
  eventType: string;
  vars: Record<string, string | number | undefined>;
}) {
  if (!params.recipientEmail || !params.recipientEmail.includes('@')) {
    return { deliveryStatus: 'failed', errorMessage: 'Missing valid recipient email' };
  }

  let templates = DEFAULT_PROJECT_EMAIL_TEMPLATES;
  try {
    const [row] = await db
      .select()
      .from(siteSettings)
      .where(eq(siteSettings.key, 'projectEmailTemplates'))
      .limit(1);
    if (Array.isArray(row?.value)) {
      templates = row.value as EmailTemplateDef[];
    }
  } catch {
    // use defaults
  }

  const tpl =
    templates.find((t) => t.eventType === params.eventType) ||
    DEFAULT_PROJECT_EMAIL_TEMPLATES.find((t) => t.eventType === params.eventType);

  if (tpl && !tpl.enabled) {
    return { deliveryStatus: 'disabled', errorMessage: 'Template disabled by admin' };
  }

  const subject = interpolateTemplate(
    tpl?.subject || `NexusTekFusion Update — ${params.eventType}`,
    params.vars
  );
  const bodyText = interpolateTemplate(
    tpl?.body || 'Please check your NexusTekFusion account dashboard for updates.',
    params.vars
  );

  const fromEmail = process.env.EMAIL_FROM || 'NEXUSTEKFUSION Customer Care <info@nexustekfusion.in>';
  const resendKey = process.env.RESEND_API_KEY?.trim();
  const webhookUrl = process.env.EMAIL_WEBHOOK_URL?.trim();

  let provider = 'none';
  let deliveryStatus: 'sent' | 'failed' | 'not_configured' = 'not_configured';
  let providerMessageId = '';
  let errorMessage = '';

  if (resendKey) {
    provider = 'resend';
    try {
      const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [params.recipientEmail],
          subject,
          text: bodyText,
        }),
      });
      const json: any = await resp.json().catch(() => ({}));
      if (resp.ok && json?.id) {
        deliveryStatus = 'sent';
        providerMessageId = String(json.id);
      } else {
        deliveryStatus = 'failed';
        errorMessage = json?.message || `Resend HTTP ${resp.status}`;
      }
    } catch (err: any) {
      deliveryStatus = 'failed';
      errorMessage = err?.message || 'Resend request error';
    }
  } else if (webhookUrl) {
    provider = 'email_webhook';
    try {
      const resp = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: fromEmail,
          to: params.recipientEmail,
          subject,
          text: bodyText,
          eventType: params.eventType,
        }),
      });
      if (resp.ok) {
        deliveryStatus = 'sent';
        providerMessageId = `webhook-${Date.now()}`;
      } else {
        deliveryStatus = 'failed';
        errorMessage = `Email webhook HTTP ${resp.status}`;
      }
    } catch (err: any) {
      deliveryStatus = 'failed';
      errorMessage = err?.message || 'Email webhook error';
    }
  } else {
    provider = 'dashboard_queue';
    errorMessage = 'Queued in customer dashboard; customer care available at info@nexustekfusion.in.';
  }

  try {
    await db.insert(projectEmailNotifications).values({
      userId: params.userId ?? null,
      projectId: params.projectId ?? null,
      enquiryId: params.enquiryId ?? null,
      recipientEmail: params.recipientEmail,
      eventType: params.eventType,
      subject,
      bodyPreview: bodyText.slice(0, 500),
      provider,
      deliveryStatus,
      providerMessageId,
      errorMessage,
    });
  } catch (err) {
    console.error('Email notification log write failed:', err);
  }

  return { deliveryStatus, provider, providerMessageId, errorMessage };
}

export async function dispatchAdminNotificationEmail(params: {
  eventType: string;
  subject: string;
  body: string;
  projectId?: number | null;
  enquiryId?: number | null;
}) {
  try {
    const adminRecipients = new Set<string>();
    const envAdmin = (process.env.ADMIN_NOTIFICATION_EMAIL || process.env.EMAIL_ADMIN || '').trim().toLowerCase();
    if (envAdmin && envAdmin.includes('@')) adminRecipients.add(envAdmin);

    const adminRows = await db
      .select()
      .from(users)
      .where(and(inArray(users.role, ['super_admin', 'admin', 'project_manager', 'accounts_manager']), isNull(users.deletedAt)));
    for (const u of adminRows) {
      const email = String(u.email || '').trim().toLowerCase();
      if (email && email.includes('@')) adminRecipients.add(email);
    }

    const targets = Array.from(adminRecipients).slice(0, 5);
    for (const recipientEmail of targets) {
      await dispatchLifecycleEmail({
        projectId: params.projectId ?? null,
        enquiryId: params.enquiryId ?? null,
        recipientEmail,
        eventType: params.eventType,
        vars: {
          subject: params.subject,
          body: params.body,
          summary: params.body,
        },
      }).catch(() => {});
    }
  } catch {
    // Non-blocking admin alert email
  }
}

