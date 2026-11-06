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
