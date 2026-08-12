create table if not exists allocation_requests (
  id uuid primary key default gen_random_uuid(),
  request_no serial,
  requested_by uuid default auth.uid(),
  requester_name text,
  requester_department text,
  source_kind text not null default 'harvest' check (source_kind in ('harvest','package','lot','purchased','other')),
  source_ref text,
  material_name text not null,
  strain text,
  quantity numeric not null check (quantity > 0),
  uom text not null default 'g',
  destination text not null,
  purpose text,
  needed_by date,
  priority text default 'P2' check (priority in ('P0','P1','P2','P3')),
  status text not null default 'pending' check (status in ('pending','approved','denied','fulfilled','cancelled')),
  decided_by uuid,
  decider_name text,
  decided_at timestamptz,
  decision_reason text,
  approved_quantity numeric,
  fulfilled_at timestamptz,
  fulfilled_note text,
  created_at timestamptz default now()
);
-- A denial must carry a written reason (same discipline as the veto rule)
create or replace function tg_allocation_decision_guard() returns trigger as $$
begin
  if new.status = 'denied' and coalesce(length(trim(new.decision_reason)), 0) < 15 then
    raise exception 'A denial needs a written reason of at least 15 characters so the requester knows why.';
  end if;
  if new.status in ('approved','denied') and old.status = 'pending' then
    new.decided_at := coalesce(new.decided_at, now());
    new.decided_by := coalesce(new.decided_by, auth.uid());
  end if;
  if new.status = 'approved' and new.approved_quantity is null then
    new.approved_quantity := new.quantity;
  end if;
  return new;
end $$ language plpgsql;
drop trigger if exists trg_allocation_decision on allocation_requests;
create trigger trg_allocation_decision before update on allocation_requests
  for each row execute function tg_allocation_decision_guard();
alter table allocation_requests enable row level security;
-- Anyone signed in may request; only owner/executive/manager may decide
create policy ar_read on allocation_requests for select to authenticated using (true);
create policy ar_insert on allocation_requests for insert to authenticated with check (requested_by = auth.uid());
create policy ar_decide on allocation_requests for update to authenticated
  using (exists (select 1 from app_users au where au.user_id = auth.uid() and au.role::text in ('owner','executive','manager')))
  with check (exists (select 1 from app_users au where au.user_id = auth.uid() and au.role::text in ('owner','executive','manager')));
create or replace view v_allocation_queue as
select request_no, created_at::date as requested_on, requester_name, requester_department,
  material_name, strain, quantity, uom, destination, purpose, needed_by, priority, status,
  decider_name, decided_at::date as decided_on, decision_reason, approved_quantity,
  case when status = 'pending' and needed_by is not null and needed_by < current_date then true else false end as overdue,
  case when status = 'pending' then extract(day from now() - created_at)::int end as days_waiting,
  source_kind, source_ref, id
from allocation_requests order by
  case status when 'pending' then 0 when 'approved' then 1 else 2 end,
  case priority when 'P0' then 0 when 'P1' then 1 when 'P2' then 2 else 3 end,
  created_at;
insert into nav_registry (category, category_order, label, item_order, icon, view_key, table_ref, description, enabled, admin_only, sync_enabled)
select 'Inventory', (select category_order from nav_registry where category='Inventory' limit 1),
  'Allocation Requests', 12, 'scale', 'allocation_requests', null,
  'Request material and approve or deny it: cultivation and production ask, an approver decides with a written reason, and every decision is on the record.', true, false, false
where not exists (select 1 from nav_registry where view_key = 'allocation_requests');;
