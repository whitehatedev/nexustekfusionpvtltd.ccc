import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { Router } from 'express';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import {
  bookingAssignments,
  bookingStatusHistory,
  dronePilots,
  farmerDocuments,
  farmerFarms,
  farmerPayments,
  farmerRefunds,
  farmers,
  farmerVerifications,
  invoices,
  operationEvidence,
  operationSessions,
  operationVerifications,
  paymentReceipts,
  payments,
  penalties,
  penaltyAppeals,
  pilotAvailability,
  pilotBankAccounts,
  pilotDocuments,
  pilotDrones,
  pilotEarningLedger,
  pilotLocationUpdates,
  pilotPayouts,
  pilotVerifications,
  serviceBookings,
  siteSettings,
  users,
} from '../../db/schema.ts';
import { ADMIN_ROLES, AuthRequest, requireAdmin, requireAuth, requireCloudDatabase } from '../../middleware/auth.ts';
import {
  downloadFromSupabaseStorage,
  isSupabaseStorageConfigured,
  uploadPrivateBufferToSupabaseStorage,
} from '../../lib/supabase-admin.ts';
import { createRazorpayOrder, encryptSecret, verifyRazorpaySignature } from '../razorpay.ts';
import {
  createMemoryUploadMiddleware,
  createNotification,
  generateCode,
  haversineDistanceMeters,
  isPointInPolygon,
  logAudit,
  maskAccountNumber,
  UPLOADS_ROOT,
} from '../utils.ts';
import {
  assignAndroidOrderPilot,
  fetchAndroidKrashivantriSnapshot,
  syncWebBookingToSupabase,
  syncWebFarmBoundaryToSupabase,
  syncWebFarmerToSupabase,
  syncWebPilotToSupabase,
  updateAndroidOrderStatus,
  verifyAndroidPilotLicense,
} from '../supabase-krashivantri.ts';

export const krashivantriRouter = Router();

krashivantriRouter.use((req, res, next) => {
  if (req.path.startsWith('/admin') && !req.path.startsWith('/admin/krashivantri')) {
    return next();
  }
  return requireCloudDatabase(req, res, next);
});

const kycUpload = createMemoryUploadMiddleware(['.png', '.jpg', '.jpeg', '.webp', '.pdf'], 20);
const evidenceUpload = createMemoryUploadMiddleware(
  ['.png', '.jpg', '.jpeg', '.webp', '.mp4', '.mov', '.webm'],
  60
);

interface KrashiOpsConfig {
  baseRatePerAcreInr: number;
  minimumBookingAcres: number;
  platformCommissionPercent: number;
  gpsStaleThresholdMinutes: number;
  arrivalGeofenceMeters: number;
  pilotResponseTimeoutMinutes: number;
  cancellationBeforeDispatchRefundPercent: number;
  lateArrivalPenaltyInr: number;
}

const DEFAULT_OPS_CONFIG: KrashiOpsConfig = {
  baseRatePerAcreInr: 500,
  minimumBookingAcres: 1,
  platformCommissionPercent: 15,
  gpsStaleThresholdMinutes: 10,
  arrivalGeofenceMeters: 250,
  pilotResponseTimeoutMinutes: 30,
  cancellationBeforeDispatchRefundPercent: 100,
  lateArrivalPenaltyInr: 200,
};

async function getOpsConfig(): Promise<KrashiOpsConfig> {
  try {
    const [row] = await db
      .select()
      .from(siteSettings)
      .where(eq(siteSettings.key, 'krashivantriOpsConfig'))
      .limit(1);
    if (row?.value && typeof row.value === 'object') {
      return { ...DEFAULT_OPS_CONFIG, ...(row.value as Partial<KrashiOpsConfig>) };
    }
  } catch {
    // default
  }
  return DEFAULT_OPS_CONFIG;
}

function toCsv(headers: string[], rows: Array<Array<string | number | boolean | null | undefined>>): string {
  const esc = (v: unknown) => {
    const s = String(v ?? '');
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.map(esc).join(','), ...rows.map((r) => r.map(esc).join(','))].join('\n');
}

function sanitizeBankAccount<T extends { accountNumberEnc?: string }>(acc: T): Omit<T, 'accountNumberEnc'> {
  const { accountNumberEnc: _enc, ...rest } = acc;
  return rest;
}

function computeGpsFreshness(lastLocationAt: Date | string | null | undefined, staleMinutes: number) {
  if (!lastLocationAt) {
    return { gpsStalenessSeconds: null as number | null, isStale: true, gpsAvailable: false };
  }
  const ts = new Date(lastLocationAt).getTime();
  if (Number.isNaN(ts)) {
    return { gpsStalenessSeconds: null as number | null, isStale: true, gpsAvailable: false };
  }
  const sec = Math.max(0, Math.round((Date.now() - ts) / 1000));
  return {
    gpsStalenessSeconds: sec,
    isStale: sec > staleMinutes * 60,
    gpsAvailable: true,
  };
}

// ============================================================================
// PUBLIC / SHARED KRASHIVANTRI CONFIG
// ============================================================================
krashivantriRouter.get('/krashivantri/ops-config', async (_req, res) => {
  const config = await getOpsConfig();
  res.json({ config });
});

krashivantriRouter.get('/krashivantri/android-operators', async (_req, res) => {
  try {
    const snap = await fetchAndroidKrashivantriSnapshot();
    res.json({
      configured: snap.configured,
      operatorLocations: snap.operatorLocations,
      farmBoundaries: snap.farmBoundaries,
    });
  } catch {
    res.json({ configured: false, operatorLocations: [], farmBoundaries: [] });
  }
});

// ============================================================================
// FARMER REGISTRATION, FARMS, BOOKINGS, PAYMENT & LIVE TRACKING
// ============================================================================
krashivantriRouter.post('/farmer/register', requireAuth, async (req: AuthRequest, res) => {
  try {
    const b = req.body;
    const fullName = String(b.fullName || req.dbUser!.fullName || '').trim();
    const mobile = String(b.mobile || req.dbUser!.mobile || '').trim();
    const district = String(b.district || '').trim();
    if (!fullName || !mobile || !district) {
      return res.status(400).json({ error: 'Full name, mobile number, and district are required.' });
    }

    const existing = await db
      .select()
      .from(farmers)
      .where(eq(farmers.userId, req.dbUser!.id))
      .limit(1);

    if (existing.length > 0) {
      const [updated] = await db
        .update(farmers)
        .set({
          fullName,
          mobile,
          email: String(b.email || req.dbUser!.email).trim(),
          village: String(b.village || existing[0].village).trim(),
          taluka: String(b.taluka || existing[0].taluka).trim(),
          district,
          state: String(b.state || existing[0].state || 'Maharashtra').trim(),
          pinCode: String(b.pinCode || existing[0].pinCode).trim(),
          aadhaarLast4: String(b.aadhaarLast4 || existing[0].aadhaarLast4).replace(/\D/g, '').slice(-4),
          totalLandAcres: b.totalLandAcres !== undefined ? Number(b.totalLandAcres) : existing[0].totalLandAcres,
          cropsGrown: String(b.cropsGrown ?? existing[0].cropsGrown).trim(),
          kycStatus: existing[0].kycStatus === 'Approved' ? 'Approved' : 'Pending Review',
          updatedAt: new Date(),
        })
        .where(eq(farmers.id, existing[0].id))
        .returning();
      return res.json({ farmer: updated });
    }

    const [created] = await db
      .insert(farmers)
      .values({
        userId: req.dbUser!.id,
        farmerCode: generateCode('NTF-FRM'),
        fullName,
        mobile,
        email: String(b.email || req.dbUser!.email).trim(),
        village: String(b.village || '').trim(),
        taluka: String(b.taluka || '').trim(),
        district,
        state: String(b.state || 'Maharashtra').trim(),
        pinCode: String(b.pinCode || '').trim(),
        aadhaarLast4: String(b.aadhaarLast4 || '').replace(/\D/g, '').slice(-4),
        totalLandAcres: Number(b.totalLandAcres || 0),
        cropsGrown: String(b.cropsGrown || '').trim(),
        kycStatus: 'Pending Review',
        accountStatus: 'active',
      })
      .returning();

    syncWebFarmerToSupabase({
      webUserUid: req.dbUser!.uid,
      phone: created.mobile,
      fullName: created.fullName,
      farmerCode: created.farmerCode,
    });

    res.status(201).json({ farmer: created });
  } catch (error: any) {
    console.error('Farmer register error:', error);
    res.status(500).json({ error: error?.message || 'Failed to register farmer profile.' });
  }
});

krashivantriRouter.post(
  '/farmer/documents',
  requireAuth,
  kycUpload.single('file'),
  async (req: AuthRequest, res) => {
    try {
      const [farmer] = await db.select().from(farmers).where(eq(farmers.userId, req.dbUser!.id)).limit(1);
      if (!farmer) return res.status(400).json({ error: 'Register farmer profile first.' });
      if (!req.file) return res.status(400).json({ error: 'Document file is required.' });
      if (!isSupabaseStorageConfigured()) {
        return res.status(503).json({
          error: 'Supabase Storage is not configured. Configure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to store KYC documents.',
        });
      }

      const uploaded = await uploadPrivateBufferToSupabaseStorage({
        bucket: 'customer-uploads',
        buffer: req.file.buffer,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype || 'application/octet-stream',
        ownerPrefix: req.dbUser!.authUserId || req.dbUser!.uid || farmer.farmerCode,
        folder: 'krashivantri-kyc',
      });

      const docType = String(req.body.docType || 'Aadhaar').trim();
      const docNumberMasked = String(req.body.docNumberMasked || '').trim();
      const [doc] = await db
        .insert(farmerDocuments)
        .values({
          farmerId: farmer.id,
          docType,
          docNumberMasked,
          fileName: req.file.originalname,
          storagePath: uploaded.storagePath,
          verificationStatus: 'Pending',
          notes: String(req.body.notes || ''),
        })
        .returning();

      res.status(201).json({ document: doc });
    } catch (error: any) {
      res.status(400).json({ error: error?.message || 'Failed to upload farmer KYC document.' });
    }
  }
);

krashivantriRouter.get('/farmer/me', requireAuth, async (req: AuthRequest, res) => {
  try {
    const opsConfig = await getOpsConfig();
    const [farmer] = await db.select().from(farmers).where(eq(farmers.userId, req.dbUser!.id)).limit(1);
    if (!farmer) {
      return res.json({
        farmer: null,
        documents: [],
        farms: [],
        bookings: [],
        payments: [],
        refunds: [],
        penalties: [],
        sessions: [],
        opsConfig,
      });
    }

    const [docs, farms, bookings, payRows, allRefunds, penaltyRows, allSessions, allPilots] = await Promise.all([
      db.select().from(farmerDocuments).where(eq(farmerDocuments.farmerId, farmer.id)).orderBy(desc(farmerDocuments.createdAt)),
      db.select().from(farmerFarms).where(eq(farmerFarms.farmerId, farmer.id)).orderBy(desc(farmerFarms.createdAt)),
      db.select().from(serviceBookings).where(eq(serviceBookings.farmerId, farmer.id)).orderBy(desc(serviceBookings.createdAt)),
      db.select().from(farmerPayments).where(eq(farmerPayments.farmerId, farmer.id)).orderBy(desc(farmerPayments.createdAt)),
      db.select().from(farmerRefunds).orderBy(desc(farmerRefunds.createdAt)),
      db.select().from(penalties).where(and(eq(penalties.targetType, 'farmer'), eq(penalties.targetId, farmer.id))).orderBy(desc(penalties.createdAt)),
      db.select().from(operationSessions).where(eq(operationSessions.farmerId, farmer.id)).orderBy(desc(operationSessions.createdAt)),
      db.select().from(dronePilots),
    ]);

    const bookingIds = new Set(bookings.map((b) => b.id));
    const refunds = allRefunds.filter((r) => bookingIds.has(r.bookingId));
    const pilotById = Object.fromEntries(
      allPilots.map((p) => [p.id, { id: p.id, pilotCode: p.pilotCode, fullName: p.fullName, mobile: p.mobile }])
    );

    const enrichedBookings = bookings.map((b) => ({
      ...b,
      assignedPilot: b.assignedPilotId ? pilotById[b.assignedPilotId] || null : null,
      session: allSessions.find((s) => s.bookingId === b.id) || null,
    }));

    res.json({
      farmer,
      documents: docs,
      farms,
      bookings: enrichedBookings,
      payments: payRows,
      refunds,
      penalties: penaltyRows,
      sessions: allSessions,
      opsConfig,
    });
  } catch (error) {
    console.error('Farmer me error:', error);
    res.status(500).json({ error: 'Failed to load farmer portal.' });
  }
});

krashivantriRouter.post('/farmer/farms', requireAuth, async (req: AuthRequest, res) => {
  try {
    const [farmer] = await db.select().from(farmers).where(eq(farmers.userId, req.dbUser!.id)).limit(1);
    if (!farmer) return res.status(400).json({ error: 'Register farmer profile first.' });

    const b = req.body;
    const centerLat = Number(b.centerLat);
    const centerLng = Number(b.centerLng);
    if (!b.farmName || Number.isNaN(centerLat) || Number.isNaN(centerLng)) {
      return res.status(400).json({ error: 'Farm name and valid latitude/longitude coordinates are required.' });
    }

    const boundary = Array.isArray(b.boundaryGeoJson)
      ? b.boundaryGeoJson
          .map((pt: any) => ({ lat: Number(pt.lat), lng: Number(pt.lng) }))
          .filter((pt: { lat: number; lng: number }) => !Number.isNaN(pt.lat) && !Number.isNaN(pt.lng))
      : [];

    const [created] = await db
      .insert(farmerFarms)
      .values({
        farmerId: farmer.id,
        farmName: String(b.farmName).trim(),
        cropType: String(b.cropType || '').trim(),
        areaAcres: Math.max(0.25, Number(b.areaAcres || 1)),
        village: String(b.village || farmer.village).trim(),
        district: String(b.district || farmer.district).trim(),
        state: String(b.state || farmer.state || 'Maharashtra').trim(),
        pinCode: String(b.pinCode || farmer.pinCode).trim(),
        centerLat,
        centerLng,
        boundaryGeoJson: boundary,
        isActive: true,
      })
      .returning();

    syncWebFarmBoundaryToSupabase({
      farmerUidOrPhone: farmer.mobile || req.dbUser!.uid,
      farmName: created.farmName,
      polygon: boundary,
      areaAcres: created.areaAcres,
      centerLat,
      centerLng,
    });

    res.status(201).json({ farm: created });
  } catch (error: any) {
    res.status(400).json({ error: error?.message || 'Failed to register farm plot.' });
  }
});

krashivantriRouter.post('/farmer/bookings', requireAuth, async (req: AuthRequest, res) => {
  try {
    const [farmer] = await db.select().from(farmers).where(eq(farmers.userId, req.dbUser!.id)).limit(1);
    if (!farmer) return res.status(400).json({ error: 'Register farmer profile before creating bookings.' });
    if (farmer.kycStatus !== 'Approved' || farmer.accountStatus !== 'active') {
      return res.status(403).json({
        error: `Farmer KYC status is "${farmer.kycStatus}". Admin verification approval is required before scheduling spraying.`,
      });
    }

    const ops = await getOpsConfig();
    const b = req.body;
    const bookedAreaAcres = Number(b.bookedAreaAcres || 0);
    if (bookedAreaAcres < ops.minimumBookingAcres) {
      return res.status(400).json({ error: `Minimum spray area is ${ops.minimumBookingAcres} acre(s).` });
    }

    let farmLat = Number(b.farmLat);
    let farmLng = Number(b.farmLng);
    let farmBoundary: Array<{ lat: number; lng: number }> = Array.isArray(b.farmBoundary) ? b.farmBoundary : [];
    const farmId = b.farmId ? Number(b.farmId) : null;

    if (farmId) {
      const [farm] = await db
        .select()
        .from(farmerFarms)
        .where(and(eq(farmerFarms.id, farmId), eq(farmerFarms.farmerId, farmer.id)))
        .limit(1);
      if (farm) {
        farmLat = farm.centerLat;
        farmLng = farm.centerLng;
        farmBoundary = farm.boundaryGeoJson || [];
      }
    }

    if (Number.isNaN(farmLat) || Number.isNaN(farmLng)) {
      return res.status(400).json({ error: 'Valid farm location coordinates are required.' });
    }

    const ratePerAcreInr = ops.baseRatePerAcreInr;
    const totalAmountInr = Math.max(1, Math.round(bookedAreaAcres * ratePerAcreInr));
    const totalAmountPaise = Math.round(totalAmountInr * 100);
    const commission = Math.round((totalAmountInr * ops.platformCommissionPercent) / 100);
    const pilotPayoutInr = Math.max(0, totalAmountInr - commission);

    const [created] = await db
      .insert(serviceBookings)
      .values({
        bookingNumber: generateCode('NTF-KRB'),
        farmerId: farmer.id,
        farmId,
        cropType: String(b.cropType || 'Crop Spraying').trim(),
        sprayType: String(b.sprayType || 'Fertilizer & Pesticide Spraying').trim(),
        chemicalProvidedBy: String(b.chemicalProvidedBy || 'Farmer').trim(),
        bookedAreaAcres,
        ratePerAcreInr,
        totalAmountInr,
        totalAmountPaise,
        platformCommissionPercent: ops.platformCommissionPercent,
        pilotPayoutInr,
        preferredDate: String(b.preferredDate || new Date().toISOString().slice(0, 10)),
        preferredSlot: String(b.preferredSlot || 'Morning (6 AM - 10 AM)'),
        farmLat,
        farmLng,
        farmBoundary,
        bookingStatus: 'Payment Pending',
        paymentStatus: 'pending',
        farmerNotes: String(b.farmerNotes || '').trim(),
      })
      .returning();

    await db.insert(bookingStatusHistory).values({
      bookingId: created.id,
      status: 'Payment Pending',
      actorEmail: req.dbUser!.email,
      note: `Booked ${bookedAreaAcres} acres at ₹${ratePerAcreInr}/acre (Total ₹${totalAmountInr}).`,
    });

    syncWebBookingToSupabase({
      bookingNumber: created.bookingNumber,
      farmerUid: req.dbUser!.uid,
      farmerPhone: farmer.mobile,
      farmerName: farmer.fullName,
      polygon: farmBoundary,
      acresToSpray: bookedAreaAcres,
      locationAddress: [farmer.village, farmer.district, farmer.state].filter(Boolean).join(', ') || 'Nagpur, Maharashtra',
      totalAmount: totalAmountInr,
      adminCommission: commission,
      pilotEarnings: pilotPayoutInr,
      paymentStatus: 'pending',
      orderStatus: 'pending',
      fieldCenterLat: farmLat,
      fieldCenterLng: farmLng,
    });

    res.status(201).json({ booking: created });
  } catch (error: any) {
    console.error('Create farmer booking error:', error);
    res.status(500).json({ error: error?.message || 'Failed to create spraying booking.' });
  }
});

krashivantriRouter.post('/farmer/bookings/:id/pay/create-order', requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const [farmer] = await db.select().from(farmers).where(eq(farmers.userId, req.dbUser!.id)).limit(1);
    if (!farmer) return res.status(403).json({ error: 'Farmer account not found.' });

    const [booking] = await db
      .select()
      .from(serviceBookings)
      .where(and(eq(serviceBookings.id, id), eq(serviceBookings.farmerId, farmer.id)))
      .limit(1);
    if (!booking) return res.status(404).json({ error: 'Booking not found.' });
    if (booking.paymentStatus === 'paid') return res.status(400).json({ error: 'Booking already paid.' });

    const rzp = await createRazorpayOrder({
      amountInr: booking.totalAmountInr,
      receipt: booking.bookingNumber,
      notes: { entityType: 'farmer_booking', bookingId: String(booking.id), farmerId: String(farmer.id) },
    });

    res.json({
      ...rzp,
      amountInr: booking.totalAmountInr,
      receipt: booking.bookingNumber,
      customer: {
        name: farmer.fullName,
        email: farmer.email || req.dbUser!.email,
        contact: farmer.mobile,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Failed to initiate booking payment.' });
  }
});

krashivantriRouter.post('/farmer/bookings/:id/pay/verify', requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;
    const [farmer] = await db.select().from(farmers).where(eq(farmers.userId, req.dbUser!.id)).limit(1);
    if (!farmer) return res.status(403).json({ error: 'Farmer account not found.' });

    const [booking] = await db
      .select()
      .from(serviceBookings)
      .where(and(eq(serviceBookings.id, id), eq(serviceBookings.farmerId, farmer.id)))
      .limit(1);
    if (!booking) return res.status(404).json({ error: 'Booking not found.' });

    const paymentIdToVerify = razorpayPaymentId || `pay_test_${crypto.randomBytes(6).toString('hex')}`;
    const signatureToVerify = razorpaySignature || 'test_sig';
    const valid = await verifyRazorpaySignature({
      razorpayOrderId: String(razorpayOrderId),
      razorpayPaymentId: paymentIdToVerify,
      razorpaySignature: signatureToVerify,
    });
    if (!valid) return res.status(400).json({ error: 'Payment signature verification failed.' });

    const dup = await db
      .select()
      .from(farmerPayments)
      .where(eq(farmerPayments.razorpayPaymentId, paymentIdToVerify))
      .limit(1);
    if (dup.length > 0) return res.json({ verified: true, payment: dup[0], duplicate: true });

    const mode = paymentIdToVerify.startsWith('pay_test_') ? 'test_mode' : 'live_razorpay';
    const paymentRef = generateCode('NTF-PAY');

    const [fp] = await db
      .insert(farmerPayments)
      .values({
        paymentRef,
        bookingId: booking.id,
        farmerId: farmer.id,
        userId: req.dbUser!.id,
        amountInr: booking.totalAmountInr,
        amountPaise: booking.totalAmountPaise || Math.round(booking.totalAmountInr * 100),
        razorpayOrderId: String(razorpayOrderId),
        razorpayPaymentId: paymentIdToVerify,
        razorpaySignature: signatureToVerify,
        mode,
        status: 'verified',
      })
      .returning();

    await db.insert(payments).values({
      paymentRef,
      userId: req.dbUser!.id,
      entityType: 'farmer_booking',
      entityId: booking.id,
      paymentStage: 'spraying',
      razorpayOrderId: String(razorpayOrderId),
      razorpayPaymentId: paymentIdToVerify,
      razorpaySignature: signatureToVerify,
      amountInr: booking.totalAmountInr,
      amountPaise: Math.round(booking.totalAmountInr * 100),
      mode,
      status: 'verified',
      verifiedAt: new Date(),
    });

    await db.insert(paymentReceipts).values({
      receiptNumber: generateCode('NTF-RCP'),
      paymentRef,
      userId: req.dbUser!.id,
      entityType: 'farmer_booking',
      entityId: booking.id,
      paymentStage: 'spraying',
      amountInr: booking.totalAmountInr,
      amountPaise: Math.round(booking.totalAmountInr * 100),
      razorpayPaymentId: paymentIdToVerify,
      payload: { bookingNumber: booking.bookingNumber, cropType: booking.cropType, bookedAreaAcres: booking.bookedAreaAcres },
    });

    await db.insert(invoices).values({
      invoiceNumber: generateCode('NTF-INV'),
      userId: req.dbUser!.id,
      entityType: 'farmer_booking',
      entityId: booking.id,
      docType: 'KRASHIVANTRI Spraying Receipt',
      amountInr: booking.totalAmountInr,
      gstInr: 0,
      payload: { bookingNumber: booking.bookingNumber, farmerCode: farmer.farmerCode, bookedAreaAcres: booking.bookedAreaAcres },
    });

    const [updatedBooking] = await db
      .update(serviceBookings)
      .set({
        paymentStatus: 'paid',
        bookingStatus: booking.assignedPilotId ? booking.bookingStatus : 'Paid - Awaiting Pilot',
        updatedAt: new Date(),
      })
      .where(eq(serviceBookings.id, booking.id))
      .returning();

    await db.insert(bookingStatusHistory).values({
      bookingId: booking.id,
      status: updatedBooking.bookingStatus,
      actorEmail: req.dbUser!.email,
      note: `Verified payment ₹${booking.totalAmountInr} (${paymentRef}). Ready for pilot dispatch.`,
    });

    syncWebBookingToSupabase({
      bookingNumber: booking.bookingNumber,
      farmerUid: req.dbUser!.uid,
      farmerPhone: farmer.mobile,
      farmerName: farmer.fullName,
      polygon: booking.farmBoundary || [],
      acresToSpray: booking.bookedAreaAcres,
      locationAddress: [farmer.village, farmer.district, farmer.state].filter(Boolean).join(', ') || 'Maharashtra',
      totalAmount: booking.totalAmountInr,
      adminCommission: Math.max(0, booking.totalAmountInr - booking.pilotPayoutInr),
      pilotEarnings: booking.pilotPayoutInr,
      paymentStatus: 'paid',
      orderStatus: booking.assignedPilotId ? 'accepted' : 'pending',
      fieldCenterLat: booking.farmLat,
      fieldCenterLng: booking.farmLng,
      razorpayPaymentId: paymentIdToVerify,
    });

    res.json({ verified: true, booking: updatedBooking, payment: fp });
  } catch (error: any) {
    console.error('Farmer payment verify error:', error);
    res.status(500).json({ error: error?.message || 'Failed to verify booking payment.' });
  }
});

krashivantriRouter.post('/farmer/bookings/:id/confirm-completion', requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const { action, reason } = req.body; // confirm | dispute
    const [farmer] = await db.select().from(farmers).where(eq(farmers.userId, req.dbUser!.id)).limit(1);
    if (!farmer) return res.status(403).json({ error: 'Farmer account not found.' });

    const [booking] = await db
      .select()
      .from(serviceBookings)
      .where(and(eq(serviceBookings.id, id), eq(serviceBookings.farmerId, farmer.id)))
      .limit(1);
    if (!booking) return res.status(404).json({ error: 'Booking not found.' });

    const [session] = await db
      .select()
      .from(operationSessions)
      .where(eq(operationSessions.bookingId, booking.id))
      .limit(1);
    if (!session) return res.status(400).json({ error: 'No operation session recorded for this booking yet.' });

    if (action === 'dispute' && !String(reason || '').trim()) {
      return res.status(400).json({ error: 'Please provide a clear reason when raising a dispute.' });
    }

    const isConfirm = action !== 'dispute';
    const [updatedSession] = await db
      .update(operationSessions)
      .set({
        farmerConfirmed: isConfirm,
        farmerDisputeReason: isConfirm ? '' : String(reason).trim(),
        farmerConfirmedAt: new Date(),
        status: isConfirm ? session.status : 'Disputed',
      })
      .where(eq(operationSessions.id, session.id))
      .returning();

    const nextStatus = isConfirm ? 'Verification Pending' : 'Disputed';
    const [updatedBooking] = await db
      .update(serviceBookings)
      .set({ bookingStatus: nextStatus, updatedAt: new Date() })
      .where(eq(serviceBookings.id, booking.id))
      .returning();

    await db.insert(bookingStatusHistory).values({
      bookingId: booking.id,
      status: nextStatus,
      actorEmail: req.dbUser!.email,
      note: isConfirm ? 'Farmer confirmed spraying completion.' : `Farmer raised dispute: ${String(reason).trim()}`,
    });

    res.json({ booking: updatedBooking, session: updatedSession });
  } catch {
    res.status(500).json({ error: 'Failed to submit completion confirmation.' });
  }
});

krashivantriRouter.get('/farmer/bookings/:id/live-tracking', requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const [farmer] = await db.select().from(farmers).where(eq(farmers.userId, req.dbUser!.id)).limit(1);
    if (!farmer) return res.status(403).json({ error: 'Farmer profile not found.' });

    const [booking] = await db
      .select()
      .from(serviceBookings)
      .where(and(eq(serviceBookings.id, id), eq(serviceBookings.farmerId, farmer.id)))
      .limit(1);
    if (!booking) return res.status(404).json({ error: 'Booking not found.' });

    const ops = await getOpsConfig();
    let pilotSummary: any = null;
    let availability: any = null;
    if (booking.assignedPilotId) {
      const [[pilot], [avail]] = await Promise.all([
        db.select().from(dronePilots).where(eq(dronePilots.id, booking.assignedPilotId)).limit(1),
        db.select().from(pilotAvailability).where(eq(pilotAvailability.pilotId, booking.assignedPilotId)).limit(1),
      ]);
      if (pilot) {
        pilotSummary = {
          id: pilot.id,
          pilotCode: pilot.pilotCode,
          fullName: pilot.fullName,
          mobile: pilot.mobile,
        };
      }
      if (avail) {
        const freshness = computeGpsFreshness(avail.lastLocationAt, ops.gpsStaleThresholdMinutes);
        availability = { ...avail, ...freshness };
      }
    }

    const [sessions, evidence, history] = await Promise.all([
      db.select().from(operationSessions).where(eq(operationSessions.bookingId, booking.id)),
      db.select().from(operationEvidence).where(eq(operationEvidence.bookingId, booking.id)).orderBy(desc(operationEvidence.capturedAt)),
      db.select().from(bookingStatusHistory).where(eq(bookingStatusHistory.bookingId, booking.id)).orderBy(desc(bookingStatusHistory.createdAt)),
    ]);

    res.json({
      booking,
      pilot: pilotSummary,
      pilotLocation: availability,
      session: sessions[0] || null,
      evidence,
      history,
      gpsStaleThresholdMinutes: ops.gpsStaleThresholdMinutes,
    });
  } catch (error) {
    console.error('Live tracking fetch error:', error);
    res.status(500).json({ error: 'Failed to load live tracking data.' });
  }
});

// ============================================================================
// DRONE PILOT REGISTRATION, REAL GPS STREAM, SPRAY OPERATIONS, PAYOUTS & APPEALS
// ============================================================================
krashivantriRouter.post('/pilot/register', requireAuth, async (req: AuthRequest, res) => {
  try {
    const b = req.body;
    const fullName = String(b.fullName || req.dbUser!.fullName || '').trim();
    const mobile = String(b.mobile || req.dbUser!.mobile || '').trim();
    const district = String(b.district || '').trim();
    if (!fullName || !mobile || !district) {
      return res.status(400).json({ error: 'Pilot full name, mobile number, and operating district are required.' });
    }

    const existing = await db.select().from(dronePilots).where(eq(dronePilots.userId, req.dbUser!.id)).limit(1);
    if (existing.length > 0) {
      const [updated] = await db
        .update(dronePilots)
        .set({
          fullName,
          mobile,
          email: String(b.email || req.dbUser!.email).trim(),
          city: String(b.city || existing[0].city).trim(),
          district,
          state: String(b.state || existing[0].state || 'Maharashtra').trim(),
          pinCode: String(b.pinCode || existing[0].pinCode).trim(),
          rpcNumber: String(b.rpcNumber || existing[0].rpcNumber).trim(),
          rpcValidUntil: String(b.rpcValidUntil || existing[0].rpcValidUntil).trim(),
          serviceRadiusKm: Math.max(5, Number(b.serviceRadiusKm || existing[0].serviceRadiusKm || 35)),
          kycStatus: existing[0].kycStatus === 'Approved' ? 'Approved' : 'Pending Review',
          updatedAt: new Date(),
        })
        .where(eq(dronePilots.id, existing[0].id))
        .returning();
      return res.json({ pilot: updated });
    }

    const [created] = await db
      .insert(dronePilots)
      .values({
        userId: req.dbUser!.id,
        pilotCode: generateCode('NTF-PLT'),
        fullName,
        mobile,
        email: String(b.email || req.dbUser!.email).trim(),
        city: String(b.city || '').trim(),
        district,
        state: String(b.state || 'Maharashtra').trim(),
        pinCode: String(b.pinCode || '').trim(),
        rpcNumber: String(b.rpcNumber || '').trim(),
        rpcValidUntil: String(b.rpcValidUntil || '').trim(),
        serviceRadiusKm: Math.max(5, Number(b.serviceRadiusKm || 35)),
        kycStatus: 'Pending Review',
        accountStatus: 'active',
      })
      .returning();

    await db.insert(pilotAvailability).values({
      pilotId: created.id,
      isOnline: false,
      gpsPermissionGranted: false,
      status: 'offline',
    });

    syncWebPilotToSupabase({
      webUserUid: req.dbUser!.uid,
      phone: created.mobile,
      fullName: created.fullName,
      isLicenseVerified: false,
      isOnline: false,
    });

    res.status(201).json({ pilot: created });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Failed to register drone pilot.' });
  }
});

krashivantriRouter.post(
  '/pilot/documents',
  requireAuth,
  kycUpload.single('file'),
  async (req: AuthRequest, res) => {
    try {
      const [pilot] = await db.select().from(dronePilots).where(eq(dronePilots.userId, req.dbUser!.id)).limit(1);
      if (!pilot) return res.status(400).json({ error: 'Register drone pilot profile first.' });
      if (!req.file) return res.status(400).json({ error: 'Document file is required.' });
      if (!isSupabaseStorageConfigured()) {
        return res.status(503).json({
          error: 'Supabase Storage is not configured. Configure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to store pilot KYC documents.',
        });
      }

      const uploaded = await uploadPrivateBufferToSupabaseStorage({
        bucket: 'customer-uploads',
        buffer: req.file.buffer,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype || 'application/octet-stream',
        ownerPrefix: req.dbUser!.authUserId || req.dbUser!.uid || pilot.pilotCode,
        folder: 'krashivantri-pilot-kyc',
      });

      const [doc] = await db
        .insert(pilotDocuments)
        .values({
          pilotId: pilot.id,
          docType: String(req.body.docType || 'DGCA RPC').trim(),
          docNumberMasked: String(req.body.docNumberMasked || '').trim(),
          fileName: req.file.originalname,
          storagePath: uploaded.storagePath,
          verificationStatus: 'Pending',
          notes: String(req.body.notes || ''),
        })
        .returning();

      res.status(201).json({ document: doc });
    } catch (error: any) {
      res.status(400).json({ error: error?.message || 'Failed to upload pilot KYC document.' });
    }
  }
);

krashivantriRouter.post('/pilot/drones', requireAuth, async (req: AuthRequest, res) => {
  try {
    const [pilot] = await db.select().from(dronePilots).where(eq(dronePilots.userId, req.dbUser!.id)).limit(1);
    if (!pilot) return res.status(400).json({ error: 'Register drone pilot profile first.' });

    const { droneModel, uinNumber, tankCapacityLiters, sprayWidthMeters } = req.body;
    if (!droneModel || !uinNumber) {
      return res.status(400).json({ error: 'Drone model and DGCA UIN number are required.' });
    }

    const [created] = await db
      .insert(pilotDrones)
      .values({
        pilotId: pilot.id,
        droneModel: String(droneModel).trim(),
        uinNumber: String(uinNumber).trim().toUpperCase(),
        tankCapacityLiters: Number(tankCapacityLiters || 10),
        sprayWidthMeters: Number(sprayWidthMeters || 4),
        verificationStatus: 'Pending',
        isActive: true,
      })
      .returning();

    res.status(201).json({ drone: created });
  } catch (error: any) {
    res.status(400).json({ error: error?.message || 'Failed to register drone.' });
  }
});

krashivantriRouter.post('/pilot/bank-account', requireAuth, async (req: AuthRequest, res) => {
  try {
    const [pilot] = await db.select().from(dronePilots).where(eq(dronePilots.userId, req.dbUser!.id)).limit(1);
    if (!pilot) return res.status(400).json({ error: 'Register drone pilot profile first.' });

    const { accountHolderName, bankName, accountNumber, ifscCode, upiId } = req.body;
    if (!accountHolderName || !bankName || !accountNumber || !ifscCode) {
      return res.status(400).json({ error: 'Account holder name, bank name, account number, and IFSC code are required.' });
    }

    const cleanAcc = String(accountNumber).replace(/\s+/g, '');
    const masked = maskAccountNumber(cleanAcc);
    const enc = encryptSecret(cleanAcc);

    const [created] = await db
      .insert(pilotBankAccounts)
      .values({
        pilotId: pilot.id,
        accountHolderName: String(accountHolderName).trim(),
        bankName: String(bankName).trim(),
        accountNumberMasked: masked,
        accountNumberEnc: enc,
        ifscCode: String(ifscCode).trim().toUpperCase(),
        upiId: String(upiId || '').trim(),
        verificationStatus: 'Pending',
        isPrimary: true,
      })
      .returning();

    res.status(201).json({ bankAccount: sanitizeBankAccount(created) });
  } catch (error: any) {
    res.status(400).json({ error: error?.message || 'Failed to save bank account.' });
  }
});

krashivantriRouter.get('/pilot/me', requireAuth, async (req: AuthRequest, res) => {
  try {
    const ops = await getOpsConfig();
    const [pilot] = await db.select().from(dronePilots).where(eq(dronePilots.userId, req.dbUser!.id)).limit(1);
    if (!pilot) {
      return res.json({
        pilot: null,
        documents: [],
        drones: [],
        bankAccounts: [],
        availability: null,
        bookings: [],
        sessions: [],
        evidence: [],
        earningsLedger: [],
        payouts: [],
        penalties: [],
        appeals: [],
        opsConfig: ops,
      });
    }

    const [docs, drones, banks, availRows, bookings, sessions, evidence, ledger, payouts, penaltyRows, appeals, allFarmers] =
      await Promise.all([
        db.select().from(pilotDocuments).where(eq(pilotDocuments.pilotId, pilot.id)).orderBy(desc(pilotDocuments.createdAt)),
        db.select().from(pilotDrones).where(eq(pilotDrones.pilotId, pilot.id)).orderBy(desc(pilotDrones.createdAt)),
        db.select().from(pilotBankAccounts).where(eq(pilotBankAccounts.pilotId, pilot.id)).orderBy(desc(pilotBankAccounts.createdAt)),
        db.select().from(pilotAvailability).where(eq(pilotAvailability.pilotId, pilot.id)).limit(1),
        db.select().from(serviceBookings).where(eq(serviceBookings.assignedPilotId, pilot.id)).orderBy(desc(serviceBookings.createdAt)),
        db.select().from(operationSessions).where(eq(operationSessions.pilotId, pilot.id)).orderBy(desc(operationSessions.createdAt)),
        db.select().from(operationEvidence).where(eq(operationEvidence.pilotId, pilot.id)).orderBy(desc(operationEvidence.capturedAt)),
        db.select().from(pilotEarningLedger).where(eq(pilotEarningLedger.pilotId, pilot.id)).orderBy(desc(pilotEarningLedger.createdAt)),
        db.select().from(pilotPayouts).where(eq(pilotPayouts.pilotId, pilot.id)).orderBy(desc(pilotPayouts.createdAt)),
        db.select().from(penalties).where(and(eq(penalties.targetType, 'pilot'), eq(penalties.targetId, pilot.id))).orderBy(desc(penalties.createdAt)),
        db.select().from(penaltyAppeals).where(eq(penaltyAppeals.appellantUserId, req.dbUser!.id)).orderBy(desc(penaltyAppeals.createdAt)),
        db.select().from(farmers),
      ]);

    const farmerById = Object.fromEntries(
      allFarmers.map((f) => [f.id, { id: f.id, farmerCode: f.farmerCode, fullName: f.fullName, mobile: f.mobile, village: f.village, district: f.district }])
    );
    const enrichedBookings = bookings.map((b) => ({
      ...b,
      farmer: farmerById[b.farmerId] || null,
      session: sessions.find((s) => s.bookingId === b.id) || null,
    }));

    const avail = availRows[0] || null;
    const freshness = computeGpsFreshness(avail?.lastLocationAt, ops.gpsStaleThresholdMinutes);

    res.json({
      pilot,
      documents: docs,
      drones,
      bankAccounts: banks.map(sanitizeBankAccount),
      availability: avail ? { ...avail, ...freshness } : null,
      bookings: enrichedBookings,
      sessions,
      evidence,
      earningsLedger: ledger,
      payouts,
      penalties: penaltyRows,
      appeals,
      opsConfig: ops,
    });
  } catch (error) {
    console.error('Pilot me error:', error);
    res.status(500).json({ error: 'Failed to load pilot portal.' });
  }
});

krashivantriRouter.post('/pilot/availability', requireAuth, async (req: AuthRequest, res) => {
  try {
    const [pilot] = await db.select().from(dronePilots).where(eq(dronePilots.userId, req.dbUser!.id)).limit(1);
    if (!pilot) return res.status(400).json({ error: 'Pilot profile not found.' });
    if (pilot.kycStatus !== 'Approved' || pilot.accountStatus !== 'active') {
      return res.status(403).json({
        error: `Pilot account status is "${pilot.kycStatus}". Admin approval is required before going online.`,
      });
    }

    const isOnline = Boolean(req.body.isOnline);
    const gpsPermissionGranted = req.body.gpsPermissionGranted !== undefined ? Boolean(req.body.gpsPermissionGranted) : undefined;

    const existing = await db.select().from(pilotAvailability).where(eq(pilotAvailability.pilotId, pilot.id)).limit(1);
    if (existing.length === 0) {
      const [created] = await db
        .insert(pilotAvailability)
        .values({
          pilotId: pilot.id,
          isOnline,
          gpsPermissionGranted: Boolean(gpsPermissionGranted),
          status: isOnline ? 'available' : 'offline',
        })
        .returning();
      return res.json({ availability: created });
    }

    const [updated] = await db
      .update(pilotAvailability)
      .set({
        isOnline,
        gpsPermissionGranted: gpsPermissionGranted ?? existing[0].gpsPermissionGranted,
        status: isOnline ? (existing[0].status === 'offline' ? 'available' : existing[0].status) : 'offline',
        updatedAt: new Date(),
      })
      .where(eq(pilotAvailability.pilotId, pilot.id))
      .returning();

    syncWebPilotToSupabase({
      webUserUid: req.dbUser!.uid,
      phone: pilot.mobile,
      fullName: pilot.fullName,
      isOnline,
    });

    res.json({ availability: updated });
  } catch {
    res.status(500).json({ error: 'Failed to update pilot availability.' });
  }
});

krashivantriRouter.post('/pilot/location', requireAuth, async (req: AuthRequest, res) => {
  try {
    const [pilot] = await db.select().from(dronePilots).where(eq(dronePilots.userId, req.dbUser!.id)).limit(1);
    if (!pilot) return res.status(403).json({ error: 'Pilot profile not found.' });

    const latitude = Number(req.body.latitude);
    const longitude = Number(req.body.longitude);
    if (
      Number.isNaN(latitude) ||
      Number.isNaN(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      return res.status(400).json({ error: 'Valid GPS latitude (-90..90) and longitude (-180..180) are required.' });
    }

    const bookingId = req.body.bookingId ? Number(req.body.bookingId) : null;
    const sessionId = req.body.sessionId ? Number(req.body.sessionId) : null;
    const accuracyMeters = req.body.accuracyMeters !== undefined ? Number(req.body.accuracyMeters) : null;
    const speedMps = req.body.speedMps !== undefined ? Number(req.body.speedMps) : null;
    const headingDeg = req.body.headingDeg !== undefined ? Number(req.body.headingDeg) : null;
    const batteryPercent = req.body.batteryPercent !== undefined ? Math.round(Number(req.body.batteryPercent)) : null;
    const source = String(req.body.source || 'browser_gps');
    const now = new Date();

    const [loc] = await db
      .insert(pilotLocationUpdates)
      .values({
        pilotId: pilot.id,
        bookingId,
        sessionId,
        latitude,
        longitude,
        accuracyMeters,
        speedMps,
        headingDeg,
        source,
        recordedAt: now,
      })
      .returning();

    const existingAvail = await db.select().from(pilotAvailability).where(eq(pilotAvailability.pilotId, pilot.id)).limit(1);
    if (existingAvail.length === 0) {
      await db.insert(pilotAvailability).values({
        pilotId: pilot.id,
        isOnline: true,
        gpsPermissionGranted: true,
        currentLat: latitude,
        currentLng: longitude,
        accuracyMeters,
        speedMps,
        headingDeg,
        batteryPercent,
        lastLocationAt: now,
        status: 'available',
        updatedAt: now,
      });
    } else {
      await db
        .update(pilotAvailability)
        .set({
          gpsPermissionGranted: true,
          currentLat: latitude,
          currentLng: longitude,
          accuracyMeters,
          speedMps,
          headingDeg,
          batteryPercent,
          lastLocationAt: now,
          updatedAt: now,
        })
        .where(eq(pilotAvailability.pilotId, pilot.id));
    }

    let geofence: { insideGeofence: boolean; distanceMeters: number } | null = null;
    if (bookingId) {
      const [booking] = await db.select().from(serviceBookings).where(eq(serviceBookings.id, bookingId)).limit(1);
      if (booking) {
        const ops = await getOpsConfig();
        const dist = haversineDistanceMeters(latitude, longitude, booking.farmLat, booking.farmLng);
        const insidePoly =
          Array.isArray(booking.farmBoundary) && booking.farmBoundary.length >= 3
            ? isPointInPolygon(latitude, longitude, booking.farmBoundary)
            : false;
        geofence = {
          insideGeofence: insidePoly || dist <= ops.arrivalGeofenceMeters,
          distanceMeters: Math.round(dist),
        };
      }
    }

    syncWebPilotToSupabase({
      webUserUid: req.dbUser!.uid,
      phone: pilot.mobile,
      fullName: pilot.fullName,
      isOnline: true,
      lat: latitude,
      lng: longitude,
      headingDeg,
    });

    res.json({ ok: true, location: loc, geofence });
  } catch (error) {
    console.error('Pilot location update error:', error);
    res.status(500).json({ error: 'Failed to record pilot GPS location.' });
  }
});

krashivantriRouter.post('/pilot/bookings/:id/respond', requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const { action, rejectionReason } = req.body; // accept | reject
    const [pilot] = await db.select().from(dronePilots).where(eq(dronePilots.userId, req.dbUser!.id)).limit(1);
    if (!pilot) return res.status(403).json({ error: 'Pilot profile not found.' });

    const [booking] = await db
      .select()
      .from(serviceBookings)
      .where(and(eq(serviceBookings.id, id), eq(serviceBookings.assignedPilotId, pilot.id)))
      .limit(1);
    if (!booking) return res.status(404).json({ error: 'Assigned booking not found.' });

    if (action === 'reject' && !String(rejectionReason || '').trim()) {
      return res.status(400).json({ error: 'A clear rejection reason is required when rejecting an assignment.' });
    }

    const assignments = await db
      .select()
      .from(bookingAssignments)
      .where(and(eq(bookingAssignments.bookingId, booking.id), eq(bookingAssignments.pilotId, pilot.id)))
      .orderBy(desc(bookingAssignments.assignedAt));
    if (assignments[0]) {
      await db
        .update(bookingAssignments)
        .set({
          assignmentStatus: action === 'accept' ? 'Accepted' : 'Rejected',
          rejectionReason: action === 'reject' ? String(rejectionReason).trim() : '',
          respondedAt: new Date(),
        })
        .where(eq(bookingAssignments.id, assignments[0].id));
    }

    const nextBookingStatus = action === 'accept' ? 'Pilot Accepted' : 'Paid - Awaiting Pilot';
    const [updated] = await db
      .update(serviceBookings)
      .set({
        bookingStatus: nextBookingStatus,
        assignedPilotId: action === 'accept' ? pilot.id : null,
        updatedAt: new Date(),
      })
      .where(eq(serviceBookings.id, booking.id))
      .returning();

    await db.insert(bookingStatusHistory).values({
      bookingId: booking.id,
      status: nextBookingStatus,
      actorEmail: req.dbUser!.email,
      note:
        action === 'accept'
          ? `Pilot ${pilot.pilotCode} accepted mission.`
          : `Pilot ${pilot.pilotCode} rejected mission: ${String(rejectionReason).trim()}`,
    });

    if (action === 'accept') {
      await db
        .update(pilotAvailability)
        .set({ status: 'assigned', updatedAt: new Date() })
        .where(eq(pilotAvailability.pilotId, pilot.id));
    }

    const [farmer] = await db.select().from(farmers).where(eq(farmers.id, booking.farmerId)).limit(1);
    if (farmer) {
      const [farmerUser] = farmer.userId
        ? await db.select().from(users).where(eq(users.id, farmer.userId)).limit(1)
        : [undefined];
      syncWebBookingToSupabase({
        bookingNumber: booking.bookingNumber,
        farmerUid: farmerUser?.uid || String(farmer.id),
        farmerPhone: farmer.mobile,
        farmerName: farmer.fullName,
        assignedPilotUid: action === 'accept' ? req.dbUser!.uid : null,
        assignedPilotPhone: action === 'accept' ? pilot.mobile : null,
        polygon: booking.farmBoundary || [],
        acresToSpray: booking.bookedAreaAcres,
        locationAddress: [farmer.village, farmer.district, farmer.state].filter(Boolean).join(', ') || 'Maharashtra',
        totalAmount: booking.totalAmountInr,
        adminCommission: Math.max(0, booking.totalAmountInr - booking.pilotPayoutInr),
        pilotEarnings: booking.pilotPayoutInr,
        paymentStatus: booking.paymentStatus === 'paid' ? 'paid' : 'pending',
        orderStatus: action === 'accept' ? 'accepted' : 'pending',
        fieldCenterLat: booking.farmLat,
        fieldCenterLng: booking.farmLng,
      });
    }

    res.json({ booking: updated });
  } catch {
    res.status(500).json({ error: 'Failed to respond to mission assignment.' });
  }
});

krashivantriRouter.post('/pilot/bookings/:id/status', requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const nextStatus = String(req.body.status || '').trim();
    if (!['En Route', 'Arrived at Farm'].includes(nextStatus)) {
      return res.status(400).json({ error: 'Status must be "En Route" or "Arrived at Farm".' });
    }

    const [pilot] = await db.select().from(dronePilots).where(eq(dronePilots.userId, req.dbUser!.id)).limit(1);
    if (!pilot) return res.status(403).json({ error: 'Pilot profile not found.' });

    const [booking] = await db
      .select()
      .from(serviceBookings)
      .where(and(eq(serviceBookings.id, id), eq(serviceBookings.assignedPilotId, pilot.id)))
      .limit(1);
    if (!booking) return res.status(404).json({ error: 'Assigned booking not found.' });

    const [updated] = await db
      .update(serviceBookings)
      .set({ bookingStatus: nextStatus, updatedAt: new Date() })
      .where(eq(serviceBookings.id, booking.id))
      .returning();

    await db
      .update(pilotAvailability)
      .set({ status: nextStatus === 'En Route' ? 'en_route' : 'arrived', updatedAt: new Date() })
      .where(eq(pilotAvailability.pilotId, pilot.id));

    await db.insert(bookingStatusHistory).values({
      bookingId: booking.id,
      status: nextStatus,
      actorEmail: req.dbUser!.email,
      note: `Pilot status updated to ${nextStatus}.`,
    });

    res.json({ booking: updated });
  } catch {
    res.status(500).json({ error: 'Failed to update mission transit status.' });
  }
});

krashivantriRouter.post('/pilot/operations/:bookingId/start', requireAuth, async (req: AuthRequest, res) => {
  try {
    const bookingId = Number(req.params.bookingId);
    const [pilot] = await db.select().from(dronePilots).where(eq(dronePilots.userId, req.dbUser!.id)).limit(1);
    if (!pilot) return res.status(403).json({ error: 'Pilot profile not found.' });

    const [booking] = await db
      .select()
      .from(serviceBookings)
      .where(and(eq(serviceBookings.id, bookingId), eq(serviceBookings.assignedPilotId, pilot.id)))
      .limit(1);
    if (!booking) return res.status(404).json({ error: 'Assigned booking not found.' });

    const ops = await getOpsConfig();
    const [avail] = await db.select().from(pilotAvailability).where(eq(pilotAvailability.pilotId, pilot.id)).limit(1);
    const freshness = computeGpsFreshness(avail?.lastLocationAt, ops.gpsStaleThresholdMinutes);

    let insideGeofenceOnStart = false;
    let geofenceDistanceMeters = 0;
    if (avail?.currentLat != null && avail?.currentLng != null && !freshness.isStale) {
      geofenceDistanceMeters = Math.round(
        haversineDistanceMeters(avail.currentLat, avail.currentLng, booking.farmLat, booking.farmLng)
      );
      const insidePoly =
        Array.isArray(booking.farmBoundary) && booking.farmBoundary.length >= 3
          ? isPointInPolygon(avail.currentLat, avail.currentLng, booking.farmBoundary)
          : false;
      insideGeofenceOnStart = insidePoly || geofenceDistanceMeters <= ops.arrivalGeofenceMeters;
    }

    const existing = await db.select().from(operationSessions).where(eq(operationSessions.bookingId, booking.id)).limit(1);
    let session: any;
    if (existing.length > 0) {
      const [upd] = await db
        .update(operationSessions)
        .set({
          status: 'Active',
          startedAt: existing[0].startedAt || new Date(),
          insideGeofenceOnStart,
          geofenceDistanceMeters,
        })
        .where(eq(operationSessions.id, existing[0].id))
        .returning();
      session = upd;
    } else {
      const [created] = await db
        .insert(operationSessions)
        .values({
          sessionCode: generateCode('NTF-OPS'),
          bookingId: booking.id,
          pilotId: pilot.id,
          farmerId: booking.farmerId,
          farmId: booking.farmId,
          status: 'Active',
          startedAt: new Date(),
          insideGeofenceOnStart,
          geofenceDistanceMeters,
          pilotNotes: String(req.body.notes || ''),
        })
        .returning();
      session = created;
    }

    await db
      .update(serviceBookings)
      .set({ bookingStatus: 'Spraying Active', updatedAt: new Date() })
      .where(eq(serviceBookings.id, booking.id));

    await db
      .update(pilotAvailability)
      .set({ status: 'spraying', updatedAt: new Date() })
      .where(eq(pilotAvailability.pilotId, pilot.id));

    await db.insert(bookingStatusHistory).values({
      bookingId: booking.id,
      status: 'Spraying Active',
      actorEmail: req.dbUser!.email,
      note: `Operation ${session.sessionCode} started. Geofence match: ${insideGeofenceOnStart ? 'Inside' : 'Outside/Unverified'} (${geofenceDistanceMeters}m).`,
    });

    const [farmer] = await db.select().from(farmers).where(eq(farmers.id, booking.farmerId)).limit(1);
    if (farmer) {
      const [farmerUser] = farmer.userId
        ? await db.select().from(users).where(eq(users.id, farmer.userId)).limit(1)
        : [undefined];
      syncWebBookingToSupabase({
        bookingNumber: booking.bookingNumber,
        farmerUid: farmerUser?.uid || String(farmer.id),
        farmerPhone: farmer.mobile,
        farmerName: farmer.fullName,
        assignedPilotUid: req.dbUser!.uid,
        assignedPilotPhone: pilot.mobile,
        polygon: booking.farmBoundary || [],
        acresToSpray: booking.bookedAreaAcres,
        locationAddress: [farmer.village, farmer.district, farmer.state].filter(Boolean).join(', ') || 'Maharashtra',
        totalAmount: booking.totalAmountInr,
        adminCommission: Math.max(0, booking.totalAmountInr - booking.pilotPayoutInr),
        pilotEarnings: booking.pilotPayoutInr,
        paymentStatus: booking.paymentStatus === 'paid' ? 'paid' : 'pending',
        orderStatus: 'in_progress',
        fieldCenterLat: booking.farmLat,
        fieldCenterLng: booking.farmLng,
      });
    }

    res.json({ session });
  } catch (error) {
    console.error('Operation start error:', error);
    res.status(500).json({ error: 'Failed to start spraying operation.' });
  }
});

krashivantriRouter.post('/pilot/operations/:bookingId/pause', requireAuth, async (req: AuthRequest, res) => {
  try {
    const bookingId = Number(req.params.bookingId);
    const pauseReason = String(req.body.pauseReason || '').trim();
    if (!pauseReason) return res.status(400).json({ error: 'A pause reason is required (e.g. battery swap, wind speed).' });

    const [pilot] = await db.select().from(dronePilots).where(eq(dronePilots.userId, req.dbUser!.id)).limit(1);
    if (!pilot) return res.status(403).json({ error: 'Pilot profile not found.' });

    const [session] = await db
      .select()
      .from(operationSessions)
      .where(and(eq(operationSessions.bookingId, bookingId), eq(operationSessions.pilotId, pilot.id)))
      .limit(1);
    if (!session) return res.status(404).json({ error: 'Active operation session not found.' });

    const [updated] = await db
      .update(operationSessions)
      .set({ status: 'Paused', pausedAt: new Date(), pauseReason })
      .where(eq(operationSessions.id, session.id))
      .returning();

    await db.update(serviceBookings).set({ bookingStatus: 'Spraying Paused', updatedAt: new Date() }).where(eq(serviceBookings.id, bookingId));
    await db.insert(bookingStatusHistory).values({
      bookingId,
      status: 'Spraying Paused',
      actorEmail: req.dbUser!.email,
      note: `Operation paused: ${pauseReason}`,
    });

    res.json({ session: updated });
  } catch {
    res.status(500).json({ error: 'Failed to pause operation.' });
  }
});

krashivantriRouter.post('/pilot/operations/:bookingId/resume', requireAuth, async (req: AuthRequest, res) => {
  try {
    const bookingId = Number(req.params.bookingId);
    const [pilot] = await db.select().from(dronePilots).where(eq(dronePilots.userId, req.dbUser!.id)).limit(1);
    if (!pilot) return res.status(403).json({ error: 'Pilot profile not found.' });

    const [session] = await db
      .select()
      .from(operationSessions)
      .where(and(eq(operationSessions.bookingId, bookingId), eq(operationSessions.pilotId, pilot.id)))
      .limit(1);
    if (!session) return res.status(404).json({ error: 'Operation session not found.' });

    const [updated] = await db
      .update(operationSessions)
      .set({ status: 'Active', resumedAt: new Date() })
      .where(eq(operationSessions.id, session.id))
      .returning();

    await db.update(serviceBookings).set({ bookingStatus: 'Spraying Active', updatedAt: new Date() }).where(eq(serviceBookings.id, bookingId));
    await db.insert(bookingStatusHistory).values({
      bookingId,
      status: 'Spraying Active',
      actorEmail: req.dbUser!.email,
      note: 'Operation resumed by pilot.',
    });

    res.json({ session: updated });
  } catch {
    res.status(500).json({ error: 'Failed to resume operation.' });
  }
});

krashivantriRouter.post('/pilot/operations/:bookingId/complete', requireAuth, async (req: AuthRequest, res) => {
  try {
    const bookingId = Number(req.params.bookingId);
    const completedAreaAcres = Number(req.body.completedAreaAcres || 0);
    if (completedAreaAcres <= 0) {
      return res.status(400).json({ error: 'Completed sprayed area (acres) must be greater than 0.' });
    }

    const [pilot] = await db.select().from(dronePilots).where(eq(dronePilots.userId, req.dbUser!.id)).limit(1);
    if (!pilot) return res.status(403).json({ error: 'Pilot profile not found.' });

    const [session] = await db
      .select()
      .from(operationSessions)
      .where(and(eq(operationSessions.bookingId, bookingId), eq(operationSessions.pilotId, pilot.id)))
      .limit(1);
    if (!session) return res.status(404).json({ error: 'Operation session not found.' });

    const [updated] = await db
      .update(operationSessions)
      .set({
        status: 'Completed',
        completedAt: new Date(),
        completedAreaAcres,
        pilotNotes: String(req.body.notes || session.pilotNotes || ''),
      })
      .where(eq(operationSessions.id, session.id))
      .returning();

    await db
      .update(serviceBookings)
      .set({ bookingStatus: 'Spraying Completed', updatedAt: new Date() })
      .where(eq(serviceBookings.id, bookingId));

    await db
      .update(pilotAvailability)
      .set({ status: 'available', updatedAt: new Date() })
      .where(eq(pilotAvailability.pilotId, pilot.id));

    await db.insert(bookingStatusHistory).values({
      bookingId,
      status: 'Spraying Completed',
      actorEmail: req.dbUser!.email,
      note: `Pilot completed spraying (${completedAreaAcres} acres logged). Awaiting farmer confirmation & admin verification.`,
    });

    const [booking] = await db.select().from(serviceBookings).where(eq(serviceBookings.id, bookingId)).limit(1);
    if (booking) {
      const [farmer] = await db.select().from(farmers).where(eq(farmers.id, booking.farmerId)).limit(1);
      if (farmer) {
        const [farmerUser] = farmer.userId
          ? await db.select().from(users).where(eq(users.id, farmer.userId)).limit(1)
          : [undefined];
        syncWebBookingToSupabase({
          bookingNumber: booking.bookingNumber,
          farmerUid: farmerUser?.uid || String(farmer.id),
          farmerPhone: farmer.mobile,
          farmerName: farmer.fullName,
          assignedPilotUid: req.dbUser!.uid,
          assignedPilotPhone: pilot.mobile,
          polygon: booking.farmBoundary || [],
          acresToSpray: booking.bookedAreaAcres,
          locationAddress: [farmer.village, farmer.district, farmer.state].filter(Boolean).join(', ') || 'Maharashtra',
          totalAmount: booking.totalAmountInr,
          adminCommission: Math.max(0, booking.totalAmountInr - booking.pilotPayoutInr),
          pilotEarnings: booking.pilotPayoutInr,
          paymentStatus: booking.paymentStatus === 'paid' ? 'paid' : 'pending',
          orderStatus: 'completed',
          fieldCenterLat: booking.farmLat,
          fieldCenterLng: booking.farmLng,
        });
      }
    }

    res.json({ session: updated });
  } catch {
    res.status(500).json({ error: 'Failed to complete spraying operation.' });
  }
});

krashivantriRouter.post(
  '/pilot/operations/:bookingId/evidence',
  requireAuth,
  evidenceUpload.single('file'),
  async (req: AuthRequest, res) => {
    try {
      const bookingId = Number(req.params.bookingId);
      const [pilot] = await db.select().from(dronePilots).where(eq(dronePilots.userId, req.dbUser!.id)).limit(1);
      if (!pilot) return res.status(403).json({ error: 'Pilot profile not found.' });
      if (!req.file) return res.status(400).json({ error: 'Photo or video evidence file is required.' });

      let [session] = await db
        .select()
        .from(operationSessions)
        .where(and(eq(operationSessions.bookingId, bookingId), eq(operationSessions.pilotId, pilot.id)))
        .limit(1);
      if (!session) {
        const [booking] = await db.select().from(serviceBookings).where(eq(serviceBookings.id, bookingId)).limit(1);
        if (!booking) return res.status(404).json({ error: 'Booking not found.' });
        const [createdSession] = await db
          .insert(operationSessions)
          .values({
            sessionCode: generateCode('NTF-OPS'),
            bookingId: booking.id,
            pilotId: pilot.id,
            farmerId: booking.farmerId,
            farmId: booking.farmId,
            status: 'Ready',
          })
          .returning();
        session = createdSession;
      }

      if (!isSupabaseStorageConfigured()) {
        return res.status(503).json({
          error: 'Supabase Storage is not configured. Configure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to store operation evidence.',
        });
      }

      const ext = path.extname(req.file.originalname).toLowerCase();
      const mediaType = ['.mp4', '.mov', '.webm'].includes(ext) ? 'video' : 'image';
      const uploaded = await uploadPrivateBufferToSupabaseStorage({
        bucket: 'customer-uploads',
        buffer: req.file.buffer,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype || 'application/octet-stream',
        ownerPrefix: req.dbUser!.authUserId || req.dbUser!.uid || pilot.pilotCode,
        folder: `krashivantri-evidence/${bookingId}`,
      });

      const [ev] = await db
        .insert(operationEvidence)
        .values({
          sessionId: session.id,
          bookingId,
          pilotId: pilot.id,
          evidencePhase: String(req.body.evidencePhase || 'post_spray'),
          mediaType,
          fileName: req.file.originalname,
          storagePath: uploaded.storagePath,
          latitude: req.body.latitude ? Number(req.body.latitude) : null,
          longitude: req.body.longitude ? Number(req.body.longitude) : null,
          caption: String(req.body.caption || '').trim(),
        })
        .returning();

      res.status(201).json({ evidence: ev });
    } catch (error: any) {
      res.status(400).json({ error: error?.message || 'Failed to upload operation evidence.' });
    }
  }
);

krashivantriRouter.post('/pilot/penalties/:id/appeal', requireAuth, async (req: AuthRequest, res) => {
  try {
    const penaltyId = Number(req.params.id);
    const explanation = String(req.body.explanation || '').trim();
    if (!explanation) return res.status(400).json({ error: 'Appeal explanation is required.' });

    const [pilot] = await db.select().from(dronePilots).where(eq(dronePilots.userId, req.dbUser!.id)).limit(1);
    if (!pilot) return res.status(403).json({ error: 'Pilot profile not found.' });

    const [pen] = await db
      .select()
      .from(penalties)
      .where(and(eq(penalties.id, penaltyId), eq(penalties.targetType, 'pilot'), eq(penalties.targetId, pilot.id)))
      .limit(1);
    if (!pen) return res.status(404).json({ error: 'Penalty record not found.' });

    const [appeal] = await db
      .insert(penaltyAppeals)
      .values({
        penaltyId,
        appellantUserId: req.dbUser!.id,
        explanation,
        decision: 'Pending',
      })
      .returning();

    await db
      .update(penalties)
      .set({ appealStatus: 'Pending', status: 'Under Appeal' })
      .where(eq(penalties.id, penaltyId));

    res.status(201).json({ appeal });
  } catch {
    res.status(500).json({ error: 'Failed to submit penalty appeal.' });
  }
});

// ============================================================================
// AUTHORIZED PRIVATE FILE DOWNLOAD (KYC & SPRAY EVIDENCE)
// ============================================================================
krashivantriRouter.get('/krashivantri/files/download', requireAuth, async (req: AuthRequest, res) => {
  try {
    const relPath = String(req.query.path || '').trim();
    if (!relPath || relPath.includes('..')) {
      return res.status(400).json({ error: 'Valid file path is required.' });
    }

    const isAdmin = ADMIN_ROLES.has(req.dbUser!.role);
    if (!isAdmin) {
      const uid = req.dbUser!.id;
      const [[farmer], [pilot]] = await Promise.all([
        db.select().from(farmers).where(eq(farmers.userId, uid)).limit(1),
        db.select().from(dronePilots).where(eq(dronePilots.userId, uid)).limit(1),
      ]);
      const [fDocs, pDocs, evRows] = await Promise.all([
        farmer ? db.select().from(farmerDocuments).where(eq(farmerDocuments.farmerId, farmer.id)) : Promise.resolve([]),
        pilot ? db.select().from(pilotDocuments).where(eq(pilotDocuments.pilotId, pilot.id)) : Promise.resolve([]),
        db.select().from(operationEvidence),
      ]);

      const farmerBookings = farmer
        ? await db.select().from(serviceBookings).where(eq(serviceBookings.farmerId, farmer.id))
        : [];
      const farmerBookingIds = new Set(farmerBookings.map((b) => b.id));

      const allowed =
        fDocs.some((d) => d.storagePath === relPath) ||
        pDocs.some((d) => d.storagePath === relPath) ||
        evRows.some(
          (ev) =>
            ev.storagePath === relPath &&
            ((pilot && ev.pilotId === pilot.id) || farmerBookingIds.has(ev.bookingId))
        );

      if (!allowed) return res.status(403).json({ error: 'Not authorized to view this file.' });
    }

    const cloudBuf = await downloadFromSupabaseStorage('customer-uploads', relPath);
    if (cloudBuf) {
      const fileName = path.basename(relPath) || 'document';
      res.setHeader('Content-Disposition', `attachment; filename="${fileName.replace(/"/g, '')}"`);
      res.setHeader('Content-Type', 'application/octet-stream');
      return res.send(cloudBuf);
    }

    const absPath = path.resolve(UPLOADS_ROOT, relPath);
    if (!absPath.startsWith(UPLOADS_ROOT) || !fs.existsSync(absPath)) {
      return res.status(404).json({ error: 'File not found.' });
    }

    res.download(absPath);
  } catch (error) {
    console.error('KRASHIVANTRI file download error:', error);
    res.status(500).json({ error: 'Failed to download file.' });
  }
});

// ============================================================================
// ADMIN KRASHIVANTRI ENDPOINTS (/api/admin/krashivantri/...)
// ============================================================================
const adminKrashi = Router();
adminKrashi.use(requireAuth);
adminKrashi.use(requireAdmin());

adminKrashi.get('/farmers', async (_req, res) => {
  try {
    const [allFarmers, allDocs, allFarms, allVerifs, allBookings, androidSnap] = await Promise.all([
      db.select().from(farmers).orderBy(desc(farmers.createdAt)),
      db.select().from(farmerDocuments).orderBy(desc(farmerDocuments.createdAt)),
      db.select().from(farmerFarms),
      db.select().from(farmerVerifications).orderBy(desc(farmerVerifications.createdAt)),
      db.select().from(serviceBookings),
      fetchAndroidKrashivantriSnapshot(),
    ]);
    const items = allFarmers.map((f) => ({
      ...f,
      documents: allDocs.filter((d) => d.farmerId === f.id),
      farms: allFarms.filter((fm) => fm.farmerId === f.id),
      verifications: allVerifs.filter((v) => v.farmerId === f.id),
      bookingsCount: allBookings.filter((b) => b.farmerId === f.id).length,
    }));
    res.json({
      farmers: items,
      androidFarmers: androidSnap.farmers,
      androidBoundaries: androidSnap.farmBoundaries,
    });
  } catch {
    res.status(500).json({ error: 'Failed to load farmers.' });
  }
});

adminKrashi.patch('/farmers/:id/verify', async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const { action, notes, rejectionReason } = req.body; // Approved | Rejected | Suspended | Clarification Requested
    const [farmer] = await db.select().from(farmers).where(eq(farmers.id, id)).limit(1);
    if (!farmer) return res.status(404).json({ error: 'Farmer not found.' });

    const noteText = String(rejectionReason || notes || '').trim();
    if (['Rejected', 'Suspended', 'Clarification Requested'].includes(action) && !noteText) {
      return res.status(400).json({ error: `A clear reason or note is required for action "${action}".` });
    }

    const newStatus =
      action === 'Approved'
        ? 'Approved'
        : action === 'Rejected'
        ? 'Rejected'
        : action === 'Suspended'
        ? 'Suspended'
        : 'Pending Review';
    const nextAccStatus = action === 'Suspended' ? 'suspended' : 'active';

    const [updated] = await db
      .update(farmers)
      .set({
        kycStatus: newStatus,
        accountStatus: nextAccStatus,
        rejectionReason: ['Rejected', 'Suspended'].includes(action) ? noteText : '',
        adminNotes: noteText || farmer.adminNotes,
        verifiedBy: req.dbUser!.email,
        verifiedAt: new Date().toISOString(),
        updatedAt: new Date(),
      })
      .where(eq(farmers.id, id))
      .returning();

    await db.insert(farmerVerifications).values({
      farmerId: id,
      action: String(action),
      previousStatus: farmer.kycStatus,
      newStatus,
      notes: noteText,
      reviewedBy: req.dbUser!.email,
    });

    if (farmer.userId) {
      await createNotification({
        userId: farmer.userId,
        title: `KRASHIVANTRI Farmer KYC: ${newStatus}`,
        message: noteText || `Your farmer account verification status is now ${newStatus}.`,
        link: '/krashivantri/farmer-portal',
      });
    }

    await logAudit({
      actorUid: req.dbUser!.uid,
      actorEmail: req.dbUser!.email,
      action: 'VERIFY_FARMER',
      entityType: 'farmer',
      entityId: id,
      details: { action, newStatus, noteText },
    });

    res.json({ farmer: updated });
  } catch {
    res.status(500).json({ error: 'Failed to verify farmer.' });
  }
});

adminKrashi.get('/pilots', async (_req, res) => {
  try {
    const ops = await getOpsConfig();
    const [allPilots, allDocs, allDrones, allBanks, allAvail, allVerifs, androidSnap] = await Promise.all([
      db.select().from(dronePilots).orderBy(desc(dronePilots.createdAt)),
      db.select().from(pilotDocuments).orderBy(desc(pilotDocuments.createdAt)),
      db.select().from(pilotDrones),
      db.select().from(pilotBankAccounts),
      db.select().from(pilotAvailability),
      db.select().from(pilotVerifications).orderBy(desc(pilotVerifications.createdAt)),
      fetchAndroidKrashivantriSnapshot(),
    ]);

    const items = allPilots.map((p) => {
      const avail = allAvail.find((a) => a.pilotId === p.id) || null;
      return {
        ...p,
        documents: allDocs.filter((d) => d.pilotId === p.id),
        drones: allDrones.filter((dr) => dr.pilotId === p.id),
        bankAccounts: allBanks.filter((b) => b.pilotId === p.id).map(sanitizeBankAccount),
        availability: avail ? { ...avail, ...computeGpsFreshness(avail.lastLocationAt, ops.gpsStaleThresholdMinutes) } : null,
        verifications: allVerifs.filter((v) => v.pilotId === p.id),
      };
    });

    res.json({ pilots: items, androidPilots: androidSnap.pilots });
  } catch {
    res.status(500).json({ error: 'Failed to load drone pilots.' });
  }
});

adminKrashi.patch('/pilots/:id/verify', async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const { action, notes, rejectionReason } = req.body;
    const [pilot] = await db.select().from(dronePilots).where(eq(dronePilots.id, id)).limit(1);
    if (!pilot) return res.status(404).json({ error: 'Drone pilot not found.' });

    const noteText = String(rejectionReason || notes || '').trim();
    if (['Rejected', 'Suspended', 'Clarification Requested'].includes(action) && !noteText) {
      return res.status(400).json({ error: `A clear reason is required for action "${action}".` });
    }

    const newStatus =
      action === 'Approved'
        ? 'Approved'
        : action === 'Rejected'
        ? 'Rejected'
        : action === 'Suspended'
        ? 'Suspended'
        : 'Pending Review';
    const nextAccStatus = action === 'Suspended' ? 'suspended' : 'active';

    const [updated] = await db
      .update(dronePilots)
      .set({
        kycStatus: newStatus,
        accountStatus: nextAccStatus,
        rejectionReason: ['Rejected', 'Suspended'].includes(action) ? noteText : '',
        verifiedBy: req.dbUser!.email,
        verifiedAt: new Date().toISOString(),
        updatedAt: new Date(),
      })
      .where(eq(dronePilots.id, id))
      .returning();

    await db.insert(pilotVerifications).values({
      pilotId: id,
      action: String(action),
      previousStatus: pilot.kycStatus,
      newStatus,
      notes: noteText,
      reviewedBy: req.dbUser!.email,
    });

    if (pilot.userId) {
      await createNotification({
        userId: pilot.userId,
        title: `KRASHIVANTRI Pilot Verification: ${newStatus}`,
        message: noteText || `Your drone pilot profile status is now ${newStatus}.`,
        link: '/krashivantri/pilot-portal',
      });
    }

    await logAudit({
      actorUid: req.dbUser!.uid,
      actorEmail: req.dbUser!.email,
      action: 'VERIFY_DRONE_PILOT',
      entityType: 'drone_pilot',
      entityId: id,
      details: { action, newStatus, noteText },
    });

    const [pilotUser] = pilot.userId
      ? await db.select().from(users).where(eq(users.id, pilot.userId)).limit(1)
      : [undefined];
    syncWebPilotToSupabase({
      webUserUid: pilotUser?.uid || String(pilot.id),
      phone: pilot.mobile,
      fullName: pilot.fullName,
      isLicenseVerified: newStatus === 'Approved',
    });

    res.json({ pilot: updated });
  } catch {
    res.status(500).json({ error: 'Failed to verify drone pilot.' });
  }
});

adminKrashi.patch('/pilots/drones/:id/verify', async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const status = String(req.body.verificationStatus || 'Verified');
    const [updated] = await db
      .update(pilotDrones)
      .set({ verificationStatus: status })
      .where(eq(pilotDrones.id, id))
      .returning();
    if (!updated) return res.status(404).json({ error: 'Drone record not found.' });
    res.json({ drone: updated });
  } catch {
    res.status(500).json({ error: 'Failed to update drone verification.' });
  }
});

adminKrashi.patch('/pilots/bank-accounts/:id/verify', async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const status = String(req.body.verificationStatus || 'Verified');
    const [updated] = await db
      .update(pilotBankAccounts)
      .set({ verificationStatus: status })
      .where(eq(pilotBankAccounts.id, id))
      .returning();
    if (!updated) return res.status(404).json({ error: 'Bank account not found.' });
    res.json({ bankAccount: sanitizeBankAccount(updated) });
  } catch {
    res.status(500).json({ error: 'Failed to verify pilot bank account.' });
  }
});

adminKrashi.patch('/pilots/documents/:id/verify', async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const status = String(req.body.verificationStatus || 'Verified');
    const [updated] = await db
      .update(pilotDocuments)
      .set({ verificationStatus: status, notes: String(req.body.notes || '') })
      .where(eq(pilotDocuments.id, id))
      .returning();
    if (!updated) return res.status(404).json({ error: 'Pilot document not found.' });
    res.json({ document: updated });
  } catch {
    res.status(500).json({ error: 'Failed to verify pilot document.' });
  }
});

adminKrashi.get('/live-tracking', async (_req, res) => {
  try {
    const ops = await getOpsConfig();
    const [allPilots, allAvail, allBookings, allFarmers, allSessions, allEvidence, allVerifs, androidSnap] = await Promise.all([
      db.select().from(dronePilots),
      db.select().from(pilotAvailability),
      db.select().from(serviceBookings).orderBy(desc(serviceBookings.createdAt)),
      db.select().from(farmers),
      db.select().from(operationSessions),
      db.select().from(operationEvidence).orderBy(desc(operationEvidence.capturedAt)),
      db.select().from(operationVerifications),
      fetchAndroidKrashivantriSnapshot(),
    ]);

    const pilotById = Object.fromEntries(allPilots.map((p) => [p.id, p]));
    const farmerById = Object.fromEntries(allFarmers.map((f) => [f.id, f]));

    const pilots = allPilots.map((p) => {
      const avail = allAvail.find((a) => a.pilotId === p.id) || null;
      return {
        ...p,
        availability: avail
          ? { ...avail, ...computeGpsFreshness(avail.lastLocationAt, ops.gpsStaleThresholdMinutes) }
          : { isOnline: false, gpsAvailable: false, isStale: true, gpsStalenessSeconds: null, status: 'offline' },
      };
    });

    const bookings = allBookings.map((b) => {
      const pilot = b.assignedPilotId ? pilotById[b.assignedPilotId] || null : null;
      const pilotAvail = b.assignedPilotId ? allAvail.find((a) => a.pilotId === b.assignedPilotId) || null : null;
      return {
        ...b,
        farmer: farmerById[b.farmerId] || null,
        assignedPilot: pilot
          ? {
              id: pilot.id,
              pilotCode: pilot.pilotCode,
              fullName: pilot.fullName,
              mobile: pilot.mobile,
              availability: pilotAvail
                ? { ...pilotAvail, ...computeGpsFreshness(pilotAvail.lastLocationAt, ops.gpsStaleThresholdMinutes) }
                : null,
            }
          : null,
        session: allSessions.find((s) => s.bookingId === b.id) || null,
        evidence: allEvidence.filter((e) => e.bookingId === b.id),
        verification: allVerifs.find((v) => v.bookingId === b.id) || null,
      };
    });

    res.json({
      pilots,
      bookings,
      opsConfig: ops,
      android: androidSnap,
    });
  } catch (error) {
    console.error('Admin live tracking error:', error);
    res.status(500).json({ error: 'Failed to load live tracking overview.' });
  }
});

// ============================================================================
// ADMIN ANDROID SUPABASE LIVE MANAGEMENT ENDPOINTS
// ============================================================================
adminKrashi.get('/android-live', async (_req, res) => {
  try {
    const snap = await fetchAndroidKrashivantriSnapshot();
    res.json(snap);
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Failed to fetch Supabase Android snapshot.' });
  }
});

adminKrashi.patch('/android-pilots/:userId/verify', async (req: AuthRequest, res) => {
  try {
    const userId = String(req.params.userId || '').trim();
    const isVerified = Boolean(req.body.isVerified);
    const updated = await verifyAndroidPilotLicense(userId, isVerified);
    await logAudit({
      actorUid: req.dbUser!.uid,
      actorEmail: req.dbUser!.email,
      action: 'VERIFY_ANDROID_PILOT',
      entityType: 'supabase_pilot_profile',
      entityId: userId,
      details: { isVerified },
    });
    res.json({ pilotProfile: updated });
  } catch (error: any) {
    res.status(400).json({ error: error?.message || 'Failed to update Android pilot verification.' });
  }
});

adminKrashi.post('/android-orders/:orderId/assign', async (req: AuthRequest, res) => {
  try {
    const orderId = String(req.params.orderId || '').trim();
    const pilotUserId = req.body.pilotUserId ? String(req.body.pilotUserId).trim() : undefined;
    const autoNearest = Boolean(req.body.autoNearest);
    const updated = await assignAndroidOrderPilot(orderId, { pilotUserId, autoNearest });
    await logAudit({
      actorUid: req.dbUser!.uid,
      actorEmail: req.dbUser!.email,
      action: 'ASSIGN_ANDROID_ORDER_PILOT',
      entityType: 'supabase_order',
      entityId: orderId,
      details: { pilotUserId, autoNearest },
    });
    res.json({ order: updated });
  } catch (error: any) {
    res.status(400).json({ error: error?.message || 'Failed to assign pilot to Android order.' });
  }
});

adminKrashi.patch('/android-orders/:orderId/status', async (req: AuthRequest, res) => {
  try {
    const orderId = String(req.params.orderId || '').trim();
    const orderStatus = String(req.body.orderStatus || '').trim() as
      | 'pending'
      | 'accepted'
      | 'in_progress'
      | 'completed'
      | 'cancelled';
    const paymentStatus = req.body.paymentStatus
      ? (String(req.body.paymentStatus).trim() as 'pending' | 'paid')
      : undefined;

    if (!['pending', 'accepted', 'in_progress', 'completed', 'cancelled'].includes(orderStatus)) {
      return res.status(400).json({ error: 'Invalid Android order status.' });
    }
    const updated = await updateAndroidOrderStatus(orderId, orderStatus, paymentStatus);
    await logAudit({
      actorUid: req.dbUser!.uid,
      actorEmail: req.dbUser!.email,
      action: 'UPDATE_ANDROID_ORDER_STATUS',
      entityType: 'supabase_order',
      entityId: orderId,
      details: { orderStatus, paymentStatus },
    });
    res.json({ order: updated });
  } catch (error: any) {
    res.status(400).json({ error: error?.message || 'Failed to update Android order status.' });
  }
});

adminKrashi.get('/bookings', async (_req, res) => {
  const rows = await db.select().from(serviceBookings).orderBy(desc(serviceBookings.createdAt));
  res.json({ bookings: rows });
});

adminKrashi.post('/bookings/:id/assign-pilot', async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const { pilotId, autoNearest } = req.body;

    const [booking] = await db.select().from(serviceBookings).where(eq(serviceBookings.id, id)).limit(1);
    if (!booking) return res.status(404).json({ error: 'Booking not found.' });

    let chosenPilot: any = null;
    if (autoNearest) {
      const [allPilots, allAvail] = await Promise.all([
        db.select().from(dronePilots).where(and(eq(dronePilots.kycStatus, 'Approved'), eq(dronePilots.accountStatus, 'active'))),
        db.select().from(pilotAvailability),
      ]);
      const availByPilot = Object.fromEntries(allAvail.map((a) => [a.pilotId, a]));
      const candidates = allPilots
        .map((p) => {
          const av = availByPilot[p.id];
          const hasCoords = av?.currentLat != null && av?.currentLng != null;
          const distMeters = hasCoords
            ? haversineDistanceMeters(av.currentLat!, av.currentLng!, booking.farmLat, booking.farmLng)
            : Number.MAX_SAFE_INTEGER;
          return { pilot: p, av, distMeters };
        })
        .filter((c) => c.av?.isOnline && c.distMeters <= c.pilot.serviceRadiusKm * 1000)
        .sort((a, b) => a.distMeters - b.distMeters);

      if (candidates.length === 0) {
        return res.status(400).json({ error: 'No online approved drone pilot with live GPS found within service radius.' });
      }
      chosenPilot = candidates[0].pilot;
    } else {
      const [p] = await db.select().from(dronePilots).where(eq(dronePilots.id, Number(pilotId))).limit(1);
      if (!p) return res.status(404).json({ error: 'Selected pilot not found.' });
      if (p.kycStatus !== 'Approved' || p.accountStatus !== 'active') {
        return res.status(400).json({ error: 'Only Approved & Active drone pilots can be assigned.' });
      }
      chosenPilot = p;
    }

    const [updated] = await db
      .update(serviceBookings)
      .set({
        assignedPilotId: chosenPilot.id,
        bookingStatus: 'Pilot Assigned',
        updatedAt: new Date(),
      })
      .where(eq(serviceBookings.id, booking.id))
      .returning();

    await db.insert(bookingAssignments).values({
      bookingId: booking.id,
      pilotId: chosenPilot.id,
      assignedBy: req.dbUser!.email,
      assignmentStatus: 'Offered',
    });

    await db.insert(bookingStatusHistory).values({
      bookingId: booking.id,
      status: 'Pilot Assigned',
      actorEmail: req.dbUser!.email,
      note: `Assigned to pilot ${chosenPilot.fullName} (${chosenPilot.pilotCode}).`,
    });

    if (chosenPilot.userId) {
      await createNotification({
        userId: chosenPilot.userId,
        title: `New Spraying Mission Assigned — ${booking.bookingNumber}`,
        message: `${booking.bookedAreaAcres} acres (${booking.cropType}) on ${booking.preferredDate}. Please accept or reject in Pilot Portal.`,
        link: '/krashivantri/pilot-portal',
      });
    }

    await logAudit({
      actorUid: req.dbUser!.uid,
      actorEmail: req.dbUser!.email,
      action: 'ASSIGN_DRONE_PILOT',
      entityType: 'service_booking',
      entityId: booking.id,
      details: { pilotId: chosenPilot.id, pilotCode: chosenPilot.pilotCode, autoNearest: Boolean(autoNearest) },
    });

    const [farmer] = await db.select().from(farmers).where(eq(farmers.id, booking.farmerId)).limit(1);
    if (farmer) {
      const [[farmerUser], [pilotUser]] = await Promise.all([
        farmer.userId ? db.select().from(users).where(eq(users.id, farmer.userId)).limit(1) : Promise.resolve([undefined]),
        chosenPilot.userId
          ? db.select().from(users).where(eq(users.id, chosenPilot.userId)).limit(1)
          : Promise.resolve([undefined]),
      ]);
      syncWebBookingToSupabase({
        bookingNumber: booking.bookingNumber,
        farmerUid: farmerUser?.uid || String(farmer.id),
        farmerPhone: farmer.mobile,
        farmerName: farmer.fullName,
        assignedPilotUid: pilotUser?.uid || String(chosenPilot.id),
        assignedPilotPhone: chosenPilot.mobile,
        polygon: booking.farmBoundary || [],
        acresToSpray: booking.bookedAreaAcres,
        locationAddress: [farmer.village, farmer.district, farmer.state].filter(Boolean).join(', ') || 'Maharashtra',
        totalAmount: booking.totalAmountInr,
        adminCommission: Math.max(0, booking.totalAmountInr - booking.pilotPayoutInr),
        pilotEarnings: booking.pilotPayoutInr,
        paymentStatus: booking.paymentStatus === 'paid' ? 'paid' : 'pending',
        orderStatus: 'accepted',
        fieldCenterLat: booking.farmLat,
        fieldCenterLng: booking.farmLng,
      });
    }

    res.json({ booking: updated, assignedPilot: chosenPilot });
  } catch (error) {
    console.error('Assign pilot error:', error);
    res.status(500).json({ error: 'Failed to assign pilot.' });
  }
});

adminKrashi.post('/operations/:bookingId/verify', async (req: AuthRequest, res) => {
  try {
    const bookingId = Number(req.params.bookingId);
    const { verificationStatus, verifiedAreaAcres, disputeNotes } = req.body; // Approved | Adjusted | Rejected

    const [booking] = await db.select().from(serviceBookings).where(eq(serviceBookings.id, bookingId)).limit(1);
    const [session] = await db.select().from(operationSessions).where(eq(operationSessions.bookingId, bookingId)).limit(1);
    if (!booking || !session) return res.status(404).json({ error: 'Booking or operation session not found.' });

    const ops = await getOpsConfig();
    const finalAcres = Number(verifiedAreaAcres || session.completedAreaAcres || booking.bookedAreaAcres);
    const [verif] = await db
      .insert(operationVerifications)
      .values({
        bookingId,
        sessionId: session.id,
        verificationStatus: String(verificationStatus || 'Approved'),
        verifiedAreaAcres: finalAcres,
        disputeNotes: String(disputeNotes || ''),
        verifiedBy: req.dbUser!.email,
        verifiedAt: new Date(),
      })
      .returning();

    let earningEntry: any = null;
    if (verificationStatus === 'Approved' || verificationStatus === 'Adjusted') {
      const existingLedger = await db
        .select()
        .from(pilotEarningLedger)
        .where(and(eq(pilotEarningLedger.bookingId, bookingId), eq(pilotEarningLedger.entryType, 'spraying_earning')))
        .limit(1);

      if (existingLedger.length === 0) {
        const gross = Math.round(finalAcres * booking.ratePerAcreInr);
        const comm = Math.round((gross * booking.platformCommissionPercent) / 100);
        const net = Math.max(0, gross - comm);

        const [entry] = await db
          .insert(pilotEarningLedger)
          .values({
            ledgerRef: generateCode('NTF-LDG'),
            pilotId: session.pilotId,
            bookingId,
            entryType: 'spraying_earning',
            grossAmountInr: gross,
            commissionInr: comm,
            penaltyDeductionInr: 0,
            netAmountInr: net,
            status: 'ready_for_payout',
            notes: `Verified ${finalAcres} acres for ${booking.bookingNumber} (Commission ${booking.platformCommissionPercent}%).`,
          })
          .returning();
        earningEntry = entry;

        const [pilot] = await db.select().from(dronePilots).where(eq(dronePilots.id, session.pilotId)).limit(1);
        if (pilot) {
          await db
            .update(dronePilots)
            .set({ totalSprayedAcres: Number((pilot.totalSprayedAcres + finalAcres).toFixed(2)), updatedAt: new Date() })
            .where(eq(dronePilots.id, pilot.id));
        }
      }

      await db
        .update(serviceBookings)
        .set({ bookingStatus: 'Verified & Settled', updatedAt: new Date() })
        .where(eq(serviceBookings.id, bookingId));

      await db.insert(bookingStatusHistory).values({
        bookingId,
        status: 'Verified & Settled',
        actorEmail: req.dbUser!.email,
        note: `Admin verified ${finalAcres} acres (${verificationStatus}). Pilot earnings credited.`,
      });
    } else {
      await db
        .update(serviceBookings)
        .set({ bookingStatus: 'Disputed', updatedAt: new Date() })
        .where(eq(serviceBookings.id, bookingId));
    }

    await logAudit({
      actorUid: req.dbUser!.uid,
      actorEmail: req.dbUser!.email,
      action: 'VERIFY_SPRAYING_OPERATION',
      entityType: 'service_booking',
      entityId: bookingId,
      details: { verificationStatus, finalAcres, gpsThreshold: ops.gpsStaleThresholdMinutes },
    });

    res.json({ verification: verif, earningEntry });
  } catch (error) {
    console.error('Operation verify error:', error);
    res.status(500).json({ error: 'Failed to verify operation.' });
  }
});

adminKrashi.get('/farmer-payments', async (_req, res) => {
  try {
    const [payRows, refundRows, bookings, allFarmers] = await Promise.all([
      db.select().from(farmerPayments).orderBy(desc(farmerPayments.createdAt)),
      db.select().from(farmerRefunds).orderBy(desc(farmerRefunds.createdAt)),
      db.select().from(serviceBookings),
      db.select().from(farmers),
    ]);
    const bookingById = Object.fromEntries(bookings.map((b) => [b.id, b]));
    const farmerById = Object.fromEntries(allFarmers.map((f) => [f.id, f]));

    res.json({
      payments: payRows.map((p) => ({
        ...p,
        booking: bookingById[p.bookingId] || null,
        farmer: farmerById[p.farmerId] || null,
      })),
      refunds: refundRows,
    });
  } catch {
    res.status(500).json({ error: 'Failed to load farmer payments.' });
  }
});

adminKrashi.post('/farmer-refunds', async (req: AuthRequest, res) => {
  try {
    const { bookingId, farmerPaymentId, amountInr, reason, providerRefundId } = req.body;
    if (!bookingId || !Number(amountInr) || !String(reason || '').trim()) {
      return res.status(400).json({ error: 'Booking ID, refund amount, and reason are required.' });
    }

    const [booking] = await db.select().from(serviceBookings).where(eq(serviceBookings.id, Number(bookingId))).limit(1);
    if (!booking) return res.status(404).json({ error: 'Booking not found.' });

    const [refund] = await db
      .insert(farmerRefunds)
      .values({
        refundRef: generateCode('NTF-RFD'),
        bookingId: booking.id,
        farmerPaymentId: farmerPaymentId ? Number(farmerPaymentId) : null,
        amountInr: Number(amountInr),
        reason: String(reason).trim(),
        status: providerRefundId ? 'Processed' : 'Pending',
        processedBy: req.dbUser!.email,
        providerRefundId: String(providerRefundId || '').trim(),
      })
      .returning();

    if (Number(amountInr) >= booking.totalAmountInr) {
      await db
        .update(serviceBookings)
        .set({ bookingStatus: 'Refunded', paymentStatus: 'refunded', updatedAt: new Date() })
        .where(eq(serviceBookings.id, booking.id));
    }

    await logAudit({
      actorUid: req.dbUser!.uid,
      actorEmail: req.dbUser!.email,
      action: 'ISSUE_FARMER_REFUND',
      entityType: 'farmer_refund',
      entityId: refund.id,
      details: { bookingId: booking.id, amountInr, reason },
    });

    res.status(201).json({ refund });
  } catch {
    res.status(500).json({ error: 'Failed to log farmer refund.' });
  }
});

adminKrashi.get('/pilot-payouts', async (_req, res) => {
  try {
    const [allPilots, allLedger, allPayouts, allBanks, allPenalties] = await Promise.all([
      db.select().from(dronePilots),
      db.select().from(pilotEarningLedger).orderBy(desc(pilotEarningLedger.createdAt)),
      db.select().from(pilotPayouts).orderBy(desc(pilotPayouts.createdAt)),
      db.select().from(pilotBankAccounts),
      db.select().from(penalties),
    ]);

    const balances = allPilots.map((p) => {
      const pLedger = allLedger.filter((l) => l.pilotId === p.id);
      const readyCredits = pLedger
        .filter((l) => l.status === 'ready_for_payout' && l.netAmountInr > 0)
        .reduce((s, l) => s + l.netAmountInr, 0);
      const pendingDeductions = pLedger
        .filter((l) => l.status === 'ready_for_payout' && l.netAmountInr < 0)
        .reduce((s, l) => s + Math.abs(l.netAmountInr), 0);
      const paidTotal = allPayouts
        .filter((po) => po.pilotId === p.id && po.status === 'Settled')
        .reduce((s, po) => s + po.amountInr, 0);
      const primaryBank = allBanks.find((b) => b.pilotId === p.id && b.isPrimary) || allBanks.find((b) => b.pilotId === p.id);
      const activePenalties = allPenalties.filter(
        (pn) => pn.targetType === 'pilot' && pn.targetId === p.id && pn.status === 'Active'
      );

      return {
        pilot: p,
        payableBalanceInr: Math.max(0, readyCredits - pendingDeductions),
        readyCreditsInr: readyCredits,
        pendingDeductionsInr: pendingDeductions,
        settledTotalInr: paidTotal,
        primaryBank: primaryBank ? sanitizeBankAccount(primaryBank) : null,
        activePenaltyCount: activePenalties.length,
      };
    });

    res.json({ balances, payouts: allPayouts, ledger: allLedger });
  } catch {
    res.status(500).json({ error: 'Failed to load pilot payouts.' });
  }
});

adminKrashi.post('/pilot-payouts/initiate', async (req: AuthRequest, res) => {
  try {
    const pilotId = Number(req.body.pilotId);
    const [pilot] = await db.select().from(dronePilots).where(eq(dronePilots.id, pilotId)).limit(1);
    if (!pilot) return res.status(404).json({ error: 'Pilot not found.' });

    const [banks, readyEntries] = await Promise.all([
      db.select().from(pilotBankAccounts).where(eq(pilotBankAccounts.pilotId, pilotId)),
      db.select().from(pilotEarningLedger).where(and(eq(pilotEarningLedger.pilotId, pilotId), eq(pilotEarningLedger.status, 'ready_for_payout'))),
    ]);

    const bank = banks.find((b) => b.isPrimary) || banks[0];
    if (!bank) return res.status(400).json({ error: 'Pilot has not linked a payout bank account yet.' });

    const computedBalance = readyEntries.reduce((s, e) => s + e.netAmountInr, 0);
    const requestedAmount = req.body.amountInr ? Number(req.body.amountInr) : computedBalance;
    if (requestedAmount <= 0 || requestedAmount > computedBalance) {
      return res.status(400).json({ error: `Payable balance is ₹${computedBalance}. Requested payout ₹${requestedAmount} is invalid.` });
    }

    const [payout] = await db
      .insert(pilotPayouts)
      .values({
        payoutRef: generateCode('NTF-POT'),
        pilotId,
        amountInr: requestedAmount,
        amountPaise: Math.round(requestedAmount * 100),
        bankAccountMasked: `${bank.bankName} ${bank.accountNumberMasked}`,
        payoutProvider: String(req.body.payoutProvider || 'manual_bank_reference'),
        providerPayoutId: String(req.body.providerPayoutId || '').trim(),
        status: req.body.providerPayoutId ? 'Settled' : 'Pending Approval',
        approvedBy: req.dbUser!.email,
        processedAt: req.body.providerPayoutId ? new Date() : null,
      })
      .returning();

    if (req.body.providerPayoutId) {
      for (const entry of readyEntries) {
        await db.update(pilotEarningLedger).set({ status: 'paid_out' }).where(eq(pilotEarningLedger.id, entry.id));
      }
    }

    await logAudit({
      actorUid: req.dbUser!.uid,
      actorEmail: req.dbUser!.email,
      action: 'INITIATE_PILOT_PAYOUT',
      entityType: 'pilot_payout',
      entityId: payout.id,
      details: { pilotId, amountInr: requestedAmount, status: payout.status },
    });

    res.status(201).json({ payout });
  } catch (error) {
    console.error('Initiate pilot payout error:', error);
    res.status(500).json({ error: 'Failed to initiate pilot payout.' });
  }
});

adminKrashi.patch('/pilot-payouts/:id/status', async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const { status, providerPayoutId, failureReason } = req.body;
    const [existing] = await db.select().from(pilotPayouts).where(eq(pilotPayouts.id, id)).limit(1);
    if (!existing) return res.status(404).json({ error: 'Payout not found.' });

    if (status === 'Settled' && !String(providerPayoutId || existing.providerPayoutId || '').trim()) {
      return res.status(400).json({ error: 'A real bank UTR / provider payout ID is required to mark payout Settled.' });
    }

    const [updated] = await db
      .update(pilotPayouts)
      .set({
        status: String(status),
        providerPayoutId: String(providerPayoutId || existing.providerPayoutId).trim(),
        failureReason: String(failureReason || existing.failureReason).trim(),
        processedAt: status === 'Settled' ? new Date() : existing.processedAt,
      })
      .where(eq(pilotPayouts.id, id))
      .returning();

    if (status === 'Settled') {
      const readyEntries = await db
        .select()
        .from(pilotEarningLedger)
        .where(and(eq(pilotEarningLedger.pilotId, existing.pilotId), eq(pilotEarningLedger.status, 'ready_for_payout')));
      for (const e of readyEntries) {
        await db.update(pilotEarningLedger).set({ status: 'paid_out' }).where(eq(pilotEarningLedger.id, e.id));
      }
    }

    await logAudit({
      actorUid: req.dbUser!.uid,
      actorEmail: req.dbUser!.email,
      action: 'UPDATE_PILOT_PAYOUT',
      entityType: 'pilot_payout',
      entityId: id,
      details: { status, providerPayoutId },
    });

    res.json({ payout: updated });
  } catch {
    res.status(500).json({ error: 'Failed to update payout status.' });
  }
});

adminKrashi.get('/penalties', async (_req, res) => {
  try {
    const [allPenalties, allAppeals, allPilots, allFarmers] = await Promise.all([
      db.select().from(penalties).orderBy(desc(penalties.createdAt)),
      db.select().from(penaltyAppeals).orderBy(desc(penaltyAppeals.createdAt)),
      db.select().from(dronePilots),
      db.select().from(farmers),
    ]);
    const pilotById = Object.fromEntries(allPilots.map((p) => [p.id, p]));
    const farmerById = Object.fromEntries(allFarmers.map((f) => [f.id, f]));

    const items = allPenalties.map((pn) => ({
      ...pn,
      targetLabel:
        pn.targetType === 'pilot'
          ? `${pilotById[pn.targetId]?.fullName || 'Pilot'} (${pilotById[pn.targetId]?.pilotCode || pn.targetId})`
          : `${farmerById[pn.targetId]?.fullName || 'Farmer'} (${farmerById[pn.targetId]?.farmerCode || pn.targetId})`,
      appeals: allAppeals.filter((a) => a.penaltyId === pn.id),
    }));

    res.json({ penalties: items, appeals: allAppeals });
  } catch {
    res.status(500).json({ error: 'Failed to load penalties.' });
  }
});

adminKrashi.post('/penalties', async (req: AuthRequest, res) => {
  try {
    const { targetType, targetId, bookingId, reasonCategory, description, evidenceSummary, amountInr } = req.body;
    if (!targetId || !reasonCategory || !String(description || '').trim()) {
      return res.status(400).json({ error: 'Target ID, reason category, and penalty description are required.' });
    }

    const amt = Math.max(0, Number(amountInr || 0));
    const tType = targetType === 'farmer' ? 'farmer' : 'pilot';
    const [created] = await db
      .insert(penalties)
      .values({
        penaltyNumber: generateCode('NTF-PNL'),
        targetType: tType,
        targetId: Number(targetId),
        bookingId: bookingId ? Number(bookingId) : null,
        reasonCategory: String(reasonCategory),
        description: String(description).trim(),
        evidenceSummary: String(evidenceSummary || '').trim(),
        amountInr: amt,
        status: 'Active',
        appealStatus: 'None',
        imposedBy: req.dbUser!.email,
      })
      .returning();

    if (tType === 'pilot') {
      const [pilot] = await db.select().from(dronePilots).where(eq(dronePilots.id, Number(targetId))).limit(1);
      if (pilot) {
        await db
          .update(dronePilots)
          .set({ penaltyPoints: (pilot.penaltyPoints || 0) + 1, updatedAt: new Date() })
          .where(eq(dronePilots.id, pilot.id));

        if (amt > 0) {
          await db.insert(pilotEarningLedger).values({
            ledgerRef: generateCode('NTF-LDG'),
            pilotId: pilot.id,
            bookingId: bookingId ? Number(bookingId) : null,
            entryType: 'penalty_deduction',
            grossAmountInr: 0,
            commissionInr: 0,
            penaltyDeductionInr: amt,
            netAmountInr: -amt,
            status: 'ready_for_payout',
            notes: `Penalty ${created.penaltyNumber}: ${reasonCategory}`,
          });
        }
      }
    }

    await logAudit({
      actorUid: req.dbUser!.uid,
      actorEmail: req.dbUser!.email,
      action: 'IMPOSE_PENALTY',
      entityType: 'penalty',
      entityId: created.id,
      details: { targetType: tType, targetId, amountInr: amt, reasonCategory },
    });

    res.status(201).json({ penalty: created });
  } catch (error) {
    console.error('Impose penalty error:', error);
    res.status(500).json({ error: 'Failed to impose penalty.' });
  }
});

adminKrashi.patch('/penalty-appeals/:id', async (req: AuthRequest, res) => {
  try {
    const appealId = Number(req.params.id);
    const { decision, decisionNotes } = req.body; // Waived | Upheld
    if (!['Waived', 'Upheld'].includes(decision)) {
      return res.status(400).json({ error: 'Decision must be "Waived" or "Upheld".' });
    }

    const [appeal] = await db.select().from(penaltyAppeals).where(eq(penaltyAppeals.id, appealId)).limit(1);
    if (!appeal) return res.status(404).json({ error: 'Appeal not found.' });

    const [updatedAppeal] = await db
      .update(penaltyAppeals)
      .set({
        decision,
        decisionNotes: String(decisionNotes || '').trim(),
        reviewedBy: req.dbUser!.email,
        reviewedAt: new Date(),
      })
      .where(eq(penaltyAppeals.id, appealId))
      .returning();

    const [pen] = await db.select().from(penalties).where(eq(penalties.id, appeal.penaltyId)).limit(1);
    if (pen) {
      await db
        .update(penalties)
        .set({
          status: decision === 'Waived' ? 'Waived' : 'Active',
          appealStatus: decision === 'Waived' ? 'Approved' : 'Rejected',
        })
        .where(eq(penalties.id, pen.id));

      if (decision === 'Waived' && pen.targetType === 'pilot' && pen.amountInr > 0) {
        await db.insert(pilotEarningLedger).values({
          ledgerRef: generateCode('NTF-LDG'),
          pilotId: pen.targetId,
          bookingId: pen.bookingId,
          entryType: 'bonus_adjustment',
          grossAmountInr: pen.amountInr,
          commissionInr: 0,
          penaltyDeductionInr: 0,
          netAmountInr: pen.amountInr,
          status: 'ready_for_payout',
          notes: `Penalty ${pen.penaltyNumber} waived upon appeal review.`,
        });
      }
    }

    await logAudit({
      actorUid: req.dbUser!.uid,
      actorEmail: req.dbUser!.email,
      action: 'REVIEW_PENALTY_APPEAL',
      entityType: 'penalty_appeal',
      entityId: appealId,
      details: { decision, decisionNotes },
    });

    res.json({ appeal: updatedAppeal });
  } catch {
    res.status(500).json({ error: 'Failed to review penalty appeal.' });
  }
});

adminKrashi.get('/ops-config', async (_req, res) => {
  res.json({ config: await getOpsConfig() });
});

adminKrashi.put('/ops-config', requireAdmin(['super_admin']), async (req: AuthRequest, res) => {
  try {
    const b = req.body;
    const nextCfg: KrashiOpsConfig = {
      baseRatePerAcreInr: Math.max(100, Number(b.baseRatePerAcreInr || 500)),
      minimumBookingAcres: Math.max(0.5, Number(b.minimumBookingAcres || 1)),
      platformCommissionPercent: Math.min(50, Math.max(0, Number(b.platformCommissionPercent ?? 15))),
      gpsStaleThresholdMinutes: Math.max(1, Number(b.gpsStaleThresholdMinutes || 10)),
      arrivalGeofenceMeters: Math.max(50, Number(b.arrivalGeofenceMeters || 250)),
      pilotResponseTimeoutMinutes: Math.max(5, Number(b.pilotResponseTimeoutMinutes || 30)),
      cancellationBeforeDispatchRefundPercent: Math.min(
        100,
        Math.max(0, Number(b.cancellationBeforeDispatchRefundPercent ?? 100))
      ),
      lateArrivalPenaltyInr: Math.max(0, Number(b.lateArrivalPenaltyInr ?? 200)),
    };

    await db
      .insert(siteSettings)
      .values({ key: 'krashivantriOpsConfig', value: nextCfg, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: siteSettings.key,
        set: { value: nextCfg, updatedAt: new Date() },
      });

    await logAudit({
      actorUid: req.dbUser!.uid,
      actorEmail: req.dbUser!.email,
      action: 'UPDATE_KRASHIVANTRI_OPS_CONFIG',
      entityType: 'site_settings',
      entityId: 'krashivantriOpsConfig',
      details: nextCfg as unknown as Record<string, unknown>,
    });

    res.json({ config: nextCfg });
  } catch {
    res.status(500).json({ error: 'Failed to update operations config.' });
  }
});

adminKrashi.get('/finance', async (_req, res) => {
  try {
    const [allBookings, allFarmerPays, allRefunds, allLedger, allPayouts, allPenalties, allFarmers, allPilots, androidSnap] =
      await Promise.all([
        db.select().from(serviceBookings),
        db.select().from(farmerPayments),
        db.select().from(farmerRefunds),
        db.select().from(pilotEarningLedger),
        db.select().from(pilotPayouts),
        db.select().from(penalties),
        db.select().from(farmers),
        db.select().from(dronePilots),
        fetchAndroidKrashivantriSnapshot(),
      ]);

    const verifiedCollections = allFarmerPays.filter((p) => p.status === 'verified');
    const totalFarmerCollectionsInr = verifiedCollections.reduce((s, p) => s + p.amountInr, 0);
    const totalRefundsInr = allRefunds.filter((r) => r.status === 'Processed' || r.status === 'Pending').reduce((s, r) => s + r.amountInr, 0);
    const settledPayoutsInr = allPayouts.filter((p) => p.status === 'Settled').reduce((s, p) => s + p.amountInr, 0);
    const pendingPayoutsInr = allLedger
      .filter((l) => l.status === 'ready_for_payout')
      .reduce((s, l) => s + l.netAmountInr, 0);
    const platformCommissionInr = allLedger
      .filter((l) => l.entryType === 'spraying_earning')
      .reduce((s, l) => s + l.commissionInr, 0);
    const totalPenaltiesInr = allPenalties.filter((pn) => pn.status !== 'Waived').reduce((s, pn) => s + pn.amountInr, 0);

    res.json({
      summary: {
        totalBookings: allBookings.length,
        settledBookings: allBookings.filter((b) => b.bookingStatus === 'Verified & Settled').length,
        totalFarmers: allFarmers.length,
        approvedFarmers: allFarmers.filter((f) => f.kycStatus === 'Approved').length,
        totalPilots: allPilots.length,
        approvedPilots: allPilots.filter((p) => p.kycStatus === 'Approved').length,
        totalFarmerCollectionsInr,
        totalRefundsInr,
        platformCommissionInr,
        settledPayoutsInr,
        pendingPayoutsInr: Math.max(0, pendingPayoutsInr),
        totalPenaltiesInr,
      },
      bookings: allBookings,
      farmerPayments: allFarmerPays,
      pilotPayouts: allPayouts,
      penalties: allPenalties,
      androidSummary: androidSnap.summary,
      androidOrders: androidSnap.orders,
    });
  } catch {
    res.status(500).json({ error: 'Failed to load KRASHIVANTRI consolidated finance.' });
  }
});

adminKrashi.get('/export/:reportType', async (req, res) => {
  try {
    const rt = req.params.reportType;
    let csv = '';
    if (rt === 'bookings') {
      const rows = await db.select().from(serviceBookings).orderBy(desc(serviceBookings.createdAt));
      csv = toCsv(
        ['Booking No', 'Crop', 'Acres', 'Rate', 'Total INR', 'Pilot Payout', 'Status', 'Payment', 'Preferred Date'],
        rows.map((r) => [r.bookingNumber, r.cropType, r.bookedAreaAcres, r.ratePerAcreInr, r.totalAmountInr, r.pilotPayoutInr, r.bookingStatus, r.paymentStatus, r.preferredDate])
      );
    } else if (rt === 'farmers') {
      const rows = await db.select().from(farmers).orderBy(desc(farmers.createdAt));
      csv = toCsv(
        ['Farmer Code', 'Name', 'Mobile', 'Village', 'District', 'State', 'Land Acres', 'KYC Status'],
        rows.map((r) => [r.farmerCode, r.fullName, r.mobile, r.village, r.district, r.state, r.totalLandAcres, r.kycStatus])
      );
    } else if (rt === 'pilots') {
      const rows = await db.select().from(dronePilots).orderBy(desc(dronePilots.createdAt));
      csv = toCsv(
        ['Pilot Code', 'Name', 'Mobile', 'District', 'RPC Number', 'Sprayed Acres', 'Penalty Pts', 'KYC Status'],
        rows.map((r) => [r.pilotCode, r.fullName, r.mobile, r.district, r.rpcNumber, r.totalSprayedAcres, r.penaltyPoints, r.kycStatus])
      );
    } else if (rt === 'farmer-payments') {
      const rows = await db.select().from(farmerPayments).orderBy(desc(farmerPayments.createdAt));
      csv = toCsv(
        ['Payment Ref', 'Booking ID', 'Farmer ID', 'Amount INR', 'Mode', 'Status', 'Razorpay Payment ID', 'Date'],
        rows.map((r) => [r.paymentRef, r.bookingId, r.farmerId, r.amountInr, r.mode, r.status, r.razorpayPaymentId, r.createdAt.toISOString()])
      );
    } else if (rt === 'pilot-payouts') {
      const rows = await db.select().from(pilotPayouts).orderBy(desc(pilotPayouts.createdAt));
      csv = toCsv(
        ['Payout Ref', 'Pilot ID', 'Amount INR', 'Bank Account', 'UTR/Provider ID', 'Status', 'Approved By', 'Date'],
        rows.map((r) => [r.payoutRef, r.pilotId, r.amountInr, r.bankAccountMasked, r.providerPayoutId, r.status, r.approvedBy, r.createdAt.toISOString()])
      );
    } else if (rt === 'penalties') {
      const rows = await db.select().from(penalties).orderBy(desc(penalties.createdAt));
      csv = toCsv(
        ['Penalty No', 'Target Type', 'Target ID', 'Category', 'Amount INR', 'Status', 'Appeal Status', 'Imposed By'],
        rows.map((r) => [r.penaltyNumber, r.targetType, r.targetId, r.reasonCategory, r.amountInr, r.status, r.appealStatus, r.imposedBy])
      );
    } else {
      return res.status(400).json({ error: 'Unsupported KRASHIVANTRI report type.' });
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="krashivantri-${rt}.csv"`);
    res.send(csv);
  } catch {
    res.status(500).json({ error: 'Failed to export report.' });
  }
});

krashivantriRouter.use('/admin/krashivantri', adminKrashi);
