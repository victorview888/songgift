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
