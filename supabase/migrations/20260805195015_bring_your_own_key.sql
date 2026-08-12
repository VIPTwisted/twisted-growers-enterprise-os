-- A user may supply their own key. Their questions then bill to them, not the company.
alter table ai_user_access add column if not exists own_key text;
alter table ai_user_access add column if not exists own_key_provider text
  check (own_key_provider in ('anthropic','openai') or own_key_provider is null);
alter table ai_user_access add column if not exists uses_local_model boolean default false;
alter table ai_user_access add column if not exists local_model_url text;

-- Nobody can read a key back, not even its owner. Only the server.
drop policy if exists aua_read on ai_user_access;
drop policy if exists aua_all on ai_user_access;
alter table ai_user_access enable row level security;
create policy aua_read on ai_user_access for select to authenticated using (true);
create policy aua_write on ai_user_access for all to authenticated
  using (user_id = auth.uid() or exists (select 1 from app_users u where u.user_id=auth.uid() and u.role in ('owner','executive')))
  with check (user_id = auth.uid() or exists (select 1 from app_users u where u.user_id=auth.uid() and u.role in ('owner','executive')));

create or replace function tg_set_my_key(p_provider text, p_key text)
returns void language plpgsql security definer set search_path=public as $$
begin
  insert into ai_user_access (user_id, own_key_provider, own_key, enabled, updated_at)
  values (auth.uid(), nullif(p_provider,''), nullif(p_key,''), true, now())
  on conflict (user_id) do update
    set own_key_provider = nullif(p_provider,''), own_key = nullif(p_key,''), updated_at = now();
end $$;

create or replace function tg_read_user_key(p_user uuid)
returns table(provider text, api_key text, local_url text)
language sql security definer set search_path=public as $$
  select own_key_provider, own_key,
         case when uses_local_model then local_model_url else null end
  from ai_user_access where user_id = p_user;
$$;
revoke all on function tg_read_user_key(uuid) from public, anon, authenticated;

drop view if exists v_ai_access_status cascade;
create view v_ai_access_status as
select a.user_id, a.display_name, a.enabled,
  a.daily_call_limit, a.monthly_call_limit,
  case
    when a.uses_local_model then 'Own local model - costs the company nothing'
    when coalesce(a.own_key,'') <> '' then 'Own '||coalesce(a.own_key_provider,'provider')||' key - bills to them, costs the company nothing'
    else 'Company allowance - billed to the company'
  end as how_they_are_billed,
  case when coalesce(a.own_key,'') = '' then null
       else left(a.own_key,7)||'…'||right(a.own_key,4) end as key_masked,
  (select count(*) from ai_usage_log l where l.user_id=a.user_id
     and l.created_at >= date_trunc('month', now()) and l.answered_by='model') as model_calls_this_month,
  (select round(coalesce(sum(l.cost_usd),0),4) from ai_usage_log l where l.user_id=a.user_id
     and l.created_at >= date_trunc('month', now())) as cost_this_month_usd,
  a.updated_at
from ai_user_access a order by a.display_name;

insert into nav_registry (category, category_order, label, item_order, icon, view_key, table_ref, description, enabled, admin_only, sync_enabled)
select 'Settings', (select category_order from nav_registry where view_key='settings'),
 'Who Pays for AI', 25, 'users', 'ai_access_status', 'v_ai_access_status',
 'Per person: whether their questions are billed to the company, to their own key, or run on their own machine for nothing. Keys are stored server side and can never be read back.', true, true, false
where not exists (select 1 from nav_registry where view_key='ai_access_status');
insert into nav_role_visibility (view_key, role, visible)
select 'ai_access_status', r.role, true from (values ('owner'),('executive')) r(role)
on conflict (view_key, role) do update set visible = true;;
