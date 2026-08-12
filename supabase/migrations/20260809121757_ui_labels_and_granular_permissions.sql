-- EVERY WORD ON SCREEN IS A ROW.
-- Owner, 8 Aug 2026: buttons, section names, everything customisable for
-- payroll, and permissions built the same way for every user type.
-- A label hardcoded in JSX needs a developer and a deploy to change. A label
-- in a table needs a manager and ten seconds.

create table if not exists public.ui_labels (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique,
  surface     text not null default 'hr',
  page_key    text,
  kind        text not null default 'label'
              check (kind in ('page_title','section','button','field','tooltip','empty_state','label','help')),
  label       text not null,
  help_text   text,
  visible     boolean not null default true,
  sort_order  integer default 0,
  updated_by  uuid references auth.users(id),
  updated_at  timestamptz not null default now()
);
create index if not exists uilabels_page_idx on public.ui_labels(surface, page_key, kind);
comment on table public.ui_labels is
  'Every user-facing string, keyed. The UI reads its wording from here and falls '
  'back to its built-in text when a key is absent, so nothing breaks if a row is '
  'missing. visible=false hides the control entirely — a button nobody should press '
  'is better removed than disabled.';

-- Seed the payroll surface with the keys the module actually uses, so there is
-- something to edit rather than an empty table nobody knows how to populate.
insert into public.ui_labels (key, surface, page_key, kind, label, help_text) values
 ('payroll.page.title','hr','pay_runs','page_title','Pay Runs','Heading on the payroll batches page'),
 ('payroll.section.open','hr','pay_runs','section','Open runs',null),
 ('payroll.section.history','hr','pay_runs','section','Paid history',null),
 ('payroll.btn.new_run','hr','pay_runs','button','Start a pay run',null),
 ('payroll.btn.review','hr','pay_runs','button','Send for review',null),
 ('payroll.btn.approve','hr','pay_runs','button','Approve run','Approving locks the run; a correction becomes a new run'),
 ('payroll.btn.export_qbo','hr','pay_runs','button','Export to QuickBooks',null),
 ('payroll.btn.mark_paid','hr','pay_runs','button','Mark as paid',null),
 ('payroll.btn.void','hr','pay_runs','button','Void run',null),
 ('payroll.field.gross','hr','pay_runs','field','Gross',null),
 ('payroll.field.net','hr','pay_runs','field','Net pay',null),
 ('payroll.field.employer_tax','hr','pay_runs','field','Employer taxes',null),
 ('payroll.field.total_cost','hr','pay_runs','field','Total cost to company',null),
 ('payroll.empty.no_runs','hr','pay_runs','empty_state','No pay runs yet','A run appears here once payroll is started for a period'),
 ('payroll.section.280e','hr','payroll_journal','section','280E cost segregation',
  'Production labour is deductible cost of goods sold; selling and administrative labour is not'),
 ('payroll.field.cogs','hr','payroll_journal','field','Deductible (COGS)',null),
 ('payroll.field.disallowed','hr','payroll_journal','field','Disallowed under 280E',null),
 ('payroll.btn.upload_report','hr','payroll_imports','button','Upload payroll report',null),
 ('payroll.btn.map_agents','hr','qbo_employee_map','button','Map employees',null),
 ('pto.page.title','hr','employee_pto','page_title','Time off balances',null),
 ('pto.btn.request','hr','time_off_requests','button','Request time off',null),
 ('pto.btn.approve','hr','time_off_requests','button','Approve',null),
 ('pto.btn.deny','hr','time_off_requests','button','Deny',null),
 ('sched.btn.post','hr','schedule_drafts','button','Post schedule','Only a person may post; an agent may only draft'),
 ('sched.btn.draft_ai','hr','schedule_drafts','button','Draft with AI',null),
 ('sched.btn.claim','hr','open_shifts','button','Claim this shift',null),
 ('sched.btn.callout','hr','callouts','button','Call out',null)
on conflict (key) do nothing;

-- ── PERMISSIONS, the same way: rows, per role, per page, per action. ──
create table if not exists public.page_permissions (
  id         uuid primary key default gen_random_uuid(),
  role       text not null,
  view_key   text not null,
  can_view   boolean not null default false,
  can_edit   boolean not null default false,
  can_approve boolean not null default false,
  can_export boolean not null default false,
  can_delete boolean not null default false,
  field_mask text[],
  note       text,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  unique (role, view_key)
);
create index if not exists pageperm_role_idx on public.page_permissions(role);
comment on table public.page_permissions is
  'One row per role per page. can_approve is deliberately separate from can_edit — '
  'preparing a pay run and approving it should not be the same right. field_mask '
  'names columns that role must never see, so a manager can open a roster without '
  'seeing wages.';

-- Every role, every HR page, defaulting to no access. Nothing is granted by
-- being forgotten; access has to be switched on deliberately.
insert into public.page_permissions (role, view_key, can_view, can_edit, can_approve, can_export)
select r.role, n.view_key,
       case when r.role in ('owner','executive','admin','hr') then true
            when r.role = 'cfo'     then true
            when r.role = 'manager' then n.subcategory in ('Time & Scheduling','Live','Documents','People')
            else false end,
       case when r.role in ('owner','executive','admin','hr') then true
            when r.role = 'manager' then n.subcategory = 'Time & Scheduling'
            else false end,
       case when r.role in ('owner','hr','admin') then true
            when r.role = 'cfo' and n.subcategory = 'Payroll & Budget' then true
            else false end,
       case when r.role in ('owner','executive','admin','hr','cfo') then true else false end
from (select unnest(enum_range(null::app_role))::text as role) r
cross join (select view_key, subcategory from public.nav_registry
             where enabled and surface='hr') n
on conflict (role, view_key) do nothing;

-- Wages never leave the payroll pages. A manager may open the roster and see
-- who works where; they may not see what anyone is paid.
update public.page_permissions
   set field_mask = array['rate','ot_multiplier','burden_pct','loaded_weekly_cost',
                          'annualized_loaded_cost','base_weekly_cost','amount','gross',
                          'net','ot_cost_loaded','straight_cost_loaded','total_cost_loaded',
                          'cost_so_far_loaded','paid_for_unworked_loaded']
 where role in ('manager','dept_head','assistant_manager','planner','staff','employee','readonly');

alter table public.ui_labels        enable row level security;
alter table public.page_permissions enable row level security;

create policy uilabel_read on public.ui_labels for select to authenticated using (true);
create policy uilabel_write on public.ui_labels for all to authenticated
  using (public.f_can_decide_hr()) with check (public.f_can_decide_hr());
create policy pageperm_read on public.page_permissions for select to authenticated using (true);
create policy pageperm_write on public.page_permissions for all to authenticated
  using (public.f_caller_is_admin()) with check (public.f_caller_is_admin());

grant select on public.ui_labels, public.page_permissions to authenticated;
grant insert, update, delete on public.ui_labels to authenticated;
grant insert, update, delete on public.page_permissions to authenticated;

insert into public.nav_registry
 (category, category_order, label, item_order, icon, view_key, table_ref,
  description, enabled, color, admin_only, surface, subcategory, page_kind,
  date_policy, default_range, range_kind)
values
 ('Human Resources',7,'Labels & Wording',48,'clip','ui_labels','ui_labels',
  'Every button, section name, field label, tooltip and empty state in the HR module. Change the wording here and it changes on screen — no deploy. Hide a control by setting visible to false.',
  true,'#57a9ff',true,'hr','Settings','report','not_applicable',null,'snapshot'),
 ('Human Resources',7,'Page Permissions',49,'shield','page_permissions','page_permissions',
  'One row per role per page: view, edit, approve, export, delete. Approving a pay run is a separate right from preparing one. field_mask keeps wages inside payroll — a manager sees the roster, never the rates.',
  true,'#ff4245',true,'hr','Settings','report','not_applicable',null,'snapshot')
on conflict do nothing;;
