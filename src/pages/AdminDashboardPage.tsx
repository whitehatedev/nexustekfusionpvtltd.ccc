import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Boxes,
  Briefcase,
  Check,
  CheckCircle2,
  Cpu,
  CreditCard,
  Download,
  Edit3,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  Globe,
  History,
  Image as ImageIcon,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  Package,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Send,
  Settings,
  Shield,
  ShieldCheck,
  ShoppingBag,
  Tags,
  Ticket,
  Trash2,
  Upload,
  UserCheck,
  Users,
  Wrench,
  X,
} from 'lucide-react';
import { usePlatform } from '../context/PlatformContext';
import { getDashboardRouteForRole } from '../lib/rbac';
import { getSupabaseClient } from '../lib/supabase';
import {
  downloadInvoicePdf,
  downloadPackingSlipPdf,
  downloadQuotationPdf,
} from '../lib/pdf';
import {
  ProjectFinanceDashboardPanel,
  ProjectHandoverControlsPanel,
  ProjectPaymentSettingsPanel,
} from '../components/admin/ProjectPaymentsAndFinancePanel';
import { KrashivantriAdminWorkspace } from '../components/admin/KrashivantriAdminPanels';
import { AboutTeamAdminPanel } from '../components/admin/AboutTeamAdminPanel';
import { MediaLibraryPanel, MediaPickerModal } from '../components/admin/MediaLibraryPanel';
import { MasterCmsStudioPanel, CmsStudioSubSection } from '../components/admin/MasterCmsStudioPanel';
import { PrintingOrdersAdminPanel } from '../components/admin/PrintingOrdersAdminPanel';
import { CustomerManagementPanel } from '../components/admin/CustomerManagementPanel';
import { AdminEnquiriesPanel } from '../components/admin/AdminEnquiriesPanel';
import { AdminNotificationsPopover } from '../components/admin/AdminNotificationsPopover';
import {
  CompanySigningAssetsAdminPanel,
  ProjectAgreementsAdminPanel,
  RazorpayPaymentLinksAdminPanel,
  RecordHistoryAndActivityAdminPanel,
} from '../components/admin/AdminCloudGovernancePanels';
import { ProjectPaymentsAndInstallmentsPanel } from '../components/admin/ProjectPaymentsAndInstallmentsPanel';

const COMPANY_LOGO = '/assets/aistudio/image_1a5ac752.png';

export type AdminTab =
  | 'overview'
  | 'enquiries'
  | 'website_cms'
  | 'cms_banners'
  | 'cms_services'
  | 'cms_projects'
  | 'cms_store_content'
  | 'cms_contact_footer'
  | 'cms_seo'
  | 'about_team'
  | 'krashivantri_cms'
  | 'product_enquiries'
  | 'media_library'
  | 'store_products'
  | 'categories_brands'
  | 'inventory'
  | 'store_orders'
  | 'coupons'
  | 'projects'
  | 'project_finance'
  | 'project_payment_settings'
  | 'printing'
  | 'pcb_b2b'
  | 'crm'
  | 'rd_projects'
  | 'blogs'
  | 'payments_invoices'
  | 'support'
  | 'customers'
  | 'users'
  | 'settings'
  | 'audit'
  | 'krash_farmers'
  | 'krash_pilots'
  | 'krash_live_tracking'
  | 'krash_orders_live'
  | 'krash_farmer_payments'
  | 'krash_pilot_payouts'
  | 'krash_penalties'
  | 'krash_finance'
  // legacy tab aliases mapped gracefully
  | 'store'
  | 'cms'
  | 'project_settings'
  | 'payment_settings';

function normalizeTab(t?: AdminTab): AdminTab {
  if (!t) return 'overview';
  if (t === 'store') return 'store_products';
  if (t === 'cms' || (t as string) === 'cms_about_us') return 'website_cms';
  if (t === 'project_settings') return 'project_payment_settings';
  if (t === 'payment_settings') return 'payments_invoices';
  return t;
}

const COST_CATEGORY_FIELDS: Array<[string, string]> = [
  ['development', 'Engineering & Development Charges (₹)'],
  ['hardware', 'Hardware Cost (₹)'],
  ['sensors', 'Component / Sensors Cost (₹)'],
  ['pcb', 'PCB / Manufacturing Cost (₹)'],
  ['mechanical', 'Mechanical Fabrication (₹)'],
  ['printing3d', '3D Printing / Fabrication (₹)'],
  ['software', 'Software Development Cost (₹)'],
  ['aiMl', 'AI / ML Model (₹)'],
  ['iot', 'IoT / Cloud Setup (₹)'],
  ['droneRobotics', 'Drone / Robotics Eng (₹)'],
  ['testing', 'Testing & QA Charges (₹)'],
  ['documentation', 'Documentation Charges (₹)'],
  ['delivery', 'Delivery & Packaging (₹)'],
  ['other', 'Other Charges (₹)'],
];

const INITIAL_COST_CATEGORIES: Record<string, number> = {
  development: 0,
  hardware: 0,
  sensors: 0,
  pcb: 0,
  mechanical: 0,
  printing3d: 0,
  software: 0,
  aiMl: 0,
  iot: 0,
  droneRobotics: 0,
  testing: 0,
  documentation: 0,
  delivery: 250,
  other: 0,
};

const ADMIN_PROJECT_STATUSES = [
  'New Request',
  'Technical Review',
  'Quotation Pending',
  'Quotation Sent',
  'Approved',
  'Development',
  'Testing',
  'Completed',
  'Delivered',
  'Cancelled',
  'Submitted – Under Review',
  'Additional Information Required',
  'Under Technical Evaluation',
  'Quotation Prepared',
  'Quotation Approved by Customer',
  'Awaiting Advance Payment',
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
];

const ADMIN_UPDATE_CATEGORIES = [
  'Project Confirmed',
  'Hardware Design',
  'Software Development',
  'Component Procurement',
  'Circuit & PCB Design',
  '3D Designing & Printing',
  'Hardware Assembly',
  'Firmware / AI Integration',
  'Testing & Calibration',
  'Debugging & Optimization',
  'Documentation & Report',
  'Final Validation',
  'Ready for Delivery',
];

const STORE_ORDER_STATUSES = [
  'New',
  'Confirmed',
  'Processing',
  'Shipped',
  'Out for Delivery',
  'Delivered',
  'Cancelled',
  'Refunded',
  'Order Placed',
  'Pending Payment',
  'Payment Confirmed',
  'Order Processing',
  'Quality Inspection',
  'Ready for Dispatch',
  'Refund Initiated',
];

const KRASHI_SPEC_KEYS = [
  'Payload Capacity',
  'Flight Time',
  'Tank Capacity',
  'Spraying Width',
  'Battery Specifications',
  'Navigation Capabilities',
] as const;

const CRM_STAGES = [
  'New Lead',
  'Contacted',
  'Requirement Understood',
  'Quotation Sent',
  'Negotiation',
  'Won',
  'Lost',
];

const STAFF_ADMIN_ROLES = [
  'super_admin',
  'admin',
  'website_manager',
  'product_manager',
  'sales_manager',
  'project_manager',
  'engineer',
  'printing_operator',
  'inventory_manager',
  'accounts_manager',
  'support_manager',
  'support_staff',
];

interface EmptyProductDraft {
  id?: number;
  name: string;
  sku: string;
  hsnCode: string;
  modelNumber: string;
  brand: string;
  categoryId: string;
  subcategory: string;
  storeScope: 'general' | '3d_printed';
  productType: 'simple' | 'variable' | 'customizable' | 'made_to_order' | 'quote_only';
  status: 'draft' | 'published' | 'scheduled';
  shortDescription: string;
  description: string;
  featuresText: string;
  specsText: string;
  krashiSpecs: Record<string, string>;
  priceInr: string;
  discountPriceInr: string;
  gstPercent: string;
  stockQty: string;
  lowStockThreshold: string;
  dimensions: string;
  weightGrams: string;
  shippingWeightGrams: string;
  deliveryInfo: string;
  material: string;
  availableVariantsText: string;
  availableColorsText: string;
  packageContentsText: string;
  compatibility: string;
  applications: string;
  imageUrl: string;
  galleryUrlsText: string;
  brochureUrl: string;
  datasheetUrl: string;
  model3dUrl: string;
  videoUrl: string;
  seoTitle: string;
  seoDescription: string;
  isFeatured: boolean;
  isBestseller: boolean;
  isNewArrival: boolean;
}

const EMPTY_KRASHI_SPECS: Record<string, string> = {
  'Payload Capacity': '',
  'Flight Time': '',
  'Tank Capacity': '',
  'Spraying Width': '',
  'Battery Specifications': '',
  'Navigation Capabilities': '',
};

const EMPTY_PRODUCT: EmptyProductDraft = {
  name: '',
  sku: '',
  hsnCode: '8807',
  modelNumber: '',
  brand: 'NexusTekFusion',
  categoryId: '',
  subcategory: '',
  storeScope: 'general',
  productType: 'simple',
  status: 'published',
  shortDescription: '',
  description: '',
  featuresText: '',
  specsText: '',
  krashiSpecs: { ...EMPTY_KRASHI_SPECS },
  priceInr: '0',
  discountPriceInr: '',
  gstPercent: '18',
  stockQty: '10',
  lowStockThreshold: '5',
  dimensions: '',
  weightGrams: '0',
  shippingWeightGrams: '0',
  deliveryInfo: '',
  material: '',
  availableVariantsText: '',
  availableColorsText: '',
  packageContentsText: '',
  compatibility: '',
  applications: '',
  imageUrl: '/src/assets/images/service_pcb_electronics_1794981062614.jpg',
  galleryUrlsText: '',
  brochureUrl: '',
  datasheetUrl: '',
  model3dUrl: '',
  videoUrl: '',
  seoTitle: '',
  seoDescription: '',
  isFeatured: false,
  isBestseller: false,
  isNewArrival: true,
};

export const AdminDashboardPage: React.FC<{ initialTab?: AdminTab }> = ({ initialTab }) => {
  const {
    dbUser,
    isSignedIn,
    isAdmin,
    signInWithSupabaseOAuth,
    getIdToken,
    signOut,
    apiFetch,
    notify,
    settings,
    refreshBootstrap,
    navigate,
    razorpayMode,
  } = usePlatform();

  const [tab, setTab] = useState<AdminTab>(() => normalizeTab(initialTab));
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (initialTab) setTab(normalizeTab(initialTab));
  }, [initialTab]);

  const [overview, setOverview] = useState<any>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [brands, setBrands] = useState<any[]>([]);
  const [printConfig, setPrintConfig] = useState<{ materials: any[]; machines: any[] }>({
    materials: [],
    machines: [],
  });
  const [loading, setLoading] = useState(true);

  // Filters & Operations State
  const [overviewDateFrom, setOverviewDateFrom] = useState('');
  const [overviewDateTo, setOverviewDateTo] = useState('');
  const [realtimeTick, setRealtimeTick] = useState(0);
  const [realtimeActive, setRealtimeActive] = useState(false);
  const [jumpToCustomerCode, setJumpToCustomerCode] = useState('');

  const [productSearch, setProductSearch] = useState('');
  const [orderSearch, setOrderSearch] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState('All');
  const [orderPaymentFilter, setOrderPaymentFilter] = useState<'all' | 'paid' | 'pending' | 'refunded'>('all');
  const [orderDateFrom, setOrderDateFrom] = useState('');
  const [orderDateTo, setOrderDateTo] = useState('');
  const [orderPage, setOrderPage] = useState(1);
  const [orderDetailTarget, setOrderDetailTarget] = useState<any | null>(null);
  const [orderDeliveryDraft, setOrderDeliveryDraft] = useState({
    fullName: '',
    mobile: '',
    line1: '',
    line2: '',
    city: '',
    state: '',
    pinCode: '',
    orderStatus: 'Confirmed',
    trackingCourier: '',
    trackingId: '',
    trackingUrl: '',
    internalNotes: '',
  });
  const [savingOrderModal, setSavingOrderModal] = useState(false);

  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [invoicePayFilter, setInvoicePayFilter] = useState<'all' | 'paid' | 'unpaid'>('all');
  const [invoiceDateFrom, setInvoiceDateFrom] = useState('');
  const [invoiceDateTo, setInvoiceDateTo] = useState('');
  const [invoiceReportRows, setInvoiceReportRows] = useState<any[]>([]);
  const [invoiceReportSummary, setInvoiceReportSummary] = useState<{
    totalInvoices: number;
    paidCount: number;
    unpaidCount: number;
    totalBilledInr: number;
    totalTaxInr: number;
  }>({ totalInvoices: 0, paidCount: 0, unpaidCount: 0, totalBilledInr: 0, totalTaxInr: 0 });
  const [invoiceReportLoading, setInvoiceReportLoading] = useState(false);

  const [projectBudgetDraftMap, setProjectBudgetDraftMap] = useState<Record<number, string>>({});
  const [projectTechNotesMap, setProjectTechNotesMap] = useState<Record<number, string>>({});
  const [projectDocFilesMap, setProjectDocFilesMap] = useState<Record<number, File[]>>({});
  const [uploadingProjDocsId, setUploadingProjDocsId] = useState(0);

  const [enquirySearch, setEnquirySearch] = useState('');
  const [enquiryStatusFilter, setEnquiryStatusFilter] = useState('All');
  const [enquiryEditMap, setEnquiryEditMap] = useState<
    Record<number, { status: string; assignedStaff: string; internalNotes: string }>
  >({});
  const [historyUser, setHistoryUser] = useState<any | null>(null);
  const [crmStageFilter, setCrmStageFilter] = useState('All');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<'all' | 'verified' | 'failed' | 'pending' | 'refunded'>('all');
  const [refundTarget, setRefundTarget] = useState<{ id: number; paymentRef: string; maxInr: number } | null>(null);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [refundBusy, setRefundBusy] = useState(false);
  const [uploadingProdImg, setUploadingProdImg] = useState(false);

  // Product Form / Edit State
  const [prodDraft, setProdDraft] = useState<EmptyProductDraft>(EMPTY_PRODUCT);
  const [showProdForm, setShowProdForm] = useState(false);
  const [csvImportText, setCsvImportText] = useState('');
  const [importingCsv, setImportingCsv] = useState(false);

  // Category & Brand State
  const [catForm, setCatForm] = useState<{ id?: number; name: string; slug: string; storeScope: 'general' | '3d_printed'; description: string; sortOrder: string }>({
    name: '',
    slug: '',
    storeScope: 'general',
    description: '',
    sortOrder: '0',
  });
  const [brandForm, setBrandForm] = useState<{ id?: number; name: string; slug: string; logoUrl: string; description: string }>({
    name: '',
    slug: '',
    logoUrl: '',
    description: '',
  });

  // Inventory adjustment
  const [stockAdjustMap, setStockAdjustMap] = useState<Record<number, { delta: string; reason: string }>>({});

  // Store Order inline state
  const [orderDraftMap, setOrderDraftMap] = useState<
    Record<
      number,
      {
        orderStatus: string;
        trackingCourier: string;
        trackingId: string;
        trackingUrl: string;
        statusNote: string;
        internalNotes: string;
      }
    >
  >({});

  // Project Enquiry Management Filters, Messages, Quotations & Progress Updates
  const [projSearch, setProjSearch] = useState('');
  const [projFilterCategory, setProjFilterCategory] = useState('');
  const [projFilterStatus, setProjFilterStatus] = useState('');
  const [projFilterDateFrom, setProjFilterDateFrom] = useState('');
  const [projFilterDateTo, setProjFilterDateTo] = useState('');
  const [projExpandedMap, setProjExpandedMap] = useState<Record<number, boolean>>({});
  const [adminNotesMap, setAdminNotesMap] = useState<Record<number, string>>({});
  const [adminMsgMap, setAdminMsgMap] = useState<Record<number, string>>({});
  const [adminMsgFilesMap, setAdminMsgFilesMap] = useState<Record<number, File[]>>({});
  const [rejectReasonMap, setRejectReasonMap] = useState<Record<number, string>>({});
  const [rejectOpenId, setRejectOpenId] = useState<number>(0);
  const [clarifyNotesMap, setClarifyNotesMap] = useState<Record<number, string>>({});
  const [clarifyOpenId, setClarifyOpenId] = useState<number>(0);
  const [engineerMap, setEngineerMap] = useState<Record<number, string>>({});
  const [quoteEnquiryId, setQuoteEnquiryId] = useState<number>(0);
  const [editingQuotationId, setEditingQuotationId] = useState<number>(0);
  const [costCategories, setCostCategories] = useState<Record<string, number>>(INITIAL_COST_CATEGORIES);
  const [quoteItems, setQuoteItems] = useState<Array<{ name: string; description: string; qty: number; unitPriceInr: number }>>([]);
  const [quoteMeta, setQuoteMeta] = useState({
    discountInr: 0,
    gstInr: 0,
    advancePercent: 50,
    validityDays: 15,
    estimatedDuration: '3–4 Weeks',
    estimatedDeliveryDate: '',
    paymentTerms: '50% Advance on Acceptance, 50% Balance Before Dispatch',
    termsAndConditions: '',
  });
  const [progUpdateOpenId, setProgUpdateOpenId] = useState<number>(0);
  const [progUpdateFormMap, setProgUpdateFormMap] = useState<
    Record<
      number,
      {
        category: string;
        title: string;
        description: string;
        progressPercentage: number;
        adminComments: string;
        nextStatus: string;
      }
    >
  >({});
  const [progUpdateFilesMap, setProgUpdateFilesMap] = useState<
    Record<number, { photos: File[]; videos: File[]; reports: File[] }>
  >({});
  const [completeOpenId, setCompleteOpenId] = useState<number>(0);
  const [completeProofMap, setCompleteProofMap] = useState<Record<number, { notes: string; files: File[] }>>({});

  // 3D Printing Lab
  const [newMat, setNewMat] = useState({
    name: '',
    technology: 'FDM',
    densityGcm3: '1.24',
    ratePerGramInr: '8',
    description: '',
  });
  const [printOrderEdit, setPrintOrderEdit] = useState<Record<number, { orderStatus: string; slicingStatus: string; totalInr: string; productionNotes: string }>>({});

  // PCB / B2B / Support inline
  const [pcbQuoteMap, setPcbQuoteMap] = useState<Record<number, string>>({});
  const [b2bQuoteMap, setB2bQuoteMap] = useState<Record<number, string>>({});
  const [ticketReplyMap, setTicketReplyMap] = useState<Record<number, string>>({});

  // CRM Leads & Notes
  const [leadForm, setLeadForm] = useState({
    name: '',
    email: '',
    phone: '',
    companyOrCollege: '',
    source: 'manual',
    stage: 'New Lead',
    estimatedValueInr: '0',
    nextFollowUpDate: '',
    summary: '',
  });
  const [leadNoteMap, setLeadNoteMap] = useState<Record<number, string>>({});

  // Coupons
  const [couponForm, setCouponForm] = useState({
    code: '',
    discountType: 'percent',
    discountValue: '10',
    minOrderInr: '500',
  });

  // Blogs & Case Studies (Engineering R&D)
  const [blogForm, setBlogForm] = useState<{ id?: number; title: string; category: string; excerpt: string; content: string; coverImageUrl: string; isPublished: boolean }>({
    title: '',
    category: 'Engineering',
    excerpt: '',
    content: '',
    coverImageUrl: '/src/assets/images/hero_nexustek_engineering_1794981062404.jpg',
    isPublished: true,
  });
  const [rdForm, setRdForm] = useState<{ id?: number; title: string; slug: string; technologyUsed: string; applications: string; outcomes: string; description: string; imageUrl: string; videoUrl: string; isPublished: boolean }>({
    title: '',
    slug: '',
    technologyUsed: '',
    applications: '',
    outcomes: '',
    description: '',
    imageUrl: '/src/assets/images/service_robotics_automation_1794981063545.jpg',
    videoUrl: '',
    isPublished: true,
  });

  // Media Picker target for KRASHIVANTRI CMS
  const [krashiPicker, setKrashiPicker] = useState<{
    filterKind: 'all' | 'image' | 'video';
    title: string;
    onSelect: (url: string) => void;
  } | null>(null);

  const [archiveConfirm, setArchiveConfirm] = useState<{
    title: string;
    subtitle: string;
    endpoint: string;
    reason: string;
    busy: boolean;
  } | null>(null);

  // CMS & KRASHIVANTRI & Menus & Services & Settings
  const [navMenus, setNavMenus] = useState<
    Array<{
      id: string;
      label: string;
      to: string;
      visible: boolean;
      sortOrder: number;
      children?: Array<{ id: string; label: string; to: string }>;
    }>
  >(() => settings.navigationMenus?.header || []);
  const [servicesCatalog, setServicesCatalog] = useState<Array<{ slug: string; title: string; shortDesc: string; visible: boolean; imageUrl?: string; ctaLabel?: string }>>(
    () => settings.servicesCatalog || []
  );
  const [krashiCatalog, setKrashiCatalog] = useState<any>(() => settings.krashivantriCatalog || { platformName: '', summary: '', bannerImageUrl: '', models: [] });

  const [announcementForm, setAnnouncementForm] = useState(() => ({
    enabled: settings.announcementBar?.enabled ?? true,
    text: settings.announcementBar?.text ?? '',
    link: settings.announcementBar?.link ?? '/krashivantri',
    ctaLabel: settings.announcementBar?.ctaLabel ?? 'Explore',
  }));
  const [companyForm, setCompanyForm] = useState(() => ({
    legalName: settings.companyInfo?.legalName ?? 'NEXUSTEKFUSION PRIVATE LIMITED',
    brandName: settings.companyInfo?.brandName ?? 'NexusTekFusion',
    email: settings.companyInfo?.email ?? 'info@nexustekfusion.in',
    customerCareEmail: settings.companyInfo?.customerCareEmail ?? 'info@nexustekfusion.in',
    address: settings.companyInfo?.address ?? 'H NO. 565/19 NIT, SANKUL NEW COTTON MARK, Ganjipeth, Nagpur 440018, Maharashtra, India',
    cin: settings.companyInfo?.cin ?? 'U30305ME2026PTC474052',
    gstin: settings.companyInfo?.gstin ?? '',
    contactPhone: settings.companyInfo?.contactPhone ?? '',
    businessHours: settings.companyInfo?.businessHours ?? 'Monday – Saturday, 10:00 AM – 7:00 PM IST',
  }));
  const [shippingForm, setShippingForm] = useState(() => ({
    standardShippingInr: settings.shippingConfig?.standardShippingInr ?? 99,
    freeShippingAboveInr: settings.shippingConfig?.freeShippingAboveInr ?? 2499,
    defaultGstPercent: settings.shippingConfig?.defaultGstPercent ?? 18,
  }));
  const [projSettingsForm, setProjSettingsForm] = useState(() => ({
    enableGstTax: settings.projectSettings?.enableGstTax ?? false,
    defaultGstPercent: settings.projectSettings?.defaultGstPercent ?? 18,
    defaultAdvancePercent: settings.projectSettings?.defaultAdvancePercent ?? 50,
    quotationValidityDays: settings.projectSettings?.quotationValidityDays ?? 15,
  }));

  // Admin Password Change
  const [pwdForm, setPwdForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });

  const loadAll = useCallback(
    async (silent = false, overrideFrom?: string, overrideTo?: string) => {
      if (!isSignedIn || !isAdmin) return;
      if (!silent) setLoading(true);
      try {
        const qs = new URLSearchParams();
        const df = overrideFrom !== undefined ? overrideFrom : overviewDateFrom;
        const dt = overrideTo !== undefined ? overrideTo : overviewDateTo;
        if (df) qs.set('dateFrom', df);
        if (dt) qs.set('dateTo', dt);
        const overviewUrl = qs.toString() ? `/api/admin/overview?${qs.toString()}` : '/api/admin/overview';
        const [ov, prods, cats, brs, pcfg] = await Promise.all([
          apiFetch(overviewUrl),
          apiFetch<{ items: any[] }>('/api/admin/products'),
          apiFetch<{ items: any[] }>('/api/admin/categories'),
          apiFetch<{ items: any[] }>('/api/admin/brands'),
          apiFetch<{ materials: any[]; machines: any[] }>('/api/admin/printing-config'),
        ]);
        setOverview(ov);
        setProducts(prods.items || []);
        setCategories(cats.items || []);
        setBrands(brs.items || []);
        setPrintConfig(pcfg);
      } catch (err: any) {
        if (!silent) notify(err?.message || 'Failed to load admin console.', 'error');
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [isSignedIn, isAdmin, overviewDateFrom, overviewDateTo, apiFetch, notify]
  );

  const loadAllRef = useRef(loadAll);
  loadAllRef.current = loadAll;

  useEffect(() => {
    if (!isSignedIn || !isAdmin) {
      setOverview(null);
      setProducts([]);
      setCategories([]);
      setBrands([]);
      setPrintConfig({ materials: [], machines: [] });
      setLoading(false);
      return;
    }
    loadAll(false);
  }, [isSignedIn, isAdmin, dbUser?.role]);

  // Real-time admin synchronization (SSE /api/admin/stream + browser Supabase Realtime)
  useEffect(() => {
    if (!isSignedIn || !isAdmin) return;
    let active = true;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let streamController: AbortController | null = null;

    const triggerSync = () => {
      if (!active) return;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (!active) return;
        setRealtimeTick((t) => t + 1);
        loadAllRef.current(true).catch(() => {});
      }, 350);
    };

    const connectSse = async () => {
      if (!active) return;
      streamController = new AbortController();
      try {
        const token = await getIdToken();
        const headers: Record<string, string> = { Accept: 'text/event-stream' };
        if (token) headers.Authorization = `Bearer ${token}`;

        const resp = await fetch('/api/admin/stream', {
          method: 'GET',
          headers,
          credentials: 'include',
          signal: streamController.signal,
        });
        if (!resp.ok || !resp.body) throw new Error('Stream unavailable');
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
            if (frame.includes('event: admin_event')) {
              triggerSync();
            }
          }
        }
      } catch {
        // Reconnect cleanly below
      } finally {
        if (active) {
          setRealtimeActive(false);
          reconnectTimer = setTimeout(connectSse, 4500);
        }
      }
    };

    connectSse();

    const sb = getSupabaseClient();
    const channel = sb
      ? sb
          .channel('admin-ops-realtime')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'customers' }, triggerSync)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'store_orders' }, triggerSync)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'customer_enquiries' }, triggerSync)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'customer_projects' }, triggerSync)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'admin_notifications' }, triggerSync)
          .subscribe((status) => {
            if (active && status === 'SUBSCRIBED') setRealtimeActive(true);
          })
      : null;

    return () => {
      active = false;
      if (debounceTimer) clearTimeout(debounceTimer);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (streamController) streamController.abort();
      if (channel && sb) sb.removeChannel(channel).catch(() => {});
    };
  }, [isSignedIn, isAdmin, getIdToken]);

  const loadInvoicesReport = useCallback(async () => {
    if (!isSignedIn || !isAdmin || tab !== 'payments_invoices') return;
    setInvoiceReportLoading(true);
    try {
      const qs = new URLSearchParams();
      if (invoiceSearch.trim()) qs.set('search', invoiceSearch.trim());
      if (invoicePayFilter !== 'all') qs.set('paymentStatus', invoicePayFilter);
      if (invoiceDateFrom) qs.set('dateFrom', invoiceDateFrom);
      if (invoiceDateTo) qs.set('dateTo', invoiceDateTo);
      qs.set('pageSize', '100');
      const res = await apiFetch<{ items: any[]; summary: any }>(`/api/admin/invoices/report?${qs.toString()}`);
      setInvoiceReportRows(res.items || []);
      if (res.summary) setInvoiceReportSummary(res.summary);
    } catch {
      // fallback to overview.invoices when offline
    } finally {
      setInvoiceReportLoading(false);
    }
  }, [isSignedIn, isAdmin, tab, invoiceSearch, invoicePayFilter, invoiceDateFrom, invoiceDateTo, apiFetch]);

  useEffect(() => {
    const t = setTimeout(() => {
      loadInvoicesReport();
    }, 180);
    return () => clearTimeout(t);
  }, [loadInvoicesReport, realtimeTick]);

  const jumpToCustomerProfile = useCallback((codeOrEmail: string) => {
    if (!codeOrEmail) return;
    setJumpToCustomerCode(codeOrEmail);
    setTab('customers');
  }, []);

  useEffect(() => {
    if (settings.navigationMenus?.header) setNavMenus(settings.navigationMenus.header);
    if (settings.servicesCatalog) setServicesCatalog(settings.servicesCatalog);
    if (settings.krashivantriCatalog) setKrashiCatalog(settings.krashivantriCatalog);
  }, [settings]);

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        String(p.brand || '').toLowerCase().includes(q)
    );
  }, [products, productSearch]);

  const filteredOrders = useMemo(() => {
    const all = overview?.storeOrders || [];
    const q = orderSearch.trim().toLowerCase();
    return all.filter((o: any) => {
      if (orderStatusFilter !== 'All' && o.orderStatus !== orderStatusFilter) return false;
      if (orderPaymentFilter !== 'all') {
        if (orderPaymentFilter === 'refunded') {
          if (o.refundStatus !== 'partial' && o.refundStatus !== 'full' && o.paymentStatus !== 'refunded') return false;
        } else if (o.paymentStatus !== orderPaymentFilter) {
          return false;
        }
      }
      if (orderDateFrom && String(o.createdAt || '').slice(0, 10) < orderDateFrom) return false;
      if (orderDateTo && String(o.createdAt || '').slice(0, 10) > orderDateTo) return false;
      if (!q) return true;
      const itemNames = (o.items || []).map((it: any) => it.name || '').join(' ');
      return (
        String(o.orderNumber || '').toLowerCase().includes(q) ||
        String(o.customerId || '').toLowerCase().includes(q) ||
        String(o.orderStatus || '').toLowerCase().includes(q) ||
        String(o.customerName || '').toLowerCase().includes(q) ||
        String(o.customerEmail || '').toLowerCase().includes(q) ||
        String(o.customerPhone || '').toLowerCase().includes(q) ||
        String(o.shippingAddress?.fullName || '').toLowerCase().includes(q) ||
        itemNames.toLowerCase().includes(q)
      );
    });
  }, [overview?.storeOrders, orderSearch, orderStatusFilter, orderPaymentFilter, orderDateFrom, orderDateTo]);

  useEffect(() => {
    setOrderPage(1);
  }, [orderSearch, orderStatusFilter, orderPaymentFilter, orderDateFrom, orderDateTo]);

  if (!isSignedIn) {
    return (
      <div className="max-w-xl mx-auto px-4 py-20 text-center space-y-5">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-[#F0F8FF] border border-[#DCEAF5] p-3 flex items-center justify-center shadow-sm">
          <img src={COMPANY_LOGO} alt="NexusTekFusion Logo" className="w-full h-full object-contain" />
        </div>
        <h1 className="font-display text-3xl font-bold text-[#123B5D]">NexusTekFusion Admin Console</h1>
        <p className="text-sm text-[#263746]/80">
          Sign in with your administrator email &amp; password or authorized Google Admin account.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <button
            onClick={() => navigate('/admin/login')}
            className="px-6 py-3 bg-[#64B5F6] hover:bg-[#42A5F5] text-white rounded-lg text-sm font-semibold transition-colors"
          >
            Admin Credential Login
          </button>
          <button
            onClick={() => signInWithSupabaseOAuth('/admin')}
            className="px-6 py-3 border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] rounded-lg text-sm font-semibold transition-colors"
          >
            Google Admin Sign In
          </button>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    const safeDestination = getDashboardRouteForRole(dbUser?.role);
    return (
      <div className="max-w-xl mx-auto px-4 py-20 text-center space-y-4">
        <ShieldCheck className="w-10 h-10 text-red-600 mx-auto" />
        <h1 className="font-display text-2xl font-bold text-[#123B5D]">Admin Access Restricted</h1>
        <p className="text-sm text-[#263746]/80">
          Account <span className="font-mono">{dbUser?.email}</span> holds role{' '}
          <span className="font-mono font-semibold">{dbUser?.role}</span>.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <button
            onClick={() => navigate(safeDestination)}
            className="px-5 py-2.5 bg-[#42A5F5] hover:bg-[#1E88E5] text-white rounded-lg text-xs font-semibold transition-colors"
          >
            Return to My Dashboard
          </button>
        </div>
      </div>
    );
  }

  const downloadAuthorizedCsv = async (url: string, filename: string) => {
    try {
      const headers = new Headers();
      const token = await getIdToken();
      if (token) {
        headers.set('Authorization', `Bearer ${token}`);
      }
      const resp = await fetch(url, { headers, credentials: 'same-origin' });
      if (!resp.ok) throw new Error('Export failed.');
      const blob = await resp.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objUrl);
    } catch (err: any) {
      notify(err?.message || 'Unable to download CSV.', 'error');
    }
  };

  const downloadAdminCloudInvoicePdf = async (inv: any) => {
    try {
      const token = await getIdToken();
      const headers = new Headers();
      if (token) headers.set('Authorization', `Bearer ${token}`);
      const resp = await fetch(`/api/admin/invoices/${inv.id}/download`, {
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
        throw new Error(errData.error || 'Failed to download cloud invoice PDF.');
      }
    } catch (err: any) {
      notify(err?.message || 'Fetching generated cloud invoice PDF...', 'info');
    }
    await downloadInvoicePdf({
      invoiceNumber: inv.invoiceNumber,
      docType: inv.docType,
      entityType: inv.entityType,
      amountInr: inv.amountInr,
      gstInr: inv.gstInr,
      issuedAt: inv.issuedAt,
      customerEmail: inv.customerEmail || inv.payload?.customerEmail || '',
      gstin:
        settings.projectSettings?.enableGstTax && settings.companyInfo?.gstin
          ? settings.companyInfo.gstin
          : undefined,
      payload: inv.payload || {},
    });
  };

  const openEditProduct = (p: any) => {
    const tech = (p.technicalSpecs || {}) as Record<string, string>;
    const krashiSpecs: Record<string, string> = { ...EMPTY_KRASHI_SPECS };
    for (const k of KRASHI_SPEC_KEYS) {
      krashiSpecs[k] = String(tech[k] || '');
    }
    const specsLines = Object.entries(tech)
      .filter(([k]) => !KRASHI_SPEC_KEYS.includes(k as (typeof KRASHI_SPEC_KEYS)[number]))
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n');
    setProdDraft({
      id: p.id,
      name: p.name || '',
      sku: p.sku || '',
      hsnCode: p.hsnCode || (String(p.slug || '').startsWith('krashivantri') ? '8806' : '8807'),
      modelNumber: p.modelNumber || '',
      brand: p.brand || 'NexusTekFusion',
      categoryId: p.categoryId ? String(p.categoryId) : '',
      subcategory: p.subcategory || '',
      storeScope: p.storeScope === '3d_printed' ? '3d_printed' : 'general',
      productType: (p.productType || 'simple') as any,
      status: (p.status || (p.isPublished ? 'published' : 'draft')) as any,
      shortDescription: p.shortDescription || '',
      description: p.description || '',
      featuresText: (p.features || []).join('\n'),
      specsText: specsLines,
      krashiSpecs,
      priceInr: String(p.priceInr ?? 0),
      discountPriceInr: p.discountPriceInr ? String(p.discountPriceInr) : '',
      gstPercent: String(p.gstPercent ?? 18),
      stockQty: String(p.stockQty ?? 0),
      lowStockThreshold: String(p.lowStockThreshold ?? 5),
      dimensions: p.dimensions || '',
      weightGrams: String(p.weightGrams ?? 0),
      shippingWeightGrams: String(p.shippingWeightGrams ?? 0),
      deliveryInfo: p.deliveryInfo || '',
      material: p.material || '',
      availableVariantsText: (p.availableVariants || []).join(', '),
      availableColorsText: (p.availableColors || []).join(', '),
      packageContentsText: (p.packageContents || []).join('\n'),
      compatibility: p.compatibility || '',
      applications: p.applications || '',
      imageUrl: p.imageUrl || '/src/assets/images/service_pcb_electronics_1794981062614.jpg',
      galleryUrlsText: (p.galleryUrls || []).join('\n'),
      brochureUrl: p.brochureUrl || '',
      datasheetUrl: p.datasheetUrl || '',
      model3dUrl: p.model3dUrl || '',
      videoUrl: p.videoUrl || '',
      seoTitle: p.seoTitle || '',
      seoDescription: p.seoDescription || '',
      isFeatured: Boolean(p.isFeatured),
      isBestseller: Boolean(p.isBestseller),
      isNewArrival: Boolean(p.isNewArrival),
    });
    setShowProdForm(true);
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    const technicalSpecs: Record<string, string> = {};
    for (const line of prodDraft.specsText.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const idx = trimmed.indexOf(':');
      if (idx > 0) {
        technicalSpecs[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
      }
    }
    const isKrashiDrone =
      prodDraft.brand.trim().toUpperCase() === 'KRASHIVANTRI' ||
      prodDraft.name.toUpperCase().includes('KRASHIVANTRI');
    for (const k of KRASHI_SPEC_KEYS) {
      const val = (prodDraft.krashiSpecs?.[k] || '').trim();
      if (val) {
        technicalSpecs[k] = val;
      } else if (isKrashiDrone) {
        technicalSpecs[k] = 'Official Specification on Briefing';
      }
    }
    const payload = {
      name: prodDraft.name.trim(),
      sku: prodDraft.sku.trim().toUpperCase(),
      hsnCode: prodDraft.hsnCode.trim() || '8807',
      modelNumber: prodDraft.modelNumber.trim(),
      brand: prodDraft.brand.trim() || 'NexusTekFusion',
      categoryId: prodDraft.categoryId ? Number(prodDraft.categoryId) : null,
      subcategory: prodDraft.subcategory.trim(),
      storeScope: prodDraft.storeScope,
      productType: prodDraft.productType,
      status: prodDraft.status,
      isPublished: prodDraft.status !== 'draft',
      shortDescription: prodDraft.shortDescription.trim(),
      description: prodDraft.description,
      features: prodDraft.featuresText.split('\n').map((s) => s.trim()).filter(Boolean),
      technicalSpecs,
      priceInr: Number(prodDraft.priceInr || 0),
      discountPriceInr: prodDraft.discountPriceInr ? Number(prodDraft.discountPriceInr) : null,
      gstPercent: Number(prodDraft.gstPercent || 18),
      stockQty: Number(prodDraft.stockQty || 0),
      lowStockThreshold: Number(prodDraft.lowStockThreshold || 5),
      dimensions: prodDraft.dimensions,
      weightGrams: Number(prodDraft.weightGrams || 0),
      shippingWeightGrams: Number(prodDraft.shippingWeightGrams || 0),
      deliveryInfo: prodDraft.deliveryInfo,
      material: prodDraft.material,
      availableVariants: prodDraft.availableVariantsText.split(',').map((s) => s.trim()).filter(Boolean),
      availableColors: prodDraft.availableColorsText.split(',').map((s) => s.trim()).filter(Boolean),
      packageContents: prodDraft.packageContentsText.split('\n').map((s) => s.trim()).filter(Boolean),
      compatibility: prodDraft.compatibility,
      applications: prodDraft.applications,
      imageUrl: prodDraft.imageUrl.trim(),
      galleryUrls: prodDraft.galleryUrlsText.split('\n').map((s) => s.trim()).filter(Boolean),
      brochureUrl: prodDraft.brochureUrl.trim(),
      datasheetUrl: prodDraft.datasheetUrl.trim(),
      model3dUrl: prodDraft.model3dUrl.trim(),
      videoUrl: prodDraft.videoUrl.trim(),
      seoTitle: prodDraft.seoTitle.trim(),
      seoDescription: prodDraft.seoDescription.trim(),
      isFeatured: prodDraft.isFeatured,
      isBestseller: prodDraft.isBestseller,
      isNewArrival: prodDraft.isNewArrival,
    };
    try {
      if (prodDraft.id) {
        await apiFetch(`/api/admin/products/${prodDraft.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        notify(`Updated product "${payload.name}".`, 'success');
      } else {
        await apiFetch('/api/admin/products', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        notify(`Created product "${payload.name}".`, 'success');
      }
      setProdDraft(EMPTY_PRODUCT);
      setShowProdForm(false);
      loadAll();
      refreshBootstrap();
    } catch (err: any) {
      notify(err?.message || 'Failed to save product.', 'error');
    }
  };

  const handleUpdateOrderTracking = async (endpoint: string, body: Record<string, unknown>) => {
    try {
      await apiFetch(endpoint, { method: 'PATCH', body: JSON.stringify(body) });
      notify('Updated record.', 'success');
      loadAll();
    } catch (err: any) {
      notify(err?.message || 'Update failed.', 'error');
    }
  };

  const handleAdjustStock = async (productId: number) => {
    const entry = stockAdjustMap[productId] || { delta: '0', reason: '' };
    const deltaQty = Math.trunc(Number(entry.delta || 0));
    if (!deltaQty) {
      notify('Enter a positive or negative quantity delta.', 'error');
      return;
    }
    try {
      await apiFetch('/api/admin/inventory/adjust', {
        method: 'POST',
        body: JSON.stringify({
          productId,
          deltaQty,
          reason: entry.reason || 'Admin Manual Adjustment',
        }),
      });
      setStockAdjustMap((prev) => ({ ...prev, [productId]: { delta: '', reason: '' } }));
      notify('Inventory updated and logged.', 'success');
      loadAll();
    } catch (err: any) {
      notify(err?.message || 'Stock adjustment failed.', 'error');
    }
  };

  const handleCsvImport = async () => {
    if (!csvImportText.trim()) return;
    setImportingCsv(true);
    try {
      const res = await apiFetch<{ createdCount: number; updatedCount: number }>(
        '/api/admin/products/csv-import',
        { method: 'POST', body: JSON.stringify({ csvText: csvImportText }) }
      );
      notify(`CSV processed: ${res.createdCount} created, ${res.updatedCount} updated.`, 'success');
      setCsvImportText('');
      loadAll();
      refreshBootstrap();
    } catch (err: any) {
      notify(err?.message || 'CSV import failed.', 'error');
    } finally {
      setImportingCsv(false);
    }
  };

  const quoteCategorySum = Object.values(costCategories).reduce((s, n) => s + Number(n || 0), 0);
  const quoteItemsSum = quoteItems.reduce(
    (s, it) => s + Math.max(1, Number(it.qty || 1)) * Number(it.unitPriceInr || 0),
    0
  );
  const computedQuoteTotal = Math.max(
    1,
    quoteCategorySum + quoteItemsSum + Number(quoteMeta.gstInr || 0) - Number(quoteMeta.discountInr || 0)
  );
  const computedAdvanceInr = Math.round((computedQuoteTotal * Number(quoteMeta.advancePercent || 50)) / 100);

  const downloadAdminProtectedFile = async (storagePath: string, fileName: string) => {
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

  const handleSubmitQuotation = async (saveAsDraft: boolean) => {
    if (!quoteEnquiryId) return;
    try {
      const payload = {
        enquiryId: quoteEnquiryId,
        items: quoteItems.filter((it) => it.name.trim()),
        costCategories,
        ...quoteMeta,
        publish: !saveAsDraft,
        saveAsDraft,
      };
      if (editingQuotationId > 0) {
        await apiFetch(`/api/admin/quotations/${editingQuotationId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        notify(
          saveAsDraft ? 'Draft quotation updated (hidden from customer).' : 'Quotation updated & published to customer.',
          'success'
        );
      } else {
        await apiFetch('/api/admin/quotations', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        notify(
          saveAsDraft ? 'Draft quotation saved (hidden from customer).' : 'Quotation approved & published to customer.',
          'success'
        );
      }
      setQuoteEnquiryId(0);
      setEditingQuotationId(0);
      setQuoteItems([]);
      setCostCategories(INITIAL_COST_CATEGORIES);
      loadAll();
    } catch (err: any) {
      notify(err?.message || 'Failed to save quotation.', 'error');
    }
  };

  const handlePublishDraftQuotation = async (quotationId: number) => {
    try {
      await apiFetch(`/api/admin/quotations/${quotationId}/publish`, { method: 'POST' });
      notify('Quotation approved & published to customer dashboard.', 'success');
      loadAll();
    } catch (err: any) {
      notify(err?.message || 'Failed to publish quotation.', 'error');
    }
  };

  const handleAdminSendMessage = async (enquiryId: number) => {
    const message = (adminMsgMap[enquiryId] || '').trim();
    const attached = adminMsgFilesMap[enquiryId] || [];
    if (!message && attached.length === 0) {
      notify('Enter a message or attach files.', 'error');
      return;
    }
    try {
      const fd = new FormData();
      fd.append('message', message || 'Please review attached notes.');
      attached.forEach((f) => fd.append('attachments', f));
      await apiFetch(`/api/admin/project-enquiries/${enquiryId}/messages`, {
        method: 'POST',
        body: fd,
      });
      setAdminMsgMap((prev) => ({ ...prev, [enquiryId]: '' }));
      setAdminMsgFilesMap((prev) => ({ ...prev, [enquiryId]: [] }));
      notify('Message sent to customer.', 'success');
      loadAll();
    } catch (err: any) {
      notify(err?.message || 'Failed to send message.', 'error');
    }
  };

  const handlePostProgressUpdate = async (projectId: number) => {
    const f = progUpdateFormMap[projectId] || {
      category: 'Hardware Design',
      title: '',
      description: '',
      progressPercentage: 25,
      adminComments: '',
      nextStatus: '',
    };
    if (!f.title.trim() || !f.description.trim()) {
      notify('Update title and description are required.', 'error');
      return;
    }
    try {
      const files = progUpdateFilesMap[projectId] || { photos: [], videos: [], reports: [] };
      const fd = new FormData();
      fd.append('category', f.category);
      fd.append('title', f.title);
      fd.append('description', f.description);
      fd.append('progressPercentage', String(f.progressPercentage));
      fd.append('adminComments', f.adminComments || '');
      if (f.nextStatus) fd.append('nextStatus', f.nextStatus);
      files.photos.forEach((p) => fd.append('photos', p));
      files.videos.forEach((v) => fd.append('videos', v));
      files.reports.forEach((r) => fd.append('reports', r));

      await apiFetch(`/api/admin/projects/${projectId}/progress-updates`, {
        method: 'POST',
        body: fd,
      });
      setProgUpdateOpenId(0);
      setProgUpdateFilesMap((prev) => ({ ...prev, [projectId]: { photos: [], videos: [], reports: [] } }));
      notify('Progress update published to customer dashboard.', 'success');
      loadAll();
    } catch (err: any) {
      notify(err?.message || 'Failed to post progress update.', 'error');
    }
  };

  const handleCompleteProject = async (projectId: number) => {
    const c = completeProofMap[projectId] || { notes: '', files: [] };
    try {
      const fd = new FormData();
      fd.append('notes', c.notes || 'Engineering build, testing, and documentation completed.');
      c.files.forEach((f) => fd.append('proofFiles', f));
      await apiFetch(`/api/admin/projects/${projectId}/complete`, {
        method: 'POST',
        body: fd,
      });
      setCompleteOpenId(0);
      setCompleteProofMap((prev) => ({ ...prev, [projectId]: { notes: '', files: [] } }));
      notify('Project marked completed! Remaining balance notification sent if pending.', 'success');
      loadAll();
    } catch (err: any) {
      notify(err?.message || 'Failed to mark project completed.', 'error');
    }
  };

  const SIDEBAR_GROUPS: Array<{
    group: string;
    items: Array<{ id: AdminTab; label: string; icon: React.ReactNode }>;
  }> = [
    {
      group: 'Dashboard',
      items: [
        { id: 'overview', label: 'Overview & Analytics', icon: <LayoutDashboard className="w-4 h-4" /> },
        { id: 'customers', label: 'Customer Directory', icon: <Users className="w-4 h-4" /> },
        { id: 'enquiries', label: 'All Enquiries', icon: <MessageSquare className="w-4 h-4" /> },
      ],
    },
    {
      group: 'Website & CMS',
      items: [
        { id: 'website_cms', label: 'Pages, Menus & Studio', icon: <Globe className="w-4 h-4" /> },
        { id: 'about_team', label: 'Team & CEO Profiles', icon: <Users className="w-4 h-4" /> },
        { id: 'krashivantri_cms', label: 'KRASHIVANTRI CMS', icon: <Send className="w-4 h-4" /> },
        { id: 'cms_services', label: 'Services Content CMS', icon: <Wrench className="w-4 h-4" /> },
        { id: 'cms_projects', label: 'Project Gallery CMS', icon: <Cpu className="w-4 h-4" /> },
        { id: 'cms_store_content', label: 'Store Banners & Copy', icon: <ShoppingBag className="w-4 h-4" /> },
        { id: 'cms_banners', label: 'Promotional Banners', icon: <ImageIcon className="w-4 h-4" /> },
        { id: 'cms_contact_footer', label: 'Contact, Social & Footer', icon: <MessageSquare className="w-4 h-4" /> },
        { id: 'cms_seo', label: 'SEO & Social Cards', icon: <Search className="w-4 h-4" /> },
        { id: 'media_library', label: 'Media Library', icon: <ImageIcon className="w-4 h-4" /> },
      ],
    },
    {
      group: 'WooCommerce Store',
      items: [
        { id: 'store_products', label: 'Products & CSV', icon: <Package className="w-4 h-4" /> },
        { id: 'categories_brands', label: 'Categories & Brands', icon: <Tags className="w-4 h-4" /> },
        { id: 'inventory', label: 'Inventory & Stock', icon: <Boxes className="w-4 h-4" /> },
        { id: 'store_orders', label: 'Orders & Slips', icon: <ShoppingBag className="w-4 h-4" /> },
        { id: 'coupons', label: 'Coupons', icon: <Ticket className="w-4 h-4" /> },
      ],
    },
    {
      group: 'Engineering & Lab',
      items: [
        { id: 'projects', label: 'Projects & Quotations', icon: <Wrench className="w-4 h-4" /> },
        { id: 'project_finance', label: 'Project Finance & Dues', icon: <CreditCard className="w-4 h-4" /> },
        { id: 'project_payment_settings', label: 'Project Split & Emails', icon: <Settings className="w-4 h-4" /> },
        { id: 'printing', label: '3D Printing Lab', icon: <Printer className="w-4 h-4" /> },
        { id: 'pcb_b2b', label: 'PCB & B2B Quotes', icon: <Cpu className="w-4 h-4" /> },
      ],
    },
    {
      group: 'KRASHIVANTRI Drone Ops',
      items: [
        { id: 'product_enquiries', label: 'Drone Enquiries', icon: <MessageSquare className="w-4 h-4" /> },
        { id: 'krash_farmers', label: 'Farmers & Farms KYC', icon: <Users className="w-4 h-4" /> },
        { id: 'krash_pilots', label: 'Drone Pilots & Drones', icon: <ShieldCheck className="w-4 h-4" /> },
        { id: 'krash_live_tracking', label: 'Live GPS Tracking', icon: <Globe className="w-4 h-4" /> },
        { id: 'krash_orders_live', label: 'Bookings & Dispatch', icon: <Send className="w-4 h-4" /> },
        { id: 'krash_farmer_payments', label: 'Farmer Payments & Refunds', icon: <CreditCard className="w-4 h-4" /> },
        { id: 'krash_pilot_payouts', label: 'Pilot Payouts', icon: <Briefcase className="w-4 h-4" /> },
        { id: 'krash_penalties', label: 'Penalties & Appeals', icon: <AlertTriangle className="w-4 h-4" /> },
        { id: 'krash_finance', label: 'Ops Finance & Config', icon: <FileSpreadsheet className="w-4 h-4" /> },
      ],
    },
    {
      group: 'CRM, Content & Finance',
      items: [
        { id: 'customers', label: 'Customer Management', icon: <Users className="w-4 h-4" /> },
        { id: 'crm', label: 'CRM Leads Pipeline', icon: <Briefcase className="w-4 h-4" /> },
        { id: 'rd_projects', label: 'R&D Case Studies', icon: <FileText className="w-4 h-4" /> },
        { id: 'blogs', label: 'Engineering Blogs', icon: <FileText className="w-4 h-4" /> },
        { id: 'payments_invoices', label: 'Payments & Invoices', icon: <CreditCard className="w-4 h-4" /> },
        { id: 'support', label: 'Support & Drone Repairs', icon: <MessageSquare className="w-4 h-4" /> },
      ],
    },
    {
      group: 'System',
      items: [
        { id: 'users', label: 'Staff Roles & Password', icon: <Users className="w-4 h-4" /> },
        { id: 'settings', label: 'Company, Tax & Shipping', icon: <Settings className="w-4 h-4" /> },
        { id: 'audit', label: 'Audit Logs', icon: <History className="w-4 h-4" /> },
      ],
    },
  ];

  const activeDailySeries: Array<{ date: string; label: string; amountInr: number }> =
    overview?.analytics?.dailyRevenueSeries || [];
  const activeMonthlySeries: Array<{ month: string; label: string; amountInr: number }> =
    overview?.analytics?.monthlyRevenueSeries || [];
  const maxDaily = Math.max(1, ...activeDailySeries.map((d) => d.amountInr));
  const maxMonthly = Math.max(1, ...activeMonthlySeries.map((m) => m.amountInr));

  return (
    <div className="min-h-[85vh] bg-[#FFFFFF] flex flex-col lg:flex-row">
      {/* Mobile Sidebar Header */}
      <div className="lg:hidden bg-[#F0F8FF] text-[#123B5D] px-4 py-3 flex items-center justify-between border-b border-[#DCEAF5]">
        <div className="flex items-center gap-2.5">
          <img src={COMPANY_LOGO} alt="NexusTekFusion Logo" className="w-7 h-7 object-contain bg-white rounded border border-[#DCEAF5] p-0.5" />
          <span className="font-display font-bold text-sm text-[#123B5D]">NexusTekFusion Admin</span>
        </div>
        <button
          type="button"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="p-1.5 rounded-lg border border-[#90CAF9] bg-white text-[#123B5D]"
        >
          {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Left Navigation Sidebar */}
      <aside
        className={`${
          sidebarOpen ? 'block' : 'hidden'
        } lg:block w-full lg:w-64 shrink-0 bg-[#F0F8FF] text-[#263746] border-r border-[#DCEAF5] flex flex-col`}
      >
        <div className="hidden lg:flex items-center gap-3 px-5 py-5 border-b border-[#DCEAF5] bg-white">
          <div className="w-9 h-9 rounded-lg bg-[#F0F8FF] border border-[#DCEAF5] p-1 flex items-center justify-center shrink-0">
            <img src={COMPANY_LOGO} alt="NexusTekFusion" className="w-full h-full object-contain" />
          </div>
          <div className="min-w-0">
            <div className="font-display font-bold text-sm text-[#123B5D] truncate">NexusTekFusion</div>
            <div className="text-[11px] font-mono text-[#42A5F5] truncate">{dbUser?.role}</div>
          </div>
        </div>

        <nav className="p-3 space-y-5 flex-1 overflow-y-auto">
          {SIDEBAR_GROUPS.map((grp) => (
            <div key={grp.group} className="space-y-1">
              <div className="px-3 text-[10px] font-semibold uppercase tracking-wider text-[#123B5D]/60">
                {grp.group}
              </div>
              {grp.items.map((item) => {
                const active = tab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setTab(item.id);
                      setSidebarOpen(false);
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                      active
                        ? 'bg-[#64B5F6] text-white shadow-sm'
                        : 'text-[#263746] hover:bg-white hover:text-[#123B5D]'
                    }`}
                  >
                    {item.icon}
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="p-3 border-t border-[#DCEAF5] bg-white/70 space-y-2 text-xs">
          <button
            type="button"
            onClick={() => navigate('/admin/website-editor')}
            className="w-full py-2 px-3 rounded-lg bg-[#64B5F6] hover:bg-[#42A5F5] text-white font-semibold inline-flex items-center justify-center gap-1.5 transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" /> Visual Website Editor
          </button>
          <button
            type="button"
            onClick={signOut}
            className="w-full py-2 px-3 rounded-lg border border-[#90CAF9] bg-white text-[#123B5D] hover:bg-[#F0F8FF] inline-flex items-center justify-center gap-1.5 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" /> Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content Workspace */}
      <main className="flex-1 min-w-0 p-5 sm:p-8 space-y-6 bg-[#FFFFFF]">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#DCEAF5] pb-4">
          <div>
            <div className="text-[11px] font-semibold text-[#42A5F5] uppercase tracking-wider flex items-center gap-2">
              <span>Control Platform · {dbUser?.email}</span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#F0F8FF] border border-[#DCEAF5] text-[#123B5D] font-mono text-[10px]">
                <span className={`w-1.5 h-1.5 rounded-full ${realtimeActive ? 'bg-emerald-500' : 'bg-[#64B5F6]'}`} />
                {realtimeActive ? 'Realtime Synced' : 'Live Sync'}
              </span>
            </div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#123B5D]">
              {SIDEBAR_GROUPS.flatMap((g) => g.items).find((i) => i.id === tab)?.label || 'Admin Overview'}
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => loadAll(false)}
              className="px-3 py-2 border border-[#90CAF9] bg-white rounded-lg text-xs font-semibold text-[#123B5D] hover:bg-[#F0F8FF] inline-flex items-center gap-1.5 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5 text-[#42A5F5]" /> Sync Data
            </button>
            <AdminNotificationsPopover realtimeTick={realtimeTick} onNavigateTab={setTab} />
            <button
              type="button"
              onClick={() => navigate('/')}
              className="px-3.5 py-2 border border-[#90CAF9] bg-white rounded-lg text-xs font-semibold text-[#123B5D] hover:bg-[#F0F8FF] transition-colors"
            >
              View Live Storefront
            </button>
          </div>
        </div>

        {loading || !overview ? (
          <div className="py-12 text-sm text-[#263746]/70">Loading operational telemetry...</div>
        ) : (
          <div className="space-y-8">
            {/* ==================== OVERVIEW & ANALYTICS ==================== */}
            {tab === 'overview' && (
              <div className="space-y-6">
                {/* Date Range Filter Bar */}
                <div className="rounded-xl border border-[#DCEAF5] bg-[#F0F8FF]/60 p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div>
                    <div className="font-display font-bold text-sm text-[#123B5D]">
                      Real-Time Supabase Operational Overview
                    </div>
                    <div className="text-[#263746]/70">
                      Filter dashboard KPIs, order counts, enquiries, projects, invoices, and revenue by date range.
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="date"
                      value={overviewDateFrom}
                      onChange={(e) => setOverviewDateFrom(e.target.value)}
                      className="rounded-lg border border-[#DCEAF5] bg-white px-2.5 py-1.5 font-mono text-xs"
                    />
                    <span className="text-[#263746]/60">to</span>
                    <input
                      type="date"
                      value={overviewDateTo}
                      onChange={(e) => setOverviewDateTo(e.target.value)}
                      className="rounded-lg border border-[#DCEAF5] bg-white px-2.5 py-1.5 font-mono text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => loadAll(false, overviewDateFrom, overviewDateTo)}
                      className="px-3 py-1.5 rounded-lg bg-[#42A5F5] hover:bg-[#1E88E5] text-white font-semibold"
                    >
                      Apply Filter
                    </button>
                    {(overviewDateFrom || overviewDateTo) && (
                      <button
                        type="button"
                        onClick={() => {
                          setOverviewDateFrom('');
                          setOverviewDateTo('');
                          loadAll(false, '', '');
                        }}
                        className="px-3 py-1.5 rounded-lg border border-[#90CAF9] bg-white text-[#123B5D] font-semibold"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                </div>

                {/* Primary 15+ Live Supabase KPI Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                  {[
                    { label: 'Total Customers', val: overview.kpis.totalCustomers ?? 0, tabTarget: 'customers' as AdminTab },
                    { label: 'Total Registered Orders', val: overview.kpis.totalRegisteredOrders ?? overview.kpis.totalOrders ?? 0, tabTarget: 'store_orders' as AdminTab },
                    { label: 'New Orders', val: overview.kpis.newOrders ?? 0, tabTarget: 'store_orders' as AdminTab },
                    { label: 'Processing Orders', val: overview.kpis.processingOrders ?? 0, tabTarget: 'store_orders' as AdminTab },
                    { label: 'Completed Orders', val: overview.kpis.completedOrders ?? 0, tabTarget: 'store_orders' as AdminTab },
                    { label: 'Cancelled Orders', val: overview.kpis.cancelledOrders ?? 0, tabTarget: 'store_orders' as AdminTab },
                    { label: 'Total Enquiries', val: overview.kpis.totalEnquiries ?? 0, tabTarget: 'enquiries' as AdminTab },
                    { label: 'New Enquiries', val: overview.kpis.newEnquiries ?? 0, tabTarget: 'enquiries' as AdminTab },
                    { label: 'Pending Enquiries', val: overview.kpis.pendingEnquiries ?? 0, tabTarget: 'enquiries' as AdminTab },
                    { label: 'Responded Enquiries', val: overview.kpis.respondedEnquiries ?? 0, tabTarget: 'enquiries' as AdminTab },
                    { label: 'Total Engineering Projects', val: overview.kpis.totalEngineeringProjects ?? 0, tabTarget: 'projects' as AdminTab },
                    { label: 'Active Projects', val: overview.kpis.activeProjects ?? 0, tabTarget: 'projects' as AdminTab },
                    { label: 'Completed Projects', val: overview.kpis.completedProjects ?? 0, tabTarget: 'projects' as AdminTab },
                    { label: 'Total Invoices', val: overview.kpis.totalInvoices ?? 0, tabTarget: 'payments_invoices' as AdminTab },
                    { label: 'Total Revenue', val: `₹${(overview.kpis.totalRevenueInr ?? 0).toLocaleString('en-IN')}`, tabTarget: 'payments_invoices' as AdminTab },
                  ].map((card) => (
                    <button
                      key={card.label}
                      type="button"
                      onClick={() => setTab(card.tabTarget)}
                      className="text-left rounded-xl border border-[#DCEAF5] bg-[#F0F8FF]/60 hover:bg-[#EAF5FF] p-4 space-y-1 transition-colors"
                    >
                      <div className="text-[11px] text-[#263746]/75 font-medium">{card.label}</div>
                      <div className="font-mono text-lg font-bold text-[#123B5D] tabular-nums truncate">{card.val}</div>
                    </button>
                  ))}
                </div>

                {/* Secondary Revenue & Operational Strip */}
                <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                  {[
                    ['Today Revenue', `₹${(overview.kpis.todayRevenueInr ?? 0).toLocaleString('en-IN')}`],
                    ['This Month Revenue', `₹${(overview.kpis.monthRevenueInr ?? 0).toLocaleString('en-IN')}`],
                    ['Annual Revenue', `₹${(overview.kpis.annualRevenueInr ?? 0).toLocaleString('en-IN')}`],
                    ['Pending Payments', `₹${(overview.kpis.pendingPaymentsInr ?? 0).toLocaleString('en-IN')}`],
                    ['Open CRM Leads', overview.kpis.openLeadsCount ?? 0],
                    ['Low-Stock SKUs', overview.kpis.lowStockCount ?? 0],
                  ].map(([label, val]) => (
                    <div key={String(label)} className="rounded-xl border border-[#DCEAF5] bg-white p-3.5 space-y-0.5">
                      <div className="text-[11px] text-[#263746]/70">{label}</div>
                      <div className="font-mono text-base font-bold text-[#123B5D] tabular-nums truncate">{val}</div>
                    </div>
                  ))}
                </div>

                {/* SVG Revenue & Customer Registration Charts */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                  <div className="rounded-xl border border-[#DCEAF5] bg-white p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <h2 className="font-display font-bold text-sm text-[#123B5D]">Daily Revenue (14 Days)</h2>
                      <span className="font-mono text-[11px] text-[#263746]/70">INR Verified</span>
                    </div>
                    <svg viewBox="0 0 420 130" className="w-full h-36">
                      {activeDailySeries.map((d, i) => {
                        const barH = Math.max(3, Math.round((d.amountInr / maxDaily) * 90));
                        const x = i * 30 + 6;
                        return (
                          <g key={d.date}>
                            <rect
                              x={x}
                              y={102 - barH}
                              width={18}
                              height={barH}
                              rx={3}
                              fill={d.amountInr > 0 ? '#64B5F6' : '#DCEAF5'}
                            >
                              <title>{`${d.label}: ₹${d.amountInr.toLocaleString('en-IN')}`}</title>
                            </rect>
                            {i % 3 === 0 && (
                              <text x={x + 9} y={120} textAnchor="middle" fontSize="8" fill="#263746">
                                {d.label}
                              </text>
                            )}
                          </g>
                        );
                      })}
                    </svg>
                  </div>

                  <div className="rounded-xl border border-[#DCEAF5] bg-white p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <h2 className="font-display font-bold text-sm text-[#123B5D]">Monthly Revenue (6 Months)</h2>
                      <span className="font-mono text-[11px] text-[#263746]/70">INR Verified</span>
                    </div>
                    <svg viewBox="0 0 360 130" className="w-full h-36">
                      {activeMonthlySeries.map((m, i) => {
                        const barH = Math.max(4, Math.round((m.amountInr / maxMonthly) * 90));
                        const x = i * 58 + 14;
                        return (
                          <g key={m.month}>
                            <rect
                              x={x}
                              y={102 - barH}
                              width={32}
                              height={barH}
                              rx={4}
                              fill={m.amountInr > 0 ? '#42A5F5' : '#DCEAF5'}
                            >
                              <title>{`${m.label}: ₹${m.amountInr.toLocaleString('en-IN')}`}</title>
                            </rect>
                            <text x={x + 16} y={120} textAnchor="middle" fontSize="9" fill="#263746">
                              {m.label}
                            </text>
                          </g>
                        );
                      })}
                    </svg>
                  </div>

                  <div className="rounded-xl border border-[#DCEAF5] bg-white p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <h2 className="font-display font-bold text-sm text-[#123B5D]">Customer Signups (14 Days)</h2>
                      <span className="font-mono text-[11px] text-[#263746]/70">Daily Count</span>
                    </div>
                    {(() => {
                      const regSeries: Array<{ date: string; label: string; count: number }> =
                        overview?.analytics?.customerRegistrationSeries || [];
                      const maxReg = Math.max(1, ...regSeries.map((r) => r.count));
                      return (
                        <svg viewBox="0 0 420 130" className="w-full h-36">
                          {regSeries.map((r, i) => {
                            const barH = Math.max(3, Math.round((r.count / maxReg) * 90));
                            const x = i * 30 + 6;
                            return (
                              <g key={r.date}>
                                <rect
                                  x={x}
                                  y={102 - barH}
                                  width={18}
                                  height={barH}
                                  rx={3}
                                  fill={r.count > 0 ? '#1E88E5' : '#DCEAF5'}
                                >
                                  <title>{`${r.label}: ${r.count} customer(s)`}</title>
                                </rect>
                                {i % 3 === 0 && (
                                  <text x={x + 9} y={120} textAnchor="middle" fontSize="8" fill="#263746">
                                    {r.label}
                                  </text>
                                )}
                              </g>
                            );
                          })}
                        </svg>
                      );
                    })()}
                  </div>
                </div>

                {/* Order & Enquiry Summaries */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="rounded-xl border border-[#DCEAF5] bg-white p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <h2 className="font-display font-bold text-sm text-[#123B5D]">Order Status Summary</h2>
                      <button type="button" onClick={() => setTab('store_orders')} className="text-xs font-semibold text-[#1E88E5] hover:underline">
                        Open Orders Desk
                      </button>
                    </div>
                    {(overview.analytics?.orderStatusBreakdown || []).length === 0 ? (
                      <p className="text-xs text-[#263746]/70">No orders placed in this range.</p>
                    ) : (
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        {(overview.analytics?.orderStatusBreakdown || []).map((row: any) => (
                          <div key={row.status} className="flex items-center justify-between rounded-lg bg-[#F0F8FF]/60 border border-[#DCEAF5] px-3 py-2">
                            <span className="font-medium text-[#123B5D] truncate">{row.status}</span>
                            <span className="font-mono font-bold text-[#1E88E5]">{row.count}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="rounded-xl border border-[#DCEAF5] bg-white p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <h2 className="font-display font-bold text-sm text-[#123B5D]">Enquiry Summary by Channel</h2>
                      <button type="button" onClick={() => setTab('enquiries')} className="text-xs font-semibold text-[#1E88E5] hover:underline">
                        Open All Enquiries
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {(overview.analytics?.enquiryCategoryBreakdown || []).map((row: any) => (
                        <div key={row.category} className="flex items-center justify-between rounded-lg bg-[#F0F8FF]/60 border border-[#DCEAF5] px-3 py-2">
                          <span className="font-medium text-[#123B5D] truncate">{row.category}</span>
                          <span className="font-mono font-bold text-[#1E88E5]">{row.count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Revenue by Category + Operational Exports */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  <div className="lg:col-span-5 rounded-xl border border-[#DCEAF5] bg-white p-5 space-y-3">
                    <h2 className="font-display font-bold text-sm text-[#123B5D]">Revenue Breakdown by Stream</h2>
                    {(overview.analytics?.revenueByCategory || []).length === 0 ? (
                      <p className="text-xs text-[#263746]/70">Revenue stream breakdown updates automatically as payments verify.</p>
                    ) : (
                      <div className="space-y-2 text-xs">
                        {(overview.analytics?.revenueByCategory || []).map((rc: any) => (
                          <div key={rc.category} className="flex justify-between border-b border-[#DCEAF5] pb-1.5">
                            <span className="text-[#263746] font-medium">{rc.category}</span>
                            <span className="font-mono font-bold text-[#123B5D]">₹{rc.amountInr.toLocaleString('en-IN')}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="lg:col-span-7 rounded-xl border border-[#DCEAF5] bg-white p-5 space-y-3">
                    <div className="font-display font-bold text-sm text-[#123B5D] flex items-center gap-2">
                      <FileSpreadsheet className="w-4 h-4 text-[#42A5F5]" /> Operational Business Exports (CSV)
                    </div>
                    <p className="text-xs text-[#263746]/70">Download live PostgreSQL business ledgers directly.</p>
                    <div className="flex flex-wrap gap-2">
                      {[
                        ['orders', 'Store Orders CSV'],
                        ['3d-orders', '3D Printing Orders CSV'],
                        ['customers', 'Customers CSV'],
                        ['enquiries', 'Project Enquiries CSV'],
                        ['payments', 'Payments Ledger CSV'],
                        ['invoices', 'Invoices & Receipts CSV'],
                        ['newsletter', 'Newsletter CSV'],
                      ].map(([type, label]) => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => downloadAuthorizedCsv(`/api/admin/export/${type}`, `nexustekfusion-${type}.csv`)}
                          className="px-3 py-2 border border-[#DCEAF5] bg-[#F0F8FF] hover:bg-[#DCEAF5]/60 rounded-lg text-xs font-semibold text-[#123B5D] inline-flex items-center gap-1.5"
                        >
                          <Download className="w-3.5 h-3.5 text-[#42A5F5]" /> {label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {overview.lowStockProducts?.length > 0 && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 space-y-2">
                    <div className="font-display font-bold text-sm text-amber-950 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4" /> Low-Stock Inventory Alert
                    </div>
                    <div className="text-xs text-amber-900 flex flex-wrap gap-4">
                      {overview.lowStockProducts.map((p: any) => (
                        <span key={p.id} className="font-mono">{p.sku} ({p.name}): {p.stockQty} left</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ==================== WEBSITE CMS, MENUS & SERVICES ==================== */}
            {tab === 'website_cms' && (
              <div className="space-y-6 text-xs">
                <div className="rounded-xl border border-[#90CAF9] bg-[#F0F8FF] p-5 flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h2 className="font-display text-base font-bold text-[#123B5D]">
                      Visual Homepage Builder &amp; Custom CMS Landing Pages
                    </h2>
                    <p className="text-[#263746]/80 mt-0.5">
                      Drag/reorder homepage sections, preview Draft vs Live, and publish custom landing pages (/p/:slug).
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate('/admin/website-editor')}
                    className="px-4 py-2.5 bg-[#64B5F6] hover:bg-[#42A5F5] text-white rounded-lg font-semibold inline-flex items-center gap-1.5 transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> Launch Visual Editor
                  </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Header Navigation Menus */}
                  <div className="rounded-xl border border-[#DCEAF5] bg-white p-6 space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="font-display text-base font-bold text-[#123B5D]">Header Navigation Menus</h3>
                      <button
                        type="button"
                        onClick={() =>
                          setNavMenus([
                            ...navMenus,
                            { id: `m_${Date.now()}`, label: 'New Link', to: '/shop', visible: true, sortOrder: navMenus.length + 1 },
                          ])
                        }
                        className="px-3 py-1.5 border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] rounded-lg font-semibold inline-flex items-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" /> Add Link
                      </button>
                    </div>
                    <div className="space-y-3">
                      {navMenus.map((m, idx) => (
                        <div key={m.id} className="rounded-lg border border-[#DCEAF5] p-2.5 space-y-2 bg-[#F0F8FF]/60">
                          <div className="grid grid-cols-12 gap-2 items-center">
                            <input
                              value={m.label}
                              onChange={(e) =>
                                setNavMenus(navMenus.map((x, i) => (i === idx ? { ...x, label: e.target.value } : x)))
                              }
                              placeholder="Label"
                              className="col-span-4 rounded border border-[#DCEAF5] bg-white px-2.5 py-1.5"
                            />
                            <input
                              value={m.to}
                              onChange={(e) =>
                                setNavMenus(navMenus.map((x, i) => (i === idx ? { ...x, to: e.target.value } : x)))
                              }
                              placeholder="/path"
                              className="col-span-5 rounded border border-[#DCEAF5] bg-white px-2.5 py-1.5 font-mono"
                            />
                            <label className="col-span-2 flex items-center gap-1 text-[11px]">
                              <input
                                type="checkbox"
                                checked={m.visible}
                                onChange={(e) =>
                                  setNavMenus(navMenus.map((x, i) => (i === idx ? { ...x, visible: e.target.checked } : x)))
                                }
                              />
                              Show
                            </label>
                            <button
                              type="button"
                              onClick={() => setNavMenus(navMenus.filter((_, i) => i !== idx))}
                              className="col-span-1 text-red-600 p-1"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <div className="pl-3 space-y-1">
                            {(m.children || []).map((ch, cIdx) => (
                              <div key={ch.id || cIdx} className="grid grid-cols-12 gap-2 items-center">
                                <input
                                  value={ch.label}
                                  onChange={(e) =>
                                    setNavMenus(
                                      navMenus.map((x, i) =>
                                        i === idx
                                          ? {
                                              ...x,
                                              children: (x.children || []).map((c, j) =>
                                                j === cIdx ? { ...c, label: e.target.value } : c
                                              ),
                                            }
                                          : x
                                      )
                                    )
                                  }
                                  placeholder="Submenu label"
                                  className="col-span-5 rounded border border-[#DCEAF5] bg-white px-2 py-1 text-[11px]"
                                />
                                <input
                                  value={ch.to}
                                  onChange={(e) =>
                                    setNavMenus(
                                      navMenus.map((x, i) =>
                                        i === idx
                                          ? {
                                              ...x,
                                              children: (x.children || []).map((c, j) =>
                                                j === cIdx ? { ...c, to: e.target.value } : c
                                              ),
                                            }
                                          : x
                                      )
                                    )
                                  }
                                  placeholder="/subpath"
                                  className="col-span-6 rounded border border-[#DCEAF5] bg-white px-2 py-1 text-[11px] font-mono"
                                />
                                <button
                                  type="button"
                                  onClick={() =>
                                    setNavMenus(
                                      navMenus.map((x, i) =>
                                        i === idx
                                          ? { ...x, children: (x.children || []).filter((_, j) => j !== cIdx) }
                                          : x
                                      )
                                    )
                                  }
                                  className="col-span-1 text-red-600 p-0.5"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            ))}
                            <button
                              type="button"
                              onClick={() =>
                                setNavMenus(
                                  navMenus.map((x, i) =>
                                    i === idx
                                      ? {
                                          ...x,
                                          children: [
                                            ...(x.children || []),
                                            { id: `sub_${Date.now()}`, label: 'Sub-item', to: x.to },
                                          ],
                                        }
                                      : x
                                  )
                                )
                              }
                              className="text-[11px] font-semibold text-[#42A5F5] hover:underline"
                            >
                              + Add Dropdown Item
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        await apiFetch('/api/admin/settings/navigationMenus', {
                          method: 'PUT',
                          body: JSON.stringify({ value: { header: navMenus } }),
                        });
                        await refreshBootstrap();
                        notify('Navigation menus updated.', 'success');
                      }}
                      className="px-4 py-2 bg-[#64B5F6] hover:bg-[#42A5F5] text-white rounded-lg font-semibold transition-colors"
                    >
                      Save Header Menu
                    </button>
                  </div>

                  {/* Core Services Catalog Editor */}
                  <div className="rounded-xl border border-[#DCEAF5] bg-white p-6 space-y-4">
                    <h3 className="font-display text-base font-bold text-[#123B5D]">Homepage Core Services Catalog</h3>
                    <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                      {servicesCatalog.map((svc, idx) => (
                        <div key={svc.slug} className="rounded-lg border border-[#DCEAF5] bg-[#F0F8FF]/60 p-3 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-[11px] text-[#42A5F5]">/services/{svc.slug}</span>
                            <label className="flex items-center gap-1 text-[11px]">
                              <input
                                type="checkbox"
                                checked={svc.visible}
                                onChange={(e) =>
                                  setServicesCatalog(
                                    servicesCatalog.map((x, i) => (i === idx ? { ...x, visible: e.target.checked } : x))
                                  )
                                }
                              />
                              Visible
                            </label>
                          </div>
                          <input
                            value={svc.title}
                            onChange={(e) =>
                              setServicesCatalog(
                                servicesCatalog.map((x, i) => (i === idx ? { ...x, title: e.target.value } : x))
                              )
                            }
                            className="w-full rounded border border-[#DCEAF5] bg-white px-2.5 py-1.5 font-semibold"
                          />
                          <input
                            value={svc.shortDesc}
                            onChange={(e) =>
                              setServicesCatalog(
                                servicesCatalog.map((x, i) => (i === idx ? { ...x, shortDesc: e.target.value } : x))
                              )
                            }
                            className="w-full rounded border border-[#DCEAF5] bg-white px-2.5 py-1.5"
                          />
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        await apiFetch('/api/admin/settings/servicesCatalog', {
                          method: 'PUT',
                          body: JSON.stringify({ value: servicesCatalog }),
                        });
                        await refreshBootstrap();
                        notify('Services catalog updated.', 'success');
                      }}
                      className="px-4 py-2 bg-[#64B5F6] hover:bg-[#42A5F5] text-white rounded-lg font-semibold transition-colors"
                    >
                      Save Services Catalog
                    </button>
                  </div>
                </div>

                <MasterCmsStudioPanel initialSection="banners" />
              </div>
            )}

            {/* ==================== DEDICATED CMS SUB-SECTIONS ==================== */}
            {(tab === 'cms_banners' ||
              tab === 'cms_services' ||
              tab === 'cms_projects' ||
              tab === 'cms_store_content' ||
              tab === 'cms_contact_footer' ||
              tab === 'cms_seo') && (
              <MasterCmsStudioPanel
                initialSection={
                  (
                    {
                      cms_banners: 'banners',
                      cms_services: 'services',
                      cms_projects: 'project_gallery',
                      cms_store_content: 'store_content',
                      cms_contact_footer: 'contact_footer',
                      cms_seo: 'seo',
                    } as Record<string, CmsStudioSubSection>
                  )[tab] || 'banners'
                }
              />
            )}

            {/* ==================== KRASHIVANTRI DRONE ENQUIRIES ==================== */}
            {tab === 'product_enquiries' && (() => {
              const allEnq = overview.productEnquiries || [];
              const q = enquirySearch.trim().toLowerCase();
              const filteredEnq = allEnq.filter((enq: any) => {
                if (enquiryStatusFilter !== 'All' && enq.status !== enquiryStatusFilter) return false;
                if (!q) return true;
                return [
                  enq.enquiryNumber,
                  enq.referenceNumber,
                  enq.fullName,
                  enq.email,
                  enq.mobile,
                  enq.state,
                  enq.district,
                  enq.organizationOrFarmName,
                  enq.interestedProduct,
                  enq.intendedApplication,
                ]
                  .filter(Boolean)
                  .join(' ')
                  .toLowerCase()
                  .includes(q);
              });

              return (
                <div className="space-y-5 text-xs">
                  <div className="rounded-xl border border-[#DCEAF5] bg-white p-5 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h2 className="font-display text-lg font-bold text-[#123B5D]">
                          KRASHIVANTRI Drone Product Enquiries ({filteredEnq.length}/{allEnq.length})
                        </h2>
                        <p className="text-[#263746]/70">
                          Manage enquiries submitted from KRASHIVANTRI X, KRASHIVANTRI X PRO, and the institutional briefing form.
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {['All', 'New', 'Contacted', 'Quoted', 'In Discussion', 'Closed'].map((st) => (
                          <button
                            key={st}
                            type="button"
                            onClick={() => setEnquiryStatusFilter(st)}
                            className={`px-3 py-1.5 rounded-lg font-semibold whitespace-nowrap shrink-0 transition-colors ${
                              enquiryStatusFilter === st
                                ? 'bg-[#64B5F6] text-white'
                                : 'bg-[#F0F8FF] border border-[#DCEAF5] text-[#123B5D] hover:bg-[#DCEAF5]/60'
                            }`}
                          >
                            {st}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="relative max-w-md">
                      <Search className="w-4 h-4 text-[#42A5F5] absolute left-3 top-2.5" />
                      <input
                        placeholder="Search by NTF-DRN ref, name, email, phone, district, model..."
                        value={enquirySearch}
                        onChange={(e) => setEnquirySearch(e.target.value)}
                        className="w-full rounded-lg border border-[#DCEAF5] bg-white pl-9 pr-3 py-2"
                      />
                    </div>
                  </div>

                  {filteredEnq.length === 0 ? (
                    <div className="rounded-xl border border-[#DCEAF5] bg-white p-8 text-center text-[#263746]/70">
                      No drone product enquiries match your current filter.
                    </div>
                  ) : (
                    filteredEnq.map((enq: any) => {
                      const draft = enquiryEditMap[enq.id] || {
                        status: enq.status || 'New',
                        assignedStaff: enq.assignedStaff || '',
                        internalNotes: enq.internalNotes || '',
                      };
                      return (
                        <div key={enq.id} className="rounded-xl border border-[#DCEAF5] bg-white p-5 space-y-3">
                          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#DCEAF5] pb-3">
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-mono font-bold text-[#123B5D]">
                                  {enq.enquiryNumber || enq.referenceNumber || `ENQ-${enq.id}`}
                                </span>
                                <span>·</span>
                                <span className="font-semibold text-[#123B5D]">{enq.interestedProduct}</span>
                                <span>·</span>
                                <span className="font-mono text-[#263746]">Qty: {enq.quantity || 1}</span>
                              </div>
                              <div className="text-[#263746]">
                                <span className="font-semibold">{enq.fullName}</span> · {enq.mobile} · {enq.email}
                              </div>
                              <div className="text-[#263746]/70">
                                {enq.organizationOrFarmName ? `${enq.organizationOrFarmName} · ` : ''}
                                {[enq.district, enq.state].filter(Boolean).join(', ')} · Application: {enq.intendedApplication || 'General'}
                              </div>
                            </div>
                            <div className="text-right font-mono text-[11px] text-[#263746]/70">
                              <div>Status: <span className="font-semibold text-[#42A5F5]">{enq.status}</span></div>
                              <div>{new Date(enq.createdAt).toLocaleString('en-IN')}</div>
                            </div>
                          </div>

                          {enq.message && (
                            <p className="rounded-lg bg-[#F0F8FF] border border-[#DCEAF5] p-3 text-[#263746]">
                              {enq.message}
                            </p>
                          )}

                          <div className="grid grid-cols-1 md:grid-cols-4 gap-2.5">
                            <select
                              value={draft.status}
                              onChange={(e) =>
                                setEnquiryEditMap({
                                  ...enquiryEditMap,
                                  [enq.id]: { ...draft, status: e.target.value },
                                })
                              }
                              className="rounded-lg border border-[#DCEAF5] px-2.5 py-2 bg-white font-semibold"
                            >
                              {['New', 'Contacted', 'Quoted', 'In Discussion', 'Closed'].map((st) => (
                                <option key={st} value={st}>{st}</option>
                              ))}
                            </select>
                            <input
                              placeholder="Assign Staff / Engineer"
                              value={draft.assignedStaff}
                              onChange={(e) =>
                                setEnquiryEditMap({
                                  ...enquiryEditMap,
                                  [enq.id]: { ...draft, assignedStaff: e.target.value },
                                })
                              }
                              className="rounded-lg border border-[#DCEAF5] px-2.5 py-2"
                            />
                            <input
                              placeholder="Internal follow-up notes"
                              value={draft.internalNotes}
                              onChange={(e) =>
                                setEnquiryEditMap({
                                  ...enquiryEditMap,
                                  [enq.id]: { ...draft, internalNotes: e.target.value },
                                })
                              }
                              className="rounded-lg border border-[#DCEAF5] px-2.5 py-2"
                            />
                            <button
                              type="button"
                              onClick={() => handleUpdateOrderTracking(`/api/admin/product-enquiries/${enq.id}`, draft)}
                              className="px-4 py-2 bg-[#64B5F6] hover:bg-[#42A5F5] text-white rounded-lg font-semibold whitespace-nowrap shrink-0 transition-colors"
                            >
                              Save Enquiry
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              );
            })()}

            {/* ==================== ABOUT US TEAM MANAGEMENT ==================== */}
            {tab === 'about_team' && <AboutTeamAdminPanel />}

            {/* ==================== KRASHIVANTRI CMS & FLAGSHIPS ==================== */}
            {tab === 'krashivantri_cms' && (
              <div className="space-y-6 text-xs">
                <div className="rounded-xl border border-[#DCEAF5] bg-white p-6 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="font-display text-lg font-bold text-[#123B5D]">
                      KRASHIVANTRI Agricultural Drones CMS
                    </h2>
                    <button
                      type="button"
                      onClick={() => navigate('/krashivantri')}
                      className="px-3 py-1.5 border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] rounded-lg font-semibold inline-flex items-center gap-1 whitespace-nowrap shrink-0"
                    >
                      <ExternalLink className="w-3.5 h-3.5 text-[#42A5F5]" /> View /krashivantri
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="font-semibold text-[#263746]">Platform Name</label>
                      <input
                        value={krashiCatalog.platformName || ''}
                        onChange={(e) => setKrashiCatalog({ ...krashiCatalog, platformName: e.target.value })}
                        className="w-full rounded-lg border border-[#DCEAF5] px-3 py-2"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="font-semibold text-[#263746]">Banner Image URL</label>
                      <div className="flex gap-1.5">
                        <input
                          value={krashiCatalog.bannerImageUrl || ''}
                          onChange={(e) => setKrashiCatalog({ ...krashiCatalog, bannerImageUrl: e.target.value })}
                          className="flex-1 min-w-0 rounded-lg border border-[#DCEAF5] px-3 py-2 font-mono"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setKrashiPicker({
                              filterKind: 'image',
                              title: 'Select KRASHIVANTRI Banner Image',
                              onSelect: (url) => setKrashiCatalog((prev: any) => ({ ...prev, bannerImageUrl: url })),
                            })
                          }
                          className="px-3 py-2 border border-[#DCEAF5] rounded-lg bg-[#F0F8FF] hover:bg-[#DCEAF5]/60 text-[#123B5D] font-semibold whitespace-nowrap shrink-0"
                        >
                          Media
                        </button>
                      </div>
                    </div>
                    <div className="md:col-span-2 space-y-1">
                      <label className="font-semibold text-[#263746]">Platform Demonstration Video URL (.mp4 / .webm)</label>
                      <div className="flex gap-1.5">
                        <input
                          placeholder="Optional showcase video URL from Media Library"
                          value={krashiCatalog.bannerVideoUrl || ''}
                          onChange={(e) => setKrashiCatalog({ ...krashiCatalog, bannerVideoUrl: e.target.value })}
                          className="flex-1 min-w-0 rounded-lg border border-[#DCEAF5] px-3 py-2 font-mono"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setKrashiPicker({
                              filterKind: 'video',
                              title: 'Select KRASHIVANTRI Demo Video',
                              onSelect: (url) => setKrashiCatalog((prev: any) => ({ ...prev, bannerVideoUrl: url })),
                            })
                          }
                          className="px-3 py-2 border border-[#DCEAF5] rounded-lg bg-[#F0F8FF] hover:bg-[#DCEAF5]/60 text-[#123B5D] font-semibold whitespace-nowrap shrink-0"
                        >
                          Pick Video
                        </button>
                      </div>
                    </div>
                  </div>
                  <textarea
                    rows={2}
                    placeholder="Platform Summary"
                    value={krashiCatalog.summary || ''}
                    onChange={(e) => setKrashiCatalog({ ...krashiCatalog, summary: e.target.value })}
                    className="w-full rounded-lg border border-[#DCEAF5] px-3 py-2"
                  />

                  {(krashiCatalog.models || []).map((m: any, mIdx: number) => (
                    <div key={m.id} className="rounded-xl border border-[#DCEAF5] bg-[#F0F8FF]/60 p-4 space-y-3">
                      <div className="font-display font-bold text-sm text-[#123B5D]">{m.name}</div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <input
                          placeholder="Tagline"
                          value={m.tagline || ''}
                          onChange={(e) =>
                            setKrashiCatalog({
                              ...krashiCatalog,
                              models: krashiCatalog.models.map((x: any, i: number) =>
                                i === mIdx ? { ...x, tagline: e.target.value } : x
                              ),
                            })
                          }
                          className="rounded border border-[#DCEAF5] bg-white text-[#263746] px-3 py-2 focus:outline-none focus:border-[#64B5F6]"
                        />
                        <div className="flex gap-1.5">
                          <input
                            placeholder="Image URL"
                            value={m.imageUrl || ''}
                            onChange={(e) =>
                              setKrashiCatalog({
                                ...krashiCatalog,
                                models: krashiCatalog.models.map((x: any, i: number) =>
                                  i === mIdx ? { ...x, imageUrl: e.target.value } : x
                                ),
                              })
                            }
                            className="flex-1 min-w-0 rounded border border-[#DCEAF5] bg-white text-[#263746] px-3 py-2 font-mono focus:outline-none focus:border-[#64B5F6]"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setKrashiPicker({
                                filterKind: 'image',
                                title: `Select Image for ${m.name}`,
                                onSelect: (url) =>
                                  setKrashiCatalog((prev: any) => ({
                                    ...prev,
                                    models: prev.models.map((x: any, i: number) =>
                                      i === mIdx ? { ...x, imageUrl: url } : x
                                    ),
                                  })),
                              })
                            }
                            className="px-2.5 py-1.5 border border-[#90CAF9] rounded bg-white text-[#123B5D] hover:bg-[#F0F8FF] font-semibold whitespace-nowrap shrink-0 transition-colors"
                          >
                            Media
                          </button>
                        </div>
                        <div className="md:col-span-2 flex gap-1.5">
                          <input
                            placeholder="Model Demonstration Video URL (.mp4 / .webm)"
                            value={m.videoUrl || ''}
                            onChange={(e) =>
                              setKrashiCatalog({
                                ...krashiCatalog,
                                models: krashiCatalog.models.map((x: any, i: number) =>
                                  i === mIdx ? { ...x, videoUrl: e.target.value } : x
                                ),
                              })
                            }
                            className="flex-1 min-w-0 rounded border border-[#DCEAF5] bg-white text-[#263746] px-3 py-2 font-mono focus:outline-none focus:border-[#64B5F6]"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setKrashiPicker({
                                filterKind: 'video',
                                title: `Select Video for ${m.name}`,
                                onSelect: (url) =>
                                  setKrashiCatalog((prev: any) => ({
                                    ...prev,
                                    models: prev.models.map((x: any, i: number) =>
                                      i === mIdx ? { ...x, videoUrl: url } : x
                                    ),
                                  })),
                              })
                            }
                            className="px-2.5 py-1.5 border border-[#90CAF9] rounded bg-white text-[#123B5D] hover:bg-[#F0F8FF] font-semibold whitespace-nowrap shrink-0 transition-colors"
                          >
                            Pick Video
                          </button>
                        </div>
                      </div>
                      <textarea
                        rows={2}
                        placeholder="Model Summary"
                        value={m.summary || ''}
                        onChange={(e) =>
                          setKrashiCatalog({
                            ...krashiCatalog,
                            models: krashiCatalog.models.map((x: any, i: number) =>
                              i === mIdx ? { ...x, summary: e.target.value } : x
                            ),
                          })
                        }
                        className="w-full rounded border border-[#DCEAF5] bg-white text-[#263746] px-3 py-2 focus:outline-none focus:border-[#64B5F6]"
                      />
                      <div className="space-y-1.5">
                        <div className="flex justify-between items-center font-semibold">
                          <span>Comparison Specs ({(m.specs || []).length})</span>
                          <button
                            type="button"
                            onClick={() =>
                              setKrashiCatalog({
                                ...krashiCatalog,
                                models: krashiCatalog.models.map((x: any, i: number) =>
                                  i === mIdx ? { ...x, specs: [...(x.specs || []), { label: '', value: '' }] } : x
                                ),
                              })
                            }
                            className="text-[#42A5F5] font-semibold inline-flex items-center gap-1 hover:underline"
                          >
                            <Plus className="w-3 h-3" /> Add Spec Row
                          </button>
                        </div>
                        {(m.specs || []).map((sp: any, sIdx: number) => (
                          <div key={sIdx} className="flex gap-2">
                            <input
                              placeholder="Spec Label (e.g. Payload Tank Capacity)"
                              value={sp.label}
                              onChange={(e) =>
                                setKrashiCatalog({
                                  ...krashiCatalog,
                                  models: krashiCatalog.models.map((x: any, i: number) =>
                                    i === mIdx
                                      ? {
                                          ...x,
                                          specs: x.specs.map((ss: any, si: number) =>
                                            si === sIdx ? { ...ss, label: e.target.value } : ss
                                          ),
                                        }
                                      : x
                                  ),
                                })
                              }
                              className="flex-1 rounded border border-[#DCEAF5] bg-white px-2.5 py-1.5"
                            />
                            <input
                              placeholder="Verified Value (leave blank for Coming Soon)"
                              value={sp.value}
                              onChange={(e) =>
                                setKrashiCatalog({
                                  ...krashiCatalog,
                                  models: krashiCatalog.models.map((x: any, i: number) =>
                                    i === mIdx
                                      ? {
                                          ...x,
                                          specs: x.specs.map((ss: any, si: number) =>
                                            si === sIdx ? { ...ss, value: e.target.value } : ss
                                          ),
                                        }
                                      : x
                                  ),
                                })
                              }
                              className="flex-1 rounded border border-[#DCEAF5] bg-white px-2.5 py-1.5 font-mono"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                setKrashiCatalog({
                                  ...krashiCatalog,
                                  models: krashiCatalog.models.map((x: any, i: number) =>
                                    i === mIdx
                                      ? { ...x, specs: x.specs.filter((_: any, si: number) => si !== sIdx) }
                                      : x
                                  ),
                                })
                              }
                              className="p-1.5 text-red-600"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}

                  <button
                    type="button"
                    onClick={async () => {
                      await apiFetch('/api/admin/settings/krashivantriCatalog', {
                        method: 'PUT',
                        body: JSON.stringify({ value: krashiCatalog }),
                      });
                      await refreshBootstrap();
                      notify('KRASHIVANTRI CMS catalog saved.', 'success');
                    }}
                    className="px-5 py-2.5 bg-[#64B5F6] hover:bg-[#42A5F5] text-white rounded-lg font-semibold transition-colors"
                  >
                    Save KRASHIVANTRI CMS Settings
                  </button>
                </div>

                {/* Quick Link to Flagship DB Products */}
                <div className="rounded-xl border border-[#DCEAF5] bg-white p-6 space-y-3">
                  <h3 className="font-display text-base font-bold text-[#123B5D]">
                    Flagship Store Listings (Synced with /product/krashivantri-x &amp; /product/krashivantri-x-pro)
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {products
                      .filter((p) => ['krashivantri-x', 'krashivantri-x-pro'].includes(p.slug))
                      .map((fp) => (
                        <div key={fp.id} className="rounded-lg border border-[#DCEAF5] bg-[#F0F8FF]/40 p-4 flex items-center justify-between gap-3">
                          <div>
                            <div className="font-bold text-[#123B5D]">{fp.name}</div>
                            <div className="text-[11px] font-mono text-[#263746]/70">
                              /{fp.slug} · Type: {fp.productType} · {fp.priceInr > 0 ? `₹${fp.priceInr}` : 'Contact for Price'}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              openEditProduct(fp);
                              setTab('store_products');
                            }}
                            className="px-3 py-1.5 bg-[#64B5F6] hover:bg-[#42A5F5] text-white rounded-lg font-semibold transition-colors"
                          >
                            Edit Product Specs
                          </button>
                        </div>
                      ))}
                  </div>
                </div>
                <MediaPickerModal
                  open={Boolean(krashiPicker)}
                  title={krashiPicker?.title || 'Select Media'}
                  filterKind={krashiPicker?.filterKind || 'all'}
                  defaultCategory="KRASHIVANTRI Products"
                  onClose={() => setKrashiPicker(null)}
                  onSelect={(asset) => {
                    krashiPicker?.onSelect(asset.url);
                    setKrashiPicker(null);
                  }}
                />
              </div>
            )}

            {/* ==================== MEDIA LIBRARY ==================== */}
            {tab === 'media_library' && <MediaLibraryPanel />}

            {/* ==================== WOOCOMMERCE STORE PRODUCTS ==================== */}
            {tab === 'store_products' && (
              <div className="space-y-6 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="relative flex-1 min-w-[220px] max-w-md">
                    <Search className="w-4 h-4 text-[#42A5F5] absolute left-3 top-2.5" />
                    <input
                      placeholder="Search products by name, SKU, or brand..."
                      value={productSearch}
                      onChange={(e) => setProductSearch(e.target.value)}
                      className="w-full rounded-lg border border-[#DCEAF5] bg-white pl-9 pr-3 py-2"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => downloadAuthorizedCsv('/api/admin/products/csv-export', 'nexustekfusion-products.csv')}
                      className="px-3.5 py-2 border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] rounded-lg font-semibold inline-flex items-center gap-1.5"
                    >
                      <Download className="w-3.5 h-3.5 text-[#42A5F5]" /> Export CSV
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setProdDraft(EMPTY_PRODUCT);
                        setShowProdForm(!showProdForm);
                      }}
                      className="px-4 py-2 bg-[#64B5F6] hover:bg-[#42A5F5] text-white rounded-lg font-semibold inline-flex items-center gap-1.5 transition-colors"
                    >
                      <Plus className="w-4 h-4" /> {showProdForm ? 'Close Product Editor' : 'Add New Product'}
                    </button>
                  </div>
                </div>

                {showProdForm && (
                  <form onSubmit={handleSaveProduct} className="rounded-xl border border-[#90CAF9] bg-white p-6 space-y-5">
                    <div className="flex items-center justify-between border-b border-[#DCEAF5] pb-3">
                      <h2 className="font-display text-lg font-bold text-[#123B5D]">
                        {prodDraft.id ? `Edit Product #${prodDraft.id}` : 'Create WooCommerce Store Product'}
                      </h2>
                      <button
                        type="button"
                        onClick={() => {
                          setShowProdForm(false);
                          setProdDraft(EMPTY_PRODUCT);
                        }}
                        className="text-[#263746]/70 hover:text-[#123B5D] font-semibold transition-colors"
                      >
                        Cancel
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                      <input
                        required
                        placeholder="Product Title *"
                        value={prodDraft.name}
                        onChange={(e) => setProdDraft({ ...prodDraft, name: e.target.value })}
                        className="sm:col-span-2 rounded-lg border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-3 py-2"
                      />
                      <input
                        required
                        placeholder="SKU (e.g. NTF-KV-X) *"
                        value={prodDraft.sku}
                        onChange={(e) => setProdDraft({ ...prodDraft, sku: e.target.value.toUpperCase() })}
                        className="rounded-lg border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-3 py-2 font-mono uppercase"
                      />
                      <input
                        placeholder="Model Number"
                        value={prodDraft.modelNumber}
                        onChange={(e) => setProdDraft({ ...prodDraft, modelNumber: e.target.value })}
                        className="rounded-lg border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-3 py-2 font-mono"
                      />
                      <select
                        value={prodDraft.brand}
                        onChange={(e) => setProdDraft({ ...prodDraft, brand: e.target.value })}
                        className="rounded-lg border border-[#DCEAF5] px-3 py-2 bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                      >
                        <option value="NexusTekFusion">NexusTekFusion</option>
                        <option value="KRASHIVANTRI">KRASHIVANTRI</option>
                        {brands
                          .filter((b) => !['NexusTekFusion', 'KRASHIVANTRI'].includes(b.name))
                          .map((b) => (
                            <option key={b.id} value={b.name}>{b.name}</option>
                          ))}
                      </select>
                      <select
                        value={prodDraft.categoryId}
                        onChange={(e) => setProdDraft({ ...prodDraft, categoryId: e.target.value })}
                        className="rounded-lg border border-[#DCEAF5] px-3 py-2 bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                      >
                        <option value="">Select Category</option>
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                      <select
                        value={prodDraft.productType}
                        onChange={(e) => setProdDraft({ ...prodDraft, productType: e.target.value as any })}
                        className="rounded-lg border border-[#DCEAF5] px-3 py-2 bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                      >
                        <option value="simple">Simple Product</option>
                        <option value="variable">Variable (Variants/Colors)</option>
                        <option value="customizable">Customizable</option>
                        <option value="made_to_order">Made to Order</option>
                        <option value="quote_only">Quote Only (Contact for Price)</option>
                      </select>
                      <select
                        value={prodDraft.status}
                        onChange={(e) => setProdDraft({ ...prodDraft, status: e.target.value as any })}
                        className="rounded-lg border border-[#DCEAF5] px-3 py-2 bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                      >
                        <option value="published">Published</option>
                        <option value="draft">Draft</option>
                        <option value="scheduled">Scheduled</option>
                      </select>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-7 gap-3">
                      <select
                        value={prodDraft.storeScope}
                        onChange={(e) => setProdDraft({ ...prodDraft, storeScope: e.target.value as any })}
                        className="rounded-lg border border-[#DCEAF5] px-3 py-2 bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                      >
                        <option value="general">General Store</option>
                        <option value="3d_printed">3D Printed Store</option>
                      </select>
                      <input
                        placeholder="HSN (e.g. 8806)"
                        value={prodDraft.hsnCode}
                        onChange={(e) => setProdDraft({ ...prodDraft, hsnCode: e.target.value })}
                        className="rounded-lg border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-3 py-2 font-mono"
                      />
                      <input
                        type="number"
                        min={0}
                        placeholder="Price ₹ (0 = Quote)"
                        value={prodDraft.priceInr}
                        onChange={(e) => setProdDraft({ ...prodDraft, priceInr: e.target.value })}
                        className="rounded-lg border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-3 py-2 font-mono"
                      />
                      <input
                        type="number"
                        min={0}
                        placeholder="Sale Price ₹"
                        value={prodDraft.discountPriceInr}
                        onChange={(e) => setProdDraft({ ...prodDraft, discountPriceInr: e.target.value })}
                        className="rounded-lg border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-3 py-2 font-mono"
                      />
                      <input
                        type="number"
                        min={0}
                        placeholder="GST %"
                        value={prodDraft.gstPercent}
                        onChange={(e) => setProdDraft({ ...prodDraft, gstPercent: e.target.value })}
                        className="rounded-lg border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-3 py-2 font-mono"
                      />
                      <input
                        type="number"
                        min={0}
                        placeholder="Stock Qty"
                        value={prodDraft.stockQty}
                        onChange={(e) => setProdDraft({ ...prodDraft, stockQty: e.target.value })}
                        className="rounded-lg border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-3 py-2 font-mono"
                      />
                      <input
                        type="number"
                        min={0}
                        placeholder="Ship Weight (g)"
                        value={prodDraft.shippingWeightGrams}
                        onChange={(e) => setProdDraft({ ...prodDraft, shippingWeightGrams: e.target.value })}
                        className="rounded-lg border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-3 py-2 font-mono"
                      />
                    </div>

                    <input
                      placeholder="Short Summary (displayed near price & PDP summary)"
                      value={prodDraft.shortDescription}
                      onChange={(e) => setProdDraft({ ...prodDraft, shortDescription: e.target.value })}
                      className="w-full rounded-lg border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-3 py-2"
                    />
                    <textarea
                      rows={3}
                      placeholder="Full Product Description"
                      value={prodDraft.description}
                      onChange={(e) => setProdDraft({ ...prodDraft, description: e.target.value })}
                      className="w-full rounded-lg border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-3 py-2"
                    />

                    <div className="rounded-lg border border-[#DCEAF5] bg-[#F0F8FF] p-4 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="font-semibold text-[#123B5D]">
                            KRASHIVANTRI Key System Specifications (Admin-Verified Only)
                          </div>
                          <div className="text-[11px] text-[#263746]/70">
                            Synced directly with /krashivantri-x, /krashivantri-x-pro, and /krashivantri/compare. Leave blank or keep &quot;Official Specification on Briefing&quot; until authorized values are approved.
                          </div>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {KRASHI_SPEC_KEYS.map((specKey) => (
                          <div key={specKey} className="space-y-1">
                            <label className="block font-semibold text-[#123B5D]">{specKey}</label>
                            <input
                              placeholder="Official Specification on Briefing"
                              value={prodDraft.krashiSpecs?.[specKey] || ''}
                              onChange={(e) =>
                                setProdDraft({
                                  ...prodDraft,
                                  krashiSpecs: {
                                    ...(prodDraft.krashiSpecs || EMPTY_KRASHI_SPECS),
                                    [specKey]: e.target.value,
                                  },
                                })
                              }
                              className="w-full rounded-lg border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-3 py-2"
                            />
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <textarea
                        rows={4}
                        placeholder="Key Features (one per line)"
                        value={prodDraft.featuresText}
                        onChange={(e) => setProdDraft({ ...prodDraft, featuresText: e.target.value })}
                        className="rounded-lg border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-3 py-2"
                      />
                      <textarea
                        rows={4}
                        placeholder="Additional Technical Specs (Key: Value per line)"
                        value={prodDraft.specsText}
                        onChange={(e) => setProdDraft({ ...prodDraft, specsText: e.target.value })}
                        className="rounded-lg border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-3 py-2 font-mono"
                      />
                      <textarea
                        rows={4}
                        placeholder="In the Box / Package Contents (one per line)"
                        value={prodDraft.packageContentsText}
                        onChange={(e) => setProdDraft({ ...prodDraft, packageContentsText: e.target.value })}
                        className="rounded-lg border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-3 py-2"
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="flex gap-1.5">
                        <input
                          placeholder="Primary Image URL"
                          value={prodDraft.imageUrl}
                          onChange={(e) => setProdDraft({ ...prodDraft, imageUrl: e.target.value })}
                          className="flex-1 min-w-0 rounded-lg border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-3 py-2 font-mono"
                        />
                        <label className="px-2.5 py-2 rounded-lg border border-[#90CAF9] bg-[#F0F8FF] hover:bg-[#DCEAF5] text-[11px] font-semibold text-[#123B5D] cursor-pointer inline-flex items-center gap-1 shrink-0 transition-colors">
                          <Upload className="w-3.5 h-3.5 text-[#42A5F5]" />
                          {uploadingProdImg ? '...' : 'Upload'}
                          <input
                            type="file"
                            accept="image/*"
                            disabled={uploadingProdImg}
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              e.target.value = '';
                              if (!file) return;
                              setUploadingProdImg(true);
                              try {
                                const fd = new FormData();
                                fd.append('file', file);
                                fd.append('folder', 'products');
                                const res = await apiFetch<{ asset: { fileUrl: string } }>('/api/admin/media/upload', {
                                  method: 'POST',
                                  body: fd,
                                });
                                setProdDraft((prev) => ({ ...prev, imageUrl: res.asset.fileUrl }));
                                notify('Primary image uploaded to storage.', 'success');
                              } catch (err: any) {
                                notify(err?.message || 'Image upload failed.', 'error');
                              } finally {
                                setUploadingProdImg(false);
                              }
                            }}
                            className="sr-only"
                          />
                        </label>
                      </div>
                      <input
                        placeholder="Variants (comma-separated)"
                        value={prodDraft.availableVariantsText}
                        onChange={(e) => setProdDraft({ ...prodDraft, availableVariantsText: e.target.value })}
                        className="rounded-lg border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-3 py-2"
                      />
                      <input
                        placeholder="Colors (comma-separated)"
                        value={prodDraft.availableColorsText}
                        onChange={(e) => setProdDraft({ ...prodDraft, availableColorsText: e.target.value })}
                        className="rounded-lg border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-3 py-2"
                      />
                      <input
                        placeholder="PDF Brochure URL"
                        value={prodDraft.brochureUrl}
                        onChange={(e) => setProdDraft({ ...prodDraft, brochureUrl: e.target.value })}
                        className="rounded-lg border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-3 py-2 font-mono"
                      />
                      <input
                        placeholder="Technical Datasheet PDF URL"
                        value={prodDraft.datasheetUrl}
                        onChange={(e) => setProdDraft({ ...prodDraft, datasheetUrl: e.target.value })}
                        className="rounded-lg border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-3 py-2 font-mono"
                      />
                      <input
                        placeholder="3D Asset / Video URL"
                        value={prodDraft.videoUrl}
                        onChange={(e) => setProdDraft({ ...prodDraft, videoUrl: e.target.value })}
                        className="rounded-lg border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-3 py-2 font-mono"
                      />
                    </div>

                    <div className="flex flex-col sm:flex-row gap-2 items-start">
                      <textarea
                        rows={2}
                        placeholder="Gallery Image URLs (one URL per line)"
                        value={prodDraft.galleryUrlsText}
                        onChange={(e) => setProdDraft({ ...prodDraft, galleryUrlsText: e.target.value })}
                        className="flex-1 w-full rounded-lg border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-3 py-2 font-mono"
                      />
                      <label className="px-3 py-2 rounded-lg border border-[#90CAF9] bg-[#F0F8FF] hover:bg-[#DCEAF5] text-[11px] font-semibold text-[#123B5D] cursor-pointer inline-flex items-center gap-1.5 shrink-0 transition-colors">
                        <ImageIcon className="w-3.5 h-3.5 text-[#42A5F5]" />
                        + Add Gallery Image
                        <input
                          type="file"
                          accept="image/*"
                          disabled={uploadingProdImg}
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            e.target.value = '';
                            if (!file) return;
                            setUploadingProdImg(true);
                            try {
                              const fd = new FormData();
                              fd.append('file', file);
                              fd.append('folder', 'products');
                              const res = await apiFetch<{ asset: { fileUrl: string } }>('/api/admin/media/upload', {
                                method: 'POST',
                                body: fd,
                              });
                              setProdDraft((prev) => ({
                                ...prev,
                                galleryUrlsText: prev.galleryUrlsText
                                  ? `${prev.galleryUrlsText.trim()}\n${res.asset.fileUrl}`
                                  : res.asset.fileUrl,
                              }));
                              notify('Gallery image uploaded and appended.', 'success');
                            } catch (err: any) {
                              notify(err?.message || 'Gallery upload failed.', 'error');
                            } finally {
                              setUploadingProdImg(false);
                            }
                          }}
                          className="sr-only"
                        />
                      </label>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <input
                        placeholder="Delivery Info (e.g. Dispatches in 2–4 business days)"
                        value={prodDraft.deliveryInfo}
                        onChange={(e) => setProdDraft({ ...prodDraft, deliveryInfo: e.target.value })}
                        className="rounded-lg border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-3 py-2"
                      />
                      <input
                        placeholder="SEO Title"
                        value={prodDraft.seoTitle}
                        onChange={(e) => setProdDraft({ ...prodDraft, seoTitle: e.target.value })}
                        className="rounded-lg border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-3 py-2"
                      />
                      <input
                        placeholder="SEO Meta Description"
                        value={prodDraft.seoDescription}
                        onChange={(e) => setProdDraft({ ...prodDraft, seoDescription: e.target.value })}
                        className="rounded-lg border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-3 py-2"
                      />
                    </div>

                    <div className="flex flex-wrap gap-5 pt-1 text-[#123B5D]">
                      <label className="flex items-center gap-1.5 font-semibold">
                        <input
                          type="checkbox"
                          checked={prodDraft.isFeatured}
                          onChange={(e) => setProdDraft({ ...prodDraft, isFeatured: e.target.checked })}
                          className="accent-[#64B5F6]"
                        />
                        Featured
                      </label>
                      <label className="flex items-center gap-1.5 font-semibold">
                        <input
                          type="checkbox"
                          checked={prodDraft.isBestseller}
                          onChange={(e) => setProdDraft({ ...prodDraft, isBestseller: e.target.checked })}
                          className="accent-[#64B5F6]"
                        />
                        Bestseller
                      </label>
                      <label className="flex items-center gap-1.5 font-semibold">
                        <input
                          type="checkbox"
                          checked={prodDraft.isNewArrival}
                          onChange={(e) => setProdDraft({ ...prodDraft, isNewArrival: e.target.checked })}
                          className="accent-[#64B5F6]"
                        />
                        New Arrival
                      </label>
                    </div>

                    <button
                      type="submit"
                      className="px-6 py-2.5 bg-[#64B5F6] hover:bg-[#42A5F5] text-white rounded-lg font-semibold transition-colors"
                    >
                      {prodDraft.id ? 'Save Product Changes' : 'Publish Product'}
                    </button>
                  </form>
                )}

                {/* Product Catalog Table */}
                <div className="rounded-xl border border-[#DCEAF5] bg-white overflow-x-auto shadow-sm">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-[#F0F8FF] border-b border-[#DCEAF5] text-[11px] uppercase text-[#123B5D]">
                      <tr>
                        <th className="p-3">Product</th>
                        <th className="p-3">SKU &amp; Type</th>
                        <th className="p-3">Brand</th>
                        <th className="p-3">Price</th>
                        <th className="p-3">Stock</th>
                        <th className="p-3">Status</th>
                        <th className="p-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#DCEAF5]">
                      {filteredProducts.map((p: any) => (
                        <tr key={p.id} className="hover:bg-[#F0F8FF]/60 transition-colors">
                          <td className="p-3">
                            <div className="flex items-center gap-2.5">
                              <img src={p.imageUrl} alt={p.name} className="w-10 h-10 rounded object-cover border border-[#DCEAF5] shrink-0" />
                              <div>
                                <div className="font-semibold text-[#123B5D]">{p.name}</div>
                                <div className="font-mono text-[10px] text-[#263746]/70">/product/{p.slug}</div>
                              </div>
                            </div>
                          </td>
                          <td className="p-3 font-mono text-[#263746]">
                            <div>{p.sku}</div>
                            <div className="text-[10px] text-[#42A5F5] font-semibold">{p.productType || 'simple'}</div>
                          </td>
                          <td className="p-3 text-[#263746]">{p.brand}</td>
                          <td className="p-3 font-mono font-semibold text-[#123B5D]">
                            {p.productType === 'quote_only' || p.priceInr <= 0
                              ? 'Quote Only'
                              : `₹${(p.discountPriceInr ?? p.priceInr).toLocaleString('en-IN')}`}
                          </td>
                          <td className="p-3 font-mono text-[#263746]">{p.stockQty}</td>
                          <td className="p-3">
                            <span
                              className={`px-2 py-0.5 rounded font-mono text-[10px] font-semibold ${
                                p.isPublished ? 'bg-[#F0F8FF] text-[#123B5D] border border-[#90CAF9]' : 'bg-[#F0F8FF]/50 text-[#263746]/70 border border-[#DCEAF5]'
                              }`}
                            >
                              {p.status || (p.isPublished ? 'published' : 'draft')}
                            </span>
                          </td>
                          <td className="p-3 text-right space-x-1 whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => openEditProduct(p)}
                              className="px-2 py-1 border border-[#90CAF9] bg-white text-[#123B5D] rounded font-semibold hover:bg-[#F0F8FF] inline-flex items-center gap-1 transition-colors"
                            >
                              <Edit3 className="w-3 h-3 text-[#42A5F5]" /> Edit
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                await apiFetch(`/api/admin/products/${p.id}/duplicate`, { method: 'POST' });
                                notify(`Duplicated "${p.name}" as Draft.`, 'info');
                                loadAll();
                              }}
                              className="px-2 py-1 border border-[#DCEAF5] bg-white text-[#263746] rounded font-semibold hover:bg-[#F0F8FF] transition-colors"
                            >
                              Duplicate
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                await apiFetch(`/api/admin/products/${p.id}`, { method: 'DELETE' });
                                notify(`Archived "${p.name}".`, 'info');
                                loadAll();
                                refreshBootstrap();
                              }}
                              className="px-2 py-1 border border-red-200 text-red-700 rounded hover:bg-red-50 transition-colors"
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Bulk CSV Import */}
                <div className="rounded-xl border border-[#DCEAF5] bg-white p-5 space-y-3 shadow-sm">
                  <div className="font-display font-bold text-sm text-[#123B5D] flex items-center gap-2">
                    <Upload className="w-4 h-4 text-[#42A5F5]" /> Bulk Product CSV Import (Upsert by SKU)
                  </div>
                  <textarea
                    rows={3}
                    placeholder="sku,name,brand,productType,storeScope,priceInr,stockQty,description&#10;NTF-IMU-01,Industrial 9-DOF IMU,NexusTekFusion,simple,general,1490,25,Calibrated IMU module"
                    value={csvImportText}
                    onChange={(e) => setCsvImportText(e.target.value)}
                    className="w-full rounded-lg border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-3 py-2 font-mono text-[11px]"
                  />
                  <button
                    type="button"
                    disabled={importingCsv || !csvImportText.trim()}
                    onClick={handleCsvImport}
                    className="px-4 py-2 bg-[#64B5F6] hover:bg-[#42A5F5] text-white rounded-lg font-semibold disabled:opacity-50 transition-colors"
                  >
                    {importingCsv ? 'Importing CSV...' : 'Import Products CSV'}
                  </button>
                </div>
              </div>
            )}

            {/* ==================== CATEGORIES & BRANDS ==================== */}
            {tab === 'categories_brands' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 text-xs">
                <div className="rounded-xl border border-[#DCEAF5] bg-white p-6 space-y-4 shadow-sm">
                  <h2 className="font-display text-lg font-bold text-[#123B5D]">Product Categories</h2>
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (catForm.id) {
                        await apiFetch(`/api/admin/categories/${catForm.id}`, {
                          method: 'PUT',
                          body: JSON.stringify({ ...catForm, sortOrder: Number(catForm.sortOrder || 0) }),
                        });
                        notify('Category updated.', 'success');
                      } else {
                        await apiFetch('/api/admin/categories', {
                          method: 'POST',
                          body: JSON.stringify({ ...catForm, sortOrder: Number(catForm.sortOrder || 0) }),
                        });
                        notify('Category created.', 'success');
                      }
                      setCatForm({ name: '', slug: '', storeScope: 'general', description: '', sortOrder: '0' });
                      loadAll();
                      refreshBootstrap();
                    }}
                    className="rounded-lg border border-[#DCEAF5] bg-[#F0F8FF] p-4 space-y-2.5"
                  >
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        required
                        placeholder="Category Name *"
                        value={catForm.name}
                        onChange={(e) => setCatForm({ ...catForm, name: e.target.value })}
                        className="rounded border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-2.5 py-1.5"
                      />
                      <input
                        placeholder="Slug (auto if blank)"
                        value={catForm.slug}
                        onChange={(e) => setCatForm({ ...catForm, slug: e.target.value })}
                        className="rounded border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-2.5 py-1.5 font-mono"
                      />
                      <select
                        value={catForm.storeScope}
                        onChange={(e) => setCatForm({ ...catForm, storeScope: e.target.value as any })}
                        className="rounded border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-2.5 py-1.5"
                      >
                        <option value="general">General Store</option>
                        <option value="3d_printed">3D Printed Store</option>
                      </select>
                      <input
                        type="number"
                        placeholder="Sort Order"
                        value={catForm.sortOrder}
                        onChange={(e) => setCatForm({ ...catForm, sortOrder: e.target.value })}
                        className="rounded border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-2.5 py-1.5 font-mono"
                      />
                    </div>
                    <input
                      placeholder="Short Description"
                      value={catForm.description}
                      onChange={(e) => setCatForm({ ...catForm, description: e.target.value })}
                      className="w-full rounded border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-2.5 py-1.5"
                    />
                    <div className="flex gap-2">
                      <button type="submit" className="px-4 py-1.5 bg-[#64B5F6] hover:bg-[#42A5F5] text-white rounded font-semibold transition-colors">
                        {catForm.id ? 'Update Category' : 'Add Category'}
                      </button>
                      {catForm.id && (
                        <button
                          type="button"
                          onClick={() => setCatForm({ name: '', slug: '', storeScope: 'general', description: '', sortOrder: '0' })}
                          className="px-3 py-1.5 border border-[#90CAF9] bg-white text-[#123B5D] hover:bg-[#F0F8FF] rounded font-semibold transition-colors"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </form>

                  <div className="divide-y divide-[#DCEAF5]">
                    {categories.map((c) => (
                      <div key={c.id} className="py-2.5 flex items-center justify-between gap-2">
                        <div>
                          <div className="font-semibold text-[#123B5D]">{c.name}</div>
                          <div className="font-mono text-[10px] text-[#263746]/70">/{c.slug} · {c.storeScope}</div>
                        </div>
                        <div className="flex gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              setCatForm({
                                id: c.id,
                                name: c.name,
                                slug: c.slug,
                                storeScope: c.storeScope,
                                description: c.description || '',
                                sortOrder: String(c.sortOrder || 0),
                              })
                            }
                            className="px-2 py-1 border border-[#90CAF9] bg-white text-[#123B5D] hover:bg-[#F0F8FF] rounded transition-colors"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              await apiFetch(`/api/admin/categories/${c.id}`, { method: 'DELETE' });
                              loadAll();
                              refreshBootstrap();
                            }}
                            className="px-2 py-1 text-red-600 border border-red-200 rounded hover:bg-red-50 transition-colors"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Brands CRUD */}
                <div className="rounded-xl border border-[#DCEAF5] bg-white p-6 space-y-4 shadow-sm">
                  <h2 className="font-display text-lg font-bold text-[#123B5D]">Engineering &amp; Product Brands</h2>
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (brandForm.id) {
                        await apiFetch(`/api/admin/brands/${brandForm.id}`, {
                          method: 'PUT',
                          body: JSON.stringify(brandForm),
                        });
                        notify('Brand updated.', 'success');
                      } else {
                        await apiFetch('/api/admin/brands', {
                          method: 'POST',
                          body: JSON.stringify(brandForm),
                        });
                        notify('Brand added.', 'success');
                      }
                      setBrandForm({ name: '', slug: '', logoUrl: '', description: '' });
                      loadAll();
                      refreshBootstrap();
                    }}
                    className="rounded-lg border border-[#DCEAF5] bg-[#F0F8FF] p-4 space-y-2.5"
                  >
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        required
                        placeholder="Brand Name *"
                        value={brandForm.name}
                        onChange={(e) => setBrandForm({ ...brandForm, name: e.target.value })}
                        className="rounded border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-2.5 py-1.5"
                      />
                      <input
                        placeholder="Slug (auto)"
                        value={brandForm.slug}
                        onChange={(e) => setBrandForm({ ...brandForm, slug: e.target.value })}
                        className="rounded border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-2.5 py-1.5 font-mono"
                      />
                    </div>
                    <input
                      placeholder="Logo Image URL"
                      value={brandForm.logoUrl}
                      onChange={(e) => setBrandForm({ ...brandForm, logoUrl: e.target.value })}
                      className="w-full rounded border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-2.5 py-1.5 font-mono"
                    />
                    <input
                      placeholder="Description"
                      value={brandForm.description}
                      onChange={(e) => setBrandForm({ ...brandForm, description: e.target.value })}
                      className="w-full rounded border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-2.5 py-1.5"
                    />
                    <button type="submit" className="px-4 py-1.5 bg-[#64B5F6] hover:bg-[#42A5F5] text-white rounded font-semibold transition-colors">
                      {brandForm.id ? 'Update Brand' : 'Add Brand'}
                    </button>
                  </form>

                  <div className="divide-y divide-[#DCEAF5]">
                    {brands.map((b) => (
                      <div key={b.id} className="py-2.5 flex items-center justify-between gap-2">
                        <div>
                          <div className="font-semibold text-[#123B5D]">{b.name}</div>
                          <div className="text-[11px] text-[#263746]/70">{b.description}</div>
                        </div>
                        <div className="flex gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              setBrandForm({
                                id: b.id,
                                name: b.name,
                                slug: b.slug,
                                logoUrl: b.logoUrl || '',
                                description: b.description || '',
                              })
                            }
                            className="px-2 py-1 border border-[#90CAF9] bg-white text-[#123B5D] hover:bg-[#F0F8FF] rounded transition-colors"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              await apiFetch(`/api/admin/brands/${b.id}`, { method: 'DELETE' });
                              loadAll();
                              refreshBootstrap();
                            }}
                            className="px-2 py-1 text-red-600 border border-red-200 rounded hover:bg-red-50 transition-colors"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ==================== INVENTORY & STOCK MOVEMENTS ==================== */}
            {tab === 'inventory' && (
              <div className="space-y-6 text-xs">
                <div className="rounded-xl border border-[#DCEAF5] bg-white p-6 space-y-4 shadow-sm">
                  <h2 className="font-display text-lg font-bold text-[#123B5D]">
                    Inventory Stock Control ({products.length} SKUs)
                  </h2>
                  <div className="divide-y divide-[#DCEAF5]">
                    {products.map((p) => (
                      <div key={p.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="font-semibold text-[#123B5D]">{p.name}</div>
                          <div className="font-mono text-[#263746]/70">
                            {p.sku} · Stock: <strong className="text-[#123B5D]">{p.stockQty}</strong> · Threshold: {p.lowStockThreshold ?? 5}
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            type="number"
                            placeholder="+/- Qty"
                            value={stockAdjustMap[p.id]?.delta || ''}
                            onChange={(e) =>
                              setStockAdjustMap({
                                ...stockAdjustMap,
                                [p.id]: { delta: e.target.value, reason: stockAdjustMap[p.id]?.reason || '' },
                              })
                            }
                            className="w-24 rounded border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-2.5 py-1.5 font-mono"
                          />
                          <input
                            placeholder="Audit Reason"
                            value={stockAdjustMap[p.id]?.reason || ''}
                            onChange={(e) =>
                              setStockAdjustMap({
                                ...stockAdjustMap,
                                [p.id]: { delta: stockAdjustMap[p.id]?.delta || '', reason: e.target.value },
                              })
                            }
                            className="w-44 rounded border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-2.5 py-1.5"
                          />
                          <button
                            type="button"
                            onClick={() => handleAdjustStock(p.id)}
                            className="px-3 py-1.5 bg-[#64B5F6] hover:bg-[#42A5F5] text-white rounded font-semibold transition-colors"
                          >
                            Adjust Stock
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {overview.inventoryMovements?.length > 0 && (
                  <div className="rounded-xl border border-[#DCEAF5] bg-white p-6 space-y-3 shadow-sm">
                    <h3 className="font-display text-base font-bold text-[#123B5D]">Recent Stock Movement Audit</h3>
                    <div className="divide-y divide-[#DCEAF5] font-mono text-[11px]">
                      {overview.inventoryMovements.slice(0, 20).map((mv: any) => (
                        <div key={mv.id} className="py-2 flex flex-wrap justify-between gap-2 text-[#263746]">
                          <span>
                            Product #{mv.productId}: {mv.previousQty} → {mv.newQty} ({mv.deltaQty >= 0 ? `+${mv.deltaQty}` : mv.deltaQty}) · {mv.reason}
                          </span>
                          <span className="text-[#263746]/60">
                            {mv.actorEmail} · {new Date(mv.createdAt).toLocaleString('en-IN')}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ==================== STORE ORDERS & PDF PACKING SLIPS ==================== */}
            {tab === 'store_orders' && (() => {
              const ordersPageSize = 20;
              const orderTotalPages = Math.max(1, Math.ceil(filteredOrders.length / ordersPageSize));
              const safeOrderPage = Math.min(orderPage, orderTotalPages);
              const pagedOrders = filteredOrders.slice((safeOrderPage - 1) * ordersPageSize, safeOrderPage * ordersPageSize);
              const exportQs = new URLSearchParams();
              if (orderSearch.trim()) exportQs.set('search', orderSearch.trim());
              if (orderStatusFilter !== 'All') exportQs.set('status', orderStatusFilter);
              if (orderPaymentFilter !== 'all') exportQs.set('paymentStatus', orderPaymentFilter);
              if (orderDateFrom) exportQs.set('dateFrom', orderDateFrom);
              if (orderDateTo) exportQs.set('dateTo', orderDateTo);

              return (
              <div className="space-y-4 text-xs">
                <div className="rounded-xl border border-[#DCEAF5] bg-white p-4 space-y-3 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="relative flex-1 min-w-[220px] max-w-md">
                      <Search className="w-4 h-4 text-[#42A5F5] absolute left-3 top-2.5" />
                      <input
                        placeholder="Search by Order ID, Customer ID, name, email, phone, product..."
                        value={orderSearch}
                        onChange={(e) => setOrderSearch(e.target.value)}
                        className="w-full rounded-lg border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] pl-9 pr-3 py-2"
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={orderStatusFilter}
                        onChange={(e) => setOrderStatusFilter(e.target.value)}
                        className="rounded-lg border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-3 py-2 font-semibold"
                      >
                        <option value="All">All Order Stages</option>
                        {STORE_ORDER_STATUSES.map((st) => (
                          <option key={st} value={st}>{st}</option>
                        ))}
                      </select>
                      <select
                        value={orderPaymentFilter}
                        onChange={(e) => setOrderPaymentFilter(e.target.value as any)}
                        className="rounded-lg border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-3 py-2 font-semibold"
                      >
                        <option value="all">All Payment States</option>
                        <option value="paid">Paid</option>
                        <option value="pending">Pending</option>
                        <option value="refunded">Refunded</option>
                      </select>
                      <input
                        type="date"
                        value={orderDateFrom}
                        onChange={(e) => setOrderDateFrom(e.target.value)}
                        title="Order Date From"
                        className="rounded-lg border border-[#DCEAF5] bg-white px-2.5 py-2 font-mono text-xs"
                      />
                      <input
                        type="date"
                        value={orderDateTo}
                        onChange={(e) => setOrderDateTo(e.target.value)}
                        title="Order Date To"
                        className="rounded-lg border border-[#DCEAF5] bg-white px-2.5 py-2 font-mono text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => downloadAuthorizedCsv(`/api/admin/orders/export?${exportQs.toString()}`, 'nexustekfusion-orders.csv')}
                        className="px-3.5 py-2 border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] rounded-lg font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
                      >
                        <Download className="w-3.5 h-3.5 text-[#42A5F5]" /> Export Orders CSV
                      </button>
                    </div>
                  </div>
                </div>

                {pagedOrders.length === 0 ? (
                  <div className="rounded-xl border border-[#DCEAF5] bg-white p-8 text-center text-[#263746]/70">
                    No store orders match the active search or filters.
                  </div>
                ) : (
                  pagedOrders.map((o: any) => {
                    const d = orderDraftMap[o.id] || {
                      orderStatus: o.orderStatus,
                      trackingCourier: o.trackingCourier || '',
                      trackingId: o.trackingId || '',
                      trackingUrl: o.trackingUrl || '',
                      statusNote: '',
                      internalNotes: o.internalNotes || '',
                    };
                    const isPaid = o.paymentStatus === 'paid';
                    const matchingInv = (overview.invoices || []).find(
                      (inv: any) => inv.entityType === 'store_order' && inv.entityId === o.id
                    );
                    const matchingPayment = (overview.payments || []).find(
                      (pay: any) => pay.entityType === 'store_order' && pay.entityId === o.id && pay.status === 'verified'
                    );
                    const totalQty = (o.items || []).reduce((sum: number, it: any) => sum + Math.max(1, Number(it.qty || 1)), 0);
                    return (
                      <div key={o.id} className="rounded-xl border border-[#DCEAF5] bg-white p-5 space-y-4 shadow-sm">
                        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#DCEAF5] pb-3">
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono font-bold text-sm text-[#123B5D]">{o.orderNumber}</span>
                              {o.customerId && (
                                <button
                                  type="button"
                                  onClick={() => jumpToCustomerProfile(o.customerId || o.customerEmail)}
                                  className="px-2 py-0.5 rounded bg-[#F0F8FF] border border-[#90CAF9] font-mono text-[11px] font-bold text-[#123B5D] hover:bg-[#DCEAF5]"
                                  title="View Customer Profile"
                                >
                                  {o.customerId}
                                </button>
                              )}
                              <span className="text-[#263746]/50">·</span>
                              <span className="font-semibold text-[#123B5D]">{o.orderStatus}</span>
                              <span className="text-[#263746]/50">·</span>
                              <span className={`font-semibold uppercase ${isPaid ? 'text-[#42A5F5]' : 'text-amber-700'}`}>
                                {o.paymentStatus}
                              </span>
                              <span className="text-[#263746]/50">·</span>
                              <span className="font-mono text-[11px] text-[#263746]/80">
                                {o.paymentMethod || 'Razorpay'}
                              </span>
                              {o.refundStatus && o.refundStatus !== 'none' && (
                                <>
                                  <span className="text-[#263746]/50">·</span>
                                  <span className="text-amber-700 font-semibold">Refund: {o.refundStatus}</span>
                                </>
                              )}
                            </div>
                            <div className="text-[#263746]">
                              {o.shippingAddress?.fullName || o.customerName} ({o.shippingAddress?.mobile || o.customerPhone || '—'})
                              {o.customerEmail ? ` · ${o.customerEmail}` : ''} ·{' '}
                              {[o.shippingAddress?.line1, o.shippingAddress?.city, o.shippingAddress?.state, o.shippingAddress?.pinCode]
                                .filter(Boolean)
                                .join(', ')}
                            </div>
                            <div className="font-mono text-[11px] text-[#263746]/70 tabular-nums">
                              Qty: {totalQty} · Total: ₹{Number(o.totalInr || 0).toLocaleString('en-IN')} · {new Date(o.createdAt).toLocaleString('en-IN')}
                              {o.razorpayPaymentId ? ` · Ref: ${o.razorpayPaymentId}` : ''}
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {!isPaid && (
                              <button
                                type="button"
                                onClick={async () => {
                                  try {
                                    await apiFetch(`/api/admin/store-orders/${o.id}/verify-payment`, {
                                      method: 'POST',
                                      body: JSON.stringify({ paymentMethod: o.paymentMethod || 'Manual / Admin Verified' }),
                                    });
                                    notify(`Payment verified and Tax Invoice issued for ${o.orderNumber}.`, 'success');
                                    loadAll(true);
                                  } catch (err: any) {
                                    notify(err?.message || 'Payment verification failed.', 'error');
                                  }
                                }}
                                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold inline-flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors"
                              >
                                <Check className="w-3.5 h-3.5" /> Verify Payment
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                const ship = o.shippingAddress || {};
                                setOrderDetailTarget(o);
                                setOrderDeliveryDraft({
                                  fullName: ship.fullName || o.customerName || '',
                                  mobile: ship.mobile || o.customerPhone || '',
                                  line1: ship.line1 || '',
                                  line2: ship.line2 || '',
                                  city: ship.city || '',
                                  state: ship.state || '',
                                  pinCode: ship.pinCode || '',
                                  orderStatus: o.orderStatus || 'Confirmed',
                                  trackingCourier: o.trackingCourier || '',
                                  trackingId: o.trackingId || '',
                                  trackingUrl: o.trackingUrl || '',
                                  internalNotes: o.internalNotes || '',
                                });
                              }}
                              className="px-3 py-1.5 border border-[#90CAF9] bg-[#F0F8FF] text-[#123B5D] rounded-lg font-semibold inline-flex items-center gap-1 hover:bg-[#DCEAF5] whitespace-nowrap shrink-0 transition-colors"
                            >
                              <Edit3 className="w-3.5 h-3.5 text-[#42A5F5]" /> Details &amp; Delivery
                            </button>
                            {(o.customerId || o.customerEmail) && (
                              <button
                                type="button"
                                onClick={() => jumpToCustomerProfile(o.customerId || o.customerEmail)}
                                className="px-3 py-1.5 border border-[#90CAF9] bg-white text-[#123B5D] rounded-lg font-semibold inline-flex items-center gap-1 hover:bg-[#F0F8FF] whitespace-nowrap shrink-0 transition-colors"
                              >
                                <UserCheck className="w-3.5 h-3.5 text-[#42A5F5]" /> Customer
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => downloadPackingSlipPdf(o)}
                              className="px-3 py-1.5 border border-[#90CAF9] bg-white text-[#123B5D] rounded-lg font-semibold inline-flex items-center gap-1 hover:bg-[#F0F8FF] whitespace-nowrap shrink-0 transition-colors"
                            >
                              <Download className="w-3.5 h-3.5 text-[#42A5F5]" /> Packing Slip
                            </button>
                            {isPaid ? (
                              <>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    try {
                                      const res = await apiFetch<{ invoice: any }>(`/api/admin/invoices/${o.id}/regenerate`, {
                                        method: 'POST',
                                      });
                                      notify(`Tax Invoice ${res.invoice.invoiceNumber} generated.`, 'success');
                                      downloadInvoicePdf({
                                        invoiceNumber: res.invoice.invoiceNumber,
                                        docType: res.invoice.docType,
                                        entityType: 'store_order',
                                        amountInr: res.invoice.amountInr,
                                        gstInr: res.invoice.gstInr,
                                        issuedAt: res.invoice.issuedAt,
                                        customerEmail: res.invoice.payload?.customerEmail || o.customerEmail || '',
                                        gstin:
                                          settings.projectSettings?.enableGstTax && settings.companyInfo?.gstin
                                            ? settings.companyInfo.gstin
                                            : undefined,
                                        payload: res.invoice.payload || { orderNumber: o.orderNumber, items: o.items },
                                      });
                                      loadAll(true);
                                    } catch (err: any) {
                                      notify(err?.message || 'Failed to generate Tax Invoice.', 'error');
                                    }
                                  }}
                                  className="px-3 py-1.5 border border-[#90CAF9] bg-[#F0F8FF] text-[#123B5D] rounded-lg font-semibold inline-flex items-center gap-1 hover:bg-[#DCEAF5] whitespace-nowrap shrink-0 transition-colors"
                                >
                                  <FileText className="w-3.5 h-3.5 text-[#42A5F5]" />
                                  {matchingInv ? 'Regenerate Invoice' : 'Issue Invoice'}
                                </button>
                                {matchingInv && (
                                  <button
                                    type="button"
                                    onClick={() => downloadAdminCloudInvoicePdf(matchingInv)}
                                    className="px-3 py-1.5 border border-[#90CAF9] bg-white text-[#123B5D] rounded-lg font-semibold inline-flex items-center gap-1 hover:bg-[#F0F8FF] whitespace-nowrap shrink-0 transition-colors"
                                  >
                                    <Download className="w-3.5 h-3.5 text-[#42A5F5]" /> Invoice PDF
                                  </button>
                                )}
                                {matchingPayment && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const refundable = Math.max(
                                        0,
                                        Number(matchingPayment.amountInr || 0) - Number(matchingPayment.refundedAmountInr || 0)
                                      );
                                      setRefundTarget({
                                        id: matchingPayment.id,
                                        paymentRef: matchingPayment.paymentRef,
                                        maxInr: refundable,
                                      });
                                      setRefundAmount(String(refundable));
                                      setRefundReason('');
                                      setTab('payments_invoices');
                                    }}
                                    className="px-3 py-1.5 border border-amber-300 bg-amber-50 text-amber-900 rounded-lg font-semibold whitespace-nowrap shrink-0"
                                  >
                                    Issue Refund
                                  </button>
                                )}
                              </>
                            ) : (
                              <span className="px-3 py-1.5 border border-[#DCEAF5] bg-[#F0F8FF] text-[#263746]/70 rounded-lg font-medium">
                                Invoice locked until paid
                              </span>
                            )}
                          </div>
                        </div>

                        {(o.items || []).length > 0 && (
                          <div className="flex flex-wrap gap-3">
                            {(o.items || []).map((it: any, idx: number) => (
                              <div key={idx} className="flex items-center gap-2 rounded-lg border border-[#DCEAF5] bg-[#F0F8FF] px-2.5 py-1.5">
                                {it.imageUrl && (
                                  <img
                                    src={it.imageUrl}
                                    alt={it.name}
                                    referrerPolicy="no-referrer"
                                    className="w-8 h-8 rounded object-cover border border-[#DCEAF5] shrink-0"
                                  />
                                )}
                                <div>
                                  <div className="font-semibold text-[#123B5D]">{it.name}</div>
                                  <div className="font-mono text-[10px] text-[#263746]/70">
                                    Qty {it.qty} · ₹{Number(it.lineTotalInr || it.unitPriceInr * it.qty || 0).toLocaleString('en-IN')}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-6 gap-2.5">
                          <select
                            value={d.orderStatus}
                            onChange={(e) => setOrderDraftMap({ ...orderDraftMap, [o.id]: { ...d, orderStatus: e.target.value } })}
                            className="rounded-lg border border-[#DCEAF5] px-2.5 py-2 bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] font-semibold"
                          >
                            {STORE_ORDER_STATUSES.map((s) => (
                              <option key={s} value={s}>{s}</option>
                            ))}
                          </select>
                          <input
                            placeholder="Courier (e.g. BlueDart)"
                            value={d.trackingCourier}
                            onChange={(e) => setOrderDraftMap({ ...orderDraftMap, [o.id]: { ...d, trackingCourier: e.target.value } })}
                            className="rounded-lg border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-2.5 py-2"
                          />
                          <input
                            placeholder="Tracking / AWB ID"
                            value={d.trackingId}
                            onChange={(e) => setOrderDraftMap({ ...orderDraftMap, [o.id]: { ...d, trackingId: e.target.value } })}
                            className="rounded-lg border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-2.5 py-2 font-mono"
                          />
                          <input
                            placeholder="Tracking URL"
                            value={d.trackingUrl}
                            onChange={(e) => setOrderDraftMap({ ...orderDraftMap, [o.id]: { ...d, trackingUrl: e.target.value } })}
                            className="rounded-lg border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-2.5 py-2 font-mono"
                          />
                          <input
                            placeholder="Timeline Note / Internal Notes"
                            value={d.statusNote || d.internalNotes}
                            onChange={(e) =>
                              setOrderDraftMap({
                                ...orderDraftMap,
                                [o.id]: { ...d, statusNote: e.target.value, internalNotes: e.target.value },
                              })
                            }
                            className="rounded-lg border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-2.5 py-2"
                          />
                          <div className="flex gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleUpdateOrderTracking(`/api/admin/store-orders/${o.id}`, d)}
                              className="flex-1 px-3 py-2 bg-[#64B5F6] hover:bg-[#42A5F5] text-white rounded-lg font-semibold whitespace-nowrap shrink-0 transition-colors"
                            >
                              Save Order
                            </button>
                            <button
                              type="button"
                              title="Archive Order (Non-Destructive)"
                              onClick={() =>
                                setArchiveConfirm({
                                  title: `Archive Order ${o.orderNumber}`,
                                  subtitle:
                                    'Original order record, items, and payment ledger remain preserved in audit history.',
                                  endpoint: `/api/admin/store-orders/${o.id}`,
                                  reason: '',
                                  busy: false,
                                })
                              }
                              className="px-2.5 py-2 border border-amber-300 text-amber-800 rounded-lg hover:bg-amber-50 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}

                {filteredOrders.length > ordersPageSize && (
                  <div className="flex items-center justify-between rounded-xl border border-[#DCEAF5] bg-white px-4 py-3 text-xs">
                    <span className="font-mono text-[#263746]/80">
                      Page {safeOrderPage} of {orderTotalPages} ({filteredOrders.length} orders)
                    </span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={safeOrderPage <= 1}
                        onClick={() => setOrderPage((p) => Math.max(1, p - 1))}
                        className="px-3 py-1 rounded border border-[#90CAF9] bg-white text-[#123B5D] font-semibold disabled:opacity-50"
                      >
                        Previous
                      </button>
                      <button
                        type="button"
                        disabled={safeOrderPage >= orderTotalPages}
                        onClick={() => setOrderPage((p) => Math.min(orderTotalPages, p + 1))}
                        className="px-3 py-1 rounded border border-[#90CAF9] bg-white text-[#123B5D] font-semibold disabled:opacity-50"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </div>
              );
            })()}

            {/* ==================== COUPONS ==================== */}
            {tab === 'coupons' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 text-xs">
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    await apiFetch('/api/admin/coupons', {
                      method: 'POST',
                      body: JSON.stringify({
                        ...couponForm,
                        discountValue: Number(couponForm.discountValue),
                        minOrderInr: Number(couponForm.minOrderInr),
                      }),
                    });
                    setCouponForm({ code: '', discountType: 'percent', discountValue: '10', minOrderInr: '500' });
                    notify('Coupon created.', 'success');
                    loadAll();
                  }}
                  className="lg:col-span-5 rounded-xl border border-[#DCEAF5] bg-white p-6 space-y-3 h-fit shadow-sm"
                >
                  <h2 className="font-display text-lg font-bold text-[#123B5D]">Create Discount Coupon</h2>
                  <input
                    required
                    placeholder="CODE (e.g. NEXUS10)"
                    value={couponForm.code}
                    onChange={(e) => setCouponForm({ ...couponForm, code: e.target.value.toUpperCase() })}
                    className="w-full rounded-lg border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-3 py-2 font-mono uppercase"
                  />
                  <div className="grid grid-cols-3 gap-2">
                    <select
                      value={couponForm.discountType}
                      onChange={(e) => setCouponForm({ ...couponForm, discountType: e.target.value })}
                      className="rounded-lg border border-[#DCEAF5] px-2.5 py-2 bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                    >
                      <option value="percent">Percent %</option>
                      <option value="flat">Flat ₹</option>
                    </select>
                    <input
                      type="number"
                      min={1}
                      placeholder="Value"
                      value={couponForm.discountValue}
                      onChange={(e) => setCouponForm({ ...couponForm, discountValue: e.target.value })}
                      className="rounded-lg border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-2.5 py-2 font-mono"
                    />
                    <input
                      type="number"
                      min={0}
                      placeholder="Min Order ₹"
                      value={couponForm.minOrderInr}
                      onChange={(e) => setCouponForm({ ...couponForm, minOrderInr: e.target.value })}
                      className="rounded-lg border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-2.5 py-2 font-mono"
                    />
                  </div>
                  <button type="submit" className="px-4 py-2 bg-[#64B5F6] hover:bg-[#42A5F5] text-white rounded-lg font-semibold transition-colors">
                    Save Coupon
                  </button>
                </form>

                <div className="lg:col-span-7 rounded-xl border border-[#DCEAF5] bg-white p-6 space-y-3 shadow-sm">
                  <h2 className="font-display text-lg font-bold text-[#123B5D]">Active &amp; Paused Coupons</h2>
                  {(overview.coupons || []).map((c: any) => (
                    <div key={c.id} className="border-b border-[#DCEAF5] py-2.5 flex items-center justify-between gap-2">
                      <div>
                        <span className="font-mono font-bold text-sm text-[#123B5D]">{c.code}</span>
                        <span className="ml-2 text-[#263746]">
                          {c.discountType === 'percent' ? `${c.discountValue}% off` : `₹${c.discountValue} off`} (Min ₹{c.minOrderInr})
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleUpdateOrderTracking(`/api/admin/coupons/${c.id}`, { isActive: !c.isActive })}
                          className={`px-2.5 py-1 rounded font-semibold transition-colors ${
                            c.isActive ? 'bg-[#F0F8FF] text-[#123B5D] border border-[#90CAF9]' : 'bg-[#F0F8FF]/50 text-[#263746]/70 border border-[#DCEAF5]'
                          }`}
                        >
                          {c.isActive ? 'Active' : 'Paused'}
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            await apiFetch(`/api/admin/coupons/${c.id}`, { method: 'DELETE' });
                            loadAll();
                          }}
                          className="p-1 text-red-600 hover:bg-red-50 rounded transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ==================== PROJECTS, REVIEW, QUOTATIONS & PROGRESS UPDATES ==================== */}
            {tab === 'projects' && (() => {
              const allEnquiries = overview.projectEnquiries || [];
              const categoriesSet = Array.from(
                new Set(allEnquiries.map((e: any) => String(e.projectCategory || '')).filter(Boolean))
              ) as string[];
              const filteredEnquiries = allEnquiries.filter((enq: any) => {
                const q = projSearch.trim().toLowerCase();
                if (q) {
                  const hay = [
                    enq.enquiryNumber,
                    enq.customerName,
                    enq.customerEmail,
                    enq.customerPhone,
                    enq.projectTitle,
                  ]
                    .filter(Boolean)
                    .join(' ')
                    .toLowerCase();
                  if (!hay.includes(q)) return false;
                }
                if (projFilterCategory && enq.projectCategory !== projFilterCategory) return false;
                if (projFilterStatus && enq.status !== projFilterStatus) return false;
                if (projFilterDateFrom && String(enq.createdAt || '').slice(0, 10) < projFilterDateFrom) return false;
                if (projFilterDateTo && String(enq.createdAt || '').slice(0, 10) > projFilterDateTo) return false;
                return true;
              });

              return (
                <div className="space-y-8 text-xs">
                  {/* Search & Filter Controls */}
                  <div className="rounded-xl border border-[#DCEAF5] bg-white p-5 space-y-4 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h2 className="font-display text-xl font-bold text-[#123B5D]">
                          Registered Projects &amp; Review Queue ({filteredEnquiries.length}/{allEnquiries.length})
                        </h2>
                        <p className="text-[#263746]/70">
                          Search by Registration ID, customer name, phone, or email and filter by category, status, or submission date.
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => downloadAuthorizedCsv('/api/admin/projects/export', 'nexustekfusion-projects.csv')}
                          className="px-3 py-1.5 border border-[#90CAF9] bg-white text-[#123B5D] rounded-lg font-semibold hover:bg-[#F0F8FF] inline-flex items-center gap-1.5 transition-colors"
                        >
                          <Download className="w-3.5 h-3.5 text-[#42A5F5]" /> Export Projects CSV
                        </button>
                        {(projSearch || projFilterCategory || projFilterStatus || projFilterDateFrom || projFilterDateTo) && (
                          <button
                            type="button"
                            onClick={() => {
                              setProjSearch('');
                              setProjFilterCategory('');
                              setProjFilterStatus('');
                              setProjFilterDateFrom('');
                              setProjFilterDateTo('');
                            }}
                            className="px-3 py-1.5 border border-[#90CAF9] bg-white text-[#123B5D] rounded-lg font-semibold hover:bg-[#F0F8FF] transition-colors"
                          >
                            Reset Filters
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-[#42A5F5] absolute left-3 top-2.5" />
                        <input
                          value={projSearch}
                          onChange={(e) => setProjSearch(e.target.value)}
                          placeholder="Search ID, name, phone, email..."
                          className="w-full rounded-lg border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] pl-8 pr-3 py-2"
                        />
                      </div>
                      <select
                        value={projFilterCategory}
                        onChange={(e) => setProjFilterCategory(e.target.value)}
                        className="rounded-lg border border-[#DCEAF5] px-3 py-2 bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                      >
                        <option value="">All Categories</option>
                        {categoriesSet.map((cat) => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                      <select
                        value={projFilterStatus}
                        onChange={(e) => setProjFilterStatus(e.target.value)}
                        className="rounded-lg border border-[#DCEAF5] px-3 py-2 bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                      >
                        <option value="">All Statuses</option>
                        {[...ADMIN_PROJECT_STATUSES, 'Rejected'].map((st) => (
                          <option key={st} value={st}>{st}</option>
                        ))}
                      </select>
                      <input
                        type="date"
                        value={projFilterDateFrom}
                        onChange={(e) => setProjFilterDateFrom(e.target.value)}
                        title="Submission Date From"
                        className="rounded-lg border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-3 py-2 font-mono"
                      />
                      <input
                        type="date"
                        value={projFilterDateTo}
                        onChange={(e) => setProjFilterDateTo(e.target.value)}
                        title="Submission Date To"
                        className="rounded-lg border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-3 py-2 font-mono"
                      />
                    </div>
                  </div>

                  {/* Enquiries Review List */}
                  <div className="space-y-4">
                    {filteredEnquiries.length === 0 ? (
                      <div className="rounded-xl border border-[#DCEAF5] bg-white p-8 text-center text-[#263746]/70">
                        No registered projects match the active search or filters.
                      </div>
                    ) : (
                      filteredEnquiries.map((enq: any) => {
                        const enqQuotations = (overview.quotations || []).filter((q: any) => q.enquiryId === enq.id);
                        const enqMessages = (overview.projectMessages || []).filter((m: any) => m.enquiryId === enq.id);
                        const isExpanded = Boolean(projExpandedMap[enq.id]);

                        return (
                          <div key={enq.id} className="rounded-xl border border-[#DCEAF5] bg-white p-5 space-y-4 shadow-sm">
                            <div className="flex flex-wrap justify-between gap-3">
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-mono font-bold text-[#123B5D]">{enq.enquiryNumber}</span>
                                  <span className="text-[#263746]/50">·</span>
                                  <span className="font-semibold text-[#123B5D]">{enq.customerName}</span>
                                  {enq.customerCategory && (
                                    <span className="px-2 py-0.5 rounded bg-[#F0F8FF] border border-[#DCEAF5] text-[#123B5D] font-medium text-[10px]">
                                      {enq.customerCategory}
                                    </span>
                                  )}
                                  <span className="font-mono text-[#263746]/70">
                                    {enq.customerPhone} · {enq.customerEmail}
                                  </span>
                                </div>
                                <div className="font-display text-base font-bold text-[#123B5D] mt-1">
                                  {enq.projectTitle}
                                </div>
                                <div className="text-[11px] text-[#263746]/70 mt-0.5">
                                  {enq.projectCategory} · {enq.engineeringDomain || enq.engineeringBranch} · {enq.projectType}
                                  {enq.projectComplexity ? ` · ${enq.projectComplexity}` : ''}
                                  {enq.estimatedBudget ? ` · Budget: ${enq.estimatedBudget}` : ''}
                                  {enq.assignedEngineer ? ` · Assigned: ${enq.assignedEngineer}` : ''}
                                </div>
                              </div>

                              <div className="flex flex-wrap items-center gap-2">
                                <input
                                  placeholder="Assign Engineer / Manager"
                                  value={engineerMap[enq.id] ?? enq.assignedEngineer ?? ''}
                                  onChange={(e) => setEngineerMap({ ...engineerMap, [enq.id]: e.target.value })}
                                  className="w-40 rounded-lg border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-2.5 py-1.5"
                                />
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleUpdateOrderTracking(`/api/admin/project-enquiries/${enq.id}`, {
                                      status: 'Under Technical Evaluation',
                                      assignedEngineer: engineerMap[enq.id] ?? enq.assignedEngineer ?? '',
                                      adminNotes: adminNotesMap[enq.id] ?? enq.adminNotes ?? '',
                                    })
                                  }
                                  className="px-2.5 py-1.5 bg-[#64B5F6] hover:bg-[#42A5F5] text-white rounded-lg font-semibold transition-colors"
                                >
                                  Approve Review
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleUpdateOrderTracking(`/api/admin/project-enquiries/${enq.id}`, {
                                      status: 'Approved',
                                      approveProject: true,
                                      assignedEngineer: engineerMap[enq.id] ?? enq.assignedEngineer ?? '',
                                      adminNotes: adminNotesMap[enq.id] ?? enq.adminNotes ?? '',
                                    })
                                  }
                                  className="px-2.5 py-1.5 bg-[#123B5D] hover:bg-[#1E88E5] text-white rounded-lg font-semibold transition-colors"
                                >
                                  Approve &amp; Generate Agreement
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setClarifyOpenId(clarifyOpenId === enq.id ? 0 : enq.id)}
                                  className="px-2.5 py-1.5 border border-amber-400 text-amber-900 bg-amber-50 rounded-lg font-semibold"
                                >
                                  Request Info
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setRejectOpenId(rejectOpenId === enq.id ? 0 : enq.id)}
                                  className="px-2.5 py-1.5 border border-red-300 text-red-700 bg-red-50 rounded-lg font-semibold"
                                >
                                  Reject
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setQuoteEnquiryId(enq.id);
                                    setEditingQuotationId(0);
                                    setQuoteItems([]);
                                    setCostCategories(INITIAL_COST_CATEGORIES);
                                    setQuoteMeta((prev) => ({
                                      ...prev,
                                      advancePercent: settings.projectSettings?.defaultAdvancePercent ?? 50,
                                      validityDays: settings.projectSettings?.quotationValidityDays ?? 15,
                                    }));
                                  }}
                                  className="px-3 py-1.5 border border-[#90CAF9] bg-[#F0F8FF] hover:bg-[#DCEAF5] text-[#123B5D] rounded-lg font-semibold whitespace-nowrap transition-colors"
                                >
                                  Prepare Quotation
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setProjExpandedMap((prev) => ({ ...prev, [enq.id]: !prev[enq.id] }))
                                  }
                                  className="px-2.5 py-1.5 border border-[#90CAF9] bg-white text-[#123B5D] rounded-lg font-semibold hover:bg-[#F0F8FF] transition-colors"
                                >
                                  {isExpanded ? 'Hide Details' : 'Full Review'}
                                </button>
                              </div>
                            </div>

                            <p className="text-[#263746]">{enq.projectDescription}</p>
                            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono">
                              <span className="text-[#42A5F5] font-semibold">Status: {enq.status}</span>
                              <span className="text-[#263746]/70">
                                Submitted: {new Date(enq.createdAt).toLocaleString('en-IN')}
                              </span>
                            </div>

                            {/* Expanded Complete Submission + Internal Admin Review Notes */}
                            {isExpanded && (
                              <div className="rounded-lg border border-[#DCEAF5] bg-[#F0F8FF] p-4 space-y-3 text-[#263746]">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                  <div>
                                    <strong className="text-[#123B5D]">Contact:</strong> {enq.customerName} · {enq.customerPhone}
                                    {enq.whatsappNumber ? ` (WA: ${enq.whatsappNumber})` : ''}
                                  </div>
                                  <div>
                                    <strong className="text-[#123B5D]">Location:</strong> {enq.city || '—'}, {enq.state || '—'}
                                  </div>
                                  <div>
                                    <strong className="text-[#123B5D]">Institution / Dept:</strong> {enq.companyOrCollege || '—'} ({enq.courseDepartment || '—'})
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
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                                  <div><strong className="text-[#123B5D]">Tech / Language:</strong> {enq.requiredTechnologies || '—'}</div>
                                  <div><strong className="text-[#123B5D]">Target Completion:</strong> {enq.targetCompletionDate || '—'}</div>
                                  <div><strong className="text-[#123B5D]">Communication:</strong> {enq.flags?.consultationMode || '—'}</div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                                  {enq.hardwareRequirements && <div><strong className="text-[#123B5D]">Hardware:</strong> {enq.hardwareRequirements}</div>}
                                  {enq.softwareRequirements && <div><strong className="text-[#123B5D]">Software:</strong> {enq.softwareRequirements}</div>}
                                  {enq.componentsRequired && <div><strong className="text-[#123B5D]">Components:</strong> {enq.componentsRequired}</div>}
                                </div>
                                {enq.prototypeRequirements && (
                                  <div><strong className="text-[#123B5D]">Prototype Requirements:</strong> {enq.prototypeRequirements}</div>
                                )}
                                {enq.expectedDeliverables && (
                                  <div><strong className="text-[#123B5D]">Expected Output:</strong> {enq.expectedDeliverables}</div>
                                )}
                                <div>
                                  <strong className="text-[#123B5D]">Deliverables Requested:</strong> Physical Prototype ({enq.flags?.needPrototype ? 'Yes' : 'No'}) · App/Web ({enq.flags?.needMobileWebApp ? 'Yes' : 'No'}) · Documentation &amp; Report ({enq.flags?.needDocumentation ? 'Yes' : 'No'})
                                </div>

                                {/* Internal Admin Review Notes */}
                                <div className="pt-2 border-t border-[#DCEAF5] space-y-2">
                                  <label className="block font-semibold text-[#123B5D]">
                                    Internal Engineering Review Notes (Admin Only)
                                  </label>
                                  <div className="flex flex-wrap gap-2">
                                    <input
                                      value={adminNotesMap[enq.id] ?? enq.adminNotes ?? ''}
                                      onChange={(e) =>
                                        setAdminNotesMap((prev) => ({ ...prev, [enq.id]: e.target.value }))
                                      }
                                      placeholder="Feasibility notes, BOM observations, internal deadlines..."
                                      className="flex-1 min-w-[240px] rounded border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-3 py-1.5"
                                    />
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleUpdateOrderTracking(`/api/admin/project-enquiries/${enq.id}`, {
                                          adminNotes: adminNotesMap[enq.id] ?? enq.adminNotes ?? '',
                                          assignedEngineer: engineerMap[enq.id] ?? enq.assignedEngineer ?? '',
                                        })
                                      }
                                      className="px-3 py-1.5 bg-[#64B5F6] hover:bg-[#42A5F5] text-white rounded font-semibold transition-colors"
                                    >
                                      Save Review Notes
                                    </button>
                                  </div>
                                </div>
                              </div>
                            )}

                            {enq.rejectionReason && (
                              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-900">
                                <strong>Rejection Reason:</strong> {enq.rejectionReason}
                              </div>
                            )}
                            {enq.clarificationNotes && (
                              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
                                <strong>Additional Info Requested:</strong> {enq.clarificationNotes}
                              </div>
                            )}

                            {clarifyOpenId === enq.id && (
                              <div className="flex flex-wrap gap-2 bg-amber-50 p-3 rounded-lg border border-amber-200">
                                <input
                                  placeholder="Specify what additional information or documents are required from customer..."
                                  value={clarifyNotesMap[enq.id] || ''}
                                  onChange={(e) => setClarifyNotesMap({ ...clarifyNotesMap, [enq.id]: e.target.value })}
                                  className="flex-1 min-w-[240px] rounded border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-3 py-1.5"
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    handleUpdateOrderTracking(`/api/admin/project-enquiries/${enq.id}`, {
                                      status: 'Additional Information Required',
                                      clarificationNotes:
                                        clarifyNotesMap[enq.id] || 'Please upload detailed schematics or component requirements.',
                                    });
                                    setClarifyOpenId(0);
                                  }}
                                  className="px-3 py-1.5 bg-amber-700 text-white rounded font-semibold"
                                >
                                  Send Info Request
                                </button>
                              </div>
                            )}

                            {rejectOpenId === enq.id && (
                              <div className="flex flex-wrap gap-2 bg-red-50 p-3 rounded-lg border border-red-200">
                                <input
                                  required
                                  placeholder="Mandatory rejection reason (visible to customer)..."
                                  value={rejectReasonMap[enq.id] || ''}
                                  onChange={(e) => setRejectReasonMap({ ...rejectReasonMap, [enq.id]: e.target.value })}
                                  className="flex-1 min-w-[240px] rounded border border-red-300 bg-white px-3 py-1.5"
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    const reason = (rejectReasonMap[enq.id] || '').trim();
                                    if (!reason) {
                                      notify('Rejection reason is mandatory.', 'error');
                                      return;
                                    }
                                    handleUpdateOrderTracking(`/api/admin/project-enquiries/${enq.id}`, {
                                      status: 'Rejected',
                                      rejectionReason: reason,
                                    });
                                    setRejectOpenId(0);
                                  }}
                                  className="px-3 py-1.5 bg-red-700 text-white rounded font-semibold"
                                >
                                  Confirm Rejection
                                </button>
                              </div>
                            )}

                            {/* Download Customer-Uploaded Documents */}
                            {enq.attachments?.length > 0 && (
                              <div className="flex flex-wrap gap-2">
                                {enq.attachments.map((att: any, idx: number) => (
                                  <button
                                    key={idx}
                                    type="button"
                                    onClick={() => downloadAdminProtectedFile(att.storagePath, att.originalName)}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 border border-[#90CAF9] bg-white rounded text-[#123B5D] hover:bg-[#F0F8FF] transition-colors"
                                  >
                                    <Download className="w-3 h-3 text-[#42A5F5]" /> {att.originalName}
                                  </button>
                                ))}
                              </div>
                            )}

                            {/* Customer-Admin Messages Thread */}
                            {(enqMessages.length > 0 || isExpanded) && (
                              <div className="rounded-lg border border-[#DCEAF5] bg-[#F0F8FF] p-3 space-y-2">
                                <div className="font-semibold text-[#123B5D]">
                                  Communication Thread ({enqMessages.length})
                                </div>
                                {enqMessages.map((msg: any) => (
                                  <div
                                    key={msg.id}
                                    className={`p-2 rounded border ${
                                      msg.senderRole === 'admin'
                                        ? 'bg-white border-[#90CAF9]'
                                        : 'bg-white border-[#DCEAF5]'
                                    }`}
                                  >
                                    <div className="flex justify-between text-[10px] text-[#263746]/70">
                                      <span className="font-semibold text-[#123B5D]">
                                        {msg.senderName} ({msg.senderRole})
                                      </span>
                                      <span className="font-mono">
                                        {new Date(msg.createdAt).toLocaleString('en-IN')}
                                      </span>
                                    </div>
                                    <div className="text-[#263746] mt-0.5">{msg.message}</div>
                                    {msg.attachments?.length > 0 && (
                                      <div className="flex flex-wrap gap-1.5 mt-1">
                                        {msg.attachments.map((att: any, idx: number) => (
                                          <button
                                            key={idx}
                                            type="button"
                                            onClick={() => downloadAdminProtectedFile(att.storagePath, att.originalName)}
                                            className="px-2 py-0.5 border border-[#90CAF9] bg-white rounded text-[#123B5D] hover:bg-[#F0F8FF] inline-flex items-center gap-1"
                                          >
                                            <Download className="w-3 h-3 text-[#42A5F5]" /> {att.originalName}
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                ))}
                                <div className="flex flex-wrap gap-2 pt-1">
                                  <input
                                    placeholder="Message customer or reply to clarification..."
                                    value={adminMsgMap[enq.id] || ''}
                                    onChange={(e) =>
                                      setAdminMsgMap((prev) => ({ ...prev, [enq.id]: e.target.value }))
                                    }
                                    className="flex-1 min-w-[200px] rounded border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-2.5 py-1.5"
                                  />
                                  <label className="px-2.5 py-1.5 border border-[#90CAF9] bg-white text-[#123B5D] hover:bg-[#F0F8FF] rounded cursor-pointer font-medium transition-colors">
                                    {(adminMsgFilesMap[enq.id] || []).length > 0
                                      ? `${adminMsgFilesMap[enq.id].length} file(s)`
                                      : 'Attach'}
                                    <input
                                      type="file"
                                      multiple
                                      onChange={(e) =>
                                        setAdminMsgFilesMap((prev) => ({
                                          ...prev,
                                          [enq.id]: Array.from(e.target.files || []),
                                        }))
                                      }
                                      className="hidden"
                                    />
                                  </label>
                                  <button
                                    type="button"
                                    onClick={() => handleAdminSendMessage(enq.id)}
                                    className="px-3 py-1.5 bg-[#64B5F6] hover:bg-[#42A5F5] text-white rounded font-semibold transition-colors"
                                  >
                                    Send Reply
                                  </button>
                                </div>
                              </div>
                            )}

                            {/* Linked Quotations (Draft vs Published) */}
                            {enqQuotations.length > 0 && (
                              <div className="space-y-2 border-t border-[#DCEAF5] pt-3">
                                {enqQuotations.map((q: any) => (
                                  <div
                                    key={q.id}
                                    className={`rounded-lg border p-3 flex flex-wrap items-center justify-between gap-2 ${
                                      q.status === 'Draft'
                                        ? 'border-amber-300 bg-amber-50'
                                        : 'border-[#DCEAF5] bg-[#F0F8FF]'
                                    }`}
                                  >
                                    <div className="text-[#263746]">
                                      <span className="font-mono font-bold text-[#123B5D]">
                                        {q.quotationNumber || `QTN-${q.id}`} (Rev #{q.revisionNumber})
                                      </span>{' '}
                                      ·{' '}
                                      <span
                                        className={`font-semibold ${
                                          q.status === 'Draft' ? 'text-amber-900' : 'text-[#42A5F5]'
                                        }`}
                                      >
                                        {q.status === 'Draft' ? 'DRAFT (Hidden from Customer)' : q.status}
                                      </span>{' '}
                                      · Total ₹{Number(q.totalAmountInr || 0).toLocaleString('en-IN')}
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                      {q.status === 'Draft' && (
                                        <button
                                          type="button"
                                          onClick={() => handlePublishDraftQuotation(q.id)}
                                          className="px-3 py-1 bg-[#64B5F6] hover:bg-[#42A5F5] text-white rounded font-semibold transition-colors"
                                        >
                                          Approve &amp; Publish Quotation
                                        </button>
                                      )}
                                      {q.status !== 'Accepted' && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setQuoteEnquiryId(enq.id);
                                            setEditingQuotationId(q.id);
                                            setCostCategories({
                                              ...INITIAL_COST_CATEGORIES,
                                              ...(q.costCategories || {}),
                                            });
                                            setQuoteItems(q.items || []);
                                            setQuoteMeta({
                                              discountInr: Number(q.discountInr || 0),
                                              gstInr: Number(q.gstInr || 0),
                                              advancePercent: Number(q.advancePercent || 50),
                                              validityDays: Number(q.validityDays || 15),
                                              estimatedDuration: q.estimatedDuration || '3–4 Weeks',
                                              estimatedDeliveryDate: q.estimatedDeliveryDate || '',
                                              paymentTerms: q.paymentTerms || '50% Advance on Acceptance, 50% Balance Before Dispatch',
                                              termsAndConditions: q.termsAndConditions || '',
                                            });
                                          }}
                                          className="px-2.5 py-1 border border-[#90CAF9] bg-white text-[#123B5D] hover:bg-[#F0F8FF] rounded font-semibold transition-colors"
                                        >
                                          Edit Quote
                                        </button>
                                      )}
                                      <button
                                        type="button"
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
                                        className="px-2.5 py-1 border border-[#90CAF9] bg-white text-[#123B5D] hover:bg-[#F0F8FF] rounded font-semibold inline-flex items-center gap-1 transition-colors"
                                      >
                                        <Download className="w-3 h-3 text-[#42A5F5]" /> PDF
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Project Cost Estimation & Quotation Builder */}
                  {quoteEnquiryId > 0 && (() => {
                    const targetEnq = allEnquiries.find((e: any) => e.id === quoteEnquiryId);
                    return (
                      <div className="rounded-xl border border-[#90CAF9] bg-[#F0F8FF] p-6 space-y-6 shadow-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#DCEAF5] pb-3">
                          <h3 className="font-display font-bold text-lg text-[#123B5D]">
                            {editingQuotationId > 0 ? 'Edit Project Quotation' : 'Project Cost Estimation & Quotation Builder'} —{' '}
                            {targetEnq?.enquiryNumber} ({targetEnq?.projectTitle})
                          </h3>
                          <button
                            type="button"
                            onClick={() => {
                              setQuoteEnquiryId(0);
                              setEditingQuotationId(0);
                            }}
                            className="font-semibold text-[#263746]/80 hover:text-[#123B5D]"
                          >
                            Cancel
                          </button>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                          {COST_CATEGORY_FIELDS.map(([field, label]) => (
                            <div key={field}>
                              <label className="block font-medium text-[#123B5D] mb-1">{label}</label>
                              <input
                                type="number"
                                min={0}
                                value={costCategories[field] ?? 0}
                                onChange={(e) => setCostCategories({ ...costCategories, [field]: Number(e.target.value) })}
                                className="w-full rounded-lg border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-3 py-2 font-mono"
                              />
                            </div>
                          ))}
                        </div>

                        <div className="space-y-2 border-t border-[#DCEAF5] pt-4">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-[#123B5D]">Additional Custom BOM / Line Items</span>
                            <button
                              type="button"
                              onClick={() => setQuoteItems([...quoteItems, { name: '', description: '', qty: 1, unitPriceInr: 0 }])}
                              className="px-3 py-1 bg-white border border-[#90CAF9] text-[#123B5D] hover:bg-[#F0F8FF] rounded-lg font-semibold inline-flex items-center gap-1 transition-colors"
                            >
                              <Plus className="w-3.5 h-3.5 text-[#42A5F5]" /> Add Line Item
                            </button>
                          </div>
                          {quoteItems.map((it, idx) => (
                            <div key={idx} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center bg-white p-2.5 rounded-lg border border-[#DCEAF5]">
                              <input
                                placeholder="Item Name"
                                value={it.name}
                                onChange={(e) => {
                                  const next = [...quoteItems];
                                  next[idx] = { ...next[idx], name: e.target.value };
                                  setQuoteItems(next);
                                }}
                                className="sm:col-span-4 rounded border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-2.5 py-1.5"
                              />
                              <input
                                placeholder="Notes / Spec"
                                value={it.description}
                                onChange={(e) => {
                                  const next = [...quoteItems];
                                  next[idx] = { ...next[idx], description: e.target.value };
                                  setQuoteItems(next);
                                }}
                                className="sm:col-span-4 rounded border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-2.5 py-1.5"
                              />
                              <input
                                type="number"
                                min={1}
                                value={it.qty}
                                onChange={(e) => {
                                  const next = [...quoteItems];
                                  next[idx] = { ...next[idx], qty: Math.max(1, Number(e.target.value)) };
                                  setQuoteItems(next);
                                }}
                                className="sm:col-span-1 rounded border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-2 py-1.5 font-mono"
                              />
                              <input
                                type="number"
                                min={0}
                                value={it.unitPriceInr}
                                onChange={(e) => {
                                  const next = [...quoteItems];
                                  next[idx] = { ...next[idx], unitPriceInr: Number(e.target.value) };
                                  setQuoteItems(next);
                                }}
                                className="sm:col-span-2 rounded border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-2.5 py-1.5 font-mono"
                              />
                              <button
                                type="button"
                                onClick={() => setQuoteItems(quoteItems.filter((_, i) => i !== idx))}
                                className="sm:col-span-1 text-red-600 p-1 flex justify-center hover:bg-red-50 rounded"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          ))}
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 border-t border-[#DCEAF5] pt-4">
                          <div>
                            <label className="block font-medium text-[#123B5D] mb-1">Taxes / GST (₹)</label>
                            <input
                              type="number"
                              min={0}
                              value={quoteMeta.gstInr}
                              onChange={(e) => setQuoteMeta({ ...quoteMeta, gstInr: Number(e.target.value) })}
                              className="w-full rounded-lg border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-3 py-2 font-mono"
                            />
                          </div>
                          <div>
                            <label className="block font-medium text-[#123B5D] mb-1">Discount (₹)</label>
                            <input
                              type="number"
                              min={0}
                              value={quoteMeta.discountInr}
                              onChange={(e) => setQuoteMeta({ ...quoteMeta, discountInr: Number(e.target.value) })}
                              className="w-full rounded-lg border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-3 py-2 font-mono"
                            />
                          </div>
                          <div>
                            <label className="block font-medium text-[#123B5D] mb-1">Advance %</label>
                            <input
                              type="number"
                              min={10}
                              max={100}
                              value={quoteMeta.advancePercent}
                              onChange={(e) => setQuoteMeta({ ...quoteMeta, advancePercent: Number(e.target.value) })}
                              className="w-full rounded-lg border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-3 py-2 font-mono"
                            />
                          </div>
                          <div>
                            <label className="block font-medium text-[#123B5D] mb-1">Validity (Days)</label>
                            <input
                              type="number"
                              min={1}
                              value={quoteMeta.validityDays}
                              onChange={(e) => setQuoteMeta({ ...quoteMeta, validityDays: Number(e.target.value) })}
                              className="w-full rounded-lg border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-3 py-2 font-mono"
                            />
                          </div>
                          <div>
                            <label className="block font-medium text-[#123B5D] mb-1">Est. Duration</label>
                            <input
                              value={quoteMeta.estimatedDuration}
                              onChange={(e) => setQuoteMeta({ ...quoteMeta, estimatedDuration: e.target.value })}
                              className="w-full rounded-lg border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-3 py-2"
                            />
                          </div>
                          <div>
                            <label className="block font-medium text-[#123B5D] mb-1">Est. Delivery Date</label>
                            <input
                              type="date"
                              value={quoteMeta.estimatedDeliveryDate}
                              onChange={(e) => setQuoteMeta({ ...quoteMeta, estimatedDeliveryDate: e.target.value })}
                              className="w-full rounded-lg border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-3 py-2 font-mono"
                            />
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-xl border border-[#DCEAF5]">
                          <div className="font-mono font-bold text-[#123B5D] text-sm tabular-nums">
                            Total: ₹{computedQuoteTotal.toLocaleString('en-IN')} · Advance ({quoteMeta.advancePercent}%): ₹
                            {computedAdvanceInr.toLocaleString('en-IN')} · Remaining: ₹
                            {(computedQuoteTotal - computedAdvanceInr).toLocaleString('en-IN')}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {targetEnq && (
                              <button
                                type="button"
                                onClick={() =>
                                  downloadQuotationPdf({
                                    enquiryNumber: targetEnq.enquiryNumber,
                                    projectTitle: targetEnq.projectTitle,
                                    customerName: targetEnq.customerName,
                                    customerEmail: targetEnq.customerEmail,
                                    customerPhone: targetEnq.customerPhone,
                                    customerCategory: targetEnq.customerCategory,
                                    quotation: {
                                      id: editingQuotationId || 0,
                                      revisionNumber: 1,
                                      items: quoteItems,
                                      hardwareCostInr: costCategories.hardware,
                                      softwareCostInr: costCategories.software,
                                      designDevChargesInr: costCategories.development,
                                      testingChargesInr: costCategories.testing,
                                      documentationChargesInr: costCategories.documentation,
                                      deliveryChargesInr: costCategories.delivery,
                                      costCategories,
                                      validityDays: quoteMeta.validityDays,
                                      estimatedDuration: quoteMeta.estimatedDuration,
                                      estimatedDeliveryDate: quoteMeta.estimatedDeliveryDate,
                                      paymentTerms: quoteMeta.paymentTerms,
                                      termsAndConditions: quoteMeta.termsAndConditions,
                                      discountInr: quoteMeta.discountInr,
                                      gstInr: quoteMeta.gstInr,
                                      totalAmountInr: computedQuoteTotal,
                                      advancePercent: quoteMeta.advancePercent,
                                      advanceAmountInr: computedAdvanceInr,
                                      balanceAmountInr: computedQuoteTotal - computedAdvanceInr,
                                      status: 'Draft Preview',
                                      createdAt: new Date().toISOString(),
                                    },
                                    gstin: settings.companyInfo?.gstin,
                                  })
                                }
                                className="px-4 py-2 border border-[#90CAF9] bg-white text-[#123B5D] hover:bg-[#F0F8FF] rounded-lg font-semibold inline-flex items-center gap-1.5 transition-colors"
                              >
                                <Download className="w-3.5 h-3.5 text-[#42A5F5]" /> Preview PDF
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleSubmitQuotation(true)}
                              className="px-4 py-2 border border-amber-400 bg-amber-50 hover:bg-amber-100 text-amber-950 rounded-lg font-semibold"
                            >
                              Save Draft (Hidden)
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSubmitQuotation(false)}
                              className="px-5 py-2 bg-[#64B5F6] hover:bg-[#42A5F5] text-white rounded-lg font-semibold transition-colors"
                            >
                              Approve &amp; Publish Quotation
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Active Projects, Progress Updates & Handover */}
                  <div className="space-y-4">
                    <h2 className="font-display text-xl font-bold text-[#123B5D]">
                      Active Projects, Progress Updates &amp; Deliverable Handover ({(overview.projects || []).length})
                    </h2>
                    {(overview.projects || []).map((p: any) => {
                      const enq = allEnquiries.find((e: any) => e.id === p.enquiryId);
                      const quot = (overview.quotations || []).find((q: any) => q.id === p.quotationId);
                      const milestones = (overview.projectPaymentMilestones || []).filter(
                        (m: any) => m.projectId === p.id || (p.quotationId && m.quotationId === p.quotationId)
                      );
                      const receipts = (overview.receipts || []).filter(
                        (r: any) => r.entityType === 'project_quotation' && r.entityId === p.quotationId
                      );
                      const clearanceCert = (overview.clearanceCertificates || []).find(
                        (c: any) => c.projectId === p.id
                      );
                      const workOrder = (overview.workOrders || []).find((w: any) => w.projectId === p.id);
                      const handoverDocs = (overview.handoverDocuments || []).filter((d: any) => d.projectId === p.id);
                      const deliveryRecords = (overview.deliveryRecords || []).filter((d: any) => d.projectId === p.id);
                      const updForm = progUpdateFormMap[p.id] || {
                        category: 'Hardware Design',
                        title: '',
                        description: '',
                        progressPercentage: Number(p.progressPercent || 25),
                        adminComments: '',
                        nextStatus: '',
                      };
                      const updFiles = progUpdateFilesMap[p.id] || { photos: [], videos: [], reports: [] };
                      const compForm = completeProofMap[p.id] || { notes: '', files: [] };

                      return (
                        <div key={p.id} className="rounded-xl border border-[#DCEAF5] bg-white p-5 space-y-4 shadow-sm">
                          <div className="flex flex-wrap justify-between items-center gap-3">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-mono font-bold text-[#123B5D]">{p.projectCode}</span>
                                <span className="text-[#123B5D] font-semibold">— {p.title}</span>
                                {(p.customerId || enq?.customerId) && (
                                  <button
                                    type="button"
                                    onClick={() => jumpToCustomerProfile(p.customerId || enq?.customerId || enq?.customerEmail)}
                                    className="px-2 py-0.5 rounded bg-[#F0F8FF] border border-[#90CAF9] font-mono text-[10px] font-bold text-[#123B5D] hover:bg-[#DCEAF5]"
                                  >
                                    {p.customerId || enq?.customerId}
                                  </button>
                                )}
                              </div>
                              <div className="text-[11px] text-[#263746]/70 mt-0.5">
                                Client: {enq?.customerName || '—'} ({enq?.customerEmail || ''}) · Engineer:{' '}
                                {p.assignedEngineer || 'Unassigned'} · Progress: {Number(p.progressPercent || 0)}% ·
                                Budget: ₹{Number(p.budgetInr || p.totalAmountInr || 0).toLocaleString('en-IN')}
                              </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setProgUpdateOpenId(progUpdateOpenId === p.id ? 0 : p.id)}
                                className="px-3 py-1.5 bg-[#64B5F6] hover:bg-[#42A5F5] text-white rounded-lg font-semibold transition-colors"
                              >
                                {progUpdateOpenId === p.id ? 'Close Update Form' : 'Publish Progress Update'}
                              </button>
                              <button
                                type="button"
                                onClick={() => setCompleteOpenId(completeOpenId === p.id ? 0 : p.id)}
                                className="px-3 py-1.5 border border-[#90CAF9] bg-[#F0F8FF] hover:bg-[#DCEAF5] text-[#123B5D] rounded-lg font-semibold transition-colors"
                              >
                                Mark Project Completed
                              </button>
                              <select
                                value={p.status}
                                onChange={(e) =>
                                  handleUpdateOrderTracking(`/api/admin/projects/${p.id}`, { status: e.target.value })
                                }
                                className="rounded-lg border border-[#DCEAF5] px-3 py-1.5 bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] font-semibold"
                              >
                                {ADMIN_PROJECT_STATUSES.map((s) => (
                                  <option key={s} value={s}>{s}</option>
                                ))}
                              </select>
                              <button
                                type="button"
                                onClick={() =>
                                  setArchiveConfirm({
                                    title: `Archive Project ${p.projectCode}`,
                                    subtitle:
                                      'Project milestones, files, and payment history remain preserved in Supabase audit trail.',
                                    endpoint: `/api/admin/projects/${p.id}`,
                                    reason: '',
                                    busy: false,
                                  })
                                }
                                className="px-2.5 py-1.5 border border-amber-300 text-amber-800 hover:bg-amber-50 rounded-lg font-semibold"
                              >
                                Archive
                              </button>
                            </div>
                          </div>

                          {/* Budget, Technical Notes & Design Documents */}
                          <div className="rounded-lg border border-[#DCEAF5] bg-[#F0F8FF]/45 p-3.5 space-y-2.5">
                            <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 items-center">
                              <div className="md:col-span-3">
                                <label className="block text-[10px] font-semibold uppercase text-[#123B5D]/75 mb-1">
                                  Project Budget (INR)
                                </label>
                                <input
                                  type="number"
                                  value={projectBudgetDraftMap[p.id] ?? String(p.budgetInr || p.totalAmountInr || 0)}
                                  onChange={(e) =>
                                    setProjectBudgetDraftMap((prev) => ({ ...prev, [p.id]: e.target.value }))
                                  }
                                  className="w-full rounded border border-[#DCEAF5] bg-white px-2.5 py-1.5 font-mono text-[#123B5D]"
                                />
                              </div>
                              <div className="md:col-span-7">
                                <label className="block text-[10px] font-semibold uppercase text-[#123B5D]/75 mb-1">
                                  Engineering Technical Notes
                                </label>
                                <input
                                  value={projectTechNotesMap[p.id] ?? String(p.technicalNotes || '')}
                                  onChange={(e) =>
                                    setProjectTechNotesMap((prev) => ({ ...prev, [p.id]: e.target.value }))
                                  }
                                  placeholder="BOM tolerances, firmware version, acceptance notes..."
                                  className="w-full rounded border border-[#DCEAF5] bg-white px-2.5 py-1.5 text-[#123B5D]"
                                />
                              </div>
                              <div className="md:col-span-2 pt-4">
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleUpdateOrderTracking(`/api/admin/projects/${p.id}`, {
                                      budgetInr: Number(projectBudgetDraftMap[p.id] ?? p.budgetInr ?? 0),
                                      technicalNotes: projectTechNotesMap[p.id] ?? p.technicalNotes ?? '',
                                    })
                                  }
                                  className="w-full px-3 py-1.5 rounded bg-[#42A5F5] hover:bg-[#1E88E5] text-white font-semibold"
                                >
                                  Save Specs
                                </button>
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#DCEAF5]">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-[11px] font-semibold text-[#123B5D]">
                                  Design Docs &amp; Quotations ({Array.isArray(p.designDocuments) ? p.designDocuments.length : 0}):
                                </span>
                                {(Array.isArray(p.designDocuments) ? p.designDocuments : []).map((doc: any, dIdx: number) => (
                                  <button
                                    key={dIdx}
                                    type="button"
                                    onClick={() => downloadAdminProtectedFile(doc.storagePath, doc.originalName)}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-[#90CAF9] bg-white text-[#123B5D] hover:bg-[#F0F8FF] text-[11px]"
                                  >
                                    <Download className="w-3 h-3 text-[#42A5F5]" /> {doc.originalName}
                                  </button>
                                ))}
                              </div>
                              <div className="flex items-center gap-2">
                                <label className="px-2.5 py-1 rounded border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] font-medium cursor-pointer">
                                  {(projectDocFilesMap[p.id] || []).length > 0
                                    ? `${projectDocFilesMap[p.id].length} file(s)`
                                    : 'Choose Design / Quote Files'}
                                  <input
                                    type="file"
                                    multiple
                                    accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx,.csv,.zip,.txt,.stl,.step,.dwg,.dxf"
                                    onChange={(e) =>
                                      setProjectDocFilesMap((prev) => ({
                                        ...prev,
                                        [p.id]: Array.from(e.target.files || []),
                                      }))
                                    }
                                    className="hidden"
                                  />
                                </label>
                                <button
                                  type="button"
                                  disabled={uploadingProjDocsId === p.id || !(projectDocFilesMap[p.id] || []).length}
                                  onClick={async () => {
                                    const files = projectDocFilesMap[p.id] || [];
                                    if (!files.length) return;
                                    setUploadingProjDocsId(p.id);
                                    try {
                                      const fd = new FormData();
                                      fd.append('kind', 'design_document');
                                      files.forEach((f) => fd.append('documents', f));
                                      await apiFetch(`/api/admin/projects/${p.id}/documents`, {
                                        method: 'POST',
                                        body: fd,
                                      });
                                      setProjectDocFilesMap((prev) => ({ ...prev, [p.id]: [] }));
                                      notify('Project design documents uploaded.', 'success');
                                      loadAll(true);
                                    } catch (err: any) {
                                      notify(err?.message || 'Document upload failed.', 'error');
                                    } finally {
                                      setUploadingProjDocsId(0);
                                    }
                                  }}
                                  className="px-3 py-1 rounded bg-[#123B5D] hover:bg-[#1E88E5] text-white font-semibold disabled:opacity-50"
                                >
                                  {uploadingProjDocsId === p.id ? 'Uploading...' : 'Upload Docs'}
                                </button>
                              </div>
                            </div>
                          </div>

                          {/* Structured Progress Update Publisher */}
                          {progUpdateOpenId === p.id && (
                            <div className="rounded-xl border border-[#90CAF9] bg-[#F0F8FF] p-4 space-y-3">
                              <div className="font-semibold text-[#123B5D]">
                                Publish Engineering Progress Update ({p.projectCode})
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <select
                                  value={updForm.category}
                                  onChange={(e) =>
                                    setProgUpdateFormMap((prev) => ({
                                      ...prev,
                                      [p.id]: { ...updForm, category: e.target.value },
                                    }))
                                  }
                                  className="rounded border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-2.5 py-2"
                                >
                                  {ADMIN_UPDATE_CATEGORIES.map((cat) => (
                                    <option key={cat} value={cat}>{cat}</option>
                                  ))}
                                </select>
                                <input
                                  placeholder="Update Title *"
                                  value={updForm.title}
                                  onChange={(e) =>
                                    setProgUpdateFormMap((prev) => ({
                                      ...prev,
                                      [p.id]: { ...updForm, title: e.target.value },
                                    }))
                                  }
                                  className="rounded border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-2.5 py-2"
                                />
                                <div className="flex items-center gap-2">
                                  <span className="text-[11px] font-mono text-[#123B5D] whitespace-nowrap">
                                    Progress: {updForm.progressPercentage}%
                                  </span>
                                  <input
                                    type="number"
                                    min={0}
                                    max={100}
                                    value={updForm.progressPercentage}
                                    onChange={(e) =>
                                      setProgUpdateFormMap((prev) => ({
                                        ...prev,
                                        [p.id]: {
                                          ...updForm,
                                          progressPercentage: Math.min(100, Math.max(0, Number(e.target.value) || 0)),
                                        },
                                      }))
                                    }
                                    className="w-20 rounded border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-2 py-2 font-mono"
                                  />
                                </div>
                              </div>
                              <textarea
                                rows={2}
                                placeholder="Detailed progress description *"
                                value={updForm.description}
                                onChange={(e) =>
                                  setProgUpdateFormMap((prev) => ({
                                    ...prev,
                                    [p.id]: { ...updForm, description: e.target.value },
                                  }))
                                }
                                className="w-full rounded border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-3 py-2"
                              />
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <input
                                  placeholder="Engineer / Admin Comments (optional)"
                                  value={updForm.adminComments}
                                  onChange={(e) =>
                                    setProgUpdateFormMap((prev) => ({
                                      ...prev,
                                      [p.id]: { ...updForm, adminComments: e.target.value },
                                    }))
                                  }
                                  className="rounded border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-3 py-2"
                                />
                                <select
                                  value={updForm.nextStatus}
                                  onChange={(e) =>
                                    setProgUpdateFormMap((prev) => ({
                                      ...prev,
                                      [p.id]: { ...updForm, nextStatus: e.target.value },
                                    }))
                                  }
                                  className="rounded border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-3 py-2"
                                >
                                  <option value="">Keep Status / Auto-Update</option>
                                  {ADMIN_PROJECT_STATUSES.map((st) => (
                                    <option key={st} value={st}>{st}</option>
                                  ))}
                                </select>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[#123B5D]">
                                <label className="rounded border border-dashed border-[#90CAF9] bg-white hover:bg-[#F0F8FF]/40 p-2.5 cursor-pointer text-center font-medium transition-colors">
                                  Photos ({updFiles.photos.length})
                                  <input
                                    type="file"
                                    multiple
                                    accept=".png,.jpg,.jpeg,.webp"
                                    onChange={(e) =>
                                      setProgUpdateFilesMap((prev) => ({
                                        ...prev,
                                        [p.id]: { ...updFiles, photos: Array.from(e.target.files || []) },
                                      }))
                                    }
                                    className="hidden"
                                  />
                                </label>
                                <label className="rounded border border-dashed border-[#90CAF9] bg-white hover:bg-[#F0F8FF]/40 p-2.5 cursor-pointer text-center font-medium transition-colors">
                                  Videos ({updFiles.videos.length})
                                  <input
                                    type="file"
                                    multiple
                                    accept=".mp4,.mov,.avi,.mkv"
                                    onChange={(e) =>
                                      setProgUpdateFilesMap((prev) => ({
                                        ...prev,
                                        [p.id]: { ...updFiles, videos: Array.from(e.target.files || []) },
                                      }))
                                    }
                                    className="hidden"
                                  />
                                </label>
                                <label className="rounded border border-dashed border-[#90CAF9] bg-white hover:bg-[#F0F8FF]/40 p-2.5 cursor-pointer text-center font-medium transition-colors">
                                  Test Reports ({updFiles.reports.length})
                                  <input
                                    type="file"
                                    multiple
                                    accept=".pdf,.doc,.docx,.xlsx,.csv,.txt,.zip"
                                    onChange={(e) =>
                                      setProgUpdateFilesMap((prev) => ({
                                        ...prev,
                                        [p.id]: { ...updFiles, reports: Array.from(e.target.files || []) },
                                      }))
                                    }
                                    className="hidden"
                                  />
                                </label>
                              </div>
                              <button
                                type="button"
                                onClick={() => handlePostProgressUpdate(p.id)}
                                className="px-4 py-2 bg-[#64B5F6] hover:bg-[#42A5F5] text-white rounded-lg font-semibold transition-colors"
                              >
                                Publish Update to Customer
                              </button>
                            </div>
                          )}

                          {/* Mark Project Completed Panel */}
                          {completeOpenId === p.id && (
                            <div className="rounded-xl border border-[#90CAF9] bg-[#F0F8FF] p-4 space-y-3">
                              <div className="font-semibold text-[#123B5D]">
                                Mark Project Completed &amp; Request Final 50% Balance (if unpaid)
                              </div>
                              <textarea
                                rows={2}
                                placeholder="Final testing summary & completion remarks..."
                                value={compForm.notes}
                                onChange={(e) =>
                                  setCompleteProofMap((prev) => ({
                                    ...prev,
                                    [p.id]: { ...compForm, notes: e.target.value },
                                  }))
                                }
                                className="w-full rounded border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-3 py-2"
                              />
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <label className="px-3 py-2 border border-[#90CAF9] bg-white text-[#123B5D] hover:bg-[#F0F8FF] rounded cursor-pointer font-medium transition-colors">
                                  Upload Completion Proof ({compForm.files.length} file(s))
                                  <input
                                    type="file"
                                    multiple
                                    onChange={(e) =>
                                      setCompleteProofMap((prev) => ({
                                        ...prev,
                                        [p.id]: { ...compForm, files: Array.from(e.target.files || []) },
                                      }))
                                    }
                                    className="hidden"
                                  />
                                </label>
                                <button
                                  type="button"
                                  onClick={() => handleCompleteProject(p.id)}
                                  className="px-4 py-2 bg-[#64B5F6] hover:bg-[#42A5F5] text-white rounded-lg font-semibold transition-colors"
                                >
                                  Confirm Project Completed
                                </button>
                              </div>
                            </div>
                          )}

                          <ProjectPaymentsAndInstallmentsPanel
                            project={p}
                            enquiry={enq}
                            paymentSummary={(overview.projectPayments || []).find((pp: any) => pp.projectId === p.id)}
                            installments={(overview.paymentInstallments || []).filter((inst: any) => inst.projectId === p.id)}
                            transactions={(overview.paymentTransactions || []).filter((tx: any) => tx.projectId === p.id)}
                            reminders={(overview.paymentReminders || []).filter((r: any) => r.projectId === p.id)}
                            attachments={(overview.projectAttachments || []).filter(
                              (a: any) => a.projectId === p.id || (p.enquiryId && a.enquiryId === p.enquiryId)
                            )}
                            agreements={(overview.projectAgreements || []).filter(
                              (ag: any) => ag.projectId === p.id || (p.enquiryId && ag.enquiryId === p.enquiryId)
                            )}
                            onRefresh={() => loadAll(true)}
                            onDownloadFile={(storagePath, fileName) => downloadAdminProtectedFile(storagePath, fileName)}
                          />

                          <ProjectHandoverControlsPanel
                            project={p}
                            customerEmail={enq?.customerEmail || ''}
                            quotation={quot}
                            milestones={milestones}
                            receipts={receipts}
                            clearanceCert={clearanceCert}
                            workOrder={workOrder}
                            handoverDocs={handoverDocs}
                            deliveryRecords={deliveryRecords}
                            isSuperAdmin={dbUser?.role === 'super_admin'}
                            onRefresh={loadAll}
                          />
                        </div>
                      );
                    })}
                  </div>

                  <ProjectAgreementsAdminPanel
                    projects={overview.projects || []}
                    enquiries={overview.projectEnquiries || []}
                    onRefreshOverview={() => loadAll(true)}
                  />
                </div>
              );
            })()}

            {/* ==================== 3D PRINTING LAB ==================== */}
            {tab === 'printing' && (
              <div className="space-y-6 text-xs">
                <PrintingOrdersAdminPanel
                  orders={overview.printingOrders || []}
                  onRefresh={loadAll}
                />

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      await apiFetch('/api/admin/printing-materials', {
                        method: 'POST',
                        body: JSON.stringify(newMat),
                      });
                      notify('3D Material added.', 'success');
                      setNewMat({ name: '', technology: 'FDM', densityGcm3: '1.24', ratePerGramInr: '8', description: '' });
                      loadAll();
                      refreshBootstrap();
                    }}
                    className="rounded-xl border border-[#DCEAF5] bg-white p-5 space-y-3 shadow-sm"
                  >
                    <h3 className="font-display font-bold text-base text-[#123B5D]">Add 3D Printing Material</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <input
                        required
                        placeholder="Material Name"
                        value={newMat.name}
                        onChange={(e) => setNewMat({ ...newMat, name: e.target.value })}
                        className="rounded-lg border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-3 py-2"
                      />
                      <select
                        value={newMat.technology}
                        onChange={(e) => setNewMat({ ...newMat, technology: e.target.value })}
                        className="rounded-lg border border-[#DCEAF5] px-3 py-2 bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                      >
                        <option value="FDM">FDM</option>
                        <option value="SLA">SLA</option>
                      </select>
                      <input
                        required
                        placeholder="Density g/cm³"
                        value={newMat.densityGcm3}
                        onChange={(e) => setNewMat({ ...newMat, densityGcm3: e.target.value })}
                        className="rounded-lg border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-3 py-2 font-mono"
                      />
                      <input
                        required
                        placeholder="Rate ₹/g"
                        value={newMat.ratePerGramInr}
                        onChange={(e) => setNewMat({ ...newMat, ratePerGramInr: e.target.value })}
                        className="rounded-lg border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-3 py-2 font-mono"
                      />
                    </div>
                    <button type="submit" className="px-4 py-2 bg-[#64B5F6] hover:bg-[#42A5F5] text-white rounded-lg font-semibold transition-colors">
                      Add Material
                    </button>
                  </form>

                  <div className="rounded-xl border border-[#DCEAF5] bg-white p-5 space-y-3 shadow-sm">
                    <h3 className="font-display font-bold text-base text-[#123B5D]">Configured 3D Printers</h3>
                    {printConfig.machines.map((m) => (
                      <div key={m.id} className="border-b border-[#DCEAF5] pb-2">
                        <div className="font-semibold text-[#123B5D]">{m.name} ({m.technology})</div>
                        <div className="text-[#263746]/70 font-mono">
                          Build: {m.buildVolumeX}×{m.buildVolumeY}×{m.buildVolumeZ} mm · ₹{m.hourlyRateInr}/hr · Min ₹{m.minOrderInr}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ==================== PCB & B2B ==================== */}
            {tab === 'pcb_b2b' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 text-xs">
                <div className="rounded-xl border border-[#DCEAF5] bg-white p-6 space-y-4 shadow-sm">
                  <h2 className="font-display text-lg font-bold text-[#123B5D]">PCB Enquiries</h2>
                  {overview.pcbEnquiries.map((pcb: any) => (
                    <div key={pcb.id} className="border-b border-[#DCEAF5] pb-3 space-y-2 text-[#263746]">
                      <div className="font-mono font-bold text-[#123B5D]">{pcb.enquiryNumber} · {pcb.customerName}</div>
                      <div>{pcb.boardDimensionsMm} · {pcb.layerCount}L · Qty {pcb.boardQuantity} · {pcb.status}</div>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={1}
                          placeholder="Quote INR"
                          value={pcbQuoteMap[pcb.id] ?? (pcb.quotedAmountInr ? String(pcb.quotedAmountInr) : '')}
                          onChange={(e) => setPcbQuoteMap({ ...pcbQuoteMap, [pcb.id]: e.target.value })}
                          className="w-32 rounded border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-2.5 py-1 font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const val = Number(pcbQuoteMap[pcb.id] ?? pcb.quotedAmountInr ?? 0);
                            if (!val) return notify('Enter a valid INR quote amount.', 'error');
                            handleUpdateOrderTracking(`/api/admin/pcb-enquiries/${pcb.id}`, {
                              quotedAmountInr: val,
                              status: 'Quotation Sent',
                            });
                          }}
                          className="px-3 py-1 bg-[#64B5F6] hover:bg-[#42A5F5] text-white rounded font-semibold transition-colors"
                        >
                          Send PCB Quote
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="rounded-xl border border-[#DCEAF5] bg-white p-6 space-y-4 shadow-sm">
                  <h2 className="font-display text-lg font-bold text-[#123B5D]">B2B Bulk Enquiries</h2>
                  {overview.b2bEnquiries.map((b2b: any) => (
                    <div key={b2b.id} className="border-b border-[#DCEAF5] pb-3 space-y-2 text-[#263746]">
                      <div className="font-mono font-bold text-[#123B5D]">{b2b.enquiryNumber} · {b2b.companyName}</div>
                      <div>{b2b.requirementCategory} · Qty {b2b.quantity} · {b2b.status}</div>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={1}
                          placeholder="Bulk Quote INR"
                          value={b2bQuoteMap[b2b.id] ?? (b2b.quotedAmountInr ? String(b2b.quotedAmountInr) : '')}
                          onChange={(e) => setB2bQuoteMap({ ...b2bQuoteMap, [b2b.id]: e.target.value })}
                          className="w-32 rounded border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-2.5 py-1 font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const val = Number(b2bQuoteMap[b2b.id] ?? b2b.quotedAmountInr ?? 0);
                            if (!val) return notify('Enter a valid INR bulk quote amount.', 'error');
                            handleUpdateOrderTracking(`/api/admin/b2b-enquiries/${b2b.id}`, {
                              quotedAmountInr: val,
                              status: 'Quotation Sent',
                            });
                          }}
                          className="px-3 py-1 bg-[#64B5F6] hover:bg-[#42A5F5] text-white rounded font-semibold transition-colors"
                        >
                          Send Bulk Quote
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ==================== CRM LEADS PIPELINE & NOTES ==================== */}
            {tab === 'crm' && (
              <div className="space-y-6 text-xs">
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    await apiFetch('/api/admin/crm/leads', {
                      method: 'POST',
                      body: JSON.stringify({
                        ...leadForm,
                        estimatedValueInr: Number(leadForm.estimatedValueInr || 0),
                      }),
                    });
                    setLeadForm({
                      name: '',
                      email: '',
                      phone: '',
                      companyOrCollege: '',
                      source: 'manual',
                      stage: 'New Lead',
                      estimatedValueInr: '0',
                      nextFollowUpDate: '',
                      summary: '',
                    });
                    notify('CRM lead created.', 'success');
                    loadAll();
                  }}
                  className="rounded-xl border border-[#DCEAF5] bg-white p-5 space-y-3 shadow-sm"
                >
                  <h2 className="font-display text-base font-bold text-[#123B5D]">Add New CRM Lead</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                    <input
                      required
                      placeholder="Lead / Client Name *"
                      value={leadForm.name}
                      onChange={(e) => setLeadForm({ ...leadForm, name: e.target.value })}
                      className="rounded border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-2.5 py-2"
                    />
                    <input
                      placeholder="Email"
                      value={leadForm.email}
                      onChange={(e) => setLeadForm({ ...leadForm, email: e.target.value })}
                      className="rounded border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-2.5 py-2"
                    />
                    <input
                      placeholder="Phone"
                      value={leadForm.phone}
                      onChange={(e) => setLeadForm({ ...leadForm, phone: e.target.value })}
                      className="rounded border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-2.5 py-2"
                    />
                    <input
                      placeholder="Company / College"
                      value={leadForm.companyOrCollege}
                      onChange={(e) => setLeadForm({ ...leadForm, companyOrCollege: e.target.value })}
                      className="rounded border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-2.5 py-2"
                    />
                    <select
                      value={leadForm.stage}
                      onChange={(e) => setLeadForm({ ...leadForm, stage: e.target.value })}
                      className="rounded border border-[#DCEAF5] px-2.5 py-2 bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                    >
                      {CRM_STAGES.map((st) => (
                        <option key={st} value={st}>{st}</option>
                      ))}
                    </select>
                    <input
                      type="number"
                      placeholder="Est. Value ₹"
                      value={leadForm.estimatedValueInr}
                      onChange={(e) => setLeadForm({ ...leadForm, estimatedValueInr: e.target.value })}
                      className="rounded border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-2.5 py-2 font-mono"
                    />
                    <input
                      type="date"
                      value={leadForm.nextFollowUpDate}
                      onChange={(e) => setLeadForm({ ...leadForm, nextFollowUpDate: e.target.value })}
                      className="rounded border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-2.5 py-2"
                    />
                    <button type="submit" className="px-4 py-2 bg-[#64B5F6] hover:bg-[#42A5F5] text-white rounded font-semibold transition-colors">
                      Add Lead
                    </button>
                  </div>
                  <input
                    placeholder="Requirement Summary"
                    value={leadForm.summary}
                    onChange={(e) => setLeadForm({ ...leadForm, summary: e.target.value })}
                    className="w-full rounded border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-2.5 py-2"
                  />
                </form>

                <div className="flex flex-wrap gap-1.5">
                  {['All', ...CRM_STAGES].map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setCrmStageFilter(st)}
                      className={`px-3 py-1.5 rounded-lg font-semibold transition-colors ${
                        crmStageFilter === st ? 'bg-[#64B5F6] text-white' : 'bg-white border border-[#DCEAF5] text-[#123B5D] hover:bg-[#F0F8FF]'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>

                <div className="space-y-3">
                  {(overview.crmLeads || [])
                    .filter((l: any) => crmStageFilter === 'All' || l.stage === crmStageFilter)
                    .map((lead: any) => {
                      const notesForLead = (overview.crmNotes || []).filter(
                        (n: any) => n.entityType === 'crm_lead' && n.entityId === lead.id
                      );
                      return (
                        <div key={lead.id} className="rounded-xl border border-[#DCEAF5] bg-white p-5 space-y-3 shadow-sm">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <div className="font-display font-bold text-sm text-[#123B5D]">{lead.name}</div>
                              <div className="text-[#263746]/70 font-mono">
                                {lead.email || '—'} · {lead.phone || '—'} · Source: {lead.source} · Est: ₹{(lead.estimatedValueInr || 0).toLocaleString('en-IN')}
                              </div>
                              {lead.summary && <p className="text-[#263746] mt-1">{lead.summary}</p>}
                            </div>
                            <div className="flex items-center gap-2">
                              <select
                                value={lead.stage}
                                onChange={(e) =>
                                  handleUpdateOrderTracking(`/api/admin/crm/leads/${lead.id}`, { stage: e.target.value })
                                }
                                className="rounded border border-[#DCEAF5] px-2.5 py-1.5 bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] font-semibold"
                              >
                                {CRM_STAGES.map((st) => (
                                  <option key={st} value={st}>{st}</option>
                                ))}
                              </select>
                              <button
                                type="button"
                                onClick={async () => {
                                  await apiFetch(`/api/admin/crm/leads/${lead.id}`, { method: 'DELETE' });
                                  loadAll();
                                }}
                                className="p-1.5 text-red-600 border border-red-200 rounded hover:bg-red-50 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          {notesForLead.length > 0 && (
                            <div className="space-y-1 bg-[#F0F8FF] border border-[#DCEAF5] p-3 rounded-lg">
                              {notesForLead.map((n: any) => (
                                <div key={n.id} className="text-[11px] text-[#263746]">
                                  <span className="font-mono text-[#42A5F5]">
                                    [{new Date(n.createdAt).toLocaleDateString('en-IN')} {n.authorEmail}]:
                                  </span>{' '}
                                  {n.note}
                                </div>
                              ))}
                            </div>
                          )}

                          <div className="flex gap-2">
                            <input
                              placeholder="Add CRM follow-up note..."
                              value={leadNoteMap[lead.id] || ''}
                              onChange={(e) => setLeadNoteMap({ ...leadNoteMap, [lead.id]: e.target.value })}
                              className="flex-1 rounded border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-3 py-1.5"
                            />
                            <button
                              type="button"
                              onClick={async () => {
                                const text = (leadNoteMap[lead.id] || '').trim();
                                if (!text) return;
                                await apiFetch('/api/admin/crm/notes', {
                                  method: 'POST',
                                  body: JSON.stringify({ entityType: 'crm_lead', entityId: lead.id, note: text }),
                                });
                                setLeadNoteMap({ ...leadNoteMap, [lead.id]: '' });
                                notify('Follow-up note added.', 'success');
                                loadAll();
                              }}
                              className="px-3 py-1.5 bg-[#64B5F6] hover:bg-[#42A5F5] text-white rounded font-semibold transition-colors"
                            >
                              Save Note
                            </button>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            {/* ==================== R&D CASE STUDIES ==================== */}
            {tab === 'rd_projects' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 text-xs">
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (rdForm.id) {
                      await apiFetch(`/api/admin/case-studies/${rdForm.id}`, { method: 'PUT', body: JSON.stringify(rdForm) });
                      notify('R&D Project updated.', 'success');
                    } else {
                      await apiFetch('/api/admin/case-studies', { method: 'POST', body: JSON.stringify(rdForm) });
                      notify('R&D Project published.', 'success');
                    }
                    setRdForm({
                      title: '',
                      slug: '',
                      technologyUsed: '',
                      applications: '',
                      outcomes: '',
                      description: '',
                      imageUrl: '/src/assets/images/service_robotics_automation_1794981063545.jpg',
                      videoUrl: '',
                      isPublished: true,
                    });
                    loadAll();
                    refreshBootstrap();
                  }}
                  className="lg:col-span-5 rounded-xl border border-[#DCEAF5] bg-white p-6 space-y-3 h-fit shadow-sm"
                >
                  <h2 className="font-display text-lg font-bold text-[#123B5D]">
                    {rdForm.id ? 'Edit R&D Showcase Project' : 'Publish Engineering R&D / Academic Project'}
                  </h2>
                  <input
                    required
                    placeholder="Project Title *"
                    value={rdForm.title}
                    onChange={(e) => setRdForm({ ...rdForm, title: e.target.value })}
                    className="w-full rounded-lg border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-3 py-2"
                  />
                  <input
                    placeholder="Technologies Used (e.g. STM32, ROS2, UAV)"
                    value={rdForm.technologyUsed}
                    onChange={(e) => setRdForm({ ...rdForm, technologyUsed: e.target.value })}
                    className="w-full rounded-lg border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-3 py-2"
                  />
                  <input
                    placeholder="Applications"
                    value={rdForm.applications}
                    onChange={(e) => setRdForm({ ...rdForm, applications: e.target.value })}
                    className="w-full rounded-lg border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-3 py-2"
                  />
                  <input
                    placeholder="Outcomes / Impact"
                    value={rdForm.outcomes}
                    onChange={(e) => setRdForm({ ...rdForm, outcomes: e.target.value })}
                    className="w-full rounded-lg border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-3 py-2"
                  />
                  <input
                    placeholder="Image URL"
                    value={rdForm.imageUrl}
                    onChange={(e) => setRdForm({ ...rdForm, imageUrl: e.target.value })}
                    className="w-full rounded-lg border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-3 py-2 font-mono"
                  />
                  <input
                    placeholder="Video URL (optional)"
                    value={rdForm.videoUrl}
                    onChange={(e) => setRdForm({ ...rdForm, videoUrl: e.target.value })}
                    className="w-full rounded-lg border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-3 py-2 font-mono"
                  />
                  <textarea
                    required
                    rows={4}
                    placeholder="Technical Architecture & Overview *"
                    value={rdForm.description}
                    onChange={(e) => setRdForm({ ...rdForm, description: e.target.value })}
                    className="w-full rounded-lg border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-3 py-2"
                  />
                  <button type="submit" className="px-4 py-2 bg-[#64B5F6] hover:bg-[#42A5F5] text-white rounded-lg font-semibold transition-colors">
                    {rdForm.id ? 'Update Project' : 'Publish Project'}
                  </button>
                </form>

                <div className="lg:col-span-7 rounded-xl border border-[#DCEAF5] bg-white p-6 space-y-3 shadow-sm">
                  <h2 className="font-display text-lg font-bold text-[#123B5D]">Published Showcase Projects</h2>
                  {(overview.caseStudies || []).map((cs: any) => (
                    <div key={cs.id} className="border-b border-[#DCEAF5] py-3 flex items-center justify-between gap-2">
                      <div>
                        <div className="font-semibold text-[#123B5D]">{cs.title}</div>
                        <div className="font-mono text-[10px] text-[#263746]/70">/projects/{cs.slug} · {cs.technologyUsed}</div>
                      </div>
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            setRdForm({
                              id: cs.id,
                              title: cs.title,
                              slug: cs.slug,
                              technologyUsed: cs.technologyUsed,
                              applications: cs.applications,
                              outcomes: cs.outcomes,
                              description: cs.description,
                              imageUrl: cs.imageUrl,
                              videoUrl: cs.videoUrl || '',
                              isPublished: cs.isPublished,
                            })
                          }
                          className="px-2.5 py-1 border border-[#90CAF9] bg-white text-[#123B5D] hover:bg-[#F0F8FF] rounded font-semibold transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            await apiFetch(`/api/admin/case-studies/${cs.id}`, { method: 'DELETE' });
                            loadAll();
                            refreshBootstrap();
                          }}
                          className="px-2.5 py-1 text-red-600 border border-red-200 rounded hover:bg-red-50 transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ==================== BLOGS ==================== */}
            {tab === 'blogs' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 text-xs">
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (blogForm.id) {
                      await apiFetch(`/api/admin/blogs/${blogForm.id}`, { method: 'PUT', body: JSON.stringify(blogForm) });
                      notify('Article updated.', 'success');
                    } else {
                      await apiFetch('/api/admin/blogs', { method: 'POST', body: JSON.stringify(blogForm) });
                      notify('Blog article published.', 'success');
                    }
                    setBlogForm({
                      title: '',
                      category: 'Engineering',
                      excerpt: '',
                      content: '',
                      coverImageUrl: '/src/assets/images/hero_nexustek_engineering_1794981062404.jpg',
                      isPublished: true,
                    });
                    loadAll();
                    refreshBootstrap();
                  }}
                  className="lg:col-span-5 rounded-xl border border-[#DCEAF5] bg-white p-6 space-y-3 h-fit shadow-sm"
                >
                  <h2 className="font-display text-lg font-bold text-[#123B5D]">
                    {blogForm.id ? 'Edit Technical Article' : 'Publish Engineering Article'}
                  </h2>
                  <input
                    required
                    placeholder="Article Title *"
                    value={blogForm.title}
                    onChange={(e) => setBlogForm({ ...blogForm, title: e.target.value })}
                    className="w-full rounded-lg border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-3 py-2"
                  />
                  <input
                    placeholder="Category"
                    value={blogForm.category}
                    onChange={(e) => setBlogForm({ ...blogForm, category: e.target.value })}
                    className="w-full rounded-lg border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-3 py-2"
                  />
                  <input
                    placeholder="Cover Image URL"
                    value={blogForm.coverImageUrl}
                    onChange={(e) => setBlogForm({ ...blogForm, coverImageUrl: e.target.value })}
                    className="w-full rounded-lg border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-3 py-2 font-mono"
                  />
                  <input
                    required
                    placeholder="Short Excerpt *"
                    value={blogForm.excerpt}
                    onChange={(e) => setBlogForm({ ...blogForm, excerpt: e.target.value })}
                    className="w-full rounded-lg border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-3 py-2"
                  />
                  <textarea
                    required
                    rows={5}
                    placeholder="Full Content *"
                    value={blogForm.content}
                    onChange={(e) => setBlogForm({ ...blogForm, content: e.target.value })}
                    className="w-full rounded-lg border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-3 py-2"
                  />
                  <button type="submit" className="px-4 py-2 bg-[#64B5F6] hover:bg-[#42A5F5] text-white rounded-lg font-semibold transition-colors">
                    {blogForm.id ? 'Update Article' : 'Publish Blog'}
                  </button>
                </form>

                <div className="lg:col-span-7 rounded-xl border border-[#DCEAF5] bg-white p-6 space-y-3 shadow-sm">
                  <h2 className="font-display text-lg font-bold text-[#123B5D]">Articles ({(overview.blogs || []).length})</h2>
                  {(overview.blogs || []).map((b: any) => (
                    <div key={b.id} className="border-b border-[#DCEAF5] py-3 flex items-center justify-between gap-2">
                      <div>
                        <div className="font-semibold text-[#123B5D]">{b.title}</div>
                        <div className="text-[11px] text-[#263746]/70">{b.category} · /blogs/{b.slug}</div>
                      </div>
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            setBlogForm({
                              id: b.id,
                              title: b.title,
                              category: b.category,
                              excerpt: b.excerpt,
                              content: b.content,
                              coverImageUrl: b.coverImageUrl,
                              isPublished: b.isPublished,
                            })
                          }
                          className="px-2.5 py-1 border border-[#90CAF9] bg-white text-[#123B5D] hover:bg-[#F0F8FF] rounded font-semibold transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            await apiFetch(`/api/admin/blogs/${b.id}`, { method: 'DELETE' });
                            loadAll();
                            refreshBootstrap();
                          }}
                          className="px-2.5 py-1 text-red-600 border border-red-200 rounded hover:bg-red-50 transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ==================== PAYMENTS, INVOICES & RAZORPAY GATEWAY ==================== */}
            {tab === 'payments_invoices' && (
              <div className="space-y-6 text-xs">
                {/* Payment Gateway Operational Status + Sales Report Export */}
                <div className="rounded-xl border border-[#DCEAF5] bg-white p-6 flex flex-wrap items-center justify-between gap-4 shadow-sm">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-display text-lg font-bold text-[#123B5D]">
                        Razorpay Payment Gateway &amp; Refunds
                      </h3>
                      <span
                        className={`font-mono text-[11px] font-semibold px-2.5 py-0.5 rounded-lg border ${
                          razorpayMode === 'live'
                            ? 'text-[#123B5D] bg-[#F0F8FF] border-[#90CAF9]'
                            : razorpayMode === 'test'
                            ? 'text-[#42A5F5] bg-[#F0F8FF] border-[#DCEAF5]'
                            : 'text-amber-800 bg-amber-50 border-amber-200'
                        }`}
                      >
                        {razorpayMode === 'live'
                          ? 'Live Mode Active'
                          : razorpayMode === 'test'
                          ? 'Test Mode Active'
                          : 'Sandbox Mode'}
                      </span>
                    </div>
                    <p className="text-[#263746]/80">
                      Orders, HMAC signature verification, webhook reconciliation, and Razorpay refunds run strictly on the backend server.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => downloadAuthorizedCsv('/api/admin/export/sales', 'nexustekfusion-sales-report.csv')}
                    className="px-4 py-2 bg-[#64B5F6] hover:bg-[#42A5F5] text-white font-semibold rounded-lg inline-flex items-center gap-1.5 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" /> Download Sales Report CSV
                  </button>
                </div>

                <RazorpayPaymentLinksAdminPanel
                  quotations={overview.quotations || []}
                  storeOrders={overview.storeOrders || []}
                  printingOrders={overview.printingOrders || []}
                  installments={overview.paymentInstallments || []}
                  onRefreshOverview={() => loadAll(true)}
                />

                <CompanySigningAssetsAdminPanel />

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="rounded-xl border border-[#DCEAF5] bg-white p-6 space-y-4 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h2 className="font-display text-lg font-bold text-[#123B5D]">Payment Transactions</h2>
                      <div className="flex flex-wrap gap-1">
                        {(['all', 'verified', 'failed', 'pending', 'refunded'] as const).map((st) => (
                          <button
                            key={st}
                            type="button"
                            onClick={() => setPaymentStatusFilter(st)}
                            className={`px-2.5 py-1 rounded border text-[11px] font-semibold capitalize transition-colors ${
                              paymentStatusFilter === st
                                ? 'bg-[#64B5F6] text-white border-[#64B5F6]'
                                : 'bg-[#F0F8FF] text-[#123B5D] border-[#DCEAF5] hover:bg-[#DCEAF5]/60'
                            }`}
                          >
                            {st}
                          </button>
                        ))}
                      </div>
                    </div>

                    {refundTarget && (
                      <form
                        onSubmit={async (e) => {
                          e.preventDefault();
                          setRefundBusy(true);
                          try {
                            await apiFetch(`/api/admin/payments/${refundTarget.id}/refund`, {
                              method: 'POST',
                              body: JSON.stringify({
                                amountInr: refundAmount ? Number(refundAmount) : undefined,
                                reason: refundReason.trim() || 'Admin initiated refund',
                              }),
                            });
                            notify(`Refund processed for ${refundTarget.paymentRef}.`, 'success');
                            setRefundTarget(null);
                            setRefundAmount('');
                            setRefundReason('');
                            loadAll();
                          } catch (err: any) {
                            notify(err?.message || 'Refund failed.', 'error');
                          } finally {
                            setRefundBusy(false);
                          }
                        }}
                        className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-2.5"
                      >
                        <div className="font-semibold text-amber-950">
                          Issue Razorpay Refund — <span className="font-mono">{refundTarget.paymentRef}</span> (Max ₹{refundTarget.maxInr.toLocaleString('en-IN')})
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <input
                            type="number"
                            min={1}
                            max={refundTarget.maxInr}
                            placeholder={`Amount ₹ (blank = full ₹${refundTarget.maxInr})`}
                            value={refundAmount}
                            onChange={(e) => setRefundAmount(e.target.value)}
                            className="rounded border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-2.5 py-1.5 font-mono"
                          />
                          <input
                            placeholder="Refund reason (optional)"
                            value={refundReason}
                            onChange={(e) => setRefundReason(e.target.value)}
                            className="rounded border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-2.5 py-1.5"
                          />
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="submit"
                            disabled={refundBusy}
                            className="px-3 py-1.5 bg-amber-700 hover:bg-amber-800 text-white font-semibold rounded disabled:opacity-50"
                          >
                            {refundBusy ? 'Processing Refund...' : 'Confirm Refund'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setRefundTarget(null)}
                            className="px-3 py-1.5 border border-[#90CAF9] bg-white text-[#123B5D] hover:bg-[#F0F8FF] font-semibold rounded transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    )}

                    {(overview.payments || []).length === 0 ? (
                      <p className="text-[#263746]/70">No payments recorded yet.</p>
                    ) : (
                      <div className="divide-y divide-[#DCEAF5] max-h-96 overflow-y-auto">
                        {(overview.payments || [])
                          .filter((p: any) =>
                            paymentStatusFilter === 'all'
                              ? true
                              : paymentStatusFilter === 'refunded'
                              ? p.status === 'refunded' || p.refundStatus === 'partial' || p.refundStatus === 'full'
                              : p.status === paymentStatusFilter
                          )
                          .map((p: any) => {
                            const refundable = Math.max(0, Number(p.amountInr || 0) - Number(p.refundedAmountInr || 0));
                            return (
                              <div key={p.id} className="py-2.5 flex items-center justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="font-mono font-bold text-[#123B5D]">{p.paymentRef}</div>
                                  <div className="text-[#263746]/70 truncate">
                                    {p.entityType} #{p.entityId} · {p.mode}
                                    {p.razorpayPaymentId ? ` · ${p.razorpayPaymentId}` : ''}
                                  </div>
                                  {p.failureReason && (
                                    <div className="text-red-700 truncate">Failure: {p.failureReason}</div>
                                  )}
                                </div>
                                <div className="text-right font-mono shrink-0 space-y-1">
                                  <div className="font-bold text-[#123B5D]">₹{Number(p.amountInr || 0).toLocaleString('en-IN')}</div>
                                  <div
                                    className={`inline-flex items-center gap-1 ${
                                      p.status === 'failed'
                                        ? 'text-red-700'
                                        : p.status === 'refunded'
                                        ? 'text-amber-700'
                                        : 'text-[#42A5F5]'
                                    }`}
                                  >
                                    <CheckCircle2 className="w-3 h-3" /> {p.status}
                                    {p.refundStatus && p.refundStatus !== 'none' ? ` (${p.refundStatus})` : ''}
                                  </div>
                                  {p.status === 'verified' && refundable > 0 && (
                                    <div>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setRefundTarget({ id: p.id, paymentRef: p.paymentRef, maxInr: refundable });
                                          setRefundAmount(String(refundable));
                                          setRefundReason('');
                                        }}
                                        className="px-2 py-0.5 border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 rounded font-sans text-[11px] font-semibold"
                                      >
                                        Issue Refund
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    )}
                  </div>

                  <div className="space-y-6">
                    <div className="rounded-xl border border-[#DCEAF5] bg-white p-6 space-y-3 shadow-sm">
                      <h2 className="font-display text-lg font-bold text-[#123B5D]">
                        Refunds Ledger ({(overview.refunds || []).length})
                      </h2>
                      {(overview.refunds || []).length === 0 ? (
                        <p className="text-[#263746]/70">No refunds issued yet.</p>
                      ) : (
                        <div className="divide-y divide-[#DCEAF5] max-h-52 overflow-y-auto">
                          {(overview.refunds || []).map((r: any) => (
                            <div key={r.id} className="py-2 flex items-center justify-between gap-2">
                              <div>
                                <div className="font-mono font-bold text-[#123B5D]">
                                  {r.razorpayRefundId || `Refund #${r.id}`}
                                </div>
                                <div className="text-[#263746]/70">
                                  Payment #{r.paymentId} · {r.reason || 'Refund'}
                                </div>
                              </div>
                              <div className="text-right font-mono">
                                <div className="font-bold text-amber-800">₹{Number(r.amountInr || 0).toLocaleString('en-IN')}</div>
                                <div className="text-[11px] text-[#263746]/70">{r.status}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="rounded-xl border border-[#DCEAF5] bg-white p-6 space-y-4 shadow-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <h2 className="font-display text-lg font-bold text-[#123B5D]">
                            Invoices &amp; Billing Ledger
                          </h2>
                          <div className="text-[11px] font-mono text-[#263746]/70">
                            Total: {invoiceReportSummary.totalInvoices} · Paid: {invoiceReportSummary.paidCount} · Unpaid: {invoiceReportSummary.unpaidCount} · Billed: ₹{Number(invoiceReportSummary.totalBilledInr || 0).toLocaleString('en-IN')}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const qs = new URLSearchParams();
                            if (invoiceSearch.trim()) qs.set('search', invoiceSearch.trim());
                            if (invoicePayFilter !== 'all') qs.set('paymentStatus', invoicePayFilter);
                            if (invoiceDateFrom) qs.set('dateFrom', invoiceDateFrom);
                            if (invoiceDateTo) qs.set('dateTo', invoiceDateTo);
                            downloadAuthorizedCsv(`/api/admin/invoices/export?${qs.toString()}`, 'nexustekfusion-billing.csv');
                          }}
                          className="px-3 py-1.5 border border-[#90CAF9] bg-[#F0F8FF] hover:bg-[#DCEAF5] text-[#123B5D] rounded-lg font-semibold inline-flex items-center gap-1.5"
                        >
                          <Download className="w-3.5 h-3.5 text-[#42A5F5]" /> Export Billing CSV
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                        <div className="sm:col-span-2 relative">
                          <Search className="w-3.5 h-3.5 text-[#42A5F5] absolute left-2.5 top-2" />
                          <input
                            placeholder="Search invoice #, Customer ID, order #, email..."
                            value={invoiceSearch}
                            onChange={(e) => setInvoiceSearch(e.target.value)}
                            className="w-full rounded-lg border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] pl-8 pr-2.5 py-1.5 text-xs"
                          />
                        </div>
                        <select
                          value={invoicePayFilter}
                          onChange={(e) => setInvoicePayFilter(e.target.value as any)}
                          className="rounded-lg border border-[#DCEAF5] bg-white px-2.5 py-1.5 font-semibold text-[#123B5D]"
                        >
                          <option value="all">All Invoices</option>
                          <option value="paid">Paid Invoices</option>
                          <option value="unpaid">Unpaid Invoices</option>
                        </select>
                        <div className="flex gap-1">
                          <input
                            type="date"
                            value={invoiceDateFrom}
                            onChange={(e) => setInvoiceDateFrom(e.target.value)}
                            className="w-1/2 rounded-lg border border-[#DCEAF5] px-1.5 py-1.5 font-mono text-[11px]"
                          />
                          <input
                            type="date"
                            value={invoiceDateTo}
                            onChange={(e) => setInvoiceDateTo(e.target.value)}
                            className="w-1/2 rounded-lg border border-[#DCEAF5] px-1.5 py-1.5 font-mono text-[11px]"
                          />
                        </div>
                      </div>

                      {invoiceReportLoading && invoiceReportRows.length === 0 ? (
                        <p className="text-[#263746]/70">Loading billing ledger...</p>
                      ) : invoiceReportRows.length === 0 ? (
                        <p className="text-[#263746]/70">No invoices match your search or payment filter.</p>
                      ) : (
                        <div className="divide-y divide-[#DCEAF5] max-h-80 overflow-y-auto">
                          {invoiceReportRows.map((inv: any) => (
                            <div key={inv.id} className="py-2.5 flex items-center justify-between gap-2">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="font-mono font-bold text-[#123B5D]">{inv.invoiceNumber}</span>
                                  {inv.customerId && (
                                    <button
                                      type="button"
                                      onClick={() => jumpToCustomerProfile(inv.customerId || inv.customerEmail)}
                                      className="px-1.5 py-0.5 rounded bg-[#F0F8FF] border border-[#DCEAF5] font-mono text-[10px] font-bold text-[#123B5D]"
                                    >
                                      {inv.customerId}
                                    </button>
                                  )}
                                  <span
                                    className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${
                                      inv.paymentStatus === 'paid'
                                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                        : 'bg-amber-50 text-amber-800 border border-amber-200'
                                    }`}
                                  >
                                    {inv.paymentStatus}
                                  </span>
                                </div>
                                <div className="text-[#263746]/70 truncate mt-0.5">
                                  {inv.docType} · ₹{Number(inv.amountInr || 0).toLocaleString('en-IN')}
                                  {inv.linkedRef ? ` · ${inv.linkedRef}` : ''}
                                  {inv.customerEmail ? ` · ${inv.customerEmail}` : ''}
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => downloadAdminCloudInvoicePdf(inv)}
                                  className="px-3 py-1 border border-[#90CAF9] bg-white text-[#123B5D] hover:bg-[#F0F8FF] rounded font-semibold inline-flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors"
                                >
                                  <Download className="w-3.5 h-3.5 text-[#42A5F5]" /> PDF
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setArchiveConfirm({
                                      title: `Archive Invoice ${inv.invoiceNumber}`,
                                      subtitle:
                                        'Invoice number, tax metadata, and PDF remain preserved in financial audit logs.',
                                      endpoint: `/api/admin/invoices/${inv.id}`,
                                      reason: '',
                                      busy: false,
                                    })
                                  }
                                  className="px-2 py-1 border border-amber-300 text-amber-800 hover:bg-amber-50 rounded font-semibold"
                                >
                                  Archive
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ==================== SUPPORT DESK & DRONE REPAIRS ==================== */}
            {tab === 'support' && (
              <div className="space-y-6 text-xs">
                {(overview.droneRepairs || []).length > 0 && (
                  <div className="space-y-3">
                    <h2 className="font-display text-lg font-bold text-[#123B5D]">
                      Drone Repair Service Bookings ({overview.droneRepairs.length})
                    </h2>
                    {overview.droneRepairs.map((dr: any) => (
                      <div key={dr.id} className="rounded-xl border border-[#DCEAF5] bg-white p-5 space-y-3 shadow-sm">
                        <div className="flex flex-wrap justify-between gap-2 border-b border-[#DCEAF5] pb-2">
                          <div>
                            <span className="font-mono font-bold text-[#123B5D]">{dr.referenceNumber}</span> ·{' '}
                            <span className="text-[#123B5D] font-semibold">{dr.droneBrandModel} ({dr.serviceMode})</span>
                            <div className="text-[#263746]/70">
                              {dr.customerName} · {dr.mobile} · {dr.city}
                            </div>
                          </div>
                          <select
                            value={dr.status}
                            onChange={async (e) => {
                              await apiFetch(`/api/admin/drone-repairs/${dr.id}`, {
                                method: 'PATCH',
                                body: JSON.stringify({ status: e.target.value }),
                              });
                              notify('Repair status updated.', 'success');
                              loadAll();
                            }}
                            className="rounded border border-[#DCEAF5] px-2.5 py-1 bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] font-semibold"
                          >
                            {[
                              'Booking received',
                              'Engineer assigned',
                              'Diagnostics ongoing',
                              'Quotation sent',
                              'Approved & Repairing',
                              'Testing completed',
                              'Ready for dispatch / pickup',
                              'Completed',
                            ].map((st) => (
                              <option key={st} value={st}>
                                {st}
                              </option>
                            ))}
                          </select>
                        </div>
                        <p className="text-[#263746]">{dr.problemDescription}</p>
                        <div className="flex flex-wrap gap-2 items-center">
                          <input
                            type="number"
                            placeholder="Repair quote ₹"
                            defaultValue={dr.repairQuotationInr || ''}
                            onBlur={async (e) => {
                              if (!e.target.value) return;
                              await apiFetch(`/api/admin/drone-repairs/${dr.id}`, {
                                method: 'PATCH',
                                body: JSON.stringify({ repairQuotationInr: Number(e.target.value), status: 'Quotation sent' }),
                              });
                              notify('Repair quote saved.', 'success');
                              loadAll();
                            }}
                            className="w-36 rounded border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-2.5 py-1 font-mono"
                          />
                          <input
                            placeholder="Assigned technician..."
                            defaultValue={dr.assignedEngineer || ''}
                            onBlur={async (e) => {
                              await apiFetch(`/api/admin/drone-repairs/${dr.id}`, {
                                method: 'PATCH',
                                body: JSON.stringify({ assignedEngineer: e.target.value }),
                              });
                              loadAll();
                            }}
                            className="w-48 rounded border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-2.5 py-1"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="space-y-3">
                  <h2 className="font-display text-lg font-bold text-[#123B5D]">
                    Customer Support Tickets ({(overview.supportTickets || []).length})
                  </h2>
                  {overview.supportTickets.map((t: any) => (
                    <div key={t.id} className="rounded-xl border border-[#DCEAF5] bg-white p-5 space-y-3 shadow-sm">
                      <div className="flex justify-between font-semibold">
                        <span className="text-[#123B5D]">
                          {t.ticketNumber} · {t.subject} ({t.email})
                        </span>
                        <span className="text-[#42A5F5]">{t.status}</span>
                      </div>
                      <p className="text-[#263746]">{t.message}</p>
                      <div className="flex flex-wrap gap-2">
                        <input
                          placeholder="Write reply to customer..."
                          value={ticketReplyMap[t.id] || ''}
                          onChange={(e) => setTicketReplyMap({ ...ticketReplyMap, [t.id]: e.target.value })}
                          className="flex-1 min-w-[220px] rounded-lg border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-3 py-1.5"
                        />
                        <button
                          type="button"
                          onClick={async () => {
                            const reply = (ticketReplyMap[t.id] || '').trim();
                            if (!reply) return notify('Please enter a reply message.', 'error');
                            await apiFetch(`/api/admin/support-tickets/${t.id}/reply`, {
                              method: 'POST',
                              body: JSON.stringify({ message: reply, status: 'Replied' }),
                            });
                            setTicketReplyMap({ ...ticketReplyMap, [t.id]: '' });
                            notify('Reply sent.', 'success');
                            loadAll();
                          }}
                          className="px-4 py-1.5 bg-[#64B5F6] hover:bg-[#42A5F5] text-white rounded-lg font-semibold transition-colors"
                        >
                          Send Reply
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ==================== UNIFIED CUSTOMER ENQUIRIES CENTER ==================== */}
            {tab === 'enquiries' && (
              <AdminEnquiriesPanel
                realtimeTick={realtimeTick}
                onViewCustomerProfile={jumpToCustomerProfile}
                onOverviewRefresh={() => loadAll(true)}
              />
            )}

            {/* ==================== EDITABLE CUSTOMER MANAGEMENT TABLE ==================== */}
            {tab === 'customers' && (
              <CustomerManagementPanel
                onOverviewRefresh={() => loadAll(true)}
                initialOpenCustomerCode={jumpToCustomerCode}
                onClearInitialCustomerCode={() => setJumpToCustomerCode('')}
                realtimeTick={realtimeTick}
              />
            )}

            {/* ==================== STAFF ROLES, STATUS & PASSWORD ==================== */}
            {tab === 'users' && (
              <div className="space-y-6 text-xs">
                <div className="rounded-xl border border-[#DCEAF5] bg-white p-6 space-y-3 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="font-display text-lg font-bold text-[#123B5D]">Staff, Customers &amp; Account History</h2>
                    <button
                      type="button"
                      onClick={() => setTab('customers')}
                      className="px-3 py-1.5 rounded-lg bg-[#42A5F5] hover:bg-[#1E88E5] text-white font-semibold transition-colors"
                    >
                      Open Editable Customer Table
                    </button>
                  </div>
                  <div className="divide-y divide-[#DCEAF5]">
                    {overview.users.map((u: any) => {
                      const isCustomerAccount = u.role === 'customer' || String(u.uid || '').startsWith('NTF-CUST-');
                      return (
                      <div key={u.id} className="py-3 flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="font-semibold text-[#123B5D]">{u.fullName || u.email}</div>
                          <div className="text-[#263746]/70 font-mono">
                            {u.email}
                            {u.mobile ? ` · ${u.mobile}` : ''}
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setHistoryUser(u)}
                            className="px-3 py-1.5 rounded-lg border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] font-semibold text-[#123B5D] whitespace-nowrap shrink-0 transition-colors"
                          >
                            View History
                          </button>
                          {isCustomerAccount ? (
                            <span
                              title="Customer accounts are separated from Admin/Staff roles and cannot be converted"
                              className="rounded-lg border border-[#DCEAF5] px-2.5 py-1.5 bg-[#F8FAFC] text-[#263746] font-mono"
                            >
                              customer (isolated)
                            </span>
                          ) : (
                            <select
                              disabled={dbUser?.role !== 'super_admin' || u.id === dbUser?.id}
                              value={u.role}
                              onChange={async (e) => {
                                try {
                                  await apiFetch(`/api/admin/users/${u.id}/role`, {
                                    method: 'PATCH',
                                    body: JSON.stringify({ role: e.target.value }),
                                  });
                                  notify('Staff role updated.', 'success');
                                  loadAll();
                                } catch (err: any) {
                                  notify(err?.message || 'Unable to update role.', 'error');
                                }
                              }}
                              className="rounded-lg border border-[#DCEAF5] px-2.5 py-1.5 bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] font-mono disabled:opacity-60"
                            >
                              {STAFF_ADMIN_ROLES.map((r) => (
                                <option key={r} value={r}>{r}</option>
                              ))}
                            </select>
                          )}
                          {dbUser?.role === 'super_admin' && u.id !== dbUser.id && (
                            <button
                              type="button"
                              onClick={async () => {
                                await apiFetch(`/api/admin/users/${u.id}/status`, {
                                  method: 'PATCH',
                                  body: JSON.stringify({ isActive: u.isActive === false }),
                                });
                                notify(`Updated account status.`, 'info');
                                loadAll();
                              }}
                              className={`px-2.5 py-1.5 rounded-lg font-semibold transition-colors ${
                                u.isActive !== false ? 'bg-[#F0F8FF] text-[#123B5D] border border-[#90CAF9]' : 'bg-red-50 text-red-700 border border-red-200'
                              }`}
                            >
                              {u.isActive !== false ? 'Active' : 'Suspended'}
                            </button>
                          )}
                        </div>
                      </div>
                      );
                    })}
                  </div>
                </div>

                {historyUser && (() => {
                  const userOrders = (overview.storeOrders || []).filter((o: any) => o.userId === historyUser.id);
                  const userProjects = (overview.projectEnquiries || []).filter(
                    (pe: any) => pe.userId === historyUser.id || pe.customerEmail === historyUser.email
                  );
                  const userDroneEnq = (overview.productEnquiries || []).filter(
                    (de: any) => de.userId === historyUser.id || de.email === historyUser.email
                  );
                  return (
                    <div
                      className="fixed inset-0 z-50 bg-[#123B5D]/60 backdrop-blur-sm flex items-center justify-center p-4"
                      onClick={() => setHistoryUser(null)}
                    >
                      <div
                        className="bg-white rounded-xl border border-[#DCEAF5] max-w-3xl w-full max-h-[85vh] overflow-y-auto p-6 space-y-5 shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-start justify-between gap-3 bg-[#F0F8FF] -mx-6 -mt-6 px-6 py-4 border-b border-[#DCEAF5]">
                          <div>
                            <div className="font-mono text-[11px] text-[#42A5F5]">Customer Account History</div>
                            <h3 className="font-display text-lg font-bold text-[#123B5D]">
                              {historyUser.fullName || historyUser.email}
                            </h3>
                            <div className="text-[#263746]/80 font-mono">
                              {historyUser.email}
                              {historyUser.mobile ? ` · ${historyUser.mobile}` : ''} · Role: {historyUser.role}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setHistoryUser(null)}
                            className="p-1.5 rounded-lg border border-[#DCEAF5] bg-white text-[#263746] hover:text-[#123B5D] hover:bg-[#F0F8FF] transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>

                        <div className="space-y-2">
                          <div className="font-display font-bold text-sm text-[#123B5D]">
                            Store Orders ({userOrders.length})
                          </div>
                          {userOrders.length === 0 ? (
                            <p className="text-[#263746]/70">No store orders recorded.</p>
                          ) : (
                            <div className="divide-y divide-[#DCEAF5] rounded-lg border border-[#DCEAF5] px-3">
                              {userOrders.map((o: any) => (
                                <div key={o.id} className="py-2 flex flex-wrap justify-between gap-2 text-[#263746]">
                                  <div>
                                    <span className="font-mono font-bold text-[#123B5D]">{o.orderNumber}</span> ·{' '}
                                    <span>{o.orderStatus}</span> · <span className="uppercase">{o.paymentStatus}</span>
                                  </div>
                                  <div className="font-mono tabular-nums">
                                    ₹{Number(o.totalInr || 0).toLocaleString('en-IN')} · {new Date(o.createdAt).toLocaleDateString('en-IN')}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="space-y-2">
                          <div className="font-display font-bold text-sm text-[#123B5D]">
                            KRASHIVANTRI Drone Enquiries ({userDroneEnq.length})
                          </div>
                          {userDroneEnq.length === 0 ? (
                            <p className="text-[#263746]/70">No drone product enquiries submitted.</p>
                          ) : (
                            <div className="divide-y divide-[#DCEAF5] rounded-lg border border-[#DCEAF5] px-3">
                              {userDroneEnq.map((de: any) => (
                                <div key={de.id} className="py-2 flex flex-wrap justify-between gap-2 text-[#263746]">
                                  <div>
                                    <span className="font-mono font-bold text-[#123B5D]">
                                      {de.enquiryNumber || de.referenceNumber || `ENQ-${de.id}`}
                                    </span>{' '}
                                    · {de.interestedProduct} (Qty {de.quantity || 1})
                                  </div>
                                  <div className="font-mono text-[#42A5F5]">{de.status}</div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="space-y-2">
                          <div className="font-display font-bold text-sm text-[#123B5D]">
                            Project Registrations ({userProjects.length})
                          </div>
                          {userProjects.length === 0 ? (
                            <p className="text-[#263746]/70">No project enquiries registered.</p>
                          ) : (
                            <div className="divide-y divide-[#DCEAF5] rounded-lg border border-[#DCEAF5] px-3">
                              {userProjects.map((pe: any) => (
                                <div key={pe.id} className="py-2 flex flex-wrap justify-between gap-2 text-[#263746]">
                                  <div>
                                    <span className="font-mono font-bold text-[#123B5D]">{pe.enquiryNumber}</span> ·{' '}
                                    {pe.projectTitle}
                                  </div>
                                  <div className="font-mono text-[#42A5F5]">{pe.status}</div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Change Own Admin Password */}
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (pwdForm.newPassword !== pwdForm.confirmPassword) {
                      return notify('New passwords do not match.', 'error');
                    }
                    try {
                      await apiFetch('/api/auth/admin-change-password', {
                        method: 'POST',
                        body: JSON.stringify({
                          currentPassword: pwdForm.currentPassword,
                          newPassword: pwdForm.newPassword,
                        }),
                      });
                      setPwdForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
                      notify('Administrator password updated.', 'success');
                    } catch (err: any) {
                      notify(err?.message || 'Password update failed.', 'error');
                    }
                  }}
                  className="max-w-lg rounded-xl border border-[#DCEAF5] bg-white p-6 space-y-3 shadow-sm"
                >
                  <h3 className="font-display text-base font-bold text-[#123B5D] flex items-center gap-2">
                    <KeyRound className="w-4 h-4 text-[#42A5F5]" /> Change Admin Account Password
                  </h3>
                  <input
                    required
                    type="password"
                    placeholder="Current Password"
                    value={pwdForm.currentPassword}
                    onChange={(e) => setPwdForm({ ...pwdForm, currentPassword: e.target.value })}
                    className="w-full rounded-lg border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-3 py-2"
                  />
                  <input
                    required
                    type="password"
                    minLength={8}
                    placeholder="New Password (min 8 chars)"
                    value={pwdForm.newPassword}
                    onChange={(e) => setPwdForm({ ...pwdForm, newPassword: e.target.value })}
                    className="w-full rounded-lg border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-3 py-2"
                  />
                  <input
                    required
                    type="password"
                    minLength={8}
                    placeholder="Confirm New Password"
                    value={pwdForm.confirmPassword}
                    onChange={(e) => setPwdForm({ ...pwdForm, confirmPassword: e.target.value })}
                    className="w-full rounded-lg border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-3 py-2"
                  />
                  <button type="submit" className="px-4 py-2 bg-[#64B5F6] hover:bg-[#42A5F5] text-white rounded-lg font-semibold transition-colors">
                    Update Password
                  </button>
                </form>
              </div>
            )}

            {/* ==================== COMPANY, TAX & SHIPPING SETTINGS ==================== */}
            {tab === 'settings' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 text-xs">
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    await Promise.all([
                      apiFetch('/api/admin/settings/announcementBar', {
                        method: 'PUT',
                        body: JSON.stringify({ value: announcementForm }),
                      }),
                      apiFetch('/api/admin/settings/companyInfo', {
                        method: 'PUT',
                        body: JSON.stringify({ value: { ...(settings.companyInfo || {}), ...companyForm } }),
                      }),
                    ]);
                    notify('Company & announcement settings saved.', 'success');
                    refreshBootstrap();
                  }}
                  className="rounded-xl border border-[#DCEAF5] bg-white p-6 space-y-3 shadow-sm"
                >
                  <h2 className="font-display text-lg font-bold text-[#123B5D]">Company Info, GSTIN &amp; Announcement</h2>
                  <label className="flex items-center gap-2 font-medium text-[#123B5D]">
                    <input
                      type="checkbox"
                      checked={announcementForm.enabled}
                      onChange={(e) => setAnnouncementForm({ ...announcementForm, enabled: e.target.checked })}
                      className="accent-[#64B5F6]"
                    />
                    Show Top Announcement Bar
                  </label>
                  <input
                    placeholder="Announcement Text"
                    value={announcementForm.text}
                    onChange={(e) => setAnnouncementForm({ ...announcementForm, text: e.target.value })}
                    className="w-full rounded-lg border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-3 py-2"
                  />
                  <input
                    placeholder="Company Email"
                    value={companyForm.email}
                    onChange={(e) => setCompanyForm({ ...companyForm, email: e.target.value })}
                    className="w-full rounded-lg border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-3 py-2"
                  />
                  <input
                    placeholder="Customer Care Email (e.g. info@nexustekfusion.in)"
                    value={companyForm.customerCareEmail}
                    onChange={(e) => setCompanyForm({ ...companyForm, customerCareEmail: e.target.value })}
                    className="w-full rounded-lg border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-3 py-2 font-mono"
                  />
                  <input
                    placeholder="GSTIN (leave blank until active)"
                    value={companyForm.gstin}
                    onChange={(e) => setCompanyForm({ ...companyForm, gstin: e.target.value.toUpperCase() })}
                    className="w-full rounded-lg border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-3 py-2 font-mono uppercase"
                  />
                  <input
                    placeholder="Contact Phone"
                    value={companyForm.contactPhone}
                    onChange={(e) => setCompanyForm({ ...companyForm, contactPhone: e.target.value })}
                    className="w-full rounded-lg border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-3 py-2"
                  />
                  <button type="submit" className="px-4 py-2 bg-[#64B5F6] hover:bg-[#42A5F5] text-white rounded-lg font-semibold transition-colors">
                    Save Company Settings
                  </button>
                </form>

                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    await Promise.all([
                      apiFetch('/api/admin/settings/shippingConfig', {
                        method: 'PUT',
                        body: JSON.stringify({ value: shippingForm }),
                      }),
                      apiFetch('/api/admin/settings/projectSettings', {
                        method: 'PUT',
                        body: JSON.stringify({ value: projSettingsForm }),
                      }),
                    ]);
                    notify('Shipping & Tax/Quotation settings saved.', 'success');
                    refreshBootstrap();
                  }}
                  className="rounded-xl border border-[#DCEAF5] bg-white p-6 space-y-4 shadow-sm"
                >
                  <h2 className="font-display text-lg font-bold text-[#123B5D]">Shipping Rules &amp; Project GST Config</h2>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block font-semibold text-[#123B5D] mb-1">Standard Ship ₹</label>
                      <input
                        type="number"
                        value={shippingForm.standardShippingInr}
                        onChange={(e) => setShippingForm({ ...shippingForm, standardShippingInr: Number(e.target.value) })}
                        className="w-full rounded border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-2.5 py-2 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-[#123B5D] mb-1">Free Above ₹</label>
                      <input
                        type="number"
                        value={shippingForm.freeShippingAboveInr}
                        onChange={(e) => setShippingForm({ ...shippingForm, freeShippingAboveInr: Number(e.target.value) })}
                        className="w-full rounded border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-2.5 py-2 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-[#123B5D] mb-1">Default GST %</label>
                      <input
                        type="number"
                        value={projSettingsForm.defaultGstPercent}
                        onChange={(e) => setProjSettingsForm({ ...projSettingsForm, defaultGstPercent: Number(e.target.value) })}
                        className="w-full rounded border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-2.5 py-2 font-mono"
                      />
                    </div>
                  </div>
                  <label className="flex items-center gap-2 font-medium text-[#123B5D]">
                    <input
                      type="checkbox"
                      checked={projSettingsForm.enableGstTax}
                      onChange={(e) => setProjSettingsForm({ ...projSettingsForm, enableGstTax: e.target.checked })}
                      className="accent-[#64B5F6]"
                    />
                    Enable GST Tax Invoices (requires valid GSTIN)
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-[#123B5D] mb-1">Default Advance %</label>
                      <input
                        type="number"
                        min={10}
                        max={100}
                        value={projSettingsForm.defaultAdvancePercent}
                        onChange={(e) => setProjSettingsForm({ ...projSettingsForm, defaultAdvancePercent: Number(e.target.value) })}
                        className="w-full rounded border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-2.5 py-2 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-[#123B5D] mb-1">Quotation Validity (days)</label>
                      <input
                        type="number"
                        min={1}
                        max={90}
                        value={projSettingsForm.quotationValidityDays}
                        onChange={(e) => setProjSettingsForm({ ...projSettingsForm, quotationValidityDays: Number(e.target.value) })}
                        className="w-full rounded border border-[#DCEAF5] bg-white text-[#263746] focus:outline-none focus:border-[#64B5F6] px-2.5 py-2 font-mono"
                      />
                    </div>
                  </div>
                  <button type="submit" className="px-4 py-2 bg-[#64B5F6] hover:bg-[#42A5F5] text-white rounded-lg font-semibold transition-colors">
                    Save Shipping &amp; Invoice Config
                  </button>
                </form>
              </div>
            )}

            {/* ==================== AUDIT LOGS & CLOUD GOVERNANCE HISTORY ==================== */}
            {tab === 'audit' && (
              <div className="space-y-6">
                <RecordHistoryAndActivityAdminPanel />
                <div className="rounded-xl border border-[#DCEAF5] bg-white p-6 space-y-2 text-xs font-mono shadow-sm">
                  <h2 className="font-display text-lg font-bold text-[#123B5D] font-sans mb-3">
                    <Shield className="w-4 h-4 inline mr-1.5 text-[#42A5F5]" />
                    Security Audit Trail
                  </h2>
                  {overview.recentAudit.map((log: any) => (
                    <div key={log.id} className="border-b border-[#DCEAF5] py-2 flex justify-between gap-4 text-[#263746]">
                      <span>{log.action} · {log.entityType} #{log.entityId} ({log.actorEmail})</span>
                      <span className="text-[#263746]/60">{new Date(log.createdAt).toLocaleString('en-IN')}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {/* ==================== PROJECT FINANCE DASHBOARD ==================== */}
            {tab === 'project_finance' && <ProjectFinanceDashboardPanel />}

            {/* ==================== PROJECT PAYMENT SPLIT & EMAIL TEMPLATES ==================== */}
            {tab === 'project_payment_settings' && (
              <ProjectPaymentSettingsPanel
                isSuperAdmin={dbUser?.role === 'super_admin'}
                emailLogs={overview.emailNotifications || []}
              />
            )}

            {/* ==================== KRASHIVANTRI OPERATIONS ADMIN CONSOLES ==================== */}
            {tab === 'krash_farmers' && (
              <KrashivantriAdminWorkspace section="farmers" isSuperAdmin={dbUser?.role === 'super_admin'} />
            )}
            {tab === 'krash_pilots' && (
              <KrashivantriAdminWorkspace section="pilots" isSuperAdmin={dbUser?.role === 'super_admin'} />
            )}
            {tab === 'krash_live_tracking' && (
              <KrashivantriAdminWorkspace section="live_tracking" isSuperAdmin={dbUser?.role === 'super_admin'} />
            )}
            {tab === 'krash_orders_live' && (
              <KrashivantriAdminWorkspace section="orders_live" isSuperAdmin={dbUser?.role === 'super_admin'} />
            )}
            {tab === 'krash_farmer_payments' && (
              <KrashivantriAdminWorkspace section="farmer_payments" isSuperAdmin={dbUser?.role === 'super_admin'} />
            )}
            {tab === 'krash_pilot_payouts' && (
              <KrashivantriAdminWorkspace section="pilot_payouts" isSuperAdmin={dbUser?.role === 'super_admin'} />
            )}
            {tab === 'krash_penalties' && (
              <KrashivantriAdminWorkspace section="penalties" isSuperAdmin={dbUser?.role === 'super_admin'} />
            )}
            {tab === 'krash_finance' && (
              <KrashivantriAdminWorkspace section="finance" isSuperAdmin={dbUser?.role === 'super_admin'} />
            )}
          </div>
        )}
      </main>

      {/* Store Order Details & Delivery Editor Modal */}
      {orderDetailTarget && (
        <div
          className="fixed inset-0 z-50 bg-[#123B5D]/40 backdrop-blur-[2px] flex items-center justify-center p-4"
          onClick={() => !savingOrderModal && setOrderDetailTarget(null)}
        >
          <div
            className="bg-white rounded-xl border border-[#DCEAF5] max-w-2xl w-full max-h-[88vh] flex flex-col overflow-hidden shadow-2xl text-xs"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 bg-[#F0F8FF] border-b border-[#DCEAF5] flex items-center justify-between gap-2">
              <div>
                <div className="font-mono font-bold text-sm text-[#123B5D]">
                  Order Details — {orderDetailTarget.orderNumber}
                </div>
                <div className="text-[11px] text-[#263746]/75">
                  {orderDetailTarget.customerId ? `${orderDetailTarget.customerId} · ` : ''}
                  {orderDetailTarget.customerName} ({orderDetailTarget.customerEmail})
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOrderDetailTarget(null)}
                className="p-1.5 rounded-lg border border-[#DCEAF5] bg-white text-[#263746]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-[#123B5D] mb-1">Order Status</label>
                  <select
                    value={orderDeliveryDraft.orderStatus}
                    onChange={(e) => setOrderDeliveryDraft({ ...orderDeliveryDraft, orderStatus: e.target.value })}
                    className="w-full rounded-lg border border-[#DCEAF5] px-2.5 py-2 bg-white font-semibold"
                  >
                    {STORE_ORDER_STATUSES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-[#123B5D] mb-1">Tracking Courier</label>
                  <input
                    value={orderDeliveryDraft.trackingCourier}
                    onChange={(e) => setOrderDeliveryDraft({ ...orderDeliveryDraft, trackingCourier: e.target.value })}
                    className="w-full rounded-lg border border-[#DCEAF5] px-2.5 py-2"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-[#123B5D] mb-1">Tracking / AWB Number</label>
                  <input
                    value={orderDeliveryDraft.trackingId}
                    onChange={(e) => setOrderDeliveryDraft({ ...orderDeliveryDraft, trackingId: e.target.value })}
                    className="w-full rounded-lg border border-[#DCEAF5] px-2.5 py-2 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-[#123B5D] mb-1">Tracking URL</label>
                  <input
                    value={orderDeliveryDraft.trackingUrl}
                    onChange={(e) => setOrderDeliveryDraft({ ...orderDeliveryDraft, trackingUrl: e.target.value })}
                    className="w-full rounded-lg border border-[#DCEAF5] px-2.5 py-2 font-mono"
                  />
                </div>
              </div>

              <div className="rounded-lg border border-[#DCEAF5] bg-[#F0F8FF]/45 p-3.5 space-y-2.5">
                <div className="font-semibold text-[#123B5D]">Delivery / Shipping Address</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <input
                    placeholder="Recipient Name"
                    value={orderDeliveryDraft.fullName}
                    onChange={(e) => setOrderDeliveryDraft({ ...orderDeliveryDraft, fullName: e.target.value })}
                    className="rounded border border-[#DCEAF5] bg-white px-2.5 py-1.5"
                  />
                  <input
                    placeholder="Mobile Number"
                    value={orderDeliveryDraft.mobile}
                    onChange={(e) => setOrderDeliveryDraft({ ...orderDeliveryDraft, mobile: e.target.value })}
                    className="rounded border border-[#DCEAF5] bg-white px-2.5 py-1.5 font-mono"
                  />
                  <input
                    placeholder="Address Line 1"
                    value={orderDeliveryDraft.line1}
                    onChange={(e) => setOrderDeliveryDraft({ ...orderDeliveryDraft, line1: e.target.value })}
                    className="sm:col-span-2 rounded border border-[#DCEAF5] bg-white px-2.5 py-1.5"
                  />
                  <input
                    placeholder="Address Line 2 (Optional)"
                    value={orderDeliveryDraft.line2}
                    onChange={(e) => setOrderDeliveryDraft({ ...orderDeliveryDraft, line2: e.target.value })}
                    className="sm:col-span-2 rounded border border-[#DCEAF5] bg-white px-2.5 py-1.5"
                  />
                  <input
                    placeholder="City"
                    value={orderDeliveryDraft.city}
                    onChange={(e) => setOrderDeliveryDraft({ ...orderDeliveryDraft, city: e.target.value })}
                    className="rounded border border-[#DCEAF5] bg-white px-2.5 py-1.5"
                  />
                  <div className="flex gap-2">
                    <input
                      placeholder="State"
                      value={orderDeliveryDraft.state}
                      onChange={(e) => setOrderDeliveryDraft({ ...orderDeliveryDraft, state: e.target.value })}
                      className="w-2/3 rounded border border-[#DCEAF5] bg-white px-2.5 py-1.5"
                    />
                    <input
                      placeholder="PIN Code"
                      value={orderDeliveryDraft.pinCode}
                      onChange={(e) => setOrderDeliveryDraft({ ...orderDeliveryDraft, pinCode: e.target.value })}
                      className="w-1/3 rounded border border-[#DCEAF5] bg-white px-2.5 py-1.5 font-mono"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-[#123B5D] mb-1">Internal Admin Notes</label>
                <textarea
                  rows={2}
                  value={orderDeliveryDraft.internalNotes}
                  onChange={(e) => setOrderDeliveryDraft({ ...orderDeliveryDraft, internalNotes: e.target.value })}
                  className="w-full rounded-lg border border-[#DCEAF5] px-3 py-2"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-[#DCEAF5]">
                <button
                  type="button"
                  onClick={() => setOrderDetailTarget(null)}
                  className="px-4 py-2 rounded-lg border border-[#DCEAF5] bg-white text-[#263746] font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={savingOrderModal}
                  onClick={async () => {
                    setSavingOrderModal(true);
                    try {
                      await apiFetch(`/api/admin/store-orders/${orderDetailTarget.id}`, {
                        method: 'PATCH',
                        body: JSON.stringify({
                          orderStatus: orderDeliveryDraft.orderStatus,
                          trackingCourier: orderDeliveryDraft.trackingCourier,
                          trackingId: orderDeliveryDraft.trackingId,
                          trackingUrl: orderDeliveryDraft.trackingUrl,
                          internalNotes: orderDeliveryDraft.internalNotes,
                          shippingAddress: {
                            ...(orderDetailTarget.shippingAddress || {}),
                            fullName: orderDeliveryDraft.fullName,
                            mobile: orderDeliveryDraft.mobile,
                            line1: orderDeliveryDraft.line1,
                            line2: orderDeliveryDraft.line2,
                            city: orderDeliveryDraft.city,
                            state: orderDeliveryDraft.state,
                            pinCode: orderDeliveryDraft.pinCode,
                          },
                        }),
                      });
                      notify(`Order ${orderDetailTarget.orderNumber} updated.`, 'success');
                      setOrderDetailTarget(null);
                      loadAll(true);
                    } catch (err: any) {
                      notify(err?.message || 'Failed to save order updates.', 'error');
                    } finally {
                      setSavingOrderModal(false);
                    }
                  }}
                  className="px-4 py-2 rounded-lg bg-[#42A5F5] hover:bg-[#1E88E5] text-white font-semibold disabled:opacity-60"
                >
                  {savingOrderModal ? 'Saving...' : 'Save Order & Delivery'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {archiveConfirm && (
        <div className="fixed inset-0 z-50 bg-[#123B5D]/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-amber-200 text-xs">
            <div className="flex items-center justify-between border-b border-amber-100 pb-3">
              <h3 className="font-display font-bold text-base text-[#123B5D]">{archiveConfirm.title}</h3>
              <button
                type="button"
                onClick={() => setArchiveConfirm(null)}
                className="p-1 rounded border border-[#DCEAF5] text-[#123B5D]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-950">
              {archiveConfirm.subtitle}
            </p>
            <div className="space-y-1">
              <label className="block font-semibold text-[#123B5D]">
                Mandatory Archive Reason *
              </label>
              <input
                value={archiveConfirm.reason}
                onChange={(e) =>
                  setArchiveConfirm((prev) => (prev ? { ...prev, reason: e.target.value } : null))
                }
                placeholder="Enter reason stored in non-destructive audit log..."
                className="w-full rounded-lg border border-[#DCEAF5] px-3 py-2 text-[#123B5D]"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={archiveConfirm.busy}
                onClick={() => setArchiveConfirm(null)}
                className="px-4 py-2 border border-[#DCEAF5] rounded-lg font-semibold text-[#263746]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={archiveConfirm.busy}
                onClick={async () => {
                  const cleanReason = archiveConfirm.reason.trim();
                  if (!cleanReason) {
                    notify('Archive reason is required.', 'error');
                    return;
                  }
                  setArchiveConfirm((prev) => (prev ? { ...prev, busy: true } : null));
                  try {
                    await apiFetch(archiveConfirm.endpoint, {
                      method: 'DELETE',
                      body: JSON.stringify({ reason: cleanReason }),
                    });
                    notify(`${archiveConfirm.title} completed safely.`, 'info');
                    setArchiveConfirm(null);
                    loadAll(true);
                  } catch (err: any) {
                    notify(err?.message || 'Archive failed.', 'error');
                    setArchiveConfirm((prev) => (prev ? { ...prev, busy: false } : null));
                  }
                }}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-semibold disabled:opacity-50"
              >
                {archiveConfirm.busy ? 'Archiving...' : 'Confirm Archive'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
