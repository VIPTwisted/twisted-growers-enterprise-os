-- Scheduling foundation, part 3 of 3 — one function says who may be placed, one function drafts.
--
--   f_schedule_candidates(zone, date, template, draft) — every employee, ranked, with the reasons:
--     blockers (cannot be placed: not trained here, not employed, licence, unavailable, time off,
--     already scheduled, rest, days in a row) and warnings (overtime, in training, hours cap).
--     Whatever drafts — a person, the rule-based drafter below, or Grok's bot — asks this function;
--     a placement that violates a rule is impossible rather than merely caught.
--   f_draft_schedule(from, to, department, by_kind, agent) — the push-button draft. Fills every
--     zone_staffing_requirements row for the window from the ranked candidates, primaries before
--     floaters, overtime last, a person in training never alone; writes one schedule_drafts row
--     with rationale per cell; shortfalls become open-shift lines that say why nobody fit.
--     Nothing reaches staff until a sign-off role posts it (f_post_schedule, unchanged flow).
--   f_cover_candidates(open_shift) — the "who is available" list for a call-out, same ranking.
--   v_schedule_draft_review — per draft / date / zone: required, placed, open, conflicts, OT.

create or replace function public.f_schedule_candidates(
  p_zone_id uuid, p_work_date date, p_shift_template_id uuid default null, p_draft_id uuid default null)
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
  -- posted shifts, except those the draft will replace when posted
  select s.employee_id, s.work_date, s.planned_start as ps, s.planned_end as pe,
         round(extract(epoch from (s.planned_end - s.planned_start)) / 3600.0 - coalesce(t.lunch_minutes, 0) / 60.0, 2) as h
  from employee_schedules s left join shift_templates t on t.id = s.shift_template_id
  where s.status <> 'cancelled'
    and s.work_date between (select wk_start from wk) - 14 and (select wk_start from wk) + 20
    and not exists (select 1 from draft d where s.work_date between d.covers_from and d.covers_to
                                            and (d.department_id is null or s.department_id = d.department_id))
  union all
  -- the draft's own lines so far
  select l.employee_id, l.work_date,
         (l.planned_start at time zone (select facility_tz from pol))::time,
         (l.planned_end at time zone (select facility_tz from pol))::time,
         round(extract(epoch from (l.planned_end - l.planned_start)) / 3600.0 - coalesce(t.lunch_minutes, 0) / 60.0, 2)
  from schedule_draft_lines l left join shift_templates t on t.id = l.shift_template_id
  where l.draft_id = p_draft_id and l.employee_id is not null and not l.is_open_shift
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
         -- rest since the previous committed shift and before the next one
         (select round(extract(epoch from ((p_work_date + (select start_time from shift)) - (c.work_date + c.pe))) / 3600.0, 1)
            from committed c where c.employee_id = e.id and c.work_date < p_work_date order by c.work_date desc, c.pe desc limit 1) as rest_before,
         (select round(extract(epoch from ((c.work_date + c.ps) - (p_work_date + (select end_time from shift)))) / 3600.0, 1)
            from committed c where c.employee_id = e.id and c.work_date > p_work_date order by c.work_date, c.ps limit 1) as rest_after,
         -- days worked in the unbroken run ending yesterday
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
comment on function public.f_schedule_candidates is
  'Every employee ranked for one zone on one date on one shift template, with blockers (cannot place) and warnings (place with care). p_draft_id counts the draft''s own lines and ignores the posted shifts the draft will replace.';

-- ── the rule-based drafter ────────────────────────────────────────────────────────────────────
create or replace function public.f_draft_schedule(
  p_from date, p_to date, p_department_id uuid default null,
  p_by_kind text default 'agent', p_agent text default 'rule_based_drafter', p_title text default null)
returns uuid
language plpgsql security definer set search_path to 'public' as $$
declare
  pol scheduling_policy%rowtype;
  v_draft uuid; v_day date; req record; c record;
  v_needed int; v_placed int; v_trained int; v_open int := 0; v_lines int := 0; v_conflicts int := 0;
  v_tmpl shift_templates%rowtype; v_start timestamptz; v_end timestamptz; v_why text; v_short_why text;
  v_hours numeric := 0; v_ot numeric := 0; v_note text;
begin
  if not (public.f_can_post_schedule()
          or nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'role' = 'service_role'
          or (select rolsuper from pg_roles where rolname = current_user)) then
    raise exception 'Only a scheduling sign-off role or the service may draft.' using errcode = '42501';
  end if;
  if p_to < p_from then raise exception 'Window ends before it starts.'; end if;
  if p_to - p_from > 62 then raise exception 'Draft at most 62 days at a time.'; end if;
  if p_by_kind not in ('human', 'agent') then raise exception 'p_by_kind is human or agent.'; end if;
  select * into pol from scheduling_policy;
  if pol.default_shift_template_id is null then raise exception 'Settings › Scheduling has no default shift template.'; end if;

  insert into schedule_drafts (title, covers_from, covers_to, department_id, drafted_by_kind, drafted_by, agent_name, status, rationale)
  values (coalesce(p_title, 'Draft ' || p_from::text || ' → ' || p_to::text || case when p_department_id is not null then ' · ' || (select name from departments where id = p_department_id) else '' end),
          p_from, p_to, p_department_id, p_by_kind, auth.uid(), case when p_by_kind = 'agent' then p_agent end, 'draft',
          'Drafting…')
  returning id into v_draft;

  v_day := p_from;
  while v_day <= p_to loop
    for req in
      select * from (
        select distinct on (z.id) z.id as zone_id, z.name as zone_name, z.department_id, z.sort_order, r.headcount_required,
               coalesce(r.shift_template_id, pol.default_shift_template_id) as tmpl_id
        from zone_staffing_requirements r
        join zones z on z.id = r.zone_id
        where z.active and r.headcount_required > 0
          and (p_department_id is null or z.department_id = p_department_id)
          and r.effective_from <= v_day and (r.effective_to is null or r.effective_to >= v_day)
          and (r.weekday is null or r.weekday = extract(dow from v_day)::int)
        order by z.id, (r.weekday is not null) desc, r.effective_from desc
      ) q order by q.sort_order, q.zone_name   -- flower rooms first, not uuid order (part 4)
    loop
      select * into v_tmpl from shift_templates where id = req.tmpl_id;
      v_start := (v_day + v_tmpl.start_time) at time zone pol.facility_tz;
      v_end   := (v_day + v_tmpl.end_time)   at time zone pol.facility_tz;
      v_needed := req.headcount_required; v_placed := 0; v_trained := 0;

      for c in
        select * from f_schedule_candidates(req.zone_id, v_day, req.tmpl_id, v_draft)
        where cardinality(blockers) = 0
        order by (cardinality(warnings) = 0) desc,
                 case when pol.primary_department_first and is_primary then 0 else 1 end,
                 score desc, full_name
      loop
        exit when v_placed >= v_needed;
        if pol.avoid_overtime and c.would_be_ot and v_placed > 0 then
          -- overtime is the last resort: only when the zone would otherwise be empty
          continue;
        end if;
        if c.level = 'in_training' and pol.in_training_needs_partner and v_trained = 0 and (v_needed - v_placed) = 1 then
          continue; -- would be alone
        end if;
        v_why := case when c.is_primary then 'primary ' else 'trained-in ' end || coalesce(c.department, '') || ' · ' || c.level
              || case when c.is_floater then ' · floater' else '' end
              || ' · ' || c.hours_week || ' h already this week'
              || case when c.rest_hours is not null then ' · ' || c.rest_hours || ' h rest' else '' end
              || case when cardinality(c.warnings) > 0 then ' · ' || array_to_string(c.warnings, '; ') else '' end;
        insert into schedule_draft_lines (draft_id, employee_id, work_date, zone_id, department_id, shift_template_id, planned_start, planned_end, is_open_shift, note, conflict)
        values (v_draft, c.employee_id, v_day, req.zone_id, req.department_id, req.tmpl_id, v_start, v_end, false, v_why,
                case when c.would_be_ot then 'overtime' end);
        v_placed := v_placed + 1; v_lines := v_lines + 1;
        v_hours := v_hours + c.shift_hours;
        if c.would_be_ot then v_ot := v_ot + c.shift_hours; v_conflicts := v_conflicts + 1; end if;
        if c.level <> 'in_training' then v_trained := v_trained + 1; end if;
      end loop;

      -- an in-training person placed with no trained partner is a conflict the human must see
      if v_trained = 0 and v_placed > 0 and pol.in_training_needs_partner then
        update schedule_draft_lines set conflict = coalesce(conflict || '; ', '') || 'in training placed with no trained partner'
        where draft_id = v_draft and work_date = v_day and zone_id = req.zone_id and not is_open_shift;
        v_conflicts := v_conflicts + 1;
      end if;

      -- shortfall: one open-shift line per missing head, saying why nobody fit
      if v_placed < v_needed then
        select string_agg(reason || ' ×' || n, '; ' order by n desc) into v_short_why
        from (select unnest(blockers) as reason, count(*) as n
              from f_schedule_candidates(req.zone_id, v_day, req.tmpl_id, v_draft)
              where cardinality(blockers) > 0 group by 1 order by 2 desc limit 4) x;
        for i in 1 .. (v_needed - v_placed) loop
          insert into schedule_draft_lines (draft_id, employee_id, work_date, zone_id, department_id, shift_template_id, planned_start, planned_end, is_open_shift, note)
          values (v_draft, null, v_day, req.zone_id, req.department_id, req.tmpl_id, v_start, v_end, true,
                  'Short ' || (v_needed - v_placed) || ' of ' || v_needed || ' in ' || req.zone_name || ' — ' || coalesce(v_short_why, 'no candidates'));
          v_open := v_open + 1;
        end loop;
      end if;
    end loop;
    v_day := v_day + 1;
  end loop;

  v_note := v_lines || ' shifts placed, ' || v_open || ' open, ' || v_conflicts || ' cells to review. '
         || 'Rules: rest ≥ ' || pol.min_rest_hours || ' h, ≤ ' || pol.max_consecutive_days || ' days in a row, '
         || case when pol.primary_department_first then 'primaries before floaters, ' else '' end
         || case when pol.avoid_overtime then 'overtime only when a zone would otherwise be empty, ' else '' end
         || case when pol.in_training_needs_partner then 'nobody in training alone. ' else '' end
         || 'Placement reasons are on every cell. Nothing reaches staff until a sign-off role posts it.';
  update schedule_drafts set rationale = v_note, projected_hours = v_hours, projected_ot_hours = v_ot where id = v_draft;
  return v_draft;
end $$;
comment on function public.f_draft_schedule is
  'Push-button draft: fills every staffing requirement in the window from f_schedule_candidates under scheduling_policy, with the reason on each cell and open shifts where nobody fits. Human posts with f_post_schedule.';

-- ── call-out cover: who is available for this open shift ──────────────────────────────────────
create or replace function public.f_cover_candidates(p_open_shift_id uuid)
returns table (employee_id uuid, full_name text, employee_code text, level text, is_primary boolean, is_floater boolean,
               hours_week numeric, would_be_ot boolean, hours_to_ot numeric, warnings text[], score integer, why text)
language sql stable security definer set search_path to 'public' as $$
  select c.employee_id, c.full_name, c.employee_code, c.level, c.is_primary, c.is_floater,
         c.hours_week, c.would_be_ot, c.hours_to_ot, c.warnings, c.score,
         case when c.is_primary then 'primary ' else 'trained-in ' end || coalesce(c.department, '') || ' · ' || c.level
         || ' · ' || c.hours_week || ' h this week' || case when cardinality(c.warnings) > 0 then ' · ' || array_to_string(c.warnings, '; ') else '' end as why
  from open_shifts o
  cross join lateral f_schedule_candidates(o.zone_id, o.work_date, o.shift_template_id, null) c
  where o.id = p_open_shift_id and cardinality(c.blockers) = 0
    and c.employee_id is distinct from (select k.employee_id from callouts k where k.open_shift_id = o.id limit 1)
  order by (cardinality(c.warnings) = 0) desc, c.score desc, c.full_name;
$$;

-- ── review surface ────────────────────────────────────────────────────────────────────────────
create or replace view public.v_schedule_draft_review as
select d.id as draft_id, d.title, d.status, d.drafted_by_kind, d.agent_name, d.covers_from, d.covers_to,
       l.work_date, z.name as zone, dp.name as department,
       (select r.headcount_required from zone_staffing_requirements r
         where r.zone_id = z.id and r.effective_from <= l.work_date and (r.effective_to is null or r.effective_to >= l.work_date)
           and (r.weekday is null or r.weekday = extract(dow from l.work_date)::int)
         order by (r.weekday is not null) desc, r.effective_from desc limit 1) as required,
       count(*) filter (where not l.is_open_shift) as placed,
       count(*) filter (where l.is_open_shift) as open_shifts,
       count(*) filter (where l.conflict is not null and not l.is_open_shift) as conflicts,
       count(*) filter (where l.conflict ilike '%overtime%') as overtime_cells,
       string_agg(e.full_name || case when l.conflict is not null then ' [' || l.conflict || ']' else '' end, ', ' order by e.full_name) filter (where not l.is_open_shift) as people,
       max(l.note) filter (where l.is_open_shift) as why_short
from schedule_drafts d
join schedule_draft_lines l on l.draft_id = d.id
left join zones z on z.id = l.zone_id
left join departments dp on dp.id = coalesce(l.department_id, z.department_id)
left join employees e on e.id = l.employee_id
group by d.id, d.title, d.status, d.drafted_by_kind, d.agent_name, d.covers_from, d.covers_to, l.work_date, z.id, z.name, dp.name
order by d.covers_from desc, l.work_date, z.name;
