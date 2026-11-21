-- ============================================================================
-- NEXUSTEKFUSION PRIVATE LIMITED — DEDICATED CUSTOMER REGISTRATION & MANAGEMENT
-- Complete Supabase PostgreSQL Setup Script
--
-- Features:
--   1. Creates dedicated editable `web_platform.customers` table as the primary
--      customer record system (independent of Supabase `auth.users`).
--   2. Auto-generates unique Customer ID (`NTF-CUST-000001`, `NTF-CUST-000002`, ...)
--      via sequence `web_platform.customers_code_seq` (deleted IDs never reused).
--   3. Automatically populates `registration_date`, `account_status` ('Active'),
--      `created_at`, and `updated_at`.
--   4. Stores scrypt-hashed `password_hash` (never plaintext passwords).
--   5. Includes Primary Keys, Unique Constraints, Check Constraints, Indexes,
--      Row Level Security (RLS) policies, and safe backfill of existing customers.
-- ============================================================================

BEGIN;

CREATE SCHEMA IF NOT EXISTS web_platform;

-- 1. Ensure web_platform.users has address columns for checkout/order compatibility
ALTER TABLE IF EXISTS web_platform.users
  ADD COLUMN IF NOT EXISTS full_address text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS pin_code text NOT NULL DEFAULT '';

-- 2. Dedicated sequence for unique human-readable Customer IDs (NTF-CUST-000001)
CREATE SEQUENCE IF NOT EXISTS web_platform.customers_code_seq
  START WITH 1
  INCREMENT BY 1
  NO MINVALUE
  NO MAXVALUE
  CACHE 1;

-- 3. Dedicated Customers Table (Primary Customer Record System)
CREATE TABLE IF NOT EXISTS web_platform.customers (
  id serial PRIMARY KEY,
  customer_id text NOT NULL UNIQUE
    DEFAULT ('NTF-CUST-' || LPAD(nextval('web_platform.customers_code_seq')::text, 6, '0')),
  user_id integer REFERENCES web_platform.users(id) ON DELETE SET NULL,
  auth_user_id uuid,
  full_name text NOT NULL,
  email text NOT NULL,
  phone_number text NOT NULL DEFAULT '',
  company_or_college text NOT NULL DEFAULT '',
  full_address text NOT NULL DEFAULT '',
  city text NOT NULL DEFAULT '',
  state text NOT NULL DEFAULT '',
  pin_code text NOT NULL DEFAULT '',
  password_hash text NOT NULL DEFAULT '',
  account_status text NOT NULL DEFAULT 'Active',
  status_reason text NOT NULL DEFAULT '',
  email_verified boolean NOT NULL DEFAULT false,
  last_password_reset_at timestamptz,
  last_password_change_at timestamptz,
  password_reset_status text NOT NULL DEFAULT 'Active',
  registration_date timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,

  CONSTRAINT customers_account_status_check
    CHECK (account_status IN ('Active', 'Suspended', 'Deactivated')),
  CONSTRAINT customers_pin_code_check
    CHECK (pin_code = '' OR pin_code ~ '^[0-9]{4,10}$')
);

ALTER TABLE web_platform.customers
  ADD COLUMN IF NOT EXISTS auth_user_id uuid,
  ADD COLUMN IF NOT EXISTS email_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_password_reset_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_password_change_at timestamptz,
  ADD COLUMN IF NOT EXISTS password_reset_status text NOT NULL DEFAULT 'Active';

ALTER TABLE web_platform.customers
  DROP CONSTRAINT IF EXISTS customers_user_id_key,
  DROP CONSTRAINT IF EXISTS customers_email_key,
  DROP CONSTRAINT IF EXISTS customers_phone_number_key;

ALTER TABLE web_platform.customers
  ALTER COLUMN customer_id
  SET DEFAULT ('NTF-CUST-' || LPAD(nextval('web_platform.customers_code_seq')::text, 6, '0'));

ALTER TABLE web_platform.customers
  ALTER COLUMN user_id DROP DEFAULT,
  ALTER COLUMN user_id DROP NOT NULL;

-- 4. Non-Unique Lookup Indexes (Allows multiple customer profiles sharing same mobile or verified email)
DROP INDEX IF EXISTS web_platform.uq_customers_email_active;
DROP INDEX IF EXISTS web_platform.uq_customers_phone_active;

CREATE INDEX IF NOT EXISTS idx_customers_email_lower
  ON web_platform.customers (LOWER(email))
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_customers_phone
  ON web_platform.customers (phone_number)
  WHERE deleted_at IS NULL AND phone_number <> '';

CREATE INDEX IF NOT EXISTS idx_customers_auth_user_id
  ON web_platform.customers (auth_user_id)
  WHERE deleted_at IS NULL AND auth_user_id IS NOT NULL;

-- 5. Performance Indexes for Search, Filter & Sorting in Admin Dashboard
CREATE INDEX IF NOT EXISTS idx_customers_status_regdate
  ON web_platform.customers (account_status, registration_date DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_customers_location
  ON web_platform.customers (state, city, pin_code)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_customers_name_search
  ON web_platform.customers (LOWER(full_name))
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_customers_user_id
  ON web_platform.customers (user_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_customer_addresses_user_default
  ON web_platform.customer_addresses (user_id, is_default DESC, id DESC);

-- 6. Triggers for Auto-Normalization, Timestamp Maintenance & Customer ID Assignment
CREATE OR REPLACE FUNCTION web_platform.fn_customers_before_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.customer_id IS NULL OR BTRIM(NEW.customer_id) = '' THEN
    NEW.customer_id := 'NTF-CUST-' || LPAD(nextval('web_platform.customers_code_seq')::text, 6, '0');
  END IF;

  NEW.email := LOWER(BTRIM(NEW.email));
  NEW.full_name := BTRIM(COALESCE(NEW.full_name, ''));
  NEW.phone_number := REGEXP_REPLACE(BTRIM(COALESCE(NEW.phone_number, '')), '^(\+91|91)', '');
  NEW.company_or_college := BTRIM(COALESCE(NEW.company_or_college, ''));
  NEW.full_address := BTRIM(COALESCE(NEW.full_address, ''));
  NEW.city := BTRIM(COALESCE(NEW.city, ''));
  NEW.state := BTRIM(COALESCE(NEW.state, ''));
  NEW.pin_code := BTRIM(COALESCE(NEW.pin_code, ''));

  IF NEW.account_status IS NULL OR BTRIM(NEW.account_status) = '' THEN
    NEW.account_status := 'Active';
  END IF;

  IF TG_OP = 'INSERT' AND NEW.registration_date IS NULL THEN
    NEW.registration_date := now();
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_customers_before_write ON web_platform.customers;
CREATE TRIGGER trg_customers_before_write
  BEFORE INSERT OR UPDATE ON web_platform.customers
  FOR EACH ROW
  EXECUTE FUNCTION web_platform.fn_customers_before_write();

-- Sync sequence safely above any existing user IDs or customer IDs and backfill existing non-staff customers
DO $$
DECLARE
  v_max_user_id bigint;
  v_max_cust_num bigint;
  v_target bigint;
BEGIN
  SELECT COALESCE(MAX(id), 0) INTO v_max_user_id FROM web_platform.users;
  SELECT COALESCE(MAX(NULLIF(REGEXP_REPLACE(customer_id, '\D', '', 'g'), '')::bigint), 0)
    INTO v_max_cust_num
    FROM web_platform.customers;
  v_target := GREATEST(v_max_user_id, v_max_cust_num);
  IF v_target > 0 THEN
    PERFORM setval('web_platform.customers_code_seq', v_target, true);
  END IF;
END $$;

INSERT INTO web_platform.customers (
  customer_id,
  user_id,
  full_name,
  email,
  phone_number,
  company_or_college,
  full_address,
  city,
  state,
  pin_code,
  password_hash,
  account_status,
  status_reason,
  registration_date,
  last_login_at,
  created_at,
  updated_at
)
SELECT
  'NTF-CUST-' || LPAD(u.id::text, 6, '0'),
  u.id,
  CASE WHEN BTRIM(u.full_name) <> '' THEN u.full_name ELSE SPLIT_PART(u.email, '@', 1) END,
  LOWER(BTRIM(u.email)),
  COALESCE(u.mobile, ''),
  COALESCE(u.company_or_college, ''),
  COALESCE(
    NULLIF(BTRIM(u.full_address), ''),
    NULLIF(BTRIM(CONCAT_WS(', ',
      NULLIF(BTRIM(ca.house_flat), ''),
      NULLIF(BTRIM(ca.street_area), ''),
      NULLIF(BTRIM(ca.landmark), '')
    )), ''),
    ''
  ),
  COALESCE(NULLIF(BTRIM(u.city), ''), ca.city, ''),
  COALESCE(NULLIF(BTRIM(u.state), ''), ca.state, ''),
  COALESCE(NULLIF(BTRIM(u.pin_code), ''), ca.pin_code, ''),
  COALESCE(u.password_hash, ''),
  CASE WHEN u.account_status IN ('Active', 'Suspended', 'Deactivated') THEN u.account_status ELSE 'Active' END,
  COALESCE(u.status_reason, ''),
  u.created_at,
  u.last_login_at,
  u.created_at,
  u.updated_at
FROM web_platform.users u
LEFT JOIN LATERAL (
  SELECT house_flat, street_area, landmark, city, state, pin_code
  FROM web_platform.customer_addresses
  WHERE user_id = u.id
  ORDER BY is_default DESC, id DESC
  LIMIT 1
) ca ON true
  WHERE u.deleted_at IS NULL
    AND u.role IN ('customer', 'buyer', 'farmer', 'drone_pilot')
    AND NOT EXISTS (
      SELECT 1 FROM web_platform.customers c
      WHERE c.user_id = u.id
    )
ON CONFLICT DO NOTHING;

-- Ensure sequence stays strictly above all existing customer_id values after backfill
DO $$
DECLARE
  v_max_user_id bigint;
  v_max_cust_num bigint;
  v_target bigint;
BEGIN
  SELECT COALESCE(MAX(id), 0) INTO v_max_user_id FROM web_platform.users;
  SELECT COALESCE(MAX(NULLIF(REGEXP_REPLACE(customer_id, '\D', '', 'g'), '')::bigint), 0)
    INTO v_max_cust_num
    FROM web_platform.customers;
  v_target := GREATEST(v_max_user_id, v_max_cust_num);
  IF v_target > 0 THEN
    PERFORM setval('web_platform.customers_code_seq', v_target, true);
  END IF;
END $$;

-- 7. Secure Admin Authorization Helper & Row Level Security (RLS)
CREATE OR REPLACE FUNCTION web_platform.is_customer_manager()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, web_platform, auth
AS $$
DECLARE
  v_uid uuid;
  v_role text;
BEGIN
  IF current_user IN ('postgres', 'service_role', 'supabase_admin') THEN
    RETURN true;
  END IF;

  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  SELECT u.role
  INTO v_role
  FROM web_platform.users u
  WHERE (u.auth_user_id = v_uid OR u.uid = v_uid::text)
    AND u.deleted_at IS NULL
    AND u.is_active = true
    AND u.account_status = 'Active'
  LIMIT 1;

  RETURN COALESCE(v_role IN (
    'super_admin',
    'admin',
    'sales_manager',
    'support_manager',
    'support_staff',
    'accounts_manager',
    'project_manager'
  ), false);
END;
$$;

ALTER TABLE web_platform.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE web_platform.customer_addresses ENABLE ROW LEVEL SECURITY;

-- Admin-only full management access on web_platform.customers
DROP POLICY IF EXISTS ntf_customers_admin_all ON web_platform.customers;
CREATE POLICY ntf_customers_admin_all
  ON web_platform.customers
  FOR ALL
  TO authenticated
  USING (web_platform.is_customer_manager())
  WITH CHECK (web_platform.is_customer_manager());

-- Service/Backend server access (postgres/service_role bypass RLS or match explicit policy)
DROP POLICY IF EXISTS ntf_customers_service_all ON web_platform.customers;
CREATE POLICY ntf_customers_service_all
  ON web_platform.customers
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS ntf_customers_self_select ON web_platform.customers;
CREATE POLICY ntf_customers_self_select
  ON web_platform.customers
  FOR SELECT
  TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      auth_user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM web_platform.users u
        WHERE u.id = customers.user_id
          AND (u.auth_user_id = auth.uid() OR u.uid = auth.uid()::text)
          AND u.deleted_at IS NULL
      )
    )
  );

DROP POLICY IF EXISTS ntf_customers_self_update ON web_platform.customers;
CREATE POLICY ntf_customers_self_update
  ON web_platform.customers
  FOR UPDATE
  TO authenticated
  USING (
    deleted_at IS NULL
    AND account_status = 'Active'
    AND (
      auth_user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM web_platform.users u
        WHERE u.id = customers.user_id
          AND (u.auth_user_id = auth.uid() OR u.uid = auth.uid()::text)
          AND u.deleted_at IS NULL
      )
    )
  )
  WITH CHECK (
    deleted_at IS NULL
    AND account_status = 'Active'
    AND (
      auth_user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM web_platform.users u
        WHERE u.id = customers.user_id
          AND (u.auth_user_id = auth.uid() OR u.uid = auth.uid()::text)
          AND u.deleted_at IS NULL
      )
    )
  );

-- Customer Addresses policies
DROP POLICY IF EXISTS ntf_customer_addresses_admin_all ON web_platform.customer_addresses;
CREATE POLICY ntf_customer_addresses_admin_all
  ON web_platform.customer_addresses
  FOR ALL
  TO authenticated
  USING (web_platform.is_customer_manager())
  WITH CHECK (web_platform.is_customer_manager());

DROP POLICY IF EXISTS ntf_customer_addresses_self_all ON web_platform.customer_addresses;
CREATE POLICY ntf_customer_addresses_self_all
  ON web_platform.customer_addresses
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM web_platform.users u
      WHERE u.id = customer_addresses.user_id
        AND (u.auth_user_id = auth.uid() OR u.uid = auth.uid()::text)
        AND u.deleted_at IS NULL
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM web_platform.users u
      WHERE u.id = customer_addresses.user_id
        AND (u.auth_user_id = auth.uid() OR u.uid = auth.uid()::text)
        AND u.deleted_at IS NULL
    )
  );

-- 8. Consolidated View for Admin Reporting (security_invoker respects RLS)
DROP VIEW IF EXISTS web_platform.admin_customer_directory CASCADE;
CREATE VIEW web_platform.admin_customer_directory
WITH (security_invoker = true)
AS
SELECT
  c.id,
  c.customer_id,
  c.user_id,
  c.full_name,
  c.email,
  c.phone_number,
  c.company_or_college,
  c.full_address,
  c.city,
  c.state,
  c.pin_code,
  c.account_status,
  c.status_reason,
  c.registration_date,
  c.last_login_at,
  c.created_at,
  c.updated_at
FROM web_platform.customers c
WHERE c.deleted_at IS NULL;

-- 9. Grants
GRANT USAGE ON SCHEMA web_platform TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON web_platform.customers TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON web_platform.customers TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE web_platform.customers_id_seq TO service_role, authenticated;
GRANT USAGE, SELECT ON SEQUENCE web_platform.customers_code_seq TO service_role, authenticated;
GRANT SELECT ON web_platform.admin_customer_directory TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION web_platform.is_customer_manager() TO authenticated, service_role;

-- 10. Append-Only Customer ID History & Password Activity Metadata Tables (`web_platform`)
CREATE TABLE IF NOT EXISTS web_platform.customer_id_history (
  id serial PRIMARY KEY,
  customer_db_id text NOT NULL DEFAULT '',
  auth_user_id uuid,
  email text NOT NULL DEFAULT '',
  previous_customer_id text,
  new_customer_id text NOT NULL,
  previous_account_status text NOT NULL DEFAULT '',
  new_account_status text NOT NULL DEFAULT '',
  operation_type text NOT NULL DEFAULT 'initial_registration',
  reason text NOT NULL DEFAULT '',
  changed_by text NOT NULL DEFAULT 'system',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS web_platform.customer_password_history (
  id serial PRIMARY KEY,
  customer_id text NOT NULL DEFAULT '',
  customer_db_id text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  auth_user_id uuid,
  action_type text NOT NULL CHECK (action_type IN ('registration', 'reset', 'change', 'recovery')),
  action_status text NOT NULL DEFAULT 'completed' CHECK (action_status IN ('requested', 'verified', 'completed', 'failed')),
  ip_address text NOT NULL DEFAULT '',
  user_agent text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON web_platform.customer_id_history TO service_role;
GRANT SELECT, INSERT ON web_platform.customer_password_history TO service_role;
GRANT USAGE, SELECT ON SEQUENCE web_platform.customer_id_history_id_seq TO service_role;
GRANT USAGE, SELECT ON SEQUENCE web_platform.customer_password_history_id_seq TO service_role;

COMMIT;
