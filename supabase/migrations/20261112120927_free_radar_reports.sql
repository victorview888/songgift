-- Public-source radar reports only. No customer/order data or external credentials.
create table public.radar_reports (
  id text primary key check (id ~ '^[0-9]{1,20}-[1-9][0-9]{0,4}$'),
  run_id text not null check (run_id ~ '^[0-9]{1,20}$'),
  run_attempt integer not null check (run_attempt between 1 and 99999),
  commit_sha text not null check (commit_sha ~ '^[a-f0-9]{40}$'),
  generated_at timestamptz not null,
  created_at timestamptz not null default now(),
  status text not null check (status in ('complete', 'partial', 'failed')),
  source_count integer not null check (source_count between 1 and 12),
  error_count integer not null check (error_count between 0 and source_count),
  item_count integer not null check (item_count between 0 and 60),
  content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  report jsonb not null check (jsonb_typeof(report) = 'object' and octet_length(report::text) <= 196608),
  check (id = run_id || '-' || run_attempt::text)
);
create index radar_reports_created_idx on public.radar_reports (created_at desc, id desc);
alter table public.radar_reports enable row level security;
revoke all on public.radar_reports from public, anon, authenticated;
grant select, insert, delete on public.radar_reports to service_role;

create function public.store_songgift_radar_report(p_report jsonb, p_hash text)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_id text := (p_report->>'runId') || '-' || (p_report->>'runAttempt');
  v_sources integer;
  v_errors integer;
  v_active integer;
  v_hash text;
  v_inserted integer;
begin
  if p_report->>'schemaVersion' is distinct from '1' or jsonb_typeof(p_report->'sources') is distinct from 'array'
     or jsonb_typeof(p_report->'items') is distinct from 'array' then
    raise exception 'Invalid report' using errcode = '22023';
  end if;
  select count(*), count(*) filter (where value->>'status' = 'error'),
    count(*) filter (where value->>'status' in ('ok', 'baseline'))
    into v_sources, v_errors, v_active from jsonb_array_elements(p_report->'sources');
  -- Serialize idempotency + bounded retention, without locking any business table.
  perform pg_advisory_xact_lock(781246910);
  insert into public.radar_reports (id, run_id, run_attempt, commit_sha, generated_at, status, source_count, error_count, item_count, content_hash, report)
    values (v_id, p_report->>'runId', (p_report->>'runAttempt')::integer, p_report->>'commitSha',
      (p_report->>'generatedAt')::timestamptz,
      case when v_active = 0 then 'failed' when v_errors > 0 then 'partial' else 'complete' end,
      v_sources, v_errors, jsonb_array_length(p_report->'items'), p_hash, p_report)
    on conflict (id) do nothing;
  get diagnostics v_inserted = row_count;
  select content_hash into v_hash from public.radar_reports where id = v_id;
  if v_hash is distinct from p_hash then
    raise exception 'Report id conflict' using errcode = '23505';
  end if;
  delete from public.radar_reports where created_at < now() - interval '30 days';
  delete from public.radar_reports where id in (
    select id from public.radar_reports order by created_at desc, id desc offset 60
  );
  return jsonb_build_object('id', v_id, 'duplicate', v_inserted = 0);
end;
$$;
revoke all on function public.store_songgift_radar_report(jsonb, text) from public, anon, authenticated;
grant execute on function public.store_songgift_radar_report(jsonb, text) to service_role;
