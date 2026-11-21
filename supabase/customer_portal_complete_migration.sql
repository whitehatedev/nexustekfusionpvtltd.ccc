-- ============================================================================
-- NEXUSTEKFUSION PRIVATE LIMITED — CUSTOMER MY ACCOUNT PORTAL & SUPABASE
-- COMPLETE DATABASE INTEGRATION MIGRATION (SAFE, ADDITIVE & IDEMPOTENT)
-- Never drops, truncates, or overwrites existing customer records.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS web_platform;

-- 1. Universal updated_at Trigger Function
CREATE OR REPLACE FUNCTION public.fn_ntf_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- 2. Extend Customer & User Tables with Notification Preferences & Password Status
ALTER TABLE IF EXISTS web_platform.users
  ADD COLUMN IF NOT EXISTS notification_preferences jsonb NOT NULL DEFAULT '{"emailUpdates":true,"orderAlerts":true,"quotationAlerts":true,"promotionalEmails":false,"whatsappAlerts":true}'::jsonb,
  ADD COLUMN IF NOT EXISTS password_configured boolean NOT NULL DEFAULT false;

ALTER TABLE IF EXISTS web_platform.customers
  ADD COLUMN IF NOT EXISTS notification_preferences jsonb NOT NULL DEFAULT '{"emailUpdates":true,"orderAlerts":true,"quotationAlerts":true,"promotionalEmails":false,"whatsappAlerts":true}'::jsonb,
  ADD COLUMN IF NOT EXISTS password_configured boolean NOT NULL DEFAULT false;

ALTER TABLE IF EXISTS public.customers
  ADD COLUMN IF NOT EXISTS notification_preferences jsonb NOT NULL DEFAULT '{"emailUpdates":true,"orderAlerts":true,"quotationAlerts":true,"promotionalEmails":false,"whatsappAlerts":true}'::jsonb,
  ADD COLUMN IF NOT EXISTS password_configured boolean NOT NULL DEFAULT false;

ALTER TABLE IF EXISTS public.customer_profiles
  ADD COLUMN IF NOT EXISTS customer_id text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS full_address text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS city text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS state text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS pin_code text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS account_status text NOT NULL DEFAULT 'Active',
  ADD COLUMN IF NOT EXISTS notification_preferences jsonb NOT NULL DEFAULT '{"emailUpdates":true,"orderAlerts":true,"quotationAlerts":true,"promotionalEmails":false,"whatsappAlerts":true}'::jsonb,
  ADD COLUMN IF NOT EXISTS password_configured boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- 3. Web Platform & Public Customer Activity Logs (Append-Only Audit Trail)
CREATE TABLE IF NOT EXISTS web_platform.customer_activity_logs (
  id serial PRIMARY KEY,
  user_id integer REFERENCES web_platform.users(id) ON DELETE SET NULL,
  customer_id text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  action text NOT NULL,
  category text NOT NULL DEFAULT 'account',
  entity_type text NOT NULL DEFAULT 'customer',
  entity_id text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wp_cust_activity_user_id ON web_platform.customer_activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_wp_cust_activity_customer_id ON web_platform.customer_activity_logs(customer_id);

CREATE TABLE IF NOT EXISTS public.customer_activity_logs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_uid text NOT NULL DEFAULT '',
  auth_user_id uuid,
  customer_id text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  action text NOT NULL,
  category text NOT NULL DEFAULT 'account',
  entity_type text NOT NULL DEFAULT 'customer',
  entity_id text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pub_cust_activity_uid ON public.customer_activity_logs(user_uid);
CREATE INDEX IF NOT EXISTS idx_pub_cust_activity_cid ON public.customer_activity_logs(customer_id);

-- 4. Customer Addresses (Billing & Delivery with Default Flag)
CREATE TABLE IF NOT EXISTS public.customer_addresses (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  local_address_id integer UNIQUE,
  user_uid text NOT NULL DEFAULT '',
  auth_user_id uuid,
  customer_id text NOT NULL DEFAULT '',
  label text NOT NULL DEFAULT 'Primary',
  address_type text NOT NULL DEFAULT 'both',
  full_name text NOT NULL,
  mobile text NOT NULL,
  house_flat text NOT NULL,
  street_area text NOT NULL DEFAULT '',
  landmark text NOT NULL DEFAULT '',
  city text NOT NULL DEFAULT '',
  district text NOT NULL DEFAULT '',
  state text NOT NULL DEFAULT '',
  pin_code text NOT NULL DEFAULT '',
  country text NOT NULL DEFAULT 'India',
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pub_cust_addr_uid ON public.customer_addresses(user_uid);

-- 5. Order Items & Order Tracking (Relational Breakdown Linked to store_orders)
CREATE TABLE IF NOT EXISTS public.order_items (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_number text NOT NULL,
  user_uid text NOT NULL DEFAULT '',
  product_sku text NOT NULL DEFAULT '',
  product_name text NOT NULL,
  variant text NOT NULL DEFAULT '',
  color text NOT NULL DEFAULT '',
  qty integer NOT NULL DEFAULT 1,
  unit_price_inr integer NOT NULL DEFAULT 0,
  gst_percent integer NOT NULL DEFAULT 18,
  line_total_inr integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pub_order_items_order ON public.order_items(order_number);

CREATE TABLE IF NOT EXISTS public.order_tracking (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_number text UNIQUE NOT NULL,
  user_uid text NOT NULL DEFAULT '',
  current_status text NOT NULL DEFAULT 'Order Placed',
  courier_name text NOT NULL DEFAULT '',
  tracking_number text NOT NULL DEFAULT '',
  tracking_url text NOT NULL DEFAULT '',
  dispatch_date text NOT NULL DEFAULT '',
  estimated_delivery text NOT NULL DEFAULT '',
  status_history jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pub_order_tracking_uid ON public.order_tracking(user_uid);

-- 6. Customer Cart Items (Item-level relational breakdown alongside customer_carts JSONB)
CREATE TABLE IF NOT EXISTS public.customer_cart_items (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_uid text NOT NULL,
  product_id integer NOT NULL,
  product_sku text NOT NULL DEFAULT '',
  product_name text NOT NULL DEFAULT '',
  unit_price_inr integer NOT NULL DEFAULT 0,
  qty integer NOT NULL DEFAULT 1,
  variant text NOT NULL DEFAULT '',
  color text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_uid, product_id, variant, color)
);

-- 7. Unified Customer Enquiries & Active Projects Mirror
CREATE TABLE IF NOT EXISTS public.customer_enquiries (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  enquiry_number text UNIQUE NOT NULL,
  enquiry_source text NOT NULL DEFAULT 'project', -- project | product | krashivantri | contact | b2b | pcb | 3d_printing
  user_uid text NOT NULL DEFAULT '',
  customer_id text NOT NULL DEFAULT '',
  customer_name text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  subject text NOT NULL DEFAULT '',
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'Submitted',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pub_cust_enq_uid ON public.customer_enquiries(user_uid);

CREATE TABLE IF NOT EXISTS public.customer_projects (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_code text UNIQUE NOT NULL,
  enquiry_number text NOT NULL DEFAULT '',
  user_uid text NOT NULL DEFAULT '',
  customer_id text NOT NULL DEFAULT '',
  title text NOT NULL,
  assigned_engineer text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'Project Development Started',
  progress_percent integer NOT NULL DEFAULT 0,
  total_amount_inr integer NOT NULL DEFAULT 0,
  paid_amount_inr integer NOT NULL DEFAULT 0,
  balance_amount_inr integer NOT NULL DEFAULT 0,
  handover_unlocked boolean NOT NULL DEFAULT false,
  completion_certificate_number text NOT NULL DEFAULT '',
  documents jsonb NOT NULL DEFAULT '[]'::jsonb,
  updates jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pub_cust_proj_uid ON public.customer_projects(user_uid);

-- 8. 3D Printing Files, PCB Enquiries & Files, B2B Enquiries, Support Tickets & Messages
CREATE TABLE IF NOT EXISTS public.printing_3d_files (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_number text UNIQUE NOT NULL,
  user_uid text NOT NULL DEFAULT '',
  customer_id text NOT NULL DEFAULT '',
  file_name text NOT NULL,
  file_format text NOT NULL DEFAULT '',
  file_size_bytes integer NOT NULL DEFAULT 0,
  storage_bucket text NOT NULL DEFAULT 'printing-files',
  storage_path text NOT NULL DEFAULT '',
  uploaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pcb_enquiries (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  enquiry_number text UNIQUE NOT NULL,
  user_uid text NOT NULL DEFAULT '',
  customer_id text NOT NULL DEFAULT '',
  customer_name text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  mobile text NOT NULL DEFAULT '',
  board_dimensions_mm text NOT NULL DEFAULT '',
  layer_count integer NOT NULL DEFAULT 2,
  board_quantity integer NOT NULL DEFAULT 5,
  assembly_required boolean NOT NULL DEFAULT false,
  surface_finish text NOT NULL DEFAULT 'HASL Lead-Free',
  special_instructions text NOT NULL DEFAULT '',
  quoted_amount_inr integer,
  payment_status text NOT NULL DEFAULT 'pending',
  status text NOT NULL DEFAULT 'Submitted',
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pub_pcb_uid ON public.pcb_enquiries(user_uid);

CREATE TABLE IF NOT EXISTS public.pcb_files (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  enquiry_number text NOT NULL,
  user_uid text NOT NULL DEFAULT '',
  file_name text NOT NULL,
  file_kind text NOT NULL DEFAULT 'gerber_or_bom',
  size_bytes integer NOT NULL DEFAULT 0,
  storage_bucket text NOT NULL DEFAULT 'pcb-files',
  storage_path text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.b2b_enquiries (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  enquiry_number text UNIQUE NOT NULL,
  user_uid text NOT NULL DEFAULT '',
  customer_id text NOT NULL DEFAULT '',
  company_name text NOT NULL,
  contact_person text NOT NULL,
  email text NOT NULL DEFAULT '',
  mobile text NOT NULL DEFAULT '',
  gstin text NOT NULL DEFAULT '',
  requirement_category text NOT NULL DEFAULT 'Bulk Hardware',
  quantity integer NOT NULL DEFAULT 10,
  technical_specs text NOT NULL DEFAULT '',
  expected_delivery_date text NOT NULL DEFAULT '',
  shipping_location text NOT NULL DEFAULT '',
  quoted_amount_inr integer,
  volume_discount_percent integer NOT NULL DEFAULT 0,
  payment_status text NOT NULL DEFAULT 'pending',
  status text NOT NULL DEFAULT 'Submitted',
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pub_b2b_uid ON public.b2b_enquiries(user_uid);

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_number text UNIQUE NOT NULL,
  user_uid text NOT NULL DEFAULT '',
  customer_id text NOT NULL DEFAULT '',
  service_category text NOT NULL DEFAULT 'General',
  subject text NOT NULL,
  status text NOT NULL DEFAULT 'Open',
  priority text NOT NULL DEFAULT 'Normal',
  messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pub_support_uid ON public.support_tickets(user_uid);

CREATE TABLE IF NOT EXISTS public.support_messages (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_number text NOT NULL,
  user_uid text NOT NULL DEFAULT '',
  sender_name text NOT NULL,
  sender_role text NOT NULL DEFAULT 'customer',
  message text NOT NULL,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pub_support_msg_ticket ON public.support_messages(ticket_number);

-- 9. Compatibility Views so Every Canonical Table Name Resolves Cleanly Without Data Duplication
CREATE OR REPLACE VIEW public.customer_orders AS
  SELECT * FROM public.store_orders;

CREATE OR REPLACE VIEW public.customer_invoices AS
  SELECT * FROM public.invoices;

CREATE OR REPLACE VIEW public.customer_cart AS
  SELECT * FROM public.customer_carts;

CREATE OR REPLACE VIEW public.customer_wishlist AS
  SELECT * FROM public.wishlists;

CREATE OR REPLACE VIEW public.customer_reviews AS
  SELECT * FROM public.product_reviews;

CREATE OR REPLACE VIEW public.customer_notifications AS
  SELECT * FROM public.notifications;

CREATE OR REPLACE VIEW public.printing_3d_enquiries AS
  SELECT * FROM public.printing_orders;

-- 10. Automatic updated_at Triggers on Mutable Portal Tables
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'customer_profiles',
    'customer_addresses',
    'order_tracking',
    'customer_cart_items',
    'customer_enquiries',
    'customer_projects',
    'pcb_enquiries',
    'b2b_enquiries',
    'support_tickets'
  ]
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = tbl
    ) THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated_at ON public.%I;', tbl, tbl);
      EXECUTE format(
        'CREATE TRIGGER trg_%I_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.fn_ntf_set_updated_at();',
        tbl, tbl
      );
    END IF;
  END LOOP;
END $$;

-- 11. Enable RLS & Enforce Strict Customer Ownership vs Verified Admin Policies
ALTER TABLE public.customer_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_cart_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_enquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.printing_3d_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pcb_enquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pcb_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.b2b_enquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_activity_logs ENABLE ROW LEVEL SECURITY;

-- Customer Addresses
DROP POLICY IF EXISTS "Customer manage own addresses" ON public.customer_addresses;
CREATE POLICY "Customer manage own addresses"
  ON public.customer_addresses FOR ALL
  USING (auth.uid() = auth_user_id OR auth.uid()::text = user_uid OR public.is_ntf_admin())
  WITH CHECK (auth.uid() = auth_user_id OR auth.uid()::text = user_uid OR public.is_ntf_admin());

-- Order Items & Order Tracking
DROP POLICY IF EXISTS "Customer read own order items" ON public.order_items;
CREATE POLICY "Customer read own order items"
  ON public.order_items FOR SELECT
  USING (auth.uid()::text = user_uid OR public.is_ntf_admin());

DROP POLICY IF EXISTS "Customer read own order tracking" ON public.order_tracking;
CREATE POLICY "Customer read own order tracking"
  ON public.order_tracking FOR SELECT
  USING (auth.uid()::text = user_uid OR public.is_ntf_admin());

-- Cart Items
DROP POLICY IF EXISTS "Customer manage own cart items" ON public.customer_cart_items;
CREATE POLICY "Customer manage own cart items"
  ON public.customer_cart_items FOR ALL
  USING (auth.uid()::text = user_uid OR public.is_ntf_admin())
  WITH CHECK (auth.uid()::text = user_uid OR public.is_ntf_admin());

-- Customer Enquiries & Projects
DROP POLICY IF EXISTS "Customer read own enquiries" ON public.customer_enquiries;
CREATE POLICY "Customer read own enquiries"
  ON public.customer_enquiries FOR SELECT
  USING (auth.uid()::text = user_uid OR lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')) OR public.is_ntf_admin());

DROP POLICY IF EXISTS "Customer read own projects" ON public.customer_projects;
CREATE POLICY "Customer read own projects"
  ON public.customer_projects FOR SELECT
  USING (auth.uid()::text = user_uid OR public.is_ntf_admin());

-- 3D Printing Files (Customer can download/read own; Admins read all; Customers never delete)
DROP POLICY IF EXISTS "Customer read own 3d files" ON public.printing_3d_files;
CREATE POLICY "Customer read own 3d files"
  ON public.printing_3d_files FOR SELECT
  USING (auth.uid()::text = user_uid OR public.is_ntf_admin());

-- PCB Enquiries & Files
DROP POLICY IF EXISTS "Customer manage own pcb enquiries" ON public.pcb_enquiries;
CREATE POLICY "Customer manage own pcb enquiries"
  ON public.pcb_enquiries FOR ALL
  USING (auth.uid()::text = user_uid OR public.is_ntf_admin())
  WITH CHECK (auth.uid()::text = user_uid OR public.is_ntf_admin());

DROP POLICY IF EXISTS "Customer read own pcb files" ON public.pcb_files;
CREATE POLICY "Customer read own pcb files"
  ON public.pcb_files FOR SELECT
  USING (auth.uid()::text = user_uid OR public.is_ntf_admin());

-- B2B Enquiries
DROP POLICY IF EXISTS "Customer manage own b2b enquiries" ON public.b2b_enquiries;
CREATE POLICY "Customer manage own b2b enquiries"
  ON public.b2b_enquiries FOR ALL
  USING (auth.uid()::text = user_uid OR public.is_ntf_admin())
  WITH CHECK (auth.uid()::text = user_uid OR public.is_ntf_admin());

-- Support Tickets & Messages
DROP POLICY IF EXISTS "Customer manage own support tickets" ON public.support_tickets;
CREATE POLICY "Customer manage own support tickets"
  ON public.support_tickets FOR ALL
  USING (auth.uid()::text = user_uid OR public.is_ntf_admin())
  WITH CHECK (auth.uid()::text = user_uid OR public.is_ntf_admin());

DROP POLICY IF EXISTS "Customer manage own support messages" ON public.support_messages;
CREATE POLICY "Customer manage own support messages"
  ON public.support_messages FOR ALL
  USING (auth.uid()::text = user_uid OR public.is_ntf_admin())
  WITH CHECK (auth.uid()::text = user_uid OR public.is_ntf_admin());

-- Customer Activity Logs (Customer reads own; Admin reads all)
DROP POLICY IF EXISTS "Customer read own activity logs" ON public.customer_activity_logs;
CREATE POLICY "Customer read own activity logs"
  ON public.customer_activity_logs FOR SELECT
  USING (auth.uid() = auth_user_id OR auth.uid()::text = user_uid OR public.is_ntf_admin());

-- Wishlists, Invoices, Notifications, Reviews Missing Policies on Existing Tables
DROP POLICY IF EXISTS "Customer manage own wishlists" ON public.wishlists;
CREATE POLICY "Customer manage own wishlists"
  ON public.wishlists FOR ALL
  USING (auth.uid()::text = user_uid OR public.is_ntf_admin())
  WITH CHECK (auth.uid()::text = user_uid OR public.is_ntf_admin());

DROP POLICY IF EXISTS "Customer read own invoices" ON public.invoices;
CREATE POLICY "Customer read own invoices"
  ON public.invoices FOR SELECT
  USING (auth.uid()::text = user_uid OR public.is_ntf_admin());

DROP POLICY IF EXISTS "Customer manage own notifications" ON public.notifications;
CREATE POLICY "Customer manage own notifications"
  ON public.notifications FOR ALL
  USING (auth.uid()::text = user_uid OR public.is_ntf_admin())
  WITH CHECK (auth.uid()::text = user_uid OR public.is_ntf_admin());

DROP POLICY IF EXISTS "Customer insert own reviews" ON public.product_reviews;
CREATE POLICY "Customer insert own reviews"
  ON public.product_reviews FOR INSERT
  WITH CHECK (auth.uid()::text = user_uid OR public.is_ntf_admin());

-- 12. Ensure Private Storage Buckets for Documents, PCB/Gerber Files, Support Attachments & Invoices
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('pcb-files', 'pcb-files', false),
  ('support-files', 'support-files', false),
  ('invoices-pdf', 'invoices-pdf', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Admin full access portal storage" ON storage.objects;
CREATE POLICY "Admin full access portal storage"
  ON storage.objects FOR ALL
  USING (bucket_id IN ('pcb-files', 'support-files', 'invoices-pdf') AND public.is_ntf_admin())
  WITH CHECK (bucket_id IN ('pcb-files', 'support-files', 'invoices-pdf') AND public.is_ntf_admin());
