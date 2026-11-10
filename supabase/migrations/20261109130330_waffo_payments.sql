-- Apply after the six existing admin/customer/delivery/draft migrations.
-- No historical rows, quotes, PayPal references or audio are rewritten.
begin;
alter table public.payment_transactions drop constraint payment_transactions_provider_check;
alter table public.payment_transactions add constraint payment_transactions_provider_check check (provider in ('paypal','waffo'));
alter table public.order_events drop constraint order_events_event_type_check;
alter table public.order_events add constraint order_events_event_type_check check (event_type in
 ('quote.created','payment.captured','payment.refunded','payment.review','generation.reserved','generation.bound','generation.state','generation.completed','admin.requested','admin.finished'));

create table public.waffo_checkouts (
 id uuid primary key default gen_random_uuid(),
 order_id uuid not null references public.song_orders(id),
 user_id uuid not null references auth.users(id),
 environment text not null check (environment in ('sandbox','live')),
 store_id text not null check (length(store_id) between 5 and 128),
 product_id text not null check (length(product_id) between 6 and 128),
 amount_minor integer not null check (amount_minor>0),
 currency text not null check (currency='USD'),
 buyer_email text not null check (length(buyer_email) between 3 and 254),
 success_url text not null check (success_url like 'https://%'),
 state text not null default 'creating' check (state in ('creating','ready','expired','paid','needs_review')),
 session_id text,
 checkout_url text,
 provider_order_id text,
 expires_at timestamptz not null default (now()+interval '1 hour'),
 created_at timestamptz not null default now(),
 unique(environment,session_id),
 unique(environment,provider_order_id)
);
create index waffo_checkouts_order_time_idx on public.waffo_checkouts(order_id,created_at desc);
create index waffo_checkouts_user_idx on public.waffo_checkouts(user_id);
create unique index waffo_checkouts_active_idx on public.waffo_checkouts(order_id) where state in ('creating','ready');
create table public.waffo_webhook_events (
 environment text not null check (environment in ('sandbox','live')),
 event_type text not null check (event_type in ('order.completed','refund.succeeded')),
 event_id text not null check (length(event_id) between 5 and 128),
 checkout_id uuid not null references public.waffo_checkouts(id),
 payload_hash text not null check (payload_hash ~ '^[a-f0-9]{64}$'),
 payment_id text not null check (length(payment_id) between 5 and 128),
 provider_order_id text not null check (length(provider_order_id) between 5 and 128),
 amount_minor integer not null check (amount_minor>0),
 outcome text not null check (outcome in ('recorded','needs_review')),
 created_at timestamptz not null default now(),
 primary key(environment,event_type,event_id)
);
create index waffo_events_checkout_idx on public.waffo_webhook_events(checkout_id);
alter table public.waffo_checkouts enable row level security;
alter table public.waffo_webhook_events enable row level security;
revoke all on public.waffo_checkouts,public.waffo_webhook_events from public,anon,authenticated,service_role;
grant select,insert,update on public.waffo_checkouts to service_role;
grant select,insert on public.waffo_webhook_events to service_role;

create function public.begin_songgift_waffo_checkout(p_order_id uuid,p_user_id uuid,p_environment text,p_store_id text,p_product_id text,p_email text,p_success_url text)
returns public.waffo_checkouts language plpgsql set search_path='' as $$
declare o public.song_orders; c public.waffo_checkouts;
begin
 select * into o from public.song_orders where id=p_order_id and user_id=p_user_id for update;
 if not found then raise exception 'order_not_found'; end if;
 if o.paid_at is not null then raise exception 'already_paid'; end if;
 if o.quoted_at is null or o.payment_environment is distinct from p_environment then raise exception 'payment_mismatch'; end if;
 if exists(select 1 from public.waffo_checkouts where order_id=o.id and state='needs_review') then raise exception 'payment_needs_review'; end if;
 select * into c from public.waffo_checkouts where order_id=o.id and state in ('creating','ready') for update;
 if found and c.expires_at>now() then
  if (c.environment,c.store_id,c.product_id) is distinct from (p_environment,p_store_id,p_product_id) then raise exception 'payment_mismatch'; end if;
  return c;
 end if;
 update public.waffo_checkouts set state='expired' where order_id=o.id and state in ('creating','ready');
 insert into public.waffo_checkouts(order_id,user_id,environment,store_id,product_id,amount_minor,currency,buyer_email,success_url)
 values(o.id,o.user_id,p_environment,p_store_id,p_product_id,o.quoted_amount_minor,o.currency,p_email,p_success_url) returning * into c;
 return c;
end $$;

create function public.bind_songgift_waffo_checkout(p_checkout_id uuid,p_user_id uuid,p_session_id text,p_url text,p_expires_at timestamptz)
returns public.waffo_checkouts language plpgsql set search_path='' as $$
declare c public.waffo_checkouts;
begin
 select * into c from public.waffo_checkouts where id=p_checkout_id and user_id=p_user_id for update;
 if not found then raise exception 'order_not_found'; end if;
 if c.session_id is not null and (c.session_id,c.checkout_url) is distinct from (p_session_id,p_url) then raise exception 'payment_mismatch'; end if;
 if p_session_id is null or length(p_session_id)>128 or p_url is null or length(p_url)>4096 or p_expires_at is null then raise exception 'payment_mismatch'; end if;
 update public.waffo_checkouts set session_id=p_session_id,checkout_url=p_url,expires_at=p_expires_at,
 state=case when state='creating' then 'ready' else state end where id=c.id returning * into c;
 return c;
end $$;

-- A single transaction commits the verified event, ledger entry and paid state.
-- The order lock is always taken before checkout locks, including concurrent callbacks.
create function public.record_songgift_waffo_event(p_checkout_id uuid,p_environment text,p_store_id text,p_event_type text,p_event_id text,p_payload_hash text,p_payment_id text,p_provider_order_id text,p_amount_minor integer,p_currency text,p_occurred_at timestamptz)
returns jsonb language plpgsql set search_path='' as $$
declare c public.waffo_checkouts; o public.song_orders; e public.waffo_webhook_events; t public.payment_transactions; outcome text:='recorded'; tx uuid;
begin
 select * into c from public.waffo_checkouts where id=p_checkout_id;
 if not found then return jsonb_build_object('outcome','ignored'); end if;
 select * into o from public.song_orders where id=c.order_id for update;
 select * into c from public.waffo_checkouts where id=p_checkout_id for update;
 if (c.environment,c.store_id) is distinct from (p_environment,p_store_id) then raise exception 'payment_mismatch'; end if;
 select * into e from public.waffo_webhook_events where environment=p_environment and event_type=p_event_type and event_id=p_event_id;
 if found then
  if e.checkout_id is distinct from c.id or e.payload_hash is distinct from p_payload_hash then raise exception 'payment_mismatch'; end if;
  return jsonb_build_object('outcome',e.outcome,'replayed',true);
 end if;
 if p_occurred_at is null or p_occurred_at>now()+interval '1 minute' or p_amount_minor is null or p_amount_minor<=0 then raise exception 'payment_mismatch'; end if;
 if p_currency is distinct from c.currency or o.user_id is distinct from c.user_id or o.payment_environment is distinct from c.environment
  or o.quoted_amount_minor is distinct from c.amount_minor then outcome:='needs_review'; end if;
 if p_event_type='order.completed' then
  select * into t from public.payment_transactions where order_id=o.id and transaction_type='capture';
  if p_amount_minor is distinct from c.amount_minor or (t.id is not null and (t.provider,t.external_id,t.environment) is distinct from ('waffo',p_payment_id,p_environment))
   or (c.provider_order_id is not null and c.provider_order_id<>p_provider_order_id) then outcome:='needs_review'; end if;
  if outcome='recorded' then
   insert into public.payment_transactions(order_id,provider,environment,transaction_type,external_id,amount_minor,currency,occurred_at)
   values(o.id,'waffo',p_environment,'capture',p_payment_id,p_amount_minor,p_currency,p_occurred_at)
   on conflict(provider,environment,transaction_type,external_id) do nothing returning id into tx;
   if tx is null then raise exception 'payment_mismatch'; end if;
   update public.song_orders set paid_at=p_occurred_at,status=case when status in ('draft','lyrics_ready','paid') then 'paid' else status end,updated_at=now() where id=o.id;
   update public.waffo_checkouts set state='paid',provider_order_id=p_provider_order_id where id=c.id;
  end if;
 elsif p_event_type='refund.succeeded' then
  select * into t from public.payment_transactions where order_id=o.id and provider='waffo' and environment=p_environment and transaction_type='capture' and external_id=p_payment_id;
  if not found then raise exception 'capture_not_recorded'; end if;
  if c.provider_order_id is distinct from p_provider_order_id or
    p_amount_minor+coalesce((select sum(amount_minor) from public.payment_transactions where order_id=o.id and transaction_type='refund'),0)>t.amount_minor then outcome:='needs_review'; end if;
  if outcome='recorded' then
   insert into public.payment_transactions(order_id,provider,environment,transaction_type,external_id,amount_minor,currency,occurred_at)
   values(o.id,'waffo',p_environment,'refund',p_event_id,p_amount_minor,p_currency,p_occurred_at) returning id into tx;
  end if;
 else raise exception 'payment_mismatch'; end if;
 if outcome='needs_review' then update public.waffo_checkouts set state='needs_review' where id=c.id; end if;
 insert into public.waffo_webhook_events(environment,event_type,event_id,checkout_id,payload_hash,payment_id,provider_order_id,amount_minor,outcome)
 values(p_environment,p_event_type,p_event_id,c.id,p_payload_hash,p_payment_id,p_provider_order_id,p_amount_minor,outcome);
 insert into public.order_events(order_id,event_key,event_type,actor_type,reference_id,state)
 values(o.id,'waffo:'||p_environment||':'||p_event_type||':'||p_event_id,
 case when outcome='needs_review' then 'payment.review' when p_event_type='refund.succeeded' then 'payment.refunded' else 'payment.captured' end,'system',coalesce(tx,c.id),case when outcome='needs_review' then 'needs_review' else null end);
 return jsonb_build_object('outcome',outcome);
end $$;

-- A completed PayPal capture racing a Waffo payment must retain its evidence.
create table public.payment_capture_reviews (
 id uuid primary key default gen_random_uuid(),
 order_id uuid not null references public.song_orders(id),
 provider text not null check(provider='paypal'),
 environment text not null check(environment in ('sandbox','live')),
 external_id text not null check(length(external_id) between 1 and 128),
 amount_minor integer not null check(amount_minor>0),
 currency text not null check(currency='USD'),
 occurred_at timestamptz not null,
 unique(provider,environment,external_id)
);
create index payment_capture_reviews_order_idx on public.payment_capture_reviews(order_id);
alter table public.payment_capture_reviews enable row level security;
revoke all on public.payment_capture_reviews from public,anon,authenticated,service_role;
grant select,insert on public.payment_capture_reviews to service_role;
create function public.record_songgift_paypal_capture_checked(p_order_id uuid,p_user_id uuid,p_paypal_order_id text,p_capture_id text,p_environment text,p_amount_minor integer,p_currency text,p_occurred_at timestamptz)
returns jsonb language plpgsql set search_path='' as $$
declare o public.song_orders; t public.payment_transactions; r public.payment_capture_reviews;
begin
 select * into o from public.song_orders where id=p_order_id and user_id=p_user_id for update;
 if not found then raise exception 'order_not_found'; end if;
 if o.paypal_order_id is distinct from p_paypal_order_id or o.payment_environment is distinct from p_environment
  or o.quoted_amount_minor is distinct from p_amount_minor or o.currency is distinct from p_currency then raise exception 'payment_mismatch'; end if;
 select * into t from public.payment_transactions where order_id=o.id and transaction_type='capture';
 if t.id is not null and (t.provider,t.external_id,t.environment) is distinct from ('paypal',p_capture_id,p_environment) then
  insert into public.payment_capture_reviews(order_id,provider,environment,external_id,amount_minor,currency,occurred_at)
   values(o.id,'paypal',p_environment,p_capture_id,p_amount_minor,p_currency,p_occurred_at)
   on conflict(provider,environment,external_id) do nothing;
  select * into r from public.payment_capture_reviews where provider='paypal' and environment=p_environment and external_id=p_capture_id;
  if r.order_id is distinct from o.id then raise exception 'capture_conflict'; end if;
  insert into public.order_events(order_id,event_key,event_type,actor_type,reference_id,state)
   values(o.id,'paypal-review:'||r.id,'payment.review','system',r.id,'needs_review') on conflict(event_key) do nothing;
  return jsonb_build_object('id',r.id,'review_required',true);
 end if;
 t:=public.record_songgift_capture(p_order_id,p_user_id,p_paypal_order_id,p_capture_id,p_environment,p_amount_minor,p_currency,p_occurred_at);
 return jsonb_build_object('id',t.id);
end $$;
revoke all on function public.record_songgift_paypal_capture_checked(uuid,uuid,text,text,text,integer,text,timestamptz) from public,anon,authenticated;
grant execute on function public.record_songgift_paypal_capture_checked(uuid,uuid,text,text,text,integer,text,timestamptz) to service_role;

-- Preserve existing delivery; a fully refunded Waffo purchase cannot start a new paid generation.
create function public.check_songgift_waffo_generation() returns trigger language plpgsql set search_path='' as $$
begin
 if exists(select 1 from public.payment_capture_reviews where order_id=new.order_id) or exists(select 1 from public.waffo_checkouts where order_id=new.order_id and state='needs_review') or exists(
  select 1 from public.payment_transactions t where t.order_id=new.order_id and t.provider='waffo' and t.transaction_type='capture'
  and coalesce((select sum(r.amount_minor) from public.payment_transactions r where r.order_id=t.order_id and r.provider='waffo' and r.transaction_type='refund'),0)>=t.amount_minor
 ) then raise exception 'payment_needs_review'; end if;
 return new;
end $$;
create trigger songgift_waffo_generation before insert on public.generation_jobs for each row execute function public.check_songgift_waffo_generation();
revoke all on function public.begin_songgift_waffo_checkout(uuid,uuid,text,text,text,text,text),public.bind_songgift_waffo_checkout(uuid,uuid,text,text,timestamptz),public.record_songgift_waffo_event(uuid,text,text,text,text,text,text,text,integer,text,timestamptz),public.check_songgift_waffo_generation() from public,anon,authenticated;
grant execute on function public.begin_songgift_waffo_checkout(uuid,uuid,text,text,text,text,text),public.bind_songgift_waffo_checkout(uuid,uuid,text,text,timestamptz),public.record_songgift_waffo_event(uuid,text,text,text,text,text,text,text,integer,text,timestamptz),public.check_songgift_waffo_generation() to service_role;
commit;
