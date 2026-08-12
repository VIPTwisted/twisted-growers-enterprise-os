-- DWELL: how long a tag sat at each step, and the whole journey. This is the answer
-- to "we cannot sit on inventory" and it is arithmetic between consecutive ledger
-- rows - impossible from a status column, which is why it did not exist before.

create or replace view public.v_tag_dwell as
with ordered as (
  select tag, event_at, event_type, stage, location, manifest_number, qty, uom,
         lead(event_at)   over (partition by tag order by event_at, id) as next_at,
         lead(event_type) over (partition by tag order by event_at, id) as next_type
  from public.tag_event
)
select tag, event_type, stage, location, manifest_number, qty, uom,
       event_at,
       next_at,
       next_type,
       /* OPEN legs are measured to NOW - that is the point. A tag still sitting is
          exactly the one tying up cash, and it must not read as zero days. */
       (next_at is null)                                        as still_open,
       round(extract(epoch from (coalesce(next_at, now()) - event_at)) / 86400.0, 1) as days_here
from ordered;

comment on view public.v_tag_dwell is
  'Days a tag spent at each step. An OPEN leg is measured to now, deliberately: a tag still sitting is the one tying up cash and must never read as zero days.';

-- THE CASH VIEW: one row per tag, the whole journey, against the editable targets.
create or replace view public.v_tag_turnaround as
with j as (
  select tag,
         min(event_at) filter (where event_type = 'packaged') as packaged_at,
         min(event_at) filter (where event_type = 'tested')   as tested_at,
         max(event_at) filter (where event_type = 'shipped')  as shipped_at,
         max(event_at) filter (where event_type = 'received') as received_at,
         max(event_at)                                        as last_seen,
         count(*)                                             as events
  from public.tag_event group by tag
),
t as (
  select stage, target_days, warn_at_pct from public.turnaround_target where scope = 'company'
)
select j.tag,
       j.packaged_at, j.tested_at, j.shipped_at, j.received_at, j.last_seen, j.events,
       round(extract(epoch from (j.tested_at  - j.packaged_at))/86400.0, 1) as days_to_test,
       round(extract(epoch from (j.shipped_at - j.packaged_at))/86400.0, 1) as days_to_ship,
       /* STILL ON HAND: packaged, never shipped. The cash number. */
       (j.packaged_at is not null and j.shipped_at is null)                 as still_on_hand,
       case when j.packaged_at is not null and j.shipped_at is null
            then round(extract(epoch from (now() - j.packaged_at))/86400.0, 1) end as days_on_hand,
       (select target_days from t where stage = 'on hand')                  as target_on_hand_days,
       case
         when j.packaged_at is null or j.shipped_at is not null then null
         when extract(epoch from (now() - j.packaged_at))/86400.0
              >= (select target_days from t where stage = 'on hand') then 'OVER TARGET'
         when extract(epoch from (now() - j.packaged_at))/86400.0
              >= (select target_days * warn_at_pct / 100.0 from t where stage = 'on hand') then 'approaching'
         else 'within target'
       end as on_hand_status
from j;

comment on view public.v_tag_turnaround is
  'One row per tag: packaged, tested, shipped, days at each, and whether it is over the EDITABLE on-hand target. Status reads turnaround_target, so changing the target changes every alert - no deploy.';

grant select on public.v_tag_dwell, public.v_tag_turnaround to authenticated, tg_desktop_reader;

-- COVERAGE - say what is NOT known rather than let a gap read as a good number.
create or replace view public.v_tag_dwell_coverage as
select
  (select count(distinct tag) from public.tag_event)                                  as tags_with_any_event,
  (select count(*) from public.metrc_packages where tag is not null)                  as metrc_packages_total,
  (select count(*) from public.metrc_packages p
     where p.tag is not null and not exists
       (select 1 from public.tag_event e where e.tag = p.tag))                        as packages_with_NO_event,
  (select count(*) from public.coa_extract where package_tag is not null)             as coa_rows,
  (select count(*) from public.coa_extract
     where package_tag is not null and report_date is not null
       and report_date !~ '^\s*\d{4}-\d{2}-\d{2}' and report_date !~ '^\s*\d{1,2}/\d{1,2}/\d{4}')
                                                                                      as coa_dates_unparseable,
  (select count(*) from public.turnaround_target where set_by = 'placeholder')        as targets_STILL_PLACEHOLDER;

comment on view public.v_tag_dwell_coverage is
  'What the ledger does NOT know. coa_dates_unparseable counts COA rows whose report_date is PDF-parser junk - one holds a date, a phone number and an email in the same field. targets_STILL_PLACEHOLDER counts targets nobody has approved; while that is non-zero every turnaround status is provisional.';

grant select on public.v_tag_dwell_coverage to authenticated, tg_desktop_reader;;
