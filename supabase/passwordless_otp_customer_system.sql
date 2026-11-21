-- ============================================================================
-- NexusTekFusion — Passwordless Email + OTP Automatic Customer Account System
-- ============================================================================
-- Transactional, idempotent migration.
-- Preserves all existing tables, customer data, invoices, orders, and
-- KRASHIVANTRI mobile schema (`public.users(id)` TEXT PK, `public.orders`).
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Ensure extended profile & billing columns on web_platform.users & web_platform.customers
DO $$
BEGIN
  IF to_regclass('web_platform.users') IS NOT NULL THEN
    ALTER TABLE web_platform.users
      ADD COLUMN IF NOT EXISTS profile_photo_url text NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS customer_type text NOT NULL DEFAULT 'Individual',
      ADD COLUMN IF NOT EXISTS billing_details jsonb NOT NULL DEFAULT '{}'::jsonb;
  END IF;

  IF to_regclass('web_platform.customers') IS NOT NULL THEN
    ALTER TABLE web_platform.customers
      ADD COLUMN IF NOT EXISTS profile_photo_url text NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS customer_type text NOT NULL DEFAULT 'Individual',
      ADD COLUMN IF NOT EXISTS billing_details jsonb NOT NULL DEFAULT '{}'::jsonb;
  END IF;

  IF to_regclass('public.customer_profiles') IS NOT NULL THEN
    ALTER TABLE public.customer_profiles
      ADD COLUMN IF NOT EXISTS profile_photo_url text NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS customer_type text NOT NULL DEFAULT 'Individual',
      ADD COLUMN IF NOT EXISTS billing_details jsonb NOT NULL DEFAULT '{}'::jsonb;
  END IF;
END $$;

-- 2. Ensure extended profile & billing columns + unified monotonic sequence
CREATE SEQUENCE IF NOT EXISTS public.customers_code_seq
  START WITH 1
  INCREMENT BY 1
  MINVALUE 1
  NO MAXVALUE
  CACHE 1;

CREATE SEQUENCE IF NOT EXISTS web_platform.customers_code_seq
  START WITH 1
  INCREMENT BY 1
  MINVALUE 1
  NO MAXVALUE
  CACHE 1;

DO $$
DECLARE
  v_max_num bigint := 0;
  v_tmp bigint := 0;
BEGIN
  IF to_regclass('public.customers') IS NOT NULL THEN
    ALTER TABLE public.customers
      ADD COLUMN IF NOT EXISTS profile_photo_url text NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS customer_type text NOT NULL DEFAULT 'Individual',
      ADD COLUMN IF NOT EXISTS billing_details jsonb NOT NULL DEFAULT '{}'::jsonb;

    SELECT COALESCE(MAX(NULLIF(regexp_replace(customer_id, '[^0-9]', '', 'g'), '')::bigint), 0)
    INTO v_tmp FROM public.customers WHERE customer_id ~ '^NTF-CUST-[0-9]+$';
    v_max_num := GREATEST(v_max_num, v_tmp);
  END IF;

  IF to_regclass('web_platform.customers') IS NOT NULL THEN
    SELECT COALESCE(MAX(NULLIF(regexp_replace(customer_id, '[^0-9]', '', 'g'), '')::bigint), 0)
    INTO v_tmp FROM web_platform.customers WHERE customer_id ~ '^NTF-CUST-[0-9]+$';
    v_max_num := GREATEST(v_max_num, v_tmp);
  END IF;

  IF to_regclass('web_platform.users') IS NOT NULL THEN
    SELECT COALESCE(MAX(NULLIF(regexp_replace(uid, '[^0-9]', '', 'g'), '')::bigint), 0)
    INTO v_tmp FROM web_platform.users WHERE uid ~ '^NTF-CUST-[0-9]+$';
    v_max_num := GREATEST(v_max_num, v_tmp);
  END IF;

  IF to_regclass('public.customer_id_history') IS NOT NULL THEN
    SELECT GREATEST(
      COALESCE(MAX(NULLIF(regexp_replace(previous_customer_id, '[^0-9]', '', 'g'), '')::bigint), 0),
      COALESCE(MAX(NULLIF(regexp_replace(new_customer_id, '[^0-9]', '', 'g'), '')::bigint), 0)
    )
    INTO v_tmp FROM public.customer_id_history
    WHERE previous_customer_id ~ '^NTF-CUST-[0-9]+$' OR new_customer_id ~ '^NTF-CUST-[0-9]+$';
    v_max_num := GREATEST(v_max_num, v_tmp);
  END IF;

  IF to_regclass('web_platform.customer_id_history') IS NOT NULL THEN
    SELECT GREATEST(
      COALESCE(MAX(NULLIF(regexp_replace(previous_customer_id, '[^0-9]', '', 'g'), '')::bigint), 0),
      COALESCE(MAX(NULLIF(regexp_replace(new_customer_id, '[^0-9]', '', 'g'), '')::bigint), 0)
    )
    INTO v_tmp FROM web_platform.customer_id_history
    WHERE previous_customer_id ~ '^NTF-CUST-[0-9]+$' OR new_customer_id ~ '^NTF-CUST-[0-9]+$';
    v_max_num := GREATEST(v_max_num, v_tmp);
  END IF;

  IF to_regclass('web_platform.customer_deletion_audit_logs') IS NOT NULL THEN
    SELECT COALESCE(MAX(NULLIF(regexp_replace(customer_code, '[^0-9]', '', 'g'), '')::bigint), 0)
    INTO v_tmp FROM web_platform.customer_deletion_audit_logs WHERE customer_code ~ '^NTF-CUST-[0-9]+$';
    v_max_num := GREATEST(v_max_num, v_tmp);
  END IF;

  IF v_max_num > 0 THEN
    PERFORM setval('public.customers_code_seq', v_max_num, true);
    PERFORM setval('web_platform.customers_code_seq', v_max_num, true);
  END IF;
END $$;

-- Monotonic concurrency-safe generator shared across public & web_platform
CREATE OR REPLACE FUNCTION public.generate_next_customer_id()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, web_platform
AS $$
DECLARE
  v_next bigint;
  v_pub bigint;
  v_web bigint;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('ntf_global_customer_code_seq'));
  v_pub := nextval('public.customers_code_seq');
  v_web := nextval('web_platform.customers_code_seq');
  v_next := GREATEST(v_pub, v_web);
  IF v_pub < v_next THEN
    PERFORM setval('public.customers_code_seq', v_next, true);
  END IF;
  IF v_web < v_next THEN
    PERFORM setval('web_platform.customers_code_seq', v_next, true);
  END IF;
  RETURN 'NTF-CUST-' || LPAD(v_next::text, 6, '0');
END;
$$;

-- 3. Safe Partial UNIQUE Constraints & Indexes on Active Customer Records
-- Enforces one active customer record per verified auth_user_id and email
-- while preserving soft-deleted records (`deleted_at IS NOT NULL`) and allowing
-- re-registration with a brand new NTF-CUST-XXXXXX ID after account deletion.
DO $$
DECLARE
  v_dup_email_count integer := 0;
  v_dup_auth_count integer := 0;
BEGIN
  IF to_regclass('public.customers') IS NOT NULL THEN
    SELECT COUNT(*) INTO v_dup_email_count
    FROM (
      SELECT LOWER(email) AS e
      FROM public.customers
      WHERE deleted_at IS NULL AND COALESCE(BTRIM(email), '') <> ''
      GROUP BY LOWER(email)
      HAVING COUNT(*) > 1
    ) t;

    IF v_dup_email_count = 0 THEN
      CREATE UNIQUE INDEX IF NOT EXISTS uq_public_customers_active_email
        ON public.customers (LOWER(email))
        WHERE deleted_at IS NULL AND email <> '';
    ELSE
      RAISE NOTICE 'Skipped uq_public_customers_active_email: % legacy duplicate active email(s) preserved.', v_dup_email_count;
    END IF;

    SELECT COUNT(*) INTO v_dup_auth_count
    FROM (
      SELECT auth_user_id
      FROM public.customers
      WHERE deleted_at IS NULL AND auth_user_id IS NOT NULL
      GROUP BY auth_user_id
      HAVING COUNT(*) > 1
    ) t;

    IF v_dup_auth_count = 0 THEN
      CREATE UNIQUE INDEX IF NOT EXISTS uq_public_customers_active_auth_user_id
        ON public.customers (auth_user_id)
        WHERE deleted_at IS NULL AND auth_user_id IS NOT NULL;
    ELSE
      RAISE NOTICE 'Skipped uq_public_customers_active_auth_user_id: % legacy duplicate active auth_user_id(s) preserved.', v_dup_auth_count;
    END IF;

    CREATE INDEX IF NOT EXISTS idx_public_customers_customer_type
      ON public.customers (customer_type);
  END IF;

  IF to_regclass('web_platform.customers') IS NOT NULL THEN
    SELECT COUNT(*) INTO v_dup_email_count
    FROM (
      SELECT LOWER(email) AS e
      FROM web_platform.customers
      WHERE deleted_at IS NULL AND COALESCE(BTRIM(email), '') <> ''
      GROUP BY LOWER(email)
      HAVING COUNT(*) > 1
    ) t;

    IF v_dup_email_count = 0 THEN
      CREATE UNIQUE INDEX IF NOT EXISTS uq_web_customers_active_email
        ON web_platform.customers (LOWER(email))
        WHERE deleted_at IS NULL AND email <> '';
    END IF;

    SELECT COUNT(*) INTO v_dup_auth_count
    FROM (
      SELECT auth_user_id
      FROM web_platform.customers
      WHERE deleted_at IS NULL AND auth_user_id IS NOT NULL
      GROUP BY auth_user_id
      HAVING COUNT(*) > 1
    ) t;

    IF v_dup_auth_count = 0 THEN
      CREATE UNIQUE INDEX IF NOT EXISTS uq_web_customers_active_auth_user_id
        ON web_platform.customers (auth_user_id)
        WHERE deleted_at IS NULL AND auth_user_id IS NOT NULL;
    END IF;
  END IF;
END $$;

-- 4. Immutability Guard on public.customers UPDATE for Authenticated Non-Admin Customers
-- Customers can never mutate their own customer_id, user_id, auth_user_id, web_user_id,
-- email, account_status, or registration_date via direct Supabase client updates.
CREATE OR REPLACE FUNCTION public.fn_public_customers_protect_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, web_platform, auth
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND current_user NOT IN ('postgres', 'service_role', 'supabase_admin') THEN
    IF NOT public.is_public_customer_admin() THEN
      NEW.customer_id := OLD.customer_id;
      NEW.user_id := OLD.user_id;
      NEW.auth_user_id := OLD.auth_user_id;
      NEW.user_uid := OLD.user_uid;
      NEW.web_user_id := OLD.web_user_id;
      NEW.email := OLD.email;
      NEW.account_status := OLD.account_status;
      NEW.status_reason := OLD.status_reason;
      NEW.email_verified := OLD.email_verified;
      NEW.email_confirmed_at := OLD.email_confirmed_at;
      NEW.registration_date := OLD.registration_date;
      NEW.deleted_at := OLD.deleted_at;
      NEW.deleted_reason := OLD.deleted_reason;
    END IF;
  END IF;

  NEW.customer_type := COALESCE(NULLIF(BTRIM(NEW.customer_type), ''), 'Individual');
  NEW.profile_photo_url := BTRIM(COALESCE(NEW.profile_photo_url, ''));
  IF NEW.billing_details IS NULL THEN
    NEW.billing_details := '{}'::jsonb;
  END IF;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.customers') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_z_public_customers_protect_identity ON public.customers;
    CREATE TRIGGER trg_z_public_customers_protect_identity
      BEFORE UPDATE ON public.customers
      FOR EACH ROW
      EXECUTE FUNCTION public.fn_public_customers_protect_identity();
  END IF;

  IF to_regclass('web_platform.customers') IS NOT NULL THEN
    CREATE OR REPLACE FUNCTION web_platform.fn_web_customers_protect_identity()
    RETURNS trigger
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public, web_platform, auth
    AS $fn$
    BEGIN
      IF TG_OP = 'UPDATE' AND current_user NOT IN ('postgres', 'service_role', 'supabase_admin') THEN
        IF NOT web_platform.is_customer_manager() THEN
          NEW.customer_id := OLD.customer_id;
          NEW.user_id := OLD.user_id;
          NEW.auth_user_id := OLD.auth_user_id;
          NEW.email := OLD.email;
          NEW.account_status := OLD.account_status;
          NEW.status_reason := OLD.status_reason;
          NEW.email_verified := OLD.email_verified;
          NEW.registration_date := OLD.registration_date;
          NEW.deleted_at := OLD.deleted_at;
        END IF;
      END IF;
      RETURN NEW;
    END;
    $fn$;

    DROP TRIGGER IF EXISTS trg_z_web_customers_protect_identity ON web_platform.customers;
    CREATE TRIGGER trg_z_web_customers_protect_identity
      BEFORE UPDATE ON web_platform.customers
      FOR EACH ROW
      EXECUTE FUNCTION web_platform.fn_web_customers_protect_identity();
  END IF;
END $$;

-- 5. Concurrency-Safe Passwordless OTP UPSERT Function in PostgreSQL
-- Uses pg_advisory_xact_lock so simultaneous logins/registrations for the same
-- email or auth_user_id cannot create duplicate customer rows or duplicate IDs.
CREATE OR REPLACE FUNCTION public.upsert_customer_from_otp(
  p_auth_user_id uuid,
  p_email text,
  p_full_name text DEFAULT NULL,
  p_phone_number text DEFAULT NULL,
  p_profile_photo_url text DEFAULT NULL,
  p_email_confirmed_at timestamptz DEFAULT now()
)
RETURNS TABLE (
  id uuid,
  customer_id text,
  auth_user_id uuid,
  email text,
  full_name text,
  phone_number text,
  profile_photo_url text,
  customer_type text,
  billing_details jsonb,
  account_status text,
  email_verified boolean,
  registration_date timestamptz,
  last_login_at timestamptz,
  is_new_customer boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, web_platform, auth
AS $$
DECLARE
  v_clean_email text := LOWER(BTRIM(COALESCE(p_email, '')));
  v_clean_name text := BTRIM(COALESCE(p_full_name, ''));
  v_clean_phone text := REGEXP_REPLACE(BTRIM(COALESCE(p_phone_number, '')), '^(\+91|91)(?=[6-9][0-9]{9}$)', '');
  v_clean_photo text := BTRIM(COALESCE(p_profile_photo_url, ''));
  v_existing public.customers%ROWTYPE;
  v_new public.customers%ROWTYPE;
  v_next_code text;
BEGIN
  IF v_clean_email = '' THEN
    RAISE EXCEPTION 'Verified email address is required for customer OTP authentication.';
  END IF;

  -- Serialize concurrent provisioning attempts for the same email
  PERFORM pg_advisory_xact_lock(hashtext('ntf_cust_otp:' || v_clean_email));
  IF p_auth_user_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('ntf_cust_uid:' || p_auth_user_id::text));
  END IF;

  -- 1. Primary lookup by authenticated Supabase auth_user_id (non-deleted)
  IF p_auth_user_id IS NOT NULL THEN
    SELECT *
    INTO v_existing
    FROM public.customers c
    WHERE c.auth_user_id = p_auth_user_id
      AND c.deleted_at IS NULL
    ORDER BY (c.account_status = 'Active') DESC, c.registration_date ASC
    LIMIT 1
    FOR UPDATE;
  END IF;

  -- 2. Fallback lookup by normalized email (non-deleted)
  IF v_existing.id IS NULL THEN
    SELECT *
    INTO v_existing
    FROM public.customers c
    WHERE LOWER(c.email) = v_clean_email
      AND c.deleted_at IS NULL
    ORDER BY (c.account_status = 'Active') DESC, c.registration_date ASC
    LIMIT 1
    FOR UPDATE;
  END IF;

  IF v_existing.id IS NOT NULL THEN
    IF v_existing.account_status <> 'Active' THEN
      RAISE EXCEPTION 'Customer account % is currently %', v_existing.customer_id, v_existing.account_status;
    END IF;

    UPDATE public.customers c
    SET
      auth_user_id = COALESCE(c.auth_user_id, p_auth_user_id),
      email_verified = true,
      email_confirmed_at = COALESCE(c.email_confirmed_at, p_email_confirmed_at, now()),
      full_name = CASE WHEN BTRIM(c.full_name) = '' AND v_clean_name <> '' THEN v_clean_name ELSE c.full_name END,
      phone_number = CASE WHEN BTRIM(c.phone_number) = '' AND v_clean_phone <> '' THEN v_clean_phone ELSE c.phone_number END,
      profile_photo_url = CASE WHEN BTRIM(c.profile_photo_url) = '' AND v_clean_photo <> '' THEN v_clean_photo ELSE c.profile_photo_url END,
      last_login_at = now(),
      updated_at = now()
    WHERE c.id = v_existing.id
    RETURNING * INTO v_new;

    RETURN QUERY SELECT
      v_new.id,
      v_new.customer_id,
      v_new.auth_user_id,
      v_new.email,
      v_new.full_name,
      v_new.phone_number,
      v_new.profile_photo_url,
      v_new.customer_type,
      v_new.billing_details,
      v_new.account_status,
      v_new.email_verified,
      v_new.registration_date,
      v_new.last_login_at,
      false;
    RETURN;
  END IF;

  -- 3. New active customer (or re-registering after previous deletion):
  -- Always advance monotonic sequence; deleted IDs are never reused.
  v_next_code := public.generate_next_customer_id();
  IF v_clean_name = '' THEN
    v_clean_name := split_part(v_clean_email, '@', 1);
  END IF;

  INSERT INTO public.customers (
    customer_id,
    auth_user_id,
    user_uid,
    full_name,
    email,
    phone_number,
    mobile,
    profile_photo_url,
    customer_type,
    billing_details,
    account_status,
    email_verified,
    email_confirmed_at,
    registration_date,
    last_login_at,
    created_at,
    updated_at
  )
  VALUES (
    v_next_code,
    p_auth_user_id,
    v_next_code,
    v_clean_name,
    v_clean_email,
    v_clean_phone,
    v_clean_phone,
    v_clean_photo,
    'Individual',
    '{}'::jsonb,
    'Active',
    true,
    COALESCE(p_email_confirmed_at, now()),
    now(),
    now(),
    now(),
    now()
  )
  RETURNING * INTO v_new;

  RETURN QUERY SELECT
    v_new.id,
    v_new.customer_id,
    v_new.auth_user_id,
    v_new.email,
    v_new.full_name,
    v_new.phone_number,
    v_new.profile_photo_url,
    v_new.customer_type,
    v_new.billing_details,
    v_new.account_status,
    v_new.email_verified,
    v_new.registration_date,
    v_new.last_login_at,
    true;
END;
$$;

-- 6. Compatibility Views for Logical Table Names (`public.cart_items`, `public.wishlist_items`)
-- Preserves `public.orders` (KRASHIVANTRI mobile) while exposing all canonical portal views.
DO $$
BEGIN
  IF to_regclass('public.customer_cart_items') IS NOT NULL AND to_regclass('public.cart_items') IS NULL THEN
    EXECUTE 'CREATE OR REPLACE VIEW public.cart_items AS SELECT * FROM public.customer_cart_items;';
  END IF;

  IF to_regclass('public.wishlists') IS NOT NULL AND to_regclass('public.wishlist_items') IS NULL THEN
    EXECUTE 'CREATE OR REPLACE VIEW public.wishlist_items AS SELECT * FROM public.wishlists;';
  END IF;

  IF to_regclass('public.product_reviews') IS NOT NULL AND to_regclass('public.customer_reviews') IS NULL THEN
    EXECUTE 'CREATE OR REPLACE VIEW public.customer_reviews AS SELECT * FROM public.product_reviews;';
  END IF;

  IF to_regclass('public.store_orders') IS NOT NULL AND to_regclass('public.customer_orders') IS NULL THEN
    EXECUTE 'CREATE OR REPLACE VIEW public.customer_orders AS SELECT * FROM public.store_orders;';
  END IF;
END $$;

-- 7. Ensure Strict Self-Only & Admin RLS on Remaining Public Customer Tables & Indexes
DO $$
BEGIN
  IF to_regclass('public.customer_addresses') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_pub_customer_addresses_uid ON public.customer_addresses(user_uid);
  END IF;
  IF to_regclass('public.store_orders') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_pub_store_orders_customer_id ON public.store_orders(customer_id);
    ALTER TABLE public.store_orders ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Customer read own store orders" ON public.store_orders;
    CREATE POLICY "Customer read own store orders"
      ON public.store_orders FOR SELECT
      TO authenticated
      USING (auth.uid()::text = user_uid OR lower(customer_email) = lower(coalesce(auth.jwt() ->> 'email', '')) OR public.is_ntf_admin());
  END IF;
  IF to_regclass('public.customer_carts') IS NOT NULL THEN
    ALTER TABLE public.customer_carts ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Customer manage own cart" ON public.customer_carts;
    CREATE POLICY "Customer manage own cart"
      ON public.customer_carts FOR ALL
      TO authenticated
      USING (auth.uid()::text = user_uid OR public.is_ntf_admin())
      WITH CHECK (auth.uid()::text = user_uid OR public.is_ntf_admin());
  END IF;
  IF to_regclass('public.invoices') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_pub_invoices_customer_id ON public.invoices(customer_id);
  END IF;
  IF to_regclass('public.customer_enquiries') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_pub_customer_enquiries_customer_id ON public.customer_enquiries(customer_id);
  END IF;
  IF to_regclass('public.customer_projects') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_pub_customer_projects_customer_id ON public.customer_projects(customer_id);
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION public.generate_next_customer_id() TO service_role;

COMMIT;
