import { createClient, SupabaseClient } from '@supabase/supabase-js';
import crypto from 'crypto';

let serverClient: SupabaseClient | null = null;
let serviceRoleClient: SupabaseClient | null = null;

export function normalizeSupabaseUrl(rawUrl?: string): string {
  const trimmed = (rawUrl || '').trim();
  if (!trimmed) return '';
  try {
    const parsed = new URL(trimmed);
    return parsed.origin;
  } catch {
    return trimmed.replace(/\/(rest|auth|storage|functions)\/v1\/?.*$/i, '').replace(/\/+$/, '');
  }
}

function resolveServerSupabaseEnv() {
  const url = normalizeSupabaseUrl(
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  );
  const anonKey = (
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    ''
  ).trim();
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  return { url, anonKey, serviceRoleKey };
}

export function getSupabasePublicConfig(): { url: string; anonKey: string; configured: boolean } {
  const { url, anonKey } = resolveServerSupabaseEnv();
  return {
    url,
    anonKey,
    configured: Boolean(url && anonKey),
  };
}

export function getServerSupabaseClient(): SupabaseClient | null {
  if (serverClient) return serverClient;
  const { url, anonKey, serviceRoleKey } = resolveServerSupabaseEnv();
  const key = serviceRoleKey || anonKey;
  if (!url || !key) return null;

  serverClient = createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  return serverClient;
}

export function getServiceRoleSupabaseClient(): SupabaseClient | null {
  if (serviceRoleClient) return serviceRoleClient;
  const { url, serviceRoleKey } = resolveServerSupabaseEnv();
  if (!url || !serviceRoleKey) return null;

  serviceRoleClient = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  return serviceRoleClient;
}

export function createAnonServerSupabaseClient(): SupabaseClient | null {
  const { url, anonKey } = resolveServerSupabaseEnv();
  if (!url || !anonKey) return null;

  return createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

let bucketsEnsuredPromise: Promise<void> | null = null;

const REQUIRED_BUCKETS: Array<{ name: string; public: boolean; fileSizeLimit: number }> = [
  { name: 'product-images', public: true, fileSizeLimit: 20971520 },
  { name: 'media-library', public: true, fileSizeLimit: 157286400 },
  { name: 'project-files', public: false, fileSizeLimit: 52428800 },
  { name: 'project-documents', public: false, fileSizeLimit: 52428800 },
  { name: 'project-attachments', public: false, fileSizeLimit: 83886080 },
  { name: 'project-agreements', public: false, fileSizeLimit: 52428800 },
  { name: 'company-assets', public: false, fileSizeLimit: 10485760 },
  { name: 'printing-files', public: false, fileSizeLimit: 83886080 },
  { name: 'agreements', public: false, fileSizeLimit: 52428800 },
  { name: 'invoices-pdf', public: false, fileSizeLimit: 20971520 },
  { name: 'signatures-stamps', public: false, fileSizeLimit: 10485760 },
  { name: 'quotations', public: false, fileSizeLimit: 20971520 },
  { name: 'customer-uploads', public: false, fileSizeLimit: 52428800 },
  { name: 'pcb-files', public: false, fileSizeLimit: 52428800 },
  { name: 'support-files', public: false, fileSizeLimit: 52428800 },
];

export function isSupabaseStorageConfigured(): boolean {
  const { url, anonKey, serviceRoleKey } = resolveServerSupabaseEnv();
  return Boolean(url && (serviceRoleKey || anonKey));
}

export async function ensureSupabaseStorageBuckets(): Promise<void> {
  const serviceClient = getServiceRoleSupabaseClient();
  if (!serviceClient) return;
  if (bucketsEnsuredPromise) return bucketsEnsuredPromise;

  bucketsEnsuredPromise = (async () => {
    try {
      const { data: existing, error: listErr } = await serviceClient.storage.listBuckets();
      if (listErr) {
        console.warn('[Supabase Storage] Unable to list buckets:', listErr.message);
        return;
      }
      const existingNames = new Set((existing || []).map((b) => b.id || b.name));
      for (const bucket of REQUIRED_BUCKETS) {
        if (!existingNames.has(bucket.name)) {
          const { error: createErr } = await serviceClient.storage.createBucket(bucket.name, {
            public: bucket.public,
            fileSizeLimit: bucket.fileSizeLimit,
          });
          if (createErr && !/already exists/i.test(createErr.message)) {
            const { error: fallbackErr } = await serviceClient.storage.createBucket(bucket.name, {
              public: bucket.public,
            });
            if (fallbackErr && !/already exists/i.test(fallbackErr.message)) {
              console.warn(`[Supabase Storage] Failed to create bucket ${bucket.name}:`, fallbackErr.message);
            }
          }
        }
      }
    } catch (err) {
      console.warn('[Supabase Storage] Bucket initialization warning:', (err as Error)?.message);
    }
  })();

  return bucketsEnsuredPromise;
}

export interface VerifiedSupabaseClaims {
  uid: string;
  email: string;
  fullName: string;
  phone: string;
  emailConfirmedAt: string;
  phoneConfirmedAt: string;
}

export async function verifySupabaseAccessToken(
  token: string
): Promise<VerifiedSupabaseClaims | null> {
  const cleanToken = (token || '').trim();
  // Supabase access tokens are always compact JWS/JWTs (header.payload.signature)
  if (!cleanToken || cleanToken.split('.').length !== 3) return null;

  const client = getServerSupabaseClient();
  if (!client) return null;

  try {
    const { data, error } = await client.auth.getUser(cleanToken);
    if (error || !data?.user) {
      return null;
    }

    const u = data.user;
    const meta = u.user_metadata || {};
    return {
      uid: u.id,
      email: u.email || '',
      fullName: String(meta.full_name || meta.name || '').trim(),
      phone: String(u.phone || meta.phone || '').trim(),
      emailConfirmedAt: u.email_confirmed_at ? String(u.email_confirmed_at) : '',
      phoneConfirmedAt: u.phone_confirmed_at ? String(u.phone_confirmed_at) : '',
    };
  } catch {
    return null;
  }
}

export async function uploadProductImageToSupabase(params: {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
  folder?: string;
}): Promise<{ publicUrl: string; storagePath: string } | null> {
  const serviceClient = getServiceRoleSupabaseClient();
  const client = serviceClient || getServerSupabaseClient();
  if (!client) return null;

  try {
    await ensureSupabaseStorageBuckets();
    const ext = params.originalName.includes('.')
      ? params.originalName.slice(params.originalName.lastIndexOf('.')).toLowerCase()
      : '.jpg';
    const cleanFolder = String(params.folder || 'products').replace(/[^a-zA-Z0-9_-]/g, '');
    const fileKey = `${cleanFolder}/${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;

    const { error } = await client.storage.from('product-images').upload(fileKey, params.buffer, {
      contentType: params.mimeType || 'image/jpeg',
      upsert: false,
    });
    if (error) {
      return null;
    }

    const { data: pubData } = client.storage.from('product-images').getPublicUrl(fileKey);
    if (!pubData?.publicUrl) return null;

    return {
      publicUrl: pubData.publicUrl,
      storagePath: fileKey,
    };
  } catch {
    return null;
  }
}

export async function uploadProjectFileToSupabase(params: {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
  folder?: string;
}): Promise<{ storagePath: string } | null> {
  const serviceClient = getServiceRoleSupabaseClient();
  const client = serviceClient || getServerSupabaseClient();
  if (!client) return null;

  try {
    await ensureSupabaseStorageBuckets();
    const ext = params.originalName.includes('.')
      ? params.originalName.slice(params.originalName.lastIndexOf('.')).toLowerCase()
      : '';
    const cleanFolder = String(params.folder || 'registrations').replace(/[^a-zA-Z0-9_-]/g, '');
    const fileKey = `${cleanFolder}/${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;

    const { error } = await client.storage.from('project-files').upload(fileKey, params.buffer, {
      contentType: params.mimeType || 'application/octet-stream',
      upsert: false,
    });
    if (error) {
      return null;
    }
    return { storagePath: fileKey };
  } catch {
    return null;
  }
}

export async function getSignedProjectFileUrl(storagePath: string, expiresInSeconds = 300): Promise<string | null> {
  const client = getServiceRoleSupabaseClient() || getServerSupabaseClient();
  if (!client || !storagePath) return null;
  try {
    const { data, error } = await client.storage
      .from('project-files')
      .createSignedUrl(storagePath, expiresInSeconds);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  } catch {
    return null;
  }
}

export async function upload3DModelToSupabase(params: {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
  folder?: string;
}): Promise<{ storagePath: string; bucket: string } | null> {
  const serviceClient = getServiceRoleSupabaseClient();
  const client = serviceClient || getServerSupabaseClient();
  if (!client) return null;

  try {
    const ext = params.originalName.includes('.')
      ? params.originalName.slice(params.originalName.lastIndexOf('.')).toLowerCase()
      : '';
    const cleanFolder = String(params.folder || 'original')
      .replace(/[^a-zA-Z0-9_/-]/g, '')
      .replace(/^\/+|\/+$/g, '') || 'original';
    const safeBase = params.originalName
      .replace(/\.[^/.]+$/, '')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 48);
    const fileKey = `${cleanFolder}/${Date.now()}-${crypto.randomBytes(6).toString('hex')}-${safeBase}${ext}`;

    await ensureSupabaseStorageBuckets();

    const { error } = await client.storage.from('printing-files').upload(fileKey, params.buffer, {
      contentType: params.mimeType || 'application/octet-stream',
      upsert: false,
    });
    if (error) {
      return null;
    }
    return { storagePath: fileKey, bucket: 'printing-files' };
  } catch {
    return null;
  }
}

export async function getSigned3DModelUrl(
  storagePath: string,
  expiresInSeconds = 120,
  downloadFileName?: string
): Promise<string | null> {
  const client = getServiceRoleSupabaseClient() || getServerSupabaseClient();
  if (!client || !storagePath) return null;
  try {
    const { data, error } = await client.storage
      .from('printing-files')
      .createSignedUrl(storagePath, expiresInSeconds, downloadFileName ? { download: downloadFileName } : undefined);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  } catch {
    return null;
  }
}

export async function downloadPrintingFileFromSupabase(storagePath: string): Promise<Buffer | null> {
  const client = getServiceRoleSupabaseClient() || getServerSupabaseClient();
  const cleanPath = String(storagePath || '').trim().replace(/^\/+/, '');
  if (!client || !cleanPath || cleanPath.includes('..')) return null;
  try {
    const { data, error } = await client.storage.from('printing-files').download(cleanPath);
    if (error || !data) return null;
    const ab = await data.arrayBuffer();
    return Buffer.from(ab);
  } catch {
    return null;
  }
}

export async function deletePrintingOrderFilesFromSupabase(
  storagePaths: string[],
  orderId?: number
): Promise<string[]> {
  const client = getServiceRoleSupabaseClient() || getServerSupabaseClient();
  const removed: string[] = [];
  if (!client) return removed;

  try {
    const uniquePaths = Array.from(
      new Set(
        (storagePaths || [])
          .map((p) => String(p || '').trim().replace(/^\/+/, ''))
          .filter((p) => Boolean(p) && !p.includes('..'))
      )
    );

    if (orderId) {
      for (const folderPrefix of [`production/o_${orderId}`, `temp/o_${orderId}`]) {
        const { data: listed } = await client.storage.from('printing-files').list(folderPrefix, { limit: 100 });
        if (Array.isArray(listed)) {
          for (const item of listed) {
            if (item?.name) uniquePaths.push(`${folderPrefix}/${item.name}`);
          }
        }
      }
    }

    const deduped = Array.from(new Set(uniquePaths));
    if (deduped.length > 0) {
      const { error } = await client.storage.from('printing-files').remove(deduped);
      if (!error) {
        removed.push(...deduped);
      }
    }
  } catch {
    // Non-blocking storage cleanup
  }
  return removed;
}

export async function uploadCmsMediaToSupabase(params: {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
  folder?: string;
}): Promise<{ publicUrl: string; storagePath: string; bucket: string } | null> {
  const serviceClient = getServiceRoleSupabaseClient();
  const client = serviceClient || getServerSupabaseClient();
  if (!client) return null;

  const isVideoOrDoc =
    (params.mimeType || '').startsWith('video/') ||
    (params.mimeType || '').includes('pdf');
  const candidateBuckets = isVideoOrDoc
    ? ['media-library', 'product-images']
    : ['media-library', 'product-images'];

  try {
    const ext = params.originalName.includes('.')
      ? params.originalName.slice(params.originalName.lastIndexOf('.')).toLowerCase()
      : '.bin';
    const cleanFolder = String(params.folder || 'cms')
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '-')
      .replace(/^-|-$/g, '') || 'cms';
    const fileKey = `${cleanFolder}/${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;

    await ensureSupabaseStorageBuckets();

    for (const bucket of candidateBuckets) {
      const { error } = await client.storage.from(bucket).upload(fileKey, params.buffer, {
        contentType: params.mimeType || 'application/octet-stream',
        upsert: false,
      });
      if (!error) {
        const { data: pubData } = client.storage.from(bucket).getPublicUrl(fileKey);
        if (pubData?.publicUrl) {
          return {
            publicUrl: pubData.publicUrl,
            storagePath: fileKey,
            bucket,
          };
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

export async function deleteCmsMediaFromSupabase(publicUrl: string): Promise<void> {
  if (!publicUrl || !publicUrl.includes('/storage/v1/object/public/')) return;
  const client = getServiceRoleSupabaseClient() || getServerSupabaseClient();
  if (!client) return;

  try {
    const marker = '/storage/v1/object/public/';
    const idx = publicUrl.indexOf(marker);
    if (idx < 0) return;
    const remainder = decodeURIComponent(publicUrl.slice(idx + marker.length).split('?')[0]);
    const slashIdx = remainder.indexOf('/');
    if (slashIdx <= 0) return;
    const bucket = remainder.slice(0, slashIdx);
    const objectPath = remainder.slice(slashIdx + 1);
    if (!bucket || !objectPath) return;
    await client.storage.from(bucket).remove([objectPath]);
  } catch {
    // Non-blocking storage cleanup
  }
}

export type PrivateStorageBucket =
  | 'project-documents'
  | 'project-files'
  | 'project-attachments'
  | 'project-agreements'
  | 'company-assets'
  | 'printing-files'
  | 'agreements'
  | 'invoices-pdf'
  | 'signatures-stamps'
  | 'quotations'
  | 'customer-uploads'
  | 'pcb-files'
  | 'support-files';

export function sanitizeStorageSegment(input: string, fallback = 'general'): string {
  const clean = String(input || '')
    .trim()
    .replace(/[^a-zA-Z0-9_/-]/g, '_')
    .replace(/\/+/g, '/')
    .replace(/^\/+|\/+$/g, '');
  return clean && !clean.includes('..') ? clean : fallback;
}

export async function uploadPrivateBufferToSupabaseStorage(params: {
  bucket: PrivateStorageBucket;
  buffer: Buffer;
  originalName: string;
  mimeType?: string;
  folder?: string;
  ownerPrefix?: string;
  upsert?: boolean;
}): Promise<{ bucket: PrivateStorageBucket; storagePath: string; fileName: string; sizeBytes: number }> {
  const serviceClient = getServiceRoleSupabaseClient();
  const client = serviceClient || getServerSupabaseClient();
  if (!client) {
    throw new Error(
      'Supabase Storage is not configured. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.'
    );
  }

  await ensureSupabaseStorageBuckets();

  const rawName = String(params.originalName || 'document.bin').trim();
  const extIdx = rawName.lastIndexOf('.');
  const ext = extIdx > 0 ? rawName.slice(extIdx).toLowerCase().replace(/[^a-z0-9.]/g, '') : '';
  const base = (extIdx > 0 ? rawName.slice(0, extIdx) : rawName)
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 64) || 'file';

  const prefixParts: string[] = [];
  if (params.ownerPrefix) prefixParts.push(sanitizeStorageSegment(params.ownerPrefix, 'shared'));
  if (params.folder) prefixParts.push(sanitizeStorageSegment(params.folder, 'files'));
  const dir = prefixParts.length > 0 ? prefixParts.join('/') : 'shared';

  const fileName = `${base}${ext}`;
  const storagePath = `${dir}/${Date.now()}-${crypto.randomBytes(6).toString('hex')}-${fileName}`;

  const { error } = await client.storage.from(params.bucket).upload(storagePath, params.buffer, {
    contentType: params.mimeType || 'application/octet-stream',
    upsert: Boolean(params.upsert),
  });
  if (error) {
    throw new Error(`Supabase Storage upload failed (${params.bucket}): ${error.message}`);
  }

  return {
    bucket: params.bucket,
    storagePath,
    fileName,
    sizeBytes: params.buffer.length,
  };
}

export async function downloadFromSupabaseStorage(
  bucket: string,
  storagePath: string
): Promise<Buffer | null> {
  const client = getServiceRoleSupabaseClient() || getServerSupabaseClient();
  const cleanPath = String(storagePath || '').trim().replace(/^\/+/, '');
  if (!client || !bucket || !cleanPath || cleanPath.includes('..')) return null;
  try {
    const { data, error } = await client.storage.from(bucket).download(cleanPath);
    if (error || !data) return null;
    const ab = await data.arrayBuffer();
    return Buffer.from(ab);
  } catch {
    return null;
  }
}

export async function getSignedPrivateStorageUrl(
  bucket: string,
  storagePath: string,
  expiresInSeconds = 300,
  downloadFileName?: string
): Promise<string | null> {
  const client = getServiceRoleSupabaseClient() || getServerSupabaseClient();
  const cleanPath = String(storagePath || '').trim().replace(/^\/+/, '');
  if (!client || !bucket || !cleanPath || cleanPath.includes('..')) return null;
  try {
    const { data, error } = await client.storage
      .from(bucket)
      .createSignedUrl(
        cleanPath,
        expiresInSeconds,
        downloadFileName ? { download: downloadFileName } : undefined
      );
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  } catch {
    return null;
  }
}

export async function uploadAgreementPdfToSupabase(params: {
  buffer: Buffer;
  originalName: string;
  ownerUid?: string;
  folder?: string;
}) {
  return uploadPrivateBufferToSupabaseStorage({
    bucket: 'project-agreements',
    buffer: params.buffer,
    originalName: params.originalName,
    mimeType: 'application/pdf',
    ownerPrefix: params.ownerUid || 'company',
    folder: params.folder || 'agreements',
  });
}

export async function uploadSigningAssetToSupabase(params: {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
  assetType: 'signature' | 'stamp' | 'logo';
}) {
  return uploadPrivateBufferToSupabaseStorage({
    bucket: 'company-assets',
    buffer: params.buffer,
    originalName: params.originalName,
    mimeType: params.mimeType || 'image/png',
    ownerPrefix: 'company',
    folder: params.assetType === 'stamp' ? 'stamps' : params.assetType === 'logo' ? 'logos' : 'signatures',
  });
}

export async function uploadProjectAttachmentToSupabase(params: {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
  ownerUid?: string;
  folder?: string;
}) {
  return uploadPrivateBufferToSupabaseStorage({
    bucket: 'project-attachments',
    buffer: params.buffer,
    originalName: params.originalName,
    mimeType: params.mimeType || 'application/octet-stream',
    ownerPrefix: params.ownerUid || 'shared',
    folder: params.folder || 'attachments',
  });
}

export async function uploadInvoicePdfToSupabase(params: {
  buffer: Buffer;
  fileName: string;
  ownerUid?: string;
}) {
  return uploadPrivateBufferToSupabaseStorage({
    bucket: 'invoices-pdf',
    buffer: params.buffer,
    originalName: params.fileName,
    mimeType: 'application/pdf',
    ownerPrefix: params.ownerUid || 'shared',
    folder: 'invoices',
    upsert: true,
  });
}

export async function uploadQuotationPdfToSupabase(params: {
  buffer: Buffer;
  fileName: string;
  ownerUid?: string;
}) {
  return uploadPrivateBufferToSupabaseStorage({
    bucket: 'quotations',
    buffer: params.buffer,
    originalName: params.fileName,
    mimeType: 'application/pdf',
    ownerPrefix: params.ownerUid || 'shared',
    folder: 'quotations',
    upsert: true,
  });
}

export async function uploadProjectDocumentToSupabase(params: {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
  ownerUid?: string;
  folder?: string;
}) {
  return uploadPrivateBufferToSupabaseStorage({
    bucket: 'project-documents',
    buffer: params.buffer,
    originalName: params.originalName,
    mimeType: params.mimeType,
    ownerPrefix: params.ownerUid || 'shared',
    folder: params.folder || 'documents',
  });
}

export async function uploadPcbFileToSupabase(params: {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
  ownerUid?: string;
}) {
  return uploadPrivateBufferToSupabaseStorage({
    bucket: 'pcb-files',
    buffer: params.buffer,
    originalName: params.originalName,
    mimeType: params.mimeType,
    ownerPrefix: params.ownerUid || 'shared',
    folder: 'gerber',
  });
}

export async function uploadSupportFileToSupabase(params: {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
  ownerUid?: string;
}) {
  return uploadPrivateBufferToSupabaseStorage({
    bucket: 'support-files',
    buffer: params.buffer,
    originalName: params.originalName,
    mimeType: params.mimeType,
    ownerPrefix: params.ownerUid || 'shared',
    folder: 'tickets',
  });
}



