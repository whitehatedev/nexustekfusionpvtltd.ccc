import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CreditCard,
  Download,
  Eye,
  FileCode2,
  FileSpreadsheet,
  Filter,
  IndianRupee,
  Printer,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  User,
  X,
} from 'lucide-react';
import { usePlatform } from '../../context/PlatformContext';
import { ModelViewer3D } from '../ModelViewer3D';
import { PrintingOrderRecord, PrintingOrderStatus } from '../../types/platform';

export const STANDARD_PRINTING_ORDER_STATUSES: PrintingOrderStatus[] = [
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
];

function formatFileSize(bytes?: number): string {
  const n = Number(bytes || 0);
  if (!n || n <= 0) return '—';
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(2)} MB`;
  return `${(n / 1024).toFixed(1)} KB`;
}

function getPaymentBadgeMeta(po: PrintingOrderRecord): {
  code: 'pending' | 'paid' | 'failed' | 'refunded';
  label: string;
  warningText: string;
  isPaid: boolean;
} {
  const p = String(po.paymentStatus || 'pending').trim().toLowerCase();
  const r = String(po.refundStatus || 'none').trim().toLowerCase();
  if (p === 'refunded' || p === 'partially_refunded' || r === 'full' || r === 'partial') {
    return { code: 'refunded', label: 'Payment Refunded', warningText: 'Payment Not Completed', isPaid: false };
  }
  if (p === 'failed' || p === 'cancelled') {
    return { code: 'failed', label: 'Payment Failed', warningText: 'Payment Not Completed', isPaid: false };
  }
  if (p === 'paid') {
    return { code: 'paid', label: 'Payment Successful', warningText: '', isPaid: true };
  }
  return { code: 'pending', label: 'Pending Payment', warningText: 'Payment Not Completed', isPaid: false };
}

interface Props {
  orders: PrintingOrderRecord[];
  onRefresh: () => void;
}

export const PrintingOrdersAdminPanel: React.FC<Props> = ({ orders, onRefresh }) => {
  const { apiFetch, getIdToken, notify } = usePlatform();

  const [searchQ, setSearchQ] = useState('');
  const [paymentFilter, setPaymentFilter] = useState<string>('all');
  const [orderStatusFilter, setOrderStatusFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [serverOrders, setServerOrders] = useState<PrintingOrderRecord[] | null>(null);
  const [filtering, setFiltering] = useState(false);

  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [uploadingProdId, setUploadingProdId] = useState<number | null>(null);

  const [editMap, setEditMap] = useState<Record<number, any>>({});
  const [prodUploadForm, setProdUploadForm] = useState<
    Record<number, { file: File | null; fileKind: string; notes: string }>
  >({});

  // Interactive Action Modals
  const [previewState, setPreviewState] = useState<{
    order: PrintingOrderRecord;
    buffer: ArrayBuffer | null;
    loading: boolean;
    error: string;
  } | null>(null);

  const [customerModalOrder, setCustomerModalOrder] = useState<PrintingOrderRecord | null>(null);
  const [quoteModal, setQuoteModal] = useState<{
    order: PrintingOrderRecord;
    quotedPriceInr: string;
    slicingStatus: string;
    notes: string;
    busy: boolean;
  } | null>(null);
  const [paymentModal, setPaymentModal] = useState<{
    order: PrintingOrderRecord;
    paymentStatus: 'pending' | 'paid' | 'failed' | 'refunded';
    paymentId: string;
    note: string;
    busy: boolean;
  } | null>(null);
  const [rejectModal, setRejectModal] = useState<{
    order: PrintingOrderRecord;
    reason: string;
    busy: boolean;
  } | null>(null);
  const [deleteModal, setDeleteModal] = useState<{
    order: PrintingOrderRecord;
    reason: string;
    busy: boolean;
  } | null>(null);

  const activeList = serverOrders !== null ? serverOrders : orders;

  const filteredOrders = useMemo(() => {
    return (activeList || []).filter((o) => {
      if (paymentFilter !== 'all') {
        const meta = getPaymentBadgeMeta(o);
        if (String(o.paymentStatus).toLowerCase() !== paymentFilter && meta.code !== paymentFilter) {
          return false;
        }
      }
      if (orderStatusFilter !== 'all' && o.orderStatus !== orderStatusFilter) {
        return false;
      }
      if (dateFrom && new Date(o.createdAt) < new Date(`${dateFrom}T00:00:00.000Z`)) {
        return false;
      }
      if (dateTo && new Date(o.createdAt) > new Date(`${dateTo}T23:59:59.999Z`)) {
        return false;
      }
      if (searchQ.trim()) {
        const needle = searchQ.trim().toLowerCase();
        const hay = `${o.orderNumber} ${o.fileName} ${o.customerId || ''} ${o.customerName || ''} ${o.customerEmail || o.email || ''} ${o.customerMobile || o.phone || ''} ${o.materialName} ${o.technology}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [activeList, paymentFilter, orderStatusFilter, dateFrom, dateTo, searchQ]);

  const metrics = useMemo(() => {
    const list = activeList || [];
    const total = list.length;
    const paidReady = list.filter((o) => getPaymentBadgeMeta(o).isPaid).length;
    const paymentPending = total - paidReady;
    const inProd = list.filter((o) =>
      [
        'Printing Parameters Confirmed',
        'Ready for Printing',
        'Approved for Printing',
        'Printing in Progress',
        'Quality Inspection',
      ].includes(o.orderStatus)
    ).length;
    return { total, paidReady, paymentPending, inProd };
  }, [activeList]);

  const fetchFilteredFromServer = async () => {
    setFiltering(true);
    try {
      const qs = new URLSearchParams();
      if (paymentFilter !== 'all') qs.set('paymentStatus', paymentFilter);
      if (orderStatusFilter !== 'all') qs.set('orderStatus', orderStatusFilter);
      if (searchQ.trim()) qs.set('q', searchQ.trim());
      if (dateFrom) qs.set('dateFrom', dateFrom);
      if (dateTo) qs.set('dateTo', dateTo);
      const res = await apiFetch<{ orders: PrintingOrderRecord[] }>(
        `/api/admin/printing-orders${qs.toString() ? `?${qs.toString()}` : ''}`
      );
      setServerOrders(res.orders || []);
    } catch (err: any) {
      notify(err?.message || 'Failed to query 3D printing enquiries.', 'error');
    } finally {
      setFiltering(false);
    }
  };

  const resetFilters = () => {
    setSearchQ('');
    setPaymentFilter('all');
    setOrderStatusFilter('all');
    setDateFrom('');
    setDateTo('');
    setServerOrders(null);
  };

  const getOrderEdit = (po: PrintingOrderRecord) => {
    if (editMap[po.id]) return editMap[po.id];
    const cp = (po.customerParameters || {}) as Record<string, any>;
    const conf = (po.confirmedParameters || {}) as Record<string, any>;
    return {
      orderStatus: po.orderStatus,
      slicingStatus: po.slicingStatus,
      totalInr: String(po.quotedPriceInr ?? po.totalInr ?? 0),
      productionNotes: po.productionNotes || '',
      trackingCourier: po.trackingCourier || '',
      trackingId: po.trackingId || '',
      trackingUrl: po.trackingUrl || '',
      customerDownloadEnabled: po.customerDownloadEnabled !== false,
      confirmedMaterialName: String(conf.materialName ?? po.materialName),
      confirmedLayerHeightMm: String(conf.layerHeightMm ?? po.layerHeightMm),
      confirmedInfillPercent: String(conf.infillPercent ?? po.infillPercent),
      confirmedWallCount: String(conf.wallCount ?? po.wallCount ?? cp.wallCount ?? 3),
      confirmedPrintSpeedMmS: String(conf.printSpeedMmS ?? po.printSpeedMmS ?? cp.printSpeedMmS ?? 60),
      confirmedNozzleDiameterMm: String(conf.nozzleDiameterMm ?? po.nozzleDiameterMm ?? cp.nozzleDiameterMm ?? 0.4),
      confirmedBuildOrientation: String(conf.buildOrientation ?? po.buildOrientation ?? cp.buildOrientation ?? 'Auto Optimal'),
      confirmedFinishingOption: String(conf.finishingOption ?? po.finishingOption ?? 'Standard As-Printed'),
      confirmedSupportEnabled:
        conf.supportEnabled !== undefined ? Boolean(conf.supportEnabled) : Boolean(po.supportEnabled),
      confirmedNotes: String(conf.engineeringNotes ?? ''),
    };
  };

  const patchOrderEdit = (id: number, po: PrintingOrderRecord, patch: Record<string, any>) => {
    setEditMap((prev) => ({
      ...prev,
      [id]: {
        ...getOrderEdit(po),
        ...patch,
      },
    }));
  };

  const handleSaveOrder = async (po: PrintingOrderRecord, includeConfirmedParams: boolean) => {
    const ed = getOrderEdit(po);
    setSavingId(po.id);
    try {
      const payload: Record<string, any> = {
        orderStatus: ed.orderStatus,
        slicingStatus: ed.slicingStatus,
        totalInr: Number(ed.totalInr),
        quotedPriceInr: Number(ed.totalInr),
        productionNotes: ed.productionNotes,
        trackingCourier: ed.trackingCourier,
        trackingId: ed.trackingId,
        trackingUrl: ed.trackingUrl,
        customerDownloadEnabled: Boolean(ed.customerDownloadEnabled),
      };

      if (includeConfirmedParams) {
        payload.confirmedParameters = {
          materialName: ed.confirmedMaterialName,
          layerHeightMm: Number(ed.confirmedLayerHeightMm),
          infillPercent: Number(ed.confirmedInfillPercent),
          wallCount: Number(ed.confirmedWallCount),
          printSpeedMmS: Number(ed.confirmedPrintSpeedMmS),
          nozzleDiameterMm: Number(ed.confirmedNozzleDiameterMm),
          buildOrientation: ed.confirmedBuildOrientation,
          finishingOption: ed.confirmedFinishingOption,
          supportEnabled: Boolean(ed.confirmedSupportEnabled),
          engineeringNotes: ed.confirmedNotes,
        };
      }

      await apiFetch(`/api/admin/printing-orders/${po.id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      notify(`Updated ${po.orderNumber} (${ed.orderStatus}).`, 'success');
      setServerOrders(null);
      onRefresh();
    } catch (err: any) {
      notify(err?.message || 'Failed to save 3D printing enquiry update.', 'error');
    } finally {
      setSavingId(null);
    }
  };

  const handleSubmitQuotation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quoteModal) return;
    const price = Number(quoteModal.quotedPriceInr);
    if (!Number.isFinite(price) || price <= 0) {
      notify('Please enter a valid positive quoted price (₹).', 'error');
      return;
    }
    setQuoteModal((prev) => (prev ? { ...prev, busy: true } : null));
    try {
      await apiFetch(`/api/admin/printing-orders/${quoteModal.order.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          quotedPriceInr: Math.round(price),
          totalInr: Math.round(price),
          slicingStatus: quoteModal.slicingStatus,
          productionNotes: quoteModal.notes,
        }),
      });
      notify(`Quotation updated for ${quoteModal.order.orderNumber}: ₹${Math.round(price).toLocaleString('en-IN')}.`, 'success');
      setQuoteModal(null);
      setServerOrders(null);
      onRefresh();
    } catch (err: any) {
      notify(err?.message || 'Failed to update quotation.', 'error');
      setQuoteModal((prev) => (prev ? { ...prev, busy: false } : null));
    }
  };

  const handleSubmitPaymentStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentModal) return;
    setPaymentModal((prev) => (prev ? { ...prev, busy: true } : null));
    try {
      await apiFetch(`/api/admin/printing-orders/${paymentModal.order.id}/payment-status`, {
        method: 'PATCH',
        body: JSON.stringify({
          paymentStatus: paymentModal.paymentStatus,
          paymentId: paymentModal.paymentId,
          note: paymentModal.note,
        }),
      });
      notify(`Payment status updated for ${paymentModal.order.orderNumber}.`, 'success');
      setPaymentModal(null);
      setServerOrders(null);
      onRefresh();
    } catch (err: any) {
      notify(err?.message || 'Failed to update payment status.', 'error');
      setPaymentModal((prev) => (prev ? { ...prev, busy: false } : null));
    }
  };

  const handleApproveForPrinting = async (po: PrintingOrderRecord) => {
    const payMeta = getPaymentBadgeMeta(po);
    if (!payMeta.isPaid) {
      notify('Payment Not Completed — Customer payment must be verified before approving for 3D printing.', 'error');
      return;
    }
    setSavingId(po.id);
    try {
      await apiFetch(`/api/admin/printing-orders/${po.id}/approve-printing`, {
        method: 'POST',
        body: JSON.stringify({ orderStatus: 'Ready for Printing' }),
      });
      notify(`${po.orderNumber} approved for 3D printing!`, 'success');
      setServerOrders(null);
      onRefresh();
    } catch (err: any) {
      notify(err?.message || 'Cannot approve for printing.', 'error');
    } finally {
      setSavingId(null);
    }
  };

  const handleConfirmReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectModal) return;
    setRejectModal((prev) => (prev ? { ...prev, busy: true } : null));
    try {
      await apiFetch(`/api/admin/printing-orders/${rejectModal.order.id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason: rejectModal.reason }),
      });
      notify(`Enquiry ${rejectModal.order.orderNumber} rejected.`, 'info');
      setRejectModal(null);
      setServerOrders(null);
      onRefresh();
    } catch (err: any) {
      notify(err?.message || 'Failed to reject enquiry.', 'error');
      setRejectModal((prev) => (prev ? { ...prev, busy: false } : null));
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteModal) return;
    const cleanReason = deleteModal.reason.trim();
    if (!cleanReason) {
      notify('Please enter an archive reason before archiving this 3D printing enquiry.', 'error');
      return;
    }
    setDeleteModal((prev) => (prev ? { ...prev, busy: true } : null));
    try {
      await apiFetch(`/api/admin/printing-orders/${deleteModal.order.id}`, {
        method: 'DELETE',
        body: JSON.stringify({ reason: cleanReason }),
      });
      notify(
        `Enquiry ${deleteModal.order.orderNumber} archived safely. Original record, 3D file metadata, and audit history remain preserved.`,
        'info'
      );
      if (expandedId === deleteModal.order.id) setExpandedId(null);
      setDeleteModal(null);
      setServerOrders(null);
      onRefresh();
    } catch (err: any) {
      notify(err?.message || 'Failed to archive 3D printing enquiry.', 'error');
      setDeleteModal((prev) => (prev ? { ...prev, busy: false } : null));
    }
  };

  const authorizedFetchBlob = async (url: string, fallbackFileName?: string): Promise<Blob> => {
    const idToken = await getIdToken();
    const headers: Record<string, string> = {};
    if (idToken) headers.Authorization = `Bearer ${idToken}`;
    const resp = await fetch(url, { headers, credentials: 'same-origin' });
    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({ error: `Blocked (HTTP ${resp.status})` }));
      throw new Error(errData.error || `Request failed (${resp.status})`);
    }
    const ctype = resp.headers.get('content-type') || '';
    if (ctype.includes('application/json') && !fallbackFileName?.endsWith('.json')) {
      const payload = await resp.json();
      if (payload?.signedUrl) {
        try {
          const signedResp = await fetch(payload.signedUrl);
          if (signedResp.ok) {
            return signedResp.blob();
          }
        } catch {
          // Fall back to authenticated backend proxy stream
        }
        const proxyUrl = `${url.replace(/[?&]format=json/, '')}${url.includes('?') ? '&' : '?'}proxy=1`;
        const proxyResp = await fetch(proxyUrl, { headers, credentials: 'same-origin' });
        if (!proxyResp.ok) throw new Error('Signed URL and backend proxy download failed.');
        return proxyResp.blob();
      }
      return new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    }
    return resp.blob();
  };

  const triggerBlobDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleDownloadOriginal = async (po: PrintingOrderRecord) => {
    setDownloadingId(po.id);
    try {
      const blob = await authorizedFetchBlob(
        `/api/admin/printing-orders/${po.id}/download-original?format=json`,
        po.fileName
      );
      triggerBlobDownload(blob, po.fileName);
      notify(`Downloaded original 3D file (${po.fileName}). Logged in audit history.`, 'success');
      onRefresh();
    } catch (err: any) {
      notify(err?.message || 'Unable to download 3D file.', 'error');
      onRefresh();
    } finally {
      setDownloadingId(null);
    }
  };

  const handleOpenPreview = async (po: PrintingOrderRecord) => {
    setPreviewState({ order: po, buffer: null, loading: true, error: '' });
    try {
      const idToken = await getIdToken();
      const headers: Record<string, string> = {};
      if (idToken) headers.Authorization = `Bearer ${idToken}`;
      const resp = await fetch(
        `/api/admin/printing-orders/${po.id}/download-original?mode=preview&format=json`,
        { headers, credentials: 'same-origin' }
      );
      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({ error: 'Unable to load 3D model stream.' }));
        throw new Error(errData.error || 'Preview failed.');
      }
      let buffer: ArrayBuffer | null = null;
      const ctype = resp.headers.get('content-type') || '';
      if (ctype.includes('application/json')) {
        const payload = await resp.json();
        if (payload?.signedUrl) {
          try {
            const fileResp = await fetch(payload.signedUrl);
            if (fileResp.ok) {
              buffer = await fileResp.arrayBuffer();
            }
          } catch {
            // fallback to backend proxy below
          }
        }
        if (!buffer) {
          const proxyResp = await fetch(
            `/api/admin/printing-orders/${po.id}/download-original?mode=preview&proxy=1`,
            { headers, credentials: 'same-origin' }
          );
          if (!proxyResp.ok) throw new Error('Could not load 3D preview stream.');
          buffer = await proxyResp.arrayBuffer();
        }
      } else {
        buffer = await resp.arrayBuffer();
      }
      setPreviewState({ order: po, buffer, loading: false, error: '' });
    } catch (err: any) {
      setPreviewState({
        order: po,
        buffer: null,
        loading: false,
        error: err?.message || 'Unable to preview 3D file.',
      });
    }
  };

  const handleDownloadSpecSheet = async (po: PrintingOrderRecord) => {
    try {
      const blob = await authorizedFetchBlob(
        `/api/admin/printing-orders/${po.id}/spec-sheet`,
        `${po.orderNumber}-printing-specs.json`
      );
      triggerBlobDownload(blob, `${po.orderNumber}-printing-specs.json`);
      notify(`Spec sheet exported for ${po.orderNumber}.`, 'success');
    } catch (err: any) {
      notify(err?.message || 'Failed to download spec sheet.', 'error');
    }
  };

  const handleUploadProductionFile = async (po: PrintingOrderRecord) => {
    const entry = prodUploadForm[po.id];
    if (!entry?.file) {
      notify('Select a sliced/production file (.gcode, .3mf, .stl, .zip, .pdf) first.', 'error');
      return;
    }
    setUploadingProdId(po.id);
    try {
      const fd = new FormData();
      fd.append('file', entry.file);
      fd.append('fileKind', entry.fileKind || 'sliced_gcode');
      fd.append('notes', entry.notes || '');
      await apiFetch(`/api/admin/printing-orders/${po.id}/production-files`, {
        method: 'POST',
        body: fd,
      });
      notify(`Production file uploaded separately for ${po.orderNumber}. Original file untouched.`, 'success');
      setProdUploadForm((prev) => ({
        ...prev,
        [po.id]: { file: null, fileKind: 'sliced_gcode', notes: '' },
      }));
      setServerOrders(null);
      onRefresh();
    } catch (err: any) {
      notify(err?.message || 'Failed to upload production file.', 'error');
    } finally {
      setUploadingProdId(null);
    }
  };

  const handleDownloadProductionFile = async (poId: number, fileId: number, fileName: string) => {
    try {
      const blob = await authorizedFetchBlob(
        `/api/admin/printing-orders/${poId}/production-files/${fileId}/download`,
        fileName
      );
      triggerBlobDownload(blob, fileName);
      notify(`Downloaded production file ${fileName}.`, 'success');
    } catch (err: any) {
      notify(err?.message || 'Failed to download production file.', 'error');
    }
  };

  const exportCsv = () => {
    const header = [
      'Enquiry ID',
      'Customer Name',
      'Email Address',
      'Phone Number',
      '3D File Name',
      'File Format',
      'File Size',
      'Enquiry Date',
      'Quoted Price INR',
      'Payment Status',
      'Printing Status',
    ];
    const rows = filteredOrders.map((o) => [
      o.orderNumber,
      o.customerName || '',
      o.customerEmail || o.email || '',
      o.customerMobile || o.phone || '',
      o.fileName,
      o.fileFormat,
      formatFileSize(o.fileSizeBytes),
      new Date(o.createdAt).toISOString(),
      o.quotedPriceInr ?? o.totalInr,
      getPaymentBadgeMeta(o).label,
      o.orderStatus,
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');
    triggerBlobDownload(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), 'nexustek-3d-printing-enquiries.csv');
  };

  return (
    <div className="space-y-5 text-xs">
      {/* KPI Metrics Bar */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-[#DCEAF5] bg-white p-4">
          <div className="text-[#263746]/70">Total 3D Enquiries</div>
          <div className="font-mono text-2xl font-bold text-[#123B5D] mt-1 tabular-nums">{metrics.total}</div>
        </div>
        <div className="rounded-xl border border-[#90CAF9] bg-[#F0F8FF] p-4">
          <div className="text-[#42A5F5] font-medium flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5" /> Payment Completed (Print Ready)
          </div>
          <div className="font-mono text-2xl font-bold text-[#123B5D] mt-1 tabular-nums">{metrics.paidReady}</div>
        </div>
        <div className="rounded-xl border border-amber-200 bg-white p-4">
          <div className="text-amber-700 font-medium flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" /> Payment Not Completed (Print Locked)
          </div>
          <div className="font-mono text-2xl font-bold text-amber-800 mt-1 tabular-nums">{metrics.paymentPending}</div>
        </div>
        <div className="rounded-xl border border-[#DCEAF5] bg-white p-4">
          <div className="text-[#263746]/70 flex items-center gap-1.5">
            <Printer className="w-3.5 h-3.5 text-[#42A5F5]" /> Approved / In Printing
          </div>
          <div className="font-mono text-2xl font-bold text-[#123B5D] mt-1 tabular-nums">{metrics.inProd}</div>
        </div>
      </div>

      {/* Filter & Search Toolbar */}
      <div className="rounded-xl border border-[#DCEAF5] bg-white p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2 font-display font-bold text-base text-[#123B5D]">
              <Filter className="w-4 h-4 text-[#42A5F5]" />
              <span>3D Printing Enquiries &amp; Admin CAD File Management</span>
            </div>
            <p className="text-[11px] text-[#263746]/70 mt-0.5">
              Admins can immediately preview and download any uploaded 3D model to prepare quotations. Marking a job ready or approving for printing requires verified payment.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={exportCsv}
              className="px-3 py-1.5 border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] rounded-lg font-semibold inline-flex items-center gap-1.5 text-[#123B5D] transition-colors"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-[#42A5F5]" /> Export CSV
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5">
          <div className="lg:col-span-2 relative">
            <Search className="w-3.5 h-3.5 text-[#42A5F5] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              placeholder="Search enquiry #, customer, email, phone, 3D file..."
              className="w-full pl-8 pr-3 py-2 rounded-lg border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6]"
            />
          </div>
          <select
            value={paymentFilter}
            onChange={(e) => setPaymentFilter(e.target.value)}
            className="rounded-lg border border-[#DCEAF5] px-2.5 py-2 bg-white font-medium text-[#263746] focus:outline-none focus:border-[#64B5F6]"
          >
            <option value="all">All Payment Statuses</option>
            <option value="pending">Pending Payment</option>
            <option value="paid">Payment Successful</option>
            <option value="failed">Payment Failed</option>
            <option value="refunded">Payment Refunded</option>
          </select>
          <select
            value={orderStatusFilter}
            onChange={(e) => setOrderStatusFilter(e.target.value)}
            className="rounded-lg border border-[#DCEAF5] px-2.5 py-2 bg-white font-medium text-[#263746] focus:outline-none focus:border-[#64B5F6]"
          >
            <option value="all">All Printing Statuses</option>
            {STANDARD_PRINTING_ORDER_STATUSES.map((st) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            title="From date"
            className="rounded-lg border border-[#DCEAF5] bg-white px-2.5 py-2 font-mono text-[#263746] focus:outline-none focus:border-[#64B5F6]"
          />
          <div className="flex gap-1.5">
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              title="To date"
              className="flex-1 rounded-lg border border-[#DCEAF5] bg-white px-2 py-2 font-mono min-w-0 text-[#263746] focus:outline-none focus:border-[#64B5F6]"
            />
            <button
              type="button"
              disabled={filtering}
              onClick={fetchFilteredFromServer}
              className="px-3 py-2 bg-[#64B5F6] hover:bg-[#42A5F5] text-white font-semibold rounded-lg transition-colors"
            >
              {filtering ? '...' : 'Apply'}
            </button>
            {(searchQ || paymentFilter !== 'all' || orderStatusFilter !== 'all' || dateFrom || dateTo || serverOrders !== null) && (
              <button
                type="button"
                onClick={resetFilters}
                className="px-2.5 py-2 border border-[#DCEAF5] rounded-lg text-[#263746] hover:bg-[#F0F8FF]"
              >
                Reset
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Enquiries Summary Table */}
      {filteredOrders.length === 0 ? (
        <div className="rounded-xl border border-[#DCEAF5] bg-white p-8 text-center text-[#263746]/70">
          No 3D printing enquiries match the current filters.
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl border border-[#DCEAF5] bg-white overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#F0F8FF] border-b border-[#DCEAF5] text-[11px] font-mono uppercase text-[#123B5D]">
                  <th className="py-2.5 px-3">Enquiry ID</th>
                  <th className="py-2.5 px-3">Customer Name</th>
                  <th className="py-2.5 px-3">Email Address</th>
                  <th className="py-2.5 px-3">Phone Number</th>
                  <th className="py-2.5 px-3">3D File Name</th>
                  <th className="py-2.5 px-3">File Format</th>
                  <th className="py-2.5 px-3">File Size</th>
                  <th className="py-2.5 px-3">Enquiry Date</th>
                  <th className="py-2.5 px-3">Quoted Price</th>
                  <th className="py-2.5 px-3">Payment Status</th>
                  <th className="py-2.5 px-3">Printing Status</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DCEAF5]/60">
                {filteredOrders.map((po) => {
                  const payMeta = getPaymentBadgeMeta(po);
                  const quoted = po.quotedPriceInr ?? po.totalInr ?? 0;
                  return (
                    <tr key={`row-${po.id}`} className="hover:bg-[#F0F8FF]/40">
                      <td className="py-2.5 px-3 font-mono font-bold text-[#123B5D] whitespace-nowrap">
                        {po.orderNumber}
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-[#123B5D] whitespace-nowrap">
                        {po.customerName || po.deliveryAddress?.fullName || `User #${po.userId}`}
                      </td>
                      <td className="py-2.5 px-3 text-[#123B5D] whitespace-nowrap">
                        {po.customerEmail || po.email || '—'}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-[#263746]/80 whitespace-nowrap">
                        {po.customerMobile || po.phone || '—'}
                      </td>
                      <td className="py-2.5 px-3 font-medium text-[#123B5D] max-w-[180px] truncate" title={po.fileName}>
                        {po.fileName}
                      </td>
                      <td className="py-2.5 px-3 font-mono whitespace-nowrap">
                        {po.fileFormat || 'CAD'}
                      </td>
                      <td className="py-2.5 px-3 font-mono whitespace-nowrap">
                        {formatFileSize(po.fileSizeBytes)}
                      </td>
                      <td className="py-2.5 px-3 font-mono whitespace-nowrap text-[#263746]/80">
                        {new Date(po.uploadedAt || po.createdAt).toLocaleDateString('en-IN')}
                      </td>
                      <td className="py-2.5 px-3 font-mono font-bold text-[#123B5D] whitespace-nowrap">
                        {Number(quoted) > 0 ? `₹${Number(quoted).toLocaleString('en-IN')}` : 'Pending Quote'}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <div className="space-y-0.5">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold border ${
                              payMeta.isPaid
                                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                                : payMeta.code === 'pending'
                                ? 'bg-amber-50 border-amber-200 text-amber-800'
                                : 'bg-red-50 border-red-200 text-red-800'
                            }`}
                          >
                            {payMeta.label}
                          </span>
                          <div
                            className={`text-[10px] font-semibold ${
                              payMeta.isPaid ? 'text-emerald-700' : 'text-amber-700'
                            }`}
                          >
                            {payMeta.isPaid ? 'Payment Completed' : 'Payment Not Completed'}
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-[#123B5D] whitespace-nowrap">
                        {po.orderStatus}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setExpandedId(po.id);
                              document
                                .getElementById(`printing-enquiry-card-${po.id}`)
                                ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                            }}
                            title="View Enquiry Details"
                            className="px-2 py-1 rounded border border-[#90CAF9] bg-[#F0F8FF] hover:bg-[#DCEAF5] text-[#123B5D] font-semibold text-[11px]"
                          >
                            View
                          </button>
                          <button
                            type="button"
                            disabled={downloadingId === po.id}
                            onClick={() => handleDownloadOriginal(po)}
                            title="Download 3D File (always allowed even if unpaid)"
                            className="px-2 py-1 rounded bg-[#64B5F6] hover:bg-[#42A5F5] text-white font-semibold text-[11px] disabled:opacity-60 inline-flex items-center gap-1"
                          >
                            <Download className="w-3 h-3" />
                            {downloadingId === po.id ? '...' : '3D File'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteModal({ order: po, reason: '', busy: false })}
                            title="Archive Enquiry (Non-Destructive)"
                            className="px-2 py-1 rounded border border-amber-300 hover:bg-amber-50 text-amber-800 font-semibold text-[11px]"
                          >
                            Archive
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Detailed Enquiry Cards & Actions */}
          {filteredOrders.map((po) => {
            const ed = getOrderEdit(po);
            const isExpanded = expandedId === po.id;
            const cp = (po.customerParameters || {}) as Record<string, any>;
            const dims = po.boundingBoxMm || cp.dimensionsMm || null;
            const payMeta = getPaymentBadgeMeta(po);
            const quoted = po.quotedPriceInr ?? po.totalInr ?? 0;
            const statusOptions = Array.from(
              new Set([po.orderStatus, ...STANDARD_PRINTING_ORDER_STATUSES])
            );
            const prodDraft = prodUploadForm[po.id] || {
              file: null,
              fileKind: 'sliced_gcode',
              notes: '',
            };
            const canApprovePrinting = payMeta.isPaid && !['Rejected', 'Cancelled'].includes(po.orderStatus);

            return (
              <div
                id={`printing-enquiry-card-${po.id}`}
                key={po.id}
                className={`rounded-xl border bg-white p-5 space-y-4 ${
                  payMeta.isPaid ? 'border-[#DCEAF5]' : 'border-amber-200'
                }`}
              >
                {/* Card Header */}
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 border-b border-[#DCEAF5]/60 pb-4">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-bold text-sm text-[#123B5D]">
                        {po.orderNumber}
                      </span>
                      <span className="font-mono text-[#263746]/70">
                        · {po.fileFormat || 'CAD'} · {po.fileVersion || 'v1'} · {formatFileSize(po.fileSizeBytes)}
                      </span>
                      <span className="font-mono text-[#263746]/60">
                        · Enquiry Date: {new Date(po.uploadedAt || po.createdAt).toLocaleString('en-IN')}
                      </span>
                    </div>
                    <div className="font-display font-bold text-base text-[#123B5D]">
                      3D File: {po.fileName}
                    </div>
                    <div className="text-[#263746]/80">
                      Customer:{' '}
                      <span className="font-semibold text-[#123B5D]">
                        {po.customerName || po.deliveryAddress?.fullName || `User #${po.userId}`}
                      </span>
                      {(po.customerEmail || po.email) ? ` · ${po.customerEmail || po.email}` : ''}
                      {(po.customerMobile || po.phone) ? ` · ${po.customerMobile || po.phone}` : ''}
                    </div>
                    <div className="text-[#263746]/80 font-mono">
                      {po.technology} · {po.materialName} ({po.colorName}) · Qty {po.quantity} ·{' '}
                      {po.layerHeightMm}mm layer · {po.infillPercent}% infill ·{' '}
                      {po.wallCount ?? cp.wallCount ?? 3} walls ·{' '}
                      {po.printSpeedMmS ?? cp.printSpeedMmS ?? 60} mm/s
                    </div>
                  </div>

                  {/* Quoted Price & Payment Status Badge */}
                  <div className="flex flex-col items-start lg:items-end gap-2">
                    <div className="font-mono font-bold text-base text-[#123B5D] tabular-nums">
                      Quoted Price: {Number(quoted) > 0 ? `₹${Number(quoted).toLocaleString('en-IN')}` : 'Pending Quote'}
                    </div>

                    <div
                      className={`px-3 py-1.5 rounded-lg border text-xs font-semibold inline-flex items-center gap-1.5 ${
                        payMeta.isPaid
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                          : payMeta.code === 'pending'
                          ? 'border-amber-200 bg-amber-50 text-amber-900'
                          : 'border-red-200 bg-red-50 text-red-900'
                      }`}
                    >
                      {payMeta.isPaid ? (
                        <>
                          <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" />
                          <span>Payment Completed ({payMeta.label})</span>
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-700" />
                          <span>{payMeta.label} — {payMeta.warningText}</span>
                        </>
                      )}
                    </div>

                    <div className="font-mono text-[11px] text-[#263746]/70">
                      Printing Status: <strong className="text-[#123B5D]">{po.orderStatus}</strong>
                      {po.razorpayPaymentId ? ` · Payment ID: ${po.razorpayPaymentId}` : ''}
                    </div>
                  </div>
                </div>

                {/* Primary 8 Admin Actions Bar */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {/* 1. View Enquiry */}
                    <button
                      type="button"
                      onClick={() => setExpandedId(isExpanded ? null : po.id)}
                      className="px-3 py-2 rounded-lg border border-[#90CAF9] bg-[#F0F8FF] hover:bg-[#DCEAF5]/60 text-[#123B5D] font-semibold inline-flex items-center gap-1.5 transition-colors"
                    >
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      {isExpanded ? 'Hide Enquiry' : 'View Enquiry'}
                    </button>

                    {/* 2. Download 3D File (ALWAYS ENABLED even when unpaid) */}
                    <button
                      type="button"
                      disabled={downloadingId === po.id}
                      onClick={() => handleDownloadOriginal(po)}
                      title="Download original 3D model file immediately (allowed regardless of payment status)"
                      className="px-3 py-2 rounded-lg bg-[#64B5F6] hover:bg-[#42A5F5] text-white font-semibold inline-flex items-center gap-1.5 disabled:opacity-60 transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" />
                      {downloadingId === po.id ? 'Downloading...' : 'Download 3D File'}
                    </button>

                    {/* 3D Preview (ALWAYS ENABLED) */}
                    <button
                      type="button"
                      onClick={() => handleOpenPreview(po)}
                      title="Inspect uploaded 3D model in 3D geometry viewer"
                      className="px-3 py-2 rounded-lg border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] font-semibold inline-flex items-center gap-1.5 transition-colors"
                    >
                      <Eye className="w-3.5 h-3.5 text-[#42A5F5]" />
                      3D Preview
                    </button>

                    {/* 3. View Customer Details */}
                    <button
                      type="button"
                      onClick={() => setCustomerModalOrder(po)}
                      className="px-3 py-2 rounded-lg border border-[#DCEAF5] bg-white hover:bg-[#F0F8FF] text-[#123B5D] font-semibold inline-flex items-center gap-1.5 transition-colors"
                    >
                      <User className="w-3.5 h-3.5 text-[#42A5F5]" />
                      View Customer Details
                    </button>

                    {/* 4. Update Quotation */}
                    <button
                      type="button"
                      onClick={() =>
                        setQuoteModal({
                          order: po,
                          quotedPriceInr: String(po.quotedPriceInr ?? po.totalInr ?? ''),
                          slicingStatus: po.slicingStatus || 'Slicing Completed',
                          notes: po.productionNotes || '',
                          busy: false,
                        })
                      }
                      className="px-3 py-2 rounded-lg border border-[#DCEAF5] bg-white hover:bg-[#F0F8FF] text-[#123B5D] font-semibold inline-flex items-center gap-1.5 transition-colors"
                    >
                      <IndianRupee className="w-3.5 h-3.5 text-[#42A5F5]" />
                      Update Quotation
                    </button>

                    {/* 5. Update Payment Status */}
                    <button
                      type="button"
                      onClick={() =>
                        setPaymentModal({
                          order: po,
                          paymentStatus: payMeta.code,
                          paymentId: po.razorpayPaymentId || '',
                          note: '',
                          busy: false,
                        })
                      }
                      className="px-3 py-2 rounded-lg border border-[#DCEAF5] bg-white hover:bg-[#F0F8FF] text-[#123B5D] font-semibold inline-flex items-center gap-1.5 transition-colors"
                    >
                      <CreditCard className="w-3.5 h-3.5 text-[#42A5F5]" />
                      Update Payment Status
                    </button>

                    {/* 6. Approve for Printing (Gated behind Payment Verification) */}
                    <button
                      type="button"
                      disabled={!canApprovePrinting || savingId === po.id}
                      onClick={() => handleApproveForPrinting(po)}
                      title={
                        canApprovePrinting
                          ? 'Authorize and mark enquiry Ready for Printing'
                          : 'Payment Not Completed — Verify payment before approving for printing'
                      }
                      className={`px-3 py-2 rounded-lg font-semibold inline-flex items-center gap-1.5 transition-colors ${
                        canApprovePrinting
                          ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                          : 'border border-amber-200 bg-amber-50 text-amber-700/70 cursor-not-allowed'
                      }`}
                    >
                      <Printer className="w-3.5 h-3.5" />
                      Approve for Printing
                    </button>

                    {/* 7. Reject Enquiry */}
                    <button
                      type="button"
                      onClick={() =>
                        setRejectModal({
                          order: po,
                          reason: po.rejectionReason || '',
                          busy: false,
                        })
                      }
                      className="px-3 py-2 rounded-lg border border-amber-300 bg-white hover:bg-amber-50 text-amber-800 font-semibold inline-flex items-center gap-1.5 transition-colors"
                    >
                      <Ban className="w-3.5 h-3.5" />
                      Reject Enquiry
                    </button>

                    {/* 8. Archive Enquiry (Non-Destructive) */}
                    <button
                      type="button"
                      onClick={() => setDeleteModal({ order: po, reason: '', busy: false })}
                      className="px-3 py-2 rounded-lg border border-amber-300 bg-white hover:bg-amber-50 text-amber-800 font-semibold inline-flex items-center gap-1.5 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Archive Enquiry
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDownloadSpecSheet(po)}
                      className="px-3 py-2 rounded-lg border border-[#DCEAF5] bg-white hover:bg-[#F0F8FF] text-[#123B5D] font-semibold inline-flex items-center gap-1.5 transition-colors"
                    >
                      <FileCode2 className="w-3.5 h-3.5 text-[#42A5F5]" />
                      Spec Sheet
                    </button>
                  </div>

                  {/* Quick Printing Workflow Controls */}
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={ed.orderStatus}
                      onChange={(e) => patchOrderEdit(po.id, po, { orderStatus: e.target.value })}
                      className="rounded-lg border border-[#DCEAF5] px-2.5 py-1.5 bg-white font-semibold text-[#123B5D] focus:outline-none focus:border-[#64B5F6]"
                      title="Printing / Enquiry Status"
                    >
                      {statusOptions.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      disabled={savingId === po.id}
                      onClick={() => handleSaveOrder(po, false)}
                      className="px-3 py-1.5 bg-[#123B5D] hover:bg-[#1b4d78] text-white rounded-lg font-semibold disabled:opacity-50 transition-colors"
                    >
                      {savingId === po.id ? 'Saving...' : 'Save Status'}
                    </button>
                  </div>
                </div>

                {/* Unpaid vs Paid Clear Warning Banner */}
                {!payMeta.isPaid ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50/70 px-3.5 py-2 text-amber-900 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                    <span>
                      <strong>Payment Not Completed ({payMeta.label}):</strong> You can download and inspect the 3D model and update the quotation right now. Marking the job Ready for Printing is blocked until payment is verified as <strong>Payment Successful</strong>.
                    </span>
                  </div>
                ) : (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 px-3.5 py-2 text-emerald-900 flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0" />
                    <span>
                      <strong>Payment Completed:</strong> Payment verified{po.printingApprovedBy ? ` · Approved for printing by ${po.printingApprovedBy}` : ' · 3D printing authorization is enabled'}.
                    </span>
                  </div>
                )}

                {po.orderStatus === 'Rejected' && po.rejectionReason && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2 text-red-900">
                    <strong>Rejected Reason:</strong> {po.rejectionReason}
                  </div>
                )}

                {/* Expanded Workbench Drawer */}
                {isExpanded && (
                  <div className="border-t border-[#DCEAF5] pt-4 space-y-5">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                      {/* Left: Immutable Customer Original Parameters */}
                      <div className="rounded-xl border border-[#DCEAF5] bg-[#F0F8FF]/60 p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <h4 className="font-display font-bold text-sm text-[#123B5D]">
                            Customer Submitted CAD &amp; Parameters
                          </h4>
                          <span className="font-mono text-[11px] text-[#263746]/70">Snapshot</span>
                        </div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-2 font-mono text-[11px]">
                          <div>
                            <span className="text-[#263746]/70 block font-sans">Original 3D File</span>
                            <span className="font-semibold text-[#123B5D] break-all">{cp.originalFilename || po.fileName}</span>
                          </div>
                          <div>
                            <span className="text-[#263746]/70 block font-sans">Technology / Printer</span>
                            <span className="font-semibold text-[#123B5D]">
                              {cp.technology || po.technology} · {cp.printerName || po.printerName || 'Standard'}
                            </span>
                          </div>
                          <div>
                            <span className="text-[#263746]/70 block font-sans">Material &amp; Colour</span>
                            <span className="font-semibold text-[#123B5D]">
                              {cp.materialName || po.materialName} ({cp.colorName || po.colorName})
                            </span>
                          </div>
                          <div>
                            <span className="text-[#263746]/70 block font-sans">Layer Height / Infill</span>
                            <span className="font-semibold text-[#123B5D]">
                              {cp.layerHeightMm ?? po.layerHeightMm} mm / {cp.infillPercent ?? po.infillPercent}%
                            </span>
                          </div>
                          <div>
                            <span className="text-[#263746]/70 block font-sans">Walls / Nozzle / Speed</span>
                            <span className="font-semibold text-[#123B5D]">
                              {cp.wallCount ?? po.wallCount ?? 3} walls · {cp.nozzleDiameterMm ?? po.nozzleDiameterMm ?? 0.4} mm · {cp.printSpeedMmS ?? po.printSpeedMmS ?? 60} mm/s
                            </span>
                          </div>
                          <div>
                            <span className="text-[#263746]/70 block font-sans">Orientation / Scale / Supports</span>
                            <span className="font-semibold text-[#123B5D]">
                              {cp.buildOrientation ?? po.buildOrientation ?? 'Auto Optimal'} · {cp.scalePercent ?? po.scalePercent ?? 100}% · {(cp.supportEnabled ?? po.supportEnabled) ? 'Supports Yes' : 'Supports No'}
                            </span>
                          </div>
                          <div>
                            <span className="text-[#263746]/70 block font-sans">Quantity / Finishing</span>
                            <span className="font-semibold text-[#123B5D]">
                              {cp.quantity ?? po.quantity} · {cp.finishingOption || po.finishingOption}
                            </span>
                          </div>
                          <div>
                            <span className="text-[#263746]/70 block font-sans">Dimensions / Volume / Mass</span>
                            <span className="font-semibold text-[#123B5D]">
                              {dims ? `${dims.x}×${dims.y}×${dims.z} mm` : 'Pending'} · {po.volumeCm3} cm³ · {po.estimatedWeightG} g
                            </span>
                          </div>
                        </div>
                        {po.specialInstructions && (
                          <div className="rounded-lg bg-white border border-[#DCEAF5] p-2.5 text-[#263746]">
                            <span className="font-semibold text-[#123B5D]">Customer Notes: </span>
                            {po.specialInstructions}
                          </div>
                        )}
                        {po.deliveryAddress && (
                          <div className="rounded-lg bg-white border border-[#DCEAF5] p-2.5 text-[#263746]">
                            <span className="font-semibold text-[#123B5D]">Delivery Address: </span>
                            {po.deliveryAddress.fullName},{' '}
                            {[
                              po.deliveryAddress.houseFlat,
                              po.deliveryAddress.streetArea,
                              (po.deliveryAddress as Record<string, any>).line1,
                            ]
                              .filter(Boolean)
                              .join(', ')}
                            , {po.deliveryAddress.city}, {po.deliveryAddress.state} - {po.deliveryAddress.pinCode} ({po.deliveryAddress.mobile})
                          </div>
                        )}
                      </div>

                      {/* Right: Admin Confirmed Parameters & Logistics */}
                      <div className="rounded-xl border border-[#90CAF9] bg-white p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <h4 className="font-display font-bold text-sm text-[#123B5D]">
                            Admin Confirmed Parameters &amp; Logistics
                          </h4>
                          {po.confirmedParameters?.confirmedBy && (
                            <span className="text-[11px] text-[#42A5F5] font-mono">
                              Confirmed by {po.confirmedParameters.confirmedBy}
                            </span>
                          )}
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                          <div>
                            <label className="block text-[11px] text-[#263746]/70 mb-1">Material</label>
                            <input
                              value={ed.confirmedMaterialName}
                              onChange={(e) => patchOrderEdit(po.id, po, { confirmedMaterialName: e.target.value })}
                              className="w-full rounded-lg border border-[#DCEAF5] bg-white px-2.5 py-1.5 text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] text-[#263746]/70 mb-1">Layer (mm)</label>
                            <input
                              type="number"
                              step="0.05"
                              value={ed.confirmedLayerHeightMm}
                              onChange={(e) => patchOrderEdit(po.id, po, { confirmedLayerHeightMm: e.target.value })}
                              className="w-full rounded-lg border border-[#DCEAF5] bg-white px-2.5 py-1.5 font-mono text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] text-[#263746]/70 mb-1">Infill (%)</label>
                            <input
                              type="number"
                              value={ed.confirmedInfillPercent}
                              onChange={(e) => patchOrderEdit(po.id, po, { confirmedInfillPercent: e.target.value })}
                              className="w-full rounded-lg border border-[#DCEAF5] bg-white px-2.5 py-1.5 font-mono text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] text-[#263746]/70 mb-1">Walls</label>
                            <input
                              type="number"
                              value={ed.confirmedWallCount}
                              onChange={(e) => patchOrderEdit(po.id, po, { confirmedWallCount: e.target.value })}
                              className="w-full rounded-lg border border-[#DCEAF5] bg-white px-2.5 py-1.5 font-mono text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] text-[#263746]/70 mb-1">Nozzle (mm)</label>
                            <input
                              type="number"
                              step="0.1"
                              value={ed.confirmedNozzleDiameterMm}
                              onChange={(e) => patchOrderEdit(po.id, po, { confirmedNozzleDiameterMm: e.target.value })}
                              className="w-full rounded-lg border border-[#DCEAF5] bg-white px-2.5 py-1.5 font-mono text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] text-[#263746]/70 mb-1">Speed (mm/s)</label>
                            <input
                              type="number"
                              value={ed.confirmedPrintSpeedMmS}
                              onChange={(e) => patchOrderEdit(po.id, po, { confirmedPrintSpeedMmS: e.target.value })}
                              className="w-full rounded-lg border border-[#DCEAF5] bg-white px-2.5 py-1.5 font-mono text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          <input
                            placeholder="Build Orientation"
                            value={ed.confirmedBuildOrientation}
                            onChange={(e) => patchOrderEdit(po.id, po, { confirmedBuildOrientation: e.target.value })}
                            className="rounded-lg border border-[#DCEAF5] bg-white px-2.5 py-1.5 text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                          />
                          <input
                            placeholder="Confirmed Finishing"
                            value={ed.confirmedFinishingOption}
                            onChange={(e) => patchOrderEdit(po.id, po, { confirmedFinishingOption: e.target.value })}
                            className="rounded-lg border border-[#DCEAF5] bg-white px-2.5 py-1.5 text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                          />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                          <input
                            placeholder="Courier (e.g. Delhivery)"
                            value={ed.trackingCourier}
                            onChange={(e) => patchOrderEdit(po.id, po, { trackingCourier: e.target.value })}
                            className="rounded-lg border border-[#DCEAF5] bg-white px-2.5 py-1.5 text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                          />
                          <input
                            placeholder="Tracking / AWB ID"
                            value={ed.trackingId}
                            onChange={(e) => patchOrderEdit(po.id, po, { trackingId: e.target.value })}
                            className="rounded-lg border border-[#DCEAF5] bg-white px-2.5 py-1.5 font-mono text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                          />
                          <input
                            placeholder="Tracking URL"
                            value={ed.trackingUrl}
                            onChange={(e) => patchOrderEdit(po.id, po, { trackingUrl: e.target.value })}
                            className="rounded-lg border border-[#DCEAF5] bg-white px-2.5 py-1.5 text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                          />
                        </div>

                        <textarea
                          rows={2}
                          placeholder="Internal production notes / slicer profile observations..."
                          value={ed.productionNotes}
                          onChange={(e) => patchOrderEdit(po.id, po, { productionNotes: e.target.value })}
                          className="w-full rounded-lg border border-[#DCEAF5] bg-white px-2.5 py-1.5 text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                        />

                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <label className="flex items-center gap-2 text-[#263746] font-medium">
                            <input
                              type="checkbox"
                              checked={Boolean(ed.customerDownloadEnabled)}
                              onChange={(e) =>
                                patchOrderEdit(po.id, po, { customerDownloadEnabled: e.target.checked })
                              }
                              className="accent-[#64B5F6]"
                            />
                            Allow customer to download their uploaded 3D file
                          </label>
                          <button
                            type="button"
                            disabled={savingId === po.id}
                            onClick={() => handleSaveOrder(po, true)}
                            className="px-4 py-2 bg-[#64B5F6] hover:bg-[#42A5F5] text-white rounded-lg font-semibold inline-flex items-center gap-1.5 transition-colors"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            {savingId === po.id ? 'Saving...' : 'Confirm Parameters & Save'}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Separate Sliced / Production Files Vault */}
                    <div className="rounded-xl border border-[#DCEAF5] bg-[#F0F8FF]/60 p-4 space-y-3">
                      <div>
                        <h4 className="font-display font-bold text-sm text-[#123B5D]">
                          Separate Production &amp; Sliced Files (Original File Never Overwritten)
                        </h4>
                        <p className="text-[#263746]/70">
                          Upload internal G-code (.gcode/.bgcode), repaired STL/3MF, or machine profile archives separately.
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2.5">
                        <select
                          value={prodDraft.fileKind}
                          onChange={(e) =>
                            setProdUploadForm((prev) => ({
                              ...prev,
                              [po.id]: { ...prodDraft, fileKind: e.target.value },
                            }))
                          }
                          className="rounded-lg border border-[#DCEAF5] px-2.5 py-1.5 bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                        >
                          <option value="sliced_gcode">Sliced G-code / Machine Job</option>
                          <option value="repaired_mesh">Repaired / Oriented CAD Mesh</option>
                          <option value="production_notes">Production Setup Package</option>
                        </select>
                        <input
                          type="file"
                          accept=".gcode,.gco,.bgcode,.3mf,.stl,.obj,.step,.stp,.zip,.pdf"
                          onChange={(e) =>
                            setProdUploadForm((prev) => ({
                              ...prev,
                              [po.id]: { ...prodDraft, file: e.target.files?.[0] || null },
                            }))
                          }
                          className="text-xs file:mr-2 file:py-1 file:px-3 file:rounded-md file:border file:border-[#90CAF9] file:bg-white file:text-[#123B5D]"
                        />
                        <input
                          placeholder="Notes (e.g. Bambu X1C 0.2mm PLA profile)"
                          value={prodDraft.notes}
                          onChange={(e) =>
                            setProdUploadForm((prev) => ({
                              ...prev,
                              [po.id]: { ...prodDraft, notes: e.target.value },
                            }))
                          }
                          className="flex-1 min-w-[200px] rounded-lg border border-[#DCEAF5] px-2.5 py-1.5 bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                        />
                        <button
                          type="button"
                          disabled={uploadingProdId === po.id || !prodDraft.file}
                          onClick={() => handleUploadProductionFile(po)}
                          className="px-3.5 py-1.5 bg-[#64B5F6] hover:bg-[#42A5F5] text-white rounded-lg font-semibold inline-flex items-center gap-1.5 disabled:opacity-50 transition-colors"
                        >
                          <Upload className="w-3.5 h-3.5" />
                          {uploadingProdId === po.id ? 'Uploading...' : 'Upload Production File'}
                        </button>
                      </div>

                      {(po.productionFiles || []).length > 0 && (
                        <div className="divide-y divide-[#DCEAF5] rounded-lg border border-[#DCEAF5] bg-white">
                          {(po.productionFiles || []).map((pf) => (
                            <div
                              key={pf.id}
                              className="px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2"
                            >
                              <div>
                                <span className="font-mono font-semibold text-[#123B5D]">
                                  {pf.fileName}
                                </span>{' '}
                                <span className="text-[#263746]/70">
                                  ({pf.fileKind} · {(pf.fileSizeBytes / 1024).toFixed(1)} KB · by {pf.uploadedBy})
                                </span>
                                {pf.notes && <div className="text-[#263746]/80">{pf.notes}</div>}
                              </div>
                              <button
                                type="button"
                                onClick={() => handleDownloadProductionFile(po.id, pf.id, pf.fileName)}
                                className="px-3 py-1.5 border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] rounded-lg font-semibold inline-flex items-center gap-1 transition-colors"
                              >
                                <Download className="w-3.5 h-3.5 text-[#42A5F5]" /> Download
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Download Audit Logs */}
                    <div className="rounded-xl border border-[#DCEAF5] bg-white p-4 space-y-2">
                      <h4 className="font-display font-bold text-sm text-[#123B5D]">
                        File Access &amp; Audit Trail
                      </h4>
                      {(!po.downloadLogs || po.downloadLogs.length === 0) ? (
                        <div className="text-[#263746]/70">No file download attempts logged for this enquiry yet.</div>
                      ) : (
                        <div className="max-h-44 overflow-y-auto divide-y divide-[#DCEAF5]/60 font-mono text-[11px]">
                          {po.downloadLogs.map((log) => (
                            <div key={log.id} className="py-1.5 flex flex-wrap items-center justify-between gap-2">
                              <div>
                                <span
                                  className={`font-bold ${
                                    log.accessGranted ? 'text-[#42A5F5]' : 'text-red-700'
                                  }`}
                                >
                                  {log.accessGranted ? 'GRANTED' : 'BLOCKED'}
                                </span>{' '}
                                · {log.fileKind} · {log.actorEmail} ({log.actorRole})
                                {log.denialReason ? ` — ${log.denialReason}` : ''}
                              </div>
                              <span className="text-[#263746]/60">
                                {new Date(log.createdAt).toLocaleString('en-IN')}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 3D Model Preview Modal */}
      {previewState && (
        <div className="fixed inset-0 z-50 bg-[#123B5D]/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-4xl w-full p-5 space-y-4 shadow-2xl border border-[#DCEAF5]">
            <div className="flex items-center justify-between border-b border-[#DCEAF5] pb-3">
              <div>
                <div className="font-mono text-xs text-[#42A5F5]">
                  {previewState.order.orderNumber} · {previewState.order.materialName} ({previewState.order.colorName})
                </div>
                <h3 className="font-display font-bold text-lg text-[#123B5D]">
                  3D CAD Model Preview — {previewState.order.fileName}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setPreviewState(null)}
                className="p-2 rounded-lg border border-[#DCEAF5] hover:bg-[#F0F8FF] text-[#123B5D]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {previewState.loading ? (
              <div className="h-[360px] flex items-center justify-center text-sm text-[#263746]/80">
                Loading authenticated CAD geometry...
              </div>
            ) : previewState.error ? (
              <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-900">
                {previewState.error}
              </div>
            ) : (
              <ModelViewer3D
                file={null}
                remoteModel={
                  previewState.buffer
                    ? { name: previewState.order.fileName, buffer: previewState.buffer }
                    : null
                }
                colorHex="#42A5F5"
                dimensionsMm={previewState.order.boundingBoxMm || null}
              />
            )}
          </div>
        </div>
      )}

      {/* View Customer Details Modal */}
      {customerModalOrder && (
        <div className="fixed inset-0 z-50 bg-[#123B5D]/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl border border-[#DCEAF5]">
            <div className="flex items-center justify-between border-b border-[#DCEAF5] pb-3">
              <div>
                <div className="font-mono text-[11px] text-[#42A5F5]">
                  Enquiry {customerModalOrder.orderNumber}
                </div>
                <h3 className="font-display font-bold text-lg text-[#123B5D]">Customer Details</h3>
              </div>
              <button
                type="button"
                onClick={() => setCustomerModalOrder(null)}
                className="p-1.5 rounded-lg border border-[#DCEAF5] hover:bg-[#F0F8FF] text-[#123B5D]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-[#263746]/70 block">Customer ID</span>
                <span className="font-mono font-semibold text-[#123B5D]">
                  {customerModalOrder.customerDetails?.customerId || customerModalOrder.customerId || `USER-${customerModalOrder.userId}`}
                </span>
              </div>
              <div>
                <span className="text-[#263746]/70 block">Full Name</span>
                <span className="font-semibold text-[#123B5D]">
                  {customerModalOrder.customerDetails?.fullName || customerModalOrder.customerName || '—'}
                </span>
              </div>
              <div>
                <span className="text-[#263746]/70 block">Email Address</span>
                <span className="text-[#123B5D]">
                  {customerModalOrder.customerDetails?.email || customerModalOrder.customerEmail || customerModalOrder.email || '—'}
                </span>
              </div>
              <div>
                <span className="text-[#263746]/70 block">Phone Number</span>
                <span className="font-mono text-[#123B5D]">
                  {customerModalOrder.customerDetails?.mobile || customerModalOrder.customerMobile || customerModalOrder.phone || '—'}
                </span>
              </div>
              <div>
                <span className="text-[#263746]/70 block">Company / College</span>
                <span className="text-[#123B5D]">
                  {customerModalOrder.customerDetails?.companyOrCollege || '—'}
                </span>
              </div>
              <div>
                <span className="text-[#263746]/70 block">Account Status</span>
                <span className="font-semibold text-[#123B5D]">
                  {customerModalOrder.customerDetails?.accountStatus || 'Active'}
                </span>
              </div>
              <div className="col-span-2">
                <span className="text-[#263746]/70 block">Address</span>
                <span className="text-[#123B5D]">
                  {customerModalOrder.customerDetails?.fullAddress || '—'}
                </span>
              </div>
              <div>
                <span className="text-[#263746]/70 block">City / State</span>
                <span className="text-[#123B5D]">
                  {[customerModalOrder.customerDetails?.city, customerModalOrder.customerDetails?.state].filter(Boolean).join(', ') || '—'}
                </span>
              </div>
              <div>
                <span className="text-[#263746]/70 block">PIN Code</span>
                <span className="font-mono text-[#123B5D]">
                  {customerModalOrder.customerDetails?.pinCode || '—'}
                </span>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setCustomerModalOrder(null)}
                className="px-4 py-2 bg-[#64B5F6] hover:bg-[#42A5F5] text-white font-semibold rounded-lg"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Update Quotation Modal */}
      {quoteModal && (
        <div className="fixed inset-0 z-50 bg-[#123B5D]/60 flex items-center justify-center p-4">
          <form
            onSubmit={handleSubmitQuotation}
            className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-[#DCEAF5]"
          >
            <div className="flex items-center justify-between border-b border-[#DCEAF5] pb-3">
              <div>
                <div className="font-mono text-[11px] text-[#42A5F5]">{quoteModal.order.orderNumber}</div>
                <h3 className="font-display font-bold text-lg text-[#123B5D]">Update Quotation</h3>
              </div>
              <button
                type="button"
                onClick={() => setQuoteModal(null)}
                className="p-1.5 rounded-lg border border-[#DCEAF5] hover:bg-[#F0F8FF] text-[#123B5D]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-[#123B5D] mb-1">
                  Quoted Price (₹ INR) *
                </label>
                <input
                  type="number"
                  min={1}
                  required
                  value={quoteModal.quotedPriceInr}
                  onChange={(e) => setQuoteModal({ ...quoteModal, quotedPriceInr: e.target.value })}
                  className="w-full rounded-lg border border-[#DCEAF5] px-3 py-2 font-mono text-sm text-[#123B5D] focus:outline-none focus:border-[#64B5F6]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#123B5D] mb-1">Slicing Status</label>
                <select
                  value={quoteModal.slicingStatus}
                  onChange={(e) => setQuoteModal({ ...quoteModal, slicingStatus: e.target.value })}
                  className="w-full rounded-lg border border-[#DCEAF5] px-3 py-2 text-xs text-[#263746] bg-white focus:outline-none focus:border-[#64B5F6]"
                >
                  <option value="Slicing Completed">Slicing Completed (Ready for Customer Payment)</option>
                  <option value="Auto Sliced">Auto Sliced</option>
                  <option value="Technical Review Required">Technical Review Required</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#123B5D] mb-1">Quotation / Engineering Notes</label>
                <textarea
                  rows={3}
                  value={quoteModal.notes}
                  onChange={(e) => setQuoteModal({ ...quoteModal, notes: e.target.value })}
                  placeholder="Material allowance, support adjustments, lead time..."
                  className="w-full rounded-lg border border-[#DCEAF5] px-3 py-2 text-xs text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setQuoteModal(null)}
                className="px-4 py-2 border border-[#DCEAF5] rounded-lg text-[#263746] hover:bg-[#F0F8FF] font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={quoteModal.busy}
                className="px-4 py-2 bg-[#64B5F6] hover:bg-[#42A5F5] text-white rounded-lg font-semibold disabled:opacity-50"
              >
                {quoteModal.busy ? 'Saving...' : 'Save Quotation'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Update Payment Status Modal */}
      {paymentModal && (
        <div className="fixed inset-0 z-50 bg-[#123B5D]/60 flex items-center justify-center p-4">
          <form
            onSubmit={handleSubmitPaymentStatus}
            className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-[#DCEAF5]"
          >
            <div className="flex items-center justify-between border-b border-[#DCEAF5] pb-3">
              <div>
                <div className="font-mono text-[11px] text-[#42A5F5]">{paymentModal.order.orderNumber}</div>
                <h3 className="font-display font-bold text-lg text-[#123B5D]">Update Payment Status</h3>
              </div>
              <button
                type="button"
                onClick={() => setPaymentModal(null)}
                className="p-1.5 rounded-lg border border-[#DCEAF5] hover:bg-[#F0F8FF] text-[#123B5D]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-[#123B5D] mb-1">Payment Status</label>
                <select
                  value={paymentModal.paymentStatus}
                  onChange={(e) =>
                    setPaymentModal({
                      ...paymentModal,
                      paymentStatus: e.target.value as 'pending' | 'paid' | 'failed' | 'refunded',
                    })
                  }
                  className="w-full rounded-lg border border-[#DCEAF5] px-3 py-2 text-xs font-semibold text-[#123B5D] bg-white focus:outline-none focus:border-[#64B5F6]"
                >
                  <option value="pending">Pending Payment (Payment Not Completed)</option>
                  <option value="paid">Payment Successful (Enable Printing Authorization)</option>
                  <option value="failed">Payment Failed</option>
                  <option value="refunded">Payment Refunded</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#123B5D] mb-1">
                  Payment / Transaction Reference ID (Optional)
                </label>
                <input
                  value={paymentModal.paymentId}
                  onChange={(e) => setPaymentModal({ ...paymentModal, paymentId: e.target.value })}
                  placeholder="e.g. pay_... or UPI / Bank Ref"
                  className="w-full rounded-lg border border-[#DCEAF5] px-3 py-2 font-mono text-xs text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#123B5D] mb-1">Verification Note (Optional)</label>
                <input
                  value={paymentModal.note}
                  onChange={(e) => setPaymentModal({ ...paymentModal, note: e.target.value })}
                  placeholder="Reason or payment confirmation details"
                  className="w-full rounded-lg border border-[#DCEAF5] px-3 py-2 text-xs text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPaymentModal(null)}
                className="px-4 py-2 border border-[#DCEAF5] rounded-lg text-[#263746] hover:bg-[#F0F8FF] font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={paymentModal.busy}
                className="px-4 py-2 bg-[#64B5F6] hover:bg-[#42A5F5] text-white rounded-lg font-semibold disabled:opacity-50"
              >
                {paymentModal.busy ? 'Updating...' : 'Update Payment Status'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Reject Enquiry Modal */}
      {rejectModal && (
        <div className="fixed inset-0 z-50 bg-[#123B5D]/60 flex items-center justify-center p-4">
          <form
            onSubmit={handleConfirmReject}
            className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-amber-200"
          >
            <div className="flex items-center justify-between border-b border-[#DCEAF5] pb-3">
              <div>
                <div className="font-mono text-[11px] text-amber-700">{rejectModal.order.orderNumber}</div>
                <h3 className="font-display font-bold text-lg text-[#123B5D]">Reject 3D Printing Enquiry</h3>
              </div>
              <button
                type="button"
                onClick={() => setRejectModal(null)}
                className="p-1.5 rounded-lg border border-[#DCEAF5] hover:bg-[#F0F8FF] text-[#123B5D]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-[#123B5D]">
                Rejection Reason (visible to customer)
              </label>
              <textarea
                rows={3}
                required
                value={rejectModal.reason}
                onChange={(e) => setRejectModal({ ...rejectModal, reason: e.target.value })}
                placeholder="e.g. Non-manifold mesh, wall thickness below printable minimum, or out-of-envelope dimensions..."
                className="w-full rounded-lg border border-[#DCEAF5] px-3 py-2 text-xs text-[#263746] focus:outline-none focus:border-[#64B5F6]"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRejectModal(null)}
                className="px-4 py-2 border border-[#DCEAF5] rounded-lg text-[#263746] hover:bg-[#F0F8FF] font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={rejectModal.busy}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-semibold disabled:opacity-50"
              >
                {rejectModal.busy ? 'Rejecting...' : 'Confirm Reject Enquiry'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Non-Destructive Archive Enquiry Confirmation Dialog */}
      {deleteModal && (
        <div className="fixed inset-0 z-50 bg-[#123B5D]/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-amber-200">
            <div className="flex items-center justify-between border-b border-amber-100 pb-3">
              <div>
                <div className="font-mono text-[11px] text-amber-700">{deleteModal.order.orderNumber}</div>
                <h3 className="font-display font-bold text-lg text-[#123B5D]">Archive 3D Printing Enquiry</h3>
              </div>
              <button
                type="button"
                onClick={() => setDeleteModal(null)}
                className="p-1.5 rounded-lg border border-[#DCEAF5] hover:bg-[#F0F8FF] text-[#123B5D]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-950 space-y-1.5">
              <p className="font-semibold">
                Remove {deleteModal.order.orderNumber} from active 3D printing queue?
              </p>
              <p>
                Per NexusTekFusion cloud data protection, the original database record, Supabase Storage file ({deleteModal.order.fileName}), and audit history remain preserved.
              </p>
            </div>

            <div className="space-y-1">
              <label className="block text-[11px] font-semibold text-[#123B5D]">
                Archive Reason (Mandatory for Audit Trail) *
              </label>
              <input
                value={deleteModal.reason}
                onChange={(e) =>
                  setDeleteModal((prev) => (prev ? { ...prev, reason: e.target.value } : null))
                }
                placeholder="e.g. Duplicate upload / Customer requested cancellation"
                className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 text-xs text-[#123B5D]"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={deleteModal.busy}
                onClick={() => setDeleteModal(null)}
                className="px-4 py-2 border border-[#DCEAF5] rounded-lg text-[#263746] hover:bg-[#F0F8FF] font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleteModal.busy}
                onClick={handleConfirmDelete}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {deleteModal.busy ? 'Archiving...' : 'Archive Enquiry'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
