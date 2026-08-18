/* AGEING BECOMES ONE PRIMITIVE WITH ONE DEFINITION — page 2 of the Inventory build.
 *
 * Three surfaces answered "what is sitting too long" three different ways:
 *   - v_stock_ageing: the owner-ratified policy (category ages, holding rooms
 *     suspend) — but it counted the eleven cross-licence twins twice;
 *   - v_inventory_aging: stage lateness with HARDCODED days (14/30/7/90/60)
 *     that predate the live-rules order, including 90/60-day package branches
 *     that contradict the owner policy — the machinery behind the false "old
 *     stock" finding he killed;
 *   - v_issue_aging: the PAGE tile 5 drills to, showing 293 mixed stage-
 *     lateness rows against a tile that says 19 packages.
 *
 * After this migration: the policy lane dedups to one row per tag; stage
 * lateness reads its thresholds from rules (dry_window_max_days,
 * harvest_open_max_days, and a new owner-changeable lab_wait_alert_days) and
 * defers all package-age judgement to the policy lane; and the issue_aging
 * page lists EXACTLY the policy-stale packages the tile counts, with a
 * registered contract holding page to tile at zero tolerance. The arbitrary
 * 60-day "watch" branch dies with the hardcodes — the owner ruled there is no
 * age-based watch outside his policy. */

insert into public.conversion_factors (key, value, unit, label, what_it_means, where_it_came_from, set_by)
values ('lab_wait_alert_days', 7, 'days',
        'Laboratory wait alert',
        'How many days a package may sit "Awaiting laboratory" before the OS flags it and someone chases the laboratory. Distinct from lab_turnaround_max_days (the lab''s promise): this is when WE start chasing.',
        'Was hardcoded as 7 in v_inventory_aging since it was built; promoted to an owner-changeable rule during the ageing convergence, 18 Aug 2026. Agent I.',
        'Agent I')
on conflict (key) do nothing;

-- 1. The policy lane counts each tag once.
create or replace view public.v_stock_ageing as
 SELECT p.tag,
    p.item_name,
    COALESCE((p.raw #>> '{Item,ProductCategoryName}'::text[]), '(uncategorised)'::text) AS category,
    p.location,
    p.license,
    p.packaged_on,
    (CURRENT_DATE - p.packaged_on) AS days_held,
    round(f_to_pounds(p.quantity, p.uom), 3) AS lb,
    pol.ages AS category_ages,
    pol.stale_after,
        CASE
            WHEN (pol.category IS NULL) THEN 'NO POLICY — this category has never been reasoned about'::text
            WHEN (hold.room IS NOT NULL) THEN ('HELD ON PURPOSE — '::text || hold.why_held)
            WHEN (NOT pol.ages) THEN ('DOES NOT AGE — '::text || pol.why)
            WHEN ((((CURRENT_DATE - p.packaged_on))::double precision * '1 day'::interval) > pol.stale_after) THEN ('STALE — past '::text || pol.stale_after)
            ELSE 'ok'::text
        END AS ageing_verdict,
        CASE
            WHEN ((pol.remnant_under_lb IS NOT NULL) AND (f_to_pounds(p.quantity, p.uom) < pol.remnant_under_lb)) THEN (('REMNANT — under '::text || pol.remnant_under_lb) || ' lb, should be finished out in Metrc rather than carried as stock'::text)
            ELSE NULL::text
        END AS remnant_verdict,
    (hold.room IS NOT NULL) AS in_a_holding_room,
    hold.why_held
   FROM (( ( SELECT DISTINCT ON (d.tag) d.*
             FROM metrc_packages d
             ORDER BY d.tag, (COALESCE(d.quantity,0) > 0 AND NOT COALESCE((d.raw->>'IsFinished')::boolean,false)) DESC,
                      (d.source_state = 'active') DESC NULLS LAST, d.synced_at DESC NULLS LAST) p
     LEFT JOIN stock_ageing_policy pol ON ((pol.category = COALESCE((p.raw #>> '{Item,ProductCategoryName}'::text[]), '(uncategorised)'::text))))
     LEFT JOIN holding_room hold ON ((hold.suspends_ageing AND (hold.room = p.location))))
  WHERE ((COALESCE(p.quantity, (0)::numeric) > (0)::numeric) AND (COALESCE(p.finished, false) = false));

-- 2. Stage lateness reads rules and defers package age to the policy.
create or replace view public.v_inventory_aging as
 SELECT l.category,
    l.stage,
    l.location,
    l.license,
    l.item,
    l.identifier,
    l.quantity,
    l.uom,
    l.days_here,
        CASE
            WHEN ((l.category = 'Harvest lots'::text) AND (l.stage ~~ 'Drying%'::text) AND (l.days_here > f_rule('dry_window_max_days'::text))) THEN 'critical'::text
            WHEN ((l.category = 'Harvest lots'::text) AND (l.days_here > f_rule('harvest_open_max_days'::text))) THEN 'elevated'::text
            WHEN ((l.category = 'Packages'::text) AND (l.stage = 'Awaiting laboratory'::text) AND (l.days_here > f_rule('lab_wait_alert_days'::text))) THEN 'elevated'::text
            WHEN ((l.category = 'Packages'::text) AND (l.stage = 'FAILED TESTING'::text)) THEN 'critical'::text
            WHEN (sa.tag IS NOT NULL) THEN 'elevated'::text
            WHEN (l.stage = 'ON HOLD'::text) THEN 'critical'::text
            ELSE NULL::text
        END AS severity,
        CASE
            WHEN ((l.category = 'Harvest lots'::text) AND (l.stage ~~ 'Drying%'::text) AND (l.days_here > f_rule('dry_window_max_days'::text))) THEN (('Past the '::text || f_rule('dry_window_max_days'::text)) || '-day dry limit - move it or record the weights'::text)
            WHEN ((l.category = 'Harvest lots'::text) AND (l.days_here > f_rule('harvest_open_max_days'::text))) THEN (('Harvest lot open more than '::text || f_rule('harvest_open_max_days'::text)) || ' days - the room turn is at risk'::text)
            WHEN ((l.category = 'Packages'::text) AND (l.stage = 'Awaiting laboratory'::text) AND (l.days_here > f_rule('lab_wait_alert_days'::text))) THEN (('Waiting on a laboratory result more than '::text || f_rule('lab_wait_alert_days'::text)) || ' days - chase the laboratory'::text)
            WHEN ((l.category = 'Packages'::text) AND (l.stage = 'FAILED TESTING'::text)) THEN 'Failed testing - decide remediation or destruction'::text
            WHEN (sa.tag IS NOT NULL) THEN (('Past its category ageing limit ('::text || sa.stale_after) || ') under the owner policy - sell, discount or write off'::text)
            WHEN (l.stage = 'ON HOLD'::text) THEN 'On hold in Metrc - resolve the hold'::text
            ELSE NULL::text
        END AS action
   FROM (v_inventory_locator l
     LEFT JOIN v_stock_ageing sa ON (((sa.tag = l.identifier) AND (sa.ageing_verdict ~~ 'STALE%'::text))))
  WHERE (l.days_here IS NOT NULL);

-- 3. The page tile 5 drills to lists exactly what the tile counts.
create or replace view public.v_issue_aging as
 SELECT COALESCE(l.category, 'Packages'::text) AS category,
    COALESCE(l.item, a.item_name) AS item,
    a.tag AS identifier,
    a.location,
    COALESCE(l.stage, 'On hand'::text) AS stage,
    a.license,
    l.quantity,
    l.uom,
    round(COALESCE(f_to_pounds(l.quantity, l.uom), a.lb), 3) AS pounds,
    a.packaged_on AS harvested_or_packaged_on,
    COALESCE(l.days_here, (a.days_held)::numeric) AS days_sitting,
    round((COALESCE(f_to_pounds(l.quantity, l.uom), a.lb) * ( SELECT cost_model.cost_per_pound
        FROM cost_model WHERE (cost_model.scope = 'cultivation'::text)
        ORDER BY cost_model.effective_from DESC LIMIT 1)), 0) AS value_at_cost,
    l.lab_state AS laboratory_state,
    l.source_lineage AS came_from,
    l.detail AS extra_detail,
    'elevated'::text AS severity,
    ('THE ISSUE: '::text || a.ageing_verdict) AS what_is_wrong,
    ((('Sitting '::text || a.days_held) || ' days against its category limit of '::text) || a.stale_after) || '. Decide: sell, discount, or write off.'::text AS what_to_do
   FROM (v_stock_ageing a
     LEFT JOIN v_inventory_locator l ON ((l.identifier = a.tag)))
  WHERE (a.ageing_verdict ~~ 'STALE%'::text)
  ORDER BY a.days_held DESC;

-- 4. The contract that holds the page to the tile, forever.
insert into tile_drill_contract (contract_key, page, tile_label, tile_sql, drill_sql, tolerance, why_tolerance, registered_by)
values ('inv.issue_aging.page_equals_tile5', 'Inventory',
        'Ageing page total equals the Ageing stock tile',
        'select value from mv_department_dashboard where department=''Inventory'' and ord=5',
        'select round(sum(coalesce(f_to_pounds(l.quantity,l.uom), a.lb)),1) from v_stock_ageing a left join v_inventory_locator l on l.identifier = a.tag where a.ageing_verdict like ''STALE%''',
        0,
        'ZERO, 18 Aug 2026: the tile sums the policy lane''s lb; the page road sums locator quantities converted independently (falling back to the policy lb only where the locator has no row). Before this convergence the page showed 293 mixed stage-lateness rows against a tile counting 19 policy-stale packages — a tile-to-page mismatch on the owner''s own screen.',
        'Agent I')
on conflict (contract_key) do update set tile_sql=excluded.tile_sql, drill_sql=excluded.drill_sql, tolerance=excluded.tolerance, why_tolerance=excluded.why_tolerance;;
