-- Private, bounded pre-payment audio. Existing paid generation/ledger stays intact.
begin;
create table if not exists public.audio_demo_batches (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  actor_id uuid not null references auth.users(id),
  expires_at timestamptz not null default now()+interval '24 hours',
  created_at timestamptz not null default now()
);
create table if not exists public.audio_previews (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'customer' check (kind in ('customer','sample')),
  order_id uuid unique references public.song_orders(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  public_slug text unique,
  title text,
  batch_id uuid references public.audio_demo_batches(id),
  is_public boolean not null default false,
  provider text not null check (provider in ('fal','mock')),
  model text not null,
  environment text not null check (environment in ('production','test')),
  input_snapshot jsonb not null,
  provider_job_id text,
  state text not null check (state in ('pending','submitting','queued','processing','storing','ready','failed','needs_review')),
  error_code text check (error_code in ('submission_unknown','provider_failed','query_failed','storage_failed')),
  lease_token uuid,
  lease_expires_at timestamptz,
  next_check_at timestamptz,
  poll_count integer not null default 0,
  attempt integer not null default 1 check (attempt between 1 and 3),
  source_url text,
  source_base64 text,
  mime_type text,
  storage_bucket text,
  full_path text,
  clip_path text,
  clip_seconds numeric check (clip_seconds>0 and clip_seconds<=60),
  full_sha256 text,
  clip_sha256 text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((lease_token is null)=(lease_expires_at is null)),
  check ((kind='customer' and order_id is not null and user_id is not null and public_slug is null and batch_id is null and not is_public)
    or (kind='sample' and order_id is null and user_id is null and public_slug in ('birthday-demo','anniversary-demo','christmas-demo') and batch_id is not null)),
  check (state<>'ready' or (clip_path is not null and full_path is not null and storage_bucket is not null and clip_seconds is not null and full_sha256 ~ '^[0-9a-f]{64}$' and clip_sha256 ~ '^[0-9a-f]{64}$'))
);
create index if not exists audio_previews_due_idx on public.audio_previews(next_check_at,id) where state in ('submitting','queued','processing','storing','needs_review');
create index if not exists audio_previews_user_idx on public.audio_previews(user_id);
create index if not exists audio_previews_batch_idx on public.audio_previews(batch_id);
create table if not exists public.audio_preview_allowances (
  user_id uuid primary key references auth.users(id) on delete cascade,
  preview_id uuid references public.audio_previews(id),
  updated_at timestamptz not null default now()
);
create table if not exists public.audio_preview_daily (
  day date primary key,
  starts integer not null default 0 check (starts>=0)
);
alter table public.audio_demo_batches enable row level security;
alter table public.audio_previews enable row level security;
alter table public.audio_preview_allowances enable row level security;
alter table public.audio_preview_daily enable row level security;
revoke all on public.audio_demo_batches,public.audio_previews,public.audio_preview_allowances,public.audio_preview_daily from public,anon,authenticated,service_role;
grant select,insert,update on public.audio_demo_batches,public.audio_previews,public.audio_preview_allowances,public.audio_preview_daily to service_role;

create or replace function public.reserve_songgift_preview(p_order_id uuid,p_user_id uuid,p_daily_limit integer,p_provider text,p_model text,p_environment text)
returns jsonb language plpgsql set search_path='' as $$
declare o public.song_orders; a public.audio_preview_allowances; p public.audio_previews; hits integer;
begin
  if p_daily_limit not between 1 and 100 or not ((p_provider='fal' and p_model='fal-ai/lyria3/pro' and p_environment='production') or (p_provider='mock' and p_model='local-preview' and p_environment='test')) then raise exception 'preview_unavailable';end if;
  select * into o from public.song_orders where id=p_order_id and user_id=p_user_id for update;
  if not found then raise exception 'order_not_found';end if;
  select * into p from public.audio_previews where order_id=o.id;
  if found and p.state<>'failed' then return jsonb_build_object('created',false,'preview',to_jsonb(p)-'lease_token');end if;
  if o.paid_at is not null or o.provider_job_id is not null or o.active_generation_job_id is not null or o.status not in ('draft','lyrics_ready')
    or exists(select 1 from public.generation_jobs where order_id=o.id) or exists(select 1 from public.song_assets where order_id=o.id and is_final) then raise exception 'preview_order_started';end if;
  if o.lyrics_text is null or length(trim(o.lyrics_text)) not between 20 and 12000 then raise exception 'lyrics_required';end if;
  insert into public.audio_preview_allowances(user_id) values(p_user_id) on conflict do nothing;
  select * into a from public.audio_preview_allowances where user_id=p_user_id for update;
  if a.preview_id is not null then raise exception 'preview_allowance_used';end if;
  if p.id is not null and p.attempt>=3 then raise exception 'preview_retry_limit';end if;
  insert into public.audio_preview_daily(day,starts) values((now() at time zone 'UTC')::date,1)
    on conflict(day) do update set starts=public.audio_preview_daily.starts+1 where public.audio_preview_daily.starts<p_daily_limit returning starts into hits;
  if hits is null then raise exception 'preview_daily_limit';end if;
  if p.id is null then
    insert into public.audio_previews(order_id,user_id,provider,model,environment,state,lease_token,lease_expires_at,input_snapshot)
      values(o.id,p_user_id,p_provider,p_model,p_environment,'submitting',gen_random_uuid(),now()+interval '5 minutes','{}') returning * into p;
  else
    update public.audio_previews set state='submitting',error_code=null,provider_job_id=null,source_url=null,source_base64=null,
      lease_token=gen_random_uuid(),lease_expires_at=now()+interval '5 minutes',next_check_at=null,poll_count=0,attempt=attempt+1,updated_at=now() where id=p.id returning * into p;
  end if;
  update public.audio_previews set input_snapshot=jsonb_build_object('orderId',o.id,'recipientName',o.recipient_name,'occasion',o.occasion,'story',o.story,'mood',coalesce(o.mood,''),'style',coalesce(o.style,''),'lyricsText',o.lyrics_text) where id=p.id returning * into p;
  update public.audio_preview_allowances set preview_id=p.id,updated_at=now() where user_id=p_user_id;
  return jsonb_build_object('created',true,'preview',to_jsonb(p));
end $$;

create or replace function public.claim_songgift_preview(p_preview_id uuid)
returns public.audio_previews language plpgsql set search_path='' as $$
declare p public.audio_previews;
begin
  select * into p from public.audio_previews where id=p_preview_id for update;
  if not found or p.state in ('pending','ready','failed') or p.lease_expires_at>now() or p.next_check_at>now() then return null;end if;
  if p.state='submitting' then
    update public.audio_previews set state='needs_review',error_code='submission_unknown',lease_token=null,lease_expires_at=null,next_check_at=null,updated_at=now() where id=p.id returning * into p;
    return p;
  end if;
  if p.poll_count>=90 or (p.provider_job_id is null and p.state<>'storing') then return null;end if;
  update public.audio_previews set lease_token=gen_random_uuid(),lease_expires_at=now()+interval '5 minutes',poll_count=poll_count+1,updated_at=now() where id=p.id returning * into p;
  return p;
end $$;

create or replace function public.settle_songgift_preview(p_preview_id uuid,p_lease_token uuid,p_state text,p_provider_job_id text default null,p_source_url text default null,p_source_base64 text default null,p_mime_type text default null,p_error_code text default null,p_keep_lease boolean default false,p_bucket text default null,p_full_path text default null,p_clip_path text default null,p_clip_seconds numeric default null,p_full_sha256 text default null,p_clip_sha256 text default null)
returns public.audio_previews language plpgsql set search_path='' as $$
declare p public.audio_previews; uid uuid; ext text;
begin
  select user_id into uid from public.audio_previews where id=p_preview_id;
  if uid is not null then perform 1 from public.audio_preview_allowances where user_id=uid for update;end if;
  select * into p from public.audio_previews where id=p_preview_id for update;
  if not found or p_lease_token is null or p.lease_token is distinct from p_lease_token or p.lease_expires_at<=now() then raise exception 'stale_lease';end if;
  if p_state not in ('queued','processing','storing','ready','failed','needs_review') then raise exception 'invalid_state';end if;
  if p.provider_job_id is not null and p_provider_job_id is not null and p.provider_job_id<>p_provider_job_id then raise exception 'preview_mismatch';end if;
  if p_state='ready' then
    ext:=case coalesce(p_mime_type,p.mime_type) when 'audio/mpeg' then 'mp3' when 'audio/wav' then 'wav' else 'invalid' end;
    if ext='invalid' or p_bucket is null or length(p_bucket) not between 1 and 100 or p_clip_seconds is null or p_clip_seconds<=0 or p_clip_seconds>60
      or p_full_path is distinct from coalesce(p.order_id,p.id)::text||'/'||p.id::text||'/final.'||ext
      or p_clip_path is distinct from coalesce(p.order_id,p.id)::text||'/'||p.id::text||'/preview.'||ext
      or coalesce(p_full_sha256,'')!~'^[0-9a-f]{64}$' or coalesce(p_clip_sha256,'')!~'^[0-9a-f]{64}$' then raise exception 'preview_mismatch';end if;
  end if;
  update public.audio_previews set state=p_state,provider_job_id=coalesce(p.provider_job_id,p_provider_job_id),source_url=case when p_state='ready' then null else coalesce(p_source_url,source_url) end,
    source_base64=case when p_state='ready' then null else coalesce(p_source_base64,source_base64) end,mime_type=coalesce(p_mime_type,mime_type),error_code=p_error_code,
    lease_token=case when p_keep_lease then lease_token end,lease_expires_at=case when p_keep_lease then lease_expires_at end,
    next_check_at=case when p_keep_lease then null when p_state in ('queued','processing','storing') or (p_state='needs_review' and coalesce(p.provider_job_id,p_provider_job_id) is not null) then now()+interval '30 seconds' end,
    storage_bucket=coalesce(p_bucket,storage_bucket),full_path=coalesce(p_full_path,full_path),clip_path=coalesce(p_clip_path,clip_path),clip_seconds=coalesce(p_clip_seconds,clip_seconds),
    full_sha256=coalesce(p_full_sha256,full_sha256),clip_sha256=coalesce(p_clip_sha256,clip_sha256),is_public=(kind='sample' and p_state='ready'),updated_at=now() where id=p.id returning * into p;
  if p_state='failed' and p_error_code='provider_failed' and p.user_id is not null then
    update public.audio_preview_allowances set preview_id=null,updated_at=now() where user_id=p.user_id and preview_id=p.id;
  end if;
  return p;
end $$;

create or replace function public.songgift_freeze_preview_input() returns trigger language plpgsql set search_path='' as $$
begin
  if (new.recipient_name,new.occasion,new.story,new.mood,new.style,new.lyrics_text) is distinct from (old.recipient_name,old.occasion,old.story,old.mood,old.style,old.lyrics_text)
    and exists(select 1 from public.audio_previews where order_id=old.id and state<>'failed') then raise exception 'generation_input_immutable';end if;
  return new;
end $$;
drop trigger if exists songgift_freeze_preview_input on public.song_orders;
create trigger songgift_freeze_preview_input before update on public.song_orders for each row execute function public.songgift_freeze_preview_input();

-- Old application versions must fail closed rather than submit a second paid
-- recording for an order that already has a pre-payment recording.
create or replace function public.songgift_guard_preview_generation() returns trigger language plpgsql set search_path='' as $$
declare p public.audio_previews;
begin
  select * into p from public.audio_previews where order_id=new.order_id;
  if found and (p.state<>'ready' or new.id<>p.id or new.provider_job_id is distinct from p.provider_job_id or new.input_snapshot is distinct from p.input_snapshot) then raise exception 'preview_requires_promotion';end if;
  return new;
end $$;
drop trigger if exists songgift_guard_preview_generation on public.generation_jobs;
create trigger songgift_guard_preview_generation before insert on public.generation_jobs for each row execute function public.songgift_guard_preview_generation();

create or replace function public.promote_songgift_preview(p_order_id uuid,p_user_id uuid)
returns public.generation_jobs language plpgsql set search_path='' as $$
declare o public.song_orders; p public.audio_previews; j public.generation_jobs; a public.song_assets;
begin
  select * into o from public.song_orders where id=p_order_id and user_id=p_user_id for update;
  if not found then raise exception 'order_not_found';end if;
  select * into p from public.audio_previews where order_id=o.id and user_id=p_user_id for update;
  if not found then return null;end if;
  if o.paid_at is null then raise exception 'payment_required';end if;
  if p.state<>'ready' then raise exception 'preview_not_ready';end if;
  select * into j from public.generation_jobs where order_id=o.id;
  if found then
    if j.id<>p.id then raise exception 'preview_mismatch';end if;
    return j;
  end if;
  if p.provider<>'mock' and (o.quoted_at is null or not exists(select 1 from public.payment_transactions t where t.order_id=o.id and t.transaction_type='capture' and t.amount_minor=o.quoted_amount_minor and t.currency=o.currency and t.environment=o.payment_environment)) then raise exception 'legacy_payment_needs_review';end if;
  if p.input_snapshot->>'lyricsText' is distinct from o.lyrics_text then raise exception 'preview_mismatch';end if;
  insert into public.generation_jobs(id,order_id,submission_key,attempt_no,provider,model,environment,provider_job_id,state,lease_token,lease_expires_at,input_snapshot)
    values(p.id,o.id,o.id,1,p.provider,p.model,p.environment,p.provider_job_id,'storing',gen_random_uuid(),now()+interval '5 minutes',p.input_snapshot) returning * into j;
  update public.song_orders set status='generating',active_generation_job_id=j.id,provider_job_id=j.provider_job_id,music_provider=j.provider,music_model=j.model,updated_at=now() where id=o.id;
  insert into public.order_events(order_id,event_key,event_type,actor_type,actor_id,reference_id,state) values(o.id,'reserve:'||j.id,'generation.reserved','customer',p_user_id,j.id,'storing');
  j:=public.complete_songgift_audio(j.id,j.lease_token,gen_random_uuid(),p.storage_bucket,p.full_path,p.mime_type);
  return j;
end $$;

-- An Owner can authorize only three original marketing demos. The expiring token
-- can advance these existing tasks; it cannot submit user prompts or new orders.
create or replace function public.reserve_songgift_demo_samples(p_actor_id uuid,p_token_hash text,p_inputs jsonb)
returns uuid language plpgsql set search_path='' as $$
declare batch uuid; item jsonb; n integer:=0;
begin
  if not exists(select 1 from public.admin_members where user_id=p_actor_id and role='owner' and active) then raise exception 'admin_denied';end if;
  if p_token_hash!~'^[0-9a-f]{64}$' or jsonb_typeof(p_inputs)<>'array' or jsonb_array_length(p_inputs)<>3 then raise exception 'invalid_samples';end if;
  perform pg_advisory_xact_lock(hashtext('songgift.original.public.samples'));
  if exists(select 1 from public.audio_previews where kind='sample') then raise exception 'samples_already_reserved';end if;
  insert into public.audio_demo_batches(token_hash,actor_id) values(p_token_hash,p_actor_id) returning id into batch;
  for item in select * from jsonb_array_elements(p_inputs) loop
    if item->>'slug' not in ('birthday-demo','anniversary-demo','christmas-demo') or length(coalesce(item->>'title','')) not between 1 and 200 or length(coalesce(item->'input'->>'lyricsText','')) not between 20 and 12000 then raise exception 'invalid_samples';end if;
    insert into public.audio_previews(kind,public_slug,title,batch_id,provider,model,environment,input_snapshot,state,next_check_at)
      values('sample',item->>'slug',item->>'title',batch,'fal','fal-ai/lyria3/pro','production',item->'input','pending',now());
    n:=n+1;
  end loop;
  return batch;
end $$;

create or replace function public.claim_songgift_demo_submission(p_preview_id uuid,p_batch_id uuid)
returns public.audio_previews language plpgsql set search_path='' as $$
declare p public.audio_previews;
begin
  update public.audio_previews set state='submitting',lease_token=gen_random_uuid(),lease_expires_at=now()+interval '5 minutes',updated_at=now()
    where id=p_preview_id and kind='sample' and batch_id=p_batch_id and state='pending'
      and exists(select 1 from public.audio_demo_batches b join public.admin_members m on m.user_id=b.actor_id where b.id=p_batch_id and b.expires_at>now() and m.active and m.role='owner') returning * into p;
  return p;
end $$;

revoke all on function public.reserve_songgift_preview(uuid,uuid,integer,text,text,text),public.claim_songgift_preview(uuid),public.settle_songgift_preview(uuid,uuid,text,text,text,text,text,text,boolean,text,text,text,numeric,text,text),public.songgift_freeze_preview_input(),public.songgift_guard_preview_generation(),public.promote_songgift_preview(uuid,uuid),public.reserve_songgift_demo_samples(uuid,text,jsonb),public.claim_songgift_demo_submission(uuid,uuid) from public,anon,authenticated;
grant execute on function public.reserve_songgift_preview(uuid,uuid,integer,text,text,text),public.claim_songgift_preview(uuid),public.settle_songgift_preview(uuid,uuid,text,text,text,text,text,text,boolean,text,text,text,numeric,text,text),public.promote_songgift_preview(uuid,uuid),public.reserve_songgift_demo_samples(uuid,text,jsonb),public.claim_songgift_demo_submission(uuid,uuid) to service_role;
commit;
