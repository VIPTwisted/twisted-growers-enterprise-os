/* THE DATE RANGE SURVIVES THE DRILL — owner date-range engine, rule 4:
 * "Tile -> Table -> Tag -> Event -> Document. The date range MUST persist. If
 * drill-down ignores the date range the OS is broken."
 *
 * f_drill_tags already filters on packaged_from/packaged_to. The two deeper
 * levels did not accept a window at all, so a drill into a tag's events
 * showed its whole life whatever the user had selected. Both now take the
 * same optional window and default to open — an omitted range means all time,
 * exactly as before, so nothing that calls them today changes behaviour.
 *
 * WHAT DOES NOT GET FILTERED, AND WHY IT MUST NOT: the STAY that is open when
 * the window begins. A tag that entered Cure Vault in June and is still there
 * in August must appear in an August window — it IS where the material is.
 * Filtering it out because its start date precedes the window would empty the
 * room drill of everything that has been sitting longest, which is the exact
 * opposite of what an auditor is looking for. Stays are therefore selected by
 * OVERLAP with the window, not by start date, and the rule is stated here so
 * nobody "fixes" it later. */

create or replace function public.f_drill_events(
  p_tag text, p_from date default null, p_to date default null)
returns table (
  seq integer, event_at timestamptz, event_type text, what text,
  stage text, room text, qty numeric, uom text,
  counterparty text, manifest_no text, document_link text,
  source_system text, recorded_by text
)
language sql stable parallel safe
set search_path to 'public', 'pg_temp'
as $$
select row_number() over (order by e.event_at, e.id)::integer as seq,
       e.event_at, e.event_type,
       case e.event_type
         when 'packaged'        then 'Package created and tagged'
         when 'tested'          then 'Laboratory result recorded'
         when 'received'        then 'Received under a manifest'
         when 'location_change' then 'Moved to ' || coalesce(e.location,'another room')
         else initcap(replace(e.event_type,'_',' ')) end as what,
       e.stage, e.location as room, e.qty, e.uom,
       coalesce(e.counterparty_licence, e.cultivator_name, e.manufacturer_name) as counterparty,
       e.manifest_number as manifest_no,
       coalesce(
         (select d.storage_path from metrc_documents d
           where d.manifest_number = e.manifest_number and d.doc_type ilike '%manifest%' limit 1),
         case when e.event_type='tested' then (select td.coa_document_link from mv_tag_documents td where td.tag = e.tag) end
       ) as document_link,
       e.source as source_system,
       coalesce(e.attribution_source, e.source) as recorded_by
from tag_event e
where e.tag = p_tag
  and (p_from is null or e.event_at >= p_from::timestamptz)
  and (p_to   is null or e.event_at <  (p_to + 1)::timestamptz)
order by e.event_at, e.id;
$$;

create or replace function public.f_drill_stays(
  p_tag text, p_from date default null, p_to date default null)
returns setof public.v_tag_stay
language sql stable parallel safe
set search_path to 'public', 'pg_temp'
as $$
  select * from public.v_tag_stay s
  where s.tag = p_tag
    /* OVERLAP, not start-date: a stay that began before the window and is
       still running IS the current location and must show. */
    and (p_from is null or coalesce(s.end_timestamp, now()) >= p_from::timestamptz)
    and (p_to   is null or s.start_timestamp < (p_to + 1)::timestamptz)
  order by s.stay_no;
$$;

comment on function public.f_drill_events(text, date, date) is
  'One tag''s events, optionally windowed to the user''s selected date range so the range survives '
  'the drill (owner date-range engine, rule 4). Omit the dates for all time. Agent I.';
comment on function public.f_drill_stays(text, date, date) is
  'One tag''s room/stage stays, windowed by OVERLAP so a stay that began before the window and is '
  'still open still shows — it is where the material is. Agent I.';

grant execute on function public.f_drill_events(text, date, date) to authenticated;
grant execute on function public.f_drill_stays(text, date, date) to authenticated;;
