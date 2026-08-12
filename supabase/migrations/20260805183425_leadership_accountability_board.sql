-- THE CHIEF EXECUTIVE BOARD: the highest-paid people responsible for manufacturing
-- and cultivation, each with what their area actually delivered.
create or replace view v_leadership_accountability as
with paid as (
  select e.id, e.full_name, e.employee_code,
    coalesce(rc.name,'not recorded') as position,
    coalesce(d.name,'not assigned') as department,
    e.weekly_target_hours,
    (select round(pf.loaded_weekly_cost::numeric,0) from v_payroll_forecast pf
      where pf.full_name = e.full_name limit 1) as loaded_weekly_cost,
    (select round((pf.loaded_weekly_cost * 52)::numeric,0) from v_payroll_forecast pf
      where pf.full_name = e.full_name limit 1) as loaded_annual_cost
  from employees e
  left join roles_catalog rc on rc.id = e.primary_role_id
  left join departments d on d.id = e.primary_department_id
  where e.terminated_on is null
)
select p.full_name, p.position, p.department, p.employee_code,
  p.loaded_weekly_cost, p.loaded_annual_cost,
  -- what their area delivered
  case
    when p.department ilike '%cultivation%' then
      (select count(*) from v_late_violations where rule_verdict like 'VIOLATION%')
    when p.department ilike '%pre-roll%' or p.department ilike '%manufactur%' or p.department ilike '%extract%' or p.department ilike '%packag%' then
      (select count(*) from v_turnaround_watch where turnaround_violation)
    else null end as violations_in_their_area,
  case
    when p.department ilike '%cultivation%' then
      (select round(avg(wet_to_saleable_pct)::numeric,1) from v_true_cost_per_pound
        where month_date >= current_date - 90)
    else null end as area_conversion_pct_90d,
  case
    when p.department ilike '%cultivation%' then
      (select count(*) from v_harvest_lifecycle where verdict = 'MISSING WEIGHTS')
    else null end as missing_weight_reports,
  case
    when p.department ilike '%cultivation%' then
      (select count(*) from v_harvest_lifecycle where verdict = 'BLOCKING THE ROOM')
    else null end as rooms_blocked,
  (select count(*) from v_custody_alerts) as company_compliance_flags,
  case
    when p.loaded_annual_cost is null then 'Pay rate not loaded - cannot measure cost against delivery'
    when p.department ilike '%cultivation%' and (select count(*) from v_late_violations where rule_verdict like 'VIOLATION%') > 0
      then 'Schedule violations in their area - review directly'
    when p.department = 'not assigned' then 'No department assigned - cannot attribute accountability'
    else 'No open violations attributed to their area' end as accountability_note
from paid p
order by p.loaded_annual_cost desc nulls last;

create or replace view v_leadership_cost_vs_output as
select
  coalesce(d.name,'not assigned') as department,
  count(e.id)::numeric as headcount,
  round(sum(coalesce(pf.loaded_weekly_cost,0))::numeric,0) as weekly_loaded_cost,
  round((sum(coalesce(pf.loaded_weekly_cost,0)) * 52)::numeric,0) as annual_loaded_cost,
  round(max(coalesce(pf.loaded_weekly_cost,0))::numeric,0) as highest_paid_weekly,
  (select string_agg(x.full_name, ', ') from (
      select e2.full_name from employees e2
      left join v_payroll_forecast p2 on p2.full_name = e2.full_name
      where e2.primary_department_id = d.id and e2.terminated_on is null
      order by coalesce(p2.loaded_weekly_cost,0) desc limit 3) x) as highest_paid_people,
  case when d.name ilike '%cultivation%'
    then (select round(sum(saleable_lbs)::numeric,1) from v_true_cost_per_pound where month_date >= current_date - 90) end as saleable_lbs_90d,
  case when d.name ilike '%cultivation%'
    then round((sum(coalesce(pf.loaded_weekly_cost,0)) * 13
      / nullif((select sum(saleable_lbs) from v_true_cost_per_pound where month_date >= current_date - 90),0))::numeric,0) end as labour_cost_per_saleable_pound_90d
from departments d
left join employees e on e.primary_department_id = d.id and e.terminated_on is null
left join v_payroll_forecast pf on pf.full_name = e.full_name
group by d.id, d.name
order by annual_loaded_cost desc nulls last;

insert into nav_registry (category, category_order, label, item_order, icon, view_key, table_ref, description, enabled, admin_only, sync_enabled)
select 'Command', (select category_order from nav_registry where view_key='tower' limit 1),
       v.l, v.io, v.ic, v.vk, v.tr, v.d, true, true, false
from (values
  ('Leadership Accountability', 5, 'users', 'leadership_accountability', 'v_leadership_accountability', 'The people this board exists to monitor: every team member ranked by loaded annual cost, with their position, department, the violations in their area, their area conversion percentage, missing weight reports, blocked rooms, and a plain accountability note.'),
  ('Cost Versus Output by Department', 6, 'scale', 'leadership_cost_output', 'v_leadership_cost_vs_output', 'Each department: headcount, weekly and annual loaded payroll cost, who the highest paid people are, saleable pounds produced in the last ninety days, and the labour cost per saleable pound.')
) v(l, io, ic, vk, tr, d)
where not exists (select 1 from nav_registry nr where nr.view_key = v.vk);
insert into nav_role_visibility (view_key, role, visible)
select vk, r.role, r.role in ('owner','executive')
from (values ('leadership_accountability'),('leadership_cost_output')) k(vk)
cross join (values ('owner'),('executive'),('manager'),('member'),('limited'),('guest')) r(role)
on conflict (view_key, role) do update set visible = excluded.visible;

insert into actions_register (title, priority, status, source, needs_owner, note, what_to_do, why_it_matters, how_to_execute, recommendation) values
('Cost calculator spreadsheet is still locked to the operating system', 'P0', 'open', 'owner_directive', true,
 'Owner supplied https://docs.google.com/spreadsheets/d/1RowubvLaEQhfr26w6ZfDHxQ-DJE6rpul1xjvtgVrzhk as the company cost calculator and the record of proof for all cost calculations. Tested again today on tabs 0, 1 and 2 - every request returns a Google sign-in page, not data. The operating system cannot read it.',
 'Open the spreadsheet, press Share, change General access to Anyone with the link as Viewer, then tell the assistant. It will pull every tab, build each calculator into the Planning area, and use the sheet as the cost basis of record sitewide.',
 'The owner has said this sheet is the record of proof for all cost calculations. Until the operating system can read it, every cost figure rests on the single 1,100 dollars per pound estimate instead of the real calculators.',
 'Share, then Anyone with the link, then Viewer. Nothing needs to be copied or moved - read access is enough.',
 'This is the single highest-value unlock left: it converts every cost figure in the platform from an estimate into a calculated number with a source.');
select full_name, position, department, loaded_annual_cost, accountability_note from v_leadership_accountability limit 6;;
