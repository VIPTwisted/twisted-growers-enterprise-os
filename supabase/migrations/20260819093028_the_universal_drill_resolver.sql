/* THE UNIVERSAL DRILL RESOLVER — the owner's architecture, made enforceable.
 *
 * His rule: "no dead numbers. Every number, row, tile, KPI and chart must have
 * a drill path down to the underlying events and the linked documents."
 *
 * The measurement that forced this: 630 pages, only 113 could reach a
 * document — not because 517 pages were each built wrong, but because they
 * read AGGREGATES (v_room_contents, v_stock_on_hand, v_inventory_aging,
 * v_room_yield) which group the tags away before the page sees them. A summed
 * row cannot be drilled: the tag list was discarded upstream.
 *
 * So the fix is not 517 rewrites. It is TWO functions that reconstruct the
 * path from any grouping key, exactly the hierarchy he specified:
 *   f_drill_tags(filter) — SUMMARY/GROUP -> ENTITY: every tag behind the row,
 *                          each carrying the document trinity.
 *   f_drill_events(tag)  — ENTITY -> EVENT -> DOCUMENT: the tag's whole life,
 *                          each event naming its source system and document.
 *
 * Both read the canonical one-row-per-tag ledger and mv_tag_documents, so a
 * drill can never disagree with the tile it came from. Unknown filter keys
 * RAISE rather than silently widening the answer — a drill that quietly
 * returns more than its tile is the failure mode that produced 963 false
 * discrepancies on 18 Aug. */

create or replace function public.f_raise_unknown_drill_key(p_keys text)
returns boolean language plpgsql immutable
set search_path to 'public', 'pg_temp'
as $$
begin
  raise exception 'f_drill_tags: unknown filter key(s) "%". A drill that silently ignores a filter '
                  'returns MORE rows than the tile it came from — the exact failure that produced '
                  '963 false discrepancies. Add the key to the resolver deliberately.', p_keys;
end $$;

create or replace function public.f_drill_tags(p_filter jsonb default '{}'::jsonb)
returns table (
  tag text, item_name text, category text, strain text, licence text,
  room text, stage text, lab_state text, lb numeric, units numeric,
  packaged_on date, days_held integer, closed boolean, origin text,
  source_harvest text,
  coa_certificate_id text, coa_document_link text,
  manifest_no text, manifest_document_link text,
  apex_invoice_no text, apex_invoice_usd numeric,
  where_to_audit text
)
language sql stable parallel safe
set search_path to 'public', 'pg_temp'
as $$
with guard as (
  select case when exists (
    select 1 from jsonb_object_keys(coalesce(p_filter,'{}'::jsonb)) k
    where k not in ('room','licence','strain','category','lab_state','harvest','item_name',
                    'origin','live_only','include_closed','packaged_from','packaged_to',
                    'age_over_days','has_coa','has_manifest','has_invoice','missing_coa',
                    'missing_manifest','missing_invoice','tag','stream')
  ) then public.f_raise_unknown_drill_key(
    (select string_agg(k,',') from jsonb_object_keys(coalesce(p_filter,'{}'::jsonb)) k
     where k not in ('room','licence','strain','category','lab_state','harvest','item_name',
                     'origin','live_only','include_closed','packaged_from','packaged_to',
                     'age_over_days','has_coa','has_manifest','has_invoice','missing_coa',
                     'missing_manifest','missing_invoice','tag','stream')))
  else true end as ok
),
led as (
  select p.tag, p.item_name, p.license, p.location, p.quantity, p.uom, p.packaged_on,
         p.lab_testing_state, p.finished, p.raw,
         coalesce(p.raw #>> '{Item,ProductCategoryName}','(uncategorised)') as category,
         nullif(p.raw #>> '{Item,StrainName}','') as strain,
         nullif(p.raw->>'SourceHarvestNames','') as source_harvest,
         (coalesce(p.finished,false) or nullif(p.raw->>'FinishedDate','') is not null
          or nullif(p.raw->>'ArchivedDate','') is not null) as is_closed
  from (select distinct on (d.tag) d.* from metrc_packages d
        order by d.tag, (coalesce(d.quantity,0) > 0 and not coalesce((d.raw->>'IsFinished')::boolean,false)) desc,
                 (d.source_state = 'active') desc nulls last, d.synced_at desc nulls last) p
)
select l.tag, l.item_name, l.category, l.strain, l.license as licence,
       l.location as room,
       case when l.is_closed then 'Closed'
            when l.lab_testing_state='TestPassed' then 'Sellable'
            when l.lab_testing_state='TestFailed' then 'FAILED TESTING'
            when l.lab_testing_state in ('SubmittedForTesting','AwaitingConfirmation') then 'Awaiting laboratory'
            else 'In inventory' end as stage,
       l.lab_testing_state as lab_state,
       round(f_to_pounds(l.quantity, l.uom),3) as lb,
       case when not f_is_weight(l.uom) then l.quantity end as units,
       l.packaged_on,
       (current_date - l.packaged_on)::integer as days_held,
       l.is_closed as closed,
       case when f_is_ours(l.raw->>'ItemFromFacilityLicenseNumber') then 'Ours' else 'Bought in' end as origin,
       l.source_harvest,
       td.coa_certificate_id, td.coa_document_link,
       td.manifest_no, td.manifest_document_link,
       td.apex_invoice_no, td.apex_invoice_usd,
       case when l.is_closed then 'CLOSED — the record is the evidence.'
            when coalesce(l.location,'')='' then 'ON SITE but Metrc records no room. Find it by tag.'
            else 'ON SITE — ' || l.location || ', licence ' || l.license || '. Inspect the physical tag.' end as where_to_audit
from led l
left join mv_tag_documents td on td.tag = l.tag
cross join guard g
where g.ok
  and (p_filter->>'tag'        is null or l.tag = p_filter->>'tag')
  and (p_filter->>'room'       is null or l.location = p_filter->>'room')
  and (p_filter->>'licence'    is null or l.license = p_filter->>'licence')
  and (p_filter->>'strain'     is null or l.strain ilike p_filter->>'strain')
  and (p_filter->>'category'   is null or l.category = p_filter->>'category')
  and (p_filter->>'stream'     is null or l.category ilike '%'||(p_filter->>'stream')||'%'
                                       or l.item_name ilike '%'||(p_filter->>'stream')||'%')
  and (p_filter->>'lab_state'  is null or l.lab_testing_state = p_filter->>'lab_state')
  and (p_filter->>'harvest'    is null or l.source_harvest ilike '%'||(p_filter->>'harvest')||'%')
  and (p_filter->>'item_name'  is null or l.item_name = p_filter->>'item_name')
  and (p_filter->>'origin'     is null or (case when f_is_ours(l.raw->>'ItemFromFacilityLicenseNumber') then 'Ours' else 'Bought in' end) = p_filter->>'origin')
  and (p_filter->>'packaged_from' is null or l.packaged_on >= (p_filter->>'packaged_from')::date)
  and (p_filter->>'packaged_to'   is null or l.packaged_on <= (p_filter->>'packaged_to')::date)
  and (p_filter->>'age_over_days' is null or (current_date - l.packaged_on) > (p_filter->>'age_over_days')::int)
  and (p_filter->>'has_coa'      is null or (td.coa_document_link is not null) = (p_filter->>'has_coa')::boolean)
  and (p_filter->>'missing_coa'  is null or (td.coa_document_link is null)     = (p_filter->>'missing_coa')::boolean)
  and (p_filter->>'has_manifest' is null or (td.manifest_no is not null)       = (p_filter->>'has_manifest')::boolean)
  and (p_filter->>'missing_manifest' is null or (td.manifest_no is null)       = (p_filter->>'missing_manifest')::boolean)
  and (p_filter->>'has_invoice'  is null or (td.apex_invoice_no is not null)   = (p_filter->>'has_invoice')::boolean)
  and (p_filter->>'missing_invoice' is null or (td.apex_invoice_no is null)    = (p_filter->>'missing_invoice')::boolean)
  and (coalesce((p_filter->>'include_closed')::boolean, false)
       or coalesce((p_filter->>'live_only')::boolean, true) = false
       or (coalesce(l.quantity,0) > 0 and not l.is_closed))
order by round(f_to_pounds(l.quantity, l.uom),3) desc nulls last, l.tag;
$$;

comment on function public.f_drill_tags(jsonb) is
  'THE universal drill resolver, summary/group -> entity. Hand it whatever a row was grouped by '
  '(room, licence, strain, category, stream, lab_state, harvest, item_name, origin, '
  'age_over_days, packaged_from/to, has_/missing_ coa|manifest|invoice, tag) and it returns every '
  'tag behind that row carrying the document trinity. Reads the canonical one-row-per-tag ledger '
  'and mv_tag_documents so a drill can never disagree with its tile. Live-only by default; pass '
  'include_closed for history. Unknown keys RAISE rather than silently widening. Owner '
  'architecture, 19 Aug 2026 — "no dead numbers". Agent I.';

create or replace function public.f_drill_events(p_tag text)
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
order by e.event_at, e.id;
$$;

comment on function public.f_drill_events(text) is
  'THE universal drill resolver, entity -> event -> document: one tag''s whole life in order from '
  'tag_event, each event naming its source system and linking its document (manifest for custody '
  'events, COA for the test event). Owner architecture, 19 Aug 2026. Agent I.';

grant execute on function public.f_drill_tags(jsonb) to authenticated;
grant execute on function public.f_drill_events(text) to authenticated;
grant execute on function public.f_raise_unknown_drill_key(text) to authenticated;;
