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
