export interface AddressData {
  id?: number;
  label?: string;
  addressType?: string;
  fullName: string;
  mobile: string;
  houseFlat: string;
  streetArea: string;
  landmark?: string;
  city: string;
  district: string;
  state: string;
  pinCode: string;
  country: string;
  isDefault?: boolean;
}

export interface ProductCategory {
  id: number;
  name: string;
  slug: string;
  storeScope: 'general' | '3d_printed';
  description: string;
  isActive: boolean;
  sortOrder: number;
}

export interface Brand {
  id: number;
  name: string;
  slug: string;
  logoUrl: string;
  description: string;
  isActive: boolean;
  createdAt?: string;
}

export interface MediaAsset {
  id: number;
  fileName: string;
  url: string;
  mimeType: string;
  sizeBytes: number;
  altText: string;
  folder: string;
  uploadedBy: string;
  createdAt: string;
}

export type ProductType =
  | 'simple'
  | 'variable'
  | 'customizable'
  | 'made_to_order'
  | 'quote_only';

export interface Product {
  id: number;
  categoryId: number | null;
  sku: string;
  name: string;
  slug: string;
  brand: string;
  productType?: ProductType | string;
  modelNumber?: string;
  subcategory?: string;
  shortDescription?: string;
  storeScope: 'general' | '3d_printed';
  description: string;
  technicalSpecs: Record<string, string>;
  features?: string[];
  priceInr: number;
  discountPriceInr: number | null;
  gstPercent: number;
  stockQty: number;
  dimensions: string;
  weightGrams: number;
  shippingWeightGrams?: number;
  deliveryInfo?: string;
  material: string;
  availableColors: string[];
  availableVariants: string[];
  productionTimeDays: number;
  warrantyInfo: string;
  imageUrl: string;
  galleryUrls: string[];
  datasheetUrl: string;
  brochureUrl?: string;
  model3dUrl?: string;
  seoTitle?: string;
  seoDescription?: string;
  status?: string;
  publishedAt?: string | null;
  isFeatured: boolean;
  isPublished: boolean;
  compatibility?: string;
  packageContents?: string[];
  applications?: string;
  productFaqs?: Array<{ q: string; a: string }>;
  tags?: string[];
  relatedProductIds?: number[];
  boughtTogetherIds?: number[];
  videoUrl?: string;
  lowStockThreshold?: number;
  isBestseller?: boolean;
  isNewArrival?: boolean;
  sortOrder?: number;
  hsnCode?: string;
  ratingAvg?: number;
  reviewCount?: number;
  isDeleted?: boolean;
}

export interface PrintingMaterial {
  id: number;
  name: string;
  technology: 'FDM' | 'SLA' | string;
  densityGcm3: number;
  ratePerGramInr: number;
  availableColors: Array<{ name: string; hex: string }>;
  layerHeightsMm: number[];
  description: string;
  isActive: boolean;
}

export interface PrintingMachine {
  id: number;
  name: string;
  technology: string;
  buildVolumeX: number;
  buildVolumeY: number;
  buildVolumeZ: number;
  hourlyRateInr: number;
  minOrderInr: number;
  wastagePercent: number;
  labourFeeInr: number;
  finishingFeeInr: number;
  isActive: boolean;
}

export type PrintingOrderStatus =
  | 'New Order'
  | 'Pending Payment'
  | 'Payment Pending'
  | 'Payment Completed'
  | 'File Under Review'
  | 'Quotation Sent'
  | 'Printing Parameters Confirmed'
  | 'Ready for Printing'
  | 'Approved for Printing'
  | 'Printing in Progress'
  | 'Quality Inspection'
  | 'Completed'
  | 'Dispatched / Delivered'
  | 'Rejected'
  | 'Cancelled';

export interface PrintingProductionFile {
  id: number;
  printingOrderId: number;
  fileName: string;
  fileFormat: string;
  fileSizeBytes: number;
  fileStoragePath: string;
  storageBucket: string;
  fileKind: 'sliced_gcode' | 'converted_mesh' | 'production_notes' | string;
  notes: string;
  uploadedBy: string;
  createdAt: string;
}

export interface PrintingFileDownloadLog {
  id: number;
  printingOrderId: number;
  orderNumber: string;
  userId: number | null;
  actorEmail: string;
  actorRole: string;
  fileKind: 'original' | 'production' | 'spec_sheet' | string;
  fileName: string;
  accessGranted: boolean;
  denialReason: string;
  ipAddress: string;
  createdAt: string;
}

export interface PrintingOrderCustomerDetails {
  customerId: string;
  fullName: string;
  email: string;
  mobile: string;
  companyOrCollege?: string;
  fullAddress?: string;
  city?: string;
  state?: string;
  pinCode?: string;
  accountStatus?: string;
  registrationDate?: string;
}

export interface PrintingOrderRecord {
  id: number;
  orderNumber: string;
  userId: number | null;
  customerId?: string;
  customerName?: string;
  email?: string;
  phone?: string;
  fileName: string;
  fileFormat: string;
  fileSizeBytes: number;
  fileStoragePath: string;
  fileVersion?: string;
  storageBucket?: string;
  boundingBoxMm: { x: number; y: number; z: number };
  volumeCm3: number;
  estimatedWeightG: number;
  estimatedPrintMinutes: number;
  technology: string;
  printerName?: string;
  materialName: string;
  colorName: string;
  layerHeightMm: number;
  infillPercent: number;
  wallCount?: number;
  printSpeedMmS?: number;
  nozzleDiameterMm?: number;
  buildOrientation?: string;
  scalePercent?: number;
  supportEnabled: boolean;
  quantity: number;
  finishingOption: string;
  specialInstructions: string;
  customerParameters?: Record<string, any> | null;
  confirmedParameters?: Record<string, any> | null;
  pricingBreakdown: {
    materialCostInr: number;
    machineCostInr: number;
    supportCostInr: number;
    wastageCostInr: number;
    labourCostInr: number;
    finishingCostInr: number;
    subtotalInr: number;
    deliveryInr: number;
    gstInr: number;
    discountInr: number;
    totalInr: number;
    technicalReviewRequired: boolean;
    warnings: string[];
  };
  quotedPriceInr?: number | null;
  totalInr: number;
  deliveryAddress: AddressData | Record<string, any>;
  slicingStatus: string;
  orderStatus: string;
  paymentStatus: string;
  refundStatus?: string;
  paymentVerifiedAt?: string | null;
  customerDownloadEnabled?: boolean;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  trackingCourier: string;
  trackingId: string;
  trackingUrl: string;
  productionNotes: string;
  rejectionReason?: string;
  printingApprovedAt?: string | null;
  printingApprovedBy?: string;
  productionPhotos: string[];
  uploadedAt?: string;
  createdAt: string;
  updatedAt: string;
  customerEmail?: string;
  customerMobile?: string;
  customerDetails?: PrintingOrderCustomerDetails | null;
  downloadUnlocked?: boolean;
  downloadLockReason?: string;
  printingAuthorized?: boolean;
  printingBlockReason?: string;
  paymentLabel?: string;
  paymentWarning?: string;
  productionFiles?: PrintingProductionFile[];
  downloadLogs?: PrintingFileDownloadLog[];
}

export interface CartItem {
  product: Product;
  qty: number;
  variant?: string;
  color?: string;
}

export interface CartSummary {
  itemCount: number;
  subtotalInr: number;
  gstInr: number;
  discountInr: number;
  shippingInr: number;
  freeShippingAboveInr: number;
  grandTotalInr: number;
  couponCode: string;
}

export interface CloudServiceCatalogItem {
  id: number;
  serviceCode: string;
  name: string;
  slug: string;
  category: string;
  description: string;
  basePriceInr: number;
  gstPercent: number;
  options?: Record<string, unknown>;
  isActive: boolean;
}

export interface ServiceRecordItem {
  id: number;
  serviceRecordNumber: string;
  serviceId?: number | null;
  userId?: number | null;
  customerId: string;
  customerEmail: string;
  serviceName: string;
  category: string;
  description: string;
  specifications: string;
  selectedOptions?: Record<string, unknown>;
  uploadedFiles?: Array<{
    originalName: string;
    storagePath: string;
    bucket?: string;
    sizeBytes?: number;
    mimeType?: string;
  }>;
  quantity: number;
  unitPriceInr: number;
  taxInr: number;
  totalAmountInr: number;
  status: string;
  adminRemarks: string;
  assignedTeam: string;
  sourceEntityType: string;
  sourceEntityId: string;
  isDeleted: boolean;
  archivedAt?: string | null;
  archivedReason?: string;
  archivedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BlogPost {
  id: number;
  title: string;
  slug: string;
  category: string;
  tags: string[];
  excerpt: string;
  content: string;
  coverImageUrl: string;
  seoTitle: string;
  seoDescription: string;
  author?: string;
  isPublished: boolean;
  publishedAt: string;
}

export interface CaseStudy {
  id: number;
  title: string;
  slug: string;
  technologyUsed: string;
  applications: string;
  outcomes: string;
  relatedServices: string[];
  description: string;
  imageUrl: string;
  videoUrl?: string;
  isPublished: boolean;
}

export interface NotificationPreferences {
  emailUpdates: boolean;
  orderAlerts: boolean;
  quotationAlerts: boolean;
  promotionalEmails: boolean;
  whatsappAlerts: boolean;
}

export interface CustomerActivityLogRecord {
  id: number;
  userId: number;
  customerId: string;
  action: string;
  entityType: string;
  entityId: string;
  details: Record<string, any>;
  createdAt: string;
}

export interface BillingDetails {
  gstin?: string;
  billingName?: string;
  billingEmail?: string;
  pan?: string;
  billingAddress?: string;
}

export interface DbUser {
  id: number;
  uid: string;
  customerId?: string;
  email: string;
  fullName: string;
  mobile: string;
  companyOrCollege: string;
  fullAddress?: string;
  city?: string;
  state?: string;
  pinCode?: string;
  profilePhotoUrl?: string;
  customerType?: 'Individual' | 'Business' | 'Academic' | 'FPO / Agri' | string;
  billingDetails?: BillingDetails;
  accountStatus?: string;
  registrationDate?: string;
  lastLoginAt?: string | null;
  role: string;
  emailVerified?: boolean;
  phoneVerified?: boolean;
  emailConfirmedAt?: string;
  phoneConfirmedAt?: string;
  notificationPreferences?: NotificationPreferences;
  isActive?: boolean;
}

export interface CrmLead {
  id: number;
  name: string;
  email: string;
  phone: string;
  companyOrCollege: string;
  source: string;
  stage: string;
  assignedTo: string;
  estimatedValueInr: number;
  nextFollowUpDate: string;
  summary: string;
  createdAt: string;
  updatedAt: string;
}

export interface CrmNote {
  id: number;
  entityType: string;
  entityId: number;
  authorEmail: string;
  note: string;
  createdAt: string;
}

export type HomepageSectionType =
  | 'hero'
  | 'company_intro'
  | 'categories'
  | 'featured_products'
  | 'bestsellers'
  | 'new_arrivals'
  | 'agri_fpv_showcase'
  | 'services'
  | 'printing_and_projects'
  | 'krashivantri_apps'
  | 'case_studies'
  | 'testimonials'
  | 'why_us'
  | 'industries_applications'
  | 'faqs_section'
  | 'contact_enquiry'
  | 'custom_block'
  | 'cta';

export interface HomepageSectionConfig {
  id: string;
  type: HomepageSectionType;
  visible: boolean;
  kicker?: string;
  heading?: string;
  subheading?: string;
  body?: string;
  primaryCtaLabel?: string;
  primaryCtaLink?: string;
  secondaryCtaLabel?: string;
  secondaryCtaLink?: string;
  imageUrl?: string;
  backgroundImageUrl?: string;
  videoUrl?: string;
  galleryUrls?: string[];
  badgeText?: string;
  customItems?: Array<{ title: string; body: string }>;
}

export interface KrashivantriModelConfig {
  id: string;
  name: string;
  tagline: string;
  summary: string;
  imageUrl: string;
  videoUrl?: string;
  galleryUrls?: string[];
  specs: Array<{ label: string; value: string }>;
  highlights: string[];
}

export interface AndroidAppLinkConfig {
  id: string;
  name: string;
  role: string;
  description: string;
  comingSoon: boolean;
  playStoreUrl: string;
  apkDownloadUrl?: string;
}

export interface NavigationMenuItem {
  id: string;
  label: string;
  to: string;
  visible: boolean;
  sortOrder: number;
  children?: Array<{ id: string; label: string; to: string }>;
}

export interface ServiceCatalogItem {
  slug: string;
  title: string;
  shortDesc: string;
  fullDesc?: string;
  visible: boolean;
  imageUrl?: string;
  videoUrl?: string;
  benefits?: string[];
  capabilities?: string[];
  ctaLabel?: string;
  ctaLink?: string;
  secondaryCtaLabel?: string;
  secondaryCtaLink?: string;
}

export interface WebsiteBannerItem {
  id?: number;
  bannerKey: string;
  title: string;
  subtitle: string;
  placement: 'homepage_hero' | 'homepage_promo' | 'krashivantri' | 'services' | 'store' | 'about' | string;
  imageUrl: string;
  videoUrl?: string;
  ctaLabel: string;
  ctaLink: string;
  sortOrder: number;
  isActive: boolean;
  status: 'published' | 'draft' | string;
}

export interface MediaAssetRecord {
  id: number;
  fileName: string;
  title?: string;
  description?: string;
  category?: string;
  thumbnailUrl?: string;
  mediaKind?: 'image' | 'video' | 'document' | 'model3d' | string;
  url: string;
  mimeType: string;
  sizeBytes: number;
  altText: string;
  folder: string;
  uploadedBy: string;
  createdAt: string;
}

export interface AboutUsCmsContent {
  heroKicker: string;
  heroTitle: string;
  heroDescription: string;
  heroImageUrl: string;
  heroVideoUrl?: string;
  heroCapabilities: Array<{ num: string; title: string; detail: string }>;
  overviewTitle: string;
  overviewSubtitle: string;
  overviewParagraphs: string[];
  historyTitle: string;
  historyDescription: string;
  visionTitle: string;
  visionDescription: string;
  missionTitle: string;
  missionPoints: string[];
  verticalsSectionTitle: string;
  verticals: Array<{
    num: string;
    title: string;
    description: string;
    imageUrl: string;
    groupLabel: string;
    items: string[];
    highlightNote?: string;
  }>;
  techSectionTitle: string;
  techCapabilities: Array<{ title: string; desc: string }>;
  daasTitle: string;
  daasDescription: string;
  daasHighlights: string[];
  daasImageUrl: string;
  krashiShowcaseTitle: string;
  krashiShowcaseSubtitle: string;
  leadershipTitle: string;
  leadershipSubtitle: string;
  teamSectionTitle: string;
  teamSectionSubtitle: string;
  coreValuesTitle: string;
  coreValues: Array<{ title: string; desc: string }>;
  companyMediaGallery: Array<{
    id: string;
    title: string;
    caption: string;
    mediaType: 'image' | 'video';
    url: string;
    thumbnailUrl?: string;
  }>;
  ctaHeading: string;
  ctaBody: string;
  ctaPrimaryLabel: string;
  ctaPrimaryLink: string;
  ctaSecondaryLabel: string;
  ctaSecondaryLink: string;
}

export interface ServicesCmsContent {
  heroKicker: string;
  heroTitle: string;
  heroDescription: string;
  bannerImageUrl?: string;
  bannerVideoUrl?: string;
  services: ServiceCatalogItem[];
}

export interface ProjectGalleryCmsContent {
  heroKicker: string;
  heroTitle: string;
  heroDescription: string;
  bannerImageUrl?: string;
  featuredVideoUrl?: string;
  categories: Array<{ id: string; name: string; description: string; imageUrl?: string }>;
}

export interface StoreCmsContent {
  promoBannerEnabled: boolean;
  promoBannerKicker: string;
  promoBannerTitle: string;
  promoBannerSubtitle: string;
  promoBannerImageUrl: string;
  promoBannerVideoUrl?: string;
  promoBannerCtaLabel: string;
  promoBannerCtaLink: string;
  categoryDescriptions: Record<string, string>;
}

export interface ContactFooterCmsContent {
  contactHeroKicker: string;
  contactHeroTitle: string;
  contactHeroSubtitle: string;
  googleMapsUrl: string;
  supportHeadline: string;
  supportDescription: string;
  footerDescription: string;
  newsletterTitle: string;
  newsletterDescription: string;
  copyrightText: string;
}

export interface SeoRouteEntry {
  route: string;
  label: string;
  title: string;
  description: string;
  keywords: string;
  ogImageUrl: string;
  socialDescription: string;
  canonicalUrl?: string;
  robots?: string;
}

export interface WebsiteCmsSectionsBundle {
  aboutUs: AboutUsCmsContent;
  services: ServicesCmsContent;
  projectGallery: ProjectGalleryCmsContent;
  storeContent: StoreCmsContent;
  contactFooter: ContactFooterCmsContent;
  krashivantriVideoUrl?: string;
}

export interface CmsPageRecord {
  id: number;
  title: string;
  slug: string;
  seoTitle: string;
  seoDescription: string;
  draftContent: {
    heroHeadline: string;
    heroSubheadline: string;
    heroImageUrl?: string;
    heroVideoUrl?: string;
    ctaLabel: string;
    ctaLink: string;
    seoKeywords?: string;
    ogImageUrl?: string;
    canonicalUrl?: string;
    blocks: Array<{ id: string; heading: string; body: string; imageUrl?: string; videoUrl?: string }>;
  };
  publishedContent: {
    heroHeadline: string;
    heroSubheadline: string;
    heroImageUrl?: string;
    heroVideoUrl?: string;
    ctaLabel: string;
    ctaLink: string;
    seoKeywords?: string;
    ogImageUrl?: string;
    canonicalUrl?: string;
    blocks: Array<{ id: string; heading: string; body: string; imageUrl?: string; videoUrl?: string }>;
  } | null;
  status: string;
  updatedBy: string;
  updatedAt: string;
}

export interface SiteSettings {
  announcementBar?: {
    enabled: boolean;
    text: string;
    link: string;
    ctaLabel: string;
  };
  companyInfo?: {
    legalName: string;
    brandName: string;
    established: string;
    founderCeo: string;
    email: string;
    customerCareEmail?: string;
    website: string;
    address: string;
    cin: string;
    gstin: string;
    contactPhone: string;
    businessHours: string;
    primaryTagline: string;
    secondaryTagline: string;
    socialLinks?: {
      linkedin?: string;
      instagram?: string;
      youtube?: string;
      github?: string;
      twitter?: string;
    };
  };
  seoConfig?: {
    defaultTitle: string;
    defaultDescription: string;
    defaultKeywords?: string;
    defaultOgImageUrl?: string;
    defaultSocialDescription?: string;
    ga4MeasurementId?: string;
    googleSiteVerification?: string;
    routes?: SeoRouteEntry[];
  };
  shippingConfig?: {
    standardShippingInr: number;
    freeShippingAboveInr: number;
    defaultGstPercent: number;
  };
  projectSettings?: {
    enableGstTax: boolean;
    defaultGstPercent: number;
    defaultAdvancePercent: number;
    quotationValidityDays: number;
  };
  homepageLayout?: {
    draft: HomepageSectionConfig[];
    published: HomepageSectionConfig[];
    publishedAt?: string;
  };
  cmsWorkspace?: {
    draft: WebsiteCmsSectionsBundle;
    published: WebsiteCmsSectionsBundle;
    publishedAt?: string;
    updatedAt?: string;
    updatedBy?: string;
  };
  cmsContent?: WebsiteCmsSectionsBundle;
  navigationMenus?: {
    header: NavigationMenuItem[];
  };
  servicesCatalog?: ServiceCatalogItem[];
  krashivantriCatalog?: {
    platformName: string;
    summary: string;
    bannerImageUrl?: string;
    bannerVideoUrl?: string;
    models: KrashivantriModelConfig[];
  };
  appLinks?: AndroidAppLinkConfig[];
  krashivantriInfo?: {
    platformName: string;
    summary: string;
    verifiedSpecs: Array<{ label: string; value: string }>;
  };
  pcbPricingConfig?: {
    singleLayerBaseSetupInr: number;
    singleLayerRatePerCm2Inr: number;
    doubleLayerBaseSetupInr: number;
    doubleLayerRatePerCm2Inr: number;
    minOrderChargeInr: number;
    copperRates: Record<string, number>;
    thicknessRates: Record<string, number>;
    finishSurchargesInr: Record<string, number>;
    colorSurchargesInr: Record<string, number>;
    standardShippingInr: number;
    freeShippingAboveInr: number;
    gstApplicable: boolean;
    gstPercent: number;
  };
  faqs?: Array<{ q: string; a: string }>;
  testimonials?: Array<{ name: string; role: string; org: string; quote: string }>;
  policies?: {
    shipping: string;
    returnRefund: string;
    privacy: string;
    terms: string;
  };
  projectPaymentSettings?: ProjectPaymentSettings;
  projectEmailTemplates?: EmailTemplateDef[];
  krashivantriOpsConfig?: KrashivantriOpsConfig;
  aboutTeam?: TeamMemberProfile[];
}

export interface TeamMemberProfile {
  id: string;
  dbId?: number;
  name: string;
  fullName?: string;
  designation: string;
  department?: string;
  professionalCategory?: string;
  qualifications: string;
  experience?: string;
  biography: string;
  shortBiography?: string;
  detailedBiography?: string;
  responsibilities: string;
  skills?: string[] | string;
  linkedinUrl?: string;
  photoUrl: string;
  profilePhotoUrl?: string;
  photoAlt?: string;
  displayOrder: number;
  status?: 'published' | 'draft';
  isFeatured?: boolean;
  isActive: boolean;
}


export interface DroneRepairBooking {
  id: number;
  referenceNumber: string;
  userId: number | null;
  serviceMode: 'field_visit' | 'service_centre' | string;
  customerName: string;
  mobile: string;
  email: string;
  address: string;
  city: string;
  district: string;
  pinCode: string;
  droneBrandModel: string;
  droneType: string;
  problemDescription: string;
  photos: Array<{ originalName: string; storagePath: string; mimeType: string; sizeBytes: number }>;
  videoFile: { originalName: string; storagePath: string; mimeType: string; sizeBytes: number } | null;
  preferredDate: string;
  preferredTime: string;
  additionalInfo: string;
  status: string;
  assignedEngineer: string;
  inspectionChargeInr: number | null;
  inspectionChargeConfirmed: boolean;
  inspectionPaymentStatus: string;
  repairQuotationInr: number | null;
  repairQuotationNotes: string;
  repairApproved: boolean;
  repairPaymentStatus: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  adminNotes: string;
  statusHistory: Array<{ status: string; timestamp: string; note: string; actor: string }>;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectPaymentSettings {
  defaultPlanType: string;
  advancePercent: number;
  finalPercent: number;
  allowFullPayment: boolean;
  enableGstTax: boolean;
  gstPercent: number;
  quotationValidityDays: number;
  quotationPrefix: string;
  projectPrefix: string;
  paymentPrefix: string;
  invoicePrefix: string;
  receiptPrefix: string;
  clearancePrefix: string;
  workOrderPrefix: string;
  handoverDownloadExpiryDays: number;
  reminderIntervalsDays: number[];
  allowHandoverExceptionBySuperAdmin: boolean;
  cancellationRefundPolicy: string;
}

export interface EmailTemplateDef {
  eventType: string;
  label: string;
  enabled: boolean;
  subject: string;
  body: string;
}

export interface ProjectPaymentMilestone {
  id: number;
  planId: number | null;
  projectId: number | null;
  quotationId: number;
  stageName: string;
  stageOrder: number;
  percent: number;
  amountInr: number;
  dueTrigger: string;
  status: string;
  paymentRef: string;
  paidAt: string | null;
}

export interface PaymentReceiptRecord {
  id: number;
  receiptNumber: string;
  paymentRef: string;
  entityType: string;
  entityId: number;
  paymentStage: string;
  amountInr: number;
  razorpayPaymentId: string;
  payload: Record<string, unknown>;
  issuedAt: string;
}

export interface PaymentClearanceCertificate {
  id: number;
  certificateNumber: string;
  projectId: number;
  enquiryId: number;
  quotationId: number | null;
  totalAmountInr: number;
  advancePaidInr: number;
  finalPaidInr: number;
  balanceInr: number;
  paymentRefs: string[];
  issuedBy: string;
  issuedAt: string;
}

export interface ProjectWorkOrder {
  id: number;
  workOrderNumber: string;
  projectId: number;
  enquiryId: number;
  assignedEngineer: string;
  estimatedCompletionDate: string;
  scopeSummary: string;
  issuedAt: string;
}

export interface ProjectHandoverDocument {
  id: number;
  projectId: number;
  title: string;
  category: string;
  fileName: string;
  fileSizeBytes: number;
  versionLabel: string;
  notes: string;
  downloadToken?: string | null;
  tokenExpiresAt: string;
  downloadCount: number;
  lastDownloadedAt: string | null;
  uploadedBy: string;
  createdAt: string;
  locked?: boolean;
}

export interface ProjectDeliveryRecord {
  id: number;
  projectId: number;
  courierName: string;
  trackingNumber: string;
  trackingUrl: string;
  dispatchDate: string;
  expectedDeliveryDate: string;
  actualDeliveryDate: string;
  dispatchNotes: string;
  updatedBy: string;
  createdAt: string;
}

export interface KrashivantriOpsConfig {
  baseRatePerAcreInr: number;
  minimumBookingAcres: number;
  platformCommissionPercent: number;
  gpsStaleThresholdMinutes: number;
  arrivalGeofenceMeters: number;
  pilotResponseTimeoutMinutes: number;
  cancellationBeforeDispatchRefundPercent: number;
  lateArrivalPenaltyInr: number;
}

export interface FarmerProfile {
  id: number;
  userId: number | null;
  farmerCode: string;
  fullName: string;
  mobile: string;
  email: string;
  village: string;
  taluka: string;
  district: string;
  state: string;
  pinCode: string;
  aadhaarLast4: string;
  kycStatus: string;
  accountStatus: string;
  totalLandAcres: number;
  cropsGrown: string;
  rejectionReason: string;
  verifiedBy: string;
  verifiedAt: string;
  createdAt: string;
}

export interface FarmerFarm {
  id: number;
  farmerId: number;
  farmName: string;
  cropType: string;
  areaAcres: number;
  village: string;
  district: string;
  state: string;
  pinCode: string;
  centerLat: number;
  centerLng: number;
  boundaryGeoJson: Array<{ lat: number; lng: number }>;
  isActive: boolean;
}

export interface DronePilotProfile {
  id: number;
  userId: number | null;
  pilotCode: string;
  fullName: string;
  mobile: string;
  email: string;
  city: string;
  district: string;
  state: string;
  pinCode: string;
  rpcNumber: string;
  rpcValidUntil: string;
  kycStatus: string;
  accountStatus: string;
  serviceRadiusKm: number;
  totalSprayedAcres: number;
  penaltyPoints: number;
  rejectionReason: string;
  verifiedBy: string;
  createdAt: string;
}

export interface PilotDrone {
  id: number;
  pilotId: number;
  droneModel: string;
  uinNumber: string;
  tankCapacityLiters: number;
  sprayWidthMeters: number;
  verificationStatus: string;
}

export interface PilotBankAccount {
  id: number;
  pilotId: number;
  accountHolderName: string;
  bankName: string;
  accountNumberMasked: string;
  ifscCode: string;
  upiId: string;
  verificationStatus: string;
  isPrimary: boolean;
}

export interface PilotAvailability {
  id: number;
  pilotId: number;
  isOnline: boolean;
  gpsPermissionGranted: boolean;
  currentLat: number | null;
  currentLng: number | null;
  accuracyMeters: number | null;
  speedMps: number | null;
  headingDeg: number | null;
  batteryPercent: number | null;
  lastLocationAt: string | null;
  status: string;
  gpsStalenessSeconds?: number | null;
  isStale?: boolean;
  gpsAvailable?: boolean;
}

export interface ServiceBooking {
  id: number;
  bookingNumber: string;
  farmerId: number;
  farmId: number | null;
  assignedPilotId: number | null;
  cropType: string;
  sprayType: string;
  chemicalProvidedBy: string;
  bookedAreaAcres: number;
  ratePerAcreInr: number;
  totalAmountInr: number;
  platformCommissionPercent: number;
  pilotPayoutInr: number;
  preferredDate: string;
  preferredSlot: string;
  farmLat: number;
  farmLng: number;
  farmBoundary: Array<{ lat: number; lng: number }>;
  bookingStatus: string;
  paymentStatus: string;
  farmerNotes: string;
  createdAt: string;
  farmer?: Partial<FarmerProfile> | null;
  assignedPilot?: (Partial<DronePilotProfile> & { availability?: PilotAvailability | null }) | null;
  session?: OperationSession | null;
  evidence?: OperationEvidence[];
}

export interface OperationSession {
  id: number;
  sessionCode: string;
  bookingId: number;
  pilotId: number;
  farmerId: number;
  status: string;
  startedAt: string | null;
  pausedAt: string | null;
  resumedAt: string | null;
  completedAt: string | null;
  insideGeofenceOnStart: boolean;
  geofenceDistanceMeters: number;
  completedAreaAcres: number;
  pauseReason: string;
  pilotNotes: string;
  farmerConfirmed: boolean;
  farmerDisputeReason: string;
}

export interface OperationEvidence {
  id: number;
  sessionId: number;
  bookingId: number;
  pilotId: number;
  evidencePhase: string;
  mediaType: string;
  fileName: string;
  storagePath: string;
  latitude: number | null;
  longitude: number | null;
  caption: string;
  capturedAt: string;
}

export interface PilotPayout {
  id: number;
  payoutRef: string;
  pilotId: number;
  amountInr: number;
  bankAccountMasked: string;
  payoutProvider: string;
  providerPayoutId: string;
  status: string;
  failureReason: string;
  approvedBy: string;
  processedAt: string | null;
  createdAt: string;
}

export interface PenaltyRecord {
  id: number;
  penaltyNumber: string;
  targetType: string;
  targetId: number;
  targetLabel?: string;
  bookingId: number | null;
  reasonCategory: string;
  description: string;
  evidenceSummary: string;
  amountInr: number;
  status: string;
  appealStatus: string;
  imposedBy: string;
  createdAt: string;
}

export interface ProjectMessageRecord {
  id: number;
  enquiryId: number;
  projectId: number | null;
  senderRole: 'customer' | 'admin' | string;
  senderEmail: string;
  senderName: string;
  message: string;
  attachments: Array<{
    originalName: string;
    storagePath: string;
    mimeType: string;
    sizeBytes: number;
    documentCategory?: string;
  }>;
  createdAt: string;
}

export interface ProductEnquiryRecord {
  id: number;
  enquiryNumber: string;
  userId?: number | null;
  fullName: string;
  mobile: string;
  email: string;
  state: string;
  district: string;
  organizationOrFarmName: string;
  interestedProduct: string;
  productSlug: string;
  quantity: number;
  intendedApplication: string;
  message: string;
  status: string;
  assignedStaff: string;
  internalNotes: string;
  createdAt: string;
  updatedAt: string;
}

export interface StoreOrderRecord {
  id: number;
  orderNumber: string;
  userId: number;
  customerEmail?: string;
  billingAddress: AddressData;
  shippingAddress: AddressData;
  items: Array<{
    productId: number;
    sku: string;
    hsnCode?: string;
    name: string;
    imageUrl?: string;
    variant?: string;
    color?: string;
    qty: number;
    unitPriceInr: number;
    gstPercent: number;
    lineTotalInr: number;
  }>;
  subtotalInr: number;
  discountInr: number;
  shippingInr: number;
  gstInr: number;
  totalInr: number;
  couponCode: string;
  paymentStatus: string;
  refundStatus?: string;
  orderStatus: string;
  statusHistory?: Array<{ status: string; timestamp: string; note?: string; actor?: string }>;
  cancelledReason?: string;
  cancelledAt?: string | null;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  trackingCourier: string;
  trackingId: string;
  trackingUrl: string;
  dispatchDate: string;
  expectedDeliveryDate: string;
  internalNotes: string;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerProfileSummary {
  id: string;
  customerId: string;
  authUserId: string | null;
  webUserId: number | null;
  fullName: string;
  email: string;
  mobile: string;
  companyOrCollege: string;
  fullAddress: string;
  city: string;
  state: string;
  pinCode: string;
  accountStatus: string;
  registrationDate: string;
}

export interface CustomerPermissions {
  canViewCustomers: boolean;
  canAddCustomers: boolean;
  canEditCustomers: boolean;
  canDeactivateCustomers: boolean;
  canReactivateCustomers: boolean;
  canPermanentlyDeleteCustomers: boolean;
  canViewDeletionHistory: boolean;
}

export interface StaffCustomerPermissionRow {
  userId: number;
  uid: string;
  email: string;
  fullName: string;
  role: string;
  isActive: boolean;
  permissions: CustomerPermissions;
  grantedByEmail: string;
  updatedAt: string | null;
}

export interface CustomerDeletionPreview {
  customer: {
    id: string | number;
    customerCode: string;
    fullName: string;
    email: string;
    mobile: string;
    accountStatus: string;
    authUserId: string | null;
    webUserId: number | null;
  };
  willDelete: {
    addresses: number;
    cartItems: number;
    wishlistItems: number;
    notifications: number;
    activeSessions: number;
    exclusiveAuthAccount: boolean;
  };
  willPreserveAndDetach: {
    storeOrders: number;
    printingOrders: number;
    projectEnquiries: number;
    projects: number;
    pcbEnquiries: number;
    droneRepairs: number;
    b2bEnquiries: number;
    payments: number;
    invoices: number;
    receipts: number;
    supportTickets: number;
    productEnquiries: number;
    reviews: number;
  };
  totalPreservedFinancialAndWorkRecords: number;
  sharedAuthProfilesCount: number;
}

export interface CustomerDeletionAuditEntry {
  id: number;
  customerCode: string;
  customerDbId: string;
  authUserId: string | null;
  hadExclusiveAuthAccount: boolean;
  deletedAuthAccount: boolean;
  deletedByUserId: number | null;
  deletedByEmail: string;
  deletedByRole: string;
  reason: string;
  summaryCounts: Record<string, number>;
  createdAt: string;
}

export interface ProjectAgreementRecord {
  id: number;
  agreementNumber: string;
  projectId: number | null;
  enquiryId: number | null;
  projectCode?: string;
  enquiryNumber?: string;
  customerId: number | string;
  customerCode?: string;
  customerEmail?: string;
  title: string;
  versionLabel?: string;
  status: string;
  originalFileName?: string;
  originalFilePath?: string;
  originalStorageBucket?: string;
  fileName?: string;
  storagePath?: string;
  storageBucket?: string;
  signedFileName?: string;
  signedFilePath?: string;
  signedStorageBucket?: string;
  signedAt?: string | null;
  signedByName?: string;
  acceptedAt?: string | null;
  acceptedByName?: string;
  acceptedByEmail?: string;
  acceptanceIp?: string;
  acceptanceRecord?: Record<string, any> | null;
  agreementData?: Record<string, any> | null;
  generatedAt?: string | null;
  awaitingAcceptanceAt?: string | null;
  companyStampAssetId?: number | null;
  companySignatureAssetId?: number | null;
  notes?: string;
  isDeleted?: boolean;
  deletedReason?: string;
  createdByUserId?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectPaymentSummaryRecord {
  id: number;
  projectId: number;
  enquiryId: number | null;
  quotationId: number | null;
  userId: number | null;
  customerId: string;
  projectCode: string;
  totalAmountInr: number;
  paidAmountInr: number;
  pendingAmountInr: number;
  status: 'Pending' | 'Partially Paid' | 'Paid' | 'Failed' | string;
  currency: string;
  createdBy: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentInstallmentRecord {
  id: number;
  projectId: number;
  projectPaymentId: number | null;
  installmentNumber: 1 | 2 | number;
  title: string;
  milestoneName: string;
  percentage: number;
  amountInr: number;
  paidAmountInr: number;
  status: 'Pending' | 'Partially Paid' | 'Paid' | 'Failed' | string;
  dueDate: string;
  dueTrigger: string;
  razorpayPaymentLinkId: string;
  paymentLinkUrl: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  paymentMethod: string;
  paidAt: string | null;
  lastReminderAt: string | null;
  reminderCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentReminderRecord {
  id: number;
  projectId: number;
  installmentId: number | null;
  userId: number | null;
  recipientEmail: string;
  installmentNumber: number;
  amountInr: number;
  reminderType: 'automatic' | 'manual' | string;
  channel: string;
  deliveryStatus: string;
  errorMessage: string;
  sentBy: string;
  sentAt: string;
}

export interface AgreementSettingsRecord {
  id: number;
  companyName: string;
  companyLogoUrl: string;
  companyAddress: string;
  contactEmail: string;
  contactPhone: string;
  gstin: string;
  cin: string;
  defaultScopeTemplate: string;
  defaultTimelineText: string;
  advancePaymentTerms: string;
  secondPaymentTerms: string;
  termsAndConditions: string;
  cancellationRefundPolicy: string;
  signatoryName: string;
  signatoryDesignation: string;
  stampAssetId: number | null;
  signatureAssetId: number | null;
  updatedBy: string;
  updatedAt: string;
}

export interface ProjectAttachmentRecord {
  id: number;
  projectId: number | null;
  enquiryId: number | null;
  userId: number | null;
  customerId: string;
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  storageBucket: string;
  storagePath: string;
  category: string;
  uploadedBy: string;
  createdAt: string;
}

export interface PaymentTransactionRecord {
  id: number;
  projectId: number;
  projectPaymentId: number | null;
  installmentId: number | null;
  installmentNumber: number;
  userId: number | null;
  customerId: string;
  amountInr: number;
  paymentMethod: string;
  transactionRef: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  paymentLinkId: string;
  status: 'Pending' | 'Paid' | 'Failed' | 'Refunded' | string;
  failureReason: string;
  recordedBy: string;
  notes: string;
  paidAt: string | null;
  createdAt: string;
}

export interface CompanySigningAssetRecord {
  id: number;
  assetType: 'signature' | 'stamp' | 'logo' | string;
  label: string;
  signatoryName?: string;
  designation?: string;
  fileName: string;
  fileStoragePath: string;
  storageBucket: string;
  mimeType: string;
  isActive: boolean;
  isDeleted?: boolean;
  uploadedByUserId?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface RazorpayPaymentLinkRecord {
  id: number;
  paymentLinkId: string;
  shortUrl: string;
  customerId: number | null;
  customerCode?: string;
  customerEmail?: string;
  customerName?: string;
  projectId: number | null;
  enquiryId: number | null;
  orderId: number | null;
  entityType: string;
  entityId: number | null;
  amountInr: number;
  currency: string;
  description: string;
  referenceId: string;
  status: string;
  razorpayPaymentId?: string;
  paymentDate?: string | null;
  webhookPayload?: Record<string, any> | null;
  createdByUserId?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface RecordStatusHistoryEntry {
  id: number;
  entityType: string;
  entityId: string;
  customerId?: number | null;
  customerCode?: string;
  previousStatus?: string;
  newStatus?: string;
  actionType: string;
  reason?: string;
  adminId?: number | null;
  adminEmail?: string;
  originalRecord?: Record<string, any> | null;
  actionDate: string;
}

export interface CustomerActivityLogEntry {
  id: number;
  customerId?: number | null;
  customerCode?: string;
  actorType?: string;
  actorEmail?: string;
  eventType: string;
  entityType?: string;
  entityId?: string;
  description: string;
  metadata?: Record<string, any> | null;
  createdAt: string;
}

