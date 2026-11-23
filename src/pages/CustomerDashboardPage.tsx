import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity,
  Archive,
  Award,
  Bell,
  Box,
  CheckCircle2,
  Cpu,
  CreditCard,
  Download,
  Edit3,
  ExternalLink,
  FileCheck2,
  FileText,
  FolderKanban,
  Heart,
  LayoutDashboard,
  LifeBuoy,
  Lock,
  LogOut,
  Mail,
  MapPin,
  Menu,
  MessageSquare,
  Navigation,
  Package,
  Plus,
  RefreshCw,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Sprout,
  Star,
  Trash2,
  Truck,
  User,
  UserCheck,
  Wrench,
  X,
} from 'lucide-react';
import { usePlatform } from '../context/PlatformContext';
import { getSupabaseClient } from '../lib/supabase';
import { isAdminRole } from '../lib/rbac';
import { AddressSelector } from '../components/AddressSelector';
import { RazorpayCheckoutModal } from '../components/RazorpayCheckoutModal';
import {
  downloadClearanceCertificatePdf,
  downloadCompleteProjectInvoicePdf,
  downloadCompletionCertificatePdf,
  downloadInvoicePdf,
  downloadPaymentHistoryStatementPdf,
  downloadPaymentReceiptPdf,
  downloadQuotationPdf,
  downloadWorkOrderPdf,
} from '../lib/pdf';
import { AddressData, NotificationPreferences } from '../types/platform';

export type TabKey =
  | 'overview'
  | 'orders'
  | 'tracking'
  | 'invoices'
  | 'addresses'
  | 'cart'
  | 'wishlist'
  | 'reviews'
  | 'enquiries'
  | 'services'
  | 'projects'
  | 'printing'
  | 'pcb'
  | 'b2b_support'
  | 'profile'
  | 'settings';

type InitialTabInput = TabKey | 'pcb_b2b' | 'support' | 'finance';

function normalizeTabKey(input?: string | null): TabKey {
  if (!input) return 'overview';
  if (input === 'pcb_b2b') return 'pcb';
  if (input === 'support') return 'b2b_support';
  if (input === 'finance') return 'invoices';
  const allowed: TabKey[] = [
    'overview',
    'orders',
    'tracking',
    'invoices',
    'addresses',
    'cart',
    'wishlist',
    'reviews',
    'enquiries',
    'services',
    'projects',
    'printing',
    'pcb',
    'b2b_support',
    'profile',
    'settings',
  ];
  return allowed.includes(input as TabKey) ? (input as TabKey) : 'overview';
}

const DEFAULT_PREFS: NotificationPreferences = {
  emailUpdates: true,
  orderAlerts: true,
  quotationAlerts: true,
  promotionalEmails: false,
  whatsappAlerts: true,
};

const STORE_ORDER_STAGES = [
  'Order Placed',
  'Payment Confirmed',
  'Order Processing',
  'Quality Inspection',
  'Ready for Dispatch',
  'Shipped',
  'Out for Delivery',
  'Delivered',
] as const;

function resolveStoreOrderStageIndex(status: string): number {
  const s = String(status || '').trim().toLowerCase();
  if (!s || s === 'pending payment' || s === 'order placed') return 0;
  if (s === 'completed') return 7;
  const idx = STORE_ORDER_TRACKING_LIST.findIndex((st) => st.toLowerCase() === s);
  return idx >= 0 ? idx : 0;
}
const STORE_ORDER_TRACKING_LIST = [...STORE_ORDER_STAGES];

const PROJECT_STAGES = [
  'Submitted – Under Review',
  'Additional Information Required',
  'Under Technical Evaluation',
  'Quotation Prepared',
  'Quotation Approved by Customer',
  'Advance Payment Pending',
  'Advance Payment Received',
  'Project Development Started',
  'In Progress',
  'Testing and Quality Assurance',
  'Project Completed',
  'Final Payment Pending',
  'Ready for Handover',
  'Delivered / Handed Over',
  'Closed',
] as const;

function resolveProjectStageIndex(enquiryStatus: string, projectStatus?: string): number {
  const s = (projectStatus || enquiryStatus || 'Submitted – Under Review').toLowerCase();
  if (s === 'closed') return 14;
  if (s.includes('delivered / handed over') || s === 'delivered' || s === 'handover acknowledged') return 13;
  if (s.includes('ready for handover') || s.includes('cleared') || s === 'dispatched' || s === 'ready for delivery') return 12;
  if (s.includes('final payment pending') || s.includes('awaiting final payment')) return 11;
  if (s === 'project completed' || s === 'completed') return 10;
  if (s.includes('testing and quality assurance') || s === 'testing') return 9;
  if (s === 'in progress') return 8;
  if (s.includes('project development started') || s === 'project started') return 7;
  if (s.includes('advance payment received') || s.includes('advance paid') || s.includes('payment confirmed')) return 6;
  if (s.includes('awaiting advance payment') || s.includes('advance payment pending') || s.includes('awaiting payment')) return 5;
  if (s.includes('quotation approved by customer') || s === 'accepted' || s === 'approved') return 4;
  if (s.includes('quotation prepared') || s === 'quotation sent') return 3;
  if (s.includes('under technical evaluation') || s === 'technical review') return 2;
  if (s.includes('additional information required') || s.includes('clarification')) return 1;
  return 0;
}

export const CustomerDashboardPage: React.FC<{ initialTab?: InitialTabInput }> = ({ initialTab }) => {
  const {
    authLoading,
    dbUser,
    isSignedIn,
    openAuthModal,
    updateCustomerSettings,
    refreshMe,
    signOut,
    apiFetch,
    notify,
    navigate,
    settings,
    isAdmin,
    getIdToken,
    cart,
    cartSummary,
    addToCart,
    updateCartQty,
    removeFromCart,
  } = usePlatform();
  const [tab, setTab] = useState<TabKey>(() => {
    if (typeof window !== 'undefined') {
      const qTab = new URLSearchParams(window.location.search).get('tab');
      if (qTab) return normalizeTabKey(qTab);
    }
    return normalizeTabKey(initialTab);
  });
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [handledPayInstallmentId, setHandledPayInstallmentId] = useState<number | null>(null);

  useEffect(() => {
    if (initialTab) setTab(normalizeTabKey(initialTab));
  }, [initialTab]);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [profileForm, setProfileForm] = useState({
    fullName: '',
    mobile: '',
    companyOrCollege: '',
    fullAddress: '',
    city: '',
    state: '',
    pinCode: '',
    customerType: 'Individual',
    profilePhotoUrl: '',
    billingGstin: '',
    billingName: '',
    billingEmail: '',
    billingPan: '',
    billingAddress: '',
  });
  const [notifPrefs, setNotifPrefs] = useState<NotificationPreferences>(DEFAULT_PREFS);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [showDeleteBox, setShowDeleteBox] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);

  const [editAddressModal, setEditAddressModal] = useState<(AddressData & { id: number }) | null>(null);
  const [savingEditAddress, setSavingEditAddress] = useState(false);

  const [newTicketForm, setNewTicketForm] = useState({
    subject: '',
    serviceCategory: 'General Support',
    message: '',
  });
  const [creatingTicket, setCreatingTicket] = useState(false);

  const [pcbQuickOpen, setPcbQuickOpen] = useState(false);
  const [pcbForm, setPcbForm] = useState({
    boardDimensionsMm: '',
    layerCount: 2,
    boardQuantity: 5,
    assemblyRequired: false,
    surfaceFinish: 'HASL Lead-Free',
    specialInstructions: '',
  });
  const [pcbFiles, setPcbFiles] = useState<File[]>([]);
  const [submittingPcb, setSubmittingPcb] = useState(false);
  const [replyText, setReplyText] = useState<Record<number, string>>({});
  const [enqReplyMap, setEnqReplyMap] = useState<Record<number, string>>({});
  const [enqReplyFiles, setEnqReplyFiles] = useState<Record<number, File[]>>({});
  const [enqExpandedDetails, setEnqExpandedDetails] = useState<Record<number, boolean>>({});
  const [modifyQuoteId, setModifyQuoteId] = useState<number | null>(null);
  const [modifyFeedback, setModifyFeedback] = useState('');
  const [orderDetailModal, setOrderDetailModal] = useState<any | null>(null);
  const [cancelOrderModal, setCancelOrderModal] = useState<any | null>(null);
  const [cancelReason, setCancelReason] = useState('Changed mind / ordering different configuration');
  const [cancellingOrder, setCancellingOrder] = useState(false);
  const [downloading3dId, setDownloading3dId] = useState<number | null>(null);
  const [uploadingAgreementId, setUploadingAgreementId] = useState<number | null>(null);
  const [acceptingAgreementId, setAcceptingAgreementId] = useState<number | null>(null);
  const [acceptNameMap, setAcceptNameMap] = useState<Record<number, string>>({});
  const [acceptCheckMap, setAcceptCheckMap] = useState<Record<number, boolean>>({});
  const [enquiryCategoryFilter, setEnquiryCategoryFilter] = useState<'all' | 'product' | 'project' | 'pcb' | 'b2b' | 'support'>('all');
  const [includeArchivedEnquiries, setIncludeArchivedEnquiries] = useState(true);
  const [serviceStatusFilter, setServiceStatusFilter] = useState<'all' | 'active' | 'archived'>('all');
  const [serviceRequestOpen, setServiceRequestOpen] = useState(false);
  const [creatingService, setCreatingService] = useState(false);
  const [serviceForm, setServiceForm] = useState({
    serviceCode: '',
    serviceName: '',
    category: 'Custom Engineering',
    specifications: '',
    description: '',
    quantity: 1,
  });
  const [reviewDrafts, setReviewDrafts] = useState<Record<number, { rating: number; comment: string; busy?: boolean }>>({});
  const [payModal, setPayModal] = useState<{
    open: boolean;
    entityType: 'store_order' | 'printing_order' | 'project_quotation' | 'project_installment' | 'pcb_enquiry' | 'b2b_enquiry';
    entityId: number;
    paymentMode?: 'advance' | 'full' | 'balance';
    title: string;
    amountInr: number;
  } | null>(null);

  const loadDashboard = useCallback(async (silent: unknown = false) => {
    const isSilent = silent === true;
    if (!isSignedIn) {
      setData(null);
      setLoading(false);
      return;
    }
    if (!isSilent) setLoading(true);
    try {
      const res = await apiFetch('/api/me');
      setData(res);
      setProfileForm({
        fullName: res.user?.fullName || '',
        mobile: res.user?.mobile || '',
        companyOrCollege: res.user?.companyOrCollege || '',
        fullAddress: res.user?.fullAddress || '',
        city: res.user?.city || '',
        state: res.user?.state || '',
        pinCode: res.user?.pinCode || '',
        customerType: res.user?.customerType || 'Individual',
        profilePhotoUrl: res.user?.profilePhotoUrl || '',
        billingGstin: res.user?.billingDetails?.gstin || '',
        billingName: res.user?.billingDetails?.billingName || '',
        billingEmail: res.user?.billingDetails?.billingEmail || '',
        billingPan: res.user?.billingDetails?.pan || '',
        billingAddress: res.user?.billingDetails?.billingAddress || '',
      });
      setNotifPrefs({
        ...DEFAULT_PREFS,
        ...(res.settings?.notificationPreferences || res.user?.notificationPreferences || {}),
      });
    } catch (err: any) {
      if (!isSilent) notify(err?.message || 'Failed to load account.', 'error');
    } finally {
      if (!isSilent) setLoading(false);
    }
  }, [isSignedIn, apiFetch, notify]);

  const realtimeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleRealtimeRefresh = useCallback(() => {
    if (realtimeDebounceRef.current) clearTimeout(realtimeDebounceRef.current);
    realtimeDebounceRef.current = setTimeout(() => {
      void loadDashboard(true);
    }, 350);
  }, [loadDashboard]);

  useEffect(() => {
    setData(null);
    loadDashboard();
  }, [loadDashboard, dbUser?.id, dbUser?.customerId]);

  useEffect(() => {
    if (!isSignedIn || !dbUser?.id) return;

    let es: EventSource | null = null;
    try {
      es = new EventSource('/api/customer/stream', { withCredentials: true });
      es.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data || '{}');
          if (parsed?.type && parsed.type !== 'connected') {
            scheduleRealtimeRefresh();
          }
        } catch {
          // ignore keepalive frames
        }
      };
    } catch {
      // ignore if SSE unavailable
    }

    const supabase = getSupabaseClient();
    const channelName = `ntf-customer-live-${dbUser.uid || dbUser.id}`;
    const channel = supabase
      ? supabase
          .channel(channelName)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, () =>
            scheduleRealtimeRefresh()
          )
          .on('postgres_changes', { event: '*', schema: 'public', table: 'service_records' }, () =>
            scheduleRealtimeRefresh()
          )
          .on('postgres_changes', { event: '*', schema: 'public', table: 'customer_enquiries' }, () =>
            scheduleRealtimeRefresh()
          )
          .on('postgres_changes', { event: '*', schema: 'public', table: 'store_orders' }, () =>
            scheduleRealtimeRefresh()
          )
          .subscribe()
      : null;

    return () => {
      if (realtimeDebounceRef.current) clearTimeout(realtimeDebounceRef.current);
      if (es) es.close();
      if (supabase && channel) {
        supabase.removeChannel(channel).catch(() => {});
      }
    };
  }, [isSignedIn, dbUser?.id, dbUser?.uid, scheduleRealtimeRefresh]);

  useEffect(() => {
    if (!data || typeof window === 'undefined') return;
    const rawPayInst = new URLSearchParams(window.location.search).get('payInstallment');
    const payInstId = rawPayInst ? Number(rawPayInst) : NaN;
    if (!Number.isFinite(payInstId) || payInstId <= 0 || handledPayInstallmentId === payInstId) return;
    const targetInst = (data.paymentInstallments || []).find((inst: any) => Number(inst.id) === payInstId);
    if (!targetInst) return;
    setHandledPayInstallmentId(payInstId);
    setTab('projects');
    const remaining = Math.max(0, Number(targetInst.amountInr || 0) - Number(targetInst.paidAmountInr || 0));
    if (targetInst.status !== 'Paid' && remaining > 0) {
      const linkedProj = (data.projects || []).find((pr: any) => pr.id === targetInst.projectId);
      setPayModal({
        open: true,
        entityType: 'project_installment',
        entityId: targetInst.id,
        paymentMode: targetInst.installmentNumber === 1 ? 'advance' : 'balance',
        title: `${targetInst.title || `Installment #${targetInst.installmentNumber}`}${linkedProj?.projectCode ? ` — ${linkedProj.projectCode}` : ''}`,
        amountInr: remaining,
      });
    }
  }, [data, handledPayInstallmentId]);

  if (authLoading) {
    return (
      <div className="max-w-xl mx-auto px-4 py-24 text-center space-y-3">
        <div className="text-sm font-medium text-[#123B5D]">Loading your dashboard...</div>
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="max-w-xl mx-auto px-4 py-20 text-center space-y-5">
        <div className="text-xs font-mono font-semibold uppercase tracking-wider text-[#42A5F5]">
          Customer Account Portal
        </div>
        <h1 className="font-display text-3xl font-bold text-[#123B5D]">Sign In with Email OTP</h1>
        <p className="text-sm text-[#263746]">
          Manage your Store orders, custom 3D prints, project registrations, GST invoices, and saved delivery addresses.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
          <button
            type="button"
            onClick={() => openAuthModal('login')}
            className="px-6 py-3 bg-[#64B5F6] hover:bg-[#42A5F5] text-white text-sm font-semibold rounded-lg transition-colors"
          >
            Continue with Email OTP
          </button>
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="px-5 py-3 border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] text-sm font-semibold rounded-lg transition-colors"
          >
            Open Login Page
          </button>
        </div>
      </div>
    );
  }

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/me', {
        method: 'PUT',
        body: JSON.stringify({
          fullName: profileForm.fullName,
          mobile: profileForm.mobile,
          companyOrCollege: profileForm.companyOrCollege,
          fullAddress: profileForm.fullAddress,
          city: profileForm.city,
          state: profileForm.state,
          pinCode: profileForm.pinCode,
          customerType: profileForm.customerType,
          profilePhotoUrl: profileForm.profilePhotoUrl,
          billingDetails: {
            gstin: profileForm.billingGstin,
            billingName: profileForm.billingName,
            billingEmail: profileForm.billingEmail,
            pan: profileForm.billingPan,
            billingAddress: profileForm.billingAddress,
          },
        }),
      });
      notify('Profile updated and synced.', 'success');
      await Promise.all([loadDashboard(), refreshMe()]);
    } catch (err: any) {
      notify(err?.message || 'Update failed.', 'error');
    }
  };

  const respondQuotation = async (
    quotationId: number,
    action: 'accept' | 'modify' | 'reject',
    customFeedback?: string
  ) => {
    try {
      await apiFetch(`/api/quotations/${quotationId}/respond`, {
        method: 'POST',
        body: JSON.stringify({
          action,
          feedback: customFeedback || (action === 'modify' ? 'Requested revision' : ''),
        }),
      });
      setModifyQuoteId(null);
      setModifyFeedback('');
      notify(
        `Quotation ${
          action === 'accept' ? 'accepted' : action === 'modify' ? 'marked for modification' : 'rejected'
        }.`,
        'success'
      );
      loadDashboard();
    } catch (err: any) {
      notify(err?.message || 'Failed to update quotation.', 'error');
    }
  };

  const deleteAddress = async (id: number) => {
    try {
      await apiFetch(`/api/addresses/${id}`, { method: 'DELETE' });
      notify('Address removed.', 'info');
      loadDashboard();
    } catch (err: any) {
      notify(err?.message || 'Failed to delete address.', 'error');
    }
  };

  const setDefaultAddress = async (id: number) => {
    try {
      await apiFetch(`/api/addresses/${id}/default`, { method: 'POST' });
      notify('Default address updated.', 'success');
      loadDashboard();
    } catch (err: any) {
      notify(err?.message || 'Failed to set default address.', 'error');
    }
  };

  const handleSaveEditedAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editAddressModal) return;
    setSavingEditAddress(true);
    try {
      await apiFetch(`/api/addresses/${editAddressModal.id}`, {
        method: 'PUT',
        body: JSON.stringify(editAddressModal),
      });
      notify('Address updated.', 'success');
      setEditAddressModal(null);
      loadDashboard();
    } catch (err: any) {
      notify(err?.message || 'Failed to update address.', 'error');
    } finally {
      setSavingEditAddress(false);
    }
  };

  const removeFromWishlist = async (productId: number) => {
    try {
      await apiFetch('/api/wishlist/toggle', {
        method: 'POST',
        body: JSON.stringify({ productId }),
      });
      notify('Removed from wishlist.', 'info');
      loadDashboard();
    } catch (err: any) {
      notify(err?.message || 'Failed to update wishlist.', 'error');
    }
  };

  const markNotificationRead = async (id: number) => {
    try {
      await apiFetch(`/api/notifications/${id}/read`, { method: 'POST' });
      loadDashboard();
    } catch {
      // ignore
    }
  };

  const markAllNotificationsRead = async () => {
    try {
      await apiFetch('/api/notifications/read-all', { method: 'POST' });
      notify('All notifications marked as read.', 'info');
      loadDashboard();
    } catch (err: any) {
      notify(err?.message || 'Failed to mark notifications as read.', 'error');
    }
  };

  const handleCreateSupportTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTicketForm.subject.trim() || !newTicketForm.message.trim()) {
      notify('Please enter a ticket subject and description.', 'error');
      return;
    }
    setCreatingTicket(true);
    try {
      const res = await apiFetch('/api/support-tickets', {
        method: 'POST',
        body: JSON.stringify(newTicketForm),
      });
      notify(`Support ticket ${res.ticket?.ticketNumber || ''} submitted.`, 'success');
      setNewTicketForm({ subject: '', serviceCategory: 'General Support', message: '' });
      loadDashboard();
    } catch (err: any) {
      notify(err?.message || 'Failed to submit support ticket.', 'error');
    } finally {
      setCreatingTicket(false);
    }
  };

  const handleSubmitInlinePcb = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pcbForm.boardDimensionsMm.trim()) {
      notify('Board dimensions are required.', 'error');
      return;
    }
    setSubmittingPcb(true);
    try {
      const fd = new FormData();
      fd.append('customerName', dbUser?.fullName || dbUser?.email || 'Customer');
      fd.append('mobile', dbUser?.mobile || '9999999999');
      fd.append('email', dbUser?.email || '');
      fd.append('boardDimensionsMm', pcbForm.boardDimensionsMm.trim());
      fd.append('layerCount', String(pcbForm.layerCount));
      fd.append('boardQuantity', String(pcbForm.boardQuantity));
      fd.append('assemblyRequired', String(pcbForm.assemblyRequired));
      fd.append('surfaceFinish', pcbForm.surfaceFinish);
      fd.append('specialInstructions', pcbForm.specialInstructions);
      pcbFiles.forEach((f) => fd.append('attachments', f));
      const res = await apiFetch('/api/pcb-enquiries', { method: 'POST', body: fd });
      notify(`PCB enquiry ${res.enquiry?.enquiryNumber || ''} submitted.`, 'success');
      setPcbForm({
        boardDimensionsMm: '',
        layerCount: 2,
        boardQuantity: 5,
        assemblyRequired: false,
        surfaceFinish: 'HASL Lead-Free',
        specialInstructions: '',
      });
      setPcbFiles([]);
      setPcbQuickOpen(false);
      loadDashboard();
    } catch (err: any) {
      notify(err?.message || 'Failed to submit PCB enquiry.', 'error');
    } finally {
      setSubmittingPcb(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingPrefs(true);
    try {
      await updateCustomerSettings(notifPrefs);
      loadDashboard();
    } catch (err: any) {
      notify(err?.message || 'Failed to save notification preferences.', 'error');
    } finally {
      setSavingPrefs(false);
    }
  };

  const handleDeleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    const expectedId = String(dbUser?.customerId || dbUser?.uid || '').trim().toUpperCase();
    if (expectedId && deleteConfirmId.trim().toUpperCase() !== expectedId) {
      notify(`Enter your Customer ID (${expectedId}) to confirm deletion.`, 'error');
      return;
    }
    setDeletingAccount(true);
    try {
      await apiFetch('/api/me', {
        method: 'DELETE',
        body: JSON.stringify({ confirmCustomerId: deleteConfirmId.trim().toUpperCase() }),
      });
      notify('Your account has been deleted. Existing invoices remain archived.', 'info');
      await signOut();
      navigate('/');
    } catch (err: any) {
      notify(err?.message || 'Unable to delete account.', 'error');
    } finally {
      setDeletingAccount(false);
    }
  };

  const sendTicketReply = async (ticketId: number) => {
    const msg = replyText[ticketId];
    if (!msg?.trim()) return;
    try {
      await apiFetch(`/api/support-tickets/${ticketId}/reply`, {
        method: 'POST',
        body: JSON.stringify({ message: msg }),
      });
      setReplyText((prev) => ({ ...prev, [ticketId]: '' }));
      notify('Reply sent.', 'success');
      loadDashboard();
    } catch (err: any) {
      notify(err?.message || 'Failed to reply.', 'error');
    }
  };

  const downloadPrivateHandover = async (projectId: number, docId: number, token: string, fileName: string) => {
    try {
      const idToken = await getIdToken();
      const headers: Record<string, string> = {};
      if (idToken) headers.Authorization = `Bearer ${idToken}`;
      const resp = await fetch(
        `/api/projects/${projectId}/handover-documents/${docId}/download?token=${encodeURIComponent(token)}`,
        { headers, credentials: 'same-origin' }
      );
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: 'Download blocked or expired.' }));
        throw new Error(err.error || 'Download failed.');
      }
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      loadDashboard();
    } catch (err: any) {
      notify(err?.message || 'Failed to download deliverable.', 'error');
    }
  };

  const downloadOriginal3DFile = async (po: any) => {
    setDownloading3dId(po.id);
    try {
      const idToken = await getIdToken();
      const headers: Record<string, string> = {};
      if (idToken) headers.Authorization = `Bearer ${idToken}`;
      const resp = await fetch(`/api/3d-printing/orders/${po.id}/download-original?format=json`, {
        headers,
        credentials: 'same-origin',
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: 'Unable to download 3D file.' }));
        throw new Error(err.error || 'Download failed.');
      }
      const ctype = resp.headers.get('content-type') || '';
      let blob: Blob | null = null;
      if (ctype.includes('application/json')) {
        const payload = await resp.json();
        if (payload?.signedUrl) {
          try {
            const fileResp = await fetch(payload.signedUrl);
            if (fileResp.ok) {
              blob = await fileResp.blob();
            }
          } catch {
            // fallback to backend proxy
          }
        }
        if (!blob) {
          const proxyResp = await fetch(`/api/3d-printing/orders/${po.id}/download-original?proxy=1`, {
            headers,
            credentials: 'same-origin',
          });
          if (!proxyResp.ok) throw new Error('Failed to fetch 3D file.');
          blob = await proxyResp.blob();
        }
      } else {
        blob = await resp.blob();
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = po.fileName || `3d-model-${po.orderNumber}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      notify(`Downloaded original design file: ${po.fileName}`, 'success');
    } catch (err: any) {
      notify(err?.message || 'Unable to download 3D file.', 'error');
    } finally {
      setDownloading3dId(null);
    }
  };

  const downloadProtectedFile = async (storagePath: string, fileName: string) => {
    try {
      const idToken = await getIdToken();
      const headers: Record<string, string> = {};
      if (idToken) headers.Authorization = `Bearer ${idToken}`;
      const resp = await fetch(`/api/files/download?path=${encodeURIComponent(storagePath)}`, {
        headers,
        credentials: 'same-origin',
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: 'Download failed.' }));
        throw new Error(err.error || 'Download failed.');
      }
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      notify(err?.message || 'Failed to download file.', 'error');
    }
  };

  const downloadCloudInvoicePdf = async (inv: any) => {
    try {
      const idToken = await getIdToken();
      const headers: Record<string, string> = {};
      if (idToken) headers.Authorization = `Bearer ${idToken}`;
      const resp = await fetch(`/api/invoices/${inv.id}/download`, {
        headers,
        credentials: 'same-origin',
      });
      if (resp.ok) {
        const blob = await resp.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${inv.invoiceNumber || `invoice-${inv.id}`}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        return;
      }
      const errData = await resp.json().catch(() => ({}));
      if (resp.status !== 404) {
        throw new Error(errData.error || 'Unable to download cloud invoice PDF.');
      }
    } catch (err: any) {
      notify(err?.message || 'Unable to fetch cloud invoice PDF, rendering standard PDF...', 'info');
    }
    await downloadInvoicePdf({
      invoiceNumber: inv.invoiceNumber,
      docType: inv.docType,
      entityType: inv.entityType,
      amountInr: inv.amountInr,
      gstInr: inv.gstInr,
      issuedAt: inv.issuedAt,
      customerEmail: dbUser?.email || '',
      gstin:
        settings.projectSettings?.enableGstTax && settings.companyInfo?.gstin
          ? settings.companyInfo.gstin
          : undefined,
      payload: inv.payload || {},
    });
  };

  const downloadCloudReceiptPdf = async (rcp: any) => {
    try {
      const idToken = await getIdToken();
      const headers: Record<string, string> = {};
      if (idToken) headers.Authorization = `Bearer ${idToken}`;
      const resp = await fetch(`/api/receipts/${rcp.id}/download`, {
        headers,
        credentials: 'same-origin',
      });
      if (resp.ok) {
        const blob = await resp.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${rcp.receiptNumber || `receipt-${rcp.id}`}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        return;
      }
      const errData = await resp.json().catch(() => ({}));
      if (resp.status !== 404) {
        throw new Error(errData.error || 'Unable to download receipt PDF.');
      }
    } catch (err: any) {
      notify(err?.message || 'Unable to fetch official receipt PDF, rendering standard PDF...', 'info');
    }
    await downloadPaymentReceiptPdf({
      receiptNumber: rcp.receiptNumber,
      paymentRef: rcp.paymentRef,
      razorpayPaymentId: rcp.razorpayPaymentId,
      paymentStage: rcp.paymentStage,
      amountInr: rcp.amountInr,
      issuedAt: rcp.issuedAt,
      customerEmail: dbUser?.email || '',
      referenceCode: rcp.payload?.projectCode || rcp.paymentRef,
    });
  };

  const downloadAgreementPdf = async (agreementId: number, kind: 'original' | 'signed', fallbackName: string) => {
    try {
      const idToken = await getIdToken();
      const headers: Record<string, string> = {};
      if (idToken) headers.Authorization = `Bearer ${idToken}`;
      const resp = await fetch(`/api/agreements/${agreementId}/download?kind=${kind}`, {
        headers,
        credentials: 'same-origin',
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: 'Agreement PDF download failed.' }));
        throw new Error(err.error || 'Agreement PDF download failed.');
      }
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fallbackName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      notify(err?.message || 'Unable to download agreement PDF.', 'error');
    }
  };

  const uploadSignedAgreementPdf = async (agreementId: number, file: File) => {
    setUploadingAgreementId(agreementId);
    try {
      const fd = new FormData();
      fd.append('file', file);
      await apiFetch(`/api/agreements/${agreementId}/upload-signed`, {
        method: 'POST',
        body: fd,
      });
      notify('Signed agreement PDF uploaded securely to Supabase Storage.', 'success');
      await loadDashboard();
    } catch (err: any) {
      notify(err?.message || 'Failed to upload signed agreement PDF.', 'error');
    } finally {
      setUploadingAgreementId(null);
    }
  };

  const acceptAgreementDigitally = async (agreementId: number, defaultName: string) => {
    if (!acceptCheckMap[agreementId]) {
      notify('Please confirm you have read and accept the agreement terms before signing.', 'error');
      return;
    }
    const acceptedName = (acceptNameMap[agreementId] ?? defaultName).trim();
    if (!acceptedName) {
      notify('Please enter your full name to sign and accept the agreement.', 'error');
      return;
    }
    setAcceptingAgreementId(agreementId);
    try {
      await apiFetch(`/api/agreements/${agreementId}/accept`, {
        method: 'POST',
        body: JSON.stringify({ acceptedName, agreeToTerms: true }),
      });
      notify('Agreement digitally accepted and recorded with timestamp.', 'success');
      await loadDashboard();
    } catch (err: any) {
      notify(err?.message || 'Failed to record agreement acceptance.', 'error');
    } finally {
      setAcceptingAgreementId(null);
    }
  };

  const sendEnquiryMessage = async (enquiryId: number) => {
    const message = (enqReplyMap[enquiryId] || '').trim();
    const attached = enqReplyFiles[enquiryId] || [];
    if (!message && attached.length === 0) {
      notify('Enter a response message or attach supporting documents.', 'error');
      return;
    }
    try {
      const fd = new FormData();
      fd.append('message', message || 'Additional documents uploaded.');
      attached.forEach((f) => fd.append('attachments', f));
      await apiFetch(`/api/project-enquiries/${enquiryId}/messages`, {
        method: 'POST',
        body: fd,
      });
      setEnqReplyMap((prev) => ({ ...prev, [enquiryId]: '' }));
      setEnqReplyFiles((prev) => ({ ...prev, [enquiryId]: [] }));
      notify('Response and documents submitted to engineering team.', 'success');
      loadDashboard();
    } catch (err: any) {
      notify(err?.message || 'Failed to submit response.', 'error');
    }
  };

  const acknowledgeHandover = async (projectId: number) => {
    try {
      const res = await apiFetch<{ completionCertificateNumber: string }>(
        `/api/projects/${projectId}/acknowledge-handover`,
        { method: 'POST' }
      );
      notify(`Handover acknowledged. Completion Certificate ${res.completionCertificateNumber} generated.`, 'success');
      loadDashboard();
    } catch (err: any) {
      notify(err?.message || 'Failed to acknowledge handover.', 'error');
    }
  };

  const handleCancelStoreOrder = async () => {
    if (!cancelOrderModal) return;
    setCancellingOrder(true);
    try {
      await apiFetch(`/api/store-orders/${cancelOrderModal.id}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason: cancelReason.trim() || 'Cancelled by customer' }),
      });
      notify(`Order ${cancelOrderModal.orderNumber} cancelled.`, 'info');
      setCancelOrderModal(null);
      loadDashboard();
    } catch (err: any) {
      notify(err?.message || 'Unable to cancel order.', 'error');
    } finally {
      setCancellingOrder(false);
    }
  };

  const handleSubmitProductReview = async (productId: number) => {
    const draft = reviewDrafts[productId] || { rating: 5, comment: '' };
    if (!draft.comment?.trim()) {
      notify('Please enter your product review comment.', 'error');
      return;
    }
    setReviewDrafts((prev) => ({ ...prev, [productId]: { ...draft, busy: true } }));
    try {
      await apiFetch('/api/reviews', {
        method: 'POST',
        body: JSON.stringify({ productId, rating: draft.rating || 5, comment: draft.comment.trim() }),
      });
      notify('Verified purchase review published.', 'success');
      setReviewDrafts((prev) => ({ ...prev, [productId]: { rating: 5, comment: '', busy: false } }));
      loadDashboard();
    } catch (err: any) {
      notify(err?.message || 'Failed to publish review.', 'error');
      setReviewDrafts((prev) => ({ ...prev, [productId]: { ...draft, busy: false } }));
    }
  };

  const handleCreateServiceRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!serviceForm.serviceName.trim()) {
      notify('Please select or enter a service name.', 'error');
      return;
    }
    setCreatingService(true);
    try {
      const catalogItem = (data?.serviceCatalog || []).find(
        (c: any) => c.serviceCode === serviceForm.serviceCode
      );
      const qty = Math.max(1, Number(serviceForm.quantity || 1));
      const unitPriceInr = catalogItem ? Number(catalogItem.basePriceInr || 0) : 0;
      const gstPct = catalogItem ? Number(catalogItem.gstPercent ?? 18) : 18;
      const taxInr = unitPriceInr > 0 ? Math.round((unitPriceInr * qty * gstPct) / 100) : 0;
      await apiFetch('/api/service-records', {
        method: 'POST',
        body: JSON.stringify({
          serviceCode: serviceForm.serviceCode || undefined,
          serviceName: serviceForm.serviceName.trim(),
          category: serviceForm.category,
          specifications: serviceForm.specifications.trim(),
          description: serviceForm.description.trim(),
          quantity: qty,
          unitPriceInr,
          taxInr,
          totalAmountInr: unitPriceInr * qty + taxInr,
        }),
      });
      notify('Service request saved permanently to your cloud account.', 'success');
      setServiceRequestOpen(false);
      setServiceForm({
        serviceCode: '',
        serviceName: '',
        category: 'Custom Engineering',
        specifications: '',
        description: '',
        quantity: 1,
      });
      loadDashboard(true);
    } catch (err: any) {
      notify(err?.message || 'Failed to submit service request.', 'error');
    } finally {
      setCreatingService(false);
    }
  };

  const unreadCount = (data?.notifications || []).filter((n: any) => !n.isRead).length;
  const activeOrdersCount = (data?.storeOrders || []).filter(
    (o: any) => !['Delivered', 'Cancelled', 'Completed'].includes(o.orderStatus)
  ).length;
  const pendingPaymentsCount =
    (data?.storeOrders || []).filter(
      (o: any) => o.paymentStatus !== 'paid' && o.orderStatus !== 'Cancelled'
    ).length +
    (data?.printingOrders || []).filter(
      (p: any) => p.paymentStatus !== 'paid' && !['Rejected', 'Cancelled'].includes(p.orderStatus)
    ).length +
    (data?.quotations || []).filter(
      (q: any) => q.status === 'Accepted' && q.paymentStatus !== 'paid' && Number(q.totalAmountInr || 0) > Number(q.paidAmountInr || 0)
    ).length +
    (data?.pcbEnquiries || []).filter((p: any) => p.quotedAmountInr && p.paymentStatus !== 'paid').length +
    (data?.b2bEnquiries || []).filter((b: any) => b.quotedAmountInr && b.paymentStatus !== 'paid').length;
  const totalEnquiriesCount =
    (data?.productEnquiries || []).length +
    (data?.projectEnquiries || []).length +
    (data?.pcbEnquiries || []).length +
    (data?.b2bEnquiries || []).length;

  const SIDEBAR_GROUPS: Array<{
    group: string;
    items: Array<{ key: TabKey; label: string; icon: React.ComponentType<any>; badge?: number }>;
  }> = [
    {
      group: 'Account Home',
      items: [{ key: 'overview', label: 'Overview', icon: LayoutDashboard }],
    },
    {
      group: 'Store & Billing',
      items: [
        { key: 'orders', label: 'My Orders', icon: Package, badge: data?.storeOrders?.length || 0 },
        { key: 'tracking', label: 'Track Orders', icon: Truck },
        { key: 'invoices', label: 'My Invoices', icon: FileText, badge: data?.invoices?.length || 0 },
        { key: 'addresses', label: 'My Addresses', icon: MapPin },
        { key: 'cart', label: 'My Cart', icon: ShoppingBag, badge: cart.length },
        { key: 'wishlist', label: 'My Wishlist', icon: Heart, badge: data?.wishlist?.length || 0 },
        { key: 'reviews', label: 'My Reviews', icon: Star },
      ],
    },
    {
      group: 'Engineering & Manufacturing',
      items: [
        { key: 'services', label: 'My Services', icon: Wrench, badge: (data?.serviceRecords || []).length },
        { key: 'enquiries', label: 'My Enquiries', icon: MessageSquare, badge: totalEnquiriesCount },
        { key: 'projects', label: 'My Projects', icon: FolderKanban, badge: data?.projects?.length || 0 },
        { key: 'printing', label: '3D Printing', icon: Box, badge: data?.printingOrders?.length || 0 },
        { key: 'pcb', label: 'PCB Services', icon: Cpu, badge: data?.pcbEnquiries?.length || 0 },
        { key: 'b2b_support', label: 'B2B Support', icon: LifeBuoy, badge: data?.supportTickets?.length || 0 },
      ],
    },
    {
      group: 'Identity & Security',
      items: [
        { key: 'profile', label: 'My Profile', icon: User },
        { key: 'settings', label: 'Settings', icon: Settings },
      ],
    },
  ];

  const renderSidebarContent = () => (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-[#DCEAF5] bg-[#F0F8FF]/60 space-y-2">
        <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#1E88E5]">
          Customer Account
        </div>
        <div className="font-display font-bold text-sm text-[#123B5D] truncate">
          {dbUser?.fullName || dbUser?.email || 'Account'}
        </div>
        <div className="font-mono text-[11px] font-semibold text-[#123B5D] bg-white border border-[#DCEAF5] rounded-md px-2 py-1 inline-block">
          Customer ID: {dbUser?.customerId || dbUser?.uid}
        </div>
        <div className="text-[11px] text-[#263746]/70 truncate">Email: {dbUser?.email}</div>
      </div>

      <nav className="flex-1 overflow-y-auto py-3 space-y-4">
        {SIDEBAR_GROUPS.map((grp) => (
          <div key={grp.group} className="space-y-0.5">
            <div className="px-4 pb-1 text-[10px] font-mono font-semibold uppercase tracking-wider text-[#263746]/55">
              {grp.group}
            </div>
            {grp.items.map((item) => {
              const Icon = item.icon;
              const isActive = tab === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => {
                    setTab(item.key);
                    setMobileNavOpen(false);
                  }}
                  className={`w-full flex items-center justify-between gap-2 px-4 py-2.5 text-xs transition-colors border-l-4 ${
                    isActive
                      ? 'border-[#1E88E5] bg-[#E3F2FD] text-[#123B5D] font-semibold'
                      : 'border-transparent text-[#263746] hover:bg-[#F0F8FF] hover:text-[#123B5D]'
                  }`}
                >
                  <span className="inline-flex items-center gap-2.5 truncate">
                    <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-[#1E88E5]' : 'text-[#42A5F5]'}`} />
                    <span className="truncate">{item.label}</span>
                  </span>
                  {typeof item.badge === 'number' && item.badge > 0 && (
                    <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-white border border-[#DCEAF5] text-[#123B5D] tabular-nums">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="p-3 border-t border-[#DCEAF5]">
        <button
          type="button"
          onClick={signOut}
          className="w-full px-3.5 py-2.5 rounded-lg border border-[#DCEAF5] bg-white hover:bg-red-50 hover:border-red-200 hover:text-red-700 text-[#123B5D] text-xs font-semibold inline-flex items-center justify-center gap-2 transition-colors"
        >
          <LogOut className="w-4 h-4" /> Logout
        </button>
      </div>
    </div>
  );

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-8 space-y-6">
      {/* Top Portal Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#DCEAF5] pb-5">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            className="lg:hidden mt-1 p-2 rounded-lg border border-[#DCEAF5] bg-white text-[#123B5D] hover:bg-[#F0F8FF]"
            aria-label="Open account navigation"
          >
            <Menu className="w-5 h-5" />
          </button>
          {dbUser?.profilePhotoUrl && (
            <img
              src={dbUser.profilePhotoUrl}
              alt={dbUser.fullName || 'Customer Avatar'}
              referrerPolicy="no-referrer"
              className="w-12 h-12 rounded-full object-cover border border-[#90CAF9] bg-[#F0F8FF] shrink-0"
            />
          )}
          <div>
            <div className="text-[11px] font-mono font-semibold uppercase tracking-wider text-[#42A5F5]">
              Customer Profile Header
            </div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#123B5D]">
              {dbUser?.fullName || dbUser?.email || 'Customer Account'}
            </h1>
            <div className="text-xs text-[#263746]/80 font-mono flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
              <span className="font-semibold text-[#123B5D]">
                Customer ID: {dbUser?.customerId || dbUser?.uid}
              </span>
              <span>·</span>
              <span>Email: {dbUser?.email}</span>
              {dbUser?.customerType && (
                <>
                  <span>·</span>
                  <span>{dbUser.customerType}</span>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {isAdmin && isAdminRole(dbUser?.role) && (
            <button
              onClick={() => navigate('/admin/dashboard')}
              className="px-4 py-2 bg-[#64B5F6] hover:bg-[#42A5F5] text-white text-xs font-semibold rounded-lg whitespace-nowrap shrink-0 transition-colors"
            >
              Open Admin Console
            </button>
          )}
          <button
            onClick={signOut}
            className="px-4 py-2 border border-[#90CAF9] bg-white text-[#123B5D] text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 hover:bg-[#F0F8FF] whitespace-nowrap shrink-0 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" /> Logout
          </button>
        </div>
      </div>

      {/* Mobile Drawer Navigation */}
      {mobileNavOpen && (
        <div
          className="fixed inset-0 z-50 lg:hidden bg-[#123B5D]/50 backdrop-blur-sm flex"
          onClick={() => setMobileNavOpen(false)}
        >
          <div
            className="w-72 max-w-[85vw] bg-white h-full border-r border-[#DCEAF5] shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-[#DCEAF5] flex items-center justify-between">
              <span className="font-display font-bold text-sm text-[#123B5D]">My Account Menu</span>
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                className="p-1.5 rounded-lg text-[#123B5D] hover:bg-[#F0F8FF]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-hidden">{renderSidebarContent()}</div>
          </div>
        </div>
      )}

      {/* Main Responsive Sidebar + Workspace Layout */}
      <div className="flex flex-col lg:flex-row gap-6 items-start">
        <aside className="hidden lg:flex lg:w-[260px] shrink-0 flex-col rounded-xl border border-[#DCEAF5] bg-white shadow-sm sticky top-24 overflow-hidden max-h-[calc(100vh-7rem)]">
          {renderSidebarContent()}
        </aside>

        <div className="flex-1 min-w-0 w-full space-y-8">
      {loading || !data ? (
        <div className="py-12 text-sm text-[#263746]/70">Loading your dashboard...</div>
      ) : (
        <div className="space-y-8">
          {/* OVERVIEW */}
          {tab === 'overview' && (
            <div className="space-y-8">
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
                {[
                  ['Total Orders', data.storeOrders.length, 'orders'],
                  ['Active Orders', activeOrdersCount, 'tracking'],
                  ['Pending Payments', pendingPaymentsCount, 'orders'],
                  ['Total Enquiries', totalEnquiriesCount, 'enquiries'],
                  ['Active Projects', data.projects.length, 'projects'],
                  ['Support Tickets', data.supportTickets.length, 'b2b_support'],
                ].map(([label, val, targetTab]) => (
                  <button
                    key={String(label)}
                    type="button"
                    onClick={() => setTab(targetTab as TabKey)}
                    className="text-left rounded-xl border border-[#DCEAF5] bg-white p-4 space-y-1 hover:border-[#64B5F6] hover:bg-[#F0F8FF]/40 transition-colors shadow-sm"
                  >
                    <div className="text-xs text-[#263746]/70">{label}</div>
                    <div className="font-mono text-2xl font-bold text-[#123B5D] tabular-nums">{val}</div>
                  </button>
                ))}
              </div>

              {/* Recent Orders & Enquiries Quick Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="rounded-xl border border-[#DCEAF5] bg-white p-5 space-y-3 shadow-sm">
                  <div className="flex items-center justify-between border-b border-[#DCEAF5]/60 pb-2.5">
                    <h2 className="font-display font-bold text-sm text-[#123B5D]">Recent Orders</h2>
                    <button
                      type="button"
                      onClick={() => setTab('orders')}
                      className="text-xs font-semibold text-[#1E88E5] hover:underline"
                    >
                      View All ({data.storeOrders.length})
                    </button>
                  </div>
                  {data.storeOrders.length === 0 ? (
                    <p className="text-xs text-[#263746]/70 py-2">No orders placed yet.</p>
                  ) : (
                    <div className="divide-y divide-[#DCEAF5]/60 text-xs">
                      {data.storeOrders.slice(0, 4).map((o: any) => (
                        <div key={o.id} className="py-2.5 flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-mono font-bold text-[#123B5D]">{o.orderNumber}</div>
                            <div className="text-[#263746]/70">
                              {new Date(o.createdAt).toLocaleDateString('en-IN')} · {o.orderStatus}
                            </div>
                          </div>
                          <div className="text-right font-mono tabular-nums shrink-0">
                            <div className="font-bold text-[#123B5D]">₹{Number(o.totalInr || 0).toLocaleString('en-IN')}</div>
                            <div className={o.paymentStatus === 'paid' ? 'text-emerald-700' : 'text-amber-700'}>
                              {o.paymentStatus}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-[#DCEAF5] bg-white p-5 space-y-3 shadow-sm">
                  <div className="flex items-center justify-between border-b border-[#DCEAF5]/60 pb-2.5">
                    <h2 className="font-display font-bold text-sm text-[#123B5D]">Recent Service &amp; Project Updates</h2>
                    <button
                      type="button"
                      onClick={() => setTab('projects')}
                      className="text-xs font-semibold text-[#1E88E5] hover:underline"
                    >
                      Open Projects
                    </button>
                  </div>
                  {data.projectEnquiries.length === 0 && data.printingOrders.length === 0 && data.pcbEnquiries.length === 0 ? (
                    <p className="text-xs text-[#263746]/70 py-2">No custom enquiries submitted yet.</p>
                  ) : (
                    <div className="divide-y divide-[#DCEAF5]/60 text-xs">
                      {[
                        ...(data.projectEnquiries || []).slice(0, 2).map((e: any) => ({
                          code: e.enquiryNumber,
                          title: e.projectTitle,
                          status: e.status,
                          tab: 'projects' as TabKey,
                        })),
                        ...(data.printingOrders || []).slice(0, 2).map((p: any) => ({
                          code: p.orderNumber,
                          title: `3D Print: ${p.fileName}`,
                          status: p.orderStatus,
                          tab: 'printing' as TabKey,
                        })),
                        ...(data.pcbEnquiries || []).slice(0, 2).map((pcb: any) => ({
                          code: pcb.enquiryNumber,
                          title: `PCB ${pcb.layerCount}-Layer (${pcb.boardDimensionsMm})`,
                          status: pcb.status,
                          tab: 'pcb' as TabKey,
                        })),
                      ]
                        .slice(0, 4)
                        .map((item) => (
                          <button
                            key={item.code}
                            type="button"
                            onClick={() => setTab(item.tab)}
                            className="w-full text-left py-2.5 flex items-center justify-between gap-2 hover:bg-[#F0F8FF]/50 rounded px-1"
                          >
                            <div className="min-w-0">
                              <div className="font-mono font-bold text-[#123B5D]">{item.code}</div>
                              <div className="text-[#263746]/80 truncate">{item.title}</div>
                            </div>
                            <span className="font-mono text-[11px] font-semibold text-[#1E88E5] shrink-0">
                              {item.status}
                            </span>
                          </button>
                        ))}
                    </div>
                  )}
                </div>
              </div>

              {/* KRASHIVANTRI Spraying & Pilot Portal Shortcuts */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-xl border border-[#DCEAF5] bg-[#F0F8FF]/60 p-5 flex items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="text-xs font-semibold text-[#123B5D] flex items-center gap-1.5">
                      <Sprout className="w-4 h-4 text-[#42A5F5]" /> KRASHIVANTRI Farmer Portal
                    </div>
                    <div className="text-xs text-[#263746]/80">
                      {data.farmerProfile
                        ? `${data.farmerProfile.farmerCode} · KYC: ${data.farmerProfile.kycStatus}`
                        : 'Register farm plots, draw boundaries & book spraying drones.'}
                    </div>
                  </div>
                  <button
                    onClick={() => navigate('/krashivantri/farmer-portal')}
                    className="px-4 py-2 bg-[#64B5F6] hover:bg-[#42A5F5] text-white text-xs font-semibold rounded-lg whitespace-nowrap shrink-0 transition-colors"
                  >
                    Open Farmer Portal
                  </button>
                </div>

                <div className="rounded-xl border border-[#DCEAF5] bg-[#F0F8FF]/60 p-5 flex items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="text-xs font-semibold text-[#123B5D] flex items-center gap-1.5">
                      <Navigation className="w-4 h-4 text-[#42A5F5]" /> KRASHIVANTRI Drone Pilot Portal
                    </div>
                    <div className="text-xs text-[#263746]/80">
                      {data.pilotProfile
                        ? `${data.pilotProfile.pilotCode} · KYC: ${data.pilotProfile.kycStatus}`
                        : 'Enroll DGCA RPC credentials, go online & manage spraying ops.'}
                    </div>
                  </div>
                  <button
                    onClick={() => navigate('/krashivantri/pilot-portal')}
                    className="px-4 py-2 border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] text-xs font-semibold rounded-lg whitespace-nowrap shrink-0 transition-colors"
                  >
                    Open Pilot Portal
                  </button>
                </div>
              </div>

              {(data.droneRepairs || []).length > 0 && (
                <div className="rounded-xl border border-[#DCEAF5] bg-white p-6 space-y-3 shadow-sm">
                  <h2 className="font-display font-bold text-[#123B5D]">
                    Drone Repair &amp; Diagnostics Bookings ({data.droneRepairs.length})
                  </h2>
                  <div className="divide-y divide-[#DCEAF5] text-xs">
                    {data.droneRepairs.map((dr: any) => (
                      <div key={dr.id} className="py-2.5 flex flex-wrap justify-between gap-2">
                        <div>
                          <span className="font-mono font-bold text-[#123B5D]">{dr.referenceNumber}</span> · {dr.droneBrandModel} ({dr.serviceMode})
                          <div className="text-[#263746]/70">{dr.problemDescription}</div>
                        </div>
                        <div className="text-right font-mono">
                          <div className="font-semibold text-[#42A5F5]">{dr.status}</div>
                          {dr.repairQuotationInr && <div>Quote: ₹{dr.repairQuotationInr.toLocaleString('en-IN')}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="rounded-xl border border-[#DCEAF5] bg-white p-6 space-y-4 shadow-sm">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="font-display font-bold text-[#123B5D] flex items-center gap-2">
                      <Bell className="w-4 h-4 text-[#42A5F5]" />
                      Notifications ({unreadCount} unread)
                    </h2>
                    {unreadCount > 0 && (
                      <button
                        type="button"
                        onClick={markAllNotificationsRead}
                        className="text-xs font-semibold text-[#1E88E5] hover:underline"
                      >
                        Mark All Read
                      </button>
                    )}
                  </div>
                  {data.notifications.length === 0 ? (
                    <p className="text-sm text-[#263746]/70">No recent notifications.</p>
                  ) : (
                    <div className="divide-y divide-[#DCEAF5]">
                      {data.notifications.slice(0, 8).map((n: any) => (
                        <div key={n.id} className={`py-3 flex items-start justify-between gap-3 text-xs ${n.isRead ? 'opacity-75' : ''}`}>
                          <div className="space-y-0.5">
                            <div className="font-semibold text-[#123B5D] flex items-center gap-1.5">
                              {!n.isRead && <span className="w-2 h-2 rounded-full bg-[#1E88E5] shrink-0" />}
                              <span>{n.title}</span>
                            </div>
                            <div className="text-[#263746]/80">{n.message}</div>
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <span className="text-[11px] text-[#263746]/60 font-mono">
                              {new Date(n.createdAt).toLocaleDateString('en-IN')}
                            </span>
                            {!n.isRead && (
                              <button
                                type="button"
                                onClick={() => markNotificationRead(n.id)}
                                className="text-[11px] font-semibold text-[#1E88E5] hover:underline"
                              >
                                Mark read
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-[#DCEAF5] bg-white p-6 space-y-4 shadow-sm">
                  <h2 className="font-display font-bold text-[#123B5D] flex items-center gap-2">
                    <Activity className="w-4 h-4 text-[#42A5F5]" />
                    Recent Account Activity
                  </h2>
                  {(data.activityLogs || []).length === 0 ? (
                    <p className="text-sm text-[#263746]/70">
                      Account events (logins, orders, enquiries, and profile updates) will appear here.
                    </p>
                  ) : (
                    <div className="divide-y divide-[#DCEAF5] text-xs">
                      {(data.activityLogs || []).slice(0, 10).map((log: any) => (
                        <div key={log.id} className="py-2.5 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-semibold text-[#123B5D] truncate">
                              {String(log.action || '').replace(/_/g, ' ')}
                            </div>
                            <div className="text-[#263746]/70 font-mono text-[11px] truncate">
                              {log.entityType} {log.entityId ? `· ${log.entityId}` : ''}
                            </div>
                          </div>
                          <span className="font-mono text-[11px] text-[#263746]/60 shrink-0">
                            {new Date(log.createdAt).toLocaleDateString('en-IN')}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* MY PROFILE */}
          {tab === 'profile' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              <form
                onSubmit={handleSaveProfile}
                className="lg:col-span-7 rounded-xl border border-[#DCEAF5] bg-white p-6 space-y-4 h-fit shadow-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h2 className="font-display font-bold text-lg text-[#123B5D]">My Profile</h2>
                    <div className="text-[11px] font-mono text-[#42A5F5]">
                      Customer ID: {dbUser?.customerId || dbUser?.uid} (Read-only)
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                    <UserCheck className="w-3.5 h-3.5" /> Email OTP Verified
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-[#123B5D]">Customer ID (Permanent)</label>
                    <input
                      disabled
                      readOnly
                      value={dbUser?.customerId || dbUser?.uid || ''}
                      className="w-full rounded-lg border border-[#DCEAF5] bg-[#F0F8FF]/60 px-3.5 py-2.5 text-sm font-mono font-semibold text-[#123B5D]/80 cursor-not-allowed"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-[#123B5D]">Email Address (Verified)</label>
                    <input
                      disabled
                      readOnly
                      value={dbUser?.email || ''}
                      className="w-full rounded-lg border border-[#DCEAF5] bg-[#F0F8FF]/60 px-3.5 py-2.5 text-sm font-mono text-[#263746]/80 cursor-not-allowed"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-[#123B5D]">Full Name *</label>
                    <input
                      required
                      placeholder="Full Name"
                      value={profileForm.fullName}
                      onChange={(e) => setProfileForm({ ...profileForm, fullName: e.target.value })}
                      className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3.5 py-2.5 text-sm text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-[#123B5D]">Phone Number</label>
                    <input
                      placeholder="10-digit Mobile Number"
                      value={profileForm.mobile}
                      onChange={(e) => setProfileForm({ ...profileForm, mobile: e.target.value })}
                      className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3.5 py-2.5 text-sm font-mono text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-[#123B5D]">Customer Type</label>
                    <select
                      value={profileForm.customerType}
                      onChange={(e) => setProfileForm({ ...profileForm, customerType: e.target.value })}
                      className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3.5 py-2.5 text-sm text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                    >
                      <option value="Individual">Individual</option>
                      <option value="Business">Business</option>
                      <option value="Academic">Academic</option>
                      <option value="FPO / Agri">FPO / Agri</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-[#123B5D]">Company / College</label>
                    <input
                      placeholder="Company, FPO, or College Name"
                      value={profileForm.companyOrCollege}
                      onChange={(e) => setProfileForm({ ...profileForm, companyOrCollege: e.target.value })}
                      className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3.5 py-2.5 text-sm text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-[#123B5D]">Profile Photo URL (Optional)</label>
                  <input
                    type="url"
                    placeholder="https://..."
                    value={profileForm.profilePhotoUrl}
                    onChange={(e) => setProfileForm({ ...profileForm, profilePhotoUrl: e.target.value })}
                    className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3.5 py-2.5 text-sm text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-[#123B5D]">Address</label>
                  <input
                    placeholder="Street / House / Flat / Area"
                    value={profileForm.fullAddress}
                    onChange={(e) => setProfileForm({ ...profileForm, fullAddress: e.target.value })}
                    className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3.5 py-2.5 text-sm text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-[#123B5D]">City</label>
                    <input
                      placeholder="City"
                      value={profileForm.city}
                      onChange={(e) => setProfileForm({ ...profileForm, city: e.target.value })}
                      className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3.5 py-2.5 text-sm text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-[#123B5D]">State</label>
                    <input
                      placeholder="State"
                      value={profileForm.state}
                      onChange={(e) => setProfileForm({ ...profileForm, state: e.target.value })}
                      className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3.5 py-2.5 text-sm text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-[#123B5D]">PIN Code</label>
                    <input
                      placeholder="6-digit PIN"
                      maxLength={10}
                      value={profileForm.pinCode}
                      onChange={(e) => setProfileForm({ ...profileForm, pinCode: e.target.value })}
                      className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3.5 py-2.5 text-sm font-mono text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                    />
                  </div>
                </div>

                <div className="pt-3 border-t border-[#DCEAF5] space-y-3">
                  <div className="text-xs font-bold text-[#123B5D]">Billing &amp; GST Details</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-[#123B5D]">Billing Entity / Name</label>
                      <input
                        placeholder="Legal / Billing Name"
                        value={profileForm.billingName}
                        onChange={(e) => setProfileForm({ ...profileForm, billingName: e.target.value })}
                        className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3.5 py-2 text-sm text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-[#123B5D]">GSTIN (Optional)</label>
                      <input
                        placeholder="27AABCU9603R1ZM"
                        maxLength={20}
                        value={profileForm.billingGstin}
                        onChange={(e) => setProfileForm({ ...profileForm, billingGstin: e.target.value.toUpperCase() })}
                        className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3.5 py-2 text-sm font-mono text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-[#123B5D]">Billing Email</label>
                      <input
                        type="email"
                        placeholder="accounts@company.com"
                        value={profileForm.billingEmail}
                        onChange={(e) => setProfileForm({ ...profileForm, billingEmail: e.target.value })}
                        className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3.5 py-2 text-sm text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-[#123B5D]">PAN (Optional)</label>
                      <input
                        placeholder="ABCDE1234F"
                        maxLength={16}
                        value={profileForm.billingPan}
                        onChange={(e) => setProfileForm({ ...profileForm, billingPan: e.target.value.toUpperCase() })}
                        className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3.5 py-2 text-sm font-mono text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                      />
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <label className="text-xs font-medium text-[#123B5D]">Registered Billing Address</label>
                      <input
                        placeholder="Billing street, city, state, PIN"
                        value={profileForm.billingAddress}
                        onChange={(e) => setProfileForm({ ...profileForm, billingAddress: e.target.value })}
                        className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3.5 py-2 text-sm text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                      />
                    </div>
                  </div>
                </div>

                <button type="submit" className="px-5 py-2.5 bg-[#64B5F6] hover:bg-[#42A5F5] text-white text-xs font-semibold rounded-lg transition-colors">
                  Save Profile Changes
                </button>
              </form>

              <div className="lg:col-span-5 rounded-xl border border-[#DCEAF5] bg-white p-6 space-y-4 h-fit shadow-sm">
                <h2 className="font-display font-bold text-lg text-[#123B5D]">Account &amp; Delivery Summary</h2>
                <div className="text-sm text-[#263746] space-y-2">
                  <div>Customer ID: <span className="font-mono font-bold text-[#123B5D]">{dbUser?.customerId || dbUser?.uid}</span></div>
                  <div>Email: <span className="font-mono text-[#123B5D]">{dbUser?.email}</span></div>
                  <div>Customer Type: <span className="font-semibold text-[#123B5D]">{dbUser?.customerType || 'Individual'}</span></div>
                  <div>Account Status: <span className="font-semibold text-emerald-700">{dbUser?.accountStatus || 'Active'}</span></div>
                  <div>Saved Addresses: <span className="font-mono font-bold text-[#123B5D]">{(data.addresses || []).length}</span></div>
                  <div>Verified Orders: <span className="font-mono font-bold text-[#123B5D]">{(data.storeOrders || []).filter((o: any) => o.paymentStatus === 'paid').length}</span></div>
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setTab('addresses')}
                    className="px-4 py-2 border border-[#90CAF9] bg-white rounded-lg text-xs font-semibold text-[#123B5D] hover:bg-[#F0F8FF] transition-colors"
                  >
                    Manage Addresses
                  </button>
                  <button
                    type="button"
                    onClick={() => setTab('settings')}
                    className="px-4 py-2 border border-[#90CAF9] bg-[#F0F8FF] rounded-lg text-xs font-semibold text-[#123B5D] hover:bg-[#E3F2FD] inline-flex items-center gap-1.5 transition-colors"
                  >
                    <Settings className="w-3.5 h-3.5 text-[#1E88E5]" /> Notification Settings
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* MY ADDRESSES */}
          {tab === 'addresses' && (
            <div className="rounded-xl border border-[#DCEAF5] bg-white p-6 space-y-6 shadow-sm">
              <AddressSelector
                title="Saved Billing & Delivery Addresses"
                addresses={data.addresses}
                selected={null}
                onSelect={() => {}}
                onAddressSaved={loadDashboard}
              />
              {data.addresses.length > 0 && (
                <div className="divide-y divide-[#DCEAF5] text-xs">
                  {data.addresses.map((a: AddressData & { id: number }) => (
                    <div key={a.id} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="space-y-0.5">
                        <div className="font-semibold text-[#123B5D] flex items-center gap-2 flex-wrap">
                          <span>{a.fullName} · {a.label}</span>
                          {a.isDefault && (
                            <span className="px-2 py-0.5 rounded bg-[#E3F2FD] border border-[#90CAF9] text-[#123B5D] font-mono text-[10px]">
                              Default
                            </span>
                          )}
                        </div>
                        <div className="text-[#263746]/80">
                          {a.houseFlat}, {a.streetArea}, {a.city}, {a.district ? `${a.district}, ` : ''}{a.state} — {a.pinCode} · Mobile: {a.mobile}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {!a.isDefault && (
                          <button
                            type="button"
                            onClick={() => setDefaultAddress(a.id)}
                            className="px-2.5 py-1.5 rounded-lg border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] font-semibold transition-colors"
                          >
                            Set Default
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setEditAddressModal({ ...a })}
                          className="p-1.5 rounded-lg border border-[#DCEAF5] text-[#123B5D] hover:bg-[#F0F8FF] transition-colors"
                          aria-label="Edit address"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteAddress(a.id)}
                          className="text-[#263746]/50 hover:text-red-600 p-1.5 transition-colors"
                          aria-label="Delete address"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* MY PROJECTS */}
          {tab === 'projects' && (
            <div className="space-y-8">
              {/* Active Projects, Progress Updates, Milestones, Final Balance & Handover */}
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-display text-xl font-bold text-[#123B5D]">
                    Active Projects, Engineering Progress &amp; Handover
                  </h2>
                  <button
                    onClick={() => navigate('/register-project')}
                    className="px-4 py-2 bg-[#64B5F6] hover:bg-[#42A5F5] text-white text-xs font-semibold rounded-lg transition-colors"
                  >
                    Register New Project
                  </button>
                </div>

                {data.projects.length === 0 ? (
                  <div className="rounded-xl border border-[#DCEAF5] bg-white p-6 text-sm text-[#263746]/70">
                    No active development projects yet. Projects activate automatically once a published quotation is approved and 50% advance payment is verified.
                  </div>
                ) : (
                  data.projects.map((p: any) => {
                    const workOrder = (data.workOrders || []).find((w: any) => w.projectId === p.id);
                    const clearanceCert = (data.clearanceCertificates || []).find((c: any) => c.projectId === p.id);
                    const handoverDocs = (data.handoverDocuments || []).filter((d: any) => d.projectId === p.id);
                    const deliveries = (data.deliveryRecords || []).filter((d: any) => d.projectId === p.id);
                    const payMilestones = (data.paymentMilestones || []).filter(
                      (m: any) => m.projectId === p.id || (p.quotationId && m.quotationId === p.quotationId)
                    );
                    const linkedEnq = (data.projectEnquiries || []).find((e: any) => e.id === p.enquiryId);
                    const linkedQuot = (data.quotations || []).find((q: any) => q.id === p.quotationId);
                    const projReceipts = (data.receipts || []).filter(
                      (r: any) =>
                        r.projectId === p.id ||
                        r.payload?.projectCode === p.projectCode ||
                        (p.quotationId && r.entityType === 'project_quotation' && r.entityId === p.quotationId)
                    );
                    const projFinalInvoice = (data.invoices || []).find(
                      (inv: any) => inv.entityType === 'project_final_invoice' && inv.entityId === p.id
                    );
                    const projPaySummary = (data.projectPayments || []).find((pp: any) => pp.projectId === p.id);
                    const projInstallments = [...(data.paymentInstallments || [])]
                      .filter((inst: any) => inst.projectId === p.id)
                      .sort((a: any, b: any) => Number(a.installmentNumber) - Number(b.installmentNumber));
                    const projTransactions = (data.paymentTransactions || []).filter(
                      (tx: any) => tx.projectId === p.id
                    );
                    const projReminders = (data.paymentReminders || []).filter((rem: any) => rem.projectId === p.id);
                    const projAttachments = (data.projectAttachments || []).filter(
                      (att: any) => att.projectId === p.id || (p.enquiryId && att.enquiryId === p.enquiryId)
                    );
                    const totalCostInr = Number(projPaySummary?.totalAmountInr || p.totalAmountInr || 0);
                    const paidCostInr = Number(projPaySummary?.paidAmountInr ?? p.paidAmountInr ?? 0);
                    const pendingCostInr = Number(
                      projPaySummary?.pendingAmountInr ?? p.balanceAmountInr ?? Math.max(0, totalCostInr - paidCostInr)
                    );
                    const payStatusLabel = String(
                      projPaySummary?.status || p.paymentClearanceStatus || 'Pending'
                    );
                    const firstInst = projInstallments.find((i: any) => i.installmentNumber === 1);
                    const secondInst = projInstallments.find((i: any) => i.installmentNumber === 2);
                    const customerEmail = dbUser?.email || '';
                    const progressPct = Math.min(100, Math.max(0, Number(p.progressPercent || 0)));

                    return (
                      <div key={p.id} className="rounded-xl border border-[#DCEAF5] bg-white p-6 space-y-5 shadow-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#DCEAF5] pb-3">
                          <div>
                            <div className="font-mono text-xs text-[#42A5F5] font-semibold">
                              {p.projectCode} {linkedEnq ? `· Reg ${linkedEnq.enquiryNumber}` : ''}
                            </div>
                            <h3 className="font-display text-lg font-bold text-[#123B5D]">{p.title}</h3>
                          </div>
                          <div className="text-right text-xs">
                            <div className="font-semibold text-[#123B5D]">
                              Status: {p.status} · Payment: {payStatusLabel} · Engineer: {p.assignedEngineer}
                            </div>
                            <div className="font-mono text-[#263746]/80 tabular-nums mt-0.5">
                              Total ₹{totalCostInr.toLocaleString('en-IN')} · Paid ₹
                              {paidCostInr.toLocaleString('en-IN')} · Pending ₹
                              {pendingCostInr.toLocaleString('en-IN')}
                            </div>
                          </div>
                        </div>

                        {/* Overall Development Progress Bar */}
                        <div className="space-y-1.5">
                          <div className="flex justify-between text-xs font-mono">
                            <span className="text-[#263746]/70">Overall Project Progress</span>
                            <span className="font-bold text-[#42A5F5]">{progressPct}%</span>
                          </div>
                          <div className="w-full h-2.5 bg-[#F0F8FF] rounded-full overflow-hidden border border-[#DCEAF5]">
                            <div
                              className="h-full bg-[#64B5F6] transition-all duration-300"
                              style={{ width: `${progressPct}%` }}
                            />
                          </div>
                        </div>

                        {/* Awaiting Advance Payment Banner (First Installment 50%) */}
                        {(p.status === 'Awaiting Advance Payment' || (firstInst && firstInst.status !== 'Paid')) && (
                          <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 flex flex-wrap items-center justify-between gap-3">
                            <div className="text-xs text-amber-950 space-y-0.5">
                              <div className="font-bold">
                                Awaiting Advance Payment — First Installment (50%): ₹
                                {Number(
                                  firstInst
                                    ? Math.max(0, Number(firstInst.amountInr) - Number(firstInst.paidAmountInr || 0))
                                    : Math.round(totalCostInr * 0.5)
                                ).toLocaleString('en-IN')}
                              </div>
                              <div>
                                Project development commences once the First Installment (50% Advance) is confirmed.
                              </div>
                            </div>
                            {firstInst && (
                              <button
                                type="button"
                                onClick={() =>
                                  setPayModal({
                                    open: true,
                                    entityType: 'project_installment',
                                    entityId: firstInst.id,
                                    paymentMode: 'advance',
                                    title: `${firstInst.title} — ${p.projectCode}`,
                                    amountInr: Math.max(
                                      1,
                                      Number(firstInst.amountInr || 0) - Number(firstInst.paidAmountInr || 0)
                                    ),
                                  })
                                }
                                className="px-4 py-2 bg-[#42A5F5] hover:bg-[#1E88E5] text-white text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 transition-colors"
                              >
                                <CreditCard className="w-3.5 h-3.5" /> Pay First Installment (50%)
                              </button>
                            )}
                          </div>
                        )}

                        {/* Separate 50% / 50% Payment Installment Cards */}
                        {projInstallments.length > 0 && (
                          <div className="space-y-2">
                            <div className="text-xs font-semibold text-[#123B5D]">
                              Project Payment Installments (Two 50% Milestones)
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              {[firstInst, secondInst].filter(Boolean).map((inst: any) => {
                                const instRem = Math.max(
                                  0,
                                  Number(inst.amountInr || 0) - Number(inst.paidAmountInr || 0)
                                );
                                const isInstPaid = inst.status === 'Paid' || (Number(inst.amountInr) > 0 && instRem === 0);
                                return (
                                  <div
                                    key={inst.id}
                                    className={`rounded-xl border p-4 text-xs space-y-2.5 ${
                                      isInstPaid
                                        ? 'border-emerald-200 bg-emerald-50/40'
                                        : 'border-[#90CAF9] bg-[#F0F8FF]'
                                    }`}
                                  >
                                    <div className="flex items-start justify-between gap-2">
                                      <div>
                                        <div className="font-semibold text-[#123B5D]">
                                          {inst.title} ({inst.percentage || 50}%)
                                        </div>
                                        <div className="text-[11px] text-[#263746]/75">
                                          {inst.installmentNumber === 1
                                            ? 'Payable before project commencement'
                                            : 'Payable at agreed second milestone / prior to handover'}
                                        </div>
                                      </div>
                                      <span
                                        className={`px-2 py-0.5 rounded border text-[10px] font-semibold uppercase ${
                                          isInstPaid
                                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                            : inst.status === 'Failed'
                                            ? 'bg-red-50 text-red-700 border-red-200'
                                            : 'bg-amber-50 text-amber-800 border-amber-200'
                                        }`}
                                      >
                                        {inst.status}
                                      </span>
                                    </div>
                                    <div className="grid grid-cols-3 gap-2 rounded-lg border border-[#DCEAF5] bg-white p-2 font-mono text-[11px] tabular-nums">
                                      <div>
                                        <div className="text-[10px] text-[#263746]/65">Amount</div>
                                        <div className="font-bold text-[#123B5D]">
                                          ₹{Number(inst.amountInr || 0).toLocaleString('en-IN')}
                                        </div>
                                      </div>
                                      <div>
                                        <div className="text-[10px] text-[#263746]/65">Paid</div>
                                        <div className="font-bold text-emerald-700">
                                          ₹{Number(inst.paidAmountInr || 0).toLocaleString('en-IN')}
                                        </div>
                                      </div>
                                      <div>
                                        <div className="text-[10px] text-[#263746]/65">Pending</div>
                                        <div className="font-bold text-amber-800">₹{instRem.toLocaleString('en-IN')}</div>
                                      </div>
                                    </div>
                                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-[#263746]/70">
                                      <span>
                                        Due:{' '}
                                        {inst.dueDate ||
                                          (inst.installmentNumber === 1 ? 'Before Commencement' : 'Second Milestone')}
                                      </span>
                                      {inst.paidAt && (
                                        <span>Paid {new Date(inst.paidAt).toLocaleDateString('en-IN')}</span>
                                      )}
                                    </div>
                                    {!isInstPaid && (
                                      <div className="flex flex-wrap items-center gap-2 pt-1">
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setPayModal({
                                              open: true,
                                              entityType: 'project_installment',
                                              entityId: inst.id,
                                              paymentMode: inst.installmentNumber === 1 ? 'advance' : 'balance',
                                              title: `${inst.title} — ${p.projectCode}`,
                                              amountInr: Math.max(1, instRem),
                                            })
                                          }
                                          className="px-3 py-1.5 bg-[#64B5F6] hover:bg-[#42A5F5] text-white rounded-lg font-semibold inline-flex items-center gap-1 transition-colors"
                                        >
                                          <CreditCard className="w-3.5 h-3.5" /> Pay ₹{instRem.toLocaleString('en-IN')}
                                        </button>
                                        {inst.paymentLinkUrl && inst.paymentLinkUrl.startsWith('http') && (
                                          <a
                                            href={inst.paymentLinkUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="px-2.5 py-1.5 border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] rounded-lg font-semibold inline-flex items-center gap-1"
                                          >
                                            <ExternalLink className="w-3 h-3 text-[#42A5F5]" /> Razorpay Link
                                          </a>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Balance Due Banner (Legacy quotation fallback if installments not created yet) */}
                        {projInstallments.length === 0 && Number(p.balanceAmountInr || 0) > 0 && p.quotationId && (
                          <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 flex flex-wrap items-center justify-between gap-3">
                            <div className="text-xs text-amber-950 space-y-0.5">
                              <div className="font-bold">
                                Remaining 50% Final Balance Pending: ₹{Number(p.balanceAmountInr).toLocaleString('en-IN')}
                              </div>
                              <div>
                                {p.handoverExceptionAuthorized
                                  ? 'Exception authorized by Super Admin. Complete remaining balance per agreed schedule.'
                                  : 'Complete remaining 50% final payment to unlock gated digital deliverable downloads, physical dispatch, and Payment Clearance Certificate.'}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                setPayModal({
                                  open: true,
                                  entityType: 'project_quotation',
                                  entityId: p.quotationId,
                                  paymentMode: 'balance',
                                  title: `Final Balance — ${p.projectCode}`,
                                  amountInr: p.balanceAmountInr,
                                })
                              }
                              className="px-4 py-2 bg-[#64B5F6] hover:bg-[#42A5F5] text-white text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 transition-colors"
                            >
                              <CreditCard className="w-3.5 h-3.5" /> Pay Remaining Balance ₹
                              {Number(p.balanceAmountInr).toLocaleString('en-IN')}
                            </button>
                          </div>
                        )}

                        {/* Payment Milestones */}
                        {payMilestones.length > 0 && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {payMilestones.map((m: any) => (
                              <div key={m.id} className="rounded-lg border border-[#DCEAF5] bg-[#F0F8FF] p-3 text-xs flex justify-between items-center">
                                <div>
                                  <div className="font-semibold text-[#123B5D]">{m.stageName} ({m.percent}%)</div>
                                  <div className="text-[11px] text-[#263746]/70">{m.dueTrigger}</div>
                                </div>
                                <div className="text-right font-mono tabular-nums">
                                  <div className="font-bold text-[#123B5D]">₹{m.amountInr.toLocaleString('en-IN')}</div>
                                  <div className={m.status === 'paid' ? 'text-[#42A5F5] font-semibold' : 'text-amber-700 font-semibold'}>
                                    {m.status}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Structured Engineering Progress Updates Timeline */}
                        {(p.updates || []).length > 0 && (
                          <div className="rounded-xl border border-[#DCEAF5] bg-[#F0F8FF] p-4 space-y-3 text-xs">
                            <div className="font-semibold text-[#123B5D]">
                              Engineering Progress Updates ({p.updates.length})
                            </div>
                            <div className="space-y-3">
                              {[...p.updates].reverse().map((upd: any, uIdx: number) => (
                                <div key={upd.id || uIdx} className="rounded-lg border border-[#DCEAF5] bg-white p-3.5 space-y-2">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div>
                                      {upd.category && (
                                        <span className="inline-block px-2 py-0.5 rounded bg-[#F0F8FF] border border-[#90CAF9] text-[#123B5D] font-semibold text-[10px] mr-2">
                                          {upd.category}
                                        </span>
                                      )}
                                      <span className="font-semibold text-[#123B5D]">{upd.title || 'Engineering Update'}</span>
                                    </div>
                                    <div className="font-mono text-[11px] text-[#263746]/70">
                                      {typeof upd.progressPercentage === 'number' && (
                                        <span className="text-[#42A5F5] font-bold mr-2">{upd.progressPercentage}%</span>
                                      )}
                                      {upd.timestamp ? new Date(upd.timestamp).toLocaleString('en-IN') : ''}
                                    </div>
                                  </div>
                                  <p className="text-[#263746] leading-relaxed">{upd.description || upd.note}</p>
                                  {upd.adminComments && (
                                    <div className="text-[11px] text-[#263746]/80 bg-[#F0F8FF] rounded p-2 border border-[#DCEAF5]">
                                      <strong className="text-[#123B5D]">Engineer Remarks:</strong> {upd.adminComments}
                                    </div>
                                  )}
                                  {((upd.photos && upd.photos.length > 0) ||
                                    (upd.videos && upd.videos.length > 0) ||
                                    (upd.reports && upd.reports.length > 0)) && (
                                    <div className="flex flex-wrap gap-1.5 pt-1">
                                      {[...(upd.photos || []), ...(upd.videos || []), ...(upd.reports || [])].map(
                                        (mf: any, mfIdx: number) => (
                                          <button
                                            key={mfIdx}
                                            type="button"
                                            onClick={() => downloadProtectedFile(mf.storagePath, mf.originalName)}
                                            className="px-2.5 py-1 border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] rounded text-[#123B5D] font-medium inline-flex items-center gap-1 transition-colors"
                                          >
                                            <Download className="w-3 h-3 text-[#42A5F5]" /> {mf.originalName}
                                          </button>
                                        )
                                      )}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Completion Proof Files */}
                        {(p.completionProof || []).length > 0 && (
                          <div className="rounded-lg border border-[#90CAF9] bg-[#F0F8FF] p-3.5 text-xs space-y-2">
                            <div className="font-semibold text-[#123B5D]">Completion Verification &amp; Proof</div>
                            <div className="flex flex-wrap gap-2">
                              {p.completionProof.map((cp: any, cpIdx: number) => (
                                <button
                                  key={cpIdx}
                                  type="button"
                                  onClick={() => downloadProtectedFile(cp.storagePath, cp.originalName)}
                                  className="px-2.5 py-1 bg-white border border-[#90CAF9] hover:bg-[#F0F8FF] rounded text-[#123B5D] font-medium inline-flex items-center gap-1 transition-colors"
                                >
                                  <Download className="w-3 h-3 text-[#42A5F5]" /> {cp.originalName}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Engineering Milestones */}
                        {(p.milestones || []).length > 0 && (
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            {p.milestones.map((m: any) => (
                              <div key={m.id} className="rounded-lg border border-[#DCEAF5] bg-white p-3 text-xs space-y-1">
                                <div className="font-semibold text-[#123B5D]">{m.title}</div>
                                <div className="text-[#42A5F5] font-medium">{m.status}</div>
                                {m.notes && <div className="text-[#263746]/80">{m.notes}</div>}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Official Project PDFs, Complete Invoice & Payment History Statement */}
                        <div className="flex flex-wrap gap-2">
                          {projFinalInvoice && (
                            <button
                              type="button"
                              onClick={() => downloadCloudInvoicePdf(projFinalInvoice)}
                              className="px-3 py-1.5 bg-[#42A5F5] hover:bg-[#1E88E5] text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
                            >
                              <Download className="w-3.5 h-3.5" /> Final Project Invoice ({projFinalInvoice.invoiceNumber})
                            </button>
                          )}

                          {projReceipts.map((rcp: any) => (
                            <button
                              key={rcp.id}
                              type="button"
                              onClick={() => downloadCloudReceiptPdf(rcp)}
                              className="px-3 py-1.5 border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
                            >
                              <Download className="w-3.5 h-3.5 text-emerald-700" /> Receipt ({rcp.receiptNumber})
                            </button>
                          ))}

                          {workOrder && (
                            <button
                              type="button"
                              onClick={() =>
                                downloadWorkOrderPdf({
                                  workOrderNumber: workOrder.workOrderNumber,
                                  projectCode: p.projectCode,
                                  projectTitle: p.title,
                                  assignedEngineer: workOrder.assignedEngineer || p.assignedEngineer,
                                  estimatedCompletionDate: workOrder.estimatedCompletionDate,
                                  scopeSummary: workOrder.scopeSummary,
                                  issuedAt: workOrder.issuedAt,
                                  customerEmail,
                                })
                              }
                              className="px-3 py-1.5 border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
                            >
                              <Download className="w-3.5 h-3.5 text-[#42A5F5]" /> Work Order ({workOrder.workOrderNumber})
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() =>
                              downloadCompleteProjectInvoicePdf({
                                projectCode: p.projectCode,
                                enquiryNumber: linkedEnq?.enquiryNumber || p.projectCode,
                                projectTitle: p.title,
                                customerName: linkedEnq?.customerName || dbUser?.fullName || customerEmail,
                                customerEmail,
                                customerPhone: linkedEnq?.customerPhone || dbUser?.mobile,
                                totalAmountInr: Number(p.totalAmountInr || linkedQuot?.totalAmountInr || 0),
                                gstInr: Number(linkedQuot?.gstInr || 0),
                                paidAmountInr: Number(p.paidAmountInr || 0),
                                balanceAmountInr: Number(p.balanceAmountInr || 0),
                                costCategories: linkedQuot?.costCategories,
                                receipts: projReceipts,
                                gstin:
                                  settings.projectSettings?.enableGstTax && settings.companyInfo?.gstin
                                    ? settings.companyInfo.gstin
                                    : undefined,
                              })
                            }
                            className="px-3 py-1.5 border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
                          >
                            <Download className="w-3.5 h-3.5 text-[#42A5F5]" /> Complete Project Invoice PDF
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              downloadPaymentHistoryStatementPdf({
                                projectCode: p.projectCode,
                                enquiryNumber: linkedEnq?.enquiryNumber || p.projectCode,
                                projectTitle: p.title,
                                customerName: linkedEnq?.customerName || dbUser?.fullName || customerEmail,
                                customerEmail,
                                totalAmountInr: Number(p.totalAmountInr || 0),
                                paidAmountInr: Number(p.paidAmountInr || 0),
                                balanceAmountInr: Number(p.balanceAmountInr || 0),
                                receipts: projReceipts,
                                gstin:
                                  settings.projectSettings?.enableGstTax && settings.companyInfo?.gstin
                                    ? settings.companyInfo.gstin
                                    : undefined,
                              })
                            }
                            className="px-3 py-1.5 border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
                          >
                            <Download className="w-3.5 h-3.5 text-[#42A5F5]" /> Payment History Statement PDF
                          </button>

                          {clearanceCert && (
                            <button
                              type="button"
                              onClick={() =>
                                downloadClearanceCertificatePdf({
                                  certificateNumber: clearanceCert.certificateNumber,
                                  projectCode: p.projectCode,
                                  projectTitle: p.title,
                                  totalAmountInr: clearanceCert.totalAmountInr,
                                  advancePaidInr: clearanceCert.advancePaidInr,
                                  finalPaidInr: clearanceCert.finalPaidInr,
                                  balanceInr: clearanceCert.balanceInr,
                                  paymentRefs: clearanceCert.paymentRefs || [],
                                  issuedAt: clearanceCert.issuedAt,
                                  issuedBy: clearanceCert.issuedBy,
                                  customerEmail,
                                })
                              }
                              className="px-3 py-1.5 border border-[#90CAF9] bg-[#F0F8FF] text-[#123B5D] rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-[#E3F2FD] transition-colors"
                            >
                              <Award className="w-3.5 h-3.5 text-[#42A5F5]" /> Clearance Cert ({clearanceCert.certificateNumber})
                            </button>
                          )}

                          {p.completionCertificateNumber && (
                            <button
                              type="button"
                              onClick={() =>
                                downloadCompletionCertificatePdf({
                                  certificateNumber: p.completionCertificateNumber,
                                  projectCode: p.projectCode,
                                  projectTitle: p.title,
                                  acknowledgedBy: p.customerAcknowledgedBy || customerEmail,
                                  acknowledgedAt: p.customerAcknowledgedAt || new Date().toISOString(),
                                  assignedEngineer: p.assignedEngineer || 'NexusTekFusion Engineering',
                                })
                              }
                              className="px-3 py-1.5 border border-[#90CAF9] bg-[#F0F8FF] text-[#123B5D] rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-[#E3F2FD] transition-colors"
                            >
                              <FileCheck2 className="w-3.5 h-3.5 text-[#42A5F5]" /> Completion Cert ({p.completionCertificateNumber})
                            </button>
                          )}
                        </div>

                        {/* Gated Deliverables Vault */}
                        {handoverDocs.length > 0 && (
                          <div className="rounded-lg border border-[#DCEAF5] bg-[#F0F8FF] p-4 space-y-2 text-xs">
                            <div className="font-semibold text-[#123B5D] flex items-center gap-1.5">
                              {p.handoverUnlocked ? (
                                <CheckCircle2 className="w-4 h-4 text-[#42A5F5]" />
                              ) : (
                                <Lock className="w-4 h-4 text-amber-700" />
                              )}
                              Project Deliverable Vault ({handoverDocs.length} files)
                            </div>
                            <div className="divide-y divide-[#DCEAF5]">
                              {handoverDocs.map((doc: any) => (
                                <div key={doc.id} className="py-2 flex flex-wrap items-center justify-between gap-2">
                                  <div>
                                    <div className="font-semibold text-[#123B5D]">
                                      {doc.title} ({doc.versionLabel})
                                    </div>
                                    <div className="font-mono text-[11px] text-[#263746]/70">
                                      {doc.fileName} · Category: {doc.category}
                                    </div>
                                  </div>
                                  {doc.unlocked && doc.downloadToken ? (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        downloadPrivateHandover(p.id, doc.id, doc.downloadToken, doc.fileName)
                                      }
                                      className="px-3 py-1.5 bg-[#64B5F6] hover:bg-[#42A5F5] text-white rounded font-semibold inline-flex items-center gap-1 transition-colors"
                                    >
                                      <Download className="w-3.5 h-3.5" /> Download
                                    </button>
                                  ) : (
                                    <span className="font-mono text-[11px] text-amber-800 inline-flex items-center gap-1">
                                      <Lock className="w-3 h-3" /> Locked until remaining 50% balance cleared
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Courier Dispatch & Handover Acknowledgment */}
                        {(deliveries.length > 0 || p.trackingId) && (
                          <div className="text-xs text-[#263746] font-mono flex items-center gap-2">
                            <Truck className="w-4 h-4 text-[#42A5F5] shrink-0" />
                            <span>
                              Dispatch:{' '}
                              {deliveries[0]
                                ? `${deliveries[0].courierName} · AWB ${deliveries[0].trackingNumber} (${deliveries[0].dispatchDate})`
                                : `${p.trackingCourier} · ${p.trackingId}`}
                            </span>
                          </div>
                        )}

                        {p.handoverUnlocked && !p.customerAcknowledgedAt && (
                          <button
                            type="button"
                            onClick={() => acknowledgeHandover(p.id)}
                            className="px-4 py-2 bg-[#64B5F6] hover:bg-[#42A5F5] text-white text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 transition-colors"
                          >
                            <CheckCircle2 className="w-4 h-4" /> Acknowledge Deliverable Receipt &amp; Issue Completion Certificate
                          </button>
                        )}

                        {/* Project Payment Transactions & Reminders */}
                        {projTransactions.length > 0 && (
                          <div className="rounded-lg border border-[#DCEAF5] bg-white p-4 space-y-2 text-xs">
                            <div className="font-semibold text-[#123B5D]">
                              Payment Transaction History ({projTransactions.length})
                            </div>
                            <div className="divide-y divide-[#DCEAF5]">
                              {projTransactions.map((tx: any) => (
                                <div key={tx.id} className="py-2 flex flex-wrap items-center justify-between gap-2">
                                  <div>
                                    <span className="font-mono font-bold text-[#123B5D]">{tx.transactionRef}</span>
                                    <span className="ml-2 text-[#263746]/80">
                                      Installment #{tx.installmentNumber} · {tx.paymentMethod}
                                    </span>
                                  </div>
                                  <div className="font-mono flex items-center gap-2">
                                    <span className="font-bold text-[#123B5D]">
                                      ₹{Number(tx.amountInr || 0).toLocaleString('en-IN')}
                                    </span>
                                    <span
                                      className={`px-2 py-0.5 rounded border text-[10px] font-semibold ${
                                        tx.status === 'Paid'
                                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                          : tx.status === 'Failed'
                                          ? 'bg-red-50 text-red-700 border-red-200'
                                          : 'bg-amber-50 text-amber-800 border-amber-200'
                                      }`}
                                    >
                                      {tx.status}
                                    </span>
                                    <span className="text-[11px] text-[#263746]/70">
                                      {new Date(tx.paidAt || tx.createdAt).toLocaleDateString('en-IN')}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {projReminders.length > 0 && (
                          <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-3.5 text-xs space-y-1">
                            <div className="font-semibold text-amber-950 flex items-center gap-1.5">
                              <Bell className="w-3.5 h-3.5" /> Payment Reminders ({projReminders.length})
                            </div>
                            {projReminders.slice(0, 3).map((rem: any) => (
                              <div key={rem.id} className="text-[11px] text-amber-900 font-mono">
                                Installment #{rem.installmentNumber} (₹{Number(rem.amountInr || 0).toLocaleString('en-IN')}) — Sent on{' '}
                                {new Date(rem.sentAt).toLocaleString('en-IN')}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Optional Project Attachments (Shown ONLY if attachments exist) */}
                        {projAttachments.length > 0 && (
                          <div className="rounded-lg border border-[#DCEAF5] bg-[#F0F8FF]/60 p-4 space-y-2 text-xs">
                            <div className="font-semibold text-[#123B5D]">
                              Project Attachments ({projAttachments.length})
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {projAttachments.map((att: any) => (
                                <button
                                  key={att.id}
                                  type="button"
                                  onClick={() => downloadProtectedFile(att.storagePath, att.fileName)}
                                  className="px-2.5 py-1.5 border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] rounded-lg font-medium inline-flex items-center gap-1"
                                >
                                  <Download className="w-3 h-3 text-[#42A5F5]" /> {att.fileName}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Project Agreements & Digital Acceptance */}
                        {(() => {
                          const projAgreements = (data.agreements || []).filter(
                            (ag: any) => ag.projectId === p.id || (p.enquiryId && ag.enquiryId === p.enquiryId)
                          );
                          if (projAgreements.length === 0) return null;
                          return (
                            <div className="rounded-lg border border-[#DCEAF5] bg-[#F0F8FF] p-4 space-y-3 text-xs">
                              <div className="font-semibold text-[#123B5D]">
                                Project Development Agreements &amp; Acceptance ({projAgreements.length})
                              </div>
                              {projAgreements.map((ag: any) => {
                                const isAccepted = ag.status === 'Accepted' || ag.status === 'Signed' || Boolean(ag.acceptedAt);
                                const canAccept = ag.status !== 'Draft' && !isAccepted;
                                const defaultSigner = dbUser?.fullName || linkedEnq?.customerName || dbUser?.email || '';

                                return (
                                  <div
                                    key={ag.id}
                                    className="rounded-lg border border-[#DCEAF5] bg-white p-3.5 space-y-3"
                                  >
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                      <div>
                                        <div className="font-mono font-bold text-[#123B5D]">
                                          {ag.agreementNumber} · {ag.title} ({ag.versionLabel})
                                        </div>
                                        <div className="text-[11px] text-[#263746]/75 mt-0.5">
                                          Status:{' '}
                                          <span
                                            className={`px-2 py-0.5 rounded border text-[10px] font-semibold ${
                                              isAccepted
                                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                                : 'bg-amber-50 text-amber-800 border-amber-200'
                                            }`}
                                          >
                                            {ag.status}
                                          </span>
                                          {ag.acceptedAt && (
                                            <span className="ml-2 text-emerald-800 font-mono">
                                              Accepted by {ag.acceptedByName || ag.signedByCustomer} on{' '}
                                              {new Date(ag.acceptedAt).toLocaleString('en-IN')}
                                            </span>
                                          )}
                                          {!ag.acceptedAt && ag.signedAt && (
                                            <span className="ml-2 font-mono">
                                              Signed on {new Date(ag.signedAt).toLocaleDateString('en-IN')}
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                      <div className="flex flex-wrap items-center gap-2">
                                        <button
                                          type="button"
                                          onClick={() =>
                                            downloadAgreementPdf(ag.id, 'original', ag.fileName || `${ag.agreementNumber}.pdf`)
                                          }
                                          className="px-2.5 py-1.5 border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] rounded font-semibold inline-flex items-center gap-1"
                                        >
                                          <Download className="w-3 h-3 text-[#42A5F5]" /> Download Agreement PDF
                                        </button>
                                        {ag.signedPdfPath && (
                                          <button
                                            type="button"
                                            onClick={() =>
                                              downloadAgreementPdf(
                                                ag.id,
                                                'signed',
                                                ag.signedFileName || `${ag.agreementNumber}-signed.pdf`
                                              )
                                            }
                                            className="px-2.5 py-1.5 border border-emerald-300 bg-emerald-50 text-emerald-800 rounded font-semibold inline-flex items-center gap-1"
                                          >
                                            <CheckCircle2 className="w-3 h-3" /> Signed Copy
                                          </button>
                                        )}
                                        <label className="px-2.5 py-1.5 border border-[#90CAF9] bg-[#F0F8FF] hover:bg-[#DCEAF5] text-[#123B5D] rounded font-semibold cursor-pointer inline-flex items-center gap-1">
                                          {uploadingAgreementId === ag.id ? 'Uploading...' : 'Upload Signed PDF'}
                                          <input
                                            type="file"
                                            accept=".pdf,application/pdf"
                                            disabled={uploadingAgreementId === ag.id}
                                            onChange={(e) => {
                                              const f = e.target.files?.[0];
                                              if (f) uploadSignedAgreementPdf(ag.id, f);
                                            }}
                                            className="hidden"
                                          />
                                        </label>
                                      </div>
                                    </div>

                                    {canAccept && (
                                      <div className="rounded-lg border border-[#90CAF9] bg-[#F0F8FF]/60 p-3 space-y-2.5">
                                        <div className="font-semibold text-[#123B5D]">
                                          Customer Agreement Acceptance &amp; Digital Signature
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 items-center">
                                          <input
                                            placeholder="Full Legal Name for Signing *"
                                            value={acceptNameMap[ag.id] ?? defaultSigner}
                                            onChange={(e) =>
                                              setAcceptNameMap((prev) => ({ ...prev, [ag.id]: e.target.value }))
                                            }
                                            className="rounded border border-[#DCEAF5] bg-white px-3 py-1.5 text-[#123B5D]"
                                          />
                                          <label className="flex items-start gap-2 text-[11px] text-[#263746] cursor-pointer">
                                            <input
                                              type="checkbox"
                                              checked={Boolean(acceptCheckMap[ag.id])}
                                              onChange={(e) =>
                                                setAcceptCheckMap((prev) => ({ ...prev, [ag.id]: e.target.checked }))
                                              }
                                              className="mt-0.5 accent-[#42A5F5]"
                                            />
                                            <span>
                                              I have reviewed the Project Development Agreement PDF and accept the scope, 50%/50% payment terms, timeline, and cancellation policy.
                                            </span>
                                          </label>
                                        </div>
                                        <div className="flex justify-end">
                                          <button
                                            type="button"
                                            disabled={acceptingAgreementId === ag.id}
                                            onClick={() => acceptAgreementDigitally(ag.id, defaultSigner)}
                                            className="px-4 py-1.5 bg-[#123B5D] hover:bg-[#1E88E5] text-white rounded-lg font-semibold inline-flex items-center gap-1.5 disabled:opacity-60"
                                          >
                                            <CheckCircle2 className="w-3.5 h-3.5" />
                                            {acceptingAgreementId === ag.id
                                              ? 'Recording Acceptance...'
                                              : 'Accept & Sign Agreement'}
                                          </button>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })()}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Registered Projects, Clarifications & Published Quotations */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-xl font-bold text-[#123B5D]">
                    Registered Projects &amp; Published Quotations
                  </h2>
                  <button
                    onClick={() => navigate('/register-project')}
                    className="px-4 py-2 bg-[#64B5F6] hover:bg-[#42A5F5] text-white text-xs font-semibold rounded-lg transition-colors"
                  >
                    Register Your Project
                  </button>
                </div>

                {(data.projectEnquiries || []).length === 0 ? (
                  <div className="rounded-xl border border-[#DCEAF5] bg-white p-6 text-sm text-[#263746]/70">
                    You have not registered any engineering projects yet. Click &ldquo;Register Your Project&rdquo; to get started.
                  </div>
                ) : (
                  data.projectEnquiries.map((enq: any) => {
                    const enqQuotes = (data.quotations || []).filter(
                      (q: any) => q.enquiryId === enq.id && q.status !== 'Draft'
                    );
                    const linkedProject = (data.projects || []).find((p: any) => p.enquiryId === enq.id);
                    const enqMessages = (data.projectMessages || []).filter((m: any) => m.enquiryId === enq.id);
                    const stageIdx = resolveProjectStageIndex(enq.status, linkedProject?.status);
                    const showDetails = Boolean(enqExpandedDetails[enq.id]);

                    return (
                      <div key={enq.id} className="rounded-xl border border-[#DCEAF5] bg-white p-6 space-y-5 shadow-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#DCEAF5] pb-3">
                          <div>
                            <div className="font-mono text-xs text-[#263746]/70">
                              {enq.enquiryNumber} · {enq.projectCategory} · {enq.projectType}
                              {linkedProject ? ` · Active Project ${linkedProject.projectCode}` : ''}
                            </div>
                            <h3 className="font-display text-lg font-bold text-[#123B5D]">{enq.projectTitle}</h3>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-[#123B5D] px-2.5 py-1 rounded bg-[#F0F8FF] border border-[#90CAF9]">
                              {linkedProject?.status || enq.status}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                setEnqExpandedDetails((prev) => ({ ...prev, [enq.id]: !prev[enq.id] }))
                              }
                              className="px-3 py-1 border border-[#90CAF9] bg-white text-[#123B5D] rounded text-xs font-semibold hover:bg-[#F0F8FF] transition-colors"
                            >
                              {showDetails ? 'Hide Details' : 'Full Submission'}
                            </button>
                          </div>
                        </div>

                        {/* 15-Stage Visual Progress Tracker */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-[11px] font-mono text-[#263746]/70">
                            <span>15-Stage Project Lifecycle Tracker</span>
                            <span>
                              Stage {stageIdx + 1} / {PROJECT_STAGES.length}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-1.5">
                            {PROJECT_STAGES.map((stageName, idx) => {
                              const reached = idx <= stageIdx;
                              const isCurrent = idx === stageIdx;
                              return (
                                <div
                                  key={stageName}
                                  className={`px-2 py-1.5 rounded-lg border text-[10px] leading-tight ${
                                    isCurrent
                                      ? 'border-[#64B5F6] bg-[#F0F8FF] text-[#123B5D] font-semibold'
                                      : reached
                                      ? 'border-[#90CAF9] bg-[#F0F8FF]/50 text-[#123B5D]'
                                      : 'border-[#DCEAF5] bg-white text-[#263746]/45'
                                  }`}
                                >
                                  <div className="font-mono text-[9px]">{idx + 1}.</div>
                                  <div className="truncate" title={stageName}>
                                    {stageName}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        <p className="text-sm text-[#263746]/80">{enq.projectDescription}</p>

                        {/* Expandable Full Submission Summary & Uploaded Documents */}
                        {showDetails && (
                          <div className="rounded-lg border border-[#DCEAF5] bg-[#F0F8FF] p-4 text-xs space-y-3 text-[#263746]">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              <div>
                                <strong className="text-[#123B5D]">Customer:</strong> {enq.customerName} ({enq.customerCategory || 'Customer'}) · {enq.customerPhone}
                                {enq.whatsappNumber ? ` · WA: ${enq.whatsappNumber}` : ''}
                              </div>
                              <div>
                                <strong className="text-[#123B5D]">Location &amp; Org:</strong> {enq.city || ''} {enq.state || ''} · {enq.companyOrCollege || '—'} ({enq.courseDepartment || '—'})
                              </div>
                              <div>
                                <strong className="text-[#123B5D]">Domain &amp; Complexity:</strong> {enq.engineeringDomain || enq.engineeringBranch} · {enq.projectComplexity || 'Intermediate'}
                              </div>
                              <div>
                                <strong className="text-[#123B5D]">Budget &amp; Target Date:</strong> {enq.estimatedBudget || 'Open'} · {enq.targetCompletionDate || 'Flexible'}
                              </div>
                            </div>
                            {enq.problemStatement && (
                              <div><strong className="text-[#123B5D]">Problem Statement:</strong> {enq.problemStatement}</div>
                            )}
                            {enq.projectObjective && (
                              <div><strong className="text-[#123B5D]">Objective:</strong> {enq.projectObjective}</div>
                            )}
                            {enq.expectedFunctionality && (
                              <div><strong className="text-[#123B5D]">Expected Working:</strong> {enq.expectedFunctionality}</div>
                            )}
                            {enq.requiredFeatures && (
                              <div><strong className="text-[#123B5D]">Required Features:</strong> {enq.requiredFeatures}</div>
                            )}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                              {enq.hardwareRequirements && <div><strong className="text-[#123B5D]">Hardware:</strong> {enq.hardwareRequirements}</div>}
                              {enq.softwareRequirements && <div><strong className="text-[#123B5D]">Software:</strong> {enq.softwareRequirements}</div>}
                              {enq.componentsRequired && <div><strong className="text-[#123B5D]">Components:</strong> {enq.componentsRequired}</div>}
                            </div>
                            <div>
                              <strong className="text-[#123B5D]">Deliverables Needed:</strong> Physical Prototype ({enq.flags?.needPrototype ? 'Yes' : 'No'}) · Web/Mobile App ({enq.flags?.needMobileWebApp ? 'Yes' : 'No'}) · Report/Docs ({enq.flags?.needDocumentation ? 'Yes' : 'No'})
                            </div>
                            {enq.attachments?.length > 0 && (
                              <div className="flex flex-wrap gap-2 pt-1">
                                {enq.attachments.map((att: any, aIdx: number) => (
                                  <button
                                    key={aIdx}
                                    type="button"
                                    onClick={() => downloadProtectedFile(att.storagePath, att.originalName)}
                                    className="px-2.5 py-1 border border-[#90CAF9] bg-white rounded text-[#123B5D] hover:bg-[#F0F8FF] inline-flex items-center gap-1"
                                  >
                                    <Download className="w-3 h-3 text-[#42A5F5]" /> {att.originalName}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {enq.rejectionReason && (
                          <div className="rounded-lg border border-red-200 bg-red-50 p-3.5 text-xs text-red-900">
                            <span className="font-semibold">Proposal Declined Reason:</span> {enq.rejectionReason}
                          </div>
                        )}
                        {enq.clarificationNotes && (
                          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-900">
                            <span className="font-semibold">Additional Information Requested by Engineering Team:</span>{' '}
                            {enq.clarificationNotes}
                          </div>
                        )}

                        {/* Customer-Admin Clarifications & Additional Document Upload Thread */}
                        {(enq.status === 'Additional Information Required' ||
                          enqMessages.length > 0 ||
                          showDetails) && (
                          <div className="rounded-lg border border-[#DCEAF5] bg-[#F0F8FF] p-4 space-y-3 text-xs">
                            <div className="font-semibold text-[#123B5D]">
                              Engineering Communication &amp; Additional Documents ({enqMessages.length})
                            </div>
                            {enqMessages.length > 0 && (
                              <div className="space-y-2 max-h-60 overflow-y-auto">
                                {enqMessages.map((msg: any) => (
                                  <div
                                    key={msg.id}
                                    className={`p-2.5 rounded-lg border ${
                                      msg.senderRole === 'admin'
                                        ? 'bg-amber-50 border-amber-200'
                                        : 'bg-white border-[#DCEAF5]'
                                    }`}
                                  >
                                    <div className="flex justify-between text-[11px] text-[#263746]/70">
                                      <span className="font-semibold text-[#123B5D]">
                                        {msg.senderRole === 'admin' ? 'NexusTekFusion Engineering' : msg.senderName}
                                      </span>
                                      <span className="font-mono">
                                        {new Date(msg.createdAt).toLocaleString('en-IN')}
                                      </span>
                                    </div>
                                    <p className="text-[#263746] mt-1">{msg.message}</p>
                                    {msg.attachments?.length > 0 && (
                                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                                        {msg.attachments.map((att: any, idx: number) => (
                                          <button
                                            key={idx}
                                            type="button"
                                            onClick={() => downloadProtectedFile(att.storagePath, att.originalName)}
                                            className="px-2 py-0.5 bg-white border border-[#90CAF9] rounded text-[#123B5D] inline-flex items-center gap-1"
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

                            <div className="flex flex-col sm:flex-row gap-2 pt-1">
                              <input
                                placeholder="Reply with clarification details or technical notes..."
                                value={enqReplyMap[enq.id] || ''}
                                onChange={(e) =>
                                  setEnqReplyMap((prev) => ({ ...prev, [enq.id]: e.target.value }))
                                }
                                className="flex-1 rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                              />
                              <label className="px-3 py-2 border border-[#90CAF9] bg-white rounded-lg cursor-pointer hover:bg-[#F0F8FF] text-[#123B5D] font-medium inline-flex items-center gap-1 transition-colors">
                                <span>
                                  {(enqReplyFiles[enq.id] || []).length > 0
                                    ? `${enqReplyFiles[enq.id].length} file(s)`
                                    : 'Attach Docs'}
                                </span>
                                <input
                                  type="file"
                                  multiple
                                  onChange={(e) =>
                                    setEnqReplyFiles((prev) => ({
                                      ...prev,
                                      [enq.id]: Array.from(e.target.files || []),
                                    }))
                                  }
                                  className="hidden"
                                />
                              </label>
                              <button
                                type="button"
                                onClick={() => sendEnquiryMessage(enq.id)}
                                className="px-4 py-2 bg-[#64B5F6] hover:bg-[#42A5F5] text-white rounded-lg font-semibold transition-colors"
                              >
                                Send Reply
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Published Quotations Only (Draft hidden by server & client) */}
                        {enqQuotes.map((q: any) => {
                          const paidSoFar = Number(q.paidAmountInr || 0);
                          const remainingInr = Math.max(0, q.totalAmountInr - paidSoFar);
                          const canPayAdvanceOrFull =
                            q.status === 'Accepted' || q.status === 'Quotation Approved by Customer';

                          return (
                            <div key={q.id} className="rounded-lg border border-[#DCEAF5] bg-[#F0F8FF] p-4 space-y-3 text-xs">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="font-semibold text-[#123B5D]">
                                  {q.quotationNumber ? `${q.quotationNumber} · ` : ''}Quotation Rev #{q.revisionNumber} · Status: {q.status} · Payment: {q.paymentStatus || 'pending'}
                                </span>
                                <span className="font-mono font-bold text-[#123B5D] tabular-nums">
                                  Total ₹{q.totalAmountInr.toLocaleString('en-IN')} · Paid ₹{paidSoFar.toLocaleString('en-IN')} · Balance ₹{remainingInr.toLocaleString('en-IN')}
                                </span>
                              </div>
                              {(q.estimatedDuration || q.estimatedDeliveryDate || q.paymentTerms) && (
                                <div className="text-[11px] text-[#263746]/70 flex flex-wrap gap-4">
                                  {q.estimatedDuration && <span>Duration: {q.estimatedDuration}</span>}
                                  {q.estimatedDeliveryDate && <span>Est. Delivery: {q.estimatedDeliveryDate}</span>}
                                  {q.validityDays && <span>Validity: {q.validityDays} days</span>}
                                  {q.paymentTerms && <span>Terms: {q.paymentTerms}</span>}
                                </div>
                              )}

                              {/* Cost Breakdown Summary Chips */}
                              {q.costCategories && (
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] bg-white rounded-lg border border-[#DCEAF5] p-3">
                                  {[
                                    ['Hardware', q.costCategories.hardware],
                                    ['Software Dev', q.costCategories.software],
                                    ['Components', q.costCategories.sensors],
                                    ['PCB / Mfg', q.costCategories.pcb],
                                    ['3D Print / Mech', (q.costCategories.printing3d || 0) + (q.costCategories.mechanical || 0)],
                                    ['Engineering & Dev', q.costCategories.development],
                                    ['Testing & QA', q.costCategories.testing],
                                    ['Documentation', q.costCategories.documentation],
                                    ['Delivery & Other', (q.costCategories.delivery || 0) + (q.costCategories.other || 0)],
                                    ['GST / Taxes', q.gstInr],
                                  ]
                                    .filter(([, v]) => Number(v || 0) > 0)
                                    .map(([lbl, v]) => (
                                      <div key={String(lbl)} className="flex justify-between gap-2 font-mono">
                                        <span className="text-[#263746]/70">{lbl}:</span>
                                        <span className="font-semibold text-[#123B5D]">
                                          ₹{Number(v).toLocaleString('en-IN')}
                                        </span>
                                      </div>
                                    ))}
                                </div>
                              )}

                              <div className="flex flex-wrap gap-2">
                                <button
                                  onClick={() =>
                                    downloadQuotationPdf({
                                      enquiryNumber: enq.enquiryNumber,
                                      projectTitle: enq.projectTitle,
                                      customerName: enq.customerName,
                                      customerEmail: enq.customerEmail,
                                      customerPhone: enq.customerPhone,
                                      customerCategory: enq.customerCategory,
                                      quotation: q,
                                      gstin: settings.companyInfo?.gstin,
                                    })
                                  }
                                  className="px-3 py-1.5 border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] rounded-lg font-semibold inline-flex items-center gap-1 transition-colors"
                                >
                                  <Download className="w-3.5 h-3.5" /> Quotation PDF
                                </button>

                                {q.status === 'Sent' && (
                                  <>
                                    <button
                                      onClick={() => respondQuotation(q.id, 'accept')}
                                      className="px-3 py-1.5 bg-[#64B5F6] hover:bg-[#42A5F5] text-white rounded-lg font-semibold transition-colors"
                                    >
                                      Accept &amp; Approve Quotation
                                    </button>
                                    <button
                                      onClick={() => {
                                        setModifyQuoteId(modifyQuoteId === q.id ? null : q.id);
                                        setModifyFeedback('');
                                      }}
                                      className="px-3 py-1.5 border border-amber-500 text-amber-800 bg-amber-50 rounded-lg font-semibold"
                                    >
                                      Request Modification
                                    </button>
                                    <button
                                      onClick={() => respondQuotation(q.id, 'reject')}
                                      className="px-3 py-1.5 border border-red-300 text-red-700 rounded-lg font-semibold"
                                    >
                                      Reject
                                    </button>
                                  </>
                                )}

                                {canPayAdvanceOrFull && remainingInr > 0 && (
                                  <>
                                    {paidSoFar === 0 ? (
                                      <>
                                        <button
                                          onClick={() =>
                                            setPayModal({
                                              open: true,
                                              entityType: 'project_quotation',
                                              entityId: q.id,
                                              paymentMode: 'advance',
                                              title: `50% Advance Payment — ${enq.enquiryNumber}`,
                                              amountInr: q.advanceAmountInr,
                                            })
                                          }
                                          className="px-4 py-1.5 bg-[#64B5F6] hover:bg-[#42A5F5] text-white rounded-lg font-semibold inline-flex items-center gap-1 transition-colors"
                                        >
                                          <CreditCard className="w-3.5 h-3.5" /> Pay 50% Advance ₹
                                          {q.advanceAmountInr.toLocaleString('en-IN')}
                                        </button>
                                        {q.advanceAmountInr < q.totalAmountInr && (
                                          <button
                                            onClick={() =>
                                              setPayModal({
                                                open: true,
                                                entityType: 'project_quotation',
                                                entityId: q.id,
                                                paymentMode: 'full',
                                                title: `Full 100% Payment — ${enq.enquiryNumber}`,
                                                amountInr: q.totalAmountInr,
                                              })
                                            }
                                            className="px-4 py-1.5 border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] rounded-lg font-semibold inline-flex items-center gap-1 transition-colors"
                                          >
                                            <CreditCard className="w-3.5 h-3.5" /> Pay Full ₹
                                            {q.totalAmountInr.toLocaleString('en-IN')}
                                          </button>
                                        )}
                                      </>
                                    ) : (
                                      <button
                                        onClick={() =>
                                          setPayModal({
                                            open: true,
                                            entityType: 'project_quotation',
                                            entityId: q.id,
                                            paymentMode: 'balance',
                                            title: `Remaining 50% Final Payment — ${enq.enquiryNumber}`,
                                            amountInr: remainingInr,
                                          })
                                        }
                                        className="px-4 py-1.5 bg-[#64B5F6] hover:bg-[#42A5F5] text-white rounded-lg font-semibold inline-flex items-center gap-1 transition-colors"
                                      >
                                        <CreditCard className="w-3.5 h-3.5" /> Pay Remaining Balance ₹
                                        {remainingInr.toLocaleString('en-IN')}
                                      </button>
                                    )}
                                  </>
                                )}
                              </div>

                              {modifyQuoteId === q.id && (
                                <div className="flex flex-wrap gap-2 pt-2 border-t border-[#DCEAF5]">
                                  <input
                                    placeholder="Describe required changes (components, budget, timeline)..."
                                    value={modifyFeedback}
                                    onChange={(e) => setModifyFeedback(e.target.value)}
                                    className="flex-1 min-w-[220px] rounded-lg border border-[#DCEAF5] bg-white px-3 py-1.5 text-xs text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => respondQuotation(q.id, 'modify', modifyFeedback)}
                                    className="px-3 py-1.5 bg-amber-700 text-white rounded-lg font-semibold"
                                  >
                                    Send Revision Request
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* 3D PRINTING ENQUIRIES & ORDERS */}
          {tab === 'printing' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-display font-bold text-xl text-[#123B5D]">
                  3D Printing Enquiries &amp; Custom Jobs ({data.printingOrders.length})
                </h2>
                <button
                  type="button"
                  onClick={() => navigate('/services/3d-printing')}
                  className="px-4 py-2 bg-[#64B5F6] hover:bg-[#42A5F5] text-white text-xs font-semibold rounded-lg transition-colors"
                >
                  Upload New 3D Model
                </button>
              </div>
              {data.printingOrders.length === 0 ? (
                <div className="rounded-xl border border-[#DCEAF5] bg-white p-8 text-center space-y-3">
                  <p className="text-sm text-[#263746]/70">No 3D printing enquiries yet.</p>
                  <button
                    onClick={() => navigate('/services/3d-printing')}
                    className="px-4 py-2 bg-[#64B5F6] hover:bg-[#42A5F5] text-white text-xs font-semibold rounded-lg transition-colors"
                  >
                    Upload a 3D Model
                  </button>
                </div>
              ) : (
                data.printingOrders.map((po: any) => {
                  const cp = po.customerParameters || {};
                  const dims = po.boundingBoxMm || cp.dimensionsMm || null;
                  const canDownloadOwnFile = po.downloadUnlocked !== false;
                  const pStatus = String(po.paymentStatus || 'pending').toLowerCase();
                  const rStatus = String(po.refundStatus || 'none').toLowerCase();
                  const isPaid = pStatus === 'paid' && rStatus === 'none';
                  const isRefunded = pStatus === 'refunded' || pStatus === 'partially_refunded' || rStatus === 'full' || rStatus === 'partial';
                  const isFailed = pStatus === 'failed' || pStatus === 'cancelled';
                  const paymentDisplay = isPaid
                    ? 'Payment Successful — Payment Completed'
                    : isRefunded
                    ? 'Payment Refunded'
                    : isFailed
                    ? 'Payment Failed — Payment Not Completed'
                    : 'Pending Payment — Payment Not Completed';
                  const quotedAmount = po.quotedPriceInr ?? po.totalInr ?? 0;
                  const canPayNow =
                    !isPaid &&
                    !isRefunded &&
                    !['Rejected', 'Cancelled'].includes(po.orderStatus) &&
                    Number(quotedAmount) > 0 &&
                    (!po.pricingBreakdown?.technicalReviewRequired || po.slicingStatus === 'Slicing Completed');

                  return (
                    <div key={po.id} className="rounded-xl border border-[#DCEAF5] bg-white p-6 space-y-4">
                      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#DCEAF5]/60 pb-3">
                        <div>
                          <div className="font-mono text-xs text-[#263746]/70">
                            {po.orderNumber} · {po.fileFormat || 'CAD'} · {po.fileVersion || 'v1'} ·{' '}
                            {po.fileSizeBytes ? `${(po.fileSizeBytes / 1024).toFixed(1)} KB` : 'Saved'} ·{' '}
                            Uploaded {new Date(po.uploadedAt || po.createdAt).toLocaleString('en-IN')}
                          </div>
                          <div className="font-display font-bold text-[#123B5D] text-lg">{po.fileName}</div>
                          <div className="text-xs text-[#263746]/80">
                            {po.technology} ({po.printerName || cp.printerName || 'Industrial Printer'}) · {po.materialName} ({po.colorName})
                          </div>
                        </div>
                        <div className="text-right font-mono space-y-1">
                          <div className="font-bold text-[#123B5D] text-base">
                            {Number(quotedAmount) > 0 ? `₹${Number(quotedAmount).toLocaleString('en-IN')}` : 'Awaiting Quotation'}
                          </div>
                          <div className="text-xs font-semibold text-[#123B5D]">
                            Printing Status:{' '}
                            <span className={po.orderStatus === 'Rejected' || po.orderStatus === 'Cancelled' ? 'text-red-700' : 'text-[#42A5F5]'}>
                              {po.orderStatus}
                            </span>
                          </div>
                          <div className="text-xs">
                            <span
                              className={
                                isPaid
                                  ? 'text-emerald-700 font-semibold'
                                  : isRefunded || isFailed
                                  ? 'text-red-700 font-semibold'
                                  : 'text-amber-700 font-semibold'
                              }
                            >
                              {paymentDisplay}
                            </span>
                          </div>
                        </div>
                      </div>

                      {po.orderStatus === 'Rejected' && po.rejectionReason && (
                        <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2 text-xs text-red-900">
                          <strong>Enquiry Rejected:</strong> {po.rejectionReason}
                        </div>
                      )}

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 rounded-lg bg-[#F0F8FF] border border-[#DCEAF5] p-3.5 text-xs">
                        <div>
                          <span className="text-[#263746]/70 block">Layer / Infill</span>
                          <span className="font-mono font-semibold text-[#123B5D]">
                            {po.layerHeightMm} mm · {po.infillPercent}%
                          </span>
                        </div>
                        <div>
                          <span className="text-[#263746]/70 block">Walls / Nozzle / Speed</span>
                          <span className="font-mono font-semibold text-[#123B5D]">
                            {po.wallCount ?? cp.wallCount ?? 3} walls · {po.nozzleDiameterMm ?? cp.nozzleDiameterMm ?? 0.4}mm · {po.printSpeedMmS ?? cp.printSpeedMmS ?? 60}mm/s
                          </span>
                        </div>
                        <div>
                          <span className="text-[#263746]/70 block">Orientation / Scale</span>
                          <span className="font-mono font-semibold text-[#123B5D]">
                            {po.buildOrientation || cp.buildOrientation || 'Auto Optimal'} ({po.scalePercent ?? cp.scalePercent ?? 100}%)
                          </span>
                        </div>
                        <div>
                          <span className="text-[#263746]/70 block">Qty / Support / Finishing</span>
                          <span className="font-mono font-semibold text-[#123B5D]">
                            Qty {po.quantity} · {po.supportEnabled ? 'Supports On' : 'No Supports'} · {po.finishingOption || 'Standard'}
                          </span>
                        </div>
                        {dims && (
                          <div className="col-span-2">
                            <span className="text-[#263746]/70 block">Dimensions &amp; Estimates</span>
                            <span className="font-mono font-semibold text-[#123B5D]">
                              {dims.x} × {dims.y} × {dims.z} mm · {po.volumeCm3} cm³ · {po.estimatedWeightG} g
                            </span>
                          </div>
                        )}
                        {po.specialInstructions && (
                          <div className="col-span-2">
                            <span className="text-[#263746]/70 block">Special Notes</span>
                            <span className="text-[#263746]">{po.specialInstructions}</span>
                          </div>
                        )}
                      </div>

                      {po.trackingId && (
                        <div className="text-xs font-mono text-[#263746]">
                          Tracking: {po.trackingCourier} ({po.trackingId})
                        </div>
                      )}

                      <div className="flex flex-wrap items-center gap-3 pt-1">
                        {canPayNow && (
                          <button
                            onClick={() =>
                              setPayModal({
                                open: true,
                                entityType: 'printing_order',
                                entityId: po.id,
                                title: `3D Print ${po.orderNumber}`,
                                amountInr: Number(quotedAmount),
                              })
                            }
                            className="px-4 py-2 bg-[#64B5F6] hover:bg-[#42A5F5] text-white text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 transition-colors"
                          >
                            <CreditCard className="w-3.5 h-3.5" /> Pay ₹{Number(quotedAmount).toLocaleString('en-IN')} Now
                          </button>
                        )}

                        {canDownloadOwnFile ? (
                          <button
                            type="button"
                            disabled={downloading3dId === po.id}
                            onClick={() => downloadOriginal3DFile(po)}
                            className="px-4 py-2 border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 disabled:opacity-60 transition-colors"
                          >
                            <Download className="w-3.5 h-3.5" />
                            {downloading3dId === po.id ? 'Downloading...' : 'Download My 3D File'}
                          </button>
                        ) : (
                          <div
                            title={po.downloadLockReason || 'Customer download disabled by administrator.'}
                            className="px-3.5 py-2 rounded-lg border border-[#DCEAF5] bg-[#F0F8FF] text-[#263746]/70 text-xs inline-flex items-center gap-1.5"
                          >
                            <Lock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                            <span>{po.downloadLockReason || 'Customer download disabled by administrator.'}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* MY ORDERS */}
          {tab === 'orders' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-[#DCEAF5] bg-[#F0F8FF] px-5 py-3.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="text-[#263746]">
                  Manage your hardware and KRASHIVANTRI drone orders, view details, cancel prior to dispatch, or download paid GST Tax Invoices.
                </span>
                <a
                  href={`mailto:${settings.companyInfo?.customerCareEmail || 'info@nexustekfusion.in'}?subject=${encodeURIComponent('Store Order Customer Care Support')}`}
                  className="inline-flex items-center gap-1.5 font-mono font-semibold text-[#42A5F5] hover:text-[#123B5D] hover:underline"
                >
                  <Mail className="w-3.5 h-3.5" />
                  Customer Care ({settings.companyInfo?.customerCareEmail || 'info@nexustekfusion.in'})
                </a>
              </div>

              {data.storeOrders.length === 0 ? (
                <div className="rounded-xl border border-[#DCEAF5] bg-white p-10 text-center space-y-3">
                  <p className="text-sm text-[#263746]/70">No store orders placed yet.</p>
                  <button
                    type="button"
                    onClick={() => navigate('/store')}
                    className="px-4 py-2 bg-[#64B5F6] hover:bg-[#42A5F5] text-white text-xs font-semibold rounded-lg transition-colors"
                  >
                    Browse Store
                  </button>
                </div>
              ) : (
                data.storeOrders.map((ord: any) => {
                  const ordInvoice = (data.invoices || []).find(
                    (inv: any) => inv.entityType === 'store_order' && inv.entityId === ord.id
                  );
                  const canCancel = ['Order Placed', 'Pending Payment', 'Payment Confirmed', 'Order Processing'].includes(
                    ord.orderStatus
                  );
                  return (
                    <div key={ord.id} className="rounded-xl border border-[#DCEAF5] bg-white p-6 space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#DCEAF5]/60 pb-3">
                        <div className="space-y-0.5">
                          <div className="font-mono text-sm font-bold text-[#123B5D]">{ord.orderNumber}</div>
                          <div className="text-xs text-[#263746]/70">
                            Placed {new Date(ord.createdAt).toLocaleString('en-IN')}
                            {ord.shippingAddress?.city ? ` · To ${ord.shippingAddress.city}, ${ord.shippingAddress.pinCode || ''}` : ''}
                          </div>
                        </div>
                        <div className="text-right font-mono tabular-nums">
                          <div className="font-bold text-base text-[#123B5D]">₹{Number(ord.totalInr || 0).toLocaleString('en-IN')}</div>
                          <div className="text-xs font-semibold">
                            <span className={ord.orderStatus === 'Cancelled' ? 'text-red-700' : 'text-[#42A5F5]'}>
                              {ord.orderStatus}
                            </span>
                            {' · '}
                            <span className={ord.paymentStatus === 'paid' ? 'text-[#123B5D]' : 'text-amber-700'}>
                              {ord.paymentStatus}
                            </span>
                            {ord.refundStatus && ord.refundStatus !== 'none' ? ` · Refund: ${ord.refundStatus}` : ''}
                          </div>
                        </div>
                      </div>

                      <div className="divide-y divide-[#DCEAF5]/60">
                        {(ord.items || []).map((it: any, idx: number) => (
                          <div key={idx} className="py-2.5 flex items-center gap-3 text-xs">
                            <img
                              src={it.imageUrl || '/assets/aistudio/image_1a5ac752.png'}
                              alt={it.name}
                              referrerPolicy="no-referrer"
                              className="w-14 h-12 rounded-lg object-cover bg-[#F0F8FF] shrink-0"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="font-semibold text-[#123B5D] truncate">{it.name}</div>
                              <div className="text-[#263746]/70 font-mono">
                                {it.sku || 'SKU'} · Qty {it.qty}
                                {it.variant ? ` · ${it.variant}` : ''}
                              </div>
                            </div>
                            <div className="font-mono font-semibold text-[#123B5D] tabular-nums">
                              ₹{Number(it.lineTotalInr || 0).toLocaleString('en-IN')}
                            </div>
                          </div>
                        ))}
                      </div>

                      {ord.trackingId && (
                        <div className="text-xs font-mono text-[#263746] bg-[#F0F8FF] rounded-lg px-3 py-2 border border-[#DCEAF5] flex flex-wrap items-center justify-between gap-2">
                          <span>
                            Courier: {ord.trackingCourier || 'Assigned'} · AWB: {ord.trackingId}
                          </span>
                          {ord.trackingUrl && (
                            <a
                              href={ord.trackingUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[#42A5F5] hover:text-[#123B5D] hover:underline inline-flex items-center gap-1"
                            >
                              Track Shipment <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                      )}

                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setOrderDetailModal(ord)}
                          className="px-3.5 py-2 border border-[#DCEAF5] hover:bg-[#F0F8FF] text-[#263746] text-xs font-semibold rounded-lg whitespace-nowrap shrink-0 transition-colors"
                        >
                          View Details
                        </button>
                        <button
                          type="button"
                          onClick={() => setTab('tracking')}
                          className="px-3.5 py-2 border border-[#90CAF9] bg-[#F0F8FF] hover:bg-[#DCEAF5]/60 text-[#123B5D] text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
                        >
                          <Truck className="w-3.5 h-3.5 text-[#42A5F5]" /> Track Order
                        </button>
                        {ord.paymentStatus !== 'paid' && ord.orderStatus !== 'Cancelled' && (
                          <button
                            type="button"
                            onClick={() =>
                              setPayModal({
                                open: true,
                                entityType: 'store_order',
                                entityId: ord.id,
                                title: `Order ${ord.orderNumber}`,
                                amountInr: ord.totalInr,
                              })
                            }
                            className="px-4 py-2 bg-[#64B5F6] hover:bg-[#42A5F5] text-white text-xs font-semibold rounded-lg whitespace-nowrap shrink-0 transition-colors"
                          >
                            Pay Now
                          </button>
                        )}
                        {ord.paymentStatus === 'paid' && ordInvoice ? (
                          <button
                            type="button"
                            onClick={() => downloadCloudInvoicePdf(ordInvoice)}
                            className="px-3.5 py-2 bg-[#64B5F6] hover:bg-[#42A5F5] text-white text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
                          >
                            <Download className="w-3.5 h-3.5" /> Download Invoice ({ordInvoice.invoiceNumber})
                          </button>
                        ) : (
                          ord.paymentStatus !== 'paid' &&
                          ord.orderStatus !== 'Cancelled' && (
                            <span className="text-[11px] text-[#263746]/70">
                              Tax Invoice unlocks after verified payment
                            </span>
                          )
                        )}
                        {canCancel && (
                          <button
                            type="button"
                            onClick={() => {
                              setCancelOrderModal(ord);
                              setCancelReason('Changed mind / ordering different configuration');
                            }}
                            className="px-3.5 py-2 border border-red-200 text-red-700 hover:bg-red-50 text-xs font-semibold rounded-lg whitespace-nowrap shrink-0"
                          >
                            Cancel Order
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* TRACK ORDERS (8-Stage Stepper + Timeline) */}
          {tab === 'tracking' && (
            <div className="space-y-6">
              {data.storeOrders.length === 0 ? (
                <div className="rounded-xl border border-[#DCEAF5] bg-white p-8 text-sm text-[#263746]/70">
                  No store orders available to track yet.
                </div>
              ) : (
                data.storeOrders.map((ord: any) => {
                  const stageIdx = resolveStoreOrderStageIndex(ord.orderStatus);
                  const isCancelled = /cancel|refund/i.test(ord.orderStatus);
                  const historyList: Array<{ status: string; timestamp: string; note?: string; actor?: string }> =
                    Array.isArray(ord.statusHistory) && ord.statusHistory.length > 0
                      ? ord.statusHistory
                      : [
                          {
                            status: ord.orderStatus,
                            timestamp: ord.updatedAt || ord.createdAt,
                            note: 'Order recorded in fulfilment pipeline.',
                          },
                        ];

                  return (
                    <div key={`trk-${ord.id}`} className="rounded-xl border border-[#DCEAF5] bg-white p-6 space-y-5">
                      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#DCEAF5]/60 pb-3">
                        <div>
                          <div className="font-mono text-sm font-bold text-[#123B5D]">{ord.orderNumber}</div>
                          <div className="text-xs text-[#263746]/70">
                            Placed {new Date(ord.createdAt).toLocaleDateString('en-IN')} · ₹{Number(ord.totalInr || 0).toLocaleString('en-IN')}
                          </div>
                        </div>
                        <div className="text-right text-xs font-mono">
                          <div className={isCancelled ? 'text-red-700 font-bold' : 'text-[#42A5F5] font-bold'}>
                            Current Stage: {ord.orderStatus}
                          </div>
                          {ord.expectedDeliveryDate && (
                            <div className="text-[#263746]/70">Est. Delivery: {ord.expectedDeliveryDate}</div>
                          )}
                        </div>
                      </div>

                      {isCancelled ? (
                        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-900">
                          <div className="font-bold">Status: {ord.orderStatus}</div>
                          {ord.cancelledReason && <div className="mt-1">Reason: {ord.cancelledReason}</div>}
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
                          {STORE_ORDER_STAGES.map((stageName, idx) => {
                            const reached = idx <= stageIdx;
                            const isCurrent = idx === stageIdx;
                            return (
                              <div
                                key={stageName}
                                className={`p-2.5 rounded-lg border text-[11px] leading-tight ${
                                  isCurrent
                                    ? 'border-[#64B5F6] bg-[#F0F8FF] text-[#123B5D] font-semibold'
                                    : reached
                                    ? 'border-[#90CAF9] bg-[#F0F8FF]/60 text-[#123B5D]'
                                    : 'border-[#DCEAF5] bg-white text-[#263746]/50'
                                }`}
                              >
                                <div className="font-mono text-[10px] mb-0.5">{idx + 1}.</div>
                                <div>{stageName}</div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {(ord.trackingCourier || ord.trackingId || ord.trackingUrl) && (
                        <div className="rounded-lg bg-[#F0F8FF] border border-[#DCEAF5] p-3.5 text-xs flex flex-wrap items-center justify-between gap-3">
                          <div className="font-mono text-[#263746]">
                            Courier: <strong>{ord.trackingCourier || 'Assigned'}</strong> · AWB / Tracking ID:{' '}
                            <strong>{ord.trackingId || 'Pending'}</strong>
                            {ord.dispatchDate ? ` · Dispatched: ${ord.dispatchDate}` : ''}
                          </div>
                          {ord.trackingUrl && (
                            <a
                              href={ord.trackingUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="px-3 py-1.5 bg-[#64B5F6] hover:bg-[#42A5F5] text-white rounded-lg font-semibold inline-flex items-center gap-1 transition-colors"
                            >
                              Open Courier Link <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                      )}

                      <div className="space-y-2 border-t border-[#DCEAF5]/60 pt-3">
                        <div className="text-xs font-semibold text-[#123B5D]">Status History &amp; Logistics Log</div>
                        <div className="space-y-2 text-xs">
                          {[...historyList].reverse().map((h, i) => (
                            <div key={i} className="flex flex-wrap justify-between gap-2 bg-[#F0F8FF]/60 rounded-lg px-3 py-2 border border-[#DCEAF5]/70">
                              <div>
                                <span className="font-semibold text-[#123B5D]">{h.status}</span>
                                {h.note && <span className="text-[#263746]"> — {h.note}</span>}
                              </div>
                              <span className="font-mono text-[11px] text-[#263746]/70">
                                {h.timestamp ? new Date(h.timestamp).toLocaleString('en-IN') : ''}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* MY CART */}
          {tab === 'cart' && (
            <div className="rounded-xl border border-[#DCEAF5] bg-white p-6 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#DCEAF5]/60 pb-3">
                <h2 className="font-display font-bold text-lg text-[#123B5D] flex items-center gap-2">
                  <ShoppingBag className="w-5 h-5 text-[#42A5F5]" /> My Active Cart ({cart.length})
                </h2>
                {cart.length > 0 && (
                  <button
                    type="button"
                    onClick={() => navigate('/checkout')}
                    className="px-4 py-2 bg-[#64B5F6] hover:bg-[#42A5F5] text-white text-xs font-semibold rounded-lg transition-colors"
                  >
                    Proceed to 6-Step Checkout
                  </button>
                )}
              </div>
              {cart.length === 0 ? (
                <div className="py-8 text-center space-y-3">
                  <p className="text-sm text-[#263746]/70">Your cart is currently empty.</p>
                  <button
                    type="button"
                    onClick={() => navigate('/store')}
                    className="px-4 py-2 bg-[#64B5F6] hover:bg-[#42A5F5] text-white text-xs font-semibold rounded-lg transition-colors"
                  >
                    Shop Storefront
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="divide-y divide-[#DCEAF5]/60">
                    {cart.map((item) => {
                      const unit = item.product.discountPriceInr ?? item.product.priceInr;
                      return (
                        <div key={`${item.product.id}-${item.variant}-${item.color}`} className="py-3 flex items-center gap-4">
                          <img
                            src={item.product.imageUrl}
                            alt={item.product.name}
                            referrerPolicy="no-referrer"
                            className="w-16 h-14 rounded-lg object-cover bg-[#F0F8FF] shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-sm text-[#123B5D] truncate">{item.product.name}</div>
                            <div className="text-xs text-[#263746]/70 font-mono">
                              ₹{unit.toLocaleString('en-IN')} × {item.qty}
                            </div>
                          </div>
                          <input
                            type="number"
                            min={1}
                            max={Math.max(1, item.product.stockQty)}
                            value={item.qty}
                            onChange={(e) =>
                              updateCartQty(item.product.id, item.variant, item.color, Number(e.target.value))
                            }
                            className="w-16 rounded-lg border border-[#DCEAF5] bg-white px-2 py-1 text-xs font-mono text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                          />
                          <button
                            type="button"
                            onClick={() => removeFromCart(item.product.id, item.variant, item.color)}
                            className="p-1.5 text-[#263746]/50 hover:text-red-600"
                            aria-label="Remove item"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  {cartSummary && cartSummary.itemCount > 0 && (
                    <div className="rounded-lg border border-[#DCEAF5] bg-[#F0F8FF]/60 p-4 font-mono text-xs space-y-1.5">
                      <div className="flex justify-between text-[#263746]/80">
                        <span>Subtotal ({cartSummary.itemCount} items)</span>
                        <span>₹{cartSummary.subtotalInr.toLocaleString('en-IN')}</span>
                      </div>
                      <div className="flex justify-between text-[#263746]/80">
                        <span>Estimated GST</span>
                        <span>₹{cartSummary.gstInr.toLocaleString('en-IN')}</span>
                      </div>
                      <div className="flex justify-between text-[#263746]/80">
                        <span>Shipping</span>
                        <span>{cartSummary.shippingInr === 0 ? 'FREE' : `₹${cartSummary.shippingInr}`}</span>
                      </div>
                      <div className="flex justify-between border-t border-[#DCEAF5] pt-1.5 font-bold text-sm text-[#123B5D]">
                        <span>Total</span>
                        <span>₹{cartSummary.grandTotalInr.toLocaleString('en-IN')}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* MY REVIEWS */}
          {tab === 'reviews' && (
            <div className="space-y-6">
              {(() => {
                const reviewedIds = new Set((data.myReviews || []).map((r: any) => Number(r.productId)));
                const eligibleMap = new Map<number, { productId: number; name: string; sku: string; imageUrl?: string }>();
                for (const ord of data.storeOrders || []) {
                  if (ord.paymentStatus === 'paid') {
                    for (const it of ord.items || []) {
                      if (it.productId && !reviewedIds.has(Number(it.productId)) && !eligibleMap.has(Number(it.productId))) {
                        eligibleMap.set(Number(it.productId), {
                          productId: Number(it.productId),
                          name: it.name,
                          sku: it.sku,
                          imageUrl: it.imageUrl,
                        });
                      }
                    }
                  }
                }
                const eligibleItems = Array.from(eligibleMap.values());
                return (
                  <>
                    {eligibleItems.length > 0 && (
                      <div className="rounded-xl border border-[#DCEAF5] bg-white p-6 space-y-4">
                        <h2 className="font-display font-bold text-lg text-[#123B5D]">
                          Write a Verified Purchase Review
                        </h2>
                        <div className="space-y-4">
                          {eligibleItems.map((el) => {
                            const draft = reviewDrafts[el.productId] || { rating: 5, comment: '' };
                            return (
                              <div key={el.productId} className="rounded-lg border border-[#DCEAF5] bg-[#F0F8FF]/60 p-4 space-y-3">
                                <div className="flex items-center gap-3">
                                  <img
                                    src={el.imageUrl || '/assets/aistudio/image_1a5ac752.png'}
                                    alt={el.name}
                                    referrerPolicy="no-referrer"
                                    className="w-12 h-10 rounded object-cover bg-white shrink-0"
                                  />
                                  <div>
                                    <div className="font-semibold text-sm text-[#123B5D]">{el.name}</div>
                                    <div className="font-mono text-[11px] text-[#263746]/70">{el.sku}</div>
                                  </div>
                                </div>
                                <div className="flex flex-col sm:flex-row gap-2">
                                  <select
                                    value={draft.rating}
                                    onChange={(e) =>
                                      setReviewDrafts((prev) => ({
                                        ...prev,
                                        [el.productId]: { ...draft, rating: Number(e.target.value) },
                                      }))
                                    }
                                    className="rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 text-xs text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                                  >
                                    {[5, 4, 3, 2, 1].map((n) => (
                                      <option key={n} value={n}>{n} Stars</option>
                                    ))}
                                  </select>
                                  <input
                                    placeholder="Share your operational experience..."
                                    value={draft.comment}
                                    onChange={(e) =>
                                      setReviewDrafts((prev) => ({
                                        ...prev,
                                        [el.productId]: { ...draft, comment: e.target.value },
                                      }))
                                    }
                                    className="flex-1 rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 text-xs text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                                  />
                                  <button
                                    type="button"
                                    disabled={draft.busy}
                                    onClick={() => handleSubmitProductReview(el.productId)}
                                    className="px-4 py-2 bg-[#64B5F6] hover:bg-[#42A5F5] text-white text-xs font-semibold rounded-lg disabled:opacity-50 whitespace-nowrap shrink-0 transition-colors"
                                  >
                                    {draft.busy ? 'Submitting...' : 'Submit Review'}
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <div className="rounded-xl border border-[#DCEAF5] bg-white p-6 space-y-4">
                      <h2 className="font-display font-bold text-lg text-[#123B5D] flex items-center gap-2">
                        <Star className="w-5 h-5 text-amber-500" /> My Published Reviews ({(data.myReviews || []).length})
                      </h2>
                      {(data.myReviews || []).length === 0 ? (
                        <p className="text-sm text-[#263746]/70">
                          You have not submitted any product reviews yet. Paid orders become eligible for verified reviews here.
                        </p>
                      ) : (
                        <div className="divide-y divide-[#DCEAF5]/60 text-sm">
                          {data.myReviews.map((r: any) => (
                            <div key={r.id} className="py-3 space-y-1">
                              <div className="flex items-center justify-between text-xs">
                                <span className="font-semibold text-amber-700">{r.rating}/5 Stars · Verified Purchase</span>
                                <span className="font-mono text-[#263746]/60">{new Date(r.createdAt).toLocaleDateString('en-IN')}</span>
                              </div>
                              <p className="text-[#263746] text-sm">{r.comment}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                );
              })()}
            </div>
          )}

          {/* MY SERVICES (UNIFIED CLOUD SERVICE RECORDS) */}
          {tab === 'services' && (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-display font-bold text-xl text-[#123B5D] flex items-center gap-2">
                    <Wrench className="w-5 h-5 text-[#42A5F5]" /> My Service Records ({(data.serviceRecords || []).length})
                  </h2>
                  <p className="text-xs text-[#263746]/70">
                    Permanent cloud record of every engineering project, 3D print, PCB job, drone repair, and custom service request.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => loadDashboard(true)}
                    className="px-3 py-2 border border-[#DCEAF5] bg-white hover:bg-[#F0F8FF] text-[#123B5D] text-xs font-semibold rounded-lg inline-flex items-center gap-1.5"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Refresh
                  </button>
                  <button
                    type="button"
                    onClick={() => setServiceRequestOpen((v) => !v)}
                    className="px-4 py-2 bg-[#64B5F6] hover:bg-[#42A5F5] text-white text-xs font-semibold rounded-lg inline-flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" /> {serviceRequestOpen ? 'Close Form' : 'New Service Request'}
                  </button>
                </div>
              </div>

              {serviceRequestOpen && (
                <form
                  onSubmit={handleCreateServiceRequest}
                  className="rounded-xl border border-[#90CAF9] bg-[#F0F8FF]/50 p-6 space-y-4 text-xs"
                >
                  <h3 className="font-display font-bold text-base text-[#123B5D]">Request an Engineering or Lab Service</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    <div>
                      <label className="block font-semibold text-[#123B5D] mb-1">Service Catalog</label>
                      <select
                        value={serviceForm.serviceCode}
                        onChange={(e) => {
                          const code = e.target.value;
                          const matched = (data.serviceCatalog || []).find((c: any) => c.serviceCode === code);
                          setServiceForm((prev) => ({
                            ...prev,
                            serviceCode: code,
                            serviceName: matched ? matched.name : prev.serviceName,
                            category: matched ? matched.category : prev.category,
                          }));
                        }}
                        className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 text-[#263746]"
                      >
                        <option value="">Custom Engineering / Other</option>
                        {(data.serviceCatalog || []).map((svc: any) => (
                          <option key={svc.serviceCode} value={svc.serviceCode}>
                            {svc.name} ({svc.category})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block font-semibold text-[#123B5D] mb-1">Service Title *</label>
                      <input
                        required
                        value={serviceForm.serviceName}
                        onChange={(e) => setServiceForm({ ...serviceForm, serviceName: e.target.value })}
                        placeholder="e.g. Carbon-Fiber Enclosure Prototype"
                        className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 text-[#263746]"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-[#123B5D] mb-1">Category</label>
                      <select
                        value={serviceForm.category}
                        onChange={(e) => setServiceForm({ ...serviceForm, category: e.target.value })}
                        className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 text-[#263746]"
                      >
                        {['Custom Engineering', '3D Printing', 'PCB Fabrication', 'Drone Repair', 'Agri Drone Spraying', 'B2B Hardware'].map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block font-semibold text-[#123B5D] mb-1">Quantity</label>
                      <input
                        type="number"
                        min={1}
                        value={serviceForm.quantity}
                        onChange={(e) => setServiceForm({ ...serviceForm, quantity: Math.max(1, Number(e.target.value || 1)) })}
                        className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 text-[#263746] font-mono"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block font-semibold text-[#123B5D] mb-1">Technical Specifications</label>
                      <input
                        value={serviceForm.specifications}
                        onChange={(e) => setServiceForm({ ...serviceForm, specifications: e.target.value })}
                        placeholder="Material, tolerances, dimensions, target timeline..."
                        className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 text-[#263746]"
                      />
                    </div>
                  </div>
                  <textarea
                    rows={3}
                    value={serviceForm.description}
                    onChange={(e) => setServiceForm({ ...serviceForm, description: e.target.value })}
                    placeholder="Describe requirements or deliverables..."
                    className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 text-[#263746]"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setServiceRequestOpen(false)}
                      className="px-4 py-2 rounded-lg border border-[#DCEAF5] bg-white text-[#263746]"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={creatingService}
                      className="px-5 py-2 rounded-lg bg-[#64B5F6] hover:bg-[#42A5F5] text-white font-semibold disabled:opacity-50"
                    >
                      {creatingService ? 'Saving...' : 'Submit Service Request'}
                    </button>
                  </div>
                </form>
              )}

              <div className="flex flex-wrap gap-2">
                {(['all', 'active', 'archived'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setServiceStatusFilter(mode)}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-medium capitalize transition-colors ${
                      serviceStatusFilter === mode
                        ? 'bg-[#64B5F6] text-white border-[#64B5F6]'
                        : 'bg-white text-[#263746] border-[#DCEAF5] hover:bg-[#F0F8FF]'
                    }`}
                  >
                    {mode === 'all' ? 'All Records' : mode === 'active' ? 'Active' : 'Archived / Closed History'}
                  </button>
                ))}
              </div>

              {(() => {
                const allServices: any[] = Array.isArray(data.serviceRecords) ? data.serviceRecords : [];
                const visibleServices = allServices.filter((s) => {
                  if (serviceStatusFilter === 'active') return !s.isDeleted;
                  if (serviceStatusFilter === 'archived') return Boolean(s.isDeleted);
                  return true;
                });
                if (visibleServices.length === 0) {
                  return (
                    <div className="rounded-xl border border-[#DCEAF5] bg-white p-8 text-sm text-[#263746]/70">
                      No service records found for this filter yet.
                    </div>
                  );
                }
                return (
                  <div className="space-y-3">
                    {visibleServices.map((srv) => (
                      <div
                        key={srv.id}
                        className={`rounded-xl border p-5 space-y-2.5 text-xs shadow-sm ${
                          srv.isDeleted ? 'border-amber-200 bg-amber-50/30' : 'border-[#DCEAF5] bg-white'
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#DCEAF5]/60 pb-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono font-bold text-[#123B5D]">{srv.serviceRecordNumber}</span>
                            <span className="px-2 py-0.5 rounded bg-[#F0F8FF] border border-[#DCEAF5] font-semibold text-[#123B5D]">
                              {srv.category}
                            </span>
                            <span className="px-2 py-0.5 rounded bg-blue-50 border border-blue-200 font-semibold text-blue-700">
                              {srv.status}
                            </span>
                            {srv.isDeleted && (
                              <span className="px-2 py-0.5 rounded bg-amber-100 border border-amber-300 font-semibold text-amber-800 inline-flex items-center gap-1">
                                <Archive className="w-3 h-3" /> Archived
                              </span>
                            )}
                          </div>
                          <div className="font-mono text-[#263746]/70">
                            {srv.createdAt ? new Date(srv.createdAt).toLocaleDateString('en-IN') : ''}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="space-y-1">
                            <div className="font-display font-bold text-sm text-[#123B5D]">
                              {srv.serviceName} × {srv.quantity || 1}
                            </div>
                            {srv.specifications && (
                              <div className="text-[#263746]/80">
                                <span className="font-semibold text-[#123B5D]">Specs:</span> {srv.specifications}
                              </div>
                            )}
                            {srv.description && <p className="text-[#263746]">{srv.description}</p>}
                          </div>
                          <div className="text-right font-mono space-y-0.5 shrink-0">
                            {Number(srv.totalAmountInr || 0) > 0 && (
                              <>
                                <div className="text-[11px] text-[#263746]/70">
                                  Unit ₹{Number(srv.unitPriceInr || 0).toLocaleString('en-IN')} · GST ₹{Number(srv.taxInr || 0).toLocaleString('en-IN')}
                                </div>
                                <div className="font-bold text-sm text-[#123B5D]">
                                  ₹{Number(srv.totalAmountInr || 0).toLocaleString('en-IN')}
                                </div>
                              </>
                            )}
                            {srv.assignedTeam && (
                              <div className="text-[11px] text-[#1E88E5] font-sans font-semibold">
                                Assigned: {srv.assignedTeam}
                              </div>
                            )}
                          </div>
                        </div>

                        {srv.adminRemarks && (
                          <div className="rounded-lg border border-[#DCEAF5] bg-[#F0F8FF]/70 p-2.5 text-[#123B5D]">
                            <span className="font-semibold">Admin Remarks:</span> {srv.adminRemarks}
                          </div>
                        )}
                        {srv.isDeleted && srv.archivedReason && (
                          <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-amber-900">
                            <span className="font-semibold">Archive Reason:</span> {srv.archivedReason}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          )}

          {/* UNIFIED ENQUIRIES (HARDWARE / DRONES, ENGINEERING PROJECTS, PCB, B2B, SUPPORT) */}
          {tab === 'enquiries' && (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-display font-bold text-xl text-[#123B5D]">
                    My Enquiries ({totalEnquiriesCount + (data.supportTickets || []).length})
                  </h2>
                  <p className="text-xs text-[#263746]/70">
                    All hardware, engineering project, PCB fabrication, B2B bulk, and support enquiries linked to your Customer ID.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => navigate('/krashivantri/enquiry')}
                    className="px-3.5 py-2 bg-[#64B5F6] hover:bg-[#42A5F5] text-white text-xs font-semibold rounded-lg whitespace-nowrap shrink-0 transition-colors"
                  >
                    New Drone Enquiry
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate('/register-project')}
                    className="px-3.5 py-2 border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] text-xs font-semibold rounded-lg whitespace-nowrap shrink-0 transition-colors"
                  >
                    New Project Enquiry
                  </button>
                </div>
              </div>

              {(() => {
                const mapProduct = (enq: any, archived = false) => ({
                  uidKey: `${archived ? 'arch-' : ''}prod-${enq.id}`,
                  category: 'product' as const,
                  categoryLabel: 'Hardware / Drone',
                  refNumber: enq.referenceNumber || enq.enquiryNumber || `PROD-${enq.id}`,
                  title: `${enq.interestedProduct || 'Hardware Enquiry'}${enq.quantity ? ` · Qty ${enq.quantity}` : ''}`,
                  subtitle: [enq.intendedApplication, enq.organizationOrFarmName || enq.fullName, enq.district, enq.state]
                    .filter(Boolean)
                    .join(' · '),
                  description: enq.message || '',
                  status: enq.status || 'Submitted',
                  rejectionReason: enq.rejectionReason || '',
                  archivedReason: enq.archivedReason || '',
                  adminNotes: enq.internalNotes || enq.adminNotes || '',
                  quotedAmountInr: null as number | null,
                  isArchived: archived || Boolean(enq.isDeleted),
                  createdAt: enq.createdAt,
                  targetTab: null as TabKey | null,
                });
                const mapProject = (enq: any, archived = false) => ({
                  uidKey: `${archived ? 'arch-' : ''}proj-${enq.id}`,
                  category: 'project' as const,
                  categoryLabel: 'Engineering Project',
                  refNumber: enq.enquiryNumber || `PRJ-${enq.id}`,
                  title: enq.projectTitle || 'Custom Engineering Project',
                  subtitle: [enq.domainCategory || enq.category, enq.timelineExpectation].filter(Boolean).join(' · '),
                  description: enq.problemStatement || enq.description || '',
                  status: enq.status || 'Submitted',
                  rejectionReason: enq.rejectionReason || '',
                  archivedReason: enq.archivedReason || '',
                  adminNotes: enq.adminNotes || enq.internalNotes || '',
                  quotedAmountInr: null as number | null,
                  isArchived: archived || Boolean(enq.isDeleted),
                  createdAt: enq.createdAt,
                  targetTab: 'projects' as TabKey,
                });
                const mapPcb = (pcb: any, archived = false) => ({
                  uidKey: `${archived ? 'arch-' : ''}pcb-${pcb.id}`,
                  category: 'pcb' as const,
                  categoryLabel: 'PCB Fabrication',
                  refNumber: pcb.enquiryNumber || `PCB-${pcb.id}`,
                  title: `PCB ${pcb.layerCount || 2}-Layer (${pcb.boardDimensionsMm || 'Custom'}) · Qty ${pcb.boardQuantity || 1}`,
                  subtitle: [pcb.surfaceFinish, pcb.assemblyRequired ? 'With PCBA Assembly' : 'Bare Board'].filter(Boolean).join(' · '),
                  description: pcb.specialInstructions || '',
                  status: pcb.status || 'Submitted',
                  rejectionReason: pcb.rejectionReason || '',
                  archivedReason: pcb.archivedReason || '',
                  adminNotes: pcb.adminNotes || '',
                  quotedAmountInr: pcb.quotedAmountInr ? Number(pcb.quotedAmountInr) : null,
                  isArchived: archived || Boolean(pcb.isDeleted),
                  createdAt: pcb.createdAt,
                  targetTab: 'pcb' as TabKey,
                });
                const mapB2b = (b2b: any, archived = false) => ({
                  uidKey: `${archived ? 'arch-' : ''}b2b-${b2b.id}`,
                  category: 'b2b' as const,
                  categoryLabel: 'B2B Bulk RFQ',
                  refNumber: b2b.enquiryNumber || `B2B-${b2b.id}`,
                  title: `${b2b.requirementCategory || 'Bulk Hardware'} · Qty ${b2b.quantity || 1}`,
                  subtitle: [b2b.companyName, b2b.shippingLocation].filter(Boolean).join(' · '),
                  description: b2b.technicalSpecs || '',
                  status: b2b.status || 'Submitted',
                  rejectionReason: b2b.rejectionReason || '',
                  archivedReason: b2b.archivedReason || '',
                  adminNotes: b2b.adminNotes || '',
                  quotedAmountInr: b2b.quotedAmountInr ? Number(b2b.quotedAmountInr) : null,
                  isArchived: archived || Boolean(b2b.isDeleted),
                  createdAt: b2b.createdAt,
                  targetTab: 'b2b_support' as TabKey,
                });
                const mapSupport = (t: any, archived = false) => ({
                  uidKey: `${archived ? 'arch-' : ''}sup-${t.id}`,
                  category: 'support' as const,
                  categoryLabel: 'Support Ticket',
                  refNumber: t.ticketNumber || `SUP-${t.id}`,
                  title: t.subject || 'Support Enquiry',
                  subtitle: t.serviceCategory || 'General Support',
                  description: Array.isArray(t.messages) && t.messages[0]?.text ? String(t.messages[0].text) : '',
                  status: t.status || 'Open',
                  rejectionReason: t.rejectionReason || '',
                  archivedReason: t.archivedReason || '',
                  adminNotes: t.internalNotes || '',
                  quotedAmountInr: null as number | null,
                  isArchived: archived || Boolean(t.isDeleted),
                  createdAt: t.createdAt,
                  targetTab: 'b2b_support' as TabKey,
                });

                const arch = data.archivedEnquiries || {};
                const archivedCount =
                  (arch.productEnquiries || []).length +
                  (arch.projectEnquiries || []).length +
                  (arch.pcbEnquiries || []).length +
                  (arch.b2bEnquiries || []).length +
                  (arch.supportTickets || []).length;

                const unifiedEnquiries = [
                  ...(data.productEnquiries || []).map((e: any) => mapProduct(e, false)),
                  ...(data.projectEnquiries || []).map((e: any) => mapProject(e, false)),
                  ...(data.pcbEnquiries || []).map((e: any) => mapPcb(e, false)),
                  ...(data.b2bEnquiries || []).map((e: any) => mapB2b(e, false)),
                  ...(data.supportTickets || []).map((e: any) => mapSupport(e, false)),
                  ...(includeArchivedEnquiries
                    ? [
                        ...(arch.productEnquiries || []).map((e: any) => mapProduct(e, true)),
                        ...(arch.projectEnquiries || []).map((e: any) => mapProject(e, true)),
                        ...(arch.pcbEnquiries || []).map((e: any) => mapPcb(e, true)),
                        ...(arch.b2bEnquiries || []).map((e: any) => mapB2b(e, true)),
                        ...(arch.supportTickets || []).map((e: any) => mapSupport(e, true)),
                      ]
                    : []),
                ].sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

                const filtered =
                  enquiryCategoryFilter === 'all'
                    ? unifiedEnquiries
                    : unifiedEnquiries.filter((e) => e.category === enquiryCategoryFilter);

                const filterTabs: Array<{ key: typeof enquiryCategoryFilter; label: string; count: number }> = [
                  { key: 'all', label: 'All Enquiries', count: unifiedEnquiries.length },
                  { key: 'product', label: 'Hardware & Drone', count: (data.productEnquiries || []).length + (includeArchivedEnquiries ? (arch.productEnquiries || []).length : 0) },
                  { key: 'project', label: 'Engineering Projects', count: (data.projectEnquiries || []).length + (includeArchivedEnquiries ? (arch.projectEnquiries || []).length : 0) },
                  { key: 'pcb', label: 'PCB Services', count: (data.pcbEnquiries || []).length + (includeArchivedEnquiries ? (arch.pcbEnquiries || []).length : 0) },
                  { key: 'b2b', label: 'B2B Bulk RFQ', count: (data.b2bEnquiries || []).length + (includeArchivedEnquiries ? (arch.b2bEnquiries || []).length : 0) },
                  { key: 'support', label: 'Support Tickets', count: (data.supportTickets || []).length + (includeArchivedEnquiries ? (arch.supportTickets || []).length : 0) },
                ];

                return (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap gap-2">
                        {filterTabs.map((ft) => (
                          <button
                            key={ft.key}
                            type="button"
                            onClick={() => setEnquiryCategoryFilter(ft.key)}
                            className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                              enquiryCategoryFilter === ft.key
                                ? 'bg-[#64B5F6] text-white border-[#64B5F6]'
                                : 'bg-white text-[#263746] border-[#DCEAF5] hover:border-[#90CAF9] hover:bg-[#F0F8FF]'
                            }`}
                          >
                            {ft.label} ({ft.count})
                          </button>
                        ))}
                      </div>
                      <label className="inline-flex items-center gap-2 text-xs text-[#123B5D] font-medium cursor-pointer">
                        <input
                          type="checkbox"
                          checked={includeArchivedEnquiries}
                          onChange={(e) => setIncludeArchivedEnquiries(e.target.checked)}
                          className="rounded border-[#90CAF9]"
                        />
                        Include Archived / Rejected History ({archivedCount})
                      </label>
                    </div>

                    {filtered.length === 0 ? (
                      <div className="rounded-xl border border-[#DCEAF5] bg-white p-8 text-sm text-[#263746]/70">
                        No enquiries found in this category yet.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {filtered.map((enq) => (
                          <div
                            key={enq.uidKey}
                            className={`rounded-xl border p-5 space-y-2 text-xs shadow-sm ${
                              enq.isArchived
                                ? 'border-amber-200 bg-amber-50/30'
                                : enq.status === 'Rejected'
                                ? 'border-red-200 bg-red-50/20'
                                : 'border-[#DCEAF5] bg-white'
                            }`}
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#DCEAF5]/60 pb-2">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-mono font-bold text-[#123B5D]">{enq.refNumber}</span>
                                <span className="px-2 py-0.5 rounded bg-[#F0F8FF] border border-[#DCEAF5] font-semibold text-[#123B5D]">
                                  {enq.categoryLabel}
                                </span>
                                {enq.isArchived && (
                                  <span className="px-2 py-0.5 rounded bg-amber-100 border border-amber-300 font-semibold text-amber-800 inline-flex items-center gap-1">
                                    <Archive className="w-3 h-3" /> Archived History
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-3">
                                {enq.quotedAmountInr && enq.quotedAmountInr > 0 && (
                                  <span className="font-mono font-bold text-[#123B5D]">
                                    Quoted ₹{enq.quotedAmountInr.toLocaleString('en-IN')}
                                  </span>
                                )}
                                <span className="font-mono text-[#263746]/60">
                                  {enq.createdAt ? new Date(enq.createdAt).toLocaleDateString('en-IN') : ''}
                                </span>
                                <span
                                  className={`font-semibold ${
                                    enq.status === 'Rejected' ? 'text-red-700' : 'text-[#1E88E5]'
                                  }`}
                                >
                                  {enq.status}
                                </span>
                              </div>
                            </div>
                            <div className="font-display font-bold text-sm text-[#123B5D]">{enq.title}</div>
                            {enq.subtitle && <div className="text-[#263746]/80">{enq.subtitle}</div>}
                            {enq.description && <p className="text-[#263746] pt-1 line-clamp-3">{enq.description}</p>}
                            {enq.rejectionReason && (
                              <div className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-red-800">
                                <span className="font-semibold">Rejection Reason:</span> {enq.rejectionReason}
                              </div>
                            )}
                            {enq.archivedReason && (
                              <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-amber-900">
                                <span className="font-semibold">Archived Reason:</span> {enq.archivedReason}
                              </div>
                            )}
                            {enq.adminNotes && (
                              <div className="rounded-lg border border-[#DCEAF5] bg-[#F0F8FF]/70 p-2.5 text-[#123B5D]">
                                <span className="font-semibold">Admin Notes:</span> {enq.adminNotes}
                              </div>
                            )}
                            {enq.targetTab && !enq.isArchived && (
                              <div className="pt-1">
                                <button
                                  type="button"
                                  onClick={() => setTab(enq.targetTab!)}
                                  className="text-xs font-semibold text-[#1E88E5] hover:underline inline-flex items-center gap-1"
                                >
                                  Open Full Workspace &amp; Actions <ExternalLink className="w-3 h-3" />
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          )}

          {/* PCB SERVICES */}
          {tab === 'pcb' && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-display font-bold text-xl text-[#123B5D]">
                    PCB Manufacturing &amp; Gerber Enquiries ({data.pcbEnquiries.length})
                  </h2>
                  <p className="text-xs text-[#263746]/70">
                    Manage board specifications, Gerber/BOM uploads, quotations, and manufacturing progress.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setPcbQuickOpen((v) => !v)}
                    className="px-4 py-2 bg-[#64B5F6] hover:bg-[#42A5F5] text-white text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" /> {pcbQuickOpen ? 'Close PCB Form' : 'New PCB Enquiry'}
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate('/services/pcb-design')}
                    className="px-4 py-2 border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] text-xs font-semibold rounded-lg transition-colors"
                  >
                    Open Full PCB Service Page
                  </button>
                </div>
              </div>

              {pcbQuickOpen && (
                <form
                  onSubmit={handleSubmitInlinePcb}
                  className="rounded-xl border border-[#90CAF9] bg-[#F0F8FF]/50 p-6 space-y-4 text-xs"
                >
                  <h3 className="font-display font-bold text-base text-[#123B5D]">
                    Submit PCB Fabrication / Assembly Enquiry
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div>
                      <label className="block font-semibold text-[#123B5D] mb-1">Board Size (mm) *</label>
                      <input
                        required
                        placeholder="e.g. 100 x 80 mm"
                        value={pcbForm.boardDimensionsMm}
                        onChange={(e) => setPcbForm({ ...pcbForm, boardDimensionsMm: e.target.value })}
                        className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 text-[#263746]"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-[#123B5D] mb-1">Layers</label>
                      <select
                        value={pcbForm.layerCount}
                        onChange={(e) => setPcbForm({ ...pcbForm, layerCount: Number(e.target.value) })}
                        className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 text-[#263746]"
                      >
                        {[1, 2, 4, 6, 8].map((l) => (
                          <option key={l} value={l}>{l} Layer</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block font-semibold text-[#123B5D] mb-1">Board Qty</label>
                      <input
                        type="number"
                        min={1}
                        value={pcbForm.boardQuantity}
                        onChange={(e) => setPcbForm({ ...pcbForm, boardQuantity: Number(e.target.value) })}
                        className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 font-mono text-[#263746]"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-[#123B5D] mb-1">Surface Finish</label>
                      <select
                        value={pcbForm.surfaceFinish}
                        onChange={(e) => setPcbForm({ ...pcbForm, surfaceFinish: e.target.value })}
                        className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 text-[#263746]"
                      >
                        <option value="HASL Lead-Free">HASL Lead-Free</option>
                        <option value="ENIG Gold">ENIG Gold</option>
                        <option value="OSP">OSP</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-4">
                    <label className="inline-flex items-center gap-2 font-semibold text-[#123B5D]">
                      <input
                        type="checkbox"
                        checked={pcbForm.assemblyRequired}
                        onChange={(e) => setPcbForm({ ...pcbForm, assemblyRequired: e.target.checked })}
                      />
                      PCBA SMT / THT Assembly Required
                    </label>
                    <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[#90CAF9] bg-white cursor-pointer font-semibold text-[#123B5D]">
                      <span>
                        {pcbFiles.length > 0 ? `${pcbFiles.length} Gerber / BOM file(s) attached` : 'Attach Gerber / BOM Files'}
                      </span>
                      <input
                        type="file"
                        multiple
                        className="hidden"
                        onChange={(e) => setPcbFiles(Array.from(e.target.files || []))}
                      />
                    </label>
                  </div>
                  <textarea
                    rows={2}
                    placeholder="Board thickness, copper weight (1oz/2oz), soldermask colour, or special instructions..."
                    value={pcbForm.specialInstructions}
                    onChange={(e) => setPcbForm({ ...pcbForm, specialInstructions: e.target.value })}
                    className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 text-[#263746]"
                  />
                  <button
                    type="submit"
                    disabled={submittingPcb}
                    className="px-5 py-2.5 bg-[#42A5F5] hover:bg-[#1E88E5] text-white font-semibold rounded-lg disabled:opacity-50"
                  >
                    {submittingPcb ? 'Submitting PCB Enquiry...' : 'Submit PCB Manufacturing Enquiry'}
                  </button>
                </form>
              )}

              {data.pcbEnquiries.length === 0 ? (
                <div className="rounded-xl border border-[#DCEAF5] bg-white p-8 text-sm text-[#263746]/70">
                  No PCB manufacturing enquiries submitted yet.
                </div>
              ) : (
                <div className="space-y-4">
                  {data.pcbEnquiries.map((pcb: any) => (
                    <div key={pcb.id} className="rounded-xl border border-[#DCEAF5] bg-white p-5 space-y-3 text-xs shadow-sm">
                      <div className="flex flex-wrap justify-between items-center gap-2 border-b border-[#DCEAF5]/60 pb-2.5">
                        <div>
                          <span className="font-mono font-bold text-sm text-[#123B5D]">{pcb.enquiryNumber}</span>
                          <span className="ml-2 text-[#263746]/70">
                            {new Date(pcb.createdAt).toLocaleDateString('en-IN')}
                          </span>
                        </div>
                        <span className="px-2.5 py-1 rounded bg-[#F0F8FF] border border-[#90CAF9] font-semibold text-[#123B5D]">
                          {pcb.status}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[#263746]">
                        <div>
                          <span className="text-[#263746]/65 block">Dimensions</span>
                          <span className="font-mono font-semibold text-[#123B5D]">{pcb.boardDimensionsMm} mm</span>
                        </div>
                        <div>
                          <span className="text-[#263746]/65 block">Layer / Qty</span>
                          <span className="font-mono font-semibold text-[#123B5D]">{pcb.layerCount} Layers · {pcb.boardQuantity} pcs</span>
                        </div>
                        <div>
                          <span className="text-[#263746]/65 block">Surface Finish</span>
                          <span className="font-semibold text-[#123B5D]">{pcb.surfaceFinish}</span>
                        </div>
                        <div>
                          <span className="text-[#263746]/65 block">Assembly</span>
                          <span className="font-semibold text-[#123B5D]">{pcb.assemblyRequired ? 'PCBA Required' : 'Bare Board'}</span>
                        </div>
                      </div>
                      {pcb.specialInstructions && (
                        <p className="text-[#263746]/80">{pcb.specialInstructions}</p>
                      )}
                      {(pcb.attachments || []).length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {pcb.attachments.map((att: any, idx: number) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => downloadProtectedFile(att.storagePath, att.originalName)}
                              className="px-2.5 py-1 border border-[#90CAF9] bg-[#F0F8FF] hover:bg-[#E3F2FD] rounded text-[#123B5D] font-medium inline-flex items-center gap-1"
                            >
                              <Download className="w-3 h-3 text-[#42A5F5]" /> {att.originalName}
                            </button>
                          ))}
                        </div>
                      )}
                      {pcb.quotedAmountInr && (
                        <div className="pt-2 border-t border-[#DCEAF5]/60 flex items-center justify-between">
                          <span className="font-mono font-bold text-sm text-[#123B5D]">
                            Quotation: ₹{pcb.quotedAmountInr.toLocaleString('en-IN')} ({pcb.paymentStatus || 'pending'})
                          </span>
                          {pcb.paymentStatus !== 'paid' && (
                            <button
                              onClick={() =>
                                setPayModal({
                                  open: true,
                                  entityType: 'pcb_enquiry',
                                  entityId: pcb.id,
                                  title: `PCB Order ${pcb.enquiryNumber}`,
                                  amountInr: pcb.quotedAmountInr,
                                })
                              }
                              className="px-4 py-2 bg-[#64B5F6] hover:bg-[#42A5F5] text-white rounded-lg font-semibold transition-colors"
                            >
                              Pay Quote
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* MY INVOICES & FINANCE */}
          {tab === 'invoices' && (
            <div className="space-y-6">
              {(data.projects || []).length > 0 && (
                <div className="rounded-xl border border-[#DCEAF5] bg-white p-6 space-y-3">
                  <h2 className="font-display font-bold text-lg text-[#123B5D]">
                    Project Consolidated Invoices &amp; Payment Statements
                  </h2>
                  <div className="divide-y divide-[#DCEAF5]/60 text-xs">
                    {data.projects.map((p: any) => {
                      const linkedEnq = (data.projectEnquiries || []).find((e: any) => e.id === p.enquiryId);
                      const linkedQuot = (data.quotations || []).find((q: any) => q.id === p.quotationId);
                      const projReceipts = (data.receipts || []).filter(
                        (r: any) =>
                          r.projectId === p.id ||
                          r.payload?.projectCode === p.projectCode ||
                          (p.quotationId && r.entityType === 'project_quotation' && r.entityId === p.quotationId)
                      );
                      const projFinalInvoice = (data.invoices || []).find(
                        (inv: any) => inv.entityType === 'project_final_invoice' && inv.entityId === p.id
                      );
                      return (
                        <div key={p.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <div className="font-mono font-bold text-[#123B5D]">{p.projectCode} — {p.title}</div>
                            <div className="text-[#263746]/70 font-mono">
                              Total ₹{Number(p.totalAmountInr || 0).toLocaleString('en-IN')} · Paid ₹
                              {Number(p.paidAmountInr || 0).toLocaleString('en-IN')} · Balance ₹
                              {Number(p.balanceAmountInr || 0).toLocaleString('en-IN')}
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {projFinalInvoice && (
                              <button
                                type="button"
                                onClick={() => downloadCloudInvoicePdf(projFinalInvoice)}
                                className="px-3 py-1.5 bg-[#42A5F5] hover:bg-[#1E88E5] text-white rounded-lg font-semibold inline-flex items-center gap-1 transition-colors"
                              >
                                <Download className="w-3.5 h-3.5" /> Final Invoice ({projFinalInvoice.invoiceNumber})
                              </button>
                            )}
                            {projReceipts.map((rcp: any) => (
                              <button
                                key={rcp.id}
                                type="button"
                                onClick={() => downloadCloudReceiptPdf(rcp)}
                                className="px-3 py-1.5 border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 rounded-lg font-semibold inline-flex items-center gap-1 transition-colors"
                              >
                                <Download className="w-3.5 h-3.5 text-emerald-700" /> {rcp.receiptNumber}
                              </button>
                            ))}
                            <button
                              type="button"
                              onClick={() =>
                                downloadCompleteProjectInvoicePdf({
                                  projectCode: p.projectCode,
                                  enquiryNumber: linkedEnq?.enquiryNumber || p.projectCode,
                                  projectTitle: p.title,
                                  customerName: linkedEnq?.customerName || dbUser?.fullName || dbUser?.email || '',
                                  customerEmail: dbUser?.email || '',
                                  customerPhone: linkedEnq?.customerPhone || dbUser?.mobile,
                                  totalAmountInr: Number(p.totalAmountInr || linkedQuot?.totalAmountInr || 0),
                                  gstInr: Number(linkedQuot?.gstInr || 0),
                                  paidAmountInr: Number(p.paidAmountInr || 0),
                                  balanceAmountInr: Number(p.balanceAmountInr || 0),
                                  costCategories: linkedQuot?.costCategories,
                                  receipts: projReceipts,
                                  gstin:
                                    settings.projectSettings?.enableGstTax && settings.companyInfo?.gstin
                                      ? settings.companyInfo.gstin
                                      : undefined,
                                })
                              }
                              className="px-3 py-1.5 border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] rounded-lg font-semibold inline-flex items-center gap-1 transition-colors"
                            >
                              <Download className="w-3.5 h-3.5" /> Complete Project Invoice
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                downloadPaymentHistoryStatementPdf({
                                  projectCode: p.projectCode,
                                  enquiryNumber: linkedEnq?.enquiryNumber || p.projectCode,
                                  projectTitle: p.title,
                                  customerName: linkedEnq?.customerName || dbUser?.fullName || dbUser?.email || '',
                                  customerEmail: dbUser?.email || '',
                                  totalAmountInr: Number(p.totalAmountInr || 0),
                                  paidAmountInr: Number(p.paidAmountInr || 0),
                                  balanceAmountInr: Number(p.balanceAmountInr || 0),
                                  receipts: projReceipts,
                                  gstin:
                                    settings.projectSettings?.enableGstTax && settings.companyInfo?.gstin
                                      ? settings.companyInfo.gstin
                                      : undefined,
                                })
                              }
                              className="px-3 py-1.5 border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] rounded-lg font-semibold inline-flex items-center gap-1 transition-colors"
                            >
                              <Download className="w-3.5 h-3.5" /> Payment History Statement
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="rounded-xl border border-[#DCEAF5] bg-white p-6 space-y-4">
                <h2 className="font-display font-bold text-lg text-[#123B5D]">Payment History</h2>
                {data.payments.length === 0 ? (
                  <p className="text-sm text-[#263746]/70">No payments recorded yet.</p>
                ) : (
                  <div className="divide-y divide-[#DCEAF5]/60 text-xs">
                    {data.payments.map((p: any) => (
                      <div key={p.id} className="py-3 flex justify-between gap-2">
                        <div>
                          <div className="font-mono font-semibold text-[#123B5D]">{p.paymentRef}</div>
                          <div className="text-[#263746]/70">{p.entityType} · {p.mode === 'test_mode' ? 'Sandbox Test Mode' : 'Razorpay'}</div>
                          {p.failureReason && (
                            <div className="text-red-700 mt-0.5">Reason: {p.failureReason}</div>
                          )}
                        </div>
                        <div className="text-right font-mono">
                          <div className="font-bold text-[#123B5D]">₹{p.amountInr.toLocaleString('en-IN')}</div>
                          <div className={`inline-flex items-center gap-1 ${p.status === 'failed' ? 'text-red-700' : p.status === 'refunded' ? 'text-amber-700' : 'text-[#42A5F5]'}`}>
                            <CheckCircle2 className="w-3 h-3" /> {p.status}
                            {p.refundStatus && p.refundStatus !== 'none' ? ` (${p.refundStatus})` : ''}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-[#DCEAF5] bg-white p-6 space-y-4">
                <h2 className="font-display font-bold text-lg text-[#123B5D]">Invoices &amp; Official Receipts</h2>
                {(data.receipts || []).length > 0 && (
                  <div className="space-y-2 pb-3 border-b border-[#DCEAF5]/60">
                    <div className="text-xs font-semibold text-[#123B5D]">Verified Payment Receipts</div>
                    <div className="divide-y divide-[#DCEAF5]/60 text-xs">
                      {data.receipts.map((rcp: any) => (
                        <div key={rcp.id} className="py-2 flex items-center justify-between gap-2">
                          <div>
                            <span className="font-mono font-semibold text-[#123B5D]">{rcp.receiptNumber}</span> ·{' '}
                            <span className="text-[#263746]/70">
                              {rcp.paymentStage} · ₹{Number(rcp.amountInr).toLocaleString('en-IN')}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => downloadCloudReceiptPdf(rcp)}
                            className="px-3 py-1 border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] rounded-lg font-semibold inline-flex items-center gap-1 transition-colors"
                          >
                            <Download className="w-3 h-3" /> Receipt PDF
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {(() => {
                  const paidOrderIds = new Set(
                    (data.storeOrders || [])
                      .filter((o: any) => o.paymentStatus === 'paid')
                      .map((o: any) => o.id)
                  );
                  const visibleInvoices = (data.invoices || []).filter(
                    (inv: any) => inv.entityType !== 'store_order' || paidOrderIds.has(inv.entityId)
                  );
                  return visibleInvoices.length === 0 ? (
                    <p className="text-sm text-[#263746]/70">
                      No paid Tax Invoices issued yet. Store Tax Invoices unlock automatically after payment confirmation.
                    </p>
                  ) : (
                    <div className="divide-y divide-[#DCEAF5]/60 text-xs">
                      {visibleInvoices.map((inv: any) => (
                        <div key={inv.id} className="py-3 flex items-center justify-between gap-2">
                          <div>
                            <div className="font-mono font-semibold text-[#123B5D]">{inv.invoiceNumber}</div>
                            <div className="text-[#263746]/70">
                              {inv.docType} · ₹{Number(inv.amountInr || 0).toLocaleString('en-IN')} · {new Date(inv.issuedAt).toLocaleDateString('en-IN')}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => downloadCloudInvoicePdf(inv)}
                            className="px-3 py-1.5 bg-[#64B5F6] hover:bg-[#42A5F5] text-white rounded-lg font-semibold inline-flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors"
                          >
                            <Download className="w-3.5 h-3.5" /> Invoice PDF
                          </button>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>

              {(data.paymentLinks || []).length > 0 && (
                <div className="rounded-xl border border-[#DCEAF5] bg-white p-6 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h2 className="font-display font-bold text-lg text-[#123B5D]">
                        Official Razorpay Payment Links ({data.paymentLinks.length})
                      </h2>
                      <p className="text-xs text-[#263746]/70">
                        Payments made via Razorpay links are confirmed automatically via server webhook verification.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={loadDashboard}
                      className="px-3 py-1.5 border border-[#90CAF9] bg-[#F0F8FF] text-[#123B5D] text-xs font-semibold rounded-lg"
                    >
                      Refresh Payment Status
                    </button>
                  </div>
                  <div className="divide-y divide-[#DCEAF5]/60 text-xs">
                    {data.paymentLinks.map((pl: any) => (
                      <div key={pl.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="font-mono font-bold text-[#123B5D]">
                            {pl.referenceId || pl.paymentLinkId} · ₹{Number(pl.amountInr || 0).toLocaleString('en-IN')}
                          </div>
                          <div className="text-[#263746]/70">
                            {pl.description} · Status: <span className="font-semibold uppercase">{pl.status}</span>
                            {pl.razorpayPaymentId ? ` · Txn ${pl.razorpayPaymentId}` : ''}
                            {pl.paymentDate ? ` · Paid ${new Date(pl.paymentDate).toLocaleDateString('en-IN')}` : ''}
                          </div>
                        </div>
                        {pl.status !== 'paid' && pl.status !== 'cancelled' && pl.shortUrl && (
                          <a
                            href={pl.shortUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3 py-1.5 bg-[#64B5F6] hover:bg-[#42A5F5] text-white rounded-lg font-semibold inline-flex items-center gap-1"
                          >
                            <ExternalLink className="w-3.5 h-3.5" /> Pay via Razorpay Link
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {(data.recordHistory || []).length > 0 && (
                <div className="rounded-xl border border-[#DCEAF5] bg-white p-6 space-y-3">
                  <h2 className="font-display font-bold text-lg text-[#123B5D]">
                    Record Status &amp; Review History ({data.recordHistory.length})
                  </h2>
                  <div className="divide-y divide-[#DCEAF5]/60 text-xs max-h-64 overflow-y-auto">
                    {data.recordHistory.map((rh: any) => (
                      <div key={rh.id} className="py-2.5 flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <span className="font-mono font-semibold text-[#123B5D]">
                            {rh.entityCode || `${rh.entityType} #${rh.entityId}`}
                          </span>{' '}
                          · {rh.previousStatus} → <strong>{rh.newStatus}</strong>
                          {rh.reason ? <span className="text-[#263746]/80"> — {rh.reason}</span> : null}
                        </div>
                        <span className="font-mono text-[11px] text-[#263746]/60">
                          {new Date(rh.actionDate).toLocaleString('en-IN')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* MY WISHLIST */}
          {tab === 'wishlist' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-display font-bold text-xl text-[#123B5D]">
                  My Wishlist ({data.wishlist.length})
                </h2>
                <button
                  type="button"
                  onClick={() => navigate('/store')}
                  className="px-4 py-2 border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] text-xs font-semibold rounded-lg transition-colors"
                >
                  Browse Store
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {data.wishlist.length === 0 ? (
                  <div className="col-span-full rounded-xl border border-[#DCEAF5] bg-white p-8 text-sm text-[#263746]/70 flex items-center gap-2">
                    <Heart className="w-4 h-4 text-[#42A5F5]" /> Your wishlist is empty. Save your favourite hardware products while browsing the Store.
                  </div>
                ) : (
                  data.wishlist.map((prod: any) => (
                    <div
                      key={prod.id}
                      className="rounded-xl border border-[#DCEAF5] bg-white overflow-hidden flex flex-col shadow-sm"
                    >
                      <button
                        type="button"
                        onClick={() => navigate(`/product/${prod.slug}`)}
                        className="text-left block w-full"
                      >
                        <img
                          src={prod.imageUrl}
                          alt={prod.name}
                          referrerPolicy="no-referrer"
                          className="w-full aspect-[4/3] object-cover bg-[#F0F8FF]"
                        />
                      </button>
                      <div className="p-4 flex-1 flex flex-col justify-between gap-3">
                        <div className="space-y-1">
                          <div className="text-[11px] font-mono text-[#263746]/60">{prod.category}</div>
                          <button
                            type="button"
                            onClick={() => navigate(`/product/${prod.slug}`)}
                            className="text-left font-display font-semibold text-sm text-[#123B5D] hover:text-[#1E88E5]"
                          >
                            {prod.name}
                          </button>
                          <div className="font-mono text-sm font-bold text-[#1E88E5]">
                            ₹{Number(prod.discountPriceInr ?? prod.priceInr ?? 0).toLocaleString('en-IN')}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2 pt-2 border-t border-[#DCEAF5]/60">
                          {prod.productType !== 'quote_only' && prod.stockQty > 0 && (
                            <button
                              type="button"
                              onClick={() => addToCart(prod, 1)}
                              className="flex-1 px-3 py-2 bg-[#42A5F5] hover:bg-[#1E88E5] text-white text-xs font-semibold rounded-lg transition-colors"
                            >
                              Add to Cart
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => navigate(`/product/${prod.slug}`)}
                            className="px-3 py-2 border border-[#DCEAF5] bg-white hover:bg-[#F0F8FF] text-[#123B5D] text-xs font-semibold rounded-lg transition-colors"
                          >
                            View
                          </button>
                          <button
                            type="button"
                            onClick={() => removeFromWishlist(prod.id)}
                            className="p-2 border border-[#DCEAF5] text-[#263746]/60 hover:text-red-600 hover:border-red-200 rounded-lg transition-colors"
                            aria-label="Remove from wishlist"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* B2B SUPPORT & TECHNICAL TICKETS */}
          {tab === 'b2b_support' && (
            <div className="space-y-8">
              <div className="rounded-xl border border-[#DCEAF5] bg-[#F0F8FF] p-5 flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="font-display font-bold text-sm text-[#123B5D]">
                    B2B RFQs, Bulk Orders &amp; Dedicated Customer Care
                  </div>
                  <p className="text-xs text-[#263746]/80">
                    Manage wholesale B2B requests, dealer enquiries, quotations, and technical support tickets.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => navigate('/b2b')}
                    className="px-4 py-2 bg-[#64B5F6] hover:bg-[#42A5F5] text-white text-xs font-semibold rounded-lg transition-colors"
                  >
                    Submit New B2B / Dealer RFQ
                  </button>
                  <a
                    href={`mailto:${settings.companyInfo?.customerCareEmail || 'info@nexustekfusion.in'}?subject=${encodeURIComponent('Customer Care Ticket Enquiry')}`}
                    className="px-4 py-2 border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] text-xs font-semibold rounded-lg inline-flex items-center gap-2 font-mono transition-colors"
                  >
                    <Mail className="w-3.5 h-3.5 text-[#42A5F5]" />
                    {settings.companyInfo?.customerCareEmail || 'info@nexustekfusion.in'}
                  </a>
                </div>
              </div>

              {/* B2B Bulk & Dealer Enquiries */}
              <div className="space-y-3">
                <h2 className="font-display font-bold text-lg text-[#123B5D]">
                  B2B Bulk, Dealer &amp; RFQ Enquiries ({data.b2bEnquiries.length})
                </h2>
                {data.b2bEnquiries.length === 0 ? (
                  <div className="rounded-xl border border-[#DCEAF5] bg-white p-6 text-sm text-[#263746]/70">
                    No B2B or wholesale enquiries submitted yet.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {data.b2bEnquiries.map((b2b: any) => (
                      <div key={b2b.id} className="rounded-xl border border-[#DCEAF5] bg-white p-5 space-y-2.5 text-xs shadow-sm">
                        <div className="flex justify-between font-semibold border-b border-[#DCEAF5]/60 pb-2">
                          <span className="font-mono text-[#123B5D]">{b2b.enquiryNumber}</span>
                          <span className="text-[#1E88E5]">{b2b.status}</span>
                        </div>
                        <div className="text-[#123B5D] font-semibold">
                          {b2b.companyName} · {b2b.requirementCategory} (Qty {b2b.quantity})
                        </div>
                        <p className="text-[#263746]/80">{b2b.technicalSpecs}</p>
                        {(b2b.attachments || []).length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {b2b.attachments.map((att: any, idx: number) => (
                              <button
                                key={idx}
                                type="button"
                                onClick={() => downloadProtectedFile(att.storagePath, att.originalName)}
                                className="px-2.5 py-1 border border-[#90CAF9] bg-[#F0F8FF] rounded text-[#123B5D] inline-flex items-center gap-1"
                              >
                                <Download className="w-3 h-3 text-[#42A5F5]" /> {att.originalName}
                              </button>
                            ))}
                          </div>
                        )}
                        {b2b.quotedAmountInr && (
                          <div className="pt-2 border-t border-[#DCEAF5]/60 flex items-center justify-between">
                            <span className="font-mono font-bold text-sm text-[#123B5D]">
                              Quote: ₹{b2b.quotedAmountInr.toLocaleString('en-IN')}
                            </span>
                            {b2b.paymentStatus !== 'paid' && (
                              <button
                                onClick={() =>
                                  setPayModal({
                                    open: true,
                                    entityType: 'b2b_enquiry',
                                    entityId: b2b.id,
                                    title: `B2B Order ${b2b.enquiryNumber}`,
                                    amountInr: b2b.quotedAmountInr,
                                  })
                                }
                                className="px-3 py-1.5 bg-[#64B5F6] hover:bg-[#42A5F5] text-white rounded-lg font-semibold transition-colors"
                              >
                                Pay Quote
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Open New Support Ticket Form */}
              <form
                onSubmit={handleCreateSupportTicket}
                className="rounded-xl border border-[#DCEAF5] bg-white p-6 space-y-4 shadow-sm"
              >
                <h2 className="font-display font-bold text-lg text-[#123B5D]">Open a Support Ticket</h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                  <div className="sm:col-span-2 space-y-1">
                    <label className="font-semibold text-[#123B5D]">Subject *</label>
                    <input
                      required
                      placeholder="Brief summary of your technical or order question"
                      value={newTicketForm.subject}
                      onChange={(e) => setNewTicketForm({ ...newTicketForm, subject: e.target.value })}
                      className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3.5 py-2.5 text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="font-semibold text-[#123B5D]">Category</label>
                    <select
                      value={newTicketForm.serviceCategory}
                      onChange={(e) => setNewTicketForm({ ...newTicketForm, serviceCategory: e.target.value })}
                      className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3.5 py-2.5 text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                    >
                      <option value="General Support">General Support</option>
                      <option value="Order & Dispatch">Order &amp; Dispatch</option>
                      <option value="B2B & Wholesale">B2B &amp; Wholesale</option>
                      <option value="3D Printing">3D Printing</option>
                      <option value="PCB Manufacturing">PCB Manufacturing</option>
                      <option value="KRASHIVANTRI Drone">KRASHIVANTRI Drone</option>
                      <option value="Warranty & Repair">Warranty &amp; Repair</option>
                    </select>
                  </div>
                </div>
                <div className="space-y-1 text-xs">
                  <label className="font-semibold text-[#123B5D]">Message / Technical Details *</label>
                  <textarea
                    required
                    rows={3}
                    placeholder="Describe the issue, order number, or technical support request..."
                    value={newTicketForm.message}
                    onChange={(e) => setNewTicketForm({ ...newTicketForm, message: e.target.value })}
                    className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3.5 py-2.5 text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                  />
                </div>
                <button
                  type="submit"
                  disabled={creatingTicket}
                  className="px-5 py-2.5 bg-[#42A5F5] hover:bg-[#1E88E5] text-white text-xs font-semibold rounded-lg disabled:opacity-50 transition-colors"
                >
                  {creatingTicket ? 'Submitting Ticket...' : 'Submit Support Ticket'}
                </button>
              </form>

              {/* Existing Support Tickets */}
              <div className="space-y-4">
                <h2 className="font-display font-bold text-lg text-[#123B5D]">
                  My Support Tickets ({data.supportTickets.length})
                </h2>
                {data.supportTickets.length === 0 ? (
                  <div className="rounded-xl border border-[#DCEAF5] bg-white p-8 text-sm text-[#263746]/70">
                    No support tickets opened yet. Use the form above to contact our technical support team.
                  </div>
                ) : (
                  data.supportTickets.map((t: any) => (
                    <div key={t.id} className="rounded-xl border border-[#DCEAF5] bg-white p-6 space-y-4">
                      <div className="flex justify-between items-center border-b border-[#DCEAF5]/60 pb-2">
                        <div>
                          <span className="font-mono text-xs text-[#263746]/70">{t.ticketNumber} · {t.serviceCategory}</span>
                          <h3 className="font-display font-bold text-[#123B5D]">{t.subject}</h3>
                        </div>
                        <span className="text-xs font-semibold text-[#42A5F5]">{t.status}</span>
                      </div>
                      <div className="space-y-2 text-xs">
                        {(t.messages || []).map((m: any, i: number) => (
                          <div key={i} className={`p-3 rounded-lg ${m.role === 'admin' ? 'bg-[#F0F8FF] text-[#123B5D] border border-[#DCEAF5]' : 'bg-white border border-[#DCEAF5]/70 text-[#263746]'}`}>
                            <div className="font-semibold">{m.sender} ({m.role})</div>
                            <div className="mt-0.5">{m.text}</div>
                          </div>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <input
                          placeholder="Write a reply..."
                          value={replyText[t.id] || ''}
                          onChange={(e) => setReplyText({ ...replyText, [t.id]: e.target.value })}
                          className="flex-1 rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 text-xs text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                        />
                        <button
                          onClick={() => sendTicketReply(t.id)}
                          className="px-4 py-2 bg-[#64B5F6] hover:bg-[#42A5F5] text-white text-xs font-semibold rounded-lg transition-colors"
                        >
                          Send
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* ACCOUNT SETTINGS (IDENTITY & VERIFICATION + NOTIFICATION PREFERENCES) */}
          {tab === 'settings' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-6 rounded-xl border border-[#DCEAF5] bg-white p-6 space-y-4 shadow-sm">
                <div className="flex items-start justify-between gap-2 border-b border-[#DCEAF5]/60 pb-3">
                  <div>
                    <h2 className="font-display font-bold text-lg text-[#123B5D] flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-[#1E88E5]" />
                      Account Identity &amp; Verification
                    </h2>
                    <p className="text-xs text-[#263746]/70 mt-0.5">
                      Your permanent NexusTekFusion customer identity is protected by passwordless Email OTP authentication.
                    </p>
                  </div>
                  <span className="px-2.5 py-1 rounded text-[11px] font-semibold shrink-0 bg-emerald-50 text-emerald-700 border border-emerald-200">
                    {dbUser?.emailVerified !== false ? 'OTP Verified' : 'Pending Verification'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="rounded-lg border border-[#DCEAF5] bg-[#F0F8FF]/50 p-3 space-y-0.5">
                    <div className="text-[#263746]/70">Customer ID (Read-only)</div>
                    <div className="font-mono font-bold text-[#123B5D]">
                      {dbUser?.customerId || dbUser?.uid}
                    </div>
                  </div>
                  <div className="rounded-lg border border-[#DCEAF5] bg-[#F0F8FF]/50 p-3 space-y-0.5">
                    <div className="text-[#263746]/70">Verified Email</div>
                    <div className="font-mono font-semibold text-[#123B5D] truncate">
                      {dbUser?.email}
                    </div>
                  </div>
                  <div className="rounded-lg border border-[#DCEAF5] p-3 space-y-0.5">
                    <div className="text-[#263746]/70">Authentication Method</div>
                    <div className="font-semibold text-[#123B5D]">Passwordless Email + 6-Digit OTP</div>
                  </div>
                  <div className="rounded-lg border border-[#DCEAF5] p-3 space-y-0.5">
                    <div className="text-[#263746]/70">Account Status</div>
                    <div className="font-semibold text-emerald-700">{dbUser?.accountStatus || 'Active'}</div>
                  </div>
                  <div className="rounded-lg border border-[#DCEAF5] p-3 space-y-0.5">
                    <div className="text-[#263746]/70">Account Created</div>
                    <div className="font-mono text-[#123B5D]">
                      {dbUser?.registrationDate
                        ? new Date(dbUser.registrationDate).toLocaleDateString('en-IN')
                        : '—'}
                    </div>
                  </div>
                  <div className="rounded-lg border border-[#DCEAF5] p-3 space-y-0.5">
                    <div className="text-[#263746]/70">Last Login</div>
                    <div className="font-mono text-[#123B5D]">
                      {dbUser?.lastLoginAt
                        ? new Date(dbUser.lastLoginAt).toLocaleString('en-IN')
                        : 'Active Session'}
                    </div>
                  </div>
                </div>

                {!isAdmin && (
                  <div className="pt-3 border-t border-[#DCEAF5] space-y-3">
                    {!showDeleteBox ? (
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-xs text-[#263746]/75">
                          Need to close your customer account? Tax invoices remain archived as required.
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowDeleteBox(true)}
                          className="px-3.5 py-2 border border-red-200 text-red-700 hover:bg-red-50 text-xs font-semibold rounded-lg shrink-0 transition-colors"
                        >
                          Delete Account
                        </button>
                      </div>
                    ) : (
                      <form onSubmit={handleDeleteAccount} className="rounded-lg border border-red-200 bg-red-50/70 p-3.5 space-y-3 text-xs">
                        <div className="font-semibold text-red-900">
                          Confirm Permanent Account Deletion
                        </div>
                        <p className="text-red-800/85">
                          Type your Customer ID (<span className="font-mono font-bold">{dbUser?.customerId || dbUser?.uid}</span>) below to delete your profile. Your Customer ID will never be reused, and completed GST invoices remain archived.
                        </p>
                        <input
                          required
                          value={deleteConfirmId}
                          onChange={(e) => setDeleteConfirmId(e.target.value.toUpperCase())}
                          placeholder={dbUser?.customerId || dbUser?.uid || 'NTF-CUST-000001'}
                          className="w-full rounded-lg border border-red-200 bg-white px-3 py-2 font-mono text-xs text-[#123B5D]"
                        />
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setShowDeleteBox(false);
                              setDeleteConfirmId('');
                            }}
                            className="px-3 py-1.5 border border-[#DCEAF5] bg-white rounded-lg font-semibold text-[#263746]"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            disabled={deletingAccount}
                            className="px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold disabled:opacity-50"
                          >
                            {deletingAccount ? 'Deleting...' : 'Permanently Delete Account'}
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                )}
              </div>

              <form
                onSubmit={handleSaveSettings}
                className="lg:col-span-6 rounded-xl border border-[#DCEAF5] bg-white p-6 space-y-4 shadow-sm"
              >
                <div className="border-b border-[#DCEAF5]/60 pb-3">
                  <h2 className="font-display font-bold text-lg text-[#123B5D] flex items-center gap-2">
                    <Bell className="w-4 h-4 text-[#1E88E5]" />
                    Notification Preferences
                  </h2>
                  <p className="text-xs text-[#263746]/70 mt-0.5">
                    Control how you receive order, quotation, and engineering job updates.
                  </p>
                </div>

                <div className="space-y-3 text-xs">
                  {(
                    [
                      ['orderAlerts', 'Order & Courier Dispatch Alerts', 'Get notified on checkout confirmation, shipping AWB, and delivery.'],
                      ['quotationAlerts', 'Quotation & Manufacturing Alerts', 'Receive alerts for 3D printing, PCB, and custom project quotations.'],
                      ['emailUpdates', 'Account & Invoice Emails', 'Official GST tax invoices, receipts, and security notices.'],
                      ['whatsappAlerts', 'WhatsApp & SMS Status Updates', 'Dispatch milestones and urgent engineering clarifications.'],
                      ['promotionalEmails', 'New Hardware & Offer Announcements', 'Seasonal drone kits, filaments, and robotics launches.'],
                    ] as Array<[keyof NotificationPreferences, string, string]>
                  ).map(([key, title, desc]) => (
                    <label
                      key={key}
                      className="flex items-start justify-between gap-3 rounded-lg border border-[#DCEAF5] p-3 cursor-pointer hover:bg-[#F0F8FF]/50 transition-colors"
                    >
                      <div>
                        <div className="font-semibold text-[#123B5D]">{title}</div>
                        <div className="text-[#263746]/70 text-[11px]">{desc}</div>
                      </div>
                      <input
                        type="checkbox"
                        checked={Boolean(notifPrefs[key])}
                        onChange={(e) =>
                          setNotifPrefs((prev) => ({ ...prev, [key]: e.target.checked }))
                        }
                        className="mt-1 h-4 w-4 accent-[#1E88E5]"
                      />
                    </label>
                  ))}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <button
                    type="submit"
                    disabled={savingPrefs}
                    className="px-5 py-2.5 bg-[#42A5F5] hover:bg-[#1E88E5] text-white text-xs font-semibold rounded-lg disabled:opacity-50 transition-colors"
                  >
                    {savingPrefs ? 'Saving Preferences...' : 'Save Notification Preferences'}
                  </button>
                  <button
                    type="button"
                    onClick={signOut}
                    className="px-4 py-2 border border-red-200 text-red-700 hover:bg-red-50 text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 transition-colors"
                  >
                    <LogOut className="w-3.5 h-3.5" /> Sign Out Everywhere
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      )}
        </div>
      </div>

      {editAddressModal && (
        <div
          className="fixed inset-0 z-50 bg-[#123B5D]/60 flex items-center justify-center p-4"
          onClick={() => !savingEditAddress && setEditAddressModal(null)}
        >
          <div
            className="w-full max-w-lg rounded-2xl bg-white border border-[#DCEAF5] shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 bg-[#F0F8FF] border-b border-[#DCEAF5] flex items-center justify-between">
              <h3 className="font-display font-bold text-base text-[#123B5D]">Edit Address</h3>
              <button
                type="button"
                onClick={() => setEditAddressModal(null)}
                className="p-1.5 rounded-lg text-[#123B5D] hover:bg-[#DCEAF5]/60"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveEditedAddress} className="p-6 overflow-y-auto space-y-3 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-[#123B5D] mb-1">Label</label>
                  <input
                    required
                    value={editAddressModal.label}
                    onChange={(e) => setEditAddressModal({ ...editAddressModal, label: e.target.value })}
                    className="w-full rounded-lg border border-[#DCEAF5] px-3 py-2 text-[#263746]"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-[#123B5D] mb-1">Recipient Name</label>
                  <input
                    required
                    value={editAddressModal.fullName}
                    onChange={(e) => setEditAddressModal({ ...editAddressModal, fullName: e.target.value })}
                    className="w-full rounded-lg border border-[#DCEAF5] px-3 py-2 text-[#263746]"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-[#123B5D] mb-1">Mobile</label>
                  <input
                    required
                    value={editAddressModal.mobile}
                    onChange={(e) => setEditAddressModal({ ...editAddressModal, mobile: e.target.value })}
                    className="w-full rounded-lg border border-[#DCEAF5] px-3 py-2 font-mono text-[#263746]"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-[#123B5D] mb-1">PIN Code</label>
                  <input
                    required
                    value={editAddressModal.pinCode}
                    onChange={(e) => setEditAddressModal({ ...editAddressModal, pinCode: e.target.value })}
                    className="w-full rounded-lg border border-[#DCEAF5] px-3 py-2 font-mono text-[#263746]"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block font-semibold text-[#123B5D] mb-1">House / Flat</label>
                  <input
                    required
                    value={editAddressModal.houseFlat}
                    onChange={(e) => setEditAddressModal({ ...editAddressModal, houseFlat: e.target.value })}
                    className="w-full rounded-lg border border-[#DCEAF5] px-3 py-2 text-[#263746]"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block font-semibold text-[#123B5D] mb-1">Street / Area</label>
                  <input
                    required
                    value={editAddressModal.streetArea}
                    onChange={(e) => setEditAddressModal({ ...editAddressModal, streetArea: e.target.value })}
                    className="w-full rounded-lg border border-[#DCEAF5] px-3 py-2 text-[#263746]"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-[#123B5D] mb-1">City</label>
                  <input
                    required
                    value={editAddressModal.city}
                    onChange={(e) => setEditAddressModal({ ...editAddressModal, city: e.target.value })}
                    className="w-full rounded-lg border border-[#DCEAF5] px-3 py-2 text-[#263746]"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-[#123B5D] mb-1">District</label>
                  <input
                    required
                    value={editAddressModal.district}
                    onChange={(e) => setEditAddressModal({ ...editAddressModal, district: e.target.value })}
                    className="w-full rounded-lg border border-[#DCEAF5] px-3 py-2 text-[#263746]"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block font-semibold text-[#123B5D] mb-1">State</label>
                  <input
                    required
                    value={editAddressModal.state}
                    onChange={(e) => setEditAddressModal({ ...editAddressModal, state: e.target.value })}
                    className="w-full rounded-lg border border-[#DCEAF5] px-3 py-2 text-[#263746]"
                  />
                </div>
              </div>
              <label className="inline-flex items-center gap-2 font-semibold text-[#123B5D]">
                <input
                  type="checkbox"
                  checked={Boolean(editAddressModal.isDefault)}
                  onChange={(e) => setEditAddressModal({ ...editAddressModal, isDefault: e.target.checked })}
                />
                Set as Default Address
              </label>
              <div className="flex justify-end gap-2 pt-2 border-t border-[#DCEAF5]">
                <button
                  type="button"
                  onClick={() => setEditAddressModal(null)}
                  className="px-4 py-2 border border-[#DCEAF5] rounded-lg font-semibold text-[#263746]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEditAddress}
                  className="px-5 py-2 bg-[#42A5F5] hover:bg-[#1E88E5] text-white rounded-lg font-semibold disabled:opacity-50"
                >
                  {savingEditAddress ? 'Saving...' : 'Save Address'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {orderDetailModal && (
        <div className="fixed inset-0 z-50 bg-[#123B5D]/60 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white border border-[#DCEAF5] shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="bg-[#F0F8FF] border-b border-[#DCEAF5] text-[#123B5D] px-6 py-4 flex items-center justify-between">
              <div>
                <div className="text-[11px] font-mono text-[#42A5F5]">Store Order Summary</div>
                <h3 className="font-display font-bold text-base">{orderDetailModal.orderNumber}</h3>
              </div>
              <button
                type="button"
                onClick={() => setOrderDetailModal(null)}
                className="p-1.5 rounded-lg text-[#123B5D] hover:bg-[#DCEAF5]/60"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto space-y-5 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="rounded-lg border border-[#DCEAF5] p-3.5 space-y-1">
                  <div className="font-semibold text-[#123B5D]">Shipping Address</div>
                  <div className="text-[#263746]/80">
                    {orderDetailModal.shippingAddress?.fullName} · {orderDetailModal.shippingAddress?.mobile}
                    <div>
                      {orderDetailModal.shippingAddress?.houseFlat}, {orderDetailModal.shippingAddress?.streetArea}
                    </div>
                    <div>
                      {orderDetailModal.shippingAddress?.city}, {orderDetailModal.shippingAddress?.state} — {orderDetailModal.shippingAddress?.pinCode}
                    </div>
                  </div>
                </div>
                <div className="rounded-lg border border-[#DCEAF5] p-3.5 space-y-1 font-mono tabular-nums text-[#263746]">
                  <div className="font-sans font-semibold text-[#123B5D]">Payment &amp; Status</div>
                  <div>Order Status: {orderDetailModal.orderStatus}</div>
                  <div>Payment: {orderDetailModal.paymentStatus}</div>
                  <div>Total Paid: ₹{Number(orderDetailModal.totalInr || 0).toLocaleString('en-IN')}</div>
                </div>
              </div>

              <div className="divide-y divide-[#DCEAF5]/60 border rounded-lg border-[#DCEAF5] px-4 text-[#263746]">
                {(orderDetailModal.items || []).map((it: any, idx: number) => (
                  <div key={idx} className="py-2.5 flex justify-between gap-2">
                    <span>
                      {it.name} × {it.qty} ({it.sku})
                    </span>
                    <span className="font-mono font-semibold text-[#123B5D]">₹{Number(it.lineTotalInr || 0).toLocaleString('en-IN')}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {cancelOrderModal && (
        <div className="fixed inset-0 z-50 bg-[#123B5D]/60 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-white border border-[#DCEAF5] shadow-2xl p-6 space-y-4">
            <h3 className="font-display font-bold text-lg text-[#123B5D]">
              Cancel Order {cancelOrderModal.orderNumber}?
            </h3>
            <p className="text-xs text-[#263746]/80">
              Orders can be cancelled before dispatch and reserved inventory will be restored immediately.
            </p>
            <textarea
              rows={3}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Reason for cancellation..."
              className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 text-xs text-[#263746] focus:outline-none focus:border-[#64B5F6]"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCancelOrderModal(null)}
                className="px-4 py-2 border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] rounded-lg text-xs font-semibold transition-colors"
              >
                Keep Order
              </button>
              <button
                type="button"
                disabled={cancellingOrder}
                onClick={handleCancelStoreOrder}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-semibold disabled:opacity-50"
              >
                {cancellingOrder ? 'Cancelling...' : 'Confirm Cancellation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {payModal && (
        <RazorpayCheckoutModal
          open={payModal.open}
          onClose={() => setPayModal(null)}
          entityType={payModal.entityType}
          entityId={payModal.entityId}
          paymentMode={payModal.paymentMode}
          title={payModal.title}
          amountInr={payModal.amountInr}
          onSuccess={loadDashboard}
        />
      )}
    </div>
  );
};
