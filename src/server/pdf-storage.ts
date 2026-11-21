import { jsPDF } from 'jspdf';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { companySigningAssets, invoices, users } from '../db/schema.ts';
import {
  downloadFromSupabaseStorage,
  isSupabaseStorageConfigured,
  uploadInvoicePdfToSupabase,
  uploadQuotationPdfToSupabase,
} from '../lib/supabase-admin.ts';
import { syncInvoiceToSupabase } from './supabase-ecommerce.ts';

function formatInr(amount: number): string {
  return `Rs. ${Number(amount || 0).toLocaleString('en-IN')}`;
}

async function fetchActiveSigningMedia(): Promise<{
  signatureDataUrl?: string;
  signatoryName?: string;
  signatoryDesignation?: string;
  stampDataUrl?: string;
}> {
  if (!isSupabaseStorageConfigured()) return {};
  try {
    const assets = await db
      .select()
      .from(companySigningAssets)
      .where(and(eq(companySigningAssets.isActive, true), eq(companySigningAssets.isDeleted, false)))
      .orderBy(desc(companySigningAssets.updatedAt));

    const sig = assets.find((a) => a.assetType === 'signature');
    const stamp = assets.find((a) => a.assetType === 'stamp');
    const result: {
      signatureDataUrl?: string;
      signatoryName?: string;
      signatoryDesignation?: string;
      stampDataUrl?: string;
    } = {};

    if (sig) {
      const buf = await downloadFromSupabaseStorage(sig.storageBucket || 'signatures-stamps', sig.storagePath);
      if (buf && buf.length > 0) {
        const mime = sig.mimeType || 'image/png';
        result.signatureDataUrl = `data:${mime};base64,${buf.toString('base64')}`;
        result.signatoryName = sig.signatoryName;
        result.signatoryDesignation = sig.designation;
      }
    }
    if (stamp) {
      const buf = await downloadFromSupabaseStorage(stamp.storageBucket || 'signatures-stamps', stamp.storagePath);
      if (buf && buf.length > 0) {
        const mime = stamp.mimeType || 'image/png';
        result.stampDataUrl = `data:${mime};base64,${buf.toString('base64')}`;
      }
    }
    return result;
  } catch {
    return {};
  }
}

export async function renderInvoicePdfBuffer(invoiceRow: {
  invoiceNumber: string;
  docType: string;
  amountInr: number;
  gstInr: number;
  issuedAt?: Date | string;
  customerId?: string;
  payload: Record<string, any>;
}): Promise<Buffer> {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const payload = invoiceRow.payload || {};
  const sigMedia = await fetchActiveSigningMedia();

  // Header band
  doc.setFillColor(10, 22, 46);
  doc.rect(0, 0, 595, 96, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.text('NEXUSTEKFUSION PRIVATE LIMITED', 40, 40);
  doc.setFontSize(9.5);
  doc.setTextColor(186, 230, 253);
  doc.text('Engineering R&D, Robotics, Agricultural Drones & Custom 3D Manufacturing', 40, 58);
  doc.text('Amravati, Maharashtra, India | support@nexustekfusion.com', 40, 74);

  doc.setFontSize(13);
  doc.setTextColor(255, 255, 255);
  doc.text(String(invoiceRow.docType || 'TAX INVOICE').toUpperCase(), 555, 42, { align: 'right' });
  doc.setFontSize(10);
  doc.text(`#${invoiceRow.invoiceNumber}`, 555, 60, { align: 'right' });

  // Meta & Bill-To
  doc.setTextColor(30, 41, 59);
  doc.setFontSize(10);
  let y = 128;
  doc.setFont('helvetica', 'bold');
  doc.text('Billed To:', 40, y);
  doc.text('Document Details:', 350, y);
  doc.setFont('helvetica', 'normal');
  y += 16;

  const billing = payload.billingAddress || {};
  const customerName = String(payload.customerName || billing.fullName || 'Customer');
  const customerEmail = String(payload.customerEmail || billing.email || '');
  const customerPhone = String(payload.customerPhone || billing.mobile || '');
  const addressLine = [billing.line1, billing.city, billing.state, billing.pinCode].filter(Boolean).join(', ');

  doc.text(customerName, 40, y);
  if (invoiceRow.customerId) {
    doc.text(`Customer ID: ${invoiceRow.customerId}`, 350, y);
  }
  y += 14;
  if (customerEmail) {
    doc.text(customerEmail, 40, y);
  }
  const issuedStr = invoiceRow.issuedAt
    ? new Date(invoiceRow.issuedAt).toLocaleDateString('en-IN')
    : new Date().toLocaleDateString('en-IN');
  doc.text(`Issued Date: ${issuedStr}`, 350, y);
  y += 14;
  if (customerPhone) {
    doc.text(`Phone: ${customerPhone}`, 40, y);
  }
  if (payload.paymentId || payload.razorpayPaymentId) {
    doc.text(`Payment ID: ${payload.paymentId || payload.razorpayPaymentId}`, 350, y);
  }
  y += 14;
  if (addressLine) {
    const wrapped = doc.splitTextToSize(addressLine, 270);
    doc.text(wrapped, 40, y);
    y += wrapped.length * 13;
  }
  if (payload.orderNumber || payload.projectCode || payload.enquiryNumber) {
    doc.text(
      `Reference: ${payload.orderNumber || payload.projectCode || payload.enquiryNumber}`,
      350,
      Math.max(186, y - 10)
    );
  }

  // Table header
  y = Math.max(y + 24, 240);
  doc.setFillColor(241, 245, 249);
  doc.rect(40, y, 515, 24, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text('Description / Item', 50, y + 16);
  doc.text('Qty', 360, y + 16, { align: 'right' });
  doc.text('Unit Price', 450, y + 16, { align: 'right' });
  doc.text('Amount', 545, y + 16, { align: 'right' });
  y += 34;

  doc.setFont('helvetica', 'normal');
  const items: Array<Record<string, any>> = Array.isArray(payload.items) && payload.items.length > 0
    ? payload.items
    : [
        {
          name: payload.description || `${invoiceRow.docType} — ${payload.orderNumber || payload.projectCode || invoiceRow.invoiceNumber}`,
          qty: 1,
          unitPriceInr: Math.max(0, Number(invoiceRow.amountInr || 0) - Number(invoiceRow.gstInr || 0)),
          lineTotalInr: Math.max(0, Number(invoiceRow.amountInr || 0) - Number(invoiceRow.gstInr || 0)),
        },
      ];

  for (const item of items) {
    if (y > 680) {
      doc.addPage();
      y = 50;
    }
    const label = String(item.name || item.title || 'Engineering Service / Hardware');
    const qty = Number(item.qty || item.quantity || 1);
    const unitPrice = Number(item.unitPriceInr || item.unit_price || 0);
    const lineTotal = Number(item.lineTotalInr || unitPrice * qty || invoiceRow.amountInr);
    const lines = doc.splitTextToSize(label, 280);
    doc.text(lines, 50, y);
    doc.text(String(qty), 360, y, { align: 'right' });
    doc.text(formatInr(unitPrice), 450, y, { align: 'right' });
    doc.text(formatInr(lineTotal), 545, y, { align: 'right' });
    y += Math.max(20, lines.length * 13 + 6);
    doc.setDrawColor(226, 232, 240);
    doc.line(40, y - 4, 555, y - 4);
  }

  // Summary box
  y += 14;
  const subtotal = Math.max(0, Number(invoiceRow.amountInr || 0) - Number(invoiceRow.gstInr || 0));
  doc.setFontSize(10);
  doc.text('Taxable Subtotal:', 360, y);
  doc.text(formatInr(subtotal), 545, y, { align: 'right' });
  y += 16;
  doc.text('GST / Taxes:', 360, y);
  doc.text(formatInr(Number(invoiceRow.gstInr || 0)), 545, y, { align: 'right' });
  y += 18;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Grand Total:', 360, y);
  doc.text(formatInr(Number(invoiceRow.amountInr || 0)), 545, y, { align: 'right' });

  // Signature & Stamp section
  const sigY = Math.max(y + 50, 620);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text('Authorized Signatory & Company Seal', 360, sigY);
  doc.setFont('helvetica', 'normal');

  if (sigMedia.stampDataUrl) {
    try {
      const fmt = sigMedia.stampDataUrl.includes('jpeg') || sigMedia.stampDataUrl.includes('jpg') ? 'JPEG' : 'PNG';
      doc.addImage(sigMedia.stampDataUrl, fmt, 360, sigY + 8, 70, 70);
    } catch {
      // Ignore image decode failure in PDF fallback
    }
  }
  if (sigMedia.signatureDataUrl) {
    try {
      const fmt = sigMedia.signatureDataUrl.includes('jpeg') || sigMedia.signatureDataUrl.includes('jpg') ? 'JPEG' : 'PNG';
      doc.addImage(sigMedia.signatureDataUrl, fmt, 445, sigY + 18, 95, 42);
    } catch {
      // Ignore image decode failure in PDF fallback
    }
  }

  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text(sigMedia.signatoryName || 'NexusTekFusion Accounts & Engineering', 360, sigY + 92);
  doc.text(sigMedia.signatoryDesignation || 'Digitally Issued Cloud Document', 360, sigY + 104);
  doc.text('This is an electronically generated document stored securely in NexusTekFusion Cloud.', 40, 800);

  const ab = doc.output('arraybuffer');
  return Buffer.from(ab);
}

export async function generateAndStoreInvoicePdf(invoiceId: number): Promise<{
  bucket: string;
  storagePath: string;
  buffer: Buffer;
} | null> {
  const [inv] = await db.select().from(invoices).where(eq(invoices.id, invoiceId));
  if (!inv) return null;

  let ownerUid = inv.customerId || '';
  if (!ownerUid && inv.userId) {
    const [u] = await db.select().from(users).where(eq(users.id, inv.userId));
    ownerUid = u?.authUserId || u?.uid || `u_${inv.userId}`;
  }

  const buffer = await renderInvoicePdfBuffer({
    invoiceNumber: inv.invoiceNumber,
    docType: inv.docType,
    amountInr: inv.amountInr,
    gstInr: inv.gstInr,
    issuedAt: inv.issuedAt,
    customerId: inv.customerId,
    payload: (inv.payload || {}) as Record<string, any>,
  });

  if (!isSupabaseStorageConfigured()) {
    return { bucket: 'invoices-pdf', storagePath: '', buffer };
  }

  const uploaded = await uploadInvoicePdfToSupabase({
    buffer,
    fileName: `${inv.invoiceNumber}.pdf`,
    ownerUid: ownerUid || 'shared',
  });

  const now = new Date();
  await db
    .update(invoices)
    .set({
      storageBucket: uploaded.bucket,
      pdfStoragePath: uploaded.storagePath,
      pdfGeneratedAt: now,
    })
    .where(eq(invoices.id, inv.id));

  await syncInvoiceToSupabase({
    invoiceNumber: inv.invoiceNumber,
    userUid: ownerUid,
    customerId: inv.customerId,
    entityType: inv.entityType,
    entityId: inv.entityId,
    docType: inv.docType,
    amountInr: inv.amountInr,
    gstInr: inv.gstInr,
    payload: (inv.payload || {}) as Record<string, unknown>,
    storageBucket: uploaded.bucket,
    pdfStoragePath: uploaded.storagePath,
    pdfGeneratedAt: now,
  });

  return { bucket: uploaded.bucket, storagePath: uploaded.storagePath, buffer };
}

export async function generateAndStoreQuotationPdf(params: {
  quotationNumber: string;
  enquiryNumber: string;
  customerName: string;
  customerEmail: string;
  projectTitle: string;
  items: Array<{ name: string; description?: string; qty: number; unitPriceInr: number }>;
  totalAmountInr: number;
  gstInr: number;
  advanceAmountInr: number;
  balanceAmountInr: number;
  technicalScope?: string;
  ownerUid?: string;
}): Promise<{ bucket: string; storagePath: string; buffer: Buffer }> {
  const buffer = await renderInvoicePdfBuffer({
    invoiceNumber: params.quotationNumber,
    docType: 'ENGINEERING QUOTATION',
    amountInr: params.totalAmountInr,
    gstInr: params.gstInr,
    issuedAt: new Date(),
    customerId: params.ownerUid,
    payload: {
      customerName: params.customerName,
      customerEmail: params.customerEmail,
      enquiryNumber: params.enquiryNumber,
      description: `${params.projectTitle} (${params.technicalScope || 'Custom Engineering'})`,
      items: params.items.map((it) => ({
        name: it.description ? `${it.name} — ${it.description}` : it.name,
        qty: it.qty,
        unitPriceInr: it.unitPriceInr,
        lineTotalInr: it.qty * it.unitPriceInr,
      })),
    },
  });

  if (!isSupabaseStorageConfigured()) {
    return { bucket: 'quotations', storagePath: '', buffer };
  }

  const uploaded = await uploadQuotationPdfToSupabase({
    buffer,
    fileName: `${params.quotationNumber}.pdf`,
    ownerUid: params.ownerUid || 'shared',
  });
  return { bucket: uploaded.bucket, storagePath: uploaded.storagePath, buffer };
}

export interface ProjectAgreementDocumentModel {
  agreementNumber: string;
  agreementDate: string;
  status: 'Draft' | 'Generated' | 'Awaiting Acceptance' | 'Accepted' | string;
  companyName: string;
  companyLogoUrl: string;
  companyAddress: string;
  companyContactEmail: string;
  companyContactPhone: string;
  companyGstin?: string;
  companyCin?: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  customerOrganization?: string;
  customerAddress?: string;
  projectCode: string;
  enquiryNumber?: string;
  projectTitle: string;
  projectDescription: string;
  scopeAndDeliverables: string;
  totalProjectCostInr: number;
  firstInstallmentInr: number;
  secondInstallmentInr: number;
  advancePaymentTerms: string;
  secondPaymentTerms: string;
  projectTimeline: string;
  termsAndConditions: string;
  cancellationAndRefundPolicy: string;
  signatoryName: string;
  signatoryDesignation: string;
  stampAssetId?: number | null;
  signatureAssetId?: number | null;
  acceptedAt?: string | null;
  acceptedByName?: string;
  acceptedByEmail?: string;
  acceptanceIp?: string;
}

async function resolveCompanyAgreementMedia(params?: {
  stampAssetId?: number | null;
  signatureAssetId?: number | null;
  companyLogoUrl?: string;
}): Promise<{
  signatureDataUrl?: string;
  signatoryName?: string;
  signatoryDesignation?: string;
  stampDataUrl?: string;
  logoDataUrl?: string;
  stampAssetId?: number | null;
  signatureAssetId?: number | null;
}> {
  const result: {
    signatureDataUrl?: string;
    signatoryName?: string;
    signatoryDesignation?: string;
    stampDataUrl?: string;
    logoDataUrl?: string;
    stampAssetId?: number | null;
    signatureAssetId?: number | null;
  } = {};

  // Attempt loading bundled local logo cleanly if it starts with /assets/
  try {
    const logoUrl = String(params?.companyLogoUrl || '/assets/aistudio/image_1a5ac752.png').trim();
    if (logoUrl.startsWith('/assets/')) {
      const pathMod = await import('path');
      const fsMod = await import('fs');
      const fullPath = pathMod.default.join(process.cwd(), 'public', logoUrl.replace(/^\/+/, ''));
      if (fsMod.default.existsSync(fullPath)) {
        const buf = fsMod.default.readFileSync(fullPath);
        const ext = fullPath.toLowerCase().endsWith('.jpg') || fullPath.toLowerCase().endsWith('.jpeg') ? 'jpeg' : 'png';
        result.logoDataUrl = `data:image/${ext};base64,${buf.toString('base64')}`;
      }
    }
  } catch {
    // Non-blocking logo load
  }

  try {
    const assets = await db
      .select()
      .from(companySigningAssets)
      .where(and(eq(companySigningAssets.isDeleted, false)))
      .orderBy(desc(companySigningAssets.updatedAt));

    const sig =
      (params?.signatureAssetId ? assets.find((a) => a.id === params.signatureAssetId) : undefined) ||
      assets.find((a) => a.assetType === 'signature' && a.isActive) ||
      assets.find((a) => a.assetType === 'signature');
    const stamp =
      (params?.stampAssetId ? assets.find((a) => a.id === params.stampAssetId) : undefined) ||
      assets.find((a) => a.assetType === 'stamp' && a.isActive) ||
      assets.find((a) => a.assetType === 'stamp');
    const logoAsset = assets.find((a) => a.assetType === 'logo' && a.isActive);

    const downloadFromCandidateBuckets = async (asset: typeof sig) => {
      if (!asset || !isSupabaseStorageConfigured()) return null;
      const buckets = Array.from(new Set([asset.storageBucket, 'company-assets', 'signatures-stamps'].filter(Boolean)));
      for (const b of buckets) {
        const buf = await downloadFromSupabaseStorage(b, asset.storagePath);
        if (buf && buf.length > 0) return buf;
      }
      return null;
    };

    if (sig) {
      result.signatureAssetId = sig.id;
      result.signatoryName = sig.signatoryName;
      result.signatoryDesignation = sig.designation;
      const buf = await downloadFromCandidateBuckets(sig);
      if (buf) {
        result.signatureDataUrl = `data:${sig.mimeType || 'image/png'};base64,${buf.toString('base64')}`;
      }
    }
    if (stamp) {
      result.stampAssetId = stamp.id;
      const buf = await downloadFromCandidateBuckets(stamp);
      if (buf) {
        result.stampDataUrl = `data:${stamp.mimeType || 'image/png'};base64,${buf.toString('base64')}`;
      }
    }
    if (logoAsset) {
      const buf = await downloadFromCandidateBuckets(logoAsset);
      if (buf) {
        result.logoDataUrl = `data:${logoAsset.mimeType || 'image/png'};base64,${buf.toString('base64')}`;
      }
    }
  } catch {
    // Non-blocking signing media lookup
  }

  return result;
}

export async function renderProjectAgreementPdfBuffer(
  model: ProjectAgreementDocumentModel
): Promise<{
  buffer: Buffer;
  stampAssetId: number | null;
  signatureAssetId: number | null;
}> {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const media = await resolveCompanyAgreementMedia({
    stampAssetId: model.stampAssetId,
    signatureAssetId: model.signatureAssetId,
    companyLogoUrl: model.companyLogoUrl,
  });

  const pageWidth = 595;
  const pageHeight = 842;
  const marginX = 42;
  const contentWidth = pageWidth - marginX * 2;

  const ensureSpace = (needed: number, curY: number): number => {
    if (curY + needed <= pageHeight - 54) return curY;
    doc.addPage();
    return 48;
  };

  // Header Band
  doc.setFillColor(18, 59, 93); // #123B5D
  doc.rect(0, 0, pageWidth, 102, 'F');

  let titleStartX = marginX;
  if (media.logoDataUrl) {
    try {
      const fmt = media.logoDataUrl.includes('jpeg') || media.logoDataUrl.includes('jpg') ? 'JPEG' : 'PNG';
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(marginX, 20, 56, 56, 6, 6, 'F');
      doc.addImage(media.logoDataUrl, fmt, marginX + 4, 24, 48, 48);
      titleStartX = marginX + 68;
    } catch {
      titleStartX = marginX;
    }
  }

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(model.companyName || 'NEXUSTEKFUSION PRIVATE LIMITED', titleStartX, 38);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.8);
  doc.setTextColor(220, 234, 245);
  doc.text(model.companyAddress || 'Amravati, Maharashtra, India', titleStartX, 55);
  doc.text(
    `Email: ${model.companyContactEmail || 'support@nexustekfusion.com'} | Phone: ${model.companyContactPhone || '+91-9876543210'}`,
    titleStartX,
    70
  );
  if (model.companyGstin || model.companyCin) {
    doc.text(
      [model.companyGstin ? `GSTIN: ${model.companyGstin}` : '', model.companyCin ? `CIN: ${model.companyCin}` : '']
        .filter(Boolean)
        .join('  |  '),
      titleStartX,
      84
    );
  }

  // Title Banner
  let y = 124;
  doc.setFillColor(240, 248, 255);
  doc.setDrawColor(144, 202, 249);
  doc.roundedRect(marginX, y - 16, contentWidth, 46, 5, 5, 'FD');
  doc.setTextColor(18, 59, 93);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13.5);
  doc.text('PROJECT DEVELOPMENT SERVICE AGREEMENT', marginX + 12, y + 3);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(38, 55, 70);
  doc.text(
    `Agreement No: ${model.agreementNumber}   |   Date: ${model.agreementDate}   |   Status: ${model.status}`,
    marginX + 12,
    y + 19
  );
  y += 48;

  // Party & Project Overview Cards
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(18, 59, 93);
  doc.text('1. CLIENT / CUSTOMER INFORMATION', marginX, y);
  doc.text('2. PROJECT REFERENCE', marginX + 275, y);
  y += 14;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.2);
  doc.setTextColor(38, 55, 70);

  const clientLines = [
    `Name: ${model.customerName || 'Customer'}`,
    model.customerOrganization ? `Organization: ${model.customerOrganization}` : '',
    `Email: ${model.customerEmail || '—'}`,
    `Phone: ${model.customerPhone || '—'}`,
    model.customerAddress ? `Address: ${model.customerAddress}` : '',
  ].filter(Boolean);

  const refLines = [
    `Project Code: ${model.projectCode || '—'}`,
    model.enquiryNumber ? `Enquiry Ref: ${model.enquiryNumber}` : '',
    `Project Title: ${model.projectTitle || 'Custom Engineering Project'}`,
    `Total Project Cost: ${formatInr(model.totalProjectCostInr)}`,
    `Agreement Status: ${model.status}`,
  ].filter(Boolean);

  const leftWrapped = doc.splitTextToSize(clientLines.join('\n'), 250);
  const rightWrapped = doc.splitTextToSize(refLines.join('\n'), 235);
  doc.text(leftWrapped, marginX, y);
  doc.text(rightWrapped, marginX + 275, y);
  y += Math.max(leftWrapped.length, rightWrapped.length) * 12.5 + 16;

  const drawSection = (heading: string, body: string) => {
    const cleanBody = String(body || 'As agreed between Client and Company.').trim();
    const lines = doc.splitTextToSize(cleanBody, contentWidth - 10);
    y = ensureSpace(28 + lines.length * 12.5, y);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(18, 59, 93);
    doc.text(heading, marginX, y);
    y += 13;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.2);
    doc.setTextColor(38, 55, 70);
    doc.text(lines, marginX + 4, y);
    y += lines.length * 12.5 + 14;
  };

  drawSection('3. PROJECT DESCRIPTION', model.projectDescription);
  drawSection('4. PROJECT SCOPE & DELIVERABLES', model.scopeAndDeliverables);

  // Payment Schedule Box (Two 50% Installments)
  y = ensureSpace(135, y);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(18, 59, 93);
  doc.text('5. COMMERCIAL VALUE & TWO-INSTALLMENT PAYMENT TERMS', marginX, y);
  y += 10;

  doc.setFillColor(240, 248, 255);
  doc.setDrawColor(144, 202, 249);
  doc.roundedRect(marginX, y, contentWidth, 88, 5, 5, 'FD');
  doc.setFontSize(9.3);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(18, 59, 93);
  doc.text(`Total Agreed Project Cost: ${formatInr(model.totalProjectCostInr)} (INR)`, marginX + 12, y + 18);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(38, 55, 70);
  doc.text(`• First Installment (50% Advance): ${formatInr(model.firstInstallmentInr)}`, marginX + 12, y + 36);
  doc.setFont('helvetica', 'normal');
  const advLines = doc.splitTextToSize(model.advancePaymentTerms, contentWidth - 28);
  doc.text(advLines.slice(0, 2), marginX + 22, y + 48);

  doc.setFont('helvetica', 'bold');
  doc.text(`• Second Installment (50% Milestone): ${formatInr(model.secondInstallmentInr)}`, marginX + 12, y + 66);
  doc.setFont('helvetica', 'normal');
  const secLines = doc.splitTextToSize(model.secondPaymentTerms, contentWidth - 28);
  doc.text(secLines.slice(0, 2), marginX + 22, y + 78);
  y += 106;

  drawSection('6. PROJECT TIMELINE', model.projectTimeline);
  drawSection('7. GENERAL TERMS & CONDITIONS', model.termsAndConditions);
  drawSection('8. CANCELLATION & REFUND POLICY', model.cancellationAndRefundPolicy);

  // Execution & Acceptance Block (Company Stamp + Signature on Left, Customer Acceptance on Right)
  y = ensureSpace(170, y);
  doc.setDrawColor(220, 234, 245);
  doc.line(marginX, y, pageWidth - marginX, y);
  y += 16;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(18, 59, 93);
  doc.text('FOR COMPANY (AUTHORIZED EXECUTION)', marginX, y);
  doc.text('FOR CLIENT / CUSTOMER ACCEPTANCE', marginX + 275, y);
  y += 12;

  // Company Stamp & Signature placement
  doc.setDrawColor(144, 202, 249);
  doc.setFillColor(250, 253, 255);
  doc.roundedRect(marginX, y, 248, 118, 4, 4, 'FD');

  if (media.stampDataUrl) {
    try {
      const fmt = media.stampDataUrl.includes('jpeg') || media.stampDataUrl.includes('jpg') ? 'JPEG' : 'PNG';
      doc.addImage(media.stampDataUrl, fmt, marginX + 12, y + 10, 68, 68);
    } catch {
      // Ignore image decode failure in fallback
    }
  }
  if (media.signatureDataUrl) {
    try {
      const fmt = media.signatureDataUrl.includes('jpeg') || media.signatureDataUrl.includes('jpg') ? 'JPEG' : 'PNG';
      doc.addImage(media.signatureDataUrl, fmt, marginX + 94, y + 16, 138, 50);
    } catch {
      // Ignore image decode failure in fallback
    }
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.8);
  doc.setTextColor(18, 59, 93);
  doc.text(model.signatoryName || media.signatoryName || 'Authorized Signatory', marginX + 12, y + 92);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(38, 55, 70);
  doc.text(model.signatoryDesignation || media.signatoryDesignation || model.companyName, marginX + 12, y + 104);

  // Customer Acceptance Box (NEVER pre-marked as accepted)
  doc.roundedRect(marginX + 263, y, 248, 118, 4, 4, 'FD');
  const isAccepted = model.status === 'Accepted' && Boolean(model.acceptedAt);
  if (isAccepted) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(21, 128, 61);
    doc.text('STATUS: ACCEPTED BY CUSTOMER', marginX + 275, y + 20);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.8);
    doc.setTextColor(38, 55, 70);
    doc.text(`Accepted By: ${model.acceptedByName || model.customerName}`, marginX + 275, y + 40);
    doc.text(`Email: ${model.acceptedByEmail || model.customerEmail}`, marginX + 275, y + 55);
    doc.text(`Date & Time: ${new Date(model.acceptedAt!).toLocaleString('en-IN')}`, marginX + 275, y + 70);
    if (model.acceptanceIp) {
      doc.text(`IP Address: ${model.acceptanceIp}`, marginX + 275, y + 85);
    }
    doc.text('Digital Consent Recorded in Cloud Ledger', marginX + 275, y + 102);
  } else {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(180, 83, 9);
    doc.text(`STATUS: ${String(model.status || 'AWAITING ACCEPTANCE').toUpperCase()}`, marginX + 275, y + 20);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(38, 55, 70);
    const pendingNote = doc.splitTextToSize(
      'Company stamp & authorized signature are affixed for execution readiness. Agreement is not valid or accepted until the customer completes digital acceptance in their NexusTekFusion portal.',
      224
    );
    doc.text(pendingNote, marginX + 275, y + 42);
    doc.text(`Designated Client: ${model.customerName || 'Customer'}`, marginX + 275, y + 104);
  }

  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `Generated by ${model.companyName} Cloud Agreement System | Ref: ${model.agreementNumber}`,
    marginX,
    pageHeight - 24
  );

  const ab = doc.output('arraybuffer');
  return {
    buffer: Buffer.from(ab),
    stampAssetId: media.stampAssetId ?? null,
    signatureAssetId: media.signatureAssetId ?? null,
  };
}

