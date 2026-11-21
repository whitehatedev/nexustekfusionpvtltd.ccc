-- ============================================================================
-- NEXUSTEKFUSION: EMAIL OTP, MULTI-PROFILE CUSTOMERS, RBAC & SAFE DELETE
-- Safe, non-destructive, idempotent migration. Preserves all existing rows.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS web_platform;

-- 1. Session active profile & scope isolation
ALTER TABLE IF EXISTS web_platform.admin_sessions
  ADD COLUMN IF NOT EXISTS active_customer_id text NOT NULL DEFAULT '';

ALTER TABLE IF EXISTS web_platform.admin_sessions
  ADD COLUMN IF NOT EXISTS session_scope text NOT NULL DEFAULT 'customer';

-- Backfill existing sessions based strictly on verified users.role
UPDATE web_platform.admin_sessions s
SET session_scope = CASE
  WHEN u.role IN (
    'super_admin', 'admin', 'website_manager', 'product_manager',
    'sales_manager', 'project_manager', 'engineer', 'printing_operator',
    'inventory_manager', 'accounts_manager', 'support_manager', 'support_staff'
  ) THEN 'admin'
  ELSE 'customer'
END
FROM web_platform.users u
WHERE s.user_id = u.id;

-- 2. Allow multiple customer profiles linked to the same verified auth_user_id / email / mobile
ALTER TABLE IF EXISTS web_platform.users
  ADD COLUMN IF NOT EXISTS auth_user_id uuid;

ALTER TABLE IF EXISTS web_platform.customers
  ADD COLUMN IF NOT EXISTS auth_user_id uuid;

ALTER TABLE IF EXISTS public.customer_profiles
  ADD COLUMN IF NOT EXISTS email text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS full_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS phone text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS company_or_college text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'customer',
  ADD COLUMN IF NOT EXISTS email_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS phone_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS phone_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Drop unique constraints on customer profile email / phone / user link if present
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT n.nspname AS schema_name, c.relname AS table_name, con.conname AS constraint_name
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'web_platform'
      AND c.relname IN ('customers', 'users')
      AND con.contype = 'u'
      AND (
        con.conname ILIKE '%email%'
        OR con.conname ILIKE '%phone%'
        OR con.conname ILIKE '%mobile%'
        OR con.conname ILIKE '%user_id%'
        OR con.conname ILIKE '%auth_user_id%'
      )
  LOOP
    EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT IF EXISTS %I', r.schema_name, r.table_name, r.constraint_name);
  END LOOP;
END $$;

DROP INDEX IF EXISTS web_platform.uq_customers_email_active;
DROP INDEX IF EXISTS web_platform.uq_customers_phone_active;
DROP INDEX IF EXISTS web_platform.customers_email_key;
DROP INDEX IF EXISTS web_platform.customers_phone_number_key;
DROP INDEX IF EXISTS web_platform.customers_user_id_key;

CREATE INDEX IF NOT EXISTS idx_web_users_auth_user_id ON web_platform.users(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_web_users_email_lower ON web_platform.users(LOWER(email));
CREATE INDEX IF NOT EXISTS idx_web_customers_auth_user_id ON web_platform.customers(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_web_customers_email_lower ON web_platform.customers(LOWER(email));
CREATE INDEX IF NOT EXISTS idx_web_customers_phone ON web_platform.customers(phone_number);

-- Backfill auth_user_id safely where null without merging rows
UPDATE web_platform.customers c
SET auth_user_id = u.auth_user_id
FROM web_platform.users u
WHERE c.user_id = u.id
  AND c.auth_user_id IS NULL
  AND u.auth_user_id IS NOT NULL;

-- 3. Staff granular customer-management RBAC permissions
CREATE TABLE IF NOT EXISTS web_platform.staff_permissions (
  id serial PRIMARY KEY,
  user_id integer NOT NULL UNIQUE REFERENCES web_platform.users(id) ON DELETE CASCADE,
  can_view_customers boolean NOT NULL DEFAULT true,
  can_add_customers boolean NOT NULL DEFAULT false,
  can_edit_customers boolean NOT NULL DEFAULT false,
  can_deactivate_customers boolean NOT NULL DEFAULT false,
  can_reactivate_customers boolean NOT NULL DEFAULT false,
  can_permanently_delete_customers boolean NOT NULL DEFAULT false,
  can_view_deletion_history boolean NOT NULL DEFAULT false,
  granted_by text NOT NULL DEFAULT '',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- 4. Anonymized Customer Permanent Deletion Audit Logs (financial compliance trail)
CREATE TABLE IF NOT EXISTS web_platform.customer_deletion_audit_logs (
  id serial PRIMARY KEY,
  customer_code text NOT NULL,
  customer_db_id text NOT NULL DEFAULT '',
  auth_user_id uuid,
  had_exclusive_auth_account boolean NOT NULL DEFAULT false,
  deleted_auth_account boolean NOT NULL DEFAULT false,
  deleted_by_user_id integer,
  deleted_by_email text NOT NULL,
  deleted_by_role text NOT NULL,
  reason text NOT NULL DEFAULT '',
  summary_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deletion_audit_customer_code
  ON web_platform.customer_deletion_audit_logs(customer_code);

-- 5. Safely convert financial/order/project/review FKs referencing web_platform.users(id)
--    from ON DELETE CASCADE + NOT NULL to nullable + ON DELETE SET NULL
DO $$
DECLARE
  tbl text;
  con_rec record;
  target_tables text[] := ARRAY[
    'product_reviews',
    'store_orders',
    'printing_orders',
    'project_enquiries',
    'projects',
    'project_acceptances',
    'payment_clearance_certificates',
    'project_work_orders',
    'project_handover_documents',
    'project_messages'
  ];
BEGIN
  FOREACH tbl IN ARRAY target_tables LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'web_platform' AND table_name = tbl AND column_name = 'user_id'
    ) THEN
      -- Make user_id nullable
      EXECUTE format('ALTER TABLE web_platform.%I ALTER COLUMN user_id DROP NOT NULL', tbl);

      -- Replace any FK constraint referencing web_platform.users with ON DELETE SET NULL
      FOR con_rec IN
        SELECT con.conname
        FROM pg_constraint con
        JOIN pg_class c ON c.oid = con.conrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY(con.conkey)
        WHERE n.nspname = 'web_platform'
          AND c.relname = tbl
          AND con.contype = 'f'
          AND a.attname = 'user_id'
      LOOP
        EXECUTE format('ALTER TABLE web_platform.%I DROP CONSTRAINT IF EXISTS %I', tbl, con_rec.conname);
      END LOOP;

      EXECUTE format(
        'ALTER TABLE web_platform.%I ADD CONSTRAINT %I FOREIGN KEY (user_id) REFERENCES web_platform.users(id) ON DELETE SET NULL',
        tbl,
        tbl || '_user_id_fkey'
      );
    END IF;
  END LOOP;
END $$;

-- 6. Enable RLS on new tables (Super Admin & Staff strict access)
ALTER TABLE IF EXISTS web_platform.staff_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS web_platform.customer_deletion_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS staff_permissions_self_or_super ON web_platform.staff_permissions;
CREATE POLICY staff_permissions_self_or_super ON web_platform.staff_permissions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM web_platform.users u
      WHERE u.id = staff_permissions.user_id
        AND (u.auth_user_id = auth.uid() OR LOWER(u.email) = LOWER(COALESCE(auth.jwt() ->> 'email', '')))
    )
    OR EXISTS (
      SELECT 1 FROM web_platform.users su
      WHERE (su.auth_user_id = auth.uid() OR LOWER(su.email) = LOWER(COALESCE(auth.jwt() ->> 'email', '')))
        AND su.role = 'super_admin'
        AND su.is_active = true
        AND su.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS staff_permissions_super_manage ON web_platform.staff_permissions;
CREATE POLICY staff_permissions_super_manage ON web_platform.staff_permissions
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM web_platform.users su
      WHERE (su.auth_user_id = auth.uid() OR LOWER(su.email) = LOWER(COALESCE(auth.jwt() ->> 'email', '')))
        AND su.role = 'super_admin'
        AND su.is_active = true
        AND su.deleted_at IS NULL
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM web_platform.users su
      WHERE (su.auth_user_id = auth.uid() OR LOWER(su.email) = LOWER(COALESCE(auth.jwt() ->> 'email', '')))
        AND su.role = 'super_admin'
        AND su.is_active = true
        AND su.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS deletion_audit_logs_admin_read ON web_platform.customer_deletion_audit_logs;
CREATE POLICY deletion_audit_logs_admin_read ON web_platform.customer_deletion_audit_logs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM web_platform.users su
      LEFT JOIN web_platform.staff_permissions sp ON sp.user_id = su.id
      WHERE (su.auth_user_id = auth.uid() OR LOWER(su.email) = LOWER(COALESCE(auth.jwt() ->> 'email', '')))
        AND su.is_active = true
        AND su.deleted_at IS NULL
        AND (
          su.role = 'super_admin'
          OR (su.role IN ('admin', 'support_manager', 'accounts_manager') AND COALESCE(sp.can_view_deletion_history, false) = true)
        )
    )
  );

DROP POLICY IF EXISTS service_role_all_staff_permissions ON web_platform.staff_permissions;
CREATE POLICY service_role_all_staff_permissions ON web_platform.staff_permissions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS service_role_all_deletion_audit ON web_platform.customer_deletion_audit_logs;
CREATE POLICY service_role_all_deletion_audit ON web_platform.customer_deletion_audit_logs
  FOR ALL TO service_role USING (true) WITH CHECK (true);
