import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, Check, CheckCheck, Circle, Clock } from 'lucide-react';
import { usePlatform } from '../../context/PlatformContext';
import type { AdminTab } from '../../pages/AdminDashboardPage';

export interface AdminNotificationRecord {
  id: number;
  type: string;
  title: string;
  message: string;
  entityType: string;
  entityId: string;
  customerId: string;
  link: string;
  isRead: boolean;
  readBy: string;
  createdAt: string;
}

interface Props {
  realtimeTick?: number;
  onNavigateTab: (tab: AdminTab) => void;
}

function resolveTabFromNotification(n: AdminNotificationRecord): AdminTab {
  const t = (n.type || '').toLowerCase();
  const et = (n.entityType || '').toLowerCase();
  if (t === 'customer' || et.includes('customer')) return 'customers';
  if (t === 'order' || et.includes('store_order')) return 'store_orders';
  if (et.includes('printing')) return 'printing';
  if (t === 'enquiry' || et.includes('enquiry') || et.includes('support')) return 'enquiries';
  if (t === 'project' || et.includes('project')) return 'projects';
  if (t === 'payment' || et.includes('payment') || et.includes('invoice')) return 'payments_invoices';
  return 'overview';
}

export const AdminNotificationsPopover: React.FC<Props> = ({ realtimeTick = 0, onNavigateTab }) => {
  const { apiFetch, notify } = usePlatform();
  const [open, setOpen] = useState(false);
  const [filterMode, setFilterMode] = useState<'all' | 'unread'>('all');
  const [items, setItems] = useState<AdminNotificationRecord[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ items: AdminNotificationRecord[]; unreadCount: number }>(
        `/api/admin/notifications?limit=40`
      );
      setItems(res.items || []);
      setUnreadCount(Number(res.unreadCount || 0));
    } catch {
      // non-fatal
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications, realtimeTick]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const markOneRead = async (id: number) => {
    try {
      await apiFetch(`/api/admin/notifications/${id}/read`, { method: 'POST' });
      setItems((prev) => prev.map((it) => (it.id === id ? { ...it, isRead: true } : it)));
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {
      // non-fatal
    }
  };

  const markAllRead = async () => {
    try {
      await apiFetch('/api/admin/notifications/read-all', { method: 'POST' });
      setItems((prev) => prev.map((it) => ({ ...it, isRead: true })));
      setUnreadCount(0);
      notify('All admin alerts marked as read.', 'success');
    } catch (err: any) {
      notify(err?.message || 'Unable to mark alerts read.', 'error');
    }
  };

  const visibleItems = filterMode === 'unread' ? items.filter((i) => !i.isRead) : items;

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next) loadNotifications();
        }}
        className="relative inline-flex items-center justify-center p-2 rounded-lg border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] transition-colors"
        aria-label="Admin Notifications"
        title="Admin Real-Time Alerts"
      >
        <Bell className="w-4 h-4 text-[#1E88E5]" />
        {unreadCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white font-mono text-[10px] font-bold flex items-center justify-center shadow">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-xl border border-[#DCEAF5] bg-white shadow-2xl z-50 overflow-hidden">
          <div className="px-4 py-3 bg-[#F0F8FF] border-b border-[#DCEAF5] flex items-center justify-between gap-2">
            <div>
              <div className="font-display font-bold text-sm text-[#123B5D]">Admin Alerts</div>
              <div className="text-[11px] font-mono text-[#263746]/70">
                {unreadCount} unread notification{unreadCount === 1 ? '' : 's'}
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setFilterMode(filterMode === 'all' ? 'unread' : 'all')}
                className="px-2 py-1 rounded border border-[#90CAF9] bg-white text-[11px] font-semibold text-[#123B5D]"
              >
                {filterMode === 'all' ? 'Unread Only' : 'Show All'}
              </button>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={markAllRead}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded bg-[#42A5F5] hover:bg-[#1E88E5] text-white text-[11px] font-semibold"
                >
                  <CheckCheck className="w-3 h-3" /> Read All
                </button>
              )}
            </div>
          </div>

          <div className="max-h-96 overflow-y-auto divide-y divide-[#DCEAF5]">
            {loading && visibleItems.length === 0 ? (
              <div className="p-6 text-center text-xs text-[#263746]/70">Loading notifications...</div>
            ) : visibleItems.length === 0 ? (
              <div className="p-6 text-center text-xs text-[#263746]/70">
                {filterMode === 'unread' ? 'No unread alerts.' : 'No notifications recorded yet.'}
              </div>
            ) : (
              visibleItems.map((n) => (
                <div
                  key={n.id}
                  onClick={() => {
                    if (!n.isRead) markOneRead(n.id);
                    onNavigateTab(resolveTabFromNotification(n));
                    setOpen(false);
                  }}
                  className={`p-3.5 cursor-pointer transition-colors hover:bg-[#F7FBFF] ${
                    !n.isRead ? 'bg-[#F0F8FF]/70' : 'bg-white'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {!n.isRead && <Circle className="w-2 h-2 fill-[#1E88E5] text-[#1E88E5] shrink-0" />}
                      <span className="font-semibold text-xs text-[#123B5D] truncate">{n.title}</span>
                    </div>
                    {!n.isRead && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          markOneRead(n.id);
                        }}
                        title="Mark as read"
                        className="p-1 rounded hover:bg-white text-[#42A5F5] shrink-0"
                      >
                        <Check className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                  <p className="text-[11px] text-[#263746]/80 mt-1 line-clamp-2">{n.message}</p>
                  <div className="flex items-center justify-between gap-2 mt-1.5 text-[10px] font-mono text-[#263746]/60">
                    <span className="uppercase text-[#42A5F5]">{n.type}</span>
                    <span className="inline-flex items-center gap-1">
                      <Clock className="w-2.5 h-2.5" />
                      {new Date(n.createdAt).toLocaleString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
