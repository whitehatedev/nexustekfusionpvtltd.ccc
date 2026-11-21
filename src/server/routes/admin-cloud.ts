import { Router } from 'express';
import path from 'path';
import { and, desc, eq, ilike, or } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import {
  agreementSettings,
  auditLogs,
  b2bEnquiries,
  companySigningAssets,
  customerActivityLogs,
  invoices,
  paymentInstallments,
  pcbEnquiries,
  printingOrders,
  productEnquiries,
  projectAgreements,
  projectEnquiries,
  projectQuotations,
  projects,
  razorpayPaymentLinks,
  recordStatusHistory,
  storeOrders,
  supportTickets,
  users,
} from '../../db/schema.ts';
import { AuthRequest } from '../../middleware/auth.ts';
import {
  downloadFromSupabaseStorage,
  isSupabaseStorageConfigured,
  uploadAgreementPdfToSupabase,
  uploadSigningAssetToSupabase,
} from '../../lib/supabase-admin.ts';
import {
  cancelRazorpayPaymentLink,
  createRazorpayPaymentLink,
  fetchRazorpayPaymentLink,
} from '../razorpay.ts';
import {
  generateAndStoreInvoicePdf,
  type ProjectAgreementDocumentModel,
  renderProjectAgreementPdfBuffer,
} from '../pdf-storage.ts';
import { recordEntityStatusChange } from '../record-history.ts';
import { reconcileProjectQuotationPayment } from '../project-lifecycle.ts';
import {
  autoGenerateAgreementOnProjectApproval,
  buildAgreementModelForContext,
  getOrCreateAgreementSettings,
  recordInstallmentPayment,
} from '../project-upgrade-service.ts';
import {
  syncCompanySigningAssetToSupabase,
  syncInvoiceToSupabase,
  syncPaymentToSupabase,
  syncPrintingOrderToSupabase,
  syncProjectAgreementToSupabase,
  syncRazorpayPaymentLinkToSupabase,
  syncStoreOrderToSupabase,
} from '../supabase-ecommerce.ts';
import { syncAgreementSettingsToSupabase, syncPaymentInstallmentToSupabase } from '../supabase-projects.ts';
import { createMemoryUploadMiddleware, createNotification, generateCode, logAudit } from '../utils.ts';
import { dispatchLifecycleEmail } from '../email.ts';
import { emitAdminStreamEvent } from '../admin-realtime.ts';

export const adminCloudRouter = Router();

const agreementPdfUpload = createMemoryUploadMiddleware(['.pdf'], 30);
const signingAssetUpload = createMemoryUploadMiddleware(['.png', '.jpg', '.jpeg', '.webp'], 10);

async function resolveOwnerUid(userId: number | null | undefined, customerId?: string): Promise<string> {
  if (userId) {
    const [u] = await db
      .select({ uid: users.uid, authUserId: users.authUserId })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (u) return u.authUserId || u.uid || customerId || '';
  }
  return customerId || '';
}

// ============================================================================
// 1. PROJECT AGREEMENTS (Metadata in PostgreSQL + PDF in Supabase Storage)
// ============================================================================
adminCloudRouter.get('/agreements', async (req, res) => {
  try {
    const includeArchived = req.query.includeArchived === 'true';
    const projectIdFilter = req.query.projectId ? Number(req.query.projectId) : null;
    const enquiryIdFilter = req.query.enquiryId ? Number(req.query.enquiryId) : null;
    const customerIdFilter = String(req.query.customerId || '').trim();
    const statusFilter = String(req.query.status || '').trim();

    const rows = await db
      .select()
      .from(projectAgreements)
      .orderBy(desc(projectAgreements.createdAt));

    const filtered = rows.filter((r) => {
      if (!includeArchived && r.isDeleted) return false;
      if (projectIdFilter && r.projectId !== projectIdFilter) return false;
      if (enquiryIdFilter && r.enquiryId !== enquiryIdFilter) return false;
      if (customerIdFilter && r.customerId !== customerIdFilter) return false;
      if (statusFilter && statusFilter !== 'all' && r.status !== statusFilter) return false;
      return true;
    });

    res.json({ agreements: filtered });
  } catch (error) {
    console.error('List agreements error:', error);
    res.status(500).json({ error: 'Failed to load project agreements.' });
  }
});

// Agreement Settings (Company Stamp, Signature, Logo, Clauses & Contact Info)
adminCloudRouter.get('/agreement-settings', async (_req, res) => {
  try {
    const settings = await getOrCreateAgreementSettings();
    res.json({ settings });
  } catch (error) {
    console.error('Get agreement settings error:', error);
    res.status(500).json({ error: 'Failed to load agreement settings.' });
  }
});

adminCloudRouter.put('/agreement-settings', async (req: AuthRequest, res) => {
  try {
    const existing = await getOrCreateAgreementSettings();
    const b = req.body || {};
    const [updated] = await db
      .update(agreementSettings)
      .set({
        companyName: b.companyName !== undefined ? String(b.companyName).trim() : existing.companyName,
        companyLogoUrl: b.companyLogoUrl !== undefined ? String(b.companyLogoUrl).trim() : existing.companyLogoUrl,
        companyAddress: b.companyAddress !== undefined ? String(b.companyAddress).trim() : existing.companyAddress,
        contactEmail: b.contactEmail !== undefined ? String(b.contactEmail).trim() : existing.contactEmail,
        contactPhone: b.contactPhone !== undefined ? String(b.contactPhone).trim() : existing.contactPhone,
        gstin: b.gstin !== undefined ? String(b.gstin).trim() : existing.gstin,
        cin: b.cin !== undefined ? String(b.cin).trim() : existing.cin,
        signatoryName: b.signatoryName !== undefined ? String(b.signatoryName).trim() : existing.signatoryName,
        signatoryDesignation:
          b.signatoryDesignation !== undefined ? String(b.signatoryDesignation).trim() : existing.signatoryDesignation,
        stampAssetId: b.stampAssetId !== undefined ? (b.stampAssetId ? Number(b.stampAssetId) : null) : existing.stampAssetId,
        signatureAssetId:
          b.signatureAssetId !== undefined ? (b.signatureAssetId ? Number(b.signatureAssetId) : null) : existing.signatureAssetId,
        defaultScopeTemplate:
          b.defaultScopeTemplate !== undefined ? String(b.defaultScopeTemplate).trim() : existing.defaultScopeTemplate,
        defaultTimelineText:
          b.defaultTimelineText !== undefined ? String(b.defaultTimelineText).trim() : existing.defaultTimelineText,
        advancePaymentTerms:
          b.advancePaymentTerms !== undefined ? String(b.advancePaymentTerms).trim() : existing.advancePaymentTerms,
        secondPaymentTerms:
          b.secondPaymentTerms !== undefined ? String(b.secondPaymentTerms).trim() : existing.secondPaymentTerms,
        termsAndConditions:
          b.termsAndConditions !== undefined ? String(b.termsAndConditions).trim() : existing.termsAndConditions,
        cancellationRefundPolicy:
          b.cancellationRefundPolicy !== undefined
            ? String(b.cancellationRefundPolicy).trim()
            : existing.cancellationRefundPolicy,
        updatedBy: req.dbUser!.email,
        updatedAt: new Date(),
      })
      .where(eq(agreementSettings.id, existing.id))
      .returning();

    syncAgreementSettingsToSupabase(updated).catch(() => {});
    await logAudit({
      actorUid: req.dbUser!.uid,
      actorEmail: req.dbUser!.email,
      action: 'UPDATE_AGREEMENT_SETTINGS',
      entityType: 'agreement_settings',
      entityId: updated.id,
      details: { companyName: updated.companyName, stampAssetId: updated.stampAssetId, signatureAssetId: updated.signatureAssetId },
    });

    res.json({ settings: updated });
  } catch (error) {
    console.error('Update agreement settings error:', error);
    res.status(500).json({ error: 'Failed to save agreement settings.' });
  }
});

// Preview Agreement PDF before generating final agreement
adminCloudRouter.post('/agreements/preview', async (req: AuthRequest, res) => {
  try {
    const b = req.body || {};
    const projectId = b.projectId ? Number(b.projectId) : undefined;
    const enquiryId = b.enquiryId ? Number(b.enquiryId) : undefined;
    const { model } = await buildAgreementModelForContext({
      projectId,
      enquiryId,
      status: String(b.status || 'Draft'),
      customOverrides: b.customOverrides && typeof b.customOverrides === 'object' ? b.customOverrides : undefined,
    });
    const rendered = await renderProjectAgreementPdfBuffer(model);
    res.json({
      model,
      pdfBase64: rendered.buffer.toString('base64'),
    });
  } catch (error: any) {
    console.error('Preview agreement error:', error);
    res.status(500).json({ error: error?.message || 'Failed to generate agreement preview PDF.' });
  }
});

// Generate Automatic Agreement PDF for a Project or Project Enquiry
adminCloudRouter.post('/projects/:id/agreements/generate', async (req: AuthRequest, res) => {
  try {
    const projectId = Number(req.params.id);
    const b = req.body || {};
    const requestedStatus = ['Draft', 'Generated', 'Awaiting Acceptance'].includes(String(b.status || ''))
      ? (String(b.status) as 'Draft' | 'Generated' | 'Awaiting Acceptance')
      : 'Awaiting Acceptance';
    const created = await autoGenerateAgreementOnProjectApproval({
      projectId,
      actorEmail: req.dbUser!.email,
      status: requestedStatus,
      notes: String(b.notes || 'Generated by Admin from Project Console.'),
      forceNew: b.forceNew !== false,
    });
    emitAdminStreamEvent({ type: 'project', action: 'agreement_generated', id: created.agreementNumber });
    res.status(201).json({ agreement: created });
  } catch (error: any) {
    console.error('Generate project agreement error:', error);
    res.status(500).json({ error: error?.message || 'Failed to generate agreement PDF.' });
  }
});

adminCloudRouter.post('/project-enquiries/:id/agreements/generate', async (req: AuthRequest, res) => {
  try {
    const enquiryId = Number(req.params.id);
    const b = req.body || {};
    const requestedStatus = ['Draft', 'Generated', 'Awaiting Acceptance'].includes(String(b.status || ''))
      ? (String(b.status) as 'Draft' | 'Generated' | 'Awaiting Acceptance')
      : 'Awaiting Acceptance';
    const created = await autoGenerateAgreementOnProjectApproval({
      enquiryId,
      actorEmail: req.dbUser!.email,
      status: requestedStatus,
      notes: String(b.notes || 'Generated by Admin for Project Enquiry.'),
      forceNew: b.forceNew !== false,
    });
    emitAdminStreamEvent({ type: 'project', action: 'agreement_generated', id: created.agreementNumber });
    res.status(201).json({ agreement: created });
  } catch (error: any) {
    console.error('Generate enquiry agreement error:', error);
    res.status(500).json({ error: error?.message || 'Failed to generate agreement PDF.' });
  }
});

async function createAgreementHandler(req: AuthRequest, res: any, explicitProjectId?: number) {
  try {
    if (!isSupabaseStorageConfigured()) {
      return res.status(503).json({
        error: 'Supabase Storage is not configured. Configure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to store agreement PDFs.',
      });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Agreement PDF file is required.' });
    }

    const b = req.body || {};
    const projectId = explicitProjectId || (b.projectId ? Number(b.projectId) : null);
    const enquiryIdInput = b.enquiryId ? Number(b.enquiryId) : null;
    const title = String(b.title || req.file.originalname.replace(/\.pdf$/i, '') || 'Engineering Service Agreement').trim();
    const versionLabel = String(b.versionLabel || 'v1.0').trim();
    const status = String(b.status || 'Awaiting Acceptance').trim();
    const notes = String(b.notes || '').trim();

    let projectRow: typeof projects.$inferSelect | undefined;
    let enquiryRow: typeof projectEnquiries.$inferSelect | undefined;

    if (projectId) {
      [projectRow] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
      if (!projectRow) return res.status(404).json({ error: 'Project not found.' });
      [enquiryRow] = await db
        .select()
        .from(projectEnquiries)
        .where(eq(projectEnquiries.id, projectRow.enquiryId))
        .limit(1);
    } else if (enquiryIdInput) {
      [enquiryRow] = await db
        .select()
        .from(projectEnquiries)
        .where(eq(projectEnquiries.id, enquiryIdInput))
        .limit(1);
      if (!enquiryRow) return res.status(404).json({ error: 'Project enquiry not found.' });
      [projectRow] = await db
        .select()
        .from(projects)
        .where(eq(projects.enquiryId, enquiryRow.id))
        .limit(1);
    }

    const userId = projectRow?.userId || enquiryRow?.userId || (b.userId ? Number(b.userId) : null);
    const customerId = String(
      b.customerId || projectRow?.customerId || enquiryRow?.customerId || ''
    ).trim();
    const userUid = await resolveOwnerUid(userId, customerId);

    const agreementNumber = generateCode('NTF-AGR');
    const uploaded = await uploadAgreementPdfToSupabase({
      buffer: req.file.buffer,
      originalName: req.file.originalname || `${agreementNumber}.pdf`,
      ownerUid: userUid || customerId || 'company',
      folder: projectRow?.projectCode || enquiryRow?.enquiryNumber || agreementNumber,
    });

    const [created] = await db
      .insert(projectAgreements)
      .values({
        agreementNumber,
        projectId: projectRow?.id ?? null,
        enquiryId: enquiryRow?.id ?? null,
        projectCode: projectRow?.projectCode || '',
        enquiryNumber: enquiryRow?.enquiryNumber || '',
        userId: userId ?? null,
        customerId,
        title,
        versionLabel,
        status,
        storageBucket: uploaded.bucket,
        storagePath: uploaded.storagePath,
        fileName: uploaded.fileName,
        fileSizeBytes: uploaded.sizeBytes,
        mimeType: 'application/pdf',
        uploadedBy: req.dbUser!.email,
        notes,
      })
      .returning();

    await syncProjectAgreementToSupabase({
      sourceId: created.id,
      agreementNumber: created.agreementNumber,
      projectCode: created.projectCode,
      enquiryNumber: created.enquiryNumber,
      userUid,
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

    await recordEntityStatusChange({
      entityType: 'project_agreement',
      entityId: created.id,
      entityCode: created.agreementNumber,
      customerId: created.customerId,
      userId: created.userId,
      userUid,
      customerEmail: enquiryRow?.customerEmail || '',
      previousStatus: 'None',
      newStatus: created.status,
      actionType: 'status_change',
      reason: `Agreement uploaded (${created.title})`,
      adminId: req.dbUser!.uid,
      adminEmail: req.dbUser!.email,
      originalRecord: created as unknown as Record<string, unknown>,
    });

    if (created.userId) {
      await createNotification({
        userId: created.userId,
        title: `Project Agreement Issued — ${created.agreementNumber}`,
        message: `${created.title} (${created.versionLabel}) is ready for review and signature in your account.`,
        link: '/my-account',
      }).catch(() => {});
    }

    if (enquiryRow?.customerEmail) {
      dispatchLifecycleEmail({
        userId: created.userId,
        projectId: projectRow?.id ?? null,
        enquiryId: enquiryRow.id,
        recipientEmail: enquiryRow.customerEmail,
        eventType: 'project_agreement_issued',
        vars: {
          customerName: enquiryRow.customerName,
          agreementNumber: created.agreementNumber,
          title: created.title,
          projectCode: created.projectCode || created.enquiryNumber,
        },
      }).catch(() => {});
    }

    emitAdminStreamEvent({ type: 'project', action: 'agreement_uploaded', id: created.agreementNumber });
    res.status(201).json({ agreement: created });
  } catch (error: any) {
    console.error('Create agreement error:', error);
    res.status(500).json({ error: error?.message || 'Failed to upload agreement PDF.' });
  }
}

adminCloudRouter.post(
  '/agreements',
  agreementPdfUpload.single('file'),
  async (req: AuthRequest, res) => createAgreementHandler(req, res)
);

adminCloudRouter.post(
  '/projects/:id/agreements',
  agreementPdfUpload.single('file'),
  async (req: AuthRequest, res) => createAgreementHandler(req, res, Number(req.params.id))
);

adminCloudRouter.patch('/agreements/:id', agreementPdfUpload.single('file'), async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const [existing] = await db.select().from(projectAgreements).where(eq(projectAgreements.id, id)).limit(1);
    if (!existing) return res.status(404).json({ error: 'Agreement not found.' });

    const b = req.body || {};
    let storageBucket = existing.storageBucket;
    let storagePath = existing.storagePath;
    let fileName = existing.fileName;
    let fileSizeBytes = existing.fileSizeBytes;
    const userUid = await resolveOwnerUid(existing.userId, existing.customerId);

    if (req.file) {
      if (!isSupabaseStorageConfigured()) {
        return res.status(503).json({
          error: 'Supabase Storage is not configured. Cannot replace agreement PDF.',
        });
      }
      const uploaded = await uploadAgreementPdfToSupabase({
        buffer: req.file.buffer,
        originalName: req.file.originalname,
        ownerUid: userUid || existing.customerId || 'company',
        folder: existing.projectCode || existing.enquiryNumber || existing.agreementNumber,
      });
      storageBucket = uploaded.bucket;
      storagePath = uploaded.storagePath;
      fileName = uploaded.fileName;
      fileSizeBytes = uploaded.sizeBytes;
    }

    const nextStatus = b.status !== undefined ? String(b.status).trim() : existing.status;
    const [updated] = await db
      .update(projectAgreements)
      .set({
        title: b.title !== undefined ? String(b.title).trim() : existing.title,
        versionLabel: b.versionLabel !== undefined ? String(b.versionLabel).trim() : existing.versionLabel,
        status: nextStatus,
        notes: b.notes !== undefined ? String(b.notes).trim() : existing.notes,
        storageBucket,
        storagePath,
        fileName,
        fileSizeBytes,
        updatedAt: new Date(),
      })
      .where(eq(projectAgreements.id, id))
      .returning();

    await syncProjectAgreementToSupabase({
      sourceId: updated.id,
      agreementNumber: updated.agreementNumber,
      projectCode: updated.projectCode,
      enquiryNumber: updated.enquiryNumber,
      userUid,
      customerId: updated.customerId,
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
      uploadedBy: updated.uploadedBy,
      signedByCustomer: updated.signedByCustomer,
      signedAt: updated.signedAt,
      notes: updated.notes,
      isDeleted: updated.isDeleted,
      archivedReason: updated.archivedReason,
      archivedBy: updated.archivedBy,
    });

    if (nextStatus !== existing.status) {
      await recordEntityStatusChange({
        entityType: 'project_agreement',
        entityId: updated.id,
        entityCode: updated.agreementNumber,
        customerId: updated.customerId,
        userId: updated.userId,
        userUid,
        previousStatus: existing.status,
        newStatus: nextStatus,
        actionType: 'status_change',
        reason: String(b.reason || 'Admin updated agreement').trim(),
        adminId: req.dbUser!.uid,
        adminEmail: req.dbUser!.email,
        originalRecord: existing as unknown as Record<string, unknown>,
      });
    }

    res.json({ agreement: updated });
  } catch (error: any) {
    console.error('Update agreement error:', error);
    res.status(500).json({ error: error?.message || 'Failed to update agreement.' });
  }
});

adminCloudRouter.delete('/agreements/:id', async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const reason = String(req.body?.reason || req.query?.reason || 'Archived by Admin').trim();
    const [existing] = await db.select().from(projectAgreements).where(eq(projectAgreements.id, id)).limit(1);
    if (!existing) return res.status(404).json({ error: 'Agreement not found.' });

    const [archived] = await db
      .update(projectAgreements)
      .set({
        isDeleted: true,
        status: 'Archived',
        archivedAt: new Date(),
        archivedReason: reason,
        archivedBy: req.dbUser!.email,
        updatedAt: new Date(),
      })
      .where(eq(projectAgreements.id, id))
      .returning();

    const userUid = await resolveOwnerUid(existing.userId, existing.customerId);
    await syncProjectAgreementToSupabase({
      sourceId: archived.id,
      agreementNumber: archived.agreementNumber,
      projectCode: archived.projectCode,
      enquiryNumber: archived.enquiryNumber,
      userUid,
      customerId: archived.customerId,
      title: archived.title,
      versionLabel: archived.versionLabel,
      status: archived.status,
      storageBucket: archived.storageBucket,
      storagePath: archived.storagePath,
      fileName: archived.fileName,
      fileSizeBytes: archived.fileSizeBytes,
      signedPdfBucket: archived.signedPdfBucket,
      signedPdfPath: archived.signedPdfPath,
      signedFileName: archived.signedFileName,
      uploadedBy: archived.uploadedBy,
      signedByCustomer: archived.signedByCustomer,
      signedAt: archived.signedAt,
      notes: archived.notes,
      isDeleted: true,
      archivedReason: reason,
      archivedBy: req.dbUser!.email,
    });

    await recordEntityStatusChange({
      entityType: 'project_agreement',
      entityId: existing.id,
      entityCode: existing.agreementNumber,
      customerId: existing.customerId,
      userId: existing.userId,
      userUid,
      previousStatus: existing.status,
      newStatus: 'Archived',
      actionType: 'archive',
      reason,
      adminId: req.dbUser!.uid,
      adminEmail: req.dbUser!.email,
      originalRecord: existing as unknown as Record<string, unknown>,
    });

    res.json({ archived: true, agreement: archived });
  } catch (error) {
    console.error('Archive agreement error:', error);
    res.status(500).json({ error: 'Failed to archive agreement.' });
  }
});

adminCloudRouter.get('/agreements/:id/download', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const kind = req.query.kind === 'signed' ? 'signed' : 'original';
    const [ag] = await db.select().from(projectAgreements).where(eq(projectAgreements.id, id)).limit(1);
    if (!ag) return res.status(404).json({ error: 'Agreement not found.' });

    const primaryBucket =
      kind === 'signed' ? ag.signedPdfBucket || 'project-agreements' : ag.storageBucket || 'project-agreements';
    const objectPath = kind === 'signed' ? ag.signedPdfPath : ag.storagePath;
    const fileName =
      kind === 'signed'
        ? ag.signedFileName || `${ag.agreementNumber}-signed.pdf`
        : ag.fileName || `${ag.agreementNumber}.pdf`;

    let buf: Buffer | null = null;
    if (objectPath && isSupabaseStorageConfigured()) {
      const candidateBuckets = Array.from(new Set([primaryBucket, 'project-agreements', 'agreements']));
      for (const bkt of candidateBuckets) {
        buf = await downloadFromSupabaseStorage(bkt, objectPath);
        if (buf) break;
      }
    }

    // Re-render on-the-fly from stored structured agreementData when storage isn't configured or file is unavailable
    if (!buf && kind !== 'signed') {
      const storedModel = ag.agreementData as unknown as ProjectAgreementDocumentModel | undefined;
      if (storedModel && storedModel.projectTitle) {
        const rendered = await renderProjectAgreementPdfBuffer({
          ...storedModel,
          status: ag.status,
          acceptedAt: ag.acceptedAt ? new Date(ag.acceptedAt).toISOString() : storedModel.acceptedAt || null,
          acceptedByName: ag.acceptedByName || storedModel.acceptedByName || '',
          acceptedByEmail: ag.acceptedByEmail || storedModel.acceptedByEmail || '',
          acceptanceIp: ag.acceptanceIp || storedModel.acceptanceIp || '',
        });
        buf = rendered.buffer;
      } else if (ag.projectId || ag.enquiryId) {
        const built = await buildAgreementModelForContext({
          projectId: ag.projectId ?? undefined,
          enquiryId: ag.enquiryId ?? undefined,
          status: ag.status,
          agreementNumber: ag.agreementNumber,
          acceptedAt: ag.acceptedAt ? new Date(ag.acceptedAt).toISOString() : null,
          acceptedByName: ag.acceptedByName,
          acceptedByEmail: ag.acceptedByEmail,
          acceptanceIp: ag.acceptanceIp,
        });
        const rendered = await renderProjectAgreementPdfBuffer(built.model);
        buf = rendered.buffer;
      }
    }

    if (!buf) {
      return res.status(404).json({
        error: kind === 'signed' ? 'Customer has not uploaded a signed copy yet.' : 'Agreement PDF not found.',
      });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Cache-Control', 'no-store, private');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
    return res.send(buf);
  } catch (error) {
    console.error('Admin download agreement error:', error);
    res.status(500).json({ error: 'Failed to download agreement PDF.' });
  }
});

// ============================================================================
// 2. COMPANY SIGNATURES & STAMPS (Supabase Storage: signatures-stamps)
// ============================================================================
adminCloudRouter.get('/signing-assets', async (req, res) => {
  try {
    const includeArchived = req.query.includeArchived === 'true';
    const rows = await db
      .select()
      .from(companySigningAssets)
      .orderBy(desc(companySigningAssets.createdAt));

    res.json({
      assets: includeArchived ? rows : rows.filter((r) => !r.isDeleted),
    });
  } catch (error) {
    console.error('List signing assets error:', error);
    res.status(500).json({ error: 'Failed to load company signatures and stamps.' });
  }
});

adminCloudRouter.post('/signing-assets', signingAssetUpload.single('file'), async (req: AuthRequest, res) => {
  try {
    if (!isSupabaseStorageConfigured()) {
      return res.status(503).json({
        error: 'Supabase Storage is not configured. Configure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to store signatures & stamps.',
      });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Signature or stamp image file (.png, .jpg, .webp) is required.' });
    }

    const b = req.body || {};
    const assetType: 'signature' | 'stamp' | 'logo' =
      b.assetType === 'stamp' ? 'stamp' : b.assetType === 'logo' ? 'logo' : 'signature';
    const label = String(
      b.label ||
        (assetType === 'stamp'
          ? 'Official Company Seal'
          : assetType === 'logo'
          ? 'Company Logo'
          : 'Authorized Signatory')
    ).trim();
    const signatoryName = String(b.signatoryName || '').trim();
    const designation = String(b.designation || '').trim();
    const isActive = b.isActive !== 'false' && b.isActive !== false;

    const uploaded = await uploadSigningAssetToSupabase({
      buffer: req.file.buffer,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype || 'image/png',
      assetType,
    });

    if (isActive) {
      await db
        .update(companySigningAssets)
        .set({ isActive: false, updatedAt: new Date() })
        .where(and(eq(companySigningAssets.assetType, assetType), eq(companySigningAssets.isDeleted, false)));
    }

    const [created] = await db
      .insert(companySigningAssets)
      .values({
        assetType,
        label,
        signatoryName,
        designation,
        storageBucket: uploaded.bucket,
        storagePath: uploaded.storagePath,
        fileName: uploaded.fileName,
        mimeType: req.file.mimetype || 'image/png',
        fileSizeBytes: uploaded.sizeBytes,
        isActive,
        uploadedBy: req.dbUser!.email,
      })
      .returning();

    if (isActive && (assetType === 'stamp' || assetType === 'signature')) {
      const cfg = await getOrCreateAgreementSettings();
      await db
        .update(agreementSettings)
        .set({
          ...(assetType === 'stamp' ? { stampAssetId: created.id } : {}),
          ...(assetType === 'signature'
            ? {
                signatureAssetId: created.id,
                signatoryName: signatoryName || cfg.signatoryName,
                signatoryDesignation: designation || cfg.signatoryDesignation,
              }
            : {}),
          updatedBy: req.dbUser!.email,
          updatedAt: new Date(),
        })
        .where(eq(agreementSettings.id, cfg.id));
    }

    await syncCompanySigningAssetToSupabase({
      sourceId: created.id,
      assetType: created.assetType,
      label: created.label,
      signatoryName: created.signatoryName,
      designation: created.designation,
      storageBucket: created.storageBucket,
      storagePath: created.storagePath,
      fileName: created.fileName,
      mimeType: created.mimeType,
      fileSizeBytes: created.fileSizeBytes,
      isActive: created.isActive,
      uploadedBy: created.uploadedBy,
      isDeleted: created.isDeleted,
    });

    await logAudit({
      actorUid: req.dbUser!.uid,
      actorEmail: req.dbUser!.email,
      action: `UPLOAD_COMPANY_${assetType.toUpperCase()}`,
      entityType: 'company_signing_asset',
      entityId: created.id,
      details: { label: created.label, storagePath: created.storagePath, isActive },
    });

    res.status(201).json({ asset: created });
  } catch (error: any) {
    console.error('Upload signing asset error:', error);
    res.status(500).json({ error: error?.message || 'Failed to upload signing asset.' });
  }
});

adminCloudRouter.patch('/signing-assets/:id', async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const [existing] = await db
      .select()
      .from(companySigningAssets)
      .where(eq(companySigningAssets.id, id))
      .limit(1);
    if (!existing) return res.status(404).json({ error: 'Signing asset not found.' });

    const b = req.body || {};
    const nextActive = typeof b.isActive === 'boolean' ? b.isActive : existing.isActive;
    if (nextActive) {
      await db
        .update(companySigningAssets)
        .set({ isActive: false, updatedAt: new Date() })
        .where(and(eq(companySigningAssets.assetType, existing.assetType), eq(companySigningAssets.isDeleted, false)));
    }

    const [updated] = await db
      .update(companySigningAssets)
      .set({
        label: b.label !== undefined ? String(b.label).trim() : existing.label,
        signatoryName: b.signatoryName !== undefined ? String(b.signatoryName).trim() : existing.signatoryName,
        designation: b.designation !== undefined ? String(b.designation).trim() : existing.designation,
        isActive: nextActive,
        updatedAt: new Date(),
      })
      .where(eq(companySigningAssets.id, id))
      .returning();

    await syncCompanySigningAssetToSupabase({
      sourceId: updated.id,
      assetType: updated.assetType,
      label: updated.label,
      signatoryName: updated.signatoryName,
      designation: updated.designation,
      storageBucket: updated.storageBucket,
      storagePath: updated.storagePath,
      fileName: updated.fileName,
      mimeType: updated.mimeType,
      fileSizeBytes: updated.fileSizeBytes,
      isActive: updated.isActive,
      uploadedBy: updated.uploadedBy,
      isDeleted: updated.isDeleted,
    });

    res.json({ asset: updated });
  } catch (error) {
    console.error('Update signing asset error:', error);
    res.status(500).json({ error: 'Failed to update signing asset.' });
  }
});

adminCloudRouter.delete('/signing-assets/:id', async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const reason = String(req.body?.reason || req.query?.reason || 'Archived by Admin').trim();
    const [existing] = await db
      .select()
      .from(companySigningAssets)
      .where(eq(companySigningAssets.id, id))
      .limit(1);
    if (!existing) return res.status(404).json({ error: 'Signing asset not found.' });

    const [archived] = await db
      .update(companySigningAssets)
      .set({
        isActive: false,
        isDeleted: true,
        archivedAt: new Date(),
        archivedReason: reason,
        updatedAt: new Date(),
      })
      .where(eq(companySigningAssets.id, id))
      .returning();

    await syncCompanySigningAssetToSupabase({
      sourceId: archived.id,
      assetType: archived.assetType,
      label: archived.label,
      signatoryName: archived.signatoryName,
      designation: archived.designation,
      storageBucket: archived.storageBucket,
      storagePath: archived.storagePath,
      fileName: archived.fileName,
      mimeType: archived.mimeType,
      fileSizeBytes: archived.fileSizeBytes,
      isActive: false,
      uploadedBy: archived.uploadedBy,
      isDeleted: true,
    });

    await recordEntityStatusChange({
      entityType: 'company_signing_asset',
      entityId: existing.id,
      entityCode: existing.label,
      previousStatus: existing.isActive ? 'Active' : 'Inactive',
      newStatus: 'Archived',
      actionType: 'archive',
      reason,
      adminId: req.dbUser!.uid,
      adminEmail: req.dbUser!.email,
      originalRecord: existing as unknown as Record<string, unknown>,
    });

    res.json({ archived: true, asset: archived });
  } catch {
    res.status(500).json({ error: 'Failed to archive signing asset.' });
  }
});

adminCloudRouter.get('/signing-assets/:id/preview', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [asset] = await db
      .select()
      .from(companySigningAssets)
      .where(eq(companySigningAssets.id, id))
      .limit(1);
    if (!asset) return res.status(404).json({ error: 'Signing asset not found.' });

    const candidateBuckets = Array.from(new Set([asset.storageBucket || 'company-assets', 'company-assets', 'signatures-stamps']));
    let buf: Buffer | null = null;
    for (const bkt of candidateBuckets) {
      buf = await downloadFromSupabaseStorage(bkt, asset.storagePath);
      if (buf) break;
    }
    if (!buf) {
      return res.status(404).json({ error: 'Asset image missing in Supabase Storage.' });
    }
    res.setHeader('Content-Type', asset.mimeType || 'image/png');
    res.setHeader('Cache-Control', 'no-store, private');
    return res.send(buf);
  } catch {
    res.status(500).json({ error: 'Failed to load signing asset preview.' });
  }
});

// ============================================================================
// 3. RAZORPAY PAYMENT LINKS (Create, List, Cancel, Sync)
// ============================================================================
adminCloudRouter.get('/payment-links', async (req, res) => {
  try {
    const entityType = String(req.query.entityType || '').trim();
    const entityId = req.query.entityId ? Number(req.query.entityId) : null;
    const customerId = String(req.query.customerId || '').trim();
    const status = String(req.query.status || '').trim();

    const rows = await db
      .select()
      .from(razorpayPaymentLinks)
      .orderBy(desc(razorpayPaymentLinks.createdAt));

    const filtered = rows.filter((r) => {
      if (entityType && r.entityType !== entityType) return false;
      if (entityId && r.entityId !== entityId) return false;
      if (customerId && r.customerId !== customerId) return false;
      if (status && status !== 'all' && r.status !== status) return false;
      return true;
    });

    res.json({ paymentLinks: filtered });
  } catch (error) {
    console.error('List payment links error:', error);
    res.status(500).json({ error: 'Failed to load Razorpay payment links.' });
  }
});

adminCloudRouter.post('/payment-links', async (req: AuthRequest, res) => {
  try {
    const b = req.body || {};
    const entityType = String(b.entityType || 'project_quotation').trim();
    const entityId = Number(b.entityId || 0);
    const amountInr = Math.round(Number(b.amountInr || 0));
    const paymentStage = String(b.paymentStage || 'advance').trim();
    const description = String(b.description || '').trim();

    if (!entityId || amountInr < 1) {
      return res.status(400).json({ error: 'Valid entityId and amountInr (>= ₹1) are required.' });
    }

    let userId: number | null = b.userId ? Number(b.userId) : null;
    let customerId = String(b.customerId || '').trim();
    let customerName = String(b.customerName || '').trim();
    let customerEmail = String(b.customerEmail || '').trim();
    let customerPhone = String(b.customerPhone || '').trim();
    let projectId: number | null = b.projectId ? Number(b.projectId) : null;
    let projectCode = String(b.projectCode || '').trim();
    let resolvedRef = String(b.referenceId || '').trim();

    if (entityType === 'project_quotation') {
      const [quot] = await db.select().from(projectQuotations).where(eq(projectQuotations.id, entityId)).limit(1);
      if (!quot) return res.status(404).json({ error: 'Project quotation not found.' });
      const [enq] = await db.select().from(projectEnquiries).where(eq(projectEnquiries.id, quot.enquiryId)).limit(1);
      const [proj] = await db.select().from(projects).where(eq(projects.quotationId, quot.id)).limit(1);
      userId = userId ?? enq?.userId ?? proj?.userId ?? null;
      customerId = customerId || enq?.customerId || proj?.customerId || '';
      customerName = customerName || enq?.customerName || 'Customer';
      customerEmail = customerEmail || enq?.customerEmail || '';
      customerPhone = customerPhone || enq?.customerPhone || '';
      projectId = projectId ?? proj?.id ?? null;
      projectCode = projectCode || proj?.projectCode || enq?.enquiryNumber || '';
      resolvedRef = resolvedRef || `${quot.quotationNumber || enq?.enquiryNumber || `QT-${quot.id}`}-${paymentStage}`;
    } else if (entityType === 'store_order') {
      const [ord] = await db.select().from(storeOrders).where(eq(storeOrders.id, entityId)).limit(1);
      if (!ord) return res.status(404).json({ error: 'Store order not found.' });
      userId = userId ?? ord.userId ?? null;
      customerId = customerId || ord.customerId || '';
      const addr = (ord.shippingAddress as Record<string, any>) || {};
      customerName = customerName || addr.fullName || 'Customer';
      customerPhone = customerPhone || addr.mobile || '';
      resolvedRef = resolvedRef || ord.orderNumber;
    } else if (entityType === 'printing_order') {
      const [po] = await db.select().from(printingOrders).where(eq(printingOrders.id, entityId)).limit(1);
      if (!po) return res.status(404).json({ error: '3D printing order not found.' });
      userId = userId ?? po.userId ?? null;
      customerId = customerId || po.customerId || '';
      customerName = customerName || po.customerName || 'Customer';
      customerEmail = customerEmail || po.email || '';
      customerPhone = customerPhone || po.phone || '';
      resolvedRef = resolvedRef || po.orderNumber;
    } else if (entityType === 'pcb_enquiry') {
      const [pcb] = await db.select().from(pcbEnquiries).where(eq(pcbEnquiries.id, entityId)).limit(1);
      if (!pcb) return res.status(404).json({ error: 'PCB enquiry not found.' });
      userId = userId ?? pcb.userId ?? null;
      customerId = customerId || pcb.customerId || '';
      customerName = customerName || pcb.customerName || 'Customer';
      customerEmail = customerEmail || pcb.email || '';
      customerPhone = customerPhone || pcb.mobile || '';
      resolvedRef = resolvedRef || pcb.enquiryNumber;
    } else if (entityType === 'b2b_enquiry') {
      const [b2b] = await db.select().from(b2bEnquiries).where(eq(b2bEnquiries.id, entityId)).limit(1);
      if (!b2b) return res.status(404).json({ error: 'B2B enquiry not found.' });
      userId = userId ?? b2b.userId ?? null;
      customerId = customerId || b2b.customerId || '';
      customerName = customerName || b2b.contactPerson || b2b.companyName || 'Customer';
      customerEmail = customerEmail || b2b.email || '';
      customerPhone = customerPhone || b2b.mobile || '';
      resolvedRef = resolvedRef || b2b.enquiryNumber;
    } else if (entityType === 'project_installment') {
      const [inst] = await db
        .select()
        .from(paymentInstallments)
        .where(eq(paymentInstallments.id, entityId))
        .limit(1);
      if (!inst) return res.status(404).json({ error: 'Project installment not found.' });
      const [proj] = await db.select().from(projects).where(eq(projects.id, inst.projectId)).limit(1);
      if (!proj) return res.status(404).json({ error: 'Parent project not found.' });
      const [enq] = await db.select().from(projectEnquiries).where(eq(projectEnquiries.id, proj.enquiryId)).limit(1);
      userId = userId ?? proj.userId ?? enq?.userId ?? null;
      customerId = customerId || proj.customerId || enq?.customerId || '';
      customerName = customerName || enq?.customerName || 'Customer';
      customerEmail = customerEmail || enq?.customerEmail || '';
      customerPhone = customerPhone || enq?.customerPhone || '';
      projectId = proj.id;
      projectCode = proj.projectCode;
      resolvedRef = resolvedRef || `${proj.projectCode}-INST${inst.installmentNumber}`;
    }

    if (userId && (!customerEmail || !customerId || !customerName)) {
      const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (u) {
        customerEmail = customerEmail || u.email;
        customerId = customerId || u.uid;
        customerName = customerName || u.fullName;
        customerPhone = customerPhone || u.mobile;
      }
    }

    if (!customerEmail) {
      return res.status(400).json({ error: 'Customer email is required to create a Razorpay payment link.' });
    }

    const refCode = resolvedRef || generateCode('NTF-PL');
    const appBase = process.env.APP_URL || '';
    const linkResp = await createRazorpayPaymentLink({
      amountInr,
      referenceId: refCode,
      description: description || `NexusTekFusion ${entityType.replace('_', ' ')} (${paymentStage})`,
      customerName: customerName || 'Customer',
      customerEmail,
      customerPhone,
      callbackUrl: appBase ? `${appBase.replace(/\/+$/, '')}/my-account?payment_link=returned` : undefined,
      notes: {
        entityType,
        entityId: String(entityId),
        paymentStage,
        customerId,
        projectId: projectId ? String(projectId) : '',
        projectCode,
      },
    });

    const [created] = await db
      .insert(razorpayPaymentLinks)
      .values({
        paymentLinkId: linkResp.paymentLinkId,
        shortUrl: linkResp.shortUrl,
        referenceId: refCode,
        entityType,
        entityId,
        projectId,
        projectCode,
        customerId,
        userId,
        customerName: customerName || 'Customer',
        customerEmail,
        customerPhone,
        amountInr,
        amountPaise: linkResp.amountPaise,
        paymentStage,
        description: description || `NexusTekFusion ${paymentStage} payment`,
        status: linkResp.status || 'created',
        createdBy: req.dbUser!.email,
        metadata: { mode: linkResp.mode },
      })
      .returning();

    const userUid = await resolveOwnerUid(userId, customerId);
    await syncRazorpayPaymentLinkToSupabase({
      sourceId: created.id,
      paymentLinkId: created.paymentLinkId,
      shortUrl: created.shortUrl,
      referenceId: created.referenceId,
      entityType: created.entityType,
      entityId: created.entityId,
      projectCode: created.projectCode,
      customerId: created.customerId,
      userUid,
      customerName: created.customerName,
      customerEmail: created.customerEmail,
      customerPhone: created.customerPhone,
      amountInr: created.amountInr,
      amountPaise: created.amountPaise,
      paymentStage: created.paymentStage,
      description: created.description,
      status: created.status,
      createdBy: created.createdBy,
    });

    if (userId) {
      await createNotification({
        userId,
        title: `Payment Link Generated — ₹${amountInr.toLocaleString('en-IN')}`,
        message: `Use your secure Razorpay link (${created.shortUrl}) for ${created.description}.`,
        link: '/my-account',
      }).catch(() => {});
    }

    dispatchLifecycleEmail({
      userId,
      projectId,
      recipientEmail: customerEmail,
      eventType: 'payment_link_created',
      vars: {
        customerName: customerName || 'Customer',
        amountInr,
        paymentUrl: created.shortUrl,
        referenceId: refCode,
        description: created.description,
      },
    }).catch(() => {});

    await logAudit({
      actorUid: req.dbUser!.uid,
      actorEmail: req.dbUser!.email,
      action: 'CREATE_RAZORPAY_PAYMENT_LINK',
      entityType: 'razorpay_payment_link',
      entityId: created.paymentLinkId,
      details: { entityType, entityId, amountInr, shortUrl: created.shortUrl },
    });

    res.status(201).json({ paymentLink: created });
  } catch (error: any) {
    console.error('Create Razorpay payment link error:', error);
    res.status(400).json({ error: error?.message || 'Failed to generate Razorpay payment link.' });
  }
});

adminCloudRouter.post('/payment-links/:id/cancel', async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const [existing] = await db
      .select()
      .from(razorpayPaymentLinks)
      .where(eq(razorpayPaymentLinks.id, id))
      .limit(1);
    if (!existing) return res.status(404).json({ error: 'Payment link not found.' });
    if (existing.status === 'paid') {
      return res.status(400).json({ error: 'Cannot cancel a payment link that has already been paid.' });
    }

    await cancelRazorpayPaymentLink(existing.paymentLinkId).catch(() => false);
    const [updated] = await db
      .update(razorpayPaymentLinks)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(eq(razorpayPaymentLinks.id, id))
      .returning();

    const userUid = await resolveOwnerUid(updated.userId, updated.customerId);
    await syncRazorpayPaymentLinkToSupabase({
      sourceId: updated.id,
      paymentLinkId: updated.paymentLinkId,
      shortUrl: updated.shortUrl,
      referenceId: updated.referenceId,
      entityType: updated.entityType,
      entityId: updated.entityId,
      projectCode: updated.projectCode,
      customerId: updated.customerId,
      userUid,
      customerName: updated.customerName,
      customerEmail: updated.customerEmail,
      customerPhone: updated.customerPhone,
      amountInr: updated.amountInr,
      amountPaise: updated.amountPaise,
      paymentStage: updated.paymentStage,
      description: updated.description,
      status: updated.status,
      razorpayPaymentId: updated.razorpayPaymentId,
      paymentDate: updated.paymentDate,
      createdBy: updated.createdBy,
    });

    await recordEntityStatusChange({
      entityType: 'razorpay_payment_link',
      entityId: existing.id,
      entityCode: existing.paymentLinkId,
      customerId: existing.customerId,
      userId: existing.userId,
      userUid,
      previousStatus: existing.status,
      newStatus: 'cancelled',
      actionType: 'status_change',
      reason: String(req.body?.reason || 'Cancelled by Admin').trim(),
      adminId: req.dbUser!.uid,
      adminEmail: req.dbUser!.email,
      originalRecord: existing as unknown as Record<string, unknown>,
    });

    res.json({ paymentLink: updated });
  } catch {
    res.status(500).json({ error: 'Failed to cancel Razorpay payment link.' });
  }
});

adminCloudRouter.post('/payment-links/:id/refresh', async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const [existing] = await db
      .select()
      .from(razorpayPaymentLinks)
      .where(eq(razorpayPaymentLinks.id, id))
      .limit(1);
    if (!existing) return res.status(404).json({ error: 'Payment link not found.' });

    const remote = (await fetchRazorpayPaymentLink(existing.paymentLinkId)) as Record<string, any> | null;
    if (!remote) {
      return res.json({ paymentLink: existing, syncedFromRazorpay: false });
    }

    const remoteStatus = String(remote.status || existing.status);
    const firstPayment = Array.isArray(remote.payments) && remote.payments.length > 0 ? remote.payments[0] : null;
    const rzpPaymentId = String(firstPayment?.payment_id || existing.razorpayPaymentId || '');
    const paidAt = remoteStatus === 'paid' ? existing.paymentDate || new Date() : existing.paymentDate;

    const [updated] = await db
      .update(razorpayPaymentLinks)
      .set({
        status: remoteStatus,
        razorpayPaymentId: rzpPaymentId,
        paymentDate: paidAt,
        updatedAt: new Date(),
      })
      .where(eq(razorpayPaymentLinks.id, id))
      .returning();

    if (remoteStatus === 'paid' && existing.status !== 'paid' && rzpPaymentId) {
      const paymentRef = generateCode('NTF-PAY');
      if (existing.entityType === 'project_quotation') {
        await reconcileProjectQuotationPayment({
          quotationId: existing.entityId,
          razorpayOrderId: existing.paymentLinkId,
          razorpayPaymentId: rzpPaymentId,
          razorpaySignature: 'verified_razorpay_api',
          paymentMode: existing.paymentStage === 'final' ? 'balance' : existing.paymentStage === 'full' ? 'full' : 'advance',
          paymentLinkId: existing.paymentLinkId,
          paymentUrl: existing.shortUrl,
        });
      } else if (existing.entityType === 'project_installment') {
        const [inst] = await db
          .select()
          .from(paymentInstallments)
          .where(eq(paymentInstallments.id, existing.entityId))
          .limit(1);
        if (inst) {
          await recordInstallmentPayment({
            projectId: inst.projectId,
            installmentNumber: inst.installmentNumber === 2 ? 2 : 1,
            amountInr: existing.amountInr,
            paymentMethod: 'razorpay_link',
            transactionRef: rzpPaymentId,
            razorpayOrderId: existing.paymentLinkId,
            razorpayPaymentId: rzpPaymentId,
            razorpaySignature: 'verified_razorpay_api',
            paymentLinkId: existing.paymentLinkId,
            recordedBy: req.dbUser!.email,
            notes: 'Synced via Razorpay Payment Link API.',
          });
          syncPaymentInstallmentToSupabase(inst).catch(() => {});
        }
      } else if (existing.entityType === 'store_order') {
        const [ord] = await db
          .update(storeOrders)
          .set({ paymentStatus: 'paid', razorpayPaymentId: rzpPaymentId, updatedAt: new Date() })
          .where(eq(storeOrders.id, existing.entityId))
          .returning();
        if (ord) {
          syncStoreOrderToSupabase({
            orderNumber: ord.orderNumber,
            userUid: '',
            customerEmail: existing.customerEmail,
            billingAddress: ord.billingAddress,
            shippingAddress: ord.shippingAddress,
            items: ord.items,
            subtotalInr: ord.subtotalInr,
            discountInr: ord.discountInr,
            shippingInr: ord.shippingInr,
            gstInr: ord.gstInr,
            totalInr: ord.totalInr,
            couponCode: ord.couponCode,
            paymentStatus: 'paid',
            orderStatus: ord.orderStatus,
          }).catch(() => {});
        }
      } else if (existing.entityType === 'printing_order') {
        const [po] = await db
          .update(printingOrders)
          .set({
            paymentStatus: 'paid',
            razorpayPaymentId: rzpPaymentId,
            paymentVerifiedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(printingOrders.id, existing.entityId))
          .returning();
        if (po) {
          syncPrintingOrderToSupabase({
            orderNumber: po.orderNumber,
            customerId: po.customerId,
            customerName: po.customerName,
            email: po.email,
            phone: po.phone,
            fileName: po.fileName,
            fileFormat: po.fileFormat,
            fileSizeBytes: po.fileSizeBytes,
            fileStoragePath: po.fileStoragePath,
            storageBucket: po.storageBucket,
            technology: po.technology,
            materialName: po.materialName,
            colorName: po.colorName,
            quotedPriceInr: po.quotedPriceInr,
            totalInr: po.totalInr,
            paymentStatus: 'paid',
            refundStatus: po.refundStatus,
            razorpayOrderId: po.razorpayOrderId,
            razorpayPaymentId: rzpPaymentId,
            orderStatus: po.orderStatus,
          }).catch(() => {});
        }
      }
      await syncPaymentToSupabase({
        paymentRef,
        userUid: existing.customerId || '',
        entityType: existing.entityType,
        entityRef: existing.projectCode || existing.referenceId || String(existing.entityId),
        razorpayOrderId: existing.paymentLinkId,
        razorpayPaymentId: rzpPaymentId,
        amountInr: existing.amountInr,
        amountPaise: existing.amountPaise,
        mode: 'live_razorpay',
        status: 'verified',
        verifiedAt: paidAt || new Date(),
      }).catch(() => {});
    }

    const userUid = await resolveOwnerUid(updated.userId, updated.customerId);
    await syncRazorpayPaymentLinkToSupabase({
      sourceId: updated.id,
      paymentLinkId: updated.paymentLinkId,
      shortUrl: updated.shortUrl,
      referenceId: updated.referenceId,
      entityType: updated.entityType,
      entityId: updated.entityId,
      projectCode: updated.projectCode,
      customerId: updated.customerId,
      userUid,
      customerName: updated.customerName,
      customerEmail: updated.customerEmail,
      customerPhone: updated.customerPhone,
      amountInr: updated.amountInr,
      amountPaise: updated.amountPaise,
      paymentStage: updated.paymentStage,
      description: updated.description,
      status: updated.status,
      razorpayPaymentId: updated.razorpayPaymentId,
      paymentDate: updated.paymentDate,
      createdBy: updated.createdBy,
    });

    res.json({ paymentLink: updated, syncedFromRazorpay: true });
  } catch {
    res.status(500).json({ error: 'Failed to refresh Razorpay payment link status.' });
  }
});

// ============================================================================
// 4. INVOICES PDF CLOUD GENERATION & DOWNLOAD (ADMIN)
// ============================================================================
adminCloudRouter.get('/invoices/:id/download', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [inv] = await db.select().from(invoices).where(eq(invoices.id, id)).limit(1);
    if (!inv) return res.status(404).json({ error: 'Invoice not found.' });

    let pdfBuffer: Buffer | null = null;
    if (inv.pdfStoragePath && isSupabaseStorageConfigured()) {
      pdfBuffer = await downloadFromSupabaseStorage(inv.storageBucket || 'invoices-pdf', inv.pdfStoragePath);
    }
    if (!pdfBuffer) {
      const generated = await generateAndStoreInvoicePdf(inv.id);
      if (generated) pdfBuffer = generated.buffer;
    }
    if (!pdfBuffer) {
      return res.status(500).json({ error: 'Unable to generate invoice PDF.' });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Cache-Control', 'no-store, private');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(inv.invoiceNumber)}.pdf"`);
    return res.send(pdfBuffer);
  } catch (error) {
    console.error('Admin download invoice PDF error:', error);
    res.status(500).json({ error: 'Failed to download invoice PDF.' });
  }
});

// ============================================================================
// 5. NON-DESTRUCTIVE RECORD ARCHIVE & ACTIVITY HISTORY LOGS
// ============================================================================
adminCloudRouter.get('/record-history', async (req, res) => {
  try {
    const entityType = String(req.query.entityType || '').trim();
    const customerId = String(req.query.customerId || '').trim();
    const actionType = String(req.query.actionType || '').trim();
    const search = String(req.query.search || '').trim().toLowerCase();

    const rows = await db
      .select()
      .from(recordStatusHistory)
      .orderBy(desc(recordStatusHistory.actionDate))
      .limit(300);

    const filtered = rows.filter((r) => {
      if (entityType && entityType !== 'all' && r.entityType !== entityType) return false;
      if (customerId && r.customerId !== customerId) return false;
      if (actionType && actionType !== 'all' && r.actionType !== actionType) return false;
      if (search) {
        const hay = `${r.entityType} ${r.entityCode} ${r.customerId} ${r.previousStatus} ${r.newStatus} ${r.reason} ${r.adminEmail}`.toLowerCase();
        if (!hay.includes(search)) return false;
      }
      return true;
    });

    res.json({ history: filtered });
  } catch (error) {
    console.error('List record status history error:', error);
    res.status(500).json({ error: 'Failed to load record status & archive history.' });
  }
});

adminCloudRouter.get('/activity-logs', async (req, res) => {
  try {
    const customerId = String(req.query.customerId || '').trim();
    const email = String(req.query.email || '').trim().toLowerCase();
    const search = String(req.query.search || '').trim().toLowerCase();

    const [customerLogs, adminAuditLogs] = await Promise.all([
      db.select().from(customerActivityLogs).orderBy(desc(customerActivityLogs.createdAt)).limit(250),
      db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(250),
    ]);

    const filteredCustomerLogs = customerLogs.filter((l) => {
      if (customerId && l.customerId !== customerId) return false;
      if (email && !l.email.toLowerCase().includes(email)) return false;
      if (search) {
        const hay = `${l.customerId} ${l.email} ${l.action} ${l.category} ${l.entityId} ${l.description}`.toLowerCase();
        if (!hay.includes(search)) return false;
      }
      return true;
    });

    const filteredAuditLogs = adminAuditLogs.filter((l) => {
      if (!search) return true;
      const hay = `${l.actorEmail} ${l.action} ${l.entityType} ${l.entityId} ${JSON.stringify(l.details)}`.toLowerCase();
      return hay.includes(search);
    });

    res.json({
      customerLogs: filteredCustomerLogs,
      auditLogs: filteredAuditLogs,
    });
  } catch (error) {
    console.error('List activity logs error:', error);
    res.status(500).json({ error: 'Failed to load cloud activity logs.' });
  }
});

// Soft-archive a Project (never physically delete)
adminCloudRouter.delete('/projects/:id', async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const reason = String(req.body?.reason || req.query?.reason || 'Archived by Admin').trim();
    const [existing] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
    if (!existing) return res.status(404).json({ error: 'Project not found.' });

    const [archived] = await db
      .update(projects)
      .set({
        isDeleted: true,
        archivedAt: new Date(),
        archivedReason: reason,
        archivedBy: req.dbUser!.email,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, id))
      .returning();

    const userUid = await resolveOwnerUid(existing.userId, existing.customerId);
    await recordEntityStatusChange({
      entityType: 'project',
      entityId: existing.id,
      entityCode: existing.projectCode,
      customerId: existing.customerId,
      userId: existing.userId,
      userUid,
      previousStatus: existing.status,
      newStatus: 'Archived',
      actionType: 'archive',
      reason,
      adminId: req.dbUser!.uid,
      adminEmail: req.dbUser!.email,
      originalRecord: existing as unknown as Record<string, unknown>,
    });

    res.json({ archived: true, project: archived });
  } catch (error) {
    console.error('Archive project error:', error);
    res.status(500).json({ error: 'Failed to archive project.' });
  }
});

// Soft-archive an Invoice (never physically delete)
adminCloudRouter.delete('/invoices/:id', async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const reason = String(req.body?.reason || req.query?.reason || 'Voided / Archived by Admin').trim();
    const [existing] = await db.select().from(invoices).where(eq(invoices.id, id)).limit(1);
    if (!existing) return res.status(404).json({ error: 'Invoice not found.' });

    const [archived] = await db
      .update(invoices)
      .set({
        isDeleted: true,
        archivedAt: new Date(),
        archivedReason: reason,
        archivedBy: req.dbUser!.email,
      })
      .where(eq(invoices.id, id))
      .returning();

    const userUid = await resolveOwnerUid(existing.userId, existing.customerId);
    await syncInvoiceToSupabase({
      invoiceNumber: archived.invoiceNumber,
      userUid,
      customerId: archived.customerId,
      entityType: archived.entityType,
      entityId: archived.entityId,
      docType: archived.docType,
      amountInr: archived.amountInr,
      gstInr: archived.gstInr,
      payload: (archived.payload || {}) as Record<string, unknown>,
      storageBucket: archived.storageBucket,
      pdfStoragePath: archived.pdfStoragePath,
      pdfGeneratedAt: archived.pdfGeneratedAt,
    }).catch(() => {});

    await recordEntityStatusChange({
      entityType: 'invoice',
      entityId: existing.id,
      entityCode: existing.invoiceNumber,
      customerId: existing.customerId,
      userId: existing.userId,
      userUid,
      previousStatus: existing.docType,
      newStatus: 'Archived',
      actionType: 'archive',
      reason,
      adminId: req.dbUser!.uid,
      adminEmail: req.dbUser!.email,
      originalRecord: existing as unknown as Record<string, unknown>,
    });

    res.json({ archived: true, invoice: archived });
  } catch (error) {
    console.error('Archive invoice error:', error);
    res.status(500).json({ error: 'Failed to archive invoice.' });
  }
});
