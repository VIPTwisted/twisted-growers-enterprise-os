-- Agent I (Database COO), 12 Aug 2026. Filed for review as DBI-027 (reviewers V, X, W).
-- Two items from Agent B's delivery-audit data queue.
--
-- 1. DRY-TIME DISCIPLINE BY MONTH - the data behind design pattern 5 (the owner's DDC-inspired
--    monthly bars: % of harvests inside the dry window). Agent B correctly refused to compute it
--    in the front end. Built on v_harvest_forensic.dry_days_to_first_package (rule 12: the
--    per-harvest derivation already existed). Thresholds read LIVE from harvest_alert_rules
--    (dry_target_days=10, dry_max_days=14) so the owner tuning a rule re-scores history without
--    a migration. Harvests with no first package yet are EXCLUDED from the percentage and
--    counted separately - an open harvest has no dry time, and inventing one would be rule A1.
--
-- 2. user_settings.collapse_state - cross-device persistence for the per-user section collapse
--    the owner ordered. B shipped localStorage; this is the durable home. JSONB keyed by page,
--    values = arrays of collapsed section keys. Additive, nullable, breaks nothing.
--
-- UNDO: drop view v_dry_time_discipline; alter table user_settings drop column collapse_state;

create or replace view public.v_dry_time_discipline as
with rules as (
  select (select threshold from harvest_alert_rules where rule_key='dry_target_days') as lo,
         (select threshold from harvest_alert_rules where rule_key='dry_max_days')    as hi
)
select to_char(date_trunc('month', f.harvest_started_date), 'YYYY-MM')      as month,
       to_char(date_trunc('month', f.harvest_started_date), 'Mon')          as month_label,
       count(*) filter (where f.dry_days_to_first_package is not null)      as harvests_scored,
       count(*) filter (where f.dry_days_to_first_package is null)          as harvests_not_yet_packaged,
       count(*) filter (where f.dry_days_to_first_package between r.lo and r.hi) as inside_window,
       round(100.0 * count(*) filter (where f.dry_days_to_first_package between r.lo and r.hi)
             / nullif(count(*) filter (where f.dry_days_to_first_package is not null), 0)) as pct_inside_window,
       round(avg(f.dry_days_to_first_package) filter (where f.dry_days_to_first_package is not null), 1) as avg_dry_days,
       count(*) filter (where f.dry_days_to_first_package > r.hi)           as dried_too_long,
       count(*) filter (where f.dry_days_to_first_package < r.lo)           as pulled_too_fast,
       r.lo as window_from_days, r.hi as window_to_days
from v_harvest_forensic f cross join rules r
where f.harvest_started_date is not null
group by date_trunc('month', f.harvest_started_date), r.lo, r.hi
order by 1;

comment on view public.v_dry_time_discipline is
 'Percent of harvests whose dry time landed inside the 10-14 day window, by harvest month - the '
 'data behind the dry-time discipline bars (owner design pattern 5). Thresholds read live from '
 'harvest_alert_rules so tuning a rule re-scores history. Open harvests with no first package '
 'are counted in harvests_not_yet_packaged and EXCLUDED from the percentage - an unfinished '
 'harvest has no dry time and inventing one is forbidden (rule A1). Per-harvest source: '
 'v_harvest_forensic.dry_days_to_first_package.';

alter table user_settings add column if not exists collapse_state jsonb;

comment on column user_settings.collapse_state is
 'Per-user dashboard section collapse memory, keyed by page: {"command": ["rooms","reports"]}. '
 'Owner order 11 Aug 2026: every section collapsible, remembered per user, two executives may '
 'hold different views. Front end falls back to localStorage when null. Collapsed sections stay '
 'mounted - collapse hides, it never unmounts monitoring.';;
