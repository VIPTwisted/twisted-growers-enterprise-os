/* THE AUDITOR'S TWO FINDINGS, FIXED THE SAME HOUR THEY WERE RAISED.
 *
 * Independent verification (read-only auditor, own dedup, own unit conversion)
 * confirmed six of seven Inventory figures to the decimal and caught two
 * defects the tile-drill watcher could not:
 *
 * FINDING 1 — tile 5 "Ageing stock" posted 520.1 lb because Agent I's own
 * rebalance override filtered on the GROUP's oldest member, dragging 379.8 lb
 * of young material in with its old groupmates — and the contract agreed with
 * itself because both sides shared the logic: the check that cannot fail. The
 * owner-ratified ageing lane (stock_ageing_policy categories, holding rooms
 * suspend, per package) says 20.8 lb across 19 tags. The tile now reads
 * v_stock_ageing; the contract drill re-derives the policy from the BASE
 * tables with the canonical dedup — measured equal at 20.8 before shipping.
 *
 * FINDING 2 — tile 1 was labelled "dry-equivalent" while carrying 418.3 lb of
 * fresh frozen at WET weight. The owner set the conversion (4.5:1, selectable
 * in Settings) precisely for this. The tile now converts: 2,149.4 lb true
 * dry-equivalent, proven identical through the grouped-grams road and the
 * package-primitive road, and the context states the basis and the wet total
 * so nobody mistakes what the number is. */

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
            WHEN ((b.department = 'Inventory'::text) AND (b.ord = 1)) THEN ( SELECT round((sum(
                  CASE WHEN (v.stream = 'Fresh frozen'::text) THEN (v.grams / f_rule('fresh_frozen_wet_to_dry'::text))
                       ELSE v.grams END) / 453.59237), 1)
               FROM v_stock_on_hand v)
            WHEN ((b.department = 'Inventory'::text) AND (b.ord = 2)) THEN ( SELECT round((sum(v.grams) FILTER (WHERE (v.lab_state = 'TestPassed'::text)) / 453.59237), 1)
               FROM v_stock_on_hand v)
            WHEN ((b.department = 'Inventory'::text) AND (b.ord = 3)) THEN ( SELECT round((sum(v.grams) FILTER (WHERE (v.lab_state = 'NotSubmitted'::text)) / 453.59237), 1)
               FROM v_stock_on_hand v)
            WHEN ((b.department = 'Inventory'::text) AND (b.ord = 4)) THEN ( SELECT round((sum(v.grams) FILTER (WHERE (v.origin = 'Bought in'::text)) / 453.59237), 1)
               FROM v_stock_on_hand v)
            WHEN ((b.department = 'Inventory'::text) AND (b.ord = 5)) THEN ( SELECT round(sum(a.lb), 1)
               FROM v_stock_ageing a WHERE (a.ageing_verdict ~~ 'STALE%'::text))
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
            WHEN ((b.department = 'Inventory'::text) AND (b.ord = 1)) THEN ( SELECT (((('Fresh frozen counted at dry-equivalent (wet ÷ '::text || f_rule('fresh_frozen_wet_to_dry'::text)) || ', owner-set). Wet-basis total: '::text) || to_char((sum(v.grams) / 453.59237), 'FM999999.0'::text)) || ' lb.'::text)
               FROM v_stock_on_hand v)
            WHEN ((b.department = 'Inventory'::text) AND (b.ord = 5)) THEN ( SELECT (('Per the owner ageing policy: categories that age, past their own limit, holding rooms suspend. '::text || count(*)) || ' packages. A raw 180-day age with no policy would say far more — that is not the ruling.'::text)
               FROM v_stock_ageing a WHERE (a.ageing_verdict ~~ 'STALE%'::text))
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

update tile_drill_contract set tolerance = 0,
  drill_sql = 'select round(sum(case when p.stream = ''Fresh frozen'' then f_to_pounds(p.quantity,p.uom)/f_rule(''fresh_frozen_wet_to_dry'') else f_to_pounds(p.quantity,p.uom) end),1) from v_stock_packages p',
  why_tolerance = 'ZERO, 18 Aug 2026: the tile is now TRULY dry-equivalent — fresh frozen divides by the owner-set ratio (f_rule fresh_frozen_wet_to_dry). Tile road: grouped grams of v_stock_on_hand. Drill road: the per-package primitive v_stock_packages with exact f_to_pounds. Both proven 2149.4 on 18 Aug. The auditor caught the old label carrying 418.3 lb of wet fresh frozen as "dry-equivalent"; the owner set 4.5:1 precisely for this conversion.'
where contract_key = 'dash.inventory.1.total_dry_equivalent';

update tile_drill_contract set tolerance = 0,
  drill_sql = 'select round(sum(f_to_pounds(mp.quantity,mp.uom)),1) from (select distinct on (d.tag) d.* from metrc_packages d order by d.tag, (coalesce(d.quantity,0) > 0 and not coalesce((d.raw->>''IsFinished'')::boolean,false)) desc, (d.source_state = ''active'') desc nulls last, d.synced_at desc nulls last) mp join stock_ageing_policy pol on pol.category = coalesce(mp.raw#>>''{Item,ProductCategoryName}'',''(uncategorised)'') where coalesce(mp.quantity,0)>0 and not coalesce(mp.finished,false) and pol.ages and ((current_date - mp.packaged_on) * interval ''1 day'') > pol.stale_after and not exists (select 1 from holding_room h where h.suspends_ageing and h.room = mp.location)',
  why_tolerance = 'ZERO, 18 Aug 2026: tile reads v_stock_ageing (the owner-ratified policy lane); the drill RE-DERIVES the policy from the base tables — canonical dedup, stock_ageing_policy join, holding-room suspension. Both proven 20.8 lb / 19 tags. The auditor caught the previous same-day override at 520.1: it filtered on the GROUP''s oldest member and dragged 379.8 lb of young material in, and tile and drill agreed because they shared the logic — the check that cannot fail. They no longer share it.'
where contract_key = 'dash.inventory.5.ageing_stock';;
