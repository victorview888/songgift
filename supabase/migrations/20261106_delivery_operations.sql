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
