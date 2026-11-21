import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { Request, Response, NextFunction } from 'express';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { payments, printingFileDownloadLogs, printingOrders } from '../db/schema.ts';
import { ensureUploadDirs, logAudit, UPLOADS_ROOT } from './utils.ts';

export const ALLOWED_ORIGINAL_3D_EXTS = ['.stl', '.obj', '.3mf', '.step', '.stp', '.iges', '.igs'];

export const REJECTED_SLICED_3D_EXTS = [
  '.gcode',
  '.gco',
  '.g',
  '.bgcode',
  '.gx',
  '.x3g',
  '.ctb',
  '.goo',
  '.pwmo',
  '.sl1',
  '.sl1s',
  '.photon',
  '.cxdlp',
  '.cbddlp',
  '.pwms',
  '.pw0',
  '.pwmx',
  '.rzd',
  '.fpp',
];

export const PRINTING_ORDER_STATUSES = [
  'New Order',
  'Pending Payment',
  'Payment Pending',
  'Payment Completed',
  'File Under Review',
  'Quotation Sent',
  'Printing Parameters Confirmed',
  'Ready for Printing',
  'Approved for Printing',
  'Printing in Progress',
  'Quality Inspection',
  'Completed',
  'Dispatched / Delivered',
  'Rejected',
  'Cancelled',
] as const;

export const PRINTING_EXECUTION_STATUSES = new Set<string>([
  'Printing Parameters Confirmed',
  'Ready for Printing',
  'Approved for Printing',
  'Printing Scheduled',
  'Printing in Progress',
  'Quality Inspection',
  'Packaging',
  'Completed',
  'Shipped',
  'Delivered',
  'Dispatched / Delivered',
]);

export function getPaymentStatusDisplay(
  paymentStatus?: string | null,
  refundStatus?: string | null
): {
  code: 'pending' | 'paid' | 'failed' | 'refunded';
  label: 'Pending Payment' | 'Payment Successful' | 'Payment Failed' | 'Payment Refunded';
  warning: string;
  isPaid: boolean;
} {
  const p = String(paymentStatus || 'pending').trim().toLowerCase();
  const r = String(refundStatus || 'none').trim().toLowerCase();
  if (p === 'refunded' || p === 'partially_refunded' || r === 'full' || r === 'partial') {
    return {
      code: 'refunded',
      label: 'Payment Refunded',
      warning: 'Payment Not Completed',
      isPaid: false,
    };
  }
  if (p === 'failed' || p === 'cancelled') {
    return {
      code: 'failed',
      label: 'Payment Failed',
      warning: 'Payment Not Completed',
      isPaid: false,
    };
  }
  if (p === 'paid') {
    return {
      code: 'paid',
      label: 'Payment Successful',
      warning: '',
      isPaid: true,
    };
  }
  return {
    code: 'pending',
    label: 'Pending Payment',
    warning: 'Payment Not Completed',
    isPaid: false,
  };
}

export function checkPrintingAuthorization(order: {
  paymentStatus?: string | null;
  refundStatus?: string | null;
  orderStatus?: string | null;
}): { authorized: boolean; reason: string } {
  const disp = getPaymentStatusDisplay(order.paymentStatus, order.refundStatus);
  if (!disp.isPaid) {
    return {
      authorized: false,
      reason: `Payment Not Completed (${disp.label}) — Customer payment must be verified before approving for 3D printing.`,
    };
  }
  const st = String(order.orderStatus || '');
  if (st === 'Rejected' || st === 'Cancelled') {
    return {
      authorized: false,
      reason: `Enquiry is ${st} and cannot be approved for printing.`,
    };
  }
  return { authorized: true, reason: '' };
}

export function deleteLocalPrintingFileSafe(relOrAbsPath?: string | null): boolean {
  const raw = String(relOrAbsPath || '').trim();
  if (!raw) return false;
  try {
    const abs = path.isAbsolute(raw) ? path.resolve(raw) : path.resolve(UPLOADS_ROOT, raw);
    if (!abs.startsWith(UPLOADS_ROOT)) return false;
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
      fs.unlinkSync(abs);
      return true;
    }
  } catch {
    // Non-blocking cleanup
  }
  return false;
}

export const ALLOWED_PRODUCTION_3D_EXTS = [
  '.gcode',
  '.gco',
  '.bgcode',
  '.3mf',
  '.stl',
  '.obj',
  '.step',
  '.stp',
  '.zip',
  '.pdf',
  '.txt',
];

export function createOriginal3DModelUploadMiddleware(maxSizeMb = 80) {
  ensureUploadDirs();
  const storage = multer.diskStorage({
    destination: (req, _file, cb) => {
      const uid = Number((req as any)?.dbUser?.id || 0);
      const destDir = uid > 0 ? path.join(UPLOADS_ROOT, '3d-models', `u_${uid}`) : path.join(UPLOADS_ROOT, '3d-models');
      try {
        fs.mkdirSync(destDir, { recursive: true });
      } catch {
        // fallback handled by multer if mkdir fails
      }
      cb(null, destDir);
    },
    filename: (_req, file, cb) => {
      const safeBase = path
        .basename(file.originalname, path.extname(file.originalname))
        .replace(/[^a-zA-Z0-9_-]/g, '_')
        .slice(0, 48);
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${Date.now()}_${crypto.randomBytes(4).toString('hex')}_${safeBase}${ext}`);
    },
  });

  return multer({
    storage,
    limits: { fileSize: maxSizeMb * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      if (REJECTED_SLICED_3D_EXTS.includes(ext)) {
        cb(
          new Error(
            `Sliced printer files (${ext}) are not accepted. Please upload an original 3D CAD design file (.STL, .OBJ, .3MF, .STEP/.STP, or .IGES/.IGS).`
          )
        );
        return;
      }
      if (!ALLOWED_ORIGINAL_3D_EXTS.includes(ext)) {
        cb(
          new Error(
            `Unsupported 3D file format '${ext}'. Allowed original 3D CAD formats: STL, OBJ, 3MF, STEP/STP, IGES/IGS.`
          )
        );
        return;
      }
      cb(null, true);
    },
  });
}

export function createProduction3DFileUploadMiddleware(maxSizeMb = 100) {
  ensureUploadDirs();
  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, path.join(UPLOADS_ROOT, '3d-production'));
    },
    filename: (_req, file, cb) => {
      const safeBase = path
        .basename(file.originalname, path.extname(file.originalname))
        .replace(/[^a-zA-Z0-9_-]/g, '_')
        .slice(0, 48);
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${Date.now()}_${crypto.randomBytes(4).toString('hex')}_${safeBase}${ext}`);
    },
  });

  return multer({
    storage,
    limits: { fileSize: maxSizeMb * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      if (!ALLOWED_PRODUCTION_3D_EXTS.includes(ext)) {
        cb(
          new Error(
            `Unsupported production file '${ext}'. Allowed: ${ALLOWED_PRODUCTION_3D_EXTS.join(', ')}`
          )
        );
        return;
      }
      cb(null, true);
    },
  });
}

export function createOriginal3DModelMemoryUploadMiddleware(maxSizeMb = 80) {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxSizeMb * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      if (REJECTED_SLICED_3D_EXTS.includes(ext)) {
        cb(
          new Error(
            `Sliced printer files (${ext}) are not accepted. Please upload an original 3D CAD design file (.STL, .OBJ, .3MF, .STEP/.STP, or .IGES/.IGS).`
          )
        );
        return;
      }
      if (!ALLOWED_ORIGINAL_3D_EXTS.includes(ext)) {
        cb(
          new Error(
            `Unsupported 3D file format '${ext}'. Allowed original 3D CAD formats: STL, OBJ, 3MF, STEP/STP, IGES/IGS.`
          )
        );
        return;
      }
      cb(null, true);
    },
  });
}

export function createProduction3DMemoryUploadMiddleware(maxSizeMb = 100) {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxSizeMb * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      if (!ALLOWED_PRODUCTION_3D_EXTS.includes(ext)) {
        cb(
          new Error(
            `Unsupported production file '${ext}'. Allowed: ${ALLOWED_PRODUCTION_3D_EXTS.join(', ')}`
          )
        );
        return;
      }
      cb(null, true);
    },
  });
}

export function runSingleUploadWithJsonErrors(
  middleware: multer.Multer,
  fieldName: string
) {
  const single = middleware.single(fieldName);
  return (req: Request, res: Response, next: NextFunction) => {
    single(req, res, (err: any) => {
      if (err) {
        return res.status(400).json({
          error: err?.message || 'Invalid file upload.',
        });
      }
      next();
    });
  };
}

export interface DownloadVerificationResult {
  allowed: boolean;
  reason: string;
  order: typeof printingOrders.$inferSelect | null;
}

/**
 * Payment verification helper for printing authorization & payment audits.
 * NOTE: Admin original 3D model downloads are ALWAYS allowed regardless of payment status
 * so engineers can inspect geometry and prepare quotations before payment.
 */
export async function verifyPrintingOrderDownloadAccess(
  orderId: number
): Promise<DownloadVerificationResult> {
  const [order] = await db
    .select()
    .from(printingOrders)
    .where(eq(printingOrders.id, orderId))
    .limit(1);

  if (!order) {
    return { allowed: false, reason: '3D printing enquiry not found.', order: null };
  }

  const refundStatus = String(order.refundStatus || 'none').toLowerCase();
  if (refundStatus === 'full' || refundStatus === 'partial') {
    return {
      allowed: false,
      reason: `Payment was ${refundStatus === 'full' ? 'refunded' : 'partially refunded'}.`,
      order,
    };
  }

  const pStatus = String(order.paymentStatus || 'pending').toLowerCase();
  if (pStatus !== 'paid') {
    const labelMap: Record<string, string> = {
      pending: 'Pending Payment — Payment Not Completed.',
      partial: 'Partial Payment only — Full payment required.',
      failed: 'Payment Failed — Payment Not Completed.',
      cancelled: 'Payment Cancelled — Payment Not Completed.',
      refunded: 'Payment Refunded.',
      partially_refunded: 'Payment Partially Refunded.',
    };
    return {
      allowed: false,
      reason: labelMap[pStatus] || `Payment Not Completed (current status: ${order.paymentStatus}).`,
      order,
    };
  }

  if (order.orderStatus === 'Cancelled' || order.orderStatus === 'Rejected') {
    return {
      allowed: false,
      reason: `Enquiry has been ${order.orderStatus.toLowerCase()}.`,
      order,
    };
  }

  const orderPayments = await db
    .select()
    .from(payments)
    .where(
      and(
        eq(payments.entityType, 'printing_order'),
        eq(payments.entityId, order.id)
      )
    );

  const hasRefundedPayment = orderPayments.some(
    (p) =>
      p.status === 'refunded' ||
      p.status === 'partially_refunded' ||
      p.refundStatus === 'full' ||
      p.refundStatus === 'partial'
  );
  if (hasRefundedPayment) {
    return {
      allowed: false,
      reason: 'A refund or reversal was recorded for this enquiry.',
      order,
    };
  }

  return { allowed: true, reason: '', order };
}

export async function recordPrintingDownloadLog(params: {
  printingOrderId: number;
  orderNumber: string;
  userId?: number | null;
  actorUid?: string;
  actorEmail: string;
  actorRole: string;
  fileKind: 'original' | 'production' | 'spec_sheet';
  fileName: string;
  accessGranted: boolean;
  denialReason?: string;
  ipAddress?: string;
}) {
  try {
    await db.insert(printingFileDownloadLogs).values({
      printingOrderId: params.printingOrderId,
      orderNumber: params.orderNumber,
      userId: params.userId ?? null,
      actorEmail: params.actorEmail,
      actorRole: params.actorRole,
      fileKind: params.fileKind,
      fileName: params.fileName,
      accessGranted: params.accessGranted,
      denialReason: params.denialReason || '',
      ipAddress: params.ipAddress || '',
    });

    await logAudit({
      actorUid: params.actorUid || params.actorEmail,
      actorEmail: params.actorEmail,
      action: params.accessGranted
        ? `3DP_FILE_DOWNLOAD_${params.fileKind.toUpperCase()}`
        : `3DP_FILE_DOWNLOAD_DENIED_${params.fileKind.toUpperCase()}`,
      entityType: 'printing_order',
      entityId: params.printingOrderId,
      details: {
        orderNumber: params.orderNumber,
        fileName: params.fileName,
        actorRole: params.actorRole,
        accessGranted: params.accessGranted,
        denialReason: params.denialReason || '',
      },
    });
  } catch (err) {
    console.error('Failed to log 3D print file download attempt:', err);
  }
}
