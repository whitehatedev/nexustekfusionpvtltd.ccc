-- ============================================================================
-- NEXUSTEKFUSION PRIVATE LIMITED — SUPABASE CLOUD SINGLE SOURCE OF TRUTH
-- SAFE, ADDITIVE & IDEMPOTENT MIGRATION (NO DATA LOSS, NO DUPLICATE TABLES)
-- ============================================================================
-- Preserves all existing tables, IDs, sequences, and customer records.
-- Adds:
--   1. Non-destructive soft-archive & rejection audit columns across all modules
--   2. record_status_history (original record snapshot, reason, admin ID, status diff)
--   3. project_agreements (metadata + private Supabase Storage PDF path)
--   4. company_signing_assets (company signatures & stamps in Supabase Storage)
--   5. razorpay_payment_links + extended Razorpay payment link / transaction columns
--   6. Invoice PDF storage metadata columns (storage_bucket, pdf_storage_path)
--   7. Private & public Supabase Storage buckets + strict RLS policies
--   8. Safe non-duplicating backfill for customer_id & cross-schema continuity
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS web_platform;

-- ----------------------------------------------------------------------------
-- 1. Sequence-backed Customer IDs & Unique Profile Guarantees
-- ----------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS web_platform.customers_code_seq START 1;
CREATE SEQUENCE IF NOT EXISTS public.customer_id_seq START 1;
CREATE SEQUENCE IF NOT EXISTS public.agreement_number_seq START 1;

-- Ensure one active customer profile per email & auth_user_id (without touching existing rows)
CREATE UNIQUE INDEX IF NOT EXISTS idx_wp_customers_auth_user_id_active
  ON web_platform.customers (auth_user_id)
  WHERE auth_user_id IS NOT NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_wp_customers_email_active
  ON web_platform.customers (lower(email))
  WHERE email <> '' AND deleted_at IS NULL;

DO $$
BEGIN
  IF to_regclass('public.customers') IS NOT NULL THEN
    CREATE UNIQUE INDEX IF NOT EXISTS idx_pub_customers_auth_user_id
      ON public.customers (auth_user_id)
      WHERE auth_user_id IS NOT NULL;

    CREATE UNIQUE INDEX IF NOT EXISTS idx_pub_customers_customer_id
      ON public.customers (customer_id)
      WHERE customer_id <> '';
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 2. Non-Destructive Soft-Archive, Rejection & Cloud Sync Columns
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS web_platform.project_enquiries
  ADD COLUMN IF NOT EXISTS rejected_by text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_reason text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS archived_by text NOT NULL DEFAULT '';

ALTER TABLE IF EXISTS web_platform.projects
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_reason text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS archived_by text NOT NULL DEFAULT '';

ALTER TABLE IF EXISTS web_platform.store_orders
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_reason text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS archived_by text NOT NULL DEFAULT '';

ALTER TABLE IF EXISTS web_platform.printing_orders
  ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rejected_by text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_reason text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS archived_by text NOT NULL DEFAULT '';

ALTER TABLE IF EXISTS web_platform.pcb_enquiries
  ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rejected_by text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_reason text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS archived_by text NOT NULL DEFAULT '';

ALTER TABLE IF EXISTS web_platform.b2b_enquiries
  ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rejection_reason text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS rejected_by text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_reason text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS archived_by text NOT NULL DEFAULT '';

ALTER TABLE IF EXISTS web_platform.product_enquiries
  ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rejection_reason text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS rejected_by text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_reason text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS archived_by text NOT NULL DEFAULT '';

ALTER TABLE IF EXISTS web_platform.support_tickets
  ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rejection_reason text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_reason text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS archived_by text NOT NULL DEFAULT '';

ALTER TABLE IF EXISTS web_platform.invoices
  ADD COLUMN IF NOT EXISTS customer_id text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS storage_bucket text NOT NULL DEFAULT 'invoices-pdf',
  ADD COLUMN IF NOT EXISTS pdf_storage_path text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS pdf_generated_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_reason text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS archived_by text NOT NULL DEFAULT '';

ALTER TABLE IF EXISTS web_platform.payments
  ADD COLUMN IF NOT EXISTS payment_link_id text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS payment_url text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS customer_id text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS project_id integer,
  ADD COLUMN IF NOT EXISTS project_code text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS payment_date timestamptz;

ALTER TABLE IF EXISTS web_platform.payment_webhook_events
  ADD COLUMN IF NOT EXISTS payment_link_id text NOT NULL DEFAULT '';

-- Mirror additive columns onto public.* tables (only if those tables exist)
ALTER TABLE IF EXISTS public.customer_enquiries
  ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rejection_reason text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS rejected_by text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_reason text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS archived_by text NOT NULL DEFAULT '';

ALTER TABLE IF EXISTS public.customer_projects
  ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_reason text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS archived_by text NOT NULL DEFAULT '';

ALTER TABLE IF EXISTS public.store_orders
  ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_reason text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS archived_by text NOT NULL DEFAULT '';

ALTER TABLE IF EXISTS public.printing_orders
  ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rejected_by text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_reason text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS archived_by text NOT NULL DEFAULT '';

ALTER TABLE IF EXISTS public.invoices
  ADD COLUMN IF NOT EXISTS customer_id text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS storage_bucket text NOT NULL DEFAULT 'invoices-pdf',
  ADD COLUMN IF NOT EXISTS pdf_storage_path text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS pdf_generated_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_reason text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS archived_by text NOT NULL DEFAULT '';

ALTER TABLE IF EXISTS public.razorpay_payments
  ADD COLUMN IF NOT EXISTS payment_link_id text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS payment_url text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS customer_id text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS project_id integer,
  ADD COLUMN IF NOT EXISTS project_code text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS payment_date timestamptz;

ALTER TABLE IF EXISTS public.project_payments
  ADD COLUMN IF NOT EXISTS payment_link_id text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS payment_url text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS customer_id text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS project_code text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS payment_date timestamptz;

-- ----------------------------------------------------------------------------
-- 3. Record Status & Archive History (Requirement G — Zero Data Loss)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS web_platform.record_status_history (
  id serial PRIMARY KEY,
  entity_type text NOT NULL,
  entity_id text NOT NULL DEFAULT '',
  entity_code text NOT NULL DEFAULT '',
  customer_id text NOT NULL DEFAULT '',
  user_id integer REFERENCES web_platform.users(id) ON DELETE SET NULL,
  previous_status text NOT NULL DEFAULT '',
  new_status text NOT NULL DEFAULT '',
  action_type text NOT NULL DEFAULT 'status_change', -- status_change | rejection | archive | restore
  reason text NOT NULL DEFAULT '',
  admin_id text NOT NULL DEFAULT '',
  admin_email text NOT NULL DEFAULT '',
  original_record jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  action_date timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wp_rec_status_entity ON web_platform.record_status_history(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_wp_rec_status_cust ON web_platform.record_status_history(customer_id);

CREATE TABLE IF NOT EXISTS public.record_status_history (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_id integer UNIQUE,
  entity_type text NOT NULL,
  entity_id text NOT NULL DEFAULT '',
  entity_code text NOT NULL DEFAULT '',
  customer_id text NOT NULL DEFAULT '',
  user_uid text NOT NULL DEFAULT '',
  previous_status text NOT NULL DEFAULT '',
  new_status text NOT NULL DEFAULT '',
  action_type text NOT NULL DEFAULT 'status_change',
  reason text NOT NULL DEFAULT '',
  admin_id text NOT NULL DEFAULT '',
  admin_email text NOT NULL DEFAULT '',
  original_record jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  action_date timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pub_rec_status_entity ON public.record_status_history(entity_type, entity_code);
CREATE INDEX IF NOT EXISTS idx_pub_rec_status_uid ON public.record_status_history(user_uid);

-- ----------------------------------------------------------------------------
-- 4. Project Agreements (Metadata + Private Supabase Storage PDF Paths)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS web_platform.project_agreements (
  id serial PRIMARY KEY,
  agreement_number text NOT NULL UNIQUE,
  project_id integer REFERENCES web_platform.projects(id) ON DELETE SET NULL,
  enquiry_id integer REFERENCES web_platform.project_enquiries(id) ON DELETE SET NULL,
  project_code text NOT NULL DEFAULT '',
  enquiry_number text NOT NULL DEFAULT '',
  user_id integer REFERENCES web_platform.users(id) ON DELETE SET NULL,
  customer_id text NOT NULL DEFAULT '',
  title text NOT NULL,
  version_label text NOT NULL DEFAULT 'v1.0',
  status text NOT NULL DEFAULT 'Pending Customer Signature', -- Draft | Pending Customer Signature | Signed | Archived
  storage_bucket text NOT NULL DEFAULT 'agreements',
  storage_path text NOT NULL DEFAULT '',
  file_name text NOT NULL DEFAULT '',
  file_size_bytes integer NOT NULL DEFAULT 0,
  mime_type text NOT NULL DEFAULT 'application/pdf',
  signed_pdf_bucket text NOT NULL DEFAULT 'agreements',
  signed_pdf_path text NOT NULL DEFAULT '',
  signed_file_name text NOT NULL DEFAULT '',
  uploaded_by text NOT NULL DEFAULT '',
  signed_by_customer text NOT NULL DEFAULT '',
  signed_at timestamptz,
  notes text NOT NULL DEFAULT '',
  is_deleted boolean NOT NULL DEFAULT false,
  archived_at timestamptz,
  archived_reason text NOT NULL DEFAULT '',
  archived_by text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wp_proj_agreements_user ON web_platform.project_agreements(user_id);
CREATE INDEX IF NOT EXISTS idx_wp_proj_agreements_proj ON web_platform.project_agreements(project_id);

CREATE TABLE IF NOT EXISTS public.project_agreements (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_id integer UNIQUE,
  agreement_number text NOT NULL UNIQUE,
  project_code text NOT NULL DEFAULT '',
  enquiry_number text NOT NULL DEFAULT '',
  user_uid text NOT NULL DEFAULT '',
  customer_id text NOT NULL DEFAULT '',
  title text NOT NULL,
  version_label text NOT NULL DEFAULT 'v1.0',
  status text NOT NULL DEFAULT 'Pending Customer Signature',
  storage_bucket text NOT NULL DEFAULT 'agreements',
  storage_path text NOT NULL DEFAULT '',
  file_name text NOT NULL DEFAULT '',
  file_size_bytes integer NOT NULL DEFAULT 0,
  mime_type text NOT NULL DEFAULT 'application/pdf',
  signed_pdf_bucket text NOT NULL DEFAULT 'agreements',
  signed_pdf_path text NOT NULL DEFAULT '',
  signed_file_name text NOT NULL DEFAULT '',
  uploaded_by text NOT NULL DEFAULT '',
  signed_by_customer text NOT NULL DEFAULT '',
  signed_at timestamptz,
  notes text NOT NULL DEFAULT '',
  is_deleted boolean NOT NULL DEFAULT false,
  archived_at timestamptz,
  archived_reason text NOT NULL DEFAULT '',
  archived_by text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pub_proj_agreements_uid ON public.project_agreements(user_uid);

-- ----------------------------------------------------------------------------
-- 5. Company Signatures & Stamps (Admin Upload + Supabase Storage Metadata)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS web_platform.company_signing_assets (
  id serial PRIMARY KEY,
  asset_type text NOT NULL, -- signature | stamp
  label text NOT NULL,
  signatory_name text NOT NULL DEFAULT '',
  designation text NOT NULL DEFAULT '',
  storage_bucket text NOT NULL DEFAULT 'signatures-stamps',
  storage_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text NOT NULL DEFAULT 'image/png',
  file_size_bytes integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  uploaded_by text NOT NULL DEFAULT '',
  is_deleted boolean NOT NULL DEFAULT false,
  archived_at timestamptz,
  archived_reason text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.company_signing_assets (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_id integer UNIQUE,
  asset_type text NOT NULL,
  label text NOT NULL,
  signatory_name text NOT NULL DEFAULT '',
  designation text NOT NULL DEFAULT '',
  storage_bucket text NOT NULL DEFAULT 'signatures-stamps',
  storage_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text NOT NULL DEFAULT 'image/png',
  file_size_bytes integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  uploaded_by text NOT NULL DEFAULT '',
  is_deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 6. Razorpay Payment Links (Backend Link Generation + Webhook Verification)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS web_platform.razorpay_payment_links (
  id serial PRIMARY KEY,
  payment_link_id text NOT NULL UNIQUE,
  short_url text NOT NULL,
  reference_id text NOT NULL DEFAULT '',
  entity_type text NOT NULL, -- project_quotation | project | store_order | printing_order | pcb_enquiry | b2b_enquiry
  entity_id integer NOT NULL,
  project_id integer REFERENCES web_platform.projects(id) ON DELETE SET NULL,
  project_code text NOT NULL DEFAULT '',
  customer_id text NOT NULL DEFAULT '',
  user_id integer REFERENCES web_platform.users(id) ON DELETE SET NULL,
  customer_name text NOT NULL DEFAULT '',
  customer_email text NOT NULL DEFAULT '',
  customer_phone text NOT NULL DEFAULT '',
  amount_inr integer NOT NULL,
  amount_paise integer NOT NULL,
  currency text NOT NULL DEFAULT 'INR',
  payment_stage text NOT NULL DEFAULT 'advance',
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'created', -- created | partially_paid | paid | cancelled | expired
  razorpay_payment_id text NOT NULL DEFAULT '',
  payment_date timestamptz,
  expires_at timestamptz,
  created_by text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wp_rzp_links_user ON web_platform.razorpay_payment_links(user_id);
CREATE INDEX IF NOT EXISTS idx_wp_rzp_links_project ON web_platform.razorpay_payment_links(project_id);

CREATE TABLE IF NOT EXISTS public.razorpay_payment_links (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_id integer UNIQUE,
  payment_link_id text NOT NULL UNIQUE,
  short_url text NOT NULL,
  reference_id text NOT NULL DEFAULT '',
  entity_type text NOT NULL,
  entity_id integer NOT NULL DEFAULT 0,
  project_code text NOT NULL DEFAULT '',
  customer_id text NOT NULL DEFAULT '',
  user_uid text NOT NULL DEFAULT '',
  customer_name text NOT NULL DEFAULT '',
  customer_email text NOT NULL DEFAULT '',
  customer_phone text NOT NULL DEFAULT '',
  amount_inr integer NOT NULL,
  amount_paise integer NOT NULL,
  currency text NOT NULL DEFAULT 'INR',
  payment_stage text NOT NULL DEFAULT 'advance',
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'created',
  razorpay_payment_id text NOT NULL DEFAULT '',
  payment_date timestamptz,
  expires_at timestamptz,
  created_by text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pub_rzp_links_uid ON public.razorpay_payment_links(user_uid);

-- ----------------------------------------------------------------------------
-- 7. Supabase Storage Buckets & Strict RLS Policies
-- ----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('project-documents', 'project-documents', false),
  ('agreements', 'agreements', false),
  ('invoices-pdf', 'invoices-pdf', false),
  ('signatures-stamps', 'signatures-stamps', false),
  ('quotations', 'quotations', false),
  ('customer-uploads', 'customer-uploads', false),
  ('project-files', 'project-files', false),
  ('printing-files', 'printing-files', false),
  ('pcb-files', 'pcb-files', false),
  ('support-files', 'support-files', false),
  ('media-library', 'media-library', true),
  ('product-images', 'product-images', true)
ON CONFLICT (id) DO NOTHING;

-- Enable RLS on all new public.* tables
ALTER TABLE public.record_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_signing_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.razorpay_payment_links ENABLE ROW LEVEL SECURITY;

-- Table Policies (Customer reads own only; Admin reads/writes all)
DROP POLICY IF EXISTS "Admin full access record_status_history" ON public.record_status_history;
CREATE POLICY "Admin full access record_status_history"
  ON public.record_status_history FOR ALL
  USING (public.is_ntf_admin())
  WITH CHECK (public.is_ntf_admin());

DROP POLICY IF EXISTS "Customer read own status history" ON public.record_status_history;
CREATE POLICY "Customer read own status history"
  ON public.record_status_history FOR SELECT
  USING (auth.uid()::text = user_uid OR public.is_ntf_admin());

DROP POLICY IF EXISTS "Customer read own project agreements" ON public.project_agreements;
CREATE POLICY "Customer read own project agreements"
  ON public.project_agreements FOR SELECT
  USING ((auth.uid()::text = user_uid AND is_deleted = false) OR public.is_ntf_admin());

DROP POLICY IF EXISTS "Customer sign own project agreements" ON public.project_agreements;
CREATE POLICY "Customer sign own project agreements"
  ON public.project_agreements FOR UPDATE
  USING (auth.uid()::text = user_uid AND is_deleted = false)
  WITH CHECK (auth.uid()::text = user_uid);

DROP POLICY IF EXISTS "Admin manage all project agreements" ON public.project_agreements;
CREATE POLICY "Admin manage all project agreements"
  ON public.project_agreements FOR ALL
  USING (public.is_ntf_admin())
  WITH CHECK (public.is_ntf_admin());

DROP POLICY IF EXISTS "Admin manage company signing assets" ON public.company_signing_assets;
CREATE POLICY "Admin manage company signing assets"
  ON public.company_signing_assets FOR ALL
  USING (public.is_ntf_admin())
  WITH CHECK (public.is_ntf_admin());

DROP POLICY IF EXISTS "Customer read own payment links" ON public.razorpay_payment_links;
CREATE POLICY "Customer read own payment links"
  ON public.razorpay_payment_links FOR SELECT
  USING (auth.uid()::text = user_uid OR public.is_ntf_admin());

DROP POLICY IF EXISTS "Admin manage payment links" ON public.razorpay_payment_links;
CREATE POLICY "Admin manage payment links"
  ON public.razorpay_payment_links FOR ALL
  USING (public.is_ntf_admin())
  WITH CHECK (public.is_ntf_admin());

-- Storage Object RLS Policies (Private Buckets)
DROP POLICY IF EXISTS "Admin full access private cloud storage" ON storage.objects;
CREATE POLICY "Admin full access private cloud storage"
  ON storage.objects FOR ALL
  USING (
    bucket_id IN (
      'project-documents', 'agreements', 'invoices-pdf', 'signatures-stamps',
      'quotations', 'customer-uploads', 'project-files', 'printing-files',
      'pcb-files', 'support-files'
    )
    AND public.is_ntf_admin()
  )
  WITH CHECK (
    bucket_id IN (
      'project-documents', 'agreements', 'invoices-pdf', 'signatures-stamps',
      'quotations', 'customer-uploads', 'project-files', 'printing-files',
      'pcb-files', 'support-files'
    )
    AND public.is_ntf_admin()
  );

DROP POLICY IF EXISTS "Customers manage own folder in customer-uploads and agreements" ON storage.objects;
CREATE POLICY "Customers manage own folder in customer-uploads and agreements"
  ON storage.objects FOR ALL
  USING (
    bucket_id IN ('customer-uploads', 'agreements', 'project-documents', 'printing-files', 'pcb-files')
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id IN ('customer-uploads', 'agreements', 'project-documents', 'printing-files', 'pcb-files')
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ----------------------------------------------------------------------------
-- 8. Safe Non-Duplicating Backfill for Customer IDs
-- ----------------------------------------------------------------------------
UPDATE web_platform.store_orders so
SET customer_id = COALESCE(NULLIF(c.customer_id, ''), u.uid, '')
FROM web_platform.users u
LEFT JOIN web_platform.customers c ON c.user_id = u.id AND c.deleted_at IS NULL
WHERE so.user_id = u.id AND so.customer_id = '';

UPDATE web_platform.project_enquiries pe
SET customer_id = COALESCE(NULLIF(c.customer_id, ''), u.uid, '')
FROM web_platform.users u
LEFT JOIN web_platform.customers c ON c.user_id = u.id AND c.deleted_at IS NULL
WHERE pe.user_id = u.id AND pe.customer_id = '';

UPDATE web_platform.projects p
SET customer_id = COALESCE(NULLIF(c.customer_id, ''), u.uid, '')
FROM web_platform.users u
LEFT JOIN web_platform.customers c ON c.user_id = u.id AND c.deleted_at IS NULL
WHERE p.user_id = u.id AND p.customer_id = '';

UPDATE web_platform.invoices inv
SET customer_id = COALESCE(NULLIF(c.customer_id, ''), u.uid, '')
FROM web_platform.users u
LEFT JOIN web_platform.customers c ON c.user_id = u.id AND c.deleted_at IS NULL
WHERE inv.user_id = u.id AND inv.customer_id = '';

UPDATE web_platform.payments pay
SET customer_id = COALESCE(NULLIF(c.customer_id, ''), u.uid, '')
FROM web_platform.users u
LEFT JOIN web_platform.customers c ON c.user_id = u.id AND c.deleted_at IS NULL
WHERE pay.user_id = u.id AND pay.customer_id = '';

COMMIT;
