-- BP-16-3, second cut (owner, 14 Sep 2026 04:45 UTC: "we have been using these all along … I'm not providing
-- again"). Right: the watcher must not depend on a token nobody needs. What every build already gives us:
--   · the published OS index carries <meta name="tg-build-commit"> and <meta name="tg-build-at"> (vite.config
--     build stamp) — a public GET, no token, tells us which commit production serves and when it was built;
--   · CI holds the database connection for the gates and can record its own verdict per commit (tools/ci/record-run.mjs);
--   · the HR site answers HTTP 200 or it does not.
-- The sweep every 2 minutes: probe both sites (pg_net GET, no auth), record what is served, and compare with the
-- newest main commit CI has recorded: a main commit whose gates passed but which is not served within 15 minutes is
-- a stuck or failed production build — finding, alert, bridge job — and deploy.production_green FAILs. A failed
-- CI on main is the same. The Netlify/GitHub API readers stay as an OPTIONAL enrichment if tokens ever exist.
create table if not exists public.site_probe (
  id bigserial primary key, site text not null, probed_at timestamptz not null default now(),
  http_status int, build_commit text, build_at timestamptz, ms int
);
alter table public.site_probe enable row level security;
drop policy if exists site_probe_read on public.site_probe;
create policy site_probe_read on public.site_probe for select to authenticated using (true);
create index if not exists site_probe_site_time on public.site_probe (site, probed_at desc);

create or replace function public.f_deploy_watch() returns jsonb
language plpgsql security definer set search_path = public, net as $$
declare
  netlify_tok text := nullif(public.tg_read_secret('NETLIFY_AUTH_TOKEN'), '');
  gh_tok text := nullif(public.tg_read_secret('GITHUB_TOKEN'), '');
  prev jsonb; req bigint; resp record; s_row record; d jsonb; run jsonb; m text[];
  n_seen int := 0; n_failed int := 0; reqs jsonb := '[]'::jsonb; worst text; jid bigint;
  served_commit text; served_at timestamptz; probe_ok boolean := false; ci record;
  sites jsonb := '[{"id":"b565a8cc-c82b-41b9-b9ec-4dae875af078","name":"twisted-growers-enterprise-os","url":"https://twisted-growers-enterprise-os.netlify.app/"},{"id":"f056cb61-d901-451a-a3d0-7f7ecc90d86e","name":"tg-hr","url":"https://tg-hr.netlify.app/hr/"}]'::jsonb;
begin
  select v into prev from public.deploy_watch_state where k = 'requests';
  if prev is not null then
    for s_row in select * from jsonb_to_recordset(prev) as x(request_id bigint, source text, site text) loop
      select * into resp from net._http_response r where r.id = s_row.request_id;
      if resp.id is null then continue; end if;
      if s_row.source = 'probe' then
        served_commit := null; served_at := null;
        if resp.status_code = 200 and resp.content is not null then
          m := regexp_match(resp.content::text, 'tg-build-commit" content="([0-9a-f]{7,40})"');
          if m is not null then served_commit := m[1]; end if;
          m := regexp_match(resp.content::text, 'tg-build-at" content="([^"]+)"');
          if m is not null then begin served_at := m[1]::timestamptz; exception when others then served_at := null; end; end if;
        end if;
        insert into public.site_probe (site, probed_at, http_status, build_commit, build_at)
        values (s_row.site, now(), resp.status_code, served_commit, served_at);
        if s_row.site = 'twisted-growers-enterprise-os' and resp.status_code = 200 then probe_ok := true; end if;
        if served_commit is not null then
          insert into public.deploy_state (deploy_id, source, site, branch, commit_ref, state, title, created_at, published_at)
          values ('site-' || s_row.site || '-' || served_commit, 'site', s_row.site, 'main', served_commit, 'ready', 'served (build stamp)', served_at, served_at)
          on conflict (deploy_id) do update set last_seen_at = now(), state = 'ready';
        end if;
        if resp.status_code is null or resp.status_code >= 500 then
          insert into public.deploy_state (deploy_id, source, site, branch, commit_ref, state, error_message, title, created_at)
          values ('site-' || s_row.site || '-down-' || to_char(now(), 'YYYYMMDDHH24MI'), 'site', s_row.site, 'main', null, 'error', 'site probe answered ' || coalesce(resp.status_code::text, 'nothing') || ' — the published site is not serving', 'outside-in probe', now())
          on conflict (deploy_id) do nothing;
        end if;
      elsif resp.status_code = 200 and s_row.source = 'netlify' then
        for d in select * from jsonb_array_elements(resp.content::jsonb) loop
          insert into public.deploy_state (deploy_id, source, site, branch, commit_ref, state, error_message, title, created_at, published_at)
          values (d->>'id', 'netlify', s_row.site, d->>'branch', d->>'commit_ref', d->>'state', d->>'error_message', d->>'title', (d->>'created_at')::timestamptz, (d->>'published_at')::timestamptz)
          on conflict (deploy_id) do update set state = excluded.state, error_message = excluded.error_message, published_at = excluded.published_at, last_seen_at = now();
          n_seen := n_seen + 1;
        end loop;
      elsif resp.status_code = 200 and s_row.source = 'github' then
        for run in select * from jsonb_array_elements(resp.content::jsonb->'workflow_runs') loop
          insert into public.deploy_state (deploy_id, source, site, branch, commit_ref, state, error_message, title, created_at, published_at)
          values ('gh-' || (run->>'id'), 'github', 'twisted-growers-enterprise-os', run->>'head_branch', run->>'head_sha',
                  case when run->>'status' = 'completed' then coalesce(run->>'conclusion', 'completed') else run->>'status' end, null, run->>'display_title', (run->>'created_at')::timestamptz, (run->>'updated_at')::timestamptz)
          on conflict (deploy_id) do update set state = excluded.state, published_at = excluded.published_at, last_seen_at = now();
          n_seen := n_seen + 1;
        end loop;
      end if;
    end loop;
  end if;
  select * into ci from public.deploy_state ds where ds.source = 'ci' and ds.branch = 'main' and ds.state = 'success' order by ds.created_at desc limit 1;
  if ci.deploy_id is not null and ci.created_at < now() - interval '15 minutes'
     and not exists (select 1 from public.deploy_state s where s.source = 'site' and s.site = 'twisted-growers-enterprise-os' and s.state = 'ready' and s.created_at >= ci.created_at - interval '10 minutes')
     and not exists (select 1 from public.deploy_state s where s.deploy_id = 'stuck-' || ci.commit_ref) then
    insert into public.deploy_state (deploy_id, source, site, branch, commit_ref, state, error_message, title, created_at)
    values ('stuck-' || ci.commit_ref, 'site', 'twisted-growers-enterprise-os', 'main', ci.commit_ref, 'error',
            'CI passed at ' || to_char(ci.created_at, 'HH24:MI') || ' UTC but production is not serving a build from this commit 15 minutes later — the Netlify build failed or is stuck', 'expected-vs-served', now());
  end if;
  for s_row in select * from public.deploy_state ds where ds.state in ('error', 'failed', 'failure') and ds.finding_filed_at is null and ds.first_seen_at > now() - interval '2 days' loop
    n_failed := n_failed + 1; jid := null;
    insert into public.agent_findings (detected_at, agent, severity, headline, detail, scope, action, drill_to, fingerprint, agent_key)
    values (now(), 'deploy-watch', case when s_row.branch = 'main' then 'critical' else 'elevated' end,
            s_row.source || ' ' || s_row.site || ' ' || coalesce(s_row.branch, '') || ' @ ' || left(coalesce(s_row.commit_ref, ''), 7) || ' FAILED',
            coalesce(s_row.error_message, s_row.title, 'no error text from ' || s_row.source) || ' — Bible §16.3: the on-call agent fixes this within the hour; rollback is the previous Netlify deploy.',
            'BP-16-3:' || s_row.deploy_id, 'fix the build; the failing gate is named at the bottom of the log', 'integrations', 'deploy|' || s_row.deploy_id, 'watch:deploy');
    if s_row.branch = 'main' then
      insert into public.alert_outbox (entity_type, entity_key, source, source_ref, severity, role, channel, subject, body, raised_on, days_open)
      select 'deploy', s_row.deploy_id, 'deploy-watch', s_row.deploy_id, 'critical', r.role, 'email',
             'PRODUCTION BUILD FAILED — ' || s_row.site || ' ' || left(coalesce(s_row.commit_ref,''), 7),
             coalesce(s_row.error_message, s_row.title, '') || E'\n\nBible §16.3: the on-call agent has a bridge job to fix it now. Rollback: previous Netlify deploy.', current_date, 0
        from public.alert_recipient r where r.active;
      insert into public.ai_bridge_jobs (question, context, status)
      values ('FIX PRODUCTION BUILD NOW (Bible §16.3): ' || s_row.source || ' ' || s_row.site || ' ' || coalesce(s_row.branch,'') || ' @ ' || left(coalesce(s_row.commit_ref,''),7) || ' failed: ' || coalesce(s_row.error_message, s_row.title, 'see log'),
              jsonb_build_object('deploy_id', s_row.deploy_id, 'site', s_row.site, 'commit', s_row.commit_ref, 'source', s_row.source, 'rule', 'BP-16-3'), 'pending')
      returning id into jid;
    end if;
    update public.deploy_state set finding_filed_at = now(), alerted_at = case when s_row.branch = 'main' then now() end, bridge_job_id = jid where deploy_id = s_row.deploy_id;
  end loop;
  select ds.state into worst from public.deploy_state ds where ds.site = 'twisted-growers-enterprise-os' and ds.branch = 'main' and ds.source in ('site', 'netlify') order by ds.created_at desc nulls last, ds.first_seen_at desc limit 1;
  select sp.build_commit, sp.probed_at into served_commit, served_at from public.site_probe sp where sp.site = 'twisted-growers-enterprise-os' and sp.http_status = 200 order by sp.probed_at desc limit 1;
  perform public.f_deployment_check_record('deploy.production_green',
    case when worst is null then 'WARN' when worst = 'ready' then 'PASS' when worst in ('error','failed','failure') then 'FAIL' else 'WARN' end,
    'serving ' || coalesce(left(served_commit, 7), '?') || ' · latest: ' || coalesce(worst, 'no reading yet'),
    'Outside-in probe of the published index every 2 min (build stamp) + CI verdicts per commit; Netlify/GitHub API feeds only if tokens exist.');
  for s_row in select * from jsonb_to_recordset(sites) as x(id text, name text, url text) loop
    select net.http_get(url := s_row.url || '?probe=' || extract(epoch from now())::bigint, headers := jsonb_build_object('User-Agent', 'tg-deploy-watch', 'Cache-Control', 'no-cache'), timeout_milliseconds := 15000) into req;
    reqs := reqs || jsonb_build_object('request_id', req, 'source', 'probe', 'site', s_row.name);
    if netlify_tok is not null then
      select net.http_get(url := 'https://api.netlify.com/api/v1/sites/' || s_row.id || '/deploys?per_page=5', headers := jsonb_build_object('Authorization', 'Bearer ' || netlify_tok), timeout_milliseconds := 20000) into req;
      reqs := reqs || jsonb_build_object('request_id', req, 'source', 'netlify', 'site', s_row.name);
    end if;
  end loop;
  if gh_tok is not null then
    select net.http_get(url := 'https://api.github.com/repos/VIPTwisted/twisted-growers-enterprise-os/actions/runs?per_page=8', headers := jsonb_build_object('Authorization', 'Bearer ' || gh_tok, 'Accept', 'application/vnd.github+json', 'User-Agent', 'tg-deploy-watch'), timeout_milliseconds := 20000) into req;
    reqs := reqs || jsonb_build_object('request_id', req, 'source', 'github', 'site', 'twisted-growers-enterprise-os');
  end if;
  insert into public.deploy_watch_state (k, v, updated_at) values ('requests', reqs, now()) on conflict (k) do update set v = excluded.v, updated_at = now();
  perform public.f_deployment_check_record('deploy.watch_alive',
    case when probe_ok or prev is null then 'PASS' else 'WARN' end,
    case when probe_ok then 'probe ok · serving ' || coalesce(left(served_commit,7),'?') when prev is null then 'first sweep' else 'probe did not answer 200' end,
    'Token-free: the published index is read every 2 min (build stamp), CI records its verdict per commit; the API feeds are optional. ' || jsonb_array_length(reqs) || ' request(s) issued.');
  return jsonb_build_object('probe_ok', probe_ok, 'serving', served_commit, 'requests', reqs, 'api_feeds', (netlify_tok is not null) or (gh_tok is not null), 'failed_now', n_failed);
end $$;
update public.deployment_check set title = 'BP-16-3 The deploy watcher is running — token-free (published build stamp every 2 min + CI verdicts); API feeds optional', why = 'Auto every 2 min from f_deploy_watch. PASS = the published site answered and its build stamp was read. Tokens are NOT required (owner, 14 Sep).', expected = 'probe ok · serving <commit>' where check_key = 'deploy.watch_alive';
update public.sync_registry set secrets = '{}', what = 'Every 2 minutes reads the published OS and HR sites (build stamp — no token), records what production serves, compares with CI verdicts per commit; a failed or stuck production build is a finding, an alert and a bridge job within one sweep (Bible §16.3). Netlify/GitHub API feeds are optional enrichment.', updated_at = now() where key = 'deploy_watch';
select public.f_deploy_watch();;
