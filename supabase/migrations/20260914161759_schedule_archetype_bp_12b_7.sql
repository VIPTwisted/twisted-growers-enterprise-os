-- BP-12b-7 Harvest schedule — the `schedule` archetype exemplar (24 registry pages carry it; the exemplar
-- is the 8-week harvest calendar, harvest_pulls). Owner, 14 Sep 2026: one exemplar per archetype, rolled to
-- every page of that archetype by data. Calendar + list; drag to reschedule with the RULES ENFORCED — and
-- the rules are rows the owner already holds: harvest_alert_rules (late_tolerance_days = 0: "harvests may
-- finish EARLY but must NEVER run late … plan a weekend crew, do not slip the date"; early_allowance_days;
-- weekend_warning_days; dry_target_days / dry_max_days) and cult_cycle_policy per room (cycle_days,
-- stagger_days, harvest_weekday, plants). Actuals come from v_schedule_compliance (ordinal matching —
-- the measured derivation; v_plan_vs_actual_harvest's "near that date" match calls every late pull MISSED
-- and is not used here). Crew is read from hr.shifts for the pull date under the Cultivation node.
set search_path = public;

-- which column plays which role on a schedule view is DATA (report-contract §7, same as issue_queue)
insert into public.column_roles (role, column_name, priority) values
 ('start', 'harvest_date', 1), ('start', 'scheduled_date', 2), ('start', 'planned_date', 3), ('start', 'start_on', 4), ('start', 'starts_at', 5), ('start', 'start_date', 6),
 ('start', 'shift_date', 7), ('start', 'work_date', 8), ('start', 'due_on', 9), ('start', 'due_date', 10), ('start', 'date', 11), ('start', 'day', 12), ('start', 'started_at', 13), ('start', 'planted_on', 14),
 ('end', 'dry_day_14', 1), ('end', 'end_on', 2), ('end', 'ends_at', 3), ('end', 'end_date', 4), ('end', 'takedown_end', 5), ('end', 'finish_on', 6), ('end', 'completed_on', 7), ('end', 'projected_availability', 8),
 ('lane', 'flower_room', 1), ('lane', 'room', 2), ('lane', 'line', 3), ('lane', 'pipeline', 4), ('lane', 'machine', 5), ('lane', 'department', 6), ('lane', 'zone', 7), ('lane', 'stage', 8), ('lane', 'drying_location', 9), ('lane', 'location', 10),
 ('qty', 'plants', 1), ('qty', 'planned_plants', 2), ('qty', 'original_total_plants', 3), ('qty', 'quantity', 4), ('qty', 'qty', 5), ('qty', 'units', 6), ('qty', 'plant_count', 7)
on conflict do nothing;

-- ── the harvest calendar: pulls with rules, actuals, crew, dry windows — one read for the page ────
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
      'harvest_date', p.harvest_date, 'day_of_week', to_char(p.harvest_date, 'Day'), 'weekend', extract(isodow from p.harvest_date) in (6, 7),
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
revoke all on function public.f_harvest_calendar(date, date) from public, anon;
grant execute on function public.f_harvest_calendar(date, date) to authenticated;

-- ── drag to reschedule: the rules decide, in words; the effect is recorded with its reason ──────
create or replace function public.f_harvest_reschedule(p_id uuid, p_new_date date, p_reason text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r text := public.current_app_role()::text; p public.harvest_pulls%rowtype; v_late int; v_early int; v_wk int; v_delta int; v_warn jsonb := '[]'::jsonb;
        v_old jsonb; v_new jsonb; v_prev_room date; v_prev_fac date; v_next_room record; v_next_fac record; v_clash text;
begin
  if r is null or r not in ('owner', 'executive', 'admin', 'planner', 'dept_head', 'manager') then
    raise exception 'The % role may not move a harvest pull (owner, executive, admin, planner, department head or manager).', coalesce(r, 'signed-out') using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 10 then raise exception 'Write why the pull moves — ten characters at least. The reason stays with the calendar.'; end if;
  select * into p from public.harvest_pulls where id = p_id;
  if p.id is null then raise exception 'No pull with that id.'; end if;
  if p_new_date is null then raise exception 'A date is needed.'; end if;
  if p_new_date = p.harvest_date then raise exception 'Pull % is already on %.', p.pull_no, p.harvest_date; end if;
  if exists (select 1 from public.v_schedule_compliance x where x.event_type = 'Pull' and x.pull_no = p.pull_no and x.actual_date is not null) then
    raise exception 'Pull % was taken down on %; the plan date of a harvested pull is history, not a schedule.', p.pull_no, (select actual_date from public.v_schedule_compliance x where x.event_type = 'Pull' and x.pull_no = p.pull_no limit 1);
  end if;
  select threshold into v_late from public.harvest_alert_rules where rule_key = 'late_tolerance_days' and active;
  select threshold into v_early from public.harvest_alert_rules where rule_key = 'early_allowance_days' and active;
  select threshold into v_wk from public.harvest_alert_rules where rule_key = 'weekend_warning_days' and active;
  v_delta := p_new_date - p.harvest_date;
  -- RULE late_tolerance_days (owner hard rule, a row): never later than the plan allows
  if v_delta > coalesce(v_late, 0) then
    raise exception 'Rule "%" refuses this: pull % would run % day(s) late (allowance % day). %', coalesce((select label from public.harvest_alert_rules where rule_key = 'late_tolerance_days'), 'Late tolerance'), p.pull_no, v_delta, coalesce(v_late, 0),
      coalesce((select note from public.harvest_alert_rules where rule_key = 'late_tolerance_days'), '');
  end if;
  -- RULE early_allowance_days: earlier is preferred, within the allowance
  if -v_delta > coalesce(v_early, 0) then
    raise exception 'Rule "%" refuses this: pull % would run % day(s) early (allowance % days). %', coalesce((select label from public.harvest_alert_rules where rule_key = 'early_allowance_days'), 'Early allowance'), p.pull_no, -v_delta, coalesce(v_early, 0),
      coalesce((select note from public.harvest_alert_rules where rule_key = 'early_allowance_days'), '');
  end if;
  -- warnings (the rules say plan for it, not refuse it)
  if extract(isodow from p_new_date) in (6, 7) then
    v_warn := v_warn || jsonb_build_object('rule', 'weekend_warning_days', 'text', 'The pull now lands on a ' || trim(to_char(p_new_date, 'Day')) || ' — plan a weekend crew or a second shift (rule: weekend landing, ' || coalesce(v_wk, 0) || ' days'' warning).');
  end if;
  if exists (select 1 from public.cult_cycle_policy c where c.room_key = p.flower_room and c.active and lower(coalesce(c.harvest_weekday, '')) <> '' and lower(trim(to_char(p_new_date, 'Day'))) <> lower(c.harvest_weekday)) then
    v_warn := v_warn || jsonb_build_object('rule', 'harvest_weekday', 'text', 'Room ' || p.flower_room || '''s policy weekday is ' || (select harvest_weekday from public.cult_cycle_policy c where c.room_key = p.flower_room) || '; the pull now lands on a ' || trim(to_char(p_new_date, 'Day')) || '.');
  end if;
  select string_agg('pull ' || q.pull_no || ' (' || q.flower_room || ')', ', ') into v_clash from public.harvest_pulls q where q.id <> p.id and q.harvest_date = p_new_date;
  if v_clash is not null then v_warn := v_warn || jsonb_build_object('rule', 'same_day', 'text', 'Another takedown is planned that day: ' || v_clash || '. Two takedowns in one day need two crews.'); end if;
  -- neighbours whose cadence columns this date feeds
  select max(harvest_date) into v_prev_room from public.harvest_pulls q where q.flower_room = p.flower_room and q.id <> p.id and q.harvest_date < p_new_date;
  select max(harvest_date) into v_prev_fac from public.harvest_pulls q where q.id <> p.id and q.harvest_date < p_new_date;
  v_old := to_jsonb(p);
  update public.harvest_pulls set
      harvest_date = p_new_date, day_of_week = trim(to_char(p_new_date, 'Day')), friday_flag = case when extract(isodow from p_new_date) = 5 then 'Friday' else null end,
      dry_start = p_new_date, dry_day_10 = p_new_date + 10, dry_day_14 = p_new_date + 14, day2_replant_date = p_new_date + 1,
      prev_same_room_harvest_date = v_prev_room, room_cycle_days = case when v_prev_room is null then room_cycle_days else p_new_date - v_prev_room end,
      prev_facility_harvest_date = v_prev_fac, facility_days_since_last_pull = case when v_prev_fac is null then null else p_new_date - v_prev_fac end
    where id = p.id returning to_jsonb(harvest_pulls) into v_new;
  -- the next pull of the same room and the next pull of the facility read this date as their previous
  select * into v_next_room from public.harvest_pulls q where q.flower_room = p.flower_room and q.id <> p.id and q.harvest_date > p_new_date order by q.harvest_date limit 1;
  if v_next_room.id is not null then update public.harvest_pulls set prev_same_room_harvest_date = p_new_date, room_cycle_days = harvest_date - p_new_date where id = v_next_room.id; end if;
  select * into v_next_fac from public.harvest_pulls q where q.id <> p.id and q.harvest_date > p_new_date order by q.harvest_date limit 1;
  if v_next_fac.id is not null then update public.harvest_pulls set prev_facility_harvest_date = p_new_date, facility_days_since_last_pull = harvest_date - p_new_date where id = v_next_fac.id; end if;
  insert into public.audit_events (actor, actor_name, entity, entity_id, action, old_value, new_value, reason)
  values (auth.uid(), public.f_actor(), 'harvest_pulls', p.id::text, 'harvest.reschedule', v_old, v_new, btrim(p_reason) || case when jsonb_array_length(v_warn) > 0 then ' · warnings: ' || (select string_agg(w->>'text', ' ') from jsonb_array_elements(v_warn) w) else '' end);
  return jsonb_build_object('ok', true, 'pull_no', p.pull_no, 'room', p.flower_room, 'from', p.harvest_date, 'to', p_new_date, 'delta_days', v_delta, 'warnings', v_warn,
    'next_room_pull', case when v_next_room.id is null then null else jsonb_build_object('pull_no', v_next_room.pull_no, 'date', v_next_room.harvest_date, 'room_cycle_days', v_next_room.harvest_date - p_new_date) end);
end $$;
revoke all on function public.f_harvest_reschedule(uuid, date, text) from public, anon;
grant execute on function public.f_harvest_reschedule(uuid, date, text) to authenticated;

update public.page_archetype set component_path = 'app/web/src/schedule.jsx', built = true where archetype = 'schedule';
notify pgrst, 'reload schema';;
