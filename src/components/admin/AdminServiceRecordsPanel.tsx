import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Archive,
  CheckCircle2,
  FileText,
  Filter,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Wrench,
} from 'lucide-react';
import { usePlatform } from '../../context/PlatformContext';
import { CloudServiceCatalogItem, ServiceRecordItem } from '../../types/platform';

const SERVICE_STATUSES = [
  'Pending',
  'In Review',
  'Quoted',
  'Approved',
  'In Progress',
  'Completed',
  'Rejected',
  'Archived',
];

const SERVICE_CATEGORIES = [
  '3D Printing',
  'PCB Fabrication',
  'Custom Engineering',
  'Drone Repair',
  'Agri Drone Spraying',
  'B2B Hardware',
  'Engineering',
];

interface AdminServiceRecordsPanelProps {
  realtimeTick?: number;
  onViewCustomerProfile?: (customerCode: string) => void;
  onOverviewRefresh?: () => void;
}

export const AdminServiceRecordsPanel: React.FC<AdminServiceRecordsPanelProps> = ({
  realtimeTick = 0,
  onViewCustomerProfile,
  onOverviewRefresh,
}) => {
  const { apiFetch, notify } = usePlatform();
  const [records, setRecords] = useState<ServiceRecordItem[]>([]);
  const [catalog, setCatalog] = useState<CloudServiceCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [includeArchived, setIncludeArchived] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({
    serviceCode: '',
    customerEmail: '',
    customerId: '',
    serviceName: '',
    category: 'Custom Engineering',
    specifications: '',
    description: '',
    quantity: 1,
    unitPriceInr: 0,
    taxInr: 0,
    totalAmountInr: 0,
    assignedTeam: '',
    adminRemarks: '',
    status: 'Pending',
  });

  const [drafts, setDrafts] = useState<
    Record<
      number,
      {
        status: string;
        assignedTeam: string;
        adminRemarks: string;
        unitPriceInr: string;
        taxInr: string;
        totalAmountInr: string;
        busy?: boolean;
      }
    >
  >({});

  const [archiveModal, setArchiveModal] = useState<ServiceRecordItem | null>(null);
  const [archiveReason, setArchiveReason] = useState('');
  const [archiving, setArchiving] = useState(false);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{
        serviceRecords: ServiceRecordItem[];
        services: CloudServiceCatalogItem[];
      }>('/api/admin/service-records?includeArchived=true');
      const rows = Array.isArray(res.serviceRecords) ? res.serviceRecords : [];
      setRecords(rows);
      setCatalog(Array.isArray(res.services) ? res.services : []);
      setDrafts((prev) => {
        const next = { ...prev };
        for (const r of rows) {
          if (!next[r.id]) {
            next[r.id] = {
              status: r.status || 'Pending',
              assignedTeam: r.assignedTeam || '',
              adminRemarks: r.adminRemarks || '',
              unitPriceInr: String(r.unitPriceInr ?? 0),
              taxInr: String(r.taxInr ?? 0),
              totalAmountInr: String(r.totalAmountInr ?? 0),
            };
          }
        }
        return next;
      });
    } catch (err: any) {
      notify(err?.message || 'Failed to load service records.', 'error');
    } finally {
      setLoading(false);
    }
  }, [apiFetch, notify]);

  useEffect(() => {
    loadRecords();
  }, [loadRecords, realtimeTick]);

  const filteredRecords = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return records.filter((r) => {
      if (!includeArchived && r.isDeleted) return false;
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (categoryFilter !== 'all' && r.category !== categoryFilter) return false;
      if (!q) return true;
      return (
        String(r.serviceRecordNumber || '').toLowerCase().includes(q) ||
        String(r.customerId || '').toLowerCase().includes(q) ||
        String(r.customerEmail || '').toLowerCase().includes(q) ||
        String(r.serviceName || '').toLowerCase().includes(q) ||
        String(r.assignedTeam || '').toLowerCase().includes(q)
      );
    });
  }, [records, includeArchived, statusFilter, categoryFilter, searchQuery]);

  const handleSelectCatalogItem = (code: string) => {
    const found = catalog.find((c) => c.serviceCode === code);
    if (!found) {
      setCreateForm((prev) => ({ ...prev, serviceCode: code }));
      return;
    }
    const base = Number(found.basePriceInr || 0);
    const gstPct = Number(found.gstPercent ?? 18);
    const qty = Math.max(1, Number(createForm.quantity || 1));
    const tax = Math.round((base * qty * gstPct) / 100);
    setCreateForm((prev) => ({
      ...prev,
      serviceCode: found.serviceCode,
      serviceName: found.name,
      category: found.category || prev.category,
      description: prev.description || found.description || '',
      unitPriceInr: base,
      taxInr: tax,
      totalAmountInr: base * qty + tax,
    }));
  };

  const handleCreateRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.serviceName.trim()) {
      notify('Service name is required.', 'error');
      return;
    }
    setCreating(true);
    try {
      await apiFetch('/api/admin/service-records', {
        method: 'POST',
        body: JSON.stringify(createForm),
      });
      notify('Service record created and synced to cloud database.', 'success');
      setShowCreateForm(false);
      setCreateForm({
        serviceCode: '',
        customerEmail: '',
        customerId: '',
        serviceName: '',
        category: 'Custom Engineering',
        specifications: '',
        description: '',
        quantity: 1,
        unitPriceInr: 0,
        taxInr: 0,
        totalAmountInr: 0,
        assignedTeam: '',
        adminRemarks: '',
        status: 'Pending',
      });
      await loadRecords();
      onOverviewRefresh?.();
    } catch (err: any) {
      notify(err?.message || 'Failed to create service record.', 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleSaveUpdate = async (rec: ServiceRecordItem) => {
    const draft = drafts[rec.id];
    if (!draft) return;
    setDrafts((prev) => ({ ...prev, [rec.id]: { ...draft, busy: true } }));
    try {
      const unitPriceInr = Math.max(0, Number(draft.unitPriceInr || 0));
      const taxInr = Math.max(0, Number(draft.taxInr || 0));
      const computedTotal = Math.max(0, Number(draft.totalAmountInr || 0));
      await apiFetch(`/api/admin/service-records/${rec.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: draft.status,
          assignedTeam: draft.assignedTeam,
          adminRemarks: draft.adminRemarks,
          unitPriceInr,
          taxInr,
          totalAmountInr: computedTotal,
        }),
      });
      notify(`Updated ${rec.serviceRecordNumber} and notified customer.`, 'success');
      await loadRecords();
      onOverviewRefresh?.();
    } catch (err: any) {
      notify(err?.message || 'Failed to update service record.', 'error');
    } finally {
      setDrafts((prev) => ({
        ...prev,
        [rec.id]: { ...(prev[rec.id] || draft), busy: false },
      }));
    }
  };

  const handleConfirmArchive = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!archiveModal) return;
    setArchiving(true);
    try {
      await apiFetch(`/api/admin/service-records/${archiveModal.id}`, {
        method: 'DELETE',
        body: JSON.stringify({
          reason: archiveReason.trim() || 'Archived by Administrator',
        }),
      });
      notify(`Archived ${archiveModal.serviceRecordNumber} cleanly (record preserved).`, 'success');
      setArchiveModal(null);
      setArchiveReason('');
      await loadRecords();
      onOverviewRefresh?.();
    } catch (err: any) {
      notify(err?.message || 'Failed to archive service record.', 'error');
    } finally {
      setArchiving(false);
    }
  };

  return (
    <div className="space-y-6 text-xs">
      <div className="rounded-xl border border-[#DCEAF5] bg-white p-6 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-bold text-[#123B5D] flex items-center gap-2">
              <Wrench className="w-5 h-5 text-[#42A5F5]" />
              Unified Customer Service Records ({records.length})
            </h2>
            <p className="text-xs text-[#263746]/70 mt-0.5">
              Track 3D printing, PCB fabrication, engineering projects, drone repairs, and custom service requests with persistent cloud history.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={loadRecords}
              className="px-3 py-2 rounded-lg border border-[#DCEAF5] bg-white hover:bg-[#F0F8FF] text-[#123B5D] font-semibold inline-flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              type="button"
              onClick={() => setShowCreateForm((v) => !v)}
              className="px-4 py-2 rounded-lg bg-[#64B5F6] hover:bg-[#42A5F5] text-white font-semibold inline-flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              {showCreateForm ? 'Close Form' : 'New Service Record'}
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-2">
          <div className="lg:col-span-2 relative">
            <Search className="w-3.5 h-3.5 text-[#263746]/50 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search service ID, Customer ID, email, service name..."
              className="w-full rounded-lg border border-[#DCEAF5] bg-white pl-8 pr-3 py-2 text-[#263746] focus:outline-none focus:border-[#64B5F6]"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-[#42A5F5] shrink-0" />
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full rounded-lg border border-[#DCEAF5] bg-white px-2.5 py-2 text-[#263746]"
            >
              <option value="all">All Categories</option>
              {SERVICE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full rounded-lg border border-[#DCEAF5] bg-white px-2.5 py-2 text-[#263746]"
          >
            <option value="all">All Statuses</option>
            {SERVICE_STATUSES.map((st) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </select>
          <label className="inline-flex items-center gap-2 rounded-lg border border-[#DCEAF5] bg-[#F0F8FF]/60 px-3 py-2 text-[#123B5D] font-medium cursor-pointer">
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={(e) => setIncludeArchived(e.target.checked)}
              className="rounded border-[#90CAF9]"
            />
            Show Archived History
          </label>
        </div>

        {/* Create Service Record Form */}
        {showCreateForm && (
          <form
            onSubmit={handleCreateRecord}
            className="rounded-xl border border-[#90CAF9] bg-[#F0F8FF]/60 p-5 space-y-4"
          >
            <div className="font-display font-bold text-sm text-[#123B5D]">
              Create Customer Service Record
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="block font-semibold text-[#123B5D] mb-1">Catalog Template</label>
                <select
                  value={createForm.serviceCode}
                  onChange={(e) => handleSelectCatalogItem(e.target.value)}
                  className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 text-[#263746]"
                >
                  <option value="">Custom Service</option>
                  {catalog.map((c) => (
                    <option key={c.serviceCode} value={c.serviceCode}>
                      {c.name} ({c.category})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-semibold text-[#123B5D] mb-1">Service Name *</label>
                <input
                  required
                  value={createForm.serviceName}
                  onChange={(e) => setCreateForm({ ...createForm, serviceName: e.target.value })}
                  placeholder="e.g. Custom Drone Frame CNC"
                  className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 text-[#263746]"
                />
              </div>
              <div>
                <label className="block font-semibold text-[#123B5D] mb-1">Category</label>
                <select
                  value={createForm.category}
                  onChange={(e) => setCreateForm({ ...createForm, category: e.target.value })}
                  className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 text-[#263746]"
                >
                  {SERVICE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-semibold text-[#123B5D] mb-1">Customer Email</label>
                <input
                  type="email"
                  value={createForm.customerEmail}
                  onChange={(e) => setCreateForm({ ...createForm, customerEmail: e.target.value })}
                  placeholder="customer@example.com"
                  className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 text-[#263746]"
                />
              </div>
              <div>
                <label className="block font-semibold text-[#123B5D] mb-1">Customer ID (Optional)</label>
                <input
                  value={createForm.customerId}
                  onChange={(e) => setCreateForm({ ...createForm, customerId: e.target.value })}
                  placeholder="NTF-CUST-..."
                  className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 text-[#263746] font-mono"
                />
              </div>
              <div>
                <label className="block font-semibold text-[#123B5D] mb-1">Quantity</label>
                <input
                  type="number"
                  min={1}
                  value={createForm.quantity}
                  onChange={(e) => setCreateForm({ ...createForm, quantity: Math.max(1, Number(e.target.value || 1)) })}
                  className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 text-[#263746] font-mono"
                />
              </div>
              <div>
                <label className="block font-semibold text-[#123B5D] mb-1">Unit Price (₹)</label>
                <input
                  type="number"
                  min={0}
                  value={createForm.unitPriceInr}
                  onChange={(e) => setCreateForm({ ...createForm, unitPriceInr: Number(e.target.value || 0) })}
                  className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 text-[#263746] font-mono"
                />
              </div>
              <div>
                <label className="block font-semibold text-[#123B5D] mb-1">GST / Tax (₹)</label>
                <input
                  type="number"
                  min={0}
                  value={createForm.taxInr}
                  onChange={(e) => setCreateForm({ ...createForm, taxInr: Number(e.target.value || 0) })}
                  className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 text-[#263746] font-mono"
                />
              </div>
              <div>
                <label className="block font-semibold text-[#123B5D] mb-1">Total Amount (₹)</label>
                <input
                  type="number"
                  min={0}
                  value={createForm.totalAmountInr}
                  onChange={(e) => setCreateForm({ ...createForm, totalAmountInr: Number(e.target.value || 0) })}
                  className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 text-[#263746] font-mono"
                />
              </div>
              <div>
                <label className="block font-semibold text-[#123B5D] mb-1">Assigned Team</label>
                <input
                  value={createForm.assignedTeam}
                  onChange={(e) => setCreateForm({ ...createForm, assignedTeam: e.target.value })}
                  placeholder="e.g. Robotics & PCB Team"
                  className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 text-[#263746]"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block font-semibold text-[#123B5D] mb-1">Specifications</label>
                <input
                  value={createForm.specifications}
                  onChange={(e) => setCreateForm({ ...createForm, specifications: e.target.value })}
                  placeholder="Materials, tolerances, deliverables..."
                  className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 text-[#263746]"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <textarea
                rows={2}
                value={createForm.description}
                onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                placeholder="Scope description..."
                className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 text-[#263746]"
              />
              <textarea
                rows={2}
                value={createForm.adminRemarks}
                onChange={(e) => setCreateForm({ ...createForm, adminRemarks: e.target.value })}
                placeholder="Initial remarks visible to customer..."
                className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 text-[#263746]"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                className="px-4 py-2 rounded-lg border border-[#DCEAF5] bg-white text-[#263746]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={creating}
                className="px-5 py-2 rounded-lg bg-[#64B5F6] hover:bg-[#42A5F5] text-white font-semibold disabled:opacity-50"
              >
                {creating ? 'Creating...' : 'Save Service Record'}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Records List */}
      {loading ? (
        <div className="rounded-xl border border-[#DCEAF5] bg-white p-10 text-center text-[#263746]/70">
          <Loader2 className="w-5 h-5 animate-spin inline-block mr-2 text-[#42A5F5]" />
          Loading cloud service records...
        </div>
      ) : filteredRecords.length === 0 ? (
        <div className="rounded-xl border border-[#DCEAF5] bg-white p-10 text-center text-[#263746]/70">
          No service records match the selected filters.
        </div>
      ) : (
        <div className="space-y-4">
          {filteredRecords.map((rec) => {
            const draft = drafts[rec.id] || {
              status: rec.status || 'Pending',
              assignedTeam: rec.assignedTeam || '',
              adminRemarks: rec.adminRemarks || '',
              unitPriceInr: String(rec.unitPriceInr ?? 0),
              taxInr: String(rec.taxInr ?? 0),
              totalAmountInr: String(rec.totalAmountInr ?? 0),
            };
            return (
              <div
                key={rec.id}
                className={`rounded-xl border p-5 bg-white shadow-sm space-y-4 ${
                  rec.isDeleted ? 'border-amber-200 bg-amber-50/30' : 'border-[#DCEAF5]'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#DCEAF5]/70 pb-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-bold text-sm text-[#123B5D]">
                        {rec.serviceRecordNumber}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-[#F0F8FF] border border-[#DCEAF5] text-[#123B5D] font-semibold">
                        {rec.category}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-blue-50 border border-blue-200 text-blue-700 font-semibold">
                        {rec.status}
                      </span>
                      {rec.isDeleted && (
                        <span className="px-2 py-0.5 rounded bg-amber-100 border border-amber-300 text-amber-800 font-semibold">
                          Archived (Preserved)
                        </span>
                      )}
                    </div>
                    <div className="font-display font-bold text-base text-[#123B5D]">
                      {rec.serviceName} × {rec.quantity}
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-[#263746]/80">
                      {rec.customerId && (
                        <button
                          type="button"
                          onClick={() => onViewCustomerProfile?.(rec.customerId)}
                          className="font-mono font-semibold text-[#1E88E5] hover:underline"
                        >
                          Customer: {rec.customerId}
                        </button>
                      )}
                      {rec.customerEmail && <span>{rec.customerEmail}</span>}
                      {rec.sourceEntityType && (
                        <span className="font-mono text-[11px] text-[#263746]/60">
                          Source: {rec.sourceEntityType} #{rec.sourceEntityId}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right font-mono text-[11px] text-[#263746]/70 space-y-0.5">
                    <div>Created: {new Date(rec.createdAt).toLocaleString('en-IN')}</div>
                    <div>Updated: {new Date(rec.updatedAt).toLocaleString('en-IN')}</div>
                    <div className="text-sm font-bold text-[#123B5D]">
                      Total: ₹{Number(rec.totalAmountInr || 0).toLocaleString('en-IN')}
                    </div>
                  </div>
                </div>

                {(rec.specifications || rec.description) && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-[#F0F8FF]/50 rounded-lg p-3 border border-[#DCEAF5]/80">
                    {rec.specifications && (
                      <div>
                        <span className="font-semibold text-[#123B5D]">Specs: </span>
                        <span className="text-[#263746]">{rec.specifications}</span>
                      </div>
                    )}
                    {rec.description && (
                      <div>
                        <span className="font-semibold text-[#123B5D]">Notes: </span>
                        <span className="text-[#263746]">{rec.description}</span>
                      </div>
                    )}
                  </div>
                )}

                {Array.isArray(rec.uploadedFiles) && rec.uploadedFiles.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {rec.uploadedFiles.map((f, idx) => (
                      <span
                        key={`${rec.id}-file-${idx}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-[#DCEAF5] bg-[#F0F8FF] font-mono text-[11px] text-[#123B5D]"
                      >
                        <FileText className="w-3 h-3 text-[#42A5F5]" />
                        {f.originalName}
                      </span>
                    ))}
                  </div>
                )}

                {rec.isDeleted && rec.archivedReason && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
                    <span className="font-semibold">Archive Reason:</span> {rec.archivedReason}
                    {rec.archivedBy ? ` (by ${rec.archivedBy})` : ''}
                  </div>
                )}

                {/* Inline Admin Management Controls */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5 pt-1">
                  <div>
                    <label className="block text-[11px] font-semibold text-[#123B5D] mb-1">Status</label>
                    <select
                      value={draft.status}
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [rec.id]: { ...draft, status: e.target.value },
                        }))
                      }
                      className="w-full rounded-lg border border-[#DCEAF5] bg-white px-2.5 py-1.5 text-[#263746]"
                    >
                      {SERVICE_STATUSES.map((st) => (
                        <option key={st} value={st}>
                          {st}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-[#123B5D] mb-1">Assigned Team</label>
                    <input
                      value={draft.assignedTeam}
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [rec.id]: { ...draft, assignedTeam: e.target.value },
                        }))
                      }
                      placeholder="e.g. Drone Lab"
                      className="w-full rounded-lg border border-[#DCEAF5] bg-white px-2.5 py-1.5 text-[#263746]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-[#123B5D] mb-1">Unit Price (₹)</label>
                    <input
                      type="number"
                      min={0}
                      value={draft.unitPriceInr}
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [rec.id]: { ...draft, unitPriceInr: e.target.value },
                        }))
                      }
                      className="w-full rounded-lg border border-[#DCEAF5] bg-white px-2.5 py-1.5 font-mono text-[#263746]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-[#123B5D] mb-1">Tax / GST (₹)</label>
                    <input
                      type="number"
                      min={0}
                      value={draft.taxInr}
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [rec.id]: { ...draft, taxInr: e.target.value },
                        }))
                      }
                      className="w-full rounded-lg border border-[#DCEAF5] bg-white px-2.5 py-1.5 font-mono text-[#263746]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-[#123B5D] mb-1">Total (₹)</label>
                    <input
                      type="number"
                      min={0}
                      value={draft.totalAmountInr}
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [rec.id]: { ...draft, totalAmountInr: e.target.value },
                        }))
                      }
                      className="w-full rounded-lg border border-[#DCEAF5] bg-white px-2.5 py-1.5 font-mono text-[#263746]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-[#123B5D] mb-1">Admin Remarks</label>
                    <input
                      value={draft.adminRemarks}
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [rec.id]: { ...draft, adminRemarks: e.target.value },
                        }))
                      }
                      placeholder="Remarks for customer..."
                      className="w-full rounded-lg border border-[#DCEAF5] bg-white px-2.5 py-1.5 text-[#263746]"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2">
                  {!rec.isDeleted && (
                    <button
                      type="button"
                      onClick={() => {
                        setArchiveModal(rec);
                        setArchiveReason('');
                      }}
                      className="px-3 py-1.5 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-800 font-semibold inline-flex items-center gap-1"
                    >
                      <Archive className="w-3.5 h-3.5" />
                      Archive (Keep History)
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={draft.busy}
                    onClick={() => handleSaveUpdate(rec)}
                    className="px-4 py-1.5 rounded-lg bg-[#64B5F6] hover:bg-[#42A5F5] text-white font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {draft.busy ? 'Saving...' : 'Save & Notify Customer'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Soft-Archive Modal */}
      {archiveModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <form
            onSubmit={handleConfirmArchive}
            className="w-full max-w-md rounded-xl border border-[#DCEAF5] bg-white p-6 space-y-4 shadow-xl"
          >
            <h3 className="font-display font-bold text-base text-[#123B5D]">
              Archive Service Record {archiveModal.serviceRecordNumber}
            </h3>
            <p className="text-xs text-[#263746]/80">
              Records are never deleted permanently. Archiving preserves complete pricing, audit logs, and history for both Admin and Customer dashboards.
            </p>
            <div>
              <label className="block font-semibold text-[#123B5D] mb-1">Archive / Closure Reason *</label>
              <textarea
                required
                rows={3}
                value={archiveReason}
                onChange={(e) => setArchiveReason(e.target.value)}
                placeholder="State reason for archiving or rejecting this service..."
                className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 text-[#263746]"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setArchiveModal(null)}
                className="px-4 py-2 rounded-lg border border-[#DCEAF5] bg-white text-[#263746]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={archiving}
                className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold disabled:opacity-50"
              >
                {archiving ? 'Archiving...' : 'Confirm Archive'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
