-- ---------------------------------------------------------------------------
-- 0074 — Every seeded figure is PROVISIONAL until real costs are pulled and entered.
--
-- Owner 11 Aug 2026: "DO NOT SET IN STONE WE HAVE TO PULL 100% ACCURATE COSTS OF
-- MATERIAL AND INPUT IT AND HAVE ABILITY TO EDIT CAN NOT BE HARD WIRED YOU ARE JUST
-- PUTTING IN THESE FIGURES TEMPORARILY RIGHT NOW."
--
-- Nothing here is hardwired - every value already lives in an editable table and no
-- view carries a literal. What was missing is the LABEL: a seeded number and a
-- verified number looked identical on screen. They no longer do. A report that
-- quotes a PROVISIONAL rate must say so, exactly as conversion_factors already does.
-- ---------------------------------------------------------------------------
alter table production_yield_standard add column if not exists evidence_status text
  not null default 'provisional';
alter table production_yield_standard add column if not exists evidence_note text;

alter table inventory_cost_rate      add column if not exists evidence_status text
  not null default 'provisional';
alter table inventory_cost_rate      add column if not exists evidence_note text;

alter table preroll_formulation      add column if not exists evidence_status text
  not null default 'provisional';

alter table product_brand_tier       add column if not exists evidence_status text
  not null default 'owner_set';

update production_yield_standard set
  evidence_status = 'provisional',
  evidence_note = 'TEMPORARY. Transcribed from the Manufacturing Production Worksheet '
                  'cell named in source_cell. It has NOT been verified against actual '
                  'production runs. Replace with measured figures; do not quote as fact.'
where evidence_status = 'provisional';

update inventory_cost_rate set
  evidence_status = 'provisional',
  evidence_note = 'TEMPORARY PLACEHOLDER. Owner 11 Aug 2026: real costs of material are '
                  'still to be pulled and entered. Any cost or margin computed on this '
                  'rate is indicative only and must not be reported as actual.'
where evidence_status = 'provisional';

update preroll_formulation set
  evidence_status = 'provisional',
  note = note || ' PROVISIONAL: the mix changes with available inventory and this row '
                 'has not been confirmed against production records for the period.'
where evidence_status = 'provisional';

alter table production_yield_standard
  add constraint production_yield_evidence_known
  check (evidence_status in ('provisional','measured','owner_set','definitional'));
alter table inventory_cost_rate
  add constraint inventory_cost_evidence_known
  check (evidence_status in ('provisional','measured','owner_set','definitional'));

comment on column production_yield_standard.evidence_status is
  'provisional = seeded from the worksheet, NOT verified against real runs. measured = '
  'derived from our own production data. owner_set = stated by the owner. A report '
  'quoting a provisional value must say so.';
comment on column inventory_cost_rate.evidence_status is
  'provisional = placeholder pending the real cost of materials. Never present a '
  'margin or valuation built on a provisional rate as actual.';


-- A single place to see what is still a placeholder.
create or replace view v_provisional_standards as
select 'production_yield_standard' as source, key as item, label as description,
       value::text as current_value, unit, evidence_status, set_by, updated_at
from production_yield_standard where evidence_status = 'provisional'
union all
select 'inventory_cost_rate',
       scope || ':' || coalesce(scope_key,'(all)') || ' / ' || material,
       'Cost rate, ' || material,
       coalesce(cost_per_lb::text || ' per lb', cost_per_unit::text || ' per unit'),
       currency, evidence_status, set_by, updated_at
from inventory_cost_rate where evidence_status = 'provisional'
union all
select 'preroll_formulation', brand || ' from ' || effective_from,
       'Pre-roll flower:trim split',
       round(flower_pct*100) || '/' || round(trim_pct*100), 'ratio',
       evidence_status, set_by, updated_at
from preroll_formulation where evidence_status = 'provisional';

comment on view v_provisional_standards is
  'Every figure still carrying a PROVISIONAL placeholder. Owner 11 Aug 2026: real '
  'costs of material are to be pulled and entered. Until an item leaves this list, '
  'any cost, margin or valuation derived from it is indicative only.';

grant select on v_provisional_standards to authenticated;

insert into nav_registry (category, label, view_key, table_ref, surface, page_kind,
                          archetype, report_group, module, icon, description,
                          date_policy, default_range, range_kind, enabled, item_order)
values ('Reports','Provisional Figures (not yet verified)','provisional_standards',
  'v_provisional_standards','reports','report','issue_queue',
  'Inventory & Audit','reports','box',
  'Every standard, cost rate and formulation still carrying a placeholder. Real costs '
  'of material are still to be entered. Anything on this list is indicative only and '
  'must not be reported as actual.',
  'not_applicable','this_year','activity',true,10)
on conflict (view_key) do update set
  label=excluded.label, table_ref=excluded.table_ref, description=excluded.description,
  enabled=true;
;
