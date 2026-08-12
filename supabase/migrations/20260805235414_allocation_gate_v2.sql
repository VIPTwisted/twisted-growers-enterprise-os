alter table allocation_requests add column if not exists stream text;
alter table allocation_requests add column if not exists pounds numeric;

create or replace function tg_allocation_guard()
returns trigger language plpgsql as $$
begin
  if new.status in ('approved','denied') then
    if new.decider_name is null or length(trim(new.decider_name)) = 0 then
      raise exception 'An allocation decision must record who made it.';
    end if;
    if new.status = 'denied' and coalesce(length(trim(new.decision_reason)),0) < 20 then
      raise exception 'Denying an allocation needs a written reason of at least twenty characters.';
    end if;
    new.decided_at := coalesce(new.decided_at, now());
  end if;
  return new;
end $$;
drop trigger if exists allocation_guard on allocation_requests;
create trigger allocation_guard before insert or update on allocation_requests
  for each row execute function tg_allocation_guard();

drop view if exists v_allocation_queue cascade;
create view v_allocation_queue as
select
  r.id, r.request_no, r.status, r.requester_name, r.requester_department,
  r.decider_name, r.decided_at, r.decision_reason,
  r.material_name, r.strain, r.stream, r.source_kind, r.source_ref,
  r.quantity, r.uom, r.pounds, r.destination, r.purpose, r.needed_by, r.priority,
  r.created_at,
  (current_date - r.created_at::date) as days_waiting,
  case
    when r.status = 'pending' and r.needed_by is not null and r.needed_by < current_date
      then 'PAST ITS NEEDED-BY DATE and still not decided'
    when r.status = 'pending' and (current_date - r.created_at::date) > 7
      then 'WAITING OVER A WEEK - this material cannot move until it is decided'
    when r.status = 'pending' then 'Awaiting Vincent'
    when r.status = 'approved' then 'Approved by ' || coalesce(r.decider_name,'?') || ' on ' || coalesce(r.decided_at::date::text,'?')
    when r.status = 'denied' then 'Denied - ' || coalesce(r.decision_reason,'no reason recorded')
    else r.status
  end as position
from allocation_requests r
order by case r.status when 'pending' then 0 else 1 end,
  case when r.needed_by is not null and r.needed_by < current_date then 0 else 1 end,
  r.created_at;

drop view if exists v_unrequested_material cascade;
create view v_unrequested_material as
select s.stream, s.license, s.location, s.lab_state,
  s.packages, s.pounds, s.oldest_days,
  'No approved allocation covers this material. Under the owner rule nothing may move until Vincent approves it.' as why_it_matters
from v_stock_on_hand s
where not exists (
  select 1 from allocation_requests r
  where r.status = 'approved'
    and (coalesce(r.stream,'') = s.stream or coalesce(r.material_name,'') ilike '%'||s.stream||'%')
)
order by s.pounds desc;;
