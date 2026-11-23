import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { serviceRecords, services, users } from '../db/schema.ts';
import { createNotification, generateCode } from './utils.ts';
import { recordEntityStatusChange } from './record-history.ts';
import { emitCustomerStreamEvent } from './customer-realtime.ts';
import { emitAdminStreamEvent } from './admin-realtime.ts';
import {
  syncServiceRecordToSupabase,
  syncServicesCatalogToSupabase,
} from './supabase-ecommerce.ts';

export const DEFAULT_SERVICES_CATALOG = [
  {
    serviceCode: 'SRV-CUSTOM-ENG',
    name: 'Custom Engineering & R&D Project',
    slug: 'custom-engineering-project',
    category: 'Engineering',
    description:
      'End-to-end embedded hardware, firmware, robotics, IoT, and academic/industrial R&D prototyping.',
    basePriceInr: 15000,
    gstPercent: 18,
    options: { milestones: ['50% Advance', '50% Handover'] },
    isActive: true,
  },
  {
    serviceCode: 'SRV-3DP',
    name: 'Precision 3D Printing (FDM & SLA)',
    slug: '3d-printing-rapid-prototyping',
    category: 'Manufacturing',
    description:
      'Industrial FDM (PLA, PETG, PA12-CF, TPU) and 8K SLA resin rapid prototyping with CAD analysis.',
    basePriceInr: 250,
    gstPercent: 18,
    options: { technologies: ['FDM', 'SLA'] },
    isActive: true,
  },
  {
    serviceCode: 'SRV-PCB',
    name: 'PCB Design & Fabrication',
    slug: 'pcb-design-fabrication',
    category: 'PCB',
    description:
      'Single & double-layer FR4 fabrication, Gerber verification, and optional PCBA assembly.',
    basePriceInr: 950,
    gstPercent: 18,
    options: { layers: [1, 2] },
    isActive: true,
  },
  {
    serviceCode: 'SRV-AGRI-DRONE',
    name: 'KRASHIVANTRI Agricultural Drone Spraying',
    slug: 'agricultural-drone-spraying',
    category: 'Agriculture',
    description:
      'DGCA-compliant precision agricultural spraying operations across registered farms and FPOs.',
    basePriceInr: 500,
    gstPercent: 18,
    options: { unit: 'acre' },
    isActive: true,
  },
  {
    serviceCode: 'SRV-DRONE-REPAIR',
    name: 'Drone Diagnostics, Repair & Calibration',
    slug: 'drone-repair-calibration',
    category: 'Drone Services',
    description:
      'Bench diagnostics, propulsion overhaul, IMU/compass calibration, and field servicing.',
    basePriceInr: 999,
    gstPercent: 18,
    options: { modes: ['service_centre', 'field_visit'] },
    isActive: true,
  },
  {
    serviceCode: 'SRV-B2B-MFG',
    name: 'B2B Bulk Hardware & Fleet Manufacturing',
    slug: 'b2b-bulk-manufacturing',
    category: 'B2B',
    description:
      'Institutional and enterprise volume manufacturing for drones, enclosures, and electronics.',
    basePriceInr: 25000,
    gstPercent: 18,
    options: { gstBilling: true },
    isActive: true,
  },
];

let servicesSeeded = false;

export async function ensureServicesSeed() {
  if (servicesSeeded) return;
  try {
    for (const item of DEFAULT_SERVICES_CATALOG) {
      await db
        .insert(services)
        .values(item)
        .onConflictDoNothing({ target: services.serviceCode });
    }
    syncServicesCatalogToSupabase(DEFAULT_SERVICES_CATALOG).catch(() => {});
    servicesSeeded = true;
  } catch {
    // Do not block startup if table is temporarily unavailable
  }
}

export async function listActiveServicesCatalog() {
  await ensureServicesSeed();
  const rows = await db.select().from(services).where(eq(services.isActive, true));
  return rows.length > 0 ? rows : DEFAULT_SERVICES_CATALOG.map((s, idx) => ({ ...s, id: idx + 1, createdAt: new Date(), updatedAt: new Date() }));
}

export async function createOrSyncServiceRecord(params: {
  serviceRecordNumber?: string;
  serviceCode?: string;
  userId?: number | null;
  userUid?: string;
  customerId?: string;
  customerEmail?: string;
  serviceName: string;
  category: string;
  description?: string;
  specifications?: string;
  selectedOptions?: Record<string, unknown>;
  uploadedFiles?: Array<{
    originalName: string;
    storagePath: string;
    bucket?: string;
    sizeBytes?: number;
    mimeType?: string;
  }>;
  quantity?: number;
  unitPriceInr?: number;
  taxInr?: number;
  totalAmountInr?: number;
  status?: string;
  adminRemarks?: string;
  assignedTeam?: string;
  sourceEntityType: string;
  sourceEntityId: string;
}) {
  await ensureServicesSeed();

  let matchedServiceId: number | null = null;
  if (params.serviceCode) {
    const [svc] = await db
      .select()
      .from(services)
      .where(eq(services.serviceCode, params.serviceCode))
      .limit(1);
    matchedServiceId = svc?.id ?? null;
  }

  const existing = params.sourceEntityId
    ? await db
        .select()
        .from(serviceRecords)
        .where(
          and(
            eq(serviceRecords.sourceEntityType, params.sourceEntityType),
            eq(serviceRecords.sourceEntityId, String(params.sourceEntityId))
          )
        )
        .limit(1)
    : [];

  const recordNumber =
    params.serviceRecordNumber ||
    existing[0]?.serviceRecordNumber ||
    generateCode('NTF-SRV');

  let saved;
  if (existing.length > 0) {
    const [updated] = await db
      .update(serviceRecords)
      .set({
        status: params.status ?? existing[0].status,
        unitPriceInr: params.unitPriceInr ?? existing[0].unitPriceInr,
        taxInr: params.taxInr ?? existing[0].taxInr,
        totalAmountInr: params.totalAmountInr ?? existing[0].totalAmountInr,
        adminRemarks: params.adminRemarks ?? existing[0].adminRemarks,
        assignedTeam: params.assignedTeam ?? existing[0].assignedTeam,
        selectedOptions: params.selectedOptions ?? existing[0].selectedOptions,
        uploadedFiles: params.uploadedFiles ?? existing[0].uploadedFiles,
        updatedAt: new Date(),
      })
      .where(eq(serviceRecords.id, existing[0].id))
      .returning();
    saved = updated;
  } else {
    const [inserted] = await db
      .insert(serviceRecords)
      .values({
        serviceRecordNumber: recordNumber,
        serviceId: matchedServiceId,
        userId: params.userId ?? null,
        customerId: params.customerId || '',
        customerEmail: params.customerEmail || '',
        serviceName: params.serviceName,
        category: params.category,
        description: params.description || '',
        specifications: params.specifications || '',
        selectedOptions: params.selectedOptions || {},
        uploadedFiles: params.uploadedFiles || [],
        quantity: Math.max(1, params.quantity ?? 1),
        unitPriceInr: Math.max(0, params.unitPriceInr ?? 0),
        taxInr: Math.max(0, params.taxInr ?? 0),
        totalAmountInr: Math.max(0, params.totalAmountInr ?? 0),
        status: params.status || 'Pending',
        adminRemarks: params.adminRemarks || '',
        assignedTeam: params.assignedTeam || '',
        sourceEntityType: params.sourceEntityType,
        sourceEntityId: String(params.sourceEntityId),
      })
      .returning();
    saved = inserted;
  }

  let resolvedUid = params.userUid || '';
  if (!resolvedUid && saved.userId) {
    const [u] = await db.select({ uid: users.uid }).from(users).where(eq(users.id, saved.userId)).limit(1);
    resolvedUid = u?.uid || '';
  }

  syncServiceRecordToSupabase({
    serviceRecordNumber: saved.serviceRecordNumber,
    userUid: resolvedUid,
    customerId: saved.customerId,
    customerEmail: saved.customerEmail,
    serviceCode: params.serviceCode || '',
    serviceName: saved.serviceName,
    category: saved.category,
    description: saved.description,
    specifications: saved.specifications,
    selectedOptions: saved.selectedOptions,
    uploadedFiles: saved.uploadedFiles,
    quantity: saved.quantity,
    unitPriceInr: saved.unitPriceInr,
    taxInr: saved.taxInr,
    totalAmountInr: saved.totalAmountInr,
    status: saved.status,
    adminRemarks: saved.adminRemarks,
    assignedTeam: saved.assignedTeam,
    sourceEntityType: saved.sourceEntityType,
    sourceEntityId: saved.sourceEntityId,
    isDeleted: saved.isDeleted,
    archivedAt: saved.archivedAt,
    archivedReason: saved.archivedReason,
    archivedBy: saved.archivedBy,
  }).catch(() => {});

  if (saved.userId) {
    emitCustomerStreamEvent(saved.userId, {
      type: 'service_record',
      action: existing.length > 0 ? 'updated' : 'created',
      id: saved.serviceRecordNumber,
      summary: saved.status,
    });
  }

  return saved;
}

export async function updateServiceRecordByAdmin(params: {
  id: number;
  status?: string;
  adminRemarks?: string;
  assignedTeam?: string;
  unitPriceInr?: number;
  taxInr?: number;
  totalAmountInr?: number;
  archive?: boolean;
  archivedReason?: string;
  adminUid: string;
  adminEmail: string;
}) {
  const [existing] = await db
    .select()
    .from(serviceRecords)
    .where(eq(serviceRecords.id, params.id))
    .limit(1);
  if (!existing) return null;

  const now = new Date();
  const nextStatus = params.archive
    ? 'Archived'
    : params.status !== undefined
      ? params.status
      : existing.status;

  const [updated] = await db
    .update(serviceRecords)
    .set({
      status: nextStatus,
      adminRemarks: params.adminRemarks !== undefined ? params.adminRemarks : existing.adminRemarks,
      assignedTeam: params.assignedTeam !== undefined ? params.assignedTeam : existing.assignedTeam,
      unitPriceInr: params.unitPriceInr !== undefined ? Math.max(0, params.unitPriceInr) : existing.unitPriceInr,
      taxInr: params.taxInr !== undefined ? Math.max(0, params.taxInr) : existing.taxInr,
      totalAmountInr: params.totalAmountInr !== undefined ? Math.max(0, params.totalAmountInr) : existing.totalAmountInr,
      isDeleted: params.archive ? true : existing.isDeleted,
      archivedAt: params.archive ? now : existing.archivedAt,
      archivedReason: params.archive
        ? params.archivedReason || 'Archived by Administrator'
        : existing.archivedReason,
      archivedBy: params.archive ? params.adminEmail : existing.archivedBy,
      updatedAt: now,
    })
    .where(eq(serviceRecords.id, existing.id))
    .returning();

  let resolvedUid = '';
  if (updated.userId) {
    const [u] = await db.select({ uid: users.uid }).from(users).where(eq(users.id, updated.userId)).limit(1);
    resolvedUid = u?.uid || '';
  }

  await recordEntityStatusChange({
    entityType: 'service_record',
    entityId: updated.id,
    entityCode: updated.serviceRecordNumber,
    customerId: updated.customerId,
    userId: updated.userId,
    userUid: resolvedUid,
    customerEmail: updated.customerEmail,
    previousStatus: existing.status,
    newStatus: updated.status,
    actionType: params.archive
      ? 'archive'
      : updated.status === 'Rejected'
        ? 'rejection'
        : 'status_change',
    reason:
      params.archivedReason ||
      updated.adminRemarks ||
      `Service status updated to ${updated.status}`,
    adminId: params.adminUid,
    adminEmail: params.adminEmail,
    originalRecord: existing as unknown as Record<string, unknown>,
  });

  if (updated.userId) {
    await createNotification({
      userId: updated.userId,
      title: `Service ${updated.serviceRecordNumber}: ${updated.status}`,
      message:
        updated.adminRemarks ||
        (params.archive
          ? `Archived (${updated.archivedReason || 'Closed by admin'}). Full history remains in My Services.`
          : `${updated.serviceName} status changed to ${updated.status}.`),
      link: '/my-account?tab=services',
    }).catch(() => {});
  }

  syncServiceRecordToSupabase({
    serviceRecordNumber: updated.serviceRecordNumber,
    userUid: resolvedUid,
    customerId: updated.customerId,
    customerEmail: updated.customerEmail,
    serviceName: updated.serviceName,
    category: updated.category,
    description: updated.description,
    specifications: updated.specifications,
    selectedOptions: updated.selectedOptions,
    uploadedFiles: updated.uploadedFiles,
    quantity: updated.quantity,
    unitPriceInr: updated.unitPriceInr,
    taxInr: updated.taxInr,
    totalAmountInr: updated.totalAmountInr,
    status: updated.status,
    adminRemarks: updated.adminRemarks,
    assignedTeam: updated.assignedTeam,
    sourceEntityType: updated.sourceEntityType,
    sourceEntityId: updated.sourceEntityId,
    isDeleted: updated.isDeleted,
    archivedAt: updated.archivedAt,
    archivedReason: updated.archivedReason,
    archivedBy: updated.archivedBy,
  }).catch(() => {});

  emitAdminStreamEvent({
    type: 'project',
    action: params.archive ? 'service_archived' : 'service_updated',
    id: updated.serviceRecordNumber,
    summary: updated.status,
  });

  return updated;
}

export async function listCustomerServiceRecords(userId: number) {
  return db
    .select()
    .from(serviceRecords)
    .where(eq(serviceRecords.userId, userId))
    .orderBy(desc(serviceRecords.createdAt));
}
