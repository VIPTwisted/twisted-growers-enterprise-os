-- Applied prod 20260905144745. Do not re-apply.
-- Reconstructs public.room_stage as observed live 5 Sep 2026.
-- 16 ruled rooms. No seed rewrite. No DROP.

create table if not exists public.room_stage (
  license text not null,
  location text not null,
  stage text not null,
  ruled_by text not null,
  ruled_at timestamptz not null default now(),
  note text,
  primary key (license, location),
  constraint room_stage_stage_check check (stage = any (array['FINISHED'::text, 'WIP'::text, 'RAW'::text, 'QUARANTINE'::text, 'TRANSIT'::text]))
);

alter table public.room_stage enable row level security;

do $body$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'room_stage' and policyname = 'room_stage_read'
  ) then
    create policy room_stage_read on public.room_stage for select using (true);
  end if;
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'room_stage' and policyname = 'room_stage_admin_write'
  ) then
    create policy room_stage_admin_write on public.room_stage for all
      using (f_caller_is_admin()) with check (f_caller_is_admin());
  end if;
end
$body$;
