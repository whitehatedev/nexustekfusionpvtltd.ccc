import { createPool } from './index.ts';
import { ensureCustomerManagementSchema } from './ensure-customer-mgmt.ts';

let ensuredOnce = false;

export async function ensureCmsTablesExist(): Promise<void> {
  if (ensuredOnce) return;
  const pool = createPool();
  if (!pool) {
    ensuredOnce = true;
    return;
  }

  try {
    await pool.query(`
      CREATE SCHEMA IF NOT EXISTS web_platform;

      ALTER TABLE IF EXISTS web_platform.media_assets
        ADD COLUMN IF NOT EXISTS title text NOT NULL DEFAULT '',
        ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '',
        ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'Company Branding',
        ADD COLUMN IF NOT EXISTS thumbnail_url text NOT NULL DEFAULT '',
        ADD COLUMN IF NOT EXISTS media_kind text NOT NULL DEFAULT 'image';

      CREATE TABLE IF NOT EXISTS web_platform.team_members (
        id serial PRIMARY KEY,
        slug_key text NOT NULL UNIQUE,
        full_name text NOT NULL,
        designation text NOT NULL,
        department text NOT NULL DEFAULT 'Engineering & Innovation',
        professional_category text NOT NULL DEFAULT 'Engineering & Innovation',
        profile_photo_url text NOT NULL DEFAULT '',
        photo_alt text NOT NULL DEFAULT '',
        short_biography text NOT NULL DEFAULT '',
        detailed_biography text NOT NULL DEFAULT '',
        qualifications text NOT NULL DEFAULT '',
        experience text NOT NULL DEFAULT '',
        responsibilities text NOT NULL DEFAULT '',
        skills jsonb NOT NULL DEFAULT '[]'::jsonb,
        linkedin_url text NOT NULL DEFAULT '',
        display_order integer NOT NULL DEFAULT 1,
        status text NOT NULL DEFAULT 'published',
        is_featured boolean NOT NULL DEFAULT false,
        is_active boolean NOT NULL DEFAULT true,
        updated_by text NOT NULL DEFAULT '',
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS web_platform.website_banners (
        id serial PRIMARY KEY,
        banner_key text NOT NULL UNIQUE,
        title text NOT NULL,
        subtitle text NOT NULL DEFAULT '',
        placement text NOT NULL DEFAULT 'homepage_promo',
        image_url text NOT NULL DEFAULT '',
        video_url text NOT NULL DEFAULT '',
        cta_label text NOT NULL DEFAULT 'Explore',
        cta_link text NOT NULL DEFAULT '/krashivantri',
        sort_order integer NOT NULL DEFAULT 1,
        is_active boolean NOT NULL DEFAULT true,
        status text NOT NULL DEFAULT 'published',
        updated_by text NOT NULL DEFAULT '',
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      );

      ALTER TABLE IF EXISTS web_platform.printing_orders
        ADD COLUMN IF NOT EXISTS customer_id text NOT NULL DEFAULT '',
        ADD COLUMN IF NOT EXISTS customer_name text NOT NULL DEFAULT '',
        ADD COLUMN IF NOT EXISTS email text NOT NULL DEFAULT '',
        ADD COLUMN IF NOT EXISTS phone text NOT NULL DEFAULT '',
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
        ADD COLUMN IF NOT EXISTS quoted_price_inr integer DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS refund_status text NOT NULL DEFAULT 'none',
        ADD COLUMN IF NOT EXISTS payment_verified_at timestamp DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS customer_download_enabled boolean NOT NULL DEFAULT true,
        ADD COLUMN IF NOT EXISTS rejection_reason text NOT NULL DEFAULT '',
        ADD COLUMN IF NOT EXISTS printing_approved_at timestamp DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS printing_approved_by text NOT NULL DEFAULT '',
        ADD COLUMN IF NOT EXISTS uploaded_at timestamp NOT NULL DEFAULT now();

      CREATE TABLE IF NOT EXISTS web_platform."3d_printing_production_files" (
        id serial PRIMARY KEY,
        printing_order_id integer NOT NULL REFERENCES web_platform.printing_orders(id) ON DELETE CASCADE,
        file_name text NOT NULL,
        file_format text NOT NULL,
        file_size_bytes integer NOT NULL DEFAULT 0,
        file_storage_path text NOT NULL,
        storage_bucket text NOT NULL DEFAULT '',
        file_kind text NOT NULL DEFAULT 'sliced_gcode',
        notes text NOT NULL DEFAULT '',
        uploaded_by text NOT NULL DEFAULT '',
        created_at timestamp NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS web_platform.printing_file_download_logs (
        id serial PRIMARY KEY,
        printing_order_id integer NOT NULL REFERENCES web_platform.printing_orders(id) ON DELETE CASCADE,
        order_number text NOT NULL DEFAULT '',
        user_id integer REFERENCES web_platform.users(id) ON DELETE SET NULL,
        actor_email text NOT NULL,
        actor_role text NOT NULL DEFAULT 'customer',
        file_kind text NOT NULL DEFAULT 'original',
        file_name text NOT NULL DEFAULT '',
        access_granted boolean NOT NULL DEFAULT false,
        denial_reason text NOT NULL DEFAULT '',
        ip_address text NOT NULL DEFAULT '',
        created_at timestamp NOT NULL DEFAULT now()
      );

      ALTER TABLE IF EXISTS web_platform.products
        ADD COLUMN IF NOT EXISTS hsn_code text NOT NULL DEFAULT '8807';

      ALTER TABLE IF EXISTS web_platform.store_orders
        ADD COLUMN IF NOT EXISTS status_history jsonb NOT NULL DEFAULT '[]'::jsonb,
        ADD COLUMN IF NOT EXISTS cancelled_reason text NOT NULL DEFAULT '',
        ADD COLUMN IF NOT EXISTS cancelled_at timestamp DEFAULT NULL;

      CREATE TABLE IF NOT EXISTS web_platform.product_enquiries (
        id serial PRIMARY KEY,
        enquiry_number text NOT NULL UNIQUE,
        user_id integer REFERENCES web_platform.users(id) ON DELETE SET NULL,
        full_name text NOT NULL,
        mobile text NOT NULL,
        email text NOT NULL,
        state text NOT NULL DEFAULT '',
        district text NOT NULL DEFAULT '',
        organization_or_farm_name text NOT NULL DEFAULT '',
        interested_product text NOT NULL,
        product_slug text NOT NULL DEFAULT '',
        quantity integer NOT NULL DEFAULT 1,
        intended_application text NOT NULL DEFAULT '',
        message text NOT NULL DEFAULT '',
        status text NOT NULL DEFAULT 'New',
        assigned_staff text NOT NULL DEFAULT '',
        internal_notes text NOT NULL DEFAULT '',
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      );
    `);
    await ensureCustomerManagementSchema();
    ensuredOnce = true;
  } catch (err) {
    console.warn('CMS DDL bootstrap check warning:', (err as Error).message);
  }
}
