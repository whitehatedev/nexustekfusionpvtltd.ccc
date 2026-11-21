import { EventEmitter } from 'events';
import { getServerSupabaseClient, getServiceRoleSupabaseClient } from '../lib/supabase-admin.ts';

export type AdminStreamEntityType =
  | 'customer'
  | 'order'
  | 'enquiry'
  | 'project'
  | 'payment'
  | 'invoice'
  | 'notification'
  | 'system';

export interface AdminStreamEventPayload {
  type: AdminStreamEntityType;
  action: string;
  id?: string | number;
  summary?: string;
  customerId?: string;
  timestamp: string;
}

const adminStreamEmitter = new EventEmitter();
adminStreamEmitter.setMaxListeners(200);

export function emitAdminStreamEvent(
  event: Omit<AdminStreamEventPayload, 'timestamp'> & { timestamp?: string }
): void {
  const payload: AdminStreamEventPayload = {
    ...event,
    timestamp: event.timestamp || new Date().toISOString(),
  };
  adminStreamEmitter.emit('admin_event', payload);
}

export function subscribeAdminStream(listener: (payload: AdminStreamEventPayload) => void): () => void {
  adminStreamEmitter.on('admin_event', listener);
  return () => {
    adminStreamEmitter.off('admin_event', listener);
  };
}

function getWriteClient() {
  return getServiceRoleSupabaseClient() || getServerSupabaseClient();
}

export async function syncAdminNotificationToSupabase(notif: {
  sourceId?: number;
  type: string;
  title: string;
  message: string;
  entityType?: string;
  entityId?: string;
  customerId?: string;
  link?: string;
  isRead?: boolean;
  readBy?: string;
  createdAt?: Date | string;
}): Promise<void> {
  const client = getWriteClient();
  if (!client) return;
  try {
    await client.from('admin_notifications').upsert(
      {
        source_id: notif.sourceId ?? null,
        type: notif.type || 'system',
        title: notif.title,
        message: notif.message,
        entity_type: notif.entityType || '',
        entity_id: notif.entityId || '',
        customer_id: notif.customerId || '',
        link: notif.link || '/admin/dashboard',
        is_read: Boolean(notif.isRead),
        read_by: notif.readBy || '',
        created_at: notif.createdAt ? new Date(notif.createdAt).toISOString() : new Date().toISOString(),
      },
      notif.sourceId ? { onConflict: 'source_id' } : undefined
    );
  } catch {
    // Non-blocking sync when Supabase schema isn't applied yet
  }
}

export async function syncAdminNotificationReadToSupabase(params: {
  sourceId?: number;
  markAll?: boolean;
  readBy: string;
}): Promise<void> {
  const client = getWriteClient();
  if (!client) return;
  try {
    if (params.markAll) {
      await client
        .from('admin_notifications')
        .update({ is_read: true, read_by: params.readBy })
        .eq('is_read', false);
    } else if (params.sourceId) {
      await client
        .from('admin_notifications')
        .update({ is_read: true, read_by: params.readBy })
        .eq('source_id', params.sourceId);
    }
  } catch {
    // Non-blocking sync
  }
}
