-- BP-16-4 Sync watch (Bible §16.4). Owner, 14 Sep 2026: "all syncs must sync without any issue and be addressed as
-- soon as there is any issue." Every five minutes f_sync_status() is swept. The first time a sync turns failing,
-- stale, never-ran or missing-secret: a finding (agent watch:sync), an alert to the active recipients (rows), and ONE
-- automatic re-run through the same dispatch Run now uses (recorded as method 'watch-rerun', requested_by null).
-- Still red on the next sweep: a bridge job for the on-call agent and the tracker row sync.all_green FAILs.
-- A switched-off sync with no note is a WATCH finding once. Recovery clears the state within one sweep.
create table if not exists public.sync_watch_state (
  key text primary key references public.sync_registry(key) on delete cascade,
  health text not null, since timestamptz not null default now(), finding_at timestamptz, alerted_at timestamptz,
  rerun_at timestamptz, rerun_run_id bigint, bridge_job_id bigint, cleared_at timestamptz, updated_at timestamptz not null default now()
);
alter table public.sync_watch_state enable row level security;
drop policy if exists sync_watch_state_read on public.sync_watch_state;
create policy sync_watch_state_read on public.sync_watch_state for select to authenticated using (public.f_caller_is_admin());

create or replace function public.f_sync_rerun_by_watch(p_key text) returns bigint
language plpgsql security definer set search_path = public, cron, hr as $$
declare r public.sync_registry%rowtype; v_req bigint; v_cmd text; v_run bigint; v_res text; stmt text;
begin
  select * into r from public.sync_registry where key = p_key and enabled;
  if r.key is null then return null; end if;
  insert into public.sync_registry_run (key, requested_by, method) values (r.key, null, 'watch-rerun') returning id into v_run;
  begin
    if r.kind = 'edge_function' then
      v_req := public.tg_call_function(r.runner, '{}'::jsonb, 150000);
      update public.sync_registry_run set request_id = v_req, result = 'dispatched by watch' where id = v_run;
    elsif r.kind = 'cron' and r.cron_jobname is not null then
      select command into v_cmd from cron.job where jobname = r.cron_jobname;
      foreach stmt in array string_to_array(v_cmd, ';') loop
        if btrim(stmt) <> '' then execute btrim(stmt); end if;
      end loop;
      update public.sync_registry_run set result = 'watch ran: ' || left(v_cmd, 200) where id = v_run;
    elsif r.kind in ('rpc', 'bridge') then
      execute format('select %s()', r.runner) into v_res;
      update public.sync_registry_run set result = coalesce(v_res, 'done') where id = v_run;
    end if;
  exception when others then
    update public.sync_registry_run set error = left(sqlerrm, 500) where id = v_run;
  end;
  return v_run;
end $$;

create or replace function public.f_sync_watch() returns jsonb
language plpgsql security definer set search_path = public as $$
declare s record; st public.sync_watch_state%rowtype; n_red int := 0; n_new int := 0; n_rerun int := 0; n_escalated int := 0; n_cleared int := 0; jid bigint; rid bigint;
begin
  for s in select * from public.f_sync_status() loop
    select * into st from public.sync_watch_state w where w.key = s.key;
    if s.enabled and s.health in ('failing', 'stale', 'missing secret', 'never ran') then
      n_red := n_red + 1;
      if st.key is null or st.cleared_at is not null then
        n_new := n_new + 1;
        insert into public.agent_findings (detected_at, agent, severity, headline, detail, scope, action, drill_to, fingerprint, agent_key)
        values (now(), 'sync-watch', case when s.health = 'missing secret' then 'critical' else 'elevated' end,
                'Sync ' || s.label || ' is ' || s.health,
                coalesce(s.last_error, '') || case when s.health in ('stale','never ran') then ' Last run ' || coalesce(s.last_started::text, 'never') || ' against schedule ' || coalesce(s.schedule, '—') || '.' when s.health = 'missing secret' then ' Missing: ' || array_to_string(s.secrets_missing, ', ') || ' — paste it on the Sync page.' else '' end
                || ' Bible §16.4: re-run once automatically; if still red next sweep, the on-call agent gets a bridge job.',
                'BP-16-4:' || s.key, 'open the Sync page, read the last error, fix or re-run', 'integrations', 'sync|' || s.key || '|' || s.health, 'watch:sync');
        insert into public.alert_outbox (entity_type, entity_key, source, source_ref, severity, role, channel, subject, body, raised_on, days_open)
        select 'sync', s.key, 'sync-watch', s.key, case when s.health = 'missing secret' then 'critical' else 'elevated' end, r.role, 'email',
               'SYNC ' || upper(s.health) || ' — ' || s.label, coalesce(s.last_error, s.health) || E'\nSync page → ' || s.key, current_date, 0
          from public.alert_recipient r where r.active;
        rid := null;
        if s.health in ('failing', 'stale', 'never ran') then rid := public.f_sync_rerun_by_watch(s.key); n_rerun := n_rerun + 1; end if;
        insert into public.sync_watch_state (key, health, since, finding_at, alerted_at, rerun_at, rerun_run_id, cleared_at, updated_at)
        values (s.key, s.health, now(), now(), now(), case when rid is not null then now() end, rid, null, now())
        on conflict (key) do update set health = excluded.health, since = now(), finding_at = now(), alerted_at = now(), rerun_at = excluded.rerun_at, rerun_run_id = excluded.rerun_run_id, bridge_job_id = null, cleared_at = null, updated_at = now();
      elsif st.bridge_job_id is null and st.since < now() - interval '4 minutes' then
        n_escalated := n_escalated + 1;
        insert into public.ai_bridge_jobs (question, context, status)
        values ('REPAIR SYNC NOW (Bible §16.4): ' || s.label || ' (' || s.key || ') is ' || s.health || ' — ' || coalesce(s.last_error, 'no error text') || '. The automatic re-run did not clear it.',
                jsonb_build_object('sync_key', s.key, 'health', s.health, 'kind', s.kind, 'runner', s.runner, 'rule', 'BP-16-4'), 'queued')
        returning id into jid;
        update public.sync_watch_state set bridge_job_id = jid, health = s.health, updated_at = now() where key = s.key;
      else
        update public.sync_watch_state set health = s.health, updated_at = now() where key = s.key;
      end if;
    elsif st.key is not null and st.cleared_at is null then
      n_cleared := n_cleared + 1;
      update public.sync_watch_state set cleared_at = now(), health = s.health, updated_at = now() where key = s.key;
      update public.agent_findings set resolved_at = now(), resolution = 'cleared by sync-watch: ' || s.health || ' at ' || now()::text
       where fingerprint like 'sync|' || s.key || '|%' and resolved_at is null;
    end if;
    if not s.enabled and coalesce(s.note, '') = '' and not exists (select 1 from public.agent_findings f where f.fingerprint = 'sync-off-no-note|' || s.key and f.resolved_at is null) then
      insert into public.agent_findings (detected_at, agent, severity, headline, detail, scope, action, drill_to, fingerprint, agent_key)
      values (now(), 'sync-watch', 'watch', 'Sync ' || s.label || ' is switched off with no reason', 'Bible §16.4: an off sync needs a note saying why. Open it on the Sync page and write one, or switch it on.', 'BP-16-4:' || s.key, 'add a note or switch on', 'integrations', 'sync-off-no-note|' || s.key, 'watch:sync');
    end if;
  end loop;
  perform public.f_deployment_check_record('sync.all_green', case when n_red = 0 then 'PASS' when n_escalated > 0 or exists (select 1 from public.sync_watch_state where cleared_at is null and bridge_job_id is not null) then 'FAIL' else 'WARN' end,
    n_red || ' red', 'f_sync_watch every 5 min: ' || n_new || ' new, ' || n_rerun || ' re-run, ' || n_escalated || ' escalated to the on-call agent, ' || n_cleared || ' cleared this sweep.');
  return jsonb_build_object('red', n_red, 'new', n_new, 'rerun', n_rerun, 'escalated', n_escalated, 'cleared', n_cleared);
end $$;
select cron.schedule('sync-watch', '*/5 * * * *', $c$ select public.f_sync_watch(); $c$);
insert into public.sync_registry (key, system, label, what, kind, runner, cron_jobname, schedule, secrets, run_source, lane, enabled, sort, note)
values ('sync_watch', 'OS', 'Sync watch', 'Every 5 minutes sweeps every sync: first failure → finding + alert + one automatic re-run; still red next sweep → bridge job for the on-call agent; off syncs must carry a note (Bible §16.4).', 'cron', 'f_sync_watch', 'sync-watch', '*/5 * * * *', '{}', 'cron', 'Claude', true, 62, null)
on conflict (key) do update set what = excluded.what, updated_at = now();
insert into public.deployment_check (check_key, section, title, why, kind, severity, expected, status, active, sort_order)
values ('sync.all_green', '19 Go-live 23 Sep · Blueprint 2026', 'BP-16-4 Every sync green (auto, every 5 min; FAIL once a red sync survived its automatic re-run)', 'f_sync_watch. WARN = red but re-run just issued; FAIL = escalated to the on-call agent.', 'auto', 'NO-GO', '0 red', 'PENDING', true, 1898)
on conflict (check_key) do update set section = excluded.section, title = excluded.title, why = excluded.why, active = true;
select public.f_sync_watch();;
