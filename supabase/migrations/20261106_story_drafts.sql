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
