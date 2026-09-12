-- ═══════════════════════════════════════════════════════════════════════════
-- Analytics & Intelligence backend (src/screens/Analytics.jsx)
-- HR brain project: zsmdejhgdyyaakqsjhmk
--
-- NO new tables. Three read-only SECURITY DEFINER RPCs computed 100% from
-- EXISTING real tables (all shapes verified live 2026-07-17 via PostgREST):
--   sales_logs(id, person_id, node_id, tenant_id, sale_date, amount, units, category)
--   sales_goals(id, node_id, metric, target_value, start_date, end_date, status)
--   time_punches(id, person_id, node_id, work_date, punched_in_at, punched_out_at, hours_worked)
--   wage_history(id, person_id, node_id, effective_date, new_wage, prior_wage)
--   attendance_incidents(id, person_id, node_id, incident_type[tardy|callout|ncns], points, incident_date)
--   shifts(id, person_id, node_id, shift_date, start_time, end_time, status)
--   training_records(id, person_id, node_id, module, category, completed_at, expires_at, score, status)
--   disciplinary_records(id, person_id, node_id, issued_by, type, date, status)
--   spiff_payouts(id, person_id, node_id, amount, awarded_at, program_id)
--   hr_separations(id, person_id, node_id, employee_name, former_role, sep_date, sep_reason, rehire_status, orig_hire_date, da_count)
--   onboarding_hires(id, node_id, full_name, start_date, role_label, status, converted_person_id)
--   people(id, full_name, is_active) / assignments(person_id, node_id, role_id, effective_from, effective_to, status)
--   org_nodes(id, name, tenant_id, node_type) / roles(id, name)
--
-- Row-level lists the screen also needs are served by EXISTING RPCs and are NOT
-- duplicated here: get_attendance_overview, get_disciplinary_actions,
-- get_training_overview, get_sales_summary, get_all_time_entries, rehire_list,
-- hr_dashboard, get_employee_sales, get_app_state/set_app_state.
--
-- Idempotent — safe to re-run. All functions read-only (STABLE); RLS on the
-- underlying tables stays intact (definer functions bypass it by design,
-- matching the app's pin_login/anon model).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1) KPI matrix: aggregate + per-location, arbitrary date range ───────────
create or replace function public.get_analytics_summary(
  p_node_ids  uuid[],
  p_date_from date default null,
  p_date_to   date default null
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_from date := coalesce(p_date_from, date_trunc('month', current_date)::date);
  v_to   date := coalesce(p_date_to,   current_date);
  v_locs jsonb;
  v_sum  jsonb;
begin
  if p_node_ids is null or array_length(p_node_ids, 1) is null then
    return jsonb_build_object('ok', false, 'error', 'no nodes in scope',
                              'summary', null, 'locations', '[]'::jsonb);
  end if;

  with loc as (
    select n.id, n.name from org_nodes n where n.id = any(p_node_ids)
  ),
  -- current primary node per active person (people has NO node_id; via assignments)
  roster as (
    select distinct on (p.id) p.id as person_id, a.node_id
    from people p
    join assignments a on a.person_id = p.id and a.node_id = any(p_node_ids)
    where coalesce(p.is_active, true)
    order by p.id, a.effective_from desc nulls last
  ),
  wage as (  -- latest known wage per person (may be empty — cost then stays null, never invented)
    select distinct on (person_id) person_id, new_wage
    from wage_history
    order by person_id, effective_date desc, created_at desc
  ),
  sales as (
    select node_id, sum(amount) as amt, count(*) as cnt, sum(units) as units
    from sales_logs
    where node_id = any(p_node_ids) and sale_date between v_from and v_to
    group by node_id
  ),
  goals as (
    select node_id, sum(target_value) as goal
    from sales_goals
    where node_id = any(p_node_ids)
      and coalesce(lower(metric), 'revenue') in ('revenue', 'sales', 'amount')
      and coalesce(start_date, v_from) <= v_to
      and coalesce(end_date,   v_to)   >= v_from
    group by node_id
  ),
  punch as (
    select tp.person_id, tp.node_id, tp.work_date,
           coalesce(tp.hours_worked,
                    extract(epoch from (tp.punched_out_at - tp.punched_in_at)) / 3600.0) as hrs
    from time_punches tp
    where tp.node_id = any(p_node_ids)
      and tp.work_date between v_from and v_to
      and (tp.hours_worked is not null or tp.punched_out_at is not null)
  ),
  pweek as (  -- weekly OT (>40h) per person per node — approximation when a person splits nodes
    select person_id, node_id, date_trunc('week', work_date) as wk,
           sum(hrs) as wk_hrs, greatest(0, sum(hrs) - 40) as ot_hrs
    from punch group by person_id, node_id, date_trunc('week', work_date)
  ),
  labor as (
    select pw.node_id,
           sum(pw.wk_hrs)                                        as hours,
           sum(pw.ot_hrs)                                        as ot_hours,
           sum(pw.wk_hrs * w.new_wage)                           as cost,      -- null when no wages recorded
           sum(pw.ot_hrs * w.new_wage * 1.5)                     as ot_cost,
           count(distinct pw.person_id) filter (where w.new_wage is not null) as waged_people,
           count(distinct pw.person_id)                          as clocked_people
    from pweek pw left join wage w on w.person_id = pw.person_id
    group by pw.node_id
  ),
  inc as (
    select node_id,
           count(*) filter (where incident_type = 'tardy')   as tardies,
           count(*) filter (where incident_type = 'callout') as callouts,
           count(*) filter (where incident_type = 'ncns')    as ncns,
           count(*)                                          as total
    from attendance_incidents
    where node_id = any(p_node_ids) and incident_date between v_from and v_to
    group by node_id
  ),
  sched as (
    select node_id, count(*) as shift_ct
    from shifts
    where node_id = any(p_node_ids) and shift_date between v_from and v_to
    group by node_id
  ),
  training as (
    select r.node_id,
           count(t.id) as total,
           count(t.id) filter (where t.completed_at is not null
                               and (t.expires_at is null or t.expires_at >= current_date)) as valid
    from roster r join training_records t on t.person_id = r.person_id
    group by r.node_id
  ),
  das as (
    select node_id,
           count(*) filter (where date between v_from and v_to) as in_range,
           count(*) filter (where status = 'active')            as active_das
    from disciplinary_records
    where node_id = any(p_node_ids)
    group by node_id
  ),
  risk as (  -- flagged: active DA, or ≥3 attendance incidents in range
    select node_id, count(*) as risk_ct from (
      select node_id, person_id from disciplinary_records
      where node_id = any(p_node_ids) and status = 'active'
      union
      select node_id, person_id from attendance_incidents
      where node_id = any(p_node_ids) and incident_date between v_from and v_to
      group by node_id, person_id having count(*) >= 3
    ) x group by node_id
  ),
  spiff as (
    select node_id, sum(amount) as amt
    from spiff_payouts
    where node_id = any(p_node_ids)
      and awarded_at is not null and awarded_at::date between v_from and v_to
    group by node_id
  ),
  seps as (
    select node_id,
           count(*) filter (where sep_date >= current_date - 365)                     as last_12mo,
           count(*) filter (where sep_date >= date_trunc('year', current_date)::date) as ytd
    from hr_separations
    where node_id = any(p_node_ids)
    group by node_id
  ),
  hires as (  -- a person's FIRST assignment start = hire event
    select node_id,
           count(*) filter (where first_start >= date_trunc('year', current_date)::date) as ytd,
           count(*) filter (where first_start between v_from and v_to)                   as in_range
    from (
      select distinct on (a.person_id) a.person_id, a.node_id, a.effective_from as first_start
      from assignments a
      where a.effective_from is not null
      order by a.person_id, a.effective_from asc
    ) h
    where h.node_id = any(p_node_ids)
    group by node_id
  ),
  hc as (
    select node_id, count(*) as headcount from roster group by node_id
  ),
  per_loc as (
    select
      l.id, l.name,
      coalesce(hc.headcount, 0)                      as headcount,
      coalesce(s.amt, 0)                             as revenue,
      coalesce(s.cnt, 0)                             as sale_count,
      coalesce(s.units, 0)                           as units,
      g.goal                                          as revenue_goal,
      round(coalesce(lb.hours, 0)::numeric, 1)        as labor_hours,
      round(coalesce(lb.ot_hours, 0)::numeric, 1)     as ot_hours,
      round(lb.cost::numeric, 2)                      as labor_cost,
      round(lb.ot_cost::numeric, 2)                   as ot_cost,
      coalesce(lb.waged_people, 0)                    as waged_people,
      coalesce(lb.clocked_people, 0)                  as clocked_people,
      coalesce(sp.amt, 0)                             as spiff,
      coalesce(sc.shift_ct, 0)                        as scheduled_shifts,
      coalesce(i.tardies, 0)                          as tardies,
      coalesce(i.callouts, 0)                         as callouts,
      coalesce(i.ncns, 0)                             as ncns,
      case when coalesce(sc.shift_ct, 0) > 0
           then round(100.0 * greatest(0, sc.shift_ct - coalesce(i.callouts,0) - coalesce(i.ncns,0)) / sc.shift_ct, 1)
           end                                        as attendance_rate,
      coalesce(t.total, 0)                            as training_total,
      coalesce(t.valid, 0)                            as training_valid,
      case when coalesce(t.total, 0) > 0
           then round(100.0 * t.valid / t.total, 1) end as training_pct,
      coalesce(d.in_range, 0)                         as da_count,
      coalesce(d.active_das, 0)                       as active_das,
      coalesce(rk.risk_ct, 0)                         as risk_emp,
      coalesce(sep.last_12mo, 0)                      as seps_12mo,
      coalesce(sep.ytd, 0)                            as seps_ytd,
      coalesce(h.ytd, 0)                              as hires_ytd,
      case when coalesce(hc.headcount, 0) > 0
           then round(100.0 * coalesce(sep.last_12mo, 0) / hc.headcount, 1) end as turnover_pct,
      (coalesce(s.cnt,0) + coalesce(sc.shift_ct,0) + coalesce(i.total,0)
        + coalesce(d.in_range,0) + coalesce(t.total,0))                         as data_points
    from loc l
    left join hc       on hc.node_id  = l.id
    left join sales s  on s.node_id   = l.id
    left join goals g  on g.node_id   = l.id
    left join labor lb on lb.node_id  = l.id
    left join spiff sp on sp.node_id  = l.id
    left join sched sc on sc.node_id  = l.id
    left join inc i    on i.node_id   = l.id
    left join training t on t.node_id = l.id
    left join das d    on d.node_id   = l.id
    left join risk rk  on rk.node_id  = l.id
    left join seps sep on sep.node_id = l.id
    left join hires h  on h.node_id   = l.id
  )
  select
    coalesce(jsonb_agg(to_jsonb(per_loc) order by per_loc.name), '[]'::jsonb),
    jsonb_build_object(
      'headcount',       coalesce(sum(headcount), 0),
      'revenue',         coalesce(sum(revenue), 0),
      'sale_count',      coalesce(sum(sale_count), 0),
      'units',           coalesce(sum(units), 0),
      'revenue_goal',    sum(revenue_goal),
      'labor_hours',     round(coalesce(sum(labor_hours), 0)::numeric, 1),
      'ot_hours',        round(coalesce(sum(ot_hours), 0)::numeric, 1),
      'labor_cost',      round(sum(labor_cost)::numeric, 2),
      'ot_cost',         round(sum(ot_cost)::numeric, 2),
      'spiff',           coalesce(sum(spiff), 0),
      'scheduled_shifts',coalesce(sum(scheduled_shifts), 0),
      'tardies',         coalesce(sum(tardies), 0),
      'callouts',        coalesce(sum(callouts), 0),
      'ncns',            coalesce(sum(ncns), 0),
      'attendance_rate', case when coalesce(sum(scheduled_shifts), 0) > 0
                           then round(100.0 * greatest(0, sum(scheduled_shifts) - sum(callouts) - sum(ncns))
                                      / sum(scheduled_shifts), 1) end,
      'training_total',  coalesce(sum(training_total), 0),
      'training_valid',  coalesce(sum(training_valid), 0),
      'training_pct',    case when coalesce(sum(training_total), 0) > 0
                           then round(100.0 * sum(training_valid) / sum(training_total), 1) end,
      'da_count',        coalesce(sum(da_count), 0),
      'active_das',      coalesce(sum(active_das), 0),
      'risk_emp',        coalesce(sum(risk_emp), 0),
      'seps_12mo',       coalesce(sum(seps_12mo), 0),
      'seps_ytd',        coalesce(sum(seps_ytd), 0),
      'hires_ytd',       coalesce(sum(hires_ytd), 0),
      'turnover_pct',    case when coalesce(sum(headcount), 0) > 0
                           then round(100.0 * coalesce(sum(seps_12mo), 0) / sum(headcount), 1) end,
      'data_points',     coalesce(sum(data_points), 0)
    )
  into v_locs, v_sum
  from per_loc;

  return jsonb_build_object(
    'ok', true, 'date_from', v_from, 'date_to', v_to,
    'summary', v_sum, 'locations', v_locs);
end; $$;

-- ── 2) Monthly series (trends + forecasts) over the caller's node scope ──────
create or replace function public.get_analytics_monthly(
  p_node_ids uuid[],
  p_months   int default 12
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_months int  := least(greatest(coalesce(p_months, 12), 1), 24);
  v_start  date := (date_trunc('month', current_date) - make_interval(months => v_months - 1))::date;
  v_out    jsonb;
begin
  if p_node_ids is null or array_length(p_node_ids, 1) is null then
    return '[]'::jsonb;
  end if;

  with months as (
    select generate_series(v_start, date_trunc('month', current_date)::date, interval '1 month')::date as m0
  ),
  wage as (
    select distinct on (person_id) person_id, new_wage
    from wage_history order by person_id, effective_date desc, created_at desc
  ),
  sales_m as (
    select date_trunc('month', sale_date)::date as m0, sum(amount) as amt, count(*) as cnt
    from sales_logs where node_id = any(p_node_ids) and sale_date >= v_start group by 1
  ),
  punch_m as (
    select date_trunc('month', work_date)::date as m0,
           sum(hrs) as hours, sum(hrs * new_wage) as cost
    from (
      select tp.work_date, tp.person_id,
             coalesce(tp.hours_worked,
                      extract(epoch from (tp.punched_out_at - tp.punched_in_at)) / 3600.0) as hrs
      from time_punches tp
      where tp.node_id = any(p_node_ids) and tp.work_date >= v_start
        and (tp.hours_worked is not null or tp.punched_out_at is not null)
    ) p left join wage w on w.person_id = p.person_id
    group by 1
  ),
  ot_m as (
    select date_trunc('month', wk)::date as m0, sum(ot_hrs) as ot_hours
    from (
      select date_trunc('week', tp.work_date) as wk, tp.person_id,
             greatest(0, sum(coalesce(tp.hours_worked,
                    extract(epoch from (tp.punched_out_at - tp.punched_in_at)) / 3600.0)) - 40) as ot_hrs
      from time_punches tp
      where tp.node_id = any(p_node_ids) and tp.work_date >= v_start
        and (tp.hours_worked is not null or tp.punched_out_at is not null)
      group by 1, 2
    ) x group by 1
  ),
  inc_m as (
    select date_trunc('month', incident_date)::date as m0,
           count(*) filter (where incident_type = 'tardy')   as tardies,
           count(*) filter (where incident_type = 'callout') as callouts,
           count(*) filter (where incident_type = 'ncns')    as ncns
    from attendance_incidents
    where node_id = any(p_node_ids) and incident_date >= v_start group by 1
  ),
  sched_m as (
    select date_trunc('month', shift_date)::date as m0, count(*) as shift_ct
    from shifts where node_id = any(p_node_ids) and shift_date >= v_start group by 1
  ),
  train_m as (
    select date_trunc('month', t.completed_at)::date as m0, count(*) as completions
    from training_records t
    where t.completed_at is not null and t.completed_at >= v_start
      and (t.node_id = any(p_node_ids)
           or t.person_id in (select person_id from assignments where node_id = any(p_node_ids)))
    group by 1
  ),
  da_m as (
    select date_trunc('month', date)::date as m0, count(*) as das
    from disciplinary_records
    where node_id = any(p_node_ids) and date >= v_start group by 1
  ),
  sep_m as (
    select date_trunc('month', sep_date)::date as m0, count(*) as seps
    from hr_separations
    where node_id = any(p_node_ids) and sep_date >= v_start group by 1
  ),
  hire_m as (
    select date_trunc('month', first_start)::date as m0, count(*) as hires
    from (
      select distinct on (a.person_id) a.person_id, a.node_id, a.effective_from as first_start
      from assignments a where a.effective_from is not null
      order by a.person_id, a.effective_from asc
    ) h
    where h.node_id = any(p_node_ids) and h.first_start >= v_start group by 1
  ),
  spiff_m as (
    select date_trunc('month', awarded_at)::date as m0, sum(amount) as spiff
    from spiff_payouts
    where node_id = any(p_node_ids) and awarded_at is not null and awarded_at::date >= v_start
    group by 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'month',            to_char(m.m0, 'YYYY-MM'),
    'label',            to_char(m.m0, 'Mon'),
    'revenue',          coalesce(s.amt, 0),
    'sale_count',       coalesce(s.cnt, 0),
    'labor_hours',      round(coalesce(p.hours, 0)::numeric, 1),
    'labor_cost',       round(p.cost::numeric, 2),
    'ot_hours',         round(coalesce(o.ot_hours, 0)::numeric, 1),
    'tardies',          coalesce(i.tardies, 0),
    'callouts',         coalesce(i.callouts, 0),
    'ncns',             coalesce(i.ncns, 0),
    'scheduled_shifts', coalesce(sc.shift_ct, 0),
    'attendance_rate',  case when coalesce(sc.shift_ct, 0) > 0
                          then round(100.0 * greatest(0, sc.shift_ct - coalesce(i.callouts,0) - coalesce(i.ncns,0))
                                     / sc.shift_ct, 1) end,
    'training_completions', coalesce(t.completions, 0),
    'da_count',         coalesce(d.das, 0),
    'separations',      coalesce(sp2.seps, 0),
    'hires',            coalesce(h.hires, 0),
    'spiff',            coalesce(spf.spiff, 0)
  ) order by m.m0), '[]'::jsonb)
  into v_out
  from months m
  left join sales_m s  on s.m0  = m.m0
  left join punch_m p  on p.m0  = m.m0
  left join ot_m o     on o.m0  = m.m0
  left join inc_m i    on i.m0  = m.m0
  left join sched_m sc on sc.m0 = m.m0
  left join train_m t  on t.m0  = m.m0
  left join da_m d     on d.m0  = m.m0
  left join sep_m sp2  on sp2.m0 = m.m0
  left join hire_m h   on h.m0  = m.m0
  left join spiff_m spf on spf.m0 = m.m0;

  return v_out;
end; $$;

-- ── 3) Hire events list (Turnover tab) — first assignment start + intake pipe ─
create or replace function public.get_hires_list(
  p_node_ids  uuid[],
  p_date_from date default null,
  p_date_to   date default null
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_from date := coalesce(p_date_from, date_trunc('year', current_date)::date);
  v_to   date := coalesce(p_date_to,   current_date);
  v_out  jsonb;
begin
  if p_node_ids is null or array_length(p_node_ids, 1) is null then
    return '[]'::jsonb;
  end if;

  with firsts as (
    select distinct on (a.person_id)
           a.person_id, a.node_id, a.role_id, a.effective_from as start_date
    from assignments a where a.effective_from is not null
    order by a.person_id, a.effective_from asc
  ),
  employees as (
    select p.id as person_id, p.full_name, f.node_id, n.name as location,
           coalesce(r.name, '—') as role, f.start_date,
           coalesce(p.is_active, true) as still_active,
           'employee' as source
    from firsts f
    join people p    on p.id = f.person_id
    join org_nodes n on n.id = f.node_id
    left join roles r on r.id = f.role_id
    where f.node_id = any(p_node_ids) and f.start_date between v_from and v_to
  ),
  intake as (  -- pending new-hire intakes not yet converted to people
    select oh.id as person_id, oh.full_name, oh.node_id,
           coalesce(n.name, '—') as location,
           coalesce(oh.role_label, '—') as role, oh.start_date,
           false as still_active,
           'intake_' || oh.status as source
    from onboarding_hires oh
    left join org_nodes n on n.id = oh.node_id
    where (oh.node_id = any(p_node_ids) or oh.node_id is null)
      and oh.converted_person_id is null
      and coalesce(oh.start_date, oh.created_at::date) between v_from and v_to
  )
  select coalesce(jsonb_agg(to_jsonb(u) order by u.start_date desc nulls last), '[]'::jsonb)
  into v_out
  from (select * from employees union all select * from intake) u;

  return v_out;
end; $$;

-- ── Grants (app auth = pin_login → anon role) ───────────────────────────────
grant execute on function public.get_analytics_summary(uuid[], date, date) to anon, authenticated;
grant execute on function public.get_analytics_monthly(uuid[], int)        to anon, authenticated;
grant execute on function public.get_hires_list(uuid[], date, date)        to anon, authenticated;
