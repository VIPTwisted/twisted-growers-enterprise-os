-- 0023: personal time tracking (topbar stopwatch); payroll timesheet wiring comes with the Work Layer
create table if not exists time_tracks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  seconds integer not null,
  note text,
  created_at timestamptz not null default now()
);
alter table time_tracks enable row level security;
create policy own_rw on time_tracks for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy exec_read on time_tracks for select using (is_executive());;
