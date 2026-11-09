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
