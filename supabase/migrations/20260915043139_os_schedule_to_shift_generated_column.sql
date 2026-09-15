-- BP-5-5: hr.shifts.crosses_midnight is a GENERATED column; the bridge tried to write it and the first live post
-- refused. The bridge writes the times and lets the column derive.
set search_path = public;
create or replace function hr.f_os_schedule_to_shift_trigger() returns trigger
language plpgsql security definer set search_path = hr, public as $$
declare v_node uuid; v_dept uuid; v_zone text;
begin
  if pg_trigger_depth() > 1 then return coalesce(new, old); end if;
  if tg_op = 'DELETE' then
    delete from hr.shifts s where s.id = old.id;
    return old;
  end if;
  if new.employee_id is null or new.work_date is null or new.planned_start is null or new.planned_end is null or new.planned_start = new.planned_end then return new; end if;
  if not exists (select 1 from hr.people p where p.id = new.employee_id) then return new; end if;
  v_dept := coalesce(new.department_id, (select z.department_id from public.zones z where z.id = new.zone_id));
  select n.id into v_node from hr.org_nodes n where n.node_type = 'department' and (n.config->>'os_department_id')::uuid = v_dept;
  if v_node is null then v_node := hr.tg_facility_node_id(); end if;
  v_zone := coalesce(new.zone, (select z.name from public.zones z where z.id = new.zone_id));
  insert into hr.shifts (id, node_id, person_id, zone, shift_date, start_time, end_time, notes, status, shift_type, is_open_shift, created_at, updated_at)
  values (new.id, v_node, new.employee_id, v_zone, new.work_date, new.planned_start, new.planned_end, new.note,
          case when new.status in ('cancelled', 'void') then 'cancelled' else 'scheduled' end, 'custom', false, coalesce(new.created_at, now()), now())
  on conflict (id) do update set node_id = excluded.node_id, person_id = excluded.person_id, zone = excluded.zone, shift_date = excluded.shift_date,
      start_time = excluded.start_time, end_time = excluded.end_time, notes = excluded.notes, status = excluded.status, updated_at = now();
  return new;
end $$;;
