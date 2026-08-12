-- Agent I, 11 Aug 2026. Correcting my own guard, one hour after writing it.
--
-- THE FLAW. v_kpi_staleness judged movement from dashboard_snapshots alone. Snapshots are taken
-- once a day at 05:05, so a value that changed at 14:00 today is invisible until tomorrow's
-- capture. It reported "Plants mirrored STALE, unchanged for 5 days" while the live view already
-- read 55,140 - the backfill landed at midday, after the morning snapshot.
--
-- The verdict was defensible against the snapshot series and WRONG about the world. A guard that
-- reports a fixed thing as broken gets ignored within a week, and an ignored guard is worse than
-- none because it occupies the space where a real one would go.
--
-- THE FIX. Treat the live value as the newest observation. If it differs from the most recent
-- snapshot, the metric moved TODAY whatever the daily series says.
--
-- NOTE ON ORDERING: the new column is appended last because create or replace view cannot
-- reorder existing columns. It refused my first attempt and it was right to.
--
-- UNDO: restore the definition from migration kpi_staleness_and_null_guard.

create or replace view v_kpi_staleness as
with live as (
  select department, kpi, value as live_value, unit from mv_department_dashboard
),
latest_snap as (
  select distinct on (department, kpi) department, kpi, value as last_snap_value, taken_on
  from dashboard_snapshots order by department, kpi, taken_on desc
),
hist as (
  select department, kpi, taken_on, value,
         lag(value) over (partition by department, kpi order by taken_on) as prev_value
  from dashboard_snapshots
),
changed as (
  select department, kpi,
         max(taken_on) filter (where prev_value is distinct from value) as last_changed_on,
         count(*) as snapshots_held
  from hist group by department, kpi
),
resolved as (
  select l.department, l.kpi, l.live_value, l.unit, c.snapshots_held,
         case when s.last_snap_value is distinct from l.live_value then current_date
              else c.last_changed_on end as last_changed_on,
         (s.last_snap_value is distinct from l.live_value) as moved_since_last_snapshot
  from live l
  left join changed c     on c.department = l.department and c.kpi = l.kpi
  left join latest_snap s on s.department = l.department and s.kpi = l.kpi
)
select r.department, r.kpi, r.live_value, r.unit, r.last_changed_on, r.snapshots_held,
       (current_date - r.last_changed_on) as days_unchanged,
       p.must_move_within, p.exempt, p.why as policy_reason,
       case
         when r.live_value is null      then 'NULL VALUE — the tile shows nothing and asks nobody a question'
         when p.department is null      then 'UNPOLICED — no freshness policy declared for this KPI'
         when p.exempt                  then 'EXEMPT — ' || p.why
         when r.last_changed_on is null then 'NO HISTORY — never seen to change; snapshots begin 6 Aug 2026'
         when (current_date - r.last_changed_on) * interval '1 day' > p.must_move_within
              then 'STALE — unchanged for ' || (current_date - r.last_changed_on) || ' days against a policy of ' || p.must_move_within
         else 'FRESH'
       end as verdict,
       r.moved_since_last_snapshot
from resolved r
left join kpi_freshness_policy p on p.department = r.department and p.kpi = r.kpi;

comment on view v_kpi_staleness is
 'Dashboard KPIs judged on whether their VALUE moves, not on whether the refresh job ran - the '
 'job succeeded 144 times a day through six days of frozen plant data. The live value counts as '
 'the newest observation, so a metric that moved after this morning''s 05:05 snapshot reads fresh '
 'rather than being called stale until tomorrow. NULL VALUE and UNPOLICED are both faults: one is '
 'a broken metric, the other is a metric nobody decided to watch.';;
