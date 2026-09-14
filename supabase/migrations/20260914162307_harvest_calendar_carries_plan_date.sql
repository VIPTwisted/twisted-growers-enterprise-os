-- BP-12b-7: the calendar read carries plan_date so a moved pull shows its plan day beside its current day.
set search_path = public;
create or replace function public.f_harvest_calendar(p_from date default null, p_to date default null) returns jsonb
language plpgsql stable security definer set search_path = public, hr as $$
declare v_from date := coalesce(p_from, date_trunc('month', current_date)::date - 60); v_to date := coalesce(p_to, date_trunc('month', current_date)::date + 120);
        v_rules jsonb; v_rooms jsonb; v_pulls jsonb; v_cult uuid;
begin
  if public.current_app_role() is null then raise exception 'Sign in.' using errcode = '42501'; end if;
  select id into v_cult from hr.org_nodes where node_type = 'department' and lower(name) = 'cultivation' limit 1;
  select jsonb_object_agg(rule_key, jsonb_build_object('threshold', threshold, 'unit', unit, 'label', label, 'severity', severity, 'note', note))
    into v_rules from public.harvest_alert_rules where active;
  select jsonb_agg(jsonb_build_object('room_key', room_key, 'room_label', room_label, 'cycle_days', cycle_days, 'stagger_days', stagger_days, 'harvest_weekday', harvest_weekday,
                                       'target_plants', target_plants, 'max_plants', max_plants, 'tables', tables_in_room, 'plants_per_table', plants_per_table, 'next_harvest_date', next_harvest_date, 'sort', sort_order) order by sort_order)
    into v_rooms from public.cult_cycle_policy where active;
  select jsonb_agg(jsonb_build_object(
      'id', p.id, 'pull_no', p.pull_no, 'room', p.flower_room, 'room_label', (select room_label from public.cult_cycle_policy c where c.room_key = p.flower_room),
      'harvest_date', p.harvest_date, 'plan_date', p.plan_date, 'day_of_week', to_char(p.harvest_date, 'Day'), 'weekend', extract(isodow from p.harvest_date) in (6, 7),
      'room_cycle_no', p.room_cycle_no, 'room_cycle_days', p.room_cycle_days, 'facility_gap_days', p.facility_days_since_last_pull,
      'plants', p.original_total_plants, 'proj_lb', round(p.proj_harvest_weight_lbs::numeric, 1), 'proj_flower_lb', round(p.proj_flower_after_ff_lbs::numeric, 1),
      'cultivars', p.cultivars, 'day2_replant', p.day2_replant_date, 'dry_start', p.dry_start, 'dry_day_10', p.dry_day_10, 'dry_day_14', p.dry_day_14,
      'actual_date', sc.actual_date, 'takedown_end', sc.takedown_end, 'takedown_days', sc.takedown_days, 'compliance', sc.compliance, 'days_late', sc.days_late, 'days_early', sc.days_early, 'matched_by', sc.matched_by, 'match_note', sc.match_note,
      'crew', coalesce((select jsonb_build_object('shifts', count(*), 'people', count(distinct s.person_id), 'names', string_agg(distinct pe.full_name, ', '))
                         from hr.shifts s left join hr.people pe on pe.id = s.person_id
                        where s.shift_date = p.harvest_date and (v_cult is null or s.node_id = v_cult) and coalesce(s.status, '') not in ('cancelled', 'draft')), '{}'::jsonb),
      'policy', (select jsonb_build_object('cycle_days', c.cycle_days, 'stagger_days', c.stagger_days, 'harvest_weekday', c.harvest_weekday, 'target_plants', c.target_plants) from public.cult_cycle_policy c where c.room_key = p.flower_room),
      'on_weekday', (select lower(trim(to_char(p.harvest_date, 'Day'))) = lower(coalesce(c.harvest_weekday, '')) from public.cult_cycle_policy c where c.room_key = p.flower_room)
    ) order by p.harvest_date, p.pull_no)
    into v_pulls
    from public.harvest_pulls p
    left join lateral (select * from public.v_schedule_compliance x where x.event_type = 'Pull' and x.pull_no = p.pull_no limit 1) sc on true
   where p.harvest_date between v_from and v_to or coalesce(sc.actual_date, p.harvest_date) between v_from and v_to;
  return jsonb_build_object('from', v_from, 'to', v_to, 'as_of', now(), 'rules', coalesce(v_rules, '{}'::jsonb), 'rooms', coalesce(v_rooms, '[]'::jsonb), 'pulls', coalesce(v_pulls, '[]'::jsonb),
    'cultivation_node', v_cult, 'role', public.current_app_role()::text,
    'may_move', public.current_app_role()::text in ('owner', 'executive', 'admin', 'planner', 'dept_head', 'manager'));
end $$;
notify pgrst, 'reload schema';;
