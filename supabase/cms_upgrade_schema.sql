-- NexusTekFusion Private Limited — Master Website CMS & Media Library Schema + RLS Policies

-- 1. Extend media_assets for full Image & Video Media Library categories and thumbnails
ALTER TABLE IF EXISTS public.media_assets
  ADD COLUMN IF NOT EXISTS title text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'Company Branding',
  ADD COLUMN IF NOT EXISTS thumbnail_url text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS media_kind text NOT NULL DEFAULT 'image';

-- 2. Structured Team Members (Full CRUD including Founder & CEO)
CREATE TABLE IF NOT EXISTS public.team_members (
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
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Website Promotional & Hero Banners
CREATE TABLE IF NOT EXISTS public.website_banners (
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
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_team_members_order ON public.team_members (display_order, is_active, status);
CREATE INDEX IF NOT EXISTS idx_website_banners_placement ON public.website_banners (placement, sort_order, is_active, status);
CREATE INDEX IF NOT EXISTS idx_media_assets_category ON public.media_assets (category, media_kind, created_at DESC);

-- Enable Row Level Security
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.website_banners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cms_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cms_revisions ENABLE ROW LEVEL SECURITY;

-- Public read access ONLY for published/active records
DROP POLICY IF EXISTS "Public read published team members" ON public.team_members;
CREATE POLICY "Public read published team members"
  ON public.team_members FOR SELECT
  USING (status = 'published' AND is_active = true);

DROP POLICY IF EXISTS "Public read published banners" ON public.website_banners;
CREATE POLICY "Public read published banners"
  ON public.website_banners FOR SELECT
  USING (status = 'published' AND is_active = true);

DROP POLICY IF EXISTS "Public read media assets" ON public.media_assets;
CREATE POLICY "Public read media assets"
  ON public.media_assets FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Public read published cms pages" ON public.cms_pages;
CREATE POLICY "Public read published cms pages"
  ON public.cms_pages FOR SELECT
  USING (status = 'published');

-- Admin write policies (enforced via users.role check + backend Express Admin RBAC)
DROP POLICY IF EXISTS "Admin full access team members" ON public.team_members;
CREATE POLICY "Admin full access team members"
  ON public.team_members FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.uid = auth.uid()::text
        AND u.role IN ('super_admin', 'admin', 'website_manager')
        AND u.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.uid = auth.uid()::text
        AND u.role IN ('super_admin', 'admin', 'website_manager')
        AND u.is_active = true
    )
  );

DROP POLICY IF EXISTS "Admin full access website banners" ON public.website_banners;
CREATE POLICY "Admin full access website banners"
  ON public.website_banners FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.uid = auth.uid()::text
        AND u.role IN ('super_admin', 'admin', 'website_manager')
        AND u.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.uid = auth.uid()::text
        AND u.role IN ('super_admin', 'admin', 'website_manager')
        AND u.is_active = true
    )
  );

DROP POLICY IF EXISTS "Admin full access cms revisions" ON public.cms_revisions;
CREATE POLICY "Admin full access cms revisions"
  ON public.cms_revisions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.uid = auth.uid()::text
        AND u.role IN ('super_admin', 'admin', 'website_manager')
        AND u.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.uid = auth.uid()::text
        AND u.role IN ('super_admin', 'admin', 'website_manager')
        AND u.is_active = true
    )
  );
