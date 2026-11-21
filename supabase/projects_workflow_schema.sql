-- NexusTekFusion Custom Engineering Project Development Workflow Schema
-- Includes 12 relational tables, RLS policies, and private 'project-files' bucket configuration.

create extension if not exists pgcrypto;

-- 1. Customers directory (mirrored with customer_profiles)
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  user_uid text unique not null,
  full_name text not null default '',
  email text not null,
  mobile text not null default '',
  whatsapp_number text not null default '',
  organization text not null default '',
  department text not null default '',
  city text not null default '',
  state text not null default '',
  customer_category text not null default 'Student',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Project Registrations
create table if not exists public.project_registrations (
  id uuid primary key default gen_random_uuid(),
  registration_number text unique not null,
  user_uid text not null,
  customer_name text not null,
  customer_email text not null,
  customer_phone text not null default '',
  whatsapp_number text not null default '',
  company_or_college text not null default '',
  department text not null default '',
  city text not null default '',
  state text not null default '',
  customer_category text not null default 'Student',
  project_title text not null,
  project_category text not null,
  engineering_domain text not null default '',
  project_type text not null,
  project_description text not null,
  problem_statement text not null default '',
  objective text not null default '',
  expected_working text not null default '',
  required_features text not null default '',
  preferred_technologies text not null default '',
  hardware_requirements text not null default '',
  software_requirements text not null default '',
  components_required text not null default '',
  expected_output text not null default '',
  requires_physical_prototype boolean not null default true,
  requires_web_or_mobile_app boolean not null default false,
  requires_documentation boolean not null default true,
  expected_budget text not null default '',
  target_completion_date text not null default '',
  complexity_level text not null default 'Intermediate',
  prototype_requirements text not null default '',
  preferred_communication_method text not null default 'WhatsApp & Dashboard',
  additional_requirements text not null default '',
  accepted_terms boolean not null default true,
  accepted_privacy_policy boolean not null default true,
  status text not null default 'Submitted – Under Review',
  assigned_engineer text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3. Project Attachments
create table if not exists public.project_attachments (
  id uuid primary key default gen_random_uuid(),
  registration_number text not null references public.project_registrations(registration_number) on delete cascade,
  user_uid text not null,
  file_name text not null,
  storage_path text not null,
  supabase_object_key text not null default '',
  file_size_bytes bigint not null default 0,
  category text not null default 'supporting_document',
  created_at timestamptz not null default now()
);

-- 4. Project Reviews (Admin evaluation & internal notes)
create table if not exists public.project_reviews (
  id uuid primary key default gen_random_uuid(),
  registration_number text not null references public.project_registrations(registration_number) on delete cascade,
  reviewer_email text not null,
  decision_status text not null,
  assigned_engineer text not null default '',
  internal_notes text not null default '',
  clarification_notes text not null default '',
  rejection_reason text not null default '',
  created_at timestamptz not null default now()
);

-- 5. Project Quotations
create table if not exists public.project_quotations (
  id uuid primary key default gen_random_uuid(),
  quotation_number text unique not null,
  registration_number text not null references public.project_registrations(registration_number) on delete cascade,
  revision_number int not null default 1,
  total_amount_inr int not null,
  advance_amount_inr int not null,
  balance_amount_inr int not null,
  gst_inr int not null default 0,
  discount_inr int not null default 0,
  estimated_delivery_date text not null default '',
  validity_days int not null default 15,
  status text not null default 'Draft',
  approved_by_admin boolean not null default false,
  published_at timestamptz,
  paid_amount_inr int not null default 0,
  payment_status text not null default 'pending',
  razorpay_order_id text not null default '',
  razorpay_payment_id text not null default '',
  created_at timestamptz not null default now()
);

-- 6. Project Cost Breakdown
create table if not exists public.project_cost_breakdown (
  id uuid primary key default gen_random_uuid(),
  quotation_number text not null references public.project_quotations(quotation_number) on delete cascade,
  hardware_cost_inr int not null default 0,
  software_cost_inr int not null default 0,
  component_cost_inr int not null default 0,
  pcb_cost_inr int not null default 0,
  printing_3d_cost_inr int not null default 0,
  engineering_charges_inr int not null default 0,
  testing_qa_charges_inr int not null default 0,
  documentation_charges_inr int not null default 0,
  other_charges_inr int not null default 0,
  taxes_inr int not null default 0,
  custom_items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

-- 7. Project Milestones
create table if not exists public.project_milestones (
  id uuid primary key default gen_random_uuid(),
  project_code text not null,
  registration_number text not null references public.project_registrations(registration_number) on delete cascade,
  title text not null,
  due_date text not null default '',
  status text not null default 'Pending',
  notes text not null default '',
  created_at timestamptz not null default now()
);

-- 8. Project Progress Updates
create table if not exists public.project_updates (
  id uuid primary key default gen_random_uuid(),
  project_code text not null,
  registration_number text not null references public.project_registrations(registration_number) on delete cascade,
  update_category text not null default 'Project Planning',
  update_title text not null,
  description text not null default '',
  progress_percentage int not null default 0,
  photos jsonb not null default '[]'::jsonb,
  videos jsonb not null default '[]'::jsonb,
  reports jsonb not null default '[]'::jsonb,
  admin_comments text not null default '',
  author_email text not null default '',
  created_at timestamptz not null default now()
);

-- 9. Project Payments
create table if not exists public.project_payments (
  id uuid primary key default gen_random_uuid(),
  payment_ref text unique not null,
  registration_number text not null,
  quotation_number text not null default '',
  user_uid text not null default '',
  payment_stage text not null default 'advance',
  amount_inr int not null,
  amount_paise int not null default 0,
  razorpay_order_id text not null default '',
  razorpay_payment_id text not null default '',
  status text not null default 'verified',
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

-- 10. Project Invoices
create table if not exists public.project_invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text unique not null,
  registration_number text not null,
  doc_type text not null,
  amount_inr int not null,
  gst_inr int not null default 0,
  user_uid text not null default '',
  payload jsonb not null default '{}'::jsonb,
  issued_at timestamptz not null default now()
);

-- 11. Project Messages (Customer <-> Admin Clarifications & Replies)
create table if not exists public.project_messages (
  id uuid primary key default gen_random_uuid(),
  registration_number text not null references public.project_registrations(registration_number) on delete cascade,
  user_uid text not null,
  sender_email text not null,
  sender_name text not null,
  sender_role text not null default 'customer',
  message text not null,
  attachments jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

-- 12. Project Handover
create table if not exists public.project_handover (
  id uuid primary key default gen_random_uuid(),
  project_code text unique not null,
  registration_number text not null references public.project_registrations(registration_number) on delete cascade,
  handover_unlocked boolean not null default false,
  clearance_certificate_number text not null default '',
  completion_certificate_number text not null default '',
  acknowledged_at timestamptz,
  acknowledged_by text not null default '',
  deliverables jsonb not null default '[]'::jsonb,
  courier_tracking jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Enable RLS across all 12 project workflow tables
alter table public.customers enable row level security;
alter table public.project_registrations enable row level security;
alter table public.project_attachments enable row level security;
alter table public.project_reviews enable row level security;
alter table public.project_quotations enable row level security;
alter table public.project_cost_breakdown enable row level security;
alter table public.project_milestones enable row level security;
alter table public.project_updates enable row level security;
alter table public.project_payments enable row level security;
alter table public.project_invoices enable row level security;
alter table public.project_messages enable row level security;
alter table public.project_handover enable row level security;

-- Helper check compatible with existing NexusTekFusion admin roles
create or replace function public.is_ntf_project_admin()
returns boolean
language sql
stable
security definer
as $$
  select exists (
    select 1 from public.customer_profiles cp
    where cp.id = auth.uid()
      and cp.role in ('super_admin', 'admin', 'project_manager', 'engineer', 'accounts_manager')
  );
$$;

-- Customer own-row read/write policies & Admin full access policies
drop policy if exists "customers_own_or_admin" on public.customers;
create policy "customers_own_or_admin" on public.customers
  for all using (user_uid = auth.uid()::text or public.is_ntf_project_admin());

drop policy if exists "registrations_own_or_admin" on public.project_registrations;
create policy "registrations_own_or_admin" on public.project_registrations
  for all using (user_uid = auth.uid()::text or public.is_ntf_project_admin());

drop policy if exists "attachments_own_or_admin" on public.project_attachments;
create policy "attachments_own_or_admin" on public.project_attachments
  for all using (user_uid = auth.uid()::text or public.is_ntf_project_admin());

drop policy if exists "reviews_admin_only" on public.project_reviews;
create policy "reviews_admin_only" on public.project_reviews
  for all using (public.is_ntf_project_admin());

-- Customers must ONLY see published/non-Draft quotations
drop policy if exists "quotations_published_owner_or_admin" on public.project_quotations;
create policy "quotations_published_owner_or_admin" on public.project_quotations
  for select using (
    public.is_ntf_project_admin()
    or (
      status <> 'Draft'
      and approved_by_admin = true
      and exists (
        select 1 from public.project_registrations pr
        where pr.registration_number = project_quotations.registration_number
          and pr.user_uid = auth.uid()::text
      )
    )
  );

drop policy if exists "quotations_admin_write" on public.project_quotations;
create policy "quotations_admin_write" on public.project_quotations
  for all using (public.is_ntf_project_admin());

drop policy if exists "cost_breakdown_read" on public.project_cost_breakdown;
create policy "cost_breakdown_read" on public.project_cost_breakdown
  for select using (
    public.is_ntf_project_admin()
    or exists (
      select 1 from public.project_quotations pq
      join public.project_registrations pr on pr.registration_number = pq.registration_number
      where pq.quotation_number = project_cost_breakdown.quotation_number
        and pq.status <> 'Draft'
        and pq.approved_by_admin = true
        and pr.user_uid = auth.uid()::text
    )
  );

drop policy if exists "milestones_owner_or_admin" on public.project_milestones;
create policy "milestones_owner_or_admin" on public.project_milestones
  for select using (
    public.is_ntf_project_admin()
    or exists (
      select 1 from public.project_registrations pr
      where pr.registration_number = project_milestones.registration_number
        and pr.user_uid = auth.uid()::text
    )
  );

drop policy if exists "updates_owner_or_admin" on public.project_updates;
create policy "updates_owner_or_admin" on public.project_updates
  for select using (
    public.is_ntf_project_admin()
    or exists (
      select 1 from public.project_registrations pr
      where pr.registration_number = project_updates.registration_number
        and pr.user_uid = auth.uid()::text
    )
  );

drop policy if exists "payments_owner_or_admin" on public.project_payments;
create policy "payments_owner_or_admin" on public.project_payments
  for select using (user_uid = auth.uid()::text or public.is_ntf_project_admin());

drop policy if exists "invoices_owner_or_admin" on public.project_invoices;
create policy "invoices_owner_or_admin" on public.project_invoices
  for select using (user_uid = auth.uid()::text or public.is_ntf_project_admin());

drop policy if exists "messages_owner_or_admin" on public.project_messages;
create policy "messages_owner_or_admin" on public.project_messages
  for all using (user_uid = auth.uid()::text or public.is_ntf_project_admin());

drop policy if exists "handover_owner_or_admin" on public.project_handover;
create policy "handover_owner_or_admin" on public.project_handover
  for select using (
    public.is_ntf_project_admin()
    or exists (
      select 1 from public.project_registrations pr
      where pr.registration_number = project_handover.registration_number
        and pr.user_uid = auth.uid()::text
    )
  );

-- Private bucket for project registrations, updates, and deliverable handover files
insert into storage.buckets (id, name, public)
values ('project-files', 'project-files', false)
on conflict (id) do nothing;
