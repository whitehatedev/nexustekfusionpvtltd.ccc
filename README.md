# NexusTekFusion — Engineering Services, Custom 3D Printing & E-Commerce Platform

Official full-stack web platform for **NEXUSTEKFUSION PRIVATE LIMITED** (`https://nexustekfusion.in`), Nagpur, Maharashtra, India.

- **Legal Name:** NEXUSTEKFUSION PRIVATE LIMITED
- **CIN:** `U30305ME2026PTC474052`
- **Founder & CEO:** Sahil Prakash Bhagat
- **Registered Office:** H NO. 565/19 NIT, SANKUL NEW COTTON MARK, Ganjipeth, Nagpur 440018, Maharashtra, India
- **Official Email:** `info@nexustekfusion.in`

---

## Architecture Overview

- **Frontend:** React 19, TypeScript, Tailwind CSS v4, Three.js interactive 3D CAD mesh viewer (`src/components/ModelViewer3D.tsx`), OpenStreetMap + Leaflet geospatial field & GPS telemetry viewer (`src/components/GeoMap.tsx`), jsPDF document suite (`src/lib/pdf.ts`: Quotations, Invoices, Packing Slips, Official Payment Receipts, Work Orders, Payment Clearance Certificates, Completion Certificates, Financial Reports).
- **Backend:** Express (`server.ts`) serving REST APIs (`/api/*`, `/api/admin/*`), `/robots.txt`, `/sitemap.xml`, Razorpay webhook (`/api/payments/webhook`), and Vite middleware in development.
- **Database & Schema:** PostgreSQL (Cloud SQL / fallback mock engine) managed via Drizzle ORM (`src/db/schema.ts`), including:
  - Core WooCommerce Store, 3D Printing Lab, PCB & B2B Quotes, Blogs, Case Studies, CRM & Audit Logs
  - **Module 1 (Project Advance/Final Payment, Clearance & Handover):** Configurable 50%/50% payment split, per-project milestones, official receipts (`NTF-RCP-`), work orders (`NTF-WRK-`), clearance certificates (`NTF-CLR-`), completion certificates (`NTF-CMP-`), time-limited token-gated deliverable downloads, courier dispatch records, Super Admin audited handover exceptions, and configurable lifecycle email templates (`src/server/email.ts`).
  - **Module 2 (KRASHIVANTRI Farmer & Drone Pilot Operations):** Farmer KYC & polygon farm plots (`/krashivantri/farmer-portal`), DGCA Remote Pilot Certificate (RPC) verification & AES-256-GCM encrypted payout bank details (`/krashivantri/pilot-portal`), browser-authenticated live GPS telemetry with real staleness checks, geofenced spraying sessions & photo/video evidence, Razorpay booking collections & refunds, verified pilot earnings ledger & UTR-gated payouts, penalties & appeals, plus Admin operational consoles (`/admin/farmers`, `/admin/drone-pilots`, `/admin/live-tracking`, `/admin/orders/live`, `/admin/farmer-payments`, `/admin/pilot-payouts`, `/admin/penalties`, `/admin/finance`).
  - **Drone Repair Service:** Dedicated UAV repair & field diagnostics booking portal (`/services/drone-repair`).
- **Authentication:** Supabase Auth (Email/Password & Google OAuth) + HTTP-only signed session authentication with salted `scrypt` password hashing, admin password reset tokens (`src/db/users.ts`, `src/middleware/auth.ts`), and 9-role RBAC.
- **3D Slicing Engine:** Real server-side binary/ASCII STL & OBJ mesh geometry analyzer (`src/server/slicer.ts`) calculating bounding box (`X × Y × Z`), exact mesh volume (`cm³`), surface area (`cm²`), overhang ratio, support volume estimation, layer count, filament weight, print duration, and dynamic material/printer/infill pricing.
- **Payments:** Razorpay Orders API + HMAC-SHA256 signature verification & idempotent webhook handling (`src/server/razorpay.ts`), with an explicitly labeled **Sandbox Test Mode** when live Razorpay credentials are not configured.

---

## Local Development Setup (Windows / macOS / Linux)

### 1. Prerequisites
- **Node.js 20+** and **npm 10+**
- **Supabase Project** (PostgreSQL connection string `DATABASE_URL`, `SUPABASE_URL`, and `SUPABASE_ANON_KEY`)

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure Environment Variables
Copy `.env.example` to `.env` and populate your credentials:
```bash
# Windows PowerShell:
Copy-Item .env.example .env
```

Required Supabase & database variables (`src/db/index.ts`, `src/lib/supabase-admin.ts`):
- `DATABASE_URL` (your Supabase PostgreSQL connection URI)
- `SUPABASE_URL` / `VITE_SUPABASE_URL`
- `SUPABASE_ANON_KEY` / `VITE_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (optional, server-only)

Optional payment, email & admin variables:
- `INITIAL_ADMIN_NAME`, `INITIAL_ADMIN_EMAIL`, `INITIAL_ADMIN_PASSWORD` (seeds initial password-authenticated Super Admin on startup)
- `ADMIN_SESSION_SECRET` (HMAC secret for signed admin session cookies)
- `RAZORPAY_KEY_ID` (leave blank to use Sandbox Test Mode)
- `RAZORPAY_KEY_SECRET`
- `RAZORPAY_WEBHOOK_SECRET`
- `RESEND_API_KEY` or `EMAIL_WEBHOOK_URL` and `EMAIL_FROM` (for transactional email delivery; logs `not_configured` if omitted)
- `ADMIN_EMAILS="info.nexustekfusion@gmail.com,info@nexustekfusion.in"`
- `APP_URL="http://localhost:3000"`

### 4. Push Database Schema
```bash
npx drizzle-kit push --config=src/db/drizzle.config.ts
```

### 5. Run Development Server
```bash
npm run dev
```
The application runs on `http://localhost:3000`. Seed data (categories, initial catalog products including KRASHIVANTRI X & X PRO with zero fabricated specifications, printing materials, FDM/SLA machines, blogs, case studies, and company CMS defaults) initializes safely on first bootstrap request without overwriting existing edits.

### 6. Build & Run Production
```bash
npm run lint
npm run build
npm start
```

---

## Razorpay Webhook Setup
In your Razorpay Dashboard, configure a webhook pointing to:
- **URL:** `https://nexustekfusion.in/api/payments/webhook`
- **Secret:** Same value as `RAZORPAY_WEBHOOK_SECRET` in `.env`
- **Events:** `payment.captured`, `payment.failed`, `order.paid`

---

## End-to-End Verification Checklist

1. **Workflow A (Project Enquiry -> Quotation -> 50% Advance -> Final Payment -> Handover):**
   - Submit an enquiry at `/project-enquiry`, prepare/send an itemized quotation from `/admin`, pay 50% advance in `/my-account`, verify automatic issuance of Payment Receipt, Invoice, and Work Order (`NTF-WRK-`).
   - Mark project `Project Completed – Awaiting Final Payment`, verify deliverable vault stays locked until remaining 50% balance is paid (or Super Admin logs an audited handover exception), then acknowledge receipt to issue Payment Clearance (`NTF-CLR-`) & Completion (`NTF-CMP-`) certificates.
2. **Workflow B (KRASHIVANTRI Farmer & Drone Pilot Operations):**
   - Register a farmer & draw a polygon farm plot on `/krashivantri/farmer-portal`; register a drone pilot, upload DGCA RPC/drone/bank details & broadcast real browser GPS on `/krashivantri/pilot-portal`.
   - Verify accounts in `/admin/farmers` and `/admin/drone-pilots`, book a spraying mission, dispatch a pilot in `/admin/live-tracking`, upload flight evidence, verify acres, and process UTR-verified payouts in `/admin/pilot-payouts`.
3. **Workflow C (Custom 3D Printing & Store):**
   - Upload an `.stl` or `.obj` model at `/services/3d-printing`, inspect the Three.js viewer, select material/infill, and checkout via Razorpay.
   - Explore `/krashivantri`, `/product/krashivantri-x`, `/product/krashivantri-x-pro`, `/shop`, and `/services/drone-repair`.
