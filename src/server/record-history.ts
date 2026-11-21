import { db } from '../db/index.ts';
import { auditLogs, customerActivityLogs, recordStatusHistory } from '../db/schema.ts';
import {
  syncActivityLogToSupabase,
  syncRecordStatusHistoryToSupabase,
} from './supabase-ecommerce.ts';

export async function recordEntityStatusChange(params: {
  entityType: string;
  entityId: string | number;
  entityCode?: string;
  customerId?: string;
  userId?: number | null;
  userUid?: string;
  customerEmail?: string;
  previousStatus: string;
  newStatus: string;
  actionType: 'status_change' | 'rejection' | 'archive' | 'restore';
  reason?: string;
  adminId?: string;
  adminEmail: string;
  originalRecord?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}) {
  const entityIdStr = String(params.entityId);
  const [inserted] = await db
    .insert(recordStatusHistory)
    .values({
      entityType: params.entityType,
      entityId: entityIdStr,
      entityCode: params.entityCode || '',
      customerId: params.customerId || '',
      userId: params.userId ?? null,
      previousStatus: params.previousStatus || '',
      newStatus: params.newStatus || '',
      actionType: params.actionType,
      reason: params.reason || '',
      adminId: params.adminId || params.adminEmail,
      adminEmail: params.adminEmail,
      originalRecord: params.originalRecord || {},
      metadata: params.metadata || {},
    })
    .returning();

  await db
    .insert(auditLogs)
    .values({
      actorUid: params.adminId || params.adminEmail,
      actorEmail: params.adminEmail,
      action: `${params.actionType.toUpperCase()}_${params.entityType.toUpperCase()}`,
      entityType: params.entityType,
      entityId: params.entityCode || entityIdStr,
      details: {
        previousStatus: params.previousStatus,
        newStatus: params.newStatus,
        reason: params.reason || '',
        customerId: params.customerId || '',
        ...(params.metadata || {}),
      },
    })
    .catch((err) => {
      console.error('[AuditLog] Failed to insert audit log:', err);
    });

  if (params.userId || params.customerId || params.customerEmail) {
    await db
      .insert(customerActivityLogs)
      .values({
        userId: params.userId ?? null,
        customerId: params.customerId || '',
        email: params.customerEmail || '',
        action: `${params.entityType}_${params.actionType}`,
        category: params.entityType.includes('order')
          ? 'order'
          : params.entityType.includes('printing')
            ? 'printing'
            : params.entityType.includes('project')
              ? 'project'
              : params.entityType.includes('pcb')
                ? 'pcb'
                : params.entityType.includes('b2b')
                  ? 'b2b'
                  : 'account',
        entityType: params.entityType,
        entityId: params.entityCode || entityIdStr,
        description: `${params.entityType} (${params.entityCode || entityIdStr}) moved from "${params.previousStatus}" to "${params.newStatus}"${params.reason ? `: ${params.reason}` : ''}`,
        metadata: {
          previousStatus: params.previousStatus,
          newStatus: params.newStatus,
          reason: params.reason || '',
          adminEmail: params.adminEmail,
        },
      })
      .catch((err) => {
        console.error('[CustomerActivityLog] Failed to insert log:', err);
      });
  }

  if (inserted) {
    await syncRecordStatusHistoryToSupabase({
      sourceId: inserted.id,
      entityType: params.entityType,
      entityId: entityIdStr,
      entityCode: params.entityCode || '',
      customerId: params.customerId || '',
      userUid: params.userUid || params.customerId || '',
      previousStatus: params.previousStatus,
      newStatus: params.newStatus,
      actionType: params.actionType,
      reason: params.reason || '',
      adminId: params.adminId || params.adminEmail,
      adminEmail: params.adminEmail,
      originalRecord: params.originalRecord || {},
      metadata: params.metadata || {},
    });
  }

  if (params.userUid) {
    await syncActivityLogToSupabase({
      userUid: params.userUid,
      customerId: params.customerId || '',
      action: `${params.entityType}_${params.actionType}`,
      entityType: params.entityType,
      entityId: params.entityCode || entityIdStr,
      details: {
        previousStatus: params.previousStatus,
        newStatus: params.newStatus,
        reason: params.reason || '',
      },
    });
  }

  return inserted;
}
