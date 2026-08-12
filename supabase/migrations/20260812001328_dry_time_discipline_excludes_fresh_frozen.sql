-- Agent I, 12 Aug 2026. Correcting my own view MINUTES after building it - the first read
-- showed 0% inside the window every month with an 11.6-day average, which is arithmetically
-- possible and factually wrong. WRONG POPULATION, caught before anyone consumed it:
-- 74 fresh-frozen harvests (marked FF in the harvest NAME - harvest_type says WholePlant for
-- everything) package within ~2.3 days BY DESIGN. They never dry, so scoring them against a
-- 10-14 day dry window drags every month toward zero. Owner rule: normalise units and
-- population before comparing.
--
-- After exclusion the honest headline: 287 dry harvests average 41.4 DAYS to first package
-- against a 14-day outer limit. That is the real discipline picture the bars will show, and it
-- is bad - but it is TRUE-bad, not artifact-bad. Note the metric honestly measures days to
-- FIRST PACKAGE: it conflates drying with packaging delay. That is the calendar's own
-- discipline definition (dry day 10-14, then package off), so a late package IS a violation,
-- but the bar label must say "days to first package", not "days drying".
--
-- UNDO: restore from migration dry_time_discipline_and_collapse_state.

create or replace view public.v_dry_time_discipline as
with rules as (
  select (select threshold from harvest_alert_rules where rule_key='dry_target_days') as lo,
         (select threshold from harvest_alert_rules where rule_key='dry_max_days')    as hi
),
scored as (
  select f.*, (f.harvest_name ~* '\mFF\M') as is_ff
  from v_harvest_forensic f
  where f.harvest_started_date is not null
)
select to_char(date_trunc('month', s.harvest_started_date), 'YYYY-MM')      as month,
       to_char(date_trunc('month', s.harvest_started_date), 'Mon')          as month_label,
       count(*) filter (where not s.is_ff and s.dry_days_to_first_package is not null) as harvests_scored,
       count(*) filter (where not s.is_ff and s.dry_days_to_first_package is null)     as harvests_not_yet_packaged,
       count(*) filter (where not s.is_ff and s.dry_days_to_first_package between r.lo and r.hi) as inside_window,
       round(100.0 * count(*) filter (where not s.is_ff and s.dry_days_to_first_package between r.lo and r.hi)
             / nullif(count(*) filter (where not s.is_ff and s.dry_days_to_first_package is not null), 0)) as pct_inside_window,
       round(avg(s.dry_days_to_first_package) filter (where not s.is_ff), 1) as avg_dry_days,
       count(*) filter (where not s.is_ff and s.dry_days_to_first_package > r.hi) as dried_too_long,
       count(*) filter (where not s.is_ff and s.dry_days_to_first_package < r.lo) as pulled_too_fast,
       r.lo as window_from_days, r.hi as window_to_days,
       count(*) filter (where s.is_ff) as fresh_frozen_excluded
from scored s cross join rules r
group by date_trunc('month', s.harvest_started_date), r.lo, r.hi
order by 1;

comment on view public.v_dry_time_discipline is
 'Percent of DRY harvests whose days-to-first-package landed inside the 10-14 day window, by '
 'harvest month (owner design pattern 5). FRESH-FROZEN HARVESTS ARE EXCLUDED and counted in '
 'fresh_frozen_excluded: they package in ~2.3 days by design and scoring them against a dry '
 'window manufactured 0% months - wrong population, caught 12 Aug 2026 before any consumer read '
 'it. FF is detected from the harvest NAME (word FF); harvest_type reads WholePlant for all. '
 'Thresholds live from harvest_alert_rules. The metric is days to FIRST PACKAGE - the calendar''s '
 'own discipline test - so label bars "days to first package", never "days drying". Open '
 'harvests are excluded from the percentage (A1: an unfinished harvest has no dry time).';;
