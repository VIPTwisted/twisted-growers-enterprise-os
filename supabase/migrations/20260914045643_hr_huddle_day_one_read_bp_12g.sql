-- BP-12g · Daily Huddle reads one day in one call. The screen kept its board, posts, tasks and
-- announcements in the browser's localStorage and drew punches, zones, sales and training
-- progress from a seed. The hr tables and writers for all of it already existed
-- (huddle_boards / huddle_posts / huddle_tasks / huddle_announcements / zone_assignments);
-- this reader joins them with the measured punch board, the OS zones, the day's revenue facts
-- and training completion so the page shows rows or says there are none.
set search_path = hr, public, extensions;

create or replace function hr.tg_zones(p_node_ids uuid[] default null)
returns table(zone_id uuid, zone text, department text, sort_order int)
language sql stable security definer set search_path = hr, public, extensions as $$
  select z.id, z.name, d.name, z.sort_order
  from public.zones z left join public.departments d on d.id = z.department_id
  where z.active and z.retired_at is null
  order by d.sort nulls last, z.sort_order, z.name;
$$;
revoke all on function hr.tg_zones(uuid[]) from public, anon;
grant execute on function hr.tg_zones(uuid[]) to authenticated;

create or replace function hr.huddle_day(p_node_ids uuid[], p_date date default null)
returns jsonb language plpgsql stable security definer set search_path = hr, public, extensions as $$
declare v_dt date := coalesce(p_date, current_date); v_ids uuid[] := hr.tg_reach_nodes(p_node_ids); v_punches jsonb; v_zones jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('person_id', person_id, 'name', full_name, 'location', node_name, 'status', status,
           'scheduled', scheduled, 'in_at', punched_in_at, 'out_at', punched_out_at, 'late_minutes', late_minutes) order by full_name), '[]'::jsonb)
    into v_punches from hr.punch_board(p_node_ids, v_dt);
  select coalesce(jsonb_agg(jsonb_build_object('zone', q.zone, 'department', q.department, 'employee', q.employee, 'person_id', q.person_id,
           'status', case when q.person_id is null and q.employee is null then 'Uncovered'
                          when exists (select 1 from jsonb_array_elements(v_punches) pb where (pb->>'person_id')::uuid = q.person_id and pb->>'status' = 'Late') then 'Late Arrival'
                          when exists (select 1 from jsonb_array_elements(v_punches) pb where (pb->>'person_id')::uuid = q.person_id and pb->>'status' = 'In') then 'Covered'
                          else 'Assigned' end) order by q.sort_order, q.zone), '[]'::jsonb)
    into v_zones
  from (
    select z.zone, z.department, z.sort_order, coalesce(za.employee_name, p.full_name) employee, za.person_id
    from hr.tg_zones() z
    left join lateral (select * from hr.zone_assignments a
                        where a.zone = z.zone and a.assignment_date = v_dt and a.node_id = any(v_ids)
                        order by a.start_time limit 1) za on true
    left join hr.people p on p.id = za.person_id) q;
  return jsonb_build_object(
    'date', v_dt,
    'board', hr.get_huddle_board(v_ids, v_dt),
    'posts', hr.get_huddle_posts(v_ids, v_dt),
    'tasks', hr.get_huddle_tasks(v_ids, v_dt),
    'announcements', hr.get_huddle_announcements(v_ids, v_dt),
    'punches', v_punches,
    'zones', v_zones,
    'sales_actual', (select sum(f.amount) from hr.financial_facts f where f.category ilike 'revenue' and f.fact_date = v_dt and f.node_id = any(v_ids)),
    'training_pct', (select round(avg(t.training_pct), 0) from hr.flight_risk_factors(p_node_ids) t where t.training_pct is not null),
    'people_in_scope', jsonb_array_length(v_punches));
end $$;
revoke all on function hr.huddle_day(uuid[], date) from public, anon;
grant execute on function hr.huddle_day(uuid[], date) to authenticated;

-- archive: one row per day for a range, counts only (the day view reads huddle_day)
create or replace function hr.huddle_archive(p_node_ids uuid[], p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = hr, public, extensions as $$
declare v_ids uuid[] := hr.tg_reach_nodes(p_node_ids); v_out jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('date', days.d,
    'board', hr.get_huddle_board(v_ids, days.d),
    'posts', (select count(*) from hr.huddle_posts p where p.huddle_date = days.d and p.node_id = any(v_ids)),
    'tasks', (select count(*) from hr.huddle_tasks t where t.huddle_date = days.d and t.node_id = any(v_ids)),
    'announcements', (select count(*) from hr.huddle_announcements a where a.huddle_date = days.d and a.node_id = any(v_ids)),
    'in_count', (select count(*) from hr.punch_board(p_node_ids, days.d) pb where pb.status in ('In', 'Late', 'Out') and pb.punched_in_at is not null),
    'late_count', (select count(*) from hr.punch_board(p_node_ids, days.d) pb where pb.late_minutes > 0)) order by days.d desc), '[]'::jsonb)
    into v_out
  from (select dd::date d from generate_series(least(p_from, p_to), greatest(p_from, p_to), interval '1 day') dd) days;
  return v_out;
end $$;
revoke all on function hr.huddle_archive(uuid[], date, date) from public, anon;
grant execute on function hr.huddle_archive(uuid[], date, date) to authenticated;

notify pgrst, 'reload schema';;
