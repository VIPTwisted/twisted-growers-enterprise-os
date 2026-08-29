-- v_plant_mirror_balance: fence both sides to the CULTIVATION licence.
--
-- WHY
-- The view balances Metrc's Inventory Point in Time export against our own plant
-- mirror, per Flower Room. Before this change the report side filtered on
-- status_current = 'Flowering' and nothing else — no licence, no record_type.
--
-- That was safe only by accident. metrc_rpt_point_in_time holds BOTH licences:
--
--     as_of 2026-08-06  MC281714  4,413 plants + 107 packages
--     as_of 2026-08-06  MP281909              643 packages
--     as_of 2025-01-01  MC281714  2,018 plants +  85 packages
--
-- Today no MP281909 row and no Package row carries status_current 'Flowering',
-- so the unfenced filter happened to return cultivation plants only. The day a
-- manufacturing package or a second licence exports with that status, its rows
-- would be counted into a Flower Room and silently inflate metrc_report_plants.
-- A room count is a compliance figure; it must not depend on that coincidence.
--
-- BOTH SIDES, NOT ONE
-- The mirror side is fenced to the same licence set. metrc_plants is MC281714-only
-- today (3,330 flowering), so this is likewise a no-op — but fencing only the
-- report side would create a NEW defect: if MP plants ever synced, our_mirror_plants
-- would include them while metrc_report_plants excluded them, and the view would
-- report a false 'MIRROR OVER by N plants' verdict against a room that is fine.
-- An asymmetric fence is worse than no fence.
--
-- LICENCE SOURCE
-- company_licenses (kind='cultivation', active) — the same registry f_is_ours reads,
-- so adding a second cultivation licence is a data change, not a code change.
-- NOT the `licenses` table: it is EMPTY, and sourcing from it would return zero
-- rows and blank every Flower Room card while looking like a clean deploy.
-- The array_agg falls back to the literal set if the registry ever returns no
-- cultivation row, so this view can never silently empty itself. Refuse, don't zero.
--
-- DELIBERATELY UNCHANGED
--   * status_current = 'Flowering' — flowering only. Vegetative/immature (33 rows
--     on the report side, 1,080 in the mirror) stay OUT of the room counts.
--   * report_as_of / report_age_days / verdict / staleness_note — the as-of labels
--     are correct and stay exactly as they are.
--   * Column names, order and types are identical, so create-or-replace is valid
--     and no dependent view is disturbed.
--   * Flower Room #4 (report 1,050, mirror 0) is NOT addressed here. That is a
--     sync fault and belongs to another lane. This migration must not move it.
--
-- MEASURED BEFORE AND AFTER, prod, 29 Aug 2026: per-room counts identical.
--   Flower Room #1 1140 -> 1140   #2 1050 -> 1050   #3 1140 -> 1140   #4 1050 -> 1050
-- A guard that changes a number today would mean the old number was wrong; it
-- wasn't. This closes the door, it does not move the furniture.

create or replace view v_plant_mirror_balance as
with rpt_day as (
  select max(as_of_date) as d
    from metrc_rpt_point_in_time
),
cult as (
  -- Cultivation licences, upper-trimmed for comparison. Falls back to the known
  -- cultivation licence rather than an empty set: an empty set would zero the view.
  select coalesce(
           array_agg(upper(btrim(license))) filter (where active and kind = 'cultivation'),
           array['MC281714']
         ) as lic
    from company_licenses
),
rpt as (
  select p.location as room,
         count(*) as metrc_report_plants
    from metrc_rpt_point_in_time p,
         rpt_day,
         cult
   where p.as_of_date = rpt_day.d
     and p.status_current = 'Flowering'
     and p.record_type = 'Plant'
     and upper(btrim(p.licence)) = any (cult.lic)
   group by p.location
),
mirror as (
  select coalesce(p.raw ->> 'LocationName', '(no location on the record)') as room,
         count(*) as our_mirror_plants,
         max(p.synced_at) as last_synced
    from metrc_plants p,
         cult
   where p.source_state = 'flowering'
     and upper(btrim(p.license)) = any (cult.lic)
   group by coalesce(p.raw ->> 'LocationName', '(no location on the record)')
)
select coalesce(r.room, m.room) as room,
       coalesce(r.metrc_report_plants, 0::bigint) as metrc_report_plants,
       coalesce(m.our_mirror_plants, 0::bigint) as our_mirror_plants,
       coalesce(m.our_mirror_plants, 0::bigint) - coalesce(r.metrc_report_plants, 0::bigint) as gap,
       (select rpt_day.d from rpt_day) as report_as_of,
       current_date - (select rpt_day.d from rpt_day) as report_age_days,
       m.last_synced,
       case
         when coalesce(m.our_mirror_plants, 0::bigint) = coalesce(r.metrc_report_plants, 0::bigint)
           then 'BALANCED'
         when coalesce(m.our_mirror_plants, 0::bigint) = 0
           then 'THE MIRROR HOLDS NONE OF THIS ROOM. Metrc reports ' || r.metrc_report_plants
                || ' plants standing here. Do NOT read this room as empty - read it as unsynced. '
                || 'This exact state was escalated as an operational emergency on 13 Aug 2026 and the room was full.'
         when coalesce(m.our_mirror_plants, 0::bigint) < coalesce(r.metrc_report_plants, 0::bigint)
           then 'MIRROR SHORT by ' || (r.metrc_report_plants - m.our_mirror_plants)
                || ' plants. The sync has not fetched them; they are not missing from the facility.'
         else 'MIRROR OVER by ' || (m.our_mirror_plants - r.metrc_report_plants)
              || ' plants - the mirror holds plants the report does not. Either the report is older than a takedown, or a tag was not retired.'
       end as verdict,
       case
         when (current_date - (select rpt_day.d from rpt_day)) > 2
           then 'The report side is ' || (current_date - (select rpt_day.d from rpt_day))
                || ' days old, so a small gap may simply be movement since. A gap the size of a whole room is not.'
         else null
       end as staleness_note
  from rpt r
  full join mirror m on m.room = r.room
 where coalesce(r.room, m.room) ilike 'Flower Room%';

comment on view v_plant_mirror_balance is
  'Per-room balance of Metrc''s Inventory Point in Time export against our plant mirror. '
  'BOTH sides are fenced to company_licenses kind=''cultivation'' so a manufacturing '
  'package can never be counted into a Flower Room, and so neither side can drift '
  'relative to the other. Flowering only - vegetative/immature is excluded by design. '
  'report_as_of and report_age_days state the snapshot date on every row; the report '
  'side asserts what was true on that date and not necessarily since.';
