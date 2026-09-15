-- BP-13 (board row bp.d5.onboarding_pack), owner ruling 14 Sep 2026: the platform is white-label — every input the
-- company supplies (departments, PINs, pay rates, training sign-offs, logins, recipients, purchase prices, the policy
-- confirmations, the two switches) is a step the COMPANY completes inside the platform during onboarding, never a
-- question to the owner. This is the Onboarding page: the steps are rows (onboarding_item — the words), the state of
-- each step is MEASURED from the data by one function (f_onboarding_measure — the arithmetic), and the page is the
-- issue-queue archetype over v_onboarding_pack (who · why it matters · what to do · the screen it opens · "16 of 27").
-- Open blockers are filed as findings by f_onboarding_watch (hourly) so they reach Today and can be assigned to a
-- named person with a due date. Two sync gaps closed on the way, because the company will enter departments and
-- wages in the HR platform and the OS register (the one definition) must learn them: hr.assignments → employees
-- .primary_department_id and hr.wage_history → employee_rates (tg_hourly_rate and the payroll journal read
-- employee_rates). Additive only.
set search_path = public;

-- ── the words: one row per step ─────────────────────────────────────────────────────────────────────────────────
create table if not exists public.onboarding_item (
  key            text primary key,
  title          text not null,
  owner_role     text not null,                      -- who at the company does it
  blocker        boolean not null default false,     -- go-live cannot proceed without it
  why_it_matters text not null,
  what_to_do     text not null,
  drill_to       text,                               -- OS view_key, or hr_platform:/route
  unlocks        text[] not null default '{}',       -- board rows / capabilities it unblocks
  sort           int not null default 100,
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
comment on table public.onboarding_item is 'BP-13: the onboarding steps the company completes inside the platform (white-label). The state of each step is measured by f_onboarding_measure, never ticked by hand.';
alter table public.onboarding_item enable row level security;
drop policy if exists onboarding_item_read on public.onboarding_item;
create policy onboarding_item_read on public.onboarding_item for select to authenticated using (true);
drop policy if exists onboarding_item_admin on public.onboarding_item;
create policy onboarding_item_admin on public.onboarding_item for all to authenticated using (public.f_caller_is_admin()) with check (public.f_caller_is_admin());
grant select on public.onboarding_item to authenticated;
grant insert, update, delete on public.onboarding_item to authenticated;

insert into public.onboarding_item (key, title, owner_role, blocker, why_it_matters, what_to_do, drill_to, unlocks, sort) values
('company.licences', 'Company licences on file', 'Admin', true,
 'Every figure that separates our material from third-party material (sales, bought-in, custody) keys on the licence list.',
 'Settings › Our Licences: one row per Metrc licence the company holds.', 'company_licenses', '{bp.d3.stock_position,bp.d6.sales_desk_v1}', 10),
('sync.keys', 'Every registered sync has its keys and a green last run', 'Admin', true,
 'Metrc, Apex and the sheets are the sources; a sync without its key delivers nothing and the platform shows yesterday.',
 'Settings › Sync: paste each key the Sync page asks for and press Run now; the row turns green when the run delivers.', 'integrations', '{bp.d2.sync_watch}', 20),
('people.department', 'Every active employee has a primary department', 'HR', true,
 'The schedule drafter places people by department first; department dashboards and labour cost roll up by it.',
 'HR platform › Employees: open each person and set their department (Cultivation, Trimming, Extraction, Packaging, …).', 'hr_platform:/employees', '{bp.d8.agents_v1,scheduling.first_week}', 30),
('people.pin', 'Every active employee has a kiosk PIN', 'HR', true,
 'The time clock (wall terminal and HR kiosk) opens with the PIN; without it nobody can punch and payroll has no hours.',
 'HR platform › Admin: set a 4–8 digit PIN for each person (one PIN serves the OS wall terminal and the HR kiosk).', 'hr_platform:/admin', '{payroll.hours}', 40),
('people.wage', 'Every active employee has a real pay rate', 'HR / CFO', true,
 'Payroll on the money spine and labour cost per pound are computed from the rate; a placeholder rate makes both figures fiction.',
 'HR platform › Payroll › Wages: enter each person''s hourly rate (or weekly salary). The OS register learns it the moment it is saved.', 'hr_platform:/payroll', '{bp.d4.money_spine_v1,cost_per_pound}', 50),
('people.login', 'Every person who uses the OS has a login and a role', 'Admin', false,
 'A person without a login cannot see their pages, take a decision on Today or be assigned a task.',
 'Settings › Users: create the login, pick the role; the person changes the password at first sign-in.', 'os_users', '{bp.d5.role_qa}', 60),
('roles.accounts', 'Every role has at least one real account', 'Admin', true,
 'The per-role QA on Friday signs off that every role logs in, sees its menu and nothing else — it needs one real account per role.',
 'Settings › Users: at least one person on each role the company uses (owner, executive, cfo, hr, manager, dept_head, planner, staff…).', 'os_users', '{bp.d5.role_qa}', 70),
('auth.anonymous', 'Kiosk sign-in switch is on (Supabase › Auth › anonymous sign-ins)', 'Admin', true,
 'The kiosk PIN door signs the terminal in anonymously and then verifies the PIN; with the switch off the kiosk cannot open.',
 'Supabase dashboard › Authentication › Providers › enable Anonymous sign-ins. The Login screen of the HR platform says when it is off.', 'integrations', '{payroll.hours}', 80),
('training.verified', 'Training sign-offs verified by HR (who is trained where)', 'HR', true,
 'A floater is a person trained or in training in two or more departments; the drafter only places people the matrix says are trained. Unverified rows are hearsay.',
 'Training matrix (Setup form): verify each trained-in / in-training row; add the ones that are missing.', 'training_matrix', '{bp.d8.agents_v1,scheduling.first_week}', 90),
('scheduling.policy_confirmed', 'Scheduling policy confirmed by CFO or HR', 'CFO / HR', false,
 'Draft/post horizons, rest hours, the floater rule, weekend zones and who signs off are the rules the drafter obeys — they were seeded as a recommendation and nobody has saved them yet.',
 'Scheduling policy (Setup form): review every field, adjust, save with a reason. Shift 08:00–16:30, the 30-min unpaid break and the 12:00 / 13:30 waves live on the shift template.', 'scheduling_policy', '{scheduling.first_week}', 100),
('scheduling.first_week', 'First weekly schedule posted for the go-live week', 'Department heads / HR', true,
 'Go-live day needs a posted schedule: who is where, so the time clock, coverage and labour cost have something to compare against.',
 'HR platform › Schedule Builder: draft the week (the drafter proposes), fix conflicts, post; posting needs a sign-off role.', 'hr_platform:/schedule-builder', '{bp.d8.agents_v1}', 110),
('alerts.recipients', 'Alert recipients entered', 'Admin', false,
 'Pushes, the daily Today digest and NO-GO alarms go to rows, never to names in code; an empty list means nobody is told.',
 'Command Center › Alert Recipient: one row per person who should receive alerts (name, email, role).', 'alert-recipient', '{today.push}', 120),
('purchases.bought_in_prices', 'Purchase price on file for every bought-in package on hand', 'Purchasing', false,
 'Bought-in material is inventory turned in 30–45 days; without the purchase the money spine has no cost basis for it and margin per lot is unknown.',
 'Material Purchases: one row per purchase with the package tag, supplier, quantity, unit cost and freight.', 'material-purchases', '{bp.d4.money_spine_v1}', 130),
('cost.flower_rate', 'Bulk flower cost per pound confirmed by the CFO', 'CFO', false,
 'The cost basis for a pound of bulk flower drives COGS and every margin; the seeded $1,100 is the owner''s provisional manufacturing average and is marked indicative until confirmed.',
 'Finance › Cost basis rules: set the Dried flower rule to the measured grow cost per pound and clear the indicative flag, with a reason.', 'cost_basis_rules', '{bp.d4.money_spine_v1}', 140),
('sheets.reader', 'Live inventory sheet reader signed in', 'Admin', false,
 'Sheet-vs-Metrc comparison and the weekly review run on the sheet''s rows; until the reader is signed in the sheet delivers nothing.',
 'Settings › Sync › Google Sheets: sign the reader in once (the Sync page shows the button and the last delivered row).', 'integrations', '{bp.d3.sheet_vs_metrc}', 150),
('hr.tenant_config', 'HR platform configured for the company (business type, roles, zones, shift slots, competencies, vocabulary)', 'HR', false,
 'Every HR screen reads its roles, zones, shift slots and vocabulary from this configuration; unconfigured, the screens use generic defaults.',
 'HR platform › Settings: choose the business type and save the roles, zones, shift slots and competencies the company uses.', 'hr_platform:/settings', '{}', 160),
('hr.handbook', 'Employee handbook published', 'HR', false,
 'The Employee Manual screen shows only what HR publishes; acknowledgments and quizzes hang off the published version.',
 'HR platform › Handbook Builder: write or paste the handbook and publish it.', 'hr_platform:/handbook', '{}', 170),
('hr.policies', 'Policies and procedures published', 'HR', false,
 'Policies hub, acknowledgments and the compliance strip read published policies; none exist yet.',
 'HR platform › Policies: add each policy (category, version, effective date, acknowledgment required) and publish.', 'hr_platform:/policies', '{}', 180)
on conflict (key) do update set title = excluded.title, owner_role = excluded.owner_role, blocker = excluded.blocker, why_it_matters = excluded.why_it_matters,
  what_to_do = excluded.what_to_do, drill_to = excluded.drill_to, unlocks = excluded.unlocks, sort = excluded.sort, updated_at = now();

-- ── the arithmetic: one measurement per step, from the rows the platform actually reads ─────────────────────────
create or replace function public.f_onboarding_measure()
returns table (key text, done_count int, needed_count int, evidence text)
language sql stable security definer set search_path = public, hr, auth as $$
  with emp as (select count(*)::int n from public.employees where status = 'active')
  select 'company.licences', (select count(*)::int from public.company_licenses), 1,
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
         (select count(distinct r.employee_id) from public.employee_rates r where r.effective_to is null and (coalesce(r.provisional, false) or coalesce(r.is_placeholder, false))) || ' on a placeholder rate, '
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
  select 'scheduling.first_week', (select count(*)::int from hr.shifts s where s.status = 'posted' and s.shift_date >= date '2026-09-21' and s.shift_date < date '2026-09-28'), 1,
         (select count(*) from hr.shifts s where s.status = 'posted' and s.shift_date >= date '2026-09-21' and s.shift_date < date '2026-09-28') || ' posted shift(s) in the week of 21 Sep; '
         || (select count(*) from hr.shifts s where s.status = 'draft') || ' in draft'
  union all
  select 'alerts.recipients', (select count(*)::int from public.alert_recipient where active), 1,
         (select count(*) from public.alert_recipient where active) || ' active recipient row(s)'
  union all
  select 'purchases.bought_in_prices', (select count(*)::int from public.v_bought_in_register where state <> 'turned' and purchase_on_file), (select count(*)::int from public.v_bought_in_register where state <> 'turned'),
         (select count(*) from public.v_bought_in_register where state <> 'turned' and not purchase_on_file) || ' bought-in package(s) on hand or in transit with no purchase on file'
  union all
  select 'cost.flower_rate', (case when exists (select 1 from public.cost_basis_rule where stream = 'Dried flower' and active and not indicative) then 1 else 0 end), 1,
         coalesce((select 'Dried flower rule: ' || source || ' ' || key || ' per ' || per || case when indicative then ' — INDICATIVE' else ' — confirmed' end from public.cost_basis_rule where stream = 'Dried flower' and active order by priority limit 1), 'no active Dried flower rule')
  union all
  select 'sheets.reader', (case when exists (select 1 from public.sheet_rows) then 1 else 0 end), 1,
         (select count(*) from public.sheet_rows) || ' sheet row(s) ever delivered'
  union all
  select 'hr.tenant_config', (select count(*)::int from hr.tenant_config), 1, (select count(*) from hr.tenant_config) || ' configuration row(s)'
  union all
  select 'hr.handbook', (select count(*)::int from hr.handbook_documents where status = 'published' or published_at is not null), 1,
         (select count(*) from hr.handbook_documents) || ' handbook document(s), ' || (select count(*) from hr.handbook_documents where status = 'published' or published_at is not null) || ' published'
  union all
  select 'hr.policies', (select count(*)::int from hr.hr_policies where is_active and (status = 'published' or published_at is not null)), 1,
         (select count(*) from hr.hr_policies) || ' policy row(s), ' || (select count(*) from hr.hr_policies where is_active and (status = 'published' or published_at is not null)) || ' published'
$$;
revoke all on function public.f_onboarding_measure() from public, anon;
grant execute on function public.f_onboarding_measure() to authenticated;
comment on function public.f_onboarding_measure() is 'BP-13: the measured state of every onboarding step — counts from the rows the platform reads (employees, employee_rates, app_users, auth.users, hr.shifts, …). Definer so the counts are complete; it returns counts and names, never secrets.';

-- ── the page: issue-queue shape (column roles: item→head, severity→sev, status, owner_role→owner, why_it_matters→detail, what_to_do→action, evidence, as_of→when)
create or replace view public.v_onboarding_pack as
select i.key as id,
       i.title as item,
       case when m.done_count >= m.needed_count then 'info' when i.blocker then 'critical' else 'elevated' end as severity,
       case when m.done_count >= m.needed_count then 'done' when m.done_count > 0 then 'in progress' else 'open' end as status,
       i.owner_role,
       m.done_count || ' of ' || m.needed_count as progress,
       m.done_count, m.needed_count,
       case when i.blocker then 'blocker' else 'needed' end as kind,
       i.why_it_matters,
       i.what_to_do,
       m.evidence,
       i.drill_to,
       array_to_string(i.unlocks, ', ') as unlocks,
       now() as as_of,
       i.sort
  from public.onboarding_item i
  join public.f_onboarding_measure() m on m.key = i.key
 where i.active
 order by (m.done_count >= m.needed_count), (not i.blocker), i.sort;
grant select on public.v_onboarding_pack to authenticated;
comment on view public.v_onboarding_pack is 'BP-13 Onboarding: every step the company completes inside the platform, with its measured state. Rows are onboarding_item; the arithmetic is f_onboarding_measure; nothing is ticked by hand.';

-- ── the watch: an open blocker is a finding (Today, assignable), cleared the hour it is done ─────────────────────
create or replace function public.f_onboarding_watch()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_new int := 0; v_cleared int := 0; r record;
begin
  for r in select * from public.v_onboarding_pack where kind = 'blocker' and status <> 'done' loop
    insert into public.agent_findings (detected_at, agent, severity, headline, detail, metric, units, scope, action, drill_to, fingerprint, agent_key)
    select now(), 'Onboarding', 'critical', 'Onboarding blocker: ' || r.item || ' (' || r.progress || ')',
           r.why_it_matters || ' Measured now: ' || r.evidence || '. Unlocks: ' || coalesce(nullif(r.unlocks, ''), '—') || '.',
           r.done_count, 'of ' || r.needed_count, 'BP-13:onboarding:' || r.id, r.what_to_do || ' (' || r.owner_role || ')', coalesce(r.drill_to, 'onboarding_pack'),
           'onboarding|' || r.id, 'watch:onboarding'
    where not exists (select 1 from public.agent_findings f where f.fingerprint = 'onboarding|' || r.id and f.resolved_at is null);
    v_new := v_new + (case when found then 1 else 0 end);
  end loop;
  update public.agent_findings f set resolved_at = now(), resolution = 'cleared by the onboarding watch: the step measured done at ' || now()::text
   where f.agent_key = 'watch:onboarding' and f.resolved_at is null
     and not exists (select 1 from public.v_onboarding_pack p where 'onboarding|' || p.id = f.fingerprint and p.kind = 'blocker' and p.status <> 'done');
  get diagnostics v_cleared = row_count;
  return jsonb_build_object('new', v_new, 'cleared', v_cleared, 'open', (select count(*) from public.v_onboarding_pack where status <> 'done'), 'at', now());
end $$;
revoke all on function public.f_onboarding_watch() from public, anon;
insert into public.agent_registry (agent_key, display_name, kind, what_it_watches, why_it_matters, owner, expected_every_mins, evidence_table, verified_by)
values ('watch:onboarding', 'Onboarding', 'watcher',
        'Every onboarding step the company completes inside the platform, measured from the rows (departments, PINs, pay rates, logins, training sign-offs, the first posted week, the switches).',
        'Owner ruling 14 Sep 2026: the platform is white-label — the company enters its own inputs during onboarding; an open blocker is a finding on Today until it measures done.',
        'Agent I', 60, 'agent_findings', 'select count(*) from agent_findings where agent_key = ''watch:onboarding'' and resolved_at is null;')
on conflict (agent_key) do nothing;
select cron.unschedule(jobid) from cron.job where jobname = 'onboarding-watch';
select cron.schedule('onboarding-watch', '35 * * * *', $$select public.f_onboarding_watch();$$);

-- ── the two sync gaps: the company enters departments and wages in the HR platform; the OS register is the one definition
create or replace function hr.f_assignment_to_os_trigger() returns trigger
language plpgsql security definer set search_path = hr, public as $$
declare v_dept uuid;
begin
  -- depth > 1 means the OS register wrote this assignment (employees → sync_person_from_os → here): do not bounce it back
  if pg_trigger_depth() > 1 then return new; end if;
  if new.status is distinct from 'active' then return new; end if;
  select (n.config->>'os_department_id')::uuid into v_dept from hr.org_nodes n where n.id = new.node_id and n.node_type = 'department';
  if v_dept is null then return new; end if;   -- location / company node: no department to learn
  update public.employees e set primary_department_id = v_dept where e.id = new.person_id and e.primary_department_id is distinct from v_dept;
  return new;
end $$;
drop trigger if exists hr_assignment_to_os on hr.assignments;
create trigger hr_assignment_to_os after insert or update of node_id, status on hr.assignments for each row execute function hr.f_assignment_to_os_trigger();
comment on function hr.f_assignment_to_os_trigger() is 'BP-13: a department set in the HR platform (hr.assignments on a department node) becomes employees.primary_department_id — the one definition the drafter, dashboards and labour cost read.';

create or replace function hr.f_wage_to_os_trigger() returns trigger
language plpgsql security definer set search_path = hr, public as $$
begin
  if pg_trigger_depth() > 1 then return new; end if;
  if new.new_wage is null or new.new_wage <= 0 then return new; end if;
  if not exists (select 1 from public.employees e where e.id = new.person_id) then return new; end if;
  update public.employee_rates r set effective_to = coalesce(new.effective_date, current_date) - 1
   where r.employee_id = new.person_id and r.effective_to is null and coalesce(r.effective_from, r.effective_from_date) < coalesce(new.effective_date, current_date);
  -- a same-day row is replaced rather than stacked
  delete from public.employee_rates r where r.employee_id = new.person_id and r.effective_to is null and coalesce(r.effective_from, r.effective_from_date) = coalesce(new.effective_date, current_date);
  insert into public.employee_rates (employee_id, basis, rate, effective_from, effective_from_date, approved_by, note, provisional, is_placeholder)
  values (new.person_id, 'hourly', new.new_wage, coalesce(new.effective_date, current_date), coalesce(new.effective_date, current_date), new.changed_by,
          'HR platform wage change' || coalesce(': ' || new.note, ''), false, false);
  return new;
end $$;
drop trigger if exists hr_wage_to_os on hr.wage_history;
create trigger hr_wage_to_os after insert on hr.wage_history for each row execute function hr.f_wage_to_os_trigger();
comment on function hr.f_wage_to_os_trigger() is 'BP-13: a wage saved in the HR platform (hr.update_employee_wage → wage_history) becomes the current employee_rates row (hourly, not provisional) — what tg_hourly_rate and the payroll journal read.';

-- ── the pages: Onboarding under Settings; the two Setup forms the steps point at ─────────────────────────────────
insert into public.nav_registry (category, category_order, label, item_order, icon, view_key, table_ref, description, enabled, color, admin_only, subcategory, surface, page_kind, module, archetype)
values ('Settings', 12, 'Onboarding — the company''s steps', 1, 'clipboard', 'onboarding_pack', 'v_onboarding_pack',
        'Every input the company enters during onboarding, measured live from the rows: who does it, why it matters, what to do and the screen that opens. Blockers are findings on Today until they measure done.',
        true, '#2df26a', false, 'General', 'deep', 'report', 'settings', 'issue_queue')
on conflict (view_key) do update set label = excluded.label, table_ref = excluded.table_ref, description = excluded.description, enabled = true, module = excluded.module, archetype = excluded.archetype, category = excluded.category, subcategory = excluded.subcategory, icon = excluded.icon;

insert into public.nav_registry (category, category_order, label, item_order, icon, view_key, table_ref, description, enabled, color, admin_only, subcategory, surface, page_kind, module, archetype)
values ('Human Resources', 9, 'Training matrix', 60, 'book', 'training_matrix', 'employee_department_skill',
        'Who is trained, or in training, in which department — verified by HR. The schedule drafter places only people this matrix says are trained; a person in two or more departments is a floater.',
        true, '#8fa5ff', false, 'People', 'deep', 'report', 'hr', 'data_browser'),
       ('Human Resources', 9, 'Scheduling policy', 61, 'book', 'scheduling_policy', 'scheduling_policy',
        'The rules the schedule drafter obeys — draft/post horizons, rest hours, consecutive days, the floater rule, weekend zones, who signs off. Every rule is a field here; nothing is in code.',
        true, '#8fa5ff', false, 'Time & Scheduling', 'deep', 'report', 'hr', 'data_browser')
on conflict (view_key) do update set label = excluded.label, table_ref = excluded.table_ref, description = excluded.description, enabled = true, module = excluded.module, archetype = excluded.archetype, category = excluded.category, subcategory = excluded.subcategory;

-- the Setup form audits and saves only registered tables: register the two
insert into public.column_roles (role, column_name, priority) values ('owner', 'owner_role', 60), ('detail', 'progress', 90)
on conflict do nothing;

-- Control Tower: one figure — open onboarding steps (blockers first) — appended to v_control_tower
do $do$
declare v_def text;
begin
  v_def := rtrim(pg_get_viewdef('public.v_control_tower'::regclass, true), E'; \n');
  execute 'create or replace view public.v_control_tower as ' || v_def
       || $q$ union all select 'onboarding_blockers_open', (select count(*)::numeric from public.v_onboarding_pack where kind = 'blocker' and status <> 'done')
              union all select 'onboarding_steps_open', (select count(*)::numeric from public.v_onboarding_pack where status <> 'done')$q$;
end $do$;

select public.f_onboarding_watch();
notify pgrst, 'reload schema';;
