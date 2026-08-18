/* Tiles 3, 4 and 5 get the same grams-exact arithmetic as tiles 1 and 2 —
 * "every line of data balances" means the tiles INSIDE tolerance stop leaning
 * on it too. Same correction layer, same independent-derivation contract
 * design, tolerances to zero. */

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
            WHEN ((b.department = 'Inventory'::text) AND (b.ord = 1)) THEN ( SELECT round((sum(v.grams) / 453.59237), 1)
               FROM v_stock_on_hand v)
            WHEN ((b.department = 'Inventory'::text) AND (b.ord = 2)) THEN ( SELECT round((sum(v.grams) FILTER (WHERE (v.lab_state = 'TestPassed'::text)) / 453.59237), 1)
               FROM v_stock_on_hand v)
            WHEN ((b.department = 'Inventory'::text) AND (b.ord = 3)) THEN ( SELECT round((sum(v.grams) FILTER (WHERE (v.lab_state = 'NotSubmitted'::text)) / 453.59237), 1)
               FROM v_stock_on_hand v)
            WHEN ((b.department = 'Inventory'::text) AND (b.ord = 4)) THEN ( SELECT round((sum(v.grams) FILTER (WHERE (v.origin = 'Bought in'::text)) / 453.59237), 1)
               FROM v_stock_on_hand v)
            WHEN ((b.department = 'Inventory'::text) AND (b.ord = 5)) THEN ( SELECT round((sum(v.grams) FILTER (WHERE ((v.oldest_days)::numeric > f_rule('ageing_stock_days'::text))) / 453.59237), 1)
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

update tile_drill_contract set tolerance = 0,
  why_tolerance = 'ZERO, 18 Aug 2026: tile reads exact grams (NotSubmitted filter) summed once; drill sums f_to_pounds over deduped packages. The old 0.2 absorbed per-group rounding that no longer exists.'
where contract_key = 'dash.inventory.3.never_submitted';

update tile_drill_contract set tolerance = 0,
  why_tolerance = 'ZERO, 18 Aug 2026: tile reads exact grams (Bought in filter) summed once; drill sums f_to_pounds over deduped packages. The old 0.2 absorbed per-group rounding that no longer exists.'
where contract_key = 'dash.inventory.4.bought_in';;
