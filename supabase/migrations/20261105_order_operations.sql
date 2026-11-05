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
