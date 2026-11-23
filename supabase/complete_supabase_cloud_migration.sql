-- =============================================================================
-- NEXUSTEKFUSION / KRASHIVANTRI — Complete Supabase Cloud Database Migration
-- Additive & Idempotent: Never drops or duplicates existing production tables.
-- Run in Supabase SQL Editor after prior portal/project migrations.
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS web_platform;

-- -----------------------------------------------------------------------------
-- 1. Extend Cart Tables for Server Totals, Coupons, Image & Options Metadata
-- -----------------------------------------------------------------------------
ALTER TABLE IF EXISTS web_platform.customer_carts
  ADD COLUMN IF NOT EXISTS coupon_code text NOT NULL DEFAULT '';

ALTER TABLE IF EXISTS public.customer_carts
  ADD COLUMN IF NOT EXISTS coupon_code text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS subtotal_inr integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gst_inr integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_inr integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shipping_inr integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS grand_total_inr integer NOT NULL DEFAULT 0;

ALTER TABLE IF EXISTS public.customer_cart_items
  ADD COLUMN IF NOT EXISTS image_url text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS selected_options jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS gst_percent integer NOT NULL DEFAULT 18,
  ADD COLUMN IF NOT EXISTS line_total_inr integer NOT NULL DEFAULT 0;

-- -----------------------------------------------------------------------------
-- 2. Persistent Server-Side Guest Carts (Zero localStorage)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS web_platform.guest_carts (
  id serial PRIMARY KEY,
  guest_token_hash text NOT NULL UNIQUE,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  coupon_code text NOT NULL DEFAULT '',
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.guest_carts (
  id bigserial PRIMARY KEY,
  guest_token_hash text NOT NULL UNIQUE,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  coupon_code text NOT NULL DEFAULT '',
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_guest_carts_expires ON web_platform.guest_carts (expires_at);
CREATE INDEX IF NOT EXISTS idx_public_guest_carts_expires ON public.guest_carts (expires_at);

-- -----------------------------------------------------------------------------
-- 3. Service Catalog & Unified Permanent Service Records
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS web_platform.services (
  id serial PRIMARY KEY,
  service_code text NOT NULL UNIQUE,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  category text NOT NULL,
  description text NOT NULL DEFAULT '',
  base_price_inr integer NOT NULL DEFAULT 0,
  gst_percent integer NOT NULL DEFAULT 18,
  options jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.services (
  id bigserial PRIMARY KEY,
  service_code text NOT NULL UNIQUE,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  category text NOT NULL,
  description text NOT NULL DEFAULT '',
  base_price_inr integer NOT NULL DEFAULT 0,
  gst_percent integer NOT NULL DEFAULT 18,
  options jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS web_platform.service_records (
  id serial PRIMARY KEY,
  service_record_number text NOT NULL UNIQUE,
  service_id integer REFERENCES web_platform.services(id) ON DELETE SET NULL,
  user_id integer REFERENCES web_platform.users(id) ON DELETE SET NULL,
  customer_id text NOT NULL DEFAULT '',
  customer_email text NOT NULL DEFAULT '',
  service_name text NOT NULL,
  category text NOT NULL,
  description text NOT NULL DEFAULT '',
  specifications text NOT NULL DEFAULT '',
  selected_options jsonb NOT NULL DEFAULT '{}'::jsonb,
  uploaded_files jsonb NOT NULL DEFAULT '[]'::jsonb,
  quantity integer NOT NULL DEFAULT 1,
  unit_price_inr integer NOT NULL DEFAULT 0,
  tax_inr integer NOT NULL DEFAULT 0,
  total_amount_inr integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'Pending',
  admin_remarks text NOT NULL DEFAULT '',
  assigned_team text NOT NULL DEFAULT '',
  source_entity_type text NOT NULL DEFAULT 'custom_service',
  source_entity_id text NOT NULL DEFAULT '',
  is_deleted boolean NOT NULL DEFAULT false,
  archived_at timestamptz,
  archived_reason text NOT NULL DEFAULT '',
  archived_by text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.service_records (
  id bigserial PRIMARY KEY,
  service_record_number text NOT NULL UNIQUE,
  user_uid text NOT NULL DEFAULT '',
  customer_id text NOT NULL DEFAULT '',
  customer_email text NOT NULL DEFAULT '',
  service_code text NOT NULL DEFAULT '',
  service_name text NOT NULL,
  category text NOT NULL,
  description text NOT NULL DEFAULT '',
  specifications text NOT NULL DEFAULT '',
  selected_options jsonb NOT NULL DEFAULT '{}'::jsonb,
  uploaded_files jsonb NOT NULL DEFAULT '[]'::jsonb,
  quantity integer NOT NULL DEFAULT 1,
  unit_price_inr integer NOT NULL DEFAULT 0,
  tax_inr integer NOT NULL DEFAULT 0,
  total_amount_inr integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'Pending',
  admin_remarks text NOT NULL DEFAULT '',
  assigned_team text NOT NULL DEFAULT '',
  source_entity_type text NOT NULL DEFAULT 'custom_service',
  source_entity_id text NOT NULL DEFAULT '',
  is_deleted boolean NOT NULL DEFAULT false,
  archived_at timestamptz,
  archived_reason text NOT NULL DEFAULT '',
  archived_by text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_web_service_records_user ON web_platform.service_records (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_web_service_records_cust ON web_platform.service_records (customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_web_service_records_src ON web_platform.service_records (source_entity_type, source_entity_id);
CREATE INDEX IF NOT EXISTS idx_public_service_records_uid ON public.service_records (user_uid, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_public_service_records_cust ON public.service_records (customer_id, created_at DESC);

-- Seed Core Services Catalog (Idempotent)
INSERT INTO web_platform.services (service_code, name, slug, category, description, base_price_inr, gst_percent, options, is_active)
VALUES
  ('SRV-CUSTOM-ENG', 'Custom Engineering & R&D Project', 'custom-engineering-project', 'Engineering', 'End-to-end embedded hardware, firmware, robotics, IoT, and academic/industrial R&D prototyping.', 15000, 18, '{"milestones":["50% Advance","50% Handover"]}'::jsonb, true),
  ('SRV-3DP', 'Precision 3D Printing (FDM & SLA)', '3d-printing-rapid-prototyping', 'Manufacturing', 'Industrial FDM (PLA, PETG, PA12-CF, TPU) and 8K SLA resin rapid prototyping with CAD analysis.', 250, 18, '{"technologies":["FDM","SLA"]}'::jsonb, true),
  ('SRV-PCB', 'PCB Design & Fabrication', 'pcb-design-fabrication', 'PCB', 'Single & double-layer FR4 fabrication, Gerber verification, and optional PCBA assembly.', 950, 18, '{"layers":[1,2]}'::jsonb, true),
  ('SRV-AGRI-DRONE', 'KRASHIVANTRI Agricultural Drone Spraying', 'agricultural-drone-spraying', 'Agriculture', 'DGCA-compliant precision agricultural spraying operations across registered farms and FPOs.', 500, 18, '{"unit":"acre"}'::jsonb, true),
  ('SRV-DRONE-REPAIR', 'Drone Diagnostics, Repair & Calibration', 'drone-repair-calibration', 'Drone Services', 'Bench diagnostics, propulsion overhaul, IMU/compass calibration, and field servicing.', 999, 18, '{"modes":["service_centre","field_visit"]}'::jsonb, true),
  ('SRV-B2B-MFG', 'B2B Bulk Hardware & Fleet Manufacturing', 'b2b-bulk-manufacturing', 'B2B', 'Institutional and enterprise volume manufacturing for drones, enclosures, and electronics.', 25000, 18, '{"gstBilling":true}'::jsonb, true)
ON CONFLICT (service_code) DO NOTHING;

INSERT INTO public.services (service_code, name, slug, category, description, base_price_inr, gst_percent, options, is_active)
SELECT service_code, name, slug, category, description, base_price_inr, gst_percent, options, is_active
FROM web_platform.services
ON CONFLICT (service_code) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 4. Enquiry Attachments & Admin Activity Logs
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS web_platform.enquiry_attachments (
  id serial PRIMARY KEY,
  enquiry_source text NOT NULL,
  enquiry_id integer NOT NULL,
  enquiry_number text NOT NULL DEFAULT '',
  user_id integer REFERENCES web_platform.users(id) ON DELETE SET NULL,
  customer_id text NOT NULL DEFAULT '',
  file_name text NOT NULL,
  mime_type text NOT NULL DEFAULT 'application/octet-stream',
  size_bytes integer NOT NULL DEFAULT 0,
  storage_bucket text NOT NULL DEFAULT 'customer-uploads',
  storage_path text NOT NULL,
  uploaded_by text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.enquiry_attachments (
  id bigserial PRIMARY KEY,
  enquiry_source text NOT NULL,
  enquiry_id bigint NOT NULL,
  enquiry_number text NOT NULL DEFAULT '',
  user_uid text NOT NULL DEFAULT '',
  customer_id text NOT NULL DEFAULT '',
  file_name text NOT NULL,
  mime_type text NOT NULL DEFAULT 'application/octet-stream',
  size_bytes bigint NOT NULL DEFAULT 0,
  storage_bucket text NOT NULL DEFAULT 'customer-uploads',
  storage_path text NOT NULL,
  uploaded_by text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_enquiry_attachments_ref ON web_platform.enquiry_attachments (enquiry_source, enquiry_id);
CREATE INDEX IF NOT EXISTS idx_public_enquiry_attachments_ref ON public.enquiry_attachments (enquiry_source, enquiry_number);

CREATE TABLE IF NOT EXISTS public.admin_activity_logs (
  id bigserial PRIMARY KEY,
  actor_uid text NOT NULL DEFAULT '',
  actor_email text NOT NULL DEFAULT '',
  action text NOT NULL,
  entity_type text NOT NULL DEFAULT '',
  entity_id text NOT NULL DEFAULT '',
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_public_admin_activity_logs_created ON public.admin_activity_logs (created_at DESC);

-- -----------------------------------------------------------------------------
-- 5. Safe Non-Destructive Backfill of Existing Orders/Enquiries into Service Records
-- -----------------------------------------------------------------------------
INSERT INTO web_platform.service_records (
  service_record_number, user_id, customer_id, customer_email, service_name, category,
  description, specifications, selected_options, uploaded_files, quantity,
  unit_price_inr, tax_inr, total_amount_inr, status, admin_remarks, assigned_team,
  source_entity_type, source_entity_id, is_deleted, archived_at, archived_reason, archived_by,
  created_at, updated_at
)
SELECT
  'SRV-3DP-' || po.order_number,
  po.user_id,
  po.customer_id,
  po.email,
  'Precision 3D Printing (' || po.technology || ')',
  'Manufacturing',
  po.file_name || ' · ' || po.material_name || ' (' || po.color_name || ')',
  po.special_instructions,
  jsonb_build_object('technology', po.technology, 'material', po.material_name, 'color', po.color_name, 'layerHeightMm', po.layer_height_mm, 'infillPercent', po.infill_percent),
  jsonb_build_array(jsonb_build_object('originalName', po.file_name, 'storagePath', po.file_storage_path, 'bucket', po.storage_bucket, 'sizeBytes', po.file_size_bytes)),
  GREATEST(1, po.quantity),
  GREATEST(0, COALESCE(po.quoted_price_inr, po.total_inr)),
  0,
  GREATEST(0, po.total_inr),
  po.order_status,
  COALESCE(NULLIF(po.rejection_reason, ''), po.production_notes, ''),
  '3D Printing Lab',
  'printing_order',
  po.order_number,
  po.is_deleted,
  po.archived_at,
  po.archived_reason,
  po.archived_by,
  po.created_at,
  po.updated_at
FROM web_platform.printing_orders po
ON CONFLICT (service_record_number) DO NOTHING;

INSERT INTO web_platform.service_records (
  service_record_number, user_id, customer_id, customer_email, service_name, category,
  description, specifications, selected_options, uploaded_files, quantity,
  unit_price_inr, tax_inr, total_amount_inr, status, admin_remarks, assigned_team,
  source_entity_type, source_entity_id, is_deleted, archived_at, archived_reason, archived_by,
  created_at, updated_at
)
SELECT
  'SRV-PCB-' || pcb.enquiry_number,
  pcb.user_id,
  pcb.customer_id,
  pcb.email,
  'PCB Fabrication (' || pcb.layer_count || '-Layer)',
  'PCB',
  pcb.board_dimensions_mm || ' mm · ' || pcb.surface_finish,
  pcb.special_instructions,
  jsonb_build_object('layers', pcb.layer_count, 'dimensionsMm', pcb.board_dimensions_mm, 'assemblyRequired', pcb.assembly_required, 'surfaceFinish', pcb.surface_finish),
  pcb.attachments,
  GREATEST(1, pcb.board_quantity),
  COALESCE(pcb.quoted_amount_inr, 0),
  0,
  COALESCE(pcb.quoted_amount_inr, 0),
  pcb.status,
  COALESCE(NULLIF(pcb.rejection_reason, ''), pcb.admin_notes, ''),
  COALESCE(NULLIF(pcb.assigned_staff, ''), 'PCB Engineering Desk'),
  'pcb_enquiry',
  pcb.enquiry_number,
  pcb.is_deleted,
  pcb.archived_at,
  pcb.archived_reason,
  pcb.archived_by,
  pcb.created_at,
  pcb.updated_at
FROM web_platform.pcb_enquiries pcb
ON CONFLICT (service_record_number) DO NOTHING;

INSERT INTO web_platform.service_records (
  service_record_number, user_id, customer_id, customer_email, service_name, category,
  description, specifications, selected_options, uploaded_files, quantity,
  unit_price_inr, tax_inr, total_amount_inr, status, admin_remarks, assigned_team,
  source_entity_type, source_entity_id, is_deleted, archived_at, archived_reason, archived_by,
  created_at, updated_at
)
SELECT
  'SRV-PRJ-' || pe.enquiry_number,
  pe.user_id,
  pe.customer_id,
  pe.customer_email,
  pe.project_title,
  'Engineering',
  pe.project_category || ' · ' || pe.engineering_branch,
  pe.project_description,
  jsonb_build_object('projectCategory', pe.project_category, 'projectType', pe.project_type, 'complexityLevel', pe.complexity_level),
  pe.attachments,
  1,
  COALESCE(pe.budget_max_inr, 0),
  0,
  COALESCE(pe.budget_max_inr, 0),
  pe.status,
  COALESCE(NULLIF(pe.rejection_reason, ''), pe.internal_notes, ''),
  COALESCE(NULLIF(pe.assigned_engineer, ''), 'Engineering R&D Team'),
  'project_enquiry',
  pe.enquiry_number,
  pe.is_deleted,
  pe.archived_at,
  pe.archived_reason,
  pe.archived_by,
  pe.created_at,
  pe.updated_at
FROM web_platform.project_enquiries pe
ON CONFLICT (service_record_number) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 6. Safe Compatibility Views (Only created when no conflicting base table exists)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'carts' AND c.relkind = 'r')
     AND EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'customer_carts') THEN
    EXECUTE 'CREATE OR REPLACE VIEW public.carts AS SELECT * FROM public.customer_carts;';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'cart_items' AND c.relkind = 'r')
     AND EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'customer_cart_items') THEN
    EXECUTE 'CREATE OR REPLACE VIEW public.cart_items AS SELECT * FROM public.customer_cart_items;';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'orders' AND c.relkind = 'r')
     AND EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'store_orders') THEN
    EXECUTE 'CREATE OR REPLACE VIEW public.orders AS SELECT * FROM public.store_orders;';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'payments' AND c.relkind = 'r')
     AND EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'razorpay_payments') THEN
    EXECUTE 'CREATE OR REPLACE VIEW public.payments AS SELECT * FROM public.razorpay_payments;';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'quotations' AND c.relkind = 'r')
     AND EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'project_quotations') THEN
    EXECUTE 'CREATE OR REPLACE VIEW public.quotations AS SELECT * FROM public.project_quotations;';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'agreements' AND c.relkind = 'r')
     AND EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'project_agreements') THEN
    EXECUTE 'CREATE OR REPLACE VIEW public.agreements AS SELECT * FROM public.project_agreements;';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'enquiries' AND c.relkind = 'r')
     AND EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'customer_enquiries') THEN
    EXECUTE 'CREATE OR REPLACE VIEW public.enquiries AS SELECT * FROM public.customer_enquiries;';
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 7. Row Level Security (RLS) Policies for Public Tables
-- -----------------------------------------------------------------------------
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enquiry_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guest_carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_activity_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "services_public_read" ON public.services;
CREATE POLICY "services_public_read" ON public.services
  FOR SELECT USING (is_active = true OR public.is_ntf_admin());

DROP POLICY IF EXISTS "services_admin_manage" ON public.services;
CREATE POLICY "services_admin_manage" ON public.services
  FOR ALL USING (public.is_ntf_admin()) WITH CHECK (public.is_ntf_admin());

DROP POLICY IF EXISTS "service_records_customer_read" ON public.service_records;
CREATE POLICY "service_records_customer_read" ON public.service_records
  FOR SELECT USING (
    auth.uid()::text = user_uid OR public.is_ntf_admin()
  );

DROP POLICY IF EXISTS "service_records_customer_insert" ON public.service_records;
CREATE POLICY "service_records_customer_insert" ON public.service_records
  FOR INSERT WITH CHECK (
    auth.uid()::text = user_uid OR public.is_ntf_admin()
  );

DROP POLICY IF EXISTS "service_records_admin_all" ON public.service_records;
CREATE POLICY "service_records_admin_all" ON public.service_records
  FOR ALL USING (public.is_ntf_admin()) WITH CHECK (public.is_ntf_admin());

DROP POLICY IF EXISTS "enquiry_attachments_owner_or_admin" ON public.enquiry_attachments;
CREATE POLICY "enquiry_attachments_owner_or_admin" ON public.enquiry_attachments
  FOR SELECT USING (
    auth.uid()::text = user_uid OR public.is_ntf_admin()
  );

DROP POLICY IF EXISTS "enquiry_attachments_insert" ON public.enquiry_attachments;
CREATE POLICY "enquiry_attachments_insert" ON public.enquiry_attachments
  FOR INSERT WITH CHECK (
    auth.uid()::text = user_uid OR public.is_ntf_admin()
  );

DROP POLICY IF EXISTS "guest_carts_admin_only" ON public.guest_carts;
CREATE POLICY "guest_carts_admin_only" ON public.guest_carts
  FOR ALL USING (public.is_ntf_admin()) WITH CHECK (public.is_ntf_admin());

DROP POLICY IF EXISTS "admin_activity_logs_admin_only" ON public.admin_activity_logs;
CREATE POLICY "admin_activity_logs_admin_only" ON public.admin_activity_logs
  FOR ALL USING (public.is_ntf_admin()) WITH CHECK (public.is_ntf_admin());

-- -----------------------------------------------------------------------------
-- 8. Realtime Publication Registration (Idempotent)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  tbl text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOREACH tbl IN ARRAY ARRAY[
      'services',
      'service_records',
      'enquiry_attachments',
      'customer_carts',
      'customer_cart_items',
      'customer_enquiries',
      'notifications',
      'store_orders',
      'project_agreements'
    ] LOOP
      IF EXISTS (
        SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = tbl AND c.relkind = 'r'
      ) AND NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = tbl
      ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I;', tbl);
      END IF;
    END LOOP;
  END IF;
END $$;
