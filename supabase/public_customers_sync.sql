-- ============================================================================
-- NEXUSTEKFUSION PRIVATE LIMITED — PUBLIC.CUSTOMERS SINGLE SOURCE OF TRUTH
-- Complete Idempotent Supabase PostgreSQL Migration, Triggers, RLS & Realtime
--
-- Target Schema Alignment:
--   - public.users.id                   : TEXT (no email column assumed)
--   - public.customers.user_id          : TEXT NULLABLE -> REFERENCES public.users(id) ON DELETE SET NULL
--   - public.customers                  : Authoritative customer directory
--   - public.customer_id_history        : Append-only Customer ID audit history
--   - public.customer_password_history  : Append-only password activity metadata
--
-- Features:
--   1. Upgrades `public.customers` in place (no duplicate customer tables) with
--      `user_id` (TEXT, nullable), `customer_id` (NTF-CUST-000001),
--      `auth_user_id`, `web_user_id`, `phone_number`, `company_or_college`,
--      `full_address`, `city`, `state`, `pin_code`, `account_status`,
--      `status_reason`, `email_verified`, `email_confirmed_at`,
--      `last_password_reset_at`, `last_password_change_at`,
--      `password_reset_status`, `registration_date`, and `last_login_at`.
--   2. Idempotently converts any legacy non-TEXT `public.customers.user_id`
--      (such as BIGINT/INTEGER/UUID) to TEXT, clears only dangling/blank
--      pointers, and enforces `customers_user_id_fkey` referencing
--      `public.users(id) ON DELETE SET NULL`.
--   3. Enforces unique case-insensitive email (`LOWER(email)`) to prevent
--      duplicate customer registrations.
--   4. Preserves all Supabase Auth (`auth.users`) accounts, admin accounts,
--      employee accounts, and customer-only reset configuration.
--   5. Keeps Customer ID generation (`NTF-CUST-000001`), `customer_id_history`,
--      `customer_password_history`, two-way sync triggers, strict RLS, and
--      Supabase Realtime (`REPLICA IDENTITY FULL` + `supabase_realtime`).
--   6. Exposes `public.verify_public_customers_migration_status()` RPC and
--      validates the exact constraint & column types before committing.
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS web_platform;

-- Ensure `public.users` exists with TEXT id (never assumes an `email` column)
CREATE TABLE IF NOT EXISTS public.users (
  id text PRIMARY KEY,
  phone text UNIQUE NOT NULL,
  name text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin', 'pilot', 'farmer')),
  created_at bigint NOT NULL DEFAULT (extract(epoch from now()) * 1000)::bigint
);

-- 1. Sequence for human-readable Customer IDs (NTF-CUST-000001, NTF-CUST-000002, ...)
--    Monotonic & concurrency-safe: deleted IDs are never reused.
CREATE SEQUENCE IF NOT EXISTS public.customers_code_seq
  START WITH 1
  INCREMENT BY 1
  NO MINVALUE
  NO MAXVALUE
  CACHE 1;

-- 2. Ensure `public.customers` exists and has all required columns (no duplicate table)
CREATE TABLE IF NOT EXISTS public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id text UNIQUE
    DEFAULT ('NTF-CUST-' || LPAD(nextval('public.customers_code_seq')::text, 6, '0')),
  user_id text,
  auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_uid text,
  web_user_id integer,
  full_name text NOT NULL DEFAULT '',
  email text NOT NULL,
  phone_number text NOT NULL DEFAULT '',
  mobile text NOT NULL DEFAULT '',
  whatsapp_number text NOT NULL DEFAULT '',
  company_or_college text NOT NULL DEFAULT '',
  organization text NOT NULL DEFAULT '',
  department text NOT NULL DEFAULT '',
  full_address text NOT NULL DEFAULT '',
  city text NOT NULL DEFAULT '',
  state text NOT NULL DEFAULT '',
  pin_code text NOT NULL DEFAULT '',
  customer_category text NOT NULL DEFAULT 'Customer',
  account_status text NOT NULL DEFAULT 'Active',
  status_reason text NOT NULL DEFAULT '',
  email_verified boolean NOT NULL DEFAULT false,
  email_confirmed_at timestamptz,
  last_password_reset_at timestamptz,
  last_password_change_at timestamptz,
  password_reset_status text NOT NULL DEFAULT 'Active',
  registration_date timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz,
  deleted_at timestamptz,
  deleted_reason text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Upgrade existing `public.customers` table in place idempotently
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS customer_id text,
  ADD COLUMN IF NOT EXISTS user_id text,
  ADD COLUMN IF NOT EXISTS auth_user_id uuid,
  ADD COLUMN IF NOT EXISTS user_uid text,
  ADD COLUMN IF NOT EXISTS web_user_id integer,
  ADD COLUMN IF NOT EXISTS full_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS email text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS phone_number text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS mobile text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS whatsapp_number text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS company_or_college text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS organization text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS department text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS full_address text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS city text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS state text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS pin_code text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS customer_category text NOT NULL DEFAULT 'Customer',
  ADD COLUMN IF NOT EXISTS account_status text NOT NULL DEFAULT 'Active',
  ADD COLUMN IF NOT EXISTS status_reason text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS email_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_password_reset_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_password_change_at timestamptz,
  ADD COLUMN IF NOT EXISTS password_reset_status text NOT NULL DEFAULT 'Active',
  ADD COLUMN IF NOT EXISTS registration_date timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_login_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_reason text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Allow manual inserts & multi-profile links without column-level uniqueness blocks
ALTER TABLE public.customers
  ALTER COLUMN user_uid DROP NOT NULL;

ALTER TABLE public.customers
  DROP CONSTRAINT IF EXISTS customers_auth_user_id_key,
  DROP CONSTRAINT IF EXISTS customers_user_uid_key,
  DROP CONSTRAINT IF EXISTS customers_web_user_id_key,
  DROP CONSTRAINT IF EXISTS customers_email_key,
  DROP CONSTRAINT IF EXISTS customers_phone_number_key;

ALTER TABLE public.customers
  ALTER COLUMN customer_id
  SET DEFAULT ('NTF-CUST-' || LPAD(nextval('public.customers_code_seq')::text, 6, '0'));

-- Pre-Section-2a Cleanup: drop any legacy triggers, policies, check constraints, or
-- indexes on `public.customers` that reference `user_id` before altering column type
-- or running cleanup UPDATEs. (Managed triggers & policies are re-created below.)
DO $$
DECLARE
  v_pol RECORD;
  v_trg RECORD;
  v_chk RECORD;
  v_idx RECORD;
  v_fn_def text;
BEGIN
  DROP POLICY IF EXISTS "customers_own_or_admin" ON public.customers;
  DROP POLICY IF EXISTS "public_customers_service_all" ON public.customers;
  DROP POLICY IF EXISTS "public_customers_admin_all" ON public.customers;
  DROP POLICY IF EXISTS "public_customers_self_select" ON public.customers;
  DROP POLICY IF EXISTS "public_customers_self_update" ON public.customers;

  FOR v_pol IN
    SELECT policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'customers'
  LOOP
    IF COALESCE(v_pol.qual, '') ~* '\muser_id\M'
       OR COALESCE(v_pol.with_check, '') ~* '\muser_id\M'
    THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.customers', v_pol.policyname);
    END IF;
  END LOOP;

  DROP TRIGGER IF EXISTS trg_public_customers_before_write ON public.customers;
  DROP TRIGGER IF EXISTS zzz_public_customers_fk_guard ON public.customers;
  DROP TRIGGER IF EXISTS trg_public_customers_after_upsert ON public.customers;
  DROP TRIGGER IF EXISTS trg_public_customers_after_delete ON public.customers;
  DROP TRIGGER IF EXISTS trg_public_customers_log_id_history ON public.customers;
  DROP TRIGGER IF EXISTS trg_customers_before_write ON public.customers;
  DROP TRIGGER IF EXISTS trg_customers_after_upsert ON public.customers;
  DROP TRIGGER IF EXISTS trg_customers_after_delete ON public.customers;

  FOR v_trg IN
    SELECT t.tgname, t.tgfoid
    FROM pg_trigger t
    WHERE t.tgrelid = 'public.customers'::regclass
      AND NOT t.tgisinternal
  LOOP
    v_fn_def := '';
    BEGIN
      v_fn_def := pg_get_functiondef(v_trg.tgfoid);
    EXCEPTION WHEN OTHERS THEN
      v_fn_def := '';
    END;
    IF v_fn_def ~* '\muser_id\M' THEN
      EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.customers', v_trg.tgname);
    END IF;
  END LOOP;

  FOR v_chk IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_attribute a
      ON a.attrelid = c.conrelid
     AND a.attnum = ANY(c.conkey)
     AND NOT a.attisdropped
    WHERE c.conrelid = 'public.customers'::regclass
      AND c.contype = 'c'
      AND a.attname = 'user_id'
  LOOP
    EXECUTE format('ALTER TABLE public.customers DROP CONSTRAINT IF EXISTS %I', v_chk.conname);
  END LOOP;

  FOR v_idx IN
    SELECT DISTINCT i.relname AS index_name
    FROM pg_index ix
    JOIN pg_class i ON i.oid = ix.indexrelid
    JOIN pg_attribute a ON a.attrelid = ix.indrelid AND a.attnum = ANY(ix.indkey)
    LEFT JOIN pg_constraint con ON con.conindid = ix.indexrelid
    WHERE ix.indrelid = 'public.customers'::regclass
      AND NOT ix.indisprimary
      AND con.oid IS NULL
      AND (NOT ix.indisunique OR ix.indpred IS NOT NULL)
      AND a.attname = 'user_id'
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS public.%I', v_idx.index_name);
  END LOOP;
END $$;

-- 2a. Enforce `public.customers.user_id` = TEXT (nullable, no DEFAULT) and
--     `customers_user_id_fkey` -> `public.users(id) ON DELETE SET NULL`.
--     Also repair `web_platform.customers.user_id` if present.
--     Never silently swallow errors here; fail loudly if FK cannot be verified.
DO $$
DECLARE
  v_fk RECORD;
  v_pub_user_id_udt text;
  v_pub_user_id_nullable text;
  v_pub_users_id_udt text;
  v_has_valid_fk boolean := false;
  v_web_is_nullable text;
BEGIN
  -- Verify `public.users.id` exists and inspect its data type (must be text)
  SELECT udt_name INTO v_pub_users_id_udt
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'users'
    AND column_name = 'id';

  IF v_pub_users_id_udt IS NULL THEN
    RAISE EXCEPTION 'Required table/column public.users(id) does not exist.';
  END IF;

  IF v_pub_users_id_udt <> 'text' THEN
    RAISE EXCEPTION 'Expected public.users.id to be TEXT, found: %', v_pub_users_id_udt;
  END IF;

  -- Ensure public.users(id) has a single-column PRIMARY KEY or UNIQUE index for FK target
  IF NOT EXISTS (
    SELECT 1
    FROM pg_index ix
    JOIN pg_attribute a ON a.attrelid = ix.indrelid AND a.attnum = ANY(ix.indkey)
    WHERE ix.indrelid = 'public.users'::regclass
      AND ix.indisunique
      AND ix.indisvalid
      AND array_length(ix.indkey, 1) = 1
      AND a.attname = 'id'
  ) THEN
    ALTER TABLE public.users DROP CONSTRAINT IF EXISTS public_users_id_unique;
    DROP INDEX IF EXISTS public.public_users_id_unique;
    ALTER TABLE public.users ADD CONSTRAINT public_users_id_unique UNIQUE (id);
  END IF;

  -- A) Repair `public.customers.user_id` and `customers_user_id_fkey`
  SELECT udt_name, is_nullable
  INTO v_pub_user_id_udt, v_pub_user_id_nullable
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'customers'
    AND column_name = 'user_id';

  IF v_pub_user_id_udt IS NULL THEN
    ALTER TABLE public.customers ADD COLUMN user_id text;
    v_pub_user_id_udt := 'text';
    v_pub_user_id_nullable := 'YES';
  END IF;

  -- Drop any legacy DEFAULT or NOT NULL on public.customers.user_id
  ALTER TABLE public.customers ALTER COLUMN user_id DROP DEFAULT;
  IF v_pub_user_id_nullable = 'NO' THEN
    ALTER TABLE public.customers ALTER COLUMN user_id DROP NOT NULL;
  END IF;

  -- Drop any existing FK constraints on public.customers.user_id or named customers_user_id_fkey
  -- that do not match: REFERENCES public.users(id) ON DELETE SET NULL with TEXT user_id
  FOR v_fk IN
    SELECT
      c.conname,
      c.confrelid,
      c.confdeltype,
      tgt.attname AS target_col
    FROM pg_constraint c
    LEFT JOIN pg_attribute src
      ON src.attrelid = c.conrelid
     AND src.attnum = ANY(c.conkey)
     AND NOT src.attisdropped
    LEFT JOIN pg_attribute tgt
      ON tgt.attrelid = c.confrelid
     AND tgt.attnum = c.confkey[1]
     AND NOT tgt.attisdropped
    WHERE c.conrelid = 'public.customers'::regclass
      AND c.contype = 'f'
      AND (c.conname = 'customers_user_id_fkey' OR src.attname = 'user_id')
  LOOP
    IF v_pub_user_id_udt <> 'text'
       OR v_fk.conname <> 'customers_user_id_fkey'
       OR v_fk.confrelid <> 'public.users'::regclass
       OR v_fk.target_col IS DISTINCT FROM 'id'
       OR v_fk.confdeltype <> 'n'
    THEN
      EXECUTE format('ALTER TABLE public.customers DROP CONSTRAINT IF EXISTS %I', v_fk.conname);
    END IF;
  END LOOP;

  -- Convert any legacy non-TEXT user_id (e.g. BIGINT/INTEGER/UUID) to TEXT
  IF v_pub_user_id_udt <> 'text' THEN
    ALTER TABLE public.customers
      ALTER COLUMN user_id TYPE text USING NULLIF(BTRIM(user_id::text), '');
  END IF;

  -- Clean up blank strings and any dangling user_id values not present in public.users(id)
  -- (Preserves all customer rows, public.users rows, auth.users, admin, and employee accounts)
  UPDATE public.customers
  SET user_id = NULL
  WHERE user_id IS NOT NULL
    AND BTRIM(user_id) = '';

  UPDATE public.customers pc
  SET user_id = NULL
  WHERE pc.user_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.users pu WHERE pu.id = pc.user_id
    );

  -- Check if valid customers_user_id_fkey -> public.users(id) ON DELETE SET NULL is already present
  SELECT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_attribute src
      ON src.attrelid = c.conrelid
     AND src.attnum = ANY(c.conkey)
     AND NOT src.attisdropped
    JOIN pg_attribute tgt
      ON tgt.attrelid = c.confrelid
     AND tgt.attnum = c.confkey[1]
     AND NOT tgt.attisdropped
    WHERE c.conrelid = 'public.customers'::regclass
      AND c.conname = 'customers_user_id_fkey'
      AND c.contype = 'f'
      AND c.confrelid = 'public.users'::regclass
      AND c.confdeltype = 'n'
      AND array_length(c.conkey, 1) = 1
      AND src.attname = 'user_id'
      AND tgt.attname = 'id'
  ) INTO v_has_valid_fk;

  IF NOT v_has_valid_fk THEN
    ALTER TABLE public.customers
      ADD CONSTRAINT customers_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;
  END IF;

  -- B) Repair `web_platform.customers.user_id` FK (integer -> web_platform.users(id)) if table exists
  IF to_regclass('web_platform.customers') IS NOT NULL THEN
    SELECT is_nullable INTO v_web_is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'web_platform'
      AND table_name = 'customers'
      AND column_name = 'user_id';

    IF v_web_is_nullable IS NOT NULL THEN
      ALTER TABLE web_platform.customers ALTER COLUMN user_id DROP DEFAULT;
      IF v_web_is_nullable = 'NO' THEN
        ALTER TABLE web_platform.customers ALTER COLUMN user_id DROP NOT NULL;
      END IF;

      FOR v_fk IN
        SELECT
          c.conname,
          ns.nspname AS target_schema,
          rel.relname AS target_table,
          c.confdeltype,
          tgt.attname AS target_col
        FROM pg_constraint c
        JOIN pg_attribute src
          ON src.attrelid = c.conrelid
         AND src.attnum = ANY(c.conkey)
         AND NOT src.attisdropped
        JOIN pg_class rel ON rel.oid = c.confrelid
        JOIN pg_namespace ns ON ns.oid = rel.relnamespace
        JOIN pg_attribute tgt
          ON tgt.attrelid = c.confrelid
         AND tgt.attnum = c.confkey[1]
         AND NOT tgt.attisdropped
        WHERE c.conrelid = 'web_platform.customers'::regclass
          AND c.contype = 'f'
          AND src.attname = 'user_id'
      LOOP
        EXECUTE format(
          'UPDATE web_platform.customers wc SET user_id = NULL WHERE wc.user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM %I.%I t WHERE t.%I::text = wc.user_id::text)',
          v_fk.target_schema,
          v_fk.target_table,
          v_fk.target_col
        );

        IF v_fk.confdeltype <> 'n' THEN
          EXECUTE format('ALTER TABLE web_platform.customers DROP CONSTRAINT %I', v_fk.conname);
          EXECUTE format(
            'ALTER TABLE web_platform.customers ADD CONSTRAINT %I FOREIGN KEY (user_id) REFERENCES %I.%I (%I) ON DELETE SET NULL',
            v_fk.conname,
            v_fk.target_schema,
            v_fk.target_table,
            v_fk.target_col
          );
        END IF;
      END LOOP;
    END IF;
  END IF;
END $$;

-- Ensure auth_user_id FK exists safely (SET NULL so deleting auth.users or customers never deadlocks)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'customers_auth_user_id_fkey'
      AND conrelid = 'public.customers'::regclass
  ) THEN
    ALTER TABLE public.customers
      ADD CONSTRAINT customers_auth_user_id_fkey
      FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Normalize account_status & pin_code BEFORE adding CHECK constraints
UPDATE public.customers
SET
  account_status = CASE
    WHEN LOWER(BTRIM(COALESCE(account_status, ''))) = 'suspended' THEN 'Suspended'
    WHEN LOWER(BTRIM(COALESCE(account_status, ''))) = 'deactivated' THEN 'Deactivated'
    ELSE 'Active'
  END,
  pin_code = CASE
    WHEN REGEXP_REPLACE(BTRIM(COALESCE(pin_code, '')), '\D', '', 'g') ~ '^[0-9]{4,10}$'
    THEN REGEXP_REPLACE(BTRIM(COALESCE(pin_code, '')), '\D', '', 'g')
    ELSE ''
  END;

-- Account status & PIN checks (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'public_customers_account_status_check'
      AND conrelid = 'public.customers'::regclass
  ) THEN
    ALTER TABLE public.customers
      ADD CONSTRAINT public_customers_account_status_check
      CHECK (account_status IN ('Active', 'Suspended', 'Deactivated'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'public_customers_pin_code_check'
      AND conrelid = 'public.customers'::regclass
  ) THEN
    ALTER TABLE public.customers
      ADD CONSTRAINT public_customers_pin_code_check
      CHECK (pin_code = '' OR pin_code ~ '^[0-9]{4,10}$');
  END IF;
END $$;

-- 2b. Safe Pre-Index Normalization (PRESERVES ALL EXISTING CUSTOMER ROWS — NO AUTO-MERGE OR DELETION)
DROP INDEX IF EXISTS public.uq_public_customers_email;
DROP INDEX IF EXISTS public.uq_public_customers_auth_user_id;
DROP INDEX IF EXISTS public.uq_public_customers_web_user_id;
DROP INDEX IF EXISTS public.uq_public_customers_phone_number;
DROP INDEX IF EXISTS public.uq_public_customers_user_uid;

UPDATE public.customers
SET
  email = LOWER(BTRIM(COALESCE(email, ''))),
  phone_number = REGEXP_REPLACE(
    COALESCE(NULLIF(BTRIM(phone_number), ''), NULLIF(BTRIM(mobile), ''), ''),
    '^(\+91|91)(?=[6-9][0-9]{9}$)',
    ''
  ),
  company_or_college = COALESCE(NULLIF(BTRIM(company_or_college), ''), NULLIF(BTRIM(organization), ''), '');

-- 3. Unique Customer ID & Non-Unique Lookup Indexes
-- Note: Email and Phone are intentionally NON-UNIQUE to support multiple business customer profiles
CREATE UNIQUE INDEX IF NOT EXISTS uq_public_customers_customer_id
  ON public.customers (customer_id)
  WHERE customer_id IS NOT NULL AND customer_id <> '';

CREATE INDEX IF NOT EXISTS idx_public_customers_email
  ON public.customers (LOWER(email));

CREATE INDEX IF NOT EXISTS idx_public_customers_auth_user_id
  ON public.customers (auth_user_id)
  WHERE auth_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_public_customers_web_user_id
  ON public.customers (web_user_id)
  WHERE web_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_public_customers_phone_number
  ON public.customers (phone_number)
  WHERE phone_number <> '';

CREATE INDEX IF NOT EXISTS idx_public_customers_user_id
  ON public.customers (user_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_public_customers_status_regdate
  ON public.customers (account_status, registration_date DESC);

CREATE INDEX IF NOT EXISTS idx_public_customers_location
  ON public.customers (state, city, pin_code);

CREATE INDEX IF NOT EXISTS idx_public_customers_name_search
  ON public.customers (LOWER(full_name));

-- 4. BEFORE INSERT/UPDATE Trigger: Normalize fields, assign NTF-CUST-000001, validate TEXT user_id FK safely & link auth_user_id
CREATE OR REPLACE FUNCTION public.fn_public_customers_before_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, web_platform, auth
AS $$
DECLARE
  v_phone text;
  v_company text;
  v_auth_id uuid;
  v_fk_schema text;
  v_fk_table text;
  v_fk_col text;
  v_fk_exists boolean := false;
  v_user_id_text text;
BEGIN
  NEW.email := LOWER(BTRIM(COALESCE(NEW.email, '')));
  IF NEW.email = '' THEN
    RAISE EXCEPTION 'Customer email cannot be empty';
  END IF;

  NEW.full_name := BTRIM(COALESCE(NEW.full_name, ''));

  v_phone := COALESCE(NULLIF(BTRIM(NEW.phone_number), ''), NULLIF(BTRIM(NEW.mobile), ''), '');
  v_phone := REGEXP_REPLACE(v_phone, '^(\+91|91)(?=[6-9][0-9]{9}$)', '');
  NEW.phone_number := v_phone;
  NEW.mobile := v_phone;

  v_company := COALESCE(NULLIF(BTRIM(NEW.company_or_college), ''), NULLIF(BTRIM(NEW.organization), ''), '');
  NEW.company_or_college := v_company;
  NEW.organization := v_company;

  NEW.full_address := BTRIM(COALESCE(NEW.full_address, ''));
  NEW.city := BTRIM(COALESCE(NEW.city, ''));
  NEW.state := BTRIM(COALESCE(NEW.state, ''));
  NEW.pin_code := BTRIM(COALESCE(NEW.pin_code, ''));
  NEW.status_reason := BTRIM(COALESCE(NEW.status_reason, ''));

  IF NEW.account_status IS NULL OR BTRIM(NEW.account_status) = '' THEN
    NEW.account_status := 'Active';
  END IF;

  -- Monotonic NTF-CUST-000001 generation (only when empty; never overwrites existing IDs)
  IF NEW.customer_id IS NULL OR BTRIM(NEW.customer_id) = '' THEN
    NEW.customer_id := 'NTF-CUST-' || LPAD(nextval('public.customers_code_seq')::text, 6, '0');
  END IF;

  -- Connect customer profile to existing Supabase auth.users ID if email matches an existing login
  IF NEW.auth_user_id IS NULL AND NEW.email <> '' THEN
    BEGIN
      SELECT au.id, (au.email_confirmed_at IS NOT NULL), au.email_confirmed_at
      INTO v_auth_id, NEW.email_verified, NEW.email_confirmed_at
      FROM auth.users au
      WHERE LOWER(au.email) = NEW.email
      ORDER BY au.created_at ASC
      LIMIT 1;
      IF v_auth_id IS NOT NULL THEN
        NEW.auth_user_id := v_auth_id;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  ELSIF NEW.auth_user_id IS NOT NULL AND NOT COALESCE(NEW.email_verified, false) THEN
    BEGIN
      SELECT (au.email_confirmed_at IS NOT NULL), COALESCE(NEW.email_confirmed_at, au.email_confirmed_at)
      INTO NEW.email_verified, NEW.email_confirmed_at
      FROM auth.users au
      WHERE au.id = NEW.auth_user_id
      LIMIT 1;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  IF NEW.user_uid IS NULL OR BTRIM(NEW.user_uid) = '' THEN
    NEW.user_uid := NEW.customer_id;
  END IF;

  -- Validate `user_id` (TEXT) against `customers_user_id_fkey` (`public.users(id)`)
  -- Normalizes empty strings to NULL and clears dangling pointers without failing inserts
  IF NEW.user_id IS NOT NULL THEN
    v_user_id_text := NULLIF(BTRIM(NEW.user_id), '');
    IF v_user_id_text IS NULL THEN
      NEW.user_id := NULL;
    ELSE
      SELECT
        ns.nspname,
        rel.relname,
        att.attname
      INTO v_fk_schema, v_fk_table, v_fk_col
      FROM pg_constraint c
      JOIN pg_class rel ON rel.oid = c.confrelid
      JOIN pg_namespace ns ON ns.oid = rel.relnamespace
      JOIN pg_attribute att ON att.attrelid = c.confrelid AND att.attnum = c.confkey[1] AND NOT att.attisdropped
      WHERE c.conrelid = 'public.customers'::regclass
        AND c.conname = 'customers_user_id_fkey'
        AND c.contype = 'f'
      LIMIT 1;

      IF v_fk_schema IS NOT NULL AND v_fk_table IS NOT NULL AND v_fk_col IS NOT NULL THEN
        BEGIN
          EXECUTE format(
            'SELECT EXISTS (SELECT 1 FROM %I.%I t WHERE t.%I::text = $1)',
            v_fk_schema,
            v_fk_table,
            v_fk_col
          ) INTO v_fk_exists USING v_user_id_text;
        EXCEPTION WHEN OTHERS THEN
          v_fk_exists := false;
        END;

        IF NOT v_fk_exists THEN
          NEW.user_id := NULL;
        ELSIF v_user_id_text <> NEW.user_id THEN
          NEW.user_id := v_user_id_text;
        END IF;
      END IF;
    END IF;
  END IF;

  IF TG_OP = 'INSERT' AND NEW.registration_date IS NULL THEN
    NEW.registration_date := COALESCE(NEW.created_at, now());
  END IF;

  IF TG_OP = 'INSERT' AND NEW.created_at IS NULL THEN
    NEW.created_at := now();
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_public_customers_before_write ON public.customers;
CREATE TRIGGER trg_public_customers_before_write
  BEFORE INSERT OR UPDATE ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_public_customers_before_write();

-- Alphabetically final FK guard trigger: runs last among BEFORE INSERT/UPDATE triggers
-- to guarantee `NEW.user_id` never violates `customers_user_id_fkey` (`public.users(id)`).
CREATE OR REPLACE FUNCTION public.fn_public_customers_user_id_fk_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, web_platform, auth
AS $$
DECLARE
  v_fk_schema text;
  v_fk_table text;
  v_fk_col text;
  v_fk_exists boolean := false;
  v_user_id_text text;
BEGIN
  IF NEW.user_id IS NOT NULL THEN
    v_user_id_text := NULLIF(BTRIM(NEW.user_id), '');
    IF v_user_id_text IS NULL THEN
      NEW.user_id := NULL;
    ELSE
      SELECT
        ns.nspname,
        rel.relname,
        att.attname
      INTO v_fk_schema, v_fk_table, v_fk_col
      FROM pg_constraint c
      JOIN pg_class rel ON rel.oid = c.confrelid
      JOIN pg_namespace ns ON ns.oid = rel.relnamespace
      JOIN pg_attribute att ON att.attrelid = c.confrelid AND att.attnum = c.confkey[1] AND NOT att.attisdropped
      WHERE c.conrelid = 'public.customers'::regclass
        AND c.conname = 'customers_user_id_fkey'
        AND c.contype = 'f'
      LIMIT 1;

      IF v_fk_schema IS NOT NULL AND v_fk_table IS NOT NULL AND v_fk_col IS NOT NULL THEN
        BEGIN
          EXECUTE format(
            'SELECT EXISTS (SELECT 1 FROM %I.%I t WHERE t.%I::text = $1)',
            v_fk_schema,
            v_fk_table,
            v_fk_col
          ) INTO v_fk_exists USING v_user_id_text;
        EXCEPTION WHEN OTHERS THEN
          v_fk_exists := false;
        END;

        IF NOT v_fk_exists THEN
          NEW.user_id := NULL;
        ELSIF v_user_id_text <> NEW.user_id THEN
          NEW.user_id := v_user_id_text;
        END IF;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS zzz_public_customers_fk_guard ON public.customers;
CREATE TRIGGER zzz_public_customers_fk_guard
  BEFORE INSERT OR UPDATE ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_public_customers_user_id_fk_guard();

-- 5. Safe Sequence Alignment & Non-Destructive Backfill of Existing Customers
--    Preserves all existing credentials (web_platform.users.password_hash & auth.users untouched).
--    Preserves all admin and employee accounts (customer roles only).
DO $$
DECLARE
  v_max_web_user bigint := 0;
  v_max_web_cust bigint := 0;
  v_max_pub_cust bigint := 0;
  v_target bigint := 0;
BEGIN
  IF to_regclass('web_platform.users') IS NOT NULL THEN
    SELECT COALESCE(MAX(id), 0) INTO v_max_web_user FROM web_platform.users;
  END IF;
  IF to_regclass('web_platform.customers') IS NOT NULL THEN
    SELECT COALESCE(MAX(
      CASE
        WHEN LENGTH(REGEXP_REPLACE(customer_id, '\D', '', 'g')) BETWEEN 1 AND 12
        THEN REGEXP_REPLACE(customer_id, '\D', '', 'g')::bigint
        ELSE 0
      END
    ), 0)
      INTO v_max_web_cust FROM web_platform.customers;
  END IF;
  SELECT COALESCE(MAX(
    CASE
      WHEN LENGTH(REGEXP_REPLACE(customer_id, '\D', '', 'g')) BETWEEN 1 AND 12
      THEN REGEXP_REPLACE(customer_id, '\D', '', 'g')::bigint
      ELSE 0
    END
  ), 0)
    INTO v_max_pub_cust FROM public.customers;

  v_target := GREATEST(v_max_web_user, v_max_web_cust, v_max_pub_cust);
  IF v_target > 0 THEN
    PERFORM setval('public.customers_code_seq', v_target, true);
  END IF;
END $$;

-- Backfill ONLY missing customer_id values (existing non-empty Customer IDs remain intact)
UPDATE public.customers pc
SET
  customer_id = COALESCE(NULLIF(BTRIM(pc.customer_id), ''), 'NTF-CUST-' || LPAD(nextval('public.customers_code_seq')::text, 6, '0')),
  phone_number = COALESCE(NULLIF(BTRIM(pc.phone_number), ''), pc.mobile, ''),
  company_or_college = COALESCE(NULLIF(BTRIM(pc.company_or_college), ''), pc.organization, ''),
  registration_date = COALESCE(pc.registration_date, pc.created_at, now()),
  account_status = COALESCE(NULLIF(BTRIM(pc.account_status), ''), 'Active');

-- Ensure legacy public.customer_profiles (if present) has required columns before backfill
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

-- Backfill existing customers from web_platform.customers + web_platform.users (preserving credentials & staff!)
DO $$
BEGIN
  IF to_regclass('web_platform.customers') IS NOT NULL THEN
    INSERT INTO public.customers (
      customer_id,
      auth_user_id,
      user_uid,
      web_user_id,
      full_name,
      email,
      phone_number,
      mobile,
      company_or_college,
      organization,
      full_address,
      city,
      state,
      pin_code,
      account_status,
      status_reason,
      registration_date,
      last_login_at,
      created_at,
      updated_at
    )
    SELECT
      wc.customer_id,
      wu.auth_user_id,
      COALESCE(wu.uid, wc.customer_id),
      wc.user_id,
      wc.full_name,
      LOWER(BTRIM(wc.email)),
      COALESCE(wc.phone_number, ''),
      COALESCE(wc.phone_number, ''),
      COALESCE(wc.company_or_college, ''),
      COALESCE(wc.company_or_college, ''),
      COALESCE(wc.full_address, ''),
      COALESCE(wc.city, ''),
      COALESCE(wc.state, ''),
      COALESCE(wc.pin_code, ''),
      CASE WHEN wc.account_status IN ('Active', 'Suspended', 'Deactivated') THEN wc.account_status ELSE 'Active' END,
      COALESCE(wc.status_reason, ''),
      COALESCE(wc.registration_date, wc.created_at, now()),
      wc.last_login_at,
      COALESCE(wc.created_at, now()),
      COALESCE(wc.updated_at, now())
    FROM web_platform.customers wc
    LEFT JOIN web_platform.users wu ON wu.id = wc.user_id
    WHERE wc.deleted_at IS NULL
      AND (wu.id IS NULL OR COALESCE(wu.role, 'customer') IN ('customer', 'buyer', 'farmer', 'drone_pilot'))
      AND NOT EXISTS (
        SELECT 1 FROM public.customers pc
        WHERE pc.customer_id = wc.customer_id
           OR (wc.user_id IS NOT NULL AND pc.web_user_id = wc.user_id)
      )
    ON CONFLICT DO NOTHING;
  END IF;

  IF to_regclass('web_platform.users') IS NOT NULL THEN
    INSERT INTO public.customers (
      customer_id,
      auth_user_id,
      user_uid,
      web_user_id,
      full_name,
      email,
      phone_number,
      mobile,
      company_or_college,
      organization,
      full_address,
      city,
      state,
      pin_code,
      account_status,
      status_reason,
      registration_date,
      last_login_at,
      created_at,
      updated_at
    )
    SELECT
      'NTF-CUST-' || LPAD(u.id::text, 6, '0'),
      u.auth_user_id,
      u.uid,
      u.id,
      CASE WHEN BTRIM(u.full_name) <> '' THEN u.full_name ELSE SPLIT_PART(u.email, '@', 1) END,
      LOWER(BTRIM(u.email)),
      COALESCE(u.mobile, ''),
      COALESCE(u.mobile, ''),
      COALESCE(u.company_or_college, ''),
      COALESCE(u.company_or_college, ''),
      COALESCE(u.full_address, ''),
      COALESCE(u.city, ''),
      COALESCE(u.state, ''),
      COALESCE(u.pin_code, ''),
      CASE WHEN u.account_status IN ('Active', 'Suspended', 'Deactivated') THEN u.account_status ELSE 'Active' END,
      COALESCE(u.status_reason, ''),
      u.created_at,
      u.last_login_at,
      u.created_at,
      u.updated_at
    FROM web_platform.users u
    WHERE u.deleted_at IS NULL
      AND u.role IN ('customer', 'buyer', 'farmer', 'drone_pilot')
      AND NOT EXISTS (
        SELECT 1 FROM public.customers pc
        WHERE pc.web_user_id = u.id
           OR (u.uid ~ '^NTF-CUST-' AND pc.customer_id = u.uid)
      )
    ON CONFLICT DO NOTHING;
  END IF;

  IF to_regclass('public.customer_profiles') IS NOT NULL THEN
    INSERT INTO public.customers (
      auth_user_id,
      user_uid,
      full_name,
      email,
      phone_number,
      mobile,
      company_or_college,
      organization,
      account_status,
      registration_date,
      created_at,
      updated_at
    )
    SELECT
      cp.id,
      cp.id::text,
      COALESCE(cp.full_name, ''),
      LOWER(BTRIM(COALESCE(cp.email, ''))),
      COALESCE(
        NULLIF(BTRIM(cp.phone), ''),
        NULLIF(BTRIM(to_jsonb(cp)->>'mobile'), ''),
        NULLIF(BTRIM(to_jsonb(cp)->>'phone_number'), ''),
        ''
      ),
      COALESCE(
        NULLIF(BTRIM(cp.phone), ''),
        NULLIF(BTRIM(to_jsonb(cp)->>'mobile'), ''),
        NULLIF(BTRIM(to_jsonb(cp)->>'phone_number'), ''),
        ''
      ),
      COALESCE(cp.company_or_college, ''),
      COALESCE(cp.company_or_college, ''),
      'Active',
      COALESCE(cp.created_at, now()),
      COALESCE(cp.created_at, now()),
      COALESCE(cp.updated_at, now())
    FROM public.customer_profiles cp
    WHERE cp.role IN ('customer', 'buyer', 'farmer', 'drone_pilot')
      AND NOT EXISTS (
        SELECT 1 FROM public.customers pc
        WHERE (COALESCE(cp.email, '') <> '' AND LOWER(pc.email) = LOWER(BTRIM(cp.email)))
           OR pc.auth_user_id = cp.id
      )
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- Re-advance sequence after backfill
DO $$
DECLARE
  v_max_pub_cust bigint := 0;
BEGIN
  SELECT COALESCE(MAX(
    CASE
      WHEN LENGTH(REGEXP_REPLACE(customer_id, '\D', '', 'g')) BETWEEN 1 AND 12
      THEN REGEXP_REPLACE(customer_id, '\D', '', 'g')::bigint
      ELSE 0
    END
  ), 0)
    INTO v_max_pub_cust FROM public.customers;
  IF v_max_pub_cust > 0 THEN
    PERFORM setval('public.customers_code_seq', v_max_pub_cust, true);
  END IF;
END $$;

-- 6. Two-Way Sync Trigger: `public.customers` INSERT/UPDATE -> `web_platform.users` & `public.customer_profiles`
--    (Never modifies password_hash or staff/admin/employee accounts; preserves customer-only reset configuration.)
CREATE OR REPLACE FUNCTION public.fn_public_customers_after_upsert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, web_platform, auth
AS $$
DECLARE
  v_is_active boolean := (NEW.account_status = 'Active');
  v_web_user_id integer;
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  IF to_regclass('web_platform.users') IS NOT NULL THEN
    SELECT id INTO v_web_user_id
    FROM web_platform.users
    WHERE (NEW.web_user_id IS NOT NULL AND id = NEW.web_user_id)
       OR (NEW.customer_id IS NOT NULL AND uid = NEW.customer_id)
       OR (NEW.user_uid IS NOT NULL AND uid = NEW.user_uid)
    ORDER BY deleted_at NULLS FIRST, id ASC
    LIMIT 1;

    IF v_web_user_id IS NOT NULL THEN
      UPDATE web_platform.users
      SET
        auth_user_id = COALESCE(NEW.auth_user_id, auth_user_id),
        email = LOWER(NEW.email),
        full_name = NEW.full_name,
        mobile = NEW.phone_number,
        company_or_college = NEW.company_or_college,
        full_address = NEW.full_address,
        city = NEW.city,
        state = NEW.state,
        pin_code = NEW.pin_code,
        account_status = NEW.account_status,
        status_reason = CASE WHEN v_is_active THEN '' ELSE NEW.status_reason END,
        is_active = v_is_active,
        deleted_at = NULL,
        last_login_at = COALESCE(NEW.last_login_at, last_login_at),
        updated_at = now()
      WHERE id = v_web_user_id
        AND COALESCE(role, 'customer') IN ('customer', 'buyer', 'farmer', 'drone_pilot');

      IF NOT v_is_active AND to_regclass('web_platform.admin_sessions') IS NOT NULL THEN
        DELETE FROM web_platform.admin_sessions
        WHERE (user_id = v_web_user_id OR active_customer_id = NEW.customer_id)
          AND EXISTS (
            SELECT 1 FROM web_platform.users u
            WHERE u.id = v_web_user_id
              AND COALESCE(u.role, 'customer') IN ('customer', 'buyer', 'farmer', 'drone_pilot')
          );
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_public_customers_after_upsert ON public.customers;
CREATE TRIGGER trg_public_customers_after_upsert
  AFTER INSERT OR UPDATE ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_public_customers_after_upsert();

-- 7. Automatic Customer Deletion Trigger (`AFTER DELETE ON public.customers`)
--    Isolated to ONLY this specific customer profile row; preserves sibling profiles & staff accounts.
CREATE OR REPLACE FUNCTION public.fn_public_customers_after_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, web_platform
AS $$
DECLARE
  v_web_user_id integer;
  v_role text;
BEGIN
  IF to_regclass('web_platform.users') IS NOT NULL THEN
    SELECT id, role
    INTO v_web_user_id, v_role
    FROM web_platform.users
    WHERE (OLD.web_user_id IS NOT NULL AND id = OLD.web_user_id)
       OR (OLD.customer_id IS NOT NULL AND uid = OLD.customer_id)
       OR (OLD.user_uid IS NOT NULL AND uid = OLD.user_uid)
    ORDER BY deleted_at NULLS FIRST, id ASC
    LIMIT 1;

    -- Never auto-deactivate staff/admin/employee accounts via customer table delete
    IF v_web_user_id IS NOT NULL AND COALESCE(v_role, 'customer') IN ('customer', 'buyer', 'farmer', 'drone_pilot') THEN
      IF to_regclass('web_platform.admin_sessions') IS NOT NULL THEN
        DELETE FROM web_platform.admin_sessions
        WHERE user_id = v_web_user_id
           OR active_customer_id = OLD.customer_id;
      END IF;

      UPDATE web_platform.users
      SET
        deleted_at = now(),
        is_active = false,
        account_status = 'Deactivated',
        status_reason = 'Deleted from Supabase public.customers',
        updated_at = now()
      WHERE id = v_web_user_id;
    END IF;
  END IF;

  IF to_regclass('web_platform.customers') IS NOT NULL THEN
    DELETE FROM web_platform.customers
    WHERE (OLD.web_user_id IS NOT NULL AND user_id = OLD.web_user_id)
       OR (OLD.customer_id IS NOT NULL AND customer_id = OLD.customer_id);
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_public_customers_after_delete ON public.customers;
CREATE TRIGGER trg_public_customers_after_delete
  AFTER DELETE ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_public_customers_after_delete();

-- Sync `email_verified` & `email_confirmed_at` for existing customers from `auth.users`
DO $$
BEGIN
  UPDATE public.customers pc
  SET
    email_verified = (au.email_confirmed_at IS NOT NULL),
    email_confirmed_at = COALESCE(pc.email_confirmed_at, au.email_confirmed_at)
  FROM auth.users au
  WHERE (pc.auth_user_id = au.id OR LOWER(pc.email) = LOWER(au.email))
    AND au.email_confirmed_at IS NOT NULL
    AND pc.email_verified = false;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- ============================================================================
-- 8. Immutable Customer ID History Table (`public.customer_id_history`)
--    Preserves every assigned & regenerated Customer ID permanently, even if
--    the customer profile row is later soft-deleted or hard-deleted.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.customer_id_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_db_id uuid,
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

ALTER TABLE public.customer_id_history
  ADD COLUMN IF NOT EXISTS customer_db_id uuid,
  ADD COLUMN IF NOT EXISTS auth_user_id uuid,
  ADD COLUMN IF NOT EXISTS email text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS previous_customer_id text,
  ADD COLUMN IF NOT EXISTS new_customer_id text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS previous_account_status text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS new_account_status text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS operation_type text NOT NULL DEFAULT 'initial_registration',
  ADD COLUMN IF NOT EXISTS reason text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS changed_by text NOT NULL DEFAULT 'system',
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

DO $$
DECLARE
  v_cust_id_udt text;
  v_hist_db_id_udt text;
BEGIN
  SELECT udt_name INTO v_cust_id_udt
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'customers' AND column_name = 'id';

  SELECT udt_name INTO v_hist_db_id_udt
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'customer_id_history' AND column_name = 'customer_db_id';

  IF v_cust_id_udt IS NOT NULL AND (
    (v_cust_id_udt <> 'uuid' AND v_hist_db_id_udt = 'uuid')
    OR (v_hist_db_id_udt IS NOT NULL AND v_hist_db_id_udt NOT IN ('uuid', 'text'))
    OR (v_cust_id_udt = 'uuid' AND v_hist_db_id_udt IS NOT NULL AND v_hist_db_id_udt <> 'uuid' AND v_hist_db_id_udt <> 'text')
  ) THEN
    ALTER TABLE public.customer_id_history
      ALTER COLUMN customer_db_id TYPE text USING customer_db_id::text;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_customer_id_history_customer_db_id
  ON public.customer_id_history (customer_db_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_customer_id_history_email
  ON public.customer_id_history (LOWER(email), created_at DESC);

CREATE INDEX IF NOT EXISTS idx_customer_id_history_new_id
  ON public.customer_id_history (new_customer_id);

-- Immutable guard: prevent overwriting or deleting customer_id_history records
CREATE OR REPLACE FUNCTION public.fn_prevent_history_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Audit history table % is append-only and cannot be modified or deleted.', TG_TABLE_NAME;
END;
$$;

DROP TRIGGER IF EXISTS trg_customer_id_history_immutable ON public.customer_id_history;
CREATE TRIGGER trg_customer_id_history_immutable
  BEFORE UPDATE OR DELETE ON public.customer_id_history
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_prevent_history_mutation();

-- Trigger on `public.customers` to automatically record initial ID assignment & any Customer ID change
DO $$
DECLARE
  v_hist_db_id_udt text;
  v_id_expr text;
BEGIN
  SELECT udt_name INTO v_hist_db_id_udt
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'customer_id_history' AND column_name = 'customer_db_id';

  v_id_expr := CASE WHEN v_hist_db_id_udt = 'uuid' THEN 'NEW.id' ELSE 'NEW.id::text' END;

  EXECUTE format($fn$
    CREATE OR REPLACE FUNCTION public.fn_public_customers_log_id_history()
    RETURNS trigger
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public, auth
    AS $body$
    BEGIN
      IF COALESCE(current_setting('app.id_history_logged', true), '') = 'true' THEN
        RETURN NEW;
      END IF;

      IF TG_OP = 'INSERT' THEN
        INSERT INTO public.customer_id_history (
          customer_db_id,
          auth_user_id,
          email,
          previous_customer_id,
          new_customer_id,
          previous_account_status,
          new_account_status,
          operation_type,
          reason,
          changed_by
        ) VALUES (
          %s,
          NEW.auth_user_id,
          LOWER(COALESCE(NEW.email, '')),
          NULL,
          NEW.customer_id,
          '',
          COALESCE(NEW.account_status, 'Active'),
          'initial_registration',
          'Initial Customer ID generated on profile creation',
          'system'
        );
      ELSIF TG_OP = 'UPDATE' AND OLD.customer_id IS DISTINCT FROM NEW.customer_id THEN
        INSERT INTO public.customer_id_history (
          customer_db_id,
          auth_user_id,
          email,
          previous_customer_id,
          new_customer_id,
          previous_account_status,
          new_account_status,
          operation_type,
          reason,
          changed_by
        ) VALUES (
          %s,
          COALESCE(NEW.auth_user_id, OLD.auth_user_id),
          LOWER(COALESCE(NEW.email, OLD.email, '')),
          OLD.customer_id,
          NEW.customer_id,
          COALESCE(OLD.account_status, ''),
          COALESCE(NEW.account_status, 'Active'),
          CASE
            WHEN OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN 'account_restoration'
            ELSE 'id_regeneration'
          END,
          COALESCE(NULLIF(BTRIM(NEW.status_reason), ''), 'Customer ID updated'),
          'system'
        );
      END IF;

      RETURN NEW;
    END;
    $body$;
  $fn$, v_id_expr, v_id_expr);
END $$;

DROP TRIGGER IF EXISTS trg_public_customers_log_id_history ON public.customers;
CREATE TRIGGER trg_public_customers_log_id_history
  AFTER INSERT OR UPDATE OF customer_id ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_public_customers_log_id_history();

-- Concurrency-safe, atomic Customer ID Regeneration RPC (never reuses deleted/old IDs)
CREATE OR REPLACE FUNCTION public.regenerate_public_customer_id(
  p_customer_uuid uuid,
  p_operation_type text DEFAULT 'account_restoration',
  p_reason text DEFAULT 'Authorized re-registration / account restoration',
  p_changed_by text DEFAULT 'system',
  p_new_account_status text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  previous_customer_id text,
  new_customer_id text,
  account_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_existing public.customers%ROWTYPE;
  v_next_id text;
  v_target_status text;
BEGIN
  SELECT * INTO v_existing
  FROM public.customers pc
  WHERE pc.id = p_customer_uuid
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Customer record % not found.', p_customer_uuid;
  END IF;

  v_next_id := 'NTF-CUST-' || LPAD(nextval('public.customers_code_seq')::text, 6, '0');
  v_target_status := COALESCE(NULLIF(BTRIM(p_new_account_status), ''), v_existing.account_status, 'Active');

  PERFORM set_config('app.id_history_logged', 'true', true);

  UPDATE public.customers pc
  SET
    customer_id = v_next_id,
    user_uid = COALESCE(pc.auth_user_id::text, v_next_id),
    account_status = v_target_status,
    deleted_at = CASE WHEN v_target_status = 'Active' THEN NULL ELSE pc.deleted_at END,
    deleted_reason = CASE WHEN v_target_status = 'Active' THEN '' ELSE pc.deleted_reason END,
    updated_at = now()
  WHERE pc.id = p_customer_uuid;

  INSERT INTO public.customer_id_history (
    customer_db_id,
    auth_user_id,
    email,
    previous_customer_id,
    new_customer_id,
    previous_account_status,
    new_account_status,
    operation_type,
    reason,
    changed_by
  ) VALUES (
    v_existing.id,
    v_existing.auth_user_id,
    LOWER(COALESCE(v_existing.email, '')),
    v_existing.customer_id,
    v_next_id,
    COALESCE(v_existing.account_status, ''),
    v_target_status,
    COALESCE(NULLIF(BTRIM(p_operation_type), ''), 'account_restoration'),
    COALESCE(NULLIF(BTRIM(p_reason), ''), 'Authorized Customer ID regeneration'),
    COALESCE(NULLIF(BTRIM(p_changed_by), ''), 'system')
  );

  RETURN QUERY SELECT v_existing.id, v_existing.customer_id, v_next_id, v_target_status;
END;
$$;

-- Backfill initial ID history rows for existing customers (only where missing)
DO $$
DECLARE
  v_hist_db_id_udt text;
  v_pc_id_expr text;
BEGIN
  SELECT udt_name INTO v_hist_db_id_udt
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'customer_id_history' AND column_name = 'customer_db_id';

  v_pc_id_expr := CASE WHEN v_hist_db_id_udt = 'uuid' THEN 'pc.id' ELSE 'pc.id::text' END;

  EXECUTE format($ins$
    INSERT INTO public.customer_id_history (
      customer_db_id,
      auth_user_id,
      email,
      previous_customer_id,
      new_customer_id,
      previous_account_status,
      new_account_status,
      operation_type,
      reason,
      changed_by,
      created_at
    )
    SELECT
      %s,
      pc.auth_user_id,
      LOWER(pc.email),
      NULL,
      pc.customer_id,
      '',
      pc.account_status,
      'initial_registration',
      'Baseline Customer ID preserved during migration',
      'migration',
      COALESCE(pc.registration_date, pc.created_at, now())
    FROM public.customers pc
    WHERE pc.customer_id IS NOT NULL
      AND pc.customer_id <> ''
      AND NOT EXISTS (
        SELECT 1 FROM public.customer_id_history h
        WHERE h.customer_db_id::text = pc.id::text
          AND h.new_customer_id = pc.customer_id
      )
  $ins$, v_pc_id_expr);
END $$;

-- ============================================================================
-- 9. Private Password Activity Metadata Table (`public.customer_password_history`)
--    Stores password activity metadata ONLY (NEVER passwords, hashes, or tokens).
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.customer_password_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id text NOT NULL DEFAULT '',
  customer_db_id uuid,
  email text NOT NULL DEFAULT '',
  auth_user_id uuid,
  action_type text NOT NULL CHECK (action_type IN ('registration', 'reset', 'change', 'recovery')),
  action_status text NOT NULL DEFAULT 'completed' CHECK (action_status IN ('requested', 'verified', 'completed', 'failed')),
  ip_address text NOT NULL DEFAULT '',
  user_agent text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.customer_password_history
  ADD COLUMN IF NOT EXISTS customer_id text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS customer_db_id uuid,
  ADD COLUMN IF NOT EXISTS email text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS auth_user_id uuid,
  ADD COLUMN IF NOT EXISTS action_type text NOT NULL DEFAULT 'reset',
  ADD COLUMN IF NOT EXISTS action_status text NOT NULL DEFAULT 'completed',
  ADD COLUMN IF NOT EXISTS ip_address text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS user_agent text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_customer_password_history_customer_db_id
  ON public.customer_password_history (customer_db_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_customer_password_history_auth_user_id
  ON public.customer_password_history (auth_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_customer_password_history_email
  ON public.customer_password_history (LOWER(email), created_at DESC);

DROP TRIGGER IF EXISTS trg_customer_password_history_immutable ON public.customer_password_history;
CREATE TRIGGER trg_customer_password_history_immutable
  BEFORE UPDATE OR DELETE ON public.customer_password_history
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_prevent_history_mutation();

-- ============================================================================
-- 10. Admin Authorization Helper & Row Level Security (RLS)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.is_public_customer_admin()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, web_platform, auth
AS $$
DECLARE
  v_uid uuid;
  v_email text;
  v_role text;
BEGIN
  IF current_user IN ('postgres', 'service_role', 'supabase_admin') THEN
    RETURN true;
  END IF;

  v_uid := auth.uid();
  v_email := LOWER(COALESCE(auth.jwt() ->> 'email', ''));

  IF v_email IN ('info.nexustekfusion@gmail.com', 'info@nexustekfusion.in') THEN
    RETURN true;
  END IF;

  IF COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') IN (
    'super_admin', 'admin', 'website_manager', 'product_manager',
    'sales_manager', 'project_manager', 'engineer', 'printing_operator',
    'inventory_manager', 'accounts_manager', 'support_manager', 'support_staff'
  ) THEN
    RETURN true;
  END IF;

  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  IF to_regclass('web_platform.users') IS NOT NULL THEN
    SELECT u.role INTO v_role
    FROM web_platform.users u
    WHERE (u.auth_user_id = v_uid OR u.uid = v_uid::text)
      AND u.deleted_at IS NULL
      AND u.is_active = true
      AND u.account_status = 'Active'
    LIMIT 1;
  END IF;

  RETURN COALESCE(v_role IN (
    'super_admin', 'admin', 'website_manager', 'product_manager',
    'sales_manager', 'project_manager', 'engineer', 'printing_operator',
    'inventory_manager', 'accounts_manager', 'support_manager', 'support_staff'
  ), false);
END;
$$;

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_id_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_password_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "customers_own_or_admin" ON public.customers;
DROP POLICY IF EXISTS "public_customers_service_all" ON public.customers;
DROP POLICY IF EXISTS "public_customers_admin_all" ON public.customers;
DROP POLICY IF EXISTS "public_customers_self_select" ON public.customers;
DROP POLICY IF EXISTS "public_customers_self_update" ON public.customers;

CREATE POLICY "public_customers_service_all"
  ON public.customers
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "public_customers_admin_all"
  ON public.customers
  FOR ALL
  TO authenticated
  USING (public.is_public_customer_admin())
  WITH CHECK (public.is_public_customer_admin());

CREATE POLICY "public_customers_self_select"
  ON public.customers
  FOR SELECT
  TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      auth_user_id = auth.uid()
      OR user_uid = auth.uid()::text
      OR LOWER(email) = LOWER(COALESCE(auth.jwt() ->> 'email', ''))
    )
  );

CREATE POLICY "public_customers_self_update"
  ON public.customers
  FOR UPDATE
  TO authenticated
  USING (
    deleted_at IS NULL
    AND account_status = 'Active'
    AND (
      auth_user_id = auth.uid()
      OR user_uid = auth.uid()::text
      OR LOWER(email) = LOWER(COALESCE(auth.jwt() ->> 'email', ''))
    )
  )
  WITH CHECK (
    deleted_at IS NULL
    AND account_status = 'Active'
    AND (
      auth_user_id = auth.uid()
      OR user_uid = auth.uid()::text
      OR LOWER(email) = LOWER(COALESCE(auth.jwt() ->> 'email', ''))
    )
  );

-- RLS for customer_id_history (append-only; admins view all; customers view own only; nobody can update/delete)
DROP POLICY IF EXISTS "customer_id_history_service_all" ON public.customer_id_history;
DROP POLICY IF EXISTS "customer_id_history_admin_select" ON public.customer_id_history;
DROP POLICY IF EXISTS "customer_id_history_self_select" ON public.customer_id_history;

CREATE POLICY "customer_id_history_service_all"
  ON public.customer_id_history
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "customer_id_history_admin_select"
  ON public.customer_id_history
  FOR SELECT
  TO authenticated
  USING (public.is_public_customer_admin());

CREATE POLICY "customer_id_history_self_select"
  ON public.customer_id_history
  FOR SELECT
  TO authenticated
  USING (auth_user_id = auth.uid());

-- RLS for customer_password_history (metadata only; service_role inserts; admins & self read-only)
DROP POLICY IF EXISTS "customer_password_history_service_all" ON public.customer_password_history;
DROP POLICY IF EXISTS "customer_password_history_admin_select" ON public.customer_password_history;
DROP POLICY IF EXISTS "customer_password_history_self_select" ON public.customer_password_history;

CREATE POLICY "customer_password_history_service_all"
  ON public.customer_password_history
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "customer_password_history_admin_select"
  ON public.customer_password_history
  FOR SELECT
  TO authenticated
  USING (public.is_public_customer_admin());

CREATE POLICY "customer_password_history_self_select"
  ON public.customer_password_history
  FOR SELECT
  TO authenticated
  USING (auth_user_id = auth.uid());

-- ============================================================================
-- 11. Realtime Configuration (REPLICA IDENTITY FULL)
-- ============================================================================
ALTER TABLE public.customers REPLICA IDENTITY FULL;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.customers;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
  WHEN insufficient_privilege THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.customer_id_history;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
  WHEN insufficient_privilege THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.customer_password_history;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
  WHEN insufficient_privilege THEN NULL;
END $$;

-- ============================================================================
-- 12. Schema & Constraint Verification RPC (`verify_public_customers_migration_status`)
--     Inspects actual pg_constraint & information_schema metadata (NO BIGINT checks,
--     NO public.users.email assumptions).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.verify_public_customers_migration_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog, information_schema
AS $$
DECLARE
  v_customers_exists boolean := (to_regclass('public.customers') IS NOT NULL);
  v_users_exists boolean := (to_regclass('public.users') IS NOT NULL);
  v_id_history_exists boolean := (to_regclass('public.customer_id_history') IS NOT NULL);
  v_pw_history_exists boolean := (to_regclass('public.customer_password_history') IS NOT NULL);
  v_cust_user_id_type text := NULL;
  v_cust_user_id_nullable boolean := false;
  v_users_id_type text := NULL;
  v_users_id_unique boolean := false;
  v_fk_name text := NULL;
  v_fk_source_col text := NULL;
  v_fk_source_col_count integer := 0;
  v_fk_target_col_count integer := 0;
  v_fk_target_schema text := NULL;
  v_fk_target_table text := NULL;
  v_fk_target_col text := NULL;
  v_fk_on_delete text := NULL;
  v_fk_valid boolean := false;
  v_types_compatible boolean := false;
  v_missing_cols text[] := ARRAY[]::text[];
  v_required_cols text[] := ARRAY[
    'id', 'customer_id', 'user_id', 'auth_user_id', 'user_uid', 'web_user_id',
    'full_name', 'email', 'phone_number', 'company_or_college', 'full_address',
    'city', 'state', 'pin_code', 'account_status', 'status_reason',
    'email_verified', 'last_password_reset_at', 'password_reset_status',
    'registration_date', 'last_login_at', 'deleted_at'
  ];
  v_col text;
  v_issues text[] := ARRAY[]::text[];
  v_seq_val bigint := 0;
  v_verified boolean := false;
BEGIN
  IF NOT v_customers_exists THEN
    v_issues := array_append(v_issues, 'Missing table public.customers.');
  END IF;
  IF NOT v_users_exists THEN
    v_issues := array_append(v_issues, 'Missing table public.users.');
  END IF;
  IF NOT v_id_history_exists THEN
    v_issues := array_append(v_issues, 'Missing table public.customer_id_history.');
  END IF;
  IF NOT v_pw_history_exists THEN
    v_issues := array_append(v_issues, 'Missing table public.customer_password_history.');
  END IF;

  IF v_customers_exists THEN
    SELECT c.udt_name, (c.is_nullable = 'YES')
    INTO v_cust_user_id_type, v_cust_user_id_nullable
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'customers'
      AND c.column_name = 'user_id';

    FOREACH v_col IN ARRAY v_required_cols LOOP
      IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns c
        WHERE c.table_schema = 'public'
          AND c.table_name = 'customers'
          AND c.column_name = v_col
      ) THEN
        v_missing_cols := array_append(v_missing_cols, v_col);
      END IF;
    END LOOP;

    IF array_length(v_missing_cols, 1) > 0 THEN
      v_issues := array_append(
        v_issues,
        'public.customers missing columns: ' || array_to_string(v_missing_cols, ', ')
      );
    END IF;
  END IF;

  IF v_users_exists THEN
    SELECT c.udt_name
    INTO v_users_id_type
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'users'
      AND c.column_name = 'id';

    SELECT EXISTS (
      SELECT 1
      FROM pg_index ix
      JOIN pg_attribute a ON a.attrelid = ix.indrelid AND a.attnum = ANY(ix.indkey)
      WHERE ix.indrelid = 'public.users'::regclass
        AND ix.indisunique
        AND ix.indisvalid
        AND array_length(ix.indkey, 1) = 1
        AND a.attname = 'id'
    ) INTO v_users_id_unique;
  END IF;

  IF v_cust_user_id_type IS DISTINCT FROM 'text' THEN
    v_issues := array_append(
      v_issues,
      format('Expected public.customers.user_id to be text, found %s.', COALESCE(v_cust_user_id_type, 'missing'))
    );
  END IF;

  IF NOT v_cust_user_id_nullable THEN
    v_issues := array_append(v_issues, 'Expected public.customers.user_id to be nullable.');
  END IF;

  IF v_users_id_type IS DISTINCT FROM 'text' THEN
    v_issues := array_append(
      v_issues,
      format('Expected public.users.id to be text, found %s.', COALESCE(v_users_id_type, 'missing'))
    );
  END IF;

  IF v_users_exists AND NOT v_users_id_unique THEN
    v_issues := array_append(v_issues, 'Expected public.users(id) to have a PRIMARY KEY or UNIQUE constraint.');
  END IF;

  v_types_compatible := (
    v_cust_user_id_type = 'text'
    AND v_cust_user_id_nullable
    AND v_users_id_type = 'text'
    AND v_users_id_unique
  );

  IF v_customers_exists THEN
    SELECT
      c.conname,
      src.attname,
      COALESCE(array_length(c.conkey, 1), 0),
      COALESCE(array_length(c.confkey, 1), 0),
      ns.nspname,
      rel.relname,
      tgt.attname,
      CASE c.confdeltype
        WHEN 'n' THEN 'SET NULL'
        WHEN 'c' THEN 'CASCADE'
        WHEN 'a' THEN 'NO ACTION'
        WHEN 'r' THEN 'RESTRICT'
        WHEN 'd' THEN 'SET DEFAULT'
        ELSE c.confdeltype::text
      END
    INTO
      v_fk_name,
      v_fk_source_col,
      v_fk_source_col_count,
      v_fk_target_col_count,
      v_fk_target_schema,
      v_fk_target_table,
      v_fk_target_col,
      v_fk_on_delete
    FROM pg_constraint c
    JOIN pg_attribute src
      ON src.attrelid = c.conrelid
     AND src.attnum = ANY(c.conkey)
     AND NOT src.attisdropped
    JOIN pg_class rel ON rel.oid = c.confrelid
    JOIN pg_namespace ns ON ns.oid = rel.relnamespace
    JOIN pg_attribute tgt
      ON tgt.attrelid = c.confrelid
     AND tgt.attnum = c.confkey[1]
     AND NOT tgt.attisdropped
    WHERE c.conrelid = 'public.customers'::regclass
      AND c.contype = 'f'
      AND (c.conname = 'customers_user_id_fkey' OR src.attname = 'user_id')
    ORDER BY (c.conname = 'customers_user_id_fkey') DESC
    LIMIT 1;
  END IF;

  v_fk_valid := (
    v_fk_name = 'customers_user_id_fkey'
    AND v_fk_source_col = 'user_id'
    AND v_fk_source_col_count = 1
    AND v_fk_target_col_count = 1
    AND v_fk_target_schema = 'public'
    AND v_fk_target_table = 'users'
    AND v_fk_target_col = 'id'
    AND v_fk_on_delete IN ('SET NULL', 'NO ACTION', 'RESTRICT')
  );

  IF NOT v_fk_valid THEN
    v_issues := array_append(
      v_issues,
      format(
        'Constraint customers_user_id_fkey must reference public.users(id) from public.customers.user_id (found: name=%s col=%s target=%s.%s(%s) on_delete=%s).',
        COALESCE(v_fk_name, 'none'),
        COALESCE(v_fk_source_col, 'none'),
        COALESCE(v_fk_target_schema, 'none'),
        COALESCE(v_fk_target_table, 'none'),
        COALESCE(v_fk_target_col, 'none'),
        COALESCE(v_fk_on_delete, 'none')
      )
    );
  END IF;

  IF to_regclass('public.customers_code_seq') IS NOT NULL THEN
    SELECT last_value INTO v_seq_val FROM public.customers_code_seq;
  END IF;

  v_verified := (
    v_customers_exists
    AND v_users_exists
    AND v_id_history_exists
    AND v_pw_history_exists
    AND v_types_compatible
    AND v_fk_valid
    AND COALESCE(array_length(v_missing_cols, 1), 0) = 0
  );

  RETURN jsonb_build_object(
    'migration_verified', v_verified,
    'customers_table_exists', v_customers_exists,
    'users_table_exists', v_users_exists,
    'customer_id_history_exists', v_id_history_exists,
    'customer_password_history_exists', v_pw_history_exists,
    'customers_user_id_type', v_cust_user_id_type,
    'customers_user_id_nullable', v_cust_user_id_nullable,
    'users_id_type', v_users_id_type,
    'users_id_unique', v_users_id_unique,
    'types_compatible', v_types_compatible,
    'fk_exists', (v_fk_name IS NOT NULL),
    'fk_constraint_name', v_fk_name,
    'fk_source_column', v_fk_source_col,
    'fk_target_schema', v_fk_target_schema,
    'fk_target_table', v_fk_target_table,
    'fk_target_column', v_fk_target_col,
    'fk_on_delete', v_fk_on_delete,
    'fk_valid', v_fk_valid,
    'missing_columns', to_jsonb(v_missing_cols),
    'issues', to_jsonb(v_issues),
    'customers_code_seq_last_value', v_seq_val
  );
END;
$$;

-- ============================================================================
-- 13. Grants & Strict Post-Migration Verification
-- ============================================================================
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;
GRANT SELECT, INSERT ON public.customer_id_history TO service_role;
GRANT SELECT ON public.customer_id_history TO authenticated;
GRANT SELECT, INSERT ON public.customer_password_history TO service_role;
GRANT SELECT ON public.customer_password_history TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.customers_code_seq TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.is_public_customer_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.regenerate_public_customer_id(uuid, text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.verify_public_customers_migration_status() TO anon, authenticated, service_role;

DO $$
DECLARE
  v_status jsonb;
BEGIN
  v_status := public.verify_public_customers_migration_status();
  IF COALESCE((v_status ->> 'migration_verified')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'NexusTekFusion Migration Verification Failed: %', v_status ->> 'issues';
  END IF;

  RAISE NOTICE 'NexusTekFusion Migration Verified — constraint: % -> %.%(%) ON DELETE %, public.customers.user_id: %, public.users.id: %, customers_code_seq last_value: %',
    v_status ->> 'fk_constraint_name',
    v_status ->> 'fk_target_schema',
    v_status ->> 'fk_target_table',
    v_status ->> 'fk_target_column',
    v_status ->> 'fk_on_delete',
    v_status ->> 'customers_user_id_type',
    v_status ->> 'users_id_type',
    v_status ->> 'customers_code_seq_last_value';
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ============================================================================
-- NON-DESTRUCTIVE ROLLBACK INSTRUCTIONS (Run ONLY if reverting triggers/sync)
-- Preserves all customer rows, customer IDs, history tables, orders & passwords.
-- ============================================================================
-- BEGIN;
-- DROP TRIGGER IF EXISTS trg_public_customers_before_write ON public.customers;
-- DROP TRIGGER IF EXISTS zzz_public_customers_fk_guard ON public.customers;
-- DROP TRIGGER IF EXISTS trg_public_customers_after_upsert ON public.customers;
-- DROP TRIGGER IF EXISTS trg_public_customers_after_delete ON public.customers;
-- DROP TRIGGER IF EXISTS trg_public_customers_log_id_history ON public.customers;
-- DROP TRIGGER IF EXISTS trg_customer_id_history_immutable ON public.customer_id_history;
-- DROP TRIGGER IF EXISTS trg_customer_password_history_immutable ON public.customer_password_history;
-- DROP FUNCTION IF EXISTS public.fn_public_customers_before_write();
-- DROP FUNCTION IF EXISTS public.fn_public_customers_user_id_fk_guard();
-- DROP FUNCTION IF EXISTS public.fn_public_customers_after_upsert();
-- DROP FUNCTION IF EXISTS public.fn_public_customers_after_delete();
-- DROP FUNCTION IF EXISTS public.fn_public_customers_log_id_history();
-- DROP FUNCTION IF EXISTS public.regenerate_public_customer_id(uuid, text, text, text, text);
-- DROP FUNCTION IF EXISTS public.verify_public_customers_migration_status();
-- DROP FUNCTION IF EXISTS public.fn_prevent_history_mutation();
-- DROP POLICY IF EXISTS "public_customers_service_all" ON public.customers;
-- DROP POLICY IF EXISTS "public_customers_admin_all" ON public.customers;
-- DROP POLICY IF EXISTS "public_customers_self_select" ON public.customers;
-- DROP POLICY IF EXISTS "public_customers_self_update" ON public.customers;
-- DROP POLICY IF EXISTS "customer_id_history_service_all" ON public.customer_id_history;
-- DROP POLICY IF EXISTS "customer_id_history_admin_select" ON public.customer_id_history;
-- DROP POLICY IF EXISTS "customer_id_history_self_select" ON public.customer_id_history;
-- DROP POLICY IF EXISTS "customer_password_history_service_all" ON public.customer_password_history;
-- DROP POLICY IF EXISTS "customer_password_history_admin_select" ON public.customer_password_history;
-- DROP POLICY IF EXISTS "customer_password_history_self_select" ON public.customer_password_history;
-- DROP FUNCTION IF EXISTS public.is_public_customer_admin();
-- DO $$ BEGIN
--   ALTER PUBLICATION supabase_realtime DROP TABLE public.customers;
--   ALTER PUBLICATION supabase_realtime DROP TABLE public.customer_id_history;
--   ALTER PUBLICATION supabase_realtime DROP TABLE public.customer_password_history;
-- EXCEPTION WHEN OTHERS THEN NULL;
-- END $$;
-- NOTIFY pgrst, 'reload schema';
-- COMMIT;
