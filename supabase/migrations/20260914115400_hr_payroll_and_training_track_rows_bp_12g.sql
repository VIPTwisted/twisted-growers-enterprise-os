-- BP-12g · two more clone screens drew their whole content from a seed: Payroll (rates,
-- deductions, hours, stubs, YTD, PAID/PROCESSING statuses for real people) and the Training
-- Progress Tracker (a fake session "Jordan Kim", fake supabase, seeded certificates and skills).
-- Both now read rows through one function each. Payroll's system of record is the OS Finance
-- lane (public.pay_periods / pay_runs / pay_run_lines / employee_rates); training is
-- hr.training_records / training_modules / lms_* / employee_certifications plus the OS
-- department skills. Nothing is invented; an empty list is empty.
set search_path = hr, public, extensions;

create or replace function hr.payroll_summary(p_node_ids uuid[] default null, p_person_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = hr, public, extensions as $$
declare v_ids uuid[]; v_ps date; v_pe date; v_pay date; v_freq text; v_out jsonb; v_has_period boolean := true;
begin
  v_ids := hr.tg_reach_nodes(coalesce(p_node_ids, array[hr.tg_facility_node_id()]));
  select pp.starts_on, pp.ends_on, pp.pay_date, pp.frequency into v_ps, v_pe, v_pay, v_freq
    from public.pay_periods pp where current_date between pp.starts_on and pp.ends_on order by pp.starts_on desc limit 1;
  if v_ps is null then
    -- no pay period set: the current Monday-to-Sunday week is the window for hours, and the page says so
    v_ps := date_trunc('week', current_date)::date; v_pe := v_ps + 6; v_pay := null; v_freq := null; v_has_period := false;
  end if;
  with ppl as (
    select * from hr.tg_people_in_reach(v_ids, null) where p_person_id is null or person_id = p_person_id),
  hrs as (
    select person_id, sum(h) h from (
      select t.person_id, coalesce(t.hours_worked, extract(epoch from (t.punched_out_at - t.punched_in_at)) / 3600.0) h
        from hr.time_punches t where t.work_date between v_ps and v_pe and t.punched_out_at is not null
      union all
      select e.employee_id, coalesce(e.productive_hours, extract(epoch from (e.clock_out - e.clock_in)) / 3600.0 - coalesce(e.unpaid_lunch_min, 0) / 60.0)
        from public.time_entries e where e.work_date between v_ps and v_pe and e.clock_out is not null
    ) u group by person_id),
  wage as (
    select pp.person_id, coalesce(w.new_wage, r.rate) w, (w.new_wage is null and coalesce(r.provisional, false)) prov
    from ppl pp
    left join lateral (select new_wage from hr.wage_history h where h.person_id = pp.person_id order by h.effective_date desc limit 1) w on true
    left join lateral (select * from hr.tg_hourly_rate(pp.person_id, current_date)) r on true),
  per as (
    select pp.person_id, pp.full_name, pp.role_name, pp.node_name, coalesce(h.h, 0) hours, greatest(coalesce(h.h, 0) - 40 * greatest(1, ((v_pe - v_ps + 1) / 7)), 0) ot, w.w rate, w.prov
    from ppl pp left join hrs h on h.person_id = pp.person_id left join wage w on w.person_id = pp.person_id)
  select jsonb_build_object(
    'current_period', case when v_has_period then jsonb_build_object('start', v_ps, 'end', v_pe, 'pay_date', v_pay, 'frequency', v_freq) else null end,
    'window', jsonb_build_object('start', v_ps, 'end', v_pe),
    'people', coalesce((select jsonb_agg(jsonb_build_object('person_id', person_id, 'full_name', full_name, 'role_name', role_name, 'node_name', node_name,
                 'rate', rate, 'rate_provisional', prov, 'hours_period', round(hours, 1), 'ot_period', round(ot, 1),
                 'indicative_gross', case when rate is null then null else round((hours - ot) * rate + ot * rate * 1.5, 2) end) order by full_name) from per), '[]'::jsonb),
    'pay_runs', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'run_no', r.run_no, 'kind', r.kind, 'status', r.status, 'gross', r.gross, 'deductions', r.deductions, 'net', r.net,
                 'employee_taxes', r.employee_taxes, 'employer_taxes', r.employer_taxes, 'total_cost', r.total_cost,
                 'period_start', pp.starts_on, 'period_end', pp.ends_on, 'pay_date', pp.pay_date, 'approved_at', r.approved_at, 'exported_at', r.exported_at,
                 'lines_in_scope', (select count(*) from public.pay_run_lines l where l.pay_run_id = r.id and l.employee_id in (select person_id from ppl))) order by pp.starts_on desc nulls last, r.created_at desc)
                 from public.pay_runs r left join public.pay_periods pp on pp.id = r.pay_period_id), '[]'::jsonb))
    into v_out;
  return v_out;
end $$;
revoke all on function hr.payroll_summary(uuid[], uuid) from public, anon;
grant execute on function hr.payroll_summary(uuid[], uuid) to authenticated;

create or replace function hr.my_training_track(p_person_id uuid)
returns jsonb language sql stable security definer set search_path = hr, public, extensions as $$
  select jsonb_build_object(
    'person', (select jsonb_build_object('id', p.id, 'full_name', p.full_name, 'hired_on', e.hired_on, 'role_name', (select r.name from hr.assignments a join hr.roles r on r.id = a.role_id where a.person_id = p.id and a.status = 'active' order by r.rank limit 1))
               from hr.people p left join public.employees e on e.id = p.id where p.id = p_person_id),
    'modules', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'module', coalesce(m.name, t.module), 'category', coalesce(m.category, t.category), 'required', m.is_required,
                  'status', t.status, 'progress_pct', t.progress_pct, 'score', t.score, 'started_at', t.started_at, 'completed_at', t.completed_at, 'expires_at', t.expires_at, 'attempts', t.attempts,
                  'duration_minutes', m.duration_minutes, 'passing_score', m.passing_score) order by (t.completed_at is null) desc, t.expires_at nulls last, coalesce(m.name, t.module))
                from hr.training_records t left join hr.training_modules m on m.id = t.module_id where t.person_id = p_person_id), '[]'::jsonb),
    'courses', coalesce((select jsonb_agg(jsonb_build_object('id', en.id, 'course', coalesce(c.title, en.course_id), 'category', c.category, 'level', c.level, 'required', c.required,
                  'pct', en.pct, 'completed', en.completed, 'score', en.score, 'due_date', en.due_date, 'enrolled_at', en.enrolled_at, 'completed_at', en.completed_at, 'duration_hours', c.duration_hours) order by en.completed, en.due_date nulls last)
                from hr.lms_enrollments en left join hr.lms_courses c on c.id = en.course_id where en.person_id = p_person_id), '[]'::jsonb),
    'certifications', coalesce((select jsonb_agg(x order by (x->>'expiry_date') nulls last) from (
                select jsonb_build_object('id', c.id, 'name', c.cert_name, 'issued_date', c.issued_date, 'expiry_date', c.expiry_date, 'status', c.status, 'source', 'hr') x
                  from hr.employee_certifications c where c.person_id = p_person_id
                union all
                select jsonb_build_object('id', k.id, 'name', coalesce(nullif(k.certification, ''), 'Department certification') || ' · ' || coalesce(d.name, ''), 'issued_date', coalesce(k.verified_on, k.trained_on), 'expiry_date', k.expires, 'status', k.level, 'source', 'os')
                  from public.employee_department_skill k left join public.departments d on d.id = k.department_id where k.employee_id = p_person_id and k.retired_at is null
                union all
                select jsonb_build_object('id', e.id, 'name', 'Metrc agent badge ' || coalesce(e.metrc_agent_badge, ''), 'issued_date', null, 'expiry_date', e.badge_expires, 'status', e.metrc_license_status, 'source', 'os')
                  from public.employees e where e.id = p_person_id and e.badge_expires is not null) q), '[]'::jsonb),
    'skills', coalesce((select jsonb_agg(jsonb_build_object('id', k.id, 'department', d.name, 'level', k.level, 'trained_on', k.trained_on, 'verified_on', k.verified_on, 'note', k.note) order by d.name)
                from public.employee_department_skill k left join public.departments d on d.id = k.department_id where k.employee_id = p_person_id and k.retired_at is null), '[]'::jsonb),
    'sessions', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'competency', a.competency_key, 'train_date', a.train_date, 'slot', a.slot, 'status', a.status, 'trainer', tr.full_name, 'notes', a.notes) order by a.train_date desc)
                from hr.training_assignments a left join hr.people tr on tr.id = a.trainer_id where a.trainee_id = p_person_id), '[]'::jsonb));
$$;
revoke all on function hr.my_training_track(uuid) from public, anon;
grant execute on function hr.my_training_track(uuid) to authenticated;
notify pgrst, 'reload schema';;
