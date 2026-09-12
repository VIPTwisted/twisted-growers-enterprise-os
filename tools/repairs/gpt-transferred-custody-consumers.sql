-- Local candidate: no source rows are changed. Apply atomically before any transferred-state repair.

begin;

set transaction isolation level read committed;

set local lock_timeout = '5s';

set local statement_timeout = '60s';

set local search_path = public, pg_temp;

-- ACCESS SHARE prevents concurrent replacement of these views while permitting
-- ordinary writes to their recursively locked dependencies. ONLY would not stop
-- recursive view dependency locking. Hold every lock through commit/rollback.
lock table public.v_inventory_locator, public.v_inventory_reconciliation
  in access share mode;

do $lock_functions$
declare locked_count integer;
begin
  perform oid from pg_catalog.pg_proc
   where oid in ('public.f_stock_status(text,boolean)'::regprocedure,
                 'public.tg_snapshot_inventory(date)'::regprocedure)
   order by oid for update;
  get diagnostics locked_count = row_count;
  if locked_count <> 2 then
    raise exception 'Expected exactly two function rows to lock, found %', locked_count;
  end if;
end $lock_functions$;

-- Separate statement after lock acquisition: READ COMMITTED sees completed DDL
-- that preceded our locks. No function/view attribute is changed to acquire them.
do $preflight$ begin

 if md5(pg_get_functiondef('public.f_stock_status(text,boolean)'::regprocedure)) <> 'b6ad0c833ba2af5428404f0efe8458d3' then raise exception 'Definition drift: f_stock_status'; end if;

 if md5(pg_get_functiondef('public.tg_snapshot_inventory(date)'::regprocedure)) <> '79a41a3e5c334072d2479fc4744d7e95' then raise exception 'Definition drift: tg_snapshot_inventory'; end if;

 if md5(pg_get_viewdef('public.v_inventory_locator'::regclass,true)) <> '8f1879d94e594710a34e4416cf883a9a' then raise exception 'Definition drift: v_inventory_locator'; end if;

 if md5(pg_get_viewdef('public.v_inventory_reconciliation'::regclass,true)) <> '38f476698a24f579882272755007d964' then raise exception 'Definition drift: v_inventory_reconciliation'; end if;

end $preflight$;

CREATE OR REPLACE FUNCTION public.f_stock_status(p_state text, p_finished boolean)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'public'
AS $function$
  select case
    when p_state = 'transferred' then 'Transferred — accepted by recipient'
    when p_state = 'intransit' then 'In transit'
    when p_state = 'inactive' or coalesce(p_finished,false) then 'Sold or closed'
    when p_state = 'active' then 'Still on hand'
    else 'Not recorded' end;
$function$
;

CREATE OR REPLACE FUNCTION public.tg_snapshot_inventory(p_day date DEFAULT NULL::date)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare d date := coalesce(p_day, (now() at time zone 'America/New_York')::date); n int;
begin
  if d <> (now() at time zone 'America/New_York')::date then
    raise exception 'Current mirror cannot reconstruct a historical or future inventory snapshot';
  end if;
  delete from inventory_snapshot where taken_on = d;   -- re-runnable for today only
  insert into inventory_snapshot
    (taken_on, license, tag, item_name, category, strain, quantity, uom, pounds,
     location, lab_state, packaged_on, origin, stock_status, source_state)
  select d, p.license, p.tag, p.item_name,
         p.raw #>> '{Item,ProductCategoryName}', p.raw #>> '{Item,StrainName}',
         p.quantity, p.uom,
         case when f_is_weight(p.uom) then f_to_pounds(p.quantity, p.uom) end,
         p.location, p.lab_testing_state, p.packaged_on,
         case when f_is_ours(coalesce(p.raw->>'ItemFromFacilityLicenseNumber','')) then 'Grown by us' else 'Bought in' end,
         f_stock_status(p.source_state, p.finished), p.source_state
  from metrc_packages p
  where p.source_state in ('active', 'onhold', 'intransit'); -- current inventory plus explicitly identified transit; transferred excluded
  get diagnostics n = row_count;
  return d::text || ': ' || n::text || ' packages recorded';
end $function$
;

create or replace view public.v_inventory_locator with (security_invoker = true) as
 SELECT v.category,
    v.stage_no,
    v.stage,
    v.location,
    v.license,
    v.item,
    v.identifier,
    v.quantity,
    v.uom,
    v.since_date,
    v.days_here,
    v.detail,
    v.lab_state,
    v.source_lineage,
    td.coa_certificate_id,
    td.coa_document_link,
    td.manifest_no,
    td.manifest_document_link,
    td.apex_invoice_no,
    td.apex_invoice_usd
   FROM ( SELECT 'Plants'::text AS category,
            1 AS stage_no,
            'Growing'::text AS stage,
            pl.room AS location,
            pl.license,
            pl.strain AS item,
            pl.tag AS identifier,
            count(*)::numeric AS quantity,
            'plants'::text AS uom,
            min(pl.planted_on) AS since_date,
            max(CURRENT_DATE - pl.planted_on)::numeric AS days_here,
            string_agg(DISTINCT pl.phase, ' · '::text) AS detail,
            NULL::text AS lab_state,
            NULL::text AS source_lineage
           FROM metrc_plants pl
          WHERE pl.source_state = ANY (ARRAY['vegetative'::text, 'flowering'::text, 'onhold'::text])
          GROUP BY 'Plants'::text, 1::integer, 'Growing'::text, pl.room, pl.license, pl.strain, pl.tag
        UNION ALL
         SELECT 'Plant batches'::text AS category,
            1 AS stage_no,
            'Propagation'::text AS stage,
            'Propagation area'::text AS location,
            pb.license,
            pb.strain AS item,
            pb.name AS identifier,
            COALESCE(pb.count, 0)::numeric AS quantity,
            'plants'::text AS uom,
            pb.planted_on AS since_date,
            (CURRENT_DATE - pb.planted_on)::numeric AS days_here,
            COALESCE(pb.batch_type, 'batch'::text) AS detail,
            NULL::text AS lab_state,
            NULL::text AS source_lineage
           FROM metrc_plant_batches pb
          WHERE pb.source_state = 'active'::text
        UNION ALL
         SELECT 'Harvest lots'::text AS category,
            2 AS stage_no,
            m.stage,
            COALESCE(m.room, '(no room recorded)'::text) AS location,
            m.license,
            COALESCE(m.strains, m.harvest) AS item,
            m.harvest AS identifier,
            round(COALESCE(m.current_weight, m.wet_weight, 0::numeric), 1) AS quantity,
            COALESCE(m.uom, 'g'::text) AS uom,
            m.harvest_start AS since_date,
            m.days_since_takedown::numeric AS days_here,
            COALESCE(m.sub_room, m.harvest_type, 'harvest'::text) AS detail,
            m.lab_state,
            m.harvest AS source_lineage
           FROM v_harvest_stage_map m
          WHERE m.stage <> ALL (ARRAY['Finished'::text, 'Archived'::text])
        UNION ALL
         SELECT 'Packages'::text AS category,
            3 AS stage_no,
                CASE
                    WHEN (p.raw ->> 'IsOnHold'::text)::boolean THEN 'ON HOLD'::text
                    WHEN p.lab_testing_state = 'TestFailed'::text THEN 'FAILED TESTING'::text
                    WHEN p.lab_testing_state = 'TestPassed'::text THEN 'Sellable'::text
                    WHEN p.lab_testing_state = ANY (ARRAY['SubmittedForTesting'::text, 'AwaitingConfirmation'::text]) THEN 'Awaiting laboratory'::text
                    ELSE 'In inventory'::text
                END AS stage,
            COALESCE(p.location, '(no location)'::text) AS location,
            p.license,
            COALESCE(p.item_name, '(unnamed item)'::text) AS item,
            p.tag AS identifier,
            COALESCE(p.quantity, 0::numeric) AS quantity,
            COALESCE(p.uom, 'ea'::text) AS uom,
            p.packaged_on AS since_date,
            (CURRENT_DATE - p.packaged_on)::numeric AS days_here,
            COALESCE(p.raw ->> 'ProductCategoryName'::text, 'package'::text) AS detail,
            p.lab_testing_state AS lab_state,
            NULLIF(p.raw ->> 'SourceHarvestNames'::text, ''::text) AS source_lineage
           FROM ( SELECT DISTINCT ON (d.license, d.tag) d.id,
                    d.license,
                    d.tag,
                    d.item_name,
                    d.quantity,
                    d.uom,
                    d.location,
                    d.packaged_on,
                    d.lab_testing_state,
                    d.finished,
                    d.raw,
                    d.synced_at,
                    d.source_state,
                    d.provenance,
                    d.report_as_of
                   FROM metrc_packages d
                  ORDER BY d.license, d.tag, (COALESCE(d.quantity, 0::numeric) > 0::numeric AND NOT COALESCE((d.raw ->> 'IsFinished'::text)::boolean, false)) DESC, (d.source_state = 'active'::text) DESC NULLS LAST, d.synced_at DESC NULLS LAST) p
          WHERE (p.source_state = ANY (ARRAY['active'::text, 'onhold'::text])) AND COALESCE(p.quantity, 0::numeric) > 0::numeric AND COALESCE(p.finished, false) = false AND (p.raw ->> 'ArchivedDate'::text) IS NULL AND (p.raw ->> 'FinishedDate'::text) IS NULL
        UNION ALL
         SELECT 'In transit'::text AS category,
            4 AS stage_no,
            'Leaving the facility'::text AS stage,
            COALESCE(p.location, '(manifested)'::text) AS location,
            p.license,
            COALESCE(p.item_name, '(unnamed item)'::text) AS item,
            p.tag AS identifier,
            COALESCE(p.quantity, 0::numeric) AS quantity,
            COALESCE(p.uom, 'ea'::text) AS uom,
            p.packaged_on AS since_date,
            (CURRENT_DATE - p.packaged_on)::numeric AS days_here,
            'On a transfer manifest'::text AS detail,
            p.lab_testing_state AS lab_state,
            NULLIF(p.raw ->> 'SourceHarvestNames'::text, ''::text) AS source_lineage
           FROM ( SELECT DISTINCT ON (d.license, d.tag) d.id,
                    d.license,
                    d.tag,
                    d.item_name,
                    d.quantity,
                    d.uom,
                    d.location,
                    d.packaged_on,
                    d.lab_testing_state,
                    d.finished,
                    d.raw,
                    d.synced_at,
                    d.source_state,
                    d.provenance,
                    d.report_as_of
                   FROM metrc_packages d
                  ORDER BY d.license, d.tag, (COALESCE(d.quantity, 0::numeric) > 0::numeric AND NOT COALESCE((d.raw ->> 'IsFinished'::text)::boolean, false)) DESC, (d.source_state = 'active'::text) DESC NULLS LAST, d.synced_at DESC NULLS LAST) p
          WHERE p.source_state = 'intransit'::text AND COALESCE(p.quantity, 0::numeric) > 0::numeric AND COALESCE(p.finished, false) = false AND (p.raw ->> 'ArchivedDate'::text) IS NULL AND (p.raw ->> 'FinishedDate'::text) IS NULL
        UNION ALL
         SELECT 'State conflict'::text AS category,
            5 AS stage_no,
            'INACTIVE with quantity'::text AS stage,
            COALESCE(p.location, '(no location)'::text) AS location,
            p.license,
            COALESCE(p.item_name, '(unnamed item)'::text) AS item,
            p.tag AS identifier,
            COALESCE(p.quantity, 0::numeric) AS quantity,
            COALESCE(p.uom, 'ea'::text) AS uom,
            p.packaged_on AS since_date,
            (CURRENT_DATE - p.packaged_on)::numeric AS days_here,
            'Metrc marks this package inactive while it still carries quantity — find it in the last recorded room, or close it out in Metrc'::text AS detail,
            p.lab_testing_state AS lab_state,
            NULLIF(p.raw ->> 'SourceHarvestNames'::text, ''::text) AS source_lineage
           FROM ( SELECT DISTINCT ON (d.license, d.tag) d.id,
                    d.license,
                    d.tag,
                    d.item_name,
                    d.quantity,
                    d.uom,
                    d.location,
                    d.packaged_on,
                    d.lab_testing_state,
                    d.finished,
                    d.raw,
                    d.synced_at,
                    d.source_state,
                    d.provenance,
                    d.report_as_of
                   FROM metrc_packages d
                  ORDER BY d.license, d.tag, (COALESCE(d.quantity, 0::numeric) > 0::numeric AND NOT COALESCE((d.raw ->> 'IsFinished'::text)::boolean, false)) DESC, (d.source_state = 'active'::text) DESC NULLS LAST, d.synced_at DESC NULLS LAST) p
          WHERE (p.source_state <> ALL (ARRAY['active'::text, 'onhold'::text, 'intransit'::text, 'transferred'::text])) AND COALESCE(p.quantity, 0::numeric) > 0::numeric AND COALESCE(p.finished, false) = false AND (p.raw ->> 'ArchivedDate'::text) IS NULL AND (p.raw ->> 'FinishedDate'::text) IS NULL) v
     LEFT JOIN mv_tag_documents td ON td.tag = v.identifier;

create or replace view public.v_inventory_reconciliation with (security_invoker = true) as
 WITH base AS (
         SELECT p.license,
            COALESCE(p.item_name, '(unnamed item)'::text) AS item,
            p.source_state,
            p.lab_testing_state,
            COALESCE(p.quantity, 0::numeric) AS qty,
            COALESCE((p.raw ->> 'InitialQuantity'::text)::numeric, COALESCE(p.quantity, 0::numeric)) AS initial_qty,
            (p.raw ->> 'IsOnHold'::text)::boolean AS on_hold,
            p.raw ->> 'ArchivedDate'::text AS archived
           FROM ( SELECT DISTINCT ON (d.license, d.tag) d.id,
                    d.license,
                    d.tag,
                    d.item_name,
                    d.quantity,
                    d.uom,
                    d.location,
                    d.packaged_on,
                    d.lab_testing_state,
                    d.finished,
                    d.raw,
                    d.synced_at,
                    d.source_state,
                    d.provenance,
                    d.report_as_of
                   FROM metrc_packages d
                  ORDER BY d.license, d.tag, (COALESCE(d.quantity, 0::numeric) > 0::numeric AND NOT COALESCE((d.raw ->> 'IsFinished'::text)::boolean, false)) DESC, (d.source_state = 'active'::text) DESC NULLS LAST, d.synced_at DESC NULLS LAST) p
        )
 SELECT license,
    item,
    round(sum(initial_qty), 1) AS packaged_originally,
    round(sum(qty) FILTER (WHERE source_state = 'active'::text AND NOT COALESCE(on_hold, false) AND lab_testing_state IS DISTINCT FROM 'TestFailed'::text), 1) AS in_stock_sellable,
    round(sum(qty) FILTER (WHERE (COALESCE(on_hold, false) OR source_state = 'onhold'::text) AND source_state = ANY (ARRAY['active'::text, 'onhold'::text]) AND lab_testing_state IS DISTINCT FROM 'TestFailed'::text), 1) AS on_hold,
    round(sum(qty) FILTER (WHERE source_state = 'intransit'::text), 1) AS in_transit,
    round(sum(initial_qty) FILTER (WHERE source_state = 'inactive'::text), 1) AS closed_or_sold,
    round(sum(qty) FILTER (WHERE lab_testing_state = 'TestFailed'::text AND source_state = ANY (ARRAY['active'::text, 'onhold'::text])), 1) AS failed_testing_held,
    round(sum(initial_qty - qty) FILTER (WHERE source_state = ANY (ARRAY['active'::text, 'onhold'::text])), 1) AS reduced_without_reason,
        CASE
            WHEN sum(initial_qty - qty) FILTER (WHERE source_state = ANY (ARRAY['active'::text, 'onhold'::text])) > 0::numeric THEN ('UNACCOUNTED - '::text || round(sum(initial_qty - qty) FILTER (WHERE source_state = ANY (ARRAY['active'::text, 'onhold'::text])), 1)) || ' reduced with no recorded reason'::text
            WHEN sum(qty) FILTER (WHERE lab_testing_state = 'TestFailed'::text AND source_state = ANY (ARRAY['active'::text, 'onhold'::text])) > 0::numeric THEN 'FAILED TESTING still on hand - decide destruction or remediation'::text
            WHEN sum(qty) FILTER (WHERE COALESCE(on_hold, false) AND source_state = ANY (ARRAY['active'::text, 'onhold'::text])) > 0::numeric THEN 'Quantity on hold in Metrc'::text
            WHEN bool_and(source_state = 'transferred') THEN 'Transferred; historical balance not verified'::text
            ELSE 'Reconciled'::text
        END AS reconciliation_status
   FROM base
  GROUP BY license, item
  ORDER BY (
        CASE
            WHEN sum(initial_qty - qty) FILTER (WHERE source_state = ANY (ARRAY['active'::text, 'onhold'::text])) > 0::numeric THEN 0
            ELSE 1
        END), (sum(qty) FILTER (WHERE source_state = 'active'::text)) DESC NULLS LAST;

commit;
