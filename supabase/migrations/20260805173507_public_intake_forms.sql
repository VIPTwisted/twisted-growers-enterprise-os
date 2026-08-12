-- Public intake forms: form definitions and collected responses.

create table if not exists public.forms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  target text not null default 'tasks',
  fields jsonb not null default '[]'::jsonb,
  public_token text unique default encode(extensions.gen_random_bytes(12), 'hex'),
  active boolean default true,
  created_by uuid default auth.uid(),
  created_at timestamptz default now()
);

create table if not exists public.form_responses (
  id uuid primary key default gen_random_uuid(),
  form_id uuid references public.forms(id) on delete cascade,
  payload jsonb not null,
  submitted_by text,
  created_at timestamptz default now(),
  converted_task_id uuid
);

create index if not exists form_responses_form_id_idx on public.form_responses (form_id);
create index if not exists form_responses_created_at_idx on public.form_responses (created_at desc);

alter table public.forms enable row level security;
alter table public.form_responses enable row level security;

-- Read: any signed in staff member.
drop policy if exists forms_read on public.forms;
create policy forms_read on public.forms
  for select to authenticated using (true);

drop policy if exists form_responses_read on public.form_responses;
create policy form_responses_read on public.form_responses
  for select to authenticated using (true);

-- Write: executives and managers only.
drop policy if exists forms_manager_insert on public.forms;
create policy forms_manager_insert on public.forms
  for insert to authenticated
  with check (current_app_role() in ('owner','executive','planner','dept_head'));

drop policy if exists forms_manager_update on public.forms;
create policy forms_manager_update on public.forms
  for update to authenticated
  using (current_app_role() in ('owner','executive','planner','dept_head'))
  with check (current_app_role() in ('owner','executive','planner','dept_head'));

drop policy if exists forms_manager_delete on public.forms;
create policy forms_manager_delete on public.forms
  for delete to authenticated
  using (current_app_role() in ('owner','executive','planner','dept_head'));

drop policy if exists form_responses_manager_insert on public.form_responses;
create policy form_responses_manager_insert on public.form_responses
  for insert to authenticated
  with check (current_app_role() in ('owner','executive','planner','dept_head'));

drop policy if exists form_responses_manager_update on public.form_responses;
create policy form_responses_manager_update on public.form_responses
  for update to authenticated
  using (current_app_role() in ('owner','executive','planner','dept_head'))
  with check (current_app_role() in ('owner','executive','planner','dept_head'));

drop policy if exists form_responses_manager_delete on public.form_responses;
create policy form_responses_manager_delete on public.form_responses
  for delete to authenticated
  using (current_app_role() in ('owner','executive','planner','dept_head'));
;
