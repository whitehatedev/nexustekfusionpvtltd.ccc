-- ============================================================================
-- KRASHIVANTRI & NEXUSTEKFUSION COMPLETE SUPABASE POSTGRESQL INTEGRATION SQL
-- Safe to re-run in Supabase SQL Editor (Idempotent)
-- Integrates:
--   1. KRASHIVANTRI Android App Core Schema (public.users, farmer_profiles,
--      pilot_profiles, orders, farm_boundaries, operator_locations)
--   2. Realtime Broadcasts & Row Level Security Policies
--   3. Web Platform Operational Schema (web_platform.*) without table-name
--      collisions against Android's public.users / public.orders
--   4. Unified Integration Views, Revenue Analytics & Sync Functions
-- ============================================================================

create extension if not exists "uuid-ossp";
create schema if not exists web_platform;

-- ============================================================================
-- PART 1: ANDROID APP CORE TABLES (public.*)
-- ============================================================================

create table if not exists public.users (
    id text primary key,
    phone text unique not null,
    name text not null,
    role text not null check (role in ('admin', 'pilot', 'farmer')),
    created_at bigint not null default (extract(epoch from now()) * 1000)::bigint
);

create table if not exists public.farmer_profiles (
    user_id text primary key references public.users(id) on delete cascade,
    farmer_id_number text not null,
    coins integer not null default 0
);

create table if not exists public.pilot_profiles (
    user_id text primary key references public.users(id) on delete cascade,
    drone_type text not null default 'quadcopter',
    tank_capacity double precision not null default 10,
    license_document_uri text not null default '',
    is_license_verified boolean not null default false,
    bank_upi_id text not null default '',
    wallet_balance double precision not null default 0,
    is_online boolean not null default false,
    rating_average double precision not null default 5.0,
    rating_count integer not null default 0,
    current_lat double precision,
    current_lng double precision,
    location_updated_at bigint not null default 0
);

create table if not exists public.orders (
    id text primary key,
    farmer_id text not null references public.users(id) on delete cascade,
    assigned_pilot_id text references public.users(id),
    field_polygon_coordinates jsonb not null,
    acres_to_spray double precision not null,
    location_address text not null,
    total_amount double precision not null,
    admin_commission double precision not null,
    pilot_earnings double precision not null,
    payment_method text not null check (payment_method in ('online', 'cash')),
    payment_status text not null check (payment_status in ('pending', 'paid')),
    order_status text not null check (order_status in ('pending', 'accepted', 'in_progress', 'completed', 'cancelled')),
    pilot_eta_minutes integer not null default 15,
    initial_eta_minutes integer not null default 15,
    distance_km double precision,
    field_center_lat double precision not null default 0,
    field_center_lng double precision not null default 0,
    accepted_at bigint,
    pilot_rating integer,
    razorpay_payment_id text,
    created_at bigint not null default (extract(epoch from now()) * 1000)::bigint
);

create index if not exists idx_orders_farmer on public.orders(farmer_id);
create index if not exists idx_orders_pilot on public.orders(assigned_pilot_id);
create index if not exists idx_orders_status on public.orders(order_status);
create index if not exists idx_orders_payment_status on public.orders(payment_status);

create table if not exists public.farm_boundaries (
    id uuid primary key default uuid_generate_v4(),
    farmer_id text not null,
    farm_name text not null,
    polygon_coordinates jsonb not null,
    area_acres numeric(10, 2) not null,
    area_hectares numeric(10, 2) not null,
    center_lat double precision not null,
    center_lng double precision not null,
    created_at timestamptz not null default now()
);

create index if not exists idx_farm_boundaries_farmer on public.farm_boundaries(farmer_id);

create table if not exists public.operator_locations (
    id text primary key,
    name text not null,
    role_type text not null check (role_type in ('drone_operator', 'drone_mitra')),
    lat double precision not null,
    lng double precision not null,
    drone_type text not null default 'quadcopter',
    is_available boolean not null default true,
    heading_degrees real not null default 0,
    updated_at timestamptz not null default now()
);

-- ============================================================================
-- PART 2: ROW LEVEL SECURITY & REALTIME PUBLICATION
-- ============================================================================

alter table public.users enable row level security;
alter table public.farmer_profiles enable row level security;
alter table public.pilot_profiles enable row level security;
alter table public.orders enable row level security;
alter table public.farm_boundaries enable row level security;
alter table public.operator_locations enable row level security;

drop policy if exists "Allow app user read/write" on public.users;
create policy "Allow app user read/write" on public.users for all using (true) with check (true);

drop policy if exists "Allow app farmer profile read/write" on public.farmer_profiles;
create policy "Allow app farmer profile read/write" on public.farmer_profiles for all using (true) with check (true);

drop policy if exists "Allow app pilot profile read/write" on public.pilot_profiles;
create policy "Allow app pilot profile read/write" on public.pilot_profiles for all using (true) with check (true);

drop policy if exists "Allow app order read/write" on public.orders;
create policy "Allow app order read/write" on public.orders for all using (true) with check (true);

drop policy if exists "Allow authenticated or anon farm boundary read/write" on public.farm_boundaries;
create policy "Allow authenticated or anon farm boundary read/write"
    on public.farm_boundaries for all using (true) with check (true);

drop policy if exists "Allow realtime operator location read/write" on public.operator_locations;
create policy "Allow realtime operator location read/write"
    on public.operator_locations for all using (true) with check (true);

do $$
begin
    alter publication supabase_realtime add table public.orders;
exception when duplicate_object then null;
end $$;

do $$
begin
    alter publication supabase_realtime add table public.operator_locations;
exception when duplicate_object then null;
end $$;

do $$
begin
    alter publication supabase_realtime add table public.farm_boundaries;
exception when duplicate_object then null;
end $$;

do $$
begin
    alter publication supabase_realtime add table public.pilot_profiles;
exception when duplicate_object then null;
end $$;

-- ============================================================================
-- PART 3: WEB PLATFORM & RAZORPAY BRIDGE TABLES (web_platform.*)
-- ============================================================================

create table if not exists web_platform.site_settings (
    id serial primary key,
    key text not null unique,
    value jsonb not null,
    updated_at timestamptz not null default now()
);

create table if not exists web_platform.android_web_order_links (
    id serial primary key,
    android_order_id text not null unique references public.orders(id) on delete cascade,
    web_booking_number text,
    razorpay_order_id text,
    razorpay_payment_id text,
    razorpay_signature text,
    payment_verified boolean not null default false,
    sync_source text not null default 'android_app',
    synced_at timestamptz not null default now()
);

create table if not exists web_platform.pilot_payout_requests (
    id uuid primary key default uuid_generate_v4(),
    pilot_user_id text not null references public.users(id) on delete cascade,
    amount_inr double precision not null check (amount_inr > 0),
    bank_upi_id text not null,
    utr_reference text not null default '',
    status text not null default 'pending' check (status in ('pending', 'processing', 'settled', 'rejected')),
    approved_by text not null default '',
    created_at timestamptz not null default now(),
    settled_at timestamptz
);

create table if not exists web_platform.razorpay_webhook_events (
    id serial primary key,
    event_id text not null unique,
    event_type text not null,
    razorpay_order_id text not null default '',
    razorpay_payment_id text not null default '',
    android_order_id text references public.orders(id) on delete set null,
    amount_paise integer not null default 0,
    payload jsonb not null default '{}'::jsonb,
    processed_at timestamptz not null default now()
);

-- ============================================================================
-- PART 4: TRIGGERS TO AUTO-KEEP OPERATOR LOCATIONS & WALLET BALANCES IN SYNC
-- ============================================================================

create or replace function public.fn_sync_pilot_to_operator_location()
returns trigger
language plpgsql
as $$
declare
    v_name text;
begin
    if new.current_lat is not null and new.current_lng is not null then
        select name into v_name from public.users where id = new.user_id limit 1;
        insert into public.operator_locations (
            id, name, role_type, lat, lng, drone_type, is_available, heading_degrees, updated_at
        )
        values (
            new.user_id,
            coalesce(v_name, 'KRASHIVANTRI Pilot'),
            'drone_operator',
            new.current_lat,
            new.current_lng,
            coalesce(new.drone_type, 'quadcopter'),
            coalesce(new.is_online, false),
            0,
            now()
        )
        on conflict (id) do update set
            name = excluded.name,
            lat = excluded.lat,
            lng = excluded.lng,
            drone_type = excluded.drone_type,
            is_available = excluded.is_available,
            updated_at = now();
    end if;
    return new;
end;
$$;

drop trigger if exists trg_sync_pilot_operator_location on public.pilot_profiles;
create trigger trg_sync_pilot_operator_location
after insert or update of current_lat, current_lng, is_online, drone_type
on public.pilot_profiles
for each row
execute function public.fn_sync_pilot_to_operator_location();

-- Auto-credit pilot wallet_balance when an order transitions to 'completed' and 'paid'
create or replace function public.fn_credit_pilot_wallet_on_completion()
returns trigger
language plpgsql
as $$
begin
    if new.order_status = 'completed'
       and new.payment_status = 'paid'
       and new.assigned_pilot_id is not null
       and (old.order_status is distinct from 'completed' or old.payment_status is distinct from 'paid') then
        update public.pilot_profiles
        set wallet_balance = coalesce(wallet_balance, 0) + coalesce(new.pilot_earnings, 0)
        where user_id = new.assigned_pilot_id;
    end if;
    return new;
end;
$$;

drop trigger if exists trg_credit_pilot_wallet_on_completion on public.orders;
create trigger trg_credit_pilot_wallet_on_completion
after update of order_status, payment_status
on public.orders
for each row
execute function public.fn_credit_pilot_wallet_on_completion();

-- ============================================================================
-- PART 5: UNIFIED REPORTING VIEWS FOR WEB ADMIN & ANDROID DASHBOARD
-- ============================================================================

create or replace view public.v_unified_krashivantri_orders as
select
    o.id as order_id,
    o.order_status,
    o.payment_method,
    o.payment_status,
    o.razorpay_payment_id,
    o.acres_to_spray,
    o.total_amount,
    o.admin_commission,
    o.pilot_earnings,
    o.location_address,
    o.field_center_lat,
    o.field_center_lng,
    o.field_polygon_coordinates,
    o.distance_km,
    o.pilot_eta_minutes,
    o.pilot_rating,
    to_timestamp(o.created_at / 1000.0) as created_timestamp,
    f.id as farmer_id,
    f.name as farmer_name,
    f.phone as farmer_phone,
    fp.farmer_id_number,
    fp.coins as farmer_coins,
    p.id as pilot_id,
    p.name as pilot_name,
    p.phone as pilot_phone,
    pp.drone_type,
    pp.tank_capacity,
    pp.is_license_verified as pilot_verified,
    pp.bank_upi_id as pilot_upi_id
from public.orders o
left join public.users f on f.id = o.farmer_id
left join public.farmer_profiles fp on fp.user_id = o.farmer_id
left join public.users p on p.id = o.assigned_pilot_id
left join public.pilot_profiles pp on pp.user_id = o.assigned_pilot_id;

create or replace view public.v_unified_krashivantri_pilots as
select
    u.id as user_id,
    u.name,
    u.phone,
    pp.drone_type,
    pp.tank_capacity,
    pp.license_document_uri,
    pp.is_license_verified,
    pp.bank_upi_id,
    pp.wallet_balance,
    pp.is_online,
    pp.rating_average,
    pp.rating_count,
    coalesce(ol.lat, pp.current_lat) as live_lat,
    coalesce(ol.lng, pp.current_lng) as live_lng,
    coalesce(ol.is_available, pp.is_online) as is_available,
    ol.role_type,
    ol.heading_degrees,
    ol.updated_at as operator_updated_at
from public.users u
join public.pilot_profiles pp on pp.user_id = u.id
left join public.operator_locations ol on ol.id = u.id
where u.role = 'pilot';

create or replace view public.v_krashivantri_finance_summary as
select
    count(*) as total_orders,
    count(*) filter (where order_status = 'pending') as pending_orders,
    count(*) filter (where order_status in ('accepted', 'in_progress')) as active_orders,
    count(*) filter (where order_status = 'completed') as completed_orders,
    coalesce(sum(total_amount), 0) as gross_order_value_inr,
    coalesce(sum(total_amount) filter (where payment_status = 'paid'), 0) as paid_collections_inr,
    coalesce(sum(admin_commission) filter (where payment_status = 'paid'), 0) as admin_commission_inr,
    coalesce(sum(pilot_earnings) filter (where payment_status = 'paid'), 0) as pilot_earnings_inr
from public.orders;

-- ============================================================================
-- PART 6: SAMPLE INTEGRATION QUERIES FOR COMMON OPERATIONS
-- ============================================================================

-- 1) Fetch live online pilots with UPI & GPS for dispatch:
--    select * from public.v_unified_krashivantri_pilots where is_online = true;

-- 2) Verify a pilot license from Web Admin:
--    update public.pilot_profiles set is_license_verified = true where user_id = '<pilot_user_id>';

-- 3) Record Razorpay payment on an Android order:
--    update public.orders
--    set payment_status = 'paid', razorpay_payment_id = '<pay_id>'
--    where id = '<order_id>';

-- 4) Assign nearest pilot to a pending order:
--    update public.orders
--    set assigned_pilot_id = '<pilot_user_id>', order_status = 'accepted',
--        accepted_at = (extract(epoch from now()) * 1000)::bigint
--    where id = '<order_id>';
