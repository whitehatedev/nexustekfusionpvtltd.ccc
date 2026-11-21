import 'dotenv/config';
import express from 'express';
import fs from 'node:fs/promises';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { and, eq, sql } from 'drizzle-orm';
import { db, verifyCloudDatabaseConnection } from './src/db/index.ts';
import {
  blogs,
  caseStudies,
  cmsPages,
  paymentInstallments,
  paymentRefunds,
  payments,
  paymentWebhookEvents,
  printingOrders,
  productCategories,
  productReviews,
  products,
  projectEnquiries,
  projectQuotations,
  razorpayPaymentLinks,
  siteSettings,
  storeOrders,
} from './src/db/schema.ts';
import { publicRouter } from './src/server/routes/public.ts';
import { customerRouter } from './src/server/routes/customer.ts';
import { adminRouter } from './src/server/routes/admin.ts';
import { authRouter } from './src/server/routes/auth.ts';
import { krashivantriRouter } from './src/server/routes/krashivantri.ts';
import { verifyWebhookSignature } from './src/server/razorpay.ts';
import {
  syncPaymentToSupabase,
  syncPrintingOrderToSupabase,
  syncRazorpayPaymentLinkToSupabase,
  syncRefundToSupabase,
} from './src/server/supabase-ecommerce.ts';
import { dispatchLifecycleEmail } from './src/server/email.ts';
import { reconcileProjectQuotationPayment } from './src/server/project-lifecycle.ts';
import { recordInstallmentPayment, runScheduledInstallmentReminders } from './src/server/project-upgrade-service.ts';
import { ensureUploadDirs, generateCode, UPLOADS_ROOT } from './src/server/utils.ts';
import { ensureInitialSeed } from './src/server/seed.ts';
import { ensureSupabaseStorageBuckets, getSupabasePublicConfig } from './src/lib/supabase-admin.ts';
import { ensureCustomerManagementSchema } from './src/db/ensure-customer-mgmt.ts';
import { startPublicCustomersRealtimeSync } from './src/server/supabase-customers.ts';
import {
  buildArticleSchema,
  buildFaqSchema,
  buildJsonLdGraphString,
  buildProductSchema,
  buildServiceSchema,
  normalizeSeoPath,
  resolveRouteSeo,
  SITE_BASE_URL,
  type DynamicSeoOverride,
} from './src/lib/seo.ts';

function escapeHtmlAttr(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeHtmlText(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function resolveSsrSeoForRequest(originalUrl: string) {
  const parsed = new URL(originalUrl || '/', SITE_BASE_URL);
  const pathname = normalizeSeoPath(parsed.pathname);
  const search = parsed.search || '';

  const settingsRows = await db.select().from(siteSettings);
  const settingsMap: Record<string, any> = {};
  for (const row of settingsRows) settingsMap[row.key] = row.value;

  let override: DynamicSeoOverride | null = null;

  if (pathname === '/krashivantri-x' || pathname === '/krashivantri-x-pro') {
    const isPro = pathname === '/krashivantri-x-pro';
    const [prod] = await db.select().from(products).where(eq(products.slug, isPro ? 'krashivantri-x-pro' : 'krashivantri-x')).limit(1);
    const reviews = prod
      ? await db.select({ rating: productReviews.rating }).from(productReviews).where(eq(productReviews.productId, prod.id))
      : [];
    const avg = reviews.length > 0 ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : undefined;
    const price = prod ? (prod.discountPriceInr || prod.priceInr) : isPro ? 560000 : 450000;
    const name = prod?.name || (isPro ? 'KRASHIVANTRI X PRO' : 'KRASHIVANTRI X');
    const description =
      prod?.shortDescription ||
      (isPro
        ? 'KRASHIVANTRI X PRO agricultural spraying drone for commercial fleets, FPOs, and industrial precision agriculture.'
        : 'KRASHIVANTRI X agricultural spraying drone engineered for smart precision farming and FPO operations.');
    override = {
      title: prod?.seoTitle || `${name} Agricultural Drone — ₹${price.toLocaleString('en-IN')} | NexusTekFusion`,
      description: prod?.seoDescription || description,
      ogType: 'product',
      ogImageUrl: prod?.imageUrl || (isPro ? '/src/assets/images/krashivantri_x_pro_1795013371537.jpg' : '/src/assets/images/krashivantri_x_field_1795013369836.jpg'),
      breadcrumbs: [
        { name: 'Home', url: '/' },
        { name: 'KRASHIVANTRI', url: '/krashivantri' },
        { name, url: pathname },
      ],
      schemas: [
        buildProductSchema({
          name,
          description,
          sku: prod?.sku || (isPro ? 'KRV-X-PRO' : 'KRV-X'),
          brand: 'KRASHIVANTRI by NexusTekFusion',
          imageUrl: prod?.imageUrl || undefined,
          url: pathname,
          priceInr: price,
          inStock: true,
          ratingValue: avg,
          reviewCount: reviews.length,
        }),
      ],
    };
  } else if (pathname.startsWith('/product/')) {
    const slug = pathname.replace('/product/', '').split('/')[0];
    const [prod] = await db
      .select()
      .from(products)
      .where(and(eq(products.slug, slug), eq(products.isDeleted, false)))
      .limit(1);
    if (prod) {
      const reviews = await db.select({ rating: productReviews.rating }).from(productReviews).where(eq(productReviews.productId, prod.id));
      const avg = reviews.length > 0 ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : undefined;
      override = {
        title: prod.seoTitle || `${prod.name} | NexusTekFusion Store`,
        description: prod.seoDescription || prod.shortDescription || prod.description?.slice(0, 155) || `${prod.name} available at NexusTekFusion Engineering Store.`,
        ogType: 'product',
        ogImageUrl: prod.imageUrl || undefined,
        breadcrumbs: [
          { name: 'Home', url: '/' },
          { name: 'Store', url: '/store' },
          { name: prod.name, url: `/product/${prod.slug}` },
        ],
        schemas: [
          buildProductSchema({
            name: prod.name,
            description: prod.shortDescription || prod.description || prod.name,
            sku: prod.sku,
            brand: prod.brand || 'NexusTekFusion',
            imageUrl: prod.imageUrl || undefined,
            url: `/product/${prod.slug}`,
            priceInr: prod.discountPriceInr || prod.priceInr,
            inStock: prod.stockQty > 0,
            quoteOnly: prod.productType === 'quote_only',
            ratingValue: avg,
            reviewCount: reviews.length,
          }),
        ],
      };
    }
  } else if (pathname.startsWith('/store/category/') || pathname.startsWith('/shop/category/')) {
    const catSlug = pathname.split('/').pop() || '';
    const [cat] = await db.select().from(productCategories).where(eq(productCategories.slug, catSlug)).limit(1);
    if (cat) {
      override = {
        title: `${cat.name} — Engineering & Drone Store | NexusTekFusion`,
        description: cat.description || `Browse genuine ${cat.name} components and hardware dispatched pan-India from NexusTekFusion Nagpur.`,
        canonicalUrl: `/store/category/${cat.slug}`,
        breadcrumbs: [
          { name: 'Home', url: '/' },
          { name: 'Store', url: '/store' },
          { name: cat.name, url: `/store/category/${cat.slug}` },
        ],
      };
    }
  } else if (pathname.startsWith('/blogs/')) {
    const slug = pathname.replace('/blogs/', '').split('/')[0];
    const [post] = await db.select().from(blogs).where(and(eq(blogs.slug, slug), eq(blogs.isPublished, true))).limit(1);
    if (post) {
      override = {
        title: post.seoTitle || `${post.title} | NexusTekFusion Journal`,
        description: post.seoDescription || post.excerpt,
        ogType: 'article',
        ogImageUrl: post.coverImageUrl || undefined,
        breadcrumbs: [
          { name: 'Home', url: '/' },
          { name: 'Blogs', url: '/blogs' },
          { name: post.title, url: `/blogs/${post.slug}` },
        ],
        schemas: [
          buildArticleSchema({
            headline: post.title,
            description: post.excerpt,
            url: `/blogs/${post.slug}`,
            imageUrl: post.coverImageUrl || undefined,
            datePublished: post.publishedAt ? new Date(post.publishedAt).toISOString() : undefined,
            dateModified: post.updatedAt ? new Date(post.updatedAt).toISOString() : undefined,
            category: post.category,
          }),
        ],
      };
    }
  } else if (pathname.startsWith('/projects/')) {
    const slug = pathname.replace('/projects/', '').split('/')[0];
    const [study] = await db.select().from(caseStudies).where(and(eq(caseStudies.slug, slug), eq(caseStudies.isPublished, true))).limit(1);
    if (study) {
      override = {
        title: `${study.title} — Engineering R&D Project | NexusTekFusion`,
        description: study.description?.slice(0, 155) || study.outcomes,
        ogImageUrl: study.imageUrl || undefined,
        breadcrumbs: [
          { name: 'Home', url: '/' },
          { name: 'Projects', url: '/projects' },
          { name: study.title, url: `/projects/${study.slug}` },
        ],
      };
    }
  } else if (pathname.startsWith('/p/')) {
    const slug = pathname.replace('/p/', '').split('/')[0];
    const [pg] = await db.select().from(cmsPages).where(and(eq(cmsPages.slug, slug), eq(cmsPages.status, 'published'))).limit(1);
    if (pg) {
      override = {
        title: pg.seoTitle || `${pg.title} | NexusTekFusion`,
        description: pg.seoDescription || pg.publishedContent?.heroSubheadline || pg.title,
      };
    }
  } else if (pathname === '/faq') {
    const faqs = Array.isArray(settingsMap.faqs) ? settingsMap.faqs : [];
    if (faqs.length > 0) {
      override = { schemas: [buildFaqSchema(faqs)] };
    }
  } else if (pathname === '/services' || pathname.startsWith('/services/')) {
    const serviceMap: Record<string, { name: string; serviceType: string; description: string }> = {
      '/services': {
        name: 'NexusTekFusion Engineering Services',
        serviceType: '3D Printing, Engineering Project Development & Drone Repair',
        description: 'Precision 3D printing, custom engineering project development, and agricultural & commercial drone diagnostics in Nagpur.',
      },
      '/services/3d-printing': {
        name: '3D Printing & Rapid Prototyping',
        serviceType: 'Additive Manufacturing & FDM/SLA 3D Printing',
        description: 'Custom FDM & SLA 3D printing, STL/OBJ volumetric slicing, and functional prototype fabrication in Nagpur and pan-India.',
      },
      '/services/custom-engineering': {
        name: 'Custom Engineering Project Development',
        serviceType: 'Hardware Prototyping, Robotics, IoT, AI/ML & Embedded Systems R&D',
        description: 'End-to-end milestone-backed engineering project development and prototyping.',
      },
      '/services/drone-repair': {
        name: 'Drone Repair & Diagnostics Service',
        serviceType: 'Agricultural & Commercial UAV Maintenance and Calibration',
        description: 'Authorized UAV airframe repair, ESC/motor replacement, flight controller calibration, and field diagnostics.',
      },
      '/services/pcb-design': {
        name: 'Single & Double-Layer PCB Design & Fabrication',
        serviceType: 'PCB Layout & Gerber Fabrication Service',
        description: 'Single and double-layer FR4 PCB quoting, Gerber DFM checks, and hardware assembly.',
      },
    };
    const svc = serviceMap[pathname];
    if (svc) {
      override = {
        schemas: [buildServiceSchema({ ...svc, url: pathname })],
      };
    }
  } else if (pathname === '/nagpur' || pathname === '/maharashtra') {
    override = {
      schemas: [
        buildServiceSchema({
          name: pathname === '/nagpur' ? 'Agricultural Drone & 3D Printing Services in Nagpur' : 'Agricultural Drone & Engineering Services Across Maharashtra',
          serviceType: 'Agricultural UAV Manufacturing, 3D Printing & Engineering R&D',
          description:
            pathname === '/nagpur'
              ? 'Local Nagpur manufacturing, 3D printing studio, drone diagnostics center, and hardware pickup at Ganjipeth, Nagpur 440018.'
              : 'Pan-Maharashtra KRASHIVANTRI spraying drone supply, field diagnostics, and custom R&D engineering.',
          url: pathname,
          areaServed: pathname === '/nagpur' ? ['Nagpur', 'Wardha', 'Amravati', 'Vidarbha'] : ['Nagpur', 'Maharashtra', 'Vidarbha', 'Pune', 'Nashik', 'Aurangabad'],
        }),
      ],
    };
  }

  return resolveRouteSeo({
    pathname,
    search,
    seoConfig: settingsMap.seoConfig,
    companyInfo: settingsMap.companyInfo,
    override,
    baseUrl: process.env.APP_URL || SITE_BASE_URL,
  });
}

async function injectSsrSeo(html: string, originalUrl: string): Promise<{ html: string; robots: string }> {
  try {
    const resolved = await resolveSsrSeoForRequest(originalUrl);
    let out = html
      .replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtmlText(resolved.title)}</title>`)
      .replace(/<meta\s+name="description"[^>]*>/i, `<meta name="description" content="${escapeHtmlAttr(resolved.description)}" />`)
      .replace(/<meta\s+name="robots"[^>]*>/i, `<meta name="robots" content="${escapeHtmlAttr(resolved.robots)}" />`)
      .replace(/<meta\s+property="og:title"[^>]*>/i, `<meta property="og:title" content="${escapeHtmlAttr(resolved.ogTitle)}" />`)
      .replace(/<meta\s+property="og:description"[^>]*>/i, `<meta property="og:description" content="${escapeHtmlAttr(resolved.ogDescription)}" />`);

    const extraHeadTags = [
      `<link rel="canonical" href="${escapeHtmlAttr(resolved.canonicalUrl)}" />`,
      `<meta name="keywords" content="${escapeHtmlAttr(resolved.keywords)}" />`,
      `<meta property="og:url" content="${escapeHtmlAttr(resolved.canonicalUrl)}" />`,
      `<meta property="og:image" content="${escapeHtmlAttr(resolved.ogImageUrl)}" />`,
      `<meta property="og:type" content="${escapeHtmlAttr(resolved.ogType)}" />`,
      `<meta name="twitter:card" content="summary_large_image" />`,
      `<meta name="twitter:title" content="${escapeHtmlAttr(resolved.ogTitle)}" />`,
      `<meta name="twitter:description" content="${escapeHtmlAttr(resolved.ogDescription)}" />`,
      `<meta name="twitter:image" content="${escapeHtmlAttr(resolved.ogImageUrl)}" />`,
      resolved.googleSiteVerification
        ? `<meta name="google-site-verification" content="${escapeHtmlAttr(resolved.googleSiteVerification)}" />`
        : '',
      `<script id="ntf-jsonld" type="application/ld+json">${buildJsonLdGraphString(resolved.schemas).replace(/<\/script/gi, '<\\/script')}</script>`,
    ]
      .filter(Boolean)
      .join('\n    ');

    out = out.replace('</head>', `    ${extraHeadTags}\n  </head>`);
    return { html: out, robots: resolved.robots };
  } catch (err) {
    console.error('SSR SEO injection error:', err);
    return { html, robots: 'index, follow' };
  }
}

async function startServer() {
  const app = express();
  const port = Number(process.env.PORT || 3000);

  ensureUploadDirs();
  await verifyCloudDatabaseConnection().catch(() => false);
  ensureSupabaseStorageBuckets().catch((err) => {
    console.warn('Supabase storage bucket check warning:', err);
  });
  await ensureInitialSeed()
    .then(() => ensureCustomerManagementSchema())
    .then(() => {
      startPublicCustomersRealtimeSync();
    })
    .catch((err) => {
      console.error('Startup seed/migration check failed:', err);
      startPublicCustomersRealtimeSync();
    });

  // Razorpay Webhook (raw body required for HMAC signature verification & idempotency)
  const handleRazorpayWebhook = async (req: express.Request, res: express.Response) => {
    const signature = String(req.headers['x-razorpay-signature'] || '');
    const rawBody = req.body instanceof Buffer ? req.body.toString('utf8') : JSON.stringify(req.body);
    if (!(await verifyWebhookSignature(rawBody, signature))) {
      return res.status(400).json({ error: 'Invalid Razorpay webhook signature.' });
    }
    try {
      const payload = JSON.parse(rawBody || '{}');
      const paymentEntity = payload?.payload?.payment?.entity;
      const refundEntity = payload?.payload?.refund?.entity;
      const paymentLinkEntity = payload?.payload?.payment_link?.entity;
      const eventType = String(payload?.event || 'payment.event');
      const razorpayPaymentId = String(paymentEntity?.id || refundEntity?.payment_id || '');
      const razorpayOrderId = String(paymentEntity?.order_id || '');
      const razorpayRefundId = String(refundEntity?.id || '');
      const paymentLinkId = String(paymentLinkEntity?.id || paymentEntity?.notes?.payment_link_id || '');
      const eventId = String(
        req.headers['x-razorpay-event-id'] ||
          `${eventType}_${razorpayRefundId || razorpayPaymentId || paymentLinkId || razorpayOrderId || Date.now()}`
      );
      const existing = await db
        .select()
        .from(paymentWebhookEvents)
        .where(eq(paymentWebhookEvents.eventId, eventId))
        .limit(1);
      if (existing.length > 0) {
        return res.json({ received: true, duplicate: true });
      }
      await db.insert(paymentWebhookEvents).values({
        eventId,
        provider: 'razorpay',
        eventType,
        razorpayOrderId,
        razorpayPaymentId,
        paymentLinkId,
        payload,
        processingStatus: 'processed',
      });

      const amountPaise = Number(paymentEntity?.amount || paymentLinkEntity?.amount_paid || paymentLinkEntity?.amount || refundEntity?.amount || 0);
      const amountInr = Math.round(amountPaise / 100);

      // Reconcile Razorpay Payment Link events (payment_link.paid / partially_paid / cancelled / expired)
      if (
        paymentLinkId &&
        ['payment_link.paid', 'payment_link.partially_paid', 'payment_link.cancelled', 'payment_link.expired'].includes(
          eventType
        )
      ) {
        const nextLinkStatus =
          eventType === 'payment_link.paid'
            ? 'paid'
            : eventType === 'payment_link.partially_paid'
            ? 'partially_paid'
            : eventType === 'payment_link.cancelled'
            ? 'cancelled'
            : 'expired';
        const paidAt = eventType === 'payment_link.paid' ? new Date() : null;
        const [updatedLink] = await db
          .update(razorpayPaymentLinks)
          .set({
            status: nextLinkStatus,
            ...(razorpayPaymentId ? { razorpayPaymentId } : {}),
            ...(paidAt ? { paymentDate: paidAt } : {}),
            updatedAt: new Date(),
          })
          .where(eq(razorpayPaymentLinks.paymentLinkId, paymentLinkId))
          .returning();

        if (updatedLink) {
          await syncRazorpayPaymentLinkToSupabase({
            sourceId: updatedLink.id,
            paymentLinkId: updatedLink.paymentLinkId,
            shortUrl: updatedLink.shortUrl,
            referenceId: updatedLink.referenceId,
            entityType: updatedLink.entityType,
            entityId: updatedLink.entityId,
            projectCode: updatedLink.projectCode,
            customerId: updatedLink.customerId,
            customerName: updatedLink.customerName,
            customerEmail: updatedLink.customerEmail,
            customerPhone: updatedLink.customerPhone,
            amountInr: updatedLink.amountInr,
            amountPaise: updatedLink.amountPaise,
            paymentStage: updatedLink.paymentStage,
            description: updatedLink.description,
            status: updatedLink.status,
            razorpayPaymentId: updatedLink.razorpayPaymentId,
            paymentDate: updatedLink.paymentDate,
            createdBy: updatedLink.createdBy,
          }).catch(() => {});

          if (eventType === 'payment_link.paid') {
            if (updatedLink.entityType === 'project_installment' && updatedLink.entityId > 0) {
              const [inst] = await db
                .select()
                .from(paymentInstallments)
                .where(eq(paymentInstallments.id, updatedLink.entityId))
                .limit(1);
              if (inst && inst.status !== 'Paid') {
                await recordInstallmentPayment({
                  projectId: inst.projectId,
                  installmentNumber: inst.installmentNumber === 2 ? 2 : 1,
                  amountInr: updatedLink.amountInr || amountInr,
                  paymentMethod: 'razorpay_link',
                  transactionRef: razorpayPaymentId || `pay_plink_${paymentLinkId}`,
                  razorpayOrderId: razorpayOrderId || `plink_${paymentLinkId}`,
                  razorpayPaymentId: razorpayPaymentId || `pay_plink_${paymentLinkId}`,
                  razorpaySignature: signature,
                  paymentLinkId: updatedLink.paymentLinkId,
                  recordedBy: 'razorpay_webhook',
                  notes: 'Confirmed via Razorpay payment_link.paid webhook.',
                });
              }
            } else if (updatedLink.entityType === 'project_quotation' && updatedLink.entityId > 0) {
              await reconcileProjectQuotationPayment({
                quotationId: updatedLink.entityId,
                razorpayOrderId: razorpayOrderId || `plink_${paymentLinkId}`,
                razorpayPaymentId: razorpayPaymentId || `pay_plink_${paymentLinkId}`,
                razorpaySignature: signature,
                paymentMode: updatedLink.paymentStage || 'advance',
                paymentLinkId: updatedLink.paymentLinkId,
                paymentUrl: updatedLink.shortUrl,
              });
            } else if (updatedLink.entityType === 'store_order' && updatedLink.entityId > 0) {
              await db
                .update(storeOrders)
                .set({
                  paymentStatus: 'paid',
                  orderStatus: 'Payment Confirmed',
                  razorpayPaymentId: razorpayPaymentId || `pay_plink_${paymentLinkId}`,
                  updatedAt: new Date(),
                })
                .where(eq(storeOrders.id, updatedLink.entityId));
            } else {
              const paymentRef = generateCode('NTF-PLK');
              await db
                .insert(payments)
                .values({
                  paymentRef,
                  userId: updatedLink.userId,
                  customerId: updatedLink.customerId,
                  entityType: updatedLink.entityType,
                  entityId: updatedLink.entityId,
                  projectId: updatedLink.projectId,
                  projectCode: updatedLink.projectCode,
                  paymentStage: updatedLink.paymentStage,
                  paymentLinkId: updatedLink.paymentLinkId,
                  paymentUrl: updatedLink.shortUrl,
                  razorpayOrderId,
                  razorpayPaymentId: razorpayPaymentId || `pay_plink_${paymentLinkId}`,
                  razorpaySignature: signature,
                  amountInr: updatedLink.amountInr || amountInr,
                  amountPaise: updatedLink.amountPaise || amountPaise,
                  mode: process.env.RAZORPAY_KEY_ID?.startsWith('rzp_live_') ? 'live_razorpay' : 'test_mode',
                  status: 'verified',
                  paymentDate: paidAt,
                  verifiedAt: paidAt,
                })
                .onConflictDoNothing();
            }
          }
        }
      }

      if (eventType === 'payment.authorized') {
        if (razorpayOrderId && paymentEntity?.status === 'captured') {
          const [matchedQuote] = await db
            .select()
            .from(projectQuotations)
            .where(eq(projectQuotations.razorpayOrderId, razorpayOrderId))
            .limit(1);
          if (matchedQuote && razorpayPaymentId) {
            await reconcileProjectQuotationPayment({
              quotationId: matchedQuote.id,
              razorpayOrderId,
              razorpayPaymentId,
              razorpaySignature: signature,
              paymentMode: matchedQuote.paidAmountInr > 0 ? 'balance' : 'advance',
            });
          }
        }
      } else if (eventType === 'payment.captured' || eventType === 'order.paid') {
        let reconciledProject = false;
        if (razorpayOrderId && razorpayPaymentId) {
          const [matchedInst] = await db
            .select()
            .from(paymentInstallments)
            .where(eq(paymentInstallments.razorpayOrderId, razorpayOrderId))
            .limit(1);
          if (matchedInst && matchedInst.status !== 'Paid') {
            await recordInstallmentPayment({
              projectId: matchedInst.projectId,
              installmentNumber: matchedInst.installmentNumber === 2 ? 2 : 1,
              amountInr: amountInr || Math.max(0, matchedInst.amountInr - matchedInst.paidAmountInr),
              paymentMethod: 'razorpay_checkout',
              transactionRef: razorpayPaymentId,
              razorpayOrderId,
              razorpayPaymentId,
              razorpaySignature: signature,
              recordedBy: 'razorpay_webhook',
              notes: 'Confirmed via Razorpay checkout webhook.',
            });
            reconciledProject = true;
          }

          const [matchedQuote] = await db
            .select()
            .from(projectQuotations)
            .where(eq(projectQuotations.razorpayOrderId, razorpayOrderId))
            .limit(1);
          if (!reconciledProject && matchedQuote) {
            await reconcileProjectQuotationPayment({
              quotationId: matchedQuote.id,
              razorpayOrderId,
              razorpayPaymentId,
              razorpaySignature: signature,
              paymentMode: matchedQuote.paidAmountInr > 0 ? 'balance' : 'advance',
            });
            reconciledProject = true;
          }
        }

        if (!reconciledProject && razorpayOrderId) {
          const [matchedStoreOrder] = await db
            .select()
            .from(storeOrders)
            .where(eq(storeOrders.razorpayOrderId, razorpayOrderId))
            .limit(1);
          if (matchedStoreOrder && matchedStoreOrder.paymentStatus !== 'paid') {
            const history = Array.isArray(matchedStoreOrder.statusHistory) ? matchedStoreOrder.statusHistory : [];
            const nextHistory = history.some((h) => h.status === 'Payment Confirmed')
              ? history
              : [
                  ...history,
                  {
                    status: 'Payment Confirmed',
                    timestamp: new Date().toISOString(),
                    note: `Razorpay webhook payment captured (${razorpayPaymentId}).`,
                    actor: 'razorpay_webhook',
                  },
                ];
            await db
              .update(storeOrders)
              .set({
                paymentStatus: 'paid',
                orderStatus: 'Payment Confirmed',
                statusHistory: nextHistory,
                razorpayPaymentId,
                updatedAt: new Date(),
              })
              .where(eq(storeOrders.id, matchedStoreOrder.id));
          }

          const updatedCapturedPrintRows = await db
            .update(printingOrders)
            .set({
              paymentStatus: 'paid',
              refundStatus: 'none',
              paymentVerifiedAt: new Date(),
              orderStatus: 'Payment Completed',
              razorpayPaymentId,
              updatedAt: new Date(),
            })
            .where(eq(printingOrders.razorpayOrderId, razorpayOrderId))
            .returning();
          for (const po of updatedCapturedPrintRows) {
            syncPrintingOrderToSupabase({
              orderNumber: po.orderNumber,
              customerId: po.customerId,
              customerName: po.customerName,
              email: po.email,
              phone: po.phone,
              fileName: po.fileName,
              fileFormat: po.fileFormat,
              fileSizeBytes: po.fileSizeBytes,
              fileStoragePath: po.fileStoragePath,
              storageBucket: po.storageBucket,
              technology: po.technology,
              materialName: po.materialName,
              colorName: po.colorName,
              quotedPriceInr: po.quotedPriceInr,
              totalInr: po.totalInr,
              paymentStatus: po.paymentStatus,
              refundStatus: po.refundStatus,
              razorpayOrderId: po.razorpayOrderId,
              razorpayPaymentId: po.razorpayPaymentId,
              orderStatus: po.orderStatus,
              rejectionReason: po.rejectionReason,
            }).catch(() => {});
          }
        }
        if (!reconciledProject && razorpayPaymentId) {
          const [existingPay] = await db
            .select()
            .from(payments)
            .where(eq(payments.razorpayPaymentId, razorpayPaymentId))
            .limit(1);
          if (!existingPay) {
            const paymentRef = generateCode('NTF-WH');
            await db.insert(payments).values({
              paymentRef,
              entityType: 'store_order',
              entityId: 0,
              paymentStage: 'store',
              razorpayOrderId,
              razorpayPaymentId,
              amountInr,
              amountPaise,
              mode: process.env.RAZORPAY_KEY_ID?.startsWith('rzp_live_') ? 'live_razorpay' : 'test_mode',
              status: 'verified',
              verifiedAt: new Date(),
            });
            syncPaymentToSupabase({
              paymentRef,
              entityType: 'store_order',
              razorpayOrderId,
              razorpayPaymentId,
              amountInr,
              amountPaise,
              status: 'captured',
              verifiedAt: new Date(),
            }).catch(() => {});
          }
        }
      } else if (eventType === 'payment.failed') {
        const errorCode = String(paymentEntity?.error_code || 'PAYMENT_FAILED');
        const failureReason = String(paymentEntity?.error_description || paymentEntity?.error_reason || 'Payment failed');
        let matchedQuote: typeof projectQuotations.$inferSelect | undefined;
        if (razorpayOrderId) {
          const [qRow] = await db
            .select()
            .from(projectQuotations)
            .where(eq(projectQuotations.razorpayOrderId, razorpayOrderId))
            .limit(1);
          matchedQuote = qRow;
          if (!matchedQuote) {
            await db
              .update(storeOrders)
              .set({ paymentStatus: 'failed', updatedAt: new Date() })
              .where(eq(storeOrders.razorpayOrderId, razorpayOrderId));

            const updatedFailedPrintRows = await db
              .update(printingOrders)
              .set({ paymentStatus: 'failed', orderStatus: 'Payment Pending', updatedAt: new Date() })
              .where(eq(printingOrders.razorpayOrderId, razorpayOrderId))
              .returning();
            for (const po of updatedFailedPrintRows) {
              syncPrintingOrderToSupabase({
                orderNumber: po.orderNumber,
                customerId: po.customerId,
                customerName: po.customerName,
                email: po.email,
                phone: po.phone,
                fileName: po.fileName,
                fileFormat: po.fileFormat,
                fileSizeBytes: po.fileSizeBytes,
                fileStoragePath: po.fileStoragePath,
                storageBucket: po.storageBucket,
                technology: po.technology,
                materialName: po.materialName,
                colorName: po.colorName,
                quotedPriceInr: po.quotedPriceInr,
                totalInr: po.totalInr,
                paymentStatus: po.paymentStatus,
                refundStatus: po.refundStatus,
                razorpayOrderId: po.razorpayOrderId,
                razorpayPaymentId: po.razorpayPaymentId,
                orderStatus: po.orderStatus,
                rejectionReason: po.rejectionReason,
              }).catch(() => {});
            }
          }
        }
        if (razorpayPaymentId) {
          const paymentRef = generateCode('NTF-FAIL');
          await db.insert(payments).values({
            paymentRef,
            entityType: matchedQuote ? 'project_quotation' : 'store_order',
            entityId: matchedQuote ? matchedQuote.id : 0,
            paymentStage: matchedQuote ? 'project_quotation' : 'store',
            razorpayOrderId,
            razorpayPaymentId,
            amountInr,
            amountPaise,
            mode: process.env.RAZORPAY_KEY_ID?.startsWith('rzp_live_') ? 'live_razorpay' : 'test_mode',
            status: 'failed',
            errorCode,
            failureReason,
          });
          if (matchedQuote) {
            const [enq] = await db
              .select()
              .from(projectEnquiries)
              .where(eq(projectEnquiries.id, matchedQuote.enquiryId))
              .limit(1);
            if (enq?.customerEmail) {
              await dispatchLifecycleEmail({
                userId: enq.userId,
                enquiryId: enq.id,
                recipientEmail: enq.customerEmail,
                eventType: 'payment_failed',
                vars: {
                  customerName: enq.customerName,
                  enquiryNumber: enq.enquiryNumber,
                  quotationNumber: matchedQuote.quotationNumber,
                  amountInr,
                  reason: failureReason,
                },
              });
            }
          }
          syncPaymentToSupabase({
            paymentRef,
            entityType: matchedQuote ? 'project_quotation' : 'store_order',
            entityRef: matchedQuote ? String(matchedQuote.id) : undefined,
            razorpayOrderId,
            razorpayPaymentId,
            amountInr,
            amountPaise,
            status: 'failed',
            errorCode,
            failureReason,
          }).catch(() => {});
        }
      } else if (eventType === 'refund.processed' || eventType === 'refund.failed') {
        const refundStatus = eventType === 'refund.processed' ? 'processed' : 'failed';
        if (razorpayRefundId) {
          const [existingRef] = await db
            .select()
            .from(paymentRefunds)
            .where(eq(paymentRefunds.razorpayRefundId, razorpayRefundId))
            .limit(1);
          if (existingRef) {
            await db
              .update(paymentRefunds)
              .set({ status: refundStatus, processedAt: refundStatus === 'processed' ? new Date() : null })
              .where(eq(paymentRefunds.id, existingRef.id));
          } else {
            const refundRef = generateCode('NTF-RFND');
            await db.insert(paymentRefunds).values({
              refundRef,
              razorpayPaymentId,
              razorpayRefundId,
              amountInr,
              amountPaise,
              status: refundStatus,
              initiatedBy: 'razorpay_webhook',
              processedAt: refundStatus === 'processed' ? new Date() : null,
            });
            syncRefundToSupabase({
              refundRef,
              razorpayPaymentId,
              razorpayRefundId,
              amountInr,
              amountPaise,
              status: refundStatus,
              initiatedBy: 'razorpay_webhook',
              processedAt: refundStatus === 'processed' ? new Date() : null,
            }).catch(() => {});
          }
        }
        if (razorpayPaymentId && refundStatus === 'processed') {
          await db
            .update(payments)
            .set({ status: 'refunded', refundStatus: 'full', refundedAmountInr: amountInr })
            .where(eq(payments.razorpayPaymentId, razorpayPaymentId));
          await db
            .update(storeOrders)
            .set({ paymentStatus: 'refunded', refundStatus: 'full', updatedAt: new Date() })
            .where(eq(storeOrders.razorpayPaymentId, razorpayPaymentId));
          const updatedRefundedPrintRows = await db
            .update(printingOrders)
            .set({ paymentStatus: 'refunded', refundStatus: 'full', updatedAt: new Date() })
            .where(eq(printingOrders.razorpayPaymentId, razorpayPaymentId))
            .returning();
          for (const po of updatedRefundedPrintRows) {
            syncPrintingOrderToSupabase({
              orderNumber: po.orderNumber,
              customerId: po.customerId,
              customerName: po.customerName,
              email: po.email,
              phone: po.phone,
              fileName: po.fileName,
              fileFormat: po.fileFormat,
              fileSizeBytes: po.fileSizeBytes,
              fileStoragePath: po.fileStoragePath,
              storageBucket: po.storageBucket,
              technology: po.technology,
              materialName: po.materialName,
              colorName: po.colorName,
              quotedPriceInr: po.quotedPriceInr,
              totalInr: po.totalInr,
              paymentStatus: po.paymentStatus,
              refundStatus: po.refundStatus,
              razorpayOrderId: po.razorpayOrderId,
              razorpayPaymentId: po.razorpayPaymentId,
              orderStatus: po.orderStatus,
              rejectionReason: po.rejectionReason,
            }).catch(() => {});
          }
        }
      }
    } catch (err) {
      console.error('Webhook log error:', err);
    }
    res.json({ received: true });
  };

  app.post('/api/payments/webhook', express.raw({ type: 'application/json' }), handleRazorpayWebhook);
  app.post('/api/webhooks/razorpay', express.raw({ type: 'application/json' }), handleRazorpayWebhook);

  app.use(express.json({ limit: '12mb' }));
  app.use(express.urlencoded({ extended: true, limit: '12mb' }));

  // Serve public CMS media library uploads ONLY (private customer files stay behind /api/files/download)
  app.use('/uploads/media', express.static(path.join(UPLOADS_ROOT, 'media')));

  // Health check
  app.get('/api/health', async (_req, res) => {
    let databaseConnected = false;
    try {
      await db.execute(sql`SELECT 1`);
      databaseConnected = true;
    } catch {
      databaseConnected = false;
    }
    const sbPub = getSupabasePublicConfig();
    res.json({
      status: databaseConnected ? 'ok' : 'degraded',
      service: 'nexustekfusion-platform',
      database: databaseConnected ? 'connected' : 'disconnected',
      supabase: {
        configured: sbPub.configured,
        urlOrigin: sbPub.url || null,
      },
    });
  });

  // SEO endpoints
  app.get('/robots.txt', (_req, res) => {
    const base = process.env.APP_URL || 'https://nexustekfusion.in';
    res.type('text/plain').send(
      [
        'User-agent: *',
        'Allow: /',
        'Disallow: /admin',
        'Disallow: /my-account',
        'Disallow: /checkout',
        'Disallow: /cart',
        'Disallow: /login',
        'Disallow: /register',
        'Disallow: /auth/callback',
        'Disallow: /api/',
        'Disallow: /*?q=',
        `Sitemap: ${base}/sitemap.xml`,
      ].join('\n') + '\n'
    );
  });

  app.get('/sitemap.xml', async (_req, res) => {
    const base = process.env.APP_URL || 'https://nexustekfusion.in';
    const staticRoutes = [
      '/',
      '/krashivantri',
      '/krashivantri-x',
      '/krashivantri-x-pro',
      '/krashivantri/compare',
      '/krashivantri/enquiry',
      '/krashivantri/farmer-portal',
      '/krashivantri/pilot-portal',
      '/services',
      '/services/3d-printing',
      '/services/custom-engineering',
      '/services/drone-repair',
      '/services/pcb-design',
      '/store',
      '/store/3d-printed-products',
      '/projects',
      '/register-project',
      '/b2b',
      '/blogs',
      '/nagpur',
      '/maharashtra',
      '/contact',
      '/faq',
      '/shipping-policy',
      '/return-refund-policy',
      '/privacy-policy',
      '/terms-and-conditions',
      '/track-order',
      '/track-drone-repair',
    ];

    try {
      const [prodRows, catRows, blogRows, pageRows, projectRows] = await Promise.all([
        db
          .select({ slug: products.slug })
          .from(products)
          .where(and(eq(products.isPublished, true), eq(products.isDeleted, false))),
        db
          .select({ slug: productCategories.slug })
          .from(productCategories)
          .where(eq(productCategories.isActive, true)),
        db.select({ slug: blogs.slug }).from(blogs).where(eq(blogs.isPublished, true)),
        db.select({ slug: cmsPages.slug }).from(cmsPages).where(eq(cmsPages.status, 'published')),
        db.select({ slug: caseStudies.slug }).from(caseStudies).where(eq(caseStudies.isPublished, true)),
      ]);
      const dynamicUrls = [
        ...catRows.map((c) => `/store/category/${c.slug}`),
        ...prodRows.map((p) => `/product/${p.slug}`),
        ...blogRows.map((b) => `/blogs/${b.slug}`),
        ...projectRows.map((pr) => `/projects/${pr.slug}`),
        ...pageRows.map((pg) => `/p/${pg.slug}`),
      ];
      const allUrls = Array.from(new Set([...staticRoutes, ...dynamicUrls]));
      const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${allUrls
        .map((u) => `  <url><loc>${base}${u}</loc></url>`)
        .join('\n')}\n</urlset>`;
      res.type('application/xml').send(xml);
    } catch {
      res.type('application/xml').send(
        `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${staticRoutes
          .map((u) => `<url><loc>${base}${u}</loc></url>`)
          .join('')}</urlset>`
      );
    }
  });

  // Cross-site request forgery protection for cookie-authenticated mutations
  app.use('/api', (req, res, next) => {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
    const pathUrl = String(req.originalUrl || req.url || '');
    if (pathUrl.startsWith('/api/payments/webhook') || pathUrl.startsWith('/api/webhooks/razorpay')) {
      return next();
    }
    const hasBearer = Boolean(req.headers.authorization?.startsWith('Bearer '));
    const hasCookies = Boolean(req.headers.cookie);
    if (!hasCookies || hasBearer) return next();

    const secFetchSite = String(req.headers['sec-fetch-site'] || '').toLowerCase();
    if (secFetchSite === 'cross-site') {
      return res.status(403).json({ error: 'Cross-site state-changing requests are blocked.' });
    }
    const originHeader = String(req.headers.origin || '').trim();
    if (originHeader) {
      try {
        const originHost = new URL(originHeader).host.toLowerCase();
        const requestHost = String(req.headers['x-forwarded-host'] || req.headers.host || '')
          .split(',')[0]
          .trim()
          .toLowerCase();
        const appUrlHost = process.env.APP_URL ? new URL(process.env.APP_URL).host.toLowerCase() : '';
        if (originHost && requestHost && originHost !== requestHost && originHost !== appUrlHost) {
          return res.status(403).json({ error: 'Origin mismatch on authenticated request.' });
        }
      } catch {
        return res.status(403).json({ error: 'Invalid request origin.' });
      }
    }
    next();
  });

  // API Routers
  app.use('/api/auth', authRouter);
  app.use('/api', publicRouter);
  app.use('/api', customerRouter);
  app.use('/api', krashivantriRouter);
  app.use('/api/admin', adminRouter);

  // Lightweight OAuth callback handler (works cleanly in AI Studio popups & standalone tabs)
  app.get(['/auth/callback', '/auth/callback/'], (req, res, next) => {
    if (typeof req.query.code === 'string' && req.query.code.trim()) {
      return next();
    }
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Completing Google Sign-In | NexusTekFusion</title>
    <style>
      body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #F0F8FF; color: #263746; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
      .card { width: 100%; max-width: 440px; background: #FFFFFF; border: 1px solid #DCEAF5; border-radius: 16px; padding: 28px; text-align: center; box-shadow: 0 12px 32px rgba(18, 59, 93, 0.08); }
      .badge { display: inline-block; font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: #123B5D; background: #F0F8FF; border: 1px solid #DCEAF5; border-radius: 999px; padding: 4px 12px; margin-bottom: 14px; }
      h1 { margin: 0 0 8px; font-size: 20px; color: #123B5D; }
      p { margin: 0 0 18px; font-size: 14px; line-height: 1.5; color: #263746; }
      .err { display: none; margin-top: 12px; padding: 12px; border-radius: 10px; border: 1px solid #fecaca; background: #fef2f2; color: #991b1b; font-size: 13px; text-align: left; }
      .actions { display: none; gap: 10px; justify-content: center; margin-top: 16px; flex-wrap: wrap; }
      .btn { cursor: pointer; border: none; border-radius: 8px; padding: 10px 18px; font-size: 13px; font-weight: 600; text-decoration: none; display: inline-block; }
      .btn-primary { background: #64B5F6; color: #FFFFFF; }
      .btn-secondary { background: #FFFFFF; color: #123B5D; border: 1px solid #90CAF9; }
      .spinner { width: 34px; height: 34px; border: 3px solid #DCEAF5; border-top-color: #64B5F6; border-radius: 50%; margin: 0 auto 14px; animation: spin 0.8s linear infinite; }
      @keyframes spin { to { transform: rotate(360deg); } }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="badge">NexusTekFusion Google Sign-In</div>
      <div id="spinner" class="spinner"></div>
      <h1 id="heading">Completing Google Sign-In</h1>
      <p id="status">Verifying your Google account and synchronizing your session...</p>
      <div id="errorBox" class="err"></div>
      <div id="actions" class="actions">
        <button id="closeBtn" type="button" class="btn btn-primary" style="display:none;" onclick="window.close()">Close Window</button>
        <a id="continueLink" href="/my-account" class="btn btn-secondary">Continue to App</a>
      </div>
    </div>
    <script>
      (async function () {
        var spinnerEl = document.getElementById('spinner');
        var headingEl = document.getElementById('heading');
        var statusEl = document.getElementById('status');
        var errEl = document.getElementById('errorBox');
        var actionsEl = document.getElementById('actions');
        var closeBtn = document.getElementById('closeBtn');
        var continueLink = document.getElementById('continueLink');

        function fail(msg) {
          if (spinnerEl) spinnerEl.style.display = 'none';
          headingEl.textContent = 'Google Sign-In Could Not Complete';
          statusEl.textContent = 'Please review the message below and try signing in again.';
          errEl.textContent = msg;
          errEl.style.display = 'block';
          actionsEl.style.display = 'flex';
          if (window.opener && !window.opener.closed) closeBtn.style.display = 'inline-block';
          continueLink.href = '/admin/login';
          continueLink.textContent = 'Return to Admin Login';
        }

        try {
          var search = new URLSearchParams(window.location.search);
          var hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
          var errParam = search.get('error_description') || search.get('error') || hash.get('error_description') || hash.get('error');
          if (errParam) {
            return fail(decodeURIComponent(errParam.replace(/\\+/g, ' ')));
          }

          var accessToken = hash.get('access_token') || search.get('access_token');
          var refreshToken = hash.get('refresh_token') || search.get('refresh_token') || '';
          var authType = hash.get('type') || search.get('type') || '';

          if (!accessToken) {
            return fail('No OAuth access token returned by Supabase. Ensure ${
              (() => {
                const sbUrl = getSupabasePublicConfig().url;
                return sbUrl ? `${sbUrl}/auth/v1/callback` : 'your Supabase /auth/v1/callback URL';
              })()
            } and your app /auth/callback URL are configured in Supabase Authentication.');
          }

          var res = await fetch('/api/auth/sync-profile', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-auth-mode': 'admin',
              'Authorization': 'Bearer ' + accessToken
            },
            credentials: 'same-origin'
          });
          var data = await res.json().catch(function () { return {}; });
          if (!res.ok || !data.user) {
            return fail(data.error || 'Failed to synchronize your administrator profile.');
          }

          var payload = {
            type: 'OAUTH_AUTH_SUCCESS',
            sessionToken: data.sessionToken || null,
            user: data.user,
            accessToken: accessToken,
            refreshToken: refreshToken
          };

          var notifiedOpener = false;
          if (window.opener && !window.opener.closed) {
            try {
              window.opener.postMessage(payload, window.location.origin);
              notifiedOpener = true;
            } catch (e) {}
          }
          try {
            var bc = new BroadcastChannel('ntf_oauth_channel');
            bc.postMessage(payload);
            bc.close();
          } catch (e) {}

          if (spinnerEl) spinnerEl.style.display = 'none';
          headingEl.textContent = 'Signed In Successfully';
          statusEl.textContent = 'Welcome, ' + (data.user.fullName || data.user.email) + '!';

          var dest = data.redirectTo || '/admin/dashboard';
          if (authType === 'recovery') dest = '/admin/login';
          continueLink.href = dest;

          if (notifiedOpener) {
            actionsEl.style.display = 'flex';
            closeBtn.style.display = 'inline-block';
            setTimeout(function () {
              try { window.close(); } catch (e) {}
            }, 350);
          } else {
            window.location.replace(dest);
          }
        } catch (err) {
          fail((err && err.message) || 'Unexpected error during Google sign-in.');
        }
      })();
    </script>
  </body>
</html>`);
  });

  // Error handler for multer & API errors
  app.use('/api', (err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('API Error:', err);
    res.status(err?.status || 400).json({ error: err?.message || 'Unexpected server error.' });
  });

  if (process.env.NODE_ENV === 'production') {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir, { index: false }));
    app.get('*', async (req, res) => {
      try {
        const rawHtml = await fs.readFile(path.join(distDir, 'index.html'), 'utf-8');
        const { html, robots } = await injectSsrSeo(rawHtml, req.originalUrl);
        if (robots.includes('noindex')) {
          res.setHeader('X-Robots-Tag', 'noindex, nofollow');
        }
        res.status(200).setHeader('Content-Type', 'text/html').send(html);
      } catch {
        res.sendFile(path.join(distDir, 'index.html'));
      }
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(async (req, res, next) => {
      const accept = String(req.headers.accept || '');
      const isHtmlPageRequest =
        req.method === 'GET' &&
        !req.path.startsWith('/api') &&
        !req.path.startsWith('/@') &&
        !req.path.startsWith('/uploads/') &&
        !/\.\w+$/.test(req.path) &&
        accept.includes('text/html');
      if (!isHtmlPageRequest) {
        return next();
      }
      try {
        const rawHtml = await fs.readFile(path.resolve(process.cwd(), 'index.html'), 'utf-8');
        const transformed = await vite.transformIndexHtml(req.originalUrl, rawHtml);
        const { html, robots } = await injectSsrSeo(transformed, req.originalUrl);
        if (robots.includes('noindex')) {
          res.setHeader('X-Robots-Tag', 'noindex, nofollow');
        }
        res.status(200).setHeader('Content-Type', 'text/html').send(html);
      } catch (err) {
        vite.ssrFixStacktrace(err as Error);
        next(err);
      }
    });
    app.use(vite.middlewares);
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`NexusTekFusion server listening on http://0.0.0.0:${port}`);
  });

  // Automated Project Installment Payment Reminder Scheduler (hourly sweep + non-blocking warm check)
  setTimeout(() => {
    runScheduledInstallmentReminders().catch(() => {});
  }, 20_000);
  setInterval(() => {
    runScheduledInstallmentReminders().catch(() => {});
  }, 60 * 60 * 1000);
}

startServer();
