import { getServerSupabaseClient } from '../lib/supabase-admin.ts';
import { haversineDistanceMeters } from './utils.ts';

export interface AndroidUserRow {
  id: string;
  phone: string;
  name: string;
  role: 'admin' | 'pilot' | 'farmer';
  created_at: number;
}

export interface AndroidFarmerProfileRow {
  user_id: string;
  farmer_id_number: string;
  coins: number;
}

export interface AndroidPilotProfileRow {
  user_id: string;
  drone_type: string;
  tank_capacity: number;
  license_document_uri: string;
  is_license_verified: boolean;
  bank_upi_id: string;
  wallet_balance: number;
  is_online: boolean;
  rating_average: number;
  rating_count: number;
  current_lat: number | null;
  current_lng: number | null;
  location_updated_at: number;
}

export interface AndroidOrderRow {
  id: string;
  farmer_id: string;
  assigned_pilot_id: string | null;
  field_polygon_coordinates: Array<{ lat: number; lng: number }> | Array<[number, number]>;
  acres_to_spray: number;
  location_address: string;
  total_amount: number;
  admin_commission: number;
  pilot_earnings: number;
  payment_method: 'online' | 'cash';
  payment_status: 'pending' | 'paid';
  order_status: 'pending' | 'accepted' | 'in_progress' | 'completed' | 'cancelled';
  pilot_eta_minutes: number;
  initial_eta_minutes: number;
  distance_km: number | null;
  field_center_lat: number;
  field_center_lng: number;
  accepted_at: number | null;
  pilot_rating: number | null;
  razorpay_payment_id: string | null;
  created_at: number;
}

export interface AndroidFarmBoundaryRow {
  id: string;
  farmer_id: string;
  farm_name: string;
  polygon_coordinates: Array<{ lat: number; lng: number }> | Array<[number, number]>;
  area_acres: number;
  area_hectares: number;
  center_lat: number;
  center_lng: number;
  created_at: string;
}

export interface AndroidOperatorLocationRow {
  id: string;
  name: string;
  role_type: 'drone_operator' | 'drone_mitra';
  lat: number;
  lng: number;
  drone_type: string;
  is_available: boolean;
  heading_degrees: number;
  updated_at: string;
}

export function normalizePolygonCoordinates(
  raw: unknown
): Array<{ lat: number; lng: number }> {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((pt: any) => {
      if (Array.isArray(pt) && pt.length >= 2) {
        return { lat: Number(pt[0]), lng: Number(pt[1]) };
      }
      if (pt && typeof pt === 'object') {
        return {
          lat: Number(pt.lat ?? pt.latitude),
          lng: Number(pt.lng ?? pt.lon ?? pt.longitude),
        };
      }
      return null;
    })
    .filter((pt): pt is { lat: number; lng: number } =>
      Boolean(pt && Number.isFinite(pt.lat) && Number.isFinite(pt.lng))
    );
}

export async function fetchAndroidKrashivantriSnapshot() {
  const client = getServerSupabaseClient();
  if (!client) {
    return {
      configured: false,
      users: [] as AndroidUserRow[],
      farmers: [] as Array<AndroidUserRow & { profile: AndroidFarmerProfileRow | null }>,
      pilots: [] as Array<
        AndroidUserRow & {
          profile: AndroidPilotProfileRow | null;
          operatorLocation: AndroidOperatorLocationRow | null;
        }
      >,
      orders: [] as Array<
        AndroidOrderRow & {
          polygon: Array<{ lat: number; lng: number }>;
          farmer: AndroidUserRow | null;
          assignedPilot: AndroidUserRow | null;
        }
      >,
      farmBoundaries: [] as Array<
        AndroidFarmBoundaryRow & {
          polygon: Array<{ lat: number; lng: number }>;
          farmer: AndroidUserRow | null;
        }
      >,
      operatorLocations: [] as AndroidOperatorLocationRow[],
      summary: {
        totalFarmers: 0,
        totalPilots: 0,
        onlinePilots: 0,
        verifiedPilots: 0,
        totalOrders: 0,
        pendingOrders: 0,
        activeOrders: 0,
        completedOrders: 0,
        totalOrderValueInr: 0,
        paidRevenueInr: 0,
        adminCommissionInr: 0,
        pilotEarningsInr: 0,
        totalFarmBoundaries: 0,
      },
    };
  }

  const [usersRes, farmerProfRes, pilotProfRes, ordersRes, boundariesRes, opLocRes] =
    await Promise.all([
      client.from('users').select('*').order('created_at', { ascending: false }),
      client.from('farmer_profiles').select('*'),
      client.from('pilot_profiles').select('*'),
      client.from('orders').select('*').order('created_at', { ascending: false }),
      client.from('farm_boundaries').select('*').order('created_at', { ascending: false }),
      client.from('operator_locations').select('*').order('updated_at', { ascending: false }),
    ]);

  const users = (usersRes.data || []) as AndroidUserRow[];
  const farmerProfiles = (farmerProfRes.data || []) as AndroidFarmerProfileRow[];
  const pilotProfiles = (pilotProfRes.data || []) as AndroidPilotProfileRow[];
  const ordersRaw = (ordersRes.data || []) as AndroidOrderRow[];
  const boundariesRaw = (boundariesRes.data || []) as AndroidFarmBoundaryRow[];
  const operatorLocations = (opLocRes.data || []) as AndroidOperatorLocationRow[];

  const userMap = new Map(users.map((u) => [u.id, u]));
  const farmerProfMap = new Map(farmerProfiles.map((fp) => [fp.user_id, fp]));
  const pilotProfMap = new Map(pilotProfiles.map((pp) => [pp.user_id, pp]));
  const opLocMap = new Map(operatorLocations.map((ol) => [ol.id, ol]));

  const farmers = users
    .filter((u) => u.role === 'farmer')
    .map((u) => ({
      ...u,
      profile: farmerProfMap.get(u.id) || null,
    }));

  const pilots = users
    .filter((u) => u.role === 'pilot')
    .map((u) => ({
      ...u,
      profile: pilotProfMap.get(u.id) || null,
      operatorLocation: opLocMap.get(u.id) || null,
    }));

  const orders = ordersRaw.map((o) => ({
    ...o,
    polygon: normalizePolygonCoordinates(o.field_polygon_coordinates),
    farmer: userMap.get(o.farmer_id) || null,
    assignedPilot: o.assigned_pilot_id ? userMap.get(o.assigned_pilot_id) || null : null,
  }));

  const farmBoundaries = boundariesRaw.map((fb) => ({
    ...fb,
    polygon: normalizePolygonCoordinates(fb.polygon_coordinates),
    farmer: userMap.get(fb.farmer_id) || null,
  }));

  const paidOrders = orders.filter((o) => o.payment_status === 'paid');

  return {
    configured: true,
    users,
    farmers,
    pilots,
    orders,
    farmBoundaries,
    operatorLocations,
    summary: {
      totalFarmers: farmers.length,
      totalPilots: pilots.length,
      onlinePilots: pilots.filter((p) => p.profile?.is_online).length,
      verifiedPilots: pilots.filter((p) => p.profile?.is_license_verified).length,
      totalOrders: orders.length,
      pendingOrders: orders.filter((o) => o.order_status === 'pending').length,
      activeOrders: orders.filter((o) => o.order_status === 'accepted' || o.order_status === 'in_progress').length,
      completedOrders: orders.filter((o) => o.order_status === 'completed').length,
      totalOrderValueInr: Number(orders.reduce((s, o) => s + Number(o.total_amount || 0), 0).toFixed(2)),
      paidRevenueInr: Number(paidOrders.reduce((s, o) => s + Number(o.total_amount || 0), 0).toFixed(2)),
      adminCommissionInr: Number(paidOrders.reduce((s, o) => s + Number(o.admin_commission || 0), 0).toFixed(2)),
      pilotEarningsInr: Number(paidOrders.reduce((s, o) => s + Number(o.pilot_earnings || 0), 0).toFixed(2)),
      totalFarmBoundaries: farmBoundaries.length,
    },
  };
}

export async function verifyAndroidPilotLicense(userId: string, isVerified: boolean) {
  const client = getServerSupabaseClient();
  if (!client) throw new Error('Supabase client is not configured.');

  const { data, error } = await client
    .from('pilot_profiles')
    .update({ is_license_verified: isVerified })
    .eq('user_id', userId)
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function assignAndroidOrderPilot(
  orderId: string,
  options: { pilotUserId?: string; autoNearest?: boolean }
) {
  const client = getServerSupabaseClient();
  if (!client) throw new Error('Supabase client is not configured.');

  const { data: order, error: orderErr } = await client
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .single();
  if (orderErr || !order) throw new Error(orderErr?.message || 'Android order not found.');

  let targetPilotId = options.pilotUserId || '';
  let distanceKm = order.distance_km as number | null;

  if (options.autoNearest) {
    const { data: pilots } = await client.from('pilot_profiles').select('*').eq('is_online', true);
    const candidates = (pilots || [])
      .filter((p: any) => p.current_lat != null && p.current_lng != null)
      .map((p: any) => {
        const distM = haversineDistanceMeters(
          Number(p.current_lat),
          Number(p.current_lng),
          Number(order.field_center_lat),
          Number(order.field_center_lng)
        );
        return { userId: p.user_id as string, distKm: Number((distM / 1000).toFixed(2)) };
      })
      .sort((a, b) => a.distKm - b.distKm);

    if (candidates.length === 0) {
      throw new Error('No online Android pilot with active GPS location found.');
    }
    targetPilotId = candidates[0].userId;
    distanceKm = candidates[0].distKm;
  }

  if (!targetPilotId) {
    throw new Error('Target pilot user ID is required.');
  }

  const etaMinutes = distanceKm != null ? Math.max(1, Math.round(distanceKm * 2.5)) : 15;
  const { data: updated, error: updErr } = await client
    .from('orders')
    .update({
      assigned_pilot_id: targetPilotId,
      order_status: 'accepted',
      accepted_at: Date.now(),
      distance_km: distanceKm,
      pilot_eta_minutes: etaMinutes,
      initial_eta_minutes: etaMinutes,
    })
    .eq('id', orderId)
    .select('*')
    .single();

  if (updErr) throw new Error(updErr.message);
  return updated;
}

export async function updateAndroidOrderStatus(
  orderId: string,
  orderStatus: 'pending' | 'accepted' | 'in_progress' | 'completed' | 'cancelled',
  paymentStatus?: 'pending' | 'paid'
) {
  const client = getServerSupabaseClient();
  if (!client) throw new Error('Supabase client is not configured.');

  const patch: Record<string, any> = { order_status: orderStatus };
  if (paymentStatus) patch.payment_status = paymentStatus;
  if (orderStatus === 'completed') patch.pilot_eta_minutes = 0;

  const { data, error } = await client
    .from('orders')
    .update(patch)
    .eq('id', orderId)
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function syncWebFarmerToSupabase(input: {
  webUserUid: string;
  phone: string;
  fullName: string;
  farmerCode: string;
}) {
  const client = getServerSupabaseClient();
  if (!client || !input.phone) return;
  try {
    const cleanPhone = input.phone.trim();
    const { data: existingByPhone } = await client
      .from('users')
      .select('id')
      .eq('phone', cleanPhone)
      .maybeSingle();

    const targetId = existingByPhone?.id || `web_${input.webUserUid}`;
    await client.from('users').upsert(
      {
        id: targetId,
        phone: cleanPhone,
        name: input.fullName,
        role: 'farmer',
        created_at: Date.now(),
      },
      { onConflict: 'id' }
    );
    await client.from('farmer_profiles').upsert(
      {
        user_id: targetId,
        farmer_id_number: input.farmerCode,
        coins: 0,
      },
      { onConflict: 'user_id' }
    );
  } catch (err) {
    console.warn('[Supabase Sync] Farmer sync skipped:', (err as Error)?.message);
  }
}

export async function syncWebFarmBoundaryToSupabase(input: {
  farmerUidOrPhone: string;
  farmName: string;
  polygon: Array<{ lat: number; lng: number }>;
  areaAcres: number;
  centerLat: number;
  centerLng: number;
}) {
  const client = getServerSupabaseClient();
  if (!client) return;
  try {
    const { data: existingUser } = await client
      .from('users')
      .select('id')
      .or(`id.eq.web_${input.farmerUidOrPhone},phone.eq.${input.farmerUidOrPhone}`)
      .maybeSingle();
    const farmerId = existingUser?.id || `web_${input.farmerUidOrPhone}`;

    await client.from('farm_boundaries').insert({
      farmer_id: farmerId,
      farm_name: input.farmName,
      polygon_coordinates: input.polygon,
      area_acres: Number(input.areaAcres.toFixed(2)),
      area_hectares: Number((input.areaAcres * 0.404686).toFixed(2)),
      center_lat: input.centerLat,
      center_lng: input.centerLng,
    });
  } catch (err) {
    console.warn('[Supabase Sync] Farm boundary sync skipped:', (err as Error)?.message);
  }
}

export async function syncWebPilotToSupabase(input: {
  webUserUid: string;
  phone: string;
  fullName: string;
  droneType?: string;
  tankCapacity?: number;
  isLicenseVerified?: boolean;
  bankUpiId?: string;
  isOnline?: boolean;
  lat?: number | null;
  lng?: number | null;
  headingDeg?: number | null;
}) {
  const client = getServerSupabaseClient();
  if (!client || !input.phone) return;
  try {
    const cleanPhone = input.phone.trim();
    const { data: existingByPhone } = await client
      .from('users')
      .select('id')
      .eq('phone', cleanPhone)
      .maybeSingle();

    const targetId = existingByPhone?.id || `web_${input.webUserUid}`;
    await client.from('users').upsert(
      {
        id: targetId,
        phone: cleanPhone,
        name: input.fullName,
        role: 'pilot',
        created_at: Date.now(),
      },
      { onConflict: 'id' }
    );

    const profilePatch: Record<string, any> = {
      user_id: targetId,
      drone_type: input.droneType || 'quadcopter',
      tank_capacity: input.tankCapacity ?? 10,
    };
    if (input.isLicenseVerified !== undefined) profilePatch.is_license_verified = input.isLicenseVerified;
    if (input.bankUpiId !== undefined) profilePatch.bank_upi_id = input.bankUpiId;
    if (input.isOnline !== undefined) profilePatch.is_online = input.isOnline;
    if (input.lat != null && input.lng != null) {
      profilePatch.current_lat = input.lat;
      profilePatch.current_lng = input.lng;
      profilePatch.location_updated_at = Date.now();
    }

    await client.from('pilot_profiles').upsert(profilePatch, { onConflict: 'user_id' });

    if (input.lat != null && input.lng != null) {
      await client.from('operator_locations').upsert(
        {
          id: targetId,
          name: input.fullName,
          role_type: 'drone_operator',
          lat: input.lat,
          lng: input.lng,
          drone_type: input.droneType || 'quadcopter',
          is_available: input.isOnline ?? true,
          heading_degrees: input.headingDeg ?? 0,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      );
    } else if (input.isOnline !== undefined) {
      await client
        .from('operator_locations')
        .update({ is_available: input.isOnline, updated_at: new Date().toISOString() })
        .eq('id', targetId);
    }
  } catch (err) {
    console.warn('[Supabase Sync] Pilot sync skipped:', (err as Error)?.message);
  }
}

export async function syncWebBookingToSupabase(input: {
  bookingNumber: string;
  farmerUid: string;
  farmerPhone: string;
  farmerName: string;
  assignedPilotUid?: string | null;
  assignedPilotPhone?: string | null;
  polygon: Array<{ lat: number; lng: number }>;
  acresToSpray: number;
  locationAddress: string;
  totalAmount: number;
  adminCommission: number;
  pilotEarnings: number;
  paymentStatus: 'pending' | 'paid';
  orderStatus: 'pending' | 'accepted' | 'in_progress' | 'completed' | 'cancelled';
  fieldCenterLat: number;
  fieldCenterLng: number;
  razorpayPaymentId?: string | null;
}) {
  const client = getServerSupabaseClient();
  if (!client) return;
  try {
    const farmerCleanPhone = input.farmerPhone.trim();
    let farmerSupabaseId = `web_${input.farmerUid}`;
    if (farmerCleanPhone) {
      const { data: existingFarmer } = await client
        .from('users')
        .select('id')
        .eq('phone', farmerCleanPhone)
        .maybeSingle();
      if (existingFarmer?.id) {
        farmerSupabaseId = existingFarmer.id;
      } else {
        await client.from('users').upsert(
          {
            id: farmerSupabaseId,
            phone: farmerCleanPhone,
            name: input.farmerName,
            role: 'farmer',
            created_at: Date.now(),
          },
          { onConflict: 'id' }
        );
      }
    }

    let pilotSupabaseId: string | null = null;
    if (input.assignedPilotPhone || input.assignedPilotUid) {
      const pPhone = (input.assignedPilotPhone || '').trim();
      if (pPhone) {
        const { data: existingPilot } = await client
          .from('users')
          .select('id')
          .eq('phone', pPhone)
          .maybeSingle();
        if (existingPilot?.id) pilotSupabaseId = existingPilot.id;
      }
      if (!pilotSupabaseId && input.assignedPilotUid) {
        pilotSupabaseId = `web_${input.assignedPilotUid}`;
      }
    }

    await client.from('orders').upsert(
      {
        id: input.bookingNumber,
        farmer_id: farmerSupabaseId,
        assigned_pilot_id: pilotSupabaseId,
        field_polygon_coordinates: input.polygon,
        acres_to_spray: input.acresToSpray,
        location_address: input.locationAddress,
        total_amount: input.totalAmount,
        admin_commission: input.adminCommission,
        pilot_earnings: input.pilotEarnings,
        payment_method: 'online',
        payment_status: input.paymentStatus,
        order_status: input.orderStatus,
        field_center_lat: input.fieldCenterLat,
        field_center_lng: input.fieldCenterLng,
        razorpay_payment_id: input.razorpayPaymentId || null,
        accepted_at: input.orderStatus === 'accepted' ? Date.now() : null,
        created_at: Date.now(),
      },
      { onConflict: 'id' }
    );
  } catch (err) {
    console.warn('[Supabase Sync] Booking sync skipped:', (err as Error)?.message);
  }
}
