import { Router } from 'express';
import crypto from 'crypto';
import { and, asc, desc, eq, gte, ilike, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import {
  blogs,
  brands,
  caseStudies,
  cmsPages,
  coupons,
  crmLeads,
  customerAddresses,
  newsletterSubscribers,
  printingMachines,
  printingMaterials,
  printingOrders,
  productCategories,
  productEnquiries,
  productReviews,
  products,
  projectEnquiries,
  projects,
  siteSettings,
  storeOrders,
  supportTickets,
  teamMembers,
  users,
  websiteBanners,
} from '../../db/schema.ts';
import { createAdminSession } from '../../db/users.ts';
import {
  ADMIN_ROLES,
  optionalAuth,
  AuthRequest,
  requireCloudDatabase,
  USER_SESSION_COOKIE,
} from '../../middleware/auth.ts';
import {
  getSupabasePublicConfig,
  isSupabaseStorageConfigured,
  uploadSupportFileToSupabase,
} from '../../lib/supabase-admin.ts';
import { ensureInitialSeed } from '../seed.ts';
import { DEFAULT_CMS_BUNDLE, pickNeutralAvatar } from '../cms-defaults.ts';
import { createMemoryUploadMiddleware, createNotification, generateCode, isValidIndianPin } from '../utils.ts';
import { getRazorpayMode, isRazorpayConfigured } from '../razorpay.ts';
import { dispatchLifecycleEmail } from '../email.ts';
import { notifyAdmins } from '../project-lifecycle.ts';
import { emitAdminStreamEvent } from '../admin-realtime.ts';
import {
  syncEnquiryToSupabase,
  syncProductEnquiryToSupabase,
  syncStoreOrderToSupabase,
} from '../supabase-ecommerce.ts';

export const publicRouter = Router();

const supportUpload = createMemoryUploadMiddleware(
  ['.pdf', '.png', '.jpg', '.jpeg', '.doc', '.docx', '.zip'],
  15
);

function isProductVisibleToPublic(p: typeof products.$inferSelect): boolean {
  if (p.isDeleted) return false;
  if (!p.isPublished) return false;
  if (p.status === 'draft') return false;
  if (p.status === 'scheduled' && p.publishedAt && new Date(p.publishedAt) > new Date()) {
    return false;
  }
  return true;
}

publicRouter.get('/bootstrap', optionalAuth, async (req: AuthRequest, res) => {
  try {
    await ensureInitialSeed();
    const wantsPreview =
      (req.query.previewDraft === 'true' || req.query.preview === 'true') &&
      req.dbUser &&
      ADMIN_ROLES.has(req.dbUser.role);

    const [
      settingsRows,
      categories,
      brandRows,
      allPublishedProducts,
      latestBlogs,
      studies,
      materials,
      machines,
      publishedPages,
      teamRows,
      bannerRows,
    ] = await Promise.all([
      db.select().from(siteSettings),
      db
        .select()
        .from(productCategories)
        .where(eq(productCategories.isActive, true))
        .orderBy(asc(productCategories.sortOrder)),
      db.select().from(brands).where(eq(brands.isActive, true)).orderBy(asc(brands.name)),
      db
        .select()
        .from(products)
        .where(and(eq(products.isPublished, true), eq(products.isDeleted, false)))
        .orderBy(asc(products.sortOrder), desc(products.createdAt)),
      db
        .select()
        .from(blogs)
        .where(eq(blogs.isPublished, true))
        .orderBy(desc(blogs.publishedAt))
        .limit(6),
      db
        .select()
        .from(caseStudies)
        .where(eq(caseStudies.isPublished, true))
        .orderBy(desc(caseStudies.createdAt))
        .limit(8),
      db.select().from(printingMaterials).where(eq(printingMaterials.isActive, true)),
      db.select().from(printingMachines).where(eq(printingMachines.isActive, true)),
      db
        .select({ id: cmsPages.id, title: cmsPages.title, slug: cmsPages.slug, status: cmsPages.status })
        .from(cmsPages)
        .where(eq(cmsPages.status, 'published')),
      db.select().from(teamMembers).orderBy(asc(teamMembers.displayOrder), asc(teamMembers.id)),
      db.select().from(websiteBanners).orderBy(asc(websiteBanners.sortOrder), asc(websiteBanners.id)),
    ]);

    const visibleProducts = allPublishedProducts.filter(isProductVisibleToPublic);
    const featuredProducts = visibleProducts.filter((p) => p.isFeatured).slice(0, 8);
    const bestsellerProducts = visibleProducts.filter((p) => p.isBestseller).slice(0, 8);
    const newArrivalProducts = visibleProducts.filter((p) => p.isNewArrival).slice(0, 8);

    const settings: Record<string, unknown> = {};
    for (const row of settingsRows) {
      if (row.key === 'paymentGatewayConfig') continue;
      settings[row.key] = row.value;
    }

    const mappedTeam = teamRows
      .filter((m) => (wantsPreview ? true : m.isActive && m.status === 'published'))
      .map((m) => ({
        id: m.slugKey,
        dbId: m.id,
        name: m.fullName,
        designation: m.designation,
        department: m.department,
        professionalCategory: m.professionalCategory,
        qualifications: m.qualifications,
        experience: m.experience,
        biography: m.shortBiography,
        detailedBiography: m.detailedBiography,
        responsibilities: m.responsibilities,
        skills: Array.isArray(m.skills) ? m.skills : [],
        linkedinUrl: m.linkedinUrl,
        photoUrl: m.profilePhotoUrl || pickNeutralAvatar(m.slugKey || m.id),
        photoAlt: m.photoAlt || `${m.fullName} — ${m.designation}`,
        displayOrder: m.displayOrder,
        status: (m.status === 'draft' ? 'draft' : 'published') as 'published' | 'draft',
        isFeatured: Boolean(m.isFeatured),
        isActive: Boolean(m.isActive),
      }));

    settings.aboutTeam = mappedTeam;

    const workspace = (settings.cmsWorkspace as { draft?: unknown; published?: unknown } | undefined) || {};
    settings.cmsContent = wantsPreview
      ? (workspace.draft || workspace.published || DEFAULT_CMS_BUNDLE)
      : (workspace.published || DEFAULT_CMS_BUNDLE);

    const activeBanners = bannerRows.filter((b) =>
      wantsPreview ? b.isActive : b.isActive && b.status === 'published'
    );

    res.json({
      settings,
      banners: activeBanners,
      previewDraft: Boolean(wantsPreview),
      categories,
      brands: brandRows,
      featuredProducts,
      bestsellerProducts,
      newArrivalProducts,
      blogs: latestBlogs,
      caseStudies: studies,
      printingMaterials: materials,
      printingMachines: machines,
      publishedPages,
      razorpayConfigured: await isRazorpayConfigured(),
      razorpayMode: await getRazorpayMode(),
      supabaseConfig: getSupabasePublicConfig(),
    });
  } catch (error) {
    console.error('Bootstrap error:', error);
    res.status(500).json({ error: 'Failed to load platform configuration.' });
  }
});

publicRouter.get('/brands', async (_req, res) => {
  try {
    await ensureInitialSeed();
    const items = await db.select().from(brands).where(eq(brands.isActive, true)).orderBy(asc(brands.name));
    res.json({ items });
  } catch {
    res.status(500).json({ error: 'Failed to load brands.' });
  }
});

publicRouter.get('/products', async (req, res) => {
  try {
    await ensureInitialSeed();
    const scope = String(req.query.scope || '').trim();
    const categorySlug = String(req.query.category || '').trim();
    const q = String(req.query.q || '').trim();
    const material = String(req.query.material || '').trim();
    const brand = String(req.query.brand || '').trim();
    const productType = String(req.query.productType || '').trim();
    const inStockOnly = req.query.inStock === 'true';
    const bestsellerOnly = req.query.bestseller === 'true';
    const newArrivalOnly = req.query.newArrival === 'true';
    const minPrice = req.query.minPrice ? Number(req.query.minPrice) : null;
    const maxPrice = req.query.maxPrice ? Number(req.query.maxPrice) : null;
    const saleOnly = req.query.sale === 'true';
    const sort = String(req.query.sort || 'newest');
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(48, Math.max(1, Number(req.query.limit || 12)));

    const conditions = [eq(products.isPublished, true), eq(products.isDeleted, false)];
    if (scope === 'general' || scope === '3d_printed') {
      conditions.push(eq(products.storeScope, scope));
    }
    if (categorySlug) {
      const cat = await db
        .select()
        .from(productCategories)
        .where(eq(productCategories.slug, categorySlug))
        .limit(1);
      if (cat.length > 0) {
        conditions.push(eq(products.categoryId, cat[0].id));
      }
    }
    if (material) {
      conditions.push(ilike(products.material, `%${material}%`));
    }
    if (brand) {
      conditions.push(ilike(products.brand, `%${brand}%`));
    }
    if (productType) {
      conditions.push(eq(products.productType, productType));
    }
    if (inStockOnly) {
      conditions.push(gte(products.stockQty, 1));
    }
    if (bestsellerOnly) {
      conditions.push(eq(products.isBestseller, true));
    }
    if (newArrivalOnly) {
      conditions.push(eq(products.isNewArrival, true));
    }
    if (minPrice !== null && !Number.isNaN(minPrice)) {
      conditions.push(gte(products.priceInr, minPrice));
    }
    if (maxPrice !== null && !Number.isNaN(maxPrice)) {
      conditions.push(lte(products.priceInr, maxPrice));
    }
    if (q) {
      const searchCond = or(
        ilike(products.name, `%${q}%`),
        ilike(products.description, `%${q}%`),
        ilike(products.shortDescription, `%${q}%`),
        ilike(products.sku, `%${q}%`),
        ilike(products.modelNumber, `%${q}%`),
        ilike(products.brand, `%${q}%`)
      );
      if (searchCond) conditions.push(searchCond);
    }

    let orderExpr = desc(products.createdAt);
    if (sort === 'price_asc') orderExpr = asc(products.priceInr);
    if (sort === 'price_desc') orderExpr = desc(products.priceInr);
    if (sort === 'featured') orderExpr = desc(products.isFeatured);
    if (sort === 'bestseller') orderExpr = desc(products.isBestseller);

    const allMatched = await db
      .select()
      .from(products)
      .where(and(...conditions))
      .orderBy(asc(products.sortOrder), orderExpr);

    const visible = allMatched.filter(isProductVisibleToPublic);
    const filtered = saleOnly
      ? visible.filter((p) => p.discountPriceInr !== null && p.discountPriceInr < p.priceInr && p.priceInr > 0)
      : visible;

    const total = filtered.length;
    const offset = (page - 1) * limit;
    const paged = filtered.slice(offset, offset + limit);

    const productIds = paged.map((p) => p.id);
    const reviewRows =
      productIds.length > 0
        ? await db.select().from(productReviews).where(inArray(productReviews.productId, productIds))
        : [];
    const ratingMap = new Map<number, { sum: number; count: number }>();
    for (const r of reviewRows) {
      const curr = ratingMap.get(r.productId) || { sum: 0, count: 0 };
      curr.sum += Number(r.rating || 5);
      curr.count += 1;
      ratingMap.set(r.productId, curr);
    }

    const items = paged.map((p) => {
      const stat = ratingMap.get(p.id);
      return {
        ...p,
        ratingAvg: stat && stat.count > 0 ? Number((stat.sum / stat.count).toFixed(1)) : 0,
        reviewCount: stat?.count || 0,
      };
    });

    res.json({ items, total, page, totalPages: Math.max(1, Math.ceil(total / limit)) });
  } catch (error) {
    console.error('Products list error:', error);
    res.status(500).json({ error: 'Failed to load products.' });
  }
});

publicRouter.get('/products/:slug', async (req, res) => {
  try {
    await ensureInitialSeed();
    const [product] = await db
      .select()
      .from(products)
      .where(and(eq(products.slug, req.params.slug), eq(products.isDeleted, false)))
      .limit(1);

    if (!product || !isProductVisibleToPublic(product)) {
      return res.status(404).json({ error: 'Product not found.' });
    }

    const [reviews, scopeCandidates, manualRelated, manualBoughtTogether] = await Promise.all([
      db
        .select()
        .from(productReviews)
        .where(eq(productReviews.productId, product.id))
        .orderBy(desc(productReviews.createdAt)),
      db
        .select()
        .from(products)
        .where(and(eq(products.isPublished, true), eq(products.isDeleted, false), eq(products.storeScope, product.storeScope)))
        .limit(12),
      Array.isArray(product.relatedProductIds) && product.relatedProductIds.length > 0
        ? db
            .select()
            .from(products)
            .where(and(eq(products.isPublished, true), eq(products.isDeleted, false), inArray(products.id, product.relatedProductIds)))
        : Promise.resolve([]),
      Array.isArray(product.boughtTogetherIds) && product.boughtTogetherIds.length > 0
        ? db
            .select()
            .from(products)
            .where(and(eq(products.isPublished, true), eq(products.isDeleted, false), inArray(products.id, product.boughtTogetherIds)))
        : Promise.resolve([]),
    ]);

    const visibleRelated = manualRelated.filter(isProductVisibleToPublic);
    const visibleCandidates = scopeCandidates.filter(isProductVisibleToPublic);
    const relatedMerged = [
      ...visibleRelated,
      ...visibleCandidates.filter(
        (c) => c.id !== product.id && !visibleRelated.some((m) => m.id === c.id)
      ),
    ].slice(0, 4);

    const visibleBoughtTogether = manualBoughtTogether.filter(isProductVisibleToPublic);
    const boughtTogether =
      visibleBoughtTogether.length > 0
        ? visibleBoughtTogether.filter((b) => b.id !== product.id && b.priceInr > 0 && b.productType !== 'quote_only').slice(0, 3)
        : visibleCandidates
            .filter(
              (c) =>
                c.id !== product.id &&
                c.stockQty > 0 &&
                c.priceInr > 0 &&
                c.productType !== 'quote_only' &&
                !relatedMerged.slice(0, 1).some((r) => r.id === c.id)
            )
            .slice(0, 2);

    const reviewCount = reviews.length;
    const ratingAvg =
      reviewCount > 0
        ? Number((reviews.reduce((s, r) => s + Number(r.rating || 5), 0) / reviewCount).toFixed(1))
        : 0;

    res.json({
      product: { ...product, ratingAvg, reviewCount },
      reviews,
      related: relatedMerged,
      boughtTogether,
    });
  } catch (error) {
    console.error('Product detail error:', error);
    res.status(500).json({ error: 'Failed to load product details.' });
  }
});

// Delivery PIN Code Serviceability & Estimated Dispatch Checker
publicRouter.post('/shipping/check-pin', async (req, res) => {
  try {
    const pinCode = String(req.body.pinCode || '').trim();
    const subtotalInr = Number(req.body.subtotalInr || 0);
    if (!isValidIndianPin(pinCode)) {
      return res.status(400).json({ error: 'Please enter a valid 6-digit Indian PIN code.' });
    }

    const [shippingRow] = await db
      .select()
      .from(siteSettings)
      .where(eq(siteSettings.key, 'shippingConfig'))
      .limit(1);
    const cfg = (shippingRow?.value as { standardShippingInr?: number; freeShippingAboveInr?: number }) || {};
    const standardShippingInr = cfg.standardShippingInr ?? 99;
    const freeShippingAboveInr = cfg.freeShippingAboveInr ?? 2500;

    // Estimate regional transit windows from Nagpur (44xxxx hub)
    const isVidarbhaNagpur = pinCode.startsWith('44');
    const isMaharashtra = pinCode.startsWith('40') || pinCode.startsWith('41') || pinCode.startsWith('42') || pinCode.startsWith('43') || isVidarbhaNagpur;
    const isMetroWestCentral = /^[1-6]/.test(pinCode);

    const estimatedDays = isVidarbhaNagpur
      ? '1–2 business days'
      : isMaharashtra
      ? '2–4 business days'
      : isMetroWestCentral
      ? '4–6 business days'
      : '5–8 business days';

    res.json({
      serviceable: true,
      pinCode,
      originCity: 'Nagpur, Maharashtra (440018)',
      estimatedDays,
      standardShippingInr,
      freeShippingAboveInr,
      qualifiesFreeShipping: subtotalInr >= freeShippingAboveInr,
      shippingFeeInr: subtotalInr >= freeShippingAboveInr ? 0 : standardShippingInr,
    });
  } catch (error) {
    console.error('PIN check error:', error);
    res.status(500).json({ error: 'Unable to check PIN code serviceability.' });
  }
});

// Product / KRASHIVANTRI Quote Request -> Creates CRM Lead + Support Ticket
publicRouter.post('/product-quote-enquiry', requireCloudDatabase, optionalAuth, async (req: AuthRequest, res) => {
  try {
    const b = req.body || {};
    const customerName = String(b.customerName || b.name || req.dbUser?.fullName || '').trim();
    const customerEmail = String(b.customerEmail || b.email || req.dbUser?.email || '').trim();
    const customerPhone = String(b.customerPhone || b.mobile || b.phone || req.dbUser?.mobile || '').trim();
    const productName = String(b.productName || 'Hardware / Drone Enquiry').trim();
    const quantity = Math.max(1, Number(b.quantity || 1));
    const message = String(b.message || '').trim();

    if (!customerName || !customerEmail || !customerPhone) {
      return res.status(400).json({ error: 'Name, email, and mobile number are required.' });
    }

    const ticketNumber = generateCode('NTF-QT');
    const summaryText = `Product: ${productName}${b.sku ? ` (SKU: ${b.sku})` : ''} · Qty: ${quantity}\n${message || 'Customer requested formal technical specs & pricing quote.'}`;

    const [[lead], [ticket]] = await Promise.all([
      db
        .insert(crmLeads)
        .values({
          name: customerName,
          email: customerEmail,
          phone: customerPhone,
          companyOrCollege: String(b.companyOrCollege || '').trim(),
          source: productName.toUpperCase().includes('KRASHIVANTRI') ? 'krashivantri' : 'website',
          stage: 'New Lead',
          summary: summaryText,
        })
        .returning(),
      db
        .insert(supportTickets)
        .values({
          ticketNumber,
          userId: req.dbUser?.id ?? null,
          customerId: req.activeCustomerId || req.dbUser?.customerId || '',
          name: customerName,
          email: customerEmail,
          mobile: customerPhone,
          subject: `Quote Request: ${productName} (Qty ${quantity})`,
          serviceCategory: productName.toUpperCase().includes('KRASHIVANTRI') ? 'KRASHIVANTRI UAV' : 'Product Quote',
          category: 'Product Enquiry',
          priority: 'High',
          message: summaryText,
          status: 'Open',
          messages: [
            {
              sender: customerName,
              role: 'customer',
              text: summaryText,
              timestamp: new Date().toISOString(),
            },
          ],
        })
        .returning(),
    ]);

    notifyAdmins({
      type: 'enquiry',
      entityType: 'support_ticket',
      entityId: ticket.ticketNumber,
      customerId: req.activeCustomerId || req.dbUser?.customerId || '',
      title: `New Quote Enquiry — ${ticket.ticketNumber}`,
      message: `${customerName} requested a quote for ${productName} (Qty ${quantity}).`,
      link: '/admin/enquiries',
    }).catch(() => {});

    res.status(201).json({ ok: true, referenceNumber: ticket.ticketNumber, leadId: lead.id, ticket });
  } catch (error) {
    console.error('Product quote enquiry error:', error);
    res.status(500).json({ error: 'Failed to submit quote request.' });
  }
});

// Structured KRASHIVANTRI / Drone Product Enquiry Endpoint (10 required fields)
publicRouter.post('/product-enquiries', requireCloudDatabase, optionalAuth, async (req: AuthRequest, res) => {
  try {
    const b = req.body || {};
    const fullName = String(b.fullName || b.name || req.dbUser?.fullName || '').trim();
    const mobile = String(b.mobile || b.phone || req.dbUser?.mobile || '').trim();
    const email = String(b.email || req.dbUser?.email || '').trim().toLowerCase();
    const state = String(b.state || '').trim();
    const district = String(b.district || '').trim();
    const organizationOrFarmName = String(b.organizationOrFarmName || b.organization || '').trim();
    const interestedProduct = String(b.interestedProduct || 'KRASHIVANTRI X').trim();
    const quantity = Math.max(1, Math.floor(Number(b.quantity || 1)));
    const intendedApplication = String(b.intendedApplication || 'Precision agricultural crop spraying').trim();
    const message = String(b.message || '').trim();

    if (!fullName || !mobile || !email || !state || !district) {
      return res.status(400).json({
        error: 'Full Name, Mobile Number, Email, State, and District are required.',
      });
    }

    const enquiryNumber = generateCode('NTF-DRN');
    const productSlug = String(
      b.productSlug || (interestedProduct.toUpperCase().includes('PRO') ? 'krashivantri-x-pro' : 'krashivantri-x')
    ).trim();
    const summaryText = `Interested Product: ${interestedProduct} · Qty: ${quantity} · Application: ${intendedApplication} · Org/Farm: ${organizationOrFarmName || 'Individual'} · Location: ${district}, ${state}\n${message}`;

    const [created] = await db
      .insert(productEnquiries)
      .values({
        enquiryNumber,
        userId: req.dbUser?.id ?? null,
        customerId: req.activeCustomerId || req.dbUser?.customerId || '',
        fullName,
        mobile,
        email,
        state,
        district,
        organizationOrFarmName,
        interestedProduct,
        productSlug,
        category: interestedProduct.toUpperCase().includes('KRASHIVANTRI') ? 'Drone Manufacturing' : 'Product Enquiry',
        subject: `Product Enquiry: ${interestedProduct} (Qty ${quantity})`,
        quantity,
        intendedApplication,
        message,
        status: 'New',
      })
      .returning();

    await Promise.all([
      db.insert(crmLeads).values({
        name: fullName,
        email,
        phone: mobile,
        companyOrCollege: organizationOrFarmName || `${district}, ${state}`,
        source: 'krashivantri',
        stage: 'New Lead',
        summary: `[${enquiryNumber}] ${summaryText}`,
      }),
      notifyAdmins({
        type: 'enquiry',
        entityType: 'product_enquiry',
        entityId: enquiryNumber,
        customerId: req.activeCustomerId || req.dbUser?.customerId || '',
        title: `New Drone Enquiry ${enquiryNumber}`,
        message: `${fullName} (${district}, ${state}) enquired for ${interestedProduct} (Qty ${quantity}).`,
        link: '/admin/enquiries',
      }),
      req.dbUser?.id
        ? createNotification({
            userId: req.dbUser.id,
            title: `Drone Enquiry ${enquiryNumber} Received`,
            message: `Our engineering & sales team has logged your enquiry for ${interestedProduct} (Qty ${quantity}).`,
            link: '/my-account',
          })
        : Promise.resolve(),
      dispatchLifecycleEmail({
        userId: req.dbUser?.id ?? null,
        recipientEmail: email,
        eventType: 'product_enquiry_received',
        vars: {
          customerName: fullName,
          fullName,
          enquiryNumber,
          referenceNumber: enquiryNumber,
          interestedProduct,
          quantity,
        },
      }),
    ]);

    syncProductEnquiryToSupabase({
      enquiryNumber,
      userUid: req.dbUser?.uid || '',
      fullName,
      mobile,
      email,
      state,
      district,
      organizationOrFarmName,
      interestedProduct,
      productSlug,
      quantity,
      intendedApplication,
      message,
      status: 'New',
    }).catch(() => {});

    res.status(201).json({ ok: true, enquiryNumber, referenceNumber: enquiryNumber, enquiry: created });
  } catch (error) {
    console.error('Product enquiry error:', error);
    res.status(500).json({ error: 'Failed to submit drone product enquiry.' });
  }
});

publicRouter.post('/coupons/validate', async (req, res) => {
  try {
    const code = String(req.body.code || '').trim().toUpperCase();
    const subtotalInr = Number(req.body.subtotalInr || 0);
    if (!code) return res.status(400).json({ error: 'Coupon code is required.' });

    const [coupon] = await db
      .select()
      .from(coupons)
      .where(and(eq(coupons.code, code), eq(coupons.isActive, true)))
      .limit(1);

    if (!coupon) return res.status(404).json({ error: 'Invalid or inactive coupon code.' });
    if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) {
      return res.status(400).json({ error: 'This coupon has expired.' });
    }
    if (subtotalInr < coupon.minOrderInr) {
      return res.status(400).json({
        error: `Minimum order of ₹${coupon.minOrderInr} required for ${coupon.code}.`,
      });
    }

    const discountInr =
      coupon.discountType === 'percent'
        ? Math.round((subtotalInr * coupon.discountValue) / 100)
        : Math.min(subtotalInr, coupon.discountValue);

    res.json({ valid: true, coupon, discountInr });
  } catch (error) {
    console.error('Coupon validate error:', error);
    res.status(500).json({ error: 'Failed to validate coupon.' });
  }
});

publicRouter.post('/newsletter', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const source = String(req.body.source || 'footer').trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }
    await db
      .insert(newsletterSubscribers)
      .values({ email, source })
      .onConflictDoNothing({ target: newsletterSubscribers.email });
    res.status(201).json({ ok: true, email });
  } catch (error) {
    console.error('Newsletter subscribe error:', error);
    res.status(500).json({ error: 'Failed to subscribe.' });
  }
});

publicRouter.get('/pages/:slug', optionalAuth, async (req: AuthRequest, res) => {
  try {
    const [page] = await db
      .select()
      .from(cmsPages)
      .where(eq(cmsPages.slug, req.params.slug))
      .limit(1);
    if (!page) return res.status(404).json({ error: 'Page not found.' });

    const isAdmin = req.dbUser && ADMIN_ROLES.has(req.dbUser.role);
    const wantsDraft = req.query.preview === 'true' && isAdmin;
    if (page.status !== 'published' && !wantsDraft) {
      return res.status(404).json({ error: 'Page is not published yet.' });
    }
    res.json({
      page,
      content: wantsDraft ? page.draftContent : page.publishedContent || page.draftContent,
      isPreview: Boolean(wantsDraft),
    });
  } catch (error) {
    console.error('Page detail error:', error);
    res.status(500).json({ error: 'Failed to load page.' });
  }
});

publicRouter.get('/blogs', async (_req, res) => {
  try {
    await ensureInitialSeed();
    const rows = await db
      .select()
      .from(blogs)
      .where(eq(blogs.isPublished, true))
      .orderBy(desc(blogs.publishedAt));
    res.json({ items: rows });
  } catch (error) {
    console.error('Blogs error:', error);
    res.status(500).json({ error: 'Failed to load articles.' });
  }
});

publicRouter.get('/blogs/:slug', async (req, res) => {
  try {
    const [blog] = await db
      .select()
      .from(blogs)
      .where(and(eq(blogs.slug, req.params.slug), eq(blogs.isPublished, true)))
      .limit(1);
    if (!blog) return res.status(404).json({ error: 'Article not found.' });
    res.json({ blog });
  } catch (error) {
    console.error('Blog detail error:', error);
    res.status(500).json({ error: 'Failed to load article.' });
  }
});

publicRouter.get('/case-studies', async (_req, res) => {
  try {
    await ensureInitialSeed();
    const rows = await db
      .select()
      .from(caseStudies)
      .where(eq(caseStudies.isPublished, true))
      .orderBy(desc(caseStudies.createdAt));
    res.json({ items: rows });
  } catch (error) {
    console.error('Case studies error:', error);
    res.status(500).json({ error: 'Failed to load projects.' });
  }
});

publicRouter.get('/projects/:slug', async (req, res) => {
  try {
    await ensureInitialSeed();
    const [project] = await db
      .select()
      .from(caseStudies)
      .where(and(eq(caseStudies.slug, req.params.slug), eq(caseStudies.isPublished, true)))
      .limit(1);
    if (!project) return res.status(404).json({ error: 'Project not found.' });
    res.json({ project });
  } catch (error) {
    console.error('Project detail error:', error);
    res.status(500).json({ error: 'Failed to load project details.' });
  }
});

publicRouter.get('/track-order', optionalAuth, async (req: AuthRequest, res) => {
  try {
    const code = String(req.query.code || '').trim().toUpperCase();
    if (!code) {
      return res.status(400).json({ error: 'Please enter an Order Number or Project Code.' });
    }

    const [storeOrder] = await db
      .select()
      .from(storeOrders)
      .where(and(eq(storeOrders.orderNumber, code), eq(storeOrders.isDeleted, false)))
      .limit(1);
    if (storeOrder) {
      return res.json({
        type: 'store_order',
        code: storeOrder.orderNumber,
        status: storeOrder.orderStatus,
        paymentStatus: storeOrder.paymentStatus,
        trackingCourier: storeOrder.trackingCourier,
        trackingId: storeOrder.trackingId,
        trackingUrl: storeOrder.trackingUrl,
        dispatchDate: storeOrder.dispatchDate,
        expectedDeliveryDate: storeOrder.expectedDeliveryDate,
        updatedAt: storeOrder.updatedAt,
      });
    }

    const [printOrder] = await db
      .select()
      .from(printingOrders)
      .where(eq(printingOrders.orderNumber, code))
      .limit(1);
    if (printOrder) {
      return res.json({
        type: 'printing_order',
        code: printOrder.orderNumber,
        status: printOrder.orderStatus,
        slicingStatus: printOrder.slicingStatus,
        paymentStatus: printOrder.paymentStatus,
        trackingCourier: printOrder.trackingCourier,
        trackingId: printOrder.trackingId,
        trackingUrl: printOrder.trackingUrl,
        updatedAt: printOrder.updatedAt,
      });
    }

    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.projectCode, code), eq(projects.isDeleted, false)))
      .limit(1);
    if (project) {
      return res.json({
        type: 'project',
        code: project.projectCode,
        title: project.title,
        status: project.status,
        trackingCourier: project.trackingCourier,
        trackingId: project.trackingId,
        trackingUrl: project.trackingUrl,
        updatedAt: project.updatedAt,
      });
    }

    const [enquiry] = await db
      .select()
      .from(projectEnquiries)
      .where(and(eq(projectEnquiries.enquiryNumber, code), eq(projectEnquiries.isDeleted, false)))
      .limit(1);
    if (enquiry) {
      return res.json({
        type: 'project_enquiry',
        code: enquiry.enquiryNumber,
        title: enquiry.projectTitle,
        status: enquiry.status,
        updatedAt: enquiry.updatedAt,
      });
    }

    return res.status(404).json({ error: `No order or project found matching '${code}'.` });
  } catch (error) {
    console.error('Track order error:', error);
    res.status(500).json({ error: 'Unable to track order right now.' });
  }
});

publicRouter.post('/contact', requireCloudDatabase, optionalAuth, supportUpload.single('attachment'), async (req: AuthRequest, res) => {
  try {
    const { name, email, mobile, subject, serviceCategory, message } = req.body;
    if (!name || !email || !subject || !message) {
      return res.status(400).json({ error: 'Name, email, subject, and message are required.' });
    }

    let attachmentPath = '';
    if (req.file) {
      if (!isSupabaseStorageConfigured()) {
        return res.status(503).json({
          error: 'Supabase Storage is not configured. Configure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to store attachments.',
        });
      }
      const uploaded = await uploadSupportFileToSupabase({
        buffer: req.file.buffer,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype || 'application/octet-stream',
        ownerUid: req.dbUser?.authUserId || req.dbUser?.uid || req.activeCustomerId || 'public',
      });
      attachmentPath = uploaded.storagePath;
    }

    const ticketNumber = generateCode('NTF-TKT');
    const [created] = await db
      .insert(supportTickets)
      .values({
        ticketNumber,
        userId: req.dbUser?.id ?? null,
        customerId: req.activeCustomerId || req.dbUser?.customerId || '',
        name: String(name).trim(),
        email: String(email).trim(),
        mobile: String(mobile || '').trim(),
        subject: String(subject).trim(),
        serviceCategory: String(serviceCategory || 'General').trim(),
        category: String(serviceCategory || 'General Enquiry').trim(),
        message: String(message).trim(),
        attachmentPath,
        status: 'Open',
        messages: [
          {
            sender: String(name).trim(),
            role: 'customer',
            text: String(message).trim(),
            timestamp: new Date().toISOString(),
          },
        ],
      })
      .returning();

    notifyAdmins({
      type: 'enquiry',
      entityType: 'support_ticket',
      entityId: created.ticketNumber,
      customerId: req.activeCustomerId || req.dbUser?.customerId || '',
      title: `New Customer Enquiry — ${created.ticketNumber}`,
      message: `${created.name} (${created.serviceCategory}): ${created.subject}`,
      link: '/admin/enquiries',
    }).catch(() => {});

    syncEnquiryToSupabase({
      ticketNumber,
      userUid: req.dbUser?.uid || '',
      name: created.name,
      email: created.email,
      mobile: created.mobile,
      category: created.serviceCategory,
      subject: created.subject,
      message: created.message,
      status: created.status,
    }).catch(() => {});

    res.status(201).json({ ticket: created });
  } catch (error) {
    console.error('Contact enquiry error:', error);
    res.status(500).json({ error: 'Failed to submit your enquiry.' });
  }
});

// Frictionless Express E-Commerce Checkout (works both for signed-in and guest shoppers)
publicRouter.post('/express-checkout', requireCloudDatabase, optionalAuth, async (req: AuthRequest, res) => {
  try {
    const { items, shippingAddress, billingAddress, couponCode, customerEmail } = req.body || {};
    if (!Array.isArray(items) || items.length === 0 || !shippingAddress) {
      return res.status(400).json({ error: 'Cart items and delivery address are required.' });
    }

    const fullName = String(shippingAddress.fullName || '').trim();
    const mobile = String(shippingAddress.mobile || '').trim();
    const email = String(customerEmail || shippingAddress.email || req.dbUser?.email || '')
      .trim()
      .toLowerCase();

    if (!fullName || !mobile || !shippingAddress.houseFlat || !shippingAddress.streetArea || !shippingAddress.city || !shippingAddress.state || !shippingAddress.pinCode) {
      return res.status(400).json({ error: 'Please complete all required shipping address fields.' });
    }
    if ((shippingAddress.country || 'India') === 'India' && !isValidIndianPin(String(shippingAddress.pinCode))) {
      return res.status(400).json({ error: 'Please enter a valid 6-digit Indian PIN code.' });
    }
    if (!req.dbUser && (!email || !email.includes('@'))) {
      return res.status(400).json({ error: 'Please enter a valid email address for order updates & invoice delivery.' });
    }

    let checkoutUser = req.dbUser || null;
    let sessionToken: string | undefined;

    if (!checkoutUser) {
      const cleanMobile = mobile.replace(/[\s()-]+/g, '').replace(/^(?:\+?91)(?=[6-9]\d{9}$)/, '');
      const existingMatch = await db
        .select()
        .from(users)
        .where(
          and(
            isNull(users.deletedAt),
            sql`lower(${users.email}) = ${email}`
          )
        )
        .limit(1);

      if (existingMatch.length > 0) {
        const matched = existingMatch[0];
        if (!matched.uid.startsWith('guest_')) {
          return res.status(409).json({
            error: 'An account with this email already exists. Please sign in with Email OTP to complete your order.',
          });
        }
        checkoutUser = matched;
      } else {
        const guestUid = `guest_${crypto.randomBytes(8).toString('hex')}`;
        const [createdGuest] = await db
          .insert(users)
          .values({
            uid: guestUid,
            email,
            fullName,
            mobile: cleanMobile,
            companyOrCollege: '',
            role: 'customer',
            accountStatus: 'Active',
            isActive: true,
          })
          .returning();
        checkoutUser = createdGuest;
      }

      await db.insert(customerAddresses).values({
        userId: checkoutUser.id,
        label: 'Express Delivery',
        addressType: 'both',
        fullName,
        mobile,
        houseFlat: String(shippingAddress.houseFlat).trim(),
        streetArea: String(shippingAddress.streetArea).trim(),
        landmark: String(shippingAddress.landmark || '').trim(),
        city: String(shippingAddress.city).trim(),
        district: String(shippingAddress.district || shippingAddress.city).trim(),
        state: String(shippingAddress.state).trim(),
        pinCode: String(shippingAddress.pinCode).trim(),
        country: String(shippingAddress.country || 'India').trim(),
        isDefault: true,
      });

      const ua = String(req.headers['user-agent'] || '');
      const session = await createAdminSession(checkoutUser.id, ua, '', 'customer');
      sessionToken = session.cookieValue;
      const proto = String(req.headers['x-forwarded-proto'] || '').toLowerCase();
      const isHttps = Boolean(req.secure || proto === 'https' || (process.env.APP_URL || '').startsWith('https://'));
      const cookieOpts = {
        httpOnly: true,
        sameSite: (isHttps ? 'none' : 'lax') as 'none' | 'lax',
        secure: isHttps,
        path: '/',
      };
      res.clearCookie('ntf_admin_session', cookieOpts);
      res.cookie(USER_SESSION_COOKIE, session.cookieValue, {
        ...cookieOpts,
        expires: session.expiresAt,
      });
    }

    const order = await db.transaction(async (tx) => {
      let subtotalInr = 0;
      let gstInr = 0;
      const lineItems: Array<{
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
      }> = [];

      for (const reqItem of items) {
        const productId = Number(reqItem.productId);
        const qty = Math.max(1, Math.floor(Number(reqItem.qty || 1)));

        const updatedRows = await tx
          .update(products)
          .set({
            stockQty: sql`${products.stockQty} - ${qty}`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(products.id, productId),
              eq(products.isPublished, true),
              eq(products.isDeleted, false),
              gte(products.stockQty, qty)
            )
          )
          .returning();

        if (updatedRows.length === 0) {
          throw new Error(`Insufficient stock or unavailable product (ID ${productId}).`);
        }

        const prod = updatedRows[0];
        if (prod.productType === 'quote_only' || prod.priceInr <= 0) {
          throw new Error(`"${prod.name}" requires a custom quotation.`);
        }
        const unitPrice =
          prod.discountPriceInr !== null && prod.discountPriceInr < prod.priceInr
            ? prod.discountPriceInr
            : prod.priceInr;
        const lineTotal = unitPrice * qty;
        subtotalInr += lineTotal;
        gstInr += Math.round((lineTotal * prod.gstPercent) / 100);

        lineItems.push({
          productId: prod.id,
          sku: prod.sku,
          hsnCode: prod.hsnCode || (prod.slug.includes('krashivantri') ? '8806' : '8807'),
          name: prod.name,
          imageUrl: prod.imageUrl || '',
          variant: reqItem.variant || undefined,
          color: reqItem.color || undefined,
          qty,
          unitPriceInr: unitPrice,
          gstPercent: prod.gstPercent,
          lineTotalInr: lineTotal,
        });
      }

      const [shippingRow] = await tx
        .select()
        .from(siteSettings)
        .where(eq(siteSettings.key, 'shippingConfig'))
        .limit(1);
      const shippingCfg = (shippingRow?.value as { standardShippingInr?: number; freeShippingAboveInr?: number }) || {};
      const freeThreshold = shippingCfg.freeShippingAboveInr ?? 2500;
      const shippingInr = subtotalInr >= freeThreshold ? 0 : (shippingCfg.standardShippingInr ?? 99);

      let discountInr = 0;
      let appliedCoupon = '';
      if (couponCode) {
        const code = String(couponCode).trim().toUpperCase();
        const [coupon] = await tx
          .select()
          .from(coupons)
          .where(and(eq(coupons.code, code), eq(coupons.isActive, true)))
          .limit(1);
        if (coupon && subtotalInr >= coupon.minOrderInr) {
          appliedCoupon = coupon.code;
          discountInr =
            coupon.discountType === 'percent'
              ? Math.round((subtotalInr * coupon.discountValue) / 100)
              : Math.min(subtotalInr, coupon.discountValue);
        }
      }

      const totalInr = Math.max(1, subtotalInr - discountInr + shippingInr + gstInr);
      const orderNumber = generateCode('NTF-ORD');
      const normalizedShipping = {
        fullName,
        mobile,
        houseFlat: String(shippingAddress.houseFlat).trim(),
        streetArea: String(shippingAddress.streetArea).trim(),
        landmark: String(shippingAddress.landmark || '').trim(),
        city: String(shippingAddress.city).trim(),
        district: String(shippingAddress.district || shippingAddress.city).trim(),
        state: String(shippingAddress.state).trim(),
        pinCode: String(shippingAddress.pinCode).trim(),
        country: String(shippingAddress.country || 'India').trim(),
      };

      const [createdOrder] = await tx
        .insert(storeOrders)
        .values({
          orderNumber,
          userId: checkoutUser!.id,
          customerId: req.activeCustomerId || checkoutUser!.customerId || '',
          billingAddress: billingAddress || normalizedShipping,
          shippingAddress: normalizedShipping,
          items: lineItems,
          subtotalInr,
          discountInr,
          shippingInr,
          gstInr,
          totalInr,
          couponCode: appliedCoupon,
          paymentStatus: 'pending',
          paymentMethod: 'Razorpay',
          orderStatus: 'Order Placed',
          statusHistory: [
            {
              status: 'Order Placed',
              timestamp: new Date().toISOString(),
              note: 'Order created and stock reserved pending payment verification.',
              actor: checkoutUser!.email,
            },
          ],
        })
        .returning();

      return createdOrder;
    });

    await Promise.all([
      createNotification({
        userId: checkoutUser!.id,
        title: `Order ${order.orderNumber} Placed`,
        message: `Total ₹${order.totalInr.toLocaleString('en-IN')}. Complete payment to confirm dispatch.`,
        link: '/my-account',
      }),
      notifyAdmins({
        type: 'order',
        entityType: 'store_order',
        entityId: order.orderNumber,
        customerId: order.customerId || checkoutUser!.customerId || '',
        title: `New Store Order — ${order.orderNumber}`,
        message: `${fullName} placed an order worth ₹${order.totalInr.toLocaleString('en-IN')}.`,
        link: '/admin/store-orders',
      }),
      dispatchLifecycleEmail({
        userId: checkoutUser!.id,
        recipientEmail: checkoutUser!.email,
        eventType: 'store_order_placed',
        vars: {
          customerName: fullName,
          orderNumber: order.orderNumber,
          totalInr: order.totalInr,
        },
      }),
    ]);
    emitAdminStreamEvent({ type: 'order', action: 'created', id: order.orderNumber, summary: `₹${order.totalInr}` });

    syncStoreOrderToSupabase({
      orderNumber: order.orderNumber,
      userUid: checkoutUser!.uid,
      customerEmail: checkoutUser!.email,
      billingAddress: order.billingAddress,
      shippingAddress: order.shippingAddress,
      items: order.items,
      subtotalInr: order.subtotalInr,
      discountInr: order.discountInr,
      shippingInr: order.shippingInr,
      gstInr: order.gstInr,
      totalInr: order.totalInr,
      couponCode: order.couponCode,
      paymentStatus: order.paymentStatus,
      refundStatus: order.refundStatus,
      orderStatus: order.orderStatus,
    }).catch(() => {});

    res.status(201).json({
      order,
      sessionToken,
      user: sessionToken
        ? {
            id: checkoutUser.id,
            uid: checkoutUser.uid,
            email: checkoutUser.email,
            fullName: checkoutUser.fullName,
            mobile: checkoutUser.mobile,
            companyOrCollege: checkoutUser.companyOrCollege,
            role: checkoutUser.role,
            isActive: checkoutUser.isActive,
          }
        : undefined,
    });
  } catch (error: any) {
    console.error('Express checkout error:', error);
    res.status(400).json({ error: error?.message || 'Failed to place express order.' });
  }
});
