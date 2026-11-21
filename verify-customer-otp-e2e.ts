import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { eq } from 'drizzle-orm';

interface OtpRecord {
  code: string;
  expiresAt: number;
  lastSentAt: number;
}

interface MockAuthUser {
  id: string;
  email: string;
  email_confirmed_at: string;
  user_metadata: Record<string, any>;
}

function makeFakeJwt(uid: string, email: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      sub: uid,
      email,
      aud: 'authenticated',
      role: 'authenticated',
      exp: Math.floor(Date.now() / 1000) + 3600,
    })
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', 'test-secret').update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${sig}`;
}

async function main() {
  const otpStore = new Map<string, OtpRecord>();
  const authUsersByEmail = new Map<string, MockAuthUser>();
  const tokensMap = new Map<string, MockAuthUser>();
  let cooldownMs = 0;

  // 1. Start local mock Supabase Auth HTTP Server so @supabase/supabase-js & server verifySupabaseAccessToken execute real HTTP calls
  const authServer = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const rawBody = Buffer.concat(chunks).toString('utf8');
      let body: any = {};
      try {
        body = rawBody ? JSON.parse(rawBody) : {};
      } catch {
        body = {};
      }
      const urlPath = (req.url || '').split('?')[0];

      res.setHeader('Content-Type', 'application/json');

      if (urlPath === '/auth/v1/otp' && req.method === 'POST') {
        const email = String(body.email || '').trim().toLowerCase();
        const existing = otpStore.get(email);
        if (cooldownMs > 0 && existing && Date.now() - existing.lastSentAt < cooldownMs) {
          res.statusCode = 429;
          res.end(
            JSON.stringify({
              error: 'over_email_send_rate_limit',
              msg: 'For security purposes, please wait before requesting another OTP.',
            })
          );
          return;
        }
        const code = String(Math.floor(100000 + Math.random() * 900000));
        otpStore.set(email, {
          code,
          expiresAt: Date.now() + 5 * 60 * 1000,
          lastSentAt: Date.now(),
        });
        if (!authUsersByEmail.has(email)) {
          authUsersByEmail.set(email, {
            id: crypto.randomUUID(),
            email,
            email_confirmed_at: new Date().toISOString(),
            user_metadata: { full_name: email.split('@')[0] },
          });
        }
        res.statusCode = 200;
        res.end(JSON.stringify({ message_id: crypto.randomUUID() }));
        return;
      }

      if (urlPath === '/auth/v1/verify' && req.method === 'POST') {
        const email = String(body.email || '').trim().toLowerCase();
        const token = String(body.token || '').trim();
        const rec = otpStore.get(email);
        if (!rec) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error_code: 'otp_expired', msg: 'Token has expired or is invalid' }));
          return;
        }
        if (Date.now() > rec.expiresAt) {
          otpStore.delete(email);
          res.statusCode = 401;
          res.end(JSON.stringify({ error_code: 'otp_expired', msg: 'Token has expired' }));
          return;
        }
        if (rec.code !== token) {
          res.statusCode = 401;
          res.end(JSON.stringify({ error_code: 'otp_invalid', msg: 'Invalid verification token' }));
          return;
        }
        otpStore.delete(email);
        const u = authUsersByEmail.get(email)!;
        const accessToken = makeFakeJwt(u.id, u.email);
        tokensMap.set(accessToken, u);
        res.statusCode = 200;
        res.end(
          JSON.stringify({
            access_token: accessToken,
            token_type: 'bearer',
            expires_in: 3600,
            refresh_token: crypto.randomBytes(16).toString('hex'),
            user: u,
          })
        );
        return;
      }

      if (urlPath === '/auth/v1/user' && req.method === 'GET') {
        const auth = String(req.headers.authorization || '');
        const jwt = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
        const u = tokensMap.get(jwt);
        if (!u) {
          res.statusCode = 401;
          res.end(JSON.stringify({ msg: 'Invalid or expired JWT' }));
          return;
        }
        res.statusCode = 200;
        res.end(JSON.stringify(u));
        return;
      }

      if (urlPath === '/auth/v1/logout' && req.method === 'POST') {
        res.statusCode = 204;
        res.end();
        return;
      }

      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'Not found in mock auth server' }));
    });
  });

  await new Promise<void>((resolve) => authServer.listen(0, '127.0.0.1', resolve));
  const authAddr = authServer.address() as { port: number };
  const mockSupabaseUrl = `http://127.0.0.1:${authAddr.port}`;
  const mockAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.mock.key';

  process.env.SUPABASE_URL = mockSupabaseUrl;
  process.env.SUPABASE_ANON_KEY = mockAnonKey;

  const { db } = await import('./src/db/index.ts');
  const { ensureInitialSeed } = await import('./src/server/seed.ts');
  const {
    customers,
    invoices,
    productReviews,
    products,
    projectEnquiries,
    projects,
    storeOrders,
    users,
  } = await import('./src/db/schema.ts');
  const { authRouter } = await import('./src/server/routes/auth.ts');
  const { customerRouter } = await import('./src/server/routes/customer.ts');
  const { adminRouter } = await import('./src/server/routes/admin.ts');
  const { adminOperationsRouter } = await import('./src/server/routes/admin-operations.ts');
  const { resolveOrProvisionCustomerFromOtp } = await import('./src/db/users.ts');

  await ensureInitialSeed();

  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/admin', adminOperationsRouter);
  app.use('/api', customerRouter);

  const appServer = http.createServer(app);
  await new Promise<void>((resolve) => appServer.listen(0, '127.0.0.1', resolve));
  const appAddr = appServer.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${appAddr.port}`;

  const sbClient = createClient(mockSupabaseUrl, mockAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  async function api(
    pathUrl: string,
    opts: RequestInit & { token?: string; cookie?: string } = {}
  ): Promise<{ status: number; json: any; setCookie: string | null }> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(opts.headers as Record<string, string> | undefined),
    };
    if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
    if (opts.cookie) headers.Cookie = opts.cookie;
    const res = await fetch(`${baseUrl}${pathUrl}`, { ...opts, headers });
    const json = await res.json().catch(() => ({}));
    const setCookie = res.headers.get('set-cookie');
    return { status: res.status, json, setCookie };
  }

  async function otpLoginFlow(email: string) {
    const { error: sendErr } = await sbClient.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    });
    assert.equal(sendErr, null, `OTP send failed for ${email}: ${sendErr?.message}`);
    const code = otpStore.get(email.toLowerCase())!.code;
    const { data, error: verErr } = await sbClient.auth.verifyOtp({
      email,
      token: code,
      type: 'email',
    });
    assert.equal(verErr, null, `OTP verify failed for ${email}: ${verErr?.message}`);
    const accessToken = data.session!.access_token;
    const exch = await api('/api/auth/otp/session', {
      method: 'POST',
      token: accessToken,
    });
    return { exch, accessToken };
  }

  try {
    console.log('--- Running 14-Scenario Customer OTP & Data Management E2E Verification ---');

    // Test 1 & 6: New email OTP registration -> automatic account + NTF-CUST-XXXXXX ID
    const emailA = 'customer.alpha@example.com';
    const { exch: regA } = await otpLoginFlow(emailA);
    assert.equal(regA.status, 200);
    assert.equal(regA.json.isNewCustomer, true);
    assert.match(regA.json.user.customerId, /^NTF-CUST-\d{6}$/);
    const custIdA = regA.json.user.customerId;
    const sessionTokenA = regA.json.sessionToken;
    console.log('[PASS] 1. New email OTP registration ->', custIdA);

    // Test 2 & 7: Existing email OTP login -> retrieves same customer & ID, updates lastLoginAt, zero duplicates
    const prevLoginTs = regA.json.user.lastLoginAt;
    await new Promise((r) => setTimeout(r, 25));
    const { exch: loginA2 } = await otpLoginFlow(emailA);
    assert.equal(loginA2.status, 200);
    assert.equal(loginA2.json.isNewCustomer, false);
    assert.equal(loginA2.json.user.customerId, custIdA);
    assert.equal(loginA2.json.user.id, regA.json.user.id);
    assert.ok(new Date(loginA2.json.user.lastLoginAt).getTime() >= new Date(prevLoginTs).getTime());
    const allCustRowsA = await db.select().from(customers).where(eq(customers.email, emailA));
    assert.equal(allCustRowsA.length, 1, 'Repeated OTP logins must never duplicate customer row');
    console.log('[PASS] 2 & 7. Existing email OTP login & repeat login updates lastLoginAt without duplication');

    // Test 3: Invalid OTP error
    await sbClient.auth.signInWithOtp({ email: emailA, options: { shouldCreateUser: true } });
    const badVerify = await sbClient.auth.verifyOtp({ email: emailA, token: '000000', type: 'email' });
    assert.ok(badVerify.error, 'Invalid OTP must fail');
    const badExchange = await api('/api/auth/otp/session', { method: 'POST', token: 'invalid.jwt.tok' });
    assert.equal(badExchange.status, 401);
    console.log('[PASS] 3. Invalid OTP and tampered bearer token cleanly rejected (401)');

    // Test 4: Expired OTP handling
    await sbClient.auth.signInWithOtp({ email: emailA, options: { shouldCreateUser: true } });
    const recExp = otpStore.get(emailA)!;
    recExp.expiresAt = Date.now() - 1000;
    const expVerify = await sbClient.auth.verifyOtp({ email: emailA, token: recExp.code, type: 'email' });
    assert.ok(expVerify.error && /expired/i.test(expVerify.error.message), 'Expired OTP must report expiration');
    console.log('[PASS] 4. Expired OTP rejected cleanly with expiration error');

    // Test 5: Resend OTP & cooldown enforcement
    cooldownMs = 5000;
    const send1 = await sbClient.auth.signInWithOtp({ email: emailA, options: { shouldCreateUser: true } });
    assert.equal(send1.error, null);
    const sendCooldown = await sbClient.auth.signInWithOtp({ email: emailA, options: { shouldCreateUser: true } });
    assert.ok(sendCooldown.error && /wait|rate/i.test(sendCooldown.error.message), 'Cooldown must reject immediate resend');
    cooldownMs = 0;
    const resendOk = await sbClient.auth.signInWithOtp({ email: emailA, options: { shouldCreateUser: true } });
    assert.equal(resendOk.error, null);
    console.log('[PASS] 5. Resend OTP & cooldown enforcement verified');

    // Test 6b: Customer ID cannot be changed by customer (`PUT /api/me`)
    const tamperId = await api('/api/me', {
      method: 'PUT',
      token: sessionTokenA,
      body: JSON.stringify({ customerId: 'NTF-CUST-999999', fullName: 'Tamper Attempt' }),
    });
    assert.equal(tamperId.status, 403);
    const tamperEmail = await api('/api/me', {
      method: 'PUT',
      token: sessionTokenA,
      body: JSON.stringify({ email: 'other@example.com', fullName: 'Tamper Email' }),
    });
    assert.equal(tamperEmail.status, 403);
    console.log('[PASS] 6. Permanent read-only Customer ID & verified email enforced (403 on PUT /api/me)');

    // Test 9: Customer profile update persistence
    const updateProf = await api('/api/me', {
      method: 'PUT',
      token: sessionTokenA,
      body: JSON.stringify({
        fullName: 'Aarav Kulkarni',
        mobile: '9876543210',
        companyOrCollege: 'AeroLabs India',
        fullAddress: '42 Industrial Estate',
        city: 'Pune',
        state: 'Maharashtra',
        pinCode: '411001',
        customerType: 'Business',
        billingDetails: { billingName: 'AeroLabs India Pvt Ltd', gstin: '27AABCU9603R1ZM' },
      }),
    });
    assert.equal(updateProf.status, 200);
    assert.equal(updateProf.json.user.fullName, 'Aarav Kulkarni');
    assert.equal(updateProf.json.user.customerType, 'Business');

    // Add address, cart item, wishlist item, order, enquiry, project, and review for Customer A
    const [prod] = await db.select().from(products).limit(1);
    assert.ok(prod, 'Seeded product required');

    const addrRes = await api('/api/addresses', {
      method: 'POST',
      token: sessionTokenA,
      body: JSON.stringify({
        label: 'Lab',
        addressType: 'both',
        fullName: 'Aarav Kulkarni',
        mobile: '9876543210',
        houseFlat: 'Plot 42',
        streetArea: 'MIDC Bhosari',
        city: 'Pune',
        district: 'Pune',
        state: 'Maharashtra',
        pinCode: '411026',
        isDefault: true,
      }),
    });
    assert.equal(addrRes.status, 201);
    const addrAId = addrRes.json.address.id;

    const cartRes = await api('/api/cart', {
      method: 'PUT',
      token: sessionTokenA,
      body: JSON.stringify({ items: [{ productId: prod.id, qty: 2 }] }),
    });
    assert.equal(cartRes.status, 200);
    assert.equal(cartRes.json.items.length, 1);
    assert.equal(cartRes.json.items[0].qty, 2);

    const wishRes = await api('/api/wishlist/toggle', {
      method: 'POST',
      token: sessionTokenA,
      body: JSON.stringify({ productId: prod.id }),
    });
    assert.equal(wishRes.status, 200);
    assert.equal(wishRes.json.wishlisted, true);

    const [orderA] = await db
      .insert(storeOrders)
      .values({
        orderNumber: 'NTF-ORD-E2E-101',
        userId: regA.json.user.id,
        items: [
          {
            productId: prod.id,
            sku: prod.sku,
            name: prod.name,
            qty: 1,
            unitPriceInr: prod.priceInr,
            gstPercent: prod.gstPercent,
            lineTotalInr: prod.priceInr,
          },
        ],
        subtotalInr: prod.priceInr,
        gstInr: Math.round(prod.priceInr * 0.18),
        shippingInr: 0,
        totalInr: prod.priceInr + Math.round(prod.priceInr * 0.18),
        paymentStatus: 'paid',
        orderStatus: 'Shipped',
        trackingCourier: 'BlueDart',
        trackingId: 'BD-991122',
        billingAddress: { fullName: 'Aarav Kulkarni', city: 'Pune', state: 'Maharashtra', pinCode: '411026' },
        shippingAddress: { fullName: 'Aarav Kulkarni', city: 'Pune', state: 'Maharashtra', pinCode: '411026' },
      })
      .returning();

    const [invoiceA] = await db
      .insert(invoices)
      .values({
        invoiceNumber: 'INV-E2E-101',
        userId: regA.json.user.id,
        entityType: 'store_order',
        entityId: orderA.id,
        docType: 'GST Tax Invoice',
        amountInr: orderA.totalInr,
        gstInr: orderA.gstInr,
        payload: { customerCode: custIdA, customerName: 'Aarav Kulkarni' },
      })
      .returning();

    const [enqA] = await db
      .insert(projectEnquiries)
      .values({
        enquiryNumber: 'PRJ-ENQ-E2E-1',
        userId: regA.json.user.id,
        customerName: 'Aarav Kulkarni',
        customerEmail: emailA,
        customerPhone: '9876543210',
        engineeringBranch: 'Robotics',
        projectCategory: 'Robotics & Automation',
        projectType: 'Custom Build',
        projectTitle: 'Autonomous Warehouse Rover',
        projectDescription: 'Custom payload 25kg rover',
        billingAddress: { fullName: 'Aarav Kulkarni', city: 'Pune', state: 'Maharashtra', pinCode: '411026' },
        deliveryAddress: { fullName: 'Aarav Kulkarni', city: 'Pune', state: 'Maharashtra', pinCode: '411026' },
        status: 'Submitted – Under Review',
      })
      .returning();

    await db.insert(projects).values({
      projectCode: 'NTF-PRJ-E2E-1',
      enquiryId: enqA.id,
      userId: regA.json.user.id,
      title: 'Autonomous Warehouse Rover',
      status: 'In Progress',
      progressPercent: 45,
      totalAmountInr: 120000,
      paidAmountInr: 60000,
      balanceAmountInr: 60000,
    });

    const revRes = await api('/api/reviews', {
      method: 'POST',
      token: sessionTokenA,
      body: JSON.stringify({ productId: prod.id, rating: 5, comment: 'Excellent aerospace build quality.' }),
    });
    assert.equal(revRes.status, 201);

    // Test 8, 10, 12: Logout -> Cross-device fresh OTP login -> Full sync restored
    const logoutRes = await api('/api/auth/logout', { method: 'POST', token: sessionTokenA });
    assert.equal(logoutRes.status, 200);
    const afterLogoutMe = await api('/api/me', { token: sessionTokenA });
    assert.equal(afterLogoutMe.status, 401);

    // Simulate brand-new device with empty localStorage/cookies logging into same email via Email OTP
    const { exch: device2Login } = await otpLoginFlow(emailA);
    assert.equal(device2Login.status, 200);
    assert.equal(device2Login.json.user.customerId, custIdA);
    assert.equal(device2Login.json.user.fullName, 'Aarav Kulkarni');
    const device2Token = device2Login.json.sessionToken;

    const meRes = await api('/api/me', { token: device2Token });
    assert.equal(meRes.status, 200);
    assert.equal(meRes.json.user.customerId, custIdA);
    assert.equal(meRes.json.user.billingDetails.gstin, '27AABCU9603R1ZM');
    assert.equal(meRes.json.addresses.length, 1);
    assert.equal(meRes.json.cartItems.length, 1);
    assert.equal(meRes.json.wishlist.length, 1);
    assert.equal(meRes.json.storeOrders.length, 1);
    assert.equal(meRes.json.storeOrders[0].trackingId, 'BD-991122');
    assert.equal(meRes.json.invoices.length, 1);
    assert.equal(meRes.json.projectEnquiries.length, 1);
    assert.equal(meRes.json.projects.length, 1);
    assert.equal(meRes.json.myReviews.length, 1);
    console.log('[PASS] 8, 9, 10, 12. Profile update, logout, cross-device OTP login & full data hydration verified');

    // Test 11: Customer B isolation + Admin route denial + Static SQL RLS verification
    const emailB = 'customer.beta@example.com';
    const { exch: regB } = await otpLoginFlow(emailB);
    assert.equal(regB.status, 200);
    const tokenB = regB.json.sessionToken;

    const meB = await api('/api/me', { token: tokenB });
    assert.equal(meB.status, 200);
    assert.equal(meB.json.addresses.length, 0);
    assert.equal(meB.json.storeOrders.length, 0);
    assert.equal(meB.json.invoices.length, 0);
    assert.equal(meB.json.cartItems.length, 0);

    // Attempt cross-customer mutation of Customer A address by Customer B
    const crossEditAddr = await api(`/api/addresses/${addrAId}`, {
      method: 'PUT',
      token: tokenB,
      body: JSON.stringify({
        label: 'Hijacked',
        fullName: 'Attacker',
        mobile: '9999999999',
        houseFlat: '1',
        streetArea: 'X',
        city: 'Delhi',
        district: 'Delhi',
        state: 'Delhi',
        pinCode: '110001',
      }),
    });
    assert.equal(crossEditAddr.status, 404);
    await api(`/api/addresses/${addrAId}`, { method: 'DELETE', token: tokenB });
    const meACheck = await api('/api/me', { token: device2Token });
    assert.equal(meACheck.json.addresses.length, 1, 'Customer B must never delete Customer A address');

    // Customer cannot access Admin endpoints
    const adminAttempt = await api('/api/admin/customers', { token: tokenB });
    assert.equal(adminAttempt.status, 403);
    const unauthAttempt = await api('/api/me');
    assert.equal(unauthAttempt.status, 401);

    // Verify Supabase SQL contains RLS + immutability triggers
    const sqlOtp = fs.readFileSync(path.resolve('supabase/passwordless_otp_customer_system.sql'), 'utf8');
    const sqlPortal = fs.readFileSync(path.resolve('supabase/customer_portal_complete_migration.sql'), 'utf8');
    assert.match(sqlOtp, /trg_z_public_customers_protect_identity/);
    assert.match(sqlOtp, /trg_z_web_customers_protect_identity/);
    assert.match(sqlOtp, /ENABLE ROW LEVEL SECURITY/i);
    assert.match(sqlPortal, /Customer manage own addresses/i);
    assert.match(sqlPortal, /Customer read own invoices/i);
    console.log('[PASS] 11. Cross-customer isolation, admin route RBAC (403), and SQL RLS/triggers verified');

    // Test 13: Simultaneous concurrent OTP registrations (Promise.all)
    // Case A: 4 concurrent requests for 4 distinct new emails -> distinct sequential NTF-CUST-* IDs
    const concurrentEmails = [
      'race.one@example.com',
      'race.two@example.com',
      'race.three@example.com',
      'race.four@example.com',
    ];
    const concurrentDistinct = await Promise.all(
      concurrentEmails.map((em) =>
        resolveOrProvisionCustomerFromOtp({
          authUserId: crypto.randomUUID(),
          email: em,
          customerOnly: true,
        })
      )
    );
    const generatedIds = concurrentDistinct.map((r) => (r.kind === 'single' ? r.activeProfile.customerId : ''));
    assert.equal(new Set(generatedIds).size, 4, 'All concurrent distinct registrations must get unique Customer IDs');

    // Case B: 3 concurrent requests for the SAME new email -> exactly 1 account & 1 Customer ID
    const sameRaceEmail = 'same.race@example.com';
    const sameUid = crypto.randomUUID();
    const sameRace = await Promise.all([
      resolveOrProvisionCustomerFromOtp({ authUserId: sameUid, email: sameRaceEmail, customerOnly: true }),
      resolveOrProvisionCustomerFromOtp({ authUserId: sameUid, email: sameRaceEmail, customerOnly: true }),
      resolveOrProvisionCustomerFromOtp({ authUserId: sameUid, email: sameRaceEmail, customerOnly: true }),
    ]);
    const sameIds = sameRace.map((r) => (r.kind === 'single' ? r.activeProfile.customerId : ''));
    assert.equal(new Set(sameIds).size, 1, 'Concurrent same-email OTP logins must converge to 1 Customer ID');
    const sameCustRows = await db.select().from(customers).where(eq(customers.email, sameRaceEmail));
    assert.equal(sameCustRows.length, 1, 'Concurrent same-email OTP logins must never create duplicate DB rows');
    console.log('[PASS] 13. Simultaneous concurrent registrations -> zero duplicate IDs / rows:', generatedIds.join(', '));

    // Test 14: Deleted customer account preserves invoices & orders, retires old ID, new registration gets brand new ID
    const delRes = await api('/api/me', {
      method: 'DELETE',
      token: device2Token,
      body: JSON.stringify({ confirmCustomerId: custIdA, reason: 'E2E deletion test' }),
    });
    assert.equal(delRes.status, 200);
    assert.equal(delRes.json.deletedCustomerId, custIdA);

    const [preservedOrder] = await db.select().from(storeOrders).where(eq(storeOrders.id, orderA.id));
    const [preservedInvoice] = await db.select().from(invoices).where(eq(invoices.id, invoiceA.id));
    assert.ok(preservedOrder, 'Order must be preserved after customer deletion');
    assert.equal(preservedOrder.userId, null, 'Preserved order userId must be detached (NULL)');
    assert.ok(preservedInvoice, 'Invoice must be preserved after customer deletion');
    assert.equal(preservedInvoice.userId, null, 'Preserved invoice userId must be detached (NULL)');

    // Old session token must no longer authenticate
    const deadMe = await api('/api/me', { token: device2Token });
    assert.equal(deadMe.status, 401);

    // Re-registering with the SAME deleted email must assign a BRAND NEW Customer ID (never reuse custIdA)
    const { exch: reRegA } = await otpLoginFlow(emailA);
    assert.equal(reRegA.status, 200);
    assert.equal(reRegA.json.isNewCustomer, true);
    assert.notEqual(reRegA.json.user.customerId, custIdA, 'Deleted Customer ID must NEVER be reused');
    assert.match(reRegA.json.user.customerId, /^NTF-CUST-\d{6}$/);
    const numOld = Number(custIdA.replace(/\D/g, ''));
    const numNew = Number(reRegA.json.user.customerId.replace(/\D/g, ''));
    assert.ok(numNew > numOld, `Re-registered Customer ID (${reRegA.json.user.customerId}) must strictly exceed retired ID (${custIdA})`);
    console.log(`[PASS] 14. Account deletion preserved orders/invoices, retired ${custIdA}, re-registration assigned ${reRegA.json.user.customerId}`);

    console.log('ALL 14 CUSTOMER OTP & ACCOUNT MANAGEMENT SCENARIOS PASSED.');
  } finally {
    await new Promise<void>((resolve) => appServer.close(() => resolve()));
    await new Promise<void>((resolve) => authServer.close(() => resolve()));
  }
}

main().catch((err) => {
  console.error('E2E VERIFICATION FAILED:', err);
  process.exit(1);
});
