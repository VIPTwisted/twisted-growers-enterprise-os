/* THE STANDING PLANT CENSUS, FROM BOTH OF METRC'S OWN PATHS.
 *
 * Owner, 13 Aug 2026: "pull the reports i gave you and pull from reports."
 *
 * WHY. The API mirror cannot see Flower Room #2. Not one of its 1,050 tags
 * (1A40A020000E5B1000055208 through ...056257) exists in metrc_plants in any state.
 * I covered 1 Jun to 14 Aug in windows as fine as one day, and the backfill had
 * already walked May 2024 to Aug 2026 in 59 windows for 51,076 plants. The API
 * returns nothing for those tags in any window, and returned zero on nine
 * consecutive runs that were each recorded as a success.
 *
 * A lastModified delta cannot reach a plant that has not been modified since the
 * cursor passed it. Slicing the window finer does not help; the plant is simply not
 * in any window. Only an unwindowed ask - "what is flowering right now" - would
 * return it, and that call currently returns zero for reasons that need the live
 * function source to diagnose.
 *
 * BUT METRC ALREADY TOLD US. metrc_rpt_point_in_time is loaded from Metrc's own
 * point-in-time export - the same legal record, a different door. It holds the whole
 * standing census: 4,380 flowering across four rooms and 33 vegetative in the Mother
 * Room, every one tagged. Including all 1,050 in F2.
 *
 * WHAT THIS DOES, AND WHAT IT REFUSES TO DO. It does NOT write report rows into
 * metrc_plants. That table is the API mirror and it must stay one thing, or the next
 * person cannot tell which door a row came in through - and on a legal record that
 * matters more than convenience. Instead both paths are joined on the tag and every
 * row says where it came from:
 *
 *     both               the API and the report agree this plant is standing
 *     metrc report only  the report has it, the API has never returned it
 *     metrc api only     the API has it and the report predates it
 *
 * Nothing is invented and nothing is averaged. A tag known to one side and not the
 * other is reported as exactly that.
 *
 * THE REPORT IS NOT LIVE. It is a dated export, currently 8 days old, so
 * "metrc api only" is the expected state for anything that moved since - a room
 * flipped, a plant destroyed. Age is on every row so nobody quotes a stale count as
 * a live one. The API mirror stays the fresher side wherever it actually works; this
 * view exists because on F2 it does not work at all.
 */

create or replace view public.v_plant_census as
with rpt_day as (
  select max(as_of_date) as d from public.metrc_rpt_point_in_time
), report as (
  select p.tag,
         p.location        as room,
         p.status_current  as phase,
         nullif(p.strain, '') as strain
    from public.metrc_rpt_point_in_time p, rpt_day
   where p.as_of_date = rpt_day.d
     and p.record_type = 'Plant'
     and p.status_current in ('Flowering', 'Vegetative')
), api as (
  select p.tag,
         coalesce(nullif(p.room, ''), p.raw ->> 'LocationName') as room,
         initcap(p.source_state)                                as phase,
         nullif(p.strain, '')                                   as strain,
         p.synced_at
    from public.metrc_plants p
   where p.source_state in ('flowering', 'vegetative')
)
select coalesce(a.tag, r.tag)                                as tag,
       coalesce(a.room, r.room)                              as room,
       coalesce(a.phase, r.phase)                            as phase,
       coalesce(a.strain, r.strain)                          as strain,
       case when a.tag is not null and r.tag is not null then 'both'
            when a.tag is null                          then 'metrc report only'
            else                                             'metrc api only'
       end                                                   as source,
       (a.tag is not null)                                   as in_api_mirror,
       (r.tag is not null)                                   as in_metrc_report,
       a.synced_at                                           as api_synced_at,
       (select d from rpt_day)                               as report_as_of,
       (current_date - (select d from rpt_day))              as report_age_days,
       case
         when a.tag is not null and r.tag is not null
           then 'Both of Metrc''s paths agree this plant is standing.'
         when a.tag is null
           then 'Metrc''s own point-in-time report holds this plant; the API sync has never returned it. Real plant, missing mirror - do not read its absence from metrc_plants as an absence from the room.'
         else 'The API returned this plant and the report predates it by '
              || (current_date - (select d from rpt_day)) || ' days. Expected for anything that moved since the export.'
       end                                                   as provenance_note,
       case when a.room is not null and r.room is not null and a.room is distinct from r.room
            then 'ROOM DISAGREEMENT - api says ' || a.room || ', report says ' || r.room
       end                                                   as room_disagreement
  from api a
  full join report r on r.tag = a.tag;

comment on view public.v_plant_census is
  'Every standing plant, from BOTH of Metrc''s own paths - the API mirror (metrc_plants) and the point-in-time report (metrc_rpt_point_in_time) - joined on the tag with the source named on every row. Built 13 Aug 2026 because the API cannot see Flower Room #2: none of its 1,050 tags appear in metrc_plants in any state, across every window from May 2024 to Aug 2026, and nine consecutive runs returned zero while reporting success. Report rows are deliberately NOT written into metrc_plants - that table is the API mirror and must stay one thing, so the next reader can always tell which door a row came through. Read report_age_days before quoting a count: the report is a dated export, so metrc api only is the expected state for anything that moved since.';;
