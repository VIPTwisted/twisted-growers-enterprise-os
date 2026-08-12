-- Admin-governed artificial intelligence access: who may use it, how much, and at what cost.
create table if not exists ai_settings (
  id int primary key default 1 check (id = 1),
  provider text default 'anthropic',
  mode text not null default 'tokenless' check (mode in ('tokenless','byo_key','disabled')),
  default_daily_calls int not null default 20,
  default_monthly_calls int not null default 300,
  hard_monthly_cost_cap_usd numeric default 100,
  model text default 'claude-haiku-4-5-20251001',
  note text,
  updated_at timestamptz default now()
);
insert into ai_settings (id, note) values (1, 'Tokenless by default: staff use the company allowance, no personal key needed. Admin sets limits per user below.')
on conflict (id) do nothing;
create table if not exists ai_user_access (
  user_id uuid primary key,
  display_name text,
  enabled boolean not null default false,
  daily_call_limit int,
  monthly_call_limit int,
  allowed_features text[] default array['ask','summarize'],
  note text,
  updated_at timestamptz default now()
);
create table if not exists ai_usage_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid, display_name text, feature text, model text,
  input_tokens int default 0, output_tokens int default 0,
  cost_usd numeric default 0, ok boolean default true, error text,
  created_at timestamptz default now()
);
create index if not exists ai_usage_user_day on ai_usage_log (user_id, created_at);
alter table ai_settings enable row level security;
alter table ai_user_access enable row level security;
alter table ai_usage_log enable row level security;
create policy ais_read on ai_settings for select to authenticated using (true);
create policy ais_write on ai_settings for all to authenticated
  using (exists (select 1 from app_users au where au.user_id = auth.uid() and au.role::text in ('owner','executive')))
  with check (exists (select 1 from app_users au where au.user_id = auth.uid() and au.role::text in ('owner','executive')));
create policy aiu_read on ai_user_access for select to authenticated using (true);
create policy aiu_write on ai_user_access for all to authenticated
  using (exists (select 1 from app_users au where au.user_id = auth.uid() and au.role::text in ('owner','executive')))
  with check (exists (select 1 from app_users au where au.user_id = auth.uid() and au.role::text in ('owner','executive')));
create policy ail_read on ai_usage_log for select to authenticated using (true);

-- The gate every AI call must pass, with the reason when it is refused.
create or replace function tg_ai_allowance(p_user uuid)
returns table(allowed boolean, reason text, used_today int, daily_limit int, used_month int, monthly_limit int, month_cost numeric) as $$
declare s record; a record; ut int; um int; mc numeric;
begin
  select * into s from ai_settings where id = 1;
  select * into a from ai_user_access where user_id = p_user;
  select count(*), coalesce(sum(cost_usd),0) into um, mc from ai_usage_log
    where user_id = p_user and created_at >= date_trunc('month', now());
  select count(*) into ut from ai_usage_log where user_id = p_user and created_at >= current_date;
  daily_limit := coalesce(a.daily_call_limit, s.default_daily_calls);
  monthly_limit := coalesce(a.monthly_call_limit, s.default_monthly_calls);
  used_today := ut; used_month := um; month_cost := mc;
  if s.mode = 'disabled' then allowed := false; reason := 'Artificial intelligence features are switched off for the whole company.';
  elsif a.user_id is null or not a.enabled then allowed := false; reason := 'Your account is not enabled for artificial intelligence features - an owner or executive can enable it in Settings.';
  elsif ut >= daily_limit then allowed := false; reason := 'Daily limit of ' || daily_limit || ' reached. It resets at midnight.';
  elsif um >= monthly_limit then allowed := false; reason := 'Monthly limit of ' || monthly_limit || ' reached.';
  elsif (select coalesce(sum(cost_usd),0) from ai_usage_log where created_at >= date_trunc('month', now())) >= coalesce(s.hard_monthly_cost_cap_usd, 1e9)
    then allowed := false; reason := 'The company monthly cost cap has been reached.';
  else allowed := true; reason := 'Allowed'; end if;
  return next;
end $$ language plpgsql stable;

create or replace view v_ai_usage_summary as
select coalesce(u.display_name, u.user_id::text) as person,
  count(*) filter (where l.created_at >= current_date) as calls_today,
  count(*) filter (where l.created_at >= date_trunc('month', now())) as calls_this_month,
  round(coalesce(sum(l.cost_usd) filter (where l.created_at >= date_trunc('month', now())),0)::numeric, 2) as cost_this_month,
  coalesce(a.daily_call_limit, (select default_daily_calls from ai_settings where id=1)) as daily_limit,
  coalesce(a.monthly_call_limit, (select default_monthly_calls from ai_settings where id=1)) as monthly_limit,
  a.enabled, a.allowed_features
from ai_usage_log l
right join ai_user_access a on a.user_id = l.user_id
left join ai_user_access u on u.user_id = a.user_id
group by 1, a.daily_call_limit, a.monthly_call_limit, a.enabled, a.allowed_features;

insert into nav_registry (category, category_order, label, item_order, icon, view_key, table_ref, description, enabled, admin_only, sync_enabled)
select 'Settings', (select category_order from nav_registry where category='Settings' limit 1),
       v.l, v.io, v.ic, v.vk, v.tr, v.d, true, true, false
from (values
  ('Artificial Intelligence Access', 20, 'shield', 'ai_user_access', 'ai_user_access', 'Who may use artificial intelligence features and how much: enable each person, set their daily and monthly call limits, and choose which features they may use.'),
  ('Artificial Intelligence Settings', 21, 'gauge', 'ai_settings', 'ai_settings', 'Company-wide artificial intelligence controls: tokenless company allowance or bring-your-own-key, default limits for everyone, the model used, and a hard monthly cost cap.'),
  ('Artificial Intelligence Usage', 22, 'dollar', 'ai_usage', 'v_ai_usage_summary', 'What artificial intelligence is costing: calls today, calls this month, and cost per person against their limits.')
) v(l, io, ic, vk, tr, d)
where not exists (select 1 from nav_registry nr where nr.view_key = v.vk);;
