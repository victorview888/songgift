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
