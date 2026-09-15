-- BP-13: hr.shifts has no 'posted' status — a posted week's shifts are 'scheduled' (the HR platform's own vocabulary).
-- The live proof (82 shifts posted through Today, rolled back) measured "0 posted shift(s)". The step now counts the
-- week's shifts that are not cancelled, and reports the drafts waiting for sign-off.
set search_path = public;
create or replace function public.f_onboarding_measure()
returns table (key text, done_count int, needed_count int, evidence text)
language sql stable security definer set search_path = public, hr, auth as $$
  with emp as (select count(*)::int n from public.employees where status = 'active')
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
  select 'roles.accounts', (select count(distinct u.role::text)::int from public.app_users u where u.role::text = any('{owner,executive,cfo,hr,manager,dept_head,planner,staff}'::text[])), 8,
         coalesce((select 'no account yet on: ' || string_agg(x, ', ') from unnest('{owner,executive,cfo,hr,manager,dept_head,planner,staff}'::text[]) x where not exists (select 1 from public.app_users u where u.role::text = x)), 'every role has an account')
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
              else 'still the seeded recommendation of 12 Sep 2026 — nobody has saved it' end
  union all
  select 'scheduling.first_week', least((select count(*)::int from hr.shifts s where s.status not in ('cancelled', 'void') and s.shift_date >= date '2026-09-21' and s.shift_date < date '2026-09-28'), 1), 1,
         (select count(*) from hr.shifts s where s.status not in ('cancelled', 'void') and s.shift_date >= date '2026-09-21' and s.shift_date < date '2026-09-28') || ' shift(s) on the HR schedule for the week of 21 Sep ('
         || (select count(distinct s.person_id) from hr.shifts s where s.status not in ('cancelled', 'void') and s.shift_date >= date '2026-09-21' and s.shift_date < date '2026-09-28') || ' people); drafts waiting for sign-off: '
         || (select count(*) from public.schedule_drafts d where d.status = 'draft' and d.covers_from <= date '2026-09-27' and d.covers_to >= date '2026-09-21')
  union all
  select 'alerts.recipients', least((select count(*)::int from public.alert_recipient where active), 1), 1,
         (select count(*) from public.alert_recipient where active) || ' active recipient row(s)'
  union all
  select 'purchases.bought_in_prices', (select count(*)::int from public.v_bought_in_register where state <> 'turned' and purchase_on_file), (select count(*)::int from public.v_bought_in_register where state <> 'turned'),
         (select count(*) from public.v_bought_in_register where state <> 'turned' and not purchase_on_file) || ' bought-in package(s) on hand or in transit with no purchase on file'
  union all
  select 'cost.flower_rate', (case when exists (select 1 from public.cost_basis_rule where stream = 'Dried flower' and active and not indicative) then 1 else 0 end), 1,
         coalesce((select 'Dried flower rule: ' || source || ' ' || key || ' per ' || per || case when indicative then ' — INDICATIVE (realised Apex price $478–$649/lb vs the $1,100/lb basis on the first P&L reading)' else ' — confirmed' end from public.cost_basis_rule where stream = 'Dried flower' and active order by priority limit 1), 'no active Dried flower rule')
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
select public.f_onboarding_watch();;
