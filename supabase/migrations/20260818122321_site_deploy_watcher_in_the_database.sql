/* THE DEPLOY WATCHER MOVES INTO THE DATABASE, WHERE THE ALARM ALREADY WORKS.
 *
 * On 18 Aug 2026 eight consecutive Netlify builds failed between 07:02 and 07:57
 * and the live site sat five hours behind main. Two watchers existed and neither
 * reached the owner: the deploy log lived in Netlify's UI, and deploy-watch on
 * GitHub went red in a tab nobody reads. The owner refreshed the site and was,
 * once again, the detector.
 *
 * The database is the one place with a PROVEN path to the owner's inbox
 * (watchdog_findings -> f_alert_all_admins -> alert_outbox -> alert-email cron ->
 * Resend, delivered 18 Aug). So the database now watches the site itself:
 *
 *   - every 10 minutes, pg_net fetches the public site and reads the build stamp
 *     that vite injects (tg-build-commit / tg-build-at meta tags);
 *   - the newest applied migration timestamp is the freshness anchor — house flow
 *     mirrors and pushes every migration within minutes, so a build stamp that
 *     sits more than site_deploy_lag_minutes behind the newest migration means
 *     pushes are happening and deploys are not;
 *   - verdict STALE or DOWN raises a rule-J4-complete CRITICAL finding and emails
 *     every admin through the existing pipeline; recovery clears the finding and
 *     resolves any queued-but-unsent alarm so a healed site never emails stale news.
 *
 * WHAT THIS DOES NOT CATCH: a front-end-only push with no migration in the same
 * window. That case is covered by the other two layers shipped with this commit:
 * the pre-push drift guard (blocks the poison commit class that caused today) and
 * deploy-watch on GitHub (compares live commit to origin/main on every push).
 * Three layers, three different failure modes, no single point of silence. */

insert into public.conversion_factors (key, value, unit, label, what_it_means, where_it_came_from, set_by)
values ('site_deploy_lag_minutes', 90, 'minutes',
        'Site deploy alarm threshold',
        'How long database work may be newer than the live site build before the deploy watcher raises a CRITICAL finding and emails every admin. Lower it for a tighter alarm; raise it if long database sessions between pushes cause false alarms.',
        'Agent I default after the 18 Aug 2026 deploy freeze (site five hours behind, eight red builds, owner was the detector). Owner-changeable in Settings and takes effect on the next 10-minute check, like every rule.',
        'Agent I')
on conflict (key) do nothing;

create table if not exists public.site_deploy_probe (
  id               bigint generated always as identity primary key,
  fired_at         timestamptz not null default now(),
  req_id           bigint,
  status_code      int,
  live_commit      text,
  built_at         timestamptz,
  newest_migration timestamptz,
  lag_minutes      numeric,
  verdict          text,
  note             text
);

comment on table public.site_deploy_probe is
  'One row per 10-minute probe of the live site by tg_check_site_deploy(). status_code -1 means '
  'pg_net recorded no response. verdict OK / STALE / DOWN / NO_STAMP. Built 18 Aug 2026 after '
  'eight consecutive failed Netlify builds left the site five hours behind main with no alarm '
  'reaching the owner. Agent I.';

alter table public.site_deploy_probe enable row level security;
create policy sdp_read   on public.site_deploy_probe for select to authenticated using (true);
create policy sdp_reader on public.site_deploy_probe for select to tg_desktop_reader using (true);

create or replace function public.tg_check_site_deploy()
returns text
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_site  text := 'https://twisted-growers-enterprise-os.netlify.app';
  v_req   bigint;
  p       record;
  r       record;
  prev    record;
  v_mig   timestamptz;
  v_grace numeric;
  v_lag   numeric;
  v_verdict text;
  v_fp    text;
  v_what  text;
  v_id    bigint;
  v_out   text := '';
begin
  /* PHASE B — collect answers for probes still waiting on pg_net. */
  for p in select * from site_deploy_probe
            where req_id is not null and status_code is null
              and fired_at > now() - interval '2 hours'
  loop
    select * into r from net._http_response where id = p.req_id;
    if found then
      update site_deploy_probe set
        status_code = coalesce(r.status_code, -1),
        note        = nullif(left(coalesce(r.error_msg,''),200),''),
        live_commit = substring(r.content from '<meta name="tg-build-commit" content="([^"]*)"'),
        built_at    = nullif(substring(r.content from '<meta name="tg-build-at" content="([^"]*)"'),'')::timestamptz
      where id = p.id;
    elsif p.fired_at < now() - interval '10 minutes' then
      update site_deploy_probe
         set status_code = -1, note = 'no response recorded by pg_net'
       where id = p.id;
    end if;
  end loop;

  /* THE FRESHNESS ANCHOR — the newest applied migration, parsed as UTC. */
  select max(make_timestamptz(substring(version,1,4)::int, substring(version,5,2)::int,
                              substring(version,7,2)::int, substring(version,9,2)::int,
                              substring(version,11,2)::int, substring(version,13,2)::numeric,
                              'UTC'))
    into v_mig
    from supabase_migrations.schema_migrations
   where version ~ '^[0-9]{14}';

  v_grace := coalesce(f_rule('site_deploy_lag_minutes'), 90);

  /* VERDICT on the newest completed probe. */
  select * into p from site_deploy_probe
   where status_code is not null
   order by fired_at desc limit 1;

  if found then
    if p.status_code <> 200 then
      select * into prev from site_deploy_probe
       where status_code is not null and id <> p.id
       order by fired_at desc limit 1;
      /* one failed fetch is a blip; two in a row is an outage */
      if found and prev.status_code <> 200 then v_verdict := 'DOWN'; else v_verdict := 'BLIP'; end if;
    elsif p.live_commit is null or p.built_at is null then
      v_verdict := 'NO_STAMP';
    else
      v_lag := extract(epoch from (v_mig - p.built_at)) / 60.0;
      v_verdict := case when v_lag > v_grace then 'STALE' else 'OK' end;
    end if;

    update site_deploy_probe
       set verdict = v_verdict, newest_migration = v_mig, lag_minutes = round(coalesce(v_lag,0),1)
     where id = p.id;

    v_fp := case v_verdict when 'DOWN' then 'site-deploy-down'
                           when 'STALE' then 'site-deploy-stale'
                           when 'NO_STAMP' then 'site-deploy-stale'
                           else null end;

    if v_fp is not null then
      if not exists (select 1 from watchdog_findings
                      where fingerprint = v_fp and cleared_at is null) then
        v_what := case when v_verdict = 'DOWN'
          then 'THE LIVE SITE IS NOT ANSWERING. Two consecutive probes failed (last HTTP ' || p.status_code || ').'
          else 'THE LIVE SITE IS NOT RUNNING CURRENT WORK. Its build ('
               || coalesce(to_char(p.built_at,'DD Mon HH24:MI'),'no stamp') || ', commit '
               || coalesce(left(p.live_commit,7),'unknown') || ') is '
               || round(coalesce(v_lag,0)) || ' minutes older than the newest applied migration ('
               || to_char(v_mig,'DD Mon HH24:MI') || '). Pushes are happening and deploys are not — the 18 Aug freeze pattern.'
          end;
        insert into watchdog_findings
          (fingerprint, severity, what, where_it_is, who_is_accountable, when_it_started,
           why_it_matters, how_it_was_detected, what_to_do, drill, search_text,
           record_count, solutions, guard_recommendation, evidence)
        values
          (v_fp, 'critical', v_what,
           'Netlify site twisted-growers-enterprise-os.netlify.app, deploys tab',
           'Agent I (Database COO) first; whoever pushed the breaking commit second',
           'First detected ' || to_char(now(),'DD Mon YYYY HH24:MI'),
           'Every fix committed after the freeze is invisible to every user. On 18 Aug 2026 this state lasted five hours, the owner was the detector, and his verdict was FIX PROPERLY.',
           'tg_check_site_deploy() — the database fetched the public site, read its vite build stamp, and compared it against the newest applied migration. Threshold: site_deploy_lag_minutes (owner rule, currently ' || v_grace || ').',
           'Open the Netlify deploy list, read the FIRST failed build''s gate banner (the runner names the failing gate at the bottom), fix that gate, push. Do not retry builds without reading the banner.',
           'agent_findings',
           'site deploy netlify stale down behind build failed freeze',
           1,
           array[
             'Read the failing gate named at the bottom of the Netlify build log and fix that exact thing.',
             'If the gate is edge-function-drift: deploy the changed function, re-pin its hash in tools/checks/edge-function-manifest.json, push.',
             'If no builds are triggering at all: the GitHub webhook died (12 Aug pattern) — retrigger with an empty commit and check Netlify build hooks.',
             'After the fix, confirm this finding clears itself on the next 10-minute probe — do not clear it by hand.'],
           'The site build must never be older than the newest migration by more than the owner-set threshold. This finding clears itself when the live stamp catches up.',
           jsonb_build_object('probe_id', p.id, 'live_commit', p.live_commit, 'built_at', p.built_at,
                              'newest_migration', v_mig, 'lag_minutes', round(coalesce(v_lag,0),1),
                              'status_code', p.status_code))
        returning id into v_id;
        perform f_alert_all_admins(v_id);
        v_out := v_out || 'RAISED ' || v_fp || ' finding ' || v_id || '. ';
      end if;
    elsif v_verdict = 'OK' then
      /* recovery: clear open deploy findings and resolve any queued-but-unsent alarms
         so a healed site never emails stale news at :45 */
      update watchdog_findings set cleared_at = now()
       where fingerprint in ('site-deploy-stale','site-deploy-down') and cleared_at is null;
      update alert_outbox
         set resolved_at = now(),
             resolved_note = 'Site recovered before this alert was sent — cleared by tg_check_site_deploy().'
       where source = 'guard' and source_ref in ('site-deploy-stale','site-deploy-down')
         and sent_at is null and resolved_at is null;
      v_out := v_out || 'verdict OK, lag ' || round(coalesce(v_lag,0),1) || ' min. ';
    else
      v_out := v_out || 'verdict ' || v_verdict || '. ';
    end if;
  end if;

  /* PHASE A — fire the next probe (answered on the next run). */
  select net.http_get(url => v_site || '/?deploycheck=' || extract(epoch from now())::bigint,
                      timeout_milliseconds => 8000)
    into v_req;
  insert into site_deploy_probe (req_id) values (v_req);

  delete from site_deploy_probe where fired_at < now() - interval '30 days';

  return coalesce(nullif(v_out,''), 'probe fired');
end $$;

comment on function public.tg_check_site_deploy() is
  'The deploy watcher that lives where the alarm works. Fetches the public site every 10 minutes '
  '(pg_net, two-phase: fire now, read on the next run), compares the vite build stamp against the '
  'newest applied migration, and raises a rule-J4-complete CRITICAL finding through '
  'f_alert_all_admins when the site is more than site_deploy_lag_minutes behind, unreachable twice '
  'in a row, or unstamped. Clears itself on recovery and resolves unsent alarms. Built 18 Aug 2026 '
  'after the five-hour deploy freeze the owner detected himself. Agent I.';

select cron.schedule('site-deploy-watch', '*/10 * * * *', 'select public.tg_check_site_deploy()');;
