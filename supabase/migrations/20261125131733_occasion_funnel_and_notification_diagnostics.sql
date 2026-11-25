-- Coarse, opt-in occasion and playback events; operational delivery summaries stay private.
begin;

alter table public.usage_events add column occasion text
  check (occasion in ('birthday','wedding','anniversary','family','pet','memorial','christmas','christmas-eve','new-year','just-because','thank-you'));
alter table public.usage_events drop constraint usage_events_event_check;
alter table public.usage_events add constraint usage_events_event_check
  check (event in ('page_view','sample_played','story_started','story_submitted','lyrics_ready','preview_played','checkout_started'));

-- The explicit eleven-argument version avoids ambiguity with the legacy RPC.
create function public.record_songgift_usage(
  p_session uuid,p_key uuid,p_event text,p_page text,p_first text,p_last text,
  p_medium text,p_campaign text,p_order_id uuid,p_user_id uuid,p_occasion text
) returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_occasion text;
begin
  perform pg_advisory_xact_lock(781246911);
  delete from public.usage_optouts where expires_at<now();
  if exists(select 1 from public.usage_optouts where session_id=p_session) then return false; end if;

  if p_order_id is not null then
    select lower(regexp_replace(trim(occasion),'\s+','-','g')) into v_occasion
    from public.song_orders where id=p_order_id and user_id=p_user_id;
    if not found then raise exception 'order_not_found' using errcode='P0002'; end if;
    if v_occasion='in-memory' then v_occasion='memorial'; end if;
    if v_occasion not in ('birthday','wedding','anniversary','family','pet','memorial','christmas','christmas-eve','new-year','just-because','thank-you') then v_occasion=null; end if;
  else
    v_occasion=p_occasion;
  end if;

  if (p_event='sample_played' and p_page not in ('home','occasions'))
    or (p_event='story_started' and p_page<>'create')
    or (p_event='preview_played' and (p_order_id is null or p_page<>'lyrics'))
  then raise exception 'invalid_usage_context' using errcode='22023'; end if;

  delete from public.song_order_attribution where created_at<now()-interval '30 days';
  delete from public.usage_events where created_at<now()-interval '30 days';
  if exists(select 1 from public.usage_events where session_id=p_session and event_key=p_key) then return true; end if;
  if (select count(*) from public.usage_events where created_at>=date_trunc('day',now()))>=10000
    or (select count(*) from public.usage_events where session_id=p_session and created_at>now()-interval '1 minute')>=20
  then return false; end if;

  insert into public.usage_events(session_id,event_key,event,page,first_source,last_source,medium,campaign,occasion)
    values(p_session,p_key,p_event,p_page,p_first,p_last,p_medium,p_campaign,v_occasion);
  if p_order_id is not null then
    insert into public.song_order_attribution(order_id,session_id) values(p_order_id,p_session) on conflict(order_id) do nothing;
  end if;
  return true;
end;$$;

-- Existing clients and positional SQL callers keep their original signature.
create or replace function public.record_songgift_usage(
  p_session uuid,p_key uuid,p_event text,p_page text,p_first text,p_last text,p_medium text,p_campaign text,
  p_order_id uuid default null,p_user_id uuid default null
) returns boolean language sql security invoker set search_path=public,pg_temp as $$
  select public.record_songgift_usage(p_session,p_key,p_event,p_page,p_first,p_last,p_medium,p_campaign,p_order_id,p_user_id,null);
$$;
revoke all on function public.record_songgift_usage(uuid,uuid,text,text,text,text,text,text,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.record_songgift_usage(uuid,uuid,text,text,text,text,text,text,uuid,uuid,text) to service_role;

create or replace function public.songgift_usage_report(p_from timestamptz,p_to timestamptz) returns jsonb language sql security invoker set search_path=public,pg_temp as $$
 with window_events as(select * from usage_events where created_at>=greatest(p_from,now()-interval '30 days') and created_at<p_to),
 sources as(select first_source as source,count(*) filter(where event='page_view') as views,count(distinct session_id) as browsers from window_events group by first_source),
 steps as(select event,count(*) as events,count(distinct session_id) as browsers from window_events group by event),
 occasion_steps as(select occasion,event,count(*) as events,count(distinct session_id) as browsers from window_events group by occasion,event)
 select jsonb_build_object('sources',coalesce((select jsonb_agg(s) from sources s),'[]'::jsonb),'steps',coalesce((select jsonb_agg(s) from steps s),'[]'::jsonb),
 'lastSources',coalesce((select jsonb_agg(s) from (select last_source as source,count(*) filter(where event='page_view') as views,count(distinct session_id) as browsers from window_events group by last_source) s),'[]'::jsonb),
 'campaigns',coalesce((select jsonb_agg(s) from (select campaign,count(*) as events,count(distinct session_id) as browsers from window_events where campaign<>'' group by campaign) s),'[]'::jsonb),
 'captures',(select count(*) from payment_transactions where environment='live' and transaction_type='capture' and occurred_at>=p_from and occurred_at<p_to),
 'delivered',(select count(distinct order_id) from song_assets where is_final and created_at>=p_from and created_at<p_to),
 'attributedCaptures',(select count(*) from payment_transactions p join song_order_attribution a on a.order_id=p.order_id where p.environment='live' and p.transaction_type='capture' and p.occurred_at>=p_from and p.occurred_at<p_to and exists(select 1 from usage_events e where e.session_id=a.session_id)),
 'attributedSources',coalesce((select jsonb_agg(s) from (select e.first_source as source,count(distinct p.id) as captures from payment_transactions p join song_order_attribution a on a.order_id=p.order_id join lateral (select first_source from usage_events where session_id=a.session_id order by created_at,id limit 1) e on true where p.environment='live' and p.transaction_type='capture' and p.occurred_at>=p_from and p.occurred_at<p_to group by e.first_source) s),'[]'::jsonb),
 'reportVersion',2,
 'occasionSteps',coalesce((select jsonb_agg(s order by s.occasion nulls first,s.event) from occasion_steps s),'[]'::jsonb),
 'previewCohort',(select jsonb_build_object(
   'created',count(*),
   'ready',count(*) filter(where state='ready'),
   'processing',count(*) filter(where state in ('pending','submitting','queued','processing','storing')),
   'failed',count(*) filter(where state='failed'),
   'needsReview',count(*) filter(where state='needs_review')
 ) from public.audio_previews where kind='customer' and environment='production' and created_at>=p_from and created_at<p_to));
$$;
revoke all on function public.songgift_usage_report(timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.songgift_usage_report(timestamptz,timestamptz) to service_role;

create function public.songgift_notification_summary() returns jsonb language sql security invoker set search_path=public,pg_temp as $$
  select jsonb_build_object(
    'pending',count(*) filter(where status='pending'),
    'sending',count(*) filter(where status='sending'),
    'skipped',count(*) filter(where status='skipped'),
    'sent',count(*) filter(where status='sent'),
    'failed',count(*) filter(where status='failed'),
    'needsReview',count(*) filter(where status='needs_review'),
    'retrying',count(*) filter(where status='pending' and attempts>0),
    'oldestPendingAt',min(created_at) filter(where status='pending')
  ) from public.song_notification_outbox;
$$;
revoke all on function public.songgift_notification_summary() from public,anon,authenticated;
grant execute on function public.songgift_notification_summary() to service_role;
commit;
