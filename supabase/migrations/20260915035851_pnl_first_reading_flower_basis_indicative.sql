-- BP-6: the first P&L reading on the worksheet cost basis (14 Sep 2026). On the one population both sides can see —
-- 695 Apex-MATCHED manifests carrying 6,625 sold tags — revenue is $2.93M and COGS at the basis is $7.45M; the realised
-- Apex price of bulk flower on those orders is $478–$649/lb against the $1,100/lb basis. $1,100 is the owner's
-- provisional manufacturing average ("FOR NOW USE 1100.00 UNTIL WE GET P&L THEN WE WILL CORRECT", 13 Aug); this is
-- that P&L, and the figure cannot be the grow cost of a pound of bulk flower. The rule is now marked INDICATIVE with
-- the reading in its note, the live P&L says so in words on every row while any active basis rule is indicative, the
-- cost-per-pound page stops describing the valuation rate it no longer uses, and the onboarding step cost.flower_rate
-- opens for the CFO. Nothing posted is rewritten (the journal is append-only); the flag is read, not the history.
-- Two honesty fixes on the onboarding measure: wage counts restricted to active employees (21 + 10 read as more than
-- 27) and a boolean step shows "1 of 1", never "2 of 1".
set search_path = public;

update public.cost_basis_rule
   set indicative = true,
       note = coalesce(note, '') || ' | INDICATIVE since the first P&L reading, 14 Sep 2026: on the 695 Apex-matched manifests the realised bulk-flower price is $478–$649/lb; $1,100/lb is the owner''s provisional manufacturing average, not the grow cost of a pound. Onboarding step cost.flower_rate: the CFO sets the measured cost per pound and clears this flag.',
       updated_at = now()
 where stream = 'Dried flower' and active and key = 'target_cost_per_lb';

create or replace view public.v_pnl_live as
with m as (
  select j.book, date_trunc('month', j.event_at)::date as month, a.kind, a.role, l.side, l.amount, j.indicative
    from public.journal_line l
    join public.journal j on j.id = l.journal_id
    join public.gl_account a on a.code = l.account_code
), b as (
  select exists (select 1 from public.journal j where j.rule_key in ('sold_cogs', 'sold_cogs_bought_in') and j.amount is not null) as has_cost_basis,
         exists (select 1 from public.cost_basis_rule r where r.active and r.indicative) as basis_indicative,
         (select string_agg(r.stream || case when r.item_pattern is not null then ' (' || r.item_pattern || ')' else '' end, ', ' order by r.stream)
            from public.cost_basis_rule r where r.active and r.indicative) as indicative_streams
)
select book, month,
       coalesce(sum(amount) filter (where kind = 'revenue' and side = 'C'), 0) - coalesce(sum(amount) filter (where kind = 'revenue' and side = 'D'), 0) as revenue,
       coalesce(sum(amount) filter (where kind = 'cogs' and side = 'D'), 0) - coalesce(sum(amount) filter (where kind = 'cogs' and side = 'C'), 0) as cogs,
       coalesce(sum(amount) filter (where kind = 'expense' and side = 'D'), 0) - coalesce(sum(amount) filter (where kind = 'expense' and side = 'C'), 0) as expenses,
       case when (select has_cost_basis from b)
            then coalesce(sum(amount) filter (where kind = 'revenue' and side = 'C'), 0) - coalesce(sum(amount) filter (where kind = 'revenue' and side = 'D'), 0)
                 - (coalesce(sum(amount) filter (where kind = 'cogs' and side = 'D'), 0) - coalesce(sum(amount) filter (where kind = 'cogs' and side = 'C'), 0))
            else null end as gross_margin,
       case when (select has_cost_basis from b)
            then coalesce(sum(amount) filter (where kind = 'revenue' and side = 'C'), 0) - coalesce(sum(amount) filter (where kind = 'revenue' and side = 'D'), 0)
                 - (coalesce(sum(amount) filter (where kind = 'cogs' and side = 'D'), 0) - coalesce(sum(amount) filter (where kind = 'cogs' and side = 'C'), 0))
                 - (coalesce(sum(amount) filter (where kind = 'expense' and side = 'D'), 0) - coalesce(sum(amount) filter (where kind = 'expense' and side = 'C'), 0))
            else null end as operating_result,
       coalesce(bool_or(indicative) filter (where kind in ('cogs', 'expense')), false) or (select basis_indicative from b) as cogs_indicative,
       bool_or(indicative) filter (where kind = 'revenue') as revenue_indicative,
       case when (select basis_indicative from b)
            then 'INDICATIVE. Revenue: Apex recognized totals of MATCHED orders (certified, order grain; 794 named orders are unmatched and not here). COGS: the cost basis — the tag''s purchase on file, else the worksheet figure / owner rule for its stream (cost_basis_rule) — and the rule for ' || coalesce((select indicative_streams from b), '?') || ' is marked indicative: the first reading (14 Sep 2026) put COGS at 2.5× revenue on the same manifests and the realised bulk-flower price at $478–$649/lb against the $1,100/lb basis. The CFO confirms the cost per pound (onboarding step cost.flower_rate); until then every margin here is a reading of that provisional figure, not a result.'
            when (select has_cost_basis from b)
            then 'Revenue: Apex recognized totals of MATCHED orders (certified, order grain). COGS: the cost basis — the tag''s purchase on file, else the Manufacturing Production Worksheet figure / owner rule for its stream and item (cost_basis_rule). Expenses: loss at the cost basis; labour and overhead when pay runs and overhead post. Operating result therefore overstates until they do.'
            else 'Revenue: Apex recognized totals of MATCHED orders (certified, order grain). No cost basis has posted yet, so gross_margin and operating_result are NULL. See v_spine_coverage.' end as how_to_read_it
  from m
 group by book, month;
grant select on public.v_pnl_live to authenticated;

create or replace view public.v_cost_per_pound_journal as
with m as (
  select date_trunc('month', j.event_at)::date as month,
         sum(l.amount) filter (where a.role = 'cogs' and l.side = 'D') as cogs_usd,
         sum(l.qty_lb) filter (where a.role = 'cogs' and l.side = 'D') as lb_sold,
         sum(l.amount) filter (where a.role = 'cost' and l.side = 'D') as cost_posted_usd,
         sum(l.qty_lb) filter (where j.event_kind = 'packaged' and a.role = 'inventory' and l.side = 'D') as lb_packaged
    from public.journal_line l
    join public.journal j on j.id = l.journal_id
    join public.gl_account a on a.code = l.account_code
   group by 1
)
select month, cogs_usd, lb_sold,
       case when coalesce(lb_sold, 0) > 0 then round(cogs_usd / lb_sold, 2) end as indicative_cost_per_lb_sold,
       cost_posted_usd, lb_packaged,
       case when coalesce(lb_packaged, 0) > 0 then round(cost_posted_usd / lb_packaged, 2) end as posted_cost_per_lb_packaged,
       case when exists (select 1 from public.cost_basis_rule r where r.active and r.indicative)
            then 'INDICATIVE. cogs_usd is pounds sold × the cost basis (the tag''s purchase on file, else the worksheet figure / owner rule for its stream — cost_basis_rule), and the bulk-flower rule is marked indicative pending the CFO''s cost per pound (onboarding step cost.flower_rate). posted_cost_per_lb_packaged is what the journal has actually posted as cost (labour, loss, supplies, overhead) per pound packaged that month; it becomes the measured cost per pound as real pay rates, purchases and overhead post — the figure the CFO can confirm the basis against.'
            else 'cogs_usd is pounds sold × the cost basis (cost_basis_rule). posted_cost_per_lb_packaged is what the journal has actually posted as cost (labour, loss, supplies, overhead) per pound packaged that month; it becomes the measured cost per pound as pay runs, purchases and overhead post.' end as how_to_read_it
  from m;
grant select on public.v_cost_per_pound_journal to authenticated;

-- onboarding measure: active employees only on the wage step; boolean steps read "1 of 1"
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
  select 'scheduling.first_week', least((select count(*)::int from hr.shifts s where s.status = 'posted' and s.shift_date >= date '2026-09-21' and s.shift_date < date '2026-09-28'), 1), 1,
         (select count(*) from hr.shifts s where s.status = 'posted' and s.shift_date >= date '2026-09-21' and s.shift_date < date '2026-09-28') || ' posted shift(s) in the week of 21 Sep; '
         || (select count(*) from hr.shifts s where s.status = 'draft') || ' in draft'
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

select public.f_onboarding_watch();
notify pgrst, 'reload schema';;
