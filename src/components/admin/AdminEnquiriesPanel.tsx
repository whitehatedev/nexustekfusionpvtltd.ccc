import React, { useCallback, useEffect, useState } from 'react';
import {
  Download,
  ExternalLink,
  Filter,
  Loader2,
  Mail,
  MessageSquare,
  Paperclip,
  Phone,
  RefreshCw,
  Search,
  Send,
  UserCheck,
  X,
} from 'lucide-react';
import { usePlatform } from '../../context/PlatformContext';

export interface UnifiedEnquiryItem {
  uidKey: string;
  source: 'product' | 'support' | 'project' | 'pcb' | 'b2b';
  sourceId: number;
  enquiryNumber: string;
  customerId: string;
  userId: number | null;
  customerName: string;
  customerEmail: string;
  phone: string;
  category: string;
  subject: string;
  description: string;
  attachments: Array<{ originalName: string; storagePath: string; sizeBytes?: number }>;
  priority: string;
  assignedStaff: string;
  status: string;
  internalNotes: string;
  replies: Array<{
    sender: string;
    role: string;
    message: string;
    attachments?: Array<{ originalName: string; storagePath: string; sizeBytes?: number }>;
    timestamp: string;
  }>;
  createdAt: string;
  updatedAt: string;
  meta?: Record<string, any>;
}

const ENQUIRY_CATEGORIES = [
  'General Enquiry',
  'Product Enquiry',
  'Drone Manufacturing',
  'Custom Drone Development',
  'Engineering Services',
  '3D Printing',
  'Robotics',
  'AI & Software Development',
  'Bulk Orders',
  'Technical Support',
  'Other',
];

const ENQUIRY_STATUSES = [
  'New',
  'Under Review',
  'Contacted',
  'Quotation Sent',
  'In Discussion',
  'Approved',
  'Rejected',
  'Closed',
];

const PRIORITY_OPTIONS = ['Low', 'Normal', 'High', 'Urgent'];

function PriorityBadge({ priority }: { priority: string }) {
  const norm = (priority || 'Normal').toLowerCase();
  const cls =
    norm === 'urgent'
      ? 'bg-red-50 text-red-700 border-red-200'
      : norm === 'high'
        ? 'bg-amber-50 text-amber-800 border-amber-200'
        : norm === 'low'
          ? 'bg-slate-50 text-slate-600 border-slate-200'
          : 'bg-[#F0F8FF] text-[#123B5D] border-[#DCEAF5]';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded border text-[10px] font-semibold ${cls}`}>
      {priority || 'Normal'}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const norm = (status || 'New').toLowerCase();
  const cls =
    norm === 'new' || norm === 'open' || norm === 'submitted'
      ? 'bg-sky-50 text-sky-800 border-sky-200'
      : norm === 'approved' || norm === 'closed' || norm === 'resolved'
        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
        : norm === 'rejected'
          ? 'bg-red-50 text-red-700 border-red-200'
          : 'bg-amber-50 text-amber-800 border-amber-200';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded border text-[10px] font-semibold ${cls}`}>
      {status || 'New'}
    </span>
  );
}

interface Props {
  realtimeTick?: number;
  onViewCustomerProfile?: (customerCodeOrEmail: string) => void;
  onOverviewRefresh?: () => void;
}

export const AdminEnquiriesPanel: React.FC<Props> = ({
  realtimeTick = 0,
  onViewCustomerProfile,
  onOverviewRefresh,
}) => {
  const { apiFetch, getIdToken, notify } = usePlatform();

  const [items, setItems] = useState<UnifiedEnquiryItem[]>([]);
  const [summary, setSummary] = useState({ total: 0, newCount: 0, pendingCount: 0, respondedCount: 0 });
  const [filterOptions, setFilterOptions] = useState<{ categories: string[]; statuses: string[]; staff: string[] }>({
    categories: [],
    statuses: [],
    staff: [],
  });
  const [pagination, setPagination] = useState({ page: 1, pageSize: 20, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);

  // Detail modal state
  const [activeEnq, setActiveEnq] = useState<UnifiedEnquiryItem | null>(null);
  const [editStatus, setEditStatus] = useState('New');
  const [editPriority, setEditPriority] = useState('Normal');
  const [editCategory, setEditCategory] = useState('General Enquiry');
  const [editStaff, setEditStaff] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editRejectionReason, setEditRejectionReason] = useState('');
  const [archiveReasonInput, setArchiveReasonInput] = useState('');
  const [savingMeta, setSavingMeta] = useState(false);
  const [archivingEnq, setArchivingEnq] = useState(false);

  // Reply composer
  const [replyText, setReplyText] = useState('');
  const [replyStatus, setReplyStatus] = useState('');
  const [replyFiles, setReplyFiles] = useState<File[]>([]);
  const [sendEmailNotif, setSendEmailNotif] = useState(true);
  const [sendingReply, setSendingReply] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput.trim()), 240);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, sourceFilter, categoryFilter, statusFilter, priorityFilter, dateFrom, dateTo]);

  const buildQueryString = useCallback(
    (includePaging = true) => {
      const qs = new URLSearchParams();
      if (debouncedSearch) qs.set('search', debouncedSearch);
      if (sourceFilter !== 'all') qs.set('source', sourceFilter);
      if (categoryFilter !== 'all') qs.set('category', categoryFilter);
      if (statusFilter !== 'all') qs.set('status', statusFilter);
      if (priorityFilter !== 'all') qs.set('priority', priorityFilter);
      if (dateFrom) qs.set('dateFrom', dateFrom);
      if (dateTo) qs.set('dateTo', dateTo);
      if (includePaging) {
        qs.set('page', String(page));
        qs.set('pageSize', '20');
      }
      return qs.toString();
    },
    [debouncedSearch, sourceFilter, categoryFilter, statusFilter, priorityFilter, dateFrom, dateTo, page]
  );

  const loadEnquiries = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      else setRefreshing(true);
      try {
        const res = await apiFetch<{
          items: UnifiedEnquiryItem[];
          pagination: typeof pagination;
          summary: typeof summary;
          filterOptions: typeof filterOptions;
        }>(`/api/admin/enquiries?${buildQueryString(true)}`);
        setItems(res.items || []);
        if (res.pagination) setPagination(res.pagination);
        if (res.summary) setSummary(res.summary);
        if (res.filterOptions) setFilterOptions(res.filterOptions);

        // Keep active modal synchronized if open
        if (activeEnq) {
          const updatedMatch = (res.items || []).find((i) => i.uidKey === activeEnq.uidKey);
          if (updatedMatch) {
            setActiveEnq(updatedMatch);
          }
        }
      } catch (err: any) {
        notify(err?.message || 'Failed to load unified customer enquiries.', 'error');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [apiFetch, buildQueryString, notify, activeEnq]
  );

  useEffect(() => {
    loadEnquiries(items.length > 0);
  }, [page, debouncedSearch, sourceFilter, categoryFilter, statusFilter, priorityFilter, dateFrom, dateTo, realtimeTick]);

  const openEnquiryDetail = (enq: UnifiedEnquiryItem) => {
    setActiveEnq(enq);
    setEditStatus(enq.status || 'New');
    setEditPriority(enq.priority || 'Normal');
    setEditCategory(enq.category || 'General Enquiry');
    setEditStaff(enq.assignedStaff || '');
    setEditNotes(enq.internalNotes || '');
    setEditRejectionReason('');
    setArchiveReasonInput('');
    setReplyText('');
    setReplyStatus('');
    setReplyFiles([]);
    setSendEmailNotif(true);
  };

  const handleSaveEnquiryMeta = async () => {
    if (!activeEnq) return;
    if (editStatus === 'Rejected' && !editRejectionReason.trim()) {
      notify('Please enter a mandatory rejection reason before marking this enquiry Rejected.', 'error');
      return;
    }
    setSavingMeta(true);
    try {
      await apiFetch(`/api/admin/enquiries/${activeEnq.source}/${activeEnq.sourceId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: editStatus,
          priority: editPriority,
          category: editCategory,
          assignedStaff: editStaff.trim(),
          internalNotes: editNotes,
          ...(editStatus === 'Rejected' ? { rejectionReason: editRejectionReason.trim() } : {}),
        }),
      });
      notify(`Updated ${activeEnq.enquiryNumber}.`, 'success');
      await loadEnquiries(true);
      onOverviewRefresh?.();
    } catch (err: any) {
      notify(err?.message || 'Failed to update enquiry metadata.', 'error');
    } finally {
      setSavingMeta(false);
    }
  };

  const handleArchiveEnquiry = async () => {
    if (!activeEnq) return;
    const reason = archiveReasonInput.trim();
    if (!reason) {
      notify('Enter an archive reason to remove this enquiry from the active queue.', 'error');
      return;
    }
    setArchivingEnq(true);
    try {
      await apiFetch(`/api/admin/enquiries/${activeEnq.source}/${activeEnq.sourceId}`, {
        method: 'DELETE',
        body: JSON.stringify({ reason }),
      });
      notify(`${activeEnq.enquiryNumber} archived safely with original record preserved.`, 'info');
      setActiveEnq(null);
      await loadEnquiries(true);
      onOverviewRefresh?.();
    } catch (err: any) {
      notify(err?.message || 'Failed to archive enquiry.', 'error');
    } finally {
      setArchivingEnq(false);
    }
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeEnq) return;
    if (!replyText.trim() && replyFiles.length === 0) {
      return notify('Enter a response message or attach a quotation/document.', 'error');
    }
    setSendingReply(true);
    try {
      const fd = new FormData();
      fd.append('message', replyText.trim());
      if (replyStatus) fd.append('status', replyStatus);
      fd.append('priority', editPriority);
      fd.append('assignedStaff', editStaff.trim());
      fd.append('internalNotes', editNotes);
      fd.append('sendEmail', sendEmailNotif ? 'true' : 'false');
      replyFiles.forEach((f) => fd.append('attachments', f));

      const res = await apiFetch<{ ok: boolean; status: string }>(
        `/api/admin/enquiries/${activeEnq.source}/${activeEnq.sourceId}/reply`,
        {
          method: 'POST',
          body: fd,
        }
      );

      notify(
        `Reply sent for ${activeEnq.enquiryNumber}${sendEmailNotif ? ' (email dispatched)' : ''}. Status: ${res.status}`,
        'success'
      );
      setReplyText('');
      setReplyFiles([]);
      setReplyStatus('');
      setEditStatus(res.status);
      await loadEnquiries(true);
      onOverviewRefresh?.();
    } catch (err: any) {
      notify(err?.message || 'Failed to send reply.', 'error');
    } finally {
      setSendingReply(false);
    }
  };

  const downloadAttachment = async (storagePath: string, originalName: string) => {
    try {
      const token = await getIdToken();
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      const resp = await fetch(`/api/admin/enquiries/attachment?path=${encodeURIComponent(storagePath)}`, {
        headers,
        credentials: 'include',
      });
      if (!resp.ok) throw new Error('Attachment unavailable on server.');
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = originalName || 'attachment';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      notify(err?.message || 'Failed to download attachment.', 'error');
    }
  };

  const exportCsv = async () => {
    try {
      const token = await getIdToken();
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      const resp = await fetch(`/api/admin/enquiries/export?${buildQueryString(false)}`, {
        headers,
        credentials: 'include',
      });
      if (!resp.ok) throw new Error('Export failed.');
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `nexustekfusion-enquiries-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      notify('Enquiries exported to CSV.', 'success');
    } catch (err: any) {
      notify(err?.message || 'Unable to export enquiries CSV.', 'error');
    }
  };

  const allCategoryChoices = Array.from(new Set([...ENQUIRY_CATEGORIES, ...filterOptions.categories]));
  const allStatusChoices = Array.from(new Set([...ENQUIRY_STATUSES, ...filterOptions.statuses]));

  return (
    <div className="space-y-5 text-xs text-[#263746]">
      {/* KPI Telemetry Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Total Enquiries', value: summary.total, tone: 'text-[#123B5D]' },
          { label: 'New Enquiries', value: summary.newCount, tone: 'text-sky-700' },
          { label: 'Pending Action', value: summary.pendingCount, tone: 'text-amber-700' },
          { label: 'Responded / Quoted', value: summary.respondedCount, tone: 'text-emerald-700' },
        ].map((card) => (
          <div key={card.label} className="rounded-xl border border-[#DCEAF5] bg-[#F0F8FF]/70 px-4 py-3">
            <div className="text-[11px] font-medium text-[#263746]/70">{card.label}</div>
            <div className={`font-mono text-xl font-bold tabular-nums mt-0.5 ${card.tone}`}>{card.value}</div>
          </div>
        ))}
      </div>

      {/* Main Container */}
      <div className="rounded-xl border border-[#DCEAF5] bg-white shadow-sm overflow-hidden">
        <div className="p-4 sm:p-5 bg-[#F0F8FF]/60 border-b border-[#DCEAF5] space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-bold text-[#123B5D]">
                Unified Customer Enquiries Desk
              </h2>
              <p className="text-[11px] text-[#263746]/75 mt-0.5">
                All website enquiries across KRASHIVANTRI Drones, Engineering Projects, PCB Fabrication, B2B Bulk RFQs, and Support.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => loadEnquiries(true)}
                disabled={refreshing}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] font-semibold transition-colors disabled:opacity-60"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                Refresh
              </button>
              <button
                type="button"
                onClick={exportCsv}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] font-semibold transition-colors"
              >
                <Download className="w-3.5 h-3.5 text-[#42A5F5]" />
                Export Enquiries CSV
              </button>
            </div>
          </div>

          {/* Search & Filters */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-2.5">
            <div className="sm:col-span-2 relative">
              <Search className="w-3.5 h-3.5 text-[#42A5F5] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search ID, Customer ID, email, phone, subject..."
                className="w-full pl-8 pr-3 py-2 rounded-lg border border-[#90CAF9] bg-white text-[#123B5D] focus:outline-none focus:border-[#42A5F5]"
              />
            </div>

            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="rounded-lg border border-[#DCEAF5] bg-white px-2.5 py-2 font-medium text-[#123B5D]"
            >
              <option value="all">All Channels</option>
              <option value="product">Product &amp; Drone</option>
              <option value="project">Engineering Projects</option>
              <option value="pcb">PCB Fabrication</option>
              <option value="b2b">B2B Bulk RFQ</option>
              <option value="support">Contact / Support</option>
            </select>

            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="rounded-lg border border-[#DCEAF5] bg-white px-2.5 py-2 font-medium text-[#123B5D]"
            >
              <option value="all">All Categories</option>
              {allCategoryChoices.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-[#DCEAF5] bg-white px-2.5 py-2 font-medium text-[#123B5D]"
            >
              <option value="all">All Statuses</option>
              {allStatusChoices.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>

            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="rounded-lg border border-[#DCEAF5] bg-white px-2.5 py-2 font-medium text-[#123B5D]"
            >
              <option value="all">All Priorities</option>
              {PRIORITY_OPTIONS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>

            <div className="flex items-center gap-1">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                title="From Date"
                className="w-1/2 rounded-lg border border-[#DCEAF5] bg-white px-2 py-2 font-mono text-[11px]"
              />
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                title="To Date"
                className="w-1/2 rounded-lg border border-[#DCEAF5] bg-white px-2 py-2 font-mono text-[11px]"
              />
            </div>
          </div>

          {(debouncedSearch || sourceFilter !== 'all' || categoryFilter !== 'all' || statusFilter !== 'all' || priorityFilter !== 'all' || dateFrom || dateTo) && (
            <div className="flex items-center justify-between text-[11px] text-[#123B5D]">
              <span className="inline-flex items-center gap-1">
                <Filter className="w-3.5 h-3.5 text-[#42A5F5]" />
                Showing {pagination.total} matching enquiry record(s)
              </span>
              <button
                type="button"
                onClick={() => {
                  setSearchInput('');
                  setDebouncedSearch('');
                  setSourceFilter('all');
                  setCategoryFilter('all');
                  setStatusFilter('all');
                  setPriorityFilter('all');
                  setDateFrom('');
                  setDateTo('');
                }}
                className="text-[#1E88E5] font-semibold hover:underline"
              >
                Clear All Filters
              </button>
            </div>
          )}
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] border-collapse text-left">
            <thead>
              <tr className="bg-[#F0F8FF] border-b border-[#DCEAF5] text-[11px] font-semibold uppercase tracking-wider text-[#123B5D]">
                <th className="py-3 px-3">Enquiry ID</th>
                <th className="py-3 px-3">Customer</th>
                <th className="py-3 px-3">Category</th>
                <th className="py-3 px-3">Subject &amp; Brief</th>
                <th className="py-3 px-3">Priority</th>
                <th className="py-3 px-3">Assigned Staff</th>
                <th className="py-3 px-3">Status</th>
                <th className="py-3 px-3">Submitted</th>
                <th className="py-3 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#DCEAF5]">
              {loading ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-[#263746]/70">
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-[#42A5F5]" />
                      Loading unified customer enquiries...
                    </span>
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-[#263746]/70">
                    No customer enquiries match the current filters.
                  </td>
                </tr>
              ) : (
                items.map((enq) => (
                  <tr key={enq.uidKey} className="bg-white hover:bg-[#F7FBFF] transition-colors">
                    <td className="py-3 px-3 align-top whitespace-nowrap">
                      <div className="font-mono font-bold text-[#123B5D]">{enq.enquiryNumber}</div>
                      <div className="text-[10px] font-mono uppercase text-[#42A5F5] mt-0.5">{enq.source}</div>
                    </td>
                    <td className="py-3 px-3 align-top">
                      <div className="font-semibold text-[#123B5D]">{enq.customerName || '—'}</div>
                      <div className="font-mono text-[11px] text-[#263746]/80">{enq.customerEmail}</div>
                      <div className="flex flex-wrap items-center gap-2 mt-0.5 text-[10px] font-mono text-[#263746]/70">
                        {enq.customerId && (
                          <span className="px-1.5 py-0.5 rounded bg-[#F0F8FF] border border-[#DCEAF5] text-[#123B5D] font-bold">
                            {enq.customerId}
                          </span>
                        )}
                        {enq.phone && <span>{enq.phone}</span>}
                      </div>
                    </td>
                    <td className="py-3 px-3 align-top whitespace-nowrap font-medium text-[#123B5D]">
                      {enq.category}
                    </td>
                    <td className="py-3 px-3 align-top max-w-xs">
                      <div className="font-semibold text-[#123B5D] line-clamp-1">{enq.subject}</div>
                      <div className="text-[11px] text-[#263746]/75 line-clamp-2 mt-0.5">{enq.description}</div>
                      {enq.attachments.length > 0 && (
                        <div className="inline-flex items-center gap-1 mt-1 text-[10px] font-mono text-[#1E88E5]">
                          <Paperclip className="w-3 h-3" /> {enq.attachments.length} file(s)
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-3 align-top whitespace-nowrap">
                      <PriorityBadge priority={enq.priority} />
                    </td>
                    <td className="py-3 px-3 align-top whitespace-nowrap text-[#123B5D]">
                      {enq.assignedStaff || <span className="text-[#263746]/45">Unassigned</span>}
                    </td>
                    <td className="py-3 px-3 align-top whitespace-nowrap">
                      <StatusBadge status={enq.status} />
                    </td>
                    <td className="py-3 px-3 align-top whitespace-nowrap font-mono text-[11px] text-[#263746]/75">
                      {new Date(enq.createdAt).toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </td>
                    <td className="py-3 px-3 align-top whitespace-nowrap text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => openEnquiryDetail(enq)}
                          className="px-3 py-1.5 rounded-lg bg-[#64B5F6] hover:bg-[#42A5F5] text-white font-semibold inline-flex items-center gap-1 transition-colors"
                        >
                          <MessageSquare className="w-3.5 h-3.5" /> Open &amp; Reply
                        </button>
                        {onViewCustomerProfile && (enq.customerId || enq.customerEmail) && (
                          <button
                            type="button"
                            onClick={() => onViewCustomerProfile(enq.customerId || enq.customerEmail)}
                            title="View Customer Profile"
                            className="p-1.5 rounded-lg border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D]"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="px-4 py-3 border-t border-[#DCEAF5] bg-[#F0F8FF]/40 flex flex-wrap items-center justify-between gap-2 text-[11px]">
          <div className="font-mono text-[#263746]/80">
            Page {pagination.page} of {pagination.totalPages} ({pagination.total} total enquiries)
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={pagination.page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-3 py-1 rounded border border-[#90CAF9] bg-white text-[#123B5D] font-semibold disabled:opacity-50"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
              className="px-3 py-1 rounded border border-[#90CAF9] bg-white text-[#123B5D] font-semibold disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Full Enquiry Detail, Staff Assignment & Quotation Reply Modal */}
      {activeEnq && (
        <div
          className="fixed inset-0 z-50 bg-[#123B5D]/40 backdrop-blur-[2px] flex items-center justify-center p-4"
          onClick={() => setActiveEnq(null)}
        >
          <div
            className="bg-white rounded-xl border border-[#DCEAF5] max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-6 py-4 bg-[#F0F8FF] border-b border-[#DCEAF5] flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
                  <span className="font-bold text-[#123B5D]">{activeEnq.enquiryNumber}</span>
                  <span className="text-[#42A5F5] uppercase font-bold">· {activeEnq.source}</span>
                  {activeEnq.customerId && (
                    <span className="px-2 py-0.5 rounded bg-white border border-[#90CAF9] text-[#123B5D] font-bold">
                      {activeEnq.customerId}
                    </span>
                  )}
                  <StatusBadge status={activeEnq.status} />
                  <PriorityBadge priority={activeEnq.priority} />
                </div>
                <h3 className="font-display text-lg font-bold text-[#123B5D]">{activeEnq.subject}</h3>
                <div className="flex flex-wrap items-center gap-4 text-[11px] text-[#263746]">
                  <span className="font-semibold text-[#123B5D]">{activeEnq.customerName}</span>
                  <span className="inline-flex items-center gap-1 font-mono">
                    <Mail className="w-3.5 h-3.5 text-[#42A5F5]" /> {activeEnq.customerEmail}
                  </span>
                  {activeEnq.phone && (
                    <span className="inline-flex items-center gap-1 font-mono">
                      <Phone className="w-3.5 h-3.5 text-[#42A5F5]" /> {activeEnq.phone}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {onViewCustomerProfile && (activeEnq.customerId || activeEnq.customerEmail) && (
                  <button
                    type="button"
                    onClick={() => {
                      const target = activeEnq.customerId || activeEnq.customerEmail;
                      setActiveEnq(null);
                      onViewCustomerProfile(target);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] font-semibold"
                  >
                    <UserCheck className="w-3.5 h-3.5 text-[#42A5F5]" /> View Customer History
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setActiveEnq(null)}
                  className="p-1.5 rounded-lg border border-[#DCEAF5] bg-white text-[#263746] hover:text-[#123B5D]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-5 flex-1">
              {/* Full Enquiry Description */}
              <div className="rounded-lg border border-[#DCEAF5] bg-[#F0F8FF]/40 p-4 space-y-2">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-[#42A5F5]">
                  Customer Enquiry Details · Submitted {new Date(activeEnq.createdAt).toLocaleString('en-IN')}
                </div>
                <p className="text-xs text-[#263746] whitespace-pre-wrap leading-relaxed">
                  {activeEnq.description}
                </p>
                {activeEnq.attachments.length > 0 && (
                  <div className="pt-2 border-t border-[#DCEAF5] flex flex-wrap gap-2">
                    {activeEnq.attachments.map((att, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => downloadAttachment(att.storagePath, att.originalName)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] font-medium"
                      >
                        <Download className="w-3 h-3 text-[#42A5F5]" /> {att.originalName}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Status, Priority, Staff Assignment & Internal Notes */}
              <div className="rounded-lg border border-[#DCEAF5] bg-white p-4 space-y-3">
                <div className="font-display font-bold text-sm text-[#123B5D]">
                  Triage, Assignment &amp; Internal Notes
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                  <div>
                    <label className="block text-[10px] font-semibold uppercase text-[#263746]/70 mb-1">
                      Category
                    </label>
                    <select
                      value={editCategory}
                      onChange={(e) => setEditCategory(e.target.value)}
                      className="w-full rounded-lg border border-[#DCEAF5] px-2.5 py-2 bg-white text-[#123B5D] font-medium"
                    >
                      {allCategoryChoices.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold uppercase text-[#263746]/70 mb-1">
                      Enquiry Status
                    </label>
                    <select
                      value={editStatus}
                      onChange={(e) => setEditStatus(e.target.value)}
                      className="w-full rounded-lg border border-[#DCEAF5] px-2.5 py-2 bg-white text-[#123B5D] font-semibold"
                    >
                      {allStatusChoices.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold uppercase text-[#263746]/70 mb-1">
                      Priority
                    </label>
                    <select
                      value={editPriority}
                      onChange={(e) => setEditPriority(e.target.value)}
                      className="w-full rounded-lg border border-[#DCEAF5] px-2.5 py-2 bg-white text-[#123B5D] font-semibold"
                    >
                      {PRIORITY_OPTIONS.map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold uppercase text-[#263746]/70 mb-1">
                      Assigned Admin / Staff
                    </label>
                    <input
                      value={editStaff}
                      onChange={(e) => setEditStaff(e.target.value)}
                      placeholder="Engineer or staff name"
                      className="w-full rounded-lg border border-[#DCEAF5] px-2.5 py-2 bg-white text-[#123B5D]"
                    />
                  </div>
                </div>
                {editStatus === 'Rejected' && (
                  <input
                    required
                    value={editRejectionReason}
                    onChange={(e) => setEditRejectionReason(e.target.value)}
                    placeholder="Mandatory rejection reason (recorded in audit trail & customer view) *"
                    className="w-full rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-red-900"
                  />
                )}
                <div className="flex flex-wrap gap-2 items-center">
                  <input
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    placeholder="Internal staff notes (hidden from customer)..."
                    className="flex-1 min-w-[240px] rounded-lg border border-[#DCEAF5] px-3 py-2 bg-white text-[#123B5D]"
                  />
                  <button
                    type="button"
                    disabled={savingMeta}
                    onClick={handleSaveEnquiryMeta}
                    className="px-4 py-2 rounded-lg border border-[#90CAF9] bg-[#F0F8FF] hover:bg-[#DCEAF5] text-[#123B5D] font-semibold disabled:opacity-60"
                  >
                    {savingMeta ? 'Saving...' : 'Save Triage & Notes'}
                  </button>
                </div>
                <div className="flex flex-wrap gap-2 items-center pt-2 border-t border-[#DCEAF5]">
                  <input
                    value={archiveReasonInput}
                    onChange={(e) => setArchiveReasonInput(e.target.value)}
                    placeholder="Reason to archive from active queue (original record preserved)..."
                    className="flex-1 min-w-[240px] rounded-lg border border-amber-200 bg-amber-50/40 px-3 py-1.5 text-[#123B5D]"
                  />
                  <button
                    type="button"
                    disabled={archivingEnq}
                    onClick={handleArchiveEnquiry}
                    className="px-3 py-1.5 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 font-semibold disabled:opacity-60"
                  >
                    {archivingEnq ? 'Archiving...' : 'Archive Enquiry'}
                  </button>
                </div>
              </div>

              {/* Conversation & Replies Thread */}
              <div className="space-y-2.5">
                <div className="font-display font-bold text-sm text-[#123B5D]">
                  Replies &amp; Quotations History ({activeEnq.replies.length})
                </div>
                {activeEnq.replies.length === 0 ? (
                  <p className="text-[#263746]/70 italic">No replies sent yet.</p>
                ) : (
                  <div className="space-y-2">
                    {activeEnq.replies.map((r, idx) => (
                      <div
                        key={idx}
                        className={`rounded-lg border p-3 ${
                          r.role === 'admin'
                            ? 'bg-[#F0F8FF] border-[#90CAF9]'
                            : 'bg-white border-[#DCEAF5]'
                        }`}
                      >
                        <div className="flex items-center justify-between text-[10px] text-[#263746]/70 mb-1">
                          <span className="font-bold text-[#123B5D]">
                            {r.sender} ({r.role})
                          </span>
                          <span className="font-mono">
                            {new Date(r.timestamp).toLocaleString('en-IN')}
                          </span>
                        </div>
                        <p className="text-xs text-[#263746] whitespace-pre-wrap">{r.message}</p>
                        {r.attachments && r.attachments.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {r.attachments.map((att, aIdx) => (
                              <button
                                key={aIdx}
                                type="button"
                                onClick={() => downloadAttachment(att.storagePath, att.originalName)}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-[#90CAF9] bg-white text-[#123B5D] text-[11px] hover:bg-[#F0F8FF]"
                              >
                                <Download className="w-3 h-3 text-[#42A5F5]" /> {att.originalName}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Reply & Quotation Upload Form */}
              <form
                onSubmit={handleSendReply}
                className="rounded-xl border border-[#90CAF9] bg-[#F0F8FF]/60 p-4 space-y-3"
              >
                <div className="font-display font-bold text-sm text-[#123B5D]">
                  Send Official Reply / Upload Quotation
                </div>
                <textarea
                  rows={3}
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Write response to customer, pricing details, or next steps..."
                  className="w-full rounded-lg border border-[#DCEAF5] bg-white p-3 text-[#123B5D] focus:outline-none focus:border-[#42A5F5]"
                />
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] font-medium cursor-pointer">
                      <Paperclip className="w-3.5 h-3.5 text-[#42A5F5]" />
                      {replyFiles.length > 0 ? `${replyFiles.length} file(s) attached` : 'Attach Quotation / Docs'}
                      <input
                        type="file"
                        multiple
                        accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx,.csv,.zip,.txt,.stl,.step"
                        onChange={(e) => setReplyFiles(Array.from(e.target.files || []))}
                        className="hidden"
                      />
                    </label>
                    <select
                      value={replyStatus}
                      onChange={(e) => setReplyStatus(e.target.value)}
                      className="rounded-lg border border-[#DCEAF5] bg-white px-2.5 py-1.5 text-[#123B5D] font-medium"
                    >
                      <option value="">Auto-set status on reply</option>
                      {ENQUIRY_STATUSES.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                    <label className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#123B5D] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={sendEmailNotif}
                        onChange={(e) => setSendEmailNotif(e.target.checked)}
                        className="rounded border-[#90CAF9]"
                      />
                      Send Email Notification
                    </label>
                  </div>
                  <button
                    type="submit"
                    disabled={sendingReply}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#42A5F5] hover:bg-[#1E88E5] text-white font-semibold transition-colors disabled:opacity-60"
                  >
                    {sendingReply ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    {sendingReply ? 'Sending...' : 'Send Reply & Sync'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
