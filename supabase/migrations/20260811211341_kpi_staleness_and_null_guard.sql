-- Agent I (Database COO), 11 Aug 2026. Filed for review as DBI-010 (reviewers V, X, W).
-- Owner directive: address the frozen dashboards site-wide.
--
-- THE DEFECT, STATED PRECISELY. Every dashboard header says "Live from the records - last
-- computed <time>". That timestamp is when the QUERY RAN. It is not when the DATA last changed.
-- Those are different facts and only one of them is on the screen.
--
-- WHAT IT COST. From 6 to 11 August the Metrc plant sync was broken and the mirror sat at
-- 15,595 rows. The dashboard recomputed 144 times a day, every run succeeded, and every run
-- faithfully rendered the same dead number - while announcing itself as live. Six days of
-- decisions were made against it. The refresh job was never at fault and monitoring the refresh
-- job could never have caught this. I made that exact mistake myself this afternoon: I verified
-- the job stopped erroring and reported the dashboard fixed, which confirmed the machinery ran
-- without confirming it produced anything new.
--
-- A STALE TILE IS WORSE THAN A MISSING ONE. A blank tile makes you ask a question. A stale tile
-- makes you decide. Same for NULL: two KPIs are NULL right now and a null renders as blank or
-- zero, which reads as "nothing to worry about" rather than "this metric is broken".
--
-- WHAT THIS BUILDS.
--   kpi_freshness_policy - per KPI, how long it may sit unchanged before that is a fault, or an
--     explicit exemption with a reason. Structural counts legitimately never move; operational
--     counts legitimately must. Guessing which is which is how a guard becomes noise, so every
--     row states why.
--   v_kpi_staleness - live value against snapshot history: when the value last CHANGED, how many
--     consecutive days it has been identical, and the verdict.
--   Two checks, both of which fire on real conditions today.
--
-- POLICIES ARE PROVISIONAL. I set them from what the metric measures. The owner may disagree
-- about how often any given number ought to move, and his view governs.
--
-- HONEST LIMIT: dashboard_snapshots only began on 6 Aug and captures once daily at 05:05, so
-- the history is 6 points deep. This guard gets stronger every day and is weakest today. It is
-- still far better than the nothing that preceded it.
--
-- UNDO: drop view v_kpi_staleness; drop table kpi_freshness_policy;
--       delete from verification_checks where check_key like 'dashboard-%';

create table if not exists kpi_freshness_policy (
  department       text not null,
  kpi              text not null,
  must_move_within interval,
  exempt           boolean not null default false,
  why              text not null,
  set_by           text not null default 'Agent I',
  added_on         date not null default current_date,
  primary key (department, kpi)
);

alter table kpi_freshness_policy enable row level security;

comment on table kpi_freshness_policy is
 'How long each dashboard KPI may sit at the same value before that is a fault. exempt = true '
 'means the number legitimately does not move (a department count, a licence count) and every '
 'exemption must say why. A KPI with NO policy row is itself a gap - it is neither watched nor '
 'knowingly excused - and v_kpi_staleness reports it as UNPOLICED.';

insert into kpi_freshness_policy (department, kpi, must_move_within, exempt, why) values
 ('Metrc','Plants mirrored', interval '2 days', false,
  'Plants are planted, moved and destroyed continuously. This sat at 15,595 for six days while the sync was broken and nothing noticed. It is the metric this guard was built for.'),
 ('Cultivation','Plants growing now', interval '2 days', false,
  'A live plant count that does not move means the sync is dead, not that the plants are.'),
 ('Manufacturing','Fresh frozen on hand', interval '7 days', false,
  'Fresh frozen is consumed in runs. A week without movement means either no production or no data, and both are worth knowing.'),
 ('Manufacturing','Fresh frozen dry-equivalent', interval '7 days', false,
  'Derived from fresh frozen on hand; moves when it moves.'),
 ('Command','In the rooms, dry-equivalent', interval '7 days', false,
  'Rooms are pulled on an eight-week cycle, so a week of stillness is plausible but two is not.'),
 ('Cultivation','In the rooms, dry-equivalent', interval '7 days', false,
  'Same metric, Cultivation surface.'),
 ('Command','Moisture loss not recorded', interval '7 days', false,
  'CURRENTLY NULL on the live view and 21,935.4 in the last snapshot. Under investigation.'),
 ('Cultivation','Moisture loss not recorded', interval '7 days', false,
  'Same metric, Cultivation surface. Also NULL.'),
 ('Human Resources','Departments', null, true,
  'Structural. Eight departments do not change week to week and it would be noise to watch it.'),
 ('Settings','Users with AI access', null, true,
  'Changes only when an administrator grants access. Static is the normal state.'),
 ('Infused Pre-Rolls & Flower','Pre-rolls never tested', interval '14 days', false,
  'Sat at 0.2 lb for the whole snapshot history. Small, but a number that never moves is either true or unwatched, and we cannot currently tell which.')
on conflict (department, kpi) do nothing;

create or replace view v_kpi_staleness as
with live as (
  select department, kpi, value as live_value, unit from mv_department_dashboard
),
hist as (
  select department, kpi, taken_on, value,
         lag(value) over (partition by department, kpi order by taken_on) as prev_value
  from dashboard_snapshots
),
changed as (
  select department, kpi, max(taken_on) filter (where prev_value is distinct from value) as last_changed_on,
         count(*) as snapshots_held
  from hist group by department, kpi
)
select l.department, l.kpi, l.live_value, l.unit,
       c.last_changed_on,
       c.snapshots_held,
       (current_date - c.last_changed_on) as days_unchanged,
       p.must_move_within, p.exempt, p.why as policy_reason,
       case
         when l.live_value is null                    then 'NULL VALUE — the tile shows nothing and asks nobody a question'
         when p.department is null                    then 'UNPOLICED — no freshness policy declared for this KPI'
         when p.exempt                                then 'EXEMPT — ' || p.why
         when c.last_changed_on is null               then 'NO HISTORY — never seen to change; snapshots begin 6 Aug 2026'
         when (current_date - c.last_changed_on) * interval '1 day' > p.must_move_within
              then 'STALE — unchanged for ' || (current_date - c.last_changed_on) || ' days against a policy of ' || p.must_move_within
         else 'FRESH'
       end as verdict
from live l
left join changed c on c.department = l.department and c.kpi = l.kpi
left join kpi_freshness_policy p on p.department = l.department and p.kpi = l.kpi;

comment on view v_kpi_staleness is
 'Dashboard KPIs judged on whether their VALUE moves, not on whether the refresh job ran. The '
 'refresh job succeeded 144 times a day through six days of frozen plant data. Read this, not '
 'the cron history, to know whether a dashboard is alive. NULL VALUE and UNPOLICED are both '
 'faults: one is a broken metric, the other is a metric nobody decided to watch.';

insert into verification_checks (
  check_key, title, what_it_proves, source_a_label, source_a_sql, source_b_label, source_b_sql,
  tolerance_pct, severity, owner, enabled, added_on, measures_a_process)
values
('dashboard-no-null-kpis',
 'No dashboard KPI renders as NULL',
 'A NULL KPI reaches the screen as a blank or a zero, which reads as "nothing to worry about" '
 'rather than "this metric is broken". Two are NULL right now - Moisture loss not recorded, on '
 'both Command and Cultivation - so this check fires on registration, correctly.',
 'Dashboard KPIs',
 'select count(*)::numeric from mv_department_dashboard',
 'Of those, how many carry a value',
 'select count(*)::numeric from mv_department_dashboard where value is not null',
 0, 'elevated', 'Agent I', true, date '2026-08-11', false),
('dashboard-values-actually-move',
 'Every dashboard KPI either moves within its policy or is knowingly exempt',
 'THE GUARD FOR THE SIX LOST DAYS. From 6 to 11 August the plant mirror sat at 15,595 while the '
 'dashboard recomputed 144 times a day and announced itself live. Monitoring the refresh job '
 'could never have caught it, because the job was working perfectly - it was faithfully '
 'rendering dead data. This watches the VALUE. If it fires, do not restart the refresh; find out '
 'why the data underneath stopped arriving.',
 'KPIs with a freshness policy',
 'select count(*)::numeric from v_kpi_staleness where must_move_within is not null or exempt',
 'Of those, how many are fresh, exempt, or too new to judge',
 'select count(*)::numeric from v_kpi_staleness where (must_move_within is not null or exempt) and verdict not like ''STALE%'' and verdict not like ''NULL VALUE%''',
 0, 'critical', 'Agent W', true, date '2026-08-11', false)
on conflict (check_key) do update set
  title = excluded.title, what_it_proves = excluded.what_it_proves,
  source_a_sql = excluded.source_a_sql, source_b_sql = excluded.source_b_sql,
  severity = excluded.severity, owner = excluded.owner, enabled = excluded.enabled;;
