import { jsPDF } from 'jspdf';
import { PDFDocument } from 'pdf-lib';
import { desc, eq } from 'drizzle-orm';
import { db } from '../db/index.ts';
import {
  agreementSettings,
  documentSettings,
  type DocumentPlacementPosition,
  type DocumentPlacementSize,
  invoices,
  paymentInstallments,
  paymentReceipts,
  paymentTransactions,
  projectEnquiries,
  projects,
  users,
} from '../db/schema.ts';
import {
  downloadFromSupabaseStorage,
  isSupabaseStorageConfigured,
  uploadInvoicePdfToSupabase,
  uploadPaymentReceiptPdfToSupabase,
  uploadProjectInvoicePdfToSupabase,
  uploadQuotationPdfToSupabase,
} from '../lib/supabase-admin.ts';
import { syncInvoiceToSupabase } from './supabase-ecommerce.ts';
import { syncDocumentSettingsToSupabase, syncPaymentReceiptToSupabase } from './supabase-projects.ts';

const A4_WIDTH_PT = 595.28;
const A4_HEIGHT_PT = 841.89;
const MM_TO_PT = 72 / 25.4;

export const DEFAULT_STAMP_POSITION: DocumentPlacementPosition = {
  preset: 'bottom-left',
  xMm: 22,
  yMm: 238,
};
export const DEFAULT_STAMP_SIZE: DocumentPlacementSize = {
  widthMm: 30,
  heightMm: 30,
};
export const DEFAULT_SIGNATURE_POSITION: DocumentPlacementPosition = {
  preset: 'bottom-right',
  xMm: 140,
  yMm: 244,
};
export const DEFAULT_SIGNATURE_SIZE: DocumentPlacementSize = {
  widthMm: 48,
  heightMm: 20,
};

function formatInr(amount: number): string {
  return `Rs. ${Number(amount || 0).toLocaleString('en-IN')}`;
}

export async function getOrCreateDocumentSettings() {
  const existing = await db.select().from(documentSettings).orderBy(documentSettings.id).limit(1);
  if (existing.length > 0) return existing[0];
  const [created] = await db
    .insert(documentSettings)
    .values({
      storageBucket: 'company-assets',
      stampPosition: DEFAULT_STAMP_POSITION,
      stampSize: DEFAULT_STAMP_SIZE,
      signaturePosition: DEFAULT_SIGNATURE_POSITION,
      signatureSize: DEFAULT_SIGNATURE_SIZE,
    })
    .returning();
  return created;
}

export interface BrandingMediaFile {
  buffer: Buffer;
  mimeType: string;
}

export interface DocumentBrandingOverrides {
  letterhead?: BrandingMediaFile | null;
  stamp?: BrandingMediaFile | null;
  signature?: BrandingMediaFile | null;
  stampPosition?: DocumentPlacementPosition;
  stampSize?: DocumentPlacementSize;
  signaturePosition?: DocumentPlacementPosition;
  signatureSize?: DocumentPlacementSize;
  signatoryName?: string;
  signatoryDesignation?: string;
}

interface ResolvedBranding {
  letterhead: BrandingMediaFile | null;
  stamp: BrandingMediaFile | null;
  signature: BrandingMediaFile | null;
  stampPosition: DocumentPlacementPosition;
  stampSize: DocumentPlacementSize;
  signaturePosition: DocumentPlacementPosition;
  signatureSize: DocumentPlacementSize;
  signatoryName: string;
  signatoryDesignation: string;
}

async function resolveActiveBranding(overrides?: DocumentBrandingOverrides): Promise<ResolvedBranding> {
  const cfg = await getOrCreateDocumentSettings();
  const [agCfg] = await db.select().from(agreementSettings).limit(1);

  const stampPosition: DocumentPlacementPosition =
    overrides?.stampPosition || (cfg.stampPosition as DocumentPlacementPosition) || DEFAULT_STAMP_POSITION;
  const stampSize: DocumentPlacementSize =
    overrides?.stampSize || (cfg.stampSize as DocumentPlacementSize) || DEFAULT_STAMP_SIZE;
  const signaturePosition: DocumentPlacementPosition =
    overrides?.signaturePosition ||
    (cfg.signaturePosition as DocumentPlacementPosition) ||
    DEFAULT_SIGNATURE_POSITION;
  const signatureSize: DocumentPlacementSize =
    overrides?.signatureSize || (cfg.signatureSize as DocumentPlacementSize) || DEFAULT_SIGNATURE_SIZE;

  let letterhead: BrandingMediaFile | null =
    overrides?.letterhead !== undefined ? overrides.letterhead : null;
  let stamp: BrandingMediaFile | null = overrides?.stamp !== undefined ? overrides.stamp : null;
  let signature: BrandingMediaFile | null =
    overrides?.signature !== undefined ? overrides.signature : null;

  const bucket = cfg.storageBucket || 'company-assets';

  if (isSupabaseStorageConfigured()) {
    if (overrides?.letterhead === undefined && cfg.letterheadFilePath) {
      const buf = await downloadFromSupabaseStorage(bucket, cfg.letterheadFilePath);
      if (buf && buf.length > 0) {
        letterhead = { buffer: buf, mimeType: cfg.letterheadMimeType || 'application/pdf' };
      }
    }
    if (overrides?.stamp === undefined && cfg.stampFilePath) {
      const buf = await downloadFromSupabaseStorage(bucket, cfg.stampFilePath);
      if (buf && buf.length > 0) {
        stamp = { buffer: buf, mimeType: cfg.stampMimeType || 'image/png' };
      }
    }
    if (overrides?.signature === undefined && cfg.signatureFilePath) {
      const buf = await downloadFromSupabaseStorage(bucket, cfg.signatureFilePath);
      if (buf && buf.length > 0) {
        signature = { buffer: buf, mimeType: cfg.signatureMimeType || 'image/png' };
      }
    }
  }

  return {
    letterhead,
    stamp,
    signature,
    stampPosition,
    stampSize,
    signaturePosition,
    signatureSize,
    signatoryName: overrides?.signatoryName || agCfg?.signatoryName || 'Authorized Signatory',
    signatoryDesignation:
      overrides?.signatoryDesignation || agCfg?.signatoryDesignation || 'Director / Engineering Lead',
  };
}

function isPdfBuffer(buf: Buffer, mimeType?: string): boolean {
  if (mimeType && mimeType.toLowerCase().includes('pdf')) return true;
  return buf.length >= 4 && buf.subarray(0, 4).toString('latin1') === '%PDF';
}

function isPngBuffer(buf: Buffer, mimeType?: string): boolean {
  if (buf.length >= 4 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return true;
  }
  return Boolean(mimeType && mimeType.toLowerCase().includes('png'));
}

async function embedImageSafely(pdfDoc: PDFDocument, file: BrandingMediaFile) {
  if (isPngBuffer(file.buffer, file.mimeType)) {
    try {
      return await pdfDoc.embedPng(file.buffer);
    } catch {
      return await pdfDoc.embedJpg(file.buffer);
    }
  }
  try {
    return await pdfDoc.embedJpg(file.buffer);
  } catch {
    return await pdfDoc.embedPng(file.buffer);
  }
}

function resolvePlacementBoxPt(
  pos: DocumentPlacementPosition,
  size: DocumentPlacementSize
): { xPt: number; yFromTopPt: number; widthPt: number; heightPt: number } {
  const widthMm = Math.max(10, Math.min(140, Number(size?.widthMm || 35)));
  const heightMm = Math.max(8, Math.min(90, Number(size?.heightMm || 25)));
  const preset = pos?.preset || 'custom';

  let xMm = Number(pos?.xMm ?? 22);
  let yMm = Number(pos?.yMm ?? 238);

  if (preset === 'bottom-left') {
    xMm = 20;
    yMm = Number.isFinite(Number(pos?.yMm)) && Number(pos?.yMm) > 160 ? Number(pos.yMm) : 238;
  } else if (preset === 'bottom-center') {
    xMm = Math.max(10, (210 - widthMm) / 2);
    yMm = Number.isFinite(Number(pos?.yMm)) && Number(pos?.yMm) > 160 ? Number(pos.yMm) : 238;
  } else if (preset === 'bottom-right') {
    xMm = Math.max(15, 190 - widthMm);
    yMm = Number.isFinite(Number(pos?.yMm)) && Number(pos?.yMm) > 160 ? Number(pos.yMm) : 238;
  }

  xMm = Math.max(6, Math.min(210 - widthMm - 6, xMm));
  yMm = Math.max(20, Math.min(297 - heightMm - 8, yMm));

  return {
    xPt: xMm * MM_TO_PT,
    yFromTopPt: yMm * MM_TO_PT,
    widthPt: widthMm * MM_TO_PT,
    heightPt: heightMm * MM_TO_PT,
  };
}

export async function compositeOnA4WithBranding(params: {
  contentPdfBytes: Uint8Array | Buffer;
  branding: ResolvedBranding;
}): Promise<Buffer> {
  const outDoc = await PDFDocument.create();
  const contentDoc = await PDFDocument.load(params.contentPdfBytes);
  const embeddedPages = await outDoc.embedPages(contentDoc.getPages());

  let letterheadPdfPage: Awaited<ReturnType<PDFDocument['embedPage']>> | null = null;
  let letterheadImage: Awaited<ReturnType<PDFDocument['embedPng']>> | null = null;

  if (params.branding.letterhead?.buffer?.length) {
    try {
      if (isPdfBuffer(params.branding.letterhead.buffer, params.branding.letterhead.mimeType)) {
        const lhDoc = await PDFDocument.load(params.branding.letterhead.buffer);
        const lhPages = lhDoc.getPages();
        if (lhPages.length > 0) {
          letterheadPdfPage = await outDoc.embedPage(lhPages[0]);
        }
      } else {
        letterheadImage = await embedImageSafely(outDoc, params.branding.letterhead);
      }
    } catch {
      // Non-blocking fallback if uploaded letterhead fails to decode
    }
  }

  for (let i = 0; i < embeddedPages.length; i++) {
    const page = outDoc.addPage([A4_WIDTH_PT, A4_HEIGHT_PT]);

    if (letterheadPdfPage) {
      const dims = letterheadPdfPage.scale(1);
      const scale = Math.min(A4_WIDTH_PT / dims.width, A4_HEIGHT_PT / dims.height);
      const w = dims.width * scale;
      const h = dims.height * scale;
      page.drawPage(letterheadPdfPage, {
        x: (A4_WIDTH_PT - w) / 2,
        y: (A4_HEIGHT_PT - h) / 2,
        width: w,
        height: h,
      });
    } else if (letterheadImage) {
      const dims = letterheadImage.scale(1);
      const scale = Math.min(A4_WIDTH_PT / dims.width, A4_HEIGHT_PT / dims.height);
      const w = dims.width * scale;
      const h = dims.height * scale;
      page.drawImage(letterheadImage, {
        x: (A4_WIDTH_PT - w) / 2,
        y: (A4_HEIGHT_PT - h) / 2,
        width: w,
        height: h,
      });
    }

    const contentPage = embeddedPages[i];
    page.drawPage(contentPage, {
      x: 0,
      y: 0,
      width: A4_WIDTH_PT,
      height: A4_HEIGHT_PT,
    });
  }

  const targetPage = outDoc.getPages()[outDoc.getPageCount() - 1];
  if (targetPage) {
    if (params.branding.stamp?.buffer?.length) {
      try {
        const stampImg = await embedImageSafely(outDoc, params.branding.stamp);
        const box = resolvePlacementBoxPt(params.branding.stampPosition, params.branding.stampSize);
        const natural = stampImg.scale(1);
        const scale = Math.min(box.widthPt / natural.width, box.heightPt / natural.height);
        const drawW = natural.width * scale;
        const drawH = natural.height * scale;
        const x = box.xPt + (box.widthPt - drawW) / 2;
        const y = A4_HEIGHT_PT - box.yFromTopPt - box.heightPt + (box.heightPt - drawH) / 2;
        targetPage.drawImage(stampImg, { x, y, width: drawW, height: drawH });
      } catch {
        // Ignore malformed stamp image
      }
    }

    if (params.branding.signature?.buffer?.length) {
      try {
        const sigImg = await embedImageSafely(outDoc, params.branding.signature);
        const box = resolvePlacementBoxPt(
          params.branding.signaturePosition,
          params.branding.signatureSize
        );
        const natural = sigImg.scale(1);
        const scale = Math.min(box.widthPt / natural.width, box.heightPt / natural.height);
        const drawW = natural.width * scale;
        const drawH = natural.height * scale;
        const x = box.xPt + (box.widthPt - drawW) / 2;
        const y = A4_HEIGHT_PT - box.yFromTopPt - box.heightPt + (box.heightPt - drawH) / 2;
        targetPage.drawImage(sigImg, { x, y, width: drawW, height: drawH });
      } catch {
        // Ignore malformed signature image
      }
    }
  }

  const saved = await outDoc.save();
  return Buffer.from(saved);
}

export async function renderInvoicePdfBuffer(
  invoiceRow: {
    invoiceNumber: string;
    docType: string;
    amountInr: number;
    gstInr: number;
    issuedAt?: Date | string;
    customerId?: string;
    entityType?: string;
    entityId?: number;
    payload: Record<string, any>;
  },
  overrides?: DocumentBrandingOverrides
): Promise<Buffer> {
  if (invoiceRow.entityType === 'project_final_invoice' && invoiceRow.entityId) {
    return renderFinalProjectInvoicePdfBuffer(
      {
        projectId: invoiceRow.entityId,
        invoiceNumber: invoiceRow.invoiceNumber,
        issuedAt: invoiceRow.issuedAt,
      },
      overrides
    );
  }

  const branding = await resolveActiveBranding(overrides);
  const hasLetterhead = Boolean(branding.letterhead?.buffer?.length);
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const payload = invoiceRow.payload || {};

  let y = hasLetterhead ? 124 : 128;

  if (!hasLetterhead) {
    doc.setFillColor(18, 59, 93);
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
  } else {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(18, 59, 93);
    doc.text(String(invoiceRow.docType || 'TAX INVOICE').toUpperCase(), 40, y);
    doc.setFontSize(10);
    doc.text(`#${invoiceRow.invoiceNumber}`, 555, y, { align: 'right' });
    y += 18;
  }

  // Meta & Bill-To
  doc.setTextColor(30, 41, 59);
  doc.setFontSize(10);
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
  const items: Array<Record<string, any>> =
    Array.isArray(payload.items) && payload.items.length > 0
      ? payload.items
      : [
          {
            name:
              payload.description ||
              `${invoiceRow.docType} — ${payload.orderNumber || payload.projectCode || invoiceRow.invoiceNumber}`,
            qty: 1,
            unitPriceInr: Math.max(0, Number(invoiceRow.amountInr || 0) - Number(invoiceRow.gstInr || 0)),
            lineTotalInr: Math.max(0, Number(invoiceRow.amountInr || 0) - Number(invoiceRow.gstInr || 0)),
          },
        ];

  for (const item of items) {
    if (y > 650) {
      doc.addPage();
      y = hasLetterhead ? 118 : 50;
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
  if (y > 630) {
    doc.addPage();
    y = hasLetterhead ? 118 : 50;
  }
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

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text(
    `${branding.signatoryName} (${branding.signatoryDesignation}) | Electronically verified NexusTekFusion Cloud Document`,
    40,
    804
  );

  const rawBytes = Buffer.from(doc.output('arraybuffer'));
  return compositeOnA4WithBranding({ contentPdfBytes: rawBytes, branding });
}

export interface PaymentReceiptDocumentModel {
  receiptNumber: string;
  issuedAt: string;
  projectCode: string;
  projectTitle: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  customerOrganization?: string;
  installmentNumber: 1 | 2;
  installmentLabel: string;
  totalProjectCostInr: number;
  amountReceivedInr: number;
  totalPaidToDateInr: number;
  remainingBalanceInr: number;
  paymentMethod: string;
  transactionRef: string;
  razorpayPaymentId?: string;
}

export async function renderPaymentReceiptPdfBuffer(
  model: PaymentReceiptDocumentModel,
  overrides?: DocumentBrandingOverrides
): Promise<Buffer> {
  const branding = await resolveActiveBranding(overrides);
  const hasLetterhead = Boolean(branding.letterhead?.buffer?.length);
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });

  const marginX = 42;
  const contentW = A4_WIDTH_PT - marginX * 2;
  let y = hasLetterhead ? 124 : 42;

  if (!hasLetterhead) {
    doc.setFillColor(18, 59, 93);
    doc.rect(0, 0, A4_WIDTH_PT, 96, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(17);
    doc.text('NEXUSTEKFUSION PRIVATE LIMITED', marginX, 38);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.2);
    doc.setTextColor(220, 234, 245);
    doc.text('Amravati, Maharashtra, India | support@nexustekfusion.com', marginX, 56);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(255, 255, 255);
    doc.text('OFFICIAL PAYMENT RECEIPT', A4_WIDTH_PT - marginX, 42, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`#${model.receiptNumber}`, A4_WIDTH_PT - marginX, 60, { align: 'right' });
    y = 122;
  }

  // Title Card
  doc.setFillColor(240, 248, 255);
  doc.setDrawColor(144, 202, 249);
  doc.roundedRect(marginX, y, contentW, 54, 5, 5, 'FD');
  doc.setTextColor(18, 59, 93);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13.5);
  doc.text(`PAYMENT RECEIPT — ${model.installmentLabel.toUpperCase()}`, marginX + 12, y + 21);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.2);
  doc.setTextColor(38, 55, 70);
  doc.text(
    `Receipt No: ${model.receiptNumber}   |   Issued: ${new Date(model.issuedAt).toLocaleString('en-IN')}   |   Status: VERIFIED & PAID`,
    marginX + 12,
    y + 40
  );
  y += 74;

  // Customer & Project Details
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(18, 59, 93);
  doc.text('RECEIVED FROM (CUSTOMER)', marginX, y);
  doc.text('PROJECT & TRANSACTION', marginX + 265, y);
  y += 15;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.3);
  doc.setTextColor(38, 55, 70);
  const leftInfo = [
    `Name: ${model.customerName || 'Customer'}`,
    model.customerOrganization ? `Organization: ${model.customerOrganization}` : '',
    `Email: ${model.customerEmail || '—'}`,
    model.customerPhone ? `Phone: ${model.customerPhone}` : '',
  ].filter(Boolean);
  const rightInfo = [
    `Project Code: ${model.projectCode}`,
    `Project: ${model.projectTitle}`,
    `Payment Method: ${model.paymentMethod}`,
    `Transaction Ref: ${model.transactionRef}`,
    model.razorpayPaymentId && model.razorpayPaymentId !== model.transactionRef
      ? `Razorpay Payment ID: ${model.razorpayPaymentId}`
      : '',
  ].filter(Boolean);

  const lWrap = doc.splitTextToSize(leftInfo.join('\n'), 245);
  const rWrap = doc.splitTextToSize(rightInfo.join('\n'), 245);
  doc.text(lWrap, marginX, y);
  doc.text(rWrap, marginX + 265, y);
  y += Math.max(lWrap.length, rWrap.length) * 13 + 22;

  // Payment Breakdown Table
  doc.setFillColor(18, 59, 93);
  doc.rect(marginX, y, contentW, 26, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text('Installment & Financial Summary', marginX + 12, y + 17);
  doc.text('Amount (INR)', A4_WIDTH_PT - marginX - 12, y + 17, { align: 'right' });
  y += 26;

  const summaryRows: Array<[string, string, boolean?]> = [
    ['Total Agreed Project Cost', formatInr(model.totalProjectCostInr)],
    [
      `Amount Received Now (${model.installmentNumber === 1 ? 'First Installment – 50% Advance' : 'Second Installment – 50% Milestone'})`,
      formatInr(model.amountReceivedInr),
      true,
    ],
    ['Cumulative Paid to Date', formatInr(model.totalPaidToDateInr)],
    [
      model.installmentNumber === 1 && model.remainingBalanceInr > 0
        ? 'Remaining 50% Balance (Second Installment Due at Milestone)'
        : 'Remaining Project Balance',
      formatInr(model.remainingBalanceInr),
      model.remainingBalanceInr === 0,
    ],
  ];

  for (const [label, val, highlight] of summaryRows) {
    doc.setFillColor(highlight ? 240 : 255, highlight ? 248 : 255, 255);
    doc.setDrawColor(220, 234, 245);
    doc.rect(marginX, y, contentW, 28, 'FD');
    doc.setTextColor(highlight ? 18 : 38, highlight ? 59 : 55, highlight ? 93 : 70);
    doc.setFont('helvetica', highlight ? 'bold' : 'normal');
    doc.setFontSize(9.5);
    doc.text(label, marginX + 12, y + 18);
    doc.text(val, A4_WIDTH_PT - marginX - 12, y + 18, { align: 'right' });
    y += 28;
  }

  y += 20;
  doc.setFillColor(236, 253, 245);
  doc.setDrawColor(167, 243, 208);
  doc.roundedRect(marginX, y, contentW, 40, 4, 4, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(6, 95, 70);
  doc.text(
    model.remainingBalanceInr <= 0
      ? 'PAYMENT STATUS: FULLY PAID (₹0 BALANCE OUTSTANDING)'
      : `PAYMENT STATUS: 1ST INSTALLMENT CONFIRMED — REMAINING BALANCE ${formatInr(model.remainingBalanceInr)}`,
    marginX + 12,
    y + 24
  );

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.3);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `Issued by ${branding.signatoryName} (${branding.signatoryDesignation}) · Ref ${model.receiptNumber}`,
    marginX,
    A4_HEIGHT_PT - 28
  );

  const rawBytes = Buffer.from(doc.output('arraybuffer'));
  return compositeOnA4WithBranding({ contentPdfBytes: rawBytes, branding });
}

export async function generateAndStoreInstallmentReceiptPdf(params: {
  receiptId: number;
  overrides?: DocumentBrandingOverrides;
}): Promise<{ bucket: string; storagePath: string; buffer: Buffer } | null> {
  const [rcp] = await db
    .select()
    .from(paymentReceipts)
    .where(eq(paymentReceipts.id, params.receiptId))
    .limit(1);
  if (!rcp) return null;

  const payload = (rcp.payload || {}) as Record<string, any>;
  let projRow = rcp.projectId
    ? (await db.select().from(projects).where(eq(projects.id, rcp.projectId)).limit(1))[0] || null
    : null;
  if (!projRow && payload.projectCode) {
    projRow =
      (await db.select().from(projects).where(eq(projects.projectCode, String(payload.projectCode))).limit(1))[0] ||
      null;
  }

  const enqRow = projRow
    ? (await db.select().from(projectEnquiries).where(eq(projectEnquiries.id, projRow.enquiryId)).limit(1))[0] || null
    : null;
  const userRow = rcp.userId
    ? (await db.select().from(users).where(eq(users.id, rcp.userId)).limit(1))[0] || null
    : null;

  const totalCost = Number(payload.totalProjectCostInr ?? projRow?.totalAmountInr ?? rcp.amountInr * 2);
  const totalPaid = Number(payload.totalPaidToDateInr ?? projRow?.paidAmountInr ?? rcp.amountInr);
  const remaining = Math.max(0, Number(payload.remainingBalanceInr ?? projRow?.balanceAmountInr ?? totalCost - totalPaid));
  const instNum: 1 | 2 = Number(payload.installmentNumber) === 2 || rcp.paymentStage === 'final' ? 2 : 1;

  const buffer = await renderPaymentReceiptPdfBuffer(
    {
      receiptNumber: rcp.receiptNumber,
      issuedAt: rcp.issuedAt ? new Date(rcp.issuedAt).toISOString() : new Date().toISOString(),
      projectCode: projRow?.projectCode || String(payload.projectCode || rcp.paymentRef),
      projectTitle: projRow?.title || String(payload.projectTitle || 'Custom Engineering Project'),
      customerName: enqRow?.customerName || userRow?.fullName || String(payload.customerName || 'Customer'),
      customerEmail: enqRow?.customerEmail || userRow?.email || String(payload.customerEmail || ''),
      customerPhone: enqRow?.customerPhone || userRow?.mobile || '',
      customerOrganization: enqRow?.companyOrCollege || userRow?.companyOrCollege || '',
      installmentNumber: instNum,
      installmentLabel:
        instNum === 1 ? 'First Installment (50% Advance)' : 'Second Installment (50% Final Milestone)',
      totalProjectCostInr: totalCost,
      amountReceivedInr: rcp.amountInr,
      totalPaidToDateInr: totalPaid,
      remainingBalanceInr: remaining,
      paymentMethod: String(payload.paymentMethod || 'Razorpay / Verified'),
      transactionRef: rcp.paymentRef,
      razorpayPaymentId: rcp.razorpayPaymentId,
    },
    params.overrides
  );

  if (!isSupabaseStorageConfigured()) {
    return { bucket: 'payment-receipts', storagePath: '', buffer };
  }

  const ownerUid = projRow?.customerId || userRow?.authUserId || userRow?.uid || 'shared';
  const uploaded = await uploadPaymentReceiptPdfToSupabase({
    buffer,
    fileName: `${rcp.receiptNumber}.pdf`,
    ownerUid,
  });

  const now = new Date();
  await db
    .update(paymentReceipts)
    .set({
      storageBucket: uploaded.bucket,
      pdfStoragePath: uploaded.storagePath,
      pdfGeneratedAt: now,
    })
    .where(eq(paymentReceipts.id, rcp.id));

  await syncPaymentReceiptToSupabase({
    receiptNumber: rcp.receiptNumber,
    paymentRef: rcp.paymentRef,
    projectId: rcp.projectId ?? projRow?.id ?? null,
    installmentId: rcp.installmentId ?? null,
    entityType: rcp.entityType,
    entityId: rcp.entityId,
    paymentStage: rcp.paymentStage,
    amountInr: rcp.amountInr,
    amountPaise: rcp.amountPaise,
    razorpayPaymentId: rcp.razorpayPaymentId,
    storageBucket: uploaded.bucket,
    pdfStoragePath: uploaded.storagePath,
    pdfGeneratedAt: now,
    payload: (rcp.payload || {}) as Record<string, unknown>,
  });

  return { bucket: uploaded.bucket, storagePath: uploaded.storagePath, buffer };
}

export async function renderFinalProjectInvoicePdfBuffer(
  params: {
    projectId: number;
    invoiceNumber?: string;
    issuedAt?: Date | string;
  },
  overrides?: DocumentBrandingOverrides
): Promise<Buffer> {
  const branding = await resolveActiveBranding(overrides);
  const hasLetterhead = Boolean(branding.letterhead?.buffer?.length);

  const [proj] = await db.select().from(projects).where(eq(projects.id, params.projectId)).limit(1);
  if (!proj) throw new Error('Project not found for final invoice.');

  const [enq] = await db
    .select()
    .from(projectEnquiries)
    .where(eq(projectEnquiries.id, proj.enquiryId))
    .limit(1);
  const userRow = proj.userId
    ? (await db.select().from(users).where(eq(users.id, proj.userId)).limit(1))[0] || null
    : null;
  const instRows = await db
    .select()
    .from(paymentInstallments)
    .where(eq(paymentInstallments.projectId, proj.id))
    .orderBy(paymentInstallments.installmentNumber);
  const txRows = await db
    .select()
    .from(paymentTransactions)
    .where(eq(paymentTransactions.projectId, proj.id))
    .orderBy(paymentTransactions.createdAt);

  const inst1 = instRows.find((i) => i.installmentNumber === 1);
  const inst2 = instRows.find((i) => i.installmentNumber === 2);
  const tx1 = txRows.find((t) => t.installmentNumber === 1 && t.status === 'Paid');
  const tx2 = txRows.find((t) => t.installmentNumber === 2 && t.status === 'Paid');

  const totalCost = Math.max(Number(proj.totalAmountInr || proj.budgetInr || 0), 0);
  const inst1Paid = Number(inst1?.paidAmountInr || tx1?.amountInr || 0);
  const inst2Paid = Number(inst2?.paidAmountInr || tx2?.amountInr || 0);
  const totalReceived = Math.max(Number(proj.paidAmountInr || 0), inst1Paid + inst2Paid);
  const outstanding = Math.max(0, totalCost - totalReceived);

  const invNumber = params.invoiceNumber || `FINV-${proj.projectCode}`;
  const issuedDateStr = new Date(params.issuedAt || new Date()).toLocaleDateString('en-IN');

  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const marginX = 42;
  const contentW = A4_WIDTH_PT - marginX * 2;
  let y = hasLetterhead ? 124 : 42;

  if (!hasLetterhead) {
    doc.setFillColor(18, 59, 93);
    doc.rect(0, 0, A4_WIDTH_PT, 96, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(17);
    doc.text('NEXUSTEKFUSION PRIVATE LIMITED', marginX, 38);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.2);
    doc.setTextColor(220, 234, 245);
    doc.text('Amravati, Maharashtra, India | support@nexustekfusion.com', marginX, 56);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(255, 255, 255);
    doc.text('FINAL PROJECT INVOICE', A4_WIDTH_PT - marginX, 42, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`#${invNumber}`, A4_WIDTH_PT - marginX, 60, { align: 'right' });
    y = 122;
  }

  // Banner
  doc.setFillColor(240, 248, 255);
  doc.setDrawColor(144, 202, 249);
  doc.roundedRect(marginX, y, contentW, 52, 5, 5, 'FD');
  doc.setTextColor(18, 59, 93);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13.5);
  doc.text('CONSOLIDATED FINAL PROJECT INVOICE', marginX + 12, y + 20);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.2);
  doc.setTextColor(38, 55, 70);
  doc.text(
    `Invoice No: ${invNumber}   |   Date: ${issuedDateStr}   |   Project ID: ${proj.projectCode}`,
    marginX + 12,
    y + 38
  );
  y += 70;

  // Customer & Project Metadata
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(18, 59, 93);
  doc.text('BILLED TO (CUSTOMER DETAILS)', marginX, y);
  doc.text('PROJECT DETAILS', marginX + 265, y);
  y += 14;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.2);
  doc.setTextColor(38, 55, 70);
  const addrObj = (enq?.billingAddress || enq?.deliveryAddress || {}) as Record<string, any>;
  const addrStr = [addrObj.houseFlat, addrObj.streetArea, addrObj.city, addrObj.state, addrObj.pinCode]
    .filter(Boolean)
    .join(', ');

  const custLines = [
    `Name: ${enq?.customerName || userRow?.fullName || 'Customer'}`,
    enq?.companyOrCollege || userRow?.companyOrCollege
      ? `Org: ${enq?.companyOrCollege || userRow?.companyOrCollege}`
      : '',
    `Email: ${enq?.customerEmail || userRow?.email || '—'}`,
    `Phone: ${enq?.customerPhone || userRow?.mobile || '—'}`,
    addrStr ? `Address: ${addrStr}` : '',
  ].filter(Boolean);

  const projLines = [
    `Project ID: ${proj.projectCode}`,
    enq?.enquiryNumber ? `Enquiry Ref: ${enq.enquiryNumber}` : '',
    `Title: ${proj.title}`,
    `Project Status: ${proj.status}`,
    `Clearance: ${outstanding <= 0 ? 'Cleared / Paid in Full' : proj.paymentClearanceStatus}`,
  ].filter(Boolean);

  const cWrap = doc.splitTextToSize(custLines.join('\n'), 245);
  const pWrap = doc.splitTextToSize(projLines.join('\n'), 245);
  doc.text(cWrap, marginX, y);
  doc.text(pWrap, marginX + 265, y);
  y += Math.max(cWrap.length, pWrap.length) * 13 + 18;

  // Installment Ledger Table
  doc.setFillColor(18, 59, 93);
  doc.rect(marginX, y, contentW, 24, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('Installment / Milestone', marginX + 10, y + 16);
  doc.text('Payment Date', marginX + 205, y + 16);
  doc.text('Transaction ID', marginX + 305, y + 16);
  doc.text('Paid (INR)', A4_WIDTH_PT - marginX - 10, y + 16, { align: 'right' });
  y += 24;

  const rowsData: Array<{ label: string; date: string; txId: string; amount: string }> = [
    {
      label: '1st Installment (50% Advance)',
      date: inst1?.paidAt
        ? new Date(inst1.paidAt).toLocaleDateString('en-IN')
        : tx1?.paidAt
        ? new Date(tx1.paidAt).toLocaleDateString('en-IN')
        : inst1Paid > 0
        ? issuedDateStr
        : 'Pending',
      txId: tx1?.transactionRef || inst1?.razorpayPaymentId || '—',
      amount: formatInr(inst1Paid),
    },
    {
      label: '2nd Installment (50% Milestone)',
      date: inst2?.paidAt
        ? new Date(inst2.paidAt).toLocaleDateString('en-IN')
        : tx2?.paidAt
        ? new Date(tx2.paidAt).toLocaleDateString('en-IN')
        : inst2Paid > 0
        ? issuedDateStr
        : 'Pending',
      txId: tx2?.transactionRef || inst2?.razorpayPaymentId || '—',
      amount: formatInr(inst2Paid),
    },
  ];

  for (const r of rowsData) {
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(220, 234, 245);
    doc.rect(marginX, y, contentW, 26, 'FD');
    doc.setTextColor(38, 55, 70);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(r.label, marginX + 10, y + 17);
    doc.text(r.date, marginX + 205, y + 17);
    doc.text(String(r.txId).slice(0, 24), marginX + 305, y + 17);
    doc.text(r.amount, A4_WIDTH_PT - marginX - 10, y + 17, { align: 'right' });
    y += 26;
  }

  y += 14;
  // Totals Summary Box
  doc.setFillColor(240, 248, 255);
  doc.setDrawColor(144, 202, 249);
  doc.roundedRect(marginX + 215, y, contentW - 215, 92, 4, 4, 'FD');
  doc.setFontSize(9.5);
  doc.setTextColor(38, 55, 70);
  doc.setFont('helvetica', 'normal');
  doc.text('Total Project Cost:', marginX + 227, y + 20);
  doc.text(formatInr(totalCost), A4_WIDTH_PT - marginX - 12, y + 20, { align: 'right' });
  doc.text('1st Installment Paid:', marginX + 227, y + 36);
  doc.text(formatInr(inst1Paid), A4_WIDTH_PT - marginX - 12, y + 36, { align: 'right' });
  doc.text('2nd Installment Paid:', marginX + 227, y + 52);
  doc.text(formatInr(inst2Paid), A4_WIDTH_PT - marginX - 12, y + 52, { align: 'right' });
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(18, 59, 93);
  doc.text('Total Amount Received:', marginX + 227, y + 68);
  doc.text(formatInr(totalReceived), A4_WIDTH_PT - marginX - 12, y + 68, { align: 'right' });
  doc.text('Outstanding Balance:', marginX + 227, y + 84);
  doc.text(formatInr(outstanding), A4_WIDTH_PT - marginX - 12, y + 84, { align: 'right' });
  y += 108;

  // All payment transactions log if > 0
  const paidTxs = txRows.filter((t) => t.status === 'Paid');
  if (paidTxs.length > 0 && y < 600) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(18, 59, 93);
    doc.text('VERIFIED PAYMENT TRANSACTIONS', marginX, y);
    y += 12;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(38, 55, 70);
    for (const tx of paidTxs.slice(0, 6)) {
      const dt = new Date(tx.paidAt || tx.createdAt).toLocaleString('en-IN');
      doc.text(
        `• Inst #${tx.installmentNumber} | ${tx.transactionRef} | ${tx.paymentMethod} | ${dt} | ${formatInr(tx.amountInr)}`,
        marginX,
        y
      );
      y += 13;
    }
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.3);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `Issued by ${branding.signatoryName} (${branding.signatoryDesignation}) · Final Project Invoice ${invNumber}`,
    marginX,
    A4_HEIGHT_PT - 28
  );

  const rawBytes = Buffer.from(doc.output('arraybuffer'));
  return compositeOnA4WithBranding({ contentPdfBytes: rawBytes, branding });
}

export async function generateAndStoreFinalProjectInvoicePdf(params: {
  projectId: number;
  overrides?: DocumentBrandingOverrides;
}): Promise<{ invoice: typeof invoices.$inferSelect; bucket: string; storagePath: string; buffer: Buffer }> {
  const [proj] = await db.select().from(projects).where(eq(projects.id, params.projectId)).limit(1);
  if (!proj) throw new Error('Project not found.');
  const [enq] = await db
    .select()
    .from(projectEnquiries)
    .where(eq(projectEnquiries.id, proj.enquiryId))
    .limit(1);
  const userRow = proj.userId
    ? (await db.select().from(users).where(eq(users.id, proj.userId)).limit(1))[0] || null
    : null;

  const existingList = await db
    .select()
    .from(invoices)
    .where(eq(invoices.entityId, proj.id))
    .orderBy(desc(invoices.id));
  const existingFinal = existingList.find(
    (inv) => inv.entityType === 'project_final_invoice' && !inv.isDeleted
  );

  const invoiceNumber = existingFinal?.invoiceNumber || `FINV-${proj.projectCode}`;
  const buffer = await renderFinalProjectInvoicePdfBuffer(
    {
      projectId: proj.id,
      invoiceNumber,
      issuedAt: existingFinal?.issuedAt || new Date(),
    },
    params.overrides
  );

  const ownerUid = proj.customerId || userRow?.authUserId || userRow?.uid || 'shared';
  let bucket = 'project-invoices';
  let storagePath = existingFinal?.pdfStoragePath || '';
  if (isSupabaseStorageConfigured()) {
    const uploaded = await uploadProjectInvoicePdfToSupabase({
      buffer,
      fileName: `${invoiceNumber}.pdf`,
      ownerUid,
    });
    bucket = uploaded.bucket;
    storagePath = uploaded.storagePath;
  }

  const now = new Date();
  const payload = {
    projectId: proj.id,
    projectCode: proj.projectCode,
    enquiryNumber: enq?.enquiryNumber || '',
    projectTitle: proj.title,
    customerName: enq?.customerName || userRow?.fullName || 'Customer',
    customerEmail: enq?.customerEmail || userRow?.email || '',
    customerPhone: enq?.customerPhone || userRow?.mobile || '',
    totalProjectCostInr: proj.totalAmountInr,
    paidAmountInr: proj.paidAmountInr,
    outstandingBalanceInr: proj.balanceAmountInr,
  };

  let savedInv: typeof invoices.$inferSelect;
  if (existingFinal) {
    const [updated] = await db
      .update(invoices)
      .set({
        amountInr: proj.totalAmountInr || proj.paidAmountInr,
        payload,
        storageBucket: bucket,
        pdfStoragePath: storagePath,
        pdfGeneratedAt: now,
      })
      .where(eq(invoices.id, existingFinal.id))
      .returning();
    savedInv = updated;
  } else {
    const [inserted] = await db
      .insert(invoices)
      .values({
        invoiceNumber,
        userId: proj.userId,
        customerId: proj.customerId || '',
        entityType: 'project_final_invoice',
        entityId: proj.id,
        docType: 'Final Project Invoice',
        amountInr: proj.totalAmountInr || proj.paidAmountInr,
        gstInr: 0,
        payload,
        storageBucket: bucket,
        pdfStoragePath: storagePath,
        pdfGeneratedAt: now,
      })
      .returning();
    savedInv = inserted;
  }

  await syncInvoiceToSupabase({
    invoiceNumber: savedInv.invoiceNumber,
    userUid: ownerUid,
    customerId: savedInv.customerId,
    entityType: savedInv.entityType,
    entityId: savedInv.entityId,
    docType: savedInv.docType,
    amountInr: savedInv.amountInr,
    gstInr: savedInv.gstInr,
    payload: (savedInv.payload || {}) as Record<string, unknown>,
    storageBucket: savedInv.storageBucket,
    pdfStoragePath: savedInv.pdfStoragePath,
    pdfGeneratedAt: savedInv.pdfGeneratedAt,
  }).catch(() => {});

  return { invoice: savedInv, bucket, storagePath, buffer };
}

export async function generateAndStoreInvoicePdf(
  invoiceId: number,
  overrides?: DocumentBrandingOverrides
): Promise<{
  bucket: string;
  storagePath: string;
  buffer: Buffer;
} | null> {
  const [inv] = await db.select().from(invoices).where(eq(invoices.id, invoiceId));
  if (!inv) return null;

  if (inv.entityType === 'project_final_invoice' && inv.entityId > 0) {
    const res = await generateAndStoreFinalProjectInvoicePdf({
      projectId: inv.entityId,
      overrides,
    });
    return { bucket: res.bucket, storagePath: res.storagePath, buffer: res.buffer };
  }

  let ownerUid = inv.customerId || '';
  if (!ownerUid && inv.userId) {
    const [u] = await db.select().from(users).where(eq(users.id, inv.userId));
    ownerUid = u?.authUserId || u?.uid || `u_${inv.userId}`;
  }

  const buffer = await renderInvoicePdfBuffer(
    {
      invoiceNumber: inv.invoiceNumber,
      docType: inv.docType,
      amountInr: inv.amountInr,
      gstInr: inv.gstInr,
      issuedAt: inv.issuedAt,
      customerId: inv.customerId,
      entityType: inv.entityType,
      entityId: inv.entityId,
      payload: (inv.payload || {}) as Record<string, any>,
    },
    overrides
  );

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

export async function renderProjectAgreementPdfBuffer(
  model: ProjectAgreementDocumentModel,
  overrides?: DocumentBrandingOverrides
): Promise<{
  buffer: Buffer;
  stampAssetId: number | null;
  signatureAssetId: number | null;
}> {
  const branding = await resolveActiveBranding({
    ...overrides,
    signatoryName: model.signatoryName || overrides?.signatoryName,
    signatoryDesignation: model.signatoryDesignation || overrides?.signatoryDesignation,
  });
  const hasLetterhead = Boolean(branding.letterhead?.buffer?.length);

  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = 595;
  const pageHeight = 842;
  const marginX = 42;
  const contentWidth = pageWidth - marginX * 2;
  const topResetY = hasLetterhead ? 118 : 48;
  const bottomLimitY = pageHeight - 108;

  const ensureSpace = (needed: number, curY: number): number => {
    if (curY + needed <= bottomLimitY) return curY;
    doc.addPage();
    return topResetY;
  };

  let y = topResetY;

  if (!hasLetterhead) {
    doc.setFillColor(18, 59, 93);
    doc.rect(0, 0, pageWidth, 102, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text(model.companyName || 'NEXUSTEKFUSION PRIVATE LIMITED', marginX, 38);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.8);
    doc.setTextColor(220, 234, 245);
    doc.text(model.companyAddress || 'Amravati, Maharashtra, India', marginX, 55);
    doc.text(
      `Email: ${model.companyContactEmail || 'support@nexustekfusion.com'} | Phone: ${model.companyContactPhone || '+91-9876543210'}`,
      marginX,
      70
    );
    if (model.companyGstin || model.companyCin) {
      doc.text(
        [model.companyGstin ? `GSTIN: ${model.companyGstin}` : '', model.companyCin ? `CIN: ${model.companyCin}` : '']
          .filter(Boolean)
          .join('  |  '),
        marginX,
        84
      );
    }
    y = 124;
  }

  // Title Banner
  doc.setFillColor(240, 248, 255);
  doc.setDrawColor(144, 202, 249);
  doc.roundedRect(marginX, y - 12, contentWidth, 44, 5, 5, 'FD');
  doc.setTextColor(18, 59, 93);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('PROJECT DEVELOPMENT SERVICE AGREEMENT', marginX + 12, y + 6);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.8);
  doc.setTextColor(38, 55, 70);
  doc.text(
    `Agreement No: ${model.agreementNumber}   |   Date: ${model.agreementDate}   |   Status: ${model.status}`,
    marginX + 12,
    y + 22
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
  y += Math.max(leftWrapped.length, rightWrapped.length) * 12.5 + 14;

  const drawSection = (heading: string, body: string) => {
    const cleanBody = String(body || 'As agreed between Client and Company.').trim();
    const lines = doc.splitTextToSize(cleanBody, contentWidth - 10);
    y = ensureSpace(28 + lines.length * 12.2, y);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(18, 59, 93);
    doc.text(heading, marginX, y);
    y += 13;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.1);
    doc.setTextColor(38, 55, 70);
    doc.text(lines, marginX + 4, y);
    y += lines.length * 12.2 + 12;
  };

  drawSection('3. PROJECT DESCRIPTION', model.projectDescription);
  drawSection('4. PROJECT SCOPE & DELIVERABLES', model.scopeAndDeliverables);

  // Payment Schedule Box (Two 50% Installments)
  y = ensureSpace(118, y);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(18, 59, 93);
  doc.text('5. COMMERCIAL VALUE & TWO-INSTALLMENT PAYMENT TERMS', marginX, y);
  y += 10;

  doc.setFillColor(240, 248, 255);
  doc.setDrawColor(144, 202, 249);
  doc.roundedRect(marginX, y, contentWidth, 86, 5, 5, 'FD');
  doc.setFontSize(9.2);
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
  y += 102;

  drawSection('6. PROJECT TIMELINE', model.projectTimeline);
  drawSection('7. GENERAL TERMS & CONDITIONS', model.termsAndConditions);
  drawSection('8. CANCELLATION & REFUND POLICY', model.cancellationAndRefundPolicy);

  // Execution & Customer Acceptance Section (kept clear above bottom stamp/signature placement zone)
  y = ensureSpace(115, y);
  doc.setDrawColor(220, 234, 245);
  doc.line(marginX, y, pageWidth - marginX, y);
  y += 14;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(18, 59, 93);
  doc.text('FOR COMPANY (AUTHORIZED EXECUTION)', marginX, y);
  doc.text('FOR CLIENT / CUSTOMER ACCEPTANCE', marginX + 265, y);
  y += 10;

  doc.setDrawColor(144, 202, 249);
  doc.setFillColor(250, 253, 255);
  doc.roundedRect(marginX, y, 248, 72, 4, 4, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.8);
  doc.setTextColor(18, 59, 93);
  doc.text(model.signatoryName || branding.signatoryName, marginX + 10, y + 20);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(38, 55, 70);
  doc.text(model.signatoryDesignation || branding.signatoryDesignation, marginX + 10, y + 34);
  doc.setFontSize(8.2);
  doc.text('Company seal & authorized signature affixed below per Document Settings.', marginX + 10, y + 54);

  // Customer Acceptance Box (NEVER pre-marked as accepted)
  doc.roundedRect(marginX + 263, y, 248, 72, 4, 4, 'FD');
  const isAccepted = model.status === 'Accepted' && Boolean(model.acceptedAt);
  if (isAccepted) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(21, 128, 61);
    doc.text('STATUS: ACCEPTED BY CUSTOMER', marginX + 273, y + 18);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.3);
    doc.setTextColor(38, 55, 70);
    doc.text(`Accepted By: ${model.acceptedByName || model.customerName}`, marginX + 273, y + 33);
    doc.text(`Email: ${model.acceptedByEmail || model.customerEmail}`, marginX + 273, y + 46);
    doc.text(
      `Date: ${new Date(model.acceptedAt!).toLocaleString('en-IN')}${model.acceptanceIp ? ` | IP: ${model.acceptanceIp}` : ''}`,
      marginX + 273,
      y + 59
    );
  } else {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(180, 83, 9);
    doc.text(`STATUS: ${String(model.status || 'AWAITING ACCEPTANCE').toUpperCase()}`, marginX + 273, y + 18);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.2);
    doc.setTextColor(38, 55, 70);
    const pendingNote = doc.splitTextToSize(
      'Not marked accepted until the customer completes digital acceptance in their NexusTekFusion portal.',
      226
    );
    doc.text(pendingNote, marginX + 273, y + 34);
    doc.text(`Client: ${model.customerName || 'Customer'}`, marginX + 273, y + 62);
  }

  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `Generated by ${model.companyName} Cloud Agreement System | Ref: ${model.agreementNumber}`,
    marginX,
    pageHeight - 24
  );

  const rawBytes = Buffer.from(doc.output('arraybuffer'));
  const finalBuffer = await compositeOnA4WithBranding({ contentPdfBytes: rawBytes, branding });
  return {
    buffer: finalBuffer,
    stampAssetId: model.stampAssetId ?? null,
    signatureAssetId: model.signatureAssetId ?? null,
  };
}

export { syncDocumentSettingsToSupabase };
