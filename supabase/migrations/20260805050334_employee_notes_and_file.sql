-- 0017: employee notes + the spine of the CCC-required employee file
create table if not exists employee_notes (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id),
  category text not null default 'general'
    check (category in ('general','performance','disciplinary','training','attendance','safety','compliance','recognition')),
  note text not null,
  author_id uuid,
  created_at timestamptz not null default now()
);
alter table employee_notes enable row level security;
create policy exec_all on employee_notes for all using (is_executive()) with check (is_executive());
create trigger audit_employee_notes after insert or update or delete on employee_notes
  for each row execute function audit_row();

insert into actions_register (title, priority, source, note, status) values
('Build CCC-compliant employee file per person: notes, documents, badges, training, discipline', 'P0', 'owner_directive',
 'Owner 2026-08-05: true employee file on each person as CCC requires - agent badge + expiry (columns exist), training evidence, disciplinary log (employee_notes live, exec-only RLS), document storage (offer letters, certs), attendance record. Needs employee detail page + note entry UI + storage bucket.', 'open'),
('Profile photo upload for user avatars', 'P1', 'owner_directive',
 'Owner 2026-08-05: topbar avatar should be the user profile image with an upload path. Needs Supabase Storage bucket (avatars, RLS per-user) + Settings upload UI + user_settings.avatar_url.', 'open')
on conflict do nothing;;
