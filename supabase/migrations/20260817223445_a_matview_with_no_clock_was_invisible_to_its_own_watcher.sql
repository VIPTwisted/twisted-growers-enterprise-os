/* A matview with no clock was invisible to its own watcher.
 *
 * Caught by TESTING the watcher rather than trusting it. Setting mv_room_board's max_age
 * to 1 second should have made it instantly stale. It reported is_stale = FALSE, because
 * the view carries no computed_at column, v_matview_freshness therefore returns a NULL
 * age, and `null > interval` is null — not true.
 *
 * MEASURED across the seven views the watcher is responsible for:
 *   has a computed_at   2   mv_department_dashboard_base, mv_dept_dash_supplement
 *   no computed_at      5   mv_global_management, mv_harvest_dry_stats, mv_flow_stages,
 *                           mv_room_board, mv_tag_evidence
 *
 * Five of seven could never be healed — including mv_tag_evidence, the view whose failure
 * caused the outage this watcher was built to prevent. A guard that cannot see its
 * subject is worse than no guard, because it is credited with cover it does not provide.
 *
 * THE FIX: A CLOCK THAT DOES NOT DEPEND ON THE VIEW'S OWN SHAPE.
 * matview_refresh_run records every refresh attempt with its timestamp — an external,
 * uniform clock for every matview whether or not it has an internal one. Age is now the
 * view's own computed_at where it has one, otherwise the last SUCCESSFUL refresh.
 *
 * Where NEITHER exists, the verdict is STALE, not "unmeasurable, assume fine". Unknown
 * freshness on a figure the owner reads as current must fail toward action. The first
 * heal gives the view a clock and the question answers itself thereafter.
 *
 * clock_source is APPENDED rather than slotted in beside age: rule E1 forbids dropping a
 * view, and CREATE OR REPLACE only allows columns to be added at the end. The guard
 * refused the drop and it was right to — the column order is worth less than the rule.
 */

create or replace view public.v_matview_health as
select p.matview,
       coalesce(f.computed_at, r.last_ok_at)              as computed_at,
       coalesce(f.age, now() - r.last_ok_at)              as age,
       p.max_age,
       p.refresh_fn,
       f.scheduled_refresh,
       (coalesce(f.age, now() - r.last_ok_at) is null
        or coalesce(f.age, now() - r.last_ok_at) > p.max_age)  as is_stale,
       (select count(*) from public.matview_refresh_run x
         where x.matview = p.matview and x.ok and x.run_by = 'watcher'
           and x.started_at > now() - interval '24 hours')::int as heals_last_24h,
       p.heals_per_day_ok,
       (select count(*) from public.matview_refresh_run x
         where x.matview = p.matview and not x.ok
           and x.started_at > now() - interval '24 hours')::int as failures_last_24h,
       case
         when coalesce(f.age, now() - r.last_ok_at) is null
           then 'NEVER REFRESHED ON RECORD — treated as stale until one succeeds and gives it a clock'
         when coalesce(f.age, now() - r.last_ok_at) > p.max_age
           then 'STALE — older than ' || p.max_age
         else 'ok'
       end                                                  as verdict,
       p.why,
       case when f.computed_at is not null then 'the view''s own computed_at'
            when r.last_ok_at  is not null then 'last successful refresh in matview_refresh_run'
            else 'no clock of any kind yet' end            as clock_source
from public.matview_heal_policy p
left join public.v_matview_freshness f on f.matview = p.matview
left join lateral (
  select max(started_at) as last_ok_at
    from public.matview_refresh_run x
   where x.matview = p.matview and x.ok
) r on true
where p.active;

comment on view public.v_matview_health is
  'Every matview the watcher owns, with its age taken from the view''s own computed_at '
  'where it has one and from matview_refresh_run where it does not. Fixed 17 Aug 2026: '
  'the first version read only the view''s own clock, and 5 of the 7 watched views do not '
  'have one. Their age came back NULL, is_stale was false, and the watcher would never '
  'have touched them. Unknown freshness now fails TOWARD healing. Agent I.';

update public.matview_heal_policy
   set max_age = interval '45 minutes'
 where matview = 'mv_room_board';;
