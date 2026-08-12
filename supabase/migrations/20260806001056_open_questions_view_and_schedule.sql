drop view if exists v_open_questions cascade;
create view v_open_questions as
select
  area, question, why_it_matters, what_is_blocked,
  exposure_lb,
  round(exposure_lb * (select value from conversion_factors where key='target_cost_per_lb')) as exposure_dollars,
  (current_date - first_seen::date) as days_open,
  first_seen::date as first_raised,
  case
    when (current_date - first_seen::date) > 30 then 'OPEN OVER A MONTH'
    when coalesce(exposure_lb,0) > 100 then 'HIGH EXPOSURE'
    else 'Open' end as urgency,
  question_key
from open_questions where status='open'
order by coalesce(exposure_lb,0) desc, first_seen;

insert into nav_registry (category, category_order, label, item_order, icon, view_key, table_ref, description, enabled, admin_only, sync_enabled)
select 'Command', (select category_order from nav_registry where view_key='tower' limit 1), v.l, v.o, v.i, v.k, v.t, v.d, true, false, false
from (values
 ('Open Questions', 5, 'help-circle', 'open_questions', 'v_open_questions',
  'Everything the platform needs a human to answer, raised automatically the moment it appears, with what it blocks and how many pounds and dollars ride on it. A question here is a number somewhere that cannot yet be trusted. Rechecked every four hours; answering it closes the question by itself.'),
 ('Supplier Master', 26, 'briefcase', 'suppliers', 'suppliers',
  'One row per licence we have ever received material from. Set what they send us once and every downstream figure inherits it. New licences are added automatically the first time material arrives, so this can never fall behind.')
) v(l,o,i,k,t,d)
where not exists (select 1 from nav_registry n where n.view_key = v.k);
insert into nav_role_visibility (view_key, role, visible)
select 'open_questions', r.role, r.vis from
 (values ('owner',true),('executive',true),('planner',true),('dept_head',true),('staff',false),('readonly',true)) r(role,vis)
on conflict (view_key, role) do update set visible = excluded.visible;
insert into nav_role_visibility (view_key, role, visible)
select 'suppliers', r.role, r.vis from
 (values ('owner',true),('executive',true),('planner',false),('dept_head',false),('staff',false),('readonly',false)) r(role,vis)
on conflict (view_key, role) do update set visible = excluded.visible;

select cron.schedule('sweep-unknowns', '0 */4 * * *', $$select tg_sweep_unknowns();$$);
select area, question, exposure_lb, urgency from v_open_questions;;
