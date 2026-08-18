/* THE INVENTORY DASHBOARD BALANCES EXACTLY — first page of the page-by-page build.
 *
 * Three tiles disagreed with their own drills. Each was diagnosed to its cause
 * and fixed at the source; no tolerance was widened (owner ruling).
 *
 * TILE 1 (Total on hand) and TILE 2 (Sellable): the tile summed 73 per-group
 * PRE-ROUNDED pounds from v_stock_on_hand — rounding 73 times accumulates.
 * Three-way derivation found the truth: exact package-level sum 2474.7 and the
 * grams column summed once 2474.7 AGREE; the old tile said 2475.1. The
 * dashboard view now overrides both tiles with the grams-exact figure — a
 * derivation INDEPENDENT of the drill's f_to_pounds package sum, so the
 * contract still compares two different roads to the same number.
 *
 * TILE 80 (On a truck): the supplement summed every intransit ROW with no
 * dedup — 444.4 — counting both sides of the eleven cross-licence twins. The
 * one-row-per-tag canon (owner rulings, 18 Aug) says a tag whose surviving row
 * is active has been received and is ON HAND, never also on a truck; the
 * canonical figure is 442.0, and anything else double-counts material into two
 * buckets and breaks the outbound balance. The supplement's intransit reads
 * now dedup to the surviving row. The contract's drill is rewritten as the
 * OPPOSITE direction (all intransit rows minus rows whose surviving twin is
 * not intransit) so tile and drill remain two different computations. */

-- 1. Supplement: every intransit read dedups to the surviving row per tag.
do $$
declare def text;
begin
  perform set_config('search_path', 'public, pg_temp', true);
  def := regexp_replace(pg_get_viewdef('public.v_dept_dash_supplement'::regclass), ';\s*$', '');
  def := regexp_replace(def,
    'FROM metrc_packages\s+WHERE \(\(metrc_packages\.source_state = ''intransit''::text\)',
    'FROM ( SELECT DISTINCT ON (d.tag) d.* FROM metrc_packages d ORDER BY d.tag, (COALESCE(d.quantity,0) > 0 AND NOT COALESCE((d.raw->>''IsFinished'')::boolean,false)) DESC, (d.source_state = ''active'') DESC NULLS LAST, d.synced_at DESC NULLS LAST) metrc_packages WHERE ((metrc_packages.source_state = ''intransit''::text)',
    'g');
  execute 'create or replace view public.v_dept_dash_supplement as ' || def;
end $$;

-- 2. Dashboard view: tiles 1 and 2 read the grams-exact figure, rounded once.
create or replace view public.mv_department_dashboard as
 SELECT b.department,
    b.ord,
        CASE
            WHEN ((b.department = 'Command'::text) AND (b.ord = 1)) THEN 'Dried flower on hand'::text
            ELSE b.kpi
        END AS kpi,
        CASE
            WHEN ((b.department = 'Command'::text) AND (b.ord = 1)) THEN ( SELECT v_stock_headline.dried_lb
               FROM v_stock_headline)
            WHEN ((b.department = 'Metrc'::text) AND (b.ord = 1)) THEN ( SELECT (count(DISTINCT mp.tag))::numeric AS count
               FROM metrc_packages mp)
            WHEN ((b.department = 'Settings'::text) AND (b.ord = 2)) THEN ( SELECT (count(*))::numeric AS count
               FROM conversion_factors cf
              WHERE (cf.set_by !~* '(owner|vinny)'::text))
            /* Inventory 1 and 2, 18 Aug 2026: the base sums 73 PRE-ROUNDED group
               pounds; summing the exact grams once matches the package-level
               truth to the tenth (2474.7 / 2131.7, proven two independent ways).
               The base matview keeps its old arithmetic until its next rebuild —
               this view is the correction layer, exactly as it already is for
               Command ord 1. */
            WHEN ((b.department = 'Inventory'::text) AND (b.ord = 1)) THEN ( SELECT round((sum(v.grams) / 453.59237), 1)
               FROM v_stock_on_hand v)
            WHEN ((b.department = 'Inventory'::text) AND (b.ord = 2)) THEN ( SELECT round((sum(v.grams) FILTER (WHERE (v.lab_state = 'TestPassed'::text)) / 453.59237), 1)
               FROM v_stock_on_hand v)
            WHEN (b.kpi = 'Moisture loss not recorded'::text) THEN COALESCE(b.value, (0)::numeric)
            ELSE b.value
        END AS value,
    b.unit,
    b.tone,
        CASE
            WHEN ((b.department = 'Command'::text) AND (b.ord = 1)) THEN (('Dried only. Fresh frozen '::text || ( SELECT to_char(v_stock_headline.fresh_frozen_wet_lb, 'FM999999.0'::text) AS to_char
               FROM v_stock_headline)) || ' lb is held separately at wet weight and is never added to this.'::text)
            WHEN ((b.department = 'Metrc'::text) AND (b.ord = 1)) THEN 'Distinct tags. 715 tags appear twice because the package moved between our two licences — that is one package, not two.'::text
            WHEN ((b.department = 'Settings'::text) AND (b.ord = 2)) THEN 'Conversion factors not set by the owner. Each one is a number the platform is using that he has not confirmed.'::text
            ELSE b.context
        END AS context,
    b.drill,
    b.computed_at
   FROM mv_department_dashboard_base b
UNION ALL
 SELECT s.department,
    s.ord,
    s.kpi,
    s.value,
    s.unit,
    s.tone,
    s.context,
    s.drill,
    s.computed_at
   FROM mv_dept_dash_supplement s;

-- 3. The supplement matview re-materializes with the corrected arithmetic.
refresh materialized view public.mv_dept_dash_supplement;

-- 4. Contracts: zero tolerance, and the truck drill takes the opposite road.
update tile_drill_contract set tolerance = 0,
  why_tolerance = 'ZERO, 18 Aug 2026: tile reads the exact grams of v_stock_on_hand summed once; the drill sums f_to_pounds over deduped packages. Two independent derivations, both proven 2474.7 on 18 Aug. The old 0.2 absorbed 73 per-group roundings that no longer exist. Any gap now is a real defect.'
where contract_key = 'dash.inventory.1.total_dry_equivalent';

update tile_drill_contract set tolerance = 0,
  why_tolerance = 'ZERO, 18 Aug 2026: tile reads exact grams (TestPassed filter) summed once; drill sums f_to_pounds over deduped packages via the typed lab column. Independent derivations, both proven 2131.7 on 18 Aug. Any gap now is a real defect.'
where contract_key = 'dash.inventory.2.sellable_right_now';

update tile_drill_contract set tolerance = 0,
  drill_sql = 'select round(coalesce((select sum(f_to_pounds(quantity,uom)) from metrc_packages where source_state=''intransit'' and not coalesce(finished,false)),0) - coalesce((select sum(f_to_pounds(x.quantity,x.uom)) from metrc_packages x where x.source_state=''intransit'' and not coalesce(x.finished,false) and exists (select 1 from (select distinct on (d.tag) d.tag, d.source_state as ss from metrc_packages d order by d.tag, (coalesce(d.quantity,0) > 0 and not coalesce((d.raw->>''IsFinished'')::boolean,false)) desc, (d.source_state = ''active'') desc nulls last, d.synced_at desc nulls last) w where w.tag = x.tag and w.ss <> ''intransit'')),0), 1)',
  why_tolerance = 'ZERO, 18 Aug 2026: tile dedups to the surviving row per tag (one-row-per-tag canon: a tag received at destination is on hand, never also on a truck — the un-deduped 444.4 double-counted the eleven cross-licence twins). The drill computes the same population from the OPPOSITE direction: all intransit rows minus rows whose surviving twin is not intransit. Both proven 442.0 on 18 Aug. Any gap is a dedup regression.'
where contract_key = 'dash.inventory.80.on_a_truck_right_now';;
