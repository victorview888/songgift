-- Additive T06/T08/T10 data; service-only. Does not start jobs or alter orders.
begin;
create table public.admin_customer_directory (
 user_id uuid primary key references auth.users(id) on delete cascade,
 email text, verified boolean not null, created_at timestamptz, last_sign_in_at timestamptz
);
alter table public.admin_customer_directory enable row level security;
revoke all on public.admin_customer_directory from public,anon,authenticated;
grant select on public.admin_customer_directory to service_role;
-- Auth owns its source rows; narrowly allow its server role to maintain this projection.
grant select,insert,update on public.admin_customer_directory to supabase_auth_admin;
create policy auth_directory_sync on public.admin_customer_directory for all to supabase_auth_admin using(true) with check(true);
create schema if not exists songgift_internal;
revoke all on schema songgift_internal from public,anon,authenticated;
grant usage on schema songgift_internal to supabase_auth_admin;
create function songgift_internal.sync_admin_customer() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 insert into public.admin_customer_directory values(new.id,new.email,new.email_confirmed_at is not null,new.created_at,new.last_sign_in_at)
 on conflict(user_id) do update set email=excluded.email,verified=excluded.verified,last_sign_in_at=excluded.last_sign_in_at;
 return new;
end;$$;
revoke all on function songgift_internal.sync_admin_customer() from public,anon,authenticated;
grant execute on function songgift_internal.sync_admin_customer() to supabase_auth_admin;
create trigger songgift_admin_directory after insert or update of email,email_confirmed_at,last_sign_in_at on auth.users for each row execute function songgift_internal.sync_admin_customer();
insert into public.admin_customer_directory select id,email,email_confirmed_at is not null,created_at,last_sign_in_at from auth.users;
create index admin_customer_created_idx on public.admin_customer_directory(created_at desc nulls last,user_id desc);
create function public.list_songgift_customers(p_page integer,p_q text,p_verified text) returns jsonb language sql security invoker set search_path=public,pg_temp as $$
 with filtered as (
   select d.* from admin_customer_directory d
   where (p_q='' or d.email ilike '%'||replace(replace(replace(p_q,'\','\\'),'%','\%'),'_','\_')||'%' or d.user_id::text=p_q)
   and (p_verified='all' or d.verified=(p_verified='yes'))
 ), sliced as (
   select * from filtered order by created_at desc nulls last,user_id desc
   limit 20 offset (greatest(1,least(p_page,10000))-1)*20
 ), enriched as (
   select s.*,
     (select count(*) from song_orders o where o.user_id=s.user_id) as order_count,
     (select count(distinct p.order_id) from payment_transactions p join song_orders o on o.id=p.order_id
      where o.user_id=s.user_id and p.environment='live' and p.transaction_type='capture') as paid_count
   from sliced s
 )
 select jsonb_build_object('total',(select count(*) from filtered),'rows',
   coalesce((select jsonb_agg(e order by e.created_at desc nulls last,e.user_id desc) from enriched e),'[]'::jsonb));
$$;
revoke all on function public.list_songgift_customers(integer,text,text) from public,anon,authenticated;
grant execute on function public.list_songgift_customers(integer,text,text) to service_role;

create index admin_audit_created_idx on public.admin_audit_logs(created_at desc,id desc);
create index admin_audit_actor_created_idx on public.admin_audit_logs(actor_user_id,created_at desc,id desc);

create table public.song_gifts (
 order_id uuid primary key references public.song_orders(id) on delete cascade,
 owner_user_id uuid not null references auth.users(id) on delete cascade,
 token text not null unique check(token ~ '^[A-Za-z0-9_-]{43}$'),
 active boolean not null default true, greeting text not null default '' check(length(greeting)<=300),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index song_gifts_owner_idx on public.song_gifts(owner_user_id);
alter table public.song_gifts enable row level security;
revoke all on public.song_gifts from public,anon,authenticated;
grant select,insert,update on public.song_gifts to service_role;
create function public.set_songgift_gift(p_order_id uuid,p_user_id uuid,p_active boolean,p_token text,p_greeting text) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_order song_orders; v_gift song_gifts;
begin
 select * into v_order from song_orders where id=p_order_id and user_id=p_user_id for update;
 if not found then raise exception 'order_not_found' using errcode='P0002';end if;
 if p_active and (v_order.paid_at is null or not exists(select 1 from song_assets where order_id=p_order_id and is_final)) then raise exception 'song_not_ready' using errcode='22023';end if;
 if p_active then
 insert into song_gifts(order_id,owner_user_id,token,active,greeting) values(p_order_id,p_user_id,p_token,true,p_greeting)
 on conflict(order_id) do update set owner_user_id=excluded.owner_user_id,token=excluded.token,active=true,greeting=excluded.greeting,updated_at=now() returning * into v_gift;
 else update song_gifts set active=false,updated_at=now() where order_id=p_order_id returning * into v_gift;end if;
 return jsonb_build_object('active',coalesce(v_gift.active,false),'token',case when v_gift.active then v_gift.token else null end,'greeting',coalesce(v_gift.greeting,''));
end;$$;
revoke all on function public.set_songgift_gift(uuid,uuid,boolean,text,text) from public,anon,authenticated;
grant execute on function public.set_songgift_gift(uuid,uuid,boolean,text,text) to service_role;

create table public.usage_events (
 id bigint generated always as identity primary key, session_id uuid not null, event_key uuid not null,
 event text not null check(event in ('page_view','story_submitted','lyrics_ready','checkout_started')),
 page text not null check(page in ('home','create','pricing','occasions','guide','help','lyrics')),
 first_source text not null, last_source text not null, medium text not null, campaign text not null,
 created_at timestamptz not null default now(),unique(session_id,event_key),
 check(first_source in ('direct','google','bing','facebook','instagram','tiktok','youtube','x','newsletter','referral')),
 check(last_source in ('direct','google','bing','facebook','instagram','tiktok','youtube','x','newsletter','referral')),
 check(medium in ('none','organic','social','email','cpc','referral')),check(campaign ~ '^[a-z0-9_-]{0,48}$')
);
create index usage_events_time_idx on public.usage_events(created_at desc);
create index usage_events_session_idx on public.usage_events(session_id,created_at desc);
create table public.song_order_attribution (
 order_id uuid primary key references public.song_orders(id) on delete cascade, session_id uuid not null, created_at timestamptz not null default now()
);
create index song_order_attribution_created_idx on public.song_order_attribution(created_at);
create index song_order_attribution_session_idx on public.song_order_attribution(session_id);
alter table public.usage_events enable row level security;
alter table public.song_order_attribution enable row level security;
revoke all on public.usage_events,public.song_order_attribution from public,anon,authenticated;
grant select,insert,delete on public.usage_events,public.song_order_attribution to service_role;
grant usage,select on sequence public.usage_events_id_seq to service_role;
-- Short-lived tombstones keep in-flight requests from recreating withdrawn data.
create table public.usage_optouts(session_id uuid primary key,expires_at timestamptz not null default now()+interval '30 days');
create index usage_optouts_expiry_idx on public.usage_optouts(expires_at);
alter table public.usage_optouts enable row level security;
revoke all on public.usage_optouts from public,anon,authenticated;
grant select,insert,delete on public.usage_optouts to service_role;
create function public.forget_songgift_usage(p_session uuid) returns void language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 perform pg_advisory_xact_lock(781246911);
 delete from usage_optouts where expires_at<now();
 -- Bound anonymous requests with invented IDs; existing data can always be withdrawn.
 if not exists(select 1 from usage_events where session_id=p_session)
    and not exists(select 1 from song_order_attribution where session_id=p_session)
    and not exists(select 1 from usage_optouts where session_id=p_session)
    and (select count(*) from usage_optouts where expires_at>=date_trunc('day',now())+interval '30 days')>=10000
 then raise exception 'usage_withdrawal_limit' using errcode='53400';end if;
 insert into usage_optouts(session_id) values(p_session) on conflict do nothing;
 delete from song_order_attribution where session_id=p_session;
 delete from usage_events where session_id=p_session;
end;$$;
revoke all on function public.forget_songgift_usage(uuid) from public,anon,authenticated;
grant execute on function public.forget_songgift_usage(uuid) to service_role;
create function public.record_songgift_usage(p_session uuid,p_key uuid,p_event text,p_page text,p_first text,p_last text,p_medium text,p_campaign text,p_order_id uuid default null,p_user_id uuid default null) returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 perform pg_advisory_xact_lock(781246911);
 delete from usage_optouts where expires_at<now();
 if exists(select 1 from usage_optouts where session_id=p_session) then return false;end if;
 if p_order_id is not null and not exists(select 1 from song_orders where id=p_order_id and user_id=p_user_id) then raise exception 'order_not_found' using errcode='P0002';end if;
 delete from song_order_attribution where created_at<now()-interval '30 days';
 delete from usage_events where created_at<now()-interval '30 days';
 if exists(select 1 from usage_events where session_id=p_session and event_key=p_key) then return true;end if;
 if (select count(*) from usage_events where created_at>=date_trunc('day',now()))>=10000 or
 (select count(*) from usage_events where session_id=p_session and created_at>now()-interval '1 minute')>=20 then return false;end if;
 insert into usage_events(session_id,event_key,event,page,first_source,last_source,medium,campaign) values(p_session,p_key,p_event,p_page,p_first,p_last,p_medium,p_campaign);
 if p_order_id is not null then insert into song_order_attribution(order_id,session_id) values(p_order_id,p_session) on conflict(order_id) do nothing;end if;
 return true;
end;$$;
revoke all on function public.record_songgift_usage(uuid,uuid,text,text,text,text,text,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.record_songgift_usage(uuid,uuid,text,text,text,text,text,text,uuid,uuid) to service_role;
create function public.songgift_usage_report(p_from timestamptz,p_to timestamptz) returns jsonb language sql security invoker set search_path=public,pg_temp as $$
 with window_events as(select * from usage_events where created_at>=greatest(p_from,now()-interval '30 days') and created_at<p_to),
 sources as(select first_source as source,count(*) filter(where event='page_view') as views,count(distinct session_id) as browsers from window_events group by first_source),
 steps as(select event,count(*) as events,count(distinct session_id) as browsers from window_events group by event)
 select jsonb_build_object('sources',coalesce((select jsonb_agg(s) from sources s),'[]'::jsonb),'steps',coalesce((select jsonb_agg(s) from steps s),'[]'::jsonb),
 'lastSources',coalesce((select jsonb_agg(s) from (select last_source as source,count(*) filter(where event='page_view') as views,count(distinct session_id) as browsers from window_events group by last_source) s),'[]'::jsonb),
 'campaigns',coalesce((select jsonb_agg(s) from (select campaign,count(*) as events,count(distinct session_id) as browsers from window_events where campaign<>'' group by campaign) s),'[]'::jsonb),
 'captures',(select count(*) from payment_transactions where environment='live' and transaction_type='capture' and occurred_at>=p_from and occurred_at<p_to),
 'delivered',(select count(distinct order_id) from song_assets where is_final and created_at>=p_from and created_at<p_to),
 'attributedCaptures',(select count(*) from payment_transactions p join song_order_attribution a on a.order_id=p.order_id where p.environment='live' and p.transaction_type='capture' and p.occurred_at>=p_from and p.occurred_at<p_to and exists(select 1 from usage_events e where e.session_id=a.session_id)),
 'attributedSources',coalesce((select jsonb_agg(s) from (select e.first_source as source,count(distinct p.id) as captures from payment_transactions p join song_order_attribution a on a.order_id=p.order_id join lateral (select first_source from usage_events where session_id=a.session_id order by created_at,id limit 1) e on true where p.environment='live' and p.transaction_type='capture' and p.occurred_at>=p_from and p.occurred_at<p_to group by e.first_source) s),'[]'::jsonb));
$$;
revoke all on function public.songgift_usage_report(timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.songgift_usage_report(timestamptz,timestamptz) to service_role;
commit;
