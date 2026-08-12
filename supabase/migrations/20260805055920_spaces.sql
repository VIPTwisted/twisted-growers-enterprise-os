-- 0028: Spaces - work containers, pre-seeded per doctrine (no blank-workspace setup)
create table if not exists spaces (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  color text default '#2df26a',
  is_private boolean not null default false,
  statuses jsonb not null default '["todo","in_progress","blocked","done"]',
  description text,
  owner_id uuid,
  created_at timestamptz not null default now()
);
alter table spaces enable row level security;
create policy read_visible on spaces for select to authenticated
  using ((not is_private) or owner_id = auth.uid() or is_executive());
create policy exec_all on spaces for all using (is_executive()) with check (is_executive());
create trigger audit_spaces after insert or update or delete on spaces
  for each row execute function audit_row();

alter table tasks add column if not exists space_id uuid references spaces(id);

insert into spaces (name, color, description) values
('Company', '#2df26a', 'Whole-company work: cross-department initiatives, OKRs, and anything that belongs to everyone.'),
('Cultivation', '#5cff92', 'Grow-side work: rooms, cycles, IPM, harvest crews.'),
('Manufacturing', '#ffea00', 'Extraction and production work: batches, lines, maintenance.'),
('Infused Pre-Rolls & Flower', '#b8f22d', 'Pre-roll and flower production work.'),
('Packaging', '#00d4ff', 'Packaging, labeling, and finished-goods work.'),
('Quality & Compliance', '#ff8a00', 'COAs, CAPAs, audits, SOPs, and inspection readiness.'),
('Sales & Marketing', '#e2bd63', 'Buyer outreach, drops, menus, campaigns.'),
('Human Resources', '#b026ff', 'Hiring, onboarding, schedules, employee files.')
on conflict (name) do nothing;

insert into nav_registry (category, category_order, item_order, view_key, label, table_ref, milestone, icon, description, enabled, color)
values ('Workspace', 8, 0, 'spaces', 'Spaces', 'spaces', null, 'box',
  'Work containers, pre-built for TG: one per department plus Company - each with its own pipeline statuses from the workspace preset. Tasks, docs, and boards file into spaces; sharing and required views ride the permissions layer.', true, '#8fa5ff')
on conflict do nothing;;
