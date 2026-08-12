alter table ai_settings add column if not exists paid_model_enabled boolean default false;
update ai_settings set
  paid_model_enabled = false,
  hard_monthly_cost_cap_usd = 5,
  default_daily_calls = 10,
  default_monthly_calls = 100,
  note = 'PAID MODEL IS OFF. The platform runs entirely on database queries, which cost nothing and always will. Every report, dashboard, drill-down and suggestion button is free. Turning paid_model_enabled on is a deliberate choice and is capped at hard_monthly_cost_cap_usd, enforced on the server. Nothing here bills anyone until an owner switches it on.'
where id = 1;

create or replace function tg_ai_budget_ok()
returns boolean language sql stable security definer set search_path=public as $$
  select (select coalesce(paid_model_enabled,false) from ai_settings where id=1)
     and coalesce((select sum(cost_usd) from ai_usage_log where created_at >= date_trunc('month', now())), 0)
         < (select hard_monthly_cost_cap_usd from ai_settings where id=1);
$$;

drop view if exists v_ai_cost_position cascade;
create view v_ai_cost_position as
select
  case when (select paid_model_enabled from ai_settings where id=1)
       then 'PAID MODEL IS ON' else 'PAID MODEL IS OFF - the platform costs nothing to run' end as status,
  (select hard_monthly_cost_cap_usd from ai_settings where id=1) as monthly_cap_usd,
  (select round(coalesce(sum(cost_usd),0),2) from ai_usage_log
     where created_at >= date_trunc('month', now())) as spent_this_month_usd,
  (select count(*) from ai_usage_log where created_at >= date_trunc('month', now()) and answered_by='model') as paid_calls_this_month,
  'Every page, report, dashboard, drill-down, scheduled sweep and suggestion button is a database query. Those cost nothing and are not affected by this setting.' as what_is_always_free,
  'Only a free-form typed question can ever cost money, and only while the paid model is switched on and under the cap.' as what_could_ever_cost;

select status, monthly_cap_usd, spent_this_month_usd from v_ai_cost_position;;
