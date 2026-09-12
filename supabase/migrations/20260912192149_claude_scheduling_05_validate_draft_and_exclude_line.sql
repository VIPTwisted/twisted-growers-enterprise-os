-- GROK-WHY: Already applied in production as 20260912192149 claude_scheduling_05_validate_draft_and_exclude_line.
-- Another desk ran this. Filed here so migration-drift can pass and the Bots paid key can ship on Sync.
-- Exact SQL from supabase_migrations.schema_migrations.statements. No ledger rewrite. Metrc read-only.

-- The grid needs two things from the server: candidates for a cell that ignore the cell's own line,
-- and a validator that stamps every hand-placed line with the same blockers the drafter uses.

drop function if exists public.f_schedule_candidates(uuid, date, uuid, uuid);

create or replace function public.f_schedule_candidates(
  p_zone_id uuid, p_work_date date, p_shift_template_id uuid default null, p_draft_id uuid default null, p_exclude_line uuid default null)
returns table (
  employee_id uuid, full_name text, employee_code text, department text,
  level text, is_primary boolean, is_floater boolean,
  hours_week numeric, shift_hours numeric, would_be_ot boolean, hours_to_ot numeric,
  consecutive_days integer, rest_hours numeric,
  blockers text[], warnings text[], score integer
)
language sql stable security definer set search_path to 'public' as $$
with pol as (select * from scheduling_policy limit 1),
att as (select coalesce(ot_weekly_threshold, 40) as ot from attendance_policy limit 1),
z as (select z.id, z.name, z.department_id, d.name as dept_name from zones z left join departments d on d.id = z.department_id where z.id = p_zone_id),
tmpl as (select t.* from shift_templates t where t.id = coalesce(p_shift_template_id, (select default_shift_template_id from pol))),
shift as (select round(extract(epoch from (t.end_time - t.start_time)) / 3600.0 - coalesce(t.lunch_minutes, 0) / 60.0, 2) as h, t.start_time, t.end_time from tmpl t),
draft as (select d.* from schedule_drafts d where d.id = p_draft_id),
wk as (select date_trunc('week', p_work_date::timestamp)::date as wk_start),
committed as (
  select s.employee_id, s.work_date, s.planned_start as ps, s.planned_end as pe,
         round(extract(epoch from (s.planned_end - s.planned_start)) / 3600.0 - coalesce(t.lunch_minutes, 0) / 60.0, 2) as h
  from employee_schedules s left join shift_templates t on t.id = s.shift_template_id
  where s.status <> 'cancelled'
    and s.work_date between (select wk_start from wk) - 14 and (select wk_start from wk) + 20
    and not exists (select 1 from draft d where s.work_date between d.covers_from and d.covers_to
                                            and (d.department_id is null or s.department_id = d.department_id))
  union all
  select l.employee_id, l.work_date,
         (l.planned_start at time zone (select facility_tz from pol))::time,
         (l.planned_end at time zone (select facility_tz from pol))::time,
         round(extract(epoch from (l.planned_end - l.planned_start)) / 3600.0 - coalesce(t.lunch_minutes, 0) / 60.0, 2)
  from schedule_draft_lines l left join shift_templates t on t.id = l.shift_template_id
  where l.draft_id = p_draft_id and l.employee_id is not null and not l.is_open_shift
    and (p_exclude_line is null or l.id <> p_exclude_line)
),
per as (
  select e.id as employee_id, e.full_name, e.employee_code, e.status::text as status, e.badge_expires, e.primary_department_id,
         coalesce(e.weekly_target_hours, 40) as target_hours,
         sk.level,
         (select count(*) from employee_department_skill s2 where s2.employee_id = e.id and s2.retired_at is null and (s2.expires is null or s2.expires >= p_work_date)) as depts_qualified,
         coalesce((select sum(c.h) from committed c where c.employee_id = e.id and c.work_date >= (select wk_start from wk) and c.work_date < (select wk_start from wk) + 7 and c.work_date <> p_work_date), 0) as hours_week,
         exists (select 1 from committed c where c.employee_id = e.id and c.work_date = p_work_date) as already_scheduled,
         (select a.reason from employee_availability a
           where a.employee_id = e.id and a.available = false
             and (a.specific_date = p_work_date or (a.specific_date is null and a.weekday = extract(dow from p_work_date)::int))
             and p_work_date >= a.effective_from and (a.effective_to is null or p_work_date <= a.effective_to)
           limit 1) as blackout_reason,
         exists (select 1 from employee_availability a where a.employee_id = e.id and a.available = false
             and (a.specific_date = p_work_date or (a.specific_date is null and a.weekday = extract(dow from p_work_date)::int))
             and p_work_date >= a.effective_from and (a.effective_to is null or p_work_date <= a.effective_to)) as blacked_out,
         (select min(a.max_hours_per_week) from employee_availability a where a.employee_id = e.id and a.max_hours_per_week is not null
             and p_work_date >= a.effective_from and (a.effective_to is null or p_work_date <= a.effective_to)) as max_hours_week,
         exists (select 1 from time_off_requests o where o.employee_id = e.id and o.status = 'approved' and p_work_date between o.starts_on and o.ends_on) as on_time_off,
         (select round(extract(epoch from ((p_work_date + (select start_time from shift)) - (c.work_date + c.pe))) / 3600.0, 1)
            from committed c where c.employee_id = e.id and c.work_date < p_work_date order by c.work_date desc, c.pe desc limit 1) as rest_before,
         (select round(extract(epoch from ((c.work_date + c.ps) - (p_work_date + (select end_time from shift)))) / 3600.0, 1)
            from committed c where c.employee_id = e.id and c.work_date > p_work_date order by c.work_date, c.ps limit 1) as rest_after,
         (select count(*) from generate_series(1, 14) g
            where not exists (select 1 from generate_series(1, g) g2 where not exists (select 1 from committed c where c.employee_id = e.id and c.work_date = p_work_date - g2))) as run_before
  from employees e
  left join employee_department_skill sk on sk.employee_id = e.id and sk.department_id = (select department_id from z)
       and sk.retired_at is null and (sk.expires is null or sk.expires >= p_work_date)
),
scored as (
  select p.*, (select h from shift) as shift_h, (select ot from att) as ot,
         (p.primary_department_id = (select department_id from z)) as is_primary,
         (p.depts_qualified >= 2) as is_floater,
         (p.hours_week + (select h from shift)) > (select ot from att) as would_be_ot,
         array_remove(array[
           case when p.status <> 'active' then 'not employed (' || p.status || ')' end,
           case when p.badge_expires is null then 'no agent licence on file'
                when p.badge_expires < p_work_date then 'agent licence expired ' || p.badge_expires::text end,
           case when p.level is null then 'not trained in ' || coalesce((select dept_name from z), 'this department') end,
           case when p.blacked_out then 'unavailable' || coalesce(' (' || p.blackout_reason || ')', '') end,
           case when p.on_time_off then 'approved time off' end,
           case when p.already_scheduled then 'already scheduled that day' end,
           case when p.rest_before is not null and p.rest_before < (select min_rest_hours from pol) then 'only ' || p.rest_before || ' h rest since previous shift' end,
           case when p.rest_after is not null and p.rest_after < (select min_rest_hours from pol) then 'only ' || p.rest_after || ' h rest before next shift' end,
           case when p.run_before + 1 > (select max_consecutive_days from pol) then 'would be day ' || (p.run_before + 1) || ' in a row' end
         ], null) as blockers,
         array_remove(array[
           case when (p.hours_week + (select h from shift)) > (select ot from att) then 'overtime: ' || (p.hours_week + (select h from shift)) || ' h this week' end,
           case when p.level = 'in_training' then 'in training — needs a trained partner in the zone' end,
           case when p.max_hours_week is not null and (p.hours_week + (select h from shift)) > p.max_hours_week then 'over their ' || p.max_hours_week || ' h weekly cap' end,
           case when (p.hours_week + (select h from shift)) > p.target_hours and (p.hours_week + (select h from shift)) <= (select ot from att) then 'over target ' || p.target_hours || ' h' end
         ], null) as warnings
  from per p
)
select s.employee_id, s.full_name, s.employee_code, (select dept_name from z) as department,
       s.level, s.is_primary, s.is_floater,
       s.hours_week, s.shift_h as shift_hours, s.would_be_ot,
       greatest(s.ot - s.hours_week - s.shift_h, 0) as hours_to_ot,
       (s.run_before + 1)::int as consecutive_days, s.rest_before as rest_hours,
       s.blockers, s.warnings,
       (case when s.is_primary then 100 else 0 end
        + case s.level when 'can_lead' then 30 when 'trained' then 20 when 'in_training' then 5 else 0 end
        + least(greatest(40 - s.hours_week, 0), 40)::int
        - case when s.would_be_ot then 60 else 0 end
        - cardinality(s.warnings) * 5)::int as score
from scored s
order by (cardinality(s.blockers) = 0) desc, (cardinality(s.warnings) = 0) desc, score desc, s.full_name;
$$;

-- Stamp every placed line in a draft with the rules' verdict; returns the count of conflicts.
create or replace function public.f_validate_draft(p_draft_id uuid) returns integer
language plpgsql security definer set search_path to 'public' as $$
declare l record; c record; n int := 0;
begin
  if not public.f_can_decide_hr() and not (select rolsuper from pg_roles where rolname = current_user) then
    raise exception 'Only a scheduling role may validate a draft.' using errcode = '42501';
  end if;
  for l in select * from schedule_draft_lines where draft_id = p_draft_id and not is_open_shift and employee_id is not null loop
    select * into c from f_schedule_candidates(l.zone_id, l.work_date, l.shift_template_id, p_draft_id, l.id) k where k.employee_id = l.employee_id;
    update schedule_draft_lines
       set conflict = case when c.employee_id is null then 'unknown person'
                           when cardinality(c.blockers) > 0 then array_to_string(c.blockers, '; ')
                           when c.would_be_ot then 'overtime' end,
           note = case when c.employee_id is null then note else
                    case when c.is_primary then 'primary ' else 'trained-in ' end || coalesce(c.department, '') || ' · ' || coalesce(c.level, 'not trained')
                    || case when c.is_floater then ' · floater' else '' end
                    || ' · ' || c.hours_week || ' h already this week'
                    || case when cardinality(c.warnings) > 0 then ' · ' || array_to_string(c.warnings, '; ') else '' end end
     where id = l.id;
    if c.employee_id is null or cardinality(c.blockers) > 0 or c.would_be_ot then n := n + 1; end if;
  end loop;
  return n;
end $$;

-- the page reads these
grant execute on function public.f_schedule_candidates(uuid, date, uuid, uuid, uuid) to authenticated;
grant execute on function public.f_validate_draft(uuid) to authenticated;
grant execute on function public.f_draft_schedule(date, date, uuid, text, text, text) to authenticated;
grant execute on function public.f_cover_candidates(uuid) to authenticated;
grant execute on function public.f_can_post_schedule() to authenticated;
grant select on public.v_schedule_draft_review, public.v_employee_skill_matrix, public.v_floaters, public.v_staff_without_department, public.facility_room to authenticated;
