import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Ban,
  Building2,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Edit3,
  Eye,
  FileSpreadsheet,
  Filter,
  History,
  KeyRound,
  Loader2,
  Mail,
  MapPin,
  Pencil,
  Phone,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserCog,
  UserPlus,
  UserX,
  X,
} from 'lucide-react';
import { usePlatform } from '../../context/PlatformContext';
import { getSupabaseClient } from '../../lib/supabase';
import type {
  CustomerDeletionAuditEntry,
  CustomerDeletionPreview,
  CustomerPermissions,
  StaffCustomerPermissionRow,
} from '../../types/platform';

export interface CustomerRow {
  id: string | number;
  userId?: number | null;
  customerCode: string;
  uid: string;
  authUserId: string | null;
  fullName: string;
  email: string;
  mobile: string;
  companyOrCollege: string;
  fullAddress: string;
  city: string;
  state: string;
  pinCode: string;
  role: string;
  accountStatus: 'Active' | 'Suspended' | 'Deactivated' | string;
  statusReason: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
  addressesCount: number;
  ordersCount: number;
  projectsCount: number;
  enquiriesCount: number;
  totalSpentInr: number;
}

interface CustomerProfileBundle {
  customer: CustomerRow;
  addresses: any[];
  storeOrders: any[];
  printingOrders: any[];
  projectEnquiries: any[];
  projects: any[];
  productEnquiries: any[];
  pcbEnquiries: any[];
  b2bEnquiries?: any[];
  droneRepairs: any[];
  payments: any[];
  invoices: any[];
  supportTickets: any[];
  reviews?: any[];
  customerActivityLogs?: any[];
  activityLogs: any[];
}

interface InlineDraft {
  fullName: string;
  email: string;
  mobile: string;
  companyOrCollege: string;
  fullAddress: string;
  city: string;
  state: string;
  pinCode: string;
  accountStatus: string;
}

interface MigrationStatusState {
  checkedAt: string;
  checkedVia: 'postgres' | 'supabase_rpc' | 'postgrest' | 'unconfigured';
  configured: boolean;
  verified: boolean;
  requiresMigration: boolean;
  customersTableExists: boolean;
  usersTableExists: boolean;
  customerIdHistoryExists: boolean;
  customerPasswordHistoryExists: boolean;
  customersUserIdType: string | null;
  customersUserIdNullable: boolean;
  usersIdType: string | null;
  usersIdUnique?: boolean;
  typesCompatible: boolean;
  fkConstraintName: string | null;
  fkSourceColumn?: string | null;
  fkTargetSchema: string | null;
  fkTargetTable: string | null;
  fkTargetColumn: string | null;
  fkOnDelete: string | null;
  fkValid: boolean;
  missingColumns: string[];
  issues: string[];
  warningMessage: string | null;
}

interface CustomerFormState {
  fullName: string;
  email: string;
  mobile: string;
  companyOrCollege: string;
  fullAddress: string;
  city: string;
  state: string;
  pinCode: string;
  accountStatus: 'Active' | 'Suspended' | 'Deactivated';
  statusReason: string;
}

const EMPTY_FORM: CustomerFormState = {
  fullName: '',
  email: '',
  mobile: '',
  companyOrCollege: '',
  fullAddress: '',
  city: '',
  state: '',
  pinCode: '',
  accountStatus: 'Active',
  statusReason: '',
};

const DEFAULT_FALLBACK_PERMISSIONS: CustomerPermissions = {
  canViewCustomers: true,
  canAddCustomers: false,
  canEditCustomers: false,
  canDeactivateCustomers: false,
  canReactivateCustomers: false,
  canPermanentlyDeleteCustomers: false,
  canViewDeletionHistory: false,
};

function formatDateDisplay(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function StatusIndicator({ status }: { status: string }) {
  const normalized = status || 'Active';
  const dotClass =
    normalized === 'Active'
      ? 'bg-emerald-500'
      : normalized === 'Suspended'
        ? 'bg-amber-500'
        : 'bg-red-500';
  const textClass =
    normalized === 'Active'
      ? 'text-emerald-800'
      : normalized === 'Suspended'
        ? 'text-amber-800'
        : 'text-red-700';

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${textClass}`}>
      <span className={`w-2 h-2 rounded-full shrink-0 ${dotClass}`} />
      <span>{normalized}</span>
    </span>
  );
}

interface Props {
  onOverviewRefresh?: () => void;
  initialOpenCustomerCode?: string;
  onClearInitialCustomerCode?: () => void;
  realtimeTick?: number;
}

export const CustomerManagementPanel: React.FC<Props> = ({
  onOverviewRefresh,
  initialOpenCustomerCode,
  onClearInitialCustomerCode,
  realtimeTick = 0,
}) => {
  const { apiFetch, getIdToken, notify, dbUser, customerPermissions } = usePlatform();

  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [dataSource, setDataSource] = useState<'public.customers' | 'web_platform.customers'>('public.customers');
  const [migrationStatus, setMigrationStatus] = useState<MigrationStatusState | null>(null);
  const [recheckingSchema, setRecheckingSchema] = useState(false);
  const [realtimeActive, setRealtimeActive] = useState(false);
  const [summary, setSummary] = useState({
    total: 0,
    active: 0,
    suspended: 0,
    deactivated: 0,
    totalRevenueInr: 0,
  });
  const [availableStates, setAvailableStates] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // RBAC Permissions & Staff Matrix
  const [myPermissions, setMyPermissions] = useState<CustomerPermissions>(
    () =>
      customerPermissions ||
      (dbUser?.role === 'super_admin'
        ? {
            canViewCustomers: true,
            canAddCustomers: true,
            canEditCustomers: true,
            canDeactivateCustomers: true,
            canReactivateCustomers: true,
            canPermanentlyDeleteCustomers: true,
            canViewDeletionHistory: true,
          }
        : DEFAULT_FALLBACK_PERMISSIONS)
  );
  const [staffRows, setStaffRows] = useState<StaffCustomerPermissionRow[]>([]);
  const [permissionsModalOpen, setPermissionsModalOpen] = useState(false);
  const [savingStaffPermId, setSavingStaffPermId] = useState<number | null>(null);

  // Deletion History Audit Log Modal
  const [deletionHistoryOpen, setDeletionHistoryOpen] = useState(false);
  const [deletionHistoryLoading, setDeletionHistoryLoading] = useState(false);
  const [deletionHistoryLogs, setDeletionHistoryLogs] = useState<CustomerDeletionAuditEntry[]>([]);

  // Search, Filter, Sort State
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [stateFilter, setStateFilter] = useState<string>('all');
  const [regFrom, setRegFrom] = useState<string>('');
  const [regTo, setRegTo] = useState<string>('');
  const [sortBy, setSortBy] = useState<string>('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);

  // Inline Table Row Edit State
  const [editingRowId, setEditingRowId] = useState<string | number | null>(null);
  const [inlineDraft, setInlineDraft] = useState<InlineDraft | null>(null);
  const [savingRowId, setSavingRowId] = useState<string | number | null>(null);

  // Add / Edit Modal State
  const [modalMode, setModalMode] = useState<'add' | 'edit' | null>(null);
  const [modalCustomerId, setModalCustomerId] = useState<string | number | null>(null);
  const [formState, setFormState] = useState<CustomerFormState>(EMPTY_FORM);
  const [formSubmitting, setFormSubmitting] = useState(false);

  // Complete Customer Profile Modal
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileBundle, setProfileBundle] = useState<CustomerProfileBundle | null>(null);
  const [profileTab, setProfileTab] = useState<
    'overview' | 'orders' | 'enquiries' | 'projects' | 'invoices' | 'addresses' | 'reviews' | 'activity'
  >('overview');

  // Option 1: Deactivate Customer Confirmation Modal
  const [deactivateTarget, setDeactivateTarget] = useState<CustomerRow | null>(null);
  const [deactivateReason, setDeactivateReason] = useState('');
  const [deactivating, setDeactivating] = useState(false);

  // Option 2: Permanent Delete Confirmation Modal (with preview + typed Customer ID + 2nd check)
  const [permanentDeleteTarget, setPermanentDeleteTarget] = useState<CustomerRow | null>(null);
  const [permanentPreview, setPermanentPreview] = useState<CustomerDeletionPreview | null>(null);
  const [permanentPreviewLoading, setPermanentPreviewLoading] = useState(false);
  const [confirmCustomerIdInput, setConfirmCustomerIdInput] = useState('');
  const [secondConfirmationChecked, setSecondConfirmationChecked] = useState(false);
  const [permanentDeleteReason, setPermanentDeleteReason] = useState('');
  const [permanentDeleting, setPermanentDeleting] = useState(false);

  // Export Loading
  const [exportingFormat, setExportingFormat] = useState<'csv' | 'xls' | null>(null);

  const isSuperAdmin = dbUser?.role === 'super_admin';
  const isAdminRole = dbUser?.role === 'super_admin' || dbUser?.role === 'admin';
  const canAddCustomers = isSuperAdmin || myPermissions.canAddCustomers;
  const canEditCustomers = isSuperAdmin || myPermissions.canEditCustomers;
  const canDeactivateCustomers = isSuperAdmin || myPermissions.canDeactivateCustomers;
  const canReactivateCustomers = isSuperAdmin || myPermissions.canReactivateCustomers;
  const canPermanentDeleteCustomers = isSuperAdmin || (isAdminRole && myPermissions.canPermanentlyDeleteCustomers);
  const canViewDeletionHistory = isSuperAdmin || myPermissions.canViewDeletionHistory;

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput.trim()), 240);
    return () => clearTimeout(t);
  }, [searchInput]);

  const loadPermissions = useCallback(async () => {
    try {
      const data = await apiFetch<{
        myPermissions?: CustomerPermissions;
        staff?: StaffCustomerPermissionRow[];
      }>('/api/admin/customers/permissions');
      if (data.myPermissions) setMyPermissions(data.myPermissions);
      if (data.staff) setStaffRows(data.staff);
    } catch {
      // non-fatal; server continues to enforce RBAC
    }
  }, [apiFetch]);

  useEffect(() => {
    loadPermissions();
  }, [loadPermissions]);

  const fetchCustomers = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      else setRefreshing(true);
      setLoadError(null);
      try {
        const qs = new URLSearchParams();
        if (debouncedSearch) qs.set('search', debouncedSearch);
        if (statusFilter !== 'all') qs.set('status', statusFilter);
        if (stateFilter !== 'all') qs.set('state', stateFilter);
        if (regFrom) qs.set('regFrom', regFrom);
        if (regTo) qs.set('regTo', regTo);
        qs.set('sortBy', sortBy);
        qs.set('sortDir', sortDir);

        const data = await apiFetch<{
          source?: 'public.customers' | 'web_platform.customers';
          migrationStatus?: MigrationStatusState;
          customers: CustomerRow[];
          summary: typeof summary;
          filterOptions: { states: string[] };
        }>(`/api/admin/customers?${qs.toString()}`);

        if (data.source) setDataSource(data.source);
        if (data.migrationStatus) setMigrationStatus(data.migrationStatus);
        setCustomers(data.customers || []);
        if (data.summary) setSummary(data.summary);
        if (data.filterOptions?.states) setAvailableStates(data.filterOptions.states);
      } catch (err: any) {
        setLoadError(err?.message || 'Unable to load customer records from Supabase.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [apiFetch, debouncedSearch, statusFilter, stateFilter, regFrom, regTo, sortBy, sortDir]
  );

  const recheckMigrationStatus = async () => {
    setRecheckingSchema(true);
    try {
      const nextStatus = await apiFetch<MigrationStatusState>(
        '/api/admin/customers/migration-status?refresh=true'
      );
      setMigrationStatus(nextStatus);
      if (nextStatus.verified) {
        notify('Database schema and customers_user_id_fkey constraint verified.', 'success');
        await fetchCustomers(true);
      } else if (nextStatus.requiresMigration) {
        notify(
          nextStatus.issues[0] || nextStatus.warningMessage || 'Schema migration check failed.',
          'error'
        );
      }
    } catch (err: any) {
      notify(err?.message || 'Failed to verify database schema.', 'error');
    } finally {
      setRecheckingSchema(false);
    }
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, statusFilter, stateFilter, regFrom, regTo, sortBy, sortDir, pageSize]);

  useEffect(() => {
    fetchCustomers(customers.length > 0);
  }, [fetchCustomers]);

  useEffect(() => {
    if (realtimeTick > 0) {
      fetchCustomers(true);
    }
  }, [realtimeTick]);

  useEffect(() => {
    if (!initialOpenCustomerCode) return;
    const needle = initialOpenCustomerCode.trim().toLowerCase();
    if (!needle) return;
    const match = customers.find(
      (c) =>
        String(c.customerCode || '').toLowerCase() === needle ||
        String(c.email || '').toLowerCase() === needle
    );
    if (match) {
      openCustomerProfile(match.id);
      onClearInitialCustomerCode?.();
    } else if (!loading) {
      setSearchInput(initialOpenCustomerCode);
      setDebouncedSearch(initialOpenCustomerCode);
      onClearInitialCustomerCode?.();
    }
  }, [initialOpenCustomerCode, customers, loading]);

  const triggerRefreshAll = useCallback(async () => {
    await fetchCustomers(true);
    onOverviewRefresh?.();
  }, [fetchCustomers, onOverviewRefresh]);

  const refreshRef = useRef(triggerRefreshAll);
  refreshRef.current = triggerRefreshAll;

  const profileIdRef = useRef<string | number | null>(null);
  profileIdRef.current = profileBundle?.customer?.id ?? null;

  // Real-time two-way sync via Server-Sent Events (/api/admin/customers/stream) + browser Supabase Realtime
  useEffect(() => {
    let active = true;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let streamController: AbortController | null = null;

    const scheduleRealtimeRefresh = (eventType?: string, changedId?: string) => {
      if (!active) return;
      if (eventType === 'DELETE' && changedId && profileIdRef.current && String(profileIdRef.current) === String(changedId)) {
        setProfileBundle(null);
      }
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (active) {
          refreshRef.current().catch(() => {});
        }
      }, 220);
    };

    const connectSseStream = async () => {
      if (!active) return;
      streamController = new AbortController();
      try {
        const token = await getIdToken();
        const headers: Record<string, string> = { Accept: 'text/event-stream' };
        if (token) headers.Authorization = `Bearer ${token}`;

        const resp = await fetch('/api/admin/customers/stream', {
          method: 'GET',
          headers,
          credentials: 'include',
          signal: streamController.signal,
        });
        if (!resp.ok || !resp.body) {
          throw new Error('SSE stream unavailable');
        }

        if (active) setRealtimeActive(true);
        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (active) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const frames = buffer.split('\n\n');
          buffer = frames.pop() || '';
          for (const frame of frames) {
            if (!frame.trim() || frame.startsWith(':')) continue;
            const lines = frame.split('\n');
            let eventName = 'message';
            let dataLine = '';
            for (const line of lines) {
              if (line.startsWith('event:')) eventName = line.slice(6).trim();
              else if (line.startsWith('data:')) dataLine += line.slice(5).trim();
            }
            if (eventName === 'customer_change' && dataLine) {
              try {
                const parsed = JSON.parse(dataLine);
                scheduleRealtimeRefresh(parsed?.type, parsed?.id);
              } catch {
                scheduleRealtimeRefresh();
              }
            }
          }
        }
      } catch {
        // Reconnect below if still mounted
      } finally {
        if (active) {
          setRealtimeActive(false);
          reconnectTimer = setTimeout(connectSseStream, 4000);
        }
      }
    };

    connectSseStream();

    // Optional direct browser Supabase Realtime listener for zero-latency Table Editor updates
    const sbClient = getSupabaseClient();
    const channel = sbClient
      ? sbClient
          .channel('admin-public-customers-live')
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'customers' },
            (payload) => {
              const oldId = (payload.old as any)?.id;
              const newId = (payload.new as any)?.id;
              scheduleRealtimeRefresh(payload.eventType, String(oldId || newId || ''));
            }
          )
          .subscribe((status) => {
            if (active && status === 'SUBSCRIBED') {
              setRealtimeActive(true);
            }
          })
      : null;

    return () => {
      active = false;
      if (debounceTimer) clearTimeout(debounceTimer);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (streamController) streamController.abort();
      if (channel && sbClient) {
        sbClient.removeChannel(channel).catch(() => {});
      }
    };
  }, [getIdToken]);

  const handleSortColumn = (col: string) => {
    if (sortBy === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(col);
      setSortDir(col === 'created_at' || col === 'id' ? 'desc' : 'asc');
    }
  };

  const renderSortIcon = (col: string) => {
    if (sortBy !== col) return <ArrowUpDown className="w-3 h-3 text-[#42A5F5]/60 shrink-0" />;
    return sortDir === 'asc' ? (
      <ArrowUp className="w-3 h-3 text-[#123B5D] shrink-0" />
    ) : (
      <ArrowDown className="w-3 h-3 text-[#123B5D] shrink-0" />
    );
  };

  // Start Inline Edit on a Table Row
  const startInlineEdit = (c: CustomerRow) => {
    setEditingRowId(c.id);
    setInlineDraft({
      fullName: c.fullName || '',
      email: c.email || '',
      mobile: c.mobile || '',
      companyOrCollege: c.companyOrCollege || '',
      fullAddress: c.fullAddress || '',
      city: c.city || '',
      state: c.state || '',
      pinCode: c.pinCode || '',
      accountStatus: c.accountStatus || 'Active',
    });
  };

  const cancelInlineEdit = () => {
    setEditingRowId(null);
    setInlineDraft(null);
  };

  const saveInlineEdit = async (id: string | number) => {
    if (!inlineDraft) return;
    if (!inlineDraft.fullName.trim() || inlineDraft.fullName.trim().length < 2) {
      return notify('Full Name must be at least 2 characters.', 'error');
    }
    if (!inlineDraft.email.trim()) {
      return notify('Email Address is required.', 'error');
    }
    if (inlineDraft.pinCode.trim() && !/^[0-9]{4,10}$/.test(inlineDraft.pinCode.trim())) {
      return notify('PIN Code must be 4 to 10 digits.', 'error');
    }

    setSavingRowId(id);
    try {
      await apiFetch(`/api/admin/customers/${encodeURIComponent(String(id))}`, {
        method: 'PATCH',
        body: JSON.stringify(inlineDraft),
      });
      notify('Customer changes saved to Supabase.', 'success');
      setEditingRowId(null);
      setInlineDraft(null);
      await triggerRefreshAll();
    } catch (err: any) {
      notify(err?.message || 'Failed to save customer updates.', 'error');
    } finally {
      setSavingRowId(null);
    }
  };

  // Open Add Modal
  const openAddModal = () => {
    setFormState({ ...EMPTY_FORM });
    setModalCustomerId(null);
    setModalMode('add');
  };

  // Open Edit Modal (Passwordless OTP model)
  const openEditModal = (c: CustomerRow) => {
    setFormState({
      fullName: c.fullName || '',
      email: c.email || '',
      mobile: c.mobile || '',
      companyOrCollege: c.companyOrCollege || '',
      fullAddress: c.fullAddress || '',
      city: c.city || '',
      state: c.state || '',
      pinCode: c.pinCode || '',
      accountStatus:
        c.accountStatus === 'Suspended' || c.accountStatus === 'Deactivated'
          ? c.accountStatus
          : 'Active',
      statusReason: c.statusReason || '',
    });
    setModalCustomerId(c.id);
    setModalMode('edit');
  };

  const handleModalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formState.fullName.trim() || formState.fullName.trim().length < 2) {
      return notify('Full Name is required (min 2 characters).', 'error');
    }
    if (!formState.email.trim()) {
      return notify('Email Address is required.', 'error');
    }
    if (formState.pinCode.trim() && !/^[0-9]{4,10}$/.test(formState.pinCode.trim())) {
      return notify('PIN Code must contain 4 to 10 numeric digits.', 'error');
    }

    setFormSubmitting(true);
    try {
      if (modalMode === 'add') {
        await apiFetch('/api/admin/customers', {
          method: 'POST',
          body: JSON.stringify(formState),
        });
        notify(`New customer profile created in ${dataSource}.`, 'success');
      } else if (modalMode === 'edit' && modalCustomerId) {
        await apiFetch(`/api/admin/customers/${encodeURIComponent(String(modalCustomerId))}`, {
          method: 'PATCH',
          body: JSON.stringify(formState),
        });
        notify(`Customer details updated in ${dataSource}.`, 'success');
      }
      setModalMode(null);
      setModalCustomerId(null);
      await triggerRefreshAll();
    } catch (err: any) {
      notify(err?.message || 'Failed to save customer record.', 'error');
    } finally {
      setFormSubmitting(false);
    }
  };

  // Option 1: Quick Status Transition (Reactivate / Suspend)
  const handleQuickStatusChange = async (
    c: CustomerRow,
    nextStatus: 'Active' | 'Suspended'
  ) => {
    setSavingRowId(c.id);
    try {
      if (nextStatus === 'Active') {
        await apiFetch(`/api/admin/customers/${encodeURIComponent(String(c.id))}/reactivate`, {
          method: 'POST',
          body: JSON.stringify({
            reason: 'Restored to Active from Customer Management Table',
          }),
        });
      } else {
        await apiFetch(`/api/admin/customers/${encodeURIComponent(String(c.id))}`, {
          method: 'PATCH',
          body: JSON.stringify({
            accountStatus: nextStatus,
            statusReason: 'Suspended via Customer Management Table quick action',
          }),
        });
      }
      notify(
        `${c.fullName || c.email} ${nextStatus === 'Active' ? 'restored to Active' : 'suspended'}.`,
        nextStatus === 'Active' ? 'success' : 'info'
      );
      await triggerRefreshAll();
    } catch (err: any) {
      notify(err?.message || 'Failed to update customer status.', 'error');
    } finally {
      setSavingRowId(null);
    }
  };

  // Option 1: Deactivate Customer Modal (preserves all records & financial history)
  const confirmDeactivateCustomer = async () => {
    if (!deactivateTarget) return;
    setDeactivating(true);
    try {
      await apiFetch(`/api/admin/customers/${encodeURIComponent(String(deactivateTarget.id))}/deactivate`, {
        method: 'POST',
        body: JSON.stringify({
          reason: deactivateReason.trim() || 'Deactivated by authorized administrator',
        }),
      });
      notify(
        `${deactivateTarget.fullName || deactivateTarget.email} deactivated. All orders and financial records remain preserved.`,
        'info'
      );
      setDeactivateTarget(null);
      setDeactivateReason('');
      await triggerRefreshAll();
    } catch (err: any) {
      notify(err?.message || 'Failed to deactivate customer.', 'error');
    } finally {
      setDeactivating(false);
    }
  };

  // Option 2: Open Permanent Deletion Modal & Fetch Preview
  const openPermanentDeleteModal = async (c: CustomerRow) => {
    setPermanentDeleteTarget(c);
    setPermanentPreview(null);
    setConfirmCustomerIdInput('');
    setSecondConfirmationChecked(false);
    setPermanentDeleteReason('');
    setPermanentPreviewLoading(true);
    try {
      const data = await apiFetch<{ preview: CustomerDeletionPreview }>(
        `/api/admin/customers/${encodeURIComponent(String(c.id))}/deletion-preview`
      );
      setPermanentPreview(data.preview);
    } catch (err: any) {
      notify(err?.message || 'Unable to load deletion impact preview.', 'error');
      setPermanentDeleteTarget(null);
    } finally {
      setPermanentPreviewLoading(false);
    }
  };

  // Option 2: Execute Permanent Deletion
  const confirmPermanentDelete = async () => {
    if (!permanentDeleteTarget) return;
    const expectedCode = (permanentPreview?.customer.customerCode || permanentDeleteTarget.customerCode || '').trim().toUpperCase();
    if (confirmCustomerIdInput.trim().toUpperCase() !== expectedCode) {
      return notify(`Please enter exact Customer ID "${expectedCode}" to confirm.`, 'error');
    }
    if (!secondConfirmationChecked) {
      return notify('Please check the permanent deletion confirmation box.', 'error');
    }
    setPermanentDeleting(true);
    try {
      const res = await apiFetch<{
        customerCode: string;
        deletedAuthAccount: boolean;
      }>(`/api/admin/customers/${encodeURIComponent(String(permanentDeleteTarget.id))}/permanent`, {
        method: 'DELETE',
        body: JSON.stringify({
          confirmCustomerId: confirmCustomerIdInput.trim().toUpperCase(),
          secondConfirmation: true,
          reason: permanentDeleteReason.trim() || 'Permanently deleted via Admin Console',
        }),
      });
      notify(
        `Customer ${res.customerCode} permanently deleted${res.deletedAuthAccount ? ' (including exclusive auth account)' : ''}. Financial/order records preserved.`,
        'info'
      );
      setPermanentDeleteTarget(null);
      setPermanentPreview(null);
      if (profileBundle?.customer?.id === permanentDeleteTarget.id) {
        setProfileBundle(null);
      }
      await triggerRefreshAll();
    } catch (err: any) {
      notify(err?.message || 'Permanent deletion failed.', 'error');
    } finally {
      setPermanentDeleting(false);
    }
  };

  const openDeletionHistoryModal = async () => {
    setDeletionHistoryOpen(true);
    setDeletionHistoryLoading(true);
    try {
      const res = await apiFetch<{ logs: CustomerDeletionAuditEntry[] }>(
        '/api/admin/customers/deletion-history'
      );
      setDeletionHistoryLogs(res.logs || []);
    } catch (err: any) {
      notify(err?.message || 'Failed to load deletion audit history.', 'error');
    } finally {
      setDeletionHistoryLoading(false);
    }
  };

  const updateStaffPermission = async (
    staffMember: StaffCustomerPermissionRow,
    patch: Partial<CustomerPermissions>
  ) => {
    setSavingStaffPermId(staffMember.userId);
    try {
      const nextPerms: CustomerPermissions = {
        ...staffMember.permissions,
        ...patch,
      };
      if (staffMember.role !== 'admin' && staffMember.role !== 'super_admin') {
        nextPerms.canPermanentlyDeleteCustomers = false;
      }
      const res = await apiFetch<{ permissions: CustomerPermissions }>(
        `/api/admin/customers/permissions/${staffMember.userId}`,
        {
          method: 'PUT',
          body: JSON.stringify(nextPerms),
        }
      );
      setStaffRows((prev) =>
        prev.map((row) =>
          row.userId === staffMember.userId ? { ...row, permissions: res.permissions } : row
        )
      );
      notify(`Updated customer permissions for ${staffMember.fullName || staffMember.email}.`, 'success');
    } catch (err: any) {
      notify(err?.message || 'Failed to update staff permissions.', 'error');
    } finally {
      setSavingStaffPermId(null);
    }
  };

  // View Complete Customer Profile
  const openCustomerProfile = async (customerId: string | number) => {
    setProfileLoading(true);
    setProfileTab('overview');
    try {
      const data = await apiFetch<CustomerProfileBundle>(
        `/api/admin/customers/${encodeURIComponent(String(customerId))}/profile`
      );
      setProfileBundle(data);
    } catch (err: any) {
      notify(err?.message || 'Failed to load full customer profile.', 'error');
    } finally {
      setProfileLoading(false);
    }
  };

  // Export CSV / Excel
  const handleExport = async (format: 'csv' | 'xls') => {
    setExportingFormat(format);
    try {
      const qs = new URLSearchParams();
      qs.set('format', format);
      if (debouncedSearch) qs.set('search', debouncedSearch);
      if (statusFilter !== 'all') qs.set('status', statusFilter);
      if (stateFilter !== 'all') qs.set('state', stateFilter);
      if (regFrom) qs.set('regFrom', regFrom);
      if (regTo) qs.set('regTo', regTo);
      qs.set('sortBy', sortBy);
      qs.set('sortDir', sortDir);

      const token = await getIdToken();
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;

      const resp = await fetch(`/api/admin/customers/export?${qs.toString()}`, {
        method: 'GET',
        headers,
        credentials: 'include',
      });
      if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(errText || 'Export failed.');
      }
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const dateStr = new Date().toISOString().slice(0, 10);
      a.download = `nexustekfusion-customers-${dateStr}.${format === 'xls' ? 'xls' : 'csv'}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      notify(`Customer records exported (${format.toUpperCase()}).`, 'success');
    } catch (err: any) {
      notify(err?.message || `Failed to export ${format.toUpperCase()} file.`, 'error');
    } finally {
      setExportingFormat(null);
    }
  };

  const hasActiveFilters = Boolean(
    debouncedSearch || statusFilter !== 'all' || stateFilter !== 'all' || regFrom || regTo
  );

  const clearAllFilters = () => {
    setSearchInput('');
    setDebouncedSearch('');
    setStatusFilter('all');
    setStateFilter('all');
    setRegFrom('');
    setRegTo('');
    setSortBy('created_at');
    setSortDir('desc');
  };

  const totalOrderRevenue = useMemo(
    () => customers.reduce((sum, c) => sum + (c.totalSpentInr || 0), 0),
    [customers]
  );

  const totalPages = Math.max(1, Math.ceil(customers.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedCustomers = useMemo(() => {
    const startIdx = (safePage - 1) * pageSize;
    return customers.slice(startIdx, startIdx + pageSize);
  }, [customers, safePage, pageSize]);

  const pageStartDisplay = customers.length === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const pageEndDisplay = Math.min(safePage * pageSize, customers.length);

  return (
    <div className="space-y-5 text-xs text-[#263746]">
      {/* Summary Telemetry Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { label: 'Total Customers', value: summary.total, tone: 'text-[#123B5D]' },
          { label: 'Active Accounts', value: summary.active, tone: 'text-emerald-700' },
          { label: 'Suspended', value: summary.suspended, tone: 'text-amber-700' },
          { label: 'Deactivated', value: summary.deactivated, tone: 'text-red-700' },
          {
            label: 'Filtered Revenue',
            value: `₹${totalOrderRevenue.toLocaleString('en-IN')}`,
            tone: 'text-[#123B5D]',
          },
        ].map((metric) => (
          <div
            key={metric.label}
            className="rounded-xl border border-[#DCEAF5] bg-[#F0F8FF]/70 px-4 py-3 flex flex-col justify-between"
          >
            <div className="text-[11px] font-medium text-[#263746]/70">{metric.label}</div>
            <div className={`font-mono text-lg font-bold tabular-nums mt-0.5 ${metric.tone}`}>
              {metric.value}
            </div>
          </div>
        ))}
      </div>

      {/* Main White & Light-Blue Customer Management Container */}
      <div className="rounded-xl border border-[#DCEAF5] bg-white shadow-[0_1px_2px_rgba(18,59,93,0.04)] overflow-hidden">
        {/* Header & Primary Action Toolbar */}
        <div className="p-4 sm:p-5 bg-[#F0F8FF]/60 border-b border-[#DCEAF5] space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-bold text-[#123B5D]">
                Editable Customer Directory
              </h2>
              <p className="text-[11px] text-[#263746]/75 mt-0.5 flex flex-wrap items-center gap-2">
                <span>
                  Authoritative Supabase table (<span className="font-mono text-[#123B5D]">{dataSource}</span>) — click <span className="font-semibold text-[#123B5D]">Edit Row</span> to modify cells inline, inspect full history, or export filtered records.
                </span>
                <span className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold text-[#123B5D]">
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${realtimeActive ? 'bg-emerald-500' : 'bg-[#64B5F6]'}`}
                  />
                  {realtimeActive ? 'Realtime Synced' : 'Live Sync'}
                </span>
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => triggerRefreshAll()}
                disabled={refreshing}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] font-semibold transition-colors disabled:opacity-60"
                title="Refresh customer table from Supabase"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                Refresh
              </button>
              <button
                type="button"
                onClick={() => handleExport('csv')}
                disabled={exportingFormat !== null}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] font-semibold transition-colors disabled:opacity-60"
              >
                {exportingFormat === 'csv' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Download className="w-3.5 h-3.5 text-[#42A5F5]" />
                )}
                Export CSV
              </button>
              <button
                type="button"
                onClick={() => handleExport('xls')}
                disabled={exportingFormat !== null}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] font-semibold transition-colors disabled:opacity-60"
              >
                {exportingFormat === 'xls' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <FileSpreadsheet className="w-3.5 h-3.5 text-[#1E88E5]" />
                )}
                Export Excel
              </button>
              {canViewDeletionHistory && (
                <button
                  type="button"
                  onClick={openDeletionHistoryModal}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] font-semibold transition-colors"
                >
                  <History className="w-3.5 h-3.5 text-[#42A5F5]" />
                  Deletion History
                </button>
              )}
              {isSuperAdmin && (
                <button
                  type="button"
                  onClick={() => {
                    loadPermissions();
                    setPermissionsModalOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] font-semibold transition-colors"
                >
                  <UserCog className="w-3.5 h-3.5 text-[#1E88E5]" />
                  Staff Permissions
                </button>
              )}
              {canAddCustomers && (
                <button
                  type="button"
                  onClick={openAddModal}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#42A5F5] hover:bg-[#1E88E5] text-white font-semibold shadow-sm transition-colors"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  Add Customer
                </button>
              )}
            </div>
          </div>

          {/* Search, Filter & Sort Controls */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 items-center">
            <div className="md:col-span-5 relative">
              <Search className="w-3.5 h-3.5 text-[#42A5F5] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search by Name, Customer ID, Email, Phone, or City..."
                className="w-full pl-8 pr-8 py-2 rounded-lg border border-[#90CAF9] bg-white text-[#123B5D] placeholder:text-[#263746]/50 focus:outline-none focus:border-[#42A5F5]"
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={() => setSearchInput('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#263746]/50 hover:text-[#123B5D]"
                  aria-label="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="md:col-span-2 flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-[#42A5F5] shrink-0" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                aria-label="Filter by account status"
                className="w-full py-2 px-2.5 rounded-lg border border-[#DCEAF5] bg-white text-[#123B5D] focus:outline-none focus:border-[#42A5F5]"
              >
                <option value="all">All Statuses</option>
                <option value="Active">Active</option>
                <option value="Suspended">Suspended</option>
                <option value="Deactivated">Deactivated</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <select
                value={stateFilter}
                onChange={(e) => setStateFilter(e.target.value)}
                aria-label="Filter by state"
                className="w-full py-2 px-2.5 rounded-lg border border-[#DCEAF5] bg-white text-[#123B5D] focus:outline-none focus:border-[#42A5F5]"
              >
                <option value="all">All States</option>
                {availableStates.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-3 flex items-center gap-2">
              <select
                value={`${sortBy}:${sortDir}`}
                onChange={(e) => {
                  const [col, dir] = e.target.value.split(':');
                  setSortBy(col);
                  setSortDir((dir as 'asc' | 'desc') || 'desc');
                }}
                aria-label="Sort customers"
                className="w-full py-2 px-2.5 rounded-lg border border-[#DCEAF5] bg-white text-[#123B5D] focus:outline-none focus:border-[#42A5F5]"
              >
                <option value="created_at:desc">Sort: Newest Registered</option>
                <option value="created_at:asc">Sort: Oldest Registered</option>
                <option value="last_login:desc">Sort: Recent Login</option>
                <option value="full_name:asc">Sort: Name (A–Z)</option>
                <option value="full_name:desc">Sort: Name (Z–A)</option>
                <option value="id:desc">Sort: Customer ID (High–Low)</option>
                <option value="id:asc">Sort: Customer ID (Low–High)</option>
                <option value="city:asc">Sort: City (A–Z)</option>
                <option value="account_status:asc">Sort: Account Status</option>
                <option value="total_spent:desc">Sort: Highest Revenue</option>
              </select>

              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="px-2.5 py-2 rounded-lg border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] font-semibold whitespace-nowrap"
                >
                  Reset
                </button>
              )}
            </div>
          </div>

          {/* Registration Date Range Filter */}
          <div className="flex flex-wrap items-center gap-2.5 text-[11px] text-[#263746]/80">
            <span className="font-semibold text-[#123B5D]">Registration Date:</span>
            <label className="inline-flex items-center gap-1.5">
              <span>From</span>
              <input
                type="date"
                value={regFrom}
                onChange={(e) => setRegFrom(e.target.value)}
                aria-label="Filter registration date from"
                className="py-1.5 px-2 rounded-lg border border-[#DCEAF5] bg-white text-[#123B5D] focus:outline-none focus:border-[#42A5F5]"
              />
            </label>
            <label className="inline-flex items-center gap-1.5">
              <span>To</span>
              <input
                type="date"
                value={regTo}
                onChange={(e) => setRegTo(e.target.value)}
                aria-label="Filter registration date to"
                className="py-1.5 px-2 rounded-lg border border-[#DCEAF5] bg-white text-[#123B5D] focus:outline-none focus:border-[#42A5F5]"
              />
            </label>
          </div>
        </div>

        {/* Verified Migration Warning Banner — shown ONLY when actual DB constraints fail verification */}
        {migrationStatus?.configured && migrationStatus.requiresMigration && !migrationStatus.verified && (
          <div className="p-4 bg-amber-50 border-b border-amber-200 flex flex-col sm:flex-row sm:items-start justify-between gap-3 text-amber-900">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 font-semibold text-[#123B5D]">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  {migrationStatus.warningMessage ||
                    'Database schema migration required: please run supabase/public_customers_sync.sql in Supabase SQL Editor to verify customers_user_id_fkey -> public.users(id) with TEXT user_id.'}
                </span>
              </div>
              {migrationStatus.issues.length > 0 && (
                <ul className="list-disc pl-6 space-y-0.5 text-[11px] text-amber-900/90 font-mono">
                  {migrationStatus.issues.map((issue, idx) => (
                    <li key={idx}>{issue}</li>
                  ))}
                </ul>
              )}
              <div className="pl-6 text-[11px] text-amber-900/80 font-mono flex flex-wrap gap-3">
                <span>
                  customers.user_id: {migrationStatus.customersUserIdType || 'unknown'}
                </span>
                <span>users.id: {migrationStatus.usersIdType || 'unknown'}</span>
                <span>
                  FK:{' '}
                  {migrationStatus.fkConstraintName
                    ? `${migrationStatus.fkConstraintName} -> ${migrationStatus.fkTargetSchema}.${migrationStatus.fkTargetTable}(${migrationStatus.fkTargetColumn})`
                    : 'unverified'}
                </span>
              </div>
            </div>
            <button
              type="button"
              disabled={recheckingSchema}
              onClick={recheckMigrationStatus}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-300 bg-white hover:bg-amber-100/60 text-amber-900 font-semibold whitespace-nowrap shrink-0 disabled:opacity-60"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${recheckingSchema ? 'animate-spin' : ''}`} />
              Re-verify Schema
            </button>
          </div>
        )}

        {/* Verified Migration Success Banner — displayed ONLY after live DB constraint & column type inspection passes */}
        {migrationStatus?.configured && migrationStatus.verified && !migrationStatus.requiresMigration && (
          <div className="px-4 py-2.5 bg-emerald-50 border-b border-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-emerald-900 text-xs">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-800">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                Database Schema Verified
              </span>
              <span className="font-mono text-[11px] text-emerald-900/85">
                {migrationStatus.fkConstraintName}: public.customers({migrationStatus.fkSourceColumn || 'user_id'}: {migrationStatus.customersUserIdType}) → {migrationStatus.fkTargetSchema}.{migrationStatus.fkTargetTable}({migrationStatus.fkTargetColumn}: {migrationStatus.usersIdType}){migrationStatus.fkOnDelete ? ` [ON DELETE ${migrationStatus.fkOnDelete}]` : ''}
              </span>
              <span className="text-[11px] text-emerald-800/80">
                History tables &amp; ID generation verified ({migrationStatus.checkedVia})
              </span>
            </div>
            <button
              type="button"
              disabled={recheckingSchema}
              onClick={recheckMigrationStatus}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-emerald-300 bg-white hover:bg-emerald-100/60 text-emerald-800 font-semibold whitespace-nowrap shrink-0 disabled:opacity-60"
            >
              <RefreshCw className={`w-3 h-3 ${recheckingSchema ? 'animate-spin' : ''}`} />
              Re-verify Schema
            </button>
          </div>
        )}

        {/* Error State */}
        {loadError && (
          <div className="p-4 bg-red-50 border-b border-red-200 flex items-center justify-between gap-3 text-red-700">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{loadError}</span>
            </div>
            <button
              type="button"
              onClick={() => fetchCustomers(false)}
              className="px-3 py-1 rounded border border-red-300 bg-white text-red-700 font-semibold hover:bg-red-50"
            >
              Retry
            </button>
          </div>
        )}

        {/* Responsive Editable Table */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1380px] border-collapse text-left">
            <thead>
              <tr className="bg-[#F0F8FF] border-b border-[#DCEAF5] text-[11px] font-semibold uppercase tracking-wider text-[#123B5D]">
                <th className="py-3 px-3 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => handleSortColumn('id')}
                    className="inline-flex items-center gap-1 hover:text-[#42A5F5]"
                  >
                    Customer ID {renderSortIcon('id')}
                  </button>
                </th>
                <th className="py-3 px-3 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => handleSortColumn('full_name')}
                    className="inline-flex items-center gap-1 hover:text-[#42A5F5]"
                  >
                    Full Name {renderSortIcon('full_name')}
                  </button>
                </th>
                <th className="py-3 px-3 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => handleSortColumn('email')}
                    className="inline-flex items-center gap-1 hover:text-[#42A5F5]"
                  >
                    Email Address {renderSortIcon('email')}
                  </button>
                </th>
                <th className="py-3 px-3 whitespace-nowrap">Phone Number</th>
                <th className="py-3 px-3 whitespace-nowrap">Company / College</th>
                <th className="py-3 px-3 min-w-[190px]">Full Address</th>
                <th className="py-3 px-3 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => handleSortColumn('city')}
                    className="inline-flex items-center gap-1 hover:text-[#42A5F5]"
                  >
                    City {renderSortIcon('city')}
                  </button>
                </th>
                <th className="py-3 px-3 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => handleSortColumn('state')}
                    className="inline-flex items-center gap-1 hover:text-[#42A5F5]"
                  >
                    State {renderSortIcon('state')}
                  </button>
                </th>
                <th className="py-3 px-3 whitespace-nowrap">PIN Code</th>
                <th className="py-3 px-3 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => handleSortColumn('created_at')}
                    className="inline-flex items-center gap-1 hover:text-[#42A5F5]"
                  >
                    Registration Date {renderSortIcon('created_at')}
                  </button>
                </th>
                <th className="py-3 px-3 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => handleSortColumn('last_login')}
                    className="inline-flex items-center gap-1 hover:text-[#42A5F5]"
                  >
                    Last Login {renderSortIcon('last_login')}
                  </button>
                </th>
                <th className="py-3 px-3 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => handleSortColumn('account_status')}
                    className="inline-flex items-center gap-1 hover:text-[#42A5F5]"
                  >
                    Account Status {renderSortIcon('account_status')}
                  </button>
                </th>
                <th className="py-3 px-3 whitespace-nowrap text-center">Orders</th>
                <th className="py-3 px-3 whitespace-nowrap text-center">Enquiries</th>
                <th className="py-3 px-3 whitespace-nowrap text-center">Projects</th>
                <th className="py-3 px-3 text-right whitespace-nowrap sticky right-0 bg-[#F0F8FF] border-l border-[#DCEAF5]">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#DCEAF5]">
              {loading ? (
                <tr>
                  <td colSpan={16} className="py-14 text-center text-[#263746]/70">
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-[#42A5F5]" />
                      Loading customer records from Supabase...
                    </span>
                  </td>
                </tr>
              ) : customers.length === 0 ? (
                <tr>
                  <td colSpan={16} className="py-14 text-center">
                    <div className="max-w-md mx-auto space-y-2">
                      <div className="font-display font-bold text-sm text-[#123B5D]">
                        {hasActiveFilters ? 'No matching customers found' : 'No customer accounts registered yet'}
                      </div>
                      <p className="text-[#263746]/70">
                        {hasActiveFilters
                          ? 'Try adjusting your search keywords, state, or account status filter.'
                          : 'Click "Add Customer" to create your first customer record in Supabase.'}
                      </p>
                      <div className="pt-2">
                        {hasActiveFilters ? (
                          <button
                            type="button"
                            onClick={clearAllFilters}
                            className="px-3 py-1.5 rounded-lg border border-[#90CAF9] bg-[#F0F8FF] text-[#123B5D] font-semibold"
                          >
                            Clear Filters
                          </button>
                        ) : canAddCustomers ? (
                          <button
                            type="button"
                            onClick={openAddModal}
                            className="px-3.5 py-1.5 rounded-lg bg-[#42A5F5] text-white font-semibold"
                          >
                            + Add Customer
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedCustomers.map((c) => {
                  const isEditing = editingRowId === c.id && inlineDraft !== null;
                  const isBusy = savingRowId === c.id;

                  return (
                    <tr
                      key={c.id}
                      className={`transition-colors ${
                        isEditing ? 'bg-[#EAF5FF]' : 'bg-white hover:bg-[#F7FBFF]'
                      }`}
                    >
                      {/* 1. Customer ID */}
                      <td className="py-2.5 px-3 align-middle whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => openCustomerProfile(c.id)}
                          className="text-left group"
                          title={`Inspect complete profile (${c.customerCode})`}
                        >
                          <div className="font-mono font-bold text-[#123B5D] group-hover:text-[#1E88E5] tabular-nums">
                            {c.customerCode}
                          </div>
                        </button>
                      </td>

                      {/* 2. Full Name */}
                      <td className="py-2.5 px-3 align-middle">
                        {isEditing ? (
                          <input
                            type="text"
                            value={inlineDraft.fullName}
                            onChange={(e) =>
                              setInlineDraft({ ...inlineDraft, fullName: e.target.value })
                            }
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveInlineEdit(c.id);
                              if (e.key === 'Escape') cancelInlineEdit();
                            }}
                            className="w-full min-w-[140px] rounded border border-[#64B5F6] bg-white px-2 py-1 text-[#123B5D] focus:outline-none"
                          />
                        ) : (
                          <div className="font-semibold text-[#123B5D] min-w-[130px]">
                            {c.fullName || '—'}
                          </div>
                        )}
                      </td>

                      {/* 3. Email Address */}
                      <td className="py-2.5 px-3 align-middle">
                        {isEditing ? (
                          <input
                            type="email"
                            value={inlineDraft.email}
                            onChange={(e) =>
                              setInlineDraft({ ...inlineDraft, email: e.target.value })
                            }
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveInlineEdit(c.id);
                              if (e.key === 'Escape') cancelInlineEdit();
                            }}
                            className="w-full min-w-[175px] rounded border border-[#64B5F6] bg-white px-2 py-1 font-mono text-[#123B5D] focus:outline-none"
                          />
                        ) : (
                          <div className="font-mono text-[#263746] whitespace-nowrap">
                            {c.email}
                          </div>
                        )}
                      </td>

                      {/* 4. Phone Number */}
                      <td className="py-2.5 px-3 align-middle whitespace-nowrap">
                        {isEditing ? (
                          <input
                            type="tel"
                            value={inlineDraft.mobile}
                            onChange={(e) =>
                              setInlineDraft({ ...inlineDraft, mobile: e.target.value })
                            }
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveInlineEdit(c.id);
                              if (e.key === 'Escape') cancelInlineEdit();
                            }}
                            className="w-[125px] rounded border border-[#64B5F6] bg-white px-2 py-1 font-mono tabular-nums text-[#123B5D] focus:outline-none"
                          />
                        ) : (
                          <span className="font-mono tabular-nums text-[#263746]">
                            {c.mobile || '—'}
                          </span>
                        )}
                      </td>

                      {/* 5. Company / College */}
                      <td className="py-2.5 px-3 align-middle">
                        {isEditing ? (
                          <input
                            type="text"
                            value={inlineDraft.companyOrCollege}
                            onChange={(e) =>
                              setInlineDraft({ ...inlineDraft, companyOrCollege: e.target.value })
                            }
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveInlineEdit(c.id);
                              if (e.key === 'Escape') cancelInlineEdit();
                            }}
                            className="w-full min-w-[140px] rounded border border-[#64B5F6] bg-white px-2 py-1 text-[#123B5D] focus:outline-none"
                          />
                        ) : (
                          <span className="text-[#263746] line-clamp-2 max-w-[160px]">
                            {c.companyOrCollege || '—'}
                          </span>
                        )}
                      </td>

                      {/* 6. Full Address */}
                      <td className="py-2.5 px-3 align-middle">
                        {isEditing ? (
                          <input
                            type="text"
                            value={inlineDraft.fullAddress}
                            onChange={(e) =>
                              setInlineDraft({ ...inlineDraft, fullAddress: e.target.value })
                            }
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveInlineEdit(c.id);
                              if (e.key === 'Escape') cancelInlineEdit();
                            }}
                            placeholder="Street / Flat / Area"
                            className="w-full min-w-[190px] rounded border border-[#64B5F6] bg-white px-2 py-1 text-[#123B5D] focus:outline-none"
                          />
                        ) : (
                          <span
                            title={c.fullAddress || ''}
                            className="text-[#263746] line-clamp-2 max-w-[210px]"
                          >
                            {c.fullAddress || '—'}
                          </span>
                        )}
                      </td>

                      {/* 7. City */}
                      <td className="py-2.5 px-3 align-middle whitespace-nowrap">
                        {isEditing ? (
                          <input
                            type="text"
                            value={inlineDraft.city}
                            onChange={(e) =>
                              setInlineDraft({ ...inlineDraft, city: e.target.value })
                            }
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveInlineEdit(c.id);
                              if (e.key === 'Escape') cancelInlineEdit();
                            }}
                            className="w-[110px] rounded border border-[#64B5F6] bg-white px-2 py-1 text-[#123B5D] focus:outline-none"
                          />
                        ) : (
                          <span>{c.city || '—'}</span>
                        )}
                      </td>

                      {/* 8. State */}
                      <td className="py-2.5 px-3 align-middle whitespace-nowrap">
                        {isEditing ? (
                          <input
                            type="text"
                            value={inlineDraft.state}
                            onChange={(e) =>
                              setInlineDraft({ ...inlineDraft, state: e.target.value })
                            }
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveInlineEdit(c.id);
                              if (e.key === 'Escape') cancelInlineEdit();
                            }}
                            className="w-[115px] rounded border border-[#64B5F6] bg-white px-2 py-1 text-[#123B5D] focus:outline-none"
                          />
                        ) : (
                          <span>{c.state || '—'}</span>
                        )}
                      </td>

                      {/* 9. PIN Code */}
                      <td className="py-2.5 px-3 align-middle whitespace-nowrap">
                        {isEditing ? (
                          <input
                            type="text"
                            maxLength={10}
                            value={inlineDraft.pinCode}
                            onChange={(e) =>
                              setInlineDraft({ ...inlineDraft, pinCode: e.target.value })
                            }
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveInlineEdit(c.id);
                              if (e.key === 'Escape') cancelInlineEdit();
                            }}
                            placeholder="6 digits"
                            className="w-[82px] rounded border border-[#64B5F6] bg-white px-2 py-1 font-mono tabular-nums text-[#123B5D] focus:outline-none"
                          />
                        ) : (
                          <span className="font-mono tabular-nums text-[#263746]">
                            {c.pinCode || '—'}
                          </span>
                        )}
                      </td>

                      {/* 10. Registration Date */}
                      <td className="py-2.5 px-3 align-middle whitespace-nowrap font-mono tabular-nums text-[#263746]/80">
                        {formatDateDisplay(c.createdAt)}
                      </td>

                      {/* 11. Last Login */}
                      <td className="py-2.5 px-3 align-middle whitespace-nowrap font-mono tabular-nums text-[#263746]/80">
                        {formatDateDisplay(c.lastLoginAt)}
                      </td>

                      {/* 11. Account Status */}
                      <td className="py-2.5 px-3 align-middle whitespace-nowrap">
                        {isEditing ? (
                          <select
                            value={inlineDraft.accountStatus}
                            onChange={(e) =>
                              setInlineDraft({ ...inlineDraft, accountStatus: e.target.value })
                            }
                            className="rounded border border-[#64B5F6] bg-white px-2 py-1 font-semibold text-[#123B5D] focus:outline-none"
                          >
                            <option value="Active">Active</option>
                            <option value="Suspended">Suspended</option>
                            <option value="Deactivated">Deactivated</option>
                          </select>
                        ) : (
                          <StatusIndicator status={c.accountStatus} />
                        )}
                      </td>

                      {/* 12-14. Orders, Enquiries, Projects Counts */}
                      <td className="py-2.5 px-3 align-middle text-center font-mono font-bold text-[#123B5D] tabular-nums">
                        {c.ordersCount ?? 0}
                      </td>
                      <td className="py-2.5 px-3 align-middle text-center font-mono font-bold text-[#123B5D] tabular-nums">
                        {c.enquiriesCount ?? 0}
                      </td>
                      <td className="py-2.5 px-3 align-middle text-center font-mono font-bold text-[#123B5D] tabular-nums">
                        {c.projectsCount ?? 0}
                      </td>

                      {/* 15. Actions */}
                      <td
                        className={`py-2.5 px-3 align-middle whitespace-nowrap text-right sticky right-0 border-l border-[#DCEAF5] ${
                          isEditing ? 'bg-[#EAF5FF]' : 'bg-white'
                        }`}
                      >
                        {isEditing ? (
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => saveInlineEdit(c.id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#1E88E5] hover:bg-[#1565C0] text-white font-semibold disabled:opacity-60"
                            >
                              {isBusy ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Check className="w-3.5 h-3.5" />
                              )}
                              Save
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={cancelInlineEdit}
                              className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg border border-[#DCEAF5] bg-white hover:bg-[#F0F8FF] text-[#263746] font-semibold"
                            >
                              <X className="w-3.5 h-3.5" />
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => openCustomerProfile(c.id)}
                              title="View Complete Customer Profile"
                              className="p-1.5 rounded-lg border border-[#DCEAF5] bg-white hover:bg-[#F0F8FF] hover:border-[#90CAF9] text-[#123B5D] transition-colors"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            {canEditCustomers && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => startInlineEdit(c)}
                                  title="Edit Row Inline"
                                  className="p-1.5 rounded-lg border border-[#DCEAF5] bg-white hover:bg-[#F0F8FF] hover:border-[#90CAF9] text-[#1E88E5] transition-colors"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openEditModal(c)}
                                  title="Open Full Edit Form"
                                  className="p-1.5 rounded-lg border border-[#DCEAF5] bg-white hover:bg-[#F0F8FF] hover:border-[#90CAF9] text-[#123B5D] transition-colors"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                            {c.accountStatus !== 'Active' && canReactivateCustomers && (
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => handleQuickStatusChange(c, 'Active')}
                                title="Restore / Reactivate Customer Account"
                                className="p-1.5 rounded-lg border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 transition-colors"
                              >
                                <UserCheck className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {c.accountStatus === 'Active' && canEditCustomers && canDeactivateCustomers && (
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => handleQuickStatusChange(c, 'Suspended')}
                                title="Suspend Customer Account"
                                className="p-1.5 rounded-lg border border-[#DCEAF5] bg-white hover:bg-amber-50 hover:border-amber-300 text-amber-700 transition-colors"
                              >
                                <UserX className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {c.accountStatus !== 'Deactivated' && canDeactivateCustomers && (
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => {
                                  setDeactivateTarget(c);
                                  setDeactivateReason('');
                                }}
                                title="Deactivate Customer (Preserves Records)"
                                className="p-1.5 rounded-lg border border-[#DCEAF5] bg-white hover:bg-amber-50 hover:border-amber-300 text-amber-700 transition-colors"
                              >
                                <Ban className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {canPermanentDeleteCustomers && (
                              <button
                                type="button"
                                onClick={() => openPermanentDeleteModal(c)}
                                title="Permanently Delete Customer (Super Admin)"
                                className="p-1.5 rounded-lg border border-[#DCEAF5] bg-white hover:bg-red-50 hover:border-red-300 text-red-600 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer Count & Pagination */}
        <div className="px-4 py-3 bg-[#F0F8FF]/50 border-t border-[#DCEAF5] flex flex-wrap items-center justify-between gap-3 text-[11px] text-[#263746]/80">
          <div>
            Showing{' '}
            <span className="font-mono font-bold text-[#123B5D] tabular-nums">
              {pageStartDisplay}–{pageEndDisplay}
            </span>{' '}
            of{' '}
            <span className="font-mono font-bold text-[#123B5D] tabular-nums">
              {customers.length}
            </span>{' '}
            customer record{customers.length === 1 ? '' : 's'}
            {hasActiveFilters ? ` (filtered from ${summary.total} total)` : ''}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <label className="inline-flex items-center gap-1.5">
              <span>Rows:</span>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                aria-label="Customers per page"
                className="rounded border border-[#DCEAF5] bg-white px-2 py-1 font-mono text-[#123B5D] focus:outline-none focus:border-[#42A5F5]"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </label>

            <div className="inline-flex items-center gap-1">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="p-1 rounded border border-[#DCEAF5] bg-white text-[#123B5D] hover:bg-[#F0F8FF] disabled:opacity-40"
                aria-label="Previous page"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="px-2 font-mono tabular-nums text-[#123B5D]">
                Page {safePage} / {totalPages}
              </span>
              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="p-1 rounded border border-[#DCEAF5] bg-white text-[#123B5D] hover:bg-[#F0F8FF] disabled:opacity-40"
                aria-label="Next page"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="font-mono">
              Source: <span className="text-[#123B5D] font-semibold">{dataSource}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ==================== ADD / EDIT CUSTOMER MODAL ==================== */}
      {modalMode && (
        <div
          className="fixed inset-0 z-50 bg-[#123B5D]/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => !formSubmitting && setModalMode(null)}
        >
          <div
            className="bg-white rounded-xl border border-[#DCEAF5] max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 bg-[#F0F8FF] border-b border-[#DCEAF5]">
              <div>
                <div className="font-mono text-[11px] text-[#1E88E5] uppercase tracking-wider">
                  {modalMode === 'add'
                    ? 'Direct Supabase Customer Table'
                    : `Editing ${customers.find((x) => x.id === modalCustomerId)?.customerCode || `NTF-CUST-${String(modalCustomerId).padStart(6, '0')}`}`}
                </div>
                <h3 className="font-display text-lg font-bold text-[#123B5D]">
                  {modalMode === 'add' ? 'Add New Customer' : 'Edit Customer Information'}
                </h3>
              </div>
              <button
                type="button"
                disabled={formSubmitting}
                onClick={() => setModalMode(null)}
                className="p-1.5 rounded-lg border border-[#DCEAF5] bg-white text-[#263746] hover:text-[#123B5D]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleModalSubmit} className="p-6 space-y-4">
              <div className="rounded-lg border border-[#DCEAF5] bg-[#F0F8FF]/80 px-3.5 py-2.5 text-[11px] text-[#123B5D]">
                Passwordless Email OTP Authentication — customers verify via 6-digit email OTP. Existing Supabase Auth identities are automatically linked when present, and multiple customer profiles may share a mobile number or email.
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-semibold text-[#123B5D] mb-1">
                    Full Name *
                  </label>
                  <input
                    required
                    type="text"
                    value={formState.fullName}
                    onChange={(e) => setFormState({ ...formState, fullName: e.target.value })}
                    placeholder="e.g. Aarav Deshmukh"
                    className="w-full rounded-lg border border-[#DCEAF5] px-3 py-2 text-[#123B5D] focus:outline-none focus:border-[#42A5F5]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[#123B5D] mb-1">
                    Email Address *
                  </label>
                  <input
                    required
                    type="email"
                    value={formState.email}
                    onChange={(e) => setFormState({ ...formState, email: e.target.value })}
                    placeholder="customer@example.com"
                    className="w-full rounded-lg border border-[#DCEAF5] px-3 py-2 font-mono text-[#123B5D] focus:outline-none focus:border-[#42A5F5]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[#123B5D] mb-1">
                    Mobile Number
                  </label>
                  <input
                    type="tel"
                    value={formState.mobile}
                    onChange={(e) => setFormState({ ...formState, mobile: e.target.value })}
                    placeholder="10-digit mobile number"
                    className="w-full rounded-lg border border-[#DCEAF5] px-3 py-2 font-mono text-[#123B5D] focus:outline-none focus:border-[#42A5F5]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[#123B5D] mb-1">
                    Company / College
                  </label>
                  <input
                    type="text"
                    value={formState.companyOrCollege}
                    onChange={(e) => setFormState({ ...formState, companyOrCollege: e.target.value })}
                    placeholder="Organization, Farm, or Institute"
                    className="w-full rounded-lg border border-[#DCEAF5] px-3 py-2 text-[#123B5D] focus:outline-none focus:border-[#42A5F5]"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-semibold text-[#123B5D] mb-1">
                    Full Address
                  </label>
                  <textarea
                    rows={2}
                    value={formState.fullAddress}
                    onChange={(e) => setFormState({ ...formState, fullAddress: e.target.value })}
                    placeholder="Flat / House No., Building, Street, Locality, Landmark"
                    className="w-full rounded-lg border border-[#DCEAF5] px-3 py-2 text-[#123B5D] focus:outline-none focus:border-[#42A5F5]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-[#123B5D] mb-1">City</label>
                  <input
                    type="text"
                    value={formState.city}
                    onChange={(e) => setFormState({ ...formState, city: e.target.value })}
                    placeholder="e.g. Nagpur"
                    className="w-full rounded-lg border border-[#DCEAF5] px-3 py-2 text-[#123B5D] focus:outline-none focus:border-[#42A5F5]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[#123B5D] mb-1">State</label>
                  <input
                    type="text"
                    value={formState.state}
                    onChange={(e) => setFormState({ ...formState, state: e.target.value })}
                    placeholder="e.g. Maharashtra"
                    className="w-full rounded-lg border border-[#DCEAF5] px-3 py-2 text-[#123B5D] focus:outline-none focus:border-[#42A5F5]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[#123B5D] mb-1">
                    PIN Code
                  </label>
                  <input
                    type="text"
                    maxLength={10}
                    value={formState.pinCode}
                    onChange={(e) => setFormState({ ...formState, pinCode: e.target.value })}
                    placeholder="e.g. 440018"
                    className="w-full rounded-lg border border-[#DCEAF5] px-3 py-2 font-mono text-[#123B5D] focus:outline-none focus:border-[#42A5F5]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[#123B5D] mb-1">
                    Account Status
                  </label>
                  <select
                    value={formState.accountStatus}
                    onChange={(e) =>
                      setFormState({
                        ...formState,
                        accountStatus: e.target.value as 'Active' | 'Suspended' | 'Deactivated',
                      })
                    }
                    className="w-full rounded-lg border border-[#DCEAF5] px-3 py-2 bg-white text-[#123B5D] font-semibold focus:outline-none focus:border-[#42A5F5]"
                  >
                    <option value="Active" disabled={!canReactivateCustomers}>
                      Active
                    </option>
                    <option value="Suspended" disabled={!canDeactivateCustomers}>
                      Suspended
                    </option>
                    <option value="Deactivated" disabled={!canDeactivateCustomers}>
                      Deactivated
                    </option>
                  </select>
                </div>

                {formState.accountStatus !== 'Active' && (
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-semibold text-[#123B5D] mb-1">
                      Suspension / Deactivation Reason
                    </label>
                    <input
                      type="text"
                      value={formState.statusReason}
                      onChange={(e) => setFormState({ ...formState, statusReason: e.target.value })}
                      placeholder="Optional internal reason for audit trail"
                      className="w-full rounded-lg border border-[#DCEAF5] px-3 py-2 text-[#123B5D] focus:outline-none focus:border-[#42A5F5]"
                    />
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-[#DCEAF5] flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  disabled={formSubmitting}
                  onClick={() => setModalMode(null)}
                  className="px-4 py-2 rounded-lg border border-[#DCEAF5] bg-white hover:bg-[#F0F8FF] font-semibold text-[#263746]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-[#42A5F5] hover:bg-[#1E88E5] text-white font-semibold disabled:opacity-60"
                >
                  {formSubmitting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  {modalMode === 'add' ? 'Create Customer' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================== OPTION 1: DEACTIVATE CUSTOMER MODAL ==================== */}
      {deactivateTarget && (
        <div
          className="fixed inset-0 z-50 bg-[#123B5D]/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => !deactivating && setDeactivateTarget(null)}
        >
          <div
            className="bg-white rounded-xl border border-[#DCEAF5] max-w-md w-full overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 bg-amber-50 border-b border-amber-200 flex items-center gap-2.5 text-amber-800">
              <Ban className="w-5 h-5 shrink-0" />
              <div>
                <div className="font-display font-bold text-sm">Option 1: Deactivate Customer</div>
                <div className="font-mono text-[11px]">{deactivateTarget.customerCode}</div>
              </div>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-[#263746] leading-relaxed">
                Deactivating <strong className="text-[#123B5D]">{deactivateTarget.fullName || deactivateTarget.email}</strong>{' '}
                (<span className="font-mono">{deactivateTarget.email}</span>) will immediately disable portal access and revoke active sessions.{' '}
                <strong className="text-[#123B5D]">
                  All customer records, orders, invoices, and payment history are preserved
                </strong>{' '}
                and can be restored anytime by an authorized administrator.
              </p>
              <div>
                <label className="block text-[11px] font-semibold text-[#123B5D] mb-1">
                  Deactivation Reason (Audit Log)
                </label>
                <input
                  type="text"
                  value={deactivateReason}
                  onChange={(e) => setDeactivateReason(e.target.value)}
                  placeholder="Optional reason (e.g. Temporary hold or customer request)"
                  className="w-full rounded-lg border border-[#DCEAF5] px-3 py-2 text-[#123B5D] focus:outline-none focus:border-amber-400"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={deactivating}
                  onClick={() => setDeactivateTarget(null)}
                  className="px-4 py-2 rounded-lg border border-[#DCEAF5] bg-white hover:bg-[#F0F8FF] font-semibold text-[#263746]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={deactivating}
                  onClick={confirmDeactivateCustomer}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold disabled:opacity-60"
                >
                  {deactivating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Ban className="w-3.5 h-3.5" />}
                  Deactivate Customer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== OPTION 2: PERMANENTLY DELETE CUSTOMER MODAL ==================== */}
      {permanentDeleteTarget && (
        <div
          className="fixed inset-0 z-50 bg-[#123B5D]/70 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => !permanentDeleting && setPermanentDeleteTarget(null)}
        >
          <div
            className="bg-white rounded-xl border border-red-200 max-w-xl w-full max-h-[92vh] overflow-y-auto shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 bg-red-50 border-b border-red-200 flex items-center justify-between gap-2 text-red-800">
              <div className="flex items-center gap-2.5">
                <ShieldAlert className="w-5 h-5 shrink-0 text-red-600" />
                <div>
                  <div className="font-display font-bold text-sm">
                    Option 2: Permanently Delete Customer (Irreversible)
                  </div>
                  <div className="font-mono text-[11px]">{permanentDeleteTarget.customerCode}</div>
                </div>
              </div>
              <button
                type="button"
                disabled={permanentDeleting}
                onClick={() => setPermanentDeleteTarget(null)}
                className="p-1 rounded-lg border border-red-200 bg-white text-red-700 hover:bg-red-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {permanentPreviewLoading ? (
              <div className="p-10 text-center space-y-2">
                <Loader2 className="w-6 h-6 animate-spin text-red-600 mx-auto" />
                <div className="text-xs font-semibold text-[#123B5D]">
                  Inspecting database foreign-key relationships &amp; related records...
                </div>
              </div>
            ) : (
              <div className="p-5 space-y-4">
                <div className="rounded-lg border border-red-200 bg-red-50/70 p-3.5 text-red-900 space-y-1">
                  <div className="font-bold">Permanent Deletion Warning</div>
                  <p className="leading-relaxed text-[11px]">
                    This server-side transaction will permanently erase{' '}
                    <strong>{permanentDeleteTarget.fullName || permanentDeleteTarget.email}</strong> (
                    <span className="font-mono">{permanentDeleteTarget.customerCode}</span>). Historical financial
                    records (invoices, payments, receipts, orders, projects) are safely detached and preserved for
                    statutory audit compliance.
                  </p>
                </div>

                {permanentPreview && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px]">
                    <div className="rounded-lg border border-red-200 bg-white p-3 space-y-1.5">
                      <div className="font-bold text-red-700 uppercase tracking-wider text-[10px]">
                        Will Be Permanently Removed
                      </div>
                      <ul className="space-y-1 text-[#263746]">
                        <li className="flex justify-between">
                          <span>Customer Profile:</span>
                          <strong className="font-mono">{permanentPreview.customer.customerCode}</strong>
                        </li>
                        <li className="flex justify-between">
                          <span>Saved Addresses:</span>
                          <strong className="font-mono">{permanentPreview.willDelete.addresses}</strong>
                        </li>
                        <li className="flex justify-between">
                          <span>Cart &amp; Wishlist Items:</span>
                          <strong className="font-mono">
                            {permanentPreview.willDelete.cartItems + permanentPreview.willDelete.wishlistItems}
                          </strong>
                        </li>
                        <li className="flex justify-between">
                          <span>Notifications &amp; Sessions:</span>
                          <strong className="font-mono">
                            {permanentPreview.willDelete.notifications + permanentPreview.willDelete.activeSessions}
                          </strong>
                        </li>
                        <li className="flex justify-between">
                          <span>Supabase Auth Identity:</span>
                          <strong className="font-mono">
                            {permanentPreview.willDelete.exclusiveAuthAccount
                              ? 'Exclusive -> Delete'
                              : `Preserved (${permanentPreview.sharedAuthProfilesCount} sibling)`}
                          </strong>
                        </li>
                      </ul>
                    </div>

                    <div className="rounded-lg border border-[#DCEAF5] bg-[#F0F8FF]/60 p-3 space-y-1.5">
                      <div className="font-bold text-[#123B5D] uppercase tracking-wider text-[10px]">
                        Detached &amp; Safely Preserved ({permanentPreview.totalPreservedFinancialAndWorkRecords})
                      </div>
                      <ul className="space-y-1 text-[#263746]">
                        <li className="flex justify-between">
                          <span>Store &amp; 3D Orders:</span>
                          <strong className="font-mono">
                            {permanentPreview.willPreserveAndDetach.storeOrders +
                              permanentPreview.willPreserveAndDetach.printingOrders}
                          </strong>
                        </li>
                        <li className="flex justify-between">
                          <span>Invoices &amp; Receipts:</span>
                          <strong className="font-mono">
                            {permanentPreview.willPreserveAndDetach.invoices +
                              permanentPreview.willPreserveAndDetach.receipts}
                          </strong>
                        </li>
                        <li className="flex justify-between">
                          <span>Payments:</span>
                          <strong className="font-mono">{permanentPreview.willPreserveAndDetach.payments}</strong>
                        </li>
                        <li className="flex justify-between">
                          <span>Projects &amp; Enquiries:</span>
                          <strong className="font-mono">
                            {permanentPreview.willPreserveAndDetach.projects +
                              permanentPreview.willPreserveAndDetach.projectEnquiries}
                          </strong>
                        </li>
                        <li className="flex justify-between">
                          <span>Service &amp; Support Records:</span>
                          <strong className="font-mono">
                            {permanentPreview.willPreserveAndDetach.pcbEnquiries +
                              permanentPreview.willPreserveAndDetach.droneRepairs +
                              permanentPreview.willPreserveAndDetach.b2bEnquiries +
                              permanentPreview.willPreserveAndDetach.supportTickets}
                          </strong>
                        </li>
                      </ul>
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-[11px] font-semibold text-[#123B5D] mb-1">
                    Type exact Customer ID{' '}
                    <span className="font-mono text-red-700">
                      {permanentPreview?.customer.customerCode || permanentDeleteTarget.customerCode}
                    </span>{' '}
                    to confirm *
                  </label>
                  <input
                    type="text"
                    value={confirmCustomerIdInput}
                    onChange={(e) => setConfirmCustomerIdInput(e.target.value)}
                    placeholder={permanentPreview?.customer.customerCode || permanentDeleteTarget.customerCode}
                    className="w-full rounded-lg border border-red-300 px-3 py-2 font-mono text-[#123B5D] uppercase focus:outline-none focus:border-red-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-[#123B5D] mb-1">
                    Deletion Reason (Anonymized Audit Record)
                  </label>
                  <input
                    type="text"
                    value={permanentDeleteReason}
                    onChange={(e) => setPermanentDeleteReason(e.target.value)}
                    placeholder="Optional reason for audit trail"
                    className="w-full rounded-lg border border-[#DCEAF5] px-3 py-2 text-[#123B5D] focus:outline-none focus:border-red-400"
                  />
                </div>

                <label className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50/40 p-3 cursor-pointer text-[11px] text-[#123B5D]">
                  <input
                    type="checkbox"
                    checked={secondConfirmationChecked}
                    onChange={(e) => setSecondConfirmationChecked(e.target.checked)}
                    className="mt-0.5 accent-red-600"
                  />
                  <span>
                    Second Confirmation: I understand permanent deletion cannot be undone and have verified the affected
                    records above.
                  </span>
                </label>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#DCEAF5]">
                  <button
                    type="button"
                    disabled={permanentDeleting}
                    onClick={() => setPermanentDeleteTarget(null)}
                    className="px-4 py-2 rounded-lg border border-[#DCEAF5] bg-white hover:bg-[#F0F8FF] font-semibold text-[#263746]"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={
                      permanentDeleting ||
                      !secondConfirmationChecked ||
                      confirmCustomerIdInput.trim().toUpperCase() !==
                        (permanentPreview?.customer.customerCode || permanentDeleteTarget.customerCode)
                          .trim()
                          .toUpperCase()
                    }
                    onClick={confirmPermanentDelete}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold disabled:opacity-50"
                  >
                    {permanentDeleting ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" />
                    )}
                    Permanently Delete Customer
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================== DELETION HISTORY AUDIT LOG MODAL ==================== */}
      {deletionHistoryOpen && (
        <div
          className="fixed inset-0 z-50 bg-[#123B5D]/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setDeletionHistoryOpen(false)}
        >
          <div
            className="bg-white rounded-xl border border-[#DCEAF5] max-w-3xl w-full max-h-[85vh] flex flex-col overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 bg-[#F0F8FF] border-b border-[#DCEAF5] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-[#42A5F5]" />
                <h3 className="font-display text-base font-bold text-[#123B5D]">
                  Anonymized Permanent Deletion Audit History
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setDeletionHistoryOpen(false)}
                className="p-1.5 rounded-lg border border-[#DCEAF5] bg-white text-[#263746]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto flex-1">
              {deletionHistoryLoading ? (
                <div className="py-10 text-center text-[#263746]/70">
                  <Loader2 className="w-5 h-5 animate-spin text-[#42A5F5] mx-auto mb-2" />
                  Loading deletion audit log...
                </div>
              ) : deletionHistoryLogs.length === 0 ? (
                <p className="py-8 text-center text-[#263746]/70">No permanent customer deletions recorded.</p>
              ) : (
                <div className="divide-y divide-[#DCEAF5] border border-[#DCEAF5] rounded-lg">
                  {deletionHistoryLogs.map((log) => (
                    <div key={log.id} className="p-3.5 space-y-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-mono font-bold text-[#123B5D]">{log.customerCode}</span>
                        <span className="font-mono text-[11px] text-[#263746]/70">
                          {formatDateDisplay(log.createdAt)}
                        </span>
                      </div>
                      <div className="text-[11px] text-[#263746]">
                        Deleted by <strong className="font-mono">{log.deletedByEmail}</strong> ({log.deletedByRole}) · Auth Deleted:{' '}
                        <strong>{log.deletedAuthAccount ? 'Yes' : 'Preserved'}</strong>
                      </div>
                      {log.reason && <div className="text-[11px] text-[#263746]/80">Reason: {log.reason}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ==================== SUPER ADMIN STAFF CUSTOMER PERMISSIONS MODAL ==================== */}
      {permissionsModalOpen && isSuperAdmin && (
        <div
          className="fixed inset-0 z-50 bg-[#123B5D]/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setPermissionsModalOpen(false)}
        >
          <div
            className="bg-white rounded-xl border border-[#DCEAF5] max-w-4xl w-full max-h-[85vh] flex flex-col overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 bg-[#F0F8FF] border-b border-[#DCEAF5] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-[#1E88E5]" />
                <div>
                  <h3 className="font-display text-base font-bold text-[#123B5D]">
                    Customer Management Permissions (Super Admin)
                  </h3>
                  <div className="text-[11px] text-[#263746]/75">
                    Configure customer permissions per staff member. Employees can never permanently delete customers.
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPermissionsModalOpen(false)}
                className="p-1.5 rounded-lg border border-[#DCEAF5] bg-white text-[#263746]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 overflow-auto flex-1">
              {staffRows.length === 0 ? (
                <p className="py-8 text-center text-[#263746]/70">No staff accounts found.</p>
              ) : (
                <table className="w-full min-w-[760px] text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[#DCEAF5] text-[10px] uppercase tracking-wider text-[#123B5D]">
                      <th className="py-2 px-2">Staff Member</th>
                      <th className="py-2 px-2">Role</th>
                      <th className="py-2 px-2 text-center">View</th>
                      <th className="py-2 px-2 text-center">Add</th>
                      <th className="py-2 px-2 text-center">Edit</th>
                      <th className="py-2 px-2 text-center">Deactivate</th>
                      <th className="py-2 px-2 text-center">Reactivate</th>
                      <th className="py-2 px-2 text-center">Perm. Delete</th>
                      <th className="py-2 px-2 text-center">Del. History</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#DCEAF5]">
                    {staffRows.map((st) => {
                      const isRowSuperAdmin = st.role === 'super_admin';
                      const canGrantPermDelete = st.role === 'admin' || st.role === 'super_admin';
                      const busy = savingStaffPermId === st.userId;
                      return (
                        <tr key={st.userId} className="hover:bg-[#F7FBFF]">
                          <td className="py-2.5 px-2">
                            <div className="font-semibold text-[#123B5D]">{st.fullName || st.email}</div>
                            <div className="font-mono text-[10px] text-[#263746]/75">{st.email}</div>
                          </td>
                          <td className="py-2.5 px-2 font-mono text-[11px]">{st.role}</td>
                          {(
                            [
                              ['canViewCustomers', true],
                              ['canAddCustomers', true],
                              ['canEditCustomers', true],
                              ['canDeactivateCustomers', true],
                              ['canReactivateCustomers', true],
                              ['canPermanentlyDeleteCustomers', canGrantPermDelete],
                              ['canViewDeletionHistory', true],
                            ] as Array<[keyof CustomerPermissions, boolean]>
                          ).map(([permKey, allowedForRole]) => (
                            <td key={permKey} className="py-2.5 px-2 text-center">
                              <input
                                type="checkbox"
                                disabled={isRowSuperAdmin || !allowedForRole || busy}
                                checked={Boolean(st.permissions[permKey])}
                                onChange={(e) =>
                                  updateStaffPermission(st, { [permKey]: e.target.checked })
                                }
                                title={
                                  !allowedForRole
                                    ? 'Restricted to Super Admin / granted Admin only'
                                    : undefined
                                }
                                className="accent-[#42A5F5]"
                              />
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ==================== COMPLETE CUSTOMER PROFILE MODAL ==================== */}
      {(profileLoading || profileBundle) && (
        <div
          className="fixed inset-0 z-50 bg-[#123B5D]/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => !profileLoading && setProfileBundle(null)}
        >
          <div
            className="bg-white rounded-xl border border-[#DCEAF5] max-w-4xl w-full max-h-[88vh] flex flex-col overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {profileLoading || !profileBundle ? (
              <div className="p-12 text-center">
                <Loader2 className="w-6 h-6 animate-spin text-[#42A5F5] mx-auto mb-2" />
                <div className="text-sm font-semibold text-[#123B5D]">
                  Loading complete customer profile...
                </div>
              </div>
            ) : (
              <>
                <div className="px-6 py-4 bg-[#F0F8FF] border-b border-[#DCEAF5] flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-[#1E88E5]">
                      <span>{profileBundle.customer.customerCode}</span>
                      <span>·</span>
                      <StatusIndicator status={profileBundle.customer.accountStatus} />
                    </div>
                    <h3 className="font-display text-xl font-bold text-[#123B5D]">
                      {profileBundle.customer.fullName || profileBundle.customer.email}
                    </h3>
                    <div className="flex flex-wrap items-center gap-4 text-[11px] text-[#263746]">
                      <span className="inline-flex items-center gap-1 font-mono">
                        <Mail className="w-3.5 h-3.5 text-[#42A5F5]" />
                        {profileBundle.customer.email}
                      </span>
                      {profileBundle.customer.mobile && (
                        <span className="inline-flex items-center gap-1 font-mono">
                          <Phone className="w-3.5 h-3.5 text-[#42A5F5]" />
                          {profileBundle.customer.mobile}
                        </span>
                      )}
                      {profileBundle.customer.companyOrCollege && (
                        <span className="inline-flex items-center gap-1">
                          <Building2 className="w-3.5 h-3.5 text-[#42A5F5]" />
                          {profileBundle.customer.companyOrCollege}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {canEditCustomers && (
                      <button
                        type="button"
                        onClick={() => {
                          const c = profileBundle.customer;
                          setProfileBundle(null);
                          openEditModal(c);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] font-semibold"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        Edit Customer
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setProfileBundle(null)}
                      className="p-1.5 rounded-lg border border-[#DCEAF5] bg-white text-[#263746] hover:text-[#123B5D]"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Profile Tabs (8 Sections) */}
                <div className="px-6 border-b border-[#DCEAF5] bg-white flex flex-wrap gap-1">
                  {[
                    { id: 'overview', label: 'Overview' },
                    {
                      id: 'orders',
                      label: `Orders (${profileBundle.storeOrders.length + profileBundle.printingOrders.length})`,
                    },
                    {
                      id: 'enquiries',
                      label: `Enquiries (${
                        profileBundle.productEnquiries.length +
                        profileBundle.pcbEnquiries.length +
                        (profileBundle.b2bEnquiries?.length || 0) +
                        profileBundle.supportTickets.length
                      })`,
                    },
                    {
                      id: 'projects',
                      label: `Projects (${profileBundle.projects.length + profileBundle.projectEnquiries.length})`,
                    },
                    {
                      id: 'invoices',
                      label: `Invoices & Payments (${profileBundle.invoices.length + profileBundle.payments.length})`,
                    },
                    {
                      id: 'addresses',
                      label: `Addresses (${profileBundle.addresses.length})`,
                    },
                    {
                      id: 'reviews',
                      label: `Reviews (${profileBundle.reviews?.length || 0})`,
                    },
                    {
                      id: 'activity',
                      label: `Activity History (${
                        (profileBundle.customerActivityLogs?.length || 0) + profileBundle.activityLogs.length
                      })`,
                    },
                  ].map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setProfileTab(t.id as any)}
                      className={`px-3 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
                        profileTab === t.id
                          ? 'border-[#42A5F5] text-[#123B5D]'
                          : 'border-transparent text-[#263746]/70 hover:text-[#123B5D]'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                <div className="p-6 overflow-y-auto space-y-5 flex-1 bg-white">
                  {profileTab === 'overview' && (
                    <div className="space-y-5">
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                        <div className="rounded-lg border border-[#DCEAF5] bg-[#F0F8FF]/50 p-3">
                          <div className="text-[11px] text-[#263746]/70">Total Spend</div>
                          <div className="font-mono text-base font-bold text-[#123B5D] tabular-nums">
                            ₹{(profileBundle.customer.totalSpentInr || 0).toLocaleString('en-IN')}
                          </div>
                        </div>
                        <div className="rounded-lg border border-[#DCEAF5] bg-[#F0F8FF]/50 p-3">
                          <div className="text-[11px] text-[#263746]/70">Total Orders</div>
                          <div className="font-mono text-base font-bold text-[#123B5D] tabular-nums">
                            {profileBundle.storeOrders.length + profileBundle.printingOrders.length}
                          </div>
                        </div>
                        <div className="rounded-lg border border-[#DCEAF5] bg-[#F0F8FF]/50 p-3">
                          <div className="text-[11px] text-[#263746]/70">Total Enquiries</div>
                          <div className="font-mono text-base font-bold text-[#123B5D] tabular-nums">
                            {profileBundle.productEnquiries.length +
                              profileBundle.pcbEnquiries.length +
                              (profileBundle.b2bEnquiries?.length || 0) +
                              profileBundle.supportTickets.length}
                          </div>
                        </div>
                        <div className="rounded-lg border border-[#DCEAF5] bg-[#F0F8FF]/50 p-3">
                          <div className="text-[11px] text-[#263746]/70">Projects</div>
                          <div className="font-mono text-base font-bold text-[#123B5D] tabular-nums">
                            {profileBundle.projects.length + profileBundle.projectEnquiries.length}
                          </div>
                        </div>
                        <div className="rounded-lg border border-[#DCEAF5] bg-[#F0F8FF]/50 p-3">
                          <div className="text-[11px] text-[#263746]/70">Registered On</div>
                          <div className="font-mono text-sm font-bold text-[#123B5D] tabular-nums">
                            {formatDateDisplay(profileBundle.customer.createdAt)}
                          </div>
                        </div>
                        <div className="rounded-lg border border-[#DCEAF5] bg-[#F0F8FF]/50 p-3">
                          <div className="text-[11px] text-[#263746]/70">Last Login</div>
                          <div className="font-mono text-sm font-bold text-[#123B5D] tabular-nums">
                            {formatDateDisplay(profileBundle.customer.lastLoginAt)}
                          </div>
                        </div>
                      </div>

                      <div className="rounded-lg border border-[#DCEAF5] p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <div className="text-[11px] font-semibold uppercase tracking-wider text-[#42A5F5] mb-1">
                            Primary Location &amp; Address
                          </div>
                          <div className="flex items-start gap-2 text-[#123B5D]">
                            <MapPin className="w-4 h-4 text-[#42A5F5] shrink-0 mt-0.5" />
                            <div>
                              <div className="font-medium">
                                {profileBundle.customer.fullAddress || 'No street address on file'}
                              </div>
                              <div className="text-[#263746]/80">
                                {[profileBundle.customer.city, profileBundle.customer.state, profileBundle.customer.pinCode]
                                  .filter(Boolean)
                                  .join(', ') || '—'}
                              </div>
                            </div>
                          </div>
                        </div>
                        <div>
                          <div className="text-[11px] font-semibold uppercase tracking-wider text-[#42A5F5] mb-1">
                            Verification &amp; Security
                          </div>
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5">
                              <ShieldCheck className="w-3.5 h-3.5 text-[#42A5F5]" />
                              <span>Email Verified:</span>
                              <strong className="text-[#123B5D]">
                                {profileBundle.customer.emailVerified ? 'Yes' : 'Pending'}
                              </strong>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <Phone className="w-3.5 h-3.5 text-[#42A5F5]" />
                              <span>Phone Verified:</span>
                              <strong className="text-[#123B5D]">
                                {profileBundle.customer.phoneVerified ? 'Yes' : 'Unverified'}
                              </strong>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {profileTab === 'orders' && (
                    <div className="space-y-4">
                      <div>
                        <div className="font-display font-bold text-sm text-[#123B5D] mb-2">
                          Hardware Store Orders ({profileBundle.storeOrders.length})
                        </div>
                        {profileBundle.storeOrders.length === 0 ? (
                          <p className="text-[#263746]/70">No store orders recorded.</p>
                        ) : (
                          <div className="divide-y divide-[#DCEAF5] rounded-lg border border-[#DCEAF5]">
                            {profileBundle.storeOrders.map((o: any) => (
                              <div key={o.id} className="p-3 flex flex-wrap justify-between gap-2">
                                <div>
                                  <span className="font-mono font-bold text-[#123B5D]">{o.orderNumber}</span> ·{' '}
                                  {o.orderStatus} · <span className="uppercase">{o.paymentStatus}</span>
                                </div>
                                <div className="font-mono tabular-nums text-[#123B5D]">
                                  ₹{Number(o.totalInr || 0).toLocaleString('en-IN')} ·{' '}
                                  {formatDateDisplay(o.createdAt)}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div>
                        <div className="font-display font-bold text-sm text-[#123B5D] mb-2">
                          3D Printing Orders ({profileBundle.printingOrders.length})
                        </div>
                        {profileBundle.printingOrders.length === 0 ? (
                          <p className="text-[#263746]/70">No 3D printing orders recorded.</p>
                        ) : (
                          <div className="divide-y divide-[#DCEAF5] rounded-lg border border-[#DCEAF5]">
                            {profileBundle.printingOrders.map((po: any) => (
                              <div key={po.id} className="p-3 flex flex-wrap justify-between gap-2">
                                <div>
                                  <span className="font-mono font-bold text-[#123B5D]">{po.orderNumber}</span> ·{' '}
                                  {po.fileName} ({po.materialName}) · {po.orderStatus}
                                </div>
                                <div className="font-mono tabular-nums text-[#123B5D]">
                                  ₹{Number(po.totalInr || 0).toLocaleString('en-IN')} ·{' '}
                                  {formatDateDisplay(po.createdAt)}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {profileTab === 'enquiries' && (
                    <div className="space-y-4">
                      <div>
                        <div className="font-display font-bold text-sm text-[#123B5D] mb-2">
                          Product &amp; Drone Enquiries ({profileBundle.productEnquiries.length})
                        </div>
                        {profileBundle.productEnquiries.length === 0 ? (
                          <p className="text-[#263746]/70">No product enquiries recorded.</p>
                        ) : (
                          <div className="divide-y divide-[#DCEAF5] rounded-lg border border-[#DCEAF5]">
                            {profileBundle.productEnquiries.map((de: any) => (
                              <div key={de.id} className="p-3 flex flex-wrap justify-between gap-2">
                                <div>
                                  <span className="font-mono font-bold text-[#123B5D]">
                                    {de.enquiryNumber || `ENQ-${de.id}`}
                                  </span>{' '}
                                  · {de.interestedProduct} (Qty {de.quantity || 1})
                                </div>
                                <div className="font-mono text-[#1E88E5]">
                                  {de.status} · {formatDateDisplay(de.createdAt)}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div>
                        <div className="font-display font-bold text-sm text-[#123B5D] mb-2">
                          PCB &amp; B2B RFQs ({profileBundle.pcbEnquiries.length + (profileBundle.b2bEnquiries?.length || 0)})
                        </div>
                        {profileBundle.pcbEnquiries.length + (profileBundle.b2bEnquiries?.length || 0) === 0 ? (
                          <p className="text-[#263746]/70">No PCB or B2B enquiries recorded.</p>
                        ) : (
                          <div className="divide-y divide-[#DCEAF5] rounded-lg border border-[#DCEAF5]">
                            {profileBundle.pcbEnquiries.map((pcb: any) => (
                              <div key={`pcb-${pcb.id}`} className="p-3 flex flex-wrap justify-between gap-2">
                                <div>
                                  <span className="font-mono font-bold text-[#123B5D]">{pcb.enquiryNumber}</span> · PCB ({pcb.layerCount}L)
                                </div>
                                <div className="font-mono text-[#1E88E5]">{pcb.status}</div>
                              </div>
                            ))}
                            {(profileBundle.b2bEnquiries || []).map((b2b: any) => (
                              <div key={`b2b-${b2b.id}`} className="p-3 flex flex-wrap justify-between gap-2">
                                <div>
                                  <span className="font-mono font-bold text-[#123B5D]">{b2b.enquiryNumber}</span> · {b2b.requirementCategory} (Qty {b2b.quantity})
                                </div>
                                <div className="font-mono text-[#1E88E5]">{b2b.status}</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div>
                        <div className="font-display font-bold text-sm text-[#123B5D] mb-2">
                          Contact &amp; Support Tickets ({profileBundle.supportTickets.length})
                        </div>
                        {profileBundle.supportTickets.length === 0 ? (
                          <p className="text-[#263746]/70">No support tickets submitted.</p>
                        ) : (
                          <div className="divide-y divide-[#DCEAF5] rounded-lg border border-[#DCEAF5]">
                            {profileBundle.supportTickets.map((t: any) => (
                              <div key={t.id} className="p-3 flex flex-wrap justify-between gap-2">
                                <div>
                                  <span className="font-mono font-bold text-[#123B5D]">{t.ticketNumber}</span> · {t.subject}
                                </div>
                                <div className="font-mono text-[#1E88E5]">{t.status}</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {profileTab === 'projects' && (
                    <div className="space-y-4">
                      <div>
                        <div className="font-display font-bold text-sm text-[#123B5D] mb-2">
                          Associated Engineering Projects ({profileBundle.projects.length})
                        </div>
                        {profileBundle.projects.length === 0 ? (
                          <p className="text-[#263746]/70">No active development projects.</p>
                        ) : (
                          <div className="divide-y divide-[#DCEAF5] rounded-lg border border-[#DCEAF5]">
                            {profileBundle.projects.map((p: any) => (
                              <div key={p.id} className="p-3 flex flex-wrap justify-between gap-2">
                                <div>
                                  <span className="font-mono font-bold text-[#123B5D]">{p.projectCode}</span> · {p.title}
                                </div>
                                <div className="font-mono text-[#1E88E5]">
                                  {p.status} ({p.progressPercent || 0}%)
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div>
                        <div className="font-display font-bold text-sm text-[#123B5D] mb-2">
                          Engineering Project Enquiries ({profileBundle.projectEnquiries.length})
                        </div>
                        {profileBundle.projectEnquiries.length === 0 ? (
                          <p className="text-[#263746]/70">No engineering project enquiries.</p>
                        ) : (
                          <div className="divide-y divide-[#DCEAF5] rounded-lg border border-[#DCEAF5]">
                            {profileBundle.projectEnquiries.map((pe: any) => (
                              <div key={pe.id} className="p-3 flex flex-wrap justify-between gap-2">
                                <div>
                                  <span className="font-mono font-bold text-[#123B5D]">{pe.enquiryNumber}</span> ·{' '}
                                  {pe.projectTitle}
                                </div>
                                <div className="font-mono text-[#1E88E5]">{pe.status}</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div>
                        <div className="font-display font-bold text-sm text-[#123B5D] mb-2">
                          Drone Repair Bookings ({profileBundle.droneRepairs.length})
                        </div>
                        {profileBundle.droneRepairs.length === 0 ? (
                          <p className="text-[#263746]/70">No drone repair bookings recorded.</p>
                        ) : (
                          <div className="divide-y divide-[#DCEAF5] rounded-lg border border-[#DCEAF5]">
                            {profileBundle.droneRepairs.map((dr: any) => (
                              <div key={`dr-${dr.id}`} className="p-3 flex flex-wrap justify-between gap-2">
                                <div>
                                  <span className="font-mono font-bold text-[#123B5D]">{dr.referenceNumber}</span> ·{' '}
                                  {dr.droneBrandModel} ({dr.serviceMode})
                                </div>
                                <div className="font-mono text-[#1E88E5]">{dr.status}</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {profileTab === 'invoices' && (
                    <div className="space-y-4">
                      <div>
                        <div className="font-display font-bold text-sm text-[#123B5D] mb-2">
                          GST &amp; Tax Invoices ({profileBundle.invoices.length})
                        </div>
                        {profileBundle.invoices.length === 0 ? (
                          <p className="text-[#263746]/70">No invoices generated.</p>
                        ) : (
                          <div className="divide-y divide-[#DCEAF5] rounded-lg border border-[#DCEAF5]">
                            {profileBundle.invoices.map((inv: any) => (
                              <div key={inv.id} className="p-3 flex flex-wrap justify-between gap-2">
                                <div>
                                  <span className="font-mono font-bold text-[#123B5D]">{inv.invoiceNumber}</span> ·{' '}
                                  {inv.docType}
                                </div>
                                <div className="font-mono tabular-nums text-[#123B5D]">
                                  ₹{Number(inv.amountInr || 0).toLocaleString('en-IN')} ·{' '}
                                  {formatDateDisplay(inv.issuedAt)}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div>
                        <div className="font-display font-bold text-sm text-[#123B5D] mb-2">
                          Payment Transactions ({profileBundle.payments.length})
                        </div>
                        {profileBundle.payments.length === 0 ? (
                          <p className="text-[#263746]/70">No payments recorded.</p>
                        ) : (
                          <div className="divide-y divide-[#DCEAF5] rounded-lg border border-[#DCEAF5]">
                            {profileBundle.payments.map((pay: any) => (
                              <div key={pay.id} className="p-3 flex flex-wrap justify-between gap-2">
                                <div>
                                  <span className="font-mono font-bold text-[#123B5D]">{pay.paymentRef}</span> ·{' '}
                                  {pay.entityType} · {pay.status}
                                </div>
                                <div className="font-mono tabular-nums text-[#123B5D]">
                                  ₹{Number(pay.amountInr || 0).toLocaleString('en-IN')} ·{' '}
                                  {formatDateDisplay(pay.createdAt)}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {profileTab === 'addresses' && (
                    <div className="space-y-2">
                      <div className="font-display font-bold text-sm text-[#123B5D]">
                        Saved Customer Addresses ({profileBundle.addresses.length})
                      </div>
                      {profileBundle.addresses.length === 0 ? (
                        <p className="text-[#263746]/70">No saved delivery addresses yet.</p>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {profileBundle.addresses.map((addr: any) => (
                            <div
                              key={addr.id}
                              className="rounded-lg border border-[#DCEAF5] bg-[#F0F8FF]/30 p-3 space-y-1"
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-semibold text-[#123B5D]">
                                  {addr.label || 'Address'} ({addr.addressType})
                                </span>
                                {addr.isDefault && (
                                  <span className="font-mono text-[10px] font-semibold text-[#1E88E5]">
                                    DEFAULT
                                  </span>
                                )}
                              </div>
                              <div className="text-[#263746]">
                                {addr.fullName} · <span className="font-mono">{addr.mobile}</span>
                              </div>
                              <div className="text-[#263746]/80">
                                {[addr.houseFlat, addr.streetArea, addr.landmark].filter(Boolean).join(', ')}
                              </div>
                              <div className="text-[#263746]/80 font-mono">
                                {addr.city}, {addr.state} - {addr.pinCode}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {profileTab === 'reviews' && (
                    <div className="space-y-2">
                      <div className="font-display font-bold text-sm text-[#123B5D]">
                        Customer Product Reviews ({profileBundle.reviews?.length || 0})
                      </div>
                      {!profileBundle.reviews || profileBundle.reviews.length === 0 ? (
                        <p className="text-[#263746]/70">No product reviews submitted by this customer.</p>
                      ) : (
                        <div className="divide-y divide-[#DCEAF5] rounded-lg border border-[#DCEAF5]">
                          {profileBundle.reviews.map((rev: any) => (
                            <div key={rev.id} className="p-3 space-y-1">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="font-semibold text-[#123B5D]">
                                  {rev.productName || `Product #${rev.productId}`}{' '}
                                  {rev.productSku ? <span className="font-mono text-[11px] text-[#42A5F5]">({rev.productSku})</span> : null}
                                </div>
                                <div className="font-mono text-amber-600 font-bold">
                                  {'★'.repeat(Math.max(1, Math.min(5, Number(rev.rating || 5))))} ({rev.rating}/5)
                                </div>
                              </div>
                              {rev.title && <div className="font-semibold text-xs text-[#123B5D]">{rev.title}</div>}
                              <p className="text-xs text-[#263746]/85">{rev.comment}</p>
                              <div className="text-[10px] font-mono text-[#263746]/60">
                                {formatDateDisplay(rev.createdAt)}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {profileTab === 'activity' && (
                    <div className="space-y-4">
                      <div>
                        <div className="font-display font-bold text-sm text-[#123B5D] mb-2">
                          Customer Activity Timeline ({profileBundle.customerActivityLogs?.length || 0})
                        </div>
                        {!profileBundle.customerActivityLogs || profileBundle.customerActivityLogs.length === 0 ? (
                          <p className="text-[#263746]/70">No customer-facing activity logged yet.</p>
                        ) : (
                          <div className="divide-y divide-[#DCEAF5] rounded-lg border border-[#DCEAF5]">
                            {profileBundle.customerActivityLogs.map((cl: any) => (
                              <div key={cl.id} className="p-3 flex flex-wrap justify-between gap-2">
                                <div>
                                  <span className="font-mono font-bold text-[#123B5D]">{cl.action}</span>{' '}
                                  {cl.description ? `· ${cl.description}` : ''}
                                </div>
                                <div className="font-mono tabular-nums text-[#263746]/70">
                                  {formatDateDisplay(cl.createdAt)}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div>
                        <div className="font-display font-bold text-sm text-[#123B5D] mb-2">
                          Admin Audit History ({profileBundle.activityLogs.length})
                        </div>
                        {profileBundle.activityLogs.length === 0 ? (
                          <p className="text-[#263746]/70">No audit history logged for this customer yet.</p>
                        ) : (
                          <div className="divide-y divide-[#DCEAF5] rounded-lg border border-[#DCEAF5]">
                            {profileBundle.activityLogs.map((log: any) => (
                              <div key={log.id} className="p-3 flex flex-wrap justify-between gap-2">
                                <div>
                                  <span className="font-mono font-bold text-[#123B5D]">{log.action}</span> ·{' '}
                                  <span className="text-[#263746]/80">by {log.actorEmail}</span>
                                </div>
                                <div className="font-mono tabular-nums text-[#263746]/70">
                                  {formatDateDisplay(log.createdAt)}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
