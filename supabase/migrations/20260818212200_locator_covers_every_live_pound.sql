/* THE LOCATOR ANSWERS FOR EVERY LIVE POUND — page 3 of the Inventory build.
 *
 * The facility locator is the "walk to this room and inspect it" pillar of
 * seed-to-sale, and it had three holes:
 *   - its Packages branch read raw active/onhold rows: no one-row-per-tag
 *     dedup (a cross-licence twin listed twice) and no liveness filter;
 *   - its In transit branch read raw intransit rows: 808 rows for 742 real
 *     packages, 455.5 lb where the canon says 442.0;
 *   - 26 tags / 61.9 lb of LIVE quantity sat on packages Metrc marks
 *     inactive — present in stock, absent from the locator entirely. The
 *     independent auditor flagged exactly this population.
 *
 * Now every branch dedups to the surviving row per tag, and the inactive-with-
 * quantity packages appear as their own category — STATE CONFLICT — because a
 * pound the OS cannot point to a room for is a discrepancy to walk down, not a
 * row to hide. A zero-tolerance contract holds the locator's package coverage
 * to the stock canon from this day forward. Plants, plant batches and harvest
 * lots branches are unchanged. */

create or replace view public.v_inventory_locator as
 SELECT 'Plants'::text AS category,
    1 AS stage_no,
    'Growing'::text AS stage,
    pl.room AS location,
    pl.license,
    pl.strain AS item,
    pl.tag AS identifier,
    (count(*))::numeric AS quantity,
    'plants'::text AS uom,
    min(pl.planted_on) AS since_date,
    (max((CURRENT_DATE - pl.planted_on)))::numeric AS days_here,
    string_agg(DISTINCT pl.phase, ' · '::text) AS detail,
    NULL::text AS lab_state,
    NULL::text AS source_lineage
   FROM metrc_plants pl
  WHERE (pl.source_state = ANY (ARRAY['vegetative'::text, 'flowering'::text, 'onhold'::text]))
  GROUP BY 'Plants'::text, 1::integer, 'Growing'::text, pl.room, pl.license, pl.strain, pl.tag
UNION ALL
 SELECT 'Plant batches'::text AS category,
    1 AS stage_no,
    'Propagation'::text AS stage,
    'Propagation area'::text AS location,
    pb.license,
    pb.strain AS item,
    pb.name AS identifier,
    (COALESCE(pb.count, 0))::numeric AS quantity,
    'plants'::text AS uom,
    pb.planted_on AS since_date,
    ((CURRENT_DATE - pb.planted_on))::numeric AS days_here,
    COALESCE(pb.batch_type, 'batch'::text) AS detail,
    NULL::text AS lab_state,
    NULL::text AS source_lineage
   FROM metrc_plant_batches pb
  WHERE (pb.source_state = 'active'::text)
UNION ALL
 SELECT 'Harvest lots'::text AS category,
    2 AS stage_no,
    m.stage,
    COALESCE(m.room, '(no room recorded)'::text) AS location,
    m.license,
    COALESCE(m.strains, m.harvest) AS item,
    m.harvest AS identifier,
    round(COALESCE(m.current_weight, m.wet_weight, (0)::numeric), 1) AS quantity,
    COALESCE(m.uom, 'g'::text) AS uom,
    m.harvest_start AS since_date,
    (m.days_since_takedown)::numeric AS days_here,
    COALESCE(m.sub_room, m.harvest_type, 'harvest'::text) AS detail,
    m.lab_state,
    m.harvest AS source_lineage
   FROM v_harvest_stage_map m
  WHERE (m.stage <> ALL (ARRAY['Finished'::text, 'Archived'::text]))
UNION ALL
 SELECT 'Packages'::text AS category,
    3 AS stage_no,
        CASE
            WHEN ((p.raw ->> 'IsOnHold'::text))::boolean THEN 'ON HOLD'::text
            WHEN (p.lab_testing_state = 'TestFailed'::text) THEN 'FAILED TESTING'::text
            WHEN (p.lab_testing_state = 'TestPassed'::text) THEN 'Sellable'::text
            WHEN (p.lab_testing_state = ANY (ARRAY['SubmittedForTesting'::text, 'AwaitingConfirmation'::text])) THEN 'Awaiting laboratory'::text
            ELSE 'In inventory'::text
        END AS stage,
    COALESCE(p.location, '(no location)'::text) AS location,
    p.license,
    COALESCE(p.item_name, '(unnamed item)'::text) AS item,
    p.tag AS identifier,
    COALESCE(p.quantity, (0)::numeric) AS quantity,
    COALESCE(p.uom, 'ea'::text) AS uom,
    p.packaged_on AS since_date,
    ((CURRENT_DATE - p.packaged_on))::numeric AS days_here,
    COALESCE((p.raw ->> 'ProductCategoryName'::text), 'package'::text) AS detail,
    p.lab_testing_state AS lab_state,
    NULLIF((p.raw ->> 'SourceHarvestNames'::text), ''::text) AS source_lineage
   FROM ( SELECT DISTINCT ON (d.tag) d.*
          FROM metrc_packages d
          ORDER BY d.tag, (COALESCE(d.quantity,0) > 0 AND NOT COALESCE((d.raw->>'IsFinished')::boolean,false)) DESC,
                   (d.source_state = 'active') DESC NULLS LAST, d.synced_at DESC NULLS LAST) p
  WHERE ((p.source_state = ANY (ARRAY['active'::text, 'onhold'::text]))
         AND (COALESCE(p.quantity, (0)::numeric) > (0)::numeric)
         AND (COALESCE(p.finished, false) = false))
UNION ALL
 SELECT 'In transit'::text AS category,
    4 AS stage_no,
    'Leaving the facility'::text AS stage,
    COALESCE(p.location, '(manifested)'::text) AS location,
    p.license,
    COALESCE(p.item_name, '(unnamed item)'::text) AS item,
    p.tag AS identifier,
    COALESCE(p.quantity, (0)::numeric) AS quantity,
    COALESCE(p.uom, 'ea'::text) AS uom,
    p.packaged_on AS since_date,
    ((CURRENT_DATE - p.packaged_on))::numeric AS days_here,
    'On a transfer manifest'::text AS detail,
    p.lab_testing_state AS lab_state,
    NULLIF((p.raw ->> 'SourceHarvestNames'::text), ''::text) AS source_lineage
   FROM ( SELECT DISTINCT ON (d.tag) d.*
          FROM metrc_packages d
          ORDER BY d.tag, (COALESCE(d.quantity,0) > 0 AND NOT COALESCE((d.raw->>'IsFinished')::boolean,false)) DESC,
                   (d.source_state = 'active') DESC NULLS LAST, d.synced_at DESC NULLS LAST) p
  WHERE ((p.source_state = 'intransit'::text)
         AND (COALESCE(p.quantity, (0)::numeric) > (0)::numeric)
         AND (COALESCE(p.finished, false) = false))
UNION ALL
 SELECT 'State conflict'::text AS category,
    5 AS stage_no,
    'INACTIVE with quantity'::text AS stage,
    COALESCE(p.location, '(no location)'::text) AS location,
    p.license,
    COALESCE(p.item_name, '(unnamed item)'::text) AS item,
    p.tag AS identifier,
    COALESCE(p.quantity, (0)::numeric) AS quantity,
    COALESCE(p.uom, 'ea'::text) AS uom,
    p.packaged_on AS since_date,
    ((CURRENT_DATE - p.packaged_on))::numeric AS days_here,
    'Metrc marks this package inactive while it still carries quantity — find it in the last recorded room, or close it out in Metrc'::text AS detail,
    p.lab_testing_state AS lab_state,
    NULLIF((p.raw ->> 'SourceHarvestNames'::text), ''::text) AS source_lineage
   FROM ( SELECT DISTINCT ON (d.tag) d.*
          FROM metrc_packages d
          ORDER BY d.tag, (COALESCE(d.quantity,0) > 0 AND NOT COALESCE((d.raw->>'IsFinished')::boolean,false)) DESC,
                   (d.source_state = 'active') DESC NULLS LAST, d.synced_at DESC NULLS LAST) p
  WHERE ((p.source_state <> ALL (ARRAY['active'::text, 'onhold'::text, 'intransit'::text]))
         AND (COALESCE(p.quantity, (0)::numeric) > (0)::numeric)
         AND (COALESCE(p.finished, false) = false));

insert into tile_drill_contract (contract_key, page, tile_label, tile_sql, drill_sql, tolerance, why_tolerance, registered_by)
values ('inv.locator.covers_every_live_pound', 'Inventory',
        'The locator answers for every live pound the stock canon holds',
        'select round(sum(f_to_pounds(quantity,uom)),1) from v_inventory_locator where category in (''Packages'',''In transit'',''State conflict'')',
        'select round(sum(f_to_pounds(mp.quantity,mp.uom)),1) from (select distinct on (d.tag) d.* from metrc_packages d order by d.tag, (coalesce(d.quantity,0) > 0 and not coalesce((d.raw->>''IsFinished'')::boolean,false)) desc, (d.source_state = ''active'') desc nulls last, d.synced_at desc nulls last) mp where coalesce(mp.quantity,0)>0 and coalesce(mp.finished,false)=false',
        0,
        'ZERO, 18 Aug 2026: every live pound in the package canon must have exactly one locator row saying where to walk. Before this contract the locator silently dropped 61.9 lb of inactive-with-quantity packages and double-listed the cross-licence twins in transit (455.5 vs the true 442.0). Package + In transit + State conflict must equal the canon, always.',
        'Agent I')
on conflict (contract_key) do update set tile_sql=excluded.tile_sql, drill_sql=excluded.drill_sql, tolerance=excluded.tolerance, why_tolerance=excluded.why_tolerance;;
