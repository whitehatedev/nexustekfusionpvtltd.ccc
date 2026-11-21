# NEXUSTEKFUSION PRIVATE LIMITED — Project Enquiry, Quotation & Execution Module

**Company:** NEXUSTEKFUSION PRIVATE LIMITED · Nagpur, Maharashtra, India · `info@nexustekfusion.in` · `CIN: U30305ME2026PTC474052`

## 1. Key Routes Integrated
- **Public Multi-Step Project Enquiry Wizard:** `/project-enquiry`
- **Customer Portal & Project Tracking:** `/my-account` and `/my-account/project-enquiries`
- **Admin Project Enquiries & Quotation Builder:** `/admin/project-enquiries`
- **Admin Active Projects, Milestones & Deliverables:** `/admin/projects`
- **Super Admin Project Configuration & GST Settings:** `/admin/project-settings`
- **Super Admin Razorpay Backend Configuration:** `/admin/settings/payments`

## 2. Database & Private Storage Setup
- Local transactional persistence runs immediately in `data/nexustekfusion.db` (SQLite) with private customer uploads stored outside `public/` in `data/private_uploads/` and downloaded exclusively via HMAC-signed URLs (`/api/files/signed/:id?expires=...&sig=...`).
- To sync and persist against **Supabase PostgreSQL & Private Storage**:
  1. Run `/supabase/schema.sql` (or apply `/supabase/migrations/002_project_module.sql`) in your Supabase SQL Editor to create all 19 project tables, RLS policies, and the private `project-documents` bucket.
  2. Set `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` in `.env` (or environment secrets).

## 3. Production Credentials Checklist (Honest Provider Status)
- **Razorpay Live/Test Checkout & Webhooks:** Enter `Key ID`, `Key Secret`, and `Webhook Secret` inside **Super Admin -> Razorpay Gateway (`/admin/settings/payments`)** (encrypted with AES-256-GCM) or via `RAZORPAY_*` environment variables, and register `/api/webhooks/razorpay` in your Razorpay dashboard. Without real keys configured, server payment endpoints operate in simulated checkout/signature mode and do not charge cards.
- **Email Notifications & Email OTP:** Configure `RESEND_API_KEY` or `EMAIL_WEBHOOK_URL` (+ `EMAIL_FROM`). Until configured, outbound emails are logged transparently (`delivery_status: logged_unconfigured`) and OTP verification supports secure preview codes.
- **Mobile SMS OTP:** Configure either `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` + `TWILIO_FROM_NUMBER` or `MSG91_AUTH_KEY` + `MSG91_TEMPLATE_ID`. Without live carrier credentials, SMS OTP delivery is honest dev/preview-only and does not send physical carrier SMS messages.
- **GST Tax Invoices vs Proforma Invoices:** Configure your registered `Company GSTIN` and toggle `Enable GST Tax` in **Super Admin -> Project Config (`/admin/project-settings`)**. When GSTIN is blank or disabled, only Proforma Invoices and Payment Receipts are generated.
