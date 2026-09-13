-- Owner, 13 Sep 2026: "how do I add, edit, modify, see status — each, all the details". The Sync page becomes
-- editable: one upsert, one on/off switch, one schedule change that really moves the cron job, one run
-- history per sync. Admin-gated (f_caller_is_admin); schedule changes and Run now stay owner/executive.

create or replace function public.f_sync_upsert(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, cron as $$
declare k text; v_kind text; v_job text;
begin
  if not public.f_caller_is_admin() then raise exception 'Owner, executive or admin only.' using errcode = '42501'; end if;
  k := lower(btrim(coalesce(p->>'key', '')));
  if k !~ '^[a-z0-9_]{3,40}$' then raise exception 'Key must be 3–40 characters: a–z, 0–9, underscore.'; end if;
  v_kind := coalesce(p->>'kind', 'cron');
  if v_kind not in ('edge_function','cron','rpc','bridge') then raise exception 'Kind must be edge_function, cron, rpc or bridge.'; end if;
  if nullif(btrim(coalesce(p->>'label','')),'') is null then raise exception 'A sync needs a name.'; end if;
  if nullif(btrim(coalesce(p->>'runner','')),'') is null then raise exception 'A sync needs a runner: an edge function path, a cron job name, or a function name.'; end if;
  v_job := nullif(btrim(coalesce(p->>'cron_jobname','')), '');
  if v_job is not null and not exists (select 1 from cron.job where jobname = v_job) then
    raise exception 'No cron job called "%". Existing jobs are listed on the page; leave it blank for a manual sync.', v_job;
  end if;
  insert into public.sync_registry (key, system, label, what, kind, runner, cron_jobname, schedule, secrets, run_source, lane, enabled, sort, note, updated_at)
  values (k, coalesce(nullif(btrim(p->>'system'),''), 'OS'), btrim(p->>'label'), coalesce(p->>'what', ''), v_kind, btrim(p->>'runner'), v_job,
          coalesce((select schedule from cron.job where jobname = v_job), nullif(p->>'schedule',''), case when v_kind = 'bridge' then 'on change (trigger)' else 'manual' end),
          coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(p->'secrets', '[]'::jsonb)) x), '{}'),
          coalesce(nullif(p->>'run_source',''), case when v_job is not null then 'cron' else 'none' end),
          nullif(p->>'lane',''), coalesce((p->>'enabled')::boolean, true), coalesce((p->>'sort')::int, 100), nullif(p->>'note',''), now())
  on conflict (key) do update set
    system = excluded.system, label = excluded.label, what = excluded.what, kind = excluded.kind, runner = excluded.runner,
    cron_jobname = excluded.cron_jobname, schedule = excluded.schedule, secrets = excluded.secrets, run_source = excluded.run_source,
    lane = excluded.lane, enabled = excluded.enabled, sort = excluded.sort, note = excluded.note, updated_at = now();
  return jsonb_build_object('ok', true, 'key', k);
end $$;

create or replace function public.f_sync_set_enabled(p_key text, p_enabled boolean) returns jsonb
language plpgsql security definer set search_path = public, cron as $$
declare r public.sync_registry%rowtype; j record;
begin
  if not public.f_caller_is_admin() then raise exception 'Owner, executive or admin only.' using errcode = '42501'; end if;
  update public.sync_registry set enabled = p_enabled, updated_at = now() where key = p_key returning * into r;
  if r.key is null then raise exception 'No sync called %.', p_key; end if;
  -- a scheduled sync that is switched off stops running; switched on, it runs again
  if r.cron_jobname is not null then
    select * into j from cron.job where jobname = r.cron_jobname;
    if j.jobid is not null and j.active <> p_enabled then perform cron.alter_job(j.jobid, active := p_enabled); end if;
  end if;
  return jsonb_build_object('ok', true, 'key', p_key, 'enabled', p_enabled, 'cron_job', r.cron_jobname);
end $$;

create or replace function public.f_sync_set_schedule(p_key text, p_schedule text) returns jsonb
language plpgsql security definer set search_path = public, cron as $$
declare r public.sync_registry%rowtype; j record;
begin
  if not (public.current_app_role()::text in ('owner','executive')) then raise exception 'Only the owner or an executive may change a schedule.' using errcode = '42501'; end if;
  select * into r from public.sync_registry where key = p_key;
  if r.key is null then raise exception 'No sync called %.', p_key; end if;
  if r.cron_jobname is null then raise exception 'This sync has no cron job; it runs manually or on change.'; end if;
  select * into j from cron.job where jobname = r.cron_jobname;
  if j.jobid is null then raise exception 'Cron job % no longer exists.', r.cron_jobname; end if;
  perform cron.alter_job(j.jobid, schedule := p_schedule);   -- pg_cron rejects a bad expression here
  update public.sync_registry set schedule = p_schedule, updated_at = now() where key = p_key;
  return jsonb_build_object('ok', true, 'key', p_key, 'schedule', p_schedule);
end $$;

create or replace function public.f_sync_runs(p_key text, p_limit int default 20)
returns table (started_at timestamptz, finished_at timestamptz, status text, records bigint, detail text, source text)
language plpgsql stable security definer set search_path = public, cron as $$
declare r public.sync_registry%rowtype; src text; pat text;
begin
  select * into r from public.sync_registry where key = p_key;
  if r.key is null then return; end if;
  src := split_part(r.run_source, ':', 1); pat := split_part(r.run_source, ':', 2);
  if src = 'metrc' then
    return query select m.started_at, m.finished_at, m.status, m.records::bigint, coalesce(left(m.error, 300), left(m.note, 300)), m.endpoint || ' · ' || coalesce(m.license, '-')
      from public.metrc_sync_runs m where (pat = '' or m.endpoint ilike '%' || pat || '%') order by m.started_at desc limit p_limit;
  elsif src = 'apex' then
    return query select a.started_at, a.finished_at, a.status, coalesce(a.rows_written, a.rows_seen)::bigint, left(a.error, 300), a.entity
      from public.apex_sync_run a order by a.started_at desc limit p_limit;
  elsif src = 'cron' and r.cron_jobname is not null then
    return query select d.start_time, d.end_time, case d.status when 'succeeded' then 'ok' else d.status end, null::bigint, left(d.return_message, 300), r.cron_jobname
      from cron.job_run_details d join cron.job j on j.jobid = d.jobid where j.jobname = r.cron_jobname order by d.start_time desc limit p_limit;
  end if;
  return query select s.requested_at, null::timestamptz, case when s.error is not null then 'error' else coalesce(s.result, 'requested') end, null::bigint, coalesce(s.error, s.result), 'Run now (' || s.method || ')'
    from public.sync_registry_run s where s.key = p_key order by s.requested_at desc limit p_limit;
end $$;

create or replace function public.f_cron_jobs()
returns table (jobname text, schedule text, active boolean, command text)
language sql stable security definer set search_path = public, cron as $$
  select j.jobname, j.schedule, j.active, left(j.command, 160) from cron.job j where public.f_caller_is_admin() order by j.jobname
$$;

grant execute on function public.f_sync_upsert(jsonb), public.f_sync_set_enabled(text, boolean), public.f_sync_set_schedule(text, text), public.f_sync_runs(text, int), public.f_cron_jobs() to authenticated;;
