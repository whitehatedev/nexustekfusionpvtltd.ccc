-- ============================================================================
-- NEXUSTEKFUSION PRIVATE LIMITED — 3D Printing File Storage, Strict Account
-- Separation, Role-Based RLS & Printing Authorization Schema Migration
-- Safe & Idempotent PostgreSQL / Supabase Migration (Zero Destructive Changes)
-- ============================================================================

-- 1. Non-destructively ensure & extend public.printing_orders if synced to Supabase public schema
CREATE TABLE IF NOT EXISTS public.printing_orders (
  id bigserial PRIMARY KEY,
  order_number text UNIQUE NOT NULL,
  user_id integer,
  customer_id text NOT NULL DEFAULT '',
  customer_name text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  file_name text NOT NULL DEFAULT '',
  file_path text NOT NULL DEFAULT '',
  file_storage_path text NOT NULL DEFAULT '',
  file_format text NOT NULL DEFAULT '',
  file_size integer NOT NULL DEFAULT 0,
  file_size_bytes integer NOT NULL DEFAULT 0,
  file_version text NOT NULL DEFAULT 'v1',
  storage_bucket text NOT NULL DEFAULT 'printing-files',
  technology text NOT NULL DEFAULT 'FDM',
  printer_name text NOT NULL DEFAULT '',
  material_name text NOT NULL DEFAULT '',
  color_name text NOT NULL DEFAULT '',
  quoted_price integer DEFAULT NULL,
  total_inr integer NOT NULL DEFAULT 0,
  payment_status text NOT NULL DEFAULT 'pending',
  refund_status text NOT NULL DEFAULT 'none',
  payment_id text NOT NULL DEFAULT '',
  razorpay_order_id text NOT NULL DEFAULT '',
  razorpay_payment_id text NOT NULL DEFAULT '',
  printing_status text NOT NULL DEFAULT 'Pending Payment',
  order_status text NOT NULL DEFAULT 'Pending Payment',
  rejection_reason text NOT NULL DEFAULT '',
  customer_download_enabled boolean NOT NULL DEFAULT true,
  payment_verified_at timestamptz DEFAULT NULL,
  printing_approved_at timestamptz DEFAULT NULL,
  printing_approved_by text NOT NULL DEFAULT '',
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE IF EXISTS public.printing_orders
  ADD COLUMN IF NOT EXISTS user_id integer,
  ADD COLUMN IF NOT EXISTS customer_id text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS customer_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS email text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS phone text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS file_path text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS file_storage_path text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS file_size integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS file_size_bytes integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS file_version text NOT NULL DEFAULT 'v1',
  ADD COLUMN IF NOT EXISTS storage_bucket text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS printer_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS wall_count integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS print_speed_mm_s integer NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS nozzle_diameter_mm double precision NOT NULL DEFAULT 0.4,
  ADD COLUMN IF NOT EXISTS build_orientation text NOT NULL DEFAULT 'Auto Optimal',
  ADD COLUMN IF NOT EXISTS scale_percent integer NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS customer_parameters jsonb DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS confirmed_parameters jsonb DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS quoted_price integer DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS payment_id text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS printing_status text NOT NULL DEFAULT 'Pending Payment',
  ADD COLUMN IF NOT EXISTS refund_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS payment_verified_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS customer_download_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS rejection_reason text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS printing_approved_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS printing_approved_by text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS uploaded_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_public_printing_orders_customer_id ON public.printing_orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_public_printing_orders_payment_status ON public.printing_orders(payment_status);

-- Also ensure web_platform.printing_orders has all columns if schema exists
ALTER TABLE IF EXISTS web_platform.printing_orders
  ADD COLUMN IF NOT EXISTS customer_id text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS customer_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS email text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS phone text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS quoted_price_inr integer,
  ADD COLUMN IF NOT EXISTS rejection_reason text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS printing_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS printing_approved_by text NOT NULL DEFAULT '';

-- 2. Verified Web Admin Role Helper (Checks web_platform.users ONLY — never customer roles or mutable metadata)
CREATE OR REPLACE FUNCTION public.is_ntf_3dp_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, web_platform
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM web_platform.users u
    WHERE (u.auth_user_id = auth.uid() OR u.uid = auth.uid()::text)
      AND u.role IN (
        'super_admin',
        'admin',
        'website_manager',
        'product_manager',
        'sales_manager',
        'project_manager',
        'engineer',
        'printing_operator',
        'inventory_manager',
        'accounts_manager',
        'support_manager',
        'support_staff'
      )
      AND u.is_active = true
      AND u.account_status = 'Active'
      AND u.deleted_at IS NULL
  );
$$;

-- 3. Customer Ownership Helper (Strictly Customer Role & Authenticated UUID)
CREATE OR REPLACE FUNCTION public.is_ntf_customer_owner(p_user_id integer)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, web_platform
AS $$
  SELECT p_user_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM web_platform.users u
    WHERE u.id = p_user_id
      AND (u.auth_user_id = auth.uid() OR u.uid = auth.uid()::text)
      AND u.is_active = true
      AND u.account_status = 'Active'
      AND u.deleted_at IS NULL
  );
$$;

-- 4. Private Storage Bucket for Customer Original & Production 3D Files
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'printing-files',
  'printing-files',
  false,
  83886080, -- 80 MB
  ARRAY[
    'application/octet-stream',
    'model/stl',
    'application/vnd.ms-pki.stl',
    'model/obj',
    'text/plain',
    'model/3mf',
    'application/zip',
    'application/step',
    'model/step',
    'model/iges',
    'application/iges',
    'application/pdf'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 83886080;

-- 5. Backend Payment Verification Helper (for Printing Authorization Gate)
CREATE OR REPLACE FUNCTION public.is_3dp_order_paid(p_order_id integer)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, web_platform
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM web_platform.printing_orders po
    WHERE po.id = p_order_id
      AND po.payment_status = 'paid'
      AND COALESCE(po.refund_status, 'none') = 'none'
      AND po.total_inr > 0
  );
$$;

-- 6. Strict RLS on web_platform.printing_orders, production files & download logs
ALTER TABLE IF EXISTS web_platform.printing_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS web_platform."3d_printing_production_files" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS web_platform.printing_file_download_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Customers read own web 3d orders" ON web_platform.printing_orders;
CREATE POLICY "Customers read own web 3d orders"
  ON web_platform.printing_orders FOR SELECT
  TO authenticated
  USING (
    public.is_ntf_customer_owner(user_id)
    OR public.is_ntf_3dp_admin()
  );

DROP POLICY IF EXISTS "Customers insert own web 3d orders unpaid" ON web_platform.printing_orders;
CREATE POLICY "Customers insert own web 3d orders unpaid"
  ON web_platform.printing_orders FOR INSERT
  TO authenticated
  WITH CHECK (
    payment_status = 'pending'
    AND COALESCE(refund_status, 'none') = 'none'
    AND COALESCE(printing_approved_by, '') = ''
    AND printing_approved_at IS NULL
    AND public.is_ntf_customer_owner(user_id)
  );

DROP POLICY IF EXISTS "Admins manage web 3d orders" ON web_platform.printing_orders;
CREATE POLICY "Admins manage web 3d orders"
  ON web_platform.printing_orders FOR UPDATE
  TO authenticated
  USING (public.is_ntf_3dp_admin())
  WITH CHECK (public.is_ntf_3dp_admin());

DROP POLICY IF EXISTS "Admins delete web 3d orders" ON web_platform.printing_orders;
CREATE POLICY "Admins delete web 3d orders"
  ON web_platform.printing_orders FOR DELETE
  TO authenticated
  USING (public.is_ntf_3dp_admin());

DROP POLICY IF EXISTS "Admins manage web 3d production files" ON web_platform."3d_printing_production_files";
CREATE POLICY "Admins manage web 3d production files"
  ON web_platform."3d_printing_production_files" FOR ALL
  TO authenticated
  USING (public.is_ntf_3dp_admin())
  WITH CHECK (public.is_ntf_3dp_admin());

DROP POLICY IF EXISTS "Admins view web 3d download logs" ON web_platform.printing_file_download_logs;
CREATE POLICY "Admins view web 3d download logs"
  ON web_platform.printing_file_download_logs FOR SELECT
  TO authenticated
  USING (public.is_ntf_3dp_admin());

-- Also apply equivalent RLS if public.printing_orders exists
DO $$
BEGIN
  IF to_regclass('public.printing_orders') IS NOT NULL THEN
    ALTER TABLE public.printing_orders ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Customers read own 3d orders" ON public.printing_orders;
    CREATE POLICY "Customers read own 3d orders"
      ON public.printing_orders FOR SELECT
      TO authenticated
      USING (
        public.is_ntf_customer_owner(user_id)
        OR public.is_ntf_3dp_admin()
      );

    DROP POLICY IF EXISTS "Customers insert own 3d orders unpaid" ON public.printing_orders;
    CREATE POLICY "Customers insert own 3d orders unpaid"
      ON public.printing_orders FOR INSERT
      TO authenticated
      WITH CHECK (
        payment_status = 'pending'
        AND COALESCE(refund_status, 'none') = 'none'
        AND COALESCE(printing_approved_by, '') = ''
        AND printing_approved_at IS NULL
        AND public.is_ntf_customer_owner(user_id)
      );

    DROP POLICY IF EXISTS "Admins manage 3d order production fields" ON public.printing_orders;
    CREATE POLICY "Admins manage 3d order production fields"
      ON public.printing_orders FOR UPDATE
      TO authenticated
      USING (public.is_ntf_3dp_admin())
      WITH CHECK (public.is_ntf_3dp_admin());

    DROP POLICY IF EXISTS "Admins delete 3d orders" ON public.printing_orders;
    CREATE POLICY "Admins delete 3d orders"
      ON public.printing_orders FOR DELETE
      TO authenticated
      USING (public.is_ntf_3dp_admin());
  END IF;
END $$;

-- 7. Strict Private Storage Bucket Policies (Zero Public Access; Per-Customer Upload Path; Admins Always Allowed)
DROP POLICY IF EXISTS "Deny public reads on printing-files" ON storage.objects;
DROP POLICY IF EXISTS "Authorized users upload original 3d design" ON storage.objects;
CREATE POLICY "Authorized users upload original 3d design"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'printing-files'
    AND (
      public.is_ntf_3dp_admin()
      OR (
        (storage.foldername(name))[1] = 'original'
        AND (
          (storage.foldername(name))[2] = auth.uid()::text
          OR EXISTS (
            SELECT 1 FROM web_platform.users u
            WHERE (u.auth_user_id = auth.uid() OR u.uid = auth.uid()::text)
              AND u.is_active = true
              AND u.account_status = 'Active'
              AND u.deleted_at IS NULL
              AND (storage.foldername(name))[2] = ('u_' || u.id::text)
          )
        )
      )
    )
  );

DROP POLICY IF EXISTS "No direct unverified download of printing-files" ON storage.objects;
DROP POLICY IF EXISTS "Admins and owners read printing-files" ON storage.objects;
CREATE POLICY "Admins and owners read printing-files"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'printing-files'
    AND (
      public.is_ntf_3dp_admin()
      OR EXISTS (
        SELECT 1
        FROM web_platform.printing_orders po
        JOIN web_platform.users u ON u.id = po.user_id
        WHERE po.file_storage_path = storage.objects.name
          AND (u.auth_user_id = auth.uid() OR u.uid = auth.uid()::text)
          AND u.is_active = true
          AND u.deleted_at IS NULL
          AND COALESCE(po.customer_download_enabled, true) = true
      )
    )
  );

DROP POLICY IF EXISTS "Admins delete printing-files" ON storage.objects;
CREATE POLICY "Admins delete printing-files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'printing-files'
    AND public.is_ntf_3dp_admin()
  );

-- 8. Protect web_platform.users role & privileges against non-admin / self-escalation
ALTER TABLE IF EXISTS web_platform.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own row or admin reads" ON web_platform.users;
CREATE POLICY "Users read own row or admin reads"
  ON web_platform.users FOR SELECT
  TO authenticated
  USING (
    auth_user_id = auth.uid()
    OR uid = auth.uid()::text
    OR public.is_ntf_3dp_admin()
  );
