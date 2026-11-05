create extension if not exists pgcrypto;

create table if not exists public.song_orders (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'draft',
  recipient_name text not null,
  relationship text,
  occasion text not null,
  story text not null,
  mood text,
  style text,
  email text,
  paypal_order_id text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.song_assets (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.song_orders(id) on delete cascade,
  asset_type text not null default 'final',
  storage_bucket text not null default 'songs',
  storage_path text not null,
  mime_type text not null,
  duration_seconds numeric,
  provider text not null,
  model_id text not null,
  provider_job_id text,
  is_final boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists song_assets_order_id_idx
  on public.song_assets(order_id);

create index if not exists song_assets_provider_job_id_idx
  on public.song_assets(provider_job_id);

alter table public.song_orders enable row level security;
alter table public.song_assets enable row level security;

alter table public.song_orders add column if not exists paypal_order_id text;
alter table public.song_orders add column if not exists paid_at timestamptz;

insert into storage.buckets (id, name, public)
values ('songs', 'songs', false)
on conflict (id) do update set public = excluded.public;

-- User account and private library schema
begin;
alter table public.song_orders add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table public.song_orders add column if not exists title text;
alter table public.song_orders add column if not exists lyrics_text text;
alter table public.song_orders add column if not exists provider_job_id text;
alter table public.song_orders add column if not exists music_provider text;
alter table public.song_orders add column if not exists music_model text;
alter table public.song_orders add column if not exists generation_error text;
create index if not exists song_orders_user_created_idx on public.song_orders(user_id, created_at desc);
create index if not exists song_orders_paypal_order_idx on public.song_orders(paypal_order_id) where paypal_order_id is not null;

alter table public.song_orders enable row level security;
alter table public.song_assets enable row level security;
revoke all on public.song_orders, public.song_assets from anon;
revoke insert, update, delete on public.song_orders, public.song_assets from authenticated;
grant select on public.song_orders, public.song_assets to authenticated;
drop policy if exists "Owners can read their song orders" on public.song_orders;
create policy "Owners can read their song orders" on public.song_orders for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Owners can read their song assets" on public.song_assets;
create policy "Owners can read their song assets" on public.song_assets for select to authenticated using (exists (select 1 from public.song_orders o where o.id = song_assets.order_id and o.user_id = (select auth.uid())));

-- Only a verified Auth identity can recover guest orders with its exact email.
-- No email or owner ID is accepted from the caller.
create or replace function public.claim_my_songgift_orders() returns void
language sql security definer set search_path = '' as $$
  update public.song_orders set user_id = (select auth.uid()), updated_at = now()
  where user_id is null and exists (
    select 1 from auth.users u where u.id = (select auth.uid())
    and u.email_confirmed_at is not null and lower(trim(u.email)) = lower(trim(song_orders.email))
  );
$$;
revoke all on function public.claim_my_songgift_orders() from public, anon;
grant execute on function public.claim_my_songgift_orders() to authenticated;

-- Recover existing generation references without touching or moving audio.
update public.song_orders o set status = 'completed', provider_job_id = coalesce(o.provider_job_id, a.provider_job_id)
from (select distinct on (order_id) order_id, provider_job_id from public.song_assets where is_final = true order by order_id, created_at desc) a
where o.id = a.order_id and o.status <> 'completed';
commit;

-- Administrator access schema
begin;

-- Membership is never inferred from email, customer metadata or a JWT claim.
-- Bootstrap a verified Auth user explicitly with scripts/grant-admin-owner.mjs.
create table if not exists public.admin_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role = 'owner'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.admin_members enable row level security;
revoke all on table public.admin_members from public, anon, authenticated;
grant select, insert, update, delete on table public.admin_members to service_role;

-- There are deliberately no customer RLS policies or public grant functions.
-- This migration creates no owners and changes no existing order permissions.
commit;
-- Minimal durable audit for administrator-only audio link issuance.
-- No Owner grants, customer RLS changes, payment writes or historical backfill.
begin;
create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  actor_user_id uuid not null,
  action text not null check (action in ('audio.preview', 'audio.download')),
  target_type text not null check (target_type = 'song_asset'),
  target_id uuid not null,
  order_id uuid not null,
  result text not null check (result in ('requested', 'issued', 'failed')),
  created_at timestamptz not null default now()
);
-- Preserve audit identity even if an account, order or asset is later removed.
create index if not exists admin_audit_logs_order_created_idx
  on public.admin_audit_logs(order_id, created_at desc);
alter table public.admin_audit_logs enable row level security;
revoke all on table public.admin_audit_logs from public, anon, authenticated;
revoke all on table public.admin_audit_logs from service_role;
grant select, insert on table public.admin_audit_logs to service_role;
grant update (result) on table public.admin_audit_logs to service_role;
commit;
