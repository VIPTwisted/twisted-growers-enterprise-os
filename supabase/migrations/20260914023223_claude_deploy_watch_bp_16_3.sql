-- BP-16-3 Deploy watch (Bible §16.3). Owner, 14 Sep 2026: "all deployments must be watched to ensure nothing fails
-- and if it does the agent immediately fixes it." Every two minutes: collect the answers to the previous sweep's
-- requests (Netlify deploys for both sites, GitHub Actions runs), record every deploy in deploy_state, and on a
-- failed production deploy — within one sweep — file a NO-GO finding, queue an alert to the owner's recipients
-- (rows), queue a bridge job for the on-call agent, and flip deploy.production_green to FAIL, which blocks every
-- other section-19 row. Tokens are secrets the owner stores on the Sync page (NETLIFY_AUTH_TOKEN, GITHUB_TOKEN);
-- until they exist the watcher says so on the tracker instead of pretending to watch.
create table if not exists public.deploy_state (
  deploy_id text primary key, source text not null, site text not null, branch text, commit_ref text,
  state text not null, error_message text, title text, created_at timestamptz, published_at timestamptz,
  first_seen_at timestamptz not null default now(), last_seen_at timestamptz not null default now(),
  finding_filed_at timestamptz, alerted_at timestamptz, bridge_job_id bigint
);
alter table public.deploy_state enable row level security;
drop policy if exists deploy_state_read on public.deploy_state;
create policy deploy_state_read on public.deploy_state for select to authenticated using (true);
create table if not exists public.deploy_watch_state (k text primary key, v jsonb not null, updated_at timestamptz not null default now());
alter table public.deploy_watch_state enable row level security;
-- the two secrets the watcher reads, registered so the Sync page lists them as missing until the owner pastes them
insert into public.app_secrets (key, value, value_is_set, label, help, updated_at)
values ('NETLIFY_AUTH_TOKEN', '', false, 'Netlify personal access token (deploy watch)', 'Read-only use: the deploy watcher lists deploys for twisted-growers-enterprise-os and tg-hr every two minutes and files a finding the moment one fails. Create it at app.netlify.com → User settings → Applications → Personal access tokens.', now()),
       ('GITHUB_TOKEN', '', false, 'GitHub token (deploy watch)', 'Read-only use: the deploy watcher lists Actions runs on VIPTwisted/twisted-growers-enterprise-os every two minutes. A fine-grained token with Actions: read on that repository is enough.', now())
on conflict (key) do update set label = excluded.label, help = excluded.help;

create or replace function public.f_deploy_watch() returns jsonb
language plpgsql security definer set search_path = public, net as $$
declare
  netlify_tok text := nullif(public.tg_read_secret('NETLIFY_AUTH_TOKEN'), '');
  gh_tok text := nullif(public.tg_read_secret('GITHUB_TOKEN'), '');
  prev jsonb; req bigint; resp record; site record; d jsonb; run jsonb;
  n_seen int := 0; n_failed int := 0; sites jsonb := '[{"id":"b565a8cc-c82b-41b9-b9ec-4dae875af078","name":"twisted-growers-enterprise-os"},{"id":"f056cb61-d901-451a-a3d0-7f7ecc90d86e","name":"tg-hr"}]'::jsonb;
  reqs jsonb := '[]'::jsonb; worst text; jid bigint;
begin
  -- 1. collect the previous sweep's answers
  select v into prev from public.deploy_watch_state where k = 'requests';
  if prev is not null then
    for site in select * from jsonb_to_recordset(prev) as x(request_id bigint, source text, site text) loop
      select * into resp from net._http_response r where r.id = site.request_id;
      if resp.id is null or resp.status_code is null then continue; end if;
      if resp.status_code <> 200 then
        perform public.f_deployment_check_record('deploy.watch_alive', 'WARN', site.source || ' ' || resp.status_code, 'The deploy watcher could not read ' || site.source || ' for ' || site.site || ': HTTP ' || resp.status_code || ' ' || left(resp.content::text, 200));
        continue;
      end if;
      if site.source = 'netlify' then
        for d in select * from jsonb_array_elements(resp.content::jsonb) loop
          insert into public.deploy_state (deploy_id, source, site, branch, commit_ref, state, error_message, title, created_at, published_at)
          values (d->>'id', 'netlify', site.site, d->>'branch', d->>'commit_ref', d->>'state', d->>'error_message', d->>'title', (d->>'created_at')::timestamptz, (d->>'published_at')::timestamptz)
          on conflict (deploy_id) do update set state = excluded.state, error_message = excluded.error_message, published_at = excluded.published_at, last_seen_at = now();
          n_seen := n_seen + 1;
        end loop;
      elsif site.source = 'github' then
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
  -- 2. act on failures not yet acted on (production raises the alarm; a branch is a finding without it)
  for site in select * from public.deploy_state ds where ds.state in ('error', 'failed', 'failure') and ds.finding_filed_at is null and ds.first_seen_at > now() - interval '2 days' loop
    n_failed := n_failed + 1; jid := null;
    insert into public.agent_findings (detected_at, agent, severity, headline, detail, scope, action, drill_to, fingerprint, agent_key)
    values (now(), 'deploy-watch', case when site.branch = 'main' then 'critical' else 'elevated' end,
            site.source || ' ' || site.site || ' ' || coalesce(site.branch, '') || ' @ ' || left(coalesce(site.commit_ref, ''), 7) || ' FAILED',
            coalesce(site.error_message, site.title, 'no error text from ' || site.source) || ' — Bible §16.3: the on-call agent fixes this within the hour; rollback is the previous Netlify deploy.',
            'BP-16-3:' || site.deploy_id, 'fix the build; the failing gate is named at the bottom of the log', 'integrations', 'deploy|' || site.deploy_id, 'claude');
    if site.branch = 'main' then
      insert into public.alert_outbox (entity_type, entity_key, source, source_ref, severity, role, channel, subject, body, raised_on)
      select 'deploy', site.deploy_id, 'deploy-watch', site.deploy_id, 'critical', r.role, 'email',
             'PRODUCTION BUILD FAILED — ' || site.site || ' ' || left(coalesce(site.commit_ref,''), 7),
             coalesce(site.error_message, site.title, '') || E'\n\nBible §16.3: the on-call agent has a bridge job to fix it now. Rollback: previous Netlify deploy.', current_date
        from public.alert_recipient r where r.active;
      insert into public.ai_bridge_jobs (question, context, status)
      values ('FIX PRODUCTION BUILD NOW (Bible §16.3): ' || site.source || ' ' || site.site || ' ' || coalesce(site.branch,'') || ' @ ' || left(coalesce(site.commit_ref,''),7) || ' failed: ' || coalesce(site.error_message, site.title, 'see log'),
              jsonb_build_object('deploy_id', site.deploy_id, 'site', site.site, 'commit', site.commit_ref, 'source', site.source, 'rule', 'BP-16-3'), 'queued')
      returning id into jid;
    end if;
    update public.deploy_state set finding_filed_at = now(), alerted_at = case when site.branch = 'main' then now() end, bridge_job_id = jid where deploy_id = site.deploy_id;
  end loop;
  -- 3. the tracker: is production green?
  select ds.state into worst from public.deploy_state ds where ds.source = 'netlify' and ds.site = 'twisted-growers-enterprise-os' and ds.branch = 'main' order by ds.created_at desc limit 1;
  if worst is not null then
    perform public.f_deployment_check_record('deploy.production_green', case when worst = 'ready' then 'PASS' when worst in ('error','failed') then 'FAIL' else 'WARN' end,
      'latest main deploy: ' || worst, 'deploy_state, read from Netlify by f_deploy_watch every 2 min. ' || n_seen || ' deploys seen this sweep.');
  end if;
  -- 4. issue the next sweep's requests
  if netlify_tok is null and gh_tok is null then
    perform public.f_deployment_check_record('deploy.watch_alive', 'FAIL', 'no token', 'Store NETLIFY_AUTH_TOKEN (and GITHUB_TOKEN) on the Sync page — until then nothing is watching deploys.');
    return jsonb_build_object('watching', false, 'why', 'no NETLIFY_AUTH_TOKEN / GITHUB_TOKEN stored');
  end if;
  if netlify_tok is not null then
    for site in select * from jsonb_to_recordset(sites) as x(id text, name text) loop
      select net.http_get(url := 'https://api.netlify.com/api/v1/sites/' || site.id || '/deploys?per_page=5',
                          headers := jsonb_build_object('Authorization', 'Bearer ' || netlify_tok), timeout_milliseconds := 20000) into req;
      reqs := reqs || jsonb_build_object('request_id', req, 'source', 'netlify', 'site', site.name);
    end loop;
  end if;
  if gh_tok is not null then
    select net.http_get(url := 'https://api.github.com/repos/VIPTwisted/twisted-growers-enterprise-os/actions/runs?per_page=8',
                        headers := jsonb_build_object('Authorization', 'Bearer ' || gh_tok, 'Accept', 'application/vnd.github+json', 'User-Agent', 'tg-deploy-watch'), timeout_milliseconds := 20000) into req;
    reqs := reqs || jsonb_build_object('request_id', req, 'source', 'github', 'site', 'twisted-growers-enterprise-os');
  end if;
  insert into public.deploy_watch_state (k, v, updated_at) values ('requests', reqs, now()) on conflict (k) do update set v = excluded.v, updated_at = now();
  perform public.f_deployment_check_record('deploy.watch_alive', 'PASS', 'watching ' || jsonb_array_length(reqs) || ' feed(s)', 'f_deploy_watch every 2 min; answers collected on the next sweep.');
  return jsonb_build_object('watching', true, 'requests', reqs, 'seen', n_seen, 'failed_now', n_failed);
end $$;
select cron.schedule('deploy-watch', '*/2 * * * *', $c$ select public.f_deploy_watch(); $c$);
insert into public.sync_registry (key, system, label, what, kind, runner, cron_jobname, schedule, secrets, run_source, lane, enabled, sort, note)
values ('deploy_watch', 'OS', 'Deploy watch', 'Every 2 minutes reads Netlify deploys (OS + HR) and GitHub Actions runs; a failed production deploy is a finding, an alert to the recipients and a bridge job for the on-call agent within one sweep (Bible §16.3).', 'cron', 'f_deploy_watch', 'deploy-watch', '*/2 * * * *', '{NETLIFY_AUTH_TOKEN,GITHUB_TOKEN}', 'cron', 'Claude', true, 61, null)
on conflict (key) do update set what = excluded.what, secrets = excluded.secrets, updated_at = now();
insert into public.deployment_check (check_key, section, title, why, kind, severity, expected, status, active, sort_order)
values ('deploy.watch_alive', '19 Go-live 23 Sep · Blueprint 2026', 'BP-16-3 The deploy watcher is running with its tokens', 'Auto every 2 min from f_deploy_watch. FAIL = no NETLIFY_AUTH_TOKEN / GITHUB_TOKEN stored on the Sync page.', 'auto', 'NO-GO', 'watching 3 feeds', 'PENDING', true, 1899)
on conflict (check_key) do update set section = excluded.section, title = excluded.title, why = excluded.why, active = true;
select public.f_deploy_watch();;
