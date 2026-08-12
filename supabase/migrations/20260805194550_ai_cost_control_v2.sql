alter table ai_usage_log add column if not exists answered_by text;
alter table ai_usage_log add column if not exists cost_usd numeric(10,6) default 0;
alter table ai_usage_log add column if not exists cached_tokens int default 0;
alter table ai_usage_log add column if not exists model text;
alter table ai_usage_log add column if not exists input_tokens int default 0;
alter table ai_usage_log add column if not exists output_tokens int default 0;
alter table ai_usage_log add column if not exists feature text;
create index if not exists aul_created on ai_usage_log (created_at desc);

alter table ai_settings add column if not exists input_usd_per_mtok numeric(10,4) default 1.00;
alter table ai_settings add column if not exists output_usd_per_mtok numeric(10,4) default 5.00;
alter table ai_settings add column if not exists cached_read_usd_per_mtok numeric(10,4) default 0.10;
alter table ai_settings add column if not exists model_only_when_needed boolean default true;
alter table ai_settings add column if not exists rate_note text;
update ai_settings set
  input_usd_per_mtok=coalesce(input_usd_per_mtok,1.00),
  output_usd_per_mtok=coalesce(output_usd_per_mtok,5.00),
  cached_read_usd_per_mtok=coalesce(cached_read_usd_per_mtok,0.10),
  model_only_when_needed=coalesce(model_only_when_needed,true),
  rate_note=coalesce(rate_note,'Confirm these against console.anthropic.com billing. Every cost figure on this platform is computed from these three numbers, so correcting them here corrects the whole system.')
where id=1;

drop view if exists v_ai_spend cascade;
create view v_ai_spend as
select to_char(date_trunc('month', created_at),'YYYY-MM') as month,
  count(*) as calls,
  count(*) filter (where answered_by='database') as answered_free_by_database,
  count(*) filter (where answered_by='model') as answered_by_model,
  sum(input_tokens) as input_tokens, sum(output_tokens) as output_tokens,
  round(sum(cost_usd),2) as cost_usd,
  round(avg(cost_usd) filter (where answered_by='model'),4) as avg_cost_per_model_call,
  (select hard_monthly_cost_cap_usd from ai_settings where id=1) as monthly_cap_usd,
  round((select hard_monthly_cost_cap_usd from ai_settings where id=1) - sum(cost_usd),2) as cap_remaining_usd
from ai_usage_log group by 1 order by 1 desc;

drop view if exists v_ai_spend_today cascade;
create view v_ai_spend_today as
select count(*) calls_today,
  count(*) filter (where answered_by='database') free_today,
  round(coalesce(sum(cost_usd),0),4) cost_today,
  (select round(coalesce(sum(cost_usd),0),2) from ai_usage_log where created_at >= date_trunc('month', now())) cost_this_month,
  (select hard_monthly_cost_cap_usd from ai_settings where id=1) cap
from ai_usage_log where created_at >= date_trunc('day', now());

create or replace function tg_ai_budget_ok()
returns boolean language sql stable security definer set search_path=public as $$
  select coalesce((select sum(cost_usd) from ai_usage_log where created_at >= date_trunc('month', now())), 0)
       < (select hard_monthly_cost_cap_usd from ai_settings where id=1);
$$;;
