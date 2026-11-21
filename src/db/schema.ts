import { sql } from 'drizzle-orm';
import {
  boolean,
  doublePrecision,
  integer,
  jsonb,
  pgSchema,
  serial,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export const webPlatformSchema = pgSchema('web_platform');

// 1. Users & Role-Based Access Control
export const users = webPlatformSchema.table('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  authUserId: uuid('auth_user_id'),
  email: text('email').notNull(),
  fullName: text('full_name').default('').notNull(),
  mobile: text('mobile').default('').notNull(),
  companyOrCollege: text('company_or_college').default('').notNull(),
  role: text('role').default('customer').notNull(), // customer | super_admin | admin | farmer | drone_pilot | buyer | website_manager | product_manager | sales_manager | project_manager | engineer | printing_operator | inventory_manager | accounts_manager | support_manager | support_staff
  passwordHash: text('password_hash'),
  emailVerified: boolean('email_verified').default(false).notNull(),
  phoneVerified: boolean('phone_verified').default(false).notNull(),
  emailConfirmedAt: text('email_confirmed_at').default('').notNull(),
  phoneConfirmedAt: text('phone_confirmed_at').default('').notNull(),
  accountStatus: text('account_status').default('Active').notNull(),
  statusReason: text('status_reason').default('').notNull(),
  fullAddress: text('full_address').default('').notNull(),
  city: text('city').default('').notNull(),
  state: text('state').default('').notNull(),
  pinCode: text('pin_code').default('').notNull(),
  profilePhotoUrl: text('profile_photo_url').default('').notNull(),
  customerType: text('customer_type').default('Individual').notNull(),
  billingDetails: jsonb('billing_details')
    .$type<{
      gstin?: string;
      billingName?: string;
      billingEmail?: string;
      pan?: string;
      billingAddress?: string;
    }>()
    .default({})
    .notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  notificationPreferences: jsonb('notification_preferences')
    .$type<{
      emailUpdates: boolean;
      orderAlerts: boolean;
      quotationAlerts: boolean;
      promotionalEmails: boolean;
      whatsappAlerts: boolean;
    }>()
    .default({
      emailUpdates: true,
      orderAlerts: true,
      quotationAlerts: true,
      promotionalEmails: false,
      whatsappAlerts: true,
    })
    .notNull(),
  passwordConfigured: boolean('password_configured').default(false).notNull(),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// 1b. Dedicated Customer Registration & Editable Directory Table
export const customers = webPlatformSchema.table('customers', {
  id: serial('id').primaryKey(),
  customerId: text('customer_id')
    .notNull()
    .unique()
    .default(sql`('NTF-CUST-' || lpad(nextval('web_platform.customers_code_seq')::text, 6, '0'))`),
  userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
  authUserId: uuid('auth_user_id'),
  fullName: text('full_name').notNull(),
  email: text('email').notNull(),
  phoneNumber: text('phone_number').default('').notNull(),
  companyOrCollege: text('company_or_college').default('').notNull(),
  fullAddress: text('full_address').default('').notNull(),
  city: text('city').default('').notNull(),
  state: text('state').default('').notNull(),
  pinCode: text('pin_code').default('').notNull(),
  profilePhotoUrl: text('profile_photo_url').default('').notNull(),
  customerType: text('customer_type').default('Individual').notNull(),
  billingDetails: jsonb('billing_details')
    .$type<{
      gstin?: string;
      billingName?: string;
      billingEmail?: string;
      pan?: string;
      billingAddress?: string;
    }>()
    .default({})
    .notNull(),
  passwordHash: text('password_hash').default('').notNull(),
  accountStatus: text('account_status').default('Active').notNull(),
  statusReason: text('status_reason').default('').notNull(),
  emailVerified: boolean('email_verified').default(false).notNull(),
  lastPasswordResetAt: timestamp('last_password_reset_at', { withTimezone: true }),
  lastPasswordChangeAt: timestamp('last_password_change_at', { withTimezone: true }),
  passwordResetStatus: text('password_reset_status').default('Active').notNull(),
  notificationPreferences: jsonb('notification_preferences')
    .$type<{
      emailUpdates: boolean;
      orderAlerts: boolean;
      quotationAlerts: boolean;
      promotionalEmails: boolean;
      whatsappAlerts: boolean;
    }>()
    .default({
      emailUpdates: true,
      orderAlerts: true,
      quotationAlerts: true,
      promotionalEmails: false,
      whatsappAlerts: true,
    })
    .notNull(),
  passwordConfigured: boolean('password_configured').default(false).notNull(),
  registrationDate: timestamp('registration_date', { withTimezone: true }).defaultNow().notNull(),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

export const customerActivityLogs = webPlatformSchema.table('customer_activity_logs', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
  customerId: text('customer_id').default('').notNull(),
  email: text('email').default('').notNull(),
  action: text('action').notNull(),
  category: text('category').default('account').notNull(), // account | order | payment | printing | project | pcb | b2b | support | security
  entityType: text('entity_type').default('customer').notNull(),
  entityId: text('entity_id').default('').notNull(),
  description: text('description').default('').notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const customerIdHistory = webPlatformSchema.table('customer_id_history', {
  id: serial('id').primaryKey(),
  customerDbId: text('customer_db_id').default('').notNull(),
  authUserId: uuid('auth_user_id'),
  email: text('email').default('').notNull(),
  previousCustomerId: text('previous_customer_id'),
  newCustomerId: text('new_customer_id').notNull(),
  previousAccountStatus: text('previous_account_status').default('').notNull(),
  newAccountStatus: text('new_account_status').default('').notNull(),
  operationType: text('operation_type').default('initial_registration').notNull(),
  reason: text('reason').default('').notNull(),
  changedBy: text('changed_by').default('system').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const customerPasswordHistory = webPlatformSchema.table('customer_password_history', {
  id: serial('id').primaryKey(),
  customerId: text('customer_id').default('').notNull(),
  customerDbId: text('customer_db_id').default('').notNull(),
  email: text('email').default('').notNull(),
  authUserId: uuid('auth_user_id'),
  actionType: text('action_type').notNull(), // registration | reset | change | recovery
  actionStatus: text('action_status').default('completed').notNull(), // requested | verified | completed | failed
  ipAddress: text('ip_address').default('').notNull(),
  userAgent: text('user_agent').default('').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const adminSessions = webPlatformSchema.table('admin_sessions', {
  id: serial('id').primaryKey(),
  tokenHash: text('token_hash').notNull().unique(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  activeCustomerId: text('active_customer_id').default('').notNull(),
  sessionScope: text('session_scope').default('customer').notNull(), // customer | admin
  userAgent: text('user_agent').default('').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const staffPermissions = webPlatformSchema.table('staff_permissions', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull()
    .unique(),
  canViewCustomers: boolean('can_view_customers').default(true).notNull(),
  canAddCustomers: boolean('can_add_customers').default(false).notNull(),
  canEditCustomers: boolean('can_edit_customers').default(false).notNull(),
  canDeactivateCustomers: boolean('can_deactivate_customers').default(false).notNull(),
  canReactivateCustomers: boolean('can_reactivate_customers').default(false).notNull(),
  canPermanentlyDeleteCustomers: boolean('can_permanently_delete_customers').default(false).notNull(),
  canViewDeletionHistory: boolean('can_view_deletion_history').default(false).notNull(),
  grantedBy: text('granted_by').default('').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const customerDeletionAuditLogs = webPlatformSchema.table('customer_deletion_audit_logs', {
  id: serial('id').primaryKey(),
  customerCode: text('customer_code').notNull(),
  customerDbId: text('customer_db_id').default('').notNull(),
  authUserId: uuid('auth_user_id'),
  hadExclusiveAuthAccount: boolean('had_exclusive_auth_account').default(false).notNull(),
  deletedAuthAccount: boolean('deleted_auth_account').default(false).notNull(),
  deletedByUserId: integer('deleted_by_user_id'),
  deletedByEmail: text('deleted_by_email').notNull(),
  deletedByRole: text('deleted_by_role').notNull(),
  reason: text('reason').default('').notNull(),
  summaryCounts: jsonb('summary_counts').$type<Record<string, number>>().default({}).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const customerAddresses = webPlatformSchema.table('customer_addresses', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  label: text('label').default('Primary').notNull(),
  addressType: text('address_type').default('both').notNull(), // billing | delivery | both
  fullName: text('full_name').notNull(),
  mobile: text('mobile').notNull(),
  houseFlat: text('house_flat').notNull(),
  streetArea: text('street_area').notNull(),
  landmark: text('landmark').default('').notNull(),
  city: text('city').notNull(),
  district: text('district').notNull(),
  state: text('state').notNull(),
  pinCode: text('pin_code').notNull(),
  country: text('country').default('India').notNull(),
  isDefault: boolean('is_default').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// 2. Editable Website CMS & Settings
export const siteSettings = webPlatformSchema.table('site_settings', {
  id: serial('id').primaryKey(),
  key: text('key').notNull().unique(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// 3. E-Commerce Catalogue, Inventory, Cart & Orders
export const productCategories = webPlatformSchema.table('product_categories', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  storeScope: text('store_scope').default('general').notNull(), // general | 3d_printed
  description: text('description').default('').notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  sortOrder: integer('sort_order').default(0).notNull(),
});

export const brands = webPlatformSchema.table('brands', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
  slug: text('slug').notNull().unique(),
  logoUrl: text('logo_url').default('').notNull(),
  description: text('description').default('').notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const mediaAssets = webPlatformSchema.table('media_assets', {
  id: serial('id').primaryKey(),
  fileName: text('file_name').notNull(),
  title: text('title').default('').notNull(),
  description: text('description').default('').notNull(),
  category: text('category').default('Company Branding').notNull(),
  thumbnailUrl: text('thumbnail_url').default('').notNull(),
  mediaKind: text('media_kind').default('image').notNull(), // image | video | document | model3d
  url: text('url').notNull(),
  mimeType: text('mime_type').default('image/jpeg').notNull(),
  sizeBytes: integer('size_bytes').default(0).notNull(),
  altText: text('alt_text').default('').notNull(),
  folder: text('folder').default('general').notNull(),
  uploadedBy: text('uploaded_by').default('').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const products = webPlatformSchema.table('products', {
  id: serial('id').primaryKey(),
  categoryId: integer('category_id').references(() => productCategories.id, {
    onDelete: 'set null',
  }),
  sku: text('sku').notNull().unique(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  brand: text('brand').default('NexusTekFusion').notNull(),
  productType: text('product_type').default('simple').notNull(), // simple | variable | customizable | made_to_order | quote_only
  modelNumber: text('model_number').default('').notNull(),
  subcategory: text('subcategory').default('').notNull(),
  shortDescription: text('short_description').default('').notNull(),
  storeScope: text('store_scope').default('general').notNull(), // general | 3d_printed
  description: text('description').default('').notNull(),
  technicalSpecs: jsonb('technical_specs').$type<Record<string, string>>().default({}).notNull(),
  features: jsonb('features').$type<string[]>().default([]).notNull(),
  priceInr: integer('price_inr').notNull(),
  discountPriceInr: integer('discount_price_inr'),
  gstPercent: integer('gst_percent').default(18).notNull(),
  stockQty: integer('stock_qty').default(0).notNull(),
  dimensions: text('dimensions').default('').notNull(),
  weightGrams: integer('weight_grams').default(0).notNull(),
  shippingWeightGrams: integer('shipping_weight_grams').default(0).notNull(),
  deliveryInfo: text('delivery_info').default('').notNull(),
  material: text('material').default('').notNull(),
  availableColors: jsonb('available_colors').$type<string[]>().default([]).notNull(),
  availableVariants: jsonb('available_variants').$type<string[]>().default([]).notNull(),
  productionTimeDays: integer('production_time_days').default(2).notNull(),
  warrantyInfo: text('warranty_info').default('').notNull(),
  imageUrl: text('image_url').default('').notNull(),
  galleryUrls: jsonb('gallery_urls').$type<string[]>().default([]).notNull(),
  datasheetUrl: text('datasheet_url').default('').notNull(),
  brochureUrl: text('brochure_url').default('').notNull(),
  model3dUrl: text('model_3d_url').default('').notNull(),
  seoTitle: text('seo_title').default('').notNull(),
  seoDescription: text('seo_description').default('').notNull(),
  status: text('status').default('published').notNull(), // published | draft | scheduled
  publishedAt: timestamp('published_at'),
  isFeatured: boolean('is_featured').default(false).notNull(),
  isPublished: boolean('is_published').default(true).notNull(),
  compatibility: text('compatibility').default('').notNull(),
  packageContents: jsonb('package_contents').$type<string[]>().default([]).notNull(),
  applications: text('applications').default('').notNull(),
  productFaqs: jsonb('product_faqs').$type<Array<{ q: string; a: string }>>().default([]).notNull(),
  tags: jsonb('tags').$type<string[]>().default([]).notNull(),
  relatedProductIds: jsonb('related_product_ids').$type<number[]>().default([]).notNull(),
  boughtTogetherIds: jsonb('bought_together_ids').$type<number[]>().default([]).notNull(),
  videoUrl: text('video_url').default('').notNull(),
  lowStockThreshold: integer('low_stock_threshold').default(5).notNull(),
  isBestseller: boolean('is_bestseller').default(false).notNull(),
  isNewArrival: boolean('is_new_arrival').default(true).notNull(),
  sortOrder: integer('sort_order').default(0).notNull(),
  hsnCode: text('hsn_code').default('8807').notNull(),
  isDeleted: boolean('is_deleted').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const wishlists = webPlatformSchema.table('wishlists', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  productId: integer('product_id')
    .references(() => products.id, { onDelete: 'cascade' })
    .notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const productReviews = webPlatformSchema.table('product_reviews', {
  id: serial('id').primaryKey(),
  productId: integer('product_id')
    .references(() => products.id, { onDelete: 'cascade' })
    .notNull(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
  authorName: text('author_name').notNull(),
  rating: integer('rating').notNull(),
  comment: text('comment').notNull(),
  verifiedPurchase: boolean('verified_purchase').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const coupons = webPlatformSchema.table('coupons', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(),
  discountType: text('discount_type').default('percent').notNull(), // percent | flat
  discountValue: integer('discount_value').notNull(),
  minOrderInr: integer('min_order_inr').default(0).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  expiresAt: timestamp('expires_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const storeOrders = webPlatformSchema.table('store_orders', {
  id: serial('id').primaryKey(),
  orderNumber: text('order_number').notNull().unique(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
  customerId: text('customer_id').default('').notNull(),
  billingAddress: jsonb('billing_address')
    .$type<{
      fullName?: string;
      mobile?: string;
      email?: string;
      line1?: string;
      line2?: string;
      city?: string;
      state?: string;
      pinCode?: string;
      country?: string;
    }>()
    .notNull(),
  shippingAddress: jsonb('shipping_address')
    .$type<{
      fullName?: string;
      mobile?: string;
      email?: string;
      line1?: string;
      line2?: string;
      city?: string;
      state?: string;
      pinCode?: string;
      country?: string;
    }>()
    .notNull(),
  items: jsonb('items')
    .$type<
      Array<{
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
      }>
    >()
    .notNull(),
  subtotalInr: integer('subtotal_inr').notNull(),
  discountInr: integer('discount_inr').default(0).notNull(),
  shippingInr: integer('shipping_inr').default(0).notNull(),
  gstInr: integer('gst_inr').default(0).notNull(),
  totalInr: integer('total_inr').notNull(),
  couponCode: text('coupon_code').default('').notNull(),
  paymentStatus: text('payment_status').default('pending').notNull(),
  paymentMethod: text('payment_method').default('Razorpay').notNull(),
  refundStatus: text('refund_status').default('none').notNull(), // none | partial | full | failed
  orderStatus: text('order_status').default('Order Placed').notNull(),
  statusHistory: jsonb('status_history')
    .$type<Array<{ status: string; timestamp: string; note?: string; actor?: string }>>()
    .default([])
    .notNull(),
  cancelledReason: text('cancelled_reason').default('').notNull(),
  cancelledAt: timestamp('cancelled_at'),
  razorpayOrderId: text('razorpay_order_id').default('').notNull(),
  razorpayPaymentId: text('razorpay_payment_id').default('').notNull(),
  trackingCourier: text('tracking_courier').default('').notNull(),
  trackingId: text('tracking_id').default('').notNull(),
  trackingUrl: text('tracking_url').default('').notNull(),
  dispatchDate: text('dispatch_date').default('').notNull(),
  expectedDeliveryDate: text('expected_delivery_date').default('').notNull(),
  internalNotes: text('internal_notes').default('').notNull(),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  archivedReason: text('archived_reason').default('').notNull(),
  archivedBy: text('archived_by').default('').notNull(),
  isDeleted: boolean('is_deleted').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// 4. Custom 3D Printing Engine & Orders
export const printingMaterials = webPlatformSchema.table('printing_materials', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  technology: text('technology').default('FDM').notNull(), // FDM | SLA
  densityGcm3: doublePrecision('density_gcm3').default(1.24).notNull(),
  ratePerGramInr: doublePrecision('rate_per_gram_inr').default(6).notNull(),
  availableColors: jsonb('available_colors')
    .$type<Array<{ name: string; hex: string }>>()
    .default([])
    .notNull(),
  layerHeightsMm: jsonb('layer_heights_mm').$type<number[]>().default([0.1, 0.15, 0.2, 0.3]).notNull(),
  description: text('description').default('').notNull(),
  isActive: boolean('is_active').default(true).notNull(),
});

export const printingMachines = webPlatformSchema.table('printing_machines', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  technology: text('technology').default('FDM').notNull(),
  buildVolumeX: integer('build_volume_x').default(256).notNull(),
  buildVolumeY: integer('build_volume_y').default(256).notNull(),
  buildVolumeZ: integer('build_volume_z').default(256).notNull(),
  hourlyRateInr: integer('hourly_rate_inr').default(120).notNull(),
  minOrderInr: integer('min_order_inr').default(250).notNull(),
  wastagePercent: integer('wastage_percent').default(8).notNull(),
  labourFeeInr: integer('labour_fee_inr').default(60).notNull(),
  finishingFeeInr: integer('finishing_fee_inr').default(120).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
});

export const printingOrders = webPlatformSchema.table('printing_orders', {
  id: serial('id').primaryKey(),
  orderNumber: text('order_number').notNull().unique(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
  customerId: text('customer_id').default('').notNull(),
  customerName: text('customer_name').default('').notNull(),
  email: text('email').default('').notNull(),
  phone: text('phone').default('').notNull(),
  fileName: text('file_name').notNull(),
  fileFormat: text('file_format').notNull(),
  fileSizeBytes: integer('file_size_bytes').notNull(),
  fileStoragePath: text('file_storage_path').notNull(),
  fileVersion: text('file_version').default('v1').notNull(),
  storageBucket: text('storage_bucket').default('').notNull(),
  boundingBoxMm: jsonb('bounding_box_mm').$type<{ x: number; y: number; z: number }>().notNull(),
  volumeCm3: doublePrecision('volume_cm3').default(0).notNull(),
  estimatedWeightG: doublePrecision('estimated_weight_g').default(0).notNull(),
  estimatedPrintMinutes: integer('estimated_print_minutes').default(0).notNull(),
  technology: text('technology').notNull(),
  printerName: text('printer_name').default('').notNull(),
  materialName: text('material_name').notNull(),
  colorName: text('color_name').notNull(),
  layerHeightMm: doublePrecision('layer_height_mm').notNull(),
  infillPercent: integer('infill_percent').notNull(),
  wallCount: integer('wall_count').default(3).notNull(),
  printSpeedMmS: integer('print_speed_mm_s').default(60).notNull(),
  nozzleDiameterMm: doublePrecision('nozzle_diameter_mm').default(0.4).notNull(),
  buildOrientation: text('build_orientation').default('Auto Optimal').notNull(),
  scalePercent: integer('scale_percent').default(100).notNull(),
  supportEnabled: boolean('support_enabled').default(true).notNull(),
  quantity: integer('quantity').default(1).notNull(),
  finishingOption: text('finishing_option').default('Standard As-Printed').notNull(),
  specialInstructions: text('special_instructions').default('').notNull(),
  customerParameters: jsonb('customer_parameters').$type<Record<string, unknown> | null>().default(null),
  confirmedParameters: jsonb('confirmed_parameters').$type<Record<string, unknown> | null>().default(null),
  pricingBreakdown: jsonb('pricing_breakdown')
    .$type<{
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
    }>()
    .notNull(),
  quotedPriceInr: integer('quoted_price_inr'),
  totalInr: integer('total_inr').notNull(),
  deliveryAddress: jsonb('delivery_address').notNull(),
  slicingStatus: text('slicing_status').default('Slicing Completed').notNull(),
  orderStatus: text('order_status').default('Pending Payment').notNull(),
  paymentStatus: text('payment_status').default('pending').notNull(),
  refundStatus: text('refund_status').default('none').notNull(), // none | partial | full | failed
  paymentVerifiedAt: timestamp('payment_verified_at'),
  customerDownloadEnabled: boolean('customer_download_enabled').default(true).notNull(),
  razorpayOrderId: text('razorpay_order_id').default('').notNull(),
  razorpayPaymentId: text('razorpay_payment_id').default('').notNull(),
  trackingCourier: text('tracking_courier').default('').notNull(),
  trackingId: text('tracking_id').default('').notNull(),
  trackingUrl: text('tracking_url').default('').notNull(),
  productionNotes: text('production_notes').default('').notNull(),
  rejectionReason: text('rejection_reason').default('').notNull(),
  rejectedBy: text('rejected_by').default('').notNull(),
  rejectedAt: timestamp('rejected_at', { withTimezone: true }),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  archivedReason: text('archived_reason').default('').notNull(),
  archivedBy: text('archived_by').default('').notNull(),
  isDeleted: boolean('is_deleted').default(false).notNull(),
  printingApprovedAt: timestamp('printing_approved_at'),
  printingApprovedBy: text('printing_approved_by').default('').notNull(),
  productionPhotos: jsonb('production_photos').$type<string[]>().default([]).notNull(),
  uploadedAt: timestamp('uploaded_at').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const printingProductionFiles = webPlatformSchema.table('3d_printing_production_files', {
  id: serial('id').primaryKey(),
  printingOrderId: integer('printing_order_id')
    .references(() => printingOrders.id, { onDelete: 'cascade' })
    .notNull(),
  fileName: text('file_name').notNull(),
  fileFormat: text('file_format').notNull(),
  fileSizeBytes: integer('file_size_bytes').default(0).notNull(),
  fileStoragePath: text('file_storage_path').notNull(),
  storageBucket: text('storage_bucket').default('').notNull(),
  fileKind: text('file_kind').default('sliced_gcode').notNull(), // sliced_gcode | converted_mesh | production_notes
  notes: text('notes').default('').notNull(),
  uploadedBy: text('uploaded_by').default('').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const printingFileDownloadLogs = webPlatformSchema.table('printing_file_download_logs', {
  id: serial('id').primaryKey(),
  printingOrderId: integer('printing_order_id')
    .references(() => printingOrders.id, { onDelete: 'cascade' })
    .notNull(),
  orderNumber: text('order_number').default('').notNull(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
  actorEmail: text('actor_email').notNull(),
  actorRole: text('actor_role').default('customer').notNull(),
  fileKind: text('file_kind').default('original').notNull(), // original | production | spec_sheet
  fileName: text('file_name').default('').notNull(),
  accessGranted: boolean('access_granted').default(false).notNull(),
  denialReason: text('denial_reason').default('').notNull(),
  ipAddress: text('ip_address').default('').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 5. Engineering Project Enquiries, Quotations & Active Projects
export const projectEnquiries = webPlatformSchema.table('project_enquiries', {
  id: serial('id').primaryKey(),
  enquiryNumber: text('enquiry_number').notNull().unique(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
  customerId: text('customer_id').default('').notNull(),
  priority: text('priority').default('Normal').notNull(),
  customerName: text('customer_name').notNull(),
  customerEmail: text('customer_email').notNull(),
  customerPhone: text('customer_phone').notNull(),
  whatsappNumber: text('whatsapp_number').default('').notNull(),
  companyOrCollege: text('company_or_college').default('').notNull(),
  city: text('city').default('').notNull(),
  state: text('state').default('').notNull(),
  customerCategory: text('customer_category').default('Student').notNull(),
  projectTitle: text('project_title').notNull(),
  engineeringBranch: text('engineering_branch').notNull(),
  engineeringDomain: text('engineering_domain').default('').notNull(),
  academicLevel: text('academic_level').default('Industrial / Commercial').notNull(),
  projectCategory: text('project_category').notNull(),
  projectType: text('project_type').notNull(),
  projectDescription: text('project_description').notNull(),
  problemStatement: text('problem_statement').default('').notNull(),
  objective: text('objective').default('').notNull(),
  expectedWorking: text('expected_working').default('').notNull(),
  requiredFeatures: text('required_features').default('').notNull(),
  expectedFunctionality: text('expected_functionality').default('').notNull(),
  requiredTechnologies: text('required_technologies').default('').notNull(),
  hardwareRequirements: text('hardware_requirements').default('').notNull(),
  softwareRequirements: text('software_requirements').default('').notNull(),
  componentsRequired: text('components_required').default('').notNull(),
  expectedOutput: text('expected_output').default('').notNull(),
  expectedDeliverables: text('expected_deliverables').default('').notNull(),
  targetCompletionDate: text('target_completion_date').default('').notNull(),
  estimatedBudget: text('estimated_budget').default('').notNull(),
  complexityLevel: text('complexity_level').default('Intermediate').notNull(),
  prototypeRequirements: text('prototype_requirements').default('').notNull(),
  preferredCommunicationMethod: text('preferred_communication_method').default('WhatsApp & Dashboard').notNull(),
  requiresPhysicalPrototype: boolean('requires_physical_prototype').default(true).notNull(),
  requiresWebOrMobileApp: boolean('requires_web_or_mobile_app').default(false).notNull(),
  requiresDocumentation: boolean('requires_documentation').default(true).notNull(),
  acceptedTerms: boolean('accepted_terms').default(true).notNull(),
  acceptedPrivacyPolicy: boolean('accepted_privacy_policy').default(true).notNull(),
  specialRequirements: text('special_requirements').default('').notNull(),
  attachments: jsonb('attachments')
    .$type<Array<{ originalName: string; storagePath: string; sizeBytes: number; category?: string }>>()
    .default([])
    .notNull(),
  billingAddress: jsonb('billing_address').notNull(),
  deliveryAddress: jsonb('delivery_address').notNull(),
  addressHistory: jsonb('address_history')
    .$type<Array<{ changedAt: string; changedBy: string; deliveryAddress: unknown }>>()
    .default([])
    .notNull(),
  status: text('status').default('Submitted – Under Review').notNull(),
  assignedEngineer: text('assigned_engineer').default('').notNull(),
  internalNotes: text('internal_notes').default('').notNull(),
  rejectionReason: text('rejection_reason').default('').notNull(),
  rejectedBy: text('rejected_by').default('').notNull(),
  rejectedAt: timestamp('rejected_at', { withTimezone: true }),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  archivedReason: text('archived_reason').default('').notNull(),
  archivedBy: text('archived_by').default('').notNull(),
  clarificationNotes: text('clarification_notes').default('').notNull(),
  courseDepartment: text('course_department').default('').notNull(),
  teamType: text('team_type').default('Individual').notNull(),
  teamCount: integer('team_count').default(1).notNull(),
  budgetMinInr: integer('budget_min_inr'),
  budgetMaxInr: integer('budget_max_inr'),
  flags: jsonb('flags').$type<Record<string, boolean | string>>().default({}).notNull(),
  isDeleted: boolean('is_deleted').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const projectQuotations = webPlatformSchema.table('project_quotations', {
  id: serial('id').primaryKey(),
  enquiryId: integer('enquiry_id')
    .references(() => projectEnquiries.id, { onDelete: 'cascade' })
    .notNull(),
  quotationNumber: text('quotation_number').default('').notNull(),
  revisionNumber: integer('revision_number').default(1).notNull(),
  items: jsonb('items')
    .$type<Array<{ name: string; description: string; qty: number; unitPriceInr: number }>>()
    .default([])
    .notNull(),
  hardwareCostInr: integer('hardware_cost_inr').default(0).notNull(),
  softwareCostInr: integer('software_cost_inr').default(0).notNull(),
  designDevChargesInr: integer('design_dev_charges_inr').default(0).notNull(),
  testingChargesInr: integer('testing_charges_inr').default(0).notNull(),
  documentationChargesInr: integer('documentation_charges_inr').default(0).notNull(),
  deliveryChargesInr: integer('delivery_charges_inr').default(0).notNull(),
  discountInr: integer('discount_inr').default(0).notNull(),
  gstInr: integer('gst_inr').default(0).notNull(),
  totalAmountInr: integer('total_amount_inr').notNull(),
  totalAmountPaise: integer('total_amount_paise').default(0).notNull(),
  advancePercent: integer('advance_percent').default(50).notNull(),
  advanceAmountInr: integer('advance_amount_inr').notNull(),
  advanceAmountPaise: integer('advance_amount_paise').default(0).notNull(),
  balanceAmountInr: integer('balance_amount_inr').notNull(),
  balanceAmountPaise: integer('balance_amount_paise').default(0).notNull(),
  costCategories: jsonb('cost_categories')
    .$type<{
      development: number;
      hardware: number;
      sensors: number;
      pcb: number;
      mechanical: number;
      printing3d: number;
      software: number;
      aiMl: number;
      iot: number;
      droneRobotics: number;
      testing: number;
      documentation: number;
      delivery: number;
      other: number;
    }>()
    .default({
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
      delivery: 0,
      other: 0,
    })
    .notNull(),
  technicalScope: text('technical_scope').default('').notNull(),
  validityDays: integer('validity_days').default(15).notNull(),
  estimatedDuration: text('estimated_duration').default('').notNull(),
  estimatedDeliveryDate: text('estimated_delivery_date').default('').notNull(),
  paymentTerms: text('payment_terms').default('50% Advance, 50% Balance before Handover').notNull(),
  paymentDueDate: text('payment_due_date').default('').notNull(),
  termsAndConditions: text('terms_and_conditions').default('').notNull(),
  allowFullPayment: boolean('allow_full_payment').default(true).notNull(),
  planOverrideReason: text('plan_override_reason').default('').notNull(),
  planOverrideBy: text('plan_override_by').default('').notNull(),
  paidAmountInr: integer('paid_amount_inr').default(0).notNull(),
  paidAmountPaise: integer('paid_amount_paise').default(0).notNull(),
  approvedByAdmin: boolean('approved_by_admin').default(false).notNull(),
  publishedAt: timestamp('published_at'),
  status: text('status').default('Draft').notNull(), // Draft | Sent | Accepted | Modification Requested | Rejected
  customerFeedback: text('customer_feedback').default('').notNull(),
  razorpayOrderId: text('razorpay_order_id').default('').notNull(),
  razorpayPaymentId: text('razorpay_payment_id').default('').notNull(),
  paymentStatus: text('payment_status').default('pending').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const projects = webPlatformSchema.table('projects', {
  id: serial('id').primaryKey(),
  projectCode: text('project_code').notNull().unique(),
  enquiryId: integer('enquiry_id')
    .references(() => projectEnquiries.id, { onDelete: 'cascade' })
    .notNull(),
  quotationId: integer('quotation_id')
    .references(() => projectQuotations.id, { onDelete: 'set null' }),
  userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
  customerId: text('customer_id').default('').notNull(),
  title: text('title').notNull(),
  category: text('category').default('').notNull(),
  description: text('description').default('').notNull(),
  budgetInr: integer('budget_inr').default(0).notNull(),
  technicalRequirements: text('technical_requirements').default('').notNull(),
  technicalNotes: text('technical_notes').default('').notNull(),
  designDocuments: jsonb('design_documents')
    .$type<Array<{ originalName: string; storagePath: string; sizeBytes: number; uploadedBy: string; uploadedAt: string; kind?: string }>>()
    .default([])
    .notNull(),
  assignedEngineer: text('assigned_engineer').default('Engineering Team').notNull(),
  status: text('status').default('Advance Payment Received').notNull(),
  progressPercent: integer('progress_percent').default(0).notNull(),
  startDate: text('start_date').default('').notNull(),
  estimatedCompletionDate: text('estimated_completion_date').default('').notNull(),
  totalAmountInr: integer('total_amount_inr').default(0).notNull(),
  paidAmountInr: integer('paid_amount_inr').default(0).notNull(),
  balanceAmountInr: integer('balance_amount_inr').default(0).notNull(),
  paymentClearanceStatus: text('payment_clearance_status').default('Pending').notNull(), // Pending | Advance Paid | Cleared | Override Authorized
  handoverUnlocked: boolean('handover_unlocked').default(false).notNull(),
  handoverMethod: text('handover_method').default('digital').notNull(), // digital | physical | hybrid
  handoverExceptionAuthorized: boolean('handover_exception_authorized').default(false).notNull(),
  handoverExceptionReason: text('handover_exception_reason').default('').notNull(),
  handoverExceptionBy: text('handover_exception_by').default('').notNull(),
  handoverExceptionAt: text('handover_exception_at').default('').notNull(),
  customerAcknowledgedAt: text('customer_acknowledged_at').default('').notNull(),
  customerAcknowledgedBy: text('customer_acknowledged_by').default('').notNull(),
  completionCertificateNumber: text('completion_certificate_number').default('').notNull(),
  completedAt: text('completed_at').default('').notNull(),
  completionProof: jsonb('completion_proof')
    .$type<Array<{ originalName: string; storagePath: string; mediaType: string }>>()
    .default([])
    .notNull(),
  milestones: jsonb('milestones')
    .$type<Array<{ id: string; title: string; dueDate: string; status: 'Pending' | 'In Progress' | 'Completed'; notes: string }>>()
    .default([])
    .notNull(),
  updates: jsonb('updates')
    .$type<
      Array<{
        id: string;
        timestamp: string;
        author: string;
        category?: string;
        title?: string;
        summary: string;
        description?: string;
        progressPercentage?: number;
        photos?: Array<{ originalName: string; storagePath: string }>;
        videos?: Array<{ originalName: string; storagePath: string }>;
        reports?: Array<{ originalName: string; storagePath: string }>;
        adminComments?: string;
      }>
    >()
    .default([])
    .notNull(),
  deliverables: jsonb('deliverables').$type<string[]>().default([]).notNull(),
  trackingCourier: text('tracking_courier').default('').notNull(),
  trackingId: text('tracking_id').default('').notNull(),
  trackingUrl: text('tracking_url').default('').notNull(),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  archivedReason: text('archived_reason').default('').notNull(),
  archivedBy: text('archived_by').default('').notNull(),
  isDeleted: boolean('is_deleted').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// 6. PCB Design & Fabrication (Single & Double Layer), Drone Repairs & B2B Bulk Enquiries
export const pcbEnquiries = webPlatformSchema.table('pcb_enquiries', {
  id: serial('id').primaryKey(),
  enquiryNumber: text('enquiry_number').notNull().unique(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
  customerId: text('customer_id').default('').notNull(),
  customerName: text('customer_name').notNull(),
  email: text('email').notNull(),
  mobile: text('mobile').notNull(),
  boardDimensionsMm: text('board_dimensions_mm').notNull(),
  boardLengthMm: doublePrecision('board_length_mm').default(0).notNull(),
  boardWidthMm: doublePrecision('board_width_mm').default(0).notNull(),
  layerCount: integer('layer_count').default(2).notNull(), // strictly 1 or 2
  boardQuantity: integer('board_quantity').default(5).notNull(),
  copperThickness: text('copper_thickness').default('1 oz (35 µm)').notNull(),
  pcbThickness: text('pcb_thickness').default('1.6 mm').notNull(),
  solderMaskColor: text('solder_mask_color').default('Green').notNull(),
  assemblyRequired: boolean('assembly_required').default(false).notNull(),
  surfaceFinish: text('surface_finish').default('HASL Lead-Free').notNull(),
  deliveryLocation: text('delivery_location').default('').notNull(),
  requiredDeliveryDate: text('required_delivery_date').default('').notNull(),
  specialInstructions: text('special_instructions').default('').notNull(),
  gerberAnalysisStatus: text('gerber_analysis_status').default('analyzed').notNull(), // analyzed | quotation_required
  gerberNotes: text('gerber_notes').default('').notNull(),
  pricingBreakdown: jsonb('pricing_breakdown')
    .$type<{
      quotationRequired: boolean;
      reason?: string;
      pcbType?: string;
      areaCm2?: number;
      manufacturingCostInr?: number;
      unitCostInr?: number;
      shippingInr?: number;
      gstInr?: number;
      totalEstimatedInr?: number;
      minOrderApplied?: boolean;
    } | null>()
    .default(null),
  attachments: jsonb('attachments')
    .$type<Array<{ originalName: string; storagePath: string; sizeBytes: number; fileRole?: string }>>()
    .default([])
    .notNull(),
  quotedAmountInr: integer('quoted_amount_inr'),
  fileApprovalStatus: text('file_approval_status').default('Pending Review').notNull(), // Pending Review | Approved | Rejected
  rejectionReason: text('rejection_reason').default('').notNull(),
  rejectedBy: text('rejected_by').default('').notNull(),
  rejectedAt: timestamp('rejected_at', { withTimezone: true }),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  archivedReason: text('archived_reason').default('').notNull(),
  archivedBy: text('archived_by').default('').notNull(),
  isDeleted: boolean('is_deleted').default(false).notNull(),
  status: text('status').default('Order received').notNull(),
  priority: text('priority').default('Normal').notNull(),
  assignedStaff: text('assigned_staff').default('').notNull(),
  razorpayOrderId: text('razorpay_order_id').default('').notNull(),
  razorpayPaymentId: text('razorpay_payment_id').default('').notNull(),
  paymentStatus: text('payment_status').default('pending').notNull(),
  trackingCourier: text('tracking_courier').default('').notNull(),
  trackingId: text('tracking_id').default('').notNull(),
  adminNotes: text('admin_notes').default('').notNull(),
  replies: jsonb('replies')
    .$type<Array<{ sender: string; role: string; message: string; attachments?: Array<{ originalName: string; storagePath: string; sizeBytes: number }>; timestamp: string }>>()
    .default([])
    .notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const droneRepairBookings = webPlatformSchema.table('drone_repair_bookings', {
  id: serial('id').primaryKey(),
  referenceNumber: text('reference_number').notNull().unique(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
  serviceMode: text('service_mode').notNull(), // field_visit | service_centre
  customerName: text('customer_name').notNull(),
  mobile: text('mobile').notNull(),
  email: text('email').default('').notNull(),
  address: text('address').default('').notNull(),
  city: text('city').default('').notNull(),
  district: text('district').default('').notNull(),
  pinCode: text('pin_code').default('').notNull(),
  droneBrandModel: text('drone_brand_model').notNull(),
  droneType: text('drone_type').default('Agriculture').notNull(),
  problemDescription: text('problem_description').notNull(),
  photos: jsonb('photos')
    .$type<Array<{ originalName: string; storagePath: string; mimeType: string; sizeBytes: number }>>()
    .default([])
    .notNull(),
  videoFile: jsonb('video_file')
    .$type<{ originalName: string; storagePath: string; mimeType: string; sizeBytes: number } | null>()
    .default(null),
  preferredDate: text('preferred_date').notNull(),
  preferredTime: text('preferred_time').notNull(),
  additionalInfo: text('additional_info').default('').notNull(),
  status: text('status').default('Booking received').notNull(),
  assignedEngineer: text('assigned_engineer').default('').notNull(),
  inspectionChargeInr: integer('inspection_charge_inr'),
  inspectionChargeConfirmed: boolean('inspection_charge_confirmed').default(false).notNull(),
  inspectionPaymentStatus: text('inspection_payment_status').default('unpaid').notNull(),
  repairQuotationInr: integer('repair_quotation_inr'),
  repairQuotationNotes: text('repair_quotation_notes').default('').notNull(),
  repairApproved: boolean('repair_approved').default(false).notNull(),
  repairPaymentStatus: text('repair_payment_status').default('unpaid').notNull(),
  razorpayOrderId: text('razorpay_order_id').default('').notNull(),
  razorpayPaymentId: text('razorpay_payment_id').default('').notNull(),
  adminNotes: text('admin_notes').default('').notNull(),
  statusHistory: jsonb('status_history')
    .$type<Array<{ status: string; timestamp: string; note: string; actor: string }>>()
    .default([])
    .notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const b2bEnquiries = webPlatformSchema.table('b2b_enquiries', {
  id: serial('id').primaryKey(),
  enquiryNumber: text('enquiry_number').notNull().unique(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
  customerId: text('customer_id').default('').notNull(),
  companyName: text('company_name').notNull(),
  contactPerson: text('contact_person').notNull(),
  email: text('email').notNull(),
  mobile: text('mobile').notNull(),
  gstin: text('gstin').default('').notNull(),
  requirementCategory: text('requirement_category').notNull(),
  quantity: integer('quantity').default(10).notNull(),
  technicalSpecs: text('technical_specs').notNull(),
  expectedDeliveryDate: text('expected_delivery_date').default('').notNull(),
  shippingLocation: text('shipping_location').notNull(),
  attachments: jsonb('attachments')
    .$type<Array<{ originalName: string; storagePath: string; sizeBytes: number }>>()
    .default([])
    .notNull(),
  quotedAmountInr: integer('quoted_amount_inr'),
  volumeDiscountPercent: integer('volume_discount_percent').default(0).notNull(),
  status: text('status').default('Submitted').notNull(),
  priority: text('priority').default('Normal').notNull(),
  assignedStaff: text('assigned_staff').default('').notNull(),
  razorpayOrderId: text('razorpay_order_id').default('').notNull(),
  paymentStatus: text('payment_status').default('pending').notNull(),
  adminNotes: text('admin_notes').default('').notNull(),
  rejectionReason: text('rejection_reason').default('').notNull(),
  rejectedBy: text('rejected_by').default('').notNull(),
  rejectedAt: timestamp('rejected_at', { withTimezone: true }),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  archivedReason: text('archived_reason').default('').notNull(),
  archivedBy: text('archived_by').default('').notNull(),
  isDeleted: boolean('is_deleted').default(false).notNull(),
  replies: jsonb('replies')
    .$type<Array<{ sender: string; role: string; message: string; attachments?: Array<{ originalName: string; storagePath: string; sizeBytes: number }>; timestamp: string }>>()
    .default([])
    .notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// 7. Payments & Invoices
export const payments = webPlatformSchema.table('payments', {
  id: serial('id').primaryKey(),
  paymentRef: text('payment_ref').notNull().unique(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
  customerId: text('customer_id').default('').notNull(),
  entityType: text('entity_type').notNull(), // store_order | printing_order | project_quotation | pcb_enquiry | b2b_enquiry | farmer_booking
  entityId: integer('entity_id').notNull(),
  projectId: integer('project_id'),
  projectCode: text('project_code').default('').notNull(),
  paymentStage: text('payment_stage').default('').notNull(), // advance | final | milestone | full | store | spraying
  paymentLinkId: text('payment_link_id').default('').notNull(),
  paymentUrl: text('payment_url').default('').notNull(),
  razorpayOrderId: text('razorpay_order_id').default('').notNull(),
  razorpayPaymentId: text('razorpay_payment_id').default('').notNull(),
  razorpaySignature: text('razorpay_signature').default('').notNull(),
  amountInr: integer('amount_inr').notNull(),
  amountPaise: integer('amount_paise').default(0).notNull(),
  currency: text('currency').default('INR').notNull(),
  mode: text('mode').default('test_mode').notNull(), // live_razorpay | test_mode
  status: text('status').default('verified').notNull(), // pending | verified | failed | refunded | partially_refunded
  errorCode: text('error_code').default('').notNull(),
  failureReason: text('failure_reason').default('').notNull(),
  refundStatus: text('refund_status').default('none').notNull(), // none | partial | full | failed
  refundedAmountInr: integer('refunded_amount_inr').default(0).notNull(),
  paymentDate: timestamp('payment_date', { withTimezone: true }),
  verifiedAt: timestamp('verified_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const invoices = webPlatformSchema.table('invoices', {
  id: serial('id').primaryKey(),
  invoiceNumber: text('invoice_number').notNull().unique(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
  customerId: text('customer_id').default('').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: integer('entity_id').notNull(),
  docType: text('doc_type').default('Proforma Invoice').notNull(), // Quotation | Proforma Invoice | Payment Receipt | Tax Invoice
  amountInr: integer('amount_inr').notNull(),
  gstInr: integer('gst_inr').default(0).notNull(),
  payload: jsonb('payload').notNull(),
  storageBucket: text('storage_bucket').default('invoices-pdf').notNull(),
  pdfStoragePath: text('pdf_storage_path').default('').notNull(),
  pdfGeneratedAt: timestamp('pdf_generated_at', { withTimezone: true }),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  archivedReason: text('archived_reason').default('').notNull(),
  archivedBy: text('archived_by').default('').notNull(),
  isDeleted: boolean('is_deleted').default(false).notNull(),
  issuedAt: timestamp('issued_at').defaultNow().notNull(),
});

// 8. Blogs, Case Studies, Support Tickets, Notifications & Audit Logs
export const blogs = webPlatformSchema.table('blogs', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  slug: text('slug').notNull().unique(),
  category: text('category').default('Engineering').notNull(),
  tags: jsonb('tags').$type<string[]>().default([]).notNull(),
  excerpt: text('excerpt').notNull(),
  content: text('content').notNull(),
  coverImageUrl: text('cover_image_url').default('').notNull(),
  seoTitle: text('seo_title').default('').notNull(),
  seoDescription: text('seo_description').default('').notNull(),
  isPublished: boolean('is_published').default(true).notNull(),
  publishedAt: timestamp('published_at').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const caseStudies = webPlatformSchema.table('case_studies', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  slug: text('slug').notNull().unique(),
  technologyUsed: text('technology_used').notNull(),
  applications: text('applications').notNull(),
  outcomes: text('outcomes').notNull(),
  relatedServices: jsonb('related_services').$type<string[]>().default([]).notNull(),
  description: text('description').notNull(),
  imageUrl: text('image_url').default('').notNull(),
  videoUrl: text('video_url').default('').notNull(),
  isPublished: boolean('is_published').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const supportTickets = webPlatformSchema.table('support_tickets', {
  id: serial('id').primaryKey(),
  ticketNumber: text('ticket_number').notNull().unique(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
  customerId: text('customer_id').default('').notNull(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  mobile: text('mobile').default('').notNull(),
  subject: text('subject').notNull(),
  serviceCategory: text('service_category').default('General').notNull(),
  category: text('category').default('General Enquiry').notNull(),
  priority: text('priority').default('Normal').notNull(),
  message: text('message').notNull(),
  attachmentPath: text('attachment_path').default('').notNull(),
  status: text('status').default('Open').notNull(), // Open | In Review | Replied | Resolved
  assignedStaff: text('assigned_staff').default('').notNull(),
  internalNotes: text('internal_notes').default('').notNull(),
  rejectionReason: text('rejection_reason').default('').notNull(),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  archivedReason: text('archived_reason').default('').notNull(),
  archivedBy: text('archived_by').default('').notNull(),
  isDeleted: boolean('is_deleted').default(false).notNull(),
  messages: jsonb('messages')
    .$type<Array<{ sender: string; role: string; text: string; attachments?: Array<{ originalName: string; storagePath: string; sizeBytes: number }>; timestamp: string }>>()
    .default([])
    .notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const notifications = webPlatformSchema.table('notifications', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  title: text('title').notNull(),
  message: text('message').notNull(),
  link: text('link').default('/my-account').notNull(),
  isRead: boolean('is_read').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const adminNotifications = webPlatformSchema.table('admin_notifications', {
  id: serial('id').primaryKey(),
  type: text('type').default('system').notNull(), // customer | order | enquiry | project | payment | system
  title: text('title').notNull(),
  message: text('message').notNull(),
  entityType: text('entity_type').default('').notNull(),
  entityId: text('entity_id').default('').notNull(),
  customerId: text('customer_id').default('').notNull(),
  link: text('link').default('/admin/dashboard').notNull(),
  isRead: boolean('is_read').default(false).notNull(),
  readBy: text('read_by').default('').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const auditLogs = webPlatformSchema.table('audit_logs', {
  id: serial('id').primaryKey(),
  actorUid: text('actor_uid').notNull(),
  actorEmail: text('actor_email').notNull(),
  action: text('action').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').default('').notNull(),
  details: jsonb('details').default({}).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 9. Inventory Movements, Newsletter & Visual Website Editor (CMS Pages & Revisions)
export const inventoryMovements = webPlatformSchema.table('inventory_movements', {
  id: serial('id').primaryKey(),
  productId: integer('product_id')
    .references(() => products.id, { onDelete: 'cascade' })
    .notNull(),
  deltaQty: integer('delta_qty').notNull(),
  previousQty: integer('previous_qty').notNull(),
  newQty: integer('new_qty').notNull(),
  reason: text('reason').default('Manual Adjustment').notNull(),
  actorEmail: text('actor_email').default('').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const newsletterSubscribers = webPlatformSchema.table('newsletter_subscribers', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  source: text('source').default('footer').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const cmsPages = webPlatformSchema.table('cms_pages', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  slug: text('slug').notNull().unique(),
  seoTitle: text('seo_title').default('').notNull(),
  seoDescription: text('seo_description').default('').notNull(),
  draftContent: jsonb('draft_content')
    .$type<{
      heroHeadline: string;
      heroSubheadline: string;
      ctaLabel: string;
      ctaLink: string;
      blocks: Array<{ id: string; heading: string; body: string; imageUrl?: string }>;
    }>()
    .notNull(),
  publishedContent: jsonb('published_content')
    .$type<{
      heroHeadline: string;
      heroSubheadline: string;
      ctaLabel: string;
      ctaLink: string;
      blocks: Array<{ id: string; heading: string; body: string; imageUrl?: string }>;
    }>(),
  status: text('status').default('draft').notNull(), // draft | published
  updatedBy: text('updated_by').default('').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const cmsRevisions = webPlatformSchema.table('cms_revisions', {
  id: serial('id').primaryKey(),
  targetKey: text('target_key').notNull(),
  label: text('label').default('Snapshot').notNull(),
  snapshot: jsonb('snapshot').notNull(),
  createdBy: text('created_by').default('').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 10. CRM Leads & Customer Follow-up Notes
export const crmLeads = webPlatformSchema.table('crm_leads', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').default('').notNull(),
  phone: text('phone').default('').notNull(),
  companyOrCollege: text('company_or_college').default('').notNull(),
  source: text('source').default('website').notNull(), // website | krashivantri | b2b | project | manual
  stage: text('stage').default('New Lead').notNull(), // New Lead | Contacted | Qualified | Quotation Sent | Negotiation | Won | Lost
  assignedTo: text('assigned_to').default('').notNull(),
  estimatedValueInr: integer('estimated_value_inr').default(0).notNull(),
  nextFollowUpDate: text('next_follow_up_date').default('').notNull(),
  summary: text('summary').default('').notNull(),
  isDeleted: boolean('is_deleted').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const crmNotes = webPlatformSchema.table('crm_notes', {
  id: serial('id').primaryKey(),
  entityType: text('entity_type').notNull(), // lead | customer | project_enquiry | order
  entityId: integer('entity_id').notNull(),
  authorEmail: text('author_email').notNull(),
  note: text('note').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 11. Project Payment Plans, Milestones, Receipts, Clearance Certificates, Handover & Email Automation (Module 1)
export const projectPaymentPlans = webPlatformSchema.table('project_payment_plans', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  enquiryId: integer('enquiry_id').references(() => projectEnquiries.id, { onDelete: 'cascade' }).notNull(),
  quotationId: integer('quotation_id').references(() => projectQuotations.id, { onDelete: 'cascade' }).notNull(),
  planType: text('plan_type').default('50_50_split').notNull(), // 50_50_split | custom_split | full_100
  advancePercent: integer('advance_percent').default(50).notNull(),
  finalPercent: integer('final_percent').default(50).notNull(),
  allowFullPayment: boolean('allow_full_payment').default(true).notNull(),
  isOverride: boolean('is_override').default(false).notNull(),
  overrideReason: text('override_reason').default('').notNull(),
  createdBy: text('created_by').default('').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const projectPaymentMilestones = webPlatformSchema.table('project_payment_milestones', {
  id: serial('id').primaryKey(),
  planId: integer('plan_id').references(() => projectPaymentPlans.id, { onDelete: 'cascade' }),
  projectId: integer('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  quotationId: integer('quotation_id').references(() => projectQuotations.id, { onDelete: 'cascade' }).notNull(),
  stageName: text('stage_name').notNull(), // Advance Payment | Final Balance Payment
  stageOrder: integer('stage_order').default(1).notNull(),
  percent: integer('percent').default(50).notNull(),
  amountInr: integer('amount_inr').notNull(),
  amountPaise: integer('amount_paise').default(0).notNull(),
  dueTrigger: text('due_trigger').default('on_acceptance').notNull(), // on_acceptance | on_completion
  status: text('status').default('pending').notNull(), // pending | paid | waived
  paymentRef: text('payment_ref').default('').notNull(),
  paidAt: timestamp('paid_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const projectAcceptances = webPlatformSchema.table('project_acceptances', {
  id: serial('id').primaryKey(),
  enquiryId: integer('enquiry_id').references(() => projectEnquiries.id, { onDelete: 'cascade' }).notNull(),
  quotationId: integer('quotation_id').references(() => projectQuotations.id, { onDelete: 'cascade' }).notNull(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
  acceptedByEmail: text('accepted_by_email').notNull(),
  notes: text('notes').default('').notNull(),
  acceptedAt: timestamp('accepted_at').defaultNow().notNull(),
});

export const paymentReceipts = webPlatformSchema.table('payment_receipts', {
  id: serial('id').primaryKey(),
  receiptNumber: text('receipt_number').notNull().unique(),
  paymentRef: text('payment_ref').notNull(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
  entityType: text('entity_type').notNull(),
  entityId: integer('entity_id').notNull(),
  paymentStage: text('payment_stage').default('').notNull(),
  amountInr: integer('amount_inr').notNull(),
  amountPaise: integer('amount_paise').default(0).notNull(),
  razorpayPaymentId: text('razorpay_payment_id').default('').notNull(),
  payload: jsonb('payload').default({}).notNull(),
  issuedAt: timestamp('issued_at').defaultNow().notNull(),
});

export const paymentClearanceCertificates = webPlatformSchema.table('payment_clearance_certificates', {
  id: serial('id').primaryKey(),
  certificateNumber: text('certificate_number').notNull().unique(),
  projectId: integer('project_id').references(() => projects.id, { onDelete: 'cascade' }).notNull(),
  enquiryId: integer('enquiry_id').references(() => projectEnquiries.id, { onDelete: 'cascade' }).notNull(),
  quotationId: integer('quotation_id').references(() => projectQuotations.id, { onDelete: 'set null' }),
  userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
  totalAmountInr: integer('total_amount_inr').notNull(),
  advancePaidInr: integer('advance_paid_inr').notNull(),
  finalPaidInr: integer('final_paid_inr').notNull(),
  balanceInr: integer('balance_inr').default(0).notNull(),
  paymentRefs: jsonb('payment_refs').$type<string[]>().default([]).notNull(),
  issuedBy: text('issued_by').default('NexusTekFusion Accounts').notNull(),
  issuedAt: timestamp('issued_at').defaultNow().notNull(),
});

export const projectWorkOrders = webPlatformSchema.table('project_work_orders', {
  id: serial('id').primaryKey(),
  workOrderNumber: text('work_order_number').notNull().unique(),
  projectId: integer('project_id').references(() => projects.id, { onDelete: 'cascade' }).notNull(),
  enquiryId: integer('enquiry_id').references(() => projectEnquiries.id, { onDelete: 'cascade' }).notNull(),
  quotationId: integer('quotation_id').references(() => projectQuotations.id, { onDelete: 'set null' }),
  userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
  assignedEngineer: text('assigned_engineer').default('').notNull(),
  estimatedCompletionDate: text('estimated_completion_date').default('').notNull(),
  scopeSummary: text('scope_summary').default('').notNull(),
  issuedAt: timestamp('issued_at').defaultNow().notNull(),
});

export const projectHandoverDocuments = webPlatformSchema.table('project_handover_documents', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').references(() => projects.id, { onDelete: 'cascade' }).notNull(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  category: text('category').default('source_code').notNull(), // source_code | circuit_pcb | documentation | report | video | software_package | other
  fileName: text('file_name').notNull(),
  storagePath: text('storage_path').notNull(),
  fileSizeBytes: integer('file_size_bytes').default(0).notNull(),
  versionLabel: text('version_label').default('v1.0').notNull(),
  notes: text('notes').default('').notNull(),
  downloadToken: text('download_token').notNull().unique(),
  tokenExpiresAt: timestamp('token_expires_at').notNull(),
  downloadCount: integer('download_count').default(0).notNull(),
  lastDownloadedAt: timestamp('last_downloaded_at'),
  uploadedBy: text('uploaded_by').default('').notNull(),
  isDeleted: boolean('is_deleted').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const projectDeliveryRecords = webPlatformSchema.table('project_delivery_records', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').references(() => projects.id, { onDelete: 'cascade' }).notNull(),
  courierName: text('courier_name').default('').notNull(),
  trackingNumber: text('tracking_number').default('').notNull(),
  trackingUrl: text('tracking_url').default('').notNull(),
  dispatchDate: text('dispatch_date').default('').notNull(),
  expectedDeliveryDate: text('expected_delivery_date').default('').notNull(),
  actualDeliveryDate: text('actual_delivery_date').default('').notNull(),
  dispatchNotes: text('dispatch_notes').default('').notNull(),
  updatedBy: text('updated_by').default('').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const projectMessages = webPlatformSchema.table('project_messages', {
  id: serial('id').primaryKey(),
  enquiryId: integer('enquiry_id')
    .references(() => projectEnquiries.id, { onDelete: 'cascade' })
    .notNull(),
  projectId: integer('project_id').references(() => projects.id, { onDelete: 'set null' }),
  userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
  senderEmail: text('sender_email').notNull(),
  senderName: text('sender_name').notNull(),
  senderRole: text('sender_role').default('customer').notNull(), // customer | admin
  message: text('message').notNull(),
  attachments: jsonb('attachments')
    .$type<Array<{ originalName: string; storagePath: string; sizeBytes: number }>>()
    .default([])
    .notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const projectEmailNotifications = webPlatformSchema.table('project_email_notifications', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
  projectId: integer('project_id').references(() => projects.id, { onDelete: 'set null' }),
  enquiryId: integer('enquiry_id').references(() => projectEnquiries.id, { onDelete: 'set null' }),
  recipientEmail: text('recipient_email').notNull(),
  eventType: text('event_type').notNull(),
  subject: text('subject').notNull(),
  bodyPreview: text('body_preview').default('').notNull(),
  provider: text('provider').default('none').notNull(),
  deliveryStatus: text('delivery_status').default('not_configured').notNull(), // sent | failed | not_configured
  providerMessageId: text('provider_message_id').default('').notNull(),
  errorMessage: text('error_message').default('').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const paymentWebhookEvents = webPlatformSchema.table('payment_webhook_events', {
  id: serial('id').primaryKey(),
  eventId: text('event_id').notNull().unique(),
  provider: text('provider').default('razorpay').notNull(),
  eventType: text('event_type').notNull(),
  razorpayOrderId: text('razorpay_order_id').default('').notNull(),
  razorpayPaymentId: text('razorpay_payment_id').default('').notNull(),
  paymentLinkId: text('payment_link_id').default('').notNull(),
  payload: jsonb('payload').default({}).notNull(),
  processingStatus: text('processing_status').default('processed').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 12. KRASHIVANTRI Farmer & Drone Pilot Approval, Live GPS Tracking, Spraying Ops, Payouts & Penalties (Module 2)
export const farmers = webPlatformSchema.table('farmers', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
  farmerCode: text('farmer_code').notNull().unique(),
  fullName: text('full_name').notNull(),
  mobile: text('mobile').notNull(),
  email: text('email').default('').notNull(),
  village: text('village').default('').notNull(),
  taluka: text('taluka').default('').notNull(),
  district: text('district').notNull(),
  state: text('state').default('Maharashtra').notNull(),
  pinCode: text('pin_code').default('').notNull(),
  aadhaarLast4: text('aadhaar_last4').default('').notNull(),
  kycStatus: text('kyc_status').default('Pending Review').notNull(), // Registered | Pending Review | Approved | Suspended | Rejected
  accountStatus: text('account_status').default('active').notNull(), // active | suspended
  totalLandAcres: doublePrecision('total_land_acres').default(0).notNull(),
  cropsGrown: text('crops_grown').default('').notNull(),
  adminNotes: text('admin_notes').default('').notNull(),
  verifiedBy: text('verified_by').default('').notNull(),
  verifiedAt: text('verified_at').default('').notNull(),
  rejectionReason: text('rejection_reason').default('').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const farmerVerifications = webPlatformSchema.table('farmer_verifications', {
  id: serial('id').primaryKey(),
  farmerId: integer('farmer_id').references(() => farmers.id, { onDelete: 'cascade' }).notNull(),
  action: text('action').notNull(), // Approved | Rejected | Suspended | Clarification Requested
  previousStatus: text('previous_status').notNull(),
  newStatus: text('new_status').notNull(),
  notes: text('notes').default('').notNull(),
  reviewedBy: text('reviewed_by').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const farmerDocuments = webPlatformSchema.table('farmer_documents', {
  id: serial('id').primaryKey(),
  farmerId: integer('farmer_id').references(() => farmers.id, { onDelete: 'cascade' }).notNull(),
  docType: text('doc_type').notNull(), // Aadhaar | Land Record 7/12 | Kisan Card | Bank Passbook
  docNumberMasked: text('doc_number_masked').default('').notNull(),
  fileName: text('file_name').notNull(),
  storagePath: text('storage_path').notNull(),
  verificationStatus: text('verification_status').default('Pending').notNull(),
  notes: text('notes').default('').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const farmerFarms = webPlatformSchema.table('farmer_farms', {
  id: serial('id').primaryKey(),
  farmerId: integer('farmer_id').references(() => farmers.id, { onDelete: 'cascade' }).notNull(),
  farmName: text('farm_name').notNull(),
  cropType: text('crop_type').default('').notNull(),
  areaAcres: doublePrecision('area_acres').default(1).notNull(),
  village: text('village').default('').notNull(),
  district: text('district').default('').notNull(),
  state: text('state').default('Maharashtra').notNull(),
  pinCode: text('pin_code').default('').notNull(),
  centerLat: doublePrecision('center_lat').notNull(),
  centerLng: doublePrecision('center_lng').notNull(),
  boundaryGeoJson: jsonb('boundary_geo_json')
    .$type<Array<{ lat: number; lng: number }>>()
    .default([])
    .notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const dronePilots = webPlatformSchema.table('drone_pilots', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
  pilotCode: text('pilot_code').notNull().unique(),
  fullName: text('full_name').notNull(),
  mobile: text('mobile').notNull(),
  email: text('email').default('').notNull(),
  city: text('city').default('').notNull(),
  district: text('district').notNull(),
  state: text('state').default('Maharashtra').notNull(),
  pinCode: text('pin_code').default('').notNull(),
  rpcNumber: text('rpc_number').default('').notNull(), // DGCA Remote Pilot Certificate Number
  rpcValidUntil: text('rpc_valid_until').default('').notNull(),
  kycStatus: text('kyc_status').default('Pending Review').notNull(), // Pending Review | Approved | Suspended | Rejected
  accountStatus: text('account_status').default('active').notNull(),
  serviceRadiusKm: integer('service_radius_km').default(35).notNull(),
  totalSprayedAcres: doublePrecision('total_sprayed_acres').default(0).notNull(),
  ratingAvg: doublePrecision('rating_avg').default(0).notNull(),
  penaltyPoints: integer('penalty_points').default(0).notNull(),
  verifiedBy: text('verified_by').default('').notNull(),
  verifiedAt: text('verified_at').default('').notNull(),
  rejectionReason: text('rejection_reason').default('').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const pilotVerifications = webPlatformSchema.table('pilot_verifications', {
  id: serial('id').primaryKey(),
  pilotId: integer('pilot_id').references(() => dronePilots.id, { onDelete: 'cascade' }).notNull(),
  action: text('action').notNull(),
  previousStatus: text('previous_status').notNull(),
  newStatus: text('new_status').notNull(),
  notes: text('notes').default('').notNull(),
  reviewedBy: text('reviewed_by').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const pilotDocuments = webPlatformSchema.table('pilot_documents', {
  id: serial('id').primaryKey(),
  pilotId: integer('pilot_id').references(() => dronePilots.id, { onDelete: 'cascade' }).notNull(),
  docType: text('doc_type').notNull(), // DGCA RPC | Drone UIN | Aadhaar | PAN | Insurance
  docNumberMasked: text('doc_number_masked').default('').notNull(),
  fileName: text('file_name').notNull(),
  storagePath: text('storage_path').notNull(),
  verificationStatus: text('verification_status').default('Pending').notNull(),
  notes: text('notes').default('').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const pilotBankAccounts = webPlatformSchema.table('pilot_bank_accounts', {
  id: serial('id').primaryKey(),
  pilotId: integer('pilot_id').references(() => dronePilots.id, { onDelete: 'cascade' }).notNull(),
  accountHolderName: text('account_holder_name').notNull(),
  bankName: text('bank_name').notNull(),
  accountNumberMasked: text('account_number_masked').notNull(),
  accountNumberEnc: text('account_number_enc').default('').notNull(),
  ifscCode: text('ifsc_code').notNull(),
  upiId: text('upi_id').default('').notNull(),
  verificationStatus: text('verification_status').default('Pending').notNull(), // Pending | Verified | Rejected
  isPrimary: boolean('is_primary').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const pilotDrones = webPlatformSchema.table('pilot_drones', {
  id: serial('id').primaryKey(),
  pilotId: integer('pilot_id').references(() => dronePilots.id, { onDelete: 'cascade' }).notNull(),
  droneModel: text('drone_model').notNull(), // e.g. KRASHIVANTRI X, KRASHIVANTRI X PRO
  uinNumber: text('uin_number').notNull(),
  tankCapacityLiters: doublePrecision('tank_capacity_liters').default(10).notNull(),
  sprayWidthMeters: doublePrecision('spray_width_meters').default(4).notNull(),
  verificationStatus: text('verification_status').default('Pending').notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const pilotAvailability = webPlatformSchema.table('pilot_availability', {
  id: serial('id').primaryKey(),
  pilotId: integer('pilot_id').references(() => dronePilots.id, { onDelete: 'cascade' }).notNull().unique(),
  isOnline: boolean('is_online').default(false).notNull(),
  gpsPermissionGranted: boolean('gps_permission_granted').default(false).notNull(),
  currentLat: doublePrecision('current_lat'),
  currentLng: doublePrecision('current_lng'),
  accuracyMeters: doublePrecision('accuracy_meters'),
  speedMps: doublePrecision('speed_mps'),
  headingDeg: doublePrecision('heading_deg'),
  batteryPercent: integer('battery_percent'),
  lastLocationAt: timestamp('last_location_at'),
  status: text('status').default('offline').notNull(), // offline | available | assigned | en_route | arrived | spraying
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const pilotLocationUpdates = webPlatformSchema.table('pilot_location_updates', {
  id: serial('id').primaryKey(),
  pilotId: integer('pilot_id').references(() => dronePilots.id, { onDelete: 'cascade' }).notNull(),
  bookingId: integer('booking_id'),
  sessionId: integer('session_id'),
  latitude: doublePrecision('latitude').notNull(),
  longitude: doublePrecision('longitude').notNull(),
  accuracyMeters: doublePrecision('accuracy_meters'),
  speedMps: doublePrecision('speed_mps'),
  headingDeg: doublePrecision('heading_deg'),
  source: text('source').default('device_gps').notNull(), // device_gps | android_app | browser_gps
  recordedAt: timestamp('recorded_at').defaultNow().notNull(),
});

export const serviceBookings = webPlatformSchema.table('service_bookings', {
  id: serial('id').primaryKey(),
  bookingNumber: text('booking_number').notNull().unique(),
  farmerId: integer('farmer_id').references(() => farmers.id, { onDelete: 'cascade' }).notNull(),
  farmId: integer('farm_id').references(() => farmerFarms.id, { onDelete: 'set null' }),
  assignedPilotId: integer('assigned_pilot_id').references(() => dronePilots.id, { onDelete: 'set null' }),
  cropType: text('crop_type').notNull(),
  sprayType: text('spray_type').default('Fertilizer & Pesticide Spraying').notNull(),
  chemicalProvidedBy: text('chemical_provided_by').default('Farmer').notNull(),
  bookedAreaAcres: doublePrecision('booked_area_acres').notNull(),
  ratePerAcreInr: integer('rate_per_acre_inr').notNull(),
  totalAmountInr: integer('total_amount_inr').notNull(),
  totalAmountPaise: integer('total_amount_paise').default(0).notNull(),
  platformCommissionPercent: integer('platform_commission_percent').default(15).notNull(),
  pilotPayoutInr: integer('pilot_payout_inr').default(0).notNull(),
  preferredDate: text('preferred_date').notNull(),
  preferredSlot: text('preferred_slot').default('Morning (6 AM - 10 AM)').notNull(),
  farmLat: doublePrecision('farm_lat').notNull(),
  farmLng: doublePrecision('farm_lng').notNull(),
  farmBoundary: jsonb('farm_boundary').$type<Array<{ lat: number; lng: number }>>().default([]).notNull(),
  bookingStatus: text('booking_status').default('Booking Requested').notNull(),
  // Booking Requested | Payment Pending | Paid - Awaiting Pilot | Pilot Assigned | Pilot Accepted | En Route | Arrived at Farm | Spraying Active | Spraying Paused | Spraying Completed | Verification Pending | Verified & Settled | Disputed | Cancelled | Refunded
  paymentStatus: text('payment_status').default('pending').notNull(),
  farmerNotes: text('farmer_notes').default('').notNull(),
  adminNotes: text('admin_notes').default('').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const bookingAssignments = webPlatformSchema.table('booking_assignments', {
  id: serial('id').primaryKey(),
  bookingId: integer('booking_id').references(() => serviceBookings.id, { onDelete: 'cascade' }).notNull(),
  pilotId: integer('pilot_id').references(() => dronePilots.id, { onDelete: 'cascade' }).notNull(),
  assignedBy: text('assigned_by').notNull(),
  assignmentStatus: text('assignment_status').default('Offered').notNull(), // Offered | Accepted | Rejected | Reassigned
  rejectionReason: text('rejection_reason').default('').notNull(),
  assignedAt: timestamp('assigned_at').defaultNow().notNull(),
  respondedAt: timestamp('responded_at'),
});

export const bookingStatusHistory = webPlatformSchema.table('booking_status_history', {
  id: serial('id').primaryKey(),
  bookingId: integer('booking_id').references(() => serviceBookings.id, { onDelete: 'cascade' }).notNull(),
  status: text('status').notNull(),
  actorEmail: text('actor_email').default('').notNull(),
  note: text('note').default('').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const operationSessions = webPlatformSchema.table('operation_sessions', {
  id: serial('id').primaryKey(),
  sessionCode: text('session_code').notNull().unique(),
  bookingId: integer('booking_id').references(() => serviceBookings.id, { onDelete: 'cascade' }).notNull(),
  pilotId: integer('pilot_id').references(() => dronePilots.id, { onDelete: 'cascade' }).notNull(),
  farmerId: integer('farmer_id').references(() => farmers.id, { onDelete: 'cascade' }).notNull(),
  farmId: integer('farm_id').references(() => farmerFarms.id, { onDelete: 'set null' }),
  status: text('status').default('Ready').notNull(), // Ready | Active | Paused | Completed | Disputed
  startedAt: timestamp('started_at'),
  pausedAt: timestamp('paused_at'),
  resumedAt: timestamp('resumed_at'),
  completedAt: timestamp('completed_at'),
  insideGeofenceOnStart: boolean('inside_geofence_on_start').default(false).notNull(),
  geofenceDistanceMeters: doublePrecision('geofence_distance_meters').default(0).notNull(),
  completedAreaAcres: doublePrecision('completed_area_acres').default(0).notNull(),
  pauseReason: text('pause_reason').default('').notNull(),
  pilotNotes: text('pilot_notes').default('').notNull(),
  farmerConfirmed: boolean('farmer_confirmed').default(false).notNull(),
  farmerDisputeReason: text('farmer_dispute_reason').default('').notNull(),
  farmerConfirmedAt: timestamp('farmer_confirmed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const operationEvidence = webPlatformSchema.table('operation_evidence', {
  id: serial('id').primaryKey(),
  sessionId: integer('session_id').references(() => operationSessions.id, { onDelete: 'cascade' }).notNull(),
  bookingId: integer('booking_id').references(() => serviceBookings.id, { onDelete: 'cascade' }).notNull(),
  pilotId: integer('pilot_id').references(() => dronePilots.id, { onDelete: 'cascade' }).notNull(),
  evidencePhase: text('evidence_phase').default('pre_spray').notNull(), // pre_spray | in_progress | post_spray
  mediaType: text('media_type').default('image').notNull(), // image | video
  fileName: text('file_name').notNull(),
  storagePath: text('storage_path').notNull(),
  latitude: doublePrecision('latitude'),
  longitude: doublePrecision('longitude'),
  caption: text('caption').default('').notNull(),
  capturedAt: timestamp('captured_at').defaultNow().notNull(),
});

export const operationVerifications = webPlatformSchema.table('operation_verifications', {
  id: serial('id').primaryKey(),
  bookingId: integer('booking_id').references(() => serviceBookings.id, { onDelete: 'cascade' }).notNull(),
  sessionId: integer('session_id').references(() => operationSessions.id, { onDelete: 'cascade' }).notNull(),
  verificationStatus: text('verification_status').default('Pending').notNull(), // Pending | Approved | Rejected | Adjusted
  verifiedAreaAcres: doublePrecision('verified_area_acres').default(0).notNull(),
  disputeNotes: text('dispute_notes').default('').notNull(),
  verifiedBy: text('verified_by').default('').notNull(),
  verifiedAt: timestamp('verified_at'),
});

export const farmerPayments = webPlatformSchema.table('farmer_payments', {
  id: serial('id').primaryKey(),
  paymentRef: text('payment_ref').notNull().unique(),
  bookingId: integer('booking_id').references(() => serviceBookings.id, { onDelete: 'cascade' }).notNull(),
  farmerId: integer('farmer_id').references(() => farmers.id, { onDelete: 'cascade' }).notNull(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
  amountInr: integer('amount_inr').notNull(),
  amountPaise: integer('amount_paise').default(0).notNull(),
  razorpayOrderId: text('razorpay_order_id').default('').notNull(),
  razorpayPaymentId: text('razorpay_payment_id').default('').notNull(),
  razorpaySignature: text('razorpay_signature').default('').notNull(),
  mode: text('mode').default('test_mode').notNull(),
  status: text('status').default('verified').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const farmerRefunds = webPlatformSchema.table('farmer_refunds', {
  id: serial('id').primaryKey(),
  refundRef: text('refund_ref').notNull().unique(),
  bookingId: integer('booking_id').references(() => serviceBookings.id, { onDelete: 'cascade' }).notNull(),
  farmerPaymentId: integer('farmer_payment_id').references(() => farmerPayments.id, { onDelete: 'set null' }),
  amountInr: integer('amount_inr').notNull(),
  reason: text('reason').notNull(),
  status: text('status').default('Pending').notNull(), // Pending | Processed | Failed
  processedBy: text('processed_by').default('').notNull(),
  providerRefundId: text('provider_refund_id').default('').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const pilotEarningLedger = webPlatformSchema.table('pilot_earning_ledger', {
  id: serial('id').primaryKey(),
  ledgerRef: text('ledger_ref').notNull().unique(),
  pilotId: integer('pilot_id').references(() => dronePilots.id, { onDelete: 'cascade' }).notNull(),
  bookingId: integer('booking_id').references(() => serviceBookings.id, { onDelete: 'set null' }),
  entryType: text('entry_type').default('spraying_earning').notNull(), // spraying_earning | penalty_deduction | bonus_adjustment | payout_debit
  grossAmountInr: integer('gross_amount_inr').default(0).notNull(),
  commissionInr: integer('commission_inr').default(0).notNull(),
  penaltyDeductionInr: integer('penalty_deduction_inr').default(0).notNull(),
  netAmountInr: integer('net_amount_inr').notNull(),
  status: text('status').default('accrued').notNull(), // accrued | ready_for_payout | paid_out | held
  notes: text('notes').default('').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const pilotPayouts = webPlatformSchema.table('pilot_payouts', {
  id: serial('id').primaryKey(),
  payoutRef: text('payout_ref').notNull().unique(),
  pilotId: integer('pilot_id').references(() => dronePilots.id, { onDelete: 'cascade' }).notNull(),
  amountInr: integer('amount_inr').notNull(),
  amountPaise: integer('amount_paise').default(0).notNull(),
  bankAccountMasked: text('bank_account_masked').default('').notNull(),
  payoutProvider: text('payout_provider').default('manual_bank_reference').notNull(), // razorpayx | bank_transfer | manual_bank_reference
  providerPayoutId: text('provider_payout_id').default('').notNull(),
  status: text('status').default('Pending Approval').notNull(), // Pending Approval | Processing | Settled | Failed
  failureReason: text('failure_reason').default('').notNull(),
  approvedBy: text('approved_by').default('').notNull(),
  processedAt: timestamp('processed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const penalties = webPlatformSchema.table('penalties', {
  id: serial('id').primaryKey(),
  penaltyNumber: text('penalty_number').notNull().unique(),
  targetType: text('target_type').default('pilot').notNull(), // pilot | farmer
  targetId: integer('target_id').notNull(),
  bookingId: integer('booking_id').references(() => serviceBookings.id, { onDelete: 'set null' }),
  reasonCategory: text('reason_category').notNull(), // Late Arrival | No-Show | Incomplete Spray | Geofence Violation | False Reporting | Cancellation
  description: text('description').notNull(),
  evidenceSummary: text('evidence_summary').default('').notNull(),
  amountInr: integer('amount_inr').default(0).notNull(),
  status: text('status').default('Active').notNull(), // Active | Waived | Deducted | Under Appeal
  appealStatus: text('appeal_status').default('None').notNull(), // None | Pending | Approved | Rejected
  imposedBy: text('imposed_by').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const penaltyAppeals = webPlatformSchema.table('penalty_appeals', {
  id: serial('id').primaryKey(),
  penaltyId: integer('penalty_id').references(() => penalties.id, { onDelete: 'cascade' }).notNull(),
  appellantUserId: integer('appellant_user_id').references(() => users.id, { onDelete: 'set null' }),
  explanation: text('explanation').notNull(),
  attachmentPath: text('attachment_path').default('').notNull(),
  decision: text('decision').default('Pending').notNull(), // Pending | Waived | Upheld
  decisionNotes: text('decision_notes').default('').notNull(),
  reviewedBy: text('reviewed_by').default('').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  reviewedAt: timestamp('reviewed_at'),
});

// 13. Logged-in Customer Persistent Cart & Razorpay Refund Ledger
export const customerCarts = webPlatformSchema.table('customer_carts', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull()
    .unique(),
  items: jsonb('items')
    .$type<
      Array<{
        productId: number;
        slug: string;
        sku: string;
        name: string;
        imageUrl: string;
        unitPriceInr: number;
        gstPercent: number;
        qty: number;
        variant?: string;
        color?: string;
        stockQty: number;
      }>
    >()
    .default([])
    .notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const paymentRefunds = webPlatformSchema.table('payment_refunds', {
  id: serial('id').primaryKey(),
  refundRef: text('refund_ref').notNull().unique(),
  paymentId: integer('payment_id').references(() => payments.id, { onDelete: 'set null' }),
  entityType: text('entity_type').default('store_order').notNull(),
  entityId: integer('entity_id').default(0).notNull(),
  razorpayPaymentId: text('razorpay_payment_id').notNull(),
  razorpayRefundId: text('razorpay_refund_id').default('').notNull(),
  amountInr: integer('amount_inr').notNull(),
  amountPaise: integer('amount_paise').notNull(),
  reason: text('reason').default('').notNull(),
  status: text('status').default('pending').notNull(), // pending | processed | failed
  initiatedBy: text('initiated_by').default('').notNull(),
  notes: jsonb('notes').default({}).notNull(),
  processedAt: timestamp('processed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 14. Structured Team Profiles & Website Promotional Banners
export const teamMembers = webPlatformSchema.table('team_members', {
  id: serial('id').primaryKey(),
  slugKey: text('slug_key').notNull().unique(),
  fullName: text('full_name').notNull(),
  designation: text('designation').notNull(),
  department: text('department').default('Engineering & Innovation').notNull(),
  professionalCategory: text('professional_category').default('Engineering & Innovation').notNull(),
  profilePhotoUrl: text('profile_photo_url').default('').notNull(),
  photoAlt: text('photo_alt').default('').notNull(),
  shortBiography: text('short_biography').default('').notNull(),
  detailedBiography: text('detailed_biography').default('').notNull(),
  qualifications: text('qualifications').default('').notNull(),
  experience: text('experience').default('').notNull(),
  responsibilities: text('responsibilities').default('').notNull(),
  skills: jsonb('skills').$type<string[]>().default([]).notNull(),
  linkedinUrl: text('linkedin_url').default('').notNull(),
  displayOrder: integer('display_order').default(1).notNull(),
  status: text('status').default('published').notNull(), // published | draft
  isFeatured: boolean('is_featured').default(false).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  updatedBy: text('updated_by').default('').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const websiteBanners = webPlatformSchema.table('website_banners', {
  id: serial('id').primaryKey(),
  bannerKey: text('banner_key').notNull().unique(),
  title: text('title').notNull(),
  subtitle: text('subtitle').default('').notNull(),
  placement: text('placement').default('homepage_promo').notNull(),
  imageUrl: text('image_url').default('').notNull(),
  videoUrl: text('video_url').default('').notNull(),
  ctaLabel: text('cta_label').default('Explore').notNull(),
  ctaLink: text('cta_link').default('/krashivantri').notNull(),
  sortOrder: integer('sort_order').default(1).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  status: text('status').default('published').notNull(),
  updatedBy: text('updated_by').default('').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// 15. Agricultural Drone & Hardware Product Enquiries (KRASHIVANTRI & Flagship Storefront)
export const productEnquiries = webPlatformSchema.table('product_enquiries', {
  id: serial('id').primaryKey(),
  enquiryNumber: text('enquiry_number').notNull().unique(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
  customerId: text('customer_id').default('').notNull(),
  fullName: text('full_name').notNull(),
  mobile: text('mobile').notNull(),
  email: text('email').notNull(),
  state: text('state').default('').notNull(),
  district: text('district').default('').notNull(),
  organizationOrFarmName: text('organization_or_farm_name').default('').notNull(),
  interestedProduct: text('interested_product').notNull(),
  productSlug: text('product_slug').default('').notNull(),
  category: text('category').default('Product Enquiry').notNull(),
  priority: text('priority').default('Normal').notNull(),
  subject: text('subject').default('').notNull(),
  quantity: integer('quantity').default(1).notNull(),
  intendedApplication: text('intended_application').default('').notNull(),
  message: text('message').default('').notNull(),
  attachments: jsonb('attachments')
    .$type<Array<{ originalName: string; storagePath: string; sizeBytes: number }>>()
    .default([])
    .notNull(),
  status: text('status').default('New').notNull(), // New | Under Review | Contacted | Quotation Sent | In Discussion | Approved | Rejected | Closed
  assignedStaff: text('assigned_staff').default('').notNull(),
  internalNotes: text('internal_notes').default('').notNull(),
  rejectionReason: text('rejection_reason').default('').notNull(),
  rejectedBy: text('rejected_by').default('').notNull(),
  rejectedAt: timestamp('rejected_at', { withTimezone: true }),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  archivedReason: text('archived_reason').default('').notNull(),
  archivedBy: text('archived_by').default('').notNull(),
  isDeleted: boolean('is_deleted').default(false).notNull(),
  replies: jsonb('replies')
    .$type<Array<{ sender: string; role: string; message: string; attachments?: Array<{ originalName: string; storagePath: string; sizeBytes: number }>; timestamp: string }>>()
    .default([])
    .notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// 16. Non-Destructive Record Status & Archive History (Data Protection)
export const recordStatusHistory = webPlatformSchema.table('record_status_history', {
  id: serial('id').primaryKey(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').default('').notNull(),
  entityCode: text('entity_code').default('').notNull(),
  customerId: text('customer_id').default('').notNull(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
  previousStatus: text('previous_status').default('').notNull(),
  newStatus: text('new_status').default('').notNull(),
  actionType: text('action_type').default('status_change').notNull(), // status_change | rejection | archive | restore
  reason: text('reason').default('').notNull(),
  adminId: text('admin_id').default('').notNull(),
  adminEmail: text('admin_email').default('').notNull(),
  originalRecord: jsonb('original_record').$type<Record<string, unknown>>().default({}).notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}).notNull(),
  actionDate: timestamp('action_date', { withTimezone: true }).defaultNow().notNull(),
});

// 17. Project Agreements (Metadata + Private Supabase Storage PDFs)
export const projectAgreements = webPlatformSchema.table('project_agreements', {
  id: serial('id').primaryKey(),
  agreementNumber: text('agreement_number').notNull().unique(),
  projectId: integer('project_id').references(() => projects.id, { onDelete: 'set null' }),
  enquiryId: integer('enquiry_id').references(() => projectEnquiries.id, { onDelete: 'set null' }),
  projectCode: text('project_code').default('').notNull(),
  enquiryNumber: text('enquiry_number').default('').notNull(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
  customerId: text('customer_id').default('').notNull(),
  title: text('title').notNull(),
  versionLabel: text('version_label').default('v1.0').notNull(),
  status: text('status').default('Awaiting Acceptance').notNull(), // Draft | Generated | Awaiting Acceptance | Accepted | Archived
  storageBucket: text('storage_bucket').default('project-agreements').notNull(),
  storagePath: text('storage_path').default('').notNull(),
  fileName: text('file_name').default('').notNull(),
  fileSizeBytes: integer('file_size_bytes').default(0).notNull(),
  mimeType: text('mime_type').default('application/pdf').notNull(),
  signedPdfBucket: text('signed_pdf_bucket').default('project-agreements').notNull(),
  signedPdfPath: text('signed_pdf_path').default('').notNull(),
  signedFileName: text('signed_file_name').default('').notNull(),
  uploadedBy: text('uploaded_by').default('').notNull(),
  signedByCustomer: text('signed_by_customer').default('').notNull(),
  signedAt: timestamp('signed_at', { withTimezone: true }),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  acceptedByName: text('accepted_by_name').default('').notNull(),
  acceptedByEmail: text('accepted_by_email').default('').notNull(),
  acceptanceIp: text('acceptance_ip').default('').notNull(),
  acceptanceUserAgent: text('acceptance_user_agent').default('').notNull(),
  acceptanceRecord: jsonb('acceptance_record').$type<Record<string, unknown>>().default({}).notNull(),
  agreementData: jsonb('agreement_data').$type<Record<string, unknown>>().default({}).notNull(),
  generatedAt: timestamp('generated_at', { withTimezone: true }),
  awaitingAcceptanceAt: timestamp('awaiting_acceptance_at', { withTimezone: true }),
  companyStampAssetId: integer('company_stamp_asset_id'),
  companySignatureAssetId: integer('company_signature_asset_id'),
  notes: text('notes').default('').notNull(),
  isDeleted: boolean('is_deleted').default(false).notNull(),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  archivedReason: text('archived_reason').default('').notNull(),
  archivedBy: text('archived_by').default('').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// 18. Company Signatures & Stamps (Supabase Storage Assets)
export const companySigningAssets = webPlatformSchema.table('company_signing_assets', {
  id: serial('id').primaryKey(),
  assetType: text('asset_type').notNull(), // signature | stamp | logo
  label: text('label').notNull(),
  signatoryName: text('signatory_name').default('').notNull(),
  designation: text('designation').default('').notNull(),
  storageBucket: text('storage_bucket').default('company-assets').notNull(),
  storagePath: text('storage_path').notNull(),
  fileName: text('file_name').notNull(),
  mimeType: text('mime_type').default('image/png').notNull(),
  fileSizeBytes: integer('file_size_bytes').default(0).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  uploadedBy: text('uploaded_by').default('').notNull(),
  isDeleted: boolean('is_deleted').default(false).notNull(),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  archivedReason: text('archived_reason').default('').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// 19. Razorpay Payment Links (Cloud Generation + Webhook Verification)
export const razorpayPaymentLinks = webPlatformSchema.table('razorpay_payment_links', {
  id: serial('id').primaryKey(),
  paymentLinkId: text('payment_link_id').notNull().unique(),
  shortUrl: text('short_url').notNull(),
  referenceId: text('reference_id').default('').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: integer('entity_id').notNull(),
  projectId: integer('project_id').references(() => projects.id, { onDelete: 'set null' }),
  projectCode: text('project_code').default('').notNull(),
  customerId: text('customer_id').default('').notNull(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
  customerName: text('customer_name').default('').notNull(),
  customerEmail: text('customer_email').default('').notNull(),
  customerPhone: text('customer_phone').default('').notNull(),
  amountInr: integer('amount_inr').notNull(),
  amountPaise: integer('amount_paise').notNull(),
  currency: text('currency').default('INR').notNull(),
  paymentStage: text('payment_stage').default('advance').notNull(),
  description: text('description').default('').notNull(),
  status: text('status').default('created').notNull(), // created | partially_paid | paid | cancelled | expired
  razorpayPaymentId: text('razorpay_payment_id').default('').notNull(),
  paymentDate: timestamp('payment_date', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdBy: text('created_by').default('').notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// 20. Project Development Services Upgrade: Payments, Two-50% Installments, Reminders, Agreement Settings, Attachments & Transactions
export const projectPayments = webPlatformSchema.table('project_payments', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id')
    .references(() => projects.id, { onDelete: 'cascade' })
    .notNull()
    .unique(),
  enquiryId: integer('enquiry_id').references(() => projectEnquiries.id, { onDelete: 'set null' }),
  quotationId: integer('quotation_id').references(() => projectQuotations.id, { onDelete: 'set null' }),
  userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
  customerId: text('customer_id').default('').notNull(),
  projectCode: text('project_code').default('').notNull(),
  totalAmountInr: integer('total_amount_inr').default(0).notNull(),
  paidAmountInr: integer('paid_amount_inr').default(0).notNull(),
  pendingAmountInr: integer('pending_amount_inr').default(0).notNull(),
  status: text('status').default('Pending').notNull(), // Pending | Partially Paid | Paid | Failed
  currency: text('currency').default('INR').notNull(),
  createdBy: text('created_by').default('').notNull(),
  notes: text('notes').default('').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const paymentInstallments = webPlatformSchema.table('payment_installments', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id')
    .references(() => projects.id, { onDelete: 'cascade' })
    .notNull(),
  projectPaymentId: integer('project_payment_id').references(() => projectPayments.id, { onDelete: 'cascade' }),
  installmentNumber: integer('installment_number').notNull(), // 1 | 2
  title: text('title').notNull(), // First Installment (50% Advance) | Second Installment (50% Milestone)
  milestoneName: text('milestone_name').default('').notNull(),
  percentage: integer('percentage').default(50).notNull(),
  amountInr: integer('amount_inr').default(0).notNull(),
  paidAmountInr: integer('paid_amount_inr').default(0).notNull(),
  status: text('status').default('Pending').notNull(), // Pending | Partially Paid | Paid | Failed
  dueDate: text('due_date').default('').notNull(),
  dueTrigger: text('due_trigger').default('before_commencement').notNull(), // before_commencement | second_milestone
  razorpayPaymentLinkId: text('razorpay_payment_link_id').default('').notNull(),
  paymentLinkUrl: text('payment_link_url').default('').notNull(),
  razorpayOrderId: text('razorpay_order_id').default('').notNull(),
  razorpayPaymentId: text('razorpay_payment_id').default('').notNull(),
  paymentMethod: text('payment_method').default('').notNull(),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  lastReminderAt: timestamp('last_reminder_at', { withTimezone: true }),
  reminderCount: integer('reminder_count').default(0).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const paymentReminders = webPlatformSchema.table('payment_reminders', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id')
    .references(() => projects.id, { onDelete: 'cascade' })
    .notNull(),
  installmentId: integer('installment_id').references(() => paymentInstallments.id, { onDelete: 'cascade' }),
  userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
  recipientEmail: text('recipient_email').notNull(),
  installmentNumber: integer('installment_number').default(1).notNull(),
  amountInr: integer('amount_inr').default(0).notNull(),
  reminderType: text('reminder_type').default('automatic').notNull(), // automatic | manual
  channel: text('channel').default('email').notNull(), // email | notification
  deliveryStatus: text('delivery_status').default('sent').notNull(),
  errorMessage: text('error_message').default('').notNull(),
  sentBy: text('sent_by').default('system').notNull(),
  sentAt: timestamp('sent_at', { withTimezone: true }).defaultNow().notNull(),
});

export const agreementSettings = webPlatformSchema.table('agreement_settings', {
  id: serial('id').primaryKey(),
  companyName: text('company_name').default('NEXUSTEKFUSION PRIVATE LIMITED').notNull(),
  companyLogoUrl: text('company_logo_url').default('/assets/aistudio/image_1a5ac752.png').notNull(),
  companyAddress: text('company_address').default('Amravati, Maharashtra, India').notNull(),
  contactEmail: text('contact_email').default('support@nexustekfusion.com').notNull(),
  contactPhone: text('contact_phone').default('+91-9876543210').notNull(),
  gstin: text('gstin').default('').notNull(),
  cin: text('cin').default('').notNull(),
  defaultScopeTemplate: text('default_scope_template')
    .default('Design, engineering, firmware/software development, hardware integration, testing, and documentation as specified in the approved project scope.')
    .notNull(),
  defaultTimelineText: text('default_timeline_text')
    .default('4–6 weeks from confirmation of First Installment (50% Advance Payment).')
    .notNull(),
  advancePaymentTerms: text('advance_payment_terms')
    .default('50% of the total project cost must be paid before project commencement. Project remains in Awaiting Advance Payment status until cleared.')
    .notNull(),
  secondPaymentTerms: text('second_payment_terms')
    .default('Remaining 50% of the total project cost is payable at the agreed second payment milestone / prior to final handover.')
    .notNull(),
  termsAndConditions: text('terms_and_conditions')
    .default('1. Work starts strictly after 50% advance clearance and customer agreement acceptance.\n2. Scope modifications after approval may adjust cost and delivery timelines.\n3. Source files and intellectual deliverables transfer upon full payment clearance.')
    .notNull(),
  cancellationRefundPolicy: text('cancellation_refund_policy')
    .default('Advance payment covers procured components and allocated engineering hours; cancellation after procurement/commencement is non-refundable for completed effort and BOM costs.')
    .notNull(),
  signatoryName: text('signatory_name').default('Authorized Signatory').notNull(),
  signatoryDesignation: text('signatory_designation').default('Director / Engineering Lead').notNull(),
  stampAssetId: integer('stamp_asset_id'),
  signatureAssetId: integer('signature_asset_id'),
  updatedBy: text('updated_by').default('').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const projectAttachments = webPlatformSchema.table('project_attachments', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  enquiryId: integer('enquiry_id').references(() => projectEnquiries.id, { onDelete: 'cascade' }),
  userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
  customerId: text('customer_id').default('').notNull(),
  fileName: text('file_name').notNull(),
  mimeType: text('mime_type').default('application/octet-stream').notNull(),
  fileSizeBytes: integer('file_size_bytes').default(0).notNull(),
  storageBucket: text('storage_bucket').default('project-attachments').notNull(),
  storagePath: text('storage_path').notNull(),
  category: text('category').default('supporting_document').notNull(),
  uploadedBy: text('uploaded_by').default('').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const paymentTransactions = webPlatformSchema.table('payment_transactions', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id')
    .references(() => projects.id, { onDelete: 'cascade' })
    .notNull(),
  projectPaymentId: integer('project_payment_id').references(() => projectPayments.id, { onDelete: 'cascade' }),
  installmentId: integer('installment_id').references(() => paymentInstallments.id, { onDelete: 'set null' }),
  installmentNumber: integer('installment_number').default(1).notNull(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
  customerId: text('customer_id').default('').notNull(),
  amountInr: integer('amount_inr').notNull(),
  paymentMethod: text('payment_method').default('razorpay_checkout').notNull(), // razorpay_checkout | razorpay_payment_link | bank_transfer | upi | cash | manual
  transactionRef: text('transaction_ref').notNull(),
  razorpayOrderId: text('razorpay_order_id').default('').notNull(),
  razorpayPaymentId: text('razorpay_payment_id').default('').notNull(),
  razorpaySignature: text('razorpay_signature').default('').notNull(),
  paymentLinkId: text('payment_link_id').default('').notNull(),
  status: text('status').default('Paid').notNull(), // Pending | Paid | Failed | Refunded
  failureReason: text('failure_reason').default('').notNull(),
  recordedBy: text('recorded_by').default('').notNull(),
  notes: text('notes').default('').notNull(),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

