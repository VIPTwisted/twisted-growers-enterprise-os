-- 0022: whiteboards - real drawing + sticky notes, persisted; collab cursors arrive M4
create table if not exists whiteboards (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_private boolean not null default false,
  content jsonb not null default '{"strokes":[],"notes":[]}',
  created_by uuid not null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
alter table whiteboards enable row level security;
create policy wb_read on whiteboards for select to authenticated
  using ((not is_private) or created_by = auth.uid() or is_executive());
create policy wb_insert on whiteboards for insert to authenticated
  with check (created_by = auth.uid());
create policy wb_update on whiteboards for update to authenticated
  using (created_by = auth.uid() or is_executive()) with check (created_by = auth.uid() or is_executive());
create policy wb_delete on whiteboards for delete to authenticated
  using (created_by = auth.uid() or is_executive());
create trigger audit_whiteboards after insert or update or delete on whiteboards
  for each row execute function audit_row();

insert into nav_registry (category, category_order, item_order, view_key, label, table_ref, milestone, icon, description, enabled, color)
values ('Workspace', 8, 4, 'whiteboards', 'Whiteboards', null, null, 'clip',
  'Sketch it out: named boards with pen drawing and sticky notes, private or shared, saved to the database. Live multi-user cursors arrive with the Work Layer.', true, '#8fa5ff')
on conflict do nothing;;
