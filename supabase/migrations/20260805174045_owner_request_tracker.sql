create table if not exists owner_requests (
  id uuid primary key default gen_random_uuid(),
  seq int,
  requested_on date,
  request text not null,
  verbatim text,
  category text,
  status text not null default 'not_started'
    check (status in ('done','partial','in_progress','not_started','blocked_on_owner','superseded')),
  evidence text,
  gap text,
  priority text default 'P1' check (priority in ('P0','P1','P2')),
  source text default 'chat_parse',
  created_at timestamptz default now()
);
alter table owner_requests enable row level security;
drop policy if exists or_read on owner_requests;
drop policy if exists or_write on owner_requests;
create policy or_read on owner_requests for select to authenticated using (true);
create policy or_write on owner_requests for all to authenticated
  using (exists (select 1 from app_users au where au.user_id = auth.uid() and au.role::text in ('owner','executive','manager')))
  with check (exists (select 1 from app_users au where au.user_id = auth.uid() and au.role::text in ('owner','executive','manager')));
create index if not exists or_status on owner_requests (status, priority);

create or replace view v_request_scorecard as
select status, priority, count(*) as requests,
  round(100.0 * count(*) / nullif((select count(*) from owner_requests),0), 1) as pct_of_all
from owner_requests group by status, priority
union all
select 'ALL REQUESTS', '-', count(*), 100.0 from owner_requests;

insert into nav_registry (category, category_order, label, item_order, icon, view_key, table_ref, description, enabled, admin_only, sync_enabled)
select 'Command', (select category_order from nav_registry where view_key='tower' limit 1),
       v.l, v.io, v.ic, v.vk, v.tr, v.d, true, false, false
from (values
  ('Every Request I Made', 8, 'check', 'owner_requests', 'owner_requests', 'Every single thing the owner has asked for, parsed from the whole conversation - what was asked, when, whether it is done, partly done, not started or waiting on the owner, the evidence it shipped, and what is still missing.'),
  ('Request Scorecard', 9, 'gauge', 'request_scorecard', 'v_request_scorecard', 'The honest count: how many requests are done, partly done, in progress, not started, or blocked waiting on the owner.')
) v(l, io, ic, vk, tr, d)
where not exists (select 1 from nav_registry nr where nr.view_key = v.vk);
select 'tracker ready' as ok;;
