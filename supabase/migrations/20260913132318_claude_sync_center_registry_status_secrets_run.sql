-- Sync & Connections — one page for every sync and every secret in the OS (owner, 13 Sep 2026).
-- One definition of "a sync" (sync_registry, job level; sync_item stays the per-endpoint detail under it),
-- one list of secrets across the two stores, one dispatcher that every Run button calls.

-- ── 1. the registry ──────────────────────────────────────────────────────────────────────────
create table if not exists public.sync_registry (
  key          text primary key,
  system       text not null,
  label        text not null,
  what         text not null,
  kind         text not null check (kind in ('edge_function','cron','rpc','bridge')),
  runner       text not null,                -- edge function path (query allowed), cron jobname, or rpc name
  cron_jobname text,                         -- the cron job that schedules it, if any
  schedule     text,                         -- human schedule; filled from cron.job when cron_jobname is set
  secrets      text[] not null default '{}', -- secret names it needs (integration_secrets / app_secrets)
  run_source   text not null default 'none', -- metrc:<endpoint pattern> | apex | cron | none
  lane         text,
  enabled      boolean not null default true,
  sort         integer not null default 100,
  note         text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
comment on table public.sync_registry is 'Every sync in the OS, one row each. The Sync & Connections page reads f_sync_status() over this; Run now calls f_sync_run(key).';
alter table public.sync_registry enable row level security;
drop policy if exists sync_registry_read on public.sync_registry;
create policy sync_registry_read on public.sync_registry for select to authenticated using (true);
drop policy if exists sync_registry_write on public.sync_registry;
create policy sync_registry_write on public.sync_registry for all to authenticated
  using (public.f_caller_is_admin()) with check (public.f_caller_is_admin());

insert into public.sync_registry (key, system, label, what, kind, runner, cron_jobname, secrets, run_source, lane, sort, note) values
 ('metrc_delta',        'Metrc',   'Metrc delta sync',            'Packages, plants, harvests, plant batches, transfers changed since the last cursor. The dispatcher runs it every 5 minutes; Run now runs one pass.', 'edge_function', 'metrc-sync', 'metrc-dispatcher', '{METRC_LICENSES,METRC_VENDOR_KEYS,METRC_USER_KEY,METRC_STATE,TG_ADMIN_KEY,SUPABASE_ANON_KEY}', 'metrc:(delta)', 'GPT', 10, null),
 ('metrc_nightly_full', 'Metrc',   'Metrc nightly full sweep',    'Every delta endpoint re-walked from history start; the cursor moves only on a complete run.', 'cron', 'tg_metrc_nightly', 'metrc-nightly-full', '{METRC_LICENSES,METRC_VENDOR_KEYS,METRC_USER_KEY}', 'metrc:(full sweep)', 'GPT', 11, null),
 ('metrc_backfill',     'Metrc',   'Metrc backfill queue',        'Claimed historical windows, one attempt every 3 minutes until the queue is empty.', 'cron', 'tg_metrc_backfill_next', 'metrc-backfill', '{METRC_LICENSES,METRC_VENDOR_KEYS,METRC_USER_KEY}', 'metrc:backfill', 'GPT', 12, null),
 ('metrc_reference',    'Metrc',   'Metrc reference data',        'Items, strains, locations, units and the catalogue.', 'edge_function', 'metrc-reference-sync?mode=reference', 'metrc-reference', '{METRC_LICENSES,METRC_VENDOR_KEYS,METRC_USER_KEY}', 'metrc:reference', 'GPT', 13, null),
 ('metrc_documents',    'Metrc',   'Metrc documents (manifests, COAs)', 'Document links nightly at 05:30; the file backfill runs every 15 minutes overnight.', 'edge_function', 'metrc-documents?mode=both&limit=200', 'metrc-documents-backfill', '{METRC_LICENSES,METRC_VENDOR_KEYS,METRC_USER_KEY}', 'metrc:documents', 'Claude', 14, null),
 ('metrc_lab',          'Metrc',   'Metrc lab results',           'Lab test results per package.', 'edge_function', 'metrc-lab-sync', null, '{METRC_LICENSES,METRC_VENDOR_KEYS,METRC_USER_KEY}', 'metrc:lab', 'Claude', 15, 'Manual today; no cron.'),
 ('metrc_retire',       'Metrc',   'Retire untouched packages',   'After a complete full sweep, packages Metrc no longer returns are marked retired in the mirror.', 'cron', 'f_metrc_retire_untouched_after_full_sweep', 'retire-untouched-packages', '{}', 'cron', 'GPT', 16, null),
 ('apex_delta',         'Apex',    'Apex delta (orders, buyers, products, batches, COAs)', 'Read-only pull of what changed; entities inside their refresh window are skipped because Apex bills by API credit.', 'edge_function', 'apex-sync', 'apex-sync-daily', '{APEX_API_KEY}', 'apex', 'GPT', 20, null),
 ('sheet_fg',           'Google Sheets', 'Finished-goods sheet',  'All nine product tabs + 3rd-party material, header-locked; Metrc overrides on any disagreement, the sheet value kept as a note.', 'edge_function', 'sheet-sync', 'sheet-sync-daily', '{TG_ADMIN_KEY}', 'metrc:google_sheet', 'Claude', 30, null),
 ('sheet_reconcile',    'Google Sheets', 'Sheet reconciliation', 'Hourly compare of the sheet mirror against Metrc; discrepancies logged for the weekly review.', 'cron', 'agent_sheet_reconciliation', 'sheet-reconciliation', '{}', 'cron', 'Claude', 31, null),
 ('vault_pull',         'Google Sheets', 'Vault sheet pull',      'Pulls the vault workbook (harvest and finish vault tabs).', 'edge_function', 'vault-pull', null, '{TG_ADMIN_KEY}', 'none', 'Claude', 32, 'Manual today; no cron.'),
 ('vault_push',         'Google Sheets', 'Vault sheet push',      'Writes the OS view back to the vault workbook.', 'edge_function', 'vault-push', null, '{TG_ADMIN_KEY}', 'none', 'Claude', 33, 'Manual today; no cron.'),
 ('clickup_pull',       'ClickUp', 'ClickUp workspace pull',      'Every space, list and task (open + closed, subtasks, custom fields).', 'edge_function', 'clickup-sync', null, '{CLICKUP_TOKEN}', 'metrc:clickup', 'Claude', 40, 'Manual today; no cron.'),
 ('clickup_hr_push',    'ClickUp', 'HR tasks → ClickUp',          'Pushes approved HR tasks from the outbox to ClickUp.', 'edge_function', 'hr-clickup-push', null, '{CLICKUP_TOKEN}', 'none', 'Claude', 41, null),
 ('docs_parse',         'Documents', 'Parse documents (COAs, manifests)', 'Parses stored PDFs into coa_extract / manifest_extract; daily at 08:45 plus an overnight backfill.', 'edge_function', 'parse-documents?kind=both&limit=200', 'parse-documents-daily', '{}', 'cron', 'Claude', 50, null),
 ('report_ingest',      'Documents', 'Report ingest (uploads)',   'Metrc / Apex report uploads from the Reports page and pushreports.py.', 'edge_function', 'report-ingest', null, '{TG_ADMIN_KEY}', 'none', 'Claude', 51, 'Runs when a report is uploaded.'),
 ('hr_people_bridge',   'HR platform', 'People → HR platform',     'Every employee and OS login mirrored into hr.people / assignments by trigger; Run now re-syncs everyone.', 'bridge', 'hr.sync_people_from_os', null, '{}', 'none', 'Claude', 60, 'Trigger on employees and app_users; this button re-runs the full pass.'),
 ('punch_queue_drain',  'HR platform', 'Offline punch queue drain', 'Punches captured offline are applied every 5 minutes.', 'cron', 'f_drain_punch_queue', 'hr-drain-punch-queue', '{}', 'cron', 'Claude', 61, null),
 ('alerts_send',        'Alerts',  'Alert e-mails',               'Approved alerts sent at :45, deliveries confirmed at :50. Recipients are rows the owner edits.', 'cron', 'tg_send_alert_emails', 'alert-email-send', '{ALERT_EMAIL_API_KEY}', 'cron', 'Claude', 70, null),
 ('dash_refresh',       'OS',      'Dashboards refresh',          'Tiles, Control Tower and reports re-materialised on their own cadence.', 'cron', 'tg_refresh_dashboards', 'refresh-dashboards', '{}', 'cron', 'Claude', 80, null),
 ('tower_refresh',      'OS',      'Control Tower refresh',       'Control Tower rollups every 5 minutes.', 'cron', 'tg_refresh_tower', 'refresh-tower', '{}', 'cron', 'Claude', 81, null),
 ('reports_refresh',    'OS',      'Reports refresh',             'Report matviews twice an hour.', 'cron', 'tg_refresh_reports', 'refresh-reports', '{}', 'cron', 'Claude', 82, null),
 ('matview_heal',       'OS',      'Stale matview healer',        'Any materialised view older than its cadence is refreshed.', 'cron', 'f_heal_stale_matviews', 'heal-stale-matviews', '{}', 'cron', 'Watchdog', 83, null)
on conflict (key) do nothing;

-- schedule text from the cron table, kept current by the status function
update public.sync_registry r set schedule = j.schedule from cron.job j where j.jobname = r.cron_jobname and r.schedule is distinct from j.schedule;
update public.sync_registry set schedule = 'manual' where cron_jobname is null and schedule is null and kind <> 'bridge';
update public.sync_registry set schedule = 'on change (trigger)' where kind = 'bridge';

-- ── 2. every run of a registry row, whatever table holds it ──────────────────────────────────
create or replace function public.f_sync_last_run(p_key text)
returns table (last_started timestamptz, last_finished timestamptz, last_status text, last_records bigint, last_error text, runs_24h bigint, failed_24h bigint)
language plpgsql stable security definer set search_path = public, cron as $$
declare r public.sync_registry%rowtype; src text; pat text;
begin
  select * into r from public.sync_registry where key = p_key;
  if r.key is null then return; end if;
  src := split_part(r.run_source, ':', 1); pat := split_part(r.run_source, ':', 2);
  if src = 'metrc' then
    return query
      with x as (select * from public.metrc_sync_runs m where (pat = '' or m.endpoint ilike '%' || pat || '%'))
      select (select started_at from x order by started_at desc limit 1), (select finished_at from x order by started_at desc limit 1),
             (select status from x order by started_at desc limit 1), (select records::bigint from x order by started_at desc limit 1),
             (select left(error, 300) from x order by started_at desc limit 1),
             (select count(*) from x where started_at > now() - interval '24 hours'),
             (select count(*) from x where started_at > now() - interval '24 hours' and status = 'error');
  elsif src = 'apex' then
    return query
      select (select started_at from public.apex_sync_run order by started_at desc limit 1), (select finished_at from public.apex_sync_run order by started_at desc limit 1),
             (select status from public.apex_sync_run order by started_at desc limit 1), (select coalesce(rows_written, rows_seen)::bigint from public.apex_sync_run order by started_at desc limit 1),
             (select left(error, 300) from public.apex_sync_run order by started_at desc limit 1),
             (select count(*) from public.apex_sync_run where started_at > now() - interval '24 hours'),
             (select count(*) from public.apex_sync_run where started_at > now() - interval '24 hours' and status = 'error');
  elsif src = 'cron' and r.cron_jobname is not null then
    return query
      with x as (select d.* from cron.job_run_details d join cron.job j on j.jobid = d.jobid where j.jobname = r.cron_jobname)
      select (select start_time from x order by start_time desc limit 1), (select end_time from x order by start_time desc limit 1),
             (select case status when 'succeeded' then 'ok' else status end from x order by start_time desc limit 1), null::bigint,
             (select case when status <> 'succeeded' then left(return_message, 300) end from x order by start_time desc limit 1),
             (select count(*) from x where start_time > now() - interval '24 hours'),
             (select count(*) from x where start_time > now() - interval '24 hours' and status <> 'succeeded');
  else
    return query select null::timestamptz, null::timestamptz, null::text, null::bigint, null::text, 0::bigint, 0::bigint;
  end if;
end $$;

-- ── 3. one list of secrets across both stores ────────────────────────────────────────────────
create or replace function public.f_secret_inventory()
returns table (name text, store text, present boolean, masked text, updated_at timestamptz, used_by text[])
language sql stable security definer set search_path = public as $$
  with needed as (select distinct unnest(secrets) as name from public.sync_registry where enabled),
  known as (
    select i.name, 'integration_secrets'::text as store, true as present, '••••' || right(i.value, 4) as masked, i.updated_at from public.integration_secrets i
    union all
    select s.key, 'app_secrets', (s.status = 'SET'), s.masked, coalesce(s.last_set_at, s.updated_at) from public.v_secret_status s
  ),
  all_names as (select name from needed union select name from known)
  select a.name, coalesce(k.store, case when a.name like 'METRC_%' or a.name in ('APEX_API_KEY','CLICKUP_TOKEN','TG_ADMIN_KEY','SUPABASE_ANON_KEY') then 'integration_secrets' else 'app_secrets' end) as store,
         coalesce(k.present, false) as present, k.masked, k.updated_at,
         coalesce((select array_agg(r.key order by r.sort) from public.sync_registry r where a.name = any(r.secrets)), '{}') as used_by
  from all_names a left join known k on k.name = a.name
  where public.f_caller_is_admin()
  order by (coalesce(k.present, false)) , a.name
$$;

-- one setter; routes to the store the readers use; values never come back out
create or replace function public.tg_secret_put(p_name text, p_value text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.f_caller_is_admin() then raise exception 'Owner, executive or admin only.' using errcode = '42501'; end if;
  if p_name !~ '^[A-Z0-9_]{3,64}$' then raise exception 'A secret name is UPPER_SNAKE_CASE.'; end if;
  if p_value is null or length(p_value) < 2 then raise exception 'Empty value.'; end if;
  if p_name like 'METRC_%' or p_name in ('APEX_API_KEY','CLICKUP_TOKEN','TG_ADMIN_KEY','SUPABASE_ANON_KEY','APEX_API_BASE','APEX_COMPANY_ID') then
    insert into public.integration_secrets (name, value, updated_by, updated_at) values (p_name, p_value, auth.uid(), now())
    on conflict (name) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now();
  else
    perform public.tg_set_secret(p_name, p_value);
  end if;
end $$;

-- ── 4. the status the page reads ─────────────────────────────────────────────────────────────
create or replace function public.f_sync_status()
returns table (key text, system text, label text, what text, kind text, runner text, schedule text, secrets text[], secrets_missing text[], lane text, enabled boolean, sort integer, note text,
               last_started timestamptz, last_finished timestamptz, last_status text, last_records bigint, last_error text, runs_24h bigint, failed_24h bigint, health text)
language plpgsql stable security definer set search_path = public, cron as $$
declare r record; l record; miss text[];
begin
  for r in select * from public.sync_registry order by sort, key loop
    select * into l from public.f_sync_last_run(r.key);
    select coalesce(array_agg(s), '{}') into miss from unnest(r.secrets) s
      where not exists (select 1 from public.integration_secrets i where i.name = s)
        and not exists (select 1 from public.v_secret_status v where v.key = s and v.status = 'SET');
    key := r.key; system := r.system; label := r.label; what := r.what; kind := r.kind; runner := r.runner;
    schedule := coalesce((select j.schedule from cron.job j where j.jobname = r.cron_jobname), r.schedule);
    secrets := r.secrets; secrets_missing := miss; lane := r.lane; enabled := r.enabled; sort := r.sort; note := r.note;
    last_started := l.last_started; last_finished := l.last_finished; last_status := l.last_status; last_records := l.last_records;
    last_error := l.last_error; runs_24h := coalesce(l.runs_24h, 0); failed_24h := coalesce(l.failed_24h, 0);
    health := case when not r.enabled then 'off'
                   when cardinality(miss) > 0 then 'missing secret'
                   when l.last_status = 'error' then 'failing'
                   when r.cron_jobname is not null and l.last_started is null then 'never ran'
                   when r.cron_jobname is not null and l.last_started < now() - interval '2 days' then 'stale'
                   when l.last_status in ('ok','succeeded','partial') or l.last_status is null then 'ok'
                   else l.last_status end;
    return next;
  end loop;
end $$;

-- ── 5. Run now: one dispatcher, every kind, every result written down ────────────────────────
create table if not exists public.sync_registry_run (
  id bigint generated always as identity primary key,
  key text not null references public.sync_registry(key),
  requested_by uuid, requested_at timestamptz not null default now(),
  method text not null, request_id bigint, result text, error text
);
alter table public.sync_registry_run enable row level security;
drop policy if exists sync_registry_run_read on public.sync_registry_run;
create policy sync_registry_run_read on public.sync_registry_run for select to authenticated using (public.f_caller_is_admin());

create or replace function public.f_sync_run(p_key text) returns jsonb
language plpgsql security definer set search_path = public, cron, hr as $$
declare r public.sync_registry%rowtype; v_req bigint; v_cmd text; v_run bigint; v_res text;
begin
  if not (public.current_app_role()::text in ('owner','executive')) then
    raise exception 'Only the owner or an executive may run a sync from here.' using errcode = '42501';
  end if;
  select * into r from public.sync_registry where key = p_key and enabled;
  if r.key is null then raise exception 'No enabled sync called %.', p_key; end if;
  insert into public.sync_registry_run (key, requested_by, method) values (r.key, auth.uid(), r.kind) returning id into v_run;
  begin
    if r.kind = 'edge_function' then
      v_req := public.tg_call_function(r.runner);
      update public.sync_registry_run set request_id = v_req, result = 'dispatched' where id = v_run;
      return jsonb_build_object('ok', true, 'run_id', v_run, 'request_id', v_req, 'method', 'edge_function', 'note', 'Dispatched; poll f_sync_run_result(run_id) for the answer.');
    elsif r.kind = 'cron' and r.cron_jobname is not null then
      select command into v_cmd from cron.job where jobname = r.cron_jobname;
      execute v_cmd;
      update public.sync_registry_run set result = 'ran: ' || left(v_cmd, 200) where id = v_run;
      return jsonb_build_object('ok', true, 'run_id', v_run, 'method', 'cron command', 'note', 'Ran the job''s command now.');
    elsif r.kind in ('rpc', 'bridge') then
      execute format('select %s()', r.runner) into v_res;
      update public.sync_registry_run set result = coalesce(v_res, 'done') where id = v_run;
      return jsonb_build_object('ok', true, 'run_id', v_run, 'method', r.kind, 'result', v_res);
    else
      raise exception 'Sync % has no runnable definition.', p_key;
    end if;
  exception when others then
    update public.sync_registry_run set error = left(sqlerrm, 500) where id = v_run;
    return jsonb_build_object('ok', false, 'run_id', v_run, 'error', sqlerrm);
  end;
end $$;

create or replace function public.f_sync_run_result(p_run_id bigint) returns jsonb
language sql stable security definer set search_path = public, net as $$
  select jsonb_build_object(
    'run_id', s.id, 'key', s.key, 'method', s.method, 'requested_at', s.requested_at, 'result', s.result, 'error', s.error,
    'http_status', h.status_code, 'timed_out', h.timed_out, 'answered_at', h.created,
    'body', left(h.content, 1500))
  from public.sync_registry_run s left join net._http_response h on h.id = s.request_id
  where s.id = p_run_id and public.f_caller_is_admin()
$$;

grant execute on function public.f_sync_status(), public.f_sync_last_run(text), public.f_secret_inventory(), public.tg_secret_put(text, text), public.f_sync_run(text), public.f_sync_run_result(bigint) to authenticated;
