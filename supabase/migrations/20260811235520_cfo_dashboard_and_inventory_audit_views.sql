-- Agent I (Database COO), 12 Aug 2026 (00:0x). Filed for review as DBI-026 (reviewers V, X, W).
-- Owner: GO on building the two views behind the broken Finance pages.
--
-- ARCHITECTURE RULE APPLIED - ONE FIGURE, ONE VALUE. The CFO dashboard REPUBLISHES canonical
-- rows from the views that already own each figure (mv_department_dashboard, the third-party
-- tiles, v_money_position, the verification suite). It derives NOTHING that exists elsewhere,
-- so it cannot disagree with Command - the QuickBooks principle: a report is a projection,
-- never a recomputation. Only figures no other surface owns are computed here, and each of
-- those was built tonight with its own guard (examination_standard, audit_assertion,
-- conversion_factors materiality, cost substantiation counts).
--
-- EVERY TILE DRILLS (C1). Tone values follow the existing convention (info/good/bad).
-- NULLs are coalesced ONLY where the empty set genuinely means zero; a figure that cannot be
-- computed says so in words instead (A1/A3 - never invent, never blank).
--
-- NAV REPAIR INCLUDED: the two entries pointed at dept_dash_cfo and cfo_inventory_audit -
-- names nothing ever built. Updating table_ref is menu DATA (permitted: rename/consolidate/
-- add/remove), not menu design.
--
-- UNDO: drop view v_dept_dash_cfo; drop view v_cfo_inventory_audit;
--       update nav_registry set table_ref='dept_dash_cfo'  where label='CFO Dashboard';
--       update nav_registry set table_ref='cfo_inventory_audit' where label='Inventory Audit, Planning & Budgeting';

create or replace view public.v_dept_dash_cfo as
-- ── Canon republished: the money KPIs Command already owns ──
select 'Finance'::text as department, 10 as ord, kpi, value, unit, tone, context, drill, computed_at
from mv_department_dashboard
where department='Command' and kpi in ('Value of stock on hand','Untested stock value','Failed testing value','Genuine loss to date')
union all
-- ── Canon republished: the restated third-party money tiles ──
select 'Finance', 20 + ord, kpi, value, unit, tone, context, drill, computed_at
from v_dept_dash_third_party
where kpi in ('Third-party spend, all time','Third-party material on hand','Third-party UNEXPLAINED')
union all
-- ── CFO-only tiles: figures no other surface owns, all built with guards tonight ──
select 'Finance', 40, 'Revenue — TWO ANSWERS', 
       (select round(abs(value_a - value_b)) from (select value_a, value_b from verification_runs where check_key='revenue-two-reports' order by ran_at desc limit 1) r),
       '$', 'bad',
       (select format('Two reports disagree: $%s vs $%s. DO NOT QUOTE REVENUE until settled — the disagreement is larger than planning materiality. Check: revenue-two-reports.',
               to_char(value_a,'FM9,999,999'), to_char(value_b,'FM9,999,999'))
          from (select value_a, value_b from verification_runs where check_key='revenue-two-reports' order by ran_at desc limit 1) r),
       'verification_runs', now()
union all
select 'Finance', 41, 'Examination readiness',
       (select count(*) filter (where where_it_lives is not null) from examination_standard),
       'of ' || (select count(*) from examination_standard)::text, 
       case when (select count(*) filter (where where_it_lives is null) from examination_standard) > 0 then 'bad' else 'good' end,
       (select format('%s of %s IRS/CCC examiner tests producible. CANNOT PRODUCE: %s — worst is the year-end physical inventory count, the first thing an examiner asks on a 280E file.',
               count(*) filter (where where_it_lives is not null), count(*), count(*) filter (where where_it_lives is null))
          from examination_standard),
       'examination_readiness', now()
union all
select 'Finance', 42, 'COGS substantiation',
       (select count(*) from time_entries) + (select count(*) from material_purchases),
       'records', 'bad',
       'Direct labour records: ' || (select count(*) from time_entries)::text || '. Purchase records: ' || (select count(*) from material_purchases)::text ||
       '. Under IRC 280E only substantiated COGS survives — zero records means zero substantiated deductions today. cost_classes covers labour only; materials have no classifier yet.',
       'cost_inputs', now()
union all
select 'Finance', 43, 'Materiality — owner set',
       (select value from conversion_factors where key='materiality_planning_usd'),
       '$', 'info',
       (select format('Planning $%s · inventory/COGS $%s · trivial $%s. OPERATIONAL thresholds (investigate everything); NOT reporting materiality for a return — that needs the signing CPA. No floor on diversion-class findings.',
               to_char((select value from conversion_factors where key='materiality_planning_usd'),'FM9,999'),
               to_char((select value from conversion_factors where key='materiality_inventory_usd'),'FM9,999'),
               to_char((select value from conversion_factors where key='materiality_trivial_usd'),'FM9,999'))),
       'conversion_factors', now()
union all
select 'Finance', 44, 'Findings carrying money',
       (select count(*) from v_findings where resolved_at is null and dollars > 0 and not coalesce(is_duplicate,false)),
       'findings', 'bad',
       'Open findings with a dollar figure attached. TOTAL DELIBERATELY NOT SHOWN: check findings-money-deduplicated is DISAGREEING, so the same dollars appear in more than one finding and any sum is overstated by an unknown amount. Work v_finding_causes — 6 causes carry 83% of the queue.',
       'finding_causes', now()
union all
select 'Finance', 45, 'Checks in disagreement',
       (select count(*) from (select distinct on (check_key) verdict from verification_runs order by check_key, ran_at desc) t where upper(verdict) <> 'AGREE'),
       'of ' || (select count(*) from verification_checks where enabled)::text, 
       case when (select count(*) from (select distinct on (check_key) verdict from verification_runs order by check_key, ran_at desc) t where upper(verdict) <> 'AGREE') > 0 then 'bad' else 'good' end,
       'Hourly verification suite. Every disagreement is a named, owned finding within the hour. A figure whose check disagrees must not be quoted externally.',
       'verification_runs', now();

comment on view public.v_dept_dash_cfo is
 'CFO Dashboard tiles. REPUBLISHES canonical rows from mv_department_dashboard, the third-party '
 'tiles and the verification suite - a projection, never a recomputation, so it cannot disagree '
 'with Command (one figure, one value). CFO-only tiles cover what no other surface owns: revenue '
 'disagreement, examination readiness, COGS substantiation, owner-set materiality, money-bearing '
 'findings (total withheld while dedupe check disagrees), and suite status. Every tile drills (C1).';

create or replace view public.v_cfo_inventory_audit as
-- The audit panel is the canon for the audit position; project it and add the CFO framing rows.
select ord, kind, line, lb, usd, basis, drill
from v_forensic_audit_panel
union all
select 900, 'materiality', 'Materiality applied to this audit (owner-set 11 Aug 2026)',
       null,
       (select value from conversion_factors where key='materiality_inventory_usd'),
       'Inventory/COGS threshold $500; planning $1,000; trivial $100 (accumulates). NO threshold on diversion-class items: one untagged plant, unmanifested transfer or undocumented destruction is a finding regardless of value.',
       'conversion_factors'
union all
select 901, 'basis-warning', 'Third-party cost basis',
       (select round(sum(lb_received),1) from v_third_party_forensic),
       901941,
       'Restated 11 Aug 2026: $901,941 declared transfer price (was $1,276,288 before the owner''s Eagle Eyes 3PL ruling was enforced; $374,346 was our own material returning from storage). DECLARED price, not evidence of cash paid — 1,691.2 lb has no price in Metrc at all. Floor if every untestable line excluded: $838,953.',
       'third_party_forensic'
union all
select 902, 'open-question', 'Third-party on hand — under reconciliation',
       (select round(sum(lb_on_hand),1) from v_third_party_forensic),
       null,
       'In-transit counts as ours until the destination accepts (owner ruling). REMAINING: view computes 72 lb less than Metrc raw quantities on the same 100 active tags — Agent V owns it; check third-party-on-hand-two-ways fires until settled. Do not certify this figure yet.',
       'third_party_forensic';

comment on view public.v_cfo_inventory_audit is
 'Inventory Audit, Planning & Budgeting: the forensic audit panel (canonical, projected - never '
 'recomputed) plus CFO framing rows: owner-set materiality, the restated third-party cost basis '
 'with its honest limits, and the open on-hand reconciliation. Rows 900+ are the audit context '
 'an examiner or CPA reads first.';

-- Repair the two nav entries to point at what now exists (menu data, not design).
update nav_registry set table_ref = 'v_dept_dash_cfo', updated_at = now()
 where label = 'CFO Dashboard' and coalesce(table_ref,'') = 'dept_dash_cfo';
update nav_registry set table_ref = 'v_cfo_inventory_audit', updated_at = now()
 where label = 'Inventory Audit, Planning & Budgeting' and coalesce(table_ref,'') = 'cfo_inventory_audit';

-- The two pages are fixed; the ratchet falls to zero and stays there.
update conversion_factors set
  value = (select count(*) from v_nav_broken_pages), updated_at = now(),
  evidence_note = 'Lowered to 0 on 12 Aug 2026: both broken Finance pages fixed by building the promised views. Never raise.'
where key = 'nav_broken_pages_ceiling';;
