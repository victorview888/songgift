-- Additive, service-only report intake and an audited administrator review queue.
create table public.content_reports (
  id uuid primary key,
  category text not null check (category in ('sexual','violence','hate','child_safety','impersonation','intellectual_property','other','appeal')),
  content_reference text not null check (char_length(content_reference) between 1 and 1000),
  details text not null check (char_length(details) between 20 and 4000),
  contact_email text check (char_length(contact_email) <= 254),
  input_hash text not null check (input_hash ~ '^[a-f0-9]{64}$'),
  status text not null default 'received' check (status in ('received','reviewing','needs_information','action_taken','no_violation')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index content_reports_queue_idx on public.content_reports(status,created_at desc,id desc);
create table public.content_report_limits (
  network_hash text not null check (network_hash ~ '^[a-f0-9]{64}$'),
  window_start timestamptz not null,
  submissions integer not null check (submissions between 1 and 5),
  primary key (network_hash,window_start)
);
create table public.content_report_reviews (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  report_id uuid not null references public.content_reports(id),
  actor_user_id uuid not null,
  status text not null check (status in ('reviewing','needs_information','action_taken','no_violation')),
  note text not null check (char_length(note) between 10 and 2000),
  created_at timestamptz not null default now()
);
alter table public.content_reports enable row level security;
alter table public.content_report_limits enable row level security;
alter table public.content_report_reviews enable row level security;
revoke all on public.content_reports,public.content_report_limits,public.content_report_reviews from public,anon,authenticated;
grant select,insert,update on public.content_reports,public.content_report_limits to service_role;
grant select,insert on public.content_report_reviews to service_role;
grant delete on public.content_report_limits to service_role;

create function public.submit_songgift_content_report(p_id uuid,p_category text,p_reference text,p_details text,p_email text,p_input_hash text,p_network_hash text)
returns jsonb language plpgsql set search_path = '' as $$
declare old public.content_reports; hits integer; bucket timestamptz := date_trunc('hour',now());
begin
  -- Serialize one receipt across concurrent retries before consuming its rate allowance.
  perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
  select * into old from public.content_reports where id=p_id;
  if found then
    if old.input_hash<>p_input_hash then raise exception 'report_conflict'; end if;
    return jsonb_build_object('reference',old.id);
  end if;
  delete from public.content_report_limits where window_start<now()-interval '2 days';
  insert into public.content_report_limits(network_hash,window_start,submissions) values(p_network_hash,bucket,1)
    on conflict(network_hash,window_start) do update set submissions=public.content_report_limits.submissions+1
    where public.content_report_limits.submissions<5 returning submissions into hits;
  if hits is null then raise exception 'report_rate_limit'; end if;
  insert into public.content_reports(id,category,content_reference,details,contact_email,input_hash)
    values(p_id,p_category,p_reference,p_details,p_email,p_input_hash);
  return jsonb_build_object('reference',p_id);
end; $$;

create function public.review_songgift_content_report(p_id uuid,p_actor_id uuid,p_status text,p_note text,p_request_id uuid,p_expected_updated_at timestamptz)
returns jsonb language plpgsql set search_path = '' as $$
declare r public.content_reports; prior public.content_report_reviews;
begin
  perform 1 from public.admin_members where user_id=p_actor_id and active and role='owner' for share;
  if not found then raise exception 'admin_denied'; end if;
  select * into r from public.content_reports where id=p_id for update;
  if not found then raise exception 'report_not_found'; end if;
  select * into prior from public.content_report_reviews where request_id=p_request_id;
  if found then
    if prior.report_id<>p_id or prior.actor_user_id<>p_actor_id or prior.status<>p_status or prior.note<>p_note then raise exception 'report_conflict'; end if;
    return jsonb_build_object('id',r.id,'status',r.status,'updatedAt',r.updated_at);
  end if;
  if r.updated_at<>p_expected_updated_at then raise exception 'report_conflict'; end if;
  insert into public.content_report_reviews(request_id,report_id,actor_user_id,status,note) values(p_request_id,p_id,p_actor_id,p_status,p_note);
  update public.content_reports set status=p_status,updated_at=clock_timestamp() where id=p_id returning * into r;
  return jsonb_build_object('id',r.id,'status',r.status,'updatedAt',r.updated_at);
end; $$;
revoke all on function public.submit_songgift_content_report(uuid,text,text,text,text,text,text) from public,anon,authenticated;
revoke all on function public.review_songgift_content_report(uuid,uuid,text,text,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.submit_songgift_content_report(uuid,text,text,text,text,text,text) to service_role;
grant execute on function public.review_songgift_content_report(uuid,uuid,text,text,uuid,timestamptz) to service_role;
