-- =============================================================================
-- NexusTekFusion Complete Admin Panel & Centralized Supabase Data Access Upgrade
-- Idempotent, additive migration preserving all existing tables & mobile data.
-- =============================================================================

BEGIN;

CREATE SCHEMA IF NOT EXISTS web_platform;

-- 1. Additive columns on web_platform.* tables
ALTER TABLE IF EXISTS web_platform.store_orders
  ADD COLUMN IF NOT EXISTS customer_id text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT 'Razorpay';

ALTER TABLE IF EXISTS web_platform.product_enquiries
  ADD COLUMN IF NOT EXISTS customer_id text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'Product Enquiry',
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'Normal',
  ADD COLUMN IF NOT EXISTS subject text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS replies jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE IF EXISTS web_platform.support_tickets
  ADD COLUMN IF NOT EXISTS customer_id text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'General Enquiry',
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'Normal',
  ADD COLUMN IF NOT EXISTS internal_notes text NOT NULL DEFAULT '';

ALTER TABLE IF EXISTS web_platform.pcb_enquiries
  ADD COLUMN IF NOT EXISTS customer_id text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'Normal',
  ADD COLUMN IF NOT EXISTS assigned_staff text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS replies jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE IF EXISTS web_platform.b2b_enquiries
  ADD COLUMN IF NOT EXISTS customer_id text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'Normal',
  ADD COLUMN IF NOT EXISTS assigned_staff text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS replies jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE IF EXISTS web_platform.project_enquiries
  ADD COLUMN IF NOT EXISTS customer_id text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'Normal';

ALTER TABLE IF EXISTS web_platform.projects
  ADD COLUMN IF NOT EXISTS customer_id text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS budget_inr integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS technical_requirements text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS technical_notes text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS design_documents jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 2. Additive columns on public.* Supabase sync tables
ALTER TABLE IF EXISTS public.store_orders
  ADD COLUMN IF NOT EXISTS customer_id text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT 'Razorpay',
  ADD COLUMN IF NOT EXISTS internal_notes text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS dispatch_date text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS expected_delivery_date text NOT NULL DEFAULT '';

ALTER TABLE IF EXISTS public.customer_enquiries
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'Normal',
  ADD COLUMN IF NOT EXISTS assigned_staff text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS internal_notes text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS replies jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE IF EXISTS public.customer_projects
  ADD COLUMN IF NOT EXISTS budget_inr integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS technical_requirements text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS technical_notes text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS design_documents jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 3. Admin Notifications Center tables (web_platform + public)
CREATE TABLE IF NOT EXISTS web_platform.admin_notifications (
  id serial PRIMARY KEY,
  type text NOT NULL DEFAULT 'system',
  title text NOT NULL,
  message text NOT NULL,
  entity_type text NOT NULL DEFAULT '',
  entity_id text NOT NULL DEFAULT '',
  customer_id text NOT NULL DEFAULT '',
  link text NOT NULL DEFAULT '/admin/dashboard',
  is_read boolean NOT NULL DEFAULT false,
  read_by text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.admin_notifications (
  id bigserial PRIMARY KEY,
  source_id integer UNIQUE,
  type text NOT NULL DEFAULT 'system',
  title text NOT NULL,
  message text NOT NULL,
  entity_type text NOT NULL DEFAULT '',
  entity_id text NOT NULL DEFAULT '',
  customer_id text NOT NULL DEFAULT '',
  link text NOT NULL DEFAULT '/admin/dashboard',
  is_read boolean NOT NULL DEFAULT false,
  read_by text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 4. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_wp_admin_notifications_unread_created
  ON web_platform.admin_notifications (is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pub_admin_notifications_unread_created
  ON public.admin_notifications (is_read, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wp_store_orders_customer_id ON web_platform.store_orders (customer_id);
CREATE INDEX IF NOT EXISTS idx_wp_store_orders_user_status ON web_platform.store_orders (user_id, order_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wp_store_orders_payment_status ON web_platform.store_orders (payment_status);

CREATE INDEX IF NOT EXISTS idx_wp_product_enquiries_status ON web_platform.product_enquiries (status, priority, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wp_product_enquiries_email ON web_platform.product_enquiries (lower(email));

CREATE INDEX IF NOT EXISTS idx_wp_support_tickets_status ON web_platform.support_tickets (status, priority, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wp_support_tickets_email ON web_platform.support_tickets (lower(email));

CREATE INDEX IF NOT EXISTS idx_wp_pcb_enquiries_status ON web_platform.pcb_enquiries (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wp_b2b_enquiries_status ON web_platform.b2b_enquiries (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wp_project_enquiries_status ON web_platform.project_enquiries (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wp_projects_status_eng ON web_platform.projects (status, assigned_engineer, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wp_invoices_entity ON web_platform.invoices (entity_type, entity_id, issued_at DESC);
CREATE INDEX IF NOT EXISTS idx_wp_payments_entity ON web_platform.payments (entity_type, entity_id, status);

-- 5. RLS & Admin Policies for public.* tables
ALTER TABLE IF EXISTS public.admin_notifications ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'is_ntf_admin') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'admin_notifications' AND policyname = 'admin_notifications_admin_all'
    ) THEN
      CREATE POLICY admin_notifications_admin_all ON public.admin_notifications
        FOR ALL
        USING (public.is_ntf_admin())
        WITH CHECK (public.is_ntf_admin());
    END IF;
  END IF;
END $$;

-- 6. Enable Supabase Realtime replication safely
DO $$
DECLARE
  tbl text;
  tables_to_add text[] := ARRAY[
    'customers',
    'store_orders',
    'customer_enquiries',
    'customer_projects',
    'invoices',
    'admin_notifications',
    'contact_enquiries',
    'product_enquiries',
    'support_tickets'
  ];
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOREACH tbl IN ARRAY tables_to_add LOOP
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = tbl AND table_type = 'BASE TABLE'
        ) THEN
          EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', tbl);
        END IF;
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END LOOP;
  END IF;
END $$;

COMMIT;
