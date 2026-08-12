-- 0033: Testing SLA Matrix - exact fidelity to the planner sheet (sheet 18 / owner CSV)
alter table testing_slas add column if not exists rule_code text;
alter table testing_slas add column if not exists sample_prep_hours numeric;
alter table testing_slas add column if not exists laboratory text;
alter table testing_slas add column if not exists product_family text;

create or replace view v_testing_sla_matrix with (security_invoker = true) as
select
  coalesce(s.rule_code, '—') as rule_id,
  coalesce(s.product_family, pf.name, '—') as product_family,
  s.batch_size_min as minimum_batch_size,
  s.batch_size_max as maximum_batch_size,
  s.test_type,
  s.sample_qty as sample_quantity,
  s.sample_prep_hours,
  s.laboratory,
  s.lead_days as lab_lead_days,
  case when s.active then 'Yes' else 'No' end as active
from testing_slas s
left join product_families pf on pf.id = s.product_family_id
order by s.product_family, s.batch_size_min;

insert into nav_registry (category, category_order, item_order, view_key, label, table_ref, milestone, icon, description, enabled, color)
values ('Quality', 6, 1, 'testing_sla', 'Testing SLA Matrix', 'v_testing_sla_matrix', null, 'flask',
  'Real laboratory rules by product family and batch-size tier - test type, sample quantity, prep hours, lab, and lead days. Testing & Release scheduling uses the matching lead time so large batches never get promised on unrealistic turnaround. Exact planner-sheet columns.', true, '#ff8a00')
on conflict do nothing;

update actions_register set note = note || ' SHEET RECEIVED 2026-08-05 (owner CSV from planner v4): confirmed 100% EMPTY - zero lab rules ever entered. Structure now live (Quality > Testing SLA Matrix, exact sheet columns incl. rule_code/sample_prep_hours/laboratory). To fill: owner supplies actual lab turnarounds from last 90 days of COAs, or approves a drafted MA-lab-standard rule set. Two-way sync to the planner requires the planner (or this tab) living as a shared Google Sheet - the .xlsm on the local machine cannot be polled; when shared, sheet-sync round-trips it like Finished Goods.'
where title = 'Load real lab SLA matrix (last 90 days) into testing_slas';;
