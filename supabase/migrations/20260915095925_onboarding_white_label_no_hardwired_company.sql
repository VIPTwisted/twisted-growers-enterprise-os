-- Owner, 15 Sep 2026: "rules, staff shit is part of onboarding — treat as white label build, do not hardwire."
-- The pass over what shipped tonight: (1) the role list the per-role QA needs and the go-live week were literals inside
-- f_onboarding_measure — now parameters on the step row (onboarding_item.params, editable on a Setup form: Settings ›
-- Onboarding steps), and the "first week" step measures the NEXT week by default (the week the policy says to post);
-- (2) the step texts named this company's departments, shift times and waves — reworded to the generic action, the
-- company's own values live in its policy and template rows; (3) the HR platform gets one definition of "the company"
-- (hr.tg_company(): the company org node + its licences) so no screen carries the name as text. Additive only.
set search_path = public;

alter table public.onboarding_item add column if not exists params jsonb not null default '{}'::jsonb;
comment on column public.onboarding_item.params is 'Step parameters the company sets during onboarding — e.g. {"roles": [...]} for roles.accounts, {"week_start": "YYYY-MM-DD"} for scheduling.first_week (default: next week). Never a literal in code.';

update public.onboarding_item set params = jsonb_build_object('roles', to_jsonb(array['owner','executive','cfo','hr','manager','dept_head','planner','staff'])),
  what_to_do = 'Settings › Users: at least one person on each role the company uses (the list is this step''s "roles" parameter — edit it on Settings › Onboarding steps).'
 where key = 'roles.accounts';
update public.onboarding_item set what_to_do = 'HR platform › Employees: open each person and set their primary department (the company''s own department list).'
 where key = 'people.department';
update public.onboarding_item set what_to_do = 'Scheduling policy (Setup form): review every field — horizons, rest hours, consecutive days, the floater rule, weekend zones, sign-off roles — adjust to the company''s own rules and save with a reason. Shift times, breaks and waves live on the company''s shift templates.'
 where key = 'scheduling.policy_confirmed';
update public.onboarding_item set title = 'Next week''s schedule posted', why_it_matters = 'The coming week needs a posted schedule: who is where, so the time clock, coverage and labour cost have something to compare against. The step measures the next week by default (or the week in its "week_start" parameter).'
 where key = 'scheduling.first_week';
update public.onboarding_item set what_to_do = 'Authentication settings of the platform project › enable anonymous sign-ins. The Login screen of the HR platform says when it is off.', owner_role = 'Platform admin'
 where key = 'auth.anonymous';

create or replace function public.f_onboarding_measure()
returns table (key text, done_count int, needed_count int, evidence text)
language sql stable security definer set search_path = public, hr, auth as $$
  with emp as (select count(*)::int n from public.employees where status = 'active'),
       roles as (select coalesce((select array(select jsonb_array_elements_text(i.params->'roles')) from public.onboarding_item i where i.key = 'roles.accounts'), '{owner}'::text[]) r),
       wk as (select coalesce(nullif((select i.params->>'week_start' from public.onboarding_item i where i.key = 'scheduling.first_week'), '')::date, date_trunc('week', current_date)::date + 7) ws)
  select 'company.licences', least((select count(*)::int from public.company_licenses), 1), 1,
         (select count(*) from public.company_licenses) || ' licence(s) on file'
  union all
  select 'sync.keys', (select count(*)::int from public.f_sync_status() s where s.enabled and coalesce(array_length(s.secrets_missing, 1), 0) = 0 and coalesce(s.last_status, '') = 'ok'),
         (select count(*)::int from public.f_sync_status() s where s.enabled),
         (select coalesce(string_agg(s.label || case when coalesce(array_length(s.secrets_missing, 1), 0) > 0 then ' (keys missing: ' || array_to_string(s.secrets_missing, ', ') || ')' else ' (last run ' || coalesce(s.last_status, 'never') || ')' end, '; '), 'every sync green')
            from public.f_sync_status() s where s.enabled and not (coalesce(array_length(s.secrets_missing, 1), 0) = 0 and coalesce(s.last_status, '') = 'ok'))
  union all
  select 'people.department', (select count(*)::int from public.employees where status = 'active' and primary_department_id is not null), (select n from emp),
         coalesce((select 'missing: ' || string_agg(full_name, ', ' order by full_name) from public.employees where status = 'active' and primary_department_id is null), 'every active employee has a department')
  union all
  select 'people.pin', (select count(*)::int from public.employees where status = 'active' and nullif(pin_hash, '') is not null), (select n from emp),
         (select count(*) from public.employees where status = 'active' and nullif(pin_hash, '') is null) || ' active employee(s) without a PIN'
  union all
  select 'people.wage', (select count(distinct r.employee_id)::int from public.employee_rates r join public.employees e on e.id = r.employee_id and e.status = 'active'
                          where r.effective_to is null and not coalesce(r.provisional, false) and not coalesce(r.is_placeholder, false)), (select n from emp),
         (select count(distinct r.employee_id) from public.employee_rates r join public.employees e on e.id = r.employee_id and e.status = 'active' where r.effective_to is null and (coalesce(r.provisional, false) or coalesce(r.is_placeholder, false))) || ' active on a placeholder rate, '
         || (select count(*) from public.employees e where e.status = 'active' and not exists (select 1 from public.employee_rates r where r.employee_id = e.id and r.effective_to is null)) || ' with no rate at all'
  union all
  select 'people.login', (select count(*)::int from public.employees e where e.status = 'active' and exists (select 1 from public.app_users u where u.employee_id = e.id)), (select n from emp),
         (select count(*) from public.employees e where e.status = 'active' and not exists (select 1 from public.app_users u where u.employee_id = e.id)) || ' active employee(s) without a login'
  union all
  select 'roles.accounts', (select count(distinct u.role::text)::int from public.app_users u where u.role::text in (select unnest(r) from roles)), (select coalesce(array_length(r, 1), 0) from roles),
         coalesce((select 'no account yet on: ' || string_agg(x, ', ') from (select unnest(r) x from roles) rr where not exists (select 1 from public.app_users u where u.role::text = rr.x)), 'every role has an account')
  union all
  select 'auth.anonymous', (case when exists (select 1 from auth.users where is_anonymous) then 1 else 0 end), 1,
         case when exists (select 1 from auth.users where is_anonymous) then 'a kiosk session has signed in anonymously' else 'no anonymous session has ever signed in — the switch is off or the kiosk has not been opened' end
  union all
  select 'training.verified', (select count(*)::int from public.employee_department_skill where retired_at is null and verified_on is not null), (select count(*)::int from public.employee_department_skill where retired_at is null),
         (select count(*) from public.employee_department_skill where retired_at is null and verified_on is null) || ' row(s) unverified; floaters (2+ departments): '
         || (select count(*) from (select employee_id from public.employee_department_skill where retired_at is null and verified_on is not null group by 1 having count(distinct department_id) >= 2) f)
  union all
  select 'scheduling.policy_confirmed', (case when (select updated_by from public.scheduling_policy limit 1) is not null then 1 else 0 end), 1,
         case when (select updated_by from public.scheduling_policy limit 1) is not null then 'saved by ' || coalesce((select e.full_name from public.employees e where e.id = (select updated_by from public.scheduling_policy limit 1)), 'a person') || ' at ' || (select updated_at from public.scheduling_policy limit 1)::text
              else 'still the seeded recommendation — nobody at the company has saved it' end
  union all
  select 'scheduling.first_week', least((select count(*)::int from hr.shifts s, wk where s.status not in ('cancelled', 'void') and s.shift_date >= wk.ws and s.shift_date < wk.ws + 7), 1), 1,
         (select count(*) from hr.shifts s, wk where s.status not in ('cancelled', 'void') and s.shift_date >= wk.ws and s.shift_date < wk.ws + 7) || ' shift(s) on the HR schedule for the week of ' || to_char((select ws from wk), 'DD Mon') || ' ('
         || (select count(distinct s.person_id) from hr.shifts s, wk where s.status not in ('cancelled', 'void') and s.shift_date >= wk.ws and s.shift_date < wk.ws + 7) || ' people); drafts waiting for sign-off: '
         || (select count(*) from public.schedule_drafts d, wk where d.status = 'draft' and d.covers_from <= wk.ws + 6 and d.covers_to >= wk.ws)
  union all
  select 'alerts.recipients', least((select count(*)::int from public.alert_recipient where active), 1), 1,
         (select count(*) from public.alert_recipient where active) || ' active recipient row(s)'
  union all
  select 'purchases.bought_in_prices', (select count(*)::int from public.v_bought_in_register where state <> 'turned' and purchase_on_file), (select count(*)::int from public.v_bought_in_register where state <> 'turned'),
         (select count(*) from public.v_bought_in_register where state <> 'turned' and not purchase_on_file) || ' bought-in package(s) on hand or in transit with no purchase on file'
  union all
  select 'cost.flower_rate', (case when exists (select 1 from public.cost_basis_rule where stream = 'Dried flower' and active and not indicative) then 1 else 0 end), 1,
         coalesce((select 'Dried flower rule: ' || source || ' ' || key || ' per ' || per || case when indicative then ' — INDICATIVE, pending the CFO''s cost per pound' else ' — confirmed' end from public.cost_basis_rule where stream = 'Dried flower' and active order by priority limit 1), 'no active Dried flower rule')
  union all
  select 'sheets.reader', (case when exists (select 1 from public.sheet_rows) then 1 else 0 end), 1,
         (select count(*) from public.sheet_rows) || ' sheet row(s) ever delivered'
  union all
  select 'hr.tenant_config', least((select count(*)::int from hr.tenant_config), 1), 1, (select count(*) from hr.tenant_config) || ' configuration row(s)'
  union all
  select 'hr.handbook', least((select count(*)::int from hr.handbook_documents where status = 'published' or published_at is not null), 1), 1,
         (select count(*) from hr.handbook_documents) || ' handbook document(s), ' || (select count(*) from hr.handbook_documents where status = 'published' or published_at is not null) || ' published'
  union all
  select 'hr.policies', least((select count(*)::int from hr.hr_policies where is_active and (status = 'published' or published_at is not null)), 1), 1,
         (select count(*) from hr.hr_policies) || ' policy row(s), ' || (select count(*) from hr.hr_policies where is_active and (status = 'published' or published_at is not null)) || ' published'
$$;

-- the steps themselves are rows the company edits (title, who, why, what to do, the screen, the parameters)
insert into public.nav_registry (category, category_order, label, item_order, icon, view_key, table_ref, description, enabled, color, admin_only, subcategory, surface, page_kind, module, archetype)
values ('Settings', 12, 'Onboarding steps (edit)', 2, 'book', 'onboarding_items', 'onboarding_item',
        'The onboarding steps as rows: title, who does it, why it matters, what to do, the screen it opens, and the step''s parameters (e.g. the roles that need an account, the week to post). Edit here; the Onboarding page measures them.',
        true, '#8fa5ff', true, 'General', 'deep', 'report', 'settings', 'data_browser')
on conflict (view_key) do update set label = excluded.label, table_ref = excluded.table_ref, description = excluded.description, enabled = true, module = excluded.module, archetype = excluded.archetype, category = excluded.category, subcategory = excluded.subcategory, admin_only = excluded.admin_only;

-- one definition of "the company" for the HR platform: the company org node and its licences
create or replace function hr.tg_company()
returns jsonb language sql stable security definer set search_path = hr, public, extensions as $$
  select jsonb_build_object(
    'name', n.name, 'state', n.state_code, 'timezone', n.timezone, 'address', n.config->>'address',
    'licences', (select coalesce(jsonb_agg(jsonb_build_object('licence', c.license, 'label', c.label, 'kind', c.kind) order by c.license), '[]'::jsonb) from public.company_licenses c where c.active),
    'locations', (select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'name', l.name) order by l.name), '[]'::jsonb) from hr.org_nodes l where l.node_type = 'location' and l.is_active))
  from hr.org_nodes n where n.node_type = 'company' and n.is_active order by n.created_at limit 1
$$;
revoke all on function hr.tg_company() from public, anon;
grant execute on function hr.tg_company() to authenticated, service_role;
comment on function hr.tg_company() is 'White-label: the company the HR platform serves — its org node (name, state, timezone, address), licences and locations. Screens read this; none carries the name as text.';
select public.f_onboarding_watch();
notify pgrst, 'reload schema';;
