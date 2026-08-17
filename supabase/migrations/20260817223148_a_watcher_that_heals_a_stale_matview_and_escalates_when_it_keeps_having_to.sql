/* A watcher that heals a stale matview — and escalates when it keeps having to.
 *
 * Owner, 17 Aug 2026: "fortify so this never happens again with watcher who fixes this
 * immediately!"
 *
 * The failure being fortified against: refresh-dashboards refreshed seven matviews in
 * ONE transaction, mv_tag_evidence exceeded the 2-minute cron timeout, and the other six
 * rolled back with it. 477 times. Nothing said a word, and the owner found it by reading
 * "DATA 3 DAYS OLD" on his own dashboard.
 *
 * THE TRAP THIS DESIGN AVOIDS.
 * A healer that silently fixes the same fault forever is WORSE than no healer. It
 * converts a loud breakage into a permanent invisible one, and the underlying defect is
 * never fixed because nobody ever learns it exists. So this heals AND it counts. Heal
 * once, that is maintenance. Heal the same view repeatedly, that is a defect and it gets
 * a named finding with the arithmetic on it.
 *
 * It also refuses to hide a failure it could not fix: if the refresh itself errors, that
 * is raised immediately and, because a stale dashboard is a sync problem, it reaches the
 * owner's inbox under the sync-only email policy set earlier today.
 *
 * Built on v_matview_freshness, which already existed. A second definition of "how old
 * is this matview" is the countable DDC defect and there will not be one.
 */

create table if not exists public.matview_heal_policy (
  matview          text primary key,
  max_age          interval not null,
  refresh_fn       text,
  heals_per_day_ok int not null default 3,
  why              text not null,
  active           boolean not null default true
);

comment on table public.matview_heal_policy is
  'How stale each matview may get before the watcher heals it, and how often healing is '
  'normal before repetition itself becomes a finding. A matview with no row here is NOT '
  'healed — silence is not consent, and auto-refreshing something nobody has reasoned '
  'about is how a heavy view gets run every ten minutes forever. Agent I, 17 Aug 2026.';

comment on column public.matview_heal_policy.heals_per_day_ok is
  'Above this many heals in 24h the watcher raises a finding even though it succeeded. '
  'A healer that quietly patches the same fault forever hides the disease.';

insert into public.matview_heal_policy (matview, max_age, refresh_fn, heals_per_day_ok, why) values
  ('mv_department_dashboard_base', interval '45 minutes', 'tg_refresh_dashboards', 3,
   'Backs every KPI tile on every category dashboard. The owner reads these as a current '
   || 'position; at 3 days old it was one. Scheduled every 10 min, so 45 min means four '
   || 'consecutive misses.'),
  ('mv_dept_dash_supplement',      interval '45 minutes', 'tg_refresh_dashboards', 3,
   'Same strip, same rotation, same reasoning.'),
  ('mv_global_management',         interval '45 minutes', 'tg_refresh_dashboards', 3,
   'The Global Management panel. Was one of six rolled back by mv_tag_evidence.'),
  ('mv_harvest_dry_stats',         interval '45 minutes', 'tg_refresh_dashboards', 3,
   'Dry-equivalent weights. A stale figure here misstates what is in the rooms.'),
  ('mv_flow_stages',               interval '45 minutes', 'tg_refresh_dashboards', 3,
   'Seed-to-sale stage counts on the Command page.'),
  ('mv_room_board',                interval '45 minutes', 'tg_refresh_dashboards', 3,
   'Room board. Cultivation reads it to decide what comes down next.'),
  ('mv_tag_evidence',              interval '3 hours',    'tg_refresh_tag_evidence', 2,
   'Walks package lineage recursively to 5 generations and cannot finish inside the '
   || '2-minute cron default — this is the view that took the other six down. Given its '
   || 'own hourly job with a 15-minute timeout. Evidence-of-testing lineage does not need '
   || 'to be 10 minutes fresh and pretending it did is what caused the outage.')
on conflict (matview) do update
  set max_age = excluded.max_age, refresh_fn = excluded.refresh_fn,
      heals_per_day_ok = excluded.heals_per_day_ok, why = excluded.why, active = true;

alter table public.matview_heal_policy enable row level security;
drop policy if exists mhp_read on public.matview_heal_policy;
create policy mhp_read on public.matview_heal_policy for select to authenticated using (true);
drop policy if exists mhp_write on public.matview_heal_policy;
create policy mhp_write on public.matview_heal_policy for all to authenticated
  using ((select public.f_caller_is_admin())) with check ((select public.f_caller_is_admin()));
grant select on public.matview_heal_policy to tg_desktop_reader;

/* ── What the watcher sees ───────────────────────────────────────────────────── */
create or replace view public.v_matview_health as
select p.matview,
       f.computed_at,
       f.age,
       p.max_age,
       p.refresh_fn,
       f.scheduled_refresh,
       (f.age is not null and f.age > p.max_age) as is_stale,
       (select count(*) from public.matview_refresh_run r
         where r.matview = p.matview and r.ok and r.run_by = 'watcher'
           and r.started_at > now() - interval '24 hours')::int as heals_last_24h,
       p.heals_per_day_ok,
       (select count(*) from public.matview_refresh_run r
         where r.matview = p.matview and not r.ok
           and r.started_at > now() - interval '24 hours')::int as failures_last_24h,
       case
         when f.age is null then 'AGE UNMEASURABLE — the view carries no computed_at, so staleness cannot be proven either way'
         when f.age > p.max_age then 'STALE — older than ' || p.max_age
         else 'ok'
       end as verdict,
       p.why
from public.matview_heal_policy p
left join public.v_matview_freshness f on f.matview = p.matview
where p.active;

comment on view public.v_matview_health is
  'Every matview the watcher is responsible for, its age against its own policy, how '
  'many times it has been healed in 24h and how many times healing FAILED. Reads '
  'v_matview_freshness rather than recomputing age — one definition of freshness, not '
  'two. Agent I, 17 Aug 2026.';

grant select on public.v_matview_health to tg_desktop_reader;;
