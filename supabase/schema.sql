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

-- Order operations foundation. Apply after permissions + audio audit migrations.
-- No historical amount inference, Owner grants, provider calls or Storage moves.
begin;
alter table public.song_orders add column if not exists quoted_amount_minor integer;
alter table public.song_orders add column if not exists currency text;
alter table public.song_orders add column if not exists price_version text;
alter table public.song_orders add column if not exists payment_environment text;
alter table public.song_orders add column if not exists quoted_at timestamptz;
alter table public.song_orders drop constraint if exists song_orders_quote_check;
alter table public.song_orders add constraint song_orders_quote_check check (
  (quoted_amount_minor is null and currency is null and price_version is null and payment_environment is null and quoted_at is null)
  or (quoted_amount_minor > 0 and currency = 'USD' and length(price_version) between 1 and 80
      and payment_environment in ('sandbox','live') and quoted_at is not null
      and quoted_amount_minor is not null and currency is not null and price_version is not null and payment_environment is not null)
);

create table if not exists public.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.song_orders(id),
  provider text not null check (provider = 'paypal'),
  environment text not null check (environment in ('sandbox','live')),
  transaction_type text not null check (transaction_type in ('capture','refund')),
  external_id text not null check (length(external_id) between 1 and 128),
  amount_minor integer not null check (amount_minor > 0),
  currency text not null check (currency = 'USD'),
  fee_minor integer check (fee_minor >= 0 and fee_minor <= amount_minor),
  status text not null default 'completed' check (status = 'completed'),
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (provider,environment,transaction_type,external_id)
);
create unique index if not exists payment_transactions_order_capture_idx
  on public.payment_transactions(order_id) where transaction_type = 'capture';
create index if not exists payment_transactions_order_time_idx on public.payment_transactions(order_id,occurred_at desc);

create table if not exists public.generation_jobs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.song_orders(id),
  submission_key uuid not null unique,
  attempt_no integer not null check (attempt_no > 0),
  environment text not null check (environment in ('production','test')),
  provider text not null check (provider in ('fal','musicapi','mureka_cn','google_lyria','mock')),
  model text not null check (length(model) between 1 and 200),
  provider_job_id text check (length(provider_job_id) between 1 and 2048),
  state text not null check (state in ('submitting','queued','processing','storing','completed','failed','needs_review')),
  poll_count integer not null default 0 check (poll_count >= 0),
  lease_token uuid,
  lease_expires_at timestamptz,
  next_check_at timestamptz,
  error_code text check (error_code in ('submission_unknown','provider_failed','query_failed','storage_failed')),
  final_asset_id uuid references public.song_assets(id),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (order_id,attempt_no),
  check ((lease_token is null) = (lease_expires_at is null)),
  check (state <> 'completed' or (final_asset_id is not null and completed_at is not null))
);
create unique index if not exists generation_jobs_active_order_idx on public.generation_jobs(order_id)
  where state in ('submitting','queued','processing','storing','needs_review');
create unique index if not exists generation_jobs_provider_reference_idx
  on public.generation_jobs(provider,environment,provider_job_id) where provider_job_id is not null;
create index if not exists generation_jobs_order_time_idx on public.generation_jobs(order_id,started_at desc);
alter table public.song_assets add column if not exists generation_job_id uuid references public.generation_jobs(id);
-- Legacy assets remain NULL and are not deduplicated or moved.
create unique index if not exists song_assets_job_final_idx on public.song_assets(generation_job_id)
  where generation_job_id is not null and is_final = true;

create table if not exists public.order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.song_orders(id),
  event_key text not null unique check (length(event_key) between 1 and 256),
  event_type text not null check (event_type in ('quote.created','payment.captured','generation.reserved','generation.bound','generation.state','generation.completed','admin.requested','admin.finished')),
  actor_type text not null check (actor_type in ('customer','admin','system')),
  actor_id uuid,
  check ((actor_type='system' and actor_id is null) or (actor_type in ('customer','admin') and actor_id is not null)),
  -- Only structured identifiers and codes; no arbitrary payload or free-form text.
  reference_id uuid,
  state text check (state in ('submitting','queued','processing','storing','completed','failed','needs_review','requested','succeeded')),
  created_at timestamptz not null default now()
);
create index if not exists order_events_order_time_idx on public.order_events(order_id,created_at desc);

alter table public.admin_audit_logs add column if not exists reason_code text;
alter table public.admin_audit_logs add column if not exists error_code text;
alter table public.admin_audit_logs add column if not exists completed_at timestamptz;
alter table public.admin_audit_logs drop constraint if exists admin_audit_logs_action_check;
alter table public.admin_audit_logs add constraint admin_audit_logs_action_check check (action in ('audio.preview','audio.download','payment.reconcile','generation.sync','generation.resume_storage'));
alter table public.admin_audit_logs drop constraint if exists admin_audit_logs_target_type_check;
alter table public.admin_audit_logs add constraint admin_audit_logs_target_type_check check (target_type in ('song_asset','song_order','generation_job'));
alter table public.admin_audit_logs drop constraint if exists admin_audit_logs_result_check;
alter table public.admin_audit_logs add constraint admin_audit_logs_result_check check (result in ('requested','issued','failed','succeeded','needs_review'));
alter table public.admin_audit_logs drop constraint if exists admin_audit_logs_reason_code_check;
alter table public.admin_audit_logs add constraint admin_audit_logs_reason_code_check check (reason_code in ('manual_check','recover_delivery'));
alter table public.admin_audit_logs drop constraint if exists admin_audit_logs_error_code_check;
alter table public.admin_audit_logs add constraint admin_audit_logs_error_code_check check (error_code in ('unavailable','conflict','unverified','provider_failed','storage_failed'));

alter table public.payment_transactions enable row level security;
alter table public.generation_jobs enable row level security;
alter table public.order_events enable row level security;
revoke all on public.payment_transactions,public.generation_jobs,public.order_events from public,anon,authenticated,service_role;
grant select,insert on public.payment_transactions,public.order_events to service_role;
grant select,insert,update on public.generation_jobs to service_role;
grant update (result,error_code,completed_at) on public.admin_audit_logs to service_role;

create or replace function public.songgift_freeze_quote() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.quoted_at is not null and
    (new.quoted_amount_minor,new.currency,new.price_version,new.payment_environment,new.quoted_at)
      is distinct from (old.quoted_amount_minor,old.currency,old.price_version,old.payment_environment,old.quoted_at)
  then raise exception 'quote_immutable'; end if;
  return new;
end $$;
drop trigger if exists songgift_freeze_quote on public.song_orders;
create trigger songgift_freeze_quote before update on public.song_orders for each row execute function public.songgift_freeze_quote();

create or replace function public.songgift_freeze_job_identity() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (new.order_id,new.submission_key,new.attempt_no,new.environment,new.provider,new.model,new.started_at)
    is distinct from (old.order_id,old.submission_key,old.attempt_no,old.environment,old.provider,old.model,old.started_at)
    or (old.provider_job_id is not null and new.provider_job_id is distinct from old.provider_job_id)
  then raise exception 'job_identity_immutable'; end if;
  return new;
end $$;
drop trigger if exists songgift_freeze_job_identity on public.generation_jobs;
create trigger songgift_freeze_job_identity before update on public.generation_jobs for each row execute function public.songgift_freeze_job_identity();
create or replace function public.songgift_check_asset_job() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.generation_job_id is not null and not exists(select 1 from public.generation_jobs where id=new.generation_job_id and order_id=new.order_id) then raise exception 'asset_mismatch'; end if;
  return new;
end $$;
drop trigger if exists songgift_check_asset_job on public.song_assets;
create trigger songgift_check_asset_job before insert or update on public.song_assets for each row execute function public.songgift_check_asset_job();

create or replace function public.prepare_songgift_checkout(p_order_id uuid,p_user_id uuid,p_amount_minor integer,p_environment text,p_price_version text)
returns public.song_orders language plpgsql set search_path = '' as $$
declare o public.song_orders;
begin
  select * into o from public.song_orders where id=p_order_id and user_id=p_user_id for update;
  if not found then raise exception 'order_not_found'; end if;
  if o.quoted_at is not null then return o; end if;
  if o.paypal_order_id is not null or o.paid_at is not null then raise exception 'legacy_payment_needs_review'; end if;
  if o.status in ('generating','failed','completed') or o.provider_job_id is not null or exists(select 1 from public.song_assets where order_id=o.id and is_final) then raise exception 'generation_needs_review'; end if;
  if o.lyrics_text is null or length(trim(o.lyrics_text))=0 then raise exception 'lyrics_required'; end if;
  update public.song_orders set quoted_amount_minor=p_amount_minor,currency='USD',payment_environment=p_environment,
    price_version=p_price_version,quoted_at=now(),updated_at=now() where id=o.id returning * into o;
  insert into public.order_events(order_id,event_key,event_type,actor_type,actor_id)
    values(o.id,'quote:'||o.id,'quote.created','customer',p_user_id);
  return o;
end $$;

create or replace function public.record_songgift_capture(p_order_id uuid,p_user_id uuid,p_paypal_order_id text,p_capture_id text,p_environment text,p_amount_minor integer,p_currency text,p_occurred_at timestamptz)
returns public.payment_transactions language plpgsql set search_path = '' as $$
declare o public.song_orders; t public.payment_transactions;
begin
  select * into o from public.song_orders where id=p_order_id and user_id=p_user_id for update;
  if not found then raise exception 'order_not_found'; end if;
  if o.quoted_at is null then raise exception 'legacy_payment_needs_review'; end if;
  if o.paypal_order_id is distinct from p_paypal_order_id or o.payment_environment is distinct from p_environment
    or o.quoted_amount_minor is distinct from p_amount_minor or o.currency is distinct from p_currency then raise exception 'payment_mismatch'; end if;
  insert into public.payment_transactions(order_id,provider,environment,transaction_type,external_id,amount_minor,currency,occurred_at)
    values(o.id,'paypal',p_environment,'capture',p_capture_id,p_amount_minor,p_currency,p_occurred_at)
    on conflict (provider,environment,transaction_type,external_id) do nothing;
  select * into t from public.payment_transactions where provider='paypal' and environment=p_environment and transaction_type='capture' and external_id=p_capture_id;
  if t.order_id is distinct from o.id or t.amount_minor is distinct from p_amount_minor or t.currency is distinct from p_currency then raise exception 'capture_conflict'; end if;
  update public.song_orders set paid_at=coalesce(paid_at,p_occurred_at),
    status=case when paid_at is null and status in ('draft','lyrics_ready','paid') then 'paid' else status end,updated_at=case when paid_at is null then now() else updated_at end where id=o.id;
  insert into public.order_events(order_id,event_key,event_type,actor_type,actor_id,reference_id)
    values(o.id,'capture:'||t.id,'payment.captured','customer',p_user_id,t.id) on conflict(event_key) do nothing;
  return t;
end $$;

create or replace function public.reserve_songgift_generation(p_order_id uuid,p_user_id uuid,p_request_id uuid,p_provider text,p_model text,p_environment text)
returns jsonb language plpgsql set search_path = '' as $$
declare o public.song_orders; j public.generation_jobs;
begin
  select * into o from public.song_orders where id=p_order_id and user_id=p_user_id for update;
  if not found then raise exception 'order_not_found'; end if;
  select * into j from public.generation_jobs where submission_key=p_request_id;
  if found then
    if (j.order_id,j.provider,j.model,j.environment) is distinct from (o.id,p_provider,p_model,p_environment) then raise exception 'submission_conflict'; end if;
    return jsonb_build_object('created',false,'job',to_jsonb(j)-'lease_token');
  end if;
  -- A lost reference or an expired submission must never cause another paid call.
  if o.provider_job_id is not null or o.status in ('generating','failed','completed') or exists(select 1 from public.generation_jobs where order_id=o.id)
    or exists(select 1 from public.song_assets where order_id=o.id and is_final) then raise exception 'generation_needs_review'; end if;
  if o.paid_at is null and not (p_provider='mock' and p_environment='test') then raise exception 'payment_required'; end if;
  if o.lyrics_text is null or length(trim(o.lyrics_text))=0 then raise exception 'lyrics_required'; end if;
  insert into public.generation_jobs(order_id,submission_key,attempt_no,provider,model,environment,state,lease_token,lease_expires_at)
    values(o.id,p_request_id,1,p_provider,p_model,p_environment,'submitting',gen_random_uuid(),now()+interval '90 seconds') returning * into j;
  update public.song_orders set status='generating',generation_error=null,music_provider=p_provider,music_model=p_model,updated_at=now() where id=o.id;
  insert into public.order_events(order_id,event_key,event_type,actor_type,actor_id,reference_id,state)
    values(o.id,'reserve:'||j.id,'generation.reserved','customer',p_user_id,j.id,'submitting');
  return jsonb_build_object('created',true,'job',to_jsonb(j));
end $$;

create or replace function public.bind_songgift_generation(p_job_id uuid,p_lease_token uuid,p_provider_job_id text,p_state text)
returns public.generation_jobs language plpgsql set search_path = '' as $$
declare j public.generation_jobs;
begin
  select * into j from public.generation_jobs where id=p_job_id for update;
  if not found then raise exception 'job_not_found'; end if;
  if j.state<>'submitting' or p_lease_token is null or j.lease_token is distinct from p_lease_token or j.lease_expires_at is null or j.lease_expires_at<=now() then raise exception 'stale_lease'; end if;
  if p_state not in ('queued','processing','storing') or (p_provider_job_id is null and p_state<>'storing') then raise exception 'invalid_state'; end if;
  update public.generation_jobs set provider_job_id=p_provider_job_id,state=p_state,
    lease_token=case when p_state='storing' then lease_token end,
    lease_expires_at=case when p_state='storing' then lease_expires_at end,updated_at=now() where id=j.id returning * into j;
  update public.song_orders set provider_job_id=p_provider_job_id,updated_at=now() where id=j.order_id;
  insert into public.order_events(order_id,event_key,event_type,actor_type,reference_id,state)
    values(j.order_id,'bound:'||j.id,'generation.bound','system',j.id,p_state);
  return j;
end $$;

create or replace function public.claim_songgift_job(p_job_id uuid)
returns public.generation_jobs language plpgsql set search_path = '' as $$
declare j public.generation_jobs;
begin
  select * into j from public.generation_jobs where id=p_job_id for update;
  if not found then raise exception 'job_not_found'; end if;
  if j.lease_expires_at>now() then raise exception 'job_busy'; end if;
  if j.state='submitting' then
    update public.generation_jobs set state='needs_review',error_code='submission_unknown',lease_token=null,lease_expires_at=null,updated_at=now() where id=j.id returning * into j;
    insert into public.order_events(order_id,event_key,event_type,actor_type,reference_id,state)
      values(j.order_id,'unknown:'||j.id,'generation.state','system',j.id,'needs_review') on conflict(event_key) do nothing;
    return j;
  end if;
  if j.state not in ('queued','processing','storing','needs_review') or (j.provider_job_id is null and j.state<>'storing') then raise exception 'job_not_recoverable'; end if;
  update public.generation_jobs set lease_token=gen_random_uuid(),lease_expires_at=now()+interval '90 seconds',poll_count=poll_count+1,updated_at=now() where id=j.id returning * into j;
  return j;
end $$;

create or replace function public.settle_songgift_job(p_job_id uuid,p_lease_token uuid,p_state text,p_error_code text)
returns public.generation_jobs language plpgsql set search_path = '' as $$
declare j public.generation_jobs;
begin
  select * into j from public.generation_jobs where id=p_job_id for update;
  if not found then raise exception 'job_not_found'; end if;
  if j.lease_token is distinct from p_lease_token or p_lease_token is null or j.lease_expires_at<=now() then raise exception 'stale_lease'; end if;
  if p_state not in ('queued','processing','storing','failed','needs_review') then raise exception 'invalid_state'; end if;
  if j.state='storing' and p_state not in ('storing','needs_review') then raise exception 'storage_must_resume'; end if;
  if p_error_code='storage_failed' and p_state<>'storing' then raise exception 'storage_must_resume'; end if;
  update public.generation_jobs set state=p_state,error_code=p_error_code,lease_token=null,lease_expires_at=null,
    next_check_at=case when p_state in ('queued','processing','storing') then now()+interval '30 seconds' end,updated_at=now() where id=j.id returning * into j;
  insert into public.order_events(order_id,event_key,event_type,actor_type,reference_id,state)
    values(j.order_id,'state:'||p_lease_token,'generation.state','system',j.id,p_state);
  return j;
end $$;

create or replace function public.finish_songgift_generation(p_job_id uuid,p_lease_token uuid,p_asset_id uuid)
returns public.generation_jobs language plpgsql set search_path = '' as $$
declare j public.generation_jobs;
begin
  select * into j from public.generation_jobs where id=p_job_id for update;
  if not found then raise exception 'job_not_found'; end if;
  if j.state='completed' and j.final_asset_id=p_asset_id then return j; end if;
  if j.state<>'storing' or j.lease_token is distinct from p_lease_token or p_lease_token is null or j.lease_expires_at<=now() then raise exception 'stale_lease'; end if;
  if not exists(select 1 from public.song_assets where id=p_asset_id and order_id=j.order_id and generation_job_id=j.id and is_final=true) then raise exception 'asset_mismatch'; end if;
  update public.generation_jobs set state='completed',final_asset_id=p_asset_id,completed_at=now(),error_code=null,
    lease_token=null,lease_expires_at=null,next_check_at=null,updated_at=now() where id=j.id returning * into j;
  update public.song_orders set status='completed',generation_error=null,updated_at=now() where id=j.order_id;
  insert into public.order_events(order_id,event_key,event_type,actor_type,reference_id,state)
    values(j.order_id,'completed:'||j.id,'generation.completed','system',j.id,'completed');
  return j;
end $$;

create or replace function public.begin_songgift_admin_operation(p_request_id uuid,p_actor_id uuid,p_action text,p_order_id uuid,p_target_id uuid,p_reason_code text)
returns jsonb language plpgsql set search_path = '' as $$
declare a public.admin_audit_logs; target_type text; created boolean;
begin
  if not exists(select 1 from public.admin_members where user_id=p_actor_id and active and role='owner') then raise exception 'admin_denied'; end if;
  if p_reason_code is null or p_reason_code not in ('manual_check','recover_delivery') then raise exception 'reason_required'; end if;
  if p_action='payment.reconcile' then
    target_type:='song_order';
    if p_target_id is distinct from p_order_id or not exists(select 1 from public.song_orders where id=p_order_id) then raise exception 'target_mismatch'; end if;
  elsif p_action in ('generation.sync','generation.resume_storage') then
    target_type:='generation_job';
    if not exists(select 1 from public.generation_jobs where id=p_target_id and order_id=p_order_id) then raise exception 'target_mismatch'; end if;
  else raise exception 'invalid_action'; end if;
  insert into public.admin_audit_logs(request_id,actor_user_id,action,target_type,target_id,order_id,reason_code,result)
    values(p_request_id,p_actor_id,p_action,target_type,p_target_id,p_order_id,p_reason_code,'requested') on conflict(request_id) do nothing returning * into a;
  created:=found;
  if not created then select * into a from public.admin_audit_logs where request_id=p_request_id; end if;
  if (a.actor_user_id,a.action,a.target_id,a.order_id,a.reason_code) is distinct from (p_actor_id,p_action,p_target_id,p_order_id,p_reason_code) then raise exception 'operation_conflict'; end if;
  insert into public.order_events(order_id,event_key,event_type,actor_type,actor_id,reference_id,state)
    values(p_order_id,'admin-start:'||p_request_id,'admin.requested','admin',p_actor_id,a.id,'requested') on conflict(event_key) do nothing;
  return jsonb_build_object('created',created,'operation',to_jsonb(a));
end $$;

create or replace function public.finish_songgift_admin_operation(p_request_id uuid,p_actor_id uuid,p_result text,p_error_code text)
returns public.admin_audit_logs language plpgsql set search_path = '' as $$
declare a public.admin_audit_logs;
begin
  if p_result not in ('succeeded','failed','needs_review') then raise exception 'invalid_result'; end if;
  select * into a from public.admin_audit_logs where request_id=p_request_id and actor_user_id=p_actor_id for update;
  if not found or a.action not in ('payment.reconcile','generation.sync','generation.resume_storage') then raise exception 'operation_not_found'; end if;
  if a.result<>'requested' then
    if a.result=p_result and a.error_code is not distinct from p_error_code then return a; end if;
    raise exception 'operation_already_finished';
  end if;
  update public.admin_audit_logs set result=p_result,error_code=p_error_code,completed_at=now() where id=a.id returning * into a;
  insert into public.order_events(order_id,event_key,event_type,actor_type,actor_id,reference_id,state)
    values(a.order_id,'admin-finish:'||p_request_id,'admin.finished','admin',p_actor_id,a.id,p_result);
  return a;
end $$;

-- Explicit service-only execution, including deployments with permissive defaults.
revoke all on function public.songgift_freeze_job_identity() from public,anon,authenticated;
revoke all on function public.songgift_check_asset_job() from public,anon,authenticated;
revoke all on function public.songgift_freeze_quote() from public,anon,authenticated;
revoke all on function public.prepare_songgift_checkout(uuid,uuid,integer,text,text) from public,anon,authenticated;
revoke all on function public.record_songgift_capture(uuid,uuid,text,text,text,integer,text,timestamptz) from public,anon,authenticated;
revoke all on function public.reserve_songgift_generation(uuid,uuid,uuid,text,text,text) from public,anon,authenticated;
revoke all on function public.bind_songgift_generation(uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function public.claim_songgift_job(uuid) from public,anon,authenticated;
revoke all on function public.settle_songgift_job(uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function public.finish_songgift_generation(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.begin_songgift_admin_operation(uuid,uuid,text,uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.finish_songgift_admin_operation(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.prepare_songgift_checkout(uuid,uuid,integer,text,text),
  public.record_songgift_capture(uuid,uuid,text,text,text,integer,text,timestamptz),
  public.reserve_songgift_generation(uuid,uuid,uuid,text,text,text),
  public.bind_songgift_generation(uuid,uuid,text,text),public.claim_songgift_job(uuid),
  public.settle_songgift_job(uuid,uuid,text,text),public.finish_songgift_generation(uuid,uuid,uuid),
  public.begin_songgift_admin_operation(uuid,uuid,text,uuid,uuid,text),
  public.finish_songgift_admin_operation(uuid,uuid,text,text) to service_role;
commit;

-- Connect customer checkout/generation to the operations foundation.
-- Apply after 20261105_order_operations.sql. No historical inference or paid calls.
begin;
alter table public.song_orders add column if not exists active_generation_job_id uuid references public.generation_jobs(id);
alter table public.generation_jobs add column if not exists input_snapshot jsonb;
alter table public.generation_jobs drop constraint if exists generation_jobs_input_snapshot_check;
alter table public.generation_jobs add constraint generation_jobs_input_snapshot_check
  check (input_snapshot is null or jsonb_typeof(input_snapshot)='object');

-- Temporary, service-only recovery source. Never included in public/admin DTOs.
-- Base64 is needed for synchronous providers with no retrievable external job.
create table if not exists public.generation_job_outputs (
  job_id uuid primary key references public.generation_jobs(id),
  audio_url text,
  audio_base64 text,
  mime_type text not null check (mime_type in ('audio/mpeg','audio/wav','audio/ogg','audio/flac','audio/mp4')),
  created_at timestamptz not null default now(),
  check ((audio_url is not null)::integer + (audio_base64 is not null)::integer = 1),
  check (audio_url is null or (audio_url like 'https://%' and length(audio_url)<=8192)),
  check (audio_base64 is null or length(audio_base64) between 1 and 44739244)
);
alter table public.generation_job_outputs enable row level security;
revoke all on public.generation_job_outputs from public,anon,authenticated,service_role;
grant select,insert,delete on public.generation_job_outputs to service_role;
grant update (audio_url) on public.generation_job_outputs to service_role;

create or replace function public.bind_songgift_checkout(p_order_id uuid,p_user_id uuid,p_paypal_order_id text)
returns public.song_orders language plpgsql set search_path = '' as $$
declare o public.song_orders;
begin
  select * into o from public.song_orders where id=p_order_id and user_id=p_user_id for update;
  if not found then raise exception 'order_not_found'; end if;
  if o.quoted_at is null then raise exception 'legacy_payment_needs_review'; end if;
  if p_paypal_order_id is null or length(p_paypal_order_id) not between 1 and 128 then raise exception 'payment_mismatch'; end if;
  if o.paypal_order_id is not null and o.paypal_order_id is distinct from p_paypal_order_id then raise exception 'payment_mismatch'; end if;
  if o.paypal_order_id is null then
    if o.paid_at is not null then raise exception 'payment_mismatch'; end if;
    update public.song_orders set paypal_order_id=p_paypal_order_id,updated_at=now() where id=o.id returning * into o;
  end if;
  return o;
end $$;

create or replace function public.songgift_freeze_job_identity() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (new.order_id,new.submission_key,new.attempt_no,new.environment,new.provider,new.model,new.started_at,new.input_snapshot)
    is distinct from (old.order_id,old.submission_key,old.attempt_no,old.environment,old.provider,old.model,old.started_at,old.input_snapshot)
    or (old.provider_job_id is not null and new.provider_job_id is distinct from old.provider_job_id)
  then raise exception 'job_identity_immutable'; end if;
  return new;
end $$;

create or replace function public.songgift_freeze_generation_input() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.active_generation_job_id is not null and
    (new.recipient_name,new.occasion,new.story,new.mood,new.style,new.lyrics_text,new.active_generation_job_id)
    is distinct from (old.recipient_name,old.occasion,old.story,old.mood,old.style,old.lyrics_text,old.active_generation_job_id)
  then raise exception 'generation_input_immutable'; end if;
  return new;
end $$;
drop trigger if exists songgift_freeze_generation_input on public.song_orders;
create trigger songgift_freeze_generation_input before update on public.song_orders
  for each row execute function public.songgift_freeze_generation_input();

create or replace function public.reserve_songgift_generation(p_order_id uuid,p_user_id uuid,p_request_id uuid,p_provider text,p_model text,p_environment text)
returns jsonb language plpgsql set search_path = '' as $$
declare o public.song_orders; j public.generation_jobs;
begin
  select * into o from public.song_orders where id=p_order_id and user_id=p_user_id for update;
  if not found then raise exception 'order_not_found'; end if;
  select * into j from public.generation_jobs where submission_key=p_request_id;
  if found then
    if (j.order_id,j.provider,j.model,j.environment) is distinct from (o.id,p_provider,p_model,p_environment) then raise exception 'submission_conflict'; end if;
    return jsonb_build_object('created',false,'job',to_jsonb(j)-'lease_token');
  end if;
  if o.provider_job_id is not null or o.status in ('generating','failed','completed') or exists(select 1 from public.generation_jobs where order_id=o.id)
    or exists(select 1 from public.song_assets where order_id=o.id and is_final) then raise exception 'generation_needs_review'; end if;
  if o.paid_at is null and not (p_provider='mock' and p_environment='test') then raise exception 'payment_required'; end if;
  if p_provider<>'mock' and (o.quoted_at is null or not exists(select 1 from public.payment_transactions t where t.order_id=o.id and t.transaction_type='capture' and t.amount_minor=o.quoted_amount_minor and t.currency=o.currency and t.environment=o.payment_environment)) then raise exception 'legacy_payment_needs_review'; end if;
  if o.lyrics_text is null or length(trim(o.lyrics_text))=0 then raise exception 'lyrics_required'; end if;
  insert into public.generation_jobs(order_id,submission_key,attempt_no,provider,model,environment,state,lease_token,lease_expires_at,input_snapshot)
    values(o.id,p_request_id,1,p_provider,p_model,p_environment,'submitting',gen_random_uuid(),now()+interval '90 seconds',
      jsonb_build_object('orderId',o.id,'recipientName',o.recipient_name,'occasion',o.occasion,'story',o.story,'mood',coalesce(o.mood,''),'style',coalesce(o.style,''),'lyricsText',o.lyrics_text))
    returning * into j;
  update public.song_orders set status='generating',generation_error=null,music_provider=p_provider,music_model=p_model,active_generation_job_id=j.id,updated_at=now() where id=o.id;
  insert into public.order_events(order_id,event_key,event_type,actor_type,actor_id,reference_id,state)
    values(o.id,'reserve:'||j.id,'generation.reserved','customer',p_user_id,j.id,'submitting');
  return jsonb_build_object('created',true,'job',to_jsonb(j));
end $$;

create or replace function public.bind_songgift_generation(p_job_id uuid,p_lease_token uuid,p_provider_job_id text,p_state text)
returns public.generation_jobs language plpgsql set search_path = '' as $$
declare j public.generation_jobs;
begin
  select * into j from public.generation_jobs where id=p_job_id for update;
  if not found then raise exception 'job_not_found'; end if;
  if j.state<>'submitting' or p_lease_token is null or j.lease_token is distinct from p_lease_token or j.lease_expires_at is null or j.lease_expires_at<=now() then raise exception 'stale_lease'; end if;
  if p_state not in ('queued','processing','storing') or (p_provider_job_id is null and p_state<>'storing') then raise exception 'invalid_state'; end if;
  update public.generation_jobs set provider_job_id=p_provider_job_id,state=p_state,
    lease_token=lease_token,
    lease_expires_at=lease_expires_at,updated_at=now() where id=j.id returning * into j;
  update public.song_orders set provider_job_id=p_provider_job_id,updated_at=now() where id=j.order_id;
  insert into public.order_events(order_id,event_key,event_type,actor_type,reference_id,state)
    values(j.order_id,'bound:'||j.id,'generation.bound','system',j.id,p_state);
  return j;
end $$;

create or replace function public.claim_songgift_job(p_job_id uuid)
returns public.generation_jobs language plpgsql set search_path = '' as $$
declare j public.generation_jobs;
begin
  select * into j from public.generation_jobs where id=p_job_id for update;
  if not found then raise exception 'job_not_found'; end if;
  if j.lease_expires_at>now() then raise exception 'job_busy'; end if;
  if j.state='submitting' then
    update public.generation_jobs set state='needs_review',error_code='submission_unknown',lease_token=null,lease_expires_at=null,updated_at=now() where id=j.id returning * into j;
    insert into public.order_events(order_id,event_key,event_type,actor_type,reference_id,state)
      values(j.order_id,'unknown:'||j.id,'generation.state','system',j.id,'needs_review') on conflict(event_key) do nothing;
    update public.song_orders set generation_error='Song submission needs verification.',updated_at=now() where id=j.order_id;
    return j;
  end if;
  if j.state not in ('queued','processing','storing','needs_review') or (j.provider_job_id is null and j.state<>'storing') then raise exception 'job_not_recoverable'; end if;
  update public.generation_jobs set lease_token=gen_random_uuid(),lease_expires_at=now()+interval '90 seconds',poll_count=poll_count+1,updated_at=now() where id=j.id returning * into j;
  return j;
end $$;

create or replace function public.cache_songgift_job_output(p_job_id uuid,p_lease_token uuid,p_audio_url text,p_audio_base64 text,p_mime_type text)
returns public.generation_jobs language plpgsql set search_path = '' as $$
declare j public.generation_jobs; output public.generation_job_outputs;
begin
  select * into j from public.generation_jobs where id=p_job_id for update;
  if not found then raise exception 'job_not_found'; end if;
  if p_lease_token is null or j.lease_token is distinct from p_lease_token or j.lease_expires_at is null or j.lease_expires_at<=now()
    or j.state not in ('submitting','queued','processing','storing','needs_review') then raise exception 'stale_lease'; end if;
  insert into public.generation_job_outputs(job_id,audio_url,audio_base64,mime_type)
    values(j.id,p_audio_url,p_audio_base64,p_mime_type) on conflict(job_id) do nothing;
  select * into output from public.generation_job_outputs where job_id=j.id;
  -- A fresh result read for the same external job can renew an expired URL.
  if output.audio_url is not null and p_audio_url is not null and p_audio_base64 is null
    and output.mime_type=p_mime_type and j.provider_job_id is not null then
    update public.generation_job_outputs set audio_url=p_audio_url where job_id=j.id returning * into output;
  end if;
  if (output.audio_url,output.audio_base64,output.mime_type) is distinct from (p_audio_url,p_audio_base64,p_mime_type)
    then raise exception 'output_conflict'; end if;
  update public.generation_jobs set state='storing',error_code=null,updated_at=now() where id=j.id returning * into j;
  return j;
end $$;

create or replace function public.settle_songgift_job(p_job_id uuid,p_lease_token uuid,p_state text,p_error_code text)
returns public.generation_jobs language plpgsql set search_path = '' as $$
declare j public.generation_jobs;
begin
  select * into j from public.generation_jobs where id=p_job_id for update;
  if not found then raise exception 'job_not_found'; end if;
  if j.lease_token is distinct from p_lease_token or p_lease_token is null or j.lease_expires_at is null or j.lease_expires_at<=now() then raise exception 'stale_lease'; end if;
  if p_state not in ('queued','processing','storing','failed','needs_review') then raise exception 'invalid_state'; end if;
  if j.state='storing' and p_state not in ('storing','needs_review') then raise exception 'storage_must_resume'; end if;
  if p_error_code='storage_failed' and p_state<>'storing' then raise exception 'storage_must_resume'; end if;
  update public.generation_jobs set state=p_state,error_code=p_error_code,lease_token=null,lease_expires_at=null,
    completed_at=case when p_state='failed' then now() else completed_at end,
    next_check_at=case when p_state in ('queued','processing','storing') then now()+interval '30 seconds' end,updated_at=now() where id=j.id returning * into j;
  update public.song_orders set status=case when p_state='failed' then 'failed' else 'generating' end,
    generation_error=case when p_error_code is not null or p_state='needs_review' then 'Song processing needs attention.' else null end,updated_at=now() where id=j.order_id;
  insert into public.order_events(order_id,event_key,event_type,actor_type,reference_id,state)
    values(j.order_id,'state:'||p_lease_token,'generation.state','system',j.id,p_state);
  return j;
end $$;

create or replace function public.finish_songgift_generation(p_job_id uuid,p_lease_token uuid,p_asset_id uuid)
returns public.generation_jobs language plpgsql set search_path = '' as $$
declare j public.generation_jobs;
begin
  select * into j from public.generation_jobs where id=p_job_id for update;
  if not found then raise exception 'job_not_found'; end if;
  if j.state='completed' and j.final_asset_id=p_asset_id then return j; end if;
  if j.state<>'storing' or j.lease_token is distinct from p_lease_token or p_lease_token is null or j.lease_expires_at is null or j.lease_expires_at<=now() then raise exception 'stale_lease'; end if;
  if not exists(select 1 from public.song_assets where id=p_asset_id and order_id=j.order_id and generation_job_id=j.id and is_final=true) then raise exception 'asset_mismatch'; end if;
  update public.generation_jobs set state='completed',final_asset_id=p_asset_id,completed_at=now(),error_code=null,
    lease_token=null,lease_expires_at=null,next_check_at=null,updated_at=now() where id=j.id returning * into j;
  update public.song_orders set status='completed',generation_error=null,updated_at=now() where id=j.order_id;
  delete from public.generation_job_outputs where job_id=j.id;
  insert into public.order_events(order_id,event_key,event_type,actor_type,reference_id,state)
    values(j.order_id,'completed:'||j.id,'generation.completed','system',j.id,'completed');
  return j;
end $$;

revoke all on function public.bind_songgift_checkout(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.cache_songgift_job_output(uuid,uuid,text,text,text) from public,anon,authenticated;
revoke all on function public.songgift_freeze_generation_input() from public,anon,authenticated;
grant execute on function public.bind_songgift_checkout(uuid,uuid,text),public.cache_songgift_job_output(uuid,uuid,text,text,text) to service_role;

-- Register durable audio and finish together: no customer-visible partial asset.
create or replace function public.complete_songgift_audio(p_job_id uuid,p_lease_token uuid,p_asset_id uuid,p_storage_bucket text,p_storage_path text,p_mime_type text)
returns public.generation_jobs language plpgsql set search_path = '' as $$
declare j public.generation_jobs; a public.song_assets;
begin
  select * into j from public.generation_jobs where id=p_job_id for update;
  if not found then raise exception 'job_not_found'; end if;
  if j.state='completed' then return j; end if;
  if j.state<>'storing' or p_lease_token is null or j.lease_token is distinct from p_lease_token or j.lease_expires_at is null or j.lease_expires_at<=now() then raise exception 'stale_lease'; end if;
  if p_storage_path is distinct from (j.order_id::text||'/'||j.id::text||'/final.'||
    case p_mime_type when 'audio/wav' then 'wav' when 'audio/mpeg' then 'mp3' when 'audio/ogg' then 'ogg' when 'audio/flac' then 'flac' when 'audio/mp4' then 'm4a' else 'invalid' end)
    or p_storage_bucket is null or length(p_storage_bucket) not between 1 and 100 then raise exception 'asset_mismatch'; end if;
  select * into a from public.song_assets where generation_job_id=j.id and is_final;
  if found then
    if a.order_id is distinct from j.order_id or a.storage_bucket is distinct from p_storage_bucket or a.storage_path is distinct from p_storage_path or a.mime_type is distinct from p_mime_type then raise exception 'asset_mismatch'; end if;
  else
    insert into public.song_assets(id,order_id,generation_job_id,asset_type,storage_bucket,storage_path,mime_type,provider,model_id,provider_job_id,is_final)
      values(p_asset_id,j.order_id,j.id,'final',p_storage_bucket,p_storage_path,p_mime_type,j.provider,j.model,j.provider_job_id,true) returning * into a;
  end if;
  return public.finish_songgift_generation(j.id,p_lease_token,a.id);
end $$;
revoke all on function public.complete_songgift_audio(uuid,uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.complete_songgift_audio(uuid,uuid,uuid,text,text,text) to service_role;
commit;

-- T03/T04/T05: audited recovery, bounded automatic processing and song notices.
-- Apply after 20261106_customer_order_operations.sql. No historical email/send.
begin;
alter table public.generation_jobs add column if not exists automatic_checks integer not null default 0;
alter table public.generation_jobs add column if not exists recovery_failures integer not null default 0;
alter table public.generation_jobs add column if not exists automatic_paused_at timestamptz;
alter table public.generation_jobs add column if not exists last_checked_at timestamptz;
create index if not exists generation_jobs_due_idx on public.generation_jobs(next_check_at,started_at) where automatic_paused_at is null and state in ('submitting','queued','processing','storing','needs_review');

create table if not exists public.songgift_maintenance (
  id boolean primary key default true check(id),
  notification_cutoff timestamptz not null default now(),
  lease_token uuid,lease_expires_at timestamptz,
  last_started_at timestamptz,last_finished_at timestamptz,
  last_result text check(last_result in ('succeeded','failed')),
  jobs_processed integer not null default 0,mail_processed integer not null default 0,
  check((lease_token is null)=(lease_expires_at is null))
);
insert into public.songgift_maintenance(id) values(true) on conflict(id) do nothing;
alter table public.songgift_maintenance enable row level security;
revoke all on public.songgift_maintenance from public,anon,authenticated,service_role;
grant select,update on public.songgift_maintenance to service_role;

create table if not exists public.song_notification_outbox (
  id uuid primary key default gen_random_uuid(),
  dedupe_key text not null unique,
  job_id uuid not null unique references public.generation_jobs(id),
  order_id uuid not null references public.song_orders(id),user_id uuid,
  to_email text check(length(to_email) between 3 and 254),
  recipient_name text not null,
  template text not null default 'song-ready-v1' check(template='song-ready-v1'),
  status text not null default 'pending' check(status in ('pending','sending','sent','failed','needs_review','skipped')),
  attempts integer not null default 0 check(attempts between 0 and 5),
  next_attempt_at timestamptz not null default now(),first_attempt_at timestamptz,
  from_email text,site_origin text,
  lease_token uuid,lease_expires_at timestamptz,
  error_code text check(error_code in ('temporary','provider_rejected','provider_conflict','recipient_changed','attempts_exhausted','delivery_unknown')),
  provider_message_id text check(length(provider_message_id)<=256),
  created_at timestamptz not null default now(),sent_at timestamptz,
  check((lease_token is null)=(lease_expires_at is null)),
  check(status='skipped' or (user_id is not null and to_email is not null)),
  check(status<>'sent' or (sent_at is not null and provider_message_id is not null))
);
create index if not exists song_notification_outbox_due_idx on public.song_notification_outbox(next_attempt_at) where status in ('pending','sending');
alter table public.song_notification_outbox enable row level security;
revoke all on public.song_notification_outbox from public,anon,authenticated,service_role;
grant select,insert,update on public.song_notification_outbox to service_role;

create or replace function public.begin_songgift_maintenance()
returns jsonb language plpgsql set search_path='' as $$
declare r public.songgift_maintenance;
begin
  select * into r from public.songgift_maintenance where id for update;
  if r.lease_expires_at>now() then return jsonb_build_object('started',false);end if;
  update public.songgift_maintenance set lease_token=gen_random_uuid(),lease_expires_at=now()+interval '10 minutes',last_started_at=now() where id returning * into r;
  return jsonb_build_object('started',true,'lease_token',r.lease_token);
end $$;
create or replace function public.finish_songgift_maintenance(p_lease_token uuid,p_result text,p_jobs integer,p_mail integer)
returns boolean language plpgsql set search_path='' as $$
begin
  if p_result not in ('succeeded','failed') or p_jobs not between 0 and 3 or p_mail not between 0 and 5 then raise exception 'invalid_result';end if;
  update public.songgift_maintenance set lease_token=null,lease_expires_at=null,last_finished_at=now(),last_result=p_result,jobs_processed=p_jobs,mail_processed=p_mail where id and lease_token=p_lease_token and lease_expires_at>now();
  return found;
end $$;
create or replace function public.list_due_songgift_jobs(p_limit integer)
returns jsonb language sql set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'order_id',order_id)),'[]'::jsonb) from (
    select id,order_id from public.generation_jobs where automatic_paused_at is null and environment='production'
      and (lease_expires_at is null or lease_expires_at<=now()) and (next_check_at is null or next_check_at<=now())
      and (state in ('submitting','queued','processing','storing') or (state='needs_review' and error_code='query_failed' and provider_job_id is not null))
    order by coalesce(next_check_at,started_at),id limit least(greatest(p_limit,0),3)
  ) due;
$$;
create or replace function public.reserve_songgift_generation(p_order_id uuid,p_user_id uuid,p_request_id uuid,p_provider text,p_model text,p_environment text)
returns jsonb language plpgsql set search_path = '' as $$
declare o public.song_orders; j public.generation_jobs;
begin
  select * into o from public.song_orders where id=p_order_id and user_id=p_user_id for update;
  if not found then raise exception 'order_not_found'; end if;
  select * into j from public.generation_jobs where submission_key=p_request_id;
  if found then
    if (j.order_id,j.provider,j.model,j.environment) is distinct from (o.id,p_provider,p_model,p_environment) then raise exception 'submission_conflict'; end if;
    return jsonb_build_object('created',false,'job',to_jsonb(j)-'lease_token');
  end if;
  if o.provider_job_id is not null or o.status in ('generating','failed','completed') or exists(select 1 from public.generation_jobs where order_id=o.id)
    or exists(select 1 from public.song_assets where order_id=o.id and is_final) then raise exception 'generation_needs_review'; end if;
  if o.paid_at is null and not (p_provider='mock' and p_environment='test') then raise exception 'payment_required'; end if;
  if p_provider<>'mock' and (o.quoted_at is null or not exists(select 1 from public.payment_transactions t where t.order_id=o.id and t.transaction_type='capture' and t.amount_minor=o.quoted_amount_minor and t.currency=o.currency and t.environment=o.payment_environment)) then raise exception 'legacy_payment_needs_review'; end if;
  if o.lyrics_text is null or length(trim(o.lyrics_text))=0 then raise exception 'lyrics_required'; end if;
  insert into public.generation_jobs(order_id,submission_key,attempt_no,provider,model,environment,state,lease_token,lease_expires_at,input_snapshot)
    values(o.id,p_request_id,1,p_provider,p_model,p_environment,'submitting',gen_random_uuid(),now()+interval '5 minutes',
      jsonb_build_object('orderId',o.id,'recipientName',o.recipient_name,'occasion',o.occasion,'story',o.story,'mood',coalesce(o.mood,''),'style',coalesce(o.style,''),'lyricsText',o.lyrics_text))
    returning * into j;
  update public.song_orders set status='generating',generation_error=null,music_provider=p_provider,music_model=p_model,active_generation_job_id=j.id,updated_at=now() where id=o.id;
  insert into public.order_events(order_id,event_key,event_type,actor_type,actor_id,reference_id,state)
    values(o.id,'reserve:'||j.id,'generation.reserved','customer',p_user_id,j.id,'submitting');
  return jsonb_build_object('created',true,'job',to_jsonb(j));
end $$;

create or replace function public.claim_songgift_job(p_job_id uuid)
returns public.generation_jobs language plpgsql set search_path = '' as $$
declare j public.generation_jobs;
begin
  select * into j from public.generation_jobs where id=p_job_id for update;
  if not found then raise exception 'job_not_found'; end if;
  if j.lease_expires_at>now() then raise exception 'job_busy'; end if;
  if j.state='submitting' then
    update public.generation_jobs set state='needs_review',error_code='submission_unknown',lease_token=null,lease_expires_at=null,updated_at=now() where id=j.id returning * into j;
    insert into public.order_events(order_id,event_key,event_type,actor_type,reference_id,state)
      values(j.order_id,'unknown:'||j.id,'generation.state','system',j.id,'needs_review') on conflict(event_key) do nothing;
    update public.song_orders set generation_error='Song submission needs verification.',updated_at=now() where id=j.order_id;
    return j;
  end if;
  if j.state not in ('queued','processing','storing','needs_review') or (j.provider_job_id is null and j.state<>'storing') then raise exception 'job_not_recoverable'; end if;
  update public.generation_jobs set lease_token=gen_random_uuid(),lease_expires_at=now()+interval '5 minutes',poll_count=poll_count+1,updated_at=now() where id=j.id returning * into j;
  return j;
end $$;

create or replace function public.settle_songgift_job(p_job_id uuid,p_lease_token uuid,p_state text,p_error_code text)
returns public.generation_jobs language plpgsql set search_path = '' as $$
declare j public.generation_jobs;
begin
  select * into j from public.generation_jobs where id=p_job_id for update;
  if not found then raise exception 'job_not_found'; end if;
  if j.lease_token is distinct from p_lease_token or p_lease_token is null or j.lease_expires_at is null or j.lease_expires_at<=now() then raise exception 'stale_lease'; end if;
  if p_state not in ('queued','processing','storing','failed','needs_review') then raise exception 'invalid_state'; end if;
  if j.state='storing' and p_state not in ('storing','needs_review') then raise exception 'storage_must_resume'; end if;
  if p_error_code='storage_failed' and p_state<>'storing' then raise exception 'storage_must_resume'; end if;
  update public.generation_jobs set state=p_state,error_code=p_error_code,recovery_failures=case when p_error_code is null then 0 else recovery_failures+1 end,lease_token=null,lease_expires_at=null,
    completed_at=case when p_state='failed' then now() else completed_at end,
    next_check_at=case when p_state in ('queued','processing','storing') or (p_state='needs_review' and p_error_code='query_failed') then now()+make_interval(secs=>case when p_error_code is null then 30 else least(1800,30*power(2,least(recovery_failures,6)))::integer end) end,updated_at=now() where id=j.id returning * into j;
  update public.song_orders set status=case when p_state='failed' then 'failed' else 'generating' end,
    generation_error=case when p_error_code is not null or p_state='needs_review' then 'Song processing needs attention.' else null end,updated_at=now() where id=j.order_id;
  insert into public.order_events(order_id,event_key,event_type,actor_type,reference_id,state)
    values(j.order_id,'state:'||p_lease_token,'generation.state','system',j.id,p_state);
  return j;
end $$;

create or replace function public.claim_songgift_automatic_job(p_job_id uuid)
returns public.generation_jobs language plpgsql set search_path='' as $$
declare j public.generation_jobs;
begin
  select * into j from public.generation_jobs where id=p_job_id for update;
  if not found then raise exception 'job_not_found';end if;
  if j.automatic_paused_at is not null or j.lease_expires_at>now() or j.next_check_at>now()
    or (j.state not in ('submitting','queued','processing','storing') and not(j.state='needs_review' and j.error_code='query_failed' and j.provider_job_id is not null)) then return null;end if;
  if j.started_at<now()-interval '45 minutes' or j.automatic_checks>=90 or j.recovery_failures>=8 then
    update public.generation_jobs set automatic_paused_at=now(),state='needs_review',next_check_at=null,lease_token=null,lease_expires_at=null,updated_at=now() where id=j.id returning * into j;
    update public.song_orders set generation_error='Automatic processing needs assistance.',updated_at=now() where id=j.order_id;
    return j;
  end if;
  j:=public.claim_songgift_job(j.id);
  update public.generation_jobs set automatic_checks=automatic_checks+1,last_checked_at=now() where id=j.id returning * into j;
  return j;
end $$;

-- Notification candidates are new completions since this migration only.
create or replace function public.list_songgift_notification_candidates(p_limit integer)
returns jsonb language sql set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',id)),'[]'::jsonb) from (
    select j.id from public.generation_jobs j,public.songgift_maintenance m where m.id and j.state='completed'
      and j.completed_at>=m.notification_cutoff and j.environment='production'
      and not exists(select 1 from public.song_notification_outbox n where n.job_id=j.id)
    order by j.completed_at,j.id limit least(greatest(p_limit,0),20)
  ) candidates;
$$;
create or replace function public.enqueue_songgift_notification(p_job_id uuid,p_user_id uuid,p_to_email text)
returns boolean language plpgsql set search_path='' as $$
declare j public.generation_jobs;o public.song_orders;
begin
  select * into j from public.generation_jobs where id=p_job_id;
  if not found or j.state<>'completed' or j.environment<>'production' or j.completed_at<(select notification_cutoff from public.songgift_maintenance where id) then return false;end if;
  select * into o from public.song_orders where id=j.order_id;
  if o.user_id is distinct from p_user_id then raise exception 'recipient_changed';end if;
  if p_to_email is not null and (length(p_to_email) not between 3 and 254 or p_to_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then raise exception 'recipient_changed';end if;
  insert into public.song_notification_outbox(dedupe_key,job_id,order_id,user_id,to_email,recipient_name,status,error_code)
    values('song.ready:'||j.id,j.id,o.id,p_user_id,p_to_email,coalesce(j.input_snapshot->>'recipientName',o.recipient_name),
      case when p_user_id is null or p_to_email is null then 'skipped' else 'pending' end,
      case when p_user_id is null or p_to_email is null then 'recipient_changed' end) on conflict(job_id) do nothing;
  return true;
end $$;
create or replace function public.list_due_songgift_notifications(p_limit integer)
returns jsonb language sql set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',id)),'[]'::jsonb) from (
    select id from public.song_notification_outbox where status in ('pending','sending') and next_attempt_at<=now()
      and (lease_expires_at is null or lease_expires_at<=now()) order by next_attempt_at,id limit least(greatest(p_limit,0),5)
  ) due;
$$;
create or replace function public.claim_songgift_notification(p_id uuid,p_from_email text,p_site_origin text)
returns public.song_notification_outbox language plpgsql set search_path='' as $$
declare n public.song_notification_outbox;
begin
  select * into n from public.song_notification_outbox where id=p_id for update;
  if not found or n.status not in ('pending','sending') or n.next_attempt_at>now() or n.lease_expires_at>now() then return null;end if;
  -- Resend retains idempotency keys for 24h. Stop safely inside that window.
  if n.attempts>=5 or n.first_attempt_at<now()-interval '20 hours' then
    update public.song_notification_outbox set status='needs_review',error_code=case when n.attempts>=5 then 'attempts_exhausted' else 'delivery_unknown' end,lease_token=null,lease_expires_at=null where id=n.id returning * into n;return n;
  end if;
  if p_from_email is null or length(p_from_email) not between 3 and 254 or p_site_origin is null or length(p_site_origin)>512 then raise exception 'invalid_config';end if;
  update public.song_notification_outbox set status='sending',attempts=attempts+1,first_attempt_at=coalesce(first_attempt_at,now()),
    from_email=coalesce(from_email,p_from_email),site_origin=coalesce(site_origin,p_site_origin),lease_token=gen_random_uuid(),lease_expires_at=now()+interval '2 minutes' where id=n.id returning * into n;
  return n;
end $$;
create or replace function public.settle_songgift_notification(p_id uuid,p_lease_token uuid,p_status text,p_message_id text,p_error_code text)
returns boolean language plpgsql set search_path='' as $$
declare n public.song_notification_outbox;
begin
  select * into n from public.song_notification_outbox where id=p_id for update;
  if not found or p_lease_token is null or n.lease_token is distinct from p_lease_token or n.lease_expires_at<=now() then raise exception 'stale_lease';end if;
  if p_status not in ('pending','sent','failed','needs_review','skipped') then raise exception 'invalid_result';end if;
  update public.song_notification_outbox set status=p_status,provider_message_id=p_message_id,error_code=p_error_code,
    sent_at=case when p_status='sent' then now() else sent_at end,
    next_attempt_at=case when p_status='pending' then now()+make_interval(secs=>least(8100,300*power(3,greatest(n.attempts-1,0)))::integer) else next_attempt_at end,
    lease_token=null,lease_expires_at=null where id=n.id;
  return true;
end $$;

revoke all on function public.begin_songgift_maintenance(),public.finish_songgift_maintenance(uuid,text,integer,integer),public.list_due_songgift_jobs(integer),public.claim_songgift_automatic_job(uuid),public.list_songgift_notification_candidates(integer),public.enqueue_songgift_notification(uuid,uuid,text),public.list_due_songgift_notifications(integer),public.claim_songgift_notification(uuid,text,text),public.settle_songgift_notification(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.begin_songgift_maintenance(),public.finish_songgift_maintenance(uuid,text,integer,integer),public.list_due_songgift_jobs(integer),public.claim_songgift_automatic_job(uuid),public.list_songgift_notification_candidates(integer),public.enqueue_songgift_notification(uuid,uuid,text),public.list_due_songgift_notifications(integer),public.claim_songgift_notification(uuid,text,text),public.settle_songgift_notification(uuid,uuid,text,text,text) to service_role;
commit;

-- T07: private idempotency/lease for story -> lyrics; no guest account grants.
begin;
create table if not exists public.song_story_requests (
  request_id uuid primary key,
  user_id uuid not null,
  order_id uuid not null unique references public.song_orders(id),
  input_hash text not null check(input_hash ~ '^[0-9a-f]{64}$'),
  state text not null check(state in ('writing','ready','failed','needs_review')),
  lease_token uuid,lease_expires_at timestamptz,
  created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
  check((lease_token is null)=(lease_expires_at is null))
);
alter table public.song_story_requests enable row level security;
revoke all on public.song_story_requests from public,anon,authenticated,service_role;
grant select,insert,update on public.song_story_requests to service_role;

create or replace function public.begin_songgift_story(p_request_id uuid,p_user_id uuid,p_input_hash text,p_input jsonb,p_email text)
returns jsonb language plpgsql set search_path='' as $$
declare r public.song_story_requests;o public.song_orders;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text,0));
  select * into r from public.song_story_requests where request_id=p_request_id for update;
  if found then
    if r.user_id is distinct from p_user_id then raise exception 'order_not_found';end if;
    if r.input_hash is distinct from p_input_hash then raise exception 'story_conflict';end if;
    select * into o from public.song_orders where id=r.order_id and user_id=p_user_id for update;
    if not found then raise exception 'order_not_found';end if;
    if o.lyrics_text is not null then return jsonb_build_object('start',false,'pending',false,'orderId',o.id,'title',o.title,'lyricsText',o.lyrics_text);end if;
    if r.state='writing' and r.lease_expires_at>now() then return jsonb_build_object('start',false,'pending',true,'orderId',o.id);end if;
    if r.state in ('writing','needs_review') then
      update public.song_story_requests set state='needs_review',lease_token=null,lease_expires_at=null,updated_at=now() where request_id=r.request_id;
      return jsonb_build_object('start',false,'blocked',true,'orderId',o.id);
    end if;
  else
    insert into public.song_orders(user_id,recipient_name,relationship,occasion,story,mood,style,email,status)
      values(p_user_id,p_input->>'recipientName',p_input->>'relationship',p_input->>'occasion',p_input->>'story',p_input->>'mood',p_input->>'style',p_email,'draft') returning * into o;
    insert into public.song_story_requests(request_id,user_id,order_id,input_hash,state)
      values(p_request_id,p_user_id,o.id,p_input_hash,'failed') returning * into r;
  end if;
  update public.song_story_requests set state='writing',lease_token=gen_random_uuid(),lease_expires_at=now()+interval '5 minutes',updated_at=now() where request_id=r.request_id returning * into r;
  return jsonb_build_object('start',true,'orderId',o.id,'leaseToken',r.lease_token);
end $$;
create or replace function public.finish_songgift_story(p_request_id uuid,p_user_id uuid,p_lease_token uuid,p_title text,p_lyrics text)
returns jsonb language plpgsql set search_path='' as $$
declare r public.song_story_requests;o public.song_orders;
begin
  select * into r from public.song_story_requests where request_id=p_request_id and user_id=p_user_id for update;
  if not found then raise exception 'order_not_found';end if;
  select * into o from public.song_orders where id=r.order_id and user_id=p_user_id for update;
  if not found then raise exception 'order_not_found';end if;
  if r.state='ready' and o.lyrics_text is not null then return jsonb_build_object('orderId',o.id,'title',o.title,'lyricsText',o.lyrics_text);end if;
  if r.state<>'writing' or p_lease_token is null or r.lease_token is distinct from p_lease_token or r.lease_expires_at<=now() then raise exception 'stale_lease';end if;
  if p_title is null or length(p_title) not between 1 and 200 or p_lyrics is null or length(p_lyrics) not between 20 and 12000 then raise exception 'invalid_lyrics';end if;
  -- A concurrently saved/approved lyric wins; never overwrite later order states.
  if o.lyrics_text is null then
    if o.status<>'draft' or o.paid_at is not null or o.active_generation_job_id is not null then raise exception 'story_conflict';end if;
    update public.song_orders set title=p_title,lyrics_text=p_lyrics,status='lyrics_ready',updated_at=now() where id=o.id returning * into o;
  end if;
  update public.song_story_requests set state='ready',lease_token=null,lease_expires_at=null,updated_at=now() where request_id=r.request_id;
  return jsonb_build_object('orderId',o.id,'title',o.title,'lyricsText',o.lyrics_text);
end $$;
create or replace function public.fail_songgift_story(p_request_id uuid,p_user_id uuid,p_lease_token uuid)
returns boolean language plpgsql set search_path='' as $$
begin
  update public.song_story_requests set state='failed',lease_token=null,lease_expires_at=null,updated_at=now()
    where request_id=p_request_id and user_id=p_user_id and state='writing' and lease_token=p_lease_token and lease_expires_at>now();
  return found;
end $$;
revoke all on function public.begin_songgift_story(uuid,uuid,text,jsonb,text),public.finish_songgift_story(uuid,uuid,uuid,text,text),public.fail_songgift_story(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.begin_songgift_story(uuid,uuid,text,jsonb,text),public.finish_songgift_story(uuid,uuid,uuid,text,text),public.fail_songgift_story(uuid,uuid,uuid) to service_role;
commit;
