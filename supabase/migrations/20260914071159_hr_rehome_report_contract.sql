-- Agent I, 14 Sep 2026. Record and repair the report-contract breach created by
-- the owner-approved HR re-home after PR #260 reached production.
--
-- MEASURED BEFORE THIS MIGRATION (read-only, 14 Sep 2026):
--   * 20 enabled rows were page_kind='report', surface='side', report_group NULL.
--   * check:reportcontract therefore read I4=20 against the locked baseline of 0.
--   * the re-home itself is intentional and stays exactly as it is: Finance / Settings,
--     the named subcategories, side-rail placement, labels and ordering are not changed.
--   * Pay Runs is the one purpose-built console in this population. App.jsx routes
--     pay_runs to <PayRuns>, and 20260811034758 registered it as page_kind='custom'.
--
-- Existing report taxonomy is reused rather than expanded: Finance reports answer
-- Money & Margin; Settings reports answer Platform & IT. No label, layout, control,
-- provider, permission or HR-platform row is changed here.

begin;
set local app.agent = 'agent-i';

-- Hold the population stable from preflight through postcondition. Reads continue;
-- concurrent nav writes wait rather than slipping a new I4 breach past the assertion.
lock table public.nav_registry in share row exclusive mode;

create temporary table hr_rehome_report_contract (
  id uuid primary key,
  view_key text not null unique,
  expected_label text not null,
  expected_item_order integer not null,
  expected_category text not null,
  expected_category_order integer not null,
  expected_subcategory text not null,
  expected_surface text not null,
  expected_page_kind text not null,
  expected_report_group text,
  new_page_kind text not null,
  new_report_group text
) on commit drop;

insert into pg_temp.hr_rehome_report_contract values
  ('29b547d0-edbe-47e4-9502-774d71931efe', 'plan_payroll',        'Payroll Forecast',            2, 'Finance',  0, 'Payroll (280E)',  'side', 'report', null, 'report', 'Money & Margin'),
  ('6cd4e794-0114-4847-a990-7b30e41fb192', 'labor_budgets',      'Labor Budgets',               3, 'Finance',  0, 'Payroll (280E)',  'side', 'report', null, 'report', 'Money & Margin'),
  ('cf7870ce-f746-4f72-a33c-8878d4f38cde', 'dept_labour',        'Department Labour',          18, 'Finance',  0, 'Payroll (280E)',  'side', 'report', null, 'report', 'Money & Margin'),
  ('5a01d0ac-2e06-4fa5-bf19-fd7578e2bc1f', 'pay_runs',           'Pay Runs',                   20, 'Finance',  0, 'Payroll (280E)',  'side', 'report', null, 'custom', null),
  ('1aa0abb6-1b04-486b-b974-59f91bf221c6', 'pay_run_lines',      'Pay Run Detail',             21, 'Finance',  0, 'Payroll (280E)',  'side', 'report', null, 'report', 'Money & Margin'),
  ('382648d9-a350-4497-ad9b-867d896b6d8d', 'payroll_journal',    'Payroll Journal (280E)',     22, 'Finance',  0, 'Payroll (280E)',  'side', 'report', null, 'report', 'Money & Margin'),
  ('b4741cce-cd6c-42ae-9268-2a08cb0a310d', 'payroll_ytd',        'Year to Date',               23, 'Finance',  0, 'Payroll (280E)',  'side', 'report', null, 'report', 'Money & Margin'),
  ('768f89fd-eb14-48a3-93da-434a3be796ac', 'earning_codes',      'Earning Codes',              24, 'Finance',  0, 'Payroll (280E)',  'side', 'report', null, 'report', 'Money & Margin'),
  ('4ba87c5f-1a2e-4ac9-83ee-ac51ac09c720', 'deduction_codes',    'Deduction Codes',            25, 'Finance',  0, 'Payroll (280E)',  'side', 'report', null, 'report', 'Money & Margin'),
  ('5d4745e7-36a3-49b6-b4f8-dbd602726686', 'tax_profiles',       'Tax Profiles',               26, 'Finance',  0, 'Payroll (280E)',  'side', 'report', null, 'report', 'Money & Margin'),
  ('3541ebbd-23d7-4498-82fb-3ce36fc1ab85', 'cost_classes',       'Cost Classes (280E)',        35, 'Finance',  0, 'Payroll (280E)',  'side', 'report', null, 'report', 'Money & Margin'),
  ('b712a051-8b98-4f7b-82ce-259d130dbea5', 'labour_forecast',    'Labour Forecast',            47, 'Finance',  0, 'Payroll (280E)',  'side', 'report', null, 'report', 'Money & Margin'),
  ('692631a3-380a-4889-8c66-acb385e71876', 'hr_delivery',        'Message Delivery',           52, 'Settings', 12, 'Alerts',          'side', 'report', null, 'report', 'Platform & IT'),
  ('dd6e790e-df52-4b6c-8d63-e3f3c91657e7', 'hr_message_recipient','Message Recipients',         53, 'Settings', 12, 'Alerts',          'side', 'report', null, 'report', 'Platform & IT'),
  ('c5517a72-ccde-4104-b3b1-8bd8e2d269f3', 'punch_queue',        'Offline Punch Queue',        65, 'Settings', 12, 'Devices & Clock', 'side', 'report', null, 'report', 'Platform & IT'),
  ('fdc87d38-5fc0-4d11-9f1b-bee20cda8a85', 'clock_readiness',    'Clock Readiness',            68, 'Settings', 12, 'Devices & Clock', 'side', 'report', null, 'report', 'Platform & IT'),
  ('d2f3ff77-0986-4b71-b2b3-bf1dcab75de5', 'qbo_account_map',    'QuickBooks Accounts',        32, 'Settings', 12, 'Integrations',    'side', 'report', null, 'report', 'Platform & IT'),
  ('11f3bfe1-ee06-48ef-ac8f-19b94bf57890', 'qbo_employee_map',   'QuickBooks Employee Map',    33, 'Settings', 12, 'Integrations',    'side', 'report', null, 'report', 'Platform & IT'),
  ('0ec67901-ba25-4ea9-a389-69c18279145b', 'payroll_imports',    'Payroll Imports',            34, 'Settings', 12, 'Integrations',    'side', 'report', null, 'report', 'Platform & IT'),
  ('e2409707-d177-473e-9e7d-ea053df086e0', 'hr_external_task',   'ClickUp Outbox',             54, 'Settings', 12, 'Integrations',    'side', 'report', null, 'report', 'Platform & IT');

do $$
declare
  v_allowlist integer;
  v_live_i4 integer;
  v_exact integer;
begin
  select count(*) into v_allowlist from pg_temp.hr_rehome_report_contract;
  if v_allowlist <> 20 then
    raise exception 'HR report-contract preflight refused: allowlist has %, expected 20', v_allowlist;
  end if;

  select count(*) into v_live_i4
    from public.nav_registry
   where enabled
     and page_kind = 'report'
     and surface = 'side'
     and report_group is null;
  if v_live_i4 <> 20 then
    raise exception 'HR report-contract preflight refused: live I4 population is %, expected 20', v_live_i4;
  end if;

  select count(*) into v_exact
    from public.nav_registry n
    join pg_temp.hr_rehome_report_contract e
      on e.id = n.id and e.view_key = n.view_key
   where n.enabled
     and n.label = e.expected_label
     and n.item_order = e.expected_item_order
     and n.category = e.expected_category
     and n.category_order = e.expected_category_order
     and n.subcategory = e.expected_subcategory
     and n.surface = e.expected_surface
     and n.page_kind = e.expected_page_kind
     and n.report_group is not distinct from e.expected_report_group;
  if v_exact <> 20 then
    raise exception 'HR report-contract preflight refused: only % of 20 rows match the measured state', v_exact;
  end if;

  if exists (
    select 1
      from public.nav_registry n
     where n.enabled and n.page_kind = 'report' and n.surface = 'side'
       and n.report_group is null
       and not exists (
         select 1 from pg_temp.hr_rehome_report_contract e
          where e.id = n.id and e.view_key = n.view_key
       )
  ) then
    raise exception 'HR report-contract preflight refused: live I4 contains a row outside the exact allowlist';
  end if;
end $$;

do $$
declare
  v_report_updates integer;
  v_custom_updates integer;
begin
  update public.nav_registry n
     set report_group = e.new_report_group
    from pg_temp.hr_rehome_report_contract e
   where n.id = e.id
     and n.view_key = e.view_key
     and e.new_page_kind = 'report'
     and n.enabled
     and n.category = e.expected_category
     and n.subcategory = e.expected_subcategory
     and n.surface = e.expected_surface
     and n.page_kind = e.expected_page_kind
     and n.report_group is not distinct from e.expected_report_group;
  get diagnostics v_report_updates = row_count;
  if v_report_updates <> 19 then
    raise exception 'HR report-contract update refused: changed % reports, expected 19', v_report_updates;
  end if;

  update public.nav_registry n
     set page_kind = e.new_page_kind,
         report_group = e.new_report_group
    from pg_temp.hr_rehome_report_contract e
   where n.id = e.id
     and n.view_key = e.view_key
     and e.new_page_kind = 'custom'
     and n.enabled
     and n.category = e.expected_category
     and n.subcategory = e.expected_subcategory
     and n.surface = e.expected_surface
     and n.page_kind = e.expected_page_kind
     and n.report_group is not distinct from e.expected_report_group;
  get diagnostics v_custom_updates = row_count;
  if v_custom_updates <> 1 then
    raise exception 'HR report-contract update refused: changed % custom pages, expected 1', v_custom_updates;
  end if;
end $$;

do $$
declare
  v_exact integer;
  v_i4 integer;
begin
  -- Re-home and locked navigation fields must be byte-for-byte unchanged. updated_at is
  -- intentionally omitted because the existing touch_nav_registry trigger advances it.
  select count(*) into v_exact
    from public.nav_registry n
    join pg_temp.hr_rehome_report_contract e
      on e.id = n.id and e.view_key = n.view_key
   where n.enabled
     and n.label = e.expected_label
     and n.item_order = e.expected_item_order
     and n.category = e.expected_category
     and n.category_order = e.expected_category_order
     and n.subcategory = e.expected_subcategory
     and n.surface = e.expected_surface
     and n.page_kind = e.new_page_kind
     and n.report_group is not distinct from e.new_report_group;
  if v_exact <> 20 then
    raise exception 'HR report-contract postcondition failed: only % of 20 rows match the intended state', v_exact;
  end if;

  select count(*) into v_i4
    from public.nav_registry
   where enabled
     and page_kind = 'report'
     and surface = 'side'
     and report_group is null;
  if v_i4 <> 0 then
    raise exception 'HR report-contract postcondition failed: I4 is %, expected 0', v_i4;
  end if;
end $$;

commit;

/*
EXACT GUARDED ROLLBACK — place in a later timestamped migration only; never run inline.
This intentionally restores the 20-row pre-migration state and therefore restores I4=20.
The nav_registry_audit trigger preserves both directions. Do not touch the HR re-home fields.

begin;
set local app.agent = 'agent-i';
lock table public.nav_registry in share row exclusive mode;

do $$
declare v_exact integer;
begin
  select count(*) into v_exact
    from public.nav_registry
   where enabled and category = 'Finance' and category_order = 0
     and subcategory = 'Payroll (280E)' and surface = 'side'
     and page_kind = 'report' and report_group = 'Money & Margin'
     and (id, view_key) in (
       ('29b547d0-edbe-47e4-9502-774d71931efe'::uuid, 'plan_payroll'),
       ('6cd4e794-0114-4847-a990-7b30e41fb192'::uuid, 'labor_budgets'),
       ('cf7870ce-f746-4f72-a33c-8878d4f38cde'::uuid, 'dept_labour'),
       ('1aa0abb6-1b04-486b-b974-59f91bf221c6'::uuid, 'pay_run_lines'),
       ('382648d9-a350-4497-ad9b-867d896b6d8d'::uuid, 'payroll_journal'),
       ('b4741cce-cd6c-42ae-9268-2a08cb0a310d'::uuid, 'payroll_ytd'),
       ('768f89fd-eb14-48a3-93da-434a3be796ac'::uuid, 'earning_codes'),
       ('4ba87c5f-1a2e-4ac9-83ee-ac51ac09c720'::uuid, 'deduction_codes'),
       ('5d4745e7-36a3-49b6-b4f8-dbd602726686'::uuid, 'tax_profiles'),
       ('3541ebbd-23d7-4498-82fb-3ce36fc1ab85'::uuid, 'cost_classes'),
       ('b712a051-8b98-4f7b-82ce-259d130dbea5'::uuid, 'labour_forecast')
     )
  or enabled and category = 'Settings' and category_order = 12
     and subcategory in ('Alerts', 'Devices & Clock', 'Integrations') and surface = 'side'
     and page_kind = 'report' and report_group = 'Platform & IT'
     and (id, view_key) in (
       ('692631a3-380a-4889-8c66-acb385e71876'::uuid, 'hr_delivery'),
       ('dd6e790e-df52-4b6c-8d63-e3f3c91657e7'::uuid, 'hr_message_recipient'),
       ('c5517a72-ccde-4104-b3b1-8bd8e2d269f3'::uuid, 'punch_queue'),
       ('fdc87d38-5fc0-4d11-9f1b-bee20cda8a85'::uuid, 'clock_readiness'),
       ('d2f3ff77-0986-4b71-b2b3-bf1dcab75de5'::uuid, 'qbo_account_map'),
       ('11f3bfe1-ee06-48ef-ac8f-19b94bf57890'::uuid, 'qbo_employee_map'),
       ('0ec67901-ba25-4ea9-a389-69c18279145b'::uuid, 'payroll_imports'),
       ('e2409707-d177-473e-9e7d-ea053df086e0'::uuid, 'hr_external_task')
     )
  or enabled and id = '5a01d0ac-2e06-4fa5-bf19-fd7578e2bc1f'::uuid
     and view_key = 'pay_runs' and category = 'Finance' and category_order = 0
     and subcategory = 'Payroll (280E)' and surface = 'side'
     and page_kind = 'custom' and report_group is null;
  if v_exact <> 20 then
    raise exception 'HR report-contract rollback refused: only % of 20 rows match the migration output', v_exact;
  end if;
end $$;

do $$
declare v_reports integer; v_custom integer; v_i4 integer;
begin
  update public.nav_registry
     set report_group = null
   where page_kind = 'report'
     and report_group in ('Money & Margin', 'Platform & IT')
     and (id, view_key) in (
       ('29b547d0-edbe-47e4-9502-774d71931efe'::uuid, 'plan_payroll'),
       ('6cd4e794-0114-4847-a990-7b30e41fb192'::uuid, 'labor_budgets'),
       ('cf7870ce-f746-4f72-a33c-8878d4f38cde'::uuid, 'dept_labour'),
       ('1aa0abb6-1b04-486b-b974-59f91bf221c6'::uuid, 'pay_run_lines'),
       ('382648d9-a350-4497-ad9b-867d896b6d8d'::uuid, 'payroll_journal'),
       ('b4741cce-cd6c-42ae-9268-2a08cb0a310d'::uuid, 'payroll_ytd'),
       ('768f89fd-eb14-48a3-93da-434a3be796ac'::uuid, 'earning_codes'),
       ('4ba87c5f-1a2e-4ac9-83ee-ac51ac09c720'::uuid, 'deduction_codes'),
       ('5d4745e7-36a3-49b6-b4f8-dbd602726686'::uuid, 'tax_profiles'),
       ('3541ebbd-23d7-4498-82fb-3ce36fc1ab85'::uuid, 'cost_classes'),
       ('b712a051-8b98-4f7b-82ce-259d130dbea5'::uuid, 'labour_forecast'),
       ('692631a3-380a-4889-8c66-acb385e71876'::uuid, 'hr_delivery'),
       ('dd6e790e-df52-4b6c-8d63-e3f3c91657e7'::uuid, 'hr_message_recipient'),
       ('c5517a72-ccde-4104-b3b1-8bd8e2d269f3'::uuid, 'punch_queue'),
       ('fdc87d38-5fc0-4d11-9f1b-bee20cda8a85'::uuid, 'clock_readiness'),
       ('d2f3ff77-0986-4b71-b2b3-bf1dcab75de5'::uuid, 'qbo_account_map'),
       ('11f3bfe1-ee06-48ef-ac8f-19b94bf57890'::uuid, 'qbo_employee_map'),
       ('0ec67901-ba25-4ea9-a389-69c18279145b'::uuid, 'payroll_imports'),
       ('e2409707-d177-473e-9e7d-ea053df086e0'::uuid, 'hr_external_task')
     );
  get diagnostics v_reports = row_count;
  if v_reports <> 19 then
    raise exception 'HR report-contract rollback refused: restored % reports, expected 19', v_reports;
  end if;

  update public.nav_registry
     set page_kind = 'report', report_group = null
   where id = '5a01d0ac-2e06-4fa5-bf19-fd7578e2bc1f'::uuid
     and view_key = 'pay_runs' and enabled
     and category = 'Finance' and category_order = 0
     and subcategory = 'Payroll (280E)' and surface = 'side'
     and page_kind = 'custom' and report_group is null;
  get diagnostics v_custom = row_count;
  if v_custom <> 1 then
    raise exception 'HR report-contract rollback refused: restored % custom pages, expected 1', v_custom;
  end if;

  select count(*) into v_i4
    from public.nav_registry
   where enabled and page_kind = 'report' and surface = 'side' and report_group is null;
  if v_i4 <> 20 then
    raise exception 'HR report-contract rollback postcondition failed: I4 is %, expected 20', v_i4;
  end if;
end $$;

commit;
*/

;
