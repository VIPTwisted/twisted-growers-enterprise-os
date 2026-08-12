-- The browser cannot call http://127.0.0.1 from an https page. So the OS posts a
-- job here, the bridge polls for it, answers, and writes the answer back.
create table if not exists ai_bridge_jobs (
  id bigserial primary key,
  asked_by uuid default auth.uid(),
  question text not null,
  context jsonb,
  status text not null default 'pending' check (status in ('pending','running','done','error')),
  answer text,
  error text,
  seconds int,
  claimed_at timestamptz,
  answered_at timestamptz,
  created_at timestamptz not null default now()
);
alter table ai_bridge_jobs enable row level security;
drop policy if exists abj_own on ai_bridge_jobs;
create policy abj_own on ai_bridge_jobs for all to authenticated
  using (asked_by = auth.uid() or exists (select 1 from app_users u where u.user_id=auth.uid() and u.role in ('owner','executive')))
  with check (asked_by = auth.uid());
create index if not exists abj_pending on ai_bridge_jobs (status, created_at);

-- The bridge checks in here so the OS knows it is alive.
create table if not exists ai_bridge_heartbeat (
  machine text primary key,
  last_seen timestamptz not null default now(),
  operator uuid,
  version text
);
alter table ai_bridge_heartbeat enable row level security;
drop policy if exists abh_read on ai_bridge_heartbeat;
create policy abh_read on ai_bridge_heartbeat for select to authenticated using (true);
drop policy if exists abh_write on ai_bridge_heartbeat;
create policy abh_write on ai_bridge_heartbeat for all to authenticated using (true) with check (true);

drop view if exists v_bridge_status cascade;
create view v_bridge_status as
select machine, last_seen, version,
  (now() - last_seen) < interval '90 seconds' as online,
  extract(epoch from (now() - last_seen))::int as seconds_since
from ai_bridge_heartbeat order by last_seen desc;;
