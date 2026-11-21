import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { db } from '../db/index.ts';
import { auditLogs, notifications } from '../db/schema.ts';

export const UPLOADS_ROOT = path.resolve(process.cwd(), 'uploads');

export function ensureUploadDirs() {
  for (const sub of [
    '3d-models',
    '3d-production',
    'projects',
    'projects-updates',
    'projects-handover',
    'pcb',
    'b2b',
    'support',
    'media',
    'drone-repairs',
    'krashivantri-kyc',
    'krashivantri-evidence',
  ]) {
    const dir = path.join(UPLOADS_ROOT, sub);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

export function createUploadMiddleware(subfolder: string, allowedExts: string[], maxSizeMb = 50) {
  ensureUploadDirs();
  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, path.join(UPLOADS_ROOT, subfolder));
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
      if (allowedExts.includes(ext)) {
        cb(null, true);
      } else {
        cb(new Error(`Unsupported file extension '${ext}'. Allowed: ${allowedExts.join(', ')}`));
      }
    },
  });
}

export function createMemoryUploadMiddleware(allowedExts: string[], maxSizeMb = 50) {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxSizeMb * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      if (allowedExts.includes(ext)) {
        cb(null, true);
      } else {
        cb(new Error(`Unsupported file extension '${ext}'. Allowed: ${allowedExts.join(', ')}`));
      }
    },
  });
}

export function generateCode(prefix: string): string {
  const year = new Date().getFullYear();
  const randNum = String(crypto.randomInt(10000, 99999));
  return `${prefix}-${year}-${randNum}`;
}

export function maskAccountNumber(accNo: string): string {
  const clean = accNo.replace(/\s+/g, '');
  if (clean.length <= 4) return '••••';
  return `${'•'.repeat(Math.max(4, clean.length - 4))}${clean.slice(-4)}`;
}

export function haversineDistanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function isPointInPolygon(
  lat: number,
  lng: number,
  polygon: Array<{ lat: number; lng: number }>
): boolean {
  if (!Array.isArray(polygon) || polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lat;
    const yi = polygon[i].lng;
    const xj = polygon[j].lat;
    const yj = polygon[j].lng;
    const intersect = yi > lng !== yj > lng && lat < ((xj - xi) * (lng - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export async function logAudit(params: {
  actorUid: string;
  actorEmail: string;
  action: string;
  entityType: string;
  entityId?: string | number;
  details?: Record<string, unknown>;
}) {
  try {
    await db.insert(auditLogs).values({
      actorUid: params.actorUid,
      actorEmail: params.actorEmail,
      action: params.action,
      entityType: params.entityType,
      entityId: String(params.entityId ?? ''),
      details: params.details ?? {},
    });
  } catch (err) {
    console.error('Audit log insert failed:', err);
  }
}

export async function createNotification(params: {
  userId: number;
  title: string;
  message: string;
  link?: string;
}) {
  try {
    await db.insert(notifications).values({
      userId: params.userId,
      title: params.title,
      message: params.message,
      link: params.link ?? '/my-account',
    });
  } catch (err) {
    console.error('Notification insert failed:', err);
  }
}

export function isValidIndianPin(pin: string): boolean {
  return /^[1-9][0-9]{5}$/.test(pin.trim());
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  if (!storedHash || !storedHash.includes(':')) return false;
  const [salt, keyHex] = storedHash.split(':');
  if (!salt || !keyHex) return false;
  try {
    const keyBuf = Buffer.from(keyHex, 'hex');
    const derivedBuf = crypto.scryptSync(password, salt, 64);
    if (keyBuf.length !== derivedBuf.length) return false;
    return crypto.timingSafeEqual(keyBuf, derivedBuf);
  } catch {
    return false;
  }
}

export function parseCookies(cookieHeader?: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!cookieHeader) return result;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    try {
      result[key] = decodeURIComponent(val);
    } catch {
      result[key] = val;
    }
  }
  return result;
}
