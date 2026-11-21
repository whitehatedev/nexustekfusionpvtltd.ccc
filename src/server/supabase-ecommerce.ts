import { getServerSupabaseClient, getServiceRoleSupabaseClient } from '../lib/supabase-admin.ts';

function getWriteClient() {
  return getServiceRoleSupabaseClient() || getServerSupabaseClient();
}

export async function syncCategoryToSupabase(cat: {
  name: string;
  slug: string;
  storeScope?: string;
  description?: string;
  isActive?: boolean;
  sortOrder?: number;
}) {
  const client = getWriteClient();
  if (!client) return;
  try {
    await client.from('ecommerce_categories').upsert(
      {
        name: cat.name,
        slug: cat.slug,
        store_scope: cat.storeScope || 'general',
        description: cat.description || '',
        is_active: cat.isActive ?? true,
        sort_order: cat.sortOrder ?? 0,
      },
      { onConflict: 'slug' }
    );
  } catch {
    // Non-blocking sync when Supabase schema is not yet applied
  }
}

export async function syncProductToSupabase(prod: {
  sku: string;
  name: string;
  slug: string;
  categorySlug?: string | null;
  brand?: string;
  productType?: string;
  modelNumber?: string;
  shortDescription?: string;
  description?: string;
  technicalSpecs?: Record<string, string>;
  features?: string[];
  applications?: string;
  priceInr: number;
  discountPriceInr?: number | null;
  gstPercent?: number;
  stockQty?: number;
  lowStockThreshold?: number;
  warrantyInfo?: string;
  deliveryInfo?: string;
  imageUrl?: string;
  galleryUrls?: string[];
  availableColors?: string[];
  availableVariants?: string[];
  isFeatured?: boolean;
  isBestseller?: boolean;
  isNewArrival?: boolean;
  isPublished?: boolean;
  isDeleted?: boolean;
  sortOrder?: number;
}) {
  const client = getWriteClient();
  if (!client) return;
  try {
    await client.from('ecommerce_products').upsert(
      {
        sku: prod.sku,
        name: prod.name,
        slug: prod.slug,
        category_slug: prod.categorySlug || null,
        brand: prod.brand || 'NexusTekFusion',
        product_type: prod.productType || 'simple',
        model_number: prod.modelNumber || '',
        short_description: prod.shortDescription || '',
        description: prod.description || '',
        technical_specs: prod.technicalSpecs || {},
        features: prod.features || [],
        applications: prod.applications || '',
        price_inr: prod.priceInr,
        discount_price_inr: prod.discountPriceInr ?? null,
        gst_percent: prod.gstPercent ?? 18,
        stock_qty: prod.stockQty ?? 0,
        low_stock_threshold: prod.lowStockThreshold ?? 5,
        warranty_info: prod.warrantyInfo || '',
        delivery_info: prod.deliveryInfo || '',
        image_url: prod.imageUrl || '',
        gallery_urls: prod.galleryUrls || [],
        available_colors: prod.availableColors || [],
        available_variants: prod.availableVariants || [],
        is_featured: Boolean(prod.isFeatured),
        is_bestseller: Boolean(prod.isBestseller),
        is_new_arrival: Boolean(prod.isNewArrival),
        is_published: prod.isPublished ?? true,
        is_deleted: Boolean(prod.isDeleted),
        sort_order: prod.sortOrder ?? 0,
      },
      { onConflict: 'sku' }
    );
  } catch {
    // Non-blocking sync
  }
}

export async function syncCustomerProfileToSupabase(user: {
  uid: string;
  email: string;
  fullName: string;
  mobile: string;
  companyOrCollege?: string;
  role?: string;
  emailVerified?: boolean;
  phoneVerified?: boolean;
  emailConfirmedAt?: string;
  phoneConfirmedAt?: string;
}) {
  const client = getWriteClient();
  if (user.role && user.role !== 'customer') return;
  if (!client || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user.uid)) {
    return;
  }
  try {
    const { error } = await client.from('customer_profiles').upsert(
      {
        id: user.uid,
        email: user.email,
        full_name: user.fullName || '',
        phone: user.mobile || '',
        company_or_college: user.companyOrCollege || '',
        role: user.role || 'customer',
        email_verified: Boolean(user.emailVerified),
        phone_verified: Boolean(user.phoneVerified),
        email_confirmed_at: user.emailConfirmedAt || null,
        phone_confirmed_at: user.phoneConfirmedAt || null,
      },
      { onConflict: 'id' }
    );
    if (error && /column .* does not exist|schema cache/i.test(error.message || '')) {
      await client.from('customer_profiles').upsert(
        {
          id: user.uid,
          email: user.email,
          full_name: user.fullName || '',
          role: user.role || 'customer',
        },
        { onConflict: 'id' }
      );
    }
  } catch {
    // Non-blocking sync
  }
}

export async function syncCartToSupabase(
  userUid: string,
  items: Array<{
    productId?: number;
    sku?: string;
    name?: string;
    unitPriceInr?: number;
    qty?: number;
    variant?: string;
    color?: string;
  }>,
  customerCode?: string
) {
  const client = getWriteClient();
  if (!client || !userUid) return;
  try {
    const nowIso = new Date().toISOString();
    await client.from('customer_carts').upsert(
      {
        user_uid: userUid,
        items,
        updated_at: nowIso,
      },
      { onConflict: 'user_uid' }
    );

    const { data: cartRow } = await client
      .from('customer_carts')
      .select('id')
      .eq('user_uid', userUid)
      .maybeSingle();

    if (cartRow?.id) {
      await client.from('customer_cart_items').delete().eq('cart_id', cartRow.id);
      if (items.length > 0) {
        await client.from('customer_cart_items').insert(
          items.map((it) => ({
            cart_id: cartRow.id,
            user_uid: userUid,
            customer_id: customerCode || (userUid.startsWith('NTF-CUST-') ? userUid : ''),
            product_id: Number(it.productId || 0),
            product_sku: String(it.sku || ''),
            product_name: String(it.name || ''),
            variant: String(it.variant || ''),
            color: String(it.color || ''),
            quantity: Math.max(1, Number(it.qty || 1)),
            unit_price_inr: Number(it.unitPriceInr || 0),
            updated_at: nowIso,
          }))
        );
      }
    }
  } catch {
    // Non-blocking sync
  }
}

export async function syncStoreOrderToSupabase(order: {
  orderNumber: string;
  userUid: string;
  customerEmail?: string;
  billingAddress: unknown;
  shippingAddress: unknown;
  items: unknown;
  subtotalInr: number;
  discountInr: number;
  shippingInr: number;
  gstInr: number;
  totalInr: number;
  couponCode?: string;
  paymentStatus: string;
  refundStatus?: string;
  orderStatus: string;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  trackingCourier?: string;
  trackingId?: string;
  trackingUrl?: string;
  dispatchDate?: string;
  expectedDeliveryDate?: string;
  statusHistory?: unknown[];
}) {
  const client = getWriteClient();
  if (!client) return;
  try {
    await client.from('store_orders').upsert(
      {
        order_number: order.orderNumber,
        user_uid: order.userUid,
        customer_email: order.customerEmail || '',
        billing_address: order.billingAddress || {},
        shipping_address: order.shippingAddress || {},
        items: order.items || [],
        subtotal_inr: order.subtotalInr,
        discount_inr: order.discountInr,
        shipping_inr: order.shippingInr,
        gst_inr: order.gstInr,
        total_inr: order.totalInr,
        coupon_code: order.couponCode || '',
        payment_status: order.paymentStatus,
        refund_status: order.refundStatus || 'none',
        order_status: order.orderStatus,
        razorpay_order_id: order.razorpayOrderId || '',
        razorpay_payment_id: order.razorpayPaymentId || '',
        tracking_courier: order.trackingCourier || '',
        tracking_id: order.trackingId || '',
        tracking_url: order.trackingUrl || '',
      },
      { onConflict: 'order_number' }
    );

    const itemsArr = Array.isArray(order.items) ? (order.items as Array<Record<string, any>>) : [];
    if (itemsArr.length > 0) {
      await client.from('order_items').delete().eq('order_number', order.orderNumber);
      await client.from('order_items').insert(
        itemsArr.map((it) => ({
          order_number: order.orderNumber,
          user_uid: order.userUid,
          product_id: Number(it.productId || 0),
          product_sku: String(it.sku || ''),
          hsn_code: String(it.hsnCode || ''),
          product_name: String(it.name || ''),
          image_url: String(it.imageUrl || ''),
          variant: String(it.variant || ''),
          color: String(it.color || ''),
          quantity: Math.max(1, Number(it.qty || 1)),
          unit_price_inr: Number(it.unitPriceInr || 0),
          gst_percent: Number(it.gstPercent ?? 18),
          line_total_inr: Number(it.lineTotalInr || 0),
        }))
      );
    }

    await client.from('order_tracking').upsert(
      {
        order_number: order.orderNumber,
        user_uid: order.userUid,
        current_status: order.orderStatus,
        tracking_courier: order.trackingCourier || '',
        tracking_number: order.trackingId || '',
        tracking_url: order.trackingUrl || '',
        dispatch_date: order.dispatchDate || '',
        estimated_delivery: order.expectedDeliveryDate || '',
        status_history: order.statusHistory || [],
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'order_number' }
    );
  } catch {
    // Non-blocking sync
  }
}

export async function syncPaymentToSupabase(payment: {
  paymentRef: string;
  userUid?: string;
  entityType: string;
  entityRef?: string;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  amountInr: number;
  amountPaise: number;
  mode?: string;
  status: string;
  errorCode?: string;
  failureReason?: string;
  refundStatus?: string;
  refundedAmountInr?: number;
  verifiedAt?: Date | null;
}) {
  const client = getWriteClient();
  if (!client) return;
  try {
    await client.from('razorpay_payments').upsert(
      {
        payment_ref: payment.paymentRef,
        user_uid: payment.userUid || '',
        entity_type: payment.entityType,
        entity_ref: payment.entityRef || '',
        razorpay_order_id: payment.razorpayOrderId || '',
        razorpay_payment_id: payment.razorpayPaymentId || null,
        amount_inr: payment.amountInr,
        amount_paise: payment.amountPaise,
        mode: payment.mode || 'test_mode',
        status: payment.status,
        error_code: payment.errorCode || '',
        failure_reason: payment.failureReason || '',
        refund_status: payment.refundStatus || 'none',
        refunded_amount_inr: payment.refundedAmountInr || 0,
        verified_at: payment.verifiedAt ? payment.verifiedAt.toISOString() : null,
      },
      { onConflict: 'payment_ref' }
    );
  } catch {
    // Non-blocking sync
  }
}

export async function syncRefundToSupabase(refund: {
  refundRef: string;
  razorpayPaymentId: string;
  razorpayRefundId?: string;
  amountInr: number;
  amountPaise: number;
  reason?: string;
  status: string;
  initiatedBy?: string;
  processedAt?: Date | null;
}) {
  const client = getWriteClient();
  if (!client) return;
  try {
    await client.from('payment_refunds').upsert(
      {
        refund_ref: refund.refundRef,
        razorpay_payment_id: refund.razorpayPaymentId,
        razorpay_refund_id: refund.razorpayRefundId || null,
        amount_inr: refund.amountInr,
        amount_paise: refund.amountPaise,
        reason: refund.reason || '',
        status: refund.status,
        initiated_by: refund.initiatedBy || '',
        processed_at: refund.processedAt ? refund.processedAt.toISOString() : null,
      },
      { onConflict: 'refund_ref' }
    );
  } catch {
    // Non-blocking sync
  }
}

export async function syncEnquiryToSupabase(enquiry: {
  ticketNumber: string;
  userUid?: string;
  name: string;
  email: string;
  mobile?: string;
  category: string;
  subject: string;
  message: string;
  status: string;
  staffReply?: string;
}) {
  const client = getWriteClient();
  if (!client) return;
  try {
    await client.from('contact_enquiries').upsert(
      {
        ticket_number: enquiry.ticketNumber,
        user_uid: enquiry.userUid || '',
        name: enquiry.name,
        email: enquiry.email,
        mobile: enquiry.mobile || '',
        category: enquiry.category,
        subject: enquiry.subject,
        message: enquiry.message,
        status: enquiry.status,
        staff_reply: enquiry.staffReply || '',
      },
      { onConflict: 'ticket_number' }
    );
  } catch {
    // Non-blocking sync
  }
}

export async function syncProductEnquiryToSupabase(enquiry: {
  enquiryNumber: string;
  userUid?: string;
  fullName: string;
  mobile: string;
  email: string;
  state?: string;
  district?: string;
  organizationOrFarmName?: string;
  interestedProduct: string;
  productSlug?: string;
  quantity?: number;
  intendedApplication?: string;
  message?: string;
  status?: string;
  assignedStaff?: string;
  internalNotes?: string;
}) {
  const client = getWriteClient();
  if (!client) return;
  try {
    await client.from('product_enquiries').upsert(
      {
        enquiry_number: enquiry.enquiryNumber,
        user_uid: enquiry.userUid || '',
        full_name: enquiry.fullName,
        mobile: enquiry.mobile,
        email: enquiry.email,
        state: enquiry.state || '',
        district: enquiry.district || '',
        organization_or_farm_name: enquiry.organizationOrFarmName || '',
        interested_product: enquiry.interestedProduct,
        product_slug: enquiry.productSlug || '',
        quantity: enquiry.quantity ?? 1,
        intended_application: enquiry.intendedApplication || '',
        message: enquiry.message || '',
        status: enquiry.status || 'New',
        assigned_staff: enquiry.assignedStaff || '',
        internal_notes: enquiry.internalNotes || '',
      },
      { onConflict: 'enquiry_number' }
    );
  } catch {
    // Non-blocking sync
  }
}

export async function syncPrintingOrderToSupabase(order: {
  orderNumber: string;
  customerId?: string;
  customerName?: string;
  email?: string;
  phone?: string;
  fileName: string;
  fileFormat: string;
  fileSizeBytes: number;
  fileStoragePath: string;
  storageBucket?: string;
  technology: string;
  materialName: string;
  colorName: string;
  quotedPriceInr?: number | null;
  totalInr: number;
  paymentStatus: string;
  refundStatus?: string;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  orderStatus: string;
  rejectionReason?: string;
  updatedAt?: Date | string;
}) {
  const client = getWriteClient();
  if (!client) return;
  try {
    const payload = {
      order_number: order.orderNumber,
      customer_id: order.customerId || '',
      customer_name: order.customerName || '',
      email: order.email || '',
      phone: order.phone || '',
      file_name: order.fileName,
      file_format: order.fileFormat,
      file_size: order.fileSizeBytes,
      file_size_bytes: order.fileSizeBytes,
      file_path: order.fileStoragePath,
      file_storage_path: order.fileStoragePath,
      storage_bucket: order.storageBucket || 'printing-files',
      technology: order.technology,
      material_name: order.materialName,
      color_name: order.colorName,
      quoted_price: order.quotedPriceInr ?? order.totalInr,
      total_inr: order.totalInr,
      payment_status: order.paymentStatus,
      refund_status: order.refundStatus || 'none',
      payment_id: order.razorpayPaymentId || '',
      razorpay_order_id: order.razorpayOrderId || '',
      razorpay_payment_id: order.razorpayPaymentId || '',
      order_status: order.orderStatus,
      printing_status: order.orderStatus,
      rejection_reason: order.rejectionReason || '',
      updated_at: new Date().toISOString(),
    };
    const { error } = await client
      .from('printing_orders')
      .upsert(payload, { onConflict: 'order_number' });
    if (error && /column .* does not exist|schema cache/i.test(error.message || '')) {
      await client
        .from('printing_orders')
        .upsert(
          {
            order_number: order.orderNumber,
            file_name: order.fileName,
            file_format: order.fileFormat,
            file_size_bytes: order.fileSizeBytes,
            file_storage_path: order.fileStoragePath,
            storage_bucket: order.storageBucket || 'printing-files',
            total_inr: order.totalInr,
            payment_status: order.paymentStatus,
            refund_status: order.refundStatus || 'none',
            razorpay_order_id: order.razorpayOrderId || '',
            razorpay_payment_id: order.razorpayPaymentId || '',
            order_status: order.orderStatus,
          },
          { onConflict: 'order_number' }
        );
    }

    await client.from('printing_3d_files').upsert(
      {
        order_number: order.orderNumber,
        user_uid: order.customerId || '',
        customer_id: order.customerId || '',
        file_name: order.fileName,
        file_format: order.fileFormat,
        file_size_bytes: order.fileSizeBytes,
        storage_bucket: order.storageBucket || 'printing-files',
        storage_path: order.fileStoragePath,
        file_kind: 'original',
      },
      { onConflict: 'order_number,storage_path' }
    );
  } catch {
    // Non-blocking sync
  }
}

export async function archivePrintingOrderInSupabase(orderNumber: string, reason: string, archivedBy: string) {
  const client = getWriteClient();
  if (!client || !orderNumber) return;
  try {
    await client
      .from('printing_orders')
      .update({
        is_deleted: true,
        archived_at: new Date().toISOString(),
        archived_reason: reason || 'Archived by admin',
        archived_by: archivedBy || 'admin',
      })
      .eq('order_number', orderNumber);
  } catch {
    // Non-blocking archive sync
  }
}

export async function syncCustomerAddressToSupabase(address: {
  sourceAddressId: number;
  userUid: string;
  customerId?: string;
  label?: string;
  addressType?: string;
  fullName: string;
  mobile: string;
  houseFlat: string;
  streetArea: string;
  landmark?: string;
  city: string;
  district?: string;
  state: string;
  pinCode: string;
  country?: string;
  isDefault?: boolean;
}) {
  const client = getWriteClient();
  if (!client || !address.userUid) return;
  try {
    if (address.isDefault) {
      await client
        .from('customer_addresses')
        .update({ is_default: false, updated_at: new Date().toISOString() })
        .eq('user_uid', address.userUid);
    }
    await client.from('customer_addresses').upsert(
      {
        source_address_id: address.sourceAddressId,
        user_uid: address.userUid,
        customer_id: address.customerId || '',
        label: address.label || 'Delivery',
        address_type: address.addressType || 'both',
        full_name: address.fullName,
        mobile: address.mobile,
        house_flat: address.houseFlat,
        street_area: address.streetArea,
        landmark: address.landmark || '',
        city: address.city,
        district: address.district || '',
        state: address.state,
        pin_code: address.pinCode,
        country: address.country || 'India',
        is_default: Boolean(address.isDefault),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'source_address_id' }
    );
  } catch {
    // Non-blocking sync
  }
}

export async function deleteCustomerAddressFromSupabase(sourceAddressId: number) {
  const client = getWriteClient();
  if (!client || !sourceAddressId) return;
  try {
    await client.from('customer_addresses').delete().eq('source_address_id', sourceAddressId);
  } catch {
    // Non-blocking sync
  }
}

export async function syncWishlistToSupabase(opts: {
  userUid: string;
  productId: number;
  productSlug?: string;
  wishlisted: boolean;
}) {
  const client = getWriteClient();
  if (!client || !opts.userUid) return;
  try {
    if (opts.wishlisted) {
      await client.from('wishlists').upsert(
        {
          user_uid: opts.userUid,
          product_id: opts.productId,
          product_slug: opts.productSlug || '',
        },
        { onConflict: 'user_uid,product_id' }
      );
    } else {
      await client
        .from('wishlists')
        .delete()
        .eq('user_uid', opts.userUid)
        .eq('product_id', opts.productId);
    }
  } catch {
    // Non-blocking sync
  }
}

export async function syncProductReviewToSupabase(review: {
  productId: number;
  userUid: string;
  authorName: string;
  rating: number;
  comment: string;
  verifiedPurchase?: boolean;
}) {
  const client = getWriteClient();
  if (!client || !review.userUid) return;
  try {
    await client.from('product_reviews').insert({
      product_id: review.productId,
      user_uid: review.userUid,
      author_name: review.authorName,
      rating: review.rating,
      comment: review.comment,
      verified_purchase: review.verifiedPurchase ?? true,
    });
  } catch {
    // Non-blocking sync
  }
}

export async function syncInvoiceToSupabase(inv: {
  invoiceNumber: string;
  userUid: string;
  customerId?: string;
  entityType: string;
  entityId: number;
  docType: string;
  amountInr: number;
  gstInr?: number;
  payload?: Record<string, unknown>;
  storageBucket?: string;
  pdfStoragePath?: string;
  pdfGeneratedAt?: Date | string | null;
}) {
  const client = getWriteClient();
  if (!client || !inv.invoiceNumber) return;
  try {
    await client.from('invoices').upsert(
      {
        invoice_number: inv.invoiceNumber,
        user_uid: inv.userUid,
        customer_id: inv.customerId || '',
        entity_type: inv.entityType,
        entity_id: inv.entityId,
        doc_type: inv.docType,
        amount_inr: inv.amountInr,
        gst_inr: inv.gstInr ?? 0,
        payload: inv.payload || {},
        storage_bucket: inv.storageBucket || 'invoices-pdf',
        pdf_storage_path: inv.pdfStoragePath || '',
        pdf_generated_at: inv.pdfGeneratedAt ? new Date(inv.pdfGeneratedAt).toISOString() : null,
      },
      { onConflict: 'invoice_number' }
    );
  } catch {
    // Non-blocking sync
  }
}

export async function syncNotificationToSupabase(notif: {
  userUid: string;
  title: string;
  message: string;
  link?: string;
  isRead?: boolean;
}) {
  const client = getWriteClient();
  if (!client || !notif.userUid) return;
  try {
    await client.from('notifications').insert({
      user_uid: notif.userUid,
      title: notif.title,
      message: notif.message,
      link: notif.link || '/my-account',
      is_read: Boolean(notif.isRead),
    });
  } catch {
    // Non-blocking sync
  }
}

export async function syncPcbEnquiryToSupabase(pcb: {
  enquiryNumber: string;
  userUid: string;
  customerId?: string;
  customerName: string;
  email: string;
  mobile: string;
  boardDimensionsMm: string;
  layerCount: number;
  boardQuantity: number;
  assemblyRequired: boolean;
  surfaceFinish?: string;
  specialInstructions?: string;
  attachments?: Array<{ originalName: string; storagePath: string; sizeBytes: number }>;
  quotedAmountInr?: number | null;
  paymentStatus?: string;
  status: string;
}) {
  const client = getWriteClient();
  if (!client || !pcb.enquiryNumber) return;
  try {
    await client.from('pcb_enquiries').upsert(
      {
        enquiry_number: pcb.enquiryNumber,
        user_uid: pcb.userUid,
        customer_id: pcb.customerId || '',
        customer_name: pcb.customerName,
        email: pcb.email,
        mobile: pcb.mobile,
        board_dimensions_mm: pcb.boardDimensionsMm,
        layer_count: pcb.layerCount,
        board_quantity: pcb.boardQuantity,
        assembly_required: pcb.assemblyRequired,
        surface_finish: pcb.surfaceFinish || 'HASL Lead-Free',
        special_instructions: pcb.specialInstructions || '',
        attachments: pcb.attachments || [],
        quoted_amount_inr: pcb.quotedAmountInr ?? null,
        payment_status: pcb.paymentStatus || 'pending',
        status: pcb.status,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'enquiry_number' }
    );

    if (pcb.attachments && pcb.attachments.length > 0) {
      await client.from('pcb_files').delete().eq('enquiry_number', pcb.enquiryNumber);
      await client.from('pcb_files').insert(
        pcb.attachments.map((att) => ({
          enquiry_number: pcb.enquiryNumber,
          user_uid: pcb.userUid,
          file_name: att.originalName,
          file_kind: /\.csv$|\.xlsx$/i.test(att.originalName) ? 'bom' : 'gerber',
          file_size_bytes: att.sizeBytes,
          storage_path: att.storagePath,
        }))
      );
    }
  } catch {
    // Non-blocking sync
  }
}

export async function syncB2bEnquiryToSupabase(b2b: {
  enquiryNumber: string;
  userUid: string;
  customerId?: string;
  companyName: string;
  contactPerson: string;
  email: string;
  mobile: string;
  gstin?: string;
  requirementCategory: string;
  quantity: number;
  technicalSpecs: string;
  expectedDeliveryDate?: string;
  shippingLocation: string;
  attachments?: Array<{ originalName: string; storagePath: string; sizeBytes: number }>;
  quotedAmountInr?: number | null;
  paymentStatus?: string;
  status: string;
}) {
  const client = getWriteClient();
  if (!client || !b2b.enquiryNumber) return;
  try {
    await client.from('b2b_enquiries').upsert(
      {
        enquiry_number: b2b.enquiryNumber,
        user_uid: b2b.userUid,
        customer_id: b2b.customerId || '',
        company_name: b2b.companyName,
        contact_person: b2b.contactPerson,
        email: b2b.email,
        mobile: b2b.mobile,
        gstin: b2b.gstin || '',
        requirement_category: b2b.requirementCategory,
        quantity: b2b.quantity,
        technical_specs: b2b.technicalSpecs,
        expected_delivery_date: b2b.expectedDeliveryDate || '',
        shipping_location: b2b.shippingLocation,
        attachments: b2b.attachments || [],
        quoted_amount_inr: b2b.quotedAmountInr ?? null,
        payment_status: b2b.paymentStatus || 'pending',
        status: b2b.status,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'enquiry_number' }
    );
  } catch {
    // Non-blocking sync
  }
}

export async function syncSupportTicketToSupabase(ticket: {
  ticketNumber: string;
  userUid: string;
  customerId?: string;
  subject: string;
  serviceCategory: string;
  status: string;
  messages: Array<{ sender: string; role: string; text: string; timestamp: string }>;
}) {
  const client = getWriteClient();
  if (!client || !ticket.ticketNumber) return;
  try {
    await client.from('support_tickets').upsert(
      {
        ticket_number: ticket.ticketNumber,
        user_uid: ticket.userUid,
        customer_id: ticket.customerId || '',
        subject: ticket.subject,
        service_category: ticket.serviceCategory,
        status: ticket.status,
        messages: ticket.messages || [],
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'ticket_number' }
    );

    if (ticket.messages && ticket.messages.length > 0) {
      await client.from('support_messages').delete().eq('ticket_number', ticket.ticketNumber);
      await client.from('support_messages').insert(
        ticket.messages.map((m) => ({
          ticket_number: ticket.ticketNumber,
          user_uid: ticket.userUid,
          sender_name: m.sender,
          sender_role: m.role,
          message_text: m.text,
          created_at: m.timestamp || new Date().toISOString(),
        }))
      );
    }
  } catch {
    // Non-blocking sync
  }
}

export async function syncActivityLogToSupabase(entry: {
  userUid: string;
  customerId?: string;
  action: string;
  entityType?: string;
  entityId?: string;
  details?: Record<string, unknown>;
}) {
  const client = getWriteClient();
  if (!client || !entry.userUid) return;
  try {
    await client.from('customer_activity_logs').insert({
      user_uid: entry.userUid,
      customer_id: entry.customerId || '',
      action: entry.action,
      entity_type: entry.entityType || '',
      entity_id: entry.entityId || '',
      details: entry.details || {},
    });
  } catch {
    // Non-blocking sync
  }
}

export async function syncRecordStatusHistoryToSupabase(entry: {
  sourceId: number;
  entityType: string;
  entityId: string;
  entityCode?: string;
  customerId?: string;
  userUid?: string;
  previousStatus: string;
  newStatus: string;
  actionType: string;
  reason?: string;
  adminId?: string;
  adminEmail?: string;
  originalRecord?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}) {
  const client = getWriteClient();
  if (!client) return;
  try {
    await client.from('record_status_history').upsert(
      {
        source_id: entry.sourceId,
        entity_type: entry.entityType,
        entity_id: entry.entityId,
        entity_code: entry.entityCode || '',
        customer_id: entry.customerId || '',
        user_uid: entry.userUid || '',
        previous_status: entry.previousStatus,
        new_status: entry.newStatus,
        action_type: entry.actionType,
        reason: entry.reason || '',
        admin_id: entry.adminId || '',
        admin_email: entry.adminEmail || '',
        original_record: entry.originalRecord || {},
        metadata: entry.metadata || {},
        action_date: new Date().toISOString(),
      },
      { onConflict: 'source_id' }
    );
  } catch {
    // Non-blocking sync
  }
}

export async function syncProjectAgreementToSupabase(ag: {
  sourceId: number;
  agreementNumber: string;
  projectCode?: string;
  enquiryNumber?: string;
  userUid?: string;
  customerId?: string;
  title: string;
  versionLabel?: string;
  status: string;
  storageBucket?: string;
  storagePath?: string;
  fileName?: string;
  fileSizeBytes?: number;
  signedPdfBucket?: string;
  signedPdfPath?: string;
  signedFileName?: string;
  uploadedBy?: string;
  signedByCustomer?: string;
  signedAt?: Date | string | null;
  acceptedAt?: Date | string | null;
  acceptedByName?: string;
  acceptedByEmail?: string;
  acceptanceIp?: string;
  notes?: string;
  isDeleted?: boolean;
  archivedReason?: string;
  archivedBy?: string;
}) {
  const client = getWriteClient();
  if (!client || !ag.agreementNumber) return;
  try {
    await client.from('project_agreements').upsert(
      {
        source_id: ag.sourceId,
        agreement_number: ag.agreementNumber,
        project_code: ag.projectCode || '',
        enquiry_number: ag.enquiryNumber || '',
        user_uid: ag.userUid || '',
        customer_id: ag.customerId || '',
        title: ag.title,
        version_label: ag.versionLabel || 'v1.0',
        status: ag.status,
        storage_bucket: ag.storageBucket || 'project-agreements',
        storage_path: ag.storagePath || '',
        file_name: ag.fileName || '',
        file_size_bytes: ag.fileSizeBytes || 0,
        signed_pdf_bucket: ag.signedPdfBucket || 'project-agreements',
        signed_pdf_path: ag.signedPdfPath || '',
        signed_file_name: ag.signedFileName || '',
        uploaded_by: ag.uploadedBy || '',
        signed_by_customer: ag.signedByCustomer || ag.acceptedByName || '',
        signed_at: ag.signedAt ? new Date(ag.signedAt).toISOString() : null,
        accepted_at: ag.acceptedAt ? new Date(ag.acceptedAt).toISOString() : null,
        accepted_by_name: ag.acceptedByName || '',
        accepted_by_email: ag.acceptedByEmail || '',
        acceptance_ip: ag.acceptanceIp || '',
        notes: ag.notes || '',
        is_deleted: Boolean(ag.isDeleted),
        archived_reason: ag.archivedReason || '',
        archived_by: ag.archivedBy || '',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'agreement_number' }
    );
  } catch {
    // Non-blocking sync
  }
}

export async function syncCompanySigningAssetToSupabase(asset: {
  sourceId: number;
  assetType: string;
  label: string;
  signatoryName?: string;
  designation?: string;
  storageBucket?: string;
  storagePath: string;
  fileName: string;
  mimeType?: string;
  fileSizeBytes?: number;
  isActive: boolean;
  uploadedBy?: string;
  isDeleted?: boolean;
}) {
  const client = getWriteClient();
  if (!client) return;
  try {
    await client.from('company_signing_assets').upsert(
      {
        source_id: asset.sourceId,
        asset_type: asset.assetType,
        label: asset.label,
        signatory_name: asset.signatoryName || '',
        designation: asset.designation || '',
        storage_bucket: asset.storageBucket || 'signatures-stamps',
        storage_path: asset.storagePath,
        file_name: asset.fileName,
        mime_type: asset.mimeType || 'image/png',
        file_size_bytes: asset.fileSizeBytes || 0,
        is_active: Boolean(asset.isActive),
        uploaded_by: asset.uploadedBy || '',
        is_deleted: Boolean(asset.isDeleted),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'source_id' }
    );
  } catch {
    // Non-blocking sync
  }
}

export async function syncRazorpayPaymentLinkToSupabase(link: {
  sourceId: number;
  paymentLinkId: string;
  shortUrl: string;
  referenceId?: string;
  entityType: string;
  entityId: number;
  projectCode?: string;
  customerId?: string;
  userUid?: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  amountInr: number;
  amountPaise: number;
  paymentStage?: string;
  description?: string;
  status: string;
  razorpayPaymentId?: string;
  paymentDate?: Date | string | null;
  createdBy?: string;
}) {
  const client = getWriteClient();
  if (!client || !link.paymentLinkId) return;
  try {
    await client.from('razorpay_payment_links').upsert(
      {
        source_id: link.sourceId,
        payment_link_id: link.paymentLinkId,
        short_url: link.shortUrl,
        reference_id: link.referenceId || '',
        entity_type: link.entityType,
        entity_id: link.entityId,
        project_code: link.projectCode || '',
        customer_id: link.customerId || '',
        user_uid: link.userUid || '',
        customer_name: link.customerName || '',
        customer_email: link.customerEmail || '',
        customer_phone: link.customerPhone || '',
        amount_inr: link.amountInr,
        amount_paise: link.amountPaise,
        payment_stage: link.paymentStage || 'advance',
        description: link.description || '',
        status: link.status,
        razorpay_payment_id: link.razorpayPaymentId || '',
        payment_date: link.paymentDate ? new Date(link.paymentDate).toISOString() : null,
        created_by: link.createdBy || '',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'payment_link_id' }
    );
  } catch {
    // Non-blocking sync
  }
}




