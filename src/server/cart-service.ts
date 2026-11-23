import crypto from 'crypto';
import type { Request, Response } from 'express';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { coupons, customerCarts, guestCarts, products, siteSettings } from '../db/schema.ts';
import {
  deleteGuestCartFromSupabase,
  syncCartToSupabase,
  syncGuestCartToSupabase,
} from './supabase-ecommerce.ts';

export const GUEST_CART_COOKIE = 'ntf_guest_cart';

export interface CartItemSnapshot {
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

function getGuestTokenSecret(): string {
  return (
    process.env.SESSION_SECRET ||
    process.env.RAZORPAY_KEY_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    'ntf-guest-cart-hmac-fallback'
  );
}

function hashGuestToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function signGuestToken(rawId: string): string {
  const sig = crypto.createHmac('sha256', getGuestTokenSecret()).update(rawId).digest('hex').slice(0, 24);
  return `${rawId}.${sig}`;
}

function verifyGuestToken(cookieVal: string | undefined): string | null {
  if (!cookieVal) return null;
  const parts = String(cookieVal).split('.');
  if (parts.length !== 2) return null;
  const [rawId, sig] = parts;
  if (!rawId || !sig || rawId.length < 16) return null;
  const expected = crypto.createHmac('sha256', getGuestTokenSecret()).update(rawId).digest('hex').slice(0, 24);
  const a = Buffer.from(sig, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return cookieVal;
}

function parseCookiesMap(header?: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const k = part.slice(0, idx).trim();
    const v = decodeURIComponent(part.slice(idx + 1).trim());
    if (k) out[k] = v;
  }
  return out;
}

function buildGuestCookieOpts(req: Request) {
  const proto = String(req.headers['x-forwarded-proto'] || '').toLowerCase();
  const isHttps = Boolean(
    req.secure || proto === 'https' || (process.env.APP_URL || '').startsWith('https://')
  );
  return {
    httpOnly: true,
    sameSite: (isHttps ? 'none' : 'lax') as 'none' | 'lax',
    secure: isHttps,
    ...(isHttps ? { partitioned: true } : {}),
    path: '/',
  };
}

export function getVerifiedGuestCartToken(req: Request): string | null {
  const cookies = parseCookiesMap(req.headers.cookie);
  return verifyGuestToken(cookies[GUEST_CART_COOKIE]);
}

export function ensureGuestCartCookie(req: Request, res: Response): string {
  const existing = getVerifiedGuestCartToken(req);
  if (existing) return existing;
  const rawId = crypto.randomBytes(24).toString('hex');
  const signed = signGuestToken(rawId);
  const opts = buildGuestCookieOpts(req);
  res.cookie(GUEST_CART_COOKIE, signed, {
    ...opts,
    maxAge: 14 * 24 * 60 * 60 * 1000,
  });
  return signed;
}

export function clearGuestCartCookie(req: Request, res: Response): void {
  const opts = buildGuestCookieOpts(req);
  res.clearCookie(GUEST_CART_COOKIE, opts);
}

export async function enrichCartSnapshot(rawItems: any[]) {
  const safeRaw = Array.isArray(rawItems) ? rawItems.slice(0, 60) : [];
  const productIds = Array.from(
    new Set(
      safeRaw
        .map((it) => Number(it?.productId ?? it?.product?.id ?? 0))
        .filter((id) => Number.isFinite(id) && id > 0)
    )
  );
  const productRows =
    productIds.length > 0
      ? await db
          .select()
          .from(products)
          .where(and(inArray(products.id, productIds), eq(products.isDeleted, false)))
      : [];
  const productMap = new Map(productRows.map((p) => [p.id, p]));

  const snapshot: CartItemSnapshot[] = [];

  for (const it of safeRaw) {
    const pid = Number(it?.productId ?? it?.product?.id ?? 0);
    if (!Number.isFinite(pid) || pid <= 0) continue;
    const prod = productMap.get(pid);
    if (prod && (prod.productType === 'quote_only' || prod.priceInr <= 0)) continue;
    const effectivePrice = prod
      ? prod.discountPriceInr !== null && prod.discountPriceInr < prod.priceInr
        ? prod.discountPriceInr
        : prod.priceInr
      : Math.max(0, Number(it?.unitPriceInr || 0));
    const maxStock = prod ? Math.max(1, prod.stockQty) : Math.max(1, Number(it?.stockQty || 99));
    const variant = it?.variant ? String(it.variant) : undefined;
    const color = it?.color ? String(it.color) : undefined;
    const qty = Math.min(maxStock, Math.max(1, Math.floor(Number(it?.qty || 1))));

    const existingIdx = snapshot.findIndex(
      (s) => s.productId === pid && s.variant === variant && s.color === color
    );
    if (existingIdx >= 0) {
      snapshot[existingIdx].qty = Math.min(maxStock, snapshot[existingIdx].qty + qty);
      continue;
    }

    snapshot.push({
      productId: pid,
      slug: prod?.slug || String(it?.slug || ''),
      sku: prod?.sku || String(it?.sku || ''),
      name: prod?.name || String(it?.name || `Product #${pid}`),
      imageUrl: prod?.imageUrl || String(it?.imageUrl || ''),
      unitPriceInr: effectivePrice,
      gstPercent: prod?.gstPercent ?? Number(it?.gstPercent ?? 18),
      qty,
      variant,
      color,
      stockQty: prod?.stockQty ?? Math.max(0, Number(it?.stockQty || 0)),
    });
  }

  return { snapshot, productMap };
}

export async function hydrateCartItems(rawItems: any[]) {
  const { snapshot, productMap } = await enrichCartSnapshot(rawItems);
  return snapshot.map((s) => {
    const prod = productMap.get(s.productId);
    const product = prod || {
      id: s.productId,
      slug: s.slug || `product-${s.productId}`,
      sku: s.sku,
      hsnCode: '',
      name: s.name,
      category: 'Hardware',
      subCategory: '',
      description: '',
      specs: {},
      priceInr: s.unitPriceInr,
      discountPriceInr: null,
      gstPercent: s.gstPercent,
      stockQty: s.stockQty,
      productType: 'ready_to_buy' as const,
      imageUrl: s.imageUrl,
      galleryImages: [],
      tags: [],
      isPublished: true,
      isFeatured: false,
      ratingAvg: 5,
      reviewCount: 0,
    };
    return {
      product,
      qty: s.qty,
      ...(s.variant ? { variant: s.variant } : {}),
      ...(s.color ? { color: s.color } : {}),
    };
  });
}

export async function computeCartSummary(
  snapshot: CartItemSnapshot[],
  rawCouponCode?: string
): Promise<CartSummary> {
  const subtotalInr = snapshot.reduce((sum, item) => sum + item.unitPriceInr * item.qty, 0);
  const gstInr = snapshot.reduce(
    (sum, item) => sum + Math.round((item.unitPriceInr * item.qty * item.gstPercent) / 100),
    0
  );

  const [shippingRow] = await db
    .select()
    .from(siteSettings)
    .where(eq(siteSettings.key, 'shippingConfig'))
    .limit(1);
  const shippingCfg =
    (shippingRow?.value as { standardShippingInr?: number; freeShippingAboveInr?: number }) || {};
  const freeShippingAboveInr = shippingCfg.freeShippingAboveInr ?? 2500;
  const shippingInr =
    snapshot.length === 0 || subtotalInr === 0
      ? 0
      : subtotalInr >= freeShippingAboveInr
        ? 0
        : (shippingCfg.standardShippingInr ?? 99);

  let discountInr = 0;
  let couponCode = '';
  const candidate = String(rawCouponCode || '').trim().toUpperCase();
  if (candidate && subtotalInr > 0) {
    const [coupon] = await db
      .select()
      .from(coupons)
      .where(and(eq(coupons.code, candidate), eq(coupons.isActive, true)))
      .limit(1);
    if (
      coupon &&
      (!coupon.expiresAt || new Date(coupon.expiresAt) >= new Date()) &&
      subtotalInr >= coupon.minOrderInr
    ) {
      couponCode = coupon.code;
      discountInr =
        coupon.discountType === 'percent'
          ? Math.round((subtotalInr * coupon.discountValue) / 100)
          : Math.min(subtotalInr, coupon.discountValue);
    }
  }

  const grandTotalInr =
    snapshot.length === 0 ? 0 : Math.max(1, subtotalInr - discountInr + shippingInr + gstInr);

  return {
    itemCount: snapshot.reduce((sum, item) => sum + item.qty, 0),
    subtotalInr,
    gstInr,
    discountInr,
    shippingInr,
    freeShippingAboveInr,
    grandTotalInr,
    couponCode,
  };
}

export async function getCustomerCartState(userId: number) {
  const [row] = await db
    .select()
    .from(customerCarts)
    .where(eq(customerCarts.userId, userId))
    .limit(1);
  const { snapshot } = await enrichCartSnapshot(row?.items || []);
  const items = await hydrateCartItems(snapshot);
  const summary = await computeCartSummary(snapshot, row?.couponCode || '');
  return { items, rawItems: snapshot, summary };
}

export async function saveCustomerCartState(params: {
  userId: number;
  userUid: string;
  customerId?: string;
  rawItems: any[];
  couponCode?: string;
}) {
  const { snapshot } = await enrichCartSnapshot(params.rawItems);
  const [existing] = await db
    .select()
    .from(customerCarts)
    .where(eq(customerCarts.userId, params.userId))
    .limit(1);

  const nextCoupon =
    params.couponCode !== undefined
      ? String(params.couponCode || '').trim().toUpperCase()
      : existing?.couponCode || '';

  if (existing) {
    await db
      .update(customerCarts)
      .set({ items: snapshot, couponCode: nextCoupon, updatedAt: new Date() })
      .where(eq(customerCarts.id, existing.id));
  } else {
    await db.insert(customerCarts).values({
      userId: params.userId,
      items: snapshot,
      couponCode: nextCoupon,
    });
  }

  const [items, summary] = await Promise.all([
    hydrateCartItems(snapshot),
    computeCartSummary(snapshot, nextCoupon),
  ]);

  syncCartToSupabase(params.userUid, snapshot, params.customerId, summary).catch(() => {});

  return { items, rawItems: snapshot, summary };
}

export async function getGuestCartState(req: Request) {
  const token = getVerifiedGuestCartToken(req);
  if (!token) {
    return {
      items: [],
      rawItems: [] as CartItemSnapshot[],
      summary: await computeCartSummary([], ''),
      tokenHash: null as string | null,
    };
  }
  const tokenHash = hashGuestToken(token);
  const [row] = await db
    .select()
    .from(guestCarts)
    .where(eq(guestCarts.guestTokenHash, tokenHash))
    .limit(1);

  if (!row || (row.expiresAt && new Date(row.expiresAt) < new Date())) {
    return {
      items: [],
      rawItems: [] as CartItemSnapshot[],
      summary: await computeCartSummary([], ''),
      tokenHash,
    };
  }

  const { snapshot } = await enrichCartSnapshot(row.items || []);
  const items = await hydrateCartItems(snapshot);
  const summary = await computeCartSummary(snapshot, row.couponCode || '');
  return { items, rawItems: snapshot, summary, tokenHash };
}

export async function saveGuestCartState(
  req: Request,
  res: Response,
  rawItems: any[],
  couponCode?: string
) {
  const token = ensureGuestCartCookie(req, res);
  const tokenHash = hashGuestToken(token);
  const { snapshot } = await enrichCartSnapshot(rawItems);
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

  const [existing] = await db
    .select()
    .from(guestCarts)
    .where(eq(guestCarts.guestTokenHash, tokenHash))
    .limit(1);

  const nextCoupon =
    couponCode !== undefined
      ? String(couponCode || '').trim().toUpperCase()
      : existing?.couponCode || '';

  if (existing) {
    await db
      .update(guestCarts)
      .set({ items: snapshot, couponCode: nextCoupon, expiresAt, updatedAt: new Date() })
      .where(eq(guestCarts.id, existing.id));
  } else {
    await db.insert(guestCarts).values({
      guestTokenHash: tokenHash,
      items: snapshot,
      couponCode: nextCoupon,
      expiresAt,
    });
  }

  syncGuestCartToSupabase({
    guestTokenHash: tokenHash,
    items: snapshot,
    couponCode: nextCoupon,
    expiresAt,
  }).catch(() => {});

  const [items, summary] = await Promise.all([
    hydrateCartItems(snapshot),
    computeCartSummary(snapshot, nextCoupon),
  ]);
  return { items, rawItems: snapshot, summary };
}

export async function clearGuestCartState(req: Request, res: Response) {
  const token = getVerifiedGuestCartToken(req);
  if (token) {
    const tokenHash = hashGuestToken(token);
    await db.delete(guestCarts).where(eq(guestCarts.guestTokenHash, tokenHash)).catch(() => {});
    deleteGuestCartFromSupabase(tokenHash).catch(() => {});
  }
  clearGuestCartCookie(req, res);
}

export function mergeSnapshotLists(
  baseList: CartItemSnapshot[],
  incomingList: CartItemSnapshot[]
): CartItemSnapshot[] {
  const merged = [...baseList.map((b) => ({ ...b }))];
  for (const inc of incomingList) {
    const idx = merged.findIndex(
      (m) => m.productId === inc.productId && m.variant === inc.variant && m.color === inc.color
    );
    if (idx >= 0) {
      const cap = Math.max(1, merged[idx].stockQty || inc.stockQty || 99);
      merged[idx].qty = Math.min(cap, merged[idx].qty + inc.qty);
    } else {
      merged.push({ ...inc });
    }
  }
  return merged;
}

export async function mergeGuestCartIntoCustomer(params: {
  req: Request;
  res: Response;
  userId: number;
  userUid: string;
  customerId?: string;
  extraItems?: any[];
}) {
  const [customerRow] = await db
    .select()
    .from(customerCarts)
    .where(eq(customerCarts.userId, params.userId))
    .limit(1);

  const guestToken = getVerifiedGuestCartToken(params.req);
  let guestRaw: any[] = [];
  let guestCoupon = '';
  if (guestToken) {
    const tokenHash = hashGuestToken(guestToken);
    const [gRow] = await db
      .select()
      .from(guestCarts)
      .where(eq(guestCarts.guestTokenHash, tokenHash))
      .limit(1);
    if (gRow && (!gRow.expiresAt || new Date(gRow.expiresAt) >= new Date())) {
      guestRaw = gRow.items || [];
      guestCoupon = gRow.couponCode || '';
    }
    await db.delete(guestCarts).where(eq(guestCarts.guestTokenHash, tokenHash)).catch(() => {});
    deleteGuestCartFromSupabase(tokenHash).catch(() => {});
    clearGuestCartCookie(params.req, params.res);
  }

  const { snapshot: existingSnap } = await enrichCartSnapshot(customerRow?.items || []);
  const { snapshot: guestSnap } = await enrichCartSnapshot(guestRaw);
  const { snapshot: extraSnap } = await enrichCartSnapshot(params.extraItems || []);

  // Avoid double-counting if caller passed extraItems that mirror guestSnap
  const incomingSnap = guestSnap.length > 0 ? guestSnap : extraSnap;
  const mergedSnap = mergeSnapshotLists(existingSnap, incomingSnap);
  const couponCode = customerRow?.couponCode || guestCoupon || '';

  return saveCustomerCartState({
    userId: params.userId,
    userUid: params.userUid,
    customerId: params.customerId,
    rawItems: mergedSnap,
    couponCode,
  });
}
